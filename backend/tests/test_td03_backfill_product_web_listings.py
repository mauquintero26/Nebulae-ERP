import json
from decimal import Decimal
from sqlalchemy import text
from app.api.v1.ecommerce import _ensure_ecommerce_tables


def test_backfill_copies_matched_sku(db, sku):
    _ensure_ecommerce_tables(db)
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

    assert not any(o[2] == sku.sku for o in result["orphaned"])
    row = db.execute(text(
        "SELECT descripcion_larga, seo_titulo, publicado_web FROM product_web_listings WHERE sku_id = :id"
    ), {"id": sku.id}).fetchone()
    assert row is not None
    assert row[0] == "Descripcion larga de prueba"
    assert row[1] == "SEO Test"
    assert row[2] is True


def test_backfill_reports_orphan_without_creating_product(db):
    _ensure_ecommerce_tables(db)
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

    assert any(o[2] == "SKU-NO-EXISTE-999" for o in result["orphaned"])
    count = db.execute(text(
        "SELECT COUNT(*) FROM product_web_listings pwl JOIN product_skus s ON pwl.sku_id = s.id "
        "WHERE s.sku = 'SKU-NO-EXISTE-999'"
    )).scalar()
    assert count == 0
    sku_count = db.execute(text(
        "SELECT COUNT(*) FROM product_skus WHERE sku = 'SKU-NO-EXISTE-999'"
    )).scalar()
    assert sku_count == 0


def test_backfill_dry_run_does_not_write(db, sku):
    _ensure_ecommerce_tables(db)
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
    _ensure_ecommerce_tables(db)
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


def test_backfill_reports_null_sku_as_orphaned(db):
    _ensure_ecommerce_tables(db)
    # Insert a product with NULL sku (no matching product in product_skus)
    db.execute(text("""
        INSERT INTO ecommerce_products (nombre, sku, publicado_web)
        VALUES ('Producto Sin SKU', NULL, TRUE)
    """))
    db.commit()

    count_before = db.execute(text("SELECT COUNT(*) FROM product_web_listings")).scalar()

    from scripts.backfill_product_web_listings import backfill, get_conn
    conn = get_conn()
    try:
        result = backfill(conn, dry_run=False)
    finally:
        conn.close()

    # NULL sku should be reported as orphaned
    assert any(o[2] is None for o in result["orphaned"])
    # No new listing row should be created for the NULL-sku product
    count_after = db.execute(text("SELECT COUNT(*) FROM product_web_listings")).scalar()
    assert count_after == count_before


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
