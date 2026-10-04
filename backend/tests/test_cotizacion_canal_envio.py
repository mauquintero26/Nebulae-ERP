import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_actualizar_cotizacion_guarda_canal_envio(app_client, admin_token):
    cot = app_client.post("/api/v1/ventas/cotizaciones", json={
        "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
    }, headers=_headers(admin_token)).json()["data"]
    # H50: el PATCH ya no pone ENVIADA (eso es 'Enviar al Cliente'); el canal se guarda solo.
    r = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}",
                          json={"canal_envio": "WhatsApp"},
                          headers=_headers(admin_token))
    assert r.status_code == 200
    assert r.json()["data"]["canal_envio"] == "WhatsApp"
