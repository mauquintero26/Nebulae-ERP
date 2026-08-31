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
        "created_at": None,  # We don't have a created_at on Customer yet
        "total": 0,
        "lines_count": 0,
        "description": "Ficha del cliente registrada en el sistema.",
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

def _lead_to_dict(order, customer, stage) -> dict:
    days = (datetime.datetime.utcnow() - order.updated_at).days if order.updated_at else 0
    return {
        "id":                order.id,
        "client":            f"{customer.first_name} {customer.last_name}".strip(),
        "customer_id":       order.customer_id,
        "contact":           customer.phone or customer.email or "-",
        "email":             customer.email,
        "phone":             customer.phone,
        "city":              customer.city,
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
        leads.append(_lead_to_dict(order, customer, stage))
    return {"status": "success", "data": leads}

@router.post("/leads", response_model=dict)
def create_lead(body: dict, db: Session = Depends(get_db)):
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
    )
    db.add(new_order)
    try:
        db.commit(); db.refresh(new_order)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "success", "data": _lead_to_dict(new_order, customer, stage)}

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
    for field in ("lead_value", "lead_source", "lead_description", "solicitud_tipo", "status", "pipeline_stage_id"):
        if field in body:
            setattr(order, field, body[field])
    order.updated_at = datetime.datetime.utcnow()
    db.commit(); db.refresh(order)
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    stage = db.query(PipelineStage).filter(PipelineStage.id == order.pipeline_stage_id).first() if order.pipeline_stage_id else None
    return {"status": "success", "data": _lead_to_dict(order, customer, stage)}

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
