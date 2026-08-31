from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.crm import Alert
from app.models.sales import SalesOrder
from app.schemas import crm as schemas
import datetime

router = APIRouter()

def generate_crm_alerts(db: Session):
    # Rule: If a lead has been in QUOTING or PENDING_PAYMENT for 48 hours, generate 'Alerta de Seguimiento'
    two_days_ago = datetime.datetime.utcnow() - datetime.timedelta(hours=48)
    
    stalled_orders = db.query(SalesOrder).filter(
        SalesOrder.status.in_(["QUOTING", "PENDING_PAYMENT"]),
        SalesOrder.updated_at <= two_days_ago
    ).all()
    
    for order in stalled_orders:
        # Check if alert already exists to prevent duplicates
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
    # Rule: Sweep ON_DEMAND sales. If estimated_delivery_date is within `days_before`, generate DELIVERY_ALERT
    target_date = datetime.datetime.utcnow() + datetime.timedelta(days=days_before)
    today = datetime.datetime.utcnow()
    
    pending_deliveries = db.query(SalesOrder).filter(
        SalesOrder.sale_type == "ON_DEMAND",
        SalesOrder.status.in_(["PENDING", "QUOTING", "PENDING_PAYMENT"]), # Still pending delivery conceptually
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
    background_tasks.add_task(generate_delivery_alerts, db, 5) # 5 days configurable threshold
    return {"status": "success", "message": "Alert generation triggered in background."}

@router.get("/calendar")
def get_crm_calendar(db: Session = Depends(get_db)):
    alerts = db.query(Alert).filter(Alert.alert_type == "CRM_FOLLOWUP").all()
    
    # Group by date (YYYY-MM-DD)
    calendar_dict = {}
    for alert in alerts:
        date_str = alert.due_date.strftime("%Y-%m-%d")
        if date_str not in calendar_dict:
            calendar_dict[date_str] = []
        calendar_dict[date_str].append(schemas.AlertResponse.model_validate(alert).model_dump())
        
    response_data = []
    for date_str, alert_list in calendar_dict.items():
        response_data.append({
            "date": date_str,
            "alerts": alert_list
        })
        
    return {"status": "success", "data": response_data}

from app.models.customers import Customer
from decimal import Decimal

@router.get("/customers/{customer_id}/profile-360")
def get_customer_360_profile(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
        
    # Get all active orders (not CANCELLED)
    active_orders = []
    ltv = Decimal("0.0")
    
    for order in customer.sales_orders:
        order_total = sum((line.unit_price * line.quantity) for line in order.lines)
        
        if order.status != "CANCELLED":
            active_orders.append({
                "id": order.id,
                "status": order.status,
                "created_at": order.created_at.isoformat(),
                "total": round(order_total, 2)
            })
            
        # Lifetime Value usually implies paid/invoiced, but let's sum all non-cancelled for now 
        # or specifically "INVOICED" / "COMPLETED" / "PAID"
        if order.status in ["INVOICED", "COMPLETED", "DONE", "PAID"]:
            ltv += order_total
            
    # Optionally sort or group active_orders, but returning the list of dicts covers the requirement
    
    profile = schemas.Customer360Profile(
        id=customer.id,
        first_name=customer.first_name,
        last_name=customer.last_name,
        email=customer.email,
        phone=customer.phone,
        active_orders=active_orders,
        ltv=round(ltv, 2)
    )
    
    return {"status": "success", "data": profile.model_dump(mode="json")}

from app.schemas.crm import CustomerCreate, CustomerResponse

@router.post("/customers", response_model=dict)
def create_customer(customer: CustomerCreate, db: Session = Depends(get_db)):
    db_customer = Customer(
        first_name=customer.first_name,
        last_name=customer.last_name,
        email=customer.email,
        phone=customer.phone,
        city=customer.city
    )
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return {"status": "success", "data": CustomerResponse.model_validate(db_customer).model_dump()}

@router.get("/customers", response_model=dict)
def get_customers(db: Session = Depends(get_db)):
    customers = db.query(Customer).all()
    return {"status": "success", "data": [CustomerResponse.model_validate(c).model_dump() for c in customers]}
