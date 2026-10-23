"""Bloque 3, Tarea 8 — U16-envio (WhatsApp automatico por Chatwoot) y U16-entrega (estado de entrega).

- core/chatwoot.py: cliente minimo; _peticion es el UNICO punto de red y aqui SIEMPRE se reemplaza: con FakeChatwoot
  (monkeypatch de app.core.chatwoot._peticion) o, para probar _peticion misma, con un abridor falso (_ABRIDOR). Nunca
  sale una peticion real a Chatwoot ni a Meta.
- core/envio_whatsapp.py: enviar_documento (una sola funcion de envio, C15/R20), dos plantillas de Meta, registro
  envios_al_cliente, verificar_envio (R4, C22) y traducir_error_whatsapp.
- erp_ventas: _canal_de_envio con e164_whatsapp (RP19: 400 antes de tocar enlaces), el WhatsApp despues del commit unico
  (C21, RP16) en la SC, la COT y el PVEN, los renglones 'WhatsApp' y 'Mensaje' (C16, RP31) y telefono_whatsapp en los
  dicts (C27, RP20).
- api/v1/envio_cliente.py: estado, configuracion (422 en espanol, R12), «Probar conexion» (hueco 0) y verificar.

Credenciales: solo valores ficticios con monkeypatch.setenv (R18). El correo siempre es un falso (send_email y
smtp_configurado parcheados). admin_config se escribe dentro de la transaccion revertida.
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_envio_whatsapp_chatwoot
"""
import copy
import datetime
import json
import uuid

from tests.usuarios_de_prueba import bodega_token, compras_token  # noqa: F401  (fixtures)

URL_FICTICIA = "https://chatwoot.invalid"
TOKEN_FICTICIO = "token-de-prueba"
TELEFONO = "3001234567"
E164 = "+573001234567"
LEGIBLE = "+57 300 123 4567"
CORREO = "cliente@test.com"
EMPRESA = "Casa Prueba"
LINEA = {"product_name": "Cuna Colecho", "qty": 1}
SIN_TELEFONO = ("El cliente no tiene un teléfono de WhatsApp válido: elige Email u Otro, o corrige su teléfono antes "
                "de enviar.")
RESERVADA = "El número de WhatsApp de la empresa y el envío automático se cambian en Envío automático por WhatsApp."
SIN_CONFIRMAR = ("Chatwoot no confirmó el envío: puede que el mensaje haya salido. Revisa la conversación en Chatwoot "
                 "antes de reenviarlo.")
ETIQUETAS_SC = ["Canal de envío", "WhatsApp", "Mensaje", "Correo de respaldo"]
ETIQUETAS_COT_PVEN = ETIQUETAS_SC + ["Enlace vigente hasta"]
# B3 T11 (C16, cierre): el envío de una SC o una COT termina en 'Recordatorio automático' (U16-seguimiento); el PVEN no
# tiene seguimiento.
RECORDATORIO = ["Recordatorio automático"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


# ─── Dobles ────────────────────────────────────────────────────────────────────────────────────────────────────────

class FakeChatwoot:
    """Reemplaza app.core.chatwoot._peticion: anota (metodo, ruta, cuerpo, params) y el timeout de cada llamada y
    responde por (metodo, ruta). Una respuesta puede ser una excepcion (se lanza), una funcion (recibe metodo, ruta,
    cuerpo y params; lo que devuelve es la respuesta y lo que lanza se lanza) o un valor (se entrega una copia)."""

    def __init__(self, respuestas=None):
        self.respuestas = dict(respuestas or {})
        self.llamadas = []
        self.timeouts = []

    def __call__(self, metodo, ruta, cuerpo=None, params=None, timeout=6):
        self.llamadas.append((metodo, ruta, copy.deepcopy(cuerpo), copy.deepcopy(params)))
        self.timeouts.append(timeout)
        clave = (metodo, ruta)
        if clave not in self.respuestas:
            raise AssertionError(f"llamada inesperada a Chatwoot: {metodo} {ruta}")
        r = self.respuestas[clave]
        if isinstance(r, BaseException):
            raise r
        if callable(r):
            return r(metodo, ruta, copy.deepcopy(cuerpo), copy.deepcopy(params))
        return copy.deepcopy(r)

    def rutas(self):
        return [(m, r) for m, r, _, _ in self.llamadas]

    def cuerpo(self, metodo, ruta):
        [c] = [c for m, r, c, _ in self.llamadas if (m, r) == (metodo, ruta)]
        return c


def _contacto(contact_id=7):
    return {"id": contact_id, "name": "Cliente Prueba", "phone_number": E164,
            "contact_inboxes": [{"source_id": "573001234567", "inbox": {"id": 3}}]}


def _en_ventana(can_reply=True, mensaje_id=901):
    """Contacto 7 con la conversacion 55 en la bandeja 3 (y otra mas nueva en otra bandeja, que no cuenta)."""
    conv = {"id": 55, "inbox_id": 3, "last_activity_at": 1700000000}
    if can_reply is not None:
        conv["can_reply"] = can_reply
    return {("GET", "contacts/search"): {"payload": [_contacto()]},
            ("GET", "contacts/7/conversations"): {"payload": [
                {"id": 44, "inbox_id": 9, "can_reply": True, "last_activity_at": 1800000000}, conv]},
            ("POST", "conversations/55/messages"): {"id": mensaje_id}}


def _correo_falso(monkeypatch):
    import app.core.email as correo
    llamadas = []

    def enviar(to, subject, html_body, **kwargs):
        llamadas.append({"to": to, "subject": subject, "html_body": html_body})
        return True

    monkeypatch.setattr(correo, "send_email", enviar)
    monkeypatch.setattr(correo, "smtp_configurado", lambda: True)
    return llamadas


def _config(db, automatico="true", inbox="3", plantilla=None, plantilla_recordatorio=None, idioma=None,
            empresa=EMPRESA):
    """Escribe la configuracion del WhatsApp (y el nombre de la empresa) dentro de la transaccion revertida. None borra
    la clave (vuelve a su valor por defecto)."""
    from app.core.admin_config import guardar_config
    from app.core.empresa import CAMPOS
    guardar_config(db, {"envio_whatsapp_automatico": automatico, "envio_whatsapp_inbox_id": inbox,
                        "envio_whatsapp_plantilla": plantilla,
                        "envio_whatsapp_plantilla_recordatorio": plantilla_recordatorio,
                        "envio_whatsapp_idioma": idioma, CAMPOS["nombre_comercial"][0]: empresa})
    db.commit()


def _preparar(monkeypatch, db, respuestas=None, **config):
    """Entorno ficticio de Chatwoot, FakeChatwoot sobre _peticion, correo falso y configuracion. Devuelve el fake."""
    monkeypatch.setenv("CHATWOOT_BASE_URL", URL_FICTICIA)
    monkeypatch.setenv("CHATWOOT_API_TOKEN", TOKEN_FICTICIO)
    monkeypatch.setenv("CHATWOOT_ACCOUNT_ID", "1")
    fake = FakeChatwoot(respuestas)
    monkeypatch.setattr("app.core.chatwoot._peticion", fake)
    _correo_falso(monkeypatch)
    _config(db, **config)
    return fake


def _sc(db, user_admin, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    campos.setdefault("productos", [LINEA])
    campos.setdefault("customer_email", CORREO)
    campos.setdefault("customer_phone", TELEFONO)
    sc = CustomerRequest(numero=f"SC-WA{_sufijo()}", customer_name="Cliente Prueba", advisor_user_id=user_admin.id,
                         advisor_name=user_admin.email, **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    campos.setdefault("productos", [LINEA])
    campos.setdefault("total_cop", 1000)
    campos.setdefault("customer_email", CORREO)
    campos.setdefault("customer_phone", TELEFONO)
    cot = SalesQuotation(numero=f"COT-WA{_sufijo()}", customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _pven(db, **campos):
    from app.models.erp_documents import SaleOrder
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    campos.setdefault("customer_phone", TELEFONO)
    so = SaleOrder(numero=f"PVEN-WA{_sufijo()}", customer_name="Cliente Prueba", customer_email=CORREO,
                   productos=[{"product_name": "Sofá", "qty": 1, "unit_price_cop": 1000000, "total_cop": 1000000}],
                   subtotal_cop=1000000, total_cop=1000000, saldo_cop=400000, anticipo_cop=600000,
                   anticipo_pct_snapshot=60, **campos)
    db.add(so); db.commit(); db.refresh(so)
    return so


def _enviar_sc(app_client, token, sc, body):
    return app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json=body, headers=auth(token))


def _enviar_cot(app_client, token, cot, body):
    return app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json=body, headers=auth(token))


def _enviar_pven(app_client, token, so, body):
    return app_client.post(f"/api/v1/ventas/pedidos/{so.id}/enviar-al-cliente", json=body, headers=auth(token))


def _renglones(db, tipo, doc_id, accion):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    return (db.query(ActivityLog)
            .filter(ActivityLog.entity_type == tipo, ActivityLog.entity_id == doc_id, ActivityLog.action == accion)
            .order_by(ActivityLog.id).all())


def _envios(db, tipo, doc_id):
    from app.models.envios import EnvioAlCliente
    db.expire_all()
    return (db.query(EnvioAlCliente)
            .filter(EnvioAlCliente.document_type == tipo, EnvioAlCliente.document_id == doc_id)
            .order_by(EnvioAlCliente.id).all())


def _tokens(db, tipo, doc_id):
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    return (db.query(DocumentConfirmationToken)
            .filter(DocumentConfirmationToken.document_type == tipo, DocumentConfirmationToken.document_id == doc_id)
            .all())


def _raw(link):
    return link.rsplit("/", 1)[-1]


# ─── 1) Telefonos (solo el backend; la paridad con el frontend la hace T13, RP19/RP21) ─────────────────────────────

def test_telefonos_paridad_con_frontend():
    from app.core.telefonos import e164_whatsapp, telefono_legible
    for t in ("3001234567", "+57 300 123 4567", "0057 300 123 4567", "573001234567"):
        assert e164_whatsapp(t) == E164, t
    for t in ("", None, "abc", "300123456"):
        assert e164_whatsapp(t) is None, t
    assert telefono_legible(E164) == LEGIBLE


def test_chatwoot_real_bloqueado_en_las_pruebas(monkeypatch):
    """r1 (L3 = S6 = R9): como el SMTP, ninguna prueba puede llegar a Chatwoot real. El runner (y conftest) quitan
    CHATWOOT_BASE_URL y CHATWOOT_API_TOKEN del entorno y cambian chatwoot._ABRIDOR por uno que lanza RuntimeError: aun con
    la configuracion puesta, una peticion sin el fake no sale. El abridor real queda en abridor_real (para revisarlo).
    r2 (guarda 4 y 2): tambien urllib.request.urlopen (el cliente propio de chat.py) lanza el mismo RuntimeError, y cada
    bloqueo se cuenta: el runner falla al final si el contador no quedo en 0. Esta prueba dispara el bloqueo a proposito,
    asi que deja el contador como lo encontro."""
    import os
    import urllib.request
    import app.core.chatwoot as cw
    assert "CHATWOOT_BASE_URL" not in os.environ and "CHATWOOT_API_TOKEN" not in os.environ
    assert cw.configurado() is False
    real = cw._ABRIDOR.abridor_real  # sin la guarda no existe: la prueba cae aqui, antes de tocar la red
    assert any(isinstance(h, cw._SinRedirecciones) for h in real.handlers)
    contador = type(cw._ABRIDOR)
    assert getattr(urllib.request.urlopen, "contador", None) is contador  # urlopen bloqueado (sin red si no lo esta)
    antes = contador.veces
    monkeypatch.setenv("CHATWOOT_BASE_URL", URL_FICTICIA)
    monkeypatch.setenv("CHATWOOT_API_TOKEN", TOKEN_FICTICIO)
    try:
        for intento in (lambda: cw._peticion("GET", "/api"), lambda: urllib.request.urlopen(URL_FICTICIA + "/api")):
            try:
                intento()
                raise AssertionError("una peticion real debia estar bloqueada")
            except RuntimeError as e:
                assert str(e) == "Chatwoot real bloqueado en pruebas"
        assert contador.veces == antes + 2
    finally:
        contador.veces = antes  # los dos bloqueos de esta prueba son a proposito: no cuentan para el runner


def test_una_redireccion_no_lleva_el_token_a_otro_host(monkeypatch):
    """r1 (S5): un 302 hacia otro host NO se sigue, asi que el header api_access_token nunca llega al destino. Sin red:
    el abridor es el de produccion (abridor_sin_redirecciones) con un manejador HTTP falso que responde el 302 de la
    base y anota cualquier peticion al otro host."""
    import email.message
    import io
    import urllib.request
    import urllib.response
    import app.core.chatwoot as cw
    monkeypatch.setattr(__import__("logging").getLogger("app.core.chatwoot"), "disabled", True)
    monkeypatch.setenv("CHATWOOT_BASE_URL", "http://localhost:3000")
    monkeypatch.setenv("CHATWOOT_API_TOKEN", TOKEN_FICTICIO)
    al_otro_host = []

    class HTTPFalso(urllib.request.BaseHandler):
        handler_order = 100  # antes que el HTTPHandler real: ninguna peticion sale a la red

        def http_open(self, req):
            cabeceras = email.message.Message()
            if req.host.startswith("localhost"):
                cabeceras["Location"] = "http://otro-host.invalid/robar"
                resp = urllib.response.addinfourl(io.BytesIO(b""), cabeceras, req.full_url, 302)
                resp.msg = "Found"
                return resp
            al_otro_host.append(dict(req.header_items()))
            resp = urllib.response.addinfourl(io.BytesIO(b"{}"), cabeceras, req.full_url, 200)
            resp.msg = "OK"
            return resp

    abridor = cw.abridor_sin_redirecciones()
    abridor.add_handler(HTTPFalso())
    monkeypatch.setattr(cw, "_ABRIDOR", abridor)
    try:
        cw._peticion("GET", "inboxes/3")
        raise AssertionError("la redireccion debia dar error")
    except cw.ChatwootError as e:
        assert e.status == 302
    assert al_otro_host == []
    # Control: un abridor normal SI sigue la redireccion y se lleva el token (lo que la proteccion evita).
    normal = urllib.request.build_opener()
    normal.add_handler(HTTPFalso())
    monkeypatch.setattr(cw, "_ABRIDOR", normal)
    cw._peticion("GET", "inboxes/3")
    assert [h.get("Api_access_token") for h in al_otro_host] == [TOKEN_FICTICIO]


# ─── 2 a 11) Envio por WhatsApp desde la SC, la COT y el PVEN ─────────────────────────────────────────────────────

def test_sc_por_whatsapp_dentro_de_ventana_manda_texto_libre(app_client, db, admin_token, user_admin, monkeypatch):
    fake = _preparar(monkeypatch, db, _en_ventana())
    sc = _sc(db, user_admin)
    resp = _enviar_sc(app_client, admin_token, sc, {"user_name": "asesor@test", "canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    j = resp.json()
    link = j["link_confirmacion"]
    raw = _raw(link)
    wa = j["whatsapp"]
    assert wa["enviado"] is True and wa["estado"] == "ENVIADO" and wa["modo"] == "TEXTO" and wa["motivo"] is None
    assert wa["destino"] == E164 and wa["destino_legible"] == LEGIBLE
    assert wa["texto_resultado"] == f"Enviado automáticamente al {LEGIBLE} desde el WhatsApp de la empresa."
    assert link in wa["texto_manual"] and raw not in wa["mensaje"] and "[enlace de confirmación]" in wa["mensaje"]

    # La busqueda va por los ultimos 10 digitos; el mensaje, a la conversacion de la bandeja 3 (no a la 44 de otra).
    assert fake.rutas() == [("GET", "contacts/search"), ("GET", "contacts/7/conversations"),
                            ("POST", "conversations/55/messages")]
    assert fake.llamadas[0][3] == {"q": TELEFONO}
    cuerpo = fake.cuerpo("POST", "conversations/55/messages")
    assert link in cuerpo["content"] and "template_params" not in cuerpo
    assert cuerpo["message_type"] == "outgoing" and cuerpo["private"] is False
    assert cuerpo["content"] == (f"Hola Cliente Prueba, te escribimos de {EMPRESA}. Puedes revisar y confirmar tu "
                                 f"solicitud {sc.numero} en este enlace: {link} El enlace vence en 2 días. Si tienes "
                                 f"alguna pregunta, responde este mensaje.")
    assert all(0 < t <= 6 for t in fake.timeouts), fake.timeouts

    [envio] = _envios(db, "SC", sc.id)
    assert (envio.estado, envio.modo, envio.canal, envio.proposito) == ("ENVIADO", "TEXTO", "WhatsApp", "CONFIRMACION")
    assert (envio.chatwoot_conversation_id, envio.chatwoot_message_id) == ("55", "901")
    assert envio.destino == E164 and envio.user_name == "asesor@test" and envio.document_numero == sc.numero
    assert envio.id == wa["envio_id"]
    assert raw not in envio.mensaje and "[enlace de confirmación]" in envio.mensaje

    [renglon] = _renglones(db, "SC", sc.id, "ESTADO_CHANGED")
    assert raw not in json.dumps(renglon.extra_data, ensure_ascii=False) and raw not in renglon.description
    assert [c["etiqueta"] for c in renglon.extra_data["cambios"]] == ETIQUETAS_SC + RECORDATORIO
    assert all("campo" not in c for c in renglon.extra_data["cambios"])
    assert renglon.extra_data["cambios"][1]["despues"] == wa["texto_resultado"]
    assert renglon.extra_data["cambios"][2]["despues"] == envio.mensaje
    assert renglon.extra_data["whatsapp"] == {"enviado": True, "estado": "ENVIADO", "modo": "TEXTO", "destino": E164,
                                              "motivo": None, "envio_id": envio.id}


def test_fuera_de_ventana_usa_la_plantilla(app_client, db, admin_token, user_admin, monkeypatch):
    from app.core.envio_whatsapp import TEXTO_PLANTILLA_DOCUMENTO
    # can_reply False y, en la segunda vuelta, sin la clave can_reply (se trata como False).
    for can_reply in (False, None):
        fake = _preparar(monkeypatch, db, _en_ventana(can_reply=can_reply, mensaje_id=902),
                         plantilla="confirmar_documento", idioma="es")
        sc = _sc(db, user_admin)
        resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
        assert resp.status_code == 200, resp.text
        j = resp.json()
        link = j["link_confirmacion"]
        wa = j["whatsapp"]
        assert wa["enviado"] is True and wa["modo"] == "PLANTILLA", (can_reply, wa)
        assert wa["texto_resultado"] == (f"Enviado automáticamente al {LEGIBLE} con la plantilla aprobada "
                                         f"«confirmar_documento» (el cliente no había escrito en las últimas 24 "
                                         f"horas).")
        cuerpo = fake.cuerpo("POST", "conversations/55/messages")
        params = {"1": "Cliente Prueba", "2": EMPRESA, "3": f"Solicitud {sc.numero}", "4": link}
        assert cuerpo["template_params"] == {"name": "confirmar_documento", "category": "UTILITY", "language": "es",
                                             "processed_params": params}
        esperado = TEXTO_PLANTILLA_DOCUMENTO
        for n, valor in params.items():
            esperado = esperado.replace("{{" + n + "}}", valor)
        assert cuerpo["content"] == esperado
        [envio] = _envios(db, "SC", sc.id)
        assert (envio.modo, envio.plantilla, envio.chatwoot_message_id) == ("PLANTILLA", "confirmar_documento", "902")
        assert _raw(link) not in envio.mensaje


def test_fuera_de_ventana_sin_plantilla_no_envia_y_deja_el_enlace(app_client, db, admin_token, user_admin,
                                                                  monkeypatch):
    fake = _preparar(monkeypatch, db, _en_ventana(can_reply=False))
    sc = _sc(db, user_admin)
    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    j = resp.json()
    assert j["link_confirmacion"] and j["link_confirmacion"] in j["whatsapp"]["texto_manual"]
    wa = j["whatsapp"]
    assert wa["enviado"] is False and wa["estado"] == "NO_ENVIADO"
    assert wa["motivo"] == "FUERA_DE_VENTANA_SIN_PLANTILLA" and wa["modo"] is None
    assert wa["texto_resultado"] == ("No se envió: el cliente no ha escrito en las últimas 24 horas y no hay una "
                                     "plantilla aprobada por Meta en Configuración.")
    assert [r for m, r in fake.rutas() if m == "POST"] == []  # no salio ningun mensaje
    db.refresh(sc)
    assert sc.estado == "PENDIENTE_CONFIRMACION"  # estado_si_whatsapp_falla = Sí (R8): el enlace ya sirve
    [envio] = _envios(db, "SC", sc.id)
    assert (envio.estado, envio.motivo) == ("NO_ENVIADO", "FUERA_DE_VENTANA_SIN_PLANTILLA")

    # Un cliente que Chatwoot no conoce, sin plantilla: ni siquiera se crea el contacto.
    fake = _preparar(monkeypatch, db, {("GET", "contacts/search"): {"payload": []}})
    sc2 = _sc(db, user_admin)
    resp = _enviar_sc(app_client, admin_token, sc2, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["whatsapp"]["motivo"] == "FUERA_DE_VENTANA_SIN_PLANTILLA"
    assert fake.rutas() == [("GET", "contacts/search")]


def test_cliente_nuevo_crea_contacto_y_conversacion_con_plantilla(app_client, db, admin_token, user_admin,
                                                                  monkeypatch):
    fake = _preparar(monkeypatch, db, {
        ("GET", "contacts/search"): {"payload": [{"id": 8, "phone_number": "+573009999999"}]},  # otro numero
        ("POST", "contacts"): {"payload": {"contact": {"id": 70},
                                           "contact_inbox": {"source_id": "src-70", "inbox": {"id": 3}}}},
        ("POST", "conversations"): {"id": 77, "messages": [{"id": 903}]},
    }, plantilla="confirmar_documento")
    sc = _sc(db, user_admin)
    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    link = resp.json()["link_confirmacion"]
    assert resp.json()["whatsapp"]["modo"] == "PLANTILLA"
    assert fake.rutas() == [("GET", "contacts/search"), ("POST", "contacts"), ("POST", "conversations")]
    assert fake.cuerpo("POST", "contacts") == {"inbox_id": 3, "name": "Cliente Prueba", "phone_number": E164,
                                               "email": CORREO}
    from app.core.envio_whatsapp import TEXTO_PLANTILLA_DOCUMENTO, rellenar_plantilla
    params = {"1": "Cliente Prueba", "2": EMPRESA, "3": f"Solicitud {sc.numero}", "4": link}
    # r1 (R4): el cuerpo completo de POST conversations.
    assert fake.cuerpo("POST", "conversations") == {
        "source_id": "src-70", "inbox_id": 3, "contact_id": 70, "status": "open",
        "message": {"content": rellenar_plantilla(TEXTO_PLANTILLA_DOCUMENTO, params),
                    "template_params": {"name": "confirmar_documento", "category": "UTILITY", "language": "es",
                                        "processed_params": params}}}
    [envio] = _envios(db, "SC", sc.id)
    assert (envio.chatwoot_conversation_id, envio.chatwoot_message_id, envio.estado) == ("77", "903", "ENVIADO")


def test_crear_contacto_con_telefono_o_correo_repetido():
    """422 de Chatwoot al crear el contacto: si el telefono ya existe se vuelve a buscar (y se toma su bandeja); si el
    correo ya existe se reintenta una vez sin el correo."""
    import app.core.chatwoot as cw
    original = cw._peticion
    try:
        fake = FakeChatwoot({("POST", "contacts"): cw.ChatwootError(422, '{"message":"Email has already been taken"}')})

        def segunda(metodo, ruta, cuerpo=None, params=None, timeout=6):
            if (metodo, ruta) == ("POST", "contacts") and "email" not in (cuerpo or {}):
                fake.llamadas.append((metodo, ruta, copy.deepcopy(cuerpo), params))
                return {"payload": {"contact": {"id": 71}, "contact_inbox": {"source_id": "src-71"}}}
            return fake(metodo, ruta, cuerpo, params, timeout)

        cw._peticion = segunda
        assert cw.crear_contacto(3, "Ana", E164, CORREO) == (71, "src-71")
        assert [c for _, _, c, _ in fake.llamadas] == [
            {"inbox_id": 3, "name": "Ana", "phone_number": E164, "email": CORREO},
            {"inbox_id": 3, "name": "Ana", "phone_number": E164}]

        fake = FakeChatwoot({
            ("POST", "contacts"): cw.ChatwootError(422, '{"message":"Phone number has already been taken"}'),
            ("GET", "contacts/search"): {"payload": [{"id": 72, "phone_number": E164, "contact_inboxes": []}]},
            ("POST", "contacts/72/contact_inboxes"): {"source_id": "src-72"},
        })
        cw._peticion = fake
        assert cw.crear_contacto(3, "Ana", E164, None) == (72, "src-72")
        assert fake.cuerpo("POST", "contacts/72/contact_inboxes") == {"inbox_id": 3, "source_id": "573001234567"}
    finally:
        cw._peticion = original


def test_chatwoot_no_configurado_no_llama_a_la_red(app_client, db, admin_token, user_admin, monkeypatch):
    import app.core.chatwoot as cw
    fake = _preparar(monkeypatch, db, _en_ventana())
    monkeypatch.delenv("CHATWOOT_API_TOKEN")
    sc = _sc(db, user_admin)
    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    wa = resp.json()["whatsapp"]
    assert wa["motivo"] == "CHATWOOT_NO_CONFIGURADO" and wa["enviado"] is False
    assert wa["texto_resultado"] == "No se envió: la conexión con Chatwoot no está configurada en el servidor."
    assert fake.llamadas == []

    # config_chatwoot: sin URL por defecto, https salvo localhost, cuenta entera (1 por defecto), sin valores en el texto.
    monkeypatch.setenv("CHATWOOT_API_TOKEN", TOKEN_FICTICIO)
    monkeypatch.delenv("CHATWOOT_ACCOUNT_ID")
    assert cw.config_chatwoot() == {"base_url": URL_FICTICIA, "account_id": 1, "token": TOKEN_FICTICIO}
    for url in (None, "", "http://chatwoot.invalid", "ftp://chatwoot.invalid", "chatwoot.invalid",
                "https://usuario:secreto123@chatwoot.invalid"):
        if url is None:
            monkeypatch.delenv("CHATWOOT_BASE_URL", raising=False)
        else:
            monkeypatch.setenv("CHATWOOT_BASE_URL", url)
        try:
            cw.config_chatwoot()
            raise AssertionError(f"debia rechazar {url!r}")
        except cw.ChatwootNoConfigurado as e:
            assert TOKEN_FICTICIO not in str(e) and "secreto123" not in str(e) and "invalid" not in str(e), str(e)
    monkeypatch.setenv("CHATWOOT_BASE_URL", "http://localhost:3000/")
    assert cw.config_chatwoot()["base_url"] == "http://localhost:3000"
    monkeypatch.setenv("CHATWOOT_ACCOUNT_ID", "abc")
    try:
        cw.config_chatwoot()
        raise AssertionError("debia rechazar la cuenta")
    except cw.ChatwootNoConfigurado:
        pass


def test_envio_automatico_apagado(app_client, db, admin_token, user_admin, monkeypatch):
    fake = _preparar(monkeypatch, db, _en_ventana(), automatico="false")
    sc = _sc(db, user_admin)
    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    wa = resp.json()["whatsapp"]
    assert wa["motivo"] == "ENVIO_AUTOMATICO_APAGADO" and wa["enviado"] is False
    assert wa["texto_resultado"] == ("Envío manual: se abrió WhatsApp en el computador del asesor (el envío automático "
                                     "está apagado).")
    assert resp.json()["link_confirmacion"] in wa["texto_manual"]
    assert fake.llamadas == []
    [envio] = _envios(db, "SC", sc.id)
    assert (envio.estado, envio.motivo) == ("NO_ENVIADO", "ENVIO_AUTOMATICO_APAGADO")
    # Sin la clave (valor por defecto) tambien esta apagado, y sin bandeja no se intenta nada.
    fake = _preparar(monkeypatch, db, _en_ventana(), automatico=None)
    resp = _enviar_sc(app_client, admin_token, _sc(db, user_admin), {"canal": "WhatsApp"})
    assert resp.json()["whatsapp"]["motivo"] == "ENVIO_AUTOMATICO_APAGADO" and fake.llamadas == []
    fake = _preparar(monkeypatch, db, _en_ventana(), inbox=None)
    resp = _enviar_sc(app_client, admin_token, _sc(db, user_admin), {"canal": "WhatsApp"})
    assert resp.json()["whatsapp"]["motivo"] == "BANDEJA_NO_CONFIGURADA" and fake.llamadas == []


def test_error_de_chatwoot_no_filtra_el_token(app_client, db, admin_token, user_admin, monkeypatch):
    import app.core.chatwoot as cw
    respuestas = _en_ventana()
    respuestas[("GET", "contacts/search")] = cw.ChatwootError(401, f"Unauthorized {TOKEN_FICTICIO}")
    _preparar(monkeypatch, db, respuestas)
    sc = _sc(db, user_admin)
    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    wa = resp.json()["whatsapp"]
    assert wa["motivo"] == "FALLO_CHATWOOT" and wa["enviado"] is False
    assert wa["texto_resultado"].startswith("No se envió: Chatwoot rechazó el mensaje (401")
    assert TOKEN_FICTICIO not in resp.text
    [envio] = _envios(db, "SC", sc.id)
    assert envio.motivo == "FALLO_CHATWOOT" and TOKEN_FICTICIO not in (envio.detalle or "")
    [renglon] = _renglones(db, "SC", sc.id, "ESTADO_CHANGED")
    assert TOKEN_FICTICIO not in json.dumps(renglon.extra_data, ensure_ascii=False)

    # r1 (L1 = S2 = R7): un error que repite el contenido enviado (con el enlace) no deja el enlace ni su token guardados:
    # ni completo ni cortado por el recorte a 300 caracteres del detalle.
    def repite_completo(metodo, ruta, cuerpo, params):
        contenido = cuerpo["content"]
        raise cw.ChatwootError(422, "Unprocessable: " + contenido[contenido.index("http"):])

    def repite_cortado(metodo, ruta, cuerpo, params):
        contenido = cuerpo["content"]
        token = contenido.split("/confirmar/")[1].split(" ")[0]
        relleno = "x" * (300 - len("Unprocessable ") - contenido.index(token) - 20)  # el corte cae a mitad del token
        raise cw.ChatwootError(422, "Unprocessable " + relleno + contenido)

    for repite in (repite_completo, repite_cortado):
        respuestas = _en_ventana()
        respuestas[("POST", "conversations/55/messages")] = repite
        _preparar(monkeypatch, db, respuestas)
        sc = _sc(db, user_admin)
        resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
        assert resp.status_code == 200, resp.text
        wa = resp.json()["whatsapp"]
        raw = _raw(resp.json()["link_confirmacion"])
        assert wa["motivo"] == "FALLO_CHATWOOT", (repite.__name__, wa)
        assert raw[:10] not in wa["detalle"] and raw[:10] not in wa["texto_resultado"], repite.__name__
        assert "[enlace de confirmación]" in wa["detalle"], repite.__name__
        [envio] = _envios(db, "SC", sc.id)
        assert raw[:10] not in envio.detalle, repite.__name__
        [renglon] = _renglones(db, "SC", sc.id, "ESTADO_CHANGED")
        assert raw[:10] not in json.dumps(renglon.extra_data, ensure_ascii=False), repite.__name__


def test_despues_del_post_final_un_error_ambiguo_puede_haber_salido(app_client, db, admin_token, user_admin,
                                                                    monkeypatch):
    """r1 (R3): una vez intentado el POST final (enviar_mensaje o crear_conversacion), un error sin status, un 5xx, una
    respuesta que no es JSON o un 2xx sin 'id' pueden esconder un mensaje que SI salio: CHATWOOT_SIN_RESPUESTA («puede que
    haya salido»), no FALLO. Antes del POST final, un 5xx sigue siendo FALLO_CHATWOOT (no salio nada)."""
    import app.core.chatwoot as cw
    ambiguos = [cw.ChatwootError(502, "Bad Gateway"), cw.ChatwootError(None, "no se pudo conectar con Chatwoot"),
                cw.ChatwootError(None, "Chatwoot respondió algo que no es JSON"), {}, {"status": "ok"}]
    for respuesta in ambiguos:
        respuestas = _en_ventana()
        respuestas[("POST", "conversations/55/messages")] = respuesta
        _preparar(monkeypatch, db, respuestas)
        sc = _sc(db, user_admin)
        resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
        assert resp.status_code == 200, resp.text
        wa = resp.json()["whatsapp"]
        assert wa["motivo"] == "CHATWOOT_SIN_RESPUESTA" and wa["enviado"] is False, (respuesta, wa)
        assert wa["texto_resultado"] == SIN_CONFIRMAR, respuesta  # r2: no dice «no respondió a tiempo» ante un 502
        [envio] = _envios(db, "SC", sc.id)
        assert (envio.estado, envio.motivo) == ("NO_ENVIADO", "CHATWOOT_SIN_RESPUESTA"), respuesta
    # La conversacion nueva (plantilla) sin 'id' en la respuesta: tambien puede haber salido.
    _preparar(monkeypatch, db, {("GET", "contacts/search"): {"payload": []},
                                ("POST", "contacts"): {"payload": {"contact": {"id": 70},
                                                                   "contact_inbox": {"source_id": "src-70"}}},
                                ("POST", "conversations"): {"messages": []}}, plantilla="confirmar_documento")
    resp = _enviar_sc(app_client, admin_token, _sc(db, user_admin), {"canal": "WhatsApp"})
    assert resp.status_code == 200 and resp.json()["whatsapp"]["motivo"] == "CHATWOOT_SIN_RESPUESTA"
    # Antes del POST final: un 5xx es FALLO (no salio nada) y un 422 en el POST final tambien (Chatwoot lo rechazo).
    for clave, error in ((("GET", "contacts/search"), cw.ChatwootError(503, "Service Unavailable")),
                         (("POST", "conversations/55/messages"), cw.ChatwootError(422, "Unprocessable"))):
        respuestas = _en_ventana()
        respuestas[clave] = error
        _preparar(monkeypatch, db, respuestas)
        resp = _enviar_sc(app_client, admin_token, _sc(db, user_admin), {"canal": "WhatsApp"})
        assert resp.json()["whatsapp"]["motivo"] == "FALLO_CHATWOOT", clave


def test_una_respuesta_inesperada_no_tumba_el_envio(app_client, db, admin_token, user_admin, monkeypatch):
    """r1 (R4): la red de seguridad. Un contacto sin 'id' (otra version de Chatwoot) antes del POST final da FALLO_CHATWOOT
    'respuesta inesperada de Chatwoot': 200, la fila y el renglon quedan, nunca un 500 despues del commit."""
    import logging
    monkeypatch.setattr(logging.getLogger("app.core.envio_whatsapp"), "disabled", True)  # traceback esperado
    respuestas = _en_ventana()
    respuestas[("GET", "contacts/search")] = {"payload": [{"phone_number": E164}]}
    _preparar(monkeypatch, db, respuestas)
    sc = _sc(db, user_admin)
    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    wa = resp.json()["whatsapp"]
    assert wa["motivo"] == "FALLO_CHATWOOT" and wa["detalle"] == "respuesta inesperada de Chatwoot"
    [envio] = _envios(db, "SC", sc.id)
    assert envio.motivo == "FALLO_CHATWOOT" and envio.id == wa["envio_id"]
    [renglon] = _renglones(db, "SC", sc.id, "ESTADO_CHANGED")
    assert renglon.extra_data["whatsapp"]["motivo"] == "FALLO_CHATWOOT"


def test_token_con_caracteres_de_control_no_se_usa_ni_se_filtra(app_client, db, admin_token, user_admin,
                                                                monkeypatch):
    """r1 (S1): un CHATWOOT_API_TOKEN con un salto de linea (o espacios) cuenta como «no configurado», con un mensaje que
    no lo lleva; y si de todos modos http.client lanzara ValueError con el header, _peticion lo cambia por un
    ChatwootError sin el valor."""
    import logging
    import app.core.chatwoot as cw
    peticion_real = cw._peticion  # _preparar la cambia por el fake; la ultima parte prueba la de verdad
    monkeypatch.setattr(logging.getLogger("app.core.chatwoot"), "disabled", True)  # aviso esperado, sin ruido
    malo = "abc\ndef-secreto"
    fake = _preparar(monkeypatch, db, _en_ventana())
    for token in (malo, "abc def-secreto", "abc\x07def-secreto"):
        monkeypatch.setenv("CHATWOOT_API_TOKEN", token)
        assert cw.configurado() is False, repr(token)
        try:
            cw.config_chatwoot()
            raise AssertionError("debia rechazar el token")
        except cw.ChatwootNoConfigurado as e:
            assert "secreto" not in str(e)
    monkeypatch.setenv("CHATWOOT_API_TOKEN", malo)
    resp = _enviar_sc(app_client, admin_token, _sc(db, user_admin), {"canal": "WhatsApp"})
    assert resp.status_code == 200 and resp.json()["whatsapp"]["motivo"] == "CHATWOOT_NO_CONFIGURADO"
    assert fake.llamadas == [] and "secreto" not in resp.text

    class AbridorQueLanzaValueError:
        def open(self, req, timeout=None):
            raise ValueError(f"Invalid header value b'{malo}'")

    monkeypatch.setenv("CHATWOOT_API_TOKEN", TOKEN_FICTICIO)
    monkeypatch.setattr(cw, "_ABRIDOR", AbridorQueLanzaValueError())
    try:
        peticion_real("GET", "inboxes/3")
        raise AssertionError("debia fallar")
    except cw.ChatwootError as e:
        assert e.status is None and e.detalle == "configuración de Chatwoot inválida" and "secreto" not in str(e)


def test_peticion_real_sin_red_ni_token_en_los_errores(monkeypatch):
    """_peticion con un abridor falso (nunca la red): url, cabecera y cuerpo; HTTPError sin el token y recortado; timeout
    -> ChatwootSinRespuesta; otro error de red -> 'no se pudo conectar con Chatwoot'."""
    import io
    import logging
    import socket
    import urllib.error
    import app.core.chatwoot as cw
    monkeypatch.setattr(logging.getLogger("app.core.chatwoot"), "disabled", True)  # los avisos esperados, sin ruido
    monkeypatch.setenv("CHATWOOT_BASE_URL", URL_FICTICIA + "/")
    monkeypatch.setenv("CHATWOOT_API_TOKEN", TOKEN_FICTICIO)
    monkeypatch.setenv("CHATWOOT_ACCOUNT_ID", "5")
    pedidos = []

    class Respuesta(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    class Abridor:
        def __init__(self, hacer):
            self.hacer = hacer

        def open(self, req, timeout=None):
            pedidos.append((req, timeout))
            return self.hacer(req)

    monkeypatch.setattr(cw, "_ABRIDOR", Abridor(lambda req: Respuesta(b'{"id": 1}')))
    assert cw._peticion("POST", "conversations/9/messages", {"content": "hola"}, timeout=4) == {"id": 1}
    req, timeout = pedidos[-1]
    assert req.full_url == f"{URL_FICTICIA}/api/v1/accounts/5/conversations/9/messages" and timeout == 4
    assert req.get_method() == "POST" and json.loads(req.data) == {"content": "hola"}
    assert req.get_header("Api_access_token") == TOKEN_FICTICIO
    cw._peticion("GET", "contacts/search", params={"q": TELEFONO})
    assert pedidos[-1][0].full_url == f"{URL_FICTICIA}/api/v1/accounts/5/contacts/search?q={TELEFONO}"
    cw._peticion("GET", "/api")
    assert pedidos[-1][0].full_url == f"{URL_FICTICIA}/api"

    def error_http(req):
        cuerpo = (f'{{"error": "token {TOKEN_FICTICIO} no vale"}}' + "x" * 600).encode()
        raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, io.BytesIO(cuerpo))

    import http.client

    class LecturaCortada(Respuesta):
        def read(self, *a):
            raise http.client.IncompleteRead(b"{")

    # r1 (R4): tambien la respuesta que no es JSON, un corte de conexion (OSError) y una lectura incompleta.
    casos = [(error_http, cw.ChatwootError, 401, None),
             (lambda req: (_ for _ in ()).throw(socket.timeout("timed out")), cw.ChatwootSinRespuesta, None, None),
             (lambda req: (_ for _ in ()).throw(urllib.error.URLError(socket.timeout("t"))),
              cw.ChatwootSinRespuesta, None, None),
             (lambda req: (_ for _ in ()).throw(urllib.error.URLError("sin ruta")), cw.ChatwootError, None,
              "no se pudo conectar con Chatwoot"),
             (lambda req: (_ for _ in ()).throw(ConnectionResetError(10054, "reset")), cw.ChatwootError, None,
              "no se pudo conectar con Chatwoot"),
             (lambda req: LecturaCortada(b""), cw.ChatwootError, None, "no se pudo conectar con Chatwoot"),
             (lambda req: Respuesta(b"<html>502 Bad Gateway</html>"), cw.ChatwootError, None,
              "Chatwoot respondió algo que no es JSON")]
    for hacer, tipo, status, detalle in casos:
        monkeypatch.setattr(cw, "_ABRIDOR", Abridor(hacer))
        try:
            cw._peticion("GET", "inboxes/3")
            raise AssertionError("debia fallar")
        except cw.ChatwootError as e:
            assert type(e) is tipo and e.status == status, (type(e), e.status)
            assert TOKEN_FICTICIO not in str(e) and TOKEN_FICTICIO not in e.detalle
            assert len(e.detalle) <= 300
            if detalle is not None:
                assert e.detalle == detalle, e.detalle
    # Sin configuracion no se arma ninguna peticion.
    monkeypatch.delenv("CHATWOOT_API_TOKEN")
    n = len(pedidos)
    try:
        cw._peticion("GET", "inboxes/3")
        raise AssertionError("debia fallar")
    except cw.ChatwootNoConfigurado:
        pass
    assert len(pedidos) == n


def test_timeout_en_el_post_final_avisa_que_puede_haber_salido(app_client, db, admin_token, user_admin, monkeypatch):
    import app.core.chatwoot as cw
    import app.core.envio_whatsapp as ew
    respuestas = _en_ventana()
    respuestas[("POST", "conversations/55/messages")] = cw.ChatwootSinRespuesta()
    _preparar(monkeypatch, db, respuestas)
    sc = _sc(db, user_admin)
    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    wa = resp.json()["whatsapp"]
    assert wa["motivo"] == "CHATWOOT_SIN_RESPUESTA" and wa["enviado"] is False
    # r2 (arreglos 3): texto neutro, sirve tambien para el 5xx, la respuesta que no es JSON, el corte y el 2xx sin id.
    assert wa["texto_resultado"] == SIN_CONFIRMAR
    # Plazo total agotado antes de llamar: tampoco se llama a Chatwoot.
    fake = _preparar(monkeypatch, db, _en_ventana())
    monkeypatch.setattr(ew, "PLAZO_TOTAL", 0)
    resp = _enviar_sc(app_client, admin_token, _sc(db, user_admin), {"canal": "WhatsApp"})
    assert resp.json()["whatsapp"]["motivo"] == "CHATWOOT_SIN_RESPUESTA" and fake.llamadas == []


def test_whatsapp_sin_telefono_es_400_sin_tocar_nada(app_client, db, admin_token, user_admin, monkeypatch):
    fake = _preparar(monkeypatch, db, _en_ventana())
    for telefono in (None, "300123456", "N/A"):  # sin telefono, 9 digitos (RP19) y basura sin digitos
        sc = _sc(db, user_admin, customer_phone=telefono)
        resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
        assert resp.status_code == 400, (telefono, resp.text)
        assert resp.json()["detail"] == SIN_TELEFONO
        db.refresh(sc)
        assert sc.estado == "ASIGNADA" and _tokens(db, "SC", sc.id) == [] and _envios(db, "SC", sc.id) == []
        assert _renglones(db, "SC", sc.id, "ESTADO_CHANGED") == []
    cot = _cot(db, customer_phone="123")
    resp = _enviar_cot(app_client, admin_token, cot, {"canal": "WhatsApp"})
    assert resp.status_code == 400 and resp.json()["detail"] == SIN_TELEFONO
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and _tokens(db, "COT", cot.id) == []
    so = _pven(db, customer_phone="")
    resp = _enviar_pven(app_client, admin_token, so, {"canal": "WhatsApp"})
    assert resp.status_code == 400 and resp.json()["detail"] == SIN_TELEFONO
    assert _tokens(db, "PVEN", so.id) == []
    assert fake.llamadas == []
    # Con Email u Otro el telefono no importa.
    resp = _enviar_sc(app_client, admin_token, _sc(db, user_admin, customer_phone=None), {"canal": "Otro"})
    assert resp.status_code == 200 and resp.json()["whatsapp"] is None


def test_telefono_del_cliente_si_el_documento_no_tiene(app_client, db, admin_token, user_admin, monkeypatch):
    """C27: el documento sin telefono propio usa el de la ficha del cliente (telefono_del_documento), en el canal y en
    el envio."""
    from app.models.customers import Customer
    cli = Customer(first_name="Ana", last_name="Prueba", phone="300 123 4567")
    db.add(cli); db.commit(); db.refresh(cli)
    fake = _preparar(monkeypatch, db, _en_ventana())
    sc = _sc(db, user_admin, customer_phone=None, customer_id=cli.id)
    resp = _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["whatsapp"]["destino"] == E164 and resp.json()["whatsapp"]["enviado"] is True
    assert fake.llamadas[0][3] == {"q": TELEFONO}


def test_cot_por_whatsapp_incluye_el_total_en_pesos(app_client, db, admin_token, user_admin, monkeypatch):
    from app.core.fechas import fecha_larga, hoy_colombia
    fake = _preparar(monkeypatch, db, _en_ventana())
    cot = _cot(db)
    resp = _enviar_cot(app_client, admin_token, cot, {"canal": "WhatsApp", "user_name": "asesor@test"})
    assert resp.status_code == 200, resp.text
    j = resp.json()
    contenido = fake.cuerpo("POST", "conversations/55/messages")["content"]
    vence = hoy_colombia() + datetime.timedelta(days=5)
    assert j["vence"] == vence.isoformat()
    assert contenido == (f"Hola Cliente Prueba, te escribimos de {EMPRESA}. Tu cotización {cot.numero} por $1.000 está "
                         f"lista. Puedes revisarla y confirmarla en este enlace: {j['link_confirmacion']} La cotización "
                         f"es válida hasta el {fecha_larga(vence)}. Si tienes alguna pregunta, responde este mensaje.")
    assert "2 días" not in contenido  # C14: la fecha real, no los 2 días de la SC
    db.refresh(cot)
    assert cot.canal_envio == "WhatsApp" and cot.estado == "PENDIENTE_CONFIRMACION"
    [renglon] = _renglones(db, "COT", cot.id, "ESTADO_CHANGED")
    assert [c["etiqueta"] for c in renglon.extra_data["cambios"]] == ETIQUETAS_COT_PVEN + RECORDATORIO
    [envio] = _envios(db, "COT", cot.id)
    assert envio.proposito == "CONFIRMACION" and envio.estado == "ENVIADO"
    # Plantilla de la COT: {{3}} = 'Cotización COT-…'.
    fake = _preparar(monkeypatch, db, _en_ventana(can_reply=False), plantilla="confirmar_documento")
    cot2 = _cot(db)
    resp = _enviar_cot(app_client, admin_token, cot2, {"canal": "WhatsApp"})
    params = fake.cuerpo("POST", "conversations/55/messages")["template_params"]["processed_params"]
    assert params["3"] == f"Cotización {cot2.numero}"


def test_pedido_por_whatsapp_es_de_consulta_y_un_fallo_no_deshace_el_envio(app_client, db, admin_token, user_admin,
                                                                          monkeypatch):
    import app.core.chatwoot as cw
    from app.core.fechas import fecha_larga, hoy_colombia
    from app.core.textos_actividad import nombre_de_usuario
    fake = _preparar(monkeypatch, db, _en_ventana())
    so = _pven(db)
    resp = _enviar_pven(app_client, admin_token, so, {"canal": "WhatsApp", "user_name": "otro"})
    assert resp.status_code == 200, resp.text
    j = resp.json()
    vence = hoy_colombia() + datetime.timedelta(days=30)
    contenido = fake.cuerpo("POST", "conversations/55/messages")["content"]
    assert contenido == (f"Hola Cliente Prueba, te escribimos de {EMPRESA}. Tu pedido {so.numero} por $1.000.000 quedó "
                         f"registrado. Puedes ver tu pedido, lo que has pagado y lo que te falta en este enlace: "
                         f"{j['link']} El enlace estará disponible hasta el {fecha_larga(vence)}. Si tienes alguna "
                         f"pregunta, responde este mensaje.")
    assert j["whatsapp"]["enviado"] is True and j["whatsapp"]["modo"] == "TEXTO"
    [envio] = _envios(db, "PVEN", so.id)
    assert envio.proposito == "CONSULTA" and envio.user_name == nombre_de_usuario(user_admin)
    [renglon] = _renglones(db, "VEN", so.id, "ENVIADO_AL_CLIENTE")
    assert [c["etiqueta"] for c in renglon.extra_data["cambios"]] == ETIQUETAS_COT_PVEN
    assert renglon.extra_data["whatsapp"]["envio_id"] == envio.id and _raw(j["link"]) not in str(renglon.extra_data)

    # La plantilla del pedido: {{3}} = 'Pedido de venta PVEN-…'.
    fake = _preparar(monkeypatch, db, _en_ventana(can_reply=False), plantilla="confirmar_documento")
    so2 = _pven(db)
    resp = _enviar_pven(app_client, admin_token, so2, {"canal": "WhatsApp"})
    assert fake.cuerpo("POST", "conversations/55/messages")["template_params"]["processed_params"]["3"] == \
        f"Pedido de venta {so2.numero}"

    # Si Chatwoot falla, el enlace queda igual (el pedido ya se envio): 200, enlace vigente y el motivo. r1 (R3): un 4xx
    # en el POST final es un rechazo (FALLO_CHATWOOT); un 5xx seria ambiguo («puede que haya salido»).
    respuestas = _en_ventana()
    respuestas[("POST", "conversations/55/messages")] = cw.ChatwootError(422, "plantilla rechazada")
    _preparar(monkeypatch, db, respuestas)
    so3 = _pven(db)
    resp = _enviar_pven(app_client, admin_token, so3, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["whatsapp"]["motivo"] == "FALLO_CHATWOOT" and len(_tokens(db, "PVEN", so3.id)) == 1
    [envio] = _envios(db, "PVEN", so3.id)
    assert envio.estado == "NO_ENVIADO"


def test_cot_con_lead_que_falla_conserva_el_registro_del_whatsapp(app_client, db, admin_token, user_admin,
                                                                  monkeypatch):
    """Si mover el lead del CRM falla despues del WhatsApp, el registro del envio (que ya salio) no se pierde."""
    import logging
    _preparar(monkeypatch, db, _en_ventana())
    sc = _sc(db, user_admin, estado="CONFIRMADA")
    cot = _cot(db, sc_id=sc.id, sc_numero=sc.numero)

    def falla(*args, **kwargs):
        raise RuntimeError("CRM caido")

    monkeypatch.setattr("app.api.v1.erp_ventas.mover_lead_de_solicitud", falla)
    monkeypatch.setattr(logging.getLogger("app.api.v1.erp_ventas"), "disabled", True)
    resp = _enviar_cot(app_client, admin_token, cot, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    [envio] = _envios(db, "COT", cot.id)
    assert envio.estado == "ENVIADO" and envio.id == resp.json()["whatsapp"]["envio_id"]
    [renglon] = _renglones(db, "COT", cot.id, "ESTADO_CHANGED")
    assert renglon.extra_data["whatsapp"]["envio_id"] == envio.id


def test_pedido_si_falla_completar_el_renglon_el_registro_del_whatsapp_queda(app_client, db, admin_token, user_admin,
                                                                            monkeypatch):
    """r1 (R2): en el PVEN el renglon ENVIADO_AL_CLIENTE se completa despues del correo. Si eso falla, la fila
    EnvioAlCliente de un WhatsApp que ya salio no se pierde: el renglon queda como estaba antes del correo.
    r2 (arreglos 1): el fallo ocurre DENTRO de Postgres y en la sesion del endpoint (SELECT 1/0 justo antes del UPDATE
    que completa el renglon), no como un error de Python: asi se prueba que el savepoint tambien recupera una
    transaccion que Postgres dejo abortada (sin el, el commit de despues la deshace con la fila del envio)."""
    import logging
    from sqlalchemy import text
    from sqlalchemy.orm import Query
    _preparar(monkeypatch, db, _en_ventana())
    update_original = Query.update

    def update_que_falla_en_la_base(self, values, *args, **kwargs):
        extra = next((v for k, v in values.items() if getattr(k, "key", k) == "extra_data"), None)
        if isinstance(extra, dict) and extra.get("correo") is not None:  # el UPDATE que completa el renglon
            self.session.execute(text("SELECT 1/0"))  # division_by_zero en Postgres: la transaccion queda abortada
        return update_original(self, values, *args, **kwargs)

    monkeypatch.setattr(Query, "update", update_que_falla_en_la_base)
    monkeypatch.setattr(logging.getLogger("app.api.v1.erp_ventas"), "disabled", True)
    so = _pven(db)
    resp = _enviar_pven(app_client, admin_token, so, {"canal": "WhatsApp"})
    assert resp.status_code == 200, resp.text
    wa = resp.json()["whatsapp"]
    assert wa["enviado"] is True
    [envio] = _envios(db, "PVEN", so.id)
    assert envio.estado == "ENVIADO" and envio.id == wa["envio_id"]
    [renglon] = _renglones(db, "VEN", so.id, "ENVIADO_AL_CLIENTE")
    assert renglon.extra_data["correo"] is None  # el renglon quedo como antes del correo


def test_seguimiento_usa_la_plantilla_de_recordatorio(db, user_admin, monkeypatch):
    """proposito SEGUIMIENTO (lo usa T11): la plantilla 'recordatorio' con sus 4 variables (nombre, documento, empresa,
    enlace); sin ella no sale nada aunque exista la de 'documento'. whatsapp_configurado dice si el automatico esta
    listo."""
    from app.core import envio_whatsapp as ew
    enlace = "https://erp.invalid/confirmar/" + "A" * 43
    fake = _preparar(monkeypatch, db, _en_ventana(can_reply=False), plantilla="confirmar_documento",
                     plantilla_recordatorio="recordar_documento", idioma="es_CO")
    assert ew.whatsapp_configurado(db) is True
    cot = _cot(db)
    vence = datetime.date(2026, 10, 30)
    # r1 (S4): una sola regla de «una linea» (empresa.limpiar_linea + espacios colapsados): \x07 tambien se va.
    wa = ew.enviar_documento(db, doc_tipo="COT", doc_id=cot.id, doc_numero=cot.numero,
                             cliente_nombre="  Ana\x07\nPérez ",
                             cliente_email=CORREO, telefono=TELEFONO, enlace=enlace, total_cop=1000, vence=vence,
                             user_name="Sistema", proposito="SEGUIMIENTO")
    assert wa["enviado"] is True and wa["modo"] == "PLANTILLA"
    cuerpo = fake.cuerpo("POST", "conversations/55/messages")
    params = {"1": "Ana Pérez", "2": f"cotización {cot.numero}", "3": EMPRESA, "4": enlace}
    assert cuerpo["template_params"] == {"name": "recordar_documento", "category": "UTILITY", "language": "es_CO",
                                         "processed_params": params}
    assert cuerpo["content"] == ew.rellenar_plantilla(ew.TEXTO_PLANTILLA_RECORDATORIO, params)
    assert wa["texto_manual"] == (f"Hola Ana Pérez, te recordamos que tu cotización {cot.numero} de {EMPRESA} está "
                                  f"esperando tu confirmación. Revísala y confírmala aquí: {enlace} La cotización es "
                                  f"válida hasta el 30 de octubre de 2026. Si quieres cambiar algo, en esa misma página "
                                  f"puedes pedir cambios.")
    assert "A" * 43 not in wa["mensaje"]
    [envio] = _envios(db, "COT", cot.id)
    assert envio.proposito == "SEGUIMIENTO" and envio.plantilla == "recordar_documento"

    _preparar(monkeypatch, db, _en_ventana(can_reply=False), plantilla="confirmar_documento")
    wa = ew.enviar_documento(db, doc_tipo="SC", doc_id=cot.id, doc_numero="SC-X", cliente_nombre=None,
                             cliente_email=None, telefono=TELEFONO, enlace=enlace, user_name=None,
                             proposito="SEGUIMIENTO")
    assert wa["motivo"] == "FUERA_DE_VENTANA_SIN_PLANTILLA"
    assert wa["texto_manual"].startswith("Hola cliente, te recordamos que tu solicitud SC-X de")

    # r1 (S3): las variables se rellenan en una sola pasada: un cliente llamado '{{4}}' no se vuelve el enlace.
    assert ew.rellenar_plantilla("A {{1}} B {{2}} C {{9}}", {"1": "{{2}}", "2": "x"}) == "A {{2}} B x C {{9}}"
    fake = _preparar(monkeypatch, db, _en_ventana(can_reply=False), plantilla="confirmar_documento")
    ew.enviar_documento(db, doc_tipo="COT", doc_id=cot.id, doc_numero=cot.numero, cliente_nombre="{{4}}",
                        cliente_email=None, telefono=TELEFONO, enlace=enlace, user_name=None)
    contenido = fake.cuerpo("POST", "conversations/55/messages")["content"]
    assert contenido.startswith("Hola {{4}}, te escribimos de") and contenido.count(enlace) == 1

    # r1 (R6): el autor con el mismo saneo de la Actividad (textos_actividad.autor_de_actividad): sin caracteres de
    # control, hasta 150, y uno que no es texto pasa a 'Sistema'.
    for user_name, guardado in (("Ana\x00" + "x" * 200, ("Ana" + "x" * 200)[:150]), (123, "Sistema"), (None, None)):
        _preparar(monkeypatch, db, automatico="false")
        wa = ew.enviar_documento(db, doc_tipo="COT", doc_id=cot.id, doc_numero=cot.numero, cliente_nombre="Ana",
                                 cliente_email=None, telefono=TELEFONO, enlace=enlace, user_name=user_name)
        envio = [e for e in _envios(db, "COT", cot.id) if e.id == wa["envio_id"]][0]
        assert envio.user_name == guardado, (user_name, envio.user_name)
    for malo in ({"proposito": "OTRO"}, {"doc_tipo": "XX"}):
        datos = {"doc_tipo": "SC", "doc_id": 1, "doc_numero": "SC-X", "cliente_nombre": "A", "cliente_email": None,
                 "telefono": TELEFONO, "enlace": enlace, "user_name": None, **malo}
        try:
            ew.enviar_documento(db, **datos)
            raise AssertionError(f"debia rechazar {malo}")
        except ValueError:
            pass
    _preparar(monkeypatch, db, automatico="false")
    assert ew.whatsapp_configurado(db) is False


# ─── telefono_whatsapp en los dicts (C27, RP19, RP20) y privacidad de los renglones ─────────────────────────────────

def test_telefono_whatsapp_en_los_dicts_sin_una_consulta_por_fila(app_client, db, admin_token, user_admin,
                                                                   contador_sql):
    from app.models.customers import Customer
    from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation

    def lote(n):
        prefijo = f"WL{_sufijo()}"
        for i in range(n):
            cli = Customer(first_name="Ana", last_name=f"Lote{i}", phone="(300) 123-4567")
            db.add(cli); db.flush()
            datos = {"customer_name": "Ana", "customer_id": cli.id, "customer_phone": None}
            db.add(CustomerRequest(numero=f"SC-{prefijo}-{i}", estado="ASIGNADA", **datos))
            db.add(SalesQuotation(numero=f"COT-{prefijo}-{i}", estado="BORRADOR", **datos))
            db.add(SaleOrder(numero=f"PVEN-{prefijo}-{i}", estado="PENDIENTE_COMPRA", **datos))
        db.commit()
        return prefijo

    consultas = {}
    for n in (1, 3):
        prefijo = lote(n)
        for ruta in ("solicitudes", "cotizaciones", "pedidos"):
            with contador_sql.ventana() as v:
                resp = app_client.get(f"/api/v1/ventas/{ruta}?search={prefijo}&limit=200", headers=auth(admin_token))
            assert resp.status_code == 200, resp.text
            data = resp.json()["data"]
            assert len(data) == n and all(d["telefono_whatsapp"] == E164 for d in data), (ruta, data)
            consultas[(ruta, n)] = v.consultas
    for ruta in ("solicitudes", "cotizaciones", "pedidos"):
        assert consultas[(ruta, 1)] == consultas[(ruta, 3)], consultas  # RP20: selectinload, no una por fila

    sc = _sc(db, user_admin, customer_phone="300123456")
    resp = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token))
    assert resp.json()["data"]["telefono_whatsapp"] is None  # RP19: 9 digitos no es un WhatsApp


def test_otros_roles_no_ven_el_numero_del_whatsapp_en_la_actividad(app_client, db, admin_token, user_admin,
                                                                    bodega_token, monkeypatch):
    _preparar(monkeypatch, db, _en_ventana())
    sc = _sc(db, user_admin)
    assert _enviar_sc(app_client, admin_token, sc, {"canal": "WhatsApp"}).status_code == 200

    def renglon(token):
        resp = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(token))
        assert resp.status_code == 200, resp.text
        [r] = [a for a in resp.json()["data"]["actividades"] if (a.get("extra_data") or {}).get("whatsapp")]
        return r

    r = renglon(bodega_token)
    assert LEGIBLE not in json.dumps(r, ensure_ascii=False) and E164 not in json.dumps(r, ensure_ascii=False)
    assert "destino" not in r["extra_data"]["whatsapp"]
    assert {"etiqueta": "WhatsApp", "despues": "Enviado automáticamente desde el WhatsApp de la empresa."} in \
        r["extra_data"]["cambios"]
    r = renglon(admin_token)
    assert r["extra_data"]["whatsapp"]["destino"] == E164 and LEGIBLE in json.dumps(r, ensure_ascii=False)


# ─── 12) Configuracion del WhatsApp ─────────────────────────────────────────────────────────────────────────────────

def test_config_whatsapp(app_client, db, admin_token, user_admin, vendedor_token, monkeypatch):
    from app.core.admin_config import leer_config
    from app.core.textos_actividad import nombre_de_usuario
    from app.models.erp_documents import ActivityLog
    _preparar(monkeypatch, db, automatico=None, inbox=None)
    ruta = "/api/v1/ventas/envio-cliente/whatsapp/config"
    claves = ["envio_whatsapp_automatico", "envio_whatsapp_inbox_id", "envio_whatsapp_plantilla",
              "envio_whatsapp_plantilla_recordatorio", "envio_whatsapp_idioma"]

    assert app_client.put(ruta, json={"inbox_id": 3}, headers=auth(vendedor_token)).status_code == 403
    assert app_client.get(ruta, headers=auth(vendedor_token)).status_code == 403
    errores = [
        ({"plantilla": "Confirmar Documento"},
         "El nombre de la plantilla solo puede tener minúsculas, números y guion bajo, igual que en Meta."),
        ({"plantilla_recordatorio": "recordar-documento"},
         "El nombre de la plantilla solo puede tener minúsculas, números y guion bajo, igual que en Meta."),
        # r1 (L4 = R8): hasta 100, lo que cabe en envios_al_cliente.plantilla (VARCHAR(100)).
        ({"plantilla": "a" * 101}, "El nombre de la plantilla puede tener hasta 100 caracteres."),
        ({"plantilla_recordatorio": "b" * 101}, "El nombre de la plantilla puede tener hasta 100 caracteres."),
        ({"automatico": True}, "Para encender el envío automático falta el número de la bandeja de WhatsApp."),
        ({"inbox_id": 0}, "El número de la bandeja debe ser un número entero mayor que 0."),
        ({"inbox_id": "3a"}, "El número de la bandeja debe ser un número entero mayor que 0."),
        ({"inbox_id": True}, "El número de la bandeja debe ser un número entero mayor que 0."),
        ({"idioma": "español"}, "El idioma debe tener el formato de Meta, por ejemplo es o es_CO."),
        ({"automatico": "quizas"}, "El interruptor del envío automático debe ser verdadero o falso."),
        ({"token": "x"}, "Campo desconocido: token."),
        # Todo o nada: una clave valida junto a una mala no se guarda.
        ({"inbox_id": 3, "plantilla": "MAL"},
         "El nombre de la plantilla solo puede tener minúsculas, números y guion bajo, igual que en Meta."),
    ]
    for body, mensaje in errores:
        resp = app_client.put(ruta, json=body, headers=auth(admin_token))
        assert resp.status_code == 422, (body, resp.text)
        assert resp.json()["detail"] == mensaje, body
    assert leer_config(db, claves) == {}

    antes = db.query(ActivityLog).filter(ActivityLog.entity_type == "EMPRESA").count()
    body = {"automatico": True, "inbox_id": "3", "plantilla": "confirmar_documento",
            "plantilla_recordatorio": "recordar_documento", "idioma": "es_CO", "user_name": "otro"}
    resp = app_client.put(ruta, json=body, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert leer_config(db, claves) == {"envio_whatsapp_automatico": "true", "envio_whatsapp_inbox_id": "3",
                                       "envio_whatsapp_plantilla": "confirmar_documento",
                                       "envio_whatsapp_plantilla_recordatorio": "recordar_documento",
                                       "envio_whatsapp_idioma": "es_CO"}
    db.expire_all()
    filas = (db.query(ActivityLog).filter(ActivityLog.entity_type == "EMPRESA").order_by(ActivityLog.id).all())
    assert len(filas) == antes + 1
    assert filas[-1].user_name == nombre_de_usuario(user_admin)  # RP15: el autor sale de la sesion
    assert filas[-1].description.startswith("Envío automático por WhatsApp actualizado")

    data = app_client.get(ruta, headers=auth(admin_token)).json()["data"]
    assert {k: data[k] for k in ("automatico", "inbox_id", "plantilla", "plantilla_recordatorio", "idioma",
                                 "servidor_configurado", "categoria")} == {
        "automatico": True, "inbox_id": 3, "plantilla": "confirmar_documento",
        "plantilla_recordatorio": "recordar_documento", "idioma": "es_CO", "servidor_configurado": True,
        "categoria": "UTILITY"}
    assert "{{4}}" in data["texto_plantilla"] and "{{4}}" in data["texto_plantilla_recordatorio"]
    assert set(data["ejemplo_parametros"]) == {"1", "2", "3", "4"}
    texto = json.dumps(data, ensure_ascii=False)
    assert TOKEN_FICTICIO not in texto and "chatwoot.invalid" not in texto
    assert not [k for k in data if "token" in k or "url" in k]

    # El asesor solo ve el estado (sin token ni direccion).
    resp = app_client.get("/api/v1/ventas/envio-cliente/whatsapp/estado", headers=auth(vendedor_token))
    assert resp.status_code == 200, resp.text
    estado = resp.json()["data"]
    assert set(estado) == {"automatico", "listo", "plantilla_configurada", "plantilla_recordatorio_configurada",
                           "motivo_texto"}
    assert estado["automatico"] is True and estado["listo"] is True and estado["motivo_texto"] is None
    assert TOKEN_FICTICIO not in resp.text and "chatwoot.invalid" not in resp.text
    monkeypatch.delenv("CHATWOOT_API_TOKEN")
    estado = app_client.get("/api/v1/ventas/envio-cliente/whatsapp/estado", headers=auth(vendedor_token)).json()["data"]
    assert estado["listo"] is False
    assert estado["motivo_texto"] == "Falta configurar la conexión con Chatwoot en el servidor (EasyPanel)."

    # Apagar y borrar la plantilla (vacia = sin plantilla).
    resp = app_client.put(ruta, json={"automatico": False, "plantilla": ""}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert leer_config(db, claves)["envio_whatsapp_automatico"] == "false"
    assert "envio_whatsapp_plantilla" not in leer_config(db, claves)
    # 100 caracteres si caben.
    resp = app_client.put(ruta, json={"plantilla": "c" * 100}, headers=auth(admin_token))
    assert resp.status_code == 200 and resp.json()["data"]["plantilla"] == "c" * 100, resp.text

    # /ventas/config no las acepta ni las muestra (C23, RP18).
    resp = app_client.patch("/api/v1/ventas/config", json={"envio_whatsapp_automatico": "true"},
                            headers=auth(admin_token))
    assert resp.status_code == 422 and resp.json()["detail"] == RESERVADA
    datos = app_client.get("/api/v1/ventas/config", headers=auth(admin_token)).json()["data"]
    assert not [k for k in datos if k.startswith("envio_whatsapp_")]


# ─── 13) Probar conexion (hueco 0) ──────────────────────────────────────────────────────────────────────────────────

def test_probar_conexion(app_client, db, admin_token, user_admin, vendedor_token, monkeypatch):
    from app.core.textos_actividad import nombre_de_usuario
    ruta = "/api/v1/ventas/envio-cliente/whatsapp/probar"
    fake = _preparar(monkeypatch, db, {
        ("GET", "/api"): {"version": "4.1.0"},
        ("GET", "inboxes/3"): {"id": 3, "name": "WhatsApp Nebulae", "channel_type": "Channel::Whatsapp",
                               "message_templates": [{"name": "confirmar_documento", "status": "approved"},
                                                     {"name": "recordar_documento", "status": "PENDING"}]},
    }, plantilla="confirmar_documento", plantilla_recordatorio="recordar_documento")
    assert app_client.post(ruta, json={}, headers=auth(vendedor_token)).status_code == 403
    resp = app_client.post(ruta, json={"user_name": "otro"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["ok"] is True and data["es_whatsapp"] is True and data["bandeja"] == "WhatsApp Nebulae"
    assert data["version"] == "4.1.0" and data["plantilla"] == "APROBADA"
    assert data["plantilla_recordatorio"] == "NO_ENCONTRADA" and "PENDING" in data["plantilla_recordatorio_detalle"]
    assert data["probado_por"] == nombre_de_usuario(user_admin)
    assert sorted(fake.rutas()) == [("GET", "/api"), ("GET", "inboxes/3")]  # no envia mensajes
    assert TOKEN_FICTICIO not in resp.text

    # Sin message_templates no se puede verificar; una bandeja que no es de WhatsApp no sirve.
    _preparar(monkeypatch, db, {("GET", "/api"): {"version": "4.1.0"},
                                ("GET", "inboxes/3"): {"id": 3, "name": "Web", "channel_type": "Channel::WebWidget"}},
              plantilla="confirmar_documento")
    data = app_client.post(ruta, json={}, headers=auth(admin_token)).json()["data"]
    assert data["ok"] is False and data["es_whatsapp"] is False and data["plantilla"] == "NO_VERIFICABLE"
    assert data["plantilla_recordatorio"] is None  # sin nombre configurado no hay nada que revisar

    # Sin conexion configurada: no llama y dice que falta.
    fake = _preparar(monkeypatch, db, {})
    monkeypatch.delenv("CHATWOOT_BASE_URL")
    data = app_client.post(ruta, json={}, headers=auth(admin_token)).json()["data"]
    assert data["ok"] is False and fake.llamadas == []
    assert data["mensaje"] == "Falta configurar la conexión con Chatwoot en el servidor (EasyPanel)."


# ─── U16-entrega: verificar el estado del WhatsApp ─────────────────────────────────────────────────────────────────

def _envio_guardado(db, doc, tipo="SC", **campos):
    from app.models.envios import EnvioAlCliente
    campos.setdefault("canal", "WhatsApp")
    campos.setdefault("estado", "ENVIADO")
    campos.setdefault("chatwoot_conversation_id", "55")
    campos.setdefault("chatwoot_message_id", "901")
    e = EnvioAlCliente(document_type=tipo, document_id=doc.id, document_numero=doc.numero, proposito="CONFIRMACION",
                       destino=E164, modo="TEXTO", mensaje="Hola [enlace de confirmación]", user_name="asesor@test",
                       **campos)
    db.add(e); db.commit(); db.refresh(e)
    return e


def _verificar(app_client, token, envio_id, body=None):
    return app_client.post(f"/api/v1/ventas/envio-cliente/{envio_id}/verificar", json=body or {},
                           headers=auth(token) if token else {})


def _mensajes(*mensajes):
    return {("GET", "conversations/55/messages"): {"payload": list(mensajes)}}


def test_verificar_marca_fallido_y_explica_el_motivo(app_client, db, admin_token, user_admin, monkeypatch):
    from app.core.textos_actividad import nombre_de_usuario
    fake = _preparar(monkeypatch, db, _mensajes(
        {"id": 900, "status": "read"},
        {"id": 901, "status": "failed", "content_attributes": {"external_error": "131047: Re-engagement message"}}))
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    actualizado = sc.updated_at
    envio = _envio_guardado(db, sc)
    resp = _verificar(app_client, admin_token, envio.id, {"user_name": "otro"})
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["envio_id"] == envio.id and data["estado"] == "FALLIDO" and data["verificado"] is True
    assert "24 horas" in data["texto"] and data["boton_manual"] is True
    [renglon] = _renglones(db, "SC", sc.id, "MENSAJE_CLIENTE")
    assert renglon.description == "El WhatsApp no le llegó al cliente"
    assert renglon.user_name == nombre_de_usuario(user_admin)  # RP15: de la sesion, no del body
    etiquetas = [c["etiqueta"] for c in renglon.extra_data["cambios"]]
    assert etiquetas == ["Número", "Motivo", "Qué hacer"] and all("campo" not in c for c in renglon.extra_data["cambios"])
    assert "24 horas" in renglon.extra_data["cambios"][1]["despues"]
    db.refresh(sc)
    assert sc.updated_at == actualizado  # C22: no reinicia el conteo de atraso
    db.refresh(envio)
    assert envio.estado == "FALLIDO"
    # FALLIDO es final: un segundo POST no consulta Chatwoot ni agrega otro renglon.
    n = len(fake.llamadas)
    resp = _verificar(app_client, admin_token, envio.id)
    assert resp.status_code == 200 and resp.json()["data"]["estado"] == "FALLIDO"
    assert len(fake.llamadas) == n and len(_renglones(db, "SC", sc.id, "MENSAJE_CLIENTE")) == 1


def test_el_que_hacer_de_un_whatsapp_fallido_es_el_mismo_en_los_tres_documentos(app_client, db, admin_token,
                                                                                  user_admin, monkeypatch):
    """F3 (M1): el renglón «Qué hacer» de un WhatsApp FALLIDO nombra el botón que de verdad existe en las pantallas
    («Reenviar al cliente», TEXTO_REENVIAR_AL_CLIENTE) y es el mismo texto para la SC, la COT y el PVEN. Antes la SC y la
    COT decían «Reenviar enlace de confirmación», un botón que F2 (M9/M22) quitó."""
    que_hacer = "Usa «Reenviar al cliente» y mándalo por otro medio."
    _preparar(monkeypatch, db, _mensajes(
        {"id": 901, "status": "failed", "content_attributes": {"external_error": "131047: Re-engagement message"}}))
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    cot = _cot(db, estado="PENDIENTE_CONFIRMACION")
    so = _pven(db)
    for tipo, doc, entidad in (("SC", sc, "SC"), ("COT", cot, "COT"), ("PVEN", so, "VEN")):
        envio = _envio_guardado(db, doc, tipo=tipo)
        resp = _verificar(app_client, admin_token, envio.id)
        assert resp.status_code == 200, (tipo, resp.text)
        assert resp.json()["data"]["estado"] == "FALLIDO", tipo
        [renglon] = _renglones(db, entidad, doc.id, "MENSAJE_CLIENTE")
        assert renglon.extra_data["cambios"][2] == {"etiqueta": "Qué hacer", "despues": que_hacer}, tipo


def test_verificar_entregado(app_client, db, admin_token, user_admin, vendedor_token, monkeypatch):
    fake = _preparar(monkeypatch, db, _mensajes({"id": 901, "status": "delivered"}))
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    envio = _envio_guardado(db, sc)
    resp = _verificar(app_client, vendedor_token, envio.id)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["estado"] == "ENTREGADO" and data["verificado"] is True and data["boton_manual"] is False
    [renglon] = _renglones(db, "SC", sc.id, "MENSAJE_CLIENTE")
    assert renglon.description == "El WhatsApp le llegó al cliente"
    assert renglon.extra_data["cambios"] == [{"etiqueta": "Número", "despues": LEGIBLE}]
    # Otra vez 'delivered': no hay renglon nuevo. 'sent' despues de entregado no retrocede.
    _verificar(app_client, vendedor_token, envio.id)
    fake.respuestas.update(_mensajes({"id": 901, "status": "sent"}))
    assert _verificar(app_client, vendedor_token, envio.id).json()["data"]["estado"] == "ENTREGADO"
    assert len(_renglones(db, "SC", sc.id, "MENSAJE_CLIENTE")) == 1
    # 'read': LEIDO una vez y ya no se consulta mas.
    fake.respuestas.update(_mensajes({"id": 901, "status": "read"}))
    assert _verificar(app_client, vendedor_token, envio.id).json()["data"]["estado"] == "LEIDO"
    n = len(fake.llamadas)
    assert _verificar(app_client, vendedor_token, envio.id).json()["data"]["estado"] == "LEIDO"
    assert len(fake.llamadas) == n
    assert [r.description for r in _renglones(db, "SC", sc.id, "MENSAJE_CLIENTE")] == [
        "El WhatsApp le llegó al cliente", "El cliente leyó el WhatsApp"]
    # Un pedido anota en la Actividad del pedido (VEN).
    so = _pven(db)
    envio_pven = _envio_guardado(db, so, tipo="PVEN")
    fake.respuestas.update(_mensajes({"id": 901, "status": "delivered"}))
    assert _verificar(app_client, vendedor_token, envio_pven.id).json()["data"]["estado"] == "ENTREGADO"
    assert len(_renglones(db, "VEN", so.id, "MENSAJE_CLIENTE")) == 1


def test_verificar_con_chatwoot_caido_no_cambia_nada(app_client, db, admin_token, user_admin, monkeypatch):
    import app.core.chatwoot as cw
    _preparar(monkeypatch, db, {("GET", "conversations/55/messages"): cw.ChatwootError(None, "no se pudo conectar")})
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    envio = _envio_guardado(db, sc)
    resp = _verificar(app_client, admin_token, envio.id)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["verificado"] is False and data["estado"] == "ENVIADO"
    assert data["texto"] == "No se pudo consultar Chatwoot ahora; vuelve a intentar."
    assert _renglones(db, "SC", sc.id, "MENSAJE_CLIENTE") == []
    # El mensaje no aparece en la conversacion (Chatwoot solo devuelve los recientes): tampoco cambia nada.
    _preparar(monkeypatch, db, _mensajes({"id": 1, "status": "read"}))
    data = _verificar(app_client, admin_token, envio.id).json()["data"]
    assert data["verificado"] is False and data["estado"] == "ENVIADO"
    assert _renglones(db, "SC", sc.id, "MENSAJE_CLIENTE") == []


def test_verificar_un_envio_por_correo_no_consulta_chatwoot(app_client, db, admin_token, user_admin, monkeypatch):
    fake = _preparar(monkeypatch, db, {})
    sc = _sc(db, user_admin)
    for campos in ({"canal": "Email", "chatwoot_conversation_id": None, "chatwoot_message_id": None},
                   {"estado": "NO_ENVIADO", "chatwoot_message_id": None}):
        envio = _envio_guardado(db, sc, **campos)
        resp = _verificar(app_client, admin_token, envio.id)
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["verificado"] is False
    assert fake.llamadas == [] and _renglones(db, "SC", sc.id, "MENSAJE_CLIENTE") == []


def test_traducir_error_whatsapp():
    from app.core.envio_whatsapp import traducir_error_whatsapp
    assert "no tiene WhatsApp" in traducir_error_whatsapp("131026: Message undeliverable")
    assert "plantilla" in traducir_error_whatsapp("132001")
    assert "24 horas" in traducir_error_whatsapp("131047: Re-engagement message")
    assert "limitó" in traducir_error_whatsapp("131048: Spam rate limit hit")
    assert "pago" in traducir_error_whatsapp("131042")
    assert "demasiados" in traducir_error_whatsapp("131056: pair rate limit")
    assert traducir_error_whatsapp("") == "WhatsApp rechazó el mensaje (sin detalle)"
    largo = traducir_error_whatsapp("Error raro " + "x" * 300)
    assert largo.startswith("WhatsApp rechazó el mensaje (Error raro") and len(largo) <= len(
        "WhatsApp rechazó el mensaje ()") + 120


def test_verificar_requiere_sesion(app_client, db, admin_token, user_admin, compras_token, monkeypatch):
    _preparar(monkeypatch, db, {})
    sc = _sc(db, user_admin)
    envio = _envio_guardado(db, sc)
    assert _verificar(app_client, None, envio.id).status_code in (401, 403)
    assert _verificar(app_client, compras_token, envio.id).status_code == 403
    resp = _verificar(app_client, admin_token, 999999999)
    assert resp.status_code == 404 and resp.json()["detail"] == "Envío no encontrado"


# ─── T20, Paso 1 (revisión de seguridad) ────────────────────────────────────────────────────────────────────

def test_verificar_fallido_no_guarda_el_enlace_del_error_de_whatsapp(app_client, db, admin_token, user_admin,
                                                                       monkeypatch):
    """T20 (M7): el external_error de Meta puede repetir el parámetro {{4}} (el enlace). La limpieza ya no depende de
    conocer el enlace (chatwoot.limpiar_detalle -> ocultar_tokens): la ruta /confirmar/<token> o /pedido/<token> y un
    token suelto de 43 caracteres se cambian por ENLACE_OCULTO. El token no queda en envios_al_cliente.detalle, en la
    Actividad ni en la respuesta de /verificar."""
    from app.core import chatwoot
    from app.core.envio_whatsapp import ENLACE_OCULTO
    from app.models.envios import EnvioAlCliente
    en_ruta = "Zx9-" * 10 + "abc"  # 43 caracteres de token_urlsafe(32)
    suelto = "-" + "Qw_8" * 10 + "zz"  # 43, empieza por '-' (un límite de palabra \b no lo vería)
    assert len(en_ruta) == len(suelto) == 43
    # T20 r2 (M0): también el enlace codificado en porcentaje (quote(url, safe='') y quote_plus).
    import urllib.parse
    codificado = "Kq_7" * 10 + "xyz"
    externo = (f"(#131008) Parameter value is not valid: https://erp.invalid/confirmar/{en_ruta}, "
               f"https://erp.invalid/pedido/{en_ruta[:25]} y {suelto}; "
               f"{urllib.parse.quote(f'https://erp.invalid/confirmar/{codificado}', safe='')}.")
    _preparar(monkeypatch, db, _mensajes(
        {"id": 901, "status": "failed", "content_attributes": {"external_error": externo}}))
    sc = _sc(db, user_admin, estado="PENDIENTE_CONFIRMACION")
    envio = _envio_guardado(db, sc)
    resp = _verificar(app_client, admin_token, envio.id)
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "FALLIDO"
    db.expire_all()
    fila = db.get(EnvioAlCliente, envio.id)
    [renglon] = _renglones(db, "SC", sc.id, "MENSAJE_CLIENTE")
    for texto in (resp.text, fila.detalle or "", json.dumps(renglon.extra_data, ensure_ascii=False),
                  renglon.description):
        for token in (en_ruta, suelto, en_ruta[:25], codificado):
            assert token not in texto, (token, texto)
    assert ENLACE_OCULTO in fila.detalle and "131008" in fila.detalle, fila.detalle
    # T20 r2 (M0): el esquema y el host se van con el enlace (no queda «https://host[enlace…]»).
    assert "erp.invalid" not in fila.detalle, fila.detalle
    codificado_plus = urllib.parse.quote_plus(f"https://erp.invalid/pedido/{codificado}")
    assert chatwoot.limpiar_detalle(codificado_plus) == ENLACE_OCULTO
    # Lo demás no se toca: un texto con 42 o 44 caracteres seguidos no es un token suelto.
    assert chatwoot.limpiar_detalle("a" * 42) == "a" * 42 and chatwoot.limpiar_detalle("b" * 44) == "b" * 44
    assert chatwoot.ENLACE_OCULTO is ENLACE_OCULTO == "[enlace de confirmación]"  # una sola definición
