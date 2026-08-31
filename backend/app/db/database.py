from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./nebulae_local.db"
)

if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        # ── Connection pool tuning for remote PostgreSQL ────────────────────
        pool_size=10,          # Persistent connections kept alive (no TCP handshake per request)
        max_overflow=20,       # Extra connections allowed under heavy load
        pool_timeout=30,       # Max wait for a connection from pool
        pool_recycle=1800,     # Recycle connections after 30min (avoids stale/dead conns)
        pool_pre_ping=True,    # Validate connection before use (handles network drops)
        # ── Query execution tuning ─────────────────────────────────────────
        connect_args={
            "connect_timeout": 10,       # TCP connect timeout
            "options": "-c statement_timeout=15000",  # Kill queries > 15s
        },
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
