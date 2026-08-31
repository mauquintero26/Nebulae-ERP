from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from app.db.database import Base
import datetime

class Quotation(Base):
    __tablename__ = "quotations"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    trm_rate = Column(Numeric(10, 2))
    total_amount = Column(Numeric(12, 2))

    customer = relationship("Customer", back_populates="quotations")
    user = relationship("User", back_populates="quotations")
    lines = relationship("QuotationLine", back_populates="quotation")

class QuotationLine(Base):
    __tablename__ = "quotation_lines"
    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=False)
    sku_id = Column(Integer, ForeignKey("product_skus.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_cost_at_time = Column(Numeric(10, 2))

    quotation = relationship("Quotation", back_populates="lines")
    sku = relationship("ProductSKU", back_populates="quotation_lines")

class SalesOrder(Base):
    __tablename__ = "sales_orders"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, nullable=False)
    
    import_date = Column(DateTime, nullable=True)
    sale_type = Column(String, default="IMMEDIATE")
    anticipo = Column(Numeric(12, 2), default=0.0)
    estimated_delivery_date = Column(DateTime, nullable=True)
    solicitud_tipo = Column(String, nullable=True)  # e.g. "Solicitud de Cotización"
    lead_value = Column(Numeric(14, 2), default=0.0)
    lead_source = Column(String, nullable=True)      # WhatsApp, Instagram, Correo, etc.
    lead_description = Column(Text, nullable=True)
    pipeline_stage_id = Column(Integer, nullable=True)  # FK-like to pipeline_stages.id

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    customer = relationship("Customer", back_populates="sales_orders")
    user = relationship("User", back_populates="sales_orders")
    lines = relationship("SalesOrderLine", back_populates="sales_order")

class SalesOrderLine(Base):
    __tablename__ = "sales_order_lines"
    id = Column(Integer, primary_key=True, index=True)
    sales_order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=False)
    sku_id = Column(Integer, ForeignKey("product_skus.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False, default=0.0)

    sales_order = relationship("SalesOrder", back_populates="lines")
    sku = relationship("ProductSKU", back_populates="sales_order_lines")
