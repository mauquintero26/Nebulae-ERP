from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from app.db.database import get_db
from app.models.catalog import Brand, Category, Product, ProductSKU, Attribute, AttributeValue
from app.models.inventory import Warehouse, InventoryLevel
from app.schemas import catalog as schemas
from app.api.dependencies import require_roles, ALL_ERP_ROLES

router = APIRouter()

# --- BRANDS ---
@router.post("/brands", status_code=status.HTTP_201_CREATED)
def create_brand(brand: schemas.BrandCreate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
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
def list_brands(db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    brands = db.query(Brand).all()
    return {"status": "success", "data": [schemas.BrandResponse.model_validate(b).model_dump() for b in brands]}

# --- CATEGORIES ---
@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_category(category: schemas.CategoryCreate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    # Validate parent_id exists if provided
    if category.parent_id is not None:
        padre = db.query(Category).filter(Category.id == category.parent_id).first()
        if not padre:
            raise HTTPException(status_code=400, detail="La categoria padre indicada no existe")

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
def list_categories(db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    categories = db.query(Category).all()
    return {"status": "success", "data": [schemas.CategoryResponse.model_validate(c).model_dump() for c in categories]}

def _es_descendiente(db: Session, categoria_id: int, posible_ancestro_id: int) -> bool:
    """True si posible_ancestro_id aparece en la cadena de padres de categoria_id (o es el mismo)."""
    actual_id = categoria_id
    visitados = set()
    while actual_id is not None:
        if actual_id == posible_ancestro_id:
            return True
        if actual_id in visitados:
            return False  # ciclo ya existente, no seguir para siempre
        visitados.add(actual_id)
        fila = db.query(Category.parent_id).filter(Category.id == actual_id).first()
        actual_id = fila[0] if fila else None
    return False

@router.put("/categories/{category_id}")
def update_category(category_id: int, body: schemas.CategoryUpdate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    db_category = db.query(Category).filter(Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")

    # Check if parent_id was explicitly provided (including null)
    body_dict = body.model_dump(exclude_unset=True)
    if "parent_id" in body_dict:
        if body.parent_id is not None:
            # Validating non-null parent_id
            if body.parent_id == category_id:
                raise HTTPException(status_code=400, detail="Una categoria no puede ser su propio padre")
            nuevo_padre = db.query(Category).filter(Category.id == body.parent_id).first()
            if not nuevo_padre:
                raise HTTPException(status_code=400, detail="La categoria padre indicada no existe")
            if _es_descendiente(db, body.parent_id, category_id):
                raise HTTPException(status_code=400, detail="Esto crearia un ciclo de categorias")
        # Set parent_id whether it's null or a valid ID (null clears it)
        db_category.parent_id = body.parent_id

    if body.name is not None:
        db_category.name = body.name

    try:
        db.commit()
        db.refresh(db_category)
        return {"status": "success", "data": schemas.CategoryResponse.model_validate(db_category).model_dump()}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Ya existe una categoria con ese nombre")

@router.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    db_category = db.query(Category).filter(Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")

    hijos = db.query(Category).filter(Category.parent_id == category_id).count()
    if hijos > 0:
        raise HTTPException(status_code=409, detail=f"No se puede borrar: tiene {hijos} subcategoria(s)")

    productos = db.query(Product).filter(Product.category_id == category_id).count()
    if productos > 0:
        raise HTTPException(status_code=409, detail=f"No se puede borrar: tiene {productos} producto(s) asociado(s)")

    db.delete(db_category)
    db.commit()
    return {"status": "success"}

# --- ATTRIBUTES ---
@router.post("/attributes", status_code=status.HTTP_201_CREATED)
def create_attribute(attribute: schemas.AttributeCreate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    db_attr = Attribute(**attribute.model_dump())
    db.add(db_attr)
    db.commit()
    db.refresh(db_attr)
    return {"status": "success", "data": schemas.AttributeResponse.model_validate(db_attr).model_dump()}

@router.get("/attributes")
def list_attributes(db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    attrs = db.query(Attribute).all()
    return {"status": "success", "data": [schemas.AttributeResponse.model_validate(a).model_dump() for a in attrs]}

@router.post("/attributes/{attribute_id}/values", status_code=status.HTTP_201_CREATED)
def add_attribute_value(attribute_id: int, value: schemas.AttributeValueCreate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    db_attr = db.query(Attribute).filter(Attribute.id == attribute_id).first()
    if not db_attr:
        raise HTTPException(status_code=404, detail="Attribute not found")

    db_val = AttributeValue(**value.model_dump(), attribute_id=attribute_id)
    db.add(db_val)
    db.commit()
    db.refresh(db_val)
    return {"status": "success", "data": schemas.AttributeValueResponse.model_validate(db_val).model_dump()}

@router.get("/attributes/{attribute_id}/values")
def list_attribute_values(attribute_id: int, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    values = db.query(AttributeValue).filter(AttributeValue.attribute_id == attribute_id).all()
    return {"status": "success", "data": [schemas.AttributeValueResponse.model_validate(v).model_dump() for v in values]}

# --- PRODUCTS & SKUS ---
@router.post("/products", status_code=status.HTTP_201_CREATED)
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
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
def list_products(brand_id: Optional[int] = None, category_id: Optional[int] = None, necesita_revision: Optional[bool] = None, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    query = db.query(Product)
    if brand_id:
        query = query.filter(Product.brand_id == brand_id)
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if necesita_revision is not None:
        query = query.filter(Product.necesita_revision == necesita_revision)

    products = query.all()
    return {"status": "success", "data": [schemas.ProductResponse.model_validate(p).model_dump() for p in products]}

@router.patch("/products/{product_id}")
def update_product(product_id: int, body: schemas.ProductUpdate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")

    body_dict = body.model_dump(exclude_unset=True)

    if "brand_id" in body_dict and body.brand_id is not None:
        if not db.query(Brand).filter(Brand.id == body.brand_id).first():
            raise HTTPException(status_code=400, detail="La marca indicada no existe")
        db_product.brand_id = body.brand_id

    if "category_id" in body_dict and body.category_id is not None:
        if not db.query(Category).filter(Category.id == body.category_id).first():
            raise HTTPException(status_code=400, detail="La categoria indicada no existe")
        db_product.category_id = body.category_id

    for field in ("name", "description", "type", "base_currency", "uom", "is_active", "necesita_revision"):
        if field in body_dict:
            setattr(db_product, field, body_dict[field])

    try:
        db.commit()
        db.refresh(db_product)
        return {"status": "success", "data": schemas.ProductResponse.model_validate(db_product).model_dump()}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="No se pudo actualizar el producto")

@router.post("/products/{product_id}/skus", status_code=status.HTTP_201_CREATED)
def create_sku(product_id: int, sku: schemas.SKUCreate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
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

@router.post("/products/{product_id}/skus/bulk", status_code=status.HTTP_201_CREATED)
def create_skus_bulk(product_id: int, body: schemas.BulkSKUCreate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")

    codigos_en_lote = [item.sku for item in body.skus]
    if len(codigos_en_lote) != len(set(codigos_en_lote)):
        raise HTTPException(status_code=400, detail="Hay codigos de SKU repetidos en el mismo lote")

    warehouse = None
    if body.warehouse_id:
        warehouse = db.query(Warehouse).filter(Warehouse.id == body.warehouse_id).first()
        if not warehouse:
            raise HTTPException(status_code=400, detail="La bodega indicada no existe")

    sku_ids = []
    try:
        for item in body.skus:
            attr_values = []
            for par in item.attributes:
                attr = db.query(Attribute).filter(Attribute.name.ilike(par.attribute_name)).first()
                if not attr:
                    attr = Attribute(name=par.attribute_name)
                    db.add(attr)
                    db.flush()
                val = db.query(AttributeValue).filter(
                    AttributeValue.attribute_id == attr.id, AttributeValue.value.ilike(par.value)
                ).first()
                if not val:
                    val = AttributeValue(attribute_id=attr.id, value=par.value)
                    db.add(val)
                    db.flush()
                attr_values.append(val)

            db_sku = ProductSKU(
                product_id=product_id, sku=item.sku, barcode=item.barcode,
                sale_price=item.sale_price, cost_price=item.cost_price,
            )
            db_sku.attribute_values.extend(attr_values)
            db.add(db_sku)
            db.flush()
            sku_ids.append(db_sku.id)

            if item.initial_stock and item.initial_stock > 0:
                if warehouse is None:
                    warehouse = db.query(Warehouse).first()
                    if warehouse is None:
                        warehouse = Warehouse(name="Bodega Principal", location_type="Central")
                        db.add(warehouse)
                        db.flush()
                db.add(InventoryLevel(sku_id=db_sku.id, warehouse_id=warehouse.id, quantity=item.initial_stock))

        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Uno o mas codigos de SKU o codigos de barras ya existen")

    return {"status": "success", "data": {"created": len(sku_ids), "sku_ids": sku_ids}}
