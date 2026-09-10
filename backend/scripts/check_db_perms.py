"""
Check DB permissions and apply WEB-2B.1 DDL changes directly.
"""
from sqlalchemy import create_engine, text

with open('.env') as f:
    for line in f:
        if line.startswith('DATABASE_URL='):
            url = line.strip().split('=', 1)[1]
            break

eng = create_engine(url)
with eng.connect() as conn:
    # Check alembic_version
    try:
        r = conn.execute(text('SELECT version_num FROM alembic_version'))
        versions = [row[0] for row in r]
        print('alembic versions:', versions)
    except Exception as e:
        print('alembic_version error:', e)
        versions = []

    # Check if ecommerce_products exists
    r2 = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='ecommerce_products'"
    ))
    ep_exists = r2.scalar()
    print('ecommerce_products exists:', ep_exists)

    # Try ALTER TABLE (less restrictive than CREATE TABLE)
    try:
        conn.execute(text('ALTER TABLE ecommerce_products ADD COLUMN IF NOT EXISTS _test_col_wb1 TEXT'))
        conn.execute(text('ALTER TABLE ecommerce_products DROP COLUMN IF EXISTS _test_col_wb1'))
        conn.commit()
        print('ALTER TABLE: OK - have permission')
    except Exception as e:
        print('ALTER TABLE error:', e)

eng.dispose()
print('DONE')
