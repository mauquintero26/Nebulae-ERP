"""H29: guardar una Solicitud (PATCH /ventas/solicitudes/{id}) es UNA sola transaccion con un solo commit.

El cambio de la SC, los renglones de Actividad y la revocacion del enlace de confirmacion (si cambio el estado) se
confirman juntos. Antes eran 2-4 commits, y cada commit devuelve la conexion al pool: en una base remota cada viaje
de mas (pre_ping, BEGIN, relectura del objeto expirado) se paga completo y el PATCH tardaba ~2,5 s.

Los commits se cuentan con la fixture `contador_sql` del runner de ROLLBACK (escucha Session.after_commit a nivel de
clase). El runner usa UNA conexion para toda la prueba, asi que los 'checkout' del pool (que el diseno original
contaba con tests.conftest.test_engine) no se pueden medir aqui: lo que si se mide son los commits y las consultas.
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


def _actividades_sc(db, sc):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    return db.query(ActivityLog).filter(ActivityLog.entity_type == "SC", ActivityLog.entity_id == sc.id).all()


LINEA = {"product_name": "Cuna Colecho", "qty": 1}


def test_guardar_productos_de_la_sc_usa_una_sola_transaccion(app_client, db, admin_token, user_admin, contador_sql):
    sc = _sc(db, "SC-RAP001", user_admin, estado="ASIGNADA", productos=[LINEA])

    with contador_sql.ventana() as v:
        resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
            "productos": [LINEA, {"product_name": "Silla", "qty": 2}], "updated_by": "test"},
            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["productos"][1]["product_name"] == "Silla"
    assert data["estado"] == "ASIGNADA"
    assert v.commits == 1, f"el PATCH debe confirmar una sola vez, confirmo {v.commits} veces"
    # Sin releer objetos expirados tras el commit: usuario, SC, UPDATE, relectura del refresh e INSERT de la actividad.
    assert v.consultas <= 5, f"demasiadas consultas ({v.consultas}):\n" + "\n---\n".join(v.sentencias)

    logs = _actividades_sc(db, sc)
    assert [l.action for l in logs] == ["UPDATED"]
    assert "Producto agregado" in [c["etiqueta"] for c in logs[0].extra_data["cambios"]]


def test_cambiar_productos_con_enlace_pendiente_revoca_el_enlace_en_la_misma_transaccion(
        app_client, db, admin_token, user_admin, contador_sql):
    from app.core.confirmation_tokens import create_confirmation_token
    sc = _sc(db, "SC-RAP002", user_admin, estado="PENDIENTE_CONFIRMACION", productos=[LINEA],
             gate1_confirmed_at=datetime.datetime.utcnow())
    token = create_confirmation_token(db, "SC", sc.id)

    with contador_sql.ventana() as v:
        resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
            "productos": [{"product_name": "Cuna Colecho", "qty": 3}], "updated_by": "test"},
            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "ASIGNADA"
    assert v.commits == 1, f"el PATCH debe confirmar una sola vez, confirmo {v.commits} veces"
    assert _token_usado(db, token)  # el enlace que tiene el cliente ya no sirve
    db.refresh(sc)
    assert sc.gate1_confirmed_at is None

    actividades = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]["actividades"]
    assert [a["action"] for a in actividades][-2:] == ["UPDATED", "ESTADO_CHANGED"]


def test_cambiar_la_modalidad_recalcula_el_anticipo_de_las_cot_en_la_misma_transaccion(
        app_client, db, admin_token, user_admin, contador_sql):
    """Choque H36/H29: el recalculo del anticipo y su renglon en la Actividad de la COT van antes del unico commit."""
    from app.models.erp_documents import ActivityLog, SalesQuotation
    sc = _sc(db, "SC-RAP005", user_admin, estado="ASIGNADA", productos=[LINEA], modalidad_pago="Contado")
    cot = SalesQuotation(numero="COT-RAP005", sc_id=sc.id, sc_numero=sc.numero, customer_name="Cliente Prueba",
                         estado="BORRADOR", productos=[LINEA], total_cop=1000000, anticipo_cop=1000000)
    db.add(cot); db.commit(); db.refresh(cot)

    with contador_sql.ventana() as v:
        resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
            "modalidad_pago": "60/40 (60% anticipo - 40% pendiente)", "updated_by": "test"},
            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert v.commits == 1, f"el PATCH debe confirmar una sola vez, confirmo {v.commits} veces"
    db.expire_all()
    db.refresh(cot)
    assert int(cot.anticipo_cop) == 600000
    logs_cot = db.query(ActivityLog).filter(ActivityLog.entity_type == "COT", ActivityLog.entity_id == cot.id).all()
    assert [l.action for l in logs_cot] == ["UPDATED"]
    assert "Anticipo recalculado" in logs_cot[0].description


def test_si_falla_armar_la_actividad_los_productos_igual_se_guardan(app_client, db, admin_token, user_admin,
                                                                    monkeypatch):
    from app.core import cambios_documento

    def describir_roto(*args, **kwargs):
        raise RuntimeError("falla simulada al describir los cambios")

    monkeypatch.setattr(cambios_documento, "describir", describir_roto)
    sc = _sc(db, "SC-RAP003", user_admin, estado="ASIGNADA", productos=[LINEA])

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "productos": [LINEA, {"product_name": "Silla", "qty": 2}], "updated_by": "test"},
        headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(sc)
    assert len(sc.productos) == 2
    assert _actividades_sc(db, sc) == []


def test_actividad_de_la_sc_desempata_por_id(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import ActivityLog
    sc = _sc(db, "SC-RAP004", user_admin, estado="ASIGNADA", productos=[LINEA])
    misma_hora = datetime.datetime(2026, 10, 3, 12, 0, 0)
    b = ActivityLog(entity_type="SC", entity_id=sc.id, entity_numero=sc.numero, action="UPDATED",
                    description="B (primero)", created_at=misma_hora)
    a = ActivityLog(entity_type="SC", entity_id=sc.id, entity_numero=sc.numero, action="ESTADO_CHANGED",
                    description="A (despues)", created_at=misma_hora)
    db.add(b); db.flush()
    db.add(a); db.flush()
    # Una fila se reescribe: en Postgres la version nueva queda al final del heap, asi que sin desempate la lectura
    # por orden fisico devolveria [A, B] aunque B se inserto primero.
    b.description = "B (primero, reescrito)"
    db.commit()
    assert b.id < a.id

    actividades = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]["actividades"]
    assert [x["description"] for x in actividades] == ["B (primero, reescrito)", "A (despues)"]
