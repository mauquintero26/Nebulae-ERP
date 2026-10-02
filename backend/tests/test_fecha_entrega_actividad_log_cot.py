"""Mismo patron que test_fecha_entrega_actividad_log.py (SC), aplicado a la
Cotizacion (COT): PATCH /ventas/cotizaciones/{cot_id} con fecha_entrega_estimada
distinta debe quedar registrado en Actividad como FECHA_ENTREGA_MODIFICADA.
"""
from datetime import datetime, timedelta


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_editar_fecha_entrega_cot_registra_actividad(app_client, db, admin_token):
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TEST001", customer_name="Cliente Prueba",
                          estado="BORRADOR", fecha_entrega_estimada=datetime.utcnow() + timedelta(days=15))
    db.add(cot); db.commit(); db.refresh(cot)
    fecha_vieja = cot.fecha_entrega_estimada
    fecha_nueva = fecha_vieja + timedelta(days=5)

    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "fecha_entrega_estimada": fecha_nueva.isoformat(), "updated_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    log_resp = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token)).json()["data"]
    actividades = log_resp.get("actividades", [])
    cambio = next((a for a in actividades if a["action"] == "FECHA_ENTREGA_MODIFICADA"), None)
    assert cambio is not None
    assert "+5" in cambio["description"] or "5 día" in cambio["description"]


def test_patch_cot_sin_fecha_entrega_no_registra_actividad_de_fecha(app_client, db, admin_token):
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TEST002", customer_name="Cliente Prueba",
                          estado="BORRADOR", fecha_entrega_estimada=datetime.utcnow() + timedelta(days=15))
    db.add(cot); db.commit(); db.refresh(cot)

    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "notas": "sin cambios de fecha", "updated_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    log_resp = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token)).json()["data"]
    actividades = log_resp.get("actividades", [])
    cambio = next((a for a in actividades if a["action"] == "FECHA_ENTREGA_MODIFICADA"), None)
    assert cambio is None
