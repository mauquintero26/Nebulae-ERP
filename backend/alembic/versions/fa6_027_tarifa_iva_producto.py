"""Tarifa de IVA de cada producto (Bloque 3, T3: IVA-PRODUCTO, C24).

Solo aditiva (R11): una columna nula en products y un CHECK sobre esa columna nueva; ninguna fila cambia y nada se marca
hacia atras.
- tarifa_iva VARCHAR(10) NULL: '19' | '5' | 'EXENTO' | 'EXCLUIDO' (los codigos de app/core/iva.py). NULL = sin definir:
  la linea usa la tarifa por defecto de Configuracion (admin_config.iva_tarifa_defecto, '19' si falta).
- ck_products_tarifa_iva: tarifa_iva IS NULL o uno de los cuatro codigos.
Nombre nuevo a proposito: la columna vieja products.tax_rate NUMERIC(5,2) (script migrate_erp_v2.py, fuera del modelo y
de alembic) no se toca.

Revision ID: fa6_027
Revises: fa6_026
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa6_027"
down_revision: Union[str, Sequence[str], None] = "fa6_026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("tarifa_iva", sa.String(length=10), nullable=True))
    op.create_check_constraint(
        "ck_products_tarifa_iva",
        "products",
        "tarifa_iva IS NULL OR tarifa_iva IN ('19', '5', 'EXENTO', 'EXCLUIDO')",
    )


def downgrade() -> None:
    # Se niega ANTES de tocar nada si algun producto tiene tarifa (como fa6_025 y fa6_026): bajar de version borraria
    # la tarifa de IVA que alguien eligio en el catalogo. R11: en los ambientes compartidos nunca se baja.
    con_tarifa = op.get_bind().execute(sa.text(
        "SELECT count(*) FROM products WHERE tarifa_iva IS NOT NULL")).scalar()
    if con_tarifa:
        raise RuntimeError(
            f"No se puede bajar de fa6_027: hay {con_tarifa} productos con tarifa de IVA. Bajar de version borraria "
            "esa tarifa: respaldarla antes.")
    op.drop_constraint("ck_products_tarifa_iva", "products", type_="check")
    op.drop_column("products", "tarifa_iva")
