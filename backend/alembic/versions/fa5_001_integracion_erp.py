"""fa5_001 - Integracion del Nucleo Operativo con Modulos ERP

Revision ID: fa5_001
Revises: fa4_002
Create Date: 2026-09-06 12:00:00.000000

Tablas agregadas:
1. customer_agenda_activities: Agenda operativa y calendario determinista del cliente.
2. omnichannel_interactions: Auditoria y consultas seguras del asistente omnicanal.
3. customer_contact_preferences: Preferencias de contacto y consentimiento Habeas Data.
4. integration_webhook_events: Registro desacoplado de eventos, idempotencia y reintentos.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'fa5_001'
down_revision: Union[str, None] = 'fa4_002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. customer_agenda_activities
    op.create_table(
        'customer_agenda_activities',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('entity_type', sa.String(30), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('activity_type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('scheduled_date', sa.DateTime(), nullable=True),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='PENDIENTE'),
        sa.Column('deterministic_key', sa.String(200), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.String(150), nullable=True),
        sa.CheckConstraint(
            "entity_type IN ('SALE_ORDER', 'PURCHASE_ORDER', 'DELIVERY', 'RETURN', 'PACKING', 'GENERAL')",
            name='chk_agenda_entity_type'
        ),
        sa.CheckConstraint(
            "status IN ('PENDIENTE', 'COMPLETADA', 'CANCELADA')",
            name='chk_agenda_status'
        ),
    )
    op.create_index('ix_agenda_cust_id', 'customer_agenda_activities', ['customer_id'])
    op.create_index('ix_agenda_deterministic_key', 'customer_agenda_activities', ['deterministic_key'], unique=True)
    op.create_index('ix_agenda_cust_status', 'customer_agenda_activities', ['customer_id', 'status'])
    op.create_index('ix_agenda_entity', 'customer_agenda_activities', ['entity_type', 'entity_id'])

    # 2. omnichannel_interactions
    op.create_table(
        'omnichannel_interactions',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('channel', sa.String(30), nullable=False),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('conversation_id', sa.String(150), nullable=True),
        sa.Column('action_requested', sa.String(50), nullable=False),
        sa.Column('result_summary', sa.Text(), nullable=True),
        sa.Column('result_data', sa.Text(), nullable=True),
        sa.Column('related_entity_type', sa.String(30), nullable=True),
        sa.Column('related_entity_id', sa.Integer(), nullable=True),
        sa.Column('actor_type', sa.String(30), nullable=False, server_default='BOT'),
        sa.Column('actor_name', sa.String(150), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='SUCCESS'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.CheckConstraint(
            "channel IN ('WHATSAPP', 'WEB', 'KOMMO', 'API', 'EMAIL')",
            name='chk_omni_channel'
        ),
        sa.CheckConstraint(
            "actor_type IN ('BOT', 'AGENT', 'USER')",
            name='chk_omni_actor_type'
        ),
        sa.CheckConstraint(
            "status IN ('SUCCESS', 'ERROR', 'UNAUTHORIZED')",
            name='chk_omni_status'
        ),
    )
    op.create_index('ix_omni_customer_id', 'omnichannel_interactions', ['customer_id'])
    op.create_index('ix_omni_conversation_id', 'omnichannel_interactions', ['conversation_id'])
    op.create_index('ix_omni_cust_action', 'omnichannel_interactions', ['customer_id', 'action_requested'])

    # 3. customer_contact_preferences
    op.create_table(
        'customer_contact_preferences',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('whatsapp_opt_in', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('email_opt_in', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('sms_opt_in', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('phone_opt_in', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('habeas_data_accepted', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('consent_channel', sa.String(50), nullable=False, server_default='WEB'),
        sa.Column('consent_date', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_cust_pref_customer_id', 'customer_contact_preferences', ['customer_id'], unique=True)

    # 4. integration_webhook_events
    op.create_table(
        'integration_webhook_events',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('provider', sa.String(50), nullable=False),
        sa.Column('event_type', sa.String(100), nullable=False),
        sa.Column('idempotency_key', sa.String(150), nullable=False),
        sa.Column('direction', sa.String(20), nullable=False, server_default='INBOUND'),
        sa.Column('payload', sa.Text(), nullable=False),
        sa.Column('headers', sa.Text(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='PENDING'),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_attempts', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('dead_letter', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('processed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('provider', 'idempotency_key', name='uq_iwe_provider_key'),
        sa.CheckConstraint("direction IN ('INBOUND', 'OUTBOUND')", name='chk_iwe_direction'),
        sa.CheckConstraint("status IN ('PENDING', 'PROCESSED', 'FAILED', 'RETRYING')", name='chk_iwe_status'),
    )
    op.create_index('ix_iwe_provider_status', 'integration_webhook_events', ['provider', 'status'])
    op.create_index('ix_iwe_dead_letter', 'integration_webhook_events', ['dead_letter'])


def downgrade() -> None:
    op.drop_table('integration_webhook_events')
    op.drop_table('customer_contact_preferences')
    op.drop_table('omnichannel_interactions')
    op.drop_table('customer_agenda_activities')
