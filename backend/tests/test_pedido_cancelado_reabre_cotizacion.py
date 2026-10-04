"""H46+U25: al cancelar un Pedido de Venta su cotizacion vuelve a Borrador y se puede reusar.

- Cancelar el PVEN (PATCH de la pantalla o POST /pedidos/{id}/cancelar) devuelve su COT de CONFIRMADA a BORRADOR,
  salvo que la COT tenga otro pedido vigente: revoca el enlace, limpia gate2, la SC pasa a COTIZADA y el lead a
  QUOTATION. Log de la COT con el numero del pedido cancelado.
- Un pedido CANCELADO no cuenta como "ya tiene pedido": no congela el precio, no bloquea 'Enviar al Cliente', no es
  un replay al convertir y no apaga la alerta de "COT confirmada sin pedido".
- Una COT con un pedido vigente no cambia de estado por PATCH (409).
- Un pedido cancelado sigue cancelado aunque una recepcion recalcule su estado.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_pedido_cancelado_reabre_cotizacion
"""
import datetime
import hashlib

CREDITO = "Crédito 30 días"  # anticipo 0: la conversion no pide verificacion (N1)
PRODUCTOS = [{"product_name": "X", "qty": 1, "unit_price_cop": 1000, "total_cop": 1000}]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sc(db, numero, user_admin, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "CONFIRMADA")
    campos.setdefault("modalidad_pago", CREDITO)
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", customer_email="cliente@test.com",
                         advisor_user_id=user_admin.id, advisor_name=user_admin.email,
                         productos=[{"product_name": "X", "qty": 1}], **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot_confirmada(db, numero, sc=None, **campos):
    from app.models.erp_documents import SalesQuotation
    if sc is not None:
        campos.setdefault("sc_id", sc.id)
        campos.setdefault("sc_numero", sc.numero)
    campos.setdefault("estado", "CONFIRMADA")
    campos.setdefault("gate2_confirmed_at", datetime.datetime.utcnow())
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", customer_email="cliente@test.com",
                         productos=PRODUCTOS, total_cop=1000, subtotal_cop=1000, anticipo_cop=0, **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _ven(db, numero, cot, **campos):
    from app.models.erp_documents import SaleOrder
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    ven = SaleOrder(numero=numero, cot_id=cot.id, sc_id=cot.sc_id, customer_name="Cliente Prueba", total_cop=1000,
                    **campos)
    db.add(ven); db.commit(); db.refresh(ven)
    return ven


def _logs(db, entidad, entity_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entity_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def _used_at(db, raw):
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    return db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.token_hash == hashlib.sha256(raw.encode()).hexdigest()).first().used_at


def test_cancelar_pven_reabre_la_cotizacion_y_permite_otro_pedido(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SaleOrder
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, "SC-REA001", user_admin)
    cot = _cot_confirmada(db, "COT-REA001", sc)
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    pven1_id = resp.json()["data"]["sale_order_id"]
    pven1_numero = resp.json()["data"]["pedido_venta"]["numero"]
    viejo = create_confirmation_token(db, "COT", cot.id)  # un enlace que hubiera quedado vivo

    resp = app_client.patch(f"/api/v1/ventas/pedidos/{pven1_id}", json={
        "estado": "CANCELADO", "cancellation_reason": "Cliente cambió el pedido", "updated_by": "t"},
        headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    db.refresh(cot); db.refresh(sc)
    assert cot.estado == "BORRADOR" and cot.gate2_confirmed_at is None
    assert sc.estado == "COTIZADA"
    assert _used_at(db, viejo) is not None
    ultimo = _logs(db, "COT", cot.id, "ESTADO_CHANGED")[-1]
    assert ultimo.description == (f"El pedido {pven1_numero} se canceló: la cotización vuelve a Borrador para "
                                  "ajustarla, reenviarla al cliente y crear otro pedido.")
    assert (ultimo.old_estado, ultimo.new_estado, ultimo.user_name) == ("CONFIRMADA", "BORRADOR", "t")
    assert ultimo.extra_data == {"pven_cancelado_id": pven1_id, "pven_cancelado_numero": pven1_numero}

    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    token = resp.json()["link_confirmacion"].rsplit("/", 1)[-1]
    resp = app_client.post("/api/v1/confirmar/confirmar", json={"token": token}, headers={"Idempotency-Key": "rea-001"})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA"

    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["idempotent_replay"] is False
    assert resp.json()["data"]["sale_order_id"] != pven1_id
    db.expire_all()
    pedidos = db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id).order_by(SaleOrder.id).all()
    assert [p.estado == "CANCELADO" for p in pedidos] == [True, False]


def test_convertir_no_hace_replay_de_pedido_cancelado(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-REA002", user_admin)
    cot = _cot_confirmada(db, "COT-REA002", sc)
    cancelado = _ven(db, "PVEN-REA002", cot, estado="CANCELADO", cancellation_reason="Cliente cambió el pedido")
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["idempotent_replay"] is False
    assert resp.json()["sale_order_id"] != cancelado.id


def test_cancelar_pven_sin_motivo_se_rechaza(app_client, db, admin_token, user_admin):
    """Choque N2 vs H46 (R12): el motivo faltante es 422 en todas las rutas."""
    sc = _sc(db, "SC-REA003", user_admin)
    cot = _cot_confirmada(db, "COT-REA003", sc)
    ven = _ven(db, "PVEN-REA003", cot)
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{ven.id}", json={"estado": "CANCELADO"}, headers=auth(admin_token))
    assert resp.status_code == 422, resp.text
    db.refresh(ven); db.refresh(cot)
    assert ven.estado == "PENDIENTE_COMPRA" and cot.estado == "CONFIRMADA"

    for body in ({"motivo": "         "}, {"motivo": "abc"}, {}):
        resp = app_client.post(f"/api/v1/ventas/pedidos/{ven.id}/cancelar", json=body, headers=auth(admin_token))
        assert resp.status_code == 422, (body, resp.text)
        assert resp.json()["detail"] == "Indica el motivo de la cancelación (mínimo 5 caracteres)."
    db.refresh(ven); db.refresh(cot)
    assert ven.estado == "PENDIENTE_COMPRA" and cot.estado == "CONFIRMADA"


def test_cancelacion_canonica_tambien_reabre_la_cotizacion(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-REA004", user_admin)
    cot = _cot_confirmada(db, "COT-REA004", sc)
    ven = _ven(db, "PVEN-REA004", cot, estado="CONFIRMADO")
    resp = app_client.post(f"/api/v1/ventas/pedidos/{ven.id}/cancelar", json={"motivo": "Prueba cancel"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(cot); db.refresh(sc)
    assert cot.estado == "BORRADOR" and cot.gate2_confirmed_at is None
    assert sc.estado == "COTIZADA"
    ultimo = _logs(db, "COT", cot.id, "ESTADO_CHANGED")[-1]
    assert "PVEN-REA004" in ultimo.description and ultimo.user_name == user_admin.email


def test_cotizacion_con_pedido_vigente_no_cambia_de_estado(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-REA005", user_admin)
    cot = _cot_confirmada(db, "COT-REA005", sc)
    _ven(db, "PVEN-REA005", cot)
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": "RECHAZADA", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == ("La cotización tiene el pedido PVEN-REA005 activo. Para cambiar su estado, "
                                     "primero cancela ese pedido.")
    db.refresh(cot); db.refresh(sc)
    assert cot.estado == "CONFIRMADA" and cot.gate2_confirmed_at is not None and sc.estado == "CONFIRMADA"


def test_recotizar_confirmada_con_pedido_cancelado_rompe_congelamiento(app_client, db, admin_token, user_admin):
    """H46 punto 1 (aparcado de T3): un pedido CANCELADO ya no apaga el congelamiento de precio de Gate 2."""
    sc = _sc(db, "SC-REA006", user_admin)
    cot = _cot_confirmada(db, "COT-REA006", sc)
    _ven(db, "PVEN-REA006", cot, estado="CANCELADO", cancellation_reason="Cliente cambió el pedido")
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"total_cop": 2000, "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.gate2_confirmed_at is None


def test_con_otro_pedido_vigente_la_cotizacion_no_se_reabre(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-REA007", user_admin)
    cot = _cot_confirmada(db, "COT-REA007", sc)
    uno = _ven(db, "PVEN-REA007A", cot)
    _ven(db, "PVEN-REA007B", cot)
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{uno.id}", json={
        "estado": "CANCELADO", "cancellation_reason": "Pedido duplicado"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA"
    assert _logs(db, "COT", cot.id, "ESTADO_CHANGED") == []


def test_enviar_al_cliente_nombra_el_pedido_vigente_e_ignora_los_cancelados(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SalesQuotation
    con_vigente = _cot_confirmada(db, "COT-REA008A", estado="BORRADOR", gate2_confirmed_at=None)
    _ven(db, "PVEN-REA008A", con_vigente)
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{con_vigente.id}/enviar-confirmacion", json={},
                           headers=auth(admin_token))
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == ("Esta cotización ya tiene el pedido de venta PVEN-REA008A activo; no tiene "
                                     "sentido volver a pedir confirmación.")

    solo_cancelado = _cot_confirmada(db, "COT-REA008B", estado="BORRADOR", gate2_confirmed_at=None)
    _ven(db, "PVEN-REA008B", solo_cancelado, estado="CANCELADO", cancellation_reason="Cliente cambió el pedido")
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{solo_cancelado.id}/enviar-confirmacion", json={},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert db.get(SalesQuotation, solo_cancelado.id).estado == "PENDIENTE_CONFIRMACION"


def test_el_detalle_de_la_cotizacion_lista_sus_pedidos_en_orden(app_client, db, admin_token, user_admin):
    cot = _cot_confirmada(db, "COT-REA009")
    ids = [_ven(db, f"PVEN-REA009{s}", cot, estado="CANCELADO", cancellation_reason="Pedido duplicado").id
           for s in "ABC"]
    d = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token)).json()["data"]
    assert [p["id"] for p in d["pedidos_venta"]] == ids


def test_la_alerta_de_cotizacion_confirmada_sin_pedido_ignora_los_cancelados(app_client, db, admin_token):
    viejo = datetime.datetime.utcnow() - datetime.timedelta(days=10)
    cot = _cot_confirmada(db, "COT-REA010", gate2_confirmed_at=viejo)
    _ven(db, "PVEN-REA010", cot, estado="CANCELADO", cancellation_reason="Cliente cambió el pedido")
    cot.updated_at = viejo
    db.commit()
    antes = app_client.get("/api/v1/ventas/alertas/resumen", headers=auth(admin_token)).json()["data"]["atrasados"]
    cot.estado = "BORRADOR"  # ya no es una "confirmada sin pedido"
    cot.updated_at = datetime.datetime.utcnow()
    db.commit()
    despues = app_client.get("/api/v1/ventas/alertas/resumen", headers=auth(admin_token)).json()["data"]["atrasados"]
    assert antes - despues == 1


def test_un_pedido_cancelado_sigue_cancelado_al_recalcular_su_estado(db):
    """Las recepciones (erp_compras / erp_inventario) llaman a recalculate_sale_order_state sin mirar el estado:
    un pedido cancelado (por PATCH, con sus lineas sin cancelar y mercancia reservada) no debe revivir."""
    from app.api.v1.erp_ventas_fase4 import recalculate_sale_order_state
    from app.models.erp_documents import SaleOrder
    from app.models.fase1b import SaleOrderLineErp
    for estado in ("CANCELADO", "DEVUELTO_TOTAL"):
        so = SaleOrder(numero=f"PVEN-REA011{estado[0]}", customer_name="Cliente Prueba", estado=estado,
                       total_cop=1000, saldo_cop=0, anticipo_pct_snapshot=0)
        db.add(so); db.flush()
        db.add(SaleOrderLineErp(so_id=so.id, description="Cuna", quantity=1, unit_price_cop=1000, estado="RESERVADA",
                                quantity_reserved=1))
        db.commit(); db.refresh(so)
        assert recalculate_sale_order_state(so, db) == estado
