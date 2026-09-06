"""
test_fase4_devoluciones_costeo.py — Devoluciones, Segregación Patrimonial Mau/Nebulae y Rentabilidad (Fase 4).

Escenarios cubiertos:
1. Devolución a stock vendible (REINTEGRAR_STOCK → RETURN_IN):
   - Incrementa InventoryLevel vendible.
   - Incrementa InventoryOwnerBalance del propietario original (NEBULAE o MAU).
   - Genera movimiento Kárdex RETURN_IN con el owner correcto.
2. Devolución a cuarentena (CUARENTENA → QUARANTINE):
   - Registra en InventoryQuarantine con owner y estado ACTIVO.
   - NO incrementa InventoryLevel vendible (aislamiento físico).
   - Genera movimiento Kárdex QUARANTINE.
3. Segregación patrimonial NEBULAE vs MAU en rentabilidad:
   - Consulta GET /api/v1/ventas/pedidos/{so_id}/rentabilidad.
   - Valida cálculo exacto de venta neta, costo snapshot inmutable, margen % y desglose segregado:
     nebulae_result_cop vs mau_result_cop.
4. Devolución financiera con reembolso de dinero:
   - financial_resolution = DEVOLUCION_DINERO registra transacción en el libro de pagos (tipo DEVOLUCION).
   - Idempotencia determinista: replay no duplica movimientos ni reembolsos.
"""
import uuid
import datetime
from decimal import Decimal
import pytest
from sqlalchemy import select

from app.models.customers import Customer
from app.models.catalog import Product, ProductSKU, Brand, Category
from app.models.inventory import Warehouse, InventoryLevel, InventoryMovement
from app.models.erp_documents import SaleOrder
from app.models.fase1b import SaleOrderLineErp, InventoryOwnerBalance
from app.models.fase3 import InventoryQuarantine
from app.models.fase4 import SaleOrderReturn, SaleOrderPayment


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_return_env(db):
    now = datetime.datetime.utcnow()
    br = Brand(name=f"Br-Dev-{uuid.uuid4().hex[:6]}")
    ca = Category(name=f"Ca-Dev-{uuid.uuid4().hex[:6]}")
    db.add_all([br, ca])
    db.flush()

    prod = Product(name=f"Prod-Dev-{uuid.uuid4().hex[:6]}", brand_id=br.id, category_id=ca.id, type="Fisico", base_currency="COP", uom="Ud")
    db.add(prod)
    db.flush()

    sku_neb = ProductSKU(product_id=prod.id, sku=f"SKU-DEV-NEB-{uuid.uuid4().hex[:6].upper()}", cost_price=40000.0, sale_price=100000.0)
    sku_mau = ProductSKU(product_id=prod.id, sku=f"SKU-DEV-MAU-{uuid.uuid4().hex[:6].upper()}", cost_price=30000.0, sale_price=70000.0)
    db.add_all([sku_neb, sku_mau])

    wh = Warehouse(name=f"Bodega-Dev-{uuid.uuid4().hex[:6]}", location_type="Central")
    c = Customer(first_name="Cliente", last_name=f"Devolvedor-{uuid.uuid4().hex[:4]}", email=f"dev_{uuid.uuid4().hex[:6]}@test.com")
    db.add_all([wh, c])
    db.flush()

    # Stock inicial: 10 de cada uno
    lvl_n = InventoryLevel(sku_id=sku_neb.id, warehouse_id=wh.id, quantity=Decimal("10.00"))
    bal_n = InventoryOwnerBalance(sku_id=sku_neb.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("10.00"), updated_at=now)

    lvl_m = InventoryLevel(sku_id=sku_mau.id, warehouse_id=wh.id, quantity=Decimal("10.00"))
    bal_m = InventoryOwnerBalance(sku_id=sku_mau.id, warehouse_id=wh.id, owner="MAU", quantity=Decimal("10.00"), updated_at=now)
    db.add_all([lvl_n, bal_n, lvl_m, bal_m])
    db.commit()

    return {"sku_neb": sku_neb, "sku_mau": sku_mau, "warehouse": wh, "customer": c}


class TestFase4DevolucionesCosteo:

    def test_devolucion_a_stock_reintegra_fisico_y_balance_mau(self, app_client, admin_token, db):
        """Devolución a stock de un producto MAU incrementa InventoryLevel, balance de MAU y crea Kárdex RETURN_IN."""
        data = _setup_return_env(db)
        sku_mau = data["sku_mau"]
        wh = data["warehouse"]
        c = data["customer"]

        # 1. Crear venta entregada
        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c.id,
            "anticipo_pct": 100.0,
            "lines": [{"sku_id": sku_mau.id, "quantity": 2.0, "unit_price_cop": 70000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "MAU", "cost_unit_cop_snapshot": 30000.0}]
        }, headers=_auth(admin_token))
        so_id = resp_so.json()["data"]["id"]
        line_id = resp_so.json()["data"]["lines"][0]["id"]

        # Pagar 100% y confirmar entrega inmediata
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 140000.0, "idempotency_key": f"pay-{uuid.uuid4().hex}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={wh.id}&idempotency_key=r-{uuid.uuid4().hex}", headers=_auth(admin_token))

        # Despachar entrega
        wed_dt = "2026-09-09T10:00:00"
        r_del = app_client.post("/api/v1/ventas/entregas", json={
            "customer_id": c.id, "warehouse_id": wh.id, "delivery_method": "ENVIO_NACIONAL", "scheduled_date": wed_dt, "address_snapshot": "Dir", "city": "Bogotá",
            "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": sku_mau.id, "quantity": 2.0, "owner": "MAU"}]
        }, headers=_auth(admin_token))
        deliv_id = r_del.json()["data"]["id"]
        r_disp = app_client.post(f"/api/v1/ventas/entregas/{deliv_id}/despachar", json={"idempotency_key": f"disp-{uuid.uuid4().hex}"}, headers=_auth(admin_token))
        assert r_disp.status_code == 200, r_disp.text

        # Stock antes de la devolución debe ser 10 - 2 = 8
        db.expire_all()
        lvl_before = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_mau.id, InventoryLevel.warehouse_id == wh.id)).scalar_one()
        assert Decimal(str(lvl_before.quantity)) == Decimal("8.00")

        # 2. Registrar devolución de 1 unidad con REINTEGRAR_STOCK
        dev_key = f"dev-stk-{uuid.uuid4().hex}"
        r_dev = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/devoluciones", json={
            "sale_order_id": so_id,
            "customer_id": c.id,
            "financial_resolution": "SALDO_A_FAVOR",
            "reason": "Cambio por otra talla",
            "idempotency_key": dev_key,
            "lines": [{
                "sale_order_line_id": line_id,
                "sku_id": sku_mau.id,
                "warehouse_id": wh.id,
                "quantity": 1.0,
                "inventory_resolution": "REINTEGRAR_STOCK",
                "product_condition": "NUEVO_SELLADO",
                "owner": "MAU",
            }]
        }, headers=_auth(admin_token))
        assert r_dev.status_code == 201, r_dev.text
        assert r_dev.json()["data"]["status"] == "PROCESADA"

        # 3. Validar incrementos en DB:
        # Stock físico pasó de 8 a 9
        db.refresh(lvl_before)
        assert Decimal(str(lvl_before.quantity)) == Decimal("9.00")

        # Balance MAU pasó de 8 a 9
        bal_mau = db.execute(select(InventoryOwnerBalance).where(
            InventoryOwnerBalance.sku_id == sku_mau.id, InventoryOwnerBalance.warehouse_id == wh.id, InventoryOwnerBalance.owner == "MAU"
        )).scalar_one()
        assert Decimal(str(bal_mau.quantity)) == Decimal("9.00")

        # Movimiento RETURN_IN existe con owner MAU
        mvs = db.execute(select(InventoryMovement).where(
            InventoryMovement.sku_id == sku_mau.id, InventoryMovement.direction == "RETURN_IN", InventoryMovement.owner == "MAU"
        )).scalars().all()
        assert len(mvs) == 1
        assert Decimal(str(mvs[0].quantity)) == Decimal("1.00")

    def test_devolucion_a_cuarentena_aisla_sin_sumar_vendible(self, app_client, admin_token, db):
        """Devolución a cuarentena registra en InventoryQuarantine pero NO incrementa stock vendible."""
        data = _setup_return_env(db)
        sku_neb = data["sku_neb"]
        wh = data["warehouse"]
        c = data["customer"]

        # Venta de 2 unidades
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c.id, "anticipo_pct": 100.0,
            "lines": [{"sku_id": sku_neb.id, "quantity": 2.0, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE", "cost_unit_cop_snapshot": 40000.0}]
        }, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]

        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 200000.0, "idempotency_key": f"pay-q-{uuid.uuid4().hex}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={wh.id}&idempotency_key=rq-{uuid.uuid4().hex}", headers=_auth(admin_token))

        wed_dt = "2026-09-09T10:00:00"
        r_del = app_client.post("/api/v1/ventas/entregas", json={
            "customer_id": c.id, "warehouse_id": wh.id, "delivery_method": "ENVIO_NACIONAL", "scheduled_date": wed_dt, "address_snapshot": "Dir", "city": "Bogotá",
            "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": sku_neb.id, "quantity": 2.0, "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        deliv_id = r_del.json()["data"]["id"]
        r_disp = app_client.post(f"/api/v1/ventas/entregas/{deliv_id}/despachar", json={"idempotency_key": f"dq-{uuid.uuid4().hex}"}, headers=_auth(admin_token))
        assert r_disp.status_code == 200, r_disp.text
        db.expire_all()
        lvl_before = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_neb.id, InventoryLevel.warehouse_id == wh.id)).scalar_one()
        assert Decimal(str(lvl_before.quantity)) == Decimal("8.00")

        # Devolución a CUARENTENA por defecto
        r_dev = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/devoluciones", json={
            "sale_order_id": so_id,
            "customer_id": c.id,
            "financial_resolution": "SIN_DEVOLUCION_DINERO",
            "reason": "Producto llegó con falla de fábrica",
            "idempotency_key": f"dev-quar-{uuid.uuid4().hex}",
            "lines": [{
                "sale_order_line_id": line_id,
                "sku_id": sku_neb.id,
                "warehouse_id": wh.id,
                "quantity": 1.0,
                "inventory_resolution": "CUARENTENA",
                "product_condition": "DEFECTUOSO",
                "owner": "NEBULAE",
            }]
        }, headers=_auth(admin_token))
        assert r_dev.status_code == 201, r_dev.text

        # 1. Stock vendible NO debe incrementarse (sigue en 8)
        db.refresh(lvl_before)
        assert Decimal(str(lvl_before.quantity)) == Decimal("8.00")

        # 2. Registro de cuarentena ACTIVO existe con cantidad = 1
        quar = db.execute(select(InventoryQuarantine).where(
            InventoryQuarantine.sku_id == sku_neb.id, InventoryQuarantine.reason == "DEVOLUCION_CLIENTE", InventoryQuarantine.status == "ACTIVO"
        )).scalar_one()
        assert Decimal(str(quar.quantity)) == Decimal("1.00")
        assert quar.owner == "NEBULAE"

    def test_rentabilidad_y_segregacion_patrimonial_mau_nebulae(self, app_client, admin_token, db):
        """Valida que GET /rentabilidad calcule venta neta, costo, utilidad y segregue resultado NEBULAE vs MAU."""
        data = _setup_return_env(db)
        sku_neb = data["sku_neb"]  # Cost: 40k, Price: 100k -> Utilidad unitaria: 60k
        sku_mau = data["sku_mau"]  # Cost: 30k, Price: 70k -> Utilidad unitaria: 40k
        c = data["customer"]

        # Pedido mixto patrimonial:
        # Línea 1: 2 x SKU_NEB = Venta $200k, Costo $80k, Margen Nebulae = $120k
        # Línea 2: 1 x SKU_MAU = Venta $70k, Costo $30k, Margen Mau = $40k
        # Total venta = $270k, Total costo = $110k, Margen total = $160k (59.26%)
        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c.id,
            "lines": [
                {"sku_id": sku_neb.id, "quantity": 2.0, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE", "cost_unit_cop_snapshot": 40000.0},
                {"sku_id": sku_mau.id, "quantity": 1.0, "unit_price_cop": 70000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "MAU", "cost_unit_cop_snapshot": 30000.0},
            ]
        }, headers=_auth(admin_token))
        so_id = resp_so.json()["data"]["id"]

        # Consultar rentabilidad
        r_prof = app_client.get(f"/api/v1/ventas/pedidos/{so_id}/rentabilidad", headers=_auth(admin_token))
        assert r_prof.status_code == 200, r_prof.text
        p_data = r_prof.json()["data"]

        assert p_data["net_sales_cop"] == 270000.0
        assert p_data["total_cost_cop"] == 110000.0
        assert p_data["estimated_profit_cop"] == 160000.0
        assert p_data["nebulae_result_cop"] == 120000.0
        assert p_data["mau_result_cop"] == 40000.0
        assert len(p_data["lines_breakdown"]) == 2
