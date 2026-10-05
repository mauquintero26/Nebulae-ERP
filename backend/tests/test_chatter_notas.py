"""U6+H22 (Bloque 2, T4, R1, R9/C13): el Chatter de Solicitud, Cotizacion y Pedido.

POST /ventas/{solicitudes|cotizaciones|pedidos}/{id}/actividad con body {action:'CHATTER', tipo, description, medio?}:
- app.core.chatter.validar_nota valida la accion (CHATTER o NOTE_ADDED; UPDATED del boton viejo queda como CHATTER), el
  texto (no vacio, maximo 2000) y el tipo (NOTA, LLAMADA, WHATSAPP, CORREO, EXTERNA). R1: con EXTERNA el medio opcional
  (maximo 60) queda en extra_data; con otros tipos se ignora.
- El autor es el usuario de la sesion (nombre_de_usuario), nunca body.user_name.
- 422 con el mensaje en espanol; 404 si el documento no existe.
- Una sola transaccion; la respuesta trae el renglon creado (id y created_at con 'Z').
- R1: llamada, WhatsApp, correo y nota externa reinician el atraso (updated_at del documento); la nota interna no.

Los simbolos nuevos de T4 se importan DENTRO de cada prueba (el runner importa el modulo fuera de un try).
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_chatter_notas
"""
import datetime

import pytest

AHORA = datetime.datetime.utcnow


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sc(db, numero, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _ven(db, numero, **campos):
    from app.models.erp_documents import SaleOrder
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    ven = SaleOrder(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(ven); db.commit(); db.refresh(ven)
    return ven


RUTAS = {"SC": "solicitudes", "COT": "cotizaciones", "VEN": "pedidos"}


def _nota(app_client, token, entidad, doc_id, body):
    return app_client.post(f"/api/v1/ventas/{RUTAS[entidad]}/{doc_id}/actividad", json=body, headers=auth(token))


def _logs(db, entidad, doc_id):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    return (db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == doc_id)
            .order_by(ActivityLog.id.asc()).all())


def _autor(user):
    return user.username or user.email


# ─── validar_nota (puro) ─────────────────────────────────────────────────────────────

def test_validar_nota_pura():
    from app.core.chatter import validar_nota
    assert validar_nota({"action": "CHATTER", "description": "  Hola  ", "tipo": "llamada"}) == (
        "CHATTER", "Hola", {"tipo": "LLAMADA"})
    assert validar_nota({"action": "CHATTER", "description": "Hola"}) == ("CHATTER", "Hola", {"tipo": "NOTA"})
    assert validar_nota({"action": "updated", "description": "Hola"})[0] == "CHATTER"  # LEGADO
    assert validar_nota({"description": "Hola"})[0] == "NOTE_ADDED"                   # valor por defecto de siempre
    assert validar_nota({"action": "NOTE_ADDED", "description": "x" * 2000})[1] == "x" * 2000
    errores = [
        ({"action": "ESTADO_CHANGED", "description": "x"}, "Ese tipo de registro no se puede agregar a mano."),
        ({"action": "CHATTER", "description": "   "}, "Escribe la nota antes de guardarla."),
        ({"action": "CHATTER"}, "Escribe la nota antes de guardarla."),
        ({"action": "CHATTER", "description": "x" * 2001}, "La nota es muy larga (máximo 2000 caracteres)."),
        ({"action": "CHATTER", "description": "x", "tipo": "FAX"}, "Tipo de nota no válido."),
    ]
    for body, mensaje in errores:
        with pytest.raises(ValueError) as exc:
            validar_nota(body)
        assert str(exc.value) == mensaje, body


def test_validar_nota_externa_con_medio():
    """R1: la nota externa guarda el medio (recortado, maximo 60) solo si no queda vacio; con otro tipo se ignora."""
    from app.core.chatter import validar_nota
    assert validar_nota({"action": "CHATTER", "description": "Fui a la obra", "tipo": "externa",
                         "medio": " Visita "}) == ("CHATTER", "Fui a la obra", {"tipo": "EXTERNA", "medio": "Visita"})
    assert validar_nota({"action": "CHATTER", "description": "x", "tipo": "EXTERNA"})[2] == {"tipo": "EXTERNA"}
    assert validar_nota({"action": "CHATTER", "description": "x", "tipo": "EXTERNA", "medio": "   "})[2] == {
        "tipo": "EXTERNA"}
    assert validar_nota({"action": "CHATTER", "description": "x", "tipo": "EXTERNA", "medio": "m" * 60})[2] == {
        "tipo": "EXTERNA", "medio": "m" * 60}
    with pytest.raises(ValueError) as exc:
        validar_nota({"action": "CHATTER", "description": "x", "tipo": "EXTERNA", "medio": "m" * 61})
    assert str(exc.value) == "El medio es muy largo (máximo 60 caracteres)."
    assert validar_nota({"action": "CHATTER", "description": "x", "tipo": "NOTA", "medio": "Visita"})[2] == {
        "tipo": "NOTA"}
    assert validar_nota({"action": "CHATTER", "description": "x", "tipo": "LLAMADA", "medio": "m" * 61})[2] == {
        "tipo": "LLAMADA"}


def test_constantes_y_reinicio_del_atraso():
    from app.core import chatter, textos_actividad
    assert chatter.TIPOS_CHATTER == {"NOTA": "Nota interna", "LLAMADA": "Llamada con el cliente",
                                     "WHATSAPP": "WhatsApp al cliente", "CORREO": "Correo al cliente",
                                     "EXTERNA": "Nota externa"}
    assert chatter.ACCIONES_PERMITIDAS == {"CHATTER", "NOTE_ADDED"}
    assert chatter.LEGADO == {"UPDATED": "CHATTER"}
    assert (chatter.MAX_TEXTO, chatter.MAX_MEDIO) == (2000, 60)
    for tipo in ("LLAMADA", "WHATSAPP", "CORREO", "EXTERNA"):
        assert chatter.reinicia_atraso(tipo) is True, tipo
    assert chatter.reinicia_atraso("NOTA") is False
    assert chatter.nombre_de_usuario is textos_actividad.nombre_de_usuario  # reexportado, no copiado


# ─── POST /…/actividad ───────────────────────────────────────────────────────────────

def test_nota_de_la_sc_se_guarda_con_el_usuario_de_la_sesion(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-T4CH01")
    resp = _nota(app_client, admin_token, "SC", sc.id, {
        "action": "CHATTER", "tipo": "LLAMADA", "description": "Llamé: confirma mañana", "user_name": "impostor"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "success"
    data = resp.json()["data"]
    assert data["user_name"] == _autor(user_admin)
    assert data["action"] == "CHATTER" and data["description"] == "Llamé: confirma mañana"
    assert data["extra_data"] == {"tipo": "LLAMADA"}
    assert data["entity_type"] == "SC" and data["entity_id"] == sc.id and data["entity_numero"] == "SC-T4CH01"
    assert data["created_at"].endswith("Z")
    resp = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token))
    assert data["id"] in [a["id"] for a in resp.json()["data"]["actividades"]]


def test_nota_vacia_no_se_guarda(app_client, db, admin_token):
    cot = _cot(db, "COT-T4CH02")
    antes = len(_logs(db, "COT", cot.id))
    resp = _nota(app_client, admin_token, "COT", cot.id, {"action": "CHATTER", "description": "   "})
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "Escribe la nota antes de guardarla."
    assert len(_logs(db, "COT", cot.id)) == antes


def test_nota_muy_larga_da_422(app_client, db, admin_token):
    ven = _ven(db, "PVEN-T4CH03")
    resp = _nota(app_client, admin_token, "VEN", ven.id, {"action": "CHATTER", "description": "x" * 2001})
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "La nota es muy larga (máximo 2000 caracteres)."
    assert _logs(db, "VEN", ven.id) == []


def test_accion_del_sistema_no_se_puede_agregar_a_mano(app_client, db, admin_token):
    sc = _sc(db, "SC-T4CH04")
    resp = _nota(app_client, admin_token, "SC", sc.id, {"action": "ESTADO_CHANGED", "description": "Confirmada"})
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "Ese tipo de registro no se puede agregar a mano."
    resp = _nota(app_client, admin_token, "SC", sc.id, {"action": "CHATTER", "description": "x", "tipo": "FAX"})
    assert resp.status_code == 422 and resp.json()["detail"] == "Tipo de nota no válido."
    assert _logs(db, "SC", sc.id) == []
    # N3 (Bloque 1): 'Motivo del rechazo (Hub)' sigue entrando como NOTE_ADDED.
    resp = _nota(app_client, admin_token, "SC", sc.id, {"action": "NOTE_ADDED",
                                                        "description": "Motivo del rechazo (Hub): caro"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["action"] == "NOTE_ADDED"
    assert resp.json()["data"]["extra_data"] == {"tipo": "NOTA"}


def test_nota_vieja_del_pedido_como_updated_queda_como_chatter(app_client, db, admin_token):
    ven = _ven(db, "PVEN-T4CH05")
    resp = _nota(app_client, admin_token, "VEN", ven.id, {"action": "UPDATED", "description": "Cliente pide factura"})
    assert resp.status_code == 200, resp.text
    resp = app_client.get(f"/api/v1/ventas/pedidos/{ven.id}", headers=auth(admin_token))
    actividades = resp.json()["data"]["actividades"]
    assert [(a["action"], a["description"]) for a in actividades if a["action"] == "CHATTER"] == [
        ("CHATTER", "Cliente pide factura")]
    assert [a for a in actividades if a["action"] == "UPDATED"] == []


def test_documento_inexistente_da_404(app_client, db, admin_token):
    for entidad, mensaje in (("SC", "Solicitud no encontrada"), ("COT", "Cotización no encontrada"),
                             ("VEN", "Pedido no encontrado")):
        resp = _nota(app_client, admin_token, entidad, 999999999, {"action": "CHATTER", "description": "x"})
        assert resp.status_code == 404, (entidad, resp.text)
        assert resp.json()["detail"] == mensaje


def test_asesor_puede_dejar_notas(app_client, db, vendedor_token, user_vendedor):
    cot = _cot(db, "COT-T4CH06")
    resp = _nota(app_client, vendedor_token, "COT", cot.id, {"action": "CHATTER", "tipo": "WHATSAPP",
                                                             "description": "Le mandé la cotización",
                                                             "user_name": "otro"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["user_name"] == _autor(user_vendedor)


def test_nota_externa_guarda_el_medio(app_client, db, admin_token):
    sc = _sc(db, "SC-T4CH07")
    resp = _nota(app_client, admin_token, "SC", sc.id, {"action": "CHATTER", "tipo": "EXTERNA",
                                                        "description": "Fui a la obra", "medio": " Visita "})
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["extra_data"] == {"tipo": "EXTERNA", "medio": "Visita"}
    resp = _nota(app_client, admin_token, "SC", sc.id, {"action": "CHATTER", "tipo": "EXTERNA",
                                                        "description": "x", "medio": "m" * 61})
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "El medio es muy largo (máximo 60 caracteres)."
    assert len(_logs(db, "SC", sc.id)) == 1


def test_contacto_con_el_cliente_reinicia_el_atraso(app_client, db, admin_token):
    """R1: llamada, WhatsApp, correo y nota externa ponen updated_at en el momento de la nota (en SC, COT y PVEN); la
    nota interna no lo cambia."""
    hace_10_dias = AHORA() - datetime.timedelta(days=10)
    for i, tipo in enumerate(("LLAMADA", "WHATSAPP", "CORREO", "EXTERNA", "NOTA")):
        sc = _sc(db, f"SC-T4CH1{i}", updated_at=hace_10_dias)
        resp = _nota(app_client, admin_token, "SC", sc.id, {"action": "CHATTER", "tipo": tipo, "description": "x"})
        assert resp.status_code == 200, (tipo, resp.text)
        db.expire_all()
        db.refresh(sc)
        if tipo == "NOTA":
            assert sc.updated_at == hace_10_dias
        else:
            assert abs((AHORA() - sc.updated_at).total_seconds()) < 120, tipo
    for entidad, doc in (("COT", _cot(db, "COT-T4CH19", updated_at=hace_10_dias)),
                         ("VEN", _ven(db, "PVEN-T4CH19", updated_at=hace_10_dias))):
        resp = _nota(app_client, admin_token, entidad, doc.id, {"action": "CHATTER", "tipo": "EXTERNA",
                                                                "description": "Reunión en la tienda"})
        assert resp.status_code == 200, (entidad, resp.text)
        db.expire_all()
        db.refresh(doc)
        assert abs((AHORA() - doc.updated_at).total_seconds()) < 120, entidad


def test_guardar_una_nota_es_un_solo_commit(app_client, db, admin_token, contador_sql):
    sc = _sc(db, "SC-T4CH20", updated_at=AHORA() - datetime.timedelta(days=3))
    with contador_sql.ventana() as v:
        resp = _nota(app_client, admin_token, "SC", sc.id, {"action": "CHATTER", "tipo": "LLAMADA",
                                                            "description": "x"})
    assert resp.status_code == 200, resp.text
    assert v.commits == 1
