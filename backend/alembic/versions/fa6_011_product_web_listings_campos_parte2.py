"""
fa6_011 - TD-03 (Parte 2): campos huerfanos en product_web_listings

Agrega a product_web_listings los 5 campos de ecommerce_products que el
review final de Parte 1 (hallazgo I-3) identifico sin hogar canonico:
impuesto_pct, sub_categoria, variantes, alerta_stock_minimo, created_by.
Paso previo al cutover de lectura -- ver
docs/superpowers/specs/2026-09-19-td03-parte2-cutover-lectura-catalogo-design.md
seccion 4.

Revision ID: fa6_011
Revises: fa6_010
Create Date: 2026-09-19
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_011"
down_revision: Union[str, Sequence[str], None] = "fa6_010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("product_web_listings", sa.Column("impuesto_pct", sa.Numeric(5, 2), nullable=False, server_default="0"))
    op.add_column("product_web_listings", sa.Column("sub_categoria", sa.String(200), nullable=True))
    op.add_column("product_web_listings", sa.Column("variantes", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("product_web_listings", sa.Column("alerta_stock_minimo", sa.Integer(), nullable=False, server_default="5"))
    op.add_column("product_web_listings", sa.Column("created_by", sa.String(150), nullable=True))


def downgrade() -> None:
    op.drop_column("product_web_listings", "created_by")
    op.drop_column("product_web_listings", "alerta_stock_minimo")
    op.drop_column("product_web_listings", "variantes")
    op.drop_column("product_web_listings", "sub_categoria")
    op.drop_column("product_web_listings", "impuesto_pct")
