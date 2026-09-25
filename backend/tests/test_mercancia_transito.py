import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _pec_payload(supplier, tipo_envio=None, precio=100000):
    body = {
        "supplier_id": supplier.id, "supplier_name": supplier.name,
        "productos": [{"producto_nombre": "Producto Test", "nombre": "Producto Test",
                       "qty": 2, "unit_price_cop": precio}],
    }
    if tipo_envio:
        body["tipo_envio"] = tipo_envio
    return body


class TestCreatePecStagesDinamico:
    """Bug raiz reportado: 'Mercancia en Transito' no marcaba las etapas como
    en proceso/completadas porque el frontend (pedidos/page.tsx) esperaba
    nombres de etapa distintos a los que create_pec realmente guardaba.
    Se resuelve generando tracking_stages desde una config unica (dinamica,
    editable via /compras/tracking-config) que backend Y frontend comparten."""

    def test_pec_via_casillero_incluye_las_4_etapas_del_nuevo_flujo(self, app_client, admin_token, db, supplier):
        r = app_client.post("/api/v1/compras/pedidos", json=_pec_payload(supplier, "casillero"),
                             headers=_headers(admin_token))
        assert r.status_code == 201, r.text
        data = r.json()["data"]
        assert data["tipo_envio"] == "casillero"
        keys = [s["stage"] for s in data["tracking_stages"]]
        assert keys == ["PENDIENTE_DESPACHO", "PROVEEDOR_CASILLERO", "CASILLERO_BODEGA", "RECIBIDO"], keys
        assert all(s["status"] == "PENDIENTE" for s in data["tracking_stages"])

    def test_pec_directo_incluye_solo_3_etapas(self, app_client, admin_token, db, supplier):
        r = app_client.post("/api/v1/compras/pedidos", json=_pec_payload(supplier, "directo"),
                             headers=_headers(admin_token))
        assert r.status_code == 201, r.text
        keys = [s["stage"] for s in r.json()["data"]["tracking_stages"]]
        assert keys == ["PENDIENTE_DESPACHO", "PROVEEDOR_BODEGA", "RECIBIDO"], keys

    def test_default_tipo_envio_es_casillero(self, app_client, admin_token, db, supplier):
        r = app_client.post("/api/v1/compras/pedidos", json=_pec_payload(supplier),
                             headers=_headers(admin_token))
        assert r.status_code == 201, r.text
        assert r.json()["data"]["tipo_envio"] == "casillero"


class TestCreatePecValidaPrecio:
    """Bug reportado: se podia crear (y por tanto 'comprar') un producto sin
    precio -- el Subtotal/Total quedaban en '-' silenciosamente."""

    def test_rechaza_producto_sin_precio(self, app_client, admin_token, db, supplier):
        body = _pec_payload(supplier, precio=0)
        r = app_client.post("/api/v1/compras/pedidos", json=body, headers=_headers(admin_token))
        assert r.status_code == 422, r.text
        assert "precio" in r.json()["detail"].lower()

    def test_acepta_cuando_hay_precio(self, app_client, admin_token, db, supplier):
        r = app_client.post("/api/v1/compras/pedidos", json=_pec_payload(supplier, precio=50000),
                             headers=_headers(admin_token))
        assert r.status_code == 201, r.text


class TestUpdateTrackingEtapaInvalida:
    """Antes de este fix, un PATCH con un nombre de etapa que no existe en el
    PEC devolvia 200 OK sin cambiar nada (no-op silencioso) -- exactamente el
    bug de 'no se estan marcando las etapas'."""

    def test_etapa_inexistente_devuelve_422_no_200_silencioso(self, app_client, admin_token, db, supplier):
        pec = app_client.post("/api/v1/compras/pedidos", json=_pec_payload(supplier, "directo"),
                               headers=_headers(admin_token)).json()["data"]
        r = app_client.patch(
            f"/api/v1/compras/pedidos/{pec['id']}/tracking",
            json={"stage": "CASILLERO_BODEGA", "status": "COMPLETADO", "user_name": "tester"},
            headers=_headers(admin_token),
        )
        assert r.status_code == 422, r.text

    def test_etapa_valida_se_marca_en_proceso_y_completada_en_orden(self, app_client, admin_token, db, supplier):
        pec = app_client.post("/api/v1/compras/pedidos", json=_pec_payload(supplier, "directo"),
                               headers=_headers(admin_token)).json()["data"]
        pid = pec["id"]
        r1 = app_client.patch(f"/api/v1/compras/pedidos/{pid}/tracking",
                               json={"stage": "PENDIENTE_DESPACHO", "status": "EN_PROCESO", "user_name": "tester"},
                               headers=_headers(admin_token))
        assert r1.status_code == 200, r1.text
        assert r1.json()["data"]["tracking_stages"][0]["status"] == "EN_PROCESO"

        r2 = app_client.patch(f"/api/v1/compras/pedidos/{pid}/tracking",
                               json={"stage": "PENDIENTE_DESPACHO", "status": "COMPLETADO", "user_name": "tester"},
                               headers=_headers(admin_token))
        assert r2.status_code == 200, r2.text
        assert r2.json()["data"]["tracking_stages"][0]["status"] == "COMPLETADO"
        assert r2.json()["data"]["tracking_stages"][1]["status"] == "PENDIENTE"

    def test_completar_ultima_etapa_marca_pec_recibido(self, app_client, admin_token, db, supplier):
        pec = app_client.post("/api/v1/compras/pedidos", json=_pec_payload(supplier, "directo"),
                               headers=_headers(admin_token)).json()["data"]
        pid = pec["id"]
        for stage in ("PENDIENTE_DESPACHO", "PROVEEDOR_BODEGA", "RECIBIDO"):
            r = app_client.patch(f"/api/v1/compras/pedidos/{pid}/tracking",
                                  json={"stage": stage, "status": "COMPLETADO", "user_name": "tester"},
                                  headers=_headers(admin_token))
            assert r.status_code == 200, r.text
        assert r.json()["data"]["estado"] == "RECIBIDO"


class TestUpdateTrackingCamposExtra:
    """Requisito: cada etapa debe poder registrar ETA, carrier y casillero."""

    def test_guarda_eta_carrier_y_casillero_por_etapa(self, app_client, admin_token, db, supplier):
        cas = app_client.post("/api/v1/compras/casilleros", json={"name": f"Casillero-{uuid.uuid4().hex[:6]}", "city": "Miami"},
                               headers=_headers(admin_token))
        assert cas.status_code == 201, cas.text
        cas_id = cas.json()["data"]["id"]
        try:
            pec = app_client.post("/api/v1/compras/pedidos", json=_pec_payload(supplier, "casillero"),
                                   headers=_headers(admin_token)).json()["data"]
            r = app_client.patch(
                f"/api/v1/compras/pedidos/{pec['id']}/tracking",
                json={"stage": "PROVEEDOR_CASILLERO", "status": "EN_PROCESO",
                      "eta": "2026-10-15T00:00:00", "carrier": "DHL", "casillero_id": cas_id,
                      "tracking_number": "1Z999", "user_name": "tester"},
                headers=_headers(admin_token),
            )
            assert r.status_code == 200, r.text
            stage = r.json()["data"]["tracking_stages"][1]
            assert stage["eta"] == "2026-10-15T00:00:00"
            assert stage["carrier"] == "DHL"
            assert stage["casillero_id"] == cas_id
            assert stage["casillero_nombre"] == cas.json()["data"]["name"]
        finally:
            app_client.delete(f"/api/v1/compras/casilleros/{cas_id}", headers=_headers(admin_token))

    def test_etapa_sin_eta_ni_status_completado_expone_alerta_de_confirmacion_atrasada(self, app_client, admin_token, db, supplier):
        pec = app_client.post("/api/v1/compras/pedidos", json=_pec_payload(supplier, "directo"),
                               headers=_headers(admin_token)).json()["data"]
        # fecha_compra por defecto es "ahora" -> alert_confirm_days=2 para PENDIENTE_DESPACHO
        # todavia no deberia estar atrasado.
        assert pec["tracking_stages"][0]["alert"] is None
        # Forzamos fecha_compra al pasado directamente en BD para simular "ya pasaron los 2 dias".
        import datetime
        from app.models.erp_documents import PurchaseOrderFull
        row = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec["id"]).first()
        row.fecha_compra = datetime.datetime.utcnow() - datetime.timedelta(days=5)
        db.commit()
        r = app_client.get(f"/api/v1/compras/pedidos/{pec['id']}", headers=_headers(admin_token))
        stage0 = r.json()["data"]["tracking_stages"][0]
        assert stage0["alert"] is not None
        assert stage0["alert"]["nivel"] == "atrasado"


class TestCasillerosCrud:
    def test_crear_buscar_y_eliminar_casillero(self, app_client, admin_token):
        nombre = f"Casillero-{uuid.uuid4().hex[:6]}"
        r = app_client.post("/api/v1/compras/casilleros", json={"name": nombre, "city": "Miami", "address": "123 NW 1st Ave"},
                             headers=_headers(admin_token))
        assert r.status_code == 201, r.text
        cid = r.json()["data"]["id"]
        try:
            found = app_client.get(f"/api/v1/compras/casilleros/search?q={nombre[:10]}", headers=_headers(admin_token))
            assert any(c["id"] == cid for c in found.json()["data"])
        finally:
            d = app_client.delete(f"/api/v1/compras/casilleros/{cid}", headers=_headers(admin_token))
            assert d.status_code == 200, d.text


class TestTrackingConfigDinamico:
    """El icono de configuracion debe poder agregar/modificar/eliminar etapas
    (motor dinamico, no solo 4 fijas), y los PEC creados DESPUES del cambio
    deben reflejar la nueva plantilla."""

    def test_put_agrega_etapa_y_afecta_nuevos_pec(self, app_client, admin_token, db, supplier):
        original = app_client.get("/api/v1/compras/tracking-config", headers=_headers(admin_token)).json()["data"]
        try:
            nuevas_etapas = original["directo"] + [
                {"key": "ADUANA_EXTRA", "label": "Revision Aduana Extra", "alert_confirm_days": 3, "alert_overdue_days": 1, "active": True}
            ]
            put_r = app_client.put("/api/v1/compras/tracking-config/directo",
                                    json={"stages": nuevas_etapas}, headers=_headers(admin_token))
            assert put_r.status_code == 200, put_r.text
            keys = [s["key"] for s in put_r.json()["data"]]
            assert "ADUANA_EXTRA" in keys

            pec = app_client.post("/api/v1/compras/pedidos", json=_pec_payload(supplier, "directo"),
                                   headers=_headers(admin_token)).json()["data"]
            assert "ADUANA_EXTRA" in [s["stage"] for s in pec["tracking_stages"]]
        finally:
            app_client.put("/api/v1/compras/tracking-config/directo",
                            json={"stages": original["directo"]}, headers=_headers(admin_token))

    def test_put_rechaza_keys_duplicadas(self, app_client, admin_token):
        original = app_client.get("/api/v1/compras/tracking-config", headers=_headers(admin_token)).json()["data"]
        dup = [original["casillero"][0], original["casillero"][0]]
        r = app_client.put("/api/v1/compras/tracking-config/casillero",
                            json={"stages": dup}, headers=_headers(admin_token))
        assert r.status_code == 422
