"""El Análisis de Ventas en el servidor (GET /ventas/analisis) y las cifras de dinero y avance de /ventas/stats.

Bloque 4, T6C (ANALISIS-ventas puntos 1 y 2; KPI-ventas punto 3; R7, R13, R21; C6, C12; RP1, RP29, RP31, RP32, RP60,
RP69, RP71, RP106; D3, D34). Un solo lugar para las definiciones de R7, que usan /ventas/stats (bloque flujo), el Análisis
de Ventas y, después, el Dashboard General y Finanzas (T20 reutiliza ventas_por_cubeta y pagos_recibidos_q tal cual):

- Vendido = Σ total_cop de los pedidos creados en el período cuyo estado no está en ESTADOS_VEN_SIN_DINERO (CANCELADO y
  DEVUELTO_TOTAL): el filtro rv.f_pven_con_dinero de core/resolucion_ventas.py (T1C), la regla de H47. Pedidos = cuántos
  son. Ticket promedio = Vendido / Pedidos, al peso (None sin pedidos).
- Cotizaciones que terminan en pedido = % de las COT creadas en el período con al menos un pedido distinto de CANCELADO
  (rv.pven_vigente_de_cot), con 1 decimal (None sin COT).
- Saldo por cobrar = Σ max(0, saldo_cop) de los pedidos con dinero (expr_saldo_por_cobrar): una foto de hoy, sin %. Un
  pedido entregado o facturado que todavía debe sigue por cobrar (R7 anula el «pedidos no cerrados» del diseño).
- Pagos recibidos (pagos_recibidos_q) = SaleOrderPayment CONFIRMADO o TRASLADADO (r1, I1: el pago de origen cuyo dinero
  pasó a otro pedido entró una vez, en su fecha), de un tipo de TIPOS_PAGO_INGRESO y con un método que no es TRASLADO,
  SALDO_A_FAVOR ni CONVERSION_COTIZACION (el saldo trasladado no es dinero nuevo, R6), filtrados por su `fecha` (Date:
  días de Colombia). Un pago sin método sí es dinero que entró.
- Las solicitudes de Soporte Técnico quedan fuera (R8: fuera de las tarjetas y del Hub), con rv.sin_soporte.
- Los días son de Colombia: los bordes del Periodo (core/periodos.py) y las cubetas de expr_cubeta (ZONA_COLOMBIA, RP1).
- Los montos van en pesos enteros (analisis.dinero = redondear_peso). Las fechas de los movimientos, con fechas.iso_z.
- producto (2 a 60 caracteres, RP69) filtra cada documento por sus líneas (busqueda.productos_ilike); los pagos, por las
  de su pedido. Sin producto no se filtra.

analisis_ventas(db, periodo, foco, top, producto) arma el contrato único con analisis.respuesta (CLAVES_ANALISIS, RP71) y
hace un número fijo de consultas agregadas por foco (GROUP BY, SUM, COUNT y LIMIT; 12 como mucho, más la de la sesión):
nunca recorre filas en Python ni depende de cuántos documentos haya (R13, contador_sql).

Errores: un foco, un top o un producto que no valen lanzan ValueError con el texto en español (el endpoint responde 422
con str(e), R21); un error del contrato es analisis.ErrorDeContrato (un 500).
"""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import and_, case, extract, func, or_, select
from sqlalchemy.orm import Session

from app.core import resolucion_ventas as rv
from app.core.analisis import (claves_cubetas, dinero, expr_cubeta, kpi, rellenar, respuesta, segmentos, validar_top,
                               variacion_pct)
from app.core.busqueda import productos_ilike
from app.core.documento_cliente import etiqueta_modalidad
from app.core.fechas import iso_z
from app.core.listados import texto_busqueda
from app.core.periodos import Periodo, contar_en, en_rango, sumar_en
from app.core.textos_actividad import TIPOS_PAGO, etiqueta_estado, etiqueta_tipo_solicitud
from app.core.ventas_dinero import (ESTADO_PAGO_TRASLADADO, METODO_PAGO_SALDO_A_FAVOR, METODO_PAGO_SIN_VERIFICAR,
                                    METODO_PAGO_TRASLADO, TIPOS_PAGO_INGRESO)
from app.models.catalog import Category, Product, ProductSKU
from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation
from app.models.fase1b import SaleOrderLineErp
from app.models.fase4 import SaleOrderPayment

FOCOS = ("hub", "sc", "cot", "pven")   # FOCOS_VENTAS de frontend/src/lib/analisis.js (R13)
FOCO_POR_DEFECTO = "hub"
TOP_POR_DEFECTO = 5
MIN_PRODUCTO, MAX_PRODUCTO = 2, 60

# r1 (m5): «{:.40}» recorta a 40 caracteres el valor que se repite (un foco de 2000 caracteres no vuelve entero). El
# endpoint, antes de dar formato, responde con listados.MENSAJE_CONTROL si el foco trae un carácter de control (D46).
ERROR_FOCO = "El foco «{:.40}» no existe: usa hub, sc, cot o pven."
ERROR_PRODUCTO = "El producto debe tener entre 2 y 60 caracteres."
# RP106 y D3 (el usuario contestó «Sin IVA» el 2026-10-27): el aviso de la dona «Ventas por categoría».
AVISO_SIN_IVA = "Por categoría se suma el valor de los productos sin IVA; el total puede ser menor que Ventas."

MAX_MOVIMIENTOS = 8    # MAX_MOVIMIENTOS de lib/analisis.js
MAX_ASESORES = 8       # las barras «Solicitudes por asesor»: 8 y el resto en «Otros»
ESTADO_PAGO_CONFIRMADO = "CONFIRMADO"   # core/ventas_dinero.py no tiene esta constante (solo ESTADO_PAGO_TRASLADADO)
# r1 (I1, ruling de fixes-6C-r1, gana sobre la letra de RP60): un pago recibido está CONFIRMADO o TRASLADADO. Al reconvertir
# la COT de un pedido cancelado, _trasladar_saldos_a_favor (erp_ventas_fase4) pasa los pagos de origen a TRASLADADO y crea
# en el pedido nuevo un pago con método TRASLADO: el dinero entró una vez, con el pago de origen y en su fecha.
ESTADOS_PAGO_RECIBIDO = (ESTADO_PAGO_CONFIRMADO, ESTADO_PAGO_TRASLADADO)
# Los métodos de un pago que no son dinero nuevo (R6, RP60): el saldo trasladado desde un pedido cancelado, lo que queda a
# favor y el pago automático de la conversión que nadie verificó (METODO_PAGO_SIN_VERIFICAR = 'CONVERSION_COTIZACION').
# Un pago TRASLADO o SALDO_A_FAVOR que se vuelve a trasladar queda TRASLADADO y lo sigue excluyendo su método.
METODOS_SIN_DINERO_NUEVO = (METODO_PAGO_TRASLADO, METODO_PAGO_SALDO_A_FAVOR, METODO_PAGO_SIN_VERIFICAR)
ETIQUETAS_CANAL = {"CRM": "Asesor", "WEB": "Tienda web", "PRESENCIAL": "Presencial"}
TIPO_SC_POR_DEFECTO = "Cotizacion de Producto"   # el default de CustomerRequest.tipo_solicitud
VENTANAS = ("actual", "anterior")


# ─── Validación (R21: ValueError con el texto; el endpoint responde 422) ────────────────────────────────────────────
# El foco lo valida el endpoint con el _parametro_de_lista de las listas (erp_ventas, T6B), con ERROR_FOCO; aquí solo se
# comprueba que sea uno de FOCOS.

def validar_producto(producto) -> str | None:
    """El texto del campo Producto (RP69): None o en blanco -> None (sin filtro); con 2 a 60 caracteres, recortado, se
    usa; si no, ValueError(ERROR_PRODUCTO). Un carácter de control da el ValueError de listados.texto_busqueda (D46)."""
    texto = texto_busqueda(producto, None)
    if texto is None:
        return None
    if not MIN_PRODUCTO <= len(texto) <= MAX_PRODUCTO:
        raise ValueError(ERROR_PRODUCTO)
    return texto


# ─── Piezas comunes ──────────────────────────────────────────────────────────────────────────────────────────────

def expr_saldo_por_cobrar(pven=SaleOrder):
    """max(0, saldo_cop) del pedido (R7): un saldo a favor no resta lo que deben otros pedidos. Con rv.f_pven_con_dinero
    es el «Saldo por cobrar» de /ventas/stats y del foco pven."""
    return func.greatest(func.coalesce(pven.saldo_cop, 0), 0)


def _like(producto):
    """El patrón ILIKE del campo Producto, o None sin producto. r1 (m6): pasa por validar_producto (idempotente), así las
    funciones públicas que reutiliza T20 (ventas_por_cubeta, ventas_y_pedidos, conversion_cotizaciones) nunca le pasan un
    NUL a psycopg2: un producto que no vale da el ValueError en español de validar_producto."""
    texto = validar_producto(producto)
    return f"%{texto}%" if texto else None


def _con_producto(q, columna, like):
    return q.filter(productos_ilike(columna, like)) if like else q


def _pedidos(db: Session, like):
    return _con_producto(db.query(SaleOrder), SaleOrder.productos, like)


def _pedidos_con_dinero(db: Session, like):
    return _pedidos(db, like).filter(rv.f_pven_con_dinero(SaleOrder))


def _cotizaciones(db: Session, like):
    return _con_producto(db.query(SalesQuotation), SalesQuotation.productos, like)


def _solicitudes(db: Session, like):
    """Las SC sin Soporte Técnico (R8)."""
    return _con_producto(db.query(CustomerRequest).filter(rv.sin_soporte(CustomerRequest)), CustomerRequest.productos,
                         like)


def _en_periodo(col, periodo: Periodo, anterior: bool = False):
    if anterior:
        return en_rango(col, periodo.anterior_inicio_utc, periodo.anterior_fin_utc)
    return en_rango(col, periodo.inicio_utc, periodo.fin_utc)


def _pct(parte, total):
    """El % con 1 decimal; None si no hay total (nunca se inventa un 0)."""
    if not total:
        return None
    return round(float(parte) / float(total) * 100, 1)


def _ticket(vendido, pedidos):
    """Vendido / Pedidos al peso; None sin pedidos."""
    if not pedidos:
        return None
    return dinero(Decimal(str(vendido or 0)) / pedidos)


def _enteros(valores):
    """Los valores de una serie (rellenar da float) como int cuando no tienen decimales: pesos y conteos enteros."""
    return [int(v) if float(v).is_integer() else v for v in valores]


def _cantidad(n, singular, plural) -> str:
    return f"{n} {singular if n == 1 else plural}"


def _agrupar_por_cubeta(q, col_fecha, valor, granularidad) -> dict:
    """{día de la cubeta: valor} de las filas de `q` (ya filtradas por su ventana), en UNA consulta con GROUP BY."""
    cubeta = expr_cubeta(col_fecha, granularidad)
    return {dia: v for dia, v in q.order_by(None).with_entities(cubeta, valor).group_by(cubeta).all()}


def _sumas_por_cubeta(q, col_fecha, col_monto, periodo: Periodo, anterior: bool = False) -> dict:
    filtrado = q.filter(_en_periodo(col_fecha, periodo, anterior))
    filas = _agrupar_por_cubeta(filtrado, col_fecha, func.coalesce(func.sum(col_monto), 0), periodo.granularidad)
    return {dia: dinero(v) for dia, v in filas.items()}


def _conteos_por_cubeta(q, col_fecha, col_id, periodo: Periodo, anterior: bool = False) -> dict:
    filtrado = q.filter(_en_periodo(col_fecha, periodo, anterior))
    return {dia: int(n) for dia, n in _agrupar_por_cubeta(filtrado, col_fecha, func.count(col_id),
                                                           periodo.granularidad).items()}


# ─── Lo que reutilizan /ventas/stats y Finanzas (RP60) ──────────────────────────────────────────────────────────────

def ventas_por_cubeta(db: Session, periodo: Periodo, *, anterior: bool = False, producto=None) -> dict:
    """{día de la cubeta: Σ total_cop al peso} de los pedidos con dinero (R7) creados en el período (o en el anterior),
    por la cubeta de created_at (expr_cubeta con periodo.granularidad). Es la entrada de analisis.rellenar. `producto`
    (opcional) es el texto del campo Producto. Una consulta."""
    return _sumas_por_cubeta(_pedidos_con_dinero(db, _like(producto)), SaleOrder.created_at, SaleOrder.total_cop,
                             periodo, anterior)


def pagos_recibidos_q(db: Session, desde: date, hasta: date):
    """La consulta de los pagos recibidos entre `desde` y `hasta` (días de Colombia, los dos incluidos, como
    Periodo.desde y Periodo.hasta) contra SaleOrderPayment.fecha (Date): estado CONFIRMADO o TRASLADADO
    (ESTADOS_PAGO_RECIBIDO), tipo en TIPOS_PAGO_INGRESO y metodo_pago fuera de METODOS_SIN_DINERO_NUEVO (o sin método).
    Devuelve el Query para que quien llama agregue (sum, group_by) o una sus pedidos.

    r1 (I1, ruling de fixes-6C-r1): cada peso que entró cuenta UNA vez, en la fecha del pago original. Cuando un pedido
    cancelado traslada su dinero a otro (erp_ventas_fase4._trasladar_saldos_a_favor), el pago de origen queda TRASLADADO
    y cuenta; el ANTICIPO del pedido nuevo (método TRASLADO) y lo que queda a favor en el cancelado (método
    SALDO_A_FAVOR) no cuentan, por su método. Un pago REVERTIDO o ANULADO no cuenta."""
    pago = SaleOrderPayment
    return db.query(pago).filter(
        pago.fecha >= desde, pago.fecha <= hasta,
        pago.estado.in_(ESTADOS_PAGO_RECIBIDO),
        pago.tipo.in_(TIPOS_PAGO_INGRESO),
        or_(pago.metodo_pago.is_(None), pago.metodo_pago.notin_(METODOS_SIN_DINERO_NUEVO)),
    )


def ventas_y_pedidos(db: Session, periodo: Periodo, producto=None) -> dict:
    """{'vendido': {actual, anterior} (Decimal, sin redondear), 'pedidos': {actual, anterior}} de R7, con sumar_en y
    contar_en de core/periodos.py sobre created_at (dos consultas)."""
    q = _pedidos_con_dinero(db, _like(producto))
    return {"vendido": sumar_en(q, SaleOrder.created_at, SaleOrder.total_cop, periodo),
            "pedidos": contar_en(q, SaleOrder.created_at, periodo)}


def conversion_cotizaciones(db: Session, periodo: Periodo, producto=None) -> dict:
    """{'cotizaciones': {actual, anterior}, 'con_pedido': {actual, anterior}, 'pct': {actual, anterior}}: las COT
    creadas en cada ventana y las que tienen un pedido distinto de CANCELADO (R7), con contar_en (dos consultas)."""
    q = _cotizaciones(db, _like(producto))
    total = contar_en(q, SalesQuotation.created_at, periodo)
    con_pedido = contar_en(q.filter(rv.pven_vigente_de_cot(SalesQuotation)), SalesQuotation.created_at, periodo)
    return {"cotizaciones": total, "con_pedido": con_pedido,
            "pct": {v: _pct(con_pedido[v], total[v]) for v in VENTANAS}}


def flujo_ventas(db: Session, periodo: Periodo) -> dict:
    """El bloque 'flujo' de /ventas/stats (R7, C6): vendido_cop, pedidos_nuevos, ticket_promedio_cop, cot_conversion_pct,
    solicitudes_nuevas (sin Soporte) y cotizaciones_nuevas, cada uno {actual, anterior, variacion_pct} con la regla de
    analisis.variacion_pct (None si el anterior es 0 y el actual no: «Nuevo»). Cinco consultas."""
    vp = ventas_y_pedidos(db, periodo)
    cot = conversion_cotizaciones(db, periodo)
    sc = contar_en(_solicitudes(db, None), CustomerRequest.created_at, periodo)

    def par(valor):
        actual, anterior = valor("actual"), valor("anterior")
        return {"actual": actual, "anterior": anterior, "variacion_pct": variacion_pct(actual, anterior)}

    return {
        "vendido_cop": par(lambda v: dinero(vp["vendido"][v])),
        "pedidos_nuevos": par(lambda v: vp["pedidos"][v]),
        "ticket_promedio_cop": par(lambda v: _ticket(vp["vendido"][v], vp["pedidos"][v])),
        "cot_conversion_pct": par(lambda v: cot["pct"][v]),
        "solicitudes_nuevas": par(lambda v: sc[v]),
        "cotizaciones_nuevas": par(lambda v: cot["cotizaciones"][v]),
    }


# ─── Bloques del contrato ────────────────────────────────────────────────────────────────────────────────────────

def _linea(titulo, formato, periodo: Periodo, actual: dict, anterior: dict, etiqueta, total, total_anterior) -> dict:
    return {
        "titulo": titulo,
        "formato": formato,
        "fechas": [dia.isoformat() for dia in claves_cubetas(periodo)],
        "series": [
            {"clave": "actual", "etiqueta": etiqueta, "valores": _enteros(rellenar(actual, periodo)),
             "es_anterior": False},
            {"clave": "anterior", "etiqueta": "Período anterior",
             "valores": _enteros(rellenar(anterior, periodo, anterior=True)), "es_anterior": True},
        ],
        "total": total,
        "total_anterior": total_anterior,
        "variacion_pct": variacion_pct(total, total_anterior),
    }


def _barras_por_fecha(titulo, formato, periodo: Periodo, series) -> dict:
    """Barras con el eje de las fechas de la línea. series = [(clave, etiqueta, {día: valor}, tono)]; D44: 'positivo' es
    una entrada y 'neutro' lo demás (ninguna serie de Ventas es una salida)."""
    return {"titulo": titulo, "formato": formato, "eje": "fechas",
            "etiquetas": [dia.isoformat() for dia in claves_cubetas(periodo)],
            "series": [{"clave": clave, "etiqueta": etiqueta, "valores": _enteros(rellenar(filas, periodo)),
                        "tono": tono} for clave, etiqueta, filas, tono in series],
            "apiladas": False}


def _dona(clave, titulo, formato, filas) -> dict:
    """filas = [(clave, etiqueta, valor)] (valores enteros); segmentos() quita los ceros y junta el resto en «Otros»."""
    return {"clave": clave, "titulo": titulo, "formato": formato, "total": sum(int(f[2]) for f in filas),
            "segmentos": segmentos(filas)}


def _juntar_por_etiqueta(filas) -> list:
    """[(clave, etiqueta, valor)] sumando las que tienen la misma etiqueta (conserva la primera clave)."""
    juntas = {}
    for clave, etiqueta, valor in filas:
        anterior = juntas.get(etiqueta)
        juntas[etiqueta] = (anterior[0] if anterior else clave, etiqueta, (anterior[2] if anterior else 0) + valor)
    return list(juntas.values())


def _dona_por_estado(q, modelo, entidad, titulo) -> dict:
    """Cuántos documentos de `q` (los del período) hay en cada estado, con su etiqueta (textos_actividad, R12)."""
    filas = q.order_by(None).with_entities(modelo.estado, func.count(modelo.id)).group_by(modelo.estado).all()
    return _dona("estado", titulo, "entero", [(e, etiqueta_estado(entidad, e), int(n)) for e, n in filas])


def _movimiento(tipo, numero, titulo, detalle, fecha, monto, signo, estado_etiqueta, doc_tipo, doc_id) -> dict:
    return {"tipo": tipo, "numero": numero, "titulo": titulo, "detalle": detalle, "fecha": iso_z(fecha),
            "monto": None if monto is None else dinero(monto), "formato": None if monto is None else "pesos",
            "signo": signo, "estado_etiqueta": estado_etiqueta, "doc_tipo": doc_tipo, "doc_id": doc_id}


def _top_clientes(q, modelo, valor, top) -> list:
    """[(nombre, valor, cantidad)] de los `top` clientes de `q`, agrupados por COALESCE(customer_id, customer_name): la
    ficha del cliente si la tiene y, si no, el nombre escrito en el documento. Una consulta con GROUP BY, ORDER BY y
    LIMIT; desempate por nombre."""
    sin_ficha = case((modelo.customer_id.is_(None), modelo.customer_name))
    nombre = func.max(modelo.customer_name)
    filas = (q.order_by(None).with_entities(nombre, valor, func.count(modelo.id))
             .group_by(modelo.customer_id, sin_ficha).order_by(valor.desc(), nombre.asc()).limit(top).all())
    return [(n, v, int(c)) for n, v, c in filas]


def _ranking(titulo, columna, formato, filas, total, singular, plural) -> dict:
    return {"titulo": titulo, "columna": columna, "formato": formato, "filas": [
        {"posicion": i, "nombre": (nombre or "").strip() or "Sin nombre", "detalle": _cantidad(n, singular, plural),
         "valor": valor, "cantidad": n, "pct": _pct(valor, total)}
        for i, (nombre, valor, n) in enumerate(filas, start=1)]}


# ─── Pedidos: piezas del Hub y del foco pven ─────────────────────────────────────────────────────────────────────

def _kpis_ventas(vp) -> tuple:
    """(vendido actual, vendido anterior, pedidos actual, pedidos anterior) de ventas_y_pedidos."""
    return vp["vendido"]["actual"], vp["vendido"]["anterior"], vp["pedidos"]["actual"], vp["pedidos"]["anterior"]


def _dona_categorias(db: Session, periodo: Periodo, like) -> tuple:
    """(dona «Ventas por categoría», pedidos con productos sin categoría). Por línea de sale_order_lines_erp de los
    pedidos con dinero del período: base = round((quantity − quantity_cancelled) × unit_price_cop) y neto = base −
    round(base × descuento_pct / 100), como core/iva.totales_lineas_pedido (RP32 con su ajuste), sin IVA (D3); una
    línea sin unidades vigentes no cuenta. La categoría sale de product_skus → products → categories; una línea sin SKU
    va a «Sin categoría». round() de PostgreSQL sobre numeric redondea las mitades alejándose de cero, como
    redondear_peso. Una consulta. r1 (m3): los pedidos sin categoría que se cuentan para el aviso son los que tienen una
    línea con neto > 0 en ese segmento (una línea de $0 sin SKU, un obsequio, no hace salir el aviso)."""
    linea = SaleOrderLineErp
    vigentes = linea.quantity - func.coalesce(linea.quantity_cancelled, 0)
    base = func.round(vigentes * linea.unit_price_cop)
    neto = base - func.round(base * func.coalesce(linea.descuento_pct, 0) / 100)
    q = (db.query(Category.id, Category.name, func.coalesce(func.sum(neto), 0),
                  func.count(func.distinct(linea.so_id)).filter(neto > 0))
         .select_from(linea)
         .join(SaleOrder, SaleOrder.id == linea.so_id)
         .outerjoin(ProductSKU, ProductSKU.id == linea.sku_id)
         .outerjoin(Product, Product.id == ProductSKU.product_id)
         .outerjoin(Category, Category.id == Product.category_id)
         .filter(rv.f_pven_con_dinero(SaleOrder), _en_periodo(SaleOrder.created_at, periodo), vigentes > 0))
    q = _con_producto(q, SaleOrder.productos, like)
    filas, sin_categoria = [], 0
    for categoria_id, nombre, total, pedidos in q.group_by(Category.id, Category.name).all():
        if categoria_id is None:
            sin_categoria = int(pedidos)
            filas.append(("sin_categoria", "Sin categoría", dinero(total)))
        else:
            filas.append((str(categoria_id), nombre, dinero(total)))
    return _dona("categoria", "Ventas por categoría", "pesos", filas), sin_categoria


def _avisos_de_categorias(dona, sin_categoria) -> list:
    """Los avisos de la dona de categorías: «N pedidos tienen productos sin categoría» solo si el segmento «Sin categoría»
    se ve en la dona (r1, m3: con valor 0 segmentos() lo quita y con más de 6 categorías puede quedar dentro de «Otros»),
    y el de RP106 si la dona tiene segmentos."""
    avisos = []
    if sin_categoria and any(s["clave"] == "sin_categoria" for s in dona["segmentos"]):
        avisos.append("1 pedido tiene productos sin categoría" if sin_categoria == 1
                      else f"{sin_categoria} pedidos tienen productos sin categoría")
    if dona["segmentos"]:
        avisos.append(AVISO_SIN_IVA)
    return avisos


def _movimientos_de_pedidos(db: Session, periodo: Periodo, like) -> list:
    """Los MAX_MOVIMIENTOS más recientes del período entre los pedidos con dinero creados (tipo 'PVEN') y los pagos
    recibidos (tipo 'PAGO', con el nombre de TIPOS_PAGO, RP31), todos con doc_tipo 'PVEN'. La fecha de un pago es
    iso_z(created_at) del pago (RP60). Dos consultas con LIMIT."""
    pedido, pago = SaleOrder, SaleOrderPayment
    pedidos = (_pedidos_con_dinero(db, like).filter(_en_periodo(pedido.created_at, periodo))
               .with_entities(pedido.id, pedido.numero, pedido.customer_name, pedido.estado, pedido.total_cop,
                              pedido.created_at)
               .order_by(pedido.created_at.desc().nulls_last(), pedido.id.desc()).limit(MAX_MOVIMIENTOS).all())
    pagos = _con_producto(pagos_recibidos_q(db, periodo.desde, periodo.hasta)
                          .join(pedido, pedido.id == pago.sale_order_id), pedido.productos, like)
    pagos = (pagos.with_entities(pago.tipo, pago.monto, pago.created_at, pedido.id, pedido.numero,
                                 pedido.customer_name)
             .order_by(pago.created_at.desc().nulls_last(), pago.id.desc()).limit(MAX_MOVIMIENTOS).all())
    filas = [(creado, _movimiento("PVEN", numero, "Pedido de venta", cliente, creado, total, None,
                                  etiqueta_estado("VEN", estado), "PVEN", id_))
             for id_, numero, cliente, estado, total, creado in pedidos]
    filas += [(creado, _movimiento("PAGO", numero, TIPOS_PAGO.get(tipo, tipo), cliente, creado, monto, "+", None,
                                   "PVEN", pedido_id))
              for tipo, monto, creado, pedido_id, numero, cliente in pagos]
    filas.sort(key=lambda f: f[0] or datetime.min, reverse=True)
    return [m for _, m in filas[:MAX_MOVIMIENTOS]]


def _ranking_de_pedidos(db: Session, periodo: Periodo, like, top, total) -> dict:
    q = _pedidos_con_dinero(db, like).filter(_en_periodo(SaleOrder.created_at, periodo))
    filas = _top_clientes(q, SaleOrder, func.coalesce(func.sum(SaleOrder.total_cop), 0), top)
    return _ranking("Mejores clientes", "Vendido", "pesos", [(n, dinero(v), c) for n, v, c in filas], total,
                    "pedido", "pedidos")


def _foco_hub(db: Session, periodo: Periodo, top, producto) -> dict:
    like = _like(producto)
    vend, vend_ant, ped, ped_ant = _kpis_ventas(ventas_y_pedidos(db, periodo, producto))
    conv = conversion_cotizaciones(db, periodo, producto)
    kpis = [
        kpi("vendido_periodo", "Ventas", vend, vend_ant, "pesos",
            ayuda="Pedidos creados en el período, sin cancelados ni devueltos."),
        kpi("pedidos_nuevos", "Pedidos", ped, ped_ant, "entero",
            ayuda="Pedidos creados en el período, sin cancelados ni devueltos."),
        kpi("ticket_promedio", "Ticket promedio", _ticket(vend, ped), _ticket(vend_ant, ped_ant), "pesos",
            ayuda="Ventas entre pedidos."),
        kpi("cot_conversion", "% de cotizaciones con pedido", conv["pct"]["actual"], conv["pct"]["anterior"],
            "porcentaje", ayuda="Cotizaciones del período que tienen un pedido que no está cancelado."),
    ]
    actual = ventas_por_cubeta(db, periodo, producto=producto)
    anterior = ventas_por_cubeta(db, periodo, anterior=True, producto=producto)
    categorias, sin_categoria = _dona_categorias(db, periodo, like)
    del_periodo = _pedidos(db, like).filter(_en_periodo(SaleOrder.created_at, periodo))
    cotizado = _sumas_por_cubeta(_cotizaciones(db, like), SalesQuotation.created_at, SalesQuotation.total_cop, periodo)
    return {
        "kpis": kpis,
        "linea": _linea("Ventas en el tiempo", "pesos", periodo, actual, anterior, "Ventas", dinero(vend),
                        dinero(vend_ant)),
        "donas": [categorias, _dona_por_estado(del_periodo, SaleOrder, "VEN", "Pedidos por estado")],
        "barras": _barras_por_fecha("Cotizado vs. vendido", "pesos", periodo,
                                    [("cotizado", "Cotizado", cotizado, "neutro"),
                                     ("vendido", "Vendido", actual, "positivo")]),
        "movimientos": {"titulo": "Últimos pedidos y pagos", "filas": _movimientos_de_pedidos(db, periodo, like)},
        "ranking": _ranking_de_pedidos(db, periodo, like, top, dinero(vend)),
        "avisos": _avisos_de_categorias(categorias, sin_categoria),
    }


def _recaudado(db: Session, periodo: Periodo, like) -> dict:
    """{actual, anterior}: Σ monto de los pagos recibidos de cada ventana (por su fecha), en UNA consulta: el rango de
    pagos_recibidos_q va del primer día del anterior al último del actual (el anterior siempre va antes) y cada suma
    filtra los días de su ventana (en 'mes' las dos ventanas no son contiguas)."""
    pago, pedido = SaleOrderPayment, SaleOrder
    q = pagos_recibidos_q(db, periodo.anterior_desde, periodo.hasta)
    if like:
        q = q.join(pedido, pedido.id == pago.sale_order_id).filter(productos_ilike(pedido.productos, like))
    ventanas = {"actual": and_(pago.fecha >= periodo.desde, pago.fecha <= periodo.hasta),
                "anterior": and_(pago.fecha >= periodo.anterior_desde, pago.fecha <= periodo.anterior_hasta)}
    fila = q.order_by(None).with_entities(*[func.coalesce(func.sum(pago.monto).filter(c), 0)
                                            for c in ventanas.values()]).one()
    return dict(zip(ventanas, fila))


def _recaudado_por_cubeta(db: Session, periodo: Periodo, like) -> dict:
    pago, pedido = SaleOrderPayment, SaleOrder
    q = pagos_recibidos_q(db, periodo.desde, periodo.hasta)
    if like:
        q = q.join(pedido, pedido.id == pago.sale_order_id).filter(productos_ilike(pedido.productos, like))
    filas = _agrupar_por_cubeta(q, pago.fecha, func.coalesce(func.sum(pago.monto), 0), periodo.granularidad)
    return {dia: dinero(v) for dia, v in filas.items()}


def _dona_por_canal(q) -> dict:
    """Lo vendido (pedidos con dinero del período) por canal: CRM -> 'Asesor', WEB -> 'Tienda web', PRESENCIAL ->
    'Presencial'; sin canal, 'Sin canal'."""
    filas = (q.order_by(None).with_entities(SaleOrder.canal_venta, func.coalesce(func.sum(SaleOrder.total_cop), 0))
             .group_by(SaleOrder.canal_venta).all())
    salida = []
    for canal, total in filas:
        codigo = (canal or "").strip()
        etiqueta = ETIQUETAS_CANAL.get(codigo.upper()) or (codigo.capitalize() if codigo else "Sin canal")
        salida.append((codigo or "sin_canal", etiqueta, dinero(total)))
    return _dona("canal", "Por canal", "pesos", _juntar_por_etiqueta(salida))


def _foco_pven(db: Session, periodo: Periodo, top, producto) -> dict:
    like = _like(producto)
    vend, vend_ant, ped, ped_ant = _kpis_ventas(ventas_y_pedidos(db, periodo, producto))
    recaudado = _recaudado(db, periodo, like)
    saldo = (_pedidos_con_dinero(db, like).order_by(None)
             .with_entities(func.coalesce(func.sum(expr_saldo_por_cobrar()), 0)).scalar())
    kpis = [
        kpi("vendido_periodo", "Vendido", vend, vend_ant, "pesos",
            ayuda="Pedidos creados en el período, sin cancelados ni devueltos."),
        kpi("pedidos_nuevos", "Pedidos", ped, ped_ant, "entero",
            ayuda="Pedidos creados en el período, sin cancelados ni devueltos."),
        kpi("recaudado", "Recaudado", recaudado["actual"], recaudado["anterior"], "pesos",
            ayuda="Pagos recibidos en el período; el saldo trasladado de un pedido cancelado no cuenta."),
        kpi("pven_saldo_por_cobrar", "Saldo por cobrar", saldo, None, "pesos", "baja", es_foto=True,
            ayuda="Hoy: lo que deben los pedidos sin cancelados ni devueltos."),
    ]
    actual = ventas_por_cubeta(db, periodo, producto=producto)
    anterior = ventas_por_cubeta(db, periodo, anterior=True, producto=producto)
    del_periodo = _pedidos(db, like).filter(_en_periodo(SaleOrder.created_at, periodo))
    con_dinero = del_periodo.filter(rv.f_pven_con_dinero(SaleOrder))
    return {
        "kpis": kpis,
        "linea": _linea("Ventas en el tiempo", "pesos", periodo, actual, anterior, "Ventas", dinero(vend),
                        dinero(vend_ant)),
        "donas": [_dona_por_estado(del_periodo, SaleOrder, "VEN", "Por estado"), _dona_por_canal(con_dinero)],
        "barras": _barras_por_fecha("Vendido vs. recaudado", "pesos", periodo,
                                    [("vendido", "Vendido", actual, "neutro"),
                                     ("recaudado", "Recaudado", _recaudado_por_cubeta(db, periodo, like),
                                      "positivo")]),
        "movimientos": {"titulo": "Últimos pagos y pedidos", "filas": _movimientos_de_pedidos(db, periodo, like)},
        "ranking": _ranking_de_pedidos(db, periodo, like, top, dinero(vend)),
        "avisos": [],
    }


# ─── Solicitudes ─────────────────────────────────────────────────────────────────────────────────────────────────

def _dias_hasta_cotizar(q, periodo: Periodo) -> dict:
    """{actual, anterior}: el promedio de días (1 decimal) entre la creación de cada SC de la ventana y su PRIMERA COT
    (la más vieja, en cualquier estado); las SC sin COT no entran. None si ninguna tiene COT. Una consulta."""
    sc, cot = CustomerRequest, SalesQuotation
    primera = select(func.min(cot.created_at)).where(cot.sc_id == sc.id).correlate(sc).scalar_subquery()
    dias = func.greatest(0, extract("epoch", primera - sc.created_at) / 86400)
    actual, anterior = _en_periodo(sc.created_at, periodo), _en_periodo(sc.created_at, periodo, anterior=True)
    con_cot = primera.isnot(None)
    fila = (q.order_by(None).filter(or_(actual, anterior))
            .with_entities(func.avg(dias).filter(and_(actual, con_cot)), func.avg(dias).filter(and_(anterior, con_cot)))
            .one())
    return {v: None if x is None else round(float(x), 1) for v, x in zip(VENTANAS, fila)}


def _barras_por_asesor(q) -> dict:
    """Las SC del período por asesor (advisor_name sin espacios en los bordes; vacío -> 'Sin asesor'), apiladas con y sin
    cotización (una COT que no está RECHAZADA, como '% con cotización'); los MAX_ASESORES con más solicitudes y el resto
    en 'Otros'. Una consulta."""
    sc = CustomerRequest
    asesor = func.nullif(func.btrim(sc.advisor_name), "")
    con_cot = rv.cot_activa_de_sc(sc)
    filas = (q.order_by(None).with_entities(asesor, func.count(sc.id).filter(con_cot), func.count(sc.id).filter(~con_cot))
             .group_by(asesor).all())
    grupos = sorted(((nombre or "Sin asesor", int(con), int(sin)) for nombre, con, sin in filas),
                    key=lambda g: (-(g[1] + g[2]), g[0]))
    if len(grupos) > MAX_ASESORES:
        resto = grupos[MAX_ASESORES:]
        grupos = grupos[:MAX_ASESORES] + [("Otros", sum(g[1] for g in resto), sum(g[2] for g in resto))]
    return {"titulo": "Solicitudes por asesor", "formato": "entero", "eje": "categorias",
            "etiquetas": [g[0] for g in grupos],
            "series": [{"clave": "con_cotizacion", "etiqueta": "Con cotización", "valores": [g[1] for g in grupos],
                        "tono": "positivo"},
                       {"clave": "sin_cotizacion", "etiqueta": "Sin cotización", "valores": [g[2] for g in grupos],
                        "tono": "neutro"}],
            "apiladas": True}


def _foco_sc(db: Session, periodo: Periodo, top, producto) -> dict:
    sc = CustomerRequest
    q = _solicitudes(db, _like(producto))
    nuevas = contar_en(q, sc.created_at, periodo)
    con_cot = contar_en(q.filter(rv.cot_activa_de_sc(sc)), sc.created_at, periodo)
    canceladas = contar_en(q.filter(sc.estado == "CANCELADA"), sc.created_at, periodo)
    dias = _dias_hasta_cotizar(q, periodo)
    kpis = [
        kpi("solicitudes_nuevas", "Solicitudes nuevas", nuevas["actual"], nuevas["anterior"], "entero",
            ayuda="Solicitudes creadas en el período, sin las de soporte técnico."),
        kpi("sc_con_cotizacion_pct", "% con cotización", _pct(con_cot["actual"], nuevas["actual"]),
            _pct(con_cot["anterior"], nuevas["anterior"]), "porcentaje",
            ayuda="Solicitudes del período con una cotización que no está rechazada."),
        kpi("sc_canceladas_periodo", "Canceladas", canceladas["actual"], canceladas["anterior"], "entero", "baja",
            ayuda="Solicitudes del período que hoy están canceladas."),
        kpi("dias_hasta_cotizar", "Días hasta cotizar", dias["actual"], dias["anterior"], "dias", "baja",
            ayuda="Promedio entre la solicitud y su primera cotización."),
    ]
    del_periodo = q.filter(_en_periodo(sc.created_at, periodo))
    tipo = func.coalesce(sc.tipo_solicitud, TIPO_SC_POR_DEFECTO)
    tipos = del_periodo.order_by(None).with_entities(tipo, func.count(sc.id)).group_by(tipo).all()
    recientes = (del_periodo.with_entities(sc.id, sc.numero, sc.tipo_solicitud, sc.customer_name, sc.estado,
                                           sc.created_at)
                 .order_by(sc.created_at.desc().nulls_last(), sc.id.desc()).limit(MAX_MOVIMIENTOS).all())
    return {
        "kpis": kpis,
        "linea": _linea("Solicitudes nuevas", "entero", periodo,
                        _conteos_por_cubeta(q, sc.created_at, sc.id, periodo),
                        _conteos_por_cubeta(q, sc.created_at, sc.id, periodo, anterior=True), "Solicitudes",
                        nuevas["actual"], nuevas["anterior"]),
        "donas": [_dona_por_estado(del_periodo, sc, "SC", "Por estado"),
                  _dona("tipo", "Por tipo", "entero", [(t, etiqueta_tipo_solicitud(t), int(n)) for t, n in tipos])],
        "barras": _barras_por_asesor(del_periodo),
        "movimientos": {"titulo": "Últimas solicitudes", "filas": [
            _movimiento("SC", numero, etiqueta_tipo_solicitud(tipo_sc or TIPO_SC_POR_DEFECTO), cliente, creado, None,
                        None, etiqueta_estado("SC", estado), "SC", id_)
            for id_, numero, tipo_sc, cliente, estado, creado in recientes]},
        "ranking": _ranking("Clientes con más solicitudes", "Solicitudes", "entero",
                            _top_clientes(del_periodo, sc, func.count(sc.id), top), nuevas["actual"],
                            "solicitud", "solicitudes"),
        "avisos": [],
    }


# ─── Cotizaciones ────────────────────────────────────────────────────────────────────────────────────────────────

def _dona_por_modalidad(q) -> dict:
    """Las COT del período por la modalidad de pago de su SC (documento_cliente.etiqueta_modalidad); sin SC, 'Sin
    solicitud'; con la modalidad vacía, 'Sin modalidad'. Una consulta (LEFT JOIN con customer_requests)."""
    sc, cot = CustomerRequest, SalesQuotation
    sin_sc = sc.id.is_(None)
    filas = (q.outerjoin(sc, sc.id == cot.sc_id).order_by(None)
             .with_entities(sin_sc, sc.modalidad_pago, func.count(cot.id)).group_by(sin_sc, sc.modalidad_pago).all())
    salida = []
    for sin_solicitud, modalidad, n in filas:
        if sin_solicitud:
            salida.append(("sin_solicitud", "Sin solicitud", int(n)))
        else:
            etiqueta = etiqueta_modalidad(modalidad).strip() or "Sin modalidad"
            salida.append((etiqueta, etiqueta, int(n)))
    return _dona("modalidad", "Por modalidad de pago", "entero", _juntar_por_etiqueta(salida))


def _foco_cot(db: Session, periodo: Periodo, top, producto) -> dict:
    cot = SalesQuotation
    q = _cotizaciones(db, _like(producto))
    aprobada = or_(cot.estado == "CONFIRMADA", rv.pven_vigente_de_cot(cot))
    cotizado = sumar_en(q, cot.created_at, cot.total_cop, periodo)
    cotizaciones = contar_en(q, cot.created_at, periodo)
    aprobadas = contar_en(q.filter(aprobada), cot.created_at, periodo)
    perdidas = contar_en(q.filter(cot.estado.in_(("RECHAZADA", "VENCIDA"))), cot.created_at, periodo)
    kpis = [
        kpi("cotizado", "Cotizado", cotizado["actual"], cotizado["anterior"], "pesos",
            ayuda="Valor de las cotizaciones creadas en el período."),
        kpi("cotizaciones_nuevas", "Cotizaciones", cotizaciones["actual"], cotizaciones["anterior"], "entero"),
        kpi("cot_aprobadas_pct", "% aprobadas", _pct(aprobadas["actual"], cotizaciones["actual"]),
            _pct(aprobadas["anterior"], cotizaciones["anterior"]), "porcentaje",
            ayuda="Confirmadas o con un pedido que no está cancelado."),
        kpi("cot_rechazadas_o_vencidas", "Rechazadas o vencidas", perdidas["actual"], perdidas["anterior"], "entero",
            "baja"),
    ]
    actual = _sumas_por_cubeta(q, cot.created_at, cot.total_cop, periodo)
    del_periodo = q.filter(_en_periodo(cot.created_at, periodo))
    recientes = (del_periodo.with_entities(cot.id, cot.numero, cot.customer_name, cot.estado, cot.total_cop,
                                           cot.created_at)
                 .order_by(cot.created_at.desc().nulls_last(), cot.id.desc()).limit(MAX_MOVIMIENTOS).all())
    clientes = _top_clientes(del_periodo, cot, func.coalesce(func.sum(cot.total_cop), 0), top)
    return {
        "kpis": kpis,
        "linea": _linea("Valor cotizado", "pesos", periodo, actual,
                        _sumas_por_cubeta(q, cot.created_at, cot.total_cop, periodo, anterior=True), "Cotizado",
                        dinero(cotizado["actual"]), dinero(cotizado["anterior"])),
        "donas": [_dona_por_estado(del_periodo, cot, "COT", "Por estado"), _dona_por_modalidad(del_periodo)],
        "barras": _barras_por_fecha("Cotizado vs. aprobado", "pesos", periodo,
                                    [("cotizado", "Cotizado", actual, "neutro"),
                                     ("aprobado", "Aprobado",
                                      _sumas_por_cubeta(q.filter(aprobada), cot.created_at, cot.total_cop, periodo),
                                      "positivo")]),
        "movimientos": {"titulo": "Últimas cotizaciones", "filas": [
            _movimiento("COT", numero, "Cotización", cliente, creado, total, None, etiqueta_estado("COT", estado),
                        "COT", id_)
            for id_, numero, cliente, estado, total, creado in recientes]},
        "ranking": _ranking("Clientes con más valor cotizado", "Cotizado", "pesos",
                            [(n, dinero(v), c) for n, v, c in clientes], dinero(cotizado["actual"]),
                            "cotización", "cotizaciones"),
        "avisos": [],
    }


_POR_FOCO = {"hub": _foco_hub, "sc": _foco_sc, "cot": _foco_cot, "pven": _foco_pven}


def analisis_ventas(db: Session, periodo: Periodo, foco=FOCO_POR_DEFECTO, top=TOP_POR_DEFECTO, producto=None) -> dict:
    """El cuerpo de GET /ventas/analisis: {status: 'success', data} con el contrato único (analisis.respuesta). `periodo`
    es el Periodo de periodos.resolver_periodo. Valida foco, top (validar_top: 5, 10 o 25) y producto (2 a 60
    caracteres) y lanza ValueError con su texto si no valen (el endpoint los valida antes y responde 422).

    - hub: Ventas, Pedidos, Ticket promedio y % de cotizaciones con pedido; la línea de ventas con el período anterior;
      las donas «Ventas por categoría» (con sus avisos) y «Pedidos por estado» (con los cancelados); «Cotizado vs.
      vendido»; los últimos pedidos y pagos; los mejores clientes.
    - sc: Solicitudes nuevas, % con cotización, Canceladas y Días hasta cotizar; la línea de solicitudes; por estado y
      por tipo; por asesor (apiladas); las últimas solicitudes; los clientes con más solicitudes.
    - cot: Cotizado, Cotizaciones, % aprobadas y Rechazadas o vencidas; la línea del valor cotizado; por estado y por
      modalidad de pago; «Cotizado vs. aprobado»; las últimas cotizaciones; los clientes con más valor cotizado.
    - pven: Vendido, Pedidos, Recaudado y Saldo por cobrar (foto); la línea de ventas; por estado y por canal; «Vendido
      vs. recaudado»; los últimos pagos y pedidos; los mejores clientes."""
    if foco not in _POR_FOCO:
        raise ValueError(ERROR_FOCO.format(str(foco)))
    top = validar_top(top)
    producto = validar_producto(producto)
    bloques = _POR_FOCO[foco](db, periodo, top, producto)
    return respuesta(periodo, filtros={"foco": foco, "top": top, "producto": producto}, **bloques)
