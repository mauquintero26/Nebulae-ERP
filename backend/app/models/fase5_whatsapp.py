"""
BLOQUE 5 - Verificacion de modelo WhatsApp.

La tabla `integration_webhook_events` YA EXISTE en app/models/fase5.py
como la clase IntegrationWebhookEvent.

Este archivo solo re-exporta la clase para mantener la convencion de importacion
del bloque de WhatsApp sin duplicar la definicion del modelo.
"""
from app.models.fase5 import IntegrationWebhookEvent  # noqa: F401

__all__ = ["IntegrationWebhookEvent"]
