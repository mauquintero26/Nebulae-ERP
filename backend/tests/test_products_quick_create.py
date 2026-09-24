import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


class TestProductsQuickCreate:
    """/crm/products/quick-create es usado por el boton 'crear producto nuevo'
    del autocompletar de producto (Solicitud de Cliente y el modal de Leads
    del CRM). Desde que la migracion de Catalogo Configurable volvio
    brand_id/category_id NOT NULL en `products`, este endpoint quedo roto:
    solo enviaba name/sale_price y la insercion fallaba con
    psycopg2.errors.NotNullViolation."""

    def test_quick_create_sin_marca_ni_categoria_no_falla(self, app_client, admin_token):
        name = f"Producto Quick {uuid.uuid4().hex[:6]}"
        r = app_client.post(
            "/api/v1/crm/products/quick-create",
            json={"name": name, "sale_price": 0},
            headers=_headers(admin_token),
        )
        assert r.status_code == 200, r.text
        assert r.json()["data"]["product_name"] == name

    def test_quick_create_marca_producto_como_necesita_revision(self, app_client, admin_token, db):
        from app.models.catalog import Product
        name = f"Producto Revision {uuid.uuid4().hex[:6]}"
        r = app_client.post(
            "/api/v1/crm/products/quick-create",
            json={"name": name, "sale_price": 0},
            headers=_headers(admin_token),
        )
        product_id = r.json()["data"]["product_id"]
        prod = db.query(Product).filter(Product.id == product_id).first()
        assert prod.necesita_revision is True
        assert prod.brand_id is not None
        assert prod.category_id is not None

    def test_quick_create_reutiliza_la_misma_marca_placeholder(self, app_client, admin_token, db):
        from app.models.catalog import Product
        r1 = app_client.post(
            "/api/v1/crm/products/quick-create",
            json={"name": f"Producto A {uuid.uuid4().hex[:6]}", "sale_price": 0},
            headers=_headers(admin_token),
        )
        r2 = app_client.post(
            "/api/v1/crm/products/quick-create",
            json={"name": f"Producto B {uuid.uuid4().hex[:6]}", "sale_price": 0},
            headers=_headers(admin_token),
        )
        prod1 = db.query(Product).filter(Product.id == r1.json()["data"]["product_id"]).first()
        prod2 = db.query(Product).filter(Product.id == r2.json()["data"]["product_id"]).first()
        assert prod1.brand_id == prod2.brand_id
        assert prod1.category_id == prod2.category_id
