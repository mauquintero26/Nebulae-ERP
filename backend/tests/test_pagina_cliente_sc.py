"""Bloque 3, Tarea 5 — U17+H28: la solicitud que ve el cliente (POST /confirmar/ver y /confirmar/confirmar).

- Enlace vigente de una SC en Pendiente por confirmación: 200 {status, estado_enlace 'pendiente', vence_at (ISO con
  'Z'), empresa (perfil_publico, C26), data}. data conserva numero, estado y productos ({n, descripcion, cantidad}, sin
  precio) y trae documento (documento_sc, con la forma de C2 y los nombres de R24). Nunca notas internas, teléfono,
  correo ni ids.
- Todo lo que no es 'pendiente' sigue en 400, ahora con detail dict (_detalle_enlace): {mensaje, estado_enlace, empresa,
  documento, confirmada_el, siguiente_paso, comentario}. Reglas a-i de U17 (C10): invalido, no_disponible, confirmada
  (con el resumen durante 30 días), vencido ({numero}), reemplazado, cambios_enviados (regla g, la escribe T6),
  actualizada. Las pruebas afirman detail['estado_enlace'], nunca el texto.
- Confirmar: marcar_resultado 'CONFIRMADO' en el MISMO commit que pone CONFIRMADA; 200 con estado_enlace, mensaje,
  confirmada_el (iso_z, RP26), siguiente_paso (3 textos), empresa y data.
- R3: la «Nota para el cliente» (customer_requests.nota_cliente, fa6_029) sale en el documento; las Notas de la SC no.
  Editarla no anula el enlace.

Los símbolos nuevos de T5 se importan DENTRO de cada prueba (el runner importa el módulo fuera de un try).
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_pagina_cliente_sc
"""
import datetime
import hashlib
import json
import uuid

from sqlalchemy import text

from _registro_capturado import registro_capturado

MOD_60_40 = "60/40 (60% anticipo - 40% pendiente)"
RODILLOS = [{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 5000, "sku_id": 9}]
EMPRESA = "Pinturas del Valle"
ASESORA = "Laura Gómez"
CLAVES_DETALLE = {"mensaje", "estado_enlace", "empresa", "documento", "confirmada_el", "siguiente_paso", "comentario"}
CLAVES_200_VER = {"status", "estado_enlace", "vence_at", "empresa", "data"}
CLAVES_200_CONFIRMAR = {"status", "message", "estado_enlace", "mensaje", "confirmada_el", "siguiente_paso", "empresa",
                        "data"}
CLAVES_200_MINIMO = {"status", "message", "estado_enlace", "mensaje", "confirmada_el", "empresa"}
CLAVES_DATA_SC = {"numero", "customer_name", "estado", "fecha_entrega_estimada", "productos", "documento"}
CLAVES_DATA_COT = CLAVES_DATA_SC | {"total_cop"}
# El cliente nuevo de las pruebas del cambio de cliente (r1, P4): nunca debe aparecer en el enlace del anterior.
NOMBRE_B = "Cliente Beta Secreto"
DIRECCION_B = "Carrera Beta Secreta 99"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _ahora():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


def _sin_correo(monkeypatch):
    """enviar-confirmacion manda correo si hay customer_email: nunca sale uno real."""
    import app.core.email as correo
    enviados = []
    monkeypatch.setattr(correo, "send_email", lambda *a, **k: enviados.append((a, k)) or True)
    return enviados


def _empresa(app_client, admin_token, **campos):
    resp = app_client.put("/api/v1/empresa", json={"nombre_comercial": EMPRESA, **campos}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


def _sc(db, user_admin, **campos):
    """Una SC ASIGNADA (con asesor y productos), lista para enviar al cliente."""
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    campos.setdefault("productos", RODILLOS)
    campos.setdefault("modalidad_pago", MOD_60_40)
    campos.setdefault("advisor_name", ASESORA)
    sc = CustomerRequest(numero=f"SC-T5P{_sufijo()}", customer_name="Ana Pérez", advisor_user_id=user_admin.id,
                         **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _enviar(app_client, admin_token, sc):
    """POST enviar-confirmacion y el token crudo del link_confirmacion (como test_confirmacion_solicitud)."""
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    return resp.json()["link_confirmacion"].rsplit("/", 1)[-1]


def _ver(app_client, raw):
    return app_client.post("/api/v1/confirmar/ver", json={"token": raw})


def _confirmar(app_client, raw):
    return app_client.post("/api/v1/confirmar/confirmar", json={"token": raw},
                           headers={"Idempotency-Key": f"t5-{uuid.uuid4().hex[:8]}"})


def _detalle(resp, estado):
    """El 400 con el detail dict de _detalle_enlace (C10), con exactamente sus claves y la empresa (C26)."""
    assert resp.status_code == 400, resp.text
    detalle = resp.json()["detail"]
    assert isinstance(detalle, dict), detalle
    assert detalle["estado_enlace"] == estado, detalle
    assert set(detalle) == CLAVES_DETALLE, detalle
    assert isinstance(detalle["empresa"], dict) and "nombre_comercial" in detalle["empresa"], detalle
    assert detalle["mensaje"], detalle
    return detalle


def _hash(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def _fila(db, raw):
    return db.execute(text("SELECT used_at, resultado FROM document_confirmation_tokens WHERE token_hash = :h"),
                      {"h": _hash(raw)}).mappings().first()


def _poner(db, raw, **campos):
    asignaciones = ", ".join(f"{c} = :{c}" for c in campos)
    db.execute(text(f"UPDATE document_confirmation_tokens SET {asignaciones} WHERE token_hash = :h"),
               {**campos, "h": _hash(raw)})
    db.commit()


def _todas_las_claves(valor):
    if isinstance(valor, dict):
        for clave, v in valor.items():
            yield clave
            yield from _todas_las_claves(v)
    elif isinstance(valor, list):
        for v in valor:
            yield from _todas_las_claves(v)


def _desde_iso_z(valor):
    assert valor.endswith("Z"), valor
    return datetime.datetime.fromisoformat(valor[:-1])


# ─── 1 y 2: el enlace vigente ───────────────────────────────────────────────────────────────────────────────

def test_ver_pendiente_trae_empresa_forma_de_pago_y_productos_sin_precio(app_client, db, admin_token, user_admin,
                                                                         monkeypatch):
    from app.core.documento_cliente import CLAVES_DOCUMENTO
    _sin_correo(monkeypatch)
    _empresa(app_client, admin_token)
    sc = _sc(db, user_admin, customer_address="Calle 10 # 5-20",
             fecha_entrega_estimada=datetime.datetime(2026, 10, 21, 15, 0))
    raw = _enviar(app_client, admin_token, sc)

    resp = _ver(app_client, raw)
    assert resp.status_code == 200, resp.text
    j = resp.json()
    assert set(j) == CLAVES_200_VER  # r1 (C6): el envelope exacto
    assert j["status"] == "success" and j["estado_enlace"] == "pendiente"
    assert _desde_iso_z(j["vence_at"]) > _ahora()
    assert j["empresa"]["nombre_comercial"] == EMPRESA
    data = j["data"]
    assert set(data) == CLAVES_DATA_SC
    assert data["numero"] == sc.numero and data["estado"] == "PENDIENTE_CONFIRMACION"
    assert data["customer_name"] == "Ana Pérez"
    assert data["fecha_entrega_estimada"] == "2026-10-21T15:00:00"  # campo de compatibilidad, sin 'Z' (ruling r1)
    assert data["productos"] == [{"n": 1, "descripcion": "Rodillo", "cantidad": 6}]  # compatibilidad, sin precio

    doc = data["documento"]
    assert set(doc) == CLAVES_DOCUMENTO
    assert (doc["tipo"], doc["titulo"], doc["numero"], doc["con_precios"]) == ("SC", "Solicitud", sc.numero, False)
    assert doc["pago"]["anticipo_pct"] == 60 and doc["pago"]["modalidad"] == MOD_60_40
    assert doc["pago"]["manual"] is False
    for clave in ("anticipo", "saldo", "saldo_a_favor", "anticipo_por_pagar", "pagado", "pagos", "instrucciones"):
        assert doc["pago"][clave] is None, clave
    assert sum(l["cantidad"] for l in doc["lineas"]) == 6  # total_unidades no es clave del contrato (R24)
    for linea in doc["lineas"]:
        for campo in ("precio_unitario", "total_linea", "iva_etiqueta", "iva_pct", "anticipo"):
            assert linea[campo] is None, campo
    assert doc["totales"] is None and doc["terminos"] is None
    assert doc["fecha_emision"].endswith("Z")
    assert doc["fecha_entrega_estimada"] == "2026-10-21"
    assert doc["cliente"] == {"nombre": "Ana Pérez", "direccion_entrega": "Calle 10 # 5-20"}
    assert doc["atendido_por"] == ASESORA
    assert "unit_price_cop" not in resp.text and "sku_id" not in resp.text


def test_ver_no_expone_datos_internos(app_client, db, admin_token, user_admin, monkeypatch):
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin, notas="cliente difícil", customer_email="privado@cliente.com",
             customer_phone="3001112233", created_by="creador@nebulae.com")
    raw = _enviar(app_client, admin_token, sc)
    secretos = ("cliente difícil", "privado@cliente.com", "3001112233", "creador@nebulae.com")
    internas = {"customer_email", "customer_phone", "advisor_user_id", "advisor_name", "created_by",
                "razon_cancelacion", "id", "sc_id", "customer_id", "document_id", "document_type", "token_hash",
                "used_at", "expires_at", "created_at", "resultado"}

    resp = _ver(app_client, raw)
    assert resp.status_code == 200, resp.text
    texto = json.dumps(resp.json(), ensure_ascii=False)
    for secreto in secretos:
        assert secreto not in texto, secreto
    assert not internas & set(_todas_las_claves(resp.json())), internas & set(_todas_las_claves(resp.json()))
    assert resp.json()["data"]["documento"]["notas"] == []  # las Notas de la SC son internas (R3)

    # Lo mismo en el 400 de un enlace ya confirmado (el que lleva el resumen).
    assert _confirmar(app_client, raw).status_code == 200
    resp = _ver(app_client, raw)
    _detalle(resp, "confirmada")
    texto = json.dumps(resp.json(), ensure_ascii=False)
    for secreto in secretos:
        assert secreto not in texto, secreto
    assert not internas & set(_todas_las_claves(resp.json()))


# ─── 3 a 6: confirmar y reabrir ─────────────────────────────────────────────────────────────────────────────

def test_reabrir_un_enlace_ya_confirmado_dice_ya_fue_confirmada(app_client, db, admin_token, user_admin, monkeypatch):
    _sin_correo(monkeypatch)
    _empresa(app_client, admin_token)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    assert _confirmar(app_client, raw).status_code == 200

    d = _detalle(_ver(app_client, raw), "confirmada")
    assert d["documento"]["numero"] == sc.numero
    assert [l["descripcion"] for l in d["documento"]["lineas"]] == ["Rodillo"]
    assert d["documento"]["tipo"] == "SC"
    db.refresh(sc)
    # confirmada_el = used_at del enlace (resultado CONFIRMADO), en ISO con 'Z' (RP26).
    assert abs((_desde_iso_z(d["confirmada_el"]) - sc.gate1_confirmed_at).total_seconds()) < 1
    assert len(d["siguiente_paso"]) == 3
    assert d["empresa"]["nombre_comercial"] == EMPRESA
    assert _fila(db, raw)["resultado"] == "CONFIRMADO"


def test_confirmar_responde_que_sigue(app_client, db, admin_token, user_admin, monkeypatch, contador_sql):
    _sin_correo(monkeypatch)
    _empresa(app_client, admin_token)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)

    with contador_sql.ventana() as v:
        resp = _confirmar(app_client, raw)
    assert resp.status_code == 200, resp.text
    # Reclamar el token y el commit que pone CONFIRMADA (con la revocación y el resultado): armar la respuesta solo lee.
    assert v.commits == 2, v.commits
    j = resp.json()
    assert set(j) == CLAVES_200_CONFIRMAR and set(j["data"]) == CLAVES_DATA_SC  # r1 (C6)
    assert j["siguiente_paso"][1] == "Te la enviamos por el mismo medio para que la revises y la apruebes."
    assert j["status"] == "success" and j["message"] == "Solicitud confirmada. Gracias."
    assert j["estado_enlace"] == "confirmada"
    assert j["mensaje"] == "¡Gracias! Tu confirmación fue registrada."
    assert len(j["siguiente_paso"]) == 3 and "cotización" in j["siguiente_paso"][0]
    assert ASESORA in j["siguiente_paso"][0]
    assert "60%" in j["siguiente_paso"][2]
    assert j["empresa"]["nombre_comercial"] == EMPRESA
    assert j["data"]["numero"] == sc.numero and j["data"]["documento"]["tipo"] == "SC"
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None
    assert abs((_desde_iso_z(j["confirmada_el"]) - sc.gate1_confirmed_at).total_seconds()) < 1  # RP26: iso_z
    assert _fila(db, raw)["resultado"] == "CONFIRMADO"


def test_doble_clic_en_confirmar_muestra_ya_confirmada(app_client, db, admin_token, user_admin, monkeypatch):
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    assert _confirmar(app_client, raw).status_code == 200
    d = _detalle(_confirmar(app_client, raw), "confirmada")
    assert d["documento"]["numero"] == sc.numero


def test_resumen_se_oculta_a_los_30_dias(app_client, db, admin_token, user_admin, monkeypatch):
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    assert _confirmar(app_client, raw).status_code == 200

    _poner(db, raw, used_at=_ahora() - datetime.timedelta(days=31))
    d = _detalle(_ver(app_client, raw), "confirmada")
    assert d["documento"] == {"numero": sc.numero}  # sin productos
    assert d["confirmada_el"].endswith("Z")
    assert len(d["siguiente_paso"]) == 3  # T15 r1: «¿Qué sigue?» se mantiene (es el mismo cliente)

    _poner(db, raw, used_at=_ahora() - datetime.timedelta(days=29))
    d = _detalle(_ver(app_client, raw), "confirmada")
    assert [l["descripcion"] for l in d["documento"]["lineas"]] == ["Rodillo"]


# ─── 7 a 12: los demás estados del enlace ───────────────────────────────────────────────────────────────────

def test_enlace_reemplazado(app_client, db, admin_token, user_admin, monkeypatch):
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    primero = _enviar(app_client, admin_token, sc)
    segundo = _enviar(app_client, admin_token, sc)
    d = _detalle(_ver(app_client, primero), "reemplazado")
    assert d["documento"] is None and d["confirmada_el"] is None and d["siguiente_paso"] is None
    assert _fila(db, primero)["resultado"] == "REVOCADO"
    _detalle(_confirmar(app_client, primero), "reemplazado")
    assert _ver(app_client, segundo).status_code == 200


def test_enlace_de_sc_cancelada_dice_no_disponible(app_client, db, admin_token, user_admin, monkeypatch):
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/cancelar",
                           json={"razon": "El cliente desistió", "user_name": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    for resp in (_ver(app_client, raw), _confirmar(app_client, raw)):
        d = _detalle(resp, "no_disponible")
        assert d["documento"] is None
        assert "cancel" not in d["mensaje"].lower()


def test_enlace_vencido(app_client, db, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    raw = create_confirmation_token(db, "SC", sc.id, expires_at=_ahora() - datetime.timedelta(hours=1))
    for resp in (_ver(app_client, raw), _confirmar(app_client, raw)):
        d = _detalle(resp, "vencido")
        assert d["documento"] == {"numero": sc.numero}
    assert _fila(db, raw)["used_at"] is None  # confirmar no lo gastó


def test_token_inventado_es_invalido(app_client, db, admin_token):
    _empresa(app_client, admin_token)
    for resp in (_ver(app_client, "x" * 43), _confirmar(app_client, "x" * 43)):
        d = _detalle(resp, "invalido")
        assert d["documento"] is None and d["confirmada_el"] is None
        assert d["empresa"]["nombre_comercial"] == EMPRESA  # para que el cliente sepa a quién escribir


def test_confirmada_y_luego_productos_cambiados_dice_actualizada(app_client, db, admin_token, user_admin, monkeypatch):
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    assert _confirmar(app_client, raw).status_code == 200
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}",
                            json={"productos": [{"product_name": "Rodillo", "qty": 8}], "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "ASIGNADA"
    d = _detalle(_ver(app_client, raw), "actualizada")
    assert d["documento"] is None


def test_sc_confirmada_por_la_cotizacion_dice_ya_fue_confirmada(app_client, db, admin_token, user_admin, monkeypatch):
    """U15: el cliente aprobó la cotización y la sincronización confirmó la SC (y revocó su enlace). El enlace de la SC
    dice 'confirmada', con la fecha del renglón de la Actividad y el resumen (era el último enlace que se le envió)."""
    from app.api.v1.erp_ventas import _sincronizar_estado_solicitud_desde_cotizacion
    from app.models.erp_documents import SalesQuotation
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    cot = SalesQuotation(numero=f"COT-T5P{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_name="Ana Pérez",
                         estado="CONFIRMADA", total_cop=1000,
                         productos=[{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)
    _sincronizar_estado_solicitud_desde_cotizacion(cot, db)
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is None
    assert _fila(db, raw)["resultado"] == "REVOCADO"

    d = _detalle(_ver(app_client, raw), "confirmada")
    assert d["confirmada_el"].endswith("Z")  # del renglón ESTADO_CHANGED -> CONFIRMADA
    assert [l["descripcion"] for l in d["documento"]["lineas"]] == ["Rodillo"]


def test_enlace_viejo_del_mismo_cliente_ve_el_resumen(app_client, db, admin_token, user_admin, monkeypatch):
    """r1 (ruling sobre la duda 2): la guarda «solo el último enlace o el que confirmó» se reemplaza por la del cambio de
    cliente. Un enlace viejo (reemplazado) del MISMO cliente, de una SC que se confirmó por el enlace nuevo, ve el
    resumen: no hay datos de otra persona."""
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    viejo = _enviar(app_client, admin_token, sc)
    nuevo = _enviar(app_client, admin_token, sc)
    assert _confirmar(app_client, nuevo).status_code == 200
    d = _detalle(_ver(app_client, viejo), "confirmada")
    assert [l["descripcion"] for l in d["documento"]["lineas"]] == ["Rodillo"]
    assert d["documento"] == _detalle(_ver(app_client, nuevo), "confirmada")["documento"]


def _ficha(db, nombre, apellido, direccion):
    from app.models.customers import Customer
    ficha = Customer(first_name=nombre, last_name=apellido, address=direccion, phone="3005550000",
                     email=f"t5r1-{uuid.uuid4().hex[:8]}@test.nebulae")
    db.add(ficha); db.commit(); db.refresh(ficha)
    return ficha


def _cambiar_cliente(app_client, admin_token, sc, ficha_b):
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}",
                            json={"customer_id": ficha_b.id, "customer_name": NOMBRE_B, "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_cambio_de_cliente_despues_de_confirmar_no_muestra_al_cliente_nuevo(app_client, db, admin_token, user_admin,
                                                                          monkeypatch):
    """r1, P4 camino A: A confirma con su enlace L1; la SC tiene una COT activa y el asesor le cambia el cliente a B (la
    SC sigue CONFIRMADA). L1 dice 'confirmada', pero solo con el número: nunca el nombre ni la dirección de B."""
    from app.models.erp_documents import SalesQuotation
    _sin_correo(monkeypatch)
    ficha_a = _ficha(db, "Ana", "Pérez", "Calle Alfa 1")
    ficha_b = _ficha(db, "Cliente Beta", "Secreto", DIRECCION_B)
    sc = _sc(db, user_admin, customer_id=ficha_a.id, customer_address="Calle Alfa 1")
    l1 = _enviar(app_client, admin_token, sc)
    assert _confirmar(app_client, l1).status_code == 200
    cot = SalesQuotation(numero=f"COT-T5P{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_name="Ana Pérez",
                         estado="BORRADOR", productos=[{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 1000}])
    db.add(cot); db.commit()
    data = _cambiar_cliente(app_client, admin_token, sc, ficha_b)
    assert data["estado"] == "CONFIRMADA" and data["customer_address"] == DIRECCION_B

    resp = _ver(app_client, l1)
    d = _detalle(resp, "confirmada")
    assert d["documento"] == {"numero": sc.numero}
    assert NOMBRE_B not in resp.text and DIRECCION_B not in resp.text
    # B3 T15 r1 (menor 9): «¿Qué sigue?» (asesor y anticipo) tampoco le llega a quien ya no es el cliente.
    assert d["siguiente_paso"] is None
    assert ASESORA not in resp.text


def test_cambio_de_cliente_y_confirmacion_por_la_cotizacion_no_muestra_al_cliente_nuevo(app_client, db, admin_token,
                                                                                      user_admin, monkeypatch):
    """r1, P4 camino B: L1 se envía a A con la SC pendiente; el asesor cambia el cliente a B (L1 queda REVOCADO); B
    aprueba su COT y la sincronización confirma la SC. L1, que sigue siendo el último enlace de la SC, no muestra a B."""
    from app.api.v1.erp_ventas import _sincronizar_estado_solicitud_desde_cotizacion
    from app.models.erp_documents import SalesQuotation
    _sin_correo(monkeypatch)
    ficha_a = _ficha(db, "Ana", "Pérez", "Calle Alfa 1")
    ficha_b = _ficha(db, "Cliente Beta", "Secreto", DIRECCION_B)
    sc = _sc(db, user_admin, customer_id=ficha_a.id, customer_address="Calle Alfa 1")
    l1 = _enviar(app_client, admin_token, sc)
    data = _cambiar_cliente(app_client, admin_token, sc, ficha_b)
    assert data["estado"] == "ASIGNADA"
    assert _fila(db, l1)["resultado"] == "REVOCADO"
    cot = SalesQuotation(numero=f"COT-T5P{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_id=ficha_b.id,
                         customer_name=NOMBRE_B, estado="CONFIRMADA",
                         productos=[{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)
    _sincronizar_estado_solicitud_desde_cotizacion(cot, db)
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"

    resp = _ver(app_client, l1)
    d = _detalle(resp, "confirmada")
    assert d["documento"] == {"numero": sc.numero}
    assert NOMBRE_B not in resp.text and DIRECCION_B not in resp.text
    # B3 T15 r1 (menor 9): «¿Qué sigue?» (asesor y anticipo) tampoco le llega a quien ya no es el cliente.
    assert d["siguiente_paso"] is None
    assert ASESORA not in resp.text


def test_la_guarda_no_depende_del_renglon_auxiliar_de_cambios(app_client, db, admin_token, user_admin, monkeypatch):
    """r2 (privacidad 2, sonda 4): el camino B con una falla inyectada en cambios_documento.describir. El renglón
    auxiliar de cambios no se escribe (_registrar_cambios se la traga y el PATCH responde 200), pero el cambio de
    cliente deja su marcador obligatorio en el mismo commit: el enlace L1 sigue sin mostrar a B."""
    import app.core.cambios_documento as cd
    from app.api.v1.erp_ventas import _sincronizar_estado_solicitud_desde_cotizacion
    from app.models.erp_documents import ActivityLog, SalesQuotation
    _sin_correo(monkeypatch)
    ficha_a = _ficha(db, "Ana", "Pérez", "Calle Alfa 1")
    ficha_b = _ficha(db, "Cliente Beta", "Secreto", DIRECCION_B)
    sc = _sc(db, user_admin, customer_id=ficha_a.id, customer_address="Calle Alfa 1")
    l1 = _enviar(app_client, admin_token, sc)

    def falla(*args, **kwargs):
        raise RuntimeError("falla inyectada en el renglón auxiliar")

    monkeypatch.setattr(cd, "describir", falla)
    with registro_capturado("app.api.v1.erp_ventas"):  # el warning de _registrar_cambios, sin ruido en la salida
        data = _cambiar_cliente(app_client, admin_token, sc, ficha_b)
    monkeypatch.undo()
    assert data["estado"] == "ASIGNADA"
    db.expire_all()
    acciones = [l.action for l in db.query(ActivityLog).filter(ActivityLog.entity_type == "SC",
                                                                 ActivityLog.entity_id == sc.id)]
    assert "CLIENTE_CAMBIADO" in acciones  # el marcador, aunque el renglón de cambios no se escribió
    cot = SalesQuotation(numero=f"COT-T5P{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_id=ficha_b.id,
                         customer_name=NOMBRE_B, estado="CONFIRMADA",
                         productos=[{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)
    _sincronizar_estado_solicitud_desde_cotizacion(cot, db)

    resp = _ver(app_client, l1)
    assert _detalle(resp, "confirmada")["documento"] == {"numero": sc.numero}
    assert NOMBRE_B not in resp.text and DIRECCION_B not in resp.text


def test_corregir_el_contacto_deja_el_marcador_en_su_renglon(app_client, db, admin_token, user_admin, monkeypatch):
    """r2 (privacidad 2): PATCH /solicitudes/{id}/cliente marca el cambio de cliente en su renglón obligatorio (el de la
    corrección, que no se traga los errores): extra_data.cliente_cambiado. r3: con la regla de la revocación (R18 del
    Bloque 2): el correo o el teléfono sí; solo la dirección de la misma persona no. Aun así, la guarda del resumen es
    conservadora: después de corregir la dirección, el enlace confirmado antes ya no muestra el resumen."""
    from app.models.erp_documents import ActivityLog
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    assert _confirmar(app_client, raw).status_code == 200

    def renglones():
        db.expire_all()
        return (db.query(ActivityLog).filter(ActivityLog.entity_type == "SC", ActivityLog.entity_id == sc.id,
                                             ActivityLog.action == "UPDATED").order_by(ActivityLog.id.asc()).all())

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}/cliente", json={"customer_address": "Calle Nueva 5"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    [direccion] = renglones()
    assert "cliente_cambiado" not in direccion.extra_data
    assert _detalle(_ver(app_client, raw), "confirmada")["documento"] == {"numero": sc.numero}

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}/cliente",
                            json={"customer_email": f"otro-{_sufijo().lower()}@cliente.com"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert renglones()[-1].extra_data["cliente_cambiado"] is True


def _renglones_de_estado(db, sc_id):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    return (db.query(ActivityLog).filter(ActivityLog.entity_type == "SC", ActivityLog.entity_id == sc_id,
                                         ActivityLog.action == "ESTADO_CHANGED")
            .order_by(ActivityLog.id.asc()).all())


def test_cambio_de_solo_el_nombre_revoca_el_enlace_pendiente_de_la_sc(app_client, db, admin_token, user_admin,
                                                                      monkeypatch):
    """r4 (privacidad 1, sonda A): SC sin ficha de Ana, pendiente, con su enlace L1. Cambiarle solo el nombre (por la
    API) cambia a quién le llega el enlace (_identidad_del_cliente incluye el nombre): L1 se revoca en el mismo commit y
    nunca muestra el nombre ni, después de corregir la dirección, la dirección de B. T20 r1b (M4, M11, M15, opción A
    del usuario): un cambio REAL de nombre es un cambio de cliente, así que la SC vuelve a Asignada con el renglón
    «cambió el cliente…» (antes quedaba en Pendiente con el enlace muerto y sin aviso)."""
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin, customer_address="Calle Alfa 1")
    l1 = _enviar(app_client, admin_token, sc)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"customer_name": NOMBRE_B, "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "ASIGNADA"
    assert _fila(db, l1)["resultado"] == "REVOCADO"
    renglon = _renglones_de_estado(db, sc.id)[-1]
    assert (renglon.old_estado, renglon.new_estado) == ("PENDIENTE_CONFIRMACION", "ASIGNADA")
    assert "cambió el cliente" in renglon.description, renglon.description
    resp = _ver(app_client, l1)
    assert _detalle(resp, "no_disponible")["documento"] is None
    assert NOMBRE_B not in resp.text
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}/cliente", json={"customer_address": DIRECCION_B},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    for resp in (_ver(app_client, l1), _confirmar(app_client, l1)):
        assert resp.status_code == 400, resp.text
        assert NOMBRE_B not in resp.text and DIRECCION_B not in resp.text


def test_cambio_real_del_nombre_reinicia_gate1(app_client, db, admin_token, user_admin, monkeypatch):
    """T20 r1b (M15, opción A del usuario: «Pedir confirmación otra vez»): un cambio REAL del nombre en una SC
    confirmada (sin COT activa) es un cambio de cliente, como cambiar la ficha: vuelve a Asignada sin gate1, con el
    renglón «cambió el cliente…». El enlace que confirmó ya no dice nada de la SC (M2: 'no_disponible')."""
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    assert _confirmar(app_client, raw).status_code == 200
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"customer_name": "Ana María Pérez",
                                                                       "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.gate1_confirmed_at is None
    renglon = _renglones_de_estado(db, sc.id)[-1]
    assert (renglon.old_estado, renglon.new_estado) == ("CONFIRMADA", "ASIGNADA")
    assert "cambió el cliente" in renglon.description, renglon.description
    d = _detalle(_ver(app_client, raw), "no_disponible")
    assert d["documento"] is None and d["siguiente_paso"] is None


def test_corregir_tildes_del_nombre_no_reinicia_gate1(app_client, db, admin_token, user_admin, monkeypatch):
    """T20 r1b: lo cosmético NO es un cambio de cliente (_mismo_nombre / _nombre_para_comparar, la regla única de M14):
    una SC confirmada con 'Ana Perez' que pasa a ' ana  PÉREZ ' sigue Confirmada, con su gate1, su enlace como estaba y
    sin el marcador CLIENTE_CAMBIADO."""
    from app.models.erp_documents import ActivityLog
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    sc.customer_name = "Ana Perez"
    db.commit()
    raw = _enviar(app_client, admin_token, sc)
    assert _confirmar(app_client, raw).status_code == 200
    db.refresh(sc)
    gate1, fila = sc.gate1_confirmed_at, dict(_fila(db, raw))
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"customer_name": " ana  PÉREZ ",
                                                                       "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at == gate1 and gate1 is not None
    assert dict(_fila(db, raw)) == fila and fila["resultado"] == "CONFIRMADO"
    _detalle(_ver(app_client, raw), "confirmada")
    acciones = [r.action for r in db.query(ActivityLog).filter(ActivityLog.entity_type == "SC",
                                                                 ActivityLog.entity_id == sc.id)]
    assert "CLIENTE_CAMBIADO" not in acciones, acciones
    assert [r for r in _renglones_de_estado(db, sc.id) if r.new_estado == "ASIGNADA"] == []


def test_cambio_real_del_nombre_con_cotizacion_activa_anula_la_confirmacion(app_client, db, admin_token, user_admin,
                                                                           monkeypatch):
    """T20 r1b (opción A): con una COT activa la SC sigue Confirmada (U15), pero la confirmación era del cliente
    anterior: gate1 queda None y la Actividad lo avisa (_AVISO_CAMBIO_DE_CLIENTE), así que para otra cotización hay que
    enviarle la SC al cliente nuevo."""
    from app.api.v1.erp_ventas import _AVISO_CAMBIO_DE_CLIENTE
    from app.models.erp_documents import ActivityLog, SalesQuotation
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    assert _confirmar(app_client, raw).status_code == 200
    cot = SalesQuotation(numero=f"COT-T20{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_name="Ana Pérez",
                         estado="BORRADOR", productos=[{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 1000}])
    db.add(cot); db.commit()
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"customer_name": NOMBRE_B, "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is None
    db.expire_all()
    avisos = [r for r in db.query(ActivityLog).filter(ActivityLog.entity_type == "SC", ActivityLog.entity_id == sc.id,
                                                       ActivityLog.action == "UPDATED")
              if r.description == _AVISO_CAMBIO_DE_CLIENTE]
    assert len(avisos) == 1


def test_cambiar_la_ficha_sin_nombre_toma_el_nombre_de_la_ficha(app_client, db, admin_token, user_admin):
    """r4 (privacidad 2, variante): como B7 ya toma el teléfono, el correo y la dirección de la ficha nueva, cambiar
    customer_id sin customer_name también toma su nombre: la SC nunca queda con el nombre del cliente anterior."""
    ficha_a = _ficha(db, "Ana", "Pérez", "Calle Alfa 1")
    ficha_b = _ficha(db, "Cliente Beta", "Secreto", DIRECCION_B)
    sc = _sc(db, user_admin, customer_id=ficha_a.id, customer_address="Calle Alfa 1")
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"customer_id": ficha_b.id, "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert (data["customer_name"], data["customer_address"]) == (NOMBRE_B, DIRECCION_B)
    # Si el body trae el nombre, ese gana.
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}",
                            json={"customer_id": ficha_a.id, "customer_name": "Ana P.", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["customer_name"] == "Ana P."


def test_confirmacion_anulada_sin_cambio_de_cliente_no_muestra_el_resumen(app_client, db, admin_token, user_admin,
                                                                          monkeypatch):
    """r1 (P4): para el enlace que confirmó, el resumen exige que esa confirmación siga vigente (gate1_confirmed_at). Con
    una COT activa, cambiar los productos deja la SC CONFIRMADA pero N7 limpia la marca: el enlace ya no muestra un
    resumen que no es lo que el cliente confirmó (aquí no cambió ningún dato del cliente)."""
    from app.models.erp_documents import SalesQuotation
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    assert _confirmar(app_client, raw).status_code == 200
    cot = SalesQuotation(numero=f"COT-T5P{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_name="Ana Pérez",
                         estado="BORRADOR", productos=[{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 1000}])
    db.add(cot); db.commit()
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}",
                            json={"productos": [{"product_name": "Rodillo", "qty": 9}], "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is None
    d = _detalle(_ver(app_client, raw), "confirmada")
    assert d["documento"] == {"numero": sc.numero}


def test_sc_en_estado_heredado_sin_fecha_dice_confirmada_sin_resumen(app_client, db, user_admin):
    """r1 (C4): una SC en un estado heredado de U15 (COTIZADA) con su enlace usado sin resultado y sin renglón
    CONFIRMADA en la Actividad: 'confirmada', sin fecha y solo con el número (sin la fecha no se sabe si van 30 días)."""
    from app.core.confirmation_tokens import create_confirmation_token, reclamar_token
    sc = _sc(db, user_admin, estado="COTIZADA")
    raw = create_confirmation_token(db, "SC", sc.id)
    assert reclamar_token(db, raw) is not None
    d = _detalle(_ver(app_client, raw), "confirmada")
    assert d["documento"] == {"numero": sc.numero}
    assert d["confirmada_el"] is None
    assert len(d["siguiente_paso"]) == 3


def test_respuesta_minima_si_falla_el_documento_despues_de_confirmar(app_client, db, admin_token, user_admin,
                                                                     monkeypatch):
    """r1 (P3): la confirmación ya quedó guardada; si armar el documento de la respuesta falla, el cliente recibe el 200
    mínimo (sin data.documento) y no un 500."""
    import app.api.v1.confirmacion_publica as cp
    _sin_correo(monkeypatch)
    _empresa(app_client, admin_token)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)

    def falla(*args, **kwargs):
        raise RuntimeError("dato viejo malformado")

    monkeypatch.setattr(cp, "documento_sc", falla)
    with registro_capturado("app.api.v1.confirmacion_publica") as errores:
        resp = _confirmar(app_client, raw)
    assert resp.status_code == 200, resp.text
    assert [e.levelname for e in errores] == ["ERROR"] and sc.numero in errores[0].getMessage()
    j = resp.json()
    assert set(j) == CLAVES_200_MINIMO
    assert j["estado_enlace"] == "confirmada" and j["confirmada_el"].endswith("Z")
    assert j["empresa"]["nombre_comercial"] == EMPRESA
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None
    assert _fila(db, raw)["resultado"] == "CONFIRMADO"


def test_ultimo_dia_del_enlace_en_colombia():
    """r1 (C5): el día de «venció el …»: el último en que sirvió, en hora de Colombia."""
    from app.core.documento_cliente import _ultimo_dia_del_enlace
    from app.core.fechas import vence_al_final_del_dia
    assert _ultimo_dia_del_enlace(vence_al_final_del_dia(datetime.date(2026, 10, 8))) == "8 de octubre de 2026"
    # 03:00 UTC del 9 = 22:00 del 8 en Colombia (el enlace de 2 días de una SC).
    assert _ultimo_dia_del_enlace(datetime.datetime(2026, 10, 9, 3, 0)) == "8 de octubre de 2026"
    assert _ultimo_dia_del_enlace(datetime.datetime(2026, 10, 9, 15, 0)) == "9 de octubre de 2026"


def test_cot_pendiente_sigue_respondiendo_igual(app_client, db, admin_token):
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.erp_documents import SalesQuotation
    _empresa(app_client, admin_token)
    cot = SalesQuotation(numero=f"COT-T5P{_sufijo()}", customer_name="Ana Pérez", estado="PENDIENTE_CONFIRMACION",
                         total_cop=1000, subtotal_cop=1000,
                         productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)
    raw = create_confirmation_token(db, "COT", cot.id)
    resp = _ver(app_client, raw)
    assert resp.status_code == 200, resp.text
    j = resp.json()
    assert set(j) == CLAVES_200_VER and set(j["data"]) == CLAVES_DATA_COT  # r1 (C6)
    assert j["estado_enlace"] == "pendiente" and j["vence_at"].endswith("Z")
    assert j["empresa"]["nombre_comercial"] == EMPRESA  # C26
    data = j["data"]
    assert (data["numero"], data["estado"], data["total_cop"]) == (cot.numero, "PENDIENTE_CONFIRMACION", 1000)
    assert data["productos"] == [{"product_name": "X", "qty": 1, "unit_price_cop": 1000}]
    assert data["documento"]["tipo"] == "COT" and data["documento"]["totales"]["total"] == 1000


# ─── 14 (R3) y regla g ──────────────────────────────────────────────────────────────────────────────────────

def test_nota_para_el_cliente_sale_y_las_notas_no(app_client, db, admin_token, user_admin, monkeypatch):
    from app.models.erp_documents import ActivityLog
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin, notas="Entrega en obra", nota_cliente="  Llevar la escalera de 3 metros  ")
    raw = _enviar(app_client, admin_token, sc)
    resp = _ver(app_client, raw)
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["documento"]["notas"] == [
        {"titulo": "Nota para el cliente", "texto": "Llevar la escalera de 3 metros"}]
    assert "Entrega en obra" not in resp.text

    # Editarla no anula el enlace (el cliente confirma productos, no la nota), queda en la Actividad y _sc_dict la trae.
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}",
                            json={"nota_cliente": "Llamar al llegar", "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["nota_cliente"] == "Llamar al llegar" and data["estado"] == "PENDIENTE_CONFIRMACION"
    assert _fila(db, raw)["used_at"] is None
    resp = _ver(app_client, raw)
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["documento"]["notas"] == [{"titulo": "Nota para el cliente", "texto": "Llamar al llegar"}]
    db.expire_all()
    renglones = (db.query(ActivityLog)
                 .filter(ActivityLog.entity_type == "SC", ActivityLog.entity_id == sc.id, ActivityLog.action == "UPDATED")
                 .all())
    etiquetas = [c.get("etiqueta") for r in renglones for c in (r.extra_data or {}).get("cambios", [])]
    assert "Nota para el cliente" in etiquetas, etiquetas


def test_enlace_con_cambios_enviados(app_client, db, admin_token, user_admin, monkeypatch):
    """Regla g: el enlace con el que el cliente pidió cambios (resultado CAMBIOS, lo escribe T6) dice
    'cambios_enviados', con el comentario mientras la marca cambios_cliente_at siga puesta."""
    from app.core.confirmation_tokens import marcar_resultado, reclamar_token
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    info = reclamar_token(db, raw)  # marcar_resultado solo escribe sobre un enlace ya reclamado
    assert marcar_resultado(db, info["id"], "CAMBIOS") is True
    sc.estado = "ASIGNADA"
    sc.cambios_cliente_at = _ahora()
    sc.cambios_cliente_tipo = "CAMBIOS"
    sc.cambios_cliente_comentario = "Son 8 rodillos, no 6"
    db.commit()

    for resp in (_ver(app_client, raw), _confirmar(app_client, raw)):
        d = _detalle(resp, "cambios_enviados")
        assert d["comentario"] == "Son 8 rodillos, no 6"
        assert d["documento"] is None
        assert d["mensaje"].endswith(f"{ASESORA} ajustará la solicitud y te enviará un enlace nuevo."), d["mensaje"]
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"  # confirmar con ese enlace no hizo nada

    sc.cambios_cliente_at = None  # el asesor ya respondió (T6 la limpia al reenviar)
    db.commit()
    assert _detalle(_ver(app_client, raw), "cambios_enviados")["comentario"] is None


def test_ya_no_la_necesita_al_reabrir_no_promete_una_solicitud_ajustada(app_client, db, admin_token, user_admin,
                                                                         monkeypatch):
    """B3 T15 r1 (menor 5, regla g): si con ESTE enlace el cliente dijo «Ya no la necesito», al volver a abrirlo no se le
    promete una solicitud ajustada ni un enlace nuevo: MENSAJES_ENLACE['no_la_necesita'], con la fecha y el asesor. El
    mensaje de «Quiero cambiar algo» no cambia (test_enlace_con_cambios_enviados)."""
    from app.core.confirmation_tokens import marcar_resultado, reclamar_token
    from app.core.documento_cliente import MENSAJES_ENLACE
    from app.core.fechas import fecha_larga
    from app.api.v1.confirmacion_publica import TIPO_NO_LA_NECESITA
    from app.core import documento_cliente
    # T15 r2: el texto nombra la solicitud (la página saca de ahí el tipo: pestaña y encabezado «Solicitud»), y el tipo
    # vive en un solo lugar (core) que confirmacion_publica reexporta.
    assert MENSAJES_ENLACE["no_la_necesita"] == ("Ya nos enviaste tu respuesta sobre esta solicitud el {fecha}. {asesor} "
                                                 "se pondrá en contacto contigo.")
    assert TIPO_NO_LA_NECESITA is documento_cliente.TIPO_NO_LA_NECESITA == "NO_LA_NECESITA"
    assert MENSAJES_ENLACE["cambios_enviados"].startswith("Ya nos enviaste tus cambios el {fecha}.")
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    info = reclamar_token(db, raw)
    assert marcar_resultado(db, info["id"], "CAMBIOS") is True
    sc.estado = "ASIGNADA"
    sc.cambios_cliente_at = _ahora()
    sc.cambios_cliente_tipo = "NO_LA_NECESITA"
    sc.cambios_cliente_comentario = None
    db.commit()

    usado = _fila(db, raw)["used_at"]
    for resp in (_ver(app_client, raw), _confirmar(app_client, raw)):
        d = _detalle(resp, "cambios_enviados")
        assert d["mensaje"] == (f"Ya nos enviaste tu respuesta sobre esta solicitud el {fecha_larga(usado)}. {ASESORA} "
                                "se pondrá en contacto contigo.")
        assert "ajustará" not in d["mensaje"] and "enlace nuevo" not in d["mensaje"]
        assert d["comentario"] is None and d["documento"] is None
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"

    # Si la marca ya no es de este enlace (el asesor respondió), vuelve el texto de siempre.
    sc.cambios_cliente_at = None
    db.commit()
    assert "ajustará la solicitud" in _detalle(_ver(app_client, raw), "cambios_enviados")["mensaje"]


# ─── Funciones puras ────────────────────────────────────────────────────────────────────────────────────────

def test_etiqueta_modalidad_es_el_espejo_de_etiquetaModalidad():
    """RP5: mismos textos que etiquetaModalidad (frontend/src/lib/etiquetas-ventas.js). La paridad corriendo los dos
    lados es de T13 (test_paridad_bloque3); aquí, los casos que documenta el frontend."""
    from app.core.documento_cliente import ETIQUETA_60_40, etiqueta_modalidad
    assert ETIQUETA_60_40 == "60/40 (60% de anticipo y 40% al entregar)"
    casos = [
        (None, ""),
        ("Credito 30 dias", "Crédito 30 días"),
        ("Credito 30 Dias", "Crédito 30 días"),
        ("Credito 30d", "Crédito 30 días"),
        ("cr. 90 dias", "Crédito 90 días"),
        ("cred 45", "Crédito 45 días"),
        ("CRÉDITO", "Crédito"),
        ("﻿Credito 60 dias", "Crédito 60 días"),
        (MOD_60_40, ETIQUETA_60_40),
        ("Contado", "Contado"),
        (" contado ", "Contado"),
        ("otro", "Otro"),
        ("Credito 2 cuotas", "Crédito 2 cuotas"),
        ("Pago a credito", "Pago a crédito"),
        ("CREDITO 2 CUOTAS", "CRÉDITO 2 CUOTAS"),
        ("Cruce de cuentas", "Cruce de cuentas"),
        ("acreditodias", "acreditodias"),
    ]
    for valor, esperado in casos:
        assert etiqueta_modalidad(valor) == esperado, (valor, etiqueta_modalidad(valor))


def test_forma_de_pago_y_siguiente_paso(db):
    from types import SimpleNamespace
    from app.core.documento_cliente import forma_de_pago, siguiente_paso_sc
    casos = [("Contado", 100), (MOD_60_40, 60), ("Credito 30 dias", 0), ("Otro", 60), (None, 60), ("", 60)]
    for modalidad, pct in casos:
        forma = forma_de_pago(modalidad)
        assert forma["anticipo_pct"] == pct and isinstance(forma["anticipo_pct"], int), (modalidad, forma)
        assert forma["modalidad"] == modalidad
    assert forma_de_pago("Credito 30 dias")["etiqueta"] == "Crédito 30 días"

    # T20 (C0): siguiente_paso_sc recibe db para limpiar el nombre con nombre_asesor_publico (la regla única).
    con_asesor = siguiente_paso_sc(db, SimpleNamespace(advisor_name=" Laura G. "), forma_de_pago(MOD_60_40))
    assert con_asesor[0].startswith("Laura G. ") and "cotización" in con_asesor[0]
    assert con_asesor[2].endswith("con el anticipo del 60%.")
    sin_asesor = siguiente_paso_sc(db, SimpleNamespace(advisor_name=None), forma_de_pago("Credito 30 dias"))
    assert sin_asesor[0].startswith("Tu asesor ")
    assert sin_asesor[2] == "Cuando la apruebes, hacemos tu pedido."
    correo = siguiente_paso_sc(db, SimpleNamespace(advisor_name="laura@empresa.com"), forma_de_pago(MOD_60_40))
    assert correo[0] == "Tu asesor prepara tu cotización con los precios."


# ─── T20, Paso 1 (revisión de seguridad) ────────────────────────────────────────────────────────────────────

def _usuario_de_entrada(db, user_vendedor):
    """T20 (C0): un usuario del ERP con su nombre de usuario (auth.py acepta el correo o el username para entrar)."""
    user_vendedor.username = f"laura_{_sufijo().lower()}"
    db.commit()
    return user_vendedor


def _pedir_cambios(app_client, raw, comentario="Son 8 rodillos, no 6"):
    return app_client.post("/api/v1/confirmar/pedir-cambios", json={"token": raw, "comentario": comentario},
                           headers={"Idempotency-Key": f"t20-{uuid.uuid4().hex[:8]}"})


def test_el_cliente_nunca_ve_el_correo_ni_el_usuario_del_asesor(app_client, db, admin_token, user_admin,
                                                                 user_vendedor, monkeypatch):
    """T20 (C0, R24): advisor_name guarda el correo del asesor (los formularios mandan yo.email) o su usuario de entrada.
    Ninguno de los dos sale en lo que ve el cliente: atendido_por None y «Tu asesor» en ¿Qué sigue?, en pedir cambios y
    en 'cambios_enviados'. Un nombre que no es de ningún usuario ('Laura Gómez') sí sale."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.erp_documents import SalesQuotation
    _sin_correo(monkeypatch)
    usuario = _usuario_de_entrada(db, user_vendedor)
    for asesor in ("laura@empresa.com", usuario.username, f"  {usuario.username.upper()} ", f" {usuario.email} "):
        secreto = asesor.strip().casefold()

        def sin_secreto(resp):
            assert secreto not in resp.text.casefold(), (asesor, resp.text)
            return resp

        sc = _sc(db, user_admin, advisor_name=asesor)
        raw = _enviar(app_client, admin_token, sc)
        resp = sin_secreto(_ver(app_client, raw))
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["documento"]["atendido_por"] is None
        resp = sin_secreto(_confirmar(app_client, raw))
        assert resp.status_code == 200, resp.text
        assert resp.json()["siguiente_paso"][0] == "Tu asesor prepara tu cotización con los precios."
        assert resp.json()["data"]["documento"]["atendido_por"] is None
        for resp in (_ver(app_client, raw), _confirmar(app_client, raw)):
            d = _detalle(sin_secreto(resp), "confirmada")
            assert d["siguiente_paso"][0] == "Tu asesor prepara tu cotización con los precios."
            assert d["documento"]["atendido_por"] is None

        # La COT de esa SC (atendido_por sale de la SC).
        cot = SalesQuotation(numero=f"COT-T20{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_name="Ana Pérez",
                             estado="PENDIENTE_CONFIRMACION", total_cop=1000, subtotal_cop=1000,
                             productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
        db.add(cot); db.commit(); db.refresh(cot)
        resp = sin_secreto(_ver(app_client, create_confirmation_token(db, "COT", cot.id)))
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["documento"]["atendido_por"] is None

        # Pedir cambios: el detalle del 200 y, al reabrir el enlace, 'cambios_enviados'.
        otra = _sc(db, user_admin, advisor_name=asesor)
        raw = _enviar(app_client, admin_token, otra)
        resp = sin_secreto(_pedir_cambios(app_client, raw))
        assert resp.status_code == 200, resp.text
        assert resp.json()["detalle"] == "Tu asesor ajustará tu solicitud y te enviará un enlace nuevo."
        d = _detalle(sin_secreto(_ver(app_client, raw)), "cambios_enviados")
        assert d["mensaje"].endswith("Tu asesor ajustará la solicitud y te enviará un enlace nuevo."), d["mensaje"]

    # Un nombre que no es el correo ni el usuario de nadie sigue saliendo.
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    assert _ver(app_client, raw).json()["data"]["documento"]["atendido_por"] == ASESORA
    assert _confirmar(app_client, raw).json()["siguiente_paso"][0] == f"{ASESORA} prepara tu cotización con los precios."
    otra = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, otra)
    detalle = _pedir_cambios(app_client, raw).json()["detalle"]
    assert detalle == f"{ASESORA} ajustará tu solicitud y te enviará un enlace nuevo."


def test_nombre_asesor_publico(db, user_vendedor):
    """T20 (C0): la regla única. None si no es texto, si queda vacío, si lleva '@' o si es (sin mayúsculas ni espacios en
    los bordes) el correo o el usuario de algún User; si no, el texto sin los espacios de los bordes."""
    from app.core.documento_cliente import nombre_asesor_publico
    usuario = _usuario_de_entrada(db, user_vendedor)
    for valor in (None, 5, "", "   ", "laura@empresa.com", "laura@", usuario.username, f" {usuario.username.upper()} ",
                  usuario.email.upper()):
        assert nombre_asesor_publico(db, valor) is None, valor
    assert nombre_asesor_publico(db, "  Laura Gómez ") == "Laura Gómez"
    assert nombre_asesor_publico(db, "Laura G.") == "Laura G."  # con espacio y punto: nunca es un username


def test_el_enlace_del_cliente_anterior_no_dice_reemplazado(app_client, db, admin_token, user_admin, monkeypatch):
    """T20 (M2): L1 se envía a Ana; el asesor cambia la ficha a Beto (L1 queda REVOCADO) y le envía la SC a él (L2). Ana
    abre L1: 'no_disponible', sin «más reciente» (no se le dice que le enviamos otro enlace ni que la SC sigue activa) y
    sin datos de Beto. L2 sigue sirviendo."""
    _sin_correo(monkeypatch)
    ficha_a = _ficha(db, "Ana", "Pérez", "Calle Alfa 1")
    ficha_b = _ficha(db, "Cliente Beta", "Secreto", DIRECCION_B)
    sc = _sc(db, user_admin, customer_id=ficha_a.id, customer_address="Calle Alfa 1")
    l1 = _enviar(app_client, admin_token, sc)
    _cambiar_cliente(app_client, admin_token, sc, ficha_b)
    assert _fila(db, l1)["resultado"] == "REVOCADO"
    l2 = _enviar(app_client, admin_token, sc)
    for resp in (_ver(app_client, l1), _confirmar(app_client, l1), _pedir_cambios(app_client, l1)):
        d = _detalle(resp, "no_disponible")
        assert "más reciente" not in d["mensaje"] and d["documento"] is None and d["siguiente_paso"] is None
        assert NOMBRE_B not in resp.text and DIRECCION_B not in resp.text
    assert _ver(app_client, l2).status_code == 200
    assert _fila(db, l1)["resultado"] == "REVOCADO"  # ni confirmar ni pedir cambios lo tocaron


def test_cambio_de_solo_el_nombre_revoca_el_enlace_de_la_cot_temprana(app_client, db, admin_token, user_admin,
                                                                      monkeypatch, contador_sql):
    """T20 (M12, punto 2 de lo parqueado): cambiar solo el nombre de la SC también revoca el enlace de una COT temprana
    (cambia_la_identidad -> _anular_enlaces_de_cotizaciones_por_cambio_de_cliente), en el mismo y único commit, con su
    renglón _ENLACE_COT_ANULADO. Si un refactor vuelve a usar cambia_el_cliente (sin el nombre), esta prueba cae."""
    from app.api.v1.erp_ventas import _ENLACE_COT_ANULADO
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.erp_documents import ActivityLog, SalesQuotation
    _sin_correo(monkeypatch)
    ficha_a = _ficha(db, "Ana", "Pérez", "Calle Alfa 1")
    sc = _sc(db, user_admin, customer_id=ficha_a.id, customer_address="Calle Alfa 1")
    temprana = SalesQuotation(numero=f"COT-T20{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_id=ficha_a.id,
                              customer_name="Ana Pérez", estado="PENDIENTE_CONFIRMACION", total_cop=1000,
                              subtotal_cop=1000, productos=[{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 1000}])
    db.add(temprana); db.commit(); db.refresh(temprana)
    enlace_temprana = create_confirmation_token(db, "COT", temprana.id)
    otra_sc = _sc(db, user_admin, estado="CONFIRMADA", customer_id=ficha_a.id)
    confirmada = SalesQuotation(numero=f"COT-T20{_sufijo()}", sc_id=otra_sc.id, sc_numero=otra_sc.numero,
                                customer_id=ficha_a.id, customer_name="Ana Pérez", estado="CONFIRMADA", total_cop=1000,
                                productos=[{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 1000}])
    db.add(confirmada); db.commit(); db.refresh(confirmada)
    enlace_confirmada = create_confirmation_token(db, "COT", confirmada.id)

    with contador_sql.ventana() as v:
        resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"customer_name": NOMBRE_B,
                                                                           "updated_by": "t"},
                                headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert v.commits == 1, v.commits
    assert _fila(db, enlace_temprana)["resultado"] == "REVOCADO"
    db.expire_all()
    renglones = [r for r in db.query(ActivityLog).filter(ActivityLog.entity_type == "COT",
                                                          ActivityLog.entity_id == temprana.id)
                 if _ENLACE_COT_ANULADO in ((r.extra_data or {}).get("cambios") or [])]
    assert len(renglones) == 1 and sc.numero in renglones[0].description, [r.description for r in renglones]
    assert db.get(SalesQuotation, temprana.id).estado == "PENDIENTE_CONFIRMACION"
    resp = _ver(app_client, enlace_temprana)
    assert resp.status_code == 400, resp.text
    assert NOMBRE_B not in resp.text
    assert _fila(db, enlace_confirmada)["used_at"] is None


def test_cambiar_a_una_ficha_sin_nombre_no_conserva_el_nombre_anterior(app_client, db, admin_token, user_admin):
    """T20 (M13, punto 3 de lo parqueado): una ficha nueva sin nombre no deja en la SC el nombre del cliente ANTERIOR
    (clientes.nombre_cliente, la regla única: 'CLI-0012'). Así una COT sin ficha de Ana ya no pasa por «la misma
    persona» y la corrección de contacto no le copia el correo del cliente nuevo."""
    from app.models.customers import Customer
    from app.models.erp_documents import SalesQuotation
    ficha_a = _ficha(db, "Ana", "Pérez", "Calle Alfa 1")
    ficha_b = Customer(first_name="", last_name="", address=DIRECCION_B, phone="3005550001",
                       email=f"t20m13-{uuid.uuid4().hex[:8]}@test.nebulae")
    db.add(ficha_b); db.commit(); db.refresh(ficha_b)
    sc = _sc(db, user_admin, customer_id=ficha_a.id, customer_address="Calle Alfa 1")
    cot = SalesQuotation(numero=f"COT-T20{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_name="Ana Pérez",
                         customer_email="ana@cliente.com", estado="BORRADOR",
                         productos=[{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"customer_id": ficha_b.id, "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["customer_name"] == f"CLI-{ficha_b.id:04d}"
    nuevo = f"nuevo-{_sufijo().lower()}@cliente.com"
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}/cliente", json={"customer_email": nuevo},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert cot.numero in resp.json()["documentos_de_otro_cliente"], resp.json()
    db.expire_all()
    assert db.get(SalesQuotation, cot.id).customer_email == "ana@cliente.com"


def test_corregir_tildes_mayusculas_o_espacios_del_nombre_no_revoca_enlaces(app_client, db, admin_token, user_admin,
                                                                           monkeypatch):
    """T20 (M14, punto 4 de lo parqueado): una sola regla de nombre. _identidad_del_cliente compara el nombre con
    _nombre_para_comparar (sin tildes, mayúsculas ni espacios de más), la misma de _mismo_nombre: corregir 'Ana Perez'
    a ' ana  PÉREZ ' no es un cambio de cliente. L1 de la SC y el enlace de su COT temprana siguen vivos y no queda el
    marcador CLIENTE_CAMBIADO."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.erp_documents import ActivityLog, SalesQuotation
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    sc.customer_name = "Ana Perez"
    db.commit()
    l1 = _enviar(app_client, admin_token, sc)
    temprana = SalesQuotation(numero=f"COT-T20{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_name="Ana Perez",
                              estado="PENDIENTE_CONFIRMACION", total_cop=1000, subtotal_cop=1000,
                              productos=[{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 1000}])
    db.add(temprana); db.commit(); db.refresh(temprana)
    enlace_temprana = create_confirmation_token(db, "COT", temprana.id)

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"customer_name": " ana  PÉREZ ",
                                                                       "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "PENDIENTE_CONFIRMACION"
    assert _fila(db, l1)["used_at"] is None and _fila(db, enlace_temprana)["used_at"] is None
    assert _ver(app_client, l1).status_code == 200
    db.expire_all()
    acciones = [r.action for r in db.query(ActivityLog).filter(ActivityLog.entity_type == "SC",
                                                                 ActivityLog.entity_id == sc.id)]
    assert "CLIENTE_CAMBIADO" not in acciones, acciones
    # Un nombre de verdad distinto sí revoca (la regla de r4 sigue).
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"customer_name": NOMBRE_B, "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert _fila(db, l1)["resultado"] == "REVOCADO" and _fila(db, enlace_temprana)["resultado"] == "REVOCADO"
