"""Bloque 3, Tarea 20b (parte B, decisión del usuario en la revisión visual) — «el nombre cambió pero el contacto no».

GET /ventas/solicitudes/{id} y GET /ventas/cotizaciones/{id} traen nombre_cambio_sin_contacto (bool). Es True cuando,
desde el último envío para confirmación del documento (el created_at de su último enlace; si nunca se envió, desde que
se creó), la Actividad tiene un renglón de cambios con un cambio REAL de customer_name (no _mismo_nombre: tildes,
mayúsculas y espacios no cuentan) y, desde ese cambio, ningún renglón trae customer_phone, customer_email,
telefono_whatsapp ni cambia la ficha. La ventana de envío lo muestra como una nota que no bloquea nada.

La regla es una función pura (erp_ventas._nombre_cambio_sin_contacto) sobre los renglones (fecha, acción, extra_data),
sin leer el texto de ninguno, más una consulta (el último enlace).
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_nombre_sin_contacto
"""
import datetime
import uuid

CORREO = "ana@cliente.com"
TELEFONO = "3001112233"
RODILLOS = [{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 5000, "sku_id": 9}]
LINEA = {"product_name": "Cuna Colecho", "qty": 1, "unit_price_cop": 1000, "total_cop": 1000}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


def _sin_correo(monkeypatch):
    """Los envíos mandan correo (principal o de respaldo): nunca sale uno real."""
    import app.core.email as correo
    monkeypatch.setattr(correo, "send_email", lambda *a, **k: True)
    monkeypatch.setattr(correo, "smtp_configurado", lambda: True)


def _sc(db, user_admin, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    campos.setdefault("customer_phone", TELEFONO)
    campos.setdefault("customer_email", CORREO)
    sc = CustomerRequest(numero=f"SC-T20N{_sufijo()}", customer_name="Ana Pérez", advisor_user_id=user_admin.id,
                         advisor_name="Laura G.", productos=[dict(p) for p in RODILLOS], **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _ficha(db, nombre, telefono="3005550000"):
    from app.models.customers import Customer
    ficha = Customer(first_name=nombre, last_name="Prueba", phone=telefono,
                     email=f"t20b-{uuid.uuid4().hex[:8]}@test.nebulae")
    db.add(ficha); db.commit(); db.refresh(ficha)
    return ficha


def _enviar_sc(app_client, token, sc):
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(token))
    assert resp.status_code == 200, resp.text


def _editar_sc(app_client, token, sc, **body):
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={**body, "updated_by": "t"},
                            headers=auth(token))
    assert resp.status_code == 200, resp.text


def _corregir_contacto(app_client, token, sc, **body):
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}/cliente", json=body, headers=auth(token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["sin_cambios"] is False, resp.text


def _aviso_sc(app_client, token, sc):
    resp = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(token))
    assert resp.status_code == 200, resp.text
    valor = resp.json()["data"]["nombre_cambio_sin_contacto"]
    assert isinstance(valor, bool), valor
    return valor


# ─── La solicitud ─────────────────────────────────────────────────────────────────────────────────────────────

def test_sin_cambios_no_avisa(app_client, db, admin_token, user_admin, monkeypatch):
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    assert _aviso_sc(app_client, admin_token, sc) is False
    _enviar_sc(app_client, admin_token, sc)
    assert _aviso_sc(app_client, admin_token, sc) is False
    _editar_sc(app_client, admin_token, sc, notas="Llamar en la tarde")  # otro cambio, sin el nombre
    assert _aviso_sc(app_client, admin_token, sc) is False


def test_cambio_real_del_nombre_sin_contacto_avisa(app_client, db, admin_token, user_admin, monkeypatch):
    """Enviada a Ana; el asesor cambia el nombre a Beto por la API y el teléfono y el correo siguen siendo los de
    Ana."""
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    _enviar_sc(app_client, admin_token, sc)
    _editar_sc(app_client, admin_token, sc, customer_name="Beto Ruiz")
    assert _aviso_sc(app_client, admin_token, sc) is True


def test_nombre_y_telefono_no_avisa(app_client, db, admin_token, user_admin, monkeypatch):
    """Si después del cambio de nombre se corrige el teléfono (o el correo), ya no avisa. Un cambio de nombre posterior
    vuelve a avisar."""
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    _enviar_sc(app_client, admin_token, sc)
    _editar_sc(app_client, admin_token, sc, customer_name="Beto Ruiz")
    _corregir_contacto(app_client, admin_token, sc, customer_phone="3109998877")
    assert _aviso_sc(app_client, admin_token, sc) is False
    _editar_sc(app_client, admin_token, sc, customer_name="Carla Díaz")
    assert _aviso_sc(app_client, admin_token, sc) is True
    _corregir_contacto(app_client, admin_token, sc, customer_email="carla@cliente.com")
    assert _aviso_sc(app_client, admin_token, sc) is False


def test_solo_la_direccion_no_cuenta_como_contacto(app_client, db, admin_token, user_admin, monkeypatch):
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    _enviar_sc(app_client, admin_token, sc)
    _editar_sc(app_client, admin_token, sc, customer_name="Beto Ruiz")
    _corregir_contacto(app_client, admin_token, sc, customer_address="Calle 9 # 8-7")
    assert _aviso_sc(app_client, admin_token, sc) is True


def test_contacto_antes_del_nombre_si_avisa(app_client, db, admin_token, user_admin, monkeypatch):
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    _enviar_sc(app_client, admin_token, sc)
    _corregir_contacto(app_client, admin_token, sc, customer_phone="3109998877")
    assert _aviso_sc(app_client, admin_token, sc) is False
    _editar_sc(app_client, admin_token, sc, customer_name="Beto Ruiz")
    assert _aviso_sc(app_client, admin_token, sc) is True


def test_cambio_cosmetico_no_avisa(app_client, db, admin_token, user_admin, monkeypatch):
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    _enviar_sc(app_client, admin_token, sc)
    for nombre in ("ana perez", "  ANA   PÉREZ "):
        _editar_sc(app_client, admin_token, sc, customer_name=nombre)
        assert _aviso_sc(app_client, admin_token, sc) is False, nombre


def test_reenviar_apaga_el_aviso(app_client, db, admin_token, user_admin, monkeypatch):
    """El cambio real del nombre reinicia Gate 1 (r1b): vuelve a Asignada. Al reenviarla, el aviso ya no sale."""
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin)
    _enviar_sc(app_client, admin_token, sc)
    _editar_sc(app_client, admin_token, sc, customer_name="Beto Ruiz")
    assert _aviso_sc(app_client, admin_token, sc) is True
    _enviar_sc(app_client, admin_token, sc)
    assert _aviso_sc(app_client, admin_token, sc) is False


def test_sin_enviar_cuenta_desde_la_creacion(app_client, db, admin_token, user_admin):
    sc = _sc(db, user_admin)
    _editar_sc(app_client, admin_token, sc, customer_name="Beto Ruiz")
    assert _aviso_sc(app_client, admin_token, sc) is True


def test_cambiar_la_ficha_no_avisa(app_client, db, admin_token, user_admin, monkeypatch):
    """Elegir otra ficha trae su teléfono y su correo (B7): el contacto también cambió."""
    _sin_correo(monkeypatch)
    ficha_a, ficha_b = _ficha(db, "Ana"), _ficha(db, "Beto")
    sc = _sc(db, user_admin, customer_id=ficha_a.id, customer_email=ficha_a.email, customer_phone=ficha_a.phone)
    _enviar_sc(app_client, admin_token, sc)
    _editar_sc(app_client, admin_token, sc, customer_id=ficha_b.id, customer_name="Beto Prueba")
    assert _aviso_sc(app_client, admin_token, sc) is False


# ─── La cotización (su nombre también se cambia por update_cotizacion) ──────────────────────────────────────────

def _cot(db, sc):
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero=f"COT-T20N{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_name="Ana Pérez",
                         customer_email=CORREO, customer_phone=TELEFONO, estado="BORRADOR", productos=[dict(LINEA)],
                         subtotal_cop=1000, total_cop=1000)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _editar_cot(app_client, token, cot, **body):
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={**body, "updated_by": "t"},
                            headers=auth(token))
    assert resp.status_code == 200, resp.text


def _aviso_cot(app_client, token, cot):
    resp = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(token))
    assert resp.status_code == 200, resp.text
    valor = resp.json()["data"]["nombre_cambio_sin_contacto"]
    assert isinstance(valor, bool), valor
    return valor


def test_la_cotizacion_tiene_el_mismo_aviso(app_client, db, admin_token, user_admin, monkeypatch):
    _sin_correo(monkeypatch)
    sc = _sc(db, user_admin, estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow())
    cot = _cot(db, sc)
    assert _aviso_cot(app_client, admin_token, cot) is False
    _editar_cot(app_client, admin_token, cot, customer_name="Beto Ruiz")
    assert _aviso_cot(app_client, admin_token, cot) is True
    _editar_cot(app_client, admin_token, cot, customer_name="beto ruiz")  # cosmético: ni apaga ni prende
    assert _aviso_cot(app_client, admin_token, cot) is True
    # El nombre y el teléfono en el mismo PATCH.
    _editar_cot(app_client, admin_token, cot, customer_name="Carla Díaz", customer_phone="3109998877")
    assert _aviso_cot(app_client, admin_token, cot) is False
    _editar_cot(app_client, admin_token, cot, customer_name="Dora Paz")
    assert _aviso_cot(app_client, admin_token, cot) is True
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={"canal": "Email"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert _aviso_cot(app_client, admin_token, cot) is False


# ─── La regla pura ────────────────────────────────────────────────────────────────────────────────────────────

def test_la_regla_pura_no_lee_el_texto_de_los_renglones():
    from app.api.v1.erp_ventas import _nombre_cambio_sin_contacto
    from app.core.cambios_documento import ACCION_CLIENTE_CAMBIADO
    t0 = datetime.datetime(2026, 10, 22, 12, 0, 0)

    def r(minuto, *cambios, accion="UPDATED", extra=None):
        return (t0 + datetime.timedelta(minutes=minuto), accion,
                extra if extra is not None else {"cambios": [dict(c) for c in cambios]})

    nombre = {"campo": "customer_name", "antes": "Ana Pérez", "despues": "Beto Ruiz"}
    tilde = {"campo": "customer_name", "antes": "Ana Perez", "despues": "ana  pérez"}
    for campo in ("customer_phone", "customer_email", "telefono_whatsapp", "customer_id"):
        contacto = {"campo": campo, "antes": "1", "despues": "2"}
        assert _nombre_cambio_sin_contacto([r(1, nombre), r(2, contacto)], None) is False, campo
        assert _nombre_cambio_sin_contacto([r(1, nombre, contacto)], None) is False, campo
        assert _nombre_cambio_sin_contacto([r(1, contacto), r(2, nombre)], None) is True, campo
    assert _nombre_cambio_sin_contacto([], None) is False
    assert _nombre_cambio_sin_contacto([r(1, nombre)], None) is True
    assert _nombre_cambio_sin_contacto([r(1, tilde)], None) is False
    assert _nombre_cambio_sin_contacto([r(1, nombre), r(2, tilde)], None) is True
    # Solo cuenta lo posterior al último envío.
    assert _nombre_cambio_sin_contacto([r(1, nombre)], t0 + datetime.timedelta(minutes=1)) is False
    assert _nombre_cambio_sin_contacto([r(1, nombre)], t0) is True
    # La dirección no es contacto; el marcador de cambio de ficha de update_solicitud sí apaga el aviso.
    direccion = {"campo": "customer_address", "antes": "a", "despues": "b"}
    assert _nombre_cambio_sin_contacto([r(1, nombre), r(2, direccion)], None) is True
    assert _nombre_cambio_sin_contacto([r(1, nombre), r(2, accion=ACCION_CLIENTE_CAMBIADO, extra={})], None) is False
    # Renglones sin cambios, con datos viejos malformados o con otra acción no cambian nada (ni dependen del texto).
    raros = [r(2, extra=None), r(2, accion="NOTA", extra={"nota": "Beto Ruiz cambió el teléfono"}),
             (t0 + datetime.timedelta(minutes=2), "NOTA", None), r(3, extra={"cambios": "x"}),
             r(4, extra={"cambios": [None, 5, {"campo": None}]}), r(5, extra=["customer_phone"])]
    assert _nombre_cambio_sin_contacto([r(1, nombre)] + raros, None) is True
    assert _nombre_cambio_sin_contacto(raros, None) is False
