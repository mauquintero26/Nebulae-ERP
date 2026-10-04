"""N10 (backend): la linea de tiempo del Pedido de Venta y la cancelacion canonica.

- GET /ventas/pedidos/{id} muestra tambien lo que fase4 registra con entity_type 'PVEN' (pagos, excepcion, reservas,
  cancelacion). Choque R12: esos 'PVEN' se filtran tambien por entity_numero == numero del pedido, porque los
  MERCANCIA_DISPONIBLE viejos guardan el id de una LINEA (con entity_numero vacio) y su id puede coincidir con el de
  un pedido ajeno.
- Orden de la linea de tiempo: created_at y luego id (los renglones de un mismo flush comparten created_at).
- POST /ventas/pedidos/{id}/cancelar acepta los estados operativos que crea Ventas (PENDIENTE_COMPRA, EN_PROCESO,
  LISTO_ENTREGA, PENDIENTE_PAGO, PAGADO, EN_TRANSITO) y sigue rechazando los ya cerrados.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_pedido_estados_y_actividad
"""
import datetime


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _pven(db, numero, **campos):
    from app.models.erp_documents import SaleOrder
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    ven = SaleOrder(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(ven); db.commit(); db.refresh(ven)
    return ven


def _log(db, entity_type, entity_id, entity_numero, action, created_at=None):
    from app.models.erp_documents import ActivityLog
    campos = {"created_at": created_at} if created_at else {}
    db.add(ActivityLog(entity_type=entity_type, entity_id=entity_id, entity_numero=entity_numero, action=action,
                       description=f"Prueba {action}", **campos))
    db.commit()


def _acciones(app_client, token, ven_id):
    resp = app_client.get(f"/api/v1/ventas/pedidos/{ven_id}", headers=auth(token))
    assert resp.status_code == 200, resp.text
    return [a["action"] for a in resp.json()["data"]["actividades"]]


def test_detalle_pedido_incluye_actividad_registrada_como_pven(app_client, db, admin_token):
    ven = _pven(db, "PVEN-N10001")
    _log(db, "PVEN", ven.id, ven.numero, "VENTA_CANCELADA")
    assert "VENTA_CANCELADA" in _acciones(app_client, admin_token, ven.id)


def test_detalle_pedido_no_mezcla_un_pven_de_otro_numero(app_client, db, admin_token):
    ven = _pven(db, "PVEN-N10002")
    _log(db, "PVEN", ven.id, "PVEN-OTRO999", "PAGO_REGISTRADO")      # mismo id, otro numero
    _log(db, "PVEN", ven.id, None, "MERCANCIA_DISPONIBLE")           # id de una linea vieja, numero NULL
    _log(db, "PVEN", ven.id, "", "ANTICIPO_RECIBIDO")                # numero vacio
    _log(db, "PVEN", ven.id, ven.numero, "VENTA_CREADA")             # el propio
    assert _acciones(app_client, admin_token, ven.id) == ["VENTA_CREADA"]


def test_detalle_pedido_mezcla_ven_y_pven_en_orden_de_created_at_y_luego_id(app_client, db, admin_token):
    ven = _pven(db, "PVEN-N10003")
    t0 = datetime.datetime(2026, 10, 3, 12, 0, 0)
    # Se insertan fuera de orden: el tercero es el mas viejo; el primero y el segundo comparten created_at (gana el id).
    _log(db, "VEN", ven.id, ven.numero, "UPDATED", t0 + datetime.timedelta(minutes=5))
    _log(db, "PVEN", ven.id, ven.numero, "PAGO_REGISTRADO", t0 + datetime.timedelta(minutes=5))
    _log(db, "VEN", ven.id, ven.numero, "CREATED", t0)
    _log(db, "PVEN", ven.id, ven.numero, "VENTA_CANCELADA", t0 + datetime.timedelta(minutes=9))
    assert _acciones(app_client, admin_token, ven.id) == ["CREATED", "UPDATED", "PAGO_REGISTRADO", "VENTA_CANCELADA"]


def test_detalle_pedido_muestra_el_aviso_de_mercancia_disponible_como_ven(app_client, db, admin_token):
    ven = _pven(db, "PVEN-N10004")
    otro = _pven(db, "PVEN-N10005")
    _log(db, "VEN", ven.id, ven.numero, "MERCANCIA_DISPONIBLE")
    assert _acciones(app_client, admin_token, ven.id) == ["MERCANCIA_DISPONIBLE"]
    assert _acciones(app_client, admin_token, otro.id) == []


def test_cancelacion_canonica_acepta_pedido_pendiente_compra(app_client, db, admin_token):
    from app.models.erp_documents import PaymentPending
    ven = _pven(db, "PVEN-N10006", estado="PENDIENTE_COMPRA", total_cop=2786923, saldo_cop=1062523)
    pxp = PaymentPending(numero="PXP-N10006", ven_id=ven.id, ven_numero=ven.numero, customer_name=ven.customer_name,
                         monto_total=2786923, monto_anticipo=1724400, monto_pendiente=1062523, estado="PENDIENTE")
    db.add(pxp); db.commit(); db.refresh(pxp)

    resp = app_client.post(f"/api/v1/ventas/pedidos/{ven.id}/cancelar", json={"motivo": "Prueba cancel"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "CANCELADO"
    db.expire_all()
    db.refresh(ven); db.refresh(pxp)
    assert ven.estado == "CANCELADO" and ven.cancellation_reason == "Prueba cancel"
    assert pxp.estado == "CANCELADA"                                  # Task 5: anular_pxps_de_pedido sigue corriendo
    assert "VENTA_CANCELADA" in _acciones(app_client, admin_token, ven.id)   # y la linea de tiempo ya lo muestra


def test_cancelacion_canonica_acepta_todos_los_estados_operativos_que_crea_ventas(app_client, db, admin_token):
    for i, estado in enumerate(("PENDIENTE_COMPRA", "EN_PROCESO", "LISTO_ENTREGA", "PENDIENTE_PAGO", "PAGADO",
                                "EN_TRANSITO")):
        ven = _pven(db, f"PVEN-N1001{i}", estado=estado)
        resp = app_client.post(f"/api/v1/ventas/pedidos/{ven.id}/cancelar", json={"motivo": "Prueba cancel"},
                               headers=auth(admin_token))
        assert resp.status_code == 200, (estado, resp.text)
        db.expire_all()
        db.refresh(ven)
        assert ven.estado == "CANCELADO", estado


def test_cancelacion_canonica_sigue_rechazando_entregado_y_facturado(app_client, db, admin_token):
    for i, estado in enumerate(("ENTREGADO", "FACTURADO", "DEVUELTO_TOTAL")):
        ven = _pven(db, f"PVEN-N1002{i}", estado=estado)
        resp = app_client.post(f"/api/v1/ventas/pedidos/{ven.id}/cancelar", json={"motivo": "Prueba cancel"},
                               headers=auth(admin_token))
        assert resp.status_code == 422, (estado, resp.text)
        db.expire_all()
        db.refresh(ven)
        assert ven.estado == estado
