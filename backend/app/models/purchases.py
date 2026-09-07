from sqlalchemy import Column, Integer, String, ForeignKey
from app.db.database import Base

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id = Column(Integer, primary_key=True, index=True)
    canonical_purchase_order_id = Column(Integer, ForeignKey("purchase_orders_full.id"), nullable=True)
    status = Column(String, nullable=False)
