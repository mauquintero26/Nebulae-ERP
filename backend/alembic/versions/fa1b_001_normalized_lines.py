"""
fa1b_001 - Lineas normalizadas de documentos de venta y compra

Crea: customer_request_lines, sales_quotation_lines,
      sale_order_lines_erp, purchase_order_lines, procurement_allocations

Revision ID: fa1b_001
Revises: fa1a_002
Create Date: 2026-09-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa1b_001"
down_revision: Union[str, Sequence[str], None] = "fa1a_002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # customer_request_lines
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS customer_request_lines (
            id                 SERIAL PRIMARY KEY,
            cr_id              INTEGER NOT NULL REFERENCES customer_requests(id) ON DELETE CASCADE,
            sku_id             INTEGER REFERENCES product_skus(id) ON DELETE SET NULL,
            description        VARCHAR(300),
            quantity           NUMERIC(10,2) NOT NULL DEFAULT 1,
            unit_price_usd     NUMERIC(14,2),
            unit_price_cop     NUMERIC(14,2),
            source             VARCHAR(20) NOT NULL DEFAULT 'NATIVE',
            migration_batch_id VARCHAR(50),
            created_at         TIMESTAMP
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_crl_cr_id ON customer_request_lines(cr_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_crl_batch ON customer_request_lines(migration_batch_id)"
    ))

    # sales_quotation_lines
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS sales_quotation_lines (
            id                 SERIAL PRIMARY KEY,
            sq_id              INTEGER NOT NULL REFERENCES sales_quotations(id) ON DELETE CASCADE,
            sku_id             INTEGER REFERENCES product_skus(id) ON DELETE SET NULL,
            cr_line_id         INTEGER REFERENCES customer_request_lines(id) ON DELETE SET NULL,
            description        VARCHAR(300),
            quantity           NUMERIC(10,2) NOT NULL DEFAULT 1,
            unit_price_usd     NUMERIC(14,2),
            unit_price_cop     NUMERIC(14,2),
            descuento_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
            source             VARCHAR(20) NOT NULL DEFAULT 'NATIVE',
            migration_batch_id VARCHAR(50),
            created_at         TIMESTAMP
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_sql_sq_id ON sales_quotation_lines(sq_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_sql_batch ON sales_quotation_lines(migration_batch_id)"
    ))

    # sale_order_lines_erp
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS sale_order_lines_erp (
            id                 SERIAL PRIMARY KEY,
            so_id              INTEGER NOT NULL REFERENCES sale_orders(id) ON DELETE CASCADE,
            sku_id             INTEGER REFERENCES product_skus(id) ON DELETE SET NULL,
            sq_line_id         INTEGER REFERENCES sales_quotation_lines(id) ON DELETE SET NULL,
            description        VARCHAR(300),
            quantity           NUMERIC(10,2) NOT NULL DEFAULT 1,
            unit_price_cop     NUMERIC(14,2) NOT NULL DEFAULT 0,
            descuento_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
            source             VARCHAR(20) NOT NULL DEFAULT 'NATIVE',
            migration_batch_id VARCHAR(50),
            created_at         TIMESTAMP
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_sole_so_id ON sale_order_lines_erp(so_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_sole_batch ON sale_order_lines_erp(migration_batch_id)"
    ))

    # purchase_order_lines
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS purchase_order_lines (
            id                 SERIAL PRIMARY KEY,
            pec_id             INTEGER NOT NULL REFERENCES purchase_orders_full(id) ON DELETE CASCADE,
            sku_id             INTEGER REFERENCES product_skus(id) ON DELETE SET NULL,
            description        VARCHAR(300),
            quantity_ordered   NUMERIC(10,2) NOT NULL DEFAULT 1,
            unit_cost_usd      NUMERIC(14,2),
            unit_cost_cop      NUMERIC(14,2),
            quantity_received  NUMERIC(10,2) NOT NULL DEFAULT 0,
            source             VARCHAR(20) NOT NULL DEFAULT 'NATIVE',
            migration_batch_id VARCHAR(50),
            created_at         TIMESTAMP
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_pol_pec_id ON purchase_order_lines(pec_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_pol_batch ON purchase_order_lines(migration_batch_id)"
    ))

    # procurement_allocations
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS procurement_allocations (
            id                  SERIAL PRIMARY KEY,
            po_line_id          INTEGER NOT NULL REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
            allocation_type     VARCHAR(20) NOT NULL,
            sale_order_line_id  INTEGER REFERENCES sale_order_lines_erp(id) ON DELETE SET NULL,
            quantity_allocated  NUMERIC(10,2) NOT NULL DEFAULT 0,
            created_at          TIMESTAMP
        )
    """))
    conn.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_proc_alloc_po_sol
        ON procurement_allocations(po_line_id, sale_order_line_id)
        WHERE sale_order_line_id IS NOT NULL
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_pa_po_line ON procurement_allocations(po_line_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_pa_sol_id ON procurement_allocations(sale_order_line_id)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS procurement_allocations CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS purchase_order_lines CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS sale_order_lines_erp CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS sales_quotation_lines CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS customer_request_lines CASCADE"))
