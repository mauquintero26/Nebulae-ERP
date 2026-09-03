"""
test_receipt_partial.py -- Fase 1A v4

Tests:
- LOGISTICA receipt does NOT change stock
- LOGISTICA receipt does NOT advance PEC state
- First partial FISICA (5/10u) -> PEC state = PARCIALMENTE_RECIBIDA
- Second partial FISICA (5/10u) -> PEC state = RECIBIDA
- New ENINV from PEC after partial receipt copies only pending qty

NO pytest.skip() for any scenario.
"""
import uuid
import pytest


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def unique_key():
    return f"test-{uuid.uuid4().hex}"


class TestLogistica:
    def test_logistica_does_not_change_stock(
        self, app_client, admin_token, eninv_logistica, inv_level_zero, db
    ):
        """LOGISTICA confirmation must NOT increment inventory_levels."""
        key = unique_key()
        resp = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_logistica.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "LOGISTICA"},
            headers=auth(admin_token),
        )
        assert resp.status_code == 200, (
            f"LOGISTICA confirm should succeed, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()["data"]
        assert data["stock_actualizado"] is False, (
            "LOGISTICA receipt must have stock_actualizado=False"
        )
        assert data["estado"] == "COMPLETADA_LOGISTICA", (
            f"LOGISTICA receipt must be COMPLETADA_LOGISTICA, got {data['estado']}"
        )

        # Verify stock NOT incremented
        from sqlalchemy import text
        db.expire_all()
        qty = db.execute(
            text("SELECT quantity FROM inventory_levels WHERE sku_id=:sku AND warehouse_id=:wh"),
            {"sku": inv_level_zero.sku_id, "wh": inv_level_zero.warehouse_id},
        ).scalar()
        assert qty == 0, (
            f"LOGISTICA must not increment stock. Expected 0, got {qty}"
        )

    def test_logistica_does_not_advance_pec(
        self, app_client, admin_token, eninv_logistica, pec_10u, db
    ):
        """LOGISTICA confirmation must NOT change PEC estado."""
        original_estado = pec_10u.estado
        key = unique_key()
        resp = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_logistica.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "LOGISTICA"},
            headers=auth(admin_token),
        )
        assert resp.status_code == 200, f"LOGISTICA confirm failed: {resp.text}"

        # PEC estado must remain the same
        from sqlalchemy import text
        db.expire_all()
        pec_estado = db.execute(
            text("SELECT estado FROM purchase_orders_full WHERE id=:id"),
            {"id": pec_10u.id},
        ).scalar()
        assert pec_estado == original_estado, (
            f"LOGISTICA must not advance PEC estado. "
            f"Expected '{original_estado}', got '{pec_estado}'"
        )


class TestPartialReceipts:
    def test_first_partial_pec_is_parcialmente_recibida(
        self, app_client, admin_token, eninv_5u, pec_10u, inv_level_zero, db
    ):
        """First partial FISICA (5/10u) -> PEC becomes PARCIALMENTE_RECIBIDA."""
        key = unique_key()
        resp = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "FISICA"},
            headers=auth(admin_token),
        )
        assert resp.status_code == 200, (
            f"First partial confirm failed: {resp.status_code}: {resp.text}"
        )

        # PEC must be PARCIALMENTE_RECIBIDA
        from sqlalchemy import text
        db.expire_all()
        pec_estado = db.execute(
            text("SELECT estado FROM purchase_orders_full WHERE id=:id"),
            {"id": pec_10u.id},
        ).scalar()
        assert pec_estado == "PARCIALMENTE_RECIBIDA", (
            f"After 5/10u, PEC should be PARCIALMENTE_RECIBIDA. Got '{pec_estado}'"
        )

        # Stock must be exactly 5
        qty = db.execute(
            text("SELECT quantity FROM inventory_levels WHERE sku_id=:sku AND warehouse_id=:wh"),
            {"sku": inv_level_zero.sku_id, "wh": inv_level_zero.warehouse_id},
        ).scalar()
        assert qty == 5, f"Stock should be 5 after first partial. Got {qty}"

    def test_second_partial_pec_is_recibida(
        self, app_client, admin_token, eninv_5u, eninv_5u_b, pec_10u, inv_level_zero, db
    ):
        """First + second partial FISICA (5+5=10u) -> PEC becomes RECIBIDA."""
        # Confirm first 5u
        key1 = unique_key()
        r1 = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u.id}/confirmar",
            json={"idempotency_key": key1, "receipt_type": "FISICA"},
            headers=auth(admin_token),
        )
        assert r1.status_code == 200, f"First partial failed: {r1.text}"

        # Confirm second 5u
        key2 = unique_key()
        r2 = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u_b.id}/confirmar",
            json={"idempotency_key": key2, "receipt_type": "FISICA"},
            headers=auth(admin_token),
        )
        assert r2.status_code == 200, f"Second partial failed: {r2.text}"

        # PEC must be RECIBIDA (5+5=10 covers all 10 ordered)
        from sqlalchemy import text
        db.expire_all()
        pec_estado = db.execute(
            text("SELECT estado FROM purchase_orders_full WHERE id=:id"),
            {"id": pec_10u.id},
        ).scalar()
        assert pec_estado == "RECIBIDA", (
            f"After 10/10u, PEC should be RECIBIDA. Got '{pec_estado}'"
        )

        # Stock must be exactly 10
        qty = db.execute(
            text("SELECT quantity FROM inventory_levels WHERE sku_id=:sku AND warehouse_id=:wh"),
            {"sku": inv_level_zero.sku_id, "wh": inv_level_zero.warehouse_id},
        ).scalar()
        assert qty == 10, f"Stock should be 10 after both partials. Got {qty}"

    def test_new_eninv_from_pec_copies_only_pending(
        self, app_client, admin_token, eninv_5u, pec_10u, inv_level_zero, warehouse
    ):
        """After confirming 5u, creating a new ENINV from PEC copies only remaining 5u."""
        # Confirm 5u first
        key = unique_key()
        r1 = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "FISICA"},
            headers=auth(admin_token),
        )
        assert r1.status_code == 200, f"First partial failed: {r1.text}"

        # Create new ENINV from PEC -- should copy only 5 pending units
        r2 = app_client.post(
            f"/api/v1/compras/pedidos/{pec_10u.id}/recepcionar",
            json={"warehouse_id": warehouse.id, "created_by": "test"},
            headers=auth(admin_token),
        )
        assert r2.status_code in (200, 201), (
            f"Creating ENINV from PEC after partial should succeed, "
            f"got {r2.status_code}: {r2.text}"
        )
        data = r2.json().get("data", {})
        productos = data.get("productos", [])
        assert len(productos) > 0, "New ENINV should have at least one product"

        # Pending qty must be 5 (10 ordered - 5 already received)
        total_pending = sum(
            int(p.get("qty_esperada", p.get("qty", 0))) for p in productos
        )
        assert total_pending == 5, (
            f"New ENINV from PEC should have only 5 pending units. "
            f"Got {total_pending}: {productos}"
        )
