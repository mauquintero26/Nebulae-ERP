"""Moneda y tiempo de entrega del proveedor (Bloque 4.1, P33).

Solo aditiva: dos columnas NULL en suppliers, sin valor por defecto (nadie recibe una moneda ni unos dias inventados).
- currency: moneda en que el proveedor cotiza (codigo de 3 letras, p. ej. USD).
- lead_time_days: dias que tarda en entregar.
Hoy las dos columnas se guardan y se muestran en la Agenda de proveedores; la compra todavia no las lee.

Revision ID: fa6_035
Revises: fa6_034
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa6_035"
down_revision: Union[str, Sequence[str], None] = "fa6_034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("suppliers", sa.Column("currency", sa.String(3), nullable=True))
    op.add_column("suppliers", sa.Column("lead_time_days", sa.Integer(), nullable=True))


def downgrade() -> None:
    # Se niega ANTES de tocar nada si algun proveedor ya tiene moneda o tiempo de entrega (patron de fa6_033): bajar de
    # version los borraria. R20: en los ambientes compartidos nunca se baja.
    con_datos = op.get_bind().execute(sa.text(
        "SELECT count(*) FROM suppliers WHERE currency IS NOT NULL OR lead_time_days IS NOT NULL")).scalar()
    if con_datos:
        raise RuntimeError(
            f"No se puede bajar de fa6_035: {con_datos} proveedores tienen moneda o tiempo de entrega guardados. "
            "Bajar de version los borraria: respaldarlos antes.")
    op.drop_column("suppliers", "lead_time_days")
    op.drop_column("suppliers", "currency")
