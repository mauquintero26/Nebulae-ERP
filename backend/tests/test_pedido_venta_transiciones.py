"""N2: el estado del Pedido de Venta por PATCH /ventas/pedidos/{id} sigue reglas (el backend es la autoridad).

- Desde un estado operativo (o heredado desconocido) se va a otro operativo, a ENTREGADO o a CANCELADO.
- ENTREGADO solo pasa a FACTURADO; FACTURADO, CANCELADO y DEVUELTO_TOTAL no cambian; PARCIALMENTE_ENTREGADO solo
  a ENTREGADO. Reenviar el mismo estado no hace nada.
- Cancelar exige motivo de al menos 5 caracteres (422, R12) y deja cancelled_at.
- Volver a marcar ENTREGADO un pedido que ya desconto inventario no descuenta otra vez (antes: 500 por
  uq_inv_op_source_doc o 422 por la bodega).

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
