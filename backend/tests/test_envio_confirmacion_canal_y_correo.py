"""H27+H39: al enviar una SC o una COT al cliente se elige el canal (WhatsApp / Email / Otro), que queda en la
Actividad, y SIEMPRE se intenta el correo de respaldo; la respuesta dice si el correo salio y por que no.

En TODAS las pruebas se parchea app.core.email.send_email con un fake que registra las llamadas: jamas se manda un
correo real, aunque algun dia SMTP quede configurado. Las variables SMTP_* solo toman valores de relleno.
"""


import logging


def auth(token):
    return {"Authorization": f"Bearer {token}"}


LINEA = {"product_name": "Cuna Colecho", "qty": 1}
CORREO = "cliente@test.com"


def _sc(db, numero, user_admin, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    campos.setdefault("productos", [LINEA])
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", advisor_user_id=user_admin.id,
                         advisor_name=user_admin.email, **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    campos.setdefault("productos", [LINEA])
    campos.setdefault("total_cop", 1000)
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _correo_falso(monkeypatch, *, configurado=True, resultado=True):
    """Parchea el modulo de correo: devuelve la lista donde el fake anota cada llamada a send_email."""
    llamadas = []

    # RP12 (B3 T2): **kwargs porque _enviar_correo_confirmacion ahora manda remitente_nombre (y T9 mandara adjuntos);
    # con una firma fija el TypeError se volveria FALLO_ENVIO sin un error visible.
    def fake_send_email(to, subject, html_body, **kwargs):
        llamadas.append({"to": to, "subject": subject, "html_body": html_body, **kwargs})
        return resultado

    monkeypatch.setattr("app.core.email.send_email", fake_send_email)
    monkeypatch.setattr("app.core.email.smtp_configurado", lambda: configurado)
    return llamadas


def _enviar_sc(app_client, token, sc, body):
    return app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json=body, headers=auth(token))


def _enviar_cot(app_client, token, cot, body):
    return app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json=body, headers=auth(token))


def _tokens_del_documento(db, tipo, doc_id):
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    return (db.query(DocumentConfirmationToken)
            .filter(DocumentConfirmationToken.document_type == tipo, DocumentConfirmationToken.document_id == doc_id)
            .order_by(DocumentConfirmationToken.id).all())


def _actividades(db, tipo, doc_id, accion="ESTADO_CHANGED"):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    return (db.query(ActivityLog)
            .filter(ActivityLog.entity_type == tipo, ActivityLog.entity_id == doc_id, ActivityLog.action == accion)
            .order_by(ActivityLog.id).all())


def test_enviar_sc_por_whatsapp_registra_el_canal_y_manda_el_correo_de_respaldo(
        app_client, db, admin_token, user_admin, monkeypatch):
    llamadas = _correo_falso(monkeypatch, configurado=True, resultado=True)
    sc = _sc(db, "SC-ENV001", user_admin, customer_email=CORREO)

    resp = _enviar_sc(app_client, admin_token, sc, {"user_name": "asesor@test", "canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    j = resp.json()
    assert j["canal"] == "WhatsApp"
    assert j["correo"] == {"enviado": True, "destino": CORREO, "motivo": None,
                           "mensaje": f"Correo enviado a {CORREO}."}
    assert len(llamadas) == 1 and llamadas[0]["to"] == CORREO
    assert j["link_confirmacion"] in llamadas[0]["html_body"]  # el respaldo lleva el mismo enlace

    ultima = _actividades(db, "SC", sc.id)[-1]
    assert ultima.description == "Enviada para confirmación del cliente por WhatsApp"
    assert ultima.user_name == "asesor@test"
    assert ultima.extra_data["canal"] == "WhatsApp"
    assert ultima.extra_data["correo"] == {"enviado": True, "destino": CORREO, "motivo": None}
    assert [c["etiqueta"] for c in ultima.extra_data["cambios"]] == ["Canal de envío", "Correo de respaldo"]
    assert ultima.extra_data["cambios"][0]["despues"] == "WhatsApp"
    assert ultima.extra_data["cambios"][1]["despues"] == f"Correo enviado a {CORREO}."
    assert all("campo" not in c for c in ultima.extra_data["cambios"])  # sin 'campo': no se pinta '—' tachado


def test_enviar_sc_sin_smtp_avisa_que_el_correo_no_esta_configurado(
        app_client, db, admin_token, user_admin, monkeypatch):
    # No se parchea smtp_configurado: se prueba el chequeo real contra el entorno (sin credenciales).
    llamadas = []
    monkeypatch.setattr("app.core.email.send_email",
                        lambda to, subject, html_body, **kwargs: llamadas.append(to) or True)  # RP12
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    sc = _sc(db, "SC-ENV002", user_admin, customer_email=CORREO)

    resp = _enviar_sc(app_client, admin_token, sc, {"user_name": "asesor@test", "canal": "Otro"})
    assert resp.status_code == 200, resp.text
    j = resp.json()
    assert j["correo"]["enviado"] is False
    assert j["correo"]["motivo"] == "CORREO_NO_CONFIGURADO"
    assert j["correo"]["destino"] == CORREO
    assert j["correo"]["mensaje"] == "No se envió correo: el envío de correos no está configurado en el sistema."
    assert j["link_confirmacion"]
    assert j["data"]["estado"] == "PENDIENTE_CONFIRMACION"
    assert llamadas == []  # sin SMTP ni siquiera se intenta
    db.refresh(sc)
    assert sc.estado == "PENDIENTE_CONFIRMACION"
    ultima = _actividades(db, "SC", sc.id)[-1]
    assert ultima.description == "Enviada para confirmación del cliente por otro canal"
    assert ultima.extra_data["correo"]["motivo"] == "CORREO_NO_CONFIGURADO"


def test_smtp_configurado_lee_las_variables_de_entorno(monkeypatch):
    from app.core.email import smtp_configurado
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    assert smtp_configurado() is False
    monkeypatch.setenv("SMTP_USER", "usuario-de-relleno")
    assert smtp_configurado() is False  # falta la clave
    monkeypatch.setenv("SMTP_PASSWORD", "   ")
    assert smtp_configurado() is False  # solo espacios no cuenta
    monkeypatch.setenv("SMTP_PASSWORD", "clave-de-relleno")
    assert smtp_configurado() is True


def test_enviar_sc_cliente_sin_correo_no_intenta_enviar(app_client, db, admin_token, user_admin, monkeypatch):
    llamadas = _correo_falso(monkeypatch, configurado=True, resultado=True)
    sc = _sc(db, "SC-ENV003", user_admin, customer_email=None)

    resp = _enviar_sc(app_client, admin_token, sc, {"user_name": "asesor@test", "canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    correo = resp.json()["correo"]
    assert correo == {"enviado": False, "destino": None, "motivo": "SIN_CORREO_CLIENTE",
                      "mensaje": "No se envió correo: el cliente no tiene correo registrado."}
    assert llamadas == []
    # Un correo en blanco cuenta como sin correo.
    sc2 = _sc(db, "SC-ENV003B", user_admin, customer_email="   ")
    resp = _enviar_sc(app_client, admin_token, sc2, {"canal": "Otro"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["correo"]["motivo"] == "SIN_CORREO_CLIENTE"
    assert llamadas == []


def test_enviar_sc_por_email_sin_correo_del_cliente_se_rechaza_sin_tocar_nada(
        app_client, db, admin_token, user_admin, monkeypatch):
    from app.models.confirmation import DocumentConfirmationToken
    llamadas = _correo_falso(monkeypatch)
    sc = _sc(db, "SC-ENV004", user_admin, customer_email=None)

    resp = _enviar_sc(app_client, admin_token, sc, {"user_name": "asesor@test", "canal": "Email"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == ("El cliente no tiene correo registrado: elige WhatsApp u Otro, o agrega su "
                                     "correo antes de enviar.")
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"
    assert db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.document_type == "SC", DocumentConfirmationToken.document_id == sc.id).count() == 0
    assert _actividades(db, "SC", sc.id) == []
    assert llamadas == []


def test_enviar_sc_con_canal_invalido_es_422(app_client, db, admin_token, user_admin, monkeypatch):
    from app.models.confirmation import DocumentConfirmationToken
    llamadas = _correo_falso(monkeypatch)
    sc = _sc(db, "SC-ENV005", user_admin, customer_email=CORREO)

    for canal in ("Fax", "whatsapp", "EMAIL"):
        resp = _enviar_sc(app_client, admin_token, sc, {"user_name": "asesor@test", "canal": canal})
        assert resp.status_code == 422, (canal, resp.text)
        assert resp.json()["detail"] == "Canal de envío no válido: usa WhatsApp, Email u Otro."
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"
    assert db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.document_type == "SC", DocumentConfirmationToken.document_id == sc.id).count() == 0
    assert llamadas == []


def test_enviar_sc_con_canal_rechazado_no_revoca_el_enlace_que_ya_tiene_el_cliente(
        app_client, db, admin_token, user_admin, monkeypatch):
    """La validacion del canal va ANTES de revocar tokens: en un reenvio (SC en PENDIENTE_CONFIRMACION con un enlace
    vivo) un canal malo no puede dejar al cliente con el enlace anterior revocado y sin uno nuevo."""
    from app.core.confirmation_tokens import create_confirmation_token
    llamadas = _correo_falso(monkeypatch)
    sc_sin_correo = _sc(db, "SC-ENV010A", user_admin, estado="PENDIENTE_CONFIRMACION", customer_email=None)
    sc_con_correo = _sc(db, "SC-ENV010B", user_admin, estado="PENDIENTE_CONFIRMACION", customer_email=CORREO)
    casos = [(sc_sin_correo, "Email", 400), (sc_con_correo, "Fax", 422), (sc_con_correo, 123, 422)]
    for sc in (sc_sin_correo, sc_con_correo):
        create_confirmation_token(db, "SC", sc.id)

    for sc, canal, esperado in casos:
        resp = _enviar_sc(app_client, admin_token, sc, {"user_name": "asesor@test", "canal": canal})
        assert resp.status_code == esperado, (canal, resp.text)
        tokens = _tokens_del_documento(db, "SC", sc.id)
        assert len(tokens) == 1 and tokens[0].used_at is None, canal  # el enlace sigue vivo y no se emitio otro
        db.refresh(sc)
        assert sc.estado == "PENDIENTE_CONFIRMACION"
        assert _actividades(db, "SC", sc.id) == []
    assert llamadas == []


def test_enviar_cot_con_canal_rechazado_no_revoca_el_enlace_que_ya_tiene_el_cliente(
        app_client, db, admin_token, user_admin, monkeypatch):
    """Igual en la COT. Una COT en PENDIENTE_CONFIRMACION no se reenvia (400), asi que el token vivo se siembra en una
    BORRADOR (revoke_pending_tokens revoca cualquier token sin usar del documento)."""
    from app.core.confirmation_tokens import create_confirmation_token
    llamadas = _correo_falso(monkeypatch)
    cot_sin_correo = _cot(db, "COT-ENV010A", customer_email=None)
    cot_con_correo = _cot(db, "COT-ENV010B", customer_email=CORREO)
    casos = [(cot_sin_correo, "Email", 400), (cot_con_correo, "Fax", 422), (cot_con_correo, 123, 422)]
    for cot in (cot_sin_correo, cot_con_correo):
        create_confirmation_token(db, "COT", cot.id)

    for cot, canal, esperado in casos:
        resp = _enviar_cot(app_client, admin_token, cot, {"user_name": "asesor@test", "canal": canal})
        assert resp.status_code == esperado, (canal, resp.text)
        tokens = _tokens_del_documento(db, "COT", cot.id)
        assert len(tokens) == 1 and tokens[0].used_at is None, canal
        db.refresh(cot)
        assert cot.estado == "BORRADOR" and cot.canal_envio is None
        assert _actividades(db, "COT", cot.id) == []
    assert llamadas == []


def test_canal_que_no_es_texto_es_422(app_client, db, admin_token, user_admin, monkeypatch):
    llamadas = _correo_falso(monkeypatch)
    sc = _sc(db, "SC-ENV011", user_admin, customer_email=CORREO)
    cot = _cot(db, "COT-ENV011", customer_email=CORREO)
    for canal in (123, ["WhatsApp"], {"canal": "Otro"}, True):
        resp = _enviar_sc(app_client, admin_token, sc, {"canal": canal})
        assert resp.status_code == 422, (canal, resp.text)
        assert resp.json()["detail"] == "Canal de envío no válido: usa WhatsApp, Email u Otro."
        resp = _enviar_cot(app_client, admin_token, cot, {"canal": canal})
        assert resp.status_code == 422, (canal, resp.text)
    assert _tokens_del_documento(db, "SC", sc.id) == [] and _tokens_del_documento(db, "COT", cot.id) == []
    assert llamadas == []


def test_enviar_sc_sin_canal_como_el_hub_sigue_funcionando(app_client, db, admin_token, user_admin, monkeypatch):
    llamadas = _correo_falso(monkeypatch, configurado=True, resultado=True)
    sc = _sc(db, "SC-ENV006", user_admin, customer_email=CORREO)

    resp = _enviar_sc(app_client, admin_token, sc, {})
    assert resp.status_code == 200, resp.text
    j = resp.json()
    assert j["canal"] is None
    assert j["correo"]["enviado"] is True  # el respaldo se intenta aunque no haya canal
    assert len(llamadas) == 1
    ultima = _actividades(db, "SC", sc.id)[-1]
    assert ultima.description == "Enviada para confirmación del cliente"
    assert "@" in ultima.user_name  # sin user_name en el body: el email del usuario autenticado
    assert ultima.user_name == user_admin.email
    assert ultima.extra_data["canal"] is None
    # Sin canal solo aparece el renglon del correo, rotulado como respaldo.
    assert [c["etiqueta"] for c in ultima.extra_data["cambios"]] == ["Correo de respaldo"]


def test_enviar_sc_por_email_rotula_el_renglon_como_correo(app_client, db, admin_token, user_admin, monkeypatch):
    _correo_falso(monkeypatch, configurado=True, resultado=True)
    sc = _sc(db, "SC-ENV006B", user_admin, customer_email=CORREO)

    resp = _enviar_sc(app_client, admin_token, sc, {"user_name": "asesor@test", "canal": "Email"})
    assert resp.status_code == 200, resp.text
    ultima = _actividades(db, "SC", sc.id)[-1]
    assert ultima.description == "Enviada para confirmación del cliente por correo"
    assert [c["etiqueta"] for c in ultima.extra_data["cambios"]] == ["Canal de envío", "Correo"]


def test_reenviar_una_sc_pendiente_anota_el_canal_en_el_reenvio(app_client, db, admin_token, user_admin, monkeypatch):
    _correo_falso(monkeypatch, configurado=True, resultado=True)
    sc = _sc(db, "SC-ENV006C", user_admin, customer_email=CORREO, estado="PENDIENTE_CONFIRMACION")

    resp = _enviar_sc(app_client, admin_token, sc, {"user_name": "asesor@test", "canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    ultima = _actividades(db, "SC", sc.id)[-1]
    assert ultima.description == "Enlace de confirmación reenviado al cliente por WhatsApp"
    assert (ultima.old_estado, ultima.new_estado) == ("PENDIENTE_CONFIRMACION", "PENDIENTE_CONFIRMACION")


def test_enviar_cot_guarda_canal_envio_y_un_solo_renglon_de_actividad(
        app_client, db, admin_token, user_admin, monkeypatch):
    llamadas = _correo_falso(monkeypatch, configurado=True, resultado=True)
    cot = _cot(db, "COT-ENV007", customer_email=CORREO)

    resp = _enviar_cot(app_client, admin_token, cot, {"user_name": "asesor@test", "canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    j = resp.json()
    assert j["canal"] == "WhatsApp"
    assert j["correo"]["enviado"] is True and j["correo"]["destino"] == CORREO
    assert j["data"]["canal_envio"] == "WhatsApp"
    assert len(llamadas) == 1 and llamadas[0]["to"] == CORREO

    db.refresh(cot)
    assert cot.canal_envio == "WhatsApp" and cot.estado == "PENDIENTE_CONFIRMACION"
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    filas = db.query(ActivityLog).filter(ActivityLog.entity_type == "COT", ActivityLog.entity_id == cot.id) \
        .order_by(ActivityLog.id).all()
    assert [(a.action, a.description) for a in filas] == [
        ("ESTADO_CHANGED", "Enviada para confirmación del cliente por WhatsApp")]  # sin UPDATED
    assert filas[0].extra_data["canal"] == "WhatsApp"
    assert [c["etiqueta"] for c in filas[0].extra_data["cambios"]] == ["Canal de envío", "Correo de respaldo"]


def test_enviar_cot_sin_canal_deja_el_canal_envio_que_ya_tenia(app_client, db, admin_token, user_admin, monkeypatch):
    _correo_falso(monkeypatch, configurado=False)
    cot = _cot(db, "COT-ENV007B", customer_email=CORREO, canal_envio="Otro")

    resp = _enviar_cot(app_client, admin_token, cot, {})
    assert resp.status_code == 200, resp.text
    assert resp.json()["canal"] is None
    assert resp.json()["correo"]["motivo"] == "CORREO_NO_CONFIGURADO"
    db.refresh(cot)
    assert cot.canal_envio == "Otro"
    ultima = _actividades(db, "COT", cot.id)[-1]
    assert ultima.description == "Enviada para confirmación del cliente"
    assert ultima.user_name == user_admin.email


def test_enviar_cot_con_canal_invalido_o_email_sin_correo_no_toca_nada(
        app_client, db, admin_token, user_admin, monkeypatch):
    from app.models.confirmation import DocumentConfirmationToken
    llamadas = _correo_falso(monkeypatch)
    cot = _cot(db, "COT-ENV007C", customer_email=None)

    resp = _enviar_cot(app_client, admin_token, cot, {"canal": "Fax"})
    assert resp.status_code == 422
    resp = _enviar_cot(app_client, admin_token, cot, {"canal": "Email"})
    assert resp.status_code == 400
    assert "El cliente no tiene correo registrado" in resp.json()["detail"]
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.canal_envio is None
    assert db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.document_type == "COT", DocumentConfirmationToken.document_id == cot.id).count() == 0
    assert _actividades(db, "COT", cot.id) == []
    assert llamadas == []


def test_enviar_cot_valida_las_guardas_de_estado_antes_que_el_canal(
        app_client, db, admin_token, user_admin, monkeypatch):
    """H46 / N4 mandan sobre el canal: un canal invalido en una COT que ya tiene pedido vigente o cuya SC esta
    cancelada recibe el error de estado, no el 422 del canal."""
    from app.models.erp_documents import SaleOrder
    _correo_falso(monkeypatch)
    # N4: la SC esta cancelada.
    sc = _sc(db, "SC-ENV007D", user_admin, estado="CANCELADA")
    cot = _cot(db, "COT-ENV007D", sc_id=sc.id, sc_numero=sc.numero, customer_email=CORREO)
    resp = _enviar_cot(app_client, admin_token, cot, {"canal": "Fax"})
    assert resp.status_code == 409, resp.text
    # H46: la COT ya tiene un pedido de venta vigente.
    cot2 = _cot(db, "COT-ENV007E", customer_email=CORREO)
    pven = SaleOrder(numero="PVEN-ENV007E", cot_id=cot2.id, cot_numero=cot2.numero, customer_name="Cliente Prueba",
                     estado="PENDIENTE_COMPRA")
    db.add(pven); db.commit()
    resp = _enviar_cot(app_client, admin_token, cot2, {"canal": "Fax"})
    assert resp.status_code in (400, 409), resp.text  # el error de estado del pedido, nunca el 422 del canal
    assert "pedido de venta" in resp.json()["detail"]


def test_fallo_de_smtp_se_reporta_como_fallo_envio(app_client, db, admin_token, user_admin, monkeypatch):
    llamadas = _correo_falso(monkeypatch, configurado=True, resultado=False)
    sc = _sc(db, "SC-ENV008", user_admin, customer_email=CORREO)

    resp = _enviar_sc(app_client, admin_token, sc, {"user_name": "asesor@test", "canal": "Email"})
    assert resp.status_code == 200, resp.text  # el envio al cliente (enlace) no depende del correo
    j = resp.json()
    assert j["correo"] == {"enviado": False, "destino": CORREO, "motivo": "FALLO_ENVIO",
                           "mensaje": f"No se pudo enviar el correo a {CORREO}: falló el servidor de correo."}
    assert len(llamadas) == 1
    db.refresh(sc)
    assert sc.estado == "PENDIENTE_CONFIRMACION"
    ultima = _actividades(db, "SC", sc.id)[-1]
    assert ultima.extra_data["correo"]["motivo"] == "FALLO_ENVIO"


def test_una_excepcion_del_envio_se_reporta_como_fallo_y_no_tumba_el_request(
        app_client, db, admin_token, user_admin, monkeypatch):
    """send_email promete no lanzar, pero si algun dia lo hace el enlace ya esta guardado: se informa FALLO_ENVIO."""
    def explota(to, subject, html_body, **kwargs):  # RP12: que falle por el RuntimeError, no por un TypeError
        raise RuntimeError("servidor caido")
    monkeypatch.setattr("app.core.email.send_email", explota)
    monkeypatch.setattr("app.core.email.smtp_configurado", lambda: True)
    # El fallo se loguea con traceback (logger.exception): se silencia el logger para no ensuciar la salida.
    monkeypatch.setattr(logging.getLogger("app.api.v1.erp_ventas"), "disabled", True)
    sc = _sc(db, "SC-ENV009", user_admin, customer_email=CORREO)

    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["correo"]["motivo"] == "FALLO_ENVIO"
    db.refresh(sc)
    assert sc.estado == "PENDIENTE_CONFIRMACION"
    assert len(_actividades(db, "SC", sc.id)) == 1
