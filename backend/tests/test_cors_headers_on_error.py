import uuid


class TestCORSHeadersOnUnhandledError:
    """Bug reportado por el usuario: cualquier excepcion no controlada en el
    backend se muestra en el navegador como 'Failed to fetch' generico, sin
    ningun mensaje util, en vez de mostrar el error real. La causa: en
    Starlette, el exception_handler para la clase base `Exception` se monta
    en ServerErrorMiddleware, que envuelve a CORSMiddleware por fuera — asi
    que cuando ese handler global dispara, la respuesta nunca pasa por
    CORSMiddleware y sale sin cabeceras Access-Control-Allow-Origin. El
    navegador entonces bloquea/oculta la respuesta 500 real y solo reporta
    un fallo de red opaco. Esto afecta a CUALQUIER endpoint, no solo Ventas."""

    def test_500_no_controlado_incluye_cors_headers(self, app_client, admin_token):
        r = app_client.post(
            "/api/v1/ventas/solicitudes",
            json={
                "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
                # dispara una excepcion no controlada real (ValueError en el
                # int() del backend) para probar el handler global, no un
                # caso ya cubierto por la validacion de advisor_user_id.
                "dias_vencimiento": "no-es-un-numero",
            },
            headers={"Authorization": f"Bearer {admin_token}", "Origin": "http://localhost:5100"},
        )
        assert r.status_code == 500
        assert r.headers.get("access-control-allow-origin") == "http://localhost:5100", (
            "Sin este header el navegador reporta 'Failed to fetch' en vez del error real"
        )
