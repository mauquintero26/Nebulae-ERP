"""
Fase 5 - Modelos de Integracion ERP:
- CustomerAgendaActivity: Agenda operativa y calendario determinista del cliente.
- OmnichannelInteraction: Auditoria y consultas del asistente omnicanal.
- CustomerContactPreference: Preferencias de contacto de marketing y consentimiento Habeas Data.
- IntegrationWebhookEvent: Registro desacoplado de eventos e idempotencia para integraciones externas.
"""
import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, ForeignKey, UniqueConstraint, Index, CheckConstraint
)
from sqlalchemy.orm import relationship
from app.db.database import Base


def _now():
    return datetime.datetime.utcnow()


class CustomerAgendaActivity(Base):
    """Actividades operativas y fechas vinculadas al cliente y sus entidades operativas."""
    __tablename__ = "customer_agenda_activities"

    id                = Column(Integer, primary_key=True, index=True)
    customer_id       = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    entity_type       = Column(String(30), nullable=False)
    # SALE_ORDER | PURCHASE_ORDER | DELIVERY | RETURN | PACKING | GENERAL
    entity_id         = Column(Integer, nullable=True)
    activity_type     = Column(String(50), nullable=False)
    # ANTICIPO_PENDIENTE | CONFIRMACION_PROVEEDOR | TRACKING_PENDIENTE | RECEPCION_ESTIMADA |
    # LLEGADA_BARRANQUILLA | SALDO_PENDIENTE | MERCANCIA_LISTA | EMPAQUE_PENDIENTE |
    # DESPACHO_PROGRAMADO | ENTREGA_PENDIENTE | INCIDENCIA | GARANTIA_DEVOLUCION
    title             = Column(String(200), nullable=False)
    description       = Column(Text, nullable=True)
    scheduled_date    = Column(DateTime, nullable=True)
    due_date          = Column(DateTime, nullable=True)
    status            = Column(String(30), nullable=False, default="PENDIENTE")
    # PENDIENTE | COMPLETADA | CANCELADA
    deterministic_key = Column(String(200), unique=True, nullable=False, index=True)
    created_at        = Column(DateTime, default=_now)
    completed_at      = Column(DateTime, nullable=True)
    created_by        = Column(String(150), nullable=True)

    customer = relationship("Customer", foreign_keys=[customer_id])

    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('SALE_ORDER', 'PURCHASE_ORDER', 'DELIVERY', 'RETURN', 'PACKING', 'GENERAL')",
            name="chk_agenda_entity_type"
        ),
        CheckConstraint(
            "status IN ('PENDIENTE', 'COMPLETADA', 'CANCELADA')",
            name="chk_agenda_status"
        ),
        Index("ix_agenda_cust_status", "customer_id", "status"),
        Index("ix_agenda_entity", "entity_type", "entity_id"),
    )


class OmnichannelInteraction(Base):
    """Auditoria y registro de consultas seguras del asistente omnicanal."""
    __tablename__ = "omnichannel_interactions"

    id                  = Column(Integer, primary_key=True, index=True)
    channel             = Column(String(30), nullable=False)
    # WHATSAPP | WEB | KOMMO | API | EMAIL
    customer_id         = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    conversation_id     = Column(String(150), nullable=True, index=True)
    action_requested    = Column(String(50), nullable=False)
    # ESTADO_COTIZACION | ESTADO_PEDIDO | PRODUCTOS_COMPRADOS | TRACKING_LOGISTICO |
    # SALDO_PENDIENTE | MERCANCIA_DISPONIBLE | EMPAQUE_ENTREGA | GUIAS_TRANSPORTE | DEVOLUCIONES
    result_summary      = Column(Text, nullable=True)
    result_data         = Column(Text, nullable=True)  # JSON payload
    related_entity_type = Column(String(30), nullable=True)
    related_entity_id   = Column(Integer, nullable=True)
    actor_type          = Column(String(30), nullable=False, default="BOT")
    # BOT | AGENT | USER
    actor_name          = Column(String(150), nullable=True)
    status              = Column(String(30), nullable=False, default="SUCCESS")
    # SUCCESS | ERROR | UNAUTHORIZED
    created_at          = Column(DateTime, default=_now)

    customer = relationship("Customer", foreign_keys=[customer_id])

    __table_args__ = (
        CheckConstraint(
            "channel IN ('WHATSAPP', 'WEB', 'KOMMO', 'API', 'EMAIL')",
            name="chk_omni_channel"
        ),
        CheckConstraint(
            "actor_type IN ('BOT', 'AGENT', 'USER')",
            name="chk_omni_actor_type"
        ),
        CheckConstraint(
            "status IN ('SUCCESS', 'ERROR', 'UNAUTHORIZED')",
            name="chk_omni_status"
        ),
        Index("ix_omni_cust_action", "customer_id", "action_requested"),
    )


class CustomerContactPreference(Base):
    """Preferencias de contacto de marketing y consentimiento de Habeas Data."""
    __tablename__ = "customer_contact_preferences"

    id                   = Column(Integer, primary_key=True, index=True)
    customer_id          = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    whatsapp_opt_in      = Column(Boolean, nullable=False, default=True)
    email_opt_in         = Column(Boolean, nullable=False, default=True)
    sms_opt_in           = Column(Boolean, nullable=False, default=False)
    phone_opt_in         = Column(Boolean, nullable=False, default=True)
    habeas_data_accepted = Column(Boolean, nullable=False, default=True)
    consent_channel      = Column(String(50), nullable=False, default="WEB")
    # WEB | STORE | CRM | WHATSAPP
    consent_date         = Column(DateTime, default=_now)
    notes                = Column(Text, nullable=True)
    created_at           = Column(DateTime, default=_now)
    updated_at           = Column(DateTime, default=_now, onupdate=_now)

    customer = relationship("Customer", foreign_keys=[customer_id])


class IntegrationWebhookEvent(Base):
    """Registro desacoplado de webhooks entrantes y salientes con idempotencia y reintentos."""
    __tablename__ = "integration_webhook_events"

    id              = Column(Integer, primary_key=True, index=True)
    provider        = Column(String(50), nullable=False)
    # WHATSAPP | KOMMO | MERCADO_PAGO | WOMPI | PAYU | COORDINADORA | SERVIENTREGA | INTERRAPIDISIMO | ENVIA | ECOMMERCE
    event_type      = Column(String(100), nullable=False)
    idempotency_key = Column(String(150), nullable=False)
    direction       = Column(String(20), nullable=False, default="INBOUND")
    # INBOUND | OUTBOUND
    payload         = Column(Text, nullable=False)  # JSON payload
    headers         = Column(Text, nullable=True)   # JSON headers
    status          = Column(String(30), nullable=False, default="PENDING")
    # PENDING | PROCESSED | FAILED | RETRYING
    attempts        = Column(Integer, nullable=False, default=0)
    max_attempts    = Column(Integer, nullable=False, default=3)
    last_error      = Column(Text, nullable=True)
    dead_letter     = Column(Boolean, nullable=False, default=False)
    processed_at    = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=_now)
    updated_at      = Column(DateTime, default=_now, onupdate=_now)

    __table_args__ = (
        UniqueConstraint("provider", "idempotency_key", name="uq_iwe_provider_key"),
        CheckConstraint("direction IN ('INBOUND', 'OUTBOUND')", name="chk_iwe_direction"),
        CheckConstraint("status IN ('PENDING', 'PROCESSED', 'FAILED', 'RETRYING')", name="chk_iwe_status"),
        Index("ix_iwe_provider_status", "provider", "status"),
        Index("ix_iwe_dead_letter", "dead_letter"),
    )
