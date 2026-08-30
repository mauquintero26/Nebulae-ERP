from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal

# Shipping Method
class ShippingMethodBase(BaseModel):
    name: str
    base_cost: Decimal = Decimal("0.0")

class ShippingMethodCreate(ShippingMethodBase):
    pass

class ShippingMethodResponse(ShippingMethodBase):
    id: int
    model_config = {"from_attributes": True}

class WarehouseBase(BaseModel):
    name: str
    location: Optional[str] = None
    is_active: bool = True

class WarehouseCreate(WarehouseBase):
    pass

class WarehouseResponse(WarehouseBase):
    id: int
    model_config = {"from_attributes": True}

# Inventory Movement
class InventoryMovementBase(BaseModel):
    sku_id: int
    quantity: int

class InventoryMovementCreate(InventoryMovementBase):
    pass

class InventoryMovementResponse(InventoryMovementBase):
    id: int
    operation_id: int
    model_config = {"from_attributes": True}

# Inventory Operation
class InventoryOperationBase(BaseModel):
    source_warehouse_id: Optional[int] = None
    dest_warehouse_id: Optional[int] = None
    shipping_method_id: Optional[int] = None
    operation_type: str # "RECEIPT", "DELIVERY", "TRANSFER", "PHYSICAL_INVENTORY"
    tracking_number: Optional[str] = None
    package_type: Optional[str] = None
    status: str = "DRAFT"

class InventoryOperationCreate(InventoryOperationBase):
    movements: List[InventoryMovementCreate] = []

class InventoryOperationResponse(InventoryOperationBase):
    id: int
    movements: List[InventoryMovementResponse] = []
    model_config = {"from_attributes": True}
