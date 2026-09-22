from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal

# Brand
class BrandBase(BaseModel):
    name: str

class BrandCreate(BrandBase):
    pass

class BrandResponse(BrandBase):
    id: int
    model_config = {"from_attributes": True}

# Category
class CategoryBase(BaseModel):
    name: str
    parent_id: Optional[int] = None

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None

class CategoryResponse(CategoryBase):
    id: int
    model_config = {"from_attributes": True}

# Attributes
class AttributeBase(BaseModel):
    name: str

class AttributeCreate(AttributeBase):
    pass

class AttributeResponse(AttributeBase):
    id: int
    model_config = {"from_attributes": True}

class AttributeValueBase(BaseModel):
    value: str

class AttributeValueCreate(AttributeValueBase):
    pass

class AttributeValueResponse(AttributeValueBase):
    id: int
    attribute_id: int
    # We won't include full attribute here to avoid deep nesting
    model_config = {"from_attributes": True}

# SKU
class SKUBase(BaseModel):
    sku: str
    barcode: Optional[str] = None
    cost_price: Optional[Decimal] = None
    sale_price: Optional[Decimal] = None

class SKUCreate(SKUBase):
    attribute_value_ids: List[int] = []

class SKUResponse(SKUBase):
    id: int
    product_id: int
    attribute_values: List[AttributeValueResponse] = []
    model_config = {"from_attributes": True}

# Product
class ProductBase(BaseModel):
    brand_id: int
    category_id: int
    name: str
    description: Optional[str] = None
    type: str
    base_currency: str
    uom: Optional[str] = None
    is_active: bool = True
    necesita_revision: bool = False

class ProductCreate(ProductBase):
    pass

class ProductResponse(ProductBase):
    id: int
    brand: BrandResponse
    category: CategoryResponse
    skus: List[SKUResponse] = []
    model_config = {"from_attributes": True}

class ProductUpdate(BaseModel):
    brand_id: Optional[int] = None
    category_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    base_currency: Optional[str] = None
    uom: Optional[str] = None
    is_active: Optional[bool] = None
    necesita_revision: Optional[bool] = None

# Bulk SKU creation (para el asistente de variantes)
class SKUAttributePair(BaseModel):
    attribute_name: str
    value: str

class BulkSKUItem(BaseModel):
    sku: str
    barcode: Optional[str] = None
    sale_price: Decimal
    cost_price: Optional[Decimal] = None
    initial_stock: Optional[int] = 0
    attributes: List[SKUAttributePair] = []

class BulkSKUCreate(BaseModel):
    warehouse_id: Optional[int] = None
    skus: List[BulkSKUItem]
