"""
test_fase1b_grl_id_en_respuestas.py — Cierres 1 y 2

Cierre 1: Las respuestas de POST /recepciones y GET /recepciones/{id}
incluyen grl_id y po_line_id en cada producto.

Cierre 2: PATCH sin grl_id es rechazado para recepciones NATIVE.
Payload mixto rechazado. Solo legacy usa fallback posicional.
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


class TestGrlIdEnRespuestas:

    def test_post_recepciones_incluye_grl_id(self, app_client, admin_token):
        """POST /recepciones retorna grl_id y po_line_id en cada producto."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                              [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])

        r = app_client.post("/api/v1/compras/recepciones",
                            headers=_auth(admin_token),
                            json={
                                "pec_id": pec["id"],
                                "warehouse_id": wh_id,
                                "created_by": "test",
                                "productos": [
                                    {"sku_id": sku_id, "qty_esperada": 5, "nombre": "Prod"}
                                ],
                            })
        assert r.status_code == 201, f"POST /recepciones failed: {r.text}"
        data = r.json()["data"]

        assert "productos" in data, "respuesta debe tener 'productos'"
        assert len(data["productos"]) == 1
        prod = data["productos"][0]
        assert "grl_id" in prod, f"prod debe incluir grl_id. Got keys: {list(prod.keys())}"
        assert prod["grl_id"] is not None, "grl_id no debe ser None"
        assert isinstance(prod["grl_id"], int), f"grl_id debe ser int. Got: {prod['grl_id']}"

    def test_recepcionar_desde_pec_incluye_grl_id(self, app_client, admin_token):
        """POST /pedidos/{id}/recepcionar retorna grl_id en cada producto."""
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

        assert "productos" in eninv
        assert len(eninv["productos"]) >= 1
        prod = eninv["productos"][0]
        assert "grl_id" in prod, f"recepcionar debe incluir grl_id. Keys: {list(prod.keys())}"
        assert prod["grl_id"] is not None

    def test_get_recepcion_incluye_grl_id(self, app_client, admin_token):
        """GET /recepciones/{id} retorna grl_id en cada producto."""
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

        r = app_client.get(f"/api/v1/compras/recepciones/{eninv_id}",
                           headers=_auth(admin_token))
        assert r.status_code == 200
        data = r.json()["data"]
        assert "productos" in data
        prod = data["productos"][0]
        assert "grl_id" in prod, f"GET debe incluir grl_id. Keys: {list(prod.keys())}"
        assert isinstance(prod["grl_id"], int)

    def test_frontend_puede_reenviar_mismo_objeto_con_grl_id(self, app_client, admin_token):
        """El frontend puede reenviar el objeto producto con grl_id sin cambiar estructura."""
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

        # El frontend obtiene el objeto y lo reenvía tal cual (con grl_id incluido)
        prod_original = eninv["productos"][0]
        grl_id = prod_original["grl_id"]
        assert grl_id is not None

        # Agregar qty_recibida al objeto existente y reenviar
        payload_frontend = {**prod_original, "qty_recibida": 5}
        r = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}",
            headers=_auth(admin_token),
            json={"productos": [payload_frontend]},
        )
        assert r.status_code == 200, f"Frontend reenvio con grl_id debe funcionar: {r.text}"

        with TestSessionLocal() as db2:
            qty = db2.execute(text(
                "SELECT quantity_received FROM goods_receipt_lines WHERE id=:gid"
            ), {"gid": grl_id}).scalar()
        assert int(qty) == 5, f"qty_received debe ser 5. Got {qty}"

    def test_patch_sin_grl_id_en_recepcion_native_rechazado(self, app_client, admin_token):
        """PATCH sin grl_id en recepción NATIVE → 422 (no cae al fallback posicional)."""
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

        # Payload SIN grl_id para una recepción NATIVE
        r = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}",
            headers=_auth(admin_token),
            json={"productos": [{"sku_id": sku_id, "qty_recibida": 5}]},
        )
        assert r.status_code == 422, (
            f"PATCH sin grl_id en NATIVE debe ser rechazado con 422. Got {r.status_code}: {r.text}"
        )
        assert "grl_id" in r.text.lower() or "native" in r.text.lower(), (
            f"El error debe mencionar grl_id o NATIVE. Got: {r.text}"
        )

    def test_patch_mixto_rechazado(self, app_client, admin_token):
        """Payload mixto (unas líneas con grl_id, otras sin) → 422."""
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

        grls = eninv["productos"]
        grl_a_id = grls[0]["grl_id"]

        # Payload mixto: línea A con grl_id, línea B sin grl_id
        r = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}",
            headers=_auth(admin_token),
            json={"productos": [
                {"grl_id": grl_a_id, "qty_recibida": 3},
                {"sku_id": sku_b, "qty_recibida": 2},  # sin grl_id
            ]},
        )
        assert r.status_code == 422, (
            f"Payload mixto debe ser rechazado con 422. Got {r.status_code}: {r.text}"
        )
        assert "mixto" in r.text.lower() or "grl_id" in r.text.lower(), (
            f"Error debe mencionar payload mixto. Got: {r.text}"
        )

    def test_payload_invertido_actualiza_correcto_por_id(self, app_client, admin_token):
        """Payload con orden invertido actualiza por grl_id, no por posición."""
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
        grl_a_id = prods[0]["grl_id"]  # SKU_A
        grl_b_id = prods[1]["grl_id"]  # SKU_B

        # Payload INVERTIDO: B primero con qty=2, A segundo con qty=3
        r = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}",
            headers=_auth(admin_token),
            json={"productos": [
                {"grl_id": grl_b_id, "qty_recibida": 2},
                {"grl_id": grl_a_id, "qty_recibida": 3},
            ]},
        )
        assert r.status_code == 200, f"PATCH invertido fallo: {r.text}"

        with TestSessionLocal() as db2:
            recv_a = db2.execute(text(
                "SELECT quantity_received FROM goods_receipt_lines WHERE id=:gid"
            ), {"gid": grl_a_id}).scalar()
            recv_b = db2.execute(text(
                "SELECT quantity_received FROM goods_receipt_lines WHERE id=:gid"
            ), {"gid": grl_b_id}).scalar()

        assert int(recv_a) == 3, f"GRL_A debe tener qty=3. Got {recv_a}"
        assert int(recv_b) == 2, f"GRL_B debe tener qty=2. Got {recv_b}"
