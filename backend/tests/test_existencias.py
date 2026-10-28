"""B4 T1C (R10, C11; RP50, RP80, D17): existencias calculadas en un solo lugar (app/core/existencias.py).

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_existencias). Las filas se crean dentro de la
transaccion que se revierte (warehouses, inventory_levels, inventory_reservations, inventory_quarantine,
purchase_orders_full, purchase_order_lines, product_web_listings e inventory_owner_balances estan en TABLAS). Como erp_test
ya tiene datos, el resumen se compara como «despues − antes».

Amarra existencias con _calculate_sku_availability (erp_inventario.py): fisico, reservado, disponible y cuarentena por
bodega, y las nueve claves de disponibilidad_sku. El transito NO se compara con el de hoy: _calculate_sku_availability
todavia filtra estados que el PEC no usa (CONFIRMADA, ENVIADA...) y se alinea en T13 (RP50, D17), cuando delegue en
disponibilidad_sku; aqui se compara contra la regla de R9 (las etapas activas del PEC).
"""
import uuid
from datetime import timedelta
from decimal import Decimal

from app.models.catalog import ProductSKU, ProductWebListing
from app.models.erp_documents import PurchaseOrderFull
from app.models.fase1b import InventoryOwnerBalance, InventoryReservation, PurchaseOrderLine
from app.models.fase3 import InventoryQuarantine
from app.models.inventory import InventoryLevel, Warehouse

COLUMNAS = ["sku_id", "sku", "producto", "categoria", "bodega", "fisico", "reservado", "disponible", "cuarentena",
            "en_transito", "precio", "costo", "valorizacion", "minimo", "estado_stock"]
CLAVES_DISPONIBILIDAD = {"stock_vendible_fisico", "stock_reservado", "stock_disponible", "stock_cuarentena",
                         "stock_total_bajo_custodia", "stock_fisico", "stock_en_transito", "balance_nebulae",
                         "balance_mau"}


def _guardar(db, objeto):
    db.add(objeto)
    db.commit()
    return objeto


def _escenario(db, product, warehouse):
    """2 bodegas; SKU-A (costo 10) con niveles en las dos, una reserva ACTIVE, una vencida, una liberada, una cuarentena
    ACTIVO (y otra liberada), un PEC EN_TRANSITO con una linea de 6 pedidas y 2 recibidas (y lineas en PEC que no son de
    la etapa activos) y saldos por dueno; SKU-B (costo 3, minimo 8 en su publicacion); SKU-C (sin costo, en 0) y SKU-D
    (publicacion con rastrear_inventario = false)."""
    from app.core.fechas import ahora_utc
    ahora = ahora_utc()
    s = uuid.uuid4().hex[:8].upper()
    w1 = warehouse
    w2 = _guardar(db, Warehouse(name=f"BodegaT1C-{s}", location_type="Remota"))
    a = _guardar(db, ProductSKU(product_id=product.id, sku=f"T1C-A-{s}", cost_price=10, sale_price=20))
    b = _guardar(db, ProductSKU(product_id=product.id, sku=f"T1C-B-{s}", cost_price=3, sale_price=5))
    c = _guardar(db, ProductSKU(product_id=product.id, sku=f"T1C-C-{s}", cost_price=None, sale_price=9))
    d = _guardar(db, ProductSKU(product_id=product.id, sku=f"T1C-D-{s}", cost_price=1, sale_price=2))
    for sku, bodega, cantidad in ((a, w1, 10), (a, w2, 3), (b, w1, 2), (c, w1, 0), (d, w1, 7)):
        _guardar(db, InventoryLevel(sku_id=sku.id, warehouse_id=bodega.id, quantity=cantidad))
    _guardar(db, InventoryReservation(sku_id=a.id, warehouse_id=w1.id, quantity_reserved=4, status="ACTIVE",
                                      expires_at=ahora + timedelta(days=3)))
    _guardar(db, InventoryReservation(sku_id=a.id, warehouse_id=w1.id, quantity_reserved=3, status="ACTIVE",
                                      expires_at=ahora - timedelta(days=3)))           # vencida: no cuenta
    _guardar(db, InventoryReservation(sku_id=a.id, warehouse_id=w1.id, quantity_reserved=1, status="RELEASED"))
    _guardar(db, InventoryQuarantine(sku_id=a.id, warehouse_id=w2.id, quantity=1, reason="Dañado", status="ACTIVO"))
    _guardar(db, InventoryQuarantine(sku_id=a.id, warehouse_id=w2.id, quantity=2, reason="Revisado",
                                     status="LIBERADO"))                                # no cuenta
    for i, (estado, pedidas, recibidas) in enumerate((("EN_TRANSITO", 6, 2), ("CANCELADO", 5, 0), ("RECIBIDA", 3, 1),
                                                       ("BORRADOR", 2, 0))):
        pec = _guardar(db, PurchaseOrderFull(numero=f"PEC-EX{s}{i}", supplier_name="T1C", warehouse_id=w1.id,
                                             estado=estado))
        _guardar(db, PurchaseOrderLine(pec_id=pec.id, sku_id=a.id, quantity_ordered=pedidas,
                                       quantity_received=recibidas))
    _guardar(db, ProductWebListing(sku_id=b.id, alerta_stock_minimo=8))
    _guardar(db, ProductWebListing(sku_id=d.id, rastrear_inventario=False))
    _guardar(db, InventoryOwnerBalance(sku_id=a.id, warehouse_id=w1.id, owner="NEBULAE", quantity=6))
    _guardar(db, InventoryOwnerBalance(sku_id=a.id, warehouse_id=w1.id, owner="MAU", quantity=4))
    return {"w1": w1, "w2": w2, "a": a, "b": b, "c": c, "d": d}


def _filas(db, select_):
    return [dict(r._mapping) for r in db.execute(select_).all()]


# ─── Reglas puras ────────────────────────────────────────────────────────────────────────────────────────────────────

def test_estado_stock_y_constantes():
    from app.core.existencias import ESTADOS_STOCK, MINIMO_POR_DEFECTO, estado_stock
    assert MINIMO_POR_DEFECTO == 5
    assert ESTADOS_STOCK == ("agotado", "bajo_minimo", "abastecido")
    casos = [(0, 5, "agotado"), (Decimal("0.00"), 5, "agotado"), (None, 5, "agotado"), (3, 5, "bajo_minimo"),
             (5, 5, "bajo_minimo"), (Decimal("5.01"), 5, "abastecido"), (6, 5, "abastecido"),
             (2, None, "bajo_minimo"), (6, None, "abastecido"), (1, 0, "abastecido"), (8, 8, "bajo_minimo")]
    for disponible, minimo, esperado in casos:
        assert estado_stock(disponible, minimo) == esperado, (disponible, minimo)


# ─── consulta_existencias ────────────────────────────────────────────────────────────────────────────────────────────

def test_cada_fila_por_bodega_es_la_de_calculate_sku_availability(db, product, warehouse):
    from app.api.v1.erp_inventario import _calculate_sku_availability
    from app.core.existencias import consulta_existencias
    e = _escenario(db, product, warehouse)
    mios = {e[k].id: k for k in ("a", "b", "c", "d")}
    filas = [f for f in _filas(db, consulta_existencias(db, por="bodega")) if f["sku_id"] in mios]
    assert list(filas[0])[:len(COLUMNAS)] == COLUMNAS
    pares = {(mios[f["sku_id"]], f["bodega"]): f for f in filas}
    w1, w2 = e["w1"].name, e["w2"].name
    assert set(pares) == {("a", w1), ("a", w2), ("b", w1), ("c", w1), ("d", w1)}
    for f in filas:
        hoy = _calculate_sku_availability(db, f["sku_id"], f["warehouse_id"])
        assert f["fisico"] == hoy["stock_vendible_fisico"], f
        assert f["reservado"] == hoy["stock_reservado"], f
        assert f["disponible"] == hoy["stock_disponible"], f
        assert f["cuarentena"] == hoy["stock_cuarentena"], f
    a1, a2, b1, c1 = pares[("a", w1)], pares[("a", w2)], pares[("b", w1)], pares[("c", w1)]
    assert (a1["fisico"], a1["reservado"], a1["disponible"], a1["cuarentena"]) == (10, 4, 6, 0)
    assert (a2["fisico"], a2["reservado"], a2["disponible"], a2["cuarentena"]) == (3, 0, 3, 1)
    # RP50: con por=bodega, cada fila trae el transito del SKU (el mismo numero en cada bodega).
    assert a1["en_transito"] == 4 and a2["en_transito"] == 4 and b1["en_transito"] == 0
    # Minimo: 5 sin publicacion; el de la publicacion si existe. Estado de stock por bodega.
    assert (a1["minimo"], a2["minimo"], b1["minimo"]) == (5, 5, 8)
    assert (a1["estado_stock"], a2["estado_stock"], b1["estado_stock"], c1["estado_stock"]) == \
        ("abastecido", "bajo_minimo", "bajo_minimo", "agotado")
    # Valorizacion = fisico × costo; sin costo, None ('—' en la pantalla).
    assert (a1["valorizacion"], a2["valorizacion"], b1["valorizacion"], c1["valorizacion"]) == (100, 30, 6, None)
    assert (a1["precio"], a1["costo"], c1["costo"]) == (20, 10, None)
    assert a1["producto"] == product.name and a1["sku"] == e["a"].sku and a1["categoria"]


def test_por_sku_suma_las_bodegas_y_cuenta_el_transito_una_vez(db, product, warehouse):
    from app.core.existencias import consulta_existencias
    e = _escenario(db, product, warehouse)
    mios = {e[k].id: k for k in ("a", "b", "c", "d")}
    filas = {mios[f["sku_id"]]: f for f in _filas(db, consulta_existencias(db)) if f["sku_id"] in mios}
    assert set(filas) == {"a", "b", "c", "d"}   # una fila por SKU
    a, b, c = filas["a"], filas["b"], filas["c"]
    assert a["bodega"] is None
    assert (a["fisico"], a["reservado"], a["disponible"], a["cuarentena"], a["en_transito"]) == (13, 4, 9, 1, 4)
    assert (a["valorizacion"], a["minimo"], a["estado_stock"]) == (130, 5, "abastecido")
    assert (b["fisico"], b["disponible"], b["minimo"], b["estado_stock"], b["valorizacion"]) == \
        (2, 2, 8, "bajo_minimo", 6)
    assert (c["fisico"], c["disponible"], c["estado_stock"], c["valorizacion"]) == (0, 0, "agotado", None)


def test_filtros_de_consulta_existencias(db, product, warehouse):
    from app.core.existencias import consulta_existencias
    e = _escenario(db, product, warehouse)
    mios = {e[k].id for k in ("a", "b", "c", "d")}
    en_w2 = [f for f in _filas(db, consulta_existencias(db, por="bodega", warehouse_id=e["w2"].id))]
    assert {f["sku_id"] for f in en_w2} & mios == {e["a"].id}
    assert all(f["bodega"] == e["w2"].name for f in en_w2)
    a_en_w2 = [f for f in _filas(db, consulta_existencias(db, warehouse_id=e["w2"].id)) if f["sku_id"] == e["a"].id]
    assert [(f["fisico"], f["disponible"], f["cuarentena"], f["en_transito"]) for f in a_en_w2] == [(3, 3, 1, 4)]
    por_categoria = {f["sku_id"] for f in _filas(db, consulta_existencias(db, categoria_id=product.category_id))}
    assert mios <= por_categoria
    assert {f["sku_id"] for f in _filas(db, consulta_existencias(db, q=e["b"].sku.lower()))} == {e["b"].id}
    assert mios <= {f["sku_id"] for f in _filas(db, consulta_existencias(db, q=product.name))}
    assert {f["sku_id"] for f in _filas(db, consulta_existencias(db, q="   "))} >= mios   # q en blanco no filtra


# ─── resumen_existencias ─────────────────────────────────────────────────────────────────────────────────────────────

def test_resumen_existencias_con_diferencias_antes_y_despues(db, product, warehouse):
    from app.core.existencias import resumen_existencias
    antes = resumen_existencias(db)
    claves = {"skus_total", "unidades_fisicas", "unidades_reservadas", "unidades_disponibles", "unidades_en_transito",
              "valor_inventario_cop", "skus_sin_costo", "skus_agotados", "skus_bajo_minimo", "skus_abastecidos",
              "disponibilidad_pct"}
    assert set(antes) == claves
    _escenario(db, product, warehouse)
    despues = resumen_existencias(db)
    delta = {k: despues[k] - antes[k] for k in claves - {"disponibilidad_pct"}}
    # SKU-D (rastrear_inventario = false) no suma; el transito de SKU-A cuenta una sola vez (4, no 8).
    assert delta == {"skus_total": 3, "unidades_fisicas": 15, "unidades_reservadas": 4, "unidades_disponibles": 11,
                     "unidades_en_transito": 4, "valor_inventario_cop": 136, "skus_sin_costo": 1, "skus_agotados": 1,
                     "skus_bajo_minimo": 1, "skus_abastecidos": 1}
    assert isinstance(despues["valor_inventario_cop"], int)
    assert all(isinstance(despues[k], Decimal) for k in ("unidades_fisicas", "unidades_reservadas",
                                                          "unidades_disponibles", "unidades_en_transito"))
    fisicas, disponibles = float(despues["unidades_fisicas"]), float(despues["unidades_disponibles"])
    assert despues["disponibilidad_pct"] == (round(disponibles / fisicas * 100, 1) if fisicas else None)


def test_resumen_existencias_por_bodega(db, product, warehouse):
    from app.core.existencias import resumen_existencias
    e = _escenario(db, product, warehouse)
    r = resumen_existencias(db, warehouse_id=e["w2"].id)   # bodega nueva: solo SKU-A con 3 fisicas
    assert (r["unidades_fisicas"], r["unidades_reservadas"], r["unidades_disponibles"]) == (3, 0, 3)
    assert r["valor_inventario_cop"] == 30 and r["disponibilidad_pct"] == 100.0


# ─── disponibilidad_sku (RP80, D17) ──────────────────────────────────────────────────────────────────────────────────

def test_disponibilidad_sku_trae_las_nueve_claves_de_calculate_sku_availability(db, product, warehouse):
    from app.api.v1.erp_inventario import _calculate_sku_availability
    from app.core.existencias import disponibilidad_sku
    e = _escenario(db, product, warehouse)
    casos = [(e["a"], e["w1"]), (e["a"], e["w2"]), (e["b"], e["w1"]), (e["b"], e["w2"]), (e["c"], e["w1"])]
    for sku, bodega in casos:
        nuevo = disponibilidad_sku(db, sku.id, bodega.id)
        hoy = _calculate_sku_availability(db, sku.id, bodega.id)
        assert set(nuevo) == set(hoy) == CLAVES_DISPONIBILIDAD
        assert all(isinstance(v, Decimal) for v in nuevo.values()), nuevo
        for clave in CLAVES_DISPONIBILIDAD - {"stock_en_transito"}:
            assert nuevo[clave] == hoy[clave], (sku.sku, bodega.name, clave, nuevo[clave], hoy[clave])
    a1 = disponibilidad_sku(db, e["a"].id, e["w1"].id)
    assert (a1["stock_vendible_fisico"], a1["stock_reservado"], a1["stock_disponible"]) == (10, 4, 6)
    assert (a1["balance_nebulae"], a1["balance_mau"]) == (6, 4)
    assert disponibilidad_sku(db, e["a"].id, e["w2"].id)["stock_total_bajo_custodia"] == 4
    # Transito con la regla de R9 (etapas activas: el PEC EN_TRANSITO, no el cancelado, el recibido ni el borrador).
    # _calculate_sku_availability todavia da 0 aqui (sus estados no son los del PEC); se alinea en T13 (RP50).
    assert a1["stock_en_transito"] == 4
    assert disponibilidad_sku(db, e["a"].id, e["w2"].id)["stock_en_transito"] == 4
    assert disponibilidad_sku(db, e["b"].id, e["w1"].id)["stock_en_transito"] == 0
