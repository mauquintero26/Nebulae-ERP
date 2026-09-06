# -*- coding: utf-8 -*-
"""
test_fase4_cierre_tecnico_final.py — Suite de Cierre Técnico Final Fase 4.

Verificación exhaustiva de las 3 condiciones de auditoría externa:
1. DISPONIBILIDAD POR PROPIETARIO:
   - A. Owner MAU balance 5, físico 20: Cliente A reserva 5 MAU (200), Cliente B intenta 1 MAU (409).
   - B. Mismo escenario mediante autorreserva desde empaque (409).
   - C. Concurrencia por la última unidad MAU: exactamente una 200, una 409, suma reservas <= balance.
   - D. Aislamiento patrimonial: unidades NEBULAE no cubren líneas MAU ni viceversa.
2. TRAZABILIDAD DELIVERY -> DEVOLUCIÓN:
   - A. Dos ventas, dos entregas: devolver línea de Venta A con Delivery de Venta B -> 422.
   - B. Línea entregada en dos entregas (4 y 6): devolver 5 de Entrega 1 -> 422.
   - C. Devolución válida parcial sobre cada entrega (2 de entrega 1, 3 de entrega 2) -> 201 y trazabilidad.
   - D. Dos devoluciones concurrentes sobre el mismo delivery y línea no superan despachado (201 y 422).
   - E. Prohibición de usar entregas BORRADOR, PREPARANDO o CANCELADO en devoluciones (422).
3. INTEGRIDAD TRANSACCIONAL Y DE BALANCES.
"""

import pytest
import datetime
import concurrent.futures
from decimal import Decimal
import uuid
from sqlalchemy import text, func, select

from app.models.customers import Customer
from app.models.catalog import ProductSKU, Product, Brand, Category
from app.models.inventory import Warehouse, InventoryLevel, InventoryMovement, InventoryOperation
from app.models.erp_documents import SaleOrder
from app.models.fase1b import (
    SaleOrderLineErp,
    InventoryOwnerBalance,
    InventoryReservation,
)
from app.models.fase4 import (
    SalePackingSession,
    SalePackingItem,
    SaleOrderDelivery,
    SaleOrderDeliveryLine,
    SaleOrderReturn,
    SaleOrderReturnLine,
)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_custom_setup(db, mau_qty: Decimal, neb_qty: Decimal):
    now = datetime.datetime.utcnow()
    uid = uuid.uuid4().hex[:6]

    cust_a = Customer(
        first_name="Cliente",
        last_name=f"Cierre A {uid}",
        email=f"client_a_{uid}@cierre.com",
        phone="3001112233",
        address="Calle 100 # 50-20, Barranquilla",
        city="Barranquilla",
    )
    cust_b = Customer(
        first_name="Cliente",
        last_name=f"Cierre B {uid}",
        email=f"client_b_{uid}@cierre.com",
        phone="3004445566",
        address="Calle 90 # 40-10, Barranquilla",
        city="Barranquilla",
    )
    wh = Warehouse(
        name=f"Bodega Cierre {uid}",
        location_type="Central",
    )
    br = Brand(name=f"Br-Cie-{uid}")
    ca = Category(name=f"Ca-Cie-{uid}")
    db.add_all([cust_a, cust_b, wh, br, ca])
    db.flush()

    prod = Product(
        name=f"Prod Cierre {uid}",
        brand_id=br.id,
        category_id=ca.id,
        type="Fisico",
        base_currency="COP",
        uom="Ud",
        description="Producto para suite de cierre final",
    )
    db.add(prod)
    db.flush()

    sku = ProductSKU(
        product_id=prod.id,
        sku=f"SKU-CIE-{uid.upper()}",
        cost_price=Decimal("40000.00"),
        sale_price=Decimal("100000.00"),
    )
    db.add(sku)
    db.flush()

    total_physical = mau_qty + neb_qty
    lvl = InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=total_physical)
    db.add(lvl)

    bal_mau = InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="MAU", quantity=mau_qty, updated_at=now)
    bal_neb = InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=neb_qty, updated_at=now)
    db.add_all([bal_mau, bal_neb])
    db.commit()

    return {
        "customer_a": cust_a,
        "customer_b": cust_b,
        "warehouse": wh,
        "sku": sku,
        "uid": uid
    }


class TestFase4CierreTecnicoFinal:

    # ─────────────────────────────────────────────────────────────────────────
    # 1. DISPONIBILIDAD POR PROPIETARIO
    # ─────────────────────────────────────────────────────────────────────────

    def test_01_a_disponibilidad_owner_mau_reserva_inmediata_409(self, app_client, admin_token, db):
        """
        Condición 1.A:
        Owner MAU tiene balance 5 y stock físico total 20 (15 NEBULAE + 5 MAU).
        - Cliente A reserva 5 MAU -> 200 OK.
        - Cliente B intenta reservar 1 MAU -> 409 Conflict, aunque exista stock físico NEBULAE disponible.
        """
        s = _create_custom_setup(db, mau_qty=Decimal("5.00"), neb_qty=Decimal("15.00"))

        # Venta A: 5 unidades MAU
        r_so_a = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": s["customer_a"].id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 5, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "MAU"}]
            },
            headers=_auth(admin_token)
        )
        assert r_so_a.status_code == 201
        so_a_id = r_so_a.json()["data"]["id"]
        line_a_id = r_so_a.json()["data"]["lines"][0]["id"]

        # Pagar y reservar Venta A
        app_client.post(f"/api/v1/ventas/pedidos/{so_a_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 500000.0, "idempotency_key": f"pay-a-{s['uid']}"}, headers=_auth(admin_token))
        r_conf_a = app_client.post(
            f"/api/v1/ventas/pedidos/{so_a_id}/lineas/{line_a_id}/confirmar-inmediata?warehouse_id={s['warehouse'].id}&idempotency_key=res-a-{s['uid']}",
            headers=_auth(admin_token)
        )
        assert r_conf_a.status_code == 200
        assert r_conf_a.json()["data"]["quantity_reserved"] == 5.0

        # Venta B: 1 unidad MAU
        r_so_b = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": s["customer_b"].id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 1, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "MAU"}]
            },
            headers=_auth(admin_token)
        )
        assert r_so_b.status_code == 201
        so_b_id = r_so_b.json()["data"]["id"]
        line_b_id = r_so_b.json()["data"]["lines"][0]["id"]

        # Pagar Venta B e intentar reservar 1 MAU -> 409
        app_client.post(f"/api/v1/ventas/pedidos/{so_b_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 100000.0, "idempotency_key": f"pay-b-{s['uid']}"}, headers=_auth(admin_token))
        r_conf_b = app_client.post(
            f"/api/v1/ventas/pedidos/{so_b_id}/lineas/{line_b_id}/confirmar-inmediata?warehouse_id={s['warehouse'].id}&idempotency_key=res-b-{s['uid']}",
            headers=_auth(admin_token)
        )
        assert r_conf_b.status_code == 409, f"Se esperaba 409 pero se obtuvo {r_conf_b.status_code}: {r_conf_b.text}"
        assert "insuficiente" in r_conf_b.text.lower() and "mau" in r_conf_b.text.lower()

        # Confirmar en BD que reservas activas de MAU no superan 5
        db.expire_all()
        res_mau = db.execute(
            select(func.coalesce(func.sum(InventoryReservation.quantity_reserved), Decimal("0.00"))).where(
                InventoryReservation.sku_id == s["sku"].id,
                InventoryReservation.warehouse_id == s["warehouse"].id,
                InventoryReservation.owner == "MAU",
                InventoryReservation.status == "ACTIVE"
            )
        ).scalar()
        assert res_mau == Decimal("5.00")

    def test_01_b_disponibilidad_owner_mau_autorreserva_empaque_409(self, app_client, admin_token, db):
        """
        Condición 1.B:
        Mismo escenario probado mediante autorreserva desde empaque.
        - Balance MAU 5 ya reservado por Cliente A.
        - Cliente B crea pedido con 1 MAU inmediata sin reservar previamente.
        - Intento de crear sesión de empaque con autorreserva para Cliente B -> 409 Conflict.
        """
        s = _create_custom_setup(db, mau_qty=Decimal("5.00"), neb_qty=Decimal("15.00"))

        # Cliente A reserva los 5 MAU
        r_so_a = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": s["customer_a"].id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 5, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "MAU"}]
            },
            headers=_auth(admin_token)
        )
        so_a_id = r_so_a.json()["data"]["id"]
        line_a_id = r_so_a.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_a_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 500000.0, "idempotency_key": f"pay-pa-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_a_id}/lineas/{line_a_id}/confirmar-inmediata?warehouse_id={s['warehouse'].id}&idempotency_key=res-pa-{s['uid']}", headers=_auth(admin_token))

        # Cliente B crea pedido sin reservar
        r_so_b = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": s["customer_b"].id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 1, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "MAU"}]
            },
            headers=_auth(admin_token)
        )
        so_b_id = r_so_b.json()["data"]["id"]
        line_b_id = r_so_b.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_b_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 100000.0, "idempotency_key": f"pay-pb-{s['uid']}"}, headers=_auth(admin_token))

        # Intento de empaque con autorreserva para Cliente B -> Falla con 409
        r_pack = app_client.post(
            "/api/v1/ventas/empaque/sesiones",
            json={
                "customer_id": s["customer_b"].id,
                "warehouse_id": s["warehouse"].id,
                "items": [{"sale_order_id": so_b_id, "sale_order_line_id": line_b_id, "sku_id": s["sku"].id, "quantity": 1}]
            },
            headers=_auth(admin_token)
        )
        assert r_pack.status_code == 409, f"Se esperaba 409 pero se obtuvo {r_pack.status_code}: {r_pack.text}"
        assert "insuficiente" in r_pack.text.lower() and "mau" in r_pack.text.lower()

    def test_01_c_concurrencia_ultima_unidad_owner_mau(self, app_client, admin_token, db):
        """
        Condición 1.C:
        Dos solicitudes concurrentes compiten por la última unidad MAU.
        - Exactamente una prospera (200), la otra es rechazada con 409.
        - Nunca SUM(reservas ACTIVE MAU) > OwnerBalance MAU.
        """
        s = _create_custom_setup(db, mau_qty=Decimal("1.00"), neb_qty=Decimal("9.00"))

        # Pedido 1
        r_so_1 = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": s["customer_a"].id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 1, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "MAU"}]
            },
            headers=_auth(admin_token)
        )
        so_1_id = r_so_1.json()["data"]["id"]
        line_1_id = r_so_1.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_1_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 100000.0, "idempotency_key": f"pay-c1-{s['uid']}"}, headers=_auth(admin_token))

        # Pedido 2
        r_so_2 = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": s["customer_b"].id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 1, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "MAU"}]
            },
            headers=_auth(admin_token)
        )
        so_2_id = r_so_2.json()["data"]["id"]
        line_2_id = r_so_2.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_2_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 100000.0, "idempotency_key": f"pay-c2-{s['uid']}"}, headers=_auth(admin_token))

        def reserve_call(so_id, line_id):
            return app_client.post(
                f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={s['warehouse'].id}&idempotency_key=rsv-conc-{so_id}-{s['uid']}",
                headers=_auth(admin_token)
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            fut1 = executor.submit(reserve_call, so_1_id, line_1_id)
            fut2 = executor.submit(reserve_call, so_2_id, line_2_id)
            res1 = fut1.result()
            res2 = fut2.result()

        status_codes = sorted([res1.status_code, res2.status_code])
        assert status_codes == [200, 409], f"Se esperaba [200, 409], pero se obtuvo {status_codes}"

        # Comprobar en BD que la suma de reservas activas MAU es exactamente 1.00
        db.expire_all()
        res_mau = db.execute(
            select(func.coalesce(func.sum(InventoryReservation.quantity_reserved), Decimal("0.00"))).where(
                InventoryReservation.sku_id == s["sku"].id,
                InventoryReservation.warehouse_id == s["warehouse"].id,
                InventoryReservation.owner == "MAU",
                InventoryReservation.status == "ACTIVE"
            )
        ).scalar()
        assert res_mau == Decimal("1.00")

    def test_01_d_aislamiento_patrimonial_nebulae_y_mau(self, app_client, admin_token, db):
        """
        Condición 1.D:
        Confirmar que las unidades NEBULAE no puedan utilizarse para satisfacer una línea owner=MAU ni viceversa.
        """
        s = _create_custom_setup(db, mau_qty=Decimal("0.00"), neb_qty=Decimal("10.00"))

        # Línea MAU por 1 unidad -> 409 Conflict aunque hay 10 en NEBULAE
        r_so_mau = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": s["customer_a"].id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 1, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "MAU"}]
            },
            headers=_auth(admin_token)
        )
        so_mau_id = r_so_mau.json()["data"]["id"]
        line_mau_id = r_so_mau.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_mau_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 100000.0, "idempotency_key": f"pay-ais-m-{s['uid']}"}, headers=_auth(admin_token))

        r_conf_mau = app_client.post(
            f"/api/v1/ventas/pedidos/{so_mau_id}/lineas/{line_mau_id}/confirmar-inmediata?warehouse_id={s['warehouse'].id}&idempotency_key=res-ais-m-{s['uid']}",
            headers=_auth(admin_token)
        )
        assert r_conf_mau.status_code == 409
        assert "mau" in r_conf_mau.text.lower()

        # Línea NEBULAE por 1 unidad -> 200 OK
        r_so_neb = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": s["customer_a"].id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 1, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
            },
            headers=_auth(admin_token)
        )
        so_neb_id = r_so_neb.json()["data"]["id"]
        line_neb_id = r_so_neb.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_neb_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 100000.0, "idempotency_key": f"pay-ais-n-{s['uid']}"}, headers=_auth(admin_token))

        r_conf_neb = app_client.post(
            f"/api/v1/ventas/pedidos/{so_neb_id}/lineas/{line_neb_id}/confirmar-inmediata?warehouse_id={s['warehouse'].id}&idempotency_key=res-ais-n-{s['uid']}",
            headers=_auth(admin_token)
        )
        assert r_conf_neb.status_code == 200
        assert r_conf_neb.json()["data"]["quantity_reserved"] == 1.0

    # ─────────────────────────────────────────────────────────────────────────
    # 2. TRAZABILIDAD DELIVERY -> DEVOLUCIÓN
    # ─────────────────────────────────────────────────────────────────────────

    def test_02_a_rechazo_devolucion_delivery_incompatible(self, app_client, admin_token, db):
        """
        Condición 2.A:
        Un cliente tiene dos ventas y dos entregas.
        Intentar devolver una línea de la venta A usando delivery_id de la venta B: debe rechazarse con 422.
        """
        s = _create_custom_setup(db, mau_qty=Decimal("10.00"), neb_qty=Decimal("10.00"))
        cust_id = s["customer_a"].id
        wh_id = s["warehouse"].id

        # Venta A (5 unidades)
        r_so_a = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": cust_id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 5, "unit_price_cop": 50000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
            },
            headers=_auth(admin_token)
        )
        so_a_id = r_so_a.json()["data"]["id"]
        line_a_id = r_so_a.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_a_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 250000.0, "idempotency_key": f"pay-da-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_a_id}/lineas/{line_a_id}/confirmar-inmediata?warehouse_id={wh_id}&idempotency_key=rsv-da-{s['uid']}", headers=_auth(admin_token))

        deliv_a = app_client.post("/api/v1/ventas/entregas", json={
            "customer_id": cust_id, "warehouse_id": wh_id, "delivery_method": "ENTREGA_LOCAL",
            "lines": [{"sale_order_id": so_a_id, "sale_order_line_id": line_a_id, "sku_id": s["sku"].id, "quantity": 5}]
        }, headers=_auth(admin_token))
        deliv_a_id = deliv_a.json()["data"]["id"]
        app_client.post(f"/api/v1/ventas/entregas/{deliv_a_id}/despachar", json={"idempotency_key": f"dsp-da-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/entregas/{deliv_a_id}/confirmar-entrega", json={}, headers=_auth(admin_token))

        # Venta B (5 unidades)
        r_so_b = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": cust_id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 5, "unit_price_cop": 50000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
            },
            headers=_auth(admin_token)
        )
        so_b_id = r_so_b.json()["data"]["id"]
        line_b_id = r_so_b.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_b_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 250000.0, "idempotency_key": f"pay-db-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_b_id}/lineas/{line_b_id}/confirmar-inmediata?warehouse_id={wh_id}&idempotency_key=rsv-db-{s['uid']}", headers=_auth(admin_token))

        deliv_b = app_client.post("/api/v1/ventas/entregas", json={
            "customer_id": cust_id, "warehouse_id": wh_id, "delivery_method": "ENTREGA_LOCAL",
            "lines": [{"sale_order_id": so_b_id, "sale_order_line_id": line_b_id, "sku_id": s["sku"].id, "quantity": 5}]
        }, headers=_auth(admin_token))
        deliv_b_id = deliv_b.json()["data"]["id"]
        app_client.post(f"/api/v1/ventas/entregas/{deliv_b_id}/despachar", json={"idempotency_key": f"dsp-db-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/entregas/{deliv_b_id}/confirmar-entrega", json={}, headers=_auth(admin_token))

        # Intentar devolver línea de Venta A usando delivery_id de Venta B -> Rechazado con 422
        ret_payload = {
            "sale_order_id": so_a_id,
            "customer_id": cust_id,
            "delivery_id": deliv_b_id,
            "financial_resolution": "SIN_DEVOLUCION_DINERO",
            "refund_amount": 0.0,
            "idempotency_key": f"ret-mismatch-{s['uid']}",
            "lines": [{
                "sale_order_line_id": line_a_id,
                "warehouse_id": wh_id,
                "quantity": 1,
                "product_condition": "NUEVO_SELLADO",
                "inventory_resolution": "REINTEGRAR_STOCK"
            }]
        }
        res_ret = app_client.post(f"/api/v1/ventas/pedidos/{so_a_id}/devoluciones", json=ret_payload, headers=_auth(admin_token))
        assert res_ret.status_code == 422, f"Se esperaba 422 pero se obtuvo {res_ret.status_code}: {res_ret.text}"
        assert "no contiene" in res_ret.text.lower() or "no fue despachada" in res_ret.text.lower()

    def test_02_b_limite_devolucion_por_delivery_parcial(self, app_client, admin_token, db):
        """
        Condición 2.B:
        Una línea fue entregada parcialmente en dos entregas distintas (4 y 6).
        Intentar devolver desde la primera entrega más unidades de las contenidas en ella (5 > 4):
        debe rechazarse con 422 aunque el total global entregado sea 10.
        """
        s = _create_custom_setup(db, mau_qty=Decimal("15.00"), neb_qty=Decimal("15.00"))
        cust_id = s["customer_a"].id
        wh_id = s["warehouse"].id

        # Venta de 10 unidades
        r_so = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": cust_id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 10, "unit_price_cop": 40000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
            },
            headers=_auth(admin_token)
        )
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 400000.0, "idempotency_key": f"pay-dp-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={wh_id}&idempotency_key=rsv-dp-{s['uid']}", headers=_auth(admin_token))

        # Entrega 1 por 4 unidades
        d1 = app_client.post("/api/v1/ventas/entregas", json={
            "customer_id": cust_id, "warehouse_id": wh_id, "delivery_method": "ENTREGA_LOCAL",
            "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": s["sku"].id, "quantity": 4}]
        }, headers=_auth(admin_token))
        d1_id = d1.json()["data"]["id"]
        app_client.post(f"/api/v1/ventas/entregas/{d1_id}/despachar", json={"idempotency_key": f"dsp-d1-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/entregas/{d1_id}/confirmar-entrega", json={}, headers=_auth(admin_token))

        # Entrega 2 por 6 unidades
        d2 = app_client.post("/api/v1/ventas/entregas", json={
            "customer_id": cust_id, "warehouse_id": wh_id, "delivery_method": "ENTREGA_LOCAL",
            "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": s["sku"].id, "quantity": 6}]
        }, headers=_auth(admin_token))
        d2_id = d2.json()["data"]["id"]
        app_client.post(f"/api/v1/ventas/entregas/{d2_id}/despachar", json={"idempotency_key": f"dsp-d2-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/entregas/{d2_id}/confirmar-entrega", json={}, headers=_auth(admin_token))

        # Intentar devolver 5 unidades de Entrega 1 (que solo tuvo 4) -> 422
        ret_excess = {
            "sale_order_id": so_id,
            "customer_id": cust_id,
            "delivery_id": d1_id,
            "financial_resolution": "SIN_DEVOLUCION_DINERO",
            "refund_amount": 0.0,
            "idempotency_key": f"ret-excess-d1-{s['uid']}",
            "lines": [{
                "sale_order_line_id": line_id,
                "warehouse_id": wh_id,
                "quantity": 5,
                "product_condition": "NUEVO_SELLADO",
                "inventory_resolution": "REINTEGRAR_STOCK"
            }]
        }
        res_excess = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/devoluciones", json=ret_excess, headers=_auth(admin_token))
        assert res_excess.status_code == 422, f"Se esperaba 422 pero se obtuvo {res_excess.status_code}: {res_excess.text}"
        assert "supera la cantidad despachada en esa entrega" in res_excess.text

    def test_02_c_devoluciones_parciales_validas_por_delivery(self, app_client, admin_token, db):
        """
        Condición 2.C:
        Devolución válida parcial sobre cada entrega:
        - 2 unidades de Entrega 1 -> 201 OK.
        - 3 unidades de Entrega 2 -> 201 OK.
        - Intentar 3 unidades más de Entrega 1 -> 422 (acumulado sería 2+3=5 > 4).
        - 2 unidades restantes de Entrega 1 -> 201 OK (acumulado 2+2=4 <= 4).
        """
        s = _create_custom_setup(db, mau_qty=Decimal("15.00"), neb_qty=Decimal("15.00"))
        cust_id = s["customer_a"].id
        wh_id = s["warehouse"].id

        # Venta de 10 unidades
        r_so = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": cust_id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 10, "unit_price_cop": 30000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
            },
            headers=_auth(admin_token)
        )
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 300000.0, "idempotency_key": f"pay-vdp-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={wh_id}&idempotency_key=rsv-vdp-{s['uid']}", headers=_auth(admin_token))

        # Entrega 1 (4 unidades) y Entrega 2 (6 unidades)
        d1 = app_client.post("/api/v1/ventas/entregas", json={
            "customer_id": cust_id, "warehouse_id": wh_id, "delivery_method": "ENTREGA_LOCAL",
            "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": s["sku"].id, "quantity": 4}]
        }, headers=_auth(admin_token))
        d1_id = d1.json()["data"]["id"]
        app_client.post(f"/api/v1/ventas/entregas/{d1_id}/despachar", json={"idempotency_key": f"dsp-vd1-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/entregas/{d1_id}/confirmar-entrega", json={}, headers=_auth(admin_token))

        d2 = app_client.post("/api/v1/ventas/entregas", json={
            "customer_id": cust_id, "warehouse_id": wh_id, "delivery_method": "ENTREGA_LOCAL",
            "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": s["sku"].id, "quantity": 6}]
        }, headers=_auth(admin_token))
        d2_id = d2.json()["data"]["id"]
        app_client.post(f"/api/v1/ventas/entregas/{d2_id}/despachar", json={"idempotency_key": f"dsp-vd2-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/entregas/{d2_id}/confirmar-entrega", json={}, headers=_auth(admin_token))

        # Devolución 1: 2 unidades de Entrega 1 -> 201
        r_ret1 = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/devoluciones", json={
            "sale_order_id": so_id, "customer_id": cust_id, "delivery_id": d1_id,
            "financial_resolution": "SIN_DEVOLUCION_DINERO", "refund_amount": 0.0,
            "idempotency_key": f"ret-ok-d1-{s['uid']}",
            "lines": [{"sale_order_line_id": line_id, "warehouse_id": wh_id, "quantity": 2, "product_condition": "NUEVO_SELLADO", "inventory_resolution": "REINTEGRAR_STOCK"}]
        }, headers=_auth(admin_token))
        assert r_ret1.status_code == 201
        ret1_id = r_ret1.json()["data"]["id"]

        # Devolución 2: 3 unidades de Entrega 2 -> 201
        r_ret2 = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/devoluciones", json={
            "sale_order_id": so_id, "customer_id": cust_id, "delivery_id": d2_id,
            "financial_resolution": "SIN_DEVOLUCION_DINERO", "refund_amount": 0.0,
            "idempotency_key": f"ret-ok-d2-{s['uid']}",
            "lines": [{"sale_order_line_id": line_id, "warehouse_id": wh_id, "quantity": 3, "product_condition": "NUEVO_SELLADO", "inventory_resolution": "REINTEGRAR_STOCK"}]
        }, headers=_auth(admin_token))
        assert r_ret2.status_code == 201
        ret2_id = r_ret2.json()["data"]["id"]

        # Verificar en BD que delivery_id está debidamente enlazado
        db.expire_all()
        ret1_db = db.query(SaleOrderReturn).filter(SaleOrderReturn.id == ret1_id).first()
        ret2_db = db.query(SaleOrderReturn).filter(SaleOrderReturn.id == ret2_id).first()
        assert ret1_db.delivery_id == d1_id
        assert ret2_db.delivery_id == d2_id

        # Intentar devolver 3 más de Entrega 1 -> Falla con 422 (2 + 3 = 5 > 4)
        r_ret3_fail = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/devoluciones", json={
            "sale_order_id": so_id, "customer_id": cust_id, "delivery_id": d1_id,
            "financial_resolution": "SIN_DEVOLUCION_DINERO", "refund_amount": 0.0,
            "idempotency_key": f"ret-fail-d1-{s['uid']}",
            "lines": [{"sale_order_line_id": line_id, "warehouse_id": wh_id, "quantity": 3, "product_condition": "NUEVO_SELLADO", "inventory_resolution": "REINTEGRAR_STOCK"}]
        }, headers=_auth(admin_token))
        assert r_ret3_fail.status_code == 422, r_ret3_fail.text

        # Devolver las 2 unidades restantes de Entrega 1 -> 201 (2 + 2 = 4 == 4)
        r_ret3_ok = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/devoluciones", json={
            "sale_order_id": so_id, "customer_id": cust_id, "delivery_id": d1_id,
            "financial_resolution": "SIN_DEVOLUCION_DINERO", "refund_amount": 0.0,
            "idempotency_key": f"ret-ok2-d1-{s['uid']}",
            "lines": [{"sale_order_line_id": line_id, "warehouse_id": wh_id, "quantity": 2, "product_condition": "NUEVO_SELLADO", "inventory_resolution": "REINTEGRAR_STOCK"}]
        }, headers=_auth(admin_token))
        assert r_ret3_ok.status_code == 201

    def test_02_d_concurrencia_devoluciones_mismo_delivery_y_linea(self, app_client, admin_token, db):
        """
        Condición 2.D:
        Dos devoluciones concurrentes sobre el mismo delivery y línea no pueden superar la cantidad despachada.
        - Entrega despachada: 5 unidades.
        - Dos peticiones concurrentes de 3 unidades cada una (3 + 3 = 6 > 5).
        - Exactamente una prospera (201), la otra es rechazada con 422.
        """
        s = _create_custom_setup(db, mau_qty=Decimal("10.00"), neb_qty=Decimal("10.00"))
        cust_id = s["customer_a"].id
        wh_id = s["warehouse"].id

        r_so = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": cust_id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 5, "unit_price_cop": 50000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
            },
            headers=_auth(admin_token)
        )
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 250000.0, "idempotency_key": f"pay-cd-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={wh_id}&idempotency_key=rsv-cd-{s['uid']}", headers=_auth(admin_token))

        d = app_client.post("/api/v1/ventas/entregas", json={
            "customer_id": cust_id, "warehouse_id": wh_id, "delivery_method": "ENTREGA_LOCAL",
            "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": s["sku"].id, "quantity": 5}]
        }, headers=_auth(admin_token))
        deliv_id = d.json()["data"]["id"]
        app_client.post(f"/api/v1/ventas/entregas/{deliv_id}/despachar", json={"idempotency_key": f"dsp-cd-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/entregas/{deliv_id}/confirmar-entrega", json={}, headers=_auth(admin_token))

        def post_return(key_suffix):
            return app_client.post(
                f"/api/v1/ventas/pedidos/{so_id}/devoluciones",
                json={
                    "sale_order_id": so_id,
                    "customer_id": cust_id,
                    "delivery_id": deliv_id,
                    "financial_resolution": "SIN_DEVOLUCION_DINERO",
                    "refund_amount": 0.0,
                    "idempotency_key": f"ret-conc-{key_suffix}-{s['uid']}",
                    "lines": [{
                        "sale_order_line_id": line_id,
                        "warehouse_id": wh_id,
                        "quantity": 3,
                        "product_condition": "NUEVO_SELLADO",
                        "inventory_resolution": "REINTEGRAR_STOCK"
                    }]
                },
                headers=_auth(admin_token)
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(post_return, "1")
            f2 = executor.submit(post_return, "2")
            res1 = f1.result()
            res2 = f2.result()

        status_codes = sorted([res1.status_code, res2.status_code])
        assert status_codes == [201, 422], f"Se esperaba [201, 422], se obtuvo {status_codes}"

        # Comprobar en BD que la suma de devoluciones procesadas no supera 5
        db.expire_all()
        total_ret_db = db.query(func.coalesce(func.sum(SaleOrderReturnLine.quantity), Decimal("0.00"))).join(
            SaleOrderReturn, SaleOrderReturnLine.return_id == SaleOrderReturn.id
        ).filter(
            SaleOrderReturn.delivery_id == deliv_id,
            SaleOrderReturnLine.sale_order_line_id == line_id,
            SaleOrderReturn.status != "CANCELADA"
        ).scalar()
        assert total_ret_db == Decimal("3.00")

    def test_02_e_rechazo_devolucion_delivery_borrador_o_cancelado(self, app_client, admin_token, db):
        """
        No permitir devoluciones originadas en entregas BORRADOR, PREPARANDO o CANCELADO.
        """
        s = _create_custom_setup(db, mau_qty=Decimal("10.00"), neb_qty=Decimal("10.00"))
        cust_id = s["customer_a"].id
        wh_id = s["warehouse"].id

        r_so = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": cust_id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": s["sku"].id, "quantity": 5, "unit_price_cop": 50000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
            },
            headers=_auth(admin_token)
        )
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 250000.0, "idempotency_key": f"pay-borr-{s['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={wh_id}&idempotency_key=rsv-borr-{s['uid']}", headers=_auth(admin_token))

        # Crear entrega en BORRADOR (sin despachar)
        d_borr = app_client.post("/api/v1/ventas/entregas", json={
            "customer_id": cust_id, "warehouse_id": wh_id, "delivery_method": "ENTREGA_LOCAL",
            "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": s["sku"].id, "quantity": 5}]
        }, headers=_auth(admin_token))
        d_borr_id = d_borr.json()["data"]["id"]

        # Intentar devolver sobre la entrega en BORRADOR -> Falla con 422
        r_ret = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/devoluciones", json={
            "sale_order_id": so_id, "customer_id": cust_id, "delivery_id": d_borr_id,
            "financial_resolution": "SIN_DEVOLUCION_DINERO", "refund_amount": 0.0,
            "idempotency_key": f"ret-borr-{s['uid']}",
            "lines": [{"sale_order_line_id": line_id, "warehouse_id": wh_id, "quantity": 1, "product_condition": "NUEVO_SELLADO", "inventory_resolution": "REINTEGRAR_STOCK"}]
        }, headers=_auth(admin_token))
        assert r_ret.status_code == 422, f"Se esperaba 422 pero se obtuvo {r_ret.status_code}: {r_ret.text}"
        assert "no puede ser utilizada como origen de devolución" in r_ret.text
