"""
Pydantic Schemas para Fase 5: Integracion del Nucleo Operativo con Modulos ERP.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
import datetime
from decimal import Decimal


class ConvertirCotizacionVentaRequest(BaseModel):
    idempotency_key: Optional[str] = Field(None, max_length=150)
    user_name: Optional[str] = Field(None, max_length=150)
    fecha_entrega_estimada: Optional[datetime.date] = None
    direccion_entrega: Optional[str] = Field(None, max_length=300)
    notas: Optional[str] = None


class AgendaActivityCreate(BaseModel):
    customer_id: int
    entity_type: str = Field(..., pattern="^(SALE_ORDER|PURCHASE_ORDER|DELIVERY|RETURN|PACKING|GENERAL)$")
    entity_id: Optional[int] = None
    activity_type: str = Field(..., max_length=50)
    title: str = Field(..., max_length=200)
    description: Optional[str] = None
    scheduled_date: Optional[datetime.datetime] = None
    due_date: Optional[datetime.datetime] = None
    status: str = Field("PENDIENTE", pattern="^(PENDIENTE|COMPLETADA|CANCELADA)$")


class AgendaActivityResponse(BaseModel):
    id: int
    customer_id: int
    entity_type: str
    entity_id: Optional[int]
    activity_type: str
    title: str
    description: Optional[str]
    scheduled_date: Optional[datetime.datetime]
    due_date: Optional[datetime.datetime]
    status: str
    deterministic_key: str
    created_at: datetime.datetime
    completed_at: Optional[datetime.datetime]

    model_config = ConfigDict(from_attributes=True)


class OmnichannelQueryRequest(BaseModel):
    customer_id: int
    query_type: str = Field(
        ...,
        pattern="^(ESTADO_COTIZACION|ESTADO_PEDIDO|PRODUCTOS_COMPRADOS|TRACKING_LOGISTICO|SALDO_PENDIENTE|MERCANCIA_DISPONIBLE|EMPAQUE_ENTREGA|GUIAS_TRANSPORTE|DEVOLUCIONES)$"
    )
    entity_id: Optional[int] = None
    channel: str = Field("WHATSAPP", pattern="^(WHATSAPP|WEB|KOMMO|API|EMAIL)$")
    conversation_id: Optional[str] = Field(None, max_length=150)
    actor_type: str = Field("BOT", pattern="^(BOT|AGENT|USER)$")
    actor_name: Optional[str] = Field(None, max_length=150)


class OmnichannelQueryResponse(BaseModel):
    status: str
    action: str
    customer_id: int
    customer_name: str
    summary: str
    data: Optional[Dict[str, Any]] = None
    assistant_message: str


class CustomerContactPreferenceUpdate(BaseModel):
    whatsapp_opt_in: Optional[bool] = None
    email_opt_in: Optional[bool] = None
    sms_opt_in: Optional[bool] = None
    phone_opt_in: Optional[bool] = None
    habeas_data_accepted: Optional[bool] = None
    consent_channel: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None


class CustomerContactPreferenceResponse(BaseModel):
    customer_id: int
    whatsapp_opt_in: bool
    email_opt_in: bool
    sms_opt_in: bool
    phone_opt_in: bool
    habeas_data_accepted: bool
    consent_channel: str
    consent_date: datetime.datetime
    notes: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class WebhookPayloadIn(BaseModel):
    event_type: str = Field(..., max_length=100)
    idempotency_key: str = Field(..., max_length=150)
    payload: Dict[str, Any]
    headers: Optional[Dict[str, Any]] = None


class WebhookRetryRequest(BaseModel):
    max_retries: Optional[int] = 3
    provider: Optional[str] = None
