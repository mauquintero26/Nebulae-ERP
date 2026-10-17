"""IVA total de la cotizacion (Bloque 3, T4: IVA, C24).

Solo aditiva (R11): una columna NOT NULL con server_default '0' en sales_quotations; las filas existentes quedan en 0
(IVA no discriminado) y nada se recalcula hacia atras.
- tax_cop NUMERIC(14,2) NOT NULL DEFAULT 0: el IVA total de la cotizacion (en el API: iva_cop). Mismo nombre y
  significado que sale_orders.tax_cop (fa4_002). Lo calcula el servidor (app/core/iva.calcular_totales_cotizacion)
  cuando todas las lineas traen su tarifa; total_cop ya lo incluye.

Revision ID: fa6_028
Revises: fa6_027
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa6_028"
down_revision: Union[str, Sequence[str], None] = "fa6_027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sales_quotations",
                  sa.Column("tax_cop", sa.Numeric(14, 2), nullable=False, server_default="0"))


def downgrade() -> None:
    # Se niega ANTES de tocar nada si alguna cotizacion tiene IVA (como fa6_025 a fa6_027): bajar de version borraria
    # el IVA calculado y dejaria el total (que lo incluye) sin su desglose. R11: en los ambientes compartidos nunca se
    # baja.
    con_iva = op.get_bind().execute(sa.text("SELECT count(*) FROM sales_quotations WHERE tax_cop <> 0")).scalar()
    if con_iva:
        raise RuntimeError(
            f"No se puede bajar de fa6_028: hay {con_iva} cotizaciones con IVA. Bajar de version borraria ese IVA: "
            "respaldarlo antes.")
    op.drop_column("sales_quotations", "tax_cop")
