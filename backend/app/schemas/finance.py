from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal
from datetime import datetime

class ExpenseBase(BaseModel):
    category: str
    description: Optional[str] = None
    amount: Decimal
    incurred_date: Optional[datetime] = None
    is_recurring: bool = False

class ExpenseCreate(ExpenseBase):
    pass

class ExpenseResponse(ExpenseBase):
    id: int
    incurred_date: datetime
    model_config = {"from_attributes": True}

class DashboardResponse(BaseModel):
    gross_revenue: Decimal
    cogs: Decimal
    gross_profit: Decimal
    opex: Decimal
    net_profit: Decimal
