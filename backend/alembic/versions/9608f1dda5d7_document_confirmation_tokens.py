"""document_confirmation_tokens

Revision ID: 9608f1dda5d7
Revises: 251712767b6c
Create Date: 2026-10-01 22:47:28.422168

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9608f1dda5d7'
down_revision: Union[str, Sequence[str], None] = '251712767b6c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('document_confirmation_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('document_type', sa.String(length=10), nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_document_confirmation_tokens_token_hash', 'document_confirmation_tokens', ['token_hash'])
    op.create_index('ix_document_confirmation_tokens_doc', 'document_confirmation_tokens', ['document_type', 'document_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('document_confirmation_tokens')
