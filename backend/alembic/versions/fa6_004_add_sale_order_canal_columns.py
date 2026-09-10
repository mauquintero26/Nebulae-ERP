"""fa6_004 - add canal_venta, pweb_numero, canal_metadata to sale_orders

Revision ID: fa6_004
Revises: fa6_003
Create Date: 2026-09-09

Contexto:
  Las columnas canal_venta, pweb_numero y canal_metadata estaban definidas
  en el ORM (app/models/erp_documents.py L124-126) pero NUNCA formalizadas
  via Alembic. En la staging erp_staging_20260908_132152 existian como
  ALTER TABLE manuales. Esta migracion las registra canonicamente.

  Esquema verificado contra staging:
    canal_venta:    VARCHAR(30)  NULLABLE, DEFAULT 'CRM'::character varying
    pweb_numero:    VARCHAR(25)  NULLABLE, DEFAULT NULL
    canal_metadata: JSONB        NULLABLE, DEFAULT NULL

  Idempotencia: usa chequeo en information_schema para que el upgrade
  sea seguro si la columna ya existe (ej: staging previa con ALTER TABLE).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "fa6_004"
down_revision = "fa6_003"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    """Retorna True si la columna ya existe en la tabla."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' "
            "AND table_name = :t AND column_name = :c"
        ),
        {"t": table_name, "c": column_name},
    ).scalar()
    return result is not None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # sale_orders.canal_venta -- VARCHAR(30) NULLABLE DEFAULT 'CRM'
    # ------------------------------------------------------------------
    if not _column_exists("sale_orders", "canal_venta"):
        op.add_column(
            "sale_orders",
            sa.Column(
                "canal_venta",
                sa.String(30),
                nullable=True,
                server_default="CRM",
            ),
        )

    # ------------------------------------------------------------------
    # sale_orders.pweb_numero -- VARCHAR(25) NULLABLE
    # ------------------------------------------------------------------
    if not _column_exists("sale_orders", "pweb_numero"):
        op.add_column(
            "sale_orders",
            sa.Column(
                "pweb_numero",
                sa.String(25),
                nullable=True,
            ),
        )

    # ------------------------------------------------------------------
    # sale_orders.canal_metadata -- JSONB NULLABLE
    # ------------------------------------------------------------------
    if not _column_exists("sale_orders", "canal_metadata"):
        op.add_column(
            "sale_orders",
            sa.Column(
                "canal_metadata",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=True,
            ),
        )


def downgrade() -> None:
    # Eliminar en orden inverso
    op.drop_column("sale_orders", "canal_metadata")
    op.drop_column("sale_orders", "pweb_numero")
    op.drop_column("sale_orders", "canal_venta")