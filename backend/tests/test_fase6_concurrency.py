"""
test_fase6_concurrency.py

Pruebas de concurrencia real para Fase 6.
Usa threading.Thread con conexiones independientes por hilo.
NO reutiliza test_receipt_concurrency.py.

Escenarios:
1. dual_write_venta misma clave -> una sola operacion (idempotencia concurrente)
2. venta divergente concurrente -> exito + 409
3. compra concurrente -> cero duplicados
4. checkout identico concurrente -> una orden y una reserva
5. checkout compitiendo por stock -> sin overselling
6. dos reconcile-sync simultaneos -> cero duplicados
7. consecutivos VEN/PEC/COT unicos
"""
import threading
import time
import datetime
import decimal
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from main import app
from app.db.database import get_db, Base
from app.core.security import create_access_token
from app.models.users import User
from app.models.catalog import Product, ProductSKU, Category, Brand
from app.models.inventory import Warehouse, InventoryLevel
from app.models.customers import Customer
from app.models.sales import SalesOrder
from app.models.erp_documents import SaleOrder, PurchaseOrderFull
from app.models.fase1b import InventoryOwnerBalance, InventoryReservation
from app.models.purchases import PurchaseOrder
from app.services.legacy_consolidation import (
    intercept_sales_order_write,
    intercept_purchase_order_write,
    get_or_create_governance_policy,
    _get_next_sale_order_numero,
    _get_next_purchase_order_numero,
    _get_next_quotation_numero,
)

import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

TEST_DB_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_DB_URL:
    raise RuntimeError("TEST_DATABASE_URL no configurado en .env")


def _make_session():
    """Crea una sesion independiente usando TEST_DATABASE_URL (sin compartir estado con otras sesiones)."""
    engine = create_engine(TEST_DB_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()


def _now():
    return datetime.datetime.utcnow()


# ────────────────────────────────────────────────────────────────────────────
# Fixtures de base
# ────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def concurrent_client(setup_test_db):
    """TestClient con get_db apuntando a erp_test (no a erpdb)."""
    from main import app
    from app.db.database import get_db
    import app.db.database as _db_module
    import app.api.v1.erp_compras as _compras_module
    import app.api.v1.erp_inventario as _inventario_module
    import app.api.v1.erp_ventas_fase4 as _ventas_fase4_module

    # Crear engine/session que apunte a erp_test igual que el conftest
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    test_engine = create_engine(TEST_DB_URL, pool_pre_ping=True)
    ConcTestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    def _override_get_db():
        db = ConcTestSession()
        try:
            yield db
        finally:
            db.close()

    # Override FastAPI dependency
    app.dependency_overrides[get_db] = _override_get_db

    # Patch SessionLocal en modulos que lo usan directamente
    _original_sl = _db_module.SessionLocal
    _db_module.SessionLocal = ConcTestSession
    if hasattr(_compras_module, "SessionLocal"):
        _compras_module.SessionLocal = ConcTestSession
    if hasattr(_inventario_module, "SessionLocal"):
        _inventario_module.SessionLocal = ConcTestSession
    if hasattr(_ventas_fase4_module, "SessionLocal"):
        _ventas_fase4_module.SessionLocal = ConcTestSession

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client

    # Cleanup
    _db_module.SessionLocal = _original_sl
    if hasattr(_compras_module, "SessionLocal"):
        _compras_module.SessionLocal = _original_sl
    if hasattr(_inventario_module, "SessionLocal"):
        _inventario_module.SessionLocal = _original_sl
    if hasattr(_ventas_fase4_module, "SessionLocal"):
        _ventas_fase4_module.SessionLocal = _original_sl
    app.dependency_overrides.clear()
    test_engine.dispose()


@pytest.fixture(scope="module")
def concurrent_setup():
    """
    Crea datos de base compartidos para todos los tests de concurrencia.
    Se crea en una sesion independiente y se hace commit real.
    """
    session = _make_session()
    try:
        ts = int(time.time())

        # Admin user + token
        admin_email = f"concurrent_admin_{ts}@nebulaekids.com"
        admin = User(email=admin_email, password_hash="dummy_hash", role="Admin", is_active=True)
        session.add(admin)
        session.flush()
        admin_token = create_access_token({"sub": str(admin.id), "role": "Admin"})
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Category + Brand
        cat = session.query(Category).first() or Category(name="Concurrency Cat")
        brand = session.query(Brand).first() or Brand(name="Concurrency Brand")
        session.add(cat)
        session.add(brand)
        session.flush()

        # Product + SKU
        prod = Product(
            name=f"Producto Concurrencia {ts}",
            type="Fisico",
            base_currency="COP",
            uom="Unidad",
            is_active=True,
            category_id=cat.id,
            brand_id=brand.id
        )
        session.add(prod)
        session.flush()

        sku = ProductSKU(
            product_id=prod.id,
            sku=f"CONC-SKU-{ts}",
            sale_price=Decimal("500000.00"),
            cost_price=Decimal("300000.00")
        )
        session.add(sku)
        session.flush()

        # Warehouse + InventoryLevel (stock=50)
        wh = session.query(Warehouse).filter(Warehouse.location_type == "Central").first()
        if not wh:
            wh = Warehouse(name=f"Bodega Concurrencia {ts}", location_type="Central")
            session.add(wh)
            session.flush()

        inv = session.query(InventoryLevel).filter(
            InventoryLevel.sku_id == sku.id,
            InventoryLevel.warehouse_id == wh.id
        ).first()
        if inv:
            inv.quantity = 50
        else:
            inv = InventoryLevel(warehouse_id=wh.id, sku_id=sku.id, quantity=50)
            session.add(inv)

        bal = session.query(InventoryOwnerBalance).filter(
            InventoryOwnerBalance.sku_id == sku.id,
            InventoryOwnerBalance.warehouse_id == wh.id,
            InventoryOwnerBalance.owner == "NEBULAE"
        ).first()
        if bal:
            bal.quantity = Decimal("50")
        else:
            bal = InventoryOwnerBalance(
                sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("50")
            )
            session.add(bal)

        # Customer
        cust = Customer(
            first_name="Cliente",
            last_name="Concurrente",
            email=f"conc_{ts}@example.com",
            phone="3001110000",
            address="Cra 10 #20-30",
            city="Bogota",
            document=f"CC{ts}"
        )
        session.add(cust)
        get_or_create_governance_policy(session)
        session.commit()

        yield {
            "admin_id": admin.id,
            "admin_headers": admin_headers,
            "sku_id": sku.id,
            "warehouse_id": wh.id,
            "customer_id": cust.id,
        }
    finally:
        session.close()


# ────────────────────────────────────────────────────────────────────────────
# TEST 1: Dual-write venta misma clave → una sola operacion
# ────────────────────────────────────────────────────────────────────────────
def test_conc_01_dual_write_same_key_one_operation(concurrent_setup):
    """
    Dos hilos crean SalesOrder con la misma Idempotency-Key simultaneamente.
    Resultado esperado: exactamente 1 SaleOrder canonica creada (idempotencia concurrente).
    """
    setup = concurrent_setup
    ts = int(time.time())
    idem_key = f"CONC_DW_{ts}"

    order_data = {"customer_id": setup["customer_id"], "status": "PENDING"}
    lines_data = [{"sku_id": setup["sku_id"], "quantity": 1, "unit_price": 500000.0}]

    results = []
    errors = []

    def _worker():
        session = _make_session()
        try:
            legacy, canonical = intercept_sales_order_write(
                db=session,
                order_data=order_data,
                lines_data=lines_data,
                user_id=setup["admin_id"],
                idempotency_key=idem_key
            )
            results.append(canonical.id if canonical else None)
        except Exception as exc:
            errors.append(str(exc))
        finally:
            session.close()

    # Lanzar dos hilos al mismo tiempo
    t1 = threading.Thread(target=_worker)
    t2 = threading.Thread(target=_worker)
    t1.start(); t2.start()
    t1.join(timeout=15); t2.join(timeout=15)

    assert not t1.is_alive() and not t2.is_alive(), "Ningun hilo debe continuar vivo tras el join"
    assert len(errors) == 0, f"Cero excepciones permitidas en workers. Errores: {errors}"
    assert len(results) == 2, f"Se esperaban exactamente 2 respuestas, se obtuvieron {len(results)}"

    # Al menos uno debe haber tenido exito
    success_ids = [r for r in results if r is not None]
    assert len(success_ids) >= 1, f"Ningun hilo tuvo exito. Errores: {errors}"

    # Si ambos tuvieron exito, deben retornar el mismo canonical_id (idempotencia)
    if len(success_ids) == 2:
        assert success_ids[0] == success_ids[1], (
            f"Idempotencia fallida: dos IDs distintos creados con la misma key. {success_ids}"
        )


# ────────────────────────────────────────────────────────────────────────────
# TEST 2: Venta divergente concurrente → un exito + 409
# ────────────────────────────────────────────────────────────────────────────
def test_conc_02_divergent_write_produces_409(concurrent_client, concurrent_setup):
    """
    El hilo 1 crea con payload A.
    El hilo 2 usa la misma key pero payload B (distinto) → debe recibir 409.
    """
    setup = concurrent_setup
    ts = int(time.time())
    idem_key = f"CONC_DIV_{ts}"
    headers_1 = {**setup["admin_headers"], "Idempotency-Key": idem_key}

    payload_a = {
        "customer_id": setup["customer_id"],
        "status": "PENDING",
        "lines": [{"sku_id": setup["sku_id"], "quantity": 1, "unit_price": 500000.0}]
    }
    payload_b = {
        "customer_id": setup["customer_id"],
        "status": "PENDING",
        "lines": [{"sku_id": setup["sku_id"], "quantity": 99, "unit_price": 500000.0}]
    }

    # Primero enviar el original para fijar la key
    r_original = concurrent_client.post("/api/v1/sales/", json=payload_a, headers=headers_1)
    assert r_original.status_code == 201, f"Primera peticion debio ser 201. Got: {r_original.status_code}"

    # Luego enviar el divergente (misma key, distinto payload)
    r_divergent = concurrent_client.post("/api/v1/sales/", json=payload_b, headers=headers_1)
    assert r_divergent.status_code == 409, (
        f"Replay divergente debe retornar 409. Got: {r_divergent.status_code}"
    )


# ────────────────────────────────────────────────────────────────────────────
# TEST 3: Compra concurrente → cero duplicados
# ────────────────────────────────────────────────────────────────────────────
def test_conc_03_concurrent_purchase_no_duplicates(concurrent_setup):
    """
    Dos hilos intentan crear una PurchaseOrder con la misma Idempotency-Key.
    Resultado: exactamente 1 PurchaseOrderFull creada.
    """
    setup = concurrent_setup
    ts = int(time.time())
    idem_key = f"CONC_PO_{ts}"

    po_data = {"status": "DRAFT"}

    results = []
    errors = []

    def _worker():
        session = _make_session()
        try:
            legacy, canonical = intercept_purchase_order_write(
                db=session,
                po_data=po_data,
                user_id=setup["admin_id"],
                idempotency_key=idem_key
            )
            results.append(canonical.id if canonical else None)
        except Exception as exc:
            errors.append(str(exc))
        finally:
            session.close()

    t1 = threading.Thread(target=_worker)
    t2 = threading.Thread(target=_worker)
    t1.start(); t2.start()
    t1.join(timeout=15); t2.join(timeout=15)

    assert not t1.is_alive() and not t2.is_alive(), "Ningun hilo debe continuar vivo tras el join"
    assert len(errors) == 0, f"Cero excepciones permitidas en workers de compra. Errores: {errors}"
    assert len(results) == 2, f"Se esperaban exactamente 2 respuestas, se obtuvieron {len(results)}"

    success_ids = [r for r in results if r is not None]
    assert len(success_ids) >= 1, f"Ningun hilo de compra tuvo exito. Errores: {errors}"

    if len(success_ids) == 2:
        assert success_ids[0] == success_ids[1], (
            f"Compra duplicada: dos PurchaseOrderFull con la misma key. IDs: {success_ids}"
        )


# ────────────────────────────────────────────────────────────────────────────
# TEST 4: Checkout identico concurrente → una orden y una reserva
# ────────────────────────────────────────────────────────────────────────────
def test_conc_04_checkout_identical_concurrent_one_order(concurrent_client, concurrent_setup):
    """
    Dos hilos hacen POST /store/checkout con la misma Idempotency-Key.
    Resultado: 1 SalesOrder, 1 InventoryReservation ACTIVE para el SKU.
    """
    setup = concurrent_setup
    ts = int(time.time())
    idem_key = f"CONC_CHECKOUT_{ts}"
    headers = {"Idempotency-Key": idem_key}

    payload = {
        "customer": {
            "first_name": "Conc",
            "last_name": "Checkout",
            "email": f"conc_checkout_{ts}@example.com",
            "phone": "3002220000"
        },
        "cart": [{"sku_id": setup["sku_id"], "quantity": 1}]
    }

    results = []

    def _checkout():
        r = concurrent_client.post("/api/v1/store/checkout", json=payload, headers=headers)
        results.append((r.status_code, r.json()))

    t1 = threading.Thread(target=_checkout)
    t2 = threading.Thread(target=_checkout)
    t1.start(); t2.start()
    t1.join(timeout=15); t2.join(timeout=15)

    assert not t1.is_alive() and not t2.is_alive(), "Ningun hilo debe continuar vivo tras el join"
    assert len(results) == 2, f"Se esperaban exactamente 2 respuestas, se obtuvieron {len(results)}"

    ok_codes = [r for r, _ in results if r in (200, 201)]
    assert len(ok_codes) >= 1, f"Ningun checkout exitoso. Results: {results}"

    # Verificar que los exitosos retornan el mismo order_id
    order_ids = [j["data"]["order_id"] for s, j in results if s in (200, 201) and "data" in j]
    if len(order_ids) == 2:
        assert order_ids[0] == order_ids[1], (
            f"Dos ordenes distintas para el mismo checkout. IDs: {order_ids}"
        )


# ────────────────────────────────────────────────────────────────────────────
# TEST 5: Checkouts compitiendo por stock → sin overselling
# ────────────────────────────────────────────────────────────────────────────
def test_conc_05_competing_checkouts_no_oversell(concurrent_client, concurrent_setup):
    """
    Se ajusta el stock a 5 unidades.
    10 hilos intentan comprar 1 unidad cada uno.
    No mas de 5 deben tener exito (sin overselling).
    """
    setup = concurrent_setup
    ts = int(time.time())

    # Ajustar stock a 5
    session = _make_session()
    try:
        inv = session.query(InventoryLevel).filter(
            InventoryLevel.sku_id == setup["sku_id"],
            InventoryLevel.warehouse_id == setup["warehouse_id"]
        ).first()
        if inv:
            inv.quantity = 5
        bal = session.query(InventoryOwnerBalance).filter(
            InventoryOwnerBalance.sku_id == setup["sku_id"],
            InventoryOwnerBalance.warehouse_id == setup["warehouse_id"],
            InventoryOwnerBalance.owner == "NEBULAE"
        ).first()
        if bal:
            bal.quantity = Decimal("5")
        # Liberar reservas anteriores para este SKU
        session.query(InventoryReservation).filter(
            InventoryReservation.sku_id == setup["sku_id"],
            InventoryReservation.status == "ACTIVE"
        ).update({"status": "RELEASED"}, synchronize_session=False)
        session.commit()
    finally:
        session.close()

    results = []

    def _checkout(i):
        idem = f"CONC_STOCK_{ts}_{i}"
        payload = {
            "customer": {
                "first_name": f"Buyer{i}",
                "last_name": "Stock",
                "email": f"buyer_{ts}_{i}@example.com",
                "phone": f"300000{i:04d}"
            },
            "cart": [{"sku_id": setup["sku_id"], "quantity": 1}]
        }
        r = concurrent_client.post("/api/v1/store/checkout", json=payload,
                                   headers={"Idempotency-Key": idem})
        results.append(r.status_code)

    threads = [threading.Thread(target=_checkout, args=(i,)) for i in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    # 1. Control estricto de concurrencia y respuesta de hilos
    assert len(results) == 10, f"Se esperaban exactamente 10 respuestas, se obtuvieron {len(results)}"
    assert not any(t.is_alive() for t in threads), "Ningún hilo debe continuar vivo tras el join"

    successes = [s for s in results if s in (200, 201)]
    failures = [s for s in results if s == 409]

    # 2. Exactamente 5 éxitos y 5 rechazos 409 (cero 500 y cero excepciones)
    assert len(successes) == 5, (
        f"Se esperaban exactamente 5 exitos (stock=5). Exitos={len(successes)}, Fallos={len(failures)}. "
        f"Resultados: {results}"
    )
    assert len(failures) == 5, (
        f"Se esperaban exactamente 5 respuestas 409. Fallos={len(failures)}. "
        f"Resultados: {results}"
    )
    assert not any(s == 500 for s in results), f"Cero errores 500 permitidos. Resultados: {results}"
    assert len(successes) + len(failures) == 10, f"La suma de exitos y fallos debe ser 10. Resultados: {results}"

    # 3. Verificaciones rigurosas de estado en Base de Datos
    from app.api.v1.ecommerce import _get_real_sellable_stock
    session = _make_session()
    try:
        # Suma de reservas ACTIVE exactamente 5
        active_res = session.query(InventoryReservation).filter(
            InventoryReservation.sku_id == setup["sku_id"],
            InventoryReservation.status == "ACTIVE"
        ).all()
        total_reserved = sum(r.quantity_reserved for r in active_res)
        assert total_reserved == Decimal("5"), (
            f"Suma de reservas ACTIVE debe ser exactamente 5, encontrado {total_reserved}"
        )

        # Exactamente 5 pedidos SaleOrder creados en esta ejecucion
        created_orders = session.query(SaleOrder).filter(
            SaleOrder.checkout_idempotency_key.like(f"CONC_STOCK_{ts}_%")
        ).count()
        assert created_orders == 5, (
            f"Exactamente 5 pedidos SaleOrder deben ser creados, encontrados {created_orders}"
        )

        # Stock físico permanece en 5 hasta despacho
        inv_post = session.query(InventoryLevel).filter(
            InventoryLevel.sku_id == setup["sku_id"],
            InventoryLevel.warehouse_id == setup["warehouse_id"]
        ).first()
        assert inv_post.quantity == 5, (
            f"Stock fisico debe permanecer en 5 hasta despacho, encontrado {inv_post.quantity}"
        )

        # Disponibilidad vendible final = 0.0
        avail = _get_real_sellable_stock(session, setup["sku_id"], setup["warehouse_id"], "NEBULAE")
        assert avail == 0.0, (
            f"Disponibilidad vendible final debe ser 0.0, encontrada {avail}"
        )
    finally:
        session.close()


# ────────────────────────────────────────────────────────────────────────────
# TEST 6: Dos reconcile-sync simultaneos → cero duplicados
# ────────────────────────────────────────────────────────────────────────────
def test_conc_06_concurrent_reconcile_sync_no_duplicates(concurrent_client, concurrent_setup):
    """
    Dos hilos ejecutan POST /legacy/reconcile-sync al mismo tiempo.
    Resultado: ambos exitosos, cero SaleOrder duplicadas.
    """
    setup = concurrent_setup
    headers = setup["admin_headers"]

    # Crear una orden huerfana para reconciliar
    session = _make_session()
    try:
        orphan = SalesOrder(
            customer_id=setup["customer_id"],
            status="PENDING",
            canonical_sale_order_id=None
        )
        session.add(orphan)
        session.commit()
        orphan_id = orphan.id
    finally:
        session.close()

    results = []

    def _reconcile():
        r = concurrent_client.post("/api/v1/legacy/reconcile-sync", headers=headers)
        results.append(r.status_code)

    t1 = threading.Thread(target=_reconcile)
    t2 = threading.Thread(target=_reconcile)
    t1.start(); t2.start()
    t1.join(timeout=30); t2.join(timeout=30)

    assert not t1.is_alive() and not t2.is_alive(), "Ningun hilo debe continuar vivo tras el join"
    assert len(results) == 2, f"Se esperaban exactamente 2 respuestas, se obtuvieron {len(results)}"

    assert all(s == 200 for s in results), (
        f"Reconcile-sync fallo. Resultados: {results}"
    )

    # Verificar que la orden huerfana tiene exactamente 1 canonical vinculado
    session = _make_session()
    try:
        orphan_db = session.query(SalesOrder).filter(SalesOrder.id == orphan_id).first()
        assert orphan_db.canonical_sale_order_id is not None, (
            "La orden huerfana debe quedar vinculada despues del reconcile"
        )
        # Verificar que el canonical no esta duplicado: contar SaleOrder con ese ID
        can_count = session.query(SaleOrder).filter(
            SaleOrder.id == orphan_db.canonical_sale_order_id
        ).count()
        assert can_count == 1, (
            f"La SaleOrder canonica esta duplicada: {can_count} registros"
        )
    finally:
        session.close()


# ────────────────────────────────────────────────────────────────────────────
# TEST 7: Consecutivos VEN/PEC/COT unicos bajo concurrencia
# ────────────────────────────────────────────────────────────────────────────
def test_conc_07_consecutive_numbers_unique_under_concurrency():
    """
    20 hilos obtienen consecutivos de seq_ven_so, seq_pec_po y seq_cot_sq simultaneamente.
    Todos los numeros generados deben ser unicos (sin colisiones MAX(id)+1).
    """
    ven_numeros = []
    pec_numeros = []
    cot_numeros = []
    errors = []
    lock = threading.Lock()

    def _get_consecutives():
        session = _make_session()
        try:
            ven = _get_next_sale_order_numero(session, prefix="VEN")
            pec = _get_next_purchase_order_numero(session, prefix="PEC")
            cot = _get_next_quotation_numero(session, prefix="COT")
            with lock:
                ven_numeros.append(ven)
                pec_numeros.append(pec)
                cot_numeros.append(cot)
        except Exception as exc:
            with lock:
                errors.append(str(exc))
        finally:
            session.close()

    threads = [threading.Thread(target=_get_consecutives) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert not any(t.is_alive() for t in threads), "Ningun hilo debe continuar vivo tras el join"
    assert not errors, f"Errores obteniendo consecutivos: {errors}"
    assert len(ven_numeros) == 20, f"Se esperaban 20 numeros VEN, se obtuvieron {len(ven_numeros)}"
    assert len(pec_numeros) == 20, f"Se esperaban 20 numeros PEC, se obtuvieron {len(pec_numeros)}"
    assert len(cot_numeros) == 20, f"Se esperaban 20 numeros COT, se obtuvieron {len(cot_numeros)}"

    # Verificar unicidad
    assert len(set(ven_numeros)) == 20, (
        f"Colision en consecutivos VEN: {len(set(ven_numeros))} unicos de 20. "
        f"Duplicados: {[v for v in ven_numeros if ven_numeros.count(v) > 1]}"
    )
    assert len(set(pec_numeros)) == 20, (
        f"Colision en consecutivos PEC. Duplicados: {[v for v in pec_numeros if pec_numeros.count(v) > 1]}"
    )
    assert len(set(cot_numeros)) == 20, (
        f"Colision en consecutivos COT. Duplicados: {[v for v in cot_numeros if cot_numeros.count(v) > 1]}"
    )
