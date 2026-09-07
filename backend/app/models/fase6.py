"""
Fase 6 - Modelos de Consolidacion Legacy, Observabilidad y Gobernanza:
- LegacyConsolidationAuditLog: Auditoria de eventos y trafico sobre entidades y endpoints legacy.
- LegacyParitySnapshot: Evaluaciones periodicas y comparativas de paridad numerica y financiera entre legacy y canonico.
- LegacyGovernancePolicy: Politicas operativas de desactivacion gradual, deprecacion y modos de conmutacion.
"""
import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Numeric,
    Text, ForeignKey, UniqueConstraint, Index, CheckConstraint
)
from sqlalchemy.orm import relationship
from app.db.database import Base


def _now():
    return datetime.datetime.utcnow()


class LegacyConsolidationAuditLog(Base):
    """Auditoria de eventos de trafico e intercepcion sobre endpoints y entidades legacy."""
    __tablename__ = "legacy_consolidation_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False)
    # LEGACY_WRITE_INTERCEPTED | LEGACY_READ | PARITY_CHECK | DISCREPANCY_DETECTED | SYNC_COMPLETED | GOVERNANCE_CHANGE
    legacy_endpoint = Column(String(255), nullable=False)
    http_method = Column(String(10), nullable=False)
    entity_type = Column(String(50), nullable=False)
    # SALES_ORDER | PURCHASE_ORDER | QUOTATION | FINANCE | STORE
    legacy_id = Column(Integer, nullable=True)
    canonical_id = Column(Integer, nullable=True)
    discrepancy_details = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="RECORDED")
    # RECORDED | ALIGNED | DIVERGENT | RESOLVED
    created_at = Column(DateTime, default=_now, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "event_type IN ('LEGACY_WRITE_INTERCEPTED', 'LEGACY_READ', 'PARITY_CHECK', 'DISCREPANCY_DETECTED', 'SYNC_COMPLETED', 'GOVERNANCE_CHANGE')",
            name="chk_lcal_event_type"
        ),
        CheckConstraint(
            "status IN ('RECORDED', 'ALIGNED', 'DIVERGENT', 'RESOLVED')",
            name="chk_lcal_status"
        ),
        Index("ix_lcal_event_created", "event_type", "created_at"),
        Index("ix_lcal_entity_legacy_id", "entity_type", "legacy_id"),
        Index("ix_lcal_entity_canonical_id", "entity_type", "canonical_id"),
    )


class LegacyParitySnapshot(Base):
    """Instantaneas de evaluacion de paridad matematica y financiera entre modelos legacy y canonicos."""
    __tablename__ = "legacy_parity_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    evaluated_at = Column(DateTime, default=_now, nullable=False)
    total_legacy_orders = Column(Integer, nullable=False, default=0)
    total_canonical_orders = Column(Integer, nullable=False, default=0)
    total_legacy_revenue_cop = Column(Numeric(16, 2), nullable=False, default=0.0)
    total_canonical_revenue_cop = Column(Numeric(16, 2), nullable=False, default=0.0)
    total_legacy_purchases = Column(Integer, nullable=False, default=0)
    total_canonical_purchases = Column(Integer, nullable=False, default=0)
    unmatched_orders_count = Column(Integer, nullable=False, default=0)
    discrepancies_count = Column(Integer, nullable=False, default=0)
    discrepancies_json = Column(Text, nullable=True)
    parity_score_pct = Column(Numeric(5, 2), nullable=False, default=100.0)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    user = relationship("User", foreign_keys=[created_by_user_id])

    __table_args__ = (
        Index("ix_lps_evaluated_at", "evaluated_at"),
    )


class LegacyGovernancePolicy(Base):
    """Directiva centralizada de gobernanza y ciclo de vida de deprecacion para subsistemas legacy."""
    __tablename__ = "legacy_governance_policies"

    id = Column(Integer, primary_key=True, index=True)
    policy_name = Column(String(50), nullable=False, default="DEFAULT", unique=True)
    mode = Column(String(30), nullable=False, default="DUAL_WRITE")
    # DUAL_WRITE | READ_ONLY | CANONICAL_PRIMARY
    deprecation_header_enabled = Column(Boolean, nullable=False, default=True)
    sunset_date = Column(String(50), nullable=False, default="2026-12-31")
    allow_legacy_writes = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)
    updated_by = Column(String(100), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "mode IN ('DUAL_WRITE', 'READ_ONLY', 'CANONICAL_PRIMARY')",
            name="chk_lgp_mode"
        ),
    )
