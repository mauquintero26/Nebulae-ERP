"""N4 (y R10): una Solicitud con cotizacion o pedido de venta activos no se cancela ni vuelve a Borrador.

- POST /solicitudes/{id}/cancelar revisa los documentos: COT con estado != RECHAZADA (una VENCIDA cuenta) y PVEN con
  estado != CANCELADO (por sc_id o por cot_id de una COT de la SC) -> 409 que dice cuales y que hacer antes.
- Toda cancelacion pasa por /cancelar: PATCH {estado:'CANCELADA'} -> 400; PATCH con un estado que no es 'BORRADOR'
  -> 400. Al cancelar, el lead del CRM pasa a CANCELLED.
- R10: PATCH {estado:'BORRADOR'} sobre una SC con documentos activos -> 409 con el mismo mensaje.
- Una SC cancelada no revive por la sincronizacion COT->SC, y sus COT no se retoman, envian ni crean (409).
- 'Enviar a la papelera' una SC ya CANCELADA (pastilla vieja) solo completa eliminada_at y el motivo.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_cancelar_solicitud_con_documentos
"""
import datetime
import uuid

LINEA = {"product_name": "Cuna Colecho", "qty": 1}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sc(db, numero, user_admin, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    campos.setdefault("productos", [LINEA])
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", advisor_user_id=user_admin.id,
                         advisor_name=user_admin.email, **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, sc, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    cot = SalesQuotation(numero=numero, sc_id=sc.id, sc_numero=sc.numero, customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _ven(db, numero, sc=None, cot=None, **campos):
    from app.models.erp_documents import SaleOrder
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    ven = SaleOrder(numero=numero, sc_id=sc.id if sc else None, cot_id=cot.id if cot else None,
                    customer_name="Cliente Prueba", **campos)
    db.add(ven); db.commit(); db.refresh(ven)
    return ven


def _cancelar(app_client, token, sc_id, razon="Cliente desistio"):
    return app_client.post(f"/api/v1/ventas/solicitudes/{sc_id}/cancelar", json={"razon": razon, "user_name": "t"},
                           headers=auth(token))


def _logs(db, entidad, entity_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entity_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


# --- /cancelar con revision de documentos ---------------------------------------------------------------

def test_cancelar_solicitud_con_cotizacion_activa_se_bloquea(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CAN001", user_admin)
    cot = _cot(db, "COT-CAN001", sc)
    resp = _cancelar(app_client, admin_token, sc.id)
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert detail == (f"No se puede cancelar la solicitud SC-CAN001: tiene documentos activos (cotización {cot.numero}). "
                      "Primero rechaza la cotización; después podrás cancelar la solicitud.")
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.eliminada_at is None and sc.razon_cancelacion is None


def test_cancelar_solicitud_con_pedido_activo_se_bloquea(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CAN002", user_admin, estado="CONFIRMADA")
    cot = _cot(db, "COT-CAN002", sc, estado="CONFIRMADA")
    ven = _ven(db, "PVEN-CAN002", sc, cot)
    resp = _cancelar(app_client, admin_token, sc.id)
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert "pedido de venta PVEN-CAN002, cotización COT-CAN002" in detail
    assert "Primero cancela el pedido de venta y rechaza la cotización;" in detail
    db.refresh(sc); db.refresh(ven)  # releer de la BD: el 409 no debe haber tocado nada
    assert sc.estado == "CONFIRMADA" and sc.eliminada_at is None
    assert ven.estado == "PENDIENTE_COMPRA"


def test_un_pedido_vinculado_solo_por_la_cotizacion_tambien_cuenta(app_client, db, admin_token, user_admin):
    """Un PVEN sin sc_id cuyo cot_id es de una COT (incluso rechazada) de la SC: el mismo filtro de get_solicitud."""
    sc = _sc(db, "SC-CAN003", user_admin)
    cot = _cot(db, "COT-CAN003", sc, estado="RECHAZADA")
    _ven(db, "PVEN-CAN003", None, cot)
    resp = _cancelar(app_client, admin_token, sc.id)
    assert resp.status_code == 409, resp.text
    assert "(pedido de venta PVEN-CAN003)" in resp.json()["detail"]
    assert "Primero cancela el pedido de venta; después" in resp.json()["detail"]


def test_una_cotizacion_vencida_cuenta_como_activa(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CAN004", user_admin)
    _cot(db, "COT-CAN004A", sc, estado="VENCIDA")
    _cot(db, "COT-CAN004B", sc, estado="BORRADOR")
    resp = _cancelar(app_client, admin_token, sc.id)
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert "(cotizaciones COT-CAN004A, COT-CAN004B)" in detail
    assert "Primero rechaza las cotizaciones;" in detail


def test_cancelar_solicitud_con_cotizacion_rechazada_y_pedido_cancelado_funciona(app_client, db, admin_token, user_admin):
    from app.models.customers import Customer
    from app.models.sales import SalesOrder
    cliente = Customer(first_name="Cliente", last_name=f"CanTest-{uuid.uuid4().hex[:6]}",
                       email=f"can_{uuid.uuid4().hex[:6]}@test.com")
    db.add(cliente); db.commit(); db.refresh(cliente)
    sc = _sc(db, "SC-CAN005", user_admin, customer_id=cliente.id)
    lead = app_client.post("/api/v1/crm/leads", json={"customer_id": cliente.id, "sc_id": sc.id,
                                                      "solicitud_tipo": "Cotizacion de Producto"},
                           headers=auth(admin_token))
    assert lead.status_code in (200, 201), lead.text
    lead_id = lead.json()["data"]["id"]
    cot = _cot(db, "COT-CAN005", sc, estado="RECHAZADA")
    _ven(db, "PVEN-CAN005", sc, cot, estado="CANCELADO", cancellation_reason="Cliente desistió")

    resp = _cancelar(app_client, admin_token, sc.id)
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CANCELADA" and sc.eliminada_at is not None and sc.razon_cancelacion == "Cliente desistio"
    db.expire_all()
    assert db.query(SalesOrder).filter(SalesOrder.id == lead_id).first().status == "CANCELLED"
    assert len(_logs(db, "SC", sc.id, "CANCELLED")) == 1


# --- PATCH generico: solo 'Borrador' ---------------------------------------------------------------------

def test_patch_generico_no_cancela_solicitud(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CAN006", user_admin)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "CANCELADA", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == ("Para cancelar una solicitud usa el botón «Cancelar Solicitud»: pide el motivo y "
                                     "revisa que no tenga cotizaciones ni pedidos activos.")
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.eliminada_at is None
    assert _logs(db, "SC", sc.id) == []


def test_patch_solicitud_rechaza_estados_no_manuales(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CAN007", user_admin)
    for estado, etiqueta in (("ENTREGADO", "Entregado"), ("COTIZADA", "Cotizada"), ("EN_TRANSITO", "En tránsito")):
        resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": estado, "updated_by": "t"},
                                headers=auth(admin_token))
        assert resp.status_code == 400, (estado, resp.text)
        assert resp.json()["detail"] == (f"El estado «{etiqueta}» no se puede asignar a mano a una solicitud; "
                                         "solo «Borrador».")
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"
    # Los 400 de Gate 1 (CONFIRMADA, ASIGNADA, PENDIENTE_CONFIRMACION) siguen con su propio mensaje.
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "PENDIENTE_CONFIRMACION"},
                            headers=auth(admin_token))
    assert resp.status_code == 400 and "flujo de confirmación" in resp.json()["detail"]
    # 'Borrador' si se puede (sin documentos activos).
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "BORRADOR", "notas": "x"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


# --- R10: volver a Borrador con documentos activos ------------------------------------------------------

def test_volver_a_borrador_con_documentos_activos_se_bloquea(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CAN008", user_admin, estado="COTIZADA", gate1_confirmed_at=datetime.datetime.utcnow())
    cot = _cot(db, "COT-CAN008", sc)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "BORRADOR", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == (
        f"No se puede devolver a Borrador la solicitud SC-CAN008: tiene documentos activos (cotización {cot.numero}). "
        "Primero rechaza la cotización; después podrás devolver a Borrador la solicitud.")
    db.refresh(sc)
    assert sc.estado == "COTIZADA" and sc.gate1_confirmed_at is not None  # nada se reinicio
    assert _logs(db, "SC", sc.id) == []

    cot.estado = "RECHAZADA"
    db.commit()
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "BORRADOR", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "ASIGNADA"  # con asesor vuelve a ASIGNADA (invariante de Gate 1)


# --- Una SC cancelada no revive ni deja COT vivas -------------------------------------------------------

def test_sincronizacion_no_revive_solicitud_cancelada(db, user_admin):
    from app.api.v1.erp_ventas import _sincronizar_estado_solicitud_desde_cotizacion
    sc = _sc(db, "SC-CAN009", user_admin, estado="CANCELADA", eliminada_at=datetime.datetime.utcnow())
    cot = _cot(db, "COT-CAN009", sc, estado="CONFIRMADA")
    _sincronizar_estado_solicitud_desde_cotizacion(cot, db)
    db.refresh(sc)
    assert sc.estado == "CANCELADA"
    cot.estado = "RECHAZADA"
    db.commit()
    _sincronizar_estado_solicitud_desde_cotizacion(cot, db, "t")
    db.refresh(sc)
    assert sc.estado == "CANCELADA"


def test_no_se_retoma_ni_envia_cotizacion_de_solicitud_cancelada(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CAN010", user_admin, estado="CANCELADA", eliminada_at=datetime.datetime.utcnow())
    cot = _cot(db, "COT-CAN010", sc, estado="RECHAZADA", total_cop=1000,
               productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    mensaje = ("La solicitud SC-CAN010 está cancelada: restáurala desde la Papelera antes de retomar o enviar esta "
               "cotización.")
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": "BORRADOR", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == mensaje
    db.refresh(cot)
    assert cot.estado == "RECHAZADA"

    cot.estado = "BORRADOR"
    db.commit()
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == mensaje
    db.refresh(cot)
    assert cot.estado == "BORRADOR"

    # Rechazarla si se puede (es lo que se pide para limpiar la SC).
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": "RECHAZADA", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CANCELADA"


def test_no_se_crea_una_cotizacion_para_una_solicitud_cancelada(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SalesQuotation
    sc = _sc(db, "SC-CAN011", user_admin, estado="CANCELADA", eliminada_at=datetime.datetime.utcnow())
    resp = app_client.post("/api/v1/ventas/cotizaciones", json={
        "sc_id": sc.id, "customer_name": "Cliente Prueba", "total_cop": 1000, "subtotal_cop": 1000,
        "productos": [{"product_name": "X", "qty": 1, "unit_price_cop": 1000}]}, headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == ("La solicitud SC-CAN011 está cancelada: restáurala desde la Papelera antes de "
                                     "crearle una cotización.")
    assert db.query(SalesQuotation).filter(SalesQuotation.sc_id == sc.id).count() == 0


# --- 'Enviar a la papelera' una SC ya cancelada -----------------------------------------------------------

def test_enviar_a_papelera_una_sc_ya_cancelada_completa_eliminada_at(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CAN012", user_admin, estado="CANCELADA", notas="Nota original")
    resp = _cancelar(app_client, admin_token, sc.id, "Cancelada con la pastilla vieja")
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CANCELADA" and sc.eliminada_at is not None
    assert sc.razon_cancelacion == "Cancelada con la pastilla vieja"
    assert sc.notas == "Nota original"  # no se anexa otro '[CANCELADA] Razón'
    assert _logs(db, "SC", sc.id, "CANCELLED") == []
    (papelera,) = _logs(db, "SC", sc.id, "SENT_TO_TRASH")
    assert papelera.description == "Solicitud enviada a la papelera"

    # Si ya tenia eliminada_at y motivo, no se pisan.
    eliminada = sc.eliminada_at
    resp = _cancelar(app_client, admin_token, sc.id, "Otro motivo distinto")
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.eliminada_at == eliminada and sc.razon_cancelacion == "Cancelada con la pastilla vieja"


def test_enviar_a_papelera_una_sc_cancelada_con_documentos_activos_se_bloquea(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CAN013", user_admin, estado="CANCELADA")
    _cot(db, "COT-CAN013", sc)
    resp = _cancelar(app_client, admin_token, sc.id)
    assert resp.status_code == 409, resp.text
    db.refresh(sc)
    assert sc.eliminada_at is None


# --- Fix round: una SC cancelada solo vuelve por /restaurar --------------------------------------------------

def _cliente_con_lead(app_client, db, token, sc):
    from app.models.customers import Customer
    cliente = Customer(first_name="Cliente", last_name=f"RestTest-{uuid.uuid4().hex[:6]}",
                       email=f"rest_{uuid.uuid4().hex[:6]}@test.com")
    db.add(cliente); db.commit(); db.refresh(cliente)
    sc.customer_id = cliente.id
    db.commit()
    resp = app_client.post("/api/v1/crm/leads", json={"customer_id": cliente.id, "sc_id": sc.id,
                                                      "solicitud_tipo": "Cotizacion de Producto"}, headers=auth(token))
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["data"]


def test_una_solicitud_cancelada_no_revive_por_patch(app_client, db, admin_token, user_admin):
    """La pastilla 'Borrador' o soltarla en el Hub ya no revive una SC cancelada a medias (con eliminada_at, motivo y
    lead perdido): solo /restaurar."""
    sc = _sc(db, "SC-CAN014", user_admin)
    assert _cancelar(app_client, admin_token, sc.id).status_code == 200
    mensaje = ("La solicitud SC-CAN014 está cancelada: para volver a trabajar en ella, restáurala desde la Papelera "
               "(botón «Restaurar»).")
    for estado in ("BORRADOR", "ENTREGADO"):
        resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": estado, "updated_by": "t"},
                                headers=auth(admin_token))
        assert resp.status_code == 409, (estado, resp.text)
        assert resp.json()["detail"] == mensaje
    db.refresh(sc)
    assert sc.estado == "CANCELADA" and sc.eliminada_at is not None
    # Reenviar su propio estado (un formulario que manda todo) no es un cambio.
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "CANCELADA", "notas": "x"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


def test_restaurar_exige_una_solicitud_cancelada_y_sin_documentos_activos(app_client, db, admin_token, user_admin):
    activa = _sc(db, "SC-CAN015A", user_admin, estado="COTIZADA", gate1_confirmed_at=datetime.datetime.utcnow())
    _cot(db, "COT-CAN015A", activa)
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{activa.id}/restaurar", headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == "La solicitud SC-CAN015A no está cancelada: no hay nada que restaurar."
    db.refresh(activa)
    assert activa.estado == "COTIZADA" and activa.gate1_confirmed_at is not None  # nada se reinicio

    # Dato viejo: SC cancelada con la pastilla vieja que todavia tiene una COT activa.
    vieja = _sc(db, "SC-CAN015B", user_admin, estado="CANCELADA", eliminada_at=datetime.datetime.utcnow())
    cot = _cot(db, "COT-CAN015B", vieja)
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{vieja.id}/restaurar", headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == (
        f"No se puede restaurar la solicitud SC-CAN015B: tiene documentos activos (cotización {cot.numero}). "
        "Primero rechaza la cotización; después podrás restaurar la solicitud.")
    db.refresh(vieja)
    assert vieja.estado == "CANCELADA" and vieja.eliminada_at is not None


def test_cancelar_y_restaurar_devuelve_el_lead_a_su_etapa_inicial(app_client, db, admin_token, user_admin):
    from app.models.sales import SalesOrder
    sc = _sc(db, "SC-CAN016", user_admin)
    lead = _cliente_con_lead(app_client, db, admin_token, sc)
    inicial = db.query(SalesOrder).filter(SalesOrder.id == lead["id"]).first()
    etapa_inicial, status_inicial = inicial.pipeline_stage_id, inicial.status
    assert status_inicial != "CANCELLED"

    assert _cancelar(app_client, admin_token, sc.id).status_code == 200
    db.expire_all()
    assert db.query(SalesOrder).filter(SalesOrder.id == lead["id"]).first().status == "CANCELLED"

    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/restaurar", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "ASIGNADA"
    db.expire_all()
    orden = db.query(SalesOrder).filter(SalesOrder.id == lead["id"]).first()
    assert (orden.status, orden.pipeline_stage_id) == (status_inicial, etapa_inicial)
    db.refresh(sc)
    assert sc.eliminada_at is None
