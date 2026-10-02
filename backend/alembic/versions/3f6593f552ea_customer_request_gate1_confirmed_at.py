"""customer_request_gate1_confirmed_at

Revision ID: 3f6593f552ea
Revises: 9608f1dda5d7
Create Date: 2026-10-02 09:31:58.097013

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3f6593f552ea'
down_revision: Union[str, Sequence[str], None] = '9608f1dda5d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('customer_requests', sa.Column('gate1_confirmed_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('customer_requests', 'gate1_confirmed_at')
