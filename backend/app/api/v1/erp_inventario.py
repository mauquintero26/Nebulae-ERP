"""
erp_inventario.py — Módulo de Inventario Avanzado para Fase 3 (Prompt Maestro & Hardening).

Funcionalidades:
1. Kárdex Inmutable e Idempotente (/kardex)
2. Reservas de Inventario con Control Concurrente e Idempotencia (/reservas)
3. Cálculo de Disponibilidad Derivada (/disponibilidad, /stock-summary)
4. Gestión y Aislamiento de Cuarentena con Segregación Patrimonial (/cuarentena)
5. Separación Patrimonial Nebulae vs Mau con Aritmética Decimal Exacta
"""
import datetime
import hashlib
import json
import uuid
from typing import Optional, List, Tuple
from decimal import Decimal
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy.orm import Session
from sqlalchemy import select, func, and_, or_, text

logger = logging.getLogger(__name__)

from app.db.database import get_db, SessionLocal
from app.models.users import User
from app.models.catalog import Product, ProductSKU
from app.models.inventory import Warehouse, InventoryLevel, InventoryOperation, InventoryMovement
from app.models.fase1b import InventoryOwnerBalance, InventoryReservation, SaleOrderLineErp
from app.models.fase3 import InventoryQuarantine
from app.api.dependencies import (
    require_roles,
    ROLE_ADMIN,
    ROLE_BODEGA,
    ROLE_ASESOR,
    ROLE_COMPRAS,
    ALL_ERP_ROLES,
)
from app.api.v1.schemas_fase3 import (
    KardexMovementItem,
    CreateReservationRequest,
    OperateReservationRequest,
    ReservationResponse,
    SkuAvailabilityResponse,
    QuarantineItemResponse,
    ResolveQuarantineRequest,
)

router = APIRouter()


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


# ─────────────────────────────────────────────────────────────────────────────
# IDEMPOTENCIA Y CONCURRENCIA HELPER
# ─────────────────────────────────────────────────────────────────────────────

def _start_idempotent_operation(
    db: Session,
    op_type: str,
    client_key: str,
    payload_dict: dict,
    entity_type: str,
    user_id: Optional[int],
    now: datetime.datetime,
) -> Tuple[Optional[dict], str, str]:
    """
    Control de concurrencia e idempotencia estricta.
    1. Toma lock consultivo de transacción: pg_advisory_xact_lock(hashtext(f'{op_type}:{client_key}'))
       lo que serializa cualquier ejecución concurrente con la misma clave.
    2. Valida hash del payload contra ejecuciones previas (409 Conflict si difiere).
    3. Si ya completó (DONE), retorna el response guardado con idempotent_replay=True.
    4. Si es nueva o reintento de FAILED con mismo payload, registra status='PROCESSING' y retorna nuevo execution_token.
    """
    req_hash = hashlib.sha256(
        json.dumps(payload_dict, sort_keys=True, default=str).encode()
    ).hexdigest()

    # 1. Lock consultivo serializado por clave
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:k))"),
        {"k": f"{op_type}:{client_key}"}
    )

    # 2. Consultar registro de idempotencia existente
    row = db.execute(
        text(
            "SELECT id, status, request_hash, response_body, execution_token "
            "FROM idempotency_requests "
            "WHERE operation_type = :ot AND operation_key = :k"
        ),
        {"ot": op_type, "k": client_key}
    ).fetchone()

    if row:
        if row.status == "DONE":
            if row.request_hash != req_hash:
                raise HTTPException(
                    409,
                    f"La clave de idempotencia ya fue usada con un payload diferente. "
                    f"Usa una clave nueva para este intento."
                )
            stored = row.response_body
            if isinstance(stored, str):
                stored = json.loads(stored)
            return (stored, row.execution_token, req_hash)
        elif row.status == "PROCESSING":
            if row.request_hash != req_hash:
                raise HTTPException(
                    409,
                    f"La clave de idempotencia ya fue usada con un payload diferente."
                )
            raise HTTPException(409, "Operación en proceso. Reintenta en unos segundos.")
        elif row.status == "FAILED":
            if row.request_hash != req_hash:
                raise HTTPException(
                    409,
                    f"La clave de idempotencia (FAILED) fue usada con payload diferente."
                )
            exec_token = str(uuid.uuid4())
            db.execute(
                text(
                    "UPDATE idempotency_requests "
                    "SET status = 'PROCESSING', execution_token = :token, "
                    "    request_hash = :h, request_body = CAST(:body AS jsonb), "
                    "    created_at = :now, response_body = NULL, error_detail = NULL "
                    "WHERE id = :id"
                ),
                {
                    "token": exec_token,
                    "h": req_hash,
                    "body": json.dumps(payload_dict, default=str),
                    "now": now,
                    "id": row.id
                }
            )
            return (None, exec_token, req_hash)

    # 3. No existía: registrar PROCESSING en la sesión de la transacción
    exec_token = str(uuid.uuid4())
    db.execute(
        text(
            "INSERT INTO idempotency_requests "
            "(operation_type, operation_key, request_hash, entity_type, "
            " user_id, status, execution_token, request_body, created_at) "
            "VALUES (:ot, :k, :h, :et, :uid, 'PROCESSING', :token, CAST(:body AS jsonb), :now)"
        ),
        {
            "ot": op_type, "k": client_key, "h": req_hash, "et": entity_type,
            "uid": user_id, "token": exec_token,
            "body": json.dumps(payload_dict, default=str), "now": now
        }
    )
    return (None, exec_token, req_hash)


def _finish_idempotent_operation(
    db: Session,
    op_type: str,
    client_key: str,
    exec_token: str,
    entity_id: Optional[int],
    response_data: dict,
    now: datetime.datetime,
):
    db.execute(
        text(
            "UPDATE idempotency_requests "
            "SET status = 'DONE', entity_id = :eid, "
            "    response_body = CAST(:resp AS jsonb), completed_at = :now "
            "WHERE operation_type = :ot AND operation_key = :k AND execution_token = :token"
        ),
        {
            "ot": op_type, "k": client_key, "token": exec_token,
            "eid": entity_id, "resp": json.dumps(response_data, default=str), "now": now
        }
    )


def _mark_failed_external(
    op_type: str,
    client_key: str,
    exec_token: str,
    error: str,
    now: datetime.datetime,
    request_hash: Optional[str] = None,
    request_body: Optional[dict] = None,
    entity_type: Optional[str] = None,
    user_id: Optional[int] = None,
):
    try:
        from app.db.database import SessionLocal as _SL
        with _SL() as s:
            body_json = json.dumps(request_body, default=str) if request_body is not None else None
            try:
                s.execute(
                    text(
                        "INSERT INTO idempotency_requests "
                        "(operation_type, operation_key, request_hash, request_body, execution_token, entity_type, user_id, status, error_detail, created_at, completed_at) "
                        "VALUES (:ot, :k, :h, CAST(:body AS jsonb), :token, :et, :uid, 'FAILED', :err, :now, :now) "
                        "ON CONFLICT (operation_type, operation_key) DO UPDATE "
                        "SET status = 'FAILED', "
                        "    error_detail = :err, "
                        "    completed_at = :now, "
                        "    request_hash = COALESCE(EXCLUDED.request_hash, idempotency_requests.request_hash), "
                        "    request_body = COALESCE(EXCLUDED.request_body, idempotency_requests.request_body), "
                        "    execution_token = EXCLUDED.execution_token, "
                        "    entity_type = COALESCE(EXCLUDED.entity_type, idempotency_requests.entity_type), "
                        "    user_id = COALESCE(EXCLUDED.user_id, idempotency_requests.user_id) "
                        "WHERE idempotency_requests.operation_type = :ot AND idempotency_requests.operation_key = :k"
                    ),
                    {
                        "ot": op_type,
                        "k": client_key,
                        "h": request_hash,
                        "body": body_json,
                        "token": exec_token,
                        "et": entity_type,
                        "uid": user_id,
                        "err": error[:2000],
                        "now": now,
                    }
                )
                s.commit()
            except IntegrityError:
                s.rollback()
                # Fallback con user_id=None en caso de foreign key error en tabla users
                s.execute(
                    text(
                        "INSERT INTO idempotency_requests "
                        "(operation_type, operation_key, request_hash, request_body, execution_token, entity_type, user_id, status, error_detail, created_at, completed_at) "
                        "VALUES (:ot, :k, :h, CAST(:body AS jsonb), :token, :et, NULL, 'FAILED', :err, :now, :now) "
                        "ON CONFLICT (operation_type, operation_key) DO UPDATE "
                        "SET status = 'FAILED', "
                        "    error_detail = :err, "
                        "    completed_at = :now, "
                        "    request_hash = COALESCE(EXCLUDED.request_hash, idempotency_requests.request_hash), "
                        "    request_body = COALESCE(EXCLUDED.request_body, idempotency_requests.request_body), "
                        "    execution_token = EXCLUDED.execution_token, "
                        "    entity_type = COALESCE(EXCLUDED.entity_type, idempotency_requests.entity_type) "
                        "WHERE idempotency_requests.operation_type = :ot AND idempotency_requests.operation_key = :k"
                    ),
                    {
                        "ot": op_type,
                        "k": client_key,
                        "h": request_hash,
                        "body": body_json,
                        "token": exec_token,
                        "et": entity_type,
                        "err": error[:2000],
                        "now": now,
                    }
                )
                s.commit()
    except Exception as exc:
        logger.error(f"Error al marcar FAILED en idempotency_requests para {op_type}/{client_key}: {exc}", exc_info=True)


# ─────────────────────────────────────────────────────────────────────────────
# 1. KARDEX INMUTABLE E IDEMPOTENTE
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/kardex", response_model=dict)
def get_kardex(
    sku_id: Optional[int] = Query(None, description="Filtrar por SKU"),
    warehouse_id: Optional[int] = Query(None, description="Filtrar por Bodega"),
    owner: Optional[str] = Query(None, description="Filtrar por propietario: NEBULAE o MAU"),
    direction: Optional[str] = Query(None, description="IN | OUT | ADJUST | TRANSFER_IN | TRANSFER_OUT | QUARANTINE"),
    start_date: Optional[datetime.date] = Query(None, description="Fecha inicial"),
    end_date: Optional[datetime.date] = Query(None, description="Fecha final"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db),
):
    """Consulta el historial de movimientos (Kárdex) inmutable con filtros y paginación."""
    query = (
        select(
            InventoryMovement.id,
            InventoryMovement.operation_id,
            InventoryOperation.operation_type,
            InventoryOperation.source_document_type,
            InventoryOperation.source_document_numero,
            InventoryMovement.sku_id,
            ProductSKU.sku,
            Product.name.label("product_name"),
            InventoryMovement.quantity,
            InventoryMovement.direction,
            InventoryMovement.owner,
            InventoryMovement.warehouse_id,
            Warehouse.name.label("warehouse_name"),
            ProductSKU.cost_price.label("unit_cost_cop"),
            InventoryMovement.created_at,
            InventoryMovement.created_by,
            InventoryMovement.idempotency_key,
        )
        .join(InventoryOperation, InventoryOperation.id == InventoryMovement.operation_id)
        .outerjoin(ProductSKU, ProductSKU.id == InventoryMovement.sku_id)
        .outerjoin(Product, Product.id == ProductSKU.product_id)
        .outerjoin(Warehouse, Warehouse.id == InventoryMovement.warehouse_id)
    )

    if sku_id is not None:
        query = query.where(InventoryMovement.sku_id == sku_id)
    if warehouse_id is not None:
        query = query.where(InventoryMovement.warehouse_id == warehouse_id)
    if owner:
        query = query.where(InventoryMovement.owner == owner.strip().upper())
    if direction:
        query = query.where(InventoryMovement.direction == direction.strip().upper())
    if start_date:
        query = query.where(InventoryMovement.created_at >= datetime.datetime.combine(start_date, datetime.time.min))
    if end_date:
        query = query.where(InventoryMovement.created_at <= datetime.datetime.combine(end_date, datetime.time.max))

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar() or 0
    query = query.order_by(InventoryMovement.created_at.desc(), InventoryMovement.id.desc()).limit(limit).offset(offset)
    rows = db.execute(query).mappings().all()

    items = [
        KardexMovementItem(
            id=r["id"],
            operation_id=r["operation_id"],
            operation_type=r["operation_type"],
            source_document_type=r["source_document_type"],
            source_document_numero=r["source_document_numero"],
            sku_id=r["sku_id"],
            sku=r["sku"],
            product_name=r["product_name"],
            quantity=Decimal(str(r["quantity"])),
            direction=r["direction"],
            owner=r["owner"] or "NEBULAE",
            warehouse_id=r["warehouse_id"],
            warehouse_name=r["warehouse_name"],
            unit_cost_cop=Decimal(str(r["unit_cost_cop"])) if r["unit_cost_cop"] is not None else None,
            created_at=r["created_at"],
            created_by=r["created_by"],
            idempotency_key=r["idempotency_key"],
        )
        for r in rows
    ]

    return {
        "status": "success",
        "data": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": [it.model_dump() for it in items],
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. DISPONIBILIDAD DERIVADA Y RESUMEN DE STOCK
# ─────────────────────────────────────────────────────────────────────────────

def _calculate_sku_availability(db: Session, sku_id: int, warehouse_id: int) -> dict:
    """
    Calcula la disponibilidad física vendible, reservas y cuarentena de un SKU en una bodega:
    - stock_vendible_fisico = InventoryLevel.quantity (físico vendible, NUNCA incluye cuarentena)
    - stock_reservado = SUM(InventoryReservation.quantity_reserved) activos
    - stock_disponible = max(0, stock_vendible_fisico - stock_reservado)
    - stock_cuarentena = SUM(InventoryQuarantine.quantity) activos
    - stock_total_bajo_custodia = stock_vendible_fisico + stock_cuarentena
    - balance_nebulae = SUM(InventoryOwnerBalance) para NEBULAE
    - balance_mau = SUM(InventoryOwnerBalance) para MAU
    """
    now = _now()

    # 1. Stock físico vendible en bodega
    level = db.execute(
        select(InventoryLevel)
        .where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == warehouse_id)
    ).scalar_one_or_none()
    stock_vendible_fisico = Decimal(str(level.quantity)) if level and level.quantity is not None else Decimal("0.00")

    # 2. Reservas activas (no expiradas)
    res_sum = db.execute(
        select(func.coalesce(func.sum(InventoryReservation.quantity_reserved), 0))
        .where(
            InventoryReservation.sku_id == sku_id,
            InventoryReservation.warehouse_id == warehouse_id,
            InventoryReservation.status == "ACTIVE",
            or_(InventoryReservation.expires_at == None, InventoryReservation.expires_at > now),
        )
    ).scalar() or 0
    stock_reservado = Decimal(str(res_sum))

    # 3. Cuarentena activa (defectuosos/dañados en custodia)
    quar_sum = db.execute(
        select(func.coalesce(func.sum(InventoryQuarantine.quantity), 0))
        .where(
            InventoryQuarantine.sku_id == sku_id,
            InventoryQuarantine.warehouse_id == warehouse_id,
            InventoryQuarantine.status == "ACTIVO",
        )
    ).scalar() or 0
    stock_cuarentena = Decimal(str(quar_sum))

    # 4. Stock disponible derivado: físico vendible menos reservas activas
    # REGLA ESTRICTA: NO restar stock_cuarentena porque las unidades en cuarentena
    # nunca fueron incorporadas a InventoryLevel.
    stock_disponible = max(Decimal("0.00"), stock_vendible_fisico - stock_reservado)

    # 5. Stock total bajo custodia (vendible + cuarentena)
    stock_total_bajo_custodia = stock_vendible_fisico + stock_cuarentena

    # 6. Balances por propietario
    neb_bal = db.execute(
        select(func.coalesce(func.sum(InventoryOwnerBalance.quantity), 0))
        .where(
            InventoryOwnerBalance.sku_id == sku_id,
            InventoryOwnerBalance.warehouse_id == warehouse_id,
            InventoryOwnerBalance.owner == "NEBULAE",
        )
    ).scalar() or 0

    mau_bal = db.execute(
        select(func.coalesce(func.sum(InventoryOwnerBalance.quantity), 0))
        .where(
            InventoryOwnerBalance.sku_id == sku_id,
            InventoryOwnerBalance.warehouse_id == warehouse_id,
            InventoryOwnerBalance.owner == "MAU",
        )
    ).scalar() or 0

    # 7. Mercancía en tránsito hacia esta bodega
    transit_sum = db.execute(text("""
        SELECT COALESCE(SUM(pol.quantity_ordered - pol.quantity_received), 0)
        FROM purchase_order_lines pol
        JOIN purchase_orders_full p ON p.id = pol.pec_id
        WHERE pol.sku_id = :sku
          AND p.estado IN ('CONFIRMADA', 'ENVIADA', 'PARCIALMENTE_ENVIADA', 'PARCIALMENTE_RECIBIDA')
          AND (pol.quantity_ordered > pol.quantity_received)
    """), {"sku": sku_id}).scalar() or 0

    return {
        "stock_vendible_fisico": stock_vendible_fisico,
        "stock_reservado": stock_reservado,
        "stock_disponible": stock_disponible,
        "stock_cuarentena": stock_cuarentena,
        "stock_total_bajo_custodia": stock_total_bajo_custodia,
        "stock_fisico": stock_vendible_fisico,  # compatibilidad
        "stock_en_transito": Decimal(str(transit_sum)),
        "balance_nebulae": Decimal(str(neb_bal)),
        "balance_mau": Decimal(str(mau_bal)),
    }


@router.get("/disponibilidad/{sku_id}", response_model=dict)
def get_sku_availability(
    sku_id: int,
    warehouse_id: Optional[int] = Query(None, description="Filtrar por bodega específica"),
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db),
):
    """Retorna el desglose de disponibilidad física, reservada, en cuarentena y vendible de un SKU."""
    sku = db.execute(
        select(ProductSKU, Product.name.label("product_name"))
        .outerjoin(Product, Product.id == ProductSKU.product_id)
        .where(ProductSKU.id == sku_id)
    ).first()
    if not sku:
        raise HTTPException(404, f"SKU {sku_id} no encontrado")

    sku_obj, product_name = sku[0], sku[1]

    warehouses = db.execute(select(Warehouse).order_by(Warehouse.id)).scalars().all()
    if warehouse_id:
        warehouses = [w for w in warehouses if w.id == warehouse_id]
        if not warehouses:
            raise HTTPException(404, f"Bodega {warehouse_id} no encontrada")

    results = []
    for w in warehouses:
        data = _calculate_sku_availability(db, sku_id, w.id)
        results.append({
            "sku_id": sku_id,
            "sku": sku_obj.sku,
            "product_name": product_name,
            "warehouse_id": w.id,
            "warehouse_name": w.name,
            **data
        })

    return {
        "status": "success",
        "data": results if warehouse_id is None else results[0]
    }


@router.get("/stock-summary", response_model=dict)
def get_inventory_stock_summary(
    warehouse_id: Optional[int] = Query(None, description="Filtrar por bodega específica"),
    sku_id: Optional[int] = Query(None, description="Filtrar por SKU específico"),
    search: Optional[str] = Query(None, description="Buscar por SKU o nombre de producto"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db),
):
    """Reporte consolidado de inventario con disponibilidad derivada y separación patrimonial."""
    query = (
        select(ProductSKU.id, ProductSKU.sku, Product.name.label("product_name"))
        .outerjoin(Product, Product.id == ProductSKU.product_id)
    )
    if sku_id:
        query = query.where(ProductSKU.id == sku_id)
    if search:
        s = f"%{search.strip()}%"
        query = query.where(or_(ProductSKU.sku.ilike(s), Product.name.ilike(s)))

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar() or 0
    skus = db.execute(query.order_by(ProductSKU.id).limit(limit).offset(offset)).all()

    warehouses = db.execute(select(Warehouse).order_by(Warehouse.id)).scalars().all()
    if warehouse_id:
        warehouses = [w for w in warehouses if w.id == warehouse_id]

    items = []
    for sku_row in skus:
        s_id, s_code, p_name = sku_row[0], sku_row[1], sku_row[2]
        for w in warehouses:
            avail = _calculate_sku_availability(db, s_id, w.id)
            if avail["stock_vendible_fisico"] > 0 or avail["stock_reservado"] > 0 or avail["stock_cuarentena"] > 0 or avail["stock_en_transito"] > 0:
                items.append({
                    "sku_id": s_id,
                    "sku": s_code,
                    "product_name": p_name,
                    "warehouse_id": w.id,
                    "warehouse_name": w.name,
                    **avail
                })

    return {
        "status": "success",
        "data": {
            "total_skus": total,
            "items": items
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. RESERVAS DE INVENTARIO CON CONTROL CONCURRENTE E IDEMPOTENCIA
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/reservas", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_inventory_reservation(
    body: CreateReservationRequest,
    response: Response,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """Crea una reserva de stock atómica y protegida contra sobreventa concurrente (SELECT FOR UPDATE) e idempotente."""
    now = _now()
    client_key = body.idempotency_key.strip()
    sku_id = body.sku_id
    warehouse_id = body.warehouse_id
    qty = Decimal(str(body.quantity))
    owner = body.owner.strip().upper()

    if owner not in ("NEBULAE", "MAU"):
        raise HTTPException(422, "El propietario debe ser 'NEBULAE' o 'MAU'")

    payload_for_hash = {
        "sku_id": sku_id,
        "warehouse_id": warehouse_id,
        "quantity": str(qty),
        "owner": owner,
        "sale_order_line_id": body.sale_order_line_id,
    }

    replay_data, exec_token, req_hash = _start_idempotent_operation(
        db=db,
        op_type="CREAR_RESERVA",
        client_key=client_key,
        payload_dict=payload_for_hash,
        entity_type="RESERVA",
        user_id=getattr(user, "id", None),
        now=now,
    )

    if replay_data is not None:
        response.status_code = status.HTTP_200_OK
        return {
            "status": "success",
            "data": replay_data,
            "idempotent_replay": True,
            "idempotency_key": client_key,
        }

    try:
        # Iniciar transacción pesimista: Bloquear InventoryLevel para serializar concurrencia
        level = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == warehouse_id)
            .with_for_update()
        ).scalar_one_or_none()

        stock_fisico = Decimal(str(level.quantity)) if level and level.quantity is not None else Decimal("0.00")

        # Bloquear y calcular balance del propietario
        owner_bal = db.execute(
            select(InventoryOwnerBalance)
            .where(
                InventoryOwnerBalance.sku_id == sku_id,
                InventoryOwnerBalance.warehouse_id == warehouse_id,
                InventoryOwnerBalance.owner == owner
            )
            .with_for_update()
        ).scalar_one_or_none()

        stock_owner = Decimal(str(owner_bal.quantity)) if owner_bal and owner_bal.quantity is not None else Decimal("0.00")

        # Calcular reservas activas para el propietario
        active_res_sum = db.execute(
            select(func.coalesce(func.sum(InventoryReservation.quantity_reserved), 0))
            .where(
                InventoryReservation.sku_id == sku_id,
                InventoryReservation.warehouse_id == warehouse_id,
                InventoryReservation.owner == owner,
                InventoryReservation.status == "ACTIVE"
            )
        ).scalar()
        active_res_owner = Decimal(str(active_res_sum))

        # Calcular reservas activas globales
        global_res_sum = db.execute(
            select(func.coalesce(func.sum(InventoryReservation.quantity_reserved), 0))
            .where(
                InventoryReservation.sku_id == sku_id,
                InventoryReservation.warehouse_id == warehouse_id,
                InventoryReservation.status == "ACTIVE"
            )
        ).scalar()
        global_res = Decimal(str(global_res_sum))

        # Semántica única: disponible_fisico = vendible - reservas
        disponible_fisico = max(Decimal("0.00"), stock_fisico - global_res)
        disponible_owner = max(Decimal("0.00"), stock_owner - active_res_owner)

        if disponible_owner < qty:
            raise HTTPException(
                409,
                f"Stock disponible insuficiente para reserva del propietario {owner}. "
                f"Solicitado: {qty}, Disponible: {disponible_owner} (Físico {owner}: {stock_owner}, Reservado: {active_res_owner})"
            )

        if disponible_fisico < qty:
            raise HTTPException(
                409,
                f"Stock físico vendible insuficiente en bodega. "
                f"Solicitado: {qty}, Vendible disponible: {disponible_fisico} (Físico: {stock_fisico})"
            )

        # Validar sale_order_line_id si viene provisto
        if body.sale_order_line_id:
            so_line = db.execute(
                select(SaleOrderLineErp).where(SaleOrderLineErp.id == body.sale_order_line_id)
            ).scalar_one_or_none()
            if not so_line:
                raise HTTPException(404, f"Línea de pedido de venta {body.sale_order_line_id} no encontrada")

        expires_at = now + datetime.timedelta(hours=body.expires_hours or 48)

        reservation = InventoryReservation(
            sku_id=sku_id,
            warehouse_id=warehouse_id,
            owner=owner,
            quantity_reserved=qty,
            sale_order_line_id=body.sale_order_line_id,
            status="ACTIVE",
            expires_at=expires_at,
            created_at=now,
            created_by=getattr(user, "email", str(getattr(user, "id", "system"))),
            notes=body.notes
        )
        db.add(reservation)
        db.flush()

        resp_data = ReservationResponse.model_validate(reservation).model_dump(mode="json")
        _finish_idempotent_operation(
            db=db,
            op_type="CREAR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            entity_id=reservation.id,
            response_data=resp_data,
            now=now,
        )
        db.commit()

        return {
            "status": "success",
            "data": resp_data,
            "idempotency_key": client_key,
        }
    except HTTPException as he:
        db.rollback()
        _mark_failed_external(
            op_type="CREAR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(getattr(he, "detail", he))[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="RESERVA",
            user_id=getattr(user, "id", None),
        )
        raise
    except Exception as exc:
        db.rollback()
        _mark_failed_external(
            op_type="CREAR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(exc)[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="RESERVA",
            user_id=getattr(user, "id", None),
        )
        raise HTTPException(500, f"Error al crear reserva: {exc}")


@router.post("/reservas/{reserva_id}/liberar", response_model=dict)
def release_inventory_reservation(
    reserva_id: int,
    body: OperateReservationRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """Libera una reserva activa haciéndola disponible nuevamente (idempotente)."""
    now = _now()
    client_key = body.idempotency_key.strip()
    payload_for_hash = {"reserva_id": reserva_id, "notes": body.notes}

    replay_data, exec_token, req_hash = _start_idempotent_operation(
        db=db,
        op_type="LIBERAR_RESERVA",
        client_key=client_key,
        payload_dict=payload_for_hash,
        entity_type="RESERVA",
        user_id=getattr(user, "id", None),
        now=now,
    )

    if replay_data is not None:
        return {
            "status": "success",
            "data": replay_data,
            "idempotent_replay": True,
            "idempotency_key": client_key,
        }

    try:
        res = db.execute(
            select(InventoryReservation).where(InventoryReservation.id == reserva_id).with_for_update()
        ).scalar_one_or_none()
        if not res:
            raise HTTPException(404, "Reserva no encontrada")

        if res.status != "ACTIVE":
            raise HTTPException(409, f"La reserva {reserva_id} no está activa (estado actual={res.status})")

        res.status = "RELEASED"
        res.released_at = now
        if body.notes:
            res.notes = f"{res.notes or ''}\nLiberación: {body.notes}".strip()
        db.flush()

        resp_data = ReservationResponse.model_validate(res).model_dump(mode="json")
        _finish_idempotent_operation(
            db=db,
            op_type="LIBERAR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            entity_id=res.id,
            response_data=resp_data,
            now=now,
        )
        db.commit()

        return {
            "status": "success",
            "message": f"Reserva {reserva_id} liberada con éxito",
            "data": resp_data,
            "idempotency_key": client_key,
        }
    except HTTPException as he:
        db.rollback()
        _mark_failed_external(
            op_type="LIBERAR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(getattr(he, "detail", he))[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="RESERVA",
            user_id=getattr(user, "id", None),
        )
        raise
    except Exception as exc:
        db.rollback()
        _mark_failed_external(
            op_type="LIBERAR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(exc)[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="RESERVA",
            user_id=getattr(user, "id", None),
        )
        raise HTTPException(500, f"Error al liberar reserva: {exc}")


@router.post("/reservas/{reserva_id}/convertir", response_model=dict)
def convert_inventory_reservation(
    reserva_id: int,
    body: OperateReservationRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """Convierte una reserva activa al despachar el pedido: deduce el stock físico y registra salida en Kárdex (idempotente)."""
    now = _now()
    client_key = body.idempotency_key.strip()
    payload_for_hash = {"reserva_id": reserva_id, "notes": body.notes}

    replay_data, exec_token, req_hash = _start_idempotent_operation(
        db=db,
        op_type="CONVERTIR_RESERVA",
        client_key=client_key,
        payload_dict=payload_for_hash,
        entity_type="RESERVA",
        user_id=getattr(user, "id", None),
        now=now,
    )

    if replay_data is not None:
        return {
            "status": "success",
            "data": replay_data,
            "idempotent_replay": True,
            "idempotency_key": client_key,
        }

    try:
        res = db.execute(
            select(InventoryReservation).where(InventoryReservation.id == reserva_id).with_for_update()
        ).scalar_one_or_none()
        if not res:
            raise HTTPException(404, "Reserva no encontrada")

        if res.status != "ACTIVE":
            raise HTTPException(409, f"La reserva {reserva_id} no está activa (estado actual={res.status})")

        qty = Decimal(str(res.quantity_reserved))

        # Bloquear y actualizar InventoryLevel
        level = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == res.sku_id, InventoryLevel.warehouse_id == res.warehouse_id)
            .with_for_update()
        ).scalar_one_or_none()
        if not level or Decimal(str(level.quantity)) < qty:
            raise HTTPException(
                409,
                f"Discrepancia física: existencia en bodega insuficiente ({level.quantity if level else 0}) "
                f"para convertir reserva de {qty}"
            )

        level.quantity = Decimal(str(level.quantity)) - qty

        # Actualizar balance por propietario (REGLA: NUNCA usar max(0, ...), fallar con 409 si insuficiente)
        owner_bal = db.execute(
            select(InventoryOwnerBalance)
            .where(
                InventoryOwnerBalance.sku_id == res.sku_id,
                InventoryOwnerBalance.warehouse_id == res.warehouse_id,
                InventoryOwnerBalance.owner == res.owner
            )
            .with_for_update()
        ).scalar_one_or_none()
        if not owner_bal or Decimal(str(owner_bal.quantity)) < qty:
            raise HTTPException(
                409,
                f"Saldo insuficiente del propietario {res.owner} ({owner_bal.quantity if owner_bal else 0}) "
                f"para convertir reserva de {qty}"
            )

        owner_bal.quantity = Decimal(str(owner_bal.quantity)) - qty
        owner_bal.updated_at = now

        # Registrar operación y movimiento de Kárdex OUT
        inv_op = InventoryOperation(
            dest_warehouse_id=res.warehouse_id,
            operation_type="DELIVERY",
            status="DONE",
            source_document_type="RESERVA",
            source_document_id=res.id,
            source_document_numero=f"RES-{res.id}",
        )
        db.add(inv_op)
        db.flush()

        mv_key = hashlib.sha256(f"{inv_op.id}:{res.sku_id}:OUT:{res.owner}:{res.warehouse_id}".encode()).hexdigest()
        db.add(InventoryMovement(
            operation_id=inv_op.id,
            sku_id=res.sku_id,
            quantity=qty,
            direction="OUT",
            owner=res.owner,
            warehouse_id=res.warehouse_id,
            idempotency_key=mv_key,
            created_at=now,
            created_by=getattr(user, "email", str(getattr(user, "id", "system")))
        ))

        res.status = "CONVERTED"
        res.converted_at = now
        if body.notes:
            res.notes = f"{res.notes or ''}\nConversión: {body.notes}".strip()
        db.flush()

        resp_data = ReservationResponse.model_validate(res).model_dump(mode="json")
        _finish_idempotent_operation(
            db=db,
            op_type="CONVERTIR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            entity_id=res.id,
            response_data=resp_data,
            now=now,
        )
        db.commit()

        return {
            "status": "success",
            "message": f"Reserva {reserva_id} convertida a entrega exitosamente",
            "data": resp_data,
            "idempotency_key": client_key,
        }
    except HTTPException as he:
        db.rollback()
        _mark_failed_external(
            op_type="CONVERTIR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(getattr(he, "detail", he))[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="RESERVA",
            user_id=getattr(user, "id", None),
        )
        raise
    except Exception as exc:
        db.rollback()
        _mark_failed_external(
            op_type="CONVERTIR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(exc)[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="RESERVA",
            user_id=getattr(user, "id", None),
        )
        raise HTTPException(500, f"Error al convertir reserva: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# 4. GESTIÓN Y AISLAMIENTO DE CUARENTENA CON SEGREGACIÓN PATRIMONIAL
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/cuarentena", response_model=dict)
def list_quarantine_items(
    warehouse_id: Optional[int] = Query(None),
    owner: Optional[str] = Query(None, description="Filtrar por propietario: NEBULAE o MAU"),
    status: Optional[str] = Query("ACTIVO", description="ACTIVO | LIBERADO | DEVUELTO_PROVEEDOR | DESTRUIDO"),
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db),
):
    """Lista las unidades retenidas en cuarentena, defectuosas o discrepantes con filtro por propietario."""
    query = (
        select(
            InventoryQuarantine.id,
            InventoryQuarantine.sku_id,
            ProductSKU.sku,
            Product.name.label("product_name"),
            InventoryQuarantine.warehouse_id,
            Warehouse.name.label("warehouse_name"),
            InventoryQuarantine.gr_line_id,
            InventoryQuarantine.quantity,
            InventoryQuarantine.reason,
            InventoryQuarantine.owner,
            InventoryQuarantine.status,
            InventoryQuarantine.notes,
            InventoryQuarantine.created_at,
            InventoryQuarantine.resolved_at,
            InventoryQuarantine.resolved_by,
        )
        .join(ProductSKU, ProductSKU.id == InventoryQuarantine.sku_id)
        .outerjoin(Product, Product.id == ProductSKU.product_id)
        .join(Warehouse, Warehouse.id == InventoryQuarantine.warehouse_id)
    )
    if warehouse_id:
        query = query.where(InventoryQuarantine.warehouse_id == warehouse_id)
    if owner:
        query = query.where(InventoryQuarantine.owner == owner.strip().upper())
    if status:
        query = query.where(InventoryQuarantine.status == status.strip().upper())

    rows = db.execute(query.order_by(InventoryQuarantine.created_at.desc())).mappings().all()
    items = [
        QuarantineItemResponse(
            id=r["id"],
            sku_id=r["sku_id"],
            sku=r["sku"],
            product_name=r["product_name"],
            warehouse_id=r["warehouse_id"],
            warehouse_name=r["warehouse_name"],
            gr_line_id=r["gr_line_id"],
            quantity=Decimal(str(r["quantity"])),
            reason=r["reason"],
            owner=r["owner"] or "NEBULAE",
            status=r["status"],
            notes=r["notes"],
            created_at=r["created_at"],
            resolved_at=r["resolved_at"],
            resolved_by=r["resolved_by"],
        )
        for r in rows
    ]

    return {
        "status": "success",
        "data": [it.model_dump() for it in items]
    }


@router.post("/cuarentena/{quarantine_id}/resolver", response_model=dict)
def resolve_quarantine_item(
    quarantine_id: int,
    body: ResolveQuarantineRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """
    Resuelve un ítem de cuarentena (idempotente):
    - LIBERAR: ingresa las unidades como stock físico vendible (+Kárdex IN) y suma al balance del propietario original.
    - DEVUELTO_PROVEEDOR: se asienta la devolución con su propietario original y motivo (no toca disponible ni balances).
    - DESTRUIDO: se da de baja con su propietario original y motivo (no toca disponible ni balances).
    """
    now = _now()
    client_key = body.idempotency_key.strip()
    action = body.action.strip().upper()
    if action not in ("LIBERAR", "DEVUELTO_PROVEEDOR", "DESTRUIDO"):
        raise HTTPException(422, "Acción inválida. Use: LIBERAR, DEVUELTO_PROVEEDOR, DESTRUIDO")

    payload_for_hash = {
        "quarantine_id": quarantine_id,
        "action": action,
        "notes": body.notes,
    }

    replay_data, exec_token, req_hash = _start_idempotent_operation(
        db=db,
        op_type="RESOLVER_CUARENTENA",
        client_key=client_key,
        payload_dict=payload_for_hash,
        entity_type="CUARENTENA",
        user_id=getattr(user, "id", None),
        now=now,
    )

    if replay_data is not None:
        return {
            "status": "success",
            "data": replay_data,
            "idempotent_replay": True,
            "idempotency_key": client_key,
        }

    try:
        q = db.execute(
            select(InventoryQuarantine).where(InventoryQuarantine.id == quarantine_id).with_for_update()
        ).scalar_one_or_none()
        if not q:
            raise HTTPException(404, "Registro de cuarentena no encontrado")

        if q.status != "ACTIVO":
            raise HTTPException(409, f"El registro de cuarentena ya está resuelto (estado={q.status})")

        qty = Decimal(str(q.quantity))
        item_owner = q.owner or "NEBULAE"

        if action == "LIBERAR":
            # 1. Ingresar a stock vendible
            level = db.execute(
                select(InventoryLevel)
                .where(InventoryLevel.sku_id == q.sku_id, InventoryLevel.warehouse_id == q.warehouse_id)
                .with_for_update()
            ).scalar_one_or_none()
            if level:
                level.quantity = Decimal(str(level.quantity)) + qty
            else:
                db.add(InventoryLevel(sku_id=q.sku_id, warehouse_id=q.warehouse_id, quantity=qty))

            # 2. Balance del propietario original (Si era Mau -> suma a Mau. Si era Nebulae -> suma a Nebulae)
            iob = db.execute(
                select(InventoryOwnerBalance)
                .where(
                    InventoryOwnerBalance.sku_id == q.sku_id,
                    InventoryOwnerBalance.warehouse_id == q.warehouse_id,
                    InventoryOwnerBalance.owner == item_owner
                )
                .with_for_update()
            ).scalar_one_or_none()
            if iob:
                iob.quantity = Decimal(str(iob.quantity)) + qty
                iob.updated_at = now
            else:
                db.add(InventoryOwnerBalance(
                    sku_id=q.sku_id,
                    warehouse_id=q.warehouse_id,
                    owner=item_owner,
                    quantity=qty,
                    updated_at=now
                ))

            # 3. Registrar Kárdex IN con el propietario original
            inv_op = InventoryOperation(
                dest_warehouse_id=q.warehouse_id,
                operation_type="RECEIPT",
                status="DONE",
                source_document_type="CUARENTENA_LIBERADA",
                source_document_id=q.id,
                source_document_numero=f"CUAR-{q.id}",
            )
            db.add(inv_op)
            db.flush()

            mv_key = hashlib.sha256(f"{inv_op.id}:{q.sku_id}:IN:{item_owner}:{q.warehouse_id}:LIBERAR".encode()).hexdigest()
            db.add(InventoryMovement(
                operation_id=inv_op.id,
                sku_id=q.sku_id,
                quantity=qty,
                direction="IN",
                owner=item_owner,
                warehouse_id=q.warehouse_id,
                idempotency_key=mv_key,
                created_at=now,
                created_by=getattr(user, "email", str(getattr(user, "id", "system")))
            ))
            q.status = "LIBERADO"
        else:
            q.status = action

        q.resolved_at = now
        q.resolved_by = getattr(user, "email", str(getattr(user, "id", "system")))
        if body.notes:
            q.notes = f"{q.notes or ''}\nResolución: {body.notes}".strip()

        db.flush()

        sku_code = q.sku.sku if q.sku else None
        prod_name = q.sku.product.name if (q.sku and q.sku.product) else None
        wh_name = q.warehouse.name if q.warehouse else None

        resp_data = {
            "id": q.id,
            "sku_id": q.sku_id,
            "sku": sku_code,
            "product_name": prod_name,
            "warehouse_id": q.warehouse_id,
            "warehouse_name": wh_name,
            "gr_line_id": q.gr_line_id,
            "quantity": str(q.quantity),
            "owner": q.owner,
            "reason": q.reason,
            "status": q.status,
            "notes": q.notes,
            "created_at": q.created_at.isoformat() if q.created_at else None,
            "resolved_at": q.resolved_at.isoformat() if q.resolved_at else None,
            "resolved_by": q.resolved_by,
        }

        _finish_idempotent_operation(
            db=db,
            op_type="RESOLVER_CUARENTENA",
            client_key=client_key,
            exec_token=exec_token,
            entity_id=q.id,
            response_data=resp_data,
            now=now,
        )
        db.commit()

        return {
            "status": "success",
            "message": f"Cuarentena {quarantine_id} resuelta como {q.status}",
            "data": resp_data,
            "idempotency_key": client_key,
        }
    except HTTPException as he:
        db.rollback()
        _mark_failed_external(
            op_type="RESOLVER_CUARENTENA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(getattr(he, "detail", he))[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="CUARENTENA",
            user_id=getattr(user, "id", None),
        )
        raise
    except Exception as exc:
        db.rollback()
        _mark_failed_external(
            op_type="RESOLVER_CUARENTENA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(exc)[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="CUARENTENA",
            user_id=getattr(user, "id", None),
        )
        raise HTTPException(500, f"Error al resolver cuarentena: {exc}")
