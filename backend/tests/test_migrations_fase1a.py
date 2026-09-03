"""
tests/test_migrations_fase1a.py
Scenarios:
  1. alembic upgrade from base to head applies without error
  2. alembic downgrade removes Fase 1A tables/columns
  3. alembic upgrade again re-applies without error (roundtrip)
  4. Expected columns exist in the database after upgrade
"""
import subprocess, sys, os, pytest
from pathlib import Path

BACKEND = Path(__file__).parent.parent


def _run(args, cwd=BACKEND):
    env = os.environ.copy()
    # Ensure alembic runs against the test DB, not production
    test_url = os.environ.get("TEST_DATABASE_URL", "")
    if test_url:
        env["DATABASE_URL"] = test_url
    result = subprocess.run(
        [sys.executable, "-m", "alembic"] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
        env=env,
    )
    return result


def test_alembic_upgrade_head():
    """alembic upgrade head must complete with exit code 0."""
    r = _run(["upgrade", "head"])
    assert r.returncode == 0, (
        f"alembic upgrade head failed:\nSTDOUT: {r.stdout}\nSTDERR: {r.stderr}"
    )
    print(r.stdout)


def test_idempotency_requests_table_exists(db):
    """idempotency_requests table must exist after upgrade."""
    from sqlalchemy import text
    tables = [row[0] for row in db.execute(text(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"
    ))]
    assert "idempotency_requests" in tables, (
        f"idempotency_requests not found. Tables: {tables}"
    )


def test_goods_receipts_has_fase1a_columns(db):
    """goods_receipts must have: idempotency_key, receipt_type, confirmed_by, confirmed_at."""
    from sqlalchemy import text
    cols = {row[0] for row in db.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name='goods_receipts'"
    ))}
    required = {"idempotency_key", "receipt_type", "confirmed_by", "confirmed_at",
                "idempotency_request_id"}
    missing = required - cols
    assert not missing, f"Missing columns in goods_receipts: {missing}"


def test_inventory_operations_has_source_columns(db):
    """inventory_operations must have source_document_* columns."""
    from sqlalchemy import text
    cols = {row[0] for row in db.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name='inventory_operations'"
    ))}
    required = {"source_document_type", "source_document_id", "source_document_numero"}
    missing = required - cols
    assert not missing, f"Missing columns in inventory_operations: {missing}"


def test_inventory_movements_has_fase1a_columns(db):
    """inventory_movements must have: idempotency_key, direction, owner, unit_cost_cop."""
    from sqlalchemy import text
    cols = {row[0] for row in db.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name='inventory_movements'"
    ))}
    required = {"idempotency_key", "direction", "owner", "unit_cost_cop"}
    missing = required - cols
    assert not missing, f"Missing columns in inventory_movements: {missing}"


def test_alembic_downgrade_and_upgrade_roundtrip():
    """downgrade to Fase-1A base (ba65b0f69880) then upgrade to head must both succeed."""
    r_down = _run(["downgrade", "ba65b0f69880"])
    assert r_down.returncode == 0, (
        f"downgrade to ba65b0f69880 failed:\n{r_down.stdout}\n{r_down.stderr}"
    )
    r_up = _run(["upgrade", "head"])
    assert r_up.returncode == 0, (
        f"re-upgrade to head failed:\n{r_up.stdout}\n{r_up.stderr}"
    )
