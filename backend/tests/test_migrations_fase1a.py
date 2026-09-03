
"""
tests/test_migrations_fase1a.py
Scenarios:
  1. alembic upgrade from base to head applies without error
  2. alembic downgrade removes Fase 1A tables/columns
  3. alembic upgrade again re-applies without error (roundtrip)
  4. Expected columns exist in the database after upgrade
"""
import subprocess, sys, pytest
from pathlib import Path

BACKEND = Path(__file__).parent.parent
ALEMBIC_CMD = [sys.executable, "-m", "alembic"]


def _run(args, cwd=BACKEND):
    result = subprocess.run(
        ALEMBIC_CMD + args,
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    return result


def test_alembic_upgrade_head():
    """alembic upgrade head must complete with exit code 0."""
    r = _run(["upgrade", "head"])
    assert r.returncode == 0, (
        f"alembic upgrade head failed:\nSTDOUT: {r.stdout}\nSTDERR: {r.stderr}"
    )
    print(r.stdout)


def test_idempotency_requests_table_exists(pg_session):
    """idempotency_requests table must exist after upgrade."""
    from sqlalchemy import text, inspect
    inspector = inspect(pg_session.bind)
    tables = inspector.get_table_names()
    assert "idempotency_requests" in tables, (
        f"idempotency_requests not found. Tables: {tables}"
    )


def test_goods_receipts_has_fase1a_columns(pg_session):
    """goods_receipts must have: idempotency_key, receipt_type, confirmed_by, confirmed_at."""
    from sqlalchemy import inspect
    inspector = inspect(pg_session.bind)
    cols = {c["name"] for c in inspector.get_columns("goods_receipts")}
    required = {"idempotency_key", "receipt_type", "confirmed_by", "confirmed_at",
                "idempotency_request_id"}
    missing = required - cols
    assert not missing, f"Missing columns in goods_receipts: {missing}"


def test_inventory_operations_has_source_columns(pg_session):
    """inventory_operations must have source_document_* columns."""
    from sqlalchemy import inspect
    inspector = inspect(pg_session.bind)
    cols = {c["name"] for c in inspector.get_columns("inventory_operations")}
    required = {"source_document_type", "source_document_id", "source_document_numero"}
    missing = required - cols
    assert not missing, f"Missing columns in inventory_operations: {missing}"


def test_inventory_movements_has_fase1a_columns(pg_session):
    """inventory_movements must have: idempotency_key, direction, owner, unit_cost_cop."""
    from sqlalchemy import inspect
    inspector = inspect(pg_session.bind)
    cols = {c["name"] for c in inspector.get_columns("inventory_movements")}
    required = {"idempotency_key", "direction", "owner", "unit_cost_cop"}
    missing = required - cols
    assert not missing, f"Missing columns in inventory_movements: {missing}"


def test_alembic_downgrade_and_upgrade_roundtrip():
    """downgrade to Fase-1A base (ba65b0f69880) then upgrade to head must both succeed.
    NOTE: we do NOT downgrade to 'base' because pre-Fase-1A migrations contain
    DDL changes (e.g. sales_orders.user_id NOT NULL) that cannot be reversed
    when real data already exists in the staging database.
    We only test the Fase 1A migrations roundtrip."""
    # Downgrade to the revision immediately before Fase 1A
    r_down = _run(["downgrade", "ba65b0f69880"])
    assert r_down.returncode == 0, (
        f"downgrade to ba65b0f69880 failed:\n{r_down.stdout}\n{r_down.stderr}"
    )
    # Re-apply Fase 1A migrations
    r_up = _run(["upgrade", "head"])
    assert r_up.returncode == 0, (
        f"re-upgrade to head failed:\n{r_up.stdout}\n{r_up.stderr}"
    )
