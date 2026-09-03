"""
fa1a_001 - idempotency_requests table

Revision ID: fa1a_001
Revises: ba65b0f69880
Create Date: 2026-09-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa1a_001"
down_revision: Union[str, Sequence[str], None] = "ba65b0f69880"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "idempotency_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("operation_key", sa.String(150), nullable=False, unique=True),
        sa.Column("operation_type", sa.String(80), nullable=False),
        sa.Column("entity_type", sa.String(30), nullable=True),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="PROCESSING"),
        # PROCESSING | DONE | FAILED
        sa.Column("request_body", sa.JSON(), nullable=True),
        sa.Column("response_body", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_idem_req_operation_key", "idempotency_requests", ["operation_key"])
    op.create_index("ix_idem_req_entity", "idempotency_requests", ["entity_type", "entity_id"])


def downgrade() -> None:
    op.drop_index("ix_idem_req_entity", table_name="idempotency_requests")
    op.drop_index("ix_idem_req_operation_key", table_name="idempotency_requests")
    op.drop_table("idempotency_requests")