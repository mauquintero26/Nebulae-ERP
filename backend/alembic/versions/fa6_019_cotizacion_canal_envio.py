"""
fa6_019 - Canal de envio de la cotizacion al cliente

Revision ID: fa6_019
Revises: fa6_018
Create Date: 2026-09-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_019"
down_revision: Union[str, Sequence[str], None] = "fa6_018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.get_bind().execute(sa.text(
        "ALTER TABLE sales_quotations ADD COLUMN IF NOT EXISTS canal_envio VARCHAR(20)"
    ))


def downgrade() -> None:
    op.get_bind().execute(sa.text("ALTER TABLE sales_quotations DROP COLUMN IF EXISTS canal_envio"))
