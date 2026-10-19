"""
app/core/email.py -- Nebulae ERP
Envio de correo minimal, implementado con smtplib/email.mime (libreria
estandar, sin dependencias nuevas).

Disenado para que cambiar de proveedor de correo en el futuro sea trivial:
el resto del backend solo conoce send_email(to, subject, html_body, remitente_nombre=None, adjuntos=None) -> bool.
Hoy la implementacion habla SMTP generico (pensado para Gmail de prueba);
cambiar a un proveedor transaccional (SendGrid, SES, Postmark, etc.) en el
futuro solo requiere reescribir el cuerpo de esta funcion -- nadie que la
llama necesita cambiar.
"""
import logging
import os
import re
import smtplib
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr

logger = logging.getLogger(__name__)

# B3 T9: el tipo de un adjunto ('application/pdf') y lo que no puede ir en su nombre de archivo: caracteres de control
# (un salto de linea inyectaria otro encabezado), separadores de ruta y comillas.
_MIME_ADJUNTO = re.compile(r"[a-z0-9][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*")
_NOMBRE_ADJUNTO_PROHIBIDO = re.compile(r'[\x00-\x1f\x7f/\\"]+')


def _parte_adjunta(nombre, contenido, mime) -> MIMEBase:
    """Una parte 'attachment' en base64 para un adjunto (nombre, bytes, mime). ValueError o TypeError si no es un
    adjunto valido (el mime no es tipo/subtipo o el contenido no son bytes): send_email lo atrapa y devuelve False.
    El nombre queda en una sola linea y sin rutas ('../COT\\r\\nBcc: x.pdf' -> '.._COT_Bcc: x.pdf')."""
    mime = str(mime).strip().lower()
    if not _MIME_ADJUNTO.fullmatch(mime):
        raise ValueError(f"Tipo de adjunto no valido: {mime!r}")
    if not isinstance(contenido, (bytes, bytearray)):
        raise TypeError("El contenido de un adjunto debe ser bytes")
    tipo, subtipo = mime.split("/", 1)
    parte = MIMEBase(tipo, subtipo)
    parte.set_payload(bytes(contenido))
    encoders.encode_base64(parte)
    nombre = _NOMBRE_ADJUNTO_PROHIBIDO.sub("_", str(nombre)).strip() or "adjunto"
    parte.add_header("Content-Disposition", "attachment", filename=nombre)
    return parte


def smtp_configurado() -> bool:
    """True si hay credenciales SMTP (SMTP_USER y SMTP_PASSWORD no vacios), o sea, si send_email puede intentar
    un envio. Quien lo llama lo usa para distinguir 'el correo no esta configurado' de 'el servidor fallo'
    antes de pedir el envio; send_email sigue comprobando lo mismo por su cuenta."""
    return bool(os.environ.get("SMTP_USER", "").strip() and os.environ.get("SMTP_PASSWORD", "").strip())


def send_email(to: str, subject: str, html_body: str, remitente_nombre: str | None = None,
               adjuntos: list | None = None) -> bool:
    """
    Envia un correo HTML a `to`. Devuelve True si el envio fue exitoso,
    False si fallo por cualquier razon (credenciales ausentes, host SMTP
    inalcanzable, etc.).

    remitente_nombre (Bloque 3, PLANTILLA): con un nombre, el From es
    formataddr((nombre, direccion de SMTP_FROM)) -- 'DEMO Ferreteria <ventas@...>' --
    y el cliente ve el nombre de la empresa; si SMTP_FROM ya trae un nombre
    ('Nebulae <ventas@...>'), se usa solo su direccion. Sin nombre, el From es
    SMTP_FROM tal cual, como antes. El sobre SMTP (sendmail) lleva siempre la
    direccion sola. Los saltos de linea del nombre se quitan (no se puede
    inyectar otro encabezado).

    adjuntos (Bloque 3, T9: el PDF de la cotizacion y del pedido): lista de
    (nombre, bytes, mime). Con adjuntos el mensaje es multipart/mixed con la
    parte multipart/alternative (el html) adentro y una parte 'attachment' en
    base64 por adjunto (_parte_adjunta). Sin adjuntos (None o []) el mensaje es
    el mismo de siempre. Un adjunto mal formado no se manda a medias: se loguea
    y devuelve False sin abrir la conexion.

    Nunca lanza excepciones -- cualquier error se loguea (logging, nunca
    print) y se traduce en un simple `return False`. Esto es intencional:
    endpoints anti-enumeracion como /auth/forgot-password deben responder
    siempre el mismo mensaje genérico sin importar si el correo realmente
    se pudo entregar.
    """
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com").strip()
    smtp_port_raw = os.environ.get("SMTP_PORT", "587").strip()
    smtp_user = os.environ.get("SMTP_USER", "").strip()
    smtp_password = os.environ.get("SMTP_PASSWORD", "").strip()
    smtp_from = os.environ.get("SMTP_FROM", "").strip() or smtp_user

    if not smtp_user or not smtp_password:
        logger.error(
            "send_email: SMTP_USER/SMTP_PASSWORD no configurados -- correo a %s no enviado (asunto: %r)",
            to, subject,
        )
        return False

    try:
        smtp_port = int(smtp_port_raw)
    except ValueError:
        logger.error("send_email: SMTP_PORT invalido (%r) -- correo no enviado", smtp_port_raw)
        return False

    cuerpo = MIMEMultipart("alternative")
    cuerpo.attach(MIMEText(html_body, "html"))
    message = cuerpo
    if adjuntos:
        try:
            partes = [_parte_adjunta(*adjunto) for adjunto in adjuntos]
        except Exception:
            logger.exception("send_email: un adjunto no es valido -- correo a %s no enviado", to)
            return False
        message = MIMEMultipart("mixed")
        message.attach(cuerpo)
        for parte in partes:
            message.attach(parte)
    message["Subject"] = subject
    nombre = " ".join(str(remitente_nombre).split()) if remitente_nombre else ""
    # La direccion sola de SMTP_FROM: con nombre comercial no se anidan los <> (r1, Q1) y es el remitente del sobre (r2).
    direccion = parseaddr(smtp_from)[1] or smtp_from
    message["From"] = formataddr((nombre, direccion)) if nombre else smtp_from
    message["To"] = to

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(direccion, [to], message.as_string())
        return True
    except Exception:
        logger.exception("send_email: fallo el envio de correo a %s", to)
        return False
