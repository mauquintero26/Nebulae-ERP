from sqlalchemy import Column, Integer, String, Boolean
from sqlalchemy.orm import relationship
from app.db.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False) # "Admin, Vendedor, ERP, Finanzas, Mercadeo"
    is_active = Column(Boolean, default=True)

    quotations = relationship("Quotation", back_populates="user")
    sales_orders = relationship("SalesOrder", back_populates="user")

class RolePermission(Base):
    __tablename__ = "role_permissions"
    id = Column(Integer, primary_key=True, index=True)
    role_name = Column(String, nullable=False)
    module_name = Column(String, nullable=False)
    can_read = Column(Boolean, default=False)
    can_write = Column(Boolean, default=False)
