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
