"""H21 (Bloque 2, T5): corregir los datos de contacto del cliente desde la solicitud.

PATCH /api/v1/ventas/solicitudes/{id}/cliente corrige telefono, correo, direccion y ciudad en la SC, en la ficha del
cliente (si la SC esta vinculada) y en la COT y el PVEN abiertos de esa SC (R6) que no son de otro cliente (ronda 1:
esos no se tocan y se informan), con un renglon en la Actividad de cada uno y en el historial del cliente (perfil 360).
Un correo de otro cliente -> 409 sin tocar nada. El autor sale de la sesion (R9). R18: si cambia el correo o el
telefono de la SC se aplica la misma regla de Gate 1 que update_solicitud (cambio de cliente), y el enlace vivo de una
COT propagada se anula (enlaces_anulados solo cuenta los que el cliente todavia podia usar). Todo en un solo commit.
Tambien: PUT /crm/customers/{id} (409 por correo repetido, limites, historial) y lo que ve cada rol del historial en el
360.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_solicitud_corregir_datos_cliente
"""
import datetime
import hashlib
import uuid

from tests.usuarios_de_prueba import bodega_token, compras_token  # noqa: F401  (fixtures)

LINEA = {"product_name": "Cuna Colecho", "qty": 1}
MOTIVO_CONTACTO = ("cambió el correo o el teléfono del cliente, así que su confirmación ya no es válida y hay que "
                   "enviarle la solicitud de nuevo")
ENLACE_COT_ANULADO = {"etiqueta": "Enlace de confirmación",
                      "despues": "Se anuló el enlace enviado al dato anterior: pasa la cotización a Borrador y envíala "
                                 "de nuevo"}
CLAVES_RESPUESTA = {"status", "data", "ficha_actualizada", "documentos_actualizados", "documentos_de_otro_cliente",
                    "confirmacion_anulada", "estado_cambiado", "enlaces_anulados", "sin_cambios"}
AVISO_CONTACTO_CON_COT = ("Cambió el correo o el teléfono del cliente: la confirmación de la solicitud ya no vale. La "
                          "cotización activa sigue igual; si necesitas otra cotización, envíale la solicitud de nuevo "
                          "para que la confirme.")


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _u():
    return uuid.uuid4().hex[:6]


def _cliente(db, **campos):
    from app.models.customers import Customer
    campos.setdefault("first_name", "Ana")
    campos.setdefault("last_name", "Prueba")
    c = Customer(**campos)
    db.add(c); db.commit(); db.refresh(c)
    return c


def _sc(db, numero, user_admin, cliente=None, **campos):
    """SC por ORM (ASIGNADA con asesor por defecto). Con `cliente`, vinculada a su ficha y con sus mismos datos."""
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    campos.setdefault("productos", [LINEA])
    campos.setdefault("advisor_user_id", user_admin.id)
    campos.setdefault("advisor_name", user_admin.email if campos["advisor_user_id"] else None)
    if cliente is not None:
        campos.setdefault("customer_id", cliente.id)
        campos.setdefault("customer_phone", cliente.phone)
        campos.setdefault("customer_email", cliente.email)
        campos.setdefault("customer_address", cliente.address)
    sc = CustomerRequest(numero=numero, customer_name="Ana Prueba", **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, sc, **campos):
    from app.models.erp_documents import SalesQuotation
    for k in ("customer_id", "customer_phone", "customer_email", "customer_address"):
        campos.setdefault(k, getattr(sc, k))
    campos.setdefault("estado", "BORRADOR")
    cot = SalesQuotation(numero=numero, sc_id=sc.id, sc_numero=sc.numero, customer_name=sc.customer_name,
                         productos=[LINEA], total_cop=100000, **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _pven(db, numero, estado, sc=None, cot=None, telefono="3000000000"):
    from app.models.erp_documents import SaleOrder
    v = SaleOrder(numero=numero, sc_id=sc.id if sc else None, sc_numero=sc.numero if sc else None,
                  cot_id=cot.id if cot else None, cot_numero=cot.numero if cot else None,
                  customer_name="Ana Prueba", customer_phone=telefono, estado=estado, productos=[LINEA])
    db.add(v); db.commit(); db.refresh(v)
    return v


def _patch(app_client, token, sc_id, **body):
    return app_client.patch(f"/api/v1/ventas/solicitudes/{sc_id}/cliente", json=body, headers=auth(token))


def _logs(db, entidad, entity_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entity_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def _token_usado(db, raw):
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    return db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.token_hash == hashlib.sha256(raw.encode()).hexdigest()).first().used_at is not None


def _etiquetas(cambios):
    return [c["etiqueta"] for c in cambios]


# --- 1-7: corregir, ciudad, sin ficha, correo repetido, validaciones, cancelada, sin cambios ---------------------

def test_corregir_telefono_y_correo_actualiza_la_solicitud_y_la_ficha(app_client, db, admin_token, user_admin):
    from app.core.textos_actividad import nombre_de_usuario
    u = _u()
    cli = _cliente(db, phone="3000000000", email=f"ana.vieja-{u}@test.com")
    sc = _sc(db, "SC-CDC001", user_admin, cliente=cli)

    resp = _patch(app_client, admin_token, sc.id, customer_phone="3001112233",
                  customer_email=f" Ana.Nueva-{u}@Test.com ", updated_by="asesor@test")
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert set(cuerpo) == CLAVES_RESPUESTA
    assert cuerpo["ficha_actualizada"] is True and cuerpo["sin_cambios"] is False
    assert cuerpo["documentos_actualizados"] == [] and cuerpo["enlaces_anulados"] == []
    assert cuerpo["confirmacion_anulada"] is False and cuerpo["estado_cambiado"] is False  # ASIGNADA: nada que anular
    assert cuerpo["data"]["customer_phone"] == "3001112233"
    assert cuerpo["data"]["customer_email"] == f"ana.nueva-{u}@test.com"
    assert "customer_city" in cuerpo["data"]

    db.expire_all()
    assert (sc.customer_phone, sc.customer_email) == ("3001112233", f"ana.nueva-{u}@test.com")
    assert (cli.phone, cli.email) == ("3001112233", f"ana.nueva-{u}@test.com")

    logs_sc = _logs(db, "SC", sc.id, "UPDATED")
    assert len(logs_sc) == 1
    log = logs_sc[0]
    assert log.description.startswith("Datos del cliente corregidos: Teléfono, Correo")
    assert "ficha del cliente" in log.description
    assert _etiquetas(log.extra_data["cambios"]) == ["Teléfono", "Correo"]
    assert log.extra_data["cambios"][1]["antes"] == f"ana.vieja-{u}@test.com"
    assert log.extra_data["ficha_cliente_id"] == cli.id and log.extra_data["documentos"] == []
    assert log.user_name == nombre_de_usuario(user_admin)  # R9: el autor sale de la sesion, no de updated_by

    logs_cli = _logs(db, "CLIENTE", cli.id)
    assert len(logs_cli) == 1
    assert logs_cli[0].action == "UPDATED" and sc.numero in logs_cli[0].description
    assert logs_cli[0].description.startswith(f"Datos de contacto corregidos desde la solicitud {sc.numero}: ")
    assert logs_cli[0].entity_numero == f"CLI-{cli.id:04d}"
    assert logs_cli[0].user_name == nombre_de_usuario(user_admin)
    assert logs_cli[0].extra_data["origen"] == {"tipo": "SC", "id": sc.id, "numero": sc.numero}
    assert _etiquetas(logs_cli[0].extra_data["cambios"]) == ["Teléfono", "Correo"]


def test_la_ciudad_se_guarda_en_la_ficha_y_se_ve_en_el_detalle(app_client, db, admin_token, user_admin):
    cli = _cliente(db, phone="3000000000", email=f"ana-{_u()}@test.com", city="Cali")
    sc = _sc(db, "SC-CDC002", user_admin, cliente=cli)

    resp = _patch(app_client, admin_token, sc.id, customer_city="  Medellín ")
    assert resp.status_code == 200, resp.text
    assert resp.json()["ficha_actualizada"] is True
    assert resp.json()["data"]["customer_city"] == "Medellín"
    db.expire_all()
    assert cli.city == "Medellín"

    detalle = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token))
    assert detalle.json()["data"]["customer_city"] == "Medellín"

    log = _logs(db, "SC", sc.id, "UPDATED")[-1]
    assert log.description.startswith("Datos del cliente corregidos: Ciudad")
    ciudad = [c for c in log.extra_data["cambios"] if c["etiqueta"] == "Ciudad"]
    assert ciudad == [{"campo": "customer_city", "etiqueta": "Ciudad", "antes": "Cali", "despues": "Medellín"}]


def test_solicitud_sin_ficha_solo_corrige_la_solicitud(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import ActivityLog
    sc = _sc(db, "SC-CDC003", user_admin, customer_phone="3000000000")

    resp = _patch(app_client, admin_token, sc.id, customer_phone="3001112233")
    assert resp.status_code == 200, resp.text
    assert resp.json()["ficha_actualizada"] is False
    assert resp.json()["data"]["customer_city"] is None
    db.expire_all()
    assert sc.customer_phone == "3001112233"
    log = _logs(db, "SC", sc.id, "UPDATED")[-1]
    assert log.description == "Datos del cliente corregidos: Teléfono"  # sin «También se corrigieron en…»
    assert log.extra_data["ficha_cliente_id"] is None
    assert db.query(ActivityLog).filter(ActivityLog.entity_type == "CLIENTE",
                                        ActivityLog.description.contains(sc.numero)).count() == 0

    resp = _patch(app_client, admin_token, sc.id, customer_city="Cali")
    assert resp.status_code == 422
    assert resp.json()["detail"] == ("Esta solicitud no está vinculada a una ficha de cliente: la ciudad se guarda en "
                                     "la ficha.")
    detalle = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]
    assert detalle["customer_city"] is None


def test_correo_de_otro_cliente_se_rechaza_sin_tocar_nada(app_client, db, admin_token, user_admin):
    u = _u()
    _cliente(db, first_name="Otra", last_name="Persona", email=f"otro-{u}@test.com")
    cli = _cliente(db, phone="3000000000", email=f"ana-{u}@test.com")
    sc = _sc(db, "SC-CDC004", user_admin, cliente=cli)

    resp = _patch(app_client, admin_token, sc.id, customer_email=f"OTRO-{u}@Test.com", customer_phone="3005556677")
    assert resp.status_code == 409, resp.text
    detalle = resp.json()["detail"]
    assert detalle == (f"El correo otro-{u}@test.com ya pertenece a otro cliente (Otra Persona). Revisa si es el mismo "
                       f"cliente antes de cambiarlo.")
    db.expire_all()
    assert (sc.customer_phone, sc.customer_email) == ("3000000000", f"ana-{u}@test.com")
    assert (cli.phone, cli.email) == ("3000000000", f"ana-{u}@test.com")
    assert _logs(db, "SC", sc.id) == [] and _logs(db, "CLIENTE", cli.id) == []


def test_correo_y_telefono_invalidos_dan_422(app_client, db, admin_token, user_admin):
    cli = _cliente(db, phone="3000000000", email=f"ana-{_u()}@test.com")
    sc = _sc(db, "SC-CDC005", user_admin, cliente=cli)
    casos = [
        ({"customer_email": "sin-arroba"}, "El correo «sin-arroba» no es válido."),
        ({"customer_phone": "12"}, "El teléfono debe tener al menos 7 dígitos."),
        ({}, "No llegó ningún dato del cliente para corregir."),
        ({"updated_by": "x", "customer_name": "Otro nombre"}, "No llegó ningún dato del cliente para corregir."),
        # Los 4 limites (T6A copia estos textos en validarContacto).
        ({"customer_email": "a" * 140 + "@prueba.com"}, "El correo no puede tener más de 150 caracteres."),
        ({"customer_phone": "3" * 51}, "El teléfono no puede tener más de 50 caracteres."),
        # 255 y no 300: customers.address es varchar(255) en la base (la SC, la COT y el PVEN admiten 300).
        ({"customer_address": "x" * 256}, "La dirección es muy larga (máximo 255 caracteres)."),
        ({"customer_city": "x" * 101}, "La ciudad es muy larga (máximo 100 caracteres)."),
        ({"customer_phone": 3001112233}, "El dato «Teléfono» debe ser un texto."),
    ]
    for body, texto in casos:
        resp = _patch(app_client, admin_token, sc.id, **body)
        assert resp.status_code == 422, (body, resp.text)
        assert resp.json()["detail"] == texto, body
    # En el limite exacto si se acepta, y borrar un dato ('') es valido. El correo lleva uuid (customers.email es unico
    # y erp_test no se trunca).
    u = _u()
    correo_150 = u + "b" * (139 - len(u)) + "@prueba.com"
    assert len(correo_150) == 150
    resp = _patch(app_client, admin_token, sc.id, customer_address="x" * 255, customer_city="y" * 100,
                  customer_phone="3" * 50, customer_email=correo_150)
    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert len(cli.address) == 255 and sc.customer_email == correo_150 and cli.email == correo_150
    resp = _patch(app_client, admin_token, sc.id, customer_address="  ")
    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert sc.customer_address is None and cli.address is None


def test_solicitud_cancelada_no_se_corrige(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CDC006", user_admin, estado="CANCELADA", customer_phone="3000000000")
    resp = _patch(app_client, admin_token, sc.id, customer_phone="3001112233")
    assert resp.status_code == 409
    assert resp.json()["detail"] == ("La solicitud SC-CDC006 está cancelada: si hace falta, corrige los datos desde la "
                                     "ficha del cliente.")
    db.expire_all()
    assert sc.customer_phone == "3000000000"
    assert _patch(app_client, admin_token, 999999999, customer_phone="3001112233").status_code == 404


def test_sin_cambios_no_registra_actividad(app_client, db, admin_token, user_admin):
    cli = _cliente(db, phone="3000000000", email=f"ana-{_u()}@test.com")
    sc = _sc(db, "SC-CDC007", user_admin, cliente=cli)
    resp = _patch(app_client, admin_token, sc.id, customer_phone=" 3000000000 ", customer_email=cli.email.upper())
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert set(cuerpo) == CLAVES_RESPUESTA
    assert cuerpo["sin_cambios"] is True
    assert (cuerpo["ficha_actualizada"], cuerpo["documentos_actualizados"], cuerpo["confirmacion_anulada"],
            cuerpo["estado_cambiado"], cuerpo["enlaces_anulados"]) == (False, [], False, False, [])
    assert cuerpo["data"]["customer_phone"] == "3000000000"
    assert _logs(db, "SC", sc.id) == [] and _logs(db, "CLIENTE", cli.id) == []


# --- 8, 8b, 13, 13b, 14, 14b, 15: la regla de Gate 1 (R18) ---------------------------------------------------------

def test_corregir_el_correo_con_el_enlace_pendiente_anula_el_enlace(app_client, db, admin_token, user_admin,
                                                                    contador_sql):
    from app.core.confirmation_tokens import create_confirmation_token
    cli = _cliente(db, phone="3000000000", email=f"ana-{_u()}@test.com")
    sc = _sc(db, "SC-CDC008", user_admin, cliente=cli, estado="PENDIENTE_CONFIRMACION")
    token = create_confirmation_token(db, "SC", sc.id)

    with contador_sql.ventana() as v:
        resp = _patch(app_client, admin_token, sc.id, customer_email=f"bien-{_u()}@test.com")
    assert resp.status_code == 200, resp.text
    assert v.commits == 1, f"la correccion debe confirmar una sola vez, confirmo {v.commits} veces"
    cuerpo = resp.json()
    assert cuerpo["confirmacion_anulada"] is True and cuerpo["estado_cambiado"] is True
    assert cuerpo["enlaces_anulados"] == [sc.numero]
    assert cuerpo["data"]["estado"] == "ASIGNADA"
    assert _token_usado(db, token)
    db.expire_all()
    assert sc.estado == "ASIGNADA" and sc.gate1_confirmed_at is None
    logs = _logs(db, "SC", sc.id)
    assert [l.action for l in logs] == ["UPDATED", "ESTADO_CHANGED"]  # primero la correccion, despues lo que provoca
    assert logs[0].description.startswith("Datos del cliente corregidos: Correo")
    assert (logs[1].old_estado, logs[1].new_estado) == ("PENDIENTE_CONFIRMACION", "ASIGNADA")
    assert logs[1].description == f"Estado cambiado a Asignada: {MOTIVO_CONTACTO}"


def test_corregir_el_telefono_con_el_enlace_pendiente_y_una_cotizacion_temprana_vuelve_a_asignada(
        app_client, db, admin_token, user_admin):
    """Misma regla que update_solicitud tras la ronda 1 de T3 (puerta A): con el enlace pendiente la COT activa (creada
    sin confirmacion) no evita el reinicio. La COT no cambia de estado; recibe el dato corregido."""
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, "SC-CDC081", user_admin, estado="PENDIENTE_CONFIRMACION", customer_phone="3000000000")
    cot = _cot(db, "COT-CDC081", sc, sin_confirmacion_sc_at=datetime.datetime.utcnow(),
               sin_confirmacion_sc_motivo="El cliente tiene prisa por la cotización")
    token = create_confirmation_token(db, "SC", sc.id)
    resp = _patch(app_client, admin_token, sc.id, customer_phone="3001112233")
    assert resp.status_code == 200, resp.text
    assert resp.json()["estado_cambiado"] is True and resp.json()["enlaces_anulados"] == [sc.numero]
    assert resp.json()["documentos_actualizados"] == [cot.numero]
    assert _token_usado(db, token)
    db.expire_all()
    assert sc.estado == "ASIGNADA" and cot.estado == "BORRADOR" and cot.customer_phone == "3001112233"


def test_corregir_el_telefono_de_una_sc_confirmada_con_cot_activa_anula_gate1_sin_cambiar_estado(
        app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, "SC-CDC013", user_admin, estado="CONFIRMADA", customer_phone="3000000000",
             gate1_confirmed_at=datetime.datetime.utcnow())
    cot = _cot(db, "COT-CDC013", sc)

    resp = _patch(app_client, admin_token, sc.id, customer_phone="3109998877")
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert cuerpo["confirmacion_anulada"] is True and cuerpo["estado_cambiado"] is False
    assert cuerpo["enlaces_anulados"] == []  # caso tipico: la SC ya confirmada no tenia un enlace vivo
    assert cuerpo["data"]["estado"] == "CONFIRMADA" and cuerpo["data"]["confirmacion_vigente"] is False
    assert cuerpo["documentos_actualizados"] == [cot.numero]
    db.expire_all()
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is None
    assert cot.estado == "BORRADOR" and cot.customer_phone == "3109998877"
    logs = _logs(db, "SC", sc.id)
    assert [l.action for l in logs] == ["UPDATED", "UPDATED"]
    assert logs[0].description.startswith("Datos del cliente corregidos: Teléfono. También se corrigieron en "
                                          f"{cot.numero}.")
    assert logs[1].description == AVISO_CONTACTO_CON_COT

    # Si quedaba un enlace vivo de la SC, se revoca y si se informa (punto 4 de la ronda 1: enlaces_anulados exacto).
    sc2 = _sc(db, "SC-CDC132", user_admin, estado="CONFIRMADA", customer_phone="3000000000",
              gate1_confirmed_at=datetime.datetime.utcnow())
    _cot(db, "COT-CDC132", sc2)
    viejo = create_confirmation_token(db, "SC", sc2.id)
    resp = _patch(app_client, admin_token, sc2.id, customer_phone="3109998877")
    assert resp.status_code == 200, resp.text
    assert resp.json()["enlaces_anulados"] == [sc2.numero] and resp.json()["estado_cambiado"] is False
    assert _token_usado(db, viejo)


def test_corregir_el_telefono_de_una_sc_confirmada_por_su_cotizacion_no_anula_nada(
        app_client, db, admin_token, user_admin):
    """SC CONFIRMADA sin la marca gate1 (la confirmo el cliente por la COT, T2A): no hay confirmacion de Gate 1 que
    anular, igual que en update_solicitud."""
    sc = _sc(db, "SC-CDC131", user_admin, estado="CONFIRMADA", customer_phone="3000000000")
    _cot(db, "COT-CDC131", sc, estado="CONFIRMADA", gate2_confirmed_at=datetime.datetime.utcnow())
    resp = _patch(app_client, admin_token, sc.id, customer_phone="3109998877")
    assert resp.status_code == 200, resp.text
    assert (resp.json()["confirmacion_anulada"], resp.json()["estado_cambiado"], resp.json()["enlaces_anulados"]) == (
        False, False, [])
    assert [l.action for l in _logs(db, "SC", sc.id)] == ["UPDATED"]


def test_cotizacion_propagada_pendiente_queda_con_el_enlace_anulado(app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    u = _u()
    sc = _sc(db, "SC-CDC014", user_admin, estado="CONFIRMADA", customer_email=f"mal-{u}@test.com",
             gate1_confirmed_at=datetime.datetime.utcnow())
    cot = _cot(db, "COT-CDC014", sc, estado="PENDIENTE_CONFIRMACION")
    token_cot = create_confirmation_token(db, "COT", cot.id)

    resp = _patch(app_client, admin_token, sc.id, customer_email=f"bien-{u}@test.com")
    assert resp.status_code == 200, resp.text
    assert resp.json()["enlaces_anulados"] == [cot.numero]
    assert resp.json()["confirmacion_anulada"] is True and resp.json()["estado_cambiado"] is False
    assert _token_usado(db, token_cot)
    db.expire_all()
    assert cot.estado == "PENDIENTE_CONFIRMACION" and cot.customer_email == f"bien-{u}@test.com"
    log_cot = _logs(db, "COT", cot.id, "UPDATED")[-1]
    assert log_cot.description == f"Datos del cliente corregidos desde la solicitud {sc.numero}: Correo"
    assert log_cot.extra_data["cambios"][-1] == ENLACE_COT_ANULADO
    assert log_cot.extra_data["origen"] == {"tipo": "SC", "id": sc.id, "numero": sc.numero}


def test_cotizacion_confirmada_recibe_los_datos_sin_anular_su_confirmacion(app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    u = _u()
    sc = _sc(db, "SC-CDC141", user_admin, estado="CONFIRMADA", customer_email=f"mal-{u}@test.com")
    marca = datetime.datetime.utcnow()
    cot = _cot(db, "COT-CDC141", sc, estado="CONFIRMADA", gate2_confirmed_at=marca)
    token_cot = create_confirmation_token(db, "COT", cot.id)
    resp = _patch(app_client, admin_token, sc.id, customer_email=f"bien-{u}@test.com")
    assert resp.status_code == 200, resp.text
    assert resp.json()["enlaces_anulados"] == [] and resp.json()["documentos_actualizados"] == [cot.numero]
    assert not _token_usado(db, token_cot)
    db.expire_all()
    assert cot.estado == "CONFIRMADA" and cot.gate2_confirmed_at == marca
    assert cot.customer_email == f"bien-{u}@test.com"
    assert ENLACE_COT_ANULADO not in _logs(db, "COT", cot.id, "UPDATED")[-1].extra_data["cambios"]


def test_corregir_solo_la_direccion_no_anula_nada(app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    cli = _cliente(db, phone="3000000000", email=f"ana-{_u()}@test.com", address="Calle 1", city="Cali")
    sc = _sc(db, "SC-CDC015", user_admin, cliente=cli, estado="PENDIENTE_CONFIRMACION",
             gate1_confirmed_at=None)
    cot = _cot(db, "COT-CDC015", sc, estado="PENDIENTE_CONFIRMACION",
               sin_confirmacion_sc_at=datetime.datetime.utcnow(), sin_confirmacion_sc_motivo="Cotización temprana")
    token_sc = create_confirmation_token(db, "SC", sc.id)
    token_cot = create_confirmation_token(db, "COT", cot.id)

    resp = _patch(app_client, admin_token, sc.id, customer_address="Calle 2 # 3-4", customer_city="Bogotá")
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert (cuerpo["confirmacion_anulada"], cuerpo["estado_cambiado"], cuerpo["enlaces_anulados"]) == (False, False, [])
    assert cuerpo["documentos_actualizados"] == [cot.numero] and cuerpo["ficha_actualizada"] is True
    assert not _token_usado(db, token_sc) and not _token_usado(db, token_cot)
    db.expire_all()
    assert sc.estado == "PENDIENTE_CONFIRMACION" and cot.estado == "PENDIENTE_CONFIRMACION"
    assert cot.customer_address == "Calle 2 # 3-4" and cli.city == "Bogotá"
    assert [l.action for l in _logs(db, "SC", sc.id)] == ["UPDATED"]
    assert ENLACE_COT_ANULADO not in _logs(db, "COT", cot.id, "UPDATED")[-1].extra_data["cambios"]


# --- 9 y la nota de T3: propagacion a la COT y el PVEN abiertos (R6) ---------------------------------------------

def test_tambien_corrige_la_cotizacion_abierta_y_no_la_rechazada(app_client, db, admin_token, user_admin):
    cli = _cliente(db, phone="3000000000", email=f"ana-{_u()}@test.com")
    sc = _sc(db, "SC-CDC009", user_admin, cli)
    cot1 = _cot(db, "COT-CDC009A", sc)
    cot2 = _cot(db, "COT-CDC009B", sc, estado="RECHAZADA")
    cancelado = _pven(db, "PVEN-CDC009A", "CANCELADO", sc=sc)
    devuelto = _pven(db, "PVEN-CDC009B", "DEVUELTO_TOTAL", sc=sc)
    entregado = _pven(db, "PVEN-CDC009C", "ENTREGADO", cot=cot1)
    facturado = _pven(db, "PVEN-CDC009D", "FACTURADO", sc=sc)
    # Un PVEN abierto de una COT ya rechazada, sin sc_id: se busca por TODAS las COT de la SC (como get_solicitud).
    abierto = _pven(db, "PVEN-CDC009E", "PENDIENTE_COMPRA", cot=cot2)

    resp = _patch(app_client, admin_token, sc.id, customer_phone="3001112233")
    assert resp.status_code == 200, resp.text
    assert resp.json()["documentos_actualizados"] == [cot1.numero, abierto.numero]
    db.expire_all()
    assert cot1.customer_phone == "3001112233" and abierto.customer_phone == "3001112233"
    for doc in (cot2, cancelado, devuelto, entregado, facturado):
        assert doc.customer_phone == "3000000000", doc.numero
    log_cot = _logs(db, "COT", cot1.id, "UPDATED")[-1]
    assert log_cot.description == f"Datos del cliente corregidos desde la solicitud {sc.numero}: Teléfono"
    assert log_cot.extra_data["cambios"] == [{"campo": "customer_phone", "etiqueta": "Teléfono",
                                             "antes": "3000000000", "despues": "3001112233"}]
    assert "desde la solicitud" in _logs(db, "VEN", abierto.id, "UPDATED")[-1].description
    assert _logs(db, "COT", cot2.id) == [] and _logs(db, "VEN", cancelado.id) == []
    log_sc = _logs(db, "SC", sc.id, "UPDATED")[-1]
    assert log_sc.description == (f"Datos del cliente corregidos: Teléfono. También se corrigieron en la ficha del "
                                  f"cliente, {cot1.numero} y {abierto.numero}.")
    assert log_sc.extra_data["documentos"] == [cot1.numero, abierto.numero]


def test_la_cotizacion_temprana_recibe_los_datos_corregidos(app_client, db, admin_token, user_admin):
    """Nota de T3: una COT creada sin confirmacion con la SC ASIGNADA puede conservar el dato viejo del cliente; la
    correccion la alcanza (esta abierta)."""
    sc = _sc(db, "SC-CDC017", user_admin, customer_phone="3111111111")
    cot = _cot(db, "COT-CDC017", sc, customer_phone="3000000000", sin_confirmacion_sc_at=datetime.datetime.utcnow(),
               sin_confirmacion_sc_motivo="El cliente pidió la cotización ya")
    resp = _patch(app_client, admin_token, sc.id, customer_phone="3222222222")
    assert resp.status_code == 200, resp.text
    assert resp.json()["documentos_actualizados"] == [cot.numero]
    db.expire_all()
    assert cot.customer_phone == "3222222222" and sc.customer_phone == "3222222222"


def test_si_la_solicitud_ya_tenia_el_dato_solo_se_corrigen_la_ficha_y_los_documentos(
        app_client, db, admin_token, user_admin):
    cli = _cliente(db, phone="3000000000", email=f"ana-{_u()}@test.com")
    sc = _sc(db, "SC-CDC018", user_admin, cli, customer_phone="3001112233")
    resp = _patch(app_client, admin_token, sc.id, customer_phone="3001112233")
    assert resp.status_code == 200, resp.text
    assert resp.json()["ficha_actualizada"] is True and resp.json()["sin_cambios"] is False
    log = _logs(db, "SC", sc.id, "UPDATED")[-1]
    assert log.description == "Datos del cliente corregidos en la ficha del cliente: Teléfono"
    assert log.extra_data["cambios"] == []


# --- 10: roles; 11: historial del cliente en el 360 y privacidad por rol; 12: la ficha desde la Agenda -----------

def test_el_asesor_puede_corregir(app_client, db, user_admin, user_vendedor, vendedor_token):
    from app.core.textos_actividad import nombre_de_usuario
    sc = _sc(db, "SC-CDC010", user_admin, customer_phone="3000000000")
    resp = _patch(app_client, vendedor_token, sc.id, customer_phone="3001112233")
    assert resp.status_code == 200, resp.text
    assert _logs(db, "SC", sc.id, "UPDATED")[-1].user_name == nombre_de_usuario(user_vendedor)


def test_compras_y_bodega_no_pueden_corregir(app_client, db, user_admin, compras_token, bodega_token):
    cli = _cliente(db, phone="3000000000", email=f"ana-{_u()}@test.com")
    sc = _sc(db, "SC-CDC019", user_admin, cli)
    for token in (compras_token, bodega_token):
        assert _patch(app_client, token, sc.id, customer_phone="3001112233").status_code == 403
        assert app_client.put(f"/api/v1/crm/customers/{cli.id}", json={"phone": "3001112233"},
                              headers=auth(token)).status_code == 403
    db.expire_all()
    assert sc.customer_phone == "3000000000" and cli.phone == "3000000000"


def _items_customer_update(app_client, token, cliente_id):
    resp = app_client.get(f"/api/v1/crm/customers/{cliente_id}/profile-360", headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"], [t for t in resp.json()["data"]["timeline"] if t["type"] == "customer_update"]


def test_el_historial_del_cliente_muestra_la_correccion(app_client, db, admin_token, user_admin, vendedor_token):
    from app.core.textos_actividad import nombre_de_usuario
    cli = _cliente(db, phone="3000000000", email=f"ana-{_u()}@test.com")
    sc = _sc(db, "SC-CDC011", user_admin, cli)
    assert _patch(app_client, admin_token, sc.id, customer_phone="3001112233").status_code == 200

    _, items = _items_customer_update(app_client, admin_token, cli.id)
    assert len(items) == 1
    item = items[0]
    assert set(item) == {"type", "id", "status", "status_label", "color", "created_at", "description", "user_name",
                         "cambios"}
    assert (item["status"], item["status_label"], item["color"]) == ("UPDATED", "Datos del cliente actualizados",
                                                                     "purple")
    assert sc.numero in item["description"] and item["created_at"].endswith("Z")
    assert item["user_name"] == nombre_de_usuario(user_admin)
    assert item["cambios"] == [{"campo": "phone", "etiqueta": "Teléfono", "antes": "3000000000",
                                "despues": "3001112233"}]
    # El asesor ve el contacto en la ficha, asi que tambien el antes y despues.
    _, items_asesor = _items_customer_update(app_client, vendedor_token, cli.id)
    assert items_asesor[0]["cambios"] == item["cambios"]


def test_bodega_y_compras_ven_la_correccion_sin_los_datos(app_client, db, admin_token, user_admin, bodega_token,
                                                          compras_token):
    u = _u()
    cli = _cliente(db, phone="3000000000", email=f"ana.vieja-{u}@test.com", address="Calle 1")
    sc = _sc(db, "SC-CDC111", user_admin, cli)
    assert _patch(app_client, admin_token, sc.id, customer_phone="3001112233", customer_address="Calle 2",
                  customer_email=f"ana.nueva-{u}@test.com").status_code == 200
    # Y una edicion de la ficha desde la Agenda (PUT /crm/customers), tambien con el antes y el despues.
    assert app_client.put(f"/api/v1/crm/customers/{cli.id}", json={"phone": "3004445566", "address": "Calle 3"},
                          headers=auth(admin_token)).status_code == 200
    datos = ("3000000000", "3001112233", "3004445566", "Calle 1", "Calle 2", "Calle 3", f"ana.vieja-{u}",
             f"ana.nueva-{u}")
    for token in (bodega_token, compras_token):
        perfil, items = _items_customer_update(app_client, token, cli.id)
        assert perfil["phone"] is None and perfil["email"] is None  # la proyeccion por rol de siempre
        assert len(items) == 2 and all(i["cambios"] == [] and i["user_name"] for i in items)
        assert any(sc.numero in i["description"] for i in items)
        assert any(i["description"] == "Ficha del cliente actualizada: Teléfono, Dirección" for i in items)
        timeline = str(perfil["timeline"])
        assert not [d for d in datos if d in timeline]


def test_editar_la_ficha_con_correo_repetido_da_409_y_registra_actividad(app_client, db, admin_token, user_admin):
    from app.core.textos_actividad import nombre_de_usuario
    u = _u()
    _cliente(db, first_name="Otra", last_name="Persona", email=f"otro-{u}@test.com")
    cli = _cliente(db, phone="3000000000", email=f"ana-{u}@test.com")

    resp = app_client.put(f"/api/v1/crm/customers/{cli.id}", json={"email": f" OTRO-{u}@Test.com "},
                          headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == "Ya existe otro cliente con ese correo (Otra Persona)."
    assert _logs(db, "CLIENTE", cli.id) == []

    resp = app_client.put(f"/api/v1/crm/customers/{cli.id}", json={"phone": "3001112233", "email": cli.email.upper()},
                          headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    logs = _logs(db, "CLIENTE", cli.id)
    assert len(logs) == 1
    assert logs[0].description == "Ficha del cliente actualizada: Teléfono"  # el mismo correo en mayusculas no cambia
    assert logs[0].user_name == nombre_de_usuario(user_admin)
    assert logs[0].extra_data["origen"] == {"tipo": "FICHA"}
    db.expire_all()
    assert cli.email == f"ana-{u}@test.com"

    # Guardar sin cambios no deja renglon; un correo vacio se guarda como nulo (dos fichas con '' chocarian).
    assert app_client.put(f"/api/v1/crm/customers/{cli.id}", json={"phone": "3001112233"},
                          headers=auth(admin_token)).status_code == 200
    assert len(_logs(db, "CLIENTE", cli.id)) == 1
    resp = app_client.put(f"/api/v1/crm/customers/{cli.id}", json={"email": "  "}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert cli.email is None
    assert _logs(db, "CLIENTE", cli.id)[-1].description == "Ficha del cliente actualizada: Correo"


# --- Carrera del correo (IntegrityError en el flush) -> 409 sin guardar nada --------------------------------------

def test_el_correo_tomado_en_una_carrera_da_409_sin_guardar_nada(app_client, db, admin_token, user_admin,
                                                                 monkeypatch):
    from app.core import clientes
    u = _u()
    _cliente(db, first_name="Otra", last_name="Persona", email=f"otro-{u}@test.com")
    cli = _cliente(db, phone="3000000000", email=f"ana-{u}@test.com")
    sc = _sc(db, "SC-CDC020", user_admin, cli)
    # Otro cliente toma el correo entre la revision previa y la escritura: la revision no lo ve.
    monkeypatch.setattr(clientes, "correo_de_otro_cliente", lambda *a, **k: None)

    resp = _patch(app_client, admin_token, sc.id, customer_email=f"otro-{u}@test.com", customer_phone="3001112233")
    assert resp.status_code == 409, resp.text
    assert "ya pertenece a otro cliente" in resp.json()["detail"]
    db.expire_all()
    assert (sc.customer_phone, sc.customer_email) == ("3000000000", f"ana-{u}@test.com")
    assert cli.email == f"ana-{u}@test.com"
    assert _logs(db, "SC", sc.id) == [] and _logs(db, "CLIENTE", cli.id) == []

    resp = app_client.put(f"/api/v1/crm/customers/{cli.id}", json={"email": f"otro-{u}@test.com"},
                          headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == "Ya existe otro cliente con ese correo."
    db.expire_all()
    assert cli.email == f"ana-{u}@test.com" and _logs(db, "CLIENTE", cli.id) == []


def test_un_dato_que_no_cabe_en_la_base_da_422_sin_guardar_nada(app_client, db, admin_token, user_admin,
                                                                monkeypatch):
    """Red de seguridad (DataError): si el limite del telefono pasara el largo de la columna (customer_phone String(50)),
    la base no lo aguanta. El aviso del servidor no lleva los datos del cliente."""
    import logging
    import app.api.v1.erp_ventas as m_ventas
    from app.core import clientes

    class _Captura(logging.Handler):
        def __init__(self):
            super().__init__()
            self.mensajes = []

        def emit(self, record):
            self.mensajes.append(record.getMessage() + (str(record.exc_info) if record.exc_info else ""))

    captura = _Captura()
    m_ventas.logger.addHandler(captura)
    monkeypatch.setattr(m_ventas.logger, "propagate", False)
    monkeypatch.setattr(clientes, "TELEFONO_MAX", 60)
    cli = _cliente(db, phone="3000000000", email=f"ana-{_u()}@test.com", address="Calle 1")
    sc = _sc(db, "SC-CDC021", user_admin, cli)
    telefono = "3001112233" + "4" * 45  # 55 caracteres
    try:
        resp = _patch(app_client, admin_token, sc.id, customer_address="Calle 2", customer_phone=telefono)
    finally:
        m_ventas.logger.removeHandler(captura)
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "Algún dato es demasiado largo para guardarlo: acórtalo e intenta de nuevo."
    assert len(captura.mensajes) == 1 and "StringDataRightTruncation" in captura.mensajes[0]
    assert "3001112233" not in captura.mensajes[0] and "Calle 2" not in captura.mensajes[0]
    db.expire_all()
    assert (sc.customer_address, sc.customer_phone, cli.address, cli.phone) == ("Calle 1", "3000000000", "Calle 1",
                                                                                "3000000000")
    assert _logs(db, "SC", sc.id) == []


# --- Ronda 1 de T5: documentos de otro cliente, enlaces exactos, rama R18 sin COT, bordes, limites de la ficha ----

def test_los_documentos_de_otro_cliente_no_se_tocan(app_client, db, admin_token, user_admin):
    """El cliente de la SC cambio de A a B (Bloque 1 lo permite con una COT activa): la COT de A sigue colgando de la SC
    con los datos de A. Corregir el contacto de B no le llega ni le anula el enlace; se informa."""
    from app.core.confirmation_tokens import create_confirmation_token
    u = _u()
    cli_a = _cliente(db, first_name="Alba", phone="3000000000", email=f"alba-{u}@test.com")
    cli_b = _cliente(db, first_name="Beto", phone="3111111111", email=f"beto-{u}@test.com")
    sc = _sc(db, "SC-CDC022", user_admin, cli_b, estado="CONFIRMADA")
    cot_a = _cot(db, "COT-CDC022", sc, customer_id=cli_a.id, customer_phone=cli_a.phone,
                 customer_email=cli_a.email, estado="PENDIENTE_CONFIRMACION")
    token_a = create_confirmation_token(db, "COT", cot_a.id)
    pven_a = _pven(db, "PVEN-CDC022", "PENDIENTE_COMPRA", sc=sc, telefono=cli_a.phone)
    pven_a.customer_id = cli_a.id
    db.commit()

    resp = _patch(app_client, admin_token, sc.id, customer_phone="3112223344", customer_email=f"beto2-{u}@test.com")
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert set(cuerpo) == CLAVES_RESPUESTA
    assert cuerpo["documentos_de_otro_cliente"] == [cot_a.numero, pven_a.numero]
    assert cuerpo["documentos_actualizados"] == [] and cuerpo["enlaces_anulados"] == []
    assert not _token_usado(db, token_a)
    db.expire_all()
    assert (cot_a.customer_phone, cot_a.customer_email, cot_a.estado) == (cli_a.phone, cli_a.email,
                                                                          "PENDIENTE_CONFIRMACION")
    assert pven_a.customer_phone == cli_a.phone
    assert _logs(db, "COT", cot_a.id) == [] and _logs(db, "VEN", pven_a.id) == []
    assert (sc.customer_phone, cli_b.phone, cli_a.phone) == ("3112223344", "3112223344", "3000000000")
    log = _logs(db, "SC", sc.id, "UPDATED")[-1]
    assert log.description == ("Datos del cliente corregidos: Teléfono, Correo. También se corrigieron en la ficha del "
                               "cliente.")
    # Tambien en la respuesta sin cambios.
    resp = _patch(app_client, admin_token, sc.id, customer_phone="3112223344")
    assert resp.json()["sin_cambios"] is True
    assert resp.json()["documentos_de_otro_cliente"] == [cot_a.numero, pven_a.numero]


def test_dos_correcciones_seguidas_no_repiten_el_enlace_anulado(app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    u = _u()
    sc = _sc(db, "SC-CDC023", user_admin, estado="CONFIRMADA", customer_email=f"mal-{u}@test.com",
             customer_phone="3000000000")
    cot = _cot(db, "COT-CDC023", sc, estado="PENDIENTE_CONFIRMACION")
    token = create_confirmation_token(db, "COT", cot.id)

    primera = _patch(app_client, admin_token, sc.id, customer_email=f"bien-{u}@test.com")
    assert primera.status_code == 200, primera.text
    assert primera.json()["enlaces_anulados"] == [cot.numero] and _token_usado(db, token)
    segunda = _patch(app_client, admin_token, sc.id, customer_phone="3001112233")
    assert segunda.status_code == 200, segunda.text
    assert segunda.json()["enlaces_anulados"] == []  # ya no habia un enlace vivo
    assert segunda.json()["documentos_actualizados"] == [cot.numero]
    renglones = _logs(db, "COT", cot.id, "UPDATED")
    assert len(renglones) == 2
    assert [ENLACE_COT_ANULADO in r.extra_data["cambios"] for r in renglones] == [True, False]


def test_sc_confirmada_sin_cotizacion_activa_vuelve_a_asignada_o_a_nueva(app_client, db, admin_token, user_admin):
    """Rama R18 de update_solicitud: CONFIRMADA con la marca y sin COT activa (una RECHAZADA no cuenta) vuelve a
    empezar: ASIGNADA con asesor, BORRADOR (Nueva) sin el."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.core.textos_actividad import etiqueta_estado
    sc = _sc(db, "SC-CDC024", user_admin, estado="CONFIRMADA", customer_phone="3000000000",
             gate1_confirmed_at=datetime.datetime.utcnow())
    _cot(db, "COT-CDC024", sc, estado="RECHAZADA")
    token = create_confirmation_token(db, "SC", sc.id)
    resp = _patch(app_client, admin_token, sc.id, customer_phone="3001112233")
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert (cuerpo["confirmacion_anulada"], cuerpo["estado_cambiado"], cuerpo["enlaces_anulados"]) == (
        True, True, [sc.numero])
    assert _token_usado(db, token)
    db.expire_all()
    assert sc.estado == "ASIGNADA" and sc.gate1_confirmed_at is None
    cambio = _logs(db, "SC", sc.id, "ESTADO_CHANGED")[-1]
    assert (cambio.old_estado, cambio.new_estado) == ("CONFIRMADA", "ASIGNADA")
    assert cambio.description == f"Estado cambiado a {etiqueta_estado('SC', 'ASIGNADA')}: {MOTIVO_CONTACTO}"

    sin_asesor = _sc(db, "SC-CDC025", user_admin, estado="CONFIRMADA", customer_phone="3000000000",
                     advisor_user_id=None, gate1_confirmed_at=datetime.datetime.utcnow())
    resp = _patch(app_client, admin_token, sin_asesor.id, customer_phone="3001112233")
    assert resp.status_code == 200, resp.text
    assert resp.json()["estado_cambiado"] is True and resp.json()["enlaces_anulados"] == []
    db.expire_all()
    assert sin_asesor.estado == "BORRADOR" and sin_asesor.gate1_confirmed_at is None
    assert _logs(db, "SC", sin_asesor.id, "ESTADO_CHANGED")[-1].description == (
        f"Estado cambiado a {etiqueta_estado('SC', 'BORRADOR')}: {MOTIVO_CONTACTO}")


def test_la_cotizacion_pendiente_que_ya_tenia_el_dato_conserva_su_enlace(app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    u = _u()
    sc = _sc(db, "SC-CDC026", user_admin, customer_email=f"mal-{u}@test.com")
    cot = _cot(db, "COT-CDC026", sc, customer_email=f"bien-{u}@test.com", estado="PENDIENTE_CONFIRMACION")
    token = create_confirmation_token(db, "COT", cot.id)
    resp = _patch(app_client, admin_token, sc.id, customer_email=f"bien-{u}@test.com")
    assert resp.status_code == 200, resp.text
    assert resp.json()["documentos_actualizados"] == [] and resp.json()["enlaces_anulados"] == []
    assert not _token_usado(db, token)
    assert _logs(db, "COT", cot.id) == []


def test_cambiar_solo_mayusculas_o_espacios_del_correo_no_anula_la_confirmacion(app_client, db, admin_token,
                                                                                user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    u = _u()
    sc = _sc(db, "SC-CDC027", user_admin, estado="PENDIENTE_CONFIRMACION", customer_email=f"Ana.{u}@Test.com")
    token = create_confirmation_token(db, "SC", sc.id)
    resp = _patch(app_client, admin_token, sc.id, customer_email=f"  ana.{u}@test.com ")
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert cuerpo["sin_cambios"] is False  # se guardo en minusculas (y queda en la Actividad)
    assert (cuerpo["confirmacion_anulada"], cuerpo["estado_cambiado"], cuerpo["enlaces_anulados"]) == (
        False, False, [])
    assert not _token_usado(db, token)
    db.expire_all()
    assert sc.estado == "PENDIENTE_CONFIRMACION" and sc.customer_email == f"ana.{u}@test.com"
    assert [l.action for l in _logs(db, "SC", sc.id)] == ["UPDATED"]


def test_borrar_el_correo_con_el_enlace_pendiente_lo_anula(app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, "SC-CDC028", user_admin, estado="PENDIENTE_CONFIRMACION", customer_email=f"ana-{_u()}@test.com",
             customer_phone="3000000000")
    token = create_confirmation_token(db, "SC", sc.id)
    resp = _patch(app_client, admin_token, sc.id, customer_email="")
    assert resp.status_code == 200, resp.text
    assert resp.json()["estado_cambiado"] is True and resp.json()["enlaces_anulados"] == [sc.numero]
    assert _token_usado(db, token)
    db.expire_all()
    assert sc.estado == "ASIGNADA" and sc.customer_email is None


def test_editar_la_ficha_respeta_los_limites_y_no_devuelve_500(app_client, db, admin_token, user_admin, monkeypatch):
    import app.api.v1.crm as m_crm
    monkeypatch.setattr(m_crm.logger, "disabled", True)
    cli = _cliente(db, phone="3000000000", email=f"ana-{_u()}@test.com")
    casos = [
        ({"phone": "3" * 51}, "El teléfono no puede tener más de 50 caracteres."),
        ({"email": "a" * 140 + "@prueba.com"}, "El correo no puede tener más de 150 caracteres."),
        ({"address": "x" * 256}, "La dirección es muy larga (máximo 255 caracteres)."),
        ({"city": "x" * 101}, "La ciudad es muy larga (máximo 100 caracteres)."),
        # customers.document es varchar(255) en la base: el DataError responde 422 sin el SQL.
        ({"document": "9" * 300}, "Algún dato de la ficha es demasiado largo para guardarlo: acórtalo e intenta de "
                                  "nuevo."),
    ]
    for body, texto in casos:
        resp = app_client.put(f"/api/v1/crm/customers/{cli.id}", json=body, headers=auth(admin_token))
        assert resp.status_code == 422, (body, resp.text)
        assert resp.json()["detail"] == texto, body
    db.expire_all()
    assert cli.phone == "3000000000" and cli.document is None and _logs(db, "CLIENTE", cli.id) == []


def test_un_interbloqueo_da_409_sin_guardar_nada(app_client, db, admin_token, user_admin, monkeypatch):
    """La SC se bloquea antes que sus documentos y update_cotizacion bloquea la COT antes que la SC: si PostgreSQL
    aborta esta transaccion por un interbloqueo (40P01), se revierte todo y se responde 409, no 500."""
    import app.api.v1.erp_ventas as m_ventas
    from sqlalchemy.exc import OperationalError
    from app.core import clientes

    class _Interbloqueo(Exception):
        pgcode = "40P01"

    def _falla(*args, **kwargs):
        raise OperationalError("UPDATE sales_quotations SET ...", {}, _Interbloqueo("deadlock detected"))

    monkeypatch.setattr(m_ventas.logger, "disabled", True)
    monkeypatch.setattr(clientes, "log_cliente", _falla)
    cli = _cliente(db, phone="3000000000", email=f"ana-{_u()}@test.com")
    sc = _sc(db, "SC-CDC029", user_admin, cli)
    resp = _patch(app_client, admin_token, sc.id, customer_phone="3001112233")
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == ("Otra operación estaba cambiando esta solicitud o su cotización al mismo tiempo. "
                                     "Intenta de nuevo.")
    db.expire_all()
    assert sc.customer_phone == "3000000000" and cli.phone == "3000000000" and _logs(db, "SC", sc.id) == []


# --- Ronda 2 de T5: documentos leidos bloqueados y releidos; enlaces contados por el propio UPDATE ---------------

def test_un_cambio_de_cliente_de_la_cot_entre_medio_no_mezcla_datos(app_client, db, admin_token, user_admin,
                                                                    monkeypatch):
    """Otra operacion pasa la COT a otra ficha justo antes de que la correccion la lea, con la COT ya cargada en la
    sesion con el cliente viejo. Sin releerla (populate_existing) se la trataria como propia y quedaria con la ficha
    nueva y el telefono corregido del cliente anterior: datos mezclados."""
    import app.api.v1.erp_ventas as m_ventas
    from sqlalchemy import text
    from app.models.erp_documents import SalesQuotation
    u = _u()
    cli = _cliente(db, first_name="Alba", phone="3000000000", email=f"alba-{u}@test.com")
    otro = _cliente(db, first_name="Beto", phone="3111111111", email=f"beto-{u}@test.com")
    sc = _sc(db, "SC-CDC030", user_admin, cli)
    cot = _cot(db, "COT-CDC030", sc)
    original = m_ventas._docs_abiertos_para_contacto

    def _con_carrera(db_api, sc_api):
        vieja = db_api.get(SalesQuotation, cot.id)  # en la sesion del endpoint, todavia del cliente de la SC
        assert vieja.customer_id == cli.id
        db_api.execute(text("UPDATE sales_quotations SET customer_id = :otro, customer_phone = :tel WHERE id = :id"),
                       {"otro": otro.id, "tel": otro.phone, "id": cot.id})
        return original(db_api, sc_api)

    monkeypatch.setattr(m_ventas, "_docs_abiertos_para_contacto", _con_carrera)
    resp = _patch(app_client, admin_token, sc.id, customer_phone="3001112233")
    assert resp.status_code == 200, resp.text
    assert resp.json()["documentos_de_otro_cliente"] == [cot.numero]
    assert resp.json()["documentos_actualizados"] == []
    db.expire_all()
    assert (cot.customer_id, cot.customer_phone) == (otro.id, otro.phone)  # sin mezclar
    assert _logs(db, "COT", cot.id) == []


def test_la_correccion_bloquea_la_sc_la_ficha_y_los_documentos_en_orden(app_client, db, admin_token, user_admin,
                                                                       contador_sql):
    cli = _cliente(db, phone="3000000000", email=f"ana-{_u()}@test.com")
    sc = _sc(db, "SC-CDC031", user_admin, cli)
    cot = _cot(db, "COT-CDC031", sc)
    _pven(db, "PVEN-CDC031", "PENDIENTE_COMPRA", cot=cot)
    with contador_sql.ventana() as v:
        resp = _patch(app_client, admin_token, sc.id, customer_phone="3001112233")
    assert resp.status_code == 200, resp.text
    assert v.commits == 1
    bloqueos = [s for s in v.sentencias if "FOR UPDATE" in s.upper()]
    orden = []
    for tabla in ("FROM customer_requests", "FROM customers", "FROM sales_quotations", "FROM sale_orders"):
        posiciones = [i for i, s in enumerate(bloqueos) if tabla in s]
        assert posiciones, f"no se bloqueo {tabla}:\n" + "\n---\n".join(bloqueos)
        orden.append(posiciones[0])
    assert orden == sorted(orden), "el orden debe ser SC -> ficha -> COT -> PVEN"


def test_un_enlace_vencido_se_revoca_pero_no_se_informa(app_client, db, admin_token, user_admin):
    """enlaces_anulados cuenta lo que el UPDATE de revocacion anulo sin vencer (RETURNING): un enlace vencido ya no
    servia, asi que se marca como usado pero no se anuncia como anulado."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.confirmation import DocumentConfirmationToken
    u = _u()
    sc = _sc(db, "SC-CDC032", user_admin, estado="PENDIENTE_CONFIRMACION", customer_email=f"mal-{u}@test.com")
    cot = _cot(db, "COT-CDC032", sc, estado="PENDIENTE_CONFIRMACION",
               sin_confirmacion_sc_at=datetime.datetime.utcnow(), sin_confirmacion_sc_motivo="Cotización temprana")
    token_sc = create_confirmation_token(db, "SC", sc.id)
    token_cot = create_confirmation_token(db, "COT", cot.id)
    for raw in (token_sc, token_cot):
        fila = db.query(DocumentConfirmationToken).filter(
            DocumentConfirmationToken.token_hash == hashlib.sha256(raw.encode()).hexdigest()).first()
        fila.expires_at = datetime.datetime.utcnow() - datetime.timedelta(days=1)
    db.commit()

    resp = _patch(app_client, admin_token, sc.id, customer_email=f"bien-{u}@test.com")
    assert resp.status_code == 200, resp.text
    assert resp.json()["enlaces_anulados"] == []
    assert resp.json()["estado_cambiado"] is True  # la regla de Gate 1 no depende de que el enlace siga vivo
    assert _token_usado(db, token_sc) and _token_usado(db, token_cot)
    assert ENLACE_COT_ANULADO not in _logs(db, "COT", cot.id, "UPDATED")[-1].extra_data["cambios"]


# --- Ruling 1 (T5): fija el comportamiento del Bloque 1 en update_solicitud con productos y cliente a la vez -------

def test_update_solicitud_con_productos_y_cliente_a_la_vez_deja_solo_el_texto_de_productos(
        app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, "SC-CDC016", user_admin, estado="CONFIRMADA", customer_phone="3000000000",
             gate1_confirmed_at=datetime.datetime.utcnow())
    token = create_confirmation_token(db, "SC", sc.id)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "productos": [{"product_name": "Cuna Colecho", "qty": 2}], "customer_phone": "3109998877",
        "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "ASIGNADA"
    assert _token_usado(db, token)
    cambios = _logs(db, "SC", sc.id, "ESTADO_CHANGED")
    assert len(cambios) == 1
    assert cambios[0].description == ("Estado cambiado a Asignada: se modificaron los productos, así que la "
                                      "confirmación del cliente ya no es válida y hay que reenviarle la solicitud")
    assert not any("Cambió el cliente" in (l.description or "") for l in _logs(db, "SC", sc.id))
