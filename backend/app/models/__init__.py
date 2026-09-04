from app.models.users import User, RolePermission
from app.models.customers import Customer
from app.models.catalog import Brand, Category, Product, ProductImage, Attribute, AttributeValue, ProductSKU, sku_attribute_values
from app.models.inventory import Warehouse, InventoryLevel, InventoryMovement, ShippingMethod, InventoryOperation, StockReplenishmentRule
from app.models.sales import Quotation, QuotationLine, SalesOrder, SalesOrderLine
from app.models.purchases import PurchaseOrder
from app.models.expenses import OperationalExpense
from app.models.crm import Alert

from app.models.erp_documents import Supplier, CustomerRequest, SalesQuotation, SaleOrder, PaymentPending, PurchaseOrderFull, GoodsReceipt, ActivityLog

# Fase 1B — modelos normalizados
from app.models.fase1b import (
    CustomerRequestLine,
    SalesQuotationLine,
    SaleOrderLineErp,
    PurchaseOrderLine,
    ProcurementAllocation,
    GoodsReceiptLine,
    GoodsReceiptLineAllocation,
    InventoryOwnerBalance,
    InventoryReservation,
    PaymentTransaction,
)

# Fase 2 — modelos de logística, compras, paquetes y tránsito
from app.models.fase2 import (
    LogisticsLocation,
    Consolidation,
    Shipment,
    ShipmentLine,
    ShipmentEvent,
    ConsolidationShipment,
)

# Fase 3 — modelos de recepciones, cuarentena e inventario
from app.models.fase3 import (
    InventoryQuarantine,
)
