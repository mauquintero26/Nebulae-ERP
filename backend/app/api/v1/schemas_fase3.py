"""
Esquemas Pydantic para Fase 3: Recepciones, Kárdex, Reservas, Cuarentena y Disponibilidad.
"""
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
import datetime
from decimal import Decimal


# ─── KARDEX ──────────────────────────────────────────────────────────────────

class KardexMovementItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    operation_id: int
    operation_type: Optional[str] = None
    source_document_type: Optional[str] = None
    source_document_numero: Optional[str] = None
    sku_id: int
    sku: Optional[str] = None
    product_name: Optional[str] = None
    quantity: int
    direction: Optional[str] = None
    owner: str = "NEBULAE"
    warehouse_id: Optional[int] = None
    warehouse_name: Optional[str] = None
    unit_cost_cop: Optional[float] = None
    created_at: Optional[datetime.datetime] = None
    created_by: Optional[str] = None
    idempotency_key: Optional[str] = None


# ─── RESERVAS ────────────────────────────────────────────────────────────────

class CreateReservationRequest(BaseModel):
    sku_id: int
    warehouse_id: int
    quantity: Decimal = Field(gt=0, description="Cantidad positiva a reservar")
    owner: str = Field(default="NEBULAE", description="Propietario del inventario: NEBULAE o MAU")
    sale_order_line_id: Optional[int] = None
    expires_hours: Optional[int] = Field(default=48, ge=1, le=720)
    notes: Optional[str] = None


class ReservationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku_id: int
    warehouse_id: int
    owner: str
    quantity_reserved: float
    sale_order_line_id: Optional[int] = None
    status: str
    expires_at: Optional[datetime.datetime] = None
    created_at: Optional[datetime.datetime] = None
    released_at: Optional[datetime.datetime] = None
    converted_at: Optional[datetime.datetime] = None
    notes: Optional[str] = None


# ─── DISPONIBILIDAD DERIVADA ─────────────────────────────────────────────────

class SkuAvailabilityResponse(BaseModel):
    sku_id: int
    sku: str
    product_name: Optional[str] = None
    warehouse_id: int
    warehouse_name: Optional[str] = None
    stock_fisico: float
    stock_reservado: float
    stock_cuarentena: float
    stock_disponible: float
    stock_en_transito: float
    balance_nebulae: float
    balance_mau: float


# ─── CUARENTENA ──────────────────────────────────────────────────────────────

class QuarantineItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku_id: int
    sku: Optional[str] = None
    product_name: Optional[str] = None
    warehouse_id: int
    warehouse_name: Optional[str] = None
    gr_line_id: Optional[int] = None
    quantity: float
    reason: str
    status: str
    notes: Optional[str] = None
    created_at: Optional[datetime.datetime] = None
    resolved_at: Optional[datetime.datetime] = None
    resolved_by: Optional[str] = None


class ResolveQuarantineRequest(BaseModel):
    action: str = Field(..., description="LIBERAR | DEVUELTO_PROVEEDOR | DESTRUIDO")
    notes: Optional[str] = None
