"""T1A (Bloque 2, ruling 1): los errores de validacion del body (RequestValidationError) responden 400 legible.

Antes, validation_exception_handler respondia 400 con {"status": "error", "message": str(exc)}: el repr tecnico de
FastAPI, con rutas de archivo del servidor ("File ...py, line N"), la ruta del endpoint y el valor que mando el
usuario. Ahora se conserva el 400 y la forma {status, message} (unas 25 pantallas leen data.detail || data.message),
pero message es una frase fija en espanol y los detalles van en `errores` ([{type, loc, msg, ctx}]), con ctx solo
numerico (min_length, max_length, gt, ge, lt, le) y nunca el `input` ni la `url` de pydantic. El frontend
(lib/avisos.js, errorDeRespuesta) arma con `errores` el texto 'Motivo: debe tener al menos 5 caracteres.'.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_errores_validacion_legibles
"""

MENSAJE = "Los datos enviados no son válidos. Revisa el formulario e intenta de nuevo."
CLAVES_CTX = {"min_length", "max_length", "gt", "ge", "lt", "le"}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sin_detalles_tecnicos(cuerpo, valor_enviado):
    texto = cuerpo["message"]
    for prohibido in ("File", "line", ".py", valor_enviado):
        assert prohibido not in texto, f"message no debe contener {prohibido!r}: {texto!r}"
    for error in cuerpo["errores"]:
        assert set(error) <= {"type", "loc", "msg", "ctx"}, error
        assert "input" not in error and "url" not in error, error
        assert set(error.get("ctx") or {}) <= CLAVES_CTX, error


def test_cancelar_solicitud_con_motivo_corto_responde_400_legible(app_client, admin_token):
    # La validacion del body ocurre antes de buscar la SC: el id no necesita existir y no se escribe nada.
    enviado = "Qzw"
    r = app_client.post("/api/v1/ventas/solicitudes/999999999/cancelar", json={"razon": enviado},
                        headers=auth(admin_token))
    assert r.status_code == 400, r.text
    cuerpo = r.json()
    assert cuerpo["status"] == "error"
    assert cuerpo["message"] == MENSAJE
    assert enviado not in r.text, "el valor que mando el usuario no vuelve en la respuesta"
    _sin_detalles_tecnicos(cuerpo, enviado)

    assert len(cuerpo["errores"]) == 1, cuerpo
    error = cuerpo["errores"][0]
    assert error["loc"][-1] == "razon"
    assert error["type"] == "string_too_short"
    assert error["ctx"]["min_length"] == 5
    assert isinstance(error["msg"], str) and error["msg"]


def test_error_de_un_validador_propio_no_rompe_la_respuesta(app_client, admin_token):
    # Un field_validator que lanza ValueError deja en ctx un objeto de excepcion (no serializable): se descarta,
    # la respuesta sigue siendo el 400 legible (no un 500) y el campo que falta tambien llega como 'missing'.
    enviado = "ESTADO_INVENTADO_XYZ"
    r = app_client.patch("/api/v1/compras/pedidos/999999999/tracking", json={"status": enviado},
                         headers=auth(admin_token))
    assert r.status_code == 400, r.text
    cuerpo = r.json()
    assert cuerpo["message"] == MENSAJE
    assert enviado not in r.text
    _sin_detalles_tecnicos(cuerpo, enviado)

    por_campo = {error["loc"][-1]: error for error in cuerpo["errores"]}
    assert por_campo["stage"]["type"] == "missing"
    assert por_campo["status"]["type"] == "value_error"
    assert "error" not in (por_campo["status"].get("ctx") or {})
