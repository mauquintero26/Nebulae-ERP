"""Bloque 3, Tarea 11 — U16-seguimiento: recordatorio automático al cliente a los 2 días.

- core/seguimiento_confirmacion.py: la tabla propia seguimientos_confirmacion (fa6_031), iniciar al enviar (en el commit
  único del envío, RP16), las paradas «al pasar» (el documento ya no está Pendiente por confirmación, la cotización
  venció, el enlace se anuló), el reclamo idempotente (UPDATE condicional: nunca dos veces el mismo recordatorio), el
  envío con un enlace nuevo por el mismo medio (envio_whatsapp.enviar_documento con proposito SEGUIMIENTO + el correo de
  respaldo con correo_documento SEGUIMIENTO), el contacto del Chatter que lo corre y la parada manual.
- erp_ventas: 'Recordatorio automático' al final de los renglones del envío (C16), 'seguimiento' en la respuesta y en
  los detalles, seguimiento_estado en /alertas, las rutas …/seguimiento/detener y la configuración validada (R13).
- tareas_automaticas: la tarea va AL FINAL de TAREAS (RP7) y es idempotente entre dos corridas seguidas.

En TODAS las pruebas el correo es un falso (send_email y smtp_configurado) y el WhatsApp de U16-envio también
(enviar_documento y whatsapp_configurado), salvo test_envio_por_defecto_con_plantilla_de_recordatorio, que usa el
FakeChatwoot de test_envio_whatsapp_chatwoot sobre app.core.chatwoot._peticion. Nunca se llama a Chatwoot, SMTP ni Meta.
Casi todas llaman a correr_seguimientos(db, ahora=T, enviar=EnviarFalso(...)) con T fijo dentro de horario: un martes a
las 10:00 de Colombia (15:00 UTC). T está en el pasado: ninguna fila real de erp_test (la tabla nace con esta tarea) vence
antes de T.
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_seguimiento_confirmacion
"""
import datetime
import uuid

from sqlalchemy import text

T = datetime.datetime(2026, 10, 6, 15, 0)  # martes 6 de octubre de 2026, 10:00 en Colombia
DOMINGO = datetime.datetime(2026, 10, 4, 15, 0)  # domingo 10:00 en Colombia
CORREO = "cliente@test.com"
TELEFONO = "3001234567"
LINEA = {"product_name": "Cuna Colecho", "qty": 1}
CFG = {"activo": True, "dias": 2, "max": 1, "solo_horario": True, "hora_inicio": 8, "hora_fin": 18}
ETIQUETA = "Recordatorio automático"
SIN_PROGRAMAR = "No tiene recordatorios automáticos programados."


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


def _sc_mod():
    from app.core import seguimiento_confirmacion
    return seguimiento_confirmacion


# ─── Dobles ────────────────────────────────────────────────────────────────────────────────────────────────────────

def _dobles(monkeypatch, smtp=True, whatsapp=False):
    """Correo y WhatsApp falsos (R18). Devuelve {'correos': [...], 'whatsapp': [...]} con las llamadas.
    enviar_documento falso imita el resultado de T8 con el envío automático apagado (sin red)."""
    import app.core.email as correo
    import app.core.envio_whatsapp as envio_whatsapp
    llamadas = {"correos": [], "whatsapp": []}

    def send_email(to, subject, html_body, **kwargs):
        llamadas["correos"].append({"to": to, "subject": subject, "html_body": html_body, **kwargs})
        return True

    def enviar_documento(db, **kwargs):
        llamadas["whatsapp"].append(kwargs)
        return {"enviado": False, "estado": "NO_ENVIADO", "modo": None, "destino": None, "destino_legible": None,
                "motivo": "ENVIO_AUTOMATICO_APAGADO", "texto_resultado": envio_whatsapp.MOTIVOS[
                    "ENVIO_AUTOMATICO_APAGADO"], "mensaje": "texto sin enlace", "detalle": None, "envio_id": None,
                "texto_manual": "texto"}

    monkeypatch.setattr(correo, "send_email", send_email)
    monkeypatch.setattr(correo, "smtp_configurado", lambda: smtp)
    monkeypatch.setattr(envio_whatsapp, "enviar_documento", enviar_documento)
    monkeypatch.setattr(envio_whatsapp, "whatsapp_configurado", lambda db: whatsapp)
    return llamadas


class EnviarFalso:
    """Doble del envío del recordatorio (imita envio_whatsapp.enviar_documento + el correo de respaldo): anota cada
    llamada y devuelve {'whatsapp': {enviado, motivo, mensaje} | None, 'correo': {enviado, destino, motivo, mensaje}}."""

    def __init__(self, whatsapp=True, correo=True, motivo_wa="FALLO_CHATWOOT", motivo_correo="FALLO_ENVIO",
                 lanza=None):
        self.whatsapp, self.correo = whatsapp, correo
        self.motivo_wa, self.motivo_correo = motivo_wa, motivo_correo
        self.lanza = lanza
        self.llamadas = []

    def __call__(self, db, *, tipo, doc, canal, link, numero, total):
        self.llamadas.append({"tipo": tipo, "doc_id": doc.id, "canal": canal, "link": link, "numero": numero,
                              "total": total})
        if self.lanza is not None:
            raise self.lanza
        wa = None
        if canal == "WhatsApp":
            wa = ({"enviado": True, "motivo": None,
                   "mensaje": "Enviado automáticamente al +57 300 123 4567 con la plantilla aprobada «recordatorio»."}
                  if self.whatsapp else
                  {"enviado": False, "motivo": self.motivo_wa, "mensaje": f"No se envió: {self.motivo_wa}."})
        if self.correo:
            co = {"enviado": True, "destino": CORREO, "motivo": None, "mensaje": f"Correo enviado a {CORREO}."}
        else:
            co = {"enviado": False, "destino": CORREO, "motivo": self.motivo_correo,
                  "mensaje": f"No se pudo enviar el correo a {CORREO}: falló el servidor de correo."}
        return {"whatsapp": wa, "correo": co}


# ─── Datos ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def _config(db, **valores):
    """Las 6 claves seguimiento_* con su valor por defecto (o el dado), dentro de la transacción revertida: la prueba no
    depende de lo que haya en erp_test."""
    from app.core.admin_config import guardar_config
    claves = {"seguimiento_auto_activo": "true", "seguimiento_dias": "2", "seguimiento_max": "1",
              "seguimiento_solo_horario": "true", "seguimiento_hora_inicio": "8", "seguimiento_hora_fin": "18"}
    claves.update({f"seguimiento_{k}": v for k, v in valores.items()})
    guardar_config(db, claves)
    db.commit()


def _sc(db, user_admin, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    campos.setdefault("productos", [LINEA])
    campos.setdefault("customer_email", CORREO)
    campos.setdefault("customer_phone", TELEFONO)
    sc = CustomerRequest(numero=f"SC-SEG{_sufijo()}", customer_name="Cliente Prueba", advisor_user_id=user_admin.id,
                         advisor_name=user_admin.email, **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    campos.setdefault("productos", [{**LINEA, "unit_price_cop": 1000, "total_cop": 1000}])  # cuadra con la cabecera
    campos.setdefault("total_cop", 1000)
    campos.setdefault("customer_email", CORREO)
    campos.setdefault("customer_phone", TELEFONO)
    cot = SalesQuotation(numero=f"COT-SEG{_sufijo()}", customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _fila(db, tipo, doc, **campos):
    """Una fila de seguimiento como la deja iniciar, vencida por defecto (proximo_at una hora antes de T)."""
    from app.models.confirmation import SeguimientoConfirmacion
    campos.setdefault("estado", "ACTIVO")
    campos.setdefault("canal", "WhatsApp")
    campos.setdefault("iniciado_at", T - datetime.timedelta(days=2, hours=1))
    campos.setdefault("ultimo_contacto_at", campos["iniciado_at"])
    campos.setdefault("proximo_at", T - datetime.timedelta(hours=1))
    campos.setdefault("recordatorios_enviados", 0)
    fila = SeguimientoConfirmacion(document_type=tipo, document_id=doc.id, document_numero=doc.numero,
                                   iniciado_por="asesor", **campos)
    db.add(fila); db.commit(); db.refresh(fila)
    return fila


def _seg(db, tipo, doc_id):
    from app.models.confirmation import SeguimientoConfirmacion
    db.expire_all()
    return (db.query(SeguimientoConfirmacion)
            .filter(SeguimientoConfirmacion.document_type == tipo, SeguimientoConfirmacion.document_id == doc_id)
            .one_or_none())


def _tokens(db, tipo, doc_id):
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    return (db.query(DocumentConfirmationToken)
            .filter(DocumentConfirmationToken.document_type == tipo, DocumentConfirmationToken.document_id == doc_id)
            .order_by(DocumentConfirmationToken.id).all())


def _vivos(db, tipo, doc_id):
    from app.core.fechas import ahora_utc
    return [t for t in _tokens(db, tipo, doc_id) if t.used_at is None and t.expires_at > ahora_utc()]


def _renglones(db, tipo, doc_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == tipo, ActivityLog.entity_id == doc_id)
    if accion is not None:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id).all()


def _enviar_sc(app_client, token, sc, body):
    return app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json=body, headers=auth(token))


def _enviar_cot(app_client, token, cot, body):
    return app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json=body, headers=auth(token))


def _hash_del_link(link):
    from app.core.confirmation_tokens import hash_token
    return hash_token(link.rstrip("/").rsplit("/", 1)[-1])


# ─── 1. El envío programa el recordatorio ──────────────────────────────────────────────────────────────────────────

def test_enviar_sc_programa_el_recordatorio(app_client, db, admin_token, user_admin, monkeypatch):
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin)

    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    fila = _seg(db, "SC", sc.id)
    assert (fila.estado, fila.recordatorios_enviados, fila.canal) == ("ACTIVO", 0, "WhatsApp")
    assert fila.document_numero == sc.numero and fila.iniciado_at == fila.ultimo_contacto_at
    assert fila.proximo_at == seg_mod.siguiente_momento(fila.iniciado_at, seg_mod.leer_config(db))
    j = resp.json()
    assert j["seguimiento"]["estado"] == "ACTIVO"
    assert j["seguimiento"]["max"] == 1 and j["seguimiento"]["recordatorios_enviados"] == 0
    assert j["seguimiento"]["proximo_at"].endswith("Z")
    (renglon,) = _renglones(db, "SC", sc.id, "ESTADO_CHANGED")
    etiquetas = [c["etiqueta"] for c in renglon.extra_data["cambios"]]
    assert etiquetas[-1] == ETIQUETA  # C16: el último renglón
    from app.core.fechas import fecha_hora_co
    assert renglon.extra_data["cambios"][-1]["despues"] == fecha_hora_co(fila.proximo_at)
    assert all("campo" not in c for c in renglon.extra_data["cambios"])


def test_envio_con_el_seguimiento_apagado_lo_programa_y_lo_dice(app_client, db, admin_token, user_admin, monkeypatch):
    """Se programa aunque esté apagado en Configuración (la tarjeta dice «apagados»); la COT también lo programa."""
    _dobles(monkeypatch)
    _config(db, auto_activo="false")
    sc = _sc(db, user_admin)
    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "Email"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["seguimiento"]["estado"] == "APAGADO"
    assert _seg(db, "SC", sc.id).estado == "ACTIVO"
    (renglon,) = _renglones(db, "SC", sc.id, "ESTADO_CHANGED")
    assert renglon.extra_data["cambios"][-1] == {"etiqueta": ETIQUETA, "despues": "apagado en Configuración"}

    cot = _cot(db)
    resp = _enviar_cot(app_client, admin_token, cot, {"canal": "Email"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["seguimiento"]["estado"] == "APAGADO"
    assert _seg(db, "COT", cot.id).estado == "ACTIVO"


# ─── 2. Horario ────────────────────────────────────────────────────────────────────────────────────────────────────

def test_siguiente_momento_respeta_horario():
    seg_mod = _sc_mod()
    viernes_1730 = datetime.datetime(2026, 10, 2, 22, 30)  # viernes 17:30 CO
    martes_2000 = datetime.datetime(2026, 10, 7, 1, 0)  # martes 6, 20:00 CO
    martes_1000 = T
    martes_0600 = datetime.datetime(2026, 10, 6, 11, 0)  # martes 06:00 CO
    casos = [
        (viernes_1730, CFG, datetime.datetime(2026, 10, 5, 13, 0)),  # domingo -> lunes 8:00 CO
        (martes_2000, CFG, datetime.datetime(2026, 10, 9, 13, 0)),  # jueves 20:00 -> viernes 8:00 CO
        (martes_1000, CFG, datetime.datetime(2026, 10, 8, 15, 0)),  # jueves 10:00 CO, tal cual
        (martes_0600, CFG, datetime.datetime(2026, 10, 8, 13, 0)),  # jueves 06:00 -> jueves 8:00 CO
        (viernes_1730, {**CFG, "solo_horario": False}, viernes_1730 + datetime.timedelta(days=2)),  # exacto
        (datetime.datetime(2026, 10, 2, 15, 0), {**CFG, "dias": 1}, datetime.datetime(2026, 10, 3, 15, 0)),  # sábado
    ]
    for desde, cfg, esperado in casos:
        assert seg_mod.siguiente_momento(desde, cfg) == esperado, (desde, cfg)
    # dentro_de_horario: lunes a sábado, de hora_inicio a hora_fin (sin incluirla), en hora de Colombia.
    assert seg_mod.dentro_de_horario(T, CFG) is True
    assert seg_mod.dentro_de_horario(DOMINGO, CFG) is False
    assert seg_mod.dentro_de_horario(datetime.datetime(2026, 10, 6, 23, 0), CFG) is False  # martes 18:00 CO
    assert seg_mod.dentro_de_horario(datetime.datetime(2026, 10, 6, 12, 59), CFG) is False  # martes 7:59 CO
    assert seg_mod.dentro_de_horario(datetime.datetime(2026, 10, 3, 22, 59), CFG) is True  # sábado 17:59 CO


# ─── 3 y 4. El recordatorio sale una sola vez, con un enlace nuevo ─────────────────────────────────────────────────

def test_recordatorio_sale_y_cambia_el_enlace(db, user_admin, monkeypatch):
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.erp_documents import CustomerRequest
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    # La SC se tocó por última vez antes de T (r2: el cierre nunca retrocede updated_at).
    db.execute(text("UPDATE customer_requests SET updated_at = :v WHERE id = :id"),
               {"v": T - datetime.timedelta(days=3), "id": sc.id})
    db.commit()
    create_confirmation_token(db, "SC", sc.id)  # el enlace viejo, todavía vigente
    _fila(db, "SC", sc)
    enviar = EnviarFalso(whatsapp=True)

    res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    assert res == {"revisados": 1, "enviados": 1, "fallidos": 0, "agotados": 0, "detenidos": 0}
    assert len(enviar.llamadas) == 1
    llamada = enviar.llamadas[0]
    assert (llamada["tipo"], llamada["canal"], llamada["numero"], llamada["total"]) == ("SC", "WhatsApp", 1, 1)
    assert "/confirmar/" in llamada["link"]
    fila = _seg(db, "SC", sc.id)
    assert fila.estado == "ACTIVO" and fila.recordatorios_enviados == 1
    assert fila.ultimo_recordatorio_at == T and fila.ultimo_contacto_at == T
    assert fila.proximo_at == seg_mod.siguiente_momento(T, seg_mod.leer_config(db))
    assert fila.ultimo_resultado["canal"] == "WhatsApp" and fila.ultimo_resultado["motivo"] is None
    assert "+57" not in str(fila.ultimo_resultado) and CORREO not in str(fila.ultimo_resultado)
    (renglon,) = _renglones(db, "SC", sc.id, "RECORDATORIO_ENVIADO")
    assert renglon.description == "Recordatorio automático 1 de 1 enviado por WhatsApp con un enlace nuevo"
    assert renglon.user_name == seg_mod.USUARIO_SISTEMA
    assert renglon.extra_data["seguimiento"] == {"numero": 1, "max": 1, "canal": "WhatsApp"}
    etiquetas = [c["etiqueta"] for c in renglon.extra_data["cambios"]]
    assert etiquetas == ["Canal de envío", "WhatsApp", "Correo de respaldo", "Próximo paso"]
    assert renglon.extra_data["cambios"][-1]["despues"].startswith("Si no responde, se te avisará el ")
    assert all("campo" not in c for c in renglon.extra_data["cambios"])
    # R7 / C22: el recordatorio que salió cuenta como contacto.
    db.expire_all()
    assert db.get(CustomerRequest, sc.id).updated_at == T
    # Un solo enlace vivo: el que recibió el cliente. El viejo quedó revocado.
    vivos = _vivos(db, "SC", sc.id)
    assert len(vivos) == 1 and vivos[0].token_hash == _hash_del_link(llamada["link"])
    viejo = _tokens(db, "SC", sc.id)[0]
    assert viejo.used_at is not None and viejo.resultado == "REVOCADO"


def test_no_se_envia_dos_veces(db, user_admin, monkeypatch):
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc)
    enviar = EnviarFalso()
    primera = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    segunda = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    assert primera["enviados"] == 1 and segunda["revisados"] == 0 and segunda["enviados"] == 0
    assert len(enviar.llamadas) == 1
    assert len(_renglones(db, "SC", sc.id, "RECORDATORIO_ENVIADO")) == 1
    # El reclamo es un UPDATE condicional: la primera copia gana y la segunda no.
    sc2 = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    fila = _fila(db, "SC", sc2)
    assert seg_mod._reclamar(db, fila.id, visto=0) is True
    assert seg_mod._reclamar(db, fila.id, visto=0) is False
    db.commit()
    assert _seg(db, "SC", sc2.id).recordatorios_enviados == 1


# ─── 5 a 7. Paradas, agotado y fallo ───────────────────────────────────────────────────────────────────────────────

def test_se_detiene_si_salio_de_pendiente(db, user_admin, monkeypatch):
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    enviar = EnviarFalso()
    for estado, motivo in (("CONFIRMADA", "CONFIRMADO"), ("CANCELADA", "CANCELADO"), ("ASIGNADA", "VOLVIO_AL_ASESOR")):
        sc = _sc(db, user_admin, estado=estado)
        _fila(db, "SC", sc)
        antes = len(_renglones(db, "SC", sc.id))
        res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
        assert res["detenidos"] == 1 and res["enviados"] == 0, estado
        fila = _seg(db, "SC", sc.id)
        assert (fila.estado, fila.motivo_fin, fila.proximo_at) == ("DETENIDO", motivo, None), estado
        assert fila.terminado_at == T
        assert len(_renglones(db, "SC", sc.id)) == antes, estado  # sin renglón: el evento ya está en la Actividad
    assert enviar.llamadas == []
    # motivo_por_estado: los demás casos
    assert seg_mod.motivo_por_estado(None) == "DOCUMENTO_NO_EXISTE"
    from app.models.erp_documents import SalesQuotation
    for estado, motivo in (("RECHAZADA", "RECHAZADO"), ("VENCIDA", "RECHAZADO"), ("CONVERTIDA", "CONFIRMADO"),
                           ("BORRADOR", "VOLVIO_AL_ASESOR"), ("ENVIADA", "VOLVIO_AL_ASESOR"),
                           ("EN_PROCESO", "SALIO_DE_PENDIENTE")):
        assert seg_mod.motivo_por_estado(SalesQuotation(estado=estado)) == motivo, estado


def test_agotado_avisa_al_asesor(db, user_admin, monkeypatch):
    from app.models.erp_documents import CustomerRequest
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    updated_antes = sc.updated_at
    _fila(db, "SC", sc, recordatorios_enviados=1, ultimo_recordatorio_at=T - datetime.timedelta(days=2))
    enviar = EnviarFalso()
    res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    assert res["agotados"] == 1 and enviar.llamadas == []
    fila = _seg(db, "SC", sc.id)
    assert (fila.estado, fila.proximo_at) == ("AGOTADO", None)
    (renglon,) = _renglones(db, "SC", sc.id, "SEGUIMIENTO_AGOTADO")
    assert "Llámalo o escríbele" in renglon.description
    assert renglon.description == ("El cliente no respondió 1 recordatorio automático. Llámalo o escríbele: el "
                                   "sistema ya no le enviará más.")
    db.expire_all()
    assert db.get(CustomerRequest, sc.id).updated_at == updated_antes  # la alerta roja hace su trabajo
    # El agotado manda sobre el plazo pasado: no hay nada que enviarle al cliente, solo avisar al asesor.
    sc2 = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc2, recordatorios_enviados=1, proximo_at=T - datetime.timedelta(days=5))
    seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    assert _seg(db, "SC", sc2.id).estado == "AGOTADO"


def test_fallo_no_deja_enlace_vivo_ni_mata_el_viejo(db, user_admin, monkeypatch):
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.erp_documents import CustomerRequest
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    casos = [
        (EnviarFalso(whatsapp=False, correo=False), "FALLO_ENVIO"),
        (EnviarFalso(whatsapp=False, correo=False, motivo_wa="TELEFONO_INVALIDO", motivo_correo="SIN_CORREO_CLIENTE"),
         "SIN_MEDIO_CLIENTE"),
    ]
    for enviar, motivo in casos:
        sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
        updated_antes = sc.updated_at
        create_confirmation_token(db, "SC", sc.id)
        _fila(db, "SC", sc)
        res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
        assert res["fallidos"] == 1 and res["enviados"] == 0, motivo
        fila = _seg(db, "SC", sc.id)
        assert (fila.estado, fila.motivo_fin, fila.proximo_at) == ("DETENIDO", motivo, None), motivo
        assert fila.ultimo_resultado["mensaje"].startswith("No se pudo enviar: "), motivo  # r2: solo fallos reales
        (renglon,) = _renglones(db, "SC", sc.id, "RECORDATORIO_FALLIDO")
        assert renglon.description.startswith("No se pudo enviar el recordatorio automático 1: "), renglon.description
        assert renglon.description.endswith("Escríbele al cliente o reenvíale el enlace.")
        assert CORREO not in renglon.description and "+57" not in renglon.description
        viejo, nuevo = _tokens(db, "SC", sc.id)
        assert viejo.used_at is None  # el anterior no se pierde
        assert nuevo.used_at is not None and nuevo.resultado == "REVOCADO"  # nadie recibió el nuevo
        assert nuevo.token_hash == _hash_del_link(enviar.llamadas[0]["link"])
        db.expire_all()
        assert db.get(CustomerRequest, sc.id).updated_at == updated_antes, motivo
    # No se reintenta: la fila quedó detenida.
    enviar = casos[0][0]
    seg_mod.correr_seguimientos(db, ahora=T + datetime.timedelta(hours=1), enviar=enviar)
    assert len(enviar.llamadas) == 1


def test_chatwoot_sin_respuesta_no_se_reintenta_ni_anula_el_enlace(db, user_admin, monkeypatch):
    """Nota del controlador después de T8: CHATWOOT_SIN_RESPUESTA («puede que haya salido») nunca se reintenta solo, y
    el enlace que pudo llegarle al cliente no se anula."""
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db, max="3")
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc)
    enviar = EnviarFalso(whatsapp=False, correo=False, motivo_wa="CHATWOOT_SIN_RESPUESTA")
    res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    assert res["fallidos"] == 1
    fila = _seg(db, "SC", sc.id)
    assert (fila.estado, fila.motivo_fin) == ("DETENIDO", "CHATWOOT_SIN_RESPUESTA")
    # r1 (C1): nunca «No se pudo enviar» de algo que tal vez sí le llegó al cliente (lo ve la tarjeta, por resumen).
    assert fila.ultimo_resultado["mensaje"] == "No se confirmó: Chatwoot no confirmó el WhatsApp y puede que haya salido."
    (nuevo,) = _tokens(db, "SC", sc.id)
    assert nuevo.used_at is None and nuevo.token_hash == _hash_del_link(enviar.llamadas[0]["link"])
    (renglon,) = _renglones(db, "SC", sc.id, "RECORDATORIO_FALLIDO")
    assert "puede que haya salido" in renglon.description
    assert "Revisa la conversación en Chatwoot" in renglon.description
    seg_mod.correr_seguimientos(db, ahora=T + datetime.timedelta(days=3), enviar=enviar)
    assert len(enviar.llamadas) == 1


def test_un_error_al_enviar_no_tumba_la_revision_ni_se_repite(db, user_admin, monkeypatch):
    import logging
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    monkeypatch.setattr(logging.getLogger(seg_mod.__name__), "disabled", True)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    otra = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc, proximo_at=T - datetime.timedelta(hours=2))
    _fila(db, "SC", otra)
    llamadas = []

    def enviar(db, **kwargs):
        llamadas.append(kwargs["doc"].id)
        if kwargs["doc"].id == sc.id:
            raise RuntimeError("falla a propósito")
        return EnviarFalso()(db, **kwargs)

    res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    assert llamadas == [sc.id, otra.id]
    assert res["fallidos"] == 1 and res["enviados"] == 1
    fila = _seg(db, "SC", sc.id)
    assert (fila.estado, fila.motivo_fin) == ("DETENIDO", "FALLO_ENVIO")
    (renglon,) = _renglones(db, "SC", sc.id, "RECORDATORIO_FALLIDO")
    assert renglon.description.startswith("No se pudo completar el recordatorio automático 1")
    assert _seg(db, "SC", otra.id).recordatorios_enviados == 1
    seg_mod.correr_seguimientos(db, ahora=T + datetime.timedelta(days=3), enviar=enviar)
    assert llamadas.count(sc.id) == 1


# ─── 8 a 11. Reenvío, contacto, cotización y parada manual ─────────────────────────────────────────────────────────

def test_reenviar_reinicia_el_conteo(app_client, db, admin_token, user_admin, monkeypatch):
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc, estado="AGOTADO", recordatorios_enviados=1, proximo_at=None, terminado_at=T,
          ultimo_resultado={"canal": "WhatsApp", "motivo": None, "mensaje": "x"})
    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    fila = _seg(db, "SC", sc.id)
    assert (fila.estado, fila.recordatorios_enviados, fila.motivo_fin) == ("ACTIVO", 0, None)
    assert fila.terminado_at is None and fila.ultimo_resultado is None and fila.proximo_at > T
    from app.models.confirmation import SeguimientoConfirmacion
    assert db.query(SeguimientoConfirmacion).filter(SeguimientoConfirmacion.document_type == "SC",
                                                    SeguimientoConfirmacion.document_id == sc.id).count() == 1


def test_contacto_externo_pospone(app_client, db, admin_token, user_admin, monkeypatch, contador_sql):
    """R23: el gancho va en erp_ventas._agregar_nota con reinicia_atraso (EXTERNA, LLAMADA, ...); la nota interna no.
    r1 (I1): el documento se bloquea (su UPDATE) ANTES que la fila del seguimiento, el orden de los demás caminos."""
    from app.core.fechas import ahora_utc
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    cot = _cot(db, estado="PENDIENTE_CONFIRMACION")
    for tipo, doc, ruta in (("SC", sc, "solicitudes"), ("COT", cot, "cotizaciones")):
        _fila(db, tipo, doc, recordatorios_enviados=0, proximo_at=T)
        resp = app_client.post(f"/api/v1/ventas/{ruta}/{doc.id}/actividad", headers=auth(admin_token),
                               json={"action": "CHATTER", "tipo": "NOTA", "description": "Nota interna"})
        assert resp.status_code == 200, resp.text
        fila = _seg(db, tipo, doc.id)
        assert fila.proximo_at == T and fila.ultimo_contacto_at == T - datetime.timedelta(days=2, hours=1), tipo
        antes = ahora_utc()
        with contador_sql.ventana() as v:
            resp = app_client.post(f"/api/v1/ventas/{ruta}/{doc.id}/actividad", headers=auth(admin_token),
                                   json={"action": "CHATTER", "tipo": "EXTERNA", "description": "Hablé con el cliente"})
        assert resp.status_code == 200, resp.text
        tabla = "customer_requests" if tipo == "SC" else "sales_quotations"
        sentencias = [" ".join(s.split()).upper() for s in v.sentencias]
        update_doc = next(i for i, s in enumerate(sentencias) if s.startswith(f"UPDATE {tabla.upper()}"))
        bloqueo_fila = next(i for i, s in enumerate(sentencias)
                            if "FROM SEGUIMIENTOS_CONFIRMACION" in s and "FOR UPDATE" in s)
        assert update_doc < bloqueo_fila, (tipo, sentencias)
        fila = _seg(db, tipo, doc.id)
        assert antes <= fila.ultimo_contacto_at <= ahora_utc(), tipo
        assert fila.proximo_at == seg_mod.siguiente_momento(fila.ultimo_contacto_at, seg_mod.leer_config(db)), tipo
        assert fila.recordatorios_enviados == 0 and fila.estado == "ACTIVO", tipo
        assert _renglones(db, tipo, doc.id, "SEGUIMIENTO_DETENIDO") == []  # la nota del chatter ya queda


def test_enviar_cot_detiene_el_de_la_sc(app_client, db, admin_token, user_admin, monkeypatch):
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc, proximo_at=T + datetime.timedelta(days=1))
    cot = _cot(db, sc_id=sc.id, sc_numero=sc.numero)
    resp = _enviar_cot(app_client, admin_token, cot, {"canal": "Email"})
    assert resp.status_code == 200, resp.text
    fila_sc = _seg(db, "SC", sc.id)
    assert (fila_sc.estado, fila_sc.motivo_fin, fila_sc.proximo_at) == ("DETENIDO", "COTIZACION_ENVIADA", None)
    (renglon,) = _renglones(db, "SC", sc.id, "SEGUIMIENTO_DETENIDO")
    assert renglon.description == (f"Recordatorios de la solicitud detenidos: ahora se le recuerda la cotización "
                                   f"{cot.numero}")
    from app.core.textos_actividad import nombre_de_usuario
    assert renglon.user_name == nombre_de_usuario(user_admin)  # r1 (P3): el asesor de la sesión, no el sistema
    assert _seg(db, "COT", cot.id).estado == "ACTIVO"
    assert resp.json()["seguimiento"]["estado"] == "ACTIVO"


def test_detener_manual(app_client, db, vendedor_token, user_vendedor, user_admin, monkeypatch):
    from app.core.textos_actividad import nombre_de_usuario
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    cot = _cot(db, estado="PENDIENTE_CONFIRMACION")
    for tipo, doc, ruta in (("SC", sc, "solicitudes"), ("COT", cot, "cotizaciones")):
        _fila(db, tipo, doc, proximo_at=T + datetime.timedelta(days=1))
        url = f"/api/v1/ventas/{ruta}/{doc.id}/seguimiento/detener"
        resp = app_client.post(url, headers=auth(vendedor_token), json={"user_name": "otro autor"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["estado"] == "DETENIDO" and resp.json()["data"]["motivo_fin"] == "MANUAL"
        fila = _seg(db, tipo, doc.id)
        assert (fila.estado, fila.motivo_fin, fila.proximo_at) == ("DETENIDO", "MANUAL", None)
        (renglon,) = _renglones(db, tipo, doc.id, "SEGUIMIENTO_DETENIDO")
        autor = nombre_de_usuario(user_vendedor)  # RP15: de la sesión, nunca del body
        assert renglon.user_name == autor
        assert renglon.description == f"{autor} detuvo los recordatorios automáticos."
        resp = app_client.post(url, headers=auth(vendedor_token))
        assert resp.status_code == 409 and resp.json()["detail"] == SIN_PROGRAMAR
        resp = app_client.post(f"/api/v1/ventas/{ruta}/999999999/seguimiento/detener", headers=auth(vendedor_token))
        assert resp.status_code == 404
    # Un documento que ya no espera al cliente tampoco se detiene (409).
    sc2 = _sc(db, user_admin, estado="ASIGNADA")
    _fila(db, "SC", sc2)
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc2.id}/seguimiento/detener", headers=auth(vendedor_token))
    assert resp.status_code == 409 and resp.json()["detail"] == SIN_PROGRAMAR


# ─── 12 y 13. Sin enviar: apagado, fuera de horario, sin medios, plazo pasado ──────────────────────────────────────

def test_no_envia_si_apagado_fuera_de_horario_o_sin_medios(db, user_admin, monkeypatch):
    seg_mod = _sc_mod()
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc, proximo_at=DOMINGO - datetime.timedelta(hours=1))
    enviar = EnviarFalso()
    casos = [({"auto_activo": "false"}, {}, T, "apagado"),
             ({}, {}, DOMINGO, "fuera_de_horario"),
             ({}, {"smtp": False, "whatsapp": False}, T, "sin_medios")]
    for config, medios, ahora, omitido in casos:
        _dobles(monkeypatch, **medios)
        _config(db, **config)
        assert seg_mod.correr_seguimientos(db, ahora=ahora, enviar=enviar) == {"omitido": omitido}
        fila = _seg(db, "SC", sc.id)
        assert (fila.estado, fila.recordatorios_enviados) == ("ACTIVO", 0), omitido
        assert fila.proximo_at == DOMINGO - datetime.timedelta(hours=1), omitido
    assert enviar.llamadas == []
    # Fuera de horario no aplica si solo_horario está apagado; con un solo medio sí se envía.
    _dobles(monkeypatch, smtp=False, whatsapp=True)
    _config(db, solo_horario="false")
    assert seg_mod.correr_seguimientos(db, ahora=DOMINGO, enviar=enviar)["enviados"] == 1


def test_plazo_pasado(db, user_admin, monkeypatch):
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc, proximo_at=T - datetime.timedelta(days=4))
    enviar = EnviarFalso()
    res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    assert enviar.llamadas == [] and res["detenidos"] == 1
    fila = _seg(db, "SC", sc.id)
    assert (fila.estado, fila.motivo_fin) == ("DETENIDO", "PLAZO_PASADO")
    (renglon,) = _renglones(db, "SC", sc.id, "RECORDATORIO_FALLIDO")
    assert renglon.description == ("No se envió el recordatorio automático: venció hace más de 3 días sin poder "
                                   "enviarse. Escríbele al cliente si todavía aplica.")
    assert _tokens(db, "SC", sc.id) == []


# ─── C14: la cotización ────────────────────────────────────────────────────────────────────────────────────────────

def test_recordatorio_cot_vence_con_la_validez(db, monkeypatch):
    from app.core.fechas import hoy_colombia, vence_al_final_del_dia
    from app.models.erp_documents import SalesQuotation
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    valida_hasta = hoy_colombia(T) + datetime.timedelta(days=3)
    cot = _cot(db, estado="PENDIENTE_CONFIRMACION", valida_hasta=valida_hasta)
    _fila(db, "COT", cot, canal="Email")
    enviar = EnviarFalso()
    assert seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)["enviados"] == 1
    (token,) = _tokens(db, "COT", cot.id)
    assert token.token_hash == _hash_del_link(enviar.llamadas[0]["link"])
    assert token.expires_at == vence_al_final_del_dia(valida_hasta)
    db.expire_all()
    assert db.get(SalesQuotation, cot.id).valida_hasta == valida_hasta  # el recordatorio no renueva la validez
    (renglon,) = _renglones(db, "COT", cot.id, "RECORDATORIO_ENVIADO")
    assert renglon.description == "Recordatorio automático 1 de 1 enviado por correo con un enlace nuevo"
    assert [c["etiqueta"] for c in renglon.extra_data["cambios"]] == ["Canal de envío", "Correo", "Próximo paso"]


def test_cot_vencida_no_se_recuerda(db, monkeypatch):
    from app.core.fechas import fecha_larga, hoy_colombia
    from app.models.erp_documents import SalesQuotation
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    valida_hasta = hoy_colombia(T) - datetime.timedelta(days=1)
    cot = _cot(db, estado="PENDIENTE_CONFIRMACION", valida_hasta=valida_hasta)
    _fila(db, "COT", cot)
    enviar = EnviarFalso()
    res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    assert enviar.llamadas == [] and res["detenidos"] == 1
    fila = _seg(db, "COT", cot.id)
    assert (fila.estado, fila.motivo_fin, fila.proximo_at) == ("DETENIDO", "COTIZACION_VENCIDA", None)
    (renglon,) = _renglones(db, "COT", cot.id, "SEGUIMIENTO_DETENIDO")
    assert renglon.description == (f"La cotización venció el {fecha_larga(valida_hasta)} sin respuesta: re-cotízala "
                                   f"o reenvíala.")
    db.expire_all()
    assert db.get(SalesQuotation, cot.id).valida_hasta == valida_hasta
    assert _tokens(db, "COT", cot.id) == []
    # Vence al final de valida_hasta: el último día todavía se recuerda.
    cot2 = _cot(db, estado="PENDIENTE_CONFIRMACION", valida_hasta=hoy_colombia(T))
    _fila(db, "COT", cot2)
    assert seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)["enviados"] == 1


def test_enlace_anulado_no_se_recuerda(db, monkeypatch):
    """Paradas «al pasar» (T5/T6): si el enlace del documento se anuló sin sacarlo de Pendiente (cambió el cliente de
    la COT o de su SC: la Actividad le pide al asesor reenviarla), el recordatorio no le crea uno nuevo."""
    from app.core.confirmation_tokens import create_confirmation_token, revoke_pending_tokens
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    cot = _cot(db, estado="PENDIENTE_CONFIRMACION")
    create_confirmation_token(db, "COT", cot.id)
    revoke_pending_tokens(db, "COT", cot.id)
    _fila(db, "COT", cot)
    enviar = EnviarFalso()
    res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    assert enviar.llamadas == [] and res["detenidos"] == 1
    fila = _seg(db, "COT", cot.id)
    assert (fila.estado, fila.motivo_fin) == ("DETENIDO", "ENLACE_ANULADO")
    assert len(_tokens(db, "COT", cot.id)) == 1
    assert _renglones(db, "COT", cot.id, "SEGUIMIENTO_DETENIDO") == []
    # r1 (C2 = I2): sin falsos positivos. Un enlace vivo anterior (el del reenvío del asesor) y uno REVOCADO más nuevo
    # (el de un recordatorio que no salió): el cliente todavía tiene un enlace que sirve, así que el ciclo sigue.
    from app.core.confirmation_tokens import revocar_token
    cot2 = _cot(db, estado="PENDIENTE_CONFIRMACION")
    create_confirmation_token(db, "COT", cot2.id)
    revocar_token(db, create_confirmation_token(db, "COT", cot2.id))
    db.commit()
    _fila(db, "COT", cot2)
    assert seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)["enviados"] == 1
    assert _seg(db, "COT", cot2.id).motivo_fin is None and len(enviar.llamadas) == 1


# ─── 14 a 16. Configuración, detalles, alertas y cliente sin medio ─────────────────────────────────────────────────

def test_config_valida_limites(app_client, db, admin_token, vendedor_token):
    seg_mod = _sc_mod()
    _config(db)
    malos = [({"seguimiento_dias": "0"}, "Los días antes del recordatorio deben estar entre 1 y 15."),
             ({"seguimiento_dias": "16"}, "Los días antes del recordatorio deben estar entre 1 y 15."),
             ({"seguimiento_max": "6"}, "Los recordatorios deben ser entre 1 y 5."),
             ({"seguimiento_hora_inicio": "19", "seguimiento_hora_fin": "8"},
              "La hora final debe ser mayor que la inicial."),
             ({"seguimiento_hora_fin": "8"}, "La hora final debe ser mayor que la inicial."),  # con lo guardado (8)
             ({"seguimiento_auto_activo": "quizás"}, None),
             ({"seguimiento_dia": "3"}, "Clave de seguimiento desconocida: seguimiento_dia.")]  # r1 (C4): mal escrita
    for body, mensaje in malos:
        resp = app_client.patch("/api/v1/ventas/config", json={**body, "alerta_sc_dias": "97"},
                                headers=auth(admin_token))
        assert resp.status_code == 422, (body, resp.text)
        if mensaje:
            assert resp.json()["detail"] == mensaje, body
    assert seg_mod.leer_config(db) == CFG  # todo o nada: no se guardó nada
    assert db.execute(text("SELECT value FROM admin_config WHERE key = 'alerta_sc_dias'")).scalar() != "97"
    resp = app_client.patch("/api/v1/ventas/config", json={"seguimiento_dias": "3", "seguimiento_max": 2,
                                                            "seguimiento_solo_horario": "FALSE",
                                                            "seguimiento_hora_fin": "24"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert seg_mod.leer_config(db) == {**CFG, "dias": 3, "max": 2, "solo_horario": False, "hora_fin": 24}
    resp = app_client.get("/api/v1/ventas/config", headers=auth(vendedor_token))
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["seguimiento_dias"]["value"] == "3" and data["seguimiento_solo_horario"]["value"] == "false"
    for clave in seg_mod.CLAVES_CONFIG:
        assert clave in data, clave
    # validar_valor es pura (T13 la compara con validarConfigSeguimiento): normaliza o da el mensaje.
    assert seg_mod.validar_valor("seguimiento_dias", " 15 ") == "15"
    assert seg_mod.validar_valor("seguimiento_auto_activo", True) == "true"
    assert seg_mod.validar_valor("seguimiento_hora_inicio", 0) == "0"
    for clave, valor in (("seguimiento_max", "0"), ("seguimiento_hora_inicio", "24"), ("seguimiento_hora_fin", "0"),
                         ("seguimiento_dias", "2.5"), ("seguimiento_dias", True), ("seguimiento_solo_horario", 1)):
        try:
            seg_mod.validar_valor(clave, valor)
        except ValueError:
            continue
        raise AssertionError(f"{clave}={valor!r} debía rechazarse")
    # Al leer, un valor guardado fuera de rango usa el límite y uno que no es número, el defecto (R13).
    from app.core.admin_config import guardar_config
    guardar_config(db, {"seguimiento_dias": "40", "seguimiento_max": "abc", "seguimiento_hora_inicio": "20",
                        "seguimiento_hora_fin": "10"})
    cfg = seg_mod.leer_config(db)
    assert (cfg["dias"], cfg["max"], cfg["hora_inicio"], cfg["hora_fin"]) == (15, 1, 8, 18)


def test_detalle_y_alertas(app_client, db, admin_token, user_admin, monkeypatch):
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc, proximo_at=T + datetime.timedelta(days=1))
    resp = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token))
    assert resp.status_code == 200
    seguimiento = resp.json()["data"]["seguimiento"]
    assert seguimiento["proximo_at"].endswith("Z") and seguimiento["estado"] == "ACTIVO"
    assert set(seguimiento) == {"estado", "canal", "recordatorios_enviados", "max", "proximo_at",
                                "ultimo_recordatorio_at", "motivo_fin", "ultimo_resultado"}
    confirmada = _sc(db, user_admin, estado="CONFIRMADA")
    _fila(db, "SC", confirmada)
    resp = app_client.get(f"/api/v1/ventas/solicitudes/{confirmada.id}", headers=auth(admin_token))
    assert resp.json()["data"]["seguimiento"] is None
    cot = _cot(db, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "COT", cot, estado="DETENIDO", motivo_fin="MANUAL", proximo_at=None)
    resp = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token))
    assert resp.json()["data"]["seguimiento"]["motivo_fin"] == "MANUAL"
    # get_alertas: la SC atrasada con el seguimiento agotado lleva seguimiento_estado 'AGOTADO'.
    atrasada = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", atrasada, estado="AGOTADO", recordatorios_enviados=1, proximo_at=None)
    cot_atrasada = _cot(db, estado="PENDIENTE_CONFIRMACION")
    viejo = datetime.datetime(2026, 1, 1)
    db.execute(text("UPDATE customer_requests SET updated_at = :v WHERE id = :id"), {"v": viejo, "id": atrasada.id})
    db.execute(text("UPDATE sales_quotations SET updated_at = :v WHERE id = :id"), {"v": viejo, "id": cot_atrasada.id})
    db.commit()
    resp = app_client.get("/api/v1/ventas/alertas", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    (item,) = [s for s in data["sc_sin_atender"] if s["id"] == atrasada.id]
    assert item["seguimiento_estado"] == "AGOTADO"
    (item_cot,) = [c for c in data["cot_sin_atender"] if c["id"] == cot_atrasada.id]
    assert item_cot["seguimiento_estado"] is None
    assert all("seguimiento_estado" in s for s in data["sc_sin_atender"] + data["cot_sin_atender"])


def test_sin_medio_del_cliente(app_client, db, admin_token, user_admin, monkeypatch):
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, customer_email=None, customer_phone=None)
    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "Otro"})
    assert resp.status_code == 200, resp.text
    fila = _seg(db, "SC", sc.id)
    assert (fila.estado, fila.motivo_fin, fila.proximo_at) == ("DETENIDO", "SIN_MEDIO_CLIENTE", None)
    assert resp.json()["seguimiento"]["motivo_fin"] == "SIN_MEDIO_CLIENTE"
    (renglon,) = _renglones(db, "SC", sc.id, "ESTADO_CHANGED")
    assert renglon.extra_data["cambios"][-1] == {"etiqueta": ETIQUETA,
                                                 "despues": "no habrá: el cliente no tiene teléfono ni correo"}
    # medio_posible: el WhatsApp cuenta solo con un e164 válido (RP19); el correo de respaldo siempre cuenta.
    seg_mod = _sc_mod()
    from app.models.erp_documents import CustomerRequest
    assert seg_mod.medio_posible("WhatsApp", CustomerRequest(customer_phone="300123456")) is False
    assert seg_mod.medio_posible("WhatsApp", CustomerRequest(customer_phone=TELEFONO)) is True
    assert seg_mod.medio_posible("Otro", CustomerRequest(customer_phone=TELEFONO)) is False
    assert seg_mod.medio_posible(None, CustomerRequest(customer_email=CORREO)) is True


# ─── Registro en la revisión automática (RP7) y envío por defecto ──────────────────────────────────────────────────

def test_correr_una_vez_llama_a_correr_seguimientos_y_es_idempotente(db, user_admin, monkeypatch):
    """La entrada va AL FINAL de TAREAS (la purga de la Papelera sigue registrada). Con el registro real de esa entrada,
    dos revisiones seguidas mandan el recordatorio una sola vez y el resumen guardado solo tiene conteos."""
    import json
    from app.core import tareas_automaticas as ta
    seg_mod = _sc_mod()
    assert ta.TAREAS[0] == ("purga_papelera", "app.api.v1.erp_ventas:purgar_papelera_vencida")
    assert ta.TAREAS[-1] == ("seguimiento_confirmacion", "app.core.seguimiento_confirmacion:correr_seguimientos")
    monkeypatch.setattr(ta, "CLAVE_LOCK", 1_000_000_000 + uuid.uuid4().int % 1_000_000_000)
    monkeypatch.setattr(ta, "TAREAS", [e for e in ta.TAREAS if e[0] == "seguimiento_confirmacion"])
    _dobles(monkeypatch)
    _config(db)
    enviar = EnviarFalso()
    monkeypatch.setattr(seg_mod, "_enviar_por_defecto", enviar)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc)

    primera = ta.correr_una_vez(ahora=T)
    segunda = ta.correr_una_vez(ahora=T)
    assert primera["seguimiento_confirmacion"] == {"revisados": 1, "enviados": 1, "fallidos": 0, "agotados": 0,
                                                    "detenidos": 0}
    assert segunda["seguimiento_confirmacion"]["enviados"] == 0
    assert len(enviar.llamadas) == 1
    assert _seg(db, "SC", sc.id).recordatorios_enviados == 1
    guardado = db.execute(text("SELECT value FROM admin_config WHERE key = 'tareas_ultimo_resumen'")).scalar()
    assert json.loads(guardado)["seguimiento_confirmacion"] == segunda["seguimiento_confirmacion"]


def test_envio_por_defecto_con_plantilla_de_recordatorio(db, user_admin, monkeypatch):
    """_enviar_por_defecto (import perezoso, R20): WhatsApp con la plantilla 'recordatorio' (proposito SEGUIMIENTO) por el
    FakeChatwoot de T8 y el correo de respaldo con el asunto de SEGUIMIENTO (RP28). Nunca sale a Chatwoot real."""
    from test_envio_whatsapp_chatwoot import _en_ventana
    from app.models.envios import EnvioAlCliente
    seg_mod = _sc_mod()
    fake, correos = _chatwoot_falso(monkeypatch, db, _en_ventana(can_reply=False))
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc)

    res = seg_mod.correr_seguimientos(db, ahora=T)
    assert res["enviados"] == 1, res
    (vivo,) = _vivos(db, "SC", sc.id)
    cuerpo = fake.cuerpo("POST", "conversations/55/messages")
    params = cuerpo["template_params"]
    assert params["name"] == "recordatorio_confirmacion"
    link = params["processed_params"]["4"]
    assert _hash_del_link(link) == vivo.token_hash
    assert params["processed_params"]["2"] == f"solicitud {sc.numero}"
    ((to, asunto, html),) = correos
    assert to == CORREO and asunto == f"Recordatorio: confirma tu solicitud {sc.numero}" and link in html
    (envio,) = db.query(EnvioAlCliente).filter(EnvioAlCliente.document_type == "SC",
                                               EnvioAlCliente.document_id == sc.id).all()
    assert (envio.proposito, envio.estado, envio.user_name) == ("SEGUIMIENTO", "ENVIADO", seg_mod.USUARIO_SISTEMA)
    crudo = link.rsplit("/", 1)[-1]
    assert crudo not in envio.mensaje and "[enlace de confirmación]" in envio.mensaje  # el token nunca se guarda
    (renglon,) = _renglones(db, "SC", sc.id, "RECORDATORIO_ENVIADO")
    assert renglon.description == "Recordatorio automático 1 de 1 enviado por WhatsApp con un enlace nuevo"
    assert [c["etiqueta"] for c in renglon.extra_data["cambios"]] == ["Canal de envío", "WhatsApp", "Mensaje",
                                                                       "Correo de respaldo", "Próximo paso"]
    assert link not in str(renglon.extra_data)
    assert renglon.extra_data["whatsapp"]["envio_id"] == envio.id
    _sin_contactos_para_compras(renglon)  # r1 (P2)


# ─── Ronda r1 de la revisión ───────────────────────────────────────────────────────────────────────────────────────

E164 = "+573001234567"
LEGIBLE = "+57 300 123 4567"


def _chatwoot_falso(monkeypatch, db, respuestas, correo_sale=True):
    """Chatwoot ficticio (FakeChatwoot de T8 sobre _peticion, valores de entorno de relleno), correo falso y el WhatsApp
    automático listo con la plantilla de recordatorio. Devuelve (fake, correos)."""
    from test_envio_whatsapp_chatwoot import FakeChatwoot
    from app.core.admin_config import guardar_config
    import app.core.email as correo
    monkeypatch.setenv("CHATWOOT_BASE_URL", "https://chatwoot.invalid")
    monkeypatch.setenv("CHATWOOT_API_TOKEN", "token-de-prueba")
    monkeypatch.setenv("CHATWOOT_ACCOUNT_ID", "1")
    fake = FakeChatwoot(respuestas)
    monkeypatch.setattr("app.core.chatwoot._peticion", fake)
    correos = []
    monkeypatch.setattr(correo, "send_email",
                        lambda to, subject, html_body, **kw: correos.append((to, subject, html_body)) or correo_sale)
    monkeypatch.setattr(correo, "smtp_configurado", lambda: True)
    guardar_config(db, {"envio_whatsapp_automatico": "true", "envio_whatsapp_inbox_id": "3",
                        "envio_whatsapp_plantilla_recordatorio": "recordatorio_confirmacion",
                        "empresa_nombre_comercial": "Casa Prueba"})
    _config(db)
    return fake, correos


def _sin_contactos_para_compras(renglon):
    """P2: COMPRAS (sin acceso a los contactos) ve el renglón del recordatorio sin el correo ni el teléfono del cliente."""
    import json
    from app.api.v1.erp_ventas import _log_dict
    visto = _log_dict(renglon, "COMPRAS")
    texto = json.dumps(visto, ensure_ascii=False)
    for dato in ("@", E164, LEGIBLE, TELEFONO, "573001234567"):
        assert dato not in texto, (dato, texto)
    assert "destino" not in visto["extra_data"]["correo"]
    assert "destino" not in visto["extra_data"]["whatsapp"]
    # ADMIN sí los ve (el renglón los guarda; solo se ocultan al leerlo).
    assert "@" in json.dumps(_log_dict(renglon, "ADMIN"), ensure_ascii=False)


def test_contactos_ocultos_en_el_recordatorio_fallido(db, user_admin, monkeypatch):
    """P2: el RECORDATORIO_FALLIDO (Chatwoot rechaza el WhatsApp y el servidor de correo falla) tampoco le muestra a
    COMPRAS el correo ni el teléfono del cliente."""
    import app.core.chatwoot as cw
    from test_envio_whatsapp_chatwoot import _en_ventana
    seg_mod = _sc_mod()
    respuestas = _en_ventana(can_reply=False)
    respuestas[("POST", "conversations/55/messages")] = cw.ChatwootError(422, '{"message":"rechazado"}')
    _chatwoot_falso(monkeypatch, db, respuestas, correo_sale=False)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc)
    assert seg_mod.correr_seguimientos(db, ahora=T)["fallidos"] == 1
    (renglon,) = _renglones(db, "SC", sc.id, "RECORDATORIO_FALLIDO")
    assert renglon.extra_data["whatsapp"]["destino"] == E164 and renglon.extra_data["correo"]["destino"] == CORREO
    _sin_contactos_para_compras(renglon)
    assert _seg(db, "SC", sc.id).motivo_fin == "FALLO_ENVIO"


def test_la_fila_del_whatsapp_que_salio_no_se_pierde(db, user_admin, monkeypatch):
    """I3: si un paso posterior al WhatsApp lanza (aquí, el correo), la fila EnvioAlCliente del WhatsApp que ya salió
    queda guardada; el recordatorio queda DETENIDO (pudo haber salido) y no se reintenta."""
    import logging
    from test_envio_whatsapp_chatwoot import _en_ventana
    from app.models.envios import EnvioAlCliente
    seg_mod = _sc_mod()
    _chatwoot_falso(monkeypatch, db, _en_ventana(can_reply=False))
    monkeypatch.setattr(logging.getLogger(seg_mod.__name__), "disabled", True)

    def correo_que_lanza(*args, **kwargs):
        raise RuntimeError("falla a propósito después del WhatsApp")

    monkeypatch.setattr("app.api.v1.erp_ventas._enviar_correo_confirmacion", correo_que_lanza)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc)
    assert seg_mod.correr_seguimientos(db, ahora=T)["fallidos"] == 1
    db.expire_all()
    (envio,) = db.query(EnvioAlCliente).filter(EnvioAlCliente.document_type == "SC",
                                               EnvioAlCliente.document_id == sc.id).all()
    assert (envio.proposito, envio.estado) == ("SEGUIMIENTO", "ENVIADO")
    fila = _seg(db, "SC", sc.id)
    assert (fila.estado, fila.motivo_fin) == ("DETENIDO", "FALLO_ENVIO")
    assert len(_vivos(db, "SC", sc.id)) == 1  # el enlace que pudo llegarle sigue sirviendo


def _evento_reenvio(app_client, admin_token, db, doc, raw_viejo):
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{doc.id}/enviar-confirmacion", json={"canal": "Email"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


def _evento_parada_manual(app_client, admin_token, db, doc, raw_viejo):
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{doc.id}/seguimiento/detener", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


def _evento_confirmacion(app_client, admin_token, db, doc, raw_viejo):
    resp = app_client.post("/api/v1/confirmar/confirmar", json={"token": raw_viejo},
                           headers={"Idempotency-Key": f"t11c-{uuid.uuid4().hex[:8]}"})
    assert resp.status_code == 200, resp.text


def _evento_pedir_cambios(app_client, admin_token, db, doc, raw_viejo):
    resp = app_client.post("/api/v1/confirmar/pedir-cambios",
                           json={"token": raw_viejo, "comentario": "Quiero cambiar la cantidad de la cuna."},
                           headers={"Idempotency-Key": f"t11p-{uuid.uuid4().hex[:8]}"})
    assert resp.status_code == 200, resp.text


def _evento_cambio_de_cliente(app_client, admin_token, db, doc, raw_viejo):
    """Lo que hace PATCH /solicitudes/{id}/cliente: el contacto nuevo y el enlace de la SC anulado (la SC vuelve a
    Asignada)."""
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{doc.id}/cliente", json={"customer_email": "otro@test.com"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


def _evento_cliente_de_la_cot(app_client, admin_token, db, doc, raw_viejo):
    """Lo que hace update_cotizacion (T5) al cambiar el contacto de una COT pendiente: el dato nuevo y su enlace anulado,
    sin cambiar el estado."""
    from app.core.confirmation_tokens import revoke_pending_tokens
    from app.models.erp_documents import SalesQuotation
    cot = db.get(SalesQuotation, doc.id)
    cot.customer_email = "otro@test.com"
    revoke_pending_tokens(db, "COT", doc.id, commit=False)
    db.commit()


def _evento_identidad_sin_anular(app_client, admin_token, db, doc, raw_viejo):
    """Solo cambia el contacto (sin anular el enlace): lo detiene la comparación de la identidad del cliente."""
    from app.models.erp_documents import SalesQuotation
    db.get(SalesQuotation, doc.id).customer_phone = "3109876543"
    db.commit()


def test_carreras_entre_el_reclamo_y_el_envio(app_client, db, admin_token, user_admin, monkeypatch):
    """I4 = P4 e I5: dos recordatorios reclamados en la misma vuelta. Mientras sale el primero pasa algo con el segundo
    (el asesor lo reenvía o lo detiene, el cliente confirma, pide cambios o le cambian el contacto). Antes de crear su
    enlace se vuelve a mirar el documento con bloqueo: ese recordatorio no sale, no queda un enlace nuevo vivo y la fila
    queda con el motivo correcto."""
    from app.core.confirmation_tokens import create_confirmation_token
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    casos = [
        ("reenvío", "SC", _evento_reenvio, "ACTIVO", None),
        ("parada manual", "SC", _evento_parada_manual, "DETENIDO", "MANUAL"),
        ("confirmación", "SC", _evento_confirmacion, "DETENIDO", "CONFIRMADO"),
        ("pedir cambios", "SC", _evento_pedir_cambios, "DETENIDO", "VOLVIO_AL_ASESOR"),
        ("cambio de cliente", "SC", _evento_cambio_de_cliente, "DETENIDO", "VOLVIO_AL_ASESOR"),
        ("cliente de la COT", "COT", _evento_cliente_de_la_cot, "DETENIDO", "ENLACE_ANULADO"),
        ("identidad sin anular", "COT", _evento_identidad_sin_anular, "DETENIDO", "ENLACE_ANULADO"),
    ]
    for nombre, tipo, evento, estado, motivo in casos:
        primera = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
        segunda = (_sc(db, user_admin, estado="PENDIENTE_CONFIRMACION") if tipo == "SC"
                   else _cot(db, estado="PENDIENTE_CONFIRMACION"))
        raw_viejo = create_confirmation_token(db, tipo, segunda.id)
        _fila(db, "SC", primera, proximo_at=T - datetime.timedelta(hours=2))
        fila2 = _fila(db, tipo, segunda)
        iniciado_antes = fila2.iniciado_at
        tokens_antes = {t.id for t in _tokens(db, tipo, segunda.id)}
        doble = EnviarFalso()
        llamadas = []

        def enviar(db_, **kwargs):
            llamadas.append(kwargs["doc"].id)
            if kwargs["doc"].id == primera.id:
                evento(app_client, admin_token, db_, segunda, raw_viejo)
            return doble(db_, **kwargs)

        res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
        assert llamadas == [primera.id], nombre  # el segundo no sale
        assert (res["enviados"], res["detenidos"]) == (1, 1), (nombre, res)
        assert _renglones(db, tipo, segunda.id, "RECORDATORIO_ENVIADO") == [], nombre
        fila2 = _seg(db, tipo, segunda.id)
        assert (fila2.estado, fila2.motivo_fin) == (estado, motivo), nombre
        nuevos = [t for t in _tokens(db, tipo, segunda.id) if t.id not in tokens_antes]
        if nombre == "reenvío":
            # Ciclo nuevo del asesor: su enlace sigue vivo, el contador en 0 y no hay enlace del recordatorio.
            assert fila2.recordatorios_enviados == 0 and fila2.iniciado_at != iniciado_antes
            assert len(nuevos) == 1 and [t.id for t in _vivos(db, tipo, segunda.id)] == [nuevos[0].id]
        else:
            assert nuevos == [], nombre  # el recordatorio no creó su enlace
            if nombre not in ("parada manual", "identidad sin anular"):
                assert _vivos(db, tipo, segunda.id) == [], nombre


def test_confirmacion_durante_el_envio_anula_el_enlace_del_recordatorio(app_client, db, user_admin, monkeypatch):
    """Si el cliente confirma con el enlace viejo MIENTRAS sale el recordatorio de ese mismo documento, el enlace del
    recordatorio no queda vivo en una SC confirmada, la fila se detiene y no cuenta como contacto."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.erp_documents import CustomerRequest
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    raw_viejo = create_confirmation_token(db, "SC", sc.id)
    _fila(db, "SC", sc)
    doble = EnviarFalso()

    def enviar(db_, **kwargs):
        _evento_confirmacion(app_client, None, db_, sc, raw_viejo)
        return doble(db_, **kwargs)

    seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    db.expire_all()
    confirmada = db.get(CustomerRequest, sc.id)
    assert confirmada.estado == "CONFIRMADA" and confirmada.updated_at != T
    assert _vivos(db, "SC", sc.id) == []
    fila = _seg(db, "SC", sc.id)
    assert (fila.estado, fila.motivo_fin) == ("DETENIDO", "CONFIRMADO")
    assert len(_renglones(db, "SC", sc.id, "RECORDATORIO_ENVIADO")) == 1  # salió: queda en la Actividad


def test_cambio_real_de_cliente_por_patch_cliente(app_client, db, admin_token, user_admin, monkeypatch):
    """P1 de punta a punta (T5): la SC y su COT pendientes se envían, el asesor les cambia el correo con PATCH
    /solicitudes/{id}/cliente y vence el plazo. Ningún recordatorio sale ni crea un enlace para el contacto nuevo: la SC
    volvió a Asignada y el enlace de la COT quedó anulado."""
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    cot = _cot(db, estado="BORRADOR", sc_id=sc.id, sc_numero=sc.numero)
    assert _enviar_cot(app_client, admin_token, cot, {"canal": "Email"}).status_code == 200
    from app.models.confirmation import SeguimientoConfirmacion
    _fila(db, "SC", sc)  # la SC también tenía su recordatorio vencido
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}/cliente", json={"customer_email": "otro@test.com"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert cot.numero in resp.json()["enlaces_anulados"]
    db.query(SeguimientoConfirmacion).filter(SeguimientoConfirmacion.document_type == "COT",
                                             SeguimientoConfirmacion.document_id == cot.id).update(
        {"proximo_at": T - datetime.timedelta(hours=1)})
    db.commit()
    enviar = EnviarFalso()
    res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    assert enviar.llamadas == [] and res["detenidos"] == 2, res
    assert (_seg(db, "SC", sc.id).estado, _seg(db, "SC", sc.id).motivo_fin) == ("DETENIDO", "VOLVIO_AL_ASESOR")
    assert (_seg(db, "COT", cot.id).estado, _seg(db, "COT", cot.id).motivo_fin) == ("DETENIDO", "ENLACE_ANULADO")
    assert _vivos(db, "SC", sc.id) == [] and _vivos(db, "COT", cot.id) == []


# ─── Ronda r2 de la revisión ───────────────────────────────────────────────────────────────────────────────────────

def _nota_externa(app_client, admin_token, sc):
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/actividad", headers=auth(admin_token),
                           json={"action": "CHATTER", "tipo": "EXTERNA", "description": "Hablé con el cliente"})
    assert resp.status_code == 200, resp.text


def test_contacto_en_el_chatter_durante_la_vuelta_pospone(app_client, db, admin_token, user_admin, monkeypatch):
    """R23 (r2, punto 1): un contacto anotado en el Chatter entre el reclamo y el envío corre el recordatorio: no sale,
    el reclamo se devuelve (contador y último recordatorio de antes) y queda el proximo_at que puso el Chatter. Si el
    contacto llega mientras sale el recordatorio de ese mismo documento, el cierre no retrocede las fechas."""
    from app.models.erp_documents import CustomerRequest
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    primera = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    segunda = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", primera, proximo_at=T - datetime.timedelta(hours=2))
    _fila(db, "SC", segunda)
    doble = EnviarFalso()
    llamadas = []

    def enviar(db_, **kwargs):
        llamadas.append(kwargs["doc"].id)
        _nota_externa(app_client, admin_token, segunda)  # entre el reclamo y el envío de la segunda
        _nota_externa(app_client, admin_token, primera)  # mientras sale el de la primera
        return doble(db_, **kwargs)

    res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    assert llamadas == [primera.id] and (res["enviados"], res["detenidos"]) == (1, 1), res
    fila2 = _seg(db, "SC", segunda.id)
    assert (fila2.estado, fila2.recordatorios_enviados, fila2.ultimo_recordatorio_at) == ("ACTIVO", 0, None)
    assert fila2.ultimo_contacto_at > T  # el del Chatter, no retrocede al `ahora` de la vuelta
    assert fila2.proximo_at == seg_mod.siguiente_momento(fila2.ultimo_contacto_at, seg_mod.leer_config(db))
    assert _renglones(db, "SC", segunda.id, "RECORDATORIO_ENVIADO") == [] and _tokens(db, "SC", segunda.id) == []
    # El contacto llegó mientras salía el recordatorio de la primera: el cierre no baja las fechas del Chatter.
    fila1 = _seg(db, "SC", primera.id)
    assert fila1.recordatorios_enviados == 1 and fila1.ultimo_contacto_at > T
    db.expire_all()
    assert db.get(CustomerRequest, primera.id).updated_at > T
    assert len(_renglones(db, "SC", primera.id, "RECORDATORIO_ENVIADO")) == 1


class _Traza:
    """Las sentencias SQL y los commits de Session, en orden (sin los SAVEPOINT del runner)."""

    def __init__(self):
        self.pasos = []

    def __enter__(self):
        from sqlalchemy import event
        from sqlalchemy.engine import Engine
        from sqlalchemy.orm import Session
        event.listen(Engine, "before_cursor_execute", self._sql)
        event.listen(Session, "after_commit", self._commit)
        return self

    def __exit__(self, *exc):
        from sqlalchemy import event
        from sqlalchemy.engine import Engine
        from sqlalchemy.orm import Session
        event.remove(Engine, "before_cursor_execute", self._sql)
        event.remove(Session, "after_commit", self._commit)

    def _sql(self, conn, cursor, statement, parameters, context, executemany):
        s = " ".join(statement.split()).upper()
        if not s.startswith(("SAVEPOINT", "RELEASE SAVEPOINT", "ROLLBACK TO SAVEPOINT")):
            self.pasos.append(s)

    def _commit(self, session):
        self.pasos.append("COMMIT")


def test_traza_del_bloqueo_antes_de_enviar(db, user_admin, monkeypatch):
    """r2 (punto 2): después del reclamo y antes de llamar a enviar, la relectura bloquea el documento y DESPUÉS la
    fila (FOR UPDATE, no SKIP LOCKED), crea el enlace y confirma. Una relectura que tome la fila primero o sin bloqueo
    hace caer esta prueba."""
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc)
    doble = EnviarFalso()

    def enviar(db_, **kwargs):
        db_.execute(text("SELECT 'MARCA_ENVIAR'"))
        return doble(db_, **kwargs)

    with _Traza() as traza:
        assert seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)["enviados"] == 1
    pasos = traza.pasos
    reclamo = next(i for i, s in enumerate(pasos) if s.startswith("UPDATE SEGUIMIENTOS_CONFIRMACION SET RECORDATORIOS_ENVIADOS"))
    tras_reclamo = pasos.index("COMMIT", reclamo)
    marca = next(i for i, s in enumerate(pasos) if "MARCA_ENVIAR" in s)
    tramo = pasos[tras_reclamo + 1:marca]

    def primero(condicion, desde=0):
        return next(i for i in range(desde, len(tramo)) if condicion(tramo[i]))

    doc = primero(lambda s: "FROM CUSTOMER_REQUESTS" in s and s.endswith("FOR UPDATE"))
    fila = primero(lambda s: "FROM SEGUIMIENTOS_CONFIRMACION" in s and s.endswith("FOR UPDATE"))
    insercion = primero(lambda s: s.startswith("INSERT INTO DOCUMENT_CONFIRMATION_TOKENS"))
    commit = primero(lambda s: s == "COMMIT", insercion)
    assert doc < fila < insercion < commit, tramo
    assert not any("FROM SEGUIMIENTOS_CONFIRMACION" in s for s in tramo[:doc]), tramo  # la fila no se lee antes
    assert "COMMIT" not in tramo[doc:insercion], tramo  # los bloqueos siguen tomados al crear el enlace


def test_error_antes_de_enviar_conserva_el_proximo_del_chatter(app_client, db, admin_token, user_admin, monkeypatch):
    """r3: un contacto EXTERNA en el Chatter entre el reclamo y el envío, y después un error ANTES de enviar (aquí en
    _bloquear, como un 57014): el reclamo se devuelve SIN pisar el proximo_at que puso el Chatter, así que la vuelta
    siguiente, 10 minutos después, no le escribe al cliente que acaba de hablar con el asesor (R23)."""
    import logging
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    monkeypatch.setattr(logging.getLogger(seg_mod.__name__), "disabled", True)
    primera = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    segunda = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", primera, proximo_at=T - datetime.timedelta(hours=2))
    _fila(db, "SC", segunda)
    original = seg_mod._bloquear
    hubo_contacto = []

    def bloquear(db_, reclamo):
        if hubo_contacto and reclamo.doc_id == segunda.id:
            raise RuntimeError("falla a propósito esperando el bloqueo")
        return original(db_, reclamo)

    monkeypatch.setattr(seg_mod, "_bloquear", bloquear)
    doble = EnviarFalso()

    def enviar(db_, **kwargs):
        _nota_externa(app_client, admin_token, segunda)  # mientras sale la primera
        hubo_contacto.append(True)
        return doble(db_, **kwargs)

    res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    assert (res["enviados"], res["fallidos"]) == (1, 1), res
    fila2 = _seg(db, "SC", segunda.id)
    assert (fila2.estado, fila2.recordatorios_enviados, fila2.ultimo_recordatorio_at) == ("ACTIVO", 0, None)
    assert fila2.proximo_at == seg_mod.siguiente_momento(fila2.ultimo_contacto_at, seg_mod.leer_config(db))
    assert fila2.proximo_at > T + datetime.timedelta(minutes=10)
    assert fila2.ultimo_resultado["mensaje"] == "No salió: error del sistema antes de enviarlo."
    monkeypatch.setattr(seg_mod, "_bloquear", original)
    otra = EnviarFalso()
    assert seg_mod.correr_seguimientos(db, ahora=T + datetime.timedelta(minutes=10), enviar=otra)["enviados"] == 0
    assert otra.llamadas == [] and _tokens(db, "SC", segunda.id) == []


def test_error_antes_de_enviar_no_dice_revisa_si_le_llego(db, user_admin, monkeypatch):
    """r2 (punto 3): si la preparación falla ANTES de enviar (aquí, al crear el enlace), no salió nada: el renglón y la
    fila dicen «No salió: error del sistema antes de enviarlo.» (nunca «Revisa si le llegó»), la fila no queda
    DETENIDO sino lista para la vuelta siguiente (el reclamo se devuelve) y no se repite el renglón si vuelve a fallar."""
    import logging
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    monkeypatch.setattr(logging.getLogger(seg_mod.__name__), "disabled", True)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    vencido = T - datetime.timedelta(hours=1)
    _fila(db, "SC", sc, proximo_at=vencido)
    original = seg_mod.create_confirmation_token

    def falla(*args, **kwargs):
        raise RuntimeError("falla a propósito al crear el enlace")

    monkeypatch.setattr(seg_mod, "create_confirmation_token", falla)
    enviar = EnviarFalso()
    for vuelta in range(2):
        res = seg_mod.correr_seguimientos(db, ahora=T + datetime.timedelta(minutes=10 * vuelta), enviar=enviar)
        assert res["fallidos"] == 1 and enviar.llamadas == [], (vuelta, res)
        fila = _seg(db, "SC", sc.id)
        assert (fila.estado, fila.recordatorios_enviados, fila.motivo_fin) == ("ACTIVO", 0, None), vuelta
        assert fila.proximo_at == vencido and fila.ultimo_recordatorio_at is None, vuelta
        assert fila.ultimo_resultado["mensaje"] == "No salió: error del sistema antes de enviarlo."
    (renglon,) = _renglones(db, "SC", sc.id, "RECORDATORIO_FALLIDO")  # una sola vez, aunque falló dos
    assert renglon.description == "No salió: error del sistema antes de enviarlo."
    assert "Revisa si le llegó" not in renglon.description
    assert _tokens(db, "SC", sc.id) == []
    # Arreglado el error, la vuelta siguiente lo envía.
    monkeypatch.setattr(seg_mod, "create_confirmation_token", original)
    assert seg_mod.correr_seguimientos(db, ahora=T + datetime.timedelta(minutes=20), enviar=enviar)["enviados"] == 1


# ─── T20, Paso 1 (revisión de seguridad) ────────────────────────────────────────────────────────────────────

def test_el_destino_del_recordatorio_es_la_foto_tomada_con_el_bloqueo(db, user_admin, monkeypatch):
    """T20 (M6): _preparar_envio revisa la identidad del cliente con el documento bloqueado y, antes del commit que
    suelta el bloqueo, guarda una foto del destino (número, nombre, correo, teléfono y validez). El envío usa esa foto:
    si justo después del commit otra sesión cambia el cliente, el mensaje sale al mismo destino que se revisó, nunca a
    los datos releídos sin bloqueo de un objeto expirado (el enlace que lleva es el de esa persona; si el cambio pasó
    por update_*, ese enlace ya quedó revocado)."""
    from app.models.erp_documents import CustomerRequest
    seg_mod = _sc_mod()
    llamadas = _dobles(monkeypatch, whatsapp=True)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc)
    real = seg_mod._preparar_envio

    def preparar_y_cambiar_el_cliente(db_, reclamo, ahora):
        preparado = real(db_, reclamo, ahora)
        # Otra transacción cambia el cliente y confirma justo después del commit que soltó el bloqueo. Va con SQL directo
        # y en esta misma sesión: el documento queda expirado, como en producción (otra conexión no toca este mapa de
        # identidad). En el runner, una segunda Session sobre la misma conexión recargaba el objeto expirado antes del
        # UPDATE (se vio en el diagnóstico de T20) y ocultaba el error.
        db_.execute(text("UPDATE customer_requests SET customer_name = :n, customer_email = :e, customer_phone = :t "
                         "WHERE id = :id"), {"n": "Cliente Nuevo", "e": "nuevo@test.com", "t": "3109876543",
                                             "id": sc.id})
        db_.commit()
        return preparado

    monkeypatch.setattr(seg_mod, "_preparar_envio", preparar_y_cambiar_el_cliente)
    res = seg_mod.correr_seguimientos(db, ahora=T)
    assert res["enviados"] == 1, res
    [wa] = llamadas["whatsapp"]
    assert (wa["cliente_nombre"], wa["cliente_email"], wa["telefono"]) == ("Cliente Prueba", CORREO, TELEFONO), wa
    assert wa["doc_id"] == sc.id and wa["doc_numero"] == sc.numero
    [correo] = llamadas["correos"]
    assert correo["to"] == CORREO
    db.expire_all()
    assert db.get(CustomerRequest, sc.id).customer_email == "nuevo@test.com"  # el cambio sí quedó
    # T20 r3 (M12): este cambio no pasó por update_* ni por PATCH /cliente, así que nadie más revocó el enlace: lo
    # revoca el paso 3 (M6), que vuelve a comparar la identidad con el bloqueo, y la fila se cierra con ENLACE_ANULADO.
    (enlace,) = _tokens(db, "SC", sc.id)
    assert enlace.token_hash == _hash_del_link(wa["enlace"]) and enlace.resultado == "REVOCADO"
    fila = _seg(db, "SC", sc.id)
    assert (fila.estado, fila.motivo_fin) == ("DETENIDO", "ENLACE_ANULADO")


def test_el_cambio_de_cliente_por_la_api_revoca_el_enlace_del_recordatorio(app_client, db, admin_token, user_admin,
                                                                          monkeypatch):
    """T20 r3 (M12): la otra mitad de la opción «sale»: el recordatorio sale sin cambios de por medio y su enlace queda
    vivo; después, un cambio de cliente por la API (PATCH /solicitudes/{id}/cliente) lo revoca, y su página ya no dice
    nada de la SC ni del cliente."""
    seg_mod = _sc_mod()
    llamadas = _dobles(monkeypatch, whatsapp=True)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc)
    assert seg_mod.correr_seguimientos(db, ahora=T)["enviados"] == 1
    [wa] = llamadas["whatsapp"]
    (enlace,) = _tokens(db, "SC", sc.id)
    assert enlace.token_hash == _hash_del_link(wa["enlace"]) and enlace.used_at is None  # vivo
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}/cliente", json={"customer_email": "otro@test.com"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (enlace,) = _tokens(db, "SC", sc.id)
    assert enlace.resultado == "REVOCADO"
    raw = wa["enlace"].rstrip("/").rsplit("/", 1)[-1]
    resp = app_client.post("/api/v1/confirmar/ver", json={"token": raw})
    assert resp.status_code == 400 and resp.json()["detail"]["estado_enlace"] == "no_disponible", resp.text
    assert "otro@test.com" not in resp.text and "Cliente Prueba" not in resp.text


def test_si_cambia_el_cliente_mientras_sale_no_cuenta_como_contacto(app_client, db, admin_token, monkeypatch):
    """T20 r2 (M6): el paso 3 vuelve a comparar la identidad con el documento bloqueado. Si el cliente de la COT cambió
    mientras salía el recordatorio (update_cotizacion revocó el enlace nuevo y la COT sigue en Pendiente), el
    recordatorio no cuenta como contacto ni programa otro: la fila se cierra con ENLACE_ANULADO y el renglón dice que
    salió al cliente anterior con un enlace que ya quedó anulado."""
    from app.core.fechas import hoy_colombia
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    cot = _cot(db, estado="PENDIENTE_CONFIRMACION", valida_hasta=hoy_colombia(T) + datetime.timedelta(days=3))
    fila = _fila(db, "COT", cot, canal="Email")
    contacto_antes = fila.ultimo_contacto_at
    enviar = EnviarFalso()
    real = seg_mod._preparar_envio

    def preparar_y_cambiar_el_cliente(db_, reclamo, ahora):
        preparado = real(db_, reclamo, ahora)
        resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}",
                                json={"customer_name": "Cliente Nuevo", "customer_email": "nuevo@test.com",
                                      "updated_by": "t"}, headers=auth(admin_token))
        assert resp.status_code == 200, resp.text
        # T20 r3 (M3, M10): update_cotizacion puso updated_at en la hora real (posterior a T); se lleva antes de T para
        # que adelantarlo (el contacto de R7) sea posible y la prueba lo vea si pasara.
        db_.execute(text("UPDATE sales_quotations SET updated_at = :v WHERE id = :id"),
                    {"v": ANTES_DE_T, "id": cot.id})
        db_.commit()
        return preparado

    ANTES_DE_T = T - datetime.timedelta(days=1)
    monkeypatch.setattr(seg_mod, "_preparar_envio", preparar_y_cambiar_el_cliente)
    res = seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)
    assert res["enviados"] == 1, res  # salió (al cliente anterior)
    assert enviar.llamadas[0]["doc_id"] == cot.id
    fila = _seg(db, "COT", cot.id)
    assert (fila.estado, fila.motivo_fin, fila.proximo_at) == ("DETENIDO", "ENLACE_ANULADO", None)
    assert fila.ultimo_contacto_at == contacto_antes  # no cuenta como contacto
    (renglon,) = _renglones(db, "COT", cot.id, "RECORDATORIO_ENVIADO")
    assert "cliente anterior" in renglon.description and "anulado" in renglon.description, renglon.description
    assert "Próximo paso" not in [c["etiqueta"] for c in renglon.extra_data["cambios"]]
    assert _vivos(db, "COT", cot.id) == []  # el enlace nuevo quedó revocado por el cambio de cliente
    from app.models.erp_documents import SalesQuotation
    db.expire_all()
    assert db.get(SalesQuotation, cot.id).updated_at == ANTES_DE_T  # R7: tampoco cuenta como contacto


def test_recotizar_y_cambiar_el_cliente_mientras_sale_lo_dice(app_client, db, admin_token, monkeypatch):
    """T20 r3 (M2): la identidad se compara también fuera de Pendiente. Si mientras salía el recordatorio un PATCH
    re-cotizó (la COT vuelve a Borrador) y cambió el cliente, el renglón dice que salió al cliente anterior con un
    enlace anulado, y la fila se cierra con ENLACE_ANULADO (ruling), no con el motivo del estado."""
    from app.core.fechas import hoy_colombia
    seg_mod = _sc_mod()
    _dobles(monkeypatch)
    _config(db)
    cot = _cot(db, estado="PENDIENTE_CONFIRMACION", valida_hasta=hoy_colombia(T) + datetime.timedelta(days=3))
    _fila(db, "COT", cot, canal="Email")
    enviar = EnviarFalso()
    real = seg_mod._preparar_envio

    def preparar_y_recotizar(db_, reclamo, ahora):
        preparado = real(db_, reclamo, ahora)
        resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
            "productos": [{**LINEA, "unit_price_cop": 2000, "total_cop": 2000}], "subtotal_cop": 2000,
            "total_cop": 2000, "recotizacion": True, "anular_confirmacion": True,
            "motivo_recotizacion": "Cambió el precio del proveedor",
            "customer_name": "Cliente Nuevo", "customer_email": "nuevo@test.com", "updated_by": "t"},
            headers=auth(admin_token))
        assert resp.status_code == 200, resp.text
        return preparado

    monkeypatch.setattr(seg_mod, "_preparar_envio", preparar_y_recotizar)
    assert seg_mod.correr_seguimientos(db, ahora=T, enviar=enviar)["enviados"] == 1
    fila = _seg(db, "COT", cot.id)
    assert (fila.estado, fila.motivo_fin) == ("DETENIDO", "ENLACE_ANULADO")
    (renglon,) = _renglones(db, "COT", cot.id, "RECORDATORIO_ENVIADO")
    assert "cliente anterior" in renglon.description and "con un enlace nuevo" not in renglon.description, \
        renglon.description


# ─── Revisión final del Bloque 3, ronda F1 ──────────────────────────────────────────────────────────────────

def test_reenviar_la_sc_con_su_cot_pendiente_no_reactiva_su_recordatorio(app_client, db, admin_token, user_admin,
                                                                          monkeypatch):
    """F1 (M2, U11): «el cliente recibe uno solo» en los dos sentidos. Al reenviar la SC mientras su COT temprana
    espera al cliente, el recordatorio de la SC queda DETENIDO (COTIZACION_ENVIADA), como al enviar la COT; sin una
    COT pendiente, el reenvío lo programa como siempre."""
    _dobles(monkeypatch)
    _config(db)
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    _fila(db, "SC", sc, estado="DETENIDO", motivo_fin="COTIZACION_ENVIADA", proximo_at=None, terminado_at=T)
    cot = _cot(db, sc_id=sc.id, sc_numero=sc.numero, estado="PENDIENTE_CONFIRMACION")
    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "Email"})
    assert resp.status_code == 200, resp.text
    fila = _seg(db, "SC", sc.id)
    assert (fila.estado, fila.motivo_fin, fila.proximo_at) == ("DETENIDO", "COTIZACION_ENVIADA", None)
    assert resp.json()["seguimiento"]["estado"] == "DETENIDO"
    assert resp.json()["seguimiento"]["motivo_fin"] == "COTIZACION_ENVIADA"
    assert _seg(db, "COT", cot.id) is None  # el de la COT no se toca

    cot.estado = "BORRADOR"  # el cliente pidió cambios en la COT: ya no espera respuesta
    db.commit()
    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "Email"})
    assert resp.status_code == 200, resp.text
    assert _seg(db, "SC", sc.id).estado == "ACTIVO"
