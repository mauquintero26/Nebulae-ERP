"""Indice de sale_orders(sc_id) (Bloque 4.1, A5).

Solo aditiva: un indice, ninguna fila cambia. Porque: sc_con_documentos_activos y pven_vigente_de_sc buscan los pedidos de
venta de una solicitud por sc_id, y sin indice recorrian sale_orders completa (Seq Scan). Medido en A5: la pagina tardaba
272 ms, y 360 ms con la columna = No Resuelto, con unas 4.500 filas. El nombre es el que la convencion de SQLAlchemy da a
SaleOrder.sc_id (index=True), para que modelo y base coincidan.

Revision ID: fa6_034
Revises: fa6_033
"""
from typing import Sequence, Union

from alembic import op


revision: str = "fa6_034"
down_revision: Union[str, Sequence[str], None] = "fa6_033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_sale_orders_sc_id", "sale_orders", ["sc_id"])


def downgrade() -> None:
    op.drop_index("ix_sale_orders_sc_id", table_name="sale_orders")
