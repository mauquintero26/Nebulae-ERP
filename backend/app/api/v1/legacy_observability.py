"""
legacy_observability.py — Endpoints de Observabilidad, Gobernanza y Consolidacion Legacy (Fase 6).
Rutas registradas bajo el prefijo: /api/v1/legacy
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

from app.db.database import get_db
from app.models.users import User
from app.api.dependencies import require_roles, ROLE_ADMIN, ROLE_FINANZAS, ALL_ERP_ROLES
from app.models.fase6 import (
    LegacyConsolidationAuditLog,
    LegacyParitySnapshot,
    LegacyGovernancePolicy
)
from app.services.legacy_consolidation import (
    get_or_create_governance_policy,
    compare_sales_parity,
    compare_purchases_parity,
    compare_financial_parity,
    generate_and_save_parity_snapshot,
    reconcile_and_backfill_orphan_legacy,
    record_legacy_audit_log,
    _now
)

router = APIRouter()


class GovernanceUpdateRequest(BaseModel):
    mode: Optional[str] = None  # DUAL_WRITE | READ_ONLY | CANONICAL_PRIMARY
    deprecation_header_enabled: Optional[bool] = None
    sunset_date: Optional[str] = None
    allow_legacy_writes: Optional[bool] = None


@router.get("/status", response_model=dict)
def get_legacy_status(
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_FINANZAS)),
    db: Session = Depends(get_db)
):
    """Retorna el estado de salud, directiva activa y resumen de observabilidad del subsistema legacy."""
    policy = get_or_create_governance_policy(db)
    latest_snapshot = db.query(LegacyParitySnapshot).order_by(
        LegacyParitySnapshot.evaluated_at.desc()
    ).first()

    # Conteos de logs por evento
    event_counts = {}
    counts = db.query(
        LegacyConsolidationAuditLog.event_type,
        func.count(LegacyConsolidationAuditLog.id)
    ).group_by(LegacyConsolidationAuditLog.event_type).all()
    for ev_type, count in counts:
        event_counts[ev_type] = count

    parity_score = float(latest_snapshot.parity_score_pct) if latest_snapshot else 100.0
    health = "HEALTHY" if parity_score >= 90.0 else "DEGRADED"

    return {
        "status": "success",
        "data": {
            "health": health,
            "governance_mode": policy.mode,
            "deprecation_headers_active": policy.deprecation_header_enabled,
            "sunset_date": policy.sunset_date,
            "allow_legacy_writes": policy.allow_legacy_writes,
            "latest_parity_score_pct": parity_score,
            "last_evaluation_at": latest_snapshot.evaluated_at.isoformat() if latest_snapshot else None,
            "audit_events_summary": event_counts
        }
    }


@router.get("/parity-report", response_model=dict)
def get_parity_report(
    persist: bool = Query(False, description="Persistir una nueva instantanea en la base de datos"),
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_FINANZAS)),
    db: Session = Depends(get_db)
):
    """
    Ejecuta o consulta el reporte exhaustivo de paridad:
    - Comparacion de ordenes y recaudos de ventas.
    - Comparacion de pedidos de compra y recepciones.
    - Comparacion de P&L financiero.
    - Metricas exactas de alineacion y discrepancias.
    """
    if persist:
        snapshot = generate_and_save_parity_snapshot(db, user_id=user.id)
        return {
            "status": "success",
            "data": {
                "snapshot_id": snapshot.id,
                "evaluated_at": snapshot.evaluated_at.isoformat(),
                "parity_score_pct": float(snapshot.parity_score_pct),
                "unmatched_orders_count": snapshot.unmatched_orders_count,
                "discrepancies_count": snapshot.discrepancies_count,
                "total_legacy_revenue_cop": float(snapshot.total_legacy_revenue_cop),
                "total_canonical_revenue_cop": float(snapshot.total_canonical_revenue_cop),
                "details": snapshot.discrepancies_json
            }
        }
    else:
        sales = compare_sales_parity(db)
        purchases = compare_purchases_parity(db)
        financial = compare_financial_parity(db)

        unmatched = sales["unmatched_legacy_orders_count"] + purchases["unmatched_purchases_count"]
        discrepancies = sales["discrepancies_count"]
        score = max(0.0, 100.0 - ((unmatched * 5.0) + (discrepancies * 2.5)))

        return {
            "status": "success",
            "data": {
                "parity_score_pct": round(score, 2),
                "sales_parity": sales,
                "purchases_parity": purchases,
                "financial_parity": financial,
                "is_fully_aligned": (unmatched == 0 and discrepancies == 0)
            }
        }


@router.post("/reconcile-sync", response_model=dict)
def trigger_reconcile_sync(
    user: User = Depends(require_roles(*ROLE_ADMIN)),
    db: Session = Depends(get_db)
):
    """Ejecuta la reconciliacion idempotente de entidades legacy huerfanas hacia el nucleo canonico."""
    result = reconcile_and_backfill_orphan_legacy(db)
    # Generar snapshot tras la sincronizacion
    snapshot = generate_and_save_parity_snapshot(db, user_id=user.id)
    result["new_parity_score_pct"] = float(snapshot.parity_score_pct)
    return {
        "status": "success",
        "data": result
    }


@router.get("/audit-logs", response_model=dict)
def list_legacy_audit_logs(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    event_type: Optional[str] = None,
    entity_type: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    user: User = Depends(require_roles(*ROLE_ADMIN)),
    db: Session = Depends(get_db)
):
    """Consulta paginada de la bitacora de auditoria de intercepcion y observabilidad legacy."""
    q = db.query(LegacyConsolidationAuditLog)
    if event_type:
        q = q.filter(LegacyConsolidationAuditLog.event_type == event_type)
    if entity_type:
        q = q.filter(LegacyConsolidationAuditLog.entity_type == entity_type)
    if status_filter:
        q = q.filter(LegacyConsolidationAuditLog.status == status_filter)

    total = q.count()
    items = q.order_by(LegacyConsolidationAuditLog.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "status": "success",
        "data": {
            "total": total,
            "offset": offset,
            "limit": limit,
            "logs": [
                {
                    "id": item.id,
                    "event_type": item.event_type,
                    "legacy_endpoint": item.legacy_endpoint,
                    "http_method": item.http_method,
                    "entity_type": item.entity_type,
                    "legacy_id": item.legacy_id,
                    "canonical_id": item.canonical_id,
                    "status": item.status,
                    "discrepancy_details": item.discrepancy_details,
                    "created_at": item.created_at.isoformat()
                }
                for item in items
            ]
        }
    }


@router.get("/governance", response_model=dict)
def get_governance_policy(
    user: User = Depends(require_roles(*ROLE_ADMIN)),
    db: Session = Depends(get_db)
):
    """Consulta la directiva de gobernanza de ciclo de vida de deprecacion."""
    policy = get_or_create_governance_policy(db)
    return {
        "status": "success",
        "data": {
            "policy_name": policy.policy_name,
            "mode": policy.mode,
            "deprecation_header_enabled": policy.deprecation_header_enabled,
            "sunset_date": policy.sunset_date,
            "allow_legacy_writes": policy.allow_legacy_writes,
            "updated_at": policy.updated_at.isoformat(),
            "updated_by": policy.updated_by
        }
    }


@router.patch("/governance", response_model=dict)
def update_governance_policy(
    body: GovernanceUpdateRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN)),
    db: Session = Depends(get_db)
):
    """Actualiza la directiva de gobernanza legacy (restringido exclusivamente a ROLE_ADMIN)."""
    policy = get_or_create_governance_policy(db)

    if body.mode is not None:
        if body.mode not in ("DUAL_WRITE", "READ_ONLY", "CANONICAL_PRIMARY"):
            raise HTTPException(
                status_code=422,
                detail=f"Modo invalido '{body.mode}'. Opciones validas: DUAL_WRITE, READ_ONLY, CANONICAL_PRIMARY"
            )
        policy.mode = body.mode

    if body.deprecation_header_enabled is not None:
        policy.deprecation_header_enabled = body.deprecation_header_enabled

    if body.sunset_date is not None:
        policy.sunset_date = body.sunset_date

    if body.allow_legacy_writes is not None:
        policy.allow_legacy_writes = body.allow_legacy_writes

    policy.updated_at = _now()
    policy.updated_by = user.email or str(user.id)

    record_legacy_audit_log(
        db=db,
        event_type="GOVERNANCE_CHANGE",
        legacy_endpoint="/api/v1/legacy/governance",
        http_method="PATCH",
        entity_type="SYSTEM",
        discrepancy_details={"new_mode": policy.mode, "allow_writes": policy.allow_legacy_writes},
        status="RECORDED"
    )

    db.commit()
    db.refresh(policy)

    return {
        "status": "success",
        "data": {
            "policy_name": policy.policy_name,
            "mode": policy.mode,
            "deprecation_header_enabled": policy.deprecation_header_enabled,
            "sunset_date": policy.sunset_date,
            "allow_legacy_writes": policy.allow_legacy_writes,
            "updated_at": policy.updated_at.isoformat(),
            "updated_by": policy.updated_by
        }
    }


@router.get("/metrics", response_model=dict)
def get_legacy_metrics(
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_FINANZAS)),
    db: Session = Depends(get_db)
):
    """Metricas de telemetria en tiempo real para observabilidad del subsistema legacy."""
    policy = get_or_create_governance_policy(db)
    total_logs = db.query(func.count(LegacyConsolidationAuditLog.id)).scalar() or 0
    total_intercepted = db.query(func.count(LegacyConsolidationAuditLog.id)).filter(
        LegacyConsolidationAuditLog.event_type == "LEGACY_WRITE_INTERCEPTED"
    ).scalar() or 0
    total_discrepancies = db.query(func.count(LegacyConsolidationAuditLog.id)).filter(
        LegacyConsolidationAuditLog.event_type == "DISCREPANCY_DETECTED"
    ).scalar() or 0

    latest_snapshot = db.query(LegacyParitySnapshot).order_by(
        LegacyParitySnapshot.evaluated_at.desc()
    ).first()

    return {
        "status": "success",
        "data": {
            "telemetry": {
                "total_audit_events": total_logs,
                "total_writes_intercepted": total_intercepted,
                "discrepancies_detected_count": total_discrepancies,
                "active_governance_mode": policy.mode,
                "sunset_target": policy.sunset_date
            },
            "parity": {
                "score_pct": float(latest_snapshot.parity_score_pct) if latest_snapshot else 100.0,
                "unmatched_orders": latest_snapshot.unmatched_orders_count if latest_snapshot else 0
            }
        }
    }
