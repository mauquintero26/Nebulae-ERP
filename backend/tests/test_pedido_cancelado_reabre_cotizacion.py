"""H46+U25: al cancelar un Pedido de Venta su cotizacion vuelve a Borrador y se puede reusar.

- Cancelar el PVEN (PATCH de la pantalla o POST /pedidos/{id}/cancelar) devuelve su COT de CONFIRMADA a BORRADOR,
  salvo que la COT tenga otro pedido vigente: revoca el enlace, limpia gate2, la SC no cambia de estado (U15: sigue
  CONFIRMADA) y el lead pasa a QUOTATION. Log de la COT con el numero del pedido cancelado.
- Un pedido CANCELADO no cuenta como "ya tiene pedido": no congela el precio, no bloquea 'Enviar al Cliente', no es
  un replay al convertir y no apaga la alerta de "COT confirmada sin pedido".
- Una COT con un pedido vigente no cambia de estado por PATCH (409).
- Un pedido cancelado sigue cancelado aunque una recepcion recalcule su estado.
- A2 (revision final): cancelar por PATCH libera lo que el pedido tenia apartado en el mismo commit: reservas
  ACTIVE a RELEASED, lineas CANCELADA, items PENDIENTE de la Lista de Compras a DESCARTADO (tambien por POST
  /cancelar). Con compras asignadas (ProcurementAllocation) cancela igual y deja 'COMPRA_REVISAR' (la pantalla
  del detalle no ofrece la decision sobre la mercancia). La Lista de Compras no muestra items de pedidos
  cancelados.

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
    campos.setdefault("productos", PRODUCTOS)
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", customer_email="cliente@test.com",
                         total_cop=1000, subtotal_cop=1000, anticipo_cop=0, **campos)
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
    assert sc.estado == "CONFIRMADA"  # U15: reabrir la COT no cambia la solicitud
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
    assert sc.estado == "CONFIRMADA"  # U15: reabrir la COT no cambia la solicitud
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


# --- A2 (revision final): cancelar por PATCH libera lo apartado -------------------------------------------------

def _stock_en_la_bodega_de_la_conversion(db, sku, cantidad):
    """La conversion reserva en la primera bodega (db.query(Warehouse).first()): el stock del SKU va ahi."""
    from decimal import Decimal
    from app.models.inventory import Warehouse, InventoryLevel
    from app.models.fase1b import InventoryOwnerBalance
    bodega = db.query(Warehouse).first()
    if bodega is None:
        bodega = Warehouse(name="BodegaTest-REA", location_type="Central")
        db.add(bodega); db.flush()
    db.add(InventoryLevel(sku_id=sku.id, warehouse_id=bodega.id, quantity=Decimal(cantidad)))
    db.add(InventoryOwnerBalance(sku_id=sku.id, warehouse_id=bodega.id, owner="NEBULAE", quantity=Decimal(cantidad),
                                 updated_at=datetime.datetime.utcnow()))
    db.commit()
    return bodega


def _lineas(db, so_id):
    from app.models.fase1b import SaleOrderLineErp
    db.expire_all()
    return db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == so_id).order_by(SaleOrderLineErp.id).all()


def _reservas(db, line_id):
    from app.models.fase1b import InventoryReservation
    db.expire_all()
    return db.query(InventoryReservation).filter(InventoryReservation.sale_order_line_id == line_id).all()


def _items_lista(db, pven_ids):
    """Items guardados de la Lista de Compras (el JSON completo, sin los filtros del GET)."""
    from app.api.v1.erp_compras import _load_lista_compras
    return [it for it in _load_lista_compras(db) if it.get("pven_id") in pven_ids]


def _cancelar_por_patch(app_client, token, ven_id, **extra):
    return app_client.patch(f"/api/v1/ventas/pedidos/{ven_id}", json={
        "estado": "CANCELADO", "cancellation_reason": "Cliente cambió el pedido", "updated_by": "t", **extra},
        headers=auth(token))


def test_cancelar_por_patch_libera_la_reserva_y_la_lista_y_el_pedido_nuevo_reserva(app_client, db, admin_token,
                                                                                 user_admin, sku):
    _stock_en_la_bodega_de_la_conversion(db, sku, 1)  # una sola unidad: el pedido nuevo solo reserva si se libero
    productos = [
        {"product_name": "Cuna REA012", "sku_id": sku.id, "modalidad": "ENTREGA_INMEDIATA", "qty": 1,
         "unit_price_cop": 600, "total_cop": 600},
        {"product_name": "Cobija REA012", "modalidad": "POR_PEDIDO", "qty": 1, "unit_price_cop": 400, "total_cop": 400},
    ]
    sc = _sc(db, "SC-REA012", user_admin)
    cot = _cot_confirmada(db, "COT-REA012", sc, productos=productos)
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    pven1 = resp.json()["data"]["sale_order_id"]
    cuna1, cobija1 = _lineas(db, pven1)
    assert cuna1.estado == "RESERVADA" and [r.status for r in _reservas(db, cuna1.id)] == ["ACTIVE"]
    lista = app_client.get("/api/v1/compras/lista-compras?limit=200", headers=auth(admin_token))
    assert lista.status_code == 200, lista.text
    assert sorted(it["producto"] for it in _items_lista(db, {pven1})) == ["Cobija REA012", "Cuna REA012"]

    resp = _cancelar_por_patch(app_client, admin_token, pven1)
    assert resp.status_code == 200, resp.text

    reserva = _reservas(db, cuna1.id)[0]
    assert reserva.status == "RELEASED" and reserva.released_at is not None
    for linea in _lineas(db, pven1):
        assert linea.estado == "CANCELADA"
        assert linea.quantity_cancelled == linea.quantity - linea.quantity_delivered
        assert linea.quantity_reserved == 0
    assert {it["estado"] for it in _items_lista(db, {pven1})} == {"DESCARTADO"}

    # El cliente vuelve a confirmar (el enlace real lo prueba test_cancelar_pven_reabre_la_cotizacion_...).
    db.refresh(cot)
    assert cot.estado == "BORRADOR"
    cot.estado = "CONFIRMADA"
    cot.gate2_confirmed_at = datetime.datetime.utcnow()
    db.commit()
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    pven2 = resp.json()["data"]["sale_order_id"]
    assert pven2 != pven1
    cuna2 = _lineas(db, pven2)[0]
    assert cuna2.estado == "RESERVADA" and [r.status for r in _reservas(db, cuna2.id)] == ["ACTIVE"]

    lista = app_client.get("/api/v1/compras/lista-compras?limit=200", headers=auth(admin_token)).json()["data"]
    mios = [it for it in lista if it.get("pven_id") in (pven1, pven2)]
    assert sorted((it["pven_id"], it["producto"]) for it in mios) == [
        (pven2, "Cobija REA012"), (pven2, "Cuna REA012")]


def _pven_con_compra_asignada(db, numero, cot):
    """PVEN con una linea POR_PEDIDO asignada a una linea de compra (ProcurementAllocation CUSTOMER_ORDER)."""
    from decimal import Decimal
    from app.models.erp_documents import PurchaseOrderFull, Supplier
    from app.models.fase1b import SaleOrderLineErp, PurchaseOrderLine, ProcurementAllocation
    ven = _ven(db, numero, cot, estado="EN_PROCESO")
    linea = SaleOrderLineErp(so_id=ven.id, description="Cuna", quantity=Decimal("2"), unit_price_cop=500,
                             modalidad="POR_PEDIDO", estado="PENDIENTE_COMPRA")
    proveedor = Supplier(name=f"Proveedor {numero}")
    db.add_all([linea, proveedor]); db.flush()
    pec = PurchaseOrderFull(numero=f"PEC-{numero[-6:]}", supplier_id=proveedor.id, estado="APROBADO", total_cop=1000)
    db.add(pec); db.flush()
    pol = PurchaseOrderLine(pec_id=pec.id, quantity_ordered=Decimal("2"), unit_cost_cop=Decimal("300"),
                            description="Cuna")
    db.add(pol); db.flush()
    asignacion = ProcurementAllocation(po_line_id=pol.id, allocation_type="CUSTOMER_ORDER",
                                       sale_order_line_id=linea.id, quantity_allocated=Decimal("2"))
    db.add(asignacion); db.commit()
    return ven, linea, pec, asignacion


def test_cancelar_por_patch_con_compras_asignadas_cancela_y_deja_aviso_para_revisar(app_client, db, admin_token,
                                                                                  user_admin):
    """La pantalla del detalle cancela por PATCH sin ofrecer la decision sobre la mercancia (esa decision solo existe
    en POST /cancelar, que ninguna pantalla llama): en vez de un 409 sin salida, cancela y deja el aviso."""
    from app.models.fase1b import ProcurementAllocation
    cot = _cot_confirmada(db, "COT-REA013", _sc(db, "SC-REA013", user_admin))
    ven, linea, pec, asignacion = _pven_con_compra_asignada(db, "PVEN-REA013", cot)

    resp = _cancelar_por_patch(app_client, admin_token, ven.id)
    assert resp.status_code == 200, resp.text
    db.refresh(ven)
    assert ven.estado == "CANCELADO"
    assert _lineas(db, ven.id)[0].estado == "CANCELADA"
    aviso = _logs(db, "VEN", ven.id, "COMPRA_REVISAR")
    assert len(aviso) == 1
    assert aviso[0].description == (
        f"El pedido tenía compras asignadas ({pec.numero}: 2 unidades): revisar en Compras qué hacer con esa "
        "mercancía (pasarla a stock, reasignarla a otro cliente o devolverla al proveedor).")
    assert aviso[0].user_name == "t"
    # La asignacion no se toca: la decision queda para quien revise.
    db.expire_all()
    assert db.get(ProcurementAllocation, asignacion.id).sale_order_line_id == linea.id


def test_cancelar_por_la_ruta_fase4_descarta_los_items_de_la_lista(app_client, db, admin_token, user_admin):
    cot = _cot_confirmada(db, "COT-REA014", _sc(db, "SC-REA014", user_admin))
    ven = _ven(db, "PVEN-REA014", cot, productos=[{"product_name": "Silla REA014", "qty": 2}])
    app_client.get("/api/v1/compras/lista-compras?limit=200", headers=auth(admin_token))
    assert [it["estado"] for it in _items_lista(db, {ven.id})] == ["PENDIENTE"]
    resp = app_client.post(f"/api/v1/ventas/pedidos/{ven.id}/cancelar", json={"motivo": "Cliente desistió"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert [it["estado"] for it in _items_lista(db, {ven.id})] == ["DESCARTADO"]


def test_solo_se_descartan_los_items_por_comprar_del_pedido(app_client, db, admin_token, user_admin):
    """Un item ya en un pedido de compra conserva su estado (historial); el GET igual lo oculta. Un item de otro
    pedido, o con el mismo pven_id pero otro numero (id reciclado), no se toca."""
    from app.api.v1.erp_compras import _load_lista_compras, _save_lista_compras
    cot = _cot_confirmada(db, "COT-REA015", _sc(db, "SC-REA015", user_admin))
    ven = _ven(db, "PVEN-REA015", cot, estado="EN_PROCESO")
    otro = _ven(db, "PVEN-REA015B", cot, estado="EN_PROCESO")
    items = _load_lista_compras(db)
    base = max([it.get("id", 0) for it in items], default=0)
    items += [
        {"id": base + 1, "pven_id": ven.id, "pven_numero": ven.numero, "producto": "A", "estado": "PENDIENTE"},
        {"id": base + 2, "pven_id": ven.id, "pven_numero": ven.numero, "producto": "B", "estado": "EN_PEDIDO",
         "pec_id": 1, "pec_numero": "PEC-X"},
        {"id": base + 3, "pven_id": ven.id, "pven_numero": "PVEN-VIEJO", "producto": "C", "estado": "PENDIENTE"},
        {"id": base + 4, "pven_id": otro.id, "pven_numero": otro.numero, "producto": "D", "estado": "PENDIENTE"},
    ]
    _save_lista_compras(db, items)
    resp = _cancelar_por_patch(app_client, admin_token, ven.id)
    assert resp.status_code == 200, resp.text
    estados = {it["producto"]: it["estado"] for it in _items_lista(db, {ven.id, otro.id})}
    assert estados == {"A": "DESCARTADO", "B": "EN_PEDIDO", "C": "PENDIENTE", "D": "PENDIENTE"}


def test_la_lista_de_compras_no_muestra_items_de_pedidos_cancelados(app_client, db, admin_token, user_admin):
    """Red: un item que quedo PENDIENTE de un pedido ya cancelado (dato de antes del arreglo) no se muestra ni cuenta."""
    from app.api.v1.erp_compras import _load_lista_compras, _save_lista_compras
    cot = _cot_confirmada(db, "COT-REA016", _sc(db, "SC-REA016", user_admin))
    cancelado = _ven(db, "PVEN-REA016", cot, estado="CANCELADO", cancellation_reason="Cliente cambió el pedido")
    vigente = _ven(db, "PVEN-REA016B", cot, estado="EN_PROCESO")
    antes = app_client.get("/api/v1/compras/lista-compras/stats", headers=auth(admin_token)).json()["data"]
    items = _load_lista_compras(db)
    base = max([it.get("id", 0) for it in items], default=0)
    items += [
        {"id": base + 1, "pven_id": cancelado.id, "pven_numero": cancelado.numero, "producto": "Mesa REA016",
         "estado": "PENDIENTE"},
        {"id": base + 2, "pven_id": cancelado.id, "pven_numero": cancelado.numero, "producto": "Lampara REA016",
         "estado": "EN_PEDIDO"},
        {"id": base + 3, "pven_id": vigente.id, "pven_numero": vigente.numero, "producto": "Silla REA016",
         "estado": "PENDIENTE"},
    ]
    _save_lista_compras(db, items)
    for filtro in ("", "&estado=PENDIENTE", "&estado=EN_PEDIDO", "&search=REA016"):
        lista = app_client.get(f"/api/v1/compras/lista-compras?limit=100000{filtro}", headers=auth(admin_token))
        assert lista.status_code == 200, lista.text
        productos = {it["producto"] for it in lista.json()["data"]}
        assert "Mesa REA016" not in productos and "Lampara REA016" not in productos, filtro
    assert "Silla REA016" in {it["producto"] for it in app_client.get(
        "/api/v1/compras/lista-compras?limit=200&search=REA016", headers=auth(admin_token)).json()["data"]}
    # El JSON guardado no se reescribe: solo se oculta al leer. Las cuentas tampoco los incluyen.
    assert len(_items_lista(db, {cancelado.id})) == 2
    despues = app_client.get("/api/v1/compras/lista-compras/stats", headers=auth(admin_token)).json()["data"]
    assert (despues["total"] - antes["total"], despues["pendientes"] - antes["pendientes"],
            despues["en_pedido"] - antes["en_pedido"]) == (1, 1, 0)


def test_la_red_de_la_lista_tolera_un_pven_id_que_no_es_numero(app_client, db, admin_token):
    """POST /lista-compras guarda el pven_id tal como llega: uno de texto no debe romper la Lista (500)."""
    from app.api.v1.erp_compras import _load_lista_compras, _save_lista_compras
    items = _load_lista_compras(db)
    base = max([it.get("id", 0) for it in items], default=0)
    items += [{"id": base + 1, "pven_id": "abc", "pven_numero": "PVEN-X", "producto": "Raro REA017",
               "estado": "PENDIENTE"},
              {"id": base + 2, "pven_id": True, "producto": "Raro2 REA017", "estado": "PENDIENTE"}]
    _save_lista_compras(db, items)
    lista = app_client.get("/api/v1/compras/lista-compras?limit=200&search=REA017", headers=auth(admin_token))
    assert lista.status_code == 200, lista.text
    assert {it["producto"] for it in lista.json()["data"]} == {"Raro REA017", "Raro2 REA017"}
