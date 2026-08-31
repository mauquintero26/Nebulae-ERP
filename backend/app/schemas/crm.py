from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from decimal import Decimal

class AlertBase(BaseModel):
    alert_type: str
    reference_id: int
    message: str
    due_date: datetime
    is_resolved: bool

class AlertResponse(AlertBase):
    id: int
    model_config = {"from_attributes": True}

class CalendarDay(BaseModel):
    date: str
    alerts: List[AlertResponse] = []

class Customer360Profile(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    active_orders: List[dict] = []
    ltv: Decimal

class CustomerBase(BaseModel):
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    document: Optional[str] = None
    address: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    document: Optional[str] = None
    address: Optional[str] = None

class CustomerResponse(CustomerBase):
    id: int
    model_config = {"from_attributes": True}
