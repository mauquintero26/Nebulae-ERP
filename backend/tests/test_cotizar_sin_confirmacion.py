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
SC_ID_INVALIDO = "El campo sc_id debe ser el número de una solicitud."


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


def _post_crudo(app_client, token, metodo, ruta, sc_id_crudo):
    """JSON escrito a mano: json= no puede mandar 1e400 tal cual (Python lo vuelve Infinity)."""
    contenido = ('{"sc_id": ' + sc_id_crudo + ', "total_cop": 1000, "updated_by": "t", '
                 '"productos": [{"product_name": "Cuna", "qty": 1, "unit_price_cop": 1000}]}')
    return getattr(app_client, metodo)(ruta, content=contenido,
                                       headers={**auth(token), "Content-Type": "application/json"})


def _rechazar(app_client, token, cot_id):
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot_id}", json={"estado": "RECHAZADA", "updated_by": "t"},
                            headers=auth(token))
    assert resp.status_code == 200, resp.text


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
    # Ronda 1: un sc_id que no es el numero de una solicitud (infinito, bool o decimal) es 422, no un 500.
    for crudo in ("Infinity", "-Infinity", "1e400", "true", "12.5"):
        resp = _post_crudo(app_client, admin_token, "post", "/api/v1/ventas/cotizaciones", crudo)
        assert resp.status_code == 422, (crudo, resp.text)
        assert resp.json()["detail"] == SC_ID_INVALIDO, crudo
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


def test_el_cotizador_no_puede_pasar_de_150_caracteres(app_client, db, admin_token, user_admin, monkeypatch):
    """Ronda 1: la columna es String(150); antes, 151 caracteres daban 500 con un numero de seq_cot ya gastado."""
    import app.api.v1.erp_ventas as erp_ventas
    numeros = []
    original = erp_ventas._gen_numero
    monkeypatch.setattr(erp_ventas, "_gen_numero", lambda db_, p, s: numeros.append(p) or original(db_, p, s))
    sc = _sc(db, "SC-CSC033", user_admin)
    resp = _cotizar(app_client, admin_token, sc.id, motivo=MOTIVO, cotizador="x" * 151)
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "El cotizador no puede tener más de 150 caracteres."
    assert numeros == [] and _cots_de(db, sc.id) == []
    resp = _cotizar(app_client, admin_token, sc.id, motivo=MOTIVO, cotizador=f"  {'y' * 150}  ")  # sin los bordes
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["cotizacion"]["cotizador"] == "y" * 150


def test_t11_a1_el_cotizador_largo_da_422_en_las_otras_dos_puertas_sin_gastar_numero(app_client, db, admin_token,
                                                                                       user_admin, monkeypatch):
    """T11 calidad (A1): en /confirmar y en POST /cotizaciones un cotizador de 151 caracteres daba 500 con un numero de
    seq_cot ya gastado. Ahora es el mismo 422 de /cotizar-sin-confirmacion, ANTES de pedir el numero."""
    from sqlalchemy import text
    import app.api.v1.erp_ventas as erp_ventas
    numeros = []
    original = erp_ventas._gen_numero
    monkeypatch.setattr(erp_ventas, "_gen_numero", lambda db_, p, s: numeros.append(p) or original(db_, p, s))
    ultimo_numero = lambda: db.execute(text("SELECT last_value FROM seq_cot")).scalar()  # noqa: E731
    detalle = "El cotizador no puede tener más de 150 caracteres."
    linea = [{"product_name": "Cuna", "qty": 1, "unit_price_cop": 1000}]
    confirmada = _sc(db, "SC-CSC050", user_admin, estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow())
    antes = ultimo_numero()

    resp = app_client.post(f"/api/v1/ventas/solicitudes/{confirmada.id}/confirmar",
                           json={"cotizador": "x" * 151, "user_name": "t"}, headers=auth(admin_token))
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == detalle
    for extra in ({"sc_id": confirmada.id}, {"customer_name": "Cliente Prueba"}):  # con SC y Cotizador Rapido
        resp = app_client.post("/api/v1/ventas/cotizaciones", headers=auth(admin_token), json={
            "total_cop": 1000, "created_by": "t", "productos": linea, "cotizador": "x" * 151, **extra})
        assert resp.status_code == 422, (extra, resp.text)
        assert resp.json()["detail"] == detalle, extra
    assert numeros == [] and ultimo_numero() == antes
    assert _cots_de(db, confirmada.id) == []

    # 150 caracteres caben (la columna es String(150)).
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{confirmada.id}/confirmar",
                           json={"cotizador": "y" * 150, "user_name": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["cotizacion"]["cotizador"] == "y" * 150
    resp = app_client.post("/api/v1/ventas/cotizaciones", headers=auth(admin_token), json={
        "customer_name": "Cliente Prueba", "total_cop": 1000, "created_by": "t", "productos": linea,
        "cotizador": "z" * 150})
    assert resp.status_code == 201, resp.text
    assert numeros == ["COT-", "COT-"]


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
    # Ronda 1: un sc_id infinito, bool o decimal es 422 (antes Infinity/1e400 daban 500 por OverflowError).
    for crudo in ("Infinity", "-Infinity", "1e400", "true", "12.5"):
        resp = _post_crudo(app_client, admin_token, "patch", f"/api/v1/ventas/cotizaciones/{suelta.id}", crudo)
        assert resp.status_code == 422, (crudo, resp.text)
        assert resp.json()["detail"] == SC_ID_INVALIDO, crudo
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


def test_un_pedido_ligado_por_la_cotizacion_saca_a_la_sc_de_las_alertas_sin_tocar_a_las_demas(
        app_client, db, admin_token, user_admin):
    """Ronda 1 (R20, sin depender de la base): el PVEN vigente que cuelga de una COT RECHAZADA de la SC (cot_id, sin
    sc_id) tambien cuenta como documento activo. Una SC sin documentos sigue contando: si la subconsulta de las COT de
    la SC no se correlaciona, ese mismo PVEN sacaria de las alertas a TODAS las SC."""
    from app.models.erp_documents import SaleOrder
    viejo = datetime.datetime.utcnow() - datetime.timedelta(days=10)

    def _resumen():
        return app_client.get("/api/v1/ventas/alertas/resumen", headers=auth(admin_token)).json()["data"]["atrasados"]

    def _sin_atender():
        return {s["id"] for s in app_client.get("/api/v1/ventas/alertas", headers=auth(admin_token))
                .json()["data"]["sc_sin_atender"]}

    con_pedido = _sc(db, "SC-CSC034", user_admin)
    sin_documentos = _sc(db, "SC-CSC035", user_admin)
    rechazada = _cot(db, "COT-CSC034", con_pedido, estado="RECHAZADA", updated_at=datetime.datetime.utcnow())
    for s in (con_pedido, sin_documentos):
        s.updated_at = viejo
    db.commit()
    antes = _resumen()
    assert {con_pedido.id, sin_documentos.id} <= _sin_atender()

    db.add(SaleOrder(numero="PVEN-CSC034", cot_id=rechazada.id, sc_id=None, customer_name="Cliente Prueba",
                     estado="PENDIENTE_COMPRA"))  # de hoy: no cuenta como pedido atrasado
    db.commit()
    assert antes - _resumen() == 1
    ids = _sin_atender()
    assert con_pedido.id not in ids and sin_documentos.id in ids


# --- Ronda 1 de seguridad: las puertas A, B y C ------------------------------------------------------------------------

def test_a_cambiar_los_productos_con_la_cot_temprana_y_el_enlace_pendiente_lo_anula(app_client, db, admin_token,
                                                                                     user_admin):
    """Puerta A: con el enlace PENDIENTE la COT temprana no es una confirmacion del cliente. Cambiar los productos (o el
    cliente) reinicia la SC a ASIGNADA y revoca el enlace, como sin cotizacion; la COT no cambia."""
    from app.models.erp_documents import SalesQuotation
    sc = _sc(db, "SC-CSC036", user_admin, customer_email="cliente@test.nebulae")
    raw = _enviar_sc(app_client, admin_token, sc.id)
    resp = _cotizar(app_client, admin_token, sc.id, motivo=MOTIVO)
    assert resp.status_code == 200, resp.text
    cot = resp.json()["data"]["cotizacion"]
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "productos": [LINEA, {"product_name": "Coche", "qty": 2}], "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "ASIGNADA"
    assert _token_usado(db, raw)
    cambio = _logs(db, "SC", sc.id, "ESTADO_CHANGED")[-1]
    assert (cambio.old_estado, cambio.new_estado) == ("PENDIENTE_CONFIRMACION", "ASIGNADA")
    assert "se modificaron los productos" in cambio.description
    resp = _canjear(app_client, raw, "csc-036")
    assert resp.status_code == 400, resp.text
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.gate1_confirmed_at is None
    db.expire_all()
    fila = db.get(SalesQuotation, cot["id"])
    assert (fila.estado, fila.sc_id, fila.sin_confirmacion_sc_motivo) == ("BORRADOR", sc.id, MOTIVO)
    assert [p["product_name"] for p in fila.productos] == ["Cuna Colecho"]  # la COT no cambia

    # Lo mismo si cambia el cliente con el enlace pendiente y la COT temprana. S9 (T11): el correo y el telefono ya no
    # cambian por este PATCH (van por /cliente, probado en test_solicitud_corregir_datos_cliente); cambiar de ficha si.
    import uuid
    from app.models.customers import Customer
    otra = Customer(first_name="Otra", last_name="Ficha", email=f"otra-{uuid.uuid4().hex[:6]}@test.nebulae")
    db.add(otra); db.commit()
    sc2 = _sc(db, "SC-CSC037", user_admin, customer_email="uno@test.nebulae")
    raw2 = _enviar_sc(app_client, admin_token, sc2.id)
    assert _cotizar(app_client, admin_token, sc2.id, motivo=MOTIVO).status_code == 200
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc2.id}", json={
        "customer_id": otra.id, "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "ASIGNADA" and _token_usado(db, raw2)


RETOMAR_SIN_CONFIRMACION = ("La solicitud {sc} no tiene la confirmación del cliente vigente: envíasela para que la "
                            "confirme, o usa «Cotizar» en la solicitud con el motivo.")


def test_b_retomar_una_rechazada_exige_la_confirmacion_vigente(app_client, db, admin_token, user_admin):
    """Puerta B: retomar una COT RECHAZADA (a Borrador o a Vencida) la deja activa en la SC: exige la confirmacion
    vigente del cliente, salvo que la COT sea la creada sin confirmacion en esa misma SC."""
    from app.models.erp_documents import SalesQuotation
    sc = _sc(db, "SC-CSC038", user_admin, estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow())
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    cot_id = resp.json()["data"]["cotizacion"]["id"]
    _rechazar(app_client, admin_token, cot_id)
    # Cambian los productos: la confirmacion deja de valer (sin COT activa la SC vuelve a ASIGNADA).
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "productos": [{"product_name": "Otra", "qty": 1}], "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    for destino in ("BORRADOR", "VENCIDA"):  # VENCIDA tambien es activa (RECHAZADA -> VENCIDA -> BORRADOR)
        resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot_id}", json={"estado": destino, "updated_by": "t"},
                                headers=auth(admin_token))
        assert resp.status_code == 409, (destino, resp.text)
        assert resp.json()["detail"] == RETOMAR_SIN_CONFIRMACION.format(sc="SC-CSC038")
        db.expire_all()
        assert db.get(SalesQuotation, cot_id).estado == "RECHAZADA"

    # Con la confirmacion del cliente vigente se puede retomar.
    confirmada = _sc(db, "SC-CSC039", user_admin, estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow())
    vieja = _cot(db, "COT-CSC039", confirmada, estado="RECHAZADA")
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{vieja.id}", json={"estado": "BORRADOR", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    # La COT temprana de esa misma SC tambien (ya tiene su motivo y su registro).
    temprana_sc = _sc(db, "SC-CSC040", user_admin)
    resp = _cotizar(app_client, admin_token, temprana_sc.id, motivo=MOTIVO)
    temprana = resp.json()["data"]["cotizacion"]
    _rechazar(app_client, admin_token, temprana["id"])
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{temprana['id']}",
                            json={"estado": "BORRADOR", "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


def test_c_la_marca_sin_confirmacion_no_viaja_con_la_cotizacion(app_client, db, admin_token, user_admin):
    """Puerta C: al cambiar de solicitud (o desvincularla) la COT pierde sin_confirmacion_sc_at/_motivo en el mismo
    commit; el renglon UPDATED de la COT guarda el motivo que tenia. Sin esto, mover -> rechazar -> retomar en otra SC
    sin confirmar pasaria la guarda de la puerta B."""
    from app.models.erp_documents import SalesQuotation
    origen = _sc(db, "SC-CSC041", user_admin)
    cot = _cotizar(app_client, admin_token, origen.id, motivo=MOTIVO).json()["data"]["cotizacion"]
    destino = _sc(db, "SC-CSC042", user_admin, estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow())
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"sc_id": destino.id, "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["sin_confirmacion_sc_at"] is None
    assert resp.json()["data"]["sin_confirmacion_sc_motivo"] is None
    db.expire_all()
    fila = db.get(SalesQuotation, cot["id"])
    assert fila.sin_confirmacion_sc_at is None and fila.sin_confirmacion_sc_motivo is None
    [editada] = _logs(db, "COT", cot["id"], "UPDATED")
    assert {"campo": "sin_confirmacion_sc_motivo", "etiqueta": "Sin confirmación del cliente", "antes": MOTIVO,
            "despues": None} in editada.extra_data["cambios"]
    # La auditoria sigue en la SC de origen y en el CREATED de la COT.
    assert len(_logs(db, "SC", origen.id, "COTIZADA_SIN_CONFIRMACION")) == 1
    assert "sin confirmación del cliente" in _logs(db, "COT", cot["id"], "CREATED")[0].description

    # Recorrido completo: rechazarla en el destino, cambiar los productos del destino (pierde la confirmacion) y retomar.
    _rechazar(app_client, admin_token, cot["id"])
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{destino.id}", json={
        "productos": [{"product_name": "Otra", "qty": 1}], "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(destino)
    assert destino.estado == "ASIGNADA" and destino.gate1_confirmed_at is None
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "BORRADOR", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == RETOMAR_SIN_CONFIRMACION.format(sc="SC-CSC042")

    # Desvincularla tambien limpia la marca.
    otra_sc = _sc(db, "SC-CSC043", user_admin)
    otra = _cotizar(app_client, admin_token, otra_sc.id, motivo=MOTIVO).json()["data"]["cotizacion"]
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{otra['id']}", json={"sc_id": None, "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.expire_all()
    fila = db.get(SalesQuotation, otra["id"])
    assert fila.sc_id is None and fila.sin_confirmacion_sc_at is None and fila.sin_confirmacion_sc_motivo is None


# --- T11 (S1): un estado vacio o falso en el PATCH no se salta la puerta B -------------------------------------------

ESTADO_NO_VALIDO = "Estado no válido."
ESTADOS_NO_VALIDOS = ("", "   ", 0, False, None, [], {})


def test_s1_un_estado_vacio_o_falso_no_revive_una_cotizacion_rechazada(app_client, db, admin_token, user_admin):
    """S1 (T11): '', 0, false y null contaban como «sin cambio» en las guardas, pero el PATCH los escribia. Con {estado:''}
    y despues {estado:'BORRADOR'} una COT RECHAZADA volvia a estar activa en una SC sin confirmar, sin motivo ni
    renglon (puerta B). Ahora son 422 sin escribir nada, y el BORRADOR siguiente sigue dando el 409 de la puerta B."""
    from app.models.erp_documents import SalesQuotation
    sc = _sc(db, "SC-CSC044", user_admin)  # ASIGNADA, con asesor y productos, sin la confirmacion del cliente
    cot = _cot(db, "COT-CSC044", sc, estado="RECHAZADA")  # sin la marca de cotizada sin confirmacion

    def _patch_estado(estado):
        return app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": estado, "updated_by": "t"},
                                headers=auth(admin_token))

    for estado in ESTADOS_NO_VALIDOS:
        resp = _patch_estado(estado)
        assert resp.status_code == 422, (estado, resp.text)
        assert resp.json()["detail"] == ESTADO_NO_VALIDO, estado
        db.expire_all()
        assert db.get(SalesQuotation, cot.id).estado == "RECHAZADA", estado
    # La secuencia del ataque: '' y despues BORRADOR -> 422 y el 409 de la puerta B.
    assert _patch_estado("").status_code == 422
    resp = _patch_estado("BORRADOR")
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == RETOMAR_SIN_CONFIRMACION.format(sc="SC-CSC044")
    db.expire_all()
    assert db.get(SalesQuotation, cot.id).estado == "RECHAZADA"
    assert _logs(db, "COT", cot.id) == [] and _logs(db, "SC", sc.id) == []


# --- T11 (S4): la excepcion de la puerta B exige que hoy se pueda cotizar sin confirmacion -----------------------------

SIN_PRODUCTOS = ("La solicitud no tiene productos para cotizar. Agrégalos en la solicitud y vuelve a enviársela al "
                 "cliente para que la confirme.")


def _no_se_puede_retomar(cot_numero, sc_numero, impedimento):
    return (f"No se puede retomar la cotización {cot_numero}: la solicitud {sc_numero} no tiene la confirmación del "
            f"cliente vigente y hoy no se podría cotizar sin ella. {impedimento}")


def test_s4_retomar_la_cotizacion_temprana_exige_que_la_solicitud_se_pueda_cotizar_sin_confirmacion(
        app_client, db, admin_token, user_admin):
    """S4 (T11): la marca sin_confirmacion_sc_at sola no basta para retomar una COT temprana RECHAZADA. La SC tiene que
    cumplir HOY lo que pide /cotizar-sin-confirmacion: no es Soporte, esta Asignada, Pendiente o Confirmada (sin la
    confirmacion vigente), tiene asesor y tiene productos. Si no, 409 y la COT sigue RECHAZADA. Cuando se puede, el
    renglon del cambio de estado lleva el autor de la sesion, no el updated_by del body."""
    from app.core.textos_actividad import nombre_de_usuario
    from app.models.erp_documents import CustomerRequest, SalesQuotation
    sc = _sc(db, "SC-CSC045", user_admin)
    cot = _cotizar(app_client, admin_token, sc.id, motivo=MOTIVO).json()["data"]["cotizacion"]   # 1. COT temprana
    _rechazar(app_client, admin_token, cot["id"])                                                # 2. rechazada
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"advisor_user_id": None, "updated_by": "t"},
                            headers=auth(admin_token))                                           # 3. sin asesor
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "BORRADOR"

    def _retomar():
        return app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}",
                                json={"estado": "BORRADOR", "updated_by": "otra persona"}, headers=auth(admin_token))

    resp = _retomar()                                                                            # 4. -> 409
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == _no_se_puede_retomar(cot["numero"], "SC-CSC045",
                                                         "Asigna un asesor a la solicitud antes de cotizarla.")
    db.expire_all()
    assert db.get(SalesQuotation, cot["id"]).estado == "RECHAZADA"
    resp = _cotizar(app_client, admin_token, sc.id, motivo=MOTIVO)                               # 5. control
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == "Asigna un asesor a la solicitud antes de cotizarla."

    # Las demas precondiciones de /cotizar-sin-confirmacion, una por una (la SC vuelve a estar Asignada con asesor).
    asignada = {"estado": "ASIGNADA", "advisor_user_id": user_admin.id, "advisor_name": user_admin.email,
                "productos": [LINEA], "tipo_solicitud": "Cotizacion de Producto"}
    casos = [
        ({"advisor_user_id": None}, "Asigna un asesor a la solicitud antes de cotizarla."),  # Asignada sin asesor
        ({"productos": [{"product_name": "  ", "qty": 1}]}, SIN_PRODUCTOS),
        ({"tipo_solicitud": "Soporte Tecnico"}, "Las solicitudes de Soporte Técnico no se cotizan."),
        ({"estado": "COTIZADA"}, "No se puede cotizar sin confirmación una solicitud en estado Cotizada."),
    ]
    for cambio, impedimento in casos:
        db.query(CustomerRequest).filter(CustomerRequest.id == sc.id).update({**asignada, **cambio},
                                                                              synchronize_session=False)
        db.commit()
        resp = _retomar()
        assert resp.status_code == 409, (cambio, resp.text)
        assert resp.json()["detail"] == _no_se_puede_retomar(cot["numero"], "SC-CSC045", impedimento), cambio
        db.expire_all()
        assert db.get(SalesQuotation, cot["id"]).estado == "RECHAZADA", cambio
    assert _logs(db, "COT", cot["id"], "ESTADO_CHANGED")[-1].new_estado == "RECHAZADA"  # ninguno la retomo

    # Con la SC Asignada, con asesor y productos, si se retoma; el renglon es del usuario de la sesion.
    db.query(CustomerRequest).filter(CustomerRequest.id == sc.id).update(asignada, synchronize_session=False)
    db.commit()
    resp = _retomar()
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "BORRADOR"
    retomada = _logs(db, "COT", cot["id"], "ESTADO_CHANGED")[-1]
    assert (retomada.old_estado, retomada.new_estado) == ("RECHAZADA", "BORRADOR")
    assert retomada.user_name == nombre_de_usuario(user_admin)


# --- T11 (S5): el motivo de la excepcion no se llena con caracteres invisibles ------------------------------------------

def test_s5_el_motivo_no_se_llena_con_caracteres_invisibles_ni_con_relleno(app_client, db, admin_token, user_admin):
    """S5 (T11): strip() no quita U+200B, U+00AD ni el relleno Hangul (U+3164): diez de esos, o '..........', pasaban el
    minimo de 10 y la auditoria de la excepcion quedaba en blanco. El motivo se normaliza (NFKC, sin caracteres de
    formato ni de control, los espacios de cualquier tipo y los saltos de linea como un espacio, sin bordes), se mide
    limpio y exige al menos 5 letras o digitos. Se guarda limpio.
    T11 calidad (D1): con 10 caracteres o mas pero menos de 5 letras o digitos el 422 dice eso, no «10 caracteres»."""
    corto = "El motivo debe tener al menos 10 caracteres."
    pocas_letras = {"..........", "-- !! ?? ..", "abcd......"}  # 10 o mas caracteres limpios, menos de 5 letras
    sc = _sc(db, "SC-CSC046", user_admin)
    for motivo in ("\u200b" * 10, "\u00ad" * 12, "\ufeff\u2060" * 6, "\u2028\u2029" * 6, "\u3164" * 10,
                   "\uffa0" * 10, "..........", "-- !! ?? ..", "abcd......", " \u200b a\u200bb\u200bc\u200bd \u200b "):
        resp = _cotizar(app_client, admin_token, sc.id, motivo=motivo)
        assert resp.status_code == 422, (motivo, resp.text)
        esperado = "El motivo debe tener al menos 5 letras o números." if motivo in pocas_letras else corto
        assert resp.json()["detail"] == esperado, motivo
    assert _cots_de(db, sc.id) == []
    assert _logs(db, "SC", sc.id) == []

    # Un motivo normal pasa y se guarda limpio: sin los invisibles, con los espacios y los saltos de linea en uno solo.
    resp = _cotizar(app_client, admin_token, sc.id,
                    motivo="  Cliente\u200b pidió\u00a0\u00a0precio\n\nurgente   por teléfono\u00ad \t")
    assert resp.status_code == 200, resp.text
    limpio = "Cliente pidió precio urgente por teléfono"
    assert resp.json()["data"]["cotizacion"]["sin_confirmacion_sc_motivo"] == limpio
    [renglon] = _logs(db, "SC", sc.id, "COTIZADA_SIN_CONFIRMACION")
    assert renglon.extra_data["motivo"] == limpio and renglon.description.endswith(f"Motivo: {limpio}")
    # Cinco letras o digitos alcanzan; el largo se mide sin los invisibles (500 visibles y 20 invisibles pasan).
    for i, motivo in enumerate(("abcde.....", "x" * 500 + "\u200b" * 20)):
        otra = _sc(db, f"SC-CSC04{7 + i}", user_admin)
        resp = _cotizar(app_client, admin_token, otra.id, motivo=motivo)
        assert resp.status_code == 200, (motivo[:12], resp.text)
        assert resp.json()["data"]["cotizacion"]["sin_confirmacion_sc_motivo"] == motivo.replace("\u200b", "")
    resp = _cotizar(app_client, admin_token, _sc(db, "SC-CSC049", user_admin).id, motivo="y" * 501 + "\u200b")
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "El motivo no puede tener más de 500 caracteres."


def test_t11_f3_los_jeroglificos_en_blanco_no_llenan_el_motivo(app_client, db, admin_token, user_admin):
    """T11 calidad (F3, residual de S5): U+13441 y U+13442 (EGYPTIAN HIEROGLYPH FULL/HALF BLANK) son Lo e isalnum() los
    cuenta: diez de ellos pasaban el minimo. Ahora estan en _RELLENOS_INVISIBLES y se quitan como los rellenos Hangul."""
    from app.api.v1.erp_ventas import _RELLENOS_INVISIBLES
    corto = "El motivo debe tener al menos 10 caracteres."
    sc = _sc(db, "SC-CSC051", user_admin)
    for cp in (0x13441, 0x13442):
        blanco = chr(cp)
        assert blanco in _RELLENOS_INVISIBLES and blanco.isalnum()
        for motivo, detalle in ((blanco * 10, corto), ("ab" + blanco * 10, corto),
                                ("abcd " + blanco * 10 + " .....", "El motivo debe tener al menos 5 letras o números.")):
            resp = _cotizar(app_client, admin_token, sc.id, motivo=motivo)
            assert resp.status_code == 422, (hex(cp), resp.text)
            assert resp.json()["detail"] == detalle, hex(cp)
    assert _cots_de(db, sc.id) == []
    # Con texto de verdad pasa y se guarda sin los blancos.
    resp = _cotizar(app_client, admin_token, sc.id, motivo="Cliente " + chr(0x13441) * 3 + "pidió precio urgente")
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["cotizacion"]["sin_confirmacion_sc_motivo"] == "Cliente pidió precio urgente"


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
