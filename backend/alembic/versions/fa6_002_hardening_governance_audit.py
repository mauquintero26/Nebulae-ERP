"""fa6_002 - Hardening de Gobernanza, Auditoria Inmutable y Secuencias Consecutivas (Fase 6)

Revision ID: fa6_002
Revises: fa6_001
Create Date: 2026-09-07 08:30:00.000000

Cambios:
1. Columnas adicionales en legacy_consolidation_audit_logs:
   - actor_user_id (FK users.id)
   - latency_ms (Numeric(10,2))
   - result_summary (VARCHAR(255))
   - idempotency_key (VARCHAR(150), index)
   - fingerprint (VARCHAR(64))
2. Trigger de inmutabilidad estricta trg_audit_log_immutable que rechaza UPDATE y DELETE.
3. Columnas en legacy_governance_policies:
   - change_reason (TEXT)
   - actor_user_id (FK users.id)
4. Creacion de secuencias PostgreSQL seq_ven_so, seq_pec_po, seq_cot_sq inicializadas desde el maximo historico.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'fa6_002'
down_revision: Union[str, None] = 'fa6_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Nuevas columnas de auditoria
    op.add_column('legacy_consolidation_audit_logs', sa.Column('actor_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
    op.add_column('legacy_consolidation_audit_logs', sa.Column('latency_ms', sa.Numeric(10, 2), nullable=True))
    op.add_column('legacy_consolidation_audit_logs', sa.Column('result_summary', sa.String(255), nullable=True))
    op.add_column('legacy_consolidation_audit_logs', sa.Column('idempotency_key', sa.String(150), nullable=True))
    op.add_column('legacy_consolidation_audit_logs', sa.Column('fingerprint', sa.String(64), nullable=True))

    op.create_index('ix_lcal_actor_user', 'legacy_consolidation_audit_logs', ['actor_user_id'])
    op.create_index('ix_lcal_idempotency_key', 'legacy_consolidation_audit_logs', ['idempotency_key'])

    # 2. Nuevas columnas de gobernanza
    op.add_column('legacy_governance_policies', sa.Column('change_reason', sa.Text(), nullable=True))
    op.add_column('legacy_governance_policies', sa.Column('actor_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))

    # 3. Secuencias PostgreSQL para consecutivos
    op.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS seq_ven_so START 1000"))
    op.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS seq_pec_po START 1000"))
    op.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS seq_cot_sq START 1000"))

    op.execute(sa.text("SELECT setval('seq_ven_so', GREATEST(COALESCE((SELECT MAX(id) FROM sale_orders), 0) + 1, 1000), false)"))
    op.execute(sa.text("SELECT setval('seq_pec_po', GREATEST(COALESCE((SELECT MAX(id) FROM purchase_orders_full), 0) + 1, 1000), false)"))
    op.execute(sa.text("SELECT setval('seq_cot_sq', GREATEST(COALESCE((SELECT MAX(id) FROM sales_quotations), 0) + 1, 1000), false)"))

    # 4. Trigger de inmutabilidad estricta contra UPDATE y DELETE
    op.execute(sa.text("""
        CREATE OR REPLACE FUNCTION trg_prevent_audit_log_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'legacy_consolidation_audit_logs is append-only and immutable. UPDATE and DELETE operations are forbidden.';
        END;
        $$ LANGUAGE plpgsql;
    """))
    op.execute(sa.text("""
        DROP TRIGGER IF EXISTS trg_audit_log_immutable ON legacy_consolidation_audit_logs;
        CREATE TRIGGER trg_audit_log_immutable
        BEFORE UPDATE OR DELETE ON legacy_consolidation_audit_logs
        FOR EACH ROW EXECUTE FUNCTION trg_prevent_audit_log_mutation();
    """))


def downgrade() -> None:
    # 1. Dropear trigger y funcion de inmutabilidad
    op.execute(sa.text("DROP TRIGGER IF EXISTS trg_audit_log_immutable ON legacy_consolidation_audit_logs;"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS trg_prevent_audit_log_mutation();"))

    # 2. Dropear secuencias
    op.execute(sa.text("DROP SEQUENCE IF EXISTS seq_ven_so;"))
    op.execute(sa.text("DROP SEQUENCE IF EXISTS seq_pec_po;"))
    op.execute(sa.text("DROP SEQUENCE IF EXISTS seq_cot_sq;"))

    # 3. Dropear columnas de gobernanza
    op.drop_column('legacy_governance_policies', 'actor_user_id')
    op.drop_column('legacy_governance_policies', 'change_reason')

    # 4. Dropear indices y columnas de auditoria
    op.drop_index('ix_lcal_idempotency_key', table_name='legacy_consolidation_audit_logs')
    op.drop_index('ix_lcal_actor_user', table_name='legacy_consolidation_audit_logs')
    op.drop_column('legacy_consolidation_audit_logs', 'fingerprint')
    op.drop_column('legacy_consolidation_audit_logs', 'idempotency_key')
    op.drop_column('legacy_consolidation_audit_logs', 'result_summary')
    op.drop_column('legacy_consolidation_audit_logs', 'latency_ms')
    op.drop_column('legacy_consolidation_audit_logs', 'actor_user_id')
