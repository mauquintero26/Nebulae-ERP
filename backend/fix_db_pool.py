import os

path = 'app/db/database.py'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

if "pool_pre_ping=True" not in text:
    text = text.replace("engine = create_engine(SQLALCHEMY_DATABASE_URL)", "engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)")
    
with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Added pool_pre_ping")
