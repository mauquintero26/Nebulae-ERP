"""
fa2_001 - Compras, Paquetes, Tracking y Consolidaciones (Fase 2)

Crea las 6 tablas normalizadas para logística y trazabilidad:
- logistics_locations
- consolidations
- shipments
- shipment_lines
- shipment_events
- consolidation_shipments

Revision ID: fa2_001
Revises: fa1b_005
Create Date: 2026-09-04
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa2_001"
down_revision: Union[str, Sequence[str], None] = "fa1b_005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. logistics_locations
    op.create_table(
        "logistics_locations",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True, index=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("location_type", sa.String(50), nullable=False),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("country", sa.String(50), nullable=True, server_default="USA"),
        sa.Column("address", sa.String(250), nullable=True),
        sa.Column("contact_phone", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # 2. consolidations
    op.create_table(
        "consolidations",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("consolidation_number", sa.String(50), nullable=False, unique=True, index=True),
        sa.Column("carrier", sa.String(50), nullable=True),
        sa.Column("tracking_international", sa.String(100), nullable=True, index=True),
        sa.Column("agency_name", sa.String(100), nullable=True),
        sa.Column("origin", sa.String(50), nullable=False, server_default="MIAMI"),
        sa.Column("destination", sa.String(50), nullable=False, server_default="BARRANQUILLA"),
        sa.Column("total_weight_kg", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("total_volume_cbm", sa.Numeric(10, 4), nullable=False, server_default="0"),
        sa.Column("total_freight_usd", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("total_freight_cop", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("trm", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("customs_declaration_number", sa.String(100), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="ABIERTA"),
        sa.Column("departure_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("estimated_arrival_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_arrival_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # 3. shipments
    op.create_table(
        "shipments",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("shipment_number", sa.String(50), nullable=False, unique=True, index=True),
        sa.Column("pec_id", sa.Integer(), sa.ForeignKey("purchase_orders_full.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("carrier", sa.String(50), nullable=False),
        sa.Column("tracking_number", sa.String(100), nullable=False, index=True),
        sa.Column("carrier_service", sa.String(50), nullable=True),
        sa.Column("origin", sa.String(100), nullable=False, server_default="PROVEEDOR"),
        sa.Column("destination", sa.String(100), nullable=False, server_default="MIAMI"),
        sa.Column("status_fise", sa.String(50), nullable=False, server_default="PREPARANDO_PROVEEDOR"),
        sa.Column("commercial_status", sa.String(50), nullable=False, server_default="EN_TRANSITO"),
        sa.Column("agency_id", sa.String(50), nullable=True),
        sa.Column("estimated_delivery_date", sa.Date(), nullable=True),
        sa.Column("actual_delivery_date", sa.Date(), nullable=True),
        sa.Column("weight_lb", sa.Numeric(10, 2), nullable=True),
        sa.Column("weight_kg", sa.Numeric(10, 2), nullable=True),
        sa.Column("shipping_cost_usd", sa.Numeric(10, 2), nullable=True),
        sa.Column("evidence_urls", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # 4. shipment_lines
    op.create_table(
        "shipment_lines",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("shipment_id", sa.Integer(), sa.ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("po_line_id", sa.Integer(), sa.ForeignKey("purchase_order_lines.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # 5. shipment_events
    op.create_table(
        "shipment_events",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("shipment_id", sa.Integer(), sa.ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("location", sa.String(150), nullable=True),
        sa.Column("user_name", sa.String(150), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("evidence_url", sa.String(500), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False, index=True),
    )

    # 6. consolidation_shipments
    op.create_table(
        "consolidation_shipments",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("consolidation_id", sa.Integer(), sa.ForeignKey("consolidations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("shipment_id", sa.Integer(), sa.ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("cost_allocation_usd", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("cost_allocation_cop", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("consolidation_id", "shipment_id", name="uq_consolidation_shipment"),
    )


def downgrade() -> None:
    op.drop_table("consolidation_shipments")
    op.drop_table("shipment_events")
    op.drop_table("shipment_lines")
    op.drop_table("shipments")
    op.drop_table("consolidations")
    op.drop_table("logistics_locations")
