"""
fa6_015 - Columnas de seguimiento para migracion de catalogo legacy

legacy_ecommerce_product_id permite que el script de migracion sea
idempotente (sabe que fila de ecommerce_products ya se migro).
necesita_revision marca productos migrados cuyas variantes libres no
se pudieron traducir automaticamente a atributos reales.

Revision ID: fa6_015
Revises: fa6_014
Create Date: 2026-09-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_015"
down_revision: Union[str, Sequence[str], None] = "fa6_014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS legacy_ecommerce_product_id INTEGER UNIQUE"
    ))
    conn.execute(sa.text(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS necesita_revision BOOLEAN NOT NULL DEFAULT false"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_products_legacy_id ON products(legacy_ecommerce_product_id)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_products_legacy_id"))
    conn.execute(sa.text("ALTER TABLE products DROP COLUMN IF EXISTS necesita_revision"))
    conn.execute(sa.text("ALTER TABLE products DROP COLUMN IF EXISTS legacy_ecommerce_product_id"))
