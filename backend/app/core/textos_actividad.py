"""Textos de la Actividad y de los mensajes de Ventas: nombres de estado legibles (H7+H41).

Modulo puro, sin FastAPI ni DB, para que lo importen erp_ventas.py y erp_ventas_fase4.py sin import circular.
ETIQUETAS_ESTADO es la FUENTE UNICA de los nombres de estado en el backend: la Actividad ('Estado cambiado a
Rechazada') y los mensajes de error ('estado actual: Esperando confirmación del cliente') salen de aqui. El
frontend tiene su espejo en frontend/src/lib/estados-pedido.js (estados del pedido); backend/tests/
test_estados_pedido.py comprueba que cada estado del pedido se llame igual en los dos lados. Las columnas
old_estado / new_estado de ActivityLog siguen guardando el CODIGO, nunca la etiqueta.

Este mapa NO decide que estados se pueden poner por PATCH: eso es estados_pedido.ESTADOS_VEN_DESTINOS.

corregir_descripcion_historica es el corazon de scripts/corregir_textos_actividad.py: reescribe los renglones VIEJOS
de la Actividad (sin tildes, con el codigo del estado) con el mismo texto que hoy generan los endpoints.
"""
import re

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
    # Pedido de Venta: TODOS los estados que el backend puede poner (los 18 de frontend/src/lib/estados-pedido.js,
    # con las mismas etiquetas): ninguno depende del respaldo de etiqueta_estado, que no pone tildes ni 'de'.
    # Cuales se pueden poner por PATCH lo dice estados_pedido.ESTADOS_VEN_DESTINOS, no este mapa.
    "VEN": {
        # Ventas / Compras
        "PENDIENTE_COMPRA": "Pendiente de compra",
        "EN_PROCESO": "En proceso",
        "EN_TRANSITO": "En tránsito",
        "LISTO_ENTREGA": "Listo para entrega",
        "ENTREGADO": "Entregado",
        "FACTURADO": "Facturado",
        "CANCELADO": "Cancelado",
        # tienda / webhooks
        "PENDIENTE_PAGO": "Pendiente de pago",
        "PAGADO": "Pagado",
        # erp_ventas_fase4 (recalculate_sale_order_state y ALLOWED_TRANSITIONS_SALE_ORDER)
        "BORRADOR": "Borrador",
        "PENDIENTE_ANTICIPO": "Pendiente de anticipo",
        "CONFIRMADO": "Confirmado",
        "PARCIALMENTE_DISPONIBLE": "Parcialmente disponible",
        "DISPONIBLE": "Disponible",
        "PENDIENTE_SALDO": "Pendiente de saldo",
        "LISTO_PARA_ENTREGA": "Listo para entrega",
        "PARCIALMENTE_ENTREGADO": "Entregado parcialmente",
        "DEVUELTO_TOTAL": "Devuelto",
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


# --- Correccion de las actividades viejas (H7+H41; la usa scripts/corregir_textos_actividad.py) ---------------

# Solo estos documentos y estas acciones: los textos que el SISTEMA genera. NOTE_ADDED, CHATTER y CANCELLED son
# texto que escribio una persona (notas, razones de cancelacion): jamas se reescriben.
ENTIDADES_CORREGIBLES = frozenset({"SC", "COT", "VEN", "PXP"})
ACCIONES_DEL_SISTEMA = frozenset({"CREATED", "ESTADO_CHANGED", "CONVERTIDA_A_VENTA", "RESTORED"})

# Titulos fijos que quedaron en la Actividad sin tilde (los dos ultimos son de commits viejos, ya no se generan).
_TEXTOS_FIJOS = {
    "Solicitud cotizada - Cotizacion creada": "Solicitud cotizada - Cotización creada",
    "Solicitud confirmada - Cotizacion creada": "Solicitud confirmada - Cotización creada",
    "Cotizacion confirmada - Pedido de Venta creado": "Cotización confirmada - Pedido de Venta creado",
}
_COT_CREADA = re.compile(r"Cotizacion (\S+) creada( desde \S+)?")
# El cierre opcional es el resumen del dinero que agrega el flujo del anticipo (' Anticipo verificado: $600.000.').
_COT_CONVERTIDA = re.compile(r"Cotizacion (\S+) convertida al pedido (\S+)\. Lineas: (\d+)\.( .*)?")
# Un codigo de estado en MAYUSCULAS (tambien 'N/A_SOPORTE'): 'Borrador' ya no calza, por eso es idempotente.
_ESTADO_CAMBIADO = re.compile(r"Estado cambiado a (?P<codigo>[A-Z][A-Z/_]*[A-Z])(?P<resto>(?: \(.*\)|:.*)?)")
_PAGO_CAMBIADO = re.compile(r"Pago (\S+) cambiado a (?P<codigo>[A-Z][A-Z_]*[A-Z])")
_SC_RESTAURADA = re.compile(r"Solicitud restaurada a (?P<codigo>[A-Z][A-Z_]*[A-Z])")


def corregir_descripcion_historica(entidad, accion, descripcion):
    """El texto nuevo de un renglon viejo de la Actividad, o None si no hay nada que corregir.

    Solo actua sobre textos que genero el sistema: entidad en ENTIDADES_CORREGIBLES, accion en ACCIONES_DEL_SISTEMA y
    un patron ANCLADO (todo el texto, no una parte). Cambia 'Cotizacion' por 'Cotización', 'Lineas' por 'Líneas' y el
    codigo del estado ('Estado cambiado a ASIGNADA (asesor asignado)') por su etiqueta ('Asignada'). Es idempotente:
    el resultado ya no calza con ningun patron, asi que corregirlo otra vez da None.
    """
    if entidad not in ENTIDADES_CORREGIBLES or accion not in ACCIONES_DEL_SISTEMA:
        return None
    if not isinstance(descripcion, str) or not descripcion:
        return None
    nueva = _TEXTOS_FIJOS.get(descripcion)
    if nueva is None:
        m = _COT_CREADA.fullmatch(descripcion)
        if m:
            nueva = f"Cotización {m.group(1)} creada{m.group(2) or ''}"
    if nueva is None:
        m = _COT_CONVERTIDA.fullmatch(descripcion)
        if m:
            nueva = (f"Cotización {m.group(1)} convertida al pedido {m.group(2)}. Líneas: {m.group(3)}."
                     f"{m.group(4) or ''}")
    if nueva is None and accion == "ESTADO_CHANGED":
        m = _ESTADO_CAMBIADO.fullmatch(descripcion)
        if m:
            nueva = f"Estado cambiado a {etiqueta_estado(entidad, m.group('codigo'))}{m.group('resto')}"
        elif entidad == "PXP":
            m = _PAGO_CAMBIADO.fullmatch(descripcion)
            if m:
                nueva = f"Pago {m.group(1)} cambiado a {etiqueta_estado('PXP', m.group('codigo'))}"
    if nueva is None and accion == "RESTORED" and entidad == "SC":
        m = _SC_RESTAURADA.fullmatch(descripcion)
        if m:
            nueva = f"Solicitud restaurada a {etiqueta_estado('SC', m.group('codigo'))}"
    if nueva is None or nueva == descripcion:
        return None
    return nueva
