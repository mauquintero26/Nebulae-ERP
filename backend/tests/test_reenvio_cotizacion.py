"""Bloque 3, Tarea 7 — U16-reenvio-cot fusionado en U22-validez (C13; RP16): reenviar una cotización pendiente.

- POST /cotizaciones/{id}/enviar-confirmacion acepta BORRADOR, ENVIADA y PENDIENTE_CONFIRMACION (reenvío). RECHAZADA,
  CONFIRMADA y VENCIDA siguen en 400 con la etiqueta del estado; con un pedido vigente (H46), 400 como hoy.
- El reenvío revoca el enlace anterior y emite uno nuevo con la validez renovada (valida_hasta = hoy + días); el estado
  no cambia (old_estado == new_estado == PENDIENTE_CONFIRMACION), gate2 queda en None, no llama a la sincronización ni a
  mover_lead_de_solicitud (ya corrieron en el primer envío) y la Actividad dice 'Enlace de confirmación reenviado al
  cliente' + el canal.
- RP16: también en el reenvío, la revocación, el token y valida_hasta van en UN commit antes del correo.

Nunca correo real: app.core.email.send_email se reemplaza por un falso que acepta **kwargs.
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_reenvio_cotizacion
"""
import datetime
import uuid

from sqlalchemy import text

CORREO = "ana@cliente.com"
LINEA = {"product_name": "Cuna Colecho", "qty": 1, "unit_price_cop": 1000, "total_cop": 1000}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


def _correo_falso(monkeypatch, al_enviar=None):
    import app.core.email as correo
    llamadas = []

    def enviar(to, subject, html_body, **kwargs):
        llamadas.append({"to": to, "subject": subject, "html_body": html_body, **kwargs})
        if al_enviar is not None:
            al_enviar()
        return True

    monkeypatch.setattr(correo, "send_email", enviar)
    monkeypatch.setattr(correo, "smtp_configurado", lambda: True)
    return llamadas


def _contar_mover_lead(monkeypatch):
    """Espía de mover_lead_de_solicitud tal como lo usa erp_ventas (importado por nombre)."""
    import app.api.v1.erp_ventas as ventas
    llamadas = []
    real = ventas.mover_lead_de_solicitud

    def espia(sc_id, *args, **kwargs):
        llamadas.append(sc_id)
        return real(sc_id, *args, **kwargs)

    monkeypatch.setattr(ventas, "mover_lead_de_solicitud", espia)
    return llamadas


def _sc(db, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "CONFIRMADA")
    campos.setdefault("gate1_confirmed_at", datetime.datetime.utcnow())
    sc = CustomerRequest(numero=f"SC-T7R{_sufijo()}", customer_name="Ana Pérez", customer_email=CORREO,
                         productos=[{"product_name": "Cuna Colecho", "qty": 1}], **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, sc=None, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    campos.setdefault("productos", [dict(LINEA)])
    campos.setdefault("subtotal_cop", 1000)
    campos.setdefault("total_cop", 1000)
    campos.setdefault("customer_email", CORREO)
    if sc is not None:
        campos.setdefault("sc_id", sc.id)
        campos.setdefault("sc_numero", sc.numero)
    cot = SalesQuotation(numero=f"COT-T7R{_sufijo()}", customer_name="Ana Pérez", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _enviar(app_client, token, cot, body=None):
    return app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json=body or {},
                           headers=auth(token))


def _raw(resp):
    return resp.json()["link_confirmacion"].rsplit("/", 1)[-1]


def _ver(app_client, raw):
    return app_client.post("/api/v1/confirmar/ver", json={"token": raw})


def _tokens(db, cot_id):
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    return (db.query(DocumentConfirmationToken)
            .filter(DocumentConfirmationToken.document_type == "COT", DocumentConfirmationToken.document_id == cot_id)
            .order_by(DocumentConfirmationToken.id.asc()).all())


def _logs(db, cot_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == "COT", ActivityLog.entity_id == cot_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def test_reenviar_cotizacion_pendiente_revoca_el_enlace_anterior(app_client, db, admin_token, monkeypatch,
                                                                 contador_sql):
    commits_al_enviar = []
    _correo_falso(monkeypatch, al_enviar=lambda: commits_al_enviar.append(contador_sql.commits))
    mover = _contar_mover_lead(monkeypatch)
    sc = _sc(db)
    cot = _cot(db, sc)

    primero = _enviar(app_client, admin_token, cot)
    assert primero.status_code == 200, primero.text
    link1 = primero.json()["link_confirmacion"]
    estado_sc = db.get(type(sc), sc.id).estado

    contador_sql.reset()
    commits_al_enviar.clear()
    segundo = _enviar(app_client, admin_token, cot, {"canal": "WhatsApp"})
    assert segundo.status_code == 200, segundo.text
    link2 = segundo.json()["link_confirmacion"]
    assert link2 != link1
    # RP16: un solo commit antes del correo (revocación, token y validez) y, sin mover el lead, solo el del renglón.
    assert commits_al_enviar == [1], commits_al_enviar
    assert contador_sql.commits == 2, contador_sql.commits
    # La COT se bloquea; su SC no: un «Pedir cambios» en la SC la bloquea y después a esta COT (SC -> COT), y en el
    # reenvío bloquear también la SC (COT -> SC) formaría un ciclo.
    bloqueos = [s for s in contador_sql.sentencias if "FOR UPDATE" in s.upper()]
    assert [s for s in bloqueos if "FROM sales_quotations" in s], "la COT debe leerse con FOR UPDATE"
    assert not [s for s in bloqueos if "FROM customer_requests" in s], "el reenvío no bloquea la SC"

    viejo = _ver(app_client, link1.rsplit("/", 1)[-1])
    assert viejo.status_code == 400, viejo.text
    assert viejo.json()["detail"]["estado_enlace"] == "reemplazado"
    assert _ver(app_client, link2.rsplit("/", 1)[-1]).status_code == 200
    tokens = _tokens(db, cot.id)
    assert len(tokens) == 2 and tokens[0].used_at is not None and tokens[1].used_at is None

    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION" and cot.gate2_confirmed_at is None
    assert cot.canal_envio == "WhatsApp"
    envios = _logs(db, cot.id, "ESTADO_CHANGED")
    assert [l.description for l in envios] == ["Enviada para confirmación del cliente",
                                               "Enlace de confirmación reenviado al cliente por WhatsApp"]
    assert (envios[1].old_estado, envios[1].new_estado) == ("PENDIENTE_CONFIRMACION", "PENDIENTE_CONFIRMACION")
    assert [c["etiqueta"] for c in envios[1].extra_data["cambios"]] == [
        "Canal de envío", "Correo de respaldo", "Enlace vigente hasta"]
    # El lead se movió en el primer envío y no otra vez; la SC no se toca en el reenvío.
    assert mover == [sc.id]
    db.expire_all()
    assert db.get(type(sc), sc.id).estado == estado_sc


def test_reenviar_cotizacion_con_pven_sigue_en_400(app_client, db, admin_token, monkeypatch):
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.erp_documents import SaleOrder
    llamadas = _correo_falso(monkeypatch)
    cot = _cot(db, estado="PENDIENTE_CONFIRMACION")
    raw = create_confirmation_token(db, "COT", cot.id)
    db.add(SaleOrder(numero=f"PVEN-T7R{_sufijo()}", cot_id=cot.id, customer_name="Ana Pérez",
                     estado="PENDIENTE_COMPRA", total_cop=1000))
    db.commit()
    resp = _enviar(app_client, admin_token, cot, {"canal": "Email"})
    assert resp.status_code == 400, resp.text
    assert "pedido de venta" in resp.json()["detail"]
    assert llamadas == []
    tokens = _tokens(db, cot.id)
    assert len(tokens) == 1 and tokens[0].used_at is None  # el enlace que tenía no se tocó
    db.refresh(cot)
    assert cot.valida_hasta is None


def test_rechazada_confirmada_y_vencida_siguen_en_400_con_la_etiqueta(app_client, db, admin_token, monkeypatch):
    from app.core.textos_actividad import etiqueta_estado
    llamadas = _correo_falso(monkeypatch)
    for estado in ("RECHAZADA", "CONFIRMADA", "VENCIDA"):
        cot = _cot(db, estado=estado)
        resp = _enviar(app_client, admin_token, cot, {"canal": "Email"})
        assert resp.status_code == 400, (estado, resp.text)
        assert resp.json()["detail"] == (
            f"La cotización debe estar en Borrador, Enviada o Pendiente por confirmación para enviarla al cliente "
            f"(estado actual: {etiqueta_estado('COT', estado)}).")
        assert _tokens(db, cot.id) == []
        db.refresh(cot)
        assert cot.estado == estado and cot.valida_hasta is None
    assert llamadas == []


def test_reenviar_renueva_valida_hasta(app_client, db, admin_token, monkeypatch):
    """«Reenviar» renueva la validez (el recordatorio automático no: es de T11)."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.core.fechas import hoy_colombia, vence_al_final_del_dia
    _correo_falso(monkeypatch)
    hace_dias = hoy_colombia() - datetime.timedelta(days=3)
    cot = _cot(db, estado="PENDIENTE_CONFIRMACION", valida_hasta=hace_dias)
    create_confirmation_token(db, "COT", cot.id, expires_at=vence_al_final_del_dia(hace_dias))
    db.execute(text("INSERT INTO admin_config (key, value, updated_at) VALUES ('dias_validez_cotizacion', '12', NOW()) "
                    "ON CONFLICT (key) DO UPDATE SET value = '12', updated_at = NOW()"))
    db.commit()
    resp = _enviar(app_client, admin_token, cot)
    assert resp.status_code == 200, resp.text
    nueva = hoy_colombia() + datetime.timedelta(days=12)
    assert resp.json()["vence"] == nueva.isoformat()
    db.refresh(cot)
    assert cot.valida_hasta == nueva and cot.estado == "PENDIENTE_CONFIRMACION"
    viejo, nuevo = _tokens(db, cot.id)
    assert viejo.used_at is not None
    assert nuevo.used_at is None and nuevo.expires_at == vence_al_final_del_dia(nueva)
    assert _ver(app_client, _raw(resp)).status_code == 200
