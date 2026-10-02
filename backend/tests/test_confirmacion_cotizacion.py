"""
Tests para Task 5: Gate 2 (Cotizacion) -- reusa la infraestructura de tokens de
Task 4, pero con el patron de marca de procedencia de un solo uso
(SalesQuotation.gate2_confirmed_at) desde el inicio, en vez del patron de
inferencia que a Gate 1 le tomo 8 rondas de implementacion y 4 reviews
encontrar que era inseguro.

Cubre: el PATCH generico creando el token al pasar a PENDIENTE_CONFIRMACION, el
flujo publico confirmando una COT (y sincronizando la SC vinculada), el rechazo
de forzar CONFIRMADA por PATCH, el gate real en convertir_cotizacion_a_venta
probado por SU PROPIA ruta (no solo el wrapper confirmar_cotizacion -- la clase
de bug que Task 4 dejo pasar por gatear solo el wrapper), el consumo de la
marca al crear el Pedido de Venta, que el replay idempotente no la vuelva a
exigir, y que cualquier salida real del ciclo de Gate 2 via el PATCH generico
revoque el token pendiente y limpie la marca.
"""


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_patch_generico_ya_no_puede_poner_pendiente_confirmacion(app_client, db, admin_token):
    """Round 2 (adversarial review, hallazgo #1): el PATCH generico YA NO puede poner
    PENDIENTE_CONFIRMACION -- eso es exactamente lo que el drag-and-drop del Kanban
    del Hub mandaba al soltar una tarjeta en "No Resuelto" (incluso una BORRADOR sin
    precios, o revivir una RECHAZADA), creando y enviando un email de confirmacion
    como efecto secundario de un PATCH generico. Ahora el UNICO lugar que crea el
    token es el endpoint dedicado enviar_cotizacion_para_confirmacion (mismo patron
    que enviar_solicitud_para_confirmacion ya usa para Gate 1 desde el principio)."""
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTCONF1", customer_name="Cliente Prueba",
                          customer_email="cliente@test.com", estado="BORRADOR", productos=[])
    db.add(cot); db.commit(); db.refresh(cot)

    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "estado": "PENDIENTE_CONFIRMACION", "canal_envio": "Email", "updated_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 400
    db.refresh(cot)
    assert cot.estado == "BORRADOR"  # sin escritura parcial

    from app.models.confirmation import DocumentConfirmationToken
    token_row = db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.document_type == "COT", DocumentConfirmationToken.document_id == cot.id
    ).first()
    assert token_row is None  # nunca se creo ningun token


def test_enviar_confirmacion_requiere_borrador_o_enviada(app_client, db, admin_token):
    from app.models.erp_documents import SalesQuotation
    # numero es String(20) -- se usa un indice corto en vez del nombre del estado
    # completo (p.ej. "PENDIENTE_CONFIRMACION" por si solo ya excede el limite).
    for i, estado_invalido in enumerate(("RECHAZADA", "CONFIRMADA", "PENDIENTE_CONFIRMACION", "VENCIDA")):
        cot = SalesQuotation(numero=f"COT-TC1-{i}", customer_name="Cliente Prueba",
                              estado=estado_invalido, total_cop=1000,
                              productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
        db.add(cot); db.commit(); db.refresh(cot)
        resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={"user_name": "test"}, headers=auth(admin_token))
        assert resp.status_code == 400, f"esperaba 400 para estado {estado_invalido}"


def test_enviar_confirmacion_requiere_precio(app_client, db, admin_token):
    """Cierra la otra mitad del hallazgo #1: una tarjeta BORRADOR sin precios/productos
    no tiene nada que el cliente pueda confirmar -- no debe poder enviarse un link."""
    from app.models.erp_documents import SalesQuotation
    cot_sin_productos = SalesQuotation(numero="COT-TC2A", customer_name="Cliente Prueba",
                                        estado="BORRADOR", productos=[], total_cop=0)
    db.add(cot_sin_productos); db.commit(); db.refresh(cot_sin_productos)
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot_sin_productos.id}/enviar-confirmacion", json={}, headers=auth(admin_token))
    assert resp.status_code == 400

    cot_sin_precio = SalesQuotation(numero="COT-TC2B", customer_name="Cliente Prueba",
                                     estado="BORRADOR", productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 0}], total_cop=0)
    db.add(cot_sin_precio); db.commit(); db.refresh(cot_sin_precio)
    resp2 = app_client.post(f"/api/v1/ventas/cotizaciones/{cot_sin_precio.id}/enviar-confirmacion", json={}, headers=auth(admin_token))
    assert resp2.status_code == 400


def test_enviar_confirmacion_rechaza_si_ya_tiene_pven(app_client, db, admin_token):
    from app.models.erp_documents import SalesQuotation, SaleOrder
    cot = SalesQuotation(numero="COT-TC3", customer_name="Cliente Prueba", estado="ENVIADA",
                          total_cop=1000, productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)
    so = SaleOrder(numero="PVEN-TC3", cot_id=cot.id, customer_name="Cliente Prueba", estado="PENDIENTE_COMPRA")
    db.add(so); db.commit()

    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={}, headers=auth(admin_token))
    assert resp.status_code == 400
    db.refresh(cot)
    assert cot.estado == "ENVIADA"  # sin escritura parcial


def test_enviar_confirmacion_exitoso_crea_token_y_retorna_link(app_client, db, admin_token):
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTCONF1B", customer_name="Cliente Prueba",
                          customer_email="cliente@test.com", estado="BORRADOR", total_cop=1000,
                          productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)

    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={"user_name": "test"}, headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.json().get("link_confirmacion")  # necesario para el mensaje de WhatsApp (hallazgo #3)
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"

    from app.models.confirmation import DocumentConfirmationToken
    token_row = db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.document_type == "COT", DocumentConfirmationToken.document_id == cot.id
    ).first()
    assert token_row is not None


def test_confirmar_cot_via_link_sincroniza_sc(app_client, db, admin_token):
    from app.models.erp_documents import CustomerRequest, SalesQuotation
    sc = CustomerRequest(numero="SC-TESTCONF5", customer_name="Cliente Prueba", estado="COTIZADA")
    db.add(sc); db.commit(); db.refresh(sc)
    cot = SalesQuotation(numero="COT-TESTCONF2", sc_id=sc.id, sc_numero=sc.numero, customer_name="Cliente Prueba",
                          estado="PENDIENTE_CONFIRMACION", productos=[])
    db.add(cot); db.commit(); db.refresh(cot)

    from app.core.confirmation_tokens import create_confirmation_token
    raw = create_confirmation_token(db, "COT", cot.id)

    resp = app_client.post("/api/v1/confirmar/confirmar", json={"token": raw}, headers={"Idempotency-Key": "test-cot-1"})
    assert resp.status_code == 200
    db.refresh(cot); db.refresh(sc)
    assert cot.estado == "CONFIRMADA"
    # confirmar_via_token es la UNICA linea que escribe gate2_confirmed_at.
    assert cot.gate2_confirmed_at is not None
    assert sc.estado == "CONFIRMADA"  # sincronizado automaticamente, sin tocar la funcion de sync

    # Reintento con el mismo token ya usado
    resp2 = app_client.post("/api/v1/confirmar/confirmar", json={"token": raw}, headers={"Idempotency-Key": "test-cot-2"})
    assert resp2.status_code == 400


def test_ver_confirmacion_cot_rechaza_si_ya_no_esta_pendiente(app_client, db, admin_token):
    """Mismo criterio defensivo que la rama SC de ver_confirmacion (si el documento
    ya no esta PENDIENTE_CONFIRMACION, el token -- aunque siga tecnicamente sin usar
    y sin vencer en la tabla -- no debe funcionar). Hoy no hay ningun camino real que
    deje una COT asi (update_cotizacion revoca en toda transicion real de salida), pero
    la misma defensa en profundidad que ya existe para SC no deberia faltar aqui."""
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTCONF10B", customer_name="Cliente Prueba", estado="BORRADOR", productos=[])
    db.add(cot); db.commit(); db.refresh(cot)

    from app.core.confirmation_tokens import create_confirmation_token
    raw = create_confirmation_token(db, "COT", cot.id)

    resp = app_client.post("/api/v1/confirmar/ver", json={"token": raw})
    assert resp.status_code == 400


def test_ver_confirmacion_cot_funciona_mientras_esta_pendiente(app_client, db, admin_token):
    """Camino feliz de /confirmar/ver para COT, exercitado por separado de
    /confirmar/confirmar (son dos endpoints/tests distintos -- el otro happy-path test
    de este archivo, test_confirmar_cot_via_link_sincroniza_sc, nunca llama a /ver).
    Sin este test, un bug que rechazara siempre (p.ej. invertir la condicion del
    hardening agregado en test_ver_confirmacion_cot_rechaza_si_ya_no_esta_pendiente)
    pasaria desapercibido: ese otro test solo prueba el caso de rechazo."""
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTCONF11B", customer_name="Cliente Prueba",
                          estado="PENDIENTE_CONFIRMACION", total_cop=1000,
                          productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)

    from app.core.confirmation_tokens import create_confirmation_token
    raw = create_confirmation_token(db, "COT", cot.id)

    resp = app_client.post("/api/v1/confirmar/ver", json={"token": raw})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["numero"] == "COT-TESTCONF11B"
    assert data["estado"] == "PENDIENTE_CONFIRMACION"
    assert data["total_cop"] == 1000


def test_patch_generico_no_puede_forzar_confirmada_en_cotizacion(app_client, db, admin_token):
    """Requisito de seguridad del plan (Global Constraint), no solo UX -- mismo
    criterio que ya aplica update_solicitud para Gate 1: CONFIRMADA solo se alcanza
    via el enlace publico de un solo uso."""
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTCONF3", customer_name="Cliente Prueba",
                          estado="PENDIENTE_CONFIRMACION", productos=[])
    db.add(cot); db.commit(); db.refresh(cot)

    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": "CONFIRMADA", "updated_by": "test"}, headers=auth(admin_token))
    assert resp.status_code == 400

    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"  # sin escritura parcial


def test_convertir_a_venta_ruta_directa_exige_marcador(app_client, db, admin_token):
    """CRITICO: prueba la ruta POST /cotizaciones/{id}/convertir-a-venta DIRECTAMENTE
    (no el wrapper /cotizaciones/{id}/confirmar) -- exactamente la clase de bug que
    Task 4 dejo pasar al gatear solo el wrapper (confirmar_solicitud) y dejar la ruta
    real (convertir_cotizacion_a_venta, registrada por separado) sin gate. Una COT que
    nunca paso por el link publico (sin marcador) no debe poder convertirse a Pedido
    de Venta por ninguna de las dos rutas."""
    from app.models.erp_documents import SalesQuotation, SaleOrder
    cot = SalesQuotation(numero="COT-TESTCONF4", customer_name="Cliente Prueba", estado="PENDIENTE_CONFIRMACION",
                          productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)

    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta", json={"user_name": "test"}, headers=auth(admin_token))
    assert resp.status_code == 400

    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"  # sin escritura parcial
    assert db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id).first() is None


def test_convertir_a_venta_rechaza_confirmada_sin_marcador(app_client, db, admin_token):
    """Si por cualquier otra via (hipotetica, no alcanzable hoy por el flujo real) una
    COT terminara en estado CONFIRMADA sin la marca de procedencia, el gate real
    (gate2_confirmed_at, no el estado) debe seguir rechazando la conversion -- no debe
    bastar con que el estado LEA 'Confirmada'. Mismo patron que los tests de bypass de
    Gate 1 (test_confirmar_solicitud_rechaza_tras_desvincular_cotizacion), que simulan
    el estado resultante directamente sin ejercitar el mecanismo que lo produciria."""
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTCONF4B", customer_name="Cliente Prueba", estado="CONFIRMADA",
                          productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)
    assert cot.gate2_confirmed_at is None

    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta", json={"user_name": "test"}, headers=auth(admin_token))
    assert resp.status_code == 400


def test_convertir_a_venta_rechaza_marcador_sin_estado_confirmada(app_client, db, admin_token):
    """Round 3 (adversarial review, hallazgo #2): el caso inverso del test anterior --
    simula la ventana real entre el commit del congelamiento de precio (nuevo precio +
    estado=BORRADOR, en update_cotizacion) y el commit que de verdad limpia
    gate2_confirmed_at (varios commits intermedios despues). Una COT en ese instante
    exacto: estado YA es BORRADOR, pero la marca TODAVIA esta puesta. Antes de este
    Round, el check solo miraba la marca -- esto habria pasado. Ahora exige
    estado=='CONFIRMADA' explicitamente tambien."""
    import datetime
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTCONF4C", customer_name="Cliente Prueba", estado="BORRADOR",
                          productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)
    cot.gate2_confirmed_at = datetime.datetime.utcnow()  # simula la ventana de la race
    db.commit()

    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta", json={"user_name": "test"}, headers=auth(admin_token))
    assert resp.status_code == 400
    db.refresh(cot)
    assert cot.estado == "BORRADOR"  # sin escritura parcial
    from app.models.erp_documents import SaleOrder
    assert db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id).first() is None


def test_enviar_confirmacion_limpia_marcador_viejo(app_client, db, admin_token):
    """Round 3 (hallazgo #2, defensa en profundidad): si por cualquier motivo una COT
    en BORRADOR/ENVIADA todavia trae una marca vieja puesta (no deberia pasar por
    construccion, pero se simula igual que el test anterior), enviar_cotizacion_para_confirmacion
    debe limpiarla al iniciar un ciclo nuevo -- nunca debe arrastrarse hacia el ciclo nuevo."""
    import datetime
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTCONF4D", customer_name="Cliente Prueba", estado="BORRADOR",
                          total_cop=1000, productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)
    cot.gate2_confirmed_at = datetime.datetime.utcnow()
    db.commit()

    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={"user_name": "test"}, headers=auth(admin_token))
    assert resp.status_code == 200
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"
    assert cot.gate2_confirmed_at is None  # la marca vieja no sobrevive al ciclo nuevo


def test_confirmar_cotizacion_wrapper_exige_marcador(app_client, db, admin_token):
    """El wrapper (POST /cotizaciones/{id}/confirmar, usado por el frontend) tambien
    debe rechazar sin marcador -- no solo la ruta directa."""
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTCONF5B", customer_name="Cliente Prueba", estado="PENDIENTE_CONFIRMACION",
                          productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "test"}, headers=auth(admin_token))
    assert resp.status_code == 400


def test_marcador_se_consume_al_crear_pven(app_client, db, admin_token):
    """El unico test que ejercita el ciclo de vida COMPLETO de gate2_confirmed_at de
    punta a punta (mismo rol que test_confirmar_solicitud_consume_gate1_confirmed_at_al_crear_cotizacion
    para Gate 1): enviar -> confirmar via el link real -> crear el Pedido de Venta ->
    200 -> la marca debe quedar en None, el estado se mantiene CONFIRMADA, y el PVEN
    queda vinculado."""
    from app.models.erp_documents import SalesQuotation, SaleOrder
    cot = SalesQuotation(numero="COT-TESTCONF6B", customer_name="Cliente Prueba", customer_email="c6@test.com",
                          estado="BORRADOR", productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}],
                          total_cop=1000, subtotal_cop=1000)
    db.add(cot); db.commit(); db.refresh(cot)

    send_resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={
        "user_name": "test",
    }, headers=auth(admin_token))
    assert send_resp.status_code == 200

    from app.models.confirmation import DocumentConfirmationToken
    token_row = db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.document_type == "COT", DocumentConfirmationToken.document_id == cot.id
    ).order_by(DocumentConfirmationToken.id.desc()).first()
    assert token_row is not None

    # El token crudo no esta persistido -- se mintea de nuevo con el mismo mecanismo
    # para simular el link real (mismo atajo que ya usa test_enviar_y_confirmar_via_link
    # para la rama SC).
    from app.core.confirmation_tokens import create_confirmation_token
    raw = create_confirmation_token(db, "COT", cot.id)

    confirm_resp = app_client.post("/api/v1/confirmar/confirmar", json={"token": raw}, headers={"Idempotency-Key": "test-cot-happy"})
    assert confirm_resp.status_code == 200
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA"
    assert cot.gate2_confirmed_at is not None  # recien puesta por confirmar_via_token

    pven_resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "test"}, headers=auth(admin_token))
    assert pven_resp.status_code == 200
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA"
    assert cot.gate2_confirmed_at is None  # consumida -- de un solo uso, igual que el token

    so = db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id).first()
    assert so is not None


def test_convertir_a_venta_replay_no_vuelve_a_chequear_marcador(app_client, db, admin_token):
    """La replay idempotente de convertir_cotizacion_a_venta (misma COT, ya
    convertida, mismo idempotency_key) no debe volver a exigir el marcador -- se
    consume en la conversion real y nunca se repone, asi que si el replay lo volviera
    a chequear, toda llamada posterior a la primera conversion exitosa fallaria."""
    from app.models.erp_documents import SalesQuotation, SaleOrder
    cot = SalesQuotation(numero="COT-TESTCONF7B", customer_name="Cliente Prueba",
                          estado="PENDIENTE_CONFIRMACION", productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}],
                          total_cop=1000, subtotal_cop=1000)
    db.add(cot); db.commit(); db.refresh(cot)

    from app.core.confirmation_tokens import create_confirmation_token
    raw = create_confirmation_token(db, "COT", cot.id)
    confirm_resp = app_client.post("/api/v1/confirmar/confirmar", json={"token": raw}, headers={"Idempotency-Key": "test-cot-replay"})
    assert confirm_resp.status_code == 200

    first = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta",
                             json={"user_name": "test", "idempotency_key": "IDEMP-COT-TESTCONF7B"}, headers=auth(admin_token))
    assert first.status_code == 200
    assert first.json()["idempotent_replay"] is False
    so_id = first.json()["sale_order_id"]

    db.refresh(cot)
    assert cot.gate2_confirmed_at is None  # consumida por la conversion real

    second = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta",
                              json={"user_name": "test", "idempotency_key": "IDEMP-COT-TESTCONF7B"}, headers=auth(admin_token))
    assert second.status_code == 200
    assert second.json()["idempotent_replay"] is True
    assert second.json()["sale_order_id"] == so_id

    assert db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id).count() == 1


def test_patch_generico_transicion_real_revoca_token_y_limpia_marcador(app_client, db, admin_token):
    """COT no tiene cancelar_cotizacion/restaurar_cotizacion dedicados como SC -- el
    PATCH generico es la UNICA salida real del ciclo de Gate 2. Repro: Enviar (token
    T1) -> pastilla generica 'Cambiar Estado -> Rechazada'. T1 debe quedar revocado."""
    import hashlib
    from app.models.erp_documents import SalesQuotation
    from app.models.confirmation import DocumentConfirmationToken

    def _used_at(raw_token):
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        row = db.query(DocumentConfirmationToken).filter(DocumentConfirmationToken.token_hash == token_hash).first()
        assert row is not None
        return row.used_at

    cot = SalesQuotation(numero="COT-TESTCONF8B", customer_name="Cliente Prueba", estado="BORRADOR",
                          total_cop=1000, productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)

    send_resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={
        "user_name": "test",
    }, headers=auth(admin_token))
    assert send_resp.status_code == 200

    from app.core.confirmation_tokens import create_confirmation_token
    t1 = create_confirmation_token(db, "COT", cot.id)  # simula el link T1 ya enviado por correo

    patch_resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": "RECHAZADA", "updated_by": "test"}, headers=auth(admin_token))
    assert patch_resp.status_code == 200
    assert patch_resp.json()["data"]["estado"] == "RECHAZADA"
    assert _used_at(t1) is not None  # el PATCH generico a RECHAZADA SI revoco T1

    get_resp = app_client.post("/api/v1/confirmar/ver", json={"token": t1})
    assert get_resp.status_code == 400


def test_patch_generico_transicion_desde_confirmada_limpia_marcador(app_client, db, admin_token):
    """Simetrico al caso PENDIENTE_CONFIRMACION: si una COT ya CONFIRMADA (con
    gate2_confirmed_at puesto) sale del ciclo por el PATCH generico (p.ej. a
    RECHAZADA), la marca debe limpiarse -- no debe quedar disponible para un ciclo de
    venta futuro y no relacionado sobre la misma Cotizacion."""
    import datetime
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTCONF9B", customer_name="Cliente Prueba", estado="CONFIRMADA", productos=[])
    db.add(cot); db.commit(); db.refresh(cot)
    cot.gate2_confirmed_at = datetime.datetime.utcnow()
    db.commit()

    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": "RECHAZADA", "updated_by": "test"}, headers=auth(admin_token))
    assert resp.status_code == 200
    db.refresh(cot)
    assert cot.estado == "RECHAZADA"
    assert cot.gate2_confirmed_at is None


# ── Round 2 (adversarial review, hallazgo #5): "congelar" el precio confirmado ──────
# Editar la cotizacion despues de que el cliente ya confirmo (o mientras espera
# confirmar) invalida esa confirmacion -- el punto entero de Gate 2 es "el cliente
# acepto ESTO". Simetrico en estructura a sale_de_gate2 (misma captura temprana,
# mismo criterio de "unica salida real"), pero activado por un cambio de PRECIO en
# vez de un cambio de ESTADO.

def test_editar_precio_mientras_pendiente_confirmacion_reinicia_a_borrador(app_client, db, admin_token):
    from app.models.erp_documents import SalesQuotation
    from app.models.confirmation import DocumentConfirmationToken
    cot = SalesQuotation(numero="COT-TESTFREEZE1", customer_name="Cliente Prueba",
                          estado="PENDIENTE_CONFIRMACION", total_cop=1000,
                          productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)

    from app.core.confirmation_tokens import create_confirmation_token
    t1 = create_confirmation_token(db, "COT", cot.id)

    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "total_cop": 2000, "productos": [{"product_name": "X", "qty": 1, "unit_price_cop": 2000}],
        "updated_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200
    db.refresh(cot)
    assert cot.estado == "BORRADOR"  # la confirmacion pendiente ya no aplica al precio nuevo
    assert cot.total_cop == 2000  # el PATCH si se aplico, solo que ya no sigue "pendiente"

    token_hash = __import__("hashlib").sha256(t1.encode()).hexdigest()
    row = db.query(DocumentConfirmationToken).filter(DocumentConfirmationToken.token_hash == token_hash).first()
    assert row.used_at is not None  # T1 revocado


def test_editar_precio_mientras_confirmada_sin_pven_reinicia_y_limpia_marcador(app_client, db, admin_token):
    import datetime
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTFREEZE2", customer_name="Cliente Prueba",
                          estado="CONFIRMADA", total_cop=1000,
                          productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)
    cot.gate2_confirmed_at = datetime.datetime.utcnow()
    db.commit()

    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"total_cop": 2000, "updated_by": "test"}, headers=auth(admin_token))
    assert resp.status_code == 200
    db.refresh(cot)
    assert cot.estado == "BORRADOR"
    assert cot.gate2_confirmed_at is None  # la confirmacion ya consumida/vigente no aplica al precio nuevo


def test_reenviar_precio_con_ruido_de_punto_flotante_no_rompe_el_congelamiento(app_client, db, admin_token):
    """URGENTE (Round 3, adversarial review): hallazgo real, no hipotetico -- computeMarginPrice
    (frontend/src/lib/pricing.js) no redondea su salida (totalCop = costoTotalCop / (1 -
    margen/100)), asi que un guardado real de la Calculadora con, p.ej., costo_total=42000 y
    margen=30% produce 42000 / 0.7 == 60000.00000000001 (ruido de punto flotante real,
    reproducido aqui con el MISMO calculo, no un numero inventado). El valor VIEJO en el ORM
    (Decimal, ya redondeado a 2 decimales por la columna Numeric de Postgres al guardarse la
    primera vez) es Decimal('60000.00') -- Decimal('60000.00') != 60000.00000000001 en Python
    (son valores distintos de verdad). Sin cuantizar antes de comparar, ESTE guardado --
    exactamente el que produce la formula real con numeros de negocio normales, no un edge
    case -- disparaba el congelamiento en practicamente cualquier guardado real desde la
    Calculadora, lo que habria hecho Gate 2 inutilizable en operacion normal."""
    from decimal import Decimal
    costo_total = 42000
    margen_pct = 30
    total_con_ruido = costo_total / (1 - margen_pct / 100)
    assert total_con_ruido != 60000.00  # confirma que de verdad hay ruido, no es un round number

    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTFREEZE7", customer_name="Cliente Prueba",
                          estado="PENDIENTE_CONFIRMACION", total_cop=60000.00,
                          productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 60000.00}])
    db.add(cot); db.commit(); db.refresh(cot)
    assert cot.total_cop == Decimal("60000.00")  # confirma el redondeo real de la columna Numeric

    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "total_cop": total_con_ruido, "updated_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"  # NO debe reiniciar -- es el mismo precio


def test_editar_precio_mientras_confirmada_con_pven_no_reinicia(app_client, db, admin_token):
    """Exclusion importante: una vez que ya existe un Pedido de Venta real para esta
    COT, re-cotizar es la operacion legitima de actualizar un trato YA CERRADO (ver
    commitCalcSave/PropagarPvenConfirm en el frontend, que propaga el precio nuevo al
    PVEN existente) -- no una confirmacion que se vuelve obsoleta. No debe revertir a
    BORRADOR ni tocar gate2_confirmed_at (que de todas formas ya esta en None, consumido
    por la conversion real)."""
    from app.models.erp_documents import SalesQuotation, SaleOrder
    cot = SalesQuotation(numero="COT-TESTFREEZE3", customer_name="Cliente Prueba",
                          estado="CONFIRMADA", total_cop=1000,
                          productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)
    so = SaleOrder(numero="PVEN-TESTFREEZE3", cot_id=cot.id, customer_name="Cliente Prueba", estado="PENDIENTE_COMPRA")
    db.add(so); db.commit()

    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"total_cop": 2000, "updated_by": "test"}, headers=auth(admin_token))
    assert resp.status_code == 200
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA"  # NO se reinicia -- ya hay un PVEN real vinculado


def test_reenvio_mismo_valor_no_rompe_el_congelamiento(app_client, db, admin_token):
    """No basta con que la llave venga en el body -- debe ser un cambio REAL de valor.
    Un PATCH que reenvia exactamente los mismos productos/total_cop (p.ej. un guardado
    repetido desde el mismo formulario sin tocar nada) no debe invalidar la confirmacion."""
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTFREEZE4", customer_name="Cliente Prueba",
                          estado="PENDIENTE_CONFIRMACION", total_cop=1000,
                          productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)

    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "total_cop": 1000, "productos": [{"product_name": "X", "qty": 1, "unit_price_cop": 1000}],
        "updated_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"  # sin cambio real -- sigue vigente


def test_editar_campo_no_relacionado_a_precio_no_rompe_el_congelamiento(app_client, db, admin_token):
    """Solo los campos de precio/entrega listados rompen el congelamiento -- editar
    'notas' (irrelevante para lo que el cliente esta confirmando) no debe hacerlo."""
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTFREEZE5", customer_name="Cliente Prueba",
                          estado="PENDIENTE_CONFIRMACION", total_cop=1000,
                          productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)

    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"notas": "nota interna", "updated_by": "test"}, headers=auth(admin_token))
    assert resp.status_code == 200
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"


def test_reenviar_misma_fecha_como_string_no_rompe_el_congelamiento(app_client, db, admin_token):
    """Bug real encontrado durante la implementacion: el selector de fecha de la
    Calculadora (frontend) SIEMPRE manda fecha_entrega_estimada en el payload de
    guardado (la haya tocado el usuario o no), como un string de solo fecha
    ('YYYY-MM-DD'), nunca como el datetime completo que ya esta guardado. Sin
    normalizar la comparacion, un datetime real nunca es == a un string aunque
    representen el mismo dia -- eso habria roto el congelamiento (reiniciado a
    BORRADOR) en CADA guardado normal desde la Calculadora, incluso sin cambiar nada."""
    import datetime
    from app.models.erp_documents import SalesQuotation
    fecha = datetime.datetime(2026, 11, 20, 14, 32, 7)  # con hora -- igual que la realidad
    cot = SalesQuotation(numero="COT-TESTFREEZE6", customer_name="Cliente Prueba",
                          estado="PENDIENTE_CONFIRMACION", total_cop=1000,
                          fecha_entrega_estimada=fecha,
                          productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)

    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "fecha_entrega_estimada": "2026-11-20", "updated_by": "test",  # mismo dia, sin hora
    }, headers=auth(admin_token))
    assert resp.status_code == 200
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"  # mismo dia -- no es un cambio real

    resp2 = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "fecha_entrega_estimada": "2026-11-25", "updated_by": "test",  # dia distinto
    }, headers=auth(admin_token))
    assert resp2.status_code == 200
    db.refresh(cot)
    assert cot.estado == "BORRADOR"  # dia realmente distinto -- SI rompe el congelamiento
