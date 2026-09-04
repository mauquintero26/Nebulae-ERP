"""
Módulo de Logística y Tránsito - Fase 2 (Prompt Maestro).

Endpoints y lógica de negocio para:
1. Asignaciones M:N de Compras (PEC <-> PVEN / Stock Nebulae / Mau).
2. Paquetes y Envíos (Shipments) con tracking individual y eventos.
3. Consolidaciones internacionales de carga y prorrateo de flete.
4. Motor de alertas de tránsito en tiempo real.
"""
import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
from app.models.erp_documents import PurchaseOrderFull, SaleOrder, ActivityLog
from app.models.fase1b import PurchaseOrderLine, SaleOrderLineErp, ProcurementAllocation
from app.models.fase2 import (
    LogisticsLocation,
    Consolidation,
    Shipment,
    ShipmentLine,
    ShipmentEvent,
    ConsolidationShipment,
)
from app.api.v1.schemas_fase2 import (
    ProcurementAllocationCreate,
    ProcurementAllocationOut,
    ShipmentCreate,
    ShipmentEventCreate,
    ShipmentOut,
    ConsolidationCreate,
    ConsolidationAddShipments,
    ConsolidationCostAllocation,
    ConsolidationStatusUpdate,
    ConsolidationOut,
    TransitAlert,
)

router = APIRouter()


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _to_utc(dt: Optional[datetime.datetime]) -> datetime.datetime:
    if dt is None:
        return datetime.datetime.now(datetime.timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(datetime.timezone.utc)


def _gen_shipment_number(db: Session) -> str:
    year = datetime.datetime.now().year
    count = db.query(func.count(Shipment.id)).scalar() or 0
    return f"SHP-{year}{str(count + 1).zfill(4)}"


def _gen_consolidation_number(db: Session) -> str:
    year = datetime.datetime.now().year
    count = db.query(func.count(Consolidation.id)).scalar() or 0
    return f"CON-{year}{str(count + 1).zfill(4)}"


# ─────────────────────────────────────────────────────────────────────────────
# 1. ASIGNACIONES M:N (PEC <-> PVEN)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/pedidos/{pec_id}/asignaciones",
    response_model=Dict[str, Any],
    summary="Crear o actualizar asignaciones para un Pedido de Compra (M:N)",
)
def set_pec_asignaciones(
    pec_id: int,
    payload: ProcurementAllocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS))),
):
    pec = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec_id).first()
    if not pec:
        raise HTTPException(status_code=404, detail="Pedido de compra no encontrado")

    # Validar que po_lines pertenezcan al PEC
    pec_lines = {l.id: l for l in db.query(PurchaseOrderLine).filter(PurchaseOrderLine.pec_id == pec_id).all()}
    if not pec_lines:
        raise HTTPException(status_code=422, detail="El pedido de compra no tiene líneas normalizadas registradas")

    # Acumulador para validar sum(quantity_allocated) <= quantity_ordered por línea
    allocated_by_line: Dict[int, Decimal] = {}

    for item in payload.allocations:
        if item.po_line_id not in pec_lines:
            raise HTTPException(
                status_code=422,
                detail=f"La línea po_line_id={item.po_line_id} no pertenece a la orden PEC #{pec.numero}",
            )

        # Regla: CUSTOMER_ORDER requiere sale_order_line_id válido
        if item.allocation_type == "CUSTOMER_ORDER":
            if not item.sale_order_line_id:
                raise HTTPException(
                    status_code=422,
                    detail="allocation_type='CUSTOMER_ORDER' requiere sale_order_line_id obligatorio",
                )
            sol = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.id == item.sale_order_line_id).first()
            if not sol:
                raise HTTPException(
                    status_code=422,
                    detail=f"Línea de pedido de venta sale_order_line_id={item.sale_order_line_id} no existe",
                )

        qty_dec = Decimal(str(item.quantity_allocated))
        allocated_by_line[item.po_line_id] = allocated_by_line.get(item.po_line_id, Decimal("0")) + qty_dec

    # Validar invariante de cantidad
    for line_id, total_alloc in allocated_by_line.items():
        ordered = Decimal(str(pec_lines[line_id].quantity_ordered))
        if total_alloc > ordered:
            raise HTTPException(
                status_code=422,
                detail=f"La asignación total ({total_alloc}) supera la cantidad ordenada ({ordered}) en línea {line_id}",
            )

    # Persistir asignaciones
    saved_allocations = []
    for item in payload.allocations:
        # Buscar si ya existe asignación para esta tupla (po_line_id, sale_order_line_id)
        existing = db.query(ProcurementAllocation).filter(
            ProcurementAllocation.po_line_id == item.po_line_id,
            ProcurementAllocation.sale_order_line_id == item.sale_order_line_id,
        ).first()

        if existing:
            existing.quantity_allocated = Decimal(str(item.quantity_allocated))
            existing.allocation_type = item.allocation_type
            saved_allocations.append(existing)
        else:
            new_alloc = ProcurementAllocation(
                po_line_id=item.po_line_id,
                allocation_type=item.allocation_type,
                sale_order_line_id=item.sale_order_line_id,
                quantity_allocated=Decimal(str(item.quantity_allocated)),
            )
            db.add(new_alloc)
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

    pec_summary = {}
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


# ─────────────────────────────────────────────────────────────────────────────
# 2. PAQUETES Y ENVÍOS (SHIPMENTS)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/shipments",
    response_model=Dict[str, Any],
    summary="Crear un nuevo paquete/envío con tracking",
)
def create_shipment(
    payload: ShipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS + ROLE_BODEGA))),
):
    shipment_num = _gen_shipment_number(db)

    # Validar PEC si se especifica
    pec = None
    if payload.pec_id:
        pec = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == payload.pec_id).first()
        if not pec:
            raise HTTPException(status_code=404, detail="Pedido de compra no encontrado")

    shipment = Shipment(
        shipment_number=shipment_num,
        pec_id=payload.pec_id,
        carrier=payload.carrier,
        tracking_number=payload.tracking_number.strip(),
        carrier_service=payload.carrier_service,
        origin=payload.origin or "PROVEEDOR",
        destination=payload.destination or "MIAMI",
        agency_id=payload.agency_id,
        estimated_delivery_date=payload.estimated_delivery_date,
        weight_lb=Decimal(str(payload.weight_lb)) if payload.weight_lb is not None else None,
        weight_kg=Decimal(str(payload.weight_kg)) if payload.weight_kg is not None else None,
        shipping_cost_usd=Decimal(str(payload.shipping_cost_usd)) if payload.shipping_cost_usd is not None else None,
        notes=payload.notes,
        status_fise="PREPARANDO_PROVEEDOR",
        commercial_status="EN_TRANSITO",
    )
    db.add(shipment)
    db.flush()

    # Agregar líneas si fueron especificadas
    if payload.lines:
        for l in payload.lines:
            po_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == l.po_line_id).first()
            if not po_line:
                raise HTTPException(status_code=422, detail=f"Línea de compra id={l.po_line_id} no existe")
            s_line = ShipmentLine(
                shipment_id=shipment.id,
                po_line_id=l.po_line_id,
                quantity=Decimal(str(l.quantity)),
            )
            db.add(s_line)

    # Evento inicial automático
    initial_event = ShipmentEvent(
        shipment_id=shipment.id,
        event_type="PREPARANDO_PROVEEDOR",
        location=payload.origin or "PROVEEDOR",
        user_name=current_user.email,
        notes="Paquete registrado en el sistema con transportador asignado",
    )
    db.add(initial_event)

    # Si hay tracking asignado, crear automáticamente hito ENVIADO_A_MIAMI
    if payload.tracking_number:
        send_event = ShipmentEvent(
            shipment_id=shipment.id,
            event_type="ENVIADO_A_MIAMI",
            location=payload.carrier,
            user_name=current_user.email,
            notes=f"Guía {payload.carrier} #{payload.tracking_number}",
        )
        db.add(send_event)
        shipment.status_fise = "ENVIADO_A_MIAMI"

    # Actualizar estado del PEC si aplica
    if pec:
        if pec.estado in ("BORRADOR", "COMPRA_REALIZADA", "CONFIRMADA", "CONFIRMACION_PARCIAL"):
            pec.estado = "ENVIADA"

    db.commit()
    db.refresh(shipment)

    return {
        "status": "success",
        "message": f"Paquete {shipment.shipment_number} creado con éxito",
        "data": {
            "id": shipment.id,
            "shipment_number": shipment.shipment_number,
            "tracking_number": shipment.tracking_number,
            "carrier": shipment.carrier,
            "status_fise": shipment.status_fise,
        },
    }


@router.get(
    "/shipments",
    response_model=Dict[str, Any],
    summary="Listar paquetes y envíos con filtros",
)
def list_shipments(
    pec_id: Optional[int] = Query(None),
    status_fise: Optional[str] = Query(None),
    carrier: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_ERP_ROLES)),
):
    q = db.query(Shipment)
    if pec_id:
        q = q.filter(Shipment.pec_id == pec_id)
    if status_fise:
        q = q.filter(Shipment.status_fise == status_fise)
    if carrier:
        q = q.filter(Shipment.carrier.ilike(f"%{carrier}%"))
    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                Shipment.shipment_number.ilike(term),
                Shipment.tracking_number.ilike(term),
                Shipment.carrier.ilike(term),
            )
        )

    total = q.count()
    shipments = q.order_by(desc(Shipment.id)).offset(offset).limit(limit).all()

    items = []
    for s in shipments:
        items.append({
            "id": s.id,
            "shipment_number": s.shipment_number,
            "pec_id": s.pec_id,
            "pec_numero": s.purchase_order.numero if s.purchase_order else None,
            "carrier": s.carrier,
            "tracking_number": s.tracking_number,
            "carrier_service": s.carrier_service,
            "status_fise": s.status_fise,
            "commercial_status": s.commercial_status,
            "origin": s.origin,
            "destination": s.destination,
            "estimated_delivery_date": s.estimated_delivery_date.isoformat() if s.estimated_delivery_date else None,
            "actual_delivery_date": s.actual_delivery_date.isoformat() if s.actual_delivery_date else None,
            "weight_lb": float(s.weight_lb) if s.weight_lb is not None else None,
            "weight_kg": float(s.weight_kg) if s.weight_kg is not None else None,
            "lines_count": len(s.lines),
            "events_count": len(s.events),
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    return {
        "status": "success",
        "data": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "shipments": items,
        },
    }


@router.get(
    "/shipments/{id}",
    response_model=Dict[str, Any],
    summary="Detalle completo de un paquete, líneas y trazabilidad de eventos",
)
def get_shipment_detail(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_ERP_ROLES)),
):
    s = db.query(Shipment).filter(Shipment.id == id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Paquete no encontrado")

    lines_data = []
    for l in s.lines:
        lines_data.append({
            "id": l.id,
            "po_line_id": l.po_line_id,
            "description": l.po_line.description if l.po_line else None,
            "quantity": float(l.quantity),
        })

    events_data = []
    for e in s.events:
        events_data.append({
            "id": e.id,
            "event_type": e.event_type,
            "location": e.location,
            "user_name": e.user_name,
            "notes": e.notes,
            "evidence_url": e.evidence_url,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
        })

    consolidations = [
        {
            "id": cs.consolidation.id,
            "consolidation_number": cs.consolidation.consolidation_number,
            "carrier": cs.consolidation.carrier,
            "tracking_international": cs.consolidation.tracking_international,
            "status": cs.consolidation.status,
            "cost_allocation_usd": float(cs.cost_allocation_usd),
        }
        for cs in s.consolidation_associations
        if cs.consolidation
    ]

    return {
        "status": "success",
        "data": {
            "id": s.id,
            "shipment_number": s.shipment_number,
            "pec_id": s.pec_id,
            "pec_numero": s.purchase_order.numero if s.purchase_order else None,
            "carrier": s.carrier,
            "tracking_number": s.tracking_number,
            "carrier_service": s.carrier_service,
            "origin": s.origin,
            "destination": s.destination,
            "status_fise": s.status_fise,
            "commercial_status": s.commercial_status,
            "agency_id": s.agency_id,
            "estimated_delivery_date": s.estimated_delivery_date.isoformat() if s.estimated_delivery_date else None,
            "actual_delivery_date": s.actual_delivery_date.isoformat() if s.actual_delivery_date else None,
            "weight_lb": float(s.weight_lb) if s.weight_lb is not None else None,
            "weight_kg": float(s.weight_kg) if s.weight_kg is not None else None,
            "shipping_cost_usd": float(s.shipping_cost_usd) if s.shipping_cost_usd is not None else None,
            "notes": s.notes,
            "lines": lines_data,
            "events": events_data,
            "consolidaciones": consolidations,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        },
    }


@router.post(
    "/shipments/{id}/eventos",
    response_model=Dict[str, Any],
    summary="Registrar un nuevo evento o hito logístico en la línea de tiempo del paquete",
)
def add_shipment_event(
    id: int,
    payload: ShipmentEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS + ROLE_BODEGA))),
):
    s = db.query(Shipment).filter(Shipment.id == id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Paquete no encontrado")

    valid_events = {
        "PREPARANDO_PROVEEDOR",
        "ENVIADO_A_MIAMI",
        "RECIBIDO_MIAMI",
        "PENDIENTE_CONSOLIDACION",
        "CONSOLIDADO",
        "EN_VUELO",
        "EN_DIAN",
        "LIBERADO_DIAN",
        "RECIBIDO_BOGOTA",
        "ENVIADO_BARRANQUILLA",
        "RECIBIDO_BARRANQUILLA",
    }
    event_type = payload.event_type.upper().strip()
    if event_type not in valid_events:
        raise HTTPException(
            status_code=422,
            detail=f"event_type inválido. Debe ser uno de: {sorted(list(valid_events))}",
        )

    event = ShipmentEvent(
        shipment_id=s.id,
        event_type=event_type,
        location=payload.location,
        user_name=payload.user_name or current_user.email,
        notes=payload.notes,
        evidence_url=payload.evidence_url,
    )
    db.add(event)

    # Actualizar estado físico actual del paquete
    s.status_fise = event_type

    # Acciones automáticas según el evento
    if event_type == "RECIBIDO_BARRANQUILLA":
        s.actual_delivery_date = datetime.date.today()
        s.commercial_status = "EN_BARRANQUILLA"

    db.commit()
    db.refresh(event)

    return {
        "status": "success",
        "message": f"Evento '{event_type}' registrado exitosamente",
        "data": {
            "id": event.id,
            "shipment_id": event.shipment_id,
            "event_type": event.event_type,
            "timestamp": event.timestamp.isoformat(),
            "nuevo_status_fise": s.status_fise,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. CONSOLIDACIONES INTERNACIONALES (MIAMI -> COLOMBIA)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/consolidaciones",
    response_model=Dict[str, Any],
    summary="Crear una consolidación de carga internacional",
)
def create_consolidation(
    payload: ConsolidationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS))),
):
    con_number = _gen_consolidation_number(db)

    consolidation = Consolidation(
        consolidation_number=con_number,
        carrier=payload.carrier,
        tracking_international=payload.tracking_international,
        agency_name=payload.agency_name or "Miami Agency 1",
        origin=payload.origin or "MIAMI",
        destination=payload.destination or "BARRANQUILLA",
        trm=Decimal(str(payload.trm or 0)),
        total_freight_usd=Decimal(str(payload.total_freight_usd or 0)),
        total_freight_cop=Decimal(str(payload.total_freight_cop or 0)),
        notes=payload.notes,
        status="ABIERTA",
    )
    db.add(consolidation)
    db.flush()

    total_weight = Decimal("0")
    if payload.shipment_ids:
        shipments = db.query(Shipment).filter(Shipment.id.in_(payload.shipment_ids)).all()
        for shp in shipments:
            cs = ConsolidationShipment(
                consolidation_id=consolidation.id,
                shipment_id=shp.id,
            )
            db.add(cs)
            # Actualizar estado del paquete
            shp.status_fise = "CONSOLIDADO"
            # Registrar evento en el paquete
            ev = ShipmentEvent(
                shipment_id=shp.id,
                event_type="CONSOLIDADO",
                location=consolidation.agency_name,
                user_name=current_user.email,
                notes=f"Agrupado en Consolidación #{consolidation.consolidation_number}",
            )
            db.add(ev)
            if shp.weight_kg:
                total_weight += Decimal(str(shp.weight_kg))

    consolidation.total_weight_kg = total_weight
    db.commit()
    db.refresh(consolidation)

    return {
        "status": "success",
        "message": f"Consolidación {consolidation.consolidation_number} creada exitosamente",
        "data": {
            "id": consolidation.id,
            "consolidation_number": consolidation.consolidation_number,
            "carrier": consolidation.carrier,
            "tracking_international": consolidation.tracking_international,
            "status": consolidation.status,
            "total_weight_kg": float(consolidation.total_weight_kg),
            "shipments_count": len(payload.shipment_ids or []),
        },
    }


@router.get(
    "/consolidaciones",
    response_model=Dict[str, Any],
    summary="Listar consolidaciones de carga",
)
def list_consolidations(
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_ERP_ROLES)),
):
    q = db.query(Consolidation)
    if status:
        q = q.filter(Consolidation.status == status)

    total = q.count()
    consolidations = q.order_by(desc(Consolidation.id)).offset(offset).limit(limit).all()

    items = []
    for c in consolidations:
        items.append({
            "id": c.id,
            "consolidation_number": c.consolidation_number,
            "carrier": c.carrier,
            "tracking_international": c.tracking_international,
            "agency_name": c.agency_name,
            "origin": c.origin,
            "destination": c.destination,
            "total_weight_kg": float(c.total_weight_kg),
            "total_freight_usd": float(c.total_freight_usd),
            "total_freight_cop": float(c.total_freight_cop),
            "status": c.status,
            "shipments_count": len(c.shipment_associations),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    return {
        "status": "success",
        "data": {
            "total": total,
            "consolidaciones": items,
        },
    }


@router.get(
    "/consolidaciones/{id}",
    response_model=Dict[str, Any],
    summary="Detalle de consolidación con desglose de paquetes y costos",
)
def get_consolidation_detail(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_ERP_ROLES)),
):
    c = db.query(Consolidation).filter(Consolidation.id == id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Consolidación no encontrada")

    shipments_list = []
    for cs in c.shipment_associations:
        shp = cs.shipment
        if shp:
            shipments_list.append({
                "shipment_id": shp.id,
                "shipment_number": shp.shipment_number,
                "carrier": shp.carrier,
                "tracking_number": shp.tracking_number,
                "pec_numero": shp.purchase_order.numero if shp.purchase_order else None,
                "weight_kg": float(shp.weight_kg) if shp.weight_kg is not None else 0.0,
                "cost_allocation_usd": float(cs.cost_allocation_usd),
                "cost_allocation_cop": float(cs.cost_allocation_cop),
            })

    return {
        "status": "success",
        "data": {
            "id": c.id,
            "consolidation_number": c.consolidation_number,
            "carrier": c.carrier,
            "tracking_international": c.tracking_international,
            "agency_name": c.agency_name,
            "origin": c.origin,
            "destination": c.destination,
            "total_weight_kg": float(c.total_weight_kg),
            "total_volume_cbm": float(c.total_volume_cbm),
            "total_freight_usd": float(c.total_freight_usd),
            "total_freight_cop": float(c.total_freight_cop),
            "trm": float(c.trm),
            "status": c.status,
            "departure_date": c.departure_date.isoformat() if c.departure_date else None,
            "estimated_arrival_date": c.estimated_arrival_date.isoformat() if c.estimated_arrival_date else None,
            "paquetes": shipments_list,
        },
    }


@router.post(
    "/consolidaciones/{id}/repartir-costos",
    response_model=Dict[str, Any],
    summary="Prorratear costo del flete internacional entre los paquetes contenidos",
)
def allocate_consolidation_costs(
    id: int,
    payload: ConsolidationCostAllocation,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS))),
):
    c = db.query(Consolidation).filter(Consolidation.id == id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Consolidación no encontrada")

    if payload.total_freight_usd is not None:
        c.total_freight_usd = Decimal(str(payload.total_freight_usd))
    if payload.trm is not None:
        c.trm = Decimal(str(payload.trm))
    c.total_freight_cop = c.total_freight_usd * c.trm

    associations = c.shipment_associations
    if not associations:
        raise HTTPException(status_code=422, detail="La consolidación no contiene paquetes para repartir costos")

    method = payload.allocation_method.upper()
    total_freight = c.total_freight_usd

    if method == "WEIGHT":
        total_weight = sum(
            Decimal(str(cs.shipment.weight_kg or 1))
            for cs in associations
            if cs.shipment
        ) or Decimal("1")

        for cs in associations:
            shp_weight = Decimal(str(cs.shipment.weight_kg or 1)) if cs.shipment else Decimal("1")
            share = shp_weight / total_weight
            cs.cost_allocation_usd = total_freight * share
            cs.cost_allocation_cop = cs.cost_allocation_usd * c.trm
    else:
        # Por partes iguales (EQUAL)
        count = Decimal(str(len(associations)))
        share_usd = total_freight / count
        for cs in associations:
            cs.cost_allocation_usd = share_usd
            cs.cost_allocation_cop = share_usd * c.trm

    db.commit()

    return {
        "status": "success",
        "message": f"Flete de ${float(total_freight)} USD prorrateado entre {len(associations)} paquetes vía método {method}",
        "data": {
            "consolidation_id": c.id,
            "total_freight_usd": float(c.total_freight_usd),
            "total_freight_cop": float(c.total_freight_cop),
            "reparto": [
                {
                    "shipment_id": cs.shipment_id,
                    "cost_allocation_usd": float(cs.cost_allocation_usd),
                    "cost_allocation_cop": float(cs.cost_allocation_cop),
                }
                for cs in associations
            ],
        },
    }


@router.post(
    "/consolidaciones/{id}/shipments",
    response_model=Dict[str, Any],
    summary="Agregar paquetes a una consolidación existente",
)
def add_shipments_to_consolidation(
    id: int,
    payload: ConsolidationAddShipments,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS))),
):
    c = db.query(Consolidation).filter(Consolidation.id == id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Consolidación no encontrada")
    if c.status in ("CERRADA", "RECIBIDA_DESTINO"):
        raise HTTPException(status_code=422, detail="No se pueden agregar paquetes a una consolidación cerrada o recibida")

    existing_shipment_ids = {cs.shipment_id for cs in c.shipment_associations}
    added_count = 0

    for sid in payload.shipment_ids:
        if sid in existing_shipment_ids:
            continue
        shp = db.query(Shipment).filter(Shipment.id == sid).first()
        if not shp:
            raise HTTPException(status_code=404, detail=f"Paquete id={sid} no encontrado")

        cs = ConsolidationShipment(
            consolidation_id=c.id,
            shipment_id=shp.id,
        )
        db.add(cs)
        shp.status_fise = "CONSOLIDADO"
        ev = ShipmentEvent(
            shipment_id=shp.id,
            event_type="CONSOLIDADO",
            location=c.agency_name or "MIAMI",
            user_name=current_user.email,
            notes=f"Agrupado en Consolidación #{c.consolidation_number}",
        )
        db.add(ev)
        if shp.weight_kg:
            c.total_weight_kg = (c.total_weight_kg or Decimal("0")) + Decimal(str(shp.weight_kg))
        added_count += 1

    db.commit()
    db.refresh(c)

    return {
        "status": "success",
        "message": f"Se agregaron {added_count} paquetes a la consolidación #{c.consolidation_number}",
        "data": {
            "consolidation_id": c.id,
            "consolidation_number": c.consolidation_number,
            "total_weight_kg": float(c.total_weight_kg),
            "shipments_count": len(c.shipment_associations),
        },
    }


@router.patch(
    "/consolidaciones/{id}/estado",
    response_model=Dict[str, Any],
    summary="Actualizar estado de una consolidación y propagar hitos a sus paquetes",
)
def update_consolidation_status(
    id: int,
    payload: ConsolidationStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS + ROLE_BODEGA))),
):
    c = db.query(Consolidation).filter(Consolidation.id == id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Consolidación no encontrada")

    valid_statuses = {
        "ABIERTA", "CONSOLIDADA", "EN_VUELO", "EN_DIAN", "LIBERADA", "RECIBIDA_DESTINO", "CERRADA"
    }
    new_status = payload.status.upper().strip()
    if new_status not in valid_statuses:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Debe ser uno de: {sorted(list(valid_statuses))}")

    c.status = new_status
    if payload.notes:
        c.notes = (c.notes or "") + f"\n[{datetime.date.today().isoformat()}] {payload.notes}"

    if new_status == "EN_VUELO" and not c.departure_date:
        c.departure_date = _now()
    elif new_status == "RECIBIDA_DESTINO" and not c.actual_arrival_date:
        c.actual_arrival_date = _now()

    status_to_event = {
        "CONSOLIDADA": "CONSOLIDADO",
        "EN_VUELO": "EN_VUELO",
        "EN_DIAN": "EN_DIAN",
        "LIBERADA": "LIBERADO_DIAN",
        "RECIBIDA_DESTINO": "RECIBIDO_BARRANQUILLA",
    }

    mapped_event = status_to_event.get(new_status)
    if mapped_event:
        for cs in c.shipment_associations:
            shp = cs.shipment
            if shp:
                shp.status_fise = mapped_event
                if mapped_event == "RECIBIDO_BARRANQUILLA":
                    shp.actual_delivery_date = datetime.date.today()
                    shp.commercial_status = "EN_BARRANQUILLA"
                ev = ShipmentEvent(
                    shipment_id=shp.id,
                    event_type=mapped_event,
                    location=c.carrier or c.destination,
                    user_name=current_user.email,
                    notes=f"Actualización por cambio de estado en Consolidación #{c.consolidation_number}: {new_status}",
                )
                db.add(ev)

    db.commit()
    db.refresh(c)

    return {
        "status": "success",
        "message": f"Consolidación #{c.consolidation_number} actualizada a estado {c.status}",
        "data": {
            "id": c.id,
            "consolidation_number": c.consolidation_number,
            "status": c.status,
            "departure_date": c.departure_date.isoformat() if c.departure_date else None,
            "actual_arrival_date": c.actual_arrival_date.isoformat() if c.actual_arrival_date else None,
            "shipments_count": len(c.shipment_associations),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# UBICACIONES Y AGENCIAS LOGÍSTICAS (LogisticsLocation)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/locations",
    response_model=Dict[str, Any],
    summary="Listar ubicaciones y agencias logísticas",
)
def list_logistics_locations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_ERP_ROLES)),
):
    locs = db.query(LogisticsLocation).filter(LogisticsLocation.is_active == True).all()
    return {
        "status": "success",
        "data": [
            {
                "id": l.id,
                "code": l.code,
                "name": l.name,
                "location_type": l.location_type,
                "city": l.city,
                "country": l.country,
                "address": l.address,
                "contact_phone": l.contact_phone,
            }
            for l in locs
        ],
    }


@router.post(
    "/locations",
    response_model=Dict[str, Any],
    summary="Registrar una nueva agencia o ubicación logística",
)
def create_logistics_location(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS))),
):
    code = str(payload.get("code", "")).strip().upper()
    name = str(payload.get("name", "")).strip()
    loc_type = str(payload.get("location_type", "")).strip().upper()

    if not code or not name or not loc_type:
        raise HTTPException(status_code=422, detail="code, name y location_type son campos obligatorios")

    existing = db.query(LogisticsLocation).filter(LogisticsLocation.code == code).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Ya existe una ubicación con código {code}")

    loc = LogisticsLocation(
        code=code,
        name=name,
        location_type=loc_type,
        city=payload.get("city"),
        country=payload.get("country", "USA"),
        address=payload.get("address"),
        contact_phone=payload.get("contact_phone"),
        is_active=True,
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)

    return {
        "status": "success",
        "message": f"Ubicación logística {loc.code} creada con éxito",
        "data": {
            "id": loc.id,
            "code": loc.code,
            "name": loc.name,
            "location_type": loc.location_type,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. MOTOR DE ALERTAS DE TRÁNSITO
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/alertas-transito",
    response_model=Dict[str, Any],
    summary="Motor de alertas operativas de compras y tránsito en tiempo real",
)
def get_transit_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_ERP_ROLES)),
):
    now = datetime.datetime.now(datetime.timezone.utc)
    today = datetime.date.today()
    alerts: List[Dict[str, Any]] = []

    # 1. TRACKING_PENDIENTE: PECs confirmadas > 3 días sin tracking
    cutoff_pec = now - datetime.timedelta(days=3)
    pecs_sin_tracking = (
        db.query(PurchaseOrderFull)
        .filter(
            PurchaseOrderFull.estado.in_(["CONFIRMADA", "COMPRA_REALIZADA"]),
            PurchaseOrderFull.created_at <= cutoff_pec,
            or_(
                PurchaseOrderFull.tracking_number == None,
                PurchaseOrderFull.tracking_number == "",
            ),
        )
        .all()
    )
    for p in pecs_sin_tracking:
        # Validar si ya tiene un Shipment registrado
        has_shipment = db.query(Shipment).filter(Shipment.pec_id == p.id).first()
        if not has_shipment:
            days = (now - _to_utc(p.created_at)).days
            alerts.append({
                "alert_type": "TRACKING_PENDIENTE",
                "severity": "ALTA" if days > 5 else "MEDIA",
                "document_type": "PEC",
                "document_id": p.id,
                "document_reference": p.numero,
                "message": f"Orden {p.numero} confirmada hace {days} días sin número de guía o tracking asignado",
                "days_delay": days,
                "suggested_action": "Contactar al proveedor para solicitar el tracking de despacho",
            })

    # 2. ENTREGA_VENCIDA: Shipments con fecha estimada vencida y no entregados
    overdue_shipments = (
        db.query(Shipment)
        .filter(
            Shipment.estimated_delivery_date != None,
            Shipment.estimated_delivery_date < today,
            Shipment.status_fise.notin_(["RECIBIDO_BARRANQUILLA", "RECIBIDO_MIAMI"]),
        )
        .all()
    )
    for shp in overdue_shipments:
        days = (today - shp.estimated_delivery_date).days
        alerts.append({
            "alert_type": "ENTREGA_VENCIDA",
            "severity": "CRITICA" if days > 4 else "ALTA",
            "document_type": "SHIPMENT",
            "document_id": shp.id,
            "document_reference": f"{shp.shipment_number} ({shp.carrier} #{shp.tracking_number})",
            "message": f"Envío {shp.shipment_number} venció fecha estimada hace {days} días (Estado: {shp.status_fise})",
            "days_delay": days,
            "suggested_action": "Rastrear guía en el portal del transportador o abrir reclamo de entrega",
        })

    # 3. PENDIENTE_CONSOLIDACION: Paquetes en Miami > 5 días sin consolidar
    cutoff_miami = now - datetime.timedelta(days=5)
    miami_events = (
        db.query(ShipmentEvent)
        .filter(
            ShipmentEvent.event_type == "RECIBIDO_MIAMI",
            ShipmentEvent.timestamp <= cutoff_miami,
        )
        .all()
    )
    for ev in miami_events:
        shp = ev.shipment
        if shp and shp.status_fise in ("RECIBIDO_MIAMI", "PENDIENTE_CONSOLIDACION"):
            # Verificar si ya está en alguna consolidación
            in_consolidation = len(shp.consolidation_associations) > 0
            if not in_consolidation:
                days = (now - _to_utc(ev.timestamp)).days
                alerts.append({
                    "alert_type": "PENDIENTE_CONSOLIDACION",
                    "severity": "MEDIA",
                    "document_type": "SHIPMENT",
                    "document_id": shp.id,
                    "document_reference": shp.shipment_number,
                    "message": f"Paquete en Miami hace {days} días sin incluir en una consolidación internacional",
                    "days_delay": days,
                    "suggested_action": "Agrupar en la próxima caja internacional de despacho",
                })

    # 4. DIAN_DEMORADO: Consolidaciones en aduana > 3 días hábiles
    cutoff_dian = now - datetime.timedelta(days=3)
    dian_consolidations = (
        db.query(Consolidation)
        .filter(
            Consolidation.status == "EN_DIAN",
            Consolidation.updated_at <= cutoff_dian,
        )
        .all()
    )
    for c in dian_consolidations:
        days = (now - _to_utc(c.updated_at)).days
        alerts.append({
            "alert_type": "DIAN_DEMORADO",
            "severity": "ALTA",
            "document_type": "CONSOLIDATION",
            "document_id": c.id,
            "document_reference": c.consolidation_number,
            "message": f"Consolidación {c.consolidation_number} lleva {days} días retenida en proceso aduanero DIAN",
            "days_delay": days,
            "suggested_action": "Verificar con el agente de aduanas pagos de arancel o requerimientos documentales",
        })

    return {
        "status": "success",
        "data": {
            "total_alertas": len(alerts),
            "alertas": alerts,
        },
    }
