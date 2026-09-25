import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


class TestTransferMuevaStockReal:
    """Bug reportado: Traslados/Ajustes (frontend) enviaban 'productos'/'motivo'
    a /inventory/operations, pero el schema real solo acepta 'movements'
    [{sku_id, quantity}] -- Pydantic descartaba en silencio todo lo demas y
    el endpoint ni siquiera tocaba InventoryLevel. El POST devolvia 201 pero
    no se movia ni una unidad de stock real."""

    def test_transfer_resta_en_origen_y_suma_en_destino(self, app_client, admin_token, db, sku, warehouse):
        from app.models.inventory import Warehouse, InventoryLevel
        destino = Warehouse(name=f"BodegaDestino-{uuid.uuid4().hex[:6]}", location_type="Central")
        db.add(destino); db.commit()
        origen_lvl = InventoryLevel(sku_id=sku.id, warehouse_id=warehouse.id, quantity=10)
        db.add(origen_lvl); db.commit()

        r = app_client.post(
            "/api/v1/inventory/operations",
            json={
                "operation_type": "TRANSFER",
                "source_warehouse_id": warehouse.id,
                "dest_warehouse_id": destino.id,
                "notas": "Reabastecer bodega destino",
                "movements": [{"sku_id": sku.id, "quantity": 4}],
            },
            headers=_headers(admin_token),
        )
        assert r.status_code == 201, r.text
        data = r.json()["data"]
        assert data["notas"] == "Reabastecer bodega destino"
        assert len(data["movements"]) == 2, "Un TRANSFER debe generar 2 movimientos (OUT en origen, IN en destino)"

        from app.db.database import SessionLocal
        fresh = SessionLocal()
        try:
            src = fresh.query(InventoryLevel).filter_by(sku_id=sku.id, warehouse_id=warehouse.id).first()
            dst = fresh.query(InventoryLevel).filter_by(sku_id=sku.id, warehouse_id=destino.id).first()
            assert float(src.quantity) == 6, "Origen debe quedar en 10-4=6"
            assert float(dst.quantity) == 4, "Destino debe quedar en 0+4=4"
        finally:
            fresh.close()

    def test_transfer_rechaza_si_no_hay_stock_suficiente(self, app_client, admin_token, db, sku, warehouse):
        from app.models.inventory import Warehouse, InventoryLevel
        destino = Warehouse(name=f"BodegaDestino2-{uuid.uuid4().hex[:6]}", location_type="Central")
        db.add(destino); db.commit()
        origen_lvl = InventoryLevel(sku_id=sku.id, warehouse_id=warehouse.id, quantity=2)
        db.add(origen_lvl); db.commit()

        r = app_client.post(
            "/api/v1/inventory/operations",
            json={
                "operation_type": "TRANSFER",
                "source_warehouse_id": warehouse.id,
                "dest_warehouse_id": destino.id,
                "movements": [{"sku_id": sku.id, "quantity": 50}],
            },
            headers=_headers(admin_token),
        )
        assert r.status_code == 409, r.text

        from app.db.database import SessionLocal
        fresh = SessionLocal()
        try:
            src = fresh.query(InventoryLevel).filter_by(sku_id=sku.id, warehouse_id=warehouse.id).first()
            assert float(src.quantity) == 2, "El stock de origen no debe cambiar si el traslado fue rechazado"
        finally:
            fresh.close()

    def test_transfer_requiere_ambas_bodegas(self, app_client, admin_token, sku, warehouse):
        r = app_client.post(
            "/api/v1/inventory/operations",
            json={"operation_type": "TRANSFER", "source_warehouse_id": warehouse.id,
                  "movements": [{"sku_id": sku.id, "quantity": 1}]},
            headers=_headers(admin_token),
        )
        assert r.status_code == 422


class TestAdjustmentMuevaStockReal:
    def test_ajuste_entrada_suma_stock_y_guarda_motivo(self, app_client, admin_token, db, sku, warehouse, inv_level_zero):
        r = app_client.post(
            "/api/v1/inventory/operations",
            json={
                "operation_type": "ADJUSTMENT",
                "dest_warehouse_id": warehouse.id,
                "notas": "Sobrante en conteo fisico",
                "movements": [{"sku_id": sku.id, "quantity": 5, "direction": "IN"}],
            },
            headers=_headers(admin_token),
        )
        assert r.status_code == 201, r.text
        assert r.json()["data"]["notas"] == "Sobrante en conteo fisico"

        from app.db.database import SessionLocal
        from app.models.inventory import InventoryLevel
        fresh = SessionLocal()
        try:
            lvl = fresh.query(InventoryLevel).filter_by(sku_id=sku.id, warehouse_id=warehouse.id).first()
            assert float(lvl.quantity) == 5
        finally:
            fresh.close()

    def test_ajuste_salida_resta_stock(self, app_client, admin_token, db, sku, warehouse):
        from app.models.inventory import InventoryLevel
        lvl = InventoryLevel(sku_id=sku.id, warehouse_id=warehouse.id, quantity=8)
        db.add(lvl); db.commit()

        r = app_client.post(
            "/api/v1/inventory/operations",
            json={
                "operation_type": "ADJUSTMENT",
                "dest_warehouse_id": warehouse.id,
                "notas": "Producto danado",
                "movements": [{"sku_id": sku.id, "quantity": 3, "direction": "OUT"}],
            },
            headers=_headers(admin_token),
        )
        assert r.status_code == 201, r.text

        from app.db.database import SessionLocal
        fresh = SessionLocal()
        try:
            fresh_lvl = fresh.query(InventoryLevel).filter_by(sku_id=sku.id, warehouse_id=warehouse.id).first()
            assert float(fresh_lvl.quantity) == 5
        finally:
            fresh.close()

    def test_ajuste_salida_no_deja_stock_negativo(self, app_client, admin_token, db, sku, warehouse, inv_level_zero):
        r = app_client.post(
            "/api/v1/inventory/operations",
            json={
                "operation_type": "ADJUSTMENT",
                "dest_warehouse_id": warehouse.id,
                "movements": [{"sku_id": sku.id, "quantity": 3, "direction": "OUT"}],
            },
            headers=_headers(admin_token),
        )
        assert r.status_code == 409, r.text


class TestOperationTypeInvalido:
    def test_operation_type_no_reconocido_es_422(self, app_client, admin_token, sku, warehouse):
        r = app_client.post(
            "/api/v1/inventory/operations",
            json={"operation_type": "NO_EXISTE", "dest_warehouse_id": warehouse.id,
                  "movements": [{"sku_id": sku.id, "quantity": 1}]},
            headers=_headers(admin_token),
        )
        assert r.status_code == 422


class TestListaFiltraPorTipo:
    def test_get_operations_filtra_por_operation_type(self, app_client, admin_token, db, sku, warehouse, inv_level_zero):
        app_client.post(
            "/api/v1/inventory/operations",
            json={"operation_type": "ADJUSTMENT", "dest_warehouse_id": warehouse.id,
                  "movements": [{"sku_id": sku.id, "quantity": 1, "direction": "IN"}]},
            headers=_headers(admin_token),
        )
        r = app_client.get("/api/v1/inventory/operations?operation_type=TRANSFER", headers=_headers(admin_token))
        assert r.status_code == 200, r.text
        assert all(o["operation_type"] == "TRANSFER" for o in r.json()["data"])

        r2 = app_client.get("/api/v1/inventory/operations?operation_type=ADJUSTMENT", headers=_headers(admin_token))
        assert any(o["operation_type"] == "ADJUSTMENT" for o in r2.json()["data"])
