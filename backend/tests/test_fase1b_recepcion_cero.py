"""
test_fase1b_recepcion_cero.py — Bloqueo 2: Recepción física con cero unidades aceptadas.

Una recepción FISICA donde todo fue rechazado, en cuarentena o faltante debe:
- Confirmarse con 200 (no 422)
- No crear InventoryMovement de stock disponible
- Terminar en estado claro (no BORRADOR)
- Conservar campos qty_rechazada, qty_cuarentena en GRL
- Generar auditoría
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


def _get_first_grl_id(eninv_id):
    with TestSessionLocal() as db:
        return db.execute(text(
            "SELECT id FROM goods_receipt_lines WHERE gr_id=:gid ORDER BY id LIMIT 1"
        ), {"gid": eninv_id}).scalar()


def _registrar_grl(client, token, eninv_id, **kwargs):
    grl_id = _get_first_grl_id(eninv_id)
    r = client.patch(
        f"/api/v1/compras/recepciones/{eninv_id}/lineas/{grl_id}",
        headers=_auth(token), json=kwargs,
    )
    assert r.status_code == 200, f"PATCH linea failed: {r.text}"
    return grl_id


def _confirmar(client, token, eninv_id, receipt_type="FISICA", allow_excess=False, key=None):
    if key is None:
        key = str(uuid.uuid4())
    r = client.post(
        f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
        headers=_auth(token),
        json={"idempotency_key": key, "receipt_type": receipt_type,
              "allow_excess": allow_excess, "user_name": "test"},
    )
    return r.status_code, r.json(), key


class TestRecepcionCeroUnidades:

    def test_todo_rechazado_confirma_con_200(self, app_client, admin_token):
        """qty_received=0, qty_rejected=5 -> confirma 200, no crea stock."""
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

        _registrar_grl(app_client, admin_token, eninv_id,
                       quantity_received=0, quantity_rejected=5)

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, (
            f"Todo rechazado debe confirmar con 200, no 422. Got {status}: {body}"
        )

        with TestSessionLocal() as db2:
            inv = db2.execute(text(
                "SELECT COALESCE(quantity, 0) FROM inventory_levels "
                "WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar() or 0

            n_mv = db2.execute(text(
                "SELECT COUNT(*) FROM inventory_movements im "
                "JOIN inventory_operations io ON io.id=im.operation_id "
                "WHERE io.source_document_id=:gid AND im.sku_id=:s"
            ), {"gid": eninv_id, "s": sku_id}).scalar()

            gr_estado = db2.execute(text(
                "SELECT estado FROM goods_receipts WHERE id=:gid"
            ), {"gid": eninv_id}).scalar()

            grl = db2.execute(text(
                "SELECT quantity_received, quantity_rejected FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).fetchone()

        assert float(inv) == 0, f"Stock disponible debe ser 0. Got {inv}"
        assert int(n_mv) == 0, f"No debe crear InventoryMovement. Got {n_mv}"
        assert gr_estado not in ("BORRADOR",), f"No debe quedar en BORRADOR. Got {gr_estado}"
        assert int(grl[0]) == 0, f"qty_received debe ser 0. Got {grl[0]}"
        assert int(grl[1]) == 5, f"qty_rejected debe ser 5. Got {grl[1]}"

    def test_todo_en_cuarentena_confirma_con_200(self, app_client, admin_token):
        """qty_received=0, qty_quarantine=5 -> confirma 200, stock=0, cuarentena preservada."""
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

        _registrar_grl(app_client, admin_token, eninv_id,
                       quantity_received=0, quantity_quarantine=5)

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, (
            f"Todo en cuarentena debe confirmar con 200. Got {status}: {body}"
        )

        with TestSessionLocal() as db2:
            inv = db2.execute(text(
                "SELECT COALESCE(quantity, 0) FROM inventory_levels "
                "WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar() or 0

            n_mv = db2.execute(text(
                "SELECT COUNT(*) FROM inventory_movements im "
                "JOIN inventory_operations io ON io.id=im.operation_id "
                "WHERE io.source_document_id=:gid"
            ), {"gid": eninv_id}).scalar()

            grl = db2.execute(text(
                "SELECT quantity_received, quantity_quarantine FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).fetchone()

        assert float(inv) == 0, f"Stock debe ser 0. Got {inv}"
        assert int(n_mv) == 0, f"No debe crear InventoryMovement de stock. Got {n_mv}"
        assert int(grl[0]) == 0, f"qty_received debe ser 0. Got {grl[0]}"
        assert int(grl[1]) == 5, f"qty_quarantine debe ser 5. Got {grl[1]}"

    def test_mezcla_recibido_rechazado_cuarentena(self, app_client, admin_token):
        """qty_received=2, qty_rejected=2, qty_quarantine=1 -> stock=2, confirmado 200."""
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

        _registrar_grl(app_client, admin_token, eninv_id,
                       quantity_received=2, quantity_rejected=2, quantity_quarantine=1)

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, f"Mezcla debe confirmar con 200. Got {status}: {body}"

        with TestSessionLocal() as db2:
            inv = db2.execute(text(
                "SELECT quantity FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar()
            grl = db2.execute(text(
                "SELECT quantity_received, quantity_rejected, quantity_quarantine "
                "FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).fetchone()

        assert int(inv) == 2, f"Stock disponible debe ser 2. Got {inv}"
        assert int(grl[0]) == 2, f"qty_received=2. Got {grl[0]}"
        assert int(grl[1]) == 2, f"qty_rejected=2. Got {grl[1]}"
        assert int(grl[2]) == 1, f"qty_quarantine=1. Got {grl[2]}"

    def test_suma_excede_expected_sin_allow_excess_422(self, app_client, admin_token):
        """qty_received=3 + qty_rejected=3 = 6 > qty_expected=5 -> 422 sin allow_excess."""
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

        _registrar_grl(app_client, admin_token, eninv_id,
                       quantity_received=3, quantity_rejected=3)

        status, _, _ = _confirmar(app_client, admin_token, eninv_id, allow_excess=False)
        assert status == 422, f"Suma excede expected -> 422. Got {status}"

    def test_estado_no_borrador_despues_de_confirmar_cero(self, app_client, admin_token):
        """Recepción con todo rechazado no queda en BORRADOR después de confirmar."""
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

        _registrar_grl(app_client, admin_token, eninv_id,
                       quantity_received=0, quantity_rejected=3)

        status, _, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, f"Expected 200. Got {status}"

        with TestSessionLocal() as db2:
            gr = db2.execute(text(
                "SELECT estado, stock_actualizado FROM goods_receipts WHERE id=:gid"
            ), {"gid": eninv_id}).fetchone()

        assert gr[0] != "BORRADOR", f"No debe quedar en BORRADOR. Got {gr[0]}"
        assert gr[1] == False, "stock_actualizado debe ser False (sin stock ingresado)"

    def test_qty_faltante_registrado_en_snapshot(self, app_client, admin_token):
        """qty_received=2, qty_rejected=1 de qty_expected=5 -> qty_faltante=2 en snapshot."""
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

        _registrar_grl(app_client, admin_token, eninv_id,
                       quantity_received=2, quantity_rejected=1)

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, f"Expected 200. Got {status}: {body}"

        import json as _json
        with TestSessionLocal() as db2:
            raw = db2.execute(text(
                "SELECT productos FROM goods_receipts WHERE id=:gid"
            ), {"gid": eninv_id}).scalar()
            prods = _json.loads(raw) if isinstance(raw, str) else raw

        assert prods, "productos no debe estar vacío"
        p = prods[0]
        # qty_faltante = 5 - (2+1+0) = 2
        assert p.get("qty_faltante", -1) == 2, (
            f"qty_faltante debe ser 2. Got {p.get('qty_faltante')}"
        )
