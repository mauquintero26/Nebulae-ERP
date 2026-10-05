"""Cotizacion hecha sin la confirmacion del cliente sobre su solicitud (U11, excepcion auditada a Gate 1).

Ventas Bloque 2, Tarea 3. Solo aditiva (R13): dos columnas nulas en sales_quotations; ninguna fila cambia y nada se
marca hacia atras.
- sin_confirmacion_sc_at TIMESTAMP NULL: cuando se creo la COT por POST /ventas/solicitudes/{id}/cotizar-sin-confirmacion
  (UTC sin zona, como created_at). NULL = la COT se creo por el camino normal.
- sin_confirmacion_sc_motivo TEXT NULL: el motivo obligatorio que escribio el asesor (de 10 a 500 caracteres).

Revision ID: fa6_025
Revises: fa6_024
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa6_025"
down_revision: Union[str, Sequence[str], None] = "fa6_024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sales_quotations", sa.Column("sin_confirmacion_sc_at", sa.DateTime(), nullable=True))
    op.add_column("sales_quotations", sa.Column("sin_confirmacion_sc_motivo", sa.Text(), nullable=True))


def downgrade() -> None:
    # Solo para desarrollo: bajar de version borra el registro de las COT hechas sin confirmacion (R13: en los ambientes
    # compartidos nunca se baja de version).
    op.drop_column("sales_quotations", "sin_confirmacion_sc_motivo")
    op.drop_column("sales_quotations", "sin_confirmacion_sc_at")
