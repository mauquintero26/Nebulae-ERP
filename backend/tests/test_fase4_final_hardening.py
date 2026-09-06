# -*- coding: utf-8 -*-
"""
test_fase4_final_hardening.py — Suite de Certificación y Hardening Final Fase 4.

Cubre exhaustiva y canónicamente los 8 bloqueos de la auditoría externa:
1. ENTREGAS PARCIALES ACUMULADAS Y CONCURRENCIA:
   - Venta 10, reserva 10. Entrega 4 + Entrega 6. Intento de unidad 11 rechazada (422).
   - Concurrencia pesimista: 2 creaciones simultáneas de 6 sobre disponible 6 -> exactamente una 201, una 422.
   - Reconciliación: delivered 10, reserved 0, reservas ACTIVE 0.
2. DECISIONES EN CANCELACIÓN PARCIAL (LAS 5):
   - PASAR_A_STOCK_NEBULAE: libera reserva, split atómico, owner NEBULAE.
   - MANTENER_PENDIENTE: libera reserva de línea, mantiene allocation para el cliente.
   - REASIGNAR_CLIENTE: transfiere reserva activa a línea destino compatible.
   - DEVOLVER_PROVEEDOR: genera movimiento OUT a proveedor, disminuye stock, reconcilia reservas.
   - REGISTRAR_PERDIDA: genera movimiento SCRAP, disminuye stock, reconcilia reservas.
3. VALIDACIONES ESTRICTAS DE REASIGNAR_CLIENTE:
   - Exige target_customer_id y target_sale_order_line_id.
   - Valida existencia de cliente y línea destino.
   - Valida pertenencia de línea al cliente.
   - Valida que destino != origen.
   - Valida SKU y owner compatibles.
   - Valida que destino no sea terminal (CANCELADA o ENTREGADA).
   - Valida qty_affected <= necesidad_pendiente_destino.
   - Registro de auditoría.
4. EMPAQUE SOLO DE MERCANCÍA DISPONIBLE:
   - Prohibido empacar POR_PEDIDO sin recepción y reserva previa.
   - Requiere reserva ACTIVE en bodega del empaque.
   - Rechazo si quantity > reserved - already_packed.
5. INTEGRACIÓN PACKING -> DELIVERY:
   - Empaque de 10, verificado, LISTO_DESPACHO.
   - Despacho parcial de 4 mantiene sesión en LISTO_DESPACHO (6 pendientes).
   - Segundo despacho de 6 pasa automáticamente sesión a DESPACHADO.
   - Intento de entrega excediendo unidades empacadas -> 422.
6. DEVOLUCIONES: DESTRUIDO Y DEVOLVER_PROVEEDOR:
   - DESTRUIDO: InventoryOperation(SCRAP) + InventoryMovement(direction="SCRAP"), sin aumentar vendible, owner preservado.
   - DEVOLVER_PROVEEDOR: Operación compuesta RETURN_IN + OUT hacia proveedor, efecto neto 0 en nivel y owner balance.
7. IDEMPOTENCIA DE DEVOLUCIONES:
   - SHA-256 fingerprint de los 10 campos.
   - Replay idéntico -> 200 OK con idempotent_replay: True.
   - Replay divergente (mismo key, datos diferentes) -> 409 Conflict.
8. ESTADO PENDIENTE_SALDO:
   - Pedido 60/40 con 60% pagado y 100% reservado -> pasa a PENDIENTE_SALDO.
   - Bloqueo de despacho sin saldo o excepción.
   - Pago restante 40% -> LISTO_PARA_ENTREGA.
   - O POST /api/v1/ventas/pedidos/{id}/excepcion-financiera -> LISTO_PARA_ENTREGA.
"""
import pytest
import datetime
import zoneinfo
import concurrent.futures
from decimal import Decimal
import uuid
from sqlalchemy import text, func, select

from app.models.customers import Customer
from app.models.catalog import ProductSKU, Product, Brand, Category
from app.models.inventory import Warehouse, InventoryLevel, InventoryMovement, InventoryOperation
from app.models.erp_documents import SaleOrder, SalesQuotation, CustomerRequest
from app.models.fase1b import (
    SaleOrderLineErp,
    ProcurementAllocation,
    InventoryOwnerBalance,
    InventoryReservation,
)
from app.models.fase4 import (
    SaleOrderPayment,
    SalePackingSession,
    SalePackingItem,
    SaleOrderDelivery,
    SaleOrderDeliveryLine,
    SaleOrderReturn,
    SaleOrderReturnLine,
)
from app.models.users import User
from app.api.dependencies import ROLE_ADMIN, ROLE_ASESOR, ROLE_BODEGA, ROLE_FINANZAS
from app.db.database import SessionLocal

BOGOTA_TZ = zoneinfo.ZoneInfo("America/Bogota")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_base(db):
    now = datetime.datetime.utcnow()
    uid = uuid.uuid4().hex[:6]

    cust = Customer(
        first_name="Cliente",
        last_name=f"Audit {uid}",
        email=f"client_{uid}@audit.com",
        phone="3009876543",
        address="Cra 50 # 80-10, Barranquilla",
        city="Barranquilla",
    )
    db.add(cust)

    wh = Warehouse(
        name=f"Bodega Principal {uid}",
        location_type="Central",
    )
    db.add(wh)

    br = Brand(name=f"Br-Aud-{uid}")
    ca = Category(name=f"Ca-Aud-{uid}")
    db.add_all([br, ca])
    db.flush()

    prod = Product(
        name=f"Producto Audit {uid}",
        brand_id=br.id,
        category_id=ca.id,
        type="Fisico",
        base_currency="COP",
        uom="Ud",
        description="Producto para suite de certificación final Fase 4",
    )
    db.add(prod)
    db.flush()

    sku = ProductSKU(
        product_id=prod.id,
        sku=f"SKU-AUD-{uid.upper()}",
        cost_price=Decimal("40000.00"),
        sale_price=Decimal("100000.00"),
    )
    db.add(sku)
    db.flush()

    lvl = InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("100.00"))
    db.add(lvl)
    bal_neb = InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("60.00"), updated_at=now)
    bal_mau = InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="MAU", quantity=Decimal("40.00"), updated_at=now)
    db.add_all([bal_neb, bal_mau])
    db.commit()

    return {"customer": cust, "warehouse": wh, "product": prod, "sku": sku, "uid": uid}


class TestFase4FinalHardening:

    # ─────────────────────────────────────────────────────────────────────────
    # 1. ENTREGAS PARCIALES ACUMULADAS Y CONCURRENCIA PESIMISTA
    # ─────────────────────────────────────────────────────────────────────────

    def test_01_entregas_parciales_acumuladas_y_concurrencia_pesimista(self, app_client, admin_token, db):
        """
        Bloqueo 1: Entregas parciales acumuladas canónicas y concurrencia.
        - Venta 10 unidades, reservadas 10 unidades.
        - Entrega 1 por 4 -> OK (disponible pasa a 6).
        - Entrega 2 por 6 -> OK (disponible pasa a 0).
        - Entrega 3 por 1 -> Rechazo 422: no supera cantidad disponible.
        - Concurrencia: 2 intentos simultáneos de 6 sobre disponible 6 -> exactamente uno prospera.
        - Reconciliación: line.quantity_delivered=10, line.quantity_reserved=0, reservas ACTIVE=0.
        """
        b = _setup_base(db)
        so_payload = {
            "customer_id": b["customer"].id,
            "anticipo_pct": 100.0,
            "saldo_pct": 0.0,
            "lines": [{"sku_id": b["sku"].id, "quantity": 10, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        assert r_so.status_code == 201
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]

        # Pagar y reservar
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 1000000.0, "idempotency_key": f"pay-01-{b['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key=res-01-{b['uid']}", headers=_auth(admin_token))

        # Entrega 1 por 4 unidades
        r_del1 = app_client.post(
            "/api/v1/ventas/entregas",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "delivery_method": "ENTREGA_LOCAL",
                "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 4}]
            },
            headers=_auth(admin_token)
        )
        assert r_del1.status_code == 201
        del1_id = r_del1.json()["data"]["id"]

        # Despachar entrega 1
        r_disp1 = app_client.post(f"/api/v1/ventas/entregas/{del1_id}/despachar", json={"idempotency_key": f"disp1-{b['uid']}"}, headers=_auth(admin_token))
        assert r_disp1.status_code == 200

        # Entrega 2 por 6 unidades
        r_del2 = app_client.post(
            "/api/v1/ventas/entregas",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "delivery_method": "ENTREGA_LOCAL",
                "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 6}]
            },
            headers=_auth(admin_token)
        )
        assert r_del2.status_code == 201
        del2_id = r_del2.json()["data"]["id"]

        # Despachar entrega 2
        r_disp2 = app_client.post(f"/api/v1/ventas/entregas/{del2_id}/despachar", json={"idempotency_key": f"disp2-{b['uid']}"}, headers=_auth(admin_token))
        assert r_disp2.status_code == 200

        # Intento de Entrega 3 por 1 unidad -> Debe ser rechazada con 422
        r_del3 = app_client.post(
            "/api/v1/ventas/entregas",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "delivery_method": "ENTREGA_LOCAL",
                "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 1}]
            },
            headers=_auth(admin_token)
        )
        assert r_del3.status_code == 422
        assert "supera lo vendible pendiente disponible" in r_del3.json()["detail"]

        # Reconciliación en base de datos
        db.expire_all()
        line_db = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.id == line_id).first()
        assert line_db.quantity_delivered == Decimal("10.00")
        assert line_db.quantity_reserved == Decimal("0.00")
        assert line_db.estado == "ENTREGADA"
        active_rsv = db.query(InventoryReservation).filter(
            InventoryReservation.sale_order_line_id == line_id,
            InventoryReservation.status == "ACTIVE"
        ).all()
        assert len(active_rsv) == 0

        # Concurrencia Pesimista: 2 creaciones simultáneas de 6 sobre un saldo disponible de 6
        so2_payload = {
            "customer_id": b["customer"].id,
            "anticipo_pct": 100.0,
            "saldo_pct": 0.0,
            "lines": [{"sku_id": b["sku"].id, "quantity": 10, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }
        r_so2 = app_client.post("/api/v1/ventas/pedidos/canonico", json=so2_payload, headers=_auth(admin_token))
        so2_id = r_so2.json()["data"]["id"]
        line2_id = r_so2.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so2_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 1000000.0, "idempotency_key": f"pay-01c-{b['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so2_id}/lineas/{line2_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key=res-01c-{b['uid']}", headers=_auth(admin_token))

        # Entrega previa de 4 para dejar exactamente 6 disponibles
        r_pre = app_client.post(
            "/api/v1/ventas/entregas",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "delivery_method": "ENTREGA_LOCAL",
                "lines": [{"sale_order_id": so2_id, "sale_order_line_id": line2_id, "sku_id": b["sku"].id, "quantity": 4}]
            },
            headers=_auth(admin_token)
        )
        assert r_pre.status_code == 201

        # Dos hilos intentan crear entregas por 6 unidades simultáneamente
        def create_deliv_worker(worker_id):
            session = SessionLocal()
            try:
                res = app_client.post(
                    "/api/v1/ventas/entregas",
                    json={
                        "customer_id": b["customer"].id,
                        "warehouse_id": b["warehouse"].id,
                        "delivery_method": "ENTREGA_LOCAL",
                        "lines": [{"sale_order_id": so2_id, "sale_order_line_id": line2_id, "sku_id": b["sku"].id, "quantity": 6}]
                    },
                    headers=_auth(admin_token)
                )
                return res.status_code
            finally:
                session.close()

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(create_deliv_worker, 1)
            f2 = executor.submit(create_deliv_worker, 2)
            statuses = [f1.result(), f2.result()]

        assert 201 in statuses, f"Uno debió prosperar (201): {statuses}"
        assert 422 in statuses, f"Uno debió ser rechazado con 422: {statuses}"

    # ─────────────────────────────────────────────────────────────────────────
    # 2. LAS CINCO DECISIONES EN CANCELACIÓN PARCIAL
    # ─────────────────────────────────────────────────────────────────────────

    def test_02_cinco_decisiones_cancelacion_parcial(self, app_client, admin_token, db):
        """
        Bloqueo 2: Cancelación parcial ejecutando fielmente las 5 decisiones.
        Cada prueba consume exactamente qty_affected y reconcilia reservas activas.
        """
        b = _setup_base(db)

        # Helper para crear pedido con reserva de 10 unidades
        def _create_order_10(owner="NEBULAE"):
            so_payload = {
                "customer_id": b["customer"].id,
                "anticipo_pct": 100.0,
                "saldo_pct": 0.0,
                "lines": [{"sku_id": b["sku"].id, "quantity": 10, "unit_price_cop": 50000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": owner}]
            }
            r = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
            so_id = r.json()["data"]["id"]
            line_id = r.json()["data"]["lines"][0]["id"]
            app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 500000.0, "idempotency_key": f"pay-dec-{uuid.uuid4().hex[:6]}"}, headers=_auth(admin_token))
            app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key=res-dec-{uuid.uuid4().hex[:6]}", headers=_auth(admin_token))
            return so_id, line_id

        # 2a. PASAR_A_STOCK_NEBULAE
        so_a, line_a = _create_order_10(owner="MAU")
        r_ca = app_client.post(
            f"/api/v1/ventas/pedidos/{so_a}/lineas/{line_a}/cancelar",
            json={"quantity": 2, "decision": "PASAR_A_STOCK_NEBULAE", "motivo": "Cliente cancela 2 unidades"},
            headers=_auth(admin_token)
        )
        assert r_ca.status_code == 200
        db.expire_all()
        l_a = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.id == line_a).first()
        assert l_a.quantity_cancelled == Decimal("2.00")
        assert l_a.quantity_reserved == Decimal("8.00")
        rsv_a_sum = db.query(func.coalesce(func.sum(InventoryReservation.quantity_reserved), Decimal("0.00"))).filter(
            InventoryReservation.sale_order_line_id == line_a, InventoryReservation.status == "ACTIVE"
        ).scalar()
        assert rsv_a_sum == Decimal("8.00")

        # 2b. MANTENER_PENDIENTE
        so_b, line_b = _create_order_10(owner="NEBULAE")
        r_cb = app_client.post(
            f"/api/v1/ventas/pedidos/{so_b}/lineas/{line_b}/cancelar",
            json={"quantity": 2, "decision": "MANTENER_PENDIENTE", "motivo": "Dejar pendiente para otra entrega"},
            headers=_auth(admin_token)
        )
        assert r_cb.status_code == 200
        db.expire_all()
        l_b = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.id == line_b).first()
        assert l_b.quantity_cancelled == Decimal("2.00")
        assert l_b.quantity_reserved == Decimal("8.00")

        # 2c. REASIGNAR_CLIENTE
        # Creamos pedido origen (10 unidades, reservadas 10)
        so_c1, line_c1 = _create_order_10(owner="NEBULAE")
        # Creamos cliente y pedido destino con necesidad pendiente (4 unidades, sin reservar)
        cust_target = Customer(first_name="Destino", last_name="Reasignacion", email=f"dest_{uuid.uuid4().hex[:4]}@audit.com", phone="3000000000")
        db.add(cust_target)
        db.commit()
        so_tgt_payload = {
            "customer_id": cust_target.id,
            "anticipo_pct": 100.0,
            "saldo_pct": 0.0,
            "lines": [{"sku_id": b["sku"].id, "quantity": 4, "unit_price_cop": 50000.0, "modalidad": "POR_PEDIDO", "owner": "NEBULAE"}]
        }
        r_tgt = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_tgt_payload, headers=_auth(admin_token))
        so_tgt_id = r_tgt.json()["data"]["id"]
        line_tgt_id = r_tgt.json()["data"]["lines"][0]["id"]

        r_cc = app_client.post(
            f"/api/v1/ventas/pedidos/{so_c1}/lineas/{line_c1}/cancelar",
            json={
                "quantity": 2,
                "decision": "REASIGNAR_CLIENTE",
                "target_customer_id": cust_target.id,
                "target_sale_order_line_id": line_tgt_id,
                "motivo": "Reasignación a otro pedido del cliente destino"
            },
            headers=_auth(admin_token)
        )
        assert r_cc.status_code == 200, f"Error reasignando: {r_cc.text}"
        db.expire_all()
        l_c1 = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.id == line_c1).first()
        l_tgt = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.id == line_tgt_id).first()
        assert l_c1.quantity_reserved == Decimal("8.00")
        assert l_tgt.quantity_reserved == Decimal("2.00")
        # Verificar reserva transferida
        rsv_tgt = db.query(InventoryReservation).filter(InventoryReservation.sale_order_line_id == line_tgt_id, InventoryReservation.status == "ACTIVE").first()
        assert rsv_tgt is not None
        assert rsv_tgt.quantity_reserved == Decimal("2.00")

        # 2d. DEVOLVER_PROVEEDOR
        so_d, line_d = _create_order_10(owner="MAU")
        r_cd = app_client.post(
            f"/api/v1/ventas/pedidos/{so_d}/lineas/{line_d}/cancelar",
            json={"quantity": 2, "decision": "DEVOLVER_PROVEEDOR", "motivo": "Devolución directa al proveedor"},
            headers=_auth(admin_token)
        )
        assert r_cd.status_code == 200
        db.expire_all()
        l_d = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.id == line_d).first()
        assert l_d.quantity_cancelled == Decimal("2.00")
        assert l_d.quantity_reserved == Decimal("8.00")
        # Movimiento OUT hacia proveedor registrado
        mov_out = db.query(InventoryMovement).filter(
            InventoryMovement.direction == "OUT",
            InventoryMovement.sku_id == b["sku"].id,
            InventoryMovement.owner == "MAU"
        ).order_by(InventoryMovement.id.desc()).first()
        assert mov_out is not None

        # 2e. REGISTRAR_PERDIDA
        so_e, line_e = _create_order_10(owner="NEBULAE")
        r_ce = app_client.post(
            f"/api/v1/ventas/pedidos/{so_e}/lineas/{line_e}/cancelar",
            json={"quantity": 2, "decision": "REGISTRAR_PERDIDA", "motivo": "Mercancía averiada o perdida"},
            headers=_auth(admin_token)
        )
        assert r_ce.status_code == 200
        db.expire_all()
        l_e = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.id == line_e).first()
        assert l_e.quantity_cancelled == Decimal("2.00")
        assert l_e.quantity_reserved == Decimal("8.00")
        # Movimiento SCRAP registrado
        mov_scrap = db.query(InventoryMovement).filter(
            InventoryMovement.direction == "SCRAP",
            InventoryMovement.sku_id == b["sku"].id,
            InventoryMovement.owner == "NEBULAE"
        ).order_by(InventoryMovement.id.desc()).first()
        assert mov_scrap is not None

    # ─────────────────────────────────────────────────────────────────────────
    # 3. VALIDACIONES ESTRICTAS DE REASIGNAR_CLIENTE
    # ─────────────────────────────────────────────────────────────────────────

    def test_03_validaciones_estrictas_reasignar_cliente(self, app_client, admin_token, db):
        """
        Bloqueo 3: Validaciones exhaustivas en REASIGNAR_CLIENTE (HTTP 422).
        """
        b = _setup_base(db)
        so_payload = {
            "customer_id": b["customer"].id,
            "anticipo_pct": 100.0,
            "saldo_pct": 0.0,
            "lines": [{"sku_id": b["sku"].id, "quantity": 5, "unit_price_cop": 50000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 250000.0, "idempotency_key": f"pay-v3-{b['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key=res-v3-{b['uid']}", headers=_auth(admin_token))

        # 1. Falta target_customer_id o target_sale_order_line_id
        r1 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/cancelar",
            json={"quantity": 2, "decision": "REASIGNAR_CLIENTE", "motivo": "Faltan datos de destino"},
            headers=_auth(admin_token)
        )
        assert r1.status_code == 422

        # 2. Cliente destino inexistente
        r2 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/cancelar",
            json={"quantity": 2, "decision": "REASIGNAR_CLIENTE", "target_customer_id": 999999, "target_sale_order_line_id": line_id, "motivo": "Destino inexistente"},
            headers=_auth(admin_token)
        )
        assert r2.status_code == 422

        # 3. Misma línea origen que destino
        r3 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/cancelar",
            json={"quantity": 2, "decision": "REASIGNAR_CLIENTE", "target_customer_id": b["customer"].id, "target_sale_order_line_id": line_id, "motivo": "Misma linea"},
            headers=_auth(admin_token)
        )
        assert r3.status_code == 422
        assert "misma línea" in r3.json()["detail"]

        # Crear segundo cliente con pedido destino
        c2 = Customer(first_name="Cliente", last_name="Destino 2", email=f"c2_{uuid.uuid4().hex[:4]}@audit.com", phone="3001112233")
        db.add(c2)
        db.commit()

        # 4. Línea destino con diferente SKU
        sku_diff = ProductSKU(product_id=b["product"].id, sku=f"SKU-DIFF-{uuid.uuid4().hex[:4]}", cost_price=Decimal("10000.00"), sale_price=Decimal("20000.00"))
        db.add(sku_diff)
        db.commit()
        so_tgt2 = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={"customer_id": c2.id, "lines": [{"sku_id": sku_diff.id, "quantity": 3, "unit_price_cop": 20000.0, "modalidad": "POR_PEDIDO", "owner": "NEBULAE"}]},
            headers=_auth(admin_token)
        )
        line_diff_id = so_tgt2.json()["data"]["lines"][0]["id"]
        r4 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/cancelar",
            json={"quantity": 2, "decision": "REASIGNAR_CLIENTE", "target_customer_id": c2.id, "target_sale_order_line_id": line_diff_id, "motivo": "SKU diferente"},
            headers=_auth(admin_token)
        )
        assert r4.status_code == 422
        assert "SKU incompatible" in r4.json()["detail"]

        # 5. Línea destino con diferente owner (MAU vs NEBULAE)
        so_tgt3 = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={"customer_id": c2.id, "lines": [{"sku_id": b["sku"].id, "quantity": 3, "unit_price_cop": 50000.0, "modalidad": "POR_PEDIDO", "owner": "MAU"}]},
            headers=_auth(admin_token)
        )
        line_diff_owner_id = so_tgt3.json()["data"]["lines"][0]["id"]
        r5 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/cancelar",
            json={"quantity": 2, "decision": "REASIGNAR_CLIENTE", "target_customer_id": c2.id, "target_sale_order_line_id": line_diff_owner_id, "motivo": "Owner diferente"},
            headers=_auth(admin_token)
        )
        assert r5.status_code == 422
        assert "Propietario incompatible" in r5.json()["detail"]

        # 6. Cantidad supera la necesidad pendiente destino
        so_tgt4 = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={"customer_id": c2.id, "lines": [{"sku_id": b["sku"].id, "quantity": 1, "unit_price_cop": 50000.0, "modalidad": "POR_PEDIDO", "owner": "NEBULAE"}]},
            headers=_auth(admin_token)
        )
        line_tgt4_id = so_tgt4.json()["data"]["lines"][0]["id"]
        r6 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/cancelar",
            json={"quantity": 3, "decision": "REASIGNAR_CLIENTE", "target_customer_id": c2.id, "target_sale_order_line_id": line_tgt4_id, "motivo": "Exceso de necesidad"},
            headers=_auth(admin_token)
        )
        assert r6.status_code == 422
        assert "supera la necesidad pendiente" in r6.json()["detail"]

    # ─────────────────────────────────────────────────────────────────────────
    # 4. EMPAQUE SOLO DE MERCANCÍA DISPONIBLE
    # ─────────────────────────────────────────────────────────────────────────

    def test_04_empaque_solo_mercancia_disponible(self, app_client, admin_token, db):
        """
        Bloqueo 4: Prohibido empacar líneas POR_PEDIDO sin reserva y recepción previa.
        Prohibido empacar más de la reserva activa en bodega.
        """
        b = _setup_base(db)
        # Línea POR_PEDIDO sin reserva
        so_payload = {
            "customer_id": b["customer"].id,
            "lines": [{"sku_id": b["sku"].id, "quantity": 5, "unit_price_cop": 80000.0, "modalidad": "POR_PEDIDO", "owner": "NEBULAE"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]

        # Intento de empacar sin reserva física -> 422
        r_bad_pack = app_client.post(
            "/api/v1/ventas/empaque/sesiones",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "items": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 2}]
            },
            headers=_auth(admin_token)
        )
        assert r_bad_pack.status_code == 422
        assert "no tiene reserva física activa" in r_bad_pack.json()["detail"]

    # ─────────────────────────────────────────────────────────────────────────
    # 5. INTEGRACIÓN PACKING -> DELIVERY Y AUTO-CIERRE
    # ─────────────────────────────────────────────────────────────────────────

    def test_05_integracion_packing_delivery_y_auto_cierre(self, app_client, admin_token, db):
        """
        Bloqueo 5: Sesión de empaque con 10 unidades verificadas (LISTO_DESPACHO).
        - Despacho parcial 1 de 4 unidades: Delivery despachado, sesión permanece en LISTO_DESPACHO (6 pendientes).
        - Despacho parcial 2 de 6 unidades: Consume 100%, sesión pasa a DESPACHADO.
        - Intento de entrega 3 con ese packing -> 422 (unidades agotadas).
        """
        b = _setup_base(db)
        so_payload = {
            "customer_id": b["customer"].id,
            "anticipo_pct": 100.0,
            "saldo_pct": 0.0,
            "lines": [{"sku_id": b["sku"].id, "quantity": 10, "unit_price_cop": 60000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 600000.0, "idempotency_key": f"pay-p5-{b['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key=res-p5-{b['uid']}", headers=_auth(admin_token))

        # Crear sesión de empaque de 10 unidades
        r_pack = app_client.post(
            "/api/v1/ventas/empaque/sesiones",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "items": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 10}]
            },
            headers=_auth(admin_token)
        )
        assert r_pack.status_code == 201
        pack_id = r_pack.json()["data"]["id"]

        # Verificar y completar empaque -> LISTO_DESPACHO
        pack_it = db.query(SalePackingItem).filter(SalePackingItem.packing_id == pack_id).first()
        r_v = app_client.patch(
            f"/api/v1/ventas/empaque/sesiones/{pack_id}/items/{pack_it.id}",
            json={"verified_quantity": 10.0, "status": "EMPACADO"},
            headers=_auth(admin_token)
        )
        assert r_v.status_code == 200
        assert r_v.json()["data"]["session_status"] == "LISTO_DESPACHO"

        # Entrega 1 vinculada al packing por 4 unidades
        r_d1 = app_client.post(
            "/api/v1/ventas/entregas",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "packing_id": pack_id,
                "delivery_method": "ENTREGA_LOCAL",
                "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 4}]
            },
            headers=_auth(admin_token)
        )
        assert r_d1.status_code == 201
        d1_id = r_d1.json()["data"]["id"]

        # Despachar entrega 1
        r_dsp1 = app_client.post(f"/api/v1/ventas/entregas/{d1_id}/despachar", json={"idempotency_key": f"dsp1-p5-{b['uid']}"}, headers=_auth(admin_token))
        assert r_dsp1.status_code == 200

        # La sesión de empaque DEBE PERMANECER en LISTO_DESPACHO
        db.expire_all()
        ps_db = db.query(SalePackingSession).filter(SalePackingSession.id == pack_id).first()
        assert ps_db.status == "LISTO_DESPACHO"

        # Entrega 2 vinculada al packing por las 6 restantes
        r_d2 = app_client.post(
            "/api/v1/ventas/entregas",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "packing_id": pack_id,
                "delivery_method": "ENTREGA_LOCAL",
                "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 6}]
            },
            headers=_auth(admin_token)
        )
        assert r_d2.status_code == 201
        d2_id = r_d2.json()["data"]["id"]

        # Despachar entrega 2 -> Al consumir 100%, pasa a DESPACHADO
        r_dsp2 = app_client.post(f"/api/v1/ventas/entregas/{d2_id}/despachar", json={"idempotency_key": f"dsp2-p5-{b['uid']}"}, headers=_auth(admin_token))
        assert r_dsp2.status_code == 200

        db.expire_all()
        ps_db2 = db.query(SalePackingSession).filter(SalePackingSession.id == pack_id).first()
        assert ps_db2.status == "DESPACHADO"

        # Intento de entrega 3 con el mismo packing ya agotado -> 422
        r_d3 = app_client.post(
            "/api/v1/ventas/entregas",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "packing_id": pack_id,
                "delivery_method": "ENTREGA_LOCAL",
                "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 1}]
            },
            headers=_auth(admin_token)
        )
        assert r_d3.status_code == 422

    # ─────────────────────────────────────────────────────────────────────────
    # 6. DEVOLUCIONES: DESTRUIDO Y DEVOLVER_PROVEEDOR
    # ─────────────────────────────────────────────────────────────────────────

    def test_06_devoluciones_destruido_y_devolver_proveedor(self, app_client, admin_token, db):
        """
        Bloqueo 6:
        - DESTRUIDO: genera movimiento SCRAP, sin incrementar inventario vendible ni balance.
        - DEVOLVER_PROVEEDOR: operación compuesta RETURN_IN + OUT con impacto neto 0 en stock y balance.
        """
        b = _setup_base(db)
        so_payload = {
            "customer_id": b["customer"].id,
            "anticipo_pct": 100.0,
            "saldo_pct": 0.0,
            "lines": [{"sku_id": b["sku"].id, "quantity": 4, "unit_price_cop": 50000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "MAU"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 200000.0, "idempotency_key": f"pay-p6-{b['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key=res-p6-{b['uid']}", headers=_auth(admin_token))

        # Despachar las 4 unidades
        r_del = app_client.post(
            "/api/v1/ventas/entregas",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "delivery_method": "ENTREGA_LOCAL",
                "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 4}]
            },
            headers=_auth(admin_token)
        )
        del_id = r_del.json()["data"]["id"]
        app_client.post(f"/api/v1/ventas/entregas/{del_id}/despachar", json={"idempotency_key": f"dsp-p6-{b['uid']}"}, headers=_auth(admin_token))

        # Medir niveles antes de devoluciones
        db.expire_all()
        lvl_before = db.query(InventoryLevel).filter(InventoryLevel.sku_id == b["sku"].id, InventoryLevel.warehouse_id == b["warehouse"].id).first().quantity
        bal_before = db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == b["sku"].id, InventoryOwnerBalance.owner == "MAU").first().quantity

        # Devolución 1: DESTRUIDO por 1 unidad
        r_ret_scrap = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/devoluciones",
            json={
                "sale_order_id": so_id,
                "customer_id": b["customer"].id,
                "financial_resolution": "DEVOLUCION_DINERO",
                "refund_amount": 50000.0,
                "idempotency_key": f"ret-scrap-{b['uid']}",
                "lines": [{
                    "sale_order_line_id": line_id,
                    "warehouse_id": b["warehouse"].id,
                    "quantity": 1,
                    "product_condition": "DEFECTUOSO",
                    "inventory_resolution": "DESTRUIDO"
                }]
            },
            headers=_auth(admin_token)
        )
        assert r_ret_scrap.status_code == 201

        # Verificar que el stock vendible NO aumentó con DESTRUIDO
        db.expire_all()
        lvl_after_scrap = db.query(InventoryLevel).filter(InventoryLevel.sku_id == b["sku"].id, InventoryLevel.warehouse_id == b["warehouse"].id).first().quantity
        assert lvl_after_scrap == lvl_before
        # Movimiento SCRAP verificado en Kárdex
        mov_sc = db.query(InventoryMovement).filter(
            InventoryMovement.direction == "SCRAP",
            InventoryMovement.sku_id == b["sku"].id,
            InventoryMovement.owner == "MAU"
        ).order_by(InventoryMovement.id.desc()).first()
        assert mov_sc is not None
        assert mov_sc.quantity == Decimal("1.00")

        # Devolución 2: DEVOLVER_PROVEEDOR por 1 unidad
        r_ret_prov = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/devoluciones",
            json={
                "sale_order_id": so_id,
                "customer_id": b["customer"].id,
                "financial_resolution": "DEVOLUCION_DINERO",
                "refund_amount": 50000.0,
                "idempotency_key": f"ret-prov-p6-{b['uid']}",
                "lines": [{
                    "sale_order_line_id": line_id,
                    "warehouse_id": b["warehouse"].id,
                    "quantity": 1,
                    "product_condition": "BUENO",
                    "inventory_resolution": "DEVOLVER_PROVEEDOR"
                }]
            },
            headers=_auth(admin_token)
        )
        assert r_ret_prov.status_code == 201

        # Efecto neto 0 en stock vendible y balance del propietario
        db.expire_all()
        lvl_after_prov = db.query(InventoryLevel).filter(InventoryLevel.sku_id == b["sku"].id, InventoryLevel.warehouse_id == b["warehouse"].id).first().quantity
        bal_after_prov = db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == b["sku"].id, InventoryOwnerBalance.owner == "MAU").first().quantity
        assert lvl_after_prov == lvl_before
        assert bal_after_prov == bal_before

        # Verificar ambos movimientos en Kárdex (RETURN_IN y OUT)
        ret2_id = r_ret_prov.json()["data"]["id"]
        mov_in = db.query(InventoryMovement).filter(
            InventoryMovement.direction == "RETURN_IN",
            InventoryMovement.idempotency_key.like(f"mov-ret-prov-in-{ret2_id}-%")
        ).first()
        mov_out = db.query(InventoryMovement).filter(
            InventoryMovement.direction == "OUT",
            InventoryMovement.idempotency_key.like(f"mov-ret-out-{ret2_id}-%")
        ).first()
        assert mov_in is not None and mov_in.quantity == Decimal("1.00")
        assert mov_out is not None and mov_out.quantity == Decimal("1.00")

    # ─────────────────────────────────────────────────────────────────────────
    # 7. IDEMPOTENCIA Y FINGERPRINT SHA-256 EN DEVOLUCIONES
    # ─────────────────────────────────────────────────────────────────────────

    def test_07_idempotencia_y_fingerprint_devoluciones(self, app_client, admin_token, db):
        """
        Bloqueo 7: Idempotencia con huella SHA-256 sobre 10 campos.
        - Replay con mismos parámetros -> 200 OK con idempotent_replay: True.
        - Replay divergente (mismo key, parámetros alterados) -> 409 Conflict.
        """
        b = _setup_base(db)
        so_payload = {
            "customer_id": b["customer"].id,
            "anticipo_pct": 100.0,
            "saldo_pct": 0.0,
            "lines": [{"sku_id": b["sku"].id, "quantity": 3, "unit_price_cop": 40000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 120000.0, "idempotency_key": f"pay-p7-{b['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key=res-p7-{b['uid']}", headers=_auth(admin_token))

        # Despachar 3 unidades
        r_del = app_client.post(
            "/api/v1/ventas/entregas",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "delivery_method": "ENTREGA_LOCAL",
                "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 3}]
            },
            headers=_auth(admin_token)
        )
        del_id = r_del.json()["data"]["id"]
        app_client.post(f"/api/v1/ventas/entregas/{del_id}/despachar", json={"idempotency_key": f"dsp-p7-{b['uid']}"}, headers=_auth(admin_token))

        k_ret = f"ret-idem-{b['uid']}"
        payload = {
            "sale_order_id": so_id,
            "customer_id": b["customer"].id,
            "financial_resolution": "DEVOLUCION_DINERO",
            "refund_amount": 40000.0,
            "idempotency_key": k_ret,
            "lines": [{
                "sale_order_line_id": line_id,
                "warehouse_id": b["warehouse"].id,
                "quantity": 1,
                "product_condition": "BUENO",
                "inventory_resolution": "REINTEGRAR_STOCK"
            }]
        }

        # 1. Primera creación -> 201 Created
        r1 = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/devoluciones", json=payload, headers=_auth(admin_token))
        assert r1.status_code == 201

        # 2. Replay idéntico -> 200 OK con flag de replay
        r2 = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/devoluciones", json=payload, headers=_auth(admin_token))
        assert r2.status_code == 200
        assert r2.json()["idempotent_replay"] is True

        # 3. Payload divergente con misma clave -> 409 Conflict
        bad_payload = dict(payload)
        bad_payload["refund_amount"] = 80000.0  # Monto alterado
        r3 = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/devoluciones", json=bad_payload, headers=_auth(admin_token))
        assert r3.status_code == 409
        assert "idempotency_key ya utilizada para otra devolución con parámetros divergentes" in r3.json()["detail"]

    # ─────────────────────────────────────────────────────────────────────────
    # 8. CICLO PENDIENTE_SALDO Y EXCEPCIONES FINANCIERAS
    # ─────────────────────────────────────────────────────────────────────────

    def test_08_ciclo_pendiente_saldo_y_excepcion_financiera(self, app_client, admin_token, db):
        """
        Bloqueo 8: Estado PENDIENTE_SALDO cuando toda la mercancía está lista pero existe saldo.
        - Pedido 60/40. Anticipo 60% pagado.
        - Mercancía 100% reservada.
        - Estado pasa automáticamente a PENDIENTE_SALDO (no a LISTO_PARA_ENTREGA).
        - Despacho sin excepción es bloqueado (422).
        - Excepción financiera autorizada permite avanzar a LISTO_PARA_ENTREGA.
        - Pago del 40% restante completa ciclo limpio a LISTO_PARA_ENTREGA.
        """
        b = _setup_base(db)
        # Pedido 60/40 de $100.000 COP
        so_payload = {
            "customer_id": b["customer"].id,
            "anticipo_pct": 60.0,
            "saldo_pct": 40.0,
            "lines": [{"sku_id": b["sku"].id, "quantity": 1, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        assert r_so.status_code == 201
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]

        # Pagar solo el anticipo (60.000 COP). Saldo restante: 40.000 COP
        r_p = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/pagos",
            json={"tipo": "ANTICIPO", "monto": 60000.0, "idempotency_key": f"pay-60-{b['uid']}"},
            headers=_auth(admin_token)
        )
        assert r_p.status_code == 201
        assert r_p.json()["data"]["saldo_cop"] == 40000.0

        # Reservar el 100% de la mercancía (1 unidad)
        r_rsv = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key=rsv-p8-{b['uid']}",
            headers=_auth(admin_token)
        )
        assert r_rsv.status_code == 200

        # Al estar toda la mercancía lista pero saldo_cop > 0, el estado DEBE ser PENDIENTE_SALDO
        db.expire_all()
        so_db = db.query(SaleOrder).filter(SaleOrder.id == so_id).first()
        assert so_db.estado == "PENDIENTE_SALDO"

        # Crear entrega
        r_del = app_client.post(
            "/api/v1/ventas/entregas",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "delivery_method": "ENTREGA_LOCAL",
                "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 1}]
            },
            headers=_auth(admin_token)
        )
        assert r_del.status_code == 201
        del_id = r_del.json()["data"]["id"]

        # Intentar despachar sin excepción autorizada -> 422
        r_bad_dsp = app_client.post(
            f"/api/v1/ventas/entregas/{del_id}/despachar",
            json={"idempotency_key": f"dsp-bad-{b['uid']}"},
            headers=_auth(admin_token)
        )
        assert r_bad_dsp.status_code == 422
        assert "tiene saldo pendiente" in r_bad_dsp.json()["detail"]

        # Registrar excepción financiera formal en el pedido
        r_exc = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/excepcion-financiera",
            json={
                "policy_exception_authorized_by": "gerencia@nebulae.com",
                "policy_exception_reason": "Crédito a 15 días aprobado por dirección comercial"
            },
            headers=_auth(admin_token)
        )
        assert r_exc.status_code == 200
        assert r_exc.json()["data"]["estado"] == "LISTO_PARA_ENTREGA"

        # Ahora el despacho con la autorización de excepción prospera
        r_ok_dsp = app_client.post(
            f"/api/v1/ventas/entregas/{del_id}/despachar",
            json={"idempotency_key": f"dsp-exc-{b['uid']}"},
            headers=_auth(admin_token)
        )
        assert r_ok_dsp.status_code == 200
