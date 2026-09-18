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
