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

    resp = app_client.get("/api/v1/ecommerce/catalogo", params={"search": sku.sku})
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

    resp = app_client.get("/api/v1/ecommerce/catalogo", params={"search": sku.sku})
    assert resp.status_code == 200
    item = next(p for p in resp.json()["data"] if p["sku"] == sku.sku)
    assert item["id"] == sku.id
    assert item["precio_comparacion"] == 99000.0
    assert item["sub_categoria"] == "Camisetas"
    assert item["impuesto_pct"] == 19.0


def test_catalogo_canonico_precio_venta_coincide_con_sale_price(app_client, db, sku, monkeypatch):
    _ensure_ecommerce_tables(db)
    # Fila conflictiva en ecommerce_products con un precio distinto -- reproduce
    # el escenario real del bug de fraude falso-positivo documentado en la
    # auditoria de Fase C: GET /catalogo mostraba este precio, pero
    # create_web_order valida contra ProductSKU.sale_price.
    db.execute(text("""
        INSERT INTO ecommerce_products (nombre, sku, precio_venta, publicado_web)
        VALUES ('Producto Precio Divergente', :sku, 99999, TRUE)
    """), {"sku": sku.sku})
    db.commit()
    try:
        monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
        resp = app_client.get("/api/v1/ecommerce/catalogo", params={"search": sku.sku})
        assert resp.status_code == 200
        item = next(p for p in resp.json()["data"] if p["sku"] == sku.sku)
        assert item["precio_venta"] == float(sku.sale_price)

        # Documenta el bug original: con el flag apagado, legacy SI muestra
        # el precio divergente de ecommerce_products.
        monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
        resp_legacy = app_client.get("/api/v1/ecommerce/catalogo", params={"search": sku.sku})
        item_legacy = next(p for p in resp_legacy.json()["data"] if p["sku"] == sku.sku)
        assert item_legacy["precio_venta"] == 99999.0
    finally:
        db.execute(text("DELETE FROM ecommerce_products WHERE sku = :sku"), {"sku": sku.sku})
        db.commit()


def test_catalogo_canonico_sku_sin_listing_usa_defaults(app_client, db, sku, monkeypatch):
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    resp = app_client.get("/api/v1/ecommerce/catalogo", params={"search": sku.sku})
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
        resp = app_client.get("/api/v1/ecommerce/catalogo", params={"search": sku_huerfano})
        assert resp.status_code == 200
        item = next(p for p in resp.json()["data"] if p["sku"] == sku_huerfano)
        assert item["id"] < 0
    finally:
        db.execute(text("DELETE FROM ecommerce_products WHERE sku = :sku"), {"sku": sku_huerfano})
        db.commit()


def test_catalogo_detalle_canonico_por_sku_id(app_client, db, sku, monkeypatch):
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    resp = app_client.get(f"/api/v1/ecommerce/catalogo/{sku.id}")
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
        resp = app_client.get(f"/api/v1/ecommerce/catalogo/{-ecom_id}")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["sku"] == sku_huerfano
        assert data["id"] == -ecom_id
    finally:
        db.execute(text("DELETE FROM ecommerce_products WHERE sku = :sku"), {"sku": sku_huerfano})
        db.commit()


def test_catalogo_detalle_canonico_404_si_no_existe(app_client, db, monkeypatch):
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    resp = app_client.get("/api/v1/ecommerce/catalogo/999999999")
    assert resp.status_code == 404


def test_categorias_canonico_incluye_categoria_y_subcategoria(app_client, db, sku, monkeypatch):
    from app.models.catalog import ProductWebListing
    listing = ProductWebListing(sku_id=sku.id, sub_categoria="Deportivas", publicado_web=True)
    db.add(listing)
    db.commit()
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")

    resp = app_client.get("/api/v1/ecommerce/categorias")
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
    resp = app_client.get("/api/v1/ecommerce/categorias")
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
        resp = app_client.get("/api/v1/ecommerce/categorias")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert any(c["nombre"] == cat_huerfana for c in data)
    finally:
        db.execute(text("DELETE FROM ecommerce_products WHERE sku = :sku"), {"sku": sku_huerfano})
        db.commit()


def test_catalogo_detalle_legacy_usa_ruta_antigua_con_flag_off(app_client, db, sku, monkeypatch):
    from app.models.catalog import ProductWebListing
    _ensure_ecommerce_tables(db)
    result = db.execute(text("""
        INSERT INTO ecommerce_products (nombre, sku, publicado_web)
        VALUES ('Producto Legacy Detalle', :sku, TRUE)
        RETURNING id
    """), {"sku": sku.sku})
    ecom_id = result.fetchone()[0]
    db.commit()
    listing = ProductWebListing(sku_id=sku.id, descripcion_larga="Version canonica", publicado_web=True)
    db.add(listing)
    db.commit()
    monkeypatch.delenv("CATALOGO_LECTURA", raising=False)

    try:
        resp = app_client.get(f"/api/v1/ecommerce/catalogo/{ecom_id}")
        assert resp.status_code == 200
        data = resp.json()["data"]
        # Legacy lee directo de ecommerce_products por su propio id -- nunca
        # ve la version canonica del ProductWebListing, aunque exista.
        assert data.get("descripcion_larga") != "Version canonica"
    finally:
        db.execute(text("DELETE FROM ecommerce_products WHERE id = :id"), {"id": ecom_id})
        db.commit()


def test_categorias_legacy_ignora_web_listing_con_flag_off(app_client, db, sku, monkeypatch):
    from app.models.catalog import ProductWebListing
    listing = ProductWebListing(sku_id=sku.id, sub_categoria="SoloCanonicoSubcat", publicado_web=True)
    db.add(listing)
    db.commit()
    monkeypatch.delenv("CATALOGO_LECTURA", raising=False)

    resp = app_client.get("/api/v1/ecommerce/categorias")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert not any("SoloCanonicoSubcat" in c.get("sub_categorias", []) for c in data)
