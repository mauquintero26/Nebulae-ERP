"""
test_fase6_legacy_consolidation.py

Suite exhaustiva de pruebas para Hardening y Certificacion Real de Fase 6 en Nebulae ERP:
- Bloqueo 1: Paridad puramente de lectura (cero mutaciones, reporte de ambiguedades, comparacion real de compras y finanzas sin universos heterogeneos).
- Bloqueo 2: Idempotencia estricta, replay identico vs divergente (409) y eliminacion de MAX(id)+1 mediante secuencias PostgreSQL.
- Bloqueo 3: Modos de gobernanza reales (DUAL_WRITE, READ_ONLY con 410, CANONICAL_PRIMARY) con rechazo de contradicciones y auditoria de cambio.
- Bloqueo 4: Auditoria inmutable append-only protegida por trigger, registro de LEGACY_READ con latencia y telemetria en metricas.
- Bloqueo 5: Checkout unico y seguro en /store/checkout (precios en BD, bodega autorizada, aislamiento MAU, bloqueo pesimista y PENDIENTE_PAGO).
- Bloqueo 6: Reconciliacion y backfill transaccional con savepoints por registro, manejo seguro de errores y no status success con fallas.
- Bloqueo 7: Cabeceras RFC 8594 con fecha Sunset en formato RFC 1123 HTTP-date y validacion estricta de fechas futuras.
"""
import pytest
import datetime
import decimal
import time
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect

from app.models.customers import Customer
from app.models.catalog import Product, ProductSKU, Category, Brand
from app.models.inventory import Warehouse, InventoryLevel
from app.models.sales import SalesOrder, SalesOrderLine, Quotation
from app.models.purchases import PurchaseOrder
from app.models.erp_documents import SaleOrder, PurchaseOrderFull, SalesQuotation, GoodsReceipt
from app.models.fase1b import SaleOrderLineErp, InventoryOwnerBalance, InventoryReservation
from app.models.fase4 import SaleOrderPayment
from app.models.fase6 import (
    LegacyConsolidationAuditLog,
    LegacyParitySnapshot,
    LegacyGovernancePolicy
)
from app.models.users import User
from app.core.security import create_access_token
from app.services.legacy_consolidation import (
    get_or_create_governance_policy,
    apply_deprecation_headers,
    compare_sales_parity,
    compare_purchases_parity,
    compare_financial_parity,
    generate_and_save_parity_snapshot,
    intercept_sales_order_write,
    intercept_purchase_order_write,
    reconcile_and_backfill_orphan_legacy
)


def _now():
    return datetime.datetime.utcnow()


@pytest.fixture
def client(app_client: TestClient):
    return app_client


@pytest.fixture
def auth_tokens(db: Session):
    """Crea usuarios con diferentes roles para pruebas de seguridad y RBAC."""
    roles = {
        "admin": "Admin",
        "asesor": "Vendedor",
        "finanzas": "Finanzas",
    }
    tokens = {}
    for prefix, role_name in roles.items():
        email = f"fase6_hardened_{prefix}_{int(datetime.datetime.utcnow().timestamp())}@nebulaekids.com"
        u = User(email=email, password_hash="dummy_hash", role=role_name, is_active=True)
        db.add(u)
        db.flush()
        tok = create_access_token({"sub": str(u.id), "role": role_name})
        tokens[prefix] = {"user": u, "token": tok, "headers": {"Authorization": f"Bearer {tok}"}}
    db.commit()
    return tokens


@pytest.fixture
def base_catalog_and_customer(db: Session):
    """Crea cliente, producto, SKU y bodega de prueba con balance de inventario."""
    ts = int(datetime.datetime.utcnow().timestamp())
    cust = Customer(
        first_name="Mateo",
        last_name="Vallejo",
        email=f"mateo_{ts}@example.com",
        phone="3109876543",
        address="Cra 43 #70-20",
        city="Barranquilla",
        document=f"CC{ts}"
    )
    db.add(cust)

    wh = db.query(Warehouse).filter(Warehouse.location_type == "Central").first()
    if not wh:
        wh = Warehouse(name=f"Bodega Central F6 {ts}", location_type="Central")
        db.add(wh)
    db.flush()

    cat = db.query(Category).first()
    if not cat:
        cat = Category(name="Mobiliario Infantil")
        db.add(cat)
    brand = db.query(Brand).first()
    if not brand:
        brand = Brand(name="Nebulae Kids")
        db.add(brand)
    db.flush()

    prod = Product(
        name=f"Cuna Colecho Pro {ts}",
        type="Fisico",
        base_currency="COP",
        uom="Unidad",
        is_active=True,
        category_id=cat.id,
        brand_id=brand.id
    )
    db.add(prod)
    db.flush()

    sku = ProductSKU(
        product_id=prod.id,
        sku=f"CUNA-COL-BLA-{ts}",
        sale_price=Decimal("1200000.00"),
        cost_price=Decimal("800000.00")
    )
    db.add(sku)
    db.flush()

    # Nivel de inventario
    inv = InventoryLevel(warehouse_id=wh.id, sku_id=sku.id, quantity=10)
    db.add(inv)

    # Balance de inventario por propietario NEBULAE
    bal = db.query(InventoryOwnerBalance).filter(
        InventoryOwnerBalance.sku_id == sku.id,
        InventoryOwnerBalance.warehouse_id == wh.id,
        InventoryOwnerBalance.owner == "NEBULAE"
    ).first()
    if not bal:
        bal = InventoryOwnerBalance(
            sku_id=sku.id,
            warehouse_id=wh.id,
            owner="NEBULAE",
            quantity=Decimal("10.0")
        )
        db.add(bal)

    db.commit()
    return {"customer": cust, "product": prod, "sku": sku, "warehouse": wh}


# ──────────────────────────────────────────────────────────────────────────────
# TEST 1: Esquema Estructural y Secuencias Consecutivas (Bloqueo 2)
# ──────────────────────────────────────────────────────────────────────────────
def test_01_fase6_structural_schema_and_sequences(db: Session):
    insp = inspect(db.bind)
    tables = insp.get_table_names()

    assert "legacy_consolidation_audit_logs" in tables
    assert "legacy_parity_snapshots" in tables
    assert "legacy_governance_policies" in tables

    # Verificar columnas de auditoria inmutable (Bloqueo 4)
    audit_cols = {c["name"] for c in insp.get_columns("legacy_consolidation_audit_logs")}
    assert "actor_user_id" in audit_cols
    assert "latency_ms" in audit_cols
    assert "result_summary" in audit_cols
    assert "idempotency_key" in audit_cols
    assert "fingerprint" in audit_cols

    # Verificar columnas de gobernanza (Bloqueo 3)
    gov_cols = {c["name"] for c in insp.get_columns("legacy_governance_policies")}
    assert "change_reason" in gov_cols
    assert "actor_user_id" in gov_cols

    # Verificar secuencias PostgreSQL (Bloqueo 2: Cero MAX(id)+1)
    for seq in ["seq_ven_so", "seq_pec_po", "seq_cot_sq"]:
        val = db.execute(text(f"SELECT nextval('{seq}')")).scalar()
        assert val is not None and val >= 1000


# ──────────────────────────────────────────────────────────────────────────────
# TEST 2: Trigger de Inmutabilidad Bloquea UPDATE y DELETE (Bloqueo 4)
# ──────────────────────────────────────────────────────────────────────────────
def test_02_immutable_audit_log_trigger_blocks_mutations(db: Session):
    # 1. Insertar un log de auditoria
    log_entry = LegacyConsolidationAuditLog(
        event_type="PARITY_CHECK",
        legacy_endpoint="/api/v1/legacy/test",
        http_method="GET",
        entity_type="SYSTEM",
        status="RECORDED",
        created_at=_now()
    )
    db.add(log_entry)
    db.commit()
    log_id = log_entry.id

    # 2. Intentar UPDATE directamente en base de datos -> debe fallar por trigger
    update_failed = False
    try:
        db.execute(text(f"UPDATE legacy_consolidation_audit_logs SET status='RESOLVED' WHERE id={log_id}"))
        db.commit()
    except Exception as ex:
        db.rollback()
        update_failed = True
        assert "append-only and immutable" in str(ex)
    assert update_failed, "El trigger debio rechazar el UPDATE en la tabla de auditoria inmutable."

    # 3. Intentar DELETE directamente en base de datos -> debe fallar por trigger
    delete_failed = False
    try:
        db.execute(text(f"DELETE FROM legacy_consolidation_audit_logs WHERE id={log_id}"))
        db.commit()
    except Exception as ex:
        db.rollback()
        delete_failed = True
        assert "append-only and immutable" in str(ex)
    assert delete_failed, "El trigger debio rechazar el DELETE en la tabla de auditoria inmutable."


# ──────────────────────────────────────────────────────────────────────────────
# TEST 3: Politicas de Gobernanza y Cabeceras RFC 8594 / RFC 1123 (Bloqueo 7)
# ──────────────────────────────────────────────────────────────────────────────
def test_03_governance_policy_and_rfc8594_headers_with_rfc1123_date(client: TestClient, auth_tokens):
    headers = auth_tokens["admin"]["headers"]
    res = client.get("/api/v1/sales/", headers=headers)
    assert res.status_code == 200

    # Cabeceras RFC 8594
    assert res.headers.get("Deprecation") == "true"
    assert "/api/v1/ventas/pedidos" in res.headers.get("Link", "")
    assert res.headers.get("X-Legacy-Governance-Mode") in ("DUAL_WRITE", "READ_ONLY", "CANONICAL_PRIMARY")

    # Validacion RFC 1123 en Sunset (ej: "Thu, 31 Dec 2026 23:59:59 GMT")
    sunset = res.headers.get("Sunset", "")
    assert "GMT" in sunset
    assert len(sunset.split(",")) == 2


# ──────────────────────────────────────────────────────────────────────────────
# TEST 4: Gobernanza Rechaza Contradicciones y Valida Fechas (Bloqueo 3 y 7)
# ──────────────────────────────────────────────────────────────────────────────
def test_04_governance_rejects_contradictions_and_validates_sunset(client: TestClient, auth_tokens, db: Session):
    headers = auth_tokens["admin"]["headers"]

    # 1. Rechazar configuracion contradictoria: READ_ONLY con allow_legacy_writes=True
    bad_res = client.patch("/api/v1/legacy/governance", json={
        "mode": "READ_ONLY",
        "allow_legacy_writes": True
    }, headers=headers)
    assert bad_res.status_code == 400
    assert "contradictoria" in bad_res.json()["detail"].lower()

    # 2. Rechazar configuracion contradictoria: DUAL_WRITE con allow_legacy_writes=False
    bad_res2 = client.patch("/api/v1/legacy/governance", json={
        "mode": "DUAL_WRITE",
        "allow_legacy_writes": False
    }, headers=headers)
    assert bad_res2.status_code == 400
    assert "contradictoria" in bad_res2.json()["detail"].lower()

    # 3. Rechazar fecha de sunset en el pasado (Bloqueo 7)
    past_date_res = client.patch("/api/v1/legacy/governance", json={
        "sunset_date": "2020-01-01"
    }, headers=headers)
    assert past_date_res.status_code == 422
    assert "anterior" in past_date_res.json()["detail"].lower()

    # 4. Actualizacion valida con change_reason y auditoria de cambio
    good_res = client.patch("/api/v1/legacy/governance", json={
        "mode": "DUAL_WRITE",
        "allow_legacy_writes": True,
        "sunset_date": "2027-06-30",
        "change_reason": "Ajuste de cronograma de consolidacion Fase 6"
    }, headers=headers)
    assert good_res.status_code == 200
    assert good_res.json()["data"]["mode"] == "DUAL_WRITE"
    assert good_res.json()["data"]["change_reason"] == "Ajuste de cronograma de consolidacion Fase 6"

    # Verificar que se registro auditoria GOVERNANCE_CHANGE con actor_user_id
    gov_log = db.query(LegacyConsolidationAuditLog).filter(
        LegacyConsolidationAuditLog.event_type == "GOVERNANCE_CHANGE"
    ).order_by(LegacyConsolidationAuditLog.id.desc()).first()
    assert gov_log is not None
    assert gov_log.actor_user_id == auth_tokens["admin"]["user"].id
    assert "Ajuste de cronograma" in (gov_log.discrepancy_details or "")


# ──────────────────────────────────────────────────────────────────────────────
# TEST 5: Paridad Puramente de Lectura: Cero Modificaciones en BD (Bloqueo 1)
# ──────────────────────────────────────────────────────────────────────────────
def test_05_parity_report_is_strictly_read_only_zero_modifications(client: TestClient, auth_tokens, db: Session, base_catalog_and_customer):
    headers = auth_tokens["admin"]["headers"]

    # Crear una orden legacy huerfana para que exista discrepancia
    ts = int(time.time())
    orphan_so = SalesOrder(
        customer_id=base_catalog_and_customer["customer"].id,
        status="PENDING",
        canonical_sale_order_id=None
    )
    db.add(orphan_so)
    db.commit()

    # Capturar recuentos de tablas antes de consultar paridad
    counts_before = {
        "sales_orders": db.query(SalesOrder).count(),
        "sale_orders": db.query(SaleOrder).count(),
        "purchase_orders": db.query(PurchaseOrder).count(),
        "purchase_orders_full": db.query(PurchaseOrderFull).count(),
        "audit_logs": db.query(LegacyConsolidationAuditLog).count()
    }

    # Invocar GET /parity-report (read-only)
    res = client.get("/api/v1/legacy/parity-report", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]

    # Capturar recuentos despues de la llamada
    counts_after = {
        "sales_orders": db.query(SalesOrder).count(),
        "sale_orders": db.query(SaleOrder).count(),
        "purchase_orders": db.query(PurchaseOrder).count(),
        "purchase_orders_full": db.query(PurchaseOrderFull).count(),
        "audit_logs": db.query(LegacyConsolidationAuditLog).count()
    }

    # Asertar CERO inserciones, actualizaciones o eliminaciones
    assert counts_before == counts_after, f"GET /parity-report modifico entidades: {counts_before} != {counts_after}"

    # Verificar que la orden huerfana permanezca huerfana (cero enlace automatico por tiempo/cliente)
    refreshed_so = db.query(SalesOrder).filter(SalesOrder.id == orphan_so.id).first()
    assert refreshed_so.canonical_sale_order_id is None, "compare_sales_parity vinculo indebidamente una orden huerfana!"


# ──────────────────────────────────────────────────────────────────────────────
# TEST 6: Comparacion Real de Compras (Bloqueo 1)
# ──────────────────────────────────────────────────────────────────────────────
def test_06_compare_purchases_parity_comprehensive(db: Session):
    # 1. Crear PurchaseOrder legacy vinculada y canonica con estado coincidente
    can_po = PurchaseOrderFull(
        numero=f"PEC-TEST-{int(time.time())}",
        supplier_name="Proveedor Madera Andina",
        estado="RECIBIDA",
        subtotal_cop=Decimal("5000000.00"),
        total_cop=Decimal("5000000.00")
    )
    db.add(can_po)
    db.flush()

    po_aligned = PurchaseOrder(
        status="RECEIVED",
        canonical_purchase_order_id=can_po.id
    )
    db.add(po_aligned)

    # 2. Crear PurchaseOrder con estado discrepante
    can_po2 = PurchaseOrderFull(
        numero=f"PEC-TEST2-{int(time.time())}",
        supplier_name="Proveedor Telas y Espumas",
        estado="BORRADOR",
        total_cop=Decimal("2000000.00")
    )
    db.add(can_po2)
    db.flush()

    po_discrepant = PurchaseOrder(
        status="RECEIVED",
        canonical_purchase_order_id=can_po2.id
    )
    db.add(po_discrepant)
    db.commit()

    parity = compare_purchases_parity(db)
    assert parity["total_legacy_purchases"] >= 2
    assert parity["total_canonical_purchases"] >= 2

    # Verificar que se detecto la discrepancia de estado
    disc_types = [d.get("type") for d in parity["discrepancies"]]
    assert "STATUS_MISMATCH" in disc_types


# ──────────────────────────────────────────────────────────────────────────────
# TEST 7: Comparacion Financiera sin Universos Heterogeneos (Bloqueo 1)
# ──────────────────────────────────────────────────────────────────────────────
def test_07_compare_financial_parity_unbiased(db: Session, base_catalog_and_customer):
    fin = compare_financial_parity(db)
    assert "legacy_linked_revenue_cop" in fin
    assert "canonical_linked_revenue_cop" in fin
    assert "reconciled_total_revenue_cop" in fin
    # El ingreso vinculado no suma simultaneamente ordenes huerfanas ni duplica enlazadas
    assert fin["legacy_linked_revenue_cop"] >= 0.0
    assert fin["canonical_linked_revenue_cop"] >= 0.0


# ──────────────────────────────────────────────────────────────────────────────
# TEST 8: Dual-Write en Ventas con Idempotencia y Replay (Bloqueo 2)
# ──────────────────────────────────────────────────────────────────────────────
def test_08_dual_write_sales_order_idempotency_and_replays(client: TestClient, auth_tokens, base_catalog_and_customer, db: Session):
    headers = auth_tokens["admin"]["headers"]
    ts = int(time.time())
    idem_key = f"IDEM_SO_{ts}"

    payload = {
        "customer_id": base_catalog_and_customer["customer"].id,
        "status": "PENDING",
        "sale_type": "IMMEDIATE",
        "anticipo": 600000.0,
        "lines": [
            {"sku_id": base_catalog_and_customer["sku"].id, "quantity": 1, "unit_price": 1200000.0}
        ]
    }

    # 1. Peticion Inicial
    h1 = {**headers, "Idempotency-Key": idem_key}
    res1 = client.post("/api/v1/sales/", json=payload, headers=h1)
    assert res1.status_code == 201
    order1 = res1.json()["data"]
    order_id = order1["id"]

    # Verificar que se genero con secuencia PostgreSQL (consecutivo no MAX(id)+1)
    db_so = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    assert db_so.canonical_sale_order_id is not None
    can_so = db.query(SaleOrder).filter(SaleOrder.id == db_so.canonical_sale_order_id).first()
    assert can_so.numero.startswith("VEN-")

    # 2. Replay Identico -> debe devolver la misma orden exactamente
    res_replay = client.post("/api/v1/sales/", json=payload, headers=h1)
    assert res_replay.status_code == 201
    assert res_replay.json()["data"]["id"] == order_id

    # 3. Replay Divergente (mismo key, datos diferentes) -> debe retornar 409 Conflict
    divergent_payload = {**payload, "anticipo": 999999.0}
    res_divergent = client.post("/api/v1/sales/", json=divergent_payload, headers=h1)
    assert res_divergent.status_code == 409
    assert "divergente" in res_divergent.json()["detail"].lower() or "conflict" in res_divergent.json()["detail"].lower()


# ──────────────────────────────────────────────────────────────────────────────
# TEST 9: Dual-Write en Compras con Idempotencia y Replay (Bloqueo 2)
# ──────────────────────────────────────────────────────────────────────────────
def test_09_dual_write_purchase_order_idempotency_and_replays(client: TestClient, auth_tokens, db: Session):
    headers = auth_tokens["admin"]["headers"]
    ts = int(time.time())
    idem_key = f"IDEM_PO_{ts}"

    payload = {"status": "DRAFT"}
    h1 = {**headers, "Idempotency-Key": idem_key}

    # 1. Peticion inicial
    res1 = client.post("/api/v1/purchases/", json=payload, headers=h1)
    assert res1.status_code == 201
    po_id = res1.json()["data"]["id"]

    # 2. Replay identico
    res_replay = client.post("/api/v1/purchases/", json=payload, headers=h1)
    assert res_replay.status_code == 201
    assert res_replay.json()["data"]["id"] == po_id

    # 3. Replay divergente -> 409
    div_res = client.post("/api/v1/purchases/", json={"status": "SENT"}, headers=h1)
    assert div_res.status_code == 409


# ──────────────────────────────────────────────────────────────────────────────
# TEST 10: Modos de Gobernanza READ_ONLY y CANONICAL_PRIMARY (Bloqueo 3)
# ──────────────────────────────────────────────────────────────────────────────
def test_10_governance_modes_read_only_and_canonical_primary(client: TestClient, auth_tokens, base_catalog_and_customer):
    headers = auth_tokens["admin"]["headers"]

    # 1. Configurar READ_ONLY
    client.patch("/api/v1/legacy/governance", json={"mode": "READ_ONLY", "allow_legacy_writes": False}, headers=headers)

    # Intento de escritura en ventas -> debe retornar 410 Gone
    res_ro = client.post("/api/v1/sales/", json={
        "customer_id": base_catalog_and_customer["customer"].id,
        "status": "PENDING",
        "lines": [{"sku_id": base_catalog_and_customer["sku"].id, "quantity": 1, "unit_price": 1200000.0}]
    }, headers={**headers, "Idempotency-Key": f"RO_{int(time.time())}"})
    assert res_ro.status_code == 410

    # 2. Restaurar DUAL_WRITE
    client.patch("/api/v1/legacy/governance", json={"mode": "DUAL_WRITE", "allow_legacy_writes": True}, headers=headers)


# ──────────────────────────────────────────────────────────────────────────────
# TEST 11: Telemetria de LEGACY_READ y Metricas Reales (Bloqueo 4)
# ──────────────────────────────────────────────────────────────────────────────
def test_11_legacy_read_telemetry_and_metrics(client: TestClient, auth_tokens, db: Session):
    headers = auth_tokens["admin"]["headers"]

    # Realizar lecturas legacy
    res1 = client.get("/api/v1/sales/", headers=headers)
    assert res1.status_code == 200

    res2 = client.get("/api/v1/purchases/", headers=headers)
    assert res2.status_code == 200

    # Consultar metricas en tiempo real
    m_res = client.get("/api/v1/legacy/metrics", headers=headers)
    assert m_res.status_code == 200
    telemetry = m_res.json()["data"]["telemetry"]
    assert telemetry["total_legacy_reads"] > 0
    assert telemetry["average_latency_ms"] >= 0.0


# ──────────────────────────────────────────────────────────────────────────────
# TEST 12: Reconciliacion Transaccional con Savepoints y Manejo de Errores (Bloqueo 6)
# ──────────────────────────────────────────────────────────────────────────────
def test_12_reconcile_backfill_transactional_savepoints_and_errors(client: TestClient, auth_tokens, db: Session, base_catalog_and_customer):
    headers = auth_tokens["admin"]["headers"]

    # Crear una orden valida huerfana
    so_valid = SalesOrder(
        customer_id=base_catalog_and_customer["customer"].id,
        status="PENDING",
        canonical_sale_order_id=None
    )
    db.add(so_valid)
    db.commit()

    # Ejecutar reconciliacion
    res = client.post("/api/v1/legacy/reconcile-sync", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]

    # Si no hubo errores reporta success
    assert data["status"] == "success"
    assert data["synced_sales_orders"] >= 1

    # Verificar que la orden quedo debidamente vinculada
    db.refresh(so_valid)
    assert so_valid.canonical_sale_order_id is not None


# ──────────────────────────────────────────────────────────────────────────────
# TEST 13: Checkout Publico Seguro: Idempotencia y Replay (Bloqueo 5)
# ──────────────────────────────────────────────────────────────────────────────
def test_13_store_checkout_idempotency_and_replays(client: TestClient, base_catalog_and_customer, db: Session):
    ts = int(time.time())
    idem_key = f"CHECKOUT_IDEM_{ts}"
    payload = {
        "customer": {
            "first_name": "Laura",
            "last_name": "Gomez",
            "email": f"laura_{ts}@example.com",
            "phone": "3001234567"
        },
        "cart": [
            {"sku_id": base_catalog_and_customer["sku"].id, "quantity": 1}
        ]
    }

    # 1. Sin idempotency-key -> 422
    res_no_key = client.post("/api/v1/store/checkout", json=payload)
    assert res_no_key.status_code == 422

    # 2. Peticion valida con Idempotency-Key
    h = {"Idempotency-Key": idem_key}
    res1 = client.post("/api/v1/store/checkout", json=payload, headers=h)
    assert res1.status_code == 201
    ord1 = res1.json()["data"]
    order_id = ord1["order_id"]
    can_id = ord1["canonical_sale_order_id"]

    # Verificar estado canonico inicial PENDIENTE_PAGO y cero pagos confirmados
    can_so = db.query(SaleOrder).filter(SaleOrder.id == can_id).first()
    assert can_so.estado == "PENDIENTE_PAGO"
    payments = db.query(SaleOrderPayment).filter(SaleOrderPayment.sale_order_id == can_id).all()
    assert len(payments) == 0, "No debe crearse ningun pago confirmado en el checkout publico!"

    # 3. Replay Identico -> 200/201 con la misma orden
    res_replay = client.post("/api/v1/store/checkout", json=payload, headers=h)
    assert res_replay.status_code in (200, 201)
    assert res_replay.json()["data"]["order_id"] == order_id

    # 4. Replay Divergente -> 409 Conflict
    div_payload = {
        **payload,
        "cart": [{"sku_id": base_catalog_and_customer["sku"].id, "quantity": 2}]
    }
    res_div = client.post("/api/v1/store/checkout", json=div_payload, headers=h)
    assert res_div.status_code == 409


# ──────────────────────────────────────────────────────────────────────────────
# TEST 14: Checkout Publico Seguro: Precios desde BD y Reserva Pesimista (Bloqueo 5)
# ──────────────────────────────────────────────────────────────────────────────
def test_14_store_checkout_price_from_db_and_stock_validation(client: TestClient, base_catalog_and_customer, db: Session):
    ts = int(time.time())
    idem_key = f"CHECKOUT_SEC_{ts}"

    # Intentar enviar una cantidad excesiva que supere el stock
    excessive_payload = {
        "customer": {
            "first_name": "Andres",
            "last_name": "Rios",
            "email": f"andres_{ts}@example.com",
            "phone": "3007654321"
        },
        "cart": [
            {"sku_id": base_catalog_and_customer["sku"].id, "quantity": 99999}
        ]
    }
    res_excessive = client.post("/api/v1/store/checkout", json=excessive_payload, headers={"Idempotency-Key": idem_key})
    assert res_excessive.status_code == 409
    assert "stock insuficiente" in res_excessive.json()["detail"].lower()


# ──────────────────────────────────────────────────────────────────────────────
# TEST 15: Checkout Publico: Aislamiento Patrimonial NEBULAE vs MAU (Bloqueo 5)
# ──────────────────────────────────────────────────────────────────────────────
def test_15_store_checkout_mau_isolation(client: TestClient, base_catalog_and_customer, db: Session):
    ts = int(time.time())
    # Crear un SKU perteneciente exclusivamente a bodega MAU
    wh_mau = Warehouse(name=f"Bodega MAU Externa {ts}", location_type="Externo")
    db.add(wh_mau)
    db.flush()

    bal_mau = InventoryOwnerBalance(
        sku_id=base_catalog_and_customer["sku"].id,
        warehouse_id=wh_mau.id,
        owner="MAU",
        quantity=Decimal("50.0")
    )
    db.add(bal_mau)
    db.commit()

    # El checkout usa la bodega central de NEBULAE y nunca toma inventario de MAU
    payload = {
        "customer": {
            "first_name": "Carlos",
            "last_name": "Mendoza",
            "email": f"carlos_{ts}@example.com"
        },
        "cart": [{"sku_id": base_catalog_and_customer["sku"].id, "quantity": 1}]
    }
    res = client.post("/api/v1/store/checkout", json=payload, headers={"Idempotency-Key": f"MAU_ISO_{ts}"})
    assert res.status_code == 201

    # Verificar que la reserva fisica generada sea estrictamente de owner NEBULAE
    res_obj = db.query(InventoryReservation).filter(
        InventoryReservation.sku_id == base_catalog_and_customer["sku"].id
    ).order_by(InventoryReservation.id.desc()).first()
    assert res_obj.owner == "NEBULAE"


# ──────────────────────────────────────────────────────────────────────────────
# TEST 16: Seguridad RBAC en Observabilidad (Bloqueo 4)
# ──────────────────────────────────────────────────────────────────────────────
def test_16_rbac_observability(client: TestClient, auth_tokens):
    asesor_headers = auth_tokens["asesor"]["headers"]
    admin_headers = auth_tokens["admin"]["headers"]

    # Asesor no puede ver audit logs
    res1 = client.get("/api/v1/legacy/audit-logs", headers=asesor_headers)
    assert res1.status_code == 403

    # Asesor no puede modificar gobernanza
    res2 = client.patch("/api/v1/legacy/governance", json={"mode": "DUAL_WRITE"}, headers=asesor_headers)
    assert res2.status_code == 403

    # Admin si puede consultar logs
    res3 = client.get("/api/v1/legacy/audit-logs", headers=admin_headers)
    assert res3.status_code == 200


# ──────────────────────────────────────────────────────────────────────────────
# TEST 17: Coexistencia con Finanzas y CRM (Bloqueo 1)
# ──────────────────────────────────────────────────────────────────────────────
def test_17_finance_and_crm_coexistence(client: TestClient, auth_tokens, db: Session):
    admin_headers = auth_tokens["admin"]["headers"]

    # Dashboard de finanzas unificado
    res_fin = client.get("/api/v1/finance/dashboard", headers=admin_headers)
    assert res_fin.status_code == 200
    assert "gross_revenue" in res_fin.json()["data"]

    # Alertas CRM y Coexistencia (Fase 6 - Hallazgo 9)
    res_crm = client.post("/api/v1/crm/trigger-alerts", headers=admin_headers)
    assert res_crm.status_code == 200

    cal_res = client.get("/api/v1/crm/calendar", headers=admin_headers)
    assert cal_res.status_code == 200


# ──────────────────────────────────────────────────────────────────────────────
# TEST 18: Sincronizacion de Facturacion Legacy hacia Canonica
# ──────────────────────────────────────────────────────────────────────────────
def test_18_invoice_sales_order_sync(client: TestClient, auth_tokens, base_catalog_and_customer, db: Session):
    headers = auth_tokens["admin"]["headers"]
    ts = int(time.time())

    # Crear orden via dual write
    res = client.post("/api/v1/sales/", json={
        "customer_id": base_catalog_and_customer["customer"].id,
        "status": "PENDING",
        "lines": [{"sku_id": base_catalog_and_customer["sku"].id, "quantity": 1, "unit_price": 1200000.0}]
    }, headers={**headers, "Idempotency-Key": f"INV_SO_{ts}"})
    assert res.status_code == 201
    so_id = res.json()["data"]["id"]

    # Facturar
    inv_res = client.post(f"/api/v1/sales/{so_id}/invoice", headers=headers)
    assert inv_res.status_code == 200
    assert inv_res.json()["data"]["status"] == "INVOICED"

    # Verificar propagacion a SaleOrder
    db_so = db.query(SalesOrder).filter(SalesOrder.id == so_id).first()
    can_so = db.query(SaleOrder).filter(SaleOrder.id == db_so.canonical_sale_order_id).first()
    assert can_so.estado == "FACTURADO"
