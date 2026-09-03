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
    with op.batch_alter_table("goods_receipts") as batch_op:
        batch_op.add_column(sa.Column("idempotency_key", sa.String(150), nullable=True, unique=True))
        batch_op.add_column(sa.Column("receipt_type", sa.String(20), nullable=True, server_default="FISICA"))
        # FISICA = incrementa stock vendible en Barranquilla
        # LOGISTICA = llegada en Miami/Bogota, no incrementa stock vendible
        batch_op.add_column(sa.Column("confirmed_by", sa.String(150), nullable=True))
        batch_op.add_column(sa.Column("confirmed_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("idempotency_request_id", sa.Integer(), nullable=True))

    # Add FK separately to avoid circular issues in batch mode
    op.create_index("ix_gr_idempotency_key", "goods_receipts", ["idempotency_key"])

    # InventoryOperation: add source document columns for deduplication
    with op.batch_alter_table("inventory_operations") as batch_op:
        batch_op.add_column(sa.Column("source_document_type", sa.String(20), nullable=True))
        # ENINV | AJUSTE | TRANSFERENCIA
        batch_op.add_column(sa.Column("source_document_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("source_document_numero", sa.String(30), nullable=True))

    # Unique constraint: one operation per source document (prevents double-stock on retry)
    op.create_index(
        "uq_inv_op_source_doc",
        "inventory_operations",
        ["source_document_type", "source_document_id"],
        unique=True,
    )

    # InventoryMovement: add idempotency_key per movement
    with op.batch_alter_table("inventory_movements") as batch_op:
        batch_op.add_column(sa.Column("idempotency_key", sa.String(150), nullable=True))
        batch_op.add_column(sa.Column("direction", sa.String(10), nullable=True))
        # IN | OUT | ADJUST
        batch_op.add_column(sa.Column("owner", sa.String(20), nullable=True, server_default="NEBULAE"))
        # NEBULAE | MAU
        batch_op.add_column(sa.Column("unit_cost_cop", sa.Numeric(14, 2), nullable=True))

    op.create_index("ix_inv_mov_idempotency_key", "inventory_movements", ["idempotency_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_inv_mov_idempotency_key", table_name="inventory_movements")
    with op.batch_alter_table("inventory_movements") as batch_op:
        batch_op.drop_column("unit_cost_cop")
        batch_op.drop_column("owner")
        batch_op.drop_column("direction")
        batch_op.drop_column("idempotency_key")

    op.drop_index("uq_inv_op_source_doc", table_name="inventory_operations")
    with op.batch_alter_table("inventory_operations") as batch_op:
        batch_op.drop_column("source_document_numero")
        batch_op.drop_column("source_document_id")
        batch_op.drop_column("source_document_type")

    op.drop_index("ix_gr_idempotency_key", table_name="goods_receipts")
    with op.batch_alter_table("goods_receipts") as batch_op:
        batch_op.drop_column("idempotency_request_id")
        batch_op.drop_column("confirmed_at")
        batch_op.drop_column("confirmed_by")
        batch_op.drop_column("receipt_type")
        batch_op.drop_column("idempotency_key")