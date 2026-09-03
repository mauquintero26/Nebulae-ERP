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
def crear_recepcion_desde_pec(pec_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    """Create a GoodsReceipt (ENINV) from a PEC"""
    p = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec_id).first()
    if not p:
        raise HTTPException(404, "Pedido de compra no encontrado")

    eninv_numero = _gen_numero(db, "ENINV-", "seq_eninv")

    # Get warehouse info
    wh = None
    wh_name = p.supplier_name or "Bodega Principal"
    if body.get("warehouse_id") or p.warehouse_id:
        wid = body.get("warehouse_id") or p.warehouse_id
        wh = db.query(Warehouse).filter(Warehouse.id == wid).first()
        if wh:
            wh_name = wh.name

    # Copy products from PEC with qty_esperada = qty from PEC, qty_recibida = 0
    productos_recepcion = []
    for prod in (p.productos or []):
        productos_recepcion.append({
            **prod,
            "qty_esperada": prod.get("qty", prod.get("quantity", 0)),
            "qty_recibida": 0,
            "paquetes": 0,
            "estado": "PENDIENTE",
        })

    gr = GoodsReceipt(
        numero=eninv_numero,
        pec_id=p.id,
        pec_numero=p.numero,
        supplier_id=p.supplier_id,
        supplier_name=p.supplier_name,
        warehouse_id=body.get("warehouse_id") or p.warehouse_id,
        warehouse_name=wh_name,
        carrier=p.carrier,
        tracking_number=p.tracking_number,
        operacion_tipo="RECEPCION",
        estado="BORRADOR",
        notas=body.get("notas"),
        productos=productos_recepcion,
        created_by=body.get("created_by"),
    )
    db.add(gr)
    db.commit()
    db.refresh(gr)

    _log(db, "ENINV", gr.id, gr.numero, "CREATED",
         f"Recepcion {gr.numero} creada desde {p.numero}",
         new_estado="BORRADOR", user_name=body.get("created_by"))
    _log(db, "PEC", p.id, p.numero, "RECEPCION_CREATED",
         f"Recepcion {gr.numero} iniciada",
         user_name=body.get("created_by"))

    return {"status": "success", "data": _gr_dict(gr)}


# ─── RECEPCIONES (ENINV) ─────────────────────────────────────────────────────

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
    body: dict,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """
    Confirma una recepcion de mercancia (Fase 1A — sobre JSON existente).

    Correcciones aplicadas (v2):
    - require_roles usa normalize_role() — acepta Admin, Vendedor, ERP, etc.
    - request_hash: mismo operation_key con payload distinto → 409 Conflict.
    - Auditoría DENTRO de la transacción principal (no en try/except separado).
      Si el log de auditoría falla, toda la operación revierte — el stock no
      queda modificado sin trazabilidad.
    - FAILED se registra en sesión separada para persistir aunque la transacción
      principal haga rollback.
    - Un único db.commit() al final.
    """
    import hashlib, json as _json
    from sqlalchemy import text as _text
    from app.db.database import SessionLocal

    g = db.query(GoodsReceipt).filter(GoodsReceipt.id == eninv_id).first()
    if not g:
        raise HTTPException(404, "Recepcion no encontrada")

    now = datetime.datetime.utcnow()

    # ─── IDEMPOTENCIA ─────────────────────────────────────────────────────────
    # Calcular hash del payload para detectar reintentos con body distinto
    body_for_hash = {k: v for k, v in body.items() if k != "idempotency_key"}
    req_hash = hashlib.sha256(
        _json.dumps(body_for_hash, sort_keys=True, default=str).encode()
    ).hexdigest()

    client_key = body.get("idempotency_key")
    has_idem_table = False
    idem_id = None        # ID del registro en idempotency_requests
    idem_is_new = False   # True si este request creó el registro

    try:
        result = db.execute(_text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_name='idempotency_requests'"
        )).scalar()
        has_idem_table = result > 0
    except Exception:
        has_idem_table = False

    if has_idem_table and client_key:
        row = db.execute(_text(
            "SELECT id, status, request_hash, response_body "
            "FROM idempotency_requests "
            "WHERE operation_type='CONFIRMAR_RECEPCION' AND operation_key=:k"
        ), {"k": client_key}).fetchone()

        if row:
            if row.status == "DONE":
                if row.request_hash == req_hash:
                    # Mismo payload — replay idempotente
                    return {"status": "success", "data": row.response_body,
                            "idempotent_replay": True}
                else:
                    # Payload distinto — conflicto
                    raise HTTPException(
                        409,
                        "La clave de idempotencia ya fue usada con un payload diferente. "
                        "Usa una nueva clave para una operación distinta."
                    )
            elif row.status == "PROCESSING":
                raise HTTPException(409, "Operacion en proceso. Reintenta en unos segundos.")
            elif row.status == "FAILED":
                if row.request_hash != req_hash:
                    raise HTTPException(
                        409,
                        "La clave de idempotencia ya fue usada (FAILED) con un payload diferente."
                    )
                # Mismo payload, operación fallida → permitir reintento: actualizar a PROCESSING
                db.execute(_text(
                    "UPDATE idempotency_requests SET status='PROCESSING', created_at=:now "
                    "WHERE operation_type='CONFIRMAR_RECEPCION' AND operation_key=:k"
                ), {"now": now, "k": client_key})
                idem_id = row.id
                db.flush()
        else:
            # Nueva operación — registrar PROCESSING
            db.execute(_text(
                "INSERT INTO idempotency_requests "
                "(operation_type, operation_key, request_hash, entity_type, entity_id, "
                " user_id, status, request_body, created_at) "
                "VALUES ('CONFIRMAR_RECEPCION', :k, :h, 'ENINV', :eid, :uid, "
                "        'PROCESSING', :body, :now)"
            ), {"k": client_key, "h": req_hash, "eid": eninv_id,
                "uid": user.id, "body": str(body), "now": now})
            db.flush()
            idem_id = db.execute(_text(
                "SELECT id FROM idempotency_requests "
                "WHERE operation_type='CONFIRMAR_RECEPCION' AND operation_key=:k"
            ), {"k": client_key}).scalar()
            idem_is_new = True

    elif g.stock_actualizado and not client_key:
        raise HTTPException(
            400,
            "Esta recepcion ya fue confirmada. "
            "Incluye 'idempotency_key' en el body para reintentar de forma segura."
        )

    warehouse_id = g.warehouse_id
    if not warehouse_id:
        raise HTTPException(400, "Debe seleccionar una bodega antes de confirmar")

    receipt_type = body.get("receipt_type", "FISICA")
    if receipt_type not in ("FISICA", "LOGISTICA"):
        raise HTTPException(422, "receipt_type debe ser FISICA o LOGISTICA")

    # ─── PROCESAR LÍNEAS DEL JSON ─────────────────────────────────────────────
    updated_products = []
    total_esperado  = 0
    total_recibido  = 0
    total_pendiente = 0
    sku_increments: dict = {}

    for prod in (g.productos or []):
        sku_id       = prod.get("sku_id")
        qty_esperada = int(prod.get("qty_esperada", prod.get("qty", 0)))
        qty_recibida = int(prod.get("qty_recibida", prod.get("qty", 0)))
        total_esperado += qty_esperada
        total_recibido += qty_recibida
        if qty_esperada > qty_recibida:
            total_pendiente += (qty_esperada - qty_recibida)

        if sku_id and qty_recibida > 0 and receipt_type == "FISICA":
            sku_increments[sku_id] = sku_increments.get(sku_id, 0) + qty_recibida
            prod["estado"] = "RECIBIDO"
        elif receipt_type == "LOGISTICA":
            prod["estado"] = "EN_TRANSITO_INTERMEDIO"
        updated_products.append(prod)

    # ─── ACTUALIZAR INVENTARIO (solo FISICA) ──────────────────────────────────
    inv_op = None
    if receipt_type == "FISICA" and sku_increments:
        _has_src = hasattr(InventoryOperation, "source_document_type")
        if _has_src:
            inv_op = InventoryOperation(
                dest_warehouse_id=warehouse_id,
                operation_type="RECEIPT",
                status="DONE",
                source_document_type="ENINV",
                source_document_id=g.id,
            )
        else:
            inv_op = InventoryOperation(
                dest_warehouse_id=warehouse_id,
                operation_type="RECEIPT",
                status="DONE",
            )
        db.add(inv_op)
        db.flush()

        for sku_id, qty in sku_increments.items():
            level = db.query(InventoryLevel).filter(
                InventoryLevel.sku_id == sku_id,
                InventoryLevel.warehouse_id == warehouse_id,
            ).first()
            if level:
                level.quantity += qty
            else:
                db.add(InventoryLevel(sku_id=sku_id, warehouse_id=warehouse_id, quantity=qty))
            db.add(InventoryMovement(operation_id=inv_op.id, sku_id=sku_id, quantity=qty))

    # ─── ACTUALIZAR RECEPCIÓN ─────────────────────────────────────────────────
    g.productos         = updated_products
    g.stock_actualizado = (receipt_type == "FISICA")
    g.estado            = "COMPLETADA" if receipt_type == "FISICA" else "COMPLETADA_LOGISTICA"
    g.updated_at        = now
    try:
        g.receipt_type    = receipt_type
        g.confirmed_by    = user.username if hasattr(user, "username") else str(user.id)
        g.confirmed_at    = now
        g.idempotency_key = client_key or str(uuid.uuid4())
    except AttributeError:
        pass  # Columnas de Fase 1A aún no migradas

    # ─── ESTADO DEL PEC ───────────────────────────────────────────────────────
    pec_estado_nuevo = None
    p = None
    if g.pec_id:
        p = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == g.pec_id).first()
        if p:
            pec_estado_nuevo = "PARCIALMENTE_RECIBIDA" if total_pendiente > 0 else "RECIBIDO"
            p.estado     = pec_estado_nuevo
            p.updated_at = now

    # ─── AUDITORÍA — DENTRO DE LA TRANSACCIÓN PRINCIPAL ──────────────────────
    # Para operaciones críticas (confirmación de stock), el log de auditoría
    # es parte de la transacción. Si el log falla, el stock NO queda modificado.
    user_label = body.get("user_name") or (
        user.username if hasattr(user, "username") else str(user.id)
    )
    db.add(ActivityLog(
        entity_type="ENINV",
        entity_id=g.id,
        entity_numero=g.numero,
        action="STOCK_ACTUALIZADO",
        description=(
            f"Recepcion {receipt_type} confirmada en bodega {g.warehouse_name}. "
            f"{total_recibido} uds recibidas, {total_pendiente} pendientes."
        ),
        old_estado="BORRADOR",
        new_estado=g.estado,
        user_name=user_label,
        extra_data={
            "receipt_type": receipt_type,
            "sku_increments": sku_increments,
            "total_recibido": total_recibido,
            "total_pendiente": total_pendiente,
        },
    ))

    if p and pec_estado_nuevo:
        db.add(ActivityLog(
            entity_type="PEC",
            entity_id=g.pec_id,
            entity_numero=g.pec_numero or "",
            action="RECEPCION_CONFIRMADA",
            description=(
                f"Recepcion {g.numero} confirmada. "
                f"Estado derivado: {pec_estado_nuevo}."
            ),
            new_estado=pec_estado_nuevo,
            user_name=user_label,
        ))

    # ─── ACTUALIZAR IDEMPOTENCIA A DONE ───────────────────────────────────────
    response_data = _gr_dict(g)
    if has_idem_table and client_key:
        db.execute(_text(
            "UPDATE idempotency_requests "
            "SET status='DONE', response_body=:resp, completed_at=:now "
            "WHERE operation_type='CONFIRMAR_RECEPCION' AND operation_key=:k"
        ), {"resp": str(response_data), "now": now, "k": client_key})

    # ─── ÚNICO COMMIT ─────────────────────────────────────────────────────────
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        # Registrar FAILED en sesión independiente para que persista
        # aunque el rollback haya deshecho el registro PROCESSING
        if has_idem_table and client_key:
            try:
                with SessionLocal() as _s:
                    _s.execute(_text(
                        "INSERT INTO idempotency_requests "
                        "(operation_type, operation_key, request_hash, entity_type, "
                        " entity_id, user_id, status, error_detail, created_at, completed_at) "
                        "VALUES ('CONFIRMAR_RECEPCION', :k, :h, 'ENINV', :eid, :uid, "
                        "        'FAILED', :err, :now, :now) "
                        "ON CONFLICT (operation_type, operation_key) DO UPDATE "
                        "SET status='FAILED', error_detail=:err, completed_at=:now"
                    ), {"k": client_key, "h": req_hash, "eid": eninv_id,
                        "uid": user.id, "err": str(exc), "now": now})
                    _s.commit()
            except Exception:
                pass  # Si el registro de FAILED falla, al menos la operación ya revirtió
        raise HTTPException(500, f"Error al confirmar recepcion: {exc}")

    return {"status": "success", "data": response_data}


# ─── TRANSITO ────────────────────────────────────────────────────────────────

@router.get("/transito")
def list_transito(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """List all PEC orders currently in transit with timer info"""
    items = db.query(PurchaseOrderFull).filter(
        PurchaseOrderFull.estado.in_(["ENVIADO", "PENDIENTE_ENTREGA", "EN_TRANSITO"])
    ).order_by(PurchaseOrderFull.fecha_entrega_estimada).all()
    return {
        "status": "success",
        "data": [_pec_dict(p) for p in items],
        "overdue_count": sum(1 for p in items if _is_overdue(p.fecha_entrega_estimada)),
    }


# ─── STATS ───────────────────────────────────────────────────────────────────

@router.get("/stats")
def compras_stats(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS, *ROLE_FINANZAS)),
        db: Session = Depends(get_db)):
    pec_total = db.query(func.count(PurchaseOrderFull.id)).scalar()
    eninv_total = db.query(func.count(GoodsReceipt.id)).scalar()
    en_transito = db.query(func.count(PurchaseOrderFull.id)).filter(
        PurchaseOrderFull.estado.in_(["ENVIADO", "PENDIENTE_ENTREGA", "EN_TRANSITO"])
    ).scalar()
    pec_monto = db.query(func.sum(PurchaseOrderFull.total_cop)).filter(
        PurchaseOrderFull.estado != "CANCELADO"
    ).scalar() or 0

    return {
        "status": "success",
        "data": {
            "pec_total": pec_total,
            "eninv_total": eninv_total,
            "en_transito": en_transito,
            "pec_monto_total": float(pec_monto),
        }
    }


# ─── LISTA DE PRODUCTOS POR COMPRAR ─────────────────────────────────────────

def _ensure_lista_table(db: Session):
    """Auto-create lista_compras_items table if not exists"""
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS lista_compras_items (
            id             SERIAL PRIMARY KEY,
            pven_id        INTEGER,
            pven_numero    VARCHAR(30),
            producto       VARCHAR(500) NOT NULL,
            cantidad       INTEGER DEFAULT 1,
            unidad         VARCHAR(50),
            notas          TEXT,
            proveedor_id   INTEGER,
            proveedor      VARCHAR(255),
            estado         VARCHAR(30) DEFAULT 'PENDIENTE',
            pec_id         INTEGER,
            pec_numero     VARCHAR(30),
            fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
            updated_at     TIMESTAMPTZ DEFAULT NOW(),
            created_by     VARCHAR(100)
        )
    """))
    db.commit()


def _lista_item_dict(row) -> dict:
    return {
        "id": row.id,
        "pven_id": row.pven_id,
        "pven_numero": row.pven_numero,
        "producto": row.producto,
        "cantidad": row.cantidad,
        "unidad": row.unidad,
        "notas": row.notas,
        "proveedor_id": row.proveedor_id,
        "proveedor": row.proveedor,
        "estado": row.estado,
        "pec_id": row.pec_id,
        "pec_numero": row.pec_numero,
        "fecha_creacion": row.fecha_creacion.isoformat() if row.fecha_creacion else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "created_by": row.created_by,
    }


@router.get("/lista-compras")
def list_lista_compras(
    estado: Optional[str] = None,
    proveedor: Optional[str] = None,
    search: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    pven_id: Optional[int] = None,
    limit: int = Query(200, le=500),
    offset: int = 0,
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    _ensure_lista_table(db)
    filters = []
    if estado:
        filters.append(f"estado = '{estado}'")
    if proveedor:
        filters.append(f"proveedor ILIKE '%{proveedor}%'")
    if search:
        filters.append(f"(producto ILIKE '%{search}%' OR pven_numero ILIKE '%{search}%' OR notas ILIKE '%{search}%')")
    if fecha_desde:
        filters.append(f"fecha_creacion >= '{fecha_desde}'")
    if fecha_hasta:
        filters.append(f"fecha_creacion <= '{fecha_hasta} 23:59:59'")
    if pven_id:
        filters.append(f"pven_id = {pven_id}")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    rows = db.execute(text(f"""
        SELECT * FROM lista_compras_items {where}
        ORDER BY fecha_creacion DESC
        LIMIT {limit} OFFSET {offset}
    """)).fetchall()
    total_row = db.execute(text(f"SELECT COUNT(*) FROM lista_compras_items {where}")).scalar()
    items = [_lista_item_dict(r) for r in rows]
    return {"status": "success", "total": total_row, "data": items}


@router.post("/lista-compras", status_code=201)
def add_to_lista_compras(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    _ensure_lista_table(db)
    productos = body.get("productos", [])
    pven_id = body.get("pven_id")
    pven_numero = body.get("pven_numero")
    created_by = body.get("created_by")

    if not productos:
        # Single item mode
        productos = [{"producto": body.get("producto", ""), "cantidad": body.get("cantidad", 1), "unidad": body.get("unidad"), "notas": body.get("notas")}]

    created_ids = []
    for prod in productos:
        nombre = prod.get("producto_nombre") or prod.get("descripcion") or prod.get("producto") or "Sin nombre"
        row = db.execute(text("""
            INSERT INTO lista_compras_items
              (pven_id, pven_numero, producto, cantidad, unidad, notas, proveedor, estado, created_by)
            VALUES
              (:pven_id, :pven_numero, :producto, :cantidad, :unidad, :notas, :proveedor, 'PENDIENTE', :created_by)
            RETURNING id
        """), {
            "pven_id": pven_id,
            "pven_numero": pven_numero,
            "producto": nombre,
            "cantidad": int(prod.get("cantidad", prod.get("qty", 1))),
            "unidad": prod.get("unidad"),
            "notas": body.get("notas") or prod.get("notas"),
            "proveedor": body.get("proveedor"),
            "created_by": created_by,
        })
        db.commit()
        created_ids.append(row.scalar())

    return {"status": "success", "message": f"{len(created_ids)} producto(s) agregado(s) a la lista", "ids": created_ids}


@router.patch("/lista-compras/{item_id}")
def update_lista_item(item_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    _ensure_lista_table(db)
    sets = []
    params: dict = {"item_id": item_id}
    for field in ["estado", "proveedor", "proveedor_id", "pec_id", "pec_numero", "notas", "cantidad", "unidad"]:
        if field in body:
            sets.append(f"{field} = :{field}")
            params[field] = body[field]
    if not sets:
        raise HTTPException(400, "No fields to update")
    sets.append("updated_at = NOW()")
    db.execute(text(f"UPDATE lista_compras_items SET {', '.join(sets)} WHERE id = :item_id"), params)
    db.commit()
    row = db.execute(text("SELECT * FROM lista_compras_items WHERE id = :id"), {"id": item_id}).fetchone()
    if not row:
        raise HTTPException(404, "Item no encontrado")
    return {"status": "success", "data": _lista_item_dict(row)}


@router.delete("/lista-compras/{item_id}")
def delete_lista_item(item_id: int, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    _ensure_lista_table(db)
    db.execute(text("DELETE FROM lista_compras_items WHERE id = :id"), {"id": item_id})
    db.commit()
    return {"status": "success", "message": "Item eliminado"}


@router.get("/lista-compras/stats")
def lista_compras_stats(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS, *ROLE_FINANZAS)),
        db: Session = Depends(get_db)):
    _ensure_lista_table(db)
    total = db.execute(text("SELECT COUNT(*) FROM lista_compras_items")).scalar() or 0
    pendientes = db.execute(text("SELECT COUNT(*) FROM lista_compras_items WHERE estado = 'PENDIENTE'")).scalar() or 0
    en_pedido = db.execute(text("SELECT COUNT(*) FROM lista_compras_items WHERE estado = 'EN_PEDIDO'")).scalar() or 0
    recibidos = db.execute(text("SELECT COUNT(*) FROM lista_compras_items WHERE estado = 'RECIBIDO'")).scalar() or 0
    proveedores_rows = db.execute(text("""
        SELECT proveedor, COUNT(*) as cnt FROM lista_compras_items
        WHERE estado = 'PENDIENTE' AND proveedor IS NOT NULL AND proveedor != ''
        GROUP BY proveedor ORDER BY cnt DESC LIMIT 10
    """)).fetchall()
    return {
        "status": "success",
        "data": {
            "total": total,
            "pendientes": pendientes,
            "en_pedido": en_pedido,
            "recibidos": recibidos,
            "por_proveedor": [{"proveedor": r.proveedor, "count": r.cnt} for r in proveedores_rows],
        }
    }
