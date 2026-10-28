"""Estados, etapas y reglas de los documentos de Compras (Bloque 4, T1C; R9 y C10): un solo lugar en el backend.

Mismo patron que estados_pedido.py: datos inmutables (tuplas, frozenset y MappingProxyType) y funciones puras, sin FastAPI
ni DB. Las dos condiciones SQL (cond_estados_pec y cond_vencido) reciben las columnas: no importan modelos ni abren
sesiones. El espejo del frontend es frontend/src/lib/estados-compras.js (T2, con test_paridad_estados_compras.py). Los
NOMBRES de los estados del PEC y de la recepcion salen de textos_actividad.ETIQUETAS_ESTADO['PEC'] y ['ENINV'] (fuente
unica); aqui solo van etapas, grupos, vistas, transiciones y pasos. No se crean estados_pec.py ni grupos_estado.py (R27).

Pedido de compra (PEC):
- ESTADOS_PEC: los 10 estados de R9. ETAPAS_PEC: etapa -> estados (borrador, emitido, en_transito, en_bodega, recibido y
  cancelado). etapa_pec(estado): un estado desconocido (los heredados del modulo de logistica, como CONFIRMADA o ENVIADA)
  cuenta como 'emitido'.
- GRUPOS_PEC: activos (emitido + en_transito + en_bodega), vigentes (todo menos cancelado) y vencibles (emitido +
  en_transito). VISTAS_PEC: las vistas de las listas (T12). en_estados_pec y cond_estados_pec dicen si un estado esta en
  uno de esos conjuntos con la misma regla del desconocido (si el conjunto trae EMITIDO, el desconocido entra).
- es_vencido(estado, fecha_entrega_estimada, hoy) y cond_vencido (RP40): emitido o en transito con el dia de entrega
  tal como se guarda (fecha.date(), sin pasarla a Colombia) anterior a hoy en Colombia (hoy_colombia), sin tolerancia.
- ESTADOS_PEC_MANUALES, TRANSICIONES_PEC_PATCH, ESTADOS_POR_FLUJO y destinos_pec_permitidos: lo que se cambia a mano (la
  validacion de update_pec es de T12).
- PASOS_FLUJO_COMPRAS y paso_flujo_pec: el diagrama del flujo de Compras (resumen_flujo_compras es de T12).
Recepciones (GoodsReceipt): GRUPOS_RECEPCION y grupo_recepcion. Operaciones de inventario (InventoryOperation):
GRUPOS_OPERACION y grupo_operacion. Items de la lista de compras: ESTADOS_ITEM_LISTA (DESCARTADO no se muestra).
"""
from datetime import date, datetime
from types import MappingProxyType

from sqlalchemy import Date, and_, cast, true

# ─── Pedido de compra: etapas ────────────────────────────────────────────────────────────────────────────────────────

ETAPAS_PEC = MappingProxyType({
    "borrador": ("BORRADOR",),
    "emitido": ("EMITIDO", "ENVIADO"),
    "en_transito": ("EN_TRANSITO", "PENDIENTE_ENTREGA"),
    "en_bodega": ("RECIBIDO", "PARCIALMENTE_RECIBIDA"),   # llego a bodega / recibido en parte: falta confirmar o el resto
    "recibido": ("RECIBIDA", "COMPLETADO"),               # recepcion confirmada en bodega
    "cancelado": ("CANCELADO",),
})

ESTADOS_PEC = tuple(e for estados in ETAPAS_PEC.values() for e in estados)

ETAPA_POR_DEFECTO = "emitido"   # la de un estado desconocido (R9)

_ETAPA_DE_ESTADO = MappingProxyType({e: etapa for etapa, estados in ETAPAS_PEC.items() for e in estados})


def etapa_pec(estado) -> str:
    """La etapa de un estado del PEC; un estado desconocido (o None) cuenta como 'emitido'."""
    return _ETAPA_DE_ESTADO.get(estado, ETAPA_POR_DEFECTO) if isinstance(estado, str) else ETAPA_POR_DEFECTO


def _estados_de(*etapas) -> tuple:
    return tuple(e for etapa in etapas for e in ETAPAS_PEC[etapa])


GRUPOS_PEC = MappingProxyType({
    "activos": _estados_de("emitido", "en_transito", "en_bodega"),
    "vigentes": _estados_de("borrador", "emitido", "en_transito", "en_bodega", "recibido"),
    "vencibles": _estados_de("emitido", "en_transito"),
})

# Las vistas de las listas de Compras (pestañas, tablero y parametro `vista`, T12).
VISTAS_PEC = MappingProxyType({
    "todos": ESTADOS_PEC,
    "vigentes": GRUPOS_PEC["vigentes"],
    "activos": GRUPOS_PEC["activos"],
    "borradores": _estados_de("borrador"),
    "pedidos": _estados_de("borrador", "emitido"),
    "en_transito": _estados_de("en_transito"),
    "en_bodega": _estados_de("en_bodega"),
    "recibidos": _estados_de("recibido"),
    "cancelados": _estados_de("cancelado"),
    "no_resueltos": GRUPOS_PEC["activos"],
    "acciones_tomadas": _estados_de("recibido", "cancelado"),
    "transito_logistica": _estados_de("emitido", "en_transito", "en_bodega"),
})


def en_estados_pec(estado, estados) -> bool:
    """`estado` esta en el conjunto `estados` (un grupo o una vista), con la regla del desconocido: un estado que no es
    de ESTADOS_PEC entra si el conjunto trae EMITIDO (cuenta como emitido). Es la regla de cond_estados_pec."""
    if isinstance(estado, str) and estado in _ETAPA_DE_ESTADO:
        return estado in estados
    return "EMITIDO" in estados


def cond_estados_pec(columna, estados):
    """Condicion SQL de en_estados_pec sobre la columna del estado (p. ej. PurchaseOrderFull.estado): si el conjunto
    trae EMITIDO, «no esta en los estados conocidos que faltan» (asi entra el desconocido); si no, «esta en el conjunto».
    Con todos los estados, true()."""
    if "EMITIDO" in estados:
        fuera = [e for e in ESTADOS_PEC if e not in estados]
        return columna.notin_(fuera) if fuera else true()
    return columna.in_(list(estados))


# ─── Vencido (R9, RP40) ──────────────────────────────────────────────────────────────────────────────────────────────

def _dia_de_entrega(fecha):
    """El dia de entrega tal como se guarda: date, datetime.date() o los 10 primeros caracteres de un ISO; None si no hay."""
    if fecha is None:
        return None
    if isinstance(fecha, datetime):
        return fecha.date()
    if isinstance(fecha, date):
        return fecha
    texto = str(fecha).strip()
    return date.fromisoformat(texto[:10]) if texto else None


def es_vencido(estado, fecha_entrega_estimada, hoy) -> bool:
    """Un PEC emitido o en transito (etapa_pec; el desconocido cuenta como emitido) cuyo dia de entrega (el que se
    guarda, sin pasarlo a Colombia, RP40) es anterior a `hoy` (hoy_colombia()). Sin dias de tolerancia; sin fecha no
    vence; un PEC en bodega, recibido, borrador o cancelado nunca esta vencido."""
    dia = _dia_de_entrega(fecha_entrega_estimada)
    return dia is not None and etapa_pec(estado) in ("emitido", "en_transito") and dia < hoy


def cond_vencido(columna_estado, columna_fecha, hoy):
    """La condicion SQL de es_vencido (RP40): estado vencible (con el desconocido) y cast(fecha as date) < :hoy."""
    return and_(cond_estados_pec(columna_estado, GRUPOS_PEC["vencibles"]), columna_fecha.isnot(None),
                cast(columna_fecha, Date) < hoy)


# ─── Cambios a mano (KANBAN-compras 2; la validacion de update_pec es de T12) ────────────────────────────────────────

# Lo unico que se pone a mano: emitir un borrador o cancelar (con motivo, T12). EN_TRANSITO lo pone el seguimiento y los
# de recepcion los pone la recepcion en bodega (ESTADOS_POR_FLUJO dice donde, para el mensaje).
ESTADOS_PEC_MANUALES = ("EMITIDO", "CANCELADO")

_SOLO_CANCELAR = frozenset({"CANCELADO"})

TRANSICIONES_PEC_PATCH = MappingProxyType({
    "BORRADOR": frozenset({"EMITIDO", "CANCELADO"}),
    "EMITIDO": _SOLO_CANCELAR,
    "ENVIADO": _SOLO_CANCELAR,
    "EN_TRANSITO": _SOLO_CANCELAR,          # pec_cancelar_en_transito: si, mientras no tenga recepciones (T12, 409)
    "PENDIENTE_ENTREGA": _SOLO_CANCELAR,
    "RECIBIDO": frozenset(),
    "PARCIALMENTE_RECIBIDA": frozenset(),
    "RECIBIDA": frozenset(),
    "COMPLETADO": frozenset(),
    "CANCELADO": frozenset(),               # no se reabre
})

ESTADOS_POR_FLUJO = MappingProxyType({
    "EN_TRANSITO": "seguimiento",
    "PENDIENTE_ENTREGA": "seguimiento",
    "RECIBIDO": "recepcion",
    "PARCIALMENTE_RECIBIDA": "recepcion",
    "RECIBIDA": "recepcion",
    "COMPLETADO": "recepcion",
})


def destinos_pec_permitidos(estado) -> frozenset:
    """Estados a los que se puede pasar desde `estado` a mano. Un estado desconocido (o None) se trata como EMITIDO:
    solo {CANCELADO}."""
    return TRANSICIONES_PEC_PATCH.get(estado, TRANSICIONES_PEC_PATCH["EMITIDO"]) if isinstance(estado, str) \
        else TRANSICIONES_PEC_PATCH["EMITIDO"]


# ─── Flujo de Compras (FLUJO-compras, R9) ────────────────────────────────────────────────────────────────────────────

PASOS_FLUJO_COMPRAS = ("LISTA", "PEC", "TRANSITO", "RECEPCION", "RECIBIDO")

_PASO_DE_ETAPA = MappingProxyType({
    "borrador": "PEC", "emitido": "PEC", "en_transito": "TRANSITO", "en_bodega": "RECEPCION", "recibido": "RECIBIDO",
    "cancelado": None,
})


def paso_flujo_pec(estado):
    """El paso del flujo de Compras de un PEC: 'PEC' (borrador y emitido), 'TRANSITO', 'RECEPCION' (en bodega) o
    'RECIBIDO'; None si esta cancelado. 'LISTA' son los items de la lista de compras, no un PEC."""
    return _PASO_DE_ETAPA[etapa_pec(estado)]


# ─── Recepciones, operaciones de inventario e items de la lista ──────────────────────────────────────────────────────

GRUPOS_RECEPCION = MappingProxyType({
    "por_confirmar": ("BORRADOR",),
    "confirmadas": ("COMPLETADA", "COMPLETADA_LOGISTICA"),
    "canceladas": ("CANCELADA",),
})

GRUPOS_OPERACION = MappingProxyType({
    "en_proceso": ("DRAFT", "READY"),
    "completadas": ("DONE",),
    "canceladas": ("CANCELLED",),
})


def _grupo(grupos, estado):
    for grupo, estados in grupos.items():
        if estado in estados:
            return grupo
    return None


def grupo_recepcion(estado):
    """'por_confirmar', 'confirmadas' o 'canceladas' para el estado de una recepcion (GoodsReceipt); None si no esta."""
    return _grupo(GRUPOS_RECEPCION, estado)


def grupo_operacion(estado):
    """'en_proceso', 'completadas' o 'canceladas' para el estado de una operacion de inventario; None si no esta."""
    return _grupo(GRUPOS_OPERACION, estado)


# Los estados de un item de la lista de compras que se muestran, con su nombre. DESCARTADO (el item de un pedido de venta
# cancelado) no se muestra: no esta en el mapa.
ESTADOS_ITEM_LISTA = MappingProxyType({
    "PENDIENTE": "Pendiente",
    "EN_PEDIDO": "En pedido",
    "RECIBIDO": "Recibido",
})
