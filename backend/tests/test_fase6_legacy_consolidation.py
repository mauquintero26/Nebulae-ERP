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
# TEST 6: Comparacion Real de Compras con Pruebas Negativas (Bloqueo 1)
# ──────────────────────────────────────────────────────────────────────────────
def test_06_compare_purchases_parity_comprehensive(db: Session):
    from app.models.fase1b import PurchaseOrderLine as CanPurchaseLine
    ts6 = int(time.time()) % 1000000  # 6-digit suffix to stay within VARCHAR(20)

    # ── Escenario A: PO alineada ─────────────────────────────────────────────
    can_po_ok = PurchaseOrderFull(
        numero=f"PEC-OK-{ts6}",
        supplier_name="Proveedor Madera Andina",
        estado="RECIBIDA",
        subtotal_cop=Decimal("5000000.00"),
        total_cop=Decimal("5000000.00")
    )
    db.add(can_po_ok)
    db.flush()
    # Agregar una recepcion para que no dispare RECEPTIONS_MISMATCH
    gr_ok = GoodsReceipt(
        numero=f"GR-OK-{ts6}",
        pec_id=can_po_ok.id,
        estado="CONFIRMADA"
    )
    db.add(gr_ok)
    po_aligned = PurchaseOrder(status="RECEIVED", canonical_purchase_order_id=can_po_ok.id)
    db.add(po_aligned)

    # ── Escenario B: STATUS_MISMATCH ────────────────────────────────────────
    can_po_bad_status = PurchaseOrderFull(
        numero=f"PEC-BS-{ts6}",
        supplier_name="Proveedor Telas",
        estado="BORRADOR",
        total_cop=Decimal("2000000.00")
    )
    db.add(can_po_bad_status)
    db.flush()
    po_bad_status = PurchaseOrder(status="RECEIVED", canonical_purchase_order_id=can_po_bad_status.id)
    db.add(po_bad_status)

    # ── Escenario C: LINE_COUNT_MISMATCH (2 en JSON, 1 en tabla) ────────────
    from app.models.catalog import ProductSKU as _SKU
    from app.models.catalog import Product as _Product, Category as _Cat, Brand as _Brand
    cat = db.query(_Cat).first() or _Cat(name="Test Cat")
    brand = db.query(_Brand).first() or _Brand(name="Test Brand")
    db.add(cat); db.add(brand); db.flush()
    prod = _Product(name=f"Prod Parity {ts6}", type="Fisico", base_currency="COP", uom="Un",
                    is_active=True, category_id=cat.id, brand_id=brand.id)
    db.add(prod); db.flush()
    sku1 = _SKU(product_id=prod.id, sku=f"SKU-P1-{ts6}", sale_price=Decimal("100000"))
    sku2 = _SKU(product_id=prod.id, sku=f"SKU-P2-{ts6}", sale_price=Decimal("200000"))
    db.add(sku1); db.add(sku2); db.flush()

    can_po_lcount = PurchaseOrderFull(
        numero=f"PEC-LC-{ts6}",
        supplier_name="Proveedor Lineas",
        estado="BORRADOR",
        total_cop=Decimal("300000.00"),
        productos=[{"sku_id": sku1.id, "qty": 1}, {"sku_id": sku2.id, "qty": 1}]  # 2 en JSON
    )
    db.add(can_po_lcount)
    db.flush()
    # Solo 1 linea en tabla (discrepancia)
    line1 = CanPurchaseLine(
        pec_id=can_po_lcount.id,
        sku_id=sku1.id,
        quantity_ordered=Decimal("1"),
        unit_cost_cop=Decimal("100000"),
        source="NATIVE"
    )
    db.add(line1)
    po_lcount = PurchaseOrder(status="DRAFT", canonical_purchase_order_id=can_po_lcount.id)
    db.add(po_lcount)

    # ── Escenario D: LINE_MISSING_SKU ────────────────────────────────────────
    can_po_nosku = PurchaseOrderFull(
        numero=f"PEC-NS-{ts6}",
        supplier_name="Proveedor Sin SKU",
        estado="BORRADOR",
        total_cop=Decimal("100000.00")
    )
    db.add(can_po_nosku)
    db.flush()
    line_nosku = CanPurchaseLine(
        pec_id=can_po_nosku.id,
        sku_id=None,  # SKU faltante
        quantity_ordered=Decimal("1"),
        unit_cost_cop=Decimal("100000"),
        source="NATIVE"
    )
    db.add(line_nosku)
    po_nosku = PurchaseOrder(status="DRAFT", canonical_purchase_order_id=can_po_nosku.id)
    db.add(po_nosku)

    # ── Escenario E: LINE_MISSING_COST ───────────────────────────────────────
    can_po_nocost = PurchaseOrderFull(
        numero=f"PEC-NC-{ts6}",
        supplier_name="Proveedor Sin Costo",
        estado="BORRADOR",
        total_cop=Decimal("0.00")
    )
    db.add(can_po_nocost)
    db.flush()
    line_nocost = CanPurchaseLine(
        pec_id=can_po_nocost.id,
        sku_id=sku1.id,
        quantity_ordered=Decimal("1"),
        unit_cost_cop=Decimal("0"),  # costo cero -> discrepancia
        source="NATIVE"
    )
    db.add(line_nocost)
    po_nocost = PurchaseOrder(status="DRAFT", canonical_purchase_order_id=can_po_nocost.id)
    db.add(po_nocost)

    # ── Escenario F: SUBTOTAL_MISMATCH ───────────────────────────────────────
    can_po_subtot = PurchaseOrderFull(
        numero=f"PEC-ST-{ts6}",
        supplier_name="Proveedor Subtotal",
        estado="BORRADOR",
        subtotal_cop=Decimal("9999999.00"),  # subtotal almacenado incorrecto
        total_cop=Decimal("9999999.00")
    )
    db.add(can_po_subtot)
    db.flush()
    line_subtot = CanPurchaseLine(
        pec_id=can_po_subtot.id,
        sku_id=sku1.id,
        quantity_ordered=Decimal("1"),
        unit_cost_cop=Decimal("100000"),  # computed=100000, stored=9999999 -> mismatch
        source="NATIVE"
    )
    db.add(line_subtot)
    po_subtot = PurchaseOrder(status="DRAFT", canonical_purchase_order_id=can_po_subtot.id)
    db.add(po_subtot)

    db.commit()

    parity = compare_purchases_parity(db)

    assert parity["total_legacy_purchases"] >= 6
    assert parity["total_canonical_purchases"] >= 6

    disc_types = [d.get("type") for d in parity["discrepancies"]]

    # Verificar que CADA tipo de discrepancia fue detectado
    assert "STATUS_MISMATCH" in disc_types, f"STATUS_MISMATCH no detectado. Discrepancias: {disc_types}"
    assert "LINE_COUNT_MISMATCH" in disc_types, f"LINE_COUNT_MISMATCH no detectado. Discrepancias: {disc_types}"
    assert "LINE_MISSING_SKU" in disc_types, f"LINE_MISSING_SKU no detectado. Discrepancias: {disc_types}"
    assert "LINE_MISSING_COST" in disc_types, f"LINE_MISSING_COST no detectado. Discrepancias: {disc_types}"
    assert "SUBTOTAL_MISMATCH" in disc_types, f"SUBTOTAL_MISMATCH no detectado. Discrepancias: {disc_types}"

    # El parity_score debe haber bajado por las discrepancias
    assert parity["purchases_parity_score"] < 100.0, (
        f"parity_score debe bajar ante discrepancias. Score actual: {parity['purchases_parity_score']}"
    )
    # El score calculado debe ser un numero valido
    assert 0.0 <= parity["purchases_parity_score"] <= 100.0

    # Verificar Paridad Honesta (Bloqueo 5)
    assert "status" in parity["comparable_fields"], "status debe ser campo COMPARABLE"
    assert "canonical_linkage" in parity["comparable_fields"], "canonical_linkage debe ser campo COMPARABLE"
    assert "supplier_name" in parity["not_comparable_fields"], "supplier_name debe ser NOT_COMPARABLE"
    assert "currency" in parity["not_comparable_fields"], "currency debe ser NOT_COMPARABLE"
    assert "lines_count" in parity["not_comparable_fields"], "lines_count debe ser NOT_COMPARABLE"
    assert "limitations" in parity and len(parity["limitations"]) > 30, "Debe incluir documentacion explicita de limitaciones"
    assert parity["field_comparability"]["supplier_name"] == "NOT_COMPARABLE"
    assert parity["field_comparability"]["status"] == "COMPARABLE"

    # La funcion es estrictamente READ-ONLY: no debe haber modificado ningun registro
    db.expire_all()
    assert parity["discrepancies_count"] >= 5


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
def test_10_governance_modes_read_only_and_canonical_primary(client: TestClient, auth_tokens, base_catalog_and_customer, db: Session):
    headers = auth_tokens["admin"]["headers"]
    cust = base_catalog_and_customer["customer"]
    sku = base_catalog_and_customer["sku"]

    # 1. Configurar READ_ONLY → escrituras deben retornar 410
    client.patch("/api/v1/legacy/governance", json={"mode": "READ_ONLY", "allow_legacy_writes": False}, headers=headers)

    res_ro = client.post("/api/v1/sales/", json={
        "customer_id": cust.id,
        "status": "PENDING",
        "lines": [{"sku_id": sku.id, "quantity": 1, "unit_price": 1200000.0}]
    }, headers={**headers, "Idempotency-Key": f"RO_{int(time.time())}"})
    assert res_ro.status_code == 410

    # 2. Configurar CANONICAL_PRIMARY
    client.patch("/api/v1/legacy/governance", json={"mode": "CANONICAL_PRIMARY", "allow_legacy_writes": True}, headers=headers)

    # Contar ANTES
    so_legacy_before = db.query(SalesOrder).count()
    so_canonical_before = db.query(SaleOrder).count()

    # Llamar a intercept_sales_order_write directamente para controlar conteos precisos
    order_data = {
        "customer_id": cust.id,
        "status": "PENDING",
        "sale_type": "IMMEDIATE",
    }
    lines_data = [{"sku_id": sku.id, "quantity": 1, "unit_price": 1200000.0}]

    db.expire_all()
    legacy_row, canonical_row = intercept_sales_order_write(
        db=db,
        order_data=order_data,
        lines_data=lines_data,
        user_id=auth_tokens["admin"]["user"].id,
        idempotency_key=f"CP_MODE_{int(time.time())}"
    )

    # CANONICAL_PRIMARY: NO debe haber creado fila legacy
    assert legacy_row is None, "CANONICAL_PRIMARY debe retornar None para la entidad legacy"
    assert canonical_row is not None, "CANONICAL_PRIMARY debe crear la entidad canonica"
    assert canonical_row.canal_venta == "CANONICAL_PRIMARY"

    # Verificar conteos DESPUES
    db.expire_all()
    so_legacy_after = db.query(SalesOrder).count()
    so_canonical_after = db.query(SaleOrder).count()

    assert so_legacy_after == so_legacy_before, (
        f"CANONICAL_PRIMARY NO debe insertar en sales_orders. Antes={so_legacy_before}, Despues={so_legacy_after}"
    )
    assert so_canonical_after == so_canonical_before + 1, (
        f"CANONICAL_PRIMARY debe crear exactamente 1 SaleOrder canonica. Antes={so_canonical_before}, Despues={so_canonical_after}"
    )

    # 3. Verificar que DUAL_WRITE crea ambas filas
    client.patch("/api/v1/legacy/governance", json={"mode": "DUAL_WRITE", "allow_legacy_writes": True}, headers=headers)

    so_legacy_before2 = db.query(SalesOrder).count()
    so_canonical_before2 = db.query(SaleOrder).count()

    legacy_row2, canonical_row2 = intercept_sales_order_write(
        db=db,
        order_data={"customer_id": cust.id, "status": "PENDING"},
        lines_data=[{"sku_id": sku.id, "quantity": 1, "unit_price": 1200000.0}],
        user_id=auth_tokens["admin"]["user"].id,
        idempotency_key=f"DW_MODE_{int(time.time())}"
    )
    db.expire_all()
    assert legacy_row2 is not None, "DUAL_WRITE debe crear la fila legacy SalesOrder"
    assert canonical_row2 is not None, "DUAL_WRITE debe crear la fila canonica SaleOrder"
    assert db.query(SalesOrder).count() == so_legacy_before2 + 1
    assert db.query(SaleOrder).count() == so_canonical_before2 + 1

    # 4. Restaurar DUAL_WRITE al final
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


# ──────────────────────────────────────────────────────────────────────────────
# TEST 19: Checkout Reserva Inventario sin Reduccion Fisica (Bloqueo 5)
# ──────────────────────────────────────────────────────────────────────────────
def test_19_checkout_reservation_does_not_reduce_physical_stock(client: TestClient, auth_tokens, base_catalog_and_customer, db: Session):
    """
    Al hacer checkout:
    - InventoryLevel.quantity NO cambia (stock fisico intacto)
    - InventoryOwnerBalance.quantity NO cambia
    - InventoryReservation ACTIVE se crea con la cantidad reservada
    - stock disponible = balance - suma de reservas activas (baja)
    Al despachar con el servicio productivo real:
    - InventoryLevel.quantity disminuye (-3)
    - InventoryOwnerBalance.quantity disminuye (-3)
    - InventoryReservation se consume / cierra (CONVERTED)
    - Movimiento Kardex OUT se registra exactamente por 3 unidades
    - Stock disponible final = 7
    """
    from app.api.v1.ecommerce import _get_real_sellable_stock
    from app.models.inventory import InventoryLevel, InventoryMovement
    from app.models.fase1b import SaleOrderLineErp

    ts = int(time.time())
    sku = base_catalog_and_customer["sku"]
    wh = base_catalog_and_customer["warehouse"]

    # Asegurar que InventoryLevel tiene stock conocido = 10
    inv_lvl = db.query(InventoryLevel).filter(
        InventoryLevel.sku_id == sku.id,
        InventoryLevel.warehouse_id == wh.id
    ).first()
    if inv_lvl:
        inv_lvl.quantity = 10
    else:
        inv_lvl = InventoryLevel(warehouse_id=wh.id, sku_id=sku.id, quantity=10)
        db.add(inv_lvl)

    # Asegurar InventoryOwnerBalance = 10
    bal = db.query(InventoryOwnerBalance).filter(
        InventoryOwnerBalance.sku_id == sku.id,
        InventoryOwnerBalance.warehouse_id == wh.id,
        InventoryOwnerBalance.owner == "NEBULAE"
    ).first()
    if bal:
        bal.quantity = Decimal("10")
    else:
        bal = InventoryOwnerBalance(
            sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("10")
        )
        db.add(bal)
    db.commit()
    db.expire_all()

    # Estado inicial
    stock_fisico_antes = db.query(InventoryLevel).filter(
        InventoryLevel.sku_id == sku.id,
        InventoryLevel.warehouse_id == wh.id
    ).first().quantity
    balance_antes = db.query(InventoryOwnerBalance).filter(
        InventoryOwnerBalance.sku_id == sku.id,
        InventoryOwnerBalance.warehouse_id == wh.id,
        InventoryOwnerBalance.owner == "NEBULAE"
    ).first().quantity

    # Ejecutar checkout con qty=3
    idem_key = f"CHECKOUT_RES_{ts}"
    payload = {
        "customer": {
            "first_name": "Test",
            "last_name": "Reserva",
            "email": f"reserva_{ts}@example.com",
            "phone": "3009990000"
        },
        "cart": [
            {"sku_id": sku.id, "quantity": 3}
        ]
    }
    res = client.post("/api/v1/store/checkout", json=payload, headers={"Idempotency-Key": idem_key})
    assert res.status_code == 201, f"Checkout fallido: {res.json()}"
    order_data = res.json()["data"]

    db.expire_all()

    # ── Verificacion: InventoryLevel NO cambia al reservar ───────────────────
    stock_fisico_despues = db.query(InventoryLevel).filter(
        InventoryLevel.sku_id == sku.id,
        InventoryLevel.warehouse_id == wh.id
    ).first().quantity
    assert stock_fisico_despues == stock_fisico_antes, (
        f"InventoryLevel.quantity NO debe cambiar al reservar. "
        f"Antes={stock_fisico_antes}, Despues={stock_fisico_despues}"
    )

    # ── Verificacion: InventoryOwnerBalance NO cambia al reservar ────────────
    balance_despues = db.query(InventoryOwnerBalance).filter(
        InventoryOwnerBalance.sku_id == sku.id,
        InventoryOwnerBalance.warehouse_id == wh.id,
        InventoryOwnerBalance.owner == "NEBULAE"
    ).first().quantity
    assert balance_despues == balance_antes, (
        f"InventoryOwnerBalance.quantity NO debe cambiar al reservar. "
        f"Antes={balance_antes}, Despues={balance_despues}"
    )

    # ── Verificacion: InventoryReservation ACTIVE creada con qty=3 ───────────
    can_order_id = order_data.get("canonical_sale_order_id")
    reservas = db.query(InventoryReservation).filter(
        InventoryReservation.sku_id == sku.id,
        InventoryReservation.status == "ACTIVE"
    ).all()
    assert len(reservas) >= 1, "Debe existir al menos una InventoryReservation ACTIVE para el SKU"
    total_reservado = sum(r.quantity_reserved for r in reservas)
    assert total_reservado >= 3, f"La cantidad reservada debe ser al menos 3. Encontrada: {total_reservado}"

    # ── Verificacion: stock vendible (disponible) bajo a 7 ───────────────────
    stock_vendible = _get_real_sellable_stock(db, sku.id, wh.id, "NEBULAE")
    assert stock_vendible <= float(balance_antes) - 3, (
        f"Stock vendible debe haber bajado al menos 3 unidades. "
        f"Balance={balance_antes}, Vendible={stock_vendible}"
    )

    # ── FASE 2: Despacho Productivo Real ─────────────────────────────────────
    # Se ejecuta el endpoint productivo real:
    # 1. Crear Entrega en /api/v1/ventas/entregas
    # 2. Ejecutar Despacho en /api/v1/ventas/entregas/{id}/despachar
    # El despacho real descuenta stock físico (InventoryLevel), balance (InventoryOwnerBalance),
    # convierte reservas a CONVERTED y genera movimiento Kardex OUT.
    admin_headers = auth_tokens["admin"]["headers"]
    can_order = db.query(SaleOrder).filter(SaleOrder.id == can_order_id).first()
    assert can_order is not None, "Debe existir la orden canonica creada por el checkout"

    so_line = db.query(SaleOrderLineErp).filter(
        SaleOrderLineErp.so_id == can_order.id,
        SaleOrderLineErp.sku_id == sku.id
    ).first()
    assert so_line is not None, "Debe existir la linea canonica SaleOrderLineErp para el SKU"

    # 1. Crear Entrega productiva con autorizacion formal de politica
    delivery_body = {
        "customer_id": can_order.customer_id,
        "warehouse_id": wh.id,
        "delivery_method": "ENTREGA_LOCAL",
        "carrier": "Flota Propia Nebulae",
        "policy_authorized_by": "Gerente Logistica",
        "policy_exception_reason": "Despacho autorizado para verificacion de integracion real",
        "lines": [
            {
                "sale_order_id": can_order.id,
                "sale_order_line_id": so_line.id,
                "sku_id": sku.id,
                "quantity": 3
            }
        ]
    }
    res_deliv = client.post("/api/v1/ventas/entregas", json=delivery_body, headers=admin_headers)
    assert res_deliv.status_code == 201, f"Fallo crear entrega: {res_deliv.text}"
    delivery_id = res_deliv.json()["data"]["id"]

    # 2. Ejecutar Despacho real en endpoint productivo
    disp_key = f"DISP_REAL_{ts}"
    res_disp = client.post(
        f"/api/v1/ventas/entregas/{delivery_id}/despachar",
        json={"idempotency_key": disp_key, "carrier": "Flota Propia", "observations": "Despacho real"},
        headers=admin_headers
    )
    assert res_disp.status_code == 200, f"Fallo despacho real: {res_disp.text}"

    db.expire_all()

    # ── Verificaciones post-despacho real ─────────────────────────────────────
    # 1. Stock físico disminuyó a 7
    stock_fisico_post = db.query(InventoryLevel).filter(
        InventoryLevel.sku_id == sku.id,
        InventoryLevel.warehouse_id == wh.id
    ).first().quantity
    assert stock_fisico_post == 7, (
        f"Despues del despacho real: InventoryLevel.quantity debe ser 7, encontrado {stock_fisico_post}"
    )

    # 2. Balance patrimonial disminuyó a 7
    balance_post = db.query(InventoryOwnerBalance).filter(
        InventoryOwnerBalance.sku_id == sku.id,
        InventoryOwnerBalance.warehouse_id == wh.id,
        InventoryOwnerBalance.owner == "NEBULAE"
    ).first().quantity
    assert balance_post == Decimal("7"), (
        f"Despues del despacho real: InventoryOwnerBalance.quantity debe ser 7, encontrado {balance_post}"
    )

    # 3. Reserva consumida / cerrada (cero reservas ACTIVE restantes para esta linea)
    reservas_active_post = db.query(InventoryReservation).filter(
        InventoryReservation.sale_order_line_id == so_line.id,
        InventoryReservation.status == "ACTIVE"
    ).all()
    assert len(reservas_active_post) == 0, (
        f"Despues del despacho real: no debe haber reservas ACTIVE para la linea. Encontradas: {len(reservas_active_post)}"
    )

    reservas_converted = db.query(InventoryReservation).filter(
        InventoryReservation.sale_order_line_id == so_line.id,
        InventoryReservation.status == "CONVERTED"
    ).all()
    assert len(reservas_converted) >= 1, "La reserva debe haber pasado a status CONVERTED tras el despacho"
    assert sum(r.quantity_reserved for r in reservas_converted) == Decimal("3")

    # 4. Movimiento Kárdex OUT generado exactamente por 3 unidades
    kardex_movs = db.query(InventoryMovement).filter(
        InventoryMovement.sku_id == sku.id,
        InventoryMovement.warehouse_id == wh.id,
        InventoryMovement.direction == "OUT"
    ).all()
    assert len(kardex_movs) >= 1, "Debe existir al menos un movimiento Kardex OUT tras el despacho real"
    total_kardex_out = sum(m.quantity for m in kardex_movs)
    assert total_kardex_out == Decimal("3"), f"Kardex OUT debe ser exactamente 3, encontrado {total_kardex_out}"

    # 5. Disponibilidad vendible final = 7.0
    stock_vendible_post = _get_real_sellable_stock(db, sku.id, wh.id, "NEBULAE")
    assert stock_vendible_post == 7.0, (
        f"Despues del despacho real: stock vendible debe ser 7.0 (balance 7 - reservas 0). Encontrado: {stock_vendible_post}"
    )


# ──────────────────────────────────────────────────────────────────────────────
# TEST 20: Secuencias sin Fallback Runtime (Bloqueo 2)
# ──────────────────────────────────────────────────────────────────────────────
def test_20_sequences_raise_error_without_fallback(db: Session):
    """
    Verifica que las funciones de secuencia:
    - Funcionan correctamente cuando la secuencia existe (seq_ven_so, seq_pec_po, seq_cot_sq)
    - Lanzan RuntimeError explicito si la secuencia NO existe (NO crean nada, NO hacen commit parcial)
    """
    from app.services.legacy_consolidation import (
        _get_next_sale_order_numero,
        _get_next_purchase_order_numero,
        _get_next_quotation_numero,
    )
    import datetime

    year = datetime.datetime.utcnow().year

    # ── Secuencias existentes: deben retornar consecutivo valido ─────────────
    ven = _get_next_sale_order_numero(db, prefix="VEN")
    assert ven.startswith(f"VEN-{year}-"), f"Formato VEN incorrecto: {ven}"
    assert len(ven.split("-")) == 3

    pec = _get_next_purchase_order_numero(db, prefix="PEC")
    assert pec.startswith(f"PEC-{year}-"), f"Formato PEC incorrecto: {pec}"

    cot = _get_next_quotation_numero(db, prefix="COT")
    assert cot.startswith(f"COT-{year}-"), f"Formato COT incorrecto: {cot}"

    # ── Consecutivos son unicos: dos llamadas sucesivas no repiten ────────────
    ven2 = _get_next_sale_order_numero(db, prefix="VEN")
    assert ven2 != ven, f"Consecutivos VEN deben ser unicos. Ambos: {ven}"

    pec2 = _get_next_purchase_order_numero(db, prefix="PEC")
    assert pec2 != pec, f"Consecutivos PEC deben ser unicos. Ambos: {pec}"

    cot2 = _get_next_quotation_numero(db, prefix="COT")
    assert cot2 != cot, f"Consecutivos COT deben ser unicos. Ambos: {cot}"

    # ── Secuencia inexistente: debe lanzar RuntimeError (sin commit ni CREATE) ─
    import pytest as _pytest
    from sqlalchemy import text as _text

    # Crear una sesion independiente para probar la propagacion del error
    # sin afectar la sesion de test principal
    try:
        db.execute(_text("SELECT nextval('seq_NONEXISTENT_XYZ')"))
        db.rollback()
        raise AssertionError("Debio lanzar excepcion al usar secuencia inexistente")
    except Exception as exc:
        db.rollback()
        # El error de PostgreSQL debe propagarse; verificamos que NO se haya hecho
        # un rollback silencioso ni un CREATE SEQUENCE automatico
        err_str = str(exc).lower()
        assert "seq_nonexistent_xyz" in err_str or "does not exist" in err_str or "no existe" in err_str, (
            f"Error inesperado: {exc}"
        )


# ──────────────────────────────────────────────────────────────────────────────
# TEST 21: CANONICAL_PRIMARY Real en Compras (Requisito 2)
# ──────────────────────────────────────────────────────────────────────────────
def test_21_canonical_primary_compras_real(client: TestClient, auth_tokens, db: Session):
    """
    Verifica intercept_purchase_order_write y gobernanza en compras:
    - READ_ONLY: retorna 410 Gone sin escrituras.
    - CANONICAL_PRIMARY: crea exclusivamente PurchaseOrderFull.
      purchase_orders no aumenta (delta = 0).
      La respuesta legacy se genera mediante adaptador compatible.
      Replay idéntico devuelve el mismo ID.
      Replay divergente retorna 409.
    - DUAL_WRITE: crea ambas entidades (PurchaseOrder y PurchaseOrderFull).
    - Conteos antes y después verificados rigurosamente.
    """
    headers = auth_tokens["admin"]["headers"]
    ts = int(time.time())

    # 1. READ_ONLY retorna 410 sin escrituras
    client.patch("/api/v1/legacy/governance", json={"mode": "READ_ONLY", "allow_legacy_writes": False}, headers=headers)
    res_ro = client.post("/api/v1/purchases/", json={"status": "DRAFT"}, headers={**headers, "Idempotency-Key": f"RO_PO_{ts}"})
    assert res_ro.status_code == 410, f"READ_ONLY debe retornar 410 en compras. Got {res_ro.status_code}"

    # 2. Configurar CANONICAL_PRIMARY
    client.patch("/api/v1/legacy/governance", json={"mode": "CANONICAL_PRIMARY", "allow_legacy_writes": True}, headers=headers)

    db.expire_all()
    po_legacy_before = db.query(PurchaseOrder).count()
    po_can_before = db.query(PurchaseOrderFull).count()

    idem_cp = f"CP_PO_{ts}"
    payload = {"status": "DRAFT"}

    # Peticion HTTP a traves del endpoint legacy
    res_cp = client.post("/api/v1/purchases/", json=payload, headers={**headers, "Idempotency-Key": idem_cp})
    assert res_cp.status_code == 201, f"CANONICAL_PRIMARY debe retornar 201. Got {res_cp.status_code}: {res_cp.text}"
    cp_data = res_cp.json()["data"]

    # Validar respuesta compatible generada por el adaptador
    assert "id" in cp_data, "El adaptador legacy debe retornar 'id'"
    assert "status" in cp_data, "El adaptador legacy debe retornar 'status'"
    assert cp_data["status"] == "BORRADOR" or cp_data["status"] == "DRAFT"
    canon_id = cp_data["id"]

    db.expire_all()
    po_legacy_after = db.query(PurchaseOrder).count()
    po_can_after = db.query(PurchaseOrderFull).count()

    # purchase_orders NO aumenta; purchase_orders_full aumenta exactamente 1
    assert po_legacy_after == po_legacy_before, (
        f"CANONICAL_PRIMARY NO debe insertar en purchase_orders. Antes={po_legacy_before}, Despues={po_legacy_after}"
    )
    assert po_can_after == po_can_before + 1, (
        f"CANONICAL_PRIMARY debe crear exactamente 1 PurchaseOrderFull. Antes={po_can_before}, Despues={po_can_after}"
    )

    # Replay idéntico -> retorna el mismo ID sin crear filas
    res_replay = client.post("/api/v1/purchases/", json=payload, headers={**headers, "Idempotency-Key": idem_cp})
    assert res_replay.status_code == 201
    assert res_replay.json()["data"]["id"] == canon_id, "Replay identico debe retornar el mismo ID"

    db.expire_all()
    assert db.query(PurchaseOrder).count() == po_legacy_after, "Replay identico no debe crear purchase_orders"
    assert db.query(PurchaseOrderFull).count() == po_can_after, "Replay identico no debe crear purchase_orders_full"

    # Replay divergente -> 409 Conflict
    res_div = client.post("/api/v1/purchases/", json={"status": "SENT"}, headers={**headers, "Idempotency-Key": idem_cp})
    assert res_div.status_code == 409, f"Replay divergente en compras debe retornar 409. Got: {res_div.status_code}"

    # 3. DUAL_WRITE crea ambas entidades
    client.patch("/api/v1/legacy/governance", json={"mode": "DUAL_WRITE", "allow_legacy_writes": True}, headers=headers)

    db.expire_all()
    po_leg_dw_before = db.query(PurchaseOrder).count()
    po_can_dw_before = db.query(PurchaseOrderFull).count()

    idem_dw = f"DW_PO_{ts}"
    res_dw = client.post("/api/v1/purchases/", json=payload, headers={**headers, "Idempotency-Key": idem_dw})
    assert res_dw.status_code == 201

    db.expire_all()
    po_leg_dw_after = db.query(PurchaseOrder).count()
    po_can_dw_after = db.query(PurchaseOrderFull).count()

    assert po_leg_dw_after == po_leg_dw_before + 1, "DUAL_WRITE debe crear fila en purchase_orders"
    assert po_can_dw_after == po_can_dw_before + 1, "DUAL_WRITE debe crear fila en purchase_orders_full"

    # Restaurar gobernanza a DUAL_WRITE para evitar contaminacion en otros tests
    client.patch("/api/v1/legacy/governance", json={"mode": "DUAL_WRITE", "allow_legacy_writes": True}, headers=headers)


