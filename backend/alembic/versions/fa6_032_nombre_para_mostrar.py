"""Nombre para mostrar del usuario (Bloque 3, T20b: decision del usuario en la revision visual).

Solo aditiva (R11): una columna nula; ninguna fila existente cambia y nada se calcula hacia atras.
- users.nombre_para_mostrar VARCHAR(80) NULL: como vera el cliente a su asesor en los documentos (la pagina publica de
  la SC, la COT y el pedido, 'Que sigue', pedir cambios y el PDF). Lo llena la Administracion con PATCH
  /auth/users/{id}/nombre-para-mostrar (solo ADMIN; regla en app/core/nombre_para_mostrar.py). NULL = sin nombre: el
  cliente ve la regla de siempre sobre advisor_name o 'Tu asesor' (documento_cliente.asesor_publico).

Revision ID: fa6_032
Revises: fa6_031
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa6_032"
down_revision: Union[str, Sequence[str], None] = "fa6_031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLA = "users"
_COLUMNA = "nombre_para_mostrar"


def upgrade() -> None:
    op.add_column(_TABLA, sa.Column(_COLUMNA, sa.String(length=80), nullable=True))


def downgrade() -> None:
    # Se niega ANTES de tocar nada si algun usuario tiene nombre para mostrar (como fa6_024 a fa6_031): bajar de version
    # borraria lo que escribio la Administracion. R11: en los ambientes compartidos nunca se baja.
    con_datos = op.get_bind().execute(sa.text(
        f"SELECT count(*) FROM {_TABLA} WHERE {_COLUMNA} IS NOT NULL")).scalar()
    if con_datos:
        raise RuntimeError(
            f"No se puede bajar de fa6_032: hay {con_datos} usuarios con nombre para mostrar. Bajar de version "
            "borraria esos nombres: respaldarlos antes.")
    op.drop_column(_TABLA, _COLUMNA)
