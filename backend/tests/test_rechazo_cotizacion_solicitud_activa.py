"""N7: rechazar una cotizacion deja la solicitud activa (y el arreglo de seguridad de Gate 1).

- Rechazar la unica COT activa: la SC se queda en CONFIRMADA si la confirmacion del cliente sigue vigente
  (gate1_confirmed_at; U15: la Actividad lo anota con COTIZACION_RECHAZADA), y se le puede crear otra COT sin
  reconfirmar; si no, vuelve a ASIGNADA (BORRADOR sin asesor). El lead no se mueve (pasa a perdido solo al cancelar la
  SC). U15 (Bloque 2): crear la COT ya no lleva la SC a COTIZADA.
- gate1_confirmed_at ya no se consume al crear la COT: significa "confirmacion vigente sobre los productos actuales".
  Se invalida al cambiar los productos (aunque haya COT activa), al reiniciar la SC por PATCH, al cancelar, al
  restaurar y -- arreglo de seguridad (choque N7 vs Ronda 6) -- cuando la COT cambia de solicitud: PATCH de la COT
  {sc_id: ...} limpia la marca de la SC anterior y ya no se acepta libremente.
- confirmar_solicitud no crea otra COT mientras haya una activa (o un pedido vigente); retomar una COT rechazada
  cuando la SC ya tiene otra activa -> 409.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_rechazo_cotizacion_solicitud_activa
"""
import datetime

LINEA = {"product_name": "Cuna Colecho", "qty": 1}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sc(db, numero, user_admin, con_marca=True, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "CONFIRMADA")
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", advisor_user_id=user_admin.id,
                         advisor_name=user_admin.email, productos=[LINEA],
                         gate1_confirmed_at=datetime.datetime.utcnow() if con_marca else None, **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _crear_cot(app_client, token, sc_id):
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc_id}/confirmar", json={"user_name": "t"}, headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["cotizacion"]


def _patch_cot(app_client, token, cot_id, **body):
    body.setdefault("updated_by", "t")
    return app_client.patch(f"/api/v1/ventas/cotizaciones/{cot_id}", json=body, headers=auth(token))


def _logs(db, entidad, entity_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entity_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def test_rechazar_unica_cotizacion_deja_la_solicitud_lista_para_otra(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-RCH001", user_admin)
    cot1 = _crear_cot(app_client, admin_token, sc.id)
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None  # U15; la marca ya no se consume

    resp = _patch_cot(app_client, admin_token, cot1["id"], estado="RECHAZADA")
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None
    # U15: la SC no cambia de estado; el rechazo queda en su Actividad con COTIZACION_RECHAZADA (sin old/new).
    (cambio,) = _logs(db, "SC", sc.id, "COTIZACION_RECHAZADA")
    assert cambio.description == (f"La cotización {cot1['numero']} fue rechazada. La solicitud sigue activa: ya puedes "
                                  "crearle una nueva cotización.")
    assert (cambio.old_estado, cambio.new_estado, cambio.user_name) == (None, None, "t")

    cot2 = _crear_cot(app_client, admin_token, sc.id)
    assert cot2["id"] != cot1["id"] and cot2["estado"] == "BORRADOR"
    assert cot2["productos"] == [LINEA]
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"
    (creada,) = _logs(db, "COT", cot2["id"], "CREATED")
    assert creada.description == (f"Cotización {cot2['numero']} creada desde SC-RCH001 (reemplaza a la cotización "
                                  f"rechazada {cot1['numero']})")


def test_rechazar_una_cotizacion_confirmada_sin_pedido_deja_el_aviso_sin_cambiar_el_estado(
        app_client, db, admin_token, user_admin):
    """La SC ya estaba CONFIRMADA (sincronizada desde la COT confirmada) y la marca sigue vigente: queda CONFIRMADA y
    la Actividad lo cuenta sin un 'Confirmada -> Confirmada'."""
    from app.models.erp_documents import SalesQuotation
    sc = _sc(db, "SC-RCH012", user_admin)
    cot = SalesQuotation(numero="COT-RCH012", sc_id=sc.id, sc_numero=sc.numero, customer_name="Cliente Prueba",
                         estado="CONFIRMADA", gate2_confirmed_at=datetime.datetime.utcnow())
    db.add(cot); db.commit()
    resp = _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA")
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None
    assert _logs(db, "SC", sc.id, "ESTADO_CHANGED") == []
    (aviso,) = _logs(db, "SC", sc.id, "COTIZACION_RECHAZADA")  # U15: renglon propio del rechazo
    assert "COT-RCH012 fue rechazada" in aviso.description and aviso.old_estado is None


def test_no_se_crea_otra_cotizacion_mientras_haya_una_activa(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-RCH002", user_admin)
    cot1 = _crear_cot(app_client, admin_token, sc.id)
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"  # U15: crear la COT ya no la lleva a COTIZADA
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == (f"Esta solicitud ya tiene la cotización {cot1['numero']} activa; no se puede crear "
                                     "otra. Si el cliente no la aceptó, márcala como Rechazada y vuelve a intentarlo.")


def test_no_se_crea_otra_cotizacion_con_un_pedido_vigente(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SalesQuotation, SaleOrder
    sc = _sc(db, "SC-RCH003", user_admin)
    db.add(SalesQuotation(numero="COT-RCH003", sc_id=sc.id, sc_numero=sc.numero, customer_name="Cliente Prueba",
                          estado="RECHAZADA"))
    db.add(SaleOrder(numero="PVEN-RCH003", sc_id=sc.id, customer_name="Cliente Prueba", estado="PENDIENTE_COMPRA"))
    db.commit()
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == ("Esta solicitud ya tiene el pedido de venta PVEN-RCH003 activo; no se puede crear "
                                     "otra cotización.")


def test_rechazo_sin_confirmacion_vigente_pide_reenviar(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-RCH004", user_admin)
    cot1 = _crear_cot(app_client, admin_token, sc.id)
    sc.gate1_confirmed_at = None
    db.commit()
    resp = _patch_cot(app_client, admin_token, cot1["id"], estado="RECHAZADA")
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"
    cambio = _logs(db, "SC", sc.id, "ESTADO_CHANGED")[-1]
    assert cambio.description == (f"La cotización {cot1['numero']} fue rechazada. La solicitud sigue activa; para "
                                  "crearle otra cotización, reenvíasela al cliente para que la confirme.")
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 400, resp.text

    # Sin asesor la SC queda en BORRADOR.
    sin_asesor = _sc(db, "SC-RCH004B", user_admin, con_marca=False)
    sin_asesor.advisor_user_id = None
    db.commit()
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-RCH004B", sc_id=sin_asesor.id, sc_numero=sin_asesor.numero,
                         customer_name="Cliente Prueba", estado="BORRADOR")
    db.add(cot); db.commit()
    resp = _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA")
    assert resp.status_code == 200, resp.text
    db.refresh(sin_asesor)
    assert sin_asesor.estado == "BORRADOR"


def test_cambiar_productos_tras_el_rechazo_anula_la_confirmacion(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-RCH005", user_admin)
    cot1 = _crear_cot(app_client, admin_token, sc.id)
    assert _patch_cot(app_client, admin_token, cot1["id"], estado="RECHAZADA").status_code == 200
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "productos": [{"product_name": "Cuna Colecho", "qty": 3}], "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.gate1_confirmed_at is None


def test_cambiar_productos_con_cotizacion_activa_anula_la_confirmacion_sin_cambiar_el_estado(
        app_client, db, admin_token, user_admin):
    """Con COT activa el estado no cambia, pero la marca deja de valer: si esa COT se rechaza, la SC no puede
    crear otra con productos que el cliente no confirmo."""
    sc = _sc(db, "SC-RCH006", user_admin)
    cot1 = _crear_cot(app_client, admin_token, sc.id)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "productos": [{"product_name": "Otra cosa", "qty": 1}], "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is None  # U15: crear la COT no la mueve
    assert _patch_cot(app_client, admin_token, cot1["id"], estado="RECHAZADA").status_code == 200
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"


def test_retomar_cotizacion_rechazada_con_otra_activa_se_bloquea(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-RCH007", user_admin)
    cot1 = _crear_cot(app_client, admin_token, sc.id)
    assert _patch_cot(app_client, admin_token, cot1["id"], estado="RECHAZADA").status_code == 200
    cot2 = _crear_cot(app_client, admin_token, sc.id)
    resp = _patch_cot(app_client, admin_token, cot1["id"], estado="BORRADOR")
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == (f"La solicitud SC-RCH007 ya tiene la cotización {cot2['numero']} activa; no se "
                                     f"puede retomar esta. Trabaja sobre {cot2['numero']} o recházala primero.")
    from app.models.erp_documents import SalesQuotation
    db.expire_all()
    assert db.get(SalesQuotation, cot1["id"]).estado == "RECHAZADA"

    # Sin otra activa, retomarla si se puede: vuelve a Borrador y la SC se queda CONFIRMADA (U15: una COT en Borrador
    # no cambia la solicitud).
    assert _patch_cot(app_client, admin_token, cot2["id"], estado="RECHAZADA").status_code == 200
    resp = _patch_cot(app_client, admin_token, cot1["id"], estado="BORRADOR")
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"


# --- Arreglo de seguridad: la COT ya no cambia de solicitud libremente -----------------------------------

def _cot_confirmada_por_el_cliente(app_client, db, token, sc):
    """Flujo real: COT creada desde la SC, con precio, enviada y confirmada por el enlace (U15: la SC sigue
    CONFIRMADA todo el tiempo, con su marca todavia puesta)."""
    from app.models.erp_documents import SalesQuotation
    cot = _crear_cot(app_client, token, sc.id)
    fila = db.get(SalesQuotation, cot["id"])
    fila.productos = [{"product_name": "Cuna Colecho", "qty": 1, "unit_price_cop": 1000}]
    fila.total_cop = 1000
    db.commit()
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot['id']}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(token))
    assert resp.status_code == 200, resp.text
    raw = resp.json()["link_confirmacion"].rsplit("/", 1)[-1]
    resp = app_client.post("/api/v1/confirmar/confirmar", json={"token": raw},
                           headers={"Idempotency-Key": f"rch-{cot['id']}"})
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None
    return cot


def test_una_cotizacion_en_el_ciclo_de_gate2_no_cambia_de_solicitud(app_client, db, admin_token, user_admin):
    """Ataque de la Ronda 6 con la marca puesta: COT confirmada por el cliente -> SC CONFIRMADA (con la marca) ->
    PATCH COT {sc_id: null} -> POST /solicitudes/{id}/confirmar crearia otra COT sin que el cliente reconfirme. Una COT
    pendiente de confirmacion, confirmada o vencida ya no cambia de solicitud (solo Borrador o Rechazada)."""
    from app.models.erp_documents import SalesQuotation
    sc = _sc(db, "SC-RCH008", user_admin)
    cot = _cot_confirmada_por_el_cliente(app_client, db, admin_token, sc)
    resp = _patch_cot(app_client, admin_token, cot["id"], sc_id=None)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == ("Solo se puede cambiar la solicitud de una cotización en Borrador o Rechazada "
                                     "(estado actual: Confirmada).")
    db.expire_all()
    fila = db.get(SalesQuotation, cot["id"])
    assert fila.sc_id == sc.id and fila.estado == "CONFIRMADA" and fila.gate2_confirmed_at is not None
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 400, resp.text
    assert "ya tiene la cotización" in resp.json()["detail"]

    for estado, etiqueta in (("PENDIENTE_CONFIRMACION", "Esperando confirmación del cliente"),
                             ("VENCIDA", "Vencida"), ("ENVIADA", "Enviada al cliente")):
        fila.estado = estado
        db.commit()
        resp = _patch_cot(app_client, admin_token, cot["id"], sc_id=None)
        assert resp.status_code == 409, (estado, resp.text)
        assert f"(estado actual: {etiqueta})" in resp.json()["detail"]


def test_desvincular_una_cotizacion_en_borrador_anula_la_confirmacion_de_la_solicitud(
        app_client, db, admin_token, user_admin):
    """La marca de la SC anterior se limpia en el mismo commit y la SC se re-sincroniza como en un rechazo: sin otra
    COT activa ni marca, vuelve a ASIGNADA para reenviarsela al cliente."""
    from app.models.erp_documents import SalesQuotation
    sc = _sc(db, "SC-RCH008B", user_admin)
    cot = _crear_cot(app_client, admin_token, sc.id)
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None  # U15

    resp = _patch_cot(app_client, admin_token, cot["id"], sc_id=None)
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["sc_id"] is None and resp.json()["data"]["sc_numero"] is None
    db.refresh(sc)
    assert sc.gate1_confirmed_at is None and sc.estado == "ASIGNADA"
    cambio = _logs(db, "SC", sc.id, "ESTADO_CHANGED")[-1]
    assert (cambio.old_estado, cambio.new_estado) == ("CONFIRMADA", "ASIGNADA")
    assert cambio.description == (f"La cotización {cot['numero']} se desvinculó de esta solicitud. La solicitud sigue "
                                  "activa; para crearle otra cotización, reenvíasela al cliente para que la confirme.")

    # La marca de verdad quedo limpia (aunque alguien forzara el estado): /confirmar no crea otra COT.
    sc.estado = "CONFIRMADA"
    db.commit()
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 400, resp.text
    assert "no tiene una confirmación de cliente válida" in resp.json()["detail"]
    db.expire_all()
    assert db.query(SalesQuotation).filter(SalesQuotation.sc_id == sc.id).count() == 0


def test_mover_la_cotizacion_a_otra_solicitud_tiene_reglas(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SalesQuotation, SaleOrder
    origen = _sc(db, "SC-RCH009A", user_admin)
    cot = _crear_cot(app_client, admin_token, origen.id)

    # La solicitud destino tiene que existir.
    resp = _patch_cot(app_client, admin_token, cot["id"], sc_id=999999999)
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "La solicitud indicada no existe."
    resp = _patch_cot(app_client, admin_token, cot["id"], sc_id="abc")
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "El campo sc_id debe ser el número de una solicitud."

    # No puede estar cancelada.
    cancelada = _sc(db, "SC-RCH009B", user_admin, con_marca=False, estado="CANCELADA")
    resp = _patch_cot(app_client, admin_token, cot["id"], sc_id=cancelada.id)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == ("La solicitud SC-RCH009B está cancelada: restáurala desde la Papelera antes de "
                                     "vincularle una cotización.")

    # No puede tener ya otra cotizacion activa.
    ocupada = _sc(db, "SC-RCH009C", user_admin)
    otra = _crear_cot(app_client, admin_token, ocupada.id)
    resp = _patch_cot(app_client, admin_token, cot["id"], sc_id=ocupada.id)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == (f"La solicitud SC-RCH009C ya tiene la cotización {otra['numero']} activa; no se "
                                     "le puede vincular otra.")

    # Ni un pedido vigente (aunque no tenga COT activa).
    con_pedido = _sc(db, "SC-RCH009E", user_admin, con_marca=False, estado="ASIGNADA")
    db.add(SaleOrder(numero="PVEN-RCH009E", sc_id=con_pedido.id, customer_name="Cliente Prueba",
                     estado="PENDIENTE_COMPRA"))
    db.commit()
    resp = _patch_cot(app_client, admin_token, cot["id"], sc_id=con_pedido.id)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == ("La solicitud SC-RCH009E ya tiene el pedido de venta PVEN-RCH009E activo; no se "
                                     "le puede vincular otra cotización.")

    db.expire_all()
    assert db.get(SalesQuotation, cot["id"]).sc_id == origen.id  # nada se aplico
    assert db.get(type(origen), origen.id).gate1_confirmed_at is not None

    # Una COT con pedido vigente no cambia de solicitud.
    db.add(SaleOrder(numero="PVEN-RCH009", cot_id=cot["id"], sc_id=origen.id, customer_name="Cliente Prueba",
                     estado="PENDIENTE_COMPRA"))
    db.commit()
    libre = _sc(db, "SC-RCH009D", user_admin)
    resp = _patch_cot(app_client, admin_token, cot["id"], sc_id=libre.id)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == ("La cotización tiene el pedido PVEN-RCH009 activo: no se puede cambiar su "
                                     "solicitud.")


def test_vincular_la_cotizacion_a_otra_solicitud_solo_reinicia_la_de_origen(app_client, db, admin_token, user_admin):
    """La SC de origen pierde su marca y vuelve a ASIGNADA (como un rechazo sin marca); la SC destino no cambia de estado
    (U15: una COT en Borrador no mueve la solicitud). U11 (Bloque 2, T3): el destino tiene que tener la confirmacion
    vigente del cliente; hacia una SC sin confirmar responde 409 (test_cotizar_sin_confirmacion)."""
    origen = _sc(db, "SC-RCH010A", user_admin)
    cot = _crear_cot(app_client, admin_token, origen.id)
    destino = _sc(db, "SC-RCH010B", user_admin)  # CONFIRMADA con la marca
    resp = _patch_cot(app_client, admin_token, cot["id"], sc_id=str(destino.id))  # el id puede llegar como texto
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["sc_id"] == destino.id and resp.json()["data"]["sc_numero"] == "SC-RCH010B"
    db.refresh(origen); db.refresh(destino)
    assert origen.gate1_confirmed_at is None and origen.estado == "ASIGNADA"  # como un rechazo sin marca
    # U15: la COT en Borrador ya no cambia la SC nueva (ni le quita la marca).
    assert destino.estado == "CONFIRMADA" and destino.gate1_confirmed_at is not None
    assert any(cot["numero"] in l.description and "se vinculó" in l.description
               for l in _logs(db, "SC", destino.id, "UPDATED"))

    # Reenviar el mismo sc_id (un formulario que manda todo) no es un cambio.
    resp = _patch_cot(app_client, admin_token, cot["id"], sc_id=destino.id, notas="x")
    assert resp.status_code == 200, resp.text
    db.refresh(destino)
    assert destino.gate1_confirmed_at is not None and destino.estado == "CONFIRMADA"


def test_una_cotizacion_rechazada_cambia_de_solicitud_sin_reiniciar_la_nueva(app_client, db, admin_token, user_admin):
    """Una COT RECHAZADA si se puede mover; no es activa, asi que no le aplica a la SC nueva la regla del rechazo. La
    anterior pierde su marca y, sin otra COT activa, vuelve a ASIGNADA. U11 (Bloque 2, T3): el destino tiene que tener la
    confirmacion vigente del cliente (retomar despues la RECHAZADA la dejaria activa en una SC sin confirmar)."""
    from app.models.erp_documents import SalesQuotation
    origen = _sc(db, "SC-RCH013A", user_admin)
    cot = SalesQuotation(numero="COT-RCH013", sc_id=origen.id, sc_numero=origen.numero, customer_name="Cliente Prueba",
                         estado="RECHAZADA")
    db.add(cot); db.commit()
    destino = _sc(db, "SC-RCH013B", user_admin)  # CONFIRMADA con la marca
    resp = _patch_cot(app_client, admin_token, cot.id, sc_id=destino.id)
    assert resp.status_code == 200, resp.text
    db.refresh(origen); db.refresh(destino)
    assert origen.estado == "ASIGNADA" and origen.gate1_confirmed_at is None
    assert destino.estado == "CONFIRMADA" and destino.gate1_confirmed_at is not None
    assert _logs(db, "SC", destino.id, "COTIZACION_RECHAZADA") == []


def test_la_alerta_de_solicitud_confirmada_sin_cotizacion_cuenta_las_que_solo_tienen_rechazadas(
        app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SalesQuotation
    viejo = datetime.datetime.utcnow() - datetime.timedelta(days=10)
    sc = _sc(db, "SC-RCH011", user_admin)
    sc.gate1_confirmed_at = viejo
    db.add(SalesQuotation(numero="COT-RCH011", sc_id=sc.id, sc_numero=sc.numero, customer_name="Cliente Prueba",
                          estado="RECHAZADA"))
    db.commit()
    sc.updated_at = viejo
    db.commit()
    antes = app_client.get("/api/v1/ventas/alertas/resumen", headers=auth(admin_token)).json()["data"]["atrasados"]
    sc.gate1_confirmed_at = None
    sc.updated_at = datetime.datetime.utcnow()
    db.commit()
    despues = app_client.get("/api/v1/ventas/alertas/resumen", headers=auth(admin_token)).json()["data"]["atrasados"]
    assert antes - despues == 1


# --- Fix round: la confirmacion de Gate 1 es del cliente que la dio -------------------------------------------

def _token_usado(db, raw):
    import hashlib
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    return db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.token_hash == hashlib.sha256(raw.encode()).hexdigest()).first().used_at is not None


def test_cambiar_el_cliente_con_el_enlace_pendiente_lo_anula(app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, "SC-RCH014", user_admin, con_marca=False, estado="PENDIENTE_CONFIRMACION",
             customer_email="cliente@uno.com", customer_phone="3001112233")
    token = create_confirmation_token(db, "SC", sc.id)

    # Reenviar el mismo cliente (otro formato) no es un cambio.
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "customer_email": "  Cliente@Uno.com ", "customer_phone": "3001112233", "updated_by": "t"},
        headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "PENDIENTE_CONFIRMACION" and not _token_usado(db, token)

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "customer_email": "otra@persona.com", "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "ASIGNADA"
    assert _token_usado(db, token)  # el enlace era del cliente anterior
    cambio = _logs(db, "SC", sc.id, "ESTADO_CHANGED")[-1]
    assert (cambio.old_estado, cambio.new_estado) == ("PENDIENTE_CONFIRMACION", "ASIGNADA")
    assert "cambió el cliente" in cambio.description


def test_cambiar_el_cliente_con_una_cotizacion_activa_anula_la_confirmacion(app_client, db, admin_token, user_admin):
    """Con COT activa el estado no cambia, pero la marca (que ya no se consume) era del cliente anterior: si esa COT
    se rechaza, la SC no puede crear otra para el cliente nuevo sin que el confirme."""
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, "SC-RCH015", user_admin, customer_phone="3001112233")
    cot = _crear_cot(app_client, admin_token, sc.id)
    viejo = create_confirmation_token(db, "SC", sc.id)  # un enlace que hubiera quedado vivo
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "customer_phone": "3109998877", "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is None  # U15: crear la COT no la mueve
    assert _token_usado(db, viejo)
    aviso = _logs(db, "SC", sc.id, "UPDATED")[-1]
    assert aviso.description.startswith("Cambió el cliente de la solicitud: la confirmación del cliente anterior ya "
                                        "no vale")
    # Rechazar la COT ya no deja la SC lista para otra: hay que reenviarsela al cliente nuevo.
    assert _patch_cot(app_client, admin_token, cot["id"], estado="RECHAZADA").status_code == 200
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"
