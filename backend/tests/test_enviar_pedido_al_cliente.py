"""Bloque 3, Tarea 7 — U23 (puntos 2 y 3; R6, C16, C21, RP15, RP16, RP31): enviar el pedido al cliente.

- POST /ventas/pedidos/{id}/enviar-al-cliente (Administración o el asesor): 404 si no existe; 409 si está CANCELADO; 400
  sin productos o con total <= 0; el canal se valida con _canal_de_envio ANTES de tocar enlaces (422 canal malo; 400
  Email sin correo).
- Revoca el enlace de consulta anterior y crea uno nuevo 'PVEN' que vence al final del día de hoy + DIAS_ENLACE_PEDIDO
  (30) en Colombia; el PVEN se lee FOR UPDATE y la revocación, el enlace y el renglón ENVIADO_AL_CLIENTE van en UN
  commit antes del correo (RP16). El correo sale de correo_documento(proposito='CONSULTA', vence, resumen) y después se
  completa el renglón con su resultado (_extra_data_de_envio, RP31): Canal de envío, Correo de respaldo / Correo,
  Enlace vigente hasta (C16).
- La Actividad dice 'Confirmación del pedido enviada (o reenviada) al cliente' + el canal, a nombre de la sesión
  (nombre_de_usuario, RP15: el user_name del body no cuenta). El estado del pedido no cambia.
- Respuesta {status, link, canal, correo, vence, whatsapp: None} (el WhatsApp es de T8).
- GET /pedidos/{id}.enlace_cliente = {enviado_at, vence_at, vigente} (UTC con 'Z'); nunca el token.
- Las notas del pedido no van al correo (decisión del usuario pendiente, ruling de T5).

Nunca correo real: app.core.email.send_email se reemplaza por un falso que acepta **kwargs.
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_enviar_pedido_al_cliente
"""
import datetime
import hashlib
import uuid

from tests.usuarios_de_prueba import compras_token  # noqa: F401  (fixture)

MOD_60_40 = "60/40 (60% anticipo - 40% pendiente)"
CORREO = "ana@cliente.com"
NOTA_INTERNA = "Nota interna del pedido: cliente difícil"
PRODUCTOS = [{"product_name": "Sofá", "qty": 2, "unit_price_cop": 400000, "total_cop": 800000},
             {"product_name": "Mesa", "qty": 1, "unit_price_cop": 200000, "total_cop": 200000}]
CLAVES_RESPUESTA = {"status", "link", "canal", "correo", "vence", "whatsapp"}
CANCELADO = "El pedido está cancelado: no se puede enviar al cliente."
SIN_NADA = "El pedido no tiene productos ni total; no hay nada que enviar."


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


def _correo_falso(monkeypatch, configurado=True, resultado=True, al_enviar=None):
    import app.core.email as correo
    llamadas = []

    def enviar(to, subject, html_body, **kwargs):
        llamadas.append({"to": to, "subject": subject, "html_body": html_body, **kwargs})
        if al_enviar is not None:
            al_enviar()
        return resultado

    monkeypatch.setattr(correo, "send_email", enviar)
    monkeypatch.setattr(correo, "smtp_configurado", lambda: configurado)
    return llamadas


def _pedido(db, pagado=600000, **campos):
    """SC 60/40 -> COT CONFIRMADA -> PVEN PENDIENTE_COMPRA de $1.000.000 con un anticipo de `pagado` (saldo = total -
    pagado). Devuelve el pedido."""
    from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation
    s = _sufijo()
    datos = {"customer_name": "Ana Pérez", "customer_email": CORREO, "customer_phone": "3001112233"}
    sc = CustomerRequest(numero=f"SC-T7P{s}", estado="CONFIRMADA", modalidad_pago=MOD_60_40,
                         productos=[{"product_name": "Sofá", "qty": 2}], **datos)
    db.add(sc); db.commit(); db.refresh(sc)
    cot = SalesQuotation(numero=f"COT-T7P{s}", sc_id=sc.id, sc_numero=sc.numero, estado="CONFIRMADA",
                         productos=[dict(p) for p in PRODUCTOS], subtotal_cop=1000000, total_cop=1000000,
                         anticipo_cop=600000, **datos)
    db.add(cot); db.commit(); db.refresh(cot)
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    campos.setdefault("productos", [dict(p) for p in PRODUCTOS])
    campos.setdefault("total_cop", 1000000)
    so = SaleOrder(numero=f"PVEN-T7P{s}", sc_id=sc.id, sc_numero=sc.numero, cot_id=cot.id, cot_numero=cot.numero,
                   subtotal_cop=1000000, saldo_cop=1000000 - pagado, anticipo_cop=pagado, anticipo_pct_snapshot=60,
                   notas=NOTA_INTERNA, **{**datos, **campos})
    db.add(so); db.commit(); db.refresh(so)
    return so


def _enviar(app_client, token, so, body=None):
    return app_client.post(f"/api/v1/ventas/pedidos/{so.id}/enviar-al-cliente", json=body or {}, headers=auth(token))


def _raw(resp):
    return resp.json()["link"].rsplit("/", 1)[-1]


def _ver(app_client, raw):
    return app_client.post("/api/v1/pedido-cliente/ver", json={"token": raw})


def _tokens(db, so_id):
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    return (db.query(DocumentConfirmationToken)
            .filter(DocumentConfirmationToken.document_type == "PVEN", DocumentConfirmationToken.document_id == so_id)
            .order_by(DocumentConfirmationToken.id.asc()).all())


def _envios(db, so_id):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    return (db.query(ActivityLog)
            .filter(ActivityLog.entity_type == "VEN", ActivityLog.entity_id == so_id,
                    ActivityLog.action == "ENVIADO_AL_CLIENTE")
            .order_by(ActivityLog.id.asc()).all())


def _vence():
    from app.core.fechas import hoy_colombia
    return hoy_colombia() + datetime.timedelta(days=30)


def test_asesor_envia_el_pedido_y_recibe_el_enlace(app_client, db, vendedor_token, user_vendedor, monkeypatch):
    from app.core.fechas import fecha_larga, vence_al_final_del_dia
    from app.core.textos_actividad import nombre_de_usuario
    llamadas = _correo_falso(monkeypatch)
    so = _pedido(db)
    resp = _enviar(app_client, vendedor_token, so, {"canal": "WhatsApp", "user_name": "asesor@test"})
    assert resp.status_code == 200, resp.text
    j = resp.json()
    vence = _vence()
    assert set(j) == CLAVES_RESPUESTA
    assert j["status"] == "success" and j["canal"] == "WhatsApp" and j["whatsapp"] is None
    assert "/pedido/" in j["link"] and j["vence"] == vence.isoformat()
    assert j["correo"]["enviado"] is True and j["correo"]["destino"] == CORREO
    # El correo: el de consulta del pedido (CONSULTA), con la fecha del enlace y lo pagado; sin las notas del pedido.
    [correo] = llamadas
    assert correo["to"] == CORREO
    assert correo["subject"].startswith(f"Confirmación de tu pedido {so.numero}")
    html = correo["html_body"]
    assert f"Este enlace estará disponible hasta el {fecha_larga(vence)}." in html
    for texto in ("Total", "$1.000.000", "Pagado", "$600.000", "Saldo", "$400.000", j["link"]):
        assert texto in html, texto
    assert "cliente difícil" not in html
    # El enlace: de consulta (PVEN), sin usar, hasta el final del día de hoy + 30 en Colombia; abre el pedido.
    [token] = _tokens(db, so.id)
    assert token.used_at is None and token.expires_at == vence_al_final_del_dia(vence)
    assert _ver(app_client, _raw(resp)).status_code == 200
    # La Actividad: a nombre de la sesión (RP15), con el canal, el correo y el vencimiento (C16).
    [envio] = _envios(db, so.id)
    assert envio.description == "Confirmación del pedido enviada al cliente por WhatsApp"
    assert envio.user_name == nombre_de_usuario(user_vendedor) and envio.user_name != "asesor@test"
    assert (envio.old_estado, envio.new_estado) == (None, None)
    extra = envio.extra_data
    assert extra["canal"] == "WhatsApp" and extra["vence"] == vence.isoformat()
    assert extra["correo"] == {"enviado": True, "destino": CORREO, "motivo": None}
    assert extra["cambios"] == [
        {"etiqueta": "Canal de envío", "despues": "WhatsApp"},
        {"etiqueta": "Correo de respaldo", "despues": f"Correo enviado a {CORREO}."},
        {"etiqueta": "Enlace vigente hasta", "despues": vence.strftime("%d/%m/%Y")}]
    db.refresh(so)
    assert so.estado == "PENDIENTE_COMPRA"


def test_un_solo_commit_antes_del_correo(app_client, db, admin_token, monkeypatch, contador_sql):
    """RP16: el PVEN se lee FOR UPDATE; la revocación, el enlace nuevo y el renglón van en UN commit antes del correo, y
    el resultado del correo se anota después (segundo commit). Si el correo falla, el envío queda igual."""
    commits_al_enviar = []
    _correo_falso(monkeypatch, resultado=False, al_enviar=lambda: commits_al_enviar.append(contador_sql.commits))
    so = _pedido(db)
    contador_sql.reset()
    resp = _enviar(app_client, admin_token, so, {"canal": "Email"})
    assert resp.status_code == 200, resp.text
    assert commits_al_enviar == [1], commits_al_enviar
    assert contador_sql.commits == 2, contador_sql.commits
    assert [s for s in contador_sql.sentencias if "FROM sale_orders" in s and "FOR UPDATE" in s.upper()], \
        "el pedido debe leerse con FOR UPDATE"
    assert resp.json()["correo"]["motivo"] == "FALLO_ENVIO"
    [envio] = _envios(db, so.id)
    assert envio.description == "Confirmación del pedido enviada al cliente por correo"
    assert envio.extra_data["correo"]["motivo"] == "FALLO_ENVIO"
    assert [c["etiqueta"] for c in envio.extra_data["cambios"]] == ["Canal de envío", "Correo", "Enlace vigente hasta"]
    [token] = _tokens(db, so.id)
    assert token.used_at is None


def test_reenviar_anula_el_enlace_anterior(app_client, db, admin_token, monkeypatch):
    _correo_falso(monkeypatch)
    so = _pedido(db)
    primero = _enviar(app_client, admin_token, so, {"canal": "Otro"})
    assert primero.status_code == 200, primero.text
    segundo = _enviar(app_client, admin_token, so, {"canal": "Email"})
    assert segundo.status_code == 200, segundo.text
    assert _raw(primero) != _raw(segundo)
    assert _ver(app_client, _raw(primero)).status_code == 400
    assert _ver(app_client, _raw(segundo)).status_code == 200
    viejo, nuevo = _tokens(db, so.id)
    assert viejo.used_at is not None and nuevo.used_at is None
    assert [e.description for e in _envios(db, so.id)] == [
        "Confirmación del pedido enviada al cliente por otro canal",
        "Confirmación del pedido reenviada al cliente por correo"]
    # Sin canal (el Hub no siempre lo pregunta): sin sufijo y solo el correo de respaldo y el vencimiento.
    tercero = _enviar(app_client, admin_token, so)
    assert tercero.status_code == 200, tercero.text
    ultimo = _envios(db, so.id)[-1]
    assert ultimo.description == "Confirmación del pedido reenviada al cliente"
    assert [c["etiqueta"] for c in ultimo.extra_data["cambios"]] == ["Correo de respaldo", "Enlace vigente hasta"]


def test_pedido_cancelado_es_409(app_client, db, admin_token, monkeypatch):
    llamadas = _correo_falso(monkeypatch)
    so = _pedido(db, estado="CANCELADO")
    resp = _enviar(app_client, admin_token, so, {"canal": "Email"})
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == CANCELADO
    assert _tokens(db, so.id) == [] and _envios(db, so.id) == [] and llamadas == []


def test_sin_productos_o_sin_total_es_400(app_client, db, admin_token, monkeypatch):
    llamadas = _correo_falso(monkeypatch)
    for campos in ({"productos": []}, {"productos": None}, {"total_cop": 0}, {"total_cop": None}):
        so = _pedido(db, **campos)
        resp = _enviar(app_client, admin_token, so, {"canal": "Email"})
        assert resp.status_code == 400, (campos, resp.text)
        assert resp.json()["detail"] == SIN_NADA, campos
        assert _tokens(db, so.id) == [], campos
    assert llamadas == []


def test_email_sin_correo_es_400_y_no_crea_enlace(app_client, db, admin_token, monkeypatch):
    """H27: el canal se valida ANTES de revocar o crear enlaces: el enlace que el cliente ya tenía sigue sirviendo."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.core.fechas import vence_al_final_del_dia
    llamadas = _correo_falso(monkeypatch)
    so = _pedido(db, customer_email=None)
    raw = create_confirmation_token(db, "PVEN", so.id, expires_at=vence_al_final_del_dia(_vence()))
    resp = _enviar(app_client, admin_token, so, {"canal": "Email"})
    assert resp.status_code == 400, resp.text
    assert "no tiene correo" in resp.json()["detail"]
    [token] = _tokens(db, so.id)
    assert token.used_at is None
    assert _ver(app_client, raw).status_code == 200
    assert _envios(db, so.id) == [] and llamadas == []


def test_canal_invalido_es_422(app_client, db, admin_token, monkeypatch):
    llamadas = _correo_falso(monkeypatch)
    so = _pedido(db)
    for canal in ("Fax", 7, ["WhatsApp"]):
        resp = _enviar(app_client, admin_token, so, {"canal": canal})
        assert resp.status_code == 422, (canal, resp.text)
    assert _tokens(db, so.id) == [] and _envios(db, so.id) == [] and llamadas == []


def test_get_pedido_expone_estado_del_enlace_sin_token(app_client, db, admin_token, monkeypatch):
    from app.core.confirmation_tokens import revoke_pending_tokens
    from app.core.fechas import iso_z
    _correo_falso(monkeypatch)
    so = _pedido(db)

    def enlace():
        r = app_client.get(f"/api/v1/ventas/pedidos/{so.id}", headers=auth(admin_token))
        assert r.status_code == 200, r.text
        return r, r.json()["data"]["enlace_cliente"]

    _, antes = enlace()
    assert antes == {"vigente": False, "enviado_at": None, "vence_at": None}
    resp = _enviar(app_client, admin_token, so, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    raw = _raw(resp)
    r, vigente = enlace()
    [token] = _tokens(db, so.id)
    assert vigente == {"vigente": True, "enviado_at": iso_z(token.created_at), "vence_at": iso_z(token.expires_at)}
    assert vigente["enviado_at"].endswith("Z") and vigente["vence_at"].endswith("Z")
    assert raw not in r.text and hashlib.sha256(raw.encode()).hexdigest() not in r.text
    # Sin enlace vigente (revocado), la fecha del último envío de la Actividad.
    revoke_pending_tokens(db, "PVEN", so.id)
    _, sin_enlace = enlace()
    [envio] = _envios(db, so.id)
    assert sin_enlace == {"vigente": False, "enviado_at": iso_z(envio.created_at), "vence_at": None}


def test_solo_administracion_o_el_asesor(app_client, db, compras_token, monkeypatch):
    _correo_falso(monkeypatch)
    so = _pedido(db)
    resp = _enviar(app_client, compras_token, so, {"canal": "Email"})
    assert resp.status_code == 403, resp.text
    assert _tokens(db, so.id) == []


def test_pedido_que_no_existe_es_404(app_client, db, admin_token, monkeypatch):
    _correo_falso(monkeypatch)
    resp = app_client.post("/api/v1/ventas/pedidos/999999999/enviar-al-cliente", json={"canal": "Email"},
                           headers=auth(admin_token))
    assert resp.status_code == 404, resp.text
    assert resp.json()["detail"] == "Pedido de venta no encontrado"


def test_si_el_correo_no_se_puede_armar_no_queda_nada(app_client, db, admin_token, monkeypatch):
    """Como en los envíos SC/COT (T2 r2): con FRONTEND_URL sin http(s) correo_documento lanza; se revierte TODO (ni
    enlace nuevo, ni revocación del anterior, ni renglón) y el asesor recibe un 500 claro, sin el enlace."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.core.fechas import vence_al_final_del_dia
    llamadas = _correo_falso(monkeypatch)
    so = _pedido(db)
    raw = create_confirmation_token(db, "PVEN", so.id, expires_at=vence_al_final_del_dia(_vence()))
    monkeypatch.setenv("FRONTEND_URL", "erp.ejemplo.com")
    resp = _enviar(app_client, admin_token, so, {"canal": "Email"})
    assert resp.status_code == 500, resp.text
    assert "FRONTEND_URL" in resp.json()["detail"] and "erp.ejemplo.com" not in resp.text
    [token] = _tokens(db, so.id)
    assert token.used_at is None
    assert _ver(app_client, raw).status_code == 200
    assert _envios(db, so.id) == [] and llamadas == []
