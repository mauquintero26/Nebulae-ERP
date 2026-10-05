"""Dinero de Ventas en pesos enteros (H42) y anticipo de la cotizacion (H36+H43, N1, reglas R2/R3/R6).

Lo importan erp_ventas.py y erp_ventas_fase4.py sin import circular (fase4 no importa erp_ventas). Todo monto
de COT / PVEN / PXP se guarda y se muestra al peso: exacto, nunca a la centena ni al mil. El frontend tiene el
espejo de redondeo y formato en frontend/src/lib/pesos.js (redondearPeso / formatoPesos).

Sin FastAPI ni DB, salvo anticipo_cotizacion (y pct_anticipo_cotizacion), saldos_a_favor_de_cotizacion y
anular_pxps_de_pedido (H45), que usan la sesion que reciben (los modelos se importan dentro de esas funciones para
que el resto siga puro).
"""
import unicodedata
from decimal import Decimal, InvalidOperation, ROUND_DOWN, ROUND_HALF_UP
from typing import NamedTuple, Optional

_UN_PESO = Decimal("1")
_CIEN = Decimal("100")

# R2: "Otro", vacia o no reconocida -> 60%.
PCT_ANTICIPO_POR_DEFECTO = Decimal("60")

# N1 (decision del usuario): medios con que se verifica el anticipo; la referencia es obligatoria (en efectivo,
# el numero de recibo). 'TRASLADO' no esta: solo lo pone el servidor (R6).
METODOS_PAGO_ANTICIPO = ("Transferencia bancaria", "Consignación", "Efectivo", "Tarjeta", "Nequi", "Daviplata",
                         "PSE", "Otro")

# R6: tipos de pago que son dinero que entro (los mismos que cancel_sale_order cuenta como saldo a favor).
TIPOS_PAGO_INGRESO = ("ANTICIPO", "ABONO", "PAGO_TOTAL", "PAGO_SALDO")
METODO_PAGO_TRASLADO = "TRASLADO"          # pago del pedido nuevo que trae el saldo a favor
METODO_PAGO_SALDO_A_FAVOR = "SALDO_A_FAVOR"  # lo que queda a favor en el pedido cancelado si no cupo todo
ESTADO_PAGO_TRASLADADO = "TRASLADADO"      # pago de origen cuyo dinero ya vive en otro pedido
# Pago automatico que creaba la conversion antes de N1, sin que nadie lo verificara. NO es saldo a favor: no se
# traslada ni descuenta lo que hay que verificar (los resuelve T14 con el usuario).
METODO_PAGO_SIN_VERIFICAR = "CONVERSION_COTIZACION"


def redondear_peso(valor) -> Decimal:
    """Redondea un monto al peso entero (ROUND_HALF_UP, 0 decimales) y devuelve un Decimal.

    - None y '' (monto ausente) valen 0: redondear_peso(None) == Decimal('0').
    - Acepta int, float, Decimal y str numerico. El float pasa por str() para no arrastrar el ruido
      binario (2786923.08 -> 2786923, no 2786922.9999...).
    - Un valor que no es un monto (texto no numerico, NaN, infinito, bool, lista...) lanza ValueError;
      los endpoints lo convierten en 422 en vez de dejar que llegue a la base.
    - En empate (x.5) redondea alejandose de cero; con positivos coincide con Math.round del frontend.
    """
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        return Decimal(0)
    if isinstance(valor, bool):
        raise ValueError(f"Monto no válido: {valor!r}")
    try:
        n = Decimal(str(valor))
        if not n.is_finite():
            raise ValueError(f"Monto no válido: {valor!r}")
        redondeado = n.quantize(_UN_PESO, rounding=ROUND_HALF_UP)
        return redondeado if redondeado else Decimal(0)  # sin "-0" cuando un negativo chico redondea a cero
    except InvalidOperation:  # texto no numerico, o tan grande que no cabe en la precision
        raise ValueError(f"Monto no válido: {valor!r}") from None


def pesos(valor) -> str:
    """Formato es-CO a peso entero: '$1.724.400', '-$5.000', '$0'. Las mismas reglas de entrada que
    redondear_peso (None vale 0). Reemplaza al f"${x:,.0f}", que separa los miles con coma (EE. UU.)."""
    n = redondear_peso(valor)
    signo = "-" if n < 0 else ""
    return f"{signo}${abs(n):,.0f}".replace(",", ".")


def formato_pct(pct) -> str:
    """'60%', '100%', '0%', '12,5%' (coma decimal es-CO, maximo 2 decimales)."""
    q = Decimal(str(pct)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    q = q.quantize(_UN_PESO) if q == q.to_integral_value() else q.normalize()
    return f"{format(q, 'f').replace('.', ',')}%"


# ─── Anticipo de la cotizacion (H36+H43, R2, R3) ─────────────────────────────────────────────────────

def _sin_tildes(texto) -> str:
    descompuesto = unicodedata.normalize("NFKD", str(texto))
    return "".join(c for c in descompuesto if not unicodedata.combining(c)).lower().strip()


def pct_anticipo_de_modalidad(modalidad):
    """% de anticipo que pide una modalidad de pago (R2), o None si no la reconoce ("Otro", vacia...).

    Sin tildes ni mayusculas: Credito (todo lo que empiece por "Cr", o diga "credito") -> 0; '60/40' -> 60;
    'Contado' -> 100. Cubre los textos del formulario de la SC, de la agenda ('Credito 30 Dias') y del chat."""
    if modalidad is None:
        return None
    texto = _sin_tildes(modalidad)
    if not texto:
        return None
    if texto.startswith("cr") or "credito" in texto:
        return Decimal("0")
    if "60/40" in texto:
        return Decimal("60")
    if "contado" in texto:
        return Decimal("100")
    return None


def metodo_pago_anticipo(texto):
    """Nombre de METODOS_PAGO_ANTICIPO que corresponde a `texto` (sin importar tildes ni mayusculas), o None si
    no es uno de ellos. 'Transferencia' sola vale como 'Transferencia bancaria'."""
    if texto is None:
        return None
    clave = _sin_tildes(texto)
    if clave == "transferencia":
        return "Transferencia bancaria"
    return next((m for m in METODOS_PAGO_ANTICIPO if _sin_tildes(m) == clave), None)


def _pct_entre_0_y_100(pct) -> Decimal:
    return max(Decimal("0"), min(Decimal(str(pct)), _CIEN))


# De donde sale el % del anticipo de una cotizacion (ver anticipo_cotizacion).
ORIGEN_MANUAL = "manual"          # R3: anticipo_pct_manual
ORIGEN_MODALIDAD = "modalidad"    # la modalidad de pago de su SC (R2)
ORIGEN_CONSERVADO = "conservado"  # sin SC: el % que ya tenia (anticipo_cop / total_cop)
ORIGEN_DEFECTO = "defecto"        # sin SC y sin total: 60%


class AnticipoCotizacion(NamedTuple):
    """Lo que exige hoy una cotizacion (anticipo_cotizacion)."""
    pct: Decimal
    modalidad: Optional[str]
    origen: str
    requerido: Decimal


def anticipo_cotizacion(cot, db, sc=None) -> AnticipoCotizacion:
    """Anticipo que exige HOY la cotizacion: el % (entre 0 y 100), la modalidad de la SC, de donde sale el % y el
    requerido en pesos enteros. Es la cuenta del GET de la COT y de la conversion.

    - R3: si tiene anticipo manual (anticipo_pct_manual no es None), ese % (ORIGEN_MANUAL).
    - Si tiene SC: el % de su modalidad de pago (R2), o 60 si no se reconoce (ORIGEN_MODALIDAD).
    - Sin SC y con total > 0 (ORIGEN_CONSERVADO): el % que ya tenia, anticipo_cop * 100 / total_cop SIN cuantizar
      (H36: "un % raro heredado se conserva tal cual"), y el requerido es exactamente el anticipo guardado,
      min(redondear_peso(anticipo_cop), total): la COT del Cotizador Rapido conserva su 60% y las de prueba con
      anticipo 0 conservan el 0.
    - Sin SC y sin total: 60 (ORIGEN_DEFECTO).
    El requerido de los demas origenes es anticipo_requerido(total, pct). modalidad es el texto de la modalidad
    de la SC (None sin SC), tambien cuando el % es el manual. `sc` evita releer la SC cuando el llamador ya la
    tiene (update_solicitud, create_cotizacion)."""
    if sc is None and cot.sc_id:
        from app.models.erp_documents import CustomerRequest
        sc = db.query(CustomerRequest).filter(CustomerRequest.id == cot.sc_id).first()
    modalidad = sc.modalidad_pago if sc is not None else None
    total = redondear_peso(cot.total_cop)
    if cot.anticipo_pct_manual is not None:
        pct, origen = _pct_entre_0_y_100(cot.anticipo_pct_manual), ORIGEN_MANUAL
    elif sc is not None:
        pct_modalidad = pct_anticipo_de_modalidad(modalidad)
        pct = _pct_entre_0_y_100(PCT_ANTICIPO_POR_DEFECTO if pct_modalidad is None else pct_modalidad)
        origen = ORIGEN_MODALIDAD
    elif Decimal(str(cot.total_cop or 0)) > 0:
        pct = _pct_entre_0_y_100(Decimal(str(cot.anticipo_cop or 0)) * _CIEN / Decimal(str(cot.total_cop)))
        requerido = min(max(Decimal("0"), redondear_peso(cot.anticipo_cop)), total)
        return AnticipoCotizacion(pct, None, ORIGEN_CONSERVADO, requerido)
    else:
        pct, origen = PCT_ANTICIPO_POR_DEFECTO, ORIGEN_DEFECTO
    return AnticipoCotizacion(pct, modalidad, origen, anticipo_requerido(total, pct))


def pct_anticipo_cotizacion(cot, db, sc=None):
    """(pct, modalidad) de anticipo_cotizacion: el % que exige la cotizacion y el texto de la modalidad de su SC."""
    a = anticipo_cotizacion(cot, db, sc=sc)
    return a.pct, a.modalidad


def pct_snapshot_del_pedido(pct) -> Decimal:
    """El % que guarda el pedido (anticipo_pct_snapshot, NUMERIC(5,2)), redondeado HACIA ABAJO a 2 decimales: el
    requerido del pedido nunca supera el que se verifico al convertir, asi que pagar lo que decia la cotizacion
    nunca lo deja con anticipo pendiente (66,666...% -> 66,66%). La modalidad y el manual ya traen 2 decimales."""
    return Decimal(str(pct)).quantize(Decimal("0.01"), rounding=ROUND_DOWN)


def anticipo_requerido(total, pct) -> Decimal:
    """round(total x pct / 100) en pesos enteros, sobre el total ya redondeado al peso."""
    return redondear_peso(redondear_peso(total) * Decimal(str(pct)) / _CIEN)


def monto_linea(producto) -> Decimal:
    """U19: valor de una linea de la cotizacion en pesos enteros, nunca negativo: su total_cop o, si no lo trae,
    unit_price_cop x qty. 0 si la linea no es un dict o trae un dato que no es un monto (dato viejo)."""
    if not isinstance(producto, dict):
        return Decimal("0")
    try:
        if producto.get("total_cop") is not None:
            monto = redondear_peso(producto["total_cop"])
        else:
            monto = redondear_peso(Decimal(str(producto.get("unit_price_cop") or 0))
                                   * Decimal(str(producto.get("qty") or 0)))
    except (ValueError, InvalidOperation):
        return Decimal("0")
    return max(Decimal("0"), monto)


def repartir_anticipo_por_linea(montos, anticipo) -> list:
    """U19: reparte `anticipo` (pesos enteros) entre las lineas en proporcion a sus `montos`, por el metodo del mayor
    residuo: cada linea recibe el piso de su parte exacta y los pesos que faltan van, de a uno, a las de mayor parte
    decimal (en empate, la que va primero). La suma da exactamente el anticipo y cada linea queda a menos de $1 de su
    parte exacta; una linea en 0 recibe 0. Lista de Decimal del mismo largo; ceros si el anticipo o la suma de los
    montos no son positivos; [] sin lineas. Con descuento global se reparte sobre el valor antes del descuento: la
    proporcion es la misma. Se hace con enteros para no perder precision.
    Si el anticipo es MAYOR que la suma de los montos (datos que no cuadran: p. ej. C10 con un pedido vigente cuyo
    total no es el de las lineas de la COT), igual se reparte todo en proporcion y la suma cuadra, pero una linea puede
    recibir mas que su propio valor ([100, 100] con 300 -> [150, 150])."""
    pesos_linea = [max(0, int(redondear_peso(m))) for m in montos]
    objetivo = int(redondear_peso(anticipo))
    total = sum(pesos_linea)
    if objetivo <= 0 or total <= 0:
        return [Decimal("0") for _ in pesos_linea]
    partes = [objetivo * p // total for p in pesos_linea]
    restos = [objetivo * p % total for p in pesos_linea]
    faltan = objetivo - sum(partes)
    for i in sorted(range(len(partes)), key=lambda i: (-restos[i], i))[:faltan]:
        partes[i] += 1
    return [Decimal(p) for p in partes]


def anticipo_del_pedido(so):
    """(requerido, pendiente) del anticipo de un Pedido de Venta: la UNICA cuenta que usan
    recalculate_sale_order_state (PENDIENTE_ANTICIPO) y GET /pedidos/{id} (anticipo_pendiente).

    requerido = anticipo_requerido(total, anticipo_pct_snapshot) (60 si el snapshot falta); pagado = total - saldo
    redondeado al peso (los pedidos viejos con centavos no quedan debiendo $0,15); pendiente = requerido - pagado,
    nunca negativo. Un pedido CANCELADO no debe nada: su pendiente es 0 (su dinero puede haberse trasladado)."""
    pct = so.anticipo_pct_snapshot if so.anticipo_pct_snapshot is not None else PCT_ANTICIPO_POR_DEFECTO
    requerido = anticipo_requerido(so.total_cop, pct)
    if so.estado == "CANCELADO":
        return requerido, Decimal("0")
    pagado = redondear_peso(Decimal(str(so.total_cop or 0)) - Decimal(str(so.saldo_cop or 0)))
    return requerido, max(Decimal("0"), requerido - pagado)


# ─── Saldo a favor de pedidos cancelados (R6) ─────────────────────────────────────────────────────────

def saldos_a_favor_de_cotizacion(db, cot_id, bloquear=False) -> list:
    """Dinero de los pedidos CANCELADO de la cotizacion que todavia no se traslado a otro pedido.

    Lista de {'pedido': SaleOrder, 'pagos': [...], 'monto': Decimal}, una por pedido cancelado con saldo > 0, del
    mas viejo al mas nuevo. 'pagos' son sus pagos CONFIRMADO de ingreso y de devolucion; monto = ingresos -
    devoluciones (las mismas cuentas que cancel_sale_order), en pesos enteros. Un pago ya trasladado queda
    TRASLADADO y no vuelve a contar. Los pagos automaticos 'CONVERSION_COTIZACION' (anteriores a N1, nadie los
    verifico) no son saldo a favor: no se cuentan ni se trasladan, y siguen CONFIRMADO en su pedido.
    bloquear=True los lee con FOR UPDATE (antes de marcarlos)."""
    from sqlalchemy import func
    from app.models.erp_documents import SaleOrder
    from app.models.fase4 import SaleOrderPayment
    cancelados = (db.query(SaleOrder)
                  .filter(SaleOrder.cot_id == cot_id, SaleOrder.estado == "CANCELADO")
                  .order_by(SaleOrder.id.asc()).all())
    if not cancelados:
        return []
    consulta = (db.query(SaleOrderPayment)
                .filter(SaleOrderPayment.sale_order_id.in_([so.id for so in cancelados]),
                        SaleOrderPayment.estado == "CONFIRMADO",
                        SaleOrderPayment.tipo.in_(TIPOS_PAGO_INGRESO + ("DEVOLUCION",)),
                        func.coalesce(SaleOrderPayment.metodo_pago, "") != METODO_PAGO_SIN_VERIFICAR)
                .order_by(SaleOrderPayment.id.asc()))
    if bloquear:
        consulta = consulta.with_for_update()
    pagos = consulta.all()
    saldos = []
    for so in cancelados:
        propios = [p for p in pagos if p.sale_order_id == so.id]
        neto = sum((-p.monto if p.tipo == "DEVOLUCION" else p.monto for p in propios), Decimal("0"))
        monto = redondear_peso(neto)
        if monto > 0:
            saldos.append({"pedido": so, "pagos": propios, "monto": monto})
    return saldos


# ─── Orden de pago (PXP) de un pedido cancelado (H45, R12) ────────────────────────────────────────────────────────

def anular_pxps_de_pedido(db, so, autor, motivo=None) -> list:
    """Cancela las ordenes de pago PENDIENTE del pedido `so` que se esta cancelando y devuelve las que cancelo.

    Solo cambia la sesion (db.add y atributos), SIN commit: el llamador (PATCH /ventas/pedidos/{id} o POST
    /ventas/pedidos/{id}/cancelar) la deja en el mismo commit que la cancelacion del pedido. Las PXP que no estan
    PENDIENTE ni CANCELADA (una PAGADA) no se tocan: queda en la Actividad del pedido el aviso 'PXP_REVISAR' para
    revisar la devolucion o el saldo a favor del cliente. R12: si so.pxp_id / so.pxp_numero apuntaban a una PXP
    que se cancelo, quedan en None (la lista y el detalle no se contradicen)."""
    import datetime
    from app.core.textos_actividad import etiqueta_estado
    from app.models.erp_documents import ActivityLog, PaymentPending
    ahora = datetime.datetime.utcnow()
    canceladas = []
    pxps = (db.query(PaymentPending).filter(PaymentPending.ven_id == so.id)
            .order_by(PaymentPending.id.asc()).with_for_update().all())
    for p in pxps:
        if p.estado == "CANCELADA":
            continue
        if p.estado != "PENDIENTE":
            db.add(ActivityLog(
                entity_type="VEN", entity_id=so.id, entity_numero=so.numero, action="PXP_REVISAR",
                description=f"La orden de pago {p.numero} está {etiqueta_estado('PXP', p.estado).lower()}: revisar "
                            f"devolución o saldo a favor del cliente",
                user_name=autor))
            continue
        p.estado = "CANCELADA"
        p.updated_at = ahora
        nota = f"Cancelada por la cancelación del pedido {so.numero}" + (f": {motivo}" if motivo else "")
        p.notas = f"{p.notas}\n{nota}" if p.notas else nota
        db.add(ActivityLog(
            entity_type="PXP", entity_id=p.id, entity_numero=p.numero, action="ESTADO_CHANGED",
            description=f"Orden de pago cancelada por la cancelación del pedido {so.numero}",
            old_estado="PENDIENTE", new_estado="CANCELADA", user_name=autor))
        db.add(ActivityLog(
            entity_type="VEN", entity_id=so.id, entity_numero=so.numero, action="PXP_CANCELADA",
            description=f"Orden de pago {p.numero} cancelada (pendiente: {pesos(p.monto_pendiente)})",
            user_name=autor))
        canceladas.append(p)
    if so.pxp_id in {p.id for p in canceladas}:
        so.pxp_id = None
    if so.pxp_numero in {p.numero for p in canceladas}:
        so.pxp_numero = None
    return canceladas
