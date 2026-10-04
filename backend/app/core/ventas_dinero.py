"""Dinero de Ventas en pesos enteros (H42) y anticipo de la cotizacion (H36+H43, N1, reglas R2/R3/R6).

Lo importan erp_ventas.py y erp_ventas_fase4.py sin import circular (fase4 no importa erp_ventas). Todo monto
de COT / PVEN / PXP se guarda y se muestra al peso: exacto, nunca a la centena ni al mil. El frontend tiene el
espejo de redondeo y formato en frontend/src/lib/pesos.js (redondearPeso / formatoPesos).

Sin FastAPI ni DB, salvo pct_anticipo_cotizacion y saldos_a_favor_de_cotizacion, que leen con la sesion que
reciben (los modelos se importan dentro de esas funciones para que el resto siga siendo puro).
"""
import unicodedata
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

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
    """Entre 0 y 100 y a 2 decimales (ROUND_HALF_UP): el mismo % que guarda el pedido en anticipo_pct_snapshot
    (NUMERIC(5,2)), para que el requerido de la conversion y el del pedido salgan siempre iguales."""
    return max(Decimal("0"), min(Decimal(str(pct)), _CIEN)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def pct_anticipo_cotizacion(cot, db, sc=None):
    """(pct, modalidad) del anticipo que exige la cotizacion. pct entre 0 y 100 (min(pct, 100)), a 2 decimales.

    - R3: si tiene anticipo manual (anticipo_pct_manual no es None), ese.
    - Si tiene SC: el % de su modalidad de pago (R2), o 60 si no se reconoce.
    - Sin SC y con total > 0: el % que ya tenia (anticipo_cop * 100 / total_cop): la COT del Cotizador Rapido
      conserva su 60% y las de prueba con anticipo 0 conservan el 0.
    - Sin SC y sin total: 60.
    El % sale a 2 decimales (lo que cabe en el snapshot del pedido): un dato viejo de 66,666...% exige el 66,67%,
    y el pedido creado con ese % pide exactamente lo mismo que se verifico al crearlo.
    modalidad es el texto de la modalidad de la SC (None sin SC), tambien cuando el % es el manual.
    `sc` evita releer la SC cuando el llamador ya la tiene (update_solicitud)."""
    if sc is None and cot.sc_id:
        from app.models.erp_documents import CustomerRequest
        sc = db.query(CustomerRequest).filter(CustomerRequest.id == cot.sc_id).first()
    modalidad = sc.modalidad_pago if sc is not None else None
    if cot.anticipo_pct_manual is not None:
        return _pct_entre_0_y_100(cot.anticipo_pct_manual), modalidad
    if sc is not None:
        pct = pct_anticipo_de_modalidad(modalidad)
        return _pct_entre_0_y_100(PCT_ANTICIPO_POR_DEFECTO if pct is None else pct), modalidad
    total = Decimal(str(cot.total_cop or 0))
    if total > 0:
        return _pct_entre_0_y_100(Decimal(str(cot.anticipo_cop or 0)) * _CIEN / total), None
    return _pct_entre_0_y_100(PCT_ANTICIPO_POR_DEFECTO), None


def anticipo_requerido(total, pct) -> Decimal:
    """round(total x pct / 100) en pesos enteros, sobre el total ya redondeado al peso."""
    return redondear_peso(redondear_peso(total) * Decimal(str(pct)) / _CIEN)


def anticipo_del_pedido(so):
    """(requerido, pendiente) del anticipo de un Pedido de Venta: la UNICA cuenta que usan
    recalculate_sale_order_state (PENDIENTE_ANTICIPO) y GET /pedidos/{id} (anticipo_pendiente).

    requerido = anticipo_requerido(total, anticipo_pct_snapshot) (60 si el snapshot falta), igual que al convertir
    la cotizacion; pagado = total - saldo redondeado al peso (los pedidos viejos con centavos no quedan debiendo
    $0,15); pendiente = requerido - pagado, nunca negativo."""
    pct = so.anticipo_pct_snapshot if so.anticipo_pct_snapshot is not None else PCT_ANTICIPO_POR_DEFECTO
    requerido = anticipo_requerido(so.total_cop, pct)
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
