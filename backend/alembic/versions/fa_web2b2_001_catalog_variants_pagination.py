"""
fa_web2b2_001 — WEB-2B.2: Catalog variants, pagination, slugs

Adds:
- ecommerce_products.slug (unique, for stable URLs — GAP-005)
- ecommerce_products.slug_legacy (redirect support)
- ecommerce_product_variants table (real variant-SKU link — GAP-006)
- Indexes for catalog performance
"""
from alembic import op
from sqlalchemy import text

revision = "fa_web2b2_001"
down_revision = "fa_web2b1_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── ecommerce_products: slug columns ──────────────────────────────────
    op.execute(text("""
        ALTER TABLE ecommerce_products
            ADD COLUMN IF NOT EXISTS slug VARCHAR(255),
            ADD COLUMN IF NOT EXISTS slug_legacy VARCHAR(255)
    """))

    # Unique constraint on slug (skip if already exists)
    op.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_ep_slug' AND conrelid = 'ecommerce_products'::regclass
            ) THEN
                ALTER TABLE ecommerce_products ADD CONSTRAINT uq_ep_slug UNIQUE (slug);
            END IF;
        END $$;
    """))

    # ── ecommerce_product_variants table ──────────────────────────────────
    op.execute(text("""
        CREATE TABLE IF NOT EXISTS ecommerce_product_variants (
            id          SERIAL PRIMARY KEY,
            product_id  INTEGER NOT NULL
                            REFERENCES ecommerce_products(id) ON DELETE CASCADE,
            sku_id      INTEGER
                            REFERENCES product_skus(id) ON DELETE SET NULL,
            nombre      VARCHAR(255),
            atributos   JSONB NOT NULL DEFAULT '{}',
            precio_venta  NUMERIC(12,2),
            stock_override INTEGER,
            is_active   BOOLEAN NOT NULL DEFAULT TRUE,
            created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """))

    # ── Indexes ───────────────────────────────────────────────────────────
    op.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_ep_slug
            ON ecommerce_products (slug)
            WHERE slug IS NOT NULL
    """))
    op.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_epv_product_id
            ON ecommerce_product_variants (product_id)
    """))
    op.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_epv_sku_id
            ON ecommerce_product_variants (sku_id)
            WHERE sku_id IS NOT NULL
    """))
    op.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_epv_product_active
            ON ecommerce_product_variants (product_id, is_active)
    """))

    # ── Backfill slugs from existing product names ────────────────────────
    # Generates slug as lower-case, spaces → hyphens, id suffix for uniqueness.
    # Safe: only fills NULL slugs. Admin can override later.
    op.execute(text("""
        UPDATE ecommerce_products
        SET slug = LOWER(REGEXP_REPLACE(
            REGEXP_REPLACE(nombre, '[^a-zA-Z0-9\\s\\-]', '', 'g'),
            '\\s+', '-', 'g'
        )) || '-' || id::TEXT
        WHERE slug IS NULL AND nombre IS NOT NULL
    """))


def downgrade() -> None:
    op.execute(text("DROP INDEX IF EXISTS ix_epv_product_active"))
    op.execute(text("DROP INDEX IF EXISTS ix_epv_sku_id"))
    op.execute(text("DROP INDEX IF EXISTS ix_epv_product_id"))
    op.execute(text("DROP INDEX IF EXISTS ix_ep_slug"))
    op.execute(text("DROP TABLE IF EXISTS ecommerce_product_variants"))
    op.execute(text("""
        ALTER TABLE ecommerce_products
            DROP CONSTRAINT IF EXISTS uq_ep_slug,
            DROP COLUMN IF EXISTS slug,
            DROP COLUMN IF EXISTS slug_legacy
    """))
