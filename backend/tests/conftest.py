
"""
Shared fixtures for Fase 1A tests.
Connects to the staging PostgreSQL database (read from .env).
NEVER runs against production.
"""
import os, pathlib, pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# Load DATABASE_URL from backend/.env
ENV_PATH = pathlib.Path(__file__).parent.parent / ".env"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        if line.startswith("DATABASE_URL"):
            os.environ.setdefault("DATABASE_URL", line.split("=", 1)[1].strip())
            break

DATABASE_URL = os.environ.get("DATABASE_URL", "")
assert DATABASE_URL, "DATABASE_URL not set — check backend/.env"

# Use a dedicated test schema to isolate from production data
TEST_SCHEMA = "test_fase1a"

@pytest.fixture(scope="session")
def pg_engine():
    engine = create_engine(DATABASE_URL, echo=False)
    # Create isolated schema
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {TEST_SCHEMA}"))
        conn.execute(text(f"SET search_path TO {TEST_SCHEMA}, public"))
        conn.commit()
    yield engine
    # Cleanup
    with engine.connect() as conn:
        conn.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))
        conn.commit()
    engine.dispose()

@pytest.fixture(scope="session")
def pg_session(pg_engine):
    Session = sessionmaker(bind=pg_engine)
    session = Session()
    yield session
    session.close()

@pytest.fixture(scope="session")
def app_client():
    """FastAPI TestClient with the real app wired to PG."""
    import sys
    sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
    from main import app
    from fastapi.testclient import TestClient as TC
    with TC(app) as client:
        yield client

@pytest.fixture(scope="session")
def admin_token(app_client):
    """Obtain a valid JWT for the Admin user from the staging DB."""
    import os
    resp = app_client.post("/api/v1/auth/login", data={
        "username": os.environ.get("TEST_ADMIN_USER", "admin@nebulae.com"),
        "password": os.environ.get("TEST_ADMIN_PASS", ""),
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]

@pytest.fixture(scope="session")
def vendedor_token(app_client):
    """Obtain a valid JWT for a Vendedor (legacy role) user."""
    import os
    resp = app_client.post("/api/v1/auth/login", data={
        "username": os.environ.get("TEST_VENDEDOR_USER", "vendedor@nebulae.com"),
        "password": os.environ.get("TEST_VENDEDOR_PASS", ""),
    })
    assert resp.status_code == 200, f"Vendedor login failed: {resp.text}"
    return resp.json()["access_token"]
