"""U11: cotizar una solicitud antes de que el cliente la confirme (excepcion auditada a Gate 1).

- POST /ventas/solicitudes/{id}/cotizar-sin-confirmacion {motivo, cotizador?}: asesor o administrador (R5); el motivo
  (de 10 a 500 caracteres, sin los espacios de los bordes) se valida en el endpoint con 422 y `detail` legible; el
  autor sale de la sesion (nombre_de_usuario, R9), nunca del body. Crea la COT en Borrador marcada con
  sin_confirmacion_sc_at / sin_confirmacion_sc_motivo, deja COTIZADA_SIN_CONFIRMACION en la Actividad de la SC y el
  CREATED de la COT. No toca el estado de la SC, ni gate1, ni su enlace pendiente.
- El cliente confirma la SC por su enlace: queda CONFIRMADA y se mantiene esa misma cotizacion (SC_CONFIRMADA en la COT).
- Opcion A (R5): el cliente confirma la COT y la SC tambien queda confirmada (sincronizacion de U15).
- POST /cotizaciones con sc_id de una SC sin confirmacion vigente -> 409 (C7/R11), antes de gastar un numero; el 400
  de documentos activos (N7) ahora tambien aplica ahi. PATCH sc_id hacia una SC sin confirmar -> 409 (ruling T3-3).
- R21: rechazar la COT temprana no cambia la SC. R20: una SC con documentos activos no cuenta como atrasada.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_cotizar_sin_confirmacion
"""
import datetime
import hashlib

from tests.usuarios_de_prueba import compras_token  # noqa: F401  (fixture)

LINEA = {"product_name": "Cuna Colecho", "qty": 1}
MOTIVO = "Cliente pidió precio urgente por teléfono"
NO_CONFIRMADA = ("Esta solicitud no ha sido confirmada por el cliente: usa «Cotizar» en la solicitud para crear la "
                 "cotización con el motivo.")


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sc(db, numero, user_admin, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    campos.setdefault("productos", [LINEA])
    campos.setdefault("advisor_user_id", user_admin.id)
    campos.setdefault("advisor_name", user_admin.email)
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, sc=None, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    cot = SalesQuotation(numero=numero, sc_id=sc.id if sc else None, sc_numero=sc.numero if sc else None,
                         customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _cotizar(app_client, token, sc_id, **body):
    return app_client.post(f"/api/v1/ventas/solicitudes/{sc_id}/cotizar-sin-confirmacion", json=body,
                           headers=auth(token))


def _cots_de(db, sc_id):
    from app.models.erp_documents import SalesQuotation
    db.expire_all()
    return db.query(SalesQuotation).filter(SalesQuotation.sc_id == sc_id).order_by(SalesQuotation.id.asc()).all()


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


def _enviar_sc(app_client, token, sc_id):
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc_id}/enviar-confirmacion", json={}, headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["link_confirmacion"].rsplit("/", 1)[-1]


def _canjear(app_client, raw, clave):
    return app_client.post("/api/v1/confirmar/confirmar", json={"token": raw}, headers={"Idempotency-Key": clave})


# --- 1. El motivo es obligatorio -------------------------------------------------------------------------------------

def test_cotizar_sin_confirmacion_exige_motivo(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CSC001", user_admin)
    corto = "El motivo debe tener al menos 10 caracteres."
    for body in ({"motivo": "corto"}, {}, {"motivo": None}, {"motivo": "   nueve c   "}, {"motivo": "          "}):
        resp = _cotizar(app_client, admin_token, sc.id, **body)
        assert resp.status_code == 422, (body, resp.text)
        assert resp.json()["detail"] == corto, body
    resp = _cotizar(app_client, admin_token, sc.id, motivo="x" * 501)
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "El motivo no puede tener más de 500 caracteres."
    assert _cots_de(db, sc.id) == []
    assert _logs(db, "SC", sc.id) == []


# --- 2. Crea la cotizacion y lo deja anotado ---------------------------------------------------------------------------

def test_cotizar_sin_confirmacion_crea_la_cotizacion_y_lo_anota(app_client, db, admin_token, user_admin):
    from app.core.textos_actividad import nombre_de_usuario
    autor = nombre_de_usuario(user_admin)
    lineas = [LINEA, {"product_name": "Mecedora", "qty": 2, "sku_id": None}]
    sc = _sc(db, "SC-CSC002", user_admin, productos=lineas)
    # R9: el autor sale de la sesion; un user_name en el body se ignora (el schema ni lo tiene).
    resp = _cotizar(app_client, admin_token, sc.id, motivo=f"  {MOTIVO}  ", user_name="otro@test")
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert resp.json()["status"] == "success"
    assert data["sc"]["id"] == sc.id and data["sc"]["estado"] == "ASIGNADA"
    assert data["sc"]["confirmacion_vigente"] is False
    cot = data["cotizacion"]
    assert cot["estado"] == "BORRADOR" and cot["sc_id"] == sc.id and cot["sc_numero"] == "SC-CSC002"
    assert [(p["product_name"], p["qty"]) for p in cot["productos"]] == [("Cuna Colecho", 1), ("Mecedora", 2)]
    assert cot["sin_confirmacion_sc_motivo"] == MOTIVO
    assert cot["sin_confirmacion_sc_at"] and cot["sin_confirmacion_sc_at"].endswith("Z")
    assert cot["cotizador"] == user_admin.email  # por defecto, el asesor de la SC
    assert cot["created_by"] == autor

    db.expire_all()
    [fila] = _cots_de(db, sc.id)
    assert fila.sin_confirmacion_sc_at is not None and fila.sin_confirmacion_sc_motivo == MOTIVO
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.gate1_confirmed_at is None
    assert sc.fecha_entrega_estimada is not None  # como confirmar_solicitud

    [renglon] = _logs(db, "SC", sc.id, "COTIZADA_SIN_CONFIRMACION")
    assert renglon.description == (f"Se procedió con la cotización {cot['numero']} sin confirmación del cliente. "
                                   f"Motivo: {MOTIVO}")
    assert renglon.user_name == autor
    assert renglon.old_estado is None and renglon.new_estado is None
    assert renglon.extra_data["cot_id"] == cot["id"] and renglon.extra_data["cot_numero"] == cot["numero"]
    assert renglon.extra_data["motivo"] == MOTIVO and renglon.extra_data["estado_solicitud"] == "ASIGNADA"
    assert renglon.extra_data["cambios"] == [{"etiqueta": "Motivo", "despues": MOTIVO},
                                             {"etiqueta": "Estado de la solicitud", "despues": "Asignada"}]
    [creada] = _logs(db, "COT", cot["id"], "CREATED")
    assert creada.description == f"Cotización {cot['numero']} creada desde SC-CSC002 sin confirmación del cliente"
    assert creada.new_estado == "BORRADOR" and creada.user_name == autor
    assert creada.extra_data == {"sin_confirmacion": True, "cambios": [{"etiqueta": "Motivo", "despues": MOTIVO}]}

    d = app_client.get(f"/api/v1/ventas/cotizaciones/{cot['id']}", headers=auth(admin_token)).json()["data"]
    assert d["sc_estado"] == "ASIGNADA" and d["sc_confirmacion_vigente"] is False
    assert d["sin_confirmacion_sc_motivo"] == MOTIVO


def test_cotizar_sin_confirmacion_es_una_sola_transaccion(app_client, db, admin_token, user_admin, monkeypatch):
    """Un solo Session.commit() (C8): la COT, las marcas, los dos renglones y la fecha de la SC se guardan juntos. El
    lead del CRM va en un savepoint (la salida de un begin_nested no es un Session.commit())."""
    from sqlalchemy.orm import Session
    sc = _sc(db, "SC-CSC003", user_admin)
    commit_real = Session.commit
    commits = []

    def contar(self):
        if self is not db:
            commits.append(1)
        return commit_real(self)

    monkeypatch.setattr(Session, "commit", contar)
    resp = _cotizar(app_client, admin_token, sc.id, motivo=MOTIVO)
    assert resp.status_code == 200, resp.text
    assert len(commits) == 1, len(commits)


def test_cotizar_sin_confirmacion_mueve_el_lead_y_un_fallo_del_crm_no_la_tumba(app_client, db, admin_token, user_admin,
                                                                               monkeypatch):
    import uuid
    import app.api.v1.erp_ventas as erp_ventas
    from app.models.customers import Customer
    from app.models.sales import SalesOrder as LeadCRM
    cliente = Customer(first_name="Cliente", last_name=f"CSC-{uuid.uuid4().hex[:6]}",
                       email=f"csc_{uuid.uuid4().hex[:6]}@test.nebulae")
    db.add(cliente); db.commit()
    sc = _sc(db, "SC-CSC031", user_admin, customer_id=cliente.id)
    resp = app_client.post("/api/v1/crm/leads", json={"customer_id": cliente.id, "sc_id": sc.id,
                                                      "solicitud_tipo": "Cotizacion de Producto"},
                           headers=auth(admin_token))
    assert resp.status_code in (200, 201), resp.text
    lead_id = resp.json()["data"]["id"]
    resp = _cotizar(app_client, admin_token, sc.id, motivo=MOTIVO)
    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert db.get(LeadCRM, lead_id).status == "QUOTATION"  # como create_cotizacion

    # Si mover el lead falla, se deshace solo lo del lead (savepoint): la cotizacion y su registro se guardan igual.
    def _falla(*args, **kwargs):
        raise RuntimeError("CRM no disponible")

    errores = []
    monkeypatch.setattr(erp_ventas, "mover_lead_de_solicitud", _falla)
    monkeypatch.setattr(erp_ventas.logger, "error", lambda msg, *args, **kwargs: errores.append(msg))
    sc2 = _sc(db, "SC-CSC032", user_admin)
    resp = _cotizar(app_client, admin_token, sc2.id, motivo=MOTIVO)
    assert resp.status_code == 200, resp.text
    assert len(_cots_de(db, sc2.id)) == 1
    assert len(_logs(db, "SC", sc2.id, "COTIZADA_SIN_CONFIRMACION")) == 1
    assert len(errores) == 1 and "SC-CSC032" in errores[0] and "CRM no disponible" in errores[0]


# --- 3. El cliente confirma la solicitud: se mantiene la cotizacion -------------------------------------------------

def test_la_confirmacion_del_cliente_mantiene_la_cotizacion(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CSC004", user_admin, customer_email="cliente@test.nebulae")
    raw = _enviar_sc(app_client, admin_token, sc.id)
    resp = _cotizar(app_client, admin_token, sc.id, motivo=MOTIVO)
    assert resp.status_code == 200, resp.text
    cot = resp.json()["data"]["cotizacion"]
    db.refresh(sc)
    assert sc.estado == "PENDIENTE_CONFIRMACION" and not _token_usado(db, raw)  # el enlace pendiente sigue sirviendo

    resp = _canjear(app_client, raw, "csc-004")
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None
    assert [c.id for c in _cots_de(db, sc.id)] == [cot["id"]]  # no se creo otra

    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 400, resp.text
    assert "activa" in resp.json()["detail"]
    assert len(_cots_de(db, sc.id)) == 1

    confirmada = _logs(db, "SC", sc.id, "ESTADO_CHANGED")[-1]
    assert confirmada.description == (f"Confirmada por el cliente vía enlace. Se mantiene la cotización {cot['numero']}, "
                                      f"creada antes de la confirmación.")
    assert (confirmada.old_estado, confirmada.new_estado) == ("PENDIENTE_CONFIRMACION", "CONFIRMADA")
    [en_cot] = _logs(db, "COT", cot["id"], "SC_CONFIRMADA")
    assert en_cot.description == ("El cliente confirmó la solicitud SC-CSC004: se mantiene esta cotización "
                                  "(no se crea otra).")
    assert en_cot.user_name == "Cliente (confirmación por link)"

    d = app_client.get(f"/api/v1/ventas/cotizaciones/{cot['id']}", headers=auth(admin_token)).json()["data"]
    assert d["sc_estado"] == "CONFIRMADA" and d["sc_confirmacion_vigente"] is True


def test_sin_cotizacion_temprana_la_confirmacion_del_cliente_no_cambia(app_client, db, admin_token, user_admin):
    """Sin una COT activa (una RECHAZADA no cuenta) el enlace sigue como hoy: el texto de siempre y ningun SC_CONFIRMADA;
    despues 'Crear Cotizacion' crea la cotizacion nueva."""
    sc = _sc(db, "SC-CSC005", user_admin)
    rechazada = _cot(db, "COT-CSC005", sc, estado="RECHAZADA")
    raw = _enviar_sc(app_client, admin_token, sc.id)
    resp = _canjear(app_client, raw, "csc-005")
    assert resp.status_code == 200, resp.text
    confirmada = _logs(db, "SC", sc.id, "ESTADO_CHANGED")[-1]
    assert confirmada.description == "Confirmada por el cliente vía enlace"
    assert _logs(db, "COT", rechazada.id, "SC_CONFIRMADA") == []
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


# --- 4. y 5. Cuando no se puede cotizar sin confirmacion --------------------------------------------------------------

def test_no_se_cotiza_sin_confirmacion_si_ya_esta_confirmada(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CSC006", user_admin, estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow())
    resp = _cotizar(app_client, admin_token, sc.id, motivo=MOTIVO)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == "El cliente ya confirmó esta solicitud: usa «Crear Cotización»."
    assert _cots_de(db, sc.id) == []
    # Confirmada por su cotizacion (sin la marca) y sin documentos activos: esa confirmacion ya no vale, se puede.
    sc2 = _sc(db, "SC-CSC007", user_admin, estado="CONFIRMADA")
    resp = _cotizar(app_client, admin_token, sc2.id, motivo=MOTIVO)
    assert resp.status_code == 200, resp.text
    db.refresh(sc2)
    assert sc2.estado == "CONFIRMADA" and sc2.gate1_confirmed_at is None


def test_no_se_cotiza_sin_asesor_sin_productos_con_cot_activa_ni_cancelada(app_client, db, admin_token, user_admin,
                                                                           monkeypatch):
    import app.api.v1.erp_ventas as erp_ventas
    from app.models.erp_documents import SaleOrder
    numeros = []
    original = erp_ventas._gen_numero
    monkeypatch.setattr(erp_ventas, "_gen_numero", lambda db_, p, s: numeros.append(p) or original(db_, p, s))
    asesor = "Asigna un asesor a la solicitud antes de cotizarla."
    casos = []

    borrador = _sc(db, "SC-CSC008", user_admin, estado="BORRADOR", advisor_user_id=None, advisor_name=None)
    casos.append((borrador, 400, asesor))
    sin_asesor = _sc(db, "SC-CSC009", user_admin, advisor_user_id=None)  # ASIGNADA sin asesor (dato viejo)
    casos.append((sin_asesor, 400, asesor))
    sin_productos = _sc(db, "SC-CSC010", user_admin, productos=[{"product_name": "  ", "qty": 1}])
    casos.append((sin_productos, 400, "La solicitud no tiene productos para cotizar. Agrégalos en la solicitud y vuelve "
                                      "a enviársela al cliente para que la confirme."))
    con_cot = _sc(db, "SC-CSC011", user_admin, estado="PENDIENTE_CONFIRMACION")
    _cot(db, "COT-CSC011", con_cot)
    casos.append((con_cot, 400, "Esta solicitud ya tiene la cotización COT-CSC011 activa; no se puede crear otra. Si el "
                                "cliente no la aceptó, márcala como Rechazada y vuelve a intentarlo."))
    con_pedido = _sc(db, "SC-CSC012", user_admin)
    db.add(SaleOrder(numero="PVEN-CSC012", sc_id=con_pedido.id, customer_name="Cliente Prueba",
                     estado="PENDIENTE_COMPRA"))
    db.commit()
    casos.append((con_pedido, 400, "Esta solicitud ya tiene el pedido de venta PVEN-CSC012 activo; no se puede crear "
                                   "otra cotización."))
    cancelada = _sc(db, "SC-CSC013", user_admin, estado="CANCELADA")
    casos.append((cancelada, 409, "La solicitud SC-CSC013 está cancelada: restáurala desde la Papelera antes de "
                                  "cotizarla."))
    soporte = _sc(db, "SC-CSC014", user_admin, estado="N/A_SOPORTE", tipo_solicitud="Soporte Tecnico")
    casos.append((soporte, 400, "Las solicitudes de Soporte Técnico no se cotizan."))
    heredada = _sc(db, "SC-CSC015", user_admin, estado="COTIZADA")
    casos.append((heredada, 400, "No se puede cotizar sin confirmación una solicitud en estado Cotizada."))

    for sc, codigo, texto in casos:
        resp = _cotizar(app_client, admin_token, sc.id, motivo=MOTIVO)
        assert resp.status_code == codigo, (sc.numero, resp.text)
        assert resp.json()["detail"] == texto, sc.numero
        assert _logs(db, "SC", sc.id, "COTIZADA_SIN_CONFIRMACION") == [], sc.numero
    assert len(_cots_de(db, con_cot.id)) == 1
    assert all(_cots_de(db, sc.id) == [] for sc, _, _ in casos if sc is not con_cot)
    assert numeros == []  # ninguna gasto un numero de la secuencia

    resp = _cotizar(app_client, admin_token, 999999999, motivo=MOTIVO)
    assert resp.status_code == 404, resp.text


# --- 6. Opcion A: el cliente confirma la cotizacion y la solicitud tambien queda confirmada ----------------------------

def test_confirmar_la_cotizacion_confirma_la_solicitud(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SalesQuotation
    sc = _sc(db, "SC-CSC016", user_admin, customer_email="cliente@test.nebulae")
    t1 = _enviar_sc(app_client, admin_token, sc.id)
    resp = _cotizar(app_client, admin_token, sc.id, motivo=MOTIVO)
    assert resp.status_code == 200, resp.text
    cot = resp.json()["data"]["cotizacion"]
    fila = db.get(SalesQuotation, cot["id"])
    fila.productos = [{"product_name": "Cuna Colecho", "qty": 1, "unit_price_cop": 1000}]
    fila.total_cop = 1000
    db.commit()
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot['id']}/enviar-confirmacion", json={},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text  # opcion A: no hay 409 por la SC sin confirmar
    t2 = resp.json()["link_confirmacion"].rsplit("/", 1)[-1]
    resp = _canjear(app_client, t2, "csc-016")
    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert db.get(SalesQuotation, cot["id"]).estado == "CONFIRMADA"
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is None
    assert _token_usado(db, t1)  # el enlace viejo de la SC quedo anulado
    assert any("confirmó la cotización" in (l.description or "") for l in _logs(db, "SC", sc.id, "ESTADO_CHANGED"))


# --- 7. POST /cotizaciones con sc_id (C7/R11) -------------------------------------------------------------------------

def test_post_cotizaciones_con_sc_sin_confirmar_responde_409(app_client, db, admin_token, user_admin, monkeypatch):
    import app.api.v1.erp_ventas as erp_ventas
    from app.models.erp_documents import SaleOrder
    numeros = []
    original = erp_ventas._gen_numero
    monkeypatch.setattr(erp_ventas, "_gen_numero", lambda db_, p, s: numeros.append(p) or original(db_, p, s))

    def _post(sc_id, **extra):
        body = {"sc_id": sc_id, "total_cop": 1000, "created_by": "t",
                "productos": [{"product_name": "Cuna", "qty": 1, "unit_price_cop": 1000}], **extra}
        return app_client.post("/api/v1/ventas/cotizaciones", json=body, headers=auth(admin_token))

    asignada = _sc(db, "SC-CSC017", user_admin)
    pendiente = _sc(db, "SC-CSC018", user_admin, estado="PENDIENTE_CONFIRMACION")
    sin_marca = _sc(db, "SC-CSC019", user_admin, estado="CONFIRMADA")  # confirmada por su COT, sin la marca
    for sc in (asignada, pendiente, sin_marca):
        for extra in ({}, {"motivo_sin_confirmacion": MOTIVO}):  # el motivo no abre esta puerta: se ignora
            resp = _post(sc.id, **extra)
            assert resp.status_code == 409, (sc.numero, extra, resp.text)
            assert resp.json()["detail"] == NO_CONFIRMADA
        assert _cots_de(db, sc.id) == []

    resp = _post(999999999)
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "La solicitud indicada no existe."
    resp = _post("abc")
    assert resp.status_code == 422, resp.text
    assert numeros == []  # ninguno gasto un numero de la secuencia

    confirmada = _sc(db, "SC-CSC020", user_admin, estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow())
    resp = _post(confirmada.id)
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["sin_confirmacion_sc_at"] is None
    assert numeros == ["COT-"]
    # Con esa COT activa no se crea otra (N7, ahora tambien en este endpoint), sin gastar otro numero.
    resp = _post(confirmada.id)
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"].startswith("Esta solicitud ya tiene la cotización ")
    con_pedido = _sc(db, "SC-CSC021", user_admin, estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow())
    db.add(SaleOrder(numero="PVEN-CSC021", sc_id=con_pedido.id, customer_name="Cliente Prueba",
                     estado="PENDIENTE_COMPRA"))
    db.commit()
    resp = _post(con_pedido.id)
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == ("Esta solicitud ya tiene el pedido de venta PVEN-CSC021 activo; no se puede crear "
                                     "otra cotización.")
    assert numeros == ["COT-"]
    assert len(_cots_de(db, confirmada.id)) == 1

    # Sin sc_id (Cotizador Rapido) no cambia nada.
    resp = app_client.post("/api/v1/ventas/cotizaciones", json={
        "customer_name": "Cliente Prueba", "total_cop": 1000, "created_by": "t",
        "productos": [{"product_name": "Cuna", "qty": 1, "unit_price_cop": 1000}]}, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text


# --- 8. Asesor o administrador (R5) -----------------------------------------------------------------------------------

def test_el_asesor_puede_cotizar_sin_confirmacion(app_client, db, vendedor_token, user_vendedor, user_admin,
                                                  compras_token):
    from app.core.textos_actividad import nombre_de_usuario
    sc = _sc(db, "SC-CSC022", user_admin)
    resp = _cotizar(app_client, compras_token, sc.id, motivo=MOTIVO)
    assert resp.status_code == 403, resp.text
    resp = _cotizar(app_client, vendedor_token, sc.id, motivo=MOTIVO, cotizador="Otra Asesora")
    assert resp.status_code == 200, resp.text
    cot = resp.json()["data"]["cotizacion"]
    assert cot["cotizador"] == "Otra Asesora"
    [renglon] = _logs(db, "SC", sc.id, "COTIZADA_SIN_CONFIRMACION")
    assert renglon.user_name == nombre_de_usuario(user_vendedor) == user_vendedor.email


# --- Segunda puerta: PATCH /cotizaciones/{id} con sc_id (ruling T3-3) ------------------------------------------------

def test_vincular_una_cotizacion_a_una_solicitud_sin_confirmar_responde_409(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SalesQuotation
    destinos = [_sc(db, "SC-CSC023", user_admin),
                _sc(db, "SC-CSC024", user_admin, estado="PENDIENTE_CONFIRMACION"),
                _sc(db, "SC-CSC025", user_admin, estado="CONFIRMADA")]  # sin la marca
    suelta = _cot(db, "COT-CSC023")
    rechazada = _cot(db, "COT-CSC024", estado="RECHAZADA")  # retomarla despues la dejaria activa sin motivo
    for cot in (suelta, rechazada):
        for destino in destinos:
            resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}",
                                    json={"sc_id": destino.id, "updated_by": "t"}, headers=auth(admin_token))
            assert resp.status_code == 409, (cot.numero, destino.numero, resp.text)
            assert resp.json()["detail"] == (f"La solicitud {destino.numero} no ha sido confirmada por el cliente: usa "
                                             f"«Cotizar» en la solicitud para crear la cotización con el motivo.")
    db.expire_all()
    assert db.get(SalesQuotation, suelta.id).sc_id is None and db.get(SalesQuotation, rechazada.id).sc_id is None
    for destino in destinos:
        db.refresh(destino)
        assert _logs(db, "SC", destino.id) == []
    # Hacia una SC con la confirmacion vigente del cliente si se puede.
    confirmada = _sc(db, "SC-CSC026", user_admin, estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow())
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{suelta.id}", json={"sc_id": confirmada.id, "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["sc_id"] == confirmada.id


# --- R21: rechazar la cotizacion temprana no cambia la solicitud -------------------------------------------------------

def test_rechazar_la_cotizacion_temprana_no_cambia_la_solicitud(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-CSC027", user_admin)
    resp = _cotizar(app_client, admin_token, sc.id, motivo=MOTIVO)
    assert resp.status_code == 200, resp.text
    cot = resp.json()["data"]["cotizacion"]
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "RECHAZADA", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.gate1_confirmed_at is None
    [renglon] = _logs(db, "SC", sc.id, "COTIZACION_RECHAZADA")
    assert renglon.description == (f"La cotización {cot['numero']} fue rechazada. La solicitud sigue activa: "
                                   f"envíasela al cliente para que la confirme o cotízala de nuevo.")
    assert _logs(db, "SC", sc.id, "ESTADO_CHANGED") == []
    # Sin documentos activos se puede volver a cotizar.
    resp = _cotizar(app_client, admin_token, sc.id, motivo="Segundo intento con otro precio")
    assert resp.status_code == 200, resp.text


# --- R20: la alerta la lleva la cotizacion, no la solicitud ------------------------------------------------------------

def test_sc_con_cotizacion_temprana_no_cuenta_como_atrasada(app_client, db, admin_token, user_admin):
    viejo = datetime.datetime.utcnow() - datetime.timedelta(days=10)

    def _resumen():
        resp = app_client.get("/api/v1/ventas/alertas/resumen", headers=auth(admin_token))
        assert resp.status_code == 200, resp.text
        return resp.json()["data"]["atrasados"]

    def _sin_atender():
        resp = app_client.get("/api/v1/ventas/alertas", headers=auth(admin_token))
        assert resp.status_code == 200, resp.text
        return {s["id"] for s in resp.json()["data"]["sc_sin_atender"]}

    sc = _sc(db, "SC-CSC028", user_admin)
    control = _sc(db, "SC-CSC029", user_admin)  # control negativo: solo tiene una COT rechazada
    _cot(db, "COT-CSC029", control, estado="RECHAZADA", updated_at=datetime.datetime.utcnow())
    for s in (sc, control):
        s.updated_at = viejo
    db.commit()
    antes = _resumen()
    ids = _sin_atender()
    assert sc.id in ids and control.id in ids

    resp = _cotizar(app_client, admin_token, sc.id, motivo=MOTIVO)
    assert resp.status_code == 200, resp.text
    # Se vuelve a envejecer: sin esto la SC saldria de la cuenta solo por su updated_at nuevo, no por la regla.
    db.expire_all()
    sc = db.get(type(sc), sc.id)
    sc.updated_at = viejo
    db.commit()
    assert antes - _resumen() == 1  # la COT nueva es de hoy: no suma
    ids = _sin_atender()
    assert sc.id not in ids and control.id in ids


# --- get_cotizacion: estado de la SC con la misma lectura -------------------------------------------------------------

def test_el_detalle_de_la_cotizacion_trae_el_estado_de_la_solicitud_sin_otra_consulta(
        app_client, db, admin_token, user_admin, contador_sql):
    sc = _sc(db, "SC-CSC030", user_admin, estado="PENDIENTE_CONFIRMACION")
    cot = _cot(db, "COT-CSC030", sc)
    with contador_sql.ventana() as v:
        d = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token)).json()["data"]
    assert d["sc_estado"] == "PENDIENTE_CONFIRMACION" and d["sc_confirmacion_vigente"] is False
    assert len([s for s in v.sentencias if "FROM customer_requests" in s]) == 1, v.sentencias
    suelta = _cot(db, "COT-CSC031")
    d = app_client.get(f"/api/v1/ventas/cotizaciones/{suelta.id}", headers=auth(admin_token)).json()["data"]
    assert d["sc_estado"] is None and d["sc_confirmacion_vigente"] is None
    assert d["sin_confirmacion_sc_at"] is None and d["sin_confirmacion_sc_motivo"] is None


# --- nombre_de_usuario (R9) -------------------------------------------------------------------------------------------

def test_nombre_de_usuario_prefiere_username():
    from types import SimpleNamespace
    from app.core.textos_actividad import nombre_de_usuario
    assert nombre_de_usuario(SimpleNamespace(username="mquintero", email="m@x.co")) == "mquintero"
    assert nombre_de_usuario(SimpleNamespace(username=None, email="m@x.co")) == "m@x.co"
    assert nombre_de_usuario(SimpleNamespace(username="", email="m@x.co")) == "m@x.co"
    assert nombre_de_usuario(SimpleNamespace(username=None, email=None)) == "Sistema"
    assert nombre_de_usuario(SimpleNamespace(email="m@x.co")) == "m@x.co"  # objeto sin el atributo
    assert nombre_de_usuario(None) == "Sistema"
