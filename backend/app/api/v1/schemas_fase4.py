"""
Fase 4 - Schemas Pydantic para Ventas, Pagos, Empaque, Entregas y Devoluciones.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from decimal import Decimal
import datetime


class SaleOrderLineCreate(BaseModel):
    sku_id: int
    description: Optional[str] = None
    quantity: Decimal = Field(..., gt=Decimal("0.00"), description="Cantidad solicitada")
    unit_price_cop: Decimal = Field(..., ge=Decimal("0.00"), description="Precio unitario en COP")
    descuento_pct: Optional[Decimal] = Field(Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("100.00"))
    tax_pct: Optional[Decimal] = Field(Decimal("0.00"), ge=Decimal("0.00"))
    modalidad: str = Field("POR_PEDIDO", description="ENTREGA_INMEDIATA o POR_PEDIDO")
    owner: str = Field("NEBULAE", description="NEBULAE o MAU")
    sq_line_id: Optional[int] = None
    cost_unit_cop_snapshot: Optional[Decimal] = Field(Decimal("0.00"), ge=Decimal("0.00"))

    @field_validator("modalidad")
    @classmethod
    def validate_modalidad(cls, v: str) -> str:
        val = v.strip().upper()
        if val not in ("ENTREGA_INMEDIATA", "POR_PEDIDO"):
            raise ValueError("modalidad debe ser 'ENTREGA_INMEDIATA' o 'POR_PEDIDO'")
        return val

    @field_validator("owner")
    @classmethod
    def validate_owner(cls, v: str) -> str:
        val = v.strip().upper()
        if val not in ("NEBULAE", "MAU"):
            raise ValueError("owner debe ser 'NEBULAE' o 'MAU'")
        return val


class SaleOrderLineResponse(BaseModel):
    id: int
    so_id: int
    customer_id: Optional[int] = None
    sku_id: Optional[int] = None
    description: Optional[str] = None
    quantity: Decimal
    unit_price_cop: Decimal
    descuento_pct: Decimal
    tax_pct: Decimal
    modalidad: str
    owner: str
    quantity_reserved: Decimal
    quantity_delivered: Decimal
    quantity_cancelled: Decimal
    estado: str
    cost_unit_cop_snapshot: Decimal
    price_unit_cop_snapshot: Decimal
    created_at: datetime.datetime
    updated_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True


class SaleOrderCreate(BaseModel):
    customer_id: int
    cot_id: Optional[int] = None
    sc_id: Optional[int] = None
    direccion_entrega: Optional[str] = None
    fecha_entrega_estimada: Optional[datetime.datetime] = None
    trm_rate: Optional[Decimal] = None
    notas: Optional[str] = None
    canal_venta: Optional[str] = "CRM"
    anticipo_pct: Optional[Decimal] = Field(Decimal("60.00"), ge=Decimal("0.00"), le=Decimal("100.00"))
    saldo_pct: Optional[Decimal] = Field(None, ge=Decimal("0.00"), le=Decimal("100.00"))
    policy_exception_authorized_by: Optional[str] = None
    policy_exception_reason: Optional[str] = None
    lines: List[SaleOrderLineCreate] = Field(..., min_length=1)


class SaleOrderPaymentCreate(BaseModel):
    tipo: str = Field(..., description="ANTICIPO | ABONO | PAGO_TOTAL | PAGO_SALDO | DEVOLUCION | REVERSION | AJUSTE_AUTORIZADO")
    monto: Decimal = Field(..., gt=Decimal("0.00"))
    moneda: Optional[str] = "COP"
    metodo_pago: Optional[str] = None
    fecha: Optional[datetime.date] = None
    referencia_bancaria: Optional[str] = None
    comprobante: Optional[str] = None
    idempotency_key: str = Field(..., min_length=3)
    notes: Optional[str] = None
    reversed_payment_id: Optional[int] = None
    policy_exception_authorized_by: Optional[str] = None
    policy_exception_reason: Optional[str] = None

    @field_validator("tipo")
    @classmethod
    def validate_tipo(cls, v: str) -> str:
        val = v.strip().upper()
        if val not in ("ANTICIPO", "ABONO", "PAGO_TOTAL", "PAGO_SALDO", "DEVOLUCION", "REVERSION", "AJUSTE_AUTORIZADO"):
            raise ValueError(f"Tipo de pago '{v}' no válido")
        return val


class SaleOrderPaymentResponse(BaseModel):
    id: int
    sale_order_id: int
    customer_id: Optional[int] = None
    tipo: str
    monto: Decimal
    moneda: str
    metodo_pago: Optional[str] = None
    fecha: datetime.date
    referencia_bancaria: Optional[str] = None
    comprobante: Optional[str] = None
    usuario: Optional[str] = None
    idempotency_key: Optional[str] = None
    estado: str
    reversed_payment_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class CancelSaleOrderRequest(BaseModel):
    motivo: str = Field(..., min_length=5)
    authorized_by: Optional[str] = None
    purchased_goods_decision: Optional[str] = None
    decision: Optional[str] = None
    # PASAR_A_STOCK_NEBULAE | MANTENER_PENDIENTE | REASIGNAR_CLIENTE | DEVOLVER_PROVEEDOR | REGISTRAR_PERDIDA
    target_customer_id: Optional[int] = None
    target_sale_order_line_id: Optional[int] = None

    @field_validator("purchased_goods_decision", mode="before")
    @classmethod
    def validate_decision(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        val = v.strip().upper()
        allowed = ("PASAR_A_STOCK_NEBULAE", "MANTENER_PENDIENTE", "REASIGNAR_CLIENTE", "DEVOLVER_PROVEEDOR", "REGISTRAR_PERDIDA")
        if val not in allowed:
            raise ValueError(f"Decisión inválida. Opciones: {allowed}")
        return val


class CancelLineRequest(BaseModel):
    quantity: Optional[Decimal] = Field(None, gt=Decimal("0.00"))
    motivo: str = Field(..., min_length=5)
    authorized_by: Optional[str] = None
    purchased_goods_decision: Optional[str] = None
    decision: Optional[str] = None
    target_customer_id: Optional[int] = None
    target_sale_order_line_id: Optional[int] = None

    @field_validator("purchased_goods_decision", mode="before")
    @classmethod
    def validate_decision(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        val = v.strip().upper()
        allowed = ("PASAR_A_STOCK_NEBULAE", "MANTENER_PENDIENTE", "REASIGNAR_CLIENTE", "DEVOLVER_PROVEEDOR", "REGISTRAR_PERDIDA")
        if val not in allowed:
            raise ValueError(f"Decisión inválida. Opciones: {allowed}")
        return val


class PackingItemIn(BaseModel):
    sale_order_id: int
    sale_order_line_id: int
    sku_id: int
    quantity: Decimal = Field(..., gt=Decimal("0.00"))
    notes: Optional[str] = None


class PackingSessionCreate(BaseModel):
    customer_id: int
    warehouse_id: int
    items: List[PackingItemIn] = Field(..., min_length=1)
    observations: Optional[str] = None


class PackingItemVerify(BaseModel):
    verified_quantity: Decimal = Field(..., ge=Decimal("0.00"))
    status: str = Field("EMPACADO", description="PENDIENTE | EMPACADO | INCIDENCIA")
    notes: Optional[str] = None


class DeliveryLineIn(BaseModel):
    sale_order_id: int
    sale_order_line_id: int
    sku_id: int
    quantity: Decimal = Field(..., gt=Decimal("0.00"))
    owner: Optional[str] = "NEBULAE"


class DeliveryCreate(BaseModel):
    customer_id: int
    warehouse_id: int
    delivery_method: str = Field(..., description="RECOGIDA_BARRANQUILLA | ENTREGA_LOCAL | ENVIO_NACIONAL | PORTERIA | OTRO")
    address_snapshot: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    shipping_cost: Optional[Decimal] = Decimal("0.00")
    shipping_paid_by: Optional[str] = "CLIENTE"
    scheduled_date: Optional[datetime.datetime] = None
    packing_id: Optional[int] = None
    policy_authorized_by: Optional[str] = None
    policy_exception_reason: Optional[str] = None
    observations: Optional[str] = None
    lines: List[DeliveryLineIn] = Field(..., min_length=1)

    @field_validator("delivery_method")
    @classmethod
    def validate_method(cls, v: str) -> str:
        val = v.strip().upper()
        allowed = ("RECOGIDA_BARRANQUILLA", "ENTREGA_LOCAL", "ENVIO_NACIONAL", "PORTERIA", "OTRO")
        if val not in allowed:
            raise ValueError(f"Método de entrega inválido. Opciones: {allowed}")
        return val


class DispatchDeliveryRequest(BaseModel):
    idempotency_key: str = Field(..., min_length=3)
    dispatch_date: Optional[datetime.datetime] = None
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    evidence_url: Optional[str] = None
    observations: Optional[str] = None


class DeliveryStatusUpdateRequest(BaseModel):
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    evidence_url: Optional[str] = None
    delivery_date: Optional[datetime.datetime] = None
    notes: Optional[str] = None


class ReturnLineIn(BaseModel):
    sale_order_line_id: int
    sku_id: Optional[int] = None
    warehouse_id: int
    quantity: Decimal = Field(..., gt=Decimal("0.00"))
    inventory_resolution: str = Field(..., description="REINTEGRAR_STOCK | CUARENTENA | DESTRUIDO | DEVOLVER_PROVEEDOR")
    product_condition: str = Field("ABIERTO_BUENO", description="NUEVO_SELLADO | ABIERTO_BUENO | DEFECTUOSO | DAÑADO")
    owner: Optional[str] = None

    @field_validator("product_condition", mode="before")
    @classmethod
    def normalize_condition(cls, v: Optional[str]) -> str:
        if not v:
            return "ABIERTO_BUENO"
        val = str(v).strip().upper()
        if val in ("BUENO", "ABIERTO"):
            return "ABIERTO_BUENO"
        if val in ("NUEVO", "SELLADO"):
            return "NUEVO_SELLADO"
        if val in ("DANADO", "DAÑADO"):
            return "DAÑADO"
        if val in ("DEFECTUOSO", "MALO"):
            return "DEFECTUOSO"
        return val


class SaleOrderReturnCreate(BaseModel):
    sale_order_id: int
    customer_id: int
    delivery_id: Optional[int] = None
    financial_resolution: str = Field(..., description="DEVOLUCION_DINERO | SALDO_A_FAVOR | SIN_DEVOLUCION_DINERO")
    refund_amount: Optional[Decimal] = Decimal("0.00")
    reason: Optional[str] = None
    evidence_url: Optional[str] = None
    authorized_by: Optional[str] = None
    idempotency_key: str = Field(..., min_length=3)
    lines: List[ReturnLineIn] = Field(..., min_length=1)


class ProfitabilityResponse(BaseModel):
    sale_order_id: int
    numero: str
    gross_sales_cop: Decimal
    discount_cop: Decimal
    net_sales_cop: Decimal
    total_cost_cop: Decimal
    estimated_profit_cop: Decimal
    real_profit_cop: Optional[Decimal] = None
    margin_pct: Decimal
    profit_is_estimated: bool
    nebulae_result_cop: Decimal
    mau_result_cop: Decimal
    lines_breakdown: List[Dict[str, Any]]


class FinancialExceptionRequest(BaseModel):
    policy_exception_authorized_by: str = Field(..., min_length=3)
    policy_exception_reason: str = Field(..., min_length=5)

