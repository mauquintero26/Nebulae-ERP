"""
fa2_002 - Endurecimiento de integridad, restricciones y trazabilidad (Fase 2)

Aplica:
- procurement_allocations: indice unico funcional (po_line_id, allocation_type, COALESCE(sale_order_line_id, -1))
  y check constraints de cantidad y tipos validos.
- shipments: check constraints de peso y costos no negativos.
- shipment_lines: check constraint de cantidad positiva e indice unico (shipment_id, po_line_id).
- consolidations: columna dian_entered_at y check constraints de flete/trm/peso no negativos.
- consolidation_shipments: columna is_active e indice unico parcial para garantizar a lo sumo una consolidacion activa por paquete.
- shipment_events: columna e indice idempotency_key.

Revision ID: fa2_002
Revises: fa2_001
Create Date: 2026-09-04
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa2_002"
down_revision: Union[str, Sequence[str], None] = "fa2_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. procurement_allocations: drop old constraint/index and add functional unique index + checks
    op.execute("ALTER TABLE procurement_allocations DROP CONSTRAINT IF EXISTS uq_proc_alloc_po_sol")
    op.execute("DROP INDEX IF EXISTS uq_proc_alloc_po_sol")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_procurement_alloc_identity "
        "ON procurement_allocations (po_line_id, allocation_type, COALESCE(sale_order_line_id, -1))"
    )
    op.create_check_constraint(
        "chk_proc_alloc_qty",
        "procurement_allocations",
        "quantity_allocated > 0",
    )
    op.create_check_constraint(
        "chk_proc_alloc_type",
        "procurement_allocations",
        "allocation_type IN ('CUSTOMER_ORDER', 'NEBULAE_STOCK', 'MAU_STOCK')",
    )

    # 2. shipments: non-negative weights and costs
    op.create_check_constraint(
        "chk_shipment_weight_lb",
        "shipments",
        "weight_lb IS NULL OR weight_lb >= 0",
    )
    op.create_check_constraint(
        "chk_shipment_weight_kg",
        "shipments",
        "weight_kg IS NULL OR weight_kg >= 0",
    )
    op.create_check_constraint(
        "chk_shipment_cost_usd",
        "shipments",
        "shipping_cost_usd IS NULL OR shipping_cost_usd >= 0",
    )

    # 3. shipment_lines: positive quantity and unique line per shipment
    op.create_check_constraint(
        "chk_shipment_line_qty",
        "shipment_lines",
        "quantity > 0",
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_shipment_line_po_line "
        "ON shipment_lines (shipment_id, po_line_id)"
    )

    # 4. consolidations: dian_entered_at column + non-negative freight/trm checks
    op.add_column(
        "consolidations",
        sa.Column("dian_entered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "chk_consolidation_freight_usd",
        "consolidations",
        "total_freight_usd >= 0",
    )
    op.create_check_constraint(
        "chk_consolidation_freight_cop",
        "consolidations",
        "total_freight_cop >= 0",
    )
    op.create_check_constraint(
        "chk_consolidation_trm",
        "consolidations",
        "trm >= 0",
    )
    op.create_check_constraint(
        "chk_consolidation_weight_kg",
        "consolidations",
        "total_weight_kg >= 0",
    )
    op.create_check_constraint(
        "chk_consolidation_volume_cbm",
        "consolidations",
        "total_volume_cbm >= 0",
    )

    # 5. consolidation_shipments: is_active column + partial unique index for single active consolidation
    op.add_column(
        "consolidation_shipments",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_active_consolidation_shipment "
        "ON consolidation_shipments (shipment_id) WHERE is_active = true"
    )

    # 6. shipment_events: idempotency_key
    op.add_column(
        "shipment_events",
        sa.Column("idempotency_key", sa.String(100), nullable=True),
    )
    op.create_index(
        "ix_shipment_events_idempotency_key",
        "shipment_events",
        ["idempotency_key"],
    )


def downgrade() -> None:
    # 6. shipment_events
    op.drop_index("ix_shipment_events_idempotency_key", table_name="shipment_events")
    op.drop_column("shipment_events", "idempotency_key")

    # 5. consolidation_shipments
    op.execute("DROP INDEX IF EXISTS uq_active_consolidation_shipment")
    op.drop_column("consolidation_shipments", "is_active")

    # 4. consolidations
    op.drop_constraint("chk_consolidation_volume_cbm", "consolidations", type_="check")
    op.drop_constraint("chk_consolidation_weight_kg", "consolidations", type_="check")
    op.drop_constraint("chk_consolidation_trm", "consolidations", type_="check")
    op.drop_constraint("chk_consolidation_freight_cop", "consolidations", type_="check")
    op.drop_constraint("chk_consolidation_freight_usd", "consolidations", type_="check")
    op.drop_column("consolidations", "dian_entered_at")

    # 3. shipment_lines
    op.execute("DROP INDEX IF EXISTS uq_shipment_line_po_line")
    op.drop_constraint("chk_shipment_line_qty", "shipment_lines", type_="check")

    # 2. shipments
    op.drop_constraint("chk_shipment_cost_usd", "shipments", type_="check")
    op.drop_constraint("chk_shipment_weight_kg", "shipments", type_="check")
    op.drop_constraint("chk_shipment_weight_lb", "shipments", type_="check")

    # 1. procurement_allocations
    op.drop_constraint("chk_proc_alloc_type", "procurement_allocations", type_="check")
    op.drop_constraint("chk_proc_alloc_qty", "procurement_allocations", type_="check")
    op.execute("DROP INDEX IF EXISTS uq_procurement_alloc_identity")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_proc_alloc_po_sol "
        "ON procurement_allocations (po_line_id, sale_order_line_id) WHERE (sale_order_line_id IS NOT NULL)"
    )
