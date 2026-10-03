"""GET /ventas/solicitudes/{id} expone los Pedidos de Venta de la SC (navegacion SC -> COT -> PVEN)."""
from uuid import uuid4

from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder


def _suf():
    return uuid4().hex[:8].upper()


def _sc(db, estado="COTIZADA"):
    sc = CustomerRequest(numero=f"SC-DET-{_suf()}", customer_name="Cliente Detalle", estado=estado)
    db.add(sc)
    db.commit()
    db.refresh(sc)
    return sc


def _cot(db, sc, estado="CONFIRMADA"):
    cot = SalesQuotation(numero=f"COT-DET-{_suf()}", sc_id=sc.id, sc_numero=sc.numero,
                         customer_name=sc.customer_name, estado=estado)
    db.add(cot)
    db.commit()
    db.refresh(cot)
    return cot


def _ven(db, numero, estado="PENDIENTE_COMPRA", sc=None, cot=None):
    ven = SaleOrder(numero=numero, customer_name="Cliente Detalle", estado=estado,
                    sc_id=sc.id if sc else None, sc_numero=sc.numero if sc else None,
                    cot_id=cot.id if cot else None, cot_numero=cot.numero if cot else None)
    db.add(ven)
    db.commit()
    db.refresh(ven)
    return ven


def _get_sc(app_client, admin_token, sc_id):
    resp = app_client.get(f"/api/v1/ventas/solicitudes/{sc_id}",
                          headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    return resp.json()["data"]


def test_detalle_sc_lista_pedido_de_venta_creado_desde_su_cotizacion(app_client, db, admin_token):
    sc = _sc(db)
    cot = _cot(db, sc)
    ven = _ven(db, f"PVEN-DET-{_suf()}", sc=sc, cot=cot)

    data = _get_sc(app_client, admin_token, sc.id)

    assert [v["id"] for v in data["pedidos_venta"]] == [ven.id]
    assert data["pedidos_venta"][0]["cot_numero"] == cot.numero
    assert [c["id"] for c in data["cotizaciones"]] == [cot.id]


def test_detalle_sc_incluye_pedido_enlazado_solo_por_cot_id(app_client, db, admin_token):
    # Un PVEN creado desde una COT que despues se desvinculo de la SC conserva el cot_id
    # pero ya no tiene sc_id propio -- igual debe aparecer.
    sc = _sc(db)
    cot = _cot(db, sc)
    ven = _ven(db, f"PVEN-DET-{_suf()}", sc=None, cot=cot)

    data = _get_sc(app_client, admin_token, sc.id)

    assert [v["id"] for v in data["pedidos_venta"]] == [ven.id]


def test_detalle_sc_sin_pedidos_y_no_mezcla_pedidos_de_otras_solicitudes(app_client, db, admin_token):
    sc = _sc(db)
    otra_sc = _sc(db)
    otra_cot = _cot(db, otra_sc)
    _ven(db, f"PVEN-DET-{_suf()}", sc=otra_sc, cot=otra_cot)

    data = _get_sc(app_client, admin_token, sc.id)

    assert data["pedidos_venta"] == []
