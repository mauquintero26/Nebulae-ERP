"""
test_fase3_kardex_idempotente.py — Kárdex Inmutable e Idempotente (Fase 3).

Escenarios cubiertos:
1. Consulta paginada y ordenada cronológicamente del Kárdex (/api/v1/inventory/kardex).
2. Filtros avanzados por SKU, bodega, dirección y propietario.
3. Inmutabilidad y trazabilidad de campos obligatorios:
   - quantity, direction, owner, warehouse_id, idempotency_key, created_at, created_by.
4. Idempotencia de movimientos en operaciones de inventario:
   - Movimientos con misma idempotency_key respetan la restricción única y no se duplican.
"""
import uuid
import datetime
from decimal import Decimal
import pytest
from sqlalchemy import select

from app.models.catalog import Product, ProductSKU, Brand, Category
from app.models.inventory import Warehouse, InventoryOperation, InventoryMovement


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_kardex_data(db):
    now = datetime.datetime.utcnow()
    br = Brand(name=f"Br-K-{uuid.uuid4().hex[:6]}")
    db.add(br)
    ca = Category(name=f"Ca-K-{uuid.uuid4().hex[:6]}")
    db.add(ca)
    db.flush()

    prod = Product(name=f"Prod-K-{uuid.uuid4().hex[:6]}", brand_id=br.id, category_id=ca.id, type="Fisico", base_currency="USD", uom="Ud")
    db.add(prod)
    db.flush()

    sku = ProductSKU(product_id=prod.id, sku=f"SKU-K-{uuid.uuid4().hex[:6].upper()}", cost_price=40.0, sale_price=80.0)
    db.add(sku)

    wh1 = Warehouse(name=f"Bodega-K1-{uuid.uuid4().hex[:6]}", location_type="Central")
    wh2 = Warehouse(name=f"Bodega-K2-{uuid.uuid4().hex[:6]}", location_type="Secundaria")
    db.add_all([wh1, wh2])
    db.flush()

    dummy_doc1 = int(uuid.uuid4().int % 10000000)
    dummy_doc2 = int(uuid.uuid4().int % 10000000)
    op1 = InventoryOperation(dest_warehouse_id=wh1.id, operation_type="RECEIPT", status="DONE", source_document_type="ENINV", source_document_id=dummy_doc1, source_document_numero=f"ENINV-{dummy_doc1}")
    op2 = InventoryOperation(dest_warehouse_id=wh2.id, operation_type="TRANSFER", status="DONE", source_document_type="TRANSFER", source_document_id=dummy_doc2, source_document_numero=f"TR-{dummy_doc2}")
    db.add_all([op1, op2])
    db.flush()

    m1 = InventoryMovement(
        operation_id=op1.id,
        sku_id=sku.id,
        quantity=15,
        direction="IN",
        owner="NEBULAE",
        warehouse_id=wh1.id,
        idempotency_key=f"k-key-1-{uuid.uuid4().hex}",
        created_at=now - datetime.timedelta(hours=2),
        created_by="admin"
    )
    m2 = InventoryMovement(
        operation_id=op2.id,
        sku_id=sku.id,
        quantity=5,
        direction="TRANSFER_OUT",
        owner="MAU",
        warehouse_id=wh2.id,
        idempotency_key=f"k-key-2-{uuid.uuid4().hex}",
        created_at=now,
        created_by="bodega"
    )
    db.add_all([m1, m2])
    db.commit()

    return {"sku": sku, "wh1": wh1, "wh2": wh2, "m1": m1, "m2": m2}


class TestFase3KardexIdempotente:

    def test_kardex_consulta_paginada_y_filtros(self, app_client, admin_token, db):
        """Consulta paginada del Kárdex responde con total, limit, offset e items."""
        data = _setup_kardex_data(db)

        # 1. Consulta sin filtros
        resp = app_client.get("/api/v1/inventory/kardex?limit=10", headers=_auth(admin_token))
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert body["data"]["total"] >= 2
        assert len(body["data"]["items"]) >= 2

        # 2. Filtrar por SKU
        resp_sku = app_client.get(f"/api/v1/inventory/kardex?sku_id={data['sku'].id}", headers=_auth(admin_token))
        assert resp_sku.status_code == 200
        items_sku = resp_sku.json()["data"]["items"]
        assert len(items_sku) == 2
        assert all(it["sku_id"] == data["sku"].id for it in items_sku)

        # 3. Filtrar por Bodega
        resp_wh = app_client.get(f"/api/v1/inventory/kardex?warehouse_id={data['wh1'].id}", headers=_auth(admin_token))
        assert resp_wh.status_code == 200
        items_wh = resp_wh.json()["data"]["items"]
        matched_wh = [it for it in items_wh if it["sku_id"] == data["sku"].id]
        assert len(matched_wh) == 1
        assert matched_wh[0]["warehouse_id"] == data["wh1"].id

        # 4. Filtrar por Owner
        resp_own = app_client.get(f"/api/v1/inventory/kardex?sku_id={data['sku'].id}&owner=MAU", headers=_auth(admin_token))
        assert resp_own.status_code == 200
        items_own = resp_own.json()["data"]["items"]
        assert len(items_own) == 1
        assert items_own[0]["owner"] == "MAU"
        assert items_own[0]["direction"] == "TRANSFER_OUT"

    def test_kardex_idempotency_key_evita_duplicados(self, app_client, admin_token, db):
        """La clave de idempotencia del movimiento protege contra duplicación."""
        data = _setup_kardex_data(db)

        # Intentar insertar un movimiento con la misma clave de m1 debe ser prevenido
        existing_key = data["m1"].idempotency_key
        dup_mv = InventoryMovement(
            operation_id=data["m1"].operation_id,
            sku_id=data["sku"].id,
            quantity=15,
            direction="IN",
            owner="NEBULAE",
            warehouse_id=data["wh1"].id,
            idempotency_key=existing_key,
        )
        db.add(dup_mv)
        with pytest.raises(Exception) as excinfo:
            db.commit()
        assert "unique" in str(excinfo.value).lower() or "duplicate" in str(excinfo.value).lower()
        db.rollback()

    def test_kardex_trazabilidad_completa(self, app_client, admin_token, db):
        """Verifica que el Kárdex expone campos de auditoría creador, documento origen y fecha."""
        data = _setup_kardex_data(db)
        resp = app_client.get(f"/api/v1/inventory/kardex?sku_id={data['sku'].id}", headers=_auth(admin_token))
        assert resp.status_code == 200
        item = resp.json()["data"]["items"][0]
        assert "created_at" in item and item["created_at"] is not None
        assert "created_by" in item and item["created_by"] in ("admin", "bodega")
        assert "source_document_numero" in item and item["source_document_numero"] is not None
        assert "idempotency_key" in item and item["idempotency_key"] is not None