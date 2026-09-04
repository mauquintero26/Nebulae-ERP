"""
Fase 2 - Modelos para Compras, Paquetes y Tránsito (Prompt Maestro).

Entidades:
- LogisticsLocation: Catálogo de agencias y ubicaciones logísticas intermedias.
- Consolidation: Consolidaciones de carga internacional en Miami.
- Shipment: Paquetes y envíos independientes con tracking y carrier.
- ShipmentLine: Líneas de orden de compra asignadas al paquete.
- ShipmentEvent: Eventos e hitos logísticos inmutables de la cadena de suministro.
- ConsolidationShipment: Vínculo N:M entre consolidaciones y paquetes con reparto de flete.
"""
import datetime
from sqlalchemy import (
    Column, Integer, String, Numeric, ForeignKey,
    DateTime, Text, Boolean, Date, UniqueConstraint, Index,
    CheckConstraint, text
)
from sqlalchemy.orm import relationship
from app.db.database import Base


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


class LogisticsLocation(Base):
    """Catálogo de agencias y ubicaciones intermedias en la cadena de suministro."""
    __tablename__ = "logistics_locations"

    id            = Column(Integer, primary_key=True, index=True)
    code          = Column(String(50), unique=True, nullable=False, index=True)
    # ej. MIA_AGENCY_1, MIA_AGENCY_2, BOG_HUB, BAQ_MAIN, AMAZON_DIRECT
    name          = Column(String(150), nullable=False)
    location_type = Column(String(50), nullable=False)
    # AGENCY_MIAMI | DOMESTIC_HUB | BODEGA_LOCAL | DIRECT_ROUTE
    city          = Column(String(100), nullable=True)
    country       = Column(String(50), nullable=True, default="USA")
    address       = Column(String(250), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    is_active     = Column(Boolean, nullable=False, default=True)
    created_at    = Column(DateTime(timezone=True), default=_now)


class Consolidation(Base):
    """Carga o caja consolidada internacional en Miami."""
    __tablename__ = "consolidations"

    id                         = Column(Integer, primary_key=True, index=True)
    consolidation_number       = Column(String(50), unique=True, nullable=False, index=True)
    # ej. CON-20260001
    carrier                    = Column(String(50), nullable=True)
    # ej. Coordinadora USA, Servientrega Internacional, etc.
    tracking_international     = Column(String(100), nullable=True, index=True)
    agency_name                = Column(String(100), nullable=True)
    logistics_location_id      = Column(Integer, ForeignKey("logistics_locations.id", ondelete="SET NULL"), nullable=True, index=True)
    origin                     = Column(String(50), nullable=False, default="MIAMI")
    destination                = Column(String(50), nullable=False, default="BARRANQUILLA")
    total_weight_kg            = Column(Numeric(10, 2), nullable=False, default=0)
    total_volume_cbm           = Column(Numeric(10, 4), nullable=False, default=0)
    total_freight_usd          = Column(Numeric(10, 2), nullable=False, default=0)
    total_freight_cop          = Column(Numeric(14, 2), nullable=False, default=0)
    trm                        = Column(Numeric(10, 2), nullable=False, default=0)
    customs_declaration_number = Column(String(100), nullable=True)
    status                     = Column(String(50), nullable=False, default="ABIERTA")
    # ABIERTA | CONSOLIDADA | EN_VUELO | EN_DIAN | LIBERADA | RECIBIDA_DESTINO | CERRADA
    departure_date             = Column(DateTime(timezone=True), nullable=True)
    estimated_arrival_date     = Column(DateTime(timezone=True), nullable=True)
    actual_arrival_date        = Column(DateTime(timezone=True), nullable=True)
    dian_entered_at            = Column(DateTime(timezone=True), nullable=True)
    last_allocation_method     = Column(String(50), nullable=True)
    notes                      = Column(Text, nullable=True)
    created_at                 = Column(DateTime(timezone=True), default=_now)
    updated_at                 = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    location                   = relationship("LogisticsLocation", foreign_keys=[logistics_location_id])
    shipment_associations      = relationship("ConsolidationShipment", back_populates="consolidation", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("total_freight_usd >= 0", name="chk_consolidation_freight_usd"),
        CheckConstraint("total_freight_cop >= 0", name="chk_consolidation_freight_cop"),
        CheckConstraint("trm >= 0", name="chk_consolidation_trm"),
        CheckConstraint("total_weight_kg >= 0", name="chk_consolidation_weight_kg"),
        CheckConstraint("total_volume_cbm >= 0", name="chk_consolidation_volume_cbm"),
        CheckConstraint("status IN ('ABIERTA', 'CONSOLIDADA', 'EN_VUELO', 'EN_DIAN', 'LIBERADA', 'RECIBIDA_DESTINO', 'CERRADA')", name="chk_consolidation_status"),
    )


class Shipment(Base):
    """Paquete o envío individual con número de tracking del transportador."""
    __tablename__ = "shipments"

    id                      = Column(Integer, primary_key=True, index=True)
    shipment_number         = Column(String(50), unique=True, nullable=False, index=True)
    # ej. SHP-20260001 o PAQ-20260001
    pec_id                  = Column(Integer, ForeignKey("purchase_orders_full.id", ondelete="SET NULL"), nullable=True, index=True)
    carrier                 = Column(String(50), nullable=False)
    # UPS, FedEx, USPS, DHL, Amazon Logistics, etc.
    tracking_number         = Column(String(100), nullable=False, index=True)
    carrier_service         = Column(String(50), nullable=True)
    route_type              = Column(String(50), nullable=False, default="VIA_MIAMI")
    # VIA_MIAMI | DIRECT_TO_BARRANQUILLA
    origin                  = Column(String(100), nullable=False, default="PROVEEDOR")
    destination             = Column(String(100), nullable=False, default="MIAMI")
    status_fise             = Column(String(50), nullable=False, default="PREPARANDO_PROVEEDOR")
    # PREPARANDO_PROVEEDOR | ENVIADO_A_MIAMI | RECIBIDO_MIAMI | PENDIENTE_CONSOLIDACION |
    # CONSOLIDADO | EN_VUELO | EN_DIAN | LIBERADO_DIAN | RECIBIDO_BOGOTA | ENVIADO_BARRANQUILLA | RECIBIDO_BARRANQUILLA
    commercial_status       = Column(String(50), nullable=False, default="EN_TRANSITO")
    agency_id               = Column(String(50), nullable=True)
    logistics_location_id   = Column(Integer, ForeignKey("logistics_locations.id", ondelete="SET NULL"), nullable=True, index=True)
    estimated_delivery_date = Column(Date, nullable=True)
    actual_delivery_date    = Column(Date, nullable=True)
    weight_lb               = Column(Numeric(10, 2), nullable=True)
    weight_kg               = Column(Numeric(10, 2), nullable=True)
    volume_cbm              = Column(Numeric(10, 4), nullable=True)
    shipping_cost_usd       = Column(Numeric(10, 2), nullable=True)
    evidence_urls           = Column(Text, nullable=True)  # JSON lista de strings
    notes                   = Column(Text, nullable=True)
    created_at              = Column(DateTime(timezone=True), default=_now)
    updated_at              = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    purchase_order          = relationship("PurchaseOrderFull", foreign_keys=[pec_id])
    location                = relationship("LogisticsLocation", foreign_keys=[logistics_location_id])
    lines                   = relationship("ShipmentLine", back_populates="shipment", cascade="all, delete-orphan")
    events                  = relationship("ShipmentEvent", back_populates="shipment", cascade="all, delete-orphan", order_by="ShipmentEvent.timestamp")
    consolidation_associations = relationship("ConsolidationShipment", back_populates="shipment", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("weight_lb IS NULL OR weight_lb >= 0", name="chk_shipment_weight_lb"),
        CheckConstraint("weight_kg IS NULL OR weight_kg >= 0", name="chk_shipment_weight_kg"),
        CheckConstraint("shipping_cost_usd IS NULL OR shipping_cost_usd >= 0", name="chk_shipment_cost_usd"),
        CheckConstraint("route_type IN ('VIA_MIAMI', 'DIRECT_TO_BARRANQUILLA')", name="chk_shipment_route_type"),
        CheckConstraint("volume_cbm IS NULL OR volume_cbm >= 0", name="chk_shipment_volume_cbm"),
    )


class ShipmentLine(Base):
    """Línea de contenido de un paquete (asociada a una línea de compra)."""
    __tablename__ = "shipment_lines"

    id          = Column(Integer, primary_key=True, index=True)
    shipment_id = Column(Integer, ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)
    po_line_id  = Column(Integer, ForeignKey("purchase_order_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity    = Column(Numeric(10, 2), nullable=False, default=1)
    created_at  = Column(DateTime(timezone=True), default=_now)

    shipment    = relationship("Shipment", back_populates="lines")
    po_line     = relationship("PurchaseOrderLine", foreign_keys=[po_line_id])

    __table_args__ = (
        UniqueConstraint("shipment_id", "po_line_id", name="uq_shipment_line_po_line"),
        CheckConstraint("quantity > 0", name="chk_shipment_line_qty"),
    )


class ShipmentEvent(Base):
    """Hito inmutable de la cadena de suministro para un paquete."""
    __tablename__ = "shipment_events"

    id              = Column(Integer, primary_key=True, index=True)
    shipment_id     = Column(Integer, ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type      = Column(String(50), nullable=False)
    # PREPARANDO_PROVEEDOR, ENVIADO_A_MIAMI, RECIBIDO_MIAMI, PENDIENTE_CONSOLIDACION,
    # CONSOLIDADO, EN_VUELO, EN_DIAN, LIBERADO_DIAN, RECIBIDO_BOGOTA, ENVIADO_BARRANQUILLA, RECIBIDO_BARRANQUILLA
    location        = Column(String(150), nullable=True)
    user_name       = Column(String(150), nullable=True)
    notes           = Column(Text, nullable=True)
    evidence_url    = Column(String(500), nullable=True)
    idempotency_key = Column(String(100), nullable=True, index=True)
    timestamp       = Column(DateTime(timezone=True), default=_now, nullable=False, index=True)

    shipment        = relationship("Shipment", back_populates="events")

    __table_args__ = (
        Index("uq_shipment_event_idempotency", "shipment_id", "idempotency_key", unique=True, postgresql_where=text("idempotency_key IS NOT NULL")),
    )


class ConsolidationShipment(Base):
    """Asociación N:M entre una consolidación y sus paquetes, con prorrateo de flete."""
    __tablename__ = "consolidation_shipments"

    id                  = Column(Integer, primary_key=True, index=True)
    consolidation_id    = Column(Integer, ForeignKey("consolidations.id", ondelete="CASCADE"), nullable=False, index=True)
    shipment_id         = Column(Integer, ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)
    cost_allocation_usd = Column(Numeric(10, 2), nullable=False, default=0)
    cost_allocation_cop = Column(Numeric(14, 2), nullable=False, default=0)
    allocation_method   = Column(String(50), nullable=True)
    allocation_base     = Column(Numeric(14, 4), nullable=True)
    is_active           = Column(Boolean, nullable=False, default=True)
    created_at          = Column(DateTime(timezone=True), default=_now)

    consolidation       = relationship("Consolidation", back_populates="shipment_associations")
    shipment            = relationship("Shipment", back_populates="consolidation_associations")

    __table_args__ = (
        UniqueConstraint("consolidation_id", "shipment_id", name="uq_consolidation_shipment"),
        Index("uq_active_consolidation_shipment", "shipment_id", unique=True, postgresql_where=text("is_active = true")),
    )
