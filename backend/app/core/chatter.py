"""Chatter de Ventas (U6+H22, Bloque 2; R1): reglas de las notas que se agregan a mano a la Actividad de una Solicitud,
una Cotizacion o un Pedido (POST /ventas/{solicitudes|cotizaciones|pedidos}/{id}/actividad).

Logica pura (sin DB ni FastAPI): erp_ventas._agregar_nota la usa y convierte el ValueError en un 422 legible.
Contrato del body: {action: 'CHATTER', tipo, description, medio?}; 'medio' solo se lee con tipo EXTERNA. El autor NO
sale del body: es nombre_de_usuario(usuario de la sesion) (R9/C13), que vive en textos_actividad y aqui se reexporta.
"""
from app.core.textos_actividad import nombre_de_usuario

__all__ = ["TIPOS_CHATTER", "ACCIONES_PERMITIDAS", "LEGADO", "MAX_TEXTO", "MAX_MEDIO", "validar_nota",
           "reinicia_atraso", "puede_registrar", "ROLES_CONTACTO_CON_EL_CLIENTE", "CONTACTO_SOLO_ASESOR",
           "nombre_de_usuario"]

# Tipo de entrada -> como se lee. EXTERNA (R1) = 'Nota externa': un contacto con el cliente por cualquier otro medio
# (visita, reunion, llamada desde otro telefono...), con el medio opcional. Ninguna se le envia al cliente.
TIPOS_CHATTER = {
    "NOTA": "Nota interna",
    "LLAMADA": "Llamada con el cliente",
    "WHATSAPP": "WhatsApp al cliente",
    "CORREO": "Correo al cliente",
    "EXTERNA": "Nota externa",
}
# NOTE_ADDED sigue entrando: es la nota 'Motivo del rechazo (Hub)' de N3 (Bloque 1). Las demas acciones las escribe el
# sistema y no se pueden agregar a mano.
ACCIONES_PERMITIDAS = {"CHATTER", "NOTE_ADDED"}
# El boton viejo de notas del pedido mandaba UPDATED: una pestana con esa version en cache no falla y queda como CHATTER.
LEGADO = {"UPDATED": "CHATTER"}
MAX_TEXTO = 2000
MAX_MEDIO = 60
# R1 (respuesta del usuario a atraso_por_contacto): los contactos con el cliente reinician el conteo de atraso del
# documento; la nota interna no.
_REINICIAN_ATRASO = {"LLAMADA", "WHATSAPP", "CORREO", "EXTERNA"}


def validar_nota(body) -> tuple:
    """(action, texto, extra) de una nota del Chatter, o ValueError con el mensaje para el usuario.

    action: la del body en mayusculas (NOTE_ADDED si no viene), con LEGADO aplicado; solo CHATTER o NOTE_ADDED.
    texto: description sin espacios en los bordes; ni vacia ni de mas de MAX_TEXTO caracteres. Si no es texto (un
    numero, una lista...) cuenta como vacia: nunca se guarda su str().
    extra: {'tipo': TIPO} (NOTA si no viene); con EXTERNA y un medio no vacio, tambien {'medio': medio} (recortado,
    maximo MAX_MEDIO; si no es texto cuenta como vacio y no se guarda). Con los demas tipos 'medio' se ignora."""
    action = str(body.get("action") or "NOTE_ADDED").strip().upper()
    action = LEGADO.get(action, action)
    if action not in ACCIONES_PERMITIDAS:
        raise ValueError("Ese tipo de registro no se puede agregar a mano.")
    descripcion = body.get("description")
    texto = descripcion.strip() if isinstance(descripcion, str) else ""
    if not texto:
        raise ValueError("Escribe la nota antes de guardarla.")
    if len(texto) > MAX_TEXTO:
        raise ValueError(f"La nota es muy larga (máximo {MAX_TEXTO} caracteres).")
    tipo = str(body.get("tipo") or "NOTA").strip().upper()
    if tipo not in TIPOS_CHATTER:
        raise ValueError("Tipo de nota no válido.")
    extra = {"tipo": tipo}
    if tipo == "EXTERNA":
        medio = body.get("medio")
        medio = medio.strip() if isinstance(medio, str) else ""
        if len(medio) > MAX_MEDIO:
            raise ValueError(f"El medio es muy largo (máximo {MAX_MEDIO} caracteres).")
        if medio:
            extra["medio"] = medio
    return action, texto, extra


def reinicia_atraso(tipo) -> bool:
    """R1: True si la entrada es un contacto con el cliente (llamada, WhatsApp, correo o nota externa)."""
    return tipo in _REINICIAN_ATRASO


# S7 (T11): un contacto con el cliente (los tipos que reinician el atraso) lo registra solo quien atiende al cliente.
# COMPRAS, que tambien puede dejar notas, solo deja notas internas: si no, sacaria un documento de las alertas de
# atrasados con un contacto que no hizo. Roles ya normalizados (normalize_role).
ROLES_CONTACTO_CON_EL_CLIENTE = frozenset({"ADMIN", "ASESOR"})
CONTACTO_SOLO_ASESOR = ("Solo un asesor o un administrador puede registrar un contacto con el cliente (llamada, "
                        "WhatsApp, correo o nota externa): deja una nota interna.")


def puede_registrar(tipo, rol) -> bool:
    """S7 (T11): False si `rol` no puede dejar una entrada de ese tipo (un contacto con el cliente fuera de ADMIN y
    ASESOR). La nota interna la puede dejar cualquier rol que tenga acceso al Chatter."""
    return not reinicia_atraso(tipo) or rol in ROLES_CONTACTO_CON_EL_CLIENTE
