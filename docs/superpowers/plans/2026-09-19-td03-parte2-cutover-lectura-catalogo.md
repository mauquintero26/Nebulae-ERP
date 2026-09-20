# TD-03 Parte 2 — Cutover de Lectura del Catálogo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que `GET /ecommerce/catalogo`, `GET /ecommerce/catalogo/{id}` y `GET /ecommerce/categorias` puedan leer del catálogo canónico (`Product`/`ProductSKU`/`Category`/`Brand` + `ProductWebListing`) en vez de `ecommerce_products`, activable con una variable de entorno, sin romper el contrato JSON que consume `frontend/src/app/store/**`.

**Architecture:** Cada uno de los 3 endpoints gana una rama temprana `if _lectura_canonica(): return <función nueva>` que deja el código legacy exactamente como está debajo. Las funciones nuevas arman la respuesta desde `ProductSKU`+`Product`+`Category`/`Brand`+`ProductWebListing` (con defaults cuando no hay listing todavía) y agregan como fallback los huérfanos de `ecommerce_products` (filas sin `ProductSKU` coincidente), usando un `id` negativo para esos huérfanos y así no colisionar con `ProductSKU.id`.

**Tech Stack:** FastAPI, SQLAlchemy (ORM + `text()` para el fallback de huérfanos), Alembic, pytest, `fastapi.testclient.TestClient` (fixture `app_client` ya existente).

**Spec:** `docs/superpowers/specs/2026-09-19-td03-parte2-cutover-lectura-catalogo-design.md`

## Global Constraints

- Alcance: solo estos 3 endpoints GET en `backend/app/api/v1/ecommerce.py`. No tocar `create_web_order`, `_get_authorized_ecommerce_warehouses`, `_ensure_ecommerce_tables`, ni los endpoints de escritura del catálogo (`POST/PATCH/DELETE /catalogo`). No tocar frontend.
- Flag: variable de entorno `CATALOGO_LECTURA`, leída con `os.environ.get("CATALOGO_LECTURA", "legacy")` en cada request (nunca cacheada a nivel de módulo). Solo `"canonico"` activa la ruta nueva; cualquier otro valor o ausencia usa el código legacy sin ningún cambio de comportamiento.
- El código legacy de cada endpoint debe quedar byte-por-byte intacto debajo de la rama del flag — la única edición al código legacy es insertar el `if _lectura_canonica(): return ...` al inicio.
- Huérfanos (fila de `ecommerce_products` sin `ProductSKU.sku` coincidente, incluyendo `sku` NULL) usan `id = -ecommerce_products.id` (negativo) para no colisionar con un `ProductSKU.id` real. `GET /catalogo/{id}`: `product_id > 0` → buscar por `ProductSKU.id`; `product_id < 0` → buscar por `ecommerce_products.id == -product_id`.
- Cuando un `ProductSKU` no tiene fila en `ProductWebListing` todavía, los defaults son: `descuento_pct=0`, `impuesto_pct=0`, `publicado_web=True`, `rastrear_inventario=True`, `alerta_stock_minimo=5`, `sub_categoria=""`, `imagenes=[]`, `variantes=[]`, `precio_comparacion=` mismo valor que `precio_venta`, `seo_titulo=` nombre del producto. El filtro `publicado=True` en `GET /catalogo` y el filtro de `GET /categorias` deben tratar "sin listing" como `publicado_web=True` (no excluir).
- **Lección aplicada de Parte 1 (hallazgo Crítico C-1 del review final):** toda migración nueva agregada en este plan debe sumarse al mismo allowlist de heads válidos usado en `test_z_fase3_migrations.py` y `test_z_fase4_migrations.py` — en Parte 1 se nos olvidó hacer esto con `fa6_010` y fue el hallazgo más grave del review final. Es parte de la Tarea 1, no un paso opcional.
- Cualquier test que inserte filas directamente en `ecommerce_products` vía `db.execute(text("INSERT ..."))` debe usar un `sku`/valor único (`uuid.uuid4().hex[:8]`) y borrar la fila explícitamente en un `finally` — la tabla `db.execute(text(...))` no pasa por el mecanismo de limpieza automática de la fixture `db` (que solo rastrea objetos ORM agregados con `db.add()`). Esta regla evita repetir el incidente de contaminación de la suite completa descubierto durante el review final de Parte 1.

---

### Task 1: Migración + modelo — 5 columnas nuevas en `product_web_listings`

**Files:**
- Create: `backend/alembic/versions/fa6_011_product_web_listings_campos_parte2.py`
- Modify: `backend/app/models/catalog.py:101-103` (clase `ProductWebListing`)
- Modify: `backend/tests/test_z_fase3_migrations.py:244`
- Modify: `backend/tests/test_z_fase4_migrations.py:173`
- Test: `backend/tests/test_td03_parte2_schema_nuevos_campos.py`

**Interfaces:**
- Consumes: `ProductWebListing` (de `app.models.catalog`, ya existente desde Parte 1), fixtures `db`/`sku` (de `tests/conftest.py`, ya existentes).
- Produces: `ProductWebListing.impuesto_pct` (`Numeric(5,2)`), `.sub_categoria` (`String(200)`, nullable), `.variantes` (`JSON`, default `[]`), `.alerta_stock_minimo` (`Integer`, default `5`), `.created_by` (`String(150)`, nullable) — usados por Task 2 (backfill) y Tasks 3-5 (lectura unificada).

- [ ] **Step 1: Escribir el test que falla primero**

```python
# backend/tests/test_td03_parte2_schema_nuevos_campos.py
from decimal import Decimal
from app.models.catalog import ProductWebListing


def test_product_web_listing_nuevos_campos_defaults(db, sku):
    listing = ProductWebListing(sku_id=sku.id)
    db.add(listing)
    db.commit()
    db.refresh(listing)
    assert listing.impuesto_pct == Decimal("0")
    assert listing.sub_categoria is None
    assert listing.variantes == []
    assert listing.alerta_stock_minimo == 5
    assert listing.created_by is None


def test_product_web_listing_nuevos_campos_explicitos(db, sku):
    listing = ProductWebListing(
        sku_id=sku.id,
        impuesto_pct=Decimal("19.00"),
        sub_categoria="Camisetas",
        variantes=[{"talla": "M", "color": "Azul"}],
        alerta_stock_minimo=10,
        created_by="admin@nebulae.test",
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    assert listing.impuesto_pct == Decimal("19.00")
    assert listing.sub_categoria == "Camisetas"
    assert listing.variantes == [{"talla": "M", "color": "Azul"}]
    assert listing.alerta_stock_minimo == 10
    assert listing.created_by == "admin@nebulae.test"
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `cd backend && python -m pytest tests/test_td03_parte2_schema_nuevos_campos.py -v`
Expected: FAIL — `TypeError: 'impuesto_pct' is an invalid keyword argument for ProductWebListing` (las columnas todavía no existen en el modelo).

- [ ] **Step 3: Crear la migración**

```python
# backend/alembic/versions/fa6_011_product_web_listings_campos_parte2.py
"""
fa6_011 - TD-03 (Parte 2): campos huerfanos en product_web_listings

Agrega a product_web_listings los 5 campos de ecommerce_products que el
review final de Parte 1 (hallazgo I-3) identifico sin hogar canonico:
impuesto_pct, sub_categoria, variantes, alerta_stock_minimo, created_by.
Paso previo al cutover de lectura -- ver
docs/superpowers/specs/2026-09-19-td03-parte2-cutover-lectura-catalogo-design.md
seccion 4.

Revision ID: fa6_011
Revises: fa6_010
Create Date: 2026-09-19
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_011"
down_revision: Union[str, Sequence[str], None] = "fa6_010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("product_web_listings", sa.Column("impuesto_pct", sa.Numeric(5, 2), nullable=False, server_default="0"))
    op.add_column("product_web_listings", sa.Column("sub_categoria", sa.String(200), nullable=True))
    op.add_column("product_web_listings", sa.Column("variantes", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("product_web_listings", sa.Column("alerta_stock_minimo", sa.Integer(), nullable=False, server_default="5"))
    op.add_column("product_web_listings", sa.Column("created_by", sa.String(150), nullable=True))


def downgrade() -> None:
    op.drop_column("product_web_listings", "created_by")
    op.drop_column("product_web_listings", "alerta_stock_minimo")
    op.drop_column("product_web_listings", "variantes")
    op.drop_column("product_web_listings", "sub_categoria")
    op.drop_column("product_web_listings", "impuesto_pct")
```

- [ ] **Step 4: Actualizar el modelo ORM**

En `backend/app/models/catalog.py`, dentro de la clase `ProductWebListing`, reemplazar:

```python
    rastrear_inventario = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())
```

por:

```python
    rastrear_inventario = Column(Boolean, nullable=False, default=True)
    impuesto_pct = Column(Numeric(5, 2), nullable=False, default=0)
    sub_categoria = Column(String(200))
    variantes = Column(JSON, nullable=False, default=list)
    alerta_stock_minimo = Column(Integer, nullable=False, default=5)
    created_by = Column(String(150))
    created_at = Column(DateTime, server_default=func.now())
```

(`Integer`, `Numeric`, `String`, `JSON` ya están importados al inicio del archivo — no hace falta agregar imports.)

- [ ] **Step 5: Aplicar la migración y correr el test**

Run: `cd backend && ALEMBIC_ENV=testing python -m alembic upgrade head && python -m pytest tests/test_td03_parte2_schema_nuevos_campos.py -v`
Expected: PASS — 2 passed.

- [ ] **Step 6: Actualizar el allowlist de heads válidos (lección de Parte 1, hallazgo C-1)**

En `backend/tests/test_z_fase3_migrations.py:244`, reemplazar:

```python
            assert v_final in ("fa3_002", "fa4_001", "fa4_002", "fa5_001", "fa5_002", "fa6_001", "fa6_002", "fa6_003", "fa6_004", "fa6_010"), f"Versión final esperada fa3_002 o posterior, obtenida {v_final}"
```

por:

```python
            assert v_final in ("fa3_002", "fa4_001", "fa4_002", "fa5_001", "fa5_002", "fa6_001", "fa6_002", "fa6_003", "fa6_004", "fa6_010", "fa6_011"), f"Versión final esperada fa3_002 o posterior, obtenida {v_final}"
```

En `backend/tests/test_z_fase4_migrations.py:173`, reemplazar:

```python
            assert v_up in ("fa4_002", "fa5_001", "fa5_002", "fa6_001", "fa6_002", "fa6_003", "fa6_004", "fa6_010"), f"Versión esperada fa4_002 o posterior, obtenida {v_up}"
```

por:

```python
            assert v_up in ("fa4_002", "fa5_001", "fa5_002", "fa6_001", "fa6_002", "fa6_003", "fa6_004", "fa6_010", "fa6_011"), f"Versión esperada fa4_002 o posterior, obtenida {v_up}"
```

- [ ] **Step 7: Correr ambos archivos de migración para confirmar que no rompieron nada**

Run: `cd backend && python -m pytest tests/test_z_fase3_migrations.py tests/test_z_fase4_migrations.py -v`
Expected: mismo patrón de fallos preexistente que en Parte 1 (fallan antes de llegar a la línea editada, por el guard `ALEMBIC_ENV` — no un `NameError`/`SyntaxError`). Confirmar que las dos líneas editadas no introducen un error de sintaxis leyendo la salida.

- [ ] **Step 8: Commit**

```bash
git add backend/alembic/versions/fa6_011_product_web_listings_campos_parte2.py backend/app/models/catalog.py backend/tests/test_z_fase3_migrations.py backend/tests/test_z_fase4_migrations.py backend/tests/test_td03_parte2_schema_nuevos_campos.py
git commit -m "feat(td-03-p2): agregar 5 campos huerfanos a product_web_listings (fa6_011)"
```

---

### Task 2: Extender el backfill de Parte 1 para las 5 columnas nuevas

**Files:**
- Modify: `backend/scripts/backfill_product_web_listings.py:58-95`
- Modify: `backend/tests/test_td03_backfill_product_web_listings.py` (agregar import, agregar un test)

**Interfaces:**
- Consumes: `ProductWebListing` con las 5 columnas nuevas (Task 1). `backfill(conn, dry_run)` ya existente de Parte 1 — misma firma, mismo `dict` de retorno `{"matched": int, "orphaned": [(id, nombre, sku), ...]}`.
- Produces: el mismo `backfill()` ahora también copia `impuesto_pct, sub_categoria, variantes, alerta_stock_minimo, created_by` — sin cambio de firma, consumido igual por Tasks 3-5 (que solo leen `product_web_listings`, no llaman `backfill()` directamente).

- [ ] **Step 1: Escribir el test que falla primero**

Agregar al final de `backend/tests/test_td03_backfill_product_web_listings.py` (después de agregar `from decimal import Decimal` a los imports del archivo, junto a los ya existentes `import json` / `from sqlalchemy import text` / `from app.api.v1.ecommerce import _ensure_ecommerce_tables`):

```python
def test_backfill_copies_campos_parte2(db, sku):
    _ensure_ecommerce_tables(db)
    db.execute(text("""
        INSERT INTO ecommerce_products (nombre, sku, impuesto_pct, sub_categoria, variantes, alerta_stock_minimo, created_by, publicado_web)
        VALUES ('Producto Parte 2', :sku, 19.00, 'Camisetas', CAST(:variantes AS jsonb), 8, 'admin@nebulae.test', TRUE)
    """), {"sku": sku.sku, "variantes": json.dumps([{"talla": "M"}])})
    db.commit()

    from scripts.backfill_product_web_listings import backfill, get_conn
    conn = get_conn()
    try:
        backfill(conn, dry_run=False)
    finally:
        conn.close()

    row = db.execute(text(
        "SELECT impuesto_pct, sub_categoria, variantes, alerta_stock_minimo, created_by "
        "FROM product_web_listings WHERE sku_id = :id"
    ), {"id": sku.id}).fetchone()
    assert row is not None
    assert row[0] == Decimal("19.00")
    assert row[1] == "Camisetas"
    assert row[2] == [{"talla": "M"}]
    assert row[3] == 8
    assert row[4] == "admin@nebulae.test"
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `cd backend && python -m pytest tests/test_td03_backfill_product_web_listings.py::test_backfill_copies_campos_parte2 -v`
Expected: FAIL — `psycopg2.errors.UndefinedColumn` (la columna `impuesto_pct` no está en el SELECT/INSERT del script todavía) o `AssertionError: row is None`.

- [ ] **Step 3: Extender el script de backfill**

En `backend/scripts/backfill_product_web_listings.py`, reemplazar la función `backfill` completa:

```python
def backfill(conn, dry_run: bool = False) -> dict:
    cur = conn.cursor()
    cur.execute("""
        SELECT id, nombre, sku, descripcion_larga, precio_comparacion, descuento_pct, imagenes,
               seo_titulo, seo_descripcion, seo_keywords, codigo_aduana, peso_kg,
               notas_internas, publicado_web, rastrear_inventario,
               impuesto_pct, sub_categoria, variantes, alerta_stock_minimo, created_by
        FROM ecommerce_products
    """)
    rows = cur.fetchall()

    matched = 0
    orphaned = []
    for r in rows:
        oid = r[0]
        onombre = r[1]
        sku_code = r[2]
        # Rows with no SKU (NULL or empty string) are reported as orphaned
        if not sku_code:
            orphaned.append((oid, onombre, sku_code))
            continue

        cur.execute("SELECT id FROM product_skus WHERE sku = %s", (sku_code,))
        sku_row = cur.fetchone()
        if not sku_row:
            orphaned.append((oid, onombre, sku_code))
            continue

        matched += 1
        if not dry_run:
            cur.execute("""
                INSERT INTO product_web_listings
                    (sku_id, descripcion_larga, precio_comparacion, descuento_pct, imagenes,
                     seo_titulo, seo_descripcion, seo_keywords, codigo_aduana, peso_kg,
                     notas_internas, publicado_web, rastrear_inventario,
                     impuesto_pct, sub_categoria, variantes, alerta_stock_minimo, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (sku_id) DO NOTHING
            """, (
                sku_row[0], r[3], r[4], r[5], json.dumps(r[6] or []),
                r[7], r[8], r[9], r[10], r[11], r[12], r[13], r[14],
                r[15], r[16], json.dumps(r[17] or []), r[18], r[19],
            ))

    if not dry_run:
        conn.commit()
    cur.close()
    return {"matched": matched, "orphaned": orphaned}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `cd backend && python -m pytest tests/test_td03_backfill_product_web_listings.py -v`
Expected: PASS — 6 passed (los 5 tests de Parte 1 siguen pasando, más este nuevo).

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/backfill_product_web_listings.py backend/tests/test_td03_backfill_product_web_listings.py
git commit -m "feat(td-03-p2): extender backfill para copiar los 5 campos nuevos de product_web_listings"
```

---

### Task 3: Flag + lectura unificada de `GET /catalogo` (lista)

**Files:**
- Modify: `backend/app/api/v1/ecommerce.py` (imports, nueva función `_lectura_canonica`, nuevas funciones `_serialize_catalogo_item_canonico` y `_serialize_catalogo_item_huerfano`, nueva función `_list_catalogo_canonico`, y el endpoint `list_catalogo`)
- Test: `backend/tests/test_td03_parte2_cutover_lectura.py` (nuevo)

**Interfaces:**
- Consumes: `ProductWebListing` (Task 1), `_get_real_sellable_stock(db, sku_id, owner="NEBULAE") -> Decimal` (ya existente en `ecommerce.py:173`), fixture `app_client` (de `tests/conftest.py`, `TestClient` ya configurado contra la DB de test), fixtures `db`/`sku`/`product`/`category`/`brand`.
- Produces: `_lectura_canonica() -> bool` y `_serialize_catalogo_item_canonico(db: Session, canon_sku: ProductSKU) -> dict` — usados por Task 4 (detalle) y por Task 5 (`_lectura_canonica`).

- [ ] **Step 1: Escribir los tests que fallan primero**

```python
# backend/tests/test_td03_parte2_cutover_lectura.py
import uuid
from decimal import Decimal
from sqlalchemy import text
from app.api.v1.ecommerce import _ensure_ecommerce_tables


def test_catalogo_legacy_usa_defaults_antiguos_con_flag_off(app_client, db, sku, monkeypatch):
    from app.models.catalog import ProductWebListing
    listing = ProductWebListing(sku_id=sku.id, sub_categoria="NuevaSubcat", impuesto_pct=Decimal("19.00"), publicado_web=True)
    db.add(listing)
    db.commit()
    monkeypatch.delenv("CATALOGO_LECTURA", raising=False)

    resp = app_client.get("/ecommerce/catalogo", params={"search": sku.sku})
    assert resp.status_code == 200
    item = next(p for p in resp.json()["data"] if p["sku"] == sku.sku)
    # Con el flag apagado, la ruta legacy nunca lee ProductWebListing --
    # sigue usando sus propios defaults hardcodeados, no los del listing real.
    assert item["sub_categoria"] == ""
    assert item["impuesto_pct"] == 0.0
    assert item["tipo_producto"] == "Fisico"


def test_catalogo_canonico_incluye_datos_de_web_listing(app_client, db, sku, monkeypatch):
    from app.models.catalog import ProductWebListing
    listing = ProductWebListing(
        sku_id=sku.id, precio_comparacion=Decimal("99000"),
        sub_categoria="Camisetas", impuesto_pct=Decimal("19.00"), publicado_web=True,
    )
    db.add(listing)
    db.commit()
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")

    resp = app_client.get("/ecommerce/catalogo", params={"search": sku.sku})
    assert resp.status_code == 200
    item = next(p for p in resp.json()["data"] if p["sku"] == sku.sku)
    assert item["id"] == sku.id
    assert item["precio_comparacion"] == 99000.0
    assert item["sub_categoria"] == "Camisetas"
    assert item["impuesto_pct"] == 19.0


def test_catalogo_canonico_precio_venta_coincide_con_sale_price(app_client, db, sku, monkeypatch):
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    resp = app_client.get("/ecommerce/catalogo", params={"search": sku.sku})
    assert resp.status_code == 200
    item = next(p for p in resp.json()["data"] if p["sku"] == sku.sku)
    assert item["precio_venta"] == float(sku.sale_price)


def test_catalogo_canonico_sku_sin_listing_usa_defaults(app_client, db, sku, monkeypatch):
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    resp = app_client.get("/ecommerce/catalogo", params={"search": sku.sku})
    assert resp.status_code == 200
    item = next(p for p in resp.json()["data"] if p["sku"] == sku.sku)
    assert item["descuento_pct"] == 0.0
    assert item["publicado_web"] is True
    assert item["sub_categoria"] == ""


def test_catalogo_canonico_incluye_huerfanos_con_id_negativo(app_client, db, monkeypatch):
    _ensure_ecommerce_tables(db)
    sku_huerfano = f"SKU-HUERFANO-P2-{uuid.uuid4().hex[:8]}"
    db.execute(text("""
        INSERT INTO ecommerce_products (nombre, sku, publicado_web)
        VALUES ('Producto Huerfano P2', :sku, TRUE)
    """), {"sku": sku_huerfano})
    db.commit()
    try:
        monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
        resp = app_client.get("/ecommerce/catalogo", params={"search": sku_huerfano})
        assert resp.status_code == 200
        item = next(p for p in resp.json()["data"] if p["sku"] == sku_huerfano)
        assert item["id"] < 0
    finally:
        db.execute(text("DELETE FROM ecommerce_products WHERE sku = :sku"), {"sku": sku_huerfano})
        db.commit()
```

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run: `cd backend && python -m pytest tests/test_td03_parte2_cutover_lectura.py -v`
Expected: el primer test (`flag_off`) puede pasar por accidente si el legacy ya se comporta así, pero los que dependen de `CATALOGO_LECTURA=canonico` deben FALLAR (la ruta nueva no existe todavía, así que se sirve la legacy y `item["id"] == sku.id` no se cumple para el item hallado, o el huérfano no aparece con id negativo).

- [ ] **Step 3: Actualizar el import de modelos en `ecommerce.py`**

Reemplazar la línea 6:

```python
from app.models.catalog import ProductSKU, Product
```

por:

```python
from app.models.catalog import ProductSKU, Product, ProductWebListing, Category
```

- [ ] **Step 4: Agregar el helper del flag y los serializadores**

Insertar antes de la función `_ensure_ecommerce_tables` (línea 50) en `backend/app/api/v1/ecommerce.py`:

```python
def _lectura_canonica() -> bool:
    return os.environ.get("CATALOGO_LECTURA", "legacy") == "canonico"


def _serialize_catalogo_item_canonico(db: Session, canon_sku: ProductSKU) -> dict:
    prod = canon_sku.product
    listing = canon_sku.web_listing
    real_stock = float(_get_real_sellable_stock(db, canon_sku.id, owner="NEBULAE"))
    alerta_min = listing.alerta_stock_minimo if listing else 5
    modalidad = "ENTREGA_INMEDIATA" if real_stock > 0 else "POR_PEDIDO"
    atributos = [
        {"atributo": av.attribute.name, "valor": av.value}
        for av in canon_sku.attribute_values
    ]
    return {
        "id": canon_sku.id,
        "nombre": prod.name if prod else canon_sku.sku,
        "descripcion": (prod.description if prod else "") or "",
        "sku": canon_sku.sku,
        "precio_venta": float(canon_sku.sale_price or 0),
        "precio_comparacion": float(listing.precio_comparacion) if listing and listing.precio_comparacion is not None else float(canon_sku.sale_price or 0),
        "descuento_pct": float(listing.descuento_pct) if listing else 0.0,
        "impuesto_pct": float(listing.impuesto_pct) if listing else 0.0,
        "categoria": prod.category.name if prod and prod.category else "",
        "sub_categoria": (listing.sub_categoria if listing else None) or "",
        "marca": prod.brand.name if prod and prod.brand else "",
        "tipo_producto": prod.type if prod else "Fisico",
        "imagenes": listing.imagenes if listing else [],
        "atributos": atributos,
        "variantes": listing.variantes if listing else [],
        "stock_disponible": real_stock,
        "modalidad_disponible": modalidad,
        "alerta_stock_minimo": alerta_min,
        "publicado_web": listing.publicado_web if listing else True,
        "rastrear_inventario": listing.rastrear_inventario if listing else True,
        "seo_titulo": (listing.seo_titulo if listing else None) or (prod.name if prod else canon_sku.sku),
        "created_at": listing.created_at.isoformat() if listing and listing.created_at else None,
        "updated_at": listing.updated_at.isoformat() if listing and listing.updated_at else None,
        "is_low_stock": real_stock <= alerta_min,
    }


_HUERFANO_SELECT_COLS = (
    "id, nombre, descripcion, sku, precio_venta, precio_comparacion, descuento_pct, "
    "impuesto_pct, categoria, sub_categoria, marca, tipo_producto, imagenes, atributos, "
    "variantes, stock_disponible, alerta_stock_minimo, publicado_web, rastrear_inventario, "
    "seo_titulo, created_at, updated_at"
)


def _serialize_catalogo_item_huerfano(r) -> dict:
    stock_disp = float(r[15] or 0)
    alerta_min = r[16] or 5
    modalidad = "ENTREGA_INMEDIATA" if stock_disp > 0 else "POR_PEDIDO"
    return {
        "id": -r[0],
        "nombre": r[1],
        "descripcion": r[2],
        "sku": r[3],
        "precio_venta": float(r[4] or 0),
        "precio_comparacion": float(r[5] or 0),
        "descuento_pct": float(r[6] or 0),
        "impuesto_pct": float(r[7] or 0),
        "categoria": r[8],
        "sub_categoria": r[9],
        "marca": r[10],
        "tipo_producto": r[11],
        "imagenes": r[12] or [],
        "atributos": r[13] or [],
        "variantes": r[14] or [],
        "stock_disponible": stock_disp,
        "modalidad_disponible": modalidad,
        "alerta_stock_minimo": alerta_min,
        "publicado_web": r[17],
        "rastrear_inventario": r[18],
        "seo_titulo": r[19],
        "created_at": r[20].isoformat() if r[20] else None,
        "updated_at": r[21].isoformat() if r[21] else None,
        "is_low_stock": stock_disp <= alerta_min,
    }


def _list_catalogo_canonico(db: Session, search, categoria, publicado, limit: int) -> dict:
    q = db.query(ProductSKU).join(Product, ProductSKU.product_id == Product.id)
    if search:
        like = f"%{search}%"
        q = q.filter(ProductSKU.sku.ilike(like) | Product.name.ilike(like) | Product.description.ilike(like))
    if categoria:
        q = q.join(Category, Product.category_id == Category.id).filter(Category.name.ilike(f"%{categoria}%"))
    if publicado is not None:
        q = q.outerjoin(ProductWebListing, ProductWebListing.sku_id == ProductSKU.id)
        if publicado:
            q = q.filter((ProductWebListing.publicado_web == True) | (ProductWebListing.id.is_(None)))
        else:
            q = q.filter(ProductWebListing.publicado_web == False)

    total = q.count()
    data = [_serialize_catalogo_item_canonico(db, s) for s in q.order_by(Product.name).limit(limit).all()]

    where_clauses = ["(sku IS NULL OR sku NOT IN (SELECT sku FROM product_skus))"]
    params: dict = {"limit": limit}
    if search:
        where_clauses.append("(nombre ILIKE :s OR sku ILIKE :s OR descripcion ILIKE :s)")
        params["s"] = f"%{search}%"
    if categoria:
        where_clauses.append("categoria ILIKE :c")
        params["c"] = f"%{categoria}%"
    if publicado is not None:
        where_clauses.append("publicado_web = :pub")
        params["pub"] = publicado
    where_sql = "WHERE " + " AND ".join(where_clauses)
    rows = db.execute(text(
        f"SELECT {_HUERFANO_SELECT_COLS} FROM ecommerce_products {where_sql} ORDER BY nombre LIMIT :limit"
    ), params).fetchall()
    for r in rows:
        data.append(_serialize_catalogo_item_huerfano(r))
        total += 1

    return {"status": "success", "total": total, "data": data}
```

- [ ] **Step 5: Enganchar el flag en el endpoint**

En `backend/app/api/v1/ecommerce.py`, en la función `list_catalogo` (línea 681), reemplazar:

```python
def list_catalogo(search: Optional[str] = None, categoria: Optional[str] = None, publicado: Optional[bool] = None, limit: int = Query(100, le=500), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    where_clauses = []
```

por:

```python
def list_catalogo(search: Optional[str] = None, categoria: Optional[str] = None, publicado: Optional[bool] = None, limit: int = Query(100, le=500), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    if _lectura_canonica():
        return _list_catalogo_canonico(db, search, categoria, publicado, limit)
    where_clauses = []
```

(el resto de la función, desde `where_clauses = []` hacia abajo, queda exactamente igual — no se toca ni una línea más).

- [ ] **Step 6: Correr los tests para confirmar que pasan**

Run: `cd backend && python -m pytest tests/test_td03_parte2_cutover_lectura.py -v`
Expected: PASS — 5 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/ecommerce.py backend/tests/test_td03_parte2_cutover_lectura.py
git commit -m "feat(td-03-p2): lectura canonica de GET /ecommerce/catalogo detras de CATALOGO_LECTURA"
```

---

### Task 4: Lectura unificada de `GET /catalogo/{id}` (detalle)

**Files:**
- Modify: `backend/app/api/v1/ecommerce.py` (nueva función `_serialize_catalogo_item_detalle_canonico`, nueva función `_get_catalogo_product_canonico`, y el endpoint `get_catalogo_product`)
- Test: `backend/tests/test_td03_parte2_cutover_lectura.py` (agregar tests)

**Interfaces:**
- Consumes: `_lectura_canonica()` y `_serialize_catalogo_item_canonico(db, canon_sku)` (Task 3).
- Produces: nada consumido por tareas posteriores — este endpoint es una hoja.

- [ ] **Step 1: Escribir los tests que fallan primero**

Agregar a `backend/tests/test_td03_parte2_cutover_lectura.py`:

```python
def test_catalogo_detalle_canonico_por_sku_id(app_client, db, sku, monkeypatch):
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    resp = app_client.get(f"/ecommerce/catalogo/{sku.id}")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["id"] == sku.id
    assert data["sku"] == sku.sku
    assert data["precio_venta"] == float(sku.sale_price)


def test_catalogo_detalle_canonico_huerfano_por_id_negativo(app_client, db, monkeypatch):
    _ensure_ecommerce_tables(db)
    sku_huerfano = f"SKU-HUERFANO-DETALLE-{uuid.uuid4().hex[:8]}"
    result = db.execute(text("""
        INSERT INTO ecommerce_products (nombre, sku, publicado_web)
        VALUES ('Producto Huerfano Detalle', :sku, TRUE)
        RETURNING id
    """), {"sku": sku_huerfano})
    ecom_id = result.fetchone()[0]
    db.commit()
    try:
        monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
        resp = app_client.get(f"/ecommerce/catalogo/{-ecom_id}")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["sku"] == sku_huerfano
        assert data["id"] == -ecom_id
    finally:
        db.execute(text("DELETE FROM ecommerce_products WHERE sku = :sku"), {"sku": sku_huerfano})
        db.commit()


def test_catalogo_detalle_canonico_404_si_no_existe(app_client, db, monkeypatch):
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    resp = app_client.get("/ecommerce/catalogo/999999999")
    assert resp.status_code == 404
```

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run: `cd backend && python -m pytest tests/test_td03_parte2_cutover_lectura.py -k detalle_canonico -v`
Expected: FAIL — con el flag activado, `get_catalogo_product` todavía usa el código legacy (busca en `ecommerce_products.id`, no `ProductSKU.id`), así que `data["id"] == sku.id` no se cumple y el caso de id negativo da 404 en vez de 200.

- [ ] **Step 3: Agregar el serializador de detalle y el handler canónico**

Insertar después de `_list_catalogo_canonico` (Task 3) en `backend/app/api/v1/ecommerce.py`:

```python
def _serialize_catalogo_item_detalle_canonico(db: Session, canon_sku: ProductSKU) -> dict:
    base = _serialize_catalogo_item_canonico(db, canon_sku)
    listing = canon_sku.web_listing
    base["descripcion_larga"] = listing.descripcion_larga if listing else None
    base["seo_descripcion"] = listing.seo_descripcion if listing else None
    base["seo_keywords"] = listing.seo_keywords if listing else None
    base["codigo_aduana"] = listing.codigo_aduana if listing else None
    base["peso_kg"] = float(listing.peso_kg) if listing and listing.peso_kg is not None else None
    base["notas_internas"] = listing.notas_internas if listing else None
    base["created_by"] = listing.created_by if listing else None
    return base


def _get_catalogo_product_canonico(db: Session, product_id: int) -> dict:
    if product_id > 0:
        canon_sku = db.query(ProductSKU).filter(ProductSKU.id == product_id).first()
        if not canon_sku:
            raise HTTPException(404, "Producto no encontrado")
        data = _serialize_catalogo_item_detalle_canonico(db, canon_sku)
    else:
        row = db.execute(text("SELECT * FROM ecommerce_products WHERE id=:id"), {"id": -product_id}).fetchone()
        if not row:
            raise HTTPException(404, "Producto no encontrado")
        keys = ["id","nombre","descripcion","descripcion_larga","sku","precio_venta","precio_comparacion","descuento_pct","impuesto_pct","categoria","sub_categoria","marca","tipo_producto","imagenes","atributos","variantes","stock_disponible","alerta_stock_minimo","publicado_web","rastrear_inventario","codigo_aduana","peso_kg","notas_internas","seo_titulo","seo_descripcion","seo_keywords","created_at","updated_at","created_by"]
        data = dict(zip(keys, row))
        data["id"] = -data["id"]
        for k in ["created_at", "updated_at"]:
            if data.get(k) and hasattr(data[k], "isoformat"):
                data[k] = data[k].isoformat()

    ventas_prod = db.query(SaleOrder).filter(SaleOrder.canal_venta=='WEB', SaleOrder.estado!='CANCELADO').all()
    total_vendido = sum(p.get("qty", p.get("cantidad", 0)) for o in ventas_prod for p in (o.productos or []) if p.get("sku") == data.get("sku") or p.get("nombre","").lower() == (data.get("nombre") or "").lower())
    data["total_vendido"] = total_vendido
    return {"status": "success", "data": data}
```

- [ ] **Step 4: Enganchar el flag en el endpoint**

En `get_catalogo_product` (línea 786), reemplazar:

```python
def get_catalogo_product(product_id: int, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    row = db.execute(text("SELECT * FROM ecommerce_products WHERE id=:id"), {"id": product_id}).fetchone()
```

por:

```python
def get_catalogo_product(product_id: int, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    if _lectura_canonica():
        return _get_catalogo_product_canonico(db, product_id)
    row = db.execute(text("SELECT * FROM ecommerce_products WHERE id=:id"), {"id": product_id}).fetchone()
```

(el resto de la función queda exactamente igual).

- [ ] **Step 5: Correr los tests para confirmar que pasan**

Run: `cd backend && python -m pytest tests/test_td03_parte2_cutover_lectura.py -v`
Expected: PASS — 8 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/ecommerce.py backend/tests/test_td03_parte2_cutover_lectura.py
git commit -m "feat(td-03-p2): lectura canonica de GET /ecommerce/catalogo/{id} con desambiguacion de id negativo"
```

---

### Task 5: Lectura unificada de `GET /categorias`

**Files:**
- Modify: `backend/app/api/v1/ecommerce.py` (nueva función `_get_categorias_web_canonico` y el endpoint `get_categorias_web`)
- Test: `backend/tests/test_td03_parte2_cutover_lectura.py` (agregar tests)

**Interfaces:**
- Consumes: `_lectura_canonica()` (Task 3), `Category`/`ProductWebListing` (import ya agregado en Task 3).
- Produces: nada consumido por tareas posteriores — este endpoint es una hoja. Cierra el alcance de Parte 2.

- [ ] **Step 1: Escribir los tests que fallan primero**

Agregar a `backend/tests/test_td03_parte2_cutover_lectura.py`:

```python
def test_categorias_canonico_incluye_categoria_y_subcategoria(app_client, db, sku, monkeypatch):
    from app.models.catalog import ProductWebListing
    listing = ProductWebListing(sku_id=sku.id, sub_categoria="Deportivas", publicado_web=True)
    db.add(listing)
    db.commit()
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")

    resp = app_client.get("/ecommerce/categorias")
    assert resp.status_code == 200
    data = resp.json()["data"]
    cat_nombre = sku.product.category.name
    cat_entry = next((c for c in data if c["nombre"] == cat_nombre), None)
    assert cat_entry is not None
    assert "Deportivas" in cat_entry["sub_categorias"]


def test_categorias_canonico_sku_sin_listing_usa_default_publicado(app_client, db, sku, monkeypatch):
    # Sin ProductWebListing, publicado_web por default es True (Global Constraints) --
    # la categoria debe seguir apareciendo en el filtro.
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    resp = app_client.get("/ecommerce/categorias")
    assert resp.status_code == 200
    data = resp.json()["data"]
    cat_nombre = sku.product.category.name
    assert any(c["nombre"] == cat_nombre for c in data)


def test_categorias_canonico_incluye_categoria_de_huerfano(app_client, db, monkeypatch):
    _ensure_ecommerce_tables(db)
    sku_huerfano = f"SKU-HUERFANO-CAT-{uuid.uuid4().hex[:8]}"
    cat_huerfana = f"CategoriaHuerfana-{uuid.uuid4().hex[:6]}"
    db.execute(text("""
        INSERT INTO ecommerce_products (nombre, sku, categoria, publicado_web)
        VALUES ('Producto Huerfano Cat', :sku, :cat, TRUE)
    """), {"sku": sku_huerfano, "cat": cat_huerfana})
    db.commit()
    try:
        monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
        resp = app_client.get("/ecommerce/categorias")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert any(c["nombre"] == cat_huerfana for c in data)
    finally:
        db.execute(text("DELETE FROM ecommerce_products WHERE sku = :sku"), {"sku": sku_huerfano})
        db.commit()
```

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run: `cd backend && python -m pytest tests/test_td03_parte2_cutover_lectura.py -k categorias_canonico -v`
Expected: FAIL — con el flag activado, `get_categorias_web` sigue leyendo solo `ecommerce_products`, así que la categoría del SKU canónico no aparece.

- [ ] **Step 3: Agregar el handler canónico**

Insertar después de `_get_catalogo_product_canonico` (Task 4) en `backend/app/api/v1/ecommerce.py`:

```python
def _get_categorias_web_canonico(db: Session) -> dict:
    rows = (
        db.query(Category.name, ProductWebListing.sub_categoria)
        .join(Product, Product.category_id == Category.id)
        .join(ProductSKU, ProductSKU.product_id == Product.id)
        .outerjoin(ProductWebListing, ProductWebListing.sku_id == ProductSKU.id)
        .filter((ProductWebListing.publicado_web == True) | (ProductWebListing.id.is_(None)))
        .distinct()
        .order_by(Category.name, ProductWebListing.sub_categoria)
        .all()
    )
    cat_map: dict = {}
    for cat, sub in rows:
        cat = cat or "General"
        if cat not in cat_map:
            cat_map[cat] = {"nombre": cat, "sub_categorias": []}
        if sub and sub not in cat_map[cat]["sub_categorias"]:
            cat_map[cat]["sub_categorias"].append(sub)

    huerfano_rows = db.execute(text(
        "SELECT DISTINCT categoria, sub_categoria FROM ecommerce_products "
        "WHERE publicado_web=TRUE AND categoria IS NOT NULL "
        "AND (sku IS NULL OR sku NOT IN (SELECT sku FROM product_skus)) "
        "ORDER BY categoria, sub_categoria"
    )).fetchall()
    for cat, sub in huerfano_rows:
        cat = cat or "General"
        if cat not in cat_map:
            cat_map[cat] = {"nombre": cat, "sub_categorias": []}
        if sub and sub not in cat_map[cat]["sub_categorias"]:
            cat_map[cat]["sub_categorias"].append(sub)

    return {"status": "success", "data": list(cat_map.values())}
```

- [ ] **Step 4: Enganchar el flag en el endpoint**

En `get_categorias_web` (línea 865), reemplazar:

```python
def get_categorias_web(db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    try:
        rows = db.execute(text("SELECT DISTINCT categoria, sub_categoria FROM ecommerce_products WHERE publicado_web=TRUE AND categoria IS NOT NULL ORDER BY categoria, sub_categoria")).fetchall()
```

por:

```python
def get_categorias_web(db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    if _lectura_canonica():
        return _get_categorias_web_canonico(db)
    try:
        rows = db.execute(text("SELECT DISTINCT categoria, sub_categoria FROM ecommerce_products WHERE publicado_web=TRUE AND categoria IS NOT NULL ORDER BY categoria, sub_categoria")).fetchall()
```

(el resto de la función queda exactamente igual).

- [ ] **Step 5: Correr todos los tests de Parte 2 para confirmar que pasan**

Run: `cd backend && python -m pytest tests/test_td03_parte2_cutover_lectura.py tests/test_td03_parte2_schema_nuevos_campos.py tests/test_td03_backfill_product_web_listings.py -v`
Expected: PASS — 19 passed (8 de Task 3+4, 3 de Task 5, 2 de Task 1, 6 de Task 2).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/ecommerce.py backend/tests/test_td03_parte2_cutover_lectura.py
git commit -m "feat(td-03-p2): lectura canonica de GET /ecommerce/categorias con union de huerfanos"
```

---

## Al completar todas las tareas

1. Correr la suite completa: `cd backend && python -m pytest tests/ -v`. Esperado: mismo baseline histórico de la rama (`22 failed, 528 passed, 1 skipped, 7 errors` de Parte 1) más los tests nuevos de este plan, sin ninguna falla nueva. Correr **una sola vez de forma solitaria** (verificar vía `Get-CimInstance Win32_Process` que no hay otro proceso `pytest` corriendo antes y después) — la suite completa toma ~70 minutos en esta máquina.
2. **Nota de despliegue** (misma lección que Parte 1, hallazgo I-1): al desplegar esta rama a un ambiente real, `alembic upgrade head` deja la base en `fa6_011`. Si en algún momento se activa `CATALOGO_LECTURA=canonico` en ese ambiente, verificar primero que el backfill (Task 2, extendido) ya corrió contra esa base — si no, todos los SKUs se sirven con los defaults de "sin listing todavía" en vez de sus datos reales de marketing/SEO.
3. Activar `CATALOGO_LECTURA=canonico` en cualquier ambiente (incluido el Mirror) es una decisión aparte, fuera de este plan — este plan solo construye y prueba la capacidad detrás del flag, no la activa en ninguna parte por defecto.

**Qué sigue (fuera de este plan):**
- **Parte 3**: doble-escritura en `POST/PATCH/DELETE /ecommerce/catalogo`, período de observación, y solo entonces apagar `ecommerce_products` (`DROP TABLE` + retirar `_ensure_ecommerce_tables()`) — ver `docs/audit/2026-09-17-fase-c-investigacion.md` sección 3 y el plan de Parte 1.
