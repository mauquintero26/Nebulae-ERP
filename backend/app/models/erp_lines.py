"""
ERP Lines — Normalized line items for SC, COT, VEN, PEC and ENINV.
These tables complement (not replace) the existing JSON `productos` fields,
which are preserved as snapshot/compatibility during migration.
"""
from sqlalchemy import (
    Column, Integer, String, Numeric, ForeignKey,
    DateTime, Text, Boolean, JSON, Index
)
from sqlalchemy.orm import relationship
from app.db.database import Base
import datetime


def _now():
    return datetime.datetime.utcnow()


# --- SOLICITUD DE CLIENTE Lineas ---

class CustomerRequestLine(Base):
    __tablename__ = "customer_request_lines"

    id                  = Column(Integer, primary_key=True, index=True)
    sc_id               = Column(Integer, ForeignKey("customer_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    sku_id              = Column(Integer, ForeignKey("product_skus.id"), nullable=True)
    descripcion         = Column(String(300), nullable=True)
    imagen_url          = Column(String(500), nullable=True)
    proveedor_sugerido  = Column(String(200), nullable=True)
    variante            = Column(String(200), nullable=True)
    cantidad            = Column(Integer, nullable=False, default=1)
    precio_estimado_usd = Column(Numeric(12, 2), nullable=True)
    notas               = Column(Text, nullable=True)
    tipo_entrega        = Column(String(30), nullable=True, default="POR_PEDIDO")
    created_at          = Column(DateTime, default=_now)
    updated_at          = Column(DateTime, default=_now, onupdate=_now)

    customer_request = relationship("CustomerRequest", foreign_keys=[sc_id])
    sku              = relationship("ProductSKU", foreign_keys=[sku_id])


# --- COTIZACION Lineas ---

class SalesQuotationLine(Base):
    __tablename__ = "sales_quotation_lines"

    id                      = Column(Integer, primary_key=True, index=True)
    cot_id                  = Column(Integer, ForeignKey("sales_quotations.id", ondelete="CASCADE"), nullable=False, index=True)
    sc_line_id              = Column(Integer, ForeignKey("customer_request_lines.id"), nullable=True)
    sku_id                  = Column(Integer, ForeignKey("product_skus.id"), nullable=True)
    descripcion             = Column(String(300), nullable=True)
    imagen_url              = Column(String(500), nullable=True)
    variante                = Column(String(200), nullable=True)
    cantidad                = Column(Integer, nullable=False, default=1)
    precio_usd              = Column(Numeric(12, 2), nullable=True)
    trm_usada               = Column(Numeric(10, 2), nullable=True)
    descuento_pct           = Column(Numeric(5, 2), nullable=True, default=0)
    impuesto_pct            = Column(Numeric(5, 2), nullable=True, default=0)
    flete_estimado_cop      = Column(Numeric(12, 2), nullable=True, default=0)
    envio_interno_cop       = Column(Numeric(12, 2), nullable=True, default=0)
    peso_estimado_kg        = Column(Numeric(8, 3), nullable=True)
    otros_costos_cop        = Column(Numeric(12, 2), nullable=True, default=0)
    margen_pct              = Column(Numeric(5, 2), nullable=True, default=0)
    precio_venta_cop        = Column(Numeric(14, 2), nullable=True)
    subtotal_cop            = Column(Numeric(14, 2), nullable=True)
    tipo_entrega            = Column(String(30), nullable=True, default="POR_PEDIDO")
    notas                   = Column(Text, nullable=True)
    created_at              = Column(DateTime, default=_now)
    updated_at              = Column(DateTime, default=_now, onupdate=_now)

    quotation  = relationship("SalesQuotation", foreign_keys=[cot_id])
    sc_line    = relationship("CustomerRequestLine", foreign_keys=[sc_line_id])
    sku        = relationship("ProductSKU", foreign_keys=[sku_id])


# --- PEDIDO DE VENTA Lineas ---

class SaleOrderLineErp(Base):
    __tablename__ = "sale_order_lines_erp"

    id                  = Column(Integer, primary_key=True, index=True)
    ven_id              = Column(Integer, ForeignKey("sale_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    cot_line_id         = Column(Integer, ForeignKey("sales_quotation_lines.id"), nullable=True)
    sku_id              = Column(Integer, ForeignKey("product_skus.id"), nullable=True)
    descripcion         = Column(String(300), nullable=True)
    imagen_url          = Column(String(500), nullable=True)
    variante            = Column(String(200), nullable=True)
    cantidad            = Column(Integer, nullable=False, default=1)
    precio_venta_cop    = Column(Numeric(14, 2), nullable=True)
    subtotal_cop        = Column(Numeric(14, 2), nullable=True)
    costo_estimado_cop  = Column(Numeric(14, 2), nullable=True)
    tipo_entrega        = Column(String(30), nullable=True, default="POR_PEDIDO")
    estado              = Column(String(50), nullable=False, default="PENDIENTE")
    notas               = Column(Text, nullable=True)
    created_at          = Column(DateTime, default=_now)
    updated_at          = Column(DateTime, default=_now, onupdate=_now)

    sale_order  = relationship("SaleOrder", foreign_keys=[ven_id])
    cot_line    = relationship("SalesQuotationLine", foreign_keys=[cot_line_id])
    sku         = relationship("ProductSKU", foreign_keys=[sku_id])
    allocations = relationship("ProcurementAllocation", back_populates="sale_order_line")


# --- PEDIDO DE COMPRA Lineas ---

class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"

    id                      = Column(Integer, primary_key=True, index=True)
    pec_id                  = Column(Integer, ForeignKey("purchase_orders_full.id", ondelete="CASCADE"), nullable=False, index=True)
    sku_id                  = Column(Integer, ForeignKey("product_skus.id"), nullable=True)
    descripcion             = Column(String(300), nullable=True)
    imagen_url              = Column(String(500), nullable=True)
    proveedor_ref           = Column(String(200), nullable=True)
    variante                = Column(String(200), nullable=True)
    cantidad_ordenada       = Column(Integer, nullable=False, default=1)
    cantidad_confirmada     = Column(Integer, nullable=True)
    cantidad_enviada        = Column(Integer, nullable=True)
    cantidad_recibida       = Column(Integer, nullable=True, default=0)
    cantidad_cancelada      = Column(Integer, nullable=True, default=0)
    cantidad_defectuosa     = Column(Integer, nullable=True, default=0)
    precio_usd              = Column(Numeric(12, 2), nullable=True)
    trm_usada               = Column(Numeric(10, 2), nullable=True)
    descuento_pct           = Column(Numeric(5, 2), nullable=True, default=0)
    impuesto_pct            = Column(Numeric(5, 2), nullable=True, default=0)
    envio_interno_usd       = Column(Numeric(10, 2), nullable=True, default=0)
    peso_estimado_kg        = Column(Numeric(8, 3), nullable=True)
    flete_estimado_cop      = Column(Numeric(12, 2), nullable=True, default=0)
    transporte_nacional_cop = Column(Numeric(12, 2), nullable=True, default=0)
    otros_costos_cop        = Column(Numeric(12, 2), nullable=True, default=0)
    costo_estimado_cop      = Column(Numeric(14, 2), nullable=True)
    costo_real_cop          = Column(Numeric(14, 2), nullable=True)
    estado                  = Column(String(50), nullable=False, default="PENDIENTE")
    notas                   = Column(Text, nullable=True)
    created_at              = Column(DateTime, default=_now)
    updated_at              = Column(DateTime, default=_now, onupdate=_now)

    purchase_order = relationship("PurchaseOrderFull", foreign_keys=[pec_id])
    sku            = relationship("ProductSKU", foreign_keys=[sku_id])
    allocations    = relationship("ProcurementAllocation", back_populates="purchase_order_line")
    receipt_lines  = relationship("GoodsReceiptLine", back_populates="purchase_order_line")


# --- ASIGNACIONES DE ABASTECIMIENTO ---

class ProcurementAllocation(Base):
    __tablename__ = "procurement_allocations"

    id                  = Column(Integer, primary_key=True, index=True)
    pec_line_id         = Column(Integer, ForeignKey("purchase_order_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    ven_line_id         = Column(Integer, ForeignKey("sale_order_lines_erp.id"), nullable=True)
    ven_id              = Column(Integer, ForeignKey("sale_orders.id"), nullable=True)
    customer_id         = Column(Integer, ForeignKey("customers.id"), nullable=True)
    ownership_type      = Column(String(20), nullable=False, default="NEBULAE")
    allocation_type     = Column(String(30), nullable=False, default="NEBULAE_STOCK")
    cantidad_asignada   = Column(Integer, nullable=False, default=0)
    cantidad_recibida   = Column(Integer, nullable=True, default=0)
    cantidad_cancelada  = Column(Integer, nullable=True, default=0)
    cantidad_defectuosa = Column(Integer, nullable=True, default=0)
    cantidad_entregada  = Column(Integer, nullable=True, default=0)
    estado              = Column(String(50), nullable=False, default="PENDIENTE_COMPRA")
    notas               = Column(Text, nullable=True)
    created_at          = Column(DateTime, default=_now)
    updated_at          = Column(DateTime, default=_now, onupdate=_now)

    purchase_order_line = relationship("PurchaseOrderLine", back_populates="allocations")
    sale_order_line     = relationship("SaleOrderLineErp", back_populates="allocations")
    sale_order          = relationship("SaleOrder", foreign_keys=[ven_id])
    customer            = relationship("Customer", foreign_keys=[customer_id])


# --- RECEPCION Lineas ---

class GoodsReceiptLine(Base):
    __tablename__ = "goods_receipt_lines"

    id                  = Column(Integer, primary_key=True, index=True)
    eninv_id            = Column(Integer, ForeignKey("goods_receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    pec_line_id         = Column(Integer, ForeignKey("purchase_order_lines.id"), nullable=True)
    allocation_id       = Column(Integer, ForeignKey("procurement_allocations.id"), nullable=True)
    sku_id              = Column(Integer, ForeignKey("product_skus.id"), nullable=True)
    descripcion         = Column(String(300), nullable=True)
    variante            = Column(String(200), nullable=True)
    cantidad_esperada   = Column(Integer, nullable=False, default=0)
    cantidad_recibida   = Column(Integer, nullable=False, default=0)
    cantidad_faltante   = Column(Integer, nullable=True, default=0)
    cantidad_adicional  = Column(Integer, nullable=True, default=0)
    cantidad_defectuosa = Column(Integer, nullable=True, default=0)
    resultado           = Column(String(30), nullable=False, default="PENDIENTE")
    ubicacion_destino   = Column(String(200), nullable=True)
    lote                = Column(String(100), nullable=True)
    evidencia_url       = Column(String(500), nullable=True)
    observacion         = Column(Text, nullable=True)
    ownership_type      = Column(String(20), nullable=True, default="NEBULAE")
    created_at          = Column(DateTime, default=_now)
    updated_at          = Column(DateTime, default=_now, onupdate=_now)

    goods_receipt       = relationship("GoodsReceipt", foreign_keys=[eninv_id])
    purchase_order_line = relationship("PurchaseOrderLine", back_populates="receipt_lines")
    allocation          = relationship("ProcurementAllocation", foreign_keys=[allocation_id])
    sku                 = relationship("ProductSKU", foreign_keys=[sku_id])


# --- RESERVAS DE INVENTARIO ---

class InventoryReservation(Base):
    __tablename__ = "inventory_reservations"

    id              = Column(Integer, primary_key=True, index=True)
    sku_id          = Column(Integer, ForeignKey("product_skus.id"), nullable=False, index=True)
    warehouse_id    = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    ven_id          = Column(Integer, ForeignKey("sale_orders.id"), nullable=True)
    customer_id     = Column(Integer, ForeignKey("customers.id"), nullable=True)
    cantidad        = Column(Integer, nullable=False, default=0)
    tipo            = Column(String(30), nullable=False, default="TEMPORAL")
    estado          = Column(String(30), nullable=False, default="ACTIVA")
    expires_at      = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=_now)
    updated_at      = Column(DateTime, default=_now, onupdate=_now)
    created_by      = Column(String(150), nullable=True)

    sku        = relationship("ProductSKU", foreign_keys=[sku_id])
    warehouse  = relationship("Warehouse", foreign_keys=[warehouse_id])
    sale_order = relationship("SaleOrder", foreign_keys=[ven_id])
    customer   = relationship("Customer", foreign_keys=[customer_id])

    __table_args__ = (
        Index("ix_inv_res_sku_wh_estado", "sku_id", "warehouse_id", "estado"),
    )
