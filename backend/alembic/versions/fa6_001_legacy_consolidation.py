"""fa6_001 - Consolidacion Legacy, Observabilidad y Gobernanza (Fase 6)

Revision ID: fa6_001
Revises: fa5_002
Create Date: 2026-09-07 07:00:00.000000

Cambios:
1. Creacion de tablas de observabilidad y paridad de Fase 6:
   - legacy_consolidation_audit_logs
   - legacy_parity_snapshots
   - legacy_governance_policies
2. Adicion de columnas de enlace canonico a entidades legacy:
   - sales_orders.canonical_sale_order_id -> sale_orders.id
   - purchase_orders.canonical_purchase_order_id -> purchase_orders_full.id
   - quotations.canonical_quotation_id -> sales_quotations.id
3. Insercion de directiva por defecto en legacy_governance_policies.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import datetime


revision: str = 'fa6_001'
down_revision: Union[str, None] = 'fa5_002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tablas de observabilidad y gobernanza de Fase 6
    op.create_table(
        'legacy_consolidation_audit_logs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('legacy_endpoint', sa.String(255), nullable=False),
        sa.Column('http_method', sa.String(10), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('legacy_id', sa.Integer(), nullable=True),
        sa.Column('canonical_id', sa.Integer(), nullable=True),
        sa.Column('discrepancy_details', sa.Text(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='RECORDED'),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.datetime.utcnow),
        sa.CheckConstraint(
            "event_type IN ('LEGACY_WRITE_INTERCEPTED', 'LEGACY_READ', 'PARITY_CHECK', 'DISCREPANCY_DETECTED', 'SYNC_COMPLETED', 'GOVERNANCE_CHANGE')",
            name='chk_lcal_event_type'
        ),
        sa.CheckConstraint(
            "status IN ('RECORDED', 'ALIGNED', 'DIVERGENT', 'RESOLVED')",
            name='chk_lcal_status'
        ),
    )
    op.create_index('ix_lcal_event_created', 'legacy_consolidation_audit_logs', ['event_type', 'created_at'])
    op.create_index('ix_lcal_entity_legacy_id', 'legacy_consolidation_audit_logs', ['entity_type', 'legacy_id'])
    op.create_index('ix_lcal_entity_canonical_id', 'legacy_consolidation_audit_logs', ['entity_type', 'canonical_id'])

    op.create_table(
        'legacy_parity_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('evaluated_at', sa.DateTime(), nullable=False, default=datetime.datetime.utcnow),
        sa.Column('total_legacy_orders', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_canonical_orders', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_legacy_revenue_cop', sa.Numeric(16, 2), nullable=False, server_default='0.0'),
        sa.Column('total_canonical_revenue_cop', sa.Numeric(16, 2), nullable=False, server_default='0.0'),
        sa.Column('total_legacy_purchases', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_canonical_purchases', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('unmatched_orders_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('discrepancies_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('discrepancies_json', sa.Text(), nullable=True),
        sa.Column('parity_score_pct', sa.Numeric(5, 2), nullable=False, server_default='100.0'),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_lps_evaluated_at', 'legacy_parity_snapshots', ['evaluated_at'])

    op.create_table(
        'legacy_governance_policies',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('policy_name', sa.String(50), nullable=False, unique=True, server_default='DEFAULT'),
        sa.Column('mode', sa.String(30), nullable=False, server_default='DUAL_WRITE'),
        sa.Column('deprecation_header_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('sunset_date', sa.String(50), nullable=False, server_default='2026-12-31'),
        sa.Column('allow_legacy_writes', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=datetime.datetime.utcnow),
        sa.Column('updated_by', sa.String(100), nullable=True, server_default='SYSTEM'),
        sa.CheckConstraint(
            "mode IN ('DUAL_WRITE', 'READ_ONLY', 'CANONICAL_PRIMARY')",
            name='chk_lgp_mode'
        ),
    )

    # 2. Columnas de enlace canonico a entidades legacy
    op.add_column('sales_orders', sa.Column('canonical_sale_order_id', sa.Integer(), sa.ForeignKey('sale_orders.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_so_canonical_id', 'sales_orders', ['canonical_sale_order_id'])

    op.add_column('purchase_orders', sa.Column('canonical_purchase_order_id', sa.Integer(), sa.ForeignKey('purchase_orders_full.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_po_canonical_id', 'purchase_orders', ['canonical_purchase_order_id'])

    op.add_column('quotations', sa.Column('canonical_quotation_id', sa.Integer(), sa.ForeignKey('sales_quotations.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_quot_canonical_id', 'quotations', ['canonical_quotation_id'])

    # 3. Semilla inicial de directiva por defecto
    op.execute(
        sa.text(
            "INSERT INTO legacy_governance_policies (policy_name, mode, deprecation_header_enabled, sunset_date, allow_legacy_writes, updated_at, updated_by) "
            "VALUES ('DEFAULT', 'DUAL_WRITE', true, '2026-12-31', true, NOW(), 'SYSTEM') "
            "ON CONFLICT (policy_name) DO NOTHING;"
        )
    )


def downgrade() -> None:
    # 1. Eliminar columnas e indices de entidades legacy
    try:
        op.drop_index('ix_quot_canonical_id', table_name='quotations')
    except Exception:
        pass
    op.drop_column('quotations', 'canonical_quotation_id')

    try:
        op.drop_index('ix_po_canonical_id', table_name='purchase_orders')
    except Exception:
        pass
    op.drop_column('purchase_orders', 'canonical_purchase_order_id')

    try:
        op.drop_index('ix_so_canonical_id', table_name='sales_orders')
    except Exception:
        pass
    op.drop_column('sales_orders', 'canonical_sale_order_id')

    # 2. Eliminar tablas de Fase 6
    op.drop_table('legacy_governance_policies')
    op.drop_table('legacy_parity_snapshots')
    op.drop_table('legacy_consolidation_audit_logs')
