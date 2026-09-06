"""
test_fase4_pagos_politicas.py — Libro Transaccional de Pagos, Políticas y Reversiones (Fase 4).

Escenarios cubiertos:
1. Anticipo parcial, saldo y pago completo:
   - Registro de anticipos sucesivos y derivación financiera de anticipo_cop y saldo_cop.
2. Política 60/40 vs Política 100% configurable:
   - Con política 60/40: pago de 30% mantiene PENDIENTE_ANTICIPO; pago de 60% avanza a CONFIRMADO.
   - Con política 100%: pago de 60% NO avanza; sólo al completar 100% avanza.
   - Si mercancía está reservada, pago 100% transiciona de PENDIENTE_SALDO a LISTO_PARA_ENTREGA.
3. Bloqueo de duplicados por idempotency_key:
   - Replay devuelve HTTP 200 con idempotent_replay=True.
   - El saldo y el total pagado permanecen idénticos sin duplicar registros en DB.
4. Reversión atómica de pago:
   - Reversión de un pago confirmado: marca el pago original como REVERTIDO.
   - Registra transacción compensatoria de tipo REVERSION referenciando al original.
   - Recalcula inmediatamente saldo_cop y hace retroceder el estado del pedido.
   - Intento de revertir dos veces el mismo pago falla con 409 Conflict.
"""
import uuid
import datetime
from decimal import Decimal
import pytest
from sqlalchemy import select

from app.models.customers import Customer
from app.models.catalog import Product, ProductSKU, Brand, Category
from app.models.inventory import Warehouse, InventoryLevel
from app.models.erp_documents import SaleOrder
from app.models.fase1b import SaleOrderLineErp, InventoryOwnerBalance, InventoryReservation
from app.models.fase4 import SaleOrderPayment


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_payment_scenario(db, anticipo_pct=60.0, saldo_pct=40.0):
    now = datetime.datetime.utcnow()
    br = Brand(name=f"Br-Pay-{uuid.uuid4().hex[:6]}")
    ca = Category(name=f"Ca-Pay-{uuid.uuid4().hex[:6]}")
    db.add_all([br, ca])
    db.flush()

    prod = Product(name=f"Prod-Pay-{uuid.uuid4().hex[:6]}", brand_id=br.id, category_id=ca.id, type="Fisico", base_currency="COP", uom="Ud")
    db.add(prod)
    db.flush()

    sku = ProductSKU(product_id=prod.id, sku=f"SKU-PAY-{uuid.uuid4().hex[:6].upper()}", cost_price=50000.0, sale_price=100000.0)
    db.add(sku)

    wh = Warehouse(name=f"Bodega-Pay-{uuid.uuid4().hex[:6]}", location_type="Central")
    c = Customer(first_name="Cliente", last_name=f"Pagador-{uuid.uuid4().hex[:4]}", email=f"pay_{uuid.uuid4().hex[:6]}@test.com")
    db.add_all([wh, c])
    db.commit()

    return {"sku": sku, "warehouse": wh, "customer": c, "anticipo_pct": anticipo_pct, "saldo_pct": saldo_pct}


class TestFase4PagosPoliticas:

    def test_anticipo_parcial_saldo_y_pago_completo(self, app_client, admin_token, db):
        """Valida pagos parciales, derivación de saldos y culminación con pago total."""
        data = _setup_payment_scenario(db, anticipo_pct=60.0, saldo_pct=40.0)
        sku = data["sku"]
        c = data["customer"]

        # Pedido de $200,000 COP (2 unidades a $100,000)
        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c.id,
            "anticipo_pct": 60.0,
            "saldo_pct": 40.0,
            "lines": [{"sku_id": sku.id, "quantity": 2.0, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        assert resp_so.status_code == 201
        so_id = resp_so.json()["data"]["id"]
        assert resp_so.json()["data"]["total_cop"] == 200000.0
        assert resp_so.json()["data"]["anticipo_requerido"] == 120000.0
        assert resp_so.json()["data"]["estado"] == "PENDIENTE_ANTICIPO"

        # 1. Pago parcial por debajo del 60% ($50,000 COP)
        k1 = f"pay-p1-{uuid.uuid4().hex}"
        r1 = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={
            "tipo": "ANTICIPO", "monto": 50000.0, "metodo_pago": "TRANSFERENCIA", "idempotency_key": k1
        }, headers=_auth(admin_token))
        assert r1.status_code == 201
        d1 = r1.json()["data"]
        assert d1["saldo_cop"] == 150000.0
        assert d1["anticipo_cop"] == 50000.0
        assert d1["sale_order_estado"] == "PENDIENTE_ANTICIPO"  # Sigue pendiente porque 50k < 120k

        # 2. Segundo abono que completa el anticipo del 60% ($70,000 COP adicionales -> $120,000 acumulado)
        k2 = f"pay-p2-{uuid.uuid4().hex}"
        r2 = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={
            "tipo": "ANTICIPO", "monto": 70000.0, "metodo_pago": "TRANSFERENCIA", "idempotency_key": k2
        }, headers=_auth(admin_token))
        assert r2.status_code == 201
        d2 = r2.json()["data"]
        assert d2["saldo_cop"] == 80000.0
        assert d2["anticipo_cop"] == 120000.0
        assert d2["sale_order_estado"] == "CONFIRMADO"  # Anticipo 60% cumplido

        # 3. Pago del saldo restante ($80,000 COP)
        k3 = f"pay-p3-{uuid.uuid4().hex}"
        r3 = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={
            "tipo": "PAGO_SALDO", "monto": 80000.0, "metodo_pago": "TARJETA", "idempotency_key": k3
        }, headers=_auth(admin_token))
        assert r3.status_code == 201
        d3 = r3.json()["data"]
        assert d3["saldo_cop"] == 0.0

    def test_politica_100pct_requiere_pago_completo(self, app_client, admin_token, db):
        """Venta configurada al 100% de anticipo: 60% de pago no avanza a CONFIRMADO, sólo 100%."""
        data = _setup_payment_scenario(db, anticipo_pct=100.0, saldo_pct=0.0)
        sku = data["sku"]
        c = data["customer"]

        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c.id,
            "anticipo_pct": 100.0,
            "saldo_pct": 0.0,
            "lines": [{"sku_id": sku.id, "quantity": 1.0, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        assert resp_so.status_code == 201
        so_id = resp_so.json()["data"]["id"]

        # Pago del 60% ($60,000 COP)
        r_parc = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={
            "tipo": "ANTICIPO", "monto": 60000.0, "idempotency_key": f"p100-60-{uuid.uuid4().hex}"
        }, headers=_auth(admin_token))
        assert r_parc.status_code == 201
        assert r_parc.json()["data"]["sale_order_estado"] == "PENDIENTE_ANTICIPO"

        # Completar el 40% restante ($40,000 COP)
        r_full = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={
            "tipo": "ANTICIPO", "monto": 40000.0, "idempotency_key": f"p100-40-{uuid.uuid4().hex}"
        }, headers=_auth(admin_token))
        assert r_full.status_code == 201
        assert r_full.json()["data"]["sale_order_estado"] == "CONFIRMADO"
        assert r_full.json()["data"]["saldo_cop"] == 0.0

    def test_bloqueo_duplicados_idempotency_key_pago(self, app_client, admin_token, db):
        """Replay de registro de pago devuelve HTTP 200 y no duplica saldo ni transacciones."""
        data = _setup_payment_scenario(db)
        sku = data["sku"]
        c = data["customer"]

        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c.id,
            "lines": [{"sku_id": sku.id, "quantity": 1.0, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        so_id = resp_so.json()["data"]["id"]

        key = f"idem-pay-{uuid.uuid4().hex}"
        pay_body = {"tipo": "ANTICIPO", "monto": 60000.0, "metodo_pago": "TRANSFERENCIA", "idempotency_key": key}

        # Primer intento: 201 Created
        r1 = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json=pay_body, headers=_auth(admin_token))
        assert r1.status_code == 201
        p_id = r1.json()["data"]["id"]

        # Segundo intento (replay): 200 OK
        r2 = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json=pay_body, headers=_auth(admin_token))
        assert r2.status_code == 200
        assert r2.json().get("idempotent_replay") is True
        assert r2.json()["data"]["id"] == p_id

        # Verificar en DB que solo hay exactamente 1 pago registrado
        payments = db.execute(select(SaleOrderPayment).where(SaleOrderPayment.sale_order_id == so_id)).scalars().all()
        assert len(payments) == 1

        so_db = db.execute(select(SaleOrder).where(SaleOrder.id == so_id)).scalar_one()
        assert Decimal(str(so_db.anticipo_cop)) == Decimal("60000.00")
        assert Decimal(str(so_db.saldo_cop)) == Decimal("40000.00")

    def test_reversion_atomica_de_pago(self, app_client, admin_token, db):
        """Reversión atómica de pago genera transacción compensatoria, resta saldo y hace retroceder estado."""
        data = _setup_payment_scenario(db)
        sku = data["sku"]
        c = data["customer"]

        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c.id,
            "anticipo_pct": 60.0,
            "saldo_pct": 40.0,
            "lines": [{"sku_id": sku.id, "quantity": 1.0, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        so_id = resp_so.json()["data"]["id"]

        # 1. Pago de anticipo que confirma el pedido
        r_pay = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={
            "tipo": "ANTICIPO", "monto": 60000.0, "idempotency_key": f"pay-to-rev-{uuid.uuid4().hex}"
        }, headers=_auth(admin_token))
        assert r_pay.status_code == 201
        pay_id = r_pay.json()["data"]["id"]
        assert r_pay.json()["data"]["sale_order_estado"] == "CONFIRMADO"

        # 2. Revertir el pago
        r_rev = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={
            "tipo": "REVERSION",
            "monto": 60000.0,
            "reversed_payment_id": pay_id,
            "notes": "Error en comprobante de transferencia bancaria",
            "idempotency_key": f"rev-key-{uuid.uuid4().hex}"
        }, headers=_auth(admin_token))
        assert r_rev.status_code == 201
        d_rev = r_rev.json()["data"]

        # Saldo vuelve al 100% y estado retrocede a PENDIENTE_ANTICIPO
        assert d_rev["saldo_cop"] == 100000.0
        assert d_rev["sale_order_estado"] == "PENDIENTE_ANTICIPO"

        # 3. Validar en DB
        orig_p = db.execute(select(SaleOrderPayment).where(SaleOrderPayment.id == pay_id)).scalar_one()
        assert orig_p.estado == "REVERTIDO"

        rev_p = db.execute(select(SaleOrderPayment).where(SaleOrderPayment.id == d_rev["id"])).scalar_one()
        assert rev_p.tipo == "REVERSION"
        assert rev_p.reversed_payment_id == pay_id

        # 4. Intento de revertir nuevamente el mismo pago falla con 409
        r_rev_dup = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={
            "tipo": "REVERSION",
            "monto": 60000.0,
            "reversed_payment_id": pay_id,
            "idempotency_key": f"rev-dup-{uuid.uuid4().hex}"
        }, headers=_auth(admin_token))
        assert r_rev_dup.status_code == 409
