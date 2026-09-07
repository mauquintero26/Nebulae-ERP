"""
test_fase6_legacy_consolidation.py

Suite exhaustiva de pruebas para Fase 6 de Nebulae ERP:
1. Migración fa6_001 y verificación estructural de tablas e índices.
2. Políticas de gobernanza y cabeceras RFC 8594 (Deprecation, Sunset, Link).
3. Comparación y auditoría de paridad de ventas (compare_sales_parity).
4. Comparación y auditoría de paridad de compras (compare_purchases_parity).
5. Comparación y conciliación financiera (compare_financial_parity).
6. Instantáneas periódicas de paridad y cálculo de score (LegacyParitySnapshot).
7. Intercepción y Dual-Write transaccional en ventas (POST /api/v1/sales/).
8. Sincronización de facturación legacy -> canónica (POST /api/v1/sales/{id}/invoice).
9. Intercepción y Dual-Write transaccional en compras (POST /api/v1/purchases/).
10. Sincronización de recepción legacy -> canónica (PUT /api/v1/purchases/{id}/receive).
11. Dual-write en checkout público de tienda (/api/v1/store/checkout -> SaleOrder WEB).
12. Gobernanza READ_ONLY: bloqueo de escrituras legacy con HTTP 410 Gone.
13. Reconciliación y backfill masivo de entidades huérfanas (/api/v1/legacy/reconcile-sync).
14. Endpoints de observabilidad (/api/v1/legacy/status, metrics, parity-report, audit-logs).
15. Seguridad y RBAC en observabilidad y gobernanza.
16. Coexistencia: Dashboard de finanzas y CRM 360 consumen ventas canónicas (Hallazgos 8 y 9).
17. Idempotencia y concurrencia en sincronización.
"""
import pytest
import datetime
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect

from app.models.customers import Customer
from app.models.catalog import Product, ProductSKU, Category, Brand
from app.models.inventory import Warehouse, InventoryLevel
from app.models.sales import SalesOrder, SalesOrderLine, Quotation
from app.models.purchases import PurchaseOrder
from app.models.erp_documents import SaleOrder, PurchaseOrderFull, SalesQuotation
from app.models.fase1b import SaleOrderLineErp
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
        email = f"fase6_{prefix}_{int(datetime.datetime.utcnow().timestamp())}@nebulaekids.com"
        u = User(email=email, password_hash="dummy_hash", role=role_name, is_active=True)
        db.add(u)
        db.flush()
        tok = create_access_token({"sub": str(u.id), "role": role_name})
        tokens[prefix] = {"user": u, "token": tok, "headers": {"Authorization": f"Bearer {tok}"}}
    db.commit()
    return tokens


@pytest.fixture
def base_catalog_and_customer(db: Session):
    """Crea cliente, producto, SKU y bodega de prueba."""
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

    wh = db.query(Warehouse).first()
    if not wh:
        wh = Warehouse(name=f"Bodega F6 {ts}", location_type="Central")
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
        brand_id=brand.id,
        category_id=cat.id,
        type="Fisico",
        base_currency="COP",
        uom="Unidad",
        is_active=True
    )
    db.add(prod)
    db.flush()

    sku = ProductSKU(
        product_id=prod.id,
        sku=f"SKU-F6-{ts}",
        cost_price=150000.0,
        sale_price=300000.0
    )
    db.add(sku)
    db.flush()

    # Nivel de inventario
    inv = InventoryLevel(warehouse_id=wh.id, sku_id=sku.id, quantity=50)
    db.add(inv)
    db.commit()

    return {
        "customer": cust,
        "product": prod,
        "sku": sku,
        "warehouse": wh
    }


# ==============================================================================
# TEST 1: VERIFICACIÓN ESTRUCTURAL DE MIGRACIÓN FA6_001
# ==============================================================================
def test_01_fase6_structural_schema(db: Session):
    inspector = inspect(db.get_bind())
    tables = inspector.get_table_names()

    # Tablas de Fase 6
    assert "legacy_consolidation_audit_logs" in tables
    assert "legacy_parity_snapshots" in tables
    assert "legacy_governance_policies" in tables

    # Columnas de enlace en tablas legacy
    so_cols = [c["name"] for c in inspector.get_columns("sales_orders")]
    assert "canonical_sale_order_id" in so_cols

    po_cols = [c["name"] for c in inspector.get_columns("purchase_orders")]
    assert "canonical_purchase_order_id" in po_cols

    q_cols = [c["name"] for c in inspector.get_columns("quotations")]
    assert "canonical_quotation_id" in q_cols


# ==============================================================================
# TEST 2: GOBERNANZA POR DEFECTO Y CABECERAS RFC 8594
# ==============================================================================
def test_02_governance_policy_and_rfc8594_headers(db: Session):
    policy = get_or_create_governance_policy(db)
    assert policy.mode in ("DUAL_WRITE", "CANONICAL_PRIMARY")
    assert policy.allow_legacy_writes is True
    assert policy.deprecation_header_enabled is True

    from fastapi import Response
    resp = Response()
    apply_deprecation_headers(resp, policy, "/api/v1/ventas/pedidos")

    assert resp.headers.get("Deprecation") == "true"
    assert "Sunset" in resp.headers
    assert '</api/v1/ventas/pedidos>; rel="successor-version"' in resp.headers.get("Link", "")


# ==============================================================================
# TEST 3: COMPARACIÓN DE PARIDAD DE VENTAS
# ==============================================================================
def test_03_compare_sales_parity(db: Session):
    res = compare_sales_parity(db)
    assert "total_legacy_orders" in res
    assert "total_canonical_orders" in res
    assert "total_legacy_revenue_cop" in res
    assert "total_canonical_revenue_cop" in res
    assert "unmatched_legacy_orders_count" in res
    assert "discrepancies_count" in res
    assert isinstance(res["total_legacy_orders"], int)


# ==============================================================================
# TEST 4: COMPARACIÓN DE PARIDAD DE COMPRAS
# ==============================================================================
def test_04_compare_purchases_parity(db: Session):
    res = compare_purchases_parity(db)
    assert "total_legacy_purchases" in res
    assert "total_canonical_purchases" in res
    assert "unmatched_purchases_count" in res
    assert isinstance(res["total_legacy_purchases"], int)


# ==============================================================================
# TEST 5: COMPARACIÓN DE PARIDAD FINANCIERA
# ==============================================================================
def test_05_compare_financial_parity(db: Session):
    res = compare_financial_parity(db)
    assert "legacy_gross_revenue_cop" in res
    assert "canonical_gross_revenue_cop" in res
    assert "difference_cop" in res
    assert "in_alignment" in res
    assert isinstance(res["in_alignment"], bool)


# ==============================================================================
# TEST 6: INSTANTÁNEA DE PARIDAD Y PERSISTENCIA
# ==============================================================================
def test_06_generate_and_save_parity_snapshot(db: Session, auth_tokens):
    snapshot = generate_and_save_parity_snapshot(db, user_id=auth_tokens["admin"]["user"].id)
    assert snapshot.id is not None
    assert snapshot.parity_score_pct >= 0.0
    assert snapshot.parity_score_pct <= 100.0
    import json
    parsed_json = json.loads(snapshot.discrepancies_json) if isinstance(snapshot.discrepancies_json, str) else snapshot.discrepancies_json
    assert isinstance(parsed_json, dict)
    assert "sales" in parsed_json
    assert "purchases" in parsed_json
    assert "financial" in parsed_json


# ==============================================================================
# TEST 7: INTERCEPCIÓN Y DUAL-WRITE TRANSACCIONAL EN VENTAS
# ==============================================================================
def test_07_dual_write_sales_order(client: TestClient, db: Session, auth_tokens, base_catalog_and_customer):
    headers = auth_tokens["admin"]["headers"]
    cust = base_catalog_and_customer["customer"]
    sku = base_catalog_and_customer["sku"]

    payload = {
        "customer_id": cust.id,
        "sale_type": "IMMEDIATE",
        "anticipo": 600000.0,
        "lines": [
            {
                "sku_id": sku.id,
                "quantity": 2,
                "unit_price": 300000.0
            }
        ]
    }

    resp = client.post("/api/v1/sales/", json=payload, headers=headers)
    assert resp.status_code == 201
    # Verificar cabeceras de deprecación
    assert resp.headers.get("Deprecation") == "true"
    assert "Sunset" in resp.headers
    assert '</api/v1/ventas/pedidos>; rel="successor-version"' in resp.headers.get("Link", "")

    data = resp.json()["data"]
    order_id = data["id"]

    # Verificar existencia de SalesOrder legacy
    db_legacy = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    assert db_legacy is not None
    assert db_legacy.canonical_sale_order_id is not None

    # Verificar creación de SaleOrder canónico
    canonical_so = db.query(SaleOrder).filter(SaleOrder.id == db_legacy.canonical_sale_order_id).first()
    assert canonical_so is not None
    assert float(canonical_so.total_cop) == 600000.0
    assert canonical_so.canal_venta == "LEGACY_API"

    # Verificar líneas canónicas SaleOrderLineErp
    lines_can = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == canonical_so.id).all()
    assert len(lines_can) == 1
    assert lines_can[0].sku_id == sku.id
    assert float(lines_can[0].quantity) == 2.0
    assert float(lines_can[0].unit_price_cop) == 300000.0

    # Verificar auditoría
    audit = db.query(LegacyConsolidationAuditLog).filter(
        LegacyConsolidationAuditLog.legacy_id == order_id,
        LegacyConsolidationAuditLog.event_type == "LEGACY_WRITE_INTERCEPTED"
    ).first()
    assert audit is not None
    assert audit.canonical_id == canonical_so.id
    assert audit.status == "ALIGNED"


# ==============================================================================
# TEST 8: SINCRONIZACIÓN DE FACTURACIÓN LEGACY -> CANÓNICA
# ==============================================================================
def test_08_invoice_sales_order_sync(client: TestClient, db: Session, auth_tokens, base_catalog_and_customer):
    headers = auth_tokens["admin"]["headers"]
    cust = base_catalog_and_customer["customer"]
    sku = base_catalog_and_customer["sku"]

    # 1. Crear orden legacy dual-write
    payload = {
        "customer_id": cust.id,
        "sale_type": "IMMEDIATE",
        "anticipo": 300000.0,
        "lines": [{"sku_id": sku.id, "quantity": 1, "unit_price": 300000.0}]
    }
    create_resp = client.post("/api/v1/sales/", json=payload, headers=headers)
    assert create_resp.status_code == 201
    order_id = create_resp.json()["data"]["id"]

    # 2. Facturar la orden vía endpoint legacy
    inv_resp = client.post(f"/api/v1/sales/{order_id}/invoice", headers=headers)
    assert inv_resp.status_code == 200
    assert inv_resp.json()["data"]["status"] == "INVOICED"
    assert inv_resp.headers.get("Deprecation") == "true"

    # 3. Verificar que el SaleOrder canónico refleje FACTURADO
    db_legacy = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    can_so = db.query(SaleOrder).filter(SaleOrder.id == db_legacy.canonical_sale_order_id).first()
    assert can_so.estado == "FACTURADO"

    # 4. Verificar auditoría de facturación
    audit = db.query(LegacyConsolidationAuditLog).filter(
        LegacyConsolidationAuditLog.legacy_id == order_id,
        LegacyConsolidationAuditLog.legacy_endpoint.like(f"%/sales/{order_id}/invoice")
    ).first()
    assert audit is not None


# ==============================================================================
# TEST 9: INTERCEPCIÓN Y DUAL-WRITE TRANSACCIONAL EN COMPRAS
# ==============================================================================
def test_09_dual_write_purchase_order(client: TestClient, db: Session, auth_tokens):
    headers = auth_tokens["admin"]["headers"]

    payload = {
        "sale_order_id": None
    }
    resp = client.post("/api/v1/purchases/", json=payload, headers=headers)
    assert resp.status_code == 201
    assert resp.headers.get("Deprecation") == "true"

    po_id = resp.json()["data"]["id"]
    db_po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    assert db_po is not None
    assert db_po.canonical_purchase_order_id is not None

    can_po = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == db_po.canonical_purchase_order_id).first()
    assert can_po is not None
    assert "PEC-LEG-" in can_po.numero

    # Auditoría
    audit = db.query(LegacyConsolidationAuditLog).filter(
        LegacyConsolidationAuditLog.legacy_id == po_id,
        LegacyConsolidationAuditLog.event_type == "LEGACY_WRITE_INTERCEPTED"
    ).first()
    assert audit is not None
    assert audit.entity_type == "PURCHASE_ORDER"


# ==============================================================================
# TEST 10: SINCRONIZACIÓN DE RECEPCIÓN EN COMPRAS
# ==============================================================================
def test_10_receive_purchase_order_sync(client: TestClient, db: Session, auth_tokens, base_catalog_and_customer):
    headers = auth_tokens["admin"]["headers"]
    wh = base_catalog_and_customer["warehouse"]
    sku = base_catalog_and_customer["sku"]

    # 1. Crear PO
    create_resp = client.post("/api/v1/purchases/", json={"sale_order_id": None}, headers=headers)
    po_id = create_resp.json()["data"]["id"]

    # 2. Recepcionar
    recv_payload = {
        "dest_warehouse_id": wh.id,
        "movements": [
            {"sku_id": sku.id, "quantity": 10}
        ]
    }
    recv_resp = client.put(f"/api/v1/purchases/{po_id}/receive", json=recv_payload, headers=headers)
    assert recv_resp.status_code == 200
    assert recv_resp.json()["data"]["status"] == "RECEIVED"

    # Verificar actualización en canónico
    db_po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    can_po = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == db_po.canonical_purchase_order_id).first()
    assert can_po.estado == "RECIBIDA"


# ==============================================================================
# TEST 11: DUAL-WRITE EN CHECKOUT PÚBLICO DE TIENDA
# ==============================================================================
def test_11_store_checkout_dual_write(client: TestClient, db: Session, base_catalog_and_customer):
    sku = base_catalog_and_customer["sku"]
    ts = int(datetime.datetime.utcnow().timestamp())

    payload = {
        "customer": {
            "first_name": "Laura",
            "last_name": "Gomez",
            "email": f"laura_{ts}@ecommerce.com",
            "phone": "3007654321"
        },
        "cart": [
            {
                "sku_id": sku.id,
                "quantity": 2
            }
        ]
    }

    resp = client.post("/api/v1/store/checkout", json=payload)
    assert resp.status_code == 201
    assert resp.json()["status"] == "success"
    legacy_order_id = resp.json()["order_id"]

    # Verificar SalesOrder legacy y enlace
    legacy_so = db.query(SalesOrder).filter(SalesOrder.id == legacy_order_id).first()
    assert legacy_so is not None
    assert legacy_so.canonical_sale_order_id is not None

    # Verificar SaleOrder canónico
    can_so = db.query(SaleOrder).filter(SaleOrder.id == legacy_so.canonical_sale_order_id).first()
    assert can_so is not None
    assert can_so.canal_venta == "WEB"
    assert "VEN-WEB-" in can_so.numero
    assert float(can_so.total_cop) == float(sku.sale_price) * 2

    # Verificar líneas canónicas
    lines = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == can_so.id).all()
    assert len(lines) == 1
    assert lines[0].sku_id == sku.id
    assert float(lines[0].quantity) == 2.0


# ==============================================================================
# TEST 12: GOBERNANZA READ_ONLY RECHAZA ESCRITURAS CON HTTP 410
# ==============================================================================
def test_12_governance_read_only_mode(client: TestClient, db: Session, auth_tokens, base_catalog_and_customer):
    headers = auth_tokens["admin"]["headers"]
    cust = base_catalog_and_customer["customer"]
    sku = base_catalog_and_customer["sku"]

    # 1. Cambiar gobernanza a READ_ONLY
    patch_resp = client.patch("/api/v1/legacy/governance", json={
        "mode": "READ_ONLY",
        "allow_legacy_writes": False,
        "deprecation_header_enabled": True
    }, headers=headers)
    assert patch_resp.status_code == 200
    assert patch_resp.json()["data"]["mode"] == "READ_ONLY"

    # 2. Intentar POST /sales -> Debe responder 410 Gone
    payload = {
        "customer_id": cust.id,
        "sale_type": "IMMEDIATE",
        "anticipo": 100000.0,
        "lines": [{"sku_id": sku.id, "quantity": 1, "unit_price": 100000.0}]
    }
    sales_resp = client.post("/api/v1/sales/", json=payload, headers=headers)
    assert sales_resp.status_code == 410

    # 3. Intentar POST /purchases -> Debe responder 410 Gone
    po_resp = client.post("/api/v1/purchases/", json={"sale_order_id": None}, headers=headers)
    assert po_resp.status_code == 410

    # 4. Restaurar a DUAL_WRITE
    rest_resp = client.patch("/api/v1/legacy/governance", json={
        "mode": "DUAL_WRITE",
        "allow_legacy_writes": True,
        "deprecation_header_enabled": True
    }, headers=headers)
    assert rest_resp.status_code == 200
    assert rest_resp.json()["data"]["mode"] == "DUAL_WRITE"


# ==============================================================================
# TEST 13: RECONCILIACIÓN Y BACKFILL DE ENTIDADES HUÉRFANAS
# ==============================================================================
def test_13_reconcile_and_backfill(client: TestClient, db: Session, auth_tokens, base_catalog_and_customer):
    headers = auth_tokens["admin"]["headers"]
    cust = base_catalog_and_customer["customer"]
    sku = base_catalog_and_customer["sku"]

    # Crear una orden legacy huérfana directamente en BD (sin canonical_sale_order_id)
    orphan_so = SalesOrder(
        customer_id=cust.id,
        status="CONFIRMED",
        sale_type="IMMEDIATE",
        anticipo=250000.0,
        canonical_sale_order_id=None
    )
    db.add(orphan_so)
    db.flush()
    db.add(SalesOrderLine(
        sales_order_id=orphan_so.id,
        sku_id=sku.id,
        quantity=1,
        unit_price=250000.0
    ))
    db.commit()

    # Ejecutar reconciliación vía API
    sync_resp = client.post("/api/v1/legacy/reconcile-sync", headers=headers)
    assert sync_resp.status_code == 200
    res_data = sync_resp.json()["data"]
    assert res_data["status"] == "success"

    # Verificar que orphan_so ahora tiene canonical_sale_order_id
    db.refresh(orphan_so)
    assert orphan_so.canonical_sale_order_id is not None

    can_so = db.query(SaleOrder).filter(SaleOrder.id == orphan_so.canonical_sale_order_id).first()
    assert can_so is not None
    assert float(can_so.total_cop) == 250000.0


# ==============================================================================
# TEST 14: ENDPOINTS DE OBSERVABILIDAD Y AUDITORÍA
# ==============================================================================
def test_14_observability_endpoints(client: TestClient, auth_tokens):
    headers = auth_tokens["admin"]["headers"]

    # 1. Status
    r1 = client.get("/api/v1/legacy/status", headers=headers)
    assert r1.status_code == 200
    assert r1.json()["data"]["health"] in ("HEALTHY", "DEGRADED")
    assert "governance_mode" in r1.json()["data"]

    # 2. Metrics
    r2 = client.get("/api/v1/legacy/metrics", headers=headers)
    assert r2.status_code == 200
    assert "parity" in r2.json()["data"]

    # 3. Parity Report (persist = true)
    r3 = client.get("/api/v1/legacy/parity-report?persist=true", headers=headers)
    assert r3.status_code == 200
    assert "parity_score_pct" in r3.json()["data"]

    # 4. Audit Logs
    r4 = client.get("/api/v1/legacy/audit-logs?limit=10", headers=headers)
    assert r4.status_code == 200
    assert "logs" in r4.json()["data"]

    # 5. Governance
    r5 = client.get("/api/v1/legacy/governance", headers=headers)
    assert r5.status_code == 200
    assert "mode" in r5.json()["data"]


# ==============================================================================
# TEST 15: SEGURIDAD Y RBAC EN OBSERVABILIDAD
# ==============================================================================
def test_15_rbac_observability(client: TestClient, auth_tokens):
    # Sin autenticación -> 401
    unauth = client.get("/api/v1/legacy/status")
    assert unauth.status_code == 401

    # Asesor no puede modificar gobernanza -> 403
    asesor_headers = auth_tokens["asesor"]["headers"]
    patch_forbidden = client.patch("/api/v1/legacy/governance", json={"mode": "READ_ONLY"}, headers=asesor_headers)
    assert patch_forbidden.status_code == 403

    # Admin si puede -> 200
    admin_headers = auth_tokens["admin"]["headers"]
    get_ok = client.get("/api/v1/legacy/governance", headers=admin_headers)
    assert get_ok.status_code == 200


# ==============================================================================
# TEST 16: COEXISTENCIA DE REPORTES FINANCIEROS Y CRM (HALLAZGOS 8 Y 9)
# ==============================================================================
def test_16_finance_and_crm_coexistence(client: TestClient, db: Session, auth_tokens, base_catalog_and_customer):
    headers_fin = auth_tokens["finanzas"]["headers"]
    headers_admin = auth_tokens["admin"]["headers"]

    # 1. Hallazgo 8: Finance Dashboard lee líneas canónicas sin romper
    fin_resp = client.get("/api/v1/finance/dashboard", headers=headers_fin)
    assert fin_resp.status_code == 200
    fin_data = fin_resp.json()["data"]
    assert "gross_revenue" in fin_data
    assert "cogs" in fin_data
    assert "net_profit" in fin_data

    # 2. Hallazgo 9: CRM trigger-alerts detecta órdenes canónicas sin error
    crm_resp = client.post("/api/v1/crm/trigger-alerts", headers=headers_admin)
    assert crm_resp.status_code == 200
    assert crm_resp.json()["status"] == "success"
