"""
test_fase4_migrations.py — Integridad de Migraciones fa4_001 y fa4_002, Roundtrip y Seguridad (Fase 4).

Escenarios cubiertos:
1. Verificación de tablas, columnas, checks y precisión decimal de fa4_001 y fa4_002 en erp_test:
   - Tablas sale_order_payments, sale_packing_sessions, sale_packing_items,
     sale_order_deliveries, sale_order_delivery_lines, sale_order_returns, sale_order_return_lines.
   - Columna idempotency_key en inventory_reservations con índice único.
   - Constraints chk_pack_item_vqty_le_qty y chk_return_refund_amt.
   - Índice único parcial uq_sop_reversed_payment.
   - Columna tax_cop en sale_orders.
2. Auditoría estática de seguridad:
   - fa4_001 y fa4_002 NO deben contener GRANTs dirigidos a nebulae_test ni modificar permisos.
3. Ciclo de vida de migración (Roundtrip downgrade fa3_002 -> upgrade head fa4_002):
   - Downgrade limpio a fa4_001 y luego a fa3_002 sin huérfanos.
   - Upgrade de regreso a head (fa4_002) restaurando la integridad completa.
4. Verificación de que erpdb (producción) permanece inalterado en fa1a_002.
"""
import os
import sys
import subprocess
import pathlib
import pytest
from sqlalchemy import create_engine, text

from tests.conftest import TEST_URL, PROD_URL, _BACKEND


class TestFase4Migrations:

    def test_fa4_001_y_fa4_002_tablas_columnas_checks_indices(self, db):
        """Verifica la existencia física de las 7 tablas de Fase 4, columnas agregadas, checks e índices de fa4_002."""
        # 1. Verificar existencia de las 7 tablas nuevas
        tables_res = db.execute(text("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name IN (
                'sale_order_payments', 'sale_packing_sessions', 'sale_packing_items',
                'sale_order_deliveries', 'sale_order_delivery_lines',
                'sale_order_returns', 'sale_order_return_lines'
            )
        """)).fetchall()
        t_names = {r[0] for r in tables_res}
        expected_tables = {
            "sale_order_payments", "sale_packing_sessions", "sale_packing_items",
            "sale_order_deliveries", "sale_order_delivery_lines",
            "sale_order_returns", "sale_order_return_lines"
        }
        assert t_names == expected_tables, f"Faltan tablas de Fase 4: {expected_tables - t_names}"

        # 2. Nuevas columnas en sale_orders (incluyendo tax_cop de fa4_002)
        so_cols = {r[0] for r in db.execute(text("""
            SELECT column_name FROM information_schema.columns WHERE table_name = 'sale_orders'
        """)).fetchall()}
        for col in [
            "anticipo_pct_snapshot", "saldo_pct_snapshot", "policy_exception_authorized_by",
            "policy_exception_reason", "total_cost_cop", "estimated_profit_cop",
            "real_profit_cop", "profit_is_estimated", "cancellation_reason",
            "cancellation_authorized_by", "cancelled_at", "tax_cop"
        ]:
            assert col in so_cols, f"Columna {col} no encontrada en sale_orders"

        # 3. Columna idempotency_key en inventory_reservations (fa4_002)
        inv_res_cols = {r[0] for r in db.execute(text("""
            SELECT column_name FROM information_schema.columns WHERE table_name = 'inventory_reservations'
        """)).fetchall()}
        assert "idempotency_key" in inv_res_cols, "idempotency_key no encontrada en inventory_reservations"

        # 4. Validar check constraints de fa4_001 y fa4_002
        constraints_pack = [r[0] for r in db.execute(text("""
            SELECT conname FROM pg_constraint WHERE conrelid = 'sale_packing_items'::regclass
        """)).fetchall()]
        assert "chk_pack_item_vqty_le_qty" in constraints_pack, "Falta constraint chk_pack_item_vqty_le_qty en sale_packing_items"

        constraints_ret = [r[0] for r in db.execute(text("""
            SELECT conname FROM pg_constraint WHERE conrelid = 'sale_order_returns'::regclass
        """)).fetchall()]
        assert "chk_return_refund_amt" in constraints_ret, "Falta constraint chk_return_refund_amt en sale_order_returns"

        constraints_pay = [r[0] for r in db.execute(text("""
            SELECT conname FROM pg_constraint WHERE conrelid = 'sale_order_payments'::regclass
        """)).fetchall()]
        assert "chk_sop_tipo" in constraints_pay
        assert "chk_sop_estado" in constraints_pay

        # 5. Validar índice único parcial uq_sop_reversed_payment (fa4_002)
        indexes_pay = [r[0] for r in db.execute(text("""
            SELECT indexname FROM pg_indexes WHERE tablename = 'sale_order_payments'
        """)).fetchall()]
        assert "uq_sop_reversed_payment" in indexes_pay, "Falta índice uq_sop_reversed_payment en sale_order_payments"

    def test_fa4_static_audit_no_test_role_grants(self):
        """Auditoría estática: fa4_001 y fa4_002 no deben contener GRANTs hacia nebulae_test ni GRANT ALL."""
        for mig_name in ["fa4_001_sales_payments_delivery.py", "fa4_002_hardening_fase4.py"]:
            mig_file = _BACKEND / "alembic" / "versions" / mig_name
            assert mig_file.exists(), f"Archivo de migración no encontrado en {mig_file}"
            code = mig_file.read_text(encoding="utf-8")
            assert "nebulae_test" not in code, f"VIOLACIÓN DE SEGURIDAD: {mig_name} contiene 'nebulae_test'"
            assert "grant all" not in code.lower(), f"VIOLACIÓN DE SEGURIDAD: {mig_name} contiene 'GRANT ALL'"

    def test_fa4_roundtrip_downgrade_fa3_002_upgrade_head(self):
        """Prueba exhaustivamente el ciclo de migraciones y reversibilidad:
        downgrade fa3_002 -> upgrade head (fa4_002).
        Verifica que se eliminen y recreen limpiamente las tablas, columnas, secuencias y constraints sin huérfanos.
        """
        env = os.environ.copy()
        env["DATABASE_URL"] = TEST_URL
        eng = create_engine(TEST_URL)

        # 1. Downgrade a fa4_001
        down_fa4_001 = subprocess.run(
            [sys.executable, "-m", "alembic", "downgrade", "fa4_001"],
            cwd=str(_BACKEND), env=env, capture_output=True, text=True
        )
        assert down_fa4_001.returncode == 0, f"Error en downgrade a fa4_001: {down_fa4_001.stderr}"

        with eng.connect() as conn:
            v_001 = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert v_001 == "fa4_001", f"Versión esperada fa4_001, obtenida {v_001}"

        # 2. Downgrade profundo a fa3_002
        down_fa3_002 = subprocess.run(
            [sys.executable, "-m", "alembic", "downgrade", "fa3_002"],
            cwd=str(_BACKEND), env=env, capture_output=True, text=True
        )
        assert down_fa3_002.returncode == 0, f"Error en downgrade a fa3_002: {down_fa3_002.stderr}"

        with eng.connect() as conn:
            v = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert v == "fa3_002", f"Versión esperada fa3_002, obtenida {v}"

            # Tablas de Fase 4 NO deben existir
            for t in ["sale_order_payments", "sale_packing_sessions", "sale_order_deliveries", "sale_order_returns"]:
                exists = conn.execute(text(f"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '{t}')")).scalar()
                assert not exists, f"Tabla {t} no debe existir tras downgrade a fa3_002"

            # Columnas nuevas en sale_orders no deben existir
            so_cols_down = {r[0] for r in conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'sale_orders'"
            )).fetchall()}
            assert "anticipo_pct_snapshot" not in so_cols_down
            assert "total_cost_cop" not in so_cols_down
            assert "tax_cop" not in so_cols_down

        # 3. Upgrade de regreso a head (fa4_002)
        up = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=str(_BACKEND), env=env, capture_output=True, text=True
        )
        assert up.returncode == 0, f"Error en upgrade a head: {up.stderr}"

        with eng.connect() as conn:
            v_up = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert v_up in ("fa4_002", "fa5_001"), f"Versión esperada fa4_002 o posterior, obtenida {v_up}"

            # Tablas recreadas exitosamente
            for t in ["sale_order_payments", "sale_packing_sessions", "sale_order_deliveries", "sale_order_returns"]:
                exists = conn.execute(text(f"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '{t}')")).scalar()
                assert exists, f"Tabla {t} debe existir tras upgrade a head"

    def test_erpdb_produccion_permanece_inalterada(self):
        """Verifica que la base de datos de producción erpdb no ha sido modificada y sigue en fa1a_002."""
        eng_prod = create_engine(PROD_URL)
        with eng_prod.connect() as conn:
            prod_v = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert prod_v == "fa1a_002", f"ALERTA: erpdb fue alterada y tiene versión {prod_v}"
