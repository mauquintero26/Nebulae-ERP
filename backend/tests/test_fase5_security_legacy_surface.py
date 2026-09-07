"""
tests/test_fase5_security_legacy_surface.py

Certificacion exhaustiva de Seguridad de Fase 5:
- BLOQUEO 1: Cierre total de superficie interna legacy con RBAC estricto en Finance, CRM, Chat, Ecommerce y Marketing.
- BLOQUEO 2: Webhooks legacy protegidos, eliminacion de tokens por defecto, HMAC obligatorio sin fallback, validacion COP, concurrencia y reintentos seguros (sin except: pass, con DEAD_LETTER).
- BLOQUEO 3: Checkout web con resolucion estricta de bodega en el servidor (Central autorizada sin fallback) y bloqueo patrimonial MAU.
- BLOQUEO 4: Semantica canonica de inventario: eliminacion del doble descuento de cuarentena y flujo real de liberacion con Kardex y aislamiento NEBULAE vs MAU en dos bodegas.
"""
import pytest
import datetime
import decimal
from decimal import Decimal
import json
import hmac
import hashlib
import os
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import text
from concurrent.futures import ThreadPoolExecutor

from app.models.erp_documents import SaleOrder, ActivityLog
from app.models.fase4 import SaleOrderPayment
from app.models.fase5 import IntegrationWebhookEvent
from app.models.catalog import ProductSKU, Product, Category, Brand
from app.models.inventory import InventoryLevel, Warehouse, InventoryMovement, InventoryOperation
from app.models.fase1b import (
    InventoryOwnerBalance, InventoryReservation, SaleOrderLineErp
)
from app.models.fase3 import InventoryQuarantine
from app.models.customers import Customer
from app.models.users import User
from app.core.security import create_access_token, SECRET_KEY, ALGORITHM


@pytest.fixture
def auth_tokens(db: Session):
    roles = {
        "admin": "ADMIN",
        "asesor": "ASESOR",
        "finanzas": "FINANZAS",
        "bodega": "BODEGA",
        "compras": "COMPRAS",
    }
    tokens = {}
    for prefix, role_name in roles.items():
        email = f"{prefix}_{int(datetime.datetime.now(datetime.timezone.utc).timestamp())}_{os.urandom(2).hex()}@nebulaekids.com"
        u = User(email=email, password_hash="dummy_hash", role=role_name, is_active=True)
        db.add(u)
        db.flush()
        tok = create_access_token({"sub": str(u.id), "role": role_name})
        tokens[prefix] = {"user": u, "token": tok, "headers": {"Authorization": f"Bearer {tok}"}}
    db.commit()
    return tokens


@pytest.fixture
def base_customer_catalog(db: Session):
    ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
    suffix = os.urandom(2).hex()
    cust = Customer(
        first_name="Camila",
        last_name="Herrera",
        email=f"camila_{ts}_{suffix}@example.com",
        phone="3119876543",
        address="Calle 72 #45-20",
        city="Bogota",
        document=f"CC{ts % 10000000}"
    )
    db.add(cust)

    wh = db.query(Warehouse).filter(Warehouse.location_type == "Central").first()
    if not wh:
        wh = Warehouse(name=f"Bodega Hardening {ts}", location_type="Central")
        db.add(wh)
    db.flush()

    cat = db.query(Category).first()
    if not cat:
        cat = Category(name="Maternidad")
        db.add(cat)
    brand = db.query(Brand).first()
    if not brand:
        brand = Brand(name="Nebulae Kids")
        db.add(brand)
    db.flush()

    prod = Product(
        name=f"Monitor Smart {ts}",
        category_id=cat.id,
        brand_id=brand.id,
        type="Fisico",
        base_currency="COP",
        uom="Unidad",
        is_active=True
    )
    db.add(prod)
    db.flush()

    sku = ProductSKU(
        product_id=prod.id,
        sku=f"SKU-HDN-{ts}_{suffix}",
        sale_price=Decimal("350000.00"),
        cost_price=Decimal("180000.00")
    )
    db.add(sku)
    db.commit()
    db.refresh(cust)
    db.refresh(wh)
    db.refresh(sku)
    db.refresh(prod)
    return {"customer": cust, "warehouse": wh, "sku": sku, "product": prod}


class TestFase5SecurityLegacySurface:
    """Suite de certificacion final de seguridad, RBAC y consistencia para Fase 5."""

    # =========================================================================
    # BLOQUEO 1: SUPERFICIE INTERNA LEGACY Y RBAC
    # =========================================================================

    def test_b1_01_finanzas_expenses_rbac_401_403_200(self, app_client: TestClient, auth_tokens: dict):
        """Finanzas /expenses: 401 sin token, 403 para BODEGA, 200/201 para ADMIN y FINANZAS."""
        res_no_auth = app_client.get("/api/v1/finance/expenses")
        assert res_no_auth.status_code == 401

        res_bodega = app_client.get("/api/v1/finance/expenses", headers=auth_tokens["bodega"]["headers"])
        assert res_bodega.status_code == 403

        res_finanzas = app_client.get("/api/v1/finance/expenses", headers=auth_tokens["finanzas"]["headers"])
        assert res_finanzas.status_code == 200
        assert "data" in res_finanzas.json()

        res_admin = app_client.get("/api/v1/finance/expenses", headers=auth_tokens["admin"]["headers"])
        assert res_admin.status_code == 200

        expense_payload = {
            "amount": 150000.00,
            "category": "SERVICIOS",
            "description": "Pago internet oficina"
        }
        res_create_bodega = app_client.post("/api/v1/finance/expenses", json=expense_payload, headers=auth_tokens["bodega"]["headers"])
        assert res_create_bodega.status_code == 403

        res_create_fin = app_client.post("/api/v1/finance/expenses", json=expense_payload, headers=auth_tokens["finanzas"]["headers"])
        assert res_create_fin.status_code in (200, 201)

    def test_b1_02_finanzas_dashboard_rbac_401_403_200(self, app_client: TestClient, auth_tokens: dict):
        """Finanzas /dashboard: 401 sin token, 403 para ASESOR, 200 para ADMIN y FINANZAS."""
        assert app_client.get("/api/v1/finance/dashboard").status_code == 401
        assert app_client.get("/api/v1/finance/dashboard", headers=auth_tokens["asesor"]["headers"]).status_code == 403
        res_ok = app_client.get("/api/v1/finance/dashboard", headers=auth_tokens["finanzas"]["headers"])
        assert res_ok.status_code == 200
        assert "data" in res_ok.json()

    def test_b1_03_crm_rutas_internas_rbac_401_403_200(self, app_client: TestClient, auth_tokens: dict):
        """CRM rutas internas: agenda, clientes, leads protegidos con token obligatorio."""
        assert app_client.get("/api/v1/crm/agenda").status_code == 401
        assert app_client.get("/api/v1/crm/customers").status_code == 401
        assert app_client.get("/api/v1/crm/leads").status_code == 401

        assert app_client.get("/api/v1/crm/agenda", headers=auth_tokens["bodega"]["headers"]).status_code == 403

        res_agenda = app_client.get("/api/v1/crm/agenda", headers=auth_tokens["asesor"]["headers"])
        assert res_agenda.status_code == 200

        res_cust = app_client.get("/api/v1/crm/customers", headers=auth_tokens["asesor"]["headers"])
        assert res_cust.status_code == 200

    def test_b1_04_chat_rutas_internas_vs_publicas(self, app_client: TestClient, auth_tokens: dict):
        """Chat: rutas internas protegidas (401/403); rutas publicas de widget web abiertas."""
        assert app_client.get("/api/v1/chat/conversations").status_code == 401
        assert app_client.get("/api/v1/chat/conversations", headers=auth_tokens["bodega"]["headers"]).status_code == 403

        res_chat_asesor = app_client.get("/api/v1/chat/conversations", headers=auth_tokens["asesor"]["headers"])
        assert res_chat_asesor.status_code == 200

        start_payload = {
            "customer_name": "Visitante Web Pruebas",
            "customer_email": "visitante@example.com"
        }
        res_pub_start = app_client.post("/api/v1/chat/web/start", json=start_payload)
        assert res_pub_start.status_code == 200
        data_start = res_pub_start.json().get("data", {})
        token = data_start.get("session_token")
        assert token is not None

        res_pub_msgs = app_client.get(f"/api/v1/chat/web/messages/{token}")
        assert res_pub_msgs.status_code == 200

        send_payload = {
            "session_token": token,
            "content": "Hola, necesito informacion de un producto"
        }
        res_pub_send = app_client.post("/api/v1/chat/web/message", json=send_payload)
        assert res_pub_send.status_code == 200

    def test_b1_05_ecommerce_rutas_internas_rbac(self, app_client: TestClient, auth_tokens: dict):
        """Ecommerce rutas internas: stats, pedidos, carritos, media, web-builder y config protegidos."""
        assert app_client.get("/api/v1/ecommerce/stats").status_code == 401
        assert app_client.get("/api/v1/ecommerce/carritos").status_code == 401
        assert app_client.get("/api/v1/ecommerce/web-builder/config").status_code == 401
        assert app_client.get("/api/v1/ecommerce/pagos/config").status_code == 401
        assert app_client.get("/api/v1/ecommerce/envios/config").status_code == 401
        assert app_client.get("/api/v1/ecommerce/clientes").status_code == 401

        assert app_client.get("/api/v1/ecommerce/pagos/config", headers=auth_tokens["asesor"]["headers"]).status_code == 403
        assert app_client.get("/api/v1/ecommerce/envios/config", headers=auth_tokens["asesor"]["headers"]).status_code == 403

        assert app_client.get("/api/v1/ecommerce/pagos/config", headers=auth_tokens["admin"]["headers"]).status_code == 200
        assert app_client.get("/api/v1/ecommerce/envios/config", headers=auth_tokens["admin"]["headers"]).status_code == 200
        assert app_client.get("/api/v1/ecommerce/stats", headers=auth_tokens["asesor"]["headers"]).status_code == 200
        assert app_client.get("/api/v1/ecommerce/clientes", headers=auth_tokens["asesor"]["headers"]).status_code == 200

    def test_b1_06_ecommerce_rutas_publicas_accesibles(self, app_client: TestClient, base_customer_catalog: dict):
        """Ecommerce storefront publico: catalogo, detalle, categorias y carritos abiertos sin token."""
        sku = base_customer_catalog["sku"]
        product = base_customer_catalog["product"]

        res_cat = app_client.get("/api/v1/ecommerce/catalogo")
        assert res_cat.status_code == 200

        res_item = app_client.get(f"/api/v1/ecommerce/catalogo/{product.id}")
        assert res_item.status_code == 200

        res_groups = app_client.get("/api/v1/ecommerce/categorias")
        assert res_groups.status_code == 200

        cart_payload = {
            "session_id": "sess_pub_test_12345",
            "items": [{"sku": sku.sku, "qty": 1}]
        }
        res_cart = app_client.post("/api/v1/ecommerce/carritos", json=cart_payload)
        assert res_cart.status_code == 200

    def test_b1_07_marketing_rutas_internas_vs_publicas(self, app_client: TestClient, auth_tokens: dict):
        """Marketing: campanas y flujos protegidos; story-catalog publico."""
        assert app_client.get("/api/v1/marketing/campanas").status_code == 401
        assert app_client.get("/api/v1/marketing/flujos").status_code == 401
        assert app_client.get("/api/v1/marketing/posts").status_code == 401

        assert app_client.get("/api/v1/marketing/campanas", headers=auth_tokens["bodega"]["headers"]).status_code == 403
        assert app_client.get("/api/v1/marketing/campanas", headers=auth_tokens["asesor"]["headers"]).status_code == 200

        res_story = app_client.get("/api/v1/marketing/story-catalog")
        assert res_story.status_code == 200

    # =========================================================================
    # BLOQUEO 2: WEBHOOKS HARDENING, REINTENTOS Y CONCURRENCIA
    # =========================================================================

    def test_b2_01_chat_whatsapp_verify_token_sin_fallback(self, app_client: TestClient, monkeypatch):
        """WhatsApp GET verify: exige WHATSAPP_VERIFY_TOKEN configurado; rechaza fallbacks y valores incorrectos."""
        monkeypatch.delenv("WHATSAPP_VERIFY_TOKEN", raising=False)
        params = {"hub.mode": "subscribe", "hub.verify_token": "nebulae_whatsapp_2026", "hub.challenge": "ch_123"}
        res_no_env = app_client.get("/api/v1/chat/webhook/whatsapp", params=params)
        assert res_no_env.status_code == 403

        monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "real_whatsapp_secure_token_xyz")
        res_wrong_token = app_client.get("/api/v1/chat/webhook/whatsapp", params={"hub.mode": "subscribe", "hub.verify_token": "token_erroneo", "hub.challenge": "ch_123"})
        assert res_wrong_token.status_code == 403

        res_ok = app_client.get("/api/v1/chat/webhook/whatsapp", params={"hub.mode": "subscribe", "hub.verify_token": "real_whatsapp_secure_token_xyz", "hub.challenge": "challenge_accepted_meta"})
        assert res_ok.status_code == 200
        assert res_ok.text == "challenge_accepted_meta"

    def test_b2_02_chat_whatsapp_e_instagram_post_hmac_sha256(self, app_client: TestClient, monkeypatch):
        """Chat webhooks POST: validacion estricta HMAC-SHA256 con X-Hub-Signature-256."""
        secret_wa = "wa_secret_key_prod_2026"
        secret_ig = "ig_secret_key_prod_2026"
        monkeypatch.setenv("WHATSAPP_WEBHOOK_SECRET", secret_wa)
        monkeypatch.setenv("INSTAGRAM_WEBHOOK_SECRET", secret_ig)

        msg_wa = {"entry": [{"changes": [{"value": {"messages": [{"from": "573001234567", "text": {"body": "Hola WhatsApp"}}]}}]}]}
        body_wa = json.dumps(msg_wa).encode("utf-8")

        assert app_client.post("/api/v1/chat/webhook/whatsapp", json=msg_wa).status_code == 401
        assert app_client.post("/api/v1/chat/webhook/whatsapp", json=msg_wa, headers={"x-hub-signature-256": "sha256=firma_falsa"}).status_code == 401

        sig_wa = "sha256=" + hmac.new(secret_wa.encode("utf-8"), body_wa, hashlib.sha256).hexdigest()
        res_wa_ok = app_client.post("/api/v1/chat/webhook/whatsapp", data=body_wa, headers={"x-hub-signature-256": sig_wa, "content-type": "application/json"})
        assert res_wa_ok.status_code == 200

        msg_ig = {"entry": [{"messaging": [{"sender": {"id": "12345"}, "message": {"text": "Hola Instagram"}}]}]}
        body_ig = json.dumps(msg_ig).encode("utf-8")

        assert app_client.post("/api/v1/chat/webhook/instagram", json=msg_ig).status_code == 401
        sig_ig = "sha256=" + hmac.new(secret_ig.encode("utf-8"), body_ig, hashlib.sha256).hexdigest()
        res_ig_ok = app_client.post("/api/v1/chat/webhook/instagram", data=body_ig, headers={"x-hub-signature-256": sig_ig, "content-type": "application/json"})
        assert res_ig_ok.status_code == 200

    def test_b2_03_webhooks_rechazo_fallback_secret_key(self, app_client: TestClient, monkeypatch):
        """Webhooks de pasarela: exige {PROVIDER}_WEBHOOK_SECRET especifico; jamas cae en fallback a SECRET_KEY."""
        monkeypatch.delenv("MERCADOPAGO_WEBHOOK_SECRET", raising=False)
        monkeypatch.delenv("MERCADO_PAGO_WEBHOOK_SECRET", raising=False)
        payload = {"data": {"id": "12345678"}, "type": "payment"}
        body = json.dumps(payload).encode("utf-8")
        sig_with_general_secret = hmac.new(SECRET_KEY.encode("utf-8"), body, hashlib.sha256).hexdigest()

        res = app_client.post("/api/v1/webhooks/mercadopago", data=body, headers={"x-signature": sig_with_general_secret, "content-type": "application/json"})
        assert res.status_code == 401

    def test_b2_04_webhooks_validacion_moneda_estricta_cop(self, app_client: TestClient, db: Session, base_customer_catalog: dict, monkeypatch):
        """Webhooks de pago: rechaza pagos con moneda distinta a COP sin confirmar el pedido."""
        monkeypatch.setenv("MERCADOPAGO_WEBHOOK_SECRET", "mp_currency_secret")
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        cust = base_customer_catalog["customer"]

        so = SaleOrder(
            numero=f"VEN-U-{ts % 1000000}",
            pweb_numero=f"PW-U-{ts % 1000000}",
            customer_id=cust.id,
            total_cop=Decimal("200000.00"),
            saldo_cop=Decimal("200000.00"),
            anticipo_cop=Decimal("0.00"),
            estado="PENDIENTE_PAGO"
        )
        db.add(so)
        db.commit()
        db.refresh(so)

        payload = {
            "type": "payment",
            "data": {
                "id": f"PAY_USD_{ts}",
                "external_reference": so.pweb_numero,
                "status": "approved",
                "transaction_amount": 200000.00,
                "currency_id": "USD"
            }
        }
        body = json.dumps(payload).encode("utf-8")
        sig = hmac.new("mp_currency_secret".encode("utf-8"), body, hashlib.sha256).hexdigest()

        res = app_client.post("/api/v1/webhooks/mercadopago", data=body, headers={"x-signature": sig, "content-type": "application/json"})
        assert res.status_code == 200
        assert res.json().get("status") == "failed"
        assert "Moneda 'USD' no admitida" in res.json().get("error", "")

        db.refresh(so)
        assert so.estado == "PENDIENTE_PAGO"
        assert so.saldo_cop == Decimal("200000.00")

    def test_b2_05_webhooks_concurrencia_exactamente_un_pago(self, app_client: TestClient, db: Session, base_customer_catalog: dict, monkeypatch):
        """Webhooks: 2 llamadas simultáneas del mismo webhook aprobado generan exactamente 1 pago sin duplicados."""
        monkeypatch.setenv("MERCADOPAGO_WEBHOOK_SECRET", "mp_concurrency_secret")
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        cust = base_customer_catalog["customer"]

        so = SaleOrder(
            numero=f"VEN-C-{ts % 1000000}",
            pweb_numero=f"PW-C-{ts % 1000000}",
            customer_id=cust.id,
            total_cop=Decimal("150000.00"),
            saldo_cop=Decimal("150000.00"),
            anticipo_cop=Decimal("0.00"),
            estado="PENDIENTE_PAGO"
        )
        db.add(so)
        db.commit()
        db.refresh(so)

        payload = {
            "type": "payment",
            "external_reference": so.pweb_numero,
            "status": "APPROVED",
            "amount": 150000.00,
            "currency": "COP",
            "id": f"TX_CNC_{ts}"
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        sig = hmac.new("mp_concurrency_secret".encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
        headers = {"x-signature": sig, "x-idempotency-key": f"IDEM_CNC_{ts}"}

        def send_webhook():
            return app_client.post("/api/v1/webhooks/mercadopago", json=payload, headers=headers)

        with ThreadPoolExecutor(max_workers=2) as executor:
            fut1 = executor.submit(send_webhook)
            fut2 = executor.submit(send_webhook)
            r1 = fut1.result()
            r2 = fut2.result()

        assert r1.status_code == 200
        assert r2.status_code == 200

        db.refresh(so)
        assert so.estado in ("PAGADO", "CONFIRMADO")
        assert so.saldo_cop == Decimal("0.00")

        pagos = db.query(SaleOrderPayment).filter(SaleOrderPayment.sale_order_id == so.id).all()
        assert len(pagos) == 1
        assert pagos[0].monto == Decimal("150000.00")

    def test_b2_06_webhooks_reintento_fallido_permanece_failed_o_retrying_nunca_processed(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """Webhooks Retry: Si el handler falla por moneda o monto incorrecto, el evento permanece en RETRYING/FAILED y NUNCA en PROCESSED."""
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        cust = base_customer_catalog["customer"]

        so = SaleOrder(
            numero=f"VEN-F-{ts % 1000000}",
            pweb_numero=f"PW-F-{ts % 1000000}",
            customer_id=cust.id,
            total_cop=Decimal("100000.00"),
            saldo_cop=Decimal("100000.00"),
            anticipo_cop=Decimal("0.00"),
            estado="PENDIENTE_PAGO"
        )
        db.add(so)
        db.commit()

        bad_payload = {
            "type": "payment",
            "external_reference": so.pweb_numero,
            "status": "APPROVED",
            "amount": 100000.00,
            "currency": "EUR"
        }
        ev = IntegrationWebhookEvent(
            provider="MERCADOPAGO",
            event_type="PAYMENT_NOTIFICATION",
            idempotency_key=f"IDEM_RT_FAIL_{ts}",
            direction="INBOUND",
            payload=json.dumps(bad_payload),
            status="FAILED",
            attempts=1,
            max_attempts=3,
            dead_letter=False
        )
        db.add(ev)
        db.commit()

        res = app_client.post(
            "/api/v1/webhooks/system/retry-failed?provider=MERCADOPAGO",
            headers=auth_tokens["admin"]["headers"]
        )
        assert res.status_code == 200
        data = res.json()
        assert data["reprocessed_count"] == 0

        db.refresh(ev)
        assert ev.status in ("RETRYING", "FAILED"), f"El evento no debe ser PROCESSED. Estado actual: {ev.status}"
        assert ev.status != "PROCESSED"
        assert ev.attempts == 2
        assert ev.last_error is not None
        assert "Moneda 'EUR' no admitida" in ev.last_error
        assert ev.processed_at is None

        db.refresh(so)
        assert so.estado == "PENDIENTE_PAGO"
        pagos = db.query(SaleOrderPayment).filter(SaleOrderPayment.sale_order_id == so.id).all()
        assert len(pagos) == 0

    def test_b2_07_webhooks_reintento_supera_max_attempts_pasa_a_dead_letter(self, app_client: TestClient, db: Session, auth_tokens: dict):
        """Webhooks Retry: Al alcanzar max_attempts en reintentos fallidos, el evento se mueve a DEAD_LETTER."""
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        ev = IntegrationWebhookEvent(
            provider="WOMPI",
            event_type="PAYMENT_NOTIFICATION",
            idempotency_key=f"IDEM_DEAD_{ts}",
            direction="INBOUND",
            payload=json.dumps({"type": "payment", "amount": 50000, "currency": "USD"}),
            status="RETRYING",
            attempts=2,
            max_attempts=3,
            dead_letter=False
        )
        db.add(ev)
        db.commit()

        res = app_client.post(
            "/api/v1/webhooks/system/retry-failed?max_retries=3&provider=WOMPI",
            headers=auth_tokens["admin"]["headers"]
        )
        assert res.status_code == 200
        assert res.json()["dead_letter_count"] >= 1

        db.refresh(ev)
        assert ev.status == "DEAD_LETTER"
        assert ev.dead_letter is True
        assert ev.attempts >= 3
        assert "dead-letter" in (ev.last_error or "").lower()

    def test_b2_08_webhooks_reintento_exitoso_confirma_exactamente_un_pago(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """Webhooks Retry: Reintento exitoso procesa el pago real, marca PROCESSED y confirma exactamente 1 pago."""
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        cust = base_customer_catalog["customer"]

        so = SaleOrder(
            numero=f"VEN-O-{ts % 1000000}",
            pweb_numero=f"PW-O-{ts % 1000000}",
            customer_id=cust.id,
            total_cop=Decimal("80000.00"),
            saldo_cop=Decimal("80000.00"),
            anticipo_cop=Decimal("0.00"),
            estado="PENDIENTE_PAGO"
        )
        db.add(so)
        db.commit()

        good_payload = {
            "type": "payment",
            "external_reference": so.pweb_numero,
            "status": "APPROVED",
            "amount": 80000.00,
            "currency": "COP"
        }
        ev = IntegrationWebhookEvent(
            provider="WOMPI",
            event_type="PAYMENT_NOTIFICATION",
            idempotency_key=f"IDEM_RT_OK_{ts}",
            direction="INBOUND",
            payload=json.dumps(good_payload),
            status="FAILED",
            attempts=1,
            max_attempts=3,
            dead_letter=False
        )
        db.add(ev)
        db.commit()

        res = app_client.post(
            "/api/v1/webhooks/system/retry-failed?provider=WOMPI",
            headers=auth_tokens["admin"]["headers"]
        )
        assert res.status_code == 200
        assert res.json()["reprocessed_count"] >= 1

        db.refresh(ev)
        assert ev.status == "PROCESSED"
        assert ev.processed_at is not None
        assert ev.last_error is None

        db.refresh(so)
        assert so.estado in ("PAGADO", "CONFIRMADO", "LISTO_ENTREGA")
        assert so.saldo_cop == Decimal("0.00")

        pagos = db.query(SaleOrderPayment).filter(SaleOrderPayment.sale_order_id == so.id).all()
        assert len(pagos) == 1
        assert pagos[0].monto == Decimal("80000.00")

    # =========================================================================
    # BLOQUEO 3: CHECKOUT Y RESOLUCION ESTRICTA DE BODEGA EN SERVIDOR
    # =========================================================================

    def test_b3_01_checkout_sin_bodega_ecommerce_rechazo_sin_escrituras(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """Checkout: Si no hay bodega central ecommerce configurada/autorizada, rechaza con 400 sin escrituras en BD."""
        sku = base_customer_catalog["sku"]
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())

        try:
            # Configurar explicitamente lista vacia de bodegas autorizadas
            app_client.patch(
                "/api/v1/ecommerce/fulfillment/config",
                json={"authorized_warehouse_ids": []},
                headers=auth_tokens["admin"]["headers"]
            )

            orders_before = db.query(SaleOrder).count()
            lines_before = db.query(SaleOrderLineErp).count()
            res_before = db.query(InventoryReservation).count()

            payload = {
                "idempotency_key": f"NO_WH_CONF_{ts}",
                "customer_name": "Test Sin Bodega",
                "customer_email": f"nobodega_{ts}@test.com",
                "items": [{
                    "sku": sku.sku,
                    "quantity": 1,
                    "modalidad": "ENTREGA_INMEDIATA"
                }]
            }
            res = app_client.post("/api/v1/ecommerce/pedidos", json=payload)
            assert res.status_code == 400
            assert "No existe una bodega central autorizada" in res.json().get("detail", "")

            # Verificar CERO escrituras en BD
            assert db.query(SaleOrder).count() == orders_before
            assert db.query(SaleOrderLineErp).count() == lines_before
            assert db.query(InventoryReservation).count() == res_before
        finally:
            # Limpiar configuracion para no contaminar tests posteriores
            db.execute(text("DELETE FROM web_builder_config WHERE config_key='ecommerce_fulfillment'"))
            db.commit()

    def test_b3_02_checkout_bodega_inexistente_rechazo(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """Checkout: Rechaza con 400 Bad Request si se envia un ID de bodega inexistente."""
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())

        try:
            # Asegurar bodega autorizada para fulfillment
            app_client.patch(
                "/api/v1/ecommerce/fulfillment/config",
                json={"authorized_warehouse_ids": [wh.id], "default_warehouse_id": wh.id},
                headers=auth_tokens["admin"]["headers"]
            )

            payload = {
                "idempotency_key": f"WH_NOT_FOUND_{ts}",
                "customer_name": "Test Inexistente",
                "customer_email": f"inexistente_{ts}@test.com",
                "warehouse_id": 999999,
                "items": [{"sku": sku.sku, "quantity": 1}]
            }
            res = app_client.post("/api/v1/ecommerce/pedidos", json=payload)
            assert res.status_code == 400
            assert "no encontrada" in res.json().get("detail", "").lower()
        finally:
            db.execute(text("DELETE FROM web_builder_config WHERE config_key='ecommerce_fulfillment'"))
            db.commit()

    def test_b3_03_checkout_bodega_central_no_autorizada_rechazo(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """Checkout: Rechaza con 400 Bad Request si el cliente envia una bodega Central que NO esta autorizada para ecommerce."""
        sku = base_customer_catalog["sku"]
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())

        wh_auth = Warehouse(name=f"Bodega Central Autorizada {ts}", location_type="Central")
        wh_unauth = Warehouse(name=f"Bodega Central No Autorizada {ts}", location_type="Central")
        db.add_all([wh_auth, wh_unauth])
        db.commit()

        try:
            app_client.patch(
                "/api/v1/ecommerce/fulfillment/config",
                json={"authorized_warehouse_ids": [wh_auth.id], "default_warehouse_id": wh_auth.id},
                headers=auth_tokens["admin"]["headers"]
            )

            payload = {
                "idempotency_key": f"WH_UNAUTH_{ts}",
                "customer_name": "Test Central No Autorizada",
                "customer_email": f"unauth_{ts}@test.com",
                "warehouse_id": wh_unauth.id,
                "items": [{"sku": sku.sku, "quantity": 1}]
            }
            res = app_client.post("/api/v1/ecommerce/pedidos", json=payload)
            assert res.status_code == 400
            assert "no autorizada para fulfillment ecommerce" in res.json().get("detail", "").lower()
        finally:
            db.execute(text("DELETE FROM web_builder_config WHERE config_key='ecommerce_fulfillment'"))
            db.commit()

    def test_b3_04_checkout_bodega_autorizada_pedido_y_reserva_correctos(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """Checkout: Con bodega central autorizada, el pedido y la reserva se crean exitosamente en la bodega resuelta."""
        sku = base_customer_catalog["sku"]
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())

        wh_auth = Warehouse(name=f"Bodega Central Ecom OK {ts}", location_type="Central")
        db.add(wh_auth)
        db.commit()

        db.add(InventoryLevel(sku_id=sku.id, warehouse_id=wh_auth.id, quantity=Decimal("20.00")))
        db.add(InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh_auth.id, owner="NEBULAE", quantity=Decimal("20.00")))
        db.commit()

        try:
            app_client.patch(
                "/api/v1/ecommerce/fulfillment/config",
                json={"authorized_warehouse_ids": [wh_auth.id], "default_warehouse_id": wh_auth.id},
                headers=auth_tokens["admin"]["headers"]
            )

            payload = {
                "idempotency_key": f"WH_AUTH_OK_{ts}",
                "customer_name": "Cliente Feliz Ecommerce",
                "customer_email": f"comprador_{ts}@test.com",
                "warehouse_id": wh_auth.id,
                "items": [{
                    "sku": sku.sku,
                    "quantity": 2,
                    "modalidad": "ENTREGA_INMEDIATA"
                }]
            }
            res = app_client.post("/api/v1/ecommerce/pedidos", json=payload)
            assert res.status_code == 201
            order_id = res.json()["data"]["id"]

            line = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == order_id).first()
            assert line is not None

            rsv = db.query(InventoryReservation).filter(InventoryReservation.sale_order_line_id == line.id).first()
            assert rsv is not None
            assert rsv.warehouse_id == wh_auth.id
            assert rsv.quantity_reserved == Decimal("2.00")
        finally:
            db.execute(text("DELETE FROM web_builder_config WHERE config_key='ecommerce_fulfillment'"))
            db.commit()

    def test_b3_05_checkout_bloqueo_patrimonial_mau_403(self, app_client: TestClient, base_customer_catalog: dict):
        """Checkout: Rechaza con 403 Forbidden intentos de alterar propiedad patrimonial (MAU)."""
        sku = base_customer_catalog["sku"]
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())

        p1 = {
            "idempotency_key": f"MAU_ROOT_{ts}",
            "customer_name": "Intento MAU",
            "owner": "MAU",
            "items": [{"sku": sku.sku, "quantity": 1}]
        }
        assert app_client.post("/api/v1/ecommerce/pedidos", json=p1).status_code == 403

        p2 = {
            "idempotency_key": f"MAU_ITEM_{ts}",
            "customer_name": "Intento MAU Item",
            "items": [{"sku": sku.sku, "quantity": 1, "owner": "MAU"}]
        }
        assert app_client.post("/api/v1/ecommerce/pedidos", json=p2).status_code == 403

    # =========================================================================
    # BLOQUEO 4: SEMÁNTICA DE CUARENTENA Y LIBERACIÓN REAL DE FASE 3
    # =========================================================================

    def test_b4_01_semantica_cuarentena_sin_doble_descuento(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """Cuarentena: InventoryOwnerBalance ya representa stock conforme vendible; no se descuenta doblemente."""
        from app.api.v1.ecommerce import _get_real_sellable_stock

        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]

        app_client.patch(
            "/api/v1/ecommerce/fulfillment/config",
            json={"authorized_warehouse_ids": [wh.id], "default_warehouse_id": wh.id},
            headers=auth_tokens["admin"]["headers"]
        )

        db.query(InventoryReservation).filter(InventoryReservation.sku_id == sku.id).delete()
        db.query(InventoryQuarantine).filter(InventoryQuarantine.sku_id == sku.id).delete()
        db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id, InventoryLevel.warehouse_id == wh.id).delete()
        db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == sku.id, InventoryOwnerBalance.warehouse_id == wh.id).delete()

        db.add(InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("25.00")))
        db.add(InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("25.00")))

        db.add(InventoryQuarantine(
            sku_id=sku.id,
            warehouse_id=wh.id,
            owner="NEBULAE",
            quantity=Decimal("4.00"),
            status="ACTIVO",
            reason="DEFECTO_FABRICA"
        ))

        db.add(InventoryReservation(
            sku_id=sku.id,
            warehouse_id=wh.id,
            owner="NEBULAE",
            quantity_reserved=Decimal("6.00"),
            status="ACTIVE",
            idempotency_key=f"RES_B4_{sku.id}"
        ))
        db.commit()

        stock_real = _get_real_sellable_stock(db, sku.id, wh.id, "NEBULAE")
        assert stock_real == Decimal("19.00"), f"Esperado 19.00, obtenido {stock_real}. Verifique que no hay doble descuento de cuarentena."

        res = app_client.get(f"/api/v1/ecommerce/catalogo?search={sku.sku}")
        assert res.status_code == 200
        item = [i for i in res.json()["data"] if i["sku"] == sku.sku][0]
        assert item["stock_disponible"] == 19.0

    def test_b4_02_flujo_real_liberacion_cuarentena_aislamiento_nebulae_mau_dos_bodegas(
        self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict
    ):
        """Cuarentena Real: Ejecuta endpoint real de Fase 3 (POST /api/v1/inventory/cuarentena/{id}/resolver),
        generando movimiento Kardex, actualizando balance de propietario y nivel fisico,
        con estricto aislamiento entre NEBULAE y MAU en dos bodegas distintas."""
        from app.api.v1.ecommerce import _get_real_sellable_stock

        sku = base_customer_catalog["sku"]
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())

        wh1 = Warehouse(name=f"Bodega Central 1 {ts}", location_type="Central")
        wh2 = Warehouse(name=f"Bodega Central 2 {ts}", location_type="Central")
        db.add_all([wh1, wh2])
        db.commit()

        try:
            app_client.patch(
                "/api/v1/ecommerce/fulfillment/config",
                json={"authorized_warehouse_ids": [wh1.id, wh2.id], "default_warehouse_id": wh1.id},
                headers=auth_tokens["admin"]["headers"]
            )

            db.execute(text("DELETE FROM inventory_movements WHERE operation_id IN (SELECT id FROM inventory_operations WHERE source_document_type = 'CUARENTENA_LIBERADA')"))
            db.execute(text("DELETE FROM inventory_operations WHERE source_document_type = 'CUARENTENA_LIBERADA'"))
            db.query(InventoryReservation).filter(InventoryReservation.sku_id == sku.id).delete()
            db.query(InventoryQuarantine).filter(InventoryQuarantine.sku_id == sku.id).delete()
            db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id).delete()
            db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == sku.id).delete()

            db.add_all([
                InventoryLevel(sku_id=sku.id, warehouse_id=wh1.id, quantity=Decimal("15.00")),
                InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh1.id, owner="NEBULAE", quantity=Decimal("10.00")),
                InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh1.id, owner="MAU", quantity=Decimal("5.00")),

                InventoryLevel(sku_id=sku.id, warehouse_id=wh2.id, quantity=Decimal("20.00")),
                InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh2.id, owner="NEBULAE", quantity=Decimal("8.00")),
                InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh2.id, owner="MAU", quantity=Decimal("12.00")),
            ])

            q_neb_wh1 = InventoryQuarantine(sku_id=sku.id, warehouse_id=wh1.id, owner="NEBULAE", quantity=Decimal("5.00"), status="ACTIVO", reason="AVERIA_EMPAQUE")
            q_mau_wh1 = InventoryQuarantine(sku_id=sku.id, warehouse_id=wh1.id, owner="MAU", quantity=Decimal("3.00"), status="ACTIVO", reason="AVERIA_TRANSPORTE")
            q_neb_wh2 = InventoryQuarantine(sku_id=sku.id, warehouse_id=wh2.id, owner="NEBULAE", quantity=Decimal("4.00"), status="ACTIVO", reason="LOTE_SOSPECHOSO")
            q_mau_wh2 = InventoryQuarantine(sku_id=sku.id, warehouse_id=wh2.id, owner="MAU", quantity=Decimal("2.00"), status="ACTIVO", reason="MUESTRA_CALIDAD")
            db.add_all([q_neb_wh1, q_mau_wh1, q_neb_wh2, q_mau_wh2])
            db.commit()

            assert _get_real_sellable_stock(db, sku.id, wh1.id, "NEBULAE") == Decimal("10.00")

            # EJECUTAR ENDPOINT REAL DE FASE 3
            resolve_payload = {
                "action": "LIBERAR",
                "idempotency_key": f"RES_REAL_NEB_W1_{ts}",
                "notes": "Liberacion autorizada por control de calidad"
            }
            res_lib = app_client.post(
                f"/api/v1/inventory/cuarentena/{q_neb_wh1.id}/resolver",
                json=resolve_payload,
                headers=auth_tokens["admin"]["headers"]
            )
            assert res_lib.status_code == 200
            assert res_lib.json().get("status") == "success"

            # COMPROBAR INTEGRIDAD TOTAL:
            # a) Estado cuarentena
            db.refresh(q_neb_wh1)
            assert q_neb_wh1.status == "LIBERADO"
            assert q_neb_wh1.resolved_at is not None

            # b) Movimiento Kardex generado
            kardex_in = db.query(InventoryMovement).filter(
                InventoryMovement.sku_id == sku.id,
                InventoryMovement.warehouse_id == wh1.id,
                InventoryMovement.owner == "NEBULAE",
                InventoryMovement.direction == "IN"
            ).first()
            assert kardex_in is not None
            assert kardex_in.quantity == Decimal("5.00")

            # c) Balance de propietario actualizado
            bal_neb_wh1 = db.query(InventoryOwnerBalance).filter(
                InventoryOwnerBalance.sku_id == sku.id,
                InventoryOwnerBalance.warehouse_id == wh1.id,
                InventoryOwnerBalance.owner == "NEBULAE"
            ).first()
            assert bal_neb_wh1.quantity == Decimal("15.00")

            # d) Nivel fisico actualizado
            level_wh1 = db.query(InventoryLevel).filter(
                InventoryLevel.sku_id == sku.id,
                InventoryLevel.warehouse_id == wh1.id
            ).first()
            assert level_wh1.quantity == Decimal("20.00")

            # e) Stock vendible e-commerce actualizado
            assert _get_real_sellable_stock(db, sku.id, wh1.id, "NEBULAE") == Decimal("15.00")

            # COMPROBAR AISLAMIENTO ESTRICTO:
            bal_mau_wh1 = db.query(InventoryOwnerBalance).filter(
                InventoryOwnerBalance.sku_id == sku.id,
                InventoryOwnerBalance.warehouse_id == wh1.id,
                InventoryOwnerBalance.owner == "MAU"
            ).first()
            assert bal_mau_wh1.quantity == Decimal("5.00")

            bal_neb_wh2 = db.query(InventoryOwnerBalance).filter(
                InventoryOwnerBalance.sku_id == sku.id,
                InventoryOwnerBalance.warehouse_id == wh2.id,
                InventoryOwnerBalance.owner == "NEBULAE"
            ).first()
            assert bal_neb_wh2.quantity == Decimal("8.00")

            bal_mau_wh2 = db.query(InventoryOwnerBalance).filter(
                InventoryOwnerBalance.sku_id == sku.id,
                InventoryOwnerBalance.warehouse_id == wh2.id,
                InventoryOwnerBalance.owner == "MAU"
            ).first()
            assert bal_mau_wh2.quantity == Decimal("12.00")

            db.commit()

            # EJECUTAR ENDPOINT REAL PARA MAU EN BODEGA 1:
            res_lib_mau = app_client.post(
                f"/api/v1/inventory/cuarentena/{q_mau_wh1.id}/resolver",
                json={
                    "action": "LIBERAR",
                    "idempotency_key": f"RES_REAL_MAU_W1_{ts}_{os.urandom(4).hex()}",
                    "notes": "Liberacion aprobada mercancia MAU"
                },
                headers=auth_tokens["bodega"]["headers"]
            )
            assert res_lib_mau.status_code == 200, f"Error resolving MAU: {res_lib_mau.text}"

            db.refresh(bal_mau_wh1)
            assert bal_mau_wh1.quantity == Decimal("8.00")

            db.refresh(level_wh1)
            assert level_wh1.quantity == Decimal("23.00")

            assert _get_real_sellable_stock(db, sku.id, wh1.id, "NEBULAE") == Decimal("15.00")
        finally:
            db.execute(text("DELETE FROM web_builder_config WHERE config_key='ecommerce_fulfillment'"))
            db.commit()
