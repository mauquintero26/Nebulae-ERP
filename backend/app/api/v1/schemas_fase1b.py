"""
schemas_fase1b.py -- Schemas Pydantic para Fase 1B

Lineas normalizadas, asignaciones, reservas, balances y pagos.
Aliases conservan los nombres que espera el frontend actual.
"""
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, Literal
from decimal import Decimal
from datetime import date, datetime


# ---------------------------------------------------------------------------
# LINEAS DE SOLICITUD DE CLIENTE (SC)
# ---------------------------------------------------------------------------

class CustomerRequestLineIn(BaseModel):
    sku_id:         Optional[int]     = None
    description:    Optional[str]     = Field(None, max_length=300)
    quantity:       Decimal           = Field(gt=0)
    unit_price_usd: Optional[Decimal] = None
    unit_price_cop: Optional[Decimal] = None


class CustomerRequestLineOut(BaseModel):
    id:              int
    cr_id:           int
    sku_id:          Optional[int]
    description:     Optional[str]
    quantity:        Decimal
    unit_price_usd:  Optional[Decimal]
    unit_price_cop:  Optional[Decimal]
    source:          str
    migration_batch_id: Optional[str]
    created_at:      Optional[datetime]
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# LINEAS DE COTIZACION (COT)
# ---------------------------------------------------------------------------

class SalesQuotationLineIn(BaseModel):
    sku_id:         Optional[int]     = None
    cr_line_id:     Optional[int]     = None
    description:    Optional[str]     = Field(None, max_length=300)
    quantity:       Decimal           = Field(gt=0)
    unit_price_usd: Optional[Decimal] = None
    unit_price_cop: Optional[Decimal] = None
    descuento_pct:  Decimal           = Field(default=Decimal("0"), ge=0, le=100)


class SalesQuotationLineOut(BaseModel):
    id:             int
    sq_id:          int
    sku_id:         Optional[int]
    cr_line_id:     Optional[int]
    description:    Optional[str]
    quantity:       Decimal
    unit_price_usd: Optional[Decimal]
    unit_price_cop: Optional[Decimal]
    descuento_pct:  Decimal
    source:         str
    created_at:     Optional[datetime]
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# LINEAS DE PEDIDO DE VENTA ERP (PVEN)
# ---------------------------------------------------------------------------

class SaleOrderLineErpIn(BaseModel):
    sku_id:         Optional[int]     = None
    sq_line_id:     Optional[int]     = None
    description:    Optional[str]     = Field(None, max_length=300)
    quantity:       Decimal           = Field(gt=0)
    unit_price_cop: Decimal           = Field(ge=0, default=Decimal("0"))
    descuento_pct:  Decimal           = Field(default=Decimal("0"), ge=0, le=100)


class SaleOrderLineErpOut(BaseModel):
    id:             int
    so_id:          int
    sku_id:         Optional[int]
    sq_line_id:     Optional[int]
    description:    Optional[str]
    quantity:       Decimal
    unit_price_cop: Decimal
    descuento_pct:  Decimal
    source:         str
    created_at:     Optional[datetime]
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# LINEAS DE PEDIDO DE COMPRA (PEC)
# ---------------------------------------------------------------------------

class PurchaseOrderLineIn(BaseModel):
    sku_id:           Optional[int]     = None
    description:      Optional[str]     = Field(None, max_length=300)
    quantity_ordered: Decimal           = Field(gt=0)
    unit_cost_usd:    Optional[Decimal] = None
    unit_cost_cop:    Optional[Decimal] = None


class PurchaseOrderLineOut(BaseModel):
    id:               int
    pec_id:           int
    sku_id:           Optional[int]
    description:      Optional[str]
    quantity_ordered: Decimal
    unit_cost_usd:    Optional[Decimal]
    unit_cost_cop:    Optional[Decimal]
    quantity_received: Decimal
    source:           str
    created_at:       Optional[datetime]
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# ASIGNACIONES DE COMPRA
# ---------------------------------------------------------------------------

AllocationTypeEnum = Literal["CUSTOMER_ORDER", "NEBULAE_STOCK", "MAU_STOCK"]


class ProcurementAllocationIn(BaseModel):
    po_line_id:         int
    allocation_type:    AllocationTypeEnum
    sale_order_line_id: Optional[int]  = None
    quantity_allocated: Decimal        = Field(gt=0)

    @model_validator(mode="after")
    def validate_sol_required(self):
        if self.allocation_type == "CUSTOMER_ORDER" and self.sale_order_line_id is None:
            raise ValueError("sale_order_line_id es obligatorio para CUSTOMER_ORDER.")
        return self


class ProcurementAllocationOut(BaseModel):
    id:                 int
    po_line_id:         int
    allocation_type:    str
    sale_order_line_id: Optional[int]
    quantity_allocated: Decimal
    created_at:         Optional[datetime]
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# LINEAS DE RECEPCION (ENINV)
# ---------------------------------------------------------------------------

ReceiptTypeEnum = Literal["FISICA", "LOGISTICA"]


class GoodsReceiptLineIn(BaseModel):
    sku_id:              Optional[int]    = None
    po_line_id:          Optional[int]    = None
    description:         Optional[str]    = Field(None, max_length=300)
    quantity_expected:   Decimal          = Field(ge=0, default=Decimal("0"))
    quantity_received:   Decimal          = Field(ge=0, default=Decimal("0"))
    quantity_rejected:   Decimal          = Field(ge=0, default=Decimal("0"))
    quantity_quarantine: Decimal          = Field(ge=0, default=Decimal("0"))
    unit_cost_cop:       Optional[Decimal] = None
    receipt_type:        ReceiptTypeEnum  = "FISICA"

    @field_validator("quantity_received", "quantity_rejected", "quantity_quarantine")
    @classmethod
    def non_negative(cls, v):
        if v < 0:
            raise ValueError("Cantidad no puede ser negativa.")
        return v


class GoodsReceiptLineOut(BaseModel):
    id:                  int
    gr_id:               int
    po_line_id:          Optional[int]
    sku_id:              Optional[int]
    description:         Optional[str]
    quantity_expected:   Decimal
    quantity_received:   Decimal
    quantity_rejected:   Decimal
    quantity_quarantine: Decimal
    unit_cost_cop:       Optional[Decimal]
    receipt_type:        str
    source:              str
    created_at:          Optional[datetime]
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# DISTRIBUCION DE LINEA RECIBIDA
# ---------------------------------------------------------------------------

class GoodsReceiptLineAllocationIn(BaseModel):
    gr_line_id:       int
    allocation_id:    int
    quantity_applied: Decimal = Field(gt=0)


class GoodsReceiptLineAllocationOut(BaseModel):
    id:               int
    gr_line_id:       int
    allocation_id:    int
    quantity_applied: Decimal
    created_at:       Optional[datetime]
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# BALANCES POR PROPIETARIO
# ---------------------------------------------------------------------------

OwnerEnum = Literal["NEBULAE", "MAU"]


class InventoryOwnerBalanceOut(BaseModel):
    id:           int
    sku_id:       int
    warehouse_id: int
    owner:        str
    quantity:     Decimal
    updated_at:   Optional[datetime]
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# RESERVAS DE INVENTARIO
# ---------------------------------------------------------------------------

ReservationStatusEnum = Literal["ACTIVE", "RELEASED", "CONVERTED", "EXPIRED"]


class CreateReservationBody(BaseModel):
    sku_id:             int
    warehouse_id:       int
    owner:              OwnerEnum         = "NEBULAE"
    quantity_reserved:  Decimal           = Field(gt=0)
    sale_order_line_id: Optional[int]     = None
    expires_at:         Optional[datetime] = None
    notes:              Optional[str]      = None


class ReleaseReservationBody(BaseModel):
    reason: Optional[str] = None


class InventoryReservationOut(BaseModel):
    id:                  int
    sku_id:              int
    warehouse_id:        int
    owner:               str
    quantity_reserved:   Decimal
    sale_order_line_id:  Optional[int]
    status:              str
    expires_at:          Optional[datetime]
    created_at:          Optional[datetime]
    released_at:         Optional[datetime]
    converted_at:        Optional[datetime]
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# TRANSACCIONES DE PAGO
# ---------------------------------------------------------------------------

TransactionTypeEnum = Literal[
    "ANTICIPO", "ABONO", "SALDO", "DEVOLUCION", "REVERSION"
]


class CreatePaymentTransactionBody(BaseModel):
    pxp_id:           int
    sale_order_id:    Optional[int]  = None
    transaction_type: TransactionTypeEnum
    monto:            Decimal        = Field(gt=0)
    moneda:           str            = Field(default="COP")
    metodo_pago:      Optional[str]  = None
    referencia:       Optional[str]  = Field(None, max_length=150)
    fecha_pago:       date
    user_name:        Optional[str]  = None
    notas:            Optional[str]  = None

    @field_validator("moneda")
    @classmethod
    def valid_currency(cls, v):
        if v not in ("COP", "USD"):
            raise ValueError("moneda debe ser COP o USD.")
        return v

    @field_validator("monto")
    @classmethod
    def positive_amount(cls, v):
        if v <= 0:
            raise ValueError("monto debe ser mayor que cero.")
        return v


class ReverseTransactionBody(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class PaymentTransactionOut(BaseModel):
    id:               int
    pxp_id:           int
    sale_order_id:    Optional[int]
    transaction_type: str
    monto:            Decimal
    moneda:           str
    metodo_pago:      Optional[str]
    referencia:       Optional[str]
    fecha_pago:       date
    user_name:        Optional[str]
    notas:            Optional[str]
    created_at:       Optional[datetime]
    is_reversed:      bool
    reversed_by_id:   Optional[int]
    model_config = {"from_attributes": True}
