"""Editar manualmente fecha_entrega_estimada en una Solicitud de Cliente (SC)
debe quedar registrado en Actividad con el antes/despues y la diferencia en
dias. El mismo patron se replica para COT/PVEN/PEC en los archivos
_cot/_pven/_pec de este mismo modulo de tests.
"""
from datetime import datetime, timedelta


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_editar_fecha_entrega_sc_registra_actividad(app_client, db, admin_token):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TEST001", customer_name="Cliente Prueba",
                          estado="BORRADOR", fecha_entrega_estimada=datetime.utcnow() + timedelta(days=15))
    db.add(sc); db.commit(); db.refresh(sc)
    fecha_vieja = sc.fecha_entrega_estimada
    fecha_nueva = fecha_vieja + timedelta(days=5)

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "fecha_entrega_estimada": fecha_nueva.isoformat(), "updated_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    log_resp = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]
    actividades = log_resp.get("actividades", [])
    cambio = next((a for a in actividades if a["action"] == "FECHA_ENTREGA_MODIFICADA"), None)
    assert cambio is not None
    assert "+5" in cambio["description"] or "5 día" in cambio["description"]


def test_editar_fecha_entrega_sc_hacia_atras_registra_diferencia_negativa(app_client, db, admin_token):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TEST005", customer_name="Cliente Prueba",
                          estado="BORRADOR", fecha_entrega_estimada=datetime.utcnow() + timedelta(days=15))
    db.add(sc); db.commit(); db.refresh(sc)
    fecha_vieja = sc.fecha_entrega_estimada
    fecha_nueva = fecha_vieja - timedelta(days=3)

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "fecha_entrega_estimada": fecha_nueva.isoformat(), "updated_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    log_resp = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]
    actividades = log_resp.get("actividades", [])
    cambio = next((a for a in actividades if a["action"] == "FECHA_ENTREGA_MODIFICADA"), None)
    assert cambio is not None
    assert "-3" in cambio["description"]


def test_patch_sc_sin_fecha_entrega_no_registra_actividad_de_fecha(app_client, db, admin_token):
    """Si el PATCH no trae fecha_entrega_estimada, o la trae igual a la que ya
    tenia, no debe aparecer ninguna FECHA_ENTREGA_MODIFICADA."""
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TEST006", customer_name="Cliente Prueba",
                          estado="BORRADOR", fecha_entrega_estimada=datetime.utcnow() + timedelta(days=15))
    db.add(sc); db.commit(); db.refresh(sc)

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "notas": "sin cambios de fecha", "updated_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    log_resp = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]
    actividades = log_resp.get("actividades", [])
    cambio = next((a for a in actividades if a["action"] == "FECHA_ENTREGA_MODIFICADA"), None)
    assert cambio is None
