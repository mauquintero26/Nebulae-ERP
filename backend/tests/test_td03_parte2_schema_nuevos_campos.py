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
