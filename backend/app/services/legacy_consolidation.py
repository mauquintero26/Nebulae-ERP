"""
legacy_consolidation.py — Servicio Central de Consolidacion Legacy, Paridad y Observabilidad (Fase 6).

Funcionalidades:
1. Auditoria de trafico e intercepcion legacy con registro inmutable.
2. Gobernanza de ciclo de vida (DUAL_WRITE, READ_ONLY, CANONICAL_PRIMARY) con cabeceras RFC 8594.
3. Auditoria matematica de paridad (Ventas, Compras, Finanzas).
4. Generacion y almacenamiento de instantaneas de paridad (Snapshots).
5. Intercepcion y Dual-Write transaccional para ordenes de venta y compra legacy.
6. Reconciliacion y backfill idempotente de registros legacy huerfanos.
"""
import datetime
import json
from decimal import Decimal
from typing import Optional, Dict, Any, Tuple, List
from fastapi import HTTPException, Response
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
    CustomerRequest
)
from app.models.fase1b import (
    SaleOrderLineErp,
    PurchaseOrderLine,
    InventoryOwnerBalance
)
from app.models.fase4 import SaleOrderPayment
from app.models.catalog import ProductSKU
from app.models.customers import Customer


def _now():
    return datetime.datetime.utcnow()


# ──────────────────────────────────────────────────────────────────────────────
# 1. GOBERNANZA Y CABECERAS DE DEPRECACION (RFC 8594)
# ──────────────────────────────────────────────────────────────────────────────

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
    response.headers["Sunset"] = str(policy.sunset_date)
    response.headers["Link"] = f'<{successor_path}>; rel="successor-version"'
    response.headers["X-Legacy-Governance-Mode"] = policy.mode


# ──────────────────────────────────────────────────────────────────────────────
# 2. AUDITORIA DE TRAFICO E INTERCEPCION
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
    user_id: Optional[int] = None,
    **kwargs
) -> LegacyConsolidationAuditLog:
    """Registra una entrada inmutable en la bitacora de auditoria de consolidacion legacy."""
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
        discrepancy_details=det_str,
        status=status,
        created_at=_now()
    )
    db.add(log_entry)
    db.flush()
    return log_entry


# ──────────────────────────────────────────────────────────────────────────────
# 3. AUDITORIA MATEMATICA DE PARIDAD (LEGACY VS CANONICO)
# ──────────────────────────────────────────────────────────────────────────────

def compare_sales_parity(db: Session) -> Dict[str, Any]:
    """
    Compara exhaustivamente ventas legacy (SalesOrder) contra ventas canonicas (SaleOrder):
    - Recuentos totales.
    - Ingresos totales reportados.
    - Ordenes huerfanas (sin contraparte canonica vinculada).
    - Discrepancias de monto entre ordenes vinculadas.
    """
    legacy_orders = db.query(SalesOrder).all()
    canonical_orders = db.query(SaleOrder).filter(SaleOrder.estado != "CANCELADO").all()

    total_legacy_count = len(legacy_orders)
    total_canonical_count = len(canonical_orders)

    total_legacy_rev = Decimal("0.0")
    for so in legacy_orders:
        # Calcular valor total sumando lineas o anticipo + saldo
        lines_sum = db.query(func.sum(SalesOrderLine.unit_price * SalesOrderLine.quantity)).filter(
            SalesOrderLine.sales_order_id == so.id
        ).scalar()
        if lines_sum:
            total_legacy_rev += Decimal(str(lines_sum))
        elif so.anticipo:
            total_legacy_rev += Decimal(str(so.anticipo))

    total_canonical_rev = sum((Decimal(str(co.total_cop or 0)) for co in canonical_orders), Decimal("0.0"))

    unmatched_legacy = []
    discrepancies = []

    for so in legacy_orders:
        if not so.canonical_sale_order_id:
            # Buscar por customer y fecha o considerar huerfana
            candidate = db.query(SaleOrder).filter(
                SaleOrder.customer_id == so.customer_id,
                func.abs(func.extract('epoch', SaleOrder.created_at) - func.extract('epoch', so.created_at)) < 300
            ).first()
            if candidate:
                so.canonical_sale_order_id = candidate.id
                db.flush()
            else:
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
            if abs(Decimal(str(l_sum)) - c_tot) > Decimal("1.00") and Decimal(str(l_sum)) > 0:
                discrepancies.append({
                    "legacy_id": so.id,
                    "canonical_id": can_order.id,
                    "legacy_total": float(l_sum),
                    "canonical_total": float(c_tot),
                    "diff": float(abs(Decimal(str(l_sum)) - c_tot))
                })

    return {
        "total_legacy_orders": total_legacy_count,
        "total_canonical_orders": total_canonical_count,
        "total_legacy_revenue_cop": round(float(total_legacy_rev), 2),
        "total_canonical_revenue_cop": round(float(total_canonical_rev), 2),
        "unmatched_legacy_orders_count": len(unmatched_legacy),
        "unmatched_legacy_orders": unmatched_legacy[:50],
        "discrepancies_count": len(discrepancies),
        "discrepancies": discrepancies[:50]
    }


def compare_purchases_parity(db: Session) -> Dict[str, Any]:
    """Compara ordenes de compra legacy (PurchaseOrder) contra canonicas (PurchaseOrderFull)."""
    legacy_pos = db.query(PurchaseOrder).all()
    canonical_pos = db.query(PurchaseOrderFull).all()

    unmatched_pos = []
    for po in legacy_pos:
        if not po.canonical_purchase_order_id:
            unmatched_pos.append({
                "legacy_purchase_order_id": po.id,
                "status": po.status,
                "reason": "Sin orden canonica de compra vinculada"
            })

    return {
        "total_legacy_purchases": len(legacy_pos),
        "total_canonical_purchases": len(canonical_pos),
        "unmatched_purchases_count": len(unmatched_pos),
        "unmatched_purchases": unmatched_pos[:50]
    }


def compare_financial_parity(db: Session) -> Dict[str, Any]:
    """Compara el P&L e ingresos calculados desde SalesOrderLine vs SaleOrderLineErp / SaleOrder."""
    # Legacy:
    legacy_lines = db.query(SalesOrderLine).all()
    legacy_gross_rev = sum((Decimal(str(l.unit_price or 0)) * Decimal(str(l.quantity or 0)) for l in legacy_lines), Decimal("0.0"))
    
    # Canonico:
    can_orders = db.query(SaleOrder).filter(SaleOrder.estado != "CANCELADO").all()
    canonical_gross_rev = sum((Decimal(str(co.total_cop or 0)) for co in can_orders), Decimal("0.0"))

    diff = abs(legacy_gross_rev - canonical_gross_rev)
    return {
        "legacy_gross_revenue_cop": round(float(legacy_gross_rev), 2),
        "canonical_gross_revenue_cop": round(float(canonical_gross_rev), 2),
        "difference_cop": round(float(diff), 2),
        "in_alignment": diff < Decimal("100.00") or legacy_gross_rev == 0
    }


def generate_and_save_parity_snapshot(db: Session, user_id: Optional[int] = None) -> LegacyParitySnapshot:
    """Ejecuta una auditoria completa de paridad, calcula el score y persiste la instantanea."""
    sales_parity = compare_sales_parity(db)
    purchases_parity = compare_purchases_parity(db)
    fin_parity = compare_financial_parity(db)

    unmatched_total = sales_parity["unmatched_legacy_orders_count"] + purchases_parity["unmatched_purchases_count"]
    discrepancies_total = sales_parity["discrepancies_count"]

    # Calculo del score de paridad: 100% base menos penalizaciones
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
    
    # Registrar auditoria
    record_legacy_audit_log(
        db=db,
        event_type="PARITY_CHECK",
        legacy_endpoint="/api/v1/legacy/parity-report",
        http_method="POST",
        entity_type="SYSTEM",
        discrepancy_details={"parity_score": float(score), "unmatched": unmatched_total},
        status="ALIGNED" if unmatched_total == 0 and discrepancies_total == 0 else "DIVERGENT"
    )

    db.commit()
    db.refresh(snapshot)
    return snapshot


# ──────────────────────────────────────────────────────────────────────────────
# 4. INTERCEPCION Y DUAL-WRITE TRANSACCIONAL
# ──────────────────────────────────────────────────────────────────────────────

def intercept_sales_order_write(
    db: Session,
    order_data: Dict[str, Any],
    lines_data: List[Dict[str, Any]],
    user_id: Optional[int] = None
) -> Tuple[SalesOrder, SaleOrder]:
    """
    Intercepta escrituras de ordenes de venta sobre el modelo legacy:
    1. Verifica politicas de gobernanza (si es READ_ONLY rechaza).
    2. Crea de forma atomica la entidad SalesOrder y sus lineas SalesOrderLine.
    3. Crea en la misma transaccion el SaleOrder canonico correspondiente y sus SaleOrderLineErp.
    4. Vincula canonical_sale_order_id.
    5. Registra auditoria inmutable.
    """
    policy = get_or_create_governance_policy(db)
    if policy.mode == "READ_ONLY" or not policy.allow_legacy_writes:
        raise HTTPException(
            status_code=410,
            detail="Escrituras en endpoints legacy deshabilitadas por politica de gobernanza. Utilice /api/v1/ventas/pedidos/canonico."
        )

    # 1. Crear SalesOrder legacy
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

    # 2. Crear SaleOrder canonica
    year = _now().year
    # Obtener numero consecutivo
    next_num = db.execute(text("SELECT COALESCE(MAX(id), 0) + 1 FROM sale_orders")).scalar()
    numero_canonico = f"VEN-{year}-{next_num:04d}"

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
        canal_venta="LEGACY_API",
        notas=f"Orden sincronizada desde API Legacy SalesOrder #{db_order.id}"
    )
    db.add(canonical_so)
    db.flush()

    # Vincular
    db_order.canonical_sale_order_id = canonical_so.id

    # Crear lineas canonicas SaleOrderLineErp
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

    # Si hubo anticipo registrado, reflejar en pagos canonicos
    if anticipo > Decimal("0.0"):
        db.add(SaleOrderPayment(
            sale_order_id=canonical_so.id,
            customer_id=canonical_so.customer_id,
            tipo="ANTICIPO",
            monto=anticipo,
            moneda="COP",
            metodo_pago="TRANSFERENCIA",
            fecha=_now().date(),
            estado="CONFIRMADO",
            idempotency_key=f"LEGACY_PAY_SO_{db_order.id}_{int(_now().timestamp())}"
        ))

    # Registrar auditoria
    record_legacy_audit_log(
        db=db,
        event_type="LEGACY_WRITE_INTERCEPTED",
        legacy_endpoint="/api/v1/sales",
        http_method="POST",
        entity_type="SALES_ORDER",
        legacy_id=db_order.id,
        canonical_id=canonical_so.id,
        discrepancy_details={"total_cop": float(total_calc_cop), "lines_count": len(lines_data)},
        status="ALIGNED"
    )

    db.commit()
    db.refresh(db_order)
    db.refresh(canonical_so)
    return db_order, canonical_so


def intercept_purchase_order_write(
    db: Session,
    po_data: Dict[str, Any],
    user_id: Optional[int] = None
) -> Tuple[PurchaseOrder, PurchaseOrderFull]:
    """Intercepta creacion de PurchaseOrder legacy y crea PurchaseOrderFull canonica vinculada."""
    policy = get_or_create_governance_policy(db)
    if policy.mode == "READ_ONLY" or not policy.allow_legacy_writes:
        raise HTTPException(
            status_code=410,
            detail="Escrituras en endpoints legacy deshabilitadas por politica de gobernanza. Utilice /api/v1/compras/pedidos/canonico."
        )

    db_po = PurchaseOrder(**po_data)
    db.add(db_po)
    db.flush()

    year = _now().year
    next_num = db.execute(text("SELECT COALESCE(MAX(id), 0) + 1 FROM purchase_orders_full")).scalar()
    numero_canonico = f"PEC-LEG-{year}-{next_num:04d}"

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
        discrepancy_details={"status": db_po.status},
        status="ALIGNED"
    )

    db.commit()
    db.refresh(db_po)
    db.refresh(canonical_po)
    return db_po, canonical_po


def reconcile_and_backfill_orphan_legacy(db: Session) -> Dict[str, Any]:
    """
    Escanea y sincroniza de forma idempotente todos los registros legacy huerfanos:
    - SalesOrder sin canonical_sale_order_id -> genera SaleOrder canonica y lineas.
    - PurchaseOrder sin canonical_purchase_order_id -> genera PurchaseOrderFull.
    - Quotation sin canonical_quotation_id -> genera SalesQuotation.
    """
    synced_sales = 0
    synced_pos = 0
    synced_quots = 0
    errors = []

    # 1. SalesOrder huerfanas
    orphan_sos = db.query(SalesOrder).filter(SalesOrder.canonical_sale_order_id == None).all()
    for so in orphan_sos:
        try:
            year = so.created_at.year if so.created_at else _now().year
            next_num = db.execute(text("SELECT COALESCE(MAX(id), 0) + 1 FROM sale_orders")).scalar()
            numero_canonico = f"VEN-REC-{year}-{next_num:04d}"

            cust = db.query(Customer).filter(Customer.id == so.customer_id).first()
            cust_name = f"{cust.first_name} {cust.last_name or ''}".strip() if cust else "Cliente Legacy"

            # Calcular total desde lineas
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

            synced_sales += 1
        except Exception as e:
            errors.append(f"Error syncing SalesOrder #{so.id}: {str(e)}")

    # 2. PurchaseOrder huerfanas
    orphan_pos = db.query(PurchaseOrder).filter(PurchaseOrder.canonical_purchase_order_id == None).all()
    for po in orphan_pos:
        try:
            year = _now().year
            next_num = db.execute(text("SELECT COALESCE(MAX(id), 0) + 1 FROM purchase_orders_full")).scalar()
            numero_canonico = f"PEC-REC-{year}-{next_num:04d}"

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
            synced_pos += 1
        except Exception as e:
            errors.append(f"Error syncing PurchaseOrder #{po.id}: {str(e)}")

    # 3. Quotation huerfanas
    orphan_quots = db.query(Quotation).filter(Quotation.canonical_quotation_id == None).all()
    for q in orphan_quots:
        try:
            year = _now().year
            next_num = db.execute(text("SELECT COALESCE(MAX(id), 0) + 1 FROM sales_quotations")).scalar()
            numero_canonico = f"COT-REC-{year}-{next_num:04d}"

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
            synced_quots += 1
        except Exception as e:
            errors.append(f"Error syncing Quotation #{q.id}: {str(e)}")

    record_legacy_audit_log(
        db=db,
        event_type="SYNC_COMPLETED",
        legacy_endpoint="/api/v1/legacy/reconcile-sync",
        http_method="POST",
        entity_type="SYSTEM",
        discrepancy_details={"synced_sales": synced_sales, "synced_pos": synced_pos, "synced_quots": synced_quots, "errors": errors},
        status="RESOLVED" if len(errors) == 0 else "DIVERGENT"
    )

    db.commit()
    return {
        "status": "success",
        "synced_sales_orders": synced_sales,
        "synced_purchase_orders": synced_pos,
        "synced_quotations": synced_quots,
        "errors": errors
    }
