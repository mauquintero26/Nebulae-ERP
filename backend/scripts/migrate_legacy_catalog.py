"""
Migra productos de ecommerce_products (legacy) al catalogo canonico
(Product/ProductSKU/ProductWebListing/Category/Brand).

Uso manual: python -m scripts.migrate_legacy_catalog
Idempotente: usa Product.legacy_ecommerce_product_id para no duplicar
en re-ejecuciones.
"""
import json
import sys
import pathlib
from sqlalchemy import text
from sqlalchemy.orm import Session

_BACKEND = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(_BACKEND))

from app.models.catalog import Brand, Category, Product, ProductSKU, ProductWebListing
from app.models.inventory import Warehouse, InventoryLevel


def _resolver_o_crear_categoria(db: Session, nombre: str, parent_id: int | None) -> Category | None:
    """Busca una categoria existente por nombre (case-insensitive).

    Si el nombre ya existe pero bajo un padre distinto al solicitado, el dato
    legacy es ambiguo (categoria/sub_categoria de texto libre puede repetir
    el mismo nombre bajo dos jerarquias distintas -- ej. "Accesorios" bajo
    "Ropa" y bajo "Electronica"). En ese caso NO se reutiliza (asignaria el
    producto a la jerarquia equivocada) ni se crea un duplicado (Category.name
    es unico). Se devuelve None para que el llamador marque el producto para
    revision manual en vez de adivinar.
    """
    if not nombre or not nombre.strip():
        return None
    existente = db.query(Category).filter(Category.name.ilike(nombre.strip())).first()
    if existente:
        if existente.parent_id == parent_id:
            return existente
        return None
    nueva = Category(name=nombre.strip(), parent_id=parent_id)
    db.add(nueva)
    db.flush()
    return nueva


def _resolver_o_crear_marca(db: Session, nombre: str) -> Brand:
    nombre = (nombre or "Sin Marca").strip() or "Sin Marca"
    existente = db.query(Brand).filter(Brand.name.ilike(nombre)).first()
    if existente:
        return existente
    nueva = Brand(name=nombre)
    db.add(nueva)
    db.flush()
    return nueva


def _bodega_por_defecto(db: Session) -> Warehouse:
    bodega = db.query(Warehouse).first()
    if bodega:
        return bodega
    bodega = Warehouse(name="Bodega Principal", location_type="Central")
    db.add(bodega)
    db.flush()
    return bodega


def _tiene_variantes_reales(variantes_raw) -> bool:
    if not variantes_raw:
        return False
    if isinstance(variantes_raw, str):
        try:
            variantes_raw = json.loads(variantes_raw)
        except (json.JSONDecodeError, TypeError):
            return bool(variantes_raw.strip())
    if isinstance(variantes_raw, list):
        return len(variantes_raw) > 0
    if isinstance(variantes_raw, dict):
        return len(variantes_raw) > 0
    return False


def run_migration(db: Session) -> dict:
    filas = db.execute(text("""
        SELECT id, nombre, descripcion, sku, precio_venta, categoria, sub_categoria,
               marca, stock_disponible, variantes
        FROM ecommerce_products
    """)).fetchall()

    migrados = 0
    saltados = 0
    errores = []

    for fila in filas:
        try:
            ya_existe = db.query(Product).filter(Product.legacy_ecommerce_product_id == fila.id).first()
            if ya_existe:
                saltados += 1
                continue

            # Se rastrea si alguna resolucion de categoria/sub_categoria fue
            # ambigua (mismo nombre, padre distinto al esperado) para forzar
            # necesita_revision aunque las variantes esten vacias.
            categoria_ambigua = False

            categoria_padre = _resolver_o_crear_categoria(db, fila.categoria, None)
            if categoria_padre is None and fila.categoria and fila.categoria.strip():
                categoria_ambigua = True

            categoria_final = categoria_padre
            if fila.sub_categoria and categoria_padre:
                categoria_final = _resolver_o_crear_categoria(db, fila.sub_categoria, categoria_padre.id)
                if categoria_final is None:
                    categoria_ambigua = True

            if categoria_final is None:
                categoria_final = _resolver_o_crear_categoria(db, "Sin Categoria", None)

            marca = _resolver_o_crear_marca(db, fila.marca)

            producto = Product(
                legacy_ecommerce_product_id=fila.id,
                brand_id=marca.id,
                category_id=categoria_final.id,
                name=fila.nombre or f"Producto legacy #{fila.id}",
                description=fila.descripcion,
                type="Fisico",
                base_currency="COP",
                necesita_revision=_tiene_variantes_reales(fila.variantes) or categoria_ambigua,
            )
            db.add(producto)
            db.flush()

            sku = ProductSKU(
                product_id=producto.id,
                sku=fila.sku or f"LEGACY-{fila.id}",
                sale_price=fila.precio_venta or 0,
            )
            db.add(sku)
            db.flush()

            db.add(ProductWebListing(sku_id=sku.id))

            stock = fila.stock_disponible or 0
            if stock > 0:
                bodega = _bodega_por_defecto(db)
                db.add(InventoryLevel(sku_id=sku.id, warehouse_id=bodega.id, quantity=stock))

            # Commit por fila: si una fila posterior falla (ej. sku duplicado,
            # que ecommerce_products nunca exigio unico), el rollback de esa
            # fila no debe deshacer el trabajo ya confirmado de filas previas.
            db.commit()
            migrados += 1
        except Exception as e:
            db.rollback()
            errores.append({"legacy_id": fila.id, "error": str(e)})

    return {"migrados": migrados, "saltados": saltados, "errores": errores}


if __name__ == "__main__":
    import os
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    url = os.environ["DATABASE_URL"]
    engine = create_engine(url)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        resultado = run_migration(session)
        print(
            f"Migracion completa: {resultado['migrados']} migrados, "
            f"{resultado['saltados']} ya existian, {len(resultado['errores'])} con error"
        )
        for err in resultado["errores"]:
            print(f"  ERROR legacy_id={err['legacy_id']}: {err['error']}")
    finally:
        session.close()
