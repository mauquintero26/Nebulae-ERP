"""La regla unica de atraso, resolucion y pasos de Ventas (Bloque 4, T1C; R8 y C5).

Un solo modulo en el backend: no se crean core/flujo_ventas.py ni api/v1/flujo.py (R27). Lo usan (desde T6A en adelante)
alertas_resumen, /ventas/flujo y /ventas/hub/documentos (ventas_hub.py), /ventas/stats y las tres listas. Su espejo en el
frontend es SOLO lib/hub-ventas.js (clasificar, columnaHub, esNoResuelto y esAtrasado), con la prueba de paridad de T2
(test_paridad_reglas_ventas.py); los filtros f_* son espejo de listas-ventas.js (RP3). Sin FastAPI; las funciones que
cuentan reciben la sesion y solo LEEN.

La tabla de clasificar (RP2), en este orden:
  1. Soporte (tipo_solicitud 'Soporte Tecnico' o estado 'N/A_SOPORTE') -> None: fuera del semaforo comercial, del flujo,
     de las tarjetas y del Hub (R8), igual que get_alertas. La pastilla roja global (AlertasBadge) puede bajar.
  2. CERRADO: SC CANCELADA, COT RECHAZADA, VEN en ESTADOS_VEN_CERRADOS.
  3. SC con documentos activos (sc_con_cot_activa: una COT activa o un pedido vigente, D16) -> ACCION_TOMADA.
  4. SC CONFIRMADA sin documentos activos -> NO_RESUELTO; ATRASADO solo con confirmacion_vigente y el plazo pasado.
  5. COT CONFIRMADA: con pedido vigente -> ACCION_TOMADA; sin el -> NO_RESUELTO, y ATRASADO solo con confirmacion_vigente
     y el plazo pasado (cot_confirmada_sin_pedido = «Como pendiente, y como atrasada si pasan los dias de alerta»).
  6. Estado en ESTADOS_NO_RESOLUCION (los 8 de alertas_resumen, ASIGNADA incluida, sin EN_GESTION) -> NO_RESUELTO, o
     ATRASADO con el plazo pasado.
  7. COT VENCIDA -> NO_RESUELTO, nunca ATRASADO.
  8. El resto -> ACCION_TOMADA.
«El plazo pasado» es ESTRICTAMENTE mas de dias×24 h sin movimiento (horas_sin_mov > dias × 24; en SQL
coalesce(updated_at, created_at) < ahora − dias), como el '<' de alertas_resumen: exactamente dias×24 h no es atrasado.

contar_atrasados es la COPIA de las cinco consultas de alertas_resumen (erp_ventas.py, tal como la dejan B2 y B3; T6A la
mueve aqui). Lo que cambia, y nada mas: las SC de Soporte quedan fuera (R8) y sc_confirmadas_sin_accion usa la misma
subconsulta de «SC sin documentos activos» que sc (D16), para que la fila y el contador nunca se contradigan.

Exporta: TIPO_SOPORTE, ESTADO_SOPORTE, TIPOS, ESTADOS_NO_RESOLUCION, ESTADOS_ACCION_TOMADA, ESTADOS_CERRADOS, RANGO,
PASOS_FLUJO_VENTAS, COLUMNAS_HUB, DIAS_ALERTA_POR_DEFECTO, ESTADOS_CON_CAMBIOS_VIGENTES; sin_soporte, cot_activa_de_sc,
pven_vigente_de_sc, sc_sin_documentos_activos, sc_con_documentos_activos, pven_vigente_de_cot,
filtro_cambios_cliente_vigentes; horas_desde_movimiento, clasificar, columna_hub, expresiones, expr_columna_hub,
cond_paso, leer_dias_alerta, contar_atrasados, contar_no_resueltos, resumen_flujo_ventas; f_sc_activa, f_sc_espera_cot,
f_cot_confirmada, f_cot_activa, f_cot_con_pedido, f_cot_pedido_caido, f_pven_en_curso y f_pven_con_dinero.
"""
import math
from collections.abc import Mapping
from datetime import timedelta, timezone
from types import MappingProxyType

from sqlalchemy import Integer, and_, case, cast, extract, false, func, literal, null, or_, select
from sqlalchemy.orm import Session

from app.core import admin_config
from app.core.estados_pedido import ESTADOS_VEN_CERRADOS, ESTADOS_VEN_SIN_DINERO
from app.core.fechas import ahora_utc, iso_z
from app.core.seguimiento_confirmacion import AGOTADO, PENDIENTE
from app.models.confirmation import SeguimientoConfirmacion
from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation

# ─── Constantes ──────────────────────────────────────────────────────────────────────────────────────────────────────

TIPO_SOPORTE = "Soporte Tecnico"
ESTADO_SOPORTE = "N/A_SOPORTE"

TIPOS = ("SC", "COT", "VEN")
_ALIAS_TIPO = {"PVEN": "VEN"}   # fase4 y el flujo llaman PVEN al pedido; el Hub, VEN

# La lista no_resolucion de alertas_resumen (erp_ventas.py), en su orden: la comparten SC, COT y VEN.
ESTADOS_NO_RESOLUCION = ("BORRADOR", "PENDIENTE_CONFIRMACION", "ASIGNADA", "ENVIADA",
                         "PENDIENTE_COMPRA", "PENDIENTE_PAGO", "EN_PROCESO", "EN_TRANSITO")

ESTADOS_CERRADOS = MappingProxyType({
    "SC": ("CANCELADA",),
    "COT": ("RECHAZADA",),
    "VEN": ESTADOS_VEN_CERRADOS,
})

# Los estados conocidos de cada tipo (textos_actividad.ETIQUETAS_ESTADO) que clasificar deja en ACCION_TOMADA:
# CONFIRMADA solo con su documento siguiente (reglas 3 y 5); el resto por la regla 8 (los heredados de la SC; los del
# pedido fuera de ESTADOS_NO_RESOLUCION y de los cerrados, como alertas_resumen).
ESTADOS_ACCION_TOMADA = MappingProxyType({
    "SC": ("CONFIRMADA", "COTIZADA", "EN_ESPERA_CONFIRMACION", "RECHAZADA", "VENCIDA"),
    "COT": ("CONFIRMADA",),
    "VEN": ("LISTO_ENTREGA", "PAGADO", "PENDIENTE_ANTICIPO", "CONFIRMADO", "PARCIALMENTE_DISPONIBLE", "DISPONIBLE",
            "PENDIENTE_SALDO", "LISTO_PARA_ENTREGA", "PARCIALMENTE_ENTREGADO"),
})

RANGO = MappingProxyType({"ATRASADO": 0, "NO_RESUELTO": 1, "ACCION_TOMADA": 2, "CERRADO": 3})

PASOS_FLUJO_VENTAS = ("SC", "COT", "PVEN", "ENTREGADO", "FACTURADO")

# Las columnas del tablero del Hub (B1 T9; C7: se conservan, mas DEVUELTO_TOTAL -> Cancelado).
COLUMNAS_HUB = ("No Resuelto", "En Gestión", "Acción Tomada", "Cancelado")
_ESTADOS_COLUMNA_CANCELADO = ("CANCELADO", "CANCELADA", "RECHAZADA", "DEVUELTO_TOTAL")
_ESTADOS_COLUMNA_ACCION = ("ENTREGADO", "FACTURADO", "CONFIRMADA", "LISTO_ENTREGA")
_ESTADOS_COLUMNA_GESTION = ("EN_PROCESO", "ENVIADA", "EN_TRANSITO")

DIAS_ALERTA_POR_DEFECTO = 2
_CLAVES_DIAS_ALERTA = (("SC", "alerta_sc_dias"), ("COT", "alerta_cot_dias"), ("VEN", "alerta_ven_dias"))

# B3 T6 (RP12.2): copia con nombre publico de _ESTADOS_CON_CAMBIOS_VIGENTES (erp_ventas.py). La marca de cambios del
# cliente cuenta mientras el documento sigue en manos del asesor: la SC en Asignada o Nueva y la COT en Borrador. T6A hace
# que erp_ventas la importe (y apunta _cambios_cliente_vigentes a esta constante antes de borrar la suya, C3).
ESTADOS_CON_CAMBIOS_VIGENTES = MappingProxyType({"SC": ("ASIGNADA", "BORRADOR"), "COT": ("BORRADOR",)})


def _tipo(tipo) -> str:
    t = _ALIAS_TIPO.get(tipo, tipo)
    if t not in TIPOS:
        raise ValueError(f"Tipo de documento no válido: {tipo!r}")
    return t


def _dias_del_tipo(dias, tipo: str):
    """Los dias de alerta del tipo: `dias` es el dict de leer_dias_alerta ({'SC', 'COT', 'VEN'}) o ya un numero."""
    return dias[tipo] if isinstance(dias, Mapping) else dias


# ─── Subconsultas (RP11, D16) ────────────────────────────────────────────────────────────────────────────────────────

def sin_soporte(modelo=CustomerRequest):
    """RP11.2: la SC no es de Soporte Tecnico. Un tipo_solicitud NULL NO es Soporte (get_alertas lo dejaba fuera con
    `tipo_solicitud != 'Soporte Tecnico'`); el estado N/A_SOPORTE si lo es, aunque se le haya corregido el tipo."""
    return and_(or_(modelo.tipo_solicitud.is_(None), modelo.tipo_solicitud != TIPO_SOPORTE),
                modelo.estado != ESTADO_SOPORTE)


def cot_activa_de_sc(sc=CustomerRequest):
    """EXISTS: la SC tiene una COT activa (cualquiera menos RECHAZADA; VENCIDA cuenta, N4). Primera subconsulta de
    _sc_sin_documentos_activos."""
    return (select(SalesQuotation.id)
            .where(SalesQuotation.sc_id == sc.id, SalesQuotation.estado != "RECHAZADA")
            .exists())


def pven_vigente_de_sc(sc=CustomerRequest):
    """EXISTS: un pedido de venta no CANCELADO vinculado a la SC por sc_id o por el cot_id de CUALQUIER COT de la SC
    (tambien una RECHAZADA). Segunda subconsulta de _sc_sin_documentos_activos, con su correlate explicito: el SELECT de
    las COT va dos niveles adentro y, sin el, SQLAlchemy le pone su propio customer_requests."""
    cots_de_la_sc = (select(SalesQuotation.id).where(SalesQuotation.sc_id == sc.id)
                     .correlate(sc))
    return (select(SaleOrder.id)
            .where(SaleOrder.estado != "CANCELADO",
                   or_(SaleOrder.sc_id == sc.id, SaleOrder.cot_id.in_(cots_de_la_sc)))
            .exists())


def sc_sin_documentos_activos(sc=CustomerRequest):
    """RP11.1: la copia exacta de _sc_sin_documentos_activos (erp_ventas.py): ninguna COT activa y ningun pedido vigente.
    La usan contar_atrasados (sc y, por D16, sc_confirmadas_sin_accion) y cond_paso('SC'). T6A borra la de erp_ventas y
    la importa de aqui."""
    return and_(~cot_activa_de_sc(sc), ~pven_vigente_de_sc(sc))


def sc_con_documentos_activos(sc=CustomerRequest):
    """D16: la subconsulta `sc_con_cot_activa` de expresiones y de expr_columna_hub: una COT activa o un pedido vigente
    (la negacion de sc_sin_documentos_activos). Una SC con pedido vigente y sin COT activa cuenta como resuelta en todas
    partes."""
    return or_(cot_activa_de_sc(sc), pven_vigente_de_sc(sc))


def pven_vigente_de_cot(cot=SalesQuotation):
    """EXISTS: la COT tiene un pedido de venta que no esta CANCELADO (H46: un pedido cancelado no cuenta como «el asesor
    ya actuo»)."""
    return select(SaleOrder.id).where(SaleOrder.cot_id == cot.id, SaleOrder.estado != "CANCELADO").exists()


def filtro_cambios_cliente_vigentes(modelo, entidad: str):
    """RP12.2: copia con nombre publico de _filtro_cambios_cliente_vigentes (erp_ventas.py): la marca de cambios del
    cliente de la SC ('SC') o la COT ('COT') sigue vigente (ESTADOS_CON_CAMBIOS_VIGENTES), como filtro SQL."""
    return and_(modelo.cambios_cliente_at.isnot(None), modelo.estado.in_(ESTADOS_CON_CAMBIOS_VIGENTES[entidad]))


# ─── La regla en Python (RP2): espejo de clasificar y columnaHub de hub-ventas.js ────────────────────────────────────

def horas_desde_movimiento(updated_at, created_at, ahora=None):
    """Horas desde el ultimo movimiento: updated_at o, si no hay, created_at (como `updated_at || created_at` del
    frontend). Las fechas son UTC sin zona; una con zona se pasa a UTC. None si no hay ninguna."""
    t = updated_at if updated_at is not None else created_at
    if t is None:
        return None
    if t.tzinfo is not None:
        t = t.astimezone(timezone.utc).replace(tzinfo=None)
    return ((ahora if ahora is not None else ahora_utc()) - t).total_seconds() / 3600


def clasificar(tipo, estado, horas_sin_mov, dias_alerta, *, sc_con_cot_activa=False, cot_con_pedido_vigente=False,
               confirmacion_vigente=False, es_soporte=False):
    """'ATRASADO', 'NO_RESUELTO', 'ACCION_TOMADA' o 'CERRADO' (o None para Soporte), con la tabla de RP2 del docstring
    del modulo.

    - tipo: 'SC', 'COT' o 'VEN' ('PVEN' es alias de 'VEN'); otro -> ValueError.
    - horas_sin_mov: horas desde coalesce(updated_at, created_at) (horas_desde_movimiento); None no supera nada.
    - dias_alerta: el dict de leer_dias_alerta ({'SC', 'COT', 'VEN'}) o el numero de dias del tipo.
    - sc_con_cot_activa: la SC tiene documentos activos (COT activa o pedido vigente, D16).
    - cot_con_pedido_vigente: la COT tiene un pedido que no esta CANCELADO.
    - confirmacion_vigente: la del dict de la fila (SC: CONFIRMADA con gate1_confirmed_at; COT: gate2_confirmed_at).
    - es_soporte: la SC es de Soporte Tecnico (el estado N/A_SOPORTE tambien lo dice).
    """
    tipo = _tipo(tipo)
    if es_soporte or estado == ESTADO_SOPORTE:
        return None
    if estado in ESTADOS_CERRADOS[tipo]:
        return "CERRADO"
    paso_el_plazo = horas_sin_mov is not None and horas_sin_mov > _dias_del_tipo(dias_alerta, tipo) * 24
    if tipo == "SC" and sc_con_cot_activa:
        return "ACCION_TOMADA"
    if tipo in ("SC", "COT") and estado == "CONFIRMADA":
        if tipo == "COT" and cot_con_pedido_vigente:
            return "ACCION_TOMADA"
        return "ATRASADO" if confirmacion_vigente and paso_el_plazo else "NO_RESUELTO"
    if estado in ESTADOS_NO_RESOLUCION:
        return "ATRASADO" if paso_el_plazo else "NO_RESUELTO"
    if tipo == "COT" and estado == "VENCIDA":
        return "NO_RESUELTO"
    return "ACCION_TOMADA"


def columna_hub(tipo, estado, sc_con_cot_activa=False) -> str:
    """La columna del tablero del Hub ('No Resuelto', 'En Gestión', 'Acción Tomada' o 'Cancelado'): la regla de
    getKanbanCol del Bloque 1 (ventas/page.tsx), mas DEVUELTO_TOTAL -> 'Cancelado' (C7). sc_con_cot_activa es la de D16
    (documentos activos). No es la resolucion: una COT CONFIRMADA sin pedido va a 'Acción Tomada', como hoy. Las SC de
    Soporte no llegan al Hub (quien llama las filtra con sin_soporte)."""
    tipo = _tipo(tipo)
    if tipo == "SC" and estado == "CONFIRMADA" and not sc_con_cot_activa:
        return "No Resuelto"   # H3: falta cotizarla
    if tipo == "SC" and estado in ESTADOS_NO_RESOLUCION and sc_con_cot_activa:
        return "Acción Tomada"   # R20: la alerta la lleva su cotizacion o su pedido
    if estado in _ESTADOS_COLUMNA_CANCELADO:
        return "Cancelado"
    if estado in _ESTADOS_COLUMNA_ACCION:
        return "Acción Tomada"
    if estado in _ESTADOS_COLUMNA_GESTION:
        return "En Gestión"
    return "No Resuelto"


# ─── La misma regla en SQL ───────────────────────────────────────────────────────────────────────────────────────────

def _dias_desde(columna, ahora):
    """Dias completos (piso) desde `columna` hasta `ahora`; nunca negativo; 0 sin fecha (como diasDesde del frontend)."""
    segundos = extract("epoch", literal(ahora) - columna)
    return func.greatest(0, cast(func.floor(segundos / 86400), Integer))


def expresiones(tipo, modelo, dias, ahora=None) -> dict:
    """Columnas SQL de la regla para las filas de `modelo` (CustomerRequest, SalesQuotation o SaleOrder, o un alias),
    con su nombre como label:

    - rango: 0 atrasado, 1 no resuelto, 2 accion tomada, 3 cerrado (RANGO), NULL para Soporte. Es la tabla de clasificar
      en un CASE, en el mismo orden; el atraso es coalesce(updated_at, created_at) < ahora − dias (estricto).
    - dias_sin_mov: dias completos desde coalesce(updated_at, created_at); dias_creado: desde created_at (Antiguedad).
    - sc_con_cot_activa: en la SC, sc_con_documentos_activos (D16); en COT y VEN, false.
    - cot_con_pedido_vigente: en la COT, pven_vigente_de_cot; en SC y VEN, false.
    `dias` es el dict de leer_dias_alerta (o el numero de dias del tipo); `ahora` es UTC sin zona (por defecto,
    ahora_utc())."""
    tipo = _tipo(tipo)
    ahora = ahora if ahora is not None else ahora_utc()
    movimiento = func.coalesce(modelo.updated_at, modelo.created_at)
    paso_el_plazo = movimiento < ahora - timedelta(days=_dias_del_tipo(dias, tipo))
    sin_resolver = case((paso_el_plazo, RANGO["ATRASADO"]), else_=RANGO["NO_RESUELTO"])
    con_docs, con_pedido = false(), false()
    if tipo == "SC":
        con_docs = sc_con_documentos_activos(modelo)
        confirmada_atrasada = and_(modelo.gate1_confirmed_at.isnot(None), paso_el_plazo)
        ramas = [
            (~sin_soporte(modelo), null()),
            (modelo.estado.in_(ESTADOS_CERRADOS["SC"]), RANGO["CERRADO"]),
            (con_docs, RANGO["ACCION_TOMADA"]),
            (modelo.estado == "CONFIRMADA",
             case((confirmada_atrasada, RANGO["ATRASADO"]), else_=RANGO["NO_RESUELTO"])),
            (modelo.estado.in_(ESTADOS_NO_RESOLUCION), sin_resolver),
        ]
    elif tipo == "COT":
        con_pedido = pven_vigente_de_cot(modelo)
        confirmada_atrasada = and_(modelo.gate2_confirmed_at.isnot(None), paso_el_plazo)
        ramas = [
            (modelo.estado.in_(ESTADOS_CERRADOS["COT"]), RANGO["CERRADO"]),
            (and_(modelo.estado == "CONFIRMADA", con_pedido), RANGO["ACCION_TOMADA"]),
            (modelo.estado == "CONFIRMADA",
             case((confirmada_atrasada, RANGO["ATRASADO"]), else_=RANGO["NO_RESUELTO"])),
            (modelo.estado.in_(ESTADOS_NO_RESOLUCION), sin_resolver),
            (modelo.estado == "VENCIDA", RANGO["NO_RESUELTO"]),
        ]
    else:
        ramas = [
            (modelo.estado.in_(ESTADOS_CERRADOS["VEN"]), RANGO["CERRADO"]),
            (modelo.estado.in_(ESTADOS_NO_RESOLUCION), sin_resolver),
        ]
    return {
        "rango": case(*ramas, else_=RANGO["ACCION_TOMADA"]).label("rango"),
        "dias_sin_mov": _dias_desde(movimiento, ahora).label("dias_sin_mov"),
        "dias_creado": _dias_desde(modelo.created_at, ahora).label("dias_creado"),
        "sc_con_cot_activa": con_docs.label("sc_con_cot_activa"),
        "cot_con_pedido_vigente": con_pedido.label("cot_con_pedido_vigente"),
    }


def expr_columna_hub(tipo, modelo):
    """columna_hub en SQL (un CASE de texto), con la subconsulta de D16 para la SC."""
    tipo = _tipo(tipo)
    ramas = []
    if tipo == "SC":
        con_docs = sc_con_documentos_activos(modelo)
        ramas += [(and_(modelo.estado == "CONFIRMADA", ~con_docs), "No Resuelto"),
                  (and_(modelo.estado.in_(ESTADOS_NO_RESOLUCION), con_docs), "Acción Tomada")]
    ramas += [(modelo.estado.in_(_ESTADOS_COLUMNA_CANCELADO), "Cancelado"),
              (modelo.estado.in_(_ESTADOS_COLUMNA_ACCION), "Acción Tomada"),
              (modelo.estado.in_(_ESTADOS_COLUMNA_GESTION), "En Gestión")]
    return case(*ramas, else_="No Resuelto")


def cond_paso(paso):
    """(modelo, condicion) del paso del flujo de Ventas; cada documento cae en un solo paso (o en ninguno):
    - SC: sin Soporte, no CANCELADA y sin documentos activos (sc_sin_documentos_activos, RP11);
    - COT: no RECHAZADA y sin pedido vigente (VENCIDA cuenta como abierta, Bloque 1);
    - PVEN: estado fuera de ESTADOS_VEN_CERRADOS;
    - ENTREGADO y FACTURADO: ese estado.
    Un paso que no esta en PASOS_FLUJO_VENTAS -> ValueError."""
    if paso == "SC":
        return CustomerRequest, and_(sin_soporte(CustomerRequest), CustomerRequest.estado != "CANCELADA",
                                     sc_sin_documentos_activos())
    if paso == "COT":
        return SalesQuotation, and_(SalesQuotation.estado != "RECHAZADA", ~pven_vigente_de_cot())
    if paso == "PVEN":
        return SaleOrder, SaleOrder.estado.notin_(ESTADOS_VEN_CERRADOS)
    if paso in ("ENTREGADO", "FACTURADO"):
        return SaleOrder, SaleOrder.estado == paso
    raise ValueError(f"Paso del flujo de Ventas no válido: {paso!r}")


# ─── Consultas (solo lectura) ────────────────────────────────────────────────────────────────────────────────────────

def _entero_o_defecto(valor) -> int:
    """El valor como lo lee _get_alert_days: int(valor), y DIAS_ALERTA_POR_DEFECTO si falta o no es un entero."""
    try:
        return int(valor)
    except (TypeError, ValueError):
        return DIAS_ALERTA_POR_DEFECTO


def leer_dias_alerta(db: Session) -> dict:
    """RP71: {'SC', 'COT', 'VEN'} con los dias de alerta de admin_config (alerta_sc_dias, alerta_cot_dias y
    alerta_ven_dias) en UNA consulta. Cada valor se lee como _get_alert_days: int(valor), y 2 si falta o no es un entero;
    sin topes nuevos. T6A hace que _get_alert_days delegue aqui."""
    valores = admin_config.leer_config(db, [clave for _, clave in _CLAVES_DIAS_ALERTA])
    return {tipo: _entero_o_defecto(valores.get(clave)) for tipo, clave in _CLAVES_DIAS_ALERTA}


def contar_atrasados(db: Session, dias, ahora=None) -> dict:
    """{'sc', 'sc_confirmadas_sin_accion', 'cot', 'cot_confirmadas_sin_accion', 'ven'}: las cinco consultas de
    alertas_resumen, COPIADAS (T6A las mueve y alertas_resumen suma estas cinco). `dias` = {'SC', 'COT', 'VEN'}
    (leer_dias_alerta); `ahora` UTC sin zona (por defecto, ahora_utc(), como su datetime.utcnow()).

    Igual que alertas_resumen: los 8 ESTADOS_NO_RESOLUCION, solo updated_at y el '<' estricto; una SC con documentos
    activos no cuenta (la alerta la lleva su COT o su pedido); una SC CONFIRMADA con gate1 y una COT CONFIRMADA con gate2
    y sin pedido vigente cuentan con los mismos dias. Diferencias permitidas: sin las SC de Soporte (R8), y
    sc_confirmadas_sin_accion con sc_sin_documentos_activos (D16) en vez de «sin COT activa»."""
    ahora = ahora if ahora is not None else ahora_utc()

    def limite(tipo):
        return ahora - timedelta(days=_dias_del_tipo(dias, tipo))

    sc_atrasadas = db.query(CustomerRequest).filter(
        CustomerRequest.estado.in_(ESTADOS_NO_RESOLUCION),
        CustomerRequest.updated_at < limite("SC"),
        sc_sin_documentos_activos(),
        sin_soporte(CustomerRequest),
    ).count()
    cot_atrasadas = db.query(SalesQuotation).filter(
        SalesQuotation.estado.in_(ESTADOS_NO_RESOLUCION),
        SalesQuotation.updated_at < limite("COT"),
    ).count()
    ven_atrasados = db.query(SaleOrder).filter(
        SaleOrder.estado.in_(ESTADOS_NO_RESOLUCION),
        SaleOrder.updated_at < limite("VEN"),
    ).count()
    sc_confirmadas_sin_accion = db.query(CustomerRequest).filter(
        CustomerRequest.estado == "CONFIRMADA",
        CustomerRequest.gate1_confirmed_at.isnot(None),
        CustomerRequest.updated_at < limite("SC"),
        sc_sin_documentos_activos(),   # D16: la misma subconsulta que la fila (expresiones) y que sc_atrasadas
        sin_soporte(CustomerRequest),
    ).count()
    cot_confirmadas_sin_accion = db.query(SalesQuotation).filter(
        SalesQuotation.estado == "CONFIRMADA",
        SalesQuotation.gate2_confirmed_at.isnot(None),
        SalesQuotation.updated_at < limite("COT"),
        ~pven_vigente_de_cot(),   # H46: un pedido CANCELADO no cuenta como «el asesor ya actuo»
    ).count()
    return {"sc": sc_atrasadas, "sc_confirmadas_sin_accion": sc_confirmadas_sin_accion, "cot": cot_atrasadas,
            "cot_confirmadas_sin_accion": cot_confirmadas_sin_accion, "ven": ven_atrasados}


_MODELOS = (("sc", "SC", CustomerRequest), ("cot", "COT", SalesQuotation), ("ven", "VEN", SaleOrder))


def contar_no_resueltos(db: Session) -> dict:
    """RP13: {'sc', 'cot', 'ven'} con las filas cuyo rango de expresiones es ATRASADO o NO_RESUELTO, sin Soporte: entran
    la SC CONFIRMADA sin documentos activos, la COT CONFIRMADA sin pedido vigente y la COT VENCIDA. La suma de los dos
    rangos no depende de los dias ni de la hora (solo los reparte), asi que no los recibe."""
    ahora = ahora_utc()
    pendientes = (RANGO["ATRASADO"], RANGO["NO_RESUELTO"])
    out = {}
    for clave, tipo, modelo in _MODELOS:
        condiciones = [expresiones(tipo, modelo, 0, ahora)["rango"].in_(pendientes)]
        if tipo == "SC":
            condiciones.append(sin_soporte(modelo))
        out[clave] = db.scalar(select(func.count(modelo.id)).where(*condiciones))
    return out


def _contar_cambios_cliente(db: Session, asesor_id) -> dict:
    """La cuenta de _contar_cambios_cliente (erp_ventas.py) por tipo: SC con la marca vigente (la del asesor por su
    advisor_user_id) y COT con la marca vigente (la del asesor por el asesor de su SC)."""
    solicitudes = db.query(CustomerRequest.id).filter(filtro_cambios_cliente_vigentes(CustomerRequest, "SC"))
    cotizaciones = db.query(SalesQuotation.id).filter(filtro_cambios_cliente_vigentes(SalesQuotation, "COT"))
    if asesor_id is not None:
        solicitudes = solicitudes.filter(CustomerRequest.advisor_user_id == asesor_id)
        cotizaciones = (cotizaciones.join(CustomerRequest, SalesQuotation.sc_id == CustomerRequest.id)
                        .filter(CustomerRequest.advisor_user_id == asesor_id))
    return {"SC": solicitudes.count(), "COT": cotizaciones.count()}


def _contar_sin_respuesta(db: Session) -> dict:
    """Seguimientos AGOTADO (salieron todos los recordatorios y el cliente no respondio) cuyo documento sigue en
    PENDIENTE_CONFIRMACION, por tipo (B3 T11; el chip «Sin respuesta al recordatorio»)."""
    out = {}
    for tipo, modelo in (("SC", CustomerRequest), ("COT", SalesQuotation)):
        out[tipo] = db.scalar(
            select(func.count(SeguimientoConfirmacion.id))
            .select_from(SeguimientoConfirmacion)
            .join(modelo, and_(SeguimientoConfirmacion.document_type == tipo,
                               SeguimientoConfirmacion.document_id == modelo.id))
            .where(SeguimientoConfirmacion.estado == AGOTADO, modelo.estado == PENDIENTE))
    return out


def resumen_flujo_ventas(db: Session, dias, ahora=None, *, asesor_id=None) -> dict:
    """Los numeros del diagrama del flujo de Ventas sobre TODOS los documentos (solo lectura):

    {'cambios_cliente': {'SC': n, 'COT': n}, 'sin_respuesta': {'SC': n, 'COT': n},
     'pasos': {paso: {'total', 'atrasados', 'mas_antiguo_dias', 'por_estado'}} (en el orden de PASOS_FLUJO_VENTAS),
     'semaforo': {'atrasados', 'no_resueltos'}, 'dias_alerta', 'generado_at'}

    - total y por_estado: COUNT y GROUP BY estado con cond_paso (cada documento en un solo paso).
    - atrasados: SC = sc + sc_confirmadas_sin_accion; COT = cot + cot_confirmadas_sin_accion; PVEN = ven (contar_atrasados,
      la regla de la pastilla roja); ENTREGADO y FACTURADO no tienen regla de atraso: None.
    - mas_antiguo_dias: el mayor dias_sin_mov del paso (piso de ahora − MIN(coalesce(updated_at, created_at)), en dias);
      None si el paso esta vacio, y siempre en FACTURADO.
    - semaforo.atrasados = la suma de contar_atrasados; semaforo.no_resueltos = la suma de contar_no_resueltos (RP13).
    - cambios_cliente (RP12): el filtro de _contar_cambios_cliente; con asesor_id (T6A lo pasa si el rol es ASESOR), solo
      los suyos. sin_respuesta: seguimientos AGOTADO con el documento en PENDIENTE_CONFIRMACION.
    - dias_alerta: los `dias` recibidos ({'SC', 'COT', 'VEN'}); generado_at: `ahora` en ISO con 'Z'."""
    ahora = ahora if ahora is not None else ahora_utc()
    atrasados = contar_atrasados(db, dias, ahora)
    no_resueltos = contar_no_resueltos(db)
    atrasados_por_paso = {
        "SC": atrasados["sc"] + atrasados["sc_confirmadas_sin_accion"],
        "COT": atrasados["cot"] + atrasados["cot_confirmadas_sin_accion"],
        "PVEN": atrasados["ven"],
        "ENTREGADO": None,
        "FACTURADO": None,
    }
    pasos = {}
    for paso in PASOS_FLUJO_VENTAS:
        modelo, condicion = cond_paso(paso)
        movimiento = func.coalesce(modelo.updated_at, modelo.created_at)
        filas = db.execute(select(modelo.estado, func.count(modelo.id), func.min(movimiento))
                           .where(condicion).group_by(modelo.estado)).all()
        por_estado = {estado: n for estado, n, _ in filas}
        minimos = [m for _, _, m in filas if m is not None]
        mas_antiguo = None
        if paso != "FACTURADO" and minimos:
            mas_antiguo = max(0, math.floor((ahora - min(minimos)).total_seconds() / 86400))
        pasos[paso] = {"total": sum(por_estado.values()), "atrasados": atrasados_por_paso[paso],
                       "mas_antiguo_dias": mas_antiguo, "por_estado": por_estado}
    return {
        "cambios_cliente": _contar_cambios_cliente(db, asesor_id),
        "sin_respuesta": _contar_sin_respuesta(db),
        "pasos": pasos,
        "semaforo": {"atrasados": sum(atrasados.values()), "no_resueltos": sum(no_resueltos.values())},
        "dias_alerta": dict(dias) if isinstance(dias, Mapping) else dias,
        "generado_at": iso_z(ahora),
    }


# ─── Filtros de los indicadores y las pestañas (RP3: espejo de listas-ventas.js) ─────────────────────────────────────

def f_sc_activa(sc=CustomerRequest):
    """esSolicitudActiva: la pestaña 'Activas' de Solicitudes (no Soporte, ni CONFIRMADA ni CANCELADA)."""
    return and_(sin_soporte(sc), sc.estado.notin_(("CONFIRMADA", "CANCELADA")))


def f_sc_espera_cot(sc=CustomerRequest):
    """esperaCotizacion (H32): CONFIRMADA y sin una COT con su sc_id que no este RECHAZADA."""
    return and_(sc.estado == "CONFIRMADA", ~cot_activa_de_sc(sc))


def f_cot_confirmada(cot=SalesQuotation):
    """pestanaCotizacion(cot) === 'Confirmadas': CONFIRMADA y (gate2_confirmed_at, o algun pedido que no este
    CANCELADO). Una CONFIRMADA sin confirmacion vigente ni pedido vigente hay que reabrirla: es 'Activas'."""
    return and_(cot.estado == "CONFIRMADA", or_(cot.gate2_confirmed_at.isnot(None), pven_vigente_de_cot(cot)))


def f_cot_activa(cot=SalesQuotation):
    """pestanaCotizacion(cot) === 'Activas': no RECHAZADA y no f_cot_confirmada (VENCIDA es activa)."""
    return and_(cot.estado != "RECHAZADA", ~f_cot_confirmada(cot))


def f_cot_con_pedido(cot=SalesQuotation):
    """cot.estado === 'CONFIRMADA' && pedidoVigente(cot) !== null."""
    return and_(cot.estado == "CONFIRMADA", pven_vigente_de_cot(cot))


def f_cot_pedido_caido(cot=SalesQuotation):
    """cot.estado === 'CONFIRMADA' && soloPedidosCancelados(cot): tuvo pedidos y todos estan CANCELADO."""
    tuvo_pedidos = select(SaleOrder.id).where(SaleOrder.cot_id == cot.id).exists()
    return and_(cot.estado == "CONFIRMADA", tuvo_pedidos, ~pven_vigente_de_cot(cot))


def f_pven_en_curso(pven=SaleOrder):
    """'Pedidos en curso': estado fuera de ESTADOS_VEN_CERRADOS."""
    return pven.estado.notin_(ESTADOS_VEN_CERRADOS)


def f_pven_con_dinero(pven=SaleOrder):
    """Su dinero cuenta (H47): estado fuera de ESTADOS_VEN_SIN_DINERO (CANCELADO y DEVUELTO_TOTAL)."""
    return pven.estado.notin_(ESTADOS_VEN_SIN_DINERO)
