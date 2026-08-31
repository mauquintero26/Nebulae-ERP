from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.crm import Alert
from app.models.sales import SalesOrder
from app.schemas import crm as schemas
import datetime

router = APIRouter()

def generate_crm_alerts(db: Session):
    two_days_ago = datetime.datetime.utcnow() - datetime.timedelta(hours=48)
    stalled_orders = db.query(SalesOrder).filter(
        SalesOrder.status.in_(["QUOTING", "PENDING_PAYMENT"]),
        SalesOrder.updated_at <= two_days_ago
    ).all()
    for order in stalled_orders:
        existing = db.query(Alert).filter(
            Alert.reference_id == order.id,
            Alert.alert_type == "CRM_FOLLOWUP",
            Alert.is_resolved == False
        ).first()
        if not existing:
            new_alert = Alert(
                alert_type="CRM_FOLLOWUP",
                reference_id=order.id,
                message=f"El cliente de la orden {order.id} lleva 48 horas en estado {order.status}. ¡Hazle seguimiento!",
                due_date=datetime.datetime.utcnow()
            )
            db.add(new_alert)
    db.commit()

def generate_delivery_alerts(db: Session, days_before: int = 5):
    target_date = datetime.datetime.utcnow() + datetime.timedelta(days=days_before)
    today = datetime.datetime.utcnow()
    pending_deliveries = db.query(SalesOrder).filter(
        SalesOrder.sale_type == "ON_DEMAND",
        SalesOrder.status.in_(["PENDING", "QUOTING", "PENDING_PAYMENT"]),
        SalesOrder.estimated_delivery_date != None,
        SalesOrder.estimated_delivery_date >= today,
        SalesOrder.estimated_delivery_date <= target_date
    ).all()
    for order in pending_deliveries:
        existing = db.query(Alert).filter(
            Alert.reference_id == order.id,
            Alert.alert_type == "DELIVERY_ALERT",
            Alert.is_resolved == False
        ).first()
        if not existing:
            new_alert = Alert(
                alert_type="DELIVERY_ALERT",
                reference_id=order.id,
                message=f"La orden {order.id} por pedido debe entregarse pronto (Estimado: {order.estimated_delivery_date.strftime('%Y-%m-%d')}).",
                due_date=order.estimated_delivery_date
            )
            db.add(new_alert)
    db.commit()

@router.post("/trigger-alerts")
def trigger_alerts(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Simulates a cronjob to generate alerts"""
    background_tasks.add_task(generate_crm_alerts, db)
    background_tasks.add_task(generate_delivery_alerts, db, 5)
    return {"status": "success", "message": "Alert generation triggered in background."}

@router.get("/calendar")
def get_crm_calendar(db: Session = Depends(get_db)):
    alerts = db.query(Alert).filter(Alert.alert_type == "CRM_FOLLOWUP").all()
    calendar_dict = {}
    for alert in alerts:
        date_str = alert.due_date.strftime("%Y-%m-%d")
        if date_str not in calendar_dict:
            calendar_dict[date_str] = []
        calendar_dict[date_str].append(schemas.AlertResponse.model_validate(alert).model_dump())
    response_data = []
    for date_str, alert_list in calendar_dict.items():
        response_data.append({"date": date_str, "alerts": alert_list})
    return {"status": "success", "data": response_data}

from app.models.customers import Customer
from app.schemas.crm import CustomerCreate, CustomerResponse, CustomerUpdate
from decimal import Decimal

# ──────────────────────────────────────────────────────────────────────────────
# CUSTOMERS CRUD
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/customers", response_model=dict)
def get_customers(db: Session = Depends(get_db)):
    customers = db.query(Customer).all()
    return {"status": "success", "data": [CustomerResponse.model_validate(c).model_dump() for c in customers]}


@router.post("/customers", response_model=dict)
def create_customer(customer: CustomerCreate, db: Session = Depends(get_db)):
    # Check unique email if provided
    if customer.email:
        existing = db.query(Customer).filter(Customer.email == customer.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe un cliente registrado con ese correo.")
    db_customer = Customer(
        first_name=customer.first_name,
        last_name=customer.last_name,
        email=customer.email or None,
        phone=customer.phone,
        city=customer.city,
        document=customer.document,
        address=customer.address
    )
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return {"status": "success", "data": CustomerResponse.model_validate(db_customer).model_dump()}


@router.put("/customers/{customer_id}", response_model=dict)
def update_customer(customer_id: int, customer: CustomerUpdate, db: Session = Depends(get_db)):
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    update_data = customer.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_customer, key, value)
    db.commit()
    db.refresh(db_customer)
    return {"status": "success", "data": CustomerResponse.model_validate(db_customer).model_dump()}


@router.delete("/customers/{customer_id}", response_model=dict)
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    try:
        # Remove linked sales orders first to avoid FK constraint violations
        for order in db_customer.sales_orders:
            for line in order.lines:
                db.delete(line)
            db.delete(order)
        # Remove linked quotations
        for q in db_customer.quotations:
            db.delete(q)
        db.delete(db_customer)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"No se puede eliminar: {str(e)}")
    return {"status": "success", "data": {"message": "Cliente eliminado correctamente."}}


# ──────────────────────────────────────────────────────────────────────────────
# CUSTOMER 360 PROFILE + ACTIVITY
# ──────────────────────────────────────────────────────────────────────────────

STATUS_LABELS = {
    "DRAFT": "Borrador",
    "QUOTATION": "Pendiente por cotizar",
    "TO_INVOICE": "Pendiente de facturación",
    "INVOICED": "Facturado",
    "CANCELLED": "Cancelado",
    "PENDING": "Pendiente de atención",
    "PENDING_PAYMENT": "Pendiente de pago",
    "QUOTING": "En cotización",
    "DONE": "Completado",
    "PAID": "Pagado",
}

STATUS_COLORS = {
    "DRAFT": "slate",
    "QUOTATION": "indigo",
    "TO_INVOICE": "amber",
    "INVOICED": "emerald",
    "CANCELLED": "red",
    "PENDING": "amber",
    "PENDING_PAYMENT": "orange",
    "QUOTING": "indigo",
    "DONE": "emerald",
    "PAID": "emerald",
}

@router.get("/customers/{customer_id}/profile-360")
def get_customer_360_profile(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    active_orders = []
    all_orders_timeline = []
    ltv = Decimal("0.0")

    for order in customer.sales_orders:
        order_total = sum((line.unit_price * line.quantity) for line in order.lines)

        # Use solicitud_tipo for display if available, else generic label
        tipo_display = getattr(order, "solicitud_tipo", None) or "Solicitud"
        estado_display = STATUS_LABELS.get(order.status, order.status)

        if order.status != "CANCELLED":
            active_orders.append({
                "id": order.id,
                "status": order.status,
                "status_label": estado_display,
                "solicitud_tipo": tipo_display,
                "color": STATUS_COLORS.get(order.status, "slate"),
                "created_at": order.created_at.isoformat(),
                "total": round(float(order_total), 2),
                "lines_count": len(order.lines),
            })

        # Timeline entry — richer description using solicitud_tipo
        all_orders_timeline.append({
            "type": "sale_order",
            "id": order.id,
            "status": order.status,
            "status_label": tipo_display,
            "estado_label": estado_display,
            "solicitud_tipo": tipo_display,
            "color": STATUS_COLORS.get(order.status, "slate"),
            "created_at": order.created_at.isoformat(),
            "total": round(float(order_total), 2),
            "lines_count": len(order.lines),
            "description": f"ESTADO: {estado_display}",
        })

        if order.status in ["INVOICED", "COMPLETED", "DONE", "PAID"]:
            ltv += order_total

    # Always add "Cliente Creado" as the first timeline event
    all_orders_timeline.append({
        "type": "created",
        "id": customer.id,
        "status": "CREATED",
        "status_label": "Cliente Creado",
        "color": "purple",
        "created_at": None,
        "total": 0,
        "lines_count": 0,
        "description": "Ficha del cliente registrada en el sistema.",
    })

    # ── Include calendar events in the timeline (audit log) ──────────────────
    cal_events = db.query(CalendarEvent).filter(
        CalendarEvent.customer_id == customer.id
    ).order_by(CalendarEvent.start_datetime.desc()).all()

    EVENT_TYPE_LABELS = {
        "MEETING":  "Reunión agendada",
        "CALL":     "Llamada agendada",
        "VIDEO":    "Videollamada agendada",
        "FOLLOWUP": "Seguimiento agendado",
        "TASK":     "Tarea agendada",
        "DEMO":     "Demo / Presentación",
    }
    EVENT_TYPE_COLORS = {
        "MEETING": "indigo", "CALL": "green", "VIDEO": "blue",
        "FOLLOWUP": "amber", "TASK": "purple", "DEMO": "rose",
    }

    for ce in cal_events:
        type_label = EVENT_TYPE_LABELS.get(ce.event_type or "MEETING", "Evento")
        color = EVENT_TYPE_COLORS.get(ce.event_type or "MEETING", "indigo")
        start_str = ce.start_datetime.strftime("%d %b %Y %H:%M") if ce.start_datetime else "—"
        desc_parts = [f"📅 {start_str}"]
        if ce.location: desc_parts.append(f"📍 {ce.location}")
        if ce.description: desc_parts.append(ce.description[:100])
        all_orders_timeline.append({
            "type": "calendar_event",
            "id": ce.id,
            "status": "CALENDAR_EVENT",
            "status_label": type_label,
            "estado_label": ce.title,
            "solicitud_tipo": type_label,
            "color": color,
            "created_at": ce.created_at.isoformat() if ce.created_at else None,
            "event_start": ce.start_datetime.isoformat() if ce.start_datetime else None,
            "total": 0,
            "lines_count": 0,
            "description": " · ".join(desc_parts),
            "created_by": ce.created_by or "CRM",
        })

    # Sort by created_at descending (newest first), put None at end
    all_orders_timeline.sort(
        key=lambda x: x["created_at"] if x["created_at"] else "",
        reverse=True
    )

    profile = {
        "id": customer.id,
        "first_name": customer.first_name,
        "last_name": customer.last_name,
        "email": customer.email,
        "phone": customer.phone,
        "document": customer.document,
        "address": customer.address,
        "city": customer.city,
        "active_orders": active_orders,
        "timeline": all_orders_timeline,
        "ltv": str(round(ltv, 2)),
        "total_orders": len(customer.sales_orders),
        "total_events": len(cal_events),
    }

    return {"status": "success", "data": profile}


# ──────────────────────────────────────────────────────────────────────────────
# PIPELINE DE SOLICITUDES: tipos disponibles (sincronizados con Frontend)
# ──────────────────────────────────────────────────────────────────────────────
SOLICITUD_TIPOS = [
    "Solicitud de Cotización",
    "Solicitud de Seguimiento",
    "Solicitud de Devolución / Garantía",
    "Solicitud de Soporte Técnico",
]

# Mapa: tipo de solicitud → estado inicial en el pipeline
TIPO_TO_STATUS = {
    "Solicitud de Cotización": "QUOTATION",
    "Solicitud de Seguimiento": "PENDING",
    "Solicitud de Devolución / Garantía": "PENDING",
    "Solicitud de Soporte Técnico": "PENDING",
}

# Etiquetas de display para cada estado
STATUS_LABELS_SOLICITUD = {
    "QUOTATION": "Pendiente por cotizar",
    "PENDING": "Pendiente de atención",
    "DRAFT": "Borrador",
    "TO_INVOICE": "En evaluación",
    "INVOICED": "Facturado",
    "DONE": "Completado",
    "CANCELLED": "Cancelado",
}

@router.get("/solicitud-tipos", response_model=dict)
def get_solicitud_tipos():
    """Returns the list of available solicitud pipeline types for frontend dropdowns."""
    return {"status": "success", "data": SOLICITUD_TIPOS}


@router.post("/customers/{customer_id}/solicitudes", response_model=dict)
def create_customer_solicitud(customer_id: int, body: dict, db: Session = Depends(get_db)):
    """
    Creates a sales order (Solicitud) in the CRM pipeline linked to a customer.
    Maps the user-facing 'tipo' to the correct pipeline status.
    """
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    tipo = body.get("tipo", "Solicitud de Cotización")
    pipeline_status = TIPO_TO_STATUS.get(tipo, "QUOTATION")
    sale_type = body.get("sale_type", "ON_DEMAND")

    # Find the matching pipeline stage (so the lead appears in the correct Kanban column)
    matching_stage = db.execute(
        text("SELECT id FROM pipeline_stages WHERE maps_to_status = :status ORDER BY position LIMIT 1"),
        {"status": pipeline_status}
    ).fetchone()
    stage_id = matching_stage[0] if matching_stage else None

    new_order = SalesOrder(
        customer_id=customer_id,
        status=pipeline_status,
        sale_type=sale_type,
        solicitud_tipo=tipo,
        lead_source="Agenda CRM",
        lead_description=body.get("detalles", ""),
        lead_value=body.get("valor", 0),
        pipeline_stage_id=stage_id,
    )
    db.add(new_order)
    try:
        db.commit()
        db.refresh(new_order)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "status": "success",
        "data": {
            "id": new_order.id,
            "customer_id": new_order.customer_id,
            "status": new_order.status,
            "status_label": STATUS_LABELS_SOLICITUD.get(new_order.status, new_order.status),
            "solicitud_tipo": new_order.solicitud_tipo,
            "sale_type": new_order.sale_type,
            "created_at": new_order.created_at.isoformat(),
        }
    }



# ══════════════════════════════════════════════════════════════════════════════
# CRM PIPELINE — STAGES (columnas Kanban personalizables por usuario)
# ══════════════════════════════════════════════════════════════════════════════

from sqlalchemy import Column as SAColumn, Integer as SAInt, String as SAStr, text
from app.db.database import Base

class PipelineStage(Base):
    __tablename__ = "pipeline_stages"
    __table_args__ = {"extend_existing": True}
    id             = SAColumn(SAInt, primary_key=True, index=True)
    name           = SAColumn(SAStr(100), nullable=False)
    color          = SAColumn(SAStr(50),  default="bg-blue-500")
    bg_color       = SAColumn(SAStr(50),  default="bg-blue-50")
    position       = SAColumn(SAInt,      default=0)
    maps_to_status = SAColumn(SAStr(50),  nullable=True)

def _stage_to_dict(s):
    return {"id": s.id, "name": s.name, "color": s.color, "bg_color": s.bg_color,
            "position": s.position, "maps_to_status": s.maps_to_status}

@router.get("/pipeline-stages", response_model=dict)
def get_pipeline_stages(db: Session = Depends(get_db)):
    stages = db.query(PipelineStage).order_by(PipelineStage.position).all()
    return {"status": "success", "data": [_stage_to_dict(s) for s in stages]}

@router.post("/pipeline-stages", response_model=dict)
def create_pipeline_stage(body: dict, db: Session = Depends(get_db)):
    max_pos = db.execute(text("SELECT COALESCE(MAX(position),0) FROM pipeline_stages")).scalar()
    stage = PipelineStage(
        name=body.get("name", "Nueva Etapa"),
        color=body.get("color", "bg-purple-500"),
        bg_color=body.get("bg_color", "bg-purple-50"),
        position=max_pos + 1,
        maps_to_status=body.get("maps_to_status", "DRAFT"),
    )
    db.add(stage); db.commit(); db.refresh(stage)
    return {"status": "success", "data": _stage_to_dict(stage)}

@router.put("/pipeline-stages/{stage_id}", response_model=dict)
def update_pipeline_stage(stage_id: int, body: dict, db: Session = Depends(get_db)):
    stage = db.query(PipelineStage).filter(PipelineStage.id == stage_id).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    for field in ("name", "color", "bg_color", "position", "maps_to_status"):
        if field in body:
            setattr(stage, field, body[field])
    db.commit(); db.refresh(stage)
    return {"status": "success", "data": _stage_to_dict(stage)}

@router.delete("/pipeline-stages/{stage_id}", response_model=dict)
def delete_pipeline_stage(stage_id: int, db: Session = Depends(get_db)):
    stage = db.query(PipelineStage).filter(PipelineStage.id == stage_id).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    db.delete(stage); db.commit()
    return {"status": "success", "data": {"message": "Etapa eliminada."}}


# ══════════════════════════════════════════════════════════════════════════════
# CRM PIPELINE — LEADS (tarjetas = SalesOrders enriquecidos)
# ══════════════════════════════════════════════════════════════════════════════

def _lead_to_dict(order, customer, stage, db=None) -> dict:
    days = (datetime.datetime.utcnow() - order.updated_at).days if order.updated_at else 0
    product_name = getattr(order, 'lead_product_name', None) or ""
    return {
        "id":                order.id,
        "client":            f"{customer.first_name} {customer.last_name}".strip(),
        "customer_id":       order.customer_id,
        "contact":           customer.phone or customer.email or "-",
        "email":             customer.email,
        "phone":             customer.phone,
        "city":              customer.city,
        "document":          customer.document or "",
        "value":             float(order.lead_value or 0),
        "source":            order.lead_source or "CRM",
        "tag":               order.solicitud_tipo or "Solicitud",
        "description":       order.lead_description or "",
        "status":            order.status,
        "status_label":      STATUS_LABELS.get(order.status, order.status),
        "solicitud_tipo":    order.solicitud_tipo,
        "pipeline_stage_id": order.pipeline_stage_id,
        "stage_name":        stage.name if stage else STATUS_LABELS.get(order.status, order.status),
        "days":              days,
        "created_at":        order.created_at.isoformat() if order.created_at else None,
        "updated_at":        order.updated_at.isoformat() if order.updated_at else None,
        # New enriched fields
        "lead_product_name": product_name,
        "lead_product_sku_id": getattr(order, 'lead_product_sku_id', None),
        "lead_qty":          float(getattr(order, 'lead_qty', 1) or 1),
        "advisor_name":      getattr(order, 'advisor_name', None) or "",
    }

@router.get("/leads", response_model=dict)
def get_leads(db: Session = Depends(get_db)):
    orders = db.query(SalesOrder).filter(SalesOrder.status != "CANCELLED").order_by(SalesOrder.created_at.desc()).all()
    stages_map = {s.id: s for s in db.query(PipelineStage).all()}
    leads = []
    for order in orders:
        customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
        if not customer:
            continue
        stage = stages_map.get(order.pipeline_stage_id)
        leads.append(_lead_to_dict(order, customer, stage, db))
    return {"status": "success", "data": leads}


@router.patch("/leads/{lead_id}/stage", response_model=dict)
def move_lead_stage(lead_id: int, body: dict, db: Session = Depends(get_db)):
    order = db.query(SalesOrder).filter(SalesOrder.id == lead_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lead not found")
    stage = db.query(PipelineStage).filter(PipelineStage.id == body.get("pipeline_stage_id")).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    order.pipeline_stage_id = stage.id
    order.status = stage.maps_to_status or order.status
    order.updated_at = datetime.datetime.utcnow()
    db.commit(); db.refresh(order)
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    return {"status": "success", "data": _lead_to_dict(order, customer, stage)}

@router.patch("/leads/{lead_id}", response_model=dict)
def update_lead(lead_id: int, body: dict, db: Session = Depends(get_db)):
    order = db.query(SalesOrder).filter(SalesOrder.id == lead_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lead not found")
    field_map = {
        "lead_value": "lead_value",
        "lead_source": "lead_source",
        "lead_description": "lead_description",
        "description": "lead_description",  # alias
        "solicitud_tipo": "solicitud_tipo",
        "status": "status",
        "pipeline_stage_id": "pipeline_stage_id",
        "lead_product_name": "lead_product_name",
        "lead_product_sku_id": "lead_product_sku_id",
        "lead_qty": "lead_qty",
        "advisor_name": "advisor_name",
    }
    for key, attr in field_map.items():
        if key in body:
            try:
                setattr(order, attr, body[key])
            except AttributeError:
                pass
    order.updated_at = datetime.datetime.utcnow()
    db.commit(); db.refresh(order)
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    stage = db.query(PipelineStage).filter(PipelineStage.id == order.pipeline_stage_id).first() if order.pipeline_stage_id else None
    return {"status": "success", "data": _lead_to_dict(order, customer, stage, db)}

@router.delete("/leads/{lead_id}", response_model=dict)
def delete_lead(lead_id: int, db: Session = Depends(get_db)):
    order = db.query(SalesOrder).filter(SalesOrder.id == lead_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lead not found")
    try:
        for line in order.lines:
            db.delete(line)
        db.delete(order); db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "success", "data": {"message": "Lead eliminado."}}

@router.get("/leads/{lead_id}", response_model=dict)
def get_lead_detail(lead_id: int, db: Session = Depends(get_db)):
    order = db.query(SalesOrder).filter(SalesOrder.id == lead_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lead not found")
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    stage = db.query(PipelineStage).filter(PipelineStage.id == order.pipeline_stage_id).first() if order.pipeline_stage_id else None
    all_stages = db.query(PipelineStage).order_by(PipelineStage.position).all()
    lead = _lead_to_dict(order, customer, stage)
    lead["all_stages"] = [_stage_to_dict(s) for s in all_stages]
    return {"status": "success", "data": lead}


# ══════════════════════════════════════════════════════════════════════════════
# CALENDAR EVENTS — Modelo + Endpoints CRUD
# ══════════════════════════════════════════════════════════════════════════════

from sqlalchemy import Column as _Col, Integer as _Int, String as _Str, Text as _Txt
from sqlalchemy import DateTime as _DT, ForeignKey as _FK
from app.db.database import Base as _Base

class CalendarEvent(_Base):
    __tablename__ = "calendar_events"
    __table_args__ = {"extend_existing": True}
    id                 = _Col(_Int, primary_key=True, index=True)
    title              = _Col(_Str(200), nullable=False)
    description        = _Col(_Txt, nullable=True)
    start_datetime     = _Col(_DT, nullable=False)
    end_datetime       = _Col(_DT, nullable=True)
    event_type         = _Col(_Str(50), default="MEETING")
    location           = _Col(_Str(200), nullable=True)
    customer_id        = _Col(_Int, nullable=True)
    customer_name      = _Col(_Str(200), nullable=True)
    created_by         = _Col(_Str(100), default="CRM")
    google_event_id    = _Col(_Str(200), nullable=True)
    microsoft_event_id = _Col(_Str(200), nullable=True)
    sync_source        = _Col(_Str(50), default="INTERNAL")
    color              = _Col(_Str(50), default="indigo")
    created_at         = _Col(_DT, default=datetime.datetime.utcnow)
    updated_at         = _Col(_DT, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

def _event_to_dict(e: CalendarEvent) -> dict:
    return {
        "id":                  e.id,
        "title":               e.title,
        "description":         e.description or "",
        "start_datetime":      e.start_datetime.isoformat() if e.start_datetime else None,
        "end_datetime":        e.end_datetime.isoformat()   if e.end_datetime   else None,
        "event_type":          e.event_type or "MEETING",
        "location":            e.location or "",
        "customer_id":         e.customer_id,
        "customer_name":       e.customer_name or "",
        "created_by":          e.created_by or "CRM",
        "google_event_id":     e.google_event_id,
        "microsoft_event_id":  e.microsoft_event_id,
        "sync_source":         e.sync_source or "INTERNAL",
        "color":               e.color or "indigo",
        "created_at":          e.created_at.isoformat() if e.created_at else None,
    }

# ── GET all events (optional month/year filter) ───────────────────────────────
@router.get("/events", response_model=dict)
def get_events(month: int = None, year: int = None, db: Session = Depends(get_db)):
    query = db.query(CalendarEvent)
    if month and year:
        start = datetime.datetime(year, month, 1)
        if month == 12:
            end = datetime.datetime(year + 1, 1, 1)
        else:
            end = datetime.datetime(year, month + 1, 1)
        query = query.filter(CalendarEvent.start_datetime >= start, CalendarEvent.start_datetime < end)
    elif year:
        start = datetime.datetime(year, 1, 1)
        end = datetime.datetime(year + 1, 1, 1)
        query = query.filter(CalendarEvent.start_datetime >= start, CalendarEvent.start_datetime < end)
    events = query.order_by(CalendarEvent.start_datetime.asc()).all()
    return {"status": "success", "data": [_event_to_dict(e) for e in events]}

# ── GET events by customer ───────────────────────────────────────────────────
@router.get("/events/customer/{customer_id}", response_model=dict)
def get_customer_events(customer_id: int, db: Session = Depends(get_db)):
    events = db.query(CalendarEvent).filter(
        CalendarEvent.customer_id == customer_id
    ).order_by(CalendarEvent.start_datetime.desc()).all()
    return {"status": "success", "data": [_event_to_dict(e) for e in events]}

# ── GET single event ─────────────────────────────────────────────────────────
@router.get("/events/{event_id}", response_model=dict)
def get_event(event_id: int, db: Session = Depends(get_db)):
    e = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"status": "success", "data": _event_to_dict(e)}

# ── POST create event ─────────────────────────────────────────────────────────
@router.post("/events", response_model=dict)
def create_event(body: dict, db: Session = Depends(get_db)):
    try:
        start = datetime.datetime.fromisoformat(body["start_datetime"].replace("Z", ""))
    except (KeyError, ValueError):
        raise HTTPException(status_code=400, detail="start_datetime requerido (ISO 8601)")

    end = None
    if body.get("end_datetime"):
        try:
            end = datetime.datetime.fromisoformat(body["end_datetime"].replace("Z", ""))
        except ValueError:
            pass

    # Enrich customer_name if customer_id provided
    customer_name = body.get("customer_name", "")
    customer_id = body.get("customer_id")
    if customer_id and not customer_name:
        c = db.query(Customer).filter(Customer.id == customer_id).first()
        if c:
            customer_name = f"{c.first_name} {c.last_name}".strip()

    event = CalendarEvent(
        title=body.get("title", "Evento"),
        description=body.get("description", ""),
        start_datetime=start,
        end_datetime=end,
        event_type=body.get("event_type", "MEETING"),
        location=body.get("location", ""),
        customer_id=customer_id,
        customer_name=customer_name,
        created_by=body.get("created_by", "CRM"),
        google_event_id=body.get("google_event_id"),
        microsoft_event_id=body.get("microsoft_event_id"),
        sync_source=body.get("sync_source", "INTERNAL"),
        color=body.get("color", "indigo"),
    )
    db.add(event)
    try:
        db.commit()
        db.refresh(event)
    except Exception as ex:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(ex))
    return {"status": "success", "data": _event_to_dict(event)}

# ── PUT update event ──────────────────────────────────────────────────────────
@router.put("/events/{event_id}", response_model=dict)
def update_event(event_id: int, body: dict, db: Session = Depends(get_db)):
    e = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")

    updatable = ["title", "description", "event_type", "location", "customer_id",
                 "customer_name", "created_by", "color", "google_event_id",
                 "microsoft_event_id", "sync_source"]
    for f in updatable:
        if f in body:
            setattr(e, f, body[f])

    if "start_datetime" in body:
        try:
            e.start_datetime = datetime.datetime.fromisoformat(body["start_datetime"].replace("Z", ""))
        except ValueError:
            pass
    if "end_datetime" in body and body["end_datetime"]:
        try:
            e.end_datetime = datetime.datetime.fromisoformat(body["end_datetime"].replace("Z", ""))
        except ValueError:
            pass

    e.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(e)
    return {"status": "success", "data": _event_to_dict(e)}

# ── DELETE event ──────────────────────────────────────────────────────────────
@router.delete("/events/{event_id}", response_model=dict)
def delete_event(event_id: int, db: Session = Depends(get_db)):
    e = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(e)
    db.commit()
    return {"status": "success", "data": {"message": "Evento eliminado."}}


# ══════════════════════════════════════════════════════════════════════════════
# CRM — BÚSQUEDA DE CLIENTES (autocomplete para Nuevo Lead)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/customers/search", response_model=dict)
def search_customers(q: str = "", db: Session = Depends(get_db)):
    """Search customers by name, email, or phone for autocomplete in lead modal."""
    if not q or len(q) < 1:
        customers = db.query(Customer).limit(10).all()
    else:
        q_lower = f"%{q.lower()}%"
        customers = db.query(Customer).filter(
            (Customer.first_name.ilike(q_lower)) |
            (Customer.last_name.ilike(q_lower)) |
            (Customer.email.ilike(q_lower)) |
            (Customer.phone.ilike(q_lower)) |
            (Customer.document.ilike(q_lower))
        ).limit(15).all()
    return {
        "status": "success",
        "data": [
            {
                "id": c.id,
                "first_name": c.first_name,
                "last_name": c.last_name,
                "full_name": f"{c.first_name} {c.last_name}".strip(),
                "email": c.email or "",
                "phone": c.phone or "",
                "city": c.city or "",
                "document": c.document or "",
            }
            for c in customers
        ]
    }


# ══════════════════════════════════════════════════════════════════════════════
# CRM — BÚSQUEDA DE PRODUCTOS (autocomplete para campo de cotización)
# ══════════════════════════════════════════════════════════════════════════════

from app.models.catalog import Product, ProductSKU

@router.get("/products/search", response_model=dict)
def search_products(q: str = "", db: Session = Depends(get_db)):
    """Search products by name for autocomplete in lead quotation field."""
    try:
        if not q or len(q) < 1:
            products = db.query(Product).filter(Product.is_active == True).limit(10).all()
        else:
            q_lower = f"%{q.lower()}%"
            products = db.query(Product).filter(
                Product.is_active == True,
                (Product.name.ilike(q_lower)) | (Product.description.ilike(q_lower))
            ).limit(15).all()

        result = []
        for p in products:
            skus = db.query(ProductSKU).filter(ProductSKU.product_id == p.id).all()
            for sku in skus:
                result.append({
                    "id": sku.id,
                    "product_id": p.id,
                    "product_name": p.name,
                    "sku": sku.sku or "",
                    "sale_price": float(sku.sale_price or 0),
                    "cost_price": float(sku.cost_price or 0),
                    "display": f"{p.name}" + (f" — {sku.sku}" if sku.sku else ""),
                })
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "success", "data": [], "warning": str(e)}


@router.post("/products/quick-create", response_model=dict)
def quick_create_product(body: dict, db: Session = Depends(get_db)):
    """Quick-create a product from within the lead modal."""
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Product name is required")
    price = body.get("sale_price", 0)
    try:
        product = Product(name=name, description=body.get("description", ""), is_active=True,
                          base_currency="COP", uom="unidad")
        db.add(product); db.flush()
        sku = ProductSKU(product_id=product.id, sku=body.get("sku", name[:20].upper().replace(" ", "-")),
                         sale_price=price, cost_price=body.get("cost_price", 0))
        db.add(sku); db.commit()
        db.refresh(product); db.refresh(sku)
        return {"status": "success", "data": {
            "id": sku.id, "product_id": product.id, "product_name": product.name,
            "sku": sku.sku, "sale_price": float(sku.sale_price or 0), "display": product.name
        }}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ══════════════════════════════════════════════════════════════════════════════
# CRM — ENRIQUECER leads CON campos producto/asesor
# ══════════════════════════════════════════════════════════════════════════════

def _lead_to_dict_v2(order, customer, stage, db=None) -> dict:
    """Extended lead dict with product and advisor fields."""
    days = (datetime.datetime.utcnow() - order.updated_at).days if order.updated_at else 0
    # Resolve product name
    product_name = getattr(order, 'lead_product_name', None) or ""
    sku_id = getattr(order, 'lead_product_sku_id', None)
    if not product_name and sku_id and db:
        try:
            sku = db.query(ProductSKU).filter(ProductSKU.id == sku_id).first()
            if sku:
                prod = db.query(Product).filter(Product.id == sku.product_id).first()
                product_name = prod.name if prod else ""
        except Exception:
            pass
    return {
        "id":                order.id,
        "client":            f"{customer.first_name} {customer.last_name}".strip(),
        "customer_id":       order.customer_id,
        "contact":           customer.phone or customer.email or "-",
        "email":             customer.email,
        "phone":             customer.phone,
        "city":              customer.city,
        "document":          customer.document or "",
        "value":             float(order.lead_value or 0),
        "source":            order.lead_source or "CRM",
        "tag":               order.solicitud_tipo or "Solicitud",
        "description":       order.lead_description or "",
        "status":            order.status,
        "status_label":      STATUS_LABELS.get(order.status, order.status),
        "solicitud_tipo":    order.solicitud_tipo,
        "pipeline_stage_id": order.pipeline_stage_id,
        "stage_name":        stage.name if stage else STATUS_LABELS.get(order.status, order.status),
        "days":              days,
        "created_at":        order.created_at.isoformat() if order.created_at else None,
        "updated_at":        order.updated_at.isoformat() if order.updated_at else None,
        # New fields
        "lead_product_name": product_name,
        "lead_product_sku_id": sku_id,
        "lead_qty":          float(getattr(order, 'lead_qty', 1) or 1),
        "advisor_name":      getattr(order, 'advisor_name', None) or "",
    }


@router.get("/leads/v2", response_model=dict)
def get_leads_v2(db: Session = Depends(get_db)):
    """Enhanced leads endpoint with product and advisor data."""
    orders = db.query(SalesOrder).filter(SalesOrder.status != "CANCELLED").order_by(SalesOrder.created_at.desc()).all()
    stages_map = {s.id: s for s in db.query(PipelineStage).all()}
    leads = []
    for order in orders:
        customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
        if not customer:
            continue
        stage = stages_map.get(order.pipeline_stage_id)
        leads.append(_lead_to_dict_v2(order, customer, stage, db))
    return {"status": "success", "data": leads}


@router.patch("/leads/{lead_id}/v2", response_model=dict)
def update_lead_v2(lead_id: int, body: dict, db: Session = Depends(get_db)):
    """Extended lead update with product, qty, advisor fields."""
    order = db.query(SalesOrder).filter(SalesOrder.id == lead_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lead not found")
    fields = ("lead_value", "lead_source", "lead_description", "solicitud_tipo",
              "status", "pipeline_stage_id", "lead_product_name", "lead_product_sku_id",
              "lead_qty", "advisor_name")
    for field in fields:
        if field in body:
            setattr(order, field, body[field])
    order.updated_at = datetime.datetime.utcnow()
    db.commit(); db.refresh(order)
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    stage = db.query(PipelineStage).filter(PipelineStage.id == order.pipeline_stage_id).first() if order.pipeline_stage_id else None
    return {"status": "success", "data": _lead_to_dict_v2(order, customer, stage, db)}


@router.post("/leads", response_model=dict)  # Override original to add new fields
def create_lead_v2(body: dict, db: Session = Depends(get_db)):
    """Create a lead with all fields including product and advisor."""
    customer_id = body.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id is required")
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    stage_id = body.get("pipeline_stage_id")
    stage = None
    pipeline_status = "DRAFT"
    if stage_id:
        stage = db.query(PipelineStage).filter(PipelineStage.id == stage_id).first()
        if stage and stage.maps_to_status:
            pipeline_status = stage.maps_to_status
    else:
        stage = db.query(PipelineStage).order_by(PipelineStage.position).first()
        if stage:
            stage_id = stage.id
            pipeline_status = stage.maps_to_status or "DRAFT"
    tipo = body.get("solicitud_tipo", "Solicitud de Cotizacion")
    new_order = SalesOrder(
        customer_id=customer_id,
        status=pipeline_status,
        sale_type=body.get("sale_type", "ON_DEMAND"),
        solicitud_tipo=tipo,
        lead_value=body.get("lead_value", 0),
        lead_source=body.get("lead_source", "CRM"),
        lead_description=body.get("description", ""),
        pipeline_stage_id=stage_id,
        lead_product_name=body.get("lead_product_name", ""),
        lead_product_sku_id=body.get("lead_product_sku_id"),
        lead_qty=body.get("lead_qty", 1),
        advisor_name=body.get("advisor_name", ""),
    )
    db.add(new_order)
    try:
        db.commit(); db.refresh(new_order)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "success", "data": _lead_to_dict_v2(new_order, customer, stage, db)}


# ══════════════════════════════════════════════════════════════════════════════
# CRM — ACCIONES HACIA VENTAS (conversión de lead)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/leads/{lead_id}/to-solicitud", response_model=dict)
def lead_to_solicitud(lead_id: int, db: Session = Depends(get_db)):
    """Promote lead to formal Solicitud de Cliente in Ventas."""
    order = db.query(SalesOrder).filter(SalesOrder.id == lead_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lead not found")
    # Move to stage 2 (Solicitud de Cliente) if it exists
    stage = db.query(PipelineStage).filter(PipelineStage.maps_to_status == "PENDING").first()
    if stage:
        order.pipeline_stage_id = stage.id
        order.status = "PENDING"
    else:
        order.status = "PENDING"
    order.updated_at = datetime.datetime.utcnow()
    db.commit(); db.refresh(order)
    return {"status": "success", "data": {"id": order.id, "status": order.status,
            "message": "Lead promovido a Solicitud de Cliente", "redirect": f"/dashboard/ventas/solicitud"}}


@router.post("/leads/{lead_id}/to-cotizacion", response_model=dict)
def lead_to_cotizacion(lead_id: int, db: Session = Depends(get_db)):
    """Promote lead to Cotización stage in Ventas."""
    order = db.query(SalesOrder).filter(SalesOrder.id == lead_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lead not found")
    stage = db.query(PipelineStage).filter(PipelineStage.maps_to_status == "QUOTATION").first()
    if stage:
        order.pipeline_stage_id = stage.id
        order.status = "QUOTATION"
    else:
        order.status = "QUOTATION"
    order.solicitud_tipo = "Solicitud de Cotizacion"
    order.updated_at = datetime.datetime.utcnow()
    db.commit(); db.refresh(order)
    return {"status": "success", "data": {"id": order.id, "status": "QUOTATION",
            "message": "Lead promovido a Cotización", "redirect": f"/dashboard/ventas/cotizacion"}}


@router.post("/leads/{lead_id}/to-pedido", response_model=dict)
def lead_to_pedido(lead_id: int, db: Session = Depends(get_db)):
    """Promote lead to Pedido de Venta."""
    order = db.query(SalesOrder).filter(SalesOrder.id == lead_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Lead not found")
    stage = db.query(PipelineStage).filter(PipelineStage.maps_to_status == "INVOICED").first()
    if stage:
        order.pipeline_stage_id = stage.id
        order.status = "INVOICED"
    else:
        order.status = "INVOICED"
    order.updated_at = datetime.datetime.utcnow()
    db.commit(); db.refresh(order)
    return {"status": "success", "data": {"id": order.id, "status": "INVOICED",
            "message": "Lead promovido a Pedido de Venta", "redirect": f"/dashboard/ventas/pedido"}}


# ══════════════════════════════════════════════════════════════════════════════
# CRM — CONFIGURACIÓN DEL PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/pipeline-stages/config", response_model=dict)
def get_pipeline_config(db: Session = Depends(get_db)):
    """Get all pipeline stages with full config including alert settings."""
    stages = db.query(PipelineStage).order_by(PipelineStage.position).all()
    return {
        "status": "success",
        "data": [
            {
                "id": s.id,
                "name": s.name,
                "color": s.color,
                "bg_color": s.bg_color,
                "position": s.position,
                "maps_to_status": s.maps_to_status,
                "alert_days": getattr(s, 'alert_days', 7),
                "alert_message": getattr(s, 'alert_message', 'Lead sin actividad'),
                "is_closed": getattr(s, 'is_closed', False),
                "pipeline_name": getattr(s, 'pipeline_name', 'Principal'),
            }
            for s in stages
        ]
    }


@router.put("/pipeline-stages/{stage_id}/config", response_model=dict)
def update_pipeline_stage_config(stage_id: int, body: dict, db: Session = Depends(get_db)):
    """Update pipeline stage with all config fields including alert settings."""
    stage = db.query(PipelineStage).filter(PipelineStage.id == stage_id).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    for field in ("name", "color", "bg_color", "position", "maps_to_status",
                  "alert_days", "alert_message", "is_closed", "pipeline_name"):
        if field in body:
            try:
                setattr(stage, field, body[field])
            except AttributeError:
                pass
    db.commit(); db.refresh(stage)
    return {"status": "success", "data": {
        "id": stage.id, "name": stage.name, "color": stage.color,
        "bg_color": stage.bg_color, "position": stage.position,
        "maps_to_status": stage.maps_to_status,
        "alert_days": getattr(stage, 'alert_days', 7),
        "alert_message": getattr(stage, 'alert_message', ''),
        "is_closed": getattr(stage, 'is_closed', False),
    }}
