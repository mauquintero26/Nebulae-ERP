"""U18+H31+H33 (Bloque 2, T2B): cancelar y restaurar la solicitud quedan completos en la Actividad.

- cancelar_solicitud: el renglon CANCELLED ('Cancelada: {motivo}') trae en extra_data el motivo, el estado anterior, el
  enlace anulado, la confirmacion anulada, el cliente perdido en el CRM y que pasa en la Papelera, con sus 'cambios'
  (sin clave 'campo'). El motivo ya NO se pega en las notas. Un solo db.commit(); el lead se mueve en un savepoint y, si
  falla, el renglon lo dice ('No se pudo marcar como perdido') sin perder la cancelacion.
- restaurar_solicitud (sobre el Bloque 1, R34): conserva sus dos 409; queda Asignada con asesor o Nueva sin el, en una
  sola escritura; RESTORED con sus cambios; el lead vuelve a la etapa inicial del pipeline; respuesta con 'mensaje'.
- get_solicitud de una cancelada: se_conserva_en_papelera y purga_programada (None si se conserva o sin eliminada_at).
- eliminar_permanente y la purga de la Papelera dejan DELETED / PURGED en el mismo commit del borrado.
- scripts/limpiar_motivo_en_notas.py: quita el '[CANCELADA] Razón: X' de las notas viejas (solo si X es un motivo de
  esa SC), con respaldo, modo reporte por defecto, idempotente y sin tocar los documentos reales (R32).
Ninguna etiqueta de estado va escrita a mano: siempre etiqueta_estado(...).

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_cancelacion_solicitud_actividad
"""
import contextlib
import datetime
import io
import uuid
from zoneinfo import ZoneInfo

import pytest

LINEA = {"product_name": "Cuna Colecho", "qty": 1}
TABLA_NOTAS_TEST = "customer_requests_respaldo_notas_test"
AHORA = datetime.datetime.utcnow
MARCA = "[CANCELADA] Razón: "


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _etiqueta(estado):
    from app.core.textos_actividad import etiqueta_estado
    return etiqueta_estado("SC", estado)


def _sc(db, numero, user_admin, con_asesor=True, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    campos.setdefault("productos", [LINEA])
    if con_asesor:
        campos.setdefault("advisor_user_id", user_admin.id)
        campos.setdefault("advisor_name", user_admin.email)
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, sc, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    cot = SalesQuotation(numero=numero, sc_id=sc.id, sc_numero=sc.numero, customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _ven(db, numero, sc, **campos):
    from app.models.erp_documents import SaleOrder
    campos.setdefault("estado", "CANCELADO")
    ven = SaleOrder(numero=numero, sc_id=sc.id, customer_name="Cliente Prueba", **campos)
    db.add(ven); db.commit(); db.refresh(ven)
    return ven


def _lead(db, sc, status="DRAFT"):
    """Un lead del CRM (tabla sales_orders) enlazado a la SC por canonical_customer_request_id."""
    from app.models.customers import Customer
    from app.models.sales import SalesOrder
    cliente = Customer(first_name="Cliente", last_name="T2B", email=f"t2b-{uuid.uuid4().hex[:8]}@test.nebulae")
    db.add(cliente); db.commit()
    lead = SalesOrder(customer_id=cliente.id, status=status, canonical_customer_request_id=sc.id, lead_source="SC",
                      lead_description=f"SC creada: {sc.numero}")
    db.add(lead); db.commit(); db.refresh(lead)
    return lead


def _cancelar(app_client, token, sc_id, razon="El cliente ya no la necesita", user_name="asesor@test"):
    return app_client.post(f"/api/v1/ventas/solicitudes/{sc_id}/cancelar",
                           json={"razon": razon, "user_name": user_name}, headers=auth(token))


def _restaurar(app_client, token, sc_id):
    return app_client.post(f"/api/v1/ventas/solicitudes/{sc_id}/restaurar", headers=auth(token))


def _detalle(app_client, token, sc_id):
    resp = app_client.get(f"/api/v1/ventas/solicitudes/{sc_id}", headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _logs(db, entity_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == "SC", ActivityLog.entity_id == entity_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def _cambios(log):
    """[(etiqueta, despues)] del renglon; ninguno lleva la clave 'campo' (C1: como _detalle_envio)."""
    cambios = (log.extra_data or {}).get("cambios")
    assert isinstance(cambios, list), log.extra_data
    assert all("campo" not in c for c in cambios), cambios
    return [(c["etiqueta"], c["despues"]) for c in cambios]


def _fecha_purga(eliminada_at):
    """eliminada_at (UTC sin zona) + 30 dias, en hora de Colombia, dd/mm/aaaa."""
    fecha = (eliminada_at + datetime.timedelta(days=30)).replace(tzinfo=datetime.timezone.utc)
    return fecha.astimezone(ZoneInfo("America/Bogota")).strftime("%d/%m/%Y")


def _purga_iso(eliminada_at):
    return (eliminada_at + datetime.timedelta(days=30)).isoformat() + "Z"


def _token_usado(db, raw):
    import hashlib
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    return db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.token_hash == hashlib.sha256(raw.encode()).hexdigest()).first().used_at is not None


def _commits_del_api(db, monkeypatch):
    """Lista que recibe un elemento por cada Session.commit() de las sesiones del API (no la de la prueba). La salida
    de un `with db.begin_nested()` no es un Session.commit(): no se cuenta."""
    from sqlalchemy.orm import Session
    commit_real = Session.commit
    llamadas = []

    def contar(self):
        if self is not db:
            llamadas.append(1)
        return commit_real(self)

    monkeypatch.setattr(Session, "commit", contar)
    return llamadas


# ─── confirmation_tokens.contar_tokens_vigentes ───────────────────────────────────────────────────────────────

def test_contar_tokens_vigentes_cuenta_solo_los_que_el_cliente_puede_usar(db, user_admin):
    from app.core.confirmation_tokens import contar_tokens_vigentes, create_confirmation_token
    from app.models.confirmation import DocumentConfirmationToken
    sc = _sc(db, "SC-T2B001", user_admin)
    assert contar_tokens_vigentes(db, "SC", sc.id) == 0
    create_confirmation_token(db, "SC", sc.id)                       # vigente
    create_confirmation_token(db, "SC", sc.id)                       # vigente
    create_confirmation_token(db, "COT", sc.id)                      # de otro tipo de documento
    filas = (db.query(DocumentConfirmationToken)
             .filter(DocumentConfirmationToken.document_type == "SC", DocumentConfirmationToken.document_id == sc.id)
             .order_by(DocumentConfirmationToken.id.asc()).all())
    assert contar_tokens_vigentes(db, "SC", sc.id) == 2
    filas[0].used_at = AHORA()                                       # usado (o revocado)
    create_confirmation_token(db, "SC", sc.id)
    vencido = (db.query(DocumentConfirmationToken)
               .filter(DocumentConfirmationToken.document_type == "SC", DocumentConfirmationToken.document_id == sc.id)
               .order_by(DocumentConfirmationToken.id.desc()).first())
    vencido.expires_at = AHORA() - datetime.timedelta(minutes=1)      # vencido
    db.commit()
    assert contar_tokens_vigentes(db, "SC", sc.id) == 1


# ─── cancelar_solicitud: todo en la Actividad ─────────────────────────────────────────────────────────────────

def test_cancelar_registra_motivo_estado_enlace_y_papelera(app_client, db, admin_token, user_admin):
    """H31-1 + H33-1: con un enlace vivo (Pendiente por confirmación). Las notas quedan como las escribió el asesor."""
    sc = _sc(db, "SC-T2B002", user_admin, customer_email="cliente@test.com", notas="Entregar en obra")
    envio = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "t"},
                            headers=auth(admin_token))
    assert envio.status_code == 200, envio.text
    raw = envio.json()["link_confirmacion"].rsplit("/", 1)[-1]

    resp = _cancelar(app_client, admin_token, sc.id)
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"] == {"id": sc.id, "estado": "CANCELADA", "razon": "El cliente ya no la necesita"}
    db.refresh(sc)
    assert sc.estado == "CANCELADA" and sc.razon_cancelacion == "El cliente ya no la necesita"
    assert sc.notas == "Entregar en obra"  # R3: el motivo ya no se pega en las notas
    assert sc.gate1_confirmed_at is None and sc.eliminada_at is not None
    assert _token_usado(db, raw)

    (log,) = _logs(db, sc.id, "CANCELLED")
    assert log.description == "Cancelada: El cliente ya no la necesita"
    assert (log.old_estado, log.new_estado, log.user_name) == ("PENDIENTE_CONFIRMACION", "CANCELADA", "asesor@test")
    assert _cambios(log) == [
        ("Motivo", "El cliente ya no la necesita"),
        ("Estado anterior", _etiqueta("PENDIENTE_CONFIRMACION")),
        ("Enlace de confirmación", "Anulado: el cliente ya no puede confirmar con el enlace que recibió"),
        ("Papelera", f"Se elimina definitivamente el {_fecha_purga(sc.eliminada_at)} si no se restaura"),
    ]
    extra = {k: v for k, v in log.extra_data.items() if k != "cambios"}
    assert extra == {"motivo": "El cliente ya no la necesita", "estado_anterior": "PENDIENTE_CONFIRMACION",
                     "enlace_anulado": True, "confirmacion_anulada": False, "lead_perdido": False,
                     "se_conserva": False, "purga_programada": _purga_iso(sc.eliminada_at)}


def test_cancelar_sin_enlace_no_menciona_el_enlace(app_client, db, admin_token, user_admin):
    """H33-2: sin enlace vigente (uno usado y uno vencido no cuentan) no hay renglón 'Enlace de confirmación'."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.confirmation import DocumentConfirmationToken
    sc = _sc(db, "SC-T2B003", user_admin, con_asesor=False, estado="BORRADOR")
    create_confirmation_token(db, "SC", sc.id)
    create_confirmation_token(db, "SC", sc.id)
    usado, vencido = (db.query(DocumentConfirmationToken)
                      .filter(DocumentConfirmationToken.document_type == "SC", DocumentConfirmationToken.document_id == sc.id)
                      .order_by(DocumentConfirmationToken.id.asc()).all())
    usado.used_at = AHORA()
    vencido.expires_at = AHORA() - datetime.timedelta(hours=1)
    db.commit()
    assert _cancelar(app_client, admin_token, sc.id, "Ya no lo quiere").status_code == 200
    (log,) = _logs(db, sc.id, "CANCELLED")
    assert [e for e, _ in _cambios(log)] == ["Motivo", "Estado anterior", "Papelera"]
    assert dict(_cambios(log))["Estado anterior"] == _etiqueta("BORRADOR")
    assert log.extra_data["enlace_anulado"] is False


def test_cancelar_con_lead_registra_cliente_perdido(app_client, db, admin_token, user_admin):
    """H31-2: el lead del CRM queda perdido y el renglón lo dice ('Cliente en el CRM'). Una SC con lead se conserva
    en la Papelera (es historial)."""
    from app.models.customers import Customer
    from app.models.sales import SalesOrder
    cliente = Customer(first_name="Cliente", last_name=f"T2B-{uuid.uuid4().hex[:6]}",
                       email=f"t2b_{uuid.uuid4().hex[:6]}@test.com")
    db.add(cliente); db.commit(); db.refresh(cliente)
    sc = _sc(db, "SC-T2B004", user_admin, customer_id=cliente.id)
    lead = app_client.post("/api/v1/crm/leads", json={"customer_id": cliente.id, "sc_id": sc.id,
                                                      "solicitud_tipo": "Cotizacion de Producto"},
                           headers=auth(admin_token))
    assert lead.status_code in (200, 201), lead.text
    lead_id = lead.json()["data"]["id"]

    assert _cancelar(app_client, admin_token, sc.id).status_code == 200
    db.expire_all()
    assert db.get(SalesOrder, lead_id).status == "CANCELLED"
    (log,) = _logs(db, sc.id, "CANCELLED")
    assert _cambios(log)[-2:] == [("Cliente en el CRM", "Marcado como perdido"),
                                  ("Papelera", "Se conserva como historial (tiene lead del CRM)")]
    assert log.extra_data["lead_perdido"] is True
    assert log.extra_data["se_conserva"] is True and log.extra_data["purga_programada"] is None


def test_cancelar_sc_confirmada_registra_confirmacion_anulada(app_client, db, admin_token, user_admin):
    """H31-3: SC Confirmada por el cliente (gate1) y sin documentos."""
    sc = _sc(db, "SC-T2B005", user_admin, estado="CONFIRMADA", gate1_confirmed_at=AHORA())
    assert _cancelar(app_client, admin_token, sc.id).status_code == 200
    db.refresh(sc)
    assert sc.gate1_confirmed_at is None
    (log,) = _logs(db, sc.id, "CANCELLED")
    cambios = _cambios(log)
    assert [e for e, _ in cambios] == ["Motivo", "Estado anterior", "Confirmación del cliente", "Papelera"]
    assert dict(cambios)["Confirmación del cliente"] == "Anulada"
    assert dict(cambios)["Estado anterior"] == _etiqueta("CONFIRMADA")
    assert log.extra_data["confirmacion_anulada"] is True


def test_cancelar_si_falla_el_lead_la_solicitud_igual_queda_cancelada(app_client, db, admin_token, user_admin,
                                                                       monkeypatch):
    """Ruling T2B-1: el lead se mueve en un savepoint. Si falla (aqui, despues de escribir en la base), se deshace solo
    lo del lead: la SC queda cancelada y el renglón dice 'No se pudo marcar como perdido'."""
    import app.api.v1.erp_ventas as m
    from app.models.sales import SalesOrder
    sc = _sc(db, "SC-T2B006", user_admin)
    lead = _lead(db, sc, status="DRAFT")

    def mover_que_falla(sc_id, status, sesion, commit=True):
        sesion.query(SalesOrder).filter(SalesOrder.id == lead.id).update({"status": "EN_NEGOCIACION"})
        raise RuntimeError("fallo simulado del CRM")

    monkeypatch.setattr(m, "mover_lead_de_solicitud", mover_que_falla)
    resp = _cancelar(app_client, admin_token, sc.id)
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CANCELADA" and sc.eliminada_at is not None
    db.expire_all()
    assert db.get(SalesOrder, lead.id).status == "DRAFT"  # el savepoint deshizo lo que alcanzo a escribir
    (log,) = _logs(db, sc.id, "CANCELLED")
    assert ("Cliente en el CRM", "No se pudo marcar como perdido") in _cambios(log)
    assert log.extra_data["lead_perdido"] is False


def test_enviar_a_papelera_una_sc_ya_cancelada_registra_la_papelera(app_client, db, admin_token, user_admin):
    """Rama SENT_TO_TRASH de N4 (SC cancelada con la pastilla vieja): el mismo renglón 'Papelera'."""
    sc = _sc(db, "SC-T2B007", user_admin, estado="CANCELADA", notas="Nota")
    assert _cancelar(app_client, admin_token, sc.id, "Pastilla vieja").status_code == 200
    db.refresh(sc)
    assert sc.notas == "Nota"
    (log,) = _logs(db, sc.id, "SENT_TO_TRASH")
    assert log.description == "Solicitud enviada a la papelera"
    assert _cambios(log) == [("Papelera", f"Se elimina definitivamente el {_fecha_purga(sc.eliminada_at)} "
                                          "si no se restaura")]
    assert _logs(db, sc.id, "CANCELLED") == []


def test_cancelar_restaurar_y_eliminar_hacen_un_solo_commit(app_client, db, admin_token, user_admin, monkeypatch):
    """C8: un solo db.commit() por operación (con lead: su movimiento va en un savepoint, sin commit propio)."""
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, "SC-T2B008", user_admin, gate1_confirmed_at=AHORA())
    create_confirmation_token(db, "SC", sc.id)
    _lead(db, sc, status="DRAFT")
    vieja = _sc(db, "SC-T2B008B", user_admin, estado="CANCELADA")
    _lead(db, vieja, status="DRAFT")
    sin_nada = _sc(db, "SC-T2B008C", user_admin, estado="CANCELADA", eliminada_at=AHORA())
    commits = _commits_del_api(db, monkeypatch)

    assert _cancelar(app_client, admin_token, sc.id).status_code == 200
    assert len(commits) == 1, "cancelar"
    commits.clear()
    assert _restaurar(app_client, admin_token, sc.id).status_code == 200
    assert len(commits) == 1, "restaurar"
    commits.clear()
    assert _cancelar(app_client, admin_token, vieja.id).status_code == 200
    assert len(commits) == 1, "enviar a la papelera"
    commits.clear()
    resp = app_client.delete(f"/api/v1/ventas/solicitudes/{sin_nada.id}/permanente", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert len(commits) == 1, "eliminar definitivamente"


# ─── Papelera: se conserva o se purga ─────────────────────────────────────────────────────────────────────────

def test_papelera_dice_si_se_conserva_y_el_detalle_lo_expone(app_client, db, admin_token, user_admin):
    """H31-4 + ruling T2B-3."""
    con_cot = _sc(db, "SC-T2B009A", user_admin)
    cot = _cot(db, "COT-T2B009A", con_cot, estado="RECHAZADA")
    assert _cancelar(app_client, admin_token, con_cot.id).status_code == 200
    (log,) = _logs(db, con_cot.id, "CANCELLED")
    assert dict(_cambios(log))["Papelera"] == f"Se conserva como historial (tiene cotización {cot.numero})"
    d = _detalle(app_client, admin_token, con_cot.id)
    assert d["se_conserva_en_papelera"] is True and d["purga_programada"] is None

    sin_docs = _sc(db, "SC-T2B009B", user_admin)
    assert _cancelar(app_client, admin_token, sin_docs.id).status_code == 200
    db.refresh(sin_docs)
    (log,) = _logs(db, sin_docs.id, "CANCELLED")
    assert dict(_cambios(log))["Papelera"].startswith("Se elimina definitivamente el ")
    d = _detalle(app_client, admin_token, sin_docs.id)
    assert d["se_conserva_en_papelera"] is False
    assert d["purga_programada"] == _purga_iso(sin_docs.eliminada_at)

    # Cancelada con la pastilla vieja (sin eliminada_at): la purga no la toca -> sin fecha, y el GET no falla.
    vieja = _sc(db, "SC-T2B009C", user_admin, estado="CANCELADA")
    d = _detalle(app_client, admin_token, vieja.id)
    assert d["se_conserva_en_papelera"] is False and d["purga_programada"] is None


def test_referencias_de_solicitud_y_texto_de_papelera(db, user_admin):
    """Un único helper, con los tres criterios de la Papelera (sin filtrar por estado), en orden COT, PVEN, lead y en
    plural; el mismo texto del 409 de 'Eliminar definitivamente'."""
    from app.api.v1.erp_ventas import (_mensaje_solicitud_con_historial, _referencias_de_solicitud,
                                       _texto_papelera)
    sc = _sc(db, "SC-T2B010", user_admin, estado="CANCELADA", eliminada_at=AHORA())
    assert _referencias_de_solicitud(db, sc.id) == []
    assert _texto_papelera(db, sc) == f"Se elimina definitivamente el {_fecha_purga(sc.eliminada_at)} si no se restaura"
    assert _mensaje_solicitud_con_historial(sc, []) == (
        "No se puede eliminar definitivamente la solicitud SC-T2B010: tiene documentos vinculados. "
        "Se conserva en la Papelera como historial.")
    _cot(db, "COT-T2B010A", sc, estado="RECHAZADA")
    _cot(db, "COT-T2B010B", sc, estado="RECHAZADA")
    _ven(db, "PVEN-T2B010", sc)
    _lead(db, sc, status="CANCELLED")
    _lead(db, sc, status="CANCELLED")
    refs = _referencias_de_solicitud(db, sc.id)
    assert refs == ["cotizaciones COT-T2B010A, COT-T2B010B", "pedido de venta PVEN-T2B010", "leads del CRM"]
    assert _texto_papelera(db, sc) == ("Se conserva como historial (tiene cotizaciones COT-T2B010A, COT-T2B010B, "
                                       "pedido de venta PVEN-T2B010, leads del CRM)")


def test_patch_de_estado_sobre_sc_cancelada_se_rechaza(app_client, db, admin_token, user_admin):
    """H31-5 / C14 (guarda del Bloque 1, R34; verde desde el principio): 409 con 'Papelera' para Nueva y Cotizada; la
    Confirmada sigue dando primero el 400 de Gate 1."""
    sc = _sc(db, "SC-T2B011", user_admin)
    assert _cancelar(app_client, admin_token, sc.id).status_code == 200
    db.refresh(sc)
    eliminada = sc.eliminada_at
    for estado in ("BORRADOR", "COTIZADA"):
        resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": estado, "updated_by": "t"},
                                headers=auth(admin_token))
        assert resp.status_code == 409, (estado, resp.text)
        assert resp.json()["detail"] == ("La solicitud SC-T2B011 está cancelada: para volver a trabajar en ella, "
                                         "restáurala desde la Papelera (botón «Restaurar»).")
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "CONFIRMADA"},
                            headers=auth(admin_token))
    assert resp.status_code == 400 and "enlace enviado" in resp.json()["detail"]
    db.refresh(sc)
    assert sc.estado == "CANCELADA" and sc.eliminada_at == eliminada
    assert [l.action for l in _logs(db, sc.id)] == ["CANCELLED"]


# ─── restaurar_solicitud ──────────────────────────────────────────────────────────────────────────────────────

def test_restaurar_con_asesor_queda_asignada_y_lo_explica(app_client, db, admin_token, user_admin):
    """H33-3: una sola escritura, RESTORED con sus cambios y la respuesta con 'mensaje'."""
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, "SC-T2B012", user_admin, estado="CANCELADA", razon_cancelacion="Prueba restaurar",
             eliminada_at=AHORA(), gate1_confirmed_at=AHORA())  # dato viejo: conserva la marca de Gate 1
    enlace = create_confirmation_token(db, "SC", sc.id)
    resp = _restaurar(app_client, admin_token, sc.id)
    assert resp.status_code == 200, resp.text
    asignada = _etiqueta("ASIGNADA")
    motivo = f"tiene asesor asignado ({user_admin.email})"
    assert resp.json() == {"status": "success", "data": {
        "id": sc.id, "numero": "SC-T2B012", "estado": "ASIGNADA", "estado_label": asignada,
        "mensaje": f"SC-T2B012 restaurada: queda {asignada} porque {motivo}."}}
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.eliminada_at is None and sc.gate1_confirmed_at is None
    assert _token_usado(db, enlace)
    (log,) = _logs(db, sc.id, "RESTORED")
    assert log.description == f"Solicitud restaurada a {asignada}"
    assert (log.old_estado, log.new_estado, log.user_name) == ("CANCELADA", "ASIGNADA", user_admin.email)
    assert _cambios(log) == [(f"Queda {asignada}", motivo),
                             ("Motivo de la cancelación", "Prueba restaurar"),
                             ("Confirmación del cliente", "Hay que volver a enviársela al cliente")]
    # Nunca paso por Nueva: no hay otro renglón de estado.
    assert [l.action for l in _logs(db, sc.id)] == ["RESTORED"]


def test_restaurar_sin_asesor_queda_nueva(app_client, db, admin_token, user_admin):
    """H33-4 (ruling T2B-4: la etiqueta de BORRADOR es la de etiqueta_estado, 'Nueva' tras T2A)."""
    sc = _sc(db, "SC-T2B013", user_admin, con_asesor=False, estado="CANCELADA", eliminada_at=AHORA())
    resp = _restaurar(app_client, admin_token, sc.id)
    assert resp.status_code == 200, resp.text
    nueva = _etiqueta("BORRADOR")
    data = resp.json()["data"]
    assert data["estado"] == "BORRADOR" and data["estado_label"] == nueva
    assert data["mensaje"] == f"SC-T2B013 restaurada: queda {nueva} porque no tiene asesor asignado."
    (log,) = _logs(db, sc.id, "RESTORED")
    assert log.description == f"Solicitud restaurada a {nueva}"
    assert _cambios(log) == [(f"Queda {nueva}", "no tiene asesor asignado")]


def test_restaurar_una_solicitud_que_no_esta_cancelada_da_409(app_client, db, admin_token, user_admin):
    """H33-5 con el texto exacto del Bloque 1 (R34; verde desde el principio)."""
    sc = _sc(db, "SC-T2B014", user_admin)
    resp = _restaurar(app_client, admin_token, sc.id)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == "La solicitud SC-T2B014 no está cancelada: no hay nada que restaurar."
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"
    assert _logs(db, sc.id, "RESTORED") == []


def test_restaurar_con_cotizacion_activa_da_el_409_del_bloque_1(app_client, db, admin_token, user_admin):
    """H33-6 con R34 (gana el Bloque 1 sobre la primera rama de C6; verde desde el principio)."""
    sc = _sc(db, "SC-T2B015", user_admin, estado="CANCELADA", eliminada_at=AHORA())
    cot = _cot(db, "COT-T2B015", sc)
    resp = _restaurar(app_client, admin_token, sc.id)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == (
        f"No se puede restaurar la solicitud SC-T2B015: tiene documentos activos (cotización {cot.numero}). "
        "Primero rechaza la cotización; después podrás restaurar la solicitud.")
    db.refresh(sc)
    assert sc.estado == "CANCELADA" and sc.eliminada_at is not None
    assert _logs(db, sc.id, "RESTORED") == []


def test_restaurar_devuelve_el_lead_a_la_etapa_inicial(app_client, db, admin_token, user_admin):
    """H33-7 con R34: el lead perdido vuelve a la etapa con que nace un lead nuevo; uno que no estaba perdido no se toca
    y no hay renglón del CRM."""
    from app.api.v1.crm import _etapa_inicial_del_pipeline
    from app.models.sales import SalesOrder
    sc = _sc(db, "SC-T2B016", user_admin, estado="CANCELADA", eliminada_at=AHORA())
    lead = _lead(db, sc, status="CANCELLED")
    stage, status = _etapa_inicial_del_pipeline(db)
    assert _restaurar(app_client, admin_token, sc.id).status_code == 200
    db.expire_all()
    fila = db.get(SalesOrder, lead.id)
    assert (fila.status, fila.pipeline_stage_id) == (status, stage.id if stage else None)
    (log,) = _logs(db, sc.id, "RESTORED")
    assert ("Cliente en el CRM", f"Vuelve a {stage.name}") in _cambios(log)

    vivo = _sc(db, "SC-T2B016B", user_admin, estado="CANCELADA", eliminada_at=AHORA())
    lead_vivo = _lead(db, vivo, status="QUOTATION")
    assert _restaurar(app_client, admin_token, vivo.id).status_code == 200
    db.expire_all()
    assert db.get(SalesOrder, lead_vivo.id).status == "QUOTATION"
    (log,) = _logs(db, vivo.id, "RESTORED")
    assert "Cliente en el CRM" not in dict(_cambios(log))


def test_restaurar_si_falla_el_lead_la_solicitud_igual_queda_restaurada(app_client, db, admin_token, user_admin,
                                                                         monkeypatch):
    import app.api.v1.erp_ventas as m
    from app.models.sales import SalesOrder
    sc = _sc(db, "SC-T2B017", user_admin, estado="CANCELADA", eliminada_at=AHORA())
    lead = _lead(db, sc, status="CANCELLED")

    def reabrir_que_falla(sc_id, sesion, commit=True):
        sesion.query(SalesOrder).filter(SalesOrder.id == lead.id).update({"status": "EN_NEGOCIACION"})
        raise RuntimeError("fallo simulado del CRM")

    monkeypatch.setattr(m, "reabrir_lead_de_solicitud", reabrir_que_falla)
    resp = _restaurar(app_client, admin_token, sc.id)
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "ASIGNADA"
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.eliminada_at is None
    db.expire_all()
    assert db.get(SalesOrder, lead.id).status == "CANCELLED"
    (log,) = _logs(db, sc.id, "RESTORED")
    assert ("Cliente en el CRM", "No se pudo reabrir") in _cambios(log)


def test_mover_y_reabrir_el_lead_sin_commit(db, user_admin, contador_sql):
    """crm: commit=False hace flush en vez de commit (lo confirma el llamador); reabrir devuelve la etapa o None."""
    from app.api.v1.crm import _etapa_inicial_del_pipeline, mover_lead_de_solicitud, reabrir_lead_de_solicitud
    from app.models.sales import SalesOrder
    sc = _sc(db, "SC-T2B018", user_admin)
    lead = _lead(db, sc, status="DRAFT")
    with contador_sql.ventana() as v:
        mover_lead_de_solicitud(sc.id, "CANCELLED", db, commit=False)
    assert v.commits == 0
    db.expire_all()
    assert db.get(SalesOrder, lead.id).status == "CANCELLED"
    stage, status = _etapa_inicial_del_pipeline(db)
    with contador_sql.ventana() as v:
        etapa = reabrir_lead_de_solicitud(sc.id, db, commit=False)
    assert v.commits == 0 and etapa == stage.name
    db.expire_all()
    assert db.get(SalesOrder, lead.id).status == status
    assert reabrir_lead_de_solicitud(sc.id, db, commit=False) is None          # ya no estaba perdido
    otra = _sc(db, "SC-T2B018B", user_admin)
    assert reabrir_lead_de_solicitud(otra.id, db) is None                        # sin lead


# ─── DELETED / PURGED ─────────────────────────────────────────────────────────────────────────────────────────

def test_eliminar_definitivamente_deja_rastro(app_client, db, admin_token, user_admin):
    """H33-8: DELETED en el mismo commit del borrado; con historial (409) no hay rastro."""
    sc = _sc(db, "SC-T2B019", user_admin, estado="CANCELADA", eliminada_at=AHORA(), razon_cancelacion="Ya no va")
    sc_id = sc.id
    resp = app_client.delete(f"/api/v1/ventas/solicitudes/{sc_id}/permanente", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (log,) = _logs(db, sc_id, "DELETED")
    assert log.description == "Solicitud SC-T2B019 eliminada definitivamente de la Papelera"
    assert (log.entity_numero, log.old_estado, log.new_estado, log.user_name) == (
        "SC-T2B019", "CANCELADA", None, user_admin.email)
    assert log.extra_data == {"cliente": "Cliente Prueba", "motivo_cancelacion": "Ya no va"}

    con_cot = _sc(db, "SC-T2B019B", user_admin, estado="CANCELADA", eliminada_at=AHORA())
    _cot(db, "COT-T2B019B", con_cot, estado="RECHAZADA")
    resp = app_client.delete(f"/api/v1/ventas/solicitudes/{con_cot.id}/permanente", headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert _logs(db, con_cot.id, "DELETED") == []


def test_si_el_borrado_falla_no_queda_rastro_falso(app_client, db, admin_token, user_admin, monkeypatch):
    """El DELETED va en el commit del borrado: si ese commit falla (FK de ultimo momento), tampoco queda el renglón."""
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session
    sc = _sc(db, "SC-T2B020", user_admin, estado="CANCELADA", eliminada_at=AHORA())
    commit_real = Session.commit
    armado = {"si": False}

    def commit_que_viola_el_fk(self):
        if armado["si"] and self is not db:
            raise IntegrityError("DELETE FROM customer_requests", {}, Exception("viola la llave foranea"))
        return commit_real(self)

    monkeypatch.setattr(Session, "commit", commit_que_viola_el_fk)
    armado["si"] = True
    resp = app_client.delete(f"/api/v1/ventas/solicitudes/{sc.id}/permanente", headers=auth(admin_token))
    armado["si"] = False
    assert resp.status_code == 409, resp.text
    assert _logs(db, sc.id, "DELETED") == []
    assert [l.action for l in _logs(db, sc.id)] == []


def test_purga_automatica_deja_rastro(app_client, db, admin_token, user_admin):
    """H33-9: borra DE VERDAD dentro de la transacción (solo con el runner de ROLLBACK)."""
    from app.models.erp_documents import CustomerRequest
    hace_40 = AHORA() - datetime.timedelta(days=40)
    vieja = _sc(db, "SC-T2B021", user_admin, estado="CANCELADA", eliminada_at=hace_40, razon_cancelacion="Vieja")
    vieja_id = vieja.id
    con_historial = _sc(db, "SC-T2B021B", user_admin, estado="CANCELADA", eliminada_at=hace_40)
    _cot(db, "COT-T2B021B", con_historial, estado="RECHAZADA")
    resp = app_client.get("/api/v1/ventas/solicitudes/papelera", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert db.get(CustomerRequest, vieja_id) is None
    (log,) = _logs(db, vieja_id, "PURGED")
    assert log.description == "Solicitud eliminada automáticamente: llevaba más de 30 días en la Papelera"
    assert (log.entity_numero, log.old_estado, log.user_name) == ("SC-T2B021", "CANCELADA", "Sistema")
    assert log.extra_data == {"cliente": "Cliente Prueba", "motivo_cancelacion": "Vieja"}
    assert db.get(CustomerRequest, con_historial.id) is not None
    assert _logs(db, con_historial.id, "PURGED") == []


# ─── scripts/limpiar_motivo_en_notas.py ───────────────────────────────────────────────────────────────────────

def _borrar_tabla(db, tabla):
    from sqlalchemy import text
    db.rollback()
    db.execute(text(f"DROP TABLE IF EXISTS {tabla}"))
    db.commit()


def _existe_tabla(db, tabla):
    from sqlalchemy import text
    return db.execute(text("SELECT to_regclass(:t)"), {"t": tabla}).scalar() is not None


def _notas(db, ids):
    from app.models.erp_documents import CustomerRequest
    db.expire_all()
    return [db.get(CustomerRequest, i).notas for i in ids]


def _cancelled_viejo(db, sc, motivo):
    """Renglón CANCELLED como lo dejaba cancelar_solicitud antes de T2B: 'Cancelada: {motivo}', sin extra_data."""
    from app.models.erp_documents import ActivityLog
    db.add(ActivityLog(entity_type="SC", entity_id=sc.id, entity_numero=sc.numero, action="CANCELLED",
                       description=f"Cancelada: {motivo}", old_estado="ASIGNADA", new_estado="CANCELADA",
                       user_name="t"))
    db.commit()


def test_script_limpiar_motivo_en_notas_reporta_aplica_y_es_idempotente(db, user_admin):
    """H31-6 + H33-10: reporte sin escribir; aplicar con respaldo; segunda corrida en 0; nunca toca una marca cuyo
    motivo no es de esa SC."""
    from sqlalchemy import text
    from scripts.limpiar_motivo_en_notas import limpiar
    a = _sc(db, "SC-T2BN01", user_admin, estado="CANCELADA", razon_cancelacion="Ya no lo necesita",
            notas=f"Entrega en obra\n{MARCA}Ya no lo necesita")
    b = _sc(db, "SC-T2BN02", user_admin, estado="CANCELADA", razon_cancelacion="Motivo distinto",
            notas=f"Otra nota\n{MARCA}Otro motivo")
    c = _sc(db, "SC-T2BN03", user_admin, estado="CANCELADA", razon_cancelacion="Solo esto",
            notas=f"{MARCA}Solo esto")
    d = _sc(db, "SC-T2BN04", user_admin, notas=f"X\n{MARCA}Ya no")                # sin motivo registrado
    ids = [a.id, b.id, c.id, d.id]
    originales = _notas(db, ids)
    try:
        res = limpiar(db, aplicar=False, ids=ids, tabla_respaldo=TABLA_NOTAS_TEST)
        assert res["candidatas"] == 2 and res["limpiadas"] == 0
        assert res["marcas_conservadas"] == 2 and res["excluidas"] == 0
        por_numero = {e["numero"]: e for e in res["ejemplos"]}
        assert set(por_numero) == {"SC-T2BN01", "SC-T2BN03"}
        assert por_numero["SC-T2BN01"]["despues"] == "Entrega en obra"
        assert por_numero["SC-T2BN01"]["quitadas"] == ["Ya no lo necesita"]
        assert por_numero["SC-T2BN03"]["despues"] is None
        assert _notas(db, ids) == originales
        assert not _existe_tabla(db, TABLA_NOTAS_TEST)  # el reporte ni siquiera crea la tabla de respaldo

        res = limpiar(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_NOTAS_TEST)
        assert res["candidatas"] == 2 and res["limpiadas"] == 2
        assert _notas(db, ids) == ["Entrega en obra", originales[1], None, originales[3]]
        respaldo = {r[0]: (r[1], r[2]) for r in db.execute(
            text(f"SELECT id, notas_original, notas_nueva FROM {TABLA_NOTAS_TEST}")).all()}
        assert respaldo == {a.id: (originales[0], "Entrega en obra"), c.id: (originales[2], None)}

        res2 = limpiar(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_NOTAS_TEST)
        assert res2["candidatas"] == 0 and res2["limpiadas"] == 0
        assert db.execute(text(f"SELECT count(*) FROM {TABLA_NOTAS_TEST}")).scalar() == 2
    finally:
        _borrar_tabla(db, TABLA_NOTAS_TEST)


def test_limpiar_quita_el_motivo_de_un_cancelled_anterior(db, user_admin):
    """C1 f + ruling T2B-5: cancelada, restaurada y vuelta a cancelar. La marca del primer motivo (que solo está en un
    CANCELLED viejo, 'Cancelada: X' sin extra_data) también se quita; la que no coincide con ningún motivo de ESA SC se
    conserva (aunque coincida con el de otra SC). Un CANCELLED nuevo aporta su extra_data['motivo']."""
    from app.models.erp_documents import ActivityLog
    from scripts.limpiar_motivo_en_notas import limpiar
    sc = _sc(db, "SC-T2BN05", user_admin, estado="CANCELADA", razon_cancelacion="Segundo motivo",
             notas=(f"Entregar en obra\n{MARCA}Primer motivo\n{MARCA}Segundo motivo\n{MARCA}Escrito a mano"))
    _cancelled_viejo(db, sc, "Primer motivo")
    _cancelled_viejo(db, sc, "Segundo motivo")
    otra = _sc(db, "SC-T2BN06", user_admin, estado="CANCELADA", razon_cancelacion="Escrito a mano")
    _cancelled_viejo(db, otra, "Escrito a mano")
    nueva = _sc(db, "SC-T2BN07", user_admin, notas=f"Nota\n{MARCA}Motivo nuevo")   # restaurada: sin razon
    db.add(ActivityLog(entity_type="SC", entity_id=nueva.id, entity_numero=nueva.numero, action="CANCELLED",
                       description="Solicitud cancelada (texto de otra versión)", old_estado="ASIGNADA",
                       new_estado="CANCELADA", user_name="t", extra_data={"motivo": "Motivo nuevo"}))
    db.commit()
    ids = [sc.id, otra.id, nueva.id]
    try:
        res = limpiar(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_NOTAS_TEST)
        assert res["limpiadas"] == 2
        assert _notas(db, [sc.id, nueva.id]) == [f"Entregar en obra\n{MARCA}Escrito a mano", "Nota"]
        assert res["marcas_conservadas"] == 1
    finally:
        _borrar_tabla(db, TABLA_NOTAS_TEST)


def test_limpiar_excluye_documentos_reales(db, user_admin, monkeypatch):
    """R32: DOCUMENTOS_REALES trae exactamente los cuatro números reales; lo que se le agregue (y lo vinculado: aquí una
    SC por el número de su COT) no sale en las candidatas. Las de Soporte Técnico tampoco; una sin tipo (NULL) sí."""
    from sqlalchemy import text
    from scripts import limpiar_motivo_en_notas as modulo
    assert modulo.DOCUMENTOS_REALES == ("SC-20260731", "COT-20260449", "PVEN-20262799", "SC-20260746")
    por_numero = _sc(db, "SC-T2BX01", user_admin, estado="CANCELADA", razon_cancelacion="Motivo X",
                     notas=f"N\n{MARCA}Motivo X")
    por_cot = _sc(db, "SC-T2BX02", user_admin, estado="CANCELADA", razon_cancelacion="Motivo Y",
                  notas=f"N\n{MARCA}Motivo Y")
    cot = _cot(db, "COT-T2BX02", por_cot, estado="RECHAZADA")
    soporte = _sc(db, "SC-T2BX03", user_admin, estado="CANCELADA", razon_cancelacion="Motivo S",
                  notas=f"N\n{MARCA}Motivo S", tipo_solicitud="Soporte Tecnico")
    sin_tipo = _sc(db, "SC-T2BX04", user_admin, estado="CANCELADA", razon_cancelacion="Motivo T",
                   notas=f"N\n{MARCA}Motivo T")
    db.execute(text("UPDATE customer_requests SET tipo_solicitud = NULL WHERE id = :i"), {"i": sin_tipo.id})
    db.commit()
    ids = [por_numero.id, por_cot.id, soporte.id, sin_tipo.id]
    # Sin agregarlos a la lista, las dos primeras son candidatas (la prueba si prueba algo); Soporte nunca.
    assert {e["numero"] for e in modulo.limpiar(db, aplicar=False, ids=ids)["ejemplos"]} == {
        "SC-T2BX01", "SC-T2BX02", "SC-T2BX04"}
    monkeypatch.setattr(modulo, "DOCUMENTOS_REALES", modulo.DOCUMENTOS_REALES + (por_numero.numero, cot.numero))
    try:
        res = modulo.limpiar(db, aplicar=False, ids=ids)
        assert {e["numero"] for e in res["ejemplos"]} == {"SC-T2BX04"} and res["excluidas"] == 2
        res = modulo.limpiar(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_NOTAS_TEST)
        assert res["limpiadas"] == 1
        assert _notas(db, ids) == [f"N\n{MARCA}Motivo X", f"N\n{MARCA}Motivo Y", f"N\n{MARCA}Motivo S", "N"]
    finally:
        _borrar_tabla(db, TABLA_NOTAS_TEST)


def test_limpiar_revierte_todo_si_falla_a_mitad(db, user_admin):
    """Una transacción: la tabla de respaldo de prueba rechaza la SEGUNDA fila (notas que quedan vacías)."""
    from sqlalchemy import text
    from scripts.limpiar_motivo_en_notas import limpiar
    primera = _sc(db, "SC-T2BF01", user_admin, estado="CANCELADA", razon_cancelacion="Motivo A",
                  notas=f"A\n{MARCA}Motivo A")
    segunda = _sc(db, "SC-T2BF02", user_admin, estado="CANCELADA", razon_cancelacion="Motivo B",
                  notas=f"{MARCA}Motivo B")
    ids = [primera.id, segunda.id]
    originales = _notas(db, ids)
    db.execute(text(f"CREATE TABLE {TABLA_NOTAS_TEST} (id INTEGER PRIMARY KEY, notas_original TEXT, "
                    "notas_nueva TEXT CHECK (notas_nueva IS NOT NULL), corregido_at TIMESTAMP DEFAULT now())"))
    db.commit()
    try:
        with pytest.raises(Exception):
            limpiar(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_NOTAS_TEST)
        assert _notas(db, ids) == originales
        assert db.execute(text(f"SELECT count(*) FROM {TABLA_NOTAS_TEST}")).scalar() == 0
    finally:
        _borrar_tabla(db, TABLA_NOTAS_TEST)


def test_limpiar_rechaza_un_nombre_de_tabla_de_respaldo_peligroso(db):
    from scripts.limpiar_motivo_en_notas import limpiar
    for nombre in ("x; DROP TABLE users", "Tabla-Con-Guion", "1abc", "", "a b", "abc\n", "abc\r\n"):
        with pytest.raises(ValueError):
            limpiar(db, aplicar=False, ids=[1], tabla_respaldo=nombre)


def _correr_main(monkeypatch, argv):
    """main() con limpiar reemplazada por una función que solo anota la llamada."""
    from scripts import limpiar_motivo_en_notas as modulo
    llamadas = []

    def _limpiar(db, aplicar=False, **kwargs):
        llamadas.append(aplicar)
        return {"candidatas": 0, "limpiadas": 0, "excluidas": 0, "marcas_conservadas": 0, "ejemplos": []}

    monkeypatch.setattr(modulo, "limpiar", _limpiar)
    salida, errores = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(errores):
        try:
            codigo = modulo.main(argv)
        except SystemExit as exc:  # argparse
            codigo = exc.code
    return codigo, llamadas, salida.getvalue(), errores.getvalue()


def test_limpiar_cli_reporta_por_defecto_y_aplicar_exige_la_base(db, monkeypatch):
    from sqlalchemy import text
    codigo, llamadas, salida, _ = _correr_main(monkeypatch, [])
    assert codigo == 0 and llamadas == [False]
    assert "REPORTE" in salida and "--aplicar --base <nombre de la base>" in salida
    codigo, llamadas, _, errores = _correr_main(monkeypatch, ["--aplicar"])
    assert codigo == 2 and llamadas == [] and "exige --base" in errores
    actual = db.execute(text("SELECT current_database()")).scalar()
    codigo, llamadas, salida, errores = _correr_main(monkeypatch, ["--aplicar", "--base", actual + "_otra"])
    assert codigo == 2 and llamadas == []
    assert f"SELECT current_database() -> {actual}" in salida
    assert "ABORTADO" in errores and "no se escribió nada" in errores
    codigo, llamadas, salida, _ = _correr_main(monkeypatch, ["--aplicar", "--base", actual])
    assert codigo == 0 and llamadas == [True] and "Limpiadas: 0" in salida


def test_el_reporte_de_limpiar_no_escribe_nada(db, user_admin, contador_sql):
    """El modo reporte tal como lo corre main(): READ ONLY primero y después solo lecturas, sin ningún commit."""
    from scripts.limpiar_motivo_en_notas import _solo_lectura, limpiar
    sc = _sc(db, "SC-T2BZ01", user_admin, estado="CANCELADA", razon_cancelacion="Motivo Z",
             notas=f"Z\n{MARCA}Motivo Z")
    _cancelled_viejo(db, sc, "Motivo Z")
    contador_sql.reset()
    _solo_lectura(db)
    res = limpiar(db, aplicar=False, ids=[sc.id])
    assert res["candidatas"] == 1
    sentencias = [s.lstrip().upper() for s in contador_sql.sentencias]
    assert sentencias[0].startswith("SET TRANSACTION READ ONLY"), sentencias[0]
    escrituras = [s for s in sentencias if s.startswith(("INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER"))]
    assert escrituras == []
    assert contador_sql.commits == 0
