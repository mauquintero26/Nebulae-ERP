"""H42: dinero en pesos enteros. Helpers de backend/app/core/ventas_dinero.py (redondear_peso, pesos) y
redondeo en el servidor al guardar COT / PVEN (create y update, incluido update_pedido: regla R11) y al
convertir una COT en Pedido de Venta. Los montos ya guardados no se tocan (eso es T14).
"""
from decimal import Decimal

import pytest

from app.core.ventas_dinero import pesos, redondear_peso


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _linea(nombre, qty, precio):
    return {"product_name": nombre, "qty": qty, "unit_price_cop": precio, "total_cop": qty * precio}


def _cot(db, numero, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _ven(db, numero, **campos):
    from app.models.erp_documents import SaleOrder
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    ven = SaleOrder(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(ven); db.commit(); db.refresh(ven)
    return ven


# --- Helpers (sin DB) ---------------------------------------------------------------------------

def test_pesos_formato_colombiano():
    assert pesos(Decimal('2786923.08')) == '$2.786.923'
    assert pesos(1062523) == '$1.062.523'
    assert pesos(-5000) == '-$5.000'


def test_pesos_cero_none_y_miles_exactos():
    assert pesos(None) == '$0'
    assert pesos(0) == '$0'
    assert pesos(999) == '$999'
    assert pesos(1000) == '$1.000'
    assert pesos(1234567890) == '$1.234.567.890'
    assert pesos('342461.538') == '$342.462'
    # Un negativo que redondea a cero no lleva signo ("-$0" nunca se muestra).
    assert pesos(-0.4) == '$0'


def test_redondear_peso_es_half_up_a_cero_decimales():
    assert redondear_peso(Decimal('2.5')) == Decimal('3')
    assert redondear_peso(2.4) == Decimal('2')
    assert redondear_peso('1000.50') == Decimal('1001')
    assert redondear_peso(1672153.8) == Decimal('1672154')
    assert redondear_peso(342461.538) == Decimal('342462')
    assert redondear_peso(Decimal('2786923.08')) == Decimal('2786923')
    # El valor que devuelve ya es un entero exacto (sin decimales).
    r = redondear_peso('684923.077')
    assert isinstance(r, Decimal) and r == Decimal('684923') and r.as_tuple().exponent == 0


def test_redondear_peso_acepta_none_vacio_y_tipos_mixtos():
    assert redondear_peso(None) == Decimal('0')   # None se trata como 0 (monto ausente)
    assert redondear_peso('') == Decimal('0')
    assert redondear_peso(0) == Decimal('0')
    assert redondear_peso(7) == Decimal('7')
    assert redondear_peso(' 12.6 ') == Decimal('13')
    assert redondear_peso(-5000.4) == Decimal('-5000')
    assert not redondear_peso(Decimal('-0.4')).is_signed()  # un negativo chico redondea a 0, no a -0
    # Ruido de punto flotante de la Calculadora: 60000.00000000001 sigue siendo 60000.
    assert redondear_peso(42000 / (1 - 30 / 100)) == Decimal('60000')


def test_redondear_peso_rechaza_lo_que_no_es_un_monto():
    for malo in ["abc", "1.062.523", float("nan"), float("inf"), True, [1], {"a": 1}]:
        with pytest.raises(ValueError):
            redondear_peso(malo)


# --- Cotizacion: guardar -----------------------------------------------------------------------

def test_guardar_la_cotizacion_redondea_los_totales_a_peso(app_client, db, admin_token):
    cot = _cot(db, "COT-PESOS001", total_cop=1000, subtotal_cop=1000, productos=[_linea("Cuna", 1, 1000)])
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "total_cop": 2786923.08, "subtotal_cop": 2786923.08,
        "productos": [_linea("Cuna", 1, 2786923)], "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.total_cop == Decimal('2786923')
    assert cot.subtotal_cop == Decimal('2786923')
    assert resp.json()["data"]["total_cop"] == 2786923


def test_guardar_la_cotizacion_con_un_monto_no_numerico_responde_422(app_client, db, admin_token):
    cot = _cot(db, "COT-PESOS002", total_cop=1000, subtotal_cop=1000)
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"total_cop": "mil pesos"},
                            headers=auth(admin_token))
    assert resp.status_code == 422, resp.text
    assert "total_cop" in resp.text
    db.refresh(cot)
    assert cot.total_cop == Decimal('1000')


def test_guardar_la_cotizacion_sin_mandar_montos_no_los_toca(app_client, db, admin_token):
    cot = _cot(db, "COT-PESOS003", total_cop=Decimal('1000.40'), subtotal_cop=Decimal('1000.40'), notas=None)
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"notas": "hola"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.total_cop == Decimal('1000.40')  # los montos viejos no se tocan (T14)


def test_crear_la_cotizacion_redondea_los_totales_a_peso(app_client, db, admin_token):
    resp = app_client.post("/api/v1/ventas/cotizaciones", json={
        "customer_name": "Cliente Prueba", "subtotal_cop": 1672153.8, "total_cop": 1672153.8,
        "productos": [_linea("Silla", 1, 1672153.8)], "created_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    from app.models.erp_documents import SalesQuotation
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == resp.json()["data"]["id"]).one()
    assert cot.total_cop == Decimal('1672154')
    assert cot.subtotal_cop == Decimal('1672154')


def test_crear_la_cotizacion_sin_montos_queda_en_cero(app_client, db, admin_token):
    resp = app_client.post("/api/v1/ventas/cotizaciones", json={"customer_name": "Cliente Prueba", "created_by": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    from app.models.erp_documents import SalesQuotation
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == resp.json()["data"]["id"]).one()
    assert cot.total_cop == Decimal('0') and cot.subtotal_cop == Decimal('0')


# --- Convertir la COT en Pedido de Venta -----------------------------------------------------------

def test_convertir_la_cotizacion_guarda_el_pedido_en_pesos_enteros(app_client, db, admin_token):
    from datetime import datetime
    from app.models.erp_documents import SaleOrder
    cot = _cot(db, "COT-PESOS004", estado="CONFIRMADA", total_cop=Decimal('2786923.08'),
               subtotal_cop=Decimal('2786923.08'), productos=[_linea("Cuna", 1, 2786923)],
               gate2_confirmed_at=datetime.utcnow())
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta", json={"user_name": "asesor@test"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    so = db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id).one()
    assert so.total_cop == Decimal('2786923')
    assert so.subtotal_cop == Decimal('2786923')
    assert so.saldo_cop == Decimal('2786923')


def test_convertir_sin_subtotal_usa_el_total_redondeado(app_client, db, admin_token):
    from datetime import datetime
    from app.models.erp_documents import SaleOrder
    cot = _cot(db, "COT-PESOS005", estado="CONFIRMADA", total_cop=Decimal('342461.54'),
               productos=[_linea("Cuna", 1, 342462)], gate2_confirmed_at=datetime.utcnow())
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta", json={"user_name": "asesor@test"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    so = db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id).one()
    assert so.total_cop == Decimal('342462')
    assert so.subtotal_cop == Decimal('342462')


def test_convertir_redondea_el_anticipo_y_el_saldo_queda_entero(app_client, db, admin_token):
    """N1 (T3): el anticipo ya no se da por pagado al convertir: se verifica. El requerido (60% de una SC 60/40)
    y el pago verificado quedan en pesos enteros, y el saldo cuadra sin centavos."""
    from datetime import datetime
    from app.models.erp_documents import CustomerRequest, SaleOrder
    from app.models.fase4 import SaleOrderPayment
    sc = CustomerRequest(numero="SC-PESOS006", customer_name="Cliente Prueba", estado="CONFIRMADA",
                         modalidad_pago="60/40 (60% anticipo - 40% pendiente)")
    db.add(sc); db.commit()
    cot = _cot(db, "COT-PESOS006", estado="CONFIRMADA", sc_id=sc.id, total_cop=Decimal('2786923.08'),
               subtotal_cop=Decimal('2786923.08'), anticipo_cop=Decimal('1672153.80'),
               productos=[_linea("Cuna", 1, 2786923)], gate2_confirmed_at=datetime.utcnow())
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta", json={
        "user_name": "asesor@test",
        "verificacion_anticipo": {"monto": 1672153.8, "metodo_pago": "Transferencia bancaria", "referencia": "PESOS-6"},
    }, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["anticipo_requerido"] == 1672154   # 60% de 2.786.923 = 1.672.153,8
    so = db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id).one()
    assert so.anticipo_cop == Decimal('1672154')
    assert so.saldo_cop == Decimal('1114769')  # 2.786.923 - 1.672.154
    pago = db.query(SaleOrderPayment).filter(SaleOrderPayment.sale_order_id == so.id).one()
    assert pago.monto == Decimal('1672154')
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal('1672154')


# --- Pedido de Venta: crear y guardar (R11) --------------------------------------------------------

def test_crear_el_pedido_redondea_los_montos_y_el_saldo_cuadra(app_client, db, admin_token):
    resp = app_client.post("/api/v1/ventas/pedidos", json={
        "customer_name": "Cliente Prueba", "subtotal_cop": 2786923.08, "total_cop": 2786923.08,
        "anticipo_cop": 1672153.8, "productos": [], "created_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    from app.models.erp_documents import SaleOrder
    ven = db.query(SaleOrder).filter(SaleOrder.id == resp.json()["data"]["id"]).one()
    assert ven.subtotal_cop == Decimal('2786923')
    assert ven.total_cop == Decimal('2786923')
    assert ven.anticipo_cop == Decimal('1672154')
    assert ven.saldo_cop == Decimal('1114769')  # 2.786.923 - 1.672.154, sin centavos


def test_guardar_el_pedido_redondea_total_subtotal_saldo_y_anticipo(app_client, db, admin_token):
    """R11: la re-cotizacion propaga total y subtotal con decimales al PVEN por update_pedido y quedan en pesos enteros.
    A3 (revision final, a proposito): con un total en el body, el saldo y el anticipo del body se ignoran y salen del
    libro de pagos (este pedido no tiene pagos: anticipo 0 y saldo = total). Un saldo suelto (Registrar cobro de
    Entregas) se sigue guardando redondeado."""
    ven = _ven(db, "PVEN-PESOS001", total_cop=1000, subtotal_cop=1000, anticipo_cop=0, saldo_cop=1000,
               productos=[_linea("Cuna", 1, 1000)])
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{ven.id}", json={
        "total_cop": 2786923.08, "subtotal_cop": 2786923.08, "saldo_cop": 1114769.28, "anticipo_cop": 1672153.8,
        "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(ven)
    assert ven.total_cop == Decimal('2786923')
    assert ven.subtotal_cop == Decimal('2786923')
    assert ven.saldo_cop == Decimal('2786923')
    assert ven.anticipo_cop == Decimal('0')
    assert resp.json()["data"]["saldo_cop"] == 2786923

    resp = app_client.patch(f"/api/v1/ventas/pedidos/{ven.id}", json={"saldo_cop": 1114769.28, "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(ven)
    assert ven.saldo_cop == Decimal('1114769')


def test_guardar_el_pedido_sin_mandar_montos_no_los_toca(app_client, db, admin_token):
    ven = _ven(db, "PVEN-PESOS002", total_cop=Decimal('1000.40'), saldo_cop=Decimal('1000.40'), notas=None)
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{ven.id}", json={"notas": "hola", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(ven)
    assert ven.total_cop == Decimal('1000.40') and ven.saldo_cop == Decimal('1000.40')


def test_guardar_el_pedido_con_un_monto_no_numerico_responde_422(app_client, db, admin_token):
    ven = _ven(db, "PVEN-PESOS003", total_cop=1000, saldo_cop=1000)
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{ven.id}", json={"saldo_cop": "abc", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 422, resp.text
    assert "saldo_cop" in resp.text
    db.refresh(ven)
    assert ven.saldo_cop == Decimal('1000')
