"""B4 T24: los parámetros exactos y el orden de las listas que usan las pantallas de Inventario y Compras.
- F74-b: GET /inventory/operations?id= (el enlace ?id= de Compras › Traslados buscaba con q=TRL-…&limit=5, y q también
  busca en notas, documento y guía: con más de 5 traslados más nuevos que mencionan el número salía «No se encontró»).
- B40-b: GET /products?sku= (el enlace ?sku= de Inventario › Productos pedía q=SKU&limit=50: un código corto que aparece
  en más de 50 productos quedaba fuera).
- F87-b: GET /categories y GET /inventory/warehouses ordenadas por nombre (y id) en el servidor.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_parametros_exactos_inventario).
"""
import uuid

from app.models.catalog import Category, Product, ProductSKU
from app.models.inventory import InventoryOperation, Warehouse

OPERACIONES = "/api/v1/inventory/operations"
PRODUCTOS = "/api/v1/products"
ID_NO_VALIDO = "El id de la operación debe ser un número entero positivo."


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _get(app_client, token, ruta, codigo=200, **params):
    resp = app_client.get(ruta, params=params, headers=_auth(token))
    assert resp.status_code == codigo, (ruta, params, resp.status_code, resp.text)
    return resp.json()


def _guardar(db, *objetos):
    db.add_all(objetos)
    db.commit()
    return objetos


def test_operaciones_por_id_exacto(app_client, db, admin_token, warehouse):
    s = uuid.uuid4().hex[:8]
    buscada, = _guardar(db, InventoryOperation(operation_type="TRANSFER", status="DONE", dest_warehouse_id=warehouse.id))
    numero = f"TRL-{buscada.id:04d}"
    # Seis traslados más nuevos que mencionan el número en las notas: con q=TRL-…&limit=5 la buscada quedaba fuera.
    _guardar(db, *[InventoryOperation(operation_type="TRANSFER", status="DONE", notas=f"ver {numero} {s}")
                   for _ in range(6)])
    assert buscada.id not in [o["id"] for o in _get(app_client, admin_token, OPERACIONES, q=numero, limit=5)["data"]]
    cuerpo = _get(app_client, admin_token, OPERACIONES, id=buscada.id, limit=5)
    assert [o["id"] for o in cuerpo["data"]] == [buscada.id] and cuerpo["total"] == 1
    assert _get(app_client, admin_token, OPERACIONES, id=f" {buscada.id} ")["total"] == 1
    assert _get(app_client, admin_token, OPERACIONES, id="")["total"] >= 7          # en blanco, sin filtro
    assert _get(app_client, admin_token, OPERACIONES, id=2 ** 31 - 1)["data"] == []  # no existe: lista vacía
    # se combina con los demás filtros
    assert _get(app_client, admin_token, OPERACIONES, id=buscada.id, operation_type="ADJUSTMENT")["data"] == []
    for valor in ("abc", "1.5", "-3", "0", str(2 ** 31), "1e3", "١٢"):
        assert _get(app_client, admin_token, OPERACIONES, 422, id=valor) == {"detail": ID_NO_VALIDO}, valor


def test_productos_por_sku_exacto(app_client, db, admin_token, brand, category):
    s = uuid.uuid4().hex[:6].upper()
    corto = f"K{s}"
    productos = _guardar(db, *[Product(brand_id=brand.id, category_id=category.id, name=f"Prod {s} {i}", type="Fisico",
                                       base_currency="USD", uom="Ud") for i in range(3)])
    # el código corto aparece en los otros dos productos (dentro de sus SKU), pero solo el primero lo tiene exacto
    _guardar(db, ProductSKU(product_id=productos[0].id, sku=corto, cost_price=1, sale_price=2),
             ProductSKU(product_id=productos[1].id, sku=f"{corto}-A", cost_price=1, sale_price=2),
             ProductSKU(product_id=productos[2].id, sku=f"X-{corto}", cost_price=1, sale_price=2))
    assert len(_get(app_client, admin_token, PRODUCTOS, q=corto)["data"]) == 3
    for valor in (corto, f"  {corto} "):
        assert [p["id"] for p in _get(app_client, admin_token, PRODUCTOS, sku=valor)["data"]] == [productos[0].id], valor
    assert _get(app_client, admin_token, PRODUCTOS, sku=corto.lower())["data"] == []      # exacto: distingue mayúsculas
    assert _get(app_client, admin_token, PRODUCTOS, sku=f"{corto}-NO")["data"] == []
    cuerpo = _get(app_client, admin_token, PRODUCTOS, sku=corto, offset=0)                 # también paginado
    assert cuerpo["total"] == 1 and [p["id"] for p in cuerpo["data"]] == [productos[0].id]
    assert _get(app_client, admin_token, PRODUCTOS, 422, sku="K\x00") == {
        "detail": "El filtro «sku» no puede llevar caracteres de control."}


def test_categorias_y_bodegas_por_nombre(app_client, db, admin_token):
    s = uuid.uuid4().hex[:6]
    # creadas en desorden: el id no sigue al nombre
    cats = _guardar(db, Category(name=f"Zz{s}-c"), Category(name=f"Zz{s}-a"), Category(name=f"Zz{s}-b"))
    bodegas = _guardar(db, Warehouse(name=f"Zz{s}-c", location_type="Central"),
                       Warehouse(name=f"Zz{s}-a", location_type="Central"),
                       Warehouse(name=f"Zz{s}-b", location_type="Central"))
    for ruta, filas in (("/api/v1/categories", cats), ("/api/v1/inventory/warehouses", bodegas)):
        data = _get(app_client, admin_token, ruta)["data"]
        mias = [x["name"] for x in data if x["id"] in {f.id for f in filas}]
        assert mias == [f"Zz{s}-a", f"Zz{s}-b", f"Zz{s}-c"], ruta
