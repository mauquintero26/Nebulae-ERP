"""H40 (Bloque 2, T4, R7): re-cotizar una cotizacion que el cliente ya confirmo (o que espera su confirmacion) pide
confirmar y escribir la razon.

- COT CONFIRMADA sin pedido vigente, o PENDIENTE_CONFIRMACION, + un PATCH que cambia lo que el cliente vio (productos,
  cantidades, precios, total, descuento, TRM, fecha de entrega) sin anular_confirmacion -> 409
  detail = {codigo: 'ANULA_CONFIRMACION', estado, cambios, mensaje}; no se guarda nada y el enlace sigue vivo.
- Con anular_confirmacion=True y motivo_recotizacion (minimo 5 caracteres) -> se guarda, vuelve a Borrador, el
  renglon de paso a Borrador termina en 'Razon: ...' y la respuesta trae confirmacion_anulada=True (nivel superior).
- Razon corta -> 422 sin cambios.
- No pregunta: solo notas, anticipo manual, vincular al catalogo, COT con pedido vigente, estados fuera del ciclo de
  Gate 2 y un cambio de estado explicito.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_recotizar_confirmada
"""
import datetime

RAZON_CORTA = "Escribe la razón del cambio (mínimo 5 caracteres): queda en la Actividad de la cotización."


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _productos(total, **extra):
    return [{"product_name": "Cuna", "qty": 1, "unit_price_cop": total, "total_cop": total, **extra}]


def _cot(db, numero, estado, total=1000, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("productos", _productos(total))
    if estado == "CONFIRMADA":
        campos.setdefault("gate2_confirmed_at", datetime.datetime.utcnow())
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", estado=estado, total_cop=total,
                         subtotal_cop=total, anticipo_cop=0, **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _precio(total, **extra):
    return {"productos": _productos(total), "subtotal_cop": total, "total_cop": total, "recotizacion": True,
            "updated_by": "t", **extra}


def _patch(app_client, token, cot_id, body):
    return app_client.patch(f"/api/v1/ventas/cotizaciones/{cot_id}", json=body, headers=auth(token))


def _logs(db, cot_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == "COT", ActivityLog.entity_id == cot_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def test_recotizar_confirmada_sin_aceptar_responde_409_y_no_guarda(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40A", "CONFIRMADA")
    gate2 = cot.gate2_confirmed_at
    resp = _patch(app_client, admin_token, cot.id, _precio(1200))
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert detail["codigo"] == "ANULA_CONFIRMACION" and detail["estado"] == "CONFIRMADA"
    assert detail["cambios"] == ["Productos, cantidades o precios", "Total"]
    assert detail["mensaje"] == (
        "El cliente ya confirmó esta cotización. Si guardas estos cambios (Productos, cantidades o precios, Total), su "
        "confirmación se anula: la cotización vuelve a Borrador y tendrás que enviársela de nuevo.")
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.total_cop == 1000 and cot.gate2_confirmed_at == gate2
    assert cot.productos == _productos(1000) and cot.anticipo_cop == 0
    assert _logs(db, cot.id) == []


def test_el_409_nombra_lo_que_cambio(app_client, db, admin_token):
    casos = [
        ({"descuento_pct": 10}, ["Descuento"]),
        ({"trm_rate": 4100}, ["TRM"]),
        ({"fecha_entrega_estimada": "2026-12-01"}, ["Fecha de entrega"]),
        ({"subtotal_cop": 900}, ["Total"]),
        ({"subtotal_cop": 900, "total_cop": 900}, ["Total"]),
        ({"productos": _productos(1000, qty=2)}, ["Productos, cantidades o precios"]),
    ]
    for i, (body, cambios) in enumerate(casos):
        cot = _cot(db, f"COT-T4H40N{i}", "CONFIRMADA", trm_rate=4000)
        resp = _patch(app_client, admin_token, cot.id, {**body, "updated_by": "t"})
        assert resp.status_code == 409, (body, resp.text)
        assert resp.json()["detail"]["cambios"] == cambios, body


def test_recotizar_pendiente_sin_aceptar_deja_vivo_el_enlace(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40B", "BORRADOR")
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    token = resp.json()["link_confirmacion"].rsplit("/", 1)[-1]
    logs_antes = len(_logs(db, cot.id))
    resp = _patch(app_client, admin_token, cot.id, _precio(1500))
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert detail["codigo"] == "ANULA_CONFIRMACION" and detail["estado"] == "PENDIENTE_CONFIRMACION"
    assert detail["mensaje"] == (
        "Esta cotización está esperando la confirmación del cliente. Si guardas estos cambios (Productos, cantidades o "
        "precios, Total), el enlace que tiene el cliente deja de servir: la cotización vuelve a Borrador y tendrás que "
        "enviársela de nuevo.")
    resp = app_client.post("/api/v1/confirmar/ver", json={"token": token})
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["total_cop"] == 1000
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"
    assert len(_logs(db, cot.id)) == logs_antes


def test_aceptar_con_razon_anula_y_registra_la_razon(app_client, db, admin_token, user_admin):
    cot = _cot(db, "COT-T4H40C", "CONFIRMADA")
    body = _precio(1200, anular_confirmacion=True, motivo_recotizacion="  Proveedor subió el precio  ")
    del body["updated_by"]  # el renglon queda a nombre del usuario autenticado
    resp = _patch(app_client, admin_token, cot.id, body)
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is True
    assert "confirmacion_anulada" not in resp.json()["data"]
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.gate2_confirmed_at is None and cot.total_cop == 1200
    logs = _logs(db, cot.id)
    assert [l.action for l in logs] == ["RECOTIZADA", "ESTADO_CHANGED"]
    # motivo_recotizacion no es 'motivo': no reemplaza el titulo de la re-cotizacion.
    assert logs[0].description.startswith("Re-cotización: total $1.000 -> $1.200")
    estado = logs[1]
    assert estado.description.endswith("Razón: Proveedor subió el precio.")
    assert estado.description.startswith("Estado cambiado a Borrador")
    assert (estado.old_estado, estado.new_estado, estado.user_name) == ("CONFIRMADA", "BORRADOR", user_admin.email)
    assert estado.extra_data == {
        "motivo": "Proveedor subió el precio",
        "cambios": [{"etiqueta": "Cambió", "despues": "Productos, cantidades o precios, Total"},
                    {"etiqueta": "Razón", "despues": "Proveedor subió el precio"}]}


def test_aceptar_pendiente_con_razon_revoca_el_enlace(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40D", "BORRADOR")
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(admin_token))
    token = resp.json()["link_confirmacion"].rsplit("/", 1)[-1]
    resp = _patch(app_client, admin_token, cot.id,
                  _precio(1500, anular_confirmacion=True, motivo_recotizacion="Cambió la referencia."))
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is True
    assert app_client.post("/api/v1/confirmar/ver", json={"token": token}).status_code == 400
    ultimo = _logs(db, cot.id, "ESTADO_CHANGED")[-1]
    assert ultimo.description.endswith("Razón: Cambió la referencia.")  # sin doble punto
    assert ultimo.user_name == "t"


def test_aceptar_sin_razon_responde_422(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40E", "CONFIRMADA")
    for motivo in ("x", "    ", "abcd", None):
        body = _precio(1200, anular_confirmacion=True)
        if motivo is not None:
            body["motivo_recotizacion"] = motivo
        resp = _patch(app_client, admin_token, cot.id, body)
        assert resp.status_code == 422, (motivo, resp.text)
        assert resp.json()["detail"] == RAZON_CORTA
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.total_cop == 1000 and cot.gate2_confirmed_at is not None
    assert _logs(db, cot.id) == []


def test_cambiar_solo_notas_no_pregunta(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40F", "CONFIRMADA")
    resp = _patch(app_client, admin_token, cot.id, {"notas": "x", "updated_by": "t"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    # Mandar la bandera sin cambiar nada congelado tampoco anula nada.
    resp = _patch(app_client, admin_token, cot.id, {"notas": "y", "anular_confirmacion": True,
                                                    "motivo_recotizacion": "Por si acaso", "updated_by": "t"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.gate2_confirmed_at is not None


def test_ajustar_el_anticipo_a_mano_no_pregunta(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40G", "CONFIRMADA")
    resp = _patch(app_client, admin_token, cot.id, {"anticipo_pct_manual": 50, "anticipo_manual_nota": "Cliente VIP",
                                                    "updated_by": "t"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA"


def test_con_pedido_vigente_no_pregunta(app_client, db, admin_token):
    from app.models.erp_documents import SaleOrder
    cot = _cot(db, "COT-T4H40H", "CONFIRMADA")
    db.add(SaleOrder(numero="PVEN-T4H40H", cot_id=cot.id, customer_name="Cliente Prueba", estado="PENDIENTE_COMPRA"))
    db.commit()
    resp = _patch(app_client, admin_token, cot.id, _precio(1200))
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.total_cop == 1200


def test_borrador_no_pregunta(app_client, db, admin_token):
    for i, estado in enumerate(("BORRADOR", "RECHAZADA", "VENCIDA", "ENVIADA")):
        cot = _cot(db, f"COT-T4H40I{i}", estado)
        resp = _patch(app_client, admin_token, cot.id, _precio(1200))
        assert resp.status_code == 200, (estado, resp.text)
        assert resp.json()["confirmacion_anulada"] is False, estado


def test_vincular_sku_no_pregunta(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40J", "CONFIRMADA", productos=_productos(1000, sku_id=None, es_libre=True))
    resp = _patch(app_client, admin_token, cot.id, {"productos": _productos(1000, sku_id=42, es_libre=False),
                                                    "updated_by": "t"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.productos[0]["sku_id"] == 42


def test_cambio_de_estado_explicito_no_pregunta(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40K", "CONFIRMADA")
    resp = _patch(app_client, admin_token, cot.id, {"estado": "BORRADOR", "total_cop": 1500, "updated_by": "t"})
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.total_cop == 1500 and cot.gate2_confirmed_at is None
