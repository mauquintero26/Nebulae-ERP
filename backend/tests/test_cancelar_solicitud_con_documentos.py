"""N4 (y R10): una Solicitud con cotizacion o pedido de venta activos no se cancela ni se reinicia (vuelve a Nueva).

- POST /solicitudes/{id}/cancelar revisa los documentos: COT con estado != RECHAZADA (una VENCIDA cuenta) y PVEN con
  estado != CANCELADO (por sc_id o por cot_id de una COT de la SC) -> 409 que dice cuales y que hacer antes.
- Toda cancelacion pasa por /cancelar: PATCH {estado:'CANCELADA'} -> 400; PATCH con un estado que no es 'BORRADOR'
  (reiniciar) -> 400. Al cancelar, el lead del CRM pasa a CANCELLED.
- R10: reiniciar (PATCH {estado:'BORRADOR'}) una SC con documentos activos -> 409 con el mismo mensaje y la accion
  'reiniciar' (U15/C5).
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


# --- PATCH generico: solo reiniciar (BORRADOR, 'Nueva') ------------------------------------------------------

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
        assert resp.json()["detail"] == (f"El estado «{etiqueta}» no se puede asignar a mano a una solicitud: "
                                         "solo se puede reiniciar (vuelve a Nueva, o a Asignada si tiene asesor).")
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"
    # Los 400 de Gate 1 (CONFIRMADA, ASIGNADA, PENDIENTE_CONFIRMACION) siguen con su propio mensaje.
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "PENDIENTE_CONFIRMACION"},
                            headers=auth(admin_token))
    assert resp.status_code == 400 and "flujo de confirmación" in resp.json()["detail"]
    # Reiniciar (BORRADOR) si se puede (sin documentos activos).
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "BORRADOR", "notas": "x"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


# --- R10: reiniciar con documentos activos ---------------------------------------------------------------

def test_volver_a_borrador_con_documentos_activos_se_bloquea(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CAN008", user_admin, estado="COTIZADA", gate1_confirmed_at=datetime.datetime.utcnow())
    cot = _cot(db, "COT-CAN008", sc)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "BORRADOR", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == (  # U15/C5: la accion se llama 'reiniciar'
        f"No se puede reiniciar la solicitud SC-CAN008: tiene documentos activos (cotización {cot.numero}). "
        "Primero rechaza la cotización; después podrás reiniciar la solicitud.")
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
    """Reiniciarla (la vieja pastilla 'Borrador') o soltarla en el Hub ya no revive una SC cancelada a medias (con
    eliminada_at, motivo y lead perdido): solo /restaurar."""
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
    # Reenviar su propio estado no es un cambio de estado, pero T11 calidad (A2): nada mas de una cancelada se edita por
    # este PATCH (aqui, las notas).
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "CANCELADA", "notas": "x"},
                            headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == "La solicitud está cancelada. Restáurala desde la Papelera para editarla."


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


# --- N4 (Papelera): lo que tiene historial se conserva ----------------------------------------------------------

def _hace_dias(dias):
    # Medios dias donde se cuentan dias enteros: NOW() de la base es la hora de INICIO de la transaccion (en el runner,
    # la de toda la prueba), unos segundos antes que utcnow() de Python; con dias exactos el conteo daria uno menos.
    return datetime.datetime.utcnow() - datetime.timedelta(days=dias)


def _existe(db, numero):
    from app.models.erp_documents import CustomerRequest
    db.expire_all()
    return db.query(CustomerRequest).filter(CustomerRequest.numero == numero).first() is not None


def _lead_de(db, sc):
    """Una fila del CRM (tabla sales_orders) enlazada a la SC por canonical_customer_request_id."""
    from app.models.customers import Customer
    from app.models.sales import SalesOrder
    cliente = Customer(first_name="Cliente", last_name=f"Pap-{uuid.uuid4().hex[:6]}",
                       email=f"pap_{uuid.uuid4().hex[:6]}@test.com")
    db.add(cliente); db.commit(); db.refresh(cliente)
    lead = SalesOrder(customer_id=cliente.id, status="LEAD", canonical_customer_request_id=sc.id)
    db.add(lead); db.commit(); db.refresh(lead)
    return lead


def _papelera(app_client, token):
    resp = app_client.get("/api/v1/ventas/solicitudes/papelera", headers=auth(token))
    assert resp.status_code == 200, resp.text
    return {d["numero"]: d for d in resp.json()["data"]}


def test_papelera_no_falla_con_solicitud_referenciada(app_client, db, admin_token, user_admin):
    """Antes, una SC con COT/PVEN/lead rompia el DELETE de la purga y el except dejaba la Papelera vacia para todos.
    Esta prueba borra DE VERDAD (SC canceladas hace mas de 30 dias sin referencias): solo con el runner de ROLLBACK."""
    sc_a = _sc(db, "SC-PAP001A", user_admin, estado="CANCELADA", eliminada_at=_hace_dias(40))
    _cot(db, "COT-PAP001A", sc_a, estado="RECHAZADA")
    _sc(db, "SC-PAP001B", user_admin, estado="CANCELADA", eliminada_at=_hace_dias(40))
    papelera = _papelera(app_client, admin_token)
    assert papelera["SC-PAP001A"]["tiene_documentos"] is True
    assert papelera["SC-PAP001A"]["dias_restantes"] is None
    assert "SC-PAP001B" not in papelera
    assert _existe(db, "SC-PAP001A")
    assert not _existe(db, "SC-PAP001B")  # la purga si borra la que no tiene nada colgando


def test_papelera_conserva_la_solicitud_con_pedido_o_con_lead(app_client, db, admin_token, user_admin):
    con_pedido = _sc(db, "SC-PAP002A", user_admin, estado="CANCELADA", eliminada_at=_hace_dias(45))
    _ven(db, "PVEN-PAP002A", con_pedido, None, estado="CANCELADO")
    con_lead = _sc(db, "SC-PAP002B", user_admin, estado="CANCELADA", eliminada_at=_hace_dias(45))
    _lead_de(db, con_lead)
    papelera = _papelera(app_client, admin_token)
    for numero in ("SC-PAP002A", "SC-PAP002B"):
        assert papelera[numero]["tiene_documentos"] is True, numero
        assert papelera[numero]["dias_restantes"] is None, numero
        assert _existe(db, numero), numero


def test_papelera_cuenta_los_dias_restantes_de_las_que_no_tienen_historial(app_client, db, admin_token, user_admin):
    _sc(db, "SC-PAP003A", user_admin, estado="CANCELADA", eliminada_at=_hace_dias(5.5))
    _sc(db, "SC-PAP003B", user_admin, estado="CANCELADA")  # cancelada con la pastilla vieja: sin eliminada_at
    papelera = _papelera(app_client, admin_token)
    assert papelera["SC-PAP003A"]["tiene_documentos"] is False
    assert papelera["SC-PAP003A"]["dias_restantes"] == 25
    assert papelera["SC-PAP003B"]["tiene_documentos"] is False
    # T2B (ronda 1): sin eliminada_at la purga nunca la borra -> None, como purga_programada (antes decia 30).
    assert papelera["SC-PAP003B"]["dias_restantes"] is None
    assert _existe(db, "SC-PAP003A") and _existe(db, "SC-PAP003B")


def test_un_fallo_al_purgar_no_vacia_la_papelera(app_client, db, admin_token, user_admin, monkeypatch):
    """La purga va en su propio try/except: si falla (aqui, el DELETE), el listado sigue saliendo completo."""
    import app.api.v1.erp_ventas as m
    _sc(db, "SC-PAP004", user_admin, estado="CANCELADA", eliminada_at=_hace_dias(2.5))
    texto_real = m.text

    def texto_que_falla_en_la_purga(sql, *a, **k):
        if "DELETE FROM customer_requests" in str(sql):
            raise RuntimeError("fallo simulado de la purga")
        return texto_real(sql, *a, **k)

    registro = []
    monkeypatch.setattr(m, "text", texto_que_falla_en_la_purga)
    monkeypatch.setattr(m.logger, "exception", lambda mensaje, *a, **k: registro.append(mensaje))
    papelera = _papelera(app_client, admin_token)
    assert "SC-PAP004" in papelera and papelera["SC-PAP004"]["dias_restantes"] == 28
    assert registro == ["No se pudo purgar la papelera de solicitudes"]  # el fallo queda en el log, no se traga


def test_un_fallo_al_listar_la_papelera_responde_500_con_mensaje_y_no_una_lista_vacia(app_client, db, admin_token,
                                                                                     monkeypatch):
    import app.api.v1.erp_ventas as m
    texto_real = m.text

    def texto_que_falla_al_listar(sql, *a, **k):
        if str(sql).lstrip().startswith("SELECT") and "FROM customer_requests" in str(sql):
            raise RuntimeError("fallo simulado de la consulta")
        return texto_real(sql, *a, **k)

    registro = []
    monkeypatch.setattr(m, "text", texto_que_falla_al_listar)
    monkeypatch.setattr(m.logger, "exception", lambda mensaje, *a, **k: registro.append(mensaje))
    resp = app_client.get("/api/v1/ventas/solicitudes/papelera", headers=auth(admin_token))
    assert resp.status_code == 500, resp.text
    assert resp.json()["detail"] == "No se pudo cargar la papelera de solicitudes"
    assert registro == ["No se pudo cargar la papelera de solicitudes"]


def test_eliminar_permanente_solicitud_con_documentos_devuelve_409(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-PAP005", user_admin, estado="CANCELADA", eliminada_at=_hace_dias(1))
    _cot(db, "COT-PAP005", sc, estado="RECHAZADA")
    _ven(db, "PVEN-PAP005", sc, None, estado="CANCELADO")
    _lead_de(db, sc)
    resp = app_client.delete(f"/api/v1/ventas/solicitudes/{sc.id}/permanente", headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == (
        "No se puede eliminar definitivamente la solicitud SC-PAP005: tiene documentos vinculados "
        "(cotización COT-PAP005, pedido de venta PVEN-PAP005, lead del CRM). "
        "Se conserva en la Papelera como historial.")
    assert _existe(db, "SC-PAP005")


def test_eliminar_permanente_solo_con_lead_tambien_devuelve_409(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-PAP006", user_admin, estado="CANCELADA", eliminada_at=_hace_dias(1))
    _lead_de(db, sc)
    resp = app_client.delete(f"/api/v1/ventas/solicitudes/{sc.id}/permanente", headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert "(lead del CRM)" in resp.json()["detail"] and "Se conserva" in resp.json()["detail"]
    assert _existe(db, "SC-PAP006")


def test_eliminar_permanente_solicitud_sin_documentos_funciona(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-PAP007", user_admin, estado="CANCELADA", eliminada_at=_hace_dias(1))
    resp = app_client.delete(f"/api/v1/ventas/solicitudes/{sc.id}/permanente", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"] == {"deleted": sc.id}
    assert not _existe(db, "SC-PAP007")


def test_eliminar_permanente_exige_una_solicitud_cancelada(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-PAP008", user_admin)
    resp = app_client.delete(f"/api/v1/ventas/solicitudes/{sc.id}/permanente", headers=auth(admin_token))
    assert resp.status_code == 400, resp.text
    assert _existe(db, "SC-PAP008")


def test_eliminar_permanente_con_una_referencia_de_ultimo_momento_es_409_y_no_500(app_client, db, admin_token,
                                                                                  user_admin, monkeypatch):
    """Red de seguridad: si una FK que la revision no cubre salta en el DELETE, 409 y no 500."""
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session
    sc = _sc(db, "SC-PAP009", user_admin, estado="CANCELADA", eliminada_at=_hace_dias(1))
    commit_real = Session.commit
    armado = {"si": False}

    def commit_que_viola_el_fk(self):
        # Solo la sesion de la API (no la de la prueba) y solo durante el DELETE.
        if armado["si"] and self is not db:
            raise IntegrityError("DELETE FROM customer_requests", {}, Exception("viola la llave foranea"))
        return commit_real(self)

    monkeypatch.setattr(Session, "commit", commit_que_viola_el_fk)
    armado["si"] = True
    resp = app_client.delete(f"/api/v1/ventas/solicitudes/{sc.id}/permanente", headers=auth(admin_token))
    armado["si"] = False
    assert resp.status_code == 409, resp.text
    assert "Se conserva" in resp.json()["detail"]
    assert _existe(db, "SC-PAP009")  # el rollback dejo la SC en su sitio


def test_eliminar_permanente_bloquea_la_solicitud_antes_de_revisar_sus_documentos(app_client, db, admin_token,
                                                                                  user_admin, contador_sql):
    """FOR UPDATE como restaurar_solicitud: una COT que se vincule a la SC mientras se borra espera y falla en su FK
    (sin el bloqueo, el ORM le pondria sc_id = NULL a esa COT al borrar la SC y la dejaria huerfana)."""
    sc = _sc(db, "SC-PAP010", user_admin, estado="CANCELADA", eliminada_at=_hace_dias(1))
    with contador_sql.ventana() as v:
        resp = app_client.delete(f"/api/v1/ventas/solicitudes/{sc.id}/permanente", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    lecturas = [s for s in v.sentencias if "FROM customer_requests" in s]
    assert lecturas and "FOR UPDATE" in lecturas[0], lecturas
    # El bloqueo va antes que la revision de documentos.
    revision = [i for i, s in enumerate(v.sentencias) if "FROM sales_quotations" in s]
    assert revision and v.sentencias.index(lecturas[0]) < revision[0]
