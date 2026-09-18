"""
fa6_010 - TD-03 (Parte 1): tabla product_web_listings

Hogar canonico para los campos de marketing/SEO que hoy solo existen en
la tabla raw-SQL ecommerce_products (imagenes, descripcion larga, SEO,
descuentos, etc.). Paso previo al cutover de lectura (Parte 2) y al
apagado de ecommerce_products (Parte 3) -- ver
docs/audit/2026-09-17-fase-c-investigacion.md seccion 3.

Crea: product_web_listings

Revision ID: fa6_010
Revises: fa6_004
Create Date: 2026-09-17
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_010"
down_revision: Union[str, Sequence[str], None] = "fa6_004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "product_web_listings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sku_id", sa.Integer(), sa.ForeignKey("product_skus.id", ondelete="CASCADE"), nullable=False),
        sa.Column("descripcion_larga", sa.Text(), nullable=True),
        sa.Column("precio_comparacion", sa.Numeric(14, 2), nullable=True),
        sa.Column("descuento_pct", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("imagenes", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("seo_titulo", sa.String(300), nullable=True),
        sa.Column("seo_descripcion", sa.Text(), nullable=True),
        sa.Column("seo_keywords", sa.Text(), nullable=True),
        sa.Column("codigo_aduana", sa.String(100), nullable=True),
        sa.Column("peso_kg", sa.Numeric(8, 2), nullable=True),
        sa.Column("notas_internas", sa.Text(), nullable=True),
        sa.Column("publicado_web", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("rastrear_inventario", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_pwl_sku_id", "product_web_listings", ["sku_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_pwl_sku_id", table_name="product_web_listings")
    op.drop_table("product_web_listings")
