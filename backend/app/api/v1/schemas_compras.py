"""
Pydantic schemas for ERP Compras endpoints — Fase 1A v4.

idempotency_key is MANDATORY in ConfirmarRecepcionBody.
The frontend must generate a UUID client-side before calling POST /confirmar.
While the frontend does not yet send the key, it must be passed in the JSON body.
Compatibility note: current frontend sends body as JSON dict — add idempotency_key
to that dict in the frontend's confirmar() call without changing the visual design.
"""
from __future__ import annotations
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List, Any


class ConfirmarRecepcionBody(BaseModel):
    idempotency_key: str = Field(
        min_length=8,
        max_length=150,
        description=(
            "OBLIGATORIA. UUID o clave única generada por el cliente "
            "antes de enviar la solicitud. Garantiza idempotencia: "
            "la misma clave con el mismo payload retorna el resultado original "
            "sin re-procesar. El frontend debe generarla con crypto.randomUUID() "
            "antes de llamar al endpoint de confirmación."
        ),
    )
    receipt_type: str = Field(
        default="FISICA",
        description="FISICA: incrementa stock vendible. LOGISTICA: solo registra evento intermedio.",
    )
    user_name: Optional[str] = None
    notas: Optional[str] = None
    allow_excess: bool = Field(
        default=False,
        description="Si True, permite qty_recibida > qty_esperada (flujo de excedente).",
    )

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
            "ordenado. Útil para registrar excedentes. Por defecto copia "
            "solo la cantidad pendiente (qty_ordenada - qty_ya_recibida)."
        ),
    )


class ActualizarTrackingBody(BaseModel):
    """Schema for PATCH /pedidos/{id}/tracking.
    
    The frontend sends `stage` and `status` as field names.
    We use aliases so the endpoint accepts both the frontend names
    and the canonical names, without changing the frontend.
    """
    stage_name: str = Field(
        alias="stage",
        min_length=1,
        max_length=100,
        description="Nombre de la etapa de tracking (ej: PROVEEDOR_CASILLERO).",
    )
    new_status: str = Field(
        alias="status",
        min_length=1,
        max_length=50,
        description="Nuevo estado de la etapa.",
    )
    tracking_number: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = None
    user_name: Optional[str] = None

    model_config = {"populate_by_name": True}

    @field_validator("new_status", mode="before")
    @classmethod
    def validate_status(cls, v: str) -> str:
        allowed = ("PENDIENTE", "EN_PROCESO", "COMPLETADO", "CANCELADO")
        if v not in allowed:
            raise ValueError(f"status debe ser uno de: {', '.join(allowed)}")
        return v


class ProductoLineaBody(BaseModel):
    sku_id: Optional[int] = None
    nombre: Optional[str] = None
    cantidad: int = Field(ge=1)
    precio_usd: Optional[float] = Field(default=None, ge=0)
    variante: Optional[str] = None
    imagen_url: Optional[str] = None


class CrearPecBody(BaseModel):
    """Schema for POST /pedidos. Flexible to match current frontend."""
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    supplier_ref: Optional[str] = None
    ven_id: Optional[int] = None
    ven_numero: Optional[str] = None
    modalidad_pago: Optional[str] = "Contado"
    metodo_pago: Optional[str] = None
    warehouse_id: Optional[int] = None
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    dias_entrega: int = Field(default=15, ge=1, le=365)
    subtotal_cop: float = Field(default=0, ge=0)
    total_cop: float = Field(default=0, ge=0)
    notas: Optional[str] = None
    productos: List[Any] = Field(default_factory=list)
    created_by: Optional[str] = None


class CancelarSolicitudBody(BaseModel):
    """Frontend sends 'razon'; schema maps to canonical 'motivo' via alias."""
    motivo: str = Field(
        alias="razon",
        min_length=5,
        max_length=500,
        description="Razon de cancelacion (campo 'razon' en el frontend).",
    )
    user_name: Optional[str] = None

    model_config = {"populate_by_name": True}


class RegistrarPagoBody(BaseModel):
    monto: float = Field(gt=0)
    tipo: str = Field(description="ANTICIPO | ABONO | SALDO | DEVOLUCION | AJUSTE")
    referencia: Optional[str] = None
    notas: Optional[str] = None
    user_name: Optional[str] = None

    @field_validator("tipo")
    @classmethod
    def validate_tipo(cls, v: str) -> str:
        allowed = ("ANTICIPO", "ABONO", "SALDO", "DEVOLUCION", "AJUSTE")
        if v not in allowed:
            raise ValueError(f"tipo debe ser uno de: {', '.join(allowed)}")
        return v