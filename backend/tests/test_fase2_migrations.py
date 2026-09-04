"""
test_fase2_migrations.py — Tests de migraciones Alembic Fase 2 (fa2_001)

Escenarios:
1. Upgrade head: todas las tablas de Fase 2 existen
2. Downgrade -1: todas las tablas de Fase 2 se eliminan limpiamente
3. Upgrade de nuevo (roundtrip completo)
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


class TestFase2Migrations:

    @pytest.fixture(autouse=True)
    def restore_head(self, setup_test_db):
        yield
        # Asegurar que erp_test quede siempre en head post-test
        code, out = _run(["upgrade", "head"])
        assert code == 0, f"Error restaurando head: {out}"

    def test_all_fa2_tables_exist_after_upgrade(self, setup_test_db):
        code, out = _run(["upgrade", "head"])
        assert code == 0, f"alembic upgrade head falló: {out}"

        with test_engine.connect() as conn:
            for t in FA2_TABLES:
                assert _table_exists(conn, t), f"La tabla '{t}' debería existir tras upgrade"

    def test_downgrade_removes_fa2_tables(self, setup_test_db):
        # Asegurar que estamos en head
        _run(["upgrade", "head"])

        # Downgrade 1 paso (revierte fa2_001 hacia fa1b_005)
        code, out = _run(["downgrade", "-1"])
        assert code == 0, f"alembic downgrade -1 falló: {out}"

        with test_engine.connect() as conn:
            for t in FA2_TABLES:
                assert not _table_exists(conn, t), f"La tabla '{t}' NO debería existir tras downgrade"

    def test_upgrade_roundtrip(self, setup_test_db):
        code_down, out_down = _run(["downgrade", "-1"])
        assert code_down == 0, f"Downgrade falló: {out_down}"

        code_up, out_up = _run(["upgrade", "head"])
        assert code_up == 0, f"Re-upgrade falló: {out_up}"

        with test_engine.connect() as conn:
            for t in FA2_TABLES:
                assert _table_exists(conn, t), f"La tabla '{t}' debería existir tras re-upgrade"
