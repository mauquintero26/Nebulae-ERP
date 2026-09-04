"""
Fase 3 - Modelos para Recepciones e Inventario (Prompt Maestro).

Entidades:
- InventoryQuarantine: Registro y aislamiento de unidades defectuosas, dañadas o discrepantes.
"""
import datetime
from sqlalchemy import (
    Column, Integer, String, Numeric, ForeignKey,
    DateTime, Text, Boolean, Date, UniqueConstraint, Index,
    CheckConstraint
)
from sqlalchemy.orm import relationship
from app.db.database import Base


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


class InventoryQuarantine(Base):
    """Unidades retenidas en cuarentena, defectuosas, dañadas o equivocadas.

    Invariante: Estas unidades NO computan en el inventario vendible/disponible.
    """
    __tablename__ = "inventory_quarantine"

    id           = Column(Integer, primary_key=True, index=True)
    sku_id       = Column(Integer, ForeignKey("product_skus.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    gr_line_id   = Column(Integer, ForeignKey("goods_receipt_lines.id", ondelete="SET NULL"), nullable=True)
    quantity     = Column(Numeric(10, 2), nullable=False)
    reason       = Column(String(100), nullable=False)
    # DEFECTUOSO | EQUIVOCADO | DAÑADO_TRANSPORTE | CUARENTENA_CALIDAD
    status       = Column(String(30), nullable=False, default="ACTIVO")
    # ACTIVO | LIBERADO | DEVUELTO_PROVEEDOR | DESTRUIDO
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime(timezone=True), default=_now, nullable=False)
    resolved_at  = Column(DateTime(timezone=True), nullable=True)
    resolved_by  = Column(String(150), nullable=True)

    sku          = relationship("ProductSKU", foreign_keys=[sku_id])
    warehouse    = relationship("Warehouse", foreign_keys=[warehouse_id])
    gr_line      = relationship("GoodsReceiptLine", foreign_keys=[gr_line_id])

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_quarantine_qty"),
        CheckConstraint("status IN ('ACTIVO', 'LIBERADO', 'DEVUELTO_PROVEEDOR', 'DESTRUIDO')", name="chk_quarantine_status"),
    )
