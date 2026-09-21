"""
fa6_012 - Merge de heads: TD-03 (fa6_011) y TD-05 (fa6_005)

TD-03 y TD-05 se desarrollaron en ramas independientes, cada una partiendo
de fa6_004 con su propia cadena de migraciones (fa6_004 -> fa6_010 -> fa6_011
para TD-03; fa6_004 -> fa6_005 para TD-05). Al fusionar ambas ramas en main,
Alembic queda con dos heads simultaneos. Esta migracion no cambia ningun
esquema — unicamente reconcilia el grafo de migraciones en un solo head.

Revision ID: fa6_012
Revises: fa6_005, fa6_011
Create Date: 2026-09-21
"""
from typing import Sequence, Union

revision: str = "fa6_012"
down_revision: Union[str, Sequence[str], None] = ("fa6_005", "fa6_011")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
