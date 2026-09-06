"""fa4_002 - Hardening Fase 4: Idempotencia, Reversiones y Constraints

Revision ID: fa4_002
Revises: fa4_001
Create Date: 2026-09-05 20:15:00.000000

Cambios:
1. inventory_reservations:
   - Columna idempotency_key VARCHAR(150) con indice unico para eliminar busquedas con ILIKE.
2. sale_packing_items:
   - Check constraint chk_pack_item_vqty_le_qty (verified_quantity <= quantity).
3. sale_order_returns:
   - Check constraint chk_return_refund_amt (refund_amount >= 0).
4. sale_order_payments:
   - Indice unico parcial uq_sop_reversed_payment para garantizar que un pago solo se revierta una sola vez.
5. sale_orders:
   - Columna tax_cop NUMERIC(14, 2) para desglose consistente de subtotal + tax = total.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fa4_002'
down_revision: Union[str, None] = 'fa4_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. idempotency_key en inventory_reservations
    op.add_column('inventory_reservations', sa.Column('idempotency_key', sa.String(150), nullable=True))
    op.create_index('ix_inv_res_idempotency_key', 'inventory_reservations', ['idempotency_key'], unique=True)

    # 2. Check constraint en sale_packing_items (verified_quantity <= quantity)
    op.create_check_constraint(
        'chk_pack_item_vqty_le_qty',
        'sale_packing_items',
        'verified_quantity <= quantity'
    )

    # 3. Check constraint en sale_order_returns (refund_amount >= 0)
    op.create_check_constraint(
        'chk_return_refund_amt',
        'sale_order_returns',
        'refund_amount >= 0'
    )

    # 4. Partial unique index en sale_order_payments (reversed_payment_id)
    op.execute(
        "CREATE UNIQUE INDEX uq_sop_reversed_payment ON sale_order_payments (reversed_payment_id) "
        "WHERE reversed_payment_id IS NOT NULL AND tipo = 'REVERSION' AND estado != 'ANULADO';"
    )

    # 5. Columna tax_cop en sale_orders
    op.add_column('sale_orders', sa.Column('tax_cop', sa.Numeric(14, 2), nullable=False, server_default='0.00'))


def downgrade() -> None:
    # 5. Drop tax_cop
    op.drop_column('sale_orders', 'tax_cop')

    # 4. Drop partial unique index
    op.execute("DROP INDEX IF EXISTS uq_sop_reversed_payment;")

    # 3. Drop check constraint refund_amount
    op.drop_constraint('chk_return_refund_amt', 'sale_order_returns', type_='check')

    # 2. Drop check constraint verified_quantity
    op.drop_constraint('chk_pack_item_vqty_le_qty', 'sale_packing_items', type_='check')

    # 1. Drop index y columna idempotency_key
    op.drop_index('ix_inv_res_idempotency_key', table_name='inventory_reservations')
    op.drop_column('inventory_reservations', 'idempotency_key')
