"""
ERP Ventas API
Endpoints for: Solicitudes de Cliente (SC), Cotizaciones (COT),
Pedidos de Venta (VEN), Ordenes Pendientes por Pagar (PXP)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from typing import Optional, List
from app.db.database import get_db
from app.models.erp_documents import (
    CustomerRequest, SalesQuotation, SaleOrder,
    PaymentPending, ActivityLog
)
from app.models.customers import Customer
from app.api.dependencies import (
    require_roles, get_current_user,
    ROLE_ADMIN, ROLE_ASESOR, ROLE_COMPRAS, ROLE_FINANZAS, ALL_ERP_ROLES
)
from app.models.users import User
import datetime

router = APIRouter()

API = "http://localhost:5000/api/v1"

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _next_seq(db: Session, seq_name: str) -> int:
    r = db.execute(text(f"SELECT nextval(\'{seq_name}\')")).scalar()
    return r

def _gen_numero(db: Session, prefix: str, seq: str) -> str:
    year = datetime.datetime.utcnow().year
    n = _next_seq(db, seq)
    return f"{prefix}{year}{n:04d}"

def _log(db: Session, entity_type: str, entity_id: int, entity_numero: str,
         action: str, description: str = None, old_estado: str = None,
         new_estado: str = None, user_name: str = None, extra_data: dict = None):
    log = ActivityLog(
        entity_type=entity_type,
        entity_id=entity_id,
        entity_numero=entity_numero,
        action=action,
        description=description,
        old_estado=old_estado,
        new_estado=new_estado,
        user_name=user_name,
        extra_data=extra_data,
    )
    db.add(log)
    db.commit()

def _sc_dict(sc: CustomerRequest) -> dict:
    return {
        "id": sc.id,
        "numero": sc.numero,
        "customer_id": sc.customer_id,
        "customer_name": sc.customer_name,
        "customer_phone": sc.customer_phone,
        "customer_email": sc.customer_email,
        "customer_address": sc.customer_address,
        "advisor_name": sc.advisor_name,
        "tipo_solicitud": sc.tipo_solicitud or "Cotizacion de Producto",
        "modalidad_pago": sc.modalidad_pago,
        "estado": sc.estado,
        "fecha_solicitud": sc.fecha_solicitud.isoformat() if sc.fecha_solicitud else None,
        "fecha_vencimiento": sc.fecha_vencimiento.isoformat() if sc.fecha_vencimiento else None,
        "notas": sc.notas,
        "productos": sc.productos or [],
        "created_at": sc.created_at.isoformat() if sc.created_at else None,
        "updated_at": sc.updated_at.isoformat() if sc.updated_at else None,
        "created_by": sc.created_by,
    }

def _cot_dict(cot: SalesQuotation) -> dict:
    return {
        "id": cot.id,
        "numero": cot.numero,
        "sc_id": cot.sc_id,
        "sc_numero": cot.sc_numero,
        "customer_id": cot.customer_id,
        "customer_name": cot.customer_name,
        "customer_phone": cot.customer_phone,
        "customer_email": cot.customer_email,
        "customer_address": cot.customer_address,
        "cotizador": cot.cotizador,
        "direccion_entrega": cot.direccion_entrega,
        "trm_rate": float(cot.trm_rate) if cot.trm_rate else None,
        "subtotal_cop": float(cot.subtotal_cop) if cot.subtotal_cop else 0,
        "descuento_pct": float(cot.descuento_pct) if cot.descuento_pct else 0,
        "total_cop": float(cot.total_cop) if cot.total_cop else 0,
        "anticipo_cop": float(cot.anticipo_cop) if cot.anticipo_cop else 0,
        "estado": cot.estado,
        "fecha_cotizacion": cot.fecha_cotizacion.isoformat() if cot.fecha_cotizacion else None,
        "fecha_entrega_estimada": cot.fecha_entrega_estimada.isoformat() if cot.fecha_entrega_estimada else None,
        "notas": cot.notas,
        "productos": cot.productos or [],
        "pec_id": cot.pec_id,
        "pec_numero": cot.pec_numero,
        "created_at": cot.created_at.isoformat() if cot.created_at else None,
        "updated_at": cot.updated_at.isoformat() if cot.updated_at else None,
        "created_by": cot.created_by,
    }

def _ven_dict(v: SaleOrder) -> dict:
    return {
        "id": v.id,
        "numero": v.numero,
        "sc_id": v.sc_id,
        "sc_numero": v.sc_numero,
        "cot_id": v.cot_id,
        "cot_numero": v.cot_numero,
        "customer_id": v.customer_id,
        "customer_name": v.customer_name,
        "customer_phone": v.customer_phone,
        "customer_email": v.customer_email,
        "customer_address": v.customer_address,
        "direccion_entrega": v.direccion_entrega,
        "fecha_cotizacion": v.fecha_cotizacion.isoformat() if v.fecha_cotizacion else None,
        "fecha_entrega_estimada": v.fecha_entrega_estimada.isoformat() if v.fecha_entrega_estimada else None,
        "trm_rate": float(v.trm_rate) if v.trm_rate else None,
        "subtotal_cop": float(v.subtotal_cop) if v.subtotal_cop else 0,
        "descuento_pct": float(v.descuento_pct) if v.descuento_pct else 0,
        "total_cop": float(v.total_cop) if v.total_cop else 0,
        "anticipo_cop": float(v.anticipo_cop) if v.anticipo_cop else 0,
        "saldo_cop": float(v.saldo_cop) if v.saldo_cop else 0,
        "estado": v.estado,
        "notas": v.notas,
        "productos": v.productos or [],
        "pec_id": v.pec_id,
        "pec_numero": v.pec_numero,
        "pxp_id": v.pxp_id,
        "pxp_numero": v.pxp_numero,
        "canal_venta": v.canal_venta or "CRM",
        "pweb_numero": v.pweb_numero,
        "canal_metadata": v.canal_metadata,
        "created_at": v.created_at.isoformat() if v.created_at else None,
        "updated_at": v.updated_at.isoformat() if v.updated_at else None,
        "created_by": v.created_by,
    }

def _pxp_dict(p: PaymentPending) -> dict:
    return {
        "id": p.id,
        "numero": p.numero,
        "ven_id": p.ven_id,
        "ven_numero": p.ven_numero,
        "customer_id": p.customer_id,
        "customer_name": p.customer_name,
        "monto_total": float(p.monto_total) if p.monto_total else 0,
        "monto_anticipo": float(p.monto_anticipo) if p.monto_anticipo else 0,
        "monto_pendiente": float(p.monto_pendiente) if p.monto_pendiente else 0,
        "estado": p.estado,
        "fecha_creacion": p.fecha_creacion.isoformat() if p.fecha_creacion else None,
        "fecha_pago": p.fecha_pago.isoformat() if p.fecha_pago else None,
        "notas": p.notas,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }

def _log_dict(l: ActivityLog) -> dict:
    return {
        "id": l.id,
        "entity_type": l.entity_type,
        "entity_id": l.entity_id,
        "entity_numero": l.entity_numero,
        "action": l.action,
        "description": l.description,
        "old_estado": l.old_estado,
        "new_estado": l.new_estado,
        "user_name": l.user_name,
        "created_at": l.created_at.isoformat() if l.created_at else None,
        "extra_data": l.extra_data,
    }

# ─── SOLICITUDES (SC) ────────────────────────────────────────────────────────

@router.get("/solicitudes")
def list_solicitudes(
    estado: Optional[str] = None,
    customer_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    q = db.query(CustomerRequest)
    if estado:
        q = q.filter(CustomerRequest.estado == estado)
    if customer_id:
        q = q.filter(CustomerRequest.customer_id == customer_id)
    if search:
        like = f"%{search}%"
        q = q.filter(
            CustomerRequest.numero.ilike(like) |
            CustomerRequest.customer_name.ilike(like) |
            CustomerRequest.advisor_name.ilike(like)
        )
    total = q.count()
    items = q.order_by(CustomerRequest.created_at.desc()).offset(offset).limit(limit).all()
    return {"status": "success", "total": total, "data": [_sc_dict(s) for s in items]}


@router.post("/solicitudes", status_code=201)
def create_solicitud(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    numero = _gen_numero(db, "SC-", "seq_sc")
    # Auto vencimiento: 30 days
    venc = datetime.datetime.utcnow() + datetime.timedelta(days=body.get("dias_vencimiento", 30))

    # If customer_id provided, fetch customer data
    cust_name = body.get("customer_name", "")
    cust_phone = body.get("customer_phone", "")
    cust_email = body.get("customer_email", "")
    cust_addr  = body.get("customer_address", "")
    if body.get("customer_id"):
        c = db.query(Customer).filter(Customer.id == body["customer_id"]).first()
        if c:
            cust_name  = cust_name or f"{c.first_name} {c.last_name}".strip()
            cust_phone = cust_phone or c.phone or ""
            cust_email = cust_email or c.email or ""
            cust_addr  = cust_addr or c.address or ""

    sc = CustomerRequest(
        numero=numero,
        customer_id=body.get("customer_id"),
        customer_name=cust_name,
        customer_phone=cust_phone,
        customer_email=cust_email,
        customer_address=cust_addr,
        advisor_name=body.get("advisor_name"),
        tipo_solicitud=body.get("tipo_solicitud", "Cotizacion de Producto"),
        modalidad_pago=body.get("modalidad_pago", "Contado"),
        estado="BORRADOR",
        fecha_vencimiento=venc,
        notas=body.get("notas"),
        productos=body.get("productos", []),
        created_by=body.get("created_by"),
    )
    db.add(sc)
    db.commit()
    db.refresh(sc)
    _log(db, "SC", sc.id, sc.numero, "CREATED",
         f"Solicitud {sc.numero} creada",
         new_estado="BORRADOR", user_name=body.get("created_by"))
    return {"status": "success", "data": _sc_dict(sc)}


@router.get("/solicitudes/{sc_id}")
def get_solicitud(sc_id: int, user: User = Depends(require_roles(*ALL_ERP_ROLES)),
        db: Session = Depends(get_db)):
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "Solicitud no encontrada")
    logs = db.query(ActivityLog).filter(
        ActivityLog.entity_type == "SC",
        ActivityLog.entity_id == sc_id
    ).order_by(ActivityLog.created_at.asc()).all()
    d = _sc_dict(sc)
    d["actividades"] = [_log_dict(l) for l in logs]
    # linked quotations
    cots = db.query(SalesQuotation).filter(SalesQuotation.sc_id == sc_id).all()
    d["cotizaciones"] = [_cot_dict(c) for c in cots]
    return {"status": "success", "data": d}


@router.patch("/solicitudes/{sc_id}")
def update_solicitud(sc_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "Solicitud no encontrada")
    old_estado = sc.estado
    allowed = ["customer_id","customer_name","customer_phone","customer_email",
               "customer_address","advisor_name","tipo_solicitud","modalidad_pago","estado",
               "fecha_vencimiento","notas","productos"]
    for k in allowed:
        if k in body:
            setattr(sc, k, body[k])
    sc.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(sc)
    if body.get("estado") and body["estado"] != old_estado:
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
             f"Estado cambiado a {sc.estado}",
             old_estado=old_estado, new_estado=sc.estado,
             user_name=body.get("updated_by"))
    return {"status": "success", "data": _sc_dict(sc)}


@router.post("/solicitudes/{sc_id}/confirmar")
def confirmar_solicitud(sc_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Confirm SC -> creates COT automatically"""
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "Solicitud no encontrada")
    if sc.estado not in ("BORRADOR", "PENDIENTE_CONFIRMACION"):
        raise HTTPException(400, f"No se puede confirmar en estado {sc.estado}")

    # Update SC estado
    old_estado = sc.estado
    sc.estado = "CONFIRMADA"
    sc.updated_at = datetime.datetime.utcnow()
    db.commit()

    _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
         "Solicitud confirmada - Cotizacion creada",
         old_estado=old_estado, new_estado="CONFIRMADA",
         user_name=body.get("user_name"))

    # Create COT automatically
    cot_numero = _gen_numero(db, "COT-", "seq_cot")
    entrega_est = datetime.datetime.utcnow() + datetime.timedelta(days=15)
    cot = SalesQuotation(
        numero=cot_numero,
        sc_id=sc.id,
        sc_numero=sc.numero,
        customer_id=sc.customer_id,
        customer_name=sc.customer_name,
        customer_phone=sc.customer_phone,
        customer_email=sc.customer_email,
        customer_address=sc.customer_address,
        cotizador=body.get("cotizador", sc.advisor_name),
        estado="BORRADOR",
        productos=sc.productos or [],
        fecha_entrega_estimada=entrega_est,
        created_by=body.get("user_name"),
    )
    db.add(cot)
    db.commit()
    db.refresh(cot)
    _log(db, "COT", cot.id, cot.numero, "CREATED",
         f"Cotizacion {cot.numero} creada desde {sc.numero}",
         new_estado="BORRADOR", user_name=body.get("user_name"))

    return {"status": "success", "data": {"sc": _sc_dict(sc), "cotizacion": _cot_dict(cot)}}


@router.post("/solicitudes/{sc_id}/actividad")
def add_sc_activity(sc_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "Solicitud no encontrada")
    _log(db, "SC", sc.id, sc.numero,
         body.get("action", "NOTE_ADDED"),
         body.get("description"),
         user_name=body.get("user_name"))
    return {"status": "success"}


# ─── COTIZACIONES (COT) ──────────────────────────────────────────────────────

@router.get("/cotizaciones")
def list_cotizaciones(
    estado: Optional[str] = None,
    sc_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    q = db.query(SalesQuotation)
    if estado:
        q = q.filter(SalesQuotation.estado == estado)
    if sc_id:
        q = q.filter(SalesQuotation.sc_id == sc_id)
    if search:
        like = f"%{search}%"
        q = q.filter(
            SalesQuotation.numero.ilike(like) |
            SalesQuotation.customer_name.ilike(like) |
            SalesQuotation.cotizador.ilike(like) |
            SalesQuotation.sc_numero.ilike(like)
        )
    total = q.count()
    items = q.order_by(SalesQuotation.created_at.desc()).offset(offset).limit(limit).all()
    return {"status": "success", "total": total, "data": [_cot_dict(c) for c in items]}


@router.post("/cotizaciones", status_code=201)
def create_cotizacion(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    numero = _gen_numero(db, "COT-", "seq_cot")
    entrega_est = None
    if body.get("dias_entrega"):
        entrega_est = datetime.datetime.utcnow() + datetime.timedelta(days=body["dias_entrega"])

    cot = SalesQuotation(
        numero=numero,
        sc_id=body.get("sc_id"),
        sc_numero=body.get("sc_numero"),
        customer_id=body.get("customer_id"),
        customer_name=body.get("customer_name"),
        customer_phone=body.get("customer_phone"),
        customer_email=body.get("customer_email"),
        customer_address=body.get("customer_address"),
        cotizador=body.get("cotizador"),
        direccion_entrega=body.get("direccion_entrega"),
        trm_rate=body.get("trm_rate"),
        subtotal_cop=body.get("subtotal_cop", 0),
        descuento_pct=body.get("descuento_pct", 0),
        total_cop=body.get("total_cop", 0),
        anticipo_cop=body.get("anticipo_cop", 0),
        estado="BORRADOR",
        fecha_entrega_estimada=entrega_est,
        notas=body.get("notas"),
        productos=body.get("productos", []),
        created_by=body.get("created_by"),
    )
    db.add(cot)
    db.commit()
    db.refresh(cot)
    _log(db, "COT", cot.id, cot.numero, "CREATED",
         f"Cotizacion {cot.numero} creada",
         new_estado="BORRADOR", user_name=body.get("created_by"))
    return {"status": "success", "data": _cot_dict(cot)}


@router.get("/cotizaciones/{cot_id}")
def get_cotizacion(cot_id: int, user: User = Depends(require_roles(*ALL_ERP_ROLES)),
        db: Session = Depends(get_db)):
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).first()
    if not cot:
        raise HTTPException(404, "Cotizacion no encontrada")
    logs = db.query(ActivityLog).filter(
        ActivityLog.entity_type == "COT",
        ActivityLog.entity_id == cot_id
    ).order_by(ActivityLog.created_at.asc()).all()
    d = _cot_dict(cot)
    d["actividades"] = [_log_dict(l) for l in logs]
    # linked VEN
    vens = db.query(SaleOrder).filter(SaleOrder.cot_id == cot_id).all()
    d["pedidos_venta"] = [_ven_dict(v) for v in vens]
    return {"status": "success", "data": d}


@router.patch("/cotizaciones/{cot_id}")
def update_cotizacion(cot_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).first()
    if not cot:
        raise HTTPException(404, "Cotizacion no encontrada")
    old_estado = cot.estado
    allowed = ["sc_id","customer_id","customer_name","customer_phone","customer_email",
               "customer_address","cotizador","direccion_entrega","trm_rate","subtotal_cop",
               "descuento_pct","total_cop","anticipo_cop","estado","fecha_entrega_estimada",
               "notas","productos","pec_id","pec_numero"]
    for k in allowed:
        if k in body:
            setattr(cot, k, body[k])
    cot.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(cot)
    if body.get("estado") and body["estado"] != old_estado:
        _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED",
             f"Estado cambiado a {cot.estado}",
             old_estado=old_estado, new_estado=cot.estado,
             user_name=body.get("updated_by"))
    return {"status": "success", "data": _cot_dict(cot)}


@router.post("/cotizaciones/{cot_id}/confirmar")
def confirmar_cotizacion(cot_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Confirm COT -> creates VEN automatically"""
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).first()
    if not cot:
        raise HTTPException(404, "Cotizacion no encontrada")
    if cot.estado not in ("BORRADOR", "ENVIADA", "PENDIENTE_CONFIRMACION"):
        raise HTTPException(400, f"No se puede confirmar en estado {cot.estado}")

    old_estado = cot.estado
    cot.estado = "CONFIRMADA"
    cot.updated_at = datetime.datetime.utcnow()
    db.commit()
    _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED",
         "Cotizacion confirmada - Pedido de Venta creado",
         old_estado=old_estado, new_estado="CONFIRMADA",
         user_name=body.get("user_name"))

    # Create VEN
    ven_numero = _gen_numero(db, "PVEN-", "seq_ven")
    saldo = float(cot.total_cop or 0) - float(cot.anticipo_cop or 0)
    ven = SaleOrder(
        numero=ven_numero,
        sc_id=cot.sc_id,
        sc_numero=cot.sc_numero,
        cot_id=cot.id,
        cot_numero=cot.numero,
        customer_id=cot.customer_id,
        customer_name=cot.customer_name,
        customer_phone=cot.customer_phone,
        customer_email=cot.customer_email,
        customer_address=cot.customer_address,
        direccion_entrega=cot.direccion_entrega,
        fecha_cotizacion=cot.fecha_cotizacion,
        fecha_entrega_estimada=cot.fecha_entrega_estimada,
        trm_rate=cot.trm_rate,
        subtotal_cop=cot.subtotal_cop,
        descuento_pct=cot.descuento_pct,
        total_cop=cot.total_cop,
        anticipo_cop=cot.anticipo_cop,
        saldo_cop=saldo,
        estado="PENDIENTE_COMPRA",
        productos=cot.productos or [],
        created_by=body.get("user_name"),
    )
    db.add(ven)
    db.commit()
    db.refresh(ven)
    _log(db, "VEN", ven.id, ven.numero, "CREATED",
         f"Pedido de Venta {ven.numero} creado desde {cot.numero}",
         new_estado="PENDIENTE_COMPRA", user_name=body.get("user_name"))

    return {"status": "success", "data": {"cotizacion": _cot_dict(cot), "pedido_venta": _ven_dict(ven)}}


@router.post("/cotizaciones/{cot_id}/actividad")
def add_cot_activity(cot_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).first()
    if not cot:
        raise HTTPException(404, "Cotizacion no encontrada")
    _log(db, "COT", cot.id, cot.numero,
         body.get("action", "NOTE_ADDED"),
         body.get("description"),
         user_name=body.get("user_name"))
    return {"status": "success"}


@router.post("/pedidos/{ven_id}/actividad")
def add_ven_activity(ven_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    v = db.query(SaleOrder).filter(SaleOrder.id == ven_id).first()
    if not v:
        raise HTTPException(404, "Pedido no encontrado")
    _log(db, "VEN", v.id, v.numero,
         body.get("action", "NOTE_ADDED"),
         body.get("description"),
         user_name=body.get("user_name"))
    return {"status": "success"}



@router.get("/pedidos")
def list_pedidos(
    estado: Optional[str] = None,
    cot_id: Optional[int] = None,
    canal_venta: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    q = db.query(SaleOrder)
    if estado:
        q = q.filter(SaleOrder.estado == estado)
    if cot_id:
        q = q.filter(SaleOrder.cot_id == cot_id)
    if canal_venta:
        q = q.filter(SaleOrder.canal_venta == canal_venta)
    if search:
        like = f"%{search}%"
        q = q.filter(
            SaleOrder.numero.ilike(like) |
            SaleOrder.customer_name.ilike(like) |
            SaleOrder.sc_numero.ilike(like) |
            SaleOrder.cot_numero.ilike(like) |
            SaleOrder.pweb_numero.ilike(like)
        )
    total = q.count()
    items = q.order_by(SaleOrder.created_at.desc()).offset(offset).limit(limit).all()
    return {"status": "success", "total": total, "data": [_ven_dict(v) for v in items]}


@router.post("/pedidos", status_code=201)
def create_pedido(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    numero = _gen_numero(db, "PVEN-", "seq_ven")
    saldo = float(body.get("total_cop", 0)) - float(body.get("anticipo_cop", 0))
    ven = SaleOrder(
        numero=numero,
        sc_id=body.get("sc_id"),
        sc_numero=body.get("sc_numero"),
        cot_id=body.get("cot_id"),
        cot_numero=body.get("cot_numero"),
        customer_id=body.get("customer_id"),
        customer_name=body.get("customer_name"),
        customer_phone=body.get("customer_phone"),
        customer_email=body.get("customer_email"),
        customer_address=body.get("customer_address"),
        direccion_entrega=body.get("direccion_entrega"),
        trm_rate=body.get("trm_rate"),
        subtotal_cop=body.get("subtotal_cop", 0),
        descuento_pct=body.get("descuento_pct", 0),
        total_cop=body.get("total_cop", 0),
        anticipo_cop=body.get("anticipo_cop", 0),
        saldo_cop=saldo,
        estado="PENDIENTE_COMPRA",
        notas=body.get("notas"),
        productos=body.get("productos", []),
        created_by=body.get("created_by"),
    )
    db.add(ven)
    db.commit()
    db.refresh(ven)
    _log(db, "VEN", ven.id, ven.numero, "CREATED",
         f"Pedido de Venta {ven.numero} creado",
         new_estado="PENDIENTE_COMPRA", user_name=body.get("created_by"))
    return {"status": "success", "data": _ven_dict(ven)}


@router.get("/pedidos/{ven_id}")
def get_pedido(ven_id: int, user: User = Depends(require_roles(*ALL_ERP_ROLES)),
        db: Session = Depends(get_db)):
    v = db.query(SaleOrder).filter(SaleOrder.id == ven_id).first()
    if not v:
        raise HTTPException(404, "Pedido de venta no encontrado")
    logs = db.query(ActivityLog).filter(
        ActivityLog.entity_type == "VEN",
        ActivityLog.entity_id == ven_id
    ).order_by(ActivityLog.created_at.asc()).all()
    d = _ven_dict(v)
    d["actividades"] = [_log_dict(l) for l in logs]
    pxps = db.query(PaymentPending).filter(PaymentPending.ven_id == ven_id).all()
    d["pxps"] = [_pxp_dict(p) for p in pxps]
    return {"status": "success", "data": d}


@router.patch("/pedidos/{ven_id}")
def update_pedido(ven_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    v = db.query(SaleOrder).filter(SaleOrder.id == ven_id).first()
    if not v:
        raise HTTPException(404, "Pedido de venta no encontrado")
    old_estado = v.estado
    allowed = ["estado","notas","productos","pec_id","pec_numero","pxp_id","pxp_numero",
               "fecha_entrega_estimada","direccion_entrega","customer_id","customer_name",
               "customer_phone","customer_email","customer_address","trm_rate",
               "subtotal_cop","descuento_pct","total_cop","anticipo_cop","saldo_cop"]
    for k in allowed:
        if k in body:
            setattr(v, k, body[k])
    v.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(v)
    if body.get("estado") and body["estado"] != old_estado:
        _log(db, "VEN", v.id, v.numero, "ESTADO_CHANGED",
             f"Estado cambiado a {v.estado}",
             old_estado=old_estado, new_estado=v.estado,
             user_name=body.get("updated_by"))
    return {"status": "success", "data": _ven_dict(v)}


@router.post("/pedidos/{ven_id}/crear-pxp")
def crear_pxp(ven_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_FINANZAS)),
        db: Session = Depends(get_db)):
    v = db.query(SaleOrder).filter(SaleOrder.id == ven_id).first()
    if not v:
        raise HTTPException(404, "Pedido de venta no encontrado")

    pxp_numero = _gen_numero(db, "PXP-", "seq_pxp")
    total = float(v.total_cop or 0)
    anticipo = float(body.get("monto_anticipo", v.anticipo_cop or 0))
    pendiente = total - anticipo

    pxp = PaymentPending(
        numero=pxp_numero,
        ven_id=v.id,
        ven_numero=v.numero,
        customer_id=v.customer_id,
        customer_name=v.customer_name,
        monto_total=total,
        monto_anticipo=anticipo,
        monto_pendiente=pendiente,
        estado="PENDIENTE",
        notas=body.get("notas"),
    )
    db.add(pxp)
    # Update VEN with pxp link
    v.pxp_id = None  # set after commit
    v.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(pxp)
    v.pxp_id = pxp.id
    v.pxp_numero = pxp.numero
    db.commit()
    _log(db, "VEN", v.id, v.numero, "PXP_CREATED",
         f"Orden de pago {pxp.numero} creada. Pendiente: ${pendiente:,.0f} COP",
         user_name=body.get("user_name"))
    _log(db, "PXP", pxp.id, pxp.numero, "CREATED",
         f"PXP creada para {v.numero}",
         new_estado="PENDIENTE", user_name=body.get("user_name"))
    return {"status": "success", "data": _pxp_dict(pxp)}


# ─── PXP ─────────────────────────────────────────────────────────────────────

@router.get("/pxp")
def list_pxp(
    estado: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    q = db.query(PaymentPending)
    if estado:
        q = q.filter(PaymentPending.estado == estado)
    total = q.count()
    items = q.order_by(PaymentPending.created_at.desc()).offset(offset).limit(limit).all()
    return {"status": "success", "total": total, "data": [_pxp_dict(p) for p in items]}


@router.patch("/pxp/{pxp_id}")
def update_pxp(pxp_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_FINANZAS)),
        db: Session = Depends(get_db)):
    p = db.query(PaymentPending).filter(PaymentPending.id == pxp_id).first()
    if not p:
        raise HTTPException(404, "PXP no encontrada")
    old_estado = p.estado
    for k in ["estado","notas","fecha_pago","monto_anticipo","monto_pendiente"]:
        if k in body:
            setattr(p, k, body[k])
    p.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(p)
    if body.get("estado") and body["estado"] != old_estado:
        _log(db, "PXP", p.id, p.numero, "ESTADO_CHANGED",
             f"Pago {p.numero} cambiado a {p.estado}",
             old_estado=old_estado, new_estado=p.estado,
             user_name=body.get("updated_by"))
    return {"status": "success", "data": _pxp_dict(p)}


# ─── DASHBOARD STATS ─────────────────────────────────────────────────────────

@router.get("/stats")
def ventas_stats(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS, *ROLE_FINANZAS)),
        db: Session = Depends(get_db)):
    sc_total = db.query(func.count(CustomerRequest.id)).scalar()
    cot_total = db.query(func.count(SalesQuotation.id)).scalar()
    ven_total = db.query(func.count(SaleOrder.id)).scalar()
    pxp_pendiente = db.query(func.count(PaymentPending.id)).filter(
        PaymentPending.estado == "PENDIENTE").scalar()
    ven_monto = db.query(func.sum(SaleOrder.total_cop)).filter(
        SaleOrder.estado != "CANCELADO").scalar() or 0

    sc_por_estado = db.execute(text(
        "SELECT estado, COUNT(*) as cnt FROM customer_requests GROUP BY estado"
    )).fetchall()
    cot_por_estado = db.execute(text(
        "SELECT estado, COUNT(*) as cnt FROM sales_quotations GROUP BY estado"
    )).fetchall()

    return {
        "status": "success",
        "data": {
            "sc_total": sc_total,
            "cot_total": cot_total,
            "ven_total": ven_total,
            "pxp_pendiente": pxp_pendiente,
            "ven_monto_total": float(ven_monto),
            "sc_por_estado": {r[0]: r[1] for r in sc_por_estado},
            "cot_por_estado": {r[0]: r[1] for r in cot_por_estado},
        }
    }


# ─── ANALYTICS ───────────────────────────────────────────────────────────────

@router.get("/analytics")
def ventas_analytics(
    range: Optional[str] = "30d",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    product: Optional[str] = None,
    top_n: int = Query(10, le=50),
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.utcnow()
    # Determine date range
    if date_from and date_to:
        d_from = datetime.datetime.fromisoformat(date_from)
        d_to   = datetime.datetime.fromisoformat(date_to) + datetime.timedelta(days=1)
    else:
        days_map = {"7d": 7, "30d": 30, "90d": 90, "180d": 180, "1y": 365}
        days = days_map.get(range, 30)
        d_from = now - datetime.timedelta(days=days)
        d_to   = now + datetime.timedelta(days=1)

    # Base VEN query in range (not cancelled)
    ven_q = db.query(SaleOrder).filter(
        SaleOrder.created_at >= d_from,
        SaleOrder.created_at <= d_to,
        SaleOrder.estado != "CANCELADO"
    )
    if product:
        ven_q = ven_q.filter(SaleOrder.productos.cast(text("text")).ilike(f"%{product}%"))

    vens = ven_q.all()

    # Revenue by day
    revenue_by_day: dict = {}
    for v in vens:
        day = v.created_at.strftime("%Y-%m-%d") if v.created_at else "unknown"
        revenue_by_day[day] = revenue_by_day.get(day, 0) + float(v.total_cop or 0)

    # Top clients by revenue
    client_rev: dict = {}
    for v in vens:
        name = v.customer_name or "Sin nombre"
        client_rev[name] = client_rev.get(name, 0) + float(v.total_cop or 0)
    top_clients = sorted(client_rev.items(), key=lambda x: x[1], reverse=True)[:top_n]

    # Clients above thresholds
    clients_500k  = [(k, v) for k, v in client_rev.items() if v >= 500000]
    clients_1m    = [(k, v) for k, v in client_rev.items() if v >= 1000000]

    # Total revenue and count
    total_revenue = sum(float(v.total_cop or 0) for v in vens)
    total_count   = len(vens)
    avg_ticket    = total_revenue / total_count if total_count > 0 else 0

    # SC and COT in range
    sc_range = db.query(func.count(CustomerRequest.id)).filter(
        CustomerRequest.created_at >= d_from, CustomerRequest.created_at <= d_to
    ).scalar()
    cot_range = db.query(func.count(SalesQuotation.id)).filter(
        SalesQuotation.created_at >= d_from, SalesQuotation.created_at <= d_to
    ).scalar()

    # Conversion rates
    conv_sc_cot = round(cot_range / sc_range * 100, 1) if sc_range > 0 else 0
    conv_cot_ven = round(total_count / cot_range * 100, 1) if cot_range > 0 else 0

    # Status breakdown for VEN
    ven_por_estado: dict = {}
    for v in vens:
        ven_por_estado[v.estado] = ven_por_estado.get(v.estado, 0) + 1

    return {
        "status": "success",
        "data": {
            "range": range,
            "date_from": d_from.isoformat(),
            "date_to": d_to.isoformat(),
            "total_revenue": total_revenue,
            "total_count": total_count,
            "avg_ticket": avg_ticket,
            "sc_count": sc_range,
            "cot_count": cot_range,
            "conv_sc_cot_pct": conv_sc_cot,
            "conv_cot_ven_pct": conv_cot_ven,
            "revenue_by_day": [{"date": k, "total": v} for k, v in sorted(revenue_by_day.items())],
            "top_clients": [{"name": k, "total": v} for k, v in top_clients],
            "clients_above_500k": len(clients_500k),
            "clients_above_1m": len(clients_1m),
            "ven_por_estado": ven_por_estado,
        }
    }


# ─── ALERTAS (SC/COT sin cambio en N dias) ───────────────────────────────────

def _get_alert_days(db: Session, key: str = "alerta_sc_dias") -> int:
    try:
        r = db.execute(text(f"SELECT value FROM admin_config WHERE key = '{key}'")).fetchone()
        return int(r[0]) if r else 2
    except Exception:
        return 2


@router.get("/alertas")
def get_alertas(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    dias = _get_alert_days(db)
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=dias)

    # SC activos sin cambio de estado en N dias
    sc_alertas = db.query(CustomerRequest).filter(
        CustomerRequest.updated_at <= cutoff,
        CustomerRequest.estado.notin_(["CONFIRMADA", "CANCELADA"])
    ).all()

    # COT activas sin cambio de estado en N dias
    cot_alertas = db.query(SalesQuotation).filter(
        SalesQuotation.updated_at <= cutoff,
        SalesQuotation.estado.notin_(["CONFIRMADA", "RECHAZADA"])
    ).all()

    return {
        "status": "success",
        "data": {
            "alerta_dias": dias,
            "sc_sin_atender": [_sc_dict(sc) for sc in sc_alertas],
            "cot_sin_atender": [_cot_dict(c) for c in cot_alertas],
            "sc_count": len(sc_alertas),
            "cot_count": len(cot_alertas),
        }
    }


# ─── ADMIN CONFIG ─────────────────────────────────────────────────────────────

@router.get("/config")
def get_config(user: User = Depends(require_roles(*ROLE_ADMIN)),
        db: Session = Depends(get_db)):
    try:
        rows = db.execute(text("SELECT key, value, description FROM admin_config")).fetchall()
        return {"status": "success", "data": {r[0]: {"value": r[1], "description": r[2]} for r in rows}}
    except Exception:
        return {"status": "success", "data": {}}


@router.patch("/config")
def update_config(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN)),
        db: Session = Depends(get_db)):
    for k, v in body.items():
        db.execute(text(
            f"INSERT INTO admin_config (key, value, updated_at) VALUES ('{k}', '{v}', NOW()) "
            f"ON CONFLICT (key) DO UPDATE SET value = '{v}', updated_at = NOW()"
        ))
    db.commit()
    return {"status": "success"}


# ─── IA ANÁLISIS DE SOLICITUD ────────────────────────────────────────────────

@router.post("/solicitudes/{sc_id}/ia-analisis")
def ia_analisis_solicitud(sc_id: int, body: dict = {}, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Genera análisis IA contextual de una SC: trazabilidad o condiciones de devolución."""
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "SC no encontrada")

    tipo = sc.tipo_solicitud or "Cotizacion de Producto"
    productos = sc.productos or []
    actividades = db.execute(text("""
        SELECT action, description, user_name, created_at, old_estado, new_estado
        FROM activity_logs WHERE entity_type='SC' AND entity_id=:id ORDER BY created_at ASC
    """), {"id": sc_id}).mappings().all()

    # Build context
    estados_historia = [dict(a) for a in actividades if a["action"] in ("ESTADO_CHANGED","CREATED","CONFIRMED","CANCELLED")]
    notas_historia = [dict(a) for a in actividades if a["action"] in ("NOTE_ADDED","CHATTER","UPDATED")]

    dias_desde_creacion = (datetime.datetime.utcnow() - sc.created_at).days if sc.created_at else 0

    if tipo in ("Seguimiento", "Programar Entrega"):
        # Trazabilidad
        ultimo_estado = estados_historia[-1] if estados_historia else None
        prox_accion = "Confirmar despacho" if sc.estado == "CONFIRMADA" else "Seguimiento con asesor"
        resumen = f"""📦 ANÁLISIS DE TRAZABILIDAD — {sc.numero}

Estado actual: {sc.estado}
Días desde creación: {dias_desde_creacion} días
Asesor responsable: {sc.advisor_name or 'No asignado'}
Cliente: {sc.customer_name or 'N/D'}

📋 Historia de Estados:
{chr(10).join([f"  → {e.get('old_estado','?')} → {e.get('new_estado','?')} ({str(e.get('created_at',''))[:10]})" for e in estados_historia]) or '  Sin cambios de estado registrados'}

🛒 Productos en la solicitud:
{chr(10).join([f"  • {p.get('nombre',p.get('name','Producto'))} x{p.get('cantidad',p.get('qty',1))}" for p in productos[:5]]) or '  Sin productos registrados'}

🔎 Próxima acción sugerida: {prox_accion}

💬 Notas recientes:
{chr(10).join([f"  [{str(n.get('created_at',''))[:10]}] {n.get('user_name','?')}: {n.get('description','')[:80]}" for n in notas_historia[-3:]]) or '  Sin notas'}"""

    elif tipo == "Devolucion de Producto":
        # Condiciones de devolución
        en_plazo = dias_desde_creacion <= 30
        estado_ok = sc.estado not in ("CANCELADA",)
        puede_devolver = en_plazo and estado_ok
        resumen = f"""🔄 ANÁLISIS DE DEVOLUCIÓN — {sc.numero}

Estado de la solicitud: {sc.estado}
Días desde creación: {dias_desde_creacion} días
{'✅ DENTRO del plazo de 30 días' if en_plazo else '❌ FUERA del plazo de 30 días (policy: máx 30 días)'}

📋 Condiciones de Devolución Nebulae:
  • Plazo máximo: 30 días desde la fecha de solicitud
  • Productos deben estar en condición original
  • Requiere número de SC original
  • Aplica para defectos de fábrica o error en pedido

🛒 Productos solicitados para devolución:
{chr(10).join([f"  • {p.get('nombre',p.get('name','Producto'))} x{p.get('cantidad',p.get('qty',1))}" for p in productos[:5]]) or '  Sin productos registrados'}

{'✅ DEVOLUCIÓN APROBADA: El cliente cumple las condiciones para proceder.' if puede_devolver else '⚠️ DEVOLUCIÓN NO APLICABLE: ' + ('Solicitud fuera del plazo de 30 días.' if not en_plazo else 'Solicitud cancelada.') }

🔎 Próxima acción: {'Coordinar recolección del producto con logística' if puede_devolver else 'Comunicar al cliente las condiciones de devolución y opciones alternativas'}"""

    else:
        # General
        resumen = f"""📊 ANÁLISIS DE SOLICITUD — {sc.numero}

Tipo: {tipo}
Estado: {sc.estado}
Cliente: {sc.customer_name or 'N/D'}
Asesor: {sc.advisor_name or 'No asignado'}
Días activo: {dias_desde_creacion} días
Modalidad: {sc.modalidad_pago or 'No especificada'}

📋 Historial de actividad: {len(list(actividades))} eventos registrados
🛒 Productos: {len(productos)} item(s)

Notas: {sc.notas or 'Sin notas adicionales'}"""

    return {"status": "success", "data": {
        "sc_id": sc_id,
        "numero": sc.numero,
        "tipo": tipo,
        "analisis": resumen,
        "estado_actual": sc.estado,
        "dias_desde_creacion": dias_desde_creacion,
        "puede_devolver": tipo == "Devolucion de Producto" and dias_desde_creacion <= 30,
    }}


# ─── CANCELAR SC CON RAZÓN ────────────────────────────────────────────────────

@router.post("/solicitudes/{sc_id}/cancelar")
def cancelar_solicitud(sc_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Cancela una SC con razón obligatoria y marca eliminada_at para papelera 30 días."""
    razon = body.get("razon", "").strip()
    if not razon:
        raise HTTPException(400, "La razón de cancelación es obligatoria")
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "SC no encontrada")
    old_estado = sc.estado
    sc.estado = "CANCELADA"
    # Store cancellation reason and date in notas or extra field
    sc.notas = f"{sc.notas or ''}\n[CANCELADA] Razón: {razon}".strip()
    sc.updated_at = datetime.datetime.utcnow()
    # Mark eliminada_at via extra column (safe if not present — try/except)
    try:
        db.execute(text("""
            ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS razon_cancelacion TEXT;
            ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS eliminada_at TIMESTAMPTZ;
        """))
        db.commit()
        db.execute(text("""
            UPDATE customer_requests SET razon_cancelacion=:razon, eliminada_at=NOW(), estado='CANCELADA', updated_at=NOW()
            WHERE id=:id
        """), {"razon": razon, "id": sc_id})
        db.commit()
    except Exception:
        db.rollback()
        sc.estado = "CANCELADA"
        db.commit()
    _log(db, "SC", sc_id, sc.numero, "CANCELLED", f"Cancelada: {razon}", old_estado, "CANCELADA", body.get("user_name",""))
    return {"status": "success", "data": {"id": sc_id, "estado": "CANCELADA", "razon": razon}}


# ─── PAPELERA (SCs canceladas, purga 30 días) ────────────────────────────────

@router.get("/solicitudes/papelera")
def get_papelera(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Lista SCs canceladas con días restantes antes de eliminación permanente."""
    try:
        # Ensure columns exist
        db.execute(text("""
            ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS razon_cancelacion TEXT;
            ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS eliminada_at TIMESTAMPTZ;
        """))
        db.commit()
        # Auto-purge SCs older than 30 days in papelera
        db.execute(text("""
            DELETE FROM customer_requests
            WHERE estado='CANCELADA' AND eliminada_at IS NOT NULL
            AND eliminada_at < NOW() - INTERVAL '30 days'
        """))
        db.commit()
        rows = db.execute(text("""
            SELECT id, numero, customer_name, advisor_name, tipo_solicitud,
                   razon_cancelacion, eliminada_at, created_at, updated_at,
                   EXTRACT(DAY FROM NOW() - eliminada_at) as dias_en_papelera
            FROM customer_requests
            WHERE estado='CANCELADA'
            ORDER BY COALESCE(eliminada_at, updated_at) DESC
            LIMIT 200
        """)).mappings().all()
        data = []
        for r in rows:
            d = dict(r)
            dias = float(d.get("dias_en_papelera") or 0)
            d["dias_en_papelera"] = int(dias)
            d["dias_restantes"] = max(0, 30 - int(dias)) if d.get("eliminada_at") else 30
            d["eliminada_at"] = str(d["eliminada_at"]) if d.get("eliminada_at") else None
            d["created_at"] = str(d["created_at"]) if d.get("created_at") else None
            data.append(d)
        return {"status": "success", "data": data}
    except Exception as e:
        return {"status": "success", "data": []}


@router.delete("/solicitudes/{sc_id}/permanente")
def eliminar_permanente(sc_id: int, user: User = Depends(require_roles(*ROLE_ADMIN)),
        db: Session = Depends(get_db)):
    """Elimina permanentemente una SC de la papelera."""
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc or sc.estado != "CANCELADA":
        raise HTTPException(400, "Solo se pueden eliminar permanentemente SCs canceladas")
    db.delete(sc)
    db.commit()
    return {"status": "success", "data": {"deleted": sc_id}}


# ─── FORMATO CONFIRMACIÓN ────────────────────────────────────────────────────

@router.get("/solicitudes/{sc_id}/formato-confirmacion")
def get_formato_confirmacion(sc_id: int, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Retorna datos estructurados para el formato de confirmación al cliente."""
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "SC no encontrada")
    productos = sc.productos or []
    total = sum(float(p.get("precio_total", p.get("total", 0))) for p in productos)
    return {"status": "success", "data": {
        "numero": sc.numero,
        "cliente": sc.customer_name,
        "email": sc.customer_email,
        "telefono": sc.customer_phone,
        "asesor": sc.advisor_name,
        "tipo": sc.tipo_solicitud,
        "modalidad_pago": sc.modalidad_pago,
        "estado": sc.estado,
        "fecha": sc.fecha_solicitud.isoformat() if sc.fecha_solicitud else sc.created_at.isoformat() if sc.created_at else None,
        "fecha_vencimiento": sc.fecha_vencimiento.isoformat() if sc.fecha_vencimiento else None,
        "productos": productos,
        "total_cop": total,
        "notas": sc.notas,
        "link_confirmacion": f"/confirmar/{sc.numero}",
    }}
