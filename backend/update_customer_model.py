import os

path = 'app/models/customers.py'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

if "document =" not in text:
    text = text.replace("city = Column(String)", "city = Column(String)\n    document = Column(String)\n    address = Column(String)")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated customer model")
