import os

path = 'app/schemas/crm.py'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("city: Optional[str] = None", "city: Optional[str] = None\n    document: Optional[str] = None\n    address: Optional[str] = None")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

path2 = 'app/api/v1/crm.py'
with open(path2, 'r', encoding='utf-8') as f:
    text2 = f.read()

text2 = text2.replace("city=customer.city", "city=customer.city,\n        document=customer.document,\n        address=customer.address")

with open(path2, 'w', encoding='utf-8') as f:
    f.write(text2)

print("Updated backend schemas and api for document/address")
