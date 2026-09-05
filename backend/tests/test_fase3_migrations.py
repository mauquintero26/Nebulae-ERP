"""
test_fase3_migrations.py — Integridad de Migraciones fa3_001, fa3_002 y Seguridad (Fase 3 Hardening).

Escenarios cubiertos:
1. Verificación de existencia de tabla inventory_quarantine y sus columnas en erp_test.
2. Verificación de columnas añadidas en fa3_001 y fa3_002 (owner, NUMERIC(10,2), constraints).
3. Auditoría estática de seguridad:
   - fa3_001 y fa3_002 NO deben contener GRANTs dirigidos a nebulae_test ni modificar permisos de producción.
4. Ciclo de vida de migración (Roundtrip downgrade -> upgrade):
   - Downgrade seguro a fa2_003 / fa3_001.
   - Upgrade seguro a head (fa3_002).
5. Verificación de que erpdb (producción) permanece inalterado en fa1a_002.
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
        cols_quar = db.execute(text("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'inventory_quarantine'
            ORDER BY ordinal_position
        """)).fetchall()
        assert len(cols_quar) > 0, "Tabla inventory_quarantine no existe en erp_test"
        col_names = [c[0] for c in cols_quar]
        for expected in ["id", "sku_id", "warehouse_id", "gr_line_id", "quantity", "reason", "status", "notes", "created_at", "owner"]:
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

    def test_fa3_002_owner_constraints_and_numeric_precision(self, db):
        """Verifica la columna owner, check constraints y precisión decimal de fa3_002."""
        # 1. Check constraints en inventory_quarantine
        constraints = db.execute(text("""
            SELECT conname, pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conrelid = 'inventory_quarantine'::regclass
        """)).fetchall()
        c_defs = [str(c[1]) for c in constraints]
        has_owner_check = any("owner" in d and "NEBULAE" in d and "MAU" in d for d in c_defs)
        assert has_owner_check, f"Falta check constraint chk_quarantine_owner: {c_defs}"

        # 2. Precisión NUMERIC(10, 2) en inventory_levels
        lvl_type = db.execute(text("""
            SELECT data_type, numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE table_name = 'inventory_levels' AND column_name = 'quantity'
        """)).fetchone()
        assert lvl_type[0] == "numeric" and lvl_type[1] == 10 and lvl_type[2] == 2

        # 3. Precisión NUMERIC(10, 2) en inventory_movements
        mv_type = db.execute(text("""
            SELECT data_type, numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE table_name = 'inventory_movements' AND column_name = 'quantity'
        """)).fetchone()
        assert mv_type[0] == "numeric" and mv_type[1] == 10 and mv_type[2] == 2

    def test_fa3_static_audit_no_test_role_grants(self):
        """Auditoría estática: fa3_001 y fa3_002 no deben contener GRANTs hacia nebulae_test."""
        for mig_name in ["fa3_001_recepciones_inventario.py", "fa3_002_cuarentena_owner_hardening.py"]:
            mig_file = _BACKEND / "alembic" / "versions" / mig_name
            assert mig_file.exists(), f"Archivo de migración no encontrado en {mig_file}"
            code = mig_file.read_text(encoding="utf-8")
            assert "nebulae_test" not in code, f"VIOLACIÓN DE SEGURIDAD: {mig_name} contiene 'nebulae_test'"
            assert "grant all" not in code.lower(), f"VIOLACIÓN DE SEGURIDAD: {mig_name} contiene 'GRANT ALL'"

    def test_fa3_roundtrip_downgrade_upgrade(self):
        """Verifica que fa3 pueda hacer downgrade a fa2_003 y volver a head (fa3_002) limpiamente en erp_test."""
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

        # Verificar version fa2_003
        eng = create_engine(TEST_URL)
        with eng.connect() as conn:
            v_down = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert v_down == "fa2_003"

        # 2. Upgrade a head (fa3_002)
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
            assert v_up == "fa3_002"

    def test_erpdb_produccion_permanece_inalterada(self):
        """Verifica que la base de datos de producción erpdb no ha sido modificada y sigue en fa1a_002."""
        eng_prod = create_engine(PROD_URL)
        with eng_prod.connect() as conn:
            prod_v = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert prod_v == "fa1a_002", f"ALERTA: erpdb fue alterada y tiene versión {prod_v}"
