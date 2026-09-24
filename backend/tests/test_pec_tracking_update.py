import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


_STAGES = [
    {"label": "Proveedor -> Casillero", "stage": "PROVEEDOR_CASILLERO", "status": "PENDIENTE", "timestamp": None},
    {"label": "Casillero -> Aduana", "stage": "CASILLERO_ADUANA", "status": "PENDIENTE", "timestamp": None},
    {"label": "Aduana -> Bodega", "stage": "ADUANA_BODEGA", "status": "PENDIENTE", "timestamp": None},
    {"label": "Entregado en Bodega", "stage": "ENTREGADO", "status": "PENDIENTE", "timestamp": None},
]


def _make_pec(db, supplier):
    from app.models.erp_documents import PurchaseOrderFull
    p = PurchaseOrderFull(
        numero=f"PEC-TEST-{uuid.uuid4().hex[:8].upper()}",
        supplier_id=supplier.id, supplier_name=supplier.name,
        estado="EMITIDO",
        tracking_stages=[dict(s) for s in _STAGES],
    )
    db.add(p); db.commit(); db.refresh(p)
    return p


class TestPecTrackingUpdate:
    """Reproduce el bug reportado: al presionar 'Iniciar' en Mercancia en
    Transito, el PATCH devolvia 200 OK pero la etapa se quedaba en
    PENDIENTE — ni siquiera dentro de la MISMA respuesta HTTP quedaba
    reflejado el cambio."""

    def test_actualizar_etapa_persiste_el_nuevo_estado(self, app_client, admin_token, db, supplier):
        pec = _make_pec(db, supplier)

        r = app_client.patch(
            f"/api/v1/compras/pedidos/{pec.id}/tracking",
            json={"stage": "PROVEEDOR_CASILLERO", "status": "EN_PROCESO", "user_name": "tester"},
            headers=_headers(admin_token),
        )
        assert r.status_code == 200, r.text
        stages = r.json()["data"]["tracking_stages"]
        assert stages[0]["status"] == "EN_PROCESO", (
            "La etapa deberia quedar EN_PROCESO en la MISMA respuesta del PATCH"
        )
        assert stages[1]["status"] == "PENDIENTE"

        # Releer desde una sesion nueva para descartar cache del ORM en memoria
        from app.db.database import SessionLocal
        from app.models.erp_documents import PurchaseOrderFull
        fresh_db = SessionLocal()
        try:
            fresh = fresh_db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec.id).first()
            assert fresh.tracking_stages[0]["status"] == "EN_PROCESO", (
                "El cambio debe persistir realmente en la base de datos, no solo en memoria"
            )
        finally:
            fresh_db.close()

    def test_completar_ultima_etapa_marca_pec_como_recibido(self, app_client, admin_token, db, supplier):
        pec = _make_pec(db, supplier)
        for stage in ("PROVEEDOR_CASILLERO", "CASILLERO_ADUANA", "ADUANA_BODEGA"):
            r = app_client.patch(
                f"/api/v1/compras/pedidos/{pec.id}/tracking",
                json={"stage": stage, "status": "COMPLETADO", "user_name": "tester"},
                headers=_headers(admin_token),
            )
            assert r.status_code == 200, r.text

        r = app_client.patch(
            f"/api/v1/compras/pedidos/{pec.id}/tracking",
            json={"stage": "ENTREGADO", "status": "COMPLETADO", "user_name": "tester"},
            headers=_headers(admin_token),
        )
        assert r.status_code == 200, r.text
        assert r.json()["data"]["estado"] == "RECIBIDO"
