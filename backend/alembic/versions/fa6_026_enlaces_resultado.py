"""Resultado de cada enlace de confirmacion (Bloque 3, T1: U17-H28, C12 y C24).

Solo aditiva (R11): una columna nula en document_confirmation_tokens; ninguna fila cambia y nada se marca hacia atras.
- resultado VARCHAR(20) NULL: que paso con el enlace. 'CONFIRMADO' (el cliente confirmo por ese enlace), 'CAMBIOS' (pidio
  cambios por ese enlace) o 'REVOCADO' (se anulo: se envio otro, cambio el documento o se confirmo por otro enlace).
  NULL = sin usar, vencido o usado antes de esta version.

Revision ID: fa6_026
Revises: fa6_025
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa6_026"
down_revision: Union[str, Sequence[str], None] = "fa6_025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("document_confirmation_tokens", sa.Column("resultado", sa.String(length=20), nullable=True))


def downgrade() -> None:
    # Se niega ANTES de tocar nada si algun enlace tiene resultado (como fa6_024 y fa6_025): bajar de version borraria lo
    # que el cliente hizo con cada enlace. R11: en los ambientes compartidos nunca se baja.
    con_resultado = op.get_bind().execute(sa.text(
        "SELECT count(*) FROM document_confirmation_tokens WHERE resultado IS NOT NULL")).scalar()
    if con_resultado:
        raise RuntimeError(
            f"No se puede bajar de fa6_026: hay {con_resultado} enlaces de confirmacion con resultado "
            "(CONFIRMADO, CAMBIOS o REVOCADO). Bajar de version borraria ese registro: respaldarlo antes.")
    op.drop_column("document_confirmation_tokens", "resultado")
