"""B3.1 (hueco 8a): re-cotizar la COT de un pedido vigente respeta los productos que el pedido ya cancelo.

Decision del usuario (2026-10-26), «Respetar lo cancelado»: el pedido toma los precios nuevos, pero los productos
cancelados siguen cancelados y su valor no vuelve al total. El servidor recalcula el total, el IVA y el saldo.

- PATCH /ventas/pedidos/{id} con productos y total_cop (la propagacion de la re-cotizacion, lib/dinero-ventas.js
  propagacionRecotizacion) en un pedido con lineas canceladas: la cantidad cancelada de cada linea se vuelve a aplicar
  sobre el JSON nuevo con iva.cancelar_cantidad; la cabecera sale de ese JSON (no del body) y el saldo del libro de
  pagos. Las lineas con unidades vigentes toman el precio, el descuento y la tarifa nuevos (sus cantidades no cambian).
- Si una linea cancelada no se puede emparejar con seguridad con el JSON nuevo: 409 con el texto exacto, sin cambios.
- Sin cancelaciones, como hoy (los totales del body), con una sola lectura de las lineas.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_recotizar_respeta_cancelados
"""
import datetime
import uuid
from decimal import Decimal

MENSAJE_409 = ("El pedido tiene productos cancelados que no coinciden con la cotización nueva: revísalo en el pedido "
               "antes de re-cotizar.")
ACCION = "CANCELADOS_RESPETADOS"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _linea(nombre, qty, precio, tarifa):
    return {"product_name": nombre, "qty": qty, "unit_price_cop": precio, "total_cop": qty * precio,
            "iva_tarifa": tarifa}


def _dos_productos(rodillo=100000, cinta=10000, qty_rodillo=2, qty_cinta=3):
    return [_linea("Rodillo", qty_rodillo, rodillo, "19"), _linea("Cinta", qty_cinta, cinta, "5")]


def _recotizar(app_client, token, cot_id, productos, descuento=0):
    """La calculadora: productos con su tarifa; el servidor calcula subtotal, IVA y total. Devuelve la respuesta."""
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot_id}", json={
        "productos": productos, "recotizacion": True, "descuento_pct": descuento, "updated_by": "t"},
        headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _pedido(app_client, db, token, productos, descuento=0):
    """COT con IVA discriminado (SC a credito: sin anticipo que verificar), CONFIRMADA con Gate 2 y convertida con
    POST /confirmar (rama JSON: una linea normalizada por producto). Devuelve (cot, pedido)."""
    from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder
    sufijo = uuid.uuid4().hex[:8].upper()
    sc = CustomerRequest(numero=f"SC-B31{sufijo}", customer_name="Cliente Prueba", modalidad_pago="Credito 30 dias",
                         estado="CONFIRMADA")
    db.add(sc); db.commit(); db.refresh(sc)
    cot = SalesQuotation(numero=f"COT-B31{sufijo}", customer_name="Cliente Prueba", estado="BORRADOR",
                         productos=[], subtotal_cop=0, total_cop=0, anticipo_cop=0, sc_id=sc.id, sc_numero=sc.numero)
    db.add(cot); db.commit(); db.refresh(cot)
    _recotizar(app_client, token, cot.id, productos, descuento)
    db.expire_all()
    db.refresh(cot)
    cot.estado = "CONFIRMADA"
    cot.gate2_confirmed_at = datetime.datetime.utcnow()
    db.commit()
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                           headers=auth(token))
    assert resp.status_code == 200, resp.text
    so = db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id).one()
    return cot, so


def _lineas(db, so):
    from app.models.fase1b import SaleOrderLineErp
    db.expire_all()
    return db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == so.id).order_by(SaleOrderLineErp.id).all()


def _cancelar(app_client, token, so_id, linea_id, cantidad=None):
    body = {"motivo": "El cliente ya no la necesita"}
    if cantidad is not None:
        body["quantity"] = cantidad
    resp = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{linea_id}/cancelar", json=body,
                           headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _pagar(app_client, token, so_id, monto):
    resp = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={
        "tipo": "ANTICIPO", "monto": monto, "idempotency_key": f"b31-{uuid.uuid4().hex}"}, headers=auth(token))
    assert resp.status_code in (200, 201), resp.text


def _propagar(app_client, token, so_id, data, cot_numero="COT-B31"):
    """El cuerpo de propagacionRecotizacion (lib/dinero-ventas.js) con la RESPUESTA del PATCH de la COT."""
    return app_client.patch(f"/api/v1/ventas/pedidos/{so_id}", json={
        "productos": data["productos"], "subtotal_cop": data["subtotal_cop"], "iva_cop": data["iva_cop"],
        "descuento_pct": data["descuento_pct"], "total_cop": data["total_cop"],
        "motivo": f"Precios actualizados por re-cotización de {cot_numero} (anticipo y pagos existentes no se "
                  "modificaron).",
        "updated_by": "t"}, headers=auth(token))


def _detalle(app_client, token, so_id):
    resp = app_client.get(f"/api/v1/ventas/pedidos/{so_id}", headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _logs(db, so, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_id == so.id, ActivityLog.entity_type.in_(("VEN", "PVEN")))
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def _foto(db, so):
    """Lo que un 409 no puede cambiar: la cabecera, el JSON y las lineas normalizadas."""
    db.expire_all()
    db.refresh(so)
    cabecera = (so.productos, so.subtotal_cop, so.tax_cop, so.total_cop, so.saldo_cop, so.anticipo_cop,
                so.descuento_pct, so.estado)
    lineas = [(l.id, l.quantity, l.quantity_delivered, l.quantity_cancelled, l.unit_price_cop, l.descuento_pct,
               l.tax_pct, l.estado) for l in _lineas(db, so)]
    return cabecera, lineas


def _filas(d):
    return [(f["tarifa"], f["base_cop"], f["iva_cop"]) for f in d["iva_por_tarifa"]]


# ─── 1: un producto cancelado del todo ─────────────────────────────────────────────

def test_cancelado_del_todo_no_vuelve_al_pedido(app_client, db, admin_token):
    """Rodillo 2 x $100.000 (19%) y Cinta 3 x $10.000 (5%); la Cinta se cancela del todo y el cliente pago $50.000.
    La re-cotizacion sube los dos precios (Rodillo $110.000, Cinta $12.000): la COT queda en $299.600, pero el pedido
    queda solo con el Rodillo al precio nuevo: 2 x $110.000 + IVA $41.800 = $261.800, y el saldo sale del libro."""
    cot, so = _pedido(app_client, db, admin_token, _dos_productos())
    assert (so.subtotal_cop, so.tax_cop, so.total_cop) == (230000, 39500, 269500)
    rodillo, cinta = _lineas(db, so)
    _pagar(app_client, admin_token, so.id, 50000)
    _cancelar(app_client, admin_token, so.id, cinta.id)
    data = _recotizar(app_client, admin_token, cot.id, _dos_productos(rodillo=110000, cinta=12000))
    assert (data["subtotal_cop"], data["iva_cop"], data["total_cop"]) == (256000, 43600, 299600)

    resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    r = resp.json()["data"]
    # El JSON queda sin el cancelado: el Rodillo con su precio nuevo, calculado con las reglas del bloque.
    assert r["productos"] == [{**data["productos"][0]}]
    assert [p["product_name"] for p in r["productos"]] == ["Rodillo"]
    assert r["productos"][0]["unit_price_cop"] == 110000 and r["productos"][0]["iva_cop"] == 41800
    # El total y el IVA salen solo del vigente; el saldo, del libro de pagos (total - $50.000).
    assert (r["subtotal_cop"], r["iva_cop"], r["total_cop"], r["saldo_cop"]) == (220000, 41800, 261800, 211800)
    assert r["iva_discriminado"] is True and _filas(r) == [("19", 220000, 41800)]
    db.expire_all()
    db.refresh(so)
    assert (so.subtotal_cop, so.tax_cop, so.total_cop, so.saldo_cop, so.anticipo_cop) == (
        220000, 41800, 261800, 211800, 50000)
    for monto in (so.subtotal_cop, so.tax_cop, so.total_cop, so.saldo_cop):
        assert monto == monto.to_integral_value(), monto
    # La linea vigente toma el precio nuevo; la cancelada sigue CANCELADA y sus cantidades no cambian.
    rodillo, cinta = _lineas(db, so)
    assert (rodillo.unit_price_cop, rodillo.tax_pct, rodillo.descuento_pct) == (110000, 19, 0)
    assert (rodillo.quantity, rodillo.quantity_cancelled, rodillo.quantity_delivered) == (2, 0, 0)
    assert cinta.estado == "CANCELADA"
    assert (cinta.quantity, cinta.quantity_cancelled, cinta.quantity_delivered) == (3, 3, 0)
    # El renglon de la Actividad, en el pedido.
    [renglon] = _logs(db, so, ACCION)
    assert renglon.entity_type == "VEN"
    assert renglon.description == "La re-cotización respetó los productos cancelados del pedido: 3 unidades de Cinta."
    assert renglon.extra_data["productos"] == [{"line_id": cinta.id, "producto": "Cinta", "cantidad_cancelada": "3"}]


# ─── 2: cancelacion parcial ────────────────────────────────────────────────────────

def test_cancelacion_parcial_queda_con_la_cantidad_vigente(app_client, db, admin_token):
    """Rodillo 5 x $100.000; se cancelan 2. Al re-cotizar a $120.000 quedan 3 Rodillos al precio nuevo (la COT sigue
    con 5): 3 x $120.000 = $360.000 + IVA $68.400, mas la Cinta sin cambios ($30.000 + $1.500)."""
    cot, so = _pedido(app_client, db, admin_token, _dos_productos(qty_rodillo=5))
    rodillo, _ = _lineas(db, so)
    _cancelar(app_client, admin_token, so.id, rodillo.id, 2)
    data = _recotizar(app_client, admin_token, cot.id, _dos_productos(rodillo=120000, qty_rodillo=5))
    assert data["total_cop"] == 745500  # la COT con los 5 Rodillos

    resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    r = resp.json()["data"]
    assert r["productos"][0] == {**data["productos"][0], "qty": 3, "total_cop": 360000, "descuento_cop": 0,
                                 "base_iva_cop": 360000, "iva_cop": 68400, "total_con_iva_cop": 428400}
    assert r["productos"][1] == data["productos"][1]
    assert (r["subtotal_cop"], r["iva_cop"], r["total_cop"], r["saldo_cop"]) == (390000, 69900, 459900, 459900)
    rodillo, cinta = _lineas(db, so)
    assert (rodillo.quantity, rodillo.quantity_cancelled, rodillo.unit_price_cop) == (5, 2, 120000)
    assert rodillo.estado != "CANCELADA" and cinta.unit_price_cop == 10000
    [renglon] = _logs(db, so, ACCION)
    assert renglon.description == "La re-cotización respetó los productos cancelados del pedido: 2 unidades de Rodillo."


# ─── 3: sin cancelaciones, como hoy ────────────────────────────────────────────────

def test_sin_cancelaciones_queda_como_hoy(app_client, db, admin_token, contador_sql):
    """Sin lineas canceladas el pedido guarda el JSON y los totales del body, como antes de B3.1; las lineas no se
    tocan y el PATCH solo lee las lineas una vez (ninguna escritura sobre ellas)."""
    cot, so = _pedido(app_client, db, admin_token, _dos_productos())
    antes = [(l.unit_price_cop, l.descuento_pct, l.tax_pct) for l in _lineas(db, so)]
    data = _recotizar(app_client, admin_token, cot.id, _dos_productos(rodillo=110000, cinta=12000))
    with contador_sql.ventana() as v:
        resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    r = resp.json()["data"]
    assert r["productos"] == data["productos"]
    assert (r["subtotal_cop"], r["iva_cop"], r["total_cop"], r["saldo_cop"]) == (256000, 43600, 299600, 299600)
    assert [(l.unit_price_cop, l.descuento_pct, l.tax_pct) for l in _lineas(db, so)] == antes
    assert _logs(db, so, ACCION) == []
    sobre_lineas = [s for s in v.sentencias if "sale_order_lines_erp" in s]
    assert len(sobre_lineas) <= 1, sobre_lineas
    assert all(s.lstrip().upper().startswith("SELECT") for s in sobre_lineas), sobre_lineas


# ─── 4: una linea cancelada que no se puede emparejar ──────────────────────────────

def test_cancelado_sin_pareja_es_409_sin_cambios(app_client, db, admin_token, contador_sql):
    """La Cinta (cancelada del todo) ya no esta en la COT, viene dos veces o con otra cantidad: no se sabe con
    seguridad que hacer con ella. 409 con el texto exacto, sin commits, sin cambios y sin renglon."""
    casos = {
        "ya no la trae": [_linea("Rodillo", 2, 110000, "19")],
        "la trae dos veces": _dos_productos(rodillo=110000) + [_linea("Cinta", 3, 10000, "5")],
        "otra cantidad": _dos_productos(rodillo=110000, qty_cinta=4),
    }
    for caso, productos in casos.items():
        cot, so = _pedido(app_client, db, admin_token, _dos_productos())
        _, cinta = _lineas(db, so)
        _cancelar(app_client, admin_token, so.id, cinta.id)
        data = _recotizar(app_client, admin_token, cot.id, productos)
        foto = _foto(db, so)
        renglones = len(_logs(db, so))
        with contador_sql.ventana() as v:
            resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
        assert resp.status_code == 409, (caso, resp.text)
        assert resp.json()["detail"] == MENSAJE_409, caso
        assert v.commits == 0, caso
        assert _foto(db, so) == foto, caso
        assert len(_logs(db, so)) == renglones, caso


# ─── 5: IVA discriminado con descuento ─────────────────────────────────────────────

def test_iva_discriminado_el_desglose_cuadra(app_client, db, admin_token):
    """El recorrido del Bloque 1 con 10% de descuento: se cancela la Cinta del todo y 2 de los 6 Rodillos, y se
    re-cotiza con precios nuevos (Rodillo $207.333, Pintura $117.777, Cinta $13.457). El pedido queda con 4 Rodillos y
    4 Pinturas: subtotal $1.300.440 - descuento $130.044 + IVA $222.375 = total $1.392.771, al peso, y el desglose por
    tarifa cuadra. Despues se puede seguir cancelando con el IVA discriminado (las lineas tienen el precio nuevo)."""
    from app.core.iva import calcular_totales_cotizacion, cancelar_cantidad
    ejemplo = [_linea("Rodillo", 6, 206769, "19"), _linea("Pintura", 4, 117000, "19"), _linea("Cinta", 10, 13200, "5")]
    cot, so = _pedido(app_client, db, admin_token, ejemplo, descuento=10)
    assert (so.subtotal_cop, so.tax_cop, so.total_cop) == (1840614, 298113, 1954666)
    rodillo, pintura, cinta = _lineas(db, so)
    _cancelar(app_client, admin_token, so.id, cinta.id)
    _cancelar(app_client, admin_token, so.id, rodillo.id, 2)
    nuevos = [_linea("Rodillo", 6, 207333, "19"), _linea("Pintura", 4, 117777, "19"), _linea("Cinta", 10, 13457, "5")]
    data = _recotizar(app_client, admin_token, cot.id, nuevos, descuento=10)
    assert data["total_cop"] == 1964047

    resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    d = _detalle(app_client, admin_token, so.id)
    assert (d["subtotal_cop"], d["descuento_cop"], d["iva_cop"], d["total_cop"]) == (1300440, 130044, 222375, 1392771)
    assert d["subtotal_cop"] - d["descuento_cop"] + d["iva_cop"] == d["total_cop"]
    assert d["iva_discriminado"] is True and _filas(d) == [("19", 1170396, 222375)]
    assert sum(f["iva_cop"] for f in d["iva_por_tarifa"]) == d["iva_cop"]
    assert sum(f["base_cop"] for f in d["iva_por_tarifa"]) == d["total_cop"] - d["iva_cop"]
    # Las mismas piezas puras que la cancelacion: el JSON es el de la COT con las cancelaciones aplicadas.
    esperado, _ = cancelar_cantidad(cancelar_cantidad(calcular_totales_cotizacion(nuevos, 10)["lineas"], 2, 10)[0],
                                    0, 2)
    assert d["productos"] == esperado
    rodillo, pintura, cinta = _lineas(db, so)
    assert [(l.unit_price_cop, l.descuento_pct, l.tax_pct) for l in (rodillo, pintura)] == [
        (207333, 10, 19), (117777, 10, 19)]
    assert (cinta.unit_price_cop, cinta.estado) == (13200, "CANCELADA")
    [renglon] = _logs(db, so, ACCION)
    assert renglon.description == ("La re-cotización respetó los productos cancelados del pedido: 2 unidades de "
                                   "Rodillo y 10 unidades de Cinta.")
    # Las lineas emparejan con el JSON nuevo: cancelar 1 Pintura sigue con el IVA discriminado y el desglose cuadra.
    _cancelar(app_client, admin_token, so.id, pintura.id, 1)
    d = _detalle(app_client, admin_token, so.id)
    assert d["iva_discriminado"] is True and [p["qty"] for p in d["productos"]] == [4, 3]
    assert sum(f["iva_cop"] for f in d["iva_por_tarifa"]) == d["iva_cop"]
    assert d["subtotal_cop"] - d["descuento_cop"] + d["iva_cop"] == d["total_cop"]
