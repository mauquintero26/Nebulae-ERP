"""PEC hereda la fecha de entrega real del PVEN en vez de calcular la suya.

Cuando el Pedido de Compra se crea a partir de un Pedido de Venta (ven_id),
debe adoptar fecha_entrega_estimada del PVEN tal cual -- esa es la fecha real
comprometida con el cliente (Task 1). dias_entrega solo se usa quedan como
fallback cuando no hay ven_id, o el PVEN referenciado aun no tiene su propia
fecha (caso raro).
"""
from datetime import datetime, timedelta


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_pec_con_ven_id_hereda_fecha_del_pven(app_client, db, admin_token):
    from app.models.erp_documents import SaleOrder
    ven = SaleOrder(numero="PVEN-TEST001", customer_name="Cliente Prueba",
                     fecha_entrega_estimada=datetime.utcnow() + timedelta(days=7),
                     estado="PENDIENTE_COMPRA", productos=[])
    db.add(ven); db.commit(); db.refresh(ven)

    resp = app_client.post("/api/v1/compras/pedidos", json={
        "supplier_name": "Proveedor Prueba", "ven_id": ven.id, "ven_numero": ven.numero,
        "dias_entrega": 15,  # debe ser IGNORADO porque hay ven_id con fecha propia
        "productos": [{"nombre": "Producto X", "unit_price_cop": 1000}],
    }, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    pec_fecha = resp.json()["data"]["fecha_entrega_estimada"]
    assert pec_fecha == ven.fecha_entrega_estimada.isoformat()


def test_pec_sin_ven_id_usa_dias_entrega_manual(app_client, admin_token):
    resp = app_client.post("/api/v1/compras/pedidos", json={
        "supplier_name": "Proveedor Prueba", "dias_entrega": 20,
        "productos": [{"nombre": "Producto X", "unit_price_cop": 1000}],
    }, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    # Sin ven_id, se mantiene el comportamiento actual (fecha_compra + dias_entrega)
    assert resp.json()["data"]["fecha_entrega_estimada"] is not None


def test_pec_con_ven_id_sin_fecha_propia_usa_dias_entrega_fallback(app_client, db, admin_token):
    """Caso raro: el PVEN referenciado existe pero todavia no tiene su propia
    fecha_entrega_estimada (None) -- la PEC cae al comportamiento anterior."""
    from app.models.erp_documents import SaleOrder
    ven = SaleOrder(numero="PVEN-TEST002", customer_name="Cliente Prueba",
                     fecha_entrega_estimada=None,
                     estado="PENDIENTE_COMPRA", productos=[])
    db.add(ven); db.commit(); db.refresh(ven)

    resp = app_client.post("/api/v1/compras/pedidos", json={
        "supplier_name": "Proveedor Prueba", "ven_id": ven.id, "ven_numero": ven.numero,
        "dias_entrega": 20,
        "productos": [{"nombre": "Producto X", "unit_price_cop": 1000}],
    }, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["fecha_entrega_estimada"] is not None
