"""Textos de la Actividad y de los mensajes de Ventas: nombres de estado legibles (H7+H41).

Modulo puro, sin FastAPI ni DB, para que lo importen erp_ventas.py y erp_ventas_fase4.py sin import circular.
ETIQUETAS_ESTADO es la FUENTE UNICA de los nombres de estado en el backend: la Actividad ('Estado cambiado a
Rechazada'), los mensajes de error ('estado actual: Esperando confirmación del cliente') y la validacion de
"estado inexistente" de update_pedido (ETIQUETAS_ESTADO['VEN']) salen de aqui. El frontend tiene su espejo en
frontend/src/lib/estados-pedido.js (estados del pedido); backend/tests/test_estados_pedido.py comprueba que no
se desalineen. Las columnas old_estado / new_estado de ActivityLog siguen guardando el CODIGO, nunca la etiqueta.
"""

ETIQUETAS_ESTADO = {
    # Solicitud de Cotizacion
    "SC": {
        "BORRADOR": "Borrador",
        "ASIGNADA": "Asignada",
        "PENDIENTE_CONFIRMACION": "Pendiente de confirmación",
        "COTIZADA": "Cotizada",
        "EN_ESPERA_CONFIRMACION": "En espera de confirmación",
        "CONFIRMADA": "Confirmada",
        "RECHAZADA": "Rechazada",
        "VENCIDA": "Vencida",
        "CANCELADA": "Cancelada",
        "N/A_SOPORTE": "Soporte",
    },
    # Cotizacion
    "COT": {
        "BORRADOR": "Borrador",
        "ENVIADA": "Enviada al cliente",
        "PENDIENTE_CONFIRMACION": "Esperando confirmación del cliente",
        "CONFIRMADA": "Confirmada",
        "RECHAZADA": "Rechazada",
        "VENCIDA": "Vencida",
    },
    # Pedido de Venta: SOLO los estados que se pueden poner por PATCH /ventas/pedidos/{id}. update_pedido rechaza
    # con 422 lo que no este aqui. Los estados que solo pone fase4 (PARCIALMENTE_ENTREGADO, DEVUELTO_TOTAL...) no
    # van: salen legibles por el respaldo de etiqueta_estado.
    "VEN": {
        "PENDIENTE_COMPRA": "Pendiente de compra",
        "PENDIENTE_PAGO": "Pendiente de pago",
        "EN_PROCESO": "En proceso",
        "EN_TRANSITO": "En tránsito",
        "LISTO_ENTREGA": "Listo para entrega",
        "ENTREGADO": "Entregado",
        "FACTURADO": "Facturado",
        "CANCELADO": "Cancelado",
    },
}

# fase4 registra la Actividad del pedido con entity_type 'PVEN'; el resto de Ventas usa 'VEN'.
_ALIAS_ENTIDAD = {"PVEN": "VEN"}


def etiqueta_estado(entidad, estado) -> str:
    """Nombre legible de un estado. entidad: 'SC', 'COT', 'VEN' (o 'PVEN'), 'PXP', 'PEC'...

    - Vacio, en blanco o None -> ''.
    - Si el codigo esta en ETIQUETAS_ESTADO[entidad] -> su etiqueta (con tildes).
    - Si no (estado nuevo, entidad sin mapa como PXP o PEC) -> respaldo: el codigo con '_' como espacio, en
      minusculas y con la primera letra en mayuscula ('PENDIENTE_ALGO' -> 'Pendiente algo', PXP 'PAGADO' ->
      'Pagado'). Nunca sale el codigo crudo, aunque el respaldo no puede poner tildes: un estado que las
      necesite ('EN_TRANSITO') debe estar en el mapa.
    """
    codigo = str(estado).strip() if estado is not None else ""
    if not codigo:
        return ""
    mapa = ETIQUETAS_ESTADO.get(_ALIAS_ENTIDAD.get(entidad, entidad), {})
    etiqueta = mapa.get(codigo)
    if etiqueta is not None:
        return etiqueta
    return codigo.replace("_", " ").lower().capitalize()
