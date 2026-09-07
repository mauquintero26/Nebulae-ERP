from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from app.db.database import get_db
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.erp_documents import SaleOrder
from app.models.users import User
from app.schemas import sales as schemas
from app.api.dependencies import RoleChecker
from app.services.legacy_consolidation import (
    get_or_create_governance_policy,
    apply_deprecation_headers,
    intercept_sales_order_write,
    record_legacy_audit_log,
)

router = APIRouter()

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_sales_order(
    order: schemas.SalesOrderCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker("sales", require_write=True))
):
    policy = get_or_create_governance_policy(db)
    apply_deprecation_headers(response, policy, "/api/v1/ventas/pedidos")

    if not policy.allow_legacy_writes:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Legacy sales order writes are permanently disabled. Use canonical endpoint /api/v1/ventas/pedidos."
        )

    order_data = order.model_dump(exclude={"lines"})
    lines_data = [line.model_dump() for line in order.lines]
    
    try:
        db_order, canonical_so = intercept_sales_order_write(
            db=db,
            order_data=order_data,
            lines_data=lines_data,
            user_id=current_user.id
        )
        return {"status": "success", "data": schemas.SalesOrderResponse.model_validate(db_order).model_dump()}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/")
def list_sales_orders(
    response: Response,
    q: Optional[str] = Query(None, description="Search by Order ID or Customer ID"),
    offset: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker("sales", require_write=False))
):
    policy = get_or_create_governance_policy(db)
    apply_deprecation_headers(response, policy, "/api/v1/ventas/pedidos")

    query = db.query(SalesOrder)
    
    if q:
        try:
            q_int = int(q)
            query = query.filter(or_(SalesOrder.id == q_int, SalesOrder.customer_id == q_int))
        except ValueError:
            pass
            
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
def invoice_sales_order(
    order_id: int,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker("sales", require_write=True))
):
    policy = get_or_create_governance_policy(db)
    apply_deprecation_headers(response, policy, "/api/v1/ventas/pedidos")

    if not policy.allow_legacy_writes:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Legacy sales order writes are permanently disabled. Use canonical endpoint /api/v1/ventas/pedidos."
        )

    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    if order.status == "INVOICED":
        raise HTTPException(status_code=400, detail="Order is already invoiced")
        
    order.status = "INVOICED"
    
    # Sincronizar hacia orden canonica si existe vinculada
    if order.canonical_sale_order_id:
        canonical_so = db.query(SaleOrder).filter(SaleOrder.id == order.canonical_sale_order_id).first()
        if canonical_so and canonical_so.estado != "FACTURADO":
            canonical_so.estado = "FACTURADO"

    record_legacy_audit_log(
        db=db,
        event_type="LEGACY_WRITE_INTERCEPTED",
        legacy_endpoint=f"/api/v1/sales/{order_id}/invoice",
        http_method="POST",
        entity_type="SALES_ORDER",
        legacy_id=order.id,
        canonical_id=order.canonical_sale_order_id,
        discrepancy_details={"new_status": "INVOICED"},
        status="ALIGNED",
        user_id=current_user.id
    )

    db.commit()
    db.refresh(order)
    
    return {"status": "success", "data": schemas.SalesOrderResponse.model_validate(order).model_dump()}
