import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


class TestCreacionMasivaSKUs:

    def test_crea_combinaciones_en_una_transaccion(self, app_client, admin_token, product):
        body = {
            "skus": [
                {"sku": f"CAM-S-ROJO-{uuid.uuid4().hex[:6]}", "sale_price": 50000, "attributes": [
                    {"attribute_name": "Talla", "value": "S"}, {"attribute_name": "Color", "value": "Rojo"}]},
                {"sku": f"CAM-M-ROJO-{uuid.uuid4().hex[:6]}", "sale_price": 50000, "attributes": [
                    {"attribute_name": "Talla", "value": "M"}, {"attribute_name": "Color", "value": "Rojo"}]},
            ]
        }
        r = app_client.post(f"/api/v1/products/{product.id}/skus/bulk", json=body, headers=_headers(admin_token))
        assert r.status_code == 201
        assert r.json()["data"]["created"] == 2

    def test_reusa_atributos_y_valores_existentes(self, app_client, admin_token, product, db):
        from app.models.catalog import Attribute
        sufijo = uuid.uuid4().hex[:6]
        body = {"skus": [{"sku": f"CAM-L1-{sufijo}", "sale_price": 50000,
                           "attributes": [{"attribute_name": f"Talla{sufijo}", "value": "L"}]}]}
        app_client.post(f"/api/v1/products/{product.id}/skus/bulk", json=body, headers=_headers(admin_token))
        body2 = {"skus": [{"sku": f"CAM-L2-{sufijo}", "sale_price": 50000,
                            "attributes": [{"attribute_name": f"Talla{sufijo}", "value": "L"}]}]}
        r = app_client.post(f"/api/v1/products/{product.id}/skus/bulk", json=body2, headers=_headers(admin_token))
        assert r.status_code == 201
        atributos = db.query(Attribute).filter(Attribute.name == f"Talla{sufijo}").all()
        assert len(atributos) == 1

    def test_rechaza_sku_duplicado_dentro_del_mismo_lote(self, app_client, admin_token, product):
        dup = f"CAM-DUP-{uuid.uuid4().hex[:6]}"
        body = {"skus": [
            {"sku": dup, "sale_price": 50000, "attributes": []},
            {"sku": dup, "sale_price": 50000, "attributes": []},
        ]}
        r = app_client.post(f"/api/v1/products/{product.id}/skus/bulk", json=body, headers=_headers(admin_token))
        assert r.status_code == 400

    def test_rollback_total_si_una_combinacion_falla(self, app_client, admin_token, product, db):
        from app.models.catalog import ProductSKU
        existente = f"CAM-EXISTENTE-{uuid.uuid4().hex[:6]}"
        nuevo_ok = f"CAM-NUEVO-OK-{uuid.uuid4().hex[:6]}"
        app_client.post(f"/api/v1/products/{product.id}/skus/bulk",
                         json={"skus": [{"sku": existente, "sale_price": 1000, "attributes": []}]},
                         headers=_headers(admin_token))
        body = {"skus": [
            {"sku": nuevo_ok, "sale_price": 1000, "attributes": []},
            {"sku": existente, "sale_price": 1000, "attributes": []},
        ]}
        r = app_client.post(f"/api/v1/products/{product.id}/skus/bulk", json=body, headers=_headers(admin_token))
        assert r.status_code == 400
        assert db.query(ProductSKU).filter(ProductSKU.sku == nuevo_ok).first() is None

    def test_crea_stock_inicial_cuando_se_indica(self, app_client, admin_token, product, db):
        from app.models.inventory import InventoryLevel
        from app.models.catalog import ProductSKU
        sku_code = f"CAM-CON-STOCK-{uuid.uuid4().hex[:6]}"
        body = {"skus": [{"sku": sku_code, "sale_price": 1000, "initial_stock": 25, "attributes": []}]}
        r = app_client.post(f"/api/v1/products/{product.id}/skus/bulk", json=body, headers=_headers(admin_token))
        assert r.status_code == 201
        sku = db.query(ProductSKU).filter(ProductSKU.sku == sku_code).first()
        nivel = db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id).first()
        assert nivel is not None
        assert nivel.quantity == 25
