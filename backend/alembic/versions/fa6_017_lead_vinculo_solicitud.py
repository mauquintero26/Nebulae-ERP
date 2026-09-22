"""
fa6_017 - Vinculo real entre Lead de CRM (sales_orders) y Solicitud de Cliente

Sin esto no hay forma confiable de saber que Lead corresponde a que
Solicitud — solo coincidian por customer_id y texto libre. Este campo
sigue el mismo patron que canonical_sale_order_id, ya existente.

Revision ID: fa6_017
Revises: fa6_016
Create Date: 2026-09-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_017"
down_revision: Union[str, Sequence[str], None] = "fa6_016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS canonical_customer_request_id INTEGER REFERENCES customer_requests(id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_sales_orders_canonical_cr_id ON sales_orders(canonical_customer_request_id)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_sales_orders_canonical_cr_id"))
    conn.execute(sa.text("ALTER TABLE sales_orders DROP COLUMN IF EXISTS canonical_customer_request_id"))
