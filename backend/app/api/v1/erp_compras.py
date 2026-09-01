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
from app.models.inventory import InventoryLevel, Warehouse
import datetime

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
def search_suppliers(q: str = "", db: Session = Depends(get_db)):
    like = f"%{q}%"
    items = db.query(Supplier).filter(
        Supplier.is_active == True,
        Supplier.name.ilike(like) | Supplier.reference.ilike(like)
    ).limit(10).all()
    return {"status": "success", "data": [_supplier_dict(s) for s in items]}


@router.post("/proveedores", status_code=201)
def create_supplier(body: dict, db: Session = Depends(get_db)):
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
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
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
def update_supplier(supplier_id: int, body: dict, db: Session = Depends(get_db)):
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
def create_pec(body: dict, db: Session = Depends(get_db)):
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
def get_pec(pec_id: int, db: Session = Depends(get_db)):
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
def update_pec(pec_id: int, body: dict, db: Session = Depends(get_db)):
    p = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec_id).first()
    if not p:
        raise HTTPException(404, "Pedido de compra no encontrado")
    old_estado = p.estado
    allowed = ["estado","supplier_id","supplier_name","supplier_ref","modalidad_pago",
               "metodo_pago","warehouse_id","carrier","tracking_number","tracking_stages",
               "fecha_entrega_estimada","fecha_alerta","subtotal_cop","total_cop",
               "notas","productos","ven_id","ven_numero"]
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
def update_tracking(pec_id: int, body: dict, db: Session = Depends(get_db)):
    """Update a tracking stage status"""
    p = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec_id).first()
    if not p:
        raise HTTPException(404, "Pedido de compra no encontrado")

    stage_name = body.get("stage")
    new_status = body.get("status")  # PENDIENTE, EN_PROCESO, COMPLETADO
    stages = p.tracking_stages or []

    for i, s in enumerate(stages):
        if s["stage"] == stage_name:
            stages[i]["status"] = new_status
            stages[i]["timestamp"] = datetime.datetime.utcnow().isoformat()
            stages[i]["notes"] = body.get("notes")
            break

    p.tracking_stages = stages
    p.updated_at = datetime.datetime.utcnow()

    # If last stage ENTREGADO, update PEC estado
    if stage_name == "ENTREGADO" and new_status == "COMPLETADO":
        p.estado = "RECIBIDO"

    db.commit()
    db.refresh(p)
    _log(db, "PEC", p.id, p.numero, "TRACKING_UPDATED",
         f"Etapa {stage_name} -> {new_status}",
         user_name=body.get("user_name"))
    return {"status": "success", "data": _pec_dict(p)}


@router.post("/pedidos/{pec_id}/recepcionar")
def crear_recepcion_desde_pec(pec_id: int, body: dict, db: Session = Depends(get_db)):
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
def create_recepcion(body: dict, db: Session = Depends(get_db)):
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
def get_recepcion(eninv_id: int, db: Session = Depends(get_db)):
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
def update_recepcion(eninv_id: int, body: dict, db: Session = Depends(get_db)):
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
def confirmar_recepcion(eninv_id: int, body: dict, db: Session = Depends(get_db)):
    """Confirm receipt -> update stock in warehouse"""
    g = db.query(GoodsReceipt).filter(GoodsReceipt.id == eninv_id).first()
    if not g:
        raise HTTPException(404, "Recepcion no encontrada")
    if g.stock_actualizado:
        raise HTTPException(400, "Stock ya fue actualizado para esta recepcion")

    warehouse_id = g.warehouse_id
    if not warehouse_id:
        raise HTTPException(400, "Debe seleccionar una bodega antes de confirmar")

    updated_products = []
    for prod in (g.productos or []):
        sku_id = prod.get("sku_id")
        qty_recibida = int(prod.get("qty_recibida", prod.get("qty", 0)))
        if sku_id and qty_recibida > 0:
            # Update or create inventory level
            level = db.query(InventoryLevel).filter(
                InventoryLevel.sku_id == sku_id,
                InventoryLevel.warehouse_id == warehouse_id
            ).first()
            if level:
                level.quantity += qty_recibida
            else:
                level = InventoryLevel(
                    sku_id=sku_id,
                    warehouse_id=warehouse_id,
                    quantity=qty_recibida
                )
                db.add(level)
            prod["estado"] = "RECIBIDO"
        updated_products.append(prod)

    g.productos = updated_products
    g.stock_actualizado = True
    g.estado = "COMPLETADA"
    g.updated_at = datetime.datetime.utcnow()
    db.commit()

    # Update PEC estado if all received
    if g.pec_id:
        p = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == g.pec_id).first()
        if p:
            p.estado = "RECIBIDO"
            p.updated_at = datetime.datetime.utcnow()
            db.commit()
            _log(db, "PEC", p.id, p.numero, "RECIBIDO",
                 f"Mercancia recibida via {g.numero}",
                 old_estado="PENDIENTE_ENTREGA", new_estado="RECIBIDO",
                 user_name=body.get("user_name"))

    _log(db, "ENINV", g.id, g.numero, "STOCK_ACTUALIZADO",
         f"Stock actualizado en bodega {g.warehouse_name}. {len(updated_products)} productos procesados.",
         old_estado="BORRADOR", new_estado="COMPLETADA",
         user_name=body.get("user_name"))

    return {"status": "success", "data": _gr_dict(g)}


# ─── TRANSITO ────────────────────────────────────────────────────────────────

@router.get("/transito")
def list_transito(db: Session = Depends(get_db)):
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
def compras_stats(db: Session = Depends(get_db)):
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
