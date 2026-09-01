import os

path = 'C:/Users/jmqui/OneDrive/Documents/Nebulae/ERP-CRM/backend/app/schemas/crm.py'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

new_schemas = """
class CustomerBase(BaseModel):
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerResponse(CustomerBase):
    id: int
    model_config = {"from_attributes": True}
"""

if "class CustomerBase" not in text:
    with open(path, 'a', encoding='utf-8') as f:
        f.write(new_schemas)

print("Updated crm schemas")
