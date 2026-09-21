"""
fa6_016 - Asesor de Solicitud como referencia real a usuarios

Reemplaza el texto libre de advisor_name por una referencia real,
manteniendo advisor_name como copia de solo lectura para no romper
pantallas que ya lo muestran como texto.

Revision ID: fa6_016
Revises: fa6_013
Create Date: 2026-09-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_016"
down_revision: Union[str, Sequence[str], None] = "fa6_013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS advisor_user_id INTEGER REFERENCES users(id)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE customer_requests DROP COLUMN IF EXISTS advisor_user_id"))
