"""
test_fase4_empaque_despacho_entrega.py — Empaque, Despacho y Entrega Canónica (Fase 4).

Escenarios cubiertos:
1. Agrupación multiventas del MISMO cliente en sesión de empaque:
   - Permite consolidar líneas de múltiples pedidos de venta si pertenecen al mismo customer_id.
2. Intento de agrupar pedidos de clientes DIFERENTES en empaque o entrega:
   - Falla estrictamente con HTTP 422 Unprocessable Entity.
3. Reglas operativas de despacho (L/M/V y corte Bogotá):
   - ENVIO_NACIONAL programado en día no permitido (ej. Martes) sin autorización falla con 422.
   - Con autorización explícita de gerencia (policy_authorized_by) o en día permitido (Lunes/Miércoles/Viernes) se aprueba (201).
4. Despacho físico atómico:
   - Convierte reservas activas (CONVERTED).
   - Descuenta InventoryLevel de la bodega.
   - Descuenta InventoryOwnerBalance del propietario correspondiente (NEBULAE o MAU).
   - Genera movimiento Kárdex OUT inmutable e idempotente.
   - Actualiza líneas de venta a ENTREGADA y pedido a ENTREGADO.
5. Replay idempotente de despacho:
   - Reintento con la misma idempotency_key devuelve 200 OK y NO descuenta inventario dos veces.
"""
import uuid
import datetime
from decimal import Decimal
import zoneinfo
import pytest
from sqlalchemy import select

from app.models.customers import Customer
from app.models.catalog import Product, ProductSKU, Brand, Category
from app.models.inventory import Warehouse, InventoryLevel, InventoryMovement
from app.models.erp_documents import SaleOrder
from app.models.fase1b import SaleOrderLineErp, InventoryOwnerBalance, InventoryReservation
from app.models.fase4 import (
    SalePackingSession, SalePackingItem,
    SaleOrderDelivery, SaleOrderDeliveryLine
)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_empaque_env(db):
    now = datetime.datetime.utcnow()
    br = Brand(name=f"Br-Emp-{uuid.uuid4().hex[:6]}")
    ca = Category(name=f"Ca-Emp-{uuid.uuid4().hex[:6]}")
    db.add_all([br, ca])
    db.flush()

    prod = Product(name=f"Prod-Emp-{uuid.uuid4().hex[:6]}", brand_id=br.id, category_id=ca.id, type="Fisico", base_currency="COP", uom="Ud")
    db.add(prod)
    db.flush()

    sku1 = ProductSKU(product_id=prod.id, sku=f"SKU-EMP1-{uuid.uuid4().hex[:6].upper()}", cost_price=40000.0, sale_price=80000.0)
    sku2 = ProductSKU(product_id=prod.id, sku=f"SKU-EMP2-{uuid.uuid4().hex[:6].upper()}", cost_price=30000.0, sale_price=60000.0)
    db.add_all([sku1, sku2])

    wh = Warehouse(name=f"Bodega-Emp-{uuid.uuid4().hex[:6]}", location_type="Central")
    c1 = Customer(first_name="Cliente", last_name=f"Consolidado-{uuid.uuid4().hex[:4]}", email=f"c1_{uuid.uuid4().hex[:6]}@test.com", address="Calle 100 # 15-20, Bogotá")
    c2 = Customer(first_name="Cliente", last_name=f"Ajeno-{uuid.uuid4().hex[:4]}", email=f"c2_{uuid.uuid4().hex[:6]}@test.com", address="Cra 7 # 72-10, Bogotá")
    db.add_all([wh, c1, c2])
    db.flush()

    # Stock para sku1 y sku2
    lvl1 = InventoryLevel(sku_id=sku1.id, warehouse_id=wh.id, quantity=Decimal("20.00"))
    bal1 = InventoryOwnerBalance(sku_id=sku1.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("20.00"), updated_at=now)

    lvl2 = InventoryLevel(sku_id=sku2.id, warehouse_id=wh.id, quantity=Decimal("15.00"))
    bal2 = InventoryOwnerBalance(sku_id=sku2.id, warehouse_id=wh.id, owner="MAU", quantity=Decimal("15.00"), updated_at=now)
    db.add_all([lvl1, bal1, lvl2, bal2])
    db.commit()

    return {"sku1": sku1, "sku2": sku2, "warehouse": wh, "customer1": c1, "customer2": c2}


class TestFase4EmpaqueDespachoEntrega:

    def test_agrupacion_multiventas_mismo_cliente_en_empaque(self, app_client, admin_token, db):
        """Permite agrupar en una sesión de empaque líneas de pedidos distintos del MISMO cliente."""
        data = _setup_empaque_env(db)
        sku1 = data["sku1"]
        sku2 = data["sku2"]
        wh = data["warehouse"]
        c1 = data["customer1"]

        # Pedido 1 del Cliente 1
        r_so1 = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c1.id,
            "lines": [{"sku_id": sku1.id, "quantity": 2.0, "unit_price_cop": 80000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        so1_id = r_so1.json()["data"]["id"]
        line1_id = r_so1.json()["data"]["lines"][0]["id"]

        # Pedido 2 del Cliente 1
        r_so2 = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c1.id,
            "lines": [{"sku_id": sku2.id, "quantity": 1.0, "unit_price_cop": 60000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "MAU"}]
        }, headers=_auth(admin_token))
        so2_id = r_so2.json()["data"]["id"]
        line2_id = r_so2.json()["data"]["lines"][0]["id"]

        # Crear sesión de empaque agrupando ambos pedidos del Cliente 1
        pack_payload = {
            "customer_id": c1.id,
            "warehouse_id": wh.id,
            "observations": "Consolidación pedidos 1 y 2 mismo cliente",
            "items": [
                {"sale_order_id": so1_id, "sale_order_line_id": line1_id, "sku_id": sku1.id, "quantity": 2.0},
                {"sale_order_id": so2_id, "sale_order_line_id": line2_id, "sku_id": sku2.id, "quantity": 1.0},
            ]
        }
        resp_pack = app_client.post("/api/v1/ventas/empaque/sesiones", json=pack_payload, headers=_auth(admin_token))
        assert resp_pack.status_code == 201, resp_pack.text
        p_data = resp_pack.json()["data"]
        assert p_data["customer_id"] == c1.id
        assert p_data["items_count"] == 2
        assert p_data["status"] == "EN_PROCESO"

    def test_rechazo_agrupacion_clientes_diferentes_422(self, app_client, admin_token, db):
        """Intento de agrupar pedidos de clientes distintos en la misma sesión de empaque falla con 422."""
        data = _setup_empaque_env(db)
        sku1 = data["sku1"]
        wh = data["warehouse"]
        c1 = data["customer1"]
        c2 = data["customer2"]

        # Pedido Cliente 1
        r_so1 = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c1.id,
            "lines": [{"sku_id": sku1.id, "quantity": 1.0, "unit_price_cop": 80000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        so1_id = r_so1.json()["data"]["id"]
        line1_id = r_so1.json()["data"]["lines"][0]["id"]

        # Pedido Cliente 2
        r_so2 = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c2.id,
            "lines": [{"sku_id": sku1.id, "quantity": 1.0, "unit_price_cop": 80000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        so2_id = r_so2.json()["data"]["id"]
        line2_id = r_so2.json()["data"]["lines"][0]["id"]

        # Intentar empaque agrupado para c1 incluyendo línea de so2 (de c2)
        bad_pack = {
            "customer_id": c1.id,
            "warehouse_id": wh.id,
            "items": [
                {"sale_order_id": so1_id, "sale_order_line_id": line1_id, "sku_id": sku1.id, "quantity": 1.0},
                {"sale_order_id": so2_id, "sale_order_line_id": line2_id, "sku_id": sku1.id, "quantity": 1.0},
            ]
        }
        resp_bad = app_client.post("/api/v1/ventas/empaque/sesiones", json=bad_pack, headers=_auth(admin_token))
        assert resp_bad.status_code == 422
        assert "clientes diferentes" in resp_bad.text

    def test_reglas_operativas_despacho_politica_dias(self, app_client, admin_token, db):
        """ENVIO_NACIONAL en día no permitido (Martes) sin autorización falla con 422; con autorización tiene éxito."""
        data = _setup_empaque_env(db)
        sku1 = data["sku1"]
        wh = data["warehouse"]
        c1 = data["customer1"]

        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c1.id,
            "lines": [{"sku_id": sku1.id, "quantity": 1.0, "unit_price_cop": 80000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]

        # Fecha un Martes conocido (2026-09-08 es Martes)
        tuesday_dt = "2026-09-08T10:00:00"

        # 1. Sin autorización: Falla con 422
        resp_fail = app_client.post("/api/v1/ventas/entregas", json={
            "customer_id": c1.id,
            "warehouse_id": wh.id,
            "delivery_method": "ENVIO_NACIONAL",
            "scheduled_date": tuesday_dt,
            "address_snapshot": "Calle 100 # 15-20",
            "city": "Bogotá",
            "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": sku1.id, "quantity": 1.0}]
        }, headers=_auth(admin_token))
        assert resp_fail.status_code == 422
        assert "Lunes, Miércoles y Viernes" in resp_fail.text

        # 2. Con autorización explícita: 201 Created
        resp_ok = app_client.post("/api/v1/ventas/entregas", json={
            "customer_id": c1.id,
            "warehouse_id": wh.id,
            "delivery_method": "ENVIO_NACIONAL",
            "scheduled_date": tuesday_dt,
            "address_snapshot": "Calle 100 # 15-20",
            "city": "Bogotá",
            "policy_authorized_by": "Gerente de Operaciones",
            "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": sku1.id, "quantity": 1.0}]
        }, headers=_auth(admin_token))
        assert resp_ok.status_code == 201, resp_ok.text
        assert resp_ok.json()["data"]["status"] == "PREPARANDO"

    def test_despacho_fisico_atomico_e_idempotente(self, app_client, admin_token, db):
        """Despacho convierte reservas, descuenta InventoryLevel e InventoryOwnerBalance (MAU),
        crea Kárdex OUT y el replay no duplica deducciones."""
        data = _setup_empaque_env(db)
        sku2 = data["sku2"]  # Propietario MAU, stock inicial = 15
        wh = data["warehouse"]
        c1 = data["customer1"]

        # 1. Crear venta por 3 unidades con propietario MAU
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c1.id,
            "anticipo_pct": 100.0,
            "lines": [{"sku_id": sku2.id, "quantity": 3.0, "unit_price_cop": 60000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "MAU"}]
        }, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]

        # 2. Pagar 100%
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={
            "tipo": "PAGO_TOTAL", "monto": 180000.0, "idempotency_key": f"pay-mau-{uuid.uuid4().hex}"
        }, headers=_auth(admin_token))

        # 3. Confirmar reserva inmediata (3 unidades)
        app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={wh.id}&idempotency_key=res-mau-{uuid.uuid4().hex}",
            headers=_auth(admin_token)
        )

        # 4. Crear orden de entrega (Miércoles 2026-09-09)
        wednesday_dt = "2026-09-09T11:00:00"
        r_del = app_client.post("/api/v1/ventas/entregas", json={
            "customer_id": c1.id,
            "warehouse_id": wh.id,
            "delivery_method": "ENVIO_NACIONAL",
            "scheduled_date": wednesday_dt,
            "address_snapshot": "Calle 100 # 15-20",
            "city": "Bogotá",
            "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": sku2.id, "quantity": 3.0, "owner": "MAU"}]
        }, headers=_auth(admin_token))
        assert r_del.status_code == 201
        delivery_id = r_del.json()["data"]["id"]

        # 5. Confirmar despacho atómico
        disp_key = f"disp-key-{uuid.uuid4().hex}"
        r_disp = app_client.post(f"/api/v1/ventas/entregas/{delivery_id}/despachar", json={
            "idempotency_key": disp_key,
            "carrier": "Servientrega",
            "tracking_number": "ENV-12345678",
        }, headers=_auth(admin_token))
        assert r_disp.status_code == 200, r_disp.text
        assert r_disp.json()["data"]["status"] == "DESPACHADO"

        # 6. Validar en DB que:
        # - Reserva activa pasó a CONVERTED
        res_db = db.execute(select(InventoryReservation).where(InventoryReservation.sale_order_line_id == line_id)).scalar_one()
        assert res_db.status == "CONVERTED"

        # - InventoryLevel se redujo de 15 a 12
        lvl_db = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku2.id, InventoryLevel.warehouse_id == wh.id)).scalar_one()
        assert Decimal(str(lvl_db.quantity)) == Decimal("12.00")

        # - InventoryOwnerBalance de MAU se redujo de 15 a 12
        bal_db = db.execute(select(InventoryOwnerBalance).where(
            InventoryOwnerBalance.sku_id == sku2.id,
            InventoryOwnerBalance.warehouse_id == wh.id,
            InventoryOwnerBalance.owner == "MAU"
        )).scalar_one()
        assert Decimal(str(bal_db.quantity)) == Decimal("12.00")

        # - Movimiento Kárdex OUT existe con owner='MAU'
        kardex_out = db.execute(select(InventoryMovement).where(
            InventoryMovement.sku_id == sku2.id,
            InventoryMovement.direction == "OUT",
            InventoryMovement.owner == "MAU"
        )).scalars().all()
        assert len(kardex_out) == 1
        assert Decimal(str(kardex_out[0].quantity)) == Decimal("3.00")

        # - Línea de venta y pedido están en ENTREGADA / ENTREGADO
        sol_db = db.execute(select(SaleOrderLineErp).where(SaleOrderLineErp.id == line_id)).scalar_one()
        assert sol_db.estado == "ENTREGADA"
        so_db = db.execute(select(SaleOrder).where(SaleOrder.id == so_id)).scalar_one()
        assert so_db.estado == "ENTREGADO"

        # 7. Replay idempotente con la misma clave: no descuenta de nuevo
        r_rep = app_client.post(f"/api/v1/ventas/entregas/{delivery_id}/despachar", json={
            "idempotency_key": disp_key,
        }, headers=_auth(admin_token))
        assert r_rep.status_code == 200
        assert r_rep.json().get("idempotent_replay") is True

        db.refresh(lvl_db)
        db.refresh(bal_db)
        assert Decimal(str(lvl_db.quantity)) == Decimal("12.00"), "El replay descontó stock indebidamente"
        assert Decimal(str(bal_db.quantity)) == Decimal("12.00"), "El replay descontó balance indebidamente"
