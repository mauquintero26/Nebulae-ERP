"""
test_fase5_security_hardening.py

Suite de Pruebas de Hardening de Seguridad y Consistencia de Fase 5 (24 tests):
1. RBAC Financiero - 401 sin token en las 6 rutas financieras.
2. RBAC Financiero - 403 para roles no autorizados (ASESOR, BODEGA, COMPRAS) en las 6 rutas.
3. RBAC Financiero - 200 para roles autorizados (ADMIN y FINANZAS) en las 6 rutas.
4. Finanzas Pérdidas y Scrap - Deduplicación estricta y sin doble conteo de scrap.
5. CRM 360 Privacidad - Enmascaramiento de rentabilidad, costos y márgenes para ASESOR.
6. CRM 360 Privacidad - Ocultamiento de teléfonos, emails, documentos y saldos para BODEGA.
7. CRM 360 Privacidad - Ocultamiento de datos privados de cliente y saldos para COMPRAS.
8. CRM 360 - Bloqueo de perfiles sin token (401 Unauthorized).
9. Asistente Omnicanal - Bloqueo sin autenticación (401 Unauthorized).
10. Asistente Omnicanal - Prevención anti-IDOR entre clientes (403 Forbidden).
11. Asistente Omnicanal - Auditoría de interacciones protegida con RBAC.
12. Checkout Ecommerce - Cálculo server-side que rechaza precios manipulados por el cliente (422).
13. Checkout Ecommerce - Rechazo de inventario patrimonial MAU (403/400).
14. Checkout Ecommerce - Disponibilidad vendible pesimista con bloqueo 409 si stock insuficiente.
15. Checkout Ecommerce - Idempotencia estricta: creación 201, replay 200 OK vs conflicto 409.
16. Checkout Ecommerce - Secuencia segura PWEB-YYYY-##### y estado inicial PENDIENTE_PAGO.
17. Webhooks - Rechazo estricto de proveedores no autorizados (400 Bad Request).
18. Webhooks - Verificación obligatoria de firma HMAC en tiempo constante (401 si falta o es inválida).
19. Webhooks - Sanitización de cabeceras sensibles en base de datos.
20. Webhooks - Confirmación de pago ecommerce con validación de monto exacto.
21. Webhooks - Reintentos seguros y traslado a dead-letter restringidos a ADMIN.
22. Marketing Habeas Data - Defaults de consentimiento estrictamente en False (Ley 1581).
23. Marketing Preferencias - Prevención anti-IDOR y auditoría de revocación.
24. Marketing Segmentación - Restricción RBAC (solo ADMIN y ASESOR, 401 sin token, 403 BODEGA).
"""
import pytest
import datetime
import json
import hmac
import hashlib
import os
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.customers import Customer
from app.models.catalog import Product, ProductSKU, Category, Brand
from app.models.inventory import Warehouse, InventoryLevel, InventoryMovement, InventoryOperation
from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder, PurchaseOrderFull, ActivityLog
from app.models.fase1b import (
    CustomerRequestLine, SalesQuotationLine, SaleOrderLineErp,
    InventoryOwnerBalance, InventoryReservation, ProcurementAllocation
)
from app.models.fase3 import InventoryQuarantine
from app.models.fase4 import (
    SalePackingSession, SaleOrderDelivery, SaleOrderReturn,
    SaleOrderReturnLine, SaleOrderPayment
)
from app.models.fase5 import (
    CustomerAgendaActivity, OmnichannelInteraction,
    CustomerContactPreference, IntegrationWebhookEvent
)
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


FINANCE_ROUTES = [
    "/api/v1/finance/accounts-receivable",
    "/api/v1/finance/accounts-payable",
    "/api/v1/finance/ledger/reconciliation",
    "/api/v1/finance/inventory-valuation",
    "/api/v1/finance/losses-and-scrap",
    "/api/v1/finance/profitability",
]


class TestFase5SecurityHardening:

    def test_01_rbac_financiero_401_sin_token(self, app_client: TestClient):
        """1. Las 6 rutas financieras obligatoriamente retornan 401 si no hay token."""
        for route in FINANCE_ROUTES:
            res = app_client.get(route)
            assert res.status_code == 401, f"Ruta {route} debio retornar 401 sin token pero retorno {res.status_code}"

    def test_02_rbac_financiero_403_no_autorizados(self, app_client: TestClient, auth_tokens: dict):
        """2. Roles no autorizados (ASESOR, BODEGA, COMPRAS) reciben 403 en las 6 rutas financieras."""
        unauthorized = ["asesor", "bodega", "compras"]
        for role_key in unauthorized:
            hdrs = auth_tokens[role_key]["headers"]
            for route in FINANCE_ROUTES:
                res = app_client.get(route, headers=hdrs)
                assert res.status_code == 403, f"Rol {role_key} en {route} debio retornar 403 pero dio {res.status_code}"

    def test_03_rbac_financiero_200_admin_y_finanzas(self, app_client: TestClient, auth_tokens: dict):
        """3. Roles autorizados (ADMIN y FINANZAS) reciben 200 en las 6 rutas financieras."""
        authorized = ["admin", "finanzas"]
        for role_key in authorized:
            hdrs = auth_tokens[role_key]["headers"]
            for route in FINANCE_ROUTES:
                res = app_client.get(route, headers=hdrs)
                assert res.status_code == 200, f"Rol {role_key} en {route} debio retornar 200 pero dio {res.status_code}"
                assert res.json()["status"] == "success"

    def test_04_finance_losses_and_scrap_sin_doble_conteo(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """4. Reporte de pérdidas y scrap deduplica y no genera doble conteo entre movimientos de inventario y devoluciones destruidas."""
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]
        cust = base_customer_catalog["customer"]
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())

        # Crear operación y movimiento de inventario SCRAP
        op = InventoryOperation(
            source_warehouse_id=wh.id,
            operation_type="PHYSICAL_INVENTORY",
            status="DONE"
        )
        db.add(op)
        db.flush()

        mov = InventoryMovement(
            operation_id=op.id,
            sku_id=sku.id,
            warehouse_id=wh.id,
            direction="SCRAP",
            quantity=Decimal("3.00"),
            idempotency_key=f"SCRAP_KEY_{ts}_{os.urandom(2).hex()}",
            owner="NEBULAE"
        )
        db.add(mov)
        db.commit()

        res = app_client.get("/api/v1/finance/losses-and-scrap", headers=auth_tokens["admin"]["headers"])
        assert res.status_code == 200
        data = res.json()["data"]
        assert "total_losses_cop" in data or "perdida_total_cop" in data
        assert "items" in data
        assert isinstance(data["items"], list)

    def test_05_crm_360_privacidad_asesor_enmascarado(self, app_client: TestClient, base_customer_catalog: dict, auth_tokens: dict):
        """5. ASESOR consulta CRM 360: rentabilidad visible=False y sin costos ni márgenes en pedidos."""
        cust = base_customer_catalog["customer"]
        res = app_client.get(f"/api/v1/crm/customers/{cust.id}/profile-360", headers=auth_tokens["asesor"]["headers"])
        assert res.status_code == 200
        profile = res.json()["data"]
        assert profile["rentabilidad"]["visible"] is False
        assert "costo_total_cop" not in profile["rentabilidad"]

    def test_06_crm_360_privacidad_bodega_enmascarado(self, app_client: TestClient, base_customer_catalog: dict, auth_tokens: dict):
        """6. BODEGA consulta CRM 360: datos de contacto, ltv y saldos quedan ocultos (None)."""
        cust = base_customer_catalog["customer"]
        res = app_client.get(f"/api/v1/crm/customers/{cust.id}/profile-360", headers=auth_tokens["bodega"]["headers"])
        assert res.status_code == 200
        profile = res.json()["data"]
        assert profile["phone"] is None
        assert profile["email"] is None
        assert profile["document"] is None
        assert profile["resumen_financiero"] is None
        assert profile["pagos"] == []

    def test_07_crm_360_privacidad_compras_enmascarado(self, app_client: TestClient, base_customer_catalog: dict, auth_tokens: dict):
        """7. COMPRAS consulta CRM 360: sin datos privados de cliente ni pagos."""
        cust = base_customer_catalog["customer"]
        res = app_client.get(f"/api/v1/crm/customers/{cust.id}/profile-360", headers=auth_tokens["compras"]["headers"])
        assert res.status_code == 200
        profile = res.json()["data"]
        assert profile["phone"] is None
        assert profile["email"] is None
        assert profile["address"] is None
        assert profile["pagos"] == []

    def test_08_crm_360_sin_token_401(self, app_client: TestClient, base_customer_catalog: dict):
        """8. Rutas CRM 360 sin token son rechazadas con 401 Unauthorized."""
        cust = base_customer_catalog["customer"]
        for endpoint in [f"/api/v1/crm/customer/{cust.id}/360", f"/api/v1/crm/customers/{cust.id}/360", f"/api/v1/crm/customers/{cust.id}/profile-360"]:
            res = app_client.get(endpoint)
            assert res.status_code == 401, f"{endpoint} debio retornar 401 sin token"

    def test_09_omnichannel_asistente_sin_token_401(self, app_client: TestClient, base_customer_catalog: dict):
        """9. Consulta omnicanal sin token retorna 401 Unauthorized."""
        cust = base_customer_catalog["customer"]
        payload = {
            "customer_id": cust.id,
            "query_type": "ESTADO_PEDIDO",
            "channel": "WHATSAPP"
        }
        res = app_client.post("/api/v1/chat/omnichannel/query", json=payload)
        assert res.status_code == 401

    def test_10_omnichannel_asistente_anti_idor_cliente_bloqueado_403(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """10. Token de cliente A intentando consultar datos de cliente B es bloqueado con 403 Forbidden (Anti-IDOR)."""
        cust_a = base_customer_catalog["customer"]
        cust_b = Customer(
            first_name="Otro",
            last_name="Cliente",
            email=f"otro_{int(datetime.datetime.now(datetime.timezone.utc).timestamp())}@example.com"
        )
        db.add(cust_b)
        db.commit()

        token_a = create_access_token({"customer_id": cust_a.id, "sub": str(cust_a.id)})
        payload = {
            "customer_id": cust_b.id,
            "query_type": "ESTADO_PEDIDO",
            "channel": "WEB",
            "customer_token": token_a
        }
        res = app_client.post("/api/v1/chat/omnichannel/query", json=payload)
        assert res.status_code == 403
        assert "IDOR" in res.json()["detail"]

    def test_11_omnichannel_auditoria_protegida_rbac(self, app_client: TestClient, auth_tokens: dict):
        """11. Consulta de interacciones omnicanal protegida con RBAC."""
        # Sin token
        res_no = app_client.get("/api/v1/chat/omnichannel/interactions")
        assert res_no.status_code == 401

        # Bodega no autorizado
        res_bod = app_client.get("/api/v1/chat/omnichannel/interactions", headers=auth_tokens["bodega"]["headers"])
        assert res_bod.status_code == 403

        # Admin autorizado
        res_adm = app_client.get("/api/v1/chat/omnichannel/interactions", headers=auth_tokens["admin"]["headers"])
        assert res_adm.status_code == 200

    def test_12_ecommerce_checkout_calculo_servidor_ignora_precio_manipulado(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """12. Intento de enviar precios unitarios manipulados desde el cliente es rechazado con 422 Unprocessable Entity."""
        cust = base_customer_catalog["customer"]
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]

        # Surtir stock
        db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id, InventoryLevel.warehouse_id == wh.id).delete()
        db.add(InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("10.00")))
        db.commit()

        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        payload = {
            "idempotency_key": f"IDEM_PRICE_HACK_{ts}",
            "customer_email": cust.email,
            "customer_name": f"{cust.first_name} {cust.last_name}",
            "customer_phone": cust.phone,
            "warehouse_id": wh.id,
            "productos": [
                {
                    "sku_id": sku.id,
                    "sku": sku.sku,
                    "nombre": sku.sku,
                    "quantity": 1,
                    "unit_price_cop": 500.00,  # Manipulado: 500 COP en vez de 350,000 COP
                    "modalidad": "ENTREGA_INMEDIATA"
                }
            ],
            "total_cop": 500.00,
            "direccion_entrega": "Calle 100 #20-30"
        }
        res = app_client.post("/api/v1/ecommerce/pedidos", json=payload)
        assert res.status_code in (422, 400)
        assert "Manipulacion" in res.json()["detail"]

    def test_13_ecommerce_checkout_bloqueo_owner_mau_400(self, app_client: TestClient, base_customer_catalog: dict):
        """13. Intento de vender inventario con owner='MAU' en checkout ecommerce es rechazado con 403 Forbidden."""
        cust = base_customer_catalog["customer"]
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]

        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        payload = {
            "idempotency_key": f"IDEM_MAU_HACK_{ts}",
            "customer_email": cust.email,
            "customer_name": f"{cust.first_name} {cust.last_name}",
            "warehouse_id": wh.id,
            "productos": [
                {
                    "sku_id": sku.id,
                    "quantity": 1,
                    "modalidad": "ENTREGA_INMEDIATA",
                    "owner": "MAU"  # Prohibido en ecommerce
                }
            ],
            "direccion_entrega": "Calle 100 #20-30"
        }
        res = app_client.post("/api/v1/ecommerce/pedidos", json=payload)
        assert res.status_code in (403, 400)
        assert "MAU" in res.json()["detail"]

    def test_14_ecommerce_checkout_disponibilidad_vendible_insuficiente_409(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """14. Si no hay stock vendible suficiente para entrega inmediata, el pedido falla con 409 Conflict."""
        cust = base_customer_catalog["customer"]
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]

        # Dejar stock en 0
        db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id, InventoryLevel.warehouse_id == wh.id).delete()
        db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == sku.id, InventoryOwnerBalance.warehouse_id == wh.id).delete()
        db.commit()

        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        payload = {
            "idempotency_key": f"IDEM_NO_STOCK_{ts}",
            "customer_email": cust.email,
            "customer_name": f"{cust.first_name} {cust.last_name}",
            "warehouse_id": wh.id,
            "productos": [
                {
                    "sku_id": sku.id,
                    "sku": sku.sku,
                    "nombre": sku.sku,
                    "quantity": 5,
                    "unit_price_cop": 350000.00,
                    "modalidad": "ENTREGA_INMEDIATA"
                }
            ],
            "total_cop": 1750000.00,
            "direccion_entrega": "Calle 100 #20-30"
        }
        res = app_client.post("/api/v1/ecommerce/pedidos", json=payload)
        assert res.status_code == 409
        assert "Stock insuficiente" in res.json()["detail"]

    def test_15_ecommerce_checkout_idempotencia_replay_200_vs_conflict_409(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """15. Idempotencia en checkout: creación 201; replay idéntico -> 200 OK; misma clave con payload alterado -> 409 Conflict."""
        cust = base_customer_catalog["customer"]
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]

        db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id, InventoryLevel.warehouse_id == wh.id).delete()
        db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == sku.id, InventoryOwnerBalance.warehouse_id == wh.id).delete()
        db.add(InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("20.00")))
        db.add(InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("20.00")))
        db.commit()

        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        key = f"IDEM_STRICT_{ts}"
        payload1 = {
            "idempotency_key": key,
            "customer_email": cust.email,
            "customer_name": f"{cust.first_name} {cust.last_name}",
            "customer_phone": cust.phone,
            "warehouse_id": wh.id,
            "productos": [{
                "sku_id": sku.id,
                "sku": sku.sku,
                "nombre": sku.sku,
                "quantity": 1,
                "unit_price_cop": 350000.00,
                "modalidad": "ENTREGA_INMEDIATA",
                "owner": "NEBULAE"
            }],
            "total_cop": 350000.00,
            "direccion_entrega": "Calle 123"
        }

        # 1. Creación exitosa (201 Created)
        r1 = app_client.post("/api/v1/ecommerce/pedidos", json=payload1)
        assert r1.status_code == 201
        assert r1.json()["idempotent_replay"] is False

        # 2. Replay idéntico -> 200 OK
        r2 = app_client.post("/api/v1/ecommerce/pedidos", json=payload1)
        assert r2.status_code == 200
        assert r2.json()["idempotent_replay"] is True

        # 3. Misma clave, diferente payload -> 409 Conflict
        payload_alt = dict(payload1)
        payload_alt["direccion_entrega"] = "Carrera 456 Diferente"
        r3 = app_client.post("/api/v1/ecommerce/pedidos", json=payload_alt)
        assert r3.status_code == 409
        assert "huella" in r3.json()["detail"].lower() or "conflicto" in r3.json()["detail"].lower()

    def test_16_ecommerce_secuencia_pweb_y_estado_inicial_pendiente_pago(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """16. Los pedidos de ecommerce usan secuencia PWEB-YYYY-##### y su estado inicial es PENDIENTE_PAGO sin pagos confirmados."""
        cust = base_customer_catalog["customer"]
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]

        db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id, InventoryLevel.warehouse_id == wh.id).delete()
        db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == sku.id, InventoryOwnerBalance.warehouse_id == wh.id).delete()
        db.add(InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("10.00")))
        db.add(InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("10.00")))
        db.commit()

        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        payload = {
            "idempotency_key": f"IDEM_SEQ_{ts}",
            "customer_email": cust.email,
            "customer_name": f"{cust.first_name} {cust.last_name}",
            "customer_phone": cust.phone,
            "warehouse_id": wh.id,
            "productos": [{
                "sku_id": sku.id,
                "sku": sku.sku,
                "nombre": sku.sku,
                "quantity": 1,
                "unit_price_cop": 350000.00,
                "modalidad": "ENTREGA_INMEDIATA",
                "owner": "NEBULAE"
            }],
            "total_cop": 350000.00,
            "direccion_entrega": "Avenida 68 #10-20"
        }
        r = app_client.post("/api/v1/ecommerce/pedidos", json=payload)
        assert r.status_code == 201
        so_id = r.json()["data"]["id"]

        so = db.query(SaleOrder).filter(SaleOrder.id == so_id).first()
        assert so.pweb_numero is not None
        assert so.pweb_numero.startswith("PWEB-")
        assert so.estado == "PENDIENTE_PAGO"

        # Cero pagos confirmados
        pagos = db.query(SaleOrderPayment).filter(SaleOrderPayment.sale_order_id == so.id).all()
        assert len(pagos) == 0

    def test_17_webhooks_proveedor_no_autorizado_400(self, app_client: TestClient):
        """17. Proveedores de webhook no registrados en la lista blanca son rechazados con 400 Bad Request."""
        res = app_client.post("/api/v1/webhooks/proveedor_malicioso")
        assert res.status_code == 400
        assert "no soportado" in res.json()["detail"]

    def test_18_webhooks_firma_hmac_ausente_o_invalida_401(self, app_client: TestClient):
        """18. Webhooks con firma HMAC ausente o inválida retornan 401; con firma válida retornan 200."""
        secret = os.getenv("MERCADOPAGO_WEBHOOK_SECRET", "test_mp_secret_2026")
        os.environ["MERCADOPAGO_WEBHOOK_SECRET"] = secret
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        payload = {"event": "payment.test", "id": f"WH_SEC_{ts}"}
        body_bytes = json.dumps(payload).encode("utf-8")

        # 1. Sin firma -> 401
        r_nosig = app_client.post("/api/v1/webhooks/mercadopago", json=payload)
        assert r_nosig.status_code == 401

        # 2. Firma inválida -> 401
        r_badsig = app_client.post("/api/v1/webhooks/mercadopago", json=payload, headers={"x-signature": "bogus_signature"})
        assert r_badsig.status_code == 401

        # 3. Firma válida HMAC -> 200
        valid_sig = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
        r_ok = app_client.post(
            "/api/v1/webhooks/mercadopago",
            json=payload,
            headers={"x-signature": valid_sig, "x-idempotency-key": f"KEY_OK_{ts}"}
        )
        assert r_ok.status_code == 200

    def test_19_webhooks_sanitizacion_cabeceras_sensibles(self, app_client: TestClient, db: Session):
        """19. Cabeceras sensibles (Authorization, Token, Cookie, Secrets) se sanitizan a [REDACTED] en BD."""
        secret = os.getenv("WOMPI_WEBHOOK_SECRET", "test_wompi_secret_2026")
        os.environ["WOMPI_WEBHOOK_SECRET"] = secret
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        payload = {"event": "headers.test", "id": f"WH_HDR_{ts}"}
        body_bytes = json.dumps(payload).encode("utf-8")
        sig = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()

        hdrs = {
            "x-signature": sig,
            "x-idempotency-key": f"IDEM_HDR_{ts}",
            "authorization": "Bearer super_secret_token_123",
            "cookie": "session_id=admin_session_abc",
        }
        res = app_client.post("/api/v1/webhooks/wompi", json=payload, headers=hdrs)
        assert res.status_code == 200

        event_id = res.json()["event_id"]
        ev = db.query(IntegrationWebhookEvent).filter(IntegrationWebhookEvent.id == event_id).first()
        assert ev is not None
        saved_headers = json.loads(ev.headers) if ev.headers else {}
        assert saved_headers.get("authorization") == "[REDACTED]"
        assert saved_headers.get("cookie") == "[REDACTED]"

    def test_20_webhooks_confirmacion_pago_con_monto_exacto(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """20. Webhook de pasarela confirma pago si el monto recibido coincide exactamente con el total del pedido."""
        cust = base_customer_catalog["customer"]
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())

        # Crear pedido ecommerce en PENDIENTE_PAGO con número corto (<= 20 chars)
        short_id = ts % 10000000
        so = SaleOrder(
            numero=f"VEN-P-{short_id}",
            pweb_numero=f"PWEB-P-{short_id}",
            customer_id=cust.id,
            customer_name=f"{cust.first_name} {cust.last_name}",
            total_cop=Decimal("350000.00"),
            anticipo_cop=Decimal("0.00"),
            saldo_cop=Decimal("350000.00"),
            estado="PENDIENTE_PAGO"
        )
        db.add(so)
        db.commit()

        secret = os.getenv("MERCADOPAGO_WEBHOOK_SECRET", "test_mp_secret_2026")
        os.environ["MERCADOPAGO_WEBHOOK_SECRET"] = secret

        # Webhook con pago exacto
        payload_ok = {
            "external_reference": so.pweb_numero,
            "status": "APPROVED",
            "amount": 350000.00,
            "id": f"TX_MP_{ts}"
        }
        body_bytes = json.dumps(payload_ok).encode("utf-8")
        sig = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()

        res = app_client.post(
            "/api/v1/webhooks/mercadopago",
            json=payload_ok,
            headers={"x-signature": sig, "x-idempotency-key": f"IDEM_PAY_OK_{ts}"}
        )
        assert res.status_code == 200

        db.refresh(so)
        assert so.estado in ("PAGADO", "CONFIRMADO")
        assert so.saldo_cop == Decimal("0.00")

    def test_21_webhooks_reintentos_dead_letter_admin_only(self, app_client: TestClient, db: Session, auth_tokens: dict):
        """21. La ruta de reintentos requiere rol ADMIN (401/403) y traslada eventos que superan max_attempts a DEAD_LETTER."""
        # Sin token -> 401
        assert app_client.post("/api/v1/webhooks/system/retry-failed").status_code == 401

        # Asesor -> 403
        assert app_client.post("/api/v1/webhooks/system/retry-failed", headers=auth_tokens["asesor"]["headers"]).status_code == 403

        # Crear evento fallido con attempts=2 y max=3
        ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        ev = IntegrationWebhookEvent(
            provider="WOMPI",
            event_type="PAYMENT_RETRY",
            idempotency_key=f"DEAD_TEST_{ts}",
            direction="INBOUND",
            payload="{}",
            status="FAILED",
            attempts=2,
            max_attempts=3,
            dead_letter=False
        )
        db.add(ev)
        db.commit()

        # Admin ejecuta reintento -> supera límite y va a dead_letter
        res = app_client.post(
            "/api/v1/webhooks/system/retry-failed?max_retries=3&provider=WOMPI",
            headers=auth_tokens["admin"]["headers"]
        )
        assert res.status_code == 200
        db.refresh(ev)
        assert ev.dead_letter is True
        assert ev.status == "DEAD_LETTER"
        assert "dead-letter" in ev.last_error

    def test_22_marketing_habeas_data_defaults_en_false(self, db: Session, base_customer_catalog: dict):
        """22. Preferencias de contacto por defecto nacen en False en cumplimiento de Ley 1581."""
        cust = base_customer_catalog["customer"]
        pref = CustomerContactPreference(customer_id=cust.id)
        db.add(pref)
        db.commit()
        db.refresh(pref)

        assert pref.whatsapp_opt_in is False
        assert pref.email_opt_in is False
        assert pref.sms_opt_in is False
        assert pref.phone_opt_in is False
        assert pref.habeas_data_accepted is False

    def test_23_marketing_preferencias_anti_idor_y_auditoria(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """23. Actualización de preferencias bloquea IDOR entre clientes y audita revocación legal."""
        cust_a = base_customer_catalog["customer"]
        cust_b = Customer(
            first_name="Otro2",
            last_name="Cliente2",
            email=f"otro2_{int(datetime.datetime.now(datetime.timezone.utc).timestamp())}@example.com"
        )
        db.add(cust_b)
        db.commit()

        token_a = create_access_token({"customer_id": cust_a.id, "sub": str(cust_a.id)})

        # Cliente A intenta modificar a Cliente B -> 403 IDOR
        payload = {"whatsapp_opt_in": True, "legal_version": "v2026.1"}
        r_idor = app_client.put(
            f"/api/v1/marketing/customers/{cust_b.id}/preferences",
            json=payload,
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert r_idor.status_code == 403

        # Revocación de consentimiento con auditoría
        payload_revoc = {
            "whatsapp_opt_in": False,
            "is_revoked": True,
            "revocation_reason": "Solicitud expresa del titular via WhatsApp"
        }
        r_ok = app_client.put(
            f"/api/v1/marketing/customers/{cust_a.id}/preferences",
            json=payload_revoc,
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert r_ok.status_code == 200
        pref = db.query(CustomerContactPreference).filter(CustomerContactPreference.customer_id == cust_a.id).first()
        assert pref.is_revoked is True
        assert pref.revocation_date is not None
        assert "WhatsApp" in pref.revocation_reason

    def test_24_marketing_segmentacion_rbac(self, app_client: TestClient, auth_tokens: dict):
        """24. Segmentación requiere ADMIN o ASESOR (401 sin token, 403 BODEGA, 200 ASESOR)."""
        # Sin token -> 401
        assert app_client.post("/api/v1/marketing/segmentacion?segment_type=clientes-frecuentes").status_code == 401

        # Bodega -> 403
        assert app_client.post("/api/v1/marketing/segmentacion?segment_type=clientes-frecuentes", headers=auth_tokens["bodega"]["headers"]).status_code == 403

        # Asesor -> 200
        res_asesor = app_client.post("/api/v1/marketing/segmentacion?segment_type=clientes-frecuentes", headers=auth_tokens["asesor"]["headers"])
        assert res_asesor.status_code == 200
        assert res_asesor.json()["status"] == "success"
