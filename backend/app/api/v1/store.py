from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.database import get_db
from app.models.catalog import Product, ProductSKU
from app.models.inventory import InventoryLevel, Warehouse
from app.models.customers import Customer
from app.models.sales import SalesOrder, SalesOrderLine
from app.schemas import store as schemas
from typing import List

router = APIRouter()

@router.get("/products", response_model=dict)
def get_public_products(db: Session = Depends(get_db)):
    # Find central warehouse (or any warehouse where we allow public sales)
    # For this MVP, we just get any stock > 0
    
    active_products = db.query(Product).filter(Product.is_active == True).all()
    
    store_products = []
    
    for product in active_products:
        skus_with_stock = []
        for sku in product.skus:
            # Calculate total available stock for this SKU
            total_stock = sum(level.quantity for level in sku.inventory_levels)
            
            if total_stock > 0:
                # Format attributes
                attributes_data = []
                for attr_val in sku.attribute_values:
                    attributes_data.append({
                        "attribute": attr_val.attribute.name,
                        "value": attr_val.value
                    })
                
                skus_with_stock.append(schemas.StoreSKU(
                    id=sku.id,
                    sku=sku.sku,
                    sale_price=sku.sale_price,
                    inventory_available=total_stock,
                    attributes=attributes_data
                ))
        
        # Only include product if it has at least one SKU with stock
        if skus_with_stock:
            images = [img.image_url_hd for img in product.images]
            
            store_products.append(schemas.StoreProductResponse(
                id=product.id,
                name=product.name,
                description=product.description,
                brand_name=product.brand.name if product.brand else "",
                category_name=product.category.name if product.category else "",
                images=images,
                skus=skus_with_stock
            ))
            
    return {"status": "success", "data": [p.model_dump() for p in store_products]}

@router.post("/checkout", status_code=status.HTTP_201_CREATED)
def checkout(request: schemas.CheckoutRequest, db: Session = Depends(get_db)):
    if not request.cart:
        raise HTTPException(status_code=400, detail="Cart is empty")
        
    # 1. Find or create Customer
    customer = db.query(Customer).filter(Customer.email == request.customer.email).first()
    if not customer:
        customer = Customer(
            first_name=request.customer.first_name,
            last_name=request.customer.last_name,
            email=request.customer.email,
            phone=request.customer.phone
        )
        db.add(customer)
        db.commit()
        db.refresh(customer)
        
    # 2. Create SalesOrder (PENDING)
    sales_order = SalesOrder(
        customer_id=customer.id,
        user_id=None, # Public checkout doesn't have an internal user
        status="PENDING"
    )
    db.add(sales_order)
    db.commit()
    db.refresh(sales_order)
    
    # 3. Process Cart Items (Create Lines and Deduct Stock)
    from decimal import Decimal
    total_order_cop = Decimal("0.0")
    order_items_processed = []

    for item in request.cart:
        sku = db.query(ProductSKU).filter(ProductSKU.id == item.sku_id).first()
        if not sku:
            raise HTTPException(status_code=400, detail=f"SKU {item.sku_id} not found")
            
        qty_to_deduct = item.quantity
        for level in sku.inventory_levels:
            if qty_to_deduct <= 0:
                break
            if level.quantity > 0:
                deduct = min(level.quantity, qty_to_deduct)
                level.quantity -= deduct
                qty_to_deduct -= deduct
                
        if qty_to_deduct > 0:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Not enough stock for SKU {sku.sku}")
            
        line_price = Decimal(str(sku.sale_price or 0.0))
        order_line = SalesOrderLine(
            sales_order_id=sales_order.id,
            sku_id=sku.id,
            quantity=item.quantity,
            unit_price=float(line_price)
        )
        db.add(order_line)
        total_order_cop += (line_price * Decimal(str(item.quantity)))
        order_items_processed.append((sku, item.quantity, line_price))
        
    # 4. Fase 6: Dual-write to canonical SaleOrder with canal_venta='WEB'
    try:
        from app.models.erp_documents import SaleOrder
        from app.models.fase1b import SaleOrderLineErp
        from app.services.legacy_consolidation import record_legacy_audit_log
        from sqlalchemy import text
        import datetime

        year = datetime.datetime.utcnow().year
        next_num = db.execute(text("SELECT COALESCE(MAX(id), 0) + 1 FROM sale_orders")).scalar() or 1
        canonical_so = SaleOrder(
            numero=f"VEN-WEB-{year}-{next_num:04d}",
            customer_id=customer.id,
            customer_name=f"{customer.first_name} {customer.last_name or ''}".strip(),
            customer_phone=customer.phone,
            customer_email=customer.email,
            canal_venta="WEB",
            estado="PENDIENTE_COMPRA",
            total_cop=total_order_cop,
            subtotal_cop=total_order_cop,
            anticipo_cop=Decimal("0.0"),
            saldo_cop=total_order_cop,
            notas=f"Pedido ecommerce originado desde checkout publico (SalesOrder #{sales_order.id})"
        )
        db.add(canonical_so)
        db.flush()

        sales_order.canonical_sale_order_id = canonical_so.id

        for sku_obj, qty_val, prc_val in order_items_processed:
            prod_title = sku_obj.product.name if sku_obj.product else f"SKU {sku_obj.sku}"
            can_line = SaleOrderLineErp(
                so_id=canonical_so.id,
                sku_id=sku_obj.id,
                description=prod_title,
                quantity=Decimal(str(qty_val)),
                unit_price_cop=prc_val,
                modalidad="POR_PEDIDO",
                owner="NEBULAE",
                price_unit_cop_snapshot=prc_val,
                estado="PENDIENTE"
            )
            db.add(can_line)

        record_legacy_audit_log(
            db=db,
            event_type="LEGACY_WRITE_INTERCEPTED",
            legacy_endpoint="/api/v1/store/checkout",
            http_method="POST",
            entity_type="SALES_ORDER",
            legacy_id=sales_order.id,
            canonical_id=canonical_so.id,
            discrepancy_details={"total_cop": float(total_order_cop), "items_count": len(order_items_processed)},
            status="ALIGNED",
            user_id=None
        )
    except Exception as e:
        # Non-fatal to keep checkout functioning
        pass

    db.commit()
    
    return {"status": "success", "message": "Order created successfully", "order_id": sales_order.id}
