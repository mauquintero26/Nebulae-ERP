"""
ERP Ventas API
Endpoints for: Solicitudes de Cliente (SC), Cotizaciones (COT),
Pedidos de Venta (VEN), Ordenes Pendientes por Pagar (PXP)
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import text, func, select
from typing import Optional, List
from decimal import Decimal
from app.db.database import get_db
from app.models.erp_documents import (
    CustomerRequest, SalesQuotation, SaleOrder,
    PaymentPending, ActivityLog
)
from app.models.customers import Customer
from app.models.inventory import InventoryLevel, InventoryOperation, InventoryMovement
from app.models.fase1b import InventoryOwnerBalance
from app.api.dependencies import (
    require_roles, get_current_user,
    ROLE_ADMIN, ROLE_ASESOR, ROLE_COMPRAS, ROLE_FINANZAS, ALL_ERP_ROLES
)
from app.models.users import User
from app.api.v1.schemas_compras import CancelarSolicitudBody
from app.api.v1.crm import mover_lead_de_solicitud
import datetime
import hashlib
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

API = "http://localhost:5000/api/v1"

# ─── Delivery Date Constants ──────────────────────────────────────────────────
DIAS_ENTREGA_DEFAULT = {"NORMAL": 18, "INMEDIATA": 3}

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _int_or_none(v):
    """Los endpoints de este modulo reciben `body: dict` sin validacion de
    Pydantic. Los <select> opcionales del frontend (asesor, asignado_a) usan
    '' como valor 'nada seleccionado', lo que rompe el INSERT/UPDATE en
    columnas Integer (psycopg2 DataError) si se pasa tal cual."""
    if v in (None, ""):
        return None
    return int(v)

def _next_seq(db: Session, seq_name: str) -> int:
    r = db.execute(text(f"SELECT nextval(\'{seq_name}\')")).scalar()
    return r

def _validar_precios_productos(productos: list) -> None:
    """La Calculadora de Cotizacion permite guardar filas sin costo/precio
    (quedan en $0). Bloqueamos el guardado -- igual que create_pec en
    erp_compras.py -- para que nunca quede una cotizacion 'creada' con un
    producto a precio cero."""
    if not productos:
        return
    for prod in productos:
        precio = (prod.get("unit_price_cop") or prod.get("total_cop") or prod.get("precio_cop")
                  or prod.get("precio_unitario") or prod.get("cost_usd") or 0)
        try:
            precio = float(precio)
        except (TypeError, ValueError):
            precio = 0
        if precio <= 0:
            nombre_prod = prod.get("product_name") or prod.get("nombre") or prod.get("producto") or "producto"
            raise HTTPException(
                422,
                f"El producto '{nombre_prod}' no tiene precio definido. Ingresa un costo/precio antes de guardar la cotizacion.",
            )

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

def _lista_compras_items_de(db: Session, pven_id: int) -> list:
    """Items de la Lista de Compras (JSON en web_builder_config) que pertenecen
    a este Pedido de Venta -- usado para saber si ya se eligio esa via de
    compra, sin duplicar el modelo de datos de erp_compras.py.

    web_builder_config NO se trunca entre corridas de pytest/reset de datos,
    a diferencia de sale_orders -- si un PVEN es eliminado y el id numerico
    se reutiliza, un item huerfano con ese mismo pven_id podia "adjuntarse"
    a un PVEN completamente distinto. Se valida contra el numero real del
    pedido y se auto-limpian los items huerfanos que ya no correspondan."""
    from app.api.v1.erp_compras import _load_lista_compras, _save_lista_compras
    items = _load_lista_compras(db)
    candidatos = [it for it in items if it.get("pven_id") == pven_id]
    if not candidatos:
        return []

    ven = db.query(SaleOrder).filter(SaleOrder.id == pven_id).first()
    vigentes = [it for it in candidatos if ven and it.get("pven_numero") == ven.numero]
    if len(vigentes) != len(candidatos):
        # Hay items huerfanos (numero no coincide o el PVEN ya no existe) -- se purgan.
        ids_vigentes = {it.get("id") for it in vigentes}
        items_limpios = [it for it in items if it.get("pven_id") != pven_id or it.get("id") in ids_vigentes]
        _save_lista_compras(db, items_limpios)
    # Un item DESCARTADO (eliminado por el usuario) ya no cuenta como
    # "decision tomada" -- el bloque para elegir de nuevo entre Crear Pedido
    # de Compra / Agregar a Lista de Compras debe volver a aparecer.
    return [it for it in vigentes if it.get("estado") != "DESCARTADO"]

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
        "advisor_user_id": sc.advisor_user_id,
        "tipo_solicitud": sc.tipo_solicitud or "Cotizacion de Producto",
        "modalidad_pago": sc.modalidad_pago,
        "estado": sc.estado,
        "fecha_solicitud": sc.fecha_solicitud.isoformat() if sc.fecha_solicitud else None,
        "fecha_vencimiento": sc.fecha_vencimiento.isoformat() if sc.fecha_vencimiento else None,
        "fecha_entrega_estimada": sc.fecha_entrega_estimada.isoformat() if sc.fecha_entrega_estimada else None,
        "modalidad_entrega": sc.modalidad_entrega,
        "notas": sc.notas,
        "productos": sc.productos or [],
        "created_at": sc.created_at.isoformat() if sc.created_at else None,
        "updated_at": sc.updated_at.isoformat() if sc.updated_at else None,
        "created_by": sc.created_by,
        "razon_cancelacion": getattr(sc, "razon_cancelacion", None),
        "eliminada_at": sc.eliminada_at.isoformat() if getattr(sc, "eliminada_at", None) else None,
        "tipo_problema": sc.tipo_problema,
        "descripcion_problema": sc.descripcion_problema,
        "urgencia": sc.urgencia,
        "evidencia_descripcion": sc.evidencia_descripcion,
        "asignado_a_user_id": sc.asignado_a_user_id,
        "estado_soporte": sc.estado_soporte,
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
        "canal_envio": cot.canal_envio,
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
        "cancellation_reason": v.cancellation_reason,
        "cancellation_authorized_by": v.cancellation_authorized_by,
        "cancelled_at": v.cancelled_at.isoformat() if v.cancelled_at else None,
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
    # Auto vencimiento: 5 dias por defecto
    venc = datetime.datetime.utcnow() + datetime.timedelta(days=body.get("dias_vencimiento", 5))

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

    es_soporte = body.get("tipo_solicitud") == "Soporte Tecnico"
    # Derive modalidad_entrega from tipo_solicitud
    modalidad_entrega = "INMEDIATA" if body.get("tipo_solicitud") == "Pedido Inmediato" else "NORMAL"

    sc = CustomerRequest(
        numero=numero,
        customer_id=body.get("customer_id"),
        customer_name=cust_name,
        customer_phone=cust_phone,
        customer_email=cust_email,
        customer_address=cust_addr,
        advisor_name=body.get("advisor_name"),
        advisor_user_id=_int_or_none(body.get("advisor_user_id")),
        tipo_solicitud=body.get("tipo_solicitud", "Cotizacion de Producto"),
        modalidad_pago=body.get("modalidad_pago", "Contado"),
        estado="N/A_SOPORTE" if es_soporte else "BORRADOR",
        tipo_problema=body.get("tipo_problema"),
        descripcion_problema=body.get("descripcion_problema"),
        urgencia=body.get("urgencia"),
        evidencia_descripcion=body.get("evidencia_descripcion"),
        asignado_a_user_id=_int_or_none(body.get("asignado_a_user_id")),
        estado_soporte="ABIERTO" if es_soporte else None,
        fecha_vencimiento=venc,
        modalidad_entrega=modalidad_entrega,
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


@router.get("/solicitudes/papelera")
def get_papelera(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Lista SCs canceladas con días restantes antes de eliminación permanente."""
    try:
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
    fecha_vieja = sc.fecha_entrega_estimada if "fecha_entrega_estimada" in body else None
    allowed = ["customer_id","customer_name","customer_phone","customer_email",
               "customer_address","advisor_name","advisor_user_id","tipo_solicitud","modalidad_pago","estado",
               "fecha_vencimiento","fecha_entrega_estimada","notas","productos",
               "tipo_problema","descripcion_problema","urgencia","evidencia_descripcion",
               "asignado_a_user_id","estado_soporte"]
    for k in allowed:
        if k in body:
            v = body[k]
            if k in ("advisor_user_id", "asignado_a_user_id"):
                v = _int_or_none(v)
            setattr(sc, k, v)
    sc.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(sc)
    if body.get("estado") and body["estado"] != old_estado:
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
             f"Estado cambiado a {sc.estado}",
             old_estado=old_estado, new_estado=sc.estado,
             user_name=body.get("updated_by"))
    if fecha_vieja is not None and sc.fecha_entrega_estimada and sc.fecha_entrega_estimada != fecha_vieja:
        diff_dias = (sc.fecha_entrega_estimada - fecha_vieja).days
        signo = "+" if diff_dias >= 0 else ""
        _log(db, "SC", sc.id, sc.numero, "FECHA_ENTREGA_MODIFICADA",
             f"Fecha de entrega modificada: {fecha_vieja.strftime('%d/%m/%Y')} -> "
             f"{sc.fecha_entrega_estimada.strftime('%d/%m/%Y')} ({signo}{diff_dias} día{'s' if abs(diff_dias)!=1 else ''})",
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

    # Al crear el borrador de cotizacion, la solicitud pasa a COTIZADA (no CONFIRMADA:
    # eso solo ocurre cuando el cliente realmente confirma la cotizacion).
    old_estado = sc.estado
    sc.estado = "COTIZADA"
    sc.updated_at = datetime.datetime.utcnow()

    # Calculate delivery date based on modalidad_entrega
    dias = DIAS_ENTREGA_DEFAULT.get(sc.modalidad_entrega, DIAS_ENTREGA_DEFAULT["NORMAL"])
    entrega_est = datetime.datetime.utcnow() + datetime.timedelta(days=dias)
    sc.fecha_entrega_estimada = entrega_est

    db.commit()

    _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
         "Solicitud cotizada - Cotizacion creada",
         old_estado=old_estado, new_estado="COTIZADA",
         user_name=body.get("user_name"))

    # Create COT automatically
    cot_numero = _gen_numero(db, "COT-", "seq_cot")
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
    _validar_precios_productos(body.get("productos") or [])
    numero = _gen_numero(db, "COT-", "seq_cot")
    entrega_est = None
    if body.get("dias_entrega"):
        entrega_est = datetime.datetime.utcnow() + datetime.timedelta(days=body["dias_entrega"])

    sc_id = body.get("sc_id")
    sc_numero = body.get("sc_numero")
    customer_id = body.get("customer_id")
    customer_name = body.get("customer_name")
    customer_phone = body.get("customer_phone")
    customer_email = body.get("customer_email")
    customer_address = body.get("customer_address")
    if sc_id:
        # La Solicitud de Cliente es la fuente autoritativa de estos datos.
        # No confiar en lo que mande el body para ellos: si el llamador (ej.
        # Cotizador Rapido en /dashboard/cotiza) manda sc_id pero omite
        # sc_numero/customer_name, antes quedaban vacios para siempre y el
        # chip "Origen" terminaba mostrando el id crudo (SC-8) en vez del
        # numero real (SC-20260317). Ver confirmar_solicitud() arriba, que
        # ya hacia esto bien por tener el objeto SC en memoria.
        sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
        if sc:
            sc_numero = sc.numero
            customer_id = sc.customer_id
            customer_name = sc.customer_name
            customer_phone = sc.customer_phone
            customer_email = sc.customer_email
            customer_address = sc.customer_address
        # Si no existe (caso raro), se mantiene el comportamiento anterior:
        # usar lo que vino en el body tal cual.

    cot = SalesQuotation(
        numero=numero,
        sc_id=sc_id,
        sc_numero=sc_numero,
        customer_id=customer_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        customer_email=customer_email,
        customer_address=customer_address,
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
    if cot.sc_id:
        mover_lead_de_solicitud(cot.sc_id, "QUOTATION", db)
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


_MAPA_ESTADO_COTIZACION_A_SOLICITUD = {
    "BORRADOR": "COTIZADA",
    "ENVIADA": "EN_ESPERA_CONFIRMACION",
    "PENDIENTE_CONFIRMACION": "EN_ESPERA_CONFIRMACION",
    "CONFIRMADA": "CONFIRMADA",
    "RECHAZADA": "RECHAZADA",
    "VENCIDA": "VENCIDA",
}


def _sincronizar_estado_solicitud_desde_cotizacion(cot: "SalesQuotation", db: Session) -> None:
    """Mantiene CustomerRequest.estado como reflejo fiel del estado real de su Cotizacion."""
    if not cot.sc_id:
        return
    nuevo_estado = _MAPA_ESTADO_COTIZACION_A_SOLICITUD.get(cot.estado)
    if not nuevo_estado:
        return
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == cot.sc_id).first()
    if sc and sc.estado != nuevo_estado:
        sc.estado = nuevo_estado
        sc.updated_at = datetime.datetime.utcnow()
        db.commit()


@router.patch("/cotizaciones/{cot_id}")
def update_cotizacion(cot_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).first()
    if not cot:
        raise HTTPException(404, "Cotizacion no encontrada")
    if "productos" in body:
        _validar_precios_productos(body.get("productos") or [])
    old_estado = cot.estado
    fecha_vieja = cot.fecha_entrega_estimada if "fecha_entrega_estimada" in body else None
    allowed = ["sc_id","customer_id","customer_name","customer_phone","customer_email",
               "customer_address","cotizador","direccion_entrega","trm_rate","subtotal_cop",
               "descuento_pct","total_cop","anticipo_cop","estado","canal_envio","fecha_entrega_estimada",
               "notas","productos","pec_id","pec_numero"]
    for k in allowed:
        if k in body:
            setattr(cot, k, body[k])
    cot.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(cot)
    if body.get("estado") and body["estado"] != old_estado:
        try:
            _sincronizar_estado_solicitud_desde_cotizacion(cot, db)
            if cot.estado == "ENVIADA":
                mover_lead_de_solicitud(cot.sc_id, "QUOTATION", db)
            elif cot.estado == "RECHAZADA":
                mover_lead_de_solicitud(cot.sc_id, "CANCELLED", db)
        except Exception as exc:
            db.rollback()
            logger.error(f"Error al sincronizar Solicitud/Lead tras actualizar cotizacion {cot.id}: {exc}", exc_info=True)
        _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED",
             f"Estado cambiado a {cot.estado}",
             old_estado=old_estado, new_estado=cot.estado,
             user_name=body.get("updated_by"))
    if fecha_vieja is not None and cot.fecha_entrega_estimada and cot.fecha_entrega_estimada != fecha_vieja:
        diff_dias = (cot.fecha_entrega_estimada - fecha_vieja).days
        signo = "+" if diff_dias >= 0 else ""
        _log(db, "COT", cot.id, cot.numero, "FECHA_ENTREGA_MODIFICADA",
             f"Fecha de entrega modificada: {fecha_vieja.strftime('%d/%m/%Y')} -> "
             f"{cot.fecha_entrega_estimada.strftime('%d/%m/%Y')} ({signo}{diff_dias} día{'s' if abs(diff_dias)!=1 else ''})",
             user_name=body.get("updated_by"))
    return {"status": "success", "data": _cot_dict(cot)}


@router.post("/cotizaciones/{cot_id}/confirmar")
def confirmar_cotizacion(cot_id: int, body: dict = Body(default_factory=dict), user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Confirm COT -> creates canonical VEN automatically with idempotent replay"""
    from app.api.v1.erp_ventas_fase4 import convertir_cotizacion_a_venta
    from app.api.v1.schemas_fase5 import ConvertirCotizacionVentaRequest

    req = ConvertirCotizacionVentaRequest(
        idempotency_key=body.get("idempotency_key"),
        user_name=body.get("user_name"),
        direccion_entrega=body.get("direccion_entrega"),
        notas=body.get("notas"),
    )
    res = convertir_cotizacion_a_venta(cot_id, req, user, db)
    # Return format compatible with legacy expectations
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).first()
    ven = db.query(SaleOrder).filter(SaleOrder.id == res["sale_order_id"]).first()
    if res.get("sale_order_id"):
        try:
            mover_lead_de_solicitud(cot.sc_id if cot else None, "INVOICED", db)
            if cot:
                _sincronizar_estado_solicitud_desde_cotizacion(cot, db)
        except Exception as exc:
            db.rollback()
            logger.error(f"Error al sincronizar Solicitud/Lead tras confirmar cotizacion {cot_id}: {exc}", exc_info=True)
    return {
        "status": "success",
        "data": {
            "cotizacion": _cot_dict(cot) if cot else {},
            "pedido_venta": _ven_dict(ven) if ven else {},
            "idempotent_replay": res.get("idempotent_replay", False),
            "sale_order_id": res.get("sale_order_id")
        }
    }


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
    from sqlalchemy.exc import IntegrityError, SQLAlchemyError
    from fastapi import status as http_status
    try:
        numero = _gen_numero(db, "PVEN-", "seq_ven")
    except Exception as exc:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"No se pudo generar el numero de pedido: {type(exc).__name__}",
        )
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
    try:
        db.add(ven)
        db.commit()
        db.refresh(ven)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error de integridad al crear el pedido: {str(exc.orig) if hasattr(exc, 'orig') else str(exc)}",
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error de base de datos al crear el pedido: {type(exc).__name__}",
        )
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
    d["lista_compras_items"] = _lista_compras_items_de(db, ven_id)
    return {"status": "success", "data": d}


def _descontar_inventario_despacho(db: Session, v: SaleOrder, warehouse_id, user_label: Optional[str] = None) -> None:
    """Al despachar un PVEN (estado -> ENTREGADO), descuenta stock fisico real
    de las lineas de v.productos que tengan sku_id vinculado a catalogo (lineas
    de texto libre / es_libre no mueven inventario, no hay nada que descontar).
    Se ejecuta antes del commit del caller: si falta stock de cualquier linea,
    la excepcion aborta la transaccion completa (ni el despacho ni el descuento
    parcial quedan guardados)."""
    lineas = [p for p in (v.productos or []) if isinstance(p, dict) and p.get("sku_id")]
    if not lineas:
        return
    if not warehouse_id:
        raise HTTPException(422, "Debes indicar la bodega de despacho para descontar el inventario de este pedido")
    warehouse_id = int(warehouse_id)
    now = datetime.datetime.utcnow()
    owner = "NEBULAE"

    inv_op = InventoryOperation(
        source_warehouse_id=warehouse_id,
        operation_type="DELIVERY",
        status="DONE",
        source_document_type="PVEN",
        source_document_id=v.id,
        source_document_numero=v.numero,
    )
    db.add(inv_op)
    db.flush()

    for p in lineas:
        sku_id = int(p["sku_id"])
        qty = Decimal(str(p.get("qty") or p.get("quantity") or 1))

        level = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == warehouse_id)
            .with_for_update()
        ).scalar_one_or_none()
        current = Decimal(str(level.quantity)) if level and level.quantity is not None else Decimal("0.00")
        if current < qty:
            raise HTTPException(
                409,
                f"Stock insuficiente para despachar el SKU {sku_id} (disponible: {current}, requerido: {qty})",
            )
        level.quantity = current - qty

        ob = db.execute(
            select(InventoryOwnerBalance)
            .where(
                InventoryOwnerBalance.sku_id == sku_id,
                InventoryOwnerBalance.warehouse_id == warehouse_id,
                InventoryOwnerBalance.owner == owner,
            )
            .with_for_update()
        ).scalar_one_or_none()
        if ob:
            ob.quantity = Decimal(str(ob.quantity)) - qty
            ob.updated_at = now

        mv_key = hashlib.sha256(f"{inv_op.id}:{sku_id}:OUT:{owner}:{warehouse_id}".encode()).hexdigest()
        db.add(InventoryMovement(
            operation_id=inv_op.id, sku_id=sku_id, quantity=qty, direction="OUT",
            owner=owner, warehouse_id=warehouse_id, idempotency_key=mv_key,
            created_at=now, created_by=user_label,
        ))


@router.patch("/pedidos/{ven_id}")
def update_pedido(ven_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    v = db.query(SaleOrder).filter(SaleOrder.id == ven_id).first()
    if not v:
        raise HTTPException(404, "Pedido de venta no encontrado")
    old_estado = v.estado
    fecha_vieja = v.fecha_entrega_estimada if "fecha_entrega_estimada" in body else None
    if body.get("estado") == "CANCELADO" and old_estado in ("ENTREGADO", "FACTURADO"):
        raise HTTPException(422, f"No se puede cancelar un pedido en estado {old_estado}")
    if body.get("estado") == "CANCELADO" and not body.get("cancellation_authorized_by"):
        body["cancellation_authorized_by"] = getattr(user, "email", None)
    allowed = ["estado","notas","productos","pec_id","pec_numero","pxp_id","pxp_numero",
               "fecha_entrega_estimada","direccion_entrega","customer_id","customer_name",
               "customer_phone","customer_email","customer_address","trm_rate",
               "subtotal_cop","descuento_pct","total_cop","anticipo_cop","saldo_cop",
               "cancellation_reason","cancellation_authorized_by","cancelled_at"]
    for k in allowed:
        if k in body:
            setattr(v, k, body[k])
    if body.get("estado") == "ENTREGADO" and old_estado != "ENTREGADO":
        _descontar_inventario_despacho(db, v, body.get("warehouse_id"), getattr(user, "email", None))
    v.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(v)
    if body.get("estado") and body["estado"] != old_estado:
        _log(db, "VEN", v.id, v.numero, "ESTADO_CHANGED",
             f"Estado cambiado a {v.estado}",
             old_estado=old_estado, new_estado=v.estado,
             user_name=body.get("updated_by"))
    if fecha_vieja is not None and v.fecha_entrega_estimada and v.fecha_entrega_estimada != fecha_vieja:
        diff_dias = (v.fecha_entrega_estimada - fecha_vieja).days
        signo = "+" if diff_dias >= 0 else ""
        _log(db, "VEN", v.id, v.numero, "FECHA_ENTREGA_MODIFICADA",
             f"Fecha de entrega modificada: {fecha_vieja.strftime('%d/%m/%Y')} -> "
             f"{v.fecha_entrega_estimada.strftime('%d/%m/%Y')} ({signo}{diff_dias} día{'s' if abs(diff_dias)!=1 else ''})",
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
        r = db.execute(text("SELECT value FROM admin_config WHERE key = :key"), {"key": key}).fetchone()
        return int(r[0]) if r else 2
    except Exception:
        return 2


def _get_alert_hours_soporte(db: Session, urgencia: str) -> int:
    key_map = {"Alta": "alerta_soporte_alta_horas", "Media": "alerta_soporte_media_horas", "Baja": "alerta_soporte_baja_horas"}
    default_map = {"Alta": 4, "Media": 24, "Baja": 48}
    key = key_map.get(urgencia, "alerta_soporte_baja_horas")
    try:
        r = db.execute(text("SELECT value FROM admin_config WHERE key = :key"), {"key": key}).fetchone()
        return int(r[0]) if r else default_map.get(urgencia, 48)
    except Exception:
        return default_map.get(urgencia, 48)


@router.get("/alertas")
def get_alertas(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    dias = _get_alert_days(db)
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=dias)

    # SC activos sin cambio de estado en N dias (excluye Soporte Tecnico, que tiene su propio umbral)
    sc_alertas = db.query(CustomerRequest).filter(
        CustomerRequest.updated_at <= cutoff,
        CustomerRequest.estado.notin_(["CONFIRMADA", "CANCELADA"]),
        CustomerRequest.tipo_solicitud != "Soporte Tecnico",
    ).all()

    # COT activas sin cambio de estado en N dias
    cot_alertas = db.query(SalesQuotation).filter(
        SalesQuotation.updated_at <= cutoff,
        SalesQuotation.estado.notin_(["CONFIRMADA", "RECHAZADA"])
    ).all()

    # Soporte Tecnico: umbral propio por urgencia, solo tickets abiertos/en proceso
    soporte_abiertos = db.query(CustomerRequest).filter(
        CustomerRequest.tipo_solicitud == "Soporte Tecnico",
        CustomerRequest.estado_soporte.in_(["ABIERTO", "EN_PROCESO"]),
    ).all()
    soporte_alertas = []
    for sc in soporte_abiertos:
        horas = _get_alert_hours_soporte(db, sc.urgencia)
        if sc.updated_at <= datetime.datetime.utcnow() - datetime.timedelta(hours=horas):
            soporte_alertas.append(sc)

    return {
        "status": "success",
        "data": {
            "alerta_dias": dias,
            "sc_sin_atender": [_sc_dict(sc) for sc in sc_alertas],
            "cot_sin_atender": [_cot_dict(c) for c in cot_alertas],
            "sc_count": len(sc_alertas),
            "cot_count": len(cot_alertas),
            "soporte_sin_atender": [_sc_dict(sc) for sc in soporte_alertas],
            "soporte_count": len(soporte_alertas),
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
        db.execute(
            text(
                "INSERT INTO admin_config (key, value, updated_at) VALUES (:k, :v, NOW()) "
                "ON CONFLICT (key) DO UPDATE SET value = :v, updated_at = NOW()"
            ),
            {"k": k, "v": str(v)},
        )
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
def cancelar_solicitud(sc_id: int, body: CancelarSolicitudBody,
        user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Cancela una SC con razon obligatoria (min 5 chars) y marca eliminada_at para papelera 30 dias.
    
    Frontend sends 'razon' field; CancelarSolicitudBody maps it to 'motivo' via alias.
    """
    razon = body.motivo  # validated by Pydantic (min 5 chars, max 500)
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "SC no encontrada")
    if sc.tipo_solicitud == "Soporte Tecnico":
        # Soporte Tecnico no usa el flujo de cancelacion ligado a Cotizacion:
        # este endpoint marca eliminada_at (purga en 30 dias via papelera), lo
        # que perderia un ticket de soporte real. Su ciclo de vida se maneja
        # exclusivamente con estado_soporte (PATCH /solicitudes/{id}).
        raise HTTPException(400, "Soporte Tecnico no usa este flujo de cancelacion; cambia su estado_soporte en su lugar")
    old_estado = sc.estado
    sc.estado = "CANCELADA"
    sc.razon_cancelacion = razon
    sc.eliminada_at = datetime.datetime.utcnow()
    sc.notas = f"{sc.notas or ''}\n[CANCELADA] Razón: {razon}".strip()
    sc.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(sc)
    user_name = getattr(body, "user_name", None) or getattr(user, "username", None) or getattr(user, "email", "")
    _log(db, "SC", sc_id, sc.numero, "CANCELLED", f"Cancelada: {razon}", old_estado, "CANCELADA", user_name)
    return {"status": "success", "data": {"id": sc_id, "estado": "CANCELADA", "razon": razon}}


# ─── PAPELERA (SCs canceladas, purga 30 días) ────────────────────────────────

# get_papelera moved above /solicitudes/{sc_id} to fix route shadowing


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


@router.post("/solicitudes/{sc_id}/restaurar")
def restaurar_solicitud(sc_id: int, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Restaura una SC de la papelera (estado CANCELADA) a BORRADOR."""
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "SC no encontrada")
    old_estado = sc.estado
    sc.estado = "BORRADOR"
    try:
        db.execute(text("UPDATE customer_requests SET eliminada_at=NULL, estado='BORRADOR', updated_at=NOW() WHERE id=:id"), {"id": sc_id})
        db.commit()
    except Exception:
        db.rollback()
        sc.estado = "BORRADOR"
        db.commit()
    _log(db, "SC", sc_id, sc.numero, "RESTORED", "Solicitud restaurada a Borrador", old_estado, "BORRADOR", getattr(user, 'email', ''))
    return {"status": "success", "data": {"id": sc_id, "estado": "BORRADOR"}}


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
