"""El Análisis de Finanzas en el servidor (GET /finance/analisis): el Resumen de Finanzas con datos reales.

Bloque 4, T20 (ANALISIS-finanzas puntos 1 y 2; R7, R13, R16, R21; C12; RP29, RP57, RP59, RP60; D34, D44). Ventas y Dinero
recibido son las de Ventas (R7): ventas_por_cubeta y pagos_recibidos_q de core/analisis_ventas.py se usan tal cual, y
Vendido es el mismo filtro (rv.f_pven_con_dinero) sobre los mismos pedidos y las mismas ventanas. Una sola definición por
cifra; si TD-05 cambia el libro de pagos, el ajuste se hace en pagos_recibidos_q.

- Ventas = Σ total_cop de los pedidos creados en el período que no están en ESTADOS_VEN_SIN_DINERO (CANCELADO y
  DEVUELTO_TOTAL).
- Dinero recibido = Σ monto de pagos_recibidos_q (pagos CONFIRMADO o TRASLADADO de un tipo de ingreso y un método que no es
  TRASLADO, SALDO_A_FAVOR ni CONVERSION_COTIZACION), por la `fecha` del pago (días de Colombia).
- Gastos = Σ OperationalExpense.amount con `incurred_date` en el período, en hora de Colombia: el campo es UTC sin zona y
  los bordes son los del Periodo (un gasto del 2001-01-11 04:30 UTC es del día 10; RP57: el formulario guarda el
  mediodía de Colombia, las 17:00 UTC). La moneda de los gastos es COP (R16).
- Utilidad estimada = Σ (total_cop − total_cost_cop) de los pedidos con dinero del período, menos los gastos. Si algún
  pedido no tiene costo registrado (total_cost_cop = 0) la utilidad sale más alta y se avisa.
- Flujo de caja: entradas = el dinero recibido; salidas = gastos + devoluciones (pagos tipo DEVOLUCION en estado
  CONFIRMADO, por su fecha), como valores NEGATIVOS con tono 'negativo' (D44).
- Clientes con más saldo por cobrar (RP59): una foto de hoy, Σ max(0, saldo_cop) de los pedidos fuera de
  ESTADOS_VEN_SIN_DINERO, por cliente; la suma de todo el ranking es el pven_saldo_por_cobrar de /ventas/stats.
- Movimientos recientes: pagos recibidos (+), gastos y devoluciones (−), los MAX_MOVIMIENTOS más recientes. La fecha de un
  pago o devolución es iso_z(created_at) (RP60); la de un gasto, iso_z(incurred_date).

analisis_finanzas(db, periodo, top) arma el contrato único con analisis.respuesta y hace 12 consultas agregadas (GROUP BY,
SUM y LIMIT) sea cual sea la cantidad de pedidos, pagos o gastos (R13, contador_sql).

Errores: un top que no vale lanza ValueError (el endpoint responde 422 con str(e), R21); un error del contrato es
analisis.ErrorDeContrato (un 500).

Las piezas _barras_por_fecha, _dona, _enteros, _movimiento, _pct y _ranking son las de analisis_ventas.py (privadas, como
las usan analisis_compras.py y analisis_inventario.py): para la revisión final, deberían vivir en core/analisis.py.
"""
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.core import resolucion_ventas as rv
from app.core.analisis import claves_cubetas, dinero, expr_cubeta, kpi, rellenar, respuesta, validar_top, variacion_pct
from app.core.analisis_ventas import (ESTADOS_PAGO_RECIBIDO, _barras_por_fecha, _dona, _enteros, _movimiento, _ranking,
                                      _top_clientes, expr_saldo_por_cobrar, pagos_recibidos_q, ventas_por_cubeta,
                                      ventas_y_pedidos)
from app.core.periodos import Periodo, _ventanas, en_rango
from app.core.textos_actividad import TIPOS_PAGO
from app.models.erp_documents import SaleOrder
from app.models.expenses import OperationalExpense
from app.models.fase4 import SaleOrderPayment

TOP_POR_DEFECTO = 5
MAX_MOVIMIENTOS = 8     # MAX_MOVIMIENTOS de lib/analisis.js
TIPO_PAGO_DEVOLUCION = "DEVOLUCION"
SIN_METODO = "Sin método"
SIN_CATEGORIA = "Sin categoría"


def _aviso_sin_costo(n: int) -> list[str]:
    if not n:
        return []
    if n == 1:
        return ["1 pedido del período no tiene costo registrado: la utilidad sale más alta."]
    return [f"{n} pedidos del período no tienen costo registrado: la utilidad sale más alta."]


def _margen_y_sin_costo(db: Session, periodo: Periodo) -> dict:
    """El margen (total_cop − total_cost_cop) de los pedidos con dinero (R7) de cada ventana, y cuántos pedidos del período
    no tienen costo, en UNA consulta. Las ventas (Vendido) no se calculan aquí: son las de ventas_y_pedidos (m2, m7)."""
    pv = SaleOrder
    actual, anterior = _ventanas(pv.created_at, periodo)
    costo = func.coalesce(pv.total_cost_cop, 0)
    total = func.coalesce(pv.total_cop, 0)

    def suma(valor, ventana):
        return func.coalesce(func.sum(case((ventana, valor), else_=0)), 0)

    fila = (db.query(pv).filter(rv.f_pven_con_dinero(pv), or_(actual, anterior))
            .with_entities(suma(total - costo, actual), suma(total - costo, anterior),
                           func.count(pv.id).filter(actual, costo == 0)).one())
    return {"margen": {"actual": fila[0], "anterior": fila[1]}, "sin_costo": int(fila[2] or 0)}


def _por_cubeta_y_nombre(filas) -> tuple:
    """({día de la cubeta: Σ}, {nombre: Σ}, Σ actual, Σ anterior) de filas (cubeta, nombre, es_actual, monto), con los montos
    al peso. Los nombres se ordenan alfabéticamente: así un empate de la dona no depende del orden en que los entregó la
    base. Las filas del período anterior solo suman a su total (la cubeta y el nombre son los del período)."""
    por_cubeta, por_nombre, total, total_anterior = {}, {}, 0, 0
    for cubeta, nombre, es_actual, monto in sorted(filas, key=lambda f: ((f[1] or ""), f[0])):
        if not es_actual:
            total_anterior += monto
            continue
        total += monto
        por_cubeta[cubeta] = por_cubeta.get(cubeta, 0) + monto
        por_nombre[nombre] = por_nombre.get(nombre, 0) + monto
    return ({dia: dinero(v) for dia, v in por_cubeta.items()}, {n: dinero(v) for n, v in por_nombre.items()},
            dinero(total), dinero(total_anterior))


def _gastos_por_cubeta_y_categoria(db: Session, periodo: Periodo) -> tuple:
    """({día: Σ gastos}, {categoría: Σ gastos}, Σ del período, Σ del anterior), en UNA consulta agrupada por la cubeta de
    Colombia, la categoría y la ventana (actual o anterior)."""
    g = OperationalExpense
    actual, anterior = _ventanas(g.incurred_date, periodo)
    cubeta = expr_cubeta(g.incurred_date, periodo.granularidad)
    categoria = func.coalesce(func.nullif(func.btrim(g.category), ""), SIN_CATEGORIA)
    es_actual = case((actual, 1), else_=0)
    filas = (db.query(g).filter(or_(actual, anterior))
             .with_entities(cubeta, categoria, es_actual, func.coalesce(func.sum(g.amount), 0))
             .group_by(cubeta, categoria, es_actual).all())
    return _por_cubeta_y_nombre(filas)


def _recibido_por_cubeta_y_medio(db: Session, periodo: Periodo) -> tuple:
    """({día: Σ recibido}, {medio de pago: Σ recibido}, Σ del período, Σ del anterior), con pagos_recibidos_q, en UNA
    consulta agrupada por la cubeta, el medio y la ventana."""
    pago = SaleOrderPayment
    actual, anterior = _ventanas(pago.fecha, periodo)
    cubeta = expr_cubeta(pago.fecha, periodo.granularidad)
    medio = func.coalesce(func.nullif(func.btrim(pago.metodo_pago), ""), SIN_METODO)
    es_actual = case((actual, 1), else_=0)
    filas = (pagos_recibidos_q(db, periodo.anterior_desde, periodo.hasta).filter(or_(actual, anterior))
             .with_entities(cubeta, medio, es_actual, func.coalesce(func.sum(pago.monto), 0))
             .group_by(cubeta, medio, es_actual).all())
    return _por_cubeta_y_nombre(filas)


def _devoluciones_q(db: Session, periodo: Periodo):
    """Las devoluciones de dinero del período: pagos tipo DEVOLUCION en estado CONFIRMADO o TRASLADADO
    (ESTADOS_PAGO_RECIBIDO, el criterio de T6C r1: un saldo trasladado movió dinero), por su fecha (días de Colombia)."""
    pago = SaleOrderPayment
    return db.query(pago).filter(pago.tipo == TIPO_PAGO_DEVOLUCION, pago.estado.in_(ESTADOS_PAGO_RECIBIDO),
                                 pago.fecha >= periodo.desde, pago.fecha <= periodo.hasta)


def _devoluciones_por_cubeta(db: Session, periodo: Periodo) -> dict:
    pago = SaleOrderPayment
    cubeta = expr_cubeta(pago.fecha, periodo.granularidad)
    filas = _devoluciones_q(db, periodo).with_entities(cubeta, func.coalesce(func.sum(pago.monto), 0)).group_by(cubeta).all()
    return {dia: dinero(v) for dia, v in filas}


def _linea(periodo: Periodo, ventas: dict, gastos: dict, total, total_anterior) -> dict:
    """«Ventas y gastos»: dos series del período (sin la del período anterior); el total y la variación son los de Ventas."""
    return {
        "titulo": "Ventas y gastos",
        "formato": "pesos",
        "fechas": [dia.isoformat() for dia in claves_cubetas(periodo)],
        "series": [
            {"clave": "ventas", "etiqueta": "Ventas", "valores": _enteros(rellenar(ventas, periodo)),
             "es_anterior": False},
            {"clave": "gastos", "etiqueta": "Gastos", "valores": _enteros(rellenar(gastos, periodo)),
             "es_anterior": False},
        ],
        "total": total,
        "total_anterior": total_anterior,
        "variacion_pct": variacion_pct(total, total_anterior),
    }


def _flujo_de_caja(periodo: Periodo, entradas: dict, gastos: dict, devoluciones: dict) -> dict:
    """Barras apiladas por día: las entradas (+) arriba y las salidas (gastos + devoluciones, en NEGATIVO) abajo."""
    salidas = {dia: -(gastos.get(dia, 0) + devoluciones.get(dia, 0)) for dia in set(gastos) | set(devoluciones)}
    barras = _barras_por_fecha("Flujo de caja", "pesos", periodo,
                               [("entradas", "Entradas", entradas, "positivo"),
                                ("salidas", "Salidas", salidas, "negativo")])
    barras["apiladas"] = True
    return barras


def _movimientos(db: Session, periodo: Periodo) -> list:
    """Los MAX_MOVIMIENTOS más recientes del período entre los pagos recibidos (tipo 'PAGO', +), los gastos (tipo 'GASTO',
    −) y las devoluciones (tipo 'DEVOLUCION', −). Pagos y devoluciones abren su pedido (doc_tipo 'PVEN'); un gasto, la
    pantalla de Gastos (doc_tipo 'GASTO'). Tres consultas con LIMIT."""
    pago, pedido, gasto = SaleOrderPayment, SaleOrder, OperationalExpense
    campos = (pago.tipo, pago.monto, pago.created_at, pedido.id, pedido.numero, pedido.customer_name)
    orden = (pago.created_at.desc().nulls_last(), pago.id.desc())
    pagos = (pagos_recibidos_q(db, periodo.desde, periodo.hasta).join(pedido, pedido.id == pago.sale_order_id)
             .with_entities(*campos).order_by(*orden).limit(MAX_MOVIMIENTOS).all())
    devoluciones = (_devoluciones_q(db, periodo).join(pedido, pedido.id == pago.sale_order_id)
                    .with_entities(*campos).order_by(*orden).limit(MAX_MOVIMIENTOS).all())
    gastos = (db.query(gasto).filter(en_rango(gasto.incurred_date, periodo.inicio_utc, periodo.fin_utc))
              .with_entities(gasto.id, gasto.category, gasto.description, gasto.amount, gasto.incurred_date)
              .order_by(gasto.incurred_date.desc().nulls_last(), gasto.id.desc()).limit(MAX_MOVIMIENTOS).all())
    filas = [(creado, _movimiento("PAGO", numero, TIPOS_PAGO.get(tipo, tipo), cliente, creado, monto, "+", None,
                                  "PVEN", pedido_id))
             for tipo, monto, creado, pedido_id, numero, cliente in pagos]
    filas += [(creado, _movimiento("DEVOLUCION", numero, TIPOS_PAGO.get(tipo, tipo), cliente, creado, monto, "-", None,
                                   "PVEN", pedido_id))
              for tipo, monto, creado, pedido_id, numero, cliente in devoluciones]
    filas += [(cuando, _movimiento("GASTO", None, (categoria or "").strip() or SIN_CATEGORIA,
                                   (descripcion or "").strip() or None, cuando, monto, "-", None, "GASTO", id_))
              for id_, categoria, descripcion, monto, cuando in gastos]
    filas.sort(key=lambda f: (f[0] is not None, f[0]), reverse=True)
    return [m for _, m in filas[:MAX_MOVIMIENTOS]]


def _ranking_de_cartera(db: Session, top: int) -> dict:
    """«Clientes con más saldo por cobrar» (RP59): Σ max(0, saldo_cop) de los pedidos con dinero, por cliente. Usa
    _top_clientes de analisis_ventas (la identidad del cliente es COALESCE(customer_id, customer_name), una sola regla) sobre
    los pedidos con dinero que deben algo; el total del % es la cartera completa, la misma consulta escalar de
    pven_saldo_por_cobrar de _foco_pven (y de /ventas/stats)."""
    pv = SaleOrder
    saldo = func.coalesce(func.sum(expr_saldo_por_cobrar(pv)), 0)
    con_dinero = db.query(pv).filter(rv.f_pven_con_dinero(pv))
    filas = _top_clientes(con_dinero.filter(pv.saldo_cop > 0), pv, saldo, top)
    total = dinero(con_dinero.order_by(None).with_entities(saldo).scalar())
    return _ranking("Clientes con más saldo por cobrar", "Saldo", "pesos",
                    [(n, dinero(v), c) for n, v, c in filas], total, "pedido", "pedidos")


def analisis_finanzas(db: Session, periodo: Periodo, top=TOP_POR_DEFECTO) -> dict:
    """El cuerpo completo de GET /finance/analisis (analisis.respuesta): 4 indicadores (Ventas, Dinero recibido, Gastos y
    Utilidad estimada, cada uno con su % contra el período anterior), la línea «Ventas y gastos», las donas «Gastos por
    categoría» y «Dinero recibido por medio de pago», las barras «Flujo de caja», los «Movimientos recientes» y el
    ranking de cartera. `periodo` es un Periodo de core/periodos.py; `top` (5, 10 o 25) es el tamaño del ranking."""
    top = validar_top(top)
    vp = ventas_y_pedidos(db, periodo)
    base = _margen_y_sin_costo(db, periodo)
    gastos_por_dia, gastos_por_categoria, gastos_actual, gastos_anterior = _gastos_por_cubeta_y_categoria(db, periodo)
    recibido_por_dia, recibido_por_medio, recibido_actual, recibido_anterior = _recibido_por_cubeta_y_medio(db, periodo)
    devoluciones = _devoluciones_por_cubeta(db, periodo)
    ventas_por_dia = ventas_por_cubeta(db, periodo)

    ventas, ventas_ant = dinero(vp["vendido"]["actual"]), dinero(vp["vendido"]["anterior"])
    utilidad = dinero(base["margen"]["actual"]) - gastos_actual
    utilidad_ant = dinero(base["margen"]["anterior"]) - gastos_anterior
    kpis = [
        kpi("ventas", "Ventas", ventas, ventas_ant, "pesos",
            ayuda="Pedidos creados en el período, sin cancelados ni devueltos."),
        kpi("dinero_recibido", "Dinero recibido", recibido_actual, recibido_anterior, "pesos",
            ayuda="Pagos confirmados del período. No cuenta el saldo trasladado ni los pagos sin verificar."),
        kpi("gastos", "Gastos", gastos_actual, gastos_anterior, "pesos", mejor="baja",
            ayuda="Gastos operativos del período, en pesos colombianos."),
        kpi("utilidad", "Utilidad estimada", utilidad, utilidad_ant, "pesos",
            ayuda="Lo vendido menos su costo, menos los gastos del período."),
    ]
    donas = [
        _dona("gastos_por_categoria", "Gastos por categoría", "pesos",
              [(c, c, v) for c, v in sorted(gastos_por_categoria.items())]),
        _dona("recibido_por_medio", "Dinero recibido por medio de pago", "pesos",
              [(m, m, v) for m, v in sorted(recibido_por_medio.items())]),
    ]
    return respuesta(
        periodo,
        kpis=kpis,
        linea=_linea(periodo, ventas_por_dia, gastos_por_dia, ventas, ventas_ant),
        donas=donas,
        barras=_flujo_de_caja(periodo, recibido_por_dia, gastos_por_dia, devoluciones),
        movimientos={"titulo": "Movimientos recientes", "filas": _movimientos(db, periodo)},
        ranking=_ranking_de_cartera(db, top),
        filtros={"top": top},
        avisos=_aviso_sin_costo(base["sin_costo"]),
    )
