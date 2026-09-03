"""PaymentTransaction — Pagos atómicos por pedido de venta."""
from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from app.db.database import Base
import datetime


def _now():
    return datetime.datetime.utcnow()


class PaymentTransaction(Base):
    """
    Registro atómico de cada movimiento de dinero vinculado a un pedido de venta.
    Preserva los campos acumulados anticipo_cop/saldo_cop en sale_orders como compatibilidad,
    pero la fuente de verdad para auditoría y finanzas son estas transacciones.
    """
    __tablename__ = "payment_transactions"

    id              = Column(Integer, primary_key=True, index=True)
    numero          = Column(String(30), unique=True, nullable=False, index=True)
    ven_id          = Column(Integer, ForeignKey("sale_orders.id"), nullable=False, index=True)
    pxp_id          = Column(Integer, ForeignKey("payment_pendings.id"), nullable=True)
    customer_id     = Column(Integer, ForeignKey("customers.id"), nullable=True)
    tipo            = Column(String(30), nullable=False)
    # ANTICIPO | ABONO | SALDO | DEVOLUCION | AJUSTE
    monto           = Column(Numeric(14, 2), nullable=False)
    moneda          = Column(String(10), nullable=False, default="COP")
    metodo_pago     = Column(String(100), nullable=True)
    # Efectivo | Transferencia | Nequi | Daviplata | Tarjeta | Cheque | Otro
    referencia      = Column(String(200), nullable=True)   # Numero de transferencia, voucher, etc.
    estado          = Column(String(30), nullable=False, default="CONFIRMADO")
    # PENDIENTE | CONFIRMADO | RECHAZADO | REVERTIDO
    fecha_pago      = Column(DateTime, nullable=True)
    notas           = Column(Text, nullable=True)
    registrado_por  = Column(String(150), nullable=True)
    created_at      = Column(DateTime, default=_now)
    updated_at      = Column(DateTime, default=_now, onupdate=_now)

    sale_order       = relationship("SaleOrder", foreign_keys=[ven_id])
    payment_pending  = relationship("PaymentPending", foreign_keys=[pxp_id])
    customer         = relationship("Customer", foreign_keys=[customer_id])
