"""
test_fase3_migrations.py — Integridad de Migración fa3_001 y Seguridad (Fase 3).

Escenarios cubiertos:
1. Verificación de existencia de tabla inventory_quarantine y sus columnas y tipos en erp_test.
2. Verificación de columnas añadidas a goods_receipts, goods_receipt_lines e inventory_movements.
3. Auditoría estática de seguridad:
   - fa3_001_recepciones_inventario.py NO debe contener GRANTs dirigidos a nebulae_test
     ni modificar permisos de producción.
4. Ciclo de vida de migración (Roundtrip downgrade -> upgrade):
   - Downgrade seguro a fa2_003.
   - Upgrade seguro a head (fa3_001).
   - Verificación de que erpdb (producción) permanece inalterado en fa1a_002.
"""
import os
import sys
import subprocess
import pathlib
import pytest
from sqlalchemy import create_engine, text

from tests.conftest import TEST_URL, PROD_URL, _BACKEND


class TestFase3Migrations:

    def test_fa3_001_tablas_y_columnas_creadas(self, db):
        """Verifica la existencia física de la tabla inventory_quarantine y nuevas columnas."""
        # 1. Tabla inventory_quarantine
        cols_quar = db.execute(text("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'inventory_quarantine'
            ORDER BY ordinal_position
        """)).fetchall()
        assert len(cols_quar) > 0, "Tabla inventory_quarantine no existe en erp_test"
        col_names = [c[0] for c in cols_quar]
        for expected in ["id", "sku_id", "warehouse_id", "gr_line_id", "quantity", "reason", "status", "notes", "created_at"]:
            assert expected in col_names, f"Columna {expected} no encontrada en inventory_quarantine"

        # 2. Nuevas columnas en goods_receipts
        cols_gr = db.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'goods_receipts' AND column_name IN ('shipment_id', 'reception_stage')
        """)).fetchall()
        gr_col_names = [c[0] for c in cols_gr]
        assert "shipment_id" in gr_col_names
        assert "reception_stage" in gr_col_names

        # 3. Nuevas columnas en goods_receipt_lines
        cols_grl = db.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'goods_receipt_lines' AND column_name IN ('quantity_missing', 'quantity_excess', 'status', 'notes', 'damaged_reason')
        """)).fetchall()
        grl_col_names = [c[0] for c in cols_grl]
        assert "quantity_missing" in grl_col_names
        assert "quantity_excess" in grl_col_names
        assert "status" in grl_col_names
        assert "notes" in grl_col_names
        assert "damaged_reason" in grl_col_names

        # 4. Nuevas columnas en inventory_movements
        cols_im = db.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'inventory_movements' AND column_name IN ('warehouse_id', 'created_at', 'created_by')
        """)).fetchall()
        im_col_names = [c[0] for c in cols_im]
        assert "warehouse_id" in im_col_names
        assert "created_at" in im_col_names
        assert "created_by" in im_col_names

    def test_fa3_001_check_constraints_and_indexes(self, db):
        """Verifica que las restricciones CHECK para cantidad y estado existan en inventory_quarantine."""
        constraints = db.execute(text("""
            SELECT conname, pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conrelid = 'inventory_quarantine'::regclass
        """)).fetchall()
        c_defs = [str(c[1]) for c in constraints]
        has_qty_check = any("quantity >" in d and "0" in d for d in c_defs)
        has_status_check = any("status" in d for d in c_defs)
        assert has_qty_check, f"Falta check constraint de quantity > 0: {c_defs}"
        assert has_status_check, f"Falta check constraint de status: {c_defs}"

    def test_fa3_001_static_audit_no_test_role_grants(self):
        """Auditoría estática: fa3_001 no debe contener GRANTs hacia nebulae_test."""
        mig_file = _BACKEND / "alembic" / "versions" / "fa3_001_recepciones_inventario.py"
        assert mig_file.exists(), f"Archivo de migración no encontrado en {mig_file}"
        code = mig_file.read_text(encoding="utf-8")
        assert "nebulae_test" not in code, "VIOLACIÓN DE SEGURIDAD: fa3_001 contiene 'nebulae_test'"
        assert "grant all" not in code.lower(), "VIOLACIÓN DE SEGURIDAD: fa3_001 contiene 'GRANT ALL'"

    def test_fa3_001_roundtrip_downgrade_upgrade(self):
        """Verifica que fa3_001 pueda hacer downgrade a fa2_003 y volver a head limpiamente en erp_test."""
        env = os.environ.copy()
        env["DATABASE_URL"] = TEST_URL

        # 1. Downgrade a fa2_003
        down_res = subprocess.run(
            [sys.executable, "-m", "alembic", "downgrade", "fa2_003"],
            cwd=str(_BACKEND),
            env=env,
            capture_output=True,
            text=True
        )
        assert down_res.returncode == 0, f"Error en downgrade fa2_003: {down_res.stderr}"

        # Verificar version
        eng = create_engine(TEST_URL)
        with eng.connect() as conn:
            v_down = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert v_down == "fa2_003"

        # 2. Upgrade a head (fa3_001)
        up_res = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=str(_BACKEND),
            env=env,
            capture_output=True,
            text=True
        )
        assert up_res.returncode == 0, f"Error en upgrade head: {up_res.stderr}"

        with eng.connect() as conn:
            v_up = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert v_up == "fa3_001"

    def test_erpdb_produccion_permanece_inalterada(self):
        """Verifica que la base de datos de producción erpdb no ha sido modificada y sigue en fa1a_002."""
        eng_prod = create_engine(PROD_URL)
        with eng_prod.connect() as conn:
            prod_v = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert prod_v == "fa1a_002", f"ALERTA: erpdb fue alterada y tiene versión {prod_v}"