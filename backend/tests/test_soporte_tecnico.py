import uuid
from sqlalchemy import text


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


class TestSoporteTecnico:

    def test_crear_soporte_tecnico_guarda_sus_campos_propios(self, app_client, admin_token):
        r = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
            "tipo_solicitud": "Soporte Tecnico",
            "tipo_problema": "Falla del producto",
            "descripcion_problema": "El producto llego danado",
            "urgencia": "Alta",
        }, headers=_headers(admin_token))
        assert r.status_code == 201
        data = r.json()["data"]
        assert data["tipo_problema"] == "Falla del producto"
        assert data["estado_soporte"] == "ABIERTO"

    def test_soporte_tecnico_no_crea_estado_de_cotizacion(self, app_client, admin_token):
        r = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
            "tipo_solicitud": "Soporte Tecnico",
            "urgencia": "Baja",
        }, headers=_headers(admin_token))
        data = r.json()["data"]
        assert data["estado"] == "N/A_SOPORTE"

    def test_soporte_urgencia_alta_aparece_en_alertas_antes_que_baja(self, app_client, admin_token, db):
        import datetime
        r = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
            "tipo_solicitud": "Soporte Tecnico",
            "urgencia": "Alta",
        }, headers=_headers(admin_token))
        sc_id = r.json()["data"]["id"]
        # Simula que ya pasaron 5 horas desde la ultima actualizacion (umbral Alta = 4h)
        db.execute(text("UPDATE customer_requests SET updated_at = :hace WHERE id = :id"),
                   {"hace": datetime.datetime.utcnow() - datetime.timedelta(hours=5), "id": sc_id})
        db.commit()
        r2 = app_client.get("/api/v1/ventas/alertas", headers=_headers(admin_token))
        ids_en_alerta = [s["id"] for s in r2.json()["data"]["soporte_sin_atender"]]
        assert sc_id in ids_en_alerta
