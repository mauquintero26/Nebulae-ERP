"""
ERP Compras API
Endpoints for: Proveedores (Suppliers), Pedidos de Compra (PEC),
Recepciones de Inventario (ENINV)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from typing import Optional
from app.db.database import get_db
from app.models.erp_documents import (
    Supplier, PurchaseOrderFull, GoodsReceipt, ActivityLog, SaleOrder
)
from app.models.inventory import InventoryLevel, Warehouse, InventoryOperation, InventoryMovement
from app.api.v1.schemas_compras import (
    ConfirmarRecepcionBody, CrearRecepcionDesdePecBody,
    ActualizarTrackingBody, CrearPecBody, CancelarSolicitudBody, RegistrarPagoBody,
)
from sqlalchemy import select
from app.api.dependencies import (
    require_roles, get_current_user,
    ROLE_ADMIN, ROLE_ASESOR, ROLE_COMPRAS, ROLE_BODEGA, ROLE_FINANZAS, ALL_ERP_ROLES
)
from app.models.users import User
import datetime
import uuid

router = APIRouter()


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
        entity_type=entity_type, entity_id=entity_id,
        entity_numero=entity_numero, action=action,
        description=description, old_estado=old_estado,
        new_estado=new_estado, user_name=user_name, extra_data=extra_data,
    )
    db.add(log)
    db.commit()

def _supplier_dict(s: Supplier) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "reference": s.reference,
        "contact_name": s.contact_name,
        "phone": s.phone,
        "email": s.email,
        "address": s.address,
        "city": s.city,
        "country": s.country,
        "payment_terms": s.payment_terms,
        "is_active": s.is_active,
        "notes": s.notes,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }

def _pec_dict(p: PurchaseOrderFull) -> dict:
    return {
        "id": p.id,
        "numero": p.numero,
        "supplier_id": p.supplier_id,
        "supplier_name": p.supplier_name,
        "supplier_ref": p.supplier_ref,
        "ven_id": p.ven_id,
        "ven_numero": p.ven_numero,
        "modalidad_pago": p.modalidad_pago,
        "metodo_pago": p.metodo_pago,
        "warehouse_id": p.warehouse_id,
        "carrier": p.carrier,
        "tracking_number": p.tracking_number,
        "tracking_stages": p.tracking_stages or [],
        "estado": p.estado,
        "fecha_compra": p.fecha_compra.isoformat() if p.fecha_compra else None,
        "fecha_entrega_estimada": p.fecha_entrega_estimada.isoformat() if p.fecha_entrega_estimada else None,
        "fecha_alerta": p.fecha_alerta.isoformat() if p.fecha_alerta else None,
        "subtotal_cop": float(p.subtotal_cop) if p.subtotal_cop else 0,
        "total_cop": float(p.total_cop) if p.total_cop else 0,
        "notas": p.notas,
        "productos": p.productos or [],
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        "created_by": p.created_by,
        # timer info
        "days_until_delivery": _days_until(p.fecha_entrega_estimada),
        "is_overdue": _is_overdue(p.fecha_entrega_estimada),
    }

def _gr_dict(g: GoodsReceipt) -> dict:
    return {
        "id": g.id,
        "numero": g.numero,
        "pec_id": g.pec_id,
        "pec_numero": g.pec_numero,
        "supplier_id": g.supplier_id,
        "supplier_name": g.supplier_name,
        "warehouse_id": g.warehouse_id,
        "warehouse_name": g.warehouse_name,
        "carrier": g.carrier,
        "tracking_number": g.tracking_number,
        "operacion_tipo": g.operacion_tipo,
        "estado": g.estado,
        "fecha_recepcion": g.fecha_recepcion.isoformat() if g.fecha_recepcion else None,
        "notas": g.notas,
        "productos": g.productos or [],
        "stock_actualizado": g.stock_actualizado,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "updated_at": g.updated_at.isoformat() if g.updated_at else None,
        "created_by": g.created_by,
    }

def _log_dict(l: ActivityLog) -> dict:
    return {
        "id": l.id, "entity_type": l.entity_type, "entity_id": l.entity_id,
        "entity_numero": l.entity_numero, "action": l.action,
        "description": l.description, "old_estado": l.old_estado,
        "new_estado": l.new_estado, "user_name": l.user_name,
        "created_at": l.created_at.isoformat() if l.created_at else None,
        "extra_data": l.extra_data,
    }

def _days_until(dt) -> int | None:
    if not dt:
        return None
    delta = dt - datetime.datetime.utcnow()
    return delta.days

def _is_overdue(dt) -> bool:
    if not dt:
        return False
    return datetime.datetime.utcnow() > dt


# ─── SUPPLIERS ───────────────────────────────────────────────────────────────

@router.get("/proveedores")
def list_suppliers(
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    q = db.query(Supplier)
    if is_active is not None:
        q = q.filter(Supplier.is_active == is_active)
    if search:
        like = f"%{search}%"
        q = q.filter(
            Supplier.name.ilike(like) |
            Supplier.reference.ilike(like) |
            Supplier.contact_name.ilike(like) |
            Supplier.email.ilike(like)
        )
    total = q.count()
    items = q.order_by(Supplier.name).offset(offset).limit(limit).all()
    return {"status": "success", "total": total, "data": [_supplier_dict(s) for s in items]}


@router.get("/proveedores/search")
def search_suppliers(q: str = "", user: User = Depends(require_roles(*ALL_ERP_ROLES)),
        db: Session = Depends(get_db)):
    like = f"%{q}%"
    items = db.query(Supplier).filter(
        Supplier.is_active == True,
        Supplier.name.ilike(like) | Supplier.reference.ilike(like)
    ).limit(10).all()
    return {"status": "success", "data": [_supplier_dict(s) for s in items]}


@router.post("/proveedores", status_code=201)
def create_supplier(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    s = Supplier(
        name=body["name"],
        reference=body.get("reference"),
        contact_name=body.get("contact_name"),
        phone=body.get("phone"),
        email=body.get("email"),
        address=body.get("address"),
        city=body.get("city"),
        country=body.get("country", "Colombia"),
        payment_terms=body.get("payment_terms"),
        notes=body.get("notes"),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"status": "success", "data": _supplier_dict(s)}


@router.get("/proveedores/{supplier_id}")
def get_supplier(supplier_id: int, user: User = Depends(require_roles(*ALL_ERP_ROLES)),
        db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(404, "Proveedor no encontrado")
    d = _supplier_dict(s)
    pecs = db.query(PurchaseOrderFull).filter(
        PurchaseOrderFull.supplier_id == supplier_id
    ).order_by(PurchaseOrderFull.created_at.desc()).limit(10).all()
    d["pedidos_recientes"] = [_pec_dict(p) for p in pecs]
    return {"status": "success", "data": d}


@router.patch("/proveedores/{supplier_id}")
def update_supplier(supplier_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(404, "Proveedor no encontrado")
    for k in ["name","reference","contact_name","phone","email","address","city","country","payment_terms","notes","is_active"]:
        if k in body:
            setattr(s, k, body[k])
    s.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(s)
    return {"status": "success", "data": _supplier_dict(s)}


# ─── PEDIDOS DE COMPRA (PEC) ─────────────────────────────────────────────────

@router.get("/pedidos")
def list_pec(
    estado: Optional[str] = None,
    supplier_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    q = db.query(PurchaseOrderFull)
    if estado:
        q = q.filter(PurchaseOrderFull.estado == estado)
    if supplier_id:
        q = q.filter(PurchaseOrderFull.supplier_id == supplier_id)
    if search:
        like = f"%{search}%"
        q = q.filter(
            PurchaseOrderFull.numero.ilike(like) |
            PurchaseOrderFull.supplier_name.ilike(like) |
            PurchaseOrderFull.ven_numero.ilike(like)
        )
    total = q.count()
    items = q.order_by(PurchaseOrderFull.created_at.desc()).offset(offset).limit(limit).all()
    return {"status": "success", "total": total, "data": [_pec_dict(p) for p in items]}


@router.post("/pedidos", status_code=201)
def create_pec(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    numero = _gen_numero(db, "PEC-", "seq_pec")
    # Default delivery: 15 days
    days = body.get("dias_entrega", 15)
    entrega_est = datetime.datetime.utcnow() + datetime.timedelta(days=days)
    alerta = entrega_est  # alert on delivery date

    # Initial tracking stages
    tracking_stages = [
        {"stage": "PROVEEDOR_CASILLERO", "label": "Proveedor -> Casillero", "status": "PENDIENTE", "timestamp": None},
        {"stage": "CASILLERO_ADUANA",    "label": "Casillero -> Aduana",    "status": "PENDIENTE", "timestamp": None},
        {"stage": "ADUANA_BODEGA",       "label": "Aduana -> Bodega",       "status": "PENDIENTE", "timestamp": None},
        {"stage": "ENTREGADO",           "label": "Entregado en Bodega",    "status": "PENDIENTE", "timestamp": None},
    ]

    # Get supplier info if supplier_id provided
    supplier_name = body.get("supplier_name", "")
    supplier_ref = body.get("supplier_ref", "")
    if body.get("supplier_id"):
        s = db.query(Supplier).filter(Supplier.id == body["supplier_id"]).first()
        if s:
            supplier_name = supplier_name or s.name
            supplier_ref = supplier_ref or s.reference or ""

    pec = PurchaseOrderFull(
        numero=numero,
        supplier_id=body.get("supplier_id"),
        supplier_name=supplier_name,
        supplier_ref=supplier_ref,
        ven_id=body.get("ven_id"),
        ven_numero=body.get("ven_numero"),
        modalidad_pago=body.get("modalidad_pago", "Contado"),
        metodo_pago=body.get("metodo_pago"),
        warehouse_id=body.get("warehouse_id"),
        carrier=body.get("carrier"),
        tracking_number=body.get("tracking_number"),
        tracking_stages=tracking_stages,
        estado="BORRADOR",
        fecha_entrega_estimada=entrega_est,
        fecha_alerta=alerta,
        subtotal_cop=body.get("subtotal_cop", 0),
        total_cop=body.get("total_cop", 0),
        notas=body.get("notas"),
        productos=body.get("productos", []),
        created_by=body.get("created_by"),
    )
    db.add(pec)
    db.commit()
    db.refresh(pec)

    # If linked to VEN, update VEN with pec_id
    if body.get("ven_id"):
        ven = db.query(SaleOrder).filter(SaleOrder.id == body["ven_id"]).first()
        if ven:
            ven.pec_id = pec.id
            ven.pec_numero = pec.numero
            ven.estado = "EN_TRANSITO"
            ven.updated_at = datetime.datetime.utcnow()
            db.commit()

    _log(db, "PEC", pec.id, pec.numero, "CREATED",
         f"Pedido de compra {pec.numero} creado. Entrega estimada: {entrega_est.strftime('%d/%m/%Y')}",
         new_estado="BORRADOR", user_name=body.get("created_by"))

    return {"status": "success", "data": _pec_dict(pec)}


@router.get("/pedidos/{pec_id}")
def get_pec(pec_id: int, user: User = Depends(require_roles(*ALL_ERP_ROLES)),
        db: Session = Depends(get_db)):
    p = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec_id).first()
    if not p:
        raise HTTPException(404, "Pedido de compra no encontrado")
    logs = db.query(ActivityLog).filter(
        ActivityLog.entity_type == "PEC",
        ActivityLog.entity_id == pec_id
    ).order_by(ActivityLog.created_at.asc()).all()
    d = _pec_dict(p)
    d["actividades"] = [_log_dict(l) for l in logs]
    grs = db.query(GoodsReceipt).filter(GoodsReceipt.pec_id == pec_id).all()
    d["recepciones"] = [_gr_dict(g) for g in grs]
    return {"status": "success", "data": d}


@router.patch("/pedidos/{pec_id}")
def update_pec(pec_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    p = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec_id).first()
    if not p:
        raise HTTPException(404, "Pedido de compra no encontrado")
    old_estado = p.estado
    allowed = ["estado","supplier_id","supplier_name","supplier_ref","modalidad_pago",
               "metodo_pago","warehouse_id","carrier","tracking_number","tracking_stages",
               "fecha_entrega_estimada","fecha_alerta","subtotal_cop","total_cop",
               "notas","productos","ven_id","ven_numero","tracking_history",
               "tipo_envio","casillero","fecha_compra"]
    for k in allowed:
        if k in body:
            setattr(p, k, body[k])
    p.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(p)
    if body.get("estado") and body["estado"] != old_estado:
        _log(db, "PEC", p.id, p.numero, "ESTADO_CHANGED",
             f"Estado cambiado a {p.estado}",
             old_estado=old_estado, new_estado=p.estado,
             user_name=body.get("updated_by"))
    return {"status": "success", "data": _pec_dict(p)}


@router.patch("/pedidos/{pec_id}/tracking")
def update_tracking(pec_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    """Update a tracking stage status, tracking number, and append to tracking history"""
    p = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec_id).first()
    if not p:
        raise HTTPException(404, "Pedido de compra no encontrado")

    stage_name = body.get("stage")
    new_status = body.get("status")  # PENDIENTE, EN_PROCESO, COMPLETADO
    tracking_num = body.get("tracking_number")
    stages = list(p.tracking_stages or [])
    now = datetime.datetime.utcnow().isoformat()

    for i, s in enumerate(stages):
        if s["stage"] == stage_name:
            stages[i]["status"] = new_status
            stages[i]["timestamp"] = now
            stages[i]["notes"] = body.get("notes") or s.get("notes")
            if tracking_num:
                stages[i]["tracking_number"] = tracking_num
                # Append to tracking history for this stage
                history = stages[i].get("tracking_history", [])
                history.append({
                    "numero": tracking_num,
                    "fecha": now,
                    "notas": body.get("notes"),
                    "user": body.get("user_name"),
                })
                stages[i]["tracking_history"] = history
            break

    p.tracking_stages = stages
    p.updated_at = datetime.datetime.utcnow()

    # Auto-update PEC estado based on tracking completions
    completed = [s for s in stages if s.get("status") == "COMPLETADO"]
    last_stage = stages[-1] if stages else {}
    if last_stage.get("status") == "COMPLETADO":
        old_e = p.estado
        p.estado = "RECIBIDO"
        if old_e != "RECIBIDO":
            _log(db, "PEC", p.id, p.numero, "ESTADO_CHANGED",
                 "Recibido en bodega — todos los stages completados",
                 old_estado=old_e, new_estado="RECIBIDO",
                 user_name=body.get("user_name"))
    elif any(s.get("status") == "EN_PROCESO" for s in stages):
        if p.estado in ("BORRADOR", "EMITIDO"):
            p.estado = "EN_TRANSITO"

    db.commit()
    db.refresh(p)
    _log(db, "PEC", p.id, p.numero, "TRACKING_UPDATED",
         f"Etapa {stage_name} → {new_status}" + (f" | Guía: {tracking_num}" if tracking_num else ""),
         user_name=body.get("user_name"))
    return {"status": "success", "data": _pec_dict(p)}


@router.post("/pedidos/{pec_id}/recepcionar")
def crear_recepcion_desde_pec(
    pec_id: int,
    body: CrearRecepcionDesdePecBody,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
    db: Session = Depends(get_db),
):
    """
    Crea una GoodsReceipt (ENINV) desde un PEC.
    Solo incluye cantidades PENDIENTES (qty_ordenada - qty_ya_recibida_en_recepciones_FISICAS),
    salvo que body.force_full=True, en cuyo caso copia el total ordenado.
    """
    p = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec_id).first()
    if not p:
        raise HTTPException(404, "Pedido de compra no encontrado")

    eninv_numero = _gen_numero(db, "ENINV-", "seq_eninv")

    wh = None
    wh_name = p.supplier_name or "Bodega Principal"
    wid = body.warehouse_id or p.warehouse_id
    if wid:
        wh = db.query(Warehouse).filter(Warehouse.id == wid).first()
        if wh:
            wh_name = wh.name

    # Calcular cantidades ya recibidas en recepciones FISICAS confirmadas
    ya_recibidas: dict = {}  # {sku_id: qty_acumulada}
    if not body.force_full:
        recepciones_conf = db.query(GoodsReceipt).filter(
            GoodsReceipt.pec_id == pec_id,
            GoodsReceipt.stock_actualizado == True,
        ).all()
        for r in recepciones_conf:
            for prod in (r.productos or []):
                sid = prod.get("sku_id")
                if sid:
                    ya_recibidas[sid] = (
                        ya_recibidas.get(sid, 0)
                        + int(prod.get("qty_recibida", prod.get("qty", 0)))
                    )

    # Construir lista de productos con cantidades PENDIENTES
    productos_recepcion = []
    for prod in (p.productos or []):
        qty_total = int(prod.get("qty", prod.get("quantity", 0)))
        sku_id    = prod.get("sku_id")

        if body.force_full:
            qty_pendiente = qty_total
        else:
            qty_ya = ya_recibidas.get(sku_id, 0) if sku_id else 0
            qty_pendiente = max(0, qty_total - qty_ya)

        if qty_pendiente == 0:
            continue  # Omitir productos ya completamente recibidos

        productos_recepcion.append({
            **prod,
            "qty_esperada": qty_pendiente,
            "qty_recibida": 0,
            "paquetes": 0,
            "estado": "PENDIENTE",
        })

    if not productos_recepcion:
        raise HTTPException(
            400,
            "Todos los productos de esta PEC ya han sido recibidos. "
            "Usa force_full=true para crear una recepcion de excedente."
        )

    gr = GoodsReceipt(
        numero         = eninv_numero,
        pec_id         = p.id,
        pec_numero     = p.numero,
        supplier_id    = p.supplier_id,
        supplier_name  = p.supplier_name,
        warehouse_id   = wid,
        warehouse_name = wh_name,
        carrier        = p.carrier,
        tracking_number= p.tracking_number,
        operacion_tipo = "RECEPCION",
        estado         = "BORRADOR",
        notas          = body.notas,
        productos      = productos_recepcion,
        created_by     = body.created_by,
    )
    db.add(gr)
    db.commit()
    db.refresh(gr)

    db.add(ActivityLog(
        entity_type   = "ENINV",
        entity_id     = gr.id,
        entity_numero = gr.numero,
        action        = "CREATED",
        description   = f"Recepcion {gr.numero} creada desde {p.numero}",
        new_estado    = "BORRADOR",
        user_name     = body.created_by,
    ))
    db.add(ActivityLog(
        entity_type   = "PEC",
        entity_id     = p.id,
        entity_numero = p.numero,
        action        = "RECEPCION_CREATED",
        description   = f"Recepcion {gr.numero} iniciada",
        user_name     = body.created_by,
    ))
    db.commit()

    return {"status": "success", "data": _gr_dict(gr)}



@router.get("/recepciones")
def list_recepciones(
    estado: Optional[str] = None,
    pec_id: Optional[int] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    q = db.query(GoodsReceipt)
    if estado:
        q = q.filter(GoodsReceipt.estado == estado)
    if pec_id:
        q = q.filter(GoodsReceipt.pec_id == pec_id)
    total = q.count()
    items = q.order_by(GoodsReceipt.created_at.desc()).offset(offset).limit(limit).all()
    return {"status": "success", "total": total, "data": [_gr_dict(g) for g in items]}


@router.post("/recepciones", status_code=201)
def create_recepcion(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    numero = _gen_numero(db, "ENINV-", "seq_eninv")
    gr = GoodsReceipt(
        numero=numero,
        pec_id=body.get("pec_id"),
        pec_numero=body.get("pec_numero"),
        supplier_id=body.get("supplier_id"),
        supplier_name=body.get("supplier_name"),
        warehouse_id=body.get("warehouse_id"),
        warehouse_name=body.get("warehouse_name"),
        carrier=body.get("carrier"),
        tracking_number=body.get("tracking_number"),
        operacion_tipo=body.get("operacion_tipo", "RECEPCION"),
        estado="BORRADOR",
        notas=body.get("notas"),
        productos=body.get("productos", []),
        created_by=body.get("created_by"),
    )
    db.add(gr)
    db.commit()
    db.refresh(gr)
    _log(db, "ENINV", gr.id, gr.numero, "CREATED",
         f"Recepcion {gr.numero} creada",
         new_estado="BORRADOR", user_name=body.get("created_by"))
    return {"status": "success", "data": _gr_dict(gr)}


@router.get("/recepciones/{eninv_id}")
def get_recepcion(eninv_id: int, user: User = Depends(require_roles(*ALL_ERP_ROLES)),
        db: Session = Depends(get_db)):
    g = db.query(GoodsReceipt).filter(GoodsReceipt.id == eninv_id).first()
    if not g:
        raise HTTPException(404, "Recepcion no encontrada")
    logs = db.query(ActivityLog).filter(
        ActivityLog.entity_type == "ENINV",
        ActivityLog.entity_id == eninv_id
    ).order_by(ActivityLog.created_at.asc()).all()
    d = _gr_dict(g)
    d["actividades"] = [_log_dict(l) for l in logs]
    return {"status": "success", "data": d}


@router.patch("/recepciones/{eninv_id}")
def update_recepcion(eninv_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    g = db.query(GoodsReceipt).filter(GoodsReceipt.id == eninv_id).first()
    if not g:
        raise HTTPException(404, "Recepcion no encontrada")
    old_estado = g.estado
    allowed = ["estado","warehouse_id","warehouse_name","carrier","tracking_number",
               "operacion_tipo","notas","productos"]
    for k in allowed:
        if k in body:
            setattr(g, k, body[k])
    g.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(g)
    if body.get("estado") and body["estado"] != old_estado:
        _log(db, "ENINV", g.id, g.numero, "ESTADO_CHANGED",
             f"Estado cambiado a {g.estado}",
             old_estado=old_estado, new_estado=g.estado,
             user_name=body.get("updated_by"))
    return {"status": "success", "data": _gr_dict(g)}


@router.post("/recepciones/{eninv_id}/confirmar")
def confirmar_recepcion(
    eninv_id: int,
    body: ConfirmarRecepcionBody,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """
    Confirma una recepcion de mercancia (Fase 1A â€” sobre JSON existente).

    Correcciones v3:
    - Pydantic schema: receipt_type y idempotency_key validados antes de entrar.
    - SELECT FOR UPDATE: bloquea GoodsReceipt e InventoryLevel para evitar race conditions.
    - INSERT ... ON CONFLICT DO NOTHING + ejecucion_token: idempotencia atomica.
      Solo la ejecucion que inserto el registro puede procesar; la perdedora devuelve 409.
    - JSON real: json.dumps/json.loads en lugar de str().
    - Calculo acumulado de PEC: suma TODAS las recepciones FISICAS confirmadas.
    - LOGISTICA: no toca stock_actualizado ni inventory_levels, no avanza PEC.
    - Auditoria dentro de la misma transaccion.
    - Modelos SQLAlchemy con columnas reales: sin hasattr() ni try/except AttributeError.
    """
    import hashlib, json as _json
    from sqlalchemy import text as _text, select
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from app.db.database import SessionLocal

    now = datetime.datetime.utcnow()

    # Extraer valores validados del schema Pydantic
    client_key   = body.idempotency_key
    receipt_type = body.receipt_type
    user_label   = body.user_name or (
        user.username if hasattr(user, "username") else str(user.id)
    )

    # Calcular hash del payload (sin la clave misma)
    body_for_hash = {
        "receipt_type": receipt_type,
        "eninv_id": eninv_id,
    }
    req_hash = hashlib.sha256(
        _json.dumps(body_for_hash, sort_keys=True).encode()
    ).hexdigest()

    # Token de ejecucion: UUID unico para ESTA llamada.
    # Solo la ejecucion que inserto el registro (con su propio token) puede procesar.
    execution_token = str(uuid.uuid4())

    # â”€â”€â”€ IDEMPOTENCIA ATOMICA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # INSERT ... ON CONFLICT DO NOTHING garantiza atomicidad sin race condition.
    # Si dos solicitudes llegan al mismo tiempo con la misma clave, solo una
    # inserta exitosamente. La otra recibe 0 rows affected.
    has_idem_table = False
    try:
        count = db.execute(_text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_name='idempotency_requests'"
        )).scalar()
        has_idem_table = count > 0
    except Exception:
        pass

    won_lock = False  # True si ESTA ejecucion gano el lock de idempotencia

    if has_idem_table:
        # Intentar insercion atomica con el token de esta ejecucion
        result = db.execute(_text(
            "INSERT INTO idempotency_requests "
            "(operation_type, operation_key, request_hash, entity_type, entity_id, "
            " user_id, status, execution_token, request_body, created_at) "
            "VALUES ('CONFIRMAR_RECEPCION', :k, :h, 'ENINV', :eid, :uid, "
            "        'PROCESSING', :token, :body::jsonb, :now) "
            "ON CONFLICT (operation_type, operation_key) DO NOTHING"
        ), {
            "k": client_key, "h": req_hash, "eid": eninv_id,
            "uid": user.id, "token": execution_token,
            "body": _json.dumps(body_for_hash),
            "now": now,
        })
        db.flush()

        if result.rowcount == 1:
            # Ganamos: esta ejecucion creÃ³ el registro PROCESSING
            won_lock = True
        else:
            # Registro ya existia: leer estado actual
            row = db.execute(_text(
                "SELECT status, request_hash, response_body, execution_token "
                "FROM idempotency_requests "
                "WHERE operation_type='CONFIRMAR_RECEPCION' AND operation_key=:k"
            ), {"k": client_key}).fetchone()

            if row is None:
                raise HTTPException(500, "Error inesperado en idempotencia")

            if row.status == "DONE":
                if row.request_hash != req_hash:
                    raise HTTPException(
                        409,
                        "La clave de idempotencia ya fue usada con un payload diferente."
                    )
                # Mismo payload: replay
                stored = row.response_body
                if isinstance(stored, str):
                    stored = _json.loads(stored)
                return {"status": "success", "data": stored, "idempotent_replay": True}

            elif row.status == "PROCESSING":
                raise HTTPException(409, "Operacion en proceso. Reintenta en unos segundos.")

            elif row.status == "FAILED":
                if row.request_hash != req_hash:
                    raise HTTPException(
                        409,
                        "La clave de idempotencia (FAILED) fue usada con payload diferente."
                    )
                # Mismo payload, operacion fallida -> permitir reintento
                # Actualizar a PROCESSING con nuevo token
                db.execute(_text(
                    "UPDATE idempotency_requests "
                    "SET status='PROCESSING', execution_token=:token, created_at=:now "
                    "WHERE operation_type='CONFIRMAR_RECEPCION' AND operation_key=:k "
                    "  AND status='FAILED'"
                ), {"token": execution_token, "now": now, "k": client_key})
                db.flush()
                won_lock = True
    else:
        # Sin tabla de idempotencia: verificar stock_actualizado (proteccion basica)
        pass  # Se comprobara despues del SELECT FOR UPDATE

    # â”€â”€â”€ SELECT FOR UPDATE â€” bloquear la recepcion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # Previene que dos procesos confirmen la misma ENINV concurrentemente.
    g = db.execute(
        select(GoodsReceipt)
        .where(GoodsReceipt.id == eninv_id)
        .with_for_update()
    ).scalar_one_or_none()

    if g is None:
        if has_idem_table and won_lock:
            _mark_failed_external(client_key, execution_token, "ENINV no encontrada", now)
        raise HTTPException(404, "Recepcion no encontrada")

    # Verificacion de re-ejecucion sin idempotencia
    if g.stock_actualizado and not has_idem_table:
        raise HTTPException(
            400,
            "Esta recepcion ya fue confirmada (FISICA). "
            "Incluye idempotency_key para reintentar de forma segura."
        )

    warehouse_id = g.warehouse_id
    if not warehouse_id:
        if has_idem_table and won_lock:
            _mark_failed_external(client_key, execution_token, "Sin bodega configurada", now)
        raise HTTPException(400, "Debe seleccionar una bodega antes de confirmar")

    # â”€â”€â”€ PROCESAR LINEAS DEL JSON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    updated_products = []
    sku_increments: dict = {}  # {sku_id: qty}

    for prod in (g.productos or []):
        sku_id       = prod.get("sku_id")
        qty_esperada = int(prod.get("qty_esperada", prod.get("qty", 0)))
        qty_recibida = int(prod.get("qty_recibida", prod.get("qty", 0)))

        if receipt_type == "FISICA" and sku_id and qty_recibida > 0:
            sku_increments[sku_id] = sku_increments.get(sku_id, 0) + qty_recibida
            prod["estado"] = "RECIBIDO"
        elif receipt_type == "LOGISTICA":
            # LOGISTICA: solo registra el evento, no modifica cantidades de inventario
            prod["estado"] = "EN_TRANSITO_INTERMEDIO"

        updated_products.append(prod)

    # â”€â”€â”€ ACTUALIZAR INVENTARIO (solo FISICA) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    inv_op = None
    if receipt_type == "FISICA" and sku_increments:
        inv_op = InventoryOperation(
            dest_warehouse_id     = warehouse_id,
            operation_type        = "RECEIPT",
            status                = "DONE",
            source_document_type  = "ENINV",
            source_document_id    = g.id,
            source_document_numero= g.numero,
        )
        db.add(inv_op)
        db.flush()  # Obtener ID sin commit

        for sku_id, qty in sku_increments.items():
            # SELECT FOR UPDATE en InventoryLevel para prevenir race en actualizacion
            level = db.execute(
                select(InventoryLevel)
                .where(
                    InventoryLevel.sku_id      == sku_id,
                    InventoryLevel.warehouse_id == warehouse_id,
                )
                .with_for_update()
            ).scalar_one_or_none()

            if level:
                level.quantity += qty
            else:
                level = InventoryLevel(
                    sku_id=sku_id, warehouse_id=warehouse_id, quantity=qty
                )
                db.add(level)

            # Clave de idempotencia del movimiento (unica por operacion+SKU+destino)
            mv_key = hashlib.sha256(
                f"{inv_op.id}:{sku_id}:IN:NEBULAE:{warehouse_id}".encode()
            ).hexdigest()

            db.add(InventoryMovement(
                operation_id    = inv_op.id,
                sku_id          = sku_id,
                quantity        = qty,
                direction       = "IN",
                owner           = "NEBULAE",
                idempotency_key = mv_key,
            ))

    # â”€â”€â”€ ACTUALIZAR RECEPCION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    g.productos         = updated_products
    g.receipt_type      = receipt_type
    g.confirmed_by      = user_label
    g.confirmed_at      = now
    g.updated_at        = now
    g.idempotency_key   = client_key

    if receipt_type == "FISICA":
        g.stock_actualizado = True
        g.estado            = "COMPLETADA"
    else:
        # LOGISTICA: NO marca stock_actualizado, NO pone COMPLETADA
        g.stock_actualizado = False
        g.estado            = "COMPLETADA_LOGISTICA"

    # â”€â”€â”€ ESTADO DEL PEC â€” CALCULO ACUMULADO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # El estado no puede derivarse solo de g.productos de esta recepcion.
    # Debe considerar TODAS las recepciones FISICAS confirmadas de la PEC.
    pec_estado_nuevo = None
    p = None

    if g.pec_id and receipt_type == "FISICA":
        p = db.query(PurchaseOrderFull).filter(
            PurchaseOrderFull.id == g.pec_id
        ).with_for_update().first()

        if p:
            # Cantidad total ordenada en la PEC (JSON de productos del PEC)
            qty_total_ordenada: dict = {}  # {sku_id: qty}
            for prod in (p.productos or []):
                sid = prod.get("sku_id")
                if sid:
                    qty_total_ordenada[sid] = (
                        qty_total_ordenada.get(sid, 0)
                        + int(prod.get("qty", prod.get("quantity", 0)))
                    )

            # Cantidad ya recibida en TODAS las recepciones FISICAS confirmadas
            # (incluyendo la actual, que aun no se comiteo pero ya tiene sku_increments)
            otras_recepciones = db.query(GoodsReceipt).filter(
                GoodsReceipt.pec_id == g.pec_id,
                GoodsReceipt.stock_actualizado == True,
                GoodsReceipt.id != g.id,  # excluir la actual
            ).all()

            qty_acumulada: dict = {}  # {sku_id: qty}
            for otra in otras_recepciones:
                for prod in (otra.productos or []):
                    sid = prod.get("sku_id")
                    if sid:
                        qty_acumulada[sid] = (
                            qty_acumulada.get(sid, 0)
                            + int(prod.get("qty_recibida", prod.get("qty", 0)))
                        )

            # Sumar la recepcion actual
            for sku_id, qty in sku_increments.items():
                qty_acumulada[sku_id] = qty_acumulada.get(sku_id, 0) + qty

            # Determinar si todo fue cubierto
            total_pendiente = 0
            for sku_id, qty_ord in qty_total_ordenada.items():
                recibido = qty_acumulada.get(sku_id, 0)
                if recibido < qty_ord:
                    total_pendiente += (qty_ord - recibido)

            if total_pendiente > 0:
                pec_estado_nuevo = "PARCIALMENTE_RECIBIDA"
            else:
                pec_estado_nuevo = "RECIBIDA"

            p.estado     = pec_estado_nuevo
            p.updated_at = now

    # â”€â”€â”€ AUDITORIA â€” DENTRO DE LA TRANSACCION PRINCIPAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    db.add(ActivityLog(
        entity_type = "ENINV",
        entity_id   = g.id,
        entity_numero = g.numero,
        action      = "STOCK_ACTUALIZADO" if receipt_type == "FISICA" else "EVENTO_LOGISTICO",
        description = (
            f"Recepcion {receipt_type} confirmada. "
            + (f"{sum(sku_increments.values())} uds incrementadas en bodega {g.warehouse_name}."
               if receipt_type == "FISICA" else "Llegada intermedia registrada.")
        ),
        old_estado  = "BORRADOR",
        new_estado  = g.estado,
        user_name   = user_label,
        extra_data  = {
            "receipt_type": receipt_type,
            "sku_increments": sku_increments,
        },
    ))

    if p and pec_estado_nuevo:
        db.add(ActivityLog(
            entity_type   = "PEC",
            entity_id     = g.pec_id,
            entity_numero = g.pec_numero or "",
            action        = "RECEPCION_CONFIRMADA",
            description   = f"ENINV {g.numero} confirmada. Estado derivado: {pec_estado_nuevo}.",
            new_estado    = pec_estado_nuevo,
            user_name     = user_label,
        ))

    # â”€â”€â”€ PREPARAR RESPUESTA JSON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    response_data = _gr_dict(g)

    # â”€â”€â”€ ACTUALIZAR IDEMPOTENCIA A DONE (dentro de la transaccion) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if has_idem_table and won_lock:
        db.execute(_text(
            "UPDATE idempotency_requests "
            "SET status='DONE', response_body=:resp::jsonb, completed_at=:now "
            "WHERE operation_type='CONFIRMAR_RECEPCION' AND operation_key=:k "
            "  AND execution_token=:token AND status='PROCESSING'"
        ), {
            "resp": _json.dumps(response_data, default=str),
            "now": now, "k": client_key, "token": execution_token,
        })

    # â”€â”€â”€ UNICO COMMIT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        if has_idem_table and won_lock:
            _mark_failed_external(client_key, execution_token, str(exc), now)
        raise HTTPException(500, f"Error al confirmar recepcion: {exc}")

    return {"status": "success", "data": response_data}


def _mark_failed_external(op_key: str, exec_token: str, error: str, now: datetime.datetime):
    """
    Registra FAILED en una sesion independiente para que persista
    incluso si la transaccion principal hizo rollback.
    Solo actualiza si el execution_token coincide y el estado sigue en PROCESSING.
    Nunca sobreescribe el DONE de otra ejecucion que termino exitosamente.
    """
    try:
        from sqlalchemy import text as _text
        from app.db.database import SessionLocal
        import json as _json
        with SessionLocal() as _s:
            _s.execute(_text(
                "UPDATE idempotency_requests "
                "SET status='FAILED', error_detail=:err, completed_at=:now "
                "WHERE operation_type='CONFIRMAR_RECEPCION' "
                "  AND operation_key=:k "
                "  AND execution_token=:token "
                "  AND status='PROCESSING'"
                # Condicion critica: solo actualiza si execution_token coincide
                # y el estado sigue siendo PROCESSING. Si otra ejecucion ya puso
                # DONE, esta condicion falla y el DONE se preserva.
            ), {"k": op_key, "token": exec_token, "err": error[:2000], "now": now})
            _s.commit()
    except Exception:
        pass  # El FAILED es best-effort; la operacion principal ya revirtio.


