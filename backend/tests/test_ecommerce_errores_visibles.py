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



# ─── B4 T24 r3 (C1): /web-builder/config solo lee y escribe las claves del constructor del sitio ────────────────────

CLAVES_CONSTRUCTOR = {"theme", "hero", "featured_section", "contact", "blog"}


def _sembrar(db, clave, valor):
    import json
    from sqlalchemy import text
    db.execute(text("INSERT INTO web_builder_config (config_key, config_value, updated_at) VALUES (:k, CAST(:v AS jsonb), "
                    "NOW()) ON CONFLICT (config_key) DO UPDATE SET config_value = CAST(:v AS jsonb)"),
               {"k": clave, "v": json.dumps(valor)})
    db.commit()


def _fila(db, clave):
    from sqlalchemy import text
    db.expire_all()
    return db.execute(text("SELECT config_value FROM web_builder_config WHERE config_key = :k"), {"k": clave}).scalar()


def test_el_constructor_del_sitio_no_lee_ni_pisa_otras_claves(app_client, db, admin_token, vendedor_token):
    """r3 (C1, ruling): GET /ecommerce/web-builder/config devolvía TODAS las filas de web_builder_config, también
    payment_gateways con los secretos en claro, a ADMIN y a ASESOR; y PATCH escribía cualquier clave, así que el «Guardar»
    de Sitio Web (que manda el config completo que leyó al abrir) pisaba la Lista de Compras y las pasarelas. Ahora los
    dos se limitan a las claves del constructor (theme, hero, featured_section, contact y blog: sitio-web/page.tsx,
    /web-builder/chat y store/page.tsx); el PATCH ignora las demás (con un warning, sin 422)."""
    import uuid
    marca = uuid.uuid4().hex[:8]
    secretos = {"stripe": {"enabled": True, "secret_key": f"sk_live_{marca}", "webhook_secret": f"whsec_{marca}"},
                "mercadopago": {"enabled": True, "access_token": f"APP_USR-{marca}"}}
    lista = [{"id": 1, "producto": f"Item-{marca}", "estado": "PENDIENTE"}]
    _sembrar(db, "payment_gateways", secretos)
    _sembrar(db, "erp_lista_compras", lista)
    _sembrar(db, "theme", {"primary": "#111111"})
    for token in (vendedor_token, admin_token):
        resp = app_client.get("/api/v1/ecommerce/web-builder/config", headers=_auth(token))
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert set(data) <= CLAVES_CONSTRUCTOR, sorted(data)
        assert data["theme"] == {"primary": "#111111"}
        assert marca not in resp.text, resp.text[:300]
    cuerpo = {"theme": {"primary": "#222222"}, "payment_gateways": {"stripe": {"secret_key": "sk_pisado"}},
              "erp_lista_compras": []}
    resp = app_client.patch("/api/v1/ecommerce/web-builder/config", headers=_auth(admin_token), json=cuerpo)
    assert resp.status_code == 200, resp.text
    assert _fila(db, "theme") == {"primary": "#222222"}
    assert _fila(db, "payment_gateways") == secretos
    assert _fila(db, "erp_lista_compras") == lista
    # El chat del constructor solo propone y guarda claves de la lista.
    resp = app_client.post("/api/v1/ecommerce/web-builder/chat", headers=_auth(admin_token),
                           json={"instruction": "cambia el tema, el banner, los productos destacados, el contacto y el blog"})
    assert resp.status_code == 200, resp.text
    assert set(resp.json()["data"]["changes"]) <= CLAVES_CONSTRUCTOR


# ─── B4 T24 r3 (m11, m4): los bordes de los secretos de pago ─────────────────────────────────────────────────────────

def test_los_bordes_de_los_secretos_de_pago(app_client, db, admin_token):
    """r3 (m11): en el PATCH también es «no cambiar» un valor que queda vacío al recortarlo y cualquier valor con forma de
    máscara (^\\*+.{0,4}$), no solo la del secreto actual (una máscara vieja, de antes de una rotación, ya no se guarda
    como secreto). Un secreto de 8 caracteres o menos se enmascara entero. r3 (m4): sin fila, el GET devuelve los
    *_masked vacíos (no un webhook_secret)."""
    from sqlalchemy import text
    _sembrar(db, "payment_gateways", {"stripe": {"enabled": True, "secret_key": "sk_test_abcd1234",
                                                 "webhook_secret": "whsec_wxyz9876"},
                                      "mercadopago": {"enabled": True, "access_token": "tok12345"}})
    cuerpo = {"stripe": {"secret_key": "   ", "webhook_secret": "****zzzz"}, "mercadopago": {"access_token": "***"}}
    assert app_client.patch("/api/v1/ecommerce/pagos/config", headers=_auth(admin_token), json=cuerpo).status_code == 200
    fila = _fila(db, "payment_gateways")
    assert (fila["stripe"]["secret_key"], fila["stripe"]["webhook_secret"], fila["mercadopago"]["access_token"]) == (
        "sk_test_abcd1234", "whsec_wxyz9876", "tok12345"), fila
    data = app_client.get("/api/v1/ecommerce/pagos/config", headers=_auth(admin_token)).json()["data"]
    assert data["mercadopago"]["access_token_masked"] == "********", data   # 8 caracteres: entero
    assert data["stripe"]["secret_key_masked"] == "*" * 12 + "1234"
    db.execute(text("DELETE FROM web_builder_config WHERE config_key = 'payment_gateways'"))
    db.commit()
    resp = app_client.get("/api/v1/ecommerce/pagos/config", headers=_auth(admin_token))
    assert resp.json()["data"] == {
        "stripe": {"enabled": False, "publishable_key": "", "secret_key_masked": "", "webhook_secret_masked": ""},
        "mercadopago": {"enabled": False, "public_key": "", "access_token_masked": ""}}, resp.text
