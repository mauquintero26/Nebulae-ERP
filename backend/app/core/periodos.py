"""Períodos de los indicadores y de los Análisis: un solo resolver_periodo para todo el ERP.

Bloque 4, T1A (KPI-base punto 6 y ANALISIS-api; R7, C12, RP1/D1, RP29). Lo usan /ventas/stats, /compras/stats, el
Dashboard General, las pestañas Análisis (core/analisis.py lo importa) y E-Commerce. Va sobre core/fechas.py del
Bloque 3: el "hoy" es hoy_colombia y los bordes salen de ZONA_COLOMBIA, sin un desfase horario propio (Colombia no
tiene horario de verano, así que es lo mismo, pero la regla vive en un solo lugar).

Semántica (la de ANALISIS-api), en días calendario de Colombia, con las dos fechas incluidas:
- '7d', '30d' y '90d': hoy y los n−1 días anteriores, contra los n días justo antes.
- 'mes': del día 1 del mes a hoy, contra el mismo tramo del mes pasado (desde su día 1, con el mismo número de días),
  recortado al fin de ese mes.
- '12m': del día 1 del mes de hace 11 meses a hoy, contra los 12 meses calendario anteriores.
- 'personalizado': desde y hasta en 'AAAA-MM-DD' (o date), contra el tramo del mismo largo justo antes.
Granularidad: hasta 31 días 'dia', hasta 92 'semana' (desde el lunes), más de 92 'mes'.
Los instantes (inicio_utc, fin_utc y los del anterior) son UTC sin zona, como created_at: el inicio es las 00:00 de
`desde` en Colombia y el fin, EXCLUIDO, las 00:00 del día siguiente a `hasta`.

Un período que no vale lanza ValueError con uno de los seis textos de ERRORES; el endpoint responde 422 con str(e).

Sin FastAPI ni sesión: contar_en y sumar_en reciben el Query de la sesión y hacen una sola consulta.
"""
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import and_, case, func, or_

from app.core import fechas
from app.core.fechas import ZONA_COLOMBIA

PERIODOS = ("7d", "30d", "90d", "mes", "12m", "personalizado")
PERIODOS_KPI = ("7d", "30d", "mes")  # los de las tarjetas y del Dashboard General
PERIODO_POR_DEFECTO = "30d"  # periodo_comparacion: «Últimos 30 días contra los 30 anteriores»
MAX_DIAS = 731

ETIQUETAS = {"7d": "7 días", "30d": "30 días", "90d": "90 días", "mes": "Este mes", "12m": "12 meses",
             "personalizado": "Personalizado"}
_DIAS_MOVILES = {"7d": 7, "30d": 30, "90d": 90}

ERROR_PERIODO = "Período no válido."
ERROR_SIN_FECHAS = "Elige la fecha inicial y la final."
ERROR_FORMATO = "Las fechas deben tener el formato AAAA-MM-DD."
ERROR_ORDEN = "La fecha inicial debe ser anterior o igual a la final."
ERROR_FUTURO = "La fecha final no puede ser posterior a hoy."
ERROR_LARGO = "El período no puede ser mayor a 2 años."
ERRORES = (ERROR_PERIODO, ERROR_SIN_FECHAS, ERROR_FORMATO, ERROR_ORDEN, ERROR_FUTURO, ERROR_LARGO)

_MESES_CORTOS = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic")
_FECHA = re.compile(r"\d{4}-\d{2}-\d{2}")


@dataclass(frozen=True)
class Periodo:
    clave: str
    etiqueta: str
    desde: date               # día de Colombia, incluido
    hasta: date               # día de Colombia, incluido
    anterior_desde: date
    anterior_hasta: date
    granularidad: str         # 'dia' | 'semana' | 'mes'
    inicio_utc: datetime      # las 00:00 de `desde` en Colombia, en UTC sin zona
    fin_utc: datetime         # las 00:00 del día siguiente a `hasta` en Colombia (EXCLUIDO), en UTC sin zona
    anterior_inicio_utc: datetime
    anterior_fin_utc: datetime
    comparado: str            # 'vs 5 ago – 3 sept'


def inicio_del_dia_utc(dia: date) -> datetime:
    """Las 00:00 de `dia` en Colombia, en UTC sin zona (el patrón de fechas.vence_al_final_del_dia):
    date(2026, 9, 4) -> datetime(2026, 9, 4, 5, 0)."""
    return datetime.combine(dia, time(0), tzinfo=ZONA_COLOMBIA).astimezone(timezone.utc).replace(tzinfo=None)


def _sumar_meses(dia: date, meses: int) -> date:
    """El día 1 del mes que queda `meses` meses después (o antes, si es negativo) del mes de `dia`."""
    indice = dia.year * 12 + (dia.month - 1) + meses
    return date(indice // 12, indice % 12 + 1, 1)


def _leer_fecha(valor) -> date:
    if isinstance(valor, datetime):  # un instante no es un día de calendario
        raise ValueError(ERROR_FORMATO)
    if isinstance(valor, date):
        return valor
    texto = str(valor).strip()
    if not _FECHA.fullmatch(texto):
        raise ValueError(ERROR_FORMATO)
    try:
        return date.fromisoformat(texto)
    except ValueError:  # 2026-02-30
        raise ValueError(ERROR_FORMATO) from None


def _vacio(valor) -> bool:
    return valor is None or (isinstance(valor, str) and not valor.strip())


def _granularidad(desde: date, hasta: date) -> str:
    dias = (hasta - desde).days + 1
    if dias <= 31:
        return "dia"
    if dias <= 92:
        return "semana"
    return "mes"


def _texto_dia(dia: date, con_anio: bool) -> str:
    texto = f"{dia.day} {_MESES_CORTOS[dia.month - 1]}"
    return f"{texto} {dia.year}" if con_anio else texto


def _comparado(anterior_desde: date, anterior_hasta: date, hoy: date) -> str:
    """'vs 5 ago – 3 sept'. Con el año en las dos puntas si el tramo cruza de año o no es del año de hoy."""
    con_anio = not (anterior_desde.year == anterior_hasta.year == hoy.year)
    if anterior_desde == anterior_hasta:
        return f"vs {_texto_dia(anterior_desde, con_anio)}"
    return f"vs {_texto_dia(anterior_desde, con_anio)} – {_texto_dia(anterior_hasta, con_anio)}"


def resolver_periodo(clave, desde=None, hasta=None, ahora_utc: datetime | None = None) -> Periodo:
    """El Periodo de `clave` (una de PERIODOS; None o '' = PERIODO_POR_DEFECTO). `desde` y `hasta` solo cuentan en
    'personalizado'. `ahora_utc` (UTC sin zona) fija el instante en las pruebas; si no, es la hora actual.
    Lanza ValueError con uno de los seis textos de ERRORES."""
    clave = (clave or "").strip() or PERIODO_POR_DEFECTO
    if clave not in PERIODOS:
        raise ValueError(ERROR_PERIODO)
    hoy = fechas.hoy_colombia(ahora_utc)

    if clave in _DIAS_MOVILES:
        n = _DIAS_MOVILES[clave]
        inicio, fin = hoy - timedelta(days=n - 1), hoy
        ant_fin = inicio - timedelta(days=1)
        ant_inicio = ant_fin - timedelta(days=n - 1)
    elif clave == "mes":
        inicio, fin = hoy.replace(day=1), hoy
        ant_inicio = _sumar_meses(inicio, -1)
        ant_fin = min(ant_inicio + timedelta(days=hoy.day - 1), inicio - timedelta(days=1))
    elif clave == "12m":
        inicio, fin = _sumar_meses(hoy, -11), hoy
        ant_inicio = _sumar_meses(inicio, -12)
        ant_fin = inicio - timedelta(days=1)
    else:  # personalizado
        if _vacio(desde) or _vacio(hasta):
            raise ValueError(ERROR_SIN_FECHAS)
        inicio, fin = _leer_fecha(desde), _leer_fecha(hasta)
        if inicio > fin:
            raise ValueError(ERROR_ORDEN)
        if fin > hoy:
            raise ValueError(ERROR_FUTURO)
        dias = (fin - inicio).days + 1
        if dias > MAX_DIAS:
            raise ValueError(ERROR_LARGO)
        ant_fin = inicio - timedelta(days=1)
        ant_inicio = ant_fin - timedelta(days=dias - 1)

    return Periodo(
        clave=clave, etiqueta=ETIQUETAS[clave], desde=inicio, hasta=fin,
        anterior_desde=ant_inicio, anterior_hasta=ant_fin, granularidad=_granularidad(inicio, fin),
        inicio_utc=inicio_del_dia_utc(inicio), fin_utc=inicio_del_dia_utc(fin + timedelta(days=1)),
        anterior_inicio_utc=inicio_del_dia_utc(ant_inicio),
        anterior_fin_utc=inicio_del_dia_utc(ant_fin + timedelta(days=1)),
        comparado=_comparado(ant_inicio, ant_fin, hoy),
    )


def bloque_periodo(periodo: Periodo) -> dict:
    """El bloque 'periodo' de /stats: {clave, etiqueta, actual: {desde, hasta}, anterior: {desde, hasta}, comparado},
    con los instantes en ISO con Z (fechas.iso_z, RP29). `hasta` es el instante EXCLUSIVO: las 00:00 (de Colombia) del
    día siguiente al último día del período; una pantalla que muestre el último día usa `hasta` menos un instante o el
    'hasta' (día) del contrato de Análisis."""
    return {
        "clave": periodo.clave,
        "etiqueta": periodo.etiqueta,
        "actual": {"desde": fechas.iso_z(periodo.inicio_utc), "hasta": fechas.iso_z(periodo.fin_utc)},
        "anterior": {"desde": fechas.iso_z(periodo.anterior_inicio_utc), "hasta": fechas.iso_z(periodo.anterior_fin_utc)},
        "comparado": periodo.comparado,
    }


def en_rango(col, ini: datetime, fin: datetime):
    """col >= ini AND col < fin, sobre la columna cruda (así se pueden usar sus índices). `ini` y `fin` son UTC sin
    zona; si la columna es timestamptz se mandan como UTC con zona, para no depender de la zona de la sesión."""
    if getattr(getattr(col, "type", None), "timezone", False):
        ini = ini.replace(tzinfo=timezone.utc) if ini.tzinfo is None else ini
        fin = fin.replace(tzinfo=timezone.utc) if fin.tzinfo is None else fin
    return and_(col >= ini, col < fin)


def _ventanas(col_fecha, periodo: Periodo):
    actual = en_rango(col_fecha, periodo.inicio_utc, periodo.fin_utc)
    anterior = en_rango(col_fecha, periodo.anterior_inicio_utc, periodo.anterior_fin_utc)
    return actual, anterior


def contar_en(q, col_fecha, periodo: Periodo) -> dict:
    """{actual, anterior}: cuántas filas de `q` tienen `col_fecha` en cada ventana del período. Una sola consulta."""
    actual, anterior = _ventanas(col_fecha, periodo)
    fila = (q.order_by(None).enable_eagerloads(False).filter(or_(actual, anterior))
            .with_entities(func.count().filter(actual), func.count().filter(anterior)).one())
    return {"actual": int(fila[0] or 0), "anterior": int(fila[1] or 0)}


def sumar_en(q, col_fecha, col_monto, periodo: Periodo) -> dict:
    """{actual, anterior}: la suma de `col_monto` de las filas de `q` con `col_fecha` en cada ventana. Una sola
    consulta, con sum(case(...)) por ventana. Sin filas da 0. Devuelve lo que da la base (Decimal en los montos): quien
    muestre pesos los pasa por redondear_peso."""
    actual, anterior = _ventanas(col_fecha, periodo)
    suma = lambda cond: func.coalesce(func.sum(case((cond, col_monto), else_=0)), 0)
    fila = (q.order_by(None).enable_eagerloads(False).filter(or_(actual, anterior))
            .with_entities(suma(actual), suma(anterior)).one())
    return {"actual": fila[0], "anterior": fila[1]}
