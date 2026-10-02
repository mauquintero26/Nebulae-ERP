"""Mismo patron que test_fecha_entrega_actividad_log.py (SC), aplicado al
Pedido de Compra (PEC): PATCH /compras/pedidos/{pec_id} con fecha_entrega_estimada
distinta debe quedar registrado en Actividad como FECHA_ENTREGA_MODIFICADA.
"""
from datetime import datetime, timedelta


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_editar_fecha_entrega_pec_registra_actividad(app_client, db, admin_token):
    from app.models.erp_documents import PurchaseOrderFull
    pec = PurchaseOrderFull(numero="PEC-TEST001", supplier_name="Proveedor Prueba",
                             estado="BORRADOR", productos=[],
                             fecha_entrega_estimada=datetime.utcnow() + timedelta(days=15))
    db.add(pec); db.commit(); db.refresh(pec)
    fecha_vieja = pec.fecha_entrega_estimada
    fecha_nueva = fecha_vieja + timedelta(days=5)

    resp = app_client.patch(f"/api/v1/compras/pedidos/{pec.id}", json={
        "fecha_entrega_estimada": fecha_nueva.isoformat(), "updated_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    log_resp = app_client.get(f"/api/v1/compras/pedidos/{pec.id}", headers=auth(admin_token)).json()["data"]
    actividades = log_resp.get("actividades", [])
    cambio = next((a for a in actividades if a["action"] == "FECHA_ENTREGA_MODIFICADA"), None)
    assert cambio is not None
    assert "+5" in cambio["description"] or "5 día" in cambio["description"]


def test_editar_fecha_entrega_pec_con_string_de_solo_fecha_reporta_diferencia_correcta(app_client, db, admin_token):
    """Final whole-branch review (hallazgo #2) -- ver el test equivalente en
    test_fecha_entrega_actividad_log.py (SC) para la explicacion completa."""
    from app.models.erp_documents import PurchaseOrderFull
    from datetime import datetime as dt
    fecha_vieja = dt(2026, 1, 10, 14, 32, 7)
    pec = PurchaseOrderFull(numero="PEC-TEST003", supplier_name="Proveedor Prueba",
                             estado="BORRADOR", productos=[],
                             fecha_entrega_estimada=fecha_vieja)
    db.add(pec); db.commit(); db.refresh(pec)

    resp = app_client.patch(f"/api/v1/compras/pedidos/{pec.id}", json={
        "fecha_entrega_estimada": "2026-01-15", "updated_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    log_resp = app_client.get(f"/api/v1/compras/pedidos/{pec.id}", headers=auth(admin_token)).json()["data"]
    actividades = log_resp.get("actividades", [])
    cambio = next((a for a in actividades if a["action"] == "FECHA_ENTREGA_MODIFICADA"), None)
    assert cambio is not None
    assert "+5" in cambio["description"] or "5 día" in cambio["description"]


def test_patch_pec_sin_fecha_entrega_no_registra_actividad_de_fecha(app_client, db, admin_token):
    from app.models.erp_documents import PurchaseOrderFull
    pec = PurchaseOrderFull(numero="PEC-TEST002", supplier_name="Proveedor Prueba",
                             estado="BORRADOR", productos=[],
                             fecha_entrega_estimada=datetime.utcnow() + timedelta(days=15))
    db.add(pec); db.commit(); db.refresh(pec)

    resp = app_client.patch(f"/api/v1/compras/pedidos/{pec.id}", json={
        "notas": "sin cambios de fecha", "updated_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    log_resp = app_client.get(f"/api/v1/compras/pedidos/{pec.id}", headers=auth(admin_token)).json()["data"]
    actividades = log_resp.get("actividades", [])
    cambio = next((a for a in actividades if a["action"] == "FECHA_ENTREGA_MODIFICADA"), None)
    assert cambio is None
