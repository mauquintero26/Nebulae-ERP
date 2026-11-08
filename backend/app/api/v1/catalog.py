import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import column, exists, or_, select, table, text
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from app.db.database import get_db
from app.models.catalog import Brand, Category, Product, ProductSKU, ProductWebListing, Attribute, AttributeValue
from app.models.inventory import Warehouse, InventoryLevel
from app.schemas import catalog as schemas
from app.api.dependencies import require_roles, ALL_ERP_ROLES
from app.core.iva import normalizar_tarifa_iva
# B4 T13 (TABLA-inventario 2): la bandera de lectura de TD-03 (ecommerce._lectura_canonica), los parámetros de lista de
# core/listados.py y el validador de la búsqueda de T6B (erp_ventas.py), que se importa, no se copia. Ni ecommerce ni
# erp_ventas importan este módulo, así que no hay ciclo.
from app.api.v1.ecommerce import _lectura_canonica
from app.api.v1.erp_ventas import _busqueda_de_lista
from app.core.listados import MAX_OFFSET, leer_orden, paginar, respuesta as respuesta_de_lista

router = APIRouter()
logger = logging.getLogger(__name__)
# B3 T20 (M8, M18): el 400 de create_product cuando el guardado falla, sin str(e) (que trae el SQL y sus parametros).
MENSAJE_NO_SE_PUDO_CREAR = "No se pudo crear el producto. Revisa los datos e intenta de nuevo."


def _tarifa_iva_del_body(valor):
    """IVA-PRODUCTO (C8/R12): la tarifa normalizada, o 422 con el mensaje en espanol (el esquema no la valida)."""
    try:
        return normalizar_tarifa_iva(valor)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


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
_PLACEHOLDER_BRAND_CATEGORY_NAME = "Sin clasificar"

def _get_or_create_placeholder_brand_category(db: Session):
    """Same fallback used by /crm/products/quick-create: brand_id/category_id
    are NOT NULL on products, so a client that has no brands/categories to
    offer yet (e.g. a fresh catalog) gets a real, reusable placeholder row
    instead of a 422/400, and the product is flagged necesita_revision=True
    to be classified properly later."""
    brand = db.query(Brand).filter(Brand.name == _PLACEHOLDER_BRAND_CATEGORY_NAME).first()
    if not brand:
        brand = Brand(name=_PLACEHOLDER_BRAND_CATEGORY_NAME)
        db.add(brand); db.flush()
    category = db.query(Category).filter(Category.name == _PLACEHOLDER_BRAND_CATEGORY_NAME).first()
    if not category:
        category = Category(name=_PLACEHOLDER_BRAND_CATEGORY_NAME)
        db.add(category); db.flush()
    return brand, category

@router.post("/products", status_code=status.HTTP_201_CREATED)
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    data = product.model_dump()
    data["tarifa_iva"] = _tarifa_iva_del_body(data.get("tarifa_iva"))  # antes de crear nada (la marca placeholder)
    # B3 T20 (M8, M18): como update_product, la marca y la categoria que vienen tienen que existir (400 en espanol),
    # tambien antes de crear la marca placeholder.
    if data.get("brand_id") and not db.query(Brand.id).filter(Brand.id == data["brand_id"]).first():
        raise HTTPException(status_code=400, detail="La marca indicada no existe")
    if data.get("category_id") and not db.query(Category.id).filter(Category.id == data["category_id"]).first():
        raise HTTPException(status_code=400, detail="La categoria indicada no existe")
    needs_review = False
    if not data.get("brand_id") or not data.get("category_id"):
        brand, category = _get_or_create_placeholder_brand_category(db)
        if not data.get("brand_id"):
            data["brand_id"] = brand.id
            needs_review = True
        if not data.get("category_id"):
            data["category_id"] = category.id
            needs_review = True
    if needs_review:
        data["necesita_revision"] = True
    db_product = Product(**data)
    db.add(db_product)
    try:
        db.commit()
        db.refresh(db_product)
        return {"status": "success", "data": schemas.ProductResponse.model_validate(db_product).model_dump()}
    except Exception as e:
        db.rollback()
        # B3 T20 (M8, M18): solo el tipo del error en el registro; nunca str(e) en la respuesta (SQL y parametros).
        logger.warning("No se pudo crear el producto (%s)", type(e).__name__)
        raise HTTPException(status_code=400, detail=MENSAJE_NO_SE_PUDO_CREAR)

# --- B4 T13 (TABLA-inventario 2; R5, R21; RP8, RP9, RP47, RP48, RP49, RP91, D34): la lista de productos ---
LIMITE_PRODUCTOS_POR_DEFECTO = 50     # con offset y sin limit (la tabla estándar pide 25 o 50)
MAX_LIMITE_PRODUCTOS = 200
ORDEN_PRODUCTOS_POR_DEFECTO = "nombre"
MENSAJE_LIMITE_PRODUCTOS = "El límite de la página debe estar entre 0 y 200."
MENSAJE_PRODUCTO = "El producto «{}» no existe."
# El catálogo legacy de TD-03: una tabla de SQL crudo (sin modelo) que ecommerce.py crea al primer uso.
_ECOMMERCE_PRODUCTS = table("ecommerce_products", column("sku"), column("publicado_web"))


def _ordenes_productos() -> dict:
    """Las órdenes permitidas de leer_orden (D34): nombre, creado (el id: products no tiene created_at) y tipo."""
    return {"nombre": Product.name, "creado": Product.id, "tipo": Product.type}


def _productos_publicados(db: Session, ids) -> set:
    """Los ids de `ids` con algún SKU publicado, según la bandera de TD-03 (RP91, ecommerce._lectura_canonica()):
    canónico -> algún ProductWebListing.publicado_web verdadero; legacy -> algún ecommerce_products.publicado_web de sus SKU
    (por el código del SKU; si la tabla todavía no existe, ninguno). Una consulta para toda la lista (legacy: dos)."""
    if not ids:
        return set()
    if _lectura_canonica():
        consulta = (select(ProductSKU.product_id).join(ProductWebListing, ProductWebListing.sku_id == ProductSKU.id)
                    .where(ProductSKU.product_id.in_(ids), ProductWebListing.publicado_web.is_(True)))
    else:
        if db.execute(text("SELECT to_regclass('ecommerce_products')")).scalar() is None:
            return set()
        legacy = _ECOMMERCE_PRODUCTS
        consulta = (select(ProductSKU.product_id).join(legacy, legacy.c.sku == ProductSKU.sku)
                    .where(ProductSKU.product_id.in_(ids), legacy.c.publicado_web.is_(True)))
    return set(db.execute(consulta.distinct()).scalars())


def _producto_dict(p, publicados: set) -> dict:
    """ProductResponse (como hoy) + precio_venta (el menor sale_price de sus SKU), costo (el menor cost_price no nulo) y
    publicado (RP91). Los SKU son los que ya carga ProductResponse: no hay una consulta más por producto."""
    fila = schemas.ProductResponse.model_validate(p).model_dump()
    precios = [s.sale_price for s in p.skus if s.sale_price is not None]
    costos = [s.cost_price for s in p.skus if s.cost_price is not None]
    fila.update(precio_venta=min(precios) if precios else None, costo=min(costos) if costos else None,
                publicado=p.id in publicados)
    return fila


@router.get("/products")
def list_products(brand_id: Optional[int] = None, category_id: Optional[int] = None, necesita_revision: Optional[bool] = None,
                  q: Optional[str] = None, search: Optional[str] = None, id: Optional[int] = None,
                  sin_tarifa_iva: Optional[bool] = None, orden: Optional[str] = None, limit: Optional[int] = None,
                  offset: Optional[int] = Query(None, ge=0, le=MAX_OFFSET),
                  db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    """Los productos del catálogo. brand_id, category_id y necesita_revision filtran como hoy. B4 T13 (TABLA-inventario 2):
    - q (search es su alias, RP8): el nombre, la descripción o el código de alguno de sus SKU.
    - id (RP49): solo ese producto (si no existe, 422). sin_tarifa_iva (RP48): true = sin tarifa de IVA (tarifa_iva IS
      NULL, la regla de sinTarifaIva de lib/iva.js); false = con tarifa.
    - orden: [-]nombre | creado | tipo (leer_orden; desempate id desc). Sin orden ni offset no se ordena, como hoy.
    - Pagina SOLO con offset (RP47): entonces responde {status, total, data}, con limit de 0 a 200 validado a mano (422,
      R21; sin limit, 50) y orden por nombre si no viene otro. Sin offset devuelve TODO, como hoy, aunque llegue limit
      (los selectores y las pantallas que mandan limit=300).
    Cada producto suma precio_venta, costo y publicado (_producto_dict, RP91)."""
    like = _busqueda_de_lista(q, search)
    paginada = offset is not None
    limite = None
    if paginada:
        limite = LIMITE_PRODUCTOS_POR_DEFECTO if limit is None else limit
        if not 0 <= limite <= MAX_LIMITE_PRODUCTOS:
            raise HTTPException(status_code=422, detail=MENSAJE_LIMITE_PRODUCTOS)
    orden_sql = None
    if orden is not None or paginada:
        orden_sql = leer_orden(orden, _ordenes_productos(), ORDEN_PRODUCTOS_POR_DEFECTO, id_lista=Product.id)
    if id is not None and db.get(Product, id) is None:
        raise HTTPException(status_code=422, detail=MENSAJE_PRODUCTO.format(id))

    query = db.query(Product)
    if id is not None:
        query = query.filter(Product.id == id)
    if brand_id:
        query = query.filter(Product.brand_id == brand_id)
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if necesita_revision is not None:
        query = query.filter(Product.necesita_revision == necesita_revision)
    if sin_tarifa_iva is not None:
        query = query.filter(Product.tarifa_iva.is_(None) if sin_tarifa_iva else Product.tarifa_iva.isnot(None))
    if like:
        query = query.filter(or_(Product.name.ilike(like), Product.description.ilike(like),
                                 exists().where(ProductSKU.product_id == Product.id, ProductSKU.sku.ilike(like))))
    if orden_sql:
        query = query.order_by(*orden_sql)

    if paginada:
        total, products = paginar(query, limite, offset)
    else:
        products = query.all()
    publicados = _productos_publicados(db, [p.id for p in products])
    data = [_producto_dict(p, publicados) for p in products]
    if paginada:
        return respuesta_de_lista(total, data)
    return {"status": "success", "data": data}

@router.patch("/products/{product_id}")
def update_product(product_id: int, body: schemas.ProductUpdate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")

    body_dict = body.model_dump(exclude_unset=True)
    if "tarifa_iva" in body_dict:  # antes de tocar el producto: con 422 no cambia nada
        body_dict["tarifa_iva"] = _tarifa_iva_del_body(body_dict["tarifa_iva"])

    if "brand_id" in body_dict and body.brand_id is not None:
        if not db.query(Brand).filter(Brand.id == body.brand_id).first():
            raise HTTPException(status_code=400, detail="La marca indicada no existe")
        db_product.brand_id = body.brand_id

    if "category_id" in body_dict and body.category_id is not None:
        if not db.query(Category).filter(Category.id == body.category_id).first():
            raise HTTPException(status_code=400, detail="La categoria indicada no existe")
        db_product.category_id = body.category_id

    for field in ("name", "description", "type", "base_currency", "uom", "is_active", "necesita_revision",
                  "tarifa_iva"):
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
