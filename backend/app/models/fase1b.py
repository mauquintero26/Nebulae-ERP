"""
Fase 1B - Modelos normalizados para líneas de documentos, asignaciones,
balances por propietario, reservas de inventario y transacciones de pago.

Estos modelos coexisten con los campos JSON legacy (productos, tracking_stages, etc.)
que se conservan como snapshot para compatibilidad con el frontend actual.
"""
from sqlalchemy import (
    Column, Integer, String, Numeric, ForeignKey,
    DateTime, Text, Boolean, Date, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from app.db.database import Base
import datetime


def _now():
    return datetime.datetime.utcnow()


# ─────────────────────────────────────────────────────────────────────────────
# GRUPO 1: Líneas de documentos de venta
# ─────────────────────────────────────────────────────────────────────────────

class CustomerRequestLine(Base):
    """Líneas normalizadas de Solicitud de Cliente (SC)."""
    __tablename__ = "customer_request_lines"

    id                = Column(Integer, primary_key=True, index=True)
    cr_id             = Column(Integer, ForeignKey("customer_requests.id", ondelete="CASCADE"), nullable=False)
    sku_id            = Column(Integer, ForeignKey("product_skus.id", ondelete="SET NULL"), nullable=True)
    description       = Column(String(300), nullable=True)
    quantity          = Column(Numeric(10, 2), nullable=False, default=1)
    unit_price_usd    = Column(Numeric(14, 2), nullable=True)
    unit_price_cop    = Column(Numeric(14, 2), nullable=True)
    # Trazabilidad de origen: NATIVE = creado directamente, BACKFILL = migrado desde JSON
    source            = Column(String(20), nullable=False, default="NATIVE")
    migration_batch_id = Column(String(50), nullable=True, index=True)
    created_at        = Column(DateTime, default=_now)

    customer_request  = relationship("CustomerRequest", foreign_keys=[cr_id])
    sku               = relationship("ProductSKU", foreign_keys=[sku_id])
    quotation_lines   = relationship("SalesQuotationLine", back_populates="cr_line")


class SalesQuotationLine(Base):
    """Líneas normalizadas de Cotización (COT)."""
    __tablename__ = "sales_quotation_lines"

    id                = Column(Integer, primary_key=True, index=True)
    sq_id             = Column(Integer, ForeignKey("sales_quotations.id", ondelete="CASCADE"), nullable=False)
    sku_id            = Column(Integer, ForeignKey("product_skus.id", ondelete="SET NULL"), nullable=True)
    cr_line_id        = Column(Integer, ForeignKey("customer_request_lines.id", ondelete="SET NULL"), nullable=True)
    description       = Column(String(300), nullable=True)
    quantity          = Column(Numeric(10, 2), nullable=False, default=1)
    unit_price_usd    = Column(Numeric(14, 2), nullable=True)
    unit_price_cop    = Column(Numeric(14, 2), nullable=True)
    descuento_pct     = Column(Numeric(5, 2), nullable=False, default=0)
    source            = Column(String(20), nullable=False, default="NATIVE")
    migration_batch_id = Column(String(50), nullable=True, index=True)
    created_at        = Column(DateTime, default=_now)

    quotation         = relationship("SalesQuotation", foreign_keys=[sq_id])
    sku               = relationship("ProductSKU", foreign_keys=[sku_id])
    cr_line           = relationship("CustomerRequestLine", back_populates="quotation_lines")
    sale_order_lines  = relationship("SaleOrderLineErp", back_populates="sq_line")


class SaleOrderLineErp(Base):
    """Líneas normalizadas de Pedido de Venta ERP (PVEN)."""
    __tablename__ = "sale_order_lines_erp"

    id                = Column(Integer, primary_key=True, index=True)
    so_id             = Column(Integer, ForeignKey("sale_orders.id", ondelete="CASCADE"), nullable=False)
    sku_id            = Column(Integer, ForeignKey("product_skus.id", ondelete="SET NULL"), nullable=True)
    sq_line_id        = Column(Integer, ForeignKey("sales_quotation_lines.id", ondelete="SET NULL"), nullable=True)
    description       = Column(String(300), nullable=True)
    quantity          = Column(Numeric(10, 2), nullable=False, default=1)
    unit_price_cop    = Column(Numeric(14, 2), nullable=False, default=0)
    descuento_pct     = Column(Numeric(5, 2), nullable=False, default=0)
    source            = Column(String(20), nullable=False, default="NATIVE")
    migration_batch_id = Column(String(50), nullable=True, index=True)
    created_at        = Column(DateTime, default=_now)

    sale_order        = relationship("SaleOrder", foreign_keys=[so_id])
    sku               = relationship("ProductSKU", foreign_keys=[sku_id])
    sq_line           = relationship("SalesQuotationLine", back_populates="sale_order_lines")
    procurement_allocations = relationship("ProcurementAllocation", back_populates="sale_order_line")
    reservations      = relationship("InventoryReservation", back_populates="sale_order_line")


# ─────────────────────────────────────────────────────────────────────────────
# GRUPO 2: Líneas de compra y asignaciones
# ─────────────────────────────────────────────────────────────────────────────

class PurchaseOrderLine(Base):
    """Líneas normalizadas de Pedido de Compra (PEC)."""
    __tablename__ = "purchase_order_lines"

    id                 = Column(Integer, primary_key=True, index=True)
    pec_id             = Column(Integer, ForeignKey("purchase_orders_full.id", ondelete="CASCADE"), nullable=False)
    sku_id             = Column(Integer, ForeignKey("product_skus.id", ondelete="SET NULL"), nullable=True)
    description        = Column(String(300), nullable=True)
    quantity_ordered   = Column(Numeric(10, 2), nullable=False, default=1)
    unit_cost_usd      = Column(Numeric(14, 2), nullable=True)
    unit_cost_cop      = Column(Numeric(14, 2), nullable=True)
    quantity_received  = Column(Numeric(10, 2), nullable=False, default=0)
    source             = Column(String(20), nullable=False, default="NATIVE")
    migration_batch_id = Column(String(50), nullable=True, index=True)
    created_at         = Column(DateTime, default=_now)

    purchase_order     = relationship("PurchaseOrderFull", foreign_keys=[pec_id])
    sku                = relationship("ProductSKU", foreign_keys=[sku_id])
    procurement_allocations = relationship("ProcurementAllocation", back_populates="po_line")
    receipt_lines      = relationship("GoodsReceiptLine", back_populates="po_line")


class ProcurementAllocation(Base):
    """Asignación de una línea de compra a un destino (cliente, Nebulae o Mau).

    Reglas:
    - allocation_type = CUSTOMER_ORDER → sale_order_line_id OBLIGATORIO
    - allocation_type = NEBULAE_STOCK  → sale_order_line_id puede ser NULL
    - allocation_type = MAU_STOCK      → sale_order_line_id puede ser NULL
    - sum(quantity_allocated) per po_line_id ≤ po_line.quantity_ordered
    """
    __tablename__ = "procurement_allocations"

    id                  = Column(Integer, primary_key=True, index=True)
    po_line_id          = Column(Integer, ForeignKey("purchase_order_lines.id", ondelete="CASCADE"), nullable=False)
    allocation_type     = Column(String(20), nullable=False)
    # CUSTOMER_ORDER | NEBULAE_STOCK | MAU_STOCK
    sale_order_line_id  = Column(Integer, ForeignKey("sale_order_lines_erp.id", ondelete="SET NULL"), nullable=True)
    quantity_allocated  = Column(Numeric(10, 2), nullable=False, default=0)
    created_at          = Column(DateTime, default=_now)

    po_line             = relationship("PurchaseOrderLine", back_populates="procurement_allocations")
    sale_order_line     = relationship("SaleOrderLineErp", back_populates="procurement_allocations")
    receipt_line_allocations = relationship("GoodsReceiptLineAllocation", back_populates="allocation")

    __table_args__ = (
        UniqueConstraint(
            "po_line_id", "sale_order_line_id",
            name="uq_proc_alloc_po_sol"
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# GRUPO 3: Líneas de recepción y distribución
# ─────────────────────────────────────────────────────────────────────────────

class GoodsReceiptLine(Base):
    """Líneas normalizadas de ENINV (recepción de mercancía).

    Reemplaza a goods_receipts.productos (JSON) para la lógica definitiva.
    El campo JSON se conserva como snapshot.
    """
    __tablename__ = "goods_receipt_lines"

    id                   = Column(Integer, primary_key=True, index=True)
    gr_id                = Column(Integer, ForeignKey("goods_receipts.id", ondelete="CASCADE"), nullable=False)
    po_line_id           = Column(Integer, ForeignKey("purchase_order_lines.id", ondelete="SET NULL"), nullable=True)
    sku_id               = Column(Integer, ForeignKey("product_skus.id", ondelete="SET NULL"), nullable=True)
    description          = Column(String(300), nullable=True)
    quantity_expected    = Column(Numeric(10, 2), nullable=False, default=0)
    quantity_received    = Column(Numeric(10, 2), nullable=True, default=None)  # NULL = pendiente de registro
    quantity_rejected    = Column(Numeric(10, 2), nullable=False, default=0)
    quantity_quarantine  = Column(Numeric(10, 2), nullable=False, default=0)
    unit_cost_cop        = Column(Numeric(14, 2), nullable=True)
    receipt_type         = Column(String(20), nullable=False, default="FISICA")
    # FISICA | LOGISTICA
    source               = Column(String(20), nullable=False, default="NATIVE")
    migration_batch_id   = Column(String(50), nullable=True, index=True)
    created_at           = Column(DateTime, default=_now)

    goods_receipt        = relationship("GoodsReceipt", foreign_keys=[gr_id])
    po_line              = relationship("PurchaseOrderLine", back_populates="receipt_lines")
    sku                  = relationship("ProductSKU", foreign_keys=[sku_id])
    allocations          = relationship("GoodsReceiptLineAllocation", back_populates="gr_line")


class GoodsReceiptLineAllocation(Base):
    """Distribución de una línea recibida entre asignaciones de compra.

    Permite que una línea recibida abastezca parcialmente múltiples asignaciones.
    sum(quantity_applied per gr_line_id) ≤ gr_line.quantity_received
    """
    __tablename__ = "goods_receipt_line_allocations"

    id                = Column(Integer, primary_key=True, index=True)
    gr_line_id        = Column(Integer, ForeignKey("goods_receipt_lines.id", ondelete="CASCADE"), nullable=False)
    allocation_id     = Column(Integer, ForeignKey("procurement_allocations.id", ondelete="CASCADE"), nullable=False)
    quantity_applied  = Column(Numeric(10, 2), nullable=False, default=0)
    created_at        = Column(DateTime, default=_now)

    gr_line           = relationship("GoodsReceiptLine", back_populates="allocations")
    allocation        = relationship("ProcurementAllocation", back_populates="receipt_line_allocations")

    __table_args__ = (
        UniqueConstraint("gr_line_id", "allocation_id", name="uq_grla_grline_alloc"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# GRUPO 4: Inventario por propietario y reservas
# ─────────────────────────────────────────────────────────────────────────────

class InventoryOwnerBalance(Base):
    """Balance de inventario separado por propietario (NEBULAE vs MAU).

    Un mismo SKU+bodega puede tener balances distintos para cada propietario.
    """
    __tablename__ = "inventory_owner_balances"

    id           = Column(Integer, primary_key=True, index=True)
    sku_id       = Column(Integer, ForeignKey("product_skus.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    owner        = Column(String(20), nullable=False)
    # NEBULAE | MAU
    quantity     = Column(Numeric(10, 2), nullable=False, default=0)
    updated_at   = Column(DateTime, default=_now, onupdate=_now)

    sku          = relationship("ProductSKU", foreign_keys=[sku_id])
    warehouse    = relationship("Warehouse", foreign_keys=[warehouse_id])

    __table_args__ = (
        UniqueConstraint("sku_id", "warehouse_id", "owner", name="uq_inv_owner_bal"),
    )


class InventoryReservation(Base):
    """Reserva de unidades para evitar sobreventa.

    Ciclo de vida: ACTIVE → RELEASED (liberada) | CONVERTED (entregada) | EXPIRED (vencida)
    Las reservas ACTIVE bloquean stock mediante SELECT FOR UPDATE en confirmación.
    """
    __tablename__ = "inventory_reservations"

    id                  = Column(Integer, primary_key=True, index=True)
    sku_id              = Column(Integer, ForeignKey("product_skus.id"), nullable=False)
    warehouse_id        = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    owner               = Column(String(20), nullable=False, default="NEBULAE")
    quantity_reserved   = Column(Numeric(10, 2), nullable=False)
    sale_order_line_id  = Column(Integer, ForeignKey("sale_order_lines_erp.id", ondelete="SET NULL"), nullable=True)
    status              = Column(String(20), nullable=False, default="ACTIVE")
    # ACTIVE | RELEASED | CONVERTED | EXPIRED
    expires_at          = Column(DateTime, nullable=True)
    created_at          = Column(DateTime, default=_now)
    released_at         = Column(DateTime, nullable=True)
    converted_at        = Column(DateTime, nullable=True)
    created_by          = Column(String(150), nullable=True)
    notes               = Column(Text, nullable=True)

    sku                 = relationship("ProductSKU", foreign_keys=[sku_id])
    warehouse           = relationship("Warehouse", foreign_keys=[warehouse_id])
    sale_order_line     = relationship("SaleOrderLineErp", back_populates="reservations")

    __table_args__ = (
        Index("ix_inv_res_sku_wh_status", "sku_id", "warehouse_id", "status"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# GRUPO 5: Transacciones de pago
# ─────────────────────────────────────────────────────────────────────────────

class PaymentTransaction(Base):
    """Transacción individual de pago ligada a un PaymentPending (PXP).

    Permite auditoría granular: cada anticipo, abono, saldo, devolución
    o reversión queda registrado como una fila independiente.
    """
    __tablename__ = "payment_transactions"

    id                = Column(Integer, primary_key=True, index=True)
    pxp_id            = Column(Integer, ForeignKey("payment_pendings.id", ondelete="CASCADE"), nullable=False)
    sale_order_id     = Column(Integer, ForeignKey("sale_orders.id", ondelete="SET NULL"), nullable=True)
    transaction_type  = Column(String(20), nullable=False)
    # ANTICIPO | ABONO | SALDO | DEVOLUCION | REVERSION
    monto             = Column(Numeric(14, 2), nullable=False)
    moneda            = Column(String(10), nullable=False, default="COP")
    metodo_pago       = Column(String(50), nullable=True)
    referencia        = Column(String(150), nullable=True)
    fecha_pago        = Column(Date, nullable=False)
    user_name         = Column(String(150), nullable=True)
    notas             = Column(Text, nullable=True)
    created_at        = Column(DateTime, default=_now)
    is_reversed       = Column(Boolean, nullable=False, default=False)
    reversed_by_id    = Column(Integer, ForeignKey("payment_transactions.id", ondelete="SET NULL"), nullable=True)

    pxp               = relationship("PaymentPending", foreign_keys=[pxp_id])
    sale_order        = relationship("SaleOrder", foreign_keys=[sale_order_id])
    reversed_by       = relationship("PaymentTransaction", remote_side=[id], foreign_keys=[reversed_by_id])