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
    # Se niega ANTES de tocar nada si alguna COT tiene la marca (como fa6_024): bajar de version borraria la auditoria
    # de las cotizaciones hechas sin la confirmacion del cliente. R13: en los ambientes compartidos nunca se baja.
    marcadas = op.get_bind().execute(sa.text(
        "SELECT count(*) FROM sales_quotations "
        "WHERE sin_confirmacion_sc_at IS NOT NULL OR sin_confirmacion_sc_motivo IS NOT NULL")).scalar()
    if marcadas:
        raise RuntimeError(
            f"No se puede bajar de fa6_025: hay {marcadas} cotizaciones creadas sin la confirmacion del cliente "
            "(sin_confirmacion_sc_at / sin_confirmacion_sc_motivo). Bajar de version borraria ese registro: "
            "respaldarlo y resolverlo a mano antes de bajar de version.")
    op.drop_column("sales_quotations", "sin_confirmacion_sc_motivo")
    op.drop_column("sales_quotations", "sin_confirmacion_sc_at")
