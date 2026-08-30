from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.expenses import OperationalExpense
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.catalog import ProductSKU
from app.schemas import finance as schemas
from decimal import Decimal
import datetime

router = APIRouter()

@router.post("/expenses", status_code=status.HTTP_201_CREATED)
def create_expense(expense: schemas.ExpenseCreate, db: Session = Depends(get_db)):
    expense_data = expense.model_dump()
    if not expense_data.get("incurred_date"):
        expense_data["incurred_date"] = datetime.datetime.utcnow()
        
    db_exp = OperationalExpense(**expense_data)
    db.add(db_exp)
    db.commit()
    db.refresh(db_exp)
    return {"status": "success", "data": schemas.ExpenseResponse.model_validate(db_exp).model_dump()}

@router.get("/expenses")
def list_expenses(db: Session = Depends(get_db)):
    expenses = db.query(OperationalExpense).all()
    return {"status": "success", "data": [schemas.ExpenseResponse.model_validate(e).model_dump() for e in expenses]}

@router.get("/dashboard", response_model=dict)
def get_dashboard(db: Session = Depends(get_db)):
    lines = db.query(SalesOrderLine).all()
    
    gross_revenue = Decimal("0.0")
    cogs = Decimal("0.0")
    
    for line in lines:
        gross_revenue += (line.unit_price * line.quantity)
        sku = db.query(ProductSKU).filter(ProductSKU.id == line.sku_id).first()
        if sku and sku.cost_price:
            cogs += (sku.cost_price * line.quantity)
            
    gross_profit = gross_revenue - cogs
    
    expenses = db.query(OperationalExpense).all()
    opex = sum((exp.amount for exp in expenses), Decimal("0.0"))
    
    net_profit = gross_profit - opex
    
    dashboard = schemas.DashboardResponse(
        gross_revenue=gross_revenue,
        cogs=cogs,
        gross_profit=gross_profit,
        opex=opex,
        net_profit=net_profit
    )
    
    return {"status": "success", "data": dashboard.model_dump(mode="json")}
