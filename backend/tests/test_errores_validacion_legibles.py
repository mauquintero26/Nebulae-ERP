"""T1A (Bloque 2, ruling 1): los errores de validacion del body (RequestValidationError) responden 400 legible.

Antes, validation_exception_handler respondia 400 con {"status": "error", "message": str(exc)}: el repr tecnico de
FastAPI, con rutas de archivo del servidor ("File ...py, line N"), la ruta del endpoint y el valor que mando el
usuario. Ahora se conserva el 400 y la forma {status, message} (unas 25 pantallas leen data.detail || data.message),
pero message es una frase fija en espanol y los detalles van en `errores` ([{type, loc, msg, ctx}]), con ctx solo
numerico (min_length, max_length, gt, ge, lt, le) y nunca el `input` ni la `url` de pydantic. Si un validador propio
mete el valor enviado en su mensaje, el handler lo reemplaza por '…'. El frontend (lib/avisos.js, errorDeRespuesta)
arma con `errores` el texto 'Motivo: debe tener al menos 5 caracteres.'.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_errores_validacion_legibles
"""

MENSAJE = "Los datos enviados no son válidos. Revisa el formulario e intenta de nuevo."
CLAVES_CTX = {"min_length", "max_length", "gt", "ge", "lt", "le"}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# Ids que no existen: la validacion del body ocurre antes de ejecutar el endpoint, asi que no se busca ni se escribe
# nada. El id tampoco debe volver en la respuesta (era parte de la ruta que str(exc) incluia).
ID_INEXISTENTE = "987654321"


def _sin_detalles_tecnicos(r, *valores_enviados):
    """Nada tecnico en TODO el cuerpo (no solo en message): rutas de archivo, la ruta del endpoint, el id usado ni lo
    que mando el usuario; cada error solo con {type, loc, msg, ctx} y ctx solo con limites numericos."""
    cuerpo = r.json()
    for prohibido in ("File", "line"):
        assert prohibido not in cuerpo["message"], f"message no debe contener {prohibido!r}: {cuerpo['message']!r}"
    for prohibido in (".py", 'File "', "/api/v1/", ID_INEXISTENTE, *valores_enviados):
        assert prohibido not in r.text, f"la respuesta no debe contener {prohibido!r}: {r.text!r}"
    for error in cuerpo["errores"]:
        assert set(error) <= {"type", "loc", "msg", "ctx"}, error
        assert "input" not in error and "url" not in error, error
        assert set(error.get("ctx") or {}) <= CLAVES_CTX, error
        assert all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in error["ctx"].values()), error


def test_cancelar_solicitud_con_motivo_corto_responde_400_legible(app_client, admin_token):
    enviado = "Qzw"
    r = app_client.post(f"/api/v1/ventas/solicitudes/{ID_INEXISTENTE}/cancelar", json={"razon": enviado},
                        headers=auth(admin_token))
    assert r.status_code == 400, r.text
    cuerpo = r.json()
    assert cuerpo["status"] == "error"
    assert cuerpo["message"] == MENSAJE
    _sin_detalles_tecnicos(r, enviado)

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
    r = app_client.patch(f"/api/v1/compras/pedidos/{ID_INEXISTENTE}/tracking", json={"status": enviado},
                         headers=auth(admin_token))
    assert r.status_code == 400, r.text
    cuerpo = r.json()
    assert cuerpo["message"] == MENSAJE
    _sin_detalles_tecnicos(r, enviado)

    por_campo = {error["loc"][-1]: error for error in cuerpo["errores"]}
    assert por_campo["stage"]["type"] == "missing"
    assert por_campo["status"]["type"] == "value_error"
    assert "error" not in (por_campo["status"].get("ctx") or {})


def test_pago_con_tipo_invalido_no_devuelve_el_valor_y_el_limite_decimal_llega_como_numero(app_client, admin_token):
    # SaleOrderPaymentCreate: el validador de `tipo` metia el valor enviado en el ValueError ("Tipo de pago 'X' no
    # valido") y `monto` tiene gt=Decimal("0.00"): el limite debe llegar como numero JSON, no como texto.
    enviado = "TIPO_RARO_QWX"
    r = app_client.post(f"/api/v1/ventas/pedidos/{ID_INEXISTENTE}/pagos",
                        json={"tipo": enviado, "monto": -1, "idempotency_key": "clave-prueba"},
                        headers=auth(admin_token))
    assert r.status_code == 400, r.text
    assert r.json()["message"] == MENSAJE
    _sin_detalles_tecnicos(r, enviado)

    por_campo = {error["loc"][-1]: error for error in r.json()["errores"]}
    assert por_campo["tipo"]["type"] == "value_error"
    assert "ANTICIPO" in por_campo["tipo"]["msg"], "el mensaje dice cuales son las opciones validas"
    assert por_campo["monto"]["type"] == "greater_than"
    assert por_campo["monto"]["ctx"] == {"gt": 0}


def test_el_valor_enviado_dentro_de_msg_se_reemplaza():
    # Defensa del handler para validadores (de cualquier modulo) que interpolan el valor en el ValueError.
    from main import _error_de_validacion_legible
    error = _error_de_validacion_legible({
        "type": "value_error", "loc": ("body", "estado"), "input": "secreto-123",
        "msg": "Value error, estado 'secreto-123' no existe; secreto-123 no sirve", "ctx": {"error": ValueError("x")},
    })
    assert "secreto-123" not in error["msg"], error
    assert error["msg"] == "Value error, estado '…' no existe; … no sirve"
    assert error["ctx"] == {}

    # Un valor corto sin comillas no se reemplaza (borraria letras sueltas del texto); entre comillas si.
    corto = _error_de_validacion_legible({"type": "value_error", "loc": ("body", "tipo"), "input": "a",
                                          "msg": "Value error, tipo 'a' no valido"})
    assert corto["msg"] == "Value error, tipo '…' no valido"
    sin_comillas = _error_de_validacion_legible({"type": "value_error", "loc": ("body", "tipo"), "input": "a",
                                                 "msg": "Value error, opcion no valida"})
    assert sin_comillas["msg"] == "Value error, opcion no valida"
