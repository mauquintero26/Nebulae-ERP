"""
fa1a_002 - goods_receipts: idempotency_key, receipt_type, confirmed_by, confirmed_at

Revision ID: fa1a_002
Revises: fa1a_001
Create Date: 2026-09-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa1a_002"
down_revision: Union[str, Sequence[str], None] = "fa1a_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # Use ADD COLUMN IF NOT EXISTS (PostgreSQL 9.6+) to make migration idempotent.
    # This allows running upgrade on both a clean DB and one populated via create_all().

    # goods_receipts additions
    for stmt in [
        "ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(150)",
        "ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS receipt_type VARCHAR(20) DEFAULT 'FISICA'",
        "ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS confirmed_by VARCHAR(150)",
        "ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP",
        "ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS idempotency_request_id INTEGER",
    ]:
        conn.execute(sa.text(stmt))

    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_gr_idempotency_key "
        "ON goods_receipts (idempotency_key)"
    ))

    # InventoryOperation additions
    for stmt in [
        "ALTER TABLE inventory_operations ADD COLUMN IF NOT EXISTS source_document_type VARCHAR(20)",
        "ALTER TABLE inventory_operations ADD COLUMN IF NOT EXISTS source_document_id INTEGER",
        "ALTER TABLE inventory_operations ADD COLUMN IF NOT EXISTS source_document_numero VARCHAR(30)",
    ]:
        conn.execute(sa.text(stmt))

    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_op_source_doc "
        "ON inventory_operations (source_document_type, source_document_id)"
    ))

    # InventoryMovement additions
    for stmt in [
        "ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(150)",
        "ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS direction VARCHAR(10)",
        "ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS owner VARCHAR(20) DEFAULT 'NEBULAE'",
        "ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS unit_cost_cop NUMERIC(14, 2)",
    ]:
        conn.execute(sa.text(stmt))

    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_inv_mov_idempotency_key "
        "ON inventory_movements (idempotency_key)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    # Use IF EXISTS for idempotent downgrade
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_inv_mov_idempotency_key"))
    for stmt in [
        "ALTER TABLE inventory_movements DROP COLUMN IF EXISTS unit_cost_cop",
        "ALTER TABLE inventory_movements DROP COLUMN IF EXISTS owner",
        "ALTER TABLE inventory_movements DROP COLUMN IF EXISTS direction",
        "ALTER TABLE inventory_movements DROP COLUMN IF EXISTS idempotency_key",
    ]:
        conn.execute(sa.text(stmt))

    conn.execute(sa.text(
        "ALTER TABLE inventory_operations DROP CONSTRAINT IF EXISTS uq_inv_op_source_doc"
    ))
    # Also drop the bare index in case it exists as a plain index (from create_all)
    conn.execute(sa.text("DROP INDEX IF EXISTS uq_inv_op_source_doc"))
    for stmt in [
        "ALTER TABLE inventory_operations DROP COLUMN IF EXISTS source_document_numero",
        "ALTER TABLE inventory_operations DROP COLUMN IF EXISTS source_document_id",
        "ALTER TABLE inventory_operations DROP COLUMN IF EXISTS source_document_type",
    ]:
        conn.execute(sa.text(stmt))

    conn.execute(sa.text("DROP INDEX IF EXISTS ix_gr_idempotency_key"))
    for stmt in [
        "ALTER TABLE goods_receipts DROP COLUMN IF EXISTS idempotency_request_id",
        "ALTER TABLE goods_receipts DROP COLUMN IF EXISTS confirmed_at",
        "ALTER TABLE goods_receipts DROP COLUMN IF EXISTS confirmed_by",
        "ALTER TABLE goods_receipts DROP COLUMN IF EXISTS receipt_type",
        "ALTER TABLE goods_receipts DROP COLUMN IF EXISTS idempotency_key",
    ]:
        conn.execute(sa.text(stmt))