from pydantic import BaseModel, Field
from typing import Optional
from decimal import Decimal

class QuotationCalculateRequest(BaseModel):
    # Global Config (can be fetched from DB later, but for now sent in request for flexibility)
    trm_dia: Decimal = Field(..., description="TRM of the day")
    ajuste_trm: Decimal = Field(default=Decimal("50"), description="Adjustment cushion for TRM")
    tax_rate: Decimal = Field(default=Decimal("0.07"), description="Tax rate at origin (e.g., 0.07 for 7%)")
    costo_libra_cop: Decimal = Field(..., description="Cost per pound in COP to bring the item")
    target_margin: Decimal = Field(default=Decimal("0.40"), description="Target profit margin (e.g., 0.40 for 40%)")
    anticipo_porcentaje: Decimal = Field(default=Decimal("0.50"), description="Percentage for advance payment (e.g., 0.50 for 50%)")
    
    # Product specific values
    costo_usd: Decimal = Field(..., description="Base cost in USD")
    descuento: Decimal = Field(default=Decimal("0.0"), description="Discount percentage (e.g., 0.10 for 10%)")
    envio_origen_usd: Decimal = Field(default=Decimal("0.0"), description="Shipping cost at origin in USD")
    peso_libras: Decimal = Field(..., description="Estimated weight in pounds")
    
    # Optional override
    precio_publicado_manual: Optional[Decimal] = Field(None, description="Manually rounded final price. If provided, calculates real margin instead of suggested price.")

class QuotationCalculateResponse(BaseModel):
    trm_efectiva: Decimal
    costo_neto_usd: Decimal
    tax_usd: Decimal
    total_origen_usd: Decimal
    costo_base_cop: Decimal
    costo_traida_cop: Decimal
    costo_total_cop: Decimal
    precio_sugerido_formula: Decimal
    precio_publicado: Decimal
    margen_real: Decimal
    valor_anticipo: Decimal
