"""Reglas de cambio de estado del Pedido de Venta por PATCH /ventas/pedidos/{id} (N2), como datos puros.

Modulo sin FastAPI ni DB: update_pedido (erp_ventas.py) lo importa para validar la transicion. Los NOMBRES de
cada estado salen de textos_actividad.ETIQUETAS_ESTADO['VEN'] (fuente unica); aqui solo se dice DESDE donde se
puede ir a donde y CUALES estados se pueden poner por PATCH (ESTADOS_VEN_DESTINOS: "estado inexistente" se valida
con esa constante, no con el mapa de etiquetas, que trae todos los estados que el backend puede poner). El
frontend lo espeja en frontend/src/lib/estados-pedido.js (TRANSICIONES_PEDIDO_PATCH, ESTADOS_PEDIDO_OPERATIVOS,
ESTADOS_PEDIDO_MANUALES) y backend/tests/test_estados_pedido.py comprueba la paridad.

Esto NO es la maquina de estados canonica de erp_ventas_fase4.py (ALLOWED_TRANSITIONS_SALE_ORDER, otro
vocabulario): solo cubre lo que se cambia a mano o por PATCH.

Exporta: ESTADOS_VEN_OPERATIVOS, ESTADOS_VEN_MANUALES, TRANSICIONES_VEN_PATCH, ESTADOS_VEN_DESTINOS y
destinos_ven_permitidos. Todo es inmutable (tuplas, frozenset y un mapa de solo lectura).
"""
from types import MappingProxyType

# Estados "en curso": entre ellos se mueve el pedido libremente. PENDIENTE_PAGO lo pone la tienda (ecommerce), no
# se elige a mano. 'Reenviar el mismo estado' se permite, por eso cada operativo se incluye a si mismo.
ESTADOS_VEN_OPERATIVOS = ("PENDIENTE_COMPRA", "PENDIENTE_PAGO", "EN_PROCESO", "EN_TRANSITO", "LISTO_ENTREGA")

# Los que el panel rapido del Hub y el editor del pedido ofrecen para elegir a mano (EN_TRANSITO se mantiene por
# decision del usuario).
ESTADOS_VEN_MANUALES = ("PENDIENTE_COMPRA", "EN_PROCESO", "EN_TRANSITO", "LISTO_ENTREGA")

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
