"""fa5_002 - Hardening de Seguridad y Consistencia de Fase 5

Revision ID: fa5_002
Revises: fa5_001
Create Date: 2026-09-06 14:00:00.000000

Cambios:
1. customer_contact_preferences:
   - Cambiar server_default a False para canales comerciales (Ley 1581 Habeas Data).
   - Agregar legal_version, is_revoked, revocation_date, revocation_reason, evidence.
2. integration_webhook_events:
   - Actualizar constraint chk_iwe_status para soportar PROCESSING y DEAD_LETTER.
3. sale_orders:
   - Agregar checkout_idempotency_key y checkout_fingerprint con indice.
4. Secuencias PostgreSQL:
   - Asegurar seq_pweb y seq_ven con DDL seguro.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'fa5_002'
down_revision: Union[str, None] = 'fa5_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. customer_contact_preferences: defaults en False y campos de auditoria
    op.alter_column('customer_contact_preferences', 'whatsapp_opt_in', server_default=sa.false())
    op.alter_column('customer_contact_preferences', 'email_opt_in', server_default=sa.false())
    op.alter_column('customer_contact_preferences', 'phone_opt_in', server_default=sa.false())
    op.alter_column('customer_contact_preferences', 'habeas_data_accepted', server_default=sa.false())

    op.add_column('customer_contact_preferences', sa.Column('legal_version', sa.String(50), nullable=True, server_default='v1.0'))
    op.add_column('customer_contact_preferences', sa.Column('is_revoked', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('customer_contact_preferences', sa.Column('revocation_date', sa.DateTime(), nullable=True))
    op.add_column('customer_contact_preferences', sa.Column('revocation_reason', sa.Text(), nullable=True))
    op.add_column('customer_contact_preferences', sa.Column('evidence', sa.Text(), nullable=True))

    # 2. integration_webhook_events: ampliar chk_iwe_status con PROCESSING y DEAD_LETTER
    try:
        op.drop_constraint('chk_iwe_status', 'integration_webhook_events', type_='check')
    except Exception:
        pass
    op.create_check_constraint(
        'chk_iwe_status',
        'integration_webhook_events',
        "status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'RETRYING', 'DEAD_LETTER')"
    )

    # 3. sale_orders: columnas de checkout e idempotencia
    op.add_column('sale_orders', sa.Column('checkout_idempotency_key', sa.String(150), nullable=True))
    op.add_column('sale_orders', sa.Column('checkout_fingerprint', sa.String(64), nullable=True))
    op.create_index('ix_so_checkout_idem_key', 'sale_orders', ['checkout_idempotency_key'])

    # 4. Secuencias seguras de base de datos
    conn = op.get_bind()
    if conn.dialect.name == 'postgresql':
        conn.execute(sa.text('CREATE SEQUENCE IF NOT EXISTS seq_pweb START 1;'))
        conn.execute(sa.text('CREATE SEQUENCE IF NOT EXISTS seq_ven START 1000;'))


def downgrade() -> None:
    # 3. Revertir sale_orders
    op.drop_index('ix_so_checkout_idem_key', table_name='sale_orders')
    op.drop_column('sale_orders', 'checkout_fingerprint')
    op.drop_column('sale_orders', 'checkout_idempotency_key')

    # 2. Revertir integration_webhook_events
    try:
        op.drop_constraint('chk_iwe_status', 'integration_webhook_events', type_='check')
    except Exception:
        pass
    op.create_check_constraint(
        'chk_iwe_status',
        'integration_webhook_events',
        "status IN ('PENDING', 'PROCESSED', 'FAILED', 'RETRYING')"
    )

    # 1. Revertir customer_contact_preferences
    op.drop_column('customer_contact_preferences', 'evidence')
    op.drop_column('customer_contact_preferences', 'revocation_reason')
    op.drop_column('customer_contact_preferences', 'revocation_date')
    op.drop_column('customer_contact_preferences', 'is_revoked')
    op.drop_column('customer_contact_preferences', 'legal_version')

    op.alter_column('customer_contact_preferences', 'whatsapp_opt_in', server_default=sa.true())
    op.alter_column('customer_contact_preferences', 'email_opt_in', server_default=sa.true())
    op.alter_column('customer_contact_preferences', 'phone_opt_in', server_default=sa.true())
    op.alter_column('customer_contact_preferences', 'habeas_data_accepted', server_default=sa.true())
