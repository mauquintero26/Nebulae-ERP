"""El Análisis de Compras en el servidor (GET /compras/analisis) y las cifras de /compras/stats y de la lista de Pedidos de
compra.

Bloque 4, T12 (ANALISIS-compras puntos 1 y 2; KPI-compras punto 2; R7, R9, R13, R21; C10, C12; RP1, RP29, RP40, RP43; D34,
D44). Un solo lugar para las reglas de dinero y de avance de Compras, que usan /compras/stats (sus tarjetas y el bloque
flujo), el resumen de GET /compras/pedidos y el Análisis:

- «Comprado» (RP43): Σ total_cop de los pedidos de compra cuya fecha, COALESCE(fecha_compra, created_at) (fecha_de_compra),
  cae en el período, sin BORRADOR ni CANCELADO (filtro_comprado). «Pedidos de compra» = cuántos son. Un estado
  desconocido sí suma (R9: cuenta como emitido).
- Las cifras de las tarjetas (cifras_pec), con las etapas de core/estados_compras.py (R9): activos = emitido + en
  tránsito + en bodega; vigentes = todo menos cancelado; recibidos = recepción confirmada (RECIBIDA y COMPLETADO);
  vencidos = cond_vencido (RP40: emitido o en tránsito con el día de entrega anterior a hoy en Colombia, sin tolerancia);
  cumplimiento_pct = recibidos / (activos + recibidos) × 100 con 1 decimal (cumplimiento_compras = «Pedidos de compra
  recibidos sobre los emitidos»).
- % entregas a tiempo: las recepciones confirmadas (COMPLETADA y COMPLETADA_LOGISTICA, GRUPOS_RECEPCION) con
  fecha_recepcion en el período cuyo pedido de compra tiene fecha de entrega estimada. Es a tiempo si el día de la
  recepción es ≤ el prometido + TOLERANCIA_A_TIEMPO_DIAS (1). B4 T24 (FINAL-m6): el día de la recepción es el de
  Colombia (dia_colombia, R7, como las barras); el prometido sigue con .date() (RP40). _gr_dict de erp_compras.py hace lo
  mismo, para que el Hub y la Mesa de Recepciones no se contradigan (r1, m11: la regla vive en expr_limite_a_tiempo y
  expr_dias_retraso, y _gr_dict usa la misma constante; si se cambia una, hay que cambiar la otra). Una recepción sin
  pedido de compra no tiene fecha prometida.
- Días promedio de entrega: día de la recepción − día del pedido de compra (fecha_de_compra), los dos de Colombia
  (FINAL-m6), con 1 decimal y nunca negativo; solo las recepciones confirmadas del período con pedido de compra.
- Los días de los períodos son de Colombia (los bordes del Periodo de core/periodos.py y las cubetas de expr_cubeta,
  ZONA_COLOMBIA, RP1). Los montos van en pesos enteros (analisis.dinero). Las fechas de los movimientos, con fechas.iso_z.

analisis_compras(db, periodo, top) arma el contrato único con analisis.respuesta y hace un número fijo de consultas
agregadas (12, más la de la sesión): nunca recorre filas en Python ni depende de cuántos documentos haya (R13).

Errores: un top que no vale lanza ValueError con el texto en español (el endpoint responde 422 con str(e), R21); un
error del contrato es analisis.ErrorDeContrato (un 500).
"""
from decimal import Decimal

from sqlalchemy import Date, and_, case, cast, func, or_
from sqlalchemy.orm import Session

from app.core.analisis import dinero, expr_cubeta, expr_local, kpi, respuesta, validar_top, variacion_pct
# r1 (m17): las piezas del contrato que ya existen se importan, no se copian. _pct, _cantidad, _dona, _movimiento,
# _linea y _barras_por_fecha (que usan el mismo _enteros) son las de analisis_ventas.py (privadas, como D-9; para la
# revisión final: deberían vivir en core/analisis.py) y _ventanas, la de core/periodos.py.
from app.core.analisis_ventas import _barras_por_fecha, _cantidad, _dona, _linea, _movimiento, _pct
# B4 T24 (B19): ESTADOS_SIN_DINERO_PEC (RP43: no suman a «Comprado») vive en la fuente única.
from app.core.estados_compras import (ESTADOS_SIN_DINERO_PEC, ETAPAS_PEC, GRUPOS_PEC, GRUPOS_RECEPCION, cond_vencido,
                                      en_estados_pec, etapa_pec)
from app.core.periodos import Periodo, _ventanas, contar_en, sumar_en
from app.core.textos_actividad import etiqueta_estado
from app.models.erp_documents import GoodsReceipt, PurchaseOrderFull

TOP_POR_DEFECTO = 5
MAX_MOVIMIENTOS = 8           # MAX_MOVIMIENTOS de lib/analisis.js
ESTADOS_RECEPCION_CONFIRMADA = GRUPOS_RECEPCION["confirmadas"]   # COMPLETADA y COMPLETADA_LOGISTICA
TOLERANCIA_A_TIEMPO_DIAS = 1  # la de _gr_dict (erp_compras.py): llegar un día después de lo prometido es a tiempo
SIN_PROVEEDOR = "Sin proveedor"


# ─── Las reglas que comparten /compras/stats, la lista de Pedidos de compra y el Análisis ───────────────────────────

def fecha_de_compra(pec=PurchaseOrderFull):
    """La fecha de un pedido de compra en los períodos (R7, RP43): COALESCE(fecha_compra, created_at)."""
    return func.coalesce(pec.fecha_compra, pec.created_at)


def filtro_comprado(pec=PurchaseOrderFull):
    """Los pedidos de compra que suman dinero (RP43): ni BORRADOR ni CANCELADO."""
    return pec.estado.notin_(ESTADOS_SIN_DINERO_PEC)


def cumplimiento_pct(recibidos, activos):
    """recibidos / (activos + recibidos) × 100 con 1 decimal (R9); None si no hay ninguno (nunca se inventa un 0)."""
    total = (recibidos or 0) + (activos or 0)
    if not total:
        return None
    return round(float(recibidos or 0) / float(total) * 100, 1)


def cifras_pec(q, hoy) -> dict:
    """Las cifras de los pedidos de compra de `q` (un Query de PurchaseOrderFull ya filtrado), en UNA consulta agrupada
    por estado: total, por_estado, borradores, activos, en_transito, en_bodega, recibidos, cancelados, vigentes,
    vencidos (cond_vencido con `hoy`, el día de hoy en Colombia), monto_cop (Σ total_cop de los vigentes),
    monto_por_recibir_cop (Σ total_cop de los activos) y cumplimiento_pct. Cada estado va a su etapa con etapa_pec (un
    estado desconocido cuenta como emitido, la misma regla de cond_estados_pec); activos y vigentes son los de
    GRUPOS_PEC (en_estados_pec). Los montos, en pesos enteros."""
    pec = PurchaseOrderFull
    filas = (q.order_by(None).enable_eagerloads(False)
             .with_entities(pec.estado, func.count(pec.id), func.coalesce(func.sum(pec.total_cop), 0),
                            func.count(pec.id).filter(cond_vencido(pec.estado, pec.fecha_entrega_estimada, hoy)))
             .group_by(pec.estado).all())
    por_estado, cuantos, vencidos = {}, {e: 0 for e in ETAPAS_PEC}, 0
    grupos = {g: [0, Decimal(0)] for g in ("activos", "vigentes")}   # [cuántos, monto]
    for estado, n, monto, n_vencidos in filas:
        n, monto = int(n), Decimal(monto or 0)
        por_estado[estado] = n
        cuantos[etapa_pec(estado)] += n
        for grupo, acumulado in grupos.items():
            if en_estados_pec(estado, GRUPOS_PEC[grupo]):
                acumulado[0] += n
                acumulado[1] += monto
        vencidos += int(n_vencidos or 0)
    activos, vigentes = grupos["activos"][0], grupos["vigentes"][0]
    return {
        "total": sum(cuantos.values()),
        "por_estado": por_estado,
        "borradores": cuantos["borrador"],
        "activos": activos,
        "en_transito": cuantos["en_transito"],
        "en_bodega": cuantos["en_bodega"],
        "recibidos": cuantos["recibido"],
        "cancelados": cuantos["cancelado"],
        "vigentes": vigentes,
        "vencidos": vencidos,
        "monto_cop": dinero(grupos["vigentes"][1]),
        "monto_por_recibir_cop": dinero(grupos["activos"][1]),
        "cumplimiento_pct": cumplimiento_pct(cuantos["recibido"], activos),
    }


def _comprados(db: Session):
    return db.query(PurchaseOrderFull).filter(filtro_comprado())


def comprado_y_pedidos(db: Session, periodo: Periodo) -> dict:
    """{'comprado': {actual, anterior} (Decimal, sin redondear), 'pedidos': {actual, anterior}}: «Comprado» y «Pedidos de
    compra» de cada ventana, con sumar_en y contar_en de core/periodos.py sobre fecha_de_compra (dos consultas)."""
    q = _comprados(db)
    return {"comprado": sumar_en(q, fecha_de_compra(), PurchaseOrderFull.total_cop, periodo),
            "pedidos": contar_en(q, fecha_de_compra(), periodo)}


def _par(actual, anterior) -> dict:
    return {"actual": actual, "anterior": anterior, "variacion_pct": variacion_pct(actual, anterior)}


def flujo_compras(db: Session, periodo: Periodo) -> dict:
    """El bloque 'flujo' de /compras/stats (R7, RP43): comprado_cop (pesos enteros) y pec_nuevos, cada uno {actual,
    anterior, variacion_pct} con la regla de analisis.variacion_pct (None si el anterior es 0 y el actual no: «Nuevo»).
    El % se muestra en gris: «Comprado» no es bueno ni malo. Dos consultas."""
    cp = comprado_y_pedidos(db, periodo)
    return {
        "comprado_cop": _par(dinero(cp["comprado"]["actual"]), dinero(cp["comprado"]["anterior"])),
        "pec_nuevos": _par(cp["pedidos"]["actual"], cp["pedidos"]["anterior"]),
    }


# ─── Piezas del Análisis ──────────────────────────────────────────────────────────────────────────────────────────

def _texto_pct(valor) -> str:
    """'66,7 %' y '100 %' (el formato de porcentaje de R7: coma decimal y un espacio antes de %)."""
    texto = f"{valor:.1f}".replace(".", ",")
    return f"{texto[:-2] if texto.endswith(',0') else texto} %"


def _nombre_proveedor(pec=PurchaseOrderFull):
    """El proveedor escrito en el pedido de compra, sin espacios en los bordes; 'Sin proveedor' si no tiene."""
    return func.coalesce(func.nullif(func.btrim(pec.supplier_name), ""), SIN_PROVEEDOR)


def _clave_proveedor(pec=PurchaseOrderFull):
    """(supplier_id, nombre si no hay supplier_id): la ficha del proveedor si la tiene y, si no, el nombre escrito."""
    return pec.supplier_id, case((pec.supplier_id.is_(None), _nombre_proveedor(pec)))


def _clave_de_fila(supplier_id, nombre) -> tuple:
    return (supplier_id, None if supplier_id is not None else nombre)


def _por_cubeta(q, col_fecha, valor, periodo: Periodo, anterior=False) -> dict:
    """{día de la cubeta: valor} de las filas de `q` en la ventana (o en la anterior), en UNA consulta con GROUP BY."""
    actual, ant = _ventanas(col_fecha, periodo)
    cubeta = expr_cubeta(col_fecha, periodo.granularidad)
    filas = (q.order_by(None).filter(ant if anterior else actual)
             .with_entities(cubeta, valor).group_by(cubeta).all())
    return {dia: v for dia, v in filas}


def _recepciones(db: Session):
    """Las recepciones confirmadas con su pedido de compra (si lo tienen): GoodsReceipt LEFT JOIN purchase_orders_full."""
    gr, pec = GoodsReceipt, PurchaseOrderFull
    return (db.query(gr).outerjoin(pec, pec.id == gr.pec_id)
            .filter(gr.estado.in_(ESTADOS_RECEPCION_CONFIRMADA)))


def expr_limite_a_tiempo(pec=PurchaseOrderFull):
    """El último día a tiempo de una entrega, en SQL: el día prometido (cast a date, como el .date() de _gr_dict) +
    TOLERANCIA_A_TIEMPO_DIAS. r1 (m11): la regla del retraso vive aquí; la usan el Análisis, el orden 'retraso' de
    GET /compras/recepciones y, con la misma constante, _gr_dict."""
    return cast(pec.fecha_entrega_estimada, Date) + TOLERANCIA_A_TIEMPO_DIAS


def dia_colombia(col):
    """B4 T24 (FINAL-m6): el día de Colombia (R7, core/fechas) de un instante UTC guardado, en SQL. Las barras ya agrupan
    por ese día (expr_cubeta); los KPI de entrega y el retraso tomaban el día UTC, y una recepción confirmada a las 20:00
    de Colombia del último día a tiempo (01:00 UTC del siguiente) contaba como tardía."""
    return cast(expr_local(col), Date)


def expr_dias_retraso(gr=GoodsReceipt, pec=PurchaseOrderFull):
    """El dias_retraso de _gr_dict en SQL: día (de Colombia, FINAL-m6) de la recepción − expr_limite_a_tiempo, solo si es
    > 0; NULL si llegó a tiempo, si el PEC no tiene fecha prometida o si la recepción no tiene fecha."""
    dias = dia_colombia(gr.fecha_recepcion) - expr_limite_a_tiempo(pec)
    return case((dias > 0, dias))


def _reglas_de_entrega():
    """(a tiempo, con retraso, sin fecha prometida, días de entrega, días de retraso) de una recepción, en SQL (ver el
    docstring del módulo: el día de Colombia de la recepción, como _gr_dict). Los días de entrega nunca son negativos; sin la
    fecha del PEC no hay días (el promedio filtra con fecha_de_compra, r1 m9: GREATEST ignora el NULL)."""
    gr, pec = GoodsReceipt, PurchaseOrderFull
    dia_recepcion = dia_colombia(gr.fecha_recepcion)   # B4 T24 (FINAL-m6): el día de Colombia, como las barras
    limite = expr_limite_a_tiempo(pec)
    con_fecha = pec.fecha_entrega_estimada.isnot(None)
    a_tiempo = and_(con_fecha, dia_recepcion <= limite)
    tarde = and_(con_fecha, dia_recepcion > limite)
    sin_fecha = pec.fecha_entrega_estimada.is_(None)
    dias_entrega = func.greatest(dia_recepcion - dia_colombia(fecha_de_compra(pec)), 0)
    return a_tiempo, tarde, sin_fecha, dias_entrega, expr_dias_retraso(gr, pec)


def _kpis_de_entregas(db: Session, periodo: Periodo) -> dict:
    """{'a_tiempo_pct': {actual, anterior}, 'dias': {actual, anterior}, 'sin_fecha': n del período} en UNA consulta."""
    gr, pec = GoodsReceipt, PurchaseOrderFull
    a_tiempo, _, sin_fecha, dias_entrega, _ = _reglas_de_entrega()
    actual, anterior = _ventanas(gr.fecha_recepcion, periodo)
    con_fecha = pec.fecha_entrega_estimada.isnot(None)
    columnas = []
    for ventana in (actual, anterior):
        columnas += [func.count(gr.id).filter(and_(ventana, con_fecha)),
                     func.count(gr.id).filter(and_(ventana, a_tiempo)),
                     func.avg(dias_entrega).filter(and_(ventana, fecha_de_compra(pec).isnot(None)))]
    columnas.append(func.count(gr.id).filter(and_(actual, sin_fecha)))
    fila = _recepciones(db).filter(or_(actual, anterior)).with_entities(*columnas).one()
    dias = [None if v is None else round(float(v), 1) for v in (fila[2], fila[5])]
    return {"a_tiempo_pct": {"actual": _pct(fila[1], fila[0]), "anterior": _pct(fila[4], fila[3])},
            "dias": {"actual": dias[0], "anterior": dias[1]},
            "sin_fecha": int(fila[6] or 0)}


def _dona_por_proveedor(db: Session, periodo: Periodo) -> dict:
    """«Por proveedor»: Σ total_cop de lo comprado en el período, por proveedor (su ficha o el nombre escrito; sin
    nombre, 'Sin proveedor'). Una consulta."""
    pec = PurchaseOrderFull
    actual, _ = _ventanas(fecha_de_compra(), periodo)
    clave = _clave_proveedor()
    filas = (_comprados(db).filter(actual)
             .with_entities(*clave, func.max(_nombre_proveedor()), func.coalesce(func.sum(pec.total_cop), 0))
             .group_by(*clave).all())
    return _dona("proveedor", "Por proveedor", "pesos",
                 [(str(sid) if sid is not None else nombre, nombre, dinero(monto))
                  for sid, _, nombre, monto in filas])


def _dona_por_estado(db: Session, periodo: Periodo) -> dict:
    """«Por estado»: cuántos pedidos de compra del período hay en cada estado, TODOS (también BORRADOR, CANCELADO,
    RECIBIDA y PARCIALMENTE_RECIBIDA), con su etiqueta de textos_actividad. Una consulta."""
    pec = PurchaseOrderFull
    actual, _ = _ventanas(fecha_de_compra(), periodo)
    filas = (db.query(pec.estado, func.count(pec.id)).filter(actual).group_by(pec.estado).all())
    return _dona("estado", "Por estado", "entero", [(e, etiqueta_estado("PEC", e), int(n)) for e, n in filas])


def _barras_de_entregas(db: Session, periodo: Periodo) -> dict:
    """«Recepciones a tiempo y con retraso», por la fecha de la recepción y apiladas: a tiempo, con retraso y sin fecha
    prometida. D44: 'con retraso' no es una salida, así que va en 'neutro' (no 'negativo'); con una serie 'positivo' en
    el gráfico, todas llevan tono. Una consulta."""
    gr = GoodsReceipt
    a_tiempo, tarde, sin_fecha, _, _ = _reglas_de_entrega()
    actual, _ = _ventanas(gr.fecha_recepcion, periodo)
    cubeta = expr_cubeta(gr.fecha_recepcion, periodo.granularidad)
    filas = (_recepciones(db).filter(actual)
             .with_entities(cubeta, func.count(gr.id).filter(a_tiempo), func.count(gr.id).filter(tarde),
                            func.count(gr.id).filter(sin_fecha))
             .group_by(cubeta).all())
    por_serie = ({}, {}, {})
    for dia, *cuantos in filas:
        for i, n in enumerate(cuantos):
            por_serie[i][dia] = int(n or 0)
    barras = _barras_por_fecha("Recepciones a tiempo y con retraso", "entero", periodo,
                               [("a_tiempo", "A tiempo", por_serie[0], "positivo"),
                                ("con_retraso", "Con retraso", por_serie[1], "neutro"),
                                ("sin_fecha", "Sin fecha prometida", por_serie[2], "neutro")])
    barras["apiladas"] = True   # la de Ventas no apila; aquí van una encima de otra
    return barras


def _movimientos(db: Session, periodo: Periodo) -> list:
    """Los MAX_MOVIMIENTOS más recientes del período entre lo comprado (tipo y doc_tipo 'PEC', con su monto) y las
    recepciones confirmadas (tipo y doc_tipo 'ENINV', sin monto, con «llegó N días tarde» si llegó después del día
    prometido + 1, el dias_retraso de _gr_dict). Dos consultas con LIMIT."""
    gr, pec = GoodsReceipt, PurchaseOrderFull
    fecha = fecha_de_compra()
    actual_pec, _ = _ventanas(fecha, periodo)
    compras = (_comprados(db).filter(actual_pec)
               .with_entities(pec.id, pec.numero, _nombre_proveedor(), pec.estado, pec.total_cop, fecha)
               .order_by(fecha.desc().nulls_last(), pec.id.desc()).limit(MAX_MOVIMIENTOS).all())
    _, _, _, _, dias_retraso = _reglas_de_entrega()
    actual_gr, _ = _ventanas(gr.fecha_recepcion, periodo)
    recepciones = (_recepciones(db).filter(actual_gr)
                   .with_entities(gr.id, gr.numero, func.coalesce(func.nullif(func.btrim(gr.supplier_name), ""),
                                                                  _nombre_proveedor()),
                                  gr.estado, gr.fecha_recepcion, dias_retraso)
                   .order_by(gr.fecha_recepcion.desc().nulls_last(), gr.id.desc()).limit(MAX_MOVIMIENTOS).all())
    # El _movimiento de analisis_ventas.py, sin signo (ni las compras ni las recepciones son una entrada o una salida).
    filas = [(cuando, _movimiento("PEC", numero, "Pedido de compra", proveedor, cuando, total, None,
                                  etiqueta_estado("PEC", estado), "PEC", id_))
             for id_, numero, proveedor, estado, total, cuando in compras]
    for id_, numero, proveedor, estado, cuando, retraso in recepciones:
        detalle = proveedor if not retraso else (
            f"{proveedor} · llegó {_cantidad(int(retraso), 'día', 'días')} tarde")
        filas.append((cuando, _movimiento("ENINV", numero, "Recepción", detalle, cuando, None, None,
                                          etiqueta_estado("ENINV", estado), "ENINV", id_)))
    filas.sort(key=lambda f: f[0], reverse=True)
    return [m for _, m in filas[:MAX_MOVIMIENTOS]]


def _ranking(db: Session, periodo: Periodo, top: int, total) -> dict:
    """«Proveedores principales»: los `top` proveedores con más dinero comprado en el período (valor), cuántos pedidos
    (cantidad), su % del total y el detalle 'N pedidos · 80 % a tiempo' (las recepciones confirmadas del período de sus
    pedidos con fecha prometida; sin ninguna, solo 'N pedidos'). Dos consultas: el ranking con LIMIT y el % a tiempo de
    todos los proveedores agrupado."""
    gr, pec = GoodsReceipt, PurchaseOrderFull
    actual, _ = _ventanas(fecha_de_compra(), periodo)
    clave = _clave_proveedor()
    valor = func.coalesce(func.sum(pec.total_cop), 0)
    nombre = func.max(_nombre_proveedor())
    # B4 T24 (FINAL-m5): desempate final por la clave del grupo (supplier_id, sin ficha al final).
    filas = (_comprados(db).filter(actual)
             .with_entities(*clave, nombre, valor, func.count(pec.id))
             .group_by(*clave).order_by(valor.desc(), nombre.asc(), clave[0].asc().nulls_last(), clave[1].asc())
             .limit(top).all())
    a_tiempo, _, _, _, _ = _reglas_de_entrega()
    actual_gr, _ = _ventanas(gr.fecha_recepcion, periodo)
    entregas = {_clave_de_fila(sid, n): (int(con_fecha), int(bien)) for sid, _, n, con_fecha, bien in (
        _recepciones(db).filter(actual_gr, pec.fecha_entrega_estimada.isnot(None))
        .with_entities(*clave, func.max(_nombre_proveedor()), func.count(gr.id), func.count(gr.id).filter(a_tiempo))
        .group_by(*clave).all())}
    filas_ranking = []
    for posicion, (sid, _, n, monto, cuantos) in enumerate(filas, start=1):
        detalle = _cantidad(int(cuantos), "pedido", "pedidos")
        con_fecha, bien = entregas.get(_clave_de_fila(sid, n), (0, 0))
        if con_fecha:
            detalle += f" · {_texto_pct(_pct(bien, con_fecha))} a tiempo"
        filas_ranking.append({"posicion": posicion, "nombre": n, "detalle": detalle, "valor": dinero(monto),
                              "cantidad": int(cuantos), "pct": _pct(dinero(monto), total)})
    return {"titulo": "Proveedores principales", "columna": "Comprado", "formato": "pesos", "filas": filas_ranking}


def _avisos(sin_fecha: int) -> list:
    if not sin_fecha:
        return []
    if sin_fecha == 1:
        return ["1 recepción no cuenta para «a tiempo» porque su pedido de compra no tiene fecha de entrega estimada."]
    return [f"{sin_fecha} recepciones no cuentan para «a tiempo» porque su pedido de compra no tiene fecha de entrega "
            "estimada."]


def analisis_compras(db: Session, periodo: Periodo, top=TOP_POR_DEFECTO) -> dict:
    """El cuerpo de GET /compras/analisis: {status: 'success', data} con el contrato único (analisis.respuesta).
    `periodo` es el Periodo de periodos.resolver_periodo; `top` se valida con validar_top (5, 10 o 25; ValueError si no).

    - kpis: «Comprado» (pesos, mejor neutro: el % va en gris), «Pedidos de compra» (entero, neutro), «% entregas a
      tiempo» (porcentaje, sube) y «Días promedio de entrega» (días, baja), cada uno con el período anterior.
    - linea: «Compras en el tiempo» (lo comprado por cubeta, con el período anterior).
    - donas: «Por proveedor» (pesos) y «Por estado» (todos los estados, cuántos).
    - barras: «Recepciones a tiempo y con retraso» (apiladas por fecha).
    - movimientos: «Últimas compras y recepciones». ranking: «Proveedores principales».
    - avisos: cuántas recepciones no cuentan para «a tiempo» porque su pedido de compra no tiene fecha prometida.
    Doce consultas agregadas, sin importar cuántos documentos haya."""
    top = validar_top(top)
    cp = comprado_y_pedidos(db, periodo)
    entregas = _kpis_de_entregas(db, periodo)
    comprado, comprado_ant = dinero(cp["comprado"]["actual"]), dinero(cp["comprado"]["anterior"])
    kpis = [
        kpi("comprado_periodo", "Comprado", comprado, comprado_ant, "pesos", "neutro",
            ayuda="Pedidos de compra del período, sin borradores ni cancelados."),
        kpi("pec_nuevos", "Pedidos de compra", cp["pedidos"]["actual"], cp["pedidos"]["anterior"], "entero", "neutro",
            ayuda="Pedidos de compra del período, sin borradores ni cancelados."),
        kpi("entregas_a_tiempo_pct", "% entregas a tiempo", entregas["a_tiempo_pct"]["actual"],
            entregas["a_tiempo_pct"]["anterior"], "porcentaje", "sube",
            ayuda="Recepciones confirmadas que llegaron hasta un día después de la fecha prometida."),
        kpi("dias_promedio_entrega", "Días promedio de entrega", entregas["dias"]["actual"],
            entregas["dias"]["anterior"], "dias", "baja",
            ayuda="Días entre el pedido de compra y su recepción confirmada."),
    ]
    q = _comprados(db)
    actual = {dia: dinero(v) for dia, v in _por_cubeta(q, fecha_de_compra(), func.coalesce(
        func.sum(PurchaseOrderFull.total_cop), 0), periodo).items()}
    anterior = {dia: dinero(v) for dia, v in _por_cubeta(q, fecha_de_compra(), func.coalesce(
        func.sum(PurchaseOrderFull.total_cop), 0), periodo, anterior=True).items()}
    return respuesta(
        periodo,
        kpis=kpis,
        linea=_linea("Compras en el tiempo", "pesos", periodo, actual, anterior, "Comprado", comprado, comprado_ant),
        donas=[_dona_por_proveedor(db, periodo), _dona_por_estado(db, periodo)],
        barras=_barras_de_entregas(db, periodo),
        movimientos={"titulo": "Últimas compras y recepciones", "filas": _movimientos(db, periodo)},
        ranking=_ranking(db, periodo, top, comprado),
        filtros={"top": top},
        avisos=_avisos(entregas["sin_fecha"]),
    )
