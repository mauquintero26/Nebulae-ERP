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
        sa.Column("id",              sa.Integer(),     primary_key=True),
        sa.Column("operation_type",  sa.String(80),    nullable=False),
        sa.Column("operation_key",   sa.String(150),   nullable=False),
        sa.Column("request_hash",    sa.String(64),    nullable=True),
        sa.Column("execution_token", sa.String(36),    nullable=True),
        # UUID de la ejecucion que inserto el registro.
        # Permite que _mark_failed_external solo sobreescriba su propio registro.
        sa.Column("entity_type",     sa.String(30),    nullable=True),
        sa.Column("entity_id",       sa.Integer(),     nullable=True),
        sa.Column("user_id",         sa.Integer(),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status",          sa.String(20),    nullable=False,
                  server_default="PROCESSING"),
        sa.Column("request_body",    sa.JSON(),        nullable=True),
        sa.Column("response_body",   sa.JSON(),        nullable=True),
        sa.Column("error_detail",    sa.Text(),        nullable=True),
        sa.Column("created_at",      sa.DateTime(),    nullable=True),
        sa.Column("completed_at",    sa.DateTime(),    nullable=True),
        sa.UniqueConstraint(
            "operation_type", "operation_key",
            name="uq_idem_op_type_key"
        ),
    )
    op.create_index(
        "ix_idem_req_entity", "idempotency_requests", ["entity_type", "entity_id"]
    )
    op.create_index(
        "ix_idem_req_status", "idempotency_requests", ["status"]
    )


def downgrade() -> None:
    op.drop_index("ix_idem_req_status",  table_name="idempotency_requests")
    op.drop_index("ix_idem_req_entity",  table_name="idempotency_requests")
    op.drop_table("idempotency_requests")
