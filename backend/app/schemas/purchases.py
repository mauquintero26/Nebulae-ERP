from pydantic import BaseModel
from typing import Optional, List
from app.schemas.inventory import InventoryMovementCreate

class PurchaseOrderBase(BaseModel):
    status: str = "DRAFT"
    
class PurchaseOrderCreate(PurchaseOrderBase):
    pass

class PurchaseOrderResponse(PurchaseOrderBase):
    id: int
    model_config = {"from_attributes": True}

class PurchaseReceiveRequest(BaseModel):
    dest_warehouse_id: int
    movements: List[InventoryMovementCreate]
