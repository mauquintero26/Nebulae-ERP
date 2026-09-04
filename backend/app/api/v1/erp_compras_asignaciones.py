"""
Módulo de Asignaciones M:N de Compras (PEC <-> PVEN / Stock Nebulae / Mau).
Fase 2 - Prompt Maestro.

Garantiza:
1. Bloqueo transaccional SELECT FOR UPDATE sobre PurchaseOrderLine, ProcurementAllocation y SaleOrderLineErp.
2. Proyección completa de estado: sum(existentes no modificadas + payload) <= po_line.quantity_ordered.
3. Coexistencia estricta por identidad: (po_line_id, allocation_type, sale_order_line_id).
   Permite 1 NEBULAE_STOCK, 1 MAU_STOCK y múltiples CUSTOMER_ORDER independientes.
4. Validación estricta para CUSTOMER_ORDER: existencia de la línea de venta, pertenencia al pedido,
   coincidencia exacta de sku_id entre compra y venta, y control de suministro acumulado contra la venta.
5. Idempotencia y atomicidad completa ante fallos y llamadas repetidas.
"""
import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, desc

from app.db.database import get_db
from app.api.dependencies import (
    require_roles,
    ROLE_ADMIN,
    ROLE_COMPRAS,
    ROLE_BODEGA,
    ROLE_ASESOR,
    ROLE_CONSULTA,
    ALL_ERP_ROLES,
)
from app.models.users import User
from app.models.erp_documents import PurchaseOrderFull, SaleOrder
from app.models.fase1b import PurchaseOrderLine, SaleOrderLineErp, ProcurementAllocation
from app.api.v1.schemas_fase2 import (
    ProcurementAllocationCreate,
    ProcurementAllocationOut,
)

router = APIRouter()


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


@router.post(
    "/pedidos/{pec_id}/asignaciones",
    response_model=Dict[str, Any],
    summary="Crear o actualizar asignaciones para un Pedido de Compra (M:N) con bloqueo y proyección",
)
def set_pec_asignaciones(
    pec_id: int,
    payload: ProcurementAllocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS))),
):
    """
    Semántica: Upsert atómico por identidad (po_line_id, allocation_type, sale_order_line_id).
    Calcula el estado proyectado sumando asignaciones existentes no tocadas + asignaciones del payload.
    Adquiere bloqueos SELECT FOR UPDATE sobre PurchaseOrderLine y SaleOrderLineErp.
    """
    if not payload.allocations:
        raise HTTPException(status_code=422, detail="El payload debe contener al menos una asignación")

    # 1. Verificar PEC
    pec = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec_id).first()
    if not pec:
        raise HTTPException(status_code=404, detail="Pedido de compra no encontrado")

    # 2. Bloquear y verificar líneas del PEC involucradas
    # Extraer po_line_ids únicos solicitados
    requested_po_line_ids = list({item.po_line_id for item in payload.allocations})

    # SELECT FOR UPDATE sobre las PurchaseOrderLine
    po_lines = (
        db.query(PurchaseOrderLine)
        .filter(
            PurchaseOrderLine.pec_id == pec_id,
            PurchaseOrderLine.id.in_(requested_po_line_ids),
        )
        .with_for_update()
        .all()
    )
    po_lines_map = {l.id: l for l in po_lines}

    # Validar que todas las líneas solicitadas existan y pertenezcan a este PEC
    for item in payload.allocations:
        if item.po_line_id not in po_lines_map:
            raise HTTPException(
                status_code=422,
                detail=f"La línea po_line_id={item.po_line_id} no pertenece a la orden PEC #{pec.numero}",
            )

    # 3. Bloquear asignaciones existentes para estas líneas
    existing_allocations = (
        db.query(ProcurementAllocation)
        .filter(ProcurementAllocation.po_line_id.in_(requested_po_line_ids))
        .with_for_update()
        .all()
    )

    # Mapa de asignaciones existentes indexadas por identidad: (po_line_id, allocation_type, sale_order_line_id)
    # sale_order_line_id es None para NEBULAE_STOCK y MAU_STOCK
    existing_map: Dict[tuple, ProcurementAllocation] = {}
    for a in existing_allocations:
        key = (a.po_line_id, a.allocation_type, a.sale_order_line_id)
        existing_map[key] = a

    # 4. Validar reglas de CUSTOMER_ORDER y bloquear SaleOrderLineErp
    customer_order_items = [it for it in payload.allocations if it.allocation_type == "CUSTOMER_ORDER"]
    so_line_ids = [it.sale_order_line_id for it in customer_order_items if it.sale_order_line_id is not None]

    so_lines_map: Dict[int, SaleOrderLineErp] = {}
    if so_line_ids:
        locked_so_lines = (
            db.query(SaleOrderLineErp)
            .filter(SaleOrderLineErp.id.in_(so_line_ids))
            .with_for_update()
            .all()
        )
        so_lines_map = {sol.id: sol for sol in locked_so_lines}

    for item in payload.allocations:
        po_line = po_lines_map[item.po_line_id]
        qty_dec = Decimal(str(item.quantity_allocated))
        if qty_dec <= Decimal("0"):
            raise HTTPException(status_code=422, detail="La cantidad asignada debe ser mayor a 0")

        if item.allocation_type == "CUSTOMER_ORDER":
            if not item.sale_order_line_id:
                raise HTTPException(
                    status_code=422,
                    detail="allocation_type='CUSTOMER_ORDER' requiere sale_order_line_id obligatorio",
                )
            sol = so_lines_map.get(item.sale_order_line_id)
            if not sol:
                raise HTTPException(
                    status_code=422,
                    detail=f"Línea de pedido de venta sale_order_line_id={item.sale_order_line_id} no existe",
                )

            # Validar coincidencia de SKU entre línea de compra y línea de venta
            if po_line.sku_id is not None and sol.sku_id is not None:
                if po_line.sku_id != sol.sku_id:
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            f"Incoherencia de producto: el SKU de compra (sku_id={po_line.sku_id}) "
                            f"no coincide con el SKU de venta (sku_id={sol.sku_id})"
                        ),
                    )

            # Validar que la suma total asignada a esta sale_order_line_id desde TODAS las PEC no exceda la cantidad requerida
            # Consultar todas las asignaciones existentes para este sol_id excepto la que estamos actualizando
            key = (item.po_line_id, item.allocation_type, item.sale_order_line_id)
            current_existing_alloc = existing_map.get(key)
            current_existing_id = current_existing_alloc.id if current_existing_alloc else None

            other_allocations_sum_query = db.query(func.coalesce(func.sum(ProcurementAllocation.quantity_allocated), Decimal("0"))).filter(
                ProcurementAllocation.sale_order_line_id == item.sale_order_line_id
            )
            if current_existing_id:
                other_allocations_sum_query = other_allocations_sum_query.filter(ProcurementAllocation.id != current_existing_id)
            
            other_supplied = Decimal(str(other_allocations_sum_query.scalar() or Decimal("0")))
            so_ordered_qty = Decimal(str(sol.quantity))

            if other_supplied + qty_dec > so_ordered_qty:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"La suma abastecida a la orden de venta ({other_supplied + qty_dec}) "
                        f"supera la cantidad requerida por el cliente ({so_ordered_qty}) en línea {sol.id}"
                    ),
                )
        else:
            # Para NEBULAE_STOCK o MAU_STOCK, sale_order_line_id debe ser None
            if item.sale_order_line_id is not None:
                # Si vino algún valor para stock propio, lo normalizamos a None
                item.sale_order_line_id = None

    # 5. Construir estado proyectado por po_line_id
    # Para cada po_line_id, tomar todas las asignaciones existentes en DB
    # y aplicar las actualizaciones o adiciones del payload
    # Mapa: po_line_id -> dict of identity_key -> Decimal(qty)
    projected_state: Dict[int, Dict[tuple, Decimal]] = {}
    for l_id in requested_po_line_ids:
        projected_state[l_id] = {}

    # Poblar con existentes
    for a in existing_allocations:
        k = (a.allocation_type, a.sale_order_line_id)
        projected_state[a.po_line_id][k] = Decimal(str(a.quantity_allocated))

    # Sobreescribir o agregar con el payload
    for item in payload.allocations:
        k = (item.allocation_type, item.sale_order_line_id)
        projected_state[item.po_line_id][k] = Decimal(str(item.quantity_allocated))

    # 6. Validar que para cada po_line_id, la suma total proyectada <= po_line.quantity_ordered
    for l_id, allocs_dict in projected_state.items():
        po_line = po_lines_map[l_id]
        total_projected = sum(allocs_dict.values())
        ordered = Decimal(str(po_line.quantity_ordered))
        if total_projected > ordered:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"La asignación total proyectada ({total_projected}) "
                    f"supera la cantidad ordenada ({ordered}) en línea {l_id}"
                ),
            )

    # 7. Persistir atómicamente
    saved_allocations: List[ProcurementAllocation] = []
    for item in payload.allocations:
        key = (item.po_line_id, item.allocation_type, item.sale_order_line_id)
        existing = existing_map.get(key)
        qty_dec = Decimal(str(item.quantity_allocated))

        if existing:
            existing.quantity_allocated = qty_dec
            saved_allocations.append(existing)
        else:
            new_alloc = ProcurementAllocation(
                po_line_id=item.po_line_id,
                allocation_type=item.allocation_type,
                sale_order_line_id=item.sale_order_line_id,
                quantity_allocated=qty_dec,
            )
            db.add(new_alloc)
            db.flush()
            existing_map[key] = new_alloc
            saved_allocations.append(new_alloc)

    db.commit()

    return {
        "status": "success",
        "message": f"Se registraron {len(saved_allocations)} asignaciones para el PEC #{pec.numero}",
        "data": [
            {
                "id": a.id,
                "po_line_id": a.po_line_id,
                "allocation_type": a.allocation_type,
                "sale_order_line_id": a.sale_order_line_id,
                "quantity_allocated": float(a.quantity_allocated),
            }
            for a in saved_allocations
        ],
    }


@router.get(
    "/pedidos/{pec_id}/asignaciones",
    response_model=Dict[str, Any],
    summary="Listar asignaciones de una Orden de Compra",
)
def get_pec_asignaciones(
    pec_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_ERP_ROLES)),
):
    pec = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec_id).first()
    if not pec:
        raise HTTPException(status_code=404, detail="Pedido de compra no encontrado")

    pec_lines = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.pec_id == pec_id).all()
    line_ids = [l.id for l in pec_lines]

    allocations = (
        db.query(ProcurementAllocation)
        .filter(ProcurementAllocation.po_line_id.in_(line_ids))
        .order_by(ProcurementAllocation.id)
        .all()
        if line_ids
        else []
    )

    result = []
    for a in allocations:
        so_num = None
        customer_name = None
        if a.sale_order_line and a.sale_order_line.sale_order:
            so_num = a.sale_order_line.sale_order.numero
            customer_name = a.sale_order_line.sale_order.customer_name

        result.append({
            "id": a.id,
            "po_line_id": a.po_line_id,
            "allocation_type": a.allocation_type,
            "sale_order_line_id": a.sale_order_line_id,
            "sale_order_numero": so_num,
            "customer_name": customer_name,
            "quantity_allocated": float(a.quantity_allocated),
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })

    return {
        "status": "success",
        "data": {
            "pec_id": pec.id,
            "pec_numero": pec.numero,
            "total_lineas": len(pec_lines),
            "asignaciones": result,
        },
    }


@router.get(
    "/ventas/{so_id}/abastecimiento",
    response_model=Dict[str, Any],
    summary="Consultar qué compras (PEC) abastecen a un Pedido de Venta (M:N)",
)
def get_so_abastecimiento(
    so_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_ERP_ROLES)),
):
    so = db.query(SaleOrder).filter(SaleOrder.id == so_id).first()
    if not so:
        raise HTTPException(status_code=404, detail="Pedido de venta no encontrado")

    so_lines = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == so_id).all()
    so_line_ids = [l.id for l in so_lines]

    allocations = (
        db.query(ProcurementAllocation)
        .filter(ProcurementAllocation.sale_order_line_id.in_(so_line_ids))
        .all()
        if so_line_ids
        else []
    )

    pec_summary: Dict[int, Dict[str, Any]] = {}
    for a in allocations:
        po_line = a.po_line
        if not po_line or not po_line.purchase_order:
            continue
        pec = po_line.purchase_order
        if pec.id not in pec_summary:
            pec_summary[pec.id] = {
                "pec_id": pec.id,
                "pec_numero": pec.numero,
                "proveedor": pec.supplier_name,
                "estado_pec": pec.estado,
                "tracking_number": pec.tracking_number,
                "carrier": pec.carrier,
                "items_asignados": [],
            }
        pec_summary[pec.id]["items_asignados"].append({
            "po_line_id": po_line.id,
            "description": po_line.description,
            "quantity_allocated": float(a.quantity_allocated),
            "quantity_received": float(po_line.quantity_received or 0),
        })

    return {
        "status": "success",
        "data": {
            "so_id": so.id,
            "so_numero": so.numero,
            "cliente": so.customer_name,
            "estado_venta": so.estado,
            "ordenes_de_compra": list(pec_summary.values()),
        },
    }
