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


def test_editar_fecha_entrega_sc_con_string_de_solo_fecha_reporta_diferencia_correcta(app_client, db, admin_token):
    """Final whole-branch review (hallazgo #2): las fechas se calculan como
    utcnow() + timedelta(...) (Task 1), asi que el valor guardado SIEMPRE trae una
    hora real (no medianoche) -- pero la UI de edicion real manda un string de SOLO
    fecha ('YYYY-MM-DD', hora implicita medianoche), no el timestamp completo que
    usan los demas tests de este archivo. Restar los timestamps crudos reportaba una
    diferencia incorrecta (aqui: 4 dias en vez de 5, por el componente de hora) en
    practicamente cualquier edicion real desde la UI real."""
    from app.models.erp_documents import CustomerRequest
    from datetime import datetime as dt
    fecha_vieja = dt(2026, 1, 10, 14, 32, 7)  # hora real, no medianoche -- igual que en produccion
    sc = CustomerRequest(numero="SC-TEST007", customer_name="Cliente Prueba",
                          estado="BORRADOR", fecha_entrega_estimada=fecha_vieja)
    db.add(sc); db.commit(); db.refresh(sc)

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "fecha_entrega_estimada": "2026-01-15", "updated_by": "test",  # solo fecha, como la UI real
    }, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    log_resp = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]
    actividades = log_resp.get("actividades", [])
    cambio = next((a for a in actividades if a["action"] == "FECHA_ENTREGA_MODIFICADA"), None)
    assert cambio is not None
    assert "+5" in cambio["description"] or "5 día" in cambio["description"]


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
