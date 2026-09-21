# TD-03 Parte 3: Doble-escritura y reconciliación de id — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconciliar el espacio de id entre lectura canónica y escritura en `POST/PATCH/DELETE /ecommerce/catalogo`, e implementar doble-escritura (canónico + espejo en `ecommerce_products`) para `PATCH`/`DELETE` cuando el id apunta a un producto canónico, sin tocar jamás `ProductSKU`/`Product`.

**Architecture:** `PATCH`/`DELETE /catalogo/{id}` ramifican con una condición compuesta `_lectura_canonica() and product_id > 0` — solo entonces `id` significa `ProductSKU.id`; en cualquier otro caso (flag apagado, o flag encendido con id negativo) es exactamente el código legacy de siempre, operando sobre `abs(product_id)` como `ecommerce_products.id`. La ruta canónica actualiza/borra `ProductWebListing` y sincroniza una fila espejo en `ecommerce_products` (upsert por `sku`) para que alternar el flag nunca pierda datos. `POST` no cambia. `GET /stats` gana el mismo guard de flag que las 3 rutas GET de Parte 2.

**Tech Stack:** FastAPI, SQLAlchemy (ORM + `text()` raw SQL para `ecommerce_products`), pytest, Postgres.

**Spec:** `docs/superpowers/specs/2026-09-20-td03-parte3-doble-escritura-catalogo-design.md`

## Global Constraints

- No se agrega ninguna migración de Alembic — solo se usan columnas ya existentes de `ProductWebListing` (Parte 1+2) y `ecommerce_products`.
- `create_catalogo_product` (`ecommerce.py:1016`) no se modifica en absoluto — ya es dual-write-safe vía el fallback de huérfanos de Parte 2.
- Ninguna función de escritura de estos endpoints, bajo ningún signo de id, ejecuta `DELETE`/`db.delete()` ni `UPDATE` sobre las tablas `products` o `product_skus`.
- El branching de id es siempre la condición compuesta `_lectura_canonica() and product_id > 0` — nunca solo el signo. Con el flag apagado, todo id es tratado como `ecommerce_products.id` (vía `abs()`), exactamente como hoy.
- Campos del body de `PATCH` que no pertenecen a `ProductWebListing` (`nombre`, `marca`, `categoria`, `precio_venta`, `stock_disponible`, `sku`, `tipo_producto`) se ignoran silenciosamente en la ruta canónica — no se levanta error 400.
- Todas las pruebas nuevas van en `backend/tests/test_td03_parte3_doble_escritura_catalogo.py`.
- Los endpoints de escritura requieren rol ADMIN (`require_roles(*ROLE_ADMIN)`) — las pruebas HTTP usan el fixture `admin_token` existente (`tests/conftest.py:344`) vía `headers={"Authorization": f"Bearer {admin_token}"}`.
- Toda fila insertada directamente por SQL crudo en `ecommerce_products` durante una prueba debe borrarse en un bloque `finally` — el fixture `db` solo rastrea limpieza automática de objetos añadidos vía `db.add()` (ORM), no de `INSERT` crudo.
- Las aserciones sobre conteos globales (p. ej. `/stats`) deben ser deltas (antes/después), nunca conteos absolutos — la suite completa deja datos residuales de otras pruebas (lección ya aplicada en Parte 1: ver `test_backfill_reports_null_sku_as_orphaned`).

---

### Task 1: `_es_id_canonico`, UPDATE canónico y sincronización de espejo

**Files:**
- Modify: `backend/app/api/v1/ecommerce.py` (agregar 3 funciones nuevas después de `_lectura_canonica` en la línea 51; modificar `update_catalogo_product`, líneas 1029-1049)
- Create: `backend/tests/test_td03_parte3_doble_escritura_catalogo.py`

**Interfaces:**
- Produces: `_es_id_canonico(product_id: int) -> bool` — consumido también por Task 2.
- Produces: `_upsert_espejo_ecommerce_products(db: Session, canon_sku: ProductSKU, listing: ProductWebListing) -> None`
- Produces: `_update_catalogo_producto_canonico(db: Session, sku_id: int, body: dict) -> dict`
- Consumes: `ProductSKU`, `Product`, `ProductWebListing` (ya importados en el archivo), `_get_real_sellable_stock` (ya definida en el archivo, usada para `stock_disponible`).

- [ ] **Step 1: Escribir las 5 pruebas en rojo**

Crear `backend/tests/test_td03_parte3_doble_escritura_catalogo.py`:

```python
import uuid
from decimal import Decimal
from sqlalchemy import text
from app.api.v1.ecommerce import _ensure_ecommerce_tables


def test_update_canonico_con_listing_existente_sincroniza_ambos_lados(app_client, db, sku, admin_token, monkeypatch):
    from app.models.catalog import ProductWebListing
    listing = ProductWebListing(sku_id=sku.id, descuento_pct=Decimal("5.00"), publicado_web=True)
    db.add(listing)
    db.commit()
    _ensure_ecommerce_tables(db)
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")

    resp = app_client.patch(
        f"/api/v1/ecommerce/catalogo/{sku.id}",
        json={"descuento_pct": 15, "sub_categoria": "Ofertas"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    db.refresh(listing)
    assert float(listing.descuento_pct) == 15.0
    assert listing.sub_categoria == "Ofertas"

    espejo = db.execute(
        text("SELECT descuento_pct, sub_categoria FROM ecommerce_products WHERE sku=:sku"),
        {"sku": sku.sku},
    ).fetchone()
    assert espejo is not None
    assert float(espejo[0]) == 15.0
    assert espejo[1] == "Ofertas"


def test_update_canonico_sin_listing_previo_crea_listing_y_espejo(app_client, db, sku, admin_token, monkeypatch):
    _ensure_ecommerce_tables(db)
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")

    resp = app_client.patch(
        f"/api/v1/ecommerce/catalogo/{sku.id}",
        json={"seo_titulo": "Titulo SEO Nuevo"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    from app.models.catalog import ProductWebListing
    listing = db.query(ProductWebListing).filter(ProductWebListing.sku_id == sku.id).first()
    assert listing is not None
    assert listing.seo_titulo == "Titulo SEO Nuevo"
    assert listing.publicado_web is True
    assert listing.alerta_stock_minimo == 5

    espejo = db.execute(
        text("SELECT seo_titulo, sku FROM ecommerce_products WHERE sku=:sku"),
        {"sku": sku.sku},
    ).fetchone()
    assert espejo is not None
    assert espejo[0] == "Titulo SEO Nuevo"


def test_update_canonico_ignora_campos_fuera_de_alcance(app_client, db, sku, product, admin_token, monkeypatch):
    _ensure_ecommerce_tables(db)
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    nombre_original = product.name

    resp = app_client.patch(
        f"/api/v1/ecommerce/catalogo/{sku.id}",
        json={"nombre": "Nombre Que No Deberia Aplicar", "descuento_pct": 7},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    db.refresh(product)
    assert product.name == nombre_original

    from app.models.catalog import ProductWebListing
    listing = db.query(ProductWebListing).filter(ProductWebListing.sku_id == sku.id).first()
    assert float(listing.descuento_pct) == 7.0


def test_update_huerfano_con_flag_on_usa_ruta_legacy(app_client, db, admin_token, monkeypatch):
    _ensure_ecommerce_tables(db)
    sku_huerfano = f"SKU-P3-UPD-HUERFANO-{uuid.uuid4().hex[:8]}"
    result = db.execute(
        text("INSERT INTO ecommerce_products (nombre, sku, publicado_web) VALUES ('Original', :sku, TRUE) RETURNING id"),
        {"sku": sku_huerfano},
    )
    ecom_id = result.fetchone()[0]
    db.commit()
    try:
        monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
        resp = app_client.patch(
            f"/api/v1/ecommerce/catalogo/{-ecom_id}",
            json={"nombre": "Actualizado Legacy"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        row = db.execute(text("SELECT nombre FROM ecommerce_products WHERE id=:id"), {"id": ecom_id}).fetchone()
        assert row[0] == "Actualizado Legacy"
    finally:
        db.execute(text("DELETE FROM ecommerce_products WHERE id=:id"), {"id": ecom_id})
        db.commit()


def test_update_con_flag_off_ignora_signo_y_usa_ruta_legacy(app_client, db, admin_token, monkeypatch):
    _ensure_ecommerce_tables(db)
    sku_legacy = f"SKU-P3-UPD-LEGACY-{uuid.uuid4().hex[:8]}"
    result = db.execute(
        text("INSERT INTO ecommerce_products (nombre, sku, publicado_web) VALUES ('Original', :sku, TRUE) RETURNING id"),
        {"sku": sku_legacy},
    )
    ecom_id = result.fetchone()[0]
    db.commit()
    try:
        monkeypatch.delenv("CATALOGO_LECTURA", raising=False)
        resp = app_client.patch(
            f"/api/v1/ecommerce/catalogo/{ecom_id}",
            json={"nombre": "Actualizado Flag Off"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        row = db.execute(text("SELECT nombre FROM ecommerce_products WHERE id=:id"), {"id": ecom_id}).fetchone()
        assert row[0] == "Actualizado Flag Off"
    finally:
        db.execute(text("DELETE FROM ecommerce_products WHERE id=:id"), {"id": ecom_id})
        db.commit()
```

- [ ] **Step 2: Ejecutar y verificar que las 5 fallan**

Run: `pytest tests/test_td03_parte3_doble_escritura_catalogo.py -v`
Expected: los 3 primeros tests fallan con 404 o `AssertionError` (no existe `_update_catalogo_producto_canonico`, la ruta canónica no existe todavía); los 2 últimos (`_huerfano_con_flag_on`, `_flag_off`) probablemente **pasan ya** porque hoy `update_catalogo_product` no distingue id positivo/negativo y usa `product_id` tal cual — si `-ecom_id` llega hoy al `WHERE id=:id`, no coincide con ninguna fila y el `UPDATE` no afecta ninguna fila sin lanzar error (la ruta legacy no verifica rowcount), así que **puede que la aserción de contenido falle** en vez de dar 404. Pegar la salida real de este comando en el reporte — si alguno de los 2 últimos pasa antes de tocar código, es una coincidencia esperada del comportamiento actual, explicarlo, no forzar que falle artificialmente.

- [ ] **Step 3: Implementar `_es_id_canonico`, `_upsert_espejo_ecommerce_products` y `_update_catalogo_producto_canonico`**

En `backend/app/api/v1/ecommerce.py`, insertar inmediatamente después de la función `_lectura_canonica` (después de la línea 51, antes de `_serialize_catalogo_item_canonico`):

```python
def _es_id_canonico(product_id: int) -> bool:
    return _lectura_canonica() and product_id > 0


def _upsert_espejo_ecommerce_products(db: Session, canon_sku: ProductSKU, listing: ProductWebListing) -> None:
    prod = canon_sku.product
    now = datetime.datetime.utcnow()
    atributos = [
        {"atributo": av.attribute.name, "valor": av.value}
        for av in canon_sku.attribute_values
    ]
    stock_disp = float(_get_real_sellable_stock(db, canon_sku.id, owner="NEBULAE"))
    values = {
        "sku": canon_sku.sku,
        "nombre": prod.name if prod else canon_sku.sku,
        "descripcion": (prod.description if prod else "") or "",
        "descripcion_larga": listing.descripcion_larga,
        "precio_venta": float(canon_sku.sale_price or 0),
        "precio_comparacion": float(listing.precio_comparacion) if listing.precio_comparacion is not None else float(canon_sku.sale_price or 0),
        "descuento_pct": float(listing.descuento_pct or 0),
        "impuesto_pct": float(listing.impuesto_pct or 0),
        "categoria": prod.category.name if prod and prod.category else None,
        "sub_categoria": listing.sub_categoria,
        "marca": prod.brand.name if prod and prod.brand else None,
        "tipo_producto": (prod.type if prod else None) or "Bienes",
        "imagenes": json_mod.dumps(listing.imagenes or []),
        "atributos": json_mod.dumps(atributos),
        "variantes": json_mod.dumps(listing.variantes or []),
        "stock_disponible": int(stock_disp),
        "alerta_stock_minimo": listing.alerta_stock_minimo,
        "publicado_web": listing.publicado_web,
        "rastrear_inventario": listing.rastrear_inventario,
        "codigo_aduana": listing.codigo_aduana,
        "peso_kg": listing.peso_kg,
        "notas_internas": listing.notas_internas,
        "seo_titulo": listing.seo_titulo,
        "seo_descripcion": listing.seo_descripcion,
        "seo_keywords": listing.seo_keywords,
        "created_by": listing.created_by,
        "now": now,
    }
    existing = db.execute(text("SELECT id FROM ecommerce_products WHERE sku=:sku"), {"sku": canon_sku.sku}).fetchone()
    if existing:
        db.execute(text("""
            UPDATE ecommerce_products SET
                nombre=:nombre, descripcion=:descripcion, descripcion_larga=:descripcion_larga, precio_venta=:precio_venta,
                precio_comparacion=:precio_comparacion, descuento_pct=:descuento_pct, impuesto_pct=:impuesto_pct,
                categoria=:categoria, sub_categoria=:sub_categoria, marca=:marca, tipo_producto=:tipo_producto,
                imagenes=CAST(:imagenes AS jsonb), atributos=CAST(:atributos AS jsonb), variantes=CAST(:variantes AS jsonb),
                stock_disponible=:stock_disponible, alerta_stock_minimo=:alerta_stock_minimo, publicado_web=:publicado_web,
                rastrear_inventario=:rastrear_inventario, codigo_aduana=:codigo_aduana, peso_kg=:peso_kg,
                notas_internas=:notas_internas, seo_titulo=:seo_titulo, seo_descripcion=:seo_descripcion,
                seo_keywords=:seo_keywords, created_by=:created_by, updated_at=:now
            WHERE sku=:sku
        """), values)
    else:
        db.execute(text("""
            INSERT INTO ecommerce_products
                (nombre,descripcion,descripcion_larga,sku,precio_venta,precio_comparacion,descuento_pct,impuesto_pct,
                 categoria,sub_categoria,marca,tipo_producto,imagenes,atributos,variantes,stock_disponible,
                 alerta_stock_minimo,publicado_web,rastrear_inventario,codigo_aduana,peso_kg,notas_internas,
                 seo_titulo,seo_descripcion,seo_keywords,created_at,updated_at,created_by)
            VALUES
                (:nombre,:descripcion,:descripcion_larga,:sku,:precio_venta,:precio_comparacion,:descuento_pct,:impuesto_pct,
                 :categoria,:sub_categoria,:marca,:tipo_producto,CAST(:imagenes AS jsonb),CAST(:atributos AS jsonb),CAST(:variantes AS jsonb),:stock_disponible,
                 :alerta_stock_minimo,:publicado_web,:rastrear_inventario,:codigo_aduana,:peso_kg,:notas_internas,
                 :seo_titulo,:seo_descripcion,:seo_keywords,:now,:now,:created_by)
        """), values)


def _update_catalogo_producto_canonico(db: Session, sku_id: int, body: dict) -> dict:
    canon_sku = db.query(ProductSKU).filter(ProductSKU.id == sku_id).first()
    if not canon_sku:
        raise HTTPException(404, "Producto no encontrado")

    listing = canon_sku.web_listing
    if not listing:
        listing = ProductWebListing(
            sku_id=canon_sku.id,
            descuento_pct=0,
            impuesto_pct=0,
            publicado_web=True,
            rastrear_inventario=True,
            alerta_stock_minimo=5,
            sub_categoria="",
            imagenes=[],
            variantes=[],
            precio_comparacion=canon_sku.sale_price,
            seo_titulo=(canon_sku.product.name if canon_sku.product else canon_sku.sku),
        )
        db.add(listing)

    campos_listing = [
        "precio_comparacion", "descuento_pct", "impuesto_pct", "sub_categoria",
        "alerta_stock_minimo", "publicado_web", "rastrear_inventario", "seo_titulo",
        "descripcion_larga", "seo_descripcion", "seo_keywords", "codigo_aduana",
        "peso_kg", "notas_internas", "created_by", "imagenes", "variantes",
    ]
    for k in campos_listing:
        if k in body:
            setattr(listing, k, body[k])

    db.flush()
    _upsert_espejo_ecommerce_products(db, canon_sku, listing)
    db.commit()
    return {"status": "success"}
```

Modificar `update_catalogo_product` (líneas 1029-1049) para ramificar al inicio:

```python
@router.patch("/catalogo/{product_id}")
def update_catalogo_product(product_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    if _es_id_canonico(product_id):
        return _update_catalogo_producto_canonico(db, product_id, body)
    product_id = abs(product_id)
    allowed = ["nombre","descripcion","descripcion_larga","sku","precio_venta","precio_comparacion","descuento_pct","impuesto_pct","categoria","sub_categoria","marca","tipo_producto","stock_disponible","alerta_stock_minimo","publicado_web","rastrear_inventario","codigo_aduana","peso_kg","notas_internas","seo_titulo","seo_descripcion","seo_keywords"]
    json_fields = ["imagenes","atributos","variantes"]
    sets = []
    params: dict = {"id": product_id, "now": datetime.datetime.utcnow()}
    for k in allowed:
        if k in body:
            sets.append(f"{k}=:{k}")
            params[k] = body[k]
    for k in json_fields:
        if k in body:
            sets.append(f"{k}=CAST(:{k} AS jsonb)")
            params[k] = json_mod.dumps(body[k])
    if not sets:
        raise HTTPException(400, "Nada que actualizar")
    sets.append("updated_at=:now")
    db.execute(text(f"UPDATE ecommerce_products SET {', '.join(sets)} WHERE id=:id"), params)
    db.commit()
    return {"status": "success"}
```

(Único cambio al cuerpo original: las 2 líneas de branching al inicio, y `product_id = abs(product_id)` antes de construir `params`. El resto del cuerpo es idéntico byte-por-byte al original.)

- [ ] **Step 4: Ejecutar y verificar que las 5 pasan**

Run: `pytest tests/test_td03_parte3_doble_escritura_catalogo.py -v`
Expected: `5 passed`. Pegar la salida completa y real del comando en el reporte — no una descripción narrativa de lo que "debería" pasar.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/ecommerce.py backend/tests/test_td03_parte3_doble_escritura_catalogo.py
git commit -m "feat(td-03-p3): reconciliar id y doble-escritura en PATCH /catalogo"
```

---

### Task 2: DELETE canónico con protección del producto real

**Files:**
- Modify: `backend/app/api/v1/ecommerce.py` (agregar `_delete_catalogo_producto_canonico` después de `_update_catalogo_producto_canonico`; modificar `delete_catalogo_product`, líneas 1051-1056 del archivo original)
- Modify: `backend/tests/test_td03_parte3_doble_escritura_catalogo.py` (agregar 3 pruebas)

**Interfaces:**
- Consumes: `_es_id_canonico` (Task 1).
- Produces: `_delete_catalogo_producto_canonico(db: Session, sku_id: int) -> dict`

- [ ] **Step 1: Agregar 3 pruebas en rojo**

Agregar al final de `backend/tests/test_td03_parte3_doble_escritura_catalogo.py`:

```python
def test_delete_canonico_borra_listing_y_espejo_pero_no_el_producto_real(app_client, db, sku, product, admin_token, monkeypatch):
    from app.models.catalog import ProductWebListing, Product, ProductSKU
    listing = ProductWebListing(sku_id=sku.id, publicado_web=True)
    db.add(listing)
    db.commit()
    _ensure_ecommerce_tables(db)
    db.execute(
        text("INSERT INTO ecommerce_products (nombre, sku, publicado_web) VALUES (:nombre, :sku, TRUE)"),
        {"nombre": product.name, "sku": sku.sku},
    )
    db.commit()
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")

    resp = app_client.delete(
        f"/api/v1/ecommerce/catalogo/{sku.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    assert db.query(ProductWebListing).filter(ProductWebListing.sku_id == sku.id).first() is None
    espejo = db.execute(text("SELECT id FROM ecommerce_products WHERE sku=:sku"), {"sku": sku.sku}).fetchone()
    assert espejo is None

    # La garantia de seguridad critica de esta parte: el producto real sobrevive.
    assert db.query(ProductSKU).filter(ProductSKU.id == sku.id).first() is not None
    assert db.query(Product).filter(Product.id == product.id).first() is not None


def test_delete_canonico_sin_espejo_no_falla(app_client, db, sku, admin_token, monkeypatch):
    from app.models.catalog import ProductWebListing, ProductSKU
    listing = ProductWebListing(sku_id=sku.id, publicado_web=True)
    db.add(listing)
    db.commit()
    _ensure_ecommerce_tables(db)
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")

    resp = app_client.delete(
        f"/api/v1/ecommerce/catalogo/{sku.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert db.query(ProductWebListing).filter(ProductWebListing.sku_id == sku.id).first() is None
    assert db.query(ProductSKU).filter(ProductSKU.id == sku.id).first() is not None


def test_delete_huerfano_con_flag_on_usa_ruta_legacy(app_client, db, admin_token, monkeypatch):
    _ensure_ecommerce_tables(db)
    sku_huerfano = f"SKU-P3-DEL-HUERFANO-{uuid.uuid4().hex[:8]}"
    result = db.execute(
        text("INSERT INTO ecommerce_products (nombre, sku, publicado_web) VALUES ('Para Borrar', :sku, TRUE) RETURNING id"),
        {"sku": sku_huerfano},
    )
    ecom_id = result.fetchone()[0]
    db.commit()
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")

    resp = app_client.delete(
        f"/api/v1/ecommerce/catalogo/{-ecom_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    row = db.execute(text("SELECT id FROM ecommerce_products WHERE id=:id"), {"id": ecom_id}).fetchone()
    assert row is None
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `pytest tests/test_td03_parte3_doble_escritura_catalogo.py -v -k delete_canonico or delete_huerfano`
Expected: los 2 primeros fallan (hoy `DELETE ... WHERE id=:id` con `id=sku.id` positivo no borra nada relevante porque no existe fila `ecommerce_products.id` igual a `sku.id` por coincidencia — el `ProductWebListing` no se toca porque el endpoint actual no lo conoce; la aserción `is None` sobre `ProductWebListing` falla). El tercero puede pasar ya por la misma razón explicada en Task 1 Step 2 (comportamiento actual no verifica signo). Pegar salida real.

- [ ] **Step 3: Implementar `_delete_catalogo_producto_canonico` y ramificar el endpoint**

Insertar después de `_update_catalogo_producto_canonico`:

```python
def _delete_catalogo_producto_canonico(db: Session, sku_id: int) -> dict:
    canon_sku = db.query(ProductSKU).filter(ProductSKU.id == sku_id).first()
    if not canon_sku:
        raise HTTPException(404, "Producto no encontrado")
    if canon_sku.web_listing:
        db.delete(canon_sku.web_listing)
    db.execute(text("DELETE FROM ecommerce_products WHERE sku=:sku"), {"sku": canon_sku.sku})
    db.commit()
    return {"status": "success"}
```

Modificar `delete_catalogo_product`:

```python
@router.delete("/catalogo/{product_id}")
def delete_catalogo_product(product_id: int, user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    if _es_id_canonico(product_id):
        return _delete_catalogo_producto_canonico(db, product_id)
    db.execute(text("DELETE FROM ecommerce_products WHERE id=:id"), {"id": abs(product_id)})
    db.commit()
    return {"status": "success"}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `pytest tests/test_td03_parte3_doble_escritura_catalogo.py -v`
Expected: `8 passed` (5 de Task 1 + 3 de Task 2). Pegar salida real completa.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/ecommerce.py backend/tests/test_td03_parte3_doble_escritura_catalogo.py
git commit -m "feat(td-03-p3): DELETE canonico protegido — nunca borra ProductSKU/Product"
```

---

### Task 3: `/stats` consciente del flag

**Files:**
- Modify: `backend/app/api/v1/ecommerce.py` (agregar `_count_publicados_canonico` antes de `get_ecommerce_stats`, línea 316 del archivo original; modificar el bloque de `prod_pub` en `get_ecommerce_stats`)
- Modify: `backend/tests/test_td03_parte3_doble_escritura_catalogo.py` (agregar 2 pruebas)

**Interfaces:**
- Consumes: `_lectura_canonica` (ya existente).
- Produces: `_count_publicados_canonico(db: Session) -> int`

- [ ] **Step 1: Agregar 2 pruebas en rojo**

Agregar al final de `backend/tests/test_td03_parte3_doble_escritura_catalogo.py`:

```python
def test_stats_flag_off_cuenta_solo_ecommerce_products(app_client, db, admin_token, monkeypatch):
    _ensure_ecommerce_tables(db)
    monkeypatch.delenv("CATALOGO_LECTURA", raising=False)
    resp_before = app_client.get("/api/v1/ecommerce/stats", headers={"Authorization": f"Bearer {admin_token}"})
    count_before = resp_before.json()["data"]["productos_publicados"]

    sku_nuevo = f"SKU-P3-STATS-OFF-{uuid.uuid4().hex[:8]}"
    db.execute(
        text("INSERT INTO ecommerce_products (nombre, sku, publicado_web) VALUES ('Stats Off', :sku, TRUE)"),
        {"sku": sku_nuevo},
    )
    db.commit()
    try:
        resp_after = app_client.get("/api/v1/ecommerce/stats", headers={"Authorization": f"Bearer {admin_token}"})
        count_after = resp_after.json()["data"]["productos_publicados"]
        assert count_after - count_before == 1
    finally:
        db.execute(text("DELETE FROM ecommerce_products WHERE sku=:sku"), {"sku": sku_nuevo})
        db.commit()


def test_stats_flag_on_cuenta_emparejados_y_huerfanos_publicados(app_client, db, admin_token, monkeypatch):
    from app.models.catalog import ProductWebListing, Product, ProductSKU, Brand, Category
    _ensure_ecommerce_tables(db)
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    resp_before = app_client.get("/api/v1/ecommerce/stats", headers={"Authorization": f"Bearer {admin_token}"})
    count_before = resp_before.json()["data"]["productos_publicados"]

    brand = Brand(name=f"TestBrandP3-{uuid.uuid4().hex[:6]}")
    category = Category(name=f"TestCategoryP3-{uuid.uuid4().hex[:6]}")
    db.add(brand)
    db.add(category)
    db.commit()
    prod1 = Product(brand_id=brand.id, category_id=category.id, name="ProdPub", type="Fisico", base_currency="USD")
    prod2 = Product(brand_id=brand.id, category_id=category.id, name="ProdNoPub", type="Fisico", base_currency="USD")
    db.add(prod1)
    db.add(prod2)
    db.commit()
    sku1 = ProductSKU(product_id=prod1.id, sku=f"STATS-PUB-{uuid.uuid4().hex[:8]}", sale_price=10)
    sku2 = ProductSKU(product_id=prod2.id, sku=f"STATS-NOPUB-{uuid.uuid4().hex[:8]}", sale_price=10)
    db.add(sku1)
    db.add(sku2)
    db.commit()
    db.add(ProductWebListing(sku_id=sku1.id, publicado_web=True))
    db.add(ProductWebListing(sku_id=sku2.id, publicado_web=False))
    db.commit()

    sku_huerfano = f"STATS-HUERFANO-{uuid.uuid4().hex[:8]}"
    db.execute(
        text("INSERT INTO ecommerce_products (nombre, sku, publicado_web) VALUES ('Huerfano Stats', :sku, TRUE)"),
        {"sku": sku_huerfano},
    )
    db.commit()
    try:
        resp_after = app_client.get("/api/v1/ecommerce/stats", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp_after.status_code == 200
        count_after = resp_after.json()["data"]["productos_publicados"]
        assert count_after - count_before == 2
    finally:
        db.execute(text("DELETE FROM ecommerce_products WHERE sku=:sku"), {"sku": sku_huerfano})
        db.commit()
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `pytest tests/test_td03_parte3_doble_escritura_catalogo.py -v -k stats`
Expected: `test_stats_flag_off_cuenta_solo_ecommerce_products` probablemente **ya pasa** (el comportamiento de `/stats` con el flag apagado no cambia en esta parte). `test_stats_flag_on_cuenta_emparejados_y_huerfanos_publicados` falla porque hoy `/stats` no cuenta `sku1` (canónico sin fila espejo) — el delta observado será `1`, no `2`. Pegar salida real; si el primer test ya pasa antes de tocar código, explicarlo en el reporte, no forzarlo a fallar artificialmente.

- [ ] **Step 3: Implementar `_count_publicados_canonico` y ramificar `/stats`**

Insertar antes de `get_ecommerce_stats` (línea 316 del archivo original, justo después del comentario `# --- ECOMMERCE STATS ---`):

```python
def _count_publicados_canonico(db: Session) -> int:
    q = db.query(ProductSKU).outerjoin(ProductWebListing, ProductWebListing.sku_id == ProductSKU.id)
    q = q.filter((ProductWebListing.publicado_web == True) | (ProductWebListing.id.is_(None)))
    matched = q.count()
    huerfano_count = int(db.execute(text(
        "SELECT COUNT(*) FROM ecommerce_products "
        "WHERE publicado_web=TRUE "
        "AND (sku IS NULL OR NOT EXISTS (SELECT 1 FROM product_skus ps WHERE ps.sku = ecommerce_products.sku))"
    )).scalar() or 0)
    return matched + huerfano_count
```

Modificar el bloque `prod_pub` dentro de `get_ecommerce_stats` (líneas 334-337 del archivo original):

```python
    try:
        if _lectura_canonica():
            prod_pub = _count_publicados_canonico(db)
        else:
            prod_pub = int(db.execute(text("SELECT COUNT(*) FROM ecommerce_products WHERE publicado_web=TRUE")).scalar() or 0)
    except Exception:
        prod_pub = 0
```

(El resto de `get_ecommerce_stats` queda idéntico.)

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `pytest tests/test_td03_parte3_doble_escritura_catalogo.py -v`
Expected: `10 passed`. Pegar salida real completa.

- [ ] **Step 5: Ejecutar la suite completa del módulo de catálogo y ecommerce como regresión**

Run: `pytest tests/ -v -k "catalogo or ecommerce or td03"`
Expected: todas pasan (Partes 1 y 2 más las 10 nuevas de Parte 3), cero regresiones. Pegar salida real completa — no un resumen narrativo.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/ecommerce.py backend/tests/test_td03_parte3_doble_escritura_catalogo.py
git commit -m "feat(td-03-p3): /stats cuenta publicados canonicos + huerfanos segun flag"
```
