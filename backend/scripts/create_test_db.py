"""
Script de creación de erp_storefront_test.
Guarda en: backend/scripts/create_test_db.py
Solo conecta a /postgres para CREATE DATABASE. Nunca toca erpdb ni erp_test.
"""
import sys
from sqlalchemy import create_engine, text
from urllib.parse import urlparse, urlunparse

TARGET_DB = 'erp_storefront_test'
FORBIDDEN = {'erpdb', 'erp_test'}

# Read DATABASE_URL
db_url = None
with open('.env') as f:
    for line in f:
        line = line.strip()
        if line.startswith('DATABASE_URL='):
            db_url = line.split('=', 1)[1]
            break

if not db_url:
    print('ERROR: DATABASE_URL not found in .env')
    sys.exit(1)

# Safety: verify the target is not a production DB
if TARGET_DB in FORBIDDEN:
    print(f'ERROR: TARGET_DB {TARGET_DB} is forbidden')
    sys.exit(1)

# Connect to /postgres admin database
parsed = list(urlparse(db_url))
parsed[2] = '/postgres'  # switch to admin DB
admin_url = urlunparse(parsed)

engine = create_engine(admin_url, isolation_level='AUTOCOMMIT')
with engine.connect() as conn:
    result = conn.execute(text('SELECT 1 FROM pg_database WHERE datname = :db'), {'db': TARGET_DB})
    exists = result.scalar()
    if exists:
        print(f'DB {TARGET_DB} already exists — OK')
    else:
        conn.execute(text(f'CREATE DATABASE {TARGET_DB}'))
        print(f'DB {TARGET_DB} CREATED successfully')
engine.dispose()
print('DONE')
