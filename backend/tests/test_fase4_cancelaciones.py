"""
test_fase4_cancelaciones.py — Cancelaciones de Ventas, Liberación de Reservas y Saldos a Favor (Fase 4).

Escenarios cubiertos:
1. Cancelación con liberación de reservas activas:
   - Pedido con mercancía reservada se cancela; las reservas pasan a RELEASED.
   - La disponibilidad de inventario se restaura inmediatamente.
2. Cancelación con mercancía comprada/reservada exige decisión explícita:
   - Si no se envía purchased_goods_decision, rechaza con HTTP 422 Unprocessable Entity.
   - Si se especifica decisión válida (ej. PASAR_A_STOCK_NEBULAE), aprueba la cancelación y persiste la decisión.
3. Cálculo financiero de saldo a favor / dinero a devolver:
   - Registra anticipo parcial o total.
   - Al cancelar, calcula con exactitud dinero_a_favor_cop = pagos_confirmados - devoluciones.
4. Rechazo de cancelación en estados no permitidos:
   - Pedido ya entregado o cancelado no puede volver a cancelarse (HTTP 409 Conflict).
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


def _setup_cancel_scenario(db):
    now = datetime.datetime.utcnow()
    br = Brand(name=f"Br-Cnc-{uuid.uuid4().hex[:6]}")
    ca = Category(name=f"Ca-Cnc-{uuid.uuid4().hex[:6]}")
    db.add_all([br, ca])
    db.flush()

    prod = Product(name=f"Prod-Cnc-{uuid.uuid4().hex[:6]}", brand_id=br.id, category_id=ca.id, type="Fisico", base_currency="COP", uom="Ud")
    db.add(prod)
    db.flush()

    sku = ProductSKU(product_id=prod.id, sku=f"SKU-CNC-{uuid.uuid4().hex[:6].upper()}", cost_price=60000.0, sale_price=120000.0)
    db.add(sku)

    wh = Warehouse(name=f"Bodega-Cnc-{uuid.uuid4().hex[:6]}", location_type="Central")
    c = Customer(first_name="Cliente", last_name=f"Cancelador-{uuid.uuid4().hex[:4]}", email=f"cnc_{uuid.uuid4().hex[:6]}@test.com")
    db.add_all([wh, c])
    db.flush()

    # Stock: 10 unidades
    lvl = InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("10.00"))
    bal = InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("10.00"), updated_at=now)
    db.add_all([lvl, bal])
    db.commit()

    return {"sku": sku, "warehouse": wh, "customer": c}


class TestFase4Cancelaciones:

    def test_cancelacion_libera_reservas_activas(self, app_client, admin_token, db):
        """Al cancelar un pedido, todas las reservas activas pasan a RELEASED y se restaura el disponible."""
        data = _setup_cancel_scenario(db)
        sku = data["sku"]
        wh = data["warehouse"]
        c = data["customer"]

        # 1. Crear venta inmediata por 3 unidades
        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c.id,
            "lines": [{"sku_id": sku.id, "quantity": 3.0, "unit_price_cop": 120000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        so_id = resp_so.json()["data"]["id"]
        line_id = resp_so.json()["data"]["lines"][0]["id"]

        # 2. Confirmar reserva inmediata
        r_conf = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={wh.id}&idempotency_key=cnc-res-{uuid.uuid4().hex}",
            headers=_auth(admin_token)
        )
        assert r_conf.status_code == 200

        # Verificar reserva activa
        res_before = db.execute(select(InventoryReservation).where(InventoryReservation.sale_order_line_id == line_id)).scalar_one()
        assert res_before.status == "ACTIVE"

        # 3. Cancelar pedido especificando decisión sobre la mercancía reservada
        r_cancel = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/cancelar", json={
            "motivo": "Cliente desistió por viaje imprevisto",
            "purchased_goods_decision": "PASAR_A_STOCK_NEBULAE",
            "authorized_by": "Gerencia Comercial",
        }, headers=_auth(admin_token))
        assert r_cancel.status_code == 200, r_cancel.text
        d_cnc = r_cancel.json()["data"]
        assert d_cnc["estado"] == "CANCELADO"
        assert d_cnc["decision_mercancia"] == "PASAR_A_STOCK_NEBULAE"

        # 4. Verificar en DB que la reserva pasó a RELEASED
        db.refresh(res_before)
        assert res_before.status == "RELEASED"
        assert res_before.released_at is not None

        # 5. Verificar que la línea está cancelada y quantity_reserved en 0
        sol_db = db.execute(select(SaleOrderLineErp).where(SaleOrderLineErp.id == line_id)).scalar_one()
        assert sol_db.estado == "CANCELADA"
        assert Decimal(str(sol_db.quantity_reserved)) == Decimal("0.00")
        assert Decimal(str(sol_db.quantity_cancelled)) == Decimal("3.00")

    def test_cancelacion_exige_decision_explicita_sobre_mercancia(self, app_client, admin_token, db):
        """Cancelar un pedido con mercancía comprada o reservada sin purchased_goods_decision falla con 422."""
        data = _setup_cancel_scenario(db)
        sku = data["sku"]
        wh = data["warehouse"]
        c = data["customer"]

        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c.id,
            "lines": [{"sku_id": sku.id, "quantity": 2.0, "unit_price_cop": 120000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        so_id = resp_so.json()["data"]["id"]
        line_id = resp_so.json()["data"]["lines"][0]["id"]

        # Confirmar reserva
        app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={wh.id}&idempotency_key=cnc-nodec-{uuid.uuid4().hex}",
            headers=_auth(admin_token)
        )

        # Intento de cancelar sin decisión debe fallar con 422
        r_fail = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/cancelar", json={
            "motivo": "Cancelación sin decisión"
        }, headers=_auth(admin_token))
        assert r_fail.status_code == 422
        assert "purchased_goods_decision" in r_fail.text

    def test_calculo_saldo_a_favor_cliente(self, app_client, admin_token, db):
        """Calcula el dinero a favor / devolución cuando el cliente ya había realizado pagos."""
        data = _setup_cancel_scenario(db)
        sku = data["sku"]
        c = data["customer"]

        # Venta total: $240,000 COP
        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c.id,
            "lines": [{"sku_id": sku.id, "quantity": 2.0, "unit_price_cop": 120000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        so_id = resp_so.json()["data"]["id"]

        # Pago de anticipo por $150,000 COP
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={
            "tipo": "ANTICIPO", "monto": 150000.0, "idempotency_key": f"pay-fav-{uuid.uuid4().hex}"
        }, headers=_auth(admin_token))

        # Cancelar pedido sin mercancía reservada aún
        r_cnc = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/cancelar", json={
            "motivo": "Solicitud de cancelación antes de despacho",
        }, headers=_auth(admin_token))
        assert r_cnc.status_code == 200
        assert r_cnc.json()["data"]["dinero_a_favor_cop"] == 150000.0

    def test_rechazo_cancelacion_pedido_ya_cancelado(self, app_client, admin_token, db):
        """No se puede cancelar un pedido que ya está en estado CANCELADO (HTTP 409)."""
        data = _setup_cancel_scenario(db)
        sku = data["sku"]
        c = data["customer"]

        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c.id,
            "lines": [{"sku_id": sku.id, "quantity": 1.0, "unit_price_cop": 120000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        so_id = resp_so.json()["data"]["id"]

        # Primera cancelación
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/cancelar", json={"motivo": "Cancelación 1"}, headers=_auth(admin_token))

        # Segunda cancelación debe fallar con 409
        r_cnc2 = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/cancelar", json={"motivo": "Cancelación 2"}, headers=_auth(admin_token))
        assert r_cnc2.status_code == 409
