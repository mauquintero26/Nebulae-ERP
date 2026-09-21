"""
fa6_013 - Agrega columnas faltantes en customer_requests (cancelacion y papelera)

El commit 98abe8b (2026-09-12) agrego razon_cancelacion y eliminada_at al
modelo ORM CustomerRequest (app/models/erp_documents.py) para soportar
cancelar una solicitud y la papelera (soft-delete), pero nunca se creo la
migracion correspondiente. Esto rompe /ventas/solicitudes/{id}/cancelar,
/ventas/solicitudes/{id}/permanente, /ventas/solicitudes/{id}/restaurar y
cualquier listado de customer_requests (500 Internal Server Error por
columna inexistente), incluyendo en produccion si nunca se aplico ahi.

Revision ID: fa6_013
Revises: fa6_012
Create Date: 2026-09-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_013"
down_revision: Union[str, Sequence[str], None] = "fa6_012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS razon_cancelacion TEXT"
    ))
    conn.execute(sa.text(
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS eliminada_at TIMESTAMP"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE customer_requests DROP COLUMN IF EXISTS eliminada_at"
    ))
    conn.execute(sa.text(
        "ALTER TABLE customer_requests DROP COLUMN IF EXISTS razon_cancelacion"
    ))
