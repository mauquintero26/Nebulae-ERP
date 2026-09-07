"""
BLOQUE 5 - Router WhatsApp Business API (Meta) en MODO SOMBRA.

Endpoints:
  GET  /api/v1/whatsapp/webhook  -- Verificacion del webhook Meta
  POST /api/v1/whatsapp/webhook  -- Recepcion de eventos en modo sombra

MODO SOMBRA OBLIGATORIO:
  - Recibe y registra eventos UNICAMENTE.
  - NO contesta mensajes automaticamente.
  - NO crea pedidos.
  - NO registra pagos.
  - NO modifica inventario.
  - NO ejecuta ninguna accion operativa.
  - Siempre retorna HTTP 200 en POST (Meta reintenta ante cualquier otro codigo).
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.whatsapp import WhatsAppMetrics
from app.services import whatsapp_shadow as shadow_svc

logger = logging.getLogger("whatsapp_webhook")

router = APIRouter()

# ---------------------------------------------------------------------------
# Variables de entorno requeridas
# ---------------------------------------------------------------------------
# WHATSAPP_VERIFY_TOKEN  -- Token de verificacion registrado en Meta Developer
# WHATSAPP_APP_SECRET    -- Secreto de la App para validar firma HMAC-SHA256
# WHATSAPP_SHADOW_MODE   -- "true" (default) activa modo sombra; "false" lo desactiva

VERIFY_TOKEN: str = os.getenv("WHATSAPP_VERIFY_TOKEN", "")
SHADOW_MODE:  bool = os.getenv("WHATSAPP_SHADOW_MODE", "true").lower() != "false"


# ===========================================================================
# GET /webhook -- Verificacion del webhook por Meta
# ===========================================================================

@router.get(
    "/webhook",
    summary="Verificacion del webhook WhatsApp (Meta hub.challenge)",
    response_class=PlainTextResponse,
    tags=["WhatsApp Webhook"],
)
async def verify_webhook(
    hub_mode:         Optional[str] = Query(None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    hub_challenge:    Optional[str] = Query(None, alias="hub.challenge"),
) -> PlainTextResponse:
    """
    Verifica la suscripcion del webhook con Meta.
    Meta envia hub.mode='subscribe', hub.verify_token y hub.challenge.
    Si el token coincide se devuelve hub.challenge como texto plano (HTTP 200).
    """
    logger.info(
        "Verificacion de webhook recibida | mode=%s | token_match=%s",
        hub_mode,
        bool(hub_verify_token and hub_verify_token == VERIFY_TOKEN),
    )

    if not VERIFY_TOKEN:
        logger.error(
            "WHATSAPP_VERIFY_TOKEN no configurado. "
            "Configure la variable de entorno antes de activar el webhook."
        )
        return PlainTextResponse("Configuration error", status_code=500)

    if hub_mode == "subscribe" and hub_verify_token == VERIFY_TOKEN:
        logger.info("Webhook verificado correctamente por Meta.")
        return PlainTextResponse(hub_challenge or "", status_code=200)

    logger.warning(
        "Verificacion de webhook fallida | mode=%s", hub_mode
    )
    return PlainTextResponse("Forbidden", status_code=403)


# ===========================================================================
# POST /webhook -- Recepcion de eventos (MODO SOMBRA)
# ===========================================================================

@router.post(
    "/webhook",
    summary="Recepcion de eventos WhatsApp en modo sombra",
    tags=["WhatsApp Webhook"],
)
async def receive_webhook(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None, alias="X-Hub-Signature-256"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Recibe y registra eventos del webhook de Meta WhatsApp Business API.

    MODO SOMBRA ACTIVO:
      - Valida firma HMAC-SHA256 del body con WHATSAPP_APP_SECRET.
      - Registra el evento en integration_webhook_events de forma idempotente (por wamid).
      - NO contesta mensajes, NO crea pedidos, NO registra pagos, NO toca inventario.
      - Siempre retorna HTTP 200 (Meta reintenta ante cualquier otro codigo).
    """
    # Leer body crudo ANTES de cualquier parseo (necesario para verificar firma)
    raw_body: bytes = await request.body()

    # ── 1. Validar firma ────────────────────────────────────────────────────
    if not shadow_svc.verify_signature(raw_body, x_hub_signature_256 or ""):
        # Meta espera HTTP 200 incluso en errores; registramos y seguimos
        logger.warning(
            "Firma X-Hub-Signature-256 invalida o ausente. "
            "Evento descartado sin procesamiento."
        )
        # Retornamos 200 para no provocar reintento de Meta,
        # pero registramos el rechazo en metricas.
        shadow_svc._inc("failed")
        return {"status": "rejected", "reason": "invalid_signature"}

    # ── 2. Parsear payload ──────────────────────────────────────────────────
    try:
        payload: Dict[str, Any] = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        logger.error("Body del webhook no es JSON valido | error=%s", type(exc).__name__)
        shadow_svc._inc("failed")
        return {"status": "error", "reason": "invalid_json"}

    # ── 3. Verificar que es un evento de WhatsApp ───────────────────────────
    if payload.get("object") != "whatsapp_business_account":
        logger.info(
            "Evento no pertenece a whatsapp_business_account | object=%s",
            payload.get("object"),
        )
        return {"status": "ignored", "reason": "not_whatsapp_event"}

    # ── 4. Procesar en modo sombra (registrar, no actuar) ───────────────────
    #       MODO SOMBRA: check estricto adicional
    if not SHADOW_MODE:
        logger.critical(
            "WHATSAPP_SHADOW_MODE=false detectado. "
            "El sistema NO esta autorizado para ejecutar acciones operativas en esta version. "
            "Establezca WHATSAPP_SHADOW_MODE=true hasta que el modulo sea auditado."
        )
        # Forzar registro de sombra igualmente; no ejecutar nada operativo
        # (la implementacion de shadow_svc.process_event_shadow nunca actua)

    try:
        result = shadow_svc.process_event_shadow(
            db        = db,
            payload   = payload,
            raw_body  = raw_body,
            signature = x_hub_signature_256 or "",
        )
    except Exception as exc:
        logger.error(
            "Error inesperado en process_event_shadow | error=%s",
            type(exc).__name__,
        )
        # HTTP 200 siempre para Meta
        return {"status": "error", "reason": "internal_error"}

    # ── 5. Respuesta HTTP 200 siempre ───────────────────────────────────────
    return {"status": "ok", "detail": result}


# ===========================================================================
# GET /webhook/metrics -- Metricas internas (acceso protegido por secreto)
# ===========================================================================

@router.get(
    "/webhook/metrics",
    summary="Metricas del webhook WhatsApp en modo sombra",
    response_model=WhatsAppMetrics,
    tags=["WhatsApp Webhook"],
)
async def get_webhook_metrics(
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret"),
) -> WhatsAppMetrics:
    """
    Retorna las metricas agregadas del webhook en modo sombra.
    Requiere la cabecera X-Internal-Secret igual a WHATSAPP_APP_SECRET
    para evitar exposicion publica.
    """
    app_secret = os.getenv("WHATSAPP_APP_SECRET", "")
    if not app_secret or x_internal_secret != app_secret:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Unauthorized")

    return shadow_svc.get_metrics()
