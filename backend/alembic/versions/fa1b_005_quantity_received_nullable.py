"""
fa1b_005 - quantity_received nullable en goods_receipt_lines

NULL = cantidad aun no registrada por el operador
0    = registrada explicitamente en cero (ninguna unidad recibida)

Revision ID: fa1b_005
Revises: fa1b_004
Create Date: 2026-09-04
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa1b_005"
down_revision: Union[str, Sequence[str], None] = "fa1b_004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Hacer quantity_received nullable: NULL = aun no registrada
    op.alter_column(
        "goods_receipt_lines",
        "quantity_received",
        existing_type=sa.Numeric(precision=10, scale=2),
        nullable=True,
        server_default=None,
    )
    # Convertir los ceros en BORRADOR a NULL (representan "no registrado")
    # Las confirmadas conservan 0 como dato historico valido.
    op.execute("""
        UPDATE goods_receipt_lines grl
        SET quantity_received = NULL
        FROM goods_receipts gr
        WHERE grl.gr_id = gr.id
          AND gr.stock_actualizado = false
          AND gr.estado = 'BORRADOR'
          AND grl.quantity_received = 0
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE goods_receipt_lines
        SET quantity_received = 0
        WHERE quantity_received IS NULL
    """)
    op.alter_column(
        "goods_receipt_lines",
        "quantity_received",
        existing_type=sa.Numeric(precision=10, scale=2),
        nullable=False,
        server_default=sa.text("0"),
    )
