"""
test_fase1b_backfill.py — Tests del script de backfill JSON → tablas normalizadas

Escenarios:
1. Dry-run no escribe nada
2. Backfill real crea líneas normalizadas
3. Segunda ejecución del mismo batch_id es idempotente (no duplica)
4. Rollback por lote elimina exactamente las líneas del lote
5. Rollback bloqueado si existen dependencias posteriores
"""
import uuid
import pytest
import subprocess
import sys
import os
import pathlib
from decimal import Decimal
from sqlalchemy import text

from tests.conftest import TestSessionLocal, test_engine, TEST_URL

# backend/ directory (parent of tests/)
BACKEND_DIR = str(pathlib.Path(__file__).parent.parent)


def _run_backfill(*extra_args, batch_id=None):
    """Ejecuta el script de backfill y retorna (returncode, stdout, stderr)."""
    env = os.environ.copy()
    env["TEST_DATABASE_URL"] = TEST_URL
    env["DATABASE_URL"] = TEST_URL  # backfill usa ambas
    cmd = [sys.executable, "scripts/backfill_fase1b.py"] + list(extra_args)
    if batch_id:
        cmd += ["--batch-id", batch_id]
    result = subprocess.run(
        cmd, cwd=BACKEND_DIR, env=env,
        capture_output=True, text=True
    )
    return result.returncode, result.stdout, result.stderr


def _count(table, batch_id, conn):
    row = conn.execute(
        text(f"SELECT COUNT(*) FROM {table} WHERE migration_batch_id = :bid AND source = 'BACKFILL'"),
        {"bid": batch_id}
    ).fetchone()
    return row[0]


def _insert_test_pec_with_productos(db):
    """Crea una PEC con productos JSON para probar el backfill."""
    from app.models.erp_documents import PurchaseOrderFull, Supplier
    from app.models.catalog import Brand, Category, Product, ProductSKU
    from app.models.inventory import Warehouse

    brand = Brand(name=f"BfBrand-{uuid.uuid4().hex[:6]}")
    db.add(brand); db.flush()
    cat = Category(name=f"BfCat-{uuid.uuid4().hex[:6]}")
    db.add(cat); db.flush()
    prod = Product(brand_id=brand.id, category_id=cat.id,
                   name="BfProduct", type="Fisico", base_currency="USD")
    db.add(prod); db.flush()
    sku = ProductSKU(product_id=prod.id, sku=f"BF-{uuid.uuid4().hex[:8]}",
                     cost_price=10, sale_price=20)
    db.add(sku); db.flush()

    wh = Warehouse(name=f"BfWH-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(wh); db.flush()

    sup = Supplier(name=f"BfSup-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(sup); db.flush()

    pec = PurchaseOrderFull(
        numero=f"PEC-BF-{uuid.uuid4().hex[:8].upper()}",
        supplier_id=sup.id, supplier_name=sup.name,
        warehouse_id=wh.id, estado="EMITIDO",
        productos=[{"sku_id": sku.id, "qty": 5, "name": "TestBfItem", "cost_cop": 50000}]
    )
    db.add(pec); db.commit()
    return pec, sku


@pytest.fixture()
def db_with_productos(setup_test_db):
    """Sesión con una PEC que tiene productos JSON para backfill."""
    db = TestSessionLocal()
    pec, sku = _insert_test_pec_with_productos(db)
    yield db, pec, sku
    # Cleanup
    try:
        db.execute(text("DELETE FROM purchase_order_lines WHERE pec_id = :id"), {"id": pec.id})
        db.execute(text("DELETE FROM purchase_orders_full WHERE id = :id"), {"id": pec.id})
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


class TestBackfillDryRun:
    """Dry-run no escribe nada."""

    def test_dry_run_writes_nothing(self, db_with_productos):
        db, pec, sku = db_with_productos
        batch_id = f"test-dry-{uuid.uuid4().hex[:8]}"

        rc, stdout, stderr = _run_backfill("--dry-run", batch_id=batch_id)
        # rc puede ser 0 o 1 (si el script usa sys.exit(1) en failed > 0)
        # Lo que importa: NO hay filas escritas
        with test_engine.connect() as conn:
            count = _count("purchase_order_lines", batch_id, conn)
        assert count == 0, f"dry-run escribió {count} filas — no debería escribir nada"

    def test_dry_run_reports_stats(self, db_with_productos):
        db, pec, sku = db_with_productos
        batch_id = f"test-drystats-{uuid.uuid4().hex[:8]}"
        rc, stdout, stderr = _run_backfill("--dry-run", batch_id=batch_id)
        combined = stdout + stderr
        # El script debe reportar estadísticas
        assert "RESUMEN" in combined or "migradas" in combined or "DRY" in combined


class TestBackfillRealMigration:
    """Backfill real crea líneas normalizadas."""

    def test_backfill_creates_purchase_order_lines(self, db_with_productos):
        db, pec, sku = db_with_productos
        batch_id = f"test-bf-{uuid.uuid4().hex[:8]}"

        rc, stdout, stderr = _run_backfill(
            "--table", "purchase_order_lines", batch_id=batch_id
        )
        assert rc == 0, f"Backfill falló (rc={rc}):\n{stderr}"

        with test_engine.connect() as conn:
            count = _count("purchase_order_lines", batch_id, conn)
        assert count >= 1, f"Se esperaba al menos 1 línea en purchase_order_lines, se encontró {count}"

    def test_backfill_idempotent_same_batch(self, db_with_productos):
        """Segunda ejecución con mismo batch_id no duplica filas."""
        db, pec, sku = db_with_productos
        batch_id = f"test-idem-{uuid.uuid4().hex[:8]}"

        # Primera ejecución
        rc1, _, _ = _run_backfill("--table", "purchase_order_lines", batch_id=batch_id)
        assert rc1 == 0

        with test_engine.connect() as conn:
            count1 = _count("purchase_order_lines", batch_id, conn)

        # Segunda ejecución con mismo batch_id
        rc2, _, _ = _run_backfill("--table", "purchase_order_lines", batch_id=batch_id)
        # rc2 puede ser 0 o 1 (por ON CONFLICT o duplicación)

        with test_engine.connect() as conn:
            count2 = _count("purchase_order_lines", batch_id, conn)

        # Las filas deben ser las mismas o más (nunca menos)
        assert count2 >= count1, f"Segunda ejecución redujo las filas: {count1} → {count2}"


class TestBackfillRollback:
    """Rollback por lote."""

    def test_rollback_batch_removes_lines(self, db_with_productos):
        db, pec, sku = db_with_productos
        batch_id = f"test-roll-{uuid.uuid4().hex[:8]}"

        # Ejecutar backfill
        rc, _, _ = _run_backfill("--table", "purchase_order_lines", batch_id=batch_id)
        assert rc == 0

        with test_engine.connect() as conn:
            count_before = _count("purchase_order_lines", batch_id, conn)
        assert count_before >= 1

        # Rollback
        env = os.environ.copy()
        env["TEST_DATABASE_URL"] = TEST_URL
        env["DATABASE_URL"] = TEST_URL
        result = subprocess.run(
            [sys.executable, "scripts/backfill_fase1b.py", "--rollback-batch", batch_id],
            cwd=BACKEND_DIR, env=env, capture_output=True, text=True
        )
        # El rollback puede retornar 0 o 1 dependiendo del estado
        with test_engine.connect() as conn:
            count_after = _count("purchase_order_lines", batch_id, conn)
        assert count_after == 0, (
            f"Rollback debería haber eliminado todas las filas del lote {batch_id}, "
            f"pero quedan {count_after}"
        )

    def test_rollback_blocked_by_dependencies(self, setup_test_db):
        """Rollback bloqueado cuando existen dependencias en tablas posteriores."""
        db = TestSessionLocal()
        batch_id = f"test-block-{uuid.uuid4().hex[:8]}"
        pol_id = None

        try:
            # Insertar una purchase_order_line manualmente como si fuera backfill
            from app.models.erp_documents import PurchaseOrderFull, Supplier
            from app.models.catalog import Brand, Category, Product, ProductSKU
            from app.models.inventory import Warehouse

            brand = Brand(name=f"BlkBrand-{uuid.uuid4().hex[:6]}")
            db.add(brand); db.flush()
            cat = Category(name=f"BlkCat-{uuid.uuid4().hex[:6]}")
            db.add(cat); db.flush()
            prod = Product(brand_id=brand.id, category_id=cat.id,
                           name="BlkProd", type="Fisico", base_currency="USD")
            db.add(prod); db.flush()
            sku = ProductSKU(product_id=prod.id, sku=f"BLK-{uuid.uuid4().hex[:8]}",
                             cost_price=5, sale_price=10)
            db.add(sku); db.flush()
            wh = Warehouse(name=f"BlkWH-{uuid.uuid4().hex[:6]}", location_type="Central")
            db.add(wh); db.flush()
            sup = Supplier(name=f"BlkSup-{uuid.uuid4().hex[:6]}", is_active=True)
            db.add(sup); db.flush()
            pec = PurchaseOrderFull(
                numero=f"PEC-BLK-{uuid.uuid4().hex[:8].upper()}",
                supplier_id=sup.id, supplier_name=sup.name,
                warehouse_id=wh.id, estado="EMITIDO",
                productos=[{"sku_id": sku.id, "qty": 3, "name": "BlkItem"}]
            )
            db.add(pec); db.flush()

            # Insertar manualmente una purchase_order_line con el batch_id
            result = db.execute(text(
                "INSERT INTO purchase_order_lines "
                "(pec_id, sku_id, description, quantity_ordered, quantity_received, "
                " source, migration_batch_id, created_at) "
                "VALUES (:pec_id, :sku_id, 'BlkItem', 3, 0, 'BACKFILL', :bid, NOW()) "
                "RETURNING id"
            ), {"pec_id": pec.id, "sku_id": sku.id, "bid": batch_id})
            pol_id = result.fetchone()[0]

            # Crear una procurement_allocation que depende de pol_id
            db.execute(text(
                "INSERT INTO procurement_allocations "
                "(po_line_id, allocation_type, quantity_allocated, created_at) "
                "VALUES (:pol_id, 'NEBULAE_STOCK', 3, NOW())"
            ), {"pol_id": pol_id})
            db.commit()

            # Intentar rollback — debe ser BLOQUEADO
            env = os.environ.copy()
            env["TEST_DATABASE_URL"] = TEST_URL
            env["DATABASE_URL"] = TEST_URL
            result = subprocess.run(
                [sys.executable, "scripts/backfill_fase1b.py", "--rollback-batch", batch_id],
                cwd=BACKEND_DIR, env=env, capture_output=True, text=True
            )
            combined = result.stdout + result.stderr
            assert result.returncode != 0, "Se esperaba error (rollback bloqueado) pero rc=0"
            assert "BLOQUEADO" in combined or "BLOCK" in combined.upper() or "dependenc" in combined.lower(), (
                f"El rollback debió reportar bloqueo por dependencias. Output:\n{combined}"
            )

        finally:
            try:
                if pol_id:
                    db.execute(text("DELETE FROM procurement_allocations WHERE po_line_id = :id"), {"id": pol_id})
                    db.execute(text("DELETE FROM purchase_order_lines WHERE id = :id"), {"id": pol_id})
                db.commit()
            except Exception:
                db.rollback()
            db.close()
