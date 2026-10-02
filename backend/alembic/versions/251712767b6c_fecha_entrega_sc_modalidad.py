"""fecha_entrega_sc_modalidad

Revision ID: 251712767b6c
Revises: fa6_023
Create Date: 2026-10-01 21:03:57.698498

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '251712767b6c'
down_revision: Union[str, Sequence[str], None] = 'fa6_023'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('customer_requests', sa.Column('fecha_entrega_estimada', sa.DateTime(), nullable=True))
    op.add_column('customer_requests', sa.Column('modalidad_entrega', sa.String(length=20), nullable=False, server_default='NORMAL'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('customer_requests', 'modalidad_entrega')
    op.drop_column('customer_requests', 'fecha_entrega_estimada')
