from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional
from app.db.database import get_db
from app.models.purchases import PurchaseOrder
from app.models.inventory import InventoryOperation, InventoryMovement, InventoryLevel
from app.models.users import User
from app.schemas import purchases as schemas
from app.api.dependencies import RoleChecker

router = APIRouter()

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_purchase_order(order: schemas.PurchaseOrderCreate, db: Session = Depends(get_db), current_user: User = Depends(RoleChecker("purchases", require_write=True))):
    db_order = PurchaseOrder(**order.model_dump())
    db.add(db_order)
    db.commit()
    db.refresh(db_order)
    return {"status": "success", "data": schemas.PurchaseOrderResponse.model_validate(db_order).model_dump()}

@router.get("/")
def list_purchase_orders(
    offset: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker("purchases", require_write=False))
):
    total = db.query(PurchaseOrder).count()
    orders = db.query(PurchaseOrder).offset(offset).limit(limit).all()
    return {
        "status": "success", 
        "data": {
            "total": total,
            "purchases": [schemas.PurchaseOrderResponse.model_validate(o).model_dump() for o in orders]
        }
    }

@router.put("/{order_id}/receive")
def receive_purchase_order(order_id: int, request: schemas.PurchaseReceiveRequest, db: Session = Depends(get_db), current_user: User = Depends(RoleChecker("purchases", require_write=True))):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
        
    if order.status == "RECEIVED":
        raise HTTPException(status_code=400, detail="Order is already received")
        
    # 1. Update status
    order.status = "RECEIVED"
    
    # 2. Create InventoryOperation (RECEIPT)
    op = InventoryOperation(
        dest_warehouse_id=request.dest_warehouse_id,
        operation_type="RECEIPT",
        status="DONE"
    )
    db.add(op)
    db.flush() # get op.id
    
    # 3. Create Movements and update Levels
    for mov_data in request.movements:
        mov = InventoryMovement(
            operation_id=op.id,
            sku_id=mov_data.sku_id,
            quantity=mov_data.quantity
        )
        db.add(mov)
        
        # Update level
        level = db.query(InventoryLevel).filter(
            InventoryLevel.warehouse_id == request.dest_warehouse_id,
            InventoryLevel.sku_id == mov_data.sku_id
        ).first()
        
        if level:
            level.quantity += mov_data.quantity
        else:
            new_level = InventoryLevel(
                warehouse_id=request.dest_warehouse_id,
                sku_id=mov_data.sku_id,
                quantity=mov_data.quantity
            )
            db.add(new_level)
            
    db.commit()
    db.refresh(order)
    
    return {"status": "success", "data": schemas.PurchaseOrderResponse.model_validate(order).model_dump()}
