"""Bloque 4, T1B: preferencias del usuario guardadas en el servidor (TABLA-base puntos 7 y 8, R4, RP24).

/api/v1/preferencias (app/api/v1/preferencias.py), cualquier usuario autenticado y solo sus filas:
- GET ''        ?prefijo= opcional -> {status, data: {clave: valor}}; sin prefijo, todas (máximo 500).
- PUT '/{clave}' con {valor} -> upsert (una fila por usuario y clave, UNIQUE(user_id, clave)).
- 422 en español (validado a mano, R21) si la clave no cumple ^(tabla|vista|kanban|flujo|analisis):[a-z0-9._-]{1,80}$
  o si len(json.dumps(valor, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) > 8192 (RP24); r1: también si
  el valor tiene más de 32 niveles anidados o un surrogate suelto (antes daban 500).
- 401 sin token.

Las tres claves inválidas de RP24 (T3A usa las mismas en test_preferencias.mjs): CLAVES_INVALIDAS.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_preferencias_usuario
"""
import json
import uuid
from datetime import datetime, timedelta

from sqlalchemy import text

URL = "/api/v1/preferencias"
LIMITE_BYTES = 8192
MAXIMO_GET = 500

# RP24: una de otro ámbito, una con mayúsculas y una de más de 80 caracteres después del ámbito.
CLAVES_INVALIDAS = ("pantalla:ventas", "tabla:Ventas", "tabla:" + "a" * 81)

# Textos exactos de los 422 de r1 (fixes-1B-r1.md, punto 3).
MENSAJE_PROFUNDIDAD = "El valor tiene demasiados niveles anidados (máximo 32)."
MENSAJE_VALOR_NO_JSON = "El valor de la preferencia no es un JSON válido."


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _suf():
    return uuid.uuid4().hex[:8]


def _put(app_client, token, clave, valor):
    return app_client.put(f"{URL}/{clave}", json={"valor": valor}, headers=_h(token))


def _get(app_client, token, prefijo=None):
    params = {} if prefijo is None else {"prefijo": prefijo}
    return app_client.get(URL, params=params, headers=_h(token))


def _filas(db, user_id, clave=None):
    sql = "select id, clave, valor, updated_at from preferencias_usuario where user_id = :u"
    params = {"u": user_id}
    if clave is not None:
        sql += " and clave = :c"
        params["c"] = clave
    return db.execute(text(sql), params).fetchall()


# ─── PUT y GET ──────────────────────────────────────────────────────────────────────────────────────────────

def test_put_y_get_por_prefijo_y_sin_prefijo(app_client, vendedor_token):
    s = _suf()
    tabla = {"anchos": {"num": 120, "cli": 240}, "orden": ["num", "cli"], "ocultas": [], "tamano": 50}
    claves = {
        f"tabla:ventas.pedidos-{s}": tabla,
        f"vista:ventas_{s}": "kanban",
        f"kanban:crm.{s}": ["GANADO", "PERDIDO"],
        f"flujo:ventas-{s}": {"compacto": True},
        f"analisis:ventas.{s}": {"periodo": "mes", "top": 10, "foco": None},
    }
    for clave, valor in claves.items():
        r = _put(app_client, vendedor_token, clave, valor)
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "success", "data": {clave: valor}}

    r = _get(app_client, vendedor_token, prefijo="tabla:")
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "success", "data": {f"tabla:ventas.pedidos-{s}": tabla}}

    r = _get(app_client, vendedor_token)  # sin prefijo: todas las del usuario (es nuevo: solo estas cinco)
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "success", "data": claves}

    r = _get(app_client, vendedor_token, prefijo="")  # prefijo vacío = sin prefijo
    assert r.status_code == 200 and r.json()["data"] == claves


def test_prefijo_es_literal_el_guion_bajo_y_el_porciento_no_son_comodines(app_client, vendedor_token):
    s = _suf()
    for clave in (f"tabla:a_{s}", f"tabla:ab{s}", f"tabla:a.{s}"):
        assert _put(app_client, vendedor_token, clave, 1).status_code == 200

    r = _get(app_client, vendedor_token, prefijo="tabla:a_")
    assert r.status_code == 200, r.text
    assert set(r.json()["data"]) == {f"tabla:a_{s}"}

    r = _get(app_client, vendedor_token, prefijo="tabla:%")
    assert r.status_code == 200 and r.json()["data"] == {}


def test_valores_json_de_todo_tipo_vuelven_iguales(app_client, vendedor_token):
    s = _suf()
    valores = {"num": 25, "texto": "Álvarez ñandú", "lista": [1, "dos", None], "nulo": None, "si": True,
               "objeto": {"a": {"b": [1.5, -2]}}}
    for nombre, valor in valores.items():
        assert _put(app_client, vendedor_token, f"tabla:tipos-{nombre}-{s}", valor).status_code == 200
    data = _get(app_client, vendedor_token, prefijo="tabla:tipos-").json()["data"]
    assert data == {f"tabla:tipos-{nombre}-{s}": valor for nombre, valor in valores.items()}


def test_segundo_put_actualiza_la_misma_fila(app_client, db, user_vendedor, vendedor_token):
    clave = f"tabla:ventas.cotizaciones-{_suf()}"
    usuario = user_vendedor.id

    assert _put(app_client, vendedor_token, clave, {"tamano": 25}).status_code == 200
    antes = _filas(db, usuario, clave)
    assert len(antes) == 1

    r = _put(app_client, vendedor_token, clave, {"tamano": 50})
    assert r.status_code == 200, r.text
    despues = _filas(db, usuario, clave)
    assert len(despues) == 1, "un segundo PUT no crea otra fila"
    assert despues[0].id == antes[0].id
    assert despues[0].valor == {"tamano": 50}
    assert despues[0].updated_at >= antes[0].updated_at
    assert _get(app_client, vendedor_token, prefijo=clave).json()["data"] == {clave: {"tamano": 50}}


# ─── solo sus filas ─────────────────────────────────────────────────────────────────────────────────────────

def test_cada_usuario_ve_y_cambia_solo_sus_filas(app_client, admin_token, vendedor_token):
    clave = f"tabla:ventas.solicitudes-{_suf()}"
    assert _put(app_client, admin_token, clave, {"de": "admin"}).status_code == 200

    r = _get(app_client, vendedor_token)
    assert r.status_code == 200, r.text
    assert clave not in r.json()["data"], "el vendedor no ve las preferencias del administrador"
    assert _get(app_client, vendedor_token, prefijo=clave).json()["data"] == {}

    # La misma clave del vendedor es otra fila: no pisa la del administrador.
    assert _put(app_client, vendedor_token, clave, {"de": "vendedor"}).status_code == 200
    assert _get(app_client, admin_token, prefijo=clave).json()["data"] == {clave: {"de": "admin"}}
    assert _get(app_client, vendedor_token, prefijo=clave).json()["data"] == {clave: {"de": "vendedor"}}


def test_get_trae_maximo_500_las_mas_recientes(app_client, db, user_vendedor, vendedor_token):
    from app.models.preferencias import PreferenciaUsuario
    usuario = user_vendedor.id
    base = datetime(2001, 1, 1)
    for i in range(MAXIMO_GET + 1):  # la 0 es la más vieja: es la que queda fuera
        db.add(PreferenciaUsuario(user_id=usuario, clave=f"tabla:t{i:03d}", valor=i,
                                  updated_at=base + timedelta(minutes=i)))
    db.commit()

    data = _get(app_client, vendedor_token).json()["data"]
    assert len(data) == MAXIMO_GET
    assert "tabla:t000" not in data and data["tabla:t500"] == 500


# ─── 422 en español ─────────────────────────────────────────────────────────────────────────────────────────

def test_clave_invalida_da_422_en_espanol_y_no_guarda(app_client, db, user_vendedor, vendedor_token):
    usuario = user_vendedor.id
    for clave in CLAVES_INVALIDAS + ("tabla:", "tabla:con espacio", "tabla:ñandú", "TABLA:ventas"):
        r = _put(app_client, vendedor_token, clave, 1)
        assert r.status_code == 422, (clave, r.status_code, r.text)
        assert "clave" in r.json()["detail"].lower(), r.text
    # Un salto de línea al final no pasa (fullmatch, no ^…$ con match).
    r = app_client.put(f"{URL}/tabla:ventas%0A", json={"valor": 1}, headers=_h(vendedor_token))
    assert r.status_code == 422, r.text
    assert _filas(db, usuario) == []

    # Los bordes que sí pasan: 80 caracteres después del ámbito y los signos permitidos.
    for clave in ("tabla:" + "a" * 80, "analisis:x", "flujo:a.b_c-9"):
        assert _put(app_client, vendedor_token, clave, 1).status_code == 200, clave


def test_valor_de_mas_de_8_kb_da_422_y_se_mide_en_bytes_utf8(app_client, db, user_vendedor, vendedor_token):
    usuario = user_vendedor.id
    s = _suf()
    # ASCII: "x" * n se serializa con sus dos comillas -> n + 2 bytes.
    ok = _put(app_client, vendedor_token, f"tabla:ascii-ok-{s}", "x" * (LIMITE_BYTES - 2))
    assert ok.status_code == 200, ok.text
    r = _put(app_client, vendedor_token, f"tabla:ascii-no-{s}", "x" * (LIMITE_BYTES - 1))
    assert r.status_code == 422, r.text
    assert "8 KB" in r.json()["detail"], r.text

    # Con tildes (nota del preparador de RP24): 'á' son 2 bytes en UTF-8. 4096 'á' son 4098 caracteres serializados,
    # muy por debajo de 8192, pero 8194 bytes: 422. Con 4095 son exactamente 8192 bytes: pasa.
    r = _put(app_client, vendedor_token, f"tabla:tildes-no-{s}", "á" * 4096)
    assert r.status_code == 422, r.text
    ok = _put(app_client, vendedor_token, f"tabla:tildes-ok-{s}", "á" * 4095)
    assert ok.status_code == 200, ok.text

    # Separadores compactos: un objeto que con ', ' y ': ' pasaría de 8192 cabe medido como (",", ":").
    valor = {f"k{i:04d}": i for i in range(690)}  # compacto 8171 bytes; con espacios 9550
    assert len(json.dumps(valor, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) <= LIMITE_BYTES
    assert len(json.dumps(valor, ensure_ascii=False).encode("utf-8")) > LIMITE_BYTES
    assert _put(app_client, vendedor_token, f"tabla:compacto-{s}", valor).status_code == 200

    claves = {f.clave for f in _filas(db, usuario)}
    assert claves == {f"tabla:ascii-ok-{s}", f"tabla:tildes-ok-{s}", f"tabla:compacto-{s}"}


def test_cuerpo_sin_valor_o_no_json_valido_da_422(app_client, db, user_vendedor, vendedor_token):
    usuario = user_vendedor.id
    clave = f"tabla:cuerpo-{_suf()}"
    for cuerpo in ({}, {"otro": 1}, [1, 2], "texto"):
        r = app_client.put(f"{URL}/{clave}", json=cuerpo, headers=_h(vendedor_token))
        assert r.status_code == 422, (cuerpo, r.status_code, r.text)
        assert "valor" in r.json()["detail"].lower(), r.text
    # NaN no es JSON: Python lo acepta al leer el cuerpo, pero la columna JSON de Postgres lo rechazaría con un 500.
    r = app_client.put(f"{URL}/{clave}", content='{"valor": NaN}',
                       headers={**_h(vendedor_token), "Content-Type": "application/json"})
    assert r.status_code == 422, r.text
    # r1 (3b): un surrogate suelto (\ud800) se lee como texto, pero no se puede pasar a UTF-8: medir el tamaño lanzaba
    # UnicodeEncodeError (500). En el valor y en una clave del objeto.
    for cuerpo in ('{"valor": "\\ud800"}', '{"valor": {"\\udfff": 1}}'):
        r = app_client.put(f"{URL}/{clave}", content=cuerpo,
                           headers={**_h(vendedor_token), "Content-Type": "application/json"})
        assert r.status_code == 422, (cuerpo, r.status_code, r.text)
        assert r.json()["detail"] == MENSAJE_VALOR_NO_JSON, r.text
    assert _filas(db, usuario) == []


def _anidado(niveles, en_objeto=False):
    """Un valor con `niveles` listas (u objetos) una dentro de otra; 0 es un número suelto."""
    valor = 0
    for _ in range(niveles):
        valor = {"a": valor} if en_objeto else [valor]
    return valor


def test_valor_con_mas_de_32_niveles_anidados_da_422_sin_guardar(app_client, db, user_vendedor, vendedor_token):
    """r1 (3a): con unos 1000 niveles el PUT confirmaba y la respuesta daba 500 (RecursionError), y desde entonces el GET
    sin prefijo de ese usuario daba 500. Ahora la profundidad se mide antes que el tamaño: más de 32 -> 422."""
    usuario = user_vendedor.id
    s = _suf()
    for clave, valor in ((f"tabla:hondo-1200-{s}", _anidado(1200)), (f"tabla:hondo-33-{s}", _anidado(33)),
                         (f"tabla:hondo-33-objeto-{s}", _anidado(33, en_objeto=True))):
        r = _put(app_client, vendedor_token, clave, valor)
        assert r.status_code == 422, (clave, r.status_code, r.text[:200])
        assert r.json()["detail"] == MENSAJE_PROFUNDIDAD, r.text[:200]
    assert _filas(db, usuario) == []

    for clave, valor in ((f"tabla:hondo-32-{s}", _anidado(32)), (f"tabla:hondo-32-objeto-{s}", _anidado(32, True))):
        r = _put(app_client, vendedor_token, clave, valor)
        assert r.status_code == 200, (clave, r.status_code, r.text[:200])
    r = _get(app_client, vendedor_token)
    assert r.status_code == 200, r.text[:200]
    assert r.json()["data"] == {f"tabla:hondo-32-{s}": _anidado(32), f"tabla:hondo-32-objeto-{s}": _anidado(32, True)}


# ─── 401 sin token ──────────────────────────────────────────────────────────────────────────────────────────

def test_sin_token_da_401(app_client):
    assert app_client.get(URL).status_code == 401
    assert app_client.get(URL, params={"prefijo": "tabla:"}).status_code == 401
    assert app_client.put(f"{URL}/tabla:ventas", json={"valor": 1}).status_code == 401
    r = app_client.put(f"{URL}/tabla:ventas", json={"valor": 1}, headers={"Authorization": "Bearer no-es-un-token"})
    assert r.status_code == 401


# ─── la tabla ───────────────────────────────────────────────────────────────────────────────────────────────

def test_borrar_el_usuario_borra_sus_preferencias(app_client, db, user_vendedor, vendedor_token):
    """user_id es FK users ON DELETE CASCADE (fa6_033). Dentro de la transacción que el runner revierte."""
    usuario = user_vendedor.id
    assert _put(app_client, vendedor_token, f"vista:ventas-{_suf()}", "lista").status_code == 200
    assert len(_filas(db, usuario)) == 1
    db.execute(text("delete from users where id = :u"), {"u": usuario})
    assert _filas(db, usuario) == []
