"""
Schemas Pydantic para la integracion WhatsApp Business API (Meta).
BLOQUE 5 - Modo Sombra: solo recepcion y registro, cero acciones operativas.
"""
from __future__ import annotations

import enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enum de estados del evento
# ---------------------------------------------------------------------------

class WhatsAppEventStatus(str, enum.Enum):
    PENDING     = "PENDING"
    RECEIVED    = "RECEIVED"
    PROCESSING  = "PROCESSING"
    PROCESSED   = "PROCESSED"
    FAILED      = "FAILED"
    RETRYING    = "RETRYING"
    DEAD_LETTER = "DEAD_LETTER"


# ---------------------------------------------------------------------------
# Verificacion del webhook (GET)
# ---------------------------------------------------------------------------

class WhatsAppWebhookVerification(BaseModel):
    """Query-params que Meta envia en el GET de verificacion del webhook."""
    hub_mode:         str = Field(..., alias="hub.mode")
    hub_verify_token: str = Field(..., alias="hub.verify_token")
    hub_challenge:    str = Field(..., alias="hub.challenge")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Estructura del payload Meta (POST)
# ---------------------------------------------------------------------------

class WATextMessage(BaseModel):
    body: Optional[str] = None


class WAMediaMessage(BaseModel):
    id:        Optional[str] = None
    mime_type: Optional[str] = None
    sha256:    Optional[str] = None
    caption:   Optional[str] = None


class WAMessage(BaseModel):
    """Un mensaje individual dentro del webhook de Meta."""
    id:        Optional[str] = None          # wamid - identificador idempotente
    from_:     Optional[str] = Field(None, alias="from")  # numero del remitente
    timestamp: Optional[str] = None
    type:      Optional[str] = None          # text | image | audio | video | document | ...
    text:      Optional[WATextMessage] = None
    image:     Optional[WAMediaMessage] = None
    audio:     Optional[WAMediaMessage] = None
    video:     Optional[WAMediaMessage] = None
    document:  Optional[WAMediaMessage] = None
    sticker:   Optional[WAMediaMessage] = None

    model_config = {"populate_by_name": True, "extra": "allow"}


class WAStatus(BaseModel):
    """Estado de entrega de un mensaje enviado."""
    id:           Optional[str] = None
    status:       Optional[str] = None   # sent | delivered | read | failed
    timestamp:    Optional[str] = None
    recipient_id: Optional[str] = None

    model_config = {"extra": "allow"}


class WAValue(BaseModel):
    messaging_product: Optional[str] = None
    metadata:          Optional[Dict[str, Any]] = None
    contacts:          Optional[List[Dict[str, Any]]] = None
    messages:          Optional[List[WAMessage]] = None
    statuses:          Optional[List[WAStatus]] = None

    model_config = {"extra": "allow"}


class WAChange(BaseModel):
    value: Optional[WAValue] = None
    field: Optional[str] = None

    model_config = {"extra": "allow"}


class WAEntry(BaseModel):
    id:      Optional[str] = None
    changes: Optional[List[WAChange]] = None

    model_config = {"extra": "allow"}


class WhatsAppWebhookPayload(BaseModel):
    """
    Estructura de alto nivel del webhook POST de Meta WhatsApp Business API.
    Acepta campos extra para ser robusto ante cambios de la API de Meta.
    """
    object:  Optional[str] = None
    entry:   Optional[List[WAEntry]] = None

    model_config = {"extra": "allow"}


# ---------------------------------------------------------------------------
# Respuesta de metricas (interna)
# ---------------------------------------------------------------------------

class WhatsAppMetrics(BaseModel):
    received:    int  = 0
    duplicates:  int  = 0
    processed:   int  = 0
    failed:      int  = 0
    shadow_mode: bool = True
