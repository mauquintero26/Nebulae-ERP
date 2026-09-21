import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _crear_solicitud_y_confirmar(client, admin_token):
    sc = client.post("/api/v1/ventas/solicitudes", json={
        "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
        "tipo_solicitud": "Cotizacion de Producto",
    }, headers=_headers(admin_token)).json()["data"]
    r = client.post(f"/api/v1/ventas/solicitudes/{sc['id']}/confirmar", json={}, headers=_headers(admin_token))
    return sc, r.json()["data"]["cotizacion"]


class TestSincronizacionEstados:

    def test_crear_cotizacion_deja_solicitud_en_cotizada_no_confirmada(self, app_client, admin_token):
        sc, cot = _crear_solicitud_y_confirmar(app_client, admin_token)
        r = app_client.get(f"/api/v1/ventas/solicitudes/{sc['id']}", headers=_headers(admin_token))
        assert r.json()["data"]["estado"] == "COTIZADA"

    def test_enviar_cotizacion_deja_solicitud_en_espera_confirmacion(self, app_client, admin_token):
        sc, cot = _crear_solicitud_y_confirmar(app_client, admin_token)
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "Enviada"}, headers=_headers(admin_token))
        r = app_client.get(f"/api/v1/ventas/solicitudes/{sc['id']}", headers=_headers(admin_token))
        assert r.json()["data"]["estado"] == "EN_ESPERA_CONFIRMACION"

    def test_confirmar_cotizacion_manualmente_deja_solicitud_confirmada(self, app_client, admin_token):
        sc, cot = _crear_solicitud_y_confirmar(app_client, admin_token)
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "Confirmada"}, headers=_headers(admin_token))
        r = app_client.get(f"/api/v1/ventas/solicitudes/{sc['id']}", headers=_headers(admin_token))
        assert r.json()["data"]["estado"] == "CONFIRMADA"

    def test_rechazar_cotizacion_deja_solicitud_rechazada(self, app_client, admin_token):
        sc, cot = _crear_solicitud_y_confirmar(app_client, admin_token)
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "Rechazada"}, headers=_headers(admin_token))
        r = app_client.get(f"/api/v1/ventas/solicitudes/{sc['id']}", headers=_headers(admin_token))
        assert r.json()["data"]["estado"] == "RECHAZADA"
