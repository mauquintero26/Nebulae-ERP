"""H40 (Bloque 2, T4, R7): re-cotizar una cotizacion que el cliente ya confirmo (o que espera su confirmacion) pide
confirmar y escribir la razon.

- COT CONFIRMADA sin pedido vigente, o PENDIENTE_CONFIRMACION, + un PATCH que cambia lo que el cliente vio (productos,
  cantidades, precios, total, descuento, TRM, fecha de entrega) sin anular_confirmacion -> 409
  detail = {codigo: 'ANULA_CONFIRMACION', estado, cambios, mensaje}; no se guarda nada y el enlace sigue vivo.
- Con anular_confirmacion=True y motivo_recotizacion (minimo 5 caracteres) -> se guarda, vuelve a Borrador, el
  renglon de paso a Borrador termina en 'Razon: ...' y la respuesta trae confirmacion_anulada=True (nivel superior).
- Razon corta -> 422 sin cambios.
- No pregunta: solo notas, anticipo manual, vincular al catalogo, COT con pedido vigente, estados fuera del ciclo de
  Gate 2 y un cambio de estado explicito.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_recotizar_confirmada
"""
import datetime

RAZON_CORTA = "Escribe la razón del cambio (mínimo 5 caracteres): queda en la Actividad de la cotización."
RAZON_LARGA = "La razón es muy larga (máximo 500 caracteres)."


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _productos(total, **extra):
    return [{"product_name": "Cuna", "qty": 1, "unit_price_cop": total, "total_cop": total, **extra}]


def _cot(db, numero, estado, total=1000, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("productos", _productos(total))
    if estado == "CONFIRMADA":
        campos.setdefault("gate2_confirmed_at", datetime.datetime.utcnow())
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", estado=estado, total_cop=total,
                         subtotal_cop=total, anticipo_cop=0, **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _precio(total, **extra):
    return {"productos": _productos(total), "subtotal_cop": total, "total_cop": total, "recotizacion": True,
            "updated_by": "t", **extra}


def _patch(app_client, token, cot_id, body):
    return app_client.patch(f"/api/v1/ventas/cotizaciones/{cot_id}", json=body, headers=auth(token))


def _logs(db, cot_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == "COT", ActivityLog.entity_id == cot_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def test_recotizar_confirmada_sin_aceptar_responde_409_y_no_guarda(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40A", "CONFIRMADA")
    gate2 = cot.gate2_confirmed_at
    resp = _patch(app_client, admin_token, cot.id, _precio(1200))
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert detail["codigo"] == "ANULA_CONFIRMACION" and detail["estado"] == "CONFIRMADA"
    assert detail["cambios"] == ["Productos, cantidades o precios", "Total"]
    assert detail["mensaje"] == (
        "El cliente ya confirmó esta cotización. Si guardas estos cambios (Productos, cantidades o precios, Total), su "
        "confirmación se anula: la cotización vuelve a Borrador y tendrás que enviársela de nuevo.")
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.total_cop == 1000 and cot.gate2_confirmed_at == gate2
    assert cot.productos == _productos(1000) and cot.anticipo_cop == 0
    assert _logs(db, cot.id) == []


def test_el_409_nombra_lo_que_cambio(app_client, db, admin_token):
    casos = [
        ({"descuento_pct": 10}, ["Descuento"]),
        ({"trm_rate": 4100}, ["TRM"]),
        ({"fecha_entrega_estimada": "2026-12-01"}, ["Fecha de entrega"]),
        ({"subtotal_cop": 900}, ["Total"]),
        ({"subtotal_cop": 900, "total_cop": 900}, ["Total"]),
        ({"productos": _productos(1000, qty=2)}, ["Productos, cantidades o precios"]),
    ]
    for i, (body, cambios) in enumerate(casos):
        cot = _cot(db, f"COT-T4H40N{i}", "CONFIRMADA", trm_rate=4000)
        resp = _patch(app_client, admin_token, cot.id, {**body, "updated_by": "t"})
        assert resp.status_code == 409, (body, resp.text)
        assert resp.json()["detail"]["cambios"] == cambios, body


def test_recotizar_pendiente_sin_aceptar_deja_vivo_el_enlace(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40B", "BORRADOR")
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    token = resp.json()["link_confirmacion"].rsplit("/", 1)[-1]
    logs_antes = len(_logs(db, cot.id))
    resp = _patch(app_client, admin_token, cot.id, _precio(1500))
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert detail["codigo"] == "ANULA_CONFIRMACION" and detail["estado"] == "PENDIENTE_CONFIRMACION"
    assert detail["mensaje"] == (
        "Esta cotización está esperando la confirmación del cliente. Si guardas estos cambios (Productos, cantidades o "
        "precios, Total), el enlace que tiene el cliente deja de servir: la cotización vuelve a Borrador y tendrás que "
        "enviársela de nuevo.")
    resp = app_client.post("/api/v1/confirmar/ver", json={"token": token})
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["total_cop"] == 1000
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"
    assert len(_logs(db, cot.id)) == logs_antes


def test_aceptar_con_razon_anula_y_registra_la_razon(app_client, db, admin_token, user_admin):
    cot = _cot(db, "COT-T4H40C", "CONFIRMADA")
    body = _precio(1200, anular_confirmacion=True, motivo_recotizacion="  Proveedor subió el precio  ")
    del body["updated_by"]  # el renglon queda a nombre del usuario autenticado
    resp = _patch(app_client, admin_token, cot.id, body)
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is True
    assert "confirmacion_anulada" not in resp.json()["data"]
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.gate2_confirmed_at is None and cot.total_cop == 1200
    logs = _logs(db, cot.id)
    assert [l.action for l in logs] == ["RECOTIZADA", "ESTADO_CHANGED"]
    # motivo_recotizacion no es 'motivo': no reemplaza el titulo de la re-cotizacion.
    assert logs[0].description.startswith("Re-cotización: total $1.000 -> $1.200")
    estado = logs[1]
    assert estado.description.endswith("Razón: Proveedor subió el precio.")
    assert estado.description.startswith("Estado cambiado a Borrador")
    # Ronda 1 (4): sin updated_by el autor es nombre_de_usuario(usuario de la sesion), como en el Chatter.
    assert (estado.old_estado, estado.new_estado, estado.user_name) == (
        "CONFIRMADA", "BORRADOR", user_admin.username or user_admin.email)
    assert estado.extra_data == {
        "motivo": "Proveedor subió el precio",
        "cambios": [{"etiqueta": "Cambió", "despues": "Productos, cantidades o precios, Total"},
                    {"etiqueta": "Razón", "despues": "Proveedor subió el precio"}]}


def test_aceptar_pendiente_con_razon_revoca_el_enlace(app_client, db, admin_token, user_admin):
    from app.core.textos_actividad import nombre_de_usuario
    cot = _cot(db, "COT-T4H40D", "BORRADOR")
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(admin_token))
    token = resp.json()["link_confirmacion"].rsplit("/", 1)[-1]
    resp = _patch(app_client, admin_token, cot.id,
                  _precio(1500, anular_confirmacion=True, motivo_recotizacion="Cambió la referencia."))
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is True
    assert app_client.post("/api/v1/confirmar/ver", json={"token": token}).status_code == 400
    ultimo = _logs(db, cot.id, "ESTADO_CHANGED")[-1]
    assert ultimo.description.endswith("Razón: Cambió la referencia.")  # sin doble punto
    # S6 (T11): el renglon de la razon es del usuario de la sesion; el updated_by del body ('t') ya no cuenta.
    assert ultimo.user_name == nombre_de_usuario(user_admin)


def test_s6_anular_la_confirmacion_va_en_un_commit_con_el_autor_de_la_sesion(app_client, db, admin_token, user_admin,
                                                                             monkeypatch):
    """S6 (T11): con un updated_by de 151 caracteres o que no es texto, el renglon de la razon tumbaba la peticion (500)
    DESPUES de dejar la COT en Borrador: sin razon en la Actividad, con gate2 puesto y el enlace vivo. Ahora la COT en
    Borrador, el renglon de los cambios, el de la razon (autor de la sesion), la revocacion del enlace y gate2 en None
    van en UN commit (patron C8), y _log no acepta un autor que no sea texto ni uno mas largo que la columna."""
    from sqlalchemy.orm import Session
    from app.core.confirmation_tokens import create_confirmation_token
    from app.core.textos_actividad import nombre_de_usuario
    from app.models.confirmation import DocumentConfirmationToken
    autor = nombre_de_usuario(user_admin)
    casos = [("CONFIRMADA", "x" * 151, "x" * 150), ("PENDIENTE_CONFIRMACION", ["Otra Asesora"], autor),
             ("CONFIRMADA", {"nombre": "Otra"}, autor), ("PENDIENTE_CONFIRMACION", "Otra Asesora", "Otra Asesora")]
    commit_real = Session.commit
    for i, (estado, updated_by, autor_cambios) in enumerate(casos):
        cot = _cot(db, f"COT-T4H40S{i}", estado)
        create_confirmation_token(db, "COT", cot.id)  # el enlace pendiente (o uno que hubiera quedado vivo)
        commits = []

        def contar(self):
            if self is not db:
                commits.append(1)
            return commit_real(self)

        monkeypatch.setattr(Session, "commit", contar)
        resp = _patch(app_client, admin_token, cot.id,
                      _precio(1300, anular_confirmacion=True, motivo_recotizacion="Cambio de proveedor",
                              updated_by=updated_by))
        monkeypatch.setattr(Session, "commit", commit_real)
        assert resp.status_code == 200, (estado, updated_by, resp.text)
        assert resp.json()["confirmacion_anulada"] is True
        assert len(commits) == 1, (estado, updated_by, len(commits))
        db.expire_all()
        db.refresh(cot)
        assert (cot.estado, cot.gate2_confirmed_at, cot.total_cop) == ("BORRADOR", None, 1300), estado
        token = db.query(DocumentConfirmationToken).filter(DocumentConfirmationToken.document_type == "COT",
                                                           DocumentConfirmationToken.document_id == cot.id).one()
        assert token.used_at is not None, estado  # revocado
        logs = _logs(db, cot.id)
        assert [l.action for l in logs] == ["RECOTIZADA", "ESTADO_CHANGED"], estado
        assert logs[1].description.endswith("Razón: Cambio de proveedor.")
        assert (logs[1].old_estado, logs[1].new_estado, logs[1].user_name) == (estado, "BORRADOR", autor)
        # El renglon de los cambios sigue tomando el updated_by del body (contrato viejo), ya saneado.
        assert logs[0].user_name == autor_cambios, updated_by


def test_s6_log_no_acepta_un_autor_que_no_es_texto_ni_mas_largo_que_la_columna(db, user_admin):
    from app.api.v1 import erp_ventas
    from app.core.textos_actividad import nombre_de_usuario
    casos = [("Ana", None, "Ana"), ("x" * 200, None, "x" * 150), (["Ana"], None, "Sistema"), (12, None, "Sistema"),
             ({"a": 1}, user_admin, nombre_de_usuario(user_admin)), (None, user_admin, None)]
    for user_name, usuario, esperado in casos:
        renglon = erp_ventas._log(db, "COT", 999999999, "COT-T4H40X", "UPDATED", "x", user_name=user_name,
                                  usuario=usuario, commit=False)
        db.flush()
        assert renglon.user_name == esperado, user_name
    db.rollback()


def test_aceptar_sin_razon_responde_422(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40E", "CONFIRMADA")
    # Ronda 1 (1): una razon que no es texto cuenta como sin razon; mas de 500 caracteres tambien es 422.
    casos = [("x", RAZON_CORTA), ("    ", RAZON_CORTA), ("abcd", RAZON_CORTA), (None, RAZON_CORTA),
             (12345, RAZON_CORTA), (["Proveedor subió el precio"], RAZON_CORTA), (True, RAZON_CORTA),
             ("r" * 501, RAZON_LARGA), ("  " + "r" * 501 + "  ", RAZON_LARGA)]
    for motivo, mensaje in casos:
        body = _precio(1200, anular_confirmacion=True)
        if motivo is not None:
            body["motivo_recotizacion"] = motivo
        resp = _patch(app_client, admin_token, cot.id, body)
        assert resp.status_code == 422, (motivo, resp.text)
        assert resp.json()["detail"] == mensaje, motivo
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.total_cop == 1000 and cot.gate2_confirmed_at is not None
    assert _logs(db, cot.id) == []
    # 500 caracteres (tras recortar) si se aceptan.
    resp = _patch(app_client, admin_token, cot.id,
                  _precio(1200, anular_confirmacion=True, motivo_recotizacion=" " + "r" * 500 + " "))
    assert resp.status_code == 200, resp.text
    assert _logs(db, cot.id, "ESTADO_CHANGED")[-1].extra_data["motivo"] == "r" * 500


def test_la_bandera_tiene_que_ser_el_booleano_true(app_client, db, admin_token):
    """Ronda 1 (9): 'true', 1 o 'false' no cuentan como anular_confirmacion: 409."""
    for i, bandera in enumerate(("true", 1, "false")):
        cot = _cot(db, f"COT-T4H40B{i}", "CONFIRMADA")
        resp = _patch(app_client, admin_token, cot.id,
                      _precio(1200, anular_confirmacion=bandera, motivo_recotizacion="Proveedor subió el precio"))
        assert resp.status_code == 409, (bandera, resp.text)
        assert resp.json()["detail"]["codigo"] == "ANULA_CONFIRMACION", bandera


def test_todos_los_campos_congelados_tienen_etiqueta():
    """Ronda 1 (2): agregar un campo congelado sin su etiqueta haria un 500; la prueba lo exige."""
    from app.api.v1.erp_ventas import PRICE_FREEZE_FIELDS, _ETIQUETAS_CONGELADAS
    assert set(PRICE_FREEZE_FIELDS) <= set(_ETIQUETAS_CONGELADAS)
    assert list(_ETIQUETAS_CONGELADAS) == PRICE_FREEZE_FIELDS  # mismo orden: el de los cambios del 409


def test_cambiar_solo_notas_no_pregunta(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40F", "CONFIRMADA")
    resp = _patch(app_client, admin_token, cot.id, {"notas": "x", "updated_by": "t"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    # Mandar la bandera sin cambiar nada congelado tampoco anula nada.
    resp = _patch(app_client, admin_token, cot.id, {"notas": "y", "anular_confirmacion": True,
                                                    "motivo_recotizacion": "Por si acaso", "updated_by": "t"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.gate2_confirmed_at is not None


def test_ajustar_el_anticipo_a_mano_no_pregunta(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40G", "CONFIRMADA")
    resp = _patch(app_client, admin_token, cot.id, {"anticipo_pct_manual": 50, "anticipo_manual_nota": "Cliente VIP",
                                                    "updated_by": "t"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA"


def test_con_pedido_vigente_no_pregunta(app_client, db, admin_token):
    from app.models.erp_documents import SaleOrder
    cot = _cot(db, "COT-T4H40H", "CONFIRMADA")
    db.add(SaleOrder(numero="PVEN-T4H40H", cot_id=cot.id, customer_name="Cliente Prueba", estado="PENDIENTE_COMPRA"))
    db.commit()
    resp = _patch(app_client, admin_token, cot.id, _precio(1200))
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.total_cop == 1200


def test_con_pedido_vigente_la_bandera_no_anula_nada(app_client, db, admin_token):
    """Ronda 1 (10): con pedido vigente, mandar anular_confirmacion y la razon no cambia nada del ciclo de Gate 2."""
    from app.models.erp_documents import SaleOrder
    cot = _cot(db, "COT-T4H40L", "CONFIRMADA")
    gate2 = cot.gate2_confirmed_at
    db.add(SaleOrder(numero="PVEN-T4H40L", cot_id=cot.id, customer_name="Cliente Prueba", estado="PENDIENTE_COMPRA"))
    db.commit()
    resp = _patch(app_client, admin_token, cot.id,
                  _precio(1200, anular_confirmacion=True, motivo_recotizacion="Proveedor subió el precio"))
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.gate2_confirmed_at == gate2
    assert _logs(db, cot.id, "ESTADO_CHANGED") == []


def test_borrador_no_pregunta(app_client, db, admin_token):
    for i, estado in enumerate(("BORRADOR", "RECHAZADA", "VENCIDA", "ENVIADA")):
        cot = _cot(db, f"COT-T4H40I{i}", estado)
        resp = _patch(app_client, admin_token, cot.id, _precio(1200))
        assert resp.status_code == 200, (estado, resp.text)
        assert resp.json()["confirmacion_anulada"] is False, estado


def test_vincular_sku_no_pregunta(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40J", "CONFIRMADA", productos=_productos(1000, sku_id=None, es_libre=True))
    resp = _patch(app_client, admin_token, cot.id, {"productos": _productos(1000, sku_id=42, es_libre=False),
                                                    "updated_by": "t"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.productos[0]["sku_id"] == 42


def test_cambio_de_estado_explicito_no_pregunta(app_client, db, admin_token):
    cot = _cot(db, "COT-T4H40K", "CONFIRMADA")
    resp = _patch(app_client, admin_token, cot.id, {"estado": "BORRADOR", "total_cop": 1500, "updated_by": "t"})
    assert resp.status_code == 200, resp.text
    # Ronda 1 (8): el contrato documentado: con un cambio congelado la confirmacion SI se anula (true), y el renglon
    # es el generico del cambio de estado, sin razon.
    assert resp.json()["confirmacion_anulada"] is True
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.total_cop == 1500 and cot.gate2_confirmed_at is None
    ultimo = _logs(db, cot.id, "ESTADO_CHANGED")[-1]
    assert "Razón:" not in ultimo.description and ultimo.description == "Estado cambiado a Borrador"
