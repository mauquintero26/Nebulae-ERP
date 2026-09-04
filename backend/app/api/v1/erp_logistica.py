"""
Módulo de Logística y Tránsito - Fase 2 (Prompt Maestro).
Endurecimiento de trazabilidad, integridad relacional, máquina de estados finitos,
consolidaciones con membresía única, prorrateo determinista y alertas de días hábiles.

Endpoints:
1. Paquetes y Envíos (Shipments) con tracking individual y eventos secuenciales.
2. Consolidaciones internacionales de carga, pertenencia única y reparto exacto de flete.
3. Ubicaciones y agencias logísticas intermedias.
4. Motor de alertas de tránsito en tiempo real (días hábiles America/Bogota).
"""
import datetime
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, desc, text
from sqlalchemy.exc import IntegrityError

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
from app.models.erp_documents import PurchaseOrderFull
from app.models.fase1b import PurchaseOrderLine
from app.models.fase2 import (
    LogisticsLocation,
    Consolidation,
    Shipment,
    ShipmentLine,
    ShipmentEvent,
    ConsolidationShipment,
)
from app.api.v1.schemas_fase2 import (
    ShipmentCreate,
    ShipmentEventCreate,
    ShipmentOut,
    ConsolidationCreate,
    ConsolidationAddShipments,
    ConsolidationCostAllocation,
    ConsolidationStatusUpdate,
    ConsolidationUpdate,
    ConsolidationOut,
    TransitAlert,
)

router = APIRouter()

BOGOTA_TZ = ZoneInfo("America/Bogota")


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
    try:
        seq_val = db.execute(text("SELECT nextval('shipment_number_seq')")).scalar()
    except Exception:
        count = db.query(func.count(Shipment.id)).scalar() or 0
        seq_val = count + 1
    return f"SHP-{year}{str(seq_val).zfill(4)}"


def _gen_consolidation_number(db: Session) -> str:
    year = datetime.datetime.now().year
    try:
        seq_val = db.execute(text("SELECT nextval('consolidation_number_seq')")).scalar()
    except Exception:
        count = db.query(func.count(Consolidation.id)).scalar() or 0
        seq_val = count + 1
    return f"CON-{year}{str(seq_val).zfill(4)}"


def _calculate_business_days(start_dt: datetime.datetime, end_dt: datetime.datetime) -> int:
    """
    Calcula el número de días hábiles (lunes a viernes) entre dos fechas.
    Utiliza la zona horaria empresarial America/Bogota.
    """
    start_local = start_dt.astimezone(BOGOTA_TZ).date()
    end_local = end_dt.astimezone(BOGOTA_TZ).date()

    if end_local <= start_local:
        return 0

    business_days = 0
    curr = start_local + datetime.timedelta(days=1)
    while curr <= end_local:
        if curr.weekday() < 5:  # 0=Monday, ..., 4=Friday
            business_days += 1
        curr += datetime.timedelta(days=1)

    return business_days


# Grafos canónicos de transiciones permitidas
ALLOWED_TRANSITIONS_MIAMI: Dict[str, set] = {
    "PREPARANDO_PROVEEDOR": {"ENVIADO_A_MIAMI"},
    "ENVIADO_A_MIAMI": {"RECIBIDO_MIAMI"},
    "RECIBIDO_MIAMI": {"PENDIENTE_CONSOLIDACION", "CONSOLIDADO"},
    "PENDIENTE_CONSOLIDACION": {"CONSOLIDADO"},
    "CONSOLIDADO": {"EN_VUELO"},
    "EN_VUELO": {"EN_DIAN"},
    "EN_DIAN": {"LIBERADO_DIAN"},
    "LIBERADO_DIAN": {"RECIBIDO_BOGOTA", "RECIBIDO_BARRANQUILLA"},
    "RECIBIDO_BOGOTA": {"ENVIADO_BARRANQUILLA", "RECIBIDO_BARRANQUILLA"},
    "ENVIADO_BARRANQUILLA": {"RECIBIDO_BARRANQUILLA"},
    "RECIBIDO_BARRANQUILLA": set(),  # Terminal
}

ALLOWED_TRANSITIONS_DIRECT: Dict[str, set] = {
    "PREPARANDO_PROVEEDOR": {"EN_VUELO"},
    "EN_VUELO": {"EN_DIAN"},
    "EN_DIAN": {"LIBERADO_DIAN"},
    "LIBERADO_DIAN": {"RECIBIDO_BOGOTA", "RECIBIDO_BARRANQUILLA"},
    "RECIBIDO_BOGOTA": {"ENVIADO_BARRANQUILLA", "RECIBIDO_BARRANQUILLA"},
    "ENVIADO_BARRANQUILLA": {"RECIBIDO_BARRANQUILLA"},
    "RECIBIDO_BARRANQUILLA": set(),  # Terminal
}

ALLOWED_TRANSITIONS: Dict[str, set] = {
    "PREPARANDO_PROVEEDOR": {"ENVIADO_A_MIAMI", "EN_VUELO"},
    "ENVIADO_A_MIAMI": {"RECIBIDO_MIAMI"},
    "RECIBIDO_MIAMI": {"PENDIENTE_CONSOLIDACION", "CONSOLIDADO"},
    "PENDIENTE_CONSOLIDACION": {"CONSOLIDADO"},
    "CONSOLIDADO": {"EN_VUELO"},
    "EN_VUELO": {"EN_DIAN"},
    "EN_DIAN": {"LIBERADO_DIAN"},
    "LIBERADO_DIAN": {"RECIBIDO_BOGOTA", "RECIBIDO_BARRANQUILLA"},
    "RECIBIDO_BOGOTA": {"ENVIADO_BARRANQUILLA", "RECIBIDO_BARRANQUILLA"},
    "ENVIADO_BARRANQUILLA": {"RECIBIDO_BARRANQUILLA"},
    "RECIBIDO_BARRANQUILLA": set(),  # Terminal
}

CONSOLIDATION_ALLOWED_TRANSITIONS: Dict[str, set] = {
    "ABIERTA": {"CONSOLIDADA"},
    "CONSOLIDADA": {"EN_VUELO"},
    "EN_VUELO": {"EN_DIAN"},
    "EN_DIAN": {"LIBERADA"},
    "LIBERADA": {"RECIBIDA_DESTINO"},
    "RECIBIDA_DESTINO": {"CERRADA"},
    "CERRADA": set(),  # Terminal
}


def _is_shipment_compatible(existing: Shipment, p_pec_id: Optional[int], p_lines: Optional[List[Any]]) -> bool:
    """Verifica si un paquete existente es semánticamente compatible con una nueva solicitud de creación."""
    if existing.pec_id != p_pec_id:
        return False
    if p_lines:
        existing_lines_map = {l.po_line_id: Decimal(str(l.quantity)) for l in existing.lines}
        payload_lines_map = {l.po_line_id: Decimal(str(l.quantity)) for l in p_lines}
        if existing_lines_map != payload_lines_map:
            return False
    return True


# ─────────────────────────────────────────────────────────────────────────────
# 1. PAQUETES Y ENVÍOS (SHIPMENTS)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/shipments",
    response_model=Dict[str, Any],
    summary="Crear un nuevo paquete/envío con tracking e integridad de líneas",
)
def create_shipment(
    payload: ShipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS + ROLE_BODEGA))),
):
    """
    Crea un paquete independiente con tracking.
    Valida:
    - Normalización de carrier y tracking (lower/trim y upper/trim).
    - Idempotencia con compatibilidad semántica (pec_id, líneas) o HTTP 409 Conflict si difiere.
    - Validación de ruta (VIA_MIAMI o DIRECT_TO_BARRANQUILLA).
    - Validación de agencia/ubicación logística (existente, activa y coherente con la ruta).
    - Bloqueo de PurchaseOrderLine con SELECT FOR UPDATE.
    - Acumulado despachado <= quantity_ordered.
    - Manejo seguro de carreras de concurrencia e IntegrityError en base de datos.
    """
    clean_carrier = payload.carrier.strip()
    clean_tracking = payload.tracking_number.strip()

    # Validar route_type
    route_type = (payload.route_type or "VIA_MIAMI").upper().strip()
    if route_type not in ("VIA_MIAMI", "DIRECT_TO_BARRANQUILLA"):
        raise HTTPException(
            status_code=422,
            detail=f"route_type inválido '{route_type}'. Debe ser VIA_MIAMI o DIRECT_TO_BARRANQUILLA",
        )

    # Validar ubicación logística / agencia
    loc = None
    if payload.logistics_location_id:
        loc = db.query(LogisticsLocation).filter(LogisticsLocation.id == payload.logistics_location_id).first()
        if not loc:
            raise HTTPException(status_code=422, detail=f"Ubicación logística id={payload.logistics_location_id} no encontrada")
    elif payload.agency_id:
        agency_str = str(payload.agency_id).strip()
        if agency_str.isdigit():
            loc = db.query(LogisticsLocation).filter(LogisticsLocation.id == int(agency_str)).first()
        if not loc:
            loc = db.query(LogisticsLocation).filter(func.lower(LogisticsLocation.code) == agency_str.lower()).first()
        if not loc:
            raise HTTPException(status_code=422, detail=f"Ubicación o agencia logística '{payload.agency_id}' no encontrada")

    if loc:
        if not loc.is_active:
            raise HTTPException(status_code=422, detail=f"La ubicación logística '{loc.name}' no está activa")
        is_miami = (
            loc.location_type in ("AGENCY_MIAMI", "MIAMI_AGENCY", "MIAMI_HUB", "AGENCY_USA")
            or (loc.city and loc.city.upper() == "MIAMI")
            or loc.code in ("MIA_AGENCY_1", "MIA_AGENCY_2")
        )
        if route_type == "DIRECT_TO_BARRANQUILLA" and is_miami:
            raise HTTPException(
                status_code=422,
                detail=f"La ubicación '{loc.name}' es de Miami y no es compatible con la ruta directa DIRECT_TO_BARRANQUILLA",
            )
        if route_type == "VIA_MIAMI" and loc.code == "AMAZON_DIRECT":
            raise HTTPException(
                status_code=422,
                detail=f"La ubicación '{loc.name}' no es compatible con la ruta VIA_MIAMI",
            )

    # Idempotencia: Verificar si ya existe un paquete con este transportador y tracking
    existing_shp = (
        db.query(Shipment)
        .filter(
            func.lower(func.trim(Shipment.carrier)) == clean_carrier.lower(),
            func.upper(func.trim(Shipment.tracking_number)) == clean_tracking.upper(),
        )
        .first()
    )
    if existing_shp:
        if _is_shipment_compatible(existing_shp, payload.pec_id, payload.lines):
            return {
                "status": "success",
                "message": f"Paquete existente recuperado de forma idempotente ({existing_shp.shipment_number})",
                "data": {
                    "id": existing_shp.id,
                    "shipment_number": existing_shp.shipment_number,
                    "tracking_number": existing_shp.tracking_number,
                    "carrier": existing_shp.carrier,
                    "status_fise": existing_shp.status_fise,
                    "route_type": existing_shp.route_type,
                },
            }
        else:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Conflicto de identidad: ya existe un paquete con carrier='{existing_shp.carrier}' "
                    f"y tracking='{existing_shp.tracking_number}' ({existing_shp.shipment_number}), "
                    f"pero los datos del envío son incompatibles con la solicitud (diferente PEC o líneas)."
                ),
            )

    # Validar PEC si se especifica
    pec = None
    if payload.pec_id:
        pec = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == payload.pec_id).first()
        if not pec:
            raise HTTPException(status_code=404, detail="Pedido de compra no encontrado")

    # Validar líneas del paquete si se envían
    if payload.lines:
        line_po_ids = [l.po_line_id for l in payload.lines]
        if len(line_po_ids) != len(set(line_po_ids)):
            raise HTTPException(
                status_code=422,
                detail="Líneas duplicadas detectadas en el payload: cada po_line_id debe aparecer a lo sumo una vez por paquete",
            )

        # Bloquear las líneas de compra con SELECT FOR UPDATE
        locked_lines = (
            db.query(PurchaseOrderLine)
            .filter(PurchaseOrderLine.id.in_(line_po_ids))
            .with_for_update()
            .all()
        )
        po_lines_map = {l.id: l for l in locked_lines}

        for l in payload.lines:
            po_line = po_lines_map.get(l.po_line_id)
            if not po_line:
                raise HTTPException(status_code=422, detail=f"Línea de compra id={l.po_line_id} no existe")

            if payload.pec_id and po_line.pec_id != payload.pec_id:
                raise HTTPException(
                    status_code=422,
                    detail=f"La línea po_line_id={l.po_line_id} no pertenece a la orden PEC #{pec.numero}",
                )

            req_qty = Decimal(str(l.quantity))
            if req_qty <= Decimal("0"):
                raise HTTPException(status_code=422, detail=f"La cantidad para po_line_id={l.po_line_id} debe ser mayor a 0")

            # Sumar lo despachado en paquetes activos
            dispatched_query = (
                db.query(func.coalesce(func.sum(ShipmentLine.quantity), Decimal("0")))
                .join(Shipment, ShipmentLine.shipment_id == Shipment.id)
                .filter(
                    ShipmentLine.po_line_id == l.po_line_id,
                    Shipment.status_fise != "CANCELADO",
                )
            )
            already_dispatched = Decimal(str(dispatched_query.scalar() or Decimal("0")))
            ordered = Decimal(str(po_line.quantity_ordered))

            if already_dispatched + req_qty > ordered:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Exceso de cantidad: la cantidad acumulada despachada ({already_dispatched + req_qty}) "
                        f"superaría la cantidad ordenada ({ordered}) para la línea {po_line.id}"
                    ),
                )

    # Validar pesos, volumen y costos
    w_lb = Decimal(str(payload.weight_lb)) if payload.weight_lb is not None else None
    w_kg = Decimal(str(payload.weight_kg)) if payload.weight_kg is not None else None
    v_cbm = Decimal(str(payload.volume_cbm)) if payload.volume_cbm is not None else None
    cost_usd = Decimal(str(payload.shipping_cost_usd)) if payload.shipping_cost_usd is not None else None

    if w_lb is not None and w_lb < Decimal("0"):
        raise HTTPException(status_code=422, detail="El peso en libras no puede ser negativo")
    if w_kg is not None and w_kg < Decimal("0"):
        raise HTTPException(status_code=422, detail="El peso en kg no puede ser negativo")
    if v_cbm is not None and v_cbm < Decimal("0"):
        raise HTTPException(status_code=422, detail="El volumen en cbm no puede ser negativo")
    if cost_usd is not None and cost_usd < Decimal("0"):
        raise HTTPException(status_code=422, detail="El costo de envío no puede ser negativo")

    dest = payload.destination or ("MIAMI" if route_type == "VIA_MIAMI" else "BARRANQUILLA")

    shipment_num = _gen_shipment_number(db)
    shipment = Shipment(
        shipment_number=shipment_num,
        pec_id=payload.pec_id,
        carrier=clean_carrier,
        tracking_number=clean_tracking,
        carrier_service=payload.carrier_service,
        route_type=route_type,
        origin=payload.origin or "PROVEEDOR",
        destination=dest,
        agency_id=loc.code if loc else payload.agency_id,
        logistics_location_id=loc.id if loc else None,
        estimated_delivery_date=payload.estimated_delivery_date,
        weight_lb=w_lb,
        weight_kg=w_kg,
        volume_cbm=v_cbm,
        shipping_cost_usd=cost_usd,
        notes=payload.notes,
        status_fise="PREPARANDO_PROVEEDOR",
        commercial_status="EN_TRANSITO",
    )
    db.add(shipment)
    db.flush()

    if payload.lines:
        for l in payload.lines:
            s_line = ShipmentLine(
                shipment_id=shipment.id,
                po_line_id=l.po_line_id,
                quantity=Decimal(str(l.quantity)),
            )
            db.add(s_line)

    # Evento inicial
    initial_event = ShipmentEvent(
        shipment_id=shipment.id,
        event_type="PREPARANDO_PROVEEDOR",
        location=payload.origin or "PROVEEDOR",
        user_name=current_user.email,
        notes="Paquete registrado en el sistema con transportador asignado",
    )
    db.add(initial_event)

    # Si es ruta VIA_MIAMI y hay tracking asignado, crear automáticamente hito ENVIADO_A_MIAMI
    if route_type == "VIA_MIAMI" and clean_tracking:
        send_event = ShipmentEvent(
            shipment_id=shipment.id,
            event_type="ENVIADO_A_MIAMI",
            location=clean_carrier,
            user_name=current_user.email,
            notes=f"Guía {clean_carrier} #{clean_tracking}",
        )
        db.add(send_event)
        shipment.status_fise = "ENVIADO_A_MIAMI"

    # Actualizar estado del PEC si aplica
    if pec:
        if pec.estado in ("BORRADOR", "COMPRA_REALIZADA", "CONFIRMADA", "CONFIRMACION_PARCIAL"):
            pec.estado = "ENVIADA"

    try:
        db.commit()
        db.refresh(shipment)
    except IntegrityError as e:
        db.rollback()
        # Manejar colisión de unicidad concurrente en (lower(trim(carrier)), upper(trim(tracking_number)))
        winner = (
            db.query(Shipment)
            .filter(
                func.lower(func.trim(Shipment.carrier)) == clean_carrier.lower(),
                func.upper(func.trim(Shipment.tracking_number)) == clean_tracking.upper(),
            )
            .first()
        )
        if winner:
            if _is_shipment_compatible(winner, payload.pec_id, payload.lines):
                return {
                    "status": "success",
                    "message": f"Paquete existente recuperado de forma idempotente tras carrera ({winner.shipment_number})",
                    "data": {
                        "id": winner.id,
                        "shipment_number": winner.shipment_number,
                        "tracking_number": winner.tracking_number,
                        "carrier": winner.carrier,
                        "status_fise": winner.status_fise,
                        "route_type": winner.route_type,
                    },
                }
            else:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Conflicto de concurrencia: se insertó simultáneamente un paquete con carrier='{winner.carrier}' "
                        f"y tracking='{winner.tracking_number}' pero con datos incompatibles ({winner.shipment_number})"
                    ),
                )
        raise HTTPException(status_code=400, detail=f"Error de integridad en creación de paquete: {str(e.orig)}")

    return {
        "status": "success",
        "message": f"Paquete {shipment.shipment_number} creado con éxito",
        "data": {
            "id": shipment.id,
            "shipment_number": shipment.shipment_number,
            "tracking_number": shipment.tracking_number,
            "carrier": shipment.carrier,
            "status_fise": shipment.status_fise,
            "route_type": shipment.route_type,
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
    route_type: Optional[str] = Query(None),
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
    if route_type:
        q = q.filter(Shipment.route_type == route_type)
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
            "route_type": s.route_type,
            "status_fise": s.status_fise,
            "commercial_status": s.commercial_status,
            "origin": s.origin,
            "destination": s.destination,
            "agency_id": s.agency_id,
            "logistics_location_id": s.logistics_location_id,
            "estimated_delivery_date": s.estimated_delivery_date.isoformat() if s.estimated_delivery_date else None,
            "actual_delivery_date": s.actual_delivery_date.isoformat() if s.actual_delivery_date else None,
            "weight_lb": float(s.weight_lb) if s.weight_lb is not None else None,
            "weight_kg": float(s.weight_kg) if s.weight_kg is not None else None,
            "volume_cbm": float(s.volume_cbm) if s.volume_cbm is not None else None,
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
            "idempotency_key": e.idempotency_key,
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
            "cost_allocation_cop": float(cs.cost_allocation_cop),
            "allocation_method": cs.allocation_method,
            "allocation_base": float(cs.allocation_base) if cs.allocation_base is not None else None,
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
            "route_type": s.route_type,
            "origin": s.origin,
            "destination": s.destination,
            "status_fise": s.status_fise,
            "commercial_status": s.commercial_status,
            "agency_id": s.agency_id,
            "logistics_location_id": s.logistics_location_id,
            "estimated_delivery_date": s.estimated_delivery_date.isoformat() if s.estimated_delivery_date else None,
            "actual_delivery_date": s.actual_delivery_date.isoformat() if s.actual_delivery_date else None,
            "weight_lb": float(s.weight_lb) if s.weight_lb is not None else None,
            "weight_kg": float(s.weight_kg) if s.weight_kg is not None else None,
            "volume_cbm": float(s.volume_cbm) if s.volume_cbm is not None else None,
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
    summary="Registrar un nuevo evento o hito logístico en la línea de tiempo del paquete con máquina de estados",
)
def add_shipment_event(
    id: int,
    payload: ShipmentEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS + ROLE_BODEGA))),
):
    """
    Máquina de estados estricta:
    - Bloqueo SELECT FOR UPDATE sobre el Shipment.
    - Selección del grafo según route_type (ALLOWED_TRANSITIONS_MIAMI vs ALLOWED_TRANSITIONS_DIRECT).
    - Rechazo de eventos de Miami en paquetes directos con HTTP 422.
    - Rechazo de eventos posteriores al estado terminal (RECIBIDO_BARRANQUILLA).
    - Idempotencia por idempotency_key o reintento del mismo estado actual.
    - Rechazo de saltos inválidos y regresiones con HTTP 422.
    """
    s = db.query(Shipment).filter(Shipment.id == id).with_for_update().first()
    if not s:
        raise HTTPException(status_code=404, detail="Paquete no encontrado")

    event_type = payload.event_type.upper().strip()

    # Seleccionar grafo según la ruta
    trans_graph = ALLOWED_TRANSITIONS_DIRECT if s.route_type == "DIRECT_TO_BARRANQUILLA" else ALLOWED_TRANSITIONS_MIAMI

    # Validar que DIRECT_TO_BARRANQUILLA no reciba eventos de Miami
    if s.route_type == "DIRECT_TO_BARRANQUILLA" and event_type in ("ENVIADO_A_MIAMI", "RECIBIDO_MIAMI", "PENDIENTE_CONSOLIDACION", "CONSOLIDADO"):
        raise HTTPException(
            status_code=422,
            detail=f"El paquete tiene ruta DIRECT_TO_BARRANQUILLA y no permite eventos de escala Miami ('{event_type}')",
        )

    if event_type not in trans_graph and event_type not in ALLOWED_TRANSITIONS:
        raise HTTPException(
            status_code=422,
            detail=f"event_type inválido '{event_type}'.",
        )

    # 1. Idempotencia por idempotency_key
    if payload.idempotency_key:
        existing_ev = (
            db.query(ShipmentEvent)
            .filter(
                ShipmentEvent.shipment_id == s.id,
                ShipmentEvent.idempotency_key == payload.idempotency_key,
            )
            .first()
        )
        if existing_ev:
            return {
                "status": "success",
                "message": f"Evento '{event_type}' recuperado de forma idempotente por clave",
                "data": {
                    "id": existing_ev.id,
                    "shipment_id": existing_ev.shipment_id,
                    "event_type": existing_ev.event_type,
                    "timestamp": existing_ev.timestamp.isoformat(),
                    "nuevo_status_fise": s.status_fise,
                },
            }

    # 2. Idempotencia natural: Si el paquete ya está en ese estado exactamente, no duplicar evento
    if s.status_fise == event_type:
        latest_ev = (
            db.query(ShipmentEvent)
            .filter(ShipmentEvent.shipment_id == s.id, ShipmentEvent.event_type == event_type)
            .order_by(desc(ShipmentEvent.id))
            .first()
        )
        if latest_ev:
            return {
                "status": "success",
                "message": f"El paquete ya se encuentra en estado '{event_type}' (idempotente)",
                "data": {
                    "id": latest_ev.id,
                    "shipment_id": latest_ev.shipment_id,
                    "event_type": latest_ev.event_type,
                    "timestamp": latest_ev.timestamp.isoformat(),
                    "nuevo_status_fise": s.status_fise,
                },
            }

    # 3. Validar estado terminal
    if s.status_fise == "RECIBIDO_BARRANQUILLA":
        raise HTTPException(
            status_code=422,
            detail="El paquete ya se encuentra en su estado final de entrega (RECIBIDO_BARRANQUILLA) y no admite nuevos eventos",
        )

    # 4. Validar secuencia de transiciones
    allowed_next = trans_graph.get(s.status_fise, set())
    if event_type not in allowed_next:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Transición inválida: no se puede avanzar de '{s.status_fise}' a '{event_type}'. "
                f"Transiciones permitidas: {sorted(list(allowed_next))}"
            ),
        )

    # 5. Crear el evento
    event = ShipmentEvent(
        shipment_id=s.id,
        event_type=event_type,
        location=payload.location,
        user_name=payload.user_name or current_user.email,
        notes=payload.notes,
        evidence_url=payload.evidence_url,
        idempotency_key=payload.idempotency_key,
    )
    db.add(event)

    # Actualizar estado físico actual del paquete
    s.status_fise = event_type

    # Acciones automáticas según el evento
    if event_type == "RECIBIDO_BARRANQUILLA":
        s.actual_delivery_date = datetime.date.today()
        s.commercial_status = "EN_BARRANQUILLA"

    try:
        db.commit()
        db.refresh(event)
    except IntegrityError:
        db.rollback()
        if payload.idempotency_key:
            existing_ev = (
                db.query(ShipmentEvent)
                .filter(
                    ShipmentEvent.shipment_id == s.id,
                    ShipmentEvent.idempotency_key == payload.idempotency_key,
                )
                .first()
            )
            if existing_ev:
                return {
                    "status": "success",
                    "message": f"Evento '{event_type}' recuperado de forma idempotente tras colisión concurrente",
                    "data": {
                        "id": existing_ev.id,
                        "shipment_id": existing_ev.shipment_id,
                        "event_type": existing_ev.event_type,
                        "timestamp": existing_ev.timestamp.isoformat(),
                        "nuevo_status_fise": s.status_fise,
                    },
                }
        raise

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
# 2. CONSOLIDACIONES INTERNACIONALES (MIAMI -> COLOMBIA)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/consolidaciones",
    response_model=Dict[str, Any],
    summary="Crear una consolidación de carga internacional con pertenencia única de paquetes",
)
def create_consolidation(
    payload: ConsolidationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS))),
):
    """
    Crea una consolidación internacional.
    Valida:
    - Deduplicación de shipment_ids en el payload.
    - Paquetes existentes y bloqueo con SELECT FOR UPDATE.
    - Que ningún paquete pertenezca a otra consolidación activa.
    - Validación de estados elegibles: paquetes deben estar en RECIBIDO_MIAMI o PENDIENTE_CONSOLIDACION.
    - Rechazo de paquetes DIRECT_TO_BARRANQUILLA (no consolidables en Miami).
    - Ubicación logística existente y activa si se suministra.
    - Uso de secuencia en base de datos para consolidation_number.
    """
    # 1. Validar ubicación logística si aplica
    loc = None
    if payload.logistics_location_id:
        loc = db.query(LogisticsLocation).filter(LogisticsLocation.id == payload.logistics_location_id).first()
        if not loc:
            raise HTTPException(status_code=422, detail="Ubicación logística no encontrada")
        if not loc.is_active:
            raise HTTPException(status_code=422, detail=f"La ubicación logística '{loc.name}' no está activa")

    # 2. Validar unicidad de IDs en el payload
    if payload.shipment_ids:
        if len(payload.shipment_ids) != len(set(payload.shipment_ids)):
            raise HTTPException(
                status_code=422,
                detail="El payload contiene shipment_ids repetidos",
            )

        # Bloquear paquetes con SELECT FOR UPDATE
        shipments = (
            db.query(Shipment)
            .filter(Shipment.id.in_(payload.shipment_ids))
            .with_for_update()
            .all()
        )
        if len(shipments) != len(payload.shipment_ids):
            found_ids = {s.id for s in shipments}
            missing = set(payload.shipment_ids) - found_ids
            raise HTTPException(
                status_code=404,
                detail=f"Los siguientes paquetes no existen: {sorted(list(missing))}",
            )

        # Validar conflicto con otra consolidación activa
        active_conflict = (
            db.query(ConsolidationShipment)
            .join(Consolidation, ConsolidationShipment.consolidation_id == Consolidation.id)
            .filter(
                ConsolidationShipment.shipment_id.in_(payload.shipment_ids),
                Consolidation.status != "CERRADA",
                ConsolidationShipment.is_active == True,
            )
            .first()
        )
        if active_conflict:
            conf_shp = db.query(Shipment).filter(Shipment.id == active_conflict.shipment_id).first()
            shp_num = conf_shp.shipment_number if conf_shp else str(active_conflict.shipment_id)
            conf_con = db.query(Consolidation).filter(Consolidation.id == active_conflict.consolidation_id).first()
            con_num = conf_con.consolidation_number if conf_con else str(active_conflict.consolidation_id)
            raise HTTPException(
                status_code=422,
                detail=f"El paquete {shp_num} ya pertenece a la consolidación activa #{con_num}",
            )

        # Validar ruta y estado de cada paquete
        for shp in shipments:
            if shp.route_type == "DIRECT_TO_BARRANQUILLA":
                raise HTTPException(
                    status_code=422,
                    detail=f"El paquete {shp.shipment_number} tiene ruta DIRECT_TO_BARRANQUILLA y no puede agregarse a una consolidación vía Miami",
                )
            if shp.status_fise not in ("RECIBIDO_MIAMI", "PENDIENTE_CONSOLIDACION"):
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"El paquete {shp.shipment_number} no está en un estado elegible para consolidación "
                        f"(estado actual: '{shp.status_fise}'). Debe estar en 'RECIBIDO_MIAMI' o 'PENDIENTE_CONSOLIDACION'."
                    ),
                )
    else:
        shipments = []

    con_number = _gen_consolidation_number(db)
    trm_dec = Decimal(str(payload.trm or 0))
    freight_usd_dec = Decimal(str(payload.total_freight_usd or 0))
    freight_cop_dec = Decimal(str(payload.total_freight_cop or (freight_usd_dec * trm_dec)))

    agency_name = loc.name if loc else (payload.agency_name or "Miami Agency 1")

    consolidation = Consolidation(
        consolidation_number=con_number,
        carrier=payload.carrier,
        tracking_international=payload.tracking_international,
        agency_name=agency_name,
        logistics_location_id=loc.id if loc else None,
        origin=payload.origin or "MIAMI",
        destination=payload.destination or "BARRANQUILLA",
        trm=trm_dec,
        total_freight_usd=freight_usd_dec,
        total_freight_cop=freight_cop_dec,
        notes=payload.notes,
        status="ABIERTA",
    )
    db.add(consolidation)
    db.flush()

    total_weight = Decimal("0")
    total_volume = Decimal("0")
    for shp in shipments:
        cs = ConsolidationShipment(
            consolidation_id=consolidation.id,
            shipment_id=shp.id,
            is_active=True,
        )
        db.add(cs)
        shp.status_fise = "CONSOLIDADO"
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
        if shp.volume_cbm:
            total_volume += Decimal(str(shp.volume_cbm))

    consolidation.total_weight_kg = total_weight
    consolidation.total_volume_cbm = total_volume
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
            "shipments_count": len(shipments),
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
            "logistics_location_id": c.logistics_location_id,
            "origin": c.origin,
            "destination": c.destination,
            "total_weight_kg": float(c.total_weight_kg),
            "total_volume_cbm": float(c.total_volume_cbm),
            "total_freight_usd": float(c.total_freight_usd),
            "total_freight_cop": float(c.total_freight_cop),
            "status": c.status,
            "last_allocation_method": c.last_allocation_method,
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
                "volume_cbm": float(shp.volume_cbm) if shp.volume_cbm is not None else 0.0,
                "cost_allocation_usd": float(cs.cost_allocation_usd),
                "cost_allocation_cop": float(cs.cost_allocation_cop),
                "allocation_method": cs.allocation_method,
                "allocation_base": float(cs.allocation_base) if cs.allocation_base is not None else None,
            })

    return {
        "status": "success",
        "data": {
            "id": c.id,
            "consolidation_number": c.consolidation_number,
            "carrier": c.carrier,
            "tracking_international": c.tracking_international,
            "agency_name": c.agency_name,
            "logistics_location_id": c.logistics_location_id,
            "origin": c.origin,
            "destination": c.destination,
            "total_weight_kg": float(c.total_weight_kg),
            "total_volume_cbm": float(c.total_volume_cbm),
            "total_freight_usd": float(c.total_freight_usd),
            "total_freight_cop": float(c.total_freight_cop),
            "trm": float(c.trm),
            "status": c.status,
            "last_allocation_method": c.last_allocation_method,
            "departure_date": c.departure_date.isoformat() if c.departure_date else None,
            "estimated_arrival_date": c.estimated_arrival_date.isoformat() if c.estimated_arrival_date else None,
            "actual_arrival_date": c.actual_arrival_date.isoformat() if c.actual_arrival_date else None,
            "dian_entered_at": c.dian_entered_at.isoformat() if c.dian_entered_at else None,
            "paquetes": shipments_list,
        },
    }


@router.post(
    "/consolidaciones/{id}/shipments",
    response_model=Dict[str, Any],
    summary="Agregar paquetes a una consolidación existente con bloqueo y pertenencia única",
)
def add_shipments_to_consolidation(
    id: int,
    payload: ConsolidationAddShipments,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS))),
):
    c = db.query(Consolidation).filter(Consolidation.id == id).with_for_update().first()
    if not c:
        raise HTTPException(status_code=404, detail="Consolidación no encontrada")
    if c.status == "CERRADA":
        raise HTTPException(status_code=422, detail="No se pueden agregar paquetes a una consolidación cerrada")
    if c.status in ("RECIBIDA_DESTINO", "CERRADA"):
        raise HTTPException(status_code=422, detail="No se pueden agregar paquetes a una consolidación cerrada o recibida")

    # Detectar duplicados en el payload
    if len(payload.shipment_ids) != len(set(payload.shipment_ids)):
        raise HTTPException(status_code=422, detail="El payload contiene shipment_ids repetidos")

    # Bloquear paquetes
    shipments = (
        db.query(Shipment)
        .filter(Shipment.id.in_(payload.shipment_ids))
        .with_for_update()
        .all()
    )
    if len(shipments) != len(payload.shipment_ids):
        found_ids = {s.id for s in shipments}
        missing = set(payload.shipment_ids) - found_ids
        raise HTTPException(status_code=404, detail=f"Los siguientes paquetes no existen: {sorted(list(missing))}")

    existing_shipment_ids = {cs.shipment_id for cs in c.shipment_associations}
    new_ids = [sid for sid in payload.shipment_ids if sid not in existing_shipment_ids]

    # Validar conflicto con otra consolidación activa PRIMERO
    if new_ids:
        conflict = (
            db.query(ConsolidationShipment)
            .join(Consolidation, ConsolidationShipment.consolidation_id == Consolidation.id)
            .filter(
                ConsolidationShipment.shipment_id.in_(new_ids),
                Consolidation.status != "CERRADA",
                ConsolidationShipment.is_active == True,
                ConsolidationShipment.consolidation_id != c.id,
            )
            .first()
        )
        if conflict:
            conf_shp = db.query(Shipment).filter(Shipment.id == conflict.shipment_id).first()
            shp_num = conf_shp.shipment_number if conf_shp else str(conflict.shipment_id)
            conf_con = db.query(Consolidation).filter(Consolidation.id == conflict.consolidation_id).first()
            con_num = conf_con.consolidation_number if conf_con else str(conflict.consolidation_id)
            raise HTTPException(
                status_code=422,
                detail=f"El paquete {shp_num} ya pertenece a la consolidación activa #{con_num}",
            )

    # Validar ruta y estado de cada paquete
    for shp in shipments:
        if shp.id in existing_shipment_ids:
            continue
        if shp.route_type == "DIRECT_TO_BARRANQUILLA":
            raise HTTPException(
                status_code=422,
                detail=f"El paquete {shp.shipment_number} tiene ruta DIRECT_TO_BARRANQUILLA y no puede agregarse a una consolidación vía Miami",
            )
        if shp.status_fise not in ("RECIBIDO_MIAMI", "PENDIENTE_CONSOLIDACION"):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"El paquete {shp.shipment_number} no está en un estado elegible para consolidación "
                    f"(estado actual: '{shp.status_fise}'). Debe estar en 'RECIBIDO_MIAMI' o 'PENDIENTE_CONSOLIDACION'."
                ),
            )

    added_count = 0
    for shp in shipments:
        if shp.id in existing_shipment_ids:
            continue

        cs = ConsolidationShipment(
            consolidation_id=c.id,
            shipment_id=shp.id,
            is_active=True,
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
        if shp.volume_cbm:
            c.total_volume_cbm = (c.total_volume_cbm or Decimal("0")) + Decimal(str(shp.volume_cbm))
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


@router.post(
    "/consolidaciones/{id}/repartir-costos",
    response_model=Dict[str, Any],
    summary="Prorratear costo del flete internacional con Decimal y reparto determinista de centavos residuales",
)
def allocate_consolidation_costs(
    id: int,
    payload: ConsolidationCostAllocation,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS))),
):
    """
    Prorrateo de flete internacional (WEIGHT, VOLUME, QUANTITY, VALUE, EQUAL):
    - Rechazo de cálculo en consolidación CERRADA con HTTP 422.
    - Validación estricta de allocation_method.
    - Bases no nulas, mayores a 0 para el método seleccionado.
    - Aritmética 100% en Decimal.
    - Cuotas cuantizadas a centavos con asignación determinista del residuo.
    - La suma en USD y COP es idéntica al total en DB al centavo exacto.
    - Persistencia de allocation_method y allocation_base en cada association.
    """
    c = db.query(Consolidation).filter(Consolidation.id == id).with_for_update().first()
    if not c:
        raise HTTPException(status_code=404, detail="Consolidación no encontrada")
    if c.status == "CERRADA":
        raise HTTPException(status_code=422, detail="No se pueden repartir costos en una consolidación cerrada")

    # Validar método
    method = payload.allocation_method.upper().strip()
    valid_methods = {"WEIGHT", "VOLUME", "QUANTITY", "VALUE", "EQUAL"}
    if method not in valid_methods:
        raise HTTPException(
            status_code=422,
            detail=f"Método de prorrateo desconocido '{method}'. Debe ser uno de: {sorted(list(valid_methods))}",
        )

    # Actualizar flete o TRM si se suministran
    if payload.total_freight_usd is not None:
        val_usd = Decimal(str(payload.total_freight_usd))
        if val_usd < Decimal("0"):
            raise HTTPException(status_code=422, detail="total_freight_usd no puede ser negativo")
        c.total_freight_usd = val_usd

    if payload.trm is not None:
        val_trm = Decimal(str(payload.trm))
        if val_trm < Decimal("0"):
            raise HTTPException(status_code=422, detail="trm no puede ser negativa")
        c.trm = val_trm

    # Calcular total COP redondeado a 2 decimales
    c.total_freight_cop = (c.total_freight_usd * c.trm).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # Ordenar asociaciones determinísticamente por shipment_id
    associations = sorted(c.shipment_associations, key=lambda cs: cs.shipment_id)
    if not associations:
        raise HTTPException(status_code=422, detail="La consolidación no contiene paquetes para repartir costos")

    total_usd = c.total_freight_usd
    total_cop = c.total_freight_cop
    n = len(associations)
    cents = Decimal("0.01")

    # Calcular la base de prorrateo para cada asociación
    bases: Dict[int, Decimal] = {}
    for cs in associations:
        shp = cs.shipment
        shp_label = shp.shipment_number if shp else f"id={cs.shipment_id}"

        if method == "WEIGHT":
            if not shp or shp.weight_kg is None or Decimal(str(shp.weight_kg)) <= Decimal("0"):
                raise HTTPException(
                    status_code=422,
                    detail=f"El paquete {shp_label} no tiene un peso válido mayor a 0 kg para el prorrateo por PESO",
                )
            bases[cs.shipment_id] = Decimal(str(shp.weight_kg))

        elif method == "VOLUME":
            if not shp or shp.volume_cbm is None or Decimal(str(shp.volume_cbm)) <= Decimal("0"):
                raise HTTPException(
                    status_code=422,
                    detail=f"El paquete {shp_label} no tiene un volumen válido mayor a 0 cbm para el prorrateo por VOLUMEN",
                )
            bases[cs.shipment_id] = Decimal(str(shp.volume_cbm))

        elif method == "QUANTITY":
            qty_sum = sum((Decimal(str(sl.quantity)) for sl in shp.lines), Decimal("0")) if shp and shp.lines else Decimal("0")
            if qty_sum <= Decimal("0"):
                raise HTTPException(
                    status_code=422,
                    detail=f"El paquete {shp_label} no tiene cantidad de artículos mayor a 0 para el prorrateo por CANTIDAD",
                )
            bases[cs.shipment_id] = qty_sum

        elif method == "VALUE":
            val_sum = Decimal("0")
            if shp and shp.lines:
                for sl in shp.lines:
                    unit_cost = Decimal(str(sl.po_line.unit_cost_usd or 0)) if sl.po_line else Decimal("0")
                    val_sum += Decimal(str(sl.quantity)) * unit_cost
            if val_sum <= Decimal("0"):
                raise HTTPException(
                    status_code=422,
                    detail=f"El paquete {shp_label} no tiene un valor comercial mayor a 0 USD para el prorrateo por VALOR",
                )
            bases[cs.shipment_id] = val_sum

        elif method == "EQUAL":
            bases[cs.shipment_id] = Decimal("1.0000")

    total_base = sum(bases.values())
    if total_base <= Decimal("0"):
        raise HTTPException(status_code=422, detail=f"La base total acumulada para {method} debe ser mayor a 0")

    # Reparto USD
    allocated_usd_map: Dict[int, Decimal] = {}
    sum_base_usd = Decimal("0")
    for cs in associations:
        b = bases[cs.shipment_id]
        share_raw = (b / total_base) * total_usd
        base_usd = share_raw.quantize(cents, rounding=ROUND_DOWN)
        allocated_usd_map[cs.shipment_id] = base_usd
        sum_base_usd += base_usd

    residue_usd = total_usd - sum_base_usd
    k_usd = int(residue_usd / cents)
    for i in range(min(k_usd, n)):
        sid = associations[i].shipment_id
        allocated_usd_map[sid] += cents

    # Reparto COP
    allocated_cop_map: Dict[int, Decimal] = {}
    sum_base_cop = Decimal("0")
    for cs in associations:
        b = bases[cs.shipment_id]
        share_raw = (b / total_base) * total_cop
        base_cop = share_raw.quantize(cents, rounding=ROUND_DOWN)
        allocated_cop_map[cs.shipment_id] = base_cop
        sum_base_cop += base_cop

    residue_cop = total_cop - sum_base_cop
    k_cop = int(residue_cop / cents)
    for i in range(min(k_cop, n)):
        sid = associations[i].shipment_id
        allocated_cop_map[sid] += cents

    # Persistir en asociaciones y en consolidación
    for cs in associations:
        cs.cost_allocation_usd = allocated_usd_map[cs.shipment_id]
        cs.cost_allocation_cop = allocated_cop_map[cs.shipment_id]
        cs.allocation_method = method
        cs.allocation_base = bases[cs.shipment_id]

    c.last_allocation_method = method
    db.commit()

    return {
        "status": "success",
        "message": f"Flete de ${float(total_usd)} USD (${float(total_cop)} COP) prorrateado exactamente entre {n} paquetes vía {method}",
        "data": {
            "consolidation_id": c.id,
            "last_allocation_method": c.last_allocation_method,
            "total_freight_usd": float(c.total_freight_usd),
            "total_freight_cop": float(c.total_freight_cop),
            "reparto": [
                {
                    "shipment_id": cs.shipment_id,
                    "allocation_method": cs.allocation_method,
                    "allocation_base": float(cs.allocation_base) if cs.allocation_base is not None else None,
                    "cost_allocation_usd": float(cs.cost_allocation_usd),
                    "cost_allocation_cop": float(cs.cost_allocation_cop),
                }
                for cs in associations
            ],
        },
    }


@router.patch(
    "/consolidaciones/{id}",
    response_model=Dict[str, Any],
    summary="Actualizar metadatos de una consolidación (notas, tracking, agencia, etc.)",
)
def update_consolidation(
    id: int,
    payload: ConsolidationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS + ROLE_BODEGA))),
):
    c = db.query(Consolidation).filter(Consolidation.id == id).with_for_update().first()
    if not c:
        raise HTTPException(status_code=404, detail="Consolidación no encontrada")

    if payload.carrier is not None:
        c.carrier = payload.carrier
    if payload.tracking_international is not None:
        c.tracking_international = payload.tracking_international
    if payload.agency_name is not None:
        c.agency_name = payload.agency_name
    if payload.logistics_location_id is not None:
        loc = db.query(LogisticsLocation).filter(LogisticsLocation.id == payload.logistics_location_id).first()
        if not loc:
            raise HTTPException(status_code=422, detail="Ubicación logística no encontrada")
        c.logistics_location_id = loc.id
        c.agency_name = loc.name
    if payload.customs_declaration_number is not None:
        c.customs_declaration_number = payload.customs_declaration_number
    if payload.notes is not None:
        c.notes = payload.notes
    if payload.estimated_arrival_date is not None:
        c.estimated_arrival_date = payload.estimated_arrival_date

    c.updated_at = _now()
    db.commit()
    db.refresh(c)

    return {
        "status": "success",
        "message": f"Consolidación #{c.consolidation_number} actualizada exitosamente",
        "data": {
            "id": c.id,
            "consolidation_number": c.consolidation_number,
            "carrier": c.carrier,
            "tracking_international": c.tracking_international,
            "agency_name": c.agency_name,
            "notes": c.notes,
            "status": c.status,
            "dian_entered_at": c.dian_entered_at.isoformat() if c.dian_entered_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        },
    }


@router.patch(
    "/consolidaciones/{id}/estado",
    response_model=Dict[str, Any],
    summary="Actualizar estado de una consolidación, registrar dian_entered_at y propagar a paquetes",
)
def update_consolidation_status(
    id: int,
    payload: ConsolidationStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*(ROLE_ADMIN + ROLE_COMPRAS + ROLE_BODEGA))),
):
    """
    Actualiza el estado de una consolidación internacional.
    - Máquina de estados: ABIERTA -> CONSOLIDADA -> EN_VUELO -> EN_DIAN -> LIBERADA -> RECIBIDA_DESTINO -> CERRADA.
    - Rechazo de saltos y regresiones con HTTP 422.
    - Idempotencia si el estado actual es igual al solicitado (no crea eventos duplicados ni efectos secundarios).
    - CERRADA es terminal.
    - Propagación de estados a paquetes respetando ALLOWED_TRANSITIONS de cada paquete.
    """
    c = db.query(Consolidation).filter(Consolidation.id == id).with_for_update().first()
    if not c:
        raise HTTPException(status_code=404, detail="Consolidación no encontrada")

    new_status = payload.status.upper().strip()
    if new_status not in CONSOLIDATION_ALLOWED_TRANSITIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Estado inválido. Debe ser uno de: {sorted(list(CONSOLIDATION_ALLOWED_TRANSITIONS.keys()))}",
        )

    # 1. Idempotencia: si ya está en ese estado exactamente, no ejecutar efectos secundarios ni crear eventos
    if c.status == new_status:
        if payload.notes:
            c.notes = (c.notes or "") + f"\n[{datetime.date.today().isoformat()}] {payload.notes}"
            c.updated_at = _now()
            db.commit()
            db.refresh(c)
        return {
            "status": "success",
            "message": f"Consolidación #{c.consolidation_number} ya se encontraba en estado {c.status}",
            "data": {
                "id": c.id,
                "consolidation_number": c.consolidation_number,
                "status": c.status,
                "dian_entered_at": c.dian_entered_at.isoformat() if c.dian_entered_at else None,
                "shipments_count": len(c.shipment_associations),
            },
        }

    # 2. Validar terminal CERRADA
    if c.status == "CERRADA":
        raise HTTPException(
            status_code=422,
            detail="La consolidación se encuentra CERRADA (estado terminal) y no admite cambios de estado",
        )

    # 3. Validar transiciones permitidas
    allowed_next = CONSOLIDATION_ALLOWED_TRANSITIONS.get(c.status, set())
    if new_status not in allowed_next:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Transición inválida: no se puede avanzar la consolidación de '{c.status}' a '{new_status}'. "
                f"Transiciones permitidas: {sorted(list(allowed_next))}"
            ),
        )

    # 4. Mapeo a evento de paquete
    status_to_event = {
        "CONSOLIDADA": "CONSOLIDADO",
        "EN_VUELO": "EN_VUELO",
        "EN_DIAN": "EN_DIAN",
        "LIBERADA": "LIBERADO_DIAN",
        "RECIBIDA_DESTINO": "RECIBIDO_BARRANQUILLA",
    }
    mapped_event = status_to_event.get(new_status)

    # 5. Propagación respetando ALLOWED_TRANSITIONS de cada paquete
    if mapped_event:
        for cs in c.shipment_associations:
            shp = cs.shipment
            if shp and shp.status_fise != mapped_event:
                trans_graph = ALLOWED_TRANSITIONS_DIRECT if shp.route_type == "DIRECT_TO_BARRANQUILLA" else ALLOWED_TRANSITIONS_MIAMI
                shp_allowed = trans_graph.get(shp.status_fise, set())
                if mapped_event not in shp_allowed:
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            f"No se puede propagar el estado '{mapped_event}' al paquete {shp.shipment_number}: "
                            f"transición no permitida desde su estado actual '{shp.status_fise}' "
                            f"(permitidas: {sorted(list(shp_allowed))})"
                        ),
                    )
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

    # 6. Actualizar campos de la consolidación
    c.status = new_status
    if payload.notes:
        c.notes = (c.notes or "") + f"\n[{datetime.date.today().isoformat()}] {payload.notes}"

    if new_status == "EN_VUELO" and not c.departure_date:
        c.departure_date = _now()
    elif new_status == "EN_DIAN" and not c.dian_entered_at:
        c.dian_entered_at = _now()
    elif new_status == "RECIBIDA_DESTINO" and not c.actual_arrival_date:
        c.actual_arrival_date = _now()
    elif new_status == "CERRADA":
        # Liberar los paquetes para que no permanezcan bloqueados en consolidación activa
        for cs in c.shipment_associations:
            cs.is_active = False

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
            "dian_entered_at": c.dian_entered_at.isoformat() if c.dian_entered_at else None,
            "shipments_count": len(c.shipment_associations),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. UBICACIONES Y AGENCIAS LOGÍSTICAS (LogisticsLocation)
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
    summary="Motor de alertas operativas de compras y tránsito en tiempo real (días hábiles)",
)
def get_transit_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_ERP_ROLES)),
):
    """
    Motor de alertas en tiempo real:
    - TRACKING_PENDIENTE: PECs confirmadas > 3 días sin tracking.
    - ENTREGA_VENCIDA: Shipments con fecha estimada vencida y no entregados.
    - PENDIENTE_CONSOLIDACION: Paquetes en Miami > 5 días sin consolidar.
    - DIAN_DEMORADO: Consolidaciones en aduana > 3 días hábiles reales (lunes a viernes).
      Calculado a partir de dian_entered_at, garantizando que ediciones de notas no reseteen la alerta.
    """
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
    dian_consolidations = (
        db.query(Consolidation)
        .filter(Consolidation.status == "EN_DIAN")
        .all()
    )
    for c in dian_consolidations:
        ref_dt = c.dian_entered_at or c.created_at or now
        ref_utc = _to_utc(ref_dt)
        b_days = _calculate_business_days(ref_utc, now)
        if b_days >= 3:
            alerts.append({
                "alert_type": "DIAN_DEMORADO",
                "severity": "ALTA",
                "document_type": "CONSOLIDATION",
                "document_id": c.id,
                "document_reference": c.consolidation_number,
                "message": f"Consolidación {c.consolidation_number} lleva {b_days} días hábiles retenida en proceso aduanero DIAN",
                "days_delay": b_days,
                "suggested_action": "Verificar con el agente de aduanas pagos de arancel o requerimientos documentales",
            })

    return {
        "status": "success",
        "data": {
            "total_alertas": len(alerts),
            "alertas": alerts,
        },
    }
