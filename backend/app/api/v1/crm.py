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
    "DRAFT": "Solicitud en borrador",
    "QUOTATION": "Cotización enviada",
    "TO_INVOICE": "Pendiente de facturación",
    "INVOICED": "Facturado",
    "CANCELLED": "Cancelado",
    "PENDING": "Pendiente",
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

        if order.status != "CANCELLED":
            active_orders.append({
                "id": order.id,
                "status": order.status,
                "status_label": STATUS_LABELS.get(order.status, order.status),
                "color": STATUS_COLORS.get(order.status, "slate"),
                "created_at": order.created_at.isoformat(),
                "total": round(float(order_total), 2),
                "lines_count": len(order.lines),
            })

        # Timeline activity entry for every order
        all_orders_timeline.append({
            "type": "sale_order",
            "id": order.id,
            "status": order.status,
            "status_label": STATUS_LABELS.get(order.status, order.status),
            "color": STATUS_COLORS.get(order.status, "slate"),
            "created_at": order.created_at.isoformat(),
            "total": round(float(order_total), 2),
            "lines_count": len(order.lines),
            "description": f"Orden #{order.id} - {STATUS_LABELS.get(order.status, order.status)}",
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
# CUSTOMER SALES ORDERS (Nueva Solicitud from Agenda)
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/customers/{customer_id}/solicitudes", response_model=dict)
def create_customer_solicitud(customer_id: int, body: dict, db: Session = Depends(get_db)):
    """Creates a DRAFT sales order (Solicitud) linked to a customer from the CRM Agenda."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    new_order = SalesOrder(
        customer_id=customer_id,
        status="DRAFT",
        sale_type=body.get("sale_type", "ON_DEMAND"),
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
            "sale_type": new_order.sale_type,
            "created_at": new_order.created_at.isoformat(),
        }
    }
