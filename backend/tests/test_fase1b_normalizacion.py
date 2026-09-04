"""
test_fase1b_normalizacion.py — Tests de Bloqueo 2: normalizar caminos de creacion y edicion

Escenarios:
 1. POST /recepciones con productos crea GoodsReceiptLine
 2. PATCH /recepciones/{id} en BORRADOR actualiza GRL y regenera JSON
 3. PATCH /recepciones/{id} despues de confirmar rechaza productos con 422
 4. PATCH /pedidos/{id} sin recepciones sincroniza PurchaseOrderLine
 5. PATCH /pedidos/{id} con recepciones activas devuelve 409
"""
import uuid
import pytest
from sqlalchemy import text

from tests.conftest import TestSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_supplier_db(db) -> int:
    from app.models.erp_documents import Supplier
    s = Supplier(name=f"Sup-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(s); db.commit(); db.refresh(s)
    return s.id


def _create_warehouse_db(db) -> int:
    from app.models.inventory import Warehouse
    w = Warehouse(name=f"Wh-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(w); db.commit(); db.refresh(w)
    return w.id


def _create_sku_db(db) -> int:
    from app.models.catalog import ProductSKU, Product, Brand, Category
    br = Brand(name=f"Br-{uuid.uuid4().hex[:4]}")
    db.add(br); db.flush()
    ca = Category(name=f"Ca-{uuid.uuid4().hex[:4]}")
    db.add(ca); db.flush()
    pr = Product(
        name=f"Pr-{uuid.uuid4().hex[:4]}", brand_id=br.id,
        category_id=ca.id, type="Fisico", base_currency="USD",
        uom="Ud", is_active=True,
    )
    db.add(pr); db.flush()
    from app.models.catalog import ProductSKU
    sk = ProductSKU(
        product_id=pr.id, sku=f"TST-{uuid.uuid4().hex[:8]}",
        cost_price=10.0, sale_price=20.0,
    )
    db.add(sk); db.commit(); db.refresh(sk)
    return sk.id


class TestNormalizacionCaminos:

    def test_post_recepciones_con_productos_crea_grl(
            self, app_client, admin_token):
        """POST /recepciones con productos[] -> GoodsReceiptLine creadas en misma TX."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        r = app_client.post(
            "/api/v1/compras/recepciones",
            headers=_auth(admin_token),
            json={
                "supplier_id": sup_id,
                "warehouse_id": wh_id,
                "productos": [
                    {"sku_id": sku_id, "qty_esperada": 3, "nombre": "Prod A"},
                ],
                "created_by": "test",
            },
        )
        assert r.status_code == 201, f"POST /recepciones failed: {r.text}"
        eninv_id = r.json()["data"]["id"]

        with TestSessionLocal() as db2:
            count = db2.execute(text(
                "SELECT COUNT(*) FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).scalar()

        assert int(count) == 1, f"Debe existir 1 GRL creada en la misma TX. Got {count}"

    def test_patch_eninv_borrador_actualiza_grl_y_regenera_json(
            self, app_client, admin_token):
        """PATCH en BORRADOR actualiza GRL y regenera g.productos desde GRL."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        # Crear ENINV via POST /recepciones con 1 producto
        r = app_client.post(
            "/api/v1/compras/recepciones",
            headers=_auth(admin_token),
            json={
                "supplier_id": sup_id,
                "warehouse_id": wh_id,
                "productos": [{"sku_id": sku_id, "qty_esperada": 5, "nombre": "Prod"}],
                "created_by": "test",
            },
        )
        assert r.status_code == 201
        eninv_id = r.json()["data"]["id"]

        # PATCH con nuevas cantidades en BORRADOR
        r2 = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}",
            headers=_auth(admin_token),
            json={"productos": [
                {"sku_id": sku_id, "qty_esperada": 5, "qty_recibida": 3,
                 "qty_rechazada": 2, "nombre": "Prod"},
            ]},
        )
        assert r2.status_code == 200, f"PATCH BORRADOR failed: {r2.text}"

        with TestSessionLocal() as db2:
            grl = db2.execute(text(
                "SELECT quantity_received, quantity_rejected FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).fetchone()

        assert int(grl[0]) == 3, f"GRL.quantity_received debe ser 3. Got {grl[0]}"
        assert int(grl[1]) == 2, f"GRL.quantity_rejected debe ser 2. Got {grl[1]}"

    def test_patch_eninv_confirmada_rechaza_productos(
            self, app_client, admin_token):
        """PATCH con productos despues de confirmar -> 422."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        # Crear PEC + ENINV via endpoints
        r_pec = app_client.post(
            "/api/v1/compras/pedidos",
            headers=_auth(admin_token),
            json={"supplier_id": sup_id, "supplier_name": "Sup",
                  "warehouse_id": wh_id,
                  "productos": [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}]},
        )
        assert r_pec.status_code == 201
        pec_id = r_pec.json()["data"]["id"]

        r_eninv = app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/recepcionar",
            headers=_auth(admin_token),
            json={"warehouse_id": wh_id, "created_by": "test"},
        )
        assert r_eninv.status_code in (200, 201)
        eninv_id = r_eninv.json()["data"]["id"]

        # Registrar cantidad via endpoint de linea
        with TestSessionLocal() as db2:
            grl_id = db2.execute(text(
                "SELECT id FROM goods_receipt_lines WHERE gr_id=:gid LIMIT 1"
            ), {"gid": eninv_id}).scalar()

        app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}/lineas/{grl_id}",
            headers=_auth(admin_token),
            json={"quantity_received": 5},
        )

        # Confirmar
        app_client.post(
            f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
            headers=_auth(admin_token),
            json={"idempotency_key": str(uuid.uuid4()), "receipt_type": "FISICA",
                  "allow_excess": False, "user_name": "test"},
        )

        # PATCH con productos post-confirmacion -> 422
        r3 = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}",
            headers=_auth(admin_token),
            json={"productos": [{"sku_id": sku_id, "qty_recibida": 10}]},
        )
        assert r3.status_code == 422, (
            f"PATCH productos post-confirmacion debe ser 422. Got {r3.status_code}: {r3.text}"
        )

    def test_patch_pec_sin_recepciones_sync_pol(
            self, app_client, admin_token):
        """PATCH /pedidos/{id} sin recepciones activas sincroniza PurchaseOrderLine."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
            sku_id2 = _create_sku_db(db)
        finally:
            db.close()

        r_pec = app_client.post(
            "/api/v1/compras/pedidos",
            headers=_auth(admin_token),
            json={"supplier_id": sup_id, "supplier_name": "Sup",
                  "warehouse_id": wh_id,
                  "productos": [{"sku_id": sku_id, "qty": 5, "nombre": "Prod A"}]},
        )
        assert r_pec.status_code == 201
        pec_id = r_pec.json()["data"]["id"]

        # PATCH productos (sin recepciones -> debe sincronizar)
        r2 = app_client.patch(
            f"/api/v1/compras/pedidos/{pec_id}",
            headers=_auth(admin_token),
            json={"productos": [
                {"sku_id": sku_id2, "qty": 7, "nombre": "Prod B"},
            ]},
        )
        assert r2.status_code == 200, f"PATCH PEC sin recepciones failed: {r2.text}"

        with TestSessionLocal() as db2:
            pols = db2.execute(text(
                "SELECT sku_id, quantity_ordered FROM purchase_order_lines WHERE pec_id=:pid ORDER BY id"
            ), {"pid": pec_id}).fetchall()

        assert len(pols) == 1, f"Debe existir 1 POL despues del sync. Got {pols}"
        assert int(pols[0][0]) == sku_id2, f"POL debe tener sku_id2={sku_id2}. Got {pols[0][0]}"
        assert int(pols[0][1]) == 7, f"POL.quantity_ordered=7. Got {pols[0][1]}"

    def test_patch_pec_con_recepciones_bloquea(
            self, app_client, admin_token):
        """PATCH /pedidos/{id} con recepciones activas -> 409."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        r_pec = app_client.post(
            "/api/v1/compras/pedidos",
            headers=_auth(admin_token),
            json={"supplier_id": sup_id, "supplier_name": "Sup",
                  "warehouse_id": wh_id,
                  "productos": [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}]},
        )
        assert r_pec.status_code == 201
        pec_id = r_pec.json()["data"]["id"]

        # Crear recepcion
        app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/recepcionar",
            headers=_auth(admin_token),
            json={"warehouse_id": wh_id, "created_by": "test"},
        )

        # PATCH productos con recepcion activa -> 409
        r2 = app_client.patch(
            f"/api/v1/compras/pedidos/{pec_id}",
            headers=_auth(admin_token),
            json={"productos": [{"sku_id": sku_id, "qty": 10}]},
        )
        assert r2.status_code == 409, (
            f"PATCH PEC con recepciones debe ser 409. Got {r2.status_code}: {r2.text}"
        )
