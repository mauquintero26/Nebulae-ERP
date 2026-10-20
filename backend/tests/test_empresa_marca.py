"""Bloque 3, Tarea 2 — MARCA: datos de la empresa para los documentos (core/empresa.py y api/v1/empresa.py).

- GET/PUT /api/v1/empresa (PUT solo ADMIN; los demás roles leen con puede_editar=False), PUT/DELETE /empresa/logo y
  GET /empresa/historial (renglones EMPRESA de la Actividad, autor = nombre_de_usuario(user), RP15).
- GET /api/v1/publico/empresa y /publico/empresa/logo SIN autenticación: solo la lista blanca (identidad, contacto,
  colores, logo_url, configurada); nunca términos ni datos para pagar (R8).
- Validación a mano con 422 y mensaje en español (R12, C8), todo o nada. C1: sitio_web sin esquema se guarda con
  https://; javascript: y data: dan 422. RP4: el correo usa clientes.correo_valido. RP19: el WhatsApp de la empresa usa
  telefonos.e164_whatsapp; el teléfono fijo sigue con 7 a 15 dígitos.
- /ventas/config (C23, R13, RP18): no muestra ni acepta empresa_* ni documentos_* (para ningún rol); 422 con el mensaje
  del prefijo y sin escribir nada.

Correr SOLO con el runner de ROLLBACK (admin_config no se trunca):  python tests/rollback_runner.py test_empresa_marca
"""
import base64

from sqlalchemy import text

# PNG de 1x1 (válido) para las pruebas del logo.
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
CLAVES_PUBLICAS = {"nombre_comercial", "razon_social", "nit", "direccion", "ciudad", "telefono", "whatsapp", "correo",
                   "sitio_web", "colores", "logo_url", "configurada"}
MENSAJE_RESERVADAS = "Los datos de la empresa y de los documentos se cambian en Configuración General."
# r1 (L3): el texto exacto del 422 del WhatsApp de la empresa (RP19; T12 lo copia en validarCampoEmpresa, RP21).
MENSAJE_WHATSAPP = ("WhatsApp no válido: escribe el celular de 10 dígitos o el número completo con su indicativo "
                    "(por ejemplo +57 300 123 4567).")
# r1 (Q8c): JPEG y WebP mínimos (1x1) para ejercitar las otras dos firmas aceptadas.
JPEG_1X1 = base64.b64decode(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////"
    "////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=")
WEBP_1X1 = base64.b64decode("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==")


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _limpiar_empresa(db):
    """Quita, dentro de la transacción revertida, cualquier dato de empresa que tenga erp_test: cada prueba empieza de
    cero (el runner revierte todo al terminar)."""
    db.execute(text("DELETE FROM admin_config WHERE key LIKE :a OR key LIKE :b"),
               {"a": "empresa\\_%", "b": "documentos\\_%"})
    db.commit()


def _put(app_client, token, body):
    return app_client.put("/api/v1/empresa", json=body, headers=auth(token))


def _get(app_client, token):
    return app_client.get("/api/v1/empresa", headers=auth(token))


def _data_url(mime, contenido):
    return f"data:{mime};base64,{base64.b64encode(contenido).decode()}"


def _claves_guardadas(db):
    filas = db.execute(text("SELECT key, value FROM admin_config WHERE key LIKE :a OR key LIKE :b"),
                       {"a": "empresa\\_%", "b": "documentos\\_%"}).fetchall()
    return {k: v for k, v in filas}


# ─── 1 a 9: pruebas del diseño (MARCA) ───────────────────────────────────────────────────────────────────────

def test_admin_guarda_y_lee_los_datos(app_client, db, admin_token):
    _limpiar_empresa(db)
    resp = _put(app_client, admin_token, {"nombre_comercial": "DEMO Ferretería", "nit": "900.123.456-7",
                                          "correo": "ventas@example.com", "sitio_web": "https://example.com",
                                          "color_acento": "#ea580c"})
    assert resp.status_code == 200, resp.text
    assert {c["etiqueta"] for c in resp.json()["cambios"]} == {"Nombre comercial", "NIT", "Correo", "Página web",
                                                               "Color de acento"}

    resp = _get(app_client, admin_token)
    assert resp.status_code == 200, resp.text
    d = resp.json()["data"]
    assert d["nombre_comercial"] == "DEMO Ferretería"
    assert d["nit"] == "900.123.456-7"
    assert d["correo"] == "ventas@example.com"
    assert d["sitio_web"] == "https://example.com"
    assert d["color_acento"] == "#EA580C"  # se guarda en mayúsculas
    assert d["color_principal"] == "#7C3AED" and d["color_secundario"] == "#E11D48"  # los de la referencia
    assert d["razon_social"] == "" and d["instrucciones_pago"] == ""
    assert d["configurada"] is True and d["puede_editar"] is True
    assert d["logo_version"] is None and d["logo_url"] is None
    assert "logo" not in d  # nunca el data URL


def test_publico_solo_expone_la_lista_blanca(app_client, db, admin_token):
    _limpiar_empresa(db)
    assert _put(app_client, admin_token, {"nombre_comercial": "DEMO Ferretería", "nit": "900.123.456-7",
                                          "color_acento": "#ea580c", "instrucciones_pago": "Cuenta 123",
                                          "terminos_cotizacion": "Términos secretos"}).status_code == 200
    db.execute(text("INSERT INTO admin_config (key, value, updated_at) VALUES ('alerta_sc_dias', '5', NOW()) "
                    "ON CONFLICT (key) DO UPDATE SET value = '5', updated_at = NOW()"))
    db.commit()

    resp = app_client.get("/api/v1/publico/empresa")  # SIN Authorization
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert set(data.keys()) == CLAVES_PUBLICAS
    for prohibida in ("instrucciones_pago", "terminos_cotizacion", "terminos_pedido", "mensaje_pie", "alerta_sc_dias"):
        assert prohibida not in data
    assert "Cuenta 123" not in resp.text and "Términos secretos" not in resp.text
    assert data["nombre_comercial"] == "DEMO Ferretería"
    assert data["colores"] == {"principal": "#7C3AED", "secundario": "#E11D48", "acento": "#EA580C"}
    assert data["configurada"] is True and data["logo_url"] is None
    assert "max-age" in resp.headers.get("cache-control", "")


def test_asesor_lee_pero_no_cambia(app_client, db, vendedor_token):
    _limpiar_empresa(db)
    resp = _get(app_client, vendedor_token)
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["puede_editar"] is False
    assert _put(app_client, vendedor_token, {"nombre_comercial": "Otra"}).status_code == 403
    assert app_client.put("/api/v1/empresa/logo", json={"logo": _data_url("image/png", PNG_1X1)},
                          headers=auth(vendedor_token)).status_code == 403
    assert app_client.delete("/api/v1/empresa/logo", headers=auth(vendedor_token)).status_code == 403
    assert app_client.get("/api/v1/empresa/historial", headers=auth(vendedor_token)).status_code == 403
    assert _claves_guardadas(db) == {}
    assert app_client.get("/api/v1/empresa").status_code == 401  # sin sesión no se lee el perfil privado


def test_validaciones_no_guardan_nada(app_client, db, admin_token):
    _limpiar_empresa(db)
    antes = {"nombre_comercial": "Antes", "sitio_web": "https://antes.example.com", "color_principal": "#111111",
             "correo": "antes@example.com"}
    assert _put(app_client, admin_token, antes).status_code == 200
    casos = [
        ({"sitio_web": "javascript:alert(1)"}, "La página web debe empezar por http:// o https://."),
        ({"sitio_web": "data:text/html,x"}, "La página web debe empezar por http:// o https://."),
        ({"color_principal": "red;"}, "Color no válido: usa el formato #RRGGBB."),
        ({"correo": "x"}, "Correo de la empresa no válido."),
        ({"smtp_password": "x"}, "Campo desconocido: smtp_password."),
        ({"whatsapp": "Cel: 300 123 4567"}, MENSAJE_WHATSAPP),  # r1 (L2): letras no, aunque los dígitos sirvan
        ({"whatsapp": "300123456"}, MENSAJE_WHATSAPP),  # 9 dígitos (RP19)
        # T20 (C1, C2, M16): con credenciales ('mitienda.com@evil.com' abre evil.com), aunque el '@' no traiga usuario.
        ({"sitio_web": "https://mitienda.com@evil.com"}, "La página web debe empezar por http:// o https://."),
        ({"sitio_web": "https://user:pw@nebulae.co"}, "La página web debe empezar por http:// o https://."),
        ({"sitio_web": "https://@evil.com"}, "La página web debe empezar por http:// o https://."),
        ({"sitio_web": "mitienda.com@evil.com"}, "La página web debe empezar por http:// o https://."),
    ]
    for malo, mensaje in casos:
        resp = _put(app_client, admin_token, {"nombre_comercial": "Nuevo", **malo})
        assert resp.status_code == 422, (malo, resp.text)
        assert resp.json()["detail"] == mensaje, malo
        d = _get(app_client, admin_token).json()["data"]
        assert {k: d[k] for k in antes} == {**antes, "color_principal": "#111111"}, malo  # nada cambió
    assert "empresa_smtp_password" not in _claves_guardadas(db)

    # r1 (L4), C1 de punta a punta: sin esquema se guarda con https:// y así se lee.
    resp = _put(app_client, admin_token, {"sitio_web": "example.com"})
    assert resp.status_code == 200, resp.text
    assert _get(app_client, admin_token).json()["data"]["sitio_web"] == "https://example.com"
    assert _claves_guardadas(db)["empresa_sitio_web"] == "https://example.com"


def test_logo_png_se_sirve_con_cache_y_nosniff(app_client, db, admin_token):
    _limpiar_empresa(db)
    resp = app_client.put("/api/v1/empresa/logo", json={"logo": _data_url("image/png", PNG_1X1)},
                          headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    logo_url = resp.json()["data"]["logo_url"]
    assert logo_url.startswith("/publico/empresa/logo?v=")
    version = logo_url.split("?v=", 1)[1]
    assert version and len(version) == 12

    pub = app_client.get("/api/v1/publico/empresa").json()["data"]
    assert pub["logo_url"] == logo_url

    logo = app_client.get(f"/api/v1/publico/empresa/logo?v={version}")  # SIN Authorization
    assert logo.status_code == 200
    assert logo.headers["content-type"] == "image/png"
    assert logo.content == PNG_1X1
    assert logo.headers["x-content-type-options"] == "nosniff"
    assert "immutable" in logo.headers["cache-control"]
    assert logo.headers["content-security-policy"] == "default-src 'none'"
    assert version in logo.headers["etag"]

    viejo = app_client.get("/api/v1/publico/empresa/logo?v=otra-version")
    assert viejo.status_code == 200
    assert "immutable" not in viejo.headers["cache-control"] and "max-age=60" in viejo.headers["cache-control"]

    # r1 (Q8c): las otras dos firmas aceptadas (JPEG ÿØÿ; WebP RIFF....WEBP) se guardan y se sirven.
    for mime, contenido in (("image/jpeg", JPEG_1X1), ("image/webp", WEBP_1X1)):
        resp = app_client.put("/api/v1/empresa/logo", json={"logo": _data_url(mime, contenido)},
                              headers=auth(admin_token))
        assert resp.status_code == 200, (mime, resp.text)
        logo = app_client.get("/api/v1" + resp.json()["data"]["logo_url"])
        assert logo.status_code == 200 and logo.headers["content-type"] == mime and logo.content == contenido


def test_logo_rechaza_svg_firma_falsa_y_tamano(app_client, db, admin_token):
    _limpiar_empresa(db)
    casos = [
        (_data_url("image/svg+xml", b"<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
         "El logo debe ser una imagen PNG, JPG o WebP."),
        ("no es un data url", "El logo debe ser una imagen PNG, JPG o WebP."),
        (12345, "El logo debe ser una imagen PNG, JPG o WebP."),
        (_data_url("image/png", b"<html>"), "El archivo no es una imagen válida."),
        (_data_url("image/jpeg", PNG_1X1), "El archivo no es una imagen válida."),  # firma de PNG con mime de JPG
        ("data:image/png;base64,@@@no-es-base64@@@", "El archivo no es una imagen válida."),
        (_data_url("image/png", PNG_1X1[:8] + b"\0" * (301 * 1024 - 8)), "El logo pesa 301 KB; el máximo es 300 KB."),
    ]
    for logo, mensaje in casos:
        resp = app_client.put("/api/v1/empresa/logo", json={"logo": logo}, headers=auth(admin_token))
        assert resp.status_code == 422, (mensaje, resp.text)
        assert resp.json()["detail"] == mensaje
    assert "máximo es 300 KB" in resp.json()["detail"]  # el último caso: el de 301 KB
    assert _get(app_client, admin_token).json()["data"]["logo_url"] is None
    assert _claves_guardadas(db) == {}


def test_quitar_logo(app_client, db, admin_token):
    _limpiar_empresa(db)
    assert app_client.put("/api/v1/empresa/logo", json={"logo": _data_url("image/png", PNG_1X1)},
                          headers=auth(admin_token)).status_code == 200
    resp = app_client.delete("/api/v1/empresa/logo", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["logo_url"] is None
    assert app_client.get("/api/v1/publico/empresa").json()["data"]["logo_url"] is None
    logo = app_client.get("/api/v1/publico/empresa/logo")
    assert logo.status_code == 404
    assert logo.json()["detail"] == "La empresa no tiene logo."
    assert _claves_guardadas(db) == {}

    hist = app_client.get("/api/v1/empresa/historial", headers=auth(admin_token)).json()["data"]
    assert [h["descripcion"] for h in hist[:2]] == ["Logo quitado", "Logo actualizado"]
    assert base64.b64encode(PNG_1X1).decode()[:20] not in str(hist)  # el contenido nunca va a la Actividad


def test_config_de_ventas_no_muestra_ni_acepta_claves_de_empresa(app_client, db, admin_token, vendedor_token):
    _limpiar_empresa(db)
    assert _put(app_client, admin_token, {"nombre_comercial": "DEMO", "color_acento": "#ea580c"}).status_code == 200
    assert app_client.put("/api/v1/empresa/logo", json={"logo": _data_url("image/png", PNG_1X1)},
                          headers=auth(admin_token)).status_code == 200

    for token in (admin_token, vendedor_token):
        resp = app_client.get("/api/v1/ventas/config", headers=auth(token))
        assert resp.status_code == 200, resp.text
        claves = resp.json()["data"].keys()
        assert not [k for k in claves if k.startswith(("empresa_", "documentos_"))], list(claves)

    resp = app_client.patch("/api/v1/ventas/config", json={"empresa_nombre_comercial": "x"}, headers=auth(admin_token))
    assert resp.status_code == 422
    assert resp.json()["detail"] == MENSAJE_RESERVADAS
    assert _get(app_client, admin_token).json()["data"]["nombre_comercial"] == "DEMO"

    # Todo o nada: con una clave reservada no se escribe ni la que sí es válida.
    db.execute(text("INSERT INTO admin_config (key, value, updated_at) VALUES ('alerta_sc_dias', '3', NOW()) "
                    "ON CONFLICT (key) DO UPDATE SET value = '3', updated_at = NOW()"))
    db.commit()
    resp = app_client.patch("/api/v1/ventas/config", json={"alerta_sc_dias": "9", "documentos_color_acento": "#000000"},
                            headers=auth(admin_token))
    assert resp.status_code == 422 and resp.json()["detail"] == MENSAJE_RESERVADAS
    assert db.execute(text("SELECT value FROM admin_config WHERE key = 'alerta_sc_dias'")).scalar() == "3"
    assert _claves_guardadas(db)["documentos_color_acento"] == "#EA580C"

    # Una clave normal sigue funcionando.
    resp = app_client.patch("/api/v1/ventas/config", json={"alerta_sc_dias": "4"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert db.execute(text("SELECT value FROM admin_config WHERE key = 'alerta_sc_dias'")).scalar() == "4"


def test_historial_registra_quien_y_que(app_client, db, admin_token, user_admin):
    from app.core.textos_actividad import nombre_de_usuario
    _limpiar_empresa(db)
    # RP15: el autor sale de la sesión; un user_name en el body se ignora (no es un campo ni cambia el autor).
    resp = _put(app_client, admin_token, {"instrucciones_pago": "Cuenta 123", "user_name": "otro"})
    assert resp.status_code == 200, resp.text

    hist = app_client.get("/api/v1/empresa/historial", headers=auth(admin_token))
    assert hist.status_code == 200, hist.text
    filas = hist.json()["data"]
    assert filas, "el cambio no quedó en el historial"
    ultima = filas[0]
    assert ultima["cambios"] == [{"etiqueta": "Datos para pagar", "antes": "", "despues": "Cuenta 123"}]
    assert ultima["user_name"] == nombre_de_usuario(user_admin)
    assert ultima["descripcion"] == "Datos de la empresa actualizados: Datos para pagar"
    assert ultima["created_at"].endswith("Z")

    # Un PUT sin cambios no agrega renglón.
    resp = _put(app_client, admin_token, {"instrucciones_pago": "  Cuenta 123  "})
    assert resp.status_code == 200 and resp.json()["cambios"] == []
    assert len(app_client.get("/api/v1/empresa/historial", headers=auth(admin_token)).json()["data"]) == len(filas)


# ─── Casos de borde ─────────────────────────────────────────────────────────────────────────────────────────

def test_validar_cambios_reglas_y_mensajes():
    """Mensajes exactos de MARCA (T12 los copia en validarCampoEmpresa; T13 compara los dos lados, RP21)."""
    from app.core.empresa import validar_cambios
    validos = [
        ({"nombre_comercial": "  DEMO  "}, {"nombre_comercial": "DEMO"}),
        ({"nombre_comercial": ""}, {"nombre_comercial": ""}),  # '' borra
        ({"nombre_comercial": None}, {"nombre_comercial": ""}),
        ({"nit": "900.123.456-7"}, {"nit": "900.123.456-7"}),
        ({"telefono": "(601) 234-5678"}, {"telefono": "(601) 234-5678"}),
        ({"telefono": "+57 601 234 5678"}, {"telefono": "+57 601 234 5678"}),
        ({"whatsapp": "300 123 4567"}, {"whatsapp": "300 123 4567"}),
        ({"whatsapp": "+57 300 123 4567"}, {"whatsapp": "+57 300 123 4567"}),
        ({"correo": " Ventas@Example.com "}, {"correo": "Ventas@Example.com"}),
        ({"sitio_web": "example.com"}, {"sitio_web": "https://example.com"}),  # C1
        ({"sitio_web": "www.example.com/tienda"}, {"sitio_web": "https://www.example.com/tienda"}),
        ({"sitio_web": "example.com:8080/x"}, {"sitio_web": "https://example.com:8080/x"}),
        ({"sitio_web": "HTTP://example.com"}, {"sitio_web": "HTTP://example.com"}),
        ({"color_principal": "#abcdef"}, {"color_principal": "#ABCDEF"}),
        ({"terminos_cotizacion": "Línea 1\nLínea 2"}, {"terminos_cotizacion": "Línea 1\nLínea 2"}),
        # r1 (Q2/S4): los de texto largo conservan \n y \t (\r\n -> \n; los demás de control se quitan).
        ({"instrucciones_pago": "Banco:\tX\r\nCuenta\x00 123"}, {"instrucciones_pago": "Banco:\tX\nCuenta 123"}),
        ({"mensaje_pie": "Gracias\npor tu compra"}, {"mensaje_pie": "Gracias\npor tu compra"}),
        # r1 (Q2/S4): los de una sola línea pasan por limpiar_linea: cada tramo de \n, \t, \r u otro carácter de
        # control se vuelve UN espacio y se quitan los espacios de los bordes (los demás espacios no se tocan).
        ({"nombre_comercial": "DEMO\tFerretería\r\nCentro"}, {"nombre_comercial": "DEMO Ferretería Centro"}),
        ({"razon_social": "Demo\n\nS.A.S.\t"}, {"razon_social": "Demo S.A.S."}),
        ({"direccion": "Calle 1\n# 2-3"}, {"direccion": "Calle 1 # 2-3"}),
        ({"ciudad": "Bogotá\x00 D.C."}, {"ciudad": "Bogotá  D.C."}),
        ({"whatsapp": "300 123\n4567"}, {"whatsapp": "300 123 4567"}),
    ]
    for body, esperado in validos:
        assert validar_cambios(body) == esperado, body

    malos = [
        ({"logo": "data:image/png;base64,xx"}, "Campo desconocido: logo."),
        ({"puede_editar": True}, "Campo desconocido: puede_editar."),
        ({"nombre_comercial": "x" * 121}, "Nombre comercial: máximo 120 caracteres."),
        ({"instrucciones_pago": "x" * 1001}, "Datos para pagar: máximo 1000 caracteres."),
        ({"nit": "ABC"}, "NIT no válido: usa solo números, puntos y guion (por ejemplo 900.123.456-7)."),
        ({"nit": "9"}, "NIT no válido: usa solo números, puntos y guion (por ejemplo 900.123.456-7)."),
        ({"telefono": "12345"}, "Teléfono no válido: escribe entre 7 y 15 dígitos."),
        ({"telefono": "300-ABC-1234"}, "Teléfono no válido: escribe entre 7 y 15 dígitos."),
        ({"telefono": "1234567890123456"}, "Teléfono no válido: escribe entre 7 y 15 dígitos."),
        ({"whatsapp": "300123456"}, MENSAJE_WHATSAPP),  # 9 dígitos: e164_whatsapp lo rechaza (RP19)
        ({"whatsapp": "+57 300 123 4567 8"}, MENSAJE_WHATSAPP),  # con 57 deben ser 12 dígitos (aquí 13)
        ({"whatsapp": "Cel: 300 123 4567"}, MENSAJE_WHATSAPP),  # r1 (L2): solo dígitos, + ( ) - y espacios
        ({"whatsapp": "300 123 4567 ext 12"}, MENSAJE_WHATSAPP),  # r1 (L2): saldría +300123456712
        ({"correo": "x"}, "Correo de la empresa no válido."),
        ({"correo": "a@b"}, "Correo de la empresa no válido."),
        ({"sitio_web": "javascript:alert(1)"}, "La página web debe empezar por http:// o https://."),
        ({"sitio_web": "JavaScript:alert(1)"}, "La página web debe empezar por http:// o https://."),
        ({"sitio_web": "data:text/html,x"}, "La página web debe empezar por http:// o https://."),
        ({"sitio_web": "ftp://example.com"}, "La página web debe empezar por http:// o https://."),
        ({"sitio_web": "https://exa mple.com"}, "La página web debe empezar por http:// o https://."),
        ({"sitio_web": "https://"}, "La página web debe empezar por http:// o https://."),
        ({"sitio_web": "https://[abc"}, "La página web debe empezar por http:// o https://."),  # r2: urlparse lanza
        ({"sitio_web": "example.com]"}, "La página web debe empezar por http:// o https://."),
        ({"color_acento": "red;"}, "Color no válido: usa el formato #RRGGBB."),
        ({"color_acento": "#12345"}, "Color no válido: usa el formato #RRGGBB."),
        ({"color_acento": "rgb(10, 20, 30)"}, "Color no válido: usa el formato #RRGGBB."),  # la regla antes que el máximo
        ({"sitio_web": "a" * 196 + ".com"}, "Página web: máximo 200 caracteres."),  # 200 + 'https://' > 200
        ({"nombre_comercial": ["lista"]}, "Nombre comercial: debe ser un texto."),
    ]
    for body, mensaje in malos:
        try:
            validar_cambios(body)
        except ValueError as e:
            assert str(e) == mensaje, (body, str(e))
        else:
            raise AssertionError(f"validar_cambios aceptó {body}")

    # Todo o nada: un campo malo junto con otro bueno también lanza.
    try:
        validar_cambios({"nombre_comercial": "Bien", "color_acento": "mal"})
    except ValueError as e:
        assert str(e) == "Color no válido: usa el formato #RRGGBB."
    else:
        raise AssertionError("aceptó un cambio con un color malo")


def test_campo_vacio_vuelve_al_valor_por_defecto(app_client, db, admin_token):
    _limpiar_empresa(db)
    assert _put(app_client, admin_token, {"color_acento": "#000000", "nombre_comercial": "DEMO"}).status_code == 200
    assert _claves_guardadas(db)["documentos_color_acento"] == "#000000"
    resp = _put(app_client, admin_token, {"color_acento": "", "nombre_comercial": ""})
    assert resp.status_code == 200, resp.text
    assert resp.json()["cambios"] == [
        {"etiqueta": "Color de acento", "antes": "#000000", "despues": "#C2410C"},
        {"etiqueta": "Nombre comercial", "antes": "DEMO", "despues": ""},
    ]
    d = resp.json()["data"]
    assert d["color_acento"] == "#C2410C" and d["nombre_comercial"] == "" and d["configurada"] is False
    assert _claves_guardadas(db) == {}  # la clave se borró (DELETE), no quedó un ''


def test_publico_sin_configurar_llega_vacio(app_client, db):
    _limpiar_empresa(db)
    resp = app_client.get("/api/v1/publico/empresa")
    assert resp.status_code == 200
    d = resp.json()["data"]
    assert d["configurada"] is False and d["logo_url"] is None
    assert all(d[k] == "" for k in CLAVES_PUBLICAS - {"colores", "logo_url", "configurada"})
    assert d["colores"] == {"principal": "#7C3AED", "secundario": "#E11D48", "acento": "#C2410C"}
    assert "Nebulae" not in resp.text


def test_textos_y_mensajes_de_la_empresa(db):
    from app.core import empresa
    _limpiar_empresa(db)
    vacio = {"terminos": None, "instrucciones_pago": None, "mensaje_pie": None}
    for tipo in ("SC", "COT", "PVEN"):
        assert empresa.textos_documento(db, tipo) == vacio
    assert empresa.empresa_para_mensajes(db) == {"nombre": None, "telefono": None, "whatsapp": None, "correo": None}

    cambios = empresa.validar_cambios({"nombre_comercial": "DEMO", "whatsapp": "3001234567", "correo": "v@example.com",
                                       "terminos_cotizacion": "T-COT", "terminos_pedido": "T-PVEN",
                                       "instrucciones_pago": "Cuenta 123", "mensaje_pie": "Gracias"})
    empresa.guardar_cambios(db, cambios, "Prueba")
    assert empresa.textos_documento(db, "SC") == {"terminos": None, "instrucciones_pago": None, "mensaje_pie": "Gracias"}
    assert empresa.textos_documento(db, "COT") == {"terminos": "T-COT", "instrucciones_pago": "Cuenta 123",
                                                   "mensaje_pie": "Gracias"}
    assert empresa.textos_documento(db, "PVEN") == {"terminos": "T-PVEN", "instrucciones_pago": "Cuenta 123",
                                                    "mensaje_pie": "Gracias"}
    assert empresa.empresa_para_mensajes(db) == {"nombre": "DEMO", "telefono": None, "whatsapp": "3001234567",
                                                 "correo": "v@example.com"}
    try:
        empresa.textos_documento(db, "PXP")
    except ValueError:
        pass
    else:
        raise AssertionError("textos_documento aceptó un tipo desconocido")


def test_leer_perfil_no_lee_el_logo(db, contador_sql):
    """leer_perfil y perfil_publico hacen UNA consulta y nunca piden la clave del logo (pesa hasta ~400 KB)."""
    from app.core import empresa
    assert empresa.CLAVE_LOGO not in empresa._CLAVES_PERFIL  # r1 (Q8a): lo que piden esas consultas
    _limpiar_empresa(db)
    empresa.guardar_logo(db, _data_url("image/png", PNG_1X1), "Prueba")
    contador_sql.reset()
    perfil = empresa.leer_perfil(db)
    publico = empresa.perfil_publico(db)
    assert contador_sql.consultas == 2
    assert perfil["logo_version"] and publico["logo_url"].endswith(perfil["logo_version"])
    mime, contenido, version = empresa.leer_logo(db)
    assert (mime, contenido, version) == ("image/png", PNG_1X1, perfil["logo_version"])
    assert empresa.limpiar_linea("Hola\r\nmundo\n") == "Hola mundo"


# ─── Ronda r1 de la revisión ────────────────────────────────────────────────────────────────────────────────

def test_validadores_de_config_todo_o_nada(app_client, db, admin_token, monkeypatch):
    """r1 (Q6): la rama de _VALIDADORES_CONFIG de /ventas/config (la usan T3, T7 y T11): un ValueError da 422 con su
    mensaje y no se escribe ninguna clave; un validador que normaliza guarda su resultado."""
    import app.api.v1.erp_ventas as ev

    def rechaza(valor):
        raise ValueError("El valor de prueba no sirve.")

    monkeypatch.setitem(ev._VALIDADORES_CONFIG, "b3t2_x", rechaza)
    monkeypatch.setitem(ev._VALIDADORES_CONFIG, "b3t2_y", lambda valor: str(valor).strip().upper())
    db.execute(text("INSERT INTO admin_config (key, value, updated_at) VALUES ('alerta_sc_dias', '3', NOW()) "
                    "ON CONFLICT (key) DO UPDATE SET value = '3', updated_at = NOW()"))
    db.execute(text("DELETE FROM admin_config WHERE key IN ('b3t2_x', 'b3t2_y')"))
    db.commit()

    resp = app_client.patch("/api/v1/ventas/config", json={"alerta_sc_dias": "9", "b3t2_x": "malo"},
                            headers=auth(admin_token))
    assert resp.status_code == 422
    assert resp.json()["detail"] == "El valor de prueba no sirve."
    assert db.execute(text("SELECT value FROM admin_config WHERE key = 'alerta_sc_dias'")).scalar() == "3"
    assert db.execute(text("SELECT count(*) FROM admin_config WHERE key = 'b3t2_x'")).scalar() == 0

    resp = app_client.patch("/api/v1/ventas/config", json={"b3t2_y": "  abc  ", "alerta_sc_dias": "4"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert db.execute(text("SELECT value FROM admin_config WHERE key = 'b3t2_y'")).scalar() == "ABC"
    assert db.execute(text("SELECT value FROM admin_config WHERE key = 'alerta_sc_dias'")).scalar() == "4"


def test_cada_guardado_hace_un_solo_commit_con_su_actividad(db, contador_sql):
    """r1 (Q7): guardar_cambios, guardar_logo y quitar_logo confirman el cambio y su renglón EMPRESA en UN commit; sin
    cambios no confirman nada."""
    from app.core import empresa
    from app.models.erp_documents import ActivityLog
    _limpiar_empresa(db)

    def renglones():
        db.expire_all()
        return db.query(ActivityLog).filter(ActivityLog.entity_type == "EMPRESA").count()

    inicial = renglones()
    contador_sql.reset()
    empresa.guardar_cambios(db, empresa.validar_cambios({"nombre_comercial": "DEMO"}), "Prueba")
    assert contador_sql.commits == 1 and renglones() == inicial + 1
    contador_sql.reset()
    assert empresa.guardar_cambios(db, empresa.validar_cambios({"nombre_comercial": "DEMO"}), "Prueba") == []
    assert contador_sql.commits == 0 and renglones() == inicial + 1

    contador_sql.reset()
    empresa.guardar_logo(db, _data_url("image/png", PNG_1X1), "Prueba")
    assert contador_sql.commits == 1 and renglones() == inicial + 2
    contador_sql.reset()
    empresa.guardar_logo(db, _data_url("image/png", PNG_1X1), "Prueba")  # el mismo logo
    assert contador_sql.commits == 0 and renglones() == inicial + 2

    contador_sql.reset()
    assert empresa.quitar_logo(db, "Prueba") is True
    assert contador_sql.commits == 1 and renglones() == inicial + 3
    contador_sql.reset()
    assert empresa.quitar_logo(db, "Prueba") is False  # ya no hay logo
    assert contador_sql.commits == 0 and renglones() == inicial + 3

    # r2: un logo sin su versión (escrito a mano), que leer_logo sigue sirviendo, también se quita: quitar_logo limpia
    # cualquiera de las dos claves. (leer_perfil arma logo_url solo con la versión: en ese caso no la ofrece.)
    db.execute(text("INSERT INTO admin_config (key, value, updated_at) VALUES (:k, :v, NOW())"),
               {"k": empresa.CLAVE_LOGO, "v": _data_url("image/png", PNG_1X1)})
    db.commit()
    assert empresa.leer_logo(db) is not None
    contador_sql.reset()
    assert empresa.quitar_logo(db, "Prueba") is True
    assert contador_sql.commits == 1 and renglones() == inicial + 4
    assert empresa.leer_logo(db) is None and _claves_guardadas(db) == {"empresa_nombre_comercial": "DEMO"}


def test_sitio_web_guardado_se_valida_al_leer(app_client, db):
    """r1 (S2): como los colores, un sitio_web guardado que no es http(s) (escrito a mano en la base) no llega a un href:
    se lee como ''."""
    _limpiar_empresa(db)
    from app.core.empresa import contacto_empresa, perfil_publico
    for malo in ("javascript:alert(1)", "data:text/html,x", "https://exa mple.com",
                 # T20 (C1, M16): un valor viejo con credenciales tampoco sale (ni en el pie del correo ni del PDF).
                 "https://mitienda.com@evil.com", "https://user:pw@nebulae.co", "https://@evil.com"):
        db.execute(text("INSERT INTO admin_config (key, value, updated_at) VALUES ('empresa_sitio_web', :v, NOW()) "
                        "ON CONFLICT (key) DO UPDATE SET value = :v, updated_at = NOW()"), {"v": malo})
        db.commit()
        resp = app_client.get("/api/v1/publico/empresa")
        assert resp.status_code == 200
        assert resp.json()["data"]["sitio_web"] == "", malo
        assert malo not in resp.text
        perfil = perfil_publico(db)
        assert perfil["sitio_web"] == "", malo
        assert not any(r.startswith("Página web") for r in contacto_empresa(perfil)), malo


def test_una_sola_fuente_para_color_y_telefono(monkeypatch):
    """r1 (Q4): el patrón #RRGGBB vive solo en empresa (es_color_hex, que usa también el correo) y el mínimo de dígitos
    del teléfono es el de clientes (se lee al llamar)."""
    from app.core import clientes, correo_documento, empresa
    assert empresa.es_color_hex("#abcDEF") and empresa.es_color_hex("#000000")
    for malo in ("#abcde", "abcdef", "#ABCDEG", "#ABCDEF ", "red;", None, 123):
        assert not empresa.es_color_hex(malo), malo
    assert not hasattr(correo_documento, "_HEX")
    assert "TELEFONO_MIN_DIGITOS" not in vars(empresa)
    assert empresa.validar_cambios({"telefono": "601 234 5"}) == {"telefono": "601 234 5"}  # 7 dígitos
    monkeypatch.setattr(clientes, "TELEFONO_MIN_DIGITOS", 8)
    try:
        empresa.validar_cambios({"telefono": "601 234 5"})
    except ValueError as e:
        # r2: el mensaje se arma con las constantes al lanzar (hoy, sin parche, sigue «entre 7 y 15 dígitos»).
        assert str(e) == "Teléfono no válido: escribe entre 8 y 15 dígitos.", str(e)
    else:
        raise AssertionError("empresa no usa clientes.TELEFONO_MIN_DIGITOS")
    # r2: el conteo usa [^0-9] como telefonos (no \D): un dígito de otro sistema no cuenta. Se prueba sobre el
    # patrón porque, por la API, _TELEFONO ya rechaza esos caracteres antes de contar.
    assert empresa._NO_DIGITO.sub("", "٥6") == "6"


def test_quitar_un_logo_sin_version(app_client, db, admin_token):
    """r2: un CLAVE_LOGO guardado sin su versión (upsert directo) se sirve en /publico/empresa/logo; DELETE /empresa/logo
    lo borra y después ya no se sirve."""
    from app.core import empresa
    _limpiar_empresa(db)
    db.execute(text("INSERT INTO admin_config (key, value, updated_at) VALUES (:k, :v, NOW())"),
               {"k": empresa.CLAVE_LOGO, "v": _data_url("image/png", PNG_1X1)})
    db.commit()
    assert app_client.get("/api/v1/publico/empresa/logo").status_code == 200
    resp = app_client.delete("/api/v1/empresa/logo", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    logo = app_client.get("/api/v1/publico/empresa/logo")
    assert logo.status_code == 404 and logo.json()["detail"] == "La empresa no tiene logo."
    assert _claves_guardadas(db) == {}
