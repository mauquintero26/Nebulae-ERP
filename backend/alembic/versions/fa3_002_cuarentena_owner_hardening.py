"""fa3_002 - Owner en cuarentena, check constraints, precision decimal y segregacion patrimonial (Fase 3 Hardening)

Revision ID: fa3_002
Revises: fa3_001
Create Date: 2026-09-05 01:15:00.000000

Cambios:
1. inventory_quarantine:
   - Agregar columna owner VARCHAR(20) NOT NULL DEFAULT 'NEBULAE'
   - Constraint CHECK (owner IN ('NEBULAE', 'MAU'))
   - Indice compuesto ix_quarantine_lookup (sku_id, warehouse_id, owner, status)
2. Precision decimal (Decimal / NUMERIC(10, 2)):
   - inventory_levels.quantity -> NUMERIC(10, 2)
   - inventory_movements.quantity -> NUMERIC(10, 2)
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "fa3_002"
down_revision: Union[str, Sequence[str], None] = "fa3_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Agregar owner a inventory_quarantine
    conn.execute(sa.text(
        "ALTER TABLE inventory_quarantine ADD COLUMN IF NOT EXISTS owner VARCHAR(20) NOT NULL DEFAULT 'NEBULAE'"
    ))

    # 2. CHECK constraint de owner
    conn.execute(sa.text(
        "ALTER TABLE inventory_quarantine DROP CONSTRAINT IF EXISTS chk_quarantine_owner"
    ))
    conn.execute(sa.text(
        "ALTER TABLE inventory_quarantine ADD CONSTRAINT chk_quarantine_owner CHECK (owner IN ('NEBULAE', 'MAU'))"
    ))

    # 3. Indice compuesto para consultas de disponibilidad y resolucion
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_quarantine_lookup ON inventory_quarantine (sku_id, warehouse_id, owner, status)"
    ))

    # 4. Precision decimal en inventory_levels y inventory_movements
    conn.execute(sa.text(
        "ALTER TABLE inventory_levels ALTER COLUMN quantity TYPE NUMERIC(10, 2)"
    ))
    conn.execute(sa.text(
        "ALTER TABLE inventory_movements ALTER COLUMN quantity TYPE NUMERIC(10, 2)"
    ))


def downgrade() -> None:
    conn = op.get_bind()

    # 4. Revertir precision decimal a INTEGER
    conn.execute(sa.text(
        "ALTER TABLE inventory_movements ALTER COLUMN quantity TYPE INTEGER"
    ))
    conn.execute(sa.text(
        "ALTER TABLE inventory_levels ALTER COLUMN quantity TYPE INTEGER"
    ))

    # 3, 2, 1. Revertir owner en inventory_quarantine
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_quarantine_lookup"))
    conn.execute(sa.text("ALTER TABLE inventory_quarantine DROP CONSTRAINT IF EXISTS chk_quarantine_owner"))
    conn.execute(sa.text("ALTER TABLE inventory_quarantine DROP COLUMN IF EXISTS owner"))
