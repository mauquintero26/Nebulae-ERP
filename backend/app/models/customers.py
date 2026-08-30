from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from app.db.database import Base

class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    phone = Column(String)
    email = Column(String, unique=True, index=True)
    city = Column(String)

    quotations = relationship("Quotation", back_populates="customer")
    sales_orders = relationship("SalesOrder", back_populates="customer")
