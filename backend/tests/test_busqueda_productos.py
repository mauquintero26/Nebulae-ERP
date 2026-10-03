"""El parametro `search` de los listados tambien encuentra documentos por nombre de producto."""
from uuid import uuid4

from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder, PurchaseOrderFull


def _suf():
    return uuid4().hex[:8].upper()


def _doc(db, modelo, numero, **campos):
    doc = modelo(numero=numero, estado="BORRADOR", **campos)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def _buscar(app_client, admin_token, path, termino):
    resp = app_client.get(path, params={"search": termino, "limit": 200},
                          headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200, resp.text
    return [d["id"] for d in resp.json()["data"]]


def _probar(app_client, admin_token, db, path, modelo, busca_por_numero=True, **extra_cliente):
    suf = _suf()
    termino = f"Cuna Colecho XJ{suf}"
    con_producto = _doc(db, modelo, f"BUS-A-{suf}", productos=[{"product_name": termino, "qty": 1}], **extra_cliente)
    con_nombre_alterno = _doc(db, modelo, f"BUS-B-{suf}",
                              productos=[{"nombre": f"Mecedora QZ{suf}", "qty": 1}], **extra_cliente)
    con_otro_producto = _doc(db, modelo, f"BUS-C-{suf}", productos=[{"product_name": "Otra cosa", "qty": 1}], **extra_cliente)
    # Un documento sin lineas, o con el JSON en null, no debe romper la busqueda de los demas.
    sin_lineas = _doc(db, modelo, f"BUS-D-{suf}", productos=[], **extra_cliente)
    json_null = _doc(db, modelo, f"BUS-E-{suf}", productos=None, **extra_cliente)

    # Por nombre de producto (sin importar mayusculas) y por fragmento.
    assert _buscar(app_client, admin_token, path, termino.lower()) == [con_producto.id]
    assert _buscar(app_client, admin_token, path, f"colecho xj{suf}"[:-2]) == [con_producto.id]
    # Algunas pantallas guardan el nombre bajo "nombre" en vez de "product_name".
    assert _buscar(app_client, admin_token, path, f"mecedora qz{suf}") == [con_nombre_alterno.id]
    # Lo que no esta en ningun producto no devuelve nada.
    assert _buscar(app_client, admin_token, path, f"inexistente-{suf}") == []
    # La busqueda por numero sigue funcionando (el listado de pedidos web busca por pweb_numero, no por numero).
    if busca_por_numero:
        assert con_otro_producto.id in _buscar(app_client, admin_token, path, f"BUS-C-{suf}")
    assert sin_lineas.id not in _buscar(app_client, admin_token, path, termino)
    assert json_null.id not in _buscar(app_client, admin_token, path, termino)


def test_busqueda_de_solicitudes_por_producto(app_client, db, admin_token):
    _probar(app_client, admin_token, db, "/api/v1/ventas/solicitudes", CustomerRequest, customer_name="Cliente Busqueda")


def test_busqueda_de_cotizaciones_por_producto(app_client, db, admin_token):
    _probar(app_client, admin_token, db, "/api/v1/ventas/cotizaciones", SalesQuotation, customer_name="Cliente Busqueda")


def test_busqueda_de_pedidos_de_venta_por_producto(app_client, db, admin_token):
    _probar(app_client, admin_token, db, "/api/v1/ventas/pedidos", SaleOrder, customer_name="Cliente Busqueda")


def test_busqueda_de_pedidos_de_compra_por_producto(app_client, db, admin_token):
    _probar(app_client, admin_token, db, "/api/v1/compras/pedidos", PurchaseOrderFull, supplier_name="Proveedor Busqueda")


def test_busqueda_de_pedidos_web_por_producto(app_client, db, admin_token):
    _probar(app_client, admin_token, db, "/api/v1/ecommerce/pedidos", SaleOrder, busca_por_numero=False,
            customer_name="Cliente Web Busqueda", canal_venta="WEB")
