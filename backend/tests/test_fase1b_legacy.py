"""
test_fase1b_legacy.py — Bloqueo 5: Compatibilidad legacy

Escenarios:
 1. Fallback legacy usa source=LEGACY (no NATIVE)
 2. Recepcion legacy con qty_recibida en JSON se confirma correctamente
 3. Recepcion legacy sin qty_recibida -> quantity_received=NULL -> 422
 4. LEGACY_NORMALIZED aparece en activity_logs
"""
import uuid
import json as _json
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
    sk = ProductSKU(
        product_id=pr.id, sku=f"TST-{uuid.uuid4().hex[:8]}",
        cost_price=10.0, sale_price=20.0,
    )
    db.add(sk); db.commit(); db.refresh(sk)
    return sk.id


def _create_legacy_eninv(db, sku_id, wh_id, qty_esperada, qty_recibida=None):
    """Crea una ENINV legacy directamente en DB (sin GRL, sin pasar por API de PEC)."""
    from app.models.erp_documents import GoodsReceipt
    import datetime
    prod = {"sku_id": sku_id, "nombre": "Legacy", "qty_esperada": qty_esperada}
    if qty_recibida is not None:
        prod["qty_recibida"] = qty_recibida
    g = GoodsReceipt(
        numero=f"ENINV-LEG-{uuid.uuid4().hex[:8]}",
        pec_id=None, pec_numero=None,
        warehouse_id=wh_id, warehouse_name="Test",
        estado="BORRADOR", stock_actualizado=False,
        productos=[prod],
        created_by="legacy",
    )
    db.add(g); db.commit(); db.refresh(g)
    return g.id


class TestCompatibilidadLegacy:

    def test_fallback_legacy_source_es_legacy(
            self, app_client, admin_token):
        """Recepcion sin GRL usa source=LEGACY, no NATIVE."""
        db = TestSessionLocal()
        try:
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
            eninv_id = _create_legacy_eninv(db, sku_id, wh_id,
                                            qty_esperada=5, qty_recibida=5)
        finally:
            db.close()

        # Intentar confirmar (activa fallback legacy)
        key = str(uuid.uuid4())
        r = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
            headers=_auth(admin_token),
            json={"idempotency_key": key, "receipt_type": "FISICA",
                  "allow_excess": False, "user_name": "test"},
        )
        # Puede ser 200 (confirmado) o cualquier status; lo que importa es el source
        # Verificar que las GRL creadas tienen source=LEGACY
        with TestSessionLocal() as db2:
            sources = db2.execute(text(
                "SELECT DISTINCT source FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).scalars().all()

        assert "LEGACY" in sources, f"GRL legacy debe tener source=LEGACY. Got {sources}"
        assert "NATIVE" not in sources, f"GRL legacy NO debe tener source=NATIVE. Got {sources}"

    def test_legacy_con_qty_recibida_en_json_se_confirma(
            self, app_client, admin_token):
        """Recepcion legacy con qty_recibida en JSON se confirma correctamente."""
        db = TestSessionLocal()
        try:
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
            eninv_id = _create_legacy_eninv(db, sku_id, wh_id,
                                            qty_esperada=5, qty_recibida=5)
        finally:
            db.close()

        key = str(uuid.uuid4())
        r = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
            headers=_auth(admin_token),
            json={"idempotency_key": key, "receipt_type": "FISICA",
                  "allow_excess": False, "user_name": "test"},
        )
        assert r.status_code == 200, (
            f"Legacy con qty_recibida=5 debe confirmarse. Got {r.status_code}: {r.text}"
        )

        with TestSessionLocal() as db2:
            stock = db2.execute(text(
                "SELECT quantity FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar()
        assert int(stock) == 5, f"Stock legacy debe ser 5. Got {stock}"

    def test_legacy_sin_qty_recibida_rechaza_con_422(
            self, app_client, admin_token):
        """Recepcion legacy sin qty_recibida en JSON -> quantity_received=NULL -> 422 FISICA."""
        db = TestSessionLocal()
        try:
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
            # Crear sin qty_recibida (ambiguo)
            eninv_id = _create_legacy_eninv(db, sku_id, wh_id,
                                            qty_esperada=5, qty_recibida=None)
        finally:
            db.close()

        key = str(uuid.uuid4())
        r = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
            headers=_auth(admin_token),
            json={"idempotency_key": key, "receipt_type": "FISICA",
                  "allow_excess": False, "user_name": "test"},
        )
        assert r.status_code == 422, (
            f"Legacy sin qty_recibida -> quantity_received=NULL -> 422 FISICA. "
            f"Got {r.status_code}: {r.text}"
        )

    def test_legacy_normalizacion_registrada_en_audit(
            self, app_client, admin_token):
        """Fallback legacy registra LEGACY_NORMALIZED en activity_logs."""
        db = TestSessionLocal()
        try:
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
            eninv_id = _create_legacy_eninv(db, sku_id, wh_id,
                                            qty_esperada=5, qty_recibida=5)
        finally:
            db.close()

        key = str(uuid.uuid4())
        app_client.post(
            f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
            headers=_auth(admin_token),
            json={"idempotency_key": key, "receipt_type": "FISICA",
                  "allow_excess": False, "user_name": "test"},
        )

        with TestSessionLocal() as db2:
            actions = db2.execute(text(
                "SELECT action FROM activity_logs "
                "WHERE entity_type=\'ENINV\' AND entity_id=:gid"
            ), {"gid": eninv_id}).scalars().all()

        assert "LEGACY_NORMALIZED" in actions, (
            f"Debe existir LEGACY_NORMALIZED en activity_logs. Got {actions}"
        )
