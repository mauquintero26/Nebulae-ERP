"""fa3_001 - Recepciones parciales, cuarentena, kardex robusto y diferencias de inventario (Fase 3)

Revision ID: fa3_001
Revises: fa2_003
Create Date: 2026-09-04 17:15:00.000000

Cambios:
1. Extension de goods_receipts:
   - shipment_id: Vinculo opcional al paquete/envio fisico que origino la recepcion.
   - reception_stage: Etapa de recepcion (BARRANQUILLA, MIAMI, BOGOTA).
2. Extension de goods_receipt_lines:
   - quantity_missing: Cantidad faltante explicta vs esperada.
   - quantity_excess: Cantidad excedente explicta vs esperada.
   - status: Estado de la linea (PENDIENTE, CORRECTA, PARCIAL, FALTANTE, EXCEDENTE, EQUIVOCADA, DEFECTUOSA, CUARENTENA).
   - notes: Observaciones especificas de la linea recibida.
   - damaged_reason: Causal de rechazo o cuarentena.
3. Creacion de tabla inventory_quarantine:
   - Registro y aislamiento de unidades defectuosas, dañadas o discrepantes.
   - Estado de cuarentena (ACTIVO, LIBERADO, DEVUELTO_PROVEEDOR, DESTRUIDO).
   - Invariante: las unidades en cuarentena NO se suman al stock disponible.
4. Extension de inventory_movements:
   - created_at: Timestamp UTC para ordenamiento inmutable de Kardex.
   - warehouse_id: Bodega donde se asento el movimiento fisico.
   - user_id / created_by: Auditoria del usuario responsable.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "fa3_001"
down_revision: Union[str, Sequence[str], None] = "fa2_003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. goods_receipts
    for stmt in [
        "ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS shipment_id INTEGER REFERENCES shipments(id) ON DELETE SET NULL",
        "ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS reception_stage VARCHAR(30) DEFAULT 'BARRANQUILLA'",
    ]:
        conn.execute(sa.text(stmt))

    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_goods_receipts_shipment_id ON goods_receipts(shipment_id)"
    ))

    # 2. goods_receipt_lines
    for stmt in [
        "ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS quantity_missing NUMERIC(10, 2) DEFAULT 0",
        "ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS quantity_excess NUMERIC(10, 2) DEFAULT 0",
        "ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'PENDIENTE'",
        "ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS notes TEXT",
        "ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS damaged_reason VARCHAR(100)",
    ]:
        conn.execute(sa.text(stmt))

    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_grl_gr_status ON goods_receipt_lines(gr_id, status)"
    ))

    # 3. inventory_quarantine
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS inventory_quarantine (
            id SERIAL PRIMARY KEY,
            sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
            gr_line_id INTEGER REFERENCES goods_receipt_lines(id) ON DELETE SET NULL,
            quantity NUMERIC(10, 2) NOT NULL,
            reason VARCHAR(100) NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'ACTIVO',
            notes TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            resolved_at TIMESTAMP WITH TIME ZONE,
            resolved_by VARCHAR(150),
            CONSTRAINT chk_quarantine_qty CHECK (quantity > 0),
            CONSTRAINT chk_quarantine_status CHECK (status IN ('ACTIVO', 'LIBERADO', 'DEVUELTO_PROVEEDOR', 'DESTRUIDO'))
        )
    """))

    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_inv_quarantine_sku_status ON inventory_quarantine(sku_id, status)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_inv_quarantine_wh_status ON inventory_quarantine(warehouse_id, status)"
    ))

    # 4. inventory_movements extension
    for stmt in [
        "ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL",
        "ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
        "ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS created_by VARCHAR(150)",
        "ALTER TABLE inventory_movements ALTER COLUMN direction TYPE VARCHAR(30)",
    ]:
        conn.execute(sa.text(stmt))

    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_inv_mov_sku_created ON inventory_movements(sku_id, created_at DESC)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_inv_mov_wh_created ON inventory_movements(warehouse_id, created_at DESC)"
    ))


def downgrade() -> None:
    conn = op.get_bind()

    # Drop inventory_movements additions
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_inv_mov_wh_created"))
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_inv_mov_sku_created"))
    for stmt in [
        "ALTER TABLE inventory_movements DROP COLUMN IF EXISTS created_by",
        "ALTER TABLE inventory_movements DROP COLUMN IF EXISTS created_at",
        "ALTER TABLE inventory_movements DROP COLUMN IF EXISTS warehouse_id",
        """
        UPDATE inventory_movements
        SET direction = CASE
            WHEN direction = 'TRANSFER_IN' THEN 'TR_IN'
            WHEN direction = 'TRANSFER_OUT' THEN 'TR_OUT'
            ELSE LEFT(direction, 10)
        END
        WHERE LENGTH(direction) > 10
        """,
        "ALTER TABLE inventory_movements ALTER COLUMN direction TYPE VARCHAR(10)",
    ]:
        conn.execute(sa.text(stmt))

    # Drop inventory_quarantine
    conn.execute(sa.text("DROP TABLE IF EXISTS inventory_quarantine CASCADE"))

    # Drop goods_receipt_lines additions
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_grl_gr_status"))
    for stmt in [
        "ALTER TABLE goods_receipt_lines DROP COLUMN IF EXISTS damaged_reason",
        "ALTER TABLE goods_receipt_lines DROP COLUMN IF EXISTS notes",
        "ALTER TABLE goods_receipt_lines DROP COLUMN IF EXISTS status",
        "ALTER TABLE goods_receipt_lines DROP COLUMN IF EXISTS quantity_excess",
        "ALTER TABLE goods_receipt_lines DROP COLUMN IF EXISTS quantity_missing",
    ]:
        conn.execute(sa.text(stmt))

    # Drop goods_receipts additions
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_goods_receipts_shipment_id"))
    for stmt in [
        "ALTER TABLE goods_receipts DROP COLUMN IF EXISTS reception_stage",
        "ALTER TABLE goods_receipts DROP COLUMN IF EXISTS shipment_id",
    ]:
        conn.execute(sa.text(stmt))
