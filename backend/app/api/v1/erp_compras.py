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
from app.models.fase1b import (
    GoodsReceiptLine, PurchaseOrderLine, InventoryOwnerBalance,
    GoodsReceiptLineAllocation, ProcurementAllocation
)
from app.models.fase2 import Shipment, ShipmentEvent
from app.models.fase3 import InventoryQuarantine
from decimal import Decimal
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
import logging
from app.api.v1.erp_logistica import (
    ALLOWED_TRANSITIONS_DIRECT,
    ALLOWED_TRANSITIONS_MIAMI,
    transition_shipment_to_recibido_barranquilla,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _next_seq(db: Session, seq_name: str) -> int:
    r = db.execute(text(f"SELECT nextval('{seq_name}')")).scalar()
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
def create_pec(body: CrearPecBody, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    numero = _gen_numero(db, "PEC-", "seq_pec")
    days = body.dias_entrega
    entrega_est = datetime.datetime.utcnow() + datetime.timedelta(days=days)
    alerta = entrega_est
    tracking_stages = [
        {"stage": "PROVEEDOR_CASILLERO", "label": "Proveedor -> Casillero", "status": "PENDIENTE", "timestamp": None},
        {"stage": "CASILLERO_ADUANA",    "label": "Casillero -> Aduana",    "status": "PENDIENTE", "timestamp": None},
        {"stage": "ADUANA_BODEGA",       "label": "Aduana -> Bodega",       "status": "PENDIENTE", "timestamp": None},
        {"stage": "ENTREGADO",           "label": "Entregado en Bodega",    "status": "PENDIENTE", "timestamp": None},
    ]
    supplier_name = body.supplier_name or ""
    supplier_ref  = body.supplier_ref or ""
    if body.supplier_id:
        s = db.query(Supplier).filter(Supplier.id == body.supplier_id).first()
        if s:
            supplier_name = supplier_name or s.name
            supplier_ref  = supplier_ref or s.reference or ""
    productos_raw = [
        p.model_dump() if hasattr(p, "model_dump") else dict(p)
        for p in body.productos
    ] if body.productos else []
    pec = PurchaseOrderFull(
        numero=numero,
        supplier_id=body.supplier_id,
        supplier_name=supplier_name,
        supplier_ref=supplier_ref,
        ven_id=body.ven_id,
        ven_numero=body.ven_numero,
        modalidad_pago=body.modalidad_pago or "Contado",
        metodo_pago=body.metodo_pago,
        warehouse_id=body.warehouse_id,
        carrier=body.carrier,
        tracking_number=body.tracking_number,
        tracking_stages=tracking_stages,
        estado="BORRADOR",
        fecha_entrega_estimada=entrega_est,
        fecha_alerta=alerta,
        subtotal_cop=body.subtotal_cop,
        total_cop=body.total_cop,
        notas=body.notas,
        productos=productos_raw,
        created_by=body.created_by,
    )
    db.add(pec)
    db.flush()  # obtener pec.id sin commit

    # ─── CREAR PURCHASE_ORDER_LINES (Fase 1B) ─────────────────────────────────

    # Una fila por cada producto del payload. Permite distinguir dos lineas
    # del mismo SKU mediante su po_line_id independiente.
    for prod in productos_raw:
        sku_id_pol = prod.get("sku_id")
        qty_pol    = int(prod.get("qty", prod.get("quantity", 0)))
        if qty_pol > 0:
            db.add(PurchaseOrderLine(
                pec_id           = pec.id,
                sku_id           = sku_id_pol,
                description      = prod.get("nombre", prod.get("name", prod.get("product_name", ""))),
                quantity_ordered  = qty_pol,
                unit_cost_usd    = prod.get("precio_usd") or prod.get("cost_usd"),
                unit_cost_cop    = prod.get("precio_cop"),
                quantity_received = 0,
                source           = "NATIVE",
                migration_batch_id = None,
            ))
    db.commit()
    db.refresh(pec)
    if body.ven_id:
        ven = db.query(SaleOrder).filter(SaleOrder.id == body.ven_id).first()
        if ven:
            ven.pec_id = pec.id
            ven.pec_numero = pec.numero
            ven.estado = "EN_TRANSITO"
            ven.updated_at = datetime.datetime.utcnow()
            db.commit()
    _log(db, "PEC", pec.id, pec.numero, "CREATED",
         f"Pedido de compra {pec.numero} creado. Entrega estimada: {entrega_est.strftime('%d/%m/%Y')}",
         new_estado="BORRADOR", user_name=body.created_by)
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
    """

    Actualiza un pedido de compra.

    Bloqueo 2 — Normalizar caminos de edicion:

    - Si body trae 'productos':

        * Si la PEC NO tiene recepciones (BORRADOR/EMITIDO sin ENINV): sync PurchaseOrderLine.

        * Si la PEC YA tiene recepciones: 409 — cambios estructurales no permitidos.

    - El JSON p.productos se regenera desde PurchaseOrderLine despues del sync.

    - Otros campos (estado, carrier, notas, etc.) se actualizan libremente.

    """
    p = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec_id).first()
    if not p:
        raise HTTPException(404, "Pedido de compra no encontrado")
    old_estado = p.estado
    # Si el payload trae productos, aplicar logica normalizada
    if "productos" in body:
        # Verificar si ya tiene recepciones
        n_recepciones = db.execute(text(
            "SELECT COUNT(*) FROM goods_receipts WHERE pec_id = :pid"
        ), {"pid": pec_id}).scalar()
        if n_recepciones and int(n_recepciones) > 0:
            raise HTTPException(
                409,
                f"La PEC {p.numero} ya tiene {n_recepciones} recepcion(es) asociada(s). "
                "Los cambios estructurales en productos no estan permitidos cuando hay recepciones activas. "
                "Cancela las recepciones pendientes antes de modificar los productos."
            )
        nuevos_prods = body["productos"]  # lista de {sku_id, qty, nombre, ...}
        # Sincronizar PurchaseOrderLine: eliminar las anteriores y crear nuevas
        db.execute(text(
            "DELETE FROM purchase_order_lines WHERE pec_id = :pid"
        ), {"pid": pec_id})
        db.flush()
        for prod in nuevos_prods:
            sku_id_raw = prod.get("sku_id")
            qty        = int(prod.get("qty", prod.get("quantity", 0)))
            db.add(PurchaseOrderLine(
                pec_id           = pec_id,
                sku_id           = sku_id_raw,
                description      = prod.get("nombre", prod.get("name", "")),
                quantity_ordered  = qty,
                unit_cost_usd    = prod.get("cost_usd"),
                unit_cost_cop    = prod.get("cost_cop"),
                quantity_received = 0,
                source           = "NATIVE",
            ))
        # El JSON p.productos se actualiza con el payload como snapshot
        p.productos = nuevos_prods
    # Campos generales permitidos
    allowed_non_prod = ["estado","supplier_id","supplier_name","supplier_ref",
                        "modalidad_pago","metodo_pago","warehouse_id","carrier",
                        "tracking_number","tracking_stages","fecha_entrega_estimada",
                        "fecha_alerta","subtotal_cop","total_cop","notas",
                        "ven_id","ven_numero","tracking_history","tipo_envio",
                        "casillero","fecha_compra"]
    for k in allowed_non_prod:
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
def update_tracking(pec_id: int, body: ActualizarTrackingBody,
        user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    """Update a tracking stage status, tracking number, and append to tracking history.

    Frontend sends 'stage' and 'status' fields; ActualizarTrackingBody maps them via aliases.

    """
    p = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec_id).first()
    if not p:
        raise HTTPException(404, "Pedido de compra no encontrado")
    stage_name = body.stage_name  # aliased from 'stage'
    new_status = body.new_status  # aliased from 'status'
    tracking_num = body.tracking_number
    stages = list(p.tracking_stages or [])
    now = datetime.datetime.utcnow().isoformat()
    for i, s in enumerate(stages):
        if s["stage"] == stage_name:
            stages[i]["status"] = new_status
            stages[i]["timestamp"] = now
            stages[i]["notes"] = body.notes or s.get("notes")
            if tracking_num:
                stages[i]["tracking_number"] = tracking_num
                # Append to tracking history for this stage
                history = stages[i].get("tracking_history", [])
                history.append({
                    "numero": tracking_num,
                    "fecha": now,
                    "notas": body.notes,
                    "user": body.user_name,
                })
                stages[i]["tracking_history"] = history
            break
    p.tracking_stages = stages
    p.updated_at = datetime.datetime.utcnow()
    # Auto-update PEC estado based on tracking completions
    last_stage = stages[-1] if stages else {}
    if last_stage.get("status") == "COMPLETADO":
        old_e = p.estado
        p.estado = "RECIBIDO"
        if old_e != "RECIBIDO":
            _log(db, "PEC", p.id, p.numero, "ESTADO_CHANGED",
                 "Recibido en bodega — todos los stages completados",
                 old_estado=old_e, new_estado="RECIBIDO",
                 user_name=body.user_name)
    elif any(s.get("status") == "EN_PROCESO" for s in stages):
        if p.estado in ("BORRADOR", "EMITIDO"):
            p.estado = "EN_TRANSITO"
    db.commit()
    db.refresh(p)
    _log(db, "PEC", p.id, p.numero, "TRACKING_UPDATED",
         f"Etapa {stage_name} -> {new_status}" + (f" | Guia: {tracking_num}" if tracking_num else ""),
         user_name=body.user_name)
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
    # Calcular cantidades ya recibidas por PurchaseOrderLine (Bloqueo 3: por po_line_id, no por sku_id)
    # Esto es correcto cuando una PEC tiene dos lineas distintas con el mismo SKU.
    ya_recibidas_pol: dict = {}  # {po_line_id: qty_acumulada}
    if not body.force_full:
        _grl_recv = db.execute(text(
            "SELECT grl.po_line_id, COALESCE(SUM(grl.quantity_received), 0) as recv "
            "FROM goods_receipt_lines grl "
            "JOIN goods_receipts gr ON gr.id = grl.gr_id "
            "WHERE gr.pec_id = :pec AND gr.estado = 'COMPLETADA' "
            "  AND grl.po_line_id IS NOT NULL "
            "GROUP BY grl.po_line_id"
        ), {"pec": pec_id}).fetchall()
        ya_recibidas_pol = {r[0]: int(r[1] or 0) for r in _grl_recv}
    # Obtener purchase_order_lines de la PEC para enlace univoco (Fase 1B)
    # Construimos un mapa: sku_id -> [po_line_id, ...] para manejar duplicados
    po_lines_by_sku: dict = {}  # {sku_id: deque de po_line_id}
    from collections import deque as _deque
    _pol_rows = db.execute(text(
        "SELECT id, sku_id FROM purchase_order_lines WHERE pec_id = :pec ORDER BY id"
    ), {"pec": p.id}).fetchall()
    for _pol_id, _pol_sku in _pol_rows:
        po_lines_by_sku.setdefault(_pol_sku, _deque()).append(_pol_id)
    # Construir lista de productos PENDIENTES POR PurchaseOrderLine (Bloqueo 3)
    # Cada POL con saldo pendiente genera una GoodsReceiptLine en la recepcion.
    # Cuando una PEC tiene dos lineas del mismo SKU, cada POL se trata separadamente.
    productos_recepcion = []
    if _pol_rows:

        # ─── RUTA NORMALIZADA: PEC con PurchaseOrderLine ─────────────────────

        for _pol_id, _pol_sku in _pol_rows:
            # Encontrar datos del producto en el JSON de la PEC para metadata
            prod_data = next(
                (p2 for p2 in (p.productos or []) if p2.get("sku_id") == _pol_sku),
                {"sku_id": _pol_sku, "nombre": "", "qty": 0}
            )
            # Cantidad ordenada en esta linea especifica (desde purchase_order_lines)
            _pol_qty_ordered = db.execute(text(
                "SELECT quantity_ordered FROM purchase_order_lines WHERE id = :pid"
            ), {"pid": _pol_id}).scalar() or 0
            qty_total = int(_pol_qty_ordered)
            if body.force_full:
                qty_pendiente = qty_total
            else:
                qty_ya = ya_recibidas_pol.get(_pol_id, 0)
                qty_pendiente = max(0, qty_total - qty_ya)
            if qty_pendiente == 0:
                continue  # Esta linea ya fue completamente recibida
            productos_recepcion.append({
                **prod_data,
                "sku_id": _pol_sku,
                "qty_esperada": qty_pendiente,
                "qty_recibida": None,  # NULL = pendiente de registro por operador
                "paquetes": 0,
                "estado": "PENDIENTE",
                "_po_line_id": _pol_id,  # campo interno para GoodsReceiptLine
            })
    else:

        # ─── FALLBACK LEGACY: PEC sin PurchaseOrderLine ───────────────────────

        # Compatibilidad con PECs creadas antes de Fase 1B o creadas directamente en DB.
        # Calcular ya_recibidas por sku_id desde el JSON snapshot de recepciones confirmadas.
        ya_recibidas_sku: dict = {}  # {sku_id: qty_acumulada}
        if not body.force_full:
            _legacy_recv = db.execute(text(
                "SELECT grl.sku_id, COALESCE(SUM(grl.quantity_received), 0) as recv "
                "FROM goods_receipt_lines grl "
                "JOIN goods_receipts gr ON gr.id = grl.gr_id "
                "WHERE gr.pec_id = :pec AND gr.estado = 'COMPLETADA' "
                "GROUP BY grl.sku_id"
            ), {"pec": pec_id}).fetchall()
            ya_recibidas_sku = {r[0]: int(r[1] or 0) for r in _legacy_recv}
            if not ya_recibidas_sku:
                # Fallback-de-fallback: JSON snapshot de recepciones anteriores
                recepciones_conf = db.query(GoodsReceipt).filter(
                    GoodsReceipt.pec_id == pec_id,
                    GoodsReceipt.estado == 'COMPLETADA',
                ).all()
                for r_conf in recepciones_conf:
                    for prod in (r_conf.productos or []):
                        sid = prod.get("sku_id")
                        if sid:
                            ya_recibidas_sku[sid] = (
                                ya_recibidas_sku.get(sid, 0)
                                + int(prod.get("qty_recibida", prod.get("qty", 0)))
                            )
        for prod in (p.productos or []):
            qty_total = int(prod.get("qty", prod.get("quantity", 0)))
            sku_id_leg = prod.get("sku_id")
            if body.force_full:
                qty_pendiente = qty_total
            else:
                qty_ya = ya_recibidas_sku.get(sku_id_leg, 0) if sku_id_leg else 0
                qty_pendiente = max(0, qty_total - qty_ya)
            if qty_pendiente == 0:
                continue
            productos_recepcion.append({
                **prod,
                "qty_esperada": qty_pendiente,
                "qty_recibida": None,  # NULL = pendiente de registro
                "paquetes": 0,
                "estado": "PENDIENTE",
                "_po_line_id": None,  # no hay POL disponible (PEC legacy)
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
    db.flush()  # obtener gr.id sin commit

    # ─── CREAR GOODS_RECEIPT_LINES EN LA MISMA TRANSACCION (Fase 1B) ──────────

    # Cada linea del snapshot JSON tiene su GoodsReceiptLine correspondiente.
    # Si la PEC tiene purchase_order_lines, enlazamos por po_line_id (univoco).
    # Para SKUs duplicados usamos el campo "_po_line_id" embebido en el snapshot.
    for prod in productos_recepcion:
        po_line_id_link = prod.get("_po_line_id")  # puesto por el loop de abajo
        sku_id_line  = prod.get("sku_id")
        qty_esp_line = int(prod.get("qty_esperada", prod.get("qty", 0)))
        db.add(GoodsReceiptLine(
            gr_id               = gr.id,
            po_line_id          = po_line_id_link,
            sku_id              = sku_id_line,
            description         = prod.get("nombre", prod.get("name", prod.get("product_name", ""))),
            quantity_expected   = qty_esp_line,
            quantity_received   = None,      # NULL = pendiente de registro por operador
            quantity_rejected   = 0,
            quantity_quarantine = 0,
            receipt_type        = "FISICA",  # default; cambia al confirmar
            source              = "NATIVE",
            migration_batch_id  = None,
            created_at          = db.execute(text("SELECT NOW()")).scalar(),
        ))
    db.commit()
    db.refresh(gr)
    db.add(ActivityLog(
        entity_type   = "ENINV",
        entity_id     = gr.id,
        entity_numero = gr.numero,
        action        = "CREATED",
        description   = f"Recepcion {gr.numero} creada desde {p.numero} con {len(productos_recepcion)} lineas normalizadas",
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
    # Cierre 1: Regenerar snapshot con grl_id y po_line_id desde GRL creadas
    # recepcionar desde PEC tambien debe devolver grl_id en cada producto
    _grls_pec = db.execute(
        select(GoodsReceiptLine)
        .where(GoodsReceiptLine.gr_id == gr.id)
        .order_by(GoodsReceiptLine.id)
    ).scalars().all()
    gr.productos = [
        {
            "sku_id"        : grl.sku_id,
            "nombre"        : grl.description or "",
            "qty_esperada"  : int(grl.quantity_expected or 0),
            "qty_recibida"  : None,
            "qty_rechazada" : 0,
            "qty_cuarentena": 0,
            "estado"        : "PENDIENTE",
            "po_line_id"    : grl.po_line_id,
            "grl_id"        : grl.id,
        }
        for grl in _grls_pec
    ]
    db.commit()
    db.refresh(gr)
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
    db.flush()  # obtener gr.id sin commit
    # Crear GoodsReceiptLine en la misma TX (Bloqueo 2: normalizar POST /recepciones)
    # Bloqueo 3: validar _po_line_id si el cliente lo proporciona
    pec_id_gr = body.get("pec_id")
    productos_gr = body.get("productos", [])
    for prod in productos_gr:
        sku_id_raw   = prod.get("sku_id")
        qty_esp      = int(prod.get("qty_esperada", prod.get("qty", 0)))
        po_line_id_v = prod.get("_po_line_id")
        # Bloqueo 3: validar que _po_line_id pertenece a la PEC de esta recepción
        if po_line_id_v is not None:
            from sqlalchemy import text as _text3
            pol_pec = db.execute(_text3(
                "SELECT pec_id FROM purchase_order_lines WHERE id = :pid"
            ), {"pid": po_line_id_v}).scalar()
            if pol_pec is None:
                raise HTTPException(422, f"po_line_id={po_line_id_v} no existe.")
            if pec_id_gr and pol_pec != pec_id_gr:
                raise HTTPException(
                    422,
                    f"po_line_id={po_line_id_v} pertenece a la PEC {pol_pec}, "
                    f"no a la PEC {pec_id_gr} de esta recepción."
                )
        db.add(GoodsReceiptLine(
            gr_id               = gr.id,
            po_line_id          = po_line_id_v,
            sku_id              = sku_id_raw,
            description         = prod.get("nombre", prod.get("name", prod.get("product_name", ""))),
            quantity_expected   = qty_esp,
            quantity_received   = None,   # NULL = pendiente de registro
            quantity_rejected   = 0,
            quantity_quarantine = 0,
            receipt_type        = "FISICA",
            source              = "NATIVE",
        ))
    db.commit()
    db.refresh(gr)
    # Cierre 1: Regenerar snapshot con grl_id desde GRL recién creadas
    # Las respuestas de POST deben incluir grl_id y po_line_id en cada producto
    _grls_post = db.execute(
        select(GoodsReceiptLine)
        .where(GoodsReceiptLine.gr_id == gr.id)
        .order_by(GoodsReceiptLine.id)
    ).scalars().all()
    gr.productos = [
        {
            "sku_id"        : grl.sku_id,
            "nombre"        : grl.description or "",
            "qty_esperada"  : int(grl.quantity_expected or 0),
            "qty_recibida"  : None,
            "qty_rechazada" : 0,
            "qty_cuarentena": 0,
            "estado"        : "PENDIENTE",
            "po_line_id"    : grl.po_line_id,
            "grl_id"        : grl.id,
        }
        for grl in _grls_post
    ]
    db.commit()
    db.refresh(gr)
    _log(db, "ENINV", gr.id, gr.numero, "CREATED",
         f"Recepcion {gr.numero} creada con {len(productos_gr)} lineas normalizadas",
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
    """

    Actualiza una recepcion.

    Bloqueo 2 — Normalizar caminos de edicion:

    - Si body trae 'productos' y la recepcion esta en BORRADOR:

        Actualiza GoodsReceiptLine existentes y regenera el snapshot JSON.

    - Si body trae 'productos' y la recepcion NO esta en BORRADOR:

        Retorna 422. No se puede modificar productos de una recepcion confirmada.

    - Otros campos (estado, warehouse_id, notas, etc.) se actualizan libremente.

    - El JSON g.productos NUNCA se actualiza directamente; solo desde GRL.

    """
    g = db.query(GoodsReceipt).filter(GoodsReceipt.id == eninv_id).first()
    if not g:
        raise HTTPException(404, "Recepcion no encontrada")
    old_estado = g.estado
    # Si el payload trae productos, aplicar logica normalizada
    if "productos" in body:
        if g.estado != "BORRADOR":
            raise HTTPException(
                422,
                f"No se puede modificar productos de una recepcion en estado {g.estado!r}. "
                "Solo se pueden editar recepciones en BORRADOR."
            )
        # Actualizar GRL existentes y regenerar snapshot JSON
        nuevos_prods = body.pop("productos")  # consumir del body
        gr_lines = db.execute(
            select(GoodsReceiptLine)
            .where(GoodsReceiptLine.gr_id == eninv_id)
            .order_by(GoodsReceiptLine.id)
        ).scalars().all()
        if gr_lines:
            # Bloqueo 3: Actualizar GRL por grl_id (no por indice posicional).
            # Cada item del body debe traer grl_id explicito.
            # Tambien se acepta el formato antiguo (sin grl_id) por compatibilidad,
            # en cuyo caso se actualizan por orden si hay correspondencia 1:1.
            gr_lines_map = {grl.id: grl for grl in gr_lines}
            has_grl_ids = any(np.get("grl_id") for np in nuevos_prods)
            all_have_grl = all(np.get("grl_id") for np in nuevos_prods)
            if has_grl_ids and not all_have_grl:
                raise HTTPException(
                    422,
                    "Payload mixto: todos los items deben tener 'grl_id' o ninguno. "
                    "No se aceptan payloads donde unas líneas tienen grl_id y otras no."
                )
            if has_grl_ids:

                # ─── Ruta segura: actualizacion por grl_id ──────────────────

                for np in nuevos_prods:
                    grl_id_req = np.get("grl_id")
                    if grl_id_req is None:
                        raise HTTPException(
                            422,
                            "Todos los items deben incluir 'grl_id' cuando se usan IDs. "
                            f"Item sin grl_id: {np}"
                        )
                    grl = gr_lines_map.get(int(grl_id_req))
                    if grl is None:
                        raise HTTPException(
                            422,
                            f"grl_id={grl_id_req} no pertenece a la recepcion {eninv_id}. "
                            "No se pueden actualizar lineas de otras recepciones."
                        )
                    # Validar po_line_id si viene
                    if "po_line_id" in np and np["po_line_id"] is not None:
                        if int(np["po_line_id"]) != (grl.po_line_id or -1):
                            raise HTTPException(
                                422,
                                f"po_line_id={np['po_line_id']} no coincide con "
                                f"el de la GRL {grl_id_req} (po_line_id={grl.po_line_id}). "
                                "No se puede reasignar una linea a otra PurchaseOrderLine."
                            )
                    # Validar sku_id si viene
                    if "sku_id" in np and np["sku_id"] is not None:
                        if int(np["sku_id"]) != (grl.sku_id or -1):
                            raise HTTPException(
                                422,
                                f"sku_id={np['sku_id']} no coincide con el de "
                                f"la GRL {grl_id_req} (sku_id={grl.sku_id}). "
                                "No se puede cambiar el SKU de una linea existente."
                            )
                    qty_recv = np.get("qty_recibida", np.get("quantity_received"))
                    qty_rej  = np.get("qty_rechazada", np.get("quantity_rejected", 0))
                    qty_quar = np.get("qty_cuarentena", np.get("quantity_quarantine", 0))
                    if qty_recv is not None:
                        grl.quantity_received   = int(qty_recv)
                    grl.quantity_rejected   = int(qty_rej or 0)
                    grl.quantity_quarantine = int(qty_quar or 0)
            else:
                # Cierre 2: El fallback posicional solo está permitido para
                # documentos legacy (source='LEGACY') ya normalizados.
                # Para recepciones nuevas (source='NATIVE'), rechazar:
                native_grls = [grl for grl in gr_lines if grl.source == 'NATIVE']
                if native_grls:
                    raise HTTPException(
                        422,
                        "Las recepciones nuevas (NATIVE) requieren 'grl_id' en cada "
                        "producto del payload. Usa GET /recepciones/{id} para obtener "
                        "los grl_id de cada línea antes de actualizar."
                    )
                # Solo legacy: actualizar por índice con auditoría
                import logging as _logging
                _logging.getLogger(__name__).warning(
                    f"ENINV {eninv_id}: usando compatibilidad posicional legacy "
                    f"({len(gr_lines)} GRL, source=LEGACY)"
                )
                for idx, grl in enumerate(gr_lines):
                    if idx < len(nuevos_prods):
                        np_item = nuevos_prods[idx]
                        qty_recv = np_item.get("qty_recibida", np_item.get("quantity_received"))
                        qty_rej  = np_item.get("qty_rechazada", np_item.get("quantity_rejected", 0))
                        qty_quar = np_item.get("qty_cuarentena", np_item.get("quantity_quarantine", 0))
                        if qty_recv is not None:
                            grl.quantity_received   = int(qty_recv)
                        grl.quantity_rejected   = int(qty_rej or 0)
                        grl.quantity_quarantine = int(qty_quar or 0)
                # Auditoría de uso de compatibilidad posicional
                db.add(ActivityLog(
                    entity_type  = "ENINV",
                    entity_id    = eninv_id,
                    entity_numero= g.numero,
                    action       = "LEGACY_POSITIONAL_COMPAT",
                    description  = f"PATCH posicional en recepción legacy ({len(gr_lines)} líneas). "
                                   "Migrar a grl_id para eliminar esta compatibilidad.",
                    user_name    = "system",
                ))
            # Regenerar snapshot JSON desde GRL (GRL es fuente de verdad)
            g.productos = [
                {
                    "sku_id"        : grl.sku_id,
                    "nombre"        : grl.description or "",
                    "qty_esperada"  : int(grl.quantity_expected or 0),
                    "qty_recibida"  : int(grl.quantity_received) if grl.quantity_received is not None else None,
                    "qty_rechazada" : int(grl.quantity_rejected or 0),
                    "qty_cuarentena": int(grl.quantity_quarantine or 0),
                    "estado"        : "PENDIENTE" if grl.quantity_received is None else "PARCIAL",
                    "po_line_id"    : grl.po_line_id,
                    "grl_id"        : grl.id,
                }
                for grl in gr_lines
            ]
        else:
            # No hay GRL: recepcion legacy.
            # Bloqueo 3: Primero normalizar (crear GRL), luego actualizar por ID.
            for prod in nuevos_prods:
                sku_id_raw = prod.get("sku_id")
                qty_esp    = int(prod.get("qty_esperada", prod.get("qty", 0)))
                qty_recv_v = prod.get("qty_recibida", prod.get("quantity_received"))
                db.add(GoodsReceiptLine(
                    gr_id               = eninv_id,
                    po_line_id          = None,
                    sku_id              = sku_id_raw,
                    description         = prod.get("nombre", prod.get("name", "")),
                    quantity_expected   = qty_esp,
                    quantity_received   = int(qty_recv_v) if qty_recv_v is not None else None,
                    quantity_rejected   = int(prod.get("qty_rechazada", prod.get("quantity_rejected", 0)) or 0),
                    quantity_quarantine = int(prod.get("qty_cuarentena", prod.get("quantity_quarantine", 0)) or 0),
                    receipt_type        = "FISICA",
                    source              = "LEGACY",
                ))
            db.flush()
            # Regenerar JSON desde las nuevas GRL
            new_grls = db.execute(
                select(GoodsReceiptLine)
                .where(GoodsReceiptLine.gr_id == eninv_id)
                .order_by(GoodsReceiptLine.id)
            ).scalars().all()
            g.productos = [
                {
                    "sku_id"        : grl.sku_id,
                    "nombre"        : grl.description or "",
                    "qty_esperada"  : int(grl.quantity_expected or 0),
                    "qty_recibida"  : int(grl.quantity_received) if grl.quantity_received is not None else None,
                    "qty_rechazada" : int(grl.quantity_rejected or 0),
                    "qty_cuarentena": int(grl.quantity_quarantine or 0),
                    "estado"        : "PENDIENTE" if grl.quantity_received is None else "PARCIAL",
                    "po_line_id"    : grl.po_line_id,
                    "grl_id"        : grl.id,
                }
                for grl in new_grls
            ]
    # Campos generales permitidos (excepto productos, ya consumido)
    allowed_non_prod = ["estado","warehouse_id","warehouse_name","carrier",
                        "tracking_number","operacion_tipo","notas"]
    for k in allowed_non_prod:
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


@router.post("/recepciones/{eninv_id}/lineas")
def add_grl(
    eninv_id: int,
    body: dict,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """

    Agrega una línea nueva a una recepción en BORRADOR.

    Cierre 3: Altas de líneas. El body debe incluir:

      - sku_id: int (requerido)

      - qty_esperada: int (requerido)

      - nombre: str (opcional)

      - po_line_id: int (opcional — debe pertenecer a la PEC de la recepción)

    """
    g = db.query(GoodsReceipt).filter(GoodsReceipt.id == eninv_id).first()
    if not g:
        raise HTTPException(404, "Recepcion no encontrada")
    if g.estado != "BORRADOR":
        raise HTTPException(
            422,
            f"Solo se pueden agregar líneas a recepciones en BORRADOR. Estado actual: {g.estado}"
        )
    sku_id_new    = body.get("sku_id")
    qty_esp_new   = int(body.get("qty_esperada", body.get("qty", 0)) or 0)
    po_line_id_new = body.get("po_line_id")
    nombre_new    = body.get("nombre", body.get("name", ""))
    if not sku_id_new:
        raise HTTPException(422, "sku_id es requerido para agregar una línea")
    if qty_esp_new <= 0:
        raise HTTPException(422, "qty_esperada debe ser mayor que 0")
    # Validar po_line_id si viene
    if po_line_id_new is not None:
        pol_check = db.execute(text(
            "SELECT pec_id FROM purchase_order_lines WHERE id = :pid"
        ), {"pid": po_line_id_new}).fetchone()
        if pol_check is None:
            raise HTTPException(422, f"po_line_id={po_line_id_new} no existe")
        if g.pec_id and pol_check[0] != g.pec_id:
            raise HTTPException(
                422,
                f"po_line_id={po_line_id_new} pertenece a la PEC {pol_check[0]}, "
                f"no a la PEC {g.pec_id} de esta recepción"
            )
    new_grl = GoodsReceiptLine(
        gr_id               = eninv_id,
        po_line_id          = po_line_id_new,
        sku_id              = sku_id_new,
        description         = nombre_new,
        quantity_expected   = qty_esp_new,
        quantity_received   = None,
        quantity_rejected   = 0,
        quantity_quarantine = 0,
        receipt_type        = "FISICA",
        source              = "NATIVE",
    )
    db.add(new_grl)
    db.flush()
    # Regenerar snapshot JSON desde todas las GRL
    all_grls = db.execute(
        select(GoodsReceiptLine)
        .where(GoodsReceiptLine.gr_id == eninv_id)
        .order_by(GoodsReceiptLine.id)
    ).scalars().all()
    g.productos = [
        {
            "sku_id"        : grl.sku_id,
            "nombre"        : grl.description or "",
            "qty_esperada"  : int(grl.quantity_expected or 0),
            "qty_recibida"  : int(grl.quantity_received) if grl.quantity_received is not None else None,
            "qty_rechazada" : int(grl.quantity_rejected or 0),
            "qty_cuarentena": int(grl.quantity_quarantine or 0),
            "estado"        : "PENDIENTE" if grl.quantity_received is None else "PARCIAL",
            "po_line_id"    : grl.po_line_id,
            "grl_id"        : grl.id,
        }
        for grl in all_grls
    ]
    db.commit()
    _log(db, "ENINV", eninv_id, g.numero, "LINE_ADDED",
         f"Línea agregada: SKU {sku_id_new}, qty_esperada={qty_esp_new}, grl_id={new_grl.id}",
         user_name=user.email)
    return {"status": "success", "data": {
        "grl_id"        : new_grl.id,
        "sku_id"        : new_grl.sku_id,
        "po_line_id"    : new_grl.po_line_id,
        "qty_esperada"  : int(new_grl.quantity_expected or 0),
        "qty_recibida"  : None,
        "estado"        : "PENDIENTE",
        "eninv_id"      : eninv_id,
        "productos_actualizados": g.productos,
    }}


@router.delete("/recepciones/{eninv_id}/lineas/{grl_id_del}")
def remove_grl(
    eninv_id: int,
    grl_id_del: int,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS)),
    db: Session = Depends(get_db),
):
    """

    Retira (elimina) una línea de una recepción en BORRADOR.

    Cierre 3: Retiros de líneas. Restricciones:

    - Solo en BORRADOR

    - No se puede retirar si la línea tiene cantidad registrada (quantity_received IS NOT NULL)

    - No se puede retirar si hay movimientos de inventario asociados

    - Se elimina físicamente y se regenera el snapshot

    """
    g = db.query(GoodsReceipt).filter(GoodsReceipt.id == eninv_id).first()
    if not g:
        raise HTTPException(404, "Recepcion no encontrada")
    if g.estado != "BORRADOR":
        raise HTTPException(
            422,
            f"Solo se pueden retirar líneas de recepciones en BORRADOR. Estado: {g.estado}"
        )
    grl = db.execute(
        select(GoodsReceiptLine)
        .where(GoodsReceiptLine.id == grl_id_del)
        .where(GoodsReceiptLine.gr_id == eninv_id)
    ).scalar_one_or_none()
    if not grl:
        raise HTTPException(
            422,
            f"grl_id={grl_id_del} no pertenece a la recepción {eninv_id}"
        )
    # Impedir retiro si ya tiene cantidad registrada (quantity_received IS NOT NULL)
    if grl.quantity_received is not None:
        raise HTTPException(
            422,
            f"No se puede retirar la línea GRL {grl_id_del} porque ya tiene "
            f"quantity_received={grl.quantity_received} registrado. "
            "Solo se pueden retirar líneas aún no procesadas (quantity_received=NULL)."
        )
    # Impedir retiro si hay movimientos de inventario asociados
    n_movs = db.execute(text(
        "SELECT COUNT(*) FROM inventory_movements im "
        "JOIN inventory_operations io ON io.id = im.operation_id "
        "WHERE io.source_document_id = :gr_id AND im.sku_id = :sku_id"
    ), {"gr_id": eninv_id, "sku_id": grl.sku_id}).scalar() or 0
    if int(n_movs) > 0:
        raise HTTPException(
            422,
            f"No se puede retirar la línea GRL {grl_id_del}: tiene {n_movs} "
            "movimientos de inventario asociados."
        )
    grl_sku = grl.sku_id
    grl_pol = grl.po_line_id
    db.delete(grl)
    db.flush()
    # Regenerar snapshot sin la línea eliminada
    remaining_grls = db.execute(
        select(GoodsReceiptLine)
        .where(GoodsReceiptLine.gr_id == eninv_id)
        .order_by(GoodsReceiptLine.id)
    ).scalars().all()
    g.productos = [
        {
            "sku_id"        : rl.sku_id,
            "nombre"        : rl.description or "",
            "qty_esperada"  : int(rl.quantity_expected or 0),
            "qty_recibida"  : int(rl.quantity_received) if rl.quantity_received is not None else None,
            "qty_rechazada" : int(rl.quantity_rejected or 0),
            "qty_cuarentena": int(rl.quantity_quarantine or 0),
            "estado"        : "PENDIENTE" if rl.quantity_received is None else "PARCIAL",
            "po_line_id"    : rl.po_line_id,
            "grl_id"        : rl.id,
        }
        for rl in remaining_grls
    ]
    db.commit()
    _log(db, "ENINV", eninv_id, g.numero, "LINE_REMOVED",
         f"Línea retirada: grl_id={grl_id_del}, SKU {grl_sku}, po_line_id={grl_pol}",
         user_name=user.email)
    return {"status": "success", "data": {
        "grl_id_removed"        : grl_id_del,
        "sku_id"                : grl_sku,
        "po_line_id"            : grl_pol,
        "lineas_restantes"      : len(remaining_grls),
        "productos_actualizados": g.productos,
    }}


@router.patch("/recepciones/{eninv_id}/lineas/{grl_id}")
def update_grl(
    eninv_id: int, grl_id: int, body: dict,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_COMPRAS, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """

    Registra cantidades en una GoodsReceiptLine especifica antes de confirmar.

    Campos aceptados:

      quantity_received   (int o null)

      quantity_rejected   (int)

      quantity_quarantine (int)

    Bloqueo 1: permite registrar 0 como recepcion explicita en cero.

    Solo funciona si la recepcion esta en BORRADOR.

    """
    gr = db.query(GoodsReceipt).filter(GoodsReceipt.id == eninv_id).first()
    if not gr:
        raise HTTPException(404, "Recepcion no encontrada")
    if gr.estado != "BORRADOR":
        raise HTTPException(422, f"Solo se puede editar lineas de recepciones en BORRADOR. Estado actual: {gr.estado!r}")
    grl = db.execute(
        select(GoodsReceiptLine)
        .where(GoodsReceiptLine.id == grl_id, GoodsReceiptLine.gr_id == eninv_id)
    ).scalar_one_or_none()
    if not grl:
        raise HTTPException(404, f"GoodsReceiptLine {grl_id} no encontrada en recepcion {eninv_id}")
    if "quantity_received" in body:
        v = body["quantity_received"]
        grl.quantity_received = None if v is None else int(v)
    if "quantity_rejected" in body:
        grl.quantity_rejected = int(body["quantity_rejected"] or 0)
    if "quantity_quarantine" in body:
        grl.quantity_quarantine = int(body["quantity_quarantine"] or 0)
    db.commit()
    db.refresh(grl)
    return {
        "status": "success",
        "data": {
            "id": grl.id,
            "gr_id": grl.gr_id,
            "po_line_id": grl.po_line_id,
            "sku_id": grl.sku_id,
            "quantity_expected": int(grl.quantity_expected or 0),
            "quantity_received": int(grl.quantity_received) if grl.quantity_received is not None else None,
            "quantity_rejected": int(grl.quantity_rejected or 0),
            "quantity_quarantine": int(grl.quantity_quarantine or 0),
            "receipt_type": grl.receipt_type,
            "source": grl.source,
        }
    }


@router.post("/recepciones/{eninv_id}/confirmar")
def confirmar_recepcion(
    eninv_id: int,
    body: ConfirmarRecepcionBody,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """

    Confirma una recepcion de mercancia (Fase 1A v4 - ciclo de vida correcto).

    CICLO DE VIDA DE IDEMPOTENCIA (2 transacciones independientes):

    Transaccion 1 (corta, independiente):

      INSERT idempotency_requests status=PROCESSING + execution_token

      COMMIT <- el registro persiste aunque falle la transaccion principal

    Transaccion 2 (principal, usa `db` del endpoint):

      SELECT FOR UPDATE GoodsReceipt + validaciones de negocio

      UPDATE inventory_levels + INSERT InventoryMovement

      UPDATE idempotency_requests SET status=DONE

      COMMIT

    Si Transaccion 2 falla:

      _mark_failed_external: UPDATE SET status=FAILED WHERE token=:token AND status=PROCESSING

      El registro ya existe (Transaccion 1 fue committed), entonces el UPDATE funciona.

    ENINV ya confirmada (stock_actualizado=True):

      Misma clave + mismo hash -> replay 200 (desde idempotency_requests.response_body)

      Clave diferente -> 409 "ya confirmada con diferente clave"

      Misma clave + hash diferente -> 409 "payload no coincide"

      Nunca crea InventoryOperation. Nunca depende de constraint. Nunca 500.

    LOGISTICA ya confirmada (estado=COMPLETADA_LOGISTICA):

      Misma clave -> replay 200

      Clave diferente -> 409

    VALIDACIONES DE NEGOCIO:

      - receipt_type en whitelist (Pydantic)

      - idempotency_key obligatoria (Pydantic, sin default)

      - qty_recibida < 0 -> 422

      - qty_recibida > qty_esperada sin allow_excess -> 422

      - Sin productos con SKU y qty > 0 para FISICA -> 422

      - ENINV cancelada, completada o LOGISTICA-ya-confirmada -> 409/replay

      - Sin bodega -> 400

    """
    import hashlib
    import json as _json
    from sqlalchemy import text as _text
    from app.db.database import SessionLocal
    now = datetime.datetime.utcnow()
    client_key   = body.idempotency_key
    receipt_type = body.receipt_type
    allow_excess = body.allow_excess
    user_label   = body.user_name or str(user.id)
    # Hash del payload para detectar cambios en reintentos
    body_for_hash = {"receipt_type": receipt_type, "eninv_id": eninv_id}
    req_hash = hashlib.sha256(
        _json.dumps(body_for_hash, sort_keys=True).encode()
    ).hexdigest()
    execution_token = str(uuid.uuid4())
    won_lock = False  # True si ESTA ejecucion gano el lock de idempotencia

    # ─── TRANSACCION 1: ADQUIRIR CLAVE DE IDEMPOTENCIA ────────────────────────

    # Se usa una sesion INDEPENDIENTE de `db` para que el INSERT sea committed
    # inmediatamente, antes de abrir la transaccion principal.
    # Si la transaccion principal hace rollback, el registro PROCESSING persiste
    # y _mark_failed_external puede actualizarlo a FAILED.
    idem_session = SessionLocal()
    try:
        result = idem_session.execute(_text(
            "INSERT INTO idempotency_requests "
            "(operation_type, operation_key, request_hash, entity_type, entity_id, "
            " user_id, status, execution_token, request_body, created_at) "
            "VALUES ('CONFIRMAR_RECEPCION', :k, :h, 'ENINV', :eid, :uid, "
            "        'PROCESSING', :token, CAST(:body AS jsonb), :now) "
            "ON CONFLICT (operation_type, operation_key) DO NOTHING"
        ), {
            "k": client_key, "h": req_hash, "eid": eninv_id,
            "uid": user.id, "token": execution_token,
            "body": _json.dumps(body_for_hash),
            "now": now,
        })
        idem_session.commit()  # <- COMMIT INDEPENDIENTE: registro persiste siempre
        if result.rowcount == 1:
            won_lock = True
        else:
            # Registro ya existia: leer estado actual
            row = idem_session.execute(_text(
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
                        "La clave de idempotencia ya fue usada con un payload diferente. "
                        f"Usa una clave nueva para este intento."
                    )
                stored = row.response_body
                if isinstance(stored, str):
                    stored = _json.loads(stored)
                return {
                    "status": "success",
                    "data": stored,
                    "idempotent_replay": True,
                    "idempotency_key": client_key,
                }
            elif row.status == "PROCESSING":
                raise HTTPException(409, "Operacion en proceso. Reintenta en unos segundos.")
            elif row.status == "FAILED":
                if row.request_hash != req_hash:
                    raise HTTPException(
                        409,
                        "La clave de idempotencia (FAILED) fue usada con payload diferente."
                    )
                # Mismo payload, operacion fallida -> permitir reintento
                idem_session.execute(_text(
                    "UPDATE idempotency_requests "
                    "SET status='PROCESSING', execution_token=:token, created_at=:now "
                    "WHERE operation_type='CONFIRMAR_RECEPCION' AND operation_key=:k "
                    "  AND status='FAILED'"
                ), {"token": execution_token, "now": now, "k": client_key})
                idem_session.commit()
                won_lock = True
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Error en capa de idempotencia: {exc}")
    finally:
        idem_session.close()

    # ─── TRANSACCION 2: PRINCIPAL ──────────────────────────────────────────────

    # A partir de aqui usamos `db` (sesion del endpoint).
    # Si algo falla, llamamos a _mark_failed_external(client_key, execution_token)
    # que usa una tercera sesion para actualizar el registro a FAILED.
    try:
        # SELECT FOR UPDATE: bloquear la recepcion antes de cualquier validacion
        g = db.execute(
            select(GoodsReceipt)
            .where(GoodsReceipt.id == eninv_id)
            .with_for_update()
        ).scalar_one_or_none()
        if g is None:
            _mark_failed_external(client_key, execution_token, "ENINV no encontrada", now)
            raise HTTPException(404, "Recepcion no encontrada")

        # ─── ENINV ya terminada: respuesta determinista sin IntegrityError ───

        if g.estado in ("COMPLETADA", "COMPLETADA_LOGISTICA"):
            # Misma clave? Buscar en idempotency_requests por entity_id
            existing_done = db.execute(_text(
                "SELECT response_body, operation_key FROM idempotency_requests "
                "WHERE entity_type='ENINV' AND entity_id=:eid AND status='DONE' "
                "ORDER BY completed_at DESC LIMIT 1"
            ), {"eid": eninv_id}).fetchone()
            if existing_done and existing_done.operation_key == client_key:
                # Replay: misma clave que la confirmacion original
                stored = existing_done.response_body
                if isinstance(stored, str):
                    stored = _json.loads(stored)
                # Marcar este intento de idempotencia como DONE tambien
                _mark_done_external(client_key, execution_token, stored, now)
                return {
                    "status": "success",
                    "data": stored,
                    "idempotent_replay": True,
                    "idempotency_key": client_key,
                }
            else:
                # Clave diferente: ya confirmada con otra clave
                _mark_failed_external(
                    client_key, execution_token,
                    f"ENINV {eninv_id} ya fue confirmada (estado={g.estado})",
                    now
                )
                raise HTTPException(
                    409,
                    f"Esta recepcion ya fue confirmada (estado={g.estado}). "
                    "Usa la clave de idempotencia original para obtener el resultado, "
                    "o verifica que eninv_id sea el correcto."
                )
        if g.estado == "CANCELADA":
            _mark_failed_external(client_key, execution_token, "ENINV cancelada", now)
            raise HTTPException(409, "Esta recepcion esta cancelada y no puede confirmarse.")

        # ─── VALIDACIONES DE NEGOCIO ──────────────────────────────────────────

        warehouse_id = g.warehouse_id
        if not warehouse_id:
            _mark_failed_external(client_key, execution_token, "Sin bodega configurada", now)
            raise HTTPException(400, "Debe seleccionar una bodega antes de confirmar.")
        # Validar que la bodega existe
        warehouse = db.execute(
            select(Warehouse).where(Warehouse.id == warehouse_id).with_for_update()
        ).scalar_one_or_none()
        if not warehouse:
            _mark_failed_external(
                client_key, execution_token, "Bodega no encontrada", now,
                request_hash=req_hash, request_body=body_for_hash, entity_type="GOODS_RECEIPT", user_id=getattr(user, "id", None)
            )
            raise HTTPException(400, f"Bodega {warehouse_id} no encontrada en la base de datos.")

        # ─── VALIDACION RIGUROSA DE MAQUINA DE ESTADOS DE SHIPMENT (Fase 2) ──
        shp = None
        if g.shipment_id and receipt_type == "FISICA":
            shp = db.execute(
                select(Shipment).where(Shipment.id == g.shipment_id).with_for_update()
            ).scalar_one_or_none()
            if shp:
                if shp.status_fise == "RECIBIDO_BARRANQUILLA":
                    pass  # Idempotente
                else:
                    trans_graph = (
                        ALLOWED_TRANSITIONS_DIRECT
                        if shp.route_type == "DIRECT_TO_BARRANQUILLA"
                        else ALLOWED_TRANSITIONS_MIAMI
                    )
                    allowed_next = trans_graph.get(shp.status_fise, set())
                    if "RECIBIDO_BARRANQUILLA" not in allowed_next:
                        _mark_failed_external(
                            client_key, execution_token,
                            f"Shipment {shp.shipment_number} en estado '{shp.status_fise}' no elegible para recepcion con {shp.route_type}",
                            now,
                            request_hash=req_hash,
                            request_body=body_for_hash,
                            entity_type="GOODS_RECEIPT",
                            user_id=getattr(user, "id", None)
                        )
                        raise HTTPException(
                            422,
                            f"Transición inválida: no es posible avanzar de '{shp.status_fise}' a 'RECIBIDO_BARRANQUILLA' "
                            f"para ruta '{shp.route_type}'. Transiciones permitidas desde el estado actual: {sorted(list(allowed_next))}"
                        )

        # ─── FUENTE DE VERDAD: GOODS_RECEIPT_LINES (Fase 1B) ─────────────────

        # SELECT FOR UPDATE en GoodsReceiptLine para serializacion concurrente.
        # Si no existen lineas normalizadas (recepcion legacy sin PEC), se crea
        # una linea por cada entrada del JSON snapshot como fallback de compatibilidad.
        gr_lines = db.execute(
            select(GoodsReceiptLine)
            .where(GoodsReceiptLine.gr_id == eninv_id)
            .with_for_update()
            .order_by(GoodsReceiptLine.id)
        ).scalars().all()
        if not gr_lines:
            # Fallback: recepcion creada antes de Fase 1B (sin lineas normalizadas).
            # Bloqueo 5: crear GRL con source='LEGACY'
            # - Si qty_recibida existe en JSON (dato historico): usarla como quantity_received.
            # - Si qty_recibida NO existe o es ambigua: usar NULL (requiere registro explicito).
            # Esta regla preserva compatibilidad con recepciones legacy que ya tenian datos.
            for prod in (g.productos or []):
                sku_id_fb  = prod.get("sku_id")
                qty_esp_fb = int(prod.get("qty_esperada", prod.get("qty", 0)))
                # Usar qty del JSON si existe; NULL si no esta presente (ambiguo)
                qty_recv_raw = prod.get("qty_recibida")
                qty_recv_fb  = int(qty_recv_raw) if qty_recv_raw is not None else None
                db.add(GoodsReceiptLine(
                    gr_id               = eninv_id,
                    po_line_id          = None,
                    sku_id              = sku_id_fb,
                    description         = prod.get("nombre", prod.get("name", "")),
                    quantity_expected   = qty_esp_fb,
                    quantity_received   = qty_recv_fb,  # None si ambigua; valor si historico
                    quantity_rejected   = 0,
                    quantity_quarantine = 0,
                    receipt_type        = receipt_type,
                    source              = "LEGACY",     # identificable como normalizado desde JSON
                    migration_batch_id  = None,
                    created_at          = now,
                ))
            db.flush()
            # Audit: registrar normalizacion legacy
            n_legacy = len(g.productos or [])
            db.add(ActivityLog(
                entity_type   = "ENINV",
                entity_id     = eninv_id,
                entity_numero = g.numero,
                action        = "LEGACY_NORMALIZED",
                description   = (
                    f"Normalizacion legacy: {n_legacy} lineas creadas desde JSON snapshot. "
                    "source=LEGACY. quantity_received preservado del JSON si existia."
                ),
                user_name     = user_label,
            ))
            db.flush()
            # Re-leer con lock
            gr_lines = db.execute(
                select(GoodsReceiptLine)
                .where(GoodsReceiptLine.gr_id == eninv_id)
                .with_for_update()
                .order_by(GoodsReceiptLine.id)
            ).scalars().all()

        # ─── VALIDAR Y CALCULAR DESDE LINEAS NORMALIZADAS (Bloqueos 1 y 2) ──────

        # Bloqueo 1: NULL = pendiente de registro -> 422 en FISICA
        # Bloqueo 2: qty=0 es valido (todo rechazado/cuarentena/faltante)
        #   La condicion para confirmar es: todas las lineas tienen resultado EXPLICITO
        #   (no necesariamente qty_received > 0)
        sku_increments: dict = {}  # {sku_id: qty_total} — solo unidades disponibles
        for grl in gr_lines:
            sku_id       = grl.sku_id
            qty_expected = int(grl.quantity_expected or 0)
            qty_rejected  = int(grl.quantity_rejected or 0)
            qty_quarantine = int(grl.quantity_quarantine or 0)
            # Bloqueo 1: NULL = pendiente de registro -> rechazar en confirmacion FISICA
            if grl.quantity_received is None:
                if receipt_type == "FISICA":
                    _mark_failed_external(
                        client_key, execution_token,
                        f"GRL {grl.id} sin cantidad registrada (quantity_received=NULL)", now
                    )
                    raise HTTPException(
                        422,
                        f"La linea GRL {grl.id} (SKU {sku_id}, esperada: {qty_expected}) "
                        "no tiene cantidad registrada. Usa PATCH /recepciones/{id}/lineas/{grl_id} "
                        "para registrar la cantidad antes de confirmar. "
                        "Registra 0 si no llego ninguna unidad."
                    )
                # Para LOGISTICA: cantidad NULL se trata como cero (sin impacto en stock)
                qty_received = 0
            else:
                qty_received = int(grl.quantity_received)
            # Validar cantidades negativas
            if qty_received < 0 or qty_rejected < 0 or qty_quarantine < 0:
                _mark_failed_external(
                    client_key, execution_token,
                    f"Cantidades negativas en GRL {grl.id} SKU {sku_id}", now
                )
                raise HTTPException(
                    422,
                    f"Las cantidades no pueden ser negativas "
                    f"(GRL {grl.id}, SKU {sku_id}: recv={qty_received}, "
                    f"rejected={qty_rejected}, quarantine={qty_quarantine})"
                )
            # Bloqueo 2: validar suma total <= quantity_expected
            qty_suma = qty_received + qty_rejected + qty_quarantine
            if qty_suma > qty_expected and not allow_excess:
                _mark_failed_external(
                    client_key, execution_token,
                    f"Suma total excede expected en GRL {grl.id} SKU {sku_id}", now
                )
                raise HTTPException(
                    422,
                    f"La suma (recibida={qty_received} + rechazada={qty_rejected} + "
                    f"cuarentena={qty_quarantine} = {qty_suma}) excede "
                    f"quantity_expected={qty_expected} para SKU {sku_id}. "
                    f"Usa allow_excess=true para registrar excedentes."
                )
            # Registrar faltante (qty_expected - suma_total)
            qty_faltante = max(0, qty_expected - qty_suma)
            qty_exceso = max(0, qty_received - qty_expected)

            # Actualizar la linea normalizada con trazabilidad Fase 3
            grl.quantity_received   = qty_received
            grl.quantity_rejected   = qty_rejected
            grl.quantity_quarantine = qty_quarantine
            grl.quantity_missing    = Decimal(str(qty_faltante))
            grl.quantity_excess     = Decimal(str(qty_exceso))
            grl.receipt_type        = receipt_type

            if qty_quarantine > 0 and qty_received == 0:
                grl.status = "CUARENTENA"
            elif qty_rejected > 0 and qty_received == 0:
                grl.status = "RECHAZADA"
            elif qty_faltante > 0 and qty_received > 0:
                grl.status = "PARCIAL"
            elif qty_faltante > 0 and qty_received == 0:
                grl.status = "FALTANTE"
            elif qty_exceso > 0:
                grl.status = "EXCEDENTE"
            else:
                grl.status = "CORRECTA"

            # Actualizar quantity_received en PurchaseOrderLine
            if receipt_type == "FISICA" and grl.po_line_id:
                pol = db.execute(
                    select(PurchaseOrderLine).where(PurchaseOrderLine.id == grl.po_line_id).with_for_update()
                ).scalar_one_or_none()
                if pol:
                    pol.quantity_received = (pol.quantity_received or Decimal("0")) + Decimal(str(qty_received))

            # Solo sumar al inventario disponible si es FISICA y qty_received > 0
            if receipt_type == "FISICA" and sku_id and qty_received > 0:
                sku_increments[sku_id] = sku_increments.get(sku_id, 0) + qty_received

        # ─── REGENERAR SNAPSHOT JSON DESDE LINEAS NORMALIZADAS (Bloqueo 2) ────

        updated_products = []
        for grl in gr_lines:
            _qty_recv = int(grl.quantity_received or 0)
            _qty_rej  = int(grl.quantity_rejected or 0)
            _qty_quar = int(grl.quantity_quarantine or 0)
            _qty_esp  = int(grl.quantity_expected or 0)
            _qty_falt = max(0, _qty_esp - (_qty_recv + _qty_rej + _qty_quar))
            if receipt_type == "FISICA":
                if _qty_recv > 0:
                    estado_prod = "RECIBIDO"
                elif _qty_rej > 0 and _qty_recv == 0:
                    estado_prod = "RECHAZADO"
                elif _qty_quar > 0 and _qty_recv == 0:
                    estado_prod = "EN_CUARENTENA"
                elif _qty_falt > 0:
                    estado_prod = "FALTANTE"
                else:
                    estado_prod = "SIN_STOCK"
            elif receipt_type == "LOGISTICA":
                estado_prod = "EN_TRANSITO_INTERMEDIO"
            else:
                estado_prod = "PENDIENTE"
            updated_products.append({
                "sku_id"        : grl.sku_id,
                "nombre"        : grl.description or "",
                "qty_esperada"  : _qty_esp,
                "qty_recibida"  : _qty_recv,
                "qty_rechazada" : _qty_rej,
                "qty_cuarentena": _qty_quar,
                "qty_faltante"  : _qty_falt,
                "estado"        : estado_prod,
                "po_line_id"    : grl.po_line_id,
                "grl_id"        : grl.id,
            })

        # ─── ACTUALIZAR INVENTARIO (solo FISICA) ──────────────────────────────

        inv_op = None
        owner_increments = {}   # (sku_id, owner) -> Decimal
        quarantine_items = []   # lista de dicts

        if receipt_type == "FISICA":
            # Paso A: Resolver asignaciones por propietario para unidades recibidas y en cuarentena
            for grl in gr_lines:
                _q_recv = Decimal(str(grl.quantity_received or 0))
                _q_quar = Decimal(str(grl.quantity_quarantine or 0))

                if not grl.sku_id:
                    continue

                if grl.po_line_id:
                    allocs = db.execute(
                        select(ProcurementAllocation)
                        .where(ProcurementAllocation.po_line_id == grl.po_line_id)
                        .order_by(ProcurementAllocation.id)
                        .with_for_update()
                    ).scalars().all()

                    alloc_remaining = {}
                    for alloc in allocs:
                        applied_prev = db.execute(
                            select(func.coalesce(func.sum(GoodsReceiptLineAllocation.quantity_applied), 0))
                            .where(GoodsReceiptLineAllocation.allocation_id == alloc.id)
                        ).scalar() or 0
                        alloc_remaining[alloc.id] = max(Decimal("0.00"), Decimal(str(alloc.quantity_allocated)) - Decimal(str(applied_prev)))

                    # 1. Asignar unidades recibidas (vendibles)
                    rem_recv = _q_recv
                    for alloc in allocs:
                        if rem_recv <= 0:
                            break
                        avail = alloc_remaining[alloc.id]
                        if avail > 0:
                            take = min(rem_recv, avail)
                            db.add(GoodsReceiptLineAllocation(
                                gr_line_id=grl.id,
                                allocation_id=alloc.id,
                                quantity_applied=take,
                                created_at=now
                            ))
                            rem_recv -= take
                            alloc_remaining[alloc.id] -= take
                            alloc_owner = "MAU" if alloc.allocation_type == "MAU_STOCK" else "NEBULAE"
                            owner_increments[(grl.sku_id, alloc_owner)] = owner_increments.get((grl.sku_id, alloc_owner), Decimal("0.00")) + take
                            if alloc.allocation_type == "CUSTOMER_ORDER" and alloc.sale_order_line_id:
                                db.add(ActivityLog(
                                    entity_type="PVEN",
                                    entity_id=alloc.sale_order_line_id,
                                    entity_numero="",
                                    action="MERCANCIA_EN_BARRANQUILLA",
                                    description=f"{take} unidad(es) de SKU {grl.sku_id} recibidas en Barranquilla según {g.numero}. Pendiente de saldo y entrega.",
                                    user_name=user_label,
                                ))
                    if rem_recv > 0:
                        owner_increments[(grl.sku_id, "NEBULAE")] = owner_increments.get((grl.sku_id, "NEBULAE"), Decimal("0.00")) + rem_recv

                    # 2. Asignar unidades en cuarentena (segregación patrimonial de cuarentena)
                    rem_quar = _q_quar
                    for alloc in allocs:
                        if rem_quar <= 0:
                            break
                        avail = alloc_remaining[alloc.id]
                        if avail > 0:
                            take_q = min(rem_quar, avail)
                            rem_quar -= take_q
                            alloc_remaining[alloc.id] -= take_q
                            alloc_owner = "MAU" if alloc.allocation_type == "MAU_STOCK" else "NEBULAE"
                            quarantine_items.append({
                                "sku_id": grl.sku_id,
                                "warehouse_id": warehouse_id,
                                "gr_line_id": grl.id,
                                "quantity": take_q,
                                "reason": grl.damaged_reason or "DEFECTUOSO_RECEPCION",
                                "owner": alloc_owner,
                                "notes": grl.notes,
                            })
                    if rem_quar > 0:
                        quarantine_items.append({
                            "sku_id": grl.sku_id,
                            "warehouse_id": warehouse_id,
                            "gr_line_id": grl.id,
                            "quantity": rem_quar,
                            "reason": grl.damaged_reason or "DEFECTUOSO_RECEPCION",
                            "owner": "NEBULAE",
                            "notes": grl.notes,
                        })
                else:
                    if _q_recv > 0:
                        owner_increments[(grl.sku_id, "NEBULAE")] = owner_increments.get((grl.sku_id, "NEBULAE"), Decimal("0.00")) + _q_recv
                    if _q_quar > 0:
                        quarantine_items.append({
                            "sku_id": grl.sku_id,
                            "warehouse_id": warehouse_id,
                            "gr_line_id": grl.id,
                            "quantity": _q_quar,
                            "reason": grl.damaged_reason or "DEFECTUOSO_RECEPCION",
                            "owner": "NEBULAE",
                            "notes": grl.notes,
                        })

            total_recv = sum(owner_increments.values()) if owner_increments else Decimal("0.00")
            total_quar = sum(q["quantity"] for q in quarantine_items) if quarantine_items else Decimal("0.00")

            # Crear InventoryOperation si hay entrada física vendible O entrada en cuarentena
            if total_recv > 0 or total_quar > 0:
                inv_op = InventoryOperation(
                    dest_warehouse_id=warehouse_id,
                    operation_type="RECEIPT",
                    status="DONE",
                    source_document_type="ENINV",
                    source_document_id=g.id,
                    source_document_numero=g.numero,
                )
                db.add(inv_op)
                db.flush()

            # 1. Unidades vendibles hacia InventoryLevel y Kárdex IN por propietario
            if total_recv > 0:
                # Sumar por SKU a InventoryLevel
                sku_totals = {}
                for (sku_id, owner), qty in owner_increments.items():
                    sku_totals[sku_id] = sku_totals.get(sku_id, Decimal("0.00")) + qty

                for sku_id, total_sku_qty in sku_totals.items():
                    level = db.execute(
                        select(InventoryLevel)
                        .where(
                            InventoryLevel.sku_id == sku_id,
                            InventoryLevel.warehouse_id == warehouse_id,
                        )
                        .with_for_update()
                    ).scalar_one_or_none()
                    if level:
                        level.quantity = Decimal(str(level.quantity)) + total_sku_qty
                    else:
                        db.add(InventoryLevel(
                            sku_id=sku_id,
                            warehouse_id=warehouse_id,
                            quantity=total_sku_qty
                        ))

                # Asignar Balances por Propietario y Kárdex IN por Propietario
                for (sku_id, owner), o_qty in owner_increments.items():
                    if o_qty <= Decimal("0.00"):
                        continue
                    iob = db.execute(
                        select(InventoryOwnerBalance)
                        .where(
                            InventoryOwnerBalance.sku_id == sku_id,
                            InventoryOwnerBalance.warehouse_id == warehouse_id,
                            InventoryOwnerBalance.owner == owner,
                        )
                        .with_for_update()
                    ).scalar_one_or_none()
                    if iob:
                        iob.quantity = Decimal(str(iob.quantity)) + o_qty
                        iob.updated_at = now
                    else:
                        db.add(InventoryOwnerBalance(
                            sku_id=sku_id,
                            warehouse_id=warehouse_id,
                            owner=owner,
                            quantity=o_qty,
                            updated_at=now,
                        ))

                    mv_key = hashlib.sha256(
                        f"{inv_op.id}:{sku_id}:IN:{owner}:{warehouse_id}".encode()
                    ).hexdigest()
                    db.add(InventoryMovement(
                        operation_id=inv_op.id,
                        sku_id=sku_id,
                        quantity=o_qty,
                        direction="IN",
                        owner=owner,
                        warehouse_id=warehouse_id,
                        idempotency_key=mv_key,
                        created_at=now,
                        created_by=user_label,
                    ))

            # 2. Unidades defectuosas / discrepantes hacia Cuarentena con trazabilidad
            if total_quar > 0:
                for idx, q_data in enumerate(quarantine_items):
                    q_qty = q_data["quantity"]
                    if q_qty <= Decimal("0.00"):
                        continue
                    db.add(InventoryQuarantine(
                        sku_id=q_data["sku_id"],
                        warehouse_id=q_data["warehouse_id"],
                        gr_line_id=q_data["gr_line_id"],
                        quantity=q_qty,
                        reason=q_data["reason"],
                        owner=q_data["owner"],
                        status="ACTIVO",
                        notes=q_data["notes"],
                        created_at=now,
                    ))
                    if inv_op:
                        quar_key = hashlib.sha256(
                            f"{inv_op.id}:{q_data['sku_id']}:QUARANTINE:{q_data['owner']}:{warehouse_id}:{q_data['gr_line_id']}:{idx}".encode()
                        ).hexdigest()
                        db.add(InventoryMovement(
                            operation_id=inv_op.id,
                            sku_id=q_data["sku_id"],
                            quantity=q_qty,
                            direction="QUARANTINE",
                            owner=q_data["owner"],
                            warehouse_id=warehouse_id,
                            idempotency_key=quar_key,
                            created_at=now,
                            created_by=user_label,
                        ))

        # ─── VINCULO A SHIPMENT — CIERRE DE ENTREGA FÍSICA EN BARRANQUILLA ───

        if g.shipment_id and receipt_type == "FISICA" and shp:
            ev_key = hashlib.sha256(f"{shp.id}:RECIBIDO_BARRANQUILLA:{g.numero}".encode()).hexdigest()
            transition_shipment_to_recibido_barranquilla(
                db=db,
                shipment=shp,
                user_name=user_label,
                notes=f"Recibido físicamente en bodega {warehouse.name} según {g.numero}",
                idempotency_key=ev_key,
                now=now,
            )

        # ─── ACTUALIZAR RECEPCION (snapshot JSON generado desde GRL) ───────────

        g.productos       = updated_products   # snapshot de compatibilidad
        g.receipt_type    = receipt_type
        g.confirmed_by    = user_label
        g.confirmed_at    = now
        g.updated_at      = now
        g.idempotency_key = client_key
        if receipt_type == "FISICA":
            # Bloqueo 2: stock_actualizado=True solo si se ingresó stock disponible.
            # Recepciones donde todo fue rechazado/cuarentena/faltante -> stock_actualizado=False.
            g.stock_actualizado = bool(total_recv > 0)
            g.estado            = "COMPLETADA"
        else:
            g.stock_actualizado = False
            g.estado            = "COMPLETADA_LOGISTICA"

        # ─── ESTADO DEL PEC — CALCULO ACUMULADO ────────────────────────────────

        pec_estado_nuevo = None
        p = None
        if g.pec_id and receipt_type == "FISICA":
            p = db.query(PurchaseOrderFull).filter(
                PurchaseOrderFull.id == g.pec_id
            ).with_for_update().first()
            if p:
                # Calcular estado PEC desde purchase_order_lines + goods_receipt_lines
                # (fuente normalizada, no desde JSON)
                pol_totals = db.execute(text(
                    "SELECT pol.sku_id, SUM(pol.quantity_ordered) as ord "
                    "FROM purchase_order_lines pol "
                    "WHERE pol.pec_id = :pec "
                    "GROUP BY pol.sku_id"
                ), {"pec": g.pec_id}).fetchall()
                if pol_totals:
                    # Calcular desde lineas normalizadas de todas las recepciones confirmadas
                    grl_totals = db.execute(text(
                        "SELECT grl.sku_id, SUM(grl.quantity_received) as recv "
                        "FROM goods_receipt_lines grl "
                        "JOIN goods_receipts gr ON gr.id = grl.gr_id "
                        "WHERE gr.pec_id = :pec AND gr.estado = 'COMPLETADA' "
                        "  AND grl.source IN ('NATIVE', 'BACKFILL', 'LEGACY') "
                        "GROUP BY grl.sku_id"
                    ), {"pec": g.pec_id}).fetchall()
                    qty_acumulada_norm = {r[0]: int(r[1] or 0) for r in grl_totals}
                    # Agregar la recepcion actual (aun no committed, pero gr_lines ya actualizadas)
                    for sku_id, qty in sku_increments.items():
                        qty_acumulada_norm[sku_id] = qty_acumulada_norm.get(sku_id, 0) + qty
                    total_pendiente = 0
                    for pol_sku, qty_ord in [(r[0], int(r[1] or 0)) for r in pol_totals]:
                        recv = qty_acumulada_norm.get(pol_sku, 0)
                        if recv < qty_ord:
                            total_pendiente += (qty_ord - recv)
                else:
                    # Fallback: sin purchase_order_lines, calcular desde JSON de PEC
                    qty_total_ordenada: dict = {}
                    for prod in (p.productos or []):
                        sid = prod.get("sku_id")
                        if sid:
                            qty_total_ordenada[sid] = (
                                qty_total_ordenada.get(sid, 0)
                                + int(prod.get("qty", prod.get("quantity", 0)))
                            )
                    # Acumular recepciones FISICA anteriores (desde GRL si existen,
                    # o desde JSON de recepciones confirmadas como fallback-de-fallback)
                    grl_prev = db.execute(text(
                        "SELECT grl.sku_id, SUM(grl.quantity_received) as recv "
                        "FROM goods_receipt_lines grl "
                        "JOIN goods_receipts gr ON gr.id = grl.gr_id "
                        "WHERE gr.pec_id = :pec AND gr.estado = 'COMPLETADA' "
                        "  AND grl.source IN ('NATIVE', 'BACKFILL', 'LEGACY') "
                        "GROUP BY grl.sku_id"
                    ), {"pec": g.pec_id}).fetchall()
                    if grl_prev:
                        qty_acumulada = {r[0]: int(r[1] or 0) for r in grl_prev}
                    else:
                        # Fallback de fallback: JSON de otras recepciones confirmadas
                        otras = db.query(GoodsReceipt).filter(
                            GoodsReceipt.pec_id == g.pec_id,
                            GoodsReceipt.estado == 'COMPLETADA',
                            GoodsReceipt.id != g.id,
                        ).all()
                        qty_acumulada = {}
                        for otra in otras:
                            for prod in (otra.productos or []):
                                sid = prod.get("sku_id")
                                if sid:
                                    qty_acumulada[sid] = (
                                        qty_acumulada.get(sid, 0)
                                        + int(prod.get("qty_recibida", prod.get("qty", 0)))
                                    )
                    for sku_id, qty in sku_increments.items():
                        qty_acumulada[sku_id] = qty_acumulada.get(sku_id, 0) + qty
                    total_pendiente = 0
                    for sid, qty_ord in qty_total_ordenada.items():
                        recv = qty_acumulada.get(sid, 0)
                        if recv < qty_ord:
                            total_pendiente += (qty_ord - recv)
                pec_estado_nuevo = "PARCIALMENTE_RECIBIDA" if total_pendiente > 0 else "RECIBIDA"
                p.estado     = pec_estado_nuevo
                p.updated_at = now

        # ─── AUDITORIA — DENTRO DE LA TRANSACCION PRINCIPAL ───────────────────

        db.add(ActivityLog(
            entity_type   = "ENINV",
            entity_id     = g.id,
            entity_numero = g.numero,
            action        = "STOCK_ACTUALIZADO" if receipt_type == "FISICA" else "EVENTO_LOGISTICO",
            description   = (
                f"Recepcion {receipt_type} confirmada. "
                + (f"{sum(sku_increments.values())} uds incrementadas en bodega {g.warehouse_name}."
                   if receipt_type == "FISICA" else "Llegada intermedia registrada.")
            ),
            old_estado    = "BORRADOR",
            new_estado    = g.estado,
            user_name     = user_label,
            extra_data    = {
                "receipt_type": receipt_type,
                "sku_increments": sku_increments,
                "idempotency_key": client_key,
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

        # ─── PREPARAR RESPUESTA JSON ──────────────────────────────────────────

        response_data = _gr_dict(g)

        # ─── MARCAR IDEMPOTENCIA DONE (dentro de la transaccion principal) ────

        # Si el commit de abajo falla, _mark_failed_external lo pone en FAILED.
        db.execute(_text(
            "UPDATE idempotency_requests "
            "SET status='DONE', response_body=CAST(:resp AS jsonb), completed_at=:now "
            "WHERE operation_type='CONFIRMAR_RECEPCION' AND operation_key=:k "
            "  AND execution_token=:token AND status='PROCESSING'"
        ), {
            "resp": _json.dumps(response_data, default=str),
            "now": now, "k": client_key, "token": execution_token,
        })

        # ─── UNICO COMMIT DE LA TRANSACCION PRINCIPAL ─────────────────────────

        db.commit()
    except HTTPException as he:
        db.rollback()
        _mark_failed_external(
            client_key, execution_token, str(getattr(he, 'detail', he))[:2000], now,
            request_hash=req_hash, request_body=body_for_hash, entity_type="GOODS_RECEIPT", user_id=getattr(user, "id", None)
        )
        raise
    except Exception as exc:
        db.rollback()
        _mark_failed_external(
            client_key, execution_token, str(exc)[:2000], now,
            request_hash=req_hash, request_body=body_for_hash, entity_type="GOODS_RECEIPT", user_id=getattr(user, "id", None)
        )
        raise HTTPException(500, f"Error al confirmar recepcion: {exc}")
    return {
        "status": "success",
        "data": response_data,
        "idempotency_key": client_key,
    }


def _mark_failed_external(
    op_key: str,
    exec_token: str,
    error: str,
    now: datetime.datetime,
    request_hash: Optional[str] = None,
    request_body: Optional[dict] = None,
    entity_type: Optional[str] = None,
    user_id: Optional[int] = None,
):
    """
    Actualiza idempotency_requests a FAILED en una sesion independiente persistiendo
    todos los campos de auditoría. Se llama DESPUÉS de que la transacción principal hizo rollback.
    """
    try:
        from app.db.database import SessionLocal as _SL
        import json as _json
        body_json = _json.dumps(request_body, default=str) if request_body is not None else None
        with _SL() as _s:
            try:
                _s.execute(
                    __import__("sqlalchemy").text(
                        "INSERT INTO idempotency_requests "
                        "(operation_type, operation_key, request_hash, request_body, execution_token, entity_type, user_id, status, error_detail, created_at, completed_at) "
                        "VALUES ('CONFIRMAR_RECEPCION', :k, :h, CAST(:body AS jsonb), :token, :et, :uid, 'FAILED', :err, :now, :now) "
                        "ON CONFLICT (operation_type, operation_key) DO UPDATE "
                        "SET status='FAILED', "
                        "    error_detail=:err, "
                        "    completed_at=:now, "
                        "    request_hash=COALESCE(EXCLUDED.request_hash, idempotency_requests.request_hash), "
                        "    request_body=COALESCE(EXCLUDED.request_body, idempotency_requests.request_body), "
                        "    execution_token=EXCLUDED.execution_token, "
                        "    entity_type=COALESCE(EXCLUDED.entity_type, idempotency_requests.entity_type), "
                        "    user_id=COALESCE(EXCLUDED.user_id, idempotency_requests.user_id) "
                        "WHERE idempotency_requests.operation_type='CONFIRMAR_RECEPCION' "
                        "  AND idempotency_requests.operation_key=:k"
                    ),
                    {
                        "k": op_key,
                        "h": request_hash,
                        "body": body_json,
                        "token": exec_token,
                        "et": entity_type,
                        "uid": user_id,
                        "err": error[:2000],
                        "now": now,
                    }
                )
                _s.commit()
            except Exception:
                _s.rollback()
                _s.execute(
                    __import__("sqlalchemy").text(
                        "INSERT INTO idempotency_requests "
                        "(operation_type, operation_key, request_hash, request_body, execution_token, entity_type, user_id, status, error_detail, created_at, completed_at) "
                        "VALUES ('CONFIRMAR_RECEPCION', :k, :h, CAST(:body AS jsonb), :token, :et, NULL, 'FAILED', :err, :now, :now) "
                        "ON CONFLICT (operation_type, operation_key) DO UPDATE "
                        "SET status='FAILED', "
                        "    error_detail=:err, "
                        "    completed_at=:now, "
                        "    request_hash=COALESCE(EXCLUDED.request_hash, idempotency_requests.request_hash), "
                        "    request_body=COALESCE(EXCLUDED.request_body, idempotency_requests.request_body), "
                        "    execution_token=EXCLUDED.execution_token, "
                        "    entity_type=COALESCE(EXCLUDED.entity_type, idempotency_requests.entity_type) "
                        "WHERE idempotency_requests.operation_type='CONFIRMAR_RECEPCION' "
                        "  AND idempotency_requests.operation_key=:k"
                    ),
                    {
                        "k": op_key,
                        "h": request_hash,
                        "body": body_json,
                        "token": exec_token,
                        "et": entity_type,
                        "err": error[:2000],
                        "now": now,
                    }
                )
                _s.commit()
    except Exception as exc:
        logger.error(f"Error al marcar FAILED en idempotency_requests para CONFIRMAR_RECEPCION/{op_key}: {exc}", exc_info=True)


def _mark_done_external(op_key: str, exec_token: str, response_data: dict, now: datetime.datetime):
    """

    Marca DONE para claves de idempotencia de reintentos de replay.

    Se usa cuando la ENINV ya fue confirmada y estamos devolviendo el resultado existente.

    """
    try:
        import json as _json
        from app.db.database import SessionLocal as _SL
        with _SL() as _s:
            _s.execute(
                __import__("sqlalchemy").text(
                    "UPDATE idempotency_requests "
                    "SET status='DONE', response_body=CAST(:resp AS jsonb), completed_at=:now "
                    "WHERE operation_type='CONFIRMAR_RECEPCION' "
                    "  AND operation_key=:k "
                    "  AND execution_token=:token "
                    "  AND status='PROCESSING'"
                ),
                {
                    "k": op_key, "token": exec_token,
                    "resp": _json.dumps(response_data, default=str), "now": now
                }
            )
            _s.commit()
    except Exception:
        pass
