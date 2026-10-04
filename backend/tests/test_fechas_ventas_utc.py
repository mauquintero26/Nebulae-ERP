"""H2: las fechas con hora de SC, COT, PVEN y PXP se entregan en UTC con zona ("...Z").

created_at / updated_at / cancelled_at / eliminada_at se guardan en UTC sin zona (utcnow). Sin la "Z" el navegador las
lee como hora local y todo se ve corrido 5 h en Colombia (un documento creado de noche sale con fecha de manana, y la
antiguedad da "hace -1d"). Las fechas de calendario o de negocio (fecha_solicitud, fecha_vencimiento, fecha_cotizacion,
fecha_entrega_estimada, fecha_creacion, fecha_pago) NO se tocan.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_fechas_ventas_utc
"""
from datetime import datetime, timezone

from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _es_utc_con_zona_y_reciente(created_at):
    assert created_at is not None
    assert created_at.endswith("Z"), created_at
    instante = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    assert abs((datetime.now(timezone.utc) - instante).total_seconds()) < 120, created_at


def _sc(db, numero="SC-UTC001", **campos):
    sc = CustomerRequest(numero=numero, customer_name="Cliente Fechas", estado="ASIGNADA", **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, sc=None, **campos):
    cot = SalesQuotation(numero=numero, sc_id=sc.id if sc else None, sc_numero=sc.numero if sc else None,
                         customer_name="Cliente Fechas", estado="BORRADOR", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _ven(db, numero, sc=None, cot=None, **campos):
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    v = SaleOrder(numero=numero, sc_id=sc.id if sc else None, cot_id=cot.id if cot else None,
                  customer_name="Cliente Fechas", **campos)
    db.add(v); db.commit(); db.refresh(v)
    return v


def test_las_fechas_de_sc_cot_y_pedido_se_entregan_en_utc_con_zona(app_client, db, admin_token):
    sc = _sc(db)
    cot = _cot(db, "COT-UTC001", sc)
    ven = _ven(db, "PVEN-UTC001", sc, cot)

    d = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]
    _es_utc_con_zona_y_reciente(d["created_at"])
    _es_utc_con_zona_y_reciente(d["updated_at"])
    _es_utc_con_zona_y_reciente(d["cotizaciones"][0]["created_at"])
    _es_utc_con_zona_y_reciente(d["pedidos_venta"][0]["updated_at"])

    d = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token)).json()["data"]
    _es_utc_con_zona_y_reciente(d["created_at"])
    _es_utc_con_zona_y_reciente(d["updated_at"])

    d = app_client.get(f"/api/v1/ventas/pedidos/{ven.id}", headers=auth(admin_token)).json()["data"]
    _es_utc_con_zona_y_reciente(d["created_at"])
    _es_utc_con_zona_y_reciente(d["updated_at"])


def test_las_listas_tambien_entregan_las_fechas_con_zona(app_client, db, admin_token):
    sc = _sc(db, "SC-UTC002")
    cot = _cot(db, "COT-UTC002", sc)
    ven = _ven(db, "PVEN-UTC002", sc, cot)
    for ruta, doc in (("solicitudes", sc), ("cotizaciones", cot), ("pedidos", ven)):
        resp = app_client.get(f"/api/v1/ventas/{ruta}", params={"search": doc.numero}, headers=auth(admin_token))
        assert resp.status_code == 200, resp.text
        fila = resp.json()["data"][0]
        _es_utc_con_zona_y_reciente(fila["created_at"])
        _es_utc_con_zona_y_reciente(fila["updated_at"])


def test_la_fecha_de_cancelacion_del_pedido_se_entrega_con_zona(app_client, db, admin_token):
    ven = _ven(db, "PVEN-UTC003")
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{ven.id}",
                            json={"estado": "CANCELADO", "cancellation_reason": "El cliente desistió"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    _es_utc_con_zona_y_reciente(resp.json()["data"]["cancelled_at"])
    # Un pedido sin cancelar no tiene fecha de cancelacion.
    otro = _ven(db, "PVEN-UTC004")
    d = app_client.get(f"/api/v1/ventas/pedidos/{otro.id}", headers=auth(admin_token)).json()["data"]
    assert d["cancelled_at"] is None


def test_la_fecha_de_eliminacion_de_la_solicitud_se_entrega_con_zona(app_client, db, admin_token):
    sc = _sc(db, "SC-UTC003")
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/cancelar",
                           json={"razon": "Cliente desistio", "user_name": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    d = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]
    _es_utc_con_zona_y_reciente(d["eliminada_at"])
    # Una SC que no esta en la papelera no tiene eliminada_at.
    otra = _sc(db, "SC-UTC004")
    d = app_client.get(f"/api/v1/ventas/solicitudes/{otra.id}", headers=auth(admin_token)).json()["data"]
    assert d["eliminada_at"] is None


def test_la_orden_de_pago_se_entrega_con_zona(app_client, db, admin_token):
    # Desde H44 la PXP sale del saldo del pedido: sin saldo responde 409.
    ven = _ven(db, "PVEN-UTC005", total_cop=1000000, anticipo_cop=600000, saldo_cop=400000)
    resp = app_client.post(f"/api/v1/ventas/pedidos/{ven.id}/crear-pxp", json={}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    _es_utc_con_zona_y_reciente(resp.json()["data"]["created_at"])
    # Y la lista de PXP tambien.
    lista = app_client.get("/api/v1/ventas/pxp", params={"limit": 200}, headers=auth(admin_token)).json()["data"]
    propia = [p for p in lista if p["ven_id"] == ven.id]
    assert propia and propia[0]["created_at"].endswith("Z")


def test_las_fechas_de_calendario_no_cambian_de_formato(app_client, db, admin_token):
    """fecha_vencimiento / fecha_entrega_estimada son fechas de negocio: sin 'Z' (isoformat tal cual)."""
    sc = _sc(db, "SC-UTC005", fecha_vencimiento=datetime(2026, 10, 20, 12, 0, 0))
    cot = _cot(db, "COT-UTC005", sc, fecha_entrega_estimada=datetime(2026, 11, 2, 0, 0, 0))
    d = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]
    assert d["fecha_vencimiento"] == "2026-10-20T12:00:00"
    d = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token)).json()["data"]
    assert d["fecha_entrega_estimada"] == "2026-11-02T00:00:00"
