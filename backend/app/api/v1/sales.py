from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from app.db.database import get_db
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.users import User
from app.schemas import sales as schemas
from app.api.dependencies import RoleChecker

router = APIRouter()

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_sales_order(order: schemas.SalesOrderCreate, db: Session = Depends(get_db), current_user: User = Depends(RoleChecker("sales", require_write=True))):
    order_data = order.model_dump(exclude={"lines"})
    db_order = SalesOrder(**order_data)
    
    for line in order.lines:
        db_line = SalesOrderLine(**line.model_dump())
        db_order.lines.append(db_line)
        
    db.add(db_order)
    try:
        db.commit()
        db.refresh(db_order)
        return {"status": "success", "data": schemas.SalesOrderResponse.model_validate(db_order).model_dump()}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/")
def list_sales_orders(
    q: Optional[str] = Query(None, description="Search by Order ID or Customer ID"),
    offset: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker("sales", require_write=False))
):
    query = db.query(SalesOrder)
    
    if q:
        # Very simple search for MVP
        try:
            q_int = int(q)
            query = query.filter(or_(SalesOrder.id == q_int, SalesOrder.customer_id == q_int))
        except ValueError:
            pass # Ignore string search for now since customer names are in Customer table
            
    total = query.count()
    orders = query.offset(offset).limit(limit).all()
    
    return {
        "status": "success", 
        "data": {
            "total": total,
            "sales": [schemas.SalesOrderResponse.model_validate(o).model_dump() for o in orders]
        }
    }

@router.post("/{order_id}/invoice")
def invoice_sales_order(order_id: int, db: Session = Depends(get_db), current_user: User = Depends(RoleChecker("sales", require_write=True))):
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    if order.status == "INVOICED":
        raise HTTPException(status_code=400, detail="Order is already invoiced")
        
    order.status = "INVOICED"
    db.commit()
    db.refresh(order)
    
    return {"status": "success", "data": schemas.SalesOrderResponse.model_validate(order).model_dump()}
