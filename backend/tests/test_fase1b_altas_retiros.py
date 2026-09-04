"""
test_fase1b_altas_retiros.py — Cierre 3: Altas y retiros de líneas.

POST /recepciones/{id}/lineas → agregar línea
DELETE /recepciones/{id}/lineas/{grl_id} → retirar línea
"""
import uuid
import pytest
from sqlalchemy import text

from tests.conftest import TestSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_supplier_db(db):
    from app.models.erp_documents import Supplier
    s = Supplier(name=f"Sup-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(s); db.commit(); db.refresh(s)
    return s.id


def _create_warehouse_db(db):
    from app.models.inventory import Warehouse
    w = Warehouse(name=f"Wh-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(w); db.commit(); db.refresh(w)
    return w.id


def _create_sku_db(db):
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
    sk = ProductSKU(
        product_id=pr.id, sku=f"TST-{uuid.uuid4().hex[:8]}",
        cost_price=10.0, sale_price=20.0,
    )
    db.add(sk); db.commit(); db.refresh(sk)
    return sk.id


def _create_pec_api(client, token, sup_id, wh_id, productos):
    r = client.post("/api/v1/compras/pedidos", headers=_auth(token),
                    json={"supplier_id": sup_id, "supplier_name": "TestSup",
                          "warehouse_id": wh_id, "productos": productos})
    assert r.status_code == 201, f"create_pec failed: {r.text}"
    return r.json()["data"]


def _create_eninv_api(client, token, pec_id, wh_id):
    r = client.post(f"/api/v1/compras/pedidos/{pec_id}/recepcionar",
                    headers=_auth(token),
                    json={"warehouse_id": wh_id, "created_by": "test"})
    assert r.status_code in (200, 201), f"create_eninv failed: {r.text}"
    return r.json()["data"]


class TestAltasRetiros:

    def test_agregar_linea_en_borrador(self, app_client, admin_token):
        """POST /recepciones/{id}/lineas agrega línea y regenera snapshot."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_a  = _create_sku_db(db)
            sku_b  = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_a, "qty": 3, "nombre": "A"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        # Agregar línea nueva
        r = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_id}/lineas",
            headers=_auth(admin_token),
            json={"sku_id": sku_b, "qty_esperada": 5, "nombre": "B"},
        )
        assert r.status_code in (200, 201), f"POST /lineas fallo: {r.text}"
        data = r.json()["data"]
        assert "grl_id" in data, "respuesta debe incluir grl_id"
        new_grl_id = data["grl_id"]
        assert isinstance(new_grl_id, int)

        # Verificar que hay 2 GRL ahora
        with TestSessionLocal() as db2:
            n = db2.execute(text(
                "SELECT COUNT(*) FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).scalar()
        assert int(n) == 2, f"Debe haber 2 GRL. Got {n}"

        # Verificar snapshot tiene grl_id para ambas
        prods_actualizados = data.get("productos_actualizados", [])
        assert len(prods_actualizados) == 2
        grl_ids_snap = [p["grl_id"] for p in prods_actualizados]
        assert new_grl_id in grl_ids_snap

    def test_retirar_linea_pendiente(self, app_client, admin_token):
        """DELETE /recepciones/{id}/lineas/{grl_id} retira línea no procesada."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_a  = _create_sku_db(db)
            sku_b  = _create_sku_db(db)
        finally:
            db.close()

        pec = _create_pec_api(app_client, admin_token, sup_id, wh_id, [
            {"sku_id": sku_a, "qty": 3, "nombre": "A"},
            {"sku_id": sku_b, "qty": 2, "nombre": "B"},
        ])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        prods = eninv["productos"]
        grl_b_id = prods[1]["grl_id"]  # retirar B

        r = app_client.delete(
            f"/api/v1/compras/recepciones/{eninv_id}/lineas/{grl_b_id}",
            headers=_auth(admin_token),
        )
        assert r.status_code == 200, f"DELETE /lineas fallo: {r.text}"
        data = r.json()["data"]
        assert data["grl_id_removed"] == grl_b_id
        assert data["lineas_restantes"] == 1

        with TestSessionLocal() as db2:
            n = db2.execute(text(
                "SELECT COUNT(*) FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).scalar()
        assert int(n) == 1, f"Debe quedar 1 GRL. Got {n}"

    def test_retirar_linea_con_cantidad_registrada_rechazado(self, app_client, admin_token):
        """No se puede retirar una línea con quantity_received registrado."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]
        grl_id = eninv["productos"][0]["grl_id"]

        # Registrar cantidad
        r_patch = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}/lineas/{grl_id}",
            headers=_auth(admin_token),
            json={"quantity_received": 3},
        )
        assert r_patch.status_code == 200

        # Intentar retirar → debe fallar
        r = app_client.delete(
            f"/api/v1/compras/recepciones/{eninv_id}/lineas/{grl_id}",
            headers=_auth(admin_token),
        )
        assert r.status_code == 422, (
            f"Retirar línea con qty registrada debe fallar. Got {r.status_code}: {r.text}"
        )

    def test_retirar_linea_en_no_borrador_rechazado(self, app_client, admin_token):
        """No se puede retirar líneas de recepciones no-BORRADOR."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]
        grl_id = eninv["productos"][0]["grl_id"]

        # Confirmar
        app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}/lineas/{grl_id}",
            headers=_auth(admin_token), json={"quantity_received": 5})
        app_client.post(
            f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
            headers=_auth(admin_token),
            json={"idempotency_key": str(uuid.uuid4()), "receipt_type": "FISICA",
                  "allow_excess": False, "user_name": "test"})

        # Intentar retirar línea después de confirmar
        r = app_client.delete(
            f"/api/v1/compras/recepciones/{eninv_id}/lineas/{grl_id}",
            headers=_auth(admin_token),
        )
        assert r.status_code == 422, (
            f"Retirar línea en no-BORRADOR debe fallar. Got {r.status_code}: {r.text}"
        )

    def test_agregar_linea_audit_log(self, app_client, admin_token):
        """Agregar línea genera activity_log LINE_ADDED."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 3, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        db2 = TestSessionLocal()
        sku_nuevo = _create_sku_db(db2)
        db2.close()

        app_client.post(
            f"/api/v1/compras/recepciones/{eninv_id}/lineas",
            headers=_auth(admin_token),
            json={"sku_id": sku_nuevo, "qty_esperada": 2, "nombre": "Nuevo"},
        )

        with TestSessionLocal() as db3:
            log = db3.execute(text(
                "SELECT action FROM activity_logs WHERE entity_id=:gid AND action='LINE_ADDED'"
            ), {"gid": eninv_id}).fetchone()
        assert log is not None, "Debe existir activity_log con action=LINE_ADDED"
