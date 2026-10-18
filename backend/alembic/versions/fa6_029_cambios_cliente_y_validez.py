"""Cambios pedidos por el cliente, nota para el cliente y validez de la cotizacion (Bloque 3, T5: U17-H28, H28-cambios,
U22-validez, R3, C9, C19 y C24).

Solo aditiva (R11): columnas nulas; ninguna fila cambia y nada se calcula hacia atras.
- customer_requests y sales_quotations:
  - cambios_cliente_at TIMESTAMP NULL: cuando el cliente pidio cambios desde su enlace (UTC sin zona). NULL = no hay
    cambios del cliente sin atender (al reenviar el enlace se limpian).
  - cambios_cliente_tipo VARCHAR(20) NULL: 'CAMBIOS' o 'NO_LA_NECESITA' (este ultimo solo en la SC).
  - cambios_cliente_comentario TEXT NULL: lo que escribio el cliente.
  Las escribe POST /confirmar/pedir-cambios (T6); la pagina del cliente las lee (regla g de estado_enlace, T5).
- customer_requests.nota_cliente TEXT NULL: la «Nota para el cliente» de la solicitud (R3). La ve el cliente en la SC,
  la COT y el PVEN; las Notas de siempre (notas) siguen siendo internas.
- sales_quotations.valida_hasta DATE NULL: hasta que dia es valida la cotizacion (U22-validez); el enlace de la COT
  vence al final de ese dia en Colombia. La escribe el envio de la COT (T7). NULL = cotizacion anterior sin validez.

Revision ID: fa6_029
Revises: fa6_028
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa6_029"
down_revision: Union[str, Sequence[str], None] = "fa6_028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CAMBIOS_CLIENTE = ("cambios_cliente_at", "cambios_cliente_tipo", "cambios_cliente_comentario")


def _columnas_de_cambios():
    return [sa.Column("cambios_cliente_at", sa.DateTime(), nullable=True),
            sa.Column("cambios_cliente_tipo", sa.String(length=20), nullable=True),
            sa.Column("cambios_cliente_comentario", sa.Text(), nullable=True)]


def upgrade() -> None:
    for columna in _columnas_de_cambios():
        op.add_column("customer_requests", columna)
    op.add_column("customer_requests", sa.Column("nota_cliente", sa.Text(), nullable=True))
    for columna in _columnas_de_cambios():
        op.add_column("sales_quotations", columna)
    op.add_column("sales_quotations", sa.Column("valida_hasta", sa.Date(), nullable=True))


def downgrade() -> None:
    # Se niega ANTES de tocar nada si alguna fila tiene datos en estas columnas (como fa6_024 a fa6_028): bajar de
    # version borraria lo que pidio el cliente, la nota que ve y la validez de sus cotizaciones. R11: en los ambientes
    # compartidos nunca se baja.
    con_datos = op.get_bind().execute(sa.text(
        "SELECT (SELECT count(*) FROM customer_requests WHERE cambios_cliente_at IS NOT NULL "
        "OR cambios_cliente_tipo IS NOT NULL OR cambios_cliente_comentario IS NOT NULL OR nota_cliente IS NOT NULL) "
        "+ (SELECT count(*) FROM sales_quotations WHERE cambios_cliente_at IS NOT NULL "
        "OR cambios_cliente_tipo IS NOT NULL OR cambios_cliente_comentario IS NOT NULL OR valida_hasta IS NOT NULL)"
    )).scalar()
    if con_datos:
        raise RuntimeError(
            f"No se puede bajar de fa6_029: hay {con_datos} solicitudes o cotizaciones con cambios del cliente, nota "
            "para el cliente o validez. Bajar de version borraria esos datos: respaldarlos antes.")
    op.drop_column("sales_quotations", "valida_hasta")
    for nombre in reversed(_CAMBIOS_CLIENTE):
        op.drop_column("sales_quotations", nombre)
    op.drop_column("customer_requests", "nota_cliente")
    for nombre in reversed(_CAMBIOS_CLIENTE):
        op.drop_column("customer_requests", nombre)
