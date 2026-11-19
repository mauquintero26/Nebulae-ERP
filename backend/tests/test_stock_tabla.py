"""B4 T13 (TABLA-inventario BACKEND puntos 1 y 2; R5, R10, R21; C8, C11; RP8, RP9, RP47, RP48, RP49, RP50, RP52, RP91,
D34, D46): GET /api/v1/inventory/stock-tabla sobre core/existencias y GET /api/v1/products con búsqueda y paginación.

- stock-tabla: por = sku | bodega, q, warehouse_id, categoria_id, estado_stock (agotado | bajo_minimo | abastecido, con el
  mínimo de cada referencia: no hay `umbral`), incluir_sin_stock (false ⇔ físico > 0), orden, limit, offset, con_conteos
  (todos, agotados, bajo_minimo, abastecidos, con_fisico) y con_resumen (valorizacion_cop, skus, bajo_minimo, agotados,
  disponibilidad_pct). Cada fila con por=bodega es la de _calculate_sku_availability, campo por campo (con el tránsito del
  SKU en cada bodega, RP50); con por=sku el tránsito se cuenta una vez.
- list_products: q (nombre, descripción o SKU; search es su alias), id (RP49), sin_tarifa_iva (RP48), orden y, solo con
  offset, {data, total} (RP47: sin offset devuelve todo, como hoy, aunque llegue limit=300). Cada producto suma
  precio_venta, costo y publicado tomados de sus SKU según la bandera de TD-03 (RP91).
La prueba 4 de TABLA-inventario (list_pedidos con saldo) ya está en T6B (test_pven_saldo_pendiente_y_pagado).

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_stock_tabla). Cada prueba crea sus
referencias con un sufijo único en el código del SKU y filtra con q=<sufijo>, o compara «después − antes».
ecommerce_products (el catálogo legacy de TD-03) no está en TABLAS del runner: su fila se crea dentro de la transacción
que se revierte, como en test_td03_parte2_cutover_lectura.
"""
import uuid
from datetime import timedelta
from decimal import Decimal

from fastapi.encoders import jsonable_encoder
from sqlalchemy import text

from app.models.catalog import Category, Product, ProductSKU, ProductWebListing
from app.models.erp_documents import PurchaseOrderFull
from app.models.fase1b import InventoryReservation, PurchaseOrderLine
from app.models.fase3 import InventoryQuarantine
from app.models.inventory import InventoryLevel, Warehouse
from tests.usuarios_de_prueba import bodega_token, compras_token  # noqa: F401 (fixtures por nombre, RP79)

RUTA = "/api/v1/inventory/stock-tabla"
RUTA_PRODUCTOS = "/api/v1/products"
CONTROL = "La búsqueda no puede llevar caracteres de control."
COLUMNAS = {"sku_id", "sku", "producto", "categoria", "bodega", "fisico", "reservado", "disponible", "cuarentena",
            "en_transito", "precio", "costo", "valorizacion", "minimo", "estado_stock", "warehouse_id",
            "rastrear_inventario"}
CONTEOS = {"todos", "agotados", "bajo_minimo", "abastecidos", "con_fisico"}
RESUMEN = {"valorizacion_cop", "skus", "bajo_minimo", "agotados", "disponibilidad_pct"}


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _get(app_client, token, ruta=RUTA, **params):
    resp = app_client.get(ruta, params=params, headers=_auth(token))
    assert resp.status_code == 200, (params, resp.status_code, resp.text)
    return resp.json()


def _error(app_client, token, ruta=RUTA, **params):
    resp = app_client.get(ruta, params=params, headers=_auth(token))
    assert resp.status_code == 422, (params, resp.status_code, resp.text)
    return resp.json()["detail"]


def _guardar(db, objeto):
    db.add(objeto)
    db.commit()
    return objeto


class _Escenario:
    """2 bodegas y las referencias de la prueba de paridad, todas con el sufijo en el código del SKU:
    - A (costo 10, precio 20): 10 en w1 y 3 en w2; reserva ACTIVE de 4 y una vencida de 3 en w1; cuarentena ACTIVO de 1 en
      w2; un PEC EN_TRANSITO con 6 pedidas y 2 recibidas (tránsito 4) y uno CANCELADO (no cuenta).
    - B (costo 3): 2 en w1, mínimo 8 en su publicación (bajo_minimo).
    - C (sin costo): 0 en w1 (agotado).
    - D (costo 4): 2 en w1, sin publicación (mínimo 5: bajo_minimo); se crea después de B (id mayor).
    - E (costo 1): 9 en w1, mínimo 10 (bajo_minimo con 9: el mínimo es el de cada referencia, no un umbral 5).
    - F (costo 2): sin niveles (por=sku la trae en 0, agotado; por=bodega no tiene filas).
    - G (costo 5): 7 en w1, publicación con rastrear_inventario = false (sale en la tabla; no suma al resumen)."""

    def __init__(self, db, product, warehouse):
        from app.core.fechas import ahora_utc
        self.db = db
        self.s = uuid.uuid4().hex[:8].upper()
        ahora = ahora_utc()
        self.w1 = warehouse
        self.w2 = _guardar(db, Warehouse(name=f"BodegaT13-{self.s}", location_type="Remota"))
        self.product = product

        def sku(letra, costo, precio):
            return _guardar(db, ProductSKU(product_id=product.id, sku=f"T13{letra}-{self.s}", cost_price=costo,
                                           sale_price=precio))

        self.a = sku("A", 10, 20)
        self.b = sku("B", 3, 5)
        self.c = sku("C", None, 9)
        self.d = sku("D", 4, 6)
        self.e = sku("E", 1, 2)
        self.f = sku("F", 2, 3)
        self.g = sku("G", 5, 8)
        for s_, bodega, cantidad in ((self.a, self.w1, 10), (self.a, self.w2, 3), (self.b, self.w1, 2),
                                     (self.c, self.w1, 0), (self.d, self.w1, 2), (self.e, self.w1, 9),
                                     (self.g, self.w1, 7)):
            _guardar(db, InventoryLevel(sku_id=s_.id, warehouse_id=bodega.id, quantity=cantidad))
        _guardar(db, InventoryReservation(sku_id=self.a.id, warehouse_id=self.w1.id, quantity_reserved=4,
                                          status="ACTIVE", expires_at=ahora + timedelta(days=3)))
        _guardar(db, InventoryReservation(sku_id=self.a.id, warehouse_id=self.w1.id, quantity_reserved=3,
                                          status="ACTIVE", expires_at=ahora - timedelta(days=3)))
        _guardar(db, InventoryQuarantine(sku_id=self.a.id, warehouse_id=self.w2.id, quantity=1, reason="Dañado",
                                         status="ACTIVO"))
        for i, (estado, pedidas, recibidas) in enumerate((("EN_TRANSITO", 6, 2), ("CANCELADO", 5, 0))):
            pec = _guardar(db, PurchaseOrderFull(numero=f"PEC-T13{self.s}{i}", supplier_name="T13",
                                                 warehouse_id=self.w1.id, estado=estado))
            _guardar(db, PurchaseOrderLine(pec_id=pec.id, sku_id=self.a.id, quantity_ordered=pedidas,
                                           quantity_received=recibidas))
        _guardar(db, ProductWebListing(sku_id=self.b.id, alerta_stock_minimo=8))
        _guardar(db, ProductWebListing(sku_id=self.e.id, alerta_stock_minimo=10))
        _guardar(db, ProductWebListing(sku_id=self.g.id, rastrear_inventario=False))

    def ids(self, *letras):
        return [getattr(self, l).id for l in letras]


def _skus(cuerpo):
    return [f["sku_id"] for f in cuerpo["data"]]


# ─── 1) Paridad con _calculate_sku_availability (RP50) ───────────────────────────────────────────────────────────────

def test_paridad_por_bodega_y_transito_una_vez_por_sku(app_client, db, admin_token, product, warehouse):
    from app.api.v1.erp_inventario import _calculate_sku_availability
    e = _Escenario(db, product, warehouse)
    cuerpo = _get(app_client, admin_token, por="bodega", q=e.s, limit=200)
    filas = cuerpo["data"]
    assert all(set(f) == COLUMNAS for f in filas), filas[0]
    pares = {(f["sku_id"], f["warehouse_id"]) for f in filas}
    assert pares == {(e.a.id, e.w1.id), (e.a.id, e.w2.id), (e.b.id, e.w1.id), (e.c.id, e.w1.id),
                     (e.d.id, e.w1.id), (e.e.id, e.w1.id), (e.g.id, e.w1.id)}
    assert cuerpo["total"] == 7
    for f in filas:
        hoy = _calculate_sku_availability(db, f["sku_id"], f["warehouse_id"])
        for columna, clave in (("fisico", "stock_vendible_fisico"), ("reservado", "stock_reservado"),
                               ("disponible", "stock_disponible"), ("cuarentena", "stock_cuarentena"),
                               ("en_transito", "stock_en_transito")):
            assert Decimal(str(f[columna])) == hoy[clave], (f["sku"], f["bodega"], columna, f[columna], hoy[clave])
    por_par = {(f["sku_id"], f["warehouse_id"]): f for f in filas}
    a1, a2 = por_par[(e.a.id, e.w1.id)], por_par[(e.a.id, e.w2.id)]
    assert (a1["fisico"], a1["reservado"], a1["disponible"], a1["cuarentena"]) == (10, 4, 6, 0)
    assert (a2["fisico"], a2["reservado"], a2["disponible"], a2["cuarentena"]) == (3, 0, 3, 1)
    # RP50: con por=bodega cada fila trae el tránsito del SKU (4 en las dos bodegas, no repartido ni sumado).
    assert (a1["en_transito"], a2["en_transito"]) == (4, 4)
    assert (a1["bodega"], a2["bodega"]) == (e.w1.name, e.w2.name)
    # RP52 (a): con por=bodega el estado usa el disponible de la fila y el mínimo de la referencia.
    assert (a1["estado_stock"], a2["estado_stock"]) == ("abastecido", "bajo_minimo")
    assert (a1["valorizacion"], a1["precio"], a1["costo"], a1["minimo"]) == (100, 20, 10, 5)
    assert por_par[(e.c.id, e.w1.id)]["valorizacion"] is None   # sin costo: '—' en la pantalla

    # Con por=sku la fila suma las bodegas y cuenta el tránsito UNA vez (4, no 8).
    por_sku = {f["sku_id"]: f for f in _get(app_client, admin_token, q=e.s, limit=200)["data"]}
    a = por_sku[e.a.id]
    assert (a["fisico"], a["reservado"], a["disponible"], a["cuarentena"], a["en_transito"]) == (13, 4, 9, 1, 4)
    assert (a["bodega"], a["warehouse_id"], a["valorizacion"], a["estado_stock"]) == (None, None, 130, "abastecido")
    assert set(por_sku) == set(e.ids("a", "b", "c", "d", "e", "f", "g"))   # F (sin niveles) sale en 0
    assert (por_sku[e.f.id]["fisico"], por_sku[e.f.id]["estado_stock"]) == (0, "agotado")
    # G (rastrear_inventario = false) sale en la tabla, con su marca.
    assert por_sku[e.g.id]["rastrear_inventario"] is False and por_sku[e.a.id]["rastrear_inventario"] is True


# ─── 2) Orden exacto, estado_stock con el mínimo de cada referencia, incluir_sin_stock, paginación ───────────────────

def test_orden_estado_stock_incluir_sin_stock_y_paginacion(app_client, db, admin_token, product, warehouse):
    e = _Escenario(db, product, warehouse)

    def lista(**params):
        return _skus(_get(app_client, admin_token, q=e.s, limit=200, **params))

    # Disponibles por SKU: A 9, B 2, C 0, D 2, E 9, F 0, G 7. Empates: sku_id desc (D antes que B, F antes que C).
    assert lista(orden="-disponible") == e.ids("e", "a", "g", "d", "b", "f", "c")
    assert lista(orden="disponible") == e.ids("f", "c", "d", "b", "g", "e", "a")
    assert lista(orden="sku") == e.ids("a", "b", "c", "d", "e", "f", "g")
    assert lista(orden="-sku") == e.ids("g", "f", "e", "d", "c", "b", "a")
    assert lista(orden="-valorizacion") == e.ids("a", "g", "e", "d", "b", "f", "c")   # NULL (sin costo) al final
    assert lista(orden="-precio") == e.ids("a", "c", "g", "d", "b", "f", "e")
    assert lista(orden="fisico") == e.ids("f", "c", "d", "b", "g", "e", "a")
    assert lista(orden="-reservado")[:1] == e.ids("a")
    assert lista(orden="-transito")[:1] == e.ids("a")
    # Sin orden: por producto (todas son del mismo) y el desempate sku_id desc.
    assert lista() == e.ids("g", "f", "e", "d", "c", "b", "a")

    # estado_stock con el mínimo de cada referencia (R10; no hay umbral): E tiene 9 y mínimo 10 -> bajo_minimo,
    # A tiene 9 y mínimo 5 -> abastecido.
    assert lista(estado_stock="bajo_minimo", orden="sku") == e.ids("b", "d", "e")
    assert lista(estado_stock="agotado", orden="sku") == e.ids("c", "f")
    assert lista(estado_stock="abastecido", orden="sku") == e.ids("a", "g")
    assert lista(estado_stock=" ", orden="sku") == lista(orden="sku")
    assert lista(estado_stock="todos", orden="sku") == lista(orden="sku")
    # RP52 (c): incluir_sin_stock=false <=> físico > 0 (fuera C, con 0, y F, sin niveles).
    assert lista(incluir_sin_stock="false", orden="sku") == e.ids("a", "b", "d", "e", "g")
    # Por bodega: el estado de la fila (A en w2 tiene 3: bajo_minimo).
    bajo = _get(app_client, admin_token, q=e.s, por="bodega", estado_stock="bajo_minimo", orden="sku", limit=200)
    assert [(f["sku_id"], f["warehouse_id"]) for f in bajo["data"]] == [
        (e.a.id, e.w2.id), (e.b.id, e.w1.id), (e.d.id, e.w1.id), (e.e.id, e.w1.id)]
    # Por bodega, un mismo SKU en dos bodegas desempata por bodega desc.
    por_sku_y_bodega = _get(app_client, admin_token, q=e.s, por="bodega", orden="sku", limit=2)
    assert [(f["sku_id"], f["warehouse_id"]) for f in por_sku_y_bodega["data"]] == [
        (e.a.id, max(e.w1.id, e.w2.id)), (e.a.id, min(e.w1.id, e.w2.id))]

    # limit, offset y total.
    pagina = _get(app_client, admin_token, q=e.s, orden="sku", limit=2, offset=1)
    assert pagina["total"] == 7 and _skus(pagina) == e.ids("b", "c")
    solo_total = _get(app_client, admin_token, q=e.s, limit=0)
    assert solo_total["total"] == 7 and solo_total["data"] == []
    assert set(solo_total) == {"status", "total", "data"}

    # Filtros de bodega y categoría.
    en_w2 = _get(app_client, admin_token, q=e.s, por="bodega", warehouse_id=e.w2.id)
    assert [(f["sku_id"], f["bodega"]) for f in en_w2["data"]] == [(e.a.id, e.w2.name)]
    a_en_w2 = {f["sku_id"]: f for f in _get(app_client, admin_token, q=e.s, warehouse_id=e.w2.id, limit=200)["data"]}
    assert (a_en_w2[e.a.id]["fisico"], a_en_w2[e.a.id]["cuarentena"], a_en_w2[e.a.id]["en_transito"]) == (3, 1, 4)
    otra = _guardar(db, Category(name=f"CatT13-{e.s}"))
    otro = _guardar(db, Product(brand_id=product.brand_id, category_id=otra.id, name=f"Otro {e.s}", type="Fisico",
                                base_currency="COP"))
    h = _guardar(db, ProductSKU(product_id=otro.id, sku=f"T13H-{e.s}", cost_price=1, sale_price=1))
    assert _skus(_get(app_client, admin_token, q=e.s, categoria_id=otra.id)) == [h.id]
    assert e.a.id in _skus(_get(app_client, admin_token, q=e.s, categoria_id=product.category_id, limit=200))
    assert h.id not in _skus(_get(app_client, admin_token, q=e.s, categoria_id=product.category_id, limit=200))
    # q busca por el SKU o por el nombre del producto.
    assert _skus(_get(app_client, admin_token, q=f"Otro {e.s}")) == [h.id]
    assert _skus(_get(app_client, admin_token, q=e.b.sku.lower())) == [e.b.id]


# ─── Conteos y resumen ───────────────────────────────────────────────────────────────────────────────────────────────

def test_conteos_y_resumen(app_client, db, admin_token, product, warehouse):
    from app.core.existencias import resumen_existencias
    e = _Escenario(db, product, warehouse)
    cuerpo = _get(app_client, admin_token, q=e.s, con_conteos="true", con_resumen="true", limit=0)
    assert set(cuerpo) == {"status", "total", "data", "conteos", "resumen"}
    assert cuerpo["conteos"] == {"todos": 7, "agotados": 2, "bajo_minimo": 3, "abastecidos": 2, "con_fisico": 5}
    # R5: los conteos se calculan con la búsqueda y los filtros extra, SIN estado_stock ni incluir_sin_stock.
    con_filtros = _get(app_client, admin_token, q=e.s, con_conteos="true", con_resumen="true", limit=0,
                       estado_stock="agotado", incluir_sin_stock="false")
    assert con_filtros["total"] == 0
    assert con_filtros["conteos"] == cuerpo["conteos"] and con_filtros["resumen"] == cuerpo["resumen"]
    # El resumen: por referencia (el tránsito no entra; G con rastrear_inventario = false no suma). Valor: A 130,
    # B 6, D 8, E 9 (C sin costo); 6 referencias; bajo_minimo B, D y E; agotadas C y F; disponibles 9+2+0+2+9+0 = 22
    # sobre físicas 13+2+0+2+9+0 = 26 -> 84,6 %.
    assert cuerpo["resumen"] == {"valorizacion_cop": 153, "skus": 6, "bajo_minimo": 3, "agotados": 2,
                                 "disponibilidad_pct": 84.6}
    # B4 T24 (B36): el resumen ES resumen_existencias con la búsqueda y la categoría (solo cambian los nombres).
    x = resumen_existencias(db, q=e.s)
    assert (x["valor_inventario_cop"], x["skus_total"], x["skus_bajo_minimo"], x["skus_agotados"],
            x["disponibilidad_pct"]) == (153, 6, 3, 2, 84.6)
    from app.models.catalog import Category
    otra = Category(name=f"Otra-{e.s}")
    db.add(otra)
    db.commit()
    assert resumen_existencias(db, q=e.s, categoria_id=otra.id)["skus_total"] == 0
    assert _get(app_client, admin_token, q=e.s, categoria_id=otra.id, con_resumen="true", limit=0)["resumen"] == {
        "valorizacion_cop": 0, "skus": 0, "bajo_minimo": 0, "agotados": 0, "disponibilidad_pct": None}
    # Por bodega los conteos cuentan filas (pares): A-w1 abastecido, A-w2 bajo, B, D y E bajo, C agotado, G abastecido.
    por_bodega = _get(app_client, admin_token, q=e.s, por="bodega", con_conteos="true", con_resumen="true", limit=0)
    assert por_bodega["conteos"] == {"todos": 7, "agotados": 1, "bajo_minimo": 4, "abastecidos": 2, "con_fisico": 6}
    assert por_bodega["resumen"] == cuerpo["resumen"]   # el resumen siempre es por referencia (RP50)
    # Paridad con resumen_existencias (la regla de /inventory/stats) sin búsqueda: toda la base y una bodega.
    for params, bodega in (({}, None), ({"warehouse_id": e.w2.id}, e.w2.id)):
        r = _get(app_client, admin_token, con_resumen="true", limit=0, **params)["resumen"]
        x = resumen_existencias(db, warehouse_id=bodega)
        assert r == {"valorizacion_cop": x["valor_inventario_cop"], "skus": x["skus_total"],
                     "bajo_minimo": x["skus_bajo_minimo"], "agotados": x["skus_agotados"],
                     "disponibilidad_pct": x["disponibilidad_pct"]}, (params, r, x)
    sin_nada = _get(app_client, admin_token, q=f"nada-{e.s}", con_resumen="true", con_conteos="true", limit=0)
    assert sin_nada["resumen"] == {"valorizacion_cop": 0, "skus": 0, "bajo_minimo": 0, "agotados": 0,
                                   "disponibilidad_pct": None}
    assert sin_nada["conteos"] == {k: 0 for k in CONTEOS}
    sin_pedir = _get(app_client, admin_token, q=e.s)
    assert "conteos" not in sin_pedir and "resumen" not in sin_pedir


def test_consultas_no_dependen_de_cuantas_referencias(app_client, db, admin_token, product, warehouse, contador_sql):
    """Nada de una consulta por referencia o por bodega: con 7 y con 27 referencias, las mismas consultas."""
    e = _Escenario(db, product, warehouse)

    def medir():
        with contador_sql.ventana() as v:
            _get(app_client, admin_token, q=e.s, por="bodega", con_conteos="true", con_resumen="true",
                 warehouse_id=e.w1.id, limit=200)
        assert v.commits == 0
        return v.consultas

    con_7 = medir()
    for i in range(20):
        nuevo = _guardar(db, ProductSKU(product_id=product.id, sku=f"T13N{i:02d}-{e.s}", cost_price=1, sale_price=2))
        _guardar(db, InventoryLevel(sku_id=nuevo.id, warehouse_id=e.w1.id, quantity=i))
    con_27 = medir()
    assert con_7 == con_27 and con_27 <= 8, (con_7, con_27)


# ─── Errores, permisos y parámetros ──────────────────────────────────────────────────────────────────────────────────

def test_ordenes_stock_ya_no_esta():
    """B4 T24 (B38): ORDENES_STOCK figuraba como la lista de órdenes de /stock-tabla pero nadie la usaba (las órdenes reales
    son las claves de _ordenes_stock): se borró."""
    from app.api.v1 import erp_inventario
    assert not hasattr(erp_inventario, "ORDENES_STOCK")


def test_errores_en_espanol(app_client, admin_token):
    """R21 y D46: cada 422 con su texto exacto, por igualdad."""
    from app.core.listados import MAX_OFFSET
    from main import MENSAJE_DATOS_INVALIDOS
    casos = [
        ({"por": "producto"}, "No se puede agrupar por «producto»: usa sku o bodega."),
        ({"por": "x" * 300}, f"No se puede agrupar por «{'x' * 40}»: usa sku o bodega."),
        ({"estado_stock": "critico"},
         "El estado de stock «critico» no existe: usa agotado, bajo_minimo o abastecido."),
        ({"estado_stock": "ok"}, "El estado de stock «ok» no existe: usa agotado, bajo_minimo o abastecido."),
        ({"orden": "bodega"}, "No se puede ordenar por «bodega»."),
        ({"orden": "-atencion"}, "No se puede ordenar por «-atencion»."),
        ({"orden": "umbral; drop table"}, "No se puede ordenar por «umbral; drop table»."),
        ({"q": "\x00"}, CONTROL),
        ({"q": "a\x7fb"}, CONTROL),
        ({"estado_stock": "ago\x00tado"}, CONTROL),
        ({"por": "s\x1bku"}, CONTROL),
        ({"warehouse_id": 10 ** 9}, "La bodega «1000000000» no existe."),
        ({"categoria_id": 10 ** 9}, "La categoría «1000000000» no existe."),
    ]
    for params, texto in casos:
        assert _error(app_client, admin_token, **params) == texto, params
    for params in ({"warehouse_id": "abc"}, {"categoria_id": "1.5"}, {"incluir_sin_stock": "quizas"},
                   {"con_conteos": "quizas"}, {"limit": 201}, {"limit": -1}, {"offset": -1},
                   {"offset": MAX_OFFSET + 1}):
        resp = app_client.get(RUTA, params=params, headers=_auth(admin_token))
        assert resp.status_code == 400 and resp.json()["message"] == MENSAJE_DATOS_INVALIDOS, (params, resp.text)
    # Un tabulador en medio de la búsqueda no es un error; en blanco no filtra.
    # B4 T24 (B35): el tabulador pasa a un espacio (D46): el total es el de «T13 A», no solo «no es negativo».
    assert _get(app_client, admin_token, q="T13\tA", limit=0)["total"] == _get(app_client, admin_token, q="T13 A",
                                                                                 limit=0)["total"]
    assert _get(app_client, admin_token, q="   ", limit=0)["total"] == _get(app_client, admin_token, limit=0)["total"]


def test_permisos_y_parametros_declarados(app_client, admin_token, vendedor_token, compras_token, bodega_token):
    from app.core.listados import MAX_OFFSET
    from main import app
    for token in (vendedor_token, compras_token, bodega_token):
        _get(app_client, token, limit=0)
    assert app_client.get(RUTA).status_code == 401
    parametros = {p["name"]: p for p in app.openapi()["paths"][RUTA]["get"]["parameters"]}
    assert set(parametros) == {"por", "q", "warehouse_id", "categoria_id", "estado_stock", "incluir_sin_stock", "orden",
                               "limit", "offset", "con_conteos", "con_resumen"}   # sin `umbral` (R10)
    limite = parametros["limit"]["schema"]
    assert (limite["default"], limite["minimum"], limite["maximum"]) == (50, 0, 200)
    assert parametros["offset"]["schema"]["maximum"] == MAX_OFFSET


# ─── 3) list_products: q, id, sin_tarifa_iva, orden, offset y total; precio, costo y publicado del SKU ──────────────

def _productos(db, brand, category, s):
    """Tres productos con el sufijo en el nombre: P1 con dos SKU (precios 20 y 15; costos 10 y sin costo), P2 con un SKU
    (costo 0, como quick-create) y la descripción con «tornillo», y P3 sin SKU y sin tarifa de IVA."""
    p1 = _guardar(db, Product(brand_id=brand.id, category_id=category.id, name=f"Banda {s}", type="Fisico",
                              base_currency="COP", tarifa_iva="19"))
    p2 = _guardar(db, Product(brand_id=brand.id, category_id=category.id, name=f"Alicate {s}", type="Servicio",
                              base_currency="COP", description=f"tornillo-{s}", tarifa_iva="5"))
    p3 = _guardar(db, Product(brand_id=brand.id, category_id=category.id, name=f"Cable {s}", type="Fisico",
                              base_currency="COP", tarifa_iva=None))
    s1 = _guardar(db, ProductSKU(product_id=p1.id, sku=f"PB1-{s}", sale_price=20, cost_price=10))
    s2 = _guardar(db, ProductSKU(product_id=p1.id, sku=f"PB2-{s}", sale_price=15, cost_price=None))
    s3 = _guardar(db, ProductSKU(product_id=p2.id, sku=f"PA1-{s}", sale_price=7, cost_price=0))
    return p1, p2, p3, s1, s2, s3


def _ids_productos(cuerpo):
    return [p["id"] for p in cuerpo["data"]]


def test_list_products_un_cero_es_sin_precio_y_sin_costo(app_client, db, admin_token, brand, category):
    s = uuid.uuid4().hex[:8].upper()
    mixto = _guardar(db, Product(brand_id=brand.id, category_id=category.id, name=f"Mixto {s}", type="Fisico",
                                 base_currency="COP"))
    ceros = _guardar(db, Product(brand_id=brand.id, category_id=category.id, name=f"Ceros {s}", type="Fisico",
                                 base_currency="COP"))
    for producto, codigo, costo, precio in ((mixto, "M0", 0, 0), (mixto, "M1", 8, 30), (ceros, "C0", 0, 0)):
        _guardar(db, ProductSKU(product_id=producto.id, sku=f"{codigo}-{s}", cost_price=costo, sale_price=precio))
    por_id = {p["id"]: p for p in _get(app_client, admin_token, RUTA_PRODUCTOS, q=s)["data"]}
    assert (por_id[mixto.id]["precio_venta"], por_id[mixto.id]["costo"]) == (30, 8)
    assert (por_id[ceros.id]["precio_venta"], por_id[ceros.id]["costo"]) == (None, None)


def test_el_filtro_de_categoria_incluye_las_subcategorias(app_client, db, admin_token, brand):
    """B4.1 (P25): la categoría del filtro cubre a sus descendientes; una hermana no; un ciclo no cuelga la consulta."""
    from app.core.existencias import resumen_existencias
    s = uuid.uuid4().hex[:8].upper()
    padre = _guardar(db, Category(name=f"Padre-{s}"))
    hija = _guardar(db, Category(name=f"Hija-{s}", parent_id=padre.id))
    nieta = _guardar(db, Category(name=f"Nieta-{s}", parent_id=hija.id))
    hermana = _guardar(db, Category(name=f"Hermana-{s}", parent_id=padre.id))
    producto = _guardar(db, Product(brand_id=brand.id, category_id=nieta.id, name=f"Prod {s}", type="Fisico",
                                    base_currency="COP"))
    sku = _guardar(db, ProductSKU(product_id=producto.id, sku=f"SUB-{s}", cost_price=1, sale_price=2))

    def en_tabla(categoria):
        return [f["sku_id"] for f in _get(app_client, admin_token, q=s, categoria_id=categoria.id)["data"]]

    for categoria in (padre, hija, nieta):
        assert en_tabla(categoria) == [sku.id], categoria.name
        assert resumen_existencias(db, categoria_id=categoria.id, q=s)["skus_total"] == 1, categoria.name
    assert en_tabla(hermana) == []
    assert resumen_existencias(db, categoria_id=hermana.id, q=s)["skus_total"] == 0
    # Un ciclo en parent_id (A -> B -> A): UNION termina; con UNION ALL la recursión no acabaría.
    a = _guardar(db, Category(name=f"CicloA-{s}"))
    b = _guardar(db, Category(name=f"CicloB-{s}", parent_id=a.id))
    a.parent_id = b.id
    db.commit()
    db.execute(text("SET LOCAL statement_timeout = '5s'"))
    assert en_tabla(a) == [] and en_tabla(b) == []


def test_list_products_busqueda_offset_total_y_compatibilidad(app_client, db, admin_token, brand, category):
    s = uuid.uuid4().hex[:8].upper()
    p1, p2, p3, s1, _, _ = _productos(db, brand, category, s)

    def productos(**params):
        return _get(app_client, admin_token, RUTA_PRODUCTOS, **params)

    # q: nombre, descripción o un SKU; search es su alias (RP8); en blanco no filtra.
    assert sorted(_ids_productos(productos(q=s))) == sorted([p1.id, p2.id, p3.id])
    assert _ids_productos(productos(q=f"tornillo-{s}")) == [p2.id]
    assert _ids_productos(productos(q=s1.sku.lower())) == [p1.id]
    assert _ids_productos(productos(q=f"Banda {s}")) == [p1.id]
    for params in ({"q": s}, {"search": s}, {"q": f"  {s} "}, {"q": "  ", "search": s}, {"q": s, "search": "nada"}):
        assert productos(offset=0, limit=0, **params)["total"] == 3, params
    # Con offset pagina y suma total (RP47); limit=0 da solo el total.
    pagina = productos(q=s, orden="nombre", limit=2, offset=1)
    assert set(pagina) == {"status", "total", "data"} and pagina["total"] == 3
    assert _ids_productos(pagina) == [p1.id, p3.id]   # Alicate, Banda, Cable
    assert productos(q=s, offset=0, limit=0) == {"status": "success", "total": 3, "data": []}
    assert _ids_productos(productos(q=s, offset=0)) == [p2.id, p1.id, p3.id]   # sin limit: 50 por página, por nombre
    # Sin offset devuelve TODO, como hoy, aunque llegue limit=300 (o 100, o 0): {status, data}, sin total.
    todos = productos()
    assert set(todos) == {"status", "data"} and len(todos["data"]) == db.query(Product).count()
    for limite in (300, 100, 0):
        cuerpo = productos(limit=limite)
        assert set(cuerpo) == {"status", "data"} and _ids_productos(cuerpo) == _ids_productos(todos), limite
    con_busqueda = productos(q=s, limit=1)
    assert set(con_busqueda) == {"status", "data"} and len(con_busqueda["data"]) == 3
    # El tope de la página solo vale con offset (R21: 422 en español).
    for limite in (201, 300, -1):
        assert _error(app_client, admin_token, RUTA_PRODUCTOS, offset=0, limit=limite) == (
            "El límite de la página debe estar entre 0 y 200.")
    productos(offset=0, limit=200)


def test_list_products_orden_id_e_iva(app_client, db, admin_token, brand, category):
    s = uuid.uuid4().hex[:8].upper()
    p1, p2, p3, _, _, _ = _productos(db, brand, category, s)
    p4 = _guardar(db, Product(brand_id=brand.id, category_id=category.id, name=f"Banda {s}", type="Fisico",
                              base_currency="COP", tarifa_iva="EXENTO"))   # mismo nombre que P1: desempate id desc

    def ids(**params):
        return _ids_productos(_get(app_client, admin_token, RUTA_PRODUCTOS, q=s, offset=0, **params))

    assert ids(orden="nombre") == [p2.id, p4.id, p1.id, p3.id]
    assert ids(orden="-nombre") == [p3.id, p4.id, p1.id, p2.id]
    assert ids(orden="creado") == [p1.id, p2.id, p3.id, p4.id]
    assert ids(orden="-creado") == [p4.id, p3.id, p2.id, p1.id]
    assert ids(orden="tipo") == [p4.id, p3.id, p1.id, p2.id]   # Fisico (id desc) y luego Servicio
    # orden también sirve sin offset (devuelve todo, ordenado).
    assert _ids_productos(_get(app_client, admin_token, RUTA_PRODUCTOS, q=s, orden="-creado")) == [
        p4.id, p3.id, p2.id, p1.id]
    for orden in ("precio", "-atencion", "id"):
        assert _error(app_client, admin_token, RUTA_PRODUCTOS, orden=orden) == f"No se puede ordenar por «{orden}»."
    # id (RP49): solo ese producto; uno que no existe, 422.
    assert _ids_productos(_get(app_client, admin_token, RUTA_PRODUCTOS, id=p2.id)) == [p2.id]
    assert _error(app_client, admin_token, RUTA_PRODUCTOS, id=10 ** 9) == "El producto «1000000000» no existe."
    # sin_tarifa_iva (RP48): true = tarifa_iva IS NULL (sinTarifaIva de lib/iva.js); false = con tarifa.
    assert ids(sin_tarifa_iva="true") == [p3.id]
    assert ids(sin_tarifa_iva="false", orden="creado") == [p1.id, p2.id, p4.id]
    # Los filtros de B3-T8 siguen: necesita_revision, brand_id y category_id.
    p3.necesita_revision = True
    db.commit()
    assert ids(necesita_revision="true") == [p3.id]
    assert ids(brand_id=brand.id, category_id=category.id, orden="creado") == [p1.id, p2.id, p3.id, p4.id]
    assert _get(app_client, admin_token, RUTA_PRODUCTOS, q=s, offset=0, category_id=10 ** 9)["total"] == 0
    from main import MENSAJE_DATOS_INVALIDOS
    for params in ({"id": "abc"}, {"offset": -1}, {"sin_tarifa_iva": "quizas"}, {"limit": "x"}):
        resp = app_client.get(RUTA_PRODUCTOS, params=params, headers=_auth(admin_token))
        assert resp.status_code == 400 and resp.json()["message"] == MENSAJE_DATOS_INVALIDOS, (params, resp.text)
    for params in ({"q": "\x00"}, {"search": "ca\x00ble"}):
        assert _error(app_client, admin_token, RUTA_PRODUCTOS, **params) == CONTROL, params


def test_list_products_precio_costo_y_publicado_segun_td03(app_client, db, admin_token, brand, category, monkeypatch):
    """RP91: precio_venta = el menor sale_price de sus SKU; costo = el menor cost_price no nulo; publicado sigue la
    bandera de TD-03 (canónico: algún ProductWebListing.publicado_web; legacy: algún ecommerce_products.publicado_web)."""
    s = uuid.uuid4().hex[:8].upper()
    p1, p2, p3, s1, s2, s3 = _productos(db, brand, category, s)
    _guardar(db, ProductWebListing(sku_id=s2.id, publicado_web=True))    # canónico: P1 publicado por su segundo SKU
    _guardar(db, ProductWebListing(sku_id=s3.id, publicado_web=False))
    db.execute(text("INSERT INTO ecommerce_products (nombre, sku, publicado_web) VALUES (:n, :sku, TRUE)"),
               {"n": f"Legacy {s}", "sku": s3.sku})                        # legacy: solo P2 publicado
    db.commit()

    def por_id(**params):
        return {p["id"]: p for p in _get(app_client, admin_token, RUTA_PRODUCTOS, q=s, **params)["data"]}

    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    canonico = por_id()
    assert (canonico[p1.id]["precio_venta"], canonico[p1.id]["costo"], canonico[p1.id]["publicado"]) == (15, 10, True)
    assert (canonico[p2.id]["precio_venta"], canonico[p2.id]["costo"], canonico[p2.id]["publicado"]) == (7, None, False)   # B4.1 (P17): un 0 es sin costo
    assert (canonico[p3.id]["precio_venta"], canonico[p3.id]["costo"], canonico[p3.id]["publicado"]) == (
        None, None, False)   # un producto sin SKU
    assert por_id(offset=0)[p1.id]["publicado"] is True   # igual con la página
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    legacy = por_id()
    assert (legacy[p1.id]["publicado"], legacy[p2.id]["publicado"], legacy[p3.id]["publicado"]) == (False, True, False)
    assert legacy[p1.id]["precio_venta"] == 15 and legacy[p1.id]["costo"] == 10
    monkeypatch.delenv("CATALOGO_LECTURA", raising=False)   # sin la bandera: legacy (ecommerce._lectura_canonica)
    assert por_id()[p2.id]["publicado"] is True


def test_list_products_publicado_en_una_consulta(app_client, db, admin_token, brand, category, contador_sql,
                                                 monkeypatch):
    """precio_venta y costo salen de los SKU que ya carga la respuesta de hoy, y publicado de UNA consulta para toda la
    lista (canónico: product_web_listings; legacy: ecommerce_products, más la que mira si la tabla existe): con 3 y con
    13 productos, las mismas. Lo único que crece por producto es la serialización de hoy (ProductResponse carga los SKU
    y sus atributos de cada producto): a lo sumo 2 consultas por producto con un SKU."""
    s = uuid.uuid4().hex[:8].upper()
    _productos(db, brand, category, s)

    def medir(tabla):
        with contador_sql.ventana() as v:
            _get(app_client, admin_token, RUTA_PRODUCTOS, q=s, offset=0, limit=50)
        return v.consultas, sum(1 for sentencia in v.sentencias if tabla in sentencia)

    for bandera, tabla, cuantas in (("canonico", "product_web_listings", 1), ("legacy", "ecommerce_products", 2)):
        monkeypatch.setenv("CATALOGO_LECTURA", bandera)
        assert medir(tabla)[1] == cuantas, bandera
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    antes, publicado_antes = medir("product_web_listings")
    for i in range(10):
        p = _guardar(db, Product(brand_id=brand.id, category_id=category.id, name=f"Extra{i} {s}", type="Fisico",
                                 base_currency="COP"))
        _guardar(db, ProductSKU(product_id=p.id, sku=f"PX{i}-{s}", sale_price=i, cost_price=i))
    despues, publicado_despues = medir("product_web_listings")
    assert publicado_antes == publicado_despues == 1
    assert despues - antes <= 2 * 10, (antes, despues)


# ─── R5: sin los parámetros nuevos, list_products responde como hoy ─────────────────────────────────────────────────

def _hoy_list_products(db, brand_id=None, category_id=None, necesita_revision=None):
    """Copia congelada de list_products de 16d11a0 (antes de T13)."""
    from app.schemas import catalog as schemas
    query = db.query(Product)
    if brand_id:
        query = query.filter(Product.brand_id == brand_id)
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if necesita_revision is not None:
        query = query.filter(Product.necesita_revision == necesita_revision)
    products = query.all()
    return {"status": "success", "data": [schemas.ProductResponse.model_validate(p).model_dump() for p in products]}


def test_list_products_sin_parametros_nuevos_responde_como_hoy(app_client, db, admin_token, brand, category):
    """R5: con solo los parámetros de hoy (y los que hoy se ignoran: limit sin offset), las mismas claves, los mismos
    productos en el mismo orden y los mismos valores; cada producto suma solo precio_venta, costo y publicado."""
    s = uuid.uuid4().hex[:8].upper()
    _productos(db, brand, category, s)
    for params, de_hoy in (({}, {}), ({"brand_id": brand.id}, {"brand_id": brand.id}),
                           ({"category_id": category.id}, {"category_id": category.id}),
                           ({"necesita_revision": "false"}, {"necesita_revision": False}),
                           ({"limit": 300}, {}), ({"limit": 200}, {})):
        nuevo = _get(app_client, admin_token, RUTA_PRODUCTOS, **params)
        db.expire_all()
        esperado = jsonable_encoder(_hoy_list_products(db, **de_hoy))
        assert set(nuevo) == set(esperado) == {"status", "data"}, params
        assert _ids_productos(nuevo) == _ids_productos(esperado), params
        for p_nuevo, p_hoy in zip(nuevo["data"], esperado["data"]):
            assert set(p_nuevo) - set(p_hoy) == {"precio_venta", "costo", "publicado"}, params
            assert {k: v for k, v in p_nuevo.items() if k in p_hoy} == p_hoy, params
