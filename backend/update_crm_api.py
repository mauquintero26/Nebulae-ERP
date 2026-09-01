import os

path = 'C:/Users/jmqui/OneDrive/Documents/Nebulae/ERP-CRM/backend/app/api/v1/crm.py'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

new_endpoints = """
from app.schemas.crm import CustomerCreate, CustomerResponse

@router.post("/customers", response_model=dict)
def create_customer(customer: CustomerCreate, db: Session = Depends(get_db)):
    db_customer = Customer(
        first_name=customer.first_name,
        last_name=customer.last_name,
        email=customer.email,
        phone=customer.phone,
        city=customer.city
    )
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return {"status": "success", "data": CustomerResponse.model_validate(db_customer).model_dump()}

@router.get("/customers", response_model=dict)
def get_customers(db: Session = Depends(get_db)):
    customers = db.query(Customer).all()
    return {"status": "success", "data": [CustomerResponse.model_validate(c).model_dump() for c in customers]}
"""

if "@router.post(\"/customers\"" not in text:
    with open(path, 'a', encoding='utf-8') as f:
        f.write(new_endpoints)

print("Updated crm api endpoints")
