"""El contrato único de las pestañas Análisis y sus piezas de SQL y de cubetas.

Bloque 4, T1A (ANALISIS-api con R7, C12, RP1/D1, RP27 y RP29). Lo usan los endpoints de Análisis de Ventas, Compras,
Inventario, Finanzas y CRM (T6C, T12, T13 y T20): cada uno hace un número fijo de consultas agregadas (GROUP BY, SUM,
COUNT y LIMIT, no filas al navegador) y arma su respuesta con respuesta(...).

- El período NO vive aquí: Periodo y resolver_periodo son los de core/periodos.py (un solo resolver, C12).
- El día de Colombia sale de ZONA_COLOMBIA de core/fechas.py (expr_local; RP1/D1): sin un desfase horario propio.
- El ISO con Z es fechas.iso_z (RP29): no hay una tercera copia.
- Montos en pesos enteros con dinero() (redondear_peso de core/ventas_dinero.py, Bloque 1).
- Las fechas de las cubetas van como 'AAAA-MM-DD' de Colombia, sin hora ni zona.

Errores (r1): un error de NEGOCIO (un top que no vale, un período que no vale) lanza ValueError con el texto en español
y la ruta responde 422 con str(e). Un error de PROGRAMACIÓN (un formato o un «mejor» que no vale en kpi, una
granularidad que no vale en expr_cubeta, un bloque del contrato con claves de más o de menos) lanza ErrorDeContrato,
que NO es ValueError: llega como 500 con su traceback en vez de esconderse como un 422.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import Date, cast, func

from app.core import fechas
from app.core.fechas import ZONA_COLOMBIA
from app.core.periodos import (MAX_DIAS, PERIODO_POR_DEFECTO, PERIODOS, PERIODOS_KPI,  # noqa: F401 (se reexportan)
                               Periodo, _sumar_meses, bloque_periodo, contar_en, en_rango, resolver_periodo,
                               sumar_en)
from app.core.ventas_dinero import redondear_peso

TOPS = (5, 10, 25)
FORMATOS = ("pesos", "entero", "porcentaje", "dias", "unidades")  # 'entero' = el 'numero' del frontend (RP27)
MEJORES = ("sube", "baja", "neutro")
GRANULARIDADES = {"dia": "day", "semana": "week", "mes": "month"}
MAX_SEGMENTOS = 6

ERROR_TOP = "El ranking solo puede mostrar 5, 10 o 25."


class ErrorDeContrato(Exception):
    """Un error de programación en un endpoint de Análisis (un formato, un «mejor» o una granularidad que no vale, o un
    bloque del contrato con claves de más o de menos). NO es ValueError a propósito: los endpoints convierten los
    ValueError en 422, y esto tiene que llegar como 500 con su traceback."""

# ─── el contrato (claves exactas de cada bloque) ──────────────────────────────────────────────────────────────
CLAVES_ANALISIS = frozenset({"periodo", "kpis", "linea", "donas", "barras", "movimientos", "ranking", "filtros",
                             "avisos", "generado_en"})
CLAVES_PERIODO = frozenset({"clave", "etiqueta", "desde", "hasta", "anterior_desde", "anterior_hasta", "granularidad",
                            "comparado"})
CLAVES_KPI = frozenset({"clave", "etiqueta", "valor", "anterior", "variacion_pct", "formato", "mejor", "es_foto",
                        "ayuda"})
CLAVES_LINEA = frozenset({"titulo", "formato", "fechas", "series", "total", "total_anterior", "variacion_pct"})
CLAVES_SERIE = frozenset({"clave", "etiqueta", "valores", "es_anterior"})  # series de la línea
CLAVES_DONA = frozenset({"clave", "titulo", "formato", "total", "segmentos"})
CLAVES_SEGMENTO = frozenset({"clave", "etiqueta", "valor", "pct", "color"})
CLAVES_BARRAS = frozenset({"titulo", "formato", "eje", "etiquetas", "series", "apiladas"})
CLAVES_SERIE_BARRAS = frozenset({"clave", "etiqueta", "valores", "tono"})  # tono: 'positivo' | 'negativo' | 'neutro'
CLAVES_MOVIMIENTOS = frozenset({"titulo", "filas"})
CLAVES_MOVIMIENTO = frozenset({"tipo", "numero", "titulo", "detalle", "fecha", "monto", "formato", "signo",
                               "estado_etiqueta", "doc_tipo", "doc_id"})
CLAVES_RANKING = frozenset({"titulo", "columna", "formato", "filas"})
CLAVES_FILA_RANKING = frozenset({"posicion", "nombre", "detalle", "valor", "cantidad", "pct"})
CLAVES_FILTROS = ("foco", "top", "producto", "bodega")


# ─── validaciones y números ──────────────────────────────────────────────────────────────────────────────────

def validar_top(top) -> int:
    """El tamaño del ranking: 5, 10 o 25, como int o como texto de dígitos ('10' -> 10; R21 permite declarar top como
    str). Otro valor (bool, None, un float, otro texto) -> ValueError('El ranking solo puede mostrar 5, 10 o 25.')."""
    if isinstance(top, str):  # se compara el texto antes de convertir: '1' × 5000 no llega a int()
        texto = top.strip()
        top = int(texto) if texto in {str(t) for t in TOPS} else None
    if isinstance(top, bool) or not isinstance(top, int) or top not in TOPS:
        raise ValueError(ERROR_TOP)
    return top


def dinero(v) -> int:
    """Un monto en pesos enteros (redondear_peso, Bloque 1). None vale 0."""
    return int(redondear_peso(v))


def _numero(v):
    """Un Decimal de la base pasa a int (si es entero) o float, para que el JSON no dependa del Decimal."""
    if isinstance(v, Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    return v


def variacion_pct(actual, anterior) -> float | None:
    """El % de cambio contra el período anterior, con 1 decimal:
    - None si anterior es None (sin comparación), o si anterior es 0 y actual no («Nuevo»);
    - 0.0 si los dos son 0 («Sin cambio»);
    - si no, round((actual − anterior) / |anterior| × 100, 1)."""
    if anterior is None or actual is None:
        return None
    actual, anterior = float(actual), float(anterior)
    if anterior == 0:
        return 0.0 if actual == 0 else None
    return round((actual - anterior) / abs(anterior) * 100, 1)


def kpi(clave, etiqueta, valor, anterior=None, formato="entero", mejor="sube", es_foto=False, ayuda=None) -> dict:
    """Un indicador del contrato. Trae valor, anterior, mejor y es_foto, que el frontend lee para su texto de variación
    (RP27); variacion_pct va con la misma regla. formato: 'pesos' | 'entero' | 'porcentaje' | 'dias' | 'unidades' (los
    'pesos' se redondean al peso); mejor: 'sube' | 'baja' | 'neutro'. Una foto (es_foto, por ejemplo el saldo por cobrar
    de hoy) no lleva anterior ni %. Un valor None se queda en None: nunca se inventa un número."""
    if formato not in FORMATOS:
        raise ErrorDeContrato(f"Formato de indicador no válido: {formato!r}.")
    if mejor not in MEJORES:
        raise ErrorDeContrato(f"«mejor» no válido: {mejor!r}.")
    if es_foto:
        anterior = None
    if formato == "pesos":
        valor = None if valor is None else dinero(valor)
        anterior = None if anterior is None else dinero(anterior)
    else:
        valor, anterior = _numero(valor), _numero(anterior)
    return {"clave": clave, "etiqueta": etiqueta, "valor": valor, "anterior": anterior,
            "variacion_pct": None if es_foto else variacion_pct(valor, anterior), "formato": formato,
            "mejor": mejor, "es_foto": bool(es_foto), "ayuda": ayuda}


def segmentos(filas, maximo: int = MAX_SEGMENTOS) -> list[dict]:
    """Los segmentos de una dona. filas = [(clave, etiqueta, valor) o (clave, etiqueta, valor, color)]. Quita los ceros,
    ordena de mayor a menor, deja `maximo` y suma el resto en {clave: '_otros', etiqueta: 'Otros'}.
    pct = round(valor / total × 100, 1)."""
    limpias = []
    for fila in filas:
        clave, etiqueta, valor = fila[0], fila[1], _numero(fila[2])
        color = fila[3] if len(fila) > 3 else None
        if valor:
            limpias.append((clave, etiqueta, valor, color))
    if not limpias:
        return []
    limpias.sort(key=lambda f: f[2], reverse=True)
    total = sum(f[2] for f in limpias)
    if len(limpias) > maximo:
        resto = sum(f[2] for f in limpias[maximo:])
        limpias = limpias[:maximo] + [("_otros", "Otros", resto, None)]
    return [{"clave": c, "etiqueta": e, "valor": v, "pct": round(float(v) / float(total) * 100, 1) if total else 0.0,
             "color": color} for c, e, v, color in limpias]


# ─── SQL: el día de Colombia y las cubetas ───────────────────────────────────────────────────────────────────

def expr_local(col):
    """La hora de Colombia (timestamp sin zona) de una columna de fecha y hora, con ZONA_COLOMBIA (RP1):
    - DateTime sin zona (UTC ingenuo: Ventas, Compras, Finanzas y CRM): timezone('America/Bogota', timezone('UTC', col));
    - DateTime(timezone=True) (como inventory_movements.created_at): timezone('America/Bogota', col).
    Decide por col.type.timezone, así que sigue sirviendo si otra columna se migra."""
    if getattr(col.type, "timezone", False):
        return func.timezone(ZONA_COLOMBIA.key, col)
    return func.timezone(ZONA_COLOMBIA.key, func.timezone("UTC", col))


def _es_solo_fecha(col) -> bool:
    return isinstance(col.type, Date)  # DateTime no es subclase de Date


def expr_cubeta(col, granularidad: str):
    """El día de la cubeta (Date) de cada fila: date_trunc('day' | 'week' | 'month') sobre la hora de Colombia. Las
    semanas empiezan el lunes. Una columna Date (sale_order_payments.fecha) ya es un día: se trunca sin pasar de zona."""
    if granularidad not in GRANULARIDADES:
        raise ErrorDeContrato(f"Granularidad no válida: {granularidad!r}.")
    base = col if _es_solo_fecha(col) else expr_local(col)
    return cast(func.date_trunc(GRANULARIDADES[granularidad], base), Date)


def _primera_cubeta(dia: date, granularidad: str) -> date:
    if granularidad == "semana":
        return dia - timedelta(days=dia.weekday())
    if granularidad == "mes":
        return dia.replace(day=1)
    return dia


def _siguiente(dia: date, granularidad: str) -> date:
    if granularidad == "semana":
        return dia + timedelta(days=7)
    if granularidad == "mes":
        return _sumar_meses(dia, 1)
    return dia + timedelta(days=1)


def claves_cubetas(periodo: Periodo, anterior: bool = False) -> list[date]:
    """Los días de las cubetas del período (o del anterior), en orden: cada día ('dia'), el lunes de cada semana
    ('semana'; la primera puede empezar antes de `desde`) o el día 1 de cada mes ('mes')."""
    desde, hasta = ((periodo.anterior_desde, periodo.anterior_hasta) if anterior else (periodo.desde, periodo.hasta))
    claves, dia = [], _primera_cubeta(desde, periodo.granularidad)
    while dia <= hasta:
        claves.append(dia)
        dia = _siguiente(dia, periodo.granularidad)
    return claves


def rellenar(filas: dict, periodo: Periodo, anterior: bool = False) -> list[float]:
    """Los valores de la serie, uno por cubeta, con 0 en las vacías. `filas` = {día de la cubeta: número} (lo que da
    un GROUP BY sobre expr_cubeta). La serie anterior se alinea por posición con la actual y tiene su mismo largo: si el
    anterior tiene menos cubetas (febrero contra marzo) las que faltan quedan en 0; si tiene más, sobran al final."""
    normalizadas = {(k.date() if isinstance(k, datetime) else k): v for k, v in filas.items()}
    valores = [float(normalizadas.get(k) or 0) for k in claves_cubetas(periodo, anterior)]
    if not anterior:
        return valores
    largo = len(claves_cubetas(periodo))
    return (valores + [0.0] * largo)[:largo]


# ─── la respuesta ────────────────────────────────────────────────────────────────────────────────────────────

def _exigir(nombre, bloque, claves):
    if not isinstance(bloque, dict) or set(bloque) != set(claves):
        tiene = sorted(bloque) if isinstance(bloque, dict) else type(bloque).__name__
        raise ErrorDeContrato(f"Contrato de Análisis: «{nombre}» debe traer {sorted(claves)} y trae {tiene}.")


def _exigir_lista(nombre, filas, claves):
    if not isinstance(filas, (list, tuple)):
        raise ErrorDeContrato(f"Contrato de Análisis: «{nombre}» debe ser una lista.")
    for i, fila in enumerate(filas):
        _exigir(f"{nombre}[{i}]", fila, claves)


def _bloque_periodo_analisis(periodo: Periodo) -> dict:
    return {"clave": periodo.clave, "etiqueta": periodo.etiqueta, "desde": periodo.desde.isoformat(),
            "hasta": periodo.hasta.isoformat(), "anterior_desde": periodo.anterior_desde.isoformat(),
            "anterior_hasta": periodo.anterior_hasta.isoformat(), "granularidad": periodo.granularidad,
            "comparado": periodo.comparado}


def _lista_de_avisos(avisos) -> list[str]:
    if avisos is None:
        return []
    if isinstance(avisos, str):
        return [avisos]
    return [str(a) for a in avisos]


def respuesta(periodo: Periodo, *, kpis, linea, donas, barras, movimientos, ranking, filtros, avisos=()) -> dict:
    """El cuerpo de un endpoint de Análisis: {status: 'success', data}, con data = el CONTRATO ÚNICO:
    {periodo, kpis, linea, donas, barras, movimientos, ranking, filtros, avisos, generado_en} (CLAVES_ANALISIS).

    - periodo: {clave, etiqueta, desde, hasta, anterior_desde, anterior_hasta, granularidad, comparado}, con las fechas
      'AAAA-MM-DD' (días de Colombia, las dos incluidas).
    - kpis: lista de kpi(...). donas: lista de {clave, titulo, formato, total, segmentos} (segmentos de segmentos()).
    - linea {titulo, formato, fechas, series [{clave, etiqueta, valores, es_anterior}], total, total_anterior,
      variacion_pct}, barras {titulo, formato, eje, etiquetas, series [{clave, etiqueta, valores, tono}], apiladas},
      movimientos {titulo, filas [{tipo, numero, titulo, detalle, fecha (ISO con Z), monto, formato, signo,
      estado_etiqueta, doc_tipo, doc_id}]} y ranking {titulo, columna, formato, filas [{posicion, nombre, detalle,
      valor, cantidad, pct}]}: cada uno puede ir en None si el módulo no lo tiene.
    - filtros: {foco, top, producto, bodega}; las que no se pasan van en None y una clave de más es un error.
    - avisos: lista de textos; None es «sin avisos» y un texto suelto es un solo aviso. generado_en: ahora, en ISO
      con Z (fechas.iso_z).
    Comprueba que cada bloque traiga exactamente sus claves (ErrorDeContrato 'Contrato de Análisis: ...')."""
    kpis = list(kpis or [])
    donas = list(donas or [])
    _exigir_lista("kpis", kpis, CLAVES_KPI)
    _exigir_lista("donas", donas, CLAVES_DONA)
    for i, dona in enumerate(donas):
        _exigir_lista(f"donas[{i}].segmentos", dona["segmentos"], CLAVES_SEGMENTO)
    if linea is not None:
        _exigir("linea", linea, CLAVES_LINEA)
        _exigir_lista("linea.series", linea["series"], CLAVES_SERIE)
    if barras is not None:
        _exigir("barras", barras, CLAVES_BARRAS)
        _exigir_lista("barras.series", barras["series"], CLAVES_SERIE_BARRAS)
    if movimientos is not None:
        _exigir("movimientos", movimientos, CLAVES_MOVIMIENTOS)
        _exigir_lista("movimientos.filas", movimientos["filas"], CLAVES_MOVIMIENTO)
    if ranking is not None:
        _exigir("ranking", ranking, CLAVES_RANKING)
        _exigir_lista("ranking.filas", ranking["filas"], CLAVES_FILA_RANKING)
    filtros = dict(filtros or {})
    sobran = set(filtros) - set(CLAVES_FILTROS)
    if sobran:
        raise ErrorDeContrato(f"Contrato de Análisis: «filtros» no admite {sorted(sobran)}.")

    data = {
        "periodo": _bloque_periodo_analisis(periodo),
        "kpis": kpis,
        "linea": linea,
        "donas": donas,
        "barras": barras,
        "movimientos": movimientos,
        "ranking": ranking,
        "filtros": {clave: filtros.get(clave) for clave in CLAVES_FILTROS},
        "avisos": _lista_de_avisos(avisos),
        "generado_en": fechas.iso_z(fechas.ahora_utc()),
    }
    if set(data) != CLAVES_ANALISIS:  # salvaguarda: el contrato y CLAVES_ANALISIS no se separan
        raise ErrorDeContrato(f"Contrato de Análisis: claves {sorted(data)}.")
    return {"status": "success", "data": data}
