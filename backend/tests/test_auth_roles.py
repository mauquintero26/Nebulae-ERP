
"""
tests/test_auth_roles.py
Scenarios:
  1. No token -> 401
  2. Unauthorized role (Vendedor) on bodega-only endpoint -> 403
  3. Legacy role "Admin" is normalized and authorized -> 200/404
  4. Legacy role "Vendedor" is authorized on asesor endpoints -> 200
"""
import pytest


def test_no_token_returns_401(app_client):
    """Any protected endpoint without a token must return 401."""
    resp = app_client.post("/api/v1/erp-compras/recepciones/9999/confirmar", json={})
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"


def test_unauthorized_role_returns_403(app_client, vendedor_token):
    """Vendedor -> ASESOR, which is not in ROLE_BODEGA. Must get 403."""
    resp = app_client.post(
        "/api/v1/erp-compras/recepciones/9999/confirmar",
        json={"idempotency_key": "test-role-403", "receipt_type": "FISICA"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


def test_legacy_admin_role_is_authorized(app_client, admin_token):
    """Legacy role Admin -> normalizes to ADMIN -> authorized for confirmar."""
    resp = app_client.post(
        "/api/v1/erp-compras/recepciones/999999/confirmar",
        json={"idempotency_key": "test-admin-auth", "receipt_type": "FISICA"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    # Either 404 (ENINV not found) or 200/409 is acceptable — NOT 401 or 403
    assert resp.status_code not in (401, 403), (
        f"Admin should be authorized. Got {resp.status_code}: {resp.text}"
    )


def test_vendedor_authorized_for_ventas_list(app_client, vendedor_token):
    """Legacy role Vendedor -> ASESOR -> authorized for GET ventas endpoints."""
    resp = app_client.get(
        "/api/v1/erp-ventas/solicitudes",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200, (
        f"Vendedor should read solicitudes. Got {resp.status_code}: {resp.text}"
    )
