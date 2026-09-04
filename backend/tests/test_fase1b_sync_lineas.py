"""
test_fase1b_sync_lineas.py — Bloqueo 3: Sincronización segura de líneas por ID.

Verifica que PATCH /recepciones/{id} usa grl_id para relacionar líneas,
y que valida pertenencia de IDs a la recepción / PEC correcta.
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


def _get_grls(eninv_id):
    with TestSessionLocal() as db:
        return db.execute(text(
            "SELECT id, sku_id FROM goods_receipt_lines WHERE gr_id=:gid ORDER BY id"
        ), {"gid": eninv_id}).fetchall()


def _confirmar(client, token, eninv_id, key=None):
    if key is None:
        key = str(uuid.uuid4())
    r = client.post(
        f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
        headers=_auth(token),
        json={"idempotency_key": key, "receipt_type": "FISICA",
              "allow_excess": False, "user_name": "test"},
    )
    return r.status_code, r.json()


class TestSyncLineasPorId:

    def test_patch_por_grl_id_orden_invertido(self, app_client, admin_token):
        """Payload con orden invertido aplica a la línea correcta por grl_id."""
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

        grls = _get_grls(eninv_id)
        assert len(grls) == 2
        grl_a_id = grls[0][0]  # primera GRL (sku_a)
        grl_b_id = grls[1][0]  # segunda GRL (sku_b)

        # Payload en orden INVERTIDO — usa grl_id explícito
        r = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}",
            headers=_auth(admin_token),
            json={"productos": [
                {"grl_id": grl_b_id, "qty_recibida": 2},  # B primero
                {"grl_id": grl_a_id, "qty_recibida": 3},  # A segundo
            ]},
        )
        assert r.status_code == 200, f"PATCH con IDs invertidos fallo: {r.text}"

        with TestSessionLocal() as db2:
            rows = db2.execute(text(
                "SELECT id, sku_id, quantity_received FROM goods_receipt_lines "
                "WHERE gr_id=:gid ORDER BY id"
            ), {"gid": eninv_id}).fetchall()

        grl_a_recv = next(r[2] for r in rows if r[0] == grl_a_id)
        grl_b_recv = next(r[2] for r in rows if r[0] == grl_b_id)
        assert int(grl_a_recv) == 3, f"GRL A debe tener qty=3. Got {grl_a_recv}"
        assert int(grl_b_recv) == 2, f"GRL B debe tener qty=2. Got {grl_b_recv}"

    def test_grl_id_de_otra_recepcion_rechazado(self, app_client, admin_token):
        """grl_id que pertenece a otra recepción → 422."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        # Crear dos PECs y dos ENINVs
        pec1 = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                               [{"sku_id": sku_id, "qty": 3, "nombre": "Prod"}])
        eninv1 = _create_eninv_api(app_client, admin_token, pec1["id"], wh_id)

        pec2 = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                               [{"sku_id": sku_id, "qty": 2, "nombre": "Prod"}])
        eninv2 = _create_eninv_api(app_client, admin_token, pec2["id"], wh_id)

        grls1 = _get_grls(eninv1["id"])
        grl_id_de_eninv1 = grls1[0][0]

        # Intentar usar el grl_id de ENINV-1 en el PATCH de ENINV-2
        r = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv2['id']}",
            headers=_auth(admin_token),
            json={"productos": [
                {"grl_id": grl_id_de_eninv1, "qty_recibida": 2}
            ]},
        )
        assert r.status_code == 422, (
            f"grl_id de otra recepcion debe rechazarse con 422. Got {r.status_code}: {r.text}"
        )

    def test_actualizacion_por_grl_id_preserva_id(self, app_client, admin_token):
        """Actualizar por grl_id no cambia el ID de la línea."""
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

        grls_before = _get_grls(eninv_id)
        grl_id = grls_before[0][0]

        r = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}",
            headers=_auth(admin_token),
            json={"productos": [{"grl_id": grl_id, "qty_recibida": 5}]},
        )
        assert r.status_code == 200, f"PATCH por grl_id fallo: {r.text}"

        grls_after = _get_grls(eninv_id)
        assert [g[0] for g in grls_before] == [g[0] for g in grls_after], (
            f"IDs de GRL no deben cambiar. Antes={grls_before}, Despues={grls_after}"
        )

    def test_sku_id_incorrecto_rechazado(self, app_client, admin_token):
        """Payload con sku_id distinto al de la GRL → 422."""
        db = TestSessionLocal()
        try:
            sup_id  = _create_supplier_db(db)
            wh_id   = _create_warehouse_db(db)
            sku_id  = _create_sku_db(db)
            sku_id2 = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        grls = _get_grls(eninv_id)
        grl_id = grls[0][0]

        r = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}",
            headers=_auth(admin_token),
            json={"productos": [{"grl_id": grl_id, "sku_id": sku_id2, "qty_recibida": 5}]},
        )
        assert r.status_code == 422, (
            f"sku_id incorrecto debe rechazarse. Got {r.status_code}: {r.text}"
        )

    def test_normalizar_legacy_mediante_patch(self, app_client, admin_token):
        """PATCH en recepción legacy sin GRL → normaliza (crea GRL) y regenera JSON."""
        db = TestSessionLocal()
        try:
            from app.models.erp_documents import Supplier
            from app.models.erp_documents import GoodsReceipt
            from app.models.inventory import Warehouse
            from app.models.catalog import ProductSKU, Product, Brand, Category
            import uuid as _uuid

            sup = Supplier(name=f"Sup-{_uuid.uuid4().hex[:6]}", is_active=True)
            db.add(sup); db.flush()
            wh = Warehouse(name=f"Wh-{_uuid.uuid4().hex[:6]}", location_type="Central")
            db.add(wh); db.flush()
            br = Brand(name=f"Br-{_uuid.uuid4().hex[:4]}")
            db.add(br); db.flush()
            ca = Category(name=f"Ca-{_uuid.uuid4().hex[:4]}")
            db.add(ca); db.flush()
            pr = Product(name=f"Pr-{_uuid.uuid4().hex[:4]}", brand_id=br.id,
                         category_id=ca.id, type="Fisico", base_currency="USD",
                         uom="Ud", is_active=True)
            db.add(pr); db.flush()
            sk = ProductSKU(product_id=pr.id, sku=f"TST-{_uuid.uuid4().hex[:8]}",
                            cost_price=10.0, sale_price=20.0)
            db.add(sk); db.flush()
            sku_id = sk.id

            # Crear ENINV directamente sin GRL (recepción legacy)
            import datetime as _dt
            gr = GoodsReceipt(
                numero=f"ENINV-LEGACY-{_uuid.uuid4().hex[:6]}",
                supplier_id=sup.id, supplier_name=sup.name,
                warehouse_id=wh.id, warehouse_name=wh.name,
                operacion_tipo="RECEPCION", estado="BORRADOR",
                productos=[{"sku_id": sku_id, "qty_esperada": 5, "nombre": "Prod"}],
                created_by="test",
            )
            db.add(gr); db.commit(); db.refresh(gr)
            eninv_id = gr.id
            wh_id = wh.id
        finally:
            db.close()

        # Verificar que no hay GRL inicialmente
        with TestSessionLocal() as db2:
            n_grl_before = db2.execute(text(
                "SELECT COUNT(*) FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).scalar()
        assert int(n_grl_before) == 0, f"No debe haber GRL antes del PATCH. Got {n_grl_before}"

        # PATCH → debe normalizar y crear GRL
        r = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}",
            headers=_auth(admin_token),
            json={"productos": [{"sku_id": sku_id, "qty_recibida": 5, "qty_esperada": 5}]},
        )
        assert r.status_code == 200, f"PATCH legacy debe normalizar. Got {r.status_code}: {r.text}"

        with TestSessionLocal() as db2:
            n_grl_after = db2.execute(text(
                "SELECT COUNT(*) FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).scalar()
            grl = db2.execute(text(
                "SELECT quantity_received, source FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).fetchone()

        assert int(n_grl_after) >= 1, f"Debe crear al menos 1 GRL. Got {n_grl_after}"
        assert int(grl[0]) == 5, f"quantity_received debe ser 5. Got {grl[0]}"
        assert grl[1] == "LEGACY", f"source debe ser LEGACY. Got {grl[1]}"

    def test_post_recepciones_po_line_id_externo_rechazado(self, app_client, admin_token):
        """POST /recepciones con _po_line_id de otra PEC → 422."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        # Crear dos PECs
        pec1 = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                               [{"sku_id": sku_id, "qty": 3, "nombre": "Prod"}])
        pec2 = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                               [{"sku_id": sku_id, "qty": 2, "nombre": "Prod"}])

        # Obtener po_line_id de pec1
        with TestSessionLocal() as db2:
            pol_id_pec1 = db2.execute(text(
                "SELECT id FROM purchase_order_lines WHERE pec_id=:pid LIMIT 1"
            ), {"pid": pec1["id"]}).scalar()

        # Intentar crear recepción de pec2 con _po_line_id de pec1
        r = app_client.post("/api/v1/compras/recepciones",
                            headers=_auth(admin_token),
                            json={
                                "pec_id": pec2["id"],
                                "warehouse_id": wh_id,
                                "created_by": "test",
                                "productos": [
                                    {"sku_id": sku_id, "qty": 2, "nombre": "Prod",
                                     "_po_line_id": pol_id_pec1}  # de pec1, no pec2
                                ],
                            })
        assert r.status_code == 422, (
            f"po_line_id de otra PEC debe rechazarse con 422. Got {r.status_code}: {r.text}"
        )

    def test_conservacion_ids_y_trazabilidad_tras_patch(self, app_client, admin_token):
        """Los IDs de GRL se conservan tras múltiples PATCHes consecutivos."""
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

        grls_initial = _get_grls(eninv_id)
        grl_id = grls_initial[0][0]

        # Primer PATCH: qty=3
        r1 = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}",
            headers=_auth(admin_token),
            json={"productos": [{"grl_id": grl_id, "qty_recibida": 3}]},
        )
        assert r1.status_code == 200

        # Segundo PATCH: qty=5 (corrección)
        r2 = app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}",
            headers=_auth(admin_token),
            json={"productos": [{"grl_id": grl_id, "qty_recibida": 5}]},
        )
        assert r2.status_code == 200

        grls_final = _get_grls(eninv_id)
        assert [g[0] for g in grls_initial] == [g[0] for g in grls_final], (
            "IDs de GRL deben conservarse tras múltiples PATCHes"
        )

        with TestSessionLocal() as db2:
            qty = db2.execute(text(
                "SELECT quantity_received FROM goods_receipt_lines WHERE id=:gid"
            ), {"gid": grl_id}).scalar()
        assert int(qty) == 5, f"qty_received final debe ser 5. Got {qty}"
