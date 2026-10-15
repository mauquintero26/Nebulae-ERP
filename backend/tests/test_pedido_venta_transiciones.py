"""N2: el estado del Pedido de Venta por PATCH /ventas/pedidos/{id} sigue reglas (el backend es la autoridad).

- Desde un estado operativo (o heredado desconocido) se va a otro operativo, a ENTREGADO o a CANCELADO.
- ENTREGADO solo pasa a FACTURADO; FACTURADO, CANCELADO y DEVUELTO_TOTAL no cambian; PARCIALMENTE_ENTREGADO solo
  a ENTREGADO. Reenviar el mismo estado no hace nada.
- Cancelar exige motivo de al menos 5 caracteres (422, R12) y deja cancelled_at.
- Volver a marcar ENTREGADO un pedido que ya desconto inventario no descuenta otra vez (antes: 500 por
  uq_inv_op_source_doc o 422 por la bodega).
- A3 (revision final): con un total nuevo (re-cotizacion) el saldo y el anticipo salen del libro de pagos del
  pedido; los del body se ignoran.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_pedido_venta_transiciones
"""


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _ven(db, numero, **campos):
    from app.models.erp_documents import SaleOrder
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    ven = SaleOrder(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(ven); db.commit(); db.refresh(ven)
    return ven


def _patch(app_client, token, ven_id, **body):
    return app_client.patch(f"/api/v1/ventas/pedidos/{ven_id}", json=body, headers=auth(token))


def _logs(db, ven_id, accion):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    return (db.query(ActivityLog)
            .filter(ActivityLog.entity_type == "VEN", ActivityLog.entity_id == ven_id, ActivityLog.action == accion)
            .order_by(ActivityLog.id.asc()).all())


def test_un_pedido_cancelado_no_se_puede_reabrir_por_patch(app_client, db, admin_token):
    ven = _ven(db, "PVEN-TRA001", estado="CANCELADO", cancellation_reason="El cliente desistió")
    resp = _patch(app_client, admin_token, ven.id, estado="PENDIENTE_COMPRA")
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == ("El pedido PVEN-TRA001 está cancelado y no se puede reabrir. Si el cliente sigue "
                                     "interesado, ajusta la cotización y crea un pedido nuevo.")
    db.refresh(ven)
    assert ven.estado == "CANCELADO"


def test_s1_un_estado_vacio_o_falso_no_reabre_un_pedido_cancelado(app_client, db, admin_token):
    """S1 (T11): PATCH {estado:''} reabria un PVEN CANCELADO (destinos_ven_permitidos trata un estado desconocido como
    operativo) y despues {estado:'EN_PROCESO'} lo dejaba vigente otra vez. Ahora '', 0, false y null son 422 sin
    escribir nada."""
    ven = _ven(db, "PVEN-TRA016", estado="CANCELADO", cancellation_reason="El cliente desistió")
    for estado in ("", "   ", 0, False, None, [], {}):
        resp = _patch(app_client, admin_token, ven.id, estado=estado, notas="x")
        assert resp.status_code == 422, (estado, resp.text)
        assert resp.json()["detail"] == "Estado no válido.", estado
        db.expire_all()
        db.refresh(ven)
        assert (ven.estado, ven.notas) == ("CANCELADO", None), estado
    # La secuencia del ataque: '' y despues EN_PROCESO -> 422 y el 422 de 'cancelado'.
    assert _patch(app_client, admin_token, ven.id, estado="").status_code == 422
    resp = _patch(app_client, admin_token, ven.id, estado="EN_PROCESO")
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"].startswith("El pedido PVEN-TRA016 está cancelado y no se puede reabrir.")
    db.expire_all()
    db.refresh(ven)
    assert ven.estado == "CANCELADO"
    assert _logs(db, ven.id, "ESTADO_CHANGED") == [] and _logs(db, ven.id, "UPDATED") == []


def test_un_pedido_entregado_solo_puede_pasar_a_facturado(app_client, db, admin_token):
    ven = _ven(db, "PVEN-TRA002", estado="ENTREGADO")
    resp = _patch(app_client, admin_token, ven.id, estado="PENDIENTE_COMPRA")
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "Un pedido entregado solo puede pasar a Facturado."
    resp = _patch(app_client, admin_token, ven.id, estado="CANCELADO", cancellation_reason="El cliente desistió")
    assert resp.status_code == 422, resp.text
    db.refresh(ven)
    assert ven.estado == "ENTREGADO" and ven.cancellation_reason is None

    resp = _patch(app_client, admin_token, ven.id, estado="FACTURADO")
    assert resp.status_code == 200, resp.text
    resp = _patch(app_client, admin_token, ven.id, estado="EN_PROCESO")
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "El pedido PVEN-TRA002 ya está facturado; su estado no se puede cambiar."
    db.refresh(ven)
    assert ven.estado == "FACTURADO"


def test_cancelar_un_pedido_exige_motivo(app_client, db, admin_token, user_admin):
    ven = _ven(db, "PVEN-TRA003")
    mensaje = "Indica el motivo de la cancelación (mínimo 5 caracteres)."
    resp = _patch(app_client, admin_token, ven.id, estado="CANCELADO")
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == mensaje
    for motivo in ("abc", "    abc   ", None, 12):
        resp = _patch(app_client, admin_token, ven.id, estado="CANCELADO", cancellation_reason=motivo)
        assert resp.status_code == 422, (motivo, resp.text)
        assert resp.json()["detail"] == mensaje
    db.refresh(ven)
    assert ven.estado == "PENDIENTE_COMPRA" and ven.cancelled_at is None

    resp = _patch(app_client, admin_token, ven.id, estado="CANCELADO", cancellation_reason="  El cliente desistió  ")
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["estado"] == "CANCELADO"
    assert data["cancellation_reason"] == "El cliente desistió"
    assert data["cancelled_at"] is not None
    assert data["cancellation_authorized_by"] == user_admin.email


def test_los_estados_operativos_se_mueven_libremente(app_client, db, admin_token, user_admin):
    ven = _ven(db, "PVEN-TRA004")
    for estado in ("EN_PROCESO", "LISTO_ENTREGA", "EN_TRANSITO", "PENDIENTE_COMPRA"):
        resp = _patch(app_client, admin_token, ven.id, estado=estado)
        assert resp.status_code == 200, (estado, resp.text)
    # Reenviar el mismo estado no hace nada (ni registra otro cambio).
    resp = _patch(app_client, admin_token, ven.id, estado="PENDIENTE_COMPRA", notas="x")
    assert resp.status_code == 200, resp.text
    cambios = _logs(db, ven.id, "ESTADO_CHANGED")
    assert [(c.old_estado, c.new_estado) for c in cambios] == [
        ("PENDIENTE_COMPRA", "EN_PROCESO"), ("EN_PROCESO", "LISTO_ENTREGA"), ("LISTO_ENTREGA", "EN_TRANSITO"),
        ("EN_TRANSITO", "PENDIENTE_COMPRA")]
    assert all(c.user_name == user_admin.email for c in cambios)  # sin updated_by: el usuario autenticado
    # 'Facturado' solo desde Entregado.
    resp = _patch(app_client, admin_token, ven.id, estado="FACTURADO")
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "Solo un pedido entregado se puede marcar como Facturado."


def test_t11_r1_un_autor_vacio_tras_limpiar_queda_a_nombre_de_la_sesion(app_client, db, admin_token, user_admin):
    """T11 calidad, ronda 1 (2): un updated_by que queda vacio al quitarle los caracteres de control (solo U+0000) ya no
    deja el cambio de estado del pedido a nombre de 'Sistema': queda con el autor de la sesion."""
    from app.core.textos_actividad import nombre_de_usuario
    ven = _ven(db, "PVEN-TRA031")
    resp = _patch(app_client, admin_token, ven.id, estado="EN_PROCESO", updated_by="\x00")
    assert resp.status_code == 200, resp.text
    [cambio] = _logs(db, ven.id, "ESTADO_CHANGED")
    assert cambio.user_name == nombre_de_usuario(user_admin)


def test_un_estado_que_no_es_de_pedido_se_rechaza(app_client, db, admin_token):
    ven = _ven(db, "PVEN-TRA005")
    for estado, etiqueta in (("CONFIRMADA", "Confirmada"), ("DEVUELTO_TOTAL", "Devuelto"), ("PAGADO", "Pagado")):
        resp = _patch(app_client, admin_token, ven.id, estado=estado)
        assert resp.status_code == 422, (estado, resp.text)
        assert resp.json()["detail"] == f"«{etiqueta}» no es un estado válido para un Pedido de Venta."
    db.refresh(ven)
    assert ven.estado == "PENDIENTE_COMPRA"


def test_estados_de_fase4_y_heredados(app_client, db, admin_token):
    """DEVUELTO_TOTAL no cambia; PARCIALMENTE_ENTREGADO solo pasa a ENTREGADO; un estado heredado desconocido
    (PAGADO de la tienda) se trata como operativo: se puede cancelar con motivo."""
    devuelto = _ven(db, "PVEN-TRA006A", estado="DEVUELTO_TOTAL")
    resp = _patch(app_client, admin_token, devuelto.id, estado="CANCELADO", cancellation_reason="El cliente desistió")
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "El pedido PVEN-TRA006A está devuelto; su estado no se puede cambiar."

    parcial = _ven(db, "PVEN-TRA006B", estado="PARCIALMENTE_ENTREGADO")
    resp = _patch(app_client, admin_token, parcial.id, estado="CANCELADO", cancellation_reason="El cliente desistió")
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "Un pedido entregado parcialmente solo puede pasar a Entregado."
    resp = _patch(app_client, admin_token, parcial.id, estado="ENTREGADO")
    assert resp.status_code == 200, resp.text

    heredado = _ven(db, "PVEN-TRA006C", estado="PAGADO")
    resp = _patch(app_client, admin_token, heredado.id, estado="CANCELADO", cancellation_reason="El cliente desistió")
    assert resp.status_code == 200, resp.text


def test_volver_a_marcar_entregado_no_descuenta_inventario_dos_veces(app_client, db, admin_token, sku):
    from app.models.inventory import InventoryOperation
    ven = _ven(db, "PVEN-TRA007", productos=[{"product_name": "X", "qty": 1, "sku_id": sku.id}])
    db.add(InventoryOperation(operation_type="DELIVERY", status="DONE", source_document_type="PVEN",
                              source_document_id=ven.id, source_document_numero=ven.numero))
    db.commit()

    resp = _patch(app_client, admin_token, ven.id, estado="ENTREGADO", updated_by="bodega@test")
    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert db.query(InventoryOperation).filter(InventoryOperation.source_document_type == "PVEN",
                                               InventoryOperation.source_document_id == ven.id).count() == 1
    (cambio,) = _logs(db, ven.id, "ESTADO_CHANGED")
    assert "no se descuenta otra vez" in cambio.description
    assert cambio.user_name == "bodega@test"


def test_marcar_entregado_sin_despacho_previo_sigue_pidiendo_la_bodega(app_client, db, admin_token, sku):
    ven = _ven(db, "PVEN-TRA008", productos=[{"product_name": "X", "qty": 1, "sku_id": sku.id}])
    resp = _patch(app_client, admin_token, ven.id, estado="ENTREGADO")
    assert resp.status_code == 422, resp.text
    assert "bodega" in resp.json()["detail"]
    db.refresh(ven)
    assert ven.estado == "PENDIENTE_COMPRA"


# --- Fix round -----------------------------------------------------------------------------------------------

def _bodega_con_stock(db, sku, cantidad):
    import uuid
    from app.models.inventory import Warehouse, InventoryLevel
    bodega = Warehouse(name=f"BodegaTest-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(bodega); db.commit()
    nivel = InventoryLevel(sku_id=sku.id, warehouse_id=bodega.id, quantity=cantidad)
    db.add(nivel); db.commit()
    return bodega, nivel


def _linea_erp(db, ven, sku, cantidad, entregado):
    from app.models.fase1b import SaleOrderLineErp
    db.add(SaleOrderLineErp(so_id=ven.id, sku_id=sku.id, description="X", quantity=cantidad, unit_price_cop=1000,
                            quantity_delivered=entregado,
                            estado="ENTREGADA" if entregado >= cantidad else "RESERVADA"))
    db.commit()


def test_entregar_un_pedido_entregado_parcialmente_descuenta_solo_lo_que_falta(app_client, db, admin_token, sku):
    from decimal import Decimal
    from app.models.inventory import InventoryMovement, InventoryOperation
    bodega, nivel = _bodega_con_stock(db, sku, 10)
    ven = _ven(db, "PVEN-TRA009", estado="PARCIALMENTE_ENTREGADO",
               productos=[{"product_name": "X", "qty": 3, "sku_id": sku.id}])
    _linea_erp(db, ven, sku, 3, 2)  # fase4 ya entrego (y desconto) 2 de 3
    resp = _patch(app_client, admin_token, ven.id, estado="ENTREGADO", warehouse_id=bodega.id)
    assert resp.status_code == 200, resp.text
    db.refresh(nivel)
    assert nivel.quantity == Decimal("9")  # solo la unidad que faltaba
    op = db.query(InventoryOperation).filter(InventoryOperation.source_document_type == "PVEN",
                                             InventoryOperation.source_document_id == ven.id).one()
    assert [m.quantity for m in db.query(InventoryMovement).filter(InventoryMovement.operation_id == op.id)] == [
        Decimal("1")]


def test_entregar_un_pedido_ya_entregado_del_todo_por_fase4_no_descuenta_nada(app_client, db, admin_token, sku):
    from decimal import Decimal
    from app.models.inventory import InventoryOperation
    bodega, nivel = _bodega_con_stock(db, sku, 10)
    ven = _ven(db, "PVEN-TRA010", estado="PARCIALMENTE_ENTREGADO",
               productos=[{"product_name": "X", "qty": 3, "sku_id": sku.id}])
    _linea_erp(db, ven, sku, 3, 3)
    resp = _patch(app_client, admin_token, ven.id, estado="ENTREGADO")  # sin bodega: no hay nada que descontar
    assert resp.status_code == 200, resp.text
    db.refresh(nivel)
    assert nivel.quantity == Decimal("10")
    assert db.query(InventoryOperation).filter(InventoryOperation.source_document_type == "PVEN",
                                               InventoryOperation.source_document_id == ven.id).count() == 0


def test_el_patch_del_pedido_bloquea_la_fila_que_valida(app_client, db, admin_token, contador_sql):
    ven = _ven(db, "PVEN-TRA011")
    with contador_sql.ventana() as v:
        resp = _patch(app_client, admin_token, ven.id, estado="EN_PROCESO")
    assert resp.status_code == 200, resp.text
    lectura = next(s for s in v.sentencias if "FROM sale_orders" in s and "sale_orders.id =" in s)
    assert "FOR UPDATE" in lectura


def test_un_pedido_entregado_o_facturado_no_cambia_al_recalcular(db):
    """Entregas despacha por PATCH sin tocar las lineas: una recepcion o un pago que recalculan el estado no deben
    devolver un pedido ENTREGADO o FACTURADO a un estado operativo (con esas lineas daria CONFIRMADO)."""
    from app.api.v1.erp_ventas_fase4 import recalculate_sale_order_state
    from app.models.erp_documents import SaleOrder
    from app.models.fase1b import SaleOrderLineErp
    for estado in ("ENTREGADO", "FACTURADO"):
        so = SaleOrder(numero=f"PVEN-TRA012{estado[0]}", customer_name="Cliente Prueba", estado=estado,
                       total_cop=1000, saldo_cop=0, anticipo_pct_snapshot=0)
        db.add(so); db.flush()
        db.add(SaleOrderLineErp(so_id=so.id, description="Cuna", quantity=1, unit_price_cop=1000,
                                estado="PENDIENTE_COMPRA"))
        db.commit(); db.refresh(so)
        assert recalculate_sale_order_state(so, db) == estado
        so.estado = "CONFIRMADO"  # control: con un estado operativo, las mismas lineas si recalculan
        assert recalculate_sale_order_state(so, db) == "CONFIRMADO"


# --- A3 (revision final): la re-cotizacion no pisa el saldo con cuentas del navegador ---------------------------

def _pago(db, ven, tipo, monto, sufijo, estado="CONFIRMADO"):
    import datetime
    from app.models.fase4 import SaleOrderPayment
    db.add(SaleOrderPayment(sale_order_id=ven.id, tipo=tipo, monto=monto, moneda="COP", metodo_pago="Nequi",
                            fecha=datetime.date.today(), idempotency_key=f"TRA-A3-{ven.numero}-{sufijo}",
                            estado=estado, usuario="t"))
    db.commit()


def _pven_con_anticipo_y_abono(db, numero):
    """Total 1.000.000; libro: ANTICIPO 400.000 + ABONO 300.000 (y uno revertido que no cuenta) = 700.000 pagados."""
    ven = _ven(db, numero, estado="EN_PROCESO", total_cop=1000000, anticipo_cop=400000, saldo_cop=300000)
    _pago(db, ven, "ANTICIPO", 400000, "ant")
    _pago(db, ven, "ABONO", 300000, "abo")
    _pago(db, ven, "ABONO", 50000, "rev", estado="REVERTIDO")
    return ven


def test_recotizar_recalcula_saldo_y_anticipo_desde_el_libro_de_pagos(app_client, db, admin_token):
    from decimal import Decimal
    ven = _pven_con_anticipo_y_abono(db, "PVEN-TRA013")
    # Lo que mandaba la pantalla: saldo = total nuevo - anticipo (olvidaba el abono) y un anticipo cualquiera.
    resp = _patch(app_client, admin_token, ven.id, total_cop=1500000, subtotal_cop=1500000,
                  saldo_cop=1100000, anticipo_cop=999, motivo="Precios actualizados por re-cotización", updated_by="t")
    assert resp.status_code == 200, resp.text
    db.refresh(ven)
    assert ven.total_cop == Decimal("1500000")
    assert ven.saldo_cop == Decimal("800000")  # 1.500.000 - 700.000 pagados
    assert ven.anticipo_cop == Decimal("400000")  # la suma de los ANTICIPO del libro
    assert resp.json()["data"]["saldo_cop"] == 800000


def test_recotizar_con_un_saldo_inventado_lo_ignora(app_client, db, admin_token):
    from decimal import Decimal
    ven = _pven_con_anticipo_y_abono(db, "PVEN-TRA014")
    resp = _patch(app_client, admin_token, ven.id, total_cop=1000000, saldo_cop=5, updated_by="t")
    assert resp.status_code == 200, resp.text
    db.refresh(ven)
    assert (ven.total_cop, ven.saldo_cop, ven.anticipo_cop) == (Decimal("1000000"), Decimal("300000"),
                                                                Decimal("400000"))


def test_recotizar_por_debajo_de_lo_pagado_deja_saldo_cero(app_client, db, admin_token):
    from decimal import Decimal
    ven = _pven_con_anticipo_y_abono(db, "PVEN-TRA015")
    resp = _patch(app_client, admin_token, ven.id, total_cop=600000, saldo_cop=-100000, updated_by="t")
    assert resp.status_code == 200, resp.text
    db.refresh(ven)
    assert (ven.total_cop, ven.saldo_cop) == (Decimal("600000"), Decimal("0"))


# --- B11 (revision final): POST /ventas/pedidos (pedido suelto, sin COT) solo para Administracion ---------------

def test_crear_un_pedido_suelto_es_solo_de_administracion(app_client, db, admin_token, vendedor_token):
    """Desde H47 ninguna pantalla lo llama (los pedidos nacen de una COT confirmada); un asesor no lo usa."""
    from app.models.erp_documents import SaleOrder
    body = {"customer_name": "Cliente Prueba", "total_cop": 1000, "productos": [], "created_by": "t"}
    antes = db.query(SaleOrder).count()
    resp = app_client.post("/api/v1/ventas/pedidos", json=body, headers=auth(vendedor_token))
    assert resp.status_code == 403, resp.text
    assert db.query(SaleOrder).count() == antes
    resp = app_client.post("/api/v1/ventas/pedidos", json=body, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text


def test_revision_final_b9_el_422_de_una_transicion_de_fase4_nombra_los_estados(app_client, db, admin_token):
    """B9 (revisión final): el 422 de _validate_transition (erp_ventas_fase4) nombra los estados con su etiqueta
    (etiqueta_estado), nunca con el código crudo ni con la lista de Python."""
    entregado = _ven(db, "PVEN-RFB9001", estado="ENTREGADO")
    resp = app_client.post(f"/api/v1/ventas/pedidos/{entregado.id}/cancelar", json={"motivo": "El cliente desistió"},
                           headers=auth(admin_token))
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == ("Transición no permitida para Pedido de Venta: no se puede pasar de «Entregado» a "
                                     "«Cancelado». Desde «Entregado» solo se puede pasar a «Devuelto».")
    db.refresh(entregado)
    assert entregado.estado == "ENTREGADO"

    devuelto = _ven(db, "PVEN-RFB9002", estado="DEVUELTO_TOTAL")
    resp = app_client.post(f"/api/v1/ventas/pedidos/{devuelto.id}/cancelar", json={"motivo": "El cliente desistió"},
                           headers=auth(admin_token))
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == ("Transición no permitida para Pedido de Venta: no se puede pasar de «Devuelto» a "
                                     "«Cancelado». Desde «Devuelto» ya no cambia de estado.")


def test_revision_final_b9_varias_transiciones_permitidas_se_unen_con_o():
    """B9: con varias salidas permitidas se nombran todas, separadas por comas y «o» (etiquetas, nunca códigos)."""
    import pytest
    from fastapi import HTTPException
    from app.api.v1.erp_ventas_fase4 import ALLOWED_TRANSITIONS_SALE_ORDER, _validate_transition
    with pytest.raises(HTTPException) as exc:
        _validate_transition("PARCIALMENTE_ENTREGADO", "BORRADOR", ALLOWED_TRANSITIONS_SALE_ORDER, "Pedido de Venta",
                             "VEN")
    assert exc.value.status_code == 422
    assert exc.value.detail == ("Transición no permitida para Pedido de Venta: no se puede pasar de «Entregado "
                                "parcialmente» a «Borrador». Desde «Entregado parcialmente» solo se puede pasar a "
                                "«Cancelado», «Devuelto» o «Entregado».")


def test_revision_final_b9_crear_un_pedido_suelto_que_falla_en_la_base_responde_generico(app_client, db, admin_token):
    """B9: si la base rechaza el pedido suelto (aquí, un cliente que no existe: el FK), create_pedido responde un 422
    genérico en español; el error crudo de la base (str(exc.orig)) ya no sale en la respuesta."""
    resp = app_client.post("/api/v1/ventas/pedidos", json={
        "customer_id": 2147480000, "customer_name": "Cliente Prueba", "total_cop": 1000, "subtotal_cop": 1000,
        "productos": []}, headers=auth(admin_token))
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == ("No se pudo crear el pedido: revisa los datos (cliente, solicitud y cotización) e "
                                     "intenta de nuevo.")
    assert "foreign key" not in resp.text.lower() and "customer" not in resp.text.lower()
