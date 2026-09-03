"""
test_auth_roles.py -- Fase 1A v4

Tests:
- No token -> 401
- Wrong role -> 403
- Legacy Admin role -> authorized (200 or 404, not 401/403)
- Legacy Vendedor role -> authorized on read endpoints

NO pytest.skip() for critical scenarios.
All data created via real fixtures in test schema.
"""
import pytest


def auth(token):
    return {"Authorization": f"Bearer {token}"}


class TestNoToken:
    def test_no_token_returns_401(self, app_client):
        """Unauthenticated request must return 401."""
        resp = app_client.get("/api/v1/compras/pedidos")
        assert resp.status_code == 401, (
            f"Expected 401 without token, got {resp.status_code}: {resp.text}"
        )


class TestUnauthorizedRole:
    def test_vendedor_cannot_confirm_receipt(self, app_client, vendedor_token, eninv_5u):
        """Vendedor role must be rejected (403) on BODEGA-only endpoint."""
        payload = {
            "idempotency_key": "test-403-vendedor-" + "x" * 8,
            "receipt_type": "FISICA",
        }
        resp = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u.id}/confirmar",
            json=payload,
            headers=auth(vendedor_token),
        )
        assert resp.status_code == 403, (
            f"Vendedor should not confirm receipts. Got {resp.status_code}: {resp.text}"
        )

    def test_invalid_token_returns_401(self, app_client):
        """Malformed token must return 401."""
        resp = app_client.get(
            "/api/v1/compras/pedidos",
            headers={"Authorization": "Bearer notavalidtoken"},
        )
        assert resp.status_code == 401, (
            f"Expected 401 with invalid token, got {resp.status_code}"
        )


class TestLegacyAdminRole:
    def test_admin_can_list_pedidos(self, app_client, admin_token, pec_10u):
        """Legacy Admin role must be authorized on /pedidos (all ERP roles allowed)."""
        resp = app_client.get(
            "/api/v1/compras/pedidos",
            headers=auth(admin_token),
        )
        # 200 = success (even if 0 results; 404 means route issue)
        assert resp.status_code == 200, (
            f"Admin should list pedidos. Got {resp.status_code}: {resp.text}"
        )

    def test_admin_can_access_specific_pec(self, app_client, admin_token, pec_10u):
        """Admin can access a specific PEC by ID."""
        resp = app_client.get(
            f"/api/v1/compras/pedidos/{pec_10u.id}",
            headers=auth(admin_token),
        )
        assert resp.status_code == 200, (
            f"Admin should access PEC {pec_10u.id}. Got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data["status"] == "success"
        assert data["data"]["id"] == pec_10u.id

    def test_admin_can_list_recepciones(self, app_client, admin_token, eninv_5u):
        """Admin can access the ENINV list endpoint."""
        resp = app_client.get(
            "/api/v1/compras/recepciones",
            headers=auth(admin_token),
        )
        assert resp.status_code == 200, (
            f"Admin should list recepciones. Got {resp.status_code}: {resp.text}"
        )


class TestLegacyVendedorRole:
    def test_vendedor_can_list_pedidos(self, app_client, vendedor_token, pec_10u):
        """Legacy Vendedor is in ALL_ERP_ROLES -- should be able to read pedidos."""
        resp = app_client.get(
            "/api/v1/compras/pedidos",
            headers=auth(vendedor_token),
        )
        assert resp.status_code == 200, (
            f"Vendedor should read pedidos. Got {resp.status_code}: {resp.text}"
        )

    def test_vendedor_can_read_ventas(self, app_client, vendedor_token):
        """Vendedor can access ventas solicitudes list."""
        resp = app_client.get(
            "/api/v1/ventas/solicitudes",
            headers=auth(vendedor_token),
        )
        assert resp.status_code == 200, (
            f"Vendedor should read solicitudes. Got {resp.status_code}: {resp.text}"
        )
