"""
Fase 1 - ERP Lines, Payment Transactions, InventoryLevel dimensions,
GoodsReceipt idempotency, CustomerRequest omnichannel fields,
ActivityLog idempotency.

Revision ID: fa01_erp_fase1
Revises: ba65b0f69880
Create Date: 2026-09-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa01_erp_fase1"
down_revision: Union[str, Sequence[str], None] = "ba65b0f69880"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. customer_request_lines ──────────────────────────────────────────
    op.create_table(
        "customer_request_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sc_id", sa.Integer(), sa.ForeignKey("customer_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sku_id", sa.Integer(), sa.ForeignKey("product_skus.id"), nullable=True),
        sa.Column("descripcion", sa.String(300), nullable=True),
        sa.Column("imagen_url", sa.String(500), nullable=True),
        sa.Column("proveedor_sugerido", sa.String(200), nullable=True),
        sa.Column("variante", sa.String(200), nullable=True),
        sa.Column("cantidad", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("precio_estimado_usd", sa.Numeric(12, 2), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("tipo_entrega", sa.String(30), nullable=True, server_default="POR_PEDIDO"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_crl_sc_id", "customer_request_lines", ["sc_id"])

    # ── 2. sales_quotation_lines ──────────────────────────────────────────
    op.create_table(
        "sales_quotation_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cot_id", sa.Integer(), sa.ForeignKey("sales_quotations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sc_line_id", sa.Integer(), sa.ForeignKey("customer_request_lines.id"), nullable=True),
        sa.Column("sku_id", sa.Integer(), sa.ForeignKey("product_skus.id"), nullable=True),
        sa.Column("descripcion", sa.String(300), nullable=True),
        sa.Column("imagen_url", sa.String(500), nullable=True),
        sa.Column("variante", sa.String(200), nullable=True),
        sa.Column("cantidad", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("precio_usd", sa.Numeric(12, 2), nullable=True),
        sa.Column("trm_usada", sa.Numeric(10, 2), nullable=True),
        sa.Column("descuento_pct", sa.Numeric(5, 2), nullable=True, server_default="0"),
        sa.Column("impuesto_pct", sa.Numeric(5, 2), nullable=True, server_default="0"),
        sa.Column("flete_estimado_cop", sa.Numeric(12, 2), nullable=True, server_default="0"),
        sa.Column("envio_interno_cop", sa.Numeric(12, 2), nullable=True, server_default="0"),
        sa.Column("peso_estimado_kg", sa.Numeric(8, 3), nullable=True),
        sa.Column("otros_costos_cop", sa.Numeric(12, 2), nullable=True, server_default="0"),
        sa.Column("margen_pct", sa.Numeric(5, 2), nullable=True, server_default="0"),
        sa.Column("precio_venta_cop", sa.Numeric(14, 2), nullable=True),
        sa.Column("subtotal_cop", sa.Numeric(14, 2), nullable=True),
        sa.Column("tipo_entrega", sa.String(30), nullable=True, server_default="POR_PEDIDO"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_sql_cot_id", "sales_quotation_lines", ["cot_id"])

    # ── 3. sale_order_lines_erp ──────────────────────────────────────────
    op.create_table(
        "sale_order_lines_erp",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ven_id", sa.Integer(), sa.ForeignKey("sale_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cot_line_id", sa.Integer(), sa.ForeignKey("sales_quotation_lines.id"), nullable=True),
        sa.Column("sku_id", sa.Integer(), sa.ForeignKey("product_skus.id"), nullable=True),
        sa.Column("descripcion", sa.String(300), nullable=True),
        sa.Column("imagen_url", sa.String(500), nullable=True),
        sa.Column("variante", sa.String(200), nullable=True),
        sa.Column("cantidad", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("precio_venta_cop", sa.Numeric(14, 2), nullable=True),
        sa.Column("subtotal_cop", sa.Numeric(14, 2), nullable=True),
        sa.Column("costo_estimado_cop", sa.Numeric(14, 2), nullable=True),
        sa.Column("tipo_entrega", sa.String(30), nullable=True, server_default="POR_PEDIDO"),
        sa.Column("estado", sa.String(50), nullable=False, server_default="PENDIENTE"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_sol_ven_id", "sale_order_lines_erp", ["ven_id"])

    # ── 4. purchase_order_lines ──────────────────────────────────────────
    op.create_table(
        "purchase_order_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pec_id", sa.Integer(), sa.ForeignKey("purchase_orders_full.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sku_id", sa.Integer(), sa.ForeignKey("product_skus.id"), nullable=True),
        sa.Column("descripcion", sa.String(300), nullable=True),
        sa.Column("imagen_url", sa.String(500), nullable=True),
        sa.Column("proveedor_ref", sa.String(200), nullable=True),
        sa.Column("variante", sa.String(200), nullable=True),
        sa.Column("cantidad_ordenada", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("cantidad_confirmada", sa.Integer(), nullable=True),
        sa.Column("cantidad_enviada", sa.Integer(), nullable=True),
        sa.Column("cantidad_recibida", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("cantidad_cancelada", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("cantidad_defectuosa", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("precio_usd", sa.Numeric(12, 2), nullable=True),
        sa.Column("trm_usada", sa.Numeric(10, 2), nullable=True),
        sa.Column("descuento_pct", sa.Numeric(5, 2), nullable=True, server_default="0"),
        sa.Column("impuesto_pct", sa.Numeric(5, 2), nullable=True, server_default="0"),
        sa.Column("envio_interno_usd", sa.Numeric(10, 2), nullable=True, server_default="0"),
        sa.Column("peso_estimado_kg", sa.Numeric(8, 3), nullable=True),
        sa.Column("flete_estimado_cop", sa.Numeric(12, 2), nullable=True, server_default="0"),
        sa.Column("transporte_nacional_cop", sa.Numeric(12, 2), nullable=True, server_default="0"),
        sa.Column("otros_costos_cop", sa.Numeric(12, 2), nullable=True, server_default="0"),
        sa.Column("costo_estimado_cop", sa.Numeric(14, 2), nullable=True),
        sa.Column("costo_real_cop", sa.Numeric(14, 2), nullable=True),
        sa.Column("estado", sa.String(50), nullable=False, server_default="PENDIENTE"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_pol_pec_id", "purchase_order_lines", ["pec_id"])

    # ── 5. procurement_allocations ────────────────────────────────────────
    op.create_table(
        "procurement_allocations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pec_line_id", sa.Integer(), sa.ForeignKey("purchase_order_lines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ven_line_id", sa.Integer(), sa.ForeignKey("sale_order_lines_erp.id"), nullable=True),
        sa.Column("ven_id", sa.Integer(), sa.ForeignKey("sale_orders.id"), nullable=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=True),
        sa.Column("ownership_type", sa.String(20), nullable=False, server_default="NEBULAE"),
        sa.Column("allocation_type", sa.String(30), nullable=False, server_default="NEBULAE_STOCK"),
        sa.Column("cantidad_asignada", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cantidad_recibida", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("cantidad_cancelada", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("cantidad_defectuosa", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("cantidad_entregada", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("estado", sa.String(50), nullable=False, server_default="PENDIENTE_COMPRA"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_pa_pec_line_id", "procurement_allocations", ["pec_line_id"])

    # ── 6. goods_receipt_lines ────────────────────────────────────────────
    op.create_table(
        "goods_receipt_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("eninv_id", sa.Integer(), sa.ForeignKey("goods_receipts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pec_line_id", sa.Integer(), sa.ForeignKey("purchase_order_lines.id"), nullable=True),
        sa.Column("allocation_id", sa.Integer(), sa.ForeignKey("procurement_allocations.id"), nullable=True),
        sa.Column("sku_id", sa.Integer(), sa.ForeignKey("product_skus.id"), nullable=True),
        sa.Column("descripcion", sa.String(300), nullable=True),
        sa.Column("variante", sa.String(200), nullable=True),
        sa.Column("cantidad_esperada", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cantidad_recibida", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cantidad_faltante", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("cantidad_adicional", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("cantidad_defectuosa", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("resultado", sa.String(30), nullable=False, server_default="PENDIENTE"),
        sa.Column("ubicacion_destino", sa.String(200), nullable=True),
        sa.Column("lote", sa.String(100), nullable=True),
        sa.Column("evidencia_url", sa.String(500), nullable=True),
        sa.Column("observacion", sa.Text(), nullable=True),
        sa.Column("ownership_type", sa.String(20), nullable=True, server_default="NEBULAE"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_grl_eninv_id", "goods_receipt_lines", ["eninv_id"])

    # ── 7. inventory_reservations ─────────────────────────────────────────
    op.create_table(
        "inventory_reservations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sku_id", sa.Integer(), sa.ForeignKey("product_skus.id"), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("warehouses.id"), nullable=False),
        sa.Column("ven_id", sa.Integer(), sa.ForeignKey("sale_orders.id"), nullable=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=True),
        sa.Column("cantidad", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tipo", sa.String(30), nullable=False, server_default="TEMPORAL"),
        sa.Column("estado", sa.String(30), nullable=False, server_default="ACTIVA"),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.String(150), nullable=True),
    )
    op.create_index("ix_inv_res_sku_wh_estado", "inventory_reservations", ["sku_id", "warehouse_id", "estado"])

    # ── 8. payment_transactions ────────────────────────────────────────────
    op.create_table(
        "payment_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("numero", sa.String(30), unique=True, nullable=False),
        sa.Column("ven_id", sa.Integer(), sa.ForeignKey("sale_orders.id"), nullable=False),
        sa.Column("pxp_id", sa.Integer(), sa.ForeignKey("payment_pendings.id"), nullable=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=True),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False),
        sa.Column("moneda", sa.String(10), nullable=False, server_default="COP"),
        sa.Column("metodo_pago", sa.String(100), nullable=True),
        sa.Column("referencia", sa.String(200), nullable=True),
        sa.Column("estado", sa.String(30), nullable=False, server_default="CONFIRMADO"),
        sa.Column("fecha_pago", sa.DateTime(), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("registrado_por", sa.String(150), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_pt_ven_id", "payment_transactions", ["ven_id"])

    # ── 9. Ampliar inventory_levels ────────────────────────────────────────
    op.add_column("inventory_levels", sa.Column("reserved", sa.Integer(), nullable=True, server_default="0"))
    op.add_column("inventory_levels", sa.Column("assigned_customers", sa.Integer(), nullable=True, server_default="0"))
    op.add_column("inventory_levels", sa.Column("in_transit", sa.Integer(), nullable=True, server_default="0"))
    op.add_column("inventory_levels", sa.Column("in_quarantine", sa.Integer(), nullable=True, server_default="0"))
    op.add_column("inventory_levels", sa.Column("qty_nebulae", sa.Integer(), nullable=True, server_default="0"))
    op.add_column("inventory_levels", sa.Column("qty_mau", sa.Integer(), nullable=True, server_default="0"))

    # ── 10. Ampliar goods_receipts ─────────────────────────────────────────
    op.add_column("goods_receipts", sa.Column("idempotency_key", sa.String(100), nullable=True, unique=True))
    op.add_column("goods_receipts", sa.Column("receipt_type", sa.String(20), nullable=True, server_default="FISICA"))
    op.add_column("goods_receipts", sa.Column("confirmed_by", sa.String(150), nullable=True))
    op.add_column("goods_receipts", sa.Column("confirmed_at", sa.DateTime(), nullable=True))

    # ── 11. Ampliar customer_requests ──────────────────────────────────────
    op.add_column("customer_requests", sa.Column("conversation_id", sa.String(100), nullable=True))
    op.add_column("customer_requests", sa.Column("campaign_id", sa.Integer(), nullable=True))
    op.add_column("customer_requests", sa.Column("canal_origen", sa.String(50), nullable=True))
    op.create_index("ix_cr_conversation_id", "customer_requests", ["conversation_id"])

    # ── 12. Ampliar activity_logs ──────────────────────────────────────────
    op.add_column("activity_logs", sa.Column("idempotency_key", sa.String(100), nullable=True, unique=True))
    op.add_column("activity_logs", sa.Column("related_entity_type", sa.String(20), nullable=True))
    op.add_column("activity_logs", sa.Column("related_entity_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    # Revertir en orden inverso
    op.drop_column("activity_logs", "related_entity_id")
    op.drop_column("activity_logs", "related_entity_type")
    op.drop_column("activity_logs", "idempotency_key")

    op.drop_index("ix_cr_conversation_id", table_name="customer_requests")
    op.drop_column("customer_requests", "canal_origen")
    op.drop_column("customer_requests", "campaign_id")
    op.drop_column("customer_requests", "conversation_id")

    op.drop_column("goods_receipts", "confirmed_at")
    op.drop_column("goods_receipts", "confirmed_by")
    op.drop_column("goods_receipts", "receipt_type")
    op.drop_column("goods_receipts", "idempotency_key")

    op.drop_column("inventory_levels", "qty_mau")
    op.drop_column("inventory_levels", "qty_nebulae")
    op.drop_column("inventory_levels", "in_quarantine")
    op.drop_column("inventory_levels", "in_transit")
    op.drop_column("inventory_levels", "assigned_customers")
    op.drop_column("inventory_levels", "reserved")

    op.drop_index("ix_pt_ven_id", table_name="payment_transactions")
    op.drop_table("payment_transactions")

    op.drop_index("ix_inv_res_sku_wh_estado", table_name="inventory_reservations")
    op.drop_table("inventory_reservations")

    op.drop_index("ix_grl_eninv_id", table_name="goods_receipt_lines")
    op.drop_table("goods_receipt_lines")

    op.drop_index("ix_pa_pec_line_id", table_name="procurement_allocations")
    op.drop_table("procurement_allocations")

    op.drop_index("ix_pol_pec_id", table_name="purchase_order_lines")
    op.drop_table("purchase_order_lines")

    op.drop_index("ix_sol_ven_id", table_name="sale_order_lines_erp")
    op.drop_table("sale_order_lines_erp")

    op.drop_index("ix_sql_cot_id", table_name="sales_quotation_lines")
    op.drop_table("sales_quotation_lines")

    op.drop_index("ix_crl_sc_id", table_name="customer_request_lines")
    op.drop_table("customer_request_lines")
