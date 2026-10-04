"""Anticipo manual de la cotizacion (R3) y pago trasladado como saldo a favor (R6).

Ventas Bloque 1, Tarea 3. Solo aditiva:
- sales_quotations.anticipo_pct_manual NUMERIC(5,2) NULL: % de anticipo puesto a mano por el asesor. NULL = el
  anticipo sigue la modalidad de pago de la solicitud.
- sales_quotations.anticipo_manual_nota TEXT NULL: nota obligatoria que explica el anticipo manual.
- sale_order_payments.chk_sop_estado admite un valor mas, 'TRASLADADO': el pago de un pedido CANCELADO cuyo
  dinero se traslado como saldo a favor al pedido nuevo de la misma cotizacion. Ninguna fila cambia y los
  valores de antes siguen valiendo; el codigo que suma los pagos CONFIRMADO no cuenta dos veces ese dinero.

Revision ID: fa6_024
Revises: a20226b3c09c
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa6_024"
down_revision: Union[str, Sequence[str], None] = "a20226b3c09c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ESTADOS_ANTES = "('CONFIRMADO', 'REVERTIDO', 'ANULADO')"
_ESTADOS_DESPUES = "('CONFIRMADO', 'REVERTIDO', 'ANULADO', 'TRASLADADO')"


def upgrade() -> None:
    op.add_column("sales_quotations", sa.Column("anticipo_pct_manual", sa.Numeric(5, 2), nullable=True))
    op.add_column("sales_quotations", sa.Column("anticipo_manual_nota", sa.Text(), nullable=True))
    op.drop_constraint("chk_sop_estado", "sale_order_payments", type_="check")
    op.create_check_constraint("chk_sop_estado", "sale_order_payments", f"estado IN {_ESTADOS_DESPUES}")


def downgrade() -> None:
    # Se niega ANTES de tocar nada si ya hay pagos TRASLADADO: no se borra ni se reescribe dinero para bajar de
    # version, y env.py corre en AUTOCOMMIT (alembic/env.py, isolation_level), asi que un DROP seguido de un ADD
    # fallido dejaria la tabla sin CHECK.
    trasladados = op.get_bind().execute(
        sa.text("SELECT count(*) FROM sale_order_payments WHERE estado = 'TRASLADADO'")).scalar()
    if trasladados:
        raise RuntimeError(
            f"No se puede bajar de fa6_024: hay {trasladados} pagos en estado TRASLADADO (saldo a favor trasladado "
            "entre pedidos). El CHECK anterior no los admite; resolverlos a mano antes de bajar de version.")
    op.drop_constraint("chk_sop_estado", "sale_order_payments", type_="check")
    op.create_check_constraint("chk_sop_estado", "sale_order_payments", f"estado IN {_ESTADOS_ANTES}")
    op.drop_column("sales_quotations", "anticipo_manual_nota")
    op.drop_column("sales_quotations", "anticipo_pct_manual")
