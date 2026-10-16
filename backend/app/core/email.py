"""
app/core/email.py -- Nebulae ERP
Envio de correo minimal, implementado con smtplib/email.mime (libreria
estandar, sin dependencias nuevas).

Disenado para que cambiar de proveedor de correo en el futuro sea trivial:
el resto del backend solo conoce send_email(to, subject, html_body, remitente_nombre=None) -> bool.
Hoy la implementacion habla SMTP generico (pensado para Gmail de prueba);
cambiar a un proveedor transaccional (SendGrid, SES, Postmark, etc.) en el
futuro solo requiere reescribir el cuerpo de esta funcion -- nadie que la
llama necesita cambiar.
"""
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr

logger = logging.getLogger(__name__)


def smtp_configurado() -> bool:
    """True si hay credenciales SMTP (SMTP_USER y SMTP_PASSWORD no vacios), o sea, si send_email puede intentar
    un envio. Quien lo llama lo usa para distinguir 'el correo no esta configurado' de 'el servidor fallo'
    antes de pedir el envio; send_email sigue comprobando lo mismo por su cuenta."""
    return bool(os.environ.get("SMTP_USER", "").strip() and os.environ.get("SMTP_PASSWORD", "").strip())


def send_email(to: str, subject: str, html_body: str, remitente_nombre: str | None = None) -> bool:
    """
    Envia un correo HTML a `to`. Devuelve True si el envio fue exitoso,
    False si fallo por cualquier razon (credenciales ausentes, host SMTP
    inalcanzable, etc.).

    remitente_nombre (Bloque 3, PLANTILLA): con un nombre, el From es
    formataddr((nombre, SMTP_FROM)) -- 'DEMO Ferreteria <ventas@...>' -- y el
    cliente ve el nombre de la empresa; sin nombre, solo la direccion, como
    antes. El sobre SMTP sigue siendo la direccion sola. Los saltos de linea
    del nombre se quitan (no se puede inyectar otro encabezado).

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

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    nombre = " ".join(str(remitente_nombre).split()) if remitente_nombre else ""
    # Con nombre, solo la direccion de SMTP_FROM: si ya trae uno ('Nebulae <x@y>') no se anidan los <> (r1, Q1).
    direccion = parseaddr(smtp_from)[1] or smtp_from
    message["From"] = formataddr((nombre, direccion)) if nombre else smtp_from
    message["To"] = to
    message.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_from, [to], message.as_string())
        return True
    except Exception:
        logger.exception("send_email: fallo el envio de correo a %s", to)
        return False
