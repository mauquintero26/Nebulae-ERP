"""B4 T24 (B48): GET /ecommerce/carritos y GET /ecommerce/stats ya no esconden un error de su consulta. Antes /carritos
convertía cualquier excepción en data: [] (la pantalla decía «Sin carritos abandonados») y /stats ponía en 0 los carritos
abandonados y los productos publicados. Ahora el error sube (500) y la pantalla muestra su estado de error.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_ecommerce_errores_visibles).
"""

CARRITOS = "/api/v1/ecommerce/carritos"
STATS = "/api/v1/ecommerce/stats"
ERROR_500 = {"status": "error", "message": "Internal Server Error"}


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _falla_si(monkeypatch, fragmento):
    """Reemplaza `text` en ecommerce: la sentencia que contiene `fragmento` lanza un error (como una consulta que falla)."""
    from app.api.v1 import ecommerce
    real = ecommerce.text

    def text_que_falla(sql, *args, **kwargs):
        if fragmento in sql:
            raise RuntimeError("falla de la consulta (prueba B48)")
        return real(sql, *args, **kwargs)

    monkeypatch.setattr(ecommerce, "text", text_que_falla)


def test_sin_errores_responden_como_hoy(app_client, admin_token, monkeypatch):
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    resp = app_client.get(CARRITOS, headers=_auth(admin_token))
    assert resp.status_code == 200 and resp.json()["status"] == "success", resp.text
    resp = app_client.get(STATS, headers=_auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert {"carritos_abandonados_count", "productos_publicados"} <= set(resp.json()["data"])


def test_un_error_de_los_carritos_sube(app_client, admin_token, monkeypatch):
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    _falla_si(monkeypatch, "FROM web_carts WHERE estado")
    for ruta in (CARRITOS, STATS):
        resp = app_client.get(ruta, headers=_auth(admin_token))
        assert (resp.status_code, resp.json()) == (500, ERROR_500), (ruta, resp.text)


def test_un_error_de_los_publicados_sube(app_client, admin_token, monkeypatch):
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    _falla_si(monkeypatch, "FROM ecommerce_products WHERE publicado_web=TRUE")
    resp = app_client.get(STATS, headers=_auth(admin_token))
    assert (resp.status_code, resp.json()) == (500, ERROR_500), resp.text


def test_un_error_de_la_configuracion_de_pagos_o_envios_sube(app_client, admin_token, monkeypatch):
    """B4 T24 r1 (m13): GET /ecommerce/pagos/config y /envios/config ya no responden los valores fijos («Stripe
    desactivado», las tarifas por defecto) cuando falla su consulta: un error que se ve como configuración puede terminar
    guardado encima de la real. Sube el 500; sin error, como hoy."""
    for ruta in ("/api/v1/ecommerce/pagos/config", "/api/v1/ecommerce/envios/config"):
        assert app_client.get(ruta, headers=_auth(admin_token)).status_code == 200, ruta
    for ruta, clave in (("/api/v1/ecommerce/pagos/config", "config_key='payment_gateways'"),
                        ("/api/v1/ecommerce/envios/config", "config_key='shipping'")):
        with monkeypatch.context() as m:
            _falla_si(m, clave)
            resp = app_client.get(ruta, headers=_auth(admin_token))
        assert (resp.status_code, resp.json()) == (500, ERROR_500), (ruta, resp.text)



# ─── B4 T24 r2 (m6): los secretos de las pasarelas no salen en el GET ni se borran con lo que el GET devuelve ─────────

def test_la_configuracion_de_pagos_no_devuelve_ni_borra_los_secretos(app_client, db, admin_token):
    """r2 (m6): GET /ecommerce/pagos/config devolvía stripe.webhook_secret en claro (secret_key y access_token ya iban
    enmascarados). Ahora los tres salen como <campo>_masked, sin el valor. En el PATCH, un secreto ausente, vacío o igual a
    su máscara significa «no cambiar» (antes un vacío lo borraba), y las claves *_masked que la pantalla devuelve no se
    guardan. Un valor nuevo sí lo cambia."""
    import json
    from sqlalchemy import text
    guardado = {"stripe": {"enabled": True, "publishable_key": "pk_test_1", "secret_key": "sk_test_abcd1234",
                           "webhook_secret": "whsec_wxyz9876"},
                "mercadopago": {"enabled": False, "public_key": "APP_USR-p", "access_token": "APP_USR-tok5555"}}
    db.execute(text("INSERT INTO web_builder_config (config_key, config_value, updated_at) VALUES ('payment_gateways', "
                    "CAST(:v AS jsonb), NOW()) ON CONFLICT (config_key) DO UPDATE SET config_value = CAST(:v AS jsonb)"),
               {"v": json.dumps(guardado)})
    db.commit()

    def leer():
        db.expire_all()
        return db.execute(text("SELECT config_value FROM web_builder_config WHERE config_key = 'payment_gateways'")).scalar()

    resp = app_client.get("/api/v1/ecommerce/pagos/config", headers=_auth(admin_token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    for secreto in ("sk_test_abcd1234", "whsec_wxyz9876", "APP_USR-tok5555"):
        assert secreto not in resp.text, secreto
    assert ("secret_key" in data["stripe"], "webhook_secret" in data["stripe"], "access_token" in data["mercadopago"]) == (
        False, False, False)
    assert (data["stripe"]["secret_key_masked"], data["stripe"]["webhook_secret_masked"],
            data["mercadopago"]["access_token_masked"]) == ("*" * 12 + "1234", "*" * 10 + "9876", "*" * 11 + "5555")
    # La pantalla manda de vuelta lo que recibió (sin los secretos, con los *_masked) y un cambio.
    vuelta = {**data, "stripe": {**data["stripe"], "publishable_key": "pk_test_2"}}
    assert app_client.patch("/api/v1/ecommerce/pagos/config", headers=_auth(admin_token), json=vuelta).status_code == 200
    ahora = leer()
    assert (ahora["stripe"]["secret_key"], ahora["stripe"]["webhook_secret"], ahora["mercadopago"]["access_token"]) == (
        "sk_test_abcd1234", "whsec_wxyz9876", "APP_USR-tok5555")
    assert ahora["stripe"]["publishable_key"] == "pk_test_2"
    assert not [k for gw in ahora.values() for k in gw if k.endswith("_masked")], ahora
    # Vacío, null o la máscara: no cambian.
    cuerpo = {"stripe": {"secret_key": "", "webhook_secret": data["stripe"]["webhook_secret_masked"]},
              "mercadopago": {"access_token": None}}
    assert app_client.patch("/api/v1/ecommerce/pagos/config", headers=_auth(admin_token), json=cuerpo).status_code == 200
    ahora = leer()
    assert (ahora["stripe"]["secret_key"], ahora["stripe"]["webhook_secret"], ahora["mercadopago"]["access_token"]) == (
        "sk_test_abcd1234", "whsec_wxyz9876", "APP_USR-tok5555")
    # Un valor nuevo, sí.
    assert app_client.patch("/api/v1/ecommerce/pagos/config", headers=_auth(admin_token),
                            json={"stripe": {"webhook_secret": "whsec_nuevo0000"}}).status_code == 200
    assert leer()["stripe"]["webhook_secret"] == "whsec_nuevo0000"
