"""El Análisis de Inventario en el servidor (GET /inventory/analisis) y las direcciones de los movimientos del Kardex.

Bloque 4, T13 (ANALISIS-inventario puntos 1 y 2; R10, R11, R13, R21; C11, C12; RP1, RP29, RP51, RP54, D34, D44). Todo sale
de core/existencias.py (T1C) y de los movimientos del kardex (inventory_movements):

- Valor = al costo de compra de hoy (ProductSKU.cost_price; valor_inventario = «Con el costo de compra de cada
  referencia»). Un costo nulo, 0 o negativo cuenta como sin costo (la regla de existencias): vale 0 y va en el aviso
  'N referencias sin costo registrado' (las que tienen existencias físicas en el alcance).
- El valor ACTUAL es resumen_existencias(...)['valor_inventario_cop'] (RP51): sin las referencias cuya publicación tiene
  rastrear_inventario = false y con redondear_peso. Esas referencias tampoco entran en el resto del Análisis (sus
  movimientos, las donas, las agotadas ni el ranking): el Análisis son totales (R10).
- Movimientos según direction: entradas IN y ADJUST_IN; salidas OUT y ADJUST_OUT; TRANSFER_IN y TRANSFER_OUT solo cambian
  de bodega y no cuentan en el total, pero sí cuando se filtra una bodega (entran a ella o salen de ella). QUARANTINE, los
  movimientos sin dirección y cualquier otro valor (SCRAP, RETURN_IN) no se cuentan: van en el aviso
  'N movimientos sin dirección no se cuentan' (los del período).
- El valor al cierre de cada cubeta se reconstruye hacia atrás desde el valor actual restando el neto valorizado (entradas
  − salidas, al costo de hoy) de los movimientos posteriores: una suma de todo lo posterior a fin_utc y una consulta por
  cubeta desde anterior_inicio_utc (así también se restan los días entre los dos períodos de 'mes' y '12m'). El cierre
  del período anterior es el de anterior_fin_utc: es el indicador y el último punto de su serie (en semanas o meses esa
  cubeta puede seguir dentro del período actual). Si el anterior tiene menos cubetas, sus últimos puntos repiten su
  cierre (es un saldo: no cae a 0); si tiene más, sobran al final (la regla de analisis.rellenar).
- inventory_movements.created_at es timestamptz: los bordes van con zona (periodos.en_rango) y las cubetas con la rama
  timestamptz de expr_local (RP1), en días de Colombia. Las fechas de los movimientos, con fechas.iso_z (RP29).
- «Referencias agotadas» (foto de hoy, mejor: baja) = las de estado_stock 'agotado' (disponible 0) que tuvieron salidas en
  los últimos 90 días (resolver_periodo('90d'), RP51).

analisis_inventario(db, periodo, top, bodega=None) arma el contrato único con analisis.respuesta en ocho consultas
agregadas (R13), sin importar cuántos movimientos o referencias haya.

ENTRADAS_KARDEX, SALIDAS_KARDEX y DIRECCIONES_KARDEX son las direcciones de los movimientos (R11: el tablero del Kardex,
Entradas = IN, ADJUST_IN, TRANSFER_IN · Salidas = OUT, ADJUST_OUT, TRANSFER_OUT; get_kardex valida su CSV contra
DIRECCIONES_KARDEX, los valores que escribe el sistema, y list_inventory_operations toma de aquí su 'direccion').

Errores: un top que no vale lanza ValueError (el endpoint responde 422 con str(e), R21); un error del contrato es
analisis.ErrorDeContrato (un 500).
"""
from datetime import timezone
from decimal import Decimal

from sqlalchemy import and_, case, func, or_, select, true
from sqlalchemy.orm import Session

from app.core.analisis import (_numero, claves_cubetas, dinero, expr_cubeta, kpi, respuesta, validar_top,
                               variacion_pct)
# Las piezas del contrato que ya existen se importan, no se copian (como analisis_compras.py, r1 m17): _barras_por_fecha,
# _dona y _pct son las de analisis_ventas.py (para la revisión final: deberían vivir en core/analisis.py).
from app.core.analisis_ventas import _barras_por_fecha, _dona, _pct
from app.core.existencias import ESTADOS_STOCK, consulta_existencias, resumen_existencias
from app.core.fechas import iso_z
from app.core.periodos import Periodo, en_rango, resolver_periodo
from app.core.ventas_dinero import pesos
from app.models.catalog import Product, ProductSKU, ProductWebListing
from app.models.inventory import InventoryMovement, InventoryOperation, Warehouse

# ─── Direcciones de los movimientos (R11, RP54) ─────────────────────────────────────────────────────────────────────

ENTRADAS_KARDEX = ("IN", "ADJUST_IN", "TRANSFER_IN")
SALIDAS_KARDEX = ("OUT", "ADJUST_OUT", "TRANSFER_OUT")
# Todas las que escribe el sistema: las de entrada y salida, la cuarentena de una recepción (erp_compras), la pérdida o
# destrucción (SCRAP) y la devolución del cliente (RETURN_IN) de erp_ventas_fase4. Un movimiento también puede no tener.
DIRECCIONES_KARDEX = ENTRADAS_KARDEX + SALIDAS_KARDEX + ("QUARANTINE", "SCRAP", "RETURN_IN")

ENTRADAS = ("IN", "ADJUST_IN")
SALIDAS = ("OUT", "ADJUST_OUT")
TRASLADO_ENTRA = "TRANSFER_IN"
TRASLADO_SALE = "TRANSFER_OUT"
DIRECCIONES_QUE_CUENTAN = ENTRADAS_KARDEX + SALIDAS_KARDEX   # las demás (y las nulas) van en el aviso
TITULOS = {"IN": "Entrada", "OUT": "Salida", "ADJUST_IN": "Ajuste de entrada", "ADJUST_OUT": "Ajuste de salida",
           TRASLADO_ENTRA: "Traslado", TRASLADO_SALE: "Traslado"}

TOP_POR_DEFECTO = 5
MAX_MOVIMIENTOS = 8              # MAX_MOVIMIENTOS de lib/analisis.js
PERIODO_AGOTADAS = "90d"         # «tuvieron salidas en los últimos 90 días»
SIN_CATEGORIA = ("sin_categoria", "Sin categoría")
SIN_BODEGA = "Sin bodega"
DOC_TIPO = "KARDEX"
_AGOTADO = ESTADOS_STOCK[0]


def direcciones_que_cuentan(bodega=None) -> tuple:
    """(entradas, salidas) del Análisis: IN y ADJUST_IN contra OUT y ADJUST_OUT; con una bodega, también los traslados que
    entran a ella (TRANSFER_IN) o salen de ella (TRANSFER_OUT)."""
    if bodega is None:
        return ENTRADAS, SALIDAS
    return ENTRADAS + (TRASLADO_ENTRA,), SALIDAS + (TRASLADO_SALE,)


def _con_zona(instante):
    """Un instante de un Periodo (UTC sin zona) con su zona, para compararlo con created_at (timestamptz)."""
    return instante.replace(tzinfo=timezone.utc)


def _costo_unitario():
    """El costo de hoy de cada referencia en SQL; sin costo (nulo, 0 o negativo), 0 (la regla de existencias)."""
    return case((ProductSKU.cost_price > 0, ProductSKU.cost_price), else_=0)


def _neto(entradas, salidas):
    """Las unidades con signo de un movimiento: + si es una entrada, − si es una salida, 0 si no cuenta."""
    m = InventoryMovement
    return case((m.direction.in_(entradas), m.quantity), (m.direction.in_(salidas), -m.quantity), else_=0)


def _movimientos(db: Session, bodega):
    """Los movimientos del alcance: sin las referencias con rastrear_inventario = false (la regla de los totales de
    existencias: sin publicación cuenta) y, con una bodega, solo los de esa bodega. Une ProductSKU (el costo)."""
    m = InventoryMovement
    q = (db.query(m).join(ProductSKU, ProductSKU.id == m.sku_id)
         .outerjoin(ProductWebListing, ProductWebListing.sku_id == m.sku_id)
         .filter(func.coalesce(ProductWebListing.rastrear_inventario, true()).is_(True)))
    if bodega is not None:
        q = q.filter(m.warehouse_id == bodega)
    return q


def _suma(valor, condicion):
    return func.coalesce(func.sum(valor).filter(condicion), 0)


def _cifras(db: Session, periodo: Periodo, bodega, entradas, salidas) -> dict:
    """UNA consulta sobre los movimientos desde anterior_inicio_utc: las unidades de entrada y de salida de cada ventana,
    cuántos del período no se cuentan (sin dirección, QUARANTINE y los demás valores), el neto valorizado de todo lo
    posterior a fin_utc y el de lo que va de anterior_fin_utc a fin_utc (para el cierre del anterior)."""
    m = InventoryMovement
    actual = en_rango(m.created_at, periodo.inicio_utc, periodo.fin_utc)
    anterior = en_rango(m.created_at, periodo.anterior_inicio_utc, periodo.anterior_fin_utc)
    valor = _neto(entradas, salidas) * _costo_unitario()
    sin_direccion = or_(m.direction.is_(None), m.direction.notin_(DIRECCIONES_QUE_CUENTAN))
    fila = (_movimientos(db, bodega).filter(m.created_at >= _con_zona(periodo.anterior_inicio_utc))
            .with_entities(_suma(m.quantity, and_(actual, m.direction.in_(entradas))),
                           _suma(m.quantity, and_(actual, m.direction.in_(salidas))),
                           _suma(m.quantity, and_(anterior, m.direction.in_(entradas))),
                           _suma(m.quantity, and_(anterior, m.direction.in_(salidas))),
                           func.count(m.id).filter(and_(actual, sin_direccion)),
                           _suma(valor, m.created_at >= _con_zona(periodo.fin_utc)),
                           _suma(valor, en_rango(m.created_at, periodo.anterior_fin_utc, periodo.fin_utc)))
            .one())
    return {"entradas": {"actual": fila[0], "anterior": fila[2]}, "salidas": {"actual": fila[1], "anterior": fila[3]},
            "sin_direccion": int(fila[4] or 0), "neto_despues": Decimal(str(fila[5] or 0)),
            "neto_desde_cierre_anterior": Decimal(str(fila[6] or 0))}


def _por_cubeta(db: Session, periodo: Periodo, bodega, entradas, salidas) -> dict:
    """UNA consulta agrupada por la cubeta de created_at (días de Colombia), desde anterior_inicio_utc hasta fin_utc:
    {día de la cubeta: (neto valorizado, unidades de entrada del período, unidades de salida del período)}. Las unidades
    solo cuentan los movimientos del período actual (la primera semana puede empezar antes de `desde`)."""
    m = InventoryMovement
    cubeta = expr_cubeta(m.created_at, periodo.granularidad)
    actual = en_rango(m.created_at, periodo.inicio_utc, periodo.fin_utc)
    filas = (_movimientos(db, bodega).filter(en_rango(m.created_at, periodo.anterior_inicio_utc, periodo.fin_utc))
             .with_entities(cubeta, func.coalesce(func.sum(_neto(entradas, salidas) * _costo_unitario()), 0),
                            _suma(m.quantity, and_(actual, m.direction.in_(entradas))),
                            _suma(m.quantity, and_(actual, m.direction.in_(salidas))))
             .group_by(cubeta).all())
    return {dia: (Decimal(str(neto or 0)), ent, sal) for dia, neto, ent, sal in filas}


def _cierres(claves, netos: dict, valor_final: Decimal) -> list:
    """El valor (pesos enteros) al cierre de cada cubeta de `claves`: valor_final (el del cierre del período) menos el
    neto valorizado de las cubetas que empiezan después."""
    posteriores = sorted(netos.items(), reverse=True)
    valores, acumulado, i = [], Decimal(0), 0
    for clave in sorted(claves, reverse=True):
        while i < len(posteriores) and posteriores[i][0] > clave:
            acumulado += posteriores[i][1]
            i += 1
        valores.append(dinero(valor_final - acumulado))
    return list(reversed(valores))


def _linea(periodo: Periodo, cubetas: dict, valor_final: Decimal, valor_anterior: Decimal) -> dict:
    """«Valor del inventario»: el cierre de cada cubeta del período y del anterior (el último punto del anterior es su
    cierre exacto, anterior_fin_utc). total = el cierre del período; total_anterior = el del anterior."""
    netos = {dia: neto for dia, (neto, _, _) in cubetas.items()}
    fechas = claves_cubetas(periodo)
    actual = _cierres(fechas, netos, valor_final)
    anterior = _cierres(claves_cubetas(periodo, anterior=True), netos, valor_final)
    if anterior:
        anterior[-1] = dinero(valor_anterior)
    largo = len(fechas)
    anterior = (anterior + [anterior[-1]] * largo)[:largo] if anterior else [0] * largo
    total, total_anterior = dinero(valor_final), dinero(valor_anterior)
    return {
        "titulo": "Valor del inventario",
        "formato": "pesos",
        "fechas": [dia.isoformat() for dia in fechas],
        "series": [
            {"clave": "actual", "etiqueta": "Valor del inventario", "valores": actual, "es_anterior": False},
            {"clave": "anterior", "etiqueta": "Período anterior", "valores": anterior, "es_anterior": True},
        ],
        "total": total,
        "total_anterior": total_anterior,
        "variacion_pct": variacion_pct(total, total_anterior),
    }


def _barras(periodo: Periodo, cubetas: dict) -> dict:
    """«Entradas y salidas» en unidades por cubeta del período. D44: la serie de salidas va con tono 'negativo' (se
    dibuja hacia abajo); se mandan las magnitudes."""
    return _barras_por_fecha("Entradas y salidas", "unidades", periodo, [
        ("entradas", "Entradas", {dia: ent for dia, (_, ent, _) in cubetas.items()}, "positivo"),
        ("salidas", "Salidas", {dia: sal for dia, (_, _, sal) in cubetas.items()}, "negativo"),
    ])


def _dona_por_categoria(db: Session, bodega) -> tuple:
    """(«Valor por categoría», cuántas referencias con existencias físicas no tienen costo): Σ valorizacion de
    consulta_existencias por referencia (con la bodega, solo sus existencias), sin rastrear_inventario = false. UNA
    consulta agrupada por categoría."""
    e = consulta_existencias(db, por="sku", warehouse_id=bodega).subquery("valor_por_categoria")
    sin_costo = and_(e.c.fisico > 0, or_(e.c.costo.is_(None), e.c.costo <= 0))
    filas = (db.query(e.c.categoria, func.coalesce(func.sum(e.c.valorizacion), 0),
                      func.count(e.c.sku_id).filter(sin_costo))
             .filter(e.c.rastrear_inventario.is_(True)).group_by(e.c.categoria).all())
    segmentos = [((nombre, nombre) if nombre else SIN_CATEGORIA) + (dinero(valor),) for nombre, valor, _ in filas]
    return _dona("categoria", "Valor por categoría", "pesos", segmentos), sum(int(n or 0) for _, _, n in filas)


def _dona_por_bodega(db: Session, bodega) -> dict:
    """«Valor por bodega»: Σ valorizacion de consulta_existencias por par SKU-bodega, sin rastrear_inventario = false.
    UNA consulta agrupada por bodega (con una bodega elegida, un solo segmento)."""
    e = consulta_existencias(db, por="bodega", warehouse_id=bodega).subquery("valor_por_bodega")
    filas = (db.query(e.c.warehouse_id, func.max(e.c.bodega), func.coalesce(func.sum(e.c.valorizacion), 0))
             .filter(e.c.rastrear_inventario.is_(True)).group_by(e.c.warehouse_id).all())
    return _dona("bodega", "Valor por bodega", "pesos",
                 [(str(wid), nombre or SIN_BODEGA, dinero(valor)) for wid, nombre, valor in filas])


def _agotadas(db: Session, bodega, salidas) -> int:
    """«Referencias agotadas» (RP51): estado_stock 'agotado' hoy (disponible 0; con la bodega, en esa bodega) y alguna
    salida en los últimos 90 días, sin rastrear_inventario = false. UNA consulta."""
    m = InventoryMovement
    desde = resolver_periodo(PERIODO_AGOTADAS).inicio_utc
    con_salidas = select(m.sku_id).where(m.direction.in_(salidas), m.created_at >= _con_zona(desde))
    if bodega is not None:
        con_salidas = con_salidas.where(m.warehouse_id == bodega)
    e = consulta_existencias(db, por="sku", warehouse_id=bodega).subquery("agotadas")
    return int(db.query(func.count(e.c.sku_id))
               .filter(e.c.rastrear_inventario.is_(True), e.c.estado_stock == _AGOTADO, e.c.sku_id.in_(con_salidas))
               .scalar() or 0)


def _ultimos_movimientos(db: Session, periodo: Periodo, bodega) -> list:
    """Los MAX_MOVIMIENTOS más recientes del período con una dirección que cuenta (entradas, salidas, ajustes y
    traslados): título por dirección, detalle 'SKU · producto · bodega', la cantidad en unidades con su signo, el
    documento de origen como número y doc_tipo 'KARDEX'. UNA consulta con LIMIT."""
    m = InventoryMovement
    filas = (_movimientos(db, bodega)
             .filter(en_rango(m.created_at, periodo.inicio_utc, periodo.fin_utc),
                     m.direction.in_(DIRECCIONES_QUE_CUENTAN))
             .outerjoin(InventoryOperation, InventoryOperation.id == m.operation_id)
             .outerjoin(Product, Product.id == ProductSKU.product_id)
             .outerjoin(Warehouse, Warehouse.id == m.warehouse_id)
             .with_entities(m.id, m.direction, m.quantity, m.created_at, ProductSKU.sku, Product.name, Warehouse.name,
                            InventoryOperation.source_document_numero)
             .order_by(m.created_at.desc(), m.id.desc()).limit(MAX_MOVIMIENTOS).all())
    return [{"tipo": DOC_TIPO, "numero": numero, "titulo": TITULOS[direccion],
             "detalle": " · ".join(p for p in (sku, producto, nombre_bodega) if p), "fecha": iso_z(cuando),
             "monto": _numero(cantidad), "formato": "unidades", "signo": "+" if direccion in ENTRADAS_KARDEX else "-",
             "estado_etiqueta": None, "doc_tipo": DOC_TIPO, "doc_id": id_}
            for id_, direccion, cantidad, cuando, sku, producto, nombre_bodega, numero in filas]


def _ranking(db: Session, periodo: Periodo, bodega, salidas, top: int, total_salidas) -> dict:
    """«Productos que más salen»: las `top` referencias con más unidades de salida en el período (valor), cuántas
    salidas (cantidad), su % de todas las salidas y el detalle 'SKU · $valor al costo' ('SKU · sin costo registrado').
    Desempate por el código del SKU. UNA consulta con GROUP BY y LIMIT."""
    m = InventoryMovement
    unidades = func.coalesce(func.sum(m.quantity), 0)
    filas = (_movimientos(db, bodega)
             .filter(en_rango(m.created_at, periodo.inicio_utc, periodo.fin_utc), m.direction.in_(salidas))
             .outerjoin(Product, Product.id == ProductSKU.product_id)
             .with_entities(ProductSKU.id, ProductSKU.sku, func.max(Product.name), unidades, func.count(m.id),
                            func.coalesce(func.sum(m.quantity * _costo_unitario()), 0), func.max(ProductSKU.cost_price))
             .group_by(ProductSKU.id, ProductSKU.sku)
             .order_by(unidades.desc(), ProductSKU.sku.asc(), ProductSKU.id.desc()).limit(top).all())
    filas_ranking = []
    for posicion, (_, sku, nombre, cuantas, n, valor, costo) in enumerate(filas, start=1):
        detalle = f"{sku} · " + (f"{pesos(valor)} al costo" if costo is not None and costo > 0
                                 else "sin costo registrado")
        filas_ranking.append({"posicion": posicion, "nombre": nombre or sku, "detalle": detalle,
                              "valor": _numero(cuantas), "cantidad": int(n), "pct": _pct(cuantas, total_salidas)})
    return {"titulo": "Productos que más salen", "columna": "Unidades", "formato": "unidades", "filas": filas_ranking}


def _avisos(sin_direccion: int, sin_costo: int) -> list:
    avisos = []
    if sin_direccion:
        avisos.append("1 movimiento sin dirección no se cuenta" if sin_direccion == 1
                      else f"{sin_direccion} movimientos sin dirección no se cuentan")
    if sin_costo:
        avisos.append("1 referencia sin costo registrado" if sin_costo == 1
                      else f"{sin_costo} referencias sin costo registrado")
    return avisos


def analisis_inventario(db: Session, periodo: Periodo, top=TOP_POR_DEFECTO, bodega=None) -> dict:
    """El cuerpo de GET /inventory/analisis: {status: 'success', data} con el contrato único (analisis.respuesta).
    `periodo` es el Periodo de periodos.resolver_periodo; `top` se valida con validar_top (5, 10 o 25; ValueError si no);
    `bodega` (opcional) es el warehouse_id: filtra las existencias y los movimientos.

    - kpis: «Valor del inventario» (pesos: el cierre del período contra el del anterior), «Entradas» y «Salidas»
      (unidades; salidas mejor neutro) y «Referencias agotadas» (foto de hoy, mejor baja).
    - linea: «Valor del inventario» al cierre de cada cubeta. donas: «Valor por categoría» y «Valor por bodega».
    - barras: «Entradas y salidas» (las salidas hacia abajo). movimientos: «Últimos movimientos». ranking: «Productos que
      más salen».
    - avisos: los movimientos que no se cuentan y las referencias sin costo.
    Ocho consultas agregadas."""
    top = validar_top(top)
    entradas, salidas = direcciones_que_cuentan(bodega)
    valor_actual = Decimal(resumen_existencias(db, warehouse_id=bodega)["valor_inventario_cop"])
    cifras = _cifras(db, periodo, bodega, entradas, salidas)
    valor_final = valor_actual - cifras["neto_despues"]
    valor_anterior = valor_final - cifras["neto_desde_cierre_anterior"]
    cubetas = _por_cubeta(db, periodo, bodega, entradas, salidas)
    dona_categoria, sin_costo = _dona_por_categoria(db, bodega)
    e, s = cifras["entradas"], cifras["salidas"]
    kpis = [
        kpi("valor_inventario", "Valor del inventario", valor_final, valor_anterior, "pesos", "sube",
            ayuda="Unidades en bodega por el costo de compra de cada referencia, al cierre del período. Los días "
                  "anteriores se reconstruyen con los movimientos del kardex al costo de hoy."),
        kpi("entradas", "Entradas", e["actual"], e["anterior"], "unidades", "sube",
            ayuda="Unidades que entraron en el período: entradas y ajustes de entrada (con una bodega, también los "
                  "traslados que llegan a ella)."),
        kpi("salidas", "Salidas", s["actual"], s["anterior"], "unidades", "neutro",
            ayuda="Unidades que salieron en el período: salidas y ajustes de salida (con una bodega, también los "
                  "traslados que salen de ella)."),
        kpi("referencias_agotadas", "Referencias agotadas", _agotadas(db, bodega, salidas), None, "entero", "baja",
            es_foto=True,
            ayuda="Referencias sin unidades disponibles hoy que tuvieron salidas en los últimos 90 días."),
    ]
    return respuesta(
        periodo,
        kpis=kpis,
        linea=_linea(periodo, cubetas, valor_final, valor_anterior),
        donas=[dona_categoria, _dona_por_bodega(db, bodega)],
        barras=_barras(periodo, cubetas),
        movimientos={"titulo": "Últimos movimientos", "filas": _ultimos_movimientos(db, periodo, bodega)},
        ranking=_ranking(db, periodo, bodega, salidas, top, s["actual"]),
        filtros={"top": top, "bodega": bodega},
        avisos=_avisos(cifras["sin_direccion"], sin_costo),
    )
