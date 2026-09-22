"""
fa6_020 - Merge de heads: Catalogo Configurable (fa6_015) y Solicitud/Cotizacion/CRM (fa6_019)

Ambas ramas se desarrollaron en paralelo, cada una partiendo de fa6_013 con
su propia cadena de migraciones (fa6_013 -> fa6_014 -> fa6_015 para Catalogo
Configurable; fa6_013 -> fa6_016 -> fa6_017 -> fa6_018 -> fa6_019 para
Solicitud/Cotizacion/CRM). Al fusionar ambas ramas en main, Alembic queda
con dos heads simultaneos. Esta migracion no cambia ningun esquema —
unicamente reconcilia el grafo de migraciones en un solo head (mismo patron
ya usado en fa6_012 con TD-03/TD-05).

Revision ID: fa6_020
Revises: fa6_015, fa6_019
Create Date: 2026-09-22
"""
from typing import Sequence, Union

revision: str = "fa6_020"
down_revision: Union[str, Sequence[str], None] = ("fa6_015", "fa6_019")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
