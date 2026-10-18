"""Bloque 3, Tarea 6 — H28-cambios (con C9, C17, C20, C22 y RP16): el cliente pide cambios en la SOLICITUD desde su
enlace.

- POST /confirmar/pedir-cambios {token, tipo='CAMBIOS'|'NO_LA_NECESITA', comentario} con Idempotency-Key (como
  confirmar). El cuerpo se valida a mano (R12/C8): 422 en español ANTES de tocar el enlace (10 a 1000 caracteres con
  CAMBIOS; NO_LA_NECESITA admite vacío). Después consultar_token: si el enlace no está pendiente, 400 con el detail de
  _detalle_enlace (C10, C26) sin gastarlo. Luego reclamar_token (atómico) y la rama por tipo con el documento bloqueado.
- Rama SC: vuelve a Asignada (Nueva sin asesor), sin la confirmación del cliente (gate1 None), con
  cambios_cliente_at/_tipo/_comentario; revoca sus otros enlaces, marca el usado con resultado CAMBIOS y deja el renglón
  CAMBIOS_CLIENTE ('Cliente (por el enlace)'), todo en UN commit. Después avisa al asesor (correo + renglón
  AVISO_ASESOR); si el aviso falla, el cliente igual recibe 200.
- C20: una COT temprana en PENDIENTE_CONFIRMACION vuelve a Borrador con gate2 None y sus enlaces revocados, con el
  renglón SC_CAMBIOS_CLIENTE, en el MISMO commit; una COT en Borrador solo recibe el renglón.
- Reenviar la SC limpia la marca en el mismo y único commit del envío, que lee la SC con FOR UPDATE (RP16).
- _sc_dict trae cambios_cliente; alertas_resumen.cambios_cliente cuenta aparte de 'atrasados' (C22) y el asesor ve las
  suyas.
- Un enlace PVEN no se gasta aquí (C11): responde como un token de otro tipo.

Nunca correo real: app.core.email.send_email se reemplaza por un falso que acepta **kwargs.
Los símbolos nuevos de T6 se importan DENTRO de cada prueba (el runner importa el módulo fuera de un try).
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_pedir_cambios_sc
"""
import datetime
import hashlib
import json
import uuid

from sqlalchemy import text

RODILLOS = [{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 5000, "sku_id": 9}]
EMPRESA = "Pinturas del Valle"
ASESORA = "Laura Gómez"
COMENTARIO = "Son 8 rodillos, no 6"
CLIENTE_ENLACE = "Cliente (por el enlace)"
CLAVES_DETALLE = {"mensaje", "estado_enlace", "empresa", "documento", "confirmada_el", "siguiente_paso", "comentario"}
CLAVES_200 = {"status", "estado_enlace", "mensaje", "detalle", "comentario", "empresa", "data"}
TEXTO_C20 = "El cliente pidió cambios en la solicitud: ajusta y reenvía la cotización"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _ahora():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


def _correo_falso(monkeypatch, configurado=False, al_enviar=None):
    """send_email y smtp_configurado falsos (RP12: el falso acepta **kwargs). Devuelve la lista de llamadas."""
    import app.core.email as correo
    llamadas = []

    def enviar(*a, **k):
        llamadas.append((a, k))
        if al_enviar is not None:
            al_enviar()
        return True

    monkeypatch.setattr(correo, "send_email", enviar)
    monkeypatch.setattr(correo, "smtp_configurado", lambda: configurado)
    return llamadas


def _empresa(app_client, admin_token):
    resp = app_client.put("/api/v1/empresa", json={"nombre_comercial": EMPRESA}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


def _sc(db, asesor, **campos):
    """Una SC ASIGNADA (con asesor y productos), lista para enviar al cliente. Sin correo del cliente: el único correo
    de las pruebas es el del aviso al asesor."""
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    campos.setdefault("productos", RODILLOS)
    sc = CustomerRequest(numero=f"SC-T6P{_sufijo()}", customer_name="Ana Pérez", advisor_user_id=asesor.id,
                         advisor_name=ASESORA, **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _enviar(app_client, admin_token, sc):
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    return resp.json()["link_confirmacion"].rsplit("/", 1)[-1]


def _pedir(app_client, raw, comentario=COMENTARIO, tipo=None):
    cuerpo = {"token": raw, "comentario": comentario}
    if tipo is not None:
        cuerpo["tipo"] = tipo
    return app_client.post("/api/v1/confirmar/pedir-cambios", json=cuerpo,
                           headers={"Idempotency-Key": f"t6-{uuid.uuid4().hex[:8]}"})


def _ver(app_client, raw):
    return app_client.post("/api/v1/confirmar/ver", json={"token": raw})


def _confirmar(app_client, raw):
    return app_client.post("/api/v1/confirmar/confirmar", json={"token": raw},
                           headers={"Idempotency-Key": f"t6c-{uuid.uuid4().hex[:8]}"})


def _detalle(resp, estado):
    assert resp.status_code == 400, resp.text
    detalle = resp.json()["detail"]
    assert isinstance(detalle, dict), detalle
    assert detalle["estado_enlace"] == estado, detalle
    assert set(detalle) == CLAVES_DETALLE, detalle
    assert isinstance(detalle["empresa"], dict) and "nombre_comercial" in detalle["empresa"], detalle  # C26
    return detalle


def _hash(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def _fila(db, raw):
    return db.execute(text("SELECT used_at, resultado FROM document_confirmation_tokens WHERE token_hash = :h"),
                      {"h": _hash(raw)}).mappings().first()


def _logs(db, entidad, entity_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entity_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def _alertas(app_client, token):
    resp = app_client.get("/api/v1/ventas/alertas/resumen", headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _cot_temprana(db, sc, estado, **campos):
    """Una COT creada antes de la confirmación de la SC (U11)."""
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero=f"COT-T6P{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_name="Ana Pérez",
                         estado=estado, total_cop=30000, subtotal_cop=30000,
                         productos=[{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 5000, "total_cop": 30000}],
                         sin_confirmacion_sc_at=_ahora(), sin_confirmacion_sc_motivo="Cliente pidió precio urgente",
                         **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


# ─── 1 a 3: pedir cambios y lo que pasa con el enlace ────────────────────────────────────────────────────────

def test_pedir_cambios_devuelve_la_sc_al_asesor_con_el_comentario(app_client, db, admin_token, user_admin,
                                                                   monkeypatch, contador_sql):
    _correo_falso(monkeypatch)
    _empresa(app_client, admin_token)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)

    with contador_sql.ventana() as v:
        resp = _pedir(app_client, raw)
    assert resp.status_code == 200, resp.text
    # Reclamar el enlace (su propio commit), el cambio de la SC (UN commit) y el renglón del aviso al asesor.
    assert v.commits == 3, v.commits
    j = resp.json()
    assert set(j) == CLAVES_200, j
    assert (j["status"], j["estado_enlace"], j["mensaje"]) == ("success", "cambios_enviados",
                                                              "¡Listo! Recibimos tus cambios.")
    assert j["detalle"] == f"{ASESORA} ajustará tu solicitud y te enviará un enlace nuevo."
    assert j["comentario"] == COMENTARIO
    assert j["empresa"]["nombre_comercial"] == EMPRESA
    assert j["data"]["numero"] == sc.numero and j["data"]["documento"]["tipo"] == "SC"

    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.gate1_confirmed_at is None
    assert sc.cambios_cliente_at is not None and abs((sc.cambios_cliente_at - _ahora()).total_seconds()) < 60
    assert (sc.cambios_cliente_tipo, sc.cambios_cliente_comentario) == ("CAMBIOS", COMENTARIO)
    fila = _fila(db, raw)
    assert fila["used_at"] is not None and fila["resultado"] == "CAMBIOS"

    [renglon] = _logs(db, "SC", sc.id, "CAMBIOS_CLIENTE")
    assert (renglon.old_estado, renglon.new_estado) == ("PENDIENTE_CONFIRMACION", "ASIGNADA")
    assert renglon.user_name == CLIENTE_ENLACE
    assert COMENTARIO in renglon.description and "Asignada" in renglon.description
    extra = renglon.extra_data
    assert (extra["tipo"], extra["comentario"]) == ("CAMBIOS", COMENTARIO)
    assert [c["etiqueta"] for c in extra["cambios"]] == ["Comentario del cliente", "Estado de la solicitud"]
    assert [c["despues"] for c in extra["cambios"]] == [COMENTARIO, "Asignada"]
    assert all("campo" not in c for c in extra["cambios"])  # formato de C1/H27: sin 'antes' que tachar


def test_el_enlace_usado_para_pedir_cambios_ya_no_confirma(app_client, db, admin_token, user_admin, monkeypatch):
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    assert _pedir(app_client, raw).status_code == 200

    for resp in (_confirmar(app_client, raw), _ver(app_client, raw), _pedir(app_client, raw)):
        d = _detalle(resp, "cambios_enviados")  # regla g (T5)
        assert d["comentario"] == COMENTARIO
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.gate1_confirmed_at is None
    assert len(_logs(db, "SC", sc.id, "CAMBIOS_CLIENTE")) == 1  # el doble clic no repite nada


def test_si_ya_confirmo_no_puede_pedir_cambios(app_client, db, admin_token, user_admin, monkeypatch):
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    assert _confirmar(app_client, raw).status_code == 200

    _detalle(_pedir(app_client, raw), "confirmada")
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None
    assert sc.cambios_cliente_at is None
    assert _fila(db, raw)["resultado"] == "CONFIRMADO"
    assert _logs(db, "SC", sc.id, "CAMBIOS_CLIENTE") == []


# ─── 4 y 5: validación a mano (R12) antes de tocar el enlace ───────────────────────────────────────────────

def test_comentario_corto_es_422_y_no_gasta_el_enlace(app_client, db, admin_token, user_admin, monkeypatch):
    from app.api.v1.confirmacion_publica import MAX_COMENTARIO_CAMBIOS, MIN_COMENTARIO_CAMBIOS
    assert (MIN_COMENTARIO_CAMBIOS, MAX_COMENTARIO_CAMBIOS) == (10, 1000)  # RP21: los importa la paridad de T13
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)

    casos = [("no", None), ("   123456789   ", None), ("x" * 1001, None), (COMENTARIO, "OTRO"), (COMENTARIO, "cambios"),
             ("x" * 1001, "NO_LA_NECESITA")]
    for comentario, tipo in casos:
        resp = _pedir(app_client, raw, comentario=comentario, tipo=tipo)
        assert resp.status_code == 422, (comentario[:12], tipo, resp.text)
        assert isinstance(resp.json()["detail"], str) and resp.json()["detail"], resp.text  # español, legible
    assert _pedir(app_client, raw, comentario="no").json()["detail"] == (
        "Cuéntanos qué quieres cambiar (al menos 10 caracteres).")

    assert _fila(db, raw)["used_at"] is None
    assert _ver(app_client, raw).status_code == 200
    db.refresh(sc)
    assert sc.estado == "PENDIENTE_CONFIRMACION" and sc.cambios_cliente_at is None


def test_los_limites_de_10_y_1000_caracteres_se_cuentan_sin_los_bordes(app_client, db, admin_token, user_admin,
                                                                       monkeypatch):
    _correo_falso(monkeypatch)
    for comentario, guardado in (("  1234567890  ", "1234567890"), ("y" * 1000, "y" * 1000)):
        sc = _sc(db, user_admin)
        raw = _enviar(app_client, admin_token, sc)
        resp = _pedir(app_client, raw, comentario=comentario)
        assert resp.status_code == 200, resp.text
        db.refresh(sc)
        assert sc.cambios_cliente_comentario == guardado


def test_ya_no_la_necesita_acepta_comentario_vacio(app_client, db, admin_token, user_admin, monkeypatch):
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)

    resp = _pedir(app_client, raw, comentario="", tipo="NO_LA_NECESITA")
    assert resp.status_code == 200, resp.text
    j = resp.json()
    assert j["estado_enlace"] == "cambios_enviados" and j["mensaje"] == "Recibimos tu respuesta."
    assert j["comentario"] is None
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.gate1_confirmed_at is None
    assert (sc.cambios_cliente_tipo, sc.cambios_cliente_comentario) == ("NO_LA_NECESITA", None)
    [renglon] = _logs(db, "SC", sc.id, "CAMBIOS_CLIENTE")
    assert "ya no necesita" in renglon.description
    assert renglon.extra_data["cambios"][0] == {"etiqueta": "Comentario del cliente", "despues": "—"}
    assert _fila(db, raw)["resultado"] == "CAMBIOS"


def test_el_comentario_pierde_los_caracteres_de_control(app_client, db, admin_token, user_admin, monkeypatch):
    """Un NUL (o un surrogate suelto) haría fallar la escritura DESPUÉS de gastar el enlace: se quitan al validar. El
    salto de línea se conserva."""
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    # El cuerpo va armado a mano (json.dumps con ensure_ascii): el surrogate suelto llega como escape JSON (\ud800).
    cuerpo = json.dumps({"token": raw, "comentario": "Son 8\x00 rodillos\r\nno 6\ud800"})
    resp = app_client.post("/api/v1/confirmar/pedir-cambios", content=cuerpo,
                           headers={"Idempotency-Key": "t6-control", "Content-Type": "application/json"})
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.cambios_cliente_comentario == "Son 8 rodillos\nno 6"


# ─── 6 y 7: enlaces que no sirven para pedir cambios ─────────────────────────────────────────────────────────

def test_sc_cancelada_no_cambia(app_client, db, admin_token, user_admin, monkeypatch):
    from app.core.confirmation_tokens import create_confirmation_token
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    _enviar(app_client, admin_token, sc)
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/cancelar",
                           json={"razon": "El cliente desistió", "user_name": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    raw = create_confirmation_token(db, "SC", sc.id)  # un enlace vivo creado después de cancelar

    _detalle(_pedir(app_client, raw), "no_disponible")
    db.refresh(sc)
    assert sc.estado == "CANCELADA" and sc.cambios_cliente_at is None
    assert _fila(db, raw)["used_at"] is None  # no se gastó


def test_token_pven_no_se_gasta(app_client, db, admin_token, user_admin):
    """C11 (prueba 6 de U23 que T5 dejó para T6): el enlace de consulta del pedido responde como un token de otro tipo
    y no se gasta."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.erp_documents import SaleOrder
    so = SaleOrder(numero=f"PVEN-T6P{_sufijo()}", customer_name="Ana Pérez", estado="PENDIENTE_COMPRA")
    db.add(so); db.commit(); db.refresh(so)
    raw = create_confirmation_token(db, "PVEN", so.id)
    for tipo in (None, "NO_LA_NECESITA"):
        d = _detalle(_pedir(app_client, raw, tipo=tipo), "invalido")
        assert d["documento"] is None
    assert _fila(db, raw)["used_at"] is None
    assert app_client.post("/api/v1/pedido-cliente/ver", json={"token": raw}).status_code == 200


def test_token_vencido_o_inventado_no_cambia_nada(app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    raw = create_confirmation_token(db, "SC", sc.id, expires_at=_ahora() - datetime.timedelta(hours=1))
    _detalle(_pedir(app_client, raw), "vencido")
    _detalle(_pedir(app_client, "x" * 43), "invalido")
    assert _fila(db, raw)["used_at"] is None
    db.refresh(sc)
    assert sc.estado == "PENDIENTE_CONFIRMACION" and sc.cambios_cliente_at is None


def test_sin_idempotency_key_no_toca_el_enlace(app_client, db, admin_token, user_admin, monkeypatch):
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    resp = app_client.post("/api/v1/confirmar/pedir-cambios", json={"token": raw, "comentario": COMENTARIO})
    assert resp.status_code == 400, resp.text  # el handler global de validación (como confirmar)
    assert _fila(db, raw)["used_at"] is None


# ─── 8 y 9: el aviso al asesor (C17) ─────────────────────────────────────────────────────────────────────────

def test_avisa_al_asesor_por_correo_con_el_comentario_escapado(app_client, db, admin_token, user_admin, user_vendedor,
                                                              monkeypatch):
    llamadas = _correo_falso(monkeypatch, configurado=True)
    _empresa(app_client, admin_token)
    sc = _sc(db, user_vendedor)
    raw = _enviar(app_client, admin_token, sc)
    assert llamadas == []  # la SC no tiene correo del cliente: ningún correo hasta ahora

    resp = _pedir(app_client, raw, comentario="<b>8 rodillos</b> por favor")
    assert resp.status_code == 200, resp.text
    [(args, kwargs)] = llamadas
    destino, asunto, html = args
    assert destino == user_vendedor.email
    assert sc.numero in asunto and "Ana Pérez" in asunto and "pidió cambios" in asunto
    assert "&lt;b&gt;8 rodillos&lt;/b&gt; por favor" in html and "<b>8" not in html
    assert f"/dashboard/ventas/solicitud/{sc.id}" in html
    assert kwargs.get("remitente_nombre") == EMPRESA

    [aviso] = _logs(db, "SC", sc.id, "AVISO_ASESOR")
    assert aviso.description == f"Aviso por correo a {user_vendedor.email}: enviado."
    assert aviso.user_name == "Sistema"
    assert aviso.extra_data["correo"]["enviado"] is True


def test_sin_correo_configurado_queda_anotado_y_el_cliente_recibe_200(app_client, db, admin_token, user_admin,
                                                                      monkeypatch):
    llamadas = _correo_falso(monkeypatch, configurado=False)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)

    resp = _pedir(app_client, raw)
    assert resp.status_code == 200, resp.text
    assert llamadas == []
    [aviso] = _logs(db, "SC", sc.id, "AVISO_ASESOR")
    assert aviso.description.startswith("No se pudo avisar por correo al asesor")
    assert "no está configurado" in aviso.description
    assert aviso.extra_data["correo"]["motivo"] == "CORREO_NO_CONFIGURADO"


def test_sin_asesor_vuelve_a_nueva_y_el_aviso_lo_dice(app_client, db, admin_token, user_admin, monkeypatch):
    llamadas = _correo_falso(monkeypatch, configurado=True)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    sc.advisor_user_id = None
    sc.advisor_name = None
    db.commit()

    resp = _pedir(app_client, raw)
    assert resp.status_code == 200, resp.text
    assert resp.json()["detalle"] == "Tu asesor ajustará tu solicitud y te enviará un enlace nuevo."
    db.refresh(sc)
    assert sc.estado == "BORRADOR"  # Nueva: _estado_tras_reinicio
    assert llamadas == []
    [aviso] = _logs(db, "SC", sc.id, "AVISO_ASESOR")
    assert aviso.description == "No se pudo avisar por correo al asesor: la solicitud no tiene asesor asignado."


def test_si_el_aviso_falla_el_cliente_igual_recibe_200(app_client, db, admin_token, user_admin, monkeypatch):
    import app.api.v1.erp_ventas as m
    from _registro_capturado import registro_capturado
    _correo_falso(monkeypatch, configurado=True)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)

    def aviso_que_falla(*a, **k):
        raise RuntimeError("fallo simulado del aviso")

    monkeypatch.setattr(m, "_avisar_asesor_por_correo", aviso_que_falla)
    with registro_capturado("app.api.v1.confirmacion_publica") as registros:
        resp = _pedir(app_client, raw)
    assert resp.status_code == 200, resp.text
    assert any(r.levelname == "ERROR" for r in registros)
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.cambios_cliente_comentario == COMENTARIO
    assert _fila(db, raw)["resultado"] == "CAMBIOS"


# ─── 10, 11 y 13: reenviar, las alertas y el enlace viejo ────────────────────────────────────────────────────

def test_reenviar_borra_la_marca_de_cambios(app_client, db, admin_token, user_admin, monkeypatch):
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    assert _pedir(app_client, raw).status_code == 200

    data = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]
    marca = data["cambios_cliente"]
    assert (marca["tipo"], marca["comentario"]) == ("CAMBIOS", COMENTARIO)
    assert marca["at"].endswith("Z")
    lista = app_client.get("/api/v1/ventas/solicitudes", params={"search": sc.numero}, headers=auth(admin_token))
    assert lista.status_code == 200, lista.text
    [fila] = [s for s in lista.json()["data"] if s["id"] == sc.id]
    assert fila["cambios_cliente"]["comentario"] == COMENTARIO  # la marca en la lista de solicitudes

    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["cambios_cliente"] is None
    db.refresh(sc)
    assert (sc.cambios_cliente_at, sc.cambios_cliente_tipo, sc.cambios_cliente_comentario) == (None, None, None)
    assert sc.estado == "PENDIENTE_CONFIRMACION"
    assert len(_logs(db, "SC", sc.id, "CAMBIOS_CLIENTE")) == 1  # la Actividad conserva el comentario


def test_reenvio_de_la_sc_hace_un_solo_commit_antes_del_correo(app_client, db, admin_token, user_admin, monkeypatch,
                                                              contador_sql):
    """RP16: la SC se lee FOR UPDATE y la revocación, el token, el estado y la limpieza de la marca van en UN commit
    antes del correo (envío nuevo desde Asignada y reenvío desde Pendiente por confirmación)."""
    commits_al_enviar = []
    _correo_falso(monkeypatch, configurado=True, al_enviar=lambda: commits_al_enviar.append(contador_sql.commits))
    sc = _sc(db, user_admin, customer_email="ana@cliente.com")
    raw = _enviar(app_client, admin_token, sc)
    assert _pedir(app_client, raw).status_code == 200

    for _ in range(2):  # 1) desde Asignada con la marca de cambios; 2) reenvío desde Pendiente por confirmación
        commits_al_enviar.clear()
        contador_sql.reset()
        resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "t"},
                               headers=auth(admin_token))
        assert resp.status_code == 200, resp.text
        assert commits_al_enviar == [1], commits_al_enviar
        bloqueos = [s for s in contador_sql.sentencias
                    if "FROM customer_requests" in s and "FOR UPDATE" in s.upper()]
        assert bloqueos, "la SC debe leerse con FOR UPDATE"
        db.refresh(sc)
        assert sc.cambios_cliente_at is None and sc.estado == "PENDIENTE_CONFIRMACION"


def test_alertas_cuentan_los_cambios_del_asesor(app_client, db, admin_token, user_admin, user_vendedor,
                                                vendedor_token, monkeypatch):
    _correo_falso(monkeypatch)
    antes = _alertas(app_client, admin_token)
    sc = _sc(db, user_admin)
    assert _pedir(app_client, _enviar(app_client, admin_token, sc)).status_code == 200

    despues = _alertas(app_client, admin_token)
    assert despues["cambios_cliente"] == antes["cambios_cliente"] + 1 >= 1
    assert despues["atrasados"] == antes["atrasados"]  # C22: cuenta aparte
    assert _alertas(app_client, vendedor_token)["cambios_cliente"] == 0  # el asesor ve solo las suyas

    propia = _sc(db, user_vendedor)
    assert _pedir(app_client, _enviar(app_client, admin_token, propia)).status_code == 200
    assert _alertas(app_client, vendedor_token)["cambios_cliente"] == 1
    assert _alertas(app_client, admin_token)["cambios_cliente"] == antes["cambios_cliente"] + 2

    # Reenviarla limpia la marca: deja de contar.
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{propia.id}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert _alertas(app_client, vendedor_token)["cambios_cliente"] == 0


def test_reabrir_tras_pedir_cambios_y_reenviar_dice_reemplazado(app_client, db, admin_token, user_admin, monkeypatch):
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    viejo = _enviar(app_client, admin_token, sc)
    assert _pedir(app_client, viejo).status_code == 200
    nuevo = _enviar(app_client, admin_token, sc)
    _detalle(_ver(app_client, viejo), "reemplazado")
    _detalle(_pedir(app_client, viejo), "reemplazado")
    assert _ver(app_client, nuevo).status_code == 200


# ─── 12 y C20: la cotización temprana (U11) ──────────────────────────────────────────────────────────────────

def test_cotizacion_temprana_recibe_el_renglon(app_client, db, admin_token, user_admin, monkeypatch):
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    cot = _cot_temprana(db, sc, "BORRADOR")

    assert _pedir(app_client, raw).status_code == 200
    db.refresh(cot)
    assert cot.estado == "BORRADOR"
    [renglon] = _logs(db, "COT", cot.id, "SC_CAMBIOS_CLIENTE")
    assert sc.numero in renglon.description and COMENTARIO in renglon.description
    assert (renglon.old_estado, renglon.new_estado) == (None, None)
    assert renglon.user_name == CLIENTE_ENLACE
    assert renglon.extra_data["comentario"] == COMENTARIO
    assert cot.cambios_cliente_at is None  # la marca es de la SC: la COT no cuenta dos veces en las alertas


def test_cotizacion_temprana_pendiente_vuelve_a_borrador_en_el_mismo_commit(app_client, db, admin_token, user_admin,
                                                                           monkeypatch, contador_sql):
    """C20: el cliente no puede pedir cambios en la SC y después aprobar la COT vieja."""
    from app.core.confirmation_tokens import create_confirmation_token
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    raw = _enviar(app_client, admin_token, sc)
    cot = _cot_temprana(db, sc, "PENDIENTE_CONFIRMACION")
    raw_cot = create_confirmation_token(db, "COT", cot.id)

    with contador_sql.ventana() as v:
        assert _pedir(app_client, raw).status_code == 200
    assert v.commits == 3, v.commits  # reclamar, el cambio de la SC y de la COT juntos, y el aviso
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.gate2_confirmed_at is None
    fila = _fila(db, raw_cot)
    assert fila["used_at"] is not None and fila["resultado"] == "REVOCADO"
    [renglon] = _logs(db, "COT", cot.id, "SC_CAMBIOS_CLIENTE")
    assert renglon.description == TEXTO_C20
    assert (renglon.old_estado, renglon.new_estado) == ("PENDIENTE_CONFIRMACION", "BORRADOR")
    assert renglon.extra_data["comentario"] == COMENTARIO

    # El enlace viejo de la COT ya no confirma nada (ni la COT ni, por U15, la SC).
    _detalle(_confirmar(app_client, raw_cot), "no_disponible")
    db.refresh(cot); db.refresh(sc)
    assert cot.estado == "BORRADOR" and sc.estado == "ASIGNADA"
