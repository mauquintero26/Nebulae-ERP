"""Bloque 3, Tarea 2 — PLANTILLA: correos al cliente con la marca de la empresa (core/correo_documento.py y
core/email.py; C17, C21, RP12 y RP28).

- correo_documento(perfil, tipo, numero, cliente, link, resumen=None, proposito='CONFIRMACION', vence=None) es el ÚNICO
  constructor de correos al cliente: asunto sin saltos de línea, todo valor escapado, franja con el color de la empresa.
  Propósitos (RP28): CONFIRMACION ('Cotización COT-… de <Empresa>' o 'Tu cotización COT-…'), CONSULTA ('Confirmación de
  tu pedido PVEN-…') y SEGUIMIENTO ('Recordatorio: confirma tu solicitud|cotización …'), más el renglón de `vence`.
- send_email(to, subject, html_body, remitente_nombre=None): con nombre, From = formataddr((nombre, dirección de
  SMTP_FROM)); sin nombre, SMTP_FROM tal cual. El sobre SMTP siempre lleva la dirección sola.
- enviar-confirmacion de la SC y la COT arma el correo con correo_documento(perfil_publico(db), …) y manda
  remitente_nombre (capa PLANTILLA de C21); el asunto ya no dice 'Nebulae'.
Nunca se usa SMTP real: send_email falso, smtp_configurado falso o smtplib.SMTP falso con variables ficticias (R18).

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_correo_documento
"""
import email
import logging
import uuid
from datetime import date
from email.header import decode_header, make_header
from email.utils import parseaddr

from sqlalchemy import text

PERFIL = {"nombre_comercial": "DEMO Ferretería", "razon_social": "Demo S.A.S.", "nit": "900.123.456-7",
          "direccion": "Calle 1 # 2-3", "ciudad": "Bogotá", "telefono": "601 234 5678", "whatsapp": "300 123 4567",
          "correo": "ventas@example.com", "sitio_web": "https://example.com",
          "colores": {"principal": "#7C3AED", "secundario": "#E11D48", "acento": "#C2410C"},
          "logo_url": None, "configurada": True}
LINK = "https://app.example.com/confirmar/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _perfil(**cambios):
    p = dict(PERFIL)
    p.update(cambios)
    return p


def _limpiar_empresa(db):
    db.execute(text("DELETE FROM admin_config WHERE key LIKE :a OR key LIKE :b"),
               {"a": "empresa\\_%", "b": "documentos\\_%"})
    db.commit()


def _correo_falso(monkeypatch):
    llamadas = []

    def fake_send_email(to, subject, html_body, **kwargs):
        llamadas.append({"to": to, "subject": subject, "html_body": html_body, **kwargs})
        return True

    monkeypatch.setattr("app.core.email.send_email", fake_send_email)
    monkeypatch.setattr("app.core.email.smtp_configurado", lambda: True)
    return llamadas


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


# ─── 6: escape y asunto limpio ──────────────────────────────────────────────────────────────────────────────

def test_correo_documento_escapa_y_limpia():
    from app.core.correo_documento import correo_documento
    perfil = _perfil(nombre_comercial="A&B <script>\nX", direccion="<b>Calle</b>",
                     colores={"principal": "red;", "secundario": "#E11D48", "acento": "x\" onload=\"y"})
    asunto, html = correo_documento(perfil, "COT", "COT-1", "Ana <img src=x>", LINK + '"><script>')
    assert "A&amp;B &lt;script&gt;" in html
    assert "<script>" not in html and "<img src=x>" not in html and "<b>Calle</b>" not in html
    assert "Ana &lt;img src=x&gt;" in html
    assert '"><script>' not in html  # el link también se escapa (href y texto)
    assert "\n" not in asunto and "\r" not in asunto
    assert asunto == "Cotización COT-1 de A&B <script> X"
    assert "red;" not in html and "onload" not in html  # un color que no es #RRGGBB no entra al style
    assert "#C2410C" in html  # la COT usa el acento; el inválido vuelve al de la referencia

    asunto, html = correo_documento(_perfil(nombre_comercial=""), "COT", "COT-1", "Ana", LINK)
    assert asunto == "Tu cotización COT-1"
    assert "Nebulae" not in html
    asunto, _ = correo_documento(_perfil(nombre_comercial="   "), "SC", "SC-1", "Ana", LINK)
    assert asunto == "Tu solicitud SC-1"

    # r1 (S3): el único constructor de correos al cliente solo acepta enlaces http(s) (sin distinguir mayúsculas).
    for malo in ("javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x", "//evil.example.com/x",
                 "ftp://example.com/x", "app.example.com/confirmar/x", "", None, 123):
        try:
            correo_documento(PERFIL, "COT", "COT-1", "Ana", malo)
        except ValueError:
            pass
        else:
            raise AssertionError(f"correo_documento aceptó el enlace {malo!r}")
    _, html = correo_documento(PERFIL, "COT", "COT-1", "Ana", "HTTPS://APP.EXAMPLE.COM/confirmar/x")
    assert "HTTPS://APP.EXAMPLE.COM/confirmar/x" in html


def test_correo_documento_lleva_marca_boton_y_contacto():
    from app.core.correo_documento import correo_documento
    asunto, html = correo_documento(PERFIL, "SC", "SC-20260001", "Ana Pérez", LINK)
    assert asunto == "Solicitud SC-20260001 de DEMO Ferretería"
    assert "Hola Ana Pérez" in html
    assert f'href="{LINK}"' in html and html.count(LINK) >= 2  # botón y enlace escrito debajo
    assert ">Ver solicitud</a>" in html  # r1 (L1): «Ver {título}» en minúsculas, como el asunto
    assert "#7C3AED" in html  # la SC usa el color principal en la franja
    for dato in ("601 234 5678", "300 123 4567", "ventas@example.com", "Calle 1 # 2-3", "900.123.456-7"):
        assert dato in html, dato
    assert "<img" not in html  # sin logo: los correos bloquean imágenes
    assert "width=\"600\"" in html or "max-width:600px" in html

    _, html = correo_documento(PERFIL, "COT", "COT-1", "", LINK)
    assert "Hola," in html and ">Ver cotización</a>" in html and "#C2410C" in html


def test_color_texto_sobre_es_la_regla_wcag_del_frontend():
    from app.core.correo_documento import color_texto_sobre
    assert color_texto_sobre("#C2410C") == "#FFFFFF"
    assert color_texto_sobre("#FDE68A") == "#111827"
    assert color_texto_sobre("#7C3AED", "#E11D48") == "#FFFFFF"
    assert color_texto_sobre("#FFFFFF") == "#111827"
    assert color_texto_sobre("#000000") == "#FFFFFF"


# ─── RP28: los tres propósitos y el renglón de vence ────────────────────────────────────────────────────────

def test_propositos_del_correo():
    from app.core.correo_documento import correo_documento
    link_pedido = "https://app.example.com/pedido/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"

    # CONSULTA (el pedido, U23): asunto propio, resumen de pagos con pesos(), el enlace y el contacto.
    resumen = {"total": 1000000, "pagado": 600000, "saldo": 400000}
    asunto, html = correo_documento(_perfil(nombre_comercial=""), "PVEN", "PVEN-1", "Ana", link_pedido,
                                    resumen=resumen, proposito="CONSULTA", vence=date(2026, 11, 15))
    assert asunto == "Confirmación de tu pedido PVEN-1"
    asunto, html = correo_documento(PERFIL, "PVEN", "PVEN-1", "Ana", link_pedido, resumen=resumen,
                                    proposito="CONSULTA", vence="2026-11-15")
    assert asunto == "Confirmación de tu pedido PVEN-1 de DEMO Ferretería"
    for texto in ("Total", "$1.000.000", "Pagado", "$600.000", "Saldo", "$400.000", ">Ver pedido de venta</a>",
                  "lo que has pagado y lo que te falta"):
        assert texto in html, texto
    assert "15 de noviembre de 2026" in html and "disponible hasta el" in html
    assert "#C2410C" in html  # el pedido usa el acento

    # SEGUIMIENTO (el recordatorio, U16-seguimiento): asunto exacto del plan, sin el nombre de la empresa.
    asunto, html = correo_documento(PERFIL, "SC", "SC-1", "Ana", LINK, proposito="SEGUIMIENTO")
    assert asunto == "Recordatorio: confirma tu solicitud SC-1"
    assert "te recordamos" in html.lower() and "DEMO Ferretería" in html
    asunto, html = correo_documento(PERFIL, "COT", "COT-1", "Ana", LINK, proposito="SEGUIMIENTO",
                                    vence=date(2026, 10, 8))
    assert asunto == "Recordatorio: confirma tu cotización COT-1"
    assert "válida hasta el 8 de octubre de 2026" in html

    # CONFIRMACION de la COT con vence (U22-validez): «Esta cotización es válida hasta el …».
    _, html = correo_documento(PERFIL, "COT", "COT-1", "Ana", LINK, vence=date(2026, 10, 8))
    assert "Esta cotización es válida hasta el 8 de octubre de 2026." in html
    _, html = correo_documento(PERFIL, "COT", "COT-1", "Ana", LINK)
    assert "hasta el" not in html  # sin vence no hay renglón

    # r1 (Q8d): también las dos combinaciones que no aplican: CONSULTA solo es del pedido y el pedido no tiene
    # recordatorio.
    for malo in ({"proposito": "OTRO"}, {"tipo": "PXP"}, {"tipo": "SC", "proposito": "CONSULTA"},
                 {"tipo": "COT", "proposito": "CONSULTA"}, {"tipo": "PVEN", "proposito": "SEGUIMIENTO"}):
        args = {"tipo": "COT", "proposito": "CONFIRMACION", **malo}
        try:
            correo_documento(PERFIL, args["tipo"], "X-1", "Ana", LINK, proposito=args["proposito"])
        except ValueError:
            pass
        else:
            raise AssertionError(f"correo_documento aceptó {malo}")


# ─── 7: el envío de la COT y de la SC usa la marca ──────────────────────────────────────────────────────────

def test_envio_cot_usa_la_marca(app_client, db, admin_token, monkeypatch):
    from app.models.erp_documents import SalesQuotation
    _limpiar_empresa(db)
    llamadas = _correo_falso(monkeypatch)
    resp = app_client.put("/api/v1/empresa", json={"nombre_comercial": "DEMO Ferretería"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    cot = SalesQuotation(numero=f"COT-B3T2{_sufijo()}", customer_name="Cliente Prueba", estado="BORRADOR",
                         customer_email="cliente@example.com", total_cop=1000,
                         productos=[{"product_name": "Cuna", "qty": 1}])
    db.add(cot); db.commit(); db.refresh(cot)

    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={"canal": "Email"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert len(llamadas) == 1
    llamada = llamadas[0]
    assert llamada["subject"] == f"Cotización {cot.numero} de DEMO Ferretería"
    assert "Nebulae" not in llamada["subject"] and "Nebulae" not in llamada["html_body"]
    assert llamada["remitente_nombre"] == "DEMO Ferretería"
    link = resp.json()["link_confirmacion"]
    assert link in llamada["html_body"] and "/confirmar/" in link
    assert "Hola Cliente Prueba" in llamada["html_body"]


def test_envio_sc_usa_la_marca_y_sin_marca_no_inventa_remitente(app_client, db, admin_token, user_admin, monkeypatch):
    from app.models.erp_documents import CustomerRequest
    _limpiar_empresa(db)
    llamadas = _correo_falso(monkeypatch)
    sc = CustomerRequest(numero=f"SC-B3T2{_sufijo()}", customer_name="Cliente Prueba", estado="ASIGNADA",
                         advisor_user_id=user_admin.id, advisor_name=user_admin.email,
                         customer_email="cliente@example.com", productos=[{"product_name": "Cuna", "qty": 1}])
    db.add(sc); db.commit(); db.refresh(sc)

    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"canal": "Otro"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    llamada = llamadas[-1]
    assert llamada["subject"] == f"Tu solicitud {sc.numero}"  # sin marca: ni 'Nebulae' ni datos de ejemplo
    assert llamada["remitente_nombre"] is None
    assert "Nebulae" not in llamada["html_body"]
    assert resp.json()["link_confirmacion"] in llamada["html_body"]

    assert app_client.put("/api/v1/empresa", json={"nombre_comercial": "DEMO Ferretería"},
                          headers=auth(admin_token)).status_code == 200
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"canal": "Otro"},
                           headers=auth(admin_token))  # reenvío (PENDIENTE_CONFIRMACION)
    assert resp.status_code == 200, resp.text
    llamada = llamadas[-1]
    assert llamada["subject"] == f"Solicitud {sc.numero} de DEMO Ferretería"
    assert llamada["remitente_nombre"] == "DEMO Ferretería"
    assert resp.json()["link_confirmacion"].split("/confirmar/", 1)[1]  # enlace_publico: /confirmar/{token}


# ─── 8: send_email con remitente con nombre ─────────────────────────────────────────────────────────────────

def test_send_email_remitente_con_nombre(monkeypatch):
    import smtplib
    from app.core import email as correo
    capturas = []

    class SMTPFalso:
        def __init__(self, host, port, timeout=None):
            capturas.append({"host": host, "port": port})

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self):
            pass

        def login(self, usuario, clave):
            pass

        def sendmail(self, remitente, destinos, mensaje):
            capturas[-1].update({"remitente": remitente, "destinos": destinos, "mensaje": mensaje})

    monkeypatch.setattr(smtplib, "SMTP", SMTPFalso)
    monkeypatch.setenv("SMTP_HOST", "smtp.invalid")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USER", "usuario-de-prueba")
    monkeypatch.setenv("SMTP_PASSWORD", "clave-de-prueba")
    monkeypatch.setenv("SMTP_FROM", "ventas@example.com")

    assert correo.send_email("cliente@example.com", "Asunto", "<p>Hola</p>", remitente_nombre="DEMO Ferretería")
    msg = email.message_from_string(capturas[-1]["mensaje"])
    assert parseaddr(str(make_header(decode_header(msg["From"])))) == ("DEMO Ferretería", "ventas@example.com")
    assert capturas[-1]["remitente"] == "ventas@example.com"  # el sobre sigue siendo la dirección sola
    assert capturas[-1]["destinos"] == ["cliente@example.com"]

    assert correo.send_email("cliente@example.com", "Asunto", "<p>Hola</p>")  # sin nombre: igual que antes
    assert email.message_from_string(capturas[-1]["mensaje"])["From"] == "ventas@example.com"

    # r1 (Q1): un SMTP_FROM que ya trae nombre no anida los <>: el From usa solo su dirección.
    monkeypatch.setenv("SMTP_FROM", "Nebulae <ventas@example.com>")
    assert correo.send_email("cliente@example.com", "Asunto", "<p>Hola</p>", remitente_nombre="DEMO Ferretería")
    msg = email.message_from_string(capturas[-1]["mensaje"])
    assert parseaddr(str(make_header(decode_header(msg["From"])))) == ("DEMO Ferretería", "ventas@example.com")
    assert capturas[-1]["remitente"] == "ventas@example.com"  # r2: el sobre, con la dirección sola
    assert correo.send_email("cliente@example.com", "Asunto", "<p>Hola</p>")  # sin nombre comercial: como antes
    assert email.message_from_string(capturas[-1]["mensaje"])["From"] == "Nebulae <ventas@example.com>"
    assert capturas[-1]["remitente"] == "ventas@example.com"
    monkeypatch.setenv("SMTP_FROM", "ventas@example.com")

    # Un nombre con salto de línea no inyecta encabezados.
    assert correo.send_email("cliente@example.com", "Asunto", "<p>Hola</p>", remitente_nombre="Malo\r\nBcc: x@y.z")
    msg = email.message_from_string(capturas[-1]["mensaje"])
    assert msg["Bcc"] is None
    assert parseaddr(str(make_header(decode_header(msg["From"]))))[1] == "ventas@example.com"


# ─── r1 (Q3): el correo se arma antes de confirmar el envío ─────────────────────────────────────────────────

def test_si_el_correo_no_se_puede_armar_no_queda_un_envio_a_medias(app_client, db, admin_token, user_admin,
                                                                   monkeypatch):
    """r1 (Q3) y r2: (asunto, html) se arma ANTES del único commit del envío, y la revocación y el token nuevo van en ese
    mismo commit (commit=False, la parte de RP16 que no necesita bloqueo). Si correo_documento lanza ValueError (por
    ejemplo, un FRONTEND_URL sin http(s)), se revierte TODO y el asesor recibe un 500 con un mensaje claro, sin el
    enlace ni el token: el documento no cambia de estado, no hay renglón de Actividad, no hay token nuevo, el enlace
    que el cliente ya tenía sigue vigente y no sale ningún correo."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.confirmation import DocumentConfirmationToken
    from app.models.erp_documents import ActivityLog, CustomerRequest, SalesQuotation
    from sqlalchemy import and_, or_
    _limpiar_empresa(db)
    llamadas = _correo_falso(monkeypatch)

    def no_se_puede(*args, **kwargs):
        raise ValueError("correo de prueba que no se puede armar")

    monkeypatch.setattr("app.api.v1.erp_ventas.correo_documento", no_se_puede)
    monkeypatch.setattr(logging.getLogger("app.api.v1.erp_ventas"), "disabled", True)  # el error queda en el log
    sc = CustomerRequest(numero=f"SC-B3T2{_sufijo()}", customer_name="Cliente Prueba", estado="ASIGNADA",
                         advisor_user_id=user_admin.id, advisor_name=user_admin.email,
                         customer_email="cliente@example.com", productos=[{"product_name": "Cuna", "qty": 1}])
    cot = SalesQuotation(numero=f"COT-B3T2{_sufijo()}", customer_name="Cliente Prueba", estado="BORRADOR",
                         customer_email="cliente@example.com", total_cop=1000, canal_envio=None,
                         productos=[{"product_name": "Cuna", "qty": 1}])
    db.add_all([sc, cot]); db.commit(); db.refresh(sc); db.refresh(cot)
    # Un enlace vigente que cada documento ya tenía (de un ciclo anterior): el envío fallido no debe revocarlo.
    create_confirmation_token(db, "SC", sc.id)
    create_confirmation_token(db, "COT", cot.id)

    def tokens(tipo, doc_id):
        db.expire_all()
        return (db.query(DocumentConfirmationToken)
                .filter(DocumentConfirmationToken.document_type == tipo, DocumentConfirmationToken.document_id == doc_id)
                .all())

    antes = {("SC", sc.id): [t.id for t in tokens("SC", sc.id)], ("COT", cot.id): [t.id for t in tokens("COT", cot.id)]}
    mensaje = "No se pudo armar el correo al cliente: revisa la dirección pública del ERP (FRONTEND_URL)."
    for ruta in (f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion",
                 f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion"):
        resp = app_client.post(ruta, json={"canal": "Email"}, headers=auth(admin_token))
        assert resp.status_code == 500, resp.text
        assert resp.json()["detail"] == mensaje
        assert "/confirmar/" not in resp.text

    db.expire_all()
    assert db.get(CustomerRequest, sc.id).estado == "ASIGNADA"
    cot_despues = db.get(SalesQuotation, cot.id)
    assert cot_despues.estado == "BORRADOR" and cot_despues.canal_envio is None
    # r2: por par (tipo, id): una SC vieja con el id de esta COT (o al revés) no cuenta.
    assert db.query(ActivityLog).filter(
        or_(and_(ActivityLog.entity_type == "SC", ActivityLog.entity_id == sc.id),
            and_(ActivityLog.entity_type == "COT", ActivityLog.entity_id == cot.id)),
        ActivityLog.action == "ESTADO_CHANGED").count() == 0
    for (tipo, doc_id), ids in antes.items():
        actuales = tokens(tipo, doc_id)
        assert [t.id for t in actuales] == ids, (tipo, "token nuevo")
        assert all(t.used_at is None and t.resultado is None for t in actuales), (tipo, "se revocó el enlace vigente")
    assert llamadas == []
