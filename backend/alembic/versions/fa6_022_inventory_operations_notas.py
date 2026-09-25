"""
fa6_022 - notas en inventory_operations

Bug reportado: Traslados y Ajustes (frontend) envian 'notas'/'motivo' al crear
un /inventory/operations, pero InventoryOperation nunca tuvo esa columna --
Pydantic descarta silenciosamente cualquier campo no declarado en el schema,
asi que el motivo que el usuario escribe nunca se guarda en ningun lado.

Revision ID: fa6_022
Revises: fa6_021
Create Date: 2026-09-25
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_022"
down_revision: Union[str, Sequence[str], None] = "fa6_021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE inventory_operations ADD COLUMN IF NOT EXISTS notas TEXT"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE inventory_operations DROP COLUMN IF EXISTS notas"
    ))
