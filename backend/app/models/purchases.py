from sqlalchemy import Column, Integer, String
from app.db.database import Base

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id = Column(Integer, primary_key=True, index=True)
    status = Column(String, nullable=False)
