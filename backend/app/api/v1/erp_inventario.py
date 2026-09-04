"""
erp_inventario.py — Módulo de Inventario Avanzado para Fase 3 (Prompt Maestro).

Funcionalidades:
1. Kárdex Inmutable e Idempotente (/kardex)
2. Reservas de Inventario con Control Concurrente (/reservas)
3. Cálculo de Disponibilidad Derivada (/disponibilidad, /stock-summary)
4. Gestión y Aislamiento de Cuarentena (/cuarentena)
5. Separación Patrimonial Nebulae vs Mau
"""
import datetime
import hashlib
from typing import Optional, List
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func, and_, or_, text

from app.db.database import get_db
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
    ReservationResponse,
    SkuAvailabilityResponse,
    QuarantineItemResponse,
    ResolveQuarantineRequest,
)

router = APIRouter()


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


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
            quantity=r["quantity"],
            direction=r["direction"],
            owner=r["owner"] or "NEBULAE",
            warehouse_id=r["warehouse_id"],
            warehouse_name=r["warehouse_name"],
            unit_cost_cop=float(r["unit_cost_cop"]) if r["unit_cost_cop"] is not None else None,
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
    """Calcula matemáticamente la disponibilidad derivada de un SKU en una bodega:

    disponible = stock_fisico - reservas_activas - cuarentena_activa
    """
    now = _now()

    # 1. Stock físico total en bodega
    level = db.execute(
        select(InventoryLevel)
        .where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == warehouse_id)
    ).scalar_one_or_none()
    stock_fisico = float(level.quantity) if level else 0.0

    # 2. Reservas activas (no expiradas)
    res_sum = db.execute(
        select(func.coalesce(func.sum(InventoryReservation.quantity_reserved), 0))
        .where(
            InventoryReservation.sku_id == sku_id,
            InventoryReservation.warehouse_id == warehouse_id,
            InventoryReservation.status == "ACTIVE",
            or_(InventoryReservation.expires_at == None, InventoryReservation.expires_at > now),
        )
    ).scalar() or 0.0
    stock_reservado = float(res_sum)

    # 3. Cuarentena activa (defectuosos/dañados)
    quar_sum = db.execute(
        select(func.coalesce(func.sum(InventoryQuarantine.quantity), 0))
        .where(
            InventoryQuarantine.sku_id == sku_id,
            InventoryQuarantine.warehouse_id == warehouse_id,
            InventoryQuarantine.status == "ACTIVO",
        )
    ).scalar() or 0.0
    stock_cuarentena = float(quar_sum)

    # 4. Stock disponible derivado (no puede ser negativo)
    stock_disponible = max(0.0, stock_fisico - stock_reservado - stock_cuarentena)

    # 5. Balances por propietario
    neb_bal = db.execute(
        select(func.coalesce(func.sum(InventoryOwnerBalance.quantity), 0))
        .where(
            InventoryOwnerBalance.sku_id == sku_id,
            InventoryOwnerBalance.warehouse_id == warehouse_id,
            InventoryOwnerBalance.owner == "NEBULAE",
        )
    ).scalar() or 0.0

    mau_bal = db.execute(
        select(func.coalesce(func.sum(InventoryOwnerBalance.quantity), 0))
        .where(
            InventoryOwnerBalance.sku_id == sku_id,
            InventoryOwnerBalance.warehouse_id == warehouse_id,
            InventoryOwnerBalance.owner == "MAU",
        )
    ).scalar() or 0.0

    # 6. Mercancía en tránsito hacia esta bodega (órdenes de compra no recibidas)
    transit_sum = db.execute(text("""
        SELECT COALESCE(SUM(pol.quantity_ordered - pol.quantity_received), 0)
        FROM purchase_order_lines pol
        JOIN purchase_orders_full p ON p.id = pol.pec_id
        WHERE pol.sku_id = :sku
          AND p.estado IN ('CONFIRMADA', 'ENVIADA', 'PARCIALMENTE_ENVIADA', 'PARCIALMENTE_RECIBIDA')
          AND (pol.quantity_ordered > pol.quantity_received)
    """), {"sku": sku_id}).scalar() or 0.0
    stock_en_transito = float(transit_sum)

    return {
        "stock_fisico": stock_fisico,
        "stock_reservado": stock_reservado,
        "stock_cuarentena": stock_cuarentena,
        "stock_disponible": stock_disponible,
        "stock_en_transito": stock_en_transito,
        "balance_nebulae": float(neb_bal),
        "balance_mau": float(mau_bal),
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
            if avail["stock_fisico"] > 0 or avail["stock_reservado"] > 0 or avail["stock_cuarentena"] > 0 or avail["stock_en_transito"] > 0:
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
# 3. RESERVAS DE INVENTARIO CON CONTROL CONCURRENTE
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/reservas", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_inventory_reservation(
    body: CreateReservationRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """Crea una reserva de stock atómica y protegida contra sobreventa concurrente (SELECT FOR UPDATE)."""
    now = _now()
    sku_id = body.sku_id
    warehouse_id = body.warehouse_id
    qty = float(body.quantity)
    owner = body.owner.strip().upper()

    if owner not in ("NEBULAE", "MAU"):
        raise HTTPException(422, "El propietario debe ser 'NEBULAE' o 'MAU'")

    # Iniciar transacción pesimista: Bloquear InventoryLevel para serializar concurrencia
    level = db.execute(
        select(InventoryLevel)
        .where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == warehouse_id)
        .with_for_update()
    ).scalar_one_or_none()

    stock_fisico = float(level.quantity) if level else 0.0

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

    stock_owner = float(owner_bal.quantity) if owner_bal else 0.0

    # Calcular reservas activas para el propietario
    active_res_sum = db.execute(
        select(func.coalesce(func.sum(InventoryReservation.quantity_reserved), 0))
        .where(
            InventoryReservation.sku_id == sku_id,
            InventoryReservation.warehouse_id == warehouse_id,
            InventoryReservation.owner == owner,
            InventoryReservation.status == "ACTIVE",
            or_(InventoryReservation.expires_at == None, InventoryReservation.expires_at > now),
        )
    ).scalar() or 0.0

    # Cuarentena
    quar_sum = db.execute(
        select(func.coalesce(func.sum(InventoryQuarantine.quantity), 0))
        .where(
            InventoryQuarantine.sku_id == sku_id,
            InventoryQuarantine.warehouse_id == warehouse_id,
            InventoryQuarantine.status == "ACTIVO"
        )
    ).scalar() or 0.0

    # Disponibilidad específica para este propietario
    disponible_owner = max(0.0, stock_owner - float(active_res_sum) - (float(quar_sum) if owner == "NEBULAE" else 0.0))

    if disponible_owner < qty:
        raise HTTPException(
            409,
            f"Stock disponible insuficiente para reserva del propietario {owner}. "
            f"Solicitado: {qty}, Disponible: {disponible_owner} (Físico {owner}: {stock_owner}, Reservado: {active_res_sum})"
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
    db.commit()
    db.refresh(reservation)

    return {
        "status": "success",
        "data": ReservationResponse.model_validate(reservation).model_dump()
    }


@router.post("/reservas/{reserva_id}/liberar", response_model=dict)
def release_inventory_reservation(
    reserva_id: int,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """Libera una reserva activa haciéndola disponible nuevamente."""
    res = db.execute(
        select(InventoryReservation).where(InventoryReservation.id == reserva_id).with_for_update()
    ).scalar_one_or_none()
    if not res:
        raise HTTPException(404, "Reserva no encontrada")
    if res.status != "ACTIVE":
        raise HTTPException(409, f"La reserva ya no está activa (estado={res.status})")

    now = _now()
    res.status = "RELEASED"
    res.released_at = now
    db.commit()

    return {
        "status": "success",
        "message": f"Reserva {reserva_id} liberada con éxito",
        "data": ReservationResponse.model_validate(res).model_dump()
    }


@router.post("/reservas/{reserva_id}/convertir", response_model=dict)
def convert_inventory_reservation(
    reserva_id: int,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """Convierte una reserva activa al despachar el pedido: deduce el stock físico y registra salida en Kárdex."""
    now = _now()
    res = db.execute(
        select(InventoryReservation).where(InventoryReservation.id == reserva_id).with_for_update()
    ).scalar_one_or_none()
    if not res:
        raise HTTPException(404, "Reserva no encontrada")
    if res.status != "ACTIVE":
        raise HTTPException(409, f"La reserva no está activa (estado={res.status})")

    qty = int(res.quantity_reserved)

    # Bloquear y actualizar InventoryLevel
    level = db.execute(
        select(InventoryLevel)
        .where(InventoryLevel.sku_id == res.sku_id, InventoryLevel.warehouse_id == res.warehouse_id)
        .with_for_update()
    ).scalar_one_or_none()
    if not level or level.quantity < qty:
        raise HTTPException(409, "Discrepancia física: existencia en bodega insuficiente para convertir reserva")

    level.quantity -= qty

    # Actualizar balance por propietario
    owner_bal = db.execute(
        select(InventoryOwnerBalance)
        .where(
            InventoryOwnerBalance.sku_id == res.sku_id,
            InventoryOwnerBalance.warehouse_id == res.warehouse_id,
            InventoryOwnerBalance.owner == res.owner
        )
        .with_for_update()
    ).scalar_one_or_none()
    if owner_bal:
        owner_bal.quantity = max(Decimal("0"), owner_bal.quantity - Decimal(str(qty)))
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
    db.commit()

    return {
        "status": "success",
        "message": f"Reserva {reserva_id} convertida a entrega exitosamente",
        "data": ReservationResponse.model_validate(res).model_dump()
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. GESTIÓN Y AISLAMIENTO DE CUARENTENA
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/cuarentena", response_model=dict)
def list_quarantine_items(
    warehouse_id: Optional[int] = Query(None),
    status: Optional[str] = Query("ACTIVO", description="ACTIVO | LIBERADO | DEVUELTO_PROVEEDOR | DESTRUIDO"),
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db),
):
    """Lista las unidades retenidas en cuarentena, defectuosas o discrepantes."""
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
            quantity=float(r["quantity"]),
            reason=r["reason"],
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
    """Resuelve un ítem de cuarentena:

    - LIBERAR: ingresa las unidades como stock físico vendible (+Kárdex IN)
    - DEVUELTO_PROVEEDOR: se asienta la devolución
    - DESTRUIDO: se da de baja
    """
    now = _now()
    action = body.action.strip().upper()
    if action not in ("LIBERAR", "DEVUELTO_PROVEEDOR", "DESTRUIDO"):
        raise HTTPException(422, "Acción inválida. Use: LIBERAR, DEVUELTO_PROVEEDOR, DESTRUIDO")

    q = db.execute(
        select(InventoryQuarantine).where(InventoryQuarantine.id == quarantine_id).with_for_update()
    ).scalar_one_or_none()
    if not q:
        raise HTTPException(404, "Registro de cuarentena no encontrado")
    if q.status != "ACTIVO":
        raise HTTPException(409, f"El registro de cuarentena ya está resuelto (estado={q.status})")

    qty = int(q.quantity)

    if action == "LIBERAR":
        # Ingresar a stock vendible
        level = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == q.sku_id, InventoryLevel.warehouse_id == q.warehouse_id)
            .with_for_update()
        ).scalar_one_or_none()
        if level:
            level.quantity += qty
        else:
            db.add(InventoryLevel(sku_id=q.sku_id, warehouse_id=q.warehouse_id, quantity=qty))

        # Balance Nebulae
        iob = db.execute(
            select(InventoryOwnerBalance)
            .where(InventoryOwnerBalance.sku_id == q.sku_id, InventoryOwnerBalance.warehouse_id == q.warehouse_id, InventoryOwnerBalance.owner == "NEBULAE")
            .with_for_update()
        ).scalar_one_or_none()
        if iob:
            iob.quantity += Decimal(str(qty))
            iob.updated_at = now
        else:
            db.add(InventoryOwnerBalance(sku_id=q.sku_id, warehouse_id=q.warehouse_id, owner="NEBULAE", quantity=Decimal(str(qty)), updated_at=now))

        # Registrar Kárdex de liberación
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

        mv_key = hashlib.sha256(f"{inv_op.id}:{q.sku_id}:IN:NEBULAE:{q.warehouse_id}:LIBERAR".encode()).hexdigest()
        db.add(InventoryMovement(
            operation_id=inv_op.id,
            sku_id=q.sku_id,
            quantity=qty,
            direction="IN",
            owner="NEBULAE",
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

    db.commit()
    db.refresh(q)

    sku_code = q.sku.sku if q.sku else None
    prod_name = q.sku.product.name if (q.sku and q.sku.product) else None
    wh_name = q.warehouse.name if q.warehouse else None

    return {
        "status": "success",
        "message": f"Cuarentena {quarantine_id} resuelta como {q.status}",
        "data": {
            "id": q.id,
            "sku_id": q.sku_id,
            "sku": sku_code,
            "product_name": prod_name,
            "warehouse_id": q.warehouse_id,
            "warehouse_name": wh_name,
            "gr_line_id": q.gr_line_id,
            "quantity": float(q.quantity),
            "reason": q.reason,
            "status": q.status,
            "notes": q.notes,
            "created_at": q.created_at,
            "resolved_at": q.resolved_at,
            "resolved_by": q.resolved_by,
        }
    }
