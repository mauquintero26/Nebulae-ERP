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

    def test_patch_estado_soporte_actualiza_y_se_refleja_en_respuesta(self, app_client, admin_token):
        """update_solicitud debe aceptar estado_soporte en su whitelist de campos
        editables (y no solo `estado`, que es el campo ligado al flujo de Cotizacion)."""
        r = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
            "tipo_solicitud": "Soporte Tecnico",
            "urgencia": "Media",
        }, headers=_headers(admin_token))
        assert r.status_code == 201
        sc_id = r.json()["data"]["id"]
        assert r.json()["data"]["estado_soporte"] == "ABIERTO"

        r2 = app_client.patch(f"/api/v1/ventas/solicitudes/{sc_id}", json={
            "estado_soporte": "EN_PROCESO",
        }, headers=_headers(admin_token))
        assert r2.status_code == 200
        assert r2.json()["data"]["estado_soporte"] == "EN_PROCESO"

        # Confirma que quedo realmente persistido (no solo devuelto en el PATCH)
        r3 = app_client.get(f"/api/v1/ventas/solicitudes/{sc_id}", headers=_headers(admin_token))
        assert r3.json()["data"]["estado_soporte"] == "EN_PROCESO"

    def test_soporte_tecnico_no_crea_lead_de_ventas(self, app_client, admin_token, db):
        """Soporte Tecnico tiene su propio flujo y no siempre termina en una venta:
        una solicitud de este tipo, incluso con un cliente real vinculado, nunca debe
        generar una tarjeta (SalesOrder) en el pipeline de Leads de ventas — ni
        siquiera si algo llega a llamar /crm/leads para ella (el frontend ya evita
        esa llamada, pero esto verifica el cierre real a nivel de API/DB)."""
        from app.models.customers import Customer
        from app.models.sales import SalesOrder

        cust = Customer(
            first_name="Cliente",
            last_name=f"Soporte-{uuid.uuid4().hex[:6]}",
            email=f"soporte_{uuid.uuid4().hex[:6]}@test.com",
        )
        db.add(cust)
        db.commit()

        r = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_id": cust.id,
            "customer_name": f"{cust.first_name} {cust.last_name}",
            "tipo_solicitud": "Soporte Tecnico",
            "urgencia": "Baja",
        }, headers=_headers(admin_token))
        assert r.status_code == 201
        sc_id = r.json()["data"]["id"]

        # Simula exactamente lo que el frontend enviaria a /crm/leads si el guard no existiera
        lead_resp = app_client.post("/api/v1/crm/leads", json={
            "customer_id": cust.id,
            "sc_id": sc_id,
            "solicitud_tipo": "Soporte Tecnico",
        }, headers=_headers(admin_token))
        assert lead_resp.status_code == 200

        leads = db.query(SalesOrder).filter(SalesOrder.canonical_customer_request_id == sc_id).all()
        assert len(leads) == 0, "Soporte Tecnico jamas debe generar un Lead de ventas"

        # Control: el mismo endpoint SI debe seguir creando el Lead para una
        # Cotizacion de Producto normal (el guard no debe romper el caso general)
        r2 = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_id": cust.id,
            "customer_name": f"{cust.first_name} {cust.last_name}",
            "tipo_solicitud": "Cotizacion de Producto",
        }, headers=_headers(admin_token))
        sc_id2 = r2.json()["data"]["id"]
        lead_resp2 = app_client.post("/api/v1/crm/leads", json={
            "customer_id": cust.id,
            "sc_id": sc_id2,
            "solicitud_tipo": "Cotizacion de Producto",
        }, headers=_headers(admin_token))
        assert lead_resp2.status_code == 200
        leads2 = db.query(SalesOrder).filter(SalesOrder.canonical_customer_request_id == sc_id2).all()
        assert len(leads2) == 1, "Una Cotizacion de Producto normal si debe generar su Lead"
