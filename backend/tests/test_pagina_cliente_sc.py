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
    sc = CustomerRequest(numero=f"SC-T5P{_sufijo()}", customer_name="Ana Pérez", advisor_user_id=user_admin.id,
                         advisor_name=ASESORA, **campos)
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
    corrección, que no se traga los errores): extra_data.cliente_cambiado. El enlace confirmado antes ya no muestra el
    resumen (efecto conservador de la r1)."""
    from app.models.erp_documents import ActivityLog
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    assert _confirmar(app_client, raw).status_code == 200
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}/cliente", json={"customer_address": "Calle Nueva 5"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.expire_all()
    [renglon] = (db.query(ActivityLog).filter(ActivityLog.entity_type == "SC", ActivityLog.entity_id == sc.id,
                                              ActivityLog.action == "UPDATED").all())
    assert renglon.extra_data["cliente_cambiado"] is True
    assert _detalle(_ver(app_client, raw), "confirmada")["documento"] == {"numero": sc.numero}


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
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"  # confirmar con ese enlace no hizo nada

    sc.cambios_cliente_at = None  # el asesor ya respondió (T6 la limpia al reenviar)
    db.commit()
    assert _detalle(_ver(app_client, raw), "cambios_enviados")["comentario"] is None


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


def test_forma_de_pago_y_siguiente_paso():
    from types import SimpleNamespace
    from app.core.documento_cliente import forma_de_pago, siguiente_paso_sc
    casos = [("Contado", 100), (MOD_60_40, 60), ("Credito 30 dias", 0), ("Otro", 60), (None, 60), ("", 60)]
    for modalidad, pct in casos:
        forma = forma_de_pago(modalidad)
        assert forma["anticipo_pct"] == pct and isinstance(forma["anticipo_pct"], int), (modalidad, forma)
        assert forma["modalidad"] == modalidad
    assert forma_de_pago("Credito 30 dias")["etiqueta"] == "Crédito 30 días"

    con_asesor = siguiente_paso_sc(SimpleNamespace(advisor_name=" Laura "), forma_de_pago(MOD_60_40))
    assert con_asesor[0].startswith("Laura ") and "cotización" in con_asesor[0]
    assert con_asesor[2].endswith("con el anticipo del 60%.")
    sin_asesor = siguiente_paso_sc(SimpleNamespace(advisor_name=None), forma_de_pago("Credito 30 dias"))
    assert sin_asesor[0].startswith("Tu asesor ")
    assert sin_asesor[2] == "Cuando la apruebes, hacemos tu pedido."
