"""
BLOQUE 5 - Servicio de Modo Sombra para WhatsApp Business API.

REGLAS ABSOLUTAS DE MODO SOMBRA:
  - Solo recepcion y registro de eventos.
  - NO contestar mensajes automaticamente.
  - NO crear pedidos.
  - NO registrar pagos.
  - NO modificar inventario.
  - NO ejecutar ninguna accion operativa.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.fase5 import IntegrationWebhookEvent
from app.schemas.whatsapp import WhatsAppEventStatus, WhatsAppMetrics

logger = logging.getLogger("whatsapp_shadow")

# ---------------------------------------------------------------------------
# Configuracion de entorno
# ---------------------------------------------------------------------------

SHADOW_MODE: bool = os.getenv("WHATSAPP_SHADOW_MODE", "true").lower() != "false"
APP_SECRET:  str  = os.getenv("WHATSAPP_APP_SECRET", "")

# ---------------------------------------------------------------------------
# Metricas en memoria (thread-safe, proceso unico)
# ---------------------------------------------------------------------------

_lock = threading.Lock()
_metrics: Dict[str, int] = {
    "received":   0,
    "duplicates": 0,
    "processed":  0,
    "failed":     0,
}


def _inc(key: str, amount: int = 1) -> None:
    with _lock:
        _metrics[key] = _metrics.get(key, 0) + amount


# ---------------------------------------------------------------------------
# API publica del servicio
# ---------------------------------------------------------------------------

def verify_signature(raw_body: bytes, signature_header: str) -> bool:
    """
    Valida la firma HMAC-SHA256 que Meta incluye en X-Hub-Signature-256.
    Retorna False si APP_SECRET no esta configurado (no falla ruidosamente,
    solo registra advertencia y bloquea en modo estricto).
    """
    if not APP_SECRET:
        logger.warning(
            "WHATSAPP_APP_SECRET no configurado; "
            "firma no puede verificarse. Evento rechazado."
        )
        return False

    if not signature_header or not signature_header.startswith("sha256="):
        logger.warning("Cabecera X-Hub-Signature-256 ausente o con formato invalido.")
        return False

    expected_sig = "sha256=" + hmac.new(
        key=APP_SECRET.encode("utf-8"),
        msg=raw_body,
        digestmod=hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected_sig, signature_header)


def check_duplicate(db: Session, wamid: str) -> bool:
    """
    Verifica si el wamid ya fue registrado para esta integracion.
    Retorna True si es duplicado, False si es nuevo.
    """
    exists = (
        db.query(IntegrationWebhookEvent)
        .filter(
            IntegrationWebhookEvent.provider == "WHATSAPP",
            IntegrationWebhookEvent.idempotency_key == wamid,
        )
        .first()
    )
    return exists is not None


def process_event_shadow(
    db: Session,
    payload: Dict[str, Any],
    raw_body: bytes,
    signature: str,
) -> Dict[str, Any]:
    """
    Registra el evento en la base de datos SIN ejecutar ninguna accion operativa.

    Flujo:
      1. Incrementa contador de recibidos.
      2. Extrae el wamid del primer mensaje (si existe) o genera clave de fallback.
      3. Verifica duplicado; si ya existe, incrementa contador y retorna.
      4. Persiste el evento con estado RECEIVED.
      5. Marca como PROCESSED.
      6. En modo sombra (siempre activo) no ejecuta nada mas.
    """
    _inc("received")

    # Extraer wamid del primer mensaje del primer entry/change
    wamid: Optional[str] = _extract_wamid(payload)
    idempotency_key = wamid or _fallback_key(raw_body)

    # Determinar tipo de evento
    event_type = _extract_event_type(payload)

    # Verificar duplicado
    if check_duplicate(db, idempotency_key):
        _inc("duplicates")
        logger.info(
            "Evento duplicado ignorado | key=%s | event_type=%s",
            _mask(idempotency_key),
            event_type,
        )
        return {"status": "duplicate", "idempotency_key": _mask(idempotency_key)}

    # Serializar payload y cabeceras (sin exponer secretos)
    payload_json = json.dumps(payload, ensure_ascii=False, default=str)
    headers_safe = json.dumps({"X-Hub-Signature-256": "***REDACTED***"})

    # Persistir evento
    db_event = IntegrationWebhookEvent(
        provider        = "WHATSAPP",
        event_type      = event_type,
        idempotency_key = idempotency_key,
        direction       = "INBOUND",
        payload         = payload_json,
        headers         = headers_safe,
        status          = WhatsAppEventStatus.RECEIVED.value,
        attempts        = 1,
        max_attempts    = 3,
    )

    try:
        db.add(db_event)
        db.flush()  # obtener id sin commit completo

        # Modo sombra: marcar inmediatamente como PROCESSED (no hay accion real)
        db_event.status       = WhatsAppEventStatus.PROCESSED.value
        db_event.processed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(db_event)

        _inc("processed")
        logger.info(
            "Evento registrado en modo sombra | id=%s | event_type=%s | shadow=%s",
            db_event.id,
            event_type,
            SHADOW_MODE,
        )
        return {
            "status":           "recorded",
            "event_id":         db_event.id,
            "event_type":       event_type,
            "shadow_mode":      SHADOW_MODE,
            "idempotency_key":  _mask(idempotency_key),
        }

    except IntegrityError:
        db.rollback()
        _inc("duplicates")
        logger.info(
            "IntegrityError (race condition de duplicado) | key=%s",
            _mask(idempotency_key),
        )
        return {"status": "duplicate", "idempotency_key": _mask(idempotency_key)}

    except Exception as exc:
        db.rollback()
        _inc("failed")
        logger.error(
            "Error al persistir evento WhatsApp | event_type=%s | error=%s",
            event_type,
            type(exc).__name__,
        )
        raise


def get_metrics() -> WhatsAppMetrics:
    """Retorna las metricas agregadas del servicio en modo sombra."""
    with _lock:
        snapshot = dict(_metrics)
    return WhatsAppMetrics(
        received    = snapshot.get("received", 0),
        duplicates  = snapshot.get("duplicates", 0),
        processed   = snapshot.get("processed", 0),
        failed      = snapshot.get("failed", 0),
        shadow_mode = SHADOW_MODE,
    )


# ---------------------------------------------------------------------------
# Helpers privados
# ---------------------------------------------------------------------------

def _extract_wamid(payload: Dict[str, Any]) -> Optional[str]:
    """Extrae el wamid del primer mensaje del primer entry/change del payload."""
    try:
        entries = payload.get("entry") or []
        for entry in entries:
            changes = entry.get("changes") or []
            for change in changes:
                value = change.get("value") or {}
                messages = value.get("messages") or []
                for msg in messages:
                    wamid = msg.get("id")
                    if wamid:
                        return wamid
    except Exception:
        pass
    return None


def _extract_event_type(payload: Dict[str, Any]) -> str:
    """Determina el tipo de evento a partir del payload de Meta."""
    try:
        entries = payload.get("entry") or []
        for entry in entries:
            changes = entry.get("changes") or []
            for change in changes:
                value = change.get("value") or {}
                if value.get("messages"):
                    msgs = value["messages"]
                    if msgs:
                        msg_type = msgs[0].get("type", "unknown")
                        return f"message:{msg_type}"
                if value.get("statuses"):
                    statuses = value["statuses"]
                    if statuses:
                        st = statuses[0].get("status", "unknown")
                        return f"status:{st}"
    except Exception:
        pass
    return "unknown"


def _fallback_key(raw_body: bytes) -> str:
    """Genera una clave de idempotencia basada en hash del body y timestamp."""
    body_hash = hashlib.sha256(raw_body).hexdigest()[:32]
    ts = str(int(time.time()))
    return f"fallback:{ts}:{body_hash}"


def _mask(key: str) -> str:
    """Enmascara parte de una clave para no exponer datos en logs."""
    if len(key) <= 8:
        return "***"
    return key[:4] + "***" + key[-4:]
