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
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    resp = app_client.get("/api/v1/ecommerce/catalogo", params={"search": sku.sku})
    assert resp.status_code == 200
    item = next(p for p in resp.json()["data"] if p["sku"] == sku.sku)
    assert item["precio_venta"] == float(sku.sale_price)


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
