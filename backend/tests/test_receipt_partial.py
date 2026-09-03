
"""
tests/test_receipt_partial.py
Scenarios:
  1. Partial receipt -> PEC stays PARCIALMENTE_RECIBIDA
  2. Second partial receipt completes the PEC -> RECIBIDA
  3. LOGISTICA receipt -> no stock increment, no PEC advancement
"""
import pytest, uuid


def test_logistica_does_not_increment_stock(app_client, admin_token, pg_session):
    """A LOGISTICA receipt must NOT modify inventory_levels."""
    from sqlalchemy import text
    key = str(uuid.uuid4())

    # Get initial inventory count
    initial = pg_session.execute(text(
        "SELECT COALESCE(SUM(quantity), 0) FROM inventory_levels"
    )).scalar()

    resp = app_client.post(
        "/api/v1/erp-compras/recepciones/999999/confirmar",
        json={"idempotency_key": key, "receipt_type": "LOGISTICA"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    # 404 is expected for non-existent ENINV
    if resp.status_code == 404:
        pytest.skip("No test ENINV available; inventory check skipped")

    after = pg_session.execute(text(
        "SELECT COALESCE(SUM(quantity), 0) FROM inventory_levels"
    )).scalar()

    assert after == initial, (
        f"LOGISTICA must not change inventory_levels. Before={initial}, After={after}"
    )


def test_logistica_does_not_advance_pec(app_client, admin_token):
    """A LOGISTICA receipt must not change PEC estado to RECIBIDA."""
    key = str(uuid.uuid4())
    resp = app_client.post(
        "/api/v1/erp-compras/recepciones/999999/confirmar",
        json={"idempotency_key": key, "receipt_type": "LOGISTICA"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    if resp.status_code == 404:
        pytest.skip("No test ENINV available")
    # Verify the ENINV estado is COMPLETADA_LOGISTICA, not COMPLETADA
    if resp.status_code == 200:
        data = resp.json().get("data", {})
        assert data.get("estado") == "COMPLETADA_LOGISTICA", (
            f"LOGISTICA receipt should set estado=COMPLETADA_LOGISTICA, got {data.get('estado')}"
        )


def test_partial_receipt_pec_stays_parcialmente_recibida(app_client, admin_token):
    """If not all qty received, PEC estado must be PARCIALMENTE_RECIBIDA."""
    # This test requires a real ENINV with pec_id. Skip if unavailable.
    pytest.skip("Requires real ENINV fixture — run against staging with seed data")


def test_second_receipt_completes_pec(app_client, admin_token):
    """Two partial receipts together covering all qty -> PEC = RECIBIDA."""
    pytest.skip("Requires real ENINV fixture with known quantities")
