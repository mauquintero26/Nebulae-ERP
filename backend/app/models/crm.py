from sqlalchemy import Column, Integer, String, Boolean, DateTime
from app.db.database import Base
import datetime

class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    alert_type = Column(String, nullable=False) # "CRM_FOLLOWUP", "INVENTORY_TRACKING"
    reference_id = Column(Integer, nullable=False) # ID of SalesOrder
    message = Column(String, nullable=False)
    due_date = Column(DateTime, default=datetime.datetime.utcnow)
    is_resolved = Column(Boolean, default=False)
