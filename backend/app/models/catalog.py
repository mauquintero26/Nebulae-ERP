from sqlalchemy import Column, Integer, String, Boolean, Numeric, ForeignKey, Table, Text, JSON, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base

sku_attribute_values = Table(
    'sku_attribute_values', Base.metadata,
    Column('sku_id', Integer, ForeignKey('product_skus.id'), primary_key=True),
    Column('attribute_value_id', Integer, ForeignKey('attribute_values.id'), primary_key=True)
)

class Brand(Base):
    __tablename__ = "brands"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)

    products = relationship("Product", back_populates="brand")

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)

    products = relationship("Product", back_populates="category")
    parent = relationship("Category", remote_side=[id], back_populates="children")
    children = relationship("Category", back_populates="parent")

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String)
    type = Column(String, nullable=False) # "Fisico, Servicio, Experiencia"
    base_currency = Column(String, nullable=False) # "USD, COP"
    uom = Column(String) # "Unidad de medida (Ud, Lb, Kg)"
    is_active = Column(Boolean, default=True)
    legacy_ecommerce_product_id = Column(Integer, unique=True, nullable=True, index=True)
    necesita_revision = Column(Boolean, nullable=False, default=False)

    brand = relationship("Brand", back_populates="products")
    category = relationship("Category", back_populates="products")
    images = relationship("ProductImage", back_populates="product")
    skus = relationship("ProductSKU", back_populates="product")

class ProductImage(Base):
    __tablename__ = "product_images"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    image_url_hd = Column(String, nullable=False)
    is_main = Column(Boolean, default=False)

    product = relationship("Product", back_populates="images")

class Attribute(Base):
    __tablename__ = "attributes"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False) # "Ej: Color, Talla, Sabor"

    values = relationship("AttributeValue", back_populates="attribute")

class AttributeValue(Base):
    __tablename__ = "attribute_values"
    id = Column(Integer, primary_key=True, index=True)
    attribute_id = Column(Integer, ForeignKey("attributes.id"), nullable=False)
    value = Column(String, nullable=False) # "Ej: Rojo, M, Vainilla"

    attribute = relationship("Attribute", back_populates="values")

class ProductSKU(Base):
    __tablename__ = "product_skus"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    sku = Column(String, unique=True, index=True, nullable=False)
    barcode = Column(String, unique=True, index=True)
    cost_price = Column(Numeric(10, 2))
    sale_price = Column(Numeric(10, 2))

    product = relationship("Product", back_populates="skus")
    attribute_values = relationship("AttributeValue", secondary=sku_attribute_values)
    inventory_levels = relationship("InventoryLevel", back_populates="sku")
    stock_replenishment_rules = relationship("StockReplenishmentRule", back_populates="sku")
    inventory_movements = relationship("InventoryMovement", back_populates="sku")
    sales_order_lines = relationship("SalesOrderLine", back_populates="sku")
    quotation_lines = relationship("QuotationLine", back_populates="sku")
    web_listing = relationship("ProductWebListing", back_populates="sku", uselist=False, cascade="all, delete-orphan", passive_deletes=True)


class ProductWebListing(Base):
    __tablename__ = "product_web_listings"
    id = Column(Integer, primary_key=True, index=True)
    sku_id = Column(Integer, ForeignKey("product_skus.id", ondelete="CASCADE"), nullable=False, unique=True)
    descripcion_larga = Column(Text)
    precio_comparacion = Column(Numeric(14, 2))
    descuento_pct = Column(Numeric(5, 2), nullable=False, default=0)
    imagenes = Column(JSON, nullable=False, default=list)
    seo_titulo = Column(String(300))
    seo_descripcion = Column(Text)
    seo_keywords = Column(Text)
    codigo_aduana = Column(String(100))
    peso_kg = Column(Numeric(8, 2))
    notas_internas = Column(Text)
    publicado_web = Column(Boolean, nullable=False, default=False)
    rastrear_inventario = Column(Boolean, nullable=False, default=True)
    impuesto_pct = Column(Numeric(5, 2), nullable=False, default=0)
    sub_categoria = Column(String(200))
    variantes = Column(JSON, nullable=False, default=list)
    alerta_stock_minimo = Column(Integer, nullable=False, default=5)
    created_by = Column(String(150))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    sku = relationship("ProductSKU", back_populates="web_listing")
