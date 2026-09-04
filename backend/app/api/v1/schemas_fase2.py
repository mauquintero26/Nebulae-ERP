"""
Esquemas Pydantic para Fase 2: Compras, Paquetes, Transito y Consolidaciones.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator
from datetime import date, datetime
from decimal import Decimal


# ─────────────────────────────────────────────────────────────────────────────
# 1. Asignaciones M:N de Compras
# ─────────────────────────────────────────────────────────────────────────────

class ProcurementAllocationItem(BaseModel):
    po_line_id: int
    allocation_type: str = Field(..., description="CUSTOMER_ORDER, NEBULAE_STOCK o MAU_STOCK")
    sale_order_line_id: Optional[int] = None
    quantity_allocated: Decimal = Field(gt=Decimal("0"), description="Cantidad asignada mayor a 0")

    @field_validator("allocation_type")
    @classmethod
    def validate_alloc_type(cls, v: str) -> str:
        valid = {"CUSTOMER_ORDER", "NEBULAE_STOCK", "MAU_STOCK"}
        upper_v = v.upper().strip()
        if upper_v not in valid:
            raise ValueError(f"allocation_type debe ser uno de: {valid}")
        return upper_v


class ProcurementAllocationCreate(BaseModel):
    allocations: List[ProcurementAllocationItem]


class ProcurementAllocationOut(BaseModel):
    id: int
    po_line_id: int
    allocation_type: str
    sale_order_line_id: Optional[int] = None
    quantity_allocated: float
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Paquetes y Envios (Shipments)
# ─────────────────────────────────────────────────────────────────────────────

class ShipmentLineIn(BaseModel):
    po_line_id: int
    quantity: Decimal = Field(gt=Decimal("0"), default=Decimal("1"))


class ShipmentCreate(BaseModel):
    pec_id: Optional[int] = None
    carrier: str
    tracking_number: str
    carrier_service: Optional[str] = None
    origin: Optional[str] = "PROVEEDOR"
    destination: Optional[str] = "MIAMI"
    agency_id: Optional[str] = None
    estimated_delivery_date: Optional[date] = None
    weight_lb: Optional[Decimal] = Field(None, ge=Decimal("0"))
    weight_kg: Optional[Decimal] = Field(None, ge=Decimal("0"))
    shipping_cost_usd: Optional[Decimal] = Field(None, ge=Decimal("0"))
    notes: Optional[str] = None
    lines: Optional[List[ShipmentLineIn]] = []


class ShipmentEventCreate(BaseModel):
    event_type: str = Field(
        ...,
        description="PREPARANDO_PROVEEDOR, ENVIADO_A_MIAMI, RECIBIDO_MIAMI, PENDIENTE_CONSOLIDACION, "
                    "CONSOLIDADO, EN_VUELO, EN_DIAN, LIBERADO_DIAN, RECIBIDO_BOGOTA, "
                    "ENVIADO_BARRANQUILLA, RECIBIDO_BARRANQUILLA"
    )
    location: Optional[str] = None
    user_name: Optional[str] = None
    notes: Optional[str] = None
    evidence_url: Optional[str] = None
    idempotency_key: Optional[str] = None


class ShipmentEventOut(BaseModel):
    id: int
    shipment_id: int
    event_type: str
    location: Optional[str] = None
    user_name: Optional[str] = None
    notes: Optional[str] = None
    evidence_url: Optional[str] = None
    idempotency_key: Optional[str] = None
    timestamp: datetime

    model_config = {"from_attributes": True}


class ShipmentOut(BaseModel):
    id: int
    shipment_number: str
    pec_id: Optional[int] = None
    carrier: str
    tracking_number: str
    carrier_service: Optional[str] = None
    origin: str
    destination: str
    status_fise: str
    commercial_status: str
    agency_id: Optional[str] = None
    estimated_delivery_date: Optional[date] = None
    actual_delivery_date: Optional[date] = None
    weight_lb: Optional[float] = None
    weight_kg: Optional[float] = None
    shipping_cost_usd: Optional[float] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    events: Optional[List[ShipmentEventOut]] = []

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────────────────────
# 3. Consolidaciones
# ─────────────────────────────────────────────────────────────────────────────

class ConsolidationCreate(BaseModel):
    carrier: Optional[str] = None
    tracking_international: Optional[str] = None
    agency_name: Optional[str] = "Miami Agency 1"
    origin: Optional[str] = "MIAMI"
    destination: Optional[str] = "BARRANQUILLA"
    trm: Optional[Decimal] = Field(Decimal("0"), ge=Decimal("0"))
    total_freight_usd: Optional[Decimal] = Field(Decimal("0"), ge=Decimal("0"))
    total_freight_cop: Optional[Decimal] = Field(Decimal("0"), ge=Decimal("0"))
    notes: Optional[str] = None
    shipment_ids: Optional[List[int]] = []


class ConsolidationAddShipments(BaseModel):
    shipment_ids: List[int]


class ConsolidationCostAllocation(BaseModel):
    allocation_method: str = Field("WEIGHT", description="WEIGHT o EQUAL")
    total_freight_usd: Optional[Decimal] = Field(None, ge=Decimal("0"))
    trm: Optional[Decimal] = Field(None, ge=Decimal("0"))



class ConsolidationUpdate(BaseModel):
    carrier: Optional[str] = None
    tracking_international: Optional[str] = None
    agency_name: Optional[str] = None
    customs_declaration_number: Optional[str] = None
    notes: Optional[str] = None
    estimated_arrival_date: Optional[date] = None


class ConsolidationStatusUpdate(BaseModel):
    status: str  # ABIERTA, CONSOLIDADA, EN_VUELO, EN_DIAN, LIBERADA, RECIBIDA_DESTINO, CERRADA
    notes: Optional[str] = None



class ConsolidationOut(BaseModel):
    id: int
    consolidation_number: str
    carrier: Optional[str] = None
    tracking_international: Optional[str] = None
    agency_name: Optional[str] = None
    origin: str
    destination: str
    total_weight_kg: float
    total_volume_cbm: float
    total_freight_usd: float
    total_freight_cop: float
    trm: float
    customs_declaration_number: Optional[str] = None
    status: str
    departure_date: Optional[datetime] = None
    estimated_arrival_date: Optional[datetime] = None
    actual_arrival_date: Optional[datetime] = None
    dian_entered_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    shipments_count: int = 0

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────────────────────
# 4. Alertas de Transito
# ─────────────────────────────────────────────────────────────────────────────

class TransitAlert(BaseModel):
    alert_type: str
    severity: str  # BAJA, MEDIA, ALTA, CRITICA
    document_type: str  # PEC, SHIPMENT, CONSOLIDATION
    document_id: int
    document_reference: str
    message: str
    days_delay: int = 0
    suggested_action: str
