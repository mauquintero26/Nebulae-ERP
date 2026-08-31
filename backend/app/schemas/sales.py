from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal
from datetime import datetime

class SalesOrderLineBase(BaseModel):
    sku_id: int
    quantity: int
    unit_price: Decimal = Decimal("0.0")

class SalesOrderLineCreate(SalesOrderLineBase):
    pass

class SalesOrderLineResponse(SalesOrderLineBase):
    id: int
    sales_order_id: int
    model_config = {"from_attributes": True}

class SalesOrderBase(BaseModel):
    customer_id: int
    user_id: Optional[int] = None
    status: str = "TO_INVOICE"
    import_date: Optional[datetime] = None
    sale_type: str = "IMMEDIATE"
    anticipo: Decimal = Decimal("0.0")
    estimated_delivery_date: Optional[datetime] = None
    solicitud_tipo: Optional[str] = None

class SalesOrderCreate(SalesOrderBase):
    lines: List[SalesOrderLineCreate] = []

class SalesOrderResponse(SalesOrderBase):
    id: int
    created_at: datetime
    updated_at: datetime
    lines: List[SalesOrderLineResponse] = []
    model_config = {"from_attributes": True}

