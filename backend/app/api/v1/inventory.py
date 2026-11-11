import datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, case, cast, func, or_, select
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.inventory import ShippingMethod, InventoryOperation, InventoryMovement, InventoryLevel
from app.schemas import inventory as schemas
from app.api.dependencies import require_roles, ALL_ERP_ROLES
from app.models.users import User
# B4 T13 (TABLA-compras 5): los parámetros de lista de core/listados.py (R5, C8) y los validadores genéricos de T6B
# (erp_ventas.py), como en erp_compras.py: se importan, no se copian (para la revisión final: deberían vivir en
# core/listados.py). erp_ventas no importa este módulo al cargarse, así que no hay ciclo.
from app.api.v1.erp_ventas import _busqueda_de_lista, _parametro_de_lista, _sin_caracteres_de_control
from app.core.analisis_inventario import ENTRADAS_KARDEX, SALIDAS_KARDEX
from app.core.estados_compras import GRUPOS_OPERACION
from app.core.fechas import iso_z
from app.core.listados import (MAX_OFFSET, contar_por_vista, filtrar_por_estados, leer_lista, leer_orden,
                               orden_por_lista, paginar, respuesta as respuesta_de_lista)

router = APIRouter()

VALID_OPERATION_TYPES = {"RECEIPT", "DELIVERY", "TRANSFER", "PHYSICAL_INVENTORY", "ADJUSTMENT", "LOGISTIC_EVENT"}
# Tipos que ya mueven InventoryLevel de verdad en este endpoint. Los demas
# (RECEIPT/DELIVERY/PHYSICAL_INVENTORY/LOGISTIC_EVENT) tienen su propia logica
# de stock en otros endpoints (recepciones, despachos) -- aqui solo se
# registrarian como movimiento suelto si algun dia se necesitan desde aqui.
STOCK_MOVING_TYPES = {"TRANSFER", "ADJUSTMENT"}

@router.post("/shipping-methods", status_code=status.HTTP_201_CREATED)
def create_shipping_method(method: schemas.ShippingMethodCreate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    db_method = ShippingMethod(**method.model_dump())
    db.add(db_method)
    db.commit()
    db.refresh(db_method)
    return {"status": "success", "data": schemas.ShippingMethodResponse.model_validate(db_method).model_dump()}

@router.get("/shipping-methods")
def list_shipping_methods(db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    methods = db.query(ShippingMethod).all()
    return {"status": "success", "data": [schemas.ShippingMethodResponse.model_validate(m).model_dump() for m in methods]}

from app.models.inventory import Warehouse

@router.post("/warehouses", status_code=status.HTTP_201_CREATED)
def create_warehouse(warehouse: schemas.WarehouseCreate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    data = warehouse.model_dump()
    loc = data.pop("location", None)
    loc_type = data.pop("location_type", None) or loc or "Central"
    db_warehouse = Warehouse(name=data["name"], location_type=loc_type)
    db.add(db_warehouse)
    db.commit()
    db.refresh(db_warehouse)
    return {"status": "success", "data": schemas.WarehouseResponse.model_validate(db_warehouse).model_dump()}

@router.get("/warehouses")
def list_warehouses(db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    warehouses = db.query(Warehouse).order_by(Warehouse.name, Warehouse.id).all()   # B4 T24 (F87-b): por nombre
    return {"status": "success", "data": [schemas.WarehouseResponse.model_validate(w).model_dump() for w in warehouses]}

def _apply_inventory_level(db: Session, sku_id: int, warehouse_id: Optional[int], delta: Decimal):
    """Bloquea (SELECT FOR UPDATE) y ajusta InventoryLevel.quantity en delta
    (puede ser negativo). Mismo patron de bloqueo pesimista que erp_inventario.py
    usa para reservas/confirmaciones, para serializar concurrencia real."""
    if not warehouse_id:
        raise HTTPException(422, f"Falta bodega para aplicar el movimiento del SKU {sku_id}")
    level = db.execute(
        select(InventoryLevel)
        .where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == warehouse_id)
        .with_for_update()
    ).scalar_one_or_none()
    current = Decimal(str(level.quantity)) if level and level.quantity is not None else Decimal("0.00")
    new_qty = current + delta
    if new_qty < 0:
        raise HTTPException(
            409,
            f"Stock insuficiente para el SKU {sku_id} en la bodega {warehouse_id} "
            f"(disponible: {current}, solicitado: {abs(delta)})",
        )
    if level:
        level.quantity = new_qty
    else:
        db.add(InventoryLevel(sku_id=sku_id, warehouse_id=warehouse_id, quantity=new_qty))


@router.post("/operations", status_code=status.HTTP_201_CREATED)
def create_inventory_operation(op: schemas.InventoryOperationCreate,
        db: Session = Depends(get_db), user: User = Depends(require_roles(*ALL_ERP_ROLES))):
    if op.operation_type not in VALID_OPERATION_TYPES:
        raise HTTPException(422, f"operation_type invalido: {op.operation_type}. Validos: {sorted(VALID_OPERATION_TYPES)}")
    if op.operation_type in STOCK_MOVING_TYPES and not op.movements:
        raise HTTPException(422, "Debes incluir al menos un movimiento (sku_id + quantity)")
    if op.operation_type == "TRANSFER" and (not op.source_warehouse_id or not op.dest_warehouse_id):
        raise HTTPException(422, "TRANSFER requiere source_warehouse_id y dest_warehouse_id")
    if op.operation_type == "ADJUSTMENT" and not (op.source_warehouse_id or op.dest_warehouse_id):
        raise HTTPException(422, "ADJUSTMENT requiere una bodega (source_warehouse_id o dest_warehouse_id)")

    op_data = op.model_dump(exclude={"movements", "owner", "created_by"})
    db_op = InventoryOperation(**op_data)
    db.add(db_op)
    db.flush()  # obtener db_op.id sin commit, para poder enlazar movimientos

    created_by = op.created_by or getattr(user, "email", None)
    owner = op.owner or "NEBULAE"
    now = datetime.datetime.utcnow()

    def _movement(sku_id, warehouse_id, quantity, direction):
        db_op.movements.append(InventoryMovement(
            sku_id=sku_id, quantity=abs(quantity), direction=direction, owner=owner,
            warehouse_id=warehouse_id, created_by=created_by, created_at=now,
        ))

    try:
        for mov in op.movements:
            qty = Decimal(str(mov.quantity))
            if op.operation_type == "TRANSFER":
                _apply_inventory_level(db, mov.sku_id, op.source_warehouse_id, -abs(qty))
                _apply_inventory_level(db, mov.sku_id, op.dest_warehouse_id, abs(qty))
                _movement(mov.sku_id, op.source_warehouse_id, qty, "TRANSFER_OUT")
                _movement(mov.sku_id, op.dest_warehouse_id, qty, "TRANSFER_IN")
            elif op.operation_type == "ADJUSTMENT":
                wid = op.dest_warehouse_id or op.source_warehouse_id
                is_in = (mov.direction or "IN").upper() == "IN"
                signed = abs(qty) if is_in else -abs(qty)
                _apply_inventory_level(db, mov.sku_id, wid, signed)
                _movement(mov.sku_id, wid, qty, "ADJUST_IN" if is_in else "ADJUST_OUT")
            else:
                # RECEIPT/DELIVERY/PHYSICAL_INVENTORY/LOGISTIC_EVENT: se registra el
                # movimiento suelto, sin tocar InventoryLevel (esos flujos ya mueven
                # stock por su propio endpoint especializado).
                _movement(mov.sku_id, op.dest_warehouse_id or op.source_warehouse_id, qty, None)

        db.commit()
        db.refresh(db_op)
        # B4 T13: la fecha de la operación es la de su primer movimiento, como en la lista (None sin movimientos).
        fecha = min((m.created_at for m in db_op.movements if m.created_at is not None), default=None)
        return {"status": "success", "data": _operacion_dict(db_op, fecha)}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

# ─── B4 T13 (TABLA-compras 5; R5, R21; C8; RP8, RP9, RP29, RP96, D34, D46): la lista de operaciones ──────────────────

# Los estados de una operación de inventario (core/estados_compras.GRUPOS_OPERACION), en el orden de su flujo.
ESTADOS_OPERACION = tuple(e for estados in GRUPOS_OPERACION.values() for e in estados)   # DRAFT, READY, DONE, CANCELLED
# La dirección de una operación es la de su PRIMER movimiento (RP96): las direcciones de entrada y de salida del Kardex
# (R11). Un primer movimiento sin dirección (o con otra) y una operación sin movimientos no son ninguna de las dos.
DIRECCIONES_OPERACION = {"entrada": ENTRADAS_KARDEX, "salida": SALIDAS_KARDEX}
# El número que muestran las pantallas de Traslados (TRL-0012) y de Ajustes (AJU-0012).
PREFIJOS_OPERACION = {"TRANSFER": "TRL-", "ADJUSTMENT": "AJU-"}
MENSAJE_DIRECCION = "La dirección «{:.40}» no existe: usa entrada o salida."


def _operacion_dict(o, fecha) -> dict:
    """La fila de la operación: InventoryOperationResponse con su «fecha» en ISO con Z (fechas.iso_z, RP29)."""
    fila = schemas.InventoryOperationResponse.model_validate(o).model_dump()
    fila["fecha"] = iso_z(fecha)
    return fila


def _fecha_operacion(op=InventoryOperation):
    """MIN(InventoryMovement.created_at) de la operación (subconsulta correlacionada; NULL sin movimientos)."""
    return (select(func.min(InventoryMovement.created_at)).where(InventoryMovement.operation_id == op.id)
            .correlate(op).scalar_subquery())


def _primera_direccion(op=InventoryOperation):
    """La dirección del primer movimiento (el de menor id) de la operación (RP96)."""
    return (select(InventoryMovement.direction).where(InventoryMovement.operation_id == op.id)
            .order_by(InventoryMovement.id.asc()).limit(1).correlate(op).scalar_subquery())


def _nombre_bodega(columna):
    """El nombre de la bodega de `columna` (subconsulta; NULL sin bodega)."""
    return select(Warehouse.name).where(Warehouse.id == columna).scalar_subquery()


def _numero_operacion(op=InventoryOperation):
    """'TRL-0012' o 'AJU-0012' (el id con al menos 4 cifras, como padStart de las pantallas); sin prefijo para los demás
    tipos."""
    texto = cast(op.id, String)
    prefijo = case(*((op.operation_type == tipo, valor) for tipo, valor in PREFIJOS_OPERACION.items()), else_="")
    return prefijo + func.lpad(texto, func.greatest(4, func.length(texto)), "0")


def _estados_de_operacion(valor) -> list:
    """Los estados del CSV (leer_lista), cada uno de ESTADOS_OPERACION (D46). 422 con más de 20, con un carácter de
    control o con un estado que no existe: «El estado «x» no existe en las operaciones de inventario.» (recortado a 40)."""
    try:
        lista = leer_lista(valor)
    except ValueError as e:
        raise HTTPException(422, str(e))
    for estado in lista:
        if estado not in ESTADOS_OPERACION:
            raise HTTPException(422, f"El estado «{estado:.40}» no existe en las operaciones de inventario.")
    return lista


def _ordenes_operacion() -> dict:
    """Las órdenes permitidas de leer_orden (D34): id (el de hoy es -id), fecha (la del primer movimiento; sin fecha al
    final), status (su lugar en el flujo), origen y destino (el nombre de la bodega; sin bodega al final)."""
    op = InventoryOperation
    return {"id": op.id, "fecha": _fecha_operacion(), "status": orden_por_lista(op.status, ESTADOS_OPERACION),
            "origen": _nombre_bodega(op.source_warehouse_id), "destino": _nombre_bodega(op.dest_warehouse_id)}


MENSAJE_ID_OPERACION = "El id de la operación debe ser un número entero positivo."
_MAX_ID_OPERACION = 2 ** 31 - 1   # inventory_operations.id es Integer


def _id_de_operacion(valor) -> Optional[int]:
    """B4 T24 (F74-b): el parámetro id de /operations (el enlace ?id= de Compras › Traslados), validado a mano (R21): None si
    no vino o está en blanco; un entero entre 1 y 2**31-1 (sin espacios en los bordes); cualquier otra cosa, 422
    MENSAJE_ID_OPERACION."""
    if valor is None or not valor.strip():
        return None
    texto = valor.strip()
    if not texto.isascii() or not texto.isdigit() or not 0 < int(texto) <= _MAX_ID_OPERACION:
        raise HTTPException(422, MENSAJE_ID_OPERACION)
    return int(texto)


@router.get("/operations")
def list_inventory_operations(
        operation_type: Optional[str] = None,
        warehouse_id: Optional[int] = None,
        id: Optional[str] = None,
        q: Optional[str] = None,
        search: Optional[str] = None,
        status: Optional[str] = None,
        direccion: Optional[str] = None,
        orden: Optional[str] = None,
        con_conteos: bool = False,
        limit: int = Query(100, ge=0, le=200),
        offset: int = Query(0, ge=0, le=MAX_OFFSET),
        db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    """Las operaciones de inventario (Traslados y Ajustes de Compras e Inventario). operation_type y warehouse_id filtran
    como hoy. B4 T13 (TABLA-compras 5):
    - q (search es su alias, RP8): el número TRL-0000 o AJU-0000, el id, las notas, source_document_numero y
      tracking_number.
    - status: CSV de DRAFT, READY, DONE y CANCELLED (filtrar_por_estados).
    - direccion: entrada | salida, la del primer movimiento (RP96: ADJUST_OUT es salida).
    - orden: [-]id (por defecto -id, el de hoy), fecha, status, origen o destino; desempate id desc.
    - con_conteos -> conteos = {todos, DRAFT, READY, DONE, CANCELLED}, con la búsqueda, operation_type y warehouse_id,
      sin status ni direccion (R5).
    - limit = Query(100, ge=0, le=200) (0 = solo el total) y offset hasta MAX_OFFSET.
    Cada fila suma «fecha» = MIN(InventoryMovement.created_at) con Z (la tabla no tiene created_at). Sin los parámetros
    nuevos la respuesta es la de hoy más esa clave."""
    like = _busqueda_de_lista(q, search)
    id_exacto = _id_de_operacion(id)
    operation_type = _sin_caracteres_de_control(operation_type)  # B4 T24 (FINAL-m7): un NUL daba 500; ahora 422 (D46)
    estados = _estados_de_operacion(status)
    sentido = _parametro_de_lista(_sin_caracteres_de_control(direccion), tuple(DIRECCIONES_OPERACION),
                                  MENSAJE_DIRECCION)
    orden_sql = leer_orden(orden, _ordenes_operacion(), "-id", id_lista=InventoryOperation.id)

    op = InventoryOperation
    base = db.query(op)
    if operation_type:
        base = base.filter(op.operation_type == operation_type)
    if warehouse_id:
        base = base.filter((op.source_warehouse_id == warehouse_id) | (op.dest_warehouse_id == warehouse_id))
    if id_exacto is not None:
        base = base.filter(op.id == id_exacto)
    if like:
        # B4 T24 (B34): sin cast(op.id, String): el número de la operación (TRL-0012) siempre contiene el id.
        base = base.filter(or_(_numero_operacion().ilike(like), op.notas.ilike(like),
                               op.source_document_numero.ilike(like), op.tracking_number.ilike(like)))
    filtrado = filtrar_por_estados(base, op.status, estados)
    if sentido:
        filtrado = filtrado.filter(_primera_direccion().in_(DIRECCIONES_OPERACION[sentido]))

    conteos = None
    if con_conteos:
        conteos = contar_por_vista(base, {"todos": None, **{e: op.status == e for e in ESTADOS_OPERACION}})
    total, operations = paginar(filtrado.order_by(*orden_sql), limit, offset)
    fechas = {}
    if operations:
        fechas = dict(db.query(InventoryMovement.operation_id, func.min(InventoryMovement.created_at))
                      .filter(InventoryMovement.operation_id.in_([o.id for o in operations]))
                      .group_by(InventoryMovement.operation_id).all())
    return respuesta_de_lista(total, [_operacion_dict(o, fechas.get(o.id)) for o in operations], conteos=conteos)

from app.models.crm import Alert
import datetime

@router.get("/calendar")
def get_inventory_calendar(db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    alerts = db.query(Alert).filter(Alert.alert_type == "INVENTORY_TRACKING").all()
    
    # Group by date (YYYY-MM-DD)
    calendar_dict = {}
    for alert in alerts:
        date_str = alert.due_date.strftime("%Y-%m-%d")
        if date_str not in calendar_dict:
            calendar_dict[date_str] = []
        # Return dict representation
        calendar_dict[date_str].append({
            "id": alert.id,
            "alert_type": alert.alert_type,
            "reference_id": alert.reference_id,
            "message": alert.message,
            "due_date": alert.due_date.isoformat(),
            "is_resolved": alert.is_resolved
        })
        
    response_data = [{"date": k, "alerts": v} for k, v in calendar_dict.items()]
    return {"status": "success", "data": response_data}
