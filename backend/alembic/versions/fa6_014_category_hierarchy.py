"""
fa6_014 - Jerarquia de categorias (categoria padre / subcategoria)

Agrega parent_id a categories para soportar categoria/subcategoria como
el mismo concepto (una subcategoria es una categoria cuyo padre es otra).

Revision ID: fa6_014
Revises: fa6_013
Create Date: 2026-09-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_014"
down_revision: Union[str, Sequence[str], None] = "fa6_013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES categories(id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_categories_parent_id ON categories(parent_id)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_categories_parent_id"))
    conn.execute(sa.text("ALTER TABLE categories DROP COLUMN IF EXISTS parent_id"))
