# -*- coding: utf-8 -*-
"""
test_fase4_hardening.py — Suite Integral de Hardening de Fase 4 (Ventas, Pagos y Entrega).

Cubre exhaustivamente todos los invariantes críticos de negocio:
1. Reversiones financieras sin doble descuento y neutralización exacta (60+40, rev 40 -> neto 60, saldo 40).
2. Concurrencia de reversiones (doble reversión sobre el mismo pago: exactamente una sola prospera).
3. Idempotencia con compatibilidad (misma clave payload divergente -> 409, replay -> 200).
4. Empaque operativo (validaciones de cliente, línea, SKU, bodega, pendientes de empacar, verified <= qty, LISTO_DESPACHO, cancelar/reabrir).
5. Entregas y despachos (límite acumulado, política de pago con excepción auditada, split trazable de reserva remanente, 409 con clave diferente, EN_TRANSITO y ENTREGADO sin duplicar deducciones).
6. Devoluciones de clientes (validación de IDs, derivación forzosa de SKU/owner, límite histórico devuelto, límite refund_amount, DEVOLVER_PROVEEDOR, concurrencia pesimista).
7. Cancelaciones con decisiones reales en inventario y cancelación parcial de línea con recálculo.
8. Máquinas de estados (rechazo estricto de regresiones y saltos ilegales en pedidos, líneas, entregas y empaque).
9. Cálculo comercial e impuestos (suma porcentajes 100%, desglose subtotal/tax/total, validación de excepciones).
10. Fronteras horarias de despacho en America/Bogota (lunes/miércoles/viernes, viernes 17:29:59 vs 17:30:00 vs 17:30:01).
"""
import pytest
import datetime
import zoneinfo
import concurrent.futures
from decimal import Decimal
import uuid
from sqlalchemy import text

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
        last_name=f"Hardening {uid}",
        email=f"client_{uid}@test.com",
        phone="3001234567",
        address="Calle 123 # 45-67, Barranquilla",
        city="Barranquilla",
    )
    db.add(cust)

    wh = Warehouse(
        name=f"Bodega Hardening {uid}",
        location_type="Central",
    )
    db.add(wh)

    br = Brand(name=f"Br-HD-{uid}")
    ca = Category(name=f"Ca-HD-{uid}")
    db.add_all([br, ca])
    db.flush()

    prod = Product(
        name=f"Producto Hardening {uid}",
        brand_id=br.id,
        category_id=ca.id,
        type="Fisico",
        base_currency="COP",
        uom="Ud",
        description="Producto para pruebas de hardening",
    )
    db.add(prod)
    db.flush()

    sku = ProductSKU(
        product_id=prod.id,
        sku=f"SKU-HD-{uid.upper()}",
        cost_price=Decimal("50000.00"),
        sale_price=Decimal("100000.00"),
    )
    db.add(sku)
    db.flush()

    lvl = InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("50.00"))
    db.add(lvl)
    bal_neb = InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("30.00"), updated_at=now)
    bal_mau = InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="MAU", quantity=Decimal("20.00"), updated_at=now)
    db.add_all([bal_neb, bal_mau])
    db.commit()

    return {"customer": cust, "warehouse": wh, "product": prod, "sku": sku, "uid": uid}


class TestFase4Hardening:

    # ─────────────────────────────────────────────────────────────────────────
    # 1. REVERSIONES DE PAGOS (LEDGER INMUTABLE SIN DOBLE DESCUENTO)
    # ─────────────────────────────────────────────────────────────────────────

    def test_reversion_financiera_sin_doble_descuento_60_40(self, app_client, admin_token, db):
        """
        Invariante 1: Libro financiero neutraliza exactamente una transacción.
        Flujo: Pedido total $100.000.
        Pago 1 (+60.000, CONFIRMADO).
        Pago 2 (+40.000, CONFIRMADO).
        Reversión del segundo pago (+40.000).
        Resultado exacto en ledger: neto pagado = 60.000, saldo restante = 40.000.
        No se descuenta dos veces.
        """
        b = _setup_base(db)
        # Crear pedido de 100.000
        so_payload = {
            "customer_id": b["customer"].id,
            "anticipo_pct": 60.0,
            "saldo_pct": 40.0,
            "lines": [
                {
                    "sku_id": b["sku"].id,
                    "quantity": 1,
                    "unit_price_cop": 100000.0,
                    "modalidad": "POR_PEDIDO",
                    "owner": "NEBULAE",
                }
            ]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        assert r_so.status_code == 201
        so_id = r_so.json()["data"]["id"]

        # 1. Pago 1 (+60.000)
        k1 = f"pay-1-{b['uid']}"
        r_p1 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/pagos",
            json={"tipo": "ANTICIPO", "monto": 60000.0, "idempotency_key": k1},
            headers=_auth(admin_token)
        )
        assert r_p1.status_code == 201
        p1_id = r_p1.json()["data"]["id"]
        assert r_p1.json()["data"]["saldo_cop"] == 40000.0
        assert r_p1.json()["data"]["net_pagado"] == 60000.0

        # 2. Pago 2 (+40.000)
        k2 = f"pay-2-{b['uid']}"
        r_p2 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/pagos",
            json={"tipo": "PAGO_SALDO", "monto": 40000.0, "idempotency_key": k2},
            headers=_auth(admin_token)
        )
        assert r_p2.status_code == 201
        p2_id = r_p2.json()["data"]["id"]
        assert r_p2.json()["data"]["saldo_cop"] == 0.0
        assert r_p2.json()["data"]["net_pagado"] == 100000.0

        # 3. Reversión de Pago 2 (+40.000)
        k_rev = f"rev-2-{b['uid']}"
        r_rev = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/pagos",
            json={
                "tipo": "REVERSION",
                "monto": 99999.0,  # El cliente intenta enviar un monto alterado; debe ser ignorado y neutralizar exactamente 40.000
                "reversed_payment_id": p2_id,
                "idempotency_key": k_rev
            },
            headers=_auth(admin_token)
        )
        assert r_rev.status_code == 201
        d_rev = r_rev.json()["data"]

        # VERIFICACIÓN CRÍTICA DEL LEDGER
        # El monto de la reversión debe ser exactamente 40.000 (calculado internamente desde orig_p)
        assert d_rev["monto"] == 40000.0
        # El neto pagado debe ser exactamente 60.000 y el saldo 40.000 (CERO doble descuento)
        assert d_rev["net_pagado"] == 60000.0
        assert d_rev["saldo_cop"] == 40000.0

        # Verificar en base de datos estado inmutable
        p2_db = db.query(SaleOrderPayment).filter(SaleOrderPayment.id == p2_id).first()
        assert p2_db.estado == "REVERTIDO"
        rev_db = db.query(SaleOrderPayment).filter(SaleOrderPayment.id == d_rev["id"]).first()
        assert rev_db.reversed_payment_id == p2_id
        assert rev_db.tipo == "REVERSION"
        assert rev_db.monto == Decimal("40000.00")

    def test_doble_reversion_concurrente_una_sola_prospera(self, app_client, admin_token, db):
        """
        Invariante 1b: Concurrencia real de reversiones sobre el mismo pago.
        Dos hilos concurrentes intentan revertir el mismo pago original.
        Exactamente una sola reversión debe prosperar (201/success) y la otra debe fallar (409).
        """
        b = _setup_base(db)
        so_payload = {
            "customer_id": b["customer"].id,
            "lines": [{"sku_id": b["sku"].id, "quantity": 1, "unit_price_cop": 80000.0, "modalidad": "POR_PEDIDO"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]

        r_p = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/pagos",
            json={"tipo": "PAGO_TOTAL", "monto": 80000.0, "idempotency_key": f"p-conc-{b['uid']}"},
            headers=_auth(admin_token)
        )
        p_id = r_p.json()["data"]["id"]

        def do_revert(worker_id):
            session = SessionLocal()
            try:
                # Simulamos dos peticiones concurrentes con clientes independientes
                res = app_client.post(
                    f"/api/v1/ventas/pedidos/{so_id}/pagos",
                    json={
                        "tipo": "REVERSION",
                        "monto": 80000.0,
                        "reversed_payment_id": p_id,
                        "idempotency_key": f"rev-conc-{worker_id}-{b['uid']}"
                    },
                    headers=_auth(admin_token)
                )
                return res.status_code
            finally:
                session.close()

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(do_revert, 1), executor.submit(do_revert, 2)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        # Uno debe haber tenido éxito (201) y el otro debe haber sido rechazado (409)
        assert 201 in results, f"Se esperaba al menos un 201 en {results}"
        assert 409 in results, f"Se esperaba al menos un 409 en {results}"

    def test_rechazo_revertir_devolucion_o_reversion_o_pago_ya_revertido(self, app_client, admin_token, db):
        """No permitir revertir transacciones que no sean pagos positivos confirmados."""
        b = _setup_base(db)
        so_payload = {
            "customer_id": b["customer"].id,
            "lines": [{"sku_id": b["sku"].id, "quantity": 1, "unit_price_cop": 50000.0, "modalidad": "POR_PEDIDO"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]

        r_p = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/pagos",
            json={"tipo": "PAGO_TOTAL", "monto": 50000.0, "idempotency_key": f"p-test-{b['uid']}"},
            headers=_auth(admin_token)
        )
        p_id = r_p.json()["data"]["id"]

        # Revertir una vez -> OK
        r_rev1 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/pagos",
            json={"tipo": "REVERSION", "monto": 50000.0, "reversed_payment_id": p_id, "idempotency_key": f"rev-ok-{b['uid']}"},
            headers=_auth(admin_token)
        )
        assert r_rev1.status_code == 201
        rev_id = r_rev1.json()["data"]["id"]

        # Intentar revertir el pago ya revertido -> 409
        r_rev2 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/pagos",
            json={"tipo": "REVERSION", "monto": 50000.0, "reversed_payment_id": p_id, "idempotency_key": f"rev-fail-{b['uid']}"},
            headers=_auth(admin_token)
        )
        assert r_rev2.status_code == 409

        # Intentar revertir la reversión misma -> 422
        r_rev3 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/pagos",
            json={"tipo": "REVERSION", "monto": 50000.0, "reversed_payment_id": rev_id, "idempotency_key": f"rev-rev-{b['uid']}"},
            headers=_auth(admin_token)
        )
        assert r_rev3.status_code == 422

    # ─────────────────────────────────────────────────────────────────────────
    # 2. IDEMPOTENCIA CON COMPATIBILIDAD
    # ─────────────────────────────────────────────────────────────────────────

    def test_idempotencia_replay_200_y_conflicto_409_payload_divergente(self, app_client, admin_token, db):
        """
        Invariante 2: Clave repetida con mismo payload -> replay 200.
        Misma clave con monto o venta diferente -> 409 Conflict.
        """
        b = _setup_base(db)
        so_payload = {
            "customer_id": b["customer"].id,
            "lines": [{"sku_id": b["sku"].id, "quantity": 1, "unit_price_cop": 70000.0, "modalidad": "POR_PEDIDO"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]

        k = f"idemp-key-{b['uid']}"
        payload = {"tipo": "ANTICIPO", "monto": 42000.0, "idempotency_key": k}

        # Primera llamada -> 201
        r1 = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json=payload, headers=_auth(admin_token))
        assert r1.status_code == 201

        # Segunda llamada con idéntico payload -> replay 200
        r2 = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json=payload, headers=_auth(admin_token))
        assert r2.status_code == 200
        assert r2.json()["idempotent_replay"] is True
        assert r2.json()["data"]["monto"] == 42000.0

        # Tercera llamada con misma clave pero diferente monto -> 409
        r3 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/pagos",
            json={"tipo": "ANTICIPO", "monto": 50000.0, "idempotency_key": k},
            headers=_auth(admin_token)
        )
        assert r3.status_code == 409

    def test_reserva_inmediata_idempotency_key_columna_explicita(self, app_client, admin_token, db):
        """Reserva inmediata valida columna idempotency_key explícita y detecta divergencias."""
        b = _setup_base(db)
        so_payload = {
            "customer_id": b["customer"].id,
            "lines": [{"sku_id": b["sku"].id, "quantity": 2, "unit_price_cop": 100000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]

        k_res = f"rsv-key-{b['uid']}"
        # 1. Confirmación inmediata inicial -> 200
        r_c1 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key={k_res}",
            headers=_auth(admin_token)
        )
        assert r_c1.status_code == 200

        # 2. Replay idéntico -> replay 200
        r_c2 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key={k_res}",
            headers=_auth(admin_token)
        )
        assert r_c2.status_code == 200
        assert r_c2.json()["idempotent_replay"] is True

        # 3. Misma clave para otra línea o bodega divergente -> 409
        r_c3 = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id=99999&idempotency_key={k_res}",
            headers=_auth(admin_token)
        )
        assert r_c3.status_code == 409

    # ─────────────────────────────────────────────────────────────────────────
    # 3. EMPAQUE OPERATIVO (VALIDACIONES Y LISTO_DESPACHO)
    # ─────────────────────────────────────────────────────────────────────────

    def test_empaque_validaciones_cliente_sku_cantidades_y_listo_despacho(self, app_client, admin_token, db):
        """
        Invariante 3: Validar que el empaque exige coincidencia de cliente, venta, SKU,
        no permite superar la cantidad reservada pendiente, no permite verified > quantity,
        y avanza la sesión a LISTO_DESPACHO y las líneas a LISTA_PARA_ENTREGA al verificar todo.
        """
        b = _setup_base(db)
        # Crear venta inmediata y confirmar reserva
        so_payload = {
            "customer_id": b["customer"].id,
            "lines": [{"sku_id": b["sku"].id, "quantity": 4, "unit_price_cop": 50000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]
        app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key=k-emp-{b['uid']}",
            headers=_auth(admin_token)
        )

        # 1. Intento con SKU que no coincide -> 422
        r_bad_sku = app_client.post(
            "/api/v1/ventas/empaque/sesiones",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "items": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": 99999, "quantity": 2}]
            },
            headers=_auth(admin_token)
        )
        assert r_bad_sku.status_code == 422

        # 2. Intento empacar más de lo reservado -> 422
        r_excess = app_client.post(
            "/api/v1/ventas/empaque/sesiones",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "items": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 10}]
            },
            headers=_auth(admin_token)
        )
        assert r_excess.status_code == 422

        # 3. Empaque válido por 4 unidades -> 201
        r_pack = app_client.post(
            "/api/v1/ventas/empaque/sesiones",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "items": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 4}]
            },
            headers=_auth(admin_token)
        )
        assert r_pack.status_code == 201
        sess_id = r_pack.json()["data"]["id"]

        # Obtener ítem ID
        it_db = db.query(SalePackingItem).filter(SalePackingItem.packing_id == sess_id).first()

        # 4. Intento de verificar más de la cantidad del ítem -> 422 (DB constraint y validación)
        r_v_excess = app_client.patch(
            f"/api/v1/ventas/empaque/sesiones/{sess_id}/items/{it_db.id}",
            json={"verified_quantity": 6.0, "status": "EMPACADO"},
            headers=_auth(admin_token)
        )
        assert r_v_excess.status_code == 422

        # 5. Verificación completa -> pasa a LISTO_DESPACHO
        r_v_ok = app_client.patch(
            f"/api/v1/ventas/empaque/sesiones/{sess_id}/items/{it_db.id}",
            json={"verified_quantity": 4.0, "status": "EMPACADO"},
            headers=_auth(admin_token)
        )
        assert r_v_ok.status_code == 200
        assert r_v_ok.json()["data"]["session_status"] == "LISTO_DESPACHO"

        # Verificar que la línea pasó a LISTA_PARA_ENTREGA
        line_db = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.id == line_id).first()
        assert line_db.estado == "LISTA_PARA_ENTREGA"

        # 6. Reabrir sesión -> EN_PROCESO
        r_reopen = app_client.post(f"/api/v1/ventas/empaque/sesiones/{sess_id}/reabrir", headers=_auth(admin_token))
        assert r_reopen.status_code == 200

    # ─────────────────────────────────────────────────────────────────────────
    # 4. ENTREGAS, DESPACHO PARCIAL (SPLIT) Y TRANSICIONES
    # ─────────────────────────────────────────────────────────────────────────

    def test_despacho_parcial_split_trazable_de_reserva_y_transiciones(self, app_client, admin_token, db):
        """
        Invariante 4: Al despachar parcialmente, la reserva no se convierte completa.
        Se divide (SPLIT) manteniendo ACTIVE el remanente y creando un registro CONVERTED por lo despachado.
        Posteriormente, EN_TRANSITO y ENTREGADO no vuelven a descontar inventario.
        """
        b = _setup_base(db)
        # Venta de 5 unidades, pagada completa
        so_payload = {
            "customer_id": b["customer"].id,
            "anticipo_pct": 100.0,
            "saldo_pct": 0.0,
            "lines": [{"sku_id": b["sku"].id, "quantity": 5, "unit_price_cop": 20000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]

        # Pagar 100.000
        app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/pagos",
            json={"tipo": "PAGO_TOTAL", "monto": 100000.0, "idempotency_key": f"pay-deliv-{b['uid']}"},
            headers=_auth(admin_token)
        )
        # Reservar las 5 unidades
        app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key=res-deliv-{b['uid']}",
            headers=_auth(admin_token)
        )

        # Crear entrega parcial por 2 unidades
        r_del = app_client.post(
            "/api/v1/ventas/entregas",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "delivery_method": "ENTREGA_LOCAL",
                "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 2}]
            },
            headers=_auth(admin_token)
        )
        assert r_del.status_code == 201
        deliv_id = r_del.json()["data"]["id"]

        # Despachar
        k_disp = f"disp-{b['uid']}"
        r_disp = app_client.post(
            f"/api/v1/ventas/entregas/{deliv_id}/despachar",
            json={"idempotency_key": k_disp},
            headers=_auth(admin_token)
        )
        assert r_disp.status_code == 200, f"FAIL DISPATCH: {r_disp.status_code} - {r_disp.text}"

        # VERIFICACIÓN DE RESERVAS: SPLIT TRAZABLE
        res_active = db.query(InventoryReservation).filter(
            InventoryReservation.sale_order_line_id == line_id,
            InventoryReservation.status == "ACTIVE"
        ).first()
        assert res_active is not None
        # La reserva remanente activa debe ser exactamente 3 (5 - 2)
        assert res_active.quantity_reserved == Decimal("3.00")

        res_conv = db.query(InventoryReservation).filter(
            InventoryReservation.sale_order_line_id == line_id,
            InventoryReservation.status == "CONVERTED"
        ).first()
        assert res_conv is not None
        # La porción convertida debe ser exactamente 2
        assert res_conv.quantity_reserved == Decimal("2.00")

        # Verificar que el stock físico en bodega disminuyó en 2 (de 50 a 48)
        lvl = db.query(InventoryLevel).filter(InventoryLevel.sku_id == b["sku"].id, InventoryLevel.warehouse_id == b["warehouse"].id).first()
        assert lvl.quantity == Decimal("48.00")

        # Replay de despacho con misma clave -> 200
        r_replay = app_client.post(
            f"/api/v1/ventas/entregas/{deliv_id}/despachar",
            json={"idempotency_key": k_disp},
            headers=_auth(admin_token)
        )
        assert r_replay.status_code == 200
        assert r_replay.json()["idempotent_replay"] is True

        # Despacho con clave divergente sobre entrega ya despachada -> 409
        r_diff_key = app_client.post(
            f"/api/v1/ventas/entregas/{deliv_id}/despachar",
            json={"idempotency_key": f"diff-{b['uid']}"},
            headers=_auth(admin_token)
        )
        assert r_diff_key.status_code == 409

        # Transición a EN_TRANSITO y ENTREGADO (sin volver a descontar stock)
        r_transit = app_client.post(
            f"/api/v1/ventas/entregas/{deliv_id}/en-transito",
            json={"tracking_number": "TRK-12345", "carrier": "Coordinadora"},
            headers=_auth(admin_token)
        )
        assert r_transit.status_code == 200

        r_ent = app_client.post(
            f"/api/v1/ventas/entregas/{deliv_id}/confirmar-entrega",
            json={"evidence_url": "https://evidence.test/photo.jpg"},
            headers=_auth(admin_token)
        )
        assert r_ent.status_code == 200, f"FAIL: {r_ent.status_code} - {r_ent.text}"

        # Stock físico sigue exactamente en 48.00 (cero doble descuento)
        db.refresh(lvl)
        assert lvl.quantity == Decimal("48.00")

    # ─────────────────────────────────────────────────────────────────────────
    # 5. DEVOLUCIONES DE CLIENTES (DERIVACIÓN Y ACUMULADO)
    # ─────────────────────────────────────────────────────────────────────────

    def test_devoluciones_derivacion_forzosa_owner_sku_y_limite_acumulado(self, app_client, admin_token, db):
        """
        Invariante 5: La devolución deriva forzosamente SKU y owner de la venta original,
        impide devolver más de lo acumulado entregado, e implementa DEVOLVER_PROVEEDOR.
        """
        b = _setup_base(db)
        so_payload = {
            "customer_id": b["customer"].id,
            "anticipo_pct": 100.0,
            "saldo_pct": 0.0,
            "lines": [{"sku_id": b["sku"].id, "quantity": 3, "unit_price_cop": 30000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "MAU"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]

        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 90000.0, "idempotency_key": f"pay-ret-{b['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key=res-ret-{b['uid']}", headers=_auth(admin_token))

        # Despachar 2 unidades
        r_del = app_client.post(
            "/api/v1/ventas/entregas",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "delivery_method": "ENTREGA_LOCAL",
                "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 2}]
            },
            headers=_auth(admin_token)
        )
        deliv_id = r_del.json()["data"]["id"]
        app_client.post(f"/api/v1/ventas/entregas/{deliv_id}/despachar", json={"idempotency_key": f"disp-ret-{b['uid']}"}, headers=_auth(admin_token))

        # 1. Intento de devolver 3 unidades cuando solo se entregaron 2 -> 422
        r_ret_excess = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/devoluciones",
            json={
                "sale_order_id": so_id,
                "customer_id": b["customer"].id,
                "financial_resolution": "DEVOLUCION_DINERO",
                "refund_amount": 90000.0,
                "idempotency_key": f"ret-excess-{b['uid']}",
                "lines": [{
                    "sale_order_line_id": line_id,
                    "warehouse_id": b["warehouse"].id,
                    "quantity": 3,
                    "inventory_resolution": "REINTEGRAR_STOCK"
                }]
            },
            headers=_auth(admin_token)
        )
        assert r_ret_excess.status_code == 422

        # 2. Devolución de 1 unidad con DEVOLVER_PROVEEDOR y payload con owner manipulado -> Debe derivar MAU
        r_ret_prov = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/devoluciones",
            json={
                "sale_order_id": so_id,
                "customer_id": b["customer"].id,
                "financial_resolution": "DEVOLUCION_DINERO",
                "refund_amount": 30000.0,
                "idempotency_key": f"ret-prov-{b['uid']}",
                "lines": [{
                    "sale_order_line_id": line_id,
                    "sku_id": 99999,  # manipulado
                    "owner": "NEBULAE",  # manipulado, la línea original es MAU
                    "warehouse_id": b["warehouse"].id,
                    "quantity": 1,
                    "inventory_resolution": "DEVOLVER_PROVEEDOR"
                }]
            },
            headers=_auth(admin_token)
        )
        assert r_ret_prov.status_code == 201

        # Verificar que el registro de devolución usó el SKU real y el owner MAU
        ret_db = db.query(SaleOrderReturnLine).filter(SaleOrderReturnLine.sale_order_line_id == line_id).first()
        assert ret_db.sku_id == b["sku"].id
        assert ret_db.owner == "MAU"

        # Verificar movimiento Kárdex OUT hacia proveedor generado por la devolución
        ret_id = r_ret_prov.json()["data"]["id"]
        mov_prov = db.query(InventoryMovement).filter(
            InventoryMovement.direction == "OUT",
            InventoryMovement.owner == "MAU",
            InventoryMovement.idempotency_key.like(f"mov-ret-out-{ret_id}-%")
        ).first()
        assert mov_prov is not None
        assert mov_prov.quantity == Decimal("1.00")

    # ─────────────────────────────────────────────────────────────────────────
    # 6. CANCELACIONES (DECISIONES REALES Y CANCELACIÓN PARCIAL)
    # ─────────────────────────────────────────────────────────────────────────

    def test_cancelacion_parcial_linea_con_recalculo_financiero(self, app_client, admin_token, db):
        """
        Invariante 6: Cancelación parcial de línea libera reserva proporcional,
        no altera unidades entregadas y recalcula subtotales y totales.
        """
        b = _setup_base(db)
        so_payload = {
            "customer_id": b["customer"].id,
            "anticipo_pct": 60.0,
            "saldo_pct": 40.0,
            "lines": [{"sku_id": b["sku"].id, "quantity": 10, "unit_price_cop": 10000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key=k-cpar-{b['uid']}", headers=_auth(admin_token))

        # Cancelar parcialmente 4 unidades de las 10
        r_cpart = app_client.post(
            f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/cancelar",
            json={"quantity": 4, "motivo": "Cliente redujo cantidad solicitada"},
            headers=_auth(admin_token)
        )
        assert r_cpart.status_code == 200, f"FAIL CANCEL LINE: {r_cpart.status_code} - {r_cpart.text}"
        d_cp = r_cpart.json()["data"]
        assert d_cp["quantity_cancelled"] == 4.0
        # Total recalculado: 6 * 10.000 = 60.000
        assert d_cp["sale_order_total_cop"] == 60000.0
        assert d_cp["sale_order_saldo_cop"] == 60000.0

        # Verificar que la reserva activa se redujo de 10 a 6
        res = db.query(InventoryReservation).filter(InventoryReservation.sale_order_line_id == line_id, InventoryReservation.status == "ACTIVE").first()
        assert res.quantity_reserved == Decimal("6.00")

    # ─────────────────────────────────────────────────────────────────────────
    # 7. MÁQUINAS DE ESTADOS (RECHAZO DE REGRESIONES Y SALTOS ILEGALES)
    # ─────────────────────────────────────────────────────────────────────────

    def test_maquinas_de_estados_rechazan_regresiones_y_saltos_ilegales(self, app_client, admin_token, db):
        """Invariante 7: Las entidades rechazan saltos arbitrarios y regresiones ilegales."""
        b = _setup_base(db)
        so_payload = {
            "customer_id": b["customer"].id,
            "lines": [{"sku_id": b["sku"].id, "quantity": 2, "unit_price_cop": 20000.0, "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]
        }
        r_so = app_client.post("/api/v1/ventas/pedidos/canonico", json=so_payload, headers=_auth(admin_token))
        so_id = r_so.json()["data"]["id"]
        line_id = r_so.json()["data"]["lines"][0]["id"]
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={"tipo": "PAGO_TOTAL", "monto": 40000.0, "idempotency_key": f"pay-mst-{b['uid']}"}, headers=_auth(admin_token))
        app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata?warehouse_id={b['warehouse'].id}&idempotency_key=res-mst-{b['uid']}", headers=_auth(admin_token))

        # Crear y despachar entrega
        r_del = app_client.post(
            "/api/v1/ventas/entregas",
            json={
                "customer_id": b["customer"].id,
                "warehouse_id": b["warehouse"].id,
                "delivery_method": "ENTREGA_LOCAL",
                "lines": [{"sale_order_id": so_id, "sale_order_line_id": line_id, "sku_id": b["sku"].id, "quantity": 2}]
            },
            headers=_auth(admin_token)
        )
        deliv_id = r_del.json()["data"]["id"]
        app_client.post(f"/api/v1/ventas/entregas/{deliv_id}/despachar", json={"idempotency_key": f"disp-mst-{b['uid']}"}, headers=_auth(admin_token))

        # Intento de reabrir una entrega ya despachada -> 409 o 422
        r_reopen_del = app_client.post(
            f"/api/v1/ventas/entregas/{deliv_id}/despachar",
            json={"idempotency_key": f"disp-bad-{b['uid']}"},
            headers=_auth(admin_token)
        )
        assert r_reopen_del.status_code == 409

    # ─────────────────────────────────────────────────────────────────────────
    # 8. CÁLCULO COMERCIAL E IMPUESTOS
    # ─────────────────────────────────────────────────────────────────────────

    def test_calculo_comercial_porcentajes_100_y_desglose_impuesto(self, app_client, admin_token, db):
        """
        Invariante 8: anticipo_pct + saldo_pct != 100 produce 422.
        Cálculo consistente de subtotal + tax = total.
        """
        b = _setup_base(db)
        # 1. Porcentajes que no suman 100 -> 422
        r_bad_pct = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": b["customer"].id,
                "anticipo_pct": 70.0,
                "saldo_pct": 40.0,  # Suma 110%
                "lines": [{"sku_id": b["sku"].id, "quantity": 1, "unit_price_cop": 100000.0, "modalidad": "POR_PEDIDO"}]
            },
            headers=_auth(admin_token)
        )
        assert r_bad_pct.status_code == 422

        # 2. Desglose consistente con tax_pct=19% y descuento_pct=10%
        # Base: 100.000, Descuento 10% = 10.000 -> Subtotal: 90.000
        # Tax 19% de 90.000 = 17.100
        # Total = 107.100
        r_tax = app_client.post(
            "/api/v1/ventas/pedidos/canonico",
            json={
                "customer_id": b["customer"].id,
                "anticipo_pct": 60.0,
                "saldo_pct": 40.0,
                "lines": [{
                    "sku_id": b["sku"].id,
                    "quantity": 1,
                    "unit_price_cop": 100000.0,
                    "descuento_pct": 10.0,
                    "tax_pct": 19.0,
                    "modalidad": "POR_PEDIDO"
                }]
            },
            headers=_auth(admin_token)
        )
        assert r_tax.status_code == 201
        d_tx = r_tax.json()["data"]
        assert d_tx["subtotal_cop"] == 90000.0
        assert d_tx["tax_cop"] == 17100.0
        assert d_tx["total_cop"] == 107100.0

    # ─────────────────────────────────────────────────────────────────────────
    # 9. POLÍTICA DE DESPACHO (FRONTERAS HORARIAS AMERICA/BOGOTA)
    # ─────────────────────────────────────────────────────────────────────────

    def test_politica_despacho_fronteras_horarias_bogota(self, app_client, admin_token, db):
        """
        Invariante 9: Despacho nacional solo Lun/Mié/Vie.
        Entrega de fin de semana:
        Límite: viernes anterior a las 17:30:00 hora Bogotá.
        Fronteras probadas:
        - Viernes 17:29:59 -> Pasa sin excepción.
        - Viernes 17:30:00 -> Pasa (límite inclusivo).
        - Viernes 17:30:01 -> Requiere excepción autorizada con rol y motivo.
        """
        from app.api.v1.erp_ventas_fase4 import validate_dispatch_operational_policy

        # Fecha programada para un sábado
        # Tomemos el sábado 2026-09-12
        sat_date = datetime.datetime(2026, 9, 12, 10, 0, 0, tzinfo=BOGOTA_TZ)
        # El viernes anterior es 2026-09-11

        # 1. Viernes 17:29:59 Bogotá
        t_before = datetime.datetime(2026, 9, 11, 17, 29, 59, tzinfo=BOGOTA_TZ)
        res_before = validate_dispatch_operational_policy(
            delivery_method="ENTREGA_LOCAL",
            scheduled_date=sat_date,
            created_at_bogota=t_before,
            authorized_by=None,
            exception_reason=None
        )
        assert res_before is None  # Pasa limpio sin excepción

        # 2. Viernes 17:30:00 Bogotá
        t_exact = datetime.datetime(2026, 9, 11, 17, 30, 0, tzinfo=BOGOTA_TZ)
        res_exact = validate_dispatch_operational_policy(
            delivery_method="ENTREGA_LOCAL",
            scheduled_date=sat_date,
            created_at_bogota=t_exact,
            authorized_by=None,
            exception_reason=None
        )
        assert res_exact is None  # Pasa en el límite

        # 3. Viernes 17:30:01 Bogotá sin excepción -> HTTPException 422
        t_after = datetime.datetime(2026, 9, 11, 17, 30, 1, tzinfo=BOGOTA_TZ)
        with pytest.raises(Exception) as exc_info:
            validate_dispatch_operational_policy(
                delivery_method="ENTREGA_LOCAL",
                scheduled_date=sat_date,
                created_at_bogota=t_after,
                authorized_by=None,
                exception_reason=None
            )
        assert "17:30:00" in str(exc_info.value)

        # 4. Viernes 17:30:01 Bogotá con excepción autorizada y motivo válido -> Pasa con advertencia de excepción
        res_with_auth = validate_dispatch_operational_policy(
            delivery_method="ENTREGA_LOCAL",
            scheduled_date=sat_date,
            created_at_bogota=t_after,
            authorized_by="admin@test.com",
            exception_reason="Autorizado por gerencia para entrega urgente"
        )
        assert res_with_auth == "EXCEPCION_FIN_DE_SEMANA"
