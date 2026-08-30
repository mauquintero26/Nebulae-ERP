from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from app.db.database import get_db
from app.models.catalog import Brand, Category, Product, ProductSKU, Attribute, AttributeValue
from app.schemas import catalog as schemas

router = APIRouter()

# --- BRANDS ---
@router.post("/brands", status_code=status.HTTP_201_CREATED)
def create_brand(brand: schemas.BrandCreate, db: Session = Depends(get_db)):
    db_brand = Brand(**brand.model_dump())
    try:
        db.add(db_brand)
        db.commit()
        db.refresh(db_brand)
        return {"status": "success", "data": schemas.BrandResponse.model_validate(db_brand).model_dump()}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Brand already exists")

@router.get("/brands")
def list_brands(db: Session = Depends(get_db)):
    brands = db.query(Brand).all()
    return {"status": "success", "data": [schemas.BrandResponse.model_validate(b).model_dump() for b in brands]}

# --- CATEGORIES ---
@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_category(category: schemas.CategoryCreate, db: Session = Depends(get_db)):
    db_category = Category(**category.model_dump())
    try:
        db.add(db_category)
        db.commit()
        db.refresh(db_category)
        return {"status": "success", "data": schemas.CategoryResponse.model_validate(db_category).model_dump()}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Category already exists")

@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    categories = db.query(Category).all()
    return {"status": "success", "data": [schemas.CategoryResponse.model_validate(c).model_dump() for c in categories]}

# --- ATTRIBUTES ---
@router.post("/attributes", status_code=status.HTTP_201_CREATED)
def create_attribute(attribute: schemas.AttributeCreate, db: Session = Depends(get_db)):
    db_attr = Attribute(**attribute.model_dump())
    db.add(db_attr)
    db.commit()
    db.refresh(db_attr)
    return {"status": "success", "data": schemas.AttributeResponse.model_validate(db_attr).model_dump()}

@router.get("/attributes")
def list_attributes(db: Session = Depends(get_db)):
    attrs = db.query(Attribute).all()
    return {"status": "success", "data": [schemas.AttributeResponse.model_validate(a).model_dump() for a in attrs]}

@router.post("/attributes/{attribute_id}/values", status_code=status.HTTP_201_CREATED)
def add_attribute_value(attribute_id: int, value: schemas.AttributeValueCreate, db: Session = Depends(get_db)):
    db_attr = db.query(Attribute).filter(Attribute.id == attribute_id).first()
    if not db_attr:
        raise HTTPException(status_code=404, detail="Attribute not found")
    
    db_val = AttributeValue(**value.model_dump(), attribute_id=attribute_id)
    db.add(db_val)
    db.commit()
    db.refresh(db_val)
    return {"status": "success", "data": schemas.AttributeValueResponse.model_validate(db_val).model_dump()}

@router.get("/attributes/{attribute_id}/values")
def list_attribute_values(attribute_id: int, db: Session = Depends(get_db)):
    values = db.query(AttributeValue).filter(AttributeValue.attribute_id == attribute_id).all()
    return {"status": "success", "data": [schemas.AttributeValueResponse.model_validate(v).model_dump() for v in values]}

# --- PRODUCTS & SKUS ---
@router.post("/products", status_code=status.HTTP_201_CREATED)
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db)):
    db_product = Product(**product.model_dump())
    db.add(db_product)
    try:
        db.commit()
        db.refresh(db_product)
        return {"status": "success", "data": schemas.ProductResponse.model_validate(db_product).model_dump()}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/products")
def list_products(brand_id: Optional[int] = None, category_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Product)
    if brand_id:
        query = query.filter(Product.brand_id == brand_id)
    if category_id:
        query = query.filter(Product.category_id == category_id)
    
    products = query.all()
    return {"status": "success", "data": [schemas.ProductResponse.model_validate(p).model_dump() for p in products]}

@router.post("/products/{product_id}/skus", status_code=status.HTTP_201_CREATED)
def create_sku(product_id: int, sku: schemas.SKUCreate, db: Session = Depends(get_db)):
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    # Get the Attribute Values to link
    attr_values = []
    if sku.attribute_value_ids:
        attr_values = db.query(AttributeValue).filter(AttributeValue.id.in_(sku.attribute_value_ids)).all()
        if len(attr_values) != len(sku.attribute_value_ids):
            raise HTTPException(status_code=400, detail="One or more attribute values are invalid")
    
    sku_data = sku.model_dump(exclude={"attribute_value_ids"})
    db_sku = ProductSKU(**sku_data, product_id=product_id)
    
    # Associate dynamic attributes
    db_sku.attribute_values.extend(attr_values)
    
    try:
        db.add(db_sku)
        db.commit()
        db.refresh(db_sku)
        return {"status": "success", "data": schemas.SKUResponse.model_validate(db_sku).model_dump()}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="SKU code or barcode already exists")
