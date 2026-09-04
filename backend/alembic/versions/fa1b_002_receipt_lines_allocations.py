"""
fa1b_002 - Lineas de recepcion y distribucion

Crea: goods_receipt_lines, goods_receipt_line_allocations

Revision ID: fa1b_002
Revises: fa1b_001
Create Date: 2026-09-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa1b_002"
down_revision: Union[str, Sequence[str], None] = "fa1b_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # goods_receipt_lines
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS goods_receipt_lines (
            id                   SERIAL PRIMARY KEY,
            gr_id                INTEGER NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
            po_line_id           INTEGER REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
            sku_id               INTEGER REFERENCES product_skus(id) ON DELETE SET NULL,
            description          VARCHAR(300),
            quantity_expected    NUMERIC(10,2) NOT NULL DEFAULT 0,
            quantity_received    NUMERIC(10,2) NOT NULL DEFAULT 0,
            quantity_rejected    NUMERIC(10,2) NOT NULL DEFAULT 0,
            quantity_quarantine  NUMERIC(10,2) NOT NULL DEFAULT 0,
            unit_cost_cop        NUMERIC(14,2),
            receipt_type         VARCHAR(20) NOT NULL DEFAULT 'FISICA',
            source               VARCHAR(20) NOT NULL DEFAULT 'NATIVE',
            migration_batch_id   VARCHAR(50),
            created_at           TIMESTAMP
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_grl_gr_id ON goods_receipt_lines(gr_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_grl_batch ON goods_receipt_lines(migration_batch_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_grl_pol ON goods_receipt_lines(po_line_id)"
    ))

    # goods_receipt_line_allocations
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS goods_receipt_line_allocations (
            id                SERIAL PRIMARY KEY,
            gr_line_id        INTEGER NOT NULL REFERENCES goods_receipt_lines(id) ON DELETE CASCADE,
            allocation_id     INTEGER NOT NULL REFERENCES procurement_allocations(id) ON DELETE CASCADE,
            quantity_applied  NUMERIC(10,2) NOT NULL DEFAULT 0,
            created_at        TIMESTAMP,
            CONSTRAINT uq_grla_grline_alloc UNIQUE (gr_line_id, allocation_id)
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_grla_gr_line ON goods_receipt_line_allocations(gr_line_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_grla_alloc ON goods_receipt_line_allocations(allocation_id)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS goods_receipt_line_allocations CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS goods_receipt_lines CASCADE"))
