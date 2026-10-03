"""Una Solicitud sin productos no tiene nada que el cliente pueda confirmar ni que cotizar.

- enviar-confirmacion y confirmar (crear la Cotizacion) exigen al menos un producto.
- La Cotizacion hereda los productos de la SC, con su sku_id cuando salen del catalogo.
- Gate 1: si los productos cambian con el enlace pendiente o ya confirmado (y sin Cotizacion), esa
  confirmacion deja de valer: la SC vuelve a ASIGNADA y el token se revoca. Vincular una linea al
  catalogo o reenviar los mismos productos no cuenta como cambio.
"""
import datetime
import hashlib


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sc(db, numero, user_admin, **campos):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", advisor_user_id=user_admin.id,
                         advisor_name=user_admin.email, **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _token_usado(db, token):
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    fila = db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.token_hash == hashlib.sha256(token.encode()).hexdigest()).first()
    return fila.used_at is not None


LINEA = {"product_name": "Cuna Colecho", "qty": 1}


def test_enviar_al_cliente_una_sc_sin_productos_se_rechaza(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-PROD001", user_admin, estado="ASIGNADA", productos=[])
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "test"},
                           headers=auth(admin_token))
    assert resp.status_code == 400
    assert "Agrega al menos un producto" in resp.json()["detail"]
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"
    # Un nombre vacio tampoco cuenta como producto.
    sc.productos = [{"product_name": "   ", "qty": 1}]
    db.commit()
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "test"},
                           headers=auth(admin_token))
    assert resp.status_code == 400


def test_enviar_al_cliente_una_sc_con_productos_funciona(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-PROD002", user_admin, estado="ASIGNADA", productos=[LINEA])
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "test"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "PENDIENTE_CONFIRMACION"


def test_crear_la_cotizacion_desde_una_sc_confirmada_sin_productos_se_rechaza(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SalesQuotation
    sc = _sc(db, "SC-PROD003", user_admin, estado="CONFIRMADA", productos=[],
             gate1_confirmed_at=datetime.datetime.utcnow())
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "test"},
                           headers=auth(admin_token))
    assert resp.status_code == 400
    assert "no tiene productos para cotizar" in resp.json()["detail"]
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None  # nada se consumio
    assert db.query(SalesQuotation).filter(SalesQuotation.sc_id == sc.id).count() == 0


def test_la_cotizacion_hereda_los_productos_de_la_sc_con_su_sku(app_client, db, admin_token, user_admin):
    lineas = [{"product_name": "Cuna Colecho", "qty": 2, "sku_id": 7, "unit_price_cop": 0},
              {"product_name": "Mecedora (texto libre)", "qty": 1, "sku_id": None, "unit_price_cop": 0}]
    sc = _sc(db, "SC-PROD004", user_admin, estado="CONFIRMADA", productos=lineas,
             gate1_confirmed_at=datetime.datetime.utcnow())
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "test"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    cot = resp.json()["data"]["cotizacion"]
    assert [(p["product_name"], p["qty"], p.get("sku_id")) for p in cot["productos"]] == [
        ("Cuna Colecho", 2, 7), ("Mecedora (texto libre)", 1, None)]


def test_cambiar_los_productos_con_el_enlace_pendiente_anula_la_confirmacion(app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, "SC-PROD005", user_admin, estado="PENDIENTE_CONFIRMACION", productos=[LINEA])
    token = create_confirmation_token(db, "SC", sc.id)

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "productos": [LINEA, {"product_name": "Coche", "qty": 1}], "updated_by": "asesor@test"},
        headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "ASIGNADA"
    assert _token_usado(db, token)  # el enlace que tiene el cliente ya no sirve

    actividades = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]["actividades"]
    estado = [a for a in actividades if a["action"] == "ESTADO_CHANGED"]
    assert len(estado) == 1
    assert "se modificaron los productos" in estado[0]["description"]
    assert (estado[0]["old_estado"], estado[0]["new_estado"]) == ("PENDIENTE_CONFIRMACION", "ASIGNADA")
    # La edicion misma tambien queda (con el producto agregado), antes del cambio de estado.
    assert [a["action"] for a in actividades] == ["UPDATED", "ESTADO_CHANGED"]


def test_cambiar_los_productos_de_una_sc_ya_confirmada_obliga_a_reconfirmar(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-PROD006", user_admin, estado="CONFIRMADA", productos=[LINEA],
             gate1_confirmed_at=datetime.datetime.utcnow())
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "productos": [{"product_name": "Cuna Colecho", "qty": 3}], "updated_by": "asesor@test"},
        headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and sc.gate1_confirmed_at is None
    # Sin la confirmacion del cliente ya no se puede crear la cotizacion.
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "test"},
                           headers=auth(admin_token))
    assert resp.status_code == 400


def test_reenviar_los_mismos_productos_o_vincularlos_al_catalogo_no_anula_la_confirmacion(
        app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, "SC-PROD007", user_admin, estado="PENDIENTE_CONFIRMACION", productos=[LINEA])
    token = create_confirmation_token(db, "SC", sc.id)
    for productos in ([{"product_name": "Cuna Colecho", "qty": 1.0}],                 # mismo producto
                      [{"product_name": "Cuna Colecho", "qty": 1, "sku_id": 7}]):    # solo se vincula al catalogo
        resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"productos": productos, "updated_by": "t"},
                                headers=auth(admin_token))
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["estado"] == "PENDIENTE_CONFIRMACION"
    assert not _token_usado(db, token)


def test_editar_los_productos_de_una_sc_que_ya_tiene_cotizacion_no_cambia_su_estado(
        app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SalesQuotation
    # CONFIRMADA por la sincronizacion con su Cotizacion confirmada (venta ya cerrada): los productos
    # viven ahora en la Cotizacion, editar la SC no reabre nada.
    sc = _sc(db, "SC-PROD008", user_admin, estado="CONFIRMADA", productos=[LINEA])
    cot = SalesQuotation(numero="COT-PROD008", sc_id=sc.id, sc_numero=sc.numero, customer_name="Cliente Prueba",
                         estado="CONFIRMADA", productos=[LINEA])
    db.add(cot); db.commit()
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "productos": [{"product_name": "Otra cosa", "qty": 1}], "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "CONFIRMADA"
