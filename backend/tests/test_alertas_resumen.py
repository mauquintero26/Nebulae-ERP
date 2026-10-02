"""Test for alertas resumen endpoint (global alert for late documents)."""
import pytest
from datetime import datetime, timedelta
from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder


def test_alertas_resumen_cuenta_atrasados(app_client, db, admin_token):
    """Test that alertas/resumen counts late documents across SC, COT, VEN."""
    # Create a late CustomerRequest (10 days old)
    viejo_sc = CustomerRequest(
        numero="SC-ALERTOLD",
        customer_name="X",
        estado="BORRADOR",
        updated_at=datetime.utcnow() - timedelta(days=10),
    )
    # Create a recent CustomerRequest (new)
    nuevo_sc = CustomerRequest(
        numero="SC-ALERTNEW",
        customer_name="Y",
        estado="BORRADOR",
        updated_at=datetime.utcnow(),
    )

    db.add_all([viejo_sc, nuevo_sc])
    db.commit()

    # Make request to endpoint with admin token
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = app_client.get("/api/v1/ventas/alertas/resumen", headers=headers)

    # Should return 200 and count at least the old SC
    assert resp.status_code == 200
    data = resp.json()
    assert "data" in data
    assert "atrasados" in data["data"]
    assert data["data"]["atrasados"] >= 1


def test_alertas_resumen_multiple_documentos(app_client, db, admin_token):
    """Test counting across all three document types."""
    # Create old documents across all three types
    viejo_sc = CustomerRequest(
        numero="SC-OLD-001",
        customer_name="Test",
        estado="PENDIENTE_CONFIRMACION",
        updated_at=datetime.utcnow() - timedelta(days=5),
    )
    viejo_cot = SalesQuotation(
        numero="COT-OLD-001",
        customer_name="Test",
        estado="ENVIADA",
        updated_at=datetime.utcnow() - timedelta(days=5),
    )
    viejo_ven = SaleOrder(
        numero="VEN-OLD-001",
        customer_name="Test",
        estado="EN_PROCESO",
        updated_at=datetime.utcnow() - timedelta(days=5),
    )

    db.add_all([viejo_sc, viejo_cot, viejo_ven])
    db.commit()

    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = app_client.get("/api/v1/ventas/alertas/resumen", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["data"]["atrasados"] >= 3
