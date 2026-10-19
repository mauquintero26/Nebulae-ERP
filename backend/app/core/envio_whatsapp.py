"""WhatsApp automatico al cliente por Chatwoot (Bloque 3, T8: U16-envio, U16-entrega, C14, C15, C22, R4, R5 y RP19).

Sin FastAPI. Una sola funcion de envio para SC, COT y PVEN (C15/R20): enviar_documento(..., proposito='CONFIRMACION' |
'CONSULTA' | 'SEGUIMIENTO'), con dos plantillas de Meta (Utilidad, espanol): 'documento' (envio_whatsapp_plantilla) y
'recordatorio' (envio_whatsapp_plantilla_recordatorio, la usa SEGUIMIENTO de T11). whatsapp_configurado(db) dice si el
envio automatico esta listo. No hay «WhatsApp desde mi telefono» (R5): con el automatico apagado el asesor abre wa.me.

Configuracion en admin_config (por el helper unico de T2, RP17; /ventas/config las rechaza con 422, RP18):
  envio_whatsapp_automatico 'true'|'false' ('false' por defecto), envio_whatsapp_inbox_id (la bandeja de Chatwoot),
  envio_whatsapp_plantilla, envio_whatsapp_plantilla_recordatorio y envio_whatsapp_idioma ('es' por defecto).
La conexion (URL, cuenta y token) vive solo en las variables del servidor (core/chatwoot.py, R18).

enviar_documento, en orden: (a) automatico apagado -> ENVIO_AUTOMATICO_APAGADO sin llamar a Chatwoot; (b) sin conexion
-> CHATWOOT_NO_CONFIGURADO; (c) sin bandeja -> BANDEJA_NO_CONFIGURADA; (d) sin e164 -> TELEFONO_INVALIDO; (e) busca el
contacto y su conversacion mas reciente en la bandeja; (f) can_reply True -> texto libre (TEXTO); (g) si no, con
plantilla -> PLANTILLA (en la conversacion existente o en una nueva, creando el contacto si hace falta); (h) sin
plantilla -> FUERA_DE_VENTANA_SIN_PLANTILLA y no sale nada (un cliente que Chatwoot no conoce ni se crea). can_reply que
no viene cuenta como False. Plazo total PLAZO_TOTAL (12 s); cada llamada, min(6, lo que queda). Siempre agrega una fila
EnvioAlCliente (add + flush, SIN commit: la confirma el commit del renglon de Actividad de quien llama) con el mensaje
SIN el enlace (ocultar_enlace). texto_manual (con el enlace) solo viaja en la respuesta HTTP.

verificar_envio (U16-entrega, R4, C22): consulta el estado del mensaje en Chatwoot y anota ENTREGADO, LEIDO y FALLIDO en
la Actividad del documento, una vez cada uno (renglon MENSAJE_CLIENTE sin clave 'campo'); nunca toca doc.updated_at.
"""
import logging
import re
import time
from datetime import datetime

from sqlalchemy.orm import Session

from app.core import admin_config, chatwoot
from app.core.chatwoot import ChatwootError, ChatwootNoConfigurado, ChatwootSinRespuesta
from app.core.confirmation_tokens import TOKEN_TTL_DAYS, frontend_url
from app.core.documento_cliente import TITULOS
from app.core.empresa import ENTIDAD_EMPRESA, empresa_para_mensajes, limpiar_linea
from app.core.fechas import fecha_larga
from app.core.telefonos import e164_whatsapp, telefono_legible
from app.core.textos_actividad import autor_de_actividad
from app.core.ventas_dinero import pesos
from app.models.envios import PLANTILLA_MAX, EnvioAlCliente
from app.models.erp_documents import ActivityLog

logger = logging.getLogger(__name__)

# ─── Configuracion ─────────────────────────────────────────────────────────────────────────────────────────────────

PREFIJO_CLAVES = "envio_whatsapp_"
CLAVE_AUTOMATICO = "envio_whatsapp_automatico"
CLAVE_INBOX = "envio_whatsapp_inbox_id"
CLAVE_PLANTILLA = "envio_whatsapp_plantilla"
CLAVE_PLANTILLA_RECORDATORIO = "envio_whatsapp_plantilla_recordatorio"
CLAVE_IDIOMA = "envio_whatsapp_idioma"
CLAVES = {"automatico": CLAVE_AUTOMATICO, "inbox_id": CLAVE_INBOX, "plantilla": CLAVE_PLANTILLA,
          "plantilla_recordatorio": CLAVE_PLANTILLA_RECORDATORIO, "idioma": CLAVE_IDIOMA}
IDIOMA_POR_DEFECTO = "es"
# r1 (L4 = R8): el nombre cabe en envios_al_cliente.plantilla (PLANTILLA_MAX = 100, VARCHAR(100) de fa6_030). Con 512,
# como decia el brief, el registro de un envio en modo PLANTILLA fallaba DESPUES de mandarlo (un 500 tras el commit).
_PLANTILLA_CARACTERES = re.compile(r"[a-z0-9_]+")
_PLANTILLA_VALIDA = re.compile(rf"[a-z0-9_]{{1,{PLANTILLA_MAX}}}")
_IDIOMA_VALIDO = re.compile(r"[a-z]{2}(_[A-Z]{2})?")

MENSAJE_PLANTILLA = "El nombre de la plantilla solo puede tener minúsculas, números y guion bajo, igual que en Meta."
MENSAJE_PLANTILLA_LARGA = f"El nombre de la plantilla puede tener hasta {PLANTILLA_MAX} caracteres."
MENSAJE_INBOX = "El número de la bandeja debe ser un número entero mayor que 0."
MENSAJE_IDIOMA = "El idioma debe tener el formato de Meta, por ejemplo es o es_CO."
MENSAJE_AUTOMATICO = "El interruptor del envío automático debe ser verdadero o falso."
MENSAJE_FALTA_BANDEJA = "Para encender el envío automático falta el número de la bandeja de WhatsApp."
MENSAJE_CAMPO_DESCONOCIDO = "Campo desconocido: {campo}."

ESTADO_APAGADO = "El envío automático por WhatsApp está apagado: se abre WhatsApp en el computador del asesor."
ESTADO_SIN_SERVIDOR = "Falta configurar la conexión con Chatwoot en el servidor (EasyPanel)."
ESTADO_SIN_BANDEJA = "Falta el número de la bandeja de WhatsApp de Chatwoot en Configuración."

_ETIQUETAS_CONFIG = {"automatico": "Envío automático", "inbox_id": "Bandeja de WhatsApp en Chatwoot",
                     "plantilla": "Plantilla del documento", "plantilla_recordatorio": "Plantilla del recordatorio",
                     "idioma": "Idioma de las plantillas"}

# ─── Textos de los mensajes ────────────────────────────────────────────────────────────────────────────────────────

CANAL = "WhatsApp"
PROPOSITOS = ("CONFIRMACION", "CONSULTA", "SEGUIMIENTO")
NOMBRE_DOCUMENTO = {"SC": "solicitud", "COT": "cotización", "PVEN": "pedido"}
CATEGORIA_PLANTILLA = "UTILITY"
EMPRESA_POR_DEFECTO = "Nebulae"
CLIENTE_POR_DEFECTO = "cliente"
ENLACE_OCULTO = "[enlace de confirmación]"
PLAZO_TOTAL = 12  # segundos para todas las llamadas de un envio (se suman a los 10 s del SMTP de H27)

# C15: dos plantillas de Meta (categoria Utilidad, espanol). Empiezan y terminan en texto y no tienen variables pegadas.
# 'documento', neutra para SC, COT y PVEN: {{3}} = 'Solicitud SC-…' / 'Cotización COT-…' / 'Pedido de venta PVEN-…'.
TEXTO_PLANTILLA_DOCUMENTO = ("Hola {{1}}, te escribimos de {{2}}. Te enviamos el documento {{3}}. Puedes revisarlo en "
                             "este enlace: {{4}} Si tienes alguna pregunta, responde este mensaje.")
# 'recordatorio' (U16-seguimiento, T11): nombre, documento ('solicitud SC-…' / 'cotización COT-…'), empresa y enlace.
TEXTO_PLANTILLA_RECORDATORIO = ("Hola {{1}}, te recordamos que tu {{2}} de {{3}} está esperando tu confirmación. "
                                "Revísala y confírmala aquí: {{4}} Si quieres cambiar algo, en esa misma página puedes "
                                "pedir cambios.")

MOTIVOS = {
    "ENVIO_AUTOMATICO_APAGADO": ("Envío manual: se abrió WhatsApp en el computador del asesor (el envío automático "
                                 "está apagado)."),
    "CHATWOOT_NO_CONFIGURADO": "No se envió: la conexión con Chatwoot no está configurada en el servidor.",
    "BANDEJA_NO_CONFIGURADA": "No se envió: falta el número de la bandeja de WhatsApp de Chatwoot en Configuración.",
    "TELEFONO_INVALIDO": "No se envió: el teléfono del cliente no es un número de WhatsApp válido.",
    "FUERA_DE_VENTANA_SIN_PLANTILLA": ("No se envió: el cliente no ha escrito en las últimas 24 horas y no hay una "
                                       "plantilla aprobada por Meta en Configuración."),
    "FALLO_CHATWOOT": "No se envió: Chatwoot rechazó el mensaje ({detalle}).",
    # r2 (arreglos 3): neutro, porque cubre el timeout, el 5xx, la respuesta que no es JSON, el corte al leer y el 2xx sin
    # id despues del POST final (la causa queda en detalle).
    "CHATWOOT_SIN_RESPUESTA": ("Chatwoot no confirmó el envío: puede que el mensaje haya salido. Revisa la conversación "
                               "en Chatwoot antes de reenviarlo."),
}
TEXTOS_ENVIADO = {
    "TEXTO": "Enviado automáticamente al {destino} desde el WhatsApp de la empresa.",
    "PLANTILLA": ("Enviado automáticamente al {destino} con la plantilla aprobada «{plantilla}» (el cliente no había "
                  "escrito en las últimas 24 horas)."),
}
_DETALLE_EN_TEXTO_MAX = 150

# ─── Estado de entrega (U16-entrega) ───────────────────────────────────────────────────────────────────────────────

ESTADOS_CHATWOOT = {"sent": "ENVIADO", "delivered": "ENTREGADO", "read": "LEIDO", "failed": "FALLIDO"}
ESTADOS_FINALES = ("LEIDO", "FALLIDO")
_ORDEN_ENTREGA = {"ENVIADO": 0, "ENTREGADO": 1, "LEIDO": 2}
ACCION_MENSAJE_CLIENTE = "MENSAJE_CLIENTE"  # RP22: solo la action; su etiqueta, color e icono los pone T13
_ENTIDAD_ACTIVIDAD = {"SC": "SC", "COT": "COT", "PVEN": "VEN"}
TEXTO_NO_SE_PUDO_CONSULTAR = "No se pudo consultar Chatwoot ahora; vuelve a intentar."
TEXTO_NO_ENCONTRADO = "No se encontró el mensaje en Chatwoot: no se pudo verificar si le llegó al cliente."
TEXTO_SIN_ESTADO = "Este envío no salió por el WhatsApp automático: no hay estado de entrega que consultar."
_TEXTOS_ESTADO = {
    "ENVIADO": "Chatwoot aceptó el mensaje; WhatsApp todavía no confirma que le llegó al cliente.",
    "ENTREGADO": "El WhatsApp le llegó al cliente.",
    "LEIDO": "El cliente leyó el WhatsApp.",
}
_DESCRIPCION_ENTREGA = {"ENTREGADO": "El WhatsApp le llegó al cliente", "LEIDO": "El cliente leyó el WhatsApp",
                        "FALLIDO": "El WhatsApp no le llegó al cliente"}
_QUE_HACER = {"PVEN": "Usa «Reenviar al cliente» y mándalo por otro medio."}
_QUE_HACER_POR_DEFECTO = "Usa «Reenviar enlace de confirmación» y mándalo por otro medio."

_ERRORES_WHATSAPP = {
    "131047": "pasaron más de 24 horas desde el último mensaje del cliente y no se usó una plantilla aprobada",
    "131026": "ese número no tiene WhatsApp o no puede recibir mensajes",
    **{codigo: "la plantilla no coincide con la aprobada por Meta (nombre, idioma o datos) o fue pausada"
       for codigo in ("132000", "132001", "132005", "132007", "132012", "132015", "132016")},
    "131048": "Meta limitó los envíos de la empresa para cuidar la calidad; intenta más tarde",
    "131049": "Meta limitó los envíos de la empresa para cuidar la calidad; intenta más tarde",
    "131042": "hay un problema de pago en la cuenta de WhatsApp Business",
    "131056": "se enviaron demasiados mensajes a este número en poco tiempo",
}
_CODIGO_AL_INICIO = re.compile(r"\s*\(?#?(\d{5,6})(?!\d)")


# ─── Utilidades ────────────────────────────────────────────────────────────────────────────────────────────────────

def _una_linea(texto) -> str:
    """Una sola linea con la regla de empresa.limpiar_linea (saltos y demas caracteres de control a espacio) y los
    espacios colapsados: Meta rechaza parametros con saltos, tabuladores o mas de 4 espacios seguidos (r1, S4)."""
    return " ".join(limpiar_linea(texto).split())


def _recortar(texto: str, maximo: int) -> str:
    return texto if len(texto) <= maximo else texto[:maximo - 1] + "…"


def _entero_positivo(valor):
    """int > 0 desde un int (no bool) o un texto de digitos; si no, None."""
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int):
        return valor if valor > 0 else None
    if isinstance(valor, str):
        v = valor.strip()
        if v.isascii() and v.isdigit() and int(v) > 0:
            return int(v)
    return None


def _plantilla_o_none(valor):
    v = valor.strip() if isinstance(valor, str) else None
    return v if v and _PLANTILLA_VALIDA.fullmatch(v) else None


def leer_config(db: Session) -> dict:
    """{automatico: bool, inbox_id: int|None, plantilla, plantilla_recordatorio (str|None), idioma} de admin_config,
    con un solo SELECT (admin_config.leer_config, RP17). Un valor guardado que no cumple su regla cuenta como ausente."""
    guardado = admin_config.leer_config(db, CLAVES.values())
    idioma = (guardado.get(CLAVE_IDIOMA) or "").strip()
    return {
        "automatico": (guardado.get(CLAVE_AUTOMATICO) or "").strip().lower() == "true",
        "inbox_id": _entero_positivo(guardado.get(CLAVE_INBOX)),
        "plantilla": _plantilla_o_none(guardado.get(CLAVE_PLANTILLA)),
        "plantilla_recordatorio": _plantilla_o_none(guardado.get(CLAVE_PLANTILLA_RECORDATORIO)),
        "idioma": idioma if _IDIOMA_VALIDO.fullmatch(idioma) else IDIOMA_POR_DEFECTO,
    }


def estado_config(db: Session, cfg: dict | None = None) -> dict:
    """{automatico, listo, plantilla_configurada, plantilla_recordatorio_configurada, motivo_texto}: lo que puede ver
    el asesor. Nunca el token ni la URL de Chatwoot. listo = encendido + conexion en el servidor + bandeja."""
    cfg = cfg if cfg is not None else leer_config(db)
    servidor = chatwoot.configurado()
    motivo = None
    if not cfg["automatico"]:
        motivo = ESTADO_APAGADO
    elif not servidor:
        motivo = ESTADO_SIN_SERVIDOR
    elif cfg["inbox_id"] is None:
        motivo = ESTADO_SIN_BANDEJA
    return {"automatico": cfg["automatico"], "listo": motivo is None,
            "plantilla_configurada": cfg["plantilla"] is not None,
            "plantilla_recordatorio_configurada": cfg["plantilla_recordatorio"] is not None,
            "motivo_texto": motivo}


def whatsapp_configurado(db: Session) -> bool:
    """True si el envio automatico esta encendido y listo (lo usa el seguimiento de T11 para saber si hay medio)."""
    return estado_config(db)["listo"]


def config_para_admin(db: Session) -> dict:
    """La seccion de Configuracion (solo ADMIN): los valores, si el servidor tiene la conexion (sin mostrarla), los
    textos para crear las dos plantillas en Meta y un ejemplo de sus variables. Nunca el token ni la URL."""
    cfg = leer_config(db)
    estado = estado_config(db, cfg)
    empresa = empresa_para_mensajes(db)["nombre"] or EMPRESA_POR_DEFECTO
    enlace = f"{frontend_url()}/confirmar/EJEMPLO"
    return {**cfg, "servidor_configurado": chatwoot.configurado(), "listo": estado["listo"],
            "motivo_texto": estado["motivo_texto"], "categoria": CATEGORIA_PLANTILLA,
            "texto_plantilla": TEXTO_PLANTILLA_DOCUMENTO, "texto_plantilla_recordatorio": TEXTO_PLANTILLA_RECORDATORIO,
            "ejemplo_parametros": parametros_plantilla("COT", "María Pérez", empresa, "COT-20260001", enlace),
            "ejemplo_parametros_recordatorio": parametros_plantilla("COT", "María Pérez", empresa, "COT-20260001",
                                                                    enlace, proposito="SEGUIMIENTO")}


def validar_cambios(db: Session, body: dict) -> dict:
    """{campo: texto a guardar | None (borra la clave)} del PUT de la configuracion, o ValueError con el mensaje en
    espanol del 422 (R12). Todo o nada: se valida todo antes de guardar. Para encender hace falta la bandeja (la del
    body o la guardada)."""
    for campo in body:
        if campo not in CLAVES:
            raise ValueError(MENSAJE_CAMPO_DESCONOCIDO.format(campo=campo))
    cambios = {}
    if "automatico" in body:
        valor = body["automatico"]
        if isinstance(valor, str) and valor.strip().lower() in ("true", "false"):
            valor = valor.strip().lower() == "true"
        if not isinstance(valor, bool):
            raise ValueError(MENSAJE_AUTOMATICO)
        cambios["automatico"] = "true" if valor else "false"
    if "inbox_id" in body:
        valor = body["inbox_id"]
        if valor is None or (isinstance(valor, str) and not valor.strip()):
            cambios["inbox_id"] = None
        else:
            numero = _entero_positivo(valor)
            if numero is None:
                raise ValueError(MENSAJE_INBOX)
            cambios["inbox_id"] = str(numero)
    for campo in ("plantilla", "plantilla_recordatorio"):
        if campo in body:
            valor = body[campo]
            if valor is None or (isinstance(valor, str) and not valor.strip()):
                cambios[campo] = None
            elif not (isinstance(valor, str) and _PLANTILLA_CARACTERES.fullmatch(valor.strip())):
                raise ValueError(MENSAJE_PLANTILLA)
            elif len(valor.strip()) > PLANTILLA_MAX:
                raise ValueError(MENSAJE_PLANTILLA_LARGA)
            else:
                cambios[campo] = valor.strip()
    if "idioma" in body:
        valor = body["idioma"]
        if valor is None or (isinstance(valor, str) and not valor.strip()):
            cambios["idioma"] = None
        elif isinstance(valor, str) and _IDIOMA_VALIDO.fullmatch(valor.strip()):
            cambios["idioma"] = valor.strip()
        else:
            raise ValueError(MENSAJE_IDIOMA)
    actual = leer_config(db)
    encendido = cambios["automatico"] == "true" if "automatico" in cambios else actual["automatico"]
    bandeja = cambios["inbox_id"] if "inbox_id" in cambios else actual["inbox_id"]
    if encendido and bandeja is None:
        raise ValueError(MENSAJE_FALTA_BANDEJA)
    return cambios


def _como_se_ve(campo: str, valor) -> str:
    if campo == "automatico":
        return "Encendido" if valor in (True, "true") else "Apagado"
    if campo == "idioma":
        return str(valor or IDIOMA_POR_DEFECTO)
    return "Sin definir" if valor in (None, "") else str(valor)


def guardar_configuracion(db: Session, cambios: dict, user_name) -> list:
    """Guarda lo que cambio de `cambios` (la salida de validar_cambios) con admin_config.guardar_config (el upsert
    parametrizado, RP17) y anota un renglon EMPRESA en la Actividad (el historial de Configuracion), a nombre de la
    sesion (RP15). Devuelve [{etiqueta, antes, despues}]. SIN commit: lo hace quien llama."""
    actual = leer_config(db)
    escribir, hechos = {}, []
    for campo, valor in cambios.items():
        antes, despues = _como_se_ve(campo, actual[campo]), _como_se_ve(campo, valor)
        if antes == despues:
            continue
        escribir[CLAVES[campo]] = valor
        hechos.append({"etiqueta": _ETIQUETAS_CONFIG[campo], "antes": antes, "despues": despues})
    if not hechos:
        return []
    admin_config.guardar_config(db, escribir)
    db.add(ActivityLog(entity_type=ENTIDAD_EMPRESA, entity_id=0, entity_numero=ENTIDAD_EMPRESA, action="UPDATED",
                       description="Envío automático por WhatsApp actualizado: "
                                   + ", ".join(h["etiqueta"] for h in hechos),
                       user_name=autor_de_actividad(user_name) or "Sistema", extra_data={"cambios": hechos}))
    return hechos


# ─── Textos ────────────────────────────────────────────────────────────────────────────────────────────────────────

def _texto_vence(doc_tipo: str, vence) -> str:
    """C14: la fecha real. La COT dice hasta cuando es valida; el PVEN (y una SC con fecha) hasta cuando sirve el
    enlace. La SC sin fecha usa la vida fija de su enlace (TOKEN_TTL_DAYS)."""
    fecha = fecha_larga(vence) if vence is not None else None
    if fecha:
        if doc_tipo == "COT":
            return f"La cotización es válida hasta el {fecha}."
        return f"El enlace estará disponible hasta el {fecha}."
    if doc_tipo == "SC":
        return f"El enlace vence en {TOKEN_TTL_DAYS} días."
    return ""


def texto_libre(doc_tipo: str, nombre, empresa, numero, enlace: str, total_cop=None, vence=None,
                proposito: str = "CONFIRMACION") -> str:
    """El mensaje normal (dentro de las 24 h) y el que lleva el boton «Abrir WhatsApp con el mensaje». El total va con
    pesos() (H42) en la COT y el PVEN; el PVEN es de consulta (C15)."""
    nombre = _una_linea(nombre) or CLIENTE_POR_DEFECTO
    empresa = _una_linea(empresa) or EMPRESA_POR_DEFECTO
    numero = _una_linea(numero)
    por_total = f" por {pesos(total_cop)}" if total_cop is not None and doc_tipo in ("COT", "PVEN") else ""
    vence_txt = _texto_vence(doc_tipo, vence)
    if proposito == "SEGUIMIENTO":
        partes = [f"Hola {nombre}, te recordamos que tu {NOMBRE_DOCUMENTO[doc_tipo]} {numero} de {empresa} está "
                  f"esperando tu confirmación. Revísala y confírmala aquí: {enlace}", vence_txt,
                  "Si quieres cambiar algo, en esa misma página puedes pedir cambios."]
    else:
        if doc_tipo == "SC":
            cuerpo = f"Puedes revisar y confirmar tu solicitud {numero} en este enlace: {enlace}"
        elif doc_tipo == "COT":
            cuerpo = (f"Tu cotización {numero}{por_total} está lista. Puedes revisarla y confirmarla en este enlace: "
                      f"{enlace}")
        else:
            cuerpo = (f"Tu pedido {numero}{por_total} quedó registrado. Puedes ver tu pedido, lo que has pagado y lo "
                      f"que te falta en este enlace: {enlace}")
        partes = [f"Hola {nombre}, te escribimos de {empresa}.", cuerpo, vence_txt,
                  "Si tienes alguna pregunta, responde este mensaje."]
    return " ".join(p for p in partes if p)


def parametros_plantilla(doc_tipo: str, nombre, empresa, numero, enlace: str, proposito: str = "CONFIRMACION") -> dict:
    """Las 4 variables de la plantilla, en una sola linea cada una. 'documento': {1 nombre, 2 empresa, 3 'Solicitud
    SC-…' | 'Cotización COT-…' | 'Pedido de venta PVEN-…', 4 enlace}. 'recordatorio' (SEGUIMIENTO): {1 nombre,
    2 'solicitud SC-…' | 'cotización COT-…', 3 empresa, 4 enlace}."""
    nombre = _una_linea(nombre) or CLIENTE_POR_DEFECTO
    empresa = _una_linea(empresa) or EMPRESA_POR_DEFECTO
    numero = _una_linea(numero)
    if proposito == "SEGUIMIENTO":
        return {"1": nombre, "2": f"{NOMBRE_DOCUMENTO[doc_tipo]} {numero}", "3": empresa, "4": _una_linea(enlace)}
    return {"1": nombre, "2": empresa, "3": f"{TITULOS[doc_tipo]} {numero}", "4": _una_linea(enlace)}


_VARIABLE_DE_PLANTILLA = re.compile(r"\{\{(\d+)\}\}")
_COLA_MINIMA = 8  # un pedazo del token mas corto que esto, al final de un texto recortado, no sirve para nada


def rellenar_plantilla(texto_plantilla: str, params: dict) -> str:
    """El texto de la plantilla con sus variables: lo que ve el cliente (y el content del mensaje en Chatwoot). En UNA
    sola pasada (r1, S3): un valor que trae '{{2}}' (un cliente que se llama asi) no se vuelve a sustituir. Una
    variable sin valor queda tal cual."""
    return _VARIABLE_DE_PLANTILLA.sub(lambda m: params.get(m.group(1), m.group(0)), texto_plantilla)


def ocultar_enlace(texto, enlace) -> str:
    """El texto con el enlace (y, por si acaso, su token suelto) cambiado por '[enlace de confirmación]': lo que se
    guarda en envios_al_cliente y en la Actividad. El enlace con su token NUNCA se guarda.
    r1 (L1 = S2 = R7): tambien sirve para el detalle de un error de Chatwoot, que puede repetir el contenido enviado y
    llega recortado (300): si el texto TERMINA en un pedazo del token (de _COLA_MINIMA caracteres o mas), ese pedazo
    tambien se cambia."""
    texto = "" if texto is None else str(texto)
    if enlace:
        texto = texto.replace(enlace, ENLACE_OCULTO)
        token = str(enlace).rstrip("/").rsplit("/", 1)[-1]
        if len(token) >= 20:
            texto = texto.replace(token, ENLACE_OCULTO)
            for n in range(len(token) - 1, _COLA_MINIMA - 1, -1):
                if texto.endswith(token[:n]):
                    texto = texto[:-n] + ENLACE_OCULTO
                    break
    return texto


def _texto_resultado(motivo, modo, legible, plantilla, detalle) -> str:
    if motivo is None:
        return TEXTOS_ENVIADO[modo].format(destino=legible, plantilla=plantilla)
    if motivo == "FALLO_CHATWOOT":
        return MOTIVOS[motivo].format(detalle=_recortar(detalle or "sin detalle", _DETALLE_EN_TEXTO_MAX))
    return MOTIVOS[motivo]


def _detalle_de(e: ChatwootError) -> str:
    return chatwoot.limpiar_detalle(f"{e.status}: {e.detalle}" if e.status is not None else e.detalle)


# ─── Envio ─────────────────────────────────────────────────────────────────────────────────────────────────────────

class _SinIdDelMensaje(Exception):
    """Chatwoot acepto el POST final (2xx) pero no devolvio el id del mensaje: puede que haya salido."""


def _por_chatwoot(inbox_id: int, idioma: str, plantilla, e164: str, nombre: str, email, texto: str,
                  contenido_plantilla: str, params: dict) -> dict:
    """Pasos (e) a (h) de enviar_documento. Devuelve {motivo, modo, detalle, conv, msg, contenido, plantilla}.

    r1 (R3): `post_final` marca que ya se intento el POST que manda el mensaje (enviar_mensaje o crear_conversacion).
    Desde ahi, lo ambiguo (un error sin status o con status >= 500, una respuesta que no es JSON, un corte al leer, un
    2xx sin 'id' o con otra forma) puede esconder un mensaje que SI salio: CHATWOOT_SIN_RESPUESTA («puede que haya
    salido»), nunca un «No se envió» falso que invite a mandarlo otra vez. Antes del POST final no salio nada:
    FALLO_CHATWOOT. Un 4xx en el POST final es un rechazo de Chatwoot: FALLO_CHATWOOT."""
    res = {"motivo": None, "modo": None, "detalle": None, "conv": None, "msg": None, "contenido": texto,
           "plantilla": None}
    plazo = time.monotonic() + PLAZO_TOTAL
    post_final = False
    try:
        contacto = chatwoot.buscar_contacto(e164, plazo=plazo)
        conversacion = None
        if contacto is not None:
            conversacion = chatwoot.conversacion_reciente(contacto["id"], inbox_id, plazo=plazo)
            if conversacion is not None:
                res["conv"] = conversacion.get("id")
        if conversacion is not None and conversacion.get("can_reply") is True:
            conv_id = conversacion["id"]
            post_final = True
            mensaje = chatwoot.enviar_mensaje(conv_id, texto, plazo=plazo)
            if mensaje.get("id") is None:
                raise _SinIdDelMensaje()
            res.update(modo="TEXTO", msg=mensaje.get("id"))
            return res
        if not plantilla:
            res["motivo"] = "FUERA_DE_VENTANA_SIN_PLANTILLA"
            return res
        template_params = {"name": plantilla, "category": CATEGORIA_PLANTILLA, "language": idioma,
                           "processed_params": params}
        res.update(contenido=contenido_plantilla, plantilla=plantilla)
        if conversacion is not None:
            conv_id = conversacion["id"]
            post_final = True
            mensaje = chatwoot.enviar_mensaje(conv_id, contenido_plantilla, template_params, plazo=plazo)
            if mensaje.get("id") is None:
                raise _SinIdDelMensaje()
            res.update(modo="PLANTILLA", msg=mensaje.get("id"))
            return res
        if contacto is None:
            contact_id, source_id = chatwoot.crear_contacto(inbox_id, nombre, e164, email, plazo=plazo)
        else:
            contact_id = contacto["id"]
            source_id = chatwoot.source_id_en_bandeja(contacto, inbox_id, e164, plazo=plazo)
        post_final = True
        conv_id, msg_id = chatwoot.crear_conversacion(inbox_id, contact_id, source_id, contenido_plantilla,
                                                      template_params, plazo=plazo)
        if conv_id is None:
            raise _SinIdDelMensaje()
        res.update(modo="PLANTILLA", conv=conv_id, msg=msg_id)
        return res
    except ChatwootSinRespuesta as e:
        res.update(motivo="CHATWOOT_SIN_RESPUESTA", modo=None, detalle=_detalle_de(e))
    except ChatwootError as e:
        ambiguo = post_final and (e.status is None or e.status >= 500)
        res.update(motivo="CHATWOOT_SIN_RESPUESTA" if ambiguo else "FALLO_CHATWOOT", modo=None,
                   detalle=_detalle_de(e))
    except ChatwootNoConfigurado:
        res.update(motivo="CHATWOOT_NO_CONFIGURADO", modo=None)
    except _SinIdDelMensaje:
        res.update(motivo="CHATWOOT_SIN_RESPUESTA", modo=None, detalle="Chatwoot no devolvió el id del mensaje")
    except Exception:
        # Una respuesta con otra forma (otra version de Chatwoot): no tumba el envio, que ya quedo confirmado.
        logger.exception("Respuesta inesperada de Chatwoot al enviar un WhatsApp")
        res.update(motivo="CHATWOOT_SIN_RESPUESTA" if post_final else "FALLO_CHATWOOT", modo=None,
                   detalle="respuesta inesperada de Chatwoot")
    return res


def enviar_documento(db: Session, *, doc_tipo: str, doc_id: int, doc_numero, cliente_nombre, cliente_email, telefono,
                     enlace: str, total_cop=None, vence=None, user_name, proposito: str = "CONFIRMACION") -> dict:
    """Manda el enlace por WhatsApp desde la bandeja de la empresa en Chatwoot (pasos (a) a (h) del docstring del
    modulo), agrega la fila EnvioAlCliente (flush, sin commit) y devuelve {enviado, estado ('ENVIADO'|'NO_ENVIADO'),
    modo, destino (e164 o None), destino_legible, motivo, texto_resultado, mensaje (sin el enlace), detalle, envio_id,
    texto_manual (con el enlace; solo para la respuesta HTTP)}. Nunca lanza por un fallo de Chatwoot.
    vence: la FECHA hasta la que vale (COT: valida_hasta; PVEN: el ultimo dia del enlace; C14)."""
    if doc_tipo not in NOMBRE_DOCUMENTO:
        raise ValueError(f"Tipo de documento desconocido: {doc_tipo!r}")
    if proposito not in PROPOSITOS:
        raise ValueError(f"Propósito desconocido: {proposito!r}")
    cfg = leer_config(db)
    empresa = empresa_para_mensajes(db)["nombre"] or EMPRESA_POR_DEFECTO
    nombre = _una_linea(cliente_nombre) or CLIENTE_POR_DEFECTO
    texto = texto_libre(doc_tipo, nombre, empresa, doc_numero, enlace, total_cop=total_cop, vence=vence,
                        proposito=proposito)
    seguimiento = proposito == "SEGUIMIENTO"
    plantilla = cfg["plantilla_recordatorio"] if seguimiento else cfg["plantilla"]
    params = parametros_plantilla(doc_tipo, nombre, empresa, doc_numero, enlace, proposito=proposito)
    contenido_plantilla = rellenar_plantilla(
        TEXTO_PLANTILLA_RECORDATORIO if seguimiento else TEXTO_PLANTILLA_DOCUMENTO, params)
    e164 = e164_whatsapp(telefono)

    res = {"motivo": None, "modo": None, "detalle": None, "conv": None, "msg": None, "contenido": texto,
           "plantilla": None}
    if not cfg["automatico"]:
        res["motivo"] = "ENVIO_AUTOMATICO_APAGADO"
    elif not chatwoot.configurado():
        res["motivo"] = "CHATWOOT_NO_CONFIGURADO"
    elif cfg["inbox_id"] is None:
        res["motivo"] = "BANDEJA_NO_CONFIGURADA"
    elif e164 is None:
        res["motivo"] = "TELEFONO_INVALIDO"
    else:
        res = _por_chatwoot(cfg["inbox_id"], cfg["idioma"], plantilla, e164, nombre, cliente_email, texto,
                            contenido_plantilla, params)

    enviado = res["motivo"] is None
    estado = "ENVIADO" if enviado else "NO_ENVIADO"
    legible = telefono_legible(e164)
    mensaje = ocultar_enlace(res["contenido"], enlace)
    # r1 (L1 = S2 = R7): el detalle de un error puede repetir lo enviado; sin el enlace en la fila, la Actividad y la
    # respuesta.
    detalle = ocultar_enlace(res["detalle"], enlace) if res["detalle"] is not None else None
    texto_resultado = _texto_resultado(res["motivo"], res["modo"], legible, res["plantilla"], detalle)
    envio = EnvioAlCliente(
        document_type=doc_tipo, document_id=doc_id, document_numero=_una_linea(doc_numero)[:50], proposito=proposito,
        canal=CANAL, destino=e164 or _una_linea(telefono)[:200], modo=res["modo"], plantilla=res["plantilla"],
        mensaje=mensaje, estado=estado, motivo=res["motivo"], detalle=detalle,
        chatwoot_conversation_id=str(res["conv"])[:50] if res["conv"] is not None else None,
        chatwoot_message_id=str(res["msg"])[:50] if res["msg"] is not None else None,
        user_name=autor_de_actividad(user_name))
    db.add(envio)
    db.flush()
    logger.info("WhatsApp de %s %s: %s %s", doc_tipo, envio.document_numero, estado, res["motivo"] or res["modo"])
    return {"enviado": enviado, "estado": estado, "modo": res["modo"], "destino": e164, "destino_legible": legible,
            "motivo": res["motivo"], "texto_resultado": texto_resultado, "mensaje": mensaje,
            "detalle": detalle, "envio_id": envio.id, "texto_manual": texto}


# ─── «Probar conexion» (hueco 0) ───────────────────────────────────────────────────────────────────────────────────

def _estado_plantilla(nombre, plantillas) -> tuple:
    """('APROBADA' | 'NO_ENCONTRADA' | 'NO_VERIFICABLE' | None, detalle) de la plantilla `nombre` en las
    message_templates de la bandeja. None si no hay nombre configurado."""
    if not nombre:
        return None, None
    if not isinstance(plantillas, list):
        return "NO_VERIFICABLE", "La bandeja no informa sus plantillas de Meta: revísala en Meta Business."
    encontradas = [p for p in plantillas if isinstance(p, dict) and p.get("name") == nombre]
    if any(str(p.get("status") or "").strip().lower() == "approved" for p in encontradas):
        return "APROBADA", None
    if encontradas:
        estado = _una_linea(encontradas[0].get("status")) or "sin estado"
        return "NO_ENCONTRADA", (f"La plantilla «{nombre}» existe en Meta, pero su estado es {estado[:40]}: todavía no "
                                 f"está aprobada.")
    return "NO_ENCONTRADA", f"No hay una plantilla «{nombre}» en esta bandeja."


def probar_conexion(db: Session) -> dict:
    """Lee la version de Chatwoot (GET {base}/api) y la bandeja configurada (channel_type y message_templates con su
    estado) para revisar las dos plantillas. No envia mensajes. {ok, version, bandeja, es_whatsapp, plantilla,
    plantilla_detalle, plantilla_recordatorio, plantilla_recordatorio_detalle, mensaje}; nunca el token ni la URL."""
    cfg = leer_config(db)
    res = {"ok": False, "version": None, "bandeja": None, "es_whatsapp": False, "plantilla": None,
           "plantilla_detalle": None, "plantilla_recordatorio": None, "plantilla_recordatorio_detalle": None,
           "mensaje": None}
    if not chatwoot.configurado():
        res["mensaje"] = ESTADO_SIN_SERVIDOR
        return res
    if cfg["inbox_id"] is None:
        res["mensaje"] = ESTADO_SIN_BANDEJA
        return res
    plazo = time.monotonic() + PLAZO_TOTAL
    try:
        res["version"] = chatwoot.version_api(plazo=plazo)
    except ChatwootError:
        pass  # la version solo informa; lo que decide es la bandeja
    try:
        bandeja = chatwoot.bandeja(cfg["inbox_id"], plazo=plazo)
    except ChatwootSinRespuesta:
        res["mensaje"] = "Chatwoot no respondió a tiempo."
        return res
    except ChatwootError as e:
        if e.status in (401, 403):
            res["mensaje"] = (f"Chatwoot rechazó la conexión ({e.status}): revisa el token del servidor "
                              f"(CHATWOOT_API_TOKEN) y que su usuario tenga acceso a la bandeja.")
        elif e.status == 404:
            res["mensaje"] = (f"No existe la bandeja {cfg['inbox_id']} en Chatwoot (o el usuario del token no tiene "
                              f"acceso a ella).")
        else:
            res["mensaje"] = f"Chatwoot respondió con un error ({_recortar(_detalle_de(e), _DETALLE_EN_TEXTO_MAX)})."
        return res
    except ChatwootNoConfigurado:
        res["mensaje"] = ESTADO_SIN_SERVIDOR
        return res
    tipo = _una_linea(bandeja.get("channel_type"))
    res["bandeja"] = _una_linea(bandeja.get("name"))[:100] or None
    res["es_whatsapp"] = tipo == "Channel::Whatsapp"
    plantillas = bandeja.get("message_templates")
    res["plantilla"], res["plantilla_detalle"] = _estado_plantilla(cfg["plantilla"], plantillas)
    res["plantilla_recordatorio"], res["plantilla_recordatorio_detalle"] = _estado_plantilla(
        cfg["plantilla_recordatorio"], plantillas)
    res["ok"] = res["es_whatsapp"]
    res["mensaje"] = (f"Conexión correcta con la bandeja «{res['bandeja'] or cfg['inbox_id']}» de WhatsApp."
                      if res["ok"] else
                      f"La bandeja {cfg['inbox_id']} no es de WhatsApp ({tipo[:60] or 'tipo desconocido'}).")
    return res


# ─── Estado de entrega (U16-entrega) ───────────────────────────────────────────────────────────────────────────────

def traducir_error_whatsapp(texto) -> str:
    """El motivo de un mensaje FALLIDO en palabras simples, segun el codigo de Meta al inicio de
    content_attributes.external_error. Sin codigo conocido: 'WhatsApp rechazó el mensaje (<texto recortado a 120>)'."""
    texto = _una_linea(texto)
    m = _CODIGO_AL_INICIO.match(texto)
    if m and m.group(1) in _ERRORES_WHATSAPP:
        return _ERRORES_WHATSAPP[m.group(1)]
    return f"WhatsApp rechazó el mensaje ({texto[:120] or 'sin detalle'})"


def _texto_de_envio(envio: EnvioAlCliente) -> str:
    if envio.estado == "FALLIDO":
        return f"El WhatsApp no le llegó al cliente: {traducir_error_whatsapp(envio.detalle)}."
    if envio.canal == CANAL and envio.estado == "NO_ENVIADO" and envio.motivo in MOTIVOS:
        return _texto_resultado(envio.motivo, None, None, envio.plantilla, envio.detalle)
    if envio.canal == CANAL and envio.estado in _TEXTOS_ESTADO:
        return _TEXTOS_ESTADO[envio.estado]
    return TEXTO_SIN_ESTADO


def _respuesta(envio: EnvioAlCliente, verificado: bool, texto=None) -> dict:
    return {"envio_id": envio.id, "estado": envio.estado, "texto": texto or _texto_de_envio(envio),
            "boton_manual": envio.estado in ("FALLIDO", "NO_ENVIADO"), "verificado": verificado}


def _avanza(actual: str, nuevo: str) -> bool:
    """El estado solo avanza (ENVIADO -> ENTREGADO -> LEIDO; FALLIDO desde cualquiera no final): cada uno se anota una
    sola vez y un 'sent' tardio no hace retroceder un ENTREGADO."""
    if actual in ESTADOS_FINALES or actual not in _ORDEN_ENTREGA:
        return False
    if nuevo == "FALLIDO":
        return True
    return _ORDEN_ENTREGA[nuevo] > _ORDEN_ENTREGA[actual]


def _renglon_de_entrega(envio: EnvioAlCliente, user_name) -> ActivityLog:
    """Renglon MENSAJE_CLIENTE en la Actividad del documento (R4), sin clave 'campo'."""
    numero = {"etiqueta": "Número", "despues": telefono_legible(envio.destino) or envio.destino}
    cambios = []
    if envio.estado == "ENTREGADO":
        cambios = [numero]
    elif envio.estado == "FALLIDO":
        cambios = [numero, {"etiqueta": "Motivo", "despues": traducir_error_whatsapp(envio.detalle)},
                   {"etiqueta": "Qué hacer", "despues": _QUE_HACER.get(envio.document_type, _QUE_HACER_POR_DEFECTO)}]
    return ActivityLog(
        entity_type=_ENTIDAD_ACTIVIDAD[envio.document_type], entity_id=envio.document_id,
        entity_numero=(envio.document_numero or "")[:30], action=ACCION_MENSAJE_CLIENTE,
        description=_DESCRIPCION_ENTREGA[envio.estado], user_name=autor_de_actividad(user_name) or "Sistema",
        extra_data={"whatsapp": {"envio_id": envio.id, "estado": envio.estado, "destino": envio.destino},
                    "cambios": cambios})


def verificar_envio(db: Session, envio: EnvioAlCliente, user_name) -> dict:
    """Pregunta a Chatwoot por el estado del mensaje y devuelve {envio_id, estado, texto, boton_manual, verificado}.

    - Sin consulta: un envio que no es de WhatsApp, sin ids de Chatwoot, que no salio o ya en estado final (LEIDO,
      FALLIDO) devuelve lo guardado (verificado True solo si el estado es final).
    - Chatwoot falla o el mensaje no aparece entre los recientes: nada cambia y verificado False.
    - Si el estado avanza: estado, detalle (el error de WhatsApp, sin el token) y updated_at de la fila, un renglon
      MENSAJE_CLIENTE en el documento y UN commit. La fila se relee con FOR UPDATE DESPUES de la consulta (que no
      espera a la red con el bloqueo tomado): dos verificaciones a la vez no duplican el renglon. Nunca toca el
      documento (C22: no reinicia el conteo de atraso). Tambien hace commit (vacio) si no cambio nada, para soltar el
      bloqueo: quien la llame lo hace sin cambios pendientes."""
    if (envio.canal != CANAL or not envio.chatwoot_conversation_id or not envio.chatwoot_message_id
            or envio.estado not in ("ENVIADO", "ENTREGADO")):
        return _respuesta(envio, verificado=envio.estado in ESTADOS_FINALES)
    try:
        lista = chatwoot.mensajes(envio.chatwoot_conversation_id, plazo=time.monotonic() + chatwoot.TIMEOUT_MAXIMO)
    except (ChatwootError, ChatwootNoConfigurado):
        return _respuesta(envio, False, TEXTO_NO_SE_PUDO_CONSULTAR)
    except Exception:
        logger.exception("Respuesta inesperada de Chatwoot al verificar el envio %s", envio.id)
        return _respuesta(envio, False, TEXTO_NO_SE_PUDO_CONSULTAR)
    mensaje = next((m for m in lista if isinstance(m, dict) and str(m.get("id")) == str(envio.chatwoot_message_id)),
                   None)
    if mensaje is None:
        return _respuesta(envio, False, TEXTO_NO_ENCONTRADO)
    nuevo = ESTADOS_CHATWOOT.get(str(mensaje.get("status") or "").strip().lower())
    if nuevo is None:
        return _respuesta(envio, False)
    fila = (db.query(EnvioAlCliente).filter(EnvioAlCliente.id == envio.id)
            .with_for_update().populate_existing().one())
    if _avanza(fila.estado, nuevo):
        fila.estado = nuevo
        fila.updated_at = datetime.utcnow()
        if nuevo == "FALLIDO":
            atributos = mensaje.get("content_attributes")
            externo = atributos.get("external_error") if isinstance(atributos, dict) else None
            fila.detalle = chatwoot.limpiar_detalle(externo) or None
        db.add(_renglon_de_entrega(fila, user_name))
    respuesta = _respuesta(fila, True)
    db.commit()
    return respuesta
