# TD-03 Parte 1: Autenticación de catálogo + tabla `product_web_listings` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sentar las bases para consolidar los dos catálogos de producto (`products`/`product_skus` canónico vs `ecommerce_products` raw-SQL) sin cambiar ningún comportamiento de lectura/escritura todavía: proteger el catálogo canónico con autenticación, crear un hogar canónico para los campos de marketing/SEO que hoy solo existen en `ecommerce_products`, y copiar (backfill) esos datos ahí. El cutover de lectura y el apagado de `ecommerce_products` son partes 2 y 3, planeadas por separado.

**Architecture:** Trabajo puramente aditivo y de bajo riesgo: (1) reaplicar en `catalog.py` la misma autenticación por rol que ya se probó en la Fase A (rama `security-hotfix-fase-a`, sin fusionar aún — esta rama es independiente y necesita su propia copia del fix), (2) una tabla nueva `product_web_listings` (1:1 con `product_skus` vía FK única) creada por migración Alembic, con su modelo ORM, y (3) un script de backfill idempotente que empareja por SKU exacto y reporta (sin crear productos nuevos) los huérfanos. Ningún endpoint existente cambia su fuente de lectura en este plan — eso es la Parte 2.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, psycopg2 (para el script de backfill, seat según el patrón ya usado en `backend/scripts/backfill_fase1b.py`), pytest.

**Spec:** `docs/audit/2026-09-17-fase-c-investigacion.md`, sección 3 (TD-03) — basado en la investigación de código real que confirmó el bug reproducible de "Manipulación de precios detectada" causado por desincronización entre los dos catálogos.

## Global Constraints

- Rama de trabajo: `consolidacion-td03-parte1-catalogo`, creada desde `main` (independiente de `security-hotfix-fase-a`, `cleanup-fase-b-dead-code` y de la rama de TD-05).
- No modificar `ecommerce_products` ni ninguno de sus endpoints en este plan — se mantienen exactamente como están. Este plan solo agrega, nunca quita ni redirige.
- No modificar `_ensure_ecommerce_tables()`, `GET /ecommerce/catalogo`, ni `create_web_order` — esos cambios son la Parte 2 (cutover de lectura), fuera de alcance aquí.
- El script de backfill (Task 3) **nunca crea `Product`/`ProductSKU` nuevos** — solo copia hacia `product_web_listings` cuando ya existe un `ProductSKU.sku` que coincide exactamente. Los huérfanos se reportan, no se resuelven automáticamente.
- Si al fusionar esta rama a `main` ya existe otra migración de la Fase C fusionada con `down_revision = "fa6_004"` (por ejemplo TD-05), actualizar el `down_revision` de la migración de este plan para apuntar a la nueva cabeza real (confirmar con `alembic heads`) y volver a correr los tests antes de fusionar.

---

### Task 1: Autenticación en el catálogo canónico (reaplicar SEC-03)

**Files:**
- Modify: `backend/app/api/v1/catalog.py`
- Test: `backend/tests/test_catalog_auth.py`

**Interfaces:**
- Consumes: `require_roles`, `ALL_ERP_ROLES` de `app.api.dependencies` (ya existen, usados igual en Fase A).
- Produces: todas las rutas de `catalog.py` exigen un usuario autenticado con alguno de `ALL_ERP_ROLES`. Las Tasks 2 y 3 no dependen de esto directamente, pero es prerequisito conceptual antes de construir más funcionalidad sobre este catálogo (ver Spec).

- [ ] **Step 1: Escribir los tests que fallan primero**

Crear `backend/tests/test_catalog_auth.py`:

```python
import uuid


def test_list_brands_requires_auth(app_client):
    resp = app_client.get("/api/v1/brands")
    assert resp.status_code == 401


def test_create_brand_requires_auth(app_client):
    resp = app_client.post("/api/v1/brands", json={"name": "Unauthorized Brand"})
    assert resp.status_code == 401


def test_create_brand_with_valid_token_succeeds(app_client, admin_token):
    resp = app_client.post(
        "/api/v1/brands",
        json={"name": f"AuthorizedBrand-{uuid.uuid4().hex[:6]}"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201


def test_list_products_requires_auth(app_client):
    resp = app_client.get("/api/v1/products")
    assert resp.status_code == 401


def test_create_sku_requires_auth(app_client, product):
    resp = app_client.post(
        f"/api/v1/products/{product.id}/skus",
        json={"sku": "X-1", "cost_price": 1, "sale_price": 2},
    )
    assert resp.status_code == 401
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `pytest tests/test_catalog_auth.py -v`
Expected: los 4 tests que esperan 401 FALLAN (hoy devuelven 200/201, sin auth); `test_create_brand_with_valid_token_succeeds` pasa igual (201 con o sin auth, porque no rechaza tokens válidos).

- [ ] **Step 3: Agregar autenticación a todas las rutas de `catalog.py`**

En `backend/app/api/v1/catalog.py`, agregar el import y el `Depends` a cada una de las 11 rutas:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from app.db.database import get_db
from app.models.catalog import Brand, Category, Product, ProductSKU, Attribute, AttributeValue
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
def list_products(brand_id: Optional[int] = None, category_id: Optional[int] = None, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    query = db.query(Product)
    if brand_id:
        query = query.filter(Product.brand_id == brand_id)
    if category_id:
        query = query.filter(Product.category_id == category_id)

    products = query.all()
    return {"status": "success", "data": [schemas.ProductResponse.model_validate(p).model_dump() for p in products]}

@router.post("/products/{product_id}/skus", status_code=status.HTTP_201_CREATED)
def create_sku(product_id: int, sku: schemas.SKUCreate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")

    attr_values = []
    if sku.attribute_value_ids:
        attr_values = db.query(AttributeValue).filter(AttributeValue.id.in_(sku.attribute_value_ids)).all()
        if len(attr_values) != len(sku.attribute_value_ids):
            raise HTTPException(status_code=400, detail="One or more attribute values are invalid")

    sku_data = sku.model_dump(exclude={"attribute_value_ids"})
    db_sku = ProductSKU(**sku_data, product_id=product_id)
    db_sku.attribute_values.extend(attr_values)

    try:
        db.add(db_sku)
        db.commit()
        db.refresh(db_sku)
        return {"status": "success", "data": schemas.SKUResponse.model_validate(db_sku).model_dump()}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="SKU code or barcode already exists")
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `pytest tests/test_catalog_auth.py -v`
Expected: PASS (los 5 tests).

- [ ] **Step 5: Correr la suite completa para descartar regresiones**

Run: `pytest tests/ -v`
Expected: revisar cualquier test existente que llamara `/api/v1/brands`, `/api/v1/categories`, `/api/v1/attributes` o `/api/v1/products` sin token — si alguno falla por esto, agregarle `headers={"Authorization": f"Bearer {admin_token}"}` (mismo patrón usado en Fase A).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/catalog.py backend/tests/test_catalog_auth.py
git commit -m "feat(td-03): reaplicar autenticacion por rol en catalog.py (SEC-03)"
```

---

### Task 2: Tabla `product_web_listings` (hogar canónico para campos de marketing/SEO)

**Files:**
- Create: `backend/alembic/versions/fa6_010_product_web_listings.py`
- Modify: `backend/app/models/catalog.py`
- Test: `backend/tests/test_product_web_listing_model.py`

**Interfaces:**
- Consumes: `ProductSKU` (de `app.models.catalog`, ya existente).
- Produces: `app.models.catalog.ProductWebListing` — usado por Task 3 (backfill) y por la Parte 2 (cutover de lectura, plan futuro) para leer los campos de marketing/SEO.

- [ ] **Step 1: Escribir el test que falla primero**

Crear `backend/tests/test_product_web_listing_model.py`:

```python
from app.models.catalog import ProductWebListing


def test_create_and_read_web_listing(db, sku):
    listing = ProductWebListing(
        sku_id=sku.id,
        descripcion_larga="Descripcion larga de prueba",
        precio_comparacion=150000,
        descuento_pct=15,
        imagenes=["http://example.com/1.jpg", "http://example.com/2.jpg"],
        seo_titulo="Titulo SEO de prueba",
        publicado_web=True,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)

    assert listing.id is not None
    assert listing.sku.id == sku.id
    assert sku.web_listing.id == listing.id
    assert listing.imagenes == ["http://example.com/1.jpg", "http://example.com/2.jpg"]
    assert listing.rastrear_inventario is True  # default


def test_web_listing_unique_per_sku(db, sku):
    db.add(ProductWebListing(sku_id=sku.id))
    db.commit()

    db.add(ProductWebListing(sku_id=sku.id))
    import pytest
    from sqlalchemy.exc import IntegrityError
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `pytest tests/test_product_web_listing_model.py -v`
Expected: FALLA con `ImportError: cannot import name 'ProductWebListing'` (el modelo no existe todavía).

- [ ] **Step 3: Escribir la migración**

Crear `backend/alembic/versions/fa6_010_product_web_listings.py`:

```python
"""
fa6_010 - TD-03 (Parte 1): tabla product_web_listings

Hogar canonico para los campos de marketing/SEO que hoy solo existen en
la tabla raw-SQL ecommerce_products (imagenes, descripcion larga, SEO,
descuentos, etc.). Paso previo al cutover de lectura (Parte 2) y al
apagado de ecommerce_products (Parte 3) -- ver
docs/audit/2026-09-17-fase-c-investigacion.md seccion 3.

Crea: product_web_listings

Revision ID: fa6_010
Revises: fa6_004
Create Date: 2026-09-17
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_010"
down_revision: Union[str, Sequence[str], None] = "fa6_004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "product_web_listings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sku_id", sa.Integer(), sa.ForeignKey("product_skus.id", ondelete="CASCADE"), nullable=False),
        sa.Column("descripcion_larga", sa.Text(), nullable=True),
        sa.Column("precio_comparacion", sa.Numeric(14, 2), nullable=True),
        sa.Column("descuento_pct", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("imagenes", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("seo_titulo", sa.String(300), nullable=True),
        sa.Column("seo_descripcion", sa.Text(), nullable=True),
        sa.Column("seo_keywords", sa.Text(), nullable=True),
        sa.Column("codigo_aduana", sa.String(100), nullable=True),
        sa.Column("peso_kg", sa.Numeric(8, 2), nullable=True),
        sa.Column("notas_internas", sa.Text(), nullable=True),
        sa.Column("publicado_web", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("rastrear_inventario", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_pwl_sku_id", "product_web_listings", ["sku_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_pwl_sku_id", table_name="product_web_listings")
    op.drop_table("product_web_listings")
```

- [ ] **Step 4: Agregar el modelo ORM**

En `backend/app/models/catalog.py`, cambiar la línea de import (línea 1) de:

```python
from sqlalchemy import Column, Integer, String, Boolean, Numeric, ForeignKey, Table
```

a:

```python
from sqlalchemy import Column, Integer, String, Boolean, Numeric, ForeignKey, Table, Text, JSON, DateTime
from sqlalchemy.sql import func
```

Agregar `web_listing = relationship("ProductWebListing", back_populates="sku", uselist=False)` a la clase `ProductSKU` existente (junto a las demás relationships, después de `quotation_lines`), y agregar al final del archivo:

```python
class ProductWebListing(Base):
    __tablename__ = "product_web_listings"
    id = Column(Integer, primary_key=True, index=True)
    sku_id = Column(Integer, ForeignKey("product_skus.id", ondelete="CASCADE"), nullable=False, unique=True)
    descripcion_larga = Column(Text)
    precio_comparacion = Column(Numeric(14, 2))
    descuento_pct = Column(Numeric(5, 2), nullable=False, default=0)
    imagenes = Column(JSON, nullable=False, default=list)
    seo_titulo = Column(String(300))
    seo_descripcion = Column(Text)
    seo_keywords = Column(Text)
    codigo_aduana = Column(String(100))
    peso_kg = Column(Numeric(8, 2))
    notas_internas = Column(Text)
    publicado_web = Column(Boolean, nullable=False, default=False)
    rastrear_inventario = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

    sku = relationship("ProductSKU", back_populates="web_listing")
```

- [ ] **Step 5: Correr el test y confirmar que pasa**

Run: `pytest tests/test_product_web_listing_model.py -v`
Expected: PASS (la fixture `setup_test_db` aplica `fa6_010` automáticamente).

- [ ] **Step 6: Correr la suite completa**

Run: `pytest tests/ -v`
Expected: sin fallas nuevas (tabla y modelo nuevos, nada existente los referencia todavía).

- [ ] **Step 7: Commit**

```bash
git add backend/alembic/versions/fa6_010_product_web_listings.py backend/app/models/catalog.py backend/tests/test_product_web_listing_model.py
git commit -m "feat(td-03): crear tabla product_web_listings y modelo ORM"
```

---

### Task 3: Script de backfill (copiar datos de `ecommerce_products` → `product_web_listings`)

**Files:**
- Create: `backend/scripts/backfill_product_web_listings.py`
- Test: `backend/tests/test_td03_backfill_product_web_listings.py`

**Interfaces:**
- Consumes: tabla `product_web_listings` (Task 2), tabla `ecommerce_products` (ya existente).
- Produces: filas en `product_web_listings` para cada SKU de `ecommerce_products` que coincide exactamente con un `ProductSKU.sku` real. No produce nada que otra tarea de este plan consuma — es el último paso.

- [ ] **Step 1: Escribir los tests que fallan primero**

Crear `backend/tests/test_td03_backfill_product_web_listings.py`:

```python
import json
from sqlalchemy import text


def test_backfill_copies_matched_sku(db, sku):
    db.execute(text("""
        INSERT INTO ecommerce_products (nombre, sku, descripcion_larga, precio_comparacion, descuento_pct, imagenes, seo_titulo, publicado_web, rastrear_inventario)
        VALUES ('Producto Test', :sku, 'Descripcion larga de prueba', 99000, 10, CAST(:imagenes AS jsonb), 'SEO Test', TRUE, TRUE)
    """), {"sku": sku.sku, "imagenes": json.dumps(["http://example.com/1.jpg"])})
    db.commit()

    from scripts.backfill_product_web_listings import backfill, get_conn
    conn = get_conn()
    try:
        result = backfill(conn, dry_run=False)
    finally:
        conn.close()

    assert sku.sku not in result["orphaned"]
    row = db.execute(text(
        "SELECT descripcion_larga, seo_titulo, publicado_web FROM product_web_listings WHERE sku_id = :id"
    ), {"id": sku.id}).fetchone()
    assert row is not None
    assert row[0] == "Descripcion larga de prueba"
    assert row[1] == "SEO Test"
    assert row[2] is True


def test_backfill_reports_orphan_without_creating_product(db):
    db.execute(text("""
        INSERT INTO ecommerce_products (nombre, sku, publicado_web)
        VALUES ('Producto Huerfano', 'SKU-NO-EXISTE-999', TRUE)
    """))
    db.commit()

    from scripts.backfill_product_web_listings import backfill, get_conn
    conn = get_conn()
    try:
        result = backfill(conn, dry_run=False)
    finally:
        conn.close()

    assert "SKU-NO-EXISTE-999" in result["orphaned"]
    count = db.execute(text(
        "SELECT COUNT(*) FROM product_web_listings pwl JOIN product_skus s ON pwl.sku_id = s.id "
        "WHERE s.sku = 'SKU-NO-EXISTE-999'"
    )).scalar()
    assert count == 0


def test_backfill_dry_run_does_not_write(db, sku):
    db.execute(text("""
        INSERT INTO ecommerce_products (nombre, sku, publicado_web)
        VALUES ('Producto Dry Run', :sku, TRUE)
    """), {"sku": sku.sku})
    db.commit()

    from scripts.backfill_product_web_listings import backfill, get_conn
    conn = get_conn()
    try:
        backfill(conn, dry_run=True)
    finally:
        conn.close()

    count = db.execute(text(
        "SELECT COUNT(*) FROM product_web_listings WHERE sku_id = :id"
    ), {"id": sku.id}).scalar()
    assert count == 0


def test_backfill_is_idempotent(db, sku):
    db.execute(text("""
        INSERT INTO ecommerce_products (nombre, sku, seo_titulo, publicado_web)
        VALUES ('Producto Repetido', :sku, 'Titulo Original', TRUE)
    """), {"sku": sku.sku})
    db.commit()

    from scripts.backfill_product_web_listings import backfill, get_conn
    conn = get_conn()
    try:
        backfill(conn, dry_run=False)
        backfill(conn, dry_run=False)  # segunda corrida, no debe duplicar ni fallar
    finally:
        conn.close()

    count = db.execute(text(
        "SELECT COUNT(*) FROM product_web_listings WHERE sku_id = :id"
    ), {"id": sku.id}).scalar()
    assert count == 1
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `pytest tests/test_td03_backfill_product_web_listings.py -v`
Expected: FALLA con `ModuleNotFoundError: No module named 'scripts.backfill_product_web_listings'`.

- [ ] **Step 3: Escribir el script de backfill**

Crear `backend/scripts/backfill_product_web_listings.py` (mismo patrón de conexión que `backend/scripts/backfill_fase1b.py`, ya existente en el proyecto):

```python
"""
backfill_product_web_listings.py -- TD-03 (Parte 1)

Copia los campos de marketing/SEO de ecommerce_products hacia
product_web_listings, emparejando por SKU exacto.

Modos:
  --dry-run : muestra estadisticas sin escribir nada

Filas de ecommerce_products sin sku o con un sku que no existe en
product_skus se reportan como huerfanas y se omiten -- requieren
decision humana (crear el producto faltante o descartarlas). Este
script NUNCA crea productos ni SKUs nuevos.

Idempotente: usa ON CONFLICT (sku_id) DO NOTHING, se puede
re-ejecutar sin duplicar filas.
"""
import os, sys, json, argparse, logging

try:
    import psycopg2
except ImportError:
    sys.exit("ERROR: psycopg2 no instalado. Ejecutar: pip install psycopg2-binary")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("backfill_pwl")


def get_conn():
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("ERROR: Ninguna variable DATABASE_URL o TEST_DATABASE_URL definida.")
    return psycopg2.connect(url)


def backfill(conn, dry_run: bool = False) -> dict:
    cur = conn.cursor()
    cur.execute("""
        SELECT sku, descripcion_larga, precio_comparacion, descuento_pct, imagenes,
               seo_titulo, seo_descripcion, seo_keywords, codigo_aduana, peso_kg,
               notas_internas, publicado_web, rastrear_inventario
        FROM ecommerce_products WHERE sku IS NOT NULL AND sku != ''
    """)
    rows = cur.fetchall()

    matched = 0
    orphaned = []
    for r in rows:
        sku_code = r[0]
        cur.execute("SELECT id FROM product_skus WHERE sku = %s", (sku_code,))
        sku_row = cur.fetchone()
        if not sku_row:
            orphaned.append(sku_code)
            continue

        matched += 1
        if not dry_run:
            cur.execute("""
                INSERT INTO product_web_listings
                    (sku_id, descripcion_larga, precio_comparacion, descuento_pct, imagenes,
                     seo_titulo, seo_descripcion, seo_keywords, codigo_aduana, peso_kg,
                     notas_internas, publicado_web, rastrear_inventario)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (sku_id) DO NOTHING
            """, (
                sku_row[0], r[1], r[2], r[3], json.dumps(r[4] or []),
                r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12],
            ))

    if not dry_run:
        conn.commit()
    cur.close()
    return {"matched": matched, "orphaned": orphaned}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = get_conn()
    try:
        result = backfill(conn, dry_run=args.dry_run)
        log.info(f"Emparejados: {result['matched']}")
        log.info(f"Huerfanos (sin SKU valido en product_skus, omitidos): {len(result['orphaned'])}")
        if result["orphaned"]:
            log.info(f"SKUs huerfanos: {result['orphaned']}")
        if args.dry_run:
            log.info("DRY RUN -- no se escribio nada.")
    finally:
        conn.close()
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `pytest tests/test_td03_backfill_product_web_listings.py -v`
Expected: PASS (los 4 tests).

- [ ] **Step 5: Correr la suite completa**

Run: `pytest tests/ -v`
Expected: sin fallas nuevas.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/backfill_product_web_listings.py backend/tests/test_td03_backfill_product_web_listings.py
git commit -m "feat(td-03): script de backfill hacia product_web_listings"
```

---

## Al completar todas las tareas

**Antes de desplegar esta migración a producción**, `REQUIRED_ALEMBIC_VERSION` debe
actualizarse en lockstep — de lo contrario `preflight.py` aborta el arranque del
backend (exit code 2) por desajuste. Orden obligatorio:
1. Actualizar `REQUIRED_ALEMBIC_VERSION=fa6_010` en la configuración de producción.
2. Ejecutar `alembic upgrade head` contra la base de datos de producción.
3. Reiniciar el backend.
4. Solo entonces, ejecutar el backfill (paso siguiente).

Seguir **superpowers:finishing-a-development-branch**. Antes de considerar la Parte 1 realmente cerrada en producción: correr `python scripts/backfill_product_web_listings.py --dry-run` contra staging/producción real y revisar la lista de huérfanos con el usuario antes de decidir si se ejecuta sin `--dry-run` ahí.

**Qué sigue (fuera de este plan, a planear después):**
- **Parte 2**: cutover de lectura con feature flag — repuntar `GET /ecommerce/catalogo`, `GET /ecommerce/catalogo/{id}` y `GET /ecommerce/categorias` a leer de `ProductSKU` + `ProductWebListing` en vez de `ecommerce_products`, preservando el mismo contrato JSON de salida para no romper `frontend/src/app/store/**`.
- **Parte 3**: doble-escritura en `POST/PATCH/DELETE /ecommerce/catalogo`, período de observación en producción, y solo entonces apagar `ecommerce_products` (`DROP TABLE` + retirar `_ensure_ecommerce_tables()`).
