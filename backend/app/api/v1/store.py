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
    for item in request.cart:
        sku = db.query(ProductSKU).filter(ProductSKU.id == item.sku_id).first()
        if not sku:
            raise HTTPException(status_code=400, detail=f"SKU {item.sku_id} not found")
            
        # Deduct stock (simple FIFO or random warehouse deduction for MVP)
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
            
        # Create SalesOrderLine
        order_line = SalesOrderLine(
            sales_order_id=sales_order.id,
            sku_id=sku.id,
            quantity=item.quantity,
            unit_price=sku.sale_price or 0.0
        )
        db.add(order_line)
        
    db.commit()
    
    return {"status": "success", "message": "Order created successfully", "order_id": sales_order.id}
