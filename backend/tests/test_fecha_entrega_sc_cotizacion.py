import pytest
from datetime import datetime, timedelta


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_crear_solicitud_normal_deriva_modalidad_normal(app_client, admin_token):
    resp = app_client.post("/api/v1/ventas/solicitudes", json={
        "customer_name": "Cliente Prueba", "tipo_solicitud": "Cotizacion de Producto",
        "advisor_name": "Asesor Prueba", "created_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 201
    assert resp.json()["data"]["modalidad_entrega"] == "NORMAL"


def test_crear_solicitud_inmediata_deriva_modalidad_inmediata(app_client, admin_token):
    resp = app_client.post("/api/v1/ventas/solicitudes", json={
        "customer_name": "Cliente Prueba", "tipo_solicitud": "Pedido Inmediato",
        "advisor_name": "Asesor Prueba", "created_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 201
    assert resp.json()["data"]["modalidad_entrega"] == "INMEDIATA"


def test_confirmar_solicitud_calcula_fecha_segun_modalidad(app_client, db, admin_token):
    sc_resp = app_client.post("/api/v1/ventas/solicitudes", json={
        "customer_name": "Cliente Prueba", "tipo_solicitud": "Pedido Inmediato",
        "advisor_name": "Asesor Prueba", "created_by": "test",
    }, headers=auth(admin_token))
    sc_id = sc_resp.json()["data"]["id"]
    # Fuerza el estado a CONFIRMADA -- Task 4 cambio la precondicion de confirmar_solicitud
    # para exigir que el cliente ya haya confirmado via el link publico (Gate 1), en vez de
    # aceptar BORRADOR/PENDIENTE_CONFIRMACION directamente.
    from app.models.erp_documents import CustomerRequest
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    sc.estado = "CONFIRMADA"
    db.commit()

    confirm_resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc_id}/confirmar", json={"user_name": "test"}, headers=auth(admin_token))
    assert confirm_resp.status_code == 200
    cot = confirm_resp.json()["data"]["cotizacion"]
    sc_after = confirm_resp.json()["data"]["sc"]
    assert sc_after["fecha_entrega_estimada"] is not None
    expected = datetime.utcnow() + timedelta(days=3)
    actual = datetime.fromisoformat(sc_after["fecha_entrega_estimada"].replace("Z", ""))
    assert abs((actual - expected).total_seconds()) < 60  # tolerancia de reloj del test
    assert cot["fecha_entrega_estimada"] == sc_after["fecha_entrega_estimada"]  # heredada, no recalculada
