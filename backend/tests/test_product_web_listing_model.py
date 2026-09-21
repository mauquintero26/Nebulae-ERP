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
