"""U15 (Bloque 2, T2A): la solicitud cuenta solo su propia historia.

- Estados que se asignan: Nueva (BORRADOR), Asignada, Pendiente por confirmación, Confirmada y Cancelada. Los de antes
  (Cotizada, En espera de confirmación, Rechazada, Vencida) quedan como heredados: solo historial.
- Crear, enviar, confirmar o reabrir la cotización, o cancelar su pedido, NO cambia la solicitud. Dos excepciones:
  la COT confirmada por el cliente confirma una solicitud sin confirmar (o heredada), y rechazar la única COT activa
  con la solicitud Confirmada sin confirmación vigente (o en un estado heredado, R29) la devuelve a Asignada / Nueva.
- Actividad de la SC: COTIZACION_CREADA y COTIZACION_RECHAZADA (sin old/new); textos del rechazo por estado (R21).
- _sc_dict trae confirmacion_vigente (CONFIRMADA y gate1), con el helper _confirmacion_vigente_sc.
- update_solicitud: textos de C5 (400, 409 con 'reiniciar' y 'Estado cambiado a Nueva (asesor retirado)').
- scripts/ajustar_estados_solicitud.py: ajustar (estados heredados) y ajustar_leads (leads perdidos de solicitudes
  vivas), con la exclusion de los documentos reales (R32) y la CLI con --base (B9).
La prueba 2 de U15 (paridad con el frontend) es de T6A.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_estados_solicitud
"""
import contextlib
import datetime
import hashlib
import io
import uuid

LINEA = {"product_name": "Cuna Colecho", "qty": 1}
LINEA_CON_PRECIO = {"product_name": "Cuna Colecho", "qty": 1, "unit_price_cop": 1000, "total_cop": 1000}
CREDITO = "Crédito 30 días"  # anticipo 0: crear el pedido no pide verificacion (N1)
TABLA_ESTADOS_TEST = "customer_requests_respaldo_estados_test"
TABLA_LEADS_TEST = "sales_orders_respaldo_leads_test"
AUTOR_AJUSTE = "Sistema (ajuste de estados)"
AHORA = datetime.datetime.utcnow


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sc(db, numero, user_admin, con_asesor=True, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "CONFIRMADA")
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


def _lead(db, sc, status="CANCELLED", pipeline_stage_id=None):
    from app.models.customers import Customer
    from app.models.sales import SalesOrder
    cliente = Customer(first_name="Cliente", last_name="U15", email=f"u15-{uuid.uuid4().hex[:8]}@test.nebulae")
    db.add(cliente); db.commit()
    lead = SalesOrder(customer_id=cliente.id, status=status, canonical_customer_request_id=sc.id, lead_source="SC",
                      lead_description=f"SC creada: {sc.numero}", pipeline_stage_id=pipeline_stage_id)
    db.add(lead); db.commit(); db.refresh(lead)
    return lead


def _crear_cot(app_client, token, sc_id):
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc_id}/confirmar", json={"user_name": "t"},
                           headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["cotizacion"]


def _patch_cot(app_client, token, cot_id, **body):
    body.setdefault("updated_by", "t")
    return app_client.patch(f"/api/v1/ventas/cotizaciones/{cot_id}", json=body, headers=auth(token))


def _logs(db, entidad, entity_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entity_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def _token_usado(db, raw):
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    return db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.token_hash == hashlib.sha256(raw.encode()).hexdigest()).first().used_at is not None


def _etapa(db, status):
    from sqlalchemy import text
    return db.execute(text("SELECT id FROM pipeline_stages WHERE maps_to_status = :s ORDER BY position, id LIMIT 1"),
                      {"s": status}).scalar()


def _borrar_tabla(db, tabla):
    from sqlalchemy import text
    db.rollback()
    db.execute(text(f"DROP TABLE IF EXISTS {tabla}"))
    db.commit()


def _existe_tabla(db, tabla):
    from sqlalchemy import text
    return db.execute(text("SELECT to_regclass(:t)"), {"t": tabla}).scalar() is not None


# ─── 1) etiquetas ─────────────────────────────────────────────────────────────────────────────────────────────

def test_etiquetas_de_la_solicitud_son_las_del_usuario():
    from app.core.textos_actividad import ESTADOS_SC_HEREDADOS, PASOS_SC, etiqueta_estado
    assert etiqueta_estado("SC", "BORRADOR") == "Nueva"
    assert etiqueta_estado("SC", "PENDIENTE_CONFIRMACION") == "Pendiente por confirmación"
    assert [etiqueta_estado("SC", e) for e in ("ASIGNADA", "CONFIRMADA", "CANCELADA")] == [
        "Asignada", "Confirmada", "Cancelada"]
    assert PASOS_SC == ("BORRADOR", "ASIGNADA", "PENDIENTE_CONFIRMACION", "CONFIRMADA")
    assert ESTADOS_SC_HEREDADOS == ("COTIZADA", "EN_ESPERA_CONFIRMACION", "RECHAZADA", "VENCIDA")
    # Los heredados conservan su etiqueta para el historial; la COT conserva 'Borrador'.
    assert [etiqueta_estado("SC", e) for e in ESTADOS_SC_HEREDADOS] == [
        "Cotizada", "En espera de confirmación", "Rechazada", "Vencida"]
    assert etiqueta_estado("COT", "BORRADOR") == "Borrador"


# ─── 3-8) la SC no refleja a su COT ──────────────────────────────────────────────────────────────────────────

def test_crear_la_cotizacion_deja_la_solicitud_confirmada(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-U15001", user_admin, gate1_confirmed_at=AHORA())
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    cot = resp.json()["data"]["cotizacion"]
    assert resp.json()["data"]["sc"]["estado"] == "CONFIRMADA"
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None
    ultimo = _logs(db, "SC", sc.id)[-1]
    assert ultimo.action == "COTIZACION_CREADA"
    assert ultimo.description == f"Cotización {cot['numero']} creada desde esta solicitud"
    assert (ultimo.old_estado, ultimo.new_estado, ultimo.user_name) == (None, None, "t")
    assert _logs(db, "SC", sc.id, "ESTADO_CHANGED") == []
    (creada,) = _logs(db, "COT", cot["id"], "CREATED")  # el CREATED de la COT no cambia
    assert creada.description == f"Cotización {cot['numero']} creada desde SC-U15001"


def test_enviar_y_confirmar_la_cotizacion_no_cambian_la_solicitud(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SalesQuotation
    sc = _sc(db, "SC-U15002", user_admin, gate1_confirmed_at=AHORA(), customer_email="cliente@test.com")
    cot = _crear_cot(app_client, admin_token, sc.id)
    fila = db.get(SalesQuotation, cot["id"])
    fila.productos = [LINEA_CON_PRECIO]
    fila.total_cop = 1000
    db.commit()
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot['id']}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"
    raw = resp.json()["link_confirmacion"].rsplit("/", 1)[-1]
    resp = app_client.post("/api/v1/confirmar/confirmar", json={"token": raw}, headers={"Idempotency-Key": "u15-002"})
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None
    assert db.get(SalesQuotation, cot["id"]).estado == "CONFIRMADA"
    assert _logs(db, "SC", sc.id, "ESTADO_CHANGED") == []


def test_rechazar_con_confirmacion_vigente_deja_confirmada_y_lo_anota(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-U15003", user_admin, gate1_confirmed_at=AHORA())
    cot1 = _crear_cot(app_client, admin_token, sc.id)
    resp = _patch_cot(app_client, admin_token, cot1["id"], estado="RECHAZADA")
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None
    (aviso,) = _logs(db, "SC", sc.id, "COTIZACION_RECHAZADA")
    assert aviso.description == (f"La cotización {cot1['numero']} fue rechazada. La solicitud sigue activa: ya puedes "
                                 "crearle una nueva cotización.")
    assert (aviso.old_estado, aviso.new_estado, aviso.user_name) == (None, None, "t")
    assert _logs(db, "SC", sc.id, "ESTADO_CHANGED") == []
    # Se le crea otra sin reconfirmar, y la Actividad de la SC dice a cual reemplaza.
    cot2 = _crear_cot(app_client, admin_token, sc.id)
    ultimo = _logs(db, "SC", sc.id)[-1]
    assert ultimo.action == "COTIZACION_CREADA"
    assert ultimo.description == (f"Cotización {cot2['numero']} creada desde esta solicitud (reemplaza a la "
                                  f"cotización rechazada {cot1['numero']})")


def test_rechazar_sin_confirmacion_vigente_vuelve_a_asignada(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-U15004", user_admin, gate1_confirmed_at=None)
    cot = _cot(db, "COT-U15004", sc)
    resp = _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA")
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"
    (cambio,) = _logs(db, "SC", sc.id, "ESTADO_CHANGED")
    assert (cambio.old_estado, cambio.new_estado, cambio.user_name) == ("CONFIRMADA", "ASIGNADA", "t")
    assert cambio.description == ("La cotización COT-U15004 fue rechazada. La solicitud sigue activa; para crearle "
                                  "otra cotización, reenvíasela al cliente para que la confirme.")
    assert _logs(db, "SC", sc.id, "COTIZACION_RECHAZADA") == []
    # Sin asesor vuelve a Nueva (BORRADOR).
    sin_asesor = _sc(db, "SC-U15004B", user_admin, con_asesor=False)
    cot_b = _cot(db, "COT-U15004B", sin_asesor)
    assert _patch_cot(app_client, admin_token, cot_b.id, estado="RECHAZADA").status_code == 200
    db.refresh(sin_asesor)
    assert sin_asesor.estado == "BORRADOR"


def test_cancelar_el_pedido_no_cambia_la_solicitud(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SalesQuotation
    sc = _sc(db, "SC-U15005", user_admin, modalidad_pago=CREDITO, gate1_confirmed_at=AHORA(),
             customer_email="cliente@test.com")
    cot = _cot(db, "COT-U15005", sc, estado="CONFIRMADA", gate2_confirmed_at=AHORA(), productos=[LINEA_CON_PRECIO],
               total_cop=1000, subtotal_cop=1000, anticipo_cop=0, customer_email="cliente@test.com")
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    pven_id = resp.json()["data"]["sale_order_id"]
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{pven_id}", json={
        "estado": "CANCELADO", "cancellation_reason": "Cliente cambió el pedido", "updated_by": "t"},
        headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert db.get(SalesQuotation, cot.id).estado == "BORRADOR"  # H46: la COT se reabre
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"
    assert _logs(db, "SC", sc.id, "ESTADO_CHANGED") == []


def test_cotizacion_confirmada_promueve_una_solicitud_heredada(app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    casos = (("COTIZADA", "SC-U15006A"), ("PENDIENTE_CONFIRMACION", "SC-U15006B"), ("ASIGNADA", "SC-U15006C"))
    for i, (estado, numero) in enumerate(casos):
        sc = _sc(db, numero, user_admin, estado=estado, gate1_confirmed_at=None)
        cot = _cot(db, f"COT-U15006{i}", sc, estado="PENDIENTE_CONFIRMACION", productos=[LINEA_CON_PRECIO],
                   total_cop=1000)
        enlace_sc = create_confirmation_token(db, "SC", sc.id)  # un enlace de la SC que hubiera quedado vivo
        raw = create_confirmation_token(db, "COT", cot.id)
        resp = app_client.post("/api/v1/confirmar/confirmar", json={"token": raw},
                               headers={"Idempotency-Key": f"u15-006-{i}"})
        assert resp.status_code == 200, (estado, resp.text)
        db.refresh(sc)
        assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is None, estado  # gate1 no se toca
        (cambio,) = _logs(db, "SC", sc.id, "ESTADO_CHANGED")
        assert cambio.description == f"La solicitud queda confirmada: el cliente confirmó la cotización {cot.numero}"
        assert (cambio.old_estado, cambio.new_estado, cambio.user_name) == (
            estado, "CONFIRMADA", "Cliente (confirmación por link)")
        assert _token_usado(db, enlace_sc), estado
        # Confirmada por la cotización, sin la marca de Gate 1: no se le puede crear otra cotización.
        datos = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]
        assert datos["confirmacion_vigente"] is False


def test_rechazar_con_la_solicitud_sin_confirmar_no_cambia_su_estado(app_client, db, admin_token, user_admin):
    """R21: con la SC sin confirmar el rechazo no cambia su estado; el texto depende de si ya se le envio al cliente."""
    from app.core.confirmation_tokens import create_confirmation_token
    reenviar = "La solicitud sigue activa: envíasela al cliente para que la confirme o cotízala de nuevo."
    casos = (("ASIGNADA", True, reenviar),
             ("BORRADOR", False, reenviar),
             ("PENDIENTE_CONFIRMACION", True, "La solicitud sigue esperando la confirmación del cliente."))
    for i, (estado, con_asesor, cola) in enumerate(casos):
        sc = _sc(db, f"SC-U15007{i}", user_admin, con_asesor=con_asesor, estado=estado, gate1_confirmed_at=None)
        enlace = create_confirmation_token(db, "SC", sc.id)
        cot = _cot(db, f"COT-U15007{i}", sc)  # por ORM: la UI no crea COT sin confirmar hasta T3
        resp = _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA")
        assert resp.status_code == 200, (estado, resp.text)
        db.refresh(sc)
        assert sc.estado == estado
        (aviso,) = _logs(db, "SC", sc.id, "COTIZACION_RECHAZADA")
        assert aviso.description == f"La cotización {cot.numero} fue rechazada. {cola}", estado
        assert (aviso.old_estado, aviso.new_estado) == (None, None)
        assert _logs(db, "SC", sc.id, "ESTADO_CHANGED") == []
        assert not _token_usado(db, enlace), estado  # el cliente todavia puede confirmar la solicitud


def test_rechazar_con_solicitud_heredada_la_saca_del_estado_heredado(app_client, db, admin_token, user_admin):
    """R29: una SC vieja en un estado heredado no se queda atascada al rechazar su unica COT activa."""
    from app.core.textos_actividad import ESTADOS_SC_HEREDADOS
    reenviar = "La solicitud sigue activa; para crearle otra cotización, reenvíasela al cliente para que la confirme."
    for i, heredado in enumerate(ESTADOS_SC_HEREDADOS):
        sc = _sc(db, f"SC-U15008{i}", user_admin, estado=heredado, gate1_confirmed_at=None)
        cot = _cot(db, f"COT-U15008{i}", sc)
        assert _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA").status_code == 200
        db.refresh(sc)
        assert sc.estado == "ASIGNADA", heredado
        (cambio,) = _logs(db, "SC", sc.id, "ESTADO_CHANGED")
        assert (cambio.old_estado, cambio.new_estado) == (heredado, "ASIGNADA")
        assert cambio.description == f"La cotización {cot.numero} fue rechazada. {reenviar}"
    # Sin asesor: Nueva.
    sin_asesor = _sc(db, "SC-U15008N", user_admin, con_asesor=False, estado="COTIZADA", gate1_confirmed_at=None)
    cot = _cot(db, "COT-U15008N", sin_asesor)
    assert _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA").status_code == 200
    db.refresh(sin_asesor)
    assert sin_asesor.estado == "BORRADOR"
    # Con la confirmacion del cliente vigente: Confirmada, lista para otra cotizacion.
    con_marca = _sc(db, "SC-U15008M", user_admin, estado="EN_ESPERA_CONFIRMACION", gate1_confirmed_at=AHORA())
    cot = _cot(db, "COT-U15008M", con_marca, estado="VENCIDA")
    assert _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA").status_code == 200
    db.refresh(con_marca)
    assert con_marca.estado == "CONFIRMADA" and con_marca.gate1_confirmed_at is not None
    (cambio,) = _logs(db, "SC", con_marca.id, "ESTADO_CHANGED")
    assert (cambio.old_estado, cambio.new_estado) == ("EN_ESPERA_CONFIRMACION", "CONFIRMADA")
    assert cambio.description == ("La cotización COT-U15008M fue rechazada. La solicitud sigue activa: ya puedes "
                                  "crearle una nueva cotización.")
    # Con otra COT activa no se toca (ni se anota).
    con_otra = _sc(db, "SC-U15008O", user_admin, estado="COTIZADA", gate1_confirmed_at=None)
    cot = _cot(db, "COT-U15008O1", con_otra)
    _cot(db, "COT-U15008O2", con_otra)
    assert _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA").status_code == 200
    db.refresh(con_otra)
    assert con_otra.estado == "COTIZADA"
    assert [l.action for l in _logs(db, "SC", con_otra.id)] == []


def test_la_sincronizacion_confirma_todo_en_un_solo_commit(db, user_admin, contador_sql):
    """C8: _log(commit=False), revoke_pending_tokens(commit=False) y un solo commit al final."""
    from app.api.v1.erp_ventas import _sincronizar_estado_solicitud_desde_cotizacion
    from app.core.confirmation_tokens import create_confirmation_token
    # Rechazo que cambia el estado
    sc = _sc(db, "SC-U15009A", user_admin, gate1_confirmed_at=None)
    cot = _cot(db, "COT-U15009A", sc, estado="RECHAZADA")
    with contador_sql.ventana() as v:
        _sincronizar_estado_solicitud_desde_cotizacion(cot, db, "t")
    assert v.commits == 1
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and len(_logs(db, "SC", sc.id, "ESTADO_CHANGED")) == 1
    # Rechazo que solo anota
    sc = _sc(db, "SC-U15009B", user_admin, gate1_confirmed_at=AHORA())
    cot = _cot(db, "COT-U15009B", sc, estado="RECHAZADA")
    with contador_sql.ventana() as v:
        _sincronizar_estado_solicitud_desde_cotizacion(cot, db, "t")
    assert v.commits == 1 and len(_logs(db, "SC", sc.id, "COTIZACION_RECHAZADA")) == 1
    # Confirmacion de la COT que confirma la SC y anula su enlace
    sc = _sc(db, "SC-U15009C", user_admin, estado="PENDIENTE_CONFIRMACION", gate1_confirmed_at=None)
    enlace = create_confirmation_token(db, "SC", sc.id)
    cot = _cot(db, "COT-U15009C", sc, estado="CONFIRMADA")
    with contador_sql.ventana() as v:
        _sincronizar_estado_solicitud_desde_cotizacion(cot, db)
    assert v.commits == 1
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and _token_usado(db, enlace)
    # Una COT en otro estado no toca la SC (ni hace commit)
    sc = _sc(db, "SC-U15009D", user_admin, estado="ASIGNADA", gate1_confirmed_at=None)
    for estado in ("BORRADOR", "ENVIADA", "PENDIENTE_CONFIRMACION", "VENCIDA"):
        cot = _cot(db, f"COT-U15009D{estado[:3]}", sc, estado=estado)
        with contador_sql.ventana() as v:
            _sincronizar_estado_solicitud_desde_cotizacion(cot, db, "t")
        assert v.commits == 0, estado
        db.refresh(sc)
        assert sc.estado == "ASIGNADA", estado
    assert _logs(db, "SC", sc.id) == []


# ─── confirmacion_vigente y textos de update_solicitud ────────────────────────────────────────────────────────

def test_confirmacion_vigente_de_la_solicitud(app_client, db, admin_token, user_admin):
    from app.api.v1.erp_ventas import _confirmacion_vigente_sc, _sc_dict
    casos = (("CONFIRMADA", AHORA(), True), ("CONFIRMADA", None, False), ("COTIZADA", AHORA(), False),
             ("ASIGNADA", None, False))
    for i, (estado, marca, esperado) in enumerate(casos):
        sc = _sc(db, f"SC-U15010{i}", user_admin, estado=estado, gate1_confirmed_at=marca)
        assert _confirmacion_vigente_sc(sc) is esperado, (estado, marca)
        assert _sc_dict(sc)["confirmacion_vigente"] is esperado, (estado, marca)
        datos = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]
        assert datos["confirmacion_vigente"] is esperado
        assert "gate1_confirmed_at" not in datos  # solo el booleano, nunca la fecha


def test_los_textos_de_la_solicitud_usan_las_etiquetas_nuevas(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-U15011A", user_admin, estado="ASIGNADA", gate1_confirmed_at=None)
    for estado, etiqueta in (("COTIZADA", "Cotizada"), ("FACTURADO", "Facturado")):
        resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": estado, "updated_by": "t"},
                                headers=auth(admin_token))
        assert resp.status_code == 400, resp.text
        assert resp.json()["detail"] == (f"El estado «{etiqueta}» no se puede asignar a mano a una solicitud: solo se "
                                         "puede reiniciar (vuelve a Nueva, o a Asignada si tiene asesor).")
    # R10: reiniciar con documentos activos
    con_cot = _sc(db, "SC-U15011B", user_admin, gate1_confirmed_at=AHORA())
    cot = _cot(db, "COT-U15011B", con_cot)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{con_cot.id}", json={"estado": "BORRADOR", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == (
        f"No se puede reiniciar la solicitud SC-U15011B: tiene documentos activos (cotización {cot.numero}). "
        "Primero rechaza la cotización; después podrás reiniciar la solicitud.")
    # Quitar el asesor: vuelve a Nueva
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"advisor_user_id": "", "advisor_name": ""},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (cambio,) = _logs(db, "SC", sc.id, "ESTADO_CHANGED")
    assert cambio.description == "Estado cambiado a Nueva (asesor retirado)"
    assert (cambio.old_estado, cambio.new_estado) == ("ASIGNADA", "BORRADOR")

