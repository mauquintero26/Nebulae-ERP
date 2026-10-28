"""Preferencias de pantalla de cada usuario (Bloque 4, T1B: TABLA-base puntos 7 y 8, R4 y R20).

Solo aditiva (R20): una tabla nueva y su UNIQUE; ninguna fila existente cambia y la tabla nace vacia (R25).
- preferencias_usuario: una fila por usuario y clave (UNIQUE user_id + clave). Guarda como deja cada usuario cada
  pantalla (anchos y orden de columnas, 25 o 50 filas, Lista o Kanban, columnas plegadas, flujo compacto y periodo de
  Analisis), para verlo igual en cualquier computador o celular. user_id es FK users ON DELETE CASCADE. La escribe
  app/api/v1/preferencias.py; modelo en app/models/preferencias.py.

Revision ID: fa6_033
Revises: fa6_032
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa6_033"
down_revision: Union[str, Sequence[str], None] = "fa6_032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLA = "preferencias_usuario"
_UNICO = "uq_preferencias_usuario_user_clave"


def upgrade() -> None:
    op.create_table(
        _TABLA,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("clave", sa.String(length=120), nullable=False),
        sa.Column("valor", sa.JSON(), nullable=False),
        # UTC sin zona, como el resto de las fechas (el modelo la pone con utcnow; esto solo cubre un INSERT a mano).
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("(now() AT TIME ZONE 'utc')")),
        sa.UniqueConstraint("user_id", "clave", name=_UNICO),
    )


def downgrade() -> None:
    # Se niega ANTES de tocar nada si hay preferencias (como fa6_024 a fa6_032): bajar de version borraria como dejo cada
    # usuario sus pantallas. R20: en los ambientes compartidos nunca se baja.
    con_datos = op.get_bind().execute(sa.text(f"SELECT count(*) FROM {_TABLA}")).scalar()
    if con_datos:
        raise RuntimeError(
            f"No se puede bajar de fa6_033: hay {con_datos} preferencias de usuario guardadas. Bajar de version "
            "borraria como dejo cada usuario sus pantallas: respaldarlas antes.")
    op.drop_table(_TABLA)
