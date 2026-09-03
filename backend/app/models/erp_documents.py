"""ERP Documents - Full models for Sales, Purchases, Inventory flows."""
from sqlalchemy import (
    Column, Integer, String, Numeric, ForeignKey,
    DateTime, Text, Boolean, JSON
)
from sqlalchemy.orm import relationship
from app.db.database import Base
import datetime


def _now():
    return datetime.datetime.utcnow()


class Supplier(Base):
    __tablename__ = "suppliers"
    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String(200), nullable=False)
    reference      = Column(String(100), nullable=True)
    contact_name   = Column(String(150), nullable=True)
    phone          = Column(String(50), nullable=True)
    email          = Column(String(150), nullable=True)
    address        = Column(String(300), nullable=True)
    city           = Column(String(100), nullable=True)
    country        = Column(String(100), nullable=True, default="Colombia")
    payment_terms  = Column(String(100), nullable=True)
    is_active      = Column(Boolean, default=True)
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=_now)
    updated_at     = Column(DateTime, default=_now, onupdate=_now)

    purchase_orders = relationship("PurchaseOrderFull", back_populates="supplier")


class CustomerRequest(Base):
    __tablename__ = "customer_requests"
    id               = Column(Integer, primary_key=True, index=True)
    numero           = Column(String(20), unique=True, nullable=False, index=True)
    customer_id      = Column(Integer, ForeignKey("customers.id"), nullable=True)
    customer_name    = Column(String(200), nullable=True)
    customer_phone   = Column(String(50), nullable=True)
    customer_email   = Column(String(150), nullable=True)
    customer_address = Column(String(300), nullable=True)
    advisor_name     = Column(String(150), nullable=True)
    tipo_solicitud   = Column(String(100), nullable=True, default="Cotizacion de Producto")
    modalidad_pago   = Column(String(100), nullable=True, default="Contado")
    estado           = Column(String(50), nullable=False, default="BORRADOR")
    fecha_solicitud  = Column(DateTime, default=_now)
    fecha_vencimiento= Column(DateTime, nullable=True)
    notas            = Column(Text, nullable=True)
    productos        = Column(JSON, nullable=True, default=list)
    created_at       = Column(DateTime, default=_now)
    updated_at       = Column(DateTime, default=_now, onupdate=_now)
    created_by       = Column(String(150), nullable=True)

    customer   = relationship("Customer", foreign_keys=[customer_id])
    quotations = relationship("SalesQuotation", back_populates="customer_request")


class SalesQuotation(Base):
    __tablename__ = "sales_quotations"
    id                    = Column(Integer, primary_key=True, index=True)
    numero                = Column(String(20), unique=True, nullable=False, index=True)
    sc_id                 = Column(Integer, ForeignKey("customer_requests.id"), nullable=True)
    sc_numero             = Column(String(20), nullable=True)
    customer_id           = Column(Integer, ForeignKey("customers.id"), nullable=True)
    customer_name         = Column(String(200), nullable=True)
    customer_phone        = Column(String(50), nullable=True)
    customer_email        = Column(String(150), nullable=True)
    customer_address      = Column(String(300), nullable=True)
    cotizador             = Column(String(150), nullable=True)
    direccion_entrega     = Column(String(300), nullable=True)
    trm_rate              = Column(Numeric(10, 2), nullable=True)
    subtotal_cop          = Column(Numeric(14, 2), default=0)
    descuento_pct         = Column(Numeric(5, 2), default=0)
    total_cop             = Column(Numeric(14, 2), default=0)
    anticipo_cop          = Column(Numeric(14, 2), default=0)
    estado                = Column(String(50), nullable=False, default="BORRADOR")
    fecha_cotizacion      = Column(DateTime, default=_now)
    fecha_entrega_estimada= Column(DateTime, nullable=True)
    notas                 = Column(Text, nullable=True)
    productos             = Column(JSON, nullable=True, default=list)
    pec_id                = Column(Integer, nullable=True)
    pec_numero            = Column(String(20), nullable=True)
    created_at            = Column(DateTime, default=_now)
    updated_at            = Column(DateTime, default=_now, onupdate=_now)
    created_by            = Column(String(150), nullable=True)

    customer_request = relationship("CustomerRequest", back_populates="quotations")
    customer         = relationship("Customer", foreign_keys=[customer_id])
    sale_orders      = relationship("SaleOrder", back_populates="quotation")


class SaleOrder(Base):
    __tablename__ = "sale_orders"
    id                    = Column(Integer, primary_key=True, index=True)
    numero                = Column(String(20), unique=True, nullable=False, index=True)
    sc_id                 = Column(Integer, ForeignKey("customer_requests.id"), nullable=True)
    sc_numero             = Column(String(20), nullable=True)
    cot_id                = Column(Integer, ForeignKey("sales_quotations.id"), nullable=True)
    cot_numero            = Column(String(20), nullable=True)
    customer_id           = Column(Integer, ForeignKey("customers.id"), nullable=True)
    customer_name         = Column(String(200), nullable=True)
    customer_phone        = Column(String(50), nullable=True)
    customer_email        = Column(String(150), nullable=True)
    customer_address      = Column(String(300), nullable=True)
    direccion_entrega     = Column(String(300), nullable=True)
    fecha_cotizacion      = Column(DateTime, nullable=True)
    fecha_entrega_estimada= Column(DateTime, nullable=True)
    trm_rate              = Column(Numeric(10, 2), nullable=True)
    subtotal_cop          = Column(Numeric(14, 2), default=0)
    descuento_pct         = Column(Numeric(5, 2), default=0)
    total_cop             = Column(Numeric(14, 2), default=0)
    anticipo_cop          = Column(Numeric(14, 2), default=0)
    saldo_cop             = Column(Numeric(14, 2), default=0)
    estado                = Column(String(50), nullable=False, default="PENDIENTE_COMPRA")
    notas                 = Column(Text, nullable=True)
    productos             = Column(JSON, nullable=True, default=list)
    pec_id                = Column(Integer, nullable=True)
    pec_numero            = Column(String(20), nullable=True)
    pxp_id                = Column(Integer, nullable=True)
    pxp_numero            = Column(String(20), nullable=True)
    canal_venta           = Column(String(30), nullable=True, default="CRM")  # CRM | WEB | PRESENCIAL
    pweb_numero           = Column(String(25), nullable=True, index=True)      # PWEB-YYYY####
    canal_metadata        = Column(JSON, nullable=True)                        # IP, user_agent, etc.
    created_at            = Column(DateTime, default=_now)
    updated_at            = Column(DateTime, default=_now, onupdate=_now)
    created_by            = Column(String(150), nullable=True)

    customer         = relationship("Customer", foreign_keys=[customer_id])
    quotation        = relationship("SalesQuotation", back_populates="sale_orders")
    payment_pendings = relationship("PaymentPending", back_populates="sale_order")



class PaymentPending(Base):
    __tablename__ = "payment_pendings"
    id              = Column(Integer, primary_key=True, index=True)
    numero          = Column(String(20), unique=True, nullable=False, index=True)
    ven_id          = Column(Integer, ForeignKey("sale_orders.id"), nullable=False)
    ven_numero      = Column(String(20), nullable=True)
    customer_id     = Column(Integer, ForeignKey("customers.id"), nullable=True)
    customer_name   = Column(String(200), nullable=True)
    monto_total     = Column(Numeric(14, 2), default=0)
    monto_anticipo  = Column(Numeric(14, 2), default=0)
    monto_pendiente = Column(Numeric(14, 2), default=0)
    estado          = Column(String(50), nullable=False, default="PENDIENTE")
    fecha_creacion  = Column(DateTime, default=_now)
    fecha_pago      = Column(DateTime, nullable=True)
    notas           = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=_now)
    updated_at      = Column(DateTime, default=_now, onupdate=_now)

    sale_order = relationship("SaleOrder", back_populates="payment_pendings")
    customer   = relationship("Customer", foreign_keys=[customer_id])


class PurchaseOrderFull(Base):
    __tablename__ = "purchase_orders_full"
    id                    = Column(Integer, primary_key=True, index=True)
    numero                = Column(String(20), unique=True, nullable=False, index=True)
    supplier_id           = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    supplier_name         = Column(String(200), nullable=True)
    supplier_ref          = Column(String(100), nullable=True)
    ven_id                = Column(Integer, nullable=True)
    ven_numero            = Column(String(20), nullable=True)
    modalidad_pago        = Column(String(100), nullable=True, default="Contado")
    metodo_pago           = Column(String(100), nullable=True)
    warehouse_id          = Column(Integer, ForeignKey("warehouses.id"), nullable=True)
    carrier               = Column(String(150), nullable=True)
    tracking_number       = Column(String(200), nullable=True)
    tracking_stages       = Column(JSON, nullable=True, default=list)
    estado                = Column(String(50), nullable=False, default="BORRADOR")
    fecha_compra          = Column(DateTime, default=_now)
    fecha_entrega_estimada= Column(DateTime, nullable=True)
    fecha_alerta          = Column(DateTime, nullable=True)
    subtotal_cop          = Column(Numeric(14, 2), default=0)
    total_cop             = Column(Numeric(14, 2), default=0)
    notas                 = Column(Text, nullable=True)
    productos             = Column(JSON, nullable=True, default=list)
    created_at            = Column(DateTime, default=_now)
    updated_at            = Column(DateTime, default=_now, onupdate=_now)
    created_by            = Column(String(150), nullable=True)

    supplier       = relationship("Supplier", back_populates="purchase_orders")
    goods_receipts = relationship("GoodsReceipt", back_populates="purchase_order")


class GoodsReceipt(Base):
    __tablename__ = "goods_receipts"
    id                = Column(Integer, primary_key=True, index=True)
    numero            = Column(String(20), unique=True, nullable=False, index=True)
    pec_id            = Column(Integer, ForeignKey("purchase_orders_full.id"), nullable=True)
    pec_numero        = Column(String(20), nullable=True)
    supplier_id       = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    supplier_name     = Column(String(200), nullable=True)
    warehouse_id      = Column(Integer, ForeignKey("warehouses.id"), nullable=True)
    warehouse_name    = Column(String(200), nullable=True)
    carrier           = Column(String(150), nullable=True)
    tracking_number   = Column(String(200), nullable=True)
    operacion_tipo    = Column(String(50), default="RECEPCION")
    estado            = Column(String(50), nullable=False, default="BORRADOR")
    fecha_recepcion   = Column(DateTime, default=_now)
    notas             = Column(Text, nullable=True)
    productos         = Column(JSON, nullable=True, default=list)
    stock_actualizado = Column(Boolean, default=False)
    created_at        = Column(DateTime, default=_now)
    updated_at        = Column(DateTime, default=_now, onupdate=_now)
    created_by        = Column(String(150), nullable=True)

    purchase_order = relationship("PurchaseOrderFull", back_populates="goods_receipts")
    supplier       = relationship("Supplier", foreign_keys=[supplier_id])


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id            = Column(Integer, primary_key=True, index=True)
    entity_type   = Column(String(20), nullable=False, index=True)
    entity_id     = Column(Integer, nullable=False, index=True)
    entity_numero = Column(String(30), nullable=True)
    action        = Column(String(100), nullable=False)
    description   = Column(Text, nullable=True)
    old_estado    = Column(String(50), nullable=True)
    new_estado    = Column(String(50), nullable=True)
    user_name     = Column(String(150), nullable=True)
    created_at    = Column(DateTime, default=_now, index=True)
    extra_data    = Column(JSON, nullable=True)
