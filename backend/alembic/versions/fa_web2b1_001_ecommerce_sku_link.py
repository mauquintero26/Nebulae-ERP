"""fa_web2b1_001 - Esquema canónico ecommerce: tablas runtime + contrato SKU/disponibilidad

Revision ID: fa_web2b1_001
Revises: fa6_004
Create Date: 2026-09-10

PROPÓSITO
=========
Esta migración es la ÚNICA autoridad para el esquema ecommerce. Elimina la necesidad
de _ensure_ecommerce_tables() en el código de aplicación (que nunca debe modificar
esquemas). El usuario runtime nebulae_prod NO debe tener permisos DDL; este script
debe ejecutarse con el usuario propietario de las tablas (DBA o rol migrador).

TABLAS CREADAS / COMPLETADAS
=============================
  web_carts           — carritos de compra web (sin FK)
  web_builder_config  — configuración del site builder (sin FK)
  media_repository    — repositorio de imágenes y archivos (sin FK)
  ecommerce_products  — catálogo público con contrato canónico WEB-2B.1:
                        FK sku_id → product_skus(id)
                        INDEX ix_ep_sku_id
                        CHECK ck_ep_modalidad
                        CHECK ck_ep_availability_source

SECUENCIAS
==========
  seq_ven y seq_pweb ya fueron creadas en fa5_002. No se tocan aquí.

CONTRATO WEB-2B.1
=================
  sku_id                  INTEGER NULL FK → product_skus(id) ON DELETE SET NULL
  purchasable             BOOLEAN NOT NULL DEFAULT false
  requires_configuration  BOOLEAN NOT NULL DEFAULT false
  availability_source     VARCHAR(20) NOT NULL DEFAULT 'MANUAL'
                          CHECK IN ('REAL','MANUAL','UNCONFIRMED')
  modalidad               VARCHAR(30) NOT NULL DEFAULT 'POR_PEDIDO'
                          CHECK IN ('ENTREGA_INMEDIATA','POR_PEDIDO','DISPONIBILIDAD_POR_CONFIRMAR')

LEGACY SIN VÍNCULO
==================
  Productos legacy sin sku_id: purchasable=false, requires_configuration=true,
  availability_source='UNCONFIRMED'. Se actualiza en backfill post-migración.

DOWNGRADE
=========
  Solo seguro sobre erp_storefront_test.
  NUNCA ejecutar downgrade sobre erpdb.
  Elimina los 5 campos WEB-2B.1 y los índices/checks asociados.
  Las 4 tablas NO se eliminan en downgrade (contienen datos del site).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = "fa_web2b1_001"
down_revision = "fa6_004"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    """Retorna True si la columna ya existe (schema public)."""
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
    """Retorna True si la tabla existe (schema public)."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = :t"
        ),
        {"t": table_name},
    ).scalar()
    return result is not None


def _constraint_exists(constraint_name: str, table_name: str) -> bool:
    """Retorna True si el constraint existe."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE constraint_schema = 'public' "
            "AND table_name = :t AND constraint_name = :c"
        ),
        {"t": table_name, "c": constraint_name},
    ).scalar()
    return result is not None


def _index_exists(index_name: str) -> bool:
    """Retorna True si el índice existe en pg_indexes."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM pg_indexes "
            "WHERE schemaname = 'public' AND indexname = :i"
        ),
        {"i": index_name},
    ).scalar()
    return result is not None


def upgrade() -> None:
    # ─── 1. web_carts ─────────────────────────────────────────────────────────
    if not _table_exists("web_carts"):
        op.execute(sa.text("""
            CREATE TABLE web_carts (
                id                      SERIAL PRIMARY KEY,
                session_id              VARCHAR(100),
                customer_email          VARCHAR(200),
                customer_name           VARCHAR(200),
                productos               JSONB NOT NULL DEFAULT '[]',
                total_cop               NUMERIC(14,2) NOT NULL DEFAULT 0,
                estado                  VARCHAR(30) NOT NULL DEFAULT 'ACTIVO',
                ip_address              VARCHAR(50),
                recuperacion_enviada    BOOLEAN NOT NULL DEFAULT FALSE,
                recuperacion_descuento  NUMERIC(5,2) NOT NULL DEFAULT 0,
                created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))

    # ─── 2. web_builder_config ────────────────────────────────────────────────
    if not _table_exists("web_builder_config"):
        op.execute(sa.text("""
            CREATE TABLE web_builder_config (
                id           SERIAL PRIMARY KEY,
                config_key   VARCHAR(100) NOT NULL,
                config_value JSONB,
                updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_web_builder_config_key UNIQUE (config_key)
            )
        """))

    # ─── 3. media_repository ──────────────────────────────────────────────────
    if not _table_exists("media_repository"):
        op.execute(sa.text("""
            CREATE TABLE media_repository (
                id          SERIAL PRIMARY KEY,
                filename    VARCHAR(300) NOT NULL,
                url         VARCHAR(500) NOT NULL,
                tipo        VARCHAR(50) NOT NULL DEFAULT 'imagen',
                tags        JSONB NOT NULL DEFAULT '[]',
                size_bytes  INTEGER NOT NULL DEFAULT 0,
                uploaded_by VARCHAR(150),
                created_at  TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))

    # ─── 4. ecommerce_products — tabla completa canónica ──────────────────────
    if not _table_exists("ecommerce_products"):
        op.execute(sa.text("""
            CREATE TABLE ecommerce_products (
                id                      SERIAL PRIMARY KEY,
                nombre                  VARCHAR(500) NOT NULL,
                descripcion             TEXT,
                descripcion_larga       TEXT,
                sku                     VARCHAR(100),
                precio_venta            NUMERIC(14,2) NOT NULL DEFAULT 0,
                precio_comparacion      NUMERIC(14,2) NOT NULL DEFAULT 0,
                descuento_pct           NUMERIC(5,2) NOT NULL DEFAULT 0,
                impuesto_pct            NUMERIC(5,2) NOT NULL DEFAULT 0,
                categoria               VARCHAR(200),
                sub_categoria           VARCHAR(200),
                marca                   VARCHAR(200),
                tipo_producto           VARCHAR(50) NOT NULL DEFAULT 'Bienes',
                imagenes                JSONB NOT NULL DEFAULT '[]',
                atributos               JSONB NOT NULL DEFAULT '[]',
                variantes               JSONB NOT NULL DEFAULT '[]',
                stock_disponible        INTEGER NOT NULL DEFAULT 0,
                alerta_stock_minimo     INTEGER NOT NULL DEFAULT 5,
                publicado_web           BOOLEAN NOT NULL DEFAULT FALSE,
                rastrear_inventario     BOOLEAN NOT NULL DEFAULT TRUE,
                codigo_aduana           VARCHAR(100),
                peso_kg                 NUMERIC(8,2),
                notas_internas          TEXT,
                seo_titulo              VARCHAR(300),
                seo_descripcion         TEXT,
                seo_keywords            TEXT,
                created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
                created_by              VARCHAR(150),
                -- WEB-2B.1: contrato canónico de SKU y disponibilidad
                sku_id                  INTEGER REFERENCES product_skus(id) ON DELETE SET NULL,
                purchasable             BOOLEAN NOT NULL DEFAULT FALSE,
                requires_configuration  BOOLEAN NOT NULL DEFAULT FALSE,
                availability_source     VARCHAR(20) NOT NULL DEFAULT 'MANUAL'
                                        CONSTRAINT ck_ep_availability_source
                                        CHECK (availability_source IN ('REAL','MANUAL','UNCONFIRMED')),
                modalidad               VARCHAR(30) NOT NULL DEFAULT 'POR_PEDIDO'
                                        CONSTRAINT ck_ep_modalidad
                                        CHECK (modalidad IN ('ENTREGA_INMEDIATA','POR_PEDIDO','DISPONIBILIDAD_POR_CONFIRMAR'))
            )
        """))
        # Index on sku_id for JOIN performance
        op.execute(sa.text(
            "CREATE INDEX ix_ep_sku_id ON ecommerce_products (sku_id) "
            "WHERE sku_id IS NOT NULL"
        ))
    else:
        # Table exists from before this migration (legacy _ensure_ecommerce_tables).
        # Add WEB-2B.1 columns idempotently, then add CHECK constraints and index.

        if not _column_exists("ecommerce_products", "sku_id"):
            op.add_column(
                "ecommerce_products",
                sa.Column(
                    "sku_id",
                    sa.Integer(),
                    sa.ForeignKey("product_skus.id", ondelete="SET NULL"),
                    nullable=True,
                ),
            )

        if not _column_exists("ecommerce_products", "purchasable"):
            op.add_column(
                "ecommerce_products",
                sa.Column("purchasable", sa.Boolean(), nullable=False, server_default="false"),
            )

        if not _column_exists("ecommerce_products", "requires_configuration"):
            op.add_column(
                "ecommerce_products",
                sa.Column("requires_configuration", sa.Boolean(), nullable=False, server_default="false"),
            )

        if not _column_exists("ecommerce_products", "availability_source"):
            op.add_column(
                "ecommerce_products",
                sa.Column("availability_source", sa.String(20), nullable=False, server_default="MANUAL"),
            )

        if not _column_exists("ecommerce_products", "modalidad"):
            op.add_column(
                "ecommerce_products",
                sa.Column("modalidad", sa.String(30), nullable=False, server_default="POR_PEDIDO"),
            )

        # CHECK constraints (idempotent)
        if not _constraint_exists("ck_ep_modalidad", "ecommerce_products"):
            op.execute(sa.text(
                "ALTER TABLE ecommerce_products ADD CONSTRAINT ck_ep_modalidad "
                "CHECK (modalidad IN ('ENTREGA_INMEDIATA','POR_PEDIDO','DISPONIBILIDAD_POR_CONFIRMAR'))"
            ))

        if not _constraint_exists("ck_ep_availability_source", "ecommerce_products"):
            op.execute(sa.text(
                "ALTER TABLE ecommerce_products ADD CONSTRAINT ck_ep_availability_source "
                "CHECK (availability_source IN ('REAL','MANUAL','UNCONFIRMED'))"
            ))

        # Index on sku_id (idempotent)
        if not _index_exists("ix_ep_sku_id"):
            op.execute(sa.text(
                "CREATE INDEX ix_ep_sku_id ON ecommerce_products (sku_id) "
                "WHERE sku_id IS NOT NULL"
            ))

    # ─── 5. Legacy products: mark as requires_configuration=true, availability_source=UNCONFIRMED
    # Products that existed before WEB-2B.1 and have no sku_id are unlinked legacy entries.
    op.execute(sa.text("""
        UPDATE ecommerce_products
        SET requires_configuration = TRUE,
            availability_source    = 'UNCONFIRMED',
            purchasable            = FALSE
        WHERE sku_id IS NULL
          AND requires_configuration = FALSE
    """))


def downgrade() -> None:
    # ADVERTENCIA: Solo ejecutar sobre erp_storefront_test. NUNCA sobre erpdb.
    # No elimina las 4 tablas runtime (contienen datos del site).
    # Solo elimina los 5 campos WEB-2B.1 y sus constraints/índices.

    # Drop index first
    if _index_exists("ix_ep_sku_id"):
        op.execute(sa.text("DROP INDEX IF EXISTS ix_ep_sku_id"))

    # Drop check constraints
    if _constraint_exists("ck_ep_modalidad", "ecommerce_products"):
        op.execute(sa.text(
            "ALTER TABLE ecommerce_products DROP CONSTRAINT IF EXISTS ck_ep_modalidad"
        ))

    if _constraint_exists("ck_ep_availability_source", "ecommerce_products"):
        op.execute(sa.text(
            "ALTER TABLE ecommerce_products DROP CONSTRAINT IF EXISTS ck_ep_availability_source"
        ))

    # Drop WEB-2B.1 columns
    if _column_exists("ecommerce_products", "modalidad"):
        op.drop_column("ecommerce_products", "modalidad")
    if _column_exists("ecommerce_products", "availability_source"):
        op.drop_column("ecommerce_products", "availability_source")
    if _column_exists("ecommerce_products", "requires_configuration"):
        op.drop_column("ecommerce_products", "requires_configuration")
    if _column_exists("ecommerce_products", "purchasable"):
        op.drop_column("ecommerce_products", "purchasable")
    if _column_exists("ecommerce_products", "sku_id"):
        op.drop_column("ecommerce_products", "sku_id")
