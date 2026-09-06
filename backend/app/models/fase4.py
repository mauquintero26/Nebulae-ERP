"""
Fase 4 - Modelos para Ventas, Pagos, Empaque, Entregas y Devoluciones.
"""
import datetime
from sqlalchemy import (
    Column, Integer, String, Numeric, ForeignKey,
    DateTime, Date, Text, Boolean, CheckConstraint, Index
)
from sqlalchemy.orm import relationship
from app.db.database import Base


def _now():
    return datetime.datetime.utcnow()


class SaleOrderPayment(Base):
    """Libro transaccional de pagos de ventas."""
    __tablename__ = "sale_order_payments"

    id                  = Column(Integer, primary_key=True, index=True)
    sale_order_id       = Column(Integer, ForeignKey("sale_orders.id", ondelete="CASCADE"), nullable=False)
    customer_id         = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    tipo                = Column(String(30), nullable=False)
    # ANTICIPO | ABONO | PAGO_TOTAL | PAGO_SALDO | DEVOLUCION | REVERSION | AJUSTE_AUTORIZADO
    monto               = Column(Numeric(14, 2), nullable=False)
    moneda              = Column(String(10), nullable=False, default="COP")
    metodo_pago         = Column(String(50), nullable=True)
    fecha               = Column(Date, nullable=False)
    referencia_bancaria = Column(String(150), nullable=True)
    comprobante         = Column(String(255), nullable=True)
    usuario             = Column(String(150), nullable=True)
    idempotency_key     = Column(String(150), unique=True, nullable=True)
    estado              = Column(String(30), nullable=False, default="CONFIRMADO")
    # CONFIRMADO | REVERTIDO | ANULADO
    reversed_payment_id = Column(Integer, ForeignKey("sale_order_payments.id", ondelete="SET NULL"), nullable=True)
    notes               = Column(Text, nullable=True)
    created_at          = Column(DateTime, default=_now)

    sale_order       = relationship("SaleOrder", back_populates="payments")
    customer         = relationship("Customer", foreign_keys=[customer_id])
    reversed_payment = relationship("SaleOrderPayment", remote_side=[id], foreign_keys=[reversed_payment_id])

    __table_args__ = (
        CheckConstraint("tipo IN ('ANTICIPO', 'ABONO', 'PAGO_TOTAL', 'PAGO_SALDO', 'DEVOLUCION', 'REVERSION', 'AJUSTE_AUTORIZADO')", name="chk_sop_tipo"),
        CheckConstraint("estado IN ('CONFIRMADO', 'REVERTIDO', 'ANULADO')", name="chk_sop_estado"),
        CheckConstraint("monto > 0", name="chk_sop_monto"),
        Index("ix_sop_so_estado", "sale_order_id", "estado"),
        Index("ix_sop_customer", "customer_id"),
    )


class SalePackingSession(Base):
    """Zona de empaque operativa con agrupacion multiventas por cliente."""
    __tablename__ = "sale_packing_sessions"

    id               = Column(Integer, primary_key=True, index=True)
    numero           = Column(String(30), unique=True, nullable=False, index=True)
    customer_id      = Column(Integer, ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False)
    warehouse_id     = Column(Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False)
    status           = Column(String(30), nullable=False, default="EN_PROCESO")
    # EN_PROCESO | LISTO_DESPACHO | DESPACHADO | CANCELADO
    responsible_user = Column(String(150), nullable=True)
    observations     = Column(Text, nullable=True)
    incidents        = Column(Text, nullable=True)
    created_at       = Column(DateTime, default=_now)
    completed_at     = Column(DateTime, nullable=True)

    customer   = relationship("Customer", foreign_keys=[customer_id])
    warehouse  = relationship("Warehouse", foreign_keys=[warehouse_id])
    items      = relationship("SalePackingItem", back_populates="packing_session", cascade="all, delete-orphan")
    deliveries = relationship("SaleOrderDelivery", back_populates="packing_session")

    __table_args__ = (
        CheckConstraint("status IN ('EN_PROCESO', 'LISTO_DESPACHO', 'DESPACHADO', 'CANCELADO')", name="chk_packing_status"),
        Index("ix_packing_customer", "customer_id"),
    )


class SalePackingItem(Base):
    """Linea de producto en una sesion de empaque."""
    __tablename__ = "sale_packing_items"

    id                 = Column(Integer, primary_key=True, index=True)
    packing_id         = Column(Integer, ForeignKey("sale_packing_sessions.id", ondelete="CASCADE"), nullable=False)
    sale_order_id      = Column(Integer, ForeignKey("sale_orders.id", ondelete="RESTRICT"), nullable=False)
    sale_order_line_id = Column(Integer, ForeignKey("sale_order_lines_erp.id", ondelete="RESTRICT"), nullable=False)
    sku_id             = Column(Integer, ForeignKey("product_skus.id", ondelete="RESTRICT"), nullable=False)
    quantity           = Column(Numeric(10, 2), nullable=False)
    verified_quantity  = Column(Numeric(10, 2), nullable=False, default=0.00)
    status             = Column(String(30), nullable=False, default="EMPACADO")
    # PENDIENTE | EMPACADO | INCIDENCIA
    notes              = Column(Text, nullable=True)
    created_at         = Column(DateTime, default=_now)

    packing_session = relationship("SalePackingSession", back_populates="items")
    sale_order      = relationship("SaleOrder")
    sale_order_line = relationship("SaleOrderLineErp")
    sku             = relationship("ProductSKU")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_pack_item_qty"),
        CheckConstraint("verified_quantity >= 0", name="chk_pack_item_vqty"),
        CheckConstraint("verified_quantity <= quantity", name="chk_pack_item_vqty_le_qty"),
        CheckConstraint("status IN ('PENDIENTE', 'EMPACADO', 'INCIDENCIA')", name="chk_pack_item_status"),
        Index("ix_pack_items_line", "sale_order_line_id"),
    )


class SaleOrderDelivery(Base):
    """Despacho y entrega de productos al cliente."""
    __tablename__ = "sale_order_deliveries"

    id                   = Column(Integer, primary_key=True, index=True)
    numero               = Column(String(30), unique=True, nullable=False, index=True)
    customer_id          = Column(Integer, ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False)
    delivery_method      = Column(String(50), nullable=False)
    # RECOGIDA_BARRANQUILLA | ENTREGA_LOCAL | ENVIO_NACIONAL | PORTERIA | OTRO
    address_snapshot     = Column(String(300), nullable=True)
    city                 = Column(String(100), nullable=True)
    phone                = Column(String(50), nullable=True)
    carrier              = Column(String(100), nullable=True)
    tracking_number      = Column(String(150), nullable=True)
    shipping_cost        = Column(Numeric(14, 2), nullable=False, default=0.00)
    shipping_paid_by     = Column(String(20), nullable=False, default="CLIENTE")
    # CLIENTE | EMPRESA
    scheduled_date       = Column(DateTime, nullable=True)
    dispatch_date        = Column(DateTime, nullable=True)
    delivery_date        = Column(DateTime, nullable=True)
    evidence_url         = Column(Text, nullable=True)
    observations         = Column(Text, nullable=True)
    status               = Column(String(30), nullable=False, default="BORRADOR")
    # BORRADOR | PREPARANDO | DESPACHADO | EN_TRANSITO | ENTREGADO | INCIDENCIA | DEVUELTO | CANCELADO
    warehouse_id         = Column(Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False)
    packing_id           = Column(Integer, ForeignKey("sale_packing_sessions.id", ondelete="SET NULL"), nullable=True)
    idempotency_key      = Column(String(150), unique=True, nullable=True)
    policy_warning       = Column(Text, nullable=True)
    policy_authorized_by = Column(String(150), nullable=True)
    created_by           = Column(String(150), nullable=True)
    created_at           = Column(DateTime, default=_now)
    updated_at           = Column(DateTime, default=_now, onupdate=_now)

    customer        = relationship("Customer", foreign_keys=[customer_id])
    warehouse       = relationship("Warehouse", foreign_keys=[warehouse_id])
    packing_session = relationship("SalePackingSession", back_populates="deliveries")
    lines           = relationship("SaleOrderDeliveryLine", back_populates="delivery", cascade="all, delete-orphan")
    returns         = relationship("SaleOrderReturn", back_populates="delivery")

    __table_args__ = (
        CheckConstraint("delivery_method IN ('RECOGIDA_BARRANQUILLA', 'ENTREGA_LOCAL', 'ENVIO_NACIONAL', 'PORTERIA', 'OTRO')", name="chk_deliv_method"),
        CheckConstraint("shipping_paid_by IN ('CLIENTE', 'EMPRESA')", name="chk_deliv_paidby"),
        CheckConstraint("status IN ('BORRADOR', 'PREPARANDO', 'DESPACHADO', 'EN_TRANSITO', 'ENTREGADO', 'INCIDENCIA', 'DEVUELTO', 'CANCELADO')", name="chk_deliv_status"),
        Index("ix_deliv_customer", "customer_id"),
        Index("ix_deliv_status", "status"),
    )


class SaleOrderDeliveryLine(Base):
    """Linea de entrega con cantidad y propietario."""
    __tablename__ = "sale_order_delivery_lines"

    id                 = Column(Integer, primary_key=True, index=True)
    delivery_id        = Column(Integer, ForeignKey("sale_order_deliveries.id", ondelete="CASCADE"), nullable=False)
    sale_order_id      = Column(Integer, ForeignKey("sale_orders.id", ondelete="RESTRICT"), nullable=False)
    sale_order_line_id = Column(Integer, ForeignKey("sale_order_lines_erp.id", ondelete="RESTRICT"), nullable=False)
    sku_id             = Column(Integer, ForeignKey("product_skus.id", ondelete="RESTRICT"), nullable=False)
    quantity           = Column(Numeric(10, 2), nullable=False)
    owner              = Column(String(20), nullable=False, default="NEBULAE")
    # NEBULAE | MAU
    created_at         = Column(DateTime, default=_now)

    delivery        = relationship("SaleOrderDelivery", back_populates="lines")
    sale_order      = relationship("SaleOrder")
    sale_order_line = relationship("SaleOrderLineErp")
    sku             = relationship("ProductSKU")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_deliv_line_qty"),
        CheckConstraint("owner IN ('NEBULAE', 'MAU')", name="chk_deliv_line_owner"),
        Index("ix_deliv_lines_line", "sale_order_line_id"),
    )


class SaleOrderReturn(Base):
    """Devolucion de cliente total o parcial."""
    __tablename__ = "sale_order_returns"

    id                   = Column(Integer, primary_key=True, index=True)
    numero               = Column(String(30), unique=True, nullable=False, index=True)
    sale_order_id        = Column(Integer, ForeignKey("sale_orders.id", ondelete="RESTRICT"), nullable=False)
    delivery_id          = Column(Integer, ForeignKey("sale_order_deliveries.id", ondelete="SET NULL"), nullable=True)
    customer_id          = Column(Integer, ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False)
    financial_resolution = Column(String(50), nullable=False)
    # DEVOLUCION_DINERO | SALDO_A_FAVOR | SIN_DEVOLUCION_DINERO
    refund_amount        = Column(Numeric(14, 2), nullable=False, default=0.00)
    status               = Column(String(30), nullable=False, default="PROCESADA")
    # REGISTRADA | PROCESADA | CANCELADA
    reason               = Column(Text, nullable=True)
    evidence_url         = Column(Text, nullable=True)
    authorized_by        = Column(String(150), nullable=True)
    idempotency_key      = Column(String(150), unique=True, nullable=True)
    created_by           = Column(String(150), nullable=True)
    created_at           = Column(DateTime, default=_now)

    sale_order = relationship("SaleOrder", back_populates="returns")
    delivery   = relationship("SaleOrderDelivery", back_populates="returns")
    customer   = relationship("Customer", foreign_keys=[customer_id])
    lines      = relationship("SaleOrderReturnLine", back_populates="return_order", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("financial_resolution IN ('DEVOLUCION_DINERO', 'SALDO_A_FAVOR', 'SIN_DEVOLUCION_DINERO')", name="chk_ret_fin_res"),
        CheckConstraint("status IN ('REGISTRADA', 'PROCESADA', 'CANCELADA')", name="chk_ret_status"),
        CheckConstraint("refund_amount >= 0", name="chk_return_refund_amt"),
        Index("ix_ret_order", "sale_order_id"),
        Index("ix_ret_customer", "customer_id"),
    )


class SaleOrderReturnLine(Base):
    """Linea devuelta con resolucion de inventario."""
    __tablename__ = "sale_order_return_lines"

    id                   = Column(Integer, primary_key=True, index=True)
    return_id            = Column(Integer, ForeignKey("sale_order_returns.id", ondelete="CASCADE"), nullable=False)
    sale_order_line_id   = Column(Integer, ForeignKey("sale_order_lines_erp.id", ondelete="RESTRICT"), nullable=False)
    sku_id               = Column(Integer, ForeignKey("product_skus.id", ondelete="RESTRICT"), nullable=False)
    warehouse_id         = Column(Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False)
    quantity             = Column(Numeric(10, 2), nullable=False)
    inventory_resolution = Column(String(30), nullable=False)
    # REINTEGRAR_STOCK | CUARENTENA | DESTRUIDO | DEVOLVER_PROVEEDOR
    product_condition    = Column(String(50), nullable=False)
    # NUEVO_SELLADO | ABIERTO_BUENO | DEFECTUOSO | DAÑADO
    owner                = Column(String(20), nullable=False, default="NEBULAE")
    # NEBULAE | MAU
    quarantine_id        = Column(Integer, ForeignKey("inventory_quarantine.id", ondelete="SET NULL"), nullable=True)
    created_at           = Column(DateTime, default=_now)

    return_order    = relationship("SaleOrderReturn", back_populates="lines")
    sale_order_line = relationship("SaleOrderLineErp")
    sku             = relationship("ProductSKU")
    warehouse       = relationship("Warehouse")
    quarantine      = relationship("InventoryQuarantine")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_ret_line_qty"),
        CheckConstraint("inventory_resolution IN ('REINTEGRAR_STOCK', 'CUARENTENA', 'DESTRUIDO', 'DEVOLVER_PROVEEDOR')", name="chk_ret_line_inv_res"),
        CheckConstraint("product_condition IN ('NUEVO_SELLADO', 'ABIERTO_BUENO', 'DEFECTUOSO', 'DAÑADO')", name="chk_ret_line_cond"),
        CheckConstraint("owner IN ('NEBULAE', 'MAU')", name="chk_ret_line_owner"),
        Index("ix_ret_lines_line", "sale_order_line_id"),
    )
