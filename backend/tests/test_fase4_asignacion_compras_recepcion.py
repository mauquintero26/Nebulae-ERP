"""
test_fase4_asignacion_compras_recepcion.py — Asignación Compras → Recepción → Reserva Automática (Fase 4).

Escenarios cubiertos:
1. Asignación CUSTOMER_ORDER y recepción física completa:
   - Crea reserva automática (ACTIVE) vinculada a sale_order_line_id.
   - Actualiza quantity_reserved y estado de línea a RESERVADA.
2. Recepción parcial:
   - Asigna únicamente las unidades efectivamente recibidas y aceptadas.
   - Línea queda PARCIALMENTE_DISPONIBLE.
3. Cuarentena y liberación posterior:
   - Unidades en cuarentena NO crean reserva al recibirse.
   - La liberación posterior (/cuarentena/{id}/resolver action=LIBERAR) asigna la reserva al cliente original.
4. Replay idempotente de recepción:
   - No duplica reservas de inventario ante reintentos con la misma idempotency_key.
5. Compra agrupada para múltiples clientes con recepción parcial:
   - Asigna secuencialmente según asignaciones sin sobre-asignar ni duplicar.
"""
import uuid
import datetime
from decimal import Decimal
import pytest
from sqlalchemy import select

from app.models.customers import Customer
from app.models.catalog import Product, ProductSKU, Brand, Category
from app.models.inventory import Warehouse, InventoryLevel
from app.models.erp_documents import SaleOrder, PurchaseOrderFull, GoodsReceipt, Supplier
from app.models.fase1b import (
    SaleOrderLineErp,
    PurchaseOrderLine,
    ProcurementAllocation,
    GoodsReceiptLine,
    InventoryOwnerBalance,
    InventoryReservation,
)
from app.models.fase3 import InventoryQuarantine


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_procurement_env(db):
    now = datetime.datetime.utcnow()
    br = Brand(name=f"Br-Cmp-{uuid.uuid4().hex[:6]}")
    ca = Category(name=f"Ca-Cmp-{uuid.uuid4().hex[:6]}")
    db.add_all([br, ca])
    db.flush()

    prod = Product(name=f"Prod-Cmp-{uuid.uuid4().hex[:6]}", brand_id=br.id, category_id=ca.id, type="Fisico", base_currency="COP", uom="Ud")
    db.add(prod)
    db.flush()

    sku = ProductSKU(product_id=prod.id, sku=f"SKU-CMP-{uuid.uuid4().hex[:6].upper()}", cost_price=40000.0, sale_price=80000.0)
    db.add(sku)

    wh = Warehouse(name=f"Bodega-Cmp-{uuid.uuid4().hex[:6]}", location_type="Central")
    sup = Supplier(name=f"Prov-Cmp-{uuid.uuid4().hex[:6]}", contact_name="Carlos Proveedor")
    c1 = Customer(first_name="Cliente", last_name=f"Comprador-1-{uuid.uuid4().hex[:4]}", email=f"c1_{uuid.uuid4().hex[:6]}@test.com")
    c2 = Customer(first_name="Cliente", last_name=f"Comprador-2-{uuid.uuid4().hex[:4]}", email=f"c2_{uuid.uuid4().hex[:6]}@test.com")
    db.add_all([wh, sup, c1, c2])
    db.commit()

    return {"sku": sku, "warehouse": wh, "supplier": sup, "customer1": c1, "customer2": c2}


class TestFase4AsignacionComprasRecepcion:

    def test_asignacion_compras_y_recepcion_reserva_automatica(self, app_client, admin_token, db):
        """Venta POR_PEDIDO asignada a PO; recepción física genera reserva automática para el cliente."""
        now = datetime.datetime.utcnow()
        data = _setup_procurement_env(db)
        sku = data["sku"]
        wh = data["warehouse"]
        sup = data["supplier"]
        c1 = data["customer1"]

        # 1. Crear pedido de venta canónico con línea POR_PEDIDO
        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c1.id,
            "lines": [{"sku_id": sku.id, "quantity": 5.0, "unit_price_cop": 80000.0, "modalidad": "POR_PEDIDO", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        assert resp_so.status_code == 201
        so_id = resp_so.json()["data"]["id"]
        line_id = resp_so.json()["data"]["lines"][0]["id"]

        # 2. Crear PO y Allocation CUSTOMER_ORDER
        po = PurchaseOrderFull(
            numero=f"PEC-{uuid.uuid4().hex[:6].upper()}",
            supplier_id=sup.id,
            warehouse_id=wh.id,
            estado="APROBADO",
            total_cop=200000.0,
            created_at=now,
        )
        db.add(po)
        db.flush()

        pol = PurchaseOrderLine(
            pec_id=po.id,
            sku_id=sku.id,
            quantity_ordered=Decimal("5.00"),
            unit_cost_cop=Decimal("40000.00"),
            description=sku.sku,
            created_at=now,
        )
        db.add(pol)
        db.flush()

        alloc = ProcurementAllocation(
            po_line_id=pol.id,
            allocation_type="CUSTOMER_ORDER",
            sale_order_line_id=line_id,
            quantity_allocated=Decimal("5.00"),
            created_at=now,
        )
        db.add(alloc)
        db.flush()

        # 3. Crear recepción ENINV con GoodsReceiptLine
        eninv = GoodsReceipt(
            numero=f"ENINV-{uuid.uuid4().hex[:6].upper()}",
            pec_id=po.id,
            supplier_id=sup.id,
            warehouse_id=wh.id,
            estado="PENDIENTE",
            created_at=now,
        )
        db.add(eninv)
        db.flush()

        grl = GoodsReceiptLine(
            gr_id=eninv.id,
            po_line_id=pol.id,
            sku_id=sku.id,
            quantity_expected=Decimal("5.00"),
            quantity_received=Decimal("5.00"),
            quantity_quarantine=Decimal("0.00"),
            quantity_rejected=Decimal("0.00"),
            status="RECIBIDO",
            receipt_type="FISICA",
            created_at=now,
        )
        db.add(grl)
        db.commit()

        # 4. Confirmar recepción vía endpoint oficial
        c_key = f"idem-recv-{uuid.uuid4().hex}"
        resp_conf = app_client.post(
            f"/api/v1/compras/recepciones/{eninv.id}/confirmar",
            json={"idempotency_key": c_key, "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )
        assert resp_conf.status_code == 200, resp_conf.text

        # 5. Verificar que se creó la reserva automática para la línea del cliente
        res = db.execute(
            select(InventoryReservation).where(
                InventoryReservation.sale_order_line_id == line_id,
                InventoryReservation.status == "ACTIVE"
            )
        ).scalar_one_or_none()
        assert res is not None, "No se creó la reserva automática para el cliente"
        assert Decimal(str(res.quantity_reserved)) == Decimal("5.00")
        assert res.sku_id == sku.id
        assert res.warehouse_id == wh.id

        # 6. Verificar actualización de la línea de venta
        sol_db = db.execute(select(SaleOrderLineErp).where(SaleOrderLineErp.id == line_id)).scalar_one()
        assert Decimal(str(sol_db.quantity_reserved)) == Decimal("5.00")
        assert sol_db.estado == "RESERVADA"

    def test_recepcion_parcial_asigna_solo_lo_aceptado(self, app_client, admin_token, db):
        """Recepción de 3 unidades de 5 pedidas asigna reserva por 3 y línea queda PARCIALMENTE_DISPONIBLE."""
        now = datetime.datetime.utcnow()
        data = _setup_procurement_env(db)
        sku = data["sku"]
        wh = data["warehouse"]
        sup = data["supplier"]
        c1 = data["customer1"]

        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c1.id,
            "lines": [{"sku_id": sku.id, "quantity": 5.0, "unit_price_cop": 80000.0, "modalidad": "POR_PEDIDO", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        assert resp_so.status_code == 201
        line_id = resp_so.json()["data"]["lines"][0]["id"]

        po = PurchaseOrderFull(numero=f"PEC-{uuid.uuid4().hex[:6].upper()}", supplier_id=sup.id, warehouse_id=wh.id, estado="APROBADO")
        db.add(po)
        db.flush()

        pol = PurchaseOrderLine(pec_id=po.id, sku_id=sku.id, quantity_ordered=Decimal("5.00"), unit_cost_cop=Decimal("40000.00"))
        db.add(pol)
        db.flush()

        alloc = ProcurementAllocation(po_line_id=pol.id, allocation_type="CUSTOMER_ORDER", sale_order_line_id=line_id, quantity_allocated=Decimal("5.00"))
        db.add(alloc)
        db.flush()

        eninv = GoodsReceipt(numero=f"ENINV-{uuid.uuid4().hex[:6].upper()}", pec_id=po.id, supplier_id=sup.id, warehouse_id=wh.id, estado="PENDIENTE")
        db.add(eninv)
        db.flush()

        # Solo se reciben 3 unidades
        grl = GoodsReceiptLine(
            gr_id=eninv.id, po_line_id=pol.id, sku_id=sku.id,
            quantity_expected=Decimal("5.00"), quantity_received=Decimal("3.00"),
            quantity_missing=Decimal("2.00"), receipt_type="FISICA"
        )
        db.add(grl)
        db.commit()

        resp_conf = app_client.post(
            f"/api/v1/compras/recepciones/{eninv.id}/confirmar",
            json={"idempotency_key": f"parc-{uuid.uuid4().hex}", "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )
        assert resp_conf.status_code == 200, resp_conf.text

        res = db.execute(select(InventoryReservation).where(InventoryReservation.sale_order_line_id == line_id, InventoryReservation.status == "ACTIVE")).scalar_one()
        assert Decimal(str(res.quantity_reserved)) == Decimal("3.00")

        sol_db = db.execute(select(SaleOrderLineErp).where(SaleOrderLineErp.id == line_id)).scalar_one()
        assert Decimal(str(sol_db.quantity_reserved)) == Decimal("3.00")
        assert sol_db.estado == "PARCIALMENTE_DISPONIBLE"

    def test_cuarentena_no_crea_reserva_y_liberacion_crea_reserva(self, app_client, admin_token, db):
        """Unidades en cuarentena no crean reserva; su liberación posterior sí crea reserva para el cliente."""
        now = datetime.datetime.utcnow()
        data = _setup_procurement_env(db)
        sku = data["sku"]
        wh = data["warehouse"]
        sup = data["supplier"]
        c1 = data["customer1"]

        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c1.id,
            "lines": [{"sku_id": sku.id, "quantity": 4.0, "unit_price_cop": 80000.0, "modalidad": "POR_PEDIDO", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        assert resp_so.status_code == 201
        line_id = resp_so.json()["data"]["lines"][0]["id"]

        po = PurchaseOrderFull(numero=f"PEC-{uuid.uuid4().hex[:6].upper()}", supplier_id=sup.id, warehouse_id=wh.id, estado="APROBADO")
        db.add(po)
        db.flush()

        pol = PurchaseOrderLine(pec_id=po.id, sku_id=sku.id, quantity_ordered=Decimal("4.00"), unit_cost_cop=Decimal("40000.00"))
        db.add(pol)
        db.flush()

        alloc = ProcurementAllocation(po_line_id=pol.id, allocation_type="CUSTOMER_ORDER", sale_order_line_id=line_id, quantity_allocated=Decimal("4.00"))
        db.add(alloc)
        db.flush()

        eninv = GoodsReceipt(numero=f"ENINV-{uuid.uuid4().hex[:6].upper()}", pec_id=po.id, supplier_id=sup.id, warehouse_id=wh.id, estado="PENDIENTE")
        db.add(eninv)
        db.flush()

        # 4 unidades van a cuarentena por sospecha de daño
        grl = GoodsReceiptLine(
            gr_id=eninv.id, po_line_id=pol.id, sku_id=sku.id,
            quantity_expected=Decimal("4.00"), quantity_received=Decimal("0.00"),
            quantity_quarantine=Decimal("4.00"), damaged_reason="Caja húmeda", receipt_type="FISICA"
        )
        db.add(grl)
        db.commit()

        # Confirmar recepción
        app_client.post(
            f"/api/v1/compras/recepciones/{eninv.id}/confirmar",
            json={"idempotency_key": f"quar-{uuid.uuid4().hex}", "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )

        # 1. Validar que NO hay reservas creadas
        active_res = db.execute(
            select(InventoryReservation).where(InventoryReservation.sale_order_line_id == line_id, InventoryReservation.status == "ACTIVE")
        ).scalars().all()
        assert len(active_res) == 0, "No debe haber reservas para unidades en cuarentena"

        # 2. Validar registro de cuarentena
        quar_record = db.execute(
            select(InventoryQuarantine).where(InventoryQuarantine.gr_line_id == grl.id, InventoryQuarantine.status == "ACTIVO")
        ).scalar_one()
        assert Decimal(str(quar_record.quantity)) == Decimal("4.00")

        # 3. Liberar cuarentena vía /api/v1/inventory/cuarentena/{id}/resolver
        resp_res = app_client.post(
            f"/api/v1/inventory/cuarentena/{quar_record.id}/resolver",
            json={"action": "LIBERAR", "notes": "Inspección técnica aprobada", "idempotency_key": f"lib-{uuid.uuid4().hex}"},
            headers=_auth(admin_token)
        )
        assert resp_res.status_code == 200, resp_res.text

        # 4. Verificar que ahora SÍ existe la reserva asignada al cliente
        res_after = db.execute(
            select(InventoryReservation).where(InventoryReservation.sale_order_line_id == line_id, InventoryReservation.status == "ACTIVE")
        ).scalar_one()
        assert Decimal(str(res_after.quantity_reserved)) == Decimal("4.00")

        sol_after = db.execute(select(SaleOrderLineErp).where(SaleOrderLineErp.id == line_id)).scalar_one()
        assert Decimal(str(sol_after.quantity_reserved)) == Decimal("4.00")
        assert sol_after.estado == "RESERVADA"

    def test_replay_recepcion_no_duplica_reservas(self, app_client, admin_token, db):
        """Replay de confirmación con la misma idempotency_key devuelve 200 sin duplicar reservas."""
        now = datetime.datetime.utcnow()
        data = _setup_procurement_env(db)
        sku = data["sku"]
        wh = data["warehouse"]
        sup = data["supplier"]
        c1 = data["customer1"]

        resp_so = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c1.id,
            "lines": [{"sku_id": sku.id, "quantity": 2.0, "unit_price_cop": 80000.0, "modalidad": "POR_PEDIDO", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        line_id = resp_so.json()["data"]["lines"][0]["id"]

        po = PurchaseOrderFull(numero=f"PEC-{uuid.uuid4().hex[:6].upper()}", supplier_id=sup.id, warehouse_id=wh.id, estado="APROBADO")
        db.add(po)
        db.flush()

        pol = PurchaseOrderLine(pec_id=po.id, sku_id=sku.id, quantity_ordered=Decimal("2.00"), unit_cost_cop=Decimal("40000.00"))
        db.add(pol)
        db.flush()

        alloc = ProcurementAllocation(po_line_id=pol.id, allocation_type="CUSTOMER_ORDER", sale_order_line_id=line_id, quantity_allocated=Decimal("2.00"))
        db.add(alloc)
        db.flush()

        eninv = GoodsReceipt(numero=f"ENINV-{uuid.uuid4().hex[:6].upper()}", pec_id=po.id, supplier_id=sup.id, warehouse_id=wh.id, estado="PENDIENTE")
        db.add(eninv)
        db.flush()

        grl = GoodsReceiptLine(gr_id=eninv.id, po_line_id=pol.id, sku_id=sku.id, quantity_expected=Decimal("2.00"), quantity_received=Decimal("2.00"), receipt_type="FISICA")
        db.add(grl)
        db.commit()

        c_key = f"rep-recv-{uuid.uuid4().hex}"
        # Primer intento
        r1 = app_client.post(f"/api/v1/compras/recepciones/{eninv.id}/confirmar", json={"idempotency_key": c_key, "receipt_type": "FISICA"}, headers=_auth(admin_token))
        assert r1.status_code == 200

        # Replay
        r2 = app_client.post(f"/api/v1/compras/recepciones/{eninv.id}/confirmar", json={"idempotency_key": c_key, "receipt_type": "FISICA"}, headers=_auth(admin_token))
        assert r2.status_code == 200
        assert r2.json().get("idempotent_replay") is True

        # Verificar que solo hay 1 reserva activa
        all_res = db.execute(select(InventoryReservation).where(InventoryReservation.sale_order_line_id == line_id, InventoryReservation.status == "ACTIVE")).scalars().all()
        assert len(all_res) == 1
        assert Decimal(str(all_res[0].quantity_reserved)) == Decimal("2.00")

    def test_compra_multiples_clientes_recepcion_parcial(self, app_client, admin_token, db):
        """Compra consolidada para 2 clientes; recepción parcial asigna en orden de allocación."""
        now = datetime.datetime.utcnow()
        data = _setup_procurement_env(db)
        sku = data["sku"]
        wh = data["warehouse"]
        sup = data["supplier"]
        c1 = data["customer1"]
        c2 = data["customer2"]

        # Pedido 1: 3 unidades
        r_so1 = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c1.id, "lines": [{"sku_id": sku.id, "quantity": 3.0, "unit_price_cop": 80000.0, "modalidad": "POR_PEDIDO", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        line1_id = r_so1.json()["data"]["lines"][0]["id"]

        # Pedido 2: 2 unidades
        r_so2 = app_client.post("/api/v1/ventas/pedidos/canonico", json={
            "customer_id": c2.id, "lines": [{"sku_id": sku.id, "quantity": 2.0, "unit_price_cop": 80000.0, "modalidad": "POR_PEDIDO", "owner": "NEBULAE"}]
        }, headers=_auth(admin_token))
        line2_id = r_so2.json()["data"]["lines"][0]["id"]

        po = PurchaseOrderFull(numero=f"PEC-{uuid.uuid4().hex[:6].upper()}", supplier_id=sup.id, warehouse_id=wh.id, estado="APROBADO")
        db.add(po)
        db.flush()

        pol = PurchaseOrderLine(pec_id=po.id, sku_id=sku.id, quantity_ordered=Decimal("5.00"), unit_cost_cop=Decimal("40000.00"))
        db.add(pol)
        db.flush()

        alloc1 = ProcurementAllocation(po_line_id=pol.id, allocation_type="CUSTOMER_ORDER", sale_order_line_id=line1_id, quantity_allocated=Decimal("3.00"))
        alloc2 = ProcurementAllocation(po_line_id=pol.id, allocation_type="CUSTOMER_ORDER", sale_order_line_id=line2_id, quantity_allocated=Decimal("2.00"))
        db.add_all([alloc1, alloc2])
        db.flush()

        eninv = GoodsReceipt(numero=f"ENINV-{uuid.uuid4().hex[:6].upper()}", pec_id=po.id, supplier_id=sup.id, warehouse_id=wh.id, estado="PENDIENTE")
        db.add(eninv)
        db.flush()

        # Se reciben 4 unidades en total
        grl = GoodsReceiptLine(gr_id=eninv.id, po_line_id=pol.id, sku_id=sku.id, quantity_expected=Decimal("5.00"), quantity_received=Decimal("4.00"), receipt_type="FISICA")
        db.add(grl)
        db.commit()

        r_conf = app_client.post(f"/api/v1/compras/recepciones/{eninv.id}/confirmar", json={"idempotency_key": f"multi-{uuid.uuid4().hex}", "receipt_type": "FISICA"}, headers=_auth(admin_token))
        assert r_conf.status_code == 200

        # Cliente 1 recibe sus 3 unidades completas
        sol1 = db.execute(select(SaleOrderLineErp).where(SaleOrderLineErp.id == line1_id)).scalar_one()
        assert Decimal(str(sol1.quantity_reserved)) == Decimal("3.00")
        assert sol1.estado == "RESERVADA"

        # Cliente 2 recibe 1 unidad restante (parcial)
        sol2 = db.execute(select(SaleOrderLineErp).where(SaleOrderLineErp.id == line2_id)).scalar_one()
        assert Decimal(str(sol2.quantity_reserved)) == Decimal("1.00")
        assert sol2.estado == "PARCIALMENTE_DISPONIBLE"
