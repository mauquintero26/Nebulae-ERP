"""B4 T13 (ANALISIS-inventario BACKEND puntos 1 y 2; R10, R13, R21; C11, C12; RP1, RP9, RP29, RP51, D34, D44):
core/analisis_inventario.py y GET /api/v1/inventory/analisis con el contrato único de core/analisis.py.

- Valor = al costo (cost_price; sin costo vale 0 y va en el aviso). El valor actual es el de
  resumen_existencias.valor_inventario_cop (fuera las referencias con rastrear_inventario = false, RP51).
- Movimientos según direction: entradas IN y ADJUST_IN; salidas OUT y ADJUST_OUT; TRANSFER_IN y TRANSFER_OUT solo cuando
  se filtra una bodega; QUARANTINE, los sin dirección y los demás valores no cuentan (aviso).
- El valor al cierre de cada cubeta se reconstruye hacia atrás desde el valor actual restando el neto valorizado de los
  movimientos posteriores, al costo de hoy. inventory_movements.created_at es timestamptz: los días son de Colombia con la
  rama timestamptz de expr_local (RP1).
- «Referencias agotadas» (foto de hoy) = estado_stock 'agotado' (disponible 0) con salidas en los últimos 90 días (RP51).

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_analisis_inventario). Cada prueba crea su
propia bodega y sus SKU y pide bodega=<id>, para que no la afecte el stock de erp_test; la ventana 2001-01-01..10 no tiene
movimientos en erp_test.
"""
import uuid
from datetime import datetime, timedelta, timezone

from app.core.analisis import (CLAVES_ANALISIS, CLAVES_BARRAS, CLAVES_DONA, CLAVES_FILA_RANKING, CLAVES_KPI,
                               CLAVES_LINEA, CLAVES_MOVIMIENTO, CLAVES_MOVIMIENTOS, CLAVES_RANKING, CLAVES_SEGMENTO,
                               CLAVES_SERIE, CLAVES_SERIE_BARRAS)
from app.models.catalog import Category, Product, ProductSKU, ProductWebListing
from app.models.fase1b import InventoryReservation
from app.models.inventory import InventoryLevel, InventoryMovement, InventoryOperation, Warehouse
from tests.usuarios_de_prueba import bodega_token, compras_token  # noqa: F401 (fixtures por nombre, RP79)

RUTA = "/api/v1/inventory/analisis"
VENTANA = {"periodo": "personalizado", "desde": "2001-01-01", "hasta": "2001-01-10"}
KPIS = ["valor_inventario", "entradas", "salidas", "referencias_agotadas"]


def _utc(*partes):
    return datetime(*partes, tzinfo=timezone.utc)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _analisis(app_client, token, **params):
    resp = app_client.get(RUTA, params={**VENTANA, **params}, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _kpis(data):
    return {k["clave"]: k for k in data["kpis"]}


def _serie(bloque, clave):
    return next(s for s in bloque["series"] if s["clave"] == clave)


def _en(fechas, valores, dia):
    return valores[fechas.index(dia)]


def _dona(data, clave):
    return {s["etiqueta"]: s["valor"] for s in next(d for d in data["donas"] if d["clave"] == clave)["segmentos"]}


class _Fabrica:
    """Una bodega propia (w) y lo que cada prueba necesita: SKU con costo y nivel, y movimientos con su operación (un
    documento de origen con el sufijo) a un instante UTC dado."""

    def __init__(self, db, product):
        self.db = db
        self.product = product
        self.s = uuid.uuid4().hex[:8].upper()
        self.n = 0
        self.w = self._guardar(Warehouse(name=f"BodegaAn-{self.s}", location_type="Central"))

    def _guardar(self, objeto):
        self.db.add(objeto)
        self.db.commit()
        return objeto

    def bodega(self):
        self.n += 1
        return self._guardar(Warehouse(name=f"BodegaAn{self.n}-{self.s}", location_type="Remota"))

    def sku(self, costo=1_000, nivel=None, bodega=None, product=None):
        self.n += 1
        sku = self._guardar(ProductSKU(product_id=(product or self.product).id, sku=f"AN{self.n:02d}-{self.s}",
                                       cost_price=costo, sale_price=5_000))
        if nivel is not None:
            self._guardar(InventoryLevel(sku_id=sku.id, warehouse_id=(bodega or self.w).id, quantity=nivel))
        return sku

    def mov(self, sku, direccion, cantidad, cuando, bodega=None, operacion=None):
        self.n += 1
        if operacion is None:
            operacion = self._guardar(InventoryOperation(
                operation_type="ADJUSTMENT", status="DONE", source_document_type="AJUSTE",
                source_document_numero=f"DOC-{self.s}-{self.n}"))
        return self._guardar(InventoryMovement(operation_id=operacion.id, sku_id=sku.id, quantity=cantidad,
                                               direction=direccion, warehouse_id=(bodega or self.w).id,
                                               created_at=cuando, owner="NEBULAE"))


# ─── 1) Valor y reconstrucción hacia atrás ───────────────────────────────────────────────────────────────────────────

def test_valor_y_reconstruccion(app_client, db, admin_token, product):
    f = _Fabrica(db, product)
    a = f.sku(costo=1_000, nivel=10)
    f.mov(a, "IN", 4, _utc(2001, 1, 3, 12))
    f.mov(a, "OUT", 2, _utc(2001, 1, 5, 12))
    f.mov(a, "IN", 8, _utc(2001, 2, 1, 12))   # fuera de la ventana: se resta para llegar al cierre del 10 de enero
    data = _analisis(app_client, admin_token, bodega=f.w.id)
    linea = data["linea"]
    assert linea["fechas"][0] == "2001-01-01" and linea["fechas"][-1] == "2001-01-10"
    assert _serie(linea, "actual")["valores"] == [0, 0, 4000, 4000, 2000, 2000, 2000, 2000, 2000, 2000]
    assert _serie(linea, "anterior")["valores"] == [0] * 10
    assert (linea["total"], linea["total_anterior"], linea["variacion_pct"]) == (2000, 0, None)
    k = _kpis(data)
    assert (k["valor_inventario"]["valor"], k["valor_inventario"]["anterior"]) == (2000, 0)
    assert k["valor_inventario"]["variacion_pct"] is None   # 'Nuevo'
    assert (k["entradas"]["valor"], k["entradas"]["anterior"]) == (4, 0)
    assert (k["salidas"]["valor"], k["salidas"]["anterior"]) == (2, 0)
    barras = data["barras"]
    assert _en(barras["etiquetas"], _serie(barras, "entradas")["valores"], "2001-01-03") == 4
    assert _en(barras["etiquetas"], _serie(barras, "salidas")["valores"], "2001-01-05") == 2
    assert sum(_serie(barras, "entradas")["valores"]) == 4 and sum(_serie(barras, "salidas")["valores"]) == 2


def test_cierre_del_anterior_con_cubetas_semanales(app_client, db, admin_token, product):
    """42 días (cubetas por semana): la semana del lunes 2001-01-01 tiene días del período anterior (1 y 2 de enero) y del
    actual (desde el 3). El último punto del anterior y su indicador son el valor al cierre del anterior (las 00:00 del
    3 de enero), no el del cierre de esa semana. Las barras de esa semana solo cuentan lo del período actual."""
    f = _Fabrica(db, product)
    a = f.sku(costo=1_000, nivel=10)
    f.mov(a, "IN", 1, _utc(2001, 1, 2, 12))    # del anterior, en la semana que comparten
    f.mov(a, "IN", 4, _utc(2001, 1, 5, 12))    # del actual, en la misma semana
    data = _analisis(app_client, admin_token, bodega=f.w.id, desde="2001-01-03", hasta="2001-02-13")
    assert data["periodo"]["granularidad"] == "semana"
    linea = data["linea"]
    assert linea["fechas"][0] == "2001-01-01" and len(linea["fechas"]) == 7
    assert _serie(linea, "actual")["valores"] == [10_000] * 7
    # Antes de esa semana: 10000 − 5000; su último punto es el cierre del anterior (00:00 del 3): 10000 − 4000.
    assert _serie(linea, "anterior")["valores"] == [5_000] * 6 + [6_000]
    k = _kpis(data)
    assert (k["valor_inventario"]["valor"], k["valor_inventario"]["anterior"],
            k["valor_inventario"]["variacion_pct"]) == (10_000, 6_000, 66.7)
    assert (k["entradas"]["valor"], k["entradas"]["anterior"]) == (4, 1)
    assert _serie(data["barras"], "entradas")["valores"][0] == 4


def test_mes_con_tramo_entre_los_dos_periodos_y_anterior_mas_corto(db, product):
    """'mes': el anterior es el mismo tramo del mes pasado, así que entre su cierre y el inicio del actual hay días (aquí
    del 16 al 28 de febrero) cuyos movimientos también se restan. Con un anterior más corto (febrero contra marzo), sus
    últimos puntos repiten el valor de su cierre (no caen a 0)."""
    from app.core.analisis_inventario import analisis_inventario
    from app.core.periodos import resolver_periodo
    f = _Fabrica(db, product)
    a = f.sku(costo=1_000, nivel=10)
    f.mov(a, "IN", 4, _utc(2001, 2, 20, 12))   # entre el anterior (1 a 15 de febrero) y el actual (1 a 15 de marzo)
    data = analisis_inventario(db, resolver_periodo("mes", ahora_utc=datetime(2001, 3, 15, 17)), 5, bodega=f.w.id)["data"]
    k = _kpis(data)
    assert (k["valor_inventario"]["valor"], k["valor_inventario"]["anterior"]) == (10_000, 6_000)
    assert _serie(data["linea"], "anterior")["valores"] == [6_000] * 15
    assert _serie(data["linea"], "actual")["valores"] == [10_000] * 15
    assert (k["entradas"]["valor"], k["entradas"]["anterior"]) == (0, 0)   # el tramo del medio no es de ninguno

    g = _Fabrica(db, product)
    b = g.sku(costo=1_000, nivel=10)
    g.mov(b, "IN", 4, _utc(2001, 2, 10, 12))
    data = analisis_inventario(db, resolver_periodo("mes", ahora_utc=datetime(2001, 3, 31, 17)), 5, bodega=g.w.id)["data"]
    assert _serie(data["linea"], "anterior")["valores"] == [6_000] * 9 + [10_000] * 22   # 28 días + 3 que repiten
    assert _kpis(data)["valor_inventario"]["anterior"] == 10_000


# ─── 2) Traslados: cuentan solo con una bodega ───────────────────────────────────────────────────────────────────────

def test_traslados(app_client, db, admin_token, product):
    f = _Fabrica(db, product)
    w2 = f.bodega()
    a = f.sku(costo=1_000, nivel=5)
    antes = _analisis(app_client, admin_token)
    op = f._guardar(InventoryOperation(operation_type="TRANSFER", status="DONE", source_warehouse_id=w2.id,
                                       dest_warehouse_id=f.w.id))
    f.mov(a, "TRANSFER_OUT", 5, _utc(2001, 1, 4, 12), bodega=w2, operacion=op)
    f.mov(a, "TRANSFER_IN", 5, _utc(2001, 1, 4, 12), bodega=f.w, operacion=op)
    destino = _analisis(app_client, admin_token, bodega=f.w.id)
    assert (_kpis(destino)["entradas"]["valor"], _kpis(destino)["salidas"]["valor"]) == (5, 0)
    assert _serie(destino["linea"], "actual")["valores"] == [0, 0, 0] + [5_000] * 7
    origen = _analisis(app_client, admin_token, bodega=w2.id)
    assert (_kpis(origen)["entradas"]["valor"], _kpis(origen)["salidas"]["valor"]) == (0, 5)
    assert _serie(origen["linea"], "actual")["valores"] == [5_000] * 3 + [0] * 7
    # Sin bodega el traslado solo cambia de bodega: no es entrada ni salida, y el valor no se mueve.
    despues = _analisis(app_client, admin_token)
    for clave in ("entradas", "salidas", "valor_inventario"):
        assert _kpis(despues)[clave]["valor"] == _kpis(antes)[clave]["valor"], clave
    assert _serie(despues["linea"], "actual")["valores"] == _serie(antes["linea"], "actual")["valores"]


# ─── 3) Movimientos sin dirección (y QUARANTINE y los demás valores) ────────────────────────────────────────────────

def test_movimiento_sin_direccion(app_client, db, admin_token, product):
    f = _Fabrica(db, product)
    a = f.sku(costo=1_000, nivel=3)
    f.mov(a, "IN", 3, _utc(2001, 1, 2, 12))
    f.mov(a, None, 7, _utc(2001, 1, 3, 12))
    data = _analisis(app_client, admin_token, bodega=f.w.id)
    assert (_kpis(data)["entradas"]["valor"], _kpis(data)["salidas"]["valor"]) == (3, 0)
    assert _serie(data["linea"], "actual")["valores"] == [0] + [3_000] * 9
    assert data["avisos"] == ["1 movimiento sin dirección no se cuenta"]
    f.mov(a, "QUARANTINE", 2, _utc(2001, 1, 4, 12))
    f.mov(a, "SCRAP", 1, _utc(2001, 1, 5, 12))
    f.mov(a, "IN", 9, _utc(2000, 12, 20, 12))    # fuera de las dos ventanas: tampoco cuenta en el aviso
    f.mov(a, None, 9, _utc(2000, 12, 25, 12))    # en el anterior: el aviso es del período
    data = _analisis(app_client, admin_token, bodega=f.w.id)
    assert data["avisos"] == ["3 movimientos sin dirección no se cuentan"]
    assert _serie(data["linea"], "actual")["valores"] == [0] + [3_000] * 9
    assert (_kpis(data)["entradas"]["valor"], _kpis(data)["salidas"]["valor"]) == (3, 0)


# ─── 4) El día de Colombia con timestamptz ───────────────────────────────────────────────────────────────────────────

def test_borde_colombia_timestamptz(app_client, db, admin_token, product):
    f = _Fabrica(db, product)
    a = f.sku(costo=1_000, nivel=7)
    f.mov(a, "IN", 4, _utc(2001, 1, 11, 4, 30))    # 10 de enero a las 23:30 en Colombia: dentro
    f.mov(a, "IN", 2, _utc(2001, 1, 11, 5, 0))     # 11 de enero a las 00:00: fuera (después del cierre)
    f.mov(a, "IN", 1, _utc(2001, 1, 1, 4, 59))     # 31 de diciembre a las 23:59: del período anterior
    data = _analisis(app_client, admin_token, bodega=f.w.id)
    k = _kpis(data)
    assert (k["entradas"]["valor"], k["entradas"]["anterior"]) == (4, 1)
    barras = data["barras"]
    assert _en(barras["etiquetas"], _serie(barras, "entradas")["valores"], "2001-01-10") == 4
    assert _en(barras["etiquetas"], _serie(barras, "entradas")["valores"], "2001-01-01") == 0
    # Cierre del 10: 7000 − 2000 (lo del 11) = 5000; el 9 cierra antes de la entrada de las 23:30: 1000.
    actual = _serie(data["linea"], "actual")["valores"]
    assert (actual[-1], actual[-2], actual[0]) == (5_000, 1_000, 1_000)
    movimiento = next(m for m in data["movimientos"]["filas"] if m["monto"] == 4)
    assert movimiento["fecha"] == "2001-01-11T04:30:00Z"


# ─── 5) Referencias agotadas (foto de hoy) ───────────────────────────────────────────────────────────────────────────

def test_agotadas(app_client, db, admin_token, product):
    from app.core.fechas import ahora_utc
    f = _Fabrica(db, product)
    hace_5 = ahora_utc().replace(tzinfo=timezone.utc) - timedelta(days=5)
    hace_100 = ahora_utc().replace(tzinfo=timezone.utc) - timedelta(days=100)
    x = f.sku(nivel=0)
    f.mov(x, "OUT", 2, hace_5)                       # agotada con salida reciente: cuenta
    y = f.sku(nivel=0)
    f.mov(y, "OUT", 2, hace_100)                     # su salida es de hace más de 90 días: no cuenta
    z = f.sku(nivel=3)
    f.mov(z, "OUT", 2, hace_5)                       # le quedan 3 disponibles: no cuenta
    r = f.sku(nivel=5)                               # 5 físicas todas reservadas: disponible 0, 'agotado' (RP51)
    f._guardar(InventoryReservation(sku_id=r.id, warehouse_id=f.w.id, quantity_reserved=5, status="ACTIVE",
                                    expires_at=ahora_utc() + timedelta(days=2)))
    f.mov(r, "OUT", 1, hace_5)
    t = f.sku(nivel=0)
    f.mov(t, "ADJUST_OUT", 1, hace_5)                # un ajuste de salida también es una salida
    u = f.sku(nivel=0)
    f.mov(u, "TRANSFER_OUT", 1, hace_5)              # con la bodega elegida, un traslado que sale es una salida
    oculto = f.sku(nivel=0)                          # rastrear_inventario = false: fuera del Análisis
    f._guardar(ProductWebListing(sku_id=oculto.id, rastrear_inventario=False))
    f.mov(oculto, "OUT", 1, hace_5)
    f.sku(nivel=0)                                   # agotada sin salidas: no cuenta
    data = _analisis(app_client, admin_token, bodega=f.w.id, periodo="30d", desde=None, hasta=None)
    agotadas = _kpis(data)["referencias_agotadas"]
    assert agotadas["valor"] == 4
    assert (agotadas["es_foto"], agotadas["anterior"], agotadas["variacion_pct"]) == (True, None, None)
    assert (agotadas["formato"], agotadas["mejor"]) == ("entero", "baja")
    assert "90 días" in agotadas["ayuda"]


# ─── 6) Donas por categoría y por bodega; sin costo y rastrear_inventario (RP51) ────────────────────────────────────

def test_dona_por_categoria_y_bodega(app_client, db, admin_token, product, category, brand):
    f = _Fabrica(db, product)
    w2 = f.bodega()
    otra = f._guardar(Category(name=f"CatAn-{f.s}"))
    otro = f._guardar(Product(brand_id=brand.id, category_id=otra.id, name=f"ProdAn-{f.s}", type="Fisico",
                              base_currency="COP"))
    f.sku(costo=1_000, nivel=3)                           # categoría A en w: 3000
    f.sku(costo=500, nivel=4, product=otro)               # categoría B en w: 2000
    f.sku(costo=200, nivel=5, bodega=w2)                  # categoría A en w2: 1000
    f.sku(costo=None, nivel=6)                            # sin costo: vale 0 y va en el aviso
    oculto = f.sku(costo=1_000, nivel=9, product=otro)    # rastrear_inventario = false: no suma (RP51)
    f._guardar(ProductWebListing(sku_id=oculto.id, rastrear_inventario=False))
    data = _analisis(app_client, admin_token, bodega=f.w.id)
    assert [d["clave"] for d in data["donas"]] == ["categoria", "bodega"]
    assert [d["titulo"] for d in data["donas"]] == ["Valor por categoría", "Valor por bodega"]
    assert _dona(data, "categoria") == {category.name: 3_000, otra.name: 2_000}
    assert _dona(data, "bodega") == {f.w.name: 5_000}
    assert _kpis(data)["valor_inventario"]["valor"] == 5_000
    assert data["avisos"] == ["1 referencia sin costo registrado"]
    todo = _analisis(app_client, admin_token)
    por_bodega = _dona(todo, "bodega")
    assert (por_bodega[f.w.name], por_bodega[w2.name]) == (5_000, 1_000)
    por_categoria = _dona(todo, "categoria")
    assert (por_categoria[category.name], por_categoria[otra.name]) == (4_000, 2_000)


# ─── 7) Productos que más salen ──────────────────────────────────────────────────────────────────────────────────────

def test_ranking_productos_que_salen(app_client, db, admin_token, product):
    from app.core.ventas_dinero import pesos
    f = _Fabrica(db, product)
    w2 = f.bodega()
    p = f.sku(costo=1_000)
    q = f.sku(costo=None)
    r = f.sku(costo=300)
    t = f.sku(costo=100)
    f.mov(p, "OUT", 9, _utc(2001, 1, 2, 12))
    f.mov(q, "OUT", 5, _utc(2001, 1, 3, 12))
    f.mov(q, "ADJUST_OUT", 1, _utc(2001, 1, 4, 12))
    f.mov(r, "OUT", 2, _utc(2001, 1, 5, 12))
    f.mov(t, "TRANSFER_OUT", 7, _utc(2001, 1, 6, 12))
    f.mov(t, "TRANSFER_IN", 7, _utc(2001, 1, 6, 12), bodega=w2)
    f.mov(p, "IN", 50, _utc(2001, 1, 7, 12))             # una entrada no es una salida
    f.mov(r, "OUT", 40, _utc(2000, 12, 28, 12))          # del período anterior
    ranking = _analisis(app_client, admin_token, bodega=f.w.id)["ranking"]
    assert (ranking["titulo"], ranking["columna"], ranking["formato"]) == ("Productos que más salen", "Unidades",
                                                                           "unidades")
    filas = ranking["filas"]
    assert [(fila["posicion"], fila["valor"], fila["cantidad"]) for fila in filas] == [(1, 9, 1), (2, 7, 1), (3, 6, 2),
                                                                                       (4, 2, 1)]
    assert [fila["detalle"] for fila in filas] == [f"{p.sku} · {pesos(9_000)} al costo", f"{t.sku} · {pesos(700)} al costo",
                                                    f"{q.sku} · sin costo registrado", f"{r.sku} · {pesos(600)} al costo"]
    assert all(fila["nombre"] == product.name for fila in filas)
    assert [fila["pct"] for fila in filas] == [37.5, 29.2, 25.0, 8.3]   # sobre las 24 salidas
    sin_bodega = _analisis(app_client, admin_token, top="10")["ranking"]["filas"]
    mios = [fila["detalle"].split(" · ")[0] for fila in sin_bodega if fila["detalle"].endswith(
        ("al costo", "sin costo registrado"))]
    assert t.sku not in mios and [s for s in mios if s in (p.sku, q.sku, r.sku)] == [p.sku, q.sku, r.sku]
    for i in range(3):
        f.mov(f.sku(costo=10), "OUT", 1, _utc(2001, 1, 8, 12))
    assert len(_analisis(app_client, admin_token, bodega=f.w.id, top="5")["ranking"]["filas"]) == 5


# ─── 8) Consultas constantes ─────────────────────────────────────────────────────────────────────────────────────────

def test_consultas_constantes(app_client, db, admin_token, product, contador_sql):
    f = _Fabrica(db, product)
    skus = [f.sku(costo=100 * (i + 1), nivel=i) for i in range(5)]
    direcciones = ("IN", "OUT", "ADJUST_IN", "ADJUST_OUT", "TRANSFER_IN", "TRANSFER_OUT", None, "QUARANTINE")

    def crear(n, desde):
        for i in range(desde, desde + n):
            f.mov(skus[i % 5], direcciones[i % len(direcciones)], 1 + i % 4, _utc(2001, 1, 1 + i % 10, 12))

    def medir(**params):
        with contador_sql.ventana() as v:
            _analisis(app_client, admin_token, top="25", **params)
        assert v.commits == 0
        return v.consultas

    crear(3, 0)
    con_3 = (medir(bodega=f.w.id), medir())
    crear(27, 3)
    con_30 = (medir(bodega=f.w.id), medir())
    assert con_3 == con_30 and max(con_30) <= 14, (con_3, con_30)


# ─── 9) Claves exactas, movimientos, permisos y errores ─────────────────────────────────────────────────────────────

def test_claves_exactas(app_client, db, admin_token, product):
    f = _Fabrica(db, product)
    a = f.sku(costo=1_000, nivel=2)
    entrada = f.mov(a, "IN", 4, _utc(2001, 1, 2, 12))
    f.mov(a, "OUT", 1, _utc(2001, 1, 3, 12))
    f.sku(costo=None, nivel=1)
    data = _analisis(app_client, admin_token, bodega=f.w.id)
    assert set(data) == CLAVES_ANALISIS
    assert [k["clave"] for k in data["kpis"]] == KPIS
    assert all(set(k) == CLAVES_KPI for k in data["kpis"])
    k = _kpis(data)
    assert [(k[c]["formato"], k[c]["mejor"], k[c]["es_foto"]) for c in KPIS] == [
        ("pesos", "sube", False), ("unidades", "sube", False), ("unidades", "neutro", False), ("entero", "baja", True)]
    assert [k[c]["etiqueta"] for c in KPIS] == ["Valor del inventario", "Entradas", "Salidas", "Referencias agotadas"]
    assert all(k[c]["ayuda"] for c in KPIS)
    assert "costo de hoy" in k["valor_inventario"]["ayuda"]
    linea = data["linea"]
    assert set(linea) == CLAVES_LINEA and all(set(s) == CLAVES_SERIE for s in linea["series"])
    assert (linea["titulo"], linea["formato"]) == ("Valor del inventario", "pesos")
    for dona in data["donas"]:
        assert set(dona) == CLAVES_DONA and dona["formato"] == "pesos" and dona["segmentos"]
        assert all(set(s) == CLAVES_SEGMENTO for s in dona["segmentos"])
    barras = data["barras"]
    assert set(barras) == CLAVES_BARRAS and all(set(s) == CLAVES_SERIE_BARRAS for s in barras["series"])
    assert (barras["titulo"], barras["formato"], barras["eje"], barras["apiladas"]) == (
        "Entradas y salidas", "unidades", "fechas", False)
    assert [(s["clave"], s["etiqueta"], s["tono"]) for s in barras["series"]] == [
        ("entradas", "Entradas", "positivo"), ("salidas", "Salidas", "negativo")]   # D44: la salida va hacia abajo
    assert all(v >= 0 for s in barras["series"] for v in s["valores"])           # magnitudes; el tono da el signo
    movimientos = data["movimientos"]
    assert set(movimientos) == CLAVES_MOVIMIENTOS and movimientos["titulo"] == "Últimos movimientos"
    assert all(set(m) == CLAVES_MOVIMIENTO for m in movimientos["filas"])
    fila = next(m for m in movimientos["filas"] if m["doc_id"] == entrada.id)
    assert fila == {"tipo": "KARDEX", "numero": entrada.operation.source_document_numero, "titulo": "Entrada",
                    "detalle": f"{a.sku} · {product.name} · {f.w.name}", "fecha": "2001-01-02T12:00:00Z",
                    "monto": 4, "formato": "unidades", "signo": "+", "estado_etiqueta": None, "doc_tipo": "KARDEX",
                    "doc_id": entrada.id}
    assert set(data["ranking"]) == CLAVES_RANKING and data["ranking"]["filas"]
    assert all(set(r) == CLAVES_FILA_RANKING for r in data["ranking"]["filas"])
    assert data["filtros"] == {"foco": None, "top": 5, "producto": None, "bodega": f.w.id}
    assert data["periodo"]["desde"] == "2001-01-01" and data["periodo"]["hasta"] == "2001-01-10"
    assert data["generado_en"].endswith("Z")
    assert data["avisos"] == ["1 referencia sin costo registrado"]


def test_ultimos_movimientos(app_client, db, admin_token, product):
    f = _Fabrica(db, product)
    w2 = f.bodega()
    a = f.sku(costo=1_000)
    orden = [("IN", "Entrada", "+"), ("ADJUST_OUT", "Ajuste de salida", "-"), ("TRANSFER_IN", "Traslado", "+"),
             ("OUT", "Salida", "-"), ("ADJUST_IN", "Ajuste de entrada", "+"), ("TRANSFER_OUT", "Traslado", "-")]
    for i, (direccion, _, _) in enumerate(orden):
        f.mov(a, direccion, i + 1, _utc(2001, 1, 2 + i, 12))
    f.mov(a, None, 5, _utc(2001, 1, 9, 12))                 # no se lista
    f.mov(a, "QUARANTINE", 5, _utc(2001, 1, 9, 13))         # no se lista
    f.mov(a, "IN", 3, _utc(2001, 1, 9, 14), bodega=w2)      # de otra bodega: no se lista con bodega=w
    filas = _analisis(app_client, admin_token, bodega=f.w.id)["movimientos"]["filas"]
    assert [(m["titulo"], m["signo"], m["monto"]) for m in filas] == [
        (titulo, signo, i + 1) for i, (_, titulo, signo) in reversed(list(enumerate(orden)))]
    for i in range(6):
        f.mov(a, "IN", 1, _utc(2001, 1, 10, 10 + i))
    assert len(_analisis(app_client, admin_token, bodega=f.w.id)["movimientos"]["filas"]) == 8


def test_permisos(app_client, db, product, vendedor_token, compras_token, bodega_token):
    f = _Fabrica(db, product)
    for token in (vendedor_token, compras_token, bodega_token):
        _analisis(app_client, token, bodega=f.w.id)
    assert app_client.get(RUTA, params=VENTANA).status_code == 401


def test_errores_422(app_client, admin_token):
    from main import MENSAJE_DATOS_INVALIDOS
    casos = [
        ({"periodo": "xx"}, "Período no válido."),
        ({"periodo": "x\x00"}, "Período no válido."),
        ({"periodo": "personalizado"}, "Elige la fecha inicial y la final."),
        ({**VENTANA, "desde": "01/01/2001"}, "Las fechas deben tener el formato AAAA-MM-DD."),
        ({**VENTANA, "desde": "2001-01-11"}, "La fecha inicial debe ser anterior o igual a la final."),
        ({**VENTANA, "hasta": "2999-01-01"}, "La fecha final no puede ser posterior a hoy."),
        ({**VENTANA, "desde": "1998-01-01"}, "El período no puede ser mayor a 2 años."),
        ({**VENTANA, "top": "2"}, "El ranking solo puede mostrar 5, 10 o 25."),
        ({**VENTANA, "top": "5\x00"}, "El ranking solo puede mostrar 5, 10 o 25."),
        ({**VENTANA, "bodega": 10 ** 9}, "La bodega «1000000000» no existe."),
    ]
    for params, texto in casos:
        resp = app_client.get(RUTA, params=params, headers=_auth(admin_token))
        assert resp.status_code == 422, (params, resp.text)
        assert resp.json()["detail"] == texto, params
    resp = app_client.get(RUTA, params={**VENTANA, "bodega": "abc"}, headers=_auth(admin_token))
    assert resp.status_code == 400 and resp.json()["message"] == MENSAJE_DATOS_INVALIDOS
    for top in ("", " ", "10", "25"):
        assert _analisis(app_client, admin_token, top=top)["filtros"]["top"] == int(top.strip() or 5)
    for periodo in ("7d", "30d", "90d", "mes", "12m"):
        resp = app_client.get(RUTA, params={"periodo": periodo}, headers=_auth(admin_token))
        assert resp.status_code == 200, (periodo, resp.text)


def test_la_funcion_valida_el_top(db):
    import pytest
    from app.core.analisis_inventario import analisis_inventario
    from app.core.periodos import resolver_periodo
    with pytest.raises(ValueError, match="El ranking solo puede mostrar 5, 10 o 25."):
        analisis_inventario(db, resolver_periodo("30d"), 7)
