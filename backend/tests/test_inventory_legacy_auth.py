def test_list_warehouses_requires_auth(app_client):
    resp = app_client.get("/api/v1/inventory/warehouses")
    assert resp.status_code == 401


def test_create_warehouse_requires_auth(app_client):
    resp = app_client.post("/api/v1/inventory/warehouses", json={"name": "Bodega Pirata"})
    assert resp.status_code == 401


def test_create_warehouse_with_valid_token_succeeds(app_client, admin_token):
    resp = app_client.post(
        "/api/v1/inventory/warehouses",
        json={"name": "Bodega Autorizada"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201


def test_list_operations_requires_auth(app_client):
    resp = app_client.get("/api/v1/inventory/operations")
    assert resp.status_code == 401
