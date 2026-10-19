"""Cliente minimo de la API de Chatwoot para el WhatsApp automatico (Bloque 3, T8: U16-envio, U16-entrega y R18).

Con urllib, como chat.py, sin dependencias nuevas. chat.py NO se toca: conserva su _send_to_chatwoot y su URL por
defecto; este modulo no tiene ninguna (unificarlos queda como tarea aparte, hueco 8f).

- config_chatwoot() lee os.environ EN CADA LLAMADA (las pruebas usan monkeypatch.setenv con valores ficticios):
  CHATWOOT_BASE_URL (sin valor por defecto; https://, o http:// solo para localhost), CHATWOOT_API_TOKEN y
  CHATWOOT_ACCOUNT_ID (entero, 1 por defecto, como chat.py). Si falta algo -> ChatwootNoConfigurado. Sus mensajes
  nunca llevan los valores.
- _peticion(metodo, ruta, cuerpo=None, params=None, timeout=6) es el UNICO punto que toca la red (las pruebas lo
  reemplazan). Manda el header api_access_token y no sigue redirecciones (urllib reenviaria el token a otro host).
  Una ruta que empieza por '/' es relativa a la base ('/api'); las demas, a /api/v1/accounts/{cuenta}/.
  HTTPError -> ChatwootError(status, cuerpo sin el token y recortado a 300); timeout -> ChatwootSinRespuesta; otro
  error de red -> ChatwootError(None, 'no se pudo conectar con Chatwoot'). Nunca registra el token, las cabeceras ni
  el texto de los mensajes.
- Las funciones de la API reciben `plazo` (un instante de time.monotonic): cada llamada usa timeout = min(6, lo que
  queda) y, si ya no queda nada, lanza ChatwootSinRespuesta sin llamar. Sin plazo, 6 s.

Formas de la API que asume (dependen de la version de Chatwoot; «Probar conexion» y el primer envio controlado de
T20 las verifican): contacts/search -> {payload: [contacto]}; un contacto trae contact_inboxes [{source_id, inbox:
{id}}]; POST contacts -> {payload: {contact, contact_inbox}}; conversaciones con can_reply e inbox_id; mensajes con
status y content_attributes.external_error.
"""
import http.client
import json
import logging
import os
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request

logger = logging.getLogger(__name__)

TIMEOUT_MAXIMO = 6
DETALLE_MAX = 300
_HOSTS_LOCALES = frozenset({"localhost", "127.0.0.1", "::1"})
_NO_DIGITO = re.compile(r"[^0-9]")


class ChatwootNoConfigurado(Exception):
    """Falta (o no sirve) la conexion con Chatwoot en las variables del servidor."""


class ChatwootError(Exception):
    """Chatwoot respondio con un error (status HTTP) o no se pudo hablar con el (status None). detalle no lleva el
    token."""

    def __init__(self, status, detalle):
        self.status = status
        self.detalle = limpiar_detalle(detalle)
        super().__init__(f"{status}: {self.detalle}" if status is not None else self.detalle)


class ChatwootSinRespuesta(ChatwootError):
    """Chatwoot no respondio a tiempo (o se agoto el plazo antes de llamar)."""

    def __init__(self, detalle="Chatwoot no respondió a tiempo"):
        super().__init__(None, detalle)


class _SinRedirecciones(urllib.request.HTTPRedirectHandler):
    """Una redireccion se vuelve HTTPError: urllib copiaria el header api_access_token a la URL nueva."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def abridor_sin_redirecciones() -> urllib.request.OpenerDirector:
    """El abridor de urllib de este modulo: el de siempre, pero sin seguir redirecciones (_SinRedirecciones)."""
    return urllib.request.build_opener(_SinRedirecciones)


# Las pruebas lo reemplazan (el runner de ROLLBACK y conftest lo cambian por uno que lanza RuntimeError).
_ABRIDOR = abridor_sin_redirecciones()
# Un token de Chatwoot es texto ASCII visible, sin espacios: con un caracter de control, http.client lanzaria un
# ValueError que repite el header (el token) y terminaria en el log (r1, S1).
_TOKEN_VALIDO = re.compile(r"[\x21-\x7e]+")


def config_chatwoot() -> dict:
    """{base_url, account_id, token} desde el entorno, leido en cada llamada. ChatwootNoConfigurado si falta la URL o
    el token, si el token tiene espacios o caracteres que no son ASCII visibles, si la URL no es https:// (http:// solo
    para localhost) o trae usuario y clave, o si la cuenta no es un entero positivo. Los mensajes no llevan valores."""
    base = (os.environ.get("CHATWOOT_BASE_URL") or "").strip().rstrip("/")
    token = (os.environ.get("CHATWOOT_API_TOKEN") or "").strip()
    if not base or not token:
        raise ChatwootNoConfigurado("Falta CHATWOOT_BASE_URL o CHATWOOT_API_TOKEN en las variables del servidor.")
    if not _TOKEN_VALIDO.fullmatch(token):
        raise ChatwootNoConfigurado("CHATWOOT_API_TOKEN tiene espacios o caracteres que no son válidos.")
    try:
        partes = urllib.parse.urlsplit(base)
        host = (partes.hostname or "").lower()
        con_credenciales = partes.username is not None or partes.password is not None
    except ValueError:
        raise ChatwootNoConfigurado("CHATWOOT_BASE_URL no es una dirección válida.") from None
    segura = partes.scheme == "https" or (partes.scheme == "http" and host in _HOSTS_LOCALES)
    if not host or not segura or con_credenciales or partes.query or partes.fragment:
        raise ChatwootNoConfigurado("CHATWOOT_BASE_URL debe ser una dirección https:// (http:// solo para localhost), "
                                    "sin usuario ni clave.")
    cuenta = (os.environ.get("CHATWOOT_ACCOUNT_ID") or "1").strip()
    if not (cuenta.isascii() and cuenta.isdigit()) or int(cuenta) <= 0:
        raise ChatwootNoConfigurado("CHATWOOT_ACCOUNT_ID debe ser un número entero.")
    return {"base_url": base, "account_id": int(cuenta), "token": token}


def configurado() -> bool:
    """True si config_chatwoot() no falla. Nunca devuelve ni registra los valores."""
    try:
        config_chatwoot()
        return True
    except ChatwootNoConfigurado:
        return False


def limpiar_detalle(texto) -> str:
    """El texto de un error listo para guardar o mostrar: sin el token de Chatwoot (si esta en el entorno), en una sola
    linea y recortado a DETALLE_MAX caracteres."""
    texto = " ".join(str(texto if texto is not None else "").split())
    token = (os.environ.get("CHATWOOT_API_TOKEN") or "").strip()
    if len(token) >= 4:
        texto = texto.replace(token, "[token]")
    return texto[:DETALLE_MAX]


def _timeout(plazo) -> float:
    """Segundos para la proxima llamada: min(6, lo que queda del plazo). Sin plazo, 6. Agotado -> ChatwootSinRespuesta."""
    if plazo is None:
        return TIMEOUT_MAXIMO
    restante = plazo - time.monotonic()
    if restante <= 0:
        raise ChatwootSinRespuesta("se agotó el plazo para hablar con Chatwoot")
    return min(TIMEOUT_MAXIMO, restante)


def _peticion(metodo: str, ruta: str, cuerpo=None, params=None, timeout=TIMEOUT_MAXIMO):
    """La UNICA llamada de red del modulo. Devuelve el JSON de la respuesta ({} si viene vacia)."""
    cfg = config_chatwoot()
    if ruta.startswith("/"):
        url = cfg["base_url"] + ruta
    else:
        url = f"{cfg['base_url']}/api/v1/accounts/{cfg['account_id']}/{ruta}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    pedido = urllib.request.Request(url, data=datos, method=metodo, headers={
        "api_access_token": cfg["token"], "Content-Type": "application/json", "Accept": "application/json"})
    try:
        with _ABRIDOR.open(pedido, timeout=timeout) as resp:
            texto = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            cuerpo_error = e.read().decode("utf-8", "replace")
        except Exception:
            cuerpo_error = ""
        logger.warning("Chatwoot respondio %s a %s %s", e.code, metodo, ruta)
        raise ChatwootError(e.code, cuerpo_error or e.reason) from None
    except (socket.timeout, TimeoutError):
        logger.warning("Chatwoot no respondio a tiempo (%s %s)", metodo, ruta)
        raise ChatwootSinRespuesta() from None
    except urllib.error.URLError as e:
        if isinstance(e.reason, (socket.timeout, TimeoutError)):
            logger.warning("Chatwoot no respondio a tiempo (%s %s)", metodo, ruta)
            raise ChatwootSinRespuesta() from None
        logger.warning("No se pudo conectar con Chatwoot (%s %s)", metodo, ruta)
        raise ChatwootError(None, "no se pudo conectar con Chatwoot") from None
    except (OSError, http.client.HTTPException):
        logger.warning("No se pudo conectar con Chatwoot (%s %s)", metodo, ruta)
        raise ChatwootError(None, "no se pudo conectar con Chatwoot") from None
    except ValueError:
        # http.client rechaza un header o una URL con caracteres invalidos repitiendo el valor (el token) en el mensaje:
        # nunca se propaga ni se registra el original (r1, S1).
        logger.warning("Configuracion de Chatwoot invalida (%s %s)", metodo, ruta)
        raise ChatwootError(None, "configuración de Chatwoot inválida") from None
    if not texto.strip():
        return {}
    try:
        return json.loads(texto)
    except ValueError:
        raise ChatwootError(None, "Chatwoot respondió algo que no es JSON") from None


# ─── Funciones de la API (rutas relativas a /api/v1/accounts/{cuenta}) ─────────────────────────────────────────────

def _lista(resp) -> list:
    """La lista de una respuesta de Chatwoot: {payload: [...]}, {data: [...]} o la lista misma."""
    if isinstance(resp, list):
        return resp
    if isinstance(resp, dict):
        for clave in ("payload", "data"):
            valor = resp.get(clave)
            if isinstance(valor, list):
                return valor
            if isinstance(valor, dict) and isinstance(valor.get("payload"), list):
                return valor["payload"]
    return []


def _digitos(texto) -> str:
    return _NO_DIGITO.sub("", "" if texto is None else str(texto))


def version_api(plazo=None):
    """La version de Chatwoot (GET {base}/api), o None si no la dice."""
    resp = _peticion("GET", "/api", timeout=_timeout(plazo))
    return resp.get("version") if isinstance(resp, dict) else None


def buscar_contacto(e164: str, plazo=None):
    """El primer contacto cuyo telefono tiene los mismos digitos que e164 (busca por los ultimos 10), o None."""
    digitos = _digitos(e164)
    resp = _peticion("GET", "contacts/search", params={"q": digitos[-10:]}, timeout=_timeout(plazo))
    for contacto in _lista(resp):
        if isinstance(contacto, dict) and _digitos(contacto.get("phone_number")) == digitos:
            return contacto
    return None


def _id_de_bandeja(contact_inbox: dict):
    bandeja = contact_inbox.get("inbox")
    return bandeja.get("id") if isinstance(bandeja, dict) else contact_inbox.get("inbox_id")


def source_id_en_bandeja(contacto: dict, inbox_id: int, e164: str, plazo=None) -> str:
    """El source_id del contacto en la bandeja: el de su contact_inbox de esa bandeja o, si no lo tiene, uno nuevo
    (POST contacts/{id}/contact_inboxes con los digitos del telefono)."""
    for ci in contacto.get("contact_inboxes") or []:
        if isinstance(ci, dict) and str(_id_de_bandeja(ci)) == str(inbox_id) and ci.get("source_id"):
            return ci["source_id"]
    digitos = _digitos(e164)
    resp = _peticion("POST", f"contacts/{contacto['id']}/contact_inboxes",
                     {"inbox_id": inbox_id, "source_id": digitos}, timeout=_timeout(plazo))
    return (resp.get("source_id") if isinstance(resp, dict) else None) or digitos


def crear_contacto(inbox_id: int, nombre: str, e164: str, email=None, plazo=None) -> tuple:
    """(contact_id, source_id) de un contacto nuevo en la bandeja. Ante un 422 de Chatwoot: si el telefono ya existe,
    se vuelve a buscar (y se toma o crea su lugar en la bandeja); si el correo ya existe, se reintenta una vez sin el
    correo."""
    cuerpo = {"inbox_id": inbox_id, "name": nombre, "phone_number": e164}
    if email:
        cuerpo["email"] = email
    try:
        resp = _peticion("POST", "contacts", cuerpo, timeout=_timeout(plazo))
    except ChatwootError as e:
        if e.status != 422:
            raise
        texto = e.detalle.lower()
        if "phone" in texto or "teléfono" in texto or "telefono" in texto:
            contacto = buscar_contacto(e164, plazo=plazo)
            if contacto is None:
                raise
            return contacto["id"], source_id_en_bandeja(contacto, inbox_id, e164, plazo=plazo)
        if "email" in cuerpo and ("email" in texto or "correo" in texto):
            sin_correo = {k: v for k, v in cuerpo.items() if k != "email"}
            resp = _peticion("POST", "contacts", sin_correo, timeout=_timeout(plazo))
        else:
            raise
    datos = resp.get("payload", resp) if isinstance(resp, dict) else {}
    contacto = datos.get("contact", datos) if isinstance(datos, dict) else {}
    contact_inbox = datos.get("contact_inbox") if isinstance(datos, dict) else None
    contact_id = contacto["id"]
    source_id = contact_inbox.get("source_id") if isinstance(contact_inbox, dict) else None
    if not source_id:
        source_id = source_id_en_bandeja({"id": contact_id}, inbox_id, e164, plazo=plazo)
    return contact_id, source_id


def _instante(valor) -> float:
    """last_activity_at como numero para comparar: viene como epoch (int) o como texto ISO segun la version."""
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        return float(valor)
    if isinstance(valor, str) and valor.strip():
        try:
            from datetime import datetime
            return datetime.fromisoformat(valor.strip().replace("Z", "+00:00")).timestamp()
        except ValueError:
            return 0.0
    return 0.0


def conversacion_reciente(contact_id, inbox_id: int, plazo=None):
    """La conversacion del contacto en la bandeja con la actividad mas reciente, o None."""
    resp = _peticion("GET", f"contacts/{contact_id}/conversations", timeout=_timeout(plazo))
    de_la_bandeja = [c for c in _lista(resp) if isinstance(c, dict) and str(c.get("inbox_id")) == str(inbox_id)]
    if not de_la_bandeja:
        return None
    return max(de_la_bandeja, key=lambda c: _instante(c.get("last_activity_at")))


def enviar_mensaje(conv_id, contenido: str, template_params=None, plazo=None) -> dict:
    """Mensaje saliente en una conversacion existente (texto libre o, con template_params, la plantilla de Meta)."""
    cuerpo = {"content": contenido, "message_type": "outgoing", "private": False}
    if template_params is not None:
        cuerpo["template_params"] = template_params
    resp = _peticion("POST", f"conversations/{conv_id}/messages", cuerpo, timeout=_timeout(plazo))
    return resp if isinstance(resp, dict) else {}


def crear_conversacion(inbox_id: int, contact_id, source_id, contenido: str, template_params, plazo=None) -> tuple:
    """(conv_id, message_id | None) de una conversacion nueva que arranca con el mensaje (la plantilla). conv_id es None
    si la respuesta no lo trae: quien llama lo trata como «puede que haya salido» (r1, R3)."""
    resp = _peticion("POST", "conversations", {
        "source_id": source_id, "inbox_id": inbox_id, "contact_id": contact_id, "status": "open",
        "message": {"content": contenido, "template_params": template_params}}, timeout=_timeout(plazo))
    resp = resp if isinstance(resp, dict) else {}
    mensajes_creados = resp.get("messages") if isinstance(resp.get("messages"), list) else []
    mensaje_id = None
    if mensajes_creados and isinstance(mensajes_creados[-1], dict):
        mensaje_id = mensajes_creados[-1].get("id")
    return resp.get("id"), mensaje_id


def mensajes(conv_id, plazo=None) -> list:
    """Los mensajes (recientes) de una conversacion."""
    return _lista(_peticion("GET", f"conversations/{conv_id}/messages", timeout=_timeout(plazo)))


def bandeja(inbox_id: int, plazo=None) -> dict:
    """La bandeja (inbox): name, channel_type y, en WhatsApp, message_templates con su estado."""
    resp = _peticion("GET", f"inboxes/{inbox_id}", timeout=_timeout(plazo))
    return resp if isinstance(resp, dict) else {}
