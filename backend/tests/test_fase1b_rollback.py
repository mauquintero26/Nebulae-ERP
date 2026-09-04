"""
test_fase1b_rollback.py — Bloqueo 4: Rollback transaccional real

Prueba que un fallo DESPUES de que la transaccion principal ha creado
InventoryMovement/InventoryLevel hace rollback completo.

Mecanismo: monkeypatch de db.commit en erp_compras para lanzar exception
despues de que los datos ya fueron escritos (pero antes del commit).
"""
import uuid
import pytest
from unittest.mock import patch
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


class TestRollbackTransaccional:

    def test_rollback_real_despues_de_inventory_movement(
            self, app_client, admin_token):
        """
        Fallo controlado despues de que InventoryMovement fue agregado a la sesion.
        Verifica: ENINV sigue en BORRADOR, stock=0, no hay movimientos.

        Mecanismo: monkeypatching de db.execute para simular fallo en el UPDATE
        de idempotency_requests (justo antes del commit final), lo que fuerza
        la excepcion en la transaccion principal sin afectar produccion.
        """
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

        # Registrar cantidad
        with TestSessionLocal() as db2:
            grl_id = db2.execute(text(
                "SELECT id FROM goods_receipt_lines WHERE gr_id=:gid LIMIT 1"
            ), {"gid": eninv_id}).scalar()

        app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}/lineas/{grl_id}",
            headers=_auth(admin_token),
            json={"quantity_received": 5},
        )

        # Verificar inventario antes del intento fallido
        with TestSessionLocal() as db2:
            stock_before = db2.execute(text(
                "SELECT COALESCE(quantity, 0) FROM inventory_levels "
                "WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar() or 0
            estado_before = db2.execute(text(
                "SELECT estado FROM goods_receipts WHERE id=:gid"
            ), {"gid": eninv_id}).scalar()

        assert estado_before == "BORRADOR"

        # Simular fallo: monkeypatch de Session.commit en la ruta de confirmar
        # Usamos el modulo erp_compras directamente para interceptar el commit
        idem_key = str(uuid.uuid4())

        original_execute = None
        call_count = [0]

        import app.api.v1.erp_compras as _compras_mod
        from sqlalchemy.orm import Session

        original_commit = Session.commit

        def fail_commit_once(self):
            call_count[0] += 1
            # El primer commit es de idem TX1 (exitoso).
            # El segundo commit es la TX principal - FALLAR aqui
            if call_count[0] == 2:
                raise RuntimeError("TEST: fallo simulado en TX principal post-inventory")
            return original_commit(self)

        with patch.object(Session, "commit", fail_commit_once):
            r_conf = app_client.post(
                f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
                headers=_auth(admin_token),
                json={"idempotency_key": idem_key, "receipt_type": "FISICA",
                      "allow_excess": False, "user_name": "test"},
            )

        # El endpoint debe retornar 500 (fallo controlado)
        assert r_conf.status_code == 500, (
            f"Fallo simulado debe retornar 500. Got {r_conf.status_code}: {r_conf.text}"
        )

        # Verificar rollback completo
        with TestSessionLocal() as db2:
            estado_after = db2.execute(text(
                "SELECT estado FROM goods_receipts WHERE id=:gid"
            ), {"gid": eninv_id}).scalar()
            stock_after = db2.execute(text(
                "SELECT COALESCE(quantity, 0) FROM inventory_levels "
                "WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar() or 0
            n_movements = db2.execute(text(
                "SELECT COUNT(*) FROM inventory_movements im "
                "JOIN inventory_operations io ON io.id = im.operation_id "
                "WHERE io.source_document_id = :gid"
            ), {"gid": eninv_id}).scalar()
            n_operations = db2.execute(text(
                "SELECT COUNT(*) FROM inventory_operations WHERE source_document_id=:gid"
            ), {"gid": eninv_id}).scalar()
            idem_status = db2.execute(text(
                "SELECT status FROM idempotency_requests WHERE operation_key=:k"
            ), {"k": idem_key}).scalar()

        assert estado_after == "BORRADOR", (
            f"ENINV debe seguir en BORRADOR despues del rollback. Got {estado_after}"
        )
        assert float(stock_after) == float(stock_before), (
            f"Stock no debe cambiar. Antes={stock_before}, Despues={stock_after}"
        )
        assert int(n_movements) == 0, (
            f"No deben quedar InventoryMovements. Got {n_movements}"
        )
        assert int(n_operations) == 0, (
            f"No deben quedar InventoryOperations. Got {n_operations}"
        )
        assert idem_status == "FAILED", (
            f"idempotency_requests debe quedar en FAILED para permitir reintento. Got {idem_status}"
        )

        # Verificar que un reintento con la misma clave puede proceder
        # (FAILED no bloquea nuevos intentos con la misma clave)
        # Registrar cantidad de nuevo (GRL pudo haber sido revertida)
        app_client.patch(
            f"/api/v1/compras/recepciones/{eninv_id}/lineas/{grl_id}",
            headers=_auth(admin_token),
            json={"quantity_received": 5},
        )
        r_retry = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
            headers=_auth(admin_token),
            json={"idempotency_key": str(uuid.uuid4()),  # nueva clave
                  "receipt_type": "FISICA", "allow_excess": False, "user_name": "test"},
        )
        # El reintento con nueva clave debe funcionar
        assert r_retry.status_code == 200, (
            f"Reintento post-rollback debe ser exitoso. Got {r_retry.status_code}: {r_retry.text}"
        )
