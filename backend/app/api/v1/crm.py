from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, Response
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.crm import Alert
from app.models.sales import SalesOrder
from typing import Optional, List
from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder, ActivityLog, PurchaseOrderFull
from app.models.fase1b import CustomerRequestLine, SalesQuotationLine, SaleOrderLineErp, InventoryReservation, ProcurementAllocation
from app.models.fase4 import SaleOrderPayment, SalePackingSession, SalePackingItem, SaleOrderDelivery, SaleOrderDeliveryLine, SaleOrderReturn, SaleOrderReturnLine
from app.models.fase5 import CustomerAgendaActivity, CustomerContactPreference
from app.models.users import User
from app.api.dependencies import get_optional_current_user, normalize_role, require_roles, ROLE_ADMIN, ROLE_FINANZAS, ALL_ERP_ROLES
from app.api.v1.schemas_fase5 import AgendaActivityCreate, AgendaActivityResponse

from app.schemas import crm as schemas
import datetime, time, threading

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

router = APIRouter()

# ── In-memory TTL cache for rarely-changing data ──────────────────────────────
_cache_lock = threading.Lock()
_stages_cache = {"data": None, "expires": 0}   # Invalidated on stage write
_STAGES_TTL = 60  # seconds

def _invalidate_stages_cache():
    with _cache_lock:
        _stages_cache["expires"] = 0

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


def _sync_operational_agenda_deterministic(db: Session, target_customer_id: Optional[int] = None) -> int:
    """Genera y actualiza de manera determinista las actividades de agenda y calendario del cliente."""
    synced_count = 0
    now = datetime.datetime.utcnow()

    # Filtro de cliente si aplica
    so_query = db.query(SaleOrder)
    if target_customer_id:
        so_query = so_query.filter(SaleOrder.customer_id == target_customer_id)
    sales_orders = so_query.all()

    for so in sales_orders:
        if not so.customer_id:
            continue
        c_id = so.customer_id

        # 1. Anticipo pendiente
        if (so.saldo_cop or 0) > 0 and so.estado in ("PENDIENTE_COMPRA", "BORRADOR"):
            key = f"{c_id}_SALE_ORDER_{so.id}_ANTICIPO_PENDIENTE"
            existing = db.query(CustomerAgendaActivity).filter(CustomerAgendaActivity.deterministic_key == key).first()
            if not existing:
                db.add(CustomerAgendaActivity(
                    customer_id=c_id,
                    entity_type="SALE_ORDER",
                    entity_id=so.id,
                    activity_type="ANTICIPO_PENDIENTE",
                    title=f"Anticipo pendiente para pedido {so.numero}",
                    description=f"Pedido {so.numero} tiene saldo pendiente de anticipo (${float(so.total_cop or 0):,.0f} COP).",
                    scheduled_date=so.created_at,
                    due_date=so.fecha_entrega_estimada or (so.created_at + datetime.timedelta(days=3) if so.created_at else now),
                    status="PENDIENTE",
                    deterministic_key=key,
                ))
                synced_count += 1

        # 2. Saldo pendiente al estar listo para entrega
        if so.estado == "LISTO_ENTREGA" and (so.saldo_cop or 0) > 0:
            key = f"{c_id}_SALE_ORDER_{so.id}_SALDO_PENDIENTE"
            existing = db.query(CustomerAgendaActivity).filter(CustomerAgendaActivity.deterministic_key == key).first()
            if not existing:
                db.add(CustomerAgendaActivity(
                    customer_id=c_id,
                    entity_type="SALE_ORDER",
                    entity_id=so.id,
                    activity_type="SALDO_PENDIENTE",
                    title=f"Cobro de saldo para entrega del pedido {so.numero}",
                    description=f"Pedido {so.numero} esta listo para entregar pero tiene saldo de ${float(so.saldo_cop or 0):,.0f} COP.",
                    scheduled_date=now,
                    due_date=now + datetime.timedelta(days=2),
                    status="PENDIENTE",
                    deterministic_key=key,
                ))
                synced_count += 1

        # 3. Mercancia lista para entregar
        if so.estado == "LISTO_ENTREGA":
            key = f"{c_id}_SALE_ORDER_{so.id}_MERCANCIA_LISTA"
            existing = db.query(CustomerAgendaActivity).filter(CustomerAgendaActivity.deterministic_key == key).first()
            if not existing:
                db.add(CustomerAgendaActivity(
                    customer_id=c_id,
                    entity_type="SALE_ORDER",
                    entity_id=so.id,
                    activity_type="MERCANCIA_LISTA",
                    title=f"Mercancia lista para entrega: {so.numero}",
                    description=f"Todos los articulos del pedido {so.numero} se encuentran disponibles en bodega.",
                    scheduled_date=now,
                    due_date=now + datetime.timedelta(days=3),
                    status="PENDIENTE",
                    deterministic_key=key,
                ))
                synced_count += 1

    # Empaques en proceso
    pack_query = db.query(SalePackingSession).filter(SalePackingSession.status == "EN_PROCESO")
    if target_customer_id:
        pack_query = pack_query.filter(SalePackingSession.customer_id == target_customer_id)
    for p in pack_query.all():
        key = f"{p.customer_id}_PACKING_{p.id}_EMPAQUE_PENDIENTE"
        existing = db.query(CustomerAgendaActivity).filter(CustomerAgendaActivity.deterministic_key == key).first()
        if not existing:
            db.add(CustomerAgendaActivity(
                customer_id=p.customer_id,
                entity_type="PACKING",
                entity_id=p.id,
                activity_type="EMPAQUE_PENDIENTE",
                title=f"Empaque en curso {p.numero}",
                description=f"Sesion de empaque {p.numero} pendiente de verificacion y cierre.",
                scheduled_date=p.created_at,
                due_date=now + datetime.timedelta(days=1),
                status="PENDIENTE",
                deterministic_key=key,
            ))
            synced_count += 1

    # Entregas pendientes o despachadas
    deliv_query = db.query(SaleOrderDelivery).filter(SaleOrderDelivery.status.in_(["BORRADOR", "PREPARANDO", "DESPACHADO", "EN_TRANSITO"]))
    if target_customer_id:
        deliv_query = deliv_query.filter(SaleOrderDelivery.customer_id == target_customer_id)
    for d in deliv_query.all():
        act_type = "DESPACHO_PROGRAMADO" if d.status in ("BORRADOR", "PREPARANDO") else "ENTREGA_PENDIENTE"
        key = f"{d.customer_id}_DELIVERY_{d.id}_{act_type}"
        existing = db.query(CustomerAgendaActivity).filter(CustomerAgendaActivity.deterministic_key == key).first()
        if not existing:
            db.add(CustomerAgendaActivity(
                customer_id=d.customer_id,
                entity_type="DELIVERY",
                entity_id=d.id,
                activity_type=act_type,
                title=f"{act_type.replace('_', ' ').capitalize()}: {d.numero}",
                description=f"Entrega {d.numero} ({d.status}) - Transportadora: {d.carrier or 'Local'}, Guia: {d.tracking_number or 'Pendiente'}",
                scheduled_date=d.scheduled_date or d.dispatch_date or d.created_at,
                due_date=d.scheduled_date or now + datetime.timedelta(days=3),
                status="PENDIENTE",
                deterministic_key=key,
            ))
            synced_count += 1

    # Devoluciones
    ret_query = db.query(SaleOrderReturn).filter(SaleOrderReturn.status == "REGISTRADA")
    if target_customer_id:
        ret_query = ret_query.filter(SaleOrderReturn.customer_id == target_customer_id)
    for r in ret_query.all():
        key = f"{r.customer_id}_RETURN_{r.id}_GARANTIA_DEVOLUCION"
        existing = db.query(CustomerAgendaActivity).filter(CustomerAgendaActivity.deterministic_key == key).first()
        if not existing:
            db.add(CustomerAgendaActivity(
                customer_id=r.customer_id,
                entity_type="RETURN",
                entity_id=r.id,
                activity_type="GARANTIA_DEVOLUCION",
                title=f"Gestion de devolucion {r.numero}",
                description=f"Devolucion {r.numero} en evaluacion. Resolucion financiera: {r.financial_resolution}.",
                scheduled_date=r.created_at,
                due_date=now + datetime.timedelta(days=2),
                status="PENDIENTE",
                deterministic_key=key,
            ))
            synced_count += 1

    db.commit()
    return synced_count

@router.get("/customers/{customer_id}/profile-360")
def get_customer_360_profile(
    customer_id: int,
    user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # 1. Fetch canonical entities
    canonical_sos = db.query(SaleOrder).filter(SaleOrder.customer_id == customer_id).all()
    canonical_scs = db.query(CustomerRequest).filter(CustomerRequest.customer_id == customer_id).all()
    canonical_cots = db.query(SalesQuotation).filter(SalesQuotation.customer_id == customer_id).all()
    payments = db.query(SaleOrderPayment).filter(SaleOrderPayment.customer_id == customer_id).all()
    packings = db.query(SalePackingSession).filter(SalePackingSession.customer_id == customer_id).all()
    deliveries = db.query(SaleOrderDelivery).filter(SaleOrderDelivery.customer_id == customer_id).all()
    returns = db.query(SaleOrderReturn).filter(SaleOrderReturn.customer_id == customer_id).all()
    agenda_items = db.query(CustomerAgendaActivity).filter(CustomerAgendaActivity.customer_id == customer_id).all()
    contact_pref = db.query(CustomerContactPreference).filter(CustomerContactPreference.customer_id == customer_id).first()

    # Determine RBAC visibility for profitability/costs
    user_role = normalize_role(user.role) if (user and hasattr(user, "role") and user.role) else ""
    can_view_finance = user_role in ("ADMIN", "FINANZAS")

    # 2. Financial totals
    total_comprado_cop = Decimal("0.0")
    total_pagado_cop = Decimal("0.0")
    saldo_pendiente_cop = Decimal("0.0")
    saldo_a_favor_cop = Decimal("0.0")
    total_costo_cop = Decimal("0.0")

    so_ids = [so.id for so in canonical_sos]
    so_lines = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id.in_(so_ids)).all() if so_ids else []

    reservations = db.query(InventoryReservation).filter(
        InventoryReservation.sale_order_line_id.in_([l.id for l in so_lines]),
        InventoryReservation.status == "ACTIVE"
    ).all() if so_lines else []

    allocations = db.query(ProcurementAllocation).filter(
        ProcurementAllocation.sale_order_line_id.in_([l.id for l in so_lines])
    ).all() if so_lines else []

    active_orders = []
    all_orders_timeline = []

    # Include legacy orders if present
    for order in customer.sales_orders:
        order_total = sum((line.unit_price * line.quantity) for line in order.lines)
        tipo_display = getattr(order, "solicitud_tipo", None) or "Solicitud"
        estado_display = STATUS_LABELS.get(order.status, order.status)
        if order.status != "CANCELLED":
            active_orders.append({
                "id": order.id,
                "status": order.status,
                "status_label": estado_display,
                "solicitud_tipo": tipo_display,
                "color": STATUS_COLORS.get(order.status, "slate"),
                "created_at": order.created_at.isoformat() if order.created_at else "",
                "total": round(float(order_total), 2),
                "lines_count": len(order.lines),
            })
        all_orders_timeline.append({
            "type": "sale_order_legacy",
            "id": order.id,
            "status": order.status,
            "status_label": tipo_display,
            "estado_label": estado_display,
            "color": STATUS_COLORS.get(order.status, "slate"),
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "total": round(float(order_total), 2),
            "lines_count": len(order.lines),
            "description": f"ESTADO: {estado_display}",
        })

    # Process canonical SaleOrders
    pedidos_data = []
    for so in canonical_sos:
        t_cop = Decimal(str(so.total_cop or 0))
        s_cop = Decimal(str(so.saldo_cop or 0))
        if so.estado != "CANCELADO":
            total_comprado_cop += t_cop
            saldo_pendiente_cop += s_cop
            active_orders.append({
                "id": so.id,
                "numero": so.numero,
                "status": so.estado,
                "status_label": so.estado,
                "solicitud_tipo": "Pedido de Venta",
                "color": "emerald" if so.estado in ("ENTREGADO", "FACTURADO") else "blue",
                "created_at": so.created_at.isoformat() if so.created_at else "",
                "total": round(float(t_cop), 2),
                "saldo": round(float(s_cop), 2),
                "lines_count": len([l for l in so_lines if l.so_id == so.id]),
            })

        pedidos_data.append({
            "id": so.id,
            "numero": so.numero,
            "estado": so.estado,
            "total_cop": float(t_cop),
            "anticipo_cop": float(so.anticipo_cop or 0),
            "saldo_cop": float(s_cop),
            "fecha_entrega_estimada": so.fecha_entrega_estimada.isoformat() if so.fecha_entrega_estimada else None,
            "created_at": so.created_at.isoformat() if so.created_at else None,
        })

        all_orders_timeline.append({
            "type": "sale_order",
            "id": so.id,
            "numero": so.numero,
            "status": so.estado,
            "status_label": f"Pedido {so.numero}",
            "estado_label": so.estado,
            "color": "emerald" if so.estado in ("ENTREGADO", "FACTURADO") else "blue",
            "created_at": so.created_at.isoformat() if so.created_at else None,
            "total": round(float(t_cop), 2),
            "description": f"Pedido {so.numero} en estado {so.estado} - Total: ${float(t_cop):,.0f} COP",
        })

    # Line costs for rentabilidad
    for l in so_lines:
        cost = Decimal(str(l.cost_unit_cop_snapshot or 0)) * Decimal(str(l.quantity or 0))
        total_costo_cop += cost

    # Payments
    pagos_data = []
    for p in payments:
        p_monto = Decimal(str(p.monto or 0))
        if p.estado == "CONFIRMADO":
            if p.tipo in ("ANTICIPO", "ABONO", "PAGO_TOTAL", "PAGO_SALDO"):
                total_pagado_cop += p_monto
            elif p.tipo == "DEVOLUCION":
                total_pagado_cop -= p_monto
        pagos_data.append({
            "id": p.id,
            "tipo": p.tipo,
            "monto": float(p_monto),
            "estado": p.estado,
            "fecha": p.fecha.isoformat() if p.fecha else None,
            "metodo_pago": p.metodo_pago,
            "referencia": p.referencia_bancaria,
        })
        all_orders_timeline.append({
            "type": "payment",
            "id": p.id,
            "status": p.estado,
            "status_label": f"Pago {p.tipo}",
            "estado_label": p.estado,
            "color": "emerald" if p.estado == "CONFIRMADO" else "amber",
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "total": float(p_monto),
            "description": f"{p.tipo} de ${float(p_monto):,.0f} COP ({p.estado})",
        })

    # Solicitudes (SC)
    solicitudes_data = []
    for sc in canonical_scs:
        solicitudes_data.append({
            "id": sc.id,
            "numero": sc.numero,
            "estado": sc.estado,
            "created_at": sc.created_at.isoformat() if sc.created_at else None,
        })
        all_orders_timeline.append({
            "type": "customer_request",
            "id": sc.id,
            "numero": sc.numero,
            "status": sc.estado,
            "status_label": f"Solicitud {sc.numero}",
            "estado_label": sc.estado,
            "color": "indigo",
            "created_at": sc.created_at.isoformat() if sc.created_at else None,
            "description": f"Solicitud de cliente {sc.numero} ({sc.estado})",
        })

    # Cotizaciones (COT)
    cotizaciones_data = []
    for cot in canonical_cots:
        cotizaciones_data.append({
            "id": cot.id,
            "numero": cot.numero,
            "estado": cot.estado,
            "total_cop": float(cot.total_cop or 0),
            "created_at": cot.created_at.isoformat() if cot.created_at else None,
        })
        all_orders_timeline.append({
            "type": "quotation",
            "id": cot.id,
            "numero": cot.numero,
            "status": cot.estado,
            "status_label": f"Cotización {cot.numero}",
            "estado_label": cot.estado,
            "color": "amber",
            "created_at": cot.created_at.isoformat() if cot.created_at else None,
            "total": float(cot.total_cop or 0),
            "description": f"Cotización {cot.numero} ({cot.estado}) - Total: ${float(cot.total_cop or 0):,.0f} COP",
        })

    # Empaques
    empaques_data = []
    for pack in packings:
        empaques_data.append({
            "id": pack.id,
            "numero": pack.numero,
            "status": pack.status,
            "created_at": pack.created_at.isoformat() if pack.created_at else None,
        })

    # Entregas
    entregas_data = []
    for deliv in deliveries:
        entregas_data.append({
            "id": deliv.id,
            "numero": deliv.numero,
            "delivery_method": deliv.delivery_method,
            "carrier": deliv.carrier,
            "tracking_number": deliv.tracking_number,
            "status": deliv.status,
            "dispatch_date": deliv.dispatch_date.isoformat() if deliv.dispatch_date else None,
            "delivery_date": deliv.delivery_date.isoformat() if deliv.delivery_date else None,
        })
        all_orders_timeline.append({
            "type": "delivery",
            "id": deliv.id,
            "numero": deliv.numero,
            "status": deliv.status,
            "status_label": f"Entrega {deliv.numero}",
            "estado_label": deliv.status,
            "color": "cyan",
            "created_at": deliv.created_at.isoformat() if deliv.created_at else None,
            "description": f"Entrega {deliv.numero} ({deliv.status}) - Guía: {deliv.tracking_number or 'Sin guía'}",
        })

    # Devoluciones
    devoluciones_data = []
    for ret in returns:
        if ret.status != "CANCELADA" and ret.financial_resolution == "SALDO_A_FAVOR":
            saldo_a_favor_cop += Decimal(str(ret.refund_amount or 0))
        devoluciones_data.append({
            "id": ret.id,
            "numero": ret.numero,
            "status": ret.status,
            "financial_resolution": ret.financial_resolution,
            "refund_amount": float(ret.refund_amount or 0),
            "created_at": ret.created_at.isoformat() if ret.created_at else None,
        })
        all_orders_timeline.append({
            "type": "return",
            "id": ret.id,
            "numero": ret.numero,
            "status": ret.status,
            "status_label": f"Devolución {ret.numero}",
            "estado_label": ret.status,
            "color": "red",
            "created_at": ret.created_at.isoformat() if ret.created_at else None,
            "description": f"Devolución {ret.numero} ({ret.status}) - Resolución: {ret.financial_resolution}",
        })

    # Reservas activas
    reservas_data = [{
        "id": r.id,
        "sku_id": r.sku_id,
        "warehouse_id": r.warehouse_id,
        "owner": r.owner,
        "quantity_reserved": float(r.quantity_reserved),
        "status": r.status,
    } for r in reservations]

    # Compras asignadas
    compras_asignadas_data = [{
        "id": a.id,
        "po_line_id": a.po_line_id,
        "quantity_allocated": float(a.quantity_allocated),
        "allocation_type": a.allocation_type,
    } for a in allocations]

    # Agenda / Calendario actividades
    agenda_data = [{
        "id": ag.id,
        "activity_type": ag.activity_type,
        "title": ag.title,
        "description": ag.description,
        "scheduled_date": ag.scheduled_date.isoformat() if ag.scheduled_date else None,
        "due_date": ag.due_date.isoformat() if ag.due_date else None,
        "status": ag.status,
    } for ag in agenda_items]

    for ag in agenda_items:
        all_orders_timeline.append({
            "type": "agenda_activity",
            "id": ag.id,
            "status": ag.status,
            "status_label": ag.title,
            "estado_label": ag.status,
            "color": "blue",
            "created_at": ag.created_at.isoformat() if ag.created_at else None,
            "description": f"{ag.activity_type}: {ag.description or ag.title}",
        })

    # Calendar events legacy (opcional si existe la tabla)
    cal_events = []
    try:
        cal_events = db.query(CalendarEvent).filter(
            CalendarEvent.customer_id == customer.id
        ).order_by(CalendarEvent.start_datetime.desc()).all()

        for ce in cal_events:
            all_orders_timeline.append({
                "type": "calendar_event",
                "id": ce.id,
                "status": "CALENDAR_EVENT",
                "status_label": ce.title,
                "estado_label": ce.title,
                "color": "indigo",
                "created_at": ce.created_at.isoformat() if ce.created_at else None,
                "description": ce.description or ce.title,
            })
    except Exception:
        db.rollback()

    # Cliente creado event
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

    all_orders_timeline.sort(
        key=lambda x: x["created_at"] if x.get("created_at") else "",
        reverse=True
    )

    ltv = total_comprado_cop

    # Rentabilidad logic (only visible to ADMIN and FINANZAS)
    rentabilidad_payload = None
    if can_view_finance:
        margen_bruto_cop = total_comprado_cop - total_costo_cop
        margen_bruto_pct = (margen_bruto_cop / total_comprado_cop * 100) if total_comprado_cop > 0 else Decimal("0.0")
        rentabilidad_payload = {
            "costo_total_cop": round(float(total_costo_cop), 2),
            "margen_bruto_cop": round(float(margen_bruto_cop), 2),
            "margen_bruto_pct": round(float(margen_bruto_pct), 2),
            "visible": True,
        }
    else:
        rentabilidad_payload = {
            "visible": False,
            "message": "Información financiera restringida a roles autorizados (ADMIN, FINANZAS)."
        }

    resumen_financiero = {
        "total_comprado_cop": round(float(total_comprado_cop), 2),
        "total_pagado_cop": round(float(total_pagado_cop), 2),
        "saldo_pendiente_cop": round(float(saldo_pendiente_cop), 2),
        "saldo_a_favor_cop": round(float(saldo_a_favor_cop), 2),
    }

    preferencias_payload = {
        "whatsapp_opt_in": contact_pref.whatsapp_opt_in if contact_pref else True,
        "email_opt_in": contact_pref.email_opt_in if contact_pref else True,
        "sms_opt_in": contact_pref.sms_opt_in if contact_pref else False,
        "phone_opt_in": contact_pref.phone_opt_in if contact_pref else True,
        "habeas_data_accepted": contact_pref.habeas_data_accepted if contact_pref else True,
        "consent_channel": contact_pref.consent_channel if contact_pref else "WEB",
        "consent_date": contact_pref.consent_date.isoformat() if (contact_pref and contact_pref.consent_date) else None,
    }

    profile = {
        # Legacy compatibility keys
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
        "total_orders": len(canonical_sos) + len(customer.sales_orders),
        "total_events": len(agenda_items) + len(cal_events),
        # Enriched canonical keys
        "solicitudes": solicitudes_data,
        "cotizaciones": cotizaciones_data,
        "pedidos": pedidos_data,
        "pagos": pagos_data,
        "empaques": empaques_data,
        "entregas": entregas_data,
        "devoluciones": devoluciones_data,
        "reservas_activas": reservas_data,
        "compras_asignadas": compras_asignadas_data,
        "agenda": agenda_data,
        "preferencias_contacto": preferencias_payload,
        "resumen_financiero": resumen_financiero,
        "rentabilidad": rentabilidad_payload,
    }
    return {"status": "success", "data": profile}


# ──────────────────────────────────────────────────────────────────────────────
# AGENDA DEL CLIENTE Y CALENDARIO OPERATIVO (FASE 5)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/agenda", response_model=dict)
def get_customer_agenda(
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Consulta la agenda operativa del cliente o global."""
    q = db.query(CustomerAgendaActivity)
    if customer_id:
        q = q.filter(CustomerAgendaActivity.customer_id == customer_id)
    if status:
        q = q.filter(CustomerAgendaActivity.status == status)
    items = q.order_by(CustomerAgendaActivity.scheduled_date.asc().nullslast()).limit(limit).all()
    return {
        "status": "success",
        "data": [AgendaActivityResponse.model_validate(i).model_dump() for i in items]
    }


@router.post("/agenda/sync", response_model=dict)
def sync_customer_agenda(
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Sincroniza actividades de agenda de forma determinista evitando duplicados."""
    count = _sync_operational_agenda_deterministic(db, customer_id)
    return {"status": "success", "data": {"synced_count": count}}


@router.post("/agenda", response_model=dict)
def create_agenda_activity(
    activity: AgendaActivityCreate,
    db: Session = Depends(get_db)
):
    """Crea una actividad de agenda manual."""
    det_key = f"MANUAL_{activity.customer_id}_{activity.entity_type}_{activity.entity_id or 0}_{activity.activity_type}_{int(time.time())}"
    db_item = CustomerAgendaActivity(
        customer_id=activity.customer_id,
        entity_type=activity.entity_type,
        entity_id=activity.entity_id,
        activity_type=activity.activity_type,
        title=activity.title,
        description=activity.description,
        scheduled_date=activity.scheduled_date,
        due_date=activity.due_date,
        status=activity.status,
        deterministic_key=det_key,
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return {"status": "success", "data": AgendaActivityResponse.model_validate(db_item).model_dump()}


@router.patch("/agenda/{activity_id}", response_model=dict)
def update_agenda_activity(
    activity_id: int,
    body: dict,
    db: Session = Depends(get_db)
):
    """Actualiza el estado o detalle de una actividad de agenda."""
    item = db.query(CustomerAgendaActivity).filter(CustomerAgendaActivity.id == activity_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Activity not found")
    if "status" in body:
        item.status = body["status"]
        if body["status"] == "COMPLETADA":
            item.completed_at = datetime.datetime.utcnow()
    if "description" in body:
        item.description = body["description"]
    if "due_date" in body and body["due_date"]:
        item.due_date = datetime.datetime.fromisoformat(body["due_date"].replace("Z", "+00:00"))
    db.commit()
    db.refresh(item)
    return {"status": "success", "data": AgendaActivityResponse.model_validate(item).model_dump()}

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
def get_leads(
    db: Session = Depends(get_db),
    limit: int = 500,
    offset: int = 0,
    stage_id: int = None,
    search: str = None,
    customer_id: int = None,
    advisor_name: str = None,
):
    """
    Optimized: single JOIN query — O(1) DB round trips regardless of lead count.
    Supports filtering by customer_id and advisor_name for the omnichannel view.
    """
    # ── Build base query with JOIN ──────────────────────────────────────────
    q = (
        db.query(SalesOrder, Customer, PipelineStage)
        .join(Customer, SalesOrder.customer_id == Customer.id)
        .outerjoin(PipelineStage, SalesOrder.pipeline_stage_id == PipelineStage.id)
        .filter(SalesOrder.status != "CANCELLED")
    )
    if stage_id:
        q = q.filter(SalesOrder.pipeline_stage_id == stage_id)
    if customer_id:
        q = q.filter(SalesOrder.customer_id == customer_id)
    if advisor_name:
        q = q.filter(SalesOrder.advisor_name.ilike(f"%{advisor_name}%"))
    if search:
        pattern = f"%{search}%"
        q = q.filter(
            (Customer.first_name + " " + Customer.last_name).ilike(pattern)
            | SalesOrder.lead_description.ilike(pattern)
            | SalesOrder.lead_product_name.ilike(pattern)
        )
    total = q.count()
    rows = q.order_by(SalesOrder.created_at.desc()).offset(offset).limit(limit).all()
    leads = [_lead_to_dict(order, customer, stage) for order, customer, stage in rows]
    return {"status": "success", "data": leads, "total": total}


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
    """Redirects to optimized get_leads — kept for backward compatibility."""
    rows = (
        db.query(SalesOrder, Customer, PipelineStage)
        .join(Customer, SalesOrder.customer_id == Customer.id)
        .outerjoin(PipelineStage, SalesOrder.pipeline_stage_id == PipelineStage.id)
        .filter(SalesOrder.status != "CANCELLED")
        .order_by(SalesOrder.created_at.desc())
        .all()
    )
    leads = [_lead_to_dict_v2(order, customer, stage, db) for order, customer, stage in rows]
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
    """Get all pipeline stages — cached in-memory with 60s TTL."""
    now = time.time()
    with _cache_lock:
        if _stages_cache["data"] is not None and now < _stages_cache["expires"]:
            return {"status": "success", "data": _stages_cache["data"], "cached": True}

    # Cache miss — fetch from DB
    stages = db.query(PipelineStage).order_by(PipelineStage.position).all()
    data = [
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
    with _cache_lock:
        _stages_cache["data"] = data
        _stages_cache["expires"] = now + _STAGES_TTL
    return {"status": "success", "data": data, "cached": False}


@router.put("/pipeline-stages/{stage_id}/config", response_model=dict)
def update_pipeline_stage_config(stage_id: int, body: dict, db: Session = Depends(get_db)):
    """Update pipeline stage config. Invalidates stages cache."""
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
    _invalidate_stages_cache()  # Force next GET to re-fetch from DB
    return {"status": "success", "data": {
        "id": stage.id, "name": stage.name, "color": stage.color,
        "bg_color": stage.bg_color, "position": stage.position,
        "maps_to_status": stage.maps_to_status,
        "alert_days": getattr(stage, 'alert_days', 7),
        "alert_message": getattr(stage, 'alert_message', ''),
        "is_closed": getattr(stage, 'is_closed', False),
    }}


@router.get("/warmup", response_model=dict)
def warmup(db: Session = Depends(get_db)):
    """
    Pre-warms the DB connection pool and stages cache.
    Call once on app startup or before first user load.
    Returns in < 100ms on subsequent calls (cache hit).
    """
    now = time.time()
    with _cache_lock:
        cache_warm = _stages_cache["data"] is not None and now < _stages_cache["expires"]

    if not cache_warm:
        stages = db.query(PipelineStage).order_by(PipelineStage.position).all()
        data = [{"id": s.id, "name": s.name} for s in stages]
        with _cache_lock:
            _stages_cache["expires"] = now + _STAGES_TTL
        return {"status": "success", "message": "Pool and cache warmed", "stages": len(data)}

    return {"status": "success", "message": "Already warm", "stages": len(_stages_cache["data"])}
