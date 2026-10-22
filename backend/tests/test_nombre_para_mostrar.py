"""Bloque 3, Tarea 20b (parte A, decisión del usuario en la revisión visual) — el «Nombre para mostrar» del asesor.

- users.nombre_para_mostrar (fa6_032): lo llena la Administración con PATCH /auth/users/{id}/nombre-para-mostrar
  {"nombre_para_mostrar": str | null}, solo ADMIN (otro rol: 403; un usuario que no existe: 404 «Usuario no
  encontrado»). La regla es la función pura app.core.nombre_para_mostrar.validar_nombre_para_mostrar: los espacios
  de los bordes se quitan y los de adentro se juntan; vacío -> null; entre 2 y 80 caracteres; sin caracteres de
  control; sin '@'; nunca el correo ni el usuario de entrada de ningún User (sin mayúsculas). Si falla, 400 con el
  texto exacto del brief.
- UserResponse lo expone: GET /auth/users y /auth/me.
- Lo que ve el cliente (documento_cliente.asesor_publico, el único resolvedor): si la SC tiene advisor_user_id y ese
  User tiene un nombre_para_mostrar válido, ese nombre; si no, la regla de siempre (nombre_asesor_publico sobre
  advisor_name); si no queda nada, «Tu asesor». Vale para /confirmar/ver (SC y COT), /pedido-cliente/ver, ¿Qué
  sigue?, pedir cambios, 'cambios_enviados' y el PDF (vía atendido_por).

Los símbolos nuevos se importan DENTRO de cada prueba (el runner importa el módulo fuera de un try).
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_nombre_para_mostrar
"""
import datetime
import uuid

from test_pdf_documento import _sin_comprimir, _textos_pdf

MENSAJE = ("Escribe el nombre como lo verá el cliente (por ejemplo, «Laura Gómez»), sin correos ni nombres de "
           "usuario.")
MENSAJE_LARGO = "El nombre para mostrar debe tener entre 2 y 80 caracteres."
NOMBRE = "Laura Gómez"
MOD_60_40 = "60/40 (60% anticipo - 40% pendiente)"
RODILLOS = [{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 5000, "sku_id": 9}]
PRODUCTOS = [{"product_name": "Sofá", "qty": 2, "unit_price_cop": 400000, "total_cop": 800000},
             {"product_name": "Mesa", "qty": 1, "unit_price_cop": 200000, "total_cop": 200000}]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


def _sin_correo(monkeypatch):
    """enviar-confirmacion y el aviso al asesor mandan correo: nunca sale uno real."""
    import app.core.email as correo
    monkeypatch.setattr(correo, "send_email", lambda *a, **k: True)


def _patch(app_client, token, user_id, valor):
    return app_client.patch(f"/api/v1/auth/users/{user_id}/nombre-para-mostrar", json={"nombre_para_mostrar": valor},
                            headers=auth(token))


def _otro_usuario(db):
    """Un User con su usuario de entrada (auth.py acepta el correo o el username), dentro de la transacción."""
    from app.models.users import User
    s = _sufijo().lower()
    u = User(email=f"otro-{s}@test.nebulae", username=f"otro_{s}", password_hash="x", role="Vendedor", is_active=True)
    db.add(u); db.commit(); db.refresh(u)
    return u


def _con_nombre(app_client, admin_token, db, usuario, nombre=NOMBRE):
    resp = _patch(app_client, admin_token, usuario.id, nombre)
    assert resp.status_code == 200, resp.text
    db.expire_all()
    return usuario


def _sc(db, asesor, **campos):
    """Una SC ASIGNADA a `asesor` (advisor_user_id) con advisor_name = su CORREO, como la guardan los formularios."""
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    campos.setdefault("advisor_name", asesor.email)
    sc = CustomerRequest(numero=f"SC-T20B{_sufijo()}", customer_name="Ana Pérez", advisor_user_id=asesor.id,
                         productos=[dict(p) for p in RODILLOS], modalidad_pago=MOD_60_40, **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, sc, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "PENDIENTE_CONFIRMACION")
    cot = SalesQuotation(numero=f"COT-T20B{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_name="Ana Pérez",
                         productos=[dict(p) for p in PRODUCTOS], subtotal_cop=1000000, total_cop=1000000,
                         anticipo_cop=600000, **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _pedido(db, sc, cot):
    from app.models.erp_documents import SaleOrder
    so = SaleOrder(numero=f"PVEN-T20B{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, cot_id=cot.id,
                   cot_numero=cot.numero, customer_name="Ana Pérez", productos=[dict(p) for p in PRODUCTOS],
                   subtotal_cop=1000000, total_cop=1000000, saldo_cop=1000000, anticipo_cop=0,
                   anticipo_pct_snapshot=60, estado="PENDIENTE_COMPRA")
    db.add(so); db.commit(); db.refresh(so)
    return so


def _enlace_pven(db, so_id):
    from app.core.confirmation_tokens import create_confirmation_token
    from app.core.fechas import hoy_colombia, vence_al_final_del_dia
    return create_confirmation_token(db, "PVEN", so_id, expires_at=vence_al_final_del_dia(
        hoy_colombia() + datetime.timedelta(days=30)))


def _enviar(app_client, admin_token, sc):
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    return resp.json()["link_confirmacion"].rsplit("/", 1)[-1]


def _ver(app_client, raw):
    return app_client.post("/api/v1/confirmar/ver", json={"token": raw})


def _confirmar(app_client, raw):
    return app_client.post("/api/v1/confirmar/confirmar", json={"token": raw},
                           headers={"Idempotency-Key": f"t20b-{uuid.uuid4().hex[:8]}"})


def _pedir_cambios(app_client, raw):
    return app_client.post("/api/v1/confirmar/pedir-cambios", json={"token": raw, "comentario": "Son 8 rodillos"},
                           headers={"Idempotency-Key": f"t20b-{uuid.uuid4().hex[:8]}"})


# ─── El PATCH (solo ADMIN) y su regla ─────────────────────────────────────────────────────────────────────────

def test_solo_admin_cambia_el_nombre_para_mostrar(app_client, db, admin_token, user_vendedor, vendedor_token):
    """ADMIN sí; otro rol, 403 sin escribir nada. Los espacios se limpian y el nombre sale en /auth/users y /auth/me."""
    from app.models.users import User
    resp = _patch(app_client, vendedor_token, user_vendedor.id, NOMBRE)
    assert resp.status_code == 403, resp.text
    db.expire_all()
    assert db.get(User, user_vendedor.id).nombre_para_mostrar is None

    resp = _patch(app_client, admin_token, user_vendedor.id, "   Laura    Gómez  ")
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["nombre_para_mostrar"] == NOMBRE
    assert resp.json()["data"]["id"] == user_vendedor.id
    db.expire_all()
    assert db.get(User, user_vendedor.id).nombre_para_mostrar == NOMBRE

    lista = app_client.get("/api/v1/auth/users", headers=auth(admin_token)).json()["data"]
    fila = next(u for u in lista if u["id"] == user_vendedor.id)
    assert fila["nombre_para_mostrar"] == NOMBRE
    assert all("nombre_para_mostrar" in u for u in lista)
    yo = app_client.get("/api/v1/auth/me", headers=auth(vendedor_token)).json()["data"]
    assert yo["nombre_para_mostrar"] == NOMBRE


def test_vacio_o_null_borra_el_nombre(app_client, db, admin_token, user_vendedor):
    """Vacío o null lo borran. Sin la clave (o con un número) es un cuerpo inválido: 400 y no se borra nada."""
    from app.models.users import User
    for valor in ("", "    ", None):
        _con_nombre(app_client, admin_token, db, user_vendedor)
        resp = _patch(app_client, admin_token, user_vendedor.id, valor)
        assert resp.status_code == 200, (valor, resp.text)
        assert resp.json()["data"]["nombre_para_mostrar"] is None, valor
        db.expire_all()
        assert db.get(User, user_vendedor.id).nombre_para_mostrar is None, valor
    _con_nombre(app_client, admin_token, db, user_vendedor)
    for cuerpo in ({}, {"nombre_para_mostrar": 5}, {"otro": "Laura"}):
        resp = app_client.patch(f"/api/v1/auth/users/{user_vendedor.id}/nombre-para-mostrar", json=cuerpo,
                                headers=auth(admin_token))
        assert resp.status_code == 400, (cuerpo, resp.text)
        db.expire_all()
        assert db.get(User, user_vendedor.id).nombre_para_mostrar == NOMBRE, cuerpo


def test_correos_y_usuarios_de_entrada_dan_400(app_client, db, admin_token, user_vendedor):
    """'@' (también el de ancho completo), el correo o el usuario de entrada de otro User (sin mayúsculas ni espacios)
    y los caracteres de control dan 400 con el texto exacto, sin escribir nada."""
    from app.models.users import User
    otro = _otro_usuario(db)
    _con_nombre(app_client, admin_token, db, user_vendedor)
    malos = ["laura@empresa.com", "laura@", "Laura ＠ empresa", otro.email, otro.email.upper(), otro.username,
             f"  {otro.username.upper()} ", user_vendedor.email, "Laura\x00Gómez", "Laura\tGómez", "Laura\nGómez",
             "Laura‮Gómez", "Laura​Gómez"]
    for valor in malos:
        resp = _patch(app_client, admin_token, user_vendedor.id, valor)
        assert resp.status_code == 400, (valor, resp.text)
        assert resp.json()["detail"] == MENSAJE, (valor, resp.text)
    db.expire_all()
    assert db.get(User, user_vendedor.id).nombre_para_mostrar == NOMBRE  # ninguno se guardó

    # Un surrogate suelto (llegado como escape JSON) tampoco escribe nada ni da 500.
    resp = app_client.patch(f"/api/v1/auth/users/{user_vendedor.id}/nombre-para-mostrar",
                            content='{"nombre_para_mostrar": "Laura \\ud800"}',
                            headers={**auth(admin_token), "Content-Type": "application/json"})
    assert resp.status_code == 400, resp.text
    db.expire_all()
    assert db.get(User, user_vendedor.id).nombre_para_mostrar == NOMBRE


def test_largo_entre_2_y_80(app_client, db, admin_token, user_vendedor):
    for valor in ("L", "  L  ", "a" * 81, "Laura " + "x" * 76):
        resp = _patch(app_client, admin_token, user_vendedor.id, valor)
        assert resp.status_code == 400, (valor, resp.text)
        assert resp.json()["detail"] == MENSAJE_LARGO, (valor, resp.text)
    for valor in ("Lu", "a" * 80, "  " + "b" * 80 + "  "):
        resp = _patch(app_client, admin_token, user_vendedor.id, valor)
        assert resp.status_code == 200, (valor, resp.text)
        assert resp.json()["data"]["nombre_para_mostrar"] == valor.strip(), valor


def test_usuario_que_no_existe_da_404(app_client, admin_token):
    resp = _patch(app_client, admin_token, 2_000_000_000, NOMBRE)
    assert resp.status_code == 404, resp.text
    assert resp.json()["detail"] == "Usuario no encontrado"


def test_validar_nombre_para_mostrar_es_pura():
    """La regla sin base: el endpoint le pasa cómo saber si un texto es el correo o el usuario de algún User."""
    from app.core.nombre_para_mostrar import NombreParaMostrarInvalido, validar_nombre_para_mostrar
    ocupados = {"laura_g", "ana"}

    def es_de_un_usuario(clave):
        return clave in ocupados

    assert validar_nombre_para_mostrar("  Laura   Gómez ", es_de_un_usuario) == NOMBRE
    assert validar_nombre_para_mostrar("Laura Gómez", es_de_un_usuario) == NOMBRE  # el espacio duro se junta
    for vacio in (None, "", "   "):
        assert validar_nombre_para_mostrar(vacio, es_de_un_usuario) is None
    for valor, mensaje in (("L", MENSAJE_LARGO), ("x" * 81, MENSAJE_LARGO), ("laura@x.co", MENSAJE),
                           (" LAURA_G ", MENSAJE), ("Ana", MENSAJE), ("Laura\x07", MENSAJE), ("Laura \ud800", MENSAJE),
                           (5, MENSAJE)):
        try:
            validar_nombre_para_mostrar(valor, es_de_un_usuario)
        except NombreParaMostrarInvalido as exc:
            assert exc.mensaje == mensaje, (valor, exc.mensaje)
        else:
            raise AssertionError(f"debía fallar: {valor!r}")
    assert validar_nombre_para_mostrar("Ana María", es_de_un_usuario) == "Ana María"


# ─── Lo que ve el cliente ─────────────────────────────────────────────────────────────────────────────────────

def test_el_cliente_ve_el_nombre_para_mostrar(app_client, db, admin_token, user_vendedor, monkeypatch):
    """Con «Laura Gómez» de nombre para mostrar y advisor_name = el correo del asesor: /confirmar/ver de la SC y de la
    COT, /pedido-cliente/ver, ¿Qué sigue?, pedir cambios, 'cambios_enviados' y el PDF dicen «Laura Gómez», nunca el
    correo."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.core.documento_cliente import documento_cot, documento_pven
    from app.core.empresa import perfil_publico
    from app.core.pdf_documento import pdf_documento
    _sin_correo(monkeypatch)
    _sin_comprimir(monkeypatch)
    asesor = _con_nombre(app_client, admin_token, db, user_vendedor)
    correo = asesor.email.casefold()

    def sin_correo(resp):
        assert correo not in resp.text.casefold(), resp.text
        return resp

    sc = _sc(db, asesor)
    raw = _enviar(app_client, admin_token, sc)
    resp = sin_correo(_ver(app_client, raw))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["documento"]["atendido_por"] == NOMBRE
    resp = sin_correo(_confirmar(app_client, raw))
    assert resp.status_code == 200, resp.text
    assert resp.json()["siguiente_paso"][0] == f"{NOMBRE} prepara tu cotización con los precios."
    assert resp.json()["data"]["documento"]["atendido_por"] == NOMBRE
    detalle = sin_correo(_ver(app_client, raw)).json()["detail"]
    assert detalle["estado_enlace"] == "confirmada", detalle
    assert detalle["siguiente_paso"][0] == f"{NOMBRE} prepara tu cotización con los precios."

    # La COT y el pedido de esa SC (el asesor sale de la SC, como hoy).
    cot = _cot(db, sc)
    resp = sin_correo(_ver(app_client, create_confirmation_token(db, "COT", cot.id)))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["documento"]["atendido_por"] == NOMBRE
    so = _pedido(db, sc, cot)
    resp = sin_correo(app_client.post("/api/v1/pedido-cliente/ver", json={"token": _enlace_pven(db, so.id)}))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["atendido_por"] == NOMBRE

    # El PDF de la COT y del pedido.
    perfil = perfil_publico(db)
    for documento in (documento_cot(db, cot), documento_pven(db, so)):
        texto = _textos_pdf(pdf_documento(documento, perfil, None))
        assert "Atendido por:" in texto and NOMBRE in texto, texto
        assert correo not in texto.casefold(), texto

    # Pedir cambios (el 200) y el enlace reabierto ('cambios_enviados').
    otra = _sc(db, asesor)
    raw = _enviar(app_client, admin_token, otra)
    resp = sin_correo(_pedir_cambios(app_client, raw))
    assert resp.status_code == 200, resp.text
    assert resp.json()["detalle"] == f"{NOMBRE} ajustará tu solicitud y te enviará un enlace nuevo."
    detalle = sin_correo(_ver(app_client, raw)).json()["detail"]
    assert detalle["estado_enlace"] == "cambios_enviados", detalle
    assert detalle["mensaje"].endswith(f"{NOMBRE} ajustará la solicitud y te enviará un enlace nuevo."), detalle

    # Pedir cambios de la COT (el asesor de su SC, confirmada).
    tercera = _sc(db, asesor, estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow())
    cot_b = _cot(db, tercera)
    resp = sin_correo(_pedir_cambios(app_client, create_confirmation_token(db, "COT", cot_b.id)))
    assert resp.status_code == 200, resp.text
    assert resp.json()["detalle"] == f"{NOMBRE} ajustará tu cotización y te enviará un enlace nuevo."


def test_sin_nombre_para_mostrar_sigue_tu_asesor(app_client, db, admin_token, user_vendedor, monkeypatch):
    """Sin nombre para mostrar y advisor_name = el correo: «Tu asesor», como hoy (C0 de T20). Un advisor_name que no es
    de nadie ('Laura G.') sigue saliendo."""
    _sin_correo(monkeypatch)
    sc = _sc(db, user_vendedor)
    raw = _enviar(app_client, admin_token, sc)
    resp = _ver(app_client, raw)
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["documento"]["atendido_por"] is None
    resp = _confirmar(app_client, raw)
    assert resp.json()["siguiente_paso"][0] == "Tu asesor prepara tu cotización con los precios."
    assert user_vendedor.email.casefold() not in resp.text.casefold()
    otra = _sc(db, user_vendedor)
    resp = _pedir_cambios(app_client, _enviar(app_client, admin_token, otra))
    assert resp.json()["detalle"] == "Tu asesor ajustará tu solicitud y te enviará un enlace nuevo."

    con_nombre_libre = _sc(db, user_vendedor, advisor_name="Laura G.")
    resp = _ver(app_client, _enviar(app_client, admin_token, con_nombre_libre))
    assert resp.json()["data"]["documento"]["atendido_por"] == "Laura G."


def test_asesor_publico(db, user_vendedor):
    """El único resolvedor: el nombre para mostrar del User de advisor_user_id si es válido HOY (un dato guardado que
    después coincide con el usuario de entrada de alguien, o que llegó sin pasar por la regla, no sale); si no,
    nombre_asesor_publico(advisor_name); si no, None."""
    from types import SimpleNamespace
    from app.core.documento_cliente import asesor_publico
    otro = _otro_usuario(db)
    assert asesor_publico(db, None) is None
    assert asesor_publico(db, SimpleNamespace(advisor_name=None)) is None
    assert asesor_publico(db, SimpleNamespace(advisor_name=" Laura G. ")) == "Laura G."
    sc = SimpleNamespace(advisor_user_id=user_vendedor.id, advisor_name=user_vendedor.email)
    assert asesor_publico(db, sc) is None
    for guardado, esperado in ((NOMBRE, NOMBRE), (" Laura   Gómez ", NOMBRE), (otro.username, None),
                               ("laura@empresa.com", None), ("Laura\x07", None), ("", None)):
        user_vendedor.nombre_para_mostrar = guardado
        db.commit()
        assert asesor_publico(db, sc) == esperado, guardado
        # Sin nombre válido, la regla de siempre sobre advisor_name.
        assert asesor_publico(db, SimpleNamespace(advisor_user_id=user_vendedor.id, advisor_name="Laura G.")) == (
            esperado or "Laura G."), guardado
    assert asesor_publico(db, SimpleNamespace(advisor_user_id=2_000_000_000, advisor_name="Laura G.")) == "Laura G."
