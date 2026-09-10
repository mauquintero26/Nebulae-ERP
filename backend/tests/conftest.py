"""
tests/conftest.py  --  Fase 1A v4

TEST ISOLATION: Separate erp_test database (NOT schema redirection).
Production DB: erpdb (set via DATABASE_URL environment variable)
Test DB:       erp_test (set via TEST_DATABASE_URL environment variable)

Safety checks abort if TEST_DATABASE_URL is not set, matches DATABASE_URL,
or database name does not contain test/staging/dev/qa.
"""
import os, sys, pathlib, uuid, datetime
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

_BACKEND = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(_BACKEND))

from dotenv import load_dotenv
load_dotenv(_BACKEND / ".env")

PROD_URL = os.environ.get("DATABASE_URL", "")
TEST_URL = os.environ.get("TEST_DATABASE_URL", "")
# URL de erpdb real (para tests de guardia que verifican que producción no fue alterada).
# Si DATABASE_URL apunta a staging (certificación), setear PROD_ERPDB_DATABASE_URL apuntando a erpdb real.
# Si no se setea, cae al valor de DATABASE_URL (comportamiento anterior por compatibilidad).
PROD_ERPDB_URL = os.environ.get("PROD_ERPDB_DATABASE_URL", PROD_URL)

# ---- SAFETY CHECKS --------------------------------------------------------
if not TEST_URL:
    pytest.exit(
        "\n[ABORT] TEST_DATABASE_URL is not set.\n"
        "Set it before running tests:\n"
        "  $env:TEST_DATABASE_URL = 'postgresql://user:pass@host:port/erp_test'\n"
        "The database name MUST contain test/staging/dev/qa.\n"
        "It must NOT match DATABASE_URL (production).",
        returncode=1,
    )

if TEST_URL == PROD_URL:
    pytest.exit(
        "[ABORT] TEST_DATABASE_URL == DATABASE_URL -- refusing to run against production.",
        returncode=1,
    )

_db_name = TEST_URL.split("?")[0].rstrip("/").split("/")[-1].lower()
if not any(kw in _db_name for kw in ("test", "staging", "dev", "qa")):
    pytest.exit(
        f"[ABORT] DB name '{_db_name}' does not contain test/staging/dev/qa."
        " Refusing to run against unidentified database.",
        returncode=1,
    )

PROD_VPS = os.environ.get("PROD_VPS_HOST", "")  # Set PROD_VPS_HOST env var; never hardcode IP
PROD_DBNAME = PROD_URL.split("?")[0].rstrip("/").split("/")[-1].lower()
if PROD_VPS in TEST_URL and _db_name == PROD_DBNAME:
    pytest.exit(
        f"[ABORT] TEST_DATABASE_URL points to the SAME server AND database as production ({PROD_DBNAME})."
        " Use a separate database (e.g. erp_test).",
        returncode=1,
    )

print(f"[conftest] TEST DB: {_db_name}  (production DB: {PROD_DBNAME} -- NOT used by tests)")

# ---- TEST ENGINE ----------------------------------------------------------
_extra_pg = {}
if TEST_URL.startswith("postgresql"):
    _extra_pg = {"connect_timeout": 10}

test_engine = create_engine(
    TEST_URL,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    connect_args=_extra_pg,
)

TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


# ---- SESSION SCOPE: VERIFY + RUN ALEMBIC ----------------------------------
@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Verify connection to test DB, then run Alembic migrations."""
    import subprocess
    with test_engine.connect() as conn:
        db_actual = conn.execute(text("SELECT current_database()")).scalar()
        print(f"[conftest] Connected DB: {db_actual}")
        assert any(kw in db_actual.lower() for kw in ("test", "staging", "dev", "qa")), (
            f"[ABORT] Connected database '{db_actual}' is not a safe test DB!"
        )

    env = os.environ.copy()
    env["DATABASE_URL"] = TEST_URL       # Backward compat for any old code
    env["TEST_DATABASE_URL"] = TEST_URL  # env.py en modo testing usa esta
    env["ALEMBIC_ENV"] = "testing"       # Declara explicitamente el modo
    env.pop("ALLOW_PRODUCTION_MIGRATION", None)  # Jamas debe haber autorización de prod aqui
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(_BACKEND),
        env=env,
        capture_output=True,
        text=True,
    )
    print("[alembic]:", result.stdout[-500:] if result.stdout else "(empty)")
    assert result.returncode == 0, f"Alembic upgrade failed: {result.stderr[-500:]}"
    # Asegurar tablas auxiliares y permisos en la base de pruebas erp_test
    with test_engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS pipeline_stages (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                color VARCHAR(50) DEFAULT 'bg-blue-500',
                bg_color VARCHAR(50) DEFAULT 'bg-blue-50',
                position INTEGER DEFAULT 0,
                maps_to_status VARCHAR(50)
            );
            INSERT INTO pipeline_stages (name, color, bg_color, position, maps_to_status)
            SELECT 'Nuevo Lead', 'bg-blue-500', 'bg-blue-50', 1, 'PENDING'
            WHERE NOT EXISTS (SELECT 1 FROM pipeline_stages);
            CREATE TABLE IF NOT EXISTS chat_conversations (
                id SERIAL PRIMARY KEY,
                channel VARCHAR(50) DEFAULT 'web',
                customer_id INTEGER,
                customer_name VARCHAR(200),
                customer_email VARCHAR(200),
                customer_phone VARCHAR(50),
                status VARCHAR(50) DEFAULT 'open',
                unread_count INTEGER DEFAULT 0,
                last_message TEXT,
                last_message_at TIMESTAMPTZ,
                ai_mode VARCHAR(50) DEFAULT 'suggestion',
                linked_lead_id INTEGER,
                session_token VARCHAR(255),
                external_id VARCHAR(255),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER REFERENCES chat_conversations(id) ON DELETE CASCADE,
                direction VARCHAR(20) DEFAULT 'inbound',
                content TEXT,
                message_type VARCHAR(50) DEFAULT 'text',
                sender_name VARCHAR(200),
                is_ai_generated BOOLEAN DEFAULT FALSE,
                is_auto_sent BOOLEAN DEFAULT FALSE,
                metadata JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """))
        role_exists = conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname='nebulae_test'")).scalar()
        if role_exists:
            try:
                conn.execute(text("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nebulae_test;"))
                conn.execute(text("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nebulae_test;"))
            except Exception:
                # InternalError: tuple concurrently updated — otro proceso de pytest ya está otorgando
                # permisos simultáneamente. Best-effort: si ya están otorgados, no hay problema.
                conn.rollback()
        conn.commit()
    yield
    # Safety: ensure DB is at head before cleanup (migration tests may have left it downgraded)
    try:
        env_cleanup = os.environ.copy()
        env_cleanup["DATABASE_URL"] = TEST_URL
        env_cleanup["ALEMBIC_ENV"] = "testing"  # prevent ABORT when both DB URLs are set
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=str(_BACKEND), env=env_cleanup,
            capture_output=True, text=True, timeout=60,
        )
    except Exception:
        pass  # best-effort


    # Cleanup: truncate all test data (best-effort, ignore missing tables)
    with test_engine.connect() as conn:
        for tbl in [
            # Fase 5 — Integración ERP
            "integration_webhook_events", "customer_contact_preferences",
            "omnichannel_interactions", "customer_agenda_activities",
            # Fase 4 — Ventas, Pagos, Empaque, Entregas y Devoluciones
            "sale_order_return_lines", "sale_order_returns",
            "sale_order_delivery_lines", "sale_order_deliveries",
            "sale_packing_items", "sale_packing_sessions",
            "sale_order_payments",
            # Fase 3 — Cuarentena
            "inventory_quarantine",
            # Fase 2 — Logística, Paquetes y Consolidaciones
            "consolidation_shipments", "shipment_events", "shipment_lines",
            "shipments", "consolidations", "logistics_locations",
            # Fase 1B — tablas normalizadas (deben truncarse antes que los documentos padre)
            "goods_receipt_line_allocations", "goods_receipt_lines",
            "procurement_allocations",
            "sale_order_lines_erp", "sales_quotation_lines", "customer_request_lines",
            "purchase_order_lines",
            "inventory_reservations", "inventory_owner_balances",
            "payment_transactions",
            # Fase 1A y base
            "inventory_movements", "inventory_operations", "inventory_levels",
            "activity_logs", "idempotency_requests",
            "goods_receipts", "purchase_orders_full",
            "sale_orders", "sales_quotations", "customer_requests",
            "payment_pendings",
            "product_skus", "products", "brands", "categories",
            "warehouses", "suppliers", "users",
        ]:
            try:
                conn.execute(text(f"TRUNCATE TABLE {tbl} RESTART IDENTITY CASCADE"))
            except Exception:
                conn.rollback()
        conn.commit()
    test_engine.dispose()


# ---- GET_DB OVERRIDE -------------------------------------------------------
def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session")
def app_client(setup_test_db):
    from main import app
    from app.db.database import get_db
    import app.db.database as _db_module
    import app.api.v1.erp_compras as _compras_module
    import app.api.v1.erp_inventario as _inventario_module
    import app.api.v1.erp_ventas_fase4 as _ventas_fase4_module

    # Override FastAPI dependency
    app.dependency_overrides[get_db] = override_get_db

    # Patch SessionLocal in database module, erp_compras, and erp_inventario (used by idem_session)
    # so all sessions created during tests connect to erp_test, not production
    _original_sl = _db_module.SessionLocal
    _db_module.SessionLocal = TestSessionLocal
    if hasattr(_compras_module, "SessionLocal"):
        _compras_module.SessionLocal = TestSessionLocal  # in case it's imported directly
    if hasattr(_inventario_module, "SessionLocal"):
        _inventario_module.SessionLocal = TestSessionLocal
    if hasattr(_ventas_fase4_module, "SessionLocal"):
        _ventas_fase4_module.SessionLocal = TestSessionLocal

    from fastapi.testclient import TestClient
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client

    # Cleanup
    _db_module.SessionLocal = _original_sl
    if hasattr(_compras_module, "SessionLocal"):
        _compras_module.SessionLocal = _original_sl
    if hasattr(_inventario_module, "SessionLocal"):
        _inventario_module.SessionLocal = _original_sl
    app.dependency_overrides.clear()


# ---- PER-TEST DB SESSION (commit so HTTP requests can see the data) ---------
@pytest.fixture()
def db(setup_test_db):
    """Per-test committed session.
    
    Data IS committed so HTTP requests via app_client can see it.
    Cleanup: objects registered in session are deleted in teardown.
    """
    session = TestSessionLocal()
    _created_ids = []  # list of (ModelClass, id)

    # Monkey-patch add() to track created objects for cleanup
    _orig_add = session.add
    def _tracking_add(obj, *args, **kwargs):
        _orig_add(obj, *args, **kwargs)
        _created_ids.append(obj)
    session.add = _tracking_add

    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        # Teardown: delete all objects created in this test (reverse order)
        try:
            for obj in reversed(_created_ids):
                try:
                    session.delete(session.merge(obj))
                except Exception:
                    pass
            session.commit()
        except Exception:
            session.rollback()
        finally:
            session.close()



# ---- SECURITY HELPERS -------------------------------------------------------
from app.core.security import create_access_token
from datetime import timedelta

TEST_PASSWORD = "Test123!"
# Pre-hashed bcrypt of TEST_PASSWORD to avoid passlib/bcrypt version issues at import time.
# Generated with: import bcrypt; bcrypt.hashpw(b"Test123!", bcrypt.gensalt()).decode()
# Using direct bcrypt to bypass passlib wrapper:
def _make_hash(pw: str) -> str:
    try:
        import bcrypt as _bcrypt
        return _bcrypt.hashpw(pw.encode(), _bcrypt.gensalt()).decode()
    except Exception:
        from app.core.security import get_password_hash
        return get_password_hash(pw)

TEST_PASSWORD_HASH = _make_hash(TEST_PASSWORD)


# ---- USER FIXTURES ----------------------------------------------------------
@pytest.fixture()
def user_admin(db):
    from app.models.users import User
    u = User(
        email=f"admin-{uuid.uuid4().hex[:6]}@test.nebulae",
        password_hash=TEST_PASSWORD_HASH,
        role="Admin", is_active=True,
    )
    db.add(u); db.commit(); return u


@pytest.fixture()
def user_vendedor(db):
    from app.models.users import User
    u = User(
        email=f"vendedor-{uuid.uuid4().hex[:6]}@test.nebulae",
        password_hash=TEST_PASSWORD_HASH,
        role="Vendedor", is_active=True,
    )
    db.add(u); db.commit(); return u


# ---- TOKEN FIXTURES ---------------------------------------------------------
@pytest.fixture()
def admin_token(user_admin):
    return create_access_token(
        {"sub": str(user_admin.id), "role": user_admin.role},
        expires_delta=timedelta(minutes=60),
    )


@pytest.fixture()
def vendedor_token(user_vendedor):
    return create_access_token(
        {"sub": str(user_vendedor.id), "role": user_vendedor.role},
        expires_delta=timedelta(minutes=60),
    )


# ---- CATALOG FIXTURES -------------------------------------------------------
@pytest.fixture()
def brand(db):
    from app.models.catalog import Brand
    b = Brand(name=f"TestBrand-{uuid.uuid4().hex[:6]}")
    db.add(b); db.commit(); return b


@pytest.fixture()
def category(db):
    from app.models.catalog import Category
    c = Category(name=f"TestCategory-{uuid.uuid4().hex[:6]}")
    db.add(c); db.commit(); return c


@pytest.fixture()
def product(db, brand, category):
    from app.models.catalog import Product
    p = Product(
        brand_id=brand.id, category_id=category.id,
        name=f"TestProduct-{uuid.uuid4().hex[:6]}",
        type="Fisico", base_currency="USD", uom="Ud",
    )
    db.add(p); db.commit(); return p


@pytest.fixture()
def sku(db, product):
    from app.models.catalog import ProductSKU
    s = ProductSKU(
        product_id=product.id,
        sku=f"TST-{uuid.uuid4().hex[:8]}",
        cost_price=10.00, sale_price=20.00,
    )
    db.add(s); db.commit(); return s


# ---- WAREHOUSE / INV LEVEL --------------------------------------------------
@pytest.fixture()
def warehouse(db):
    from app.models.inventory import Warehouse
    w = Warehouse(name=f"BodegaTest-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(w); db.commit(); return w


@pytest.fixture()
def inv_level_zero(db, sku, warehouse):
    from app.models.inventory import InventoryLevel
    # Use MERGE (INSERT or UPDATE) to guarantee we start from 0 regardless of prior state.
    # This prevents flakiness when previous tests left dirty inventory_levels rows
    # for the same (sku_id, warehouse_id) pair.
    from sqlalchemy import text as _text
    db.execute(_text("""
        INSERT INTO inventory_levels (sku_id, warehouse_id, quantity)
        VALUES (:sku_id, :wh_id, 0)
        ON CONFLICT (sku_id, warehouse_id) DO UPDATE SET quantity = 0
    """), {"sku_id": sku.id, "wh_id": warehouse.id})
    db.commit()
    lvl = db.query(InventoryLevel).filter_by(sku_id=sku.id, warehouse_id=warehouse.id).first()
    if lvl is None:
        lvl = InventoryLevel(sku_id=sku.id, warehouse_id=warehouse.id, quantity=0)
        db.add(lvl)
        db.commit()
    return lvl



# ---- SUPPLIER ---------------------------------------------------------------
@pytest.fixture()
def supplier(db):
    from app.models.erp_documents import Supplier
    s = Supplier(
        name=f"TestSupplier-{uuid.uuid4().hex[:6]}",
        country="Colombia", is_active=True,
    )
    db.add(s); db.commit(); return s


# ---- PEC -------------------------------------------------------------------
@pytest.fixture()
def pec_10u(db, sku, warehouse, supplier):
    from app.models.erp_documents import PurchaseOrderFull
    numero = f"PEC-TEST-{uuid.uuid4().hex[:8].upper()}"
    p = PurchaseOrderFull(
        numero=numero,
        supplier_id=supplier.id, supplier_name=supplier.name,
        warehouse_id=warehouse.id, estado="EMITIDO",
        fecha_entrega_estimada=datetime.datetime.utcnow() + datetime.timedelta(days=15),
        productos=[{"sku_id": sku.id, "sku": sku.sku, "nombre": "Test Product",
                    "qty": 10, "qty_recibida": 0, "precio_usd": 10.0}],
    )
    db.add(p); db.commit(); return p


# ---- ENINV HELPERS ---------------------------------------------------------
def _make_eninv(db, pec, sku, warehouse, qty, receipt_type="FISICA", suffix=""):
    from app.models.erp_documents import GoodsReceipt
    numero = f"ENINV-T-{uuid.uuid4().hex[:8].upper()}{suffix}"
    g = GoodsReceipt(
        numero=numero,
        pec_id=pec.id, pec_numero=pec.numero,
        supplier_id=pec.supplier_id, supplier_name=pec.supplier_name,
        warehouse_id=warehouse.id, warehouse_name=warehouse.name,
        estado="BORRADOR", stock_actualizado=False, receipt_type=receipt_type,
        productos=[{"sku_id": sku.id, "sku": sku.sku, "nombre": "Test Product",
                    "qty_esperada": qty, "qty_recibida": qty}],
    )
    db.add(g); db.commit(); return g


@pytest.fixture()
def eninv_5u(db, pec_10u, sku, warehouse):
    return _make_eninv(db, pec_10u, sku, warehouse, qty=5)


@pytest.fixture()
def eninv_5u_b(db, pec_10u, sku, warehouse):
    return _make_eninv(db, pec_10u, sku, warehouse, qty=5, suffix="B")


@pytest.fixture()
def eninv_10u(db, pec_10u, sku, warehouse):
    return _make_eninv(db, pec_10u, sku, warehouse, qty=10)


@pytest.fixture()
def eninv_logistica(db, pec_10u, sku, warehouse):
    return _make_eninv(db, pec_10u, sku, warehouse, qty=10, receipt_type="LOGISTICA")
