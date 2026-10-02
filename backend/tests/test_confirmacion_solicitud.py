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
