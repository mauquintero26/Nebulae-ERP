"""
test_fase1b_confirmar.py — Tests de confirmar_recepcion via endpoint HTTP

Usa la fixture app_client del conftest (scope=session) que tiene get_db
sobrescrito apuntando a erp_test.

Escenarios:
 1. confirmar usa GoodsReceiptLine (no g.productos) como fuente de verdad
 2. JSON contradice GRL -> GRL gana
 3. Replay idempotente no duplica lineas
 4. Replay conserva IDs de GRL
 5. ENINV inexistente: rollback sin GRL huerfanas
 6. Recepcion parcial FISICA -> PEC PARCIALMENTE_RECIBIDA
 7. Recepcion LOGISTICA no actualiza stock
 8. Excedente permitido (allow_excess=True)
 9. Excedente no permitido (allow_excess=False)
10. Dos lineas PEC mismo SKU -> po_line_id distinto en cada GRL
11. SKU solo en JSON no genera InventoryMovement
"""
import uuid
import json as _json
import pytest
from sqlalchemy import text

from tests.conftest import TestSessionLocal


# ─── Helpers inline (usan app_client del conftest) ────────────────────────────

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
    sk = ProductSKU(
        product_id=pr.id, sku=f"TST-{uuid.uuid4().hex[:8]}",
        cost_price=10.0, sale_price=20.0,
    )
    db.add(sk); db.commit(); db.refresh(sk)
    return sk.id


def _create_pec_api(client, token, sup_id, wh_id, productos) -> dict:
    r = client.post("/api/v1/compras/pedidos", headers=_auth(token),
                    json={"supplier_id": sup_id, "supplier_name": "TestSup",
                          "warehouse_id": wh_id, "productos": productos})
    assert r.status_code == 201, f"create_pec failed: {r.text}"
    return r.json()["data"]


def _create_eninv_api(client, token, pec_id, wh_id) -> dict:
    r = client.post(f"/api/v1/compras/pedidos/{pec_id}/recepcionar",
                    headers=_auth(token),
                    json={"warehouse_id": wh_id, "created_by": "test"})
    assert r.status_code in (200, 201), f"create_eninv failed: {r.text}"
    return r.json()["data"]


def _confirmar(client, token, eninv_id, receipt_type="FISICA",
               allow_excess=False, key=None):
    if key is None:
        key = str(uuid.uuid4())
    r = client.post(
        f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
        headers=_auth(token),
        json={"idempotency_key": key, "receipt_type": receipt_type,
              "allow_excess": allow_excess, "user_name": "test"},
    )
    return r.status_code, r.json(), key


# ─── Tests ─────────────────────────────────────────────────────────────────────

class TestConfirmarUsaGoodsReceiptLines:

    def test_confirmar_crea_grl_y_usa_fuente_normalizada(
            self, app_client, admin_token):
        """GoodsReceiptLine como fuente de verdad al confirmar."""
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

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, f"Expected 200: {body}"

        with TestSessionLocal() as db2:
            rows = db2.execute(text(
                "SELECT sku_id, quantity_expected, quantity_received, source "
                "FROM goods_receipt_lines WHERE gr_id=:gid ORDER BY id"
            ), {"gid": eninv_id}).fetchall()

        assert len(rows) >= 1, "Debe existir >= 1 GoodsReceiptLine"
        assert int(rows[0][0]) == sku_id
        assert int(rows[0][1]) == 5, f"qty_expected=5, got {rows[0][1]}"
        assert int(rows[0][2]) == 5, f"qty_received=5, got {rows[0][2]}"
        assert rows[0][3] == "NATIVE"

    def test_grl_gana_cuando_json_contradice(self, app_client, admin_token):
        """GRL (qty=5) gana cuando JSON dice qty_recibida=99."""
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

        # Manipular JSON
        with TestSessionLocal() as db2:
            db2.execute(text(
                "UPDATE goods_receipts SET productos=CAST(:p AS jsonb) WHERE id=:gid"
            ), {"p": _json.dumps(
                [{"sku_id": sku_id, "qty_esperada": 5, "qty_recibida": 99,
                  "nombre": "Prod"}]
            ), "gid": eninv_id})
            db2.commit()

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, f"Expected 200: {body}"

        with TestSessionLocal() as db2:
            qty = db2.execute(text(
                "SELECT quantity FROM inventory_levels "
                "WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar()

        assert qty is not None
        assert int(qty) == 5, f"GRL debe ganar: inv=5, no 99. Got {qty}"

    def test_no_duplica_lineas_en_replay(self, app_client, admin_token):
        """Replay no genera GRL adicionales."""
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

        key = str(uuid.uuid4())
        _confirmar(app_client, admin_token, eninv_id, key=key)

        with TestSessionLocal() as db2:
            c1 = db2.execute(text(
                "SELECT COUNT(*) FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).scalar()

        s2, b2, _ = _confirmar(app_client, admin_token, eninv_id, key=key)
        assert s2 == 200
        assert b2.get("idempotent_replay") is True

        with TestSessionLocal() as db2:
            c2 = db2.execute(text(
                "SELECT COUNT(*) FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).scalar()

        assert c2 == c1, f"Replay no debe crear mas GRL. {c1} -> {c2}"

    def test_replay_conserva_ids_de_lineas(self, app_client, admin_token):
        """Replay conserva los mismos IDs de GRL."""
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

        key = str(uuid.uuid4())
        _confirmar(app_client, admin_token, eninv_id, key=key)

        with TestSessionLocal() as db2:
            ids1 = [r[0] for r in db2.execute(text(
                "SELECT id FROM goods_receipt_lines WHERE gr_id=:gid ORDER BY id"
            ), {"gid": eninv_id}).fetchall()]

        _confirmar(app_client, admin_token, eninv_id, key=key)

        with TestSessionLocal() as db2:
            ids2 = [r[0] for r in db2.execute(text(
                "SELECT id FROM goods_receipt_lines WHERE gr_id=:gid ORDER BY id"
            ), {"gid": eninv_id}).fetchall()]

        assert ids1 == ids2, f"IDs cambiaron: {ids1} -> {ids2}"

    def test_error_produce_rollback_completo(self, app_client, admin_token):
        """ENINV 999999 inexistente: sin GRL ni movimientos huerfanos."""
        status, body, _ = _confirmar(app_client, admin_token, 999999)
        assert status == 404

        with TestSessionLocal() as db2:
            mv = db2.execute(text(
                "SELECT COUNT(*) FROM inventory_movements im "
                "JOIN inventory_operations io ON io.id=im.operation_id "
                "WHERE io.source_document_id=999999"
            )).scalar()
            grl = db2.execute(text(
                "SELECT COUNT(*) FROM goods_receipt_lines WHERE gr_id=999999"
            )).scalar()

        assert int(mv) == 0
        assert int(grl) == 0

    def test_recepcion_parcial_fisica(self, app_client, admin_token):
        """qty_received=3/5 -> inventario=3, PEC=PARCIALMENTE_RECIBIDA."""
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

        with TestSessionLocal() as db2:
            db2.execute(text(
                "UPDATE goods_receipt_lines SET quantity_received=3 WHERE gr_id=:gid"
            ), {"gid": eninv_id})
            db2.commit()

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, f"Expected 200: {body}"

        with TestSessionLocal() as db2:
            pec_est = db2.execute(text(
                "SELECT estado FROM purchase_orders_full WHERE id=:pid"
            ), {"pid": pec["id"]}).scalar()
            inv = db2.execute(text(
                "SELECT quantity FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar()

        assert pec_est == "PARCIALMENTE_RECIBIDA",             f"PEC debe ser PARCIALMENTE_RECIBIDA. Got {pec_est}"
        assert int(inv) == 3, f"Inventario debe ser 3. Got {inv}"

    def test_recepcion_logistica_no_actualiza_stock(
            self, app_client, admin_token):
        """LOGISTICA: estado=COMPLETADA_LOGISTICA, stock_actualizado=False."""
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

        status, body, _ = _confirmar(app_client, admin_token, eninv_id,
                                     receipt_type="LOGISTICA")
        assert status == 200, f"Expected 200: {body}"

        with TestSessionLocal() as db2:
            row = db2.execute(text(
                "SELECT estado, stock_actualizado FROM goods_receipts WHERE id=:gid"
            ), {"gid": eninv_id}).fetchone()
            qty = db2.execute(text(
                "SELECT quantity FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar()

        assert row[0] == "COMPLETADA_LOGISTICA"
        assert row[1] is False
        if qty is not None:
            assert int(qty) == 0, f"LOGISTICA no debe subir stock. Got {qty}"

    def test_excedente_permitido(self, app_client, admin_token):
        """allow_excess=True: qty_received=7>5 se acepta."""
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

        with TestSessionLocal() as db2:
            db2.execute(text(
                "UPDATE goods_receipt_lines SET quantity_received=7 WHERE gr_id=:gid"
            ), {"gid": eninv_id})
            db2.commit()

        status, body, _ = _confirmar(app_client, admin_token, eninv_id,
                                     allow_excess=True)
        assert status == 200, f"Expected 200 con allow_excess: {body}"

        with TestSessionLocal() as db2:
            inv = db2.execute(text(
                "SELECT quantity FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar()
        assert int(inv) == 7, f"Inventario debe ser 7. Got {inv}"

    def test_excedente_no_permitido(self, app_client, admin_token):
        """allow_excess=False: qty_received=8>5 retorna 422."""
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

        with TestSessionLocal() as db2:
            db2.execute(text(
                "UPDATE goods_receipt_lines SET quantity_received=8 WHERE gr_id=:gid"
            ), {"gid": eninv_id})
            db2.commit()

        status, body, _ = _confirmar(app_client, admin_token, eninv_id,
                                     allow_excess=False)
        assert status == 422, f"Expected 422 por excedente: {body}"

    def test_dos_lineas_mismo_sku_po_line_id_correcto(
            self, app_client, admin_token):
        """PEC con 2 lineas mismo SKU: 2 GRL con po_line_id distinto."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec = _create_pec_api(
            app_client, admin_token, sup_id, wh_id,
            [{"sku_id": sku_id, "qty": 3, "nombre": "Linea A"},
             {"sku_id": sku_id, "qty": 2, "nombre": "Linea B"}]
        )
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        with TestSessionLocal() as db2:
            grls = db2.execute(text(
                "SELECT id, po_line_id, quantity_expected "
                "FROM goods_receipt_lines WHERE gr_id=:gid ORDER BY id"
            ), {"gid": eninv_id}).fetchall()
            pols = db2.execute(text(
                "SELECT id FROM purchase_order_lines WHERE pec_id=:pid ORDER BY id"
            ), {"pid": pec["id"]}).fetchall()

        assert len(grls) == 2,             f"Deben existir 2 GRL (una por linea de PEC). Got {len(grls)}"

        if pols and len(pols) >= 2:
            po_ids = [r[1] for r in grls]
            assert po_ids[0] != po_ids[1],                 f"po_line_id debe ser distinto por linea. Got {po_ids}"

    def test_solo_grl_genera_movimientos_no_json_legacy(
            self, app_client, admin_token):
        """SKU solo en JSON legacy no genera InventoryMovement."""
        db = TestSessionLocal()
        try:
            sup_id       = _create_supplier_db(db)
            wh_id        = _create_warehouse_db(db)
            sku_real     = _create_sku_db(db)
            sku_fantasma = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_real, "qty": 5, "nombre": "Real"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        with TestSessionLocal() as db2:
            existing = db2.execute(text(
                "SELECT productos FROM goods_receipts WHERE id=:gid"
            ), {"gid": eninv_id}).scalar()
            prods = _json.loads(existing) if isinstance(existing, str) else existing
            prods.append({"sku_id": sku_fantasma, "qty_esperada": 10,
                          "qty_recibida": 10, "nombre": "Fantasma"})
            db2.execute(text(
                "UPDATE goods_receipts SET productos=CAST(:p AS jsonb) WHERE id=:gid"
            ), {"p": _json.dumps(prods), "gid": eninv_id})
            db2.commit()

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, f"Expected 200: {body}"

        with TestSessionLocal() as db2:
            mv = db2.execute(text(
                "SELECT COUNT(*) FROM inventory_movements WHERE sku_id=:s"
            ), {"s": sku_fantasma}).scalar()

        assert int(mv) == 0,             f"SKU fantasma (solo JSON) no debe tener movimientos. Got {mv}"
