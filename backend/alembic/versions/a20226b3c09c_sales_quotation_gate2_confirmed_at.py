"""sales_quotation_gate2_confirmed_at

Revision ID: a20226b3c09c
Revises: 3f6593f552ea
Create Date: 2026-10-02 11:15:35.583853

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a20226b3c09c'
down_revision: Union[str, Sequence[str], None] = '3f6593f552ea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('sales_quotations', sa.Column('gate2_confirmed_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('sales_quotations', 'gate2_confirmed_at')
