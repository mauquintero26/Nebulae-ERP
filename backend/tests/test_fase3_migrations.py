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
        """
        Prueba exhaustivamente el ciclo de migraciones y reversibilidad:
        upgrade head -> downgrade fa3_001 -> downgrade fa2_003 -> upgrade head.
        Verifica tipos de datos, longitud, nulabilidad, constraints, índices y ausencia de huérfanos.
        """
        env = os.environ.copy()
        env["DATABASE_URL"] = TEST_URL
        eng = create_engine(TEST_URL)

        # 1. Asegurar estado inicial en head (fa3_002)
        up_init = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=str(_BACKEND), env=env, capture_output=True, text=True
        )
        assert up_init.returncode == 0, f"Error en upgrade inicial head: {up_init.stderr}"

        # 2. Downgrade intermedio a fa3_001
        down_fa3_001 = subprocess.run(
            [sys.executable, "-m", "alembic", "downgrade", "fa3_001"],
            cwd=str(_BACKEND), env=env, capture_output=True, text=True
        )
        assert down_fa3_001.returncode == 0, f"Error en downgrade a fa3_001: {down_fa3_001.stderr}"

        with eng.connect() as conn:
            v_001 = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert v_001 == "fa3_001", f"Versión esperada fa3_001, obtenida {v_001}"

            # inventory_quarantine existe pero NO tiene columna owner
            quar_cols = [r[0] for r in conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'inventory_quarantine'"
            )).fetchall()]
            assert len(quar_cols) > 0, "inventory_quarantine debe existir en fa3_001"
            assert "owner" not in quar_cols, "owner debe haber sido eliminado en downgrade de fa3_002"

            # Check constraint de owner no debe existir
            chk_owner = conn.execute(text(
                "SELECT conname FROM pg_constraint WHERE conname = 'chk_quarantine_owner'"
            )).scalar()
            assert chk_owner is None, "chk_quarantine_owner debe haber sido eliminado"

            # Índice ix_quarantine_lookup no debe existir
            idx_quar_lookup = conn.execute(text(
                "SELECT indexname FROM pg_indexes WHERE indexname = 'ix_quarantine_lookup'"
            )).scalar()
            assert idx_quar_lookup is None, "ix_quarantine_lookup no debe quedar como índice huérfano"

            # Columnas quantity en inventory_levels e inventory_movements deben ser integer
            lvl_qty_type = conn.execute(text(
                "SELECT data_type FROM information_schema.columns WHERE table_name = 'inventory_levels' AND column_name = 'quantity'"
            )).scalar()
            assert lvl_qty_type == "integer", f"inventory_levels.quantity debe ser integer en fa3_001, got {lvl_qty_type}"

            mv_qty_type = conn.execute(text(
                "SELECT data_type FROM information_schema.columns WHERE table_name = 'inventory_movements' AND column_name = 'quantity'"
            )).scalar()
            assert mv_qty_type == "integer", f"inventory_movements.quantity debe ser integer en fa3_001, got {mv_qty_type}"

        # 3. Downgrade profundo a fa2_003
        down_fa2_003 = subprocess.run(
            [sys.executable, "-m", "alembic", "downgrade", "fa2_003"],
            cwd=str(_BACKEND), env=env, capture_output=True, text=True
        )
        assert down_fa2_003.returncode == 0, f"Error en downgrade a fa2_003: {down_fa2_003.stderr}"

        with eng.connect() as conn:
            v_003 = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert v_003 == "fa2_003", f"Versión esperada fa2_003, obtenida {v_003}"

            # inventory_quarantine tabla NO debe existir
            quar_table_exists = conn.execute(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_quarantine')"
            )).scalar()
            assert not quar_table_exists, "inventory_quarantine debe haber sido eliminada en fa2_003"

            # inventory_movements.direction debe ser VARCHAR(10)
            dir_meta = conn.execute(text(
                "SELECT data_type, character_maximum_length FROM information_schema.columns "
                "WHERE table_name = 'inventory_movements' AND column_name = 'direction'"
            )).fetchone()
            assert dir_meta[0] == "character varying" and dir_meta[1] == 10, f"direction debe ser VARCHAR(10), got {dir_meta}"

            # Columnas agregadas en fa3_001 NO deben existir en inventory_movements
            im_cols = [r[0] for r in conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'inventory_movements'"
            )).fetchall()]
            assert "warehouse_id" not in im_cols, "warehouse_id debe haber sido eliminado de inventory_movements"
            assert "created_by" not in im_cols, "created_by debe haber sido eliminado de inventory_movements"

            # Columnas agregadas en goods_receipts NO deben existir
            gr_cols = [r[0] for r in conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'goods_receipts'"
            )).fetchall()]
            assert "shipment_id" not in gr_cols, "shipment_id no debe existir en goods_receipts en fa2_003"
            assert "reception_stage" not in gr_cols, "reception_stage no debe existir en goods_receipts en fa2_003"

            # Columnas agregadas en goods_receipt_lines NO deben existir
            grl_cols = [r[0] for r in conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'goods_receipt_lines'"
            )).fetchall()]
            for c_del in ["quantity_missing", "quantity_excess", "status", "notes", "damaged_reason"]:
                assert c_del not in grl_cols, f"{c_del} no debe existir en goods_receipt_lines en fa2_003"

            # Cero índices huérfanos de Fase 3
            for idx_name in [
                "ix_inv_quarantine_sku_status", "ix_inv_quarantine_wh_status", "ix_quarantine_lookup",
                "ix_inv_mov_sku_created", "ix_inv_mov_wh_created", "ix_goods_receipts_shipment_id", "ix_grl_gr_status"
            ]:
                idx_present = conn.execute(text(
                    "SELECT 1 FROM pg_indexes WHERE indexname = :name"
                ), {"name": idx_name}).scalar()
                assert not idx_present, f"Índice huérfano detectado tras downgrade: {idx_name}"

        # 4. Upgrade de vuelta a head (fa3_002)
        up_head = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=str(_BACKEND), env=env, capture_output=True, text=True
        )
        assert up_head.returncode == 0, f"Error en upgrade final a head: {up_head.stderr}"

        with eng.connect() as conn:
            v_final = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert v_final == "fa3_002", f"Versión final esperada fa3_002, obtenida {v_final}"

            # Comparar tipo de dato, longitud, nulabilidad de columnas principales
            col_info = conn.execute(text("""
                SELECT table_name, column_name, data_type, character_maximum_length, numeric_precision, numeric_scale, is_nullable
                FROM information_schema.columns
                WHERE table_name IN ('inventory_quarantine', 'inventory_levels', 'inventory_movements')
                ORDER BY table_name, column_name
            """)).mappings().all()

            col_map = {(r["table_name"], r["column_name"]): r for r in col_info}

            # inventory_quarantine.owner
            owner_col = col_map.get(("inventory_quarantine", "owner"))
            assert owner_col is not None, "owner debe existir en inventory_quarantine"
            assert owner_col["data_type"] == "character varying"
            assert owner_col["character_maximum_length"] == 20
            assert owner_col["is_nullable"] == "NO"

            # inventory_levels.quantity
            lvl_col = col_map.get(("inventory_levels", "quantity"))
            assert lvl_col is not None
            assert lvl_col["data_type"] == "numeric" and lvl_col["numeric_precision"] == 10 and lvl_col["numeric_scale"] == 2

            # inventory_movements.quantity
            mv_col = col_map.get(("inventory_movements", "quantity"))
            assert mv_col is not None
            assert mv_col["data_type"] == "numeric" and mv_col["numeric_precision"] == 10 and mv_col["numeric_scale"] == 2

            # inventory_movements.direction
            dir_col = col_map.get(("inventory_movements", "direction"))
            assert dir_col is not None
            assert dir_col["data_type"] == "character varying" and dir_col["character_maximum_length"] == 30

            # Constraints e índices restaurados
            chk = conn.execute(text("SELECT conname FROM pg_constraint WHERE conname = 'chk_quarantine_owner'")).scalar()
            assert chk == "chk_quarantine_owner"

            idx_lookup = conn.execute(text("SELECT indexname FROM pg_indexes WHERE indexname = 'ix_quarantine_lookup'")).scalar()
            assert idx_lookup == "ix_quarantine_lookup"

    def test_erpdb_produccion_permanece_inalterada(self):
        """Verifica que la base de datos de producción erpdb no ha sido modificada y sigue en fa1a_002."""
        eng_prod = create_engine(PROD_URL)
        with eng_prod.connect() as conn:
            prod_v = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert prod_v == "fa1a_002", f"ALERTA: erpdb fue alterada y tiene versión {prod_v}"
