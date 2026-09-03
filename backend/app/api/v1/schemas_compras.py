"""
Pydantic schemas for ERP Compras endpoints â€” Fase 1A.
Replaces bare `body: dict` in critical write operations.
"""
from __future__ import annotations
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List, Any
import uuid


class ConfirmarRecepcionBody(BaseModel):
    idempotency_key: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        min_length=8,
        max_length=150,
        description="UUID o clave provista por el cliente para idempotencia.",
    )
    receipt_type: str = Field(
        default="FISICA",
        description="FISICA: incrementa stock vendible. LOGISTICA: solo registra evento intermedio.",
    )
    user_name: Optional[str] = None
    notas: Optional[str] = None

    @field_validator("receipt_type")
    @classmethod
    def validate_receipt_type(cls, v: str) -> str:
        if v not in ("FISICA", "LOGISTICA"):
            raise ValueError("receipt_type debe ser FISICA o LOGISTICA")
        return v


class CrearRecepcionDesdePecBody(BaseModel):
    warehouse_id: Optional[int] = None
    notas: Optional[str] = None
    created_by: Optional[str] = None
    force_full: bool = Field(
        default=False,
        description=(
            "Si True, ignora cantidades ya recibidas y copia el total "
            "ordenado. Ãštil para registrar excedentes. Por defecto copia "
            "solo la cantidad pendiente (qty_ordenada - qty_ya_recibida)."
        ),
    )


class ActualizarTrackingBody(BaseModel):
    stage_name: str = Field(min_length=1, max_length=100)
    new_status: str = Field(min_length=1, max_length=50)
    tracking_number: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = None
    user_name: Optional[str] = None

    @field_validator("new_status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        allowed = ("PENDIENTE", "EN_PROCESO", "COMPLETADO", "CANCELADO")
        if v not in allowed:
            raise ValueError(f"new_status debe ser uno de: {allowed}")
        return v


class ProductoLineaBody(BaseModel):
    sku_id: Optional[int] = None
    nombre: Optional[str] = None
    cantidad: int = Field(ge=1)
    precio_usd: Optional[float] = Field(default=None, ge=0)
    variante: Optional[str] = None
    imagen_url: Optional[str] = None


class CrearPecBody(BaseModel):
    supplier_id: int
    notas: Optional[str] = None
    fecha_entrega_estimada: Optional[str] = None
    warehouse_id: Optional[int] = None
    created_by: Optional[str] = None
    productos: List[ProductoLineaBody] = Field(default_factory=list)


class CancelarSolicitudBody(BaseModel):
    motivo: str = Field(min_length=5, max_length=500)
    user_name: Optional[str] = None


class RegistrarPagoBody(BaseModel):
    monto: float = Field(gt=0)
    tipo: str = Field(description="ANTICIPO | ABONO | SALDO | DEVOLUCION")
    referencia: Optional[str] = None
    notas: Optional[str] = None
    user_name: Optional[str] = None

    @field_validator("tipo")
    @classmethod
    def validate_tipo(cls, v: str) -> str:
        allowed = ("ANTICIPO", "ABONO", "SALDO", "DEVOLUCION", "AJUSTE")
        if v not in allowed:
            raise ValueError(f"tipo debe ser uno de: {allowed}")
        return v
