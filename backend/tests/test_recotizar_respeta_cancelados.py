"""B3.1 (hueco 8a): re-cotizar la COT de un pedido vigente respeta los productos que el pedido ya cancelo.

Decision del usuario (2026-10-26), «Respetar lo cancelado»: el pedido toma los precios nuevos, pero los productos
cancelados siguen cancelados y su valor no vuelve al total. El servidor recalcula el total, el IVA y el saldo.

- PATCH /ventas/pedidos/{id} con productos (la propagacion de la re-cotizacion, lib/dinero-ventas.js
  propagacionRecotizacion) en un pedido con lineas canceladas, traiga o no total_cop (r1 E): la cantidad cancelada de
  cada linea se vuelve a aplicar sobre el JSON nuevo con iva.cancelar_cantidad, salvo que la COT ya la refleje (qty =
  la vigente) o que la linea cancelada del todo ya no este en la COT (r1 D); la cabecera sale de ese JSON (no del
  body) y el saldo, del libro de pagos.
- Las lineas emparejadas con unidades vigentes toman el precio, el descuento y la tarifa nuevos, haya cancelaciones o
  no (r1 A); sus cantidades no cambian. Sin cancelaciones el JSON y los totales del body quedan como hoy.
- Si una linea cancelada no se puede emparejar con seguridad: 409 con el texto exacto, sin cambios. Con cancelados y
  una COT sin IVA por producto: otro 409 (r1 E).
- r1 B: la frase «Crédito a favor del cliente: $X.» del motivo la escribe el servidor, con lo pagado del libro.
- r1 F: una COT reordenada no le impide a una cancelacion posterior ajustar el JSON.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_recotizar_respeta_cancelados
"""
import datetime
import uuid
from decimal import Decimal

MENSAJE_409 = ("El pedido tiene productos cancelados que no coinciden con la cotización nueva: en la cotización, deja "
               "cada uno con su cantidad original o con la que sigue vigente en el pedido.")
MENSAJE_409_SIN_IVA = ("El pedido tiene productos cancelados y la cotización no discrimina el IVA de cada producto: el "
                       "pedido no se puede recalcular.")
ACCION = "CANCELADOS_RESPETADOS"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _linea(nombre, qty, precio, tarifa):
    return {"product_name": nombre, "qty": qty, "unit_price_cop": precio, "total_cop": qty * precio,
            "iva_tarifa": tarifa}


def _dos_productos(rodillo=100000, cinta=10000, qty_rodillo=2, qty_cinta=3):
    return [_linea("Rodillo", qty_rodillo, rodillo, "19"), _linea("Cinta", qty_cinta, cinta, "5")]


def _ejemplo(rodillo=206769, pintura=117000, cinta=13200):
    """El recorrido del Bloque 1: Rodillo 6 (19%), Pintura 4 (19%) y Cinta 10 (5%)."""
    return [_linea("Rodillo", 6, rodillo, "19"), _linea("Pintura", 4, pintura, "19"), _linea("Cinta", 10, cinta, "5")]


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


def _precios(db, so):
    return [(l.unit_price_cop, l.descuento_pct, l.tax_pct) for l in _lineas(db, so)]


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


def _motivo(cot_numero):
    """El motivo que manda propagacionRecotizacion desde r1 B (sin la frase del crédito: la pone el servidor)."""
    return f"Precios actualizados por re-cotización de {cot_numero} (anticipo y pagos existentes no se modificaron)."


def _propagar(app_client, token, so_id, data, cot_numero="COT-B31", motivo=None, **cambios):
    """El cuerpo de propagacionRecotizacion (lib/dinero-ventas.js) con la RESPUESTA del PATCH de la COT. `cambios`
    agrega o quita llaves (None = la quita), para los cuerpos que llegan por la API directa."""
    body = {"productos": data["productos"], "subtotal_cop": data["subtotal_cop"], "iva_cop": data["iva_cop"],
            "descuento_pct": data["descuento_pct"], "total_cop": data["total_cop"],
            "motivo": motivo if motivo is not None else _motivo(cot_numero), "updated_by": "t"}
    for llave, valor in cambios.items():
        if valor is None:
            body.pop(llave, None)
        else:
            body[llave] = valor
    return app_client.patch(f"/api/v1/ventas/pedidos/{so_id}", json=body, headers=auth(token))


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


def _cuadra(d):
    """El desglose del pedido cuadra al peso: subtotal - descuento + IVA = total y el resumen por tarifa suma."""
    assert d["subtotal_cop"] - d["descuento_cop"] + d["iva_cop"] == d["total_cop"], d
    assert d["iva_discriminado"] is True, d
    assert sum(f["iva_cop"] for f in d["iva_por_tarifa"]) == d["iva_cop"], d
    assert sum(f["base_cop"] for f in d["iva_por_tarifa"]) == d["total_cop"] - d["iva_cop"], d


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
    # r1 B: sin credito (pagado $50.000 < total $261.800) el titulo es el motivo tal cual, sin frase de credito.
    assert _logs(db, so, "UPDATED")[-1].description == _motivo(cot.numero)
    assert r["credito_a_favor_cop"] == 0  # r2 (punto 3)


# ─── 2: cancelacion parcial ────────────────────────────────────────────────────────

def test_cancelacion_parcial_queda_con_la_cantidad_vigente(app_client, db, admin_token):
    """Rodillo 5 x $100.000; se cancelan 2. Al re-cotizar a $120.000 quedan 3 Rodillos al precio nuevo (la COT sigue
    con 5): 3 x $120.000 = $360.000 + IVA $68.400. r1 G: la Cinta tambien cambia de precio ($11.000) y su linea, que no
    tiene cancelaciones, lo toma: $33.000 + IVA $1.650."""
    cot, so = _pedido(app_client, db, admin_token, _dos_productos(qty_rodillo=5))
    rodillo, _ = _lineas(db, so)
    _cancelar(app_client, admin_token, so.id, rodillo.id, 2)
    data = _recotizar(app_client, admin_token, cot.id, _dos_productos(rodillo=120000, cinta=11000, qty_rodillo=5))
    assert data["total_cop"] == 748650  # la COT con los 5 Rodillos

    resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    r = resp.json()["data"]
    assert r["productos"][0] == {**data["productos"][0], "qty": 3, "total_cop": 360000, "descuento_cop": 0,
                                 "base_iva_cop": 360000, "iva_cop": 68400, "total_con_iva_cop": 428400}
    assert r["productos"][1] == data["productos"][1]
    assert (r["subtotal_cop"], r["iva_cop"], r["total_cop"], r["saldo_cop"]) == (393000, 70050, 463050, 463050)
    rodillo, cinta = _lineas(db, so)
    assert (rodillo.quantity, rodillo.quantity_cancelled, rodillo.unit_price_cop) == (5, 2, 120000)
    assert rodillo.estado != "CANCELADA"
    assert (cinta.quantity, cinta.quantity_cancelled, cinta.unit_price_cop, cinta.tax_pct) == (3, 0, 11000, 5)
    [renglon] = _logs(db, so, ACCION)
    assert renglon.description == "La re-cotización respetó los productos cancelados del pedido: 2 unidades de Rodillo."


# ─── 3 y 4: sin cancelaciones (r1 A) ───────────────────────────────────────────────

def test_sin_cancelaciones_queda_como_hoy(app_client, db, admin_token, contador_sql):
    """Sin lineas canceladas el pedido guarda el JSON y los totales del body, como antes de B3.1. r1 A: las lineas
    emparejadas SI toman el precio, el descuento y la tarifa nuevos (el punto 4 del brief habla del dinero). El PATCH
    lee las lineas una sola vez; lo demas sobre ellas son los UPDATE de las que cambian."""
    cot, so = _pedido(app_client, db, admin_token, _dos_productos())
    assert _precios(db, so) == [(100000, 0, 19), (10000, 0, 5)]
    data = _recotizar(app_client, admin_token, cot.id, _dos_productos(rodillo=110000, cinta=12000))
    with contador_sql.ventana() as v:
        resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    r = resp.json()["data"]
    assert r["productos"] == data["productos"]
    assert (r["subtotal_cop"], r["iva_cop"], r["total_cop"], r["saldo_cop"]) == (256000, 43600, 299600, 299600)
    assert _precios(db, so) == [(110000, 0, 19), (12000, 0, 5)]
    assert [(l.quantity, l.quantity_cancelled) for l in _lineas(db, so)] == [(2, 0), (3, 0)]
    assert _logs(db, so, ACCION) == []
    sobre_lineas = [s.lstrip().upper() for s in v.sentencias if "sale_order_lines_erp" in s]
    assert len([s for s in sobre_lineas if s.startswith("SELECT")]) == 1, sobre_lineas
    assert all(s.startswith(("SELECT", "UPDATE")) for s in sobre_lineas), sobre_lineas


def test_recotizar_sin_cancelaciones_y_despues_cancelar(app_client, db, admin_token):
    """r1 A, el escenario de la revision: se re-cotiza sin cancelaciones (Rodillo $110.000, Cinta $12.000) y DESPUES
    se cancela la Cinta. La cancelacion empareja con el JSON (_indice_en_productos): la Cinta sale del JSON y el total
    queda con los precios nuevos, $261.800 (antes del arreglo, el respaldo daba $238.000 con los precios viejos)."""
    cot, so = _pedido(app_client, db, admin_token, _dos_productos())
    data = _recotizar(app_client, admin_token, cot.id, _dos_productos(rodillo=110000, cinta=12000))
    assert _propagar(app_client, admin_token, so.id, data, cot.numero).status_code == 200
    _, cinta = _lineas(db, so)
    assert _cancelar(app_client, admin_token, so.id, cinta.id)["sale_order_total_cop"] == 261800
    d = _detalle(app_client, admin_token, so.id)
    assert d["productos"] == [data["productos"][0]]
    assert (d["subtotal_cop"], d["iva_cop"], d["total_cop"]) == (220000, 41800, 261800)
    _cuadra(d)
    # El camino de _indice_en_productos: la Actividad guarda la linea del JSON que salio.
    [renglon] = _logs(db, so, "LINEA_CANCELADA")
    assert renglon.extra_data["linea_retirada"] == data["productos"][1]


# ─── 5: una linea cancelada que no se puede emparejar (r1 D) ───────────────────────

def test_cancelado_sin_pareja_es_409_sin_cambios(app_client, db, admin_token, contador_sql):
    """Lo que no se sabe con seguridad: 409 con el texto exacto, sin commits, sin cambios y sin renglon.
    - La Cinta cancelada del todo (V = 0) viene dos veces en la COT, o con mas unidades que la linea.
    - El Rodillo con 5 y 2 cancelados (V = 3): la COT ya no lo trae, o lo trae con 4 (entre V y Q) o con 2 (bajo V).
    - La clave duplicada en las lineas: la COT original traia dos Cintas iguales y se cancelo una."""
    cinta, rodillo, dos_cintas = "cinta", "rodillo", "dos_cintas"
    originales = {cinta: _dos_productos(), rodillo: _dos_productos(qty_rodillo=5),
                  dos_cintas: _dos_productos() + [_linea("Cinta", 3, 10000, "5")]}
    casos = [
        ("la trae dos veces", cinta, _dos_productos(rodillo=110000) + [_linea("Cinta", 3, 10000, "5")]),
        ("mas que la linea", cinta, _dos_productos(rodillo=110000, qty_cinta=4)),
        ("ausente con vigentes", rodillo, [_linea("Cinta", 3, 12000, "5")]),
        ("entre la vigente y la original", rodillo, _dos_productos(rodillo=120000, qty_rodillo=4)),
        ("por debajo de la vigente", rodillo, _dos_productos(rodillo=120000, qty_rodillo=2)),
        ("clave duplicada en las lineas", dos_cintas, _dos_productos(rodillo=110000) + [_linea("Cinta", 3, 10000,
                                                                                               "5")]),
    ]
    for caso, origen, productos in casos:
        cot, so = _pedido(app_client, db, admin_token, originales[origen])
        lineas = _lineas(db, so)
        if origen == rodillo:
            _cancelar(app_client, admin_token, so.id, lineas[0].id, 2)
        else:
            _cancelar(app_client, admin_token, so.id, lineas[1].id)
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


def test_cancelado_del_todo_que_ya_no_esta_en_la_cot(app_client, db, admin_token):
    """r1 D: la Cinta cancelada del todo (V = 0) y el asesor la quita de la COT: ya no cuenta, asi que se acepta. El
    pedido queda con el Rodillo al precio nuevo y el renglon nombra igual la Cinta."""
    cot, so = _pedido(app_client, db, admin_token, _dos_productos())
    _, cinta = _lineas(db, so)
    _cancelar(app_client, admin_token, so.id, cinta.id)
    data = _recotizar(app_client, admin_token, cot.id, [_linea("Rodillo", 2, 110000, "19")])
    resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    r = resp.json()["data"]
    assert r["productos"] == data["productos"]
    assert (r["subtotal_cop"], r["iva_cop"], r["total_cop"]) == (220000, 41800, 261800)
    rodillo, cinta = _lineas(db, so)
    assert rodillo.unit_price_cop == 110000 and (cinta.estado, cinta.unit_price_cop) == ("CANCELADA", 10000)
    [renglon] = _logs(db, so, ACCION)
    assert renglon.description == "La re-cotización respetó los productos cancelados del pedido: 3 unidades de Cinta."


def test_la_cot_ya_refleja_la_cancelacion(app_client, db, admin_token):
    """r1 D: Rodillo 5 con 2 cancelados (V = 3) y la COT ya trae 3 Rodillos a $120.000: la COT refleja la cancelacion y
    el pedido queda con esos 3, sin volver a cancelar (no 1). La linea sigue con 5 y 2 canceladas, al precio nuevo."""
    cot, so = _pedido(app_client, db, admin_token, _dos_productos(qty_rodillo=5))
    rodillo, _ = _lineas(db, so)
    _cancelar(app_client, admin_token, so.id, rodillo.id, 2)
    data = _recotizar(app_client, admin_token, cot.id, _dos_productos(rodillo=120000, qty_rodillo=3))
    resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    r = resp.json()["data"]
    assert r["productos"] == data["productos"] and r["productos"][0]["qty"] == 3
    assert (r["subtotal_cop"], r["iva_cop"], r["total_cop"]) == (390000, 69900, 459900)
    rodillo, _ = _lineas(db, so)
    assert (rodillo.quantity, rodillo.quantity_cancelled, rodillo.unit_price_cop) == (5, 2, 120000)
    [renglon] = _logs(db, so, ACCION)
    assert renglon.description == "La re-cotización respetó los productos cancelados del pedido: 2 unidades de Rodillo."


# ─── 6: r1 E, el disparador y la COT sin IVA por producto ──────────────────────────

def test_productos_sin_total_con_cancelados_tambien_recalcula(app_client, db, admin_token):
    """r1 E (a): un PATCH con productos y SIN total_cop a un pedido con cancelados tambien entra: el total lo calcula
    el servidor y el saldo y el anticipo salen del libro (los del body se ignoran)."""
    cot, so = _pedido(app_client, db, admin_token, _dos_productos())
    _, cinta = _lineas(db, so)
    _pagar(app_client, admin_token, so.id, 50000)
    _cancelar(app_client, admin_token, so.id, cinta.id)
    data = _recotizar(app_client, admin_token, cot.id, _dos_productos(rodillo=110000, cinta=12000))
    resp = _propagar(app_client, admin_token, so.id, data, cot.numero, total_cop=None, subtotal_cop=None,
                     iva_cop=None, saldo_cop=1, anticipo_cop=1)
    assert resp.status_code == 200, resp.text
    r = resp.json()["data"]
    assert [p["product_name"] for p in r["productos"]] == ["Rodillo"]
    assert (r["subtotal_cop"], r["iva_cop"], r["total_cop"], r["saldo_cop"], r["anticipo_cop"]) == (
        220000, 41800, 261800, 211800, 50000)


def test_cot_sin_iva_por_producto_con_cancelados_es_409(app_client, db, admin_token, contador_sql):
    """r1 E (c): con cancelados y un JSON sin la tarifa de IVA de cada producto, cancelar_cantidad no se puede aplicar:
    409 con su texto propio, sin cambios."""
    cot, so = _pedido(app_client, db, admin_token, _dos_productos())
    _, cinta = _lineas(db, so)
    _cancelar(app_client, admin_token, so.id, cinta.id)
    sin_iva = [{"product_name": "Rodillo", "qty": 2, "unit_price_cop": 110000, "total_cop": 220000},
               {"product_name": "Cinta", "qty": 3, "unit_price_cop": 12000, "total_cop": 36000}]
    foto = _foto(db, so)
    with contador_sql.ventana() as v:
        resp = _propagar(app_client, admin_token, so.id, {
            "productos": sin_iva, "subtotal_cop": 256000, "iva_cop": 0, "descuento_pct": 0, "total_cop": 256000},
            cot.numero)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == MENSAJE_409_SIN_IVA
    assert v.commits == 0 and _foto(db, so) == foto


def test_iva_del_body_no_se_valida_si_lo_reemplaza_el_servidor(app_client, db, admin_token):
    """r2 (punto 2): A $10.000 y B $1.000.000, los dos al 19%; B cancelada. Un body con productos e iva_cop $191.900
    (el de la COT completa) y SIN total_cop: el servidor reemplaza el IVA, asi que el rango contra el total ACTUAL
    ($11.900) no aplica. 200 con IVA $1.900, no 422."""
    cot, so = _pedido(app_client, db, admin_token, [_linea("A", 1, 10000, "19"), _linea("B", 1, 1000000, "19")])
    _, b = _lineas(db, so)
    _cancelar(app_client, admin_token, so.id, b.id)
    data = _recotizar(app_client, admin_token, cot.id, [_linea("A", 1, 10000, "19"), _linea("B", 1, 1000000, "19")])
    assert data["iva_cop"] == 191900
    resp = _propagar(app_client, admin_token, so.id, data, cot.numero, total_cop=None, subtotal_cop=None)
    assert resp.status_code == 200, resp.text
    r = resp.json()["data"]
    assert (r["iva_cop"], r["total_cop"], [p["product_name"] for p in r["productos"]]) == (1900, 11900, ["A"])


def test_clave_duplicada_solo_en_las_lineas_es_409(app_client, db, admin_token, contador_sql):
    """r2 (punto 1a): el guardia de la clave repetida ENTRE LAS LINEAS, solo. El pedido tiene Rodillo, una Cinta
    cancelada del todo y otra Cinta viva; la COT trae Rodillo y UNA sola Cinta con qty 3. No se sabe de cual Cinta es:
    409 con el texto exacto, 0 commits, la foto igual y ningun renglon."""
    cot, so = _pedido(app_client, db, admin_token, _dos_productos() + [_linea("Cinta", 3, 10000, "5")])
    _, cinta_cancelada, _ = _lineas(db, so)
    _cancelar(app_client, admin_token, so.id, cinta_cancelada.id)
    data = _recotizar(app_client, admin_token, cot.id, _dos_productos(rodillo=110000))
    foto = _foto(db, so)
    renglones = len(_logs(db, so))
    with contador_sql.ventana() as v:
        resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == MENSAJE_409
    assert v.commits == 0 and _foto(db, so) == foto and len(_logs(db, so)) == renglones


def test_sin_cancelaciones_y_json_sin_tarifas_no_sincroniza(app_client, db, admin_token):
    """r2 (punto 1c), el ruling A: sin cancelaciones y con un JSON sin tarifas (calcular_totales_cotizacion no lo
    acepta), ninguna linea se sincroniza y todo queda como hoy: el JSON y los totales del body."""
    cot, so = _pedido(app_client, db, admin_token, _dos_productos())
    sin_iva = [{"product_name": "Rodillo", "qty": 2, "unit_price_cop": 110000, "total_cop": 220000},
               {"product_name": "Cinta", "qty": 3, "unit_price_cop": 12000, "total_cop": 36000}]
    resp = _propagar(app_client, admin_token, so.id, {
        "productos": sin_iva, "subtotal_cop": 256000, "iva_cop": 0, "descuento_pct": 0, "total_cop": 256000},
        cot.numero)
    assert resp.status_code == 200, resp.text
    r = resp.json()["data"]
    assert r["productos"] == sin_iva and (r["subtotal_cop"], r["iva_cop"], r["total_cop"]) == (256000, 0, 256000)
    assert _precios(db, so) == [(100000, 0, 19), (10000, 0, 5)]
    assert _logs(db, so, ACCION) == []


# ─── 7: r1 B, el credito a favor lo escribe el servidor ────────────────────────────

def _dos_exentos(a=100000, b=200000):
    return [_linea("Mueble", 1, a, "EXENTO"), _linea("Repisa", 1, b, "EXENTO")]


def test_credito_a_favor_lo_calcula_el_servidor(app_client, db, admin_token):
    """El escenario de la revision: Mueble $100.000 y Repisa $200.000 (exentos), el cliente pago $80.000, se cancela
    la Repisa y se re-cotiza el Mueble a $70.000 (la COT queda en $260.000). El pedido queda en $70.000 con saldo $0 y
    el credito real es $10.000: el titulo del renglon lo dice, con lo pagado del libro."""
    cot, so = _pedido(app_client, db, admin_token, _dos_exentos())
    _, repisa = _lineas(db, so)
    _pagar(app_client, admin_token, so.id, 80000)
    _cancelar(app_client, admin_token, so.id, repisa.id)
    data = _recotizar(app_client, admin_token, cot.id, _dos_exentos(a=70000, b=190000))
    assert data["total_cop"] == 260000
    resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    assert (resp.json()["data"]["total_cop"], resp.json()["data"]["saldo_cop"]) == (70000, 0)
    assert _logs(db, so, "UPDATED")[-1].description == (
        f"{_motivo(cot.numero)} Crédito a favor del cliente: $10.000.")
    # r2 (punto 3): la respuesta de la propagacion trae el mismo credito que la frase; el detalle del pedido, no.
    assert resp.json()["data"]["credito_a_favor_cop"] == 10000
    assert "credito_a_favor_cop" not in _detalle(app_client, admin_token, so.id)


def test_credito_sale_del_libro_y_no_de_total_menos_saldo(app_client, db, admin_token):
    """r2 (punto 1b): Mueble $50.000 y Repisa $200.000 (exentos); el cliente pago $80.000 y se cancela la Repisa: el
    total queda en $50.000 y el saldo, topado en $0 (total - saldo = $50.000, menos que lo pagado). Al re-cotizar el
    Mueble a $40.000 el credito es $40.000, lo pagado del libro; con total - saldo habria dado $10.000."""
    cot, so = _pedido(app_client, db, admin_token, _dos_exentos(a=50000))
    _, repisa = _lineas(db, so)
    _pagar(app_client, admin_token, so.id, 80000)
    _cancelar(app_client, admin_token, so.id, repisa.id)
    db.expire_all()
    db.refresh(so)
    assert (so.total_cop, so.saldo_cop) == (50000, 0)
    data = _recotizar(app_client, admin_token, cot.id, _dos_exentos(a=40000))
    resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    assert (resp.json()["data"]["total_cop"], resp.json()["data"]["saldo_cop"]) == (40000, 0)
    assert _logs(db, so, "UPDATED")[-1].description.endswith(" Crédito a favor del cliente: $40.000.")
    assert resp.json()["data"]["credito_a_favor_cop"] == 40000


def test_credito_a_favor_sin_cancelados_y_frase_vieja(app_client, db, admin_token):
    """Sin cancelados la frase sale con el formato de hoy. Un navegador con el codigo viejo manda su propia frase: queda
    una sola, la del servidor. Sin credito, una frase vieja se quita y no queda ninguna."""
    cot, so = _pedido(app_client, db, admin_token, _dos_exentos())
    _pagar(app_client, admin_token, so.id, 80000)
    data = _recotizar(app_client, admin_token, cot.id, _dos_exentos(a=30000, b=40000))
    resp = _propagar(app_client, admin_token, so.id, data, cot.numero,
                     motivo=f"{_motivo(cot.numero)} Crédito a favor del cliente: $1.234.")
    assert resp.status_code == 200, resp.text
    assert (resp.json()["data"]["total_cop"], resp.json()["data"]["saldo_cop"]) == (70000, 0)
    titulo = _logs(db, so, "UPDATED")[-1].description
    assert titulo == f"{_motivo(cot.numero)} Crédito a favor del cliente: $10.000.", titulo
    assert titulo.count("Crédito a favor del cliente") == 1
    assert resp.json()["data"]["credito_a_favor_cop"] == 10000
    # Sin credito (el total vuelve por encima de lo pagado): la frase vieja se quita y el credito vale 0.
    data = _recotizar(app_client, admin_token, cot.id, _dos_exentos(a=60000, b=40000))
    resp = _propagar(app_client, admin_token, so.id, data, cot.numero,
                     motivo=f"{_motivo(cot.numero)} Crédito a favor del cliente: $10.000.")
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["saldo_cop"] == 20000
    assert _logs(db, so, "UPDATED")[-1].description == _motivo(cot.numero)
    assert resp.json()["data"]["credito_a_favor_cop"] == 0


# ─── 8: IVA discriminado con descuento ─────────────────────────────────────────────

def test_iva_discriminado_el_desglose_cuadra(app_client, db, admin_token):
    """El recorrido del Bloque 1 con 10% de descuento: se cancela la Cinta del todo y 2 de los 6 Rodillos, y se
    re-cotiza con precios nuevos (Rodillo $207.333, Pintura $117.777, Cinta $13.457). El pedido queda con 4 Rodillos y
    4 Pinturas: subtotal $1.300.440 - descuento $130.044 + IVA $222.375 = total $1.392.771, al peso, y el desglose por
    tarifa cuadra. Despues se puede seguir cancelando con el IVA discriminado (las lineas tienen el precio nuevo)."""
    from app.core.iva import calcular_totales_cotizacion, cancelar_cantidad
    cot, so = _pedido(app_client, db, admin_token, _ejemplo(), descuento=10)
    assert (so.subtotal_cop, so.tax_cop, so.total_cop) == (1840614, 298113, 1954666)
    rodillo, pintura, cinta = _lineas(db, so)
    _cancelar(app_client, admin_token, so.id, cinta.id)
    _cancelar(app_client, admin_token, so.id, rodillo.id, 2)
    nuevos = _ejemplo(207333, 117777, 13457)
    data = _recotizar(app_client, admin_token, cot.id, nuevos, descuento=10)
    assert data["total_cop"] == 1964047

    resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    d = _detalle(app_client, admin_token, so.id)
    assert (d["subtotal_cop"], d["descuento_cop"], d["iva_cop"], d["total_cop"]) == (1300440, 130044, 222375, 1392771)
    _cuadra(d)
    assert _filas(d) == [("19", 1170396, 222375)]
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
    assert [p["qty"] for p in d["productos"]] == [4, 3]
    _cuadra(d)


# ─── 9: r1 F, la COT reordenada ────────────────────────────────────────────────────

def test_la_cot_reordenada_y_despues_cancelar(app_client, db, admin_token):
    """El pedido es Rodillo, Pintura y Cinta (cancelada del todo); la COT se re-cotiza en otro orden (Cinta, Pintura,
    Rodillo). Despues se cancela 1 Pintura: las lineas vivas, en orden de id, ya no coinciden una a una con el JSON,
    pero el segundo emparejamiento por clave (unica en los dos lados y con todo coincidiendo) ajusta el JSON."""
    from app.core.iva import calcular_totales_cotizacion, cancelar_cantidad
    cot, so = _pedido(app_client, db, admin_token, _ejemplo(), descuento=10)
    _, pintura, cinta = _lineas(db, so)
    _cancelar(app_client, admin_token, so.id, cinta.id)
    rodillo_n, pintura_n, cinta_n = _ejemplo(207333, 117777, 13457)
    reordenados = [cinta_n, pintura_n, rodillo_n]
    data = _recotizar(app_client, admin_token, cot.id, reordenados, descuento=10)
    resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    esperado, _ = cancelar_cantidad(calcular_totales_cotizacion(reordenados, 10)["lineas"], 0, 10)
    assert [p["product_name"] for p in resp.json()["data"]["productos"]] == ["Pintura", "Rodillo"]
    assert resp.json()["data"]["productos"] == esperado
    _cancelar(app_client, admin_token, so.id, pintura.id, 1)
    d = _detalle(app_client, admin_token, so.id)
    assert [(p["product_name"], p["qty"]) for p in d["productos"]] == [("Pintura", 3), ("Rodillo", 6)]
    assert d["productos"][1] == esperado[1]  # el Rodillo no se toca
    _cuadra(d)


# ─── 10: r1 G, bordes ──────────────────────────────────────────────────────────────

def test_entrega_parcial_previa(app_client, db, admin_token):
    """Rodillo 5 con 2 entregados y los otros 3 cancelados (la linea queda CANCELADA, pero con 2 vendidos). Al re-cotizar
    a $120.000 el JSON queda con 2 Rodillos al precio nuevo ($240.000 + IVA $45.600) y la Cinta igual: total $317.100,
    y la cabecera cuadra al peso."""
    from app.models.fase1b import SaleOrderLineErp
    cot, so = _pedido(app_client, db, admin_token, _dos_productos(qty_rodillo=5))
    rodillo, _ = _lineas(db, so)
    db.get(SaleOrderLineErp, rodillo.id).quantity_delivered = Decimal(2)
    db.commit()
    _cancelar(app_client, admin_token, so.id, rodillo.id, 3)
    assert _lineas(db, so)[0].estado == "CANCELADA"
    data = _recotizar(app_client, admin_token, cot.id, _dos_productos(rodillo=120000, qty_rodillo=5))
    resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    r = resp.json()["data"]
    assert r["productos"][0] == {**data["productos"][0], "qty": 2, "total_cop": 240000, "descuento_cop": 0,
                                 "base_iva_cop": 240000, "iva_cop": 45600, "total_con_iva_cop": 285600}
    assert (r["subtotal_cop"], r["iva_cop"], r["total_cop"]) == (270000, 47100, 317100)
    _cuadra(r)
    rodillo, _ = _lineas(db, so)
    assert (rodillo.quantity, rodillo.quantity_delivered, rodillo.quantity_cancelled) == (5, 2, 3)
    assert (rodillo.unit_price_cop, rodillo.estado) == (120000, "CANCELADA")


def test_linea_vigente_sin_pareja_conserva_su_precio(app_client, db, admin_token):
    """Rodillo, Pintura y Cinta (la Cinta cancelada del todo); la COT renombra la Pintura («Pintura blanca»): esa linea
    no tiene pareja y conserva su precio; el Rodillo, que si la tiene, toma el nuevo."""
    cot, so = _pedido(app_client, db, admin_token, _ejemplo())
    _, _, cinta = _lineas(db, so)
    _cancelar(app_client, admin_token, so.id, cinta.id)
    nuevos = [_linea("Rodillo", 6, 207333, "19"), _linea("Pintura blanca", 4, 117777, "19"),
              _linea("Cinta", 10, 13457, "5")]
    data = _recotizar(app_client, admin_token, cot.id, nuevos)
    resp = _propagar(app_client, admin_token, so.id, data, cot.numero)
    assert resp.status_code == 200, resp.text
    assert [p["product_name"] for p in resp.json()["data"]["productos"]] == ["Rodillo", "Pintura blanca"]
    rodillo, pintura, _ = _lineas(db, so)
    assert (rodillo.unit_price_cop, pintura.unit_price_cop) == (207333, 117000)
