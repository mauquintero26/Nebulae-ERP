"""fa_web2b1_001 - ecommerce_products SKU link, purchasable, availability fields

Revision ID: fa_web2b1_001
Revises: fa6_004
Create Date: 2026-09-10

Contexto:
  ecommerce_products es una tabla fuera del ORM (creada por _ensure_ecommerce_tables).
  Esta migración agrega los 5 campos necesarios para vincular cada producto del catálogo
  público con un ProductSKU canónico del ERP, declarar si es comprable, y registrar
  la fuente de disponibilidad.

Campos nuevos:
  sku_id                  INTEGER  NULL  FK → product_skus(id) ON DELETE SET NULL
  purchasable             BOOLEAN  NOT NULL  DEFAULT FALSE
  requires_configuration  BOOLEAN  NOT NULL  DEFAULT FALSE
  availability_source     VARCHAR(20)  NOT NULL  DEFAULT 'MANUAL'
  modalidad               VARCHAR(30)  NOT NULL  DEFAULT 'POR_PEDIDO'

Idempotencia:
  Usa _column_exists() para no fallar si la columna ya fue creada por
  _ensure_ecommerce_tables() en un entorno donde la tabla ya existe.

Downgrade:
  Elimina los 5 campos. Seguro solo sobre erp_storefront_test.
  NUNCA ejecutar downgrade sobre erpdb.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = "fa_web2b1_001"
down_revision = "fa6_004"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    """Retorna True si la columna ya existe en information_schema.columns (schema public)."""
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


def _table_exists(table_name: str) -> bool:
    """Retorna True si la tabla existe en information_schema.tables (schema public)."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = :t"
        ),
        {"t": table_name},
    ).scalar()
    return result is not None


def upgrade() -> None:
    # ecommerce_products puede no existir todavía si la migración corre antes que
    # _ensure_ecommerce_tables(). Creamos la tabla mínima si no existe, luego
    # agregamos los campos nuevos.
    if not _table_exists("ecommerce_products"):
        op.execute(sa.text("""
            CREATE TABLE ecommerce_products (
                id                   SERIAL PRIMARY KEY,
                nombre               VARCHAR(500) NOT NULL,
                descripcion          TEXT,
                descripcion_larga    TEXT,
                sku                  VARCHAR(100),
                precio_venta         NUMERIC(14,2) DEFAULT 0,
                precio_comparacion   NUMERIC(14,2) DEFAULT 0,
                descuento_pct        NUMERIC(5,2) DEFAULT 0,
                impuesto_pct         NUMERIC(5,2) DEFAULT 0,
                categoria            VARCHAR(200),
                sub_categoria        VARCHAR(200),
                marca                VARCHAR(200),
                tipo_producto        VARCHAR(50) DEFAULT 'Bienes',
                imagenes             JSONB DEFAULT '[]',
                atributos            JSONB DEFAULT '[]',
                variantes            JSONB DEFAULT '[]',
                stock_disponible     INTEGER DEFAULT 0,
                alerta_stock_minimo  INTEGER DEFAULT 5,
                publicado_web        BOOLEAN DEFAULT FALSE,
                rastrear_inventario  BOOLEAN DEFAULT TRUE,
                codigo_aduana        VARCHAR(100),
                peso_kg              NUMERIC(8,2),
                notas_internas       TEXT,
                seo_titulo           VARCHAR(300),
                seo_descripcion      TEXT,
                seo_keywords         TEXT,
                created_at           TIMESTAMP DEFAULT NOW(),
                updated_at           TIMESTAMP DEFAULT NOW(),
                created_by           VARCHAR(150)
            )
        """))

    # ── sku_id: FK al ProductSKU canónico del ERP ────────────────────────────
    if not _column_exists("ecommerce_products", "sku_id"):
        op.add_column(
            "ecommerce_products",
            sa.Column("sku_id", sa.Integer(), sa.ForeignKey("product_skus.id", ondelete="SET NULL"), nullable=True),
        )

    # ── purchasable: solo TRUE si tiene sku_id válido y activo ───────────────
    if not _column_exists("ecommerce_products", "purchasable"):
        op.add_column(
            "ecommerce_products",
            sa.Column("purchasable", sa.Boolean(), nullable=False, server_default="false"),
        )

    # ── requires_configuration: productos legacy sin vínculo canónico ─────────
    if not _column_exists("ecommerce_products", "requires_configuration"):
        op.add_column(
            "ecommerce_products",
            sa.Column("requires_configuration", sa.Boolean(), nullable=False, server_default="false"),
        )

    # ── availability_source: REAL | MANUAL | UNCONFIRMED ─────────────────────
    if not _column_exists("ecommerce_products", "availability_source"):
        op.add_column(
            "ecommerce_products",
            sa.Column("availability_source", sa.String(20), nullable=False, server_default="MANUAL"),
        )

    # ── modalidad: política comercial del producto ────────────────────────────
    if not _column_exists("ecommerce_products", "modalidad"):
        op.add_column(
            "ecommerce_products",
            sa.Column("modalidad", sa.String(30), nullable=False, server_default="POR_PEDIDO"),
        )


def downgrade() -> None:
    # ADVERTENCIA: Solo ejecutar sobre erp_storefront_test. NUNCA sobre erpdb.
    op.drop_column("ecommerce_products", "modalidad")
    op.drop_column("ecommerce_products", "availability_source")
    op.drop_column("ecommerce_products", "requires_configuration")
    op.drop_column("ecommerce_products", "purchasable")
    op.drop_column("ecommerce_products", "sku_id")
