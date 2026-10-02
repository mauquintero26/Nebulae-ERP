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
