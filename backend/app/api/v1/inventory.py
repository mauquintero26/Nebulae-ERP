from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.inventory import ShippingMethod, InventoryOperation, InventoryMovement
from app.schemas import inventory as schemas

router = APIRouter()

@router.post("/shipping-methods", status_code=status.HTTP_201_CREATED)
def create_shipping_method(method: schemas.ShippingMethodCreate, db: Session = Depends(get_db)):
    db_method = ShippingMethod(**method.model_dump())
    db.add(db_method)
    db.commit()
    db.refresh(db_method)
    return {"status": "success", "data": schemas.ShippingMethodResponse.model_validate(db_method).model_dump()}

@router.get("/shipping-methods")
def list_shipping_methods(db: Session = Depends(get_db)):
    methods = db.query(ShippingMethod).all()
    return {"status": "success", "data": [schemas.ShippingMethodResponse.model_validate(m).model_dump() for m in methods]}

from app.models.inventory import Warehouse

@router.post("/warehouses", status_code=status.HTTP_201_CREATED)
def create_warehouse(warehouse: schemas.WarehouseCreate, db: Session = Depends(get_db)):
    db_warehouse = Warehouse(**warehouse.model_dump())
    db.add(db_warehouse)
    db.commit()
    db.refresh(db_warehouse)
    return {"status": "success", "data": schemas.WarehouseResponse.model_validate(db_warehouse).model_dump()}

@router.get("/warehouses")
def list_warehouses(db: Session = Depends(get_db)):
    warehouses = db.query(Warehouse).all()
    return {"status": "success", "data": [schemas.WarehouseResponse.model_validate(w).model_dump() for w in warehouses]}

@router.post("/operations", status_code=status.HTTP_201_CREATED)
def create_inventory_operation(op: schemas.InventoryOperationCreate, db: Session = Depends(get_db)):
    op_data = op.model_dump(exclude={"movements"})
    db_op = InventoryOperation(**op_data)
    
    for mov in op.movements:
        db_mov = InventoryMovement(**mov.model_dump())
        db_op.movements.append(db_mov)
        
    db.add(db_op)
    try:
        db.commit()
        db.refresh(db_op)
        return {"status": "success", "data": schemas.InventoryOperationResponse.model_validate(db_op).model_dump()}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
        
@router.get("/operations")
def list_inventory_operations(db: Session = Depends(get_db)):
    operations = db.query(InventoryOperation).all()
    return {"status": "success", "data": [schemas.InventoryOperationResponse.model_validate(o).model_dump() for o in operations]}
    
from app.models.crm import Alert
import datetime

@router.get("/calendar")
def get_inventory_calendar(db: Session = Depends(get_db)):
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
