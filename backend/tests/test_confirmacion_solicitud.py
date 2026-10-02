"""
Tests para Task 4: infraestructura de confirmacion por link + Gate 1 (Solicitud).

Cubre: auto-promocion a ASIGNADA al asignar asesor, el endpoint
enviar-confirmacion (que exige ASIGNADA y genera un token), el flujo publico
GET/POST /api/v1/confirmar/{token} (consulta + confirmacion de un solo uso),
y la precondicion de confirmar_solicitud ahora exigiendo CONFIRMADA.
"""


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_enviar_sc_para_confirmacion_requiere_asesor(app_client, db, admin_token):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF1", customer_name="Cliente Prueba", estado="BORRADOR")
    db.add(sc); db.commit(); db.refresh(sc)

    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "test"}, headers=auth(admin_token))
    assert resp.status_code == 400  # sin asesor asignado todavia


def test_asignar_asesor_promueve_a_asignada(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF2", customer_name="Cliente Prueba", estado="BORRADOR")
    db.add(sc); db.commit(); db.refresh(sc)

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"advisor_user_id": user_admin.id, "updated_by": "test"}, headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.json()["data"]["estado"] == "ASIGNADA"

    # La transicion BORRADOR->ASIGNADA debe quedar en el Chatter/Actividad aunque el
    # PATCH no haya mandado "estado" explicitamente (solo advisor_user_id) -- sin este
    # log la promocion automatica seria invisible para quien revise el historial.
    from app.models.erp_documents import ActivityLog
    log = db.query(ActivityLog).filter(
        ActivityLog.entity_type == "SC", ActivityLog.entity_id == sc.id, ActivityLog.action == "ESTADO_CHANGED"
    ).order_by(ActivityLog.id.desc()).first()
    assert log is not None
    assert log.old_estado == "BORRADOR"
    assert log.new_estado == "ASIGNADA"


def test_enviar_y_confirmar_via_link(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF3", customer_name="Cliente Prueba",
                          customer_email="cliente@test.com", estado="ASIGNADA", advisor_user_id=user_admin.id)
    db.add(sc); db.commit(); db.refresh(sc)

    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "test"}, headers=auth(admin_token))
    assert resp.status_code == 200
    db.refresh(sc)
    assert sc.estado == "PENDIENTE_CONFIRMACION"

    from app.models.confirmation import DocumentConfirmationToken
    token_row = db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.document_type == "SC", DocumentConfirmationToken.document_id == sc.id
    ).order_by(DocumentConfirmationToken.id.desc()).first()
    assert token_row is not None
    # El token crudo no esta persistido -- lo generamos de nuevo con el mismo mecanismo
    # para simular el link real (en un test end-to-end se interceptaria send_email;
    # aqui se prueba la consulta GET/POST con un token minteado igual que en el
    # agente de reset de password).
    from app.core.confirmation_tokens import create_confirmation_token
    raw = create_confirmation_token(db, "SC", sc.id)

    get_resp = app_client.get(f"/api/v1/confirmar/{raw}")
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["numero"] == "SC-TESTCONF3"

    post_resp = app_client.post(f"/api/v1/confirmar/{raw}", headers={"Idempotency-Key": "test-key-1"})
    assert post_resp.status_code == 200
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"

    # Reintento con el mismo token ya usado
    post_resp2 = app_client.post(f"/api/v1/confirmar/{raw}", headers={"Idempotency-Key": "test-key-2"})
    assert post_resp2.status_code == 400


def test_confirmar_solicitud_exige_confirmada(app_client, db, admin_token):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF4", customer_name="Cliente Prueba", estado="ASIGNADA")
    db.add(sc); db.commit(); db.refresh(sc)
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "test"}, headers=auth(admin_token))
    assert resp.status_code == 400


def test_patch_generico_no_puede_forzar_confirmada(app_client, db, admin_token):
    """Requisito de seguridad del plan (Global Constraint), no solo UX: CONFIRMADA
    solo se alcanza vía el enlace público de un solo uso. Antes de este fix, PATCH
    /solicitudes/{id} con {"estado": "CONFIRMADA"} funcionaba igual que antes de toda
    esta tarea -- el retiro de CONFIRMADA de ESTADOS_SC_MANUALES en el frontend (Step 12)
    solo ocultaba el atajo en la pastilla de un clic, no cerraba la ruta real por API.
    Un ROLE_ASESOR/ROLE_ADMIN (el actor que esta funcionalidad existe para restringir)
    podía seguir confirmando con una sola llamada cruda, sin que el cliente confirmara
    nada."""
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF5", customer_name="Cliente Prueba", estado="PENDIENTE_CONFIRMACION")
    db.add(sc); db.commit(); db.refresh(sc)

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "CONFIRMADA", "updated_by": "test"}, headers=auth(admin_token))
    assert resp.status_code == 400

    # No debe haber escritura parcial: el estado original se preserva intacto.
    db.refresh(sc)
    assert sc.estado == "PENDIENTE_CONFIRMACION"


def test_confirmar_solicitud_rechaza_si_ya_tiene_cotizacion(app_client, db, admin_token):
    """Bypass real encontrado en security review: _sincronizar_estado_solicitud_desde_cotizacion
    (mecanismo preexistente y protegido) tambien escribe SC.estado = "CONFIRMADA" cuando
    su Cotizacion vinculada se confirma -- una accion de venta normal, no un ataque. Sin
    este check, cualquier venta cerrada reabriria "Confirmar + Crear Cotizacion" sobre una
    SC que ya tiene su Cotizacion real, permitiendo crear una COT duplicada. Se simula el
    estado posterior a esa sincronizacion directamente (misma tecnica que _forzar_confirmada
    en test_crm_lead_movimiento_automatico.py), sin ejercitar update_cotizacion -- lo que se
    prueba aqui es la precondicion de confirmar_solicitud, no la sincronizacion en si."""
    from app.models.erp_documents import CustomerRequest, SalesQuotation
    sc = CustomerRequest(numero="SC-TESTCONF6", customer_name="Cliente Prueba", estado="BORRADOR")
    db.add(sc); db.commit(); db.refresh(sc)
    cot = SalesQuotation(numero="COT-TESTCONF6", sc_id=sc.id, sc_numero=sc.numero,
                          customer_name="Cliente Prueba", estado="CONFIRMADA")
    db.add(cot); db.commit()
    sc.estado = "CONFIRMADA"
    db.commit(); db.refresh(sc)

    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "test"}, headers=auth(admin_token))
    assert resp.status_code == 400

    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"  # sin escritura parcial (no debio pasar a COTIZADA)


def test_link_no_confirma_sc_cancelada(app_client, db, admin_token, user_admin):
    """Bypass real encontrado en security review: el token de confirmacion no revisaba
    el estado de la SC al canjearse. Si un asesor cancela la SC despues de enviarla para
    confirmacion, un cliente que aun tenga el link (todavia valido, no vencido) podia
    revivirla a CONFIRMADA pese a estar en la papelera (eliminada_at/razon_cancelacion ya
    establecidos). Prueba el flujo real completo: enviar -> cancelar -> click en el link."""
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF7", customer_name="Cliente Prueba",
                          customer_email="cliente7@test.com", estado="ASIGNADA", advisor_user_id=user_admin.id)
    db.add(sc); db.commit(); db.refresh(sc)

    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "test"}, headers=auth(admin_token))
    assert resp.status_code == 200

    from app.core.confirmation_tokens import create_confirmation_token
    raw = create_confirmation_token(db, "SC", sc.id)

    cancel_resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/cancelar", json={"razon": "Cliente desistio", "user_name": "test"}, headers=auth(admin_token))
    assert cancel_resp.status_code == 200

    # El cliente, sin saber que la SC fue cancelada, hace clic en el link que ya tenia.
    get_resp = app_client.get(f"/api/v1/confirmar/{raw}")
    assert get_resp.status_code == 400

    post_resp = app_client.post(f"/api/v1/confirmar/{raw}", headers={"Idempotency-Key": "test-key-cancel"})
    assert post_resp.status_code == 400

    db.refresh(sc)
    assert sc.estado == "CANCELADA"  # nunca revivida a CONFIRMADA


def test_crear_solicitud_con_asesor_empieza_asignada(app_client, admin_token, user_admin):
    """Round 5 (gap de alcanzabilidad por UI, decidido por el usuario): crear una SC
    con advisor_user_id ya elegido debe arrancar directamente en ASIGNADA, no en
    BORRADOR. Antes de este fix, la unica forma de llegar a ASIGNADA con un asesor
    elegido desde el principio era editar la SC despues -- y el formulario de edicion
    ni siquiera tenia un selector de asesor hasta este mismo round."""
    resp = app_client.post("/api/v1/ventas/solicitudes", json={
        "customer_name": "Cliente Prueba", "tipo_solicitud": "Cotizacion de Producto",
        "advisor_user_id": user_admin.id, "created_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 201
    assert resp.json()["data"]["estado"] == "ASIGNADA"


def test_crear_solicitud_sin_asesor_sigue_en_borrador(app_client, admin_token):
    """Regresion: sin advisor_user_id al crear, el comportamiento historico (BORRADOR)
    no cambia -- el fix de arriba es condicional, no un cambio del default."""
    resp = app_client.post("/api/v1/ventas/solicitudes", json={
        "customer_name": "Cliente Prueba", "tipo_solicitud": "Cotizacion de Producto",
        "created_by": "test",
    }, headers=auth(admin_token))
    assert resp.status_code == 201
    assert resp.json()["data"]["estado"] == "BORRADOR"

# Nota: el caso "PATCH estilo formulario de edicion con advisor_user_id sobre una SC
# BORRADOR sin asesor promueve a ASIGNADA" ya esta cubierto por
# test_asignar_asesor_promueve_a_asignada (arriba) desde la implementacion original de
# este Task -- confirmado (no duplicado) por la corrida completa de este archivo tras
# este Round.


def test_confirmar_solicitud_rechaza_tras_desvincular_cotizacion(app_client, db, admin_token, user_admin):
    """Round 6: repro exacto encontrado por un security review dedicado -- el guard de
    'cero Cotizaciones vinculadas' (Round 4) resulto falseable desvinculando la COT
    despues de que la sincronizacion COT->SC (preexistente, protegida) escribiera
    CONFIRMADA: crear una COT vinculada, confirmarla (la sincronizacion real escribe
    SC.estado="CONFIRMADA"), desvincularla (PATCH /cotizaciones/{id} {"sc_id": null})
    deja la SC en CONFIRMADA con cero Cotizaciones vinculadas -- exactamente la
    condicion que ese guard trataba como prueba de legitimidad. 4 llamadas normales de
    ROLE_ASESOR, sin acceso exotico. gate1_confirmed_at (nunca escrito, porque la SC
    nunca paso por el link publico) es la defensa real que esto prueba; se simula el
    estado resultante directamente (misma tecnica que el test de Round 4 para este
    mismo escenario), porque lo que esta bajo prueba es la precondicion de
    confirmar_solicitud, no la sincronizacion en si."""
    from app.models.erp_documents import CustomerRequest, SalesQuotation
    sc = CustomerRequest(numero="SC-TESTCONF8", customer_name="Cliente Prueba",
                          estado="ASIGNADA", advisor_user_id=user_admin.id)
    db.add(sc); db.commit(); db.refresh(sc)
    cot = SalesQuotation(numero="COT-TESTCONF8", sc_id=sc.id, sc_numero=sc.numero,
                          customer_name="Cliente Prueba", estado="CONFIRMADA")
    db.add(cot); db.commit()
    sc.estado = "CONFIRMADA"  # lo que la sincronizacion real habria escrito
    db.commit()
    cot.sc_id = None  # desvinculada -- cero Cotizaciones vinculadas otra vez
    db.commit()
    db.refresh(sc)
    assert sc.gate1_confirmed_at is None  # nunca hubo una confirmacion real por link

    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "test"}, headers=auth(admin_token))
    assert resp.status_code == 400

    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"  # sin escritura parcial


def test_reset_a_borrador_con_asesor_todavia_puesto_vuelve_a_asignada(app_client, db, admin_token, user_admin):
    """Round 6: el invariante generalizado dice que una SC nunca debe quedar en
    BORRADOR con un asesor ya asignado. Si la pastilla manual pide "BORRADOR" pero
    advisor_user_id sigue siendo no nulo (no se toco en el mismo PATCH), la SC se
    promueve de inmediato de vuelta a ASIGNADA en vez de quedarse en BORRADOR."""
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF9", customer_name="Cliente Prueba",
                          estado="ASIGNADA", advisor_user_id=user_admin.id)
    db.add(sc); db.commit(); db.refresh(sc)

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "BORRADOR", "updated_by": "test"}, headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.json()["data"]["estado"] == "ASIGNADA"


def test_restaurar_solicitud_con_asesor_todavia_puesto_vuelve_a_asignada(app_client, db, admin_token, user_admin):
    """Round 6: restaurar_solicitud (papelera) no pasa por update_solicitud -- hace su
    propio UPDATE crudo -- asi que necesita el mismo invariante por separado. Una SC
    cancelada que todavia tenga advisor_user_id (cancelar_solicitud no lo limpia) debe
    restaurarse a ASIGNADA, no a un BORRADOR-con-asesor sin salida."""
    import datetime
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF13", customer_name="Cliente Prueba",
                          estado="CANCELADA", advisor_user_id=user_admin.id,
                          razon_cancelacion="Prueba", eliminada_at=datetime.datetime.utcnow())
    db.add(sc); db.commit(); db.refresh(sc)

    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/restaurar", headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.json()["data"]["estado"] == "ASIGNADA"


def test_quitar_asesor_estando_pendiente_degrada_a_borrador_y_revoca_token(app_client, db, admin_token, user_admin):
    """Round 6: caso inverso del invariante -- si un PATCH deja advisor_user_id en
    null mientras la SC estaba ASIGNADA o PENDIENTE_CONFIRMACION, se degrada a
    BORRADOR (en vez de quedar "flotando" ofreciendo acciones de Gate 1 sin asesor) y
    se revoca cualquier token pendiente."""
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF10", customer_name="Cliente Prueba",
                          customer_email="cliente10@test.com", estado="ASIGNADA", advisor_user_id=user_admin.id)
    db.add(sc); db.commit(); db.refresh(sc)

    send_resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "test"}, headers=auth(admin_token))
    assert send_resp.status_code == 200  # old_estado ahora es PENDIENTE_CONFIRMACION

    from app.core.confirmation_tokens import create_confirmation_token
    raw = create_confirmation_token(db, "SC", sc.id)

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"advisor_user_id": "", "updated_by": "test"}, headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.json()["data"]["estado"] == "BORRADOR"

    # El token que ya existia (emitido antes de quitar el asesor) queda revocado.
    get_resp = app_client.get(f"/api/v1/confirmar/{raw}")
    assert get_resp.status_code == 400


def test_reenviar_confirmacion_desde_pendiente_revoca_el_anterior(app_client, db, admin_token, user_admin):
    """Round 6: cierra el callejon sin salida de un link vencido (TTL 2 dias) sin
    ninguna forma de pedir uno nuevo -- enviar-confirmacion ahora tambien acepta
    PENDIENTE_CONFIRMACION como estado de entrada (reenvio), revocando el token
    anterior antes de emitir uno nuevo."""
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF11", customer_name="Cliente Prueba",
                          customer_email="cliente11@test.com", estado="ASIGNADA", advisor_user_id=user_admin.id)
    db.add(sc); db.commit(); db.refresh(sc)

    first = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "test"}, headers=auth(admin_token))
    assert first.status_code == 200

    from app.core.confirmation_tokens import create_confirmation_token
    old_raw = create_confirmation_token(db, "SC", sc.id)  # simula el link ya enviado

    second = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "test"}, headers=auth(admin_token))
    assert second.status_code == 200
    db.refresh(sc)
    assert sc.estado == "PENDIENTE_CONFIRMACION"  # sigue pendiente, no hubo cambio real de estado

    old_get = app_client.get(f"/api/v1/confirmar/{old_raw}")
    assert old_get.status_code == 400  # el link viejo ya no funciona

    new_link = second.json()["link_confirmacion"]
    new_token = new_link.rsplit("/", 1)[-1]
    new_get = app_client.get(f"/api/v1/confirmar/{new_token}")
    assert new_get.status_code == 200  # el link nuevo si funciona


def test_enviar_confirmacion_rechaza_sin_asesor_aunque_este_asignada(app_client, db, admin_token):
    """Round 6: red de seguridad barata -- ASIGNADA/PENDIENTE_CONFIRMACION implican un
    asesor por construccion hoy (ver update_solicitud/promueve_asignada y
    create_solicitud), pero se valida explicitamente en vez de asumirlo. Estado
    sintetico (no alcanzable por el flujo normal) solo para probar el check en si."""
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF12", customer_name="Cliente Prueba", estado="ASIGNADA")
    db.add(sc); db.commit(); db.refresh(sc)

    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "test"}, headers=auth(admin_token))
    assert resp.status_code == 400
