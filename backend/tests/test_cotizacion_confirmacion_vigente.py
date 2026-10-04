"""confirmacion_vigente de la cotizacion (T10, fix 1): distingue una COT re-confirmada por el cliente tras cancelar
su pedido (se puede crear otro pedido YA) de una COT antigua que quedo CONFIRMADA con su pedido cancelado (hay que
reabrirla).

La marca es gate2_confirmed_at: la pone confirmar_via_token en cada confirmacion del cliente y la limpia
convertir_cotizacion_a_venta en el mismo commit que crea el pedido; sin ella el servidor no convierte. El GET del
detalle y las filas de la lista exponen confirmacion_vigente = gate2_confirmed_at is not None (_cot_dict).

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_cotizacion_confirmacion_vigente
"""
import datetime
import uuid


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _suf():
    return uuid.uuid4().hex[:8].upper()


def _cot(db, numero, estado="CONFIRMADA", gate2=True, **campos):
    """COT sin SC y con anticipo 0 (el % conservado es 0): se convierte sin verificacion del anticipo."""
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero=numero, customer_name=f"Cliente Vigente {numero}", estado=estado,
                         gate2_confirmed_at=datetime.datetime.utcnow() if gate2 else None,
                         total_cop=1000, subtotal_cop=1000, anticipo_cop=0,
                         productos=[{"product_name": "Cuna", "qty": 1, "unit_price_cop": 1000, "total_cop": 1000}],
                         **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _pven_cancelado(db, numero, cot):
    from app.models.erp_documents import SaleOrder
    ven = SaleOrder(numero=numero, cot_id=cot.id, customer_name=cot.customer_name, total_cop=1000, saldo_cop=1000,
                    estado="CANCELADO", cancellation_reason="Cliente cambio el pedido")
    db.add(ven); db.commit(); db.refresh(ven)
    return ven


def _detalle(app_client, token, cot_id):
    r = app_client.get(f"/api/v1/ventas/cotizaciones/{cot_id}", headers=auth(token))
    assert r.status_code == 200, r.text
    return r.json()["data"]


def _fila(app_client, token, cot):
    r = app_client.get(f"/api/v1/ventas/cotizaciones?search={cot.numero}&limit=200", headers=auth(token))
    assert r.status_code == 200, r.text
    filas = [d for d in r.json()["data"] if d["numero"] == cot.numero]
    assert len(filas) == 1, filas
    return filas[0]


def test_cotizacion_convertida_no_tiene_confirmacion_vigente(app_client, db, admin_token):
    cot = _cot(db, f"COT-CV1{_suf()}")
    assert _detalle(app_client, admin_token, cot.id)["confirmacion_vigente"] is True, "antes de convertir"
    r = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                        headers=auth(admin_token))
    assert r.status_code == 200, r.text
    d = _detalle(app_client, admin_token, cot.id)
    assert d["estado"] == "CONFIRMADA"
    assert [p["estado"] for p in d["pedidos_venta"]] == ["PENDIENTE_COMPRA"]
    assert d["confirmacion_vigente"] is False, "la conversion consume la confirmacion del cliente"
    assert _fila(app_client, admin_token, cot)["confirmacion_vigente"] is False


def test_cotizacion_reconfirmada_tras_pedido_cancelado_tiene_confirmacion_vigente(app_client, db, admin_token):
    # Flujo normal de H46: se cancela el pedido, la COT vuelve a Borrador, se reenvia y el cliente la confirma otra
    # vez (estado CONFIRMADA y marca puesta), con solo el pedido cancelado.
    suf = _suf()
    cot = _cot(db, f"COT-CV2{suf}")
    _pven_cancelado(db, f"PVEN-CV2{suf}", cot)
    d = _detalle(app_client, admin_token, cot.id)
    assert [p["estado"] for p in d["pedidos_venta"]] == ["CANCELADO"]
    assert d["confirmacion_vigente"] is True
    fila = _fila(app_client, admin_token, cot)
    assert fila["confirmacion_vigente"] is True
    assert [p["estado"] for p in fila["pedidos_venta"]] == ["CANCELADO"]
    # Y de verdad se puede crear el pedido nuevo.
    r = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                        headers=auth(admin_token))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["idempotent_replay"] is False


def test_cotizacion_confirmada_antigua_con_pedido_cancelado_sin_marca(app_client, db, admin_token):
    # Dato antiguo: el pedido se cancelo antes de que la cancelacion reabriera sola la COT; la marca ya se consumio.
    suf = _suf()
    cot = _cot(db, f"COT-CV3{suf}", gate2=False)
    _pven_cancelado(db, f"PVEN-CV3{suf}", cot)
    assert _detalle(app_client, admin_token, cot.id)["confirmacion_vigente"] is False
    assert _fila(app_client, admin_token, cot)["confirmacion_vigente"] is False
    r = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                        headers=auth(admin_token))
    assert r.status_code == 400, "sin la marca el servidor no convierte: hay que reabrirla"


def test_cotizacion_en_borrador_no_tiene_confirmacion_vigente(app_client, db, admin_token):
    cot = _cot(db, f"COT-CV4{_suf()}", estado="BORRADOR", gate2=False)
    assert _detalle(app_client, admin_token, cot.id)["confirmacion_vigente"] is False
    assert _fila(app_client, admin_token, cot)["confirmacion_vigente"] is False
