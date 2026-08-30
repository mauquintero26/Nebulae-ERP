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

class CategoryCreate(CategoryBase):
    pass

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

class ProductCreate(ProductBase):
    pass

class ProductResponse(ProductBase):
    id: int
    brand: BrandResponse
    category: CategoryResponse
    skus: List[SKUResponse] = []
    model_config = {"from_attributes": True}
