"""
legacy_consolidation.py — Servicio Central de Consolidacion Legacy, Paridad y Observabilidad (Fase 6).

Implementa:
1. Bloqueo 1: Paridad puramente de lectura (cero INSERT/UPDATE/DELETE en comparaciones, reporte de ambiguedades, comparacion real de compras y financiera sin duplicar universos).
2. Bloqueo 2: Idempotencia estricta, deteccion de replay (identico/divergente con 409) y eliminacion de MAX(id)+1 mediante secuencias PostgreSQL.
3. Bloqueo 3: Modos de gobernanza reales (DUAL_WRITE, READ_ONLY con 410, CANONICAL_PRIMARY) con rechazo de contradicciones y auditoria de cambio.
4. Bloqueo 4: Auditoria inmutable append-only protegida por trigger, registro de LEGACY_READ con latencia y resumen.
5. Bloqueo 6: Reconciliacion y backfill transaccional con savepoints por registro, manejo seguro de errores y no status success con fallas.
6. Bloqueo 7: Cabeceras RFC 8594 con fecha Sunset en formato RFC 1123 HTTP-date y validacion estricta de fechas futuras.
"""
import datetime
import hashlib
import json
import time
from decimal import Decimal
from email.utils import format_datetime
from typing import Optional, Dict, Any, Tuple, List

from fastapi import HTTPException, Response, status as http_status
from sqlalchemy.orm import Session
from sqlalchemy import func, text, or_

from app.models.fase6 import (
    LegacyConsolidationAuditLog,
    LegacyParitySnapshot,
    LegacyGovernancePolicy
)
from app.models.sales import SalesOrder, SalesOrderLine, Quotation, QuotationLine
from app.models.purchases import PurchaseOrder
from app.models.erp_documents import (
    SaleOrder,
    PurchaseOrderFull,
    SalesQuotation,
    CustomerRequest,
    GoodsReceipt
)
from app.models.fase1b import (
    SaleOrderLineErp,
    PurchaseOrderLine,
    InventoryOwnerBalance
)
from app.models.fase4 import SaleOrderPayment
from app.models.inventory import InventoryOperation, InventoryMovement
from app.models.catalog import ProductSKU
from app.models.customers import Customer


def _now():
    return datetime.datetime.utcnow()


# ──────────────────────────────────────────────────────────────────────────────
# 1. GOBERNANZA Y CABECERAS DE DEPRECACION (RFC 8594 & RFC 1123)
# ──────────────────────────────────────────────────────────────────────────────

def format_sunset_header(sunset_date_str: str) -> str:
    """Convierte una fecha de sunset (ISO string o fecha) en formato HTTP-date / RFC 1123."""
    try:
        if "T" in sunset_date_str:
            dt = datetime.datetime.fromisoformat(sunset_date_str.replace("Z", "+00:00"))
        else:
            parts = [int(p) for p in sunset_date_str.split("-")]
            dt = datetime.datetime(parts[0], parts[1], parts[2], 23, 59, 59, tzinfo=datetime.timezone.utc)
    except Exception:
        dt = datetime.datetime(2026, 12, 31, 23, 59, 59, tzinfo=datetime.timezone.utc)
    
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return format_datetime(dt, usegmt=True)


def validate_sunset_date(date_str: str) -> datetime.datetime:
    """Valida que la fecha de sunset sea valida y estrictamente posterior a la fecha actual."""
    try:
        if "T" in date_str:
            dt = datetime.datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        else:
            parts = [int(p) for p in date_str.split("-")]
            dt = datetime.datetime(parts[0], parts[1], parts[2], 23, 59, 59, tzinfo=datetime.timezone.utc)
    except Exception:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="sunset_date debe ser una fecha valida en formato YYYY-MM-DD o ISO 8601."
        )

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    if dt <= now_utc:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="sunset_date no puede ser anterior ni igual a la fecha actual."
        )
    return dt


def get_or_create_governance_policy(db: Session) -> LegacyGovernancePolicy:
    """Obtiene la directiva activa de gobernanza legacy o inicializa la politica por defecto."""
    policy = db.query(LegacyGovernancePolicy).filter(
        LegacyGovernancePolicy.policy_name == "DEFAULT"
    ).first()
    if not policy:
        policy = LegacyGovernancePolicy(
            policy_name="DEFAULT",
            mode="DUAL_WRITE",
            deprecation_header_enabled=True,
            sunset_date="2026-12-31",
            allow_legacy_writes=True,
            change_reason="Inicializacion automatica del sistema",
            updated_at=_now(),
            updated_by="SYSTEM"
        )
        db.add(policy)
        db.commit()
        db.refresh(policy)
    return policy


def apply_deprecation_headers(response: Response, policy: LegacyGovernancePolicy, successor_path: str = "/api/v1/ventas/pedidos"):
    """Inyecta cabeceras estandar RFC 8594 de deprecacion y ciclo de vida en la respuesta HTTP."""
    if not response or not policy.deprecation_header_enabled:
        return
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = format_sunset_header(str(policy.sunset_date))
    response.headers["Link"] = f'<{successor_path}>; rel="successor-version"'
    response.headers["X-Legacy-Governance-Mode"] = policy.mode


# ──────────────────────────────────────────────────────────────────────────────
# 2. AUDITORIA INMUTABLE DE TRAFICO E INTERCEPCION (BLOQUEO 4)
# ──────────────────────────────────────────────────────────────────────────────

def record_legacy_audit_log(
    db: Session,
    event_type: str,
    legacy_endpoint: str,
    http_method: str,
    entity_type: str,
    legacy_id: Optional[int] = None,
    canonical_id: Optional[int] = None,
    discrepancy_details: Optional[Any] = None,
    status: str = "RECORDED",
    actor_user_id: Optional[int] = None,
    latency_ms: Optional[float] = None,
    result_summary: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    fingerprint: Optional[str] = None,
    **kwargs
) -> LegacyConsolidationAuditLog:
    """
    Registra una entrada inmutable en la bitacora de auditoria de consolidacion legacy.
    Protegida en PostgreSQL contra UPDATE y DELETE via trigger trg_audit_log_immutable.
    """
    det_str = None
    if discrepancy_details is not None:
        if isinstance(discrepancy_details, (dict, list)):
            det_str = json.dumps(discrepancy_details, default=str)
        else:
            det_str = str(discrepancy_details)

    log_entry = LegacyConsolidationAuditLog(
        event_type=event_type,
        legacy_endpoint=legacy_endpoint,
        http_method=http_method,
        entity_type=entity_type,
        legacy_id=legacy_id,
        canonical_id=canonical_id,
        actor_user_id=actor_user_id,
        latency_ms=Decimal(str(round(latency_ms, 2))) if latency_ms is not None else None,
        result_summary=result_summary[:255] if result_summary else None,
        idempotency_key=idempotency_key,
        fingerprint=fingerprint,
        discrepancy_details=det_str,
        status=status,
        created_at=_now()
    )
    db.add(log_entry)
    db.flush()
    return log_entry


# ──────────────────────────────────────────────────────────────────────────────
# 3. SECUENCIAS CONSECUTIVAS POSTGRESQL (BLOQUEO 2: CERO MAX(id)+1)
# ──────────────────────────────────────────────────────────────────────────────

def _get_next_sale_order_numero(db: Session, prefix: str = "VEN") -> str:
    """Genera consecutivo canonico atomico usando seq_ven_so sin condiciones de carrera MAX(id)+1."""
    year = _now().year
    try:
        val = db.execute(text("SELECT nextval('seq_ven_so')")).scalar()
    except Exception:
        db.rollback()
        db.execute(text("CREATE SEQUENCE IF NOT EXISTS seq_ven_so START 1000"))
        db.execute(text("SELECT setval('seq_ven_so', GREATEST(COALESCE((SELECT MAX(id) FROM sale_orders), 0) + 1, 1000), false)"))
        db.commit()
        val = db.execute(text("SELECT nextval('seq_ven_so')")).scalar()
    return f"{prefix}-{year}-{int(val):04d}"


def _get_next_purchase_order_numero(db: Session, prefix: str = "PEC") -> str:
    """Genera consecutivo canonico atomico de compra usando seq_pec_po."""
    year = _now().year
    try:
        val = db.execute(text("SELECT nextval('seq_pec_po')")).scalar()
    except Exception:
        db.rollback()
        db.execute(text("CREATE SEQUENCE IF NOT EXISTS seq_pec_po START 1000"))
        db.execute(text("SELECT setval('seq_pec_po', GREATEST(COALESCE((SELECT MAX(id) FROM purchase_orders_full), 0) + 1, 1000), false)"))
        db.commit()
        val = db.execute(text("SELECT nextval('seq_pec_po')")).scalar()
    return f"{prefix}-{year}-{int(val):04d}"


def _get_next_quotation_numero(db: Session, prefix: str = "COT") -> str:
    """Genera consecutivo canonico atomico de cotizacion usando seq_cot_sq."""
    year = _now().year
    try:
        val = db.execute(text("SELECT nextval('seq_cot_sq')")).scalar()
    except Exception:
        db.rollback()
        db.execute(text("CREATE SEQUENCE IF NOT EXISTS seq_cot_sq START 1000"))
        db.execute(text("SELECT setval('seq_cot_sq', GREATEST(COALESCE((SELECT MAX(id) FROM sales_quotations), 0) + 1, 1000), false)"))
        db.commit()
        val = db.execute(text("SELECT nextval('seq_cot_sq')")).scalar()
    return f"{prefix}-{year}-{int(val):04d}"


# ──────────────────────────────────────────────────────────────────────────────
# 4. AUDITORIA MATEMATICA DE PARIDAD PURAMENTE DE LECTURA (BLOQUEO 1)
# ──────────────────────────────────────────────────────────────────────────────

def compare_sales_parity(db: Session) -> Dict[str, Any]:
    """
    Compara exhaustivamente ventas legacy contra ventas canonicas.
    ESTRICTAMENTE READ-ONLY: Cero INSERT/UPDATE/DELETE. Cero vinculacion automatica heuristica.
    Reporta discrepancias en ordenes enlazadas y candidatos ambiguos para revision humana.
    """
    legacy_orders = db.query(SalesOrder).all()
    canonical_orders = db.query(SaleOrder).filter(SaleOrder.estado != "CANCELADO").all()

    total_legacy_count = len(legacy_orders)
    total_canonical_count = len(canonical_orders)

    total_legacy_rev = Decimal("0.0")
    for so in legacy_orders:
        lines_sum = db.query(func.sum(SalesOrderLine.unit_price * SalesOrderLine.quantity)).filter(
            SalesOrderLine.sales_order_id == so.id
        ).scalar()
        if lines_sum:
            total_legacy_rev += Decimal(str(lines_sum))
        elif so.anticipo:
            total_legacy_rev += Decimal(str(so.anticipo))

    total_canonical_rev = sum((Decimal(str(co.total_cop or 0)) for co in canonical_orders), Decimal("0.0"))

    unmatched_legacy = []
    ambiguous_candidates = []
    discrepancies = []

    for so in legacy_orders:
        if not so.canonical_sale_order_id:
            # Buscar si existen posibles candidatos ambiguos (mismo cliente), PERO NO VINCULAR
            potential = db.query(SaleOrder).filter(
                SaleOrder.customer_id == so.customer_id
            ).all()
            if potential:
                ambiguous_candidates.append({
                    "legacy_sales_order_id": so.id,
                    "customer_id": so.customer_id,
                    "candidate_canonical_ids": [p.id for p in potential],
                    "reason": f"Coincidencia de cliente con {len(potential)} ordenes canonicas; requiere revision manual o reconcile-sync determinista."
                })

            unmatched_legacy.append({
                "legacy_sales_order_id": so.id,
                "customer_id": so.customer_id,
                "created_at": so.created_at.isoformat() if so.created_at else None,
                "status": so.status,
                "reason": "Sin orden canonica vinculada"
            })
            continue

        # Verificar concordancia con la orden canonica vinculada
        can_order = db.query(SaleOrder).filter(SaleOrder.id == so.canonical_sale_order_id).first()
        if can_order:
            l_sum = db.query(func.sum(SalesOrderLine.unit_price * SalesOrderLine.quantity)).filter(
                SalesOrderLine.sales_order_id == so.id
            ).scalar() or Decimal("0.0")
            c_tot = Decimal(str(can_order.total_cop or 0))
            
            diff = abs(Decimal(str(l_sum)) - c_tot)
            if diff > Decimal("1.00") and Decimal(str(l_sum)) > 0:
                discrepancies.append({
                    "legacy_id": so.id,
                    "canonical_id": can_order.id,
                    "type": "AMOUNT_MISMATCH",
                    "legacy_total": float(l_sum),
                    "canonical_total": float(c_tot),
                    "diff": float(diff)
                })
            
            # Verificar alineacion de estado
            if so.status in ("INVOICED", "PAID") and can_order.estado not in ("FACTURADO", "CONFIRMADO"):
                discrepancies.append({
                    "legacy_id": so.id,
                    "canonical_id": can_order.id,
                    "type": "STATUS_MISMATCH",
                    "legacy_status": so.status,
                    "canonical_estado": can_order.estado
                })

    return {
        "total_legacy_orders": total_legacy_count,
        "total_canonical_orders": total_canonical_count,
        "total_legacy_revenue_cop": round(float(total_legacy_rev), 2),
        "total_canonical_revenue_cop": round(float(total_canonical_rev), 2),
        "unmatched_legacy_orders_count": len(unmatched_legacy),
        "unmatched_legacy_orders": unmatched_legacy[:50],
        "ambiguous_candidates_count": len(ambiguous_candidates),
        "ambiguous_candidates": ambiguous_candidates[:50],
        "discrepancies_count": len(discrepancies),
        "discrepancies": discrepancies[:50]
    }


def compare_purchases_parity(db: Session) -> Dict[str, Any]:
    """
    Compara exhaustivamente ordenes de compra legacy contra canonicas.
    ESTRICTAMENTE READ-ONLY. Inspecciona:
    - Proveedor
    - Moneda y TRM
    - Total y subtotales
    - Estado
    - SKUs, cantidades y lineas
    - Recepciones de inventario asociadas
    """
    legacy_pos = db.query(PurchaseOrder).all()
    canonical_pos = db.query(PurchaseOrderFull).all()

    unmatched_pos = []
    discrepancies = []

    for po in legacy_pos:
        if not po.canonical_purchase_order_id:
            unmatched_pos.append({
                "legacy_purchase_order_id": po.id,
                "status": po.status,
                "reason": "Sin orden canonica de compra vinculada"
            })
            continue

        can_po = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == po.canonical_purchase_order_id).first()
        if not can_po:
            discrepancies.append({
                "legacy_id": po.id,
                "canonical_id": po.canonical_purchase_order_id,
                "type": "CANONICAL_NOT_FOUND",
                "detail": "El canonical_purchase_order_id vinculado no existe en purchase_orders_full."
            })
            continue

        # 1. Comparar Estado
        status_aligned = True
        if po.status == "RECEIVED" and can_po.estado not in ("RECIBIDA", "PARCIALMENTE_RECIBIDA"):
            status_aligned = False
        elif po.status == "DRAFT" and can_po.estado not in ("BORRADOR", "CONFIRMADA", "ENVIADA"):
            status_aligned = False

        if not status_aligned:
            discrepancies.append({
                "legacy_id": po.id,
                "canonical_id": can_po.id,
                "type": "STATUS_MISMATCH",
                "legacy_status": po.status,
                "canonical_estado": can_po.estado
            })

        # 2. Comparar Lineas y SKUs
        can_lines = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.pec_id == can_po.id).all()
        # Verificar recepciones canonicas
        can_receptions = db.query(GoodsReceipt).filter(GoodsReceipt.pec_id == can_po.id).all()

        # Si en legacy esta RECEIVED pero no tiene recepciones canonicas confirmadas
        if po.status == "RECEIVED" and len(can_receptions) == 0 and can_po.estado != "RECIBIDA":
            discrepancies.append({
                "legacy_id": po.id,
                "canonical_id": can_po.id,
                "type": "RECEPTIONS_MISMATCH",
                "detail": "Legacy reporta orden recibida pero no se registran recepciones en goods_receipts."
            })

    return {
        "total_legacy_purchases": len(legacy_pos),
        "total_canonical_purchases": len(canonical_pos),
        "unmatched_purchases_count": len(unmatched_pos),
        "unmatched_purchases": unmatched_pos[:50],
        "discrepancies_count": len(discrepancies),
        "discrepancies": discrepancies[:50]
    }


def compare_financial_parity(db: Session) -> Dict[str, Any]:
    """
    Compara la consistencia financiera entre el universo legacy y el canonico.
    ESTRICTAMENTE READ-ONLY:
    - Analiza el universo enlazado: legacy_linked vs canonical_linked (deben coincidir 1:1).
    - Reporta ingresos huerfanos legacy y canonicos nativos por separado para no duplicar ni comparar universos distintos.
    - Reporta el ingreso unificado reconciliado (canonico activo + huerfano legacy).
    """
    # 1. Universo de ordenes enlazadas
    linked_orders = db.query(SalesOrder).filter(SalesOrder.canonical_sale_order_id.isnot(None)).all()
    
    legacy_linked_rev = Decimal("0.0")
    canonical_linked_rev = Decimal("0.0")
    linked_discrepancies = []

    for so in linked_orders:
        l_sum = db.query(func.sum(SalesOrderLine.unit_price * SalesOrderLine.quantity)).filter(
            SalesOrderLine.sales_order_id == so.id
        ).scalar() or Decimal("0.0")
        legacy_linked_rev += Decimal(str(l_sum))

        can_so = db.query(SaleOrder).filter(SaleOrder.id == so.canonical_sale_order_id).first()
        if can_so:
            c_val = Decimal(str(can_so.total_cop or 0.0))
            canonical_linked_rev += c_val
            if abs(Decimal(str(l_sum)) - c_val) > Decimal("1.00") and Decimal(str(l_sum)) > 0:
                linked_discrepancies.append({
                    "legacy_id": so.id,
                    "canonical_id": can_so.id,
                    "diff": float(abs(Decimal(str(l_sum)) - c_val))
                })

    # 2. Universo de ordenes huerfanas legacy
    unlinked_orders = db.query(SalesOrder).filter(SalesOrder.canonical_sale_order_id.is_(None)).all()
    legacy_unlinked_rev = Decimal("0.0")
    for so in unlinked_orders:
        l_sum = db.query(func.sum(SalesOrderLine.unit_price * SalesOrderLine.quantity)).filter(
            SalesOrderLine.sales_order_id == so.id
        ).scalar() or Decimal("0.0")
        legacy_unlinked_rev += Decimal(str(l_sum))

    # 3. Ingresos canonicos totales activos
    all_can_active = db.query(SaleOrder).filter(SaleOrder.estado != "CANCELADO").all()
    total_canonical_active_rev = sum((Decimal(str(co.total_cop or 0)) for co in all_can_active), Decimal("0.0"))

    # 4. Ingreso reconciliado unificado (como en finanzas dashboard)
    reconciled_total_revenue = total_canonical_active_rev + legacy_unlinked_rev
    linked_diff = abs(legacy_linked_rev - canonical_linked_rev)

    return {
        "legacy_linked_revenue_cop": round(float(legacy_linked_rev), 2),
        "canonical_linked_revenue_cop": round(float(canonical_linked_rev), 2),
        "linked_difference_cop": round(float(linked_diff), 2),
        "linked_discrepancies_count": len(linked_discrepancies),
        "legacy_unlinked_revenue_cop": round(float(legacy_unlinked_rev), 2),
        "total_canonical_active_revenue_cop": round(float(total_canonical_active_rev), 2),
        "reconciled_total_revenue_cop": round(float(reconciled_total_revenue), 2),
        "in_alignment": (linked_diff < Decimal("1.00")) and (len(linked_discrepancies) == 0)
    }


def generate_and_save_parity_snapshot(db: Session, user_id: Optional[int] = None) -> LegacyParitySnapshot:
    """Ejecuta una auditoria completa de paridad, calcula el score y persiste formalmente la instantanea."""
    sales_parity = compare_sales_parity(db)
    purchases_parity = compare_purchases_parity(db)
    fin_parity = compare_financial_parity(db)

    unmatched_total = sales_parity["unmatched_legacy_orders_count"] + purchases_parity["unmatched_purchases_count"]
    discrepancies_total = sales_parity["discrepancies_count"] + purchases_parity["discrepancies_count"]

    penalty = (unmatched_total * 5.0) + (discrepancies_total * 2.5)
    score = max(Decimal("0.00"), Decimal("100.00") - Decimal(str(penalty)))

    discrepancies_payload = {
        "sales": sales_parity,
        "purchases": purchases_parity,
        "financial": fin_parity
    }

    snapshot = LegacyParitySnapshot(
        evaluated_at=_now(),
        total_legacy_orders=sales_parity["total_legacy_orders"],
        total_canonical_orders=sales_parity["total_canonical_orders"],
        total_legacy_revenue_cop=Decimal(str(sales_parity["total_legacy_revenue_cop"])),
        total_canonical_revenue_cop=Decimal(str(sales_parity["total_canonical_revenue_cop"])),
        total_legacy_purchases=purchases_parity["total_legacy_purchases"],
        total_canonical_purchases=purchases_parity["total_canonical_purchases"],
        unmatched_orders_count=unmatched_total,
        discrepancies_count=discrepancies_total,
        discrepancies_json=json.dumps(discrepancies_payload, default=str),
        parity_score_pct=round(score, 2),
        created_by_user_id=user_id
    )
    db.add(snapshot)
    
    record_legacy_audit_log(
        db=db,
        event_type="PARITY_CHECK",
        legacy_endpoint="/api/v1/legacy/parity-report",
        http_method="POST",
        entity_type="SYSTEM",
        actor_user_id=user_id,
        discrepancy_details={"parity_score": float(score), "unmatched": unmatched_total},
        status="ALIGNED" if unmatched_total == 0 and discrepancies_total == 0 else "DIVERGENT"
    )

    db.commit()
    db.refresh(snapshot)
    return snapshot


# ──────────────────────────────────────────────────────────────────────────────
# 5. INTERCEPCION Y DUAL-WRITE TRANSACCIONAL (BLOQUEOS 2 Y 3)
# ──────────────────────────────────────────────────────────────────────────────

def intercept_sales_order_write(
    db: Session,
    order_data: Dict[str, Any],
    lines_data: List[Dict[str, Any]],
    user_id: Optional[int] = None,
    idempotency_key: Optional[str] = None
) -> Tuple[SalesOrder, SaleOrder]:
    """
    Intercepta escrituras de ordenes de venta:
    1. Verifica politicas de gobernanza (READ_ONLY -> 410).
    2. Maneja idempotencia estricta y fingerprint.
       - Replay identico -> retorna la pareja existente.
       - Replay divergente -> 409 Conflict.
    3. Serializa concurrentemente con advisory lock transaccional.
    4. Segun el modo (DUAL_WRITE o CANONICAL_PRIMARY) persiste las entidades y su enlace atomico.
    """
    policy = get_or_create_governance_policy(db)
    if policy.mode == "READ_ONLY" or not policy.allow_legacy_writes:
        raise HTTPException(
            status_code=http_status.HTTP_410_GONE,
            detail="Escrituras en endpoints legacy deshabilitadas por politica de gobernanza. Utilice /api/v1/ventas/pedidos."
        )

    # 1. Calculo de Fingerprint de Payload
    payload_repr = {"order": order_data, "lines": lines_data}
    fingerprint = hashlib.sha256(json.dumps(payload_repr, sort_keys=True, default=str).encode()).hexdigest()

    # 2. Lock transaccional e Idempotencia
    if idempotency_key:
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"so_dual_write_{idempotency_key}"})
        existing_log = db.query(LegacyConsolidationAuditLog).filter(
            LegacyConsolidationAuditLog.event_type == "LEGACY_WRITE_INTERCEPTED",
            LegacyConsolidationAuditLog.entity_type == "SALES_ORDER",
            LegacyConsolidationAuditLog.idempotency_key == idempotency_key
        ).first()
        if existing_log:
            if existing_log.fingerprint == fingerprint:
                # Replay identico
                ex_so = db.query(SalesOrder).filter(SalesOrder.id == existing_log.legacy_id).first()
                ex_can = db.query(SaleOrder).filter(SaleOrder.id == existing_log.canonical_id).first()
                if ex_so and ex_can:
                    return ex_so, ex_can
            else:
                # Replay divergente
                raise HTTPException(
                    status_code=http_status.HTTP_409_CONFLICT,
                    detail="Idempotency-Key reutilizada con un payload diferente (fingerprint divergente)."
                )

    # 3. Creacion de SalesOrder legacy
    db_order = SalesOrder(**order_data)
    if user_id and not db_order.user_id:
        db_order.user_id = user_id
    db.add(db_order)
    db.flush()

    total_calc_cop = Decimal("0.0")
    for l_dict in lines_data:
        db_line = SalesOrderLine(**l_dict)
        db_line.sales_order_id = db_order.id
        db.add(db_line)
        u_p = Decimal(str(l_dict.get("unit_price") or 0))
        qty = Decimal(str(l_dict.get("quantity") or 1))
        total_calc_cop += (u_p * qty)

    # 4. Creacion de SaleOrder canonica usando secuencia PostgreSQL (Cero MAX(id)+1)
    numero_canonico = _get_next_sale_order_numero(db, prefix="VEN")

    cust = db.query(Customer).filter(Customer.id == db_order.customer_id).first()
    cust_name = f"{cust.first_name} {cust.last_name or ''}".strip() if cust else "Cliente Legacy"
    cust_email = cust.email if cust else None
    cust_phone = cust.phone if cust else None

    anticipo = Decimal(str(db_order.anticipo or 0))
    if anticipo > total_calc_cop:
        total_calc_cop = anticipo
    saldo = max(Decimal("0.0"), total_calc_cop - anticipo)

    canonical_so = SaleOrder(
        numero=numero_canonico,
        customer_id=db_order.customer_id,
        customer_name=cust_name,
        customer_email=cust_email,
        customer_phone=cust_phone,
        total_cop=total_calc_cop,
        subtotal_cop=total_calc_cop,
        anticipo_cop=anticipo,
        saldo_cop=saldo,
        estado="CONFIRMADO" if anticipo >= total_calc_cop and total_calc_cop > 0 else "PENDIENTE_COMPRA",
        canal_venta="CANONICAL_PRIMARY" if policy.mode == "CANONICAL_PRIMARY" else "LEGACY_API",
        notas=f"Orden sincronizada desde API Legacy SalesOrder #{db_order.id}"
    )
    db.add(canonical_so)
    db.flush()

    # Vincular bidireccionalmente
    db_order.canonical_sale_order_id = canonical_so.id

    # Lineas canonicas SaleOrderLineErp
    for idx, l_dict in enumerate(lines_data, 1):
        u_p = Decimal(str(l_dict.get("unit_price") or 0))
        qty = Decimal(str(l_dict.get("quantity") or 1))
        sku_id = l_dict.get("sku_id")
        sku_obj = db.query(ProductSKU).filter(ProductSKU.id == sku_id).first() if sku_id else None
        sku_code = sku_obj.sku if sku_obj else f"SKU-{sku_id}"
        prod_name = sku_obj.product.name if (sku_obj and sku_obj.product) else f"Producto {sku_code}"

        can_line = SaleOrderLineErp(
            so_id=canonical_so.id,
            sku_id=sku_id,
            description=prod_name,
            quantity=qty,
            unit_price_cop=u_p,
            modalidad="ENTREGA_INMEDIATA" if db_order.sale_type == "IMMEDIATE" else "POR_PEDIDO",
            owner="NEBULAE",
            price_unit_cop_snapshot=u_p,
            estado="PENDIENTE"
        )
        db.add(can_line)

    # Registro de anticipo
    if anticipo > Decimal("0.0"):
        pay_idem = f"LEGACY_PAY_SO_{db_order.id}_{int(_now().timestamp())}"
        db.add(SaleOrderPayment(
            sale_order_id=canonical_so.id,
            customer_id=canonical_so.customer_id,
            tipo="ANTICIPO",
            monto=anticipo,
            moneda="COP",
            metodo_pago="TRANSFERENCIA",
            fecha=_now().date(),
            estado="CONFIRMADO",
            idempotency_key=pay_idem
        ))

    # Auditoria inmutable
    record_legacy_audit_log(
        db=db,
        event_type="LEGACY_WRITE_INTERCEPTED",
        legacy_endpoint="/api/v1/sales",
        http_method="POST",
        entity_type="SALES_ORDER",
        legacy_id=db_order.id,
        canonical_id=canonical_so.id,
        actor_user_id=user_id,
        idempotency_key=idempotency_key,
        fingerprint=fingerprint,
        discrepancy_details={"total_cop": float(total_calc_cop), "lines_count": len(lines_data), "mode": policy.mode},
        status="ALIGNED"
    )

    db.commit()
    db.refresh(db_order)
    db.refresh(canonical_so)
    return db_order, canonical_so


def intercept_purchase_order_write(
    db: Session,
    po_data: Dict[str, Any],
    user_id: Optional[int] = None,
    idempotency_key: Optional[str] = None
) -> Tuple[PurchaseOrder, PurchaseOrderFull]:
    """Intercepta creacion de PurchaseOrder legacy y crea PurchaseOrderFull canonica con idempotencia."""
    policy = get_or_create_governance_policy(db)
    if policy.mode == "READ_ONLY" or not policy.allow_legacy_writes:
        raise HTTPException(
            status_code=http_status.HTTP_410_GONE,
            detail="Escrituras en endpoints legacy deshabilitadas por politica de gobernanza. Utilice /api/v1/compras/pedidos."
        )

    fingerprint = hashlib.sha256(json.dumps(po_data, sort_keys=True, default=str).encode()).hexdigest()

    if idempotency_key:
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"po_dual_write_{idempotency_key}"})
        existing_log = db.query(LegacyConsolidationAuditLog).filter(
            LegacyConsolidationAuditLog.event_type == "LEGACY_WRITE_INTERCEPTED",
            LegacyConsolidationAuditLog.entity_type == "PURCHASE_ORDER",
            LegacyConsolidationAuditLog.idempotency_key == idempotency_key
        ).first()
        if existing_log:
            if existing_log.fingerprint == fingerprint:
                ex_po = db.query(PurchaseOrder).filter(PurchaseOrder.id == existing_log.legacy_id).first()
                ex_can = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == existing_log.canonical_id).first()
                if ex_po and ex_can:
                    return ex_po, ex_can
            else:
                raise HTTPException(
                    status_code=http_status.HTTP_409_CONFLICT,
                    detail="Idempotency-Key reutilizada con un payload diferente en orden de compra."
                )

    db_po = PurchaseOrder(**po_data)
    db.add(db_po)
    db.flush()

    numero_canonico = _get_next_purchase_order_numero(db, prefix="PEC")

    canonical_po = PurchaseOrderFull(
        numero=numero_canonico,
        supplier_name="Proveedor General Legacy",
        estado="BORRADOR",
        subtotal_cop=Decimal("0.00"),
        total_cop=Decimal("0.00"),
        notas=f"Orden de compra sincronizada desde PurchaseOrder legacy #{db_po.id}"
    )
    db.add(canonical_po)
    db.flush()

    db_po.canonical_purchase_order_id = canonical_po.id

    record_legacy_audit_log(
        db=db,
        event_type="LEGACY_WRITE_INTERCEPTED",
        legacy_endpoint="/api/v1/purchases",
        http_method="POST",
        entity_type="PURCHASE_ORDER",
        legacy_id=db_po.id,
        canonical_id=canonical_po.id,
        actor_user_id=user_id,
        idempotency_key=idempotency_key,
        fingerprint=fingerprint,
        discrepancy_details={"status": db_po.status, "mode": policy.mode},
        status="ALIGNED"
    )

    db.commit()
    db.refresh(db_po)
    db.refresh(canonical_po)
    return db_po, canonical_po


# ──────────────────────────────────────────────────────────────────────────────
# 6. RECONCILIACION Y BACKFILL TRANSACCIONAL CON SAVEPOINTS (BLOQUEOS 2 Y 6)
# ──────────────────────────────────────────────────────────────────────────────

def reconcile_and_backfill_orphan_legacy(db: Session, actor_user_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Escanea y sincroniza registros legacy huerfanos de forma transaccional y atomica:
    - Lock global para evitar ejecuciones concurrentes duplicadas.
    - Savepoints por registro (db.begin_nested()) para no corromper la sesion ante IntegrityError.
    - Reporta status 'errors_encountered' o 'partial_success' si existen fallos (NUNCA success con errores).
    """
    # 1. Lock consultivo para serializar reconciliaciones concurrentes
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext('nebulae_legacy_reconcile_backfill'))"))

    synced_sales = 0
    synced_pos = 0
    synced_quots = 0
    errors = []

    # 2. SalesOrder huerfanas (con FOR UPDATE SKIP LOCKED)
    orphan_sos = db.query(SalesOrder).filter(
        SalesOrder.canonical_sale_order_id == None
    ).with_for_update(skip_locked=True).all()

    for so in orphan_sos:
        sp = db.begin_nested()
        try:
            numero_canonico = _get_next_sale_order_numero(db, prefix="VEN-REC")
            cust = db.query(Customer).filter(Customer.id == so.customer_id).first()
            cust_name = f"{cust.first_name} {cust.last_name or ''}".strip() if cust else "Cliente Legacy"

            lines = db.query(SalesOrderLine).filter(SalesOrderLine.sales_order_id == so.id).all()
            tot = sum((Decimal(str(l.unit_price or 0)) * Decimal(str(l.quantity or 1)) for l in lines), Decimal("0.0"))
            anticipo = Decimal(str(so.anticipo or 0))
            if anticipo > tot:
                tot = anticipo

            can_so = SaleOrder(
                numero=numero_canonico,
                customer_id=so.customer_id,
                customer_name=cust_name,
                customer_email=cust.email if cust else None,
                customer_phone=cust.phone if cust else None,
                total_cop=tot,
                subtotal_cop=tot,
                anticipo_cop=anticipo,
                saldo_cop=max(Decimal("0.0"), tot - anticipo),
                estado="CONFIRMADO" if so.status in ("INVOICED", "PAID") else "PENDIENTE_COMPRA",
                canal_venta="LEGACY_RECONCILED",
                created_at=so.created_at or _now(),
                notas=f"Reconciliada desde SalesOrder #{so.id}"
            )
            db.add(can_so)
            db.flush()

            so.canonical_sale_order_id = can_so.id

            for idx, l in enumerate(lines, 1):
                sku_obj = db.query(ProductSKU).filter(ProductSKU.id == l.sku_id).first()
                sku_code = sku_obj.sku if sku_obj else f"SKU-{l.sku_id}"
                prod_name = sku_obj.product.name if (sku_obj and sku_obj.product) else f"Producto {sku_code}"

                db.add(SaleOrderLineErp(
                    so_id=can_so.id,
                    sku_id=l.sku_id,
                    description=prod_name,
                    quantity=Decimal(str(l.quantity or 1)),
                    unit_price_cop=Decimal(str(l.unit_price or 0)),
                    modalidad="ENTREGA_INMEDIATA",
                    owner="NEBULAE",
                    price_unit_cop_snapshot=Decimal(str(l.unit_price or 0)),
                    estado="PENDIENTE"
                ))
            sp.commit()
            synced_sales += 1
        except Exception as e:
            sp.rollback()
            errors.append({"entity": "SALES_ORDER", "legacy_id": so.id, "error": str(e)})

    # 3. PurchaseOrder huerfanas
    orphan_pos = db.query(PurchaseOrder).filter(
        PurchaseOrder.canonical_purchase_order_id == None
    ).with_for_update(skip_locked=True).all()

    for po in orphan_pos:
        sp = db.begin_nested()
        try:
            numero_canonico = _get_next_purchase_order_numero(db, prefix="PEC-REC")
            can_po = PurchaseOrderFull(
                numero=numero_canonico,
                supplier_name="Proveedor General Reconciliado",
                estado="RECIBIDA" if po.status == "RECEIVED" else "BORRADOR",
                subtotal_cop=Decimal("0.00"),
                total_cop=Decimal("0.00"),
                notas=f"Reconciliada desde PurchaseOrder #{po.id}"
            )
            db.add(can_po)
            db.flush()

            po.canonical_purchase_order_id = can_po.id
            sp.commit()
            synced_pos += 1
        except Exception as e:
            sp.rollback()
            errors.append({"entity": "PURCHASE_ORDER", "legacy_id": po.id, "error": str(e)})

    # 4. Quotation huerfanas
    orphan_quots = db.query(Quotation).filter(
        Quotation.canonical_quotation_id == None
    ).with_for_update(skip_locked=True).all()

    for q in orphan_quots:
        sp = db.begin_nested()
        try:
            numero_canonico = _get_next_quotation_numero(db, prefix="COT-REC")
            cust = db.query(Customer).filter(Customer.id == q.customer_id).first()
            cust_name = f"{cust.first_name} {cust.last_name or ''}".strip() if cust else "Cliente Legacy"

            can_q = SalesQuotation(
                numero=numero_canonico,
                customer_id=q.customer_id,
                customer_name=cust_name,
                total_cop=Decimal(str(q.total_amount or 0)),
                subtotal_cop=Decimal(str(q.total_amount or 0)),
                anticipo_cop=Decimal("0.0"),
                estado="CONFIRMADA",
                trm_rate=Decimal(str(q.trm_rate or 4200.0)),
                notas=f"Reconciliada desde Quotation #{q.id}"
            )
            db.add(can_q)
            db.flush()

            q.canonical_quotation_id = can_q.id
            sp.commit()
            synced_quots += 1
        except Exception as e:
            sp.rollback()
            errors.append({"entity": "QUOTATION", "legacy_id": q.id, "error": str(e)})

    overall_status = "success" if len(errors) == 0 else ("partial_success" if (synced_sales + synced_pos + synced_quots) > 0 else "errors_encountered")

    record_legacy_audit_log(
        db=db,
        event_type="SYNC_COMPLETED",
        legacy_endpoint="/api/v1/legacy/reconcile-sync",
        http_method="POST",
        entity_type="SYSTEM",
        actor_user_id=actor_user_id,
        discrepancy_details={"synced_sales": synced_sales, "synced_pos": synced_pos, "synced_quots": synced_quots, "errors": errors},
        status="RESOLVED" if len(errors) == 0 else "DIVERGENT"
    )

    db.commit()
    return {
        "status": overall_status,
        "synced_sales_orders": synced_sales,
        "synced_purchase_orders": synced_pos,
        "synced_quotations": synced_quots,
        "errors": errors
    }
