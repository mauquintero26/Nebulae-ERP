"""Bloque 4, T1A: un solo resolver_periodo (core/periodos.py), sobre core/fechas.py del Bloque 3 (R7, C12, RP1/D1).

Semántica de ANALISIS-api (pruebas 1 a 6 de su diseño): días calendario de Colombia; '30d' = hoy y los 29 días
anteriores contra los 30 justo antes; 'mes' = del día 1 a hoy contra el mismo tramo del mes pasado, recortado a su fin;
'12m' = desde el día 1 del mes de hace 11 meses; 'personalizado' con 'AAAA-MM-DD' y sus seis textos de error. Los bordes
salen de ZONA_COLOMBIA (nada de un −5 h propio, D1). bloque_periodo da los instantes en ISO con Z (RP29: `hasta` es el
instante exclusivo) y contar_en / sumar_en cuentan y suman las dos ventanas en una sola consulta.

Como no se aceptan fechas futuras, las pruebas con la base usan ventanas del año 2001 (R22), donde erp_test no tiene
datos, y además filtran por su sufijo.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_periodos
"""
import dataclasses
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from app.models.erp_documents import SaleOrder

AHORA = datetime(2026, 10, 3, 15, 0)  # 10:00 del 3 de octubre en Colombia


def _lanza_valor(fn, *args, **kwargs):
    try:
        fn(*args, **kwargs)
    except ValueError as e:
        return str(e)
    raise AssertionError(f"{fn.__name__}{args} no lanzó ValueError")


# ─── constantes ──────────────────────────────────────────────────────────────────────────────────────────────

def test_constantes():
    from app.core import periodos
    assert periodos.PERIODOS == ("7d", "30d", "90d", "mes", "12m", "personalizado")
    assert periodos.PERIODOS_KPI == ("7d", "30d", "mes")
    assert periodos.PERIODO_POR_DEFECTO == "30d"
    assert periodos.MAX_DIAS == 731


# ─── 1) 30 días ──────────────────────────────────────────────────────────────────────────────────────────────

def test_periodo_30d():
    from app.core.periodos import resolver_periodo
    p = resolver_periodo("30d", ahora_utc=AHORA)
    assert (p.clave, p.etiqueta) == ("30d", "30 días")
    assert (p.desde, p.hasta) == (date(2026, 9, 4), date(2026, 10, 3))
    assert (p.anterior_desde, p.anterior_hasta) == (date(2026, 8, 5), date(2026, 9, 3))
    assert p.granularidad == "dia"
    assert p.inicio_utc == datetime(2026, 9, 4, 5, 0)
    assert p.fin_utc == datetime(2026, 10, 4, 5, 0)
    assert p.anterior_inicio_utc == datetime(2026, 8, 5, 5, 0)
    assert p.anterior_fin_utc == datetime(2026, 9, 4, 5, 0)
    assert p.inicio_utc.tzinfo is None and p.fin_utc.tzinfo is None  # UTC sin zona, como created_at
    assert p.comparado == "vs 5 ago – 3 sept"


def test_periodo_es_inmutable_y_sin_argumentos_es_30d():
    from app.core.periodos import Periodo, resolver_periodo
    p = resolver_periodo(None, ahora_utc=AHORA)
    assert isinstance(p, Periodo) and p.clave == "30d"
    try:
        p.clave = "7d"
    except dataclasses.FrozenInstanceError:
        pass
    else:
        raise AssertionError("Periodo no es inmutable")


def test_periodo_7d_y_90d():
    from app.core.periodos import resolver_periodo
    p = resolver_periodo("7d", ahora_utc=AHORA)
    assert (p.desde, p.hasta, p.anterior_desde, p.anterior_hasta) == (
        date(2026, 9, 27), date(2026, 10, 3), date(2026, 9, 20), date(2026, 9, 26))
    assert (p.etiqueta, p.granularidad) == ("7 días", "dia")
    p = resolver_periodo("90d", ahora_utc=AHORA)
    assert (p.desde, p.hasta) == (date(2026, 7, 6), date(2026, 10, 3))
    assert (p.anterior_desde, p.anterior_hasta) == (date(2026, 4, 7), date(2026, 7, 5))
    assert (p.etiqueta, p.granularidad) == ("90 días", "semana")


# ─── 2) el "hoy" es el de Colombia ──────────────────────────────────────────────────────────────────────────

def test_hoy_en_hora_de_colombia():
    """A las 03:00 UTC del 3 de octubre en Colombia todavía son las 22:00 del 2."""
    from app.core.periodos import resolver_periodo
    p = resolver_periodo("30d", ahora_utc=datetime(2026, 10, 3, 3, 0))
    assert p.hasta == date(2026, 10, 2)
    assert p.desde == date(2026, 9, 3)
    assert p.fin_utc == datetime(2026, 10, 3, 5, 0)


# ─── 3) mes ──────────────────────────────────────────────────────────────────────────────────────────────────

def test_periodo_mes():
    from app.core.periodos import resolver_periodo
    p = resolver_periodo("mes", ahora_utc=AHORA)
    assert (p.desde, p.hasta) == (date(2026, 10, 1), date(2026, 10, 3))
    assert (p.anterior_desde, p.anterior_hasta) == (date(2026, 9, 1), date(2026, 9, 3))
    assert (p.etiqueta, p.granularidad) == ("Este mes", "dia")
    assert p.inicio_utc == datetime(2026, 10, 1, 5, 0)
    assert p.anterior_fin_utc == datetime(2026, 9, 4, 5, 0)
    assert p.comparado == "vs 1 sept – 3 sept"


def test_mes_anterior_mas_corto():
    from app.core.periodos import resolver_periodo
    p = resolver_periodo("mes", ahora_utc=datetime(2026, 3, 31, 20, 0))
    assert (p.desde, p.hasta) == (date(2026, 3, 1), date(2026, 3, 31))
    assert (p.anterior_desde, p.anterior_hasta) == (date(2026, 2, 1), date(2026, 2, 28))
    assert p.anterior_fin_utc == datetime(2026, 3, 1, 5, 0)  # recortado al fin de febrero


def test_mes_el_ultimo_dia_a_las_22_de_colombia():
    """KPI-base: a las 03:00 UTC del 1 de octubre en Colombia es el 30 de septiembre (22:00): el mes es septiembre."""
    from app.core.periodos import resolver_periodo
    p = resolver_periodo("mes", ahora_utc=datetime(2026, 10, 1, 3, 0))
    assert (p.desde, p.hasta) == (date(2026, 9, 1), date(2026, 9, 30))
    assert p.inicio_utc == datetime(2026, 9, 1, 5, 0)
    assert (p.anterior_desde, p.anterior_hasta) == (date(2026, 8, 1), date(2026, 8, 30))
    assert p.anterior_inicio_utc == datetime(2026, 8, 1, 5, 0)


# ─── 4) 12 meses ─────────────────────────────────────────────────────────────────────────────────────────────

def test_periodo_12m():
    from app.core.periodos import resolver_periodo
    p = resolver_periodo("12m", ahora_utc=AHORA)
    assert (p.desde, p.hasta) == (date(2025, 11, 1), date(2026, 10, 3))
    assert (p.etiqueta, p.granularidad) == ("12 meses", "mes")
    # Los 12 meses anteriores: de noviembre de 2024 a octubre de 2025.
    assert (p.anterior_desde, p.anterior_hasta) == (date(2024, 11, 1), date(2025, 10, 31))
    assert p.comparado == "vs 1 nov 2024 – 31 oct 2025"
    p = resolver_periodo("12m", ahora_utc=datetime(2026, 1, 15, 15, 0))
    assert (p.desde, p.anterior_desde, p.anterior_hasta) == (date(2025, 2, 1), date(2024, 2, 1), date(2025, 1, 31))


# ─── 5) granularidad ─────────────────────────────────────────────────────────────────────────────────────────

def test_granularidad():
    from app.core.periodos import resolver_periodo
    inicio = date(2001, 1, 1)
    for dias, esperada in ((1, "dia"), (31, "dia"), (32, "semana"), (92, "semana"), (93, "mes"), (731, "mes")):
        hasta = inicio + timedelta(days=dias - 1)
        p = resolver_periodo("personalizado", inicio.isoformat(), hasta.isoformat(), ahora_utc=AHORA)
        assert p.granularidad == esperada, (dias, p.granularidad)


def test_personalizado():
    from app.core.periodos import resolver_periodo
    p = resolver_periodo("personalizado", "2001-01-06", "2001-01-10", ahora_utc=AHORA)
    assert (p.clave, p.etiqueta) == ("personalizado", "Personalizado")
    assert (p.desde, p.hasta) == (date(2001, 1, 6), date(2001, 1, 10))
    assert (p.anterior_desde, p.anterior_hasta) == (date(2001, 1, 1), date(2001, 1, 5))
    assert (p.inicio_utc, p.fin_utc) == (datetime(2001, 1, 6, 5, 0), datetime(2001, 1, 11, 5, 0))
    assert p.comparado == "vs 1 ene 2001 – 5 ene 2001"
    # Un día solo: el anterior es el día de antes. Las fechas también pueden llegar como date.
    p = resolver_periodo("personalizado", date(2026, 10, 3), date(2026, 10, 3), ahora_utc=AHORA)
    assert (p.anterior_desde, p.anterior_hasta) == (date(2026, 10, 2), date(2026, 10, 2))
    assert p.comparado == "vs 2 oct"
    # desde y hasta solo cuentan en 'personalizado'.
    assert resolver_periodo("30d", "2001-01-06", "2001-01-10", ahora_utc=AHORA).desde == date(2026, 9, 4)


# ─── 6) los seis textos de error ─────────────────────────────────────────────────────────────────────────────

def test_errores_de_periodo():
    from app.core.periodos import resolver_periodo
    assert _lanza_valor(resolver_periodo, "xx", ahora_utc=AHORA) == "Período no válido."
    assert _lanza_valor(resolver_periodo, "personalizado", ahora_utc=AHORA) == "Elige la fecha inicial y la final."
    assert _lanza_valor(resolver_periodo, "personalizado", "2026-10-01", None, ahora_utc=AHORA) == (
        "Elige la fecha inicial y la final.")
    assert _lanza_valor(resolver_periodo, "personalizado", "03/10/2026", "2026-10-03", ahora_utc=AHORA) == (
        "Las fechas deben tener el formato AAAA-MM-DD.")
    assert _lanza_valor(resolver_periodo, "personalizado", "2026-02-30", "2026-03-03", ahora_utc=AHORA) == (
        "Las fechas deben tener el formato AAAA-MM-DD.")
    assert _lanza_valor(resolver_periodo, "personalizado", "2026-10-03", "2026-10-01", ahora_utc=AHORA) == (
        "La fecha inicial debe ser anterior o igual a la final.")
    assert _lanza_valor(resolver_periodo, "personalizado", "2026-10-01", "2026-10-04", ahora_utc=AHORA) == (
        "La fecha final no puede ser posterior a hoy.")
    desde = (date(2026, 10, 3) - timedelta(days=799)).isoformat()  # 800 días
    assert _lanza_valor(resolver_periodo, "personalizado", desde, "2026-10-03", ahora_utc=AHORA) == (
        "El período no puede ser mayor a 2 años.")
    # 731 días (MAX_DIAS) sí se aceptan.
    desde = (date(2026, 10, 3) - timedelta(days=730)).isoformat()
    assert resolver_periodo("personalizado", desde, "2026-10-03", ahora_utc=AHORA).granularidad == "mes"


# ─── bloque_periodo (RP29) ───────────────────────────────────────────────────────────────────────────────────

def test_bloque_periodo_en_iso_con_z():
    from app.core.periodos import bloque_periodo, resolver_periodo
    b = bloque_periodo(resolver_periodo("30d", ahora_utc=AHORA))
    assert b == {
        "clave": "30d", "etiqueta": "30 días",
        "actual": {"desde": "2026-09-04T05:00:00Z", "hasta": "2026-10-04T05:00:00Z"},
        "anterior": {"desde": "2026-08-05T05:00:00Z", "hasta": "2026-09-04T05:00:00Z"},
        "comparado": "vs 5 ago – 3 sept",
    }


# ─── contar_en y sumar_en (una consulta, ventana del año 2001) ───────────────────────────────────────────────

def _pedidos_2001(db, suf):
    """Pedidos con created_at fijo alrededor de los bordes de 2001-01-06..2001-01-10 (y su anterior, 01..05)."""
    filas = [
        (datetime(2001, 1, 6, 5, 0), 1000),     # 00:00 del 6 en Colombia: actual (el borde inicial entra)
        (datetime(2001, 1, 11, 4, 59), 2000),   # 23:59 del 10: actual
        (datetime(2001, 1, 6, 4, 59), 400),     # 23:59 del 5: anterior
        (datetime(2001, 1, 1, 5, 0), 30),       # 00:00 del 1: anterior
        (datetime(2001, 1, 11, 5, 0), 8000),    # 00:00 del 11: fuera (el borde final no entra)
        (datetime(2001, 1, 1, 4, 59), 16000),   # 23:59 del 31 de diciembre de 2000: fuera
    ]
    for i, (creado, total) in enumerate(filas):
        v = SaleOrder(numero=f"PP{suf}{i}", customer_name=f"Cliente Periodos {suf}", estado="EN_PROCESO",
                      total_cop=Decimal(total), created_at=creado, updated_at=creado)
        db.add(v)
        db.commit()
    return db.query(SaleOrder).filter(SaleOrder.numero.like(f"PP{suf}%"))


def test_contar_en_y_sumar_en(db, contador_sql):
    from app.core.periodos import contar_en, resolver_periodo, sumar_en
    q = _pedidos_2001(db, uuid.uuid4().hex[:8].upper()).order_by(SaleOrder.created_at.desc())
    p = resolver_periodo("personalizado", "2001-01-06", "2001-01-10", ahora_utc=AHORA)
    with contador_sql.ventana() as v:
        conteo = contar_en(q, SaleOrder.created_at, p)
    assert conteo == {"actual": 2, "anterior": 2}
    assert v.consultas == 1, v.sentencias
    with contador_sql.ventana() as v:
        suma = sumar_en(q, SaleOrder.created_at, SaleOrder.total_cop, p)
    assert suma == {"actual": 3000, "anterior": 430}
    assert v.consultas == 1, v.sentencias


def test_contar_en_y_sumar_en_sin_filas_dan_cero(db):
    from app.core.periodos import contar_en, resolver_periodo, sumar_en
    q = db.query(SaleOrder).filter(SaleOrder.numero == f"NADA-{uuid.uuid4().hex[:8]}")
    p = resolver_periodo("personalizado", "2001-01-06", "2001-01-10", ahora_utc=AHORA)
    assert contar_en(q, SaleOrder.created_at, p) == {"actual": 0, "anterior": 0}
    assert sumar_en(q, SaleOrder.created_at, SaleOrder.total_cop, p) == {"actual": 0, "anterior": 0}


# ─── sin un −5 h propio (R7, C12, D1) ────────────────────────────────────────────────────────────────────────

def test_sin_desfase_propio():
    """Todo sale de ZONA_COLOMBIA de core/fechas.py: ni hours=5, ni OFFSET_CO, ni DESFASE_COLOMBIA."""
    core = Path(__file__).resolve().parent.parent / "app" / "core"
    for nombre in ("periodos.py", "analisis.py"):
        texto = (core / nombre).read_text(encoding="utf-8")
        for prohibido in ("hours=5", "hours=-5", "OFFSET_CO", "DESFASE_COLOMBIA", "5 hours"):
            assert prohibido not in texto, f"{nombre} tiene «{prohibido}»"
        assert "ZONA_COLOMBIA" in texto, nombre
