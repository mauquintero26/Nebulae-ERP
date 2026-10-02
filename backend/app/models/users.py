from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.db.database import Base
import datetime


def _now():
    return datetime.datetime.utcnow()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String(32), unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False) # "Admin, Vendedor, ERP, Finanzas, Mercadeo"
    is_active = Column(Boolean, default=True)

    quotations = relationship("Quotation", back_populates="user")
    sales_orders = relationship("SalesOrder", back_populates="user")

class PasswordResetToken(Base):
    """Token de un solo uso para el flujo de 'olvidé mi contraseña'.

    Solo se guarda el SHA-256 del token (token_hash) -- el token crudo vive
    unicamente en memoria durante el request y en el correo enviado al
    usuario, nunca en la base de datos ni en logs.
    """
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token_hash = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime, default=_now)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)

class RolePermission(Base):
    __tablename__ = "role_permissions"
    id = Column(Integer, primary_key=True, index=True)
    role_name = Column(String, nullable=False)
    module_name = Column(String, nullable=False)
    can_read = Column(Boolean, default=False)
    can_write = Column(Boolean, default=False)
