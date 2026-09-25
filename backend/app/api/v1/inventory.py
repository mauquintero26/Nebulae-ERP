import datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.inventory import ShippingMethod, InventoryOperation, InventoryMovement, InventoryLevel
from app.schemas import inventory as schemas
from app.api.dependencies import require_roles, ALL_ERP_ROLES
from app.models.users import User

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
    warehouses = db.query(Warehouse).all()
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
        return {"status": "success", "data": schemas.InventoryOperationResponse.model_validate(db_op).model_dump()}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/operations")
def list_inventory_operations(
        operation_type: Optional[str] = None,
        warehouse_id: Optional[int] = None,
        limit: int = 100,
        offset: int = 0,
        db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    q = db.query(InventoryOperation)
    if operation_type:
        q = q.filter(InventoryOperation.operation_type == operation_type)
    if warehouse_id:
        q = q.filter(
            (InventoryOperation.source_warehouse_id == warehouse_id) |
            (InventoryOperation.dest_warehouse_id == warehouse_id)
        )
    total = q.count()
    operations = q.order_by(InventoryOperation.id.desc()).offset(offset).limit(limit).all()
    return {
        "status": "success",
        "total": total,
        "data": [schemas.InventoryOperationResponse.model_validate(o).model_dump() for o in operations],
    }

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
