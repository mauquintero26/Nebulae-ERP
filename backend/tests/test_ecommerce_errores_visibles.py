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
