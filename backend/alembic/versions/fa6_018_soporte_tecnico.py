"""
fa6_018 - Campos de Soporte Tecnico en customer_requests

Soporte Tecnico tiene su propio flujo de estados (estado_soporte),
independiente del estado ligado a Cotizacion, porque no siempre
termina en una venta.

Revision ID: fa6_018
Revises: fa6_017
Create Date: 2026-09-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_018"
down_revision: Union[str, Sequence[str], None] = "fa6_017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    for ddl in [
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS tipo_problema VARCHAR(50)",
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS descripcion_problema TEXT",
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS urgencia VARCHAR(20)",
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS evidencia_descripcion TEXT",
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS asignado_a_user_id INTEGER REFERENCES users(id)",
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS estado_soporte VARCHAR(20)",
    ]:
        conn.execute(sa.text(ddl))


def downgrade() -> None:
    conn = op.get_bind()
    for col in ["estado_soporte", "asignado_a_user_id", "evidencia_descripcion", "urgencia", "descripcion_problema", "tipo_problema"]:
        conn.execute(sa.text(f"ALTER TABLE customer_requests DROP COLUMN IF EXISTS {col}"))
