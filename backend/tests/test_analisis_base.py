"""Bloque 4, T1A: el contrato único de las pestañas Análisis (core/analisis.py, ANALISIS-api pruebas 7 a 13).

Periodo y resolver_periodo viven en core/periodos.py y analisis los importa (C12). expr_local pasa una columna al día de
Colombia con ZONA_COLOMBIA de core/fechas.py (RP1/D1: sin un desfase propio). No hay iso_utc: el ISO con Z es
fechas.iso_z (RP29), así que la prueba 13 se reescribe sobre iso_z. kpi conserva formato='entero' (RP27) y trae valor,
anterior, mejor y es_foto, que el frontend lee.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_analisis_base
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import Date, DateTime, cast, literal, select
from sqlalchemy.dialects import postgresql

AHORA = datetime(2026, 10, 3, 15, 0)


def _sql(stmt):
    return str(stmt.compile(dialect=postgresql.dialect()))


def _sql_literal(expr):
    """El SQL de una expresión con los valores escritos (para ver la zona, no el nombre del parámetro)."""
    return str(expr.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))


def _lanza_valor(fn, *args, **kwargs):
    try:
        fn(*args, **kwargs)
    except ValueError as e:
        return str(e)
    raise AssertionError(f"{fn.__name__}{args} no lanzó ValueError")


def _periodo(desde, hasta):
    from app.core.periodos import resolver_periodo
    return resolver_periodo("personalizado", desde, hasta, ahora_utc=AHORA)


# ─── lo que analisis toma de periodos y de fechas (C12, RP29, D1) ────────────────────────────────────────────

def test_periodo_vive_en_periodos():
    from app.core import analisis, periodos
    assert analisis.Periodo is periodos.Periodo
    assert analisis.resolver_periodo is periodos.resolver_periodo
    assert analisis.PERIODOS == periodos.PERIODOS and analisis.MAX_DIAS == 731
    assert not hasattr(analisis, "iso_utc")  # RP29: se usa fechas.iso_z
    assert analisis.TOPS == (5, 10, 25)


# ─── 7) validar_top ──────────────────────────────────────────────────────────────────────────────────────────

def test_validar_top():
    from app.core.analisis import validar_top
    for top in (5, 10, 25):
        assert validar_top(top) == top
    for malo in (7, 0, None, "x", True):
        assert _lanza_valor(validar_top, malo) == "El ranking solo puede mostrar 5, 10 o 25.", malo


# ─── 8) variacion_pct ────────────────────────────────────────────────────────────────────────────────────────

def test_variacion():
    from app.core.analisis import variacion_pct
    assert variacion_pct(120, 100) == 20.0
    assert variacion_pct(80, 100) == -20.0
    assert variacion_pct(5, 0) is None          # «Nuevo»
    assert variacion_pct(0, 0) == 0.0           # «Sin cambio»
    assert variacion_pct(50, -100) == 150.0
    assert variacion_pct(10, None) is None
    assert variacion_pct(Decimal("112.5"), Decimal("100")) == 12.5
    assert variacion_pct(1, 3) == -66.7


# ─── kpi y dinero ────────────────────────────────────────────────────────────────────────────────────────────

def test_kpi_trae_lo_que_lee_el_frontend():
    from app.core.analisis import CLAVES_KPI, kpi
    k = kpi("pedidos", "Pedidos", 12, 10)
    assert set(k) == CLAVES_KPI
    assert k == {"clave": "pedidos", "etiqueta": "Pedidos", "valor": 12, "anterior": 10, "variacion_pct": 20.0,
                 "formato": "entero", "mejor": "sube", "es_foto": False, "ayuda": None}
    # Los montos van en pesos enteros.
    k = kpi("vendido", "Vendido", Decimal("1500000.49"), Decimal("1000000.50"), formato="pesos")
    assert (k["valor"], k["anterior"], k["variacion_pct"]) == (1500000, 1000001, 50.0)
    # Una foto (el saldo por cobrar de hoy) no lleva anterior ni %.
    k = kpi("saldo", "Saldo por cobrar", 900, 500, formato="pesos", mejor="baja", es_foto=True, ayuda="Hoy")
    assert (k["anterior"], k["variacion_pct"], k["es_foto"], k["mejor"], k["ayuda"]) == (None, None, True, "baja", "Hoy")
    # Sin dato no se inventa un número.
    k = kpi("ticket", "Ticket promedio", None, None, formato="pesos")
    assert (k["valor"], k["anterior"], k["variacion_pct"]) == (None, None, None)
    assert _lanza_valor(kpi, "x", "X", 1, formato="numero_raro").startswith("Formato de indicador no válido")
    assert _lanza_valor(kpi, "x", "X", 1, mejor="bien").startswith("«mejor» no válido")


def test_dinero():
    from app.core.analisis import dinero
    assert dinero(Decimal("1234.5")) == 1235 and isinstance(dinero(Decimal("1234.5")), int)
    assert dinero(None) == 0
    assert dinero(2786923.08) == 2786923


# ─── 9) cubetas: claves_cubetas y rellenar ───────────────────────────────────────────────────────────────────

def test_rellenar_por_dia():
    from app.core.analisis import claves_cubetas, rellenar
    p = _periodo("2001-01-06", "2001-01-10")
    assert claves_cubetas(p) == [date(2001, 1, d) for d in range(6, 11)]
    assert claves_cubetas(p, anterior=True) == [date(2001, 1, d) for d in range(1, 6)]
    assert rellenar({date(2001, 1, 7): 5, date(2001, 1, 10): Decimal("2.5")}, p) == [0.0, 5.0, 0.0, 0.0, 2.5]
    anterior = rellenar({date(2001, 1, 1): 3}, p, anterior=True)
    assert anterior == [3.0, 0.0, 0.0, 0.0, 0.0]
    assert rellenar({}, p) == [0.0] * 5


def test_rellenar_por_semana_con_claves_en_lunes():
    from app.core.analisis import claves_cubetas, rellenar
    p = _periodo("2001-01-03", "2001-03-03")  # 60 días, del miércoles 3 de enero: semana
    assert p.granularidad == "semana"
    claves = claves_cubetas(p)
    assert claves[0] == date(2001, 1, 1)  # el lunes de la semana del 3
    assert all(c.weekday() == 0 for c in claves)
    assert claves[-1] <= p.hasta < claves[-1] + timedelta(days=7)
    serie = rellenar({date(2001, 1, 8): 4}, p)
    assert len(serie) == len(claves) and serie[1] == 4.0 and sum(serie) == 4.0
    anterior = rellenar({}, p, anterior=True)
    assert len(anterior) == len(serie)  # la serie anterior se alinea por posición
    assert all(c.weekday() == 0 for c in claves_cubetas(p, anterior=True))


def test_rellenar_por_mes_con_claves_en_dia_1():
    from app.core.analisis import claves_cubetas, rellenar
    p = _periodo("2001-01-15", "2001-06-30")  # 167 días: mes
    assert p.granularidad == "mes"
    assert claves_cubetas(p) == [date(2001, m, 1) for m in range(1, 7)]
    assert rellenar({date(2001, 3, 1): 7, datetime(2001, 6, 1): 1}, p) == [0.0, 0.0, 7.0, 0.0, 0.0, 1.0]
    assert len(rellenar({}, p, anterior=True)) == 6


def test_rellenar_anterior_mas_corto_queda_del_mismo_largo():
    """'mes' del 31 de marzo: el anterior (febrero) tiene 28 días; sus cubetas que faltan quedan en 0."""
    from app.core.analisis import claves_cubetas, rellenar
    from app.core.periodos import resolver_periodo
    p = resolver_periodo("mes", ahora_utc=datetime(2026, 3, 31, 20, 0))
    assert len(claves_cubetas(p)) == 31 and len(claves_cubetas(p, anterior=True)) == 28
    anterior = rellenar({date(2026, 2, 28): 9}, p, anterior=True)
    assert len(anterior) == 31
    assert anterior[27] == 9.0 and anterior[28:] == [0.0, 0.0, 0.0]


# ─── 10) segmentos ───────────────────────────────────────────────────────────────────────────────────────────

def test_segmentos_con_otros():
    from app.core.analisis import CLAVES_SEGMENTO, segmentos
    # 8 segmentos con valor (y uno en cero): quedan los 6 mayores y «Otros» con la suma de los 2 que sobran.
    filas = [(f"c{i}", f"Cat {i}", v) for i, v in enumerate([10, 50, 0, 30, 20, 40, 15, 25])]
    filas.append(("rojo", "Rojo", 60, "#e11d48"))
    seg = segmentos(filas)
    assert len(seg) == 7
    assert [s["clave"] for s in seg[:6]] == ["rojo", "c1", "c5", "c3", "c7", "c4"]
    assert seg[0]["color"] == "#e11d48" and seg[1]["color"] is None
    otros = seg[6]
    assert (otros["clave"], otros["etiqueta"], otros["valor"], otros["color"]) == ("_otros", "Otros", 25, None)
    assert seg[0]["pct"] == 24.0  # 60 de 250
    assert otros["pct"] == 10.0
    assert all(set(s) == CLAVES_SEGMENTO for s in seg)
    assert "c2" not in [s["clave"] for s in seg]  # los ceros se quitan
    assert segmentos([]) == []
    assert segmentos([("a", "A", 0)]) == []
    # Con 6 o menos no hay «Otros».
    assert [s["clave"] for s in segmentos([("a", "A", 1), ("b", "B", 3)])] == ["b", "a"]
    assert segmentos([("a", "A", 1), ("b", "B", 3)])[0]["pct"] == 75.0


# ─── 11) respuesta: claves exactas ───────────────────────────────────────────────────────────────────────────

def _bloques():
    from app.core.analisis import kpi, segmentos
    return dict(
        kpis=[kpi("vendido", "Vendido", 100, 80, formato="pesos")],
        linea={"titulo": "Ventas en el tiempo", "formato": "pesos", "fechas": ["2001-01-06"],
               "series": [{"clave": "actual", "etiqueta": "Actual", "valores": [100.0], "es_anterior": False}],
               "total": 100, "total_anterior": 80, "variacion_pct": 25.0},
        donas=[{"clave": "estado", "titulo": "Pedidos por estado", "formato": "entero", "total": 3,
                "segmentos": segmentos([("EN_PROCESO", "En proceso", 3)])}],
        barras={"titulo": "Cotizado vs. vendido", "formato": "pesos", "eje": "fechas", "etiquetas": ["2001-01-06"],
                "series": [{"clave": "vendido", "etiqueta": "Vendido", "valores": [100.0], "tono": "positivo"}],
                "apiladas": False},
        movimientos={"titulo": "Últimos pedidos", "filas": [
            {"tipo": "pedido", "numero": "PVEN-1", "titulo": "Pedido creado", "detalle": "Cliente", "fecha":
             "2001-01-06T15:00:00Z", "monto": 100, "formato": "pesos", "signo": "+", "estado_etiqueta": "En proceso",
             "doc_tipo": "PVEN", "doc_id": 1}]},
        ranking={"titulo": "Mejores clientes", "columna": "Vendido", "formato": "pesos", "filas": [
            {"posicion": 1, "nombre": "Cliente", "detalle": None, "valor": 100, "cantidad": 1, "pct": 100.0}]},
        filtros={"foco": "hub", "top": 5},
    )


def test_respuesta_claves_exactas():
    from app.core import analisis
    p = _periodo("2001-01-06", "2001-01-10")
    r = analisis.respuesta(p, **_bloques(), avisos=("Faltan costos en 2 pedidos.",))
    assert r["status"] == "success"
    data = r["data"]
    assert set(data) == analisis.CLAVES_ANALISIS == {"periodo", "kpis", "linea", "donas", "barras", "movimientos",
                                                     "ranking", "filtros", "avisos", "generado_en"}
    assert data["periodo"] == {"clave": "personalizado", "etiqueta": "Personalizado", "desde": "2001-01-06",
                               "hasta": "2001-01-10", "anterior_desde": "2001-01-01", "anterior_hasta": "2001-01-05",
                               "granularidad": "dia", "comparado": "vs 1 ene 2001 – 5 ene 2001"}
    assert set(data["periodo"]) == analisis.CLAVES_PERIODO
    assert set(data["kpis"][0]) == analisis.CLAVES_KPI == {"clave", "etiqueta", "valor", "anterior", "variacion_pct",
                                                           "formato", "mejor", "es_foto", "ayuda"}
    assert set(data["linea"]["series"][0]) == analisis.CLAVES_SERIE == {"clave", "etiqueta", "valores", "es_anterior"}
    assert set(data["barras"]["series"][0]) == analisis.CLAVES_SERIE_BARRAS == {"clave", "etiqueta", "valores", "tono"}
    assert set(data["donas"][0]["segmentos"][0]) == analisis.CLAVES_SEGMENTO == {"clave", "etiqueta", "valor", "pct",
                                                                                 "color"}
    assert set(data["movimientos"]["filas"][0]) == analisis.CLAVES_MOVIMIENTO == {
        "tipo", "numero", "titulo", "detalle", "fecha", "monto", "formato", "signo", "estado_etiqueta", "doc_tipo",
        "doc_id"}
    assert set(data["ranking"]["filas"][0]) == analisis.CLAVES_FILA_RANKING == {"posicion", "nombre", "detalle",
                                                                                "valor", "cantidad", "pct"}
    # filtros siempre trae sus cuatro claves; las que no se pasan van en None.
    assert data["filtros"] == {"foco": "hub", "top": 5, "producto": None, "bodega": None}
    assert data["avisos"] == ["Faltan costos en 2 pedidos."]


def test_respuesta_rechaza_claves_de_mas_o_de_menos():
    from app.core.analisis import kpi, respuesta
    p = _periodo("2001-01-06", "2001-01-10")
    malos = []
    b = _bloques(); b["kpis"] = [{**kpi("a", "A", 1), "extra": 1}]; malos.append(b)
    b = _bloques(); del b["linea"]["total_anterior"]; malos.append(b)
    b = _bloques(); b["barras"]["series"][0]["es_anterior"] = False; malos.append(b)
    b = _bloques(); b["donas"][0]["segmentos"][0].pop("pct"); malos.append(b)
    b = _bloques(); b["movimientos"]["filas"][0]["url"] = "/x"; malos.append(b)
    b = _bloques(); b["ranking"]["filas"][0].pop("cantidad"); malos.append(b)
    b = _bloques(); b["filtros"] = {"foco": "hub", "periodo": "30d"}; malos.append(b)
    for bloques in malos:
        assert _lanza_valor(respuesta, p, **bloques).startswith("Contrato de Análisis"), bloques
    # Un bloque que el módulo no tiene va en None (o lista vacía): el frontend lo completa sin inventar cifras.
    b = _bloques()
    b.update(linea=None, barras=None, movimientos=None, ranking=None, donas=[])
    data = respuesta(p, **b)["data"]
    assert (data["linea"], data["barras"], data["movimientos"], data["ranking"], data["donas"]) == (
        None, None, None, None, [])
    assert data["avisos"] == []


# ─── 12) expr_local, expr_cubeta y en_rango en la base ───────────────────────────────────────────────────────

def test_expr_local_en_la_base(db):
    """03:00 UTC del 3 de octubre = 22:00 del 2 en Colombia, sea la columna sin zona (UTC ingenuo) o timestamptz."""
    from app.core.analisis import expr_local
    sin_zona = cast(literal("2026-10-03 03:00:00"), DateTime(timezone=False))
    con_zona = cast(literal("2026-10-03 03:00:00+00"), DateTime(timezone=True))
    assert db.execute(select(expr_local(sin_zona))).scalar() == datetime(2026, 10, 2, 22, 0)
    assert db.execute(select(expr_local(con_zona))).scalar() == datetime(2026, 10, 2, 22, 0)


def test_expr_local_decide_por_el_tipo_de_la_columna():
    from app.core.analisis import expr_local
    from app.models.erp_documents import SaleOrder
    from app.models.inventory import InventoryMovement
    assert _sql_literal(expr_local(SaleOrder.created_at)) == (
        "timezone('America/Bogota', timezone('UTC', sale_orders.created_at))")
    assert _sql_literal(expr_local(InventoryMovement.created_at)) == (
        "timezone('America/Bogota', inventory_movements.created_at)")


def test_expr_cubeta_en_la_base(db):
    """Las 03:00 UTC del domingo 7 de enero de 2001 son las 22:00 del sábado 6 en Colombia."""
    from app.core.analisis import expr_cubeta
    instante = cast(literal("2001-01-07 03:00:00"), DateTime(timezone=False))
    assert db.execute(select(expr_cubeta(instante, "dia"))).scalar() == date(2001, 1, 6)
    assert db.execute(select(expr_cubeta(instante, "semana"))).scalar() == date(2001, 1, 1)  # lunes
    assert db.execute(select(expr_cubeta(instante, "mes"))).scalar() == date(2001, 1, 1)
    # Una columna Date (sale_order_payments.fecha) ya es un día de calendario: sin desfase.
    dia = cast(literal("2001-01-07"), Date)
    assert db.execute(select(expr_cubeta(dia, "dia"))).scalar() == date(2001, 1, 7)
    assert db.execute(select(expr_cubeta(dia, "semana"))).scalar() == date(2001, 1, 1)
    assert _lanza_valor(expr_cubeta, instante, "anio").startswith("Granularidad no válida")


def test_en_rango_usa_la_columna_cruda(db):
    from app.core.analisis import en_rango
    from app.models.erp_documents import SaleOrder
    from app.models.inventory import InventoryMovement
    p = _periodo("2001-01-06", "2001-01-10")
    sql = _sql(select(SaleOrder.id).where(en_rango(SaleOrder.created_at, p.inicio_utc, p.fin_utc)))
    assert "sale_orders.created_at >= %(created_at_1)s AND sale_orders.created_at < %(created_at_2)s" in sql, sql
    # Con una columna timestamptz los bordes (UTC sin zona) se mandan como UTC, sin depender de la zona de la sesión.
    instante = cast(literal("2001-01-06 05:00:00+00"), DateTime(timezone=True))
    assert db.execute(select(en_rango(instante, p.inicio_utc, p.fin_utc))).scalar() is True
    antes = cast(literal("2001-01-06 04:59:59+00"), DateTime(timezone=True))
    assert db.execute(select(en_rango(antes, p.inicio_utc, p.fin_utc))).scalar() is False
    assert InventoryMovement.created_at.type.timezone is True


# ─── 13) ISO con Z: fechas.iso_z (RP29) ──────────────────────────────────────────────────────────────────────

def test_iso_z_en_el_contrato():
    from app.core import analisis
    from app.core.fechas import iso_z
    assert iso_z(datetime(2026, 10, 3, 15, 0)) == "2026-10-03T15:00:00Z"  # sin zona se toma como UTC
    data = analisis.respuesta(_periodo("2001-01-06", "2001-01-10"), **_bloques())["data"]
    generado = data["generado_en"]
    assert generado.endswith("Z")
    instante = datetime.fromisoformat(generado.replace("Z", "+00:00"))
    assert abs(datetime.now(timezone.utc) - instante) < timedelta(minutes=5)
