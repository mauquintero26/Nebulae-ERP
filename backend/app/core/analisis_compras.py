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
  recepción es ≤ el prometido + TOLERANCIA_A_TIEMPO_DIAS (1). Los dos días se toman con .date() (cast a date), sin pasarlos
  a hora de Colombia, IGUAL que _gr_dict de erp_compras.py, para que el Hub y la Mesa de Recepciones no se contradigan:
  si se corrige _gr_dict, hay que corregir esto también. Una recepción sin pedido de compra no tiene fecha prometida.
- Días promedio de entrega: día de la recepción − día del pedido de compra (fecha_de_compra), con 1 decimal y nunca
  negativo; solo las recepciones confirmadas del período con pedido de compra.
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

from app.core.analisis import (claves_cubetas, dinero, expr_cubeta, kpi, rellenar, respuesta, segmentos, validar_top,
                               variacion_pct)
from app.core.estados_compras import ETAPAS_PEC, GRUPOS_RECEPCION, cond_vencido, etapa_pec
from app.core.fechas import iso_z
from app.core.periodos import Periodo, contar_en, en_rango, sumar_en
from app.core.textos_actividad import etiqueta_estado
from app.models.erp_documents import GoodsReceipt, PurchaseOrderFull

TOP_POR_DEFECTO = 5
MAX_MOVIMIENTOS = 8           # MAX_MOVIMIENTOS de lib/analisis.js
ESTADOS_SIN_DINERO_PEC = ("BORRADOR", "CANCELADO")   # RP43: no suman a «Comprado»
ESTADOS_RECEPCION_CONFIRMADA = GRUPOS_RECEPCION["confirmadas"]   # COMPLETADA y COMPLETADA_LOGISTICA
TOLERANCIA_A_TIEMPO_DIAS = 1  # la de _gr_dict (erp_compras.py): llegar un día después de lo prometido es a tiempo
SIN_PROVEEDOR = "Sin proveedor"
VENTANAS = ("actual", "anterior")


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
    estado desconocido cuenta como emitido, la misma regla de cond_estados_pec). Los montos, en pesos enteros."""
    pec = PurchaseOrderFull
    filas = (q.order_by(None).enable_eagerloads(False)
             .with_entities(pec.estado, func.count(pec.id), func.coalesce(func.sum(pec.total_cop), 0),
                            func.count(pec.id).filter(cond_vencido(pec.estado, pec.fecha_entrega_estimada, hoy)))
             .group_by(pec.estado).all())
    por_estado, cuantos, montos, vencidos = {}, {e: 0 for e in ETAPAS_PEC}, {e: Decimal(0) for e in ETAPAS_PEC}, 0
    for estado, n, monto, n_vencidos in filas:
        etapa = etapa_pec(estado)
        por_estado[estado] = int(n)
        cuantos[etapa] += int(n)
        montos[etapa] += Decimal(monto or 0)
        vencidos += int(n_vencidos or 0)
    activas = ("emitido", "en_transito", "en_bodega")
    activos = sum(cuantos[e] for e in activas)
    total = sum(cuantos.values())
    return {
        "total": total,
        "por_estado": por_estado,
        "borradores": cuantos["borrador"],
        "activos": activos,
        "en_transito": cuantos["en_transito"],
        "en_bodega": cuantos["en_bodega"],
        "recibidos": cuantos["recibido"],
        "cancelados": cuantos["cancelado"],
        "vigentes": total - cuantos["cancelado"],
        "vencidos": vencidos,
        "monto_cop": dinero(sum((m for e, m in montos.items() if e != "cancelado"), Decimal(0))),
        "monto_por_recibir_cop": dinero(sum((montos[e] for e in activas), Decimal(0))),
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

def _ventanas(col, periodo: Periodo):
    return (en_rango(col, periodo.inicio_utc, periodo.fin_utc),
            en_rango(col, periodo.anterior_inicio_utc, periodo.anterior_fin_utc))


def _pct(parte, total):
    """El % con 1 decimal; None si no hay total."""
    if not total:
        return None
    return round(float(parte) / float(total) * 100, 1)


def _texto_pct(valor) -> str:
    """'66,7 %' y '100 %' (el formato de porcentaje de R7: coma decimal y un espacio antes de %)."""
    texto = f"{valor:.1f}".replace(".", ",")
    return f"{texto[:-2] if texto.endswith(',0') else texto} %"


def _cantidad(n, singular, plural) -> str:
    return f"{n} {singular if n == 1 else plural}"


def _enteros(valores):
    """Los valores de una serie (rellenar da float) como int cuando no tienen decimales: pesos y conteos enteros."""
    return [int(v) if float(v).is_integer() else v for v in valores]


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


def _reglas_de_entrega():
    """(a tiempo, con retraso, sin fecha prometida, días de entrega, días de retraso) de una recepción, en SQL (ver el
    docstring del módulo: .date() de los dos lados, como _gr_dict)."""
    gr, pec = GoodsReceipt, PurchaseOrderFull
    dia_recepcion = cast(gr.fecha_recepcion, Date)
    limite = cast(pec.fecha_entrega_estimada, Date) + TOLERANCIA_A_TIEMPO_DIAS
    con_fecha = pec.fecha_entrega_estimada.isnot(None)
    a_tiempo = and_(con_fecha, dia_recepcion <= limite)
    tarde = and_(con_fecha, dia_recepcion > limite)
    sin_fecha = pec.fecha_entrega_estimada.is_(None)
    dias_entrega = func.greatest(dia_recepcion - cast(fecha_de_compra(pec), Date), 0)
    dias_retraso = case((tarde, dia_recepcion - limite))
    return a_tiempo, tarde, sin_fecha, dias_entrega, dias_retraso


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
                     func.avg(dias_entrega).filter(and_(ventana, pec.id.isnot(None)))]
    columnas.append(func.count(gr.id).filter(and_(actual, sin_fecha)))
    fila = _recepciones(db).filter(or_(actual, anterior)).with_entities(*columnas).one()
    dias = [None if v is None else round(float(v), 1) for v in (fila[2], fila[5])]
    return {"a_tiempo_pct": {"actual": _pct(fila[1], fila[0]), "anterior": _pct(fila[4], fila[3])},
            "dias": {"actual": dias[0], "anterior": dias[1]},
            "sin_fecha": int(fila[6] or 0)}


def _linea(periodo: Periodo, actual: dict, anterior: dict, total, total_anterior) -> dict:
    return {
        "titulo": "Compras en el tiempo",
        "formato": "pesos",
        "fechas": [dia.isoformat() for dia in claves_cubetas(periodo)],
        "series": [
            {"clave": "actual", "etiqueta": "Comprado", "valores": _enteros(rellenar(actual, periodo)),
             "es_anterior": False},
            {"clave": "anterior", "etiqueta": "Período anterior",
             "valores": _enteros(rellenar(anterior, periodo, anterior=True)), "es_anterior": True},
        ],
        "total": total,
        "total_anterior": total_anterior,
        "variacion_pct": variacion_pct(total, total_anterior),
    }


def _dona(clave, titulo, formato, filas) -> dict:
    return {"clave": clave, "titulo": titulo, "formato": formato, "total": sum(int(f[2]) for f in filas),
            "segmentos": segmentos(filas)}


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
    series = (("a_tiempo", "A tiempo", "positivo"), ("con_retraso", "Con retraso", "neutro"),
              ("sin_fecha", "Sin fecha prometida", "neutro"))
    return {"titulo": "Recepciones a tiempo y con retraso", "formato": "entero", "eje": "fechas",
            "etiquetas": [dia.isoformat() for dia in claves_cubetas(periodo)],
            "series": [{"clave": clave, "etiqueta": etiqueta, "valores": _enteros(rellenar(por_serie[i], periodo)),
                        "tono": tono} for i, (clave, etiqueta, tono) in enumerate(series)],
            "apiladas": True}


def _movimiento(tipo, numero, titulo, detalle, fecha, monto, estado_etiqueta, doc_tipo, doc_id) -> dict:
    return {"tipo": tipo, "numero": numero, "titulo": titulo, "detalle": detalle, "fecha": iso_z(fecha),
            "monto": None if monto is None else dinero(monto), "formato": None if monto is None else "pesos",
            "signo": None, "estado_etiqueta": estado_etiqueta, "doc_tipo": doc_tipo, "doc_id": doc_id}


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
    filas = [(cuando, _movimiento("PEC", numero, "Pedido de compra", proveedor, cuando, total,
                                  etiqueta_estado("PEC", estado), "PEC", id_))
             for id_, numero, proveedor, estado, total, cuando in compras]
    for id_, numero, proveedor, estado, cuando, retraso in recepciones:
        detalle = proveedor if not retraso else (
            f"{proveedor} · llegó {_cantidad(int(retraso), 'día', 'días')} tarde")
        filas.append((cuando, _movimiento("ENINV", numero, "Recepción", detalle, cuando, None,
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
    filas = (_comprados(db).filter(actual)
             .with_entities(*clave, nombre, valor, func.count(pec.id))
             .group_by(*clave).order_by(valor.desc(), nombre.asc()).limit(top).all())
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
        linea=_linea(periodo, actual, anterior, comprado, comprado_ant),
        donas=[_dona_por_proveedor(db, periodo), _dona_por_estado(db, periodo)],
        barras=_barras_de_entregas(db, periodo),
        movimientos={"titulo": "Últimas compras y recepciones", "filas": _movimientos(db, periodo)},
        ranking=_ranking(db, periodo, top, comprado),
        filtros={"top": top},
        avisos=_avisos(entregas["sin_fecha"]),
    )
