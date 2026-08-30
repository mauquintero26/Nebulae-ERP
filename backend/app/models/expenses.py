from sqlalchemy import Column, Integer, String, Numeric, DateTime, Boolean
from app.db.database import Base
import datetime

class OperationalExpense(Base):
    __tablename__ = "operational_expenses"
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False)
    description = Column(String, nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)
    incurred_date = Column(DateTime, default=datetime.datetime.utcnow)
    is_recurring = Column(Boolean, default=False)
