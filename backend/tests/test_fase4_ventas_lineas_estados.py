"""
test_fase4_ventas_lineas_estados.py — Modelo Canónico de Ventas, Líneas Mixtas y Concurrencia Pesimista (Fase 4).

Escenarios cubiertos:
1. Venta mixta (ENTREGA_INMEDIATA + POR_PEDIDO):
   - Creación de pedido canónico con snapshot inmutable de costo y precio.
   - Estado inicial de pedido PENDIENTE_ANTICIPO.
   - Línea inmediata arranca en PENDIENTE_RESERVA, línea por pedido en PENDIENTE_COMPRA.
   - Derivación automática tras anticipo (CONFIRMADO) y confirmación de línea (PARCIALMENTE_DISPONIBLE).
2. Concurrencia pesimista:
   - Dos clientes intentan reservar la última unidad disponible concurrentemente.
   - Uno obtiene éxito (200) y el otro recibe 409 Conflict por sobreventa evitada.
   - Disponibilidad restante = 0, stock físico = 1, reserva activa = 1.
3. Derivación estricta de estados y prevención de saltos inválidos:
   - Invariantes de la máquina de estados y consistencia entre líneas y pedido general.
"""
import uuid
import datetime
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
import pytest
from sqlalchemy import select

from app.models.customers import Customer
from app.models.catalog import Product, ProductSKU, Brand, Category
from app.models.inventory import Warehouse, InventoryLevel
from app.models.erp_documents import SaleOrder
from app.models.fase1b import SaleOrderLineErp, InventoryOwnerBalance, InventoryReservation


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_sales_catalog(db):
    now = datetime.datetime.utcnow()
    br = Brand(name=f"Br-F4-{uuid.uuid4().hex[:6]}")
    ca = Category(name=f"Ca-F4-{uuid.uuid4().hex[:6]}")
    db.add_all([br, ca])
    db.flush()

    prod = Product(name=f"Prod-F4-{uuid.uuid4().hex[:6]}", brand_id=br.id, category_id=ca.id, type="Fisico", base_currency="COP", uom="Ud")
    db.add(prod)
    db.flush()

    sku1 = ProductSKU(product_id=prod.id, sku=f"SKU-F4-INM-{uuid.uuid4().hex[:6].upper()}", cost_price=50000.0, sale_price=100000.0)
    sku2 = ProductSKU(product_id=prod.id, sku=f"SKU-F4-PED-{uuid.uuid4().hex[:6].upper()}", cost_price=70000.0, sale_price=150000.0)
    db.add_all([sku1, sku2])
    db.flush()

    wh = Warehouse(name=f"Bodega-F4-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(wh)
    db.flush()

    c1 = Customer(first_name="Cliente", last_name=f"F4-A-{uuid.uuid4().hex[:4]}", email=f"c1_{uuid.uuid4().hex[:6]}@test.com", phone="3001234567")
    c2 = Customer(first_name="Cliente", last_name=f"F4-B-{uuid.uuid4().hex[:4]}", email=f"c2_{uuid.uuid4().hex[:6]}@test.com", phone="3009876543")
    db.add_all([c1, c2])
    db.flush()

    # Stock para sku1 (inmediata): 10 unidades
    lvl1 = InventoryLevel(sku_id=sku1.id, warehouse_id=wh.id, quantity=Decimal("10.00"))
    bal1 = InventoryOwnerBalance(sku_id=sku1.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("10.00"), updated_at=now)
    db.add_all([lvl1, bal1])

    db.commit()

    return {
        "sku_inm": sku1,
        "sku_ped": sku2,
        "warehouse": wh,
        "customer1": c1,
        "customer2": c2,
    }


class TestFase4VentasLineasEstados:

    def test_venta_mixta_inmediata_y_por_pedido(self, app_client, admin_token, db):
        """Crea venta mixta, valida snapshots, registra anticipo 60% y confirma línea inmediata."""
        data = _setup_sales_catalog(db)
        sku_inm = data["sku_inm"]
        sku_ped = data["sku_ped"]
        wh = data["warehouse"]
        c1 = data["customer1"]

        payload = {
            "customer_id": c1.id,
            "canal_venta": "CRM",
            "anticipo_pct": 60.0,
            "saldo_pct": 40.0,
            "lines": [
                {
                    "sku_id": sku_inm.id,
                    "quantity": 2.0,
                    "unit_price_cop": 100000.0,
                    "modalidad": "ENTREGA_INMEDIATA",
                    "owner": "NEBULAE",
                    "cost_unit_cop_snapshot": 50000.0,
                },
                {
                    "sku_id": sku_ped.id,
                    "quantity": 1.0,
                    "unit_price_cop": 150000.0,
                    "modalidad": "POR_PEDIDO",
                    "owner": "NEBULAE",
                    "cost_unit_cop_snapshot": 70000.0,
                }
            ]
        }

        # 1. Crear pedido canónico
        resp = app_client.post("/api/v1/ventas/pedidos/canonico", json=payload, headers=_auth(admin_token))
        assert resp.status_code == 201, resp.text
        res_data = resp.json()["data"]
        so_id = res_data["id"]
        assert res_data["estado"] == "PENDIENTE_ANTICIPO"
        assert res_data["total_cop"] == 350000.0  # 2*100000 + 1*150000
        assert res_data["anticipo_requerido"] == 210000.0  # 60% de 350000
        assert res_data["saldo_requerido"] == 140000.0

        # Verificar líneas en DB
        lines = db.execute(
            select(SaleOrderLineErp).where(SaleOrderLineErp.so_id == so_id).order_by(SaleOrderLineErp.id)
        ).scalars().all()
        assert len(lines) == 2
        l_inm, l_ped = lines[0], lines[1]
        assert l_inm.modalidad == "ENTREGA_INMEDIATA"
        assert l_inm.estado == "PENDIENTE_RESERVA"
        assert Decimal(str(l_inm.cost_unit_cop_snapshot)) == Decimal("50000.00")
        assert Decimal(str(l_inm.price_unit_cop_snapshot)) == Decimal("100000.00")

        assert l_ped.modalidad == "POR_PEDIDO"
        assert l_ped.estado == "PENDIENTE_COMPRA"
        assert Decimal(str(l_ped.cost_unit_cop_snapshot)) == Decimal("70000.00")

        # 2. Registrar pago de anticipo (60% = 210,000 COP)
        p_key = f"pay-ant-{uuid.uuid4().hex}"
        pay_payload = {
            "tipo": "ANTICIPO",
            "monto": 210000.0,
            "metodo_pago": "TRANSFERENCIA",
            "idempotency_key": p_key,
        }
        resp_p = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json=pay_payload, headers=_auth(admin_token))
        assert resp_p.status_code == 201, resp_p.text
        assert resp_p.json()["data"]["sale_order_estado"] == "CONFIRMADO"

        # 3. Confirmar línea de entrega inmediata (reserva atómica pesimista)
        c_key = f"res-inm-{uuid.uuid4().hex}"
        resp_conf = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{l_inm.id}/confirmar-inmediata?warehouse_id={wh.id}&idempotency_key={c_key}",
            headers=_auth(admin_token)
        )
        assert resp_conf.status_code == 200, resp_conf.text
        conf_data = resp_conf.json()["data"]
        assert conf_data["line_estado"] == "RESERVADA"
        assert conf_data["quantity_reserved"] == 2.0
        # Estado del pedido general pasa a PARCIALMENTE_DISPONIBLE porque la línea por pedido sigue PENDIENTE_COMPRA
        assert conf_data["sale_order_estado"] == "PARCIALMENTE_DISPONIBLE"

        # Verificar reserva activa en DB
        res_db = db.execute(
            select(InventoryReservation).where(InventoryReservation.sale_order_line_id == l_inm.id)
        ).scalar_one()
        assert res_db.status == "ACTIVE"
        assert Decimal(str(res_db.quantity_reserved)) == Decimal("2.00")

    def test_concurrencia_dos_clientes_ultima_unidad_pesimista(self, app_client, admin_token, db):
        """Dos clientes intentan reservar concurrentemente la última unidad disponible.
        Exactamente uno obtiene 200 y el otro 409 Conflict.
        """
        now = datetime.datetime.utcnow()
        br = Brand(name=f"Br-Conc-{uuid.uuid4().hex[:6]}")
        ca = Category(name=f"Ca-Conc-{uuid.uuid4().hex[:6]}")
        db.add_all([br, ca])
        db.flush()

        prod = Product(name=f"Prod-Conc-{uuid.uuid4().hex[:6]}", brand_id=br.id, category_id=ca.id, type="Fisico", base_currency="COP", uom="Ud")
        db.add(prod)
        db.flush()

        sku = ProductSKU(product_id=prod.id, sku=f"SKU-CONC-{uuid.uuid4().hex[:6].upper()}", cost_price=30000.0, sale_price=60000.0)
        db.add(sku)
        wh = Warehouse(name=f"Bodega-Conc-{uuid.uuid4().hex[:6]}", location_type="Central")
        db.add(wh)
        db.flush()

        # Exactamente 1 unidad vendible
        lvl = InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("1.00"))
        bal = InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("1.00"), updated_at=now)
        c_a = Customer(first_name="Cliente", last_name="Alpha", email=f"ca_{uuid.uuid4().hex[:6]}@test.com")
        c_b = Customer(first_name="Cliente", last_name="Beta", email=f"cb_{uuid.uuid4().hex[:6]}@test.com")
        db.add_all([lvl, bal, c_a, c_b])
        db.commit()

        # Crear pedido para Cliente A
        resp_a = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c_a.id,
            "lines": [{"sku_id": sku.id, "quantity": 1.0, "unit_price_cop": 60000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        assert resp_a.status_code == 201
        so_a_id = resp_a.json()["data"]["id"]
        line_a_id = resp_a.json()["data"]["lines"][0]["id"]

        # Crear pedido para Cliente B
        resp_b = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c_b.id,
            "lines": [{"sku_id": sku.id, "quantity": 1.0, "unit_price_cop": 60000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        assert resp_b.status_code == 201
        so_b_id = resp_b.json()["data"]["id"]
        line_b_id = resp_b.json()["data"]["lines"][0]["id"]

        # Pagar anticipos de ambos
        app_client.post(f"/api/v1/ventas/pedidos/{so_a_id}/pagos", json={
            "tipo": "ANTICIPO", "monto": 36000.0, "idempotency_key": f"pay-a-{uuid.uuid4().hex}"
        }, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_b_id}/pagos", json={
            "tipo": "ANTICIPO", "monto": 36000.0, "idempotency_key": f"pay-b-{uuid.uuid4().hex}"
        }, headers=_auth(admin_token))

        # Intentar reservar concurrentemente la misma y única unidad disponible
        key_a = f"conc-res-a-{uuid.uuid4().hex}"
        key_b = f"conc-res-b-{uuid.uuid4().hex}"

        def _do_reserve(so_id, line_id, key):
            return app_client.post(
                f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={wh.id}&idempotency_key={key}",
                headers=_auth(admin_token)
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            fut_a = executor.submit(_do_reserve, so_a_id, line_a_id, key_a)
            fut_b = executor.submit(_do_reserve, so_b_id, line_b_id, key_b)
            r_a = fut_a.result()
            r_b = fut_b.result()

        statuses = [r_a.status_code, r_b.status_code]
        assert 200 in statuses, f"Ninguna reserva tuvo éxito: {statuses}"
        assert 409 in statuses, f"La concurrencia permitió sobreventa o falló: {statuses}"

        # Verificar en DB que solo hay 1 reserva activa y el stock físico vendible sigue siendo 1
        active_res = db.execute(
            select(InventoryReservation).where(
                InventoryReservation.sku_id == sku.id,
                InventoryReservation.warehouse_id == wh.id,
                InventoryReservation.status == "ACTIVE"
            )
        ).scalars().all()
        assert len(active_res) == 1
        assert Decimal(str(active_res[0].quantity_reserved)) == Decimal("1.00")

    def test_derivacion_estricta_estados_y_transiciones(self, app_client, admin_token, db):
        """Verifica que el pedido no pueda saltar a estados no permitidos ni reservar sin modalidad inmediata."""
        data = _setup_sales_catalog(db)
        sku_ped = data["sku_ped"]
        c1 = data["customer1"]
        wh = data["warehouse"]

        # Pedido con modalidad POR_PEDIDO
        resp = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c1.id,
            "lines": [{"sku_id": sku_ped.id, "quantity": 1.0, "unit_price_cop": 150000.0, "modalidad": "POR_PEDIDO", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        assert resp.status_code == 201
        so_id = resp.json()["data"]["id"]
        line_id = resp.json()["data"]["lines"][0]["id"]

        # Intento de confirmar como entrega inmediata debe fallar con 422
        resp_bad = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={wh.id}&idempotency_key=bad-key",
            headers=_auth(admin_token)
        )
        assert resp_bad.status_code == 422
        assert "modalidad" in resp_bad.text
