"""
fa6_014 - Jerarquia de categorias (categoria padre / subcategoria)

Agrega parent_id a categories para soportar categoria/subcategoria como
el mismo concepto (una subcategoria es una categoria cuyo padre es otra).

Revision ID: fa6_014
Revises: fa6_016
Create Date: 2026-09-21

Nota: down_revision apunta a fa6_016 (no fa6_013) porque la rama hermana
solicitud-cotizacion-crm completo su propia migracion fa6_016 primero
contra la misma base de datos de pruebas compartida. Se reconcilia aqui
para evitar la colision de heads; se documenta en el ledger de este plan.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_014"
down_revision: Union[str, Sequence[str], None] = "fa6_016"
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
