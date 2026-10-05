"""U19+U21 (Bloque 2, T4): anticipo de cada producto de la cotizacion.

- ventas_dinero.monto_linea(producto): el valor de la linea en pesos enteros (total_cop, o precio x cantidad), nunca
  negativo; 0 si no es un dict o el dato no es numerico.
- ventas_dinero.repartir_anticipo_por_linea(montos, anticipo): reparto por el metodo del mayor residuo. La suma da
  exactamente el anticipo, cada linea queda a menos de $1 de su parte exacta, en empate gana la primera.
- get_cotizacion['anticipo_por_linea']: lista paralela a 'productos' (no se guarda en el JSON). C10: sin pedido vigente
  reparte anticipo_requerido; con pedido vigente, el requerido del pedido (anticipo_del_pedido(pven)[0]).

Los simbolos nuevos de T4 se importan DENTRO de cada prueba (el runner importa el modulo fuera de un try).
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_anticipo_por_linea
"""
from decimal import Decimal

MOD_60_40 = "60/40 (60% anticipo - 40% pendiente)"
LINEAS = [1240614, 468000, 132000]  # el recorrido del Bloque 1: 1.840.614 en total


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _d(valores):
    return [Decimal(str(v)) for v in valores]


# ─── Reparto (puro) ──────────────────────────────────────────────────────────────────

def test_repartir_sin_residuo():
    from app.core.ventas_dinero import repartir_anticipo_por_linea
    assert repartir_anticipo_por_linea(_d(LINEAS), Decimal("1104368")) == _d([744368, 280800, 79200])


def test_repartir_el_residuo_va_a_los_mayores_restos():
    from app.core.ventas_dinero import repartir_anticipo_por_linea
    # Tres partes iguales de 60000,67: los dos pesos que faltan van a las primeras (empate: gana la que va primero).
    assert repartir_anticipo_por_linea(_d([100001] * 3), Decimal("180002")) == _d([60001, 60001, 60000])
    # El peso que falta va a la de MAYOR parte decimal, no a la ultima: 0,6 / 0,2 / 0,2 (anticipo 1 sobre 5 pesos).
    assert repartir_anticipo_por_linea(_d([3, 1, 1]), Decimal("1")) == _d([1, 0, 0])
    assert repartir_anticipo_por_linea(_d([1, 1, 3]), Decimal("1")) == _d([0, 0, 1])


def test_repartir_con_descuento():
    from app.core.ventas_dinero import repartir_anticipo_por_linea
    # 1.000.000 + 500.000 con 10% de descuento = 1.350.000; 60% -> 810.000.
    assert repartir_anticipo_por_linea(_d([1000000, 500000]), Decimal("810000")) == _d([540000, 270000])


def test_repartir_al_100_da_el_valor_de_cada_linea():
    from app.core.ventas_dinero import repartir_anticipo_por_linea
    assert repartir_anticipo_por_linea(_d([342462, 684924]), Decimal("1027386")) == _d([342462, 684924])


def test_repartir_cero_y_vacios():
    from app.core.ventas_dinero import repartir_anticipo_por_linea
    assert repartir_anticipo_por_linea(_d(LINEAS), Decimal("0")) == _d([0, 0, 0])
    assert repartir_anticipo_por_linea(_d([0, 0]), Decimal("5000")) == _d([0, 0])
    assert repartir_anticipo_por_linea([], Decimal("5000")) == []
    assert repartir_anticipo_por_linea(_d([1000, 0, 3000]), Decimal("2400")) == _d([600, 0, 1800])
    # Sin decimales ni ceros negativos: cada valor es un Decimal entero.
    for valor in repartir_anticipo_por_linea(_d([1, 1, 1]), Decimal("2")):
        assert isinstance(valor, Decimal) and valor == valor.to_integral_value()


def test_repartir_invariantes():
    from app.core.ventas_dinero import anticipo_requerido, repartir_anticipo_por_linea
    casos = [
        ([1240614, 468000, 132000], Decimal("60")),
        ([100001, 100001, 100001], Decimal("60")),
        ([7, 13, 19, 23, 29, 31, 37], Decimal("60")),        # 7 lineas impares
        ([333333, 333333, 333334], Decimal("33.33")),
        ([1, 999999], Decimal("50")),
        ([5000, 0, 12345, 77, 1], Decimal("100")),
    ]
    for montos, pct in casos:
        objetivo = anticipo_requerido(sum(montos), pct)
        partes = repartir_anticipo_por_linea(_d(montos), objetivo)
        assert sum(partes) == objetivo, (montos, pct, partes)
        total = Decimal(sum(montos))
        for monto, parte in zip(montos, partes):
            assert parte <= monto, (montos, pct, partes)
            assert abs(parte - objetivo * monto / total) < 1, (montos, pct, partes)


def test_monto_linea():
    from app.core.ventas_dinero import monto_linea
    assert monto_linea({"total_cop": 1240614.4}) == Decimal("1240614")
    assert monto_linea({"total_cop": "1000.5", "unit_price_cop": 1, "qty": 1}) == Decimal("1001")
    assert monto_linea({"unit_price_cop": 1000, "qty": 3}) == Decimal("3000")
    assert monto_linea({"unit_price_cop": "1500.4", "qty": "2"}) == Decimal("3001")
    assert monto_linea({"total_cop": None, "unit_price_cop": 200, "qty": 2}) == Decimal("400")
    assert monto_linea({"unit_price_cop": 1000}) == Decimal("0")       # sin cantidad
    assert monto_linea({"total_cop": "abc"}) == Decimal("0")           # dato viejo no numerico
    assert monto_linea({"unit_price_cop": "x", "qty": 1}) == Decimal("0")
    assert monto_linea({"total_cop": -5000}) == Decimal("0")           # nunca negativo
    assert monto_linea("Cuna") == Decimal("0") and monto_linea(None) == Decimal("0")


# ─── GET /cotizaciones/{id} ──────────────────────────────────────────────────────────

def _sc(db, numero, modalidad, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "CONFIRMADA")
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", modalidad_pago=modalidad, **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _productos(montos):
    return [{"product_name": f"Producto {i}", "qty": 1, "unit_price_cop": m, "total_cop": m}
            for i, m in enumerate(montos)]


def _cot(db, numero, sc=None, montos=LINEAS, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    campos.setdefault("productos", _productos(montos))
    total = sum(montos)
    campos.setdefault("subtotal_cop", total)
    campos.setdefault("total_cop", total)
    if sc is not None:
        campos.setdefault("sc_id", sc.id)
        campos.setdefault("sc_numero", sc.numero)
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _ven(db, numero, cot, **campos):
    from app.models.erp_documents import SaleOrder
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    ven = SaleOrder(numero=numero, cot_id=cot.id, sc_id=cot.sc_id, customer_name="Cliente Prueba", **campos)
    db.add(ven); db.commit(); db.refresh(ven)
    return ven


def _detalle(app_client, token, cot_id):
    resp = app_client.get(f"/api/v1/ventas/cotizaciones/{cot_id}", headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_get_cotizacion_expone_anticipo_por_linea(app_client, db, admin_token):
    sc = _sc(db, "SC-T4U19A", MOD_60_40)
    cot = _cot(db, "COT-T4U19A", sc)
    d = _detalle(app_client, admin_token, cot.id)
    assert d["anticipo_requerido"] == 1104368
    assert d["anticipo_por_linea"] == [744368.0, 280800.0, 79200.0]
    assert sum(d["anticipo_por_linea"]) == d["anticipo_requerido"]
    assert len(d["anticipo_por_linea"]) == len(d["productos"])


def test_get_cotizacion_a_credito_da_ceros(app_client, db, admin_token):
    sc = _sc(db, "SC-T4U19B", "Credito 30 dias")
    cot = _cot(db, "COT-T4U19B", sc)
    assert _detalle(app_client, admin_token, cot.id)["anticipo_por_linea"] == [0.0, 0.0, 0.0]


def test_get_cotizacion_sin_precios_da_ceros(app_client, db, admin_token):
    """Una COT recien creada (Borrador sin precios) muestra $0 en cada linea."""
    sc = _sc(db, "SC-T4U19C", MOD_60_40)
    cot = _cot(db, "COT-T4U19C", sc, montos=[0, 0], total_cop=0, subtotal_cop=0,
               productos=[{"product_name": "Cuna", "qty": 1, "unit_price_cop": 0},
                          {"product_name": "Silla", "qty": 2}])
    assert _detalle(app_client, admin_token, cot.id)["anticipo_por_linea"] == [0.0, 0.0]


def test_get_cotizacion_con_anticipo_manual(app_client, db, admin_token):
    sc = _sc(db, "SC-T4U19D", MOD_60_40)
    cot = _cot(db, "COT-T4U19D", sc)
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "anticipo_pct_manual": 50, "anticipo_manual_nota": "Cliente frecuente", "updated_by": "t"},
        headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    d = _detalle(app_client, admin_token, cot.id)
    assert d["anticipo_pct"] == 50.0
    assert sum(d["anticipo_por_linea"]) == round(sum(LINEAS) * 0.5) == d["anticipo_requerido"]
    assert d["anticipo_por_linea"] == [620307.0, 234000.0, 66000.0]


def test_get_no_escribe_en_el_json_de_productos(app_client, db, admin_token):
    sc = _sc(db, "SC-T4U19E", MOD_60_40)
    cot = _cot(db, "COT-T4U19E", sc)
    antes = [dict(p) for p in cot.productos]
    _detalle(app_client, admin_token, cot.id)
    db.expire_all()
    db.refresh(cot)
    assert cot.productos == antes
    assert all("anticipo_cop" not in p and "anticipo_por_linea" not in p for p in cot.productos)


def test_anticipo_por_linea_es_paralela_a_productos(app_client, db, admin_token):
    """Una linea vieja que no es un dict ocupa su lugar con 0: la lista sigue alineada con 'productos'."""
    sc = _sc(db, "SC-T4U19F", "Contado")
    cot = _cot(db, "COT-T4U19F", sc, montos=[1000, 3000], total_cop=4000, subtotal_cop=4000,
               productos=[{"product_name": "Cuna", "qty": 1, "total_cop": 1000}, "Texto viejo",
                          {"product_name": "Silla", "qty": 3, "unit_price_cop": 1000}])
    d = _detalle(app_client, admin_token, cot.id)
    assert d["anticipo_por_linea"] == [1000.0, 0.0, 3000.0]


def test_get_cotizacion_con_pedido_vigente_reparte_el_requerido_del_pedido(app_client, db, admin_token):
    """C10: con un pedido vigente se reparte anticipo_del_pedido(pven)[0] (aqui el 100% del snapshot), no el 60% que
    pide hoy la modalidad. Un pedido CANCELADO mas nuevo no cuenta."""
    from app.core.ventas_dinero import anticipo_del_pedido
    sc = _sc(db, "SC-T4U19G", MOD_60_40)
    cot = _cot(db, "COT-T4U19G", sc, estado="CONFIRMADA")
    pven = _ven(db, "PVEN-T4U19G", cot, total_cop=1840614, saldo_cop=1840614, anticipo_pct_snapshot=100)
    d = _detalle(app_client, admin_token, cot.id)
    assert anticipo_del_pedido(pven)[0] == Decimal("1840614")
    assert sum(d["anticipo_por_linea"]) == 1840614
    assert sum(d["anticipo_por_linea"]) != d["anticipo_requerido"]
    assert d["anticipo_por_linea"] == [1240614.0, 468000.0, 132000.0]
    _ven(db, "PVEN-T4U19H", cot, estado="CANCELADO", total_cop=1840614, saldo_cop=1840614,
         anticipo_pct_snapshot=0, cancellation_reason="Pedido duplicado")
    assert _detalle(app_client, admin_token, cot.id)["anticipo_por_linea"] == [1240614.0, 468000.0, 132000.0]


def test_con_solo_pedidos_cancelados_reparte_el_requerido_de_la_cotizacion(app_client, db, admin_token):
    sc = _sc(db, "SC-T4U19I", MOD_60_40)
    cot = _cot(db, "COT-T4U19I", sc)
    _ven(db, "PVEN-T4U19I", cot, estado="CANCELADO", total_cop=1840614, saldo_cop=1840614,
         anticipo_pct_snapshot=100, cancellation_reason="Pedido duplicado")
    assert _detalle(app_client, admin_token, cot.id)["anticipo_por_linea"] == [744368.0, 280800.0, 79200.0]
