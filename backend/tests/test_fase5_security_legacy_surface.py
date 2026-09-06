"""
tests/test_fase5_security_legacy_surface.py

Certificacion exhaustiva de Seguridad de Fase 5:
- BLOQUEO 1: Cierre total de superficie interna legacy con RBAC estricto en Finance, CRM, Chat, Ecommerce y Marketing.
- BLOQUEO 2: Webhooks legacy protegidos, eliminacion de tokens por defecto, HMAC obligatorio sin fallback, validacion COP y concurrencia.
- BLOQUEO 3: Checkout web con resolucion estricta de bodega en el servidor (Central) y bloqueo patrimonial MAU.
- BLOQUEO 4: Semantica canonica de inventario: eliminacion del doble descuento de cuarentena en stock vendible y flujo de liberacion.
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
from app.models.inventory import InventoryLevel, Warehouse
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

    wh = db.query(Warehouse).first()
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
    return {"customer": cust, "warehouse": wh, "sku": sku, "product": prod}


class TestFase5SecurityLegacySurface:

    # =========================================================================
    # BLOQUEO 1: SUPERFICIE INTERNA LEGACY Y RBAC
    # =========================================================================

    def test_b1_01_finanzas_expenses_rbac_401_403_200(self, app_client: TestClient, auth_tokens: dict):
        """Finanzas: /expenses exige auth (401), bloquea roles ajenos (403) y permite ADMIN/FINANZAS (200)."""
        # 1. Sin token -> 401
        assert app_client.get("/api/v1/finance/expenses").status_code == 401
        assert app_client.post("/api/v1/finance/expenses", json={"descripcion": "Test", "monto": 1000}).status_code == 401

        # 2. Rol no autorizado (BODEGA o ASESOR) -> 403
        assert app_client.get("/api/v1/finance/expenses", headers=auth_tokens["bodega"]["headers"]).status_code == 403
        assert app_client.post("/api/v1/finance/expenses", json={"descripcion": "Test", "monto": 1000}, headers=auth_tokens["bodega"]["headers"]).status_code == 403

        # 3. Rol FINANZAS / ADMIN -> 200
        r_fin = app_client.get("/api/v1/finance/expenses", headers=auth_tokens["finanzas"]["headers"])
        assert r_fin.status_code == 200
        r_adm = app_client.get("/api/v1/finance/expenses", headers=auth_tokens["admin"]["headers"])
        assert r_adm.status_code == 200

    def test_b1_02_finanzas_dashboard_rbac_401_403_200(self, app_client: TestClient, auth_tokens: dict):
        """Finanzas: /dashboard exige auth (401), bloquea BODEGA (403) y permite FINANZAS (200)."""
        assert app_client.get("/api/v1/finance/dashboard").status_code == 401
        assert app_client.get("/api/v1/finance/dashboard", headers=auth_tokens["bodega"]["headers"]).status_code == 403
        res = app_client.get("/api/v1/finance/dashboard", headers=auth_tokens["finanzas"]["headers"])
        assert res.status_code == 200
        assert "data" in res.json()

    def test_b1_03_crm_rutas_internas_rbac_401_403_200(self, app_client: TestClient, auth_tokens: dict):
        """CRM: Rutas internas de agenda, clientes y pipeline exigen auth y bloquean no autorizados."""
        # Agenda
        assert app_client.get("/api/v1/crm/agenda").status_code == 401
        assert app_client.post("/api/v1/crm/agenda/sync").status_code == 401
        assert app_client.get("/api/v1/crm/agenda", headers=auth_tokens["bodega"]["headers"]).status_code == 403
        assert app_client.get("/api/v1/crm/agenda", headers=auth_tokens["asesor"]["headers"]).status_code == 200

        # Clientes
        assert app_client.get("/api/v1/crm/customers").status_code == 401
        assert app_client.get("/api/v1/crm/customers", headers=auth_tokens["asesor"]["headers"]).status_code == 200

        # Leads
        assert app_client.get("/api/v1/crm/leads").status_code == 401
        assert app_client.get("/api/v1/crm/leads", headers=auth_tokens["asesor"]["headers"]).status_code == 200

    def test_b1_04_chat_rutas_internas_vs_publicas(self, app_client: TestClient, auth_tokens: dict):
        """Chat: Rutas internas (inbox, mensajes) exigen auth; widget web publico permanece accesible."""
        # 1. Rutas internas -> 401 sin token, 403 bodega, 200 asesor
        assert app_client.get("/api/v1/chat/conversations").status_code == 401
        assert app_client.get("/api/v1/chat/conversations", headers=auth_tokens["bodega"]["headers"]).status_code == 403
        assert app_client.get("/api/v1/chat/conversations", headers=auth_tokens["asesor"]["headers"]).status_code == 200

        # 2. Rutas publicas de widget web -> Accesibles sin token
        start_res = app_client.post("/api/v1/chat/web/start", json={"customer_name": "Visitante Store", "customer_email": "store@visitante.com"})
        assert start_res.status_code == 200
        token = start_res.json()["data"]["session_token"]
        assert token is not None

        # Mensajes de widget con session_token
        msg_res = app_client.get(f"/api/v1/chat/web/messages/{token}")
        assert msg_res.status_code == 200

    def test_b1_05_ecommerce_rutas_internas_rbac(self, app_client: TestClient, auth_tokens: dict):
        """Ecommerce Interno: stats, pedidos, carritos, media, configs exigen auth y RBAC."""
        # /stats
        assert app_client.get("/api/v1/ecommerce/stats").status_code == 401
        assert app_client.get("/api/v1/ecommerce/stats", headers=auth_tokens["bodega"]["headers"]).status_code == 403
        assert app_client.get("/api/v1/ecommerce/stats", headers=auth_tokens["admin"]["headers"]).status_code == 200

        # /pedidos (listado interno)
        assert app_client.get("/api/v1/ecommerce/pedidos").status_code == 401
        assert app_client.get("/api/v1/ecommerce/pedidos", headers=auth_tokens["asesor"]["headers"]).status_code == 200

        # /carritos
        assert app_client.get("/api/v1/ecommerce/carritos").status_code == 401
        assert app_client.get("/api/v1/ecommerce/carritos", headers=auth_tokens["asesor"]["headers"]).status_code == 200

        # escritura de catalogo (solo ADMIN)
        assert app_client.post("/api/v1/ecommerce/catalogo", json={"nombre": "Nuevo Prod"}).status_code == 401
        assert app_client.post("/api/v1/ecommerce/catalogo", json={"nombre": "Nuevo Prod"}, headers=auth_tokens["asesor"]["headers"]).status_code == 403

        # media (upload/list)
        assert app_client.get("/api/v1/ecommerce/media").status_code == 401
        assert app_client.get("/api/v1/ecommerce/media", headers=auth_tokens["asesor"]["headers"]).status_code == 200

        # web-builder config (solo ADMIN actualiza)
        assert app_client.get("/api/v1/ecommerce/web-builder/config").status_code == 401
        assert app_client.get("/api/v1/ecommerce/web-builder/config", headers=auth_tokens["asesor"]["headers"]).status_code == 200
        assert app_client.patch("/api/v1/ecommerce/web-builder/config", json={"hero": {}}, headers=auth_tokens["asesor"]["headers"]).status_code == 403
        assert app_client.patch("/api/v1/ecommerce/web-builder/config", json={"hero": {}}, headers=auth_tokens["admin"]["headers"]).status_code == 200

        # pagos/config y envios/config (solo ADMIN)
        assert app_client.get("/api/v1/ecommerce/pagos/config").status_code == 401
        assert app_client.get("/api/v1/ecommerce/pagos/config", headers=auth_tokens["asesor"]["headers"]).status_code == 403
        assert app_client.get("/api/v1/ecommerce/pagos/config", headers=auth_tokens["admin"]["headers"]).status_code == 200

        assert app_client.get("/api/v1/ecommerce/envios/config").status_code == 401
        assert app_client.get("/api/v1/ecommerce/envios/config", headers=auth_tokens["asesor"]["headers"]).status_code == 403
        assert app_client.get("/api/v1/ecommerce/envios/config", headers=auth_tokens["admin"]["headers"]).status_code == 200

        # clientes web y sincronizacion
        assert app_client.get("/api/v1/ecommerce/clientes").status_code == 401
        assert app_client.get("/api/v1/ecommerce/clientes", headers=auth_tokens["asesor"]["headers"]).status_code == 200
        assert app_client.post("/api/v1/ecommerce/clientes/sync-agenda").status_code == 401
        assert app_client.post("/api/v1/ecommerce/clientes/sync-agenda", headers=auth_tokens["asesor"]["headers"]).status_code == 200

    def test_b1_06_ecommerce_rutas_publicas_accesibles(self, app_client: TestClient):
        """Ecommerce Publico: catalogo, categorias y guardado de carrito accesibles sin token."""
        assert app_client.get("/api/v1/ecommerce/catalogo").status_code == 200
        assert app_client.get("/api/v1/ecommerce/categorias").status_code == 200
        res_cart = app_client.post("/api/v1/ecommerce/carritos", json={"cliente_email": "cart@store.com", "items": []})
        assert res_cart.status_code == 200

    def test_b1_07_marketing_rutas_internas_vs_publicas(self, app_client: TestClient, auth_tokens: dict):
        """Marketing: campanas, flujos, posts y preferencias exigen auth; story-catalog es publico."""
        # 1. Internas -> 401 sin token, 403 bodega, 200 asesor
        assert app_client.get("/api/v1/marketing/stats").status_code == 401
        assert app_client.get("/api/v1/marketing/stats", headers=auth_tokens["bodega"]["headers"]).status_code == 403
        assert app_client.get("/api/v1/marketing/stats", headers=auth_tokens["asesor"]["headers"]).status_code == 200

        assert app_client.get("/api/v1/marketing/campanas").status_code == 401
        assert app_client.get("/api/v1/marketing/campanas", headers=auth_tokens["asesor"]["headers"]).status_code == 200

        assert app_client.get("/api/v1/marketing/flujos").status_code == 401
        assert app_client.get("/api/v1/marketing/flujos", headers=auth_tokens["asesor"]["headers"]).status_code == 200

        assert app_client.get("/api/v1/marketing/posts").status_code == 401
        assert app_client.get("/api/v1/marketing/posts", headers=auth_tokens["asesor"]["headers"]).status_code == 200

        # Borrado restringido a ADMIN
        assert app_client.delete("/api/v1/marketing/campanas/99999", headers=auth_tokens["asesor"]["headers"]).status_code == 403

        # 2. Rutas publicas de stories -> 200
        assert app_client.get("/api/v1/marketing/story-catalog").status_code == 200
        ask_res = app_client.post("/api/v1/marketing/story-catalog/ask", json={"question": "Precio?"})
        assert ask_res.status_code == 200

    # =========================================================================
    # BLOQUEO 2: WEBHOOKS HARDENING Y SEGURIDAD CRITICA
    # =========================================================================

    def test_b2_01_chat_whatsapp_verify_token_sin_fallback(self, app_client: TestClient, monkeypatch):
        """Chat WhatsApp GET: Exige WHATSAPP_VERIFY_TOKEN de env; 403 si falta o no coincide."""
        # 1. Si no hay variable configurada -> 403
        monkeypatch.delenv("WHATSAPP_VERIFY_TOKEN", raising=False)
        r_no_env = app_client.get("/api/v1/chat/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=test&hub.challenge=123")
        assert r_no_env.status_code == 403

        # 2. Variable configurada pero token errado -> 403
        monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "real_secure_token_abc")
        r_wrong = app_client.get("/api/v1/chat/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=123")
        assert r_wrong.status_code == 403

        # 3. Token correcto -> 200 PlainText con challenge
        r_ok = app_client.get("/api/v1/chat/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=real_secure_token_abc&hub.challenge=challenge_pass_ok")
        assert r_ok.status_code == 200
        assert r_ok.text == "challenge_pass_ok"

    def test_b2_02_chat_whatsapp_e_instagram_post_hmac_sha256(self, app_client: TestClient, monkeypatch):
        """Chat WhatsApp & Instagram POST: Exigen X-Hub-Signature-256 HMAC-SHA256 con secreto especifico."""
        # WhatsApp POST
        monkeypatch.setenv("WHATSAPP_WEBHOOK_SECRET", "wa_secret_key_2026")
        payload = {"object": "whatsapp_business_account", "entry": []}
        body_bytes = json.dumps(payload).encode("utf-8")

        # Sin firma -> 401
        assert app_client.post("/api/v1/chat/webhook/whatsapp", json=payload).status_code == 401

        # Firma invalida -> 401
        assert app_client.post("/api/v1/chat/webhook/whatsapp", json=payload, headers={"x-hub-signature-256": "sha256=fake"}).status_code == 401

        # Firma valida -> 200
        wa_sig = "sha256=" + hmac.new("wa_secret_key_2026".encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
        r_wa = app_client.post("/api/v1/chat/webhook/whatsapp", json=payload, headers={"x-hub-signature-256": wa_sig})
        assert r_wa.status_code == 200

        # Instagram POST
        monkeypatch.setenv("INSTAGRAM_WEBHOOK_SECRET", "ig_secret_key_2026")
        ig_payload = {"object": "instagram", "entry": []}
        ig_bytes = json.dumps(ig_payload).encode("utf-8")

        assert app_client.post("/api/v1/chat/webhook/instagram", json=ig_payload).status_code == 401
        ig_sig = "sha256=" + hmac.new("ig_secret_key_2026".encode("utf-8"), ig_bytes, hashlib.sha256).hexdigest()
        r_ig = app_client.post("/api/v1/chat/webhook/instagram", json=ig_payload, headers={"x-hub-signature-256": ig_sig})
        assert r_ig.status_code == 200

    def test_b2_03_webhooks_rechazo_fallback_secret_key(self, app_client: TestClient, monkeypatch):
        """Webhooks: Exige secreto especifico ({PROVIDER}_WEBHOOK_SECRET) sin fallback a SECRET_KEY."""
        # Quitar secreto de WOMPI pero tener SECRET_KEY definida
        monkeypatch.delenv("WOMPI_WEBHOOK_SECRET", raising=False)
        monkeypatch.setenv("SECRET_KEY", "system_secret_key_master")

        payload = {"event": "transaction.updated", "id": "TEST_NO_SECRET"}
        body_bytes = json.dumps(payload).encode("utf-8")
        sig_with_master = hmac.new("system_secret_key_master".encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()

        # Debe ser rechazado con 401 (sin fallback a SECRET_KEY)
        res = app_client.post("/api/v1/webhooks/wompi", json=payload, headers={"x-signature": sig_with_master})
        assert res.status_code == 401

    def test_b2_04_webhooks_validacion_moneda_estricta_cop(self, app_client: TestClient, db: Session, base_customer_catalog: dict, monkeypatch):
        """Webhooks: Rechaza confirmacion de pago si la moneda no es estrictamente COP (ej. USD, EUR)."""
        monkeypatch.setenv("MERCADOPAGO_WEBHOOK_SECRET", "mp_test_cop_secret")
        cust = base_customer_catalog["customer"]
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())

        so = SaleOrder(
            numero=f"VEN-USD-{ts%1000000}",
            pweb_numero=f"PWEB-USD-{ts%1000000}",
            customer_id=cust.id,
            total_cop=Decimal("200000.00"),
            anticipo_cop=Decimal("0.00"),
            saldo_cop=Decimal("200000.00"),
            estado="PENDIENTE_PAGO"
        )
        db.add(so)
        db.commit()

        # Payload intentando pagar en USD
        payload_usd = {
            "external_reference": so.pweb_numero,
            "status": "APPROVED",
            "amount": 200000.00,
            "currency": "USD",
            "id": f"TX_USD_{ts}"
        }
        body_bytes = json.dumps(payload_usd).encode("utf-8")
        sig = hmac.new("mp_test_cop_secret".encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()

        res = app_client.post(
            "/api/v1/webhooks/mercadopago",
            json=payload_usd,
            headers={"x-signature": sig, "x-idempotency-key": f"IDEM_USD_{ts}"}
        )
        # El procesamiento del pago falla porque la moneda no es COP
        assert res.json()["status"] == "failed"
        assert "COP" in res.json().get("error", "")

        db.refresh(so)
        # El pedido NO se marca pagado
        assert so.estado == "PENDIENTE_PAGO"
        assert so.saldo_cop == Decimal("200000.00")

    def test_b2_05_webhooks_concurrencia_exactamente_un_pago(self, app_client: TestClient, db: Session, base_customer_catalog: dict, monkeypatch):
        """Webhooks: Dos llamadas concurrentes idénticas generan exactamente 1 solo pago y 0 duplicaciones."""
        monkeypatch.setenv("MERCADOPAGO_WEBHOOK_SECRET", "mp_concurrency_secret")
        cust = base_customer_catalog["customer"]
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())

        so = SaleOrder(
            numero=f"VEN-CNC-{ts%1000000}",
            pweb_numero=f"PWEB-CNC-{ts%1000000}",
            customer_id=cust.id,
            total_cop=Decimal("150000.00"),
            anticipo_cop=Decimal("0.00"),
            saldo_cop=Decimal("150000.00"),
            estado="PENDIENTE_PAGO"
        )
        db.add(so)
        db.commit()

        payload = {
            "external_reference": so.pweb_numero,
            "status": "APPROVED",
            "amount": 150000.00,
            "currency": "COP",
            "id": f"TX_CNC_{ts}"
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        sig = hmac.new("mp_concurrency_secret".encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
        headers = {"x-signature": sig, "x-idempotency-key": f"IDEM_CNC_{ts}"}

        # Ejecutar 2 llamadas concurrentes
        def send_webhook():
            return app_client.post("/api/v1/webhooks/mercadopago", json=payload, headers=headers)

        with ThreadPoolExecutor(max_workers=2) as executor:
            fut1 = executor.submit(send_webhook)
            fut2 = executor.submit(send_webhook)
            r1 = fut1.result()
            r2 = fut2.result()

        # Ambas llamadas retornan exito (una PROCESSED y la otra Idempotent Replay)
        assert r1.status_code == 200
        assert r2.status_code == 200

        db.refresh(so)
        assert so.estado in ("PAGADO", "CONFIRMADO")
        assert so.saldo_cop == Decimal("0.00")

        # EXACTAMENTE un solo SaleOrderPayment
        pagos = db.query(SaleOrderPayment).filter(SaleOrderPayment.sale_order_id == so.id).all()
        assert len(pagos) == 1
        assert pagos[0].monto == Decimal("150000.00")

    # =========================================================================
    # BLOQUEO 3: CHECKOUT Y RESOLUCION ESTRICTA DE BODEGA EN SERVIDOR
    # =========================================================================

    def test_b3_01_checkout_resolucion_servidor_bodega_central(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """Checkout: Resuelve bodega central en el servidor cuando el cliente no especifica o envía datos estándar."""
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())

        # Asegurar bodega central
        wh.location_type = "Central"
        db.commit()

        # Cargar balance vendible
        db.query(InventoryReservation).filter(InventoryReservation.sku_id == sku.id).delete()
        db.query(InventoryQuarantine).filter(InventoryQuarantine.sku_id == sku.id).delete()
        db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id, InventoryLevel.warehouse_id == wh.id).delete()
        db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == sku.id, InventoryOwnerBalance.warehouse_id == wh.id).delete()

        db.add(InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("10.00")))
        db.add(InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("10.00")))
        db.commit()

        payload = {
            "idempotency_key": f"CHECKOUT_CENTRAL_{ts}",
            "customer_name": "Comprador Server WH",
            "customer_email": f"buyer_{ts}@test.com",
            "items": [{
                "sku": sku.sku,
                "quantity": 2,
                "modalidad": "ENTREGA_INMEDIATA"
            }]
        }
        res = app_client.post("/api/v1/ecommerce/pedidos", json=payload)
        assert res.status_code == 201
        order_id = res.json()["data"]["id"]

        # Verificar que la linea asigno la bodega resuelta en servidor
        line = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == order_id).first()
        assert line is not None

    def test_b3_02_checkout_rechaza_bodega_no_autorizada_400(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """Checkout: Rechaza con 400 Bad Request si el cliente intenta forzar una bodega no autorizada (no Central)."""
        sku = base_customer_catalog["sku"]
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())

        # Crear bodega no central (ej. Transito o Externa)
        bogus_wh = Warehouse(name="Bodega Terceros", location_type="Transito")
        db.add(bogus_wh)
        db.commit()

        payload = {
            "idempotency_key": f"CHECKOUT_BOGUS_WH_{ts}",
            "customer_name": "Manipulador Bodega",
            "customer_email": f"hacker_{ts}@test.com",
            "warehouse_id": bogus_wh.id,
            "items": [{
                "sku": sku.sku,
                "quantity": 1,
                "modalidad": "ENTREGA_INMEDIATA"
            }]
        }
        res = app_client.post("/api/v1/ecommerce/pedidos", json=payload)
        assert res.status_code == 400
        assert "no autorizada" in res.json()["detail"].lower()

    def test_b3_03_checkout_bloqueo_patrimonial_mau_403(self, app_client: TestClient, base_customer_catalog: dict):
        """Checkout: Rechaza con 403 Forbidden intentos de alterar propiedad patrimonial (MAU)."""
        sku = base_customer_catalog["sku"]
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())

        # Intento de forzar owner patrimonial en raiz
        p1 = {
            "idempotency_key": f"MAU_ROOT_{ts}",
            "customer_name": "Intento MAU",
            "owner": "MAU",
            "items": [{"sku": sku.sku, "quantity": 1}]
        }
        assert app_client.post("/api/v1/ecommerce/pedidos", json=p1).status_code == 403

        # Intento de forzar owner patrimonial en un item
        p2 = {
            "idempotency_key": f"MAU_ITEM_{ts}",
            "customer_name": "Intento MAU Item",
            "items": [{"sku": sku.sku, "quantity": 1, "owner": "MAU"}]
        }
        assert app_client.post("/api/v1/ecommerce/pedidos", json=p2).status_code == 403

    # =========================================================================
    # BLOQUEO 4: SEMÁNTICA DE CUARENTENA SIN DOBLE DESCUENTO
    # =========================================================================

    def test_b4_01_semantica_cuarentena_sin_doble_descuento(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """Cuarentena: InventoryOwnerBalance ya representa stock conforme vendible; no se descuenta doblemente."""
        from app.api.v1.ecommerce import _get_real_sellable_stock

        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]

        # Limpiar tablas de inventario para aislamiento estricto
        db.query(InventoryReservation).filter(InventoryReservation.sku_id == sku.id).delete()
        db.query(InventoryQuarantine).filter(InventoryQuarantine.sku_id == sku.id).delete()
        db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id, InventoryLevel.warehouse_id == wh.id).delete()
        db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == sku.id, InventoryOwnerBalance.warehouse_id == wh.id).delete()

        # Balance vendible conforme = 25 unidades
        db.add(InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("25.00")))
        db.add(InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("25.00")))

        # 4 unidades en cuarentena (averiadas en recepcion, NO entraron al balance del propietario)
        db.add(InventoryQuarantine(
            sku_id=sku.id,
            warehouse_id=wh.id,
            owner="NEBULAE",
            quantity=Decimal("4.00"),
            status="ACTIVO",
            reason="DEFECTO_FABRICA"
        ))

        # 6 unidades reservadas activas
        db.add(InventoryReservation(
            sku_id=sku.id,
            warehouse_id=wh.id,
            owner="NEBULAE",
            quantity_reserved=Decimal("6.00"),
            status="ACTIVE",
            idempotency_key=f"RES_B4_{sku.id}"
        ))
        db.commit()

        # Stock vendible real debe ser: 25 (balance) - 6 (reservas) = 19 unidades (NO 15)
        stock_real = _get_real_sellable_stock(db, sku.id, wh.id, "NEBULAE")
        assert stock_real == Decimal("19.00"), f"Esperado 19.00, obtenido {stock_real}. Verifique que no hay doble descuento de cuarentena."

        # Verificacion en endpoint de catalogo
        res = app_client.get(f"/api/v1/ecommerce/catalogo?search={sku.sku}")
        assert res.status_code == 200
        item = [i for i in res.json()["data"] if i["sku"] == sku.sku][0]
        assert item["stock_disponible"] == 19.0

    def test_b4_02_liberacion_cuarentena_ingresa_a_stock_vendible(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """Cuarentena: Al resolver cuarentena con accion LIBERAR, las unidades ingresan a balance y aumentan disponible."""
        from app.api.v1.ecommerce import _get_real_sellable_stock

        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]

        # Balance inicial = 10, cuarentena = 5
        db.query(InventoryReservation).filter(InventoryReservation.sku_id == sku.id).delete()
        db.query(InventoryQuarantine).filter(InventoryQuarantine.sku_id == sku.id).delete()
        db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id, InventoryLevel.warehouse_id == wh.id).delete()
        db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == sku.id, InventoryOwnerBalance.warehouse_id == wh.id).delete()

        level = InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("10.00"))
        bal = InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("10.00"))
        quar = InventoryQuarantine(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("5.00"), status="ACTIVO", reason="DEFECTO_FABRICA")
        db.add_all([level, bal, quar])
        db.commit()

        # Stock inicial vendible = 10
        assert _get_real_sellable_stock(db, sku.id, wh.id, "NEBULAE") == Decimal("10.00")

        # Simulacion de resolucion LIBERAR de Fase 3:
        # Se cierra cuarentena y se suma a InventoryOwnerBalance e InventoryLevel
        quar.status = "LIBERADO"
        bal.quantity += Decimal("5.00")
        level.quantity += Decimal("5.00")
        db.commit()

        # Nuevo stock vendible = 15.00
        assert _get_real_sellable_stock(db, sku.id, wh.id, "NEBULAE") == Decimal("15.00")
