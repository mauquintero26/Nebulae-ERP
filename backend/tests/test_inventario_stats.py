"""B4 T13 (KPI-inventario BACKEND puntos 1 y 2; R10, R21; C10, C11; RP50, RP80): GET /api/v1/inventory/stats sobre
core/existencias.resumen_existencias (+ bodegas) y _calculate_sku_availability delegando en disponibilidad_sku.

- /inventory/stats (ALL_ERP_ROLES): skus_total, unidades_fisicas, unidades_reservadas, unidades_disponibles,
  unidades_en_transito (una vez por SKU), valor_inventario_cop (físico × costo, en pesos enteros), skus_sin_costo,
  skus_agotados, skus_bajo_minimo, skus_abastecidos (con el mínimo de cada referencia, 5 si no tiene),
  disponibilidad_pct y bodegas. Sin las referencias con rastrear_inventario = false. Su opción «un solo mínimo»
  (PATCH /inventory/config) NO se hace.
- El tránsito de _calculate_sku_availability (y por eso /disponibilidad y /stock-summary) es el de R9: las líneas de los
  PEC en la etapa activos (emitido, en tránsito y en bodega), ya no CONFIRMADA, ENVIADA ni PARCIALMENTE_ENVIADA.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_inventario_stats). erp_test ya tiene datos:
se afirman diferencias antes/después y los SKU llevan un sufijo uuid.
"""
import uuid
from datetime import timedelta
from decimal import Decimal

from app.models.catalog import ProductSKU, ProductWebListing
from app.models.erp_documents import PurchaseOrderFull
from app.models.fase1b import InventoryReservation, PurchaseOrderLine
from app.models.inventory import InventoryLevel, Warehouse
from tests.usuarios_de_prueba import bodega_token, compras_token  # noqa: F401 (fixtures por nombre, RP79)

RUTA = "/api/v1/inventory/stats"
CLAVES = {"skus_total", "unidades_fisicas", "unidades_reservadas", "unidades_disponibles", "unidades_en_transito",
          "valor_inventario_cop", "skus_sin_costo", "skus_agotados", "skus_bajo_minimo", "skus_abastecidos",
          "disponibilidad_pct", "bodegas"}
CLAVES_DISPONIBILIDAD = {"stock_vendible_fisico", "stock_reservado", "stock_disponible", "stock_cuarentena",
                         "stock_total_bajo_custodia", "stock_fisico", "stock_en_transito", "balance_nebulae",
                         "balance_mau"}


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _stats(app_client, token):
    resp = app_client.get(RUTA, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert set(cuerpo) == {"status", "data"} and cuerpo["status"] == "success"
    return cuerpo["data"]


def _delta(antes, despues):
    return {k: despues[k] - antes[k] for k in CLAVES - {"disponibilidad_pct"}}


def _guardar(db, objeto):
    db.add(objeto)
    db.commit()
    return objeto


def _sku(db, product, letra, costo=1_000, s=None):
    s = s or uuid.uuid4().hex[:8].upper()
    return _guardar(db, ProductSKU(product_id=product.id, sku=f"T13S{letra}-{s}", cost_price=costo, sale_price=2_000))


def _nivel(db, sku, bodega, cantidad):
    return _guardar(db, InventoryLevel(sku_id=sku.id, warehouse_id=bodega.id, quantity=cantidad))


def _transito(db, sku, bodega):
    """Un PEC EN_TRANSITO con una línea de 6 pedidas y 2 recibidas (tránsito 4), un PEC CANCELADO y un BORRADOR con
    otra línea cada uno (no cuentan: no son de la etapa activos de R9)."""
    s = uuid.uuid4().hex[:6].upper()
    for i, (estado, pedidas, recibidas) in enumerate((("EN_TRANSITO", 6, 2), ("CANCELADO", 9, 0),
                                                      ("BORRADOR", 3, 0))):
        pec = _guardar(db, PurchaseOrderFull(numero=f"PEC-T13S{s}{i}", supplier_name="T13", warehouse_id=bodega.id,
                                             estado=estado))
        _guardar(db, PurchaseOrderLine(pec_id=pec.id, sku_id=sku.id, quantity_ordered=pedidas,
                                       quantity_received=recibidas))


# ─── 1) Físico, reservado, disponible y valor ────────────────────────────────────────────────────────────────────────

def test_stats_fisico_reservado_disponible(app_client, db, admin_token, product, warehouse):
    from app.core.fechas import ahora_utc
    antes = _stats(app_client, admin_token)
    assert set(antes) == CLAVES
    a = _sku(db, product, "A", costo=1_000)
    _nivel(db, a, warehouse, 10)
    _guardar(db, InventoryReservation(sku_id=a.id, warehouse_id=warehouse.id, quantity_reserved=4, status="ACTIVE",
                                      expires_at=ahora_utc() + timedelta(days=2)))
    _guardar(db, InventoryReservation(sku_id=a.id, warehouse_id=warehouse.id, quantity_reserved=3, status="ACTIVE",
                                      expires_at=ahora_utc() - timedelta(days=2)))   # vencida: no cuenta
    despues = _stats(app_client, admin_token)
    assert _delta(antes, despues) == {
        "skus_total": 1, "unidades_fisicas": 10, "unidades_reservadas": 4, "unidades_disponibles": 6,
        "unidades_en_transito": 0, "valor_inventario_cop": 10_000, "skus_sin_costo": 0, "skus_agotados": 0,
        "skus_bajo_minimo": 0, "skus_abastecidos": 1, "bodegas": 0}
    assert isinstance(despues["valor_inventario_cop"], int)
    fisicas, disponibles = despues["unidades_fisicas"], despues["unidades_disponibles"]
    assert despues["disponibilidad_pct"] == (round(disponibles / fisicas * 100, 1) if fisicas else None)


# ─── 2) Mínimo por referencia ────────────────────────────────────────────────────────────────────────────────────────

def test_stats_minimo_por_referencia(app_client, db, admin_token, product, warehouse):
    antes = _stats(app_client, admin_token)
    s = uuid.uuid4().hex[:8].upper()
    a, b, c = (_sku(db, product, letra, s=s) for letra in "ABC")
    for sku, cantidad in ((a, 6), (b, 3), (c, 0)):
        _nivel(db, sku, warehouse, cantidad)
    d = _sku(db, product, "D", s=s)      # 6 disponibles con mínimo 8 en su publicación: bajo el mínimo
    _nivel(db, d, warehouse, 6)
    _guardar(db, ProductWebListing(sku_id=d.id, alerta_stock_minimo=8))
    delta = _delta(antes, _stats(app_client, admin_token))
    assert (delta["skus_abastecidos"], delta["skus_bajo_minimo"], delta["skus_agotados"]) == (1, 2, 1)
    assert delta["skus_total"] == 4


# ─── 3) Tránsito con las etapas del PEC (R9) ────────────────────────────────────────────────────────────────────────

def test_stats_transito_con_grupos_pec(app_client, db, admin_token, product, warehouse):
    antes = _stats(app_client, admin_token)
    a = _sku(db, product, "T")
    _transito(db, a, warehouse)
    delta = _delta(antes, _stats(app_client, admin_token))
    assert delta["unidades_en_transito"] == 4
    assert delta["skus_total"] == 1 and delta["unidades_fisicas"] == 0


# ─── 4) /disponibilidad usa los mismos estados (hoy daba 0) ─────────────────────────────────────────────────────────

def test_disponibilidad_usa_los_mismos_estados(app_client, db, admin_token, product, warehouse):
    """P7 (antes y después): con un PEC EN_TRANSITO de 6 pedidas y 2 recibidas, /disponibilidad daba stock_en_transito 0
    (filtraba CONFIRMADA, ENVIADA, PARCIALMENTE_ENVIADA y PARCIALMENTE_RECIBIDA); ahora da 4, el mismo número que
    /inventory/stats, en cada bodega (el tránsito no tiene bodega, RP50). Las nueve claves siguen, en Decimal (RP80)."""
    from app.api.v1.erp_inventario import _calculate_sku_availability
    w2 = _guardar(db, Warehouse(name=f"BodegaT13S-{uuid.uuid4().hex[:6]}", location_type="Remota"))
    a = _sku(db, product, "D")
    _nivel(db, a, warehouse, 5)
    _transito(db, a, warehouse)
    resp = app_client.get(f"/api/v1/inventory/disponibilidad/{a.id}", params={"warehouse_id": warehouse.id},
                          headers=_auth(admin_token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    # La ruta declara response_model=dict: sus Decimal salen como texto ('4.00'), igual que hoy.
    assert float(data["stock_en_transito"]) == 4
    assert set(data) == CLAVES_DISPONIBILIDAD | {"sku_id", "sku", "product_name", "warehouse_id", "warehouse_name"}
    assert (float(data["stock_vendible_fisico"]), float(data["stock_disponible"])) == (5, 5)
    todas = app_client.get(f"/api/v1/inventory/disponibilidad/{a.id}", headers=_auth(admin_token)).json()["data"]
    mias = {f["warehouse_id"]: f for f in todas if f["warehouse_id"] in (warehouse.id, w2.id)}
    assert (float(mias[warehouse.id]["stock_en_transito"]), float(mias[w2.id]["stock_en_transito"])) == (4, 4)
    directo = _calculate_sku_availability(db, a.id, warehouse.id)
    assert set(directo) == CLAVES_DISPONIBILIDAD and all(isinstance(v, Decimal) for v in directo.values())
    assert directo["stock_en_transito"] == Decimal("4")
    # /stock-summary no se reescribe: su tránsito mejora a través de _calculate_sku_availability.
    resumen = app_client.get("/api/v1/inventory/stock-summary", params={"sku_id": a.id, "warehouse_id": warehouse.id},
                             headers=_auth(admin_token)).json()["data"]
    assert [float(f["stock_en_transito"]) for f in resumen["items"]] == [4]


# ─── 5) Sin costo, rastrear_inventario, bodegas, roles y la regla de core ───────────────────────────────────────────

def test_stats_sin_costo_y_roles(app_client, db, admin_token, vendedor_token, compras_token, bodega_token, product,
                                 warehouse):
    from app.core.existencias import resumen_existencias
    antes = _stats(app_client, admin_token)
    s = uuid.uuid4().hex[:8].upper()
    sin_costo = _sku(db, product, "N", costo=None, s=s)
    _nivel(db, sin_costo, warehouse, 7)
    oculto = _sku(db, product, "R", costo=500, s=s)    # rastrear_inventario = false: no suma a los totales
    _nivel(db, oculto, warehouse, 9)
    _guardar(db, ProductWebListing(sku_id=oculto.id, rastrear_inventario=False))
    _guardar(db, Warehouse(name=f"BodegaT13S-{s}", location_type="Central"))
    despues = _stats(app_client, vendedor_token)
    delta = _delta(antes, despues)
    assert (delta["skus_sin_costo"], delta["skus_total"], delta["unidades_fisicas"], delta["valor_inventario_cop"],
            delta["bodegas"]) == (1, 1, 7, 0, 1)
    for token in (compras_token, bodega_token):
        assert _stats(app_client, token) == despues
    assert app_client.get(RUTA).status_code == 401
    # Es resumen_existencias (la regla de core) más bodegas, sin otra cuenta.
    directo = resumen_existencias(db)
    assert {k: v for k, v in despues.items() if k != "bodegas"} == {
        k: (float(v) if isinstance(v, Decimal) else v) for k, v in directo.items()}
    assert despues["bodegas"] == db.query(Warehouse).count()


def test_stats_consultas(app_client, db, admin_token, product, warehouse, contador_sql):
    """Consultas agregadas, sin una por referencia: con 1 y con 11 referencias, las mismas (y pocas)."""
    def medir():
        with contador_sql.ventana() as v:
            _stats(app_client, admin_token)
        assert v.commits == 0
        return v.consultas

    s = uuid.uuid4().hex[:8].upper()
    _nivel(db, _sku(db, product, "Q0", s=s), warehouse, 1)
    con_1 = medir()
    for i in range(10):
        _nivel(db, _sku(db, product, f"Q{i + 1}", s=s), warehouse, i)
    assert con_1 == medir() <= 3, con_1
