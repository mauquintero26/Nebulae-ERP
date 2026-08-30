from pydantic import BaseModel
from typing import List, Optional
from decimal import Decimal

# Schemas for Public Store
class StoreSKU(BaseModel):
    id: int
    sku: str
    sale_price: Optional[Decimal] = None
    inventory_available: int
    attributes: List[dict] = []
    
class StoreProductResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    brand_name: str
    category_name: str
    images: List[str] = []
    skus: List[StoreSKU] = []

class CartItem(BaseModel):
    sku_id: int
    quantity: int

class CustomerInfo(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None

class CheckoutRequest(BaseModel):
    customer: CustomerInfo
    cart: List[CartItem]
