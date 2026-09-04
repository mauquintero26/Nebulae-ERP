"""
fa1b_004 - Transacciones individuales de pago (auditoria granular)

Crea: payment_transactions

Revision ID: fa1b_004
Revises: fa1b_003
Create Date: 2026-09-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa1b_004"
down_revision: Union[str, Sequence[str], None] = "fa1b_003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS payment_transactions (
            id                SERIAL PRIMARY KEY,
            pxp_id            INTEGER NOT NULL REFERENCES payment_pendings(id) ON DELETE CASCADE,
            sale_order_id     INTEGER REFERENCES sale_orders(id) ON DELETE SET NULL,
            transaction_type  VARCHAR(20) NOT NULL,
            monto             NUMERIC(14,2) NOT NULL,
            moneda            VARCHAR(10) NOT NULL DEFAULT 'COP',
            metodo_pago       VARCHAR(50),
            referencia        VARCHAR(150),
            fecha_pago        DATE NOT NULL,
            user_name         VARCHAR(150),
            notas             TEXT,
            created_at        TIMESTAMP,
            is_reversed       BOOLEAN NOT NULL DEFAULT FALSE,
            reversed_by_id    INTEGER REFERENCES payment_transactions(id) ON DELETE SET NULL
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_pt_pxp_id ON payment_transactions(pxp_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_pt_sale_order ON payment_transactions(sale_order_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_pt_type ON payment_transactions(transaction_type)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_pt_fecha ON payment_transactions(fecha_pago)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS payment_transactions CASCADE"))
