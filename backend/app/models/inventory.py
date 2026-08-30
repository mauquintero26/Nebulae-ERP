from sqlalchemy import Column, Integer, String, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base

class Warehouse(Base):
    __tablename__ = "warehouses"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    location_type = Column(String, nullable=False) # "Central, Remota, Consignacion"

    inventory_levels = relationship("InventoryLevel", back_populates="warehouse")
    stock_replenishment_rules = relationship("StockReplenishmentRule", back_populates="warehouse")

class InventoryLevel(Base):
    __tablename__ = "inventory_levels"
    id = Column(Integer, primary_key=True, index=True)
    sku_id = Column(Integer, ForeignKey("product_skus.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    quantity = Column(Integer, default=0)

    sku = relationship("ProductSKU", back_populates="inventory_levels")
    warehouse = relationship("Warehouse", back_populates="inventory_levels")

class StockReplenishmentRule(Base):
    __tablename__ = "stock_replenishment_rules"
    id = Column(Integer, primary_key=True, index=True)
    sku_id = Column(Integer, ForeignKey("product_skus.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    min_quantity = Column(Integer, nullable=False, default=0)
    max_quantity = Column(Integer, nullable=False, default=0)

    sku = relationship("ProductSKU", back_populates="stock_replenishment_rules")
    warehouse = relationship("Warehouse", back_populates="stock_replenishment_rules")

class ShippingMethod(Base):
    __tablename__ = "shipping_methods"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    base_cost = Column(Numeric(10, 2), default=0)

    inventory_operations = relationship("InventoryOperation", back_populates="shipping_method")

class InventoryOperation(Base):
    __tablename__ = "inventory_operations"
    id = Column(Integer, primary_key=True, index=True)
    source_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=True)
    dest_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=True)
    shipping_method_id = Column(Integer, ForeignKey("shipping_methods.id"), nullable=True)
    operation_type = Column(String, nullable=False) # "RECEIPT", "DELIVERY", "TRANSFER", "PHYSICAL_INVENTORY"
    tracking_number = Column(String)
    package_type = Column(String)
    status = Column(String, nullable=False, default="DRAFT") # "DRAFT", "READY", "DONE", "CANCELLED"

    source_warehouse = relationship("Warehouse", foreign_keys=[source_warehouse_id])
    dest_warehouse = relationship("Warehouse", foreign_keys=[dest_warehouse_id])
    shipping_method = relationship("ShippingMethod", back_populates="inventory_operations")
    movements = relationship("InventoryMovement", back_populates="operation")

class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    id = Column(Integer, primary_key=True, index=True)
    operation_id = Column(Integer, ForeignKey("inventory_operations.id"), nullable=False)
    sku_id = Column(Integer, ForeignKey("product_skus.id"), nullable=False)
    quantity = Column(Integer, nullable=False)

    operation = relationship("InventoryOperation", back_populates="movements")
    sku = relationship("ProductSKU", back_populates="inventory_movements")
