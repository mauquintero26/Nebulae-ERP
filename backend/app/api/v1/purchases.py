import time
from fastapi import APIRouter, Depends, HTTPException, Query, Response, Header, status
from sqlalchemy.orm import Session
from typing import Optional
from app.db.database import get_db
from app.models.purchases import PurchaseOrder
from app.models.erp_documents import PurchaseOrderFull
from app.models.inventory import InventoryOperation, InventoryMovement, InventoryLevel
from app.models.users import User
from app.schemas import purchases as schemas
from app.api.dependencies import RoleChecker
from app.services.legacy_consolidation import (
    get_or_create_governance_policy,
    apply_deprecation_headers,
    intercept_purchase_order_write,
    record_legacy_audit_log,
)

router = APIRouter()

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_purchase_order(
    order: schemas.PurchaseOrderCreate,
    response: Response,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker("purchases", require_write=True))
):
    policy = get_or_create_governance_policy(db)
    apply_deprecation_headers(response, policy, "/api/v1/compras/pedidos")

    if not policy.allow_legacy_writes or policy.mode == "READ_ONLY":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Legacy purchase order writes are permanently disabled. Use canonical endpoint /api/v1/compras/pedidos."
        )

    try:
        db_po, canonical_po = intercept_purchase_order_write(
            db=db,
            po_data=order.model_dump(),
            user_id=current_user.id,
            idempotency_key=idempotency_key
        )
        if db_po:
            resp_data = schemas.PurchaseOrderResponse.model_validate(db_po).model_dump()
        else:
            resp_data = {
                "id": canonical_po.id,
                "status": canonical_po.estado
            }
        return {"status": "success", "data": resp_data}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/")
def list_purchase_orders(
    response: Response,
    offset: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker("purchases", require_write=False))
):
    t0 = time.time()
    policy = get_or_create_governance_policy(db)
    apply_deprecation_headers(response, policy, "/api/v1/compras/pedidos")

    total = db.query(PurchaseOrder).count()
    orders = db.query(PurchaseOrder).offset(offset).limit(limit).all()
    latency_ms = (time.time() - t0) * 1000.0

    record_legacy_audit_log(
        db=db,
        event_type="LEGACY_READ",
        legacy_endpoint="/api/v1/purchases",
        http_method="GET",
        entity_type="PURCHASE_ORDER",
        actor_user_id=current_user.id,
        latency_ms=latency_ms,
        result_summary=f"LIST_PURCHASE_ORDERS_TOTAL_{total}",
        status="RECORDED"
    )
    db.commit()

    return {
        "status": "success", 
        "data": {
            "total": total,
            "orders": [schemas.PurchaseOrderResponse.model_validate(o).model_dump() for o in orders]
        }
    }

@router.get("/{order_id}")
def get_purchase_order(
    order_id: int,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker("purchases", require_write=False))
):
    t0 = time.time()
    policy = get_or_create_governance_policy(db)
    apply_deprecation_headers(response, policy, "/api/v1/compras/pedidos")

    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    latency_ms = (time.time() - t0) * 1000.0

    record_legacy_audit_log(
        db=db,
        event_type="LEGACY_READ",
        legacy_endpoint=f"/api/v1/purchases/{order_id}",
        http_method="GET",
        entity_type="PURCHASE_ORDER",
        legacy_id=order_id,
        canonical_id=order.canonical_purchase_order_id if order else None,
        actor_user_id=current_user.id,
        latency_ms=latency_ms,
        result_summary="FOUND" if order else "NOT_FOUND",
        status="RECORDED"
    )
    db.commit()

    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    return {"status": "success", "data": schemas.PurchaseOrderResponse.model_validate(order).model_dump()}

@router.post("/{order_id}/receive")
def receive_purchase_order(
    order_id: int,
    request: schemas.PurchaseReceiveRequest,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker("purchases", require_write=True))
):
    policy = get_or_create_governance_policy(db)
    apply_deprecation_headers(response, policy, "/api/v1/compras/pedidos")

    if not policy.allow_legacy_writes or policy.mode == "READ_ONLY":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Legacy purchase order writes are permanently disabled. Use canonical endpoint /api/v1/compras/pedidos."
        )

    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
        
    if order.status == "RECEIVED":
        raise HTTPException(status_code=400, detail="Order is already received")
        
    order.status = "RECEIVED"
    
    # Sincronizar PurchaseOrderFull canonica si existe
    if order.canonical_purchase_order_id:
        can_po = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == order.canonical_purchase_order_id).first()
        if can_po:
            can_po.estado = "RECIBIDA"

    # 2. Create InventoryOperation (RECEIPT)
    op = InventoryOperation(
        dest_warehouse_id=request.dest_warehouse_id,
        operation_type="RECEIPT",
        status="DONE"
    )
    db.add(op)
    db.flush()
    
    # 3. Create Movements and update Levels
    for mov_data in request.movements:
        mov = InventoryMovement(
            operation_id=op.id,
            sku_id=mov_data.sku_id,
            quantity=mov_data.quantity
        )
        db.add(mov)
        
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

    record_legacy_audit_log(
        db=db,
        event_type="LEGACY_WRITE_INTERCEPTED",
        legacy_endpoint=f"/api/v1/purchases/{order_id}/receive",
        http_method="POST",
        entity_type="PURCHASE_ORDER",
        legacy_id=order.id,
        canonical_id=order.canonical_purchase_order_id,
        actor_user_id=current_user.id,
        discrepancy_details={"dest_warehouse_id": request.dest_warehouse_id, "movements_count": len(request.movements)},
        status="ALIGNED"
    )
            
    db.commit()
    db.refresh(order)
    
    return {"status": "success", "data": schemas.PurchaseOrderResponse.model_validate(order).model_dump()}
