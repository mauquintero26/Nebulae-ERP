"""N1 (y reglas R4/R6): el pago del anticipo se verifica antes de crear el Pedido de Venta.

- Si el anticipo requerido (modalidad o manual, recalculado al convertir) es > 0, POST /confirmar y
  /convertir-a-venta exigen verificacion_anticipo {monto, metodo_pago, referencia, fecha_pago?}. Queda un
  SaleOrderPayment ANTICIPO CONFIRMADO con el monto real y el usuario autenticado como verificador. Ya no
  existe el pago automatico 'CONVERSION_COTIZACION'.
- R4: un pago menor que el requerido se acepta (monto > 0 y <= total): el pedido queda debiendo la diferencia.
- R6: el dinero de un pedido CANCELADO de la misma cotizacion se traslada al pedido nuevo como saldo a favor
  (pago 'TRASLADO'); los pagos de origen quedan TRASLADADO y nunca se trasladan dos veces. Los pagos automaticos
  viejos 'CONVERSION_COTIZACION' (nadie los verifico) no son saldo a favor.
- recalculate_sale_order_state y GET /pedidos/{id} usan la misma cuenta del anticipo (anticipo_del_pedido): el
  % real del pedido (0 a credito), el requerido en pesos enteros y lo pagado al peso.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_anticipo_verificado
"""
import datetime
import zoneinfo
from decimal import Decimal

from tests.usuarios_de_prueba import compras_token  # noqa: F401  (fixture)

MOD_60_40 = "60/40 (60% anticipo - 40% pendiente)"
TIPOS_INGRESO = ("ANTICIPO", "ABONO", "PAGO_TOTAL", "PAGO_SALDO")


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _hoy():
    return datetime.datetime.now(zoneinfo.ZoneInfo("America/Bogota")).date()


def _sc(db, numero, modalidad):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", modalidad_pago=modalidad, estado="CONFIRMADA")
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot_confirmada(db, numero, total, anticipo, sc=None, **campos):
    from app.models.erp_documents import SalesQuotation
    if sc is not None:
        campos.setdefault("sc_id", sc.id)
        campos.setdefault("sc_numero", sc.numero)
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", estado="CONFIRMADA",
                         gate2_confirmed_at=datetime.datetime.utcnow(), total_cop=total, subtotal_cop=total,
                         anticipo_cop=anticipo,
                         productos=[{"product_name": "Cuna", "qty": 1, "unit_price_cop": total}], **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _ver(monto, referencia="BANCOL-123", metodo="Transferencia bancaria", **extra):
    return dict({"monto": monto, "metodo_pago": metodo, "referencia": referencia}, **extra)


def _confirmar(app_client, token, cot_id, verificacion=None, **body):
    body.setdefault("user_name", "t")
    if verificacion is not None:
        body["verificacion_anticipo"] = verificacion
    return app_client.post(f"/api/v1/ventas/cotizaciones/{cot_id}/confirmar", json=body, headers=auth(token))


def _convertir(app_client, token, cot_id, verificacion=None, **body):
    if verificacion is not None:
        body["verificacion_anticipo"] = verificacion
    return app_client.post(f"/api/v1/ventas/cotizaciones/{cot_id}/convertir-a-venta", json=body, headers=auth(token))


def _pedidos(db, cot_id):
    from app.models.erp_documents import SaleOrder
    db.expire_all()
    return db.query(SaleOrder).filter(SaleOrder.cot_id == cot_id).order_by(SaleOrder.id.asc()).all()


def _pagos(db, so_id):
    from app.models.fase4 import SaleOrderPayment
    db.expire_all()
    return db.query(SaleOrderPayment).filter(SaleOrderPayment.sale_order_id == so_id).order_by(SaleOrderPayment.id).all()


def _logs(db, entidad, entity_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entity_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def _dinero_vivo_de_la_cotizacion(db, cot_id):
    """Pagos CONFIRMADO (ingresos menos devoluciones) de todos los pedidos de la COT: el dinero real del cliente."""
    total = Decimal("0")
    for so in _pedidos(db, cot_id):
        for p in _pagos(db, so.id):
            if p.estado != "CONFIRMADO":
                continue
            if p.tipo in TIPOS_INGRESO:
                total += p.monto
            elif p.tipo == "DEVOLUCION":
                total -= p.monto
    return total


def _cancelar_y_reconfirmar(app_client, db, token, so, cot):
    """Cancela el pedido por la pantalla (PATCH) y simula que el cliente vuelve a confirmar la COT."""
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{so.id}", json={
        "estado": "CANCELADO", "cancellation_reason": "Cliente cambió el pedido", "updated_by": "t"}, headers=auth(token))
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    cot.estado = "CONFIRMADA"
    cot.gate2_confirmed_at = datetime.datetime.utcnow()
    db.commit()


# --- N1: verificacion obligatoria ---------------------------------------------------------------

def test_crear_pedido_sin_verificar_el_anticipo_se_rechaza(app_client, db, admin_token):
    cot = _cot_confirmada(db, "COT-VER001", 1000000, 600000)
    resp = _confirmar(app_client, admin_token, cot.id)
    assert resp.status_code == 422, resp.text
    assert "anticipo de $600.000" in resp.json()["detail"]
    assert "Verifica el pago del cliente" in resp.json()["detail"]
    assert _pedidos(db, cot.id) == []
    db.refresh(cot)
    assert cot.gate2_confirmed_at is not None and cot.estado == "CONFIRMADA"


def test_crear_pedido_con_anticipo_verificado_registra_el_pago_real(app_client, db, admin_token, user_admin):
    cot = _cot_confirmada(db, "COT-VER002", 1000000, 600000)
    resp = _confirmar(app_client, admin_token, cot.id, _ver(600000, fecha_pago=str(_hoy())), user_name="otro@x")
    assert resp.status_code == 200, resp.text
    [so] = _pedidos(db, cot.id)
    [pago] = _pagos(db, so.id)
    assert (pago.tipo, pago.estado, pago.monto) == ("ANTICIPO", "CONFIRMADO", Decimal("600000"))
    assert pago.referencia_bancaria == "BANCOL-123"
    assert pago.metodo_pago == "Transferencia bancaria"
    assert pago.usuario == user_admin.email
    assert pago.fecha == _hoy()
    assert so.anticipo_cop == Decimal("600000") and so.saldo_cop == Decimal("400000")
    assert so.anticipo_pct_snapshot == Decimal("60.00") and so.saldo_pct_snapshot == Decimal("40.00")
    [renglon] = _logs(db, "VEN", so.id, "ANTICIPO_VERIFICADO")
    assert "$600.000" in renglon.description and user_admin.email in renglon.description
    assert renglon.user_name == user_admin.email
    assert renglon.extra_data["verificado_por"] == user_admin.email
    assert renglon.extra_data["anticipo_requerido"] == "600000"
    from app.models.fase4 import SaleOrderPayment
    assert db.query(SaleOrderPayment).filter(SaleOrderPayment.metodo_pago == "CONVERSION_COTIZACION",
                                             SaleOrderPayment.sale_order_id == so.id).count() == 0
    [conv] = _logs(db, "COT", cot.id, "CONVERTIDA_A_VENTA")
    assert "Anticipo verificado: $600.000." in conv.description
    # El CREATED del pedido sigue usando el user_name del body.
    [creado] = _logs(db, "VEN", so.id, "CREATED")
    assert creado.user_name == "otro@x"


def test_pago_parcial_del_anticipo_queda_debiendo_la_diferencia(app_client, db, admin_token):
    """R4: monto > 0 y menor que el requerido se acepta; el pedido queda debiendo la diferencia."""
    cot = _cot_confirmada(db, "COT-VER003", 1000000, 600000)
    resp = _confirmar(app_client, admin_token, cot.id, _ver(500000))
    assert resp.status_code == 200, resp.text
    [so] = _pedidos(db, cot.id)
    [pago] = _pagos(db, so.id)
    assert pago.monto == Decimal("500000") and pago.estado == "CONFIRMADO"
    assert so.anticipo_cop == Decimal("500000") and so.saldo_cop == Decimal("500000")
    assert so.estado == "PENDIENTE_COMPRA"   # el mismo estado inicial de siempre, sin estados nuevos
    [renglon] = _logs(db, "VEN", so.id, "ANTICIPO_VERIFICADO")
    assert "Anticipo parcial verificado: $500.000 de $600.000 requerido. Queda debiendo $100.000 de anticipo." \
        in renglon.description
    assert renglon.extra_data["parcial"] is True and renglon.extra_data["anticipo_pendiente"] == "100000"
    d = app_client.get(f"/api/v1/ventas/pedidos/{so.id}", headers=auth(admin_token)).json()["data"]
    assert d["anticipo_pct"] == 60.0
    assert d["anticipo_requerido"] == 600000
    assert d["anticipo_pendiente"] == 100000
    assert len(d["pagos"]) == 1
    assert d["pagos"][0]["monto"] == 500000 and d["pagos"][0]["referencia_bancaria"] == "BANCOL-123"
    assert d["pagos"][0]["estado"] == "CONFIRMADO" and d["pagos"][0]["metodo_pago"] == "Transferencia bancaria"


def test_pago_mayor_al_total_se_rechaza(app_client, db, admin_token):
    cot = _cot_confirmada(db, "COT-VER004", 1000000, 600000)
    resp = _confirmar(app_client, admin_token, cot.id, _ver(1200000))
    assert resp.status_code == 422, resp.text
    assert "supera el total del pedido ($1.000.000)" in resp.json()["detail"]
    assert _pedidos(db, cot.id) == []


def test_fecha_de_pago_futura_se_rechaza(app_client, db, admin_token):
    cot = _cot_confirmada(db, "COT-VER005", 1000000, 600000)
    manana = _hoy() + datetime.timedelta(days=1)
    resp = _confirmar(app_client, admin_token, cot.id, _ver(600000, fecha_pago=str(manana)))
    assert resp.status_code == 422, resp.text
    assert "posterior a hoy" in resp.json()["detail"]
    assert _pedidos(db, cot.id) == []


def test_verificacion_incompleta_responde_422_no_500(app_client, db, admin_token):
    cot = _cot_confirmada(db, "COT-VER006", 1000000, 600000)
    for ver in ({"monto": 600000}, {"monto": 600000, "metodo_pago": "Efectivo"},
                {"monto": 600000, "metodo_pago": "Efectivo", "referencia": "ab"},
                {"monto": "abc", "metodo_pago": "Efectivo", "referencia": "REC-1"},
                {"monto": 0, "metodo_pago": "Efectivo", "referencia": "REC-1"},
                {"monto": 600000, "metodo_pago": "Efectivo", "referencia": "REC-1", "fecha_pago": "ayer"},
                "no es un objeto"):
        resp = _confirmar(app_client, admin_token, cot.id, ver)
        assert resp.status_code == 422, (ver, resp.text)
        assert "incompleta" in resp.json()["detail"], (ver, resp.text)
    assert _pedidos(db, cot.id) == []


def test_monto_que_redondea_a_cero_o_metodo_desconocido_se_rechaza(app_client, db, admin_token):
    cot = _cot_confirmada(db, "COT-VER007", 1000000, 600000)
    resp = _confirmar(app_client, admin_token, cot.id, _ver(0.4))
    assert resp.status_code == 422, resp.text
    assert "mayor que $0" in resp.json()["detail"]
    for metodo in ("TRASLADO", "Bitcoin"):
        resp = _confirmar(app_client, admin_token, cot.id, _ver(600000, metodo=metodo))
        assert resp.status_code == 422, resp.text
        assert "Método de pago no válido" in resp.json()["detail"]
    assert _pedidos(db, cot.id) == []
    # Los medios de la lista se aceptan sin importar tildes o mayusculas, y se guardan con su nombre.
    resp = _confirmar(app_client, admin_token, cot.id, _ver(600000, metodo="consignacion"))
    assert resp.status_code == 200, resp.text
    [so] = _pedidos(db, cot.id)
    assert _pagos(db, so.id)[0].metodo_pago == "Consignación"


def test_venta_a_credito_no_exige_anticipo(app_client, db, admin_token):
    sc = _sc(db, "SC-VER008", "Credito 30 dias")
    cot = _cot_confirmada(db, "COT-VER008", 1000000, 0, sc)
    resp = _confirmar(app_client, admin_token, cot.id)
    assert resp.status_code == 200, resp.text
    [so] = _pedidos(db, cot.id)
    assert _pagos(db, so.id) == []
    assert so.saldo_cop == so.total_cop == Decimal("1000000")
    assert so.anticipo_cop == Decimal("0")
    assert so.anticipo_pct_snapshot == Decimal("0") and so.saldo_pct_snapshot == Decimal("100")


def test_venta_a_credito_con_pago_lo_registra_como_anticipo(app_client, db, admin_token):
    sc = _sc(db, "SC-VER009", "Credito 30 dias")
    cot = _cot_confirmada(db, "COT-VER009", 1000000, 0, sc)
    resp = _confirmar(app_client, admin_token, cot.id, _ver(200000, metodo="Nequi", referencia="NEQ-77"))
    assert resp.status_code == 200, resp.text
    [so] = _pedidos(db, cot.id)
    [pago] = _pagos(db, so.id)
    assert pago.monto == Decimal("200000") and pago.metodo_pago == "Nequi"
    assert so.saldo_cop == Decimal("800000")
    [renglon] = _logs(db, "VEN", so.id, "ANTICIPO_VERIFICADO")
    assert "parcial" not in renglon.description


def test_el_anticipo_requerido_se_recalcula_al_convertir(app_client, db, admin_token):
    sc = _sc(db, "SC-VER010", MOD_60_40)
    cot = _cot_confirmada(db, "COT-VER010", 2786923, 1724400, sc)
    resp = _confirmar(app_client, admin_token, cot.id, _ver(1672154))
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("1672154")
    [so] = _pedidos(db, cot.id)
    assert so.saldo_cop == Decimal("1114769")
    [renglon] = _logs(db, "VEN", so.id, "ANTICIPO_VERIFICADO")
    assert "parcial" not in renglon.description


def test_convertir_a_venta_responde_el_anticipo_requerido(app_client, db, admin_token):
    sc = _sc(db, "SC-VER011", MOD_60_40)
    cot = _cot_confirmada(db, "COT-VER011", 1000000, 0, sc)
    resp = _convertir(app_client, admin_token, cot.id, _ver(600000))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["anticipo_requerido"] == 600000
    assert data["saldo_a_favor_trasladado"] == 0
    assert data["anticipo_cop"] == 600000 and data["saldo_cop"] == 400000


def test_replay_no_duplica_el_pago(app_client, db, admin_token):
    cot = _cot_confirmada(db, "COT-VER012", 1000000, 600000)
    for _ in range(2):
        resp = _convertir(app_client, admin_token, cot.id, _ver(600000), idempotency_key=f"IDEM-VER012-{cot.id}")
        assert resp.status_code == 200, resp.text
    assert resp.json()["idempotent_replay"] is True
    [so] = _pedidos(db, cot.id)
    assert len(_pagos(db, so.id)) == 1


def test_asesor_puede_verificar(app_client, db, vendedor_token, user_vendedor):
    cot = _cot_confirmada(db, "COT-VER013", 1000000, 600000)
    resp = _confirmar(app_client, vendedor_token, cot.id, _ver(600000))
    assert resp.status_code == 200, resp.text
    [so] = _pedidos(db, cot.id)
    [pago] = _pagos(db, so.id)
    assert pago.usuario == user_vendedor.email


def test_el_anticipo_manual_define_el_requerido_al_convertir(app_client, db, admin_token):
    sc = _sc(db, "SC-VER014", "Contado")
    cot = _cot_confirmada(db, "COT-VER014", 1000000, 1000000, sc, anticipo_pct_manual=Decimal("50"),
                          anticipo_manual_nota="Negociado con gerencia")
    resp = _confirmar(app_client, admin_token, cot.id)
    assert resp.status_code == 422, resp.text
    assert "anticipo de $500.000 (anticipo manual de 50%)" in resp.json()["detail"]
    resp = _confirmar(app_client, admin_token, cot.id, _ver(500000))
    assert resp.status_code == 200, resp.text
    [so] = _pedidos(db, cot.id)
    assert so.anticipo_pct_snapshot == Decimal("50.00")
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("500000")


def test_cot_sin_sc_con_anticipo_mayor_que_el_total_exige_el_total(app_client, db, admin_token):
    cot = _cot_confirmada(db, "COT-VER015", 1000000, 1200000)
    resp = _confirmar(app_client, admin_token, cot.id)
    assert resp.status_code == 422, resp.text
    assert "anticipo de $1.000.000" in resp.json()["detail"]
    resp = _confirmar(app_client, admin_token, cot.id, _ver(1000000))
    assert resp.status_code == 200, resp.text
    [so] = _pedidos(db, cot.id)
    assert so.anticipo_pct_snapshot == Decimal("100.00") and so.saldo_cop == Decimal("0")


# --- R6: saldo a favor trasladado desde un pedido cancelado ---------------------------------------------

def test_cancelar_y_convertir_otra_vez_traslada_el_saldo_a_favor_una_sola_vez(app_client, db, admin_token):
    sc = _sc(db, "SC-TRA001", MOD_60_40)
    cot = _cot_confirmada(db, "COT-TRA001", 1000000, 600000, sc)
    assert _confirmar(app_client, admin_token, cot.id, _ver(600000)).status_code == 200
    [pven1] = _pedidos(db, cot.id)
    _cancelar_y_reconfirmar(app_client, db, admin_token, pven1, cot)

    d = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token)).json()["data"]
    assert d["saldo_a_favor"] == 600000
    assert d["saldo_a_favor_detalle"] == [{"pven_id": pven1.id, "pven_numero": pven1.numero, "monto": 600000}]
    assert d["anticipo_requerido"] == 600000 and d["anticipo_por_verificar"] == 0

    # El traslado cubre el requerido: no se pide verificacion nueva.
    resp = _convertir(app_client, admin_token, cot.id)
    assert resp.status_code == 200, resp.text
    assert resp.json()["idempotent_replay"] is False and resp.json()["saldo_a_favor_trasladado"] == 600000
    pven1_, pven2 = _pedidos(db, cot.id)
    [traslado] = _pagos(db, pven2.id)
    assert (traslado.tipo, traslado.metodo_pago, traslado.estado) == ("ANTICIPO", "TRASLADO", "CONFIRMADO")
    assert traslado.monto == Decimal("600000") and traslado.referencia_bancaria == pven1.numero
    assert pven2.anticipo_cop == Decimal("600000") and pven2.saldo_cop == Decimal("400000")
    assert [p.estado for p in _pagos(db, pven1.id)] == ["TRASLADADO"]
    # La cabecera del cancelado sale de su libro: el dinero trasladado ya no figura ahi.
    assert pven1_.anticipo_cop == Decimal("0") and pven1_.saldo_cop == Decimal("1000000")
    assert _dinero_vivo_de_la_cotizacion(db, cot.id) == Decimal("600000")
    assert [l.description for l in _logs(db, "VEN", pven2.id, "SALDO_A_FAVOR_TRASLADADO")] == [
        f"Saldo a favor de $600.000 trasladado desde {pven1.numero}"]
    assert [l.description for l in _logs(db, "VEN", pven1.id, "SALDO_A_FAVOR_TRASLADADO")] == [
        f"Saldo a favor de $600.000 trasladado hacia {pven2.numero}"]
    [conv2] = _logs(db, "COT", cot.id, "CONVERTIDA_A_VENTA")[1:]
    assert "Saldo a favor trasladado: $600.000." in conv2.description
    assert app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}",
                          headers=auth(admin_token)).json()["data"]["saldo_a_favor"] == 0

    # Tercera conversion: se traslada lo del segundo pedido, nunca otra vez lo del primero.
    _cancelar_y_reconfirmar(app_client, db, admin_token, pven2, cot)
    resp = _convertir(app_client, admin_token, cot.id)
    assert resp.status_code == 200, resp.text
    _, _, pven3 = _pedidos(db, cot.id)
    [traslado3] = _pagos(db, pven3.id)
    assert traslado3.monto == Decimal("600000") and traslado3.referencia_bancaria == pven2.numero
    assert [p.estado for p in _pagos(db, pven1.id)] == ["TRASLADADO"]
    assert [p.estado for p in _pagos(db, pven2.id)] == ["TRASLADADO"]
    assert _dinero_vivo_de_la_cotizacion(db, cot.id) == Decimal("600000")


def test_saldo_a_favor_mayor_que_el_total_nuevo_deja_el_resto_a_favor(app_client, db, admin_token):
    sc = _sc(db, "SC-TRA002", "Contado")
    cot = _cot_confirmada(db, "COT-TRA002", 1000000, 1000000, sc)
    assert _confirmar(app_client, admin_token, cot.id, _ver(1000000)).status_code == 200
    [pven1] = _pedidos(db, cot.id)
    _cancelar_y_reconfirmar(app_client, db, admin_token, pven1, cot)
    cot.total_cop = Decimal("800000"); cot.subtotal_cop = Decimal("800000")
    cot.productos = [{"product_name": "Cuna", "qty": 1, "unit_price_cop": 800000}]
    db.commit()

    resp = _convertir(app_client, admin_token, cot.id)
    assert resp.status_code == 200, resp.text
    pven1_, pven2 = _pedidos(db, cot.id)
    [traslado] = _pagos(db, pven2.id)
    assert traslado.monto == Decimal("800000") and traslado.metodo_pago == "TRASLADO"
    assert pven2.saldo_cop == Decimal("0")
    # En la cabecera del cancelado solo queda lo que sigue CONFIRMADO (el resto a favor).
    assert pven1_.anticipo_cop == Decimal("200000") and pven1_.saldo_cop == Decimal("800000")
    original, resto = _pagos(db, pven1.id)
    assert original.estado == "TRASLADADO"
    assert (resto.estado, resto.tipo, resto.monto, resto.metodo_pago) == (
        "CONFIRMADO", "ANTICIPO", Decimal("200000"), "SALDO_A_FAVOR")
    assert _dinero_vivo_de_la_cotizacion(db, cot.id) == Decimal("1000000")
    d = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token)).json()["data"]
    assert d["saldo_a_favor"] == 200000
    [renglon] = _logs(db, "VEN", pven1.id, "SALDO_A_FAVOR_TRASLADADO")
    assert renglon.description == (f"Saldo a favor de $800.000 trasladado hacia {pven2.numero}. "
                                   f"Queda a favor del cliente $200.000")


def test_traslado_que_no_cubre_el_requerido_pide_verificar_la_diferencia(app_client, db, admin_token):
    sc = _sc(db, "SC-TRA003", MOD_60_40)
    cot = _cot_confirmada(db, "COT-TRA003", 1000000, 600000, sc)
    assert _confirmar(app_client, admin_token, cot.id, _ver(300000)).status_code == 200   # R4: parcial
    [pven1] = _pedidos(db, cot.id)
    _cancelar_y_reconfirmar(app_client, db, admin_token, pven1, cot)
    d = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token)).json()["data"]
    assert d["saldo_a_favor"] == 300000 and d["anticipo_por_verificar"] == 300000

    resp = _convertir(app_client, admin_token, cot.id)
    assert resp.status_code == 422, resp.text
    assert "faltan $300.000" in resp.json()["detail"]
    assert len(_pedidos(db, cot.id)) == 1
    assert [p.estado for p in _pagos(db, pven1.id)] == ["CONFIRMADO"]   # nada se marco con el 422

    resp = _convertir(app_client, admin_token, cot.id, _ver(300000, referencia="BANCOL-456"))
    assert resp.status_code == 200, resp.text
    _, pven2 = _pedidos(db, cot.id)
    traslado, verificado = _pagos(db, pven2.id)
    assert (traslado.metodo_pago, traslado.monto) == ("TRASLADO", Decimal("300000"))
    assert (verificado.referencia_bancaria, verificado.monto) == ("BANCOL-456", Decimal("300000"))
    assert pven2.anticipo_cop == Decimal("600000") and pven2.saldo_cop == Decimal("400000")


def test_traslado_mas_pago_no_puede_superar_el_total(app_client, db, admin_token):
    sc = _sc(db, "SC-TRA004", MOD_60_40)
    cot = _cot_confirmada(db, "COT-TRA004", 1000000, 600000, sc)
    assert _confirmar(app_client, admin_token, cot.id, _ver(600000)).status_code == 200
    [pven1] = _pedidos(db, cot.id)
    _cancelar_y_reconfirmar(app_client, db, admin_token, pven1, cot)
    resp = _convertir(app_client, admin_token, cot.id, _ver(500000))
    assert resp.status_code == 422, resp.text
    assert "supera el total del pedido" in resp.json()["detail"]
    assert len(_pedidos(db, cot.id)) == 1


def test_pedido_cancelado_con_devolucion_traslada_solo_el_neto(app_client, db, admin_token):
    from app.models.fase4 import SaleOrderPayment
    sc = _sc(db, "SC-TRA005", MOD_60_40)
    cot = _cot_confirmada(db, "COT-TRA005", 1000000, 600000, sc)
    assert _confirmar(app_client, admin_token, cot.id, _ver(600000)).status_code == 200
    [pven1] = _pedidos(db, cot.id)
    db.add(SaleOrderPayment(sale_order_id=pven1.id, tipo="DEVOLUCION", monto=Decimal("100000"), moneda="COP",
                            metodo_pago="Transferencia bancaria", fecha=_hoy(), estado="CONFIRMADO",
                            idempotency_key=f"DEV-TRA005-{pven1.id}"))
    db.commit()
    _cancelar_y_reconfirmar(app_client, db, admin_token, pven1, cot)
    resp = _convertir(app_client, admin_token, cot.id, _ver(100000))
    assert resp.status_code == 200, resp.text
    _, pven2 = _pedidos(db, cot.id)
    traslado, verificado = _pagos(db, pven2.id)
    assert traslado.monto == Decimal("500000") and verificado.monto == Decimal("100000")
    assert {p.estado for p in _pagos(db, pven1.id)} == {"TRASLADADO"}
    assert _dinero_vivo_de_la_cotizacion(db, cot.id) == Decimal("600000")


# --- recalculate_sale_order_state (fase4:240) ----------------------------------------------------------

def _so_con_linea(db, numero, total, saldo, pct):
    from app.models.erp_documents import SaleOrder
    from app.models.fase1b import SaleOrderLineErp
    so = SaleOrder(numero=numero, customer_name="Cliente Prueba", estado="CONFIRMADO", total_cop=total,
                   saldo_cop=saldo, anticipo_pct_snapshot=pct, saldo_pct_snapshot=100 - pct)
    db.add(so); db.flush()
    db.add(SaleOrderLineErp(so_id=so.id, description="Cuna", quantity=1, unit_price_cop=total, estado="PENDIENTE_COMPRA"))
    db.commit(); db.refresh(so)
    return so


def test_estado_del_pedido_a_credito_no_exige_el_60(db):
    from app.api.v1.erp_ventas_fase4 import recalculate_sale_order_state
    so = _so_con_linea(db, "PVEN-EST001", 1000000, 1000000, 0)
    assert recalculate_sale_order_state(so, db) == "CONFIRMADO"


def test_estado_del_pedido_usa_el_requerido_en_pesos_enteros(db):
    from app.api.v1.erp_ventas_fase4 import recalculate_sale_order_state
    # 60% de 1.000.002 = 600.001,2 -> requerido $600.001: pagar exactamente eso cubre el anticipo.
    so = _so_con_linea(db, "PVEN-EST002", 1000002, 1000002 - 600001, 60)
    assert recalculate_sale_order_state(so, db) == "CONFIRMADO"
    so_corto = _so_con_linea(db, "PVEN-EST003", 1000002, 1000002 - 600000, 60)
    assert recalculate_sale_order_state(so_corto, db) == "PENDIENTE_ANTICIPO"


def test_pedido_viejo_con_centavos_no_queda_debiendo_centavos(app_client, db, admin_token):
    """Fix 4: un PVEN heredado de 2.786.923,08 con 1.672.153,85 pagados (el 60% a centavos) tiene cubierto el
    anticipo: lo pagado se compara al peso."""
    from app.api.v1.erp_ventas_fase4 import recalculate_sale_order_state
    so = _so_con_linea(db, "PVEN-EST004", Decimal("2786923.08"), Decimal("2786923.08") - Decimal("1672153.85"), 60)
    assert recalculate_sale_order_state(so, db) == "CONFIRMADO"
    d = app_client.get(f"/api/v1/ventas/pedidos/{so.id}", headers=auth(admin_token)).json()["data"]
    assert d["anticipo_requerido"] == 1672154 and d["anticipo_pendiente"] == 0


# --- Fix round 1 de la revision ----------------------------------------------------------------------------

def _pven_cancelado_con_pago(db, cot, numero, monto, metodo):
    from app.models.erp_documents import SaleOrder
    from app.models.fase4 import SaleOrderPayment
    so = SaleOrder(numero=numero, cot_id=cot.id, customer_name="Cliente Prueba", estado="CANCELADO",
                   total_cop=cot.total_cop, anticipo_cop=monto, saldo_cop=cot.total_cop - monto)
    db.add(so); db.flush()
    db.add(SaleOrderPayment(sale_order_id=so.id, tipo="ANTICIPO", monto=monto, moneda="COP", metodo_pago=metodo,
                            fecha=_hoy(), estado="CONFIRMADO", referencia_bancaria=f"COT-{cot.numero}",
                            idempotency_key=f"PAGO-{numero}"))
    db.commit(); db.refresh(so)
    return so


def test_pago_automatico_sin_verificar_no_es_saldo_a_favor(app_client, db, admin_token):
    """Fix 1: el pago automatico viejo 'CONVERSION_COTIZACION' (nadie lo verifico) no se traslada ni descuenta
    lo que hay que verificar; queda CONFIRMADO en su pedido para que T14 lo resuelva con el usuario."""
    sc = _sc(db, "SC-FIX001", MOD_60_40)
    cot = _cot_confirmada(db, "COT-FIX001", 1000000, 600000, sc)
    viejo = _pven_cancelado_con_pago(db, cot, "PVEN-FIX001", Decimal("600000"), "CONVERSION_COTIZACION")
    d = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token)).json()["data"]
    assert d["saldo_a_favor"] == 0 and d["saldo_a_favor_detalle"] == []
    assert d["anticipo_por_verificar"] == d["anticipo_requerido"] == 600000

    resp = _confirmar(app_client, admin_token, cot.id)
    assert resp.status_code == 422, resp.text
    assert "anticipo de $600.000" in resp.json()["detail"]
    assert [p.estado for p in _pagos(db, viejo.id)] == ["CONFIRMADO"]

    resp = _confirmar(app_client, admin_token, cot.id, _ver(600000))
    assert resp.status_code == 200, resp.text
    nuevo = [so for so in _pedidos(db, cot.id) if so.id != viejo.id][0]
    [pago] = _pagos(db, nuevo.id)
    assert pago.metodo_pago == "Transferencia bancaria" and pago.monto == Decimal("600000")
    assert [p.estado for p in _pagos(db, viejo.id)] == ["CONFIRMADO"]


def test_anticipo_pagado_exacto_con_total_impar_no_queda_pendiente(app_client, db, admin_token):
    """Fix 3: el requerido del pedido (snapshot) es el mismo que se verifico al crearlo."""
    from app.api.v1.erp_ventas_fase4 import recalculate_sale_order_state
    sc = _sc(db, "SC-FIX002", MOD_60_40)
    cot = _cot_confirmada(db, "COT-FIX002", 1000003, 0, sc)        # 60% = 600.001,8 -> $600.002
    resp = _confirmar(app_client, admin_token, cot.id, _ver(600002))
    assert resp.status_code == 200, resp.text
    [so] = _pedidos(db, cot.id)
    assert so.estado == "PENDIENTE_COMPRA"
    d = app_client.get(f"/api/v1/ventas/pedidos/{so.id}", headers=auth(admin_token)).json()["data"]
    assert d["anticipo_requerido"] == 600002 and d["anticipo_pendiente"] == 0
    assert recalculate_sale_order_state(so, db) == "CONFIRMADO"
    [renglon] = _logs(db, "VEN", so.id, "ANTICIPO_VERIFICADO")
    assert "parcial" not in renglon.description


def test_porcentaje_heredado_no_exacto_se_conserva_y_pagarlo_no_deja_pendiente(app_client, db, admin_token):
    """Fix 3 (ronda 2): COT sin SC con un dato viejo de 1.000.000 sobre 1.500.000 (66,666...%). H36: el % heredado
    se conserva tal cual, asi que se exige exactamente $1.000.000; el snapshot del pedido se redondea hacia abajo
    (66,66%), de modo que pagar lo que decia la cotizacion no deja anticipo pendiente."""
    from app.api.v1.erp_ventas_fase4 import recalculate_sale_order_state
    cot = _cot_confirmada(db, "COT-FIX003", 1500000, 1000000)
    d = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token)).json()["data"]
    assert d["anticipo_requerido"] == 1000000 and d["anticipo_por_verificar"] == 1000000
    assert d["anticipo_pct"] == 66.67   # solo para mostrar
    resp = _confirmar(app_client, admin_token, cot.id)
    assert resp.status_code == 422 and "anticipo de $1.000.000" in resp.json()["detail"], resp.text

    resp = _confirmar(app_client, admin_token, cot.id, _ver(1000000))
    assert resp.status_code == 200, resp.text
    [so] = _pedidos(db, cot.id)
    assert so.anticipo_pct_snapshot == Decimal("66.66")
    assert so.anticipo_cop == Decimal("1000000") and so.saldo_cop == Decimal("500000")
    [renglon] = _logs(db, "VEN", so.id, "ANTICIPO_VERIFICADO")
    assert "parcial" not in renglon.description
    d = app_client.get(f"/api/v1/ventas/pedidos/{so.id}", headers=auth(admin_token)).json()["data"]
    assert d["anticipo_pendiente"] == 0
    assert recalculate_sale_order_state(so, db) == "CONFIRMADO"
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("1000000")


def test_pedido_cancelado_no_tiene_anticipo_pendiente(app_client, db, admin_token):
    """Minor (ronda 2): tras trasladar su dinero, el pedido cancelado no muestra el requerido como pendiente."""
    sc = _sc(db, "SC-FIX008", MOD_60_40)
    cot = _cot_confirmada(db, "COT-FIX008", 1000000, 600000, sc)
    assert _confirmar(app_client, admin_token, cot.id, _ver(600000)).status_code == 200
    [pven1] = _pedidos(db, cot.id)
    _cancelar_y_reconfirmar(app_client, db, admin_token, pven1, cot)
    assert _convertir(app_client, admin_token, cot.id).status_code == 200
    d = app_client.get(f"/api/v1/ventas/pedidos/{pven1.id}", headers=auth(admin_token)).json()["data"]
    assert d["estado"] == "CANCELADO" and d["anticipo_cop"] == 0
    assert d["anticipo_requerido"] == 600000 and d["anticipo_pendiente"] == 0


def test_pago_parcial_con_traslado_nombra_las_dos_cifras(app_client, db, admin_token):
    """Fix 5: con saldo a favor, la Actividad de R4 dice lo que faltaba y el anticipo requerido."""
    sc = _sc(db, "SC-FIX004", MOD_60_40)
    cot = _cot_confirmada(db, "COT-FIX004", 1000000, 600000, sc)
    assert _confirmar(app_client, admin_token, cot.id, _ver(300000)).status_code == 200
    [pven1] = _pedidos(db, cot.id)
    _cancelar_y_reconfirmar(app_client, db, admin_token, pven1, cot)
    resp = _confirmar(app_client, admin_token, cot.id, _ver(200000, referencia="BANCOL-789"))
    assert resp.status_code == 200, resp.text
    _, pven2 = _pedidos(db, cot.id)
    assert pven2.anticipo_cop == Decimal("500000") and pven2.saldo_cop == Decimal("500000")
    [renglon] = _logs(db, "VEN", pven2.id, "ANTICIPO_VERIFICADO")
    assert renglon.description.startswith(
        "Anticipo parcial verificado: $200.000 de $300.000 que faltaban (anticipo requerido $600.000; "
        "$300.000 cubiertos con saldo a favor). Queda debiendo $100.000 de anticipo.")
    d = app_client.get(f"/api/v1/ventas/pedidos/{pven2.id}", headers=auth(admin_token)).json()["data"]
    assert d["anticipo_pendiente"] == 100000


def test_monto_enorme_responde_422_no_500(app_client, db, admin_token):
    """Fix 7: un monto que no cabe en la precision no tumba el servidor, por ninguna de las dos rutas."""
    cot = _cot_confirmada(db, "COT-FIX005", 1000000, 600000)
    for llamar in (_confirmar, _convertir):
        resp = llamar(app_client, admin_token, cot.id, _ver(1e28))
        assert resp.status_code == 422, resp.text
        assert "no es un monto válido" in resp.json()["detail"]
        resp = llamar(app_client, admin_token, cot.id, _ver(1e20))
        assert resp.status_code == 422, resp.text
        assert "supera el total del pedido" in resp.json()["detail"]
    assert _pedidos(db, cot.id) == []


def test_traslado_por_la_ruta_de_la_pantalla(app_client, db, admin_token):
    """Fix 9: R6 tambien por POST /cotizaciones/{id}/confirmar, la ruta que usa la pantalla."""
    sc = _sc(db, "SC-FIX006", MOD_60_40)
    cot = _cot_confirmada(db, "COT-FIX006", 1000000, 600000, sc)
    assert _confirmar(app_client, admin_token, cot.id, _ver(600000)).status_code == 200
    [pven1] = _pedidos(db, cot.id)
    _cancelar_y_reconfirmar(app_client, db, admin_token, pven1, cot)
    resp = _confirmar(app_client, admin_token, cot.id)   # sin verificacion: el traslado cubre el anticipo
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["idempotent_replay"] is False and data["sale_order_id"] != pven1.id
    assert data["pedido_venta"]["anticipo_cop"] == 600000 and data["pedido_venta"]["saldo_cop"] == 400000
    [traslado] = _pagos(db, data["sale_order_id"])
    assert (traslado.metodo_pago, traslado.monto, traslado.referencia_bancaria) == (
        "TRASLADO", Decimal("600000"), pven1.numero)
    assert [p.estado for p in _pagos(db, pven1.id)] == ["TRASLADADO"]
    assert _dinero_vivo_de_la_cotizacion(db, cot.id) == Decimal("600000")


def test_compras_no_puede_crear_el_pedido_ni_verificar_el_pago(app_client, db, compras_token):
    """Fix 9: solo quien crea el pedido (asesor o administracion) verifica el pago."""
    cot = _cot_confirmada(db, "COT-FIX007", 1000000, 600000)
    for llamar in (_confirmar, _convertir):
        resp = llamar(app_client, compras_token, cot.id, _ver(600000))
        assert resp.status_code == 403, resp.text
    assert _pedidos(db, cot.id) == []
    db.refresh(cot)
    assert cot.gate2_confirmed_at is not None
