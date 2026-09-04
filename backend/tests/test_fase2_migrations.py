"""
test_fase2_migrations.py — Tests de migraciones Alembic Fase 2 (fa2_001 y fa2_002)

Escenarios:
1. Upgrade head: todas las tablas e índices/constraints de Fase 2 existen
2. Downgrade fa2_001: revierte fa2_002 (desaparecen columnas y constraints de hardening)
3. Downgrade fa1b_005: todas las tablas de Fase 2 se eliminan limpiamente
4. Upgrade head de nuevo (roundtrip completo verificado)
"""
import subprocess
import sys
import os
import pathlib
import pytest
from sqlalchemy import text
from tests.conftest import test_engine, TEST_URL

_BACKEND = pathlib.Path(__file__).parent.parent


def _run(cmd_suffix):
    env = os.environ.copy()
    env["DATABASE_URL"] = TEST_URL
    result = subprocess.run(
        [sys.executable, "-m", "alembic"] + cmd_suffix,
        cwd=str(_BACKEND),
        env=env,
        capture_output=True,
        text=True,
    )
    return result.returncode, result.stdout + result.stderr


FA2_TABLES = [
    "logistics_locations",
    "consolidations",
    "shipments",
    "shipment_lines",
    "shipment_events",
    "consolidation_shipments",
]


def _table_exists(conn, table_name):
    row = conn.execute(text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
        "WHERE table_schema='public' AND table_name=:t)"
    ), {"t": table_name}).scalar()
    return bool(row)


def _column_exists(conn, table_name, column_name):
    row = conn.execute(text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name=:t AND column_name=:c)"
    ), {"t": table_name, "c": column_name}).scalar()
    return bool(row)


def _index_exists(conn, index_name):
    row = conn.execute(text(
        "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname=:i)"
    ), {"i": index_name}).scalar()
    return bool(row)


class TestFase2Migrations:

    @pytest.fixture(autouse=True)
    def restore_head(self, setup_test_db):
        yield
        # Asegurar que erp_test quede siempre en head post-test
        code, out = _run(["upgrade", "head"])
        assert code == 0, f"Error restaurando head: {out}"
        # Asegurar permisos a nebulae_test
        with test_engine.connect() as conn:
            conn.execute(text("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nebulae_test;"))
            conn.execute(text("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nebulae_test;"))
            conn.commit()

    def test_all_fa2_tables_and_constraints_exist_after_upgrade(self, setup_test_db):
        code, out = _run(["upgrade", "head"])
        assert code == 0, f"alembic upgrade head falló: {out}"

        with test_engine.connect() as conn:
            for t in FA2_TABLES:
                assert _table_exists(conn, t), f"La tabla '{t}' debería existir tras upgrade"

            # Columnas de fa2_002
            assert _column_exists(conn, "consolidations", "dian_entered_at")
            assert _column_exists(conn, "consolidation_shipments", "is_active")
            assert _column_exists(conn, "shipment_events", "idempotency_key")

            # Índices de fa2_002
            assert _index_exists(conn, "uq_procurement_alloc_identity")
            assert _index_exists(conn, "uq_shipment_line_po_line")
            assert _index_exists(conn, "uq_active_consolidation_shipment")

    def test_downgrade_fa2_002_reverts_hardening(self, setup_test_db):
        _run(["upgrade", "head"])

        # Downgrade a fa2_001
        code, out = _run(["downgrade", "fa2_001"])
        assert code == 0, f"alembic downgrade fa2_001 falló: {out}"

        with test_engine.connect() as conn:
            # Las tablas todavía existen en fa2_001
            for t in FA2_TABLES:
                assert _table_exists(conn, t), f"La tabla '{t}' aún debería existir en fa2_001"

            # Pero las columnas de fa2_002 fueron removidas
            assert not _column_exists(conn, "consolidations", "dian_entered_at")
            assert not _column_exists(conn, "consolidation_shipments", "is_active")
            assert not _index_exists(conn, "uq_active_consolidation_shipment")

    def test_downgrade_fa1b_005_removes_fa2_tables(self, setup_test_db):
        _run(["upgrade", "head"])

        # Downgrade total de Fase 2 hacia fa1b_005
        code, out = _run(["downgrade", "fa1b_005"])
        assert code == 0, f"alembic downgrade fa1b_005 falló: {out}"

        with test_engine.connect() as conn:
            for t in FA2_TABLES:
                assert not _table_exists(conn, t), f"La tabla '{t}' NO debería existir tras downgrade a fa1b_005"

    def test_upgrade_roundtrip(self, setup_test_db):
        # Downgrade completo a fa1b_005
        code_down, out_down = _run(["downgrade", "fa1b_005"])
        assert code_down == 0, f"Downgrade falló: {out_down}"

        # Re-upgrade a head (fa2_002)
        code_up, out_up = _run(["upgrade", "head"])
        assert code_up == 0, f"Re-upgrade falló: {out_up}"

        with test_engine.connect() as conn:
            for t in FA2_TABLES:
                assert _table_exists(conn, t), f"La tabla '{t}' debería existir tras re-upgrade"
            assert _column_exists(conn, "consolidations", "dian_entered_at")
            assert _index_exists(conn, "uq_procurement_alloc_identity")
