"""
fa1b_003 - Balances por propietario y reservas de inventario

Crea: inventory_owner_balances, inventory_reservations

Revision ID: fa1b_003
Revises: fa1b_002
Create Date: 2026-09-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa1b_003"
down_revision: Union[str, Sequence[str], None] = "fa1b_002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # inventory_owner_balances
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS inventory_owner_balances (
            id           SERIAL PRIMARY KEY,
            sku_id       INTEGER NOT NULL REFERENCES product_skus(id),
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
            owner        VARCHAR(20) NOT NULL,
            quantity     NUMERIC(10,2) NOT NULL DEFAULT 0,
            updated_at   TIMESTAMP,
            CONSTRAINT uq_inv_owner_bal UNIQUE (sku_id, warehouse_id, owner)
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_iob_sku_wh ON inventory_owner_balances(sku_id, warehouse_id)"
    ))

    # inventory_reservations
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS inventory_reservations (
            id                  SERIAL PRIMARY KEY,
            sku_id              INTEGER NOT NULL REFERENCES product_skus(id),
            warehouse_id        INTEGER NOT NULL REFERENCES warehouses(id),
            owner               VARCHAR(20) NOT NULL DEFAULT 'NEBULAE',
            quantity_reserved   NUMERIC(10,2) NOT NULL,
            sale_order_line_id  INTEGER REFERENCES sale_order_lines_erp(id) ON DELETE SET NULL,
            status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
            expires_at          TIMESTAMP,
            created_at          TIMESTAMP,
            released_at         TIMESTAMP,
            converted_at        TIMESTAMP,
            created_by          VARCHAR(150),
            notes               TEXT
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_inv_res_sku_wh_status "
        "ON inventory_reservations(sku_id, warehouse_id, status)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_inv_res_expires "
        "ON inventory_reservations(expires_at) WHERE status = 'ACTIVE'"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS inventory_reservations CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS inventory_owner_balances CASCADE"))
