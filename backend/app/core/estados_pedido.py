"""Reglas de cambio de estado del Pedido de Venta por PATCH /ventas/pedidos/{id} (N2), como datos puros.

Modulo sin FastAPI ni DB: update_pedido (erp_ventas.py) lo importa para validar la transicion. Los NOMBRES de
cada estado salen de textos_actividad.ETIQUETAS_ESTADO['VEN'] (fuente unica); aqui solo se dice DESDE donde se
puede ir a donde y CUALES estados se pueden poner por PATCH (ESTADOS_VEN_DESTINOS: "estado inexistente" se valida
con esa constante, no con el mapa de etiquetas, que trae todos los estados que el backend puede poner). El
frontend lo espeja en frontend/src/lib/estados-pedido.js (TRANSICIONES_PEDIDO_PATCH, ESTADOS_PEDIDO_OPERATIVOS,
ESTADOS_PEDIDO_MANUALES) y backend/tests/test_estados_pedido.py comprueba la paridad.

Esto NO es la maquina de estados canonica de erp_ventas_fase4.py (ALLOWED_TRANSITIONS_SALE_ORDER, otro
vocabulario): solo cubre lo que se cambia a mano o por PATCH.

Exporta: ESTADOS_VEN_OPERATIVOS, ESTADOS_VEN_MANUALES, ESTADOS_VEN_SIN_DINERO, TRANSICIONES_VEN_PATCH,
ESTADOS_VEN_DESTINOS y destinos_ven_permitidos; desde el Bloque 4 (T1C) tambien ESTADOS_VEN_CERRADOS, grupo_pedido,
VISTA_DE_GRUPO y estados_de_vista. Todo es inmutable (tuplas, frozenset y mapas de solo lectura).
"""
from types import MappingProxyType

# Estados "en curso": entre ellos se mueve el pedido libremente. PENDIENTE_PAGO lo pone la tienda (ecommerce), no
# se elige a mano. 'Reenviar el mismo estado' se permite, por eso cada operativo se incluye a si mismo.
ESTADOS_VEN_OPERATIVOS = ("PENDIENTE_COMPRA", "PENDIENTE_PAGO", "EN_PROCESO", "EN_TRANSITO", "LISTO_ENTREGA")

# Los que el panel rapido del Hub y el editor del pedido ofrecen para elegir a mano (EN_TRANSITO se mantiene por
# decision del usuario).
ESTADOS_VEN_MANUALES = ("PENDIENTE_COMPRA", "EN_PROCESO", "EN_TRANSITO", "LISTO_ENTREGA")

# Pedidos cuyo dinero ya no cuenta como venta ni como cuenta por cobrar (H47): el cancelado (su saldo queda guardado,
# no se suma) y el devuelto por completo (decision del usuario: tampoco suma). Los resumenes de dinero de Ventas
# (lista de pedidos, /ventas/stats, /ventas/analytics) los excluyen con esta constante.
ESTADOS_VEN_SIN_DINERO = ("CANCELADO", "DEVUELTO_TOTAL")

# B4 T1C (KPI-ventas 1, FLUJO-ventas-datos): estados terminales, que no cuentan como pedidos en curso. Espejo de
# ESTADOS_PEDIDO_CERRADOS de frontend/src/lib/estados-pedido.js. Los usan core/resolucion_ventas.py (pasos del flujo,
# atraso y f_pven_en_curso) y las listas.
ESTADOS_VEN_CERRADOS = ("ENTREGADO", "FACTURADO", "CANCELADO", "DEVUELTO_TOTAL")

_DESDE_OPERATIVO = frozenset(ESTADOS_VEN_OPERATIVOS) | {"ENTREGADO", "CANCELADO"}

TRANSICIONES_VEN_PATCH = MappingProxyType({
    **{estado: _DESDE_OPERATIVO for estado in ESTADOS_VEN_OPERATIVOS},
    "ENTREGADO": frozenset({"FACTURADO"}),   # 'Facturado' solo se alcanza desde ENTREGADO
    "FACTURADO": frozenset(),                # cerrado
    "CANCELADO": frozenset(),                # cerrado: no se reabre
    # Estados que solo pone fase4: estan en el mapa para NO caer en el 'estado desconocido = operativo' de abajo,
    # que permitiria cancelarlos o reabrirlos por PATCH (choque N2 vs H46+U25).
    "DEVUELTO_TOTAL": frozenset(),
    "PARCIALMENTE_ENTREGADO": frozenset({"ENTREGADO"}),
})

# Los estados a los que un PATCH puede llevar un pedido (la union de los destinos de la tabla): los 5 operativos,
# ENTREGADO, FACTURADO y CANCELADO. Todo lo demas ('CONFIRMADA', 'DEVUELTO_TOTAL', 'PAGADO'...) no se puede poner
# por PATCH: update_pedido responde 422 "no es un estado valido para un Pedido de Venta".
ESTADOS_VEN_DESTINOS = frozenset().union(*TRANSICIONES_VEN_PATCH.values())


def destinos_ven_permitidos(estado) -> frozenset:
    """Estados a los que se puede pasar desde `estado` por PATCH. Un estado que no esta en la tabla (heredado, como
    PAGADO de la tienda o COMPLETADO) se trata como operativo, igual que None."""
    return TRANSICIONES_VEN_PATCH.get(estado, _DESDE_OPERATIVO)


# ─── B4 T1C (TABLA-listas-ventas): la pestaña de la lista de pedidos ─────────────────────────────────────────────────

# Las pestañas de la lista de pedidos, en orden: las etiquetas de PASOS_PEDIDO de estados-pedido.js (los 5 pasos del
# stepper) y 'Cancelado' para los pasos negativos.
_GRUPOS_POR_PASO = ("Pend. Compra", "En Proceso", "Listo Entrega", "Entregado", "Facturado")
_GRUPO_CANCELADO = "Cancelado"

# El paso de cada uno de los 18 estados del pedido: espejo de `paso` en ESTADOS_PEDIDO de estados-pedido.js (-1 =
# cancelado o devuelto), en el mismo orden que textos_actividad.ETIQUETAS_ESTADO['VEN'].
_PASO_DE_ESTADO = MappingProxyType({
    "PENDIENTE_COMPRA": 0, "EN_PROCESO": 1, "EN_TRANSITO": 1, "LISTO_ENTREGA": 2, "ENTREGADO": 3, "FACTURADO": 4,
    "CANCELADO": -1,
    "PENDIENTE_PAGO": 0, "PAGADO": 1,
    "BORRADOR": 0, "PENDIENTE_ANTICIPO": 0, "CONFIRMADO": 0, "PARCIALMENTE_DISPONIBLE": 1, "DISPONIBLE": 2,
    "PENDIENTE_SALDO": 2, "LISTO_PARA_ENTREGA": 2, "PARCIALMENTE_ENTREGADO": 2, "DEVUELTO_TOTAL": -1,
})

# La clave del parametro `vista` de GET /ventas/pedidos (T6B) para cada pestaña.
VISTA_DE_GRUPO = MappingProxyType({
    "Pend. Compra": "pend_compra",
    "En Proceso": "en_proceso",
    "Listo Entrega": "listo_entrega",
    "Entregado": "entregado",
    "Facturado": "facturado",
    "Cancelado": "cancelado",
})


def grupo_pedido(estado):
    """La pestaña de la lista de pedidos a la que pertenece `estado`: la MISMA etiqueta que devuelve grupoPedido de
    frontend/src/lib/estados-pedido.js ('Pend. Compra', 'En Proceso', 'Listo Entrega', 'Entregado', 'Facturado' o
    'Cancelado'; DEVUELTO_TOTAL va a 'Cancelado'). Un estado desconocido (o que no es un texto) no cae en ninguna: None,
    asi que solo aparece en 'Todos'. No recorta espacios, igual que el espejo."""
    if not isinstance(estado, str) or estado not in _PASO_DE_ESTADO:
        return None
    paso = _PASO_DE_ESTADO[estado]
    return _GRUPO_CANCELADO if paso < 0 else _GRUPOS_POR_PASO[paso]


_ESTADOS_DE_VISTA = MappingProxyType({
    vista: tuple(e for e in _PASO_DE_ESTADO if grupo_pedido(e) == grupo) for grupo, vista in VISTA_DE_GRUPO.items()
})


def estados_de_vista(vista) -> tuple:
    """Los estados del pedido de la pestaña `vista` ('pend_compra' ... 'cancelado', los valores de VISTA_DE_GRUPO), en
    el orden de ETIQUETAS_ESTADO['VEN']: estados_de_vista('pend_compra') trae PENDIENTE_PAGO. Una vista que no esta
    (tambien 'todos', que no filtra) -> (): quien recibe el parametro lo valida contra VISTA_DE_GRUPO."""
    return _ESTADOS_DE_VISTA.get(vista, ()) if isinstance(vista, str) else ()
