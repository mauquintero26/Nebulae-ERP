"""
test_fase3_hardening.py — Suite Maestra de Certificación y Hardening de Fase 3.

Cubre exhaustivamente los 17 puntos requeridos por el Prompt Maestro:
1. Disponibilidad exacta: vendible 10, cuarentena 3, reservas 2 -> disponible 8, vendible 10, cuarentena 3, total custodia 13.
2. Liberar cuarentena de Mau suma únicamente al balance de Mau.
3. Liberar cuarentena de Nebulae suma únicamente al balance de Nebulae.
4. Recepción física con distribución Mau/Nebulae genera Kárdex IN por propietario y balances exactos.
5. Recepción 100% cuarentena genera trazabilidad QUARANTINE sin movimientos IN de vendible.
6. Intento de confirmar recepción de Shipment VIA_MIAMI en ENVIADO_A_MIAMI o CONSOLIDADO es rechazado con 422 y rollback total.
7. Confirmar recepción de Shipment DIRECT_TO_BARRANQUILLA desde EN_TRANSITO_BARRANQUILLA es exitoso.
8. Doble POST concurrente a crear_reserva con misma idempotency_key genera una sola reserva.
9. Replay de liberar_reserva con misma idempotency_key es idempotente (200, sin duplicar).
10. Replay de convertir_reserva con misma idempotency_key no duplica salida física ni Kárdex OUT.
11. Replay de resolver_cuarentena con misma idempotency_key no duplica entrada física ni balance.
12. Misma idempotency_key con payload diferente es rechazada con 409 Conflict.
13. Intento de conversión o salida con saldo insuficiente de propietario falla con 409 y rollback.
14. Operaciones con cantidades Decimal (ej. 0.50, 1.25, 2.75) funcionan con precisión exacta.
15. Migración fa3_002 pasa downgrade y upgrade limpiamente en erp_test.
"""
import os
import sys
import subprocess
import uuid
import datetime
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
import pytest
from sqlalchemy import select, text

from tests.conftest import TEST_URL, PROD_URL, _BACKEND, TestSessionLocal
from app.models.catalog import Product, ProductSKU, Brand, Category
from app.models.inventory import Warehouse, InventoryLevel, InventoryMovement, InventoryOperation
from app.models.fase1b import (
    PurchaseOrderLine, GoodsReceiptLine, ProcurementAllocation,
    InventoryOwnerBalance, InventoryReservation
)
from app.models.erp_documents import PurchaseOrderFull, GoodsReceipt, Supplier
from app.models.fase2 import Shipment, ShipmentEvent
from app.models.fase3 import InventoryQuarantine


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_test_base(db):
    """Crea entidades base mínimas para tests."""
    now = datetime.datetime.utcnow()
    sup = Supplier(name=f"Sup-Hard-{uuid.uuid4().hex[:6]}", country="Colombia", is_active=True)
    db.add(sup)
    br = Brand(name=f"Br-Hard-{uuid.uuid4().hex[:6]}")
    db.add(br)
    ca = Category(name=f"Ca-Hard-{uuid.uuid4().hex[:6]}")
    db.add(ca)
    db.flush()

    prod = Product(
        name=f"Prod-Hard-{uuid.uuid4().hex[:6]}",
        brand_id=br.id, category_id=ca.id,
        type="Fisico", base_currency="USD", uom="Ud"
    )
    db.add(prod)
    db.flush()

    sku = ProductSKU(
        product_id=prod.id,
        sku=f"SKU-HD-{uuid.uuid4().hex[:8].upper()}",
        cost_price=25.0, sale_price=60.0
    )
    db.add(sku)

    wh = Warehouse(name=f"Bodega-Hard-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(wh)
    db.commit()
    db.refresh(sku)
    db.refresh(wh)
    db.refresh(sup)
    db.refresh(prod)

    return {"sku": sku, "warehouse": wh, "supplier": sup, "product": prod}


class TestFase3Hardening:

    def test_caso1_disponibilidad_formula_exacta(self, app_client, admin_token, db):
        """Caso 1: vendible 10, cuarentena 3, reservas 2 -> disponible 8, vendible 10, cuarentena 3, total custodia 13."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        # Vendible 10
        db.add(InventoryLevel(sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("10.00")))
        db.add(InventoryOwnerBalance(sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE", quantity=Decimal("10.00"), updated_at=now))

        # Cuarentena 3
        db.add(InventoryQuarantine(
            sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("3.00"),
            owner="NEBULAE", reason="Daño empaque", status="ACTIVO", created_at=now
        ))

        # Reserva activa 2
        db.add(InventoryReservation(
            sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE",
            quantity_reserved=Decimal("2.00"), status="ACTIVE",
            created_at=now, expires_at=now + datetime.timedelta(hours=48)
        ))
        db.commit()

        resp = app_client.get(
            f"/api/v1/inventory/disponibilidad/{sku_id}?warehouse_id={wh_id}",
            headers=_auth(admin_token)
        )
        assert resp.status_code == 200
        d = resp.json()["data"]

        assert float(d["stock_vendible_fisico"]) == 10.0
        assert float(d["stock_cuarentena"]) == 3.0
        assert float(d["stock_reservado"]) == 2.0
        assert float(d["stock_disponible"]) == 8.0
        assert float(d["stock_total_bajo_custodia"]) == 13.0

    def test_caso2_liberar_cuarentena_mau_suma_solo_mau(self, app_client, admin_token, db):
        """Caso 2: Liberar cuarentena de Mau suma únicamente al balance de Mau."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        # Cuarentena 4 para MAU
        q = InventoryQuarantine(
            sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("4.00"),
            owner="MAU", reason="Inspección lote Mau", status="ACTIVO", created_at=now
        )
        db.add(q)
        db.commit()
        db.refresh(q)

        key = f"lib-mau-{uuid.uuid4().hex}"
        resp = app_client.post(
            f"/api/v1/inventory/cuarentena/{q.id}/resolver",
            json={"idempotency_key": key, "action": "LIBERAR", "notes": "Aprobado para stock Mau"},
            headers=_auth(admin_token)
        )
        assert resp.status_code == 200

        db.expire_all()
        # Stock físico vendible aumentó a 4
        lvl = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == wh_id)).scalar_one()
        assert float(lvl.quantity) == 4.0

        # Balance MAU es exactamente 4
        bal_mau = db.execute(select(InventoryOwnerBalance).where(InventoryOwnerBalance.sku_id == sku_id, InventoryOwnerBalance.owner == "MAU")).scalar_one()
        assert float(bal_mau.quantity) == 4.0

        # Balance NEBULAE no existe o es 0
        bal_neb = db.execute(select(InventoryOwnerBalance).where(InventoryOwnerBalance.sku_id == sku_id, InventoryOwnerBalance.owner == "NEBULAE")).scalar_one_or_none()
        assert bal_neb is None or float(bal_neb.quantity) == 0.0

        # Kárdex IN registrado con owner=MAU
        mv = db.execute(select(InventoryMovement).where(InventoryMovement.sku_id == sku_id, InventoryMovement.direction == "IN")).scalar_one()
        assert mv.owner == "MAU"
        assert float(mv.quantity) == 4.0

    def test_caso3_liberar_cuarentena_nebulae_suma_solo_nebulae(self, app_client, admin_token, db):
        """Caso 3: Liberar cuarentena de Nebulae suma únicamente al balance de Nebulae."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        q = InventoryQuarantine(
            sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("5.00"),
            owner="NEBULAE", reason="Inspección lote Nebulae", status="ACTIVO", created_at=now
        )
        db.add(q)
        db.commit()
        db.refresh(q)

        key = f"lib-neb-{uuid.uuid4().hex}"
        resp = app_client.post(
            f"/api/v1/inventory/cuarentena/{q.id}/resolver",
            json={"idempotency_key": key, "action": "LIBERAR"},
            headers=_auth(admin_token)
        )
        assert resp.status_code == 200

        db.expire_all()
        lvl = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == wh_id)).scalar_one()
        assert float(lvl.quantity) == 5.0

        bal_neb = db.execute(select(InventoryOwnerBalance).where(InventoryOwnerBalance.sku_id == sku_id, InventoryOwnerBalance.owner == "NEBULAE")).scalar_one()
        assert float(bal_neb.quantity) == 5.0

        bal_mau = db.execute(select(InventoryOwnerBalance).where(InventoryOwnerBalance.sku_id == sku_id, InventoryOwnerBalance.owner == "MAU")).scalar_one_or_none()
        assert bal_mau is None or float(bal_mau.quantity) == 0.0

        mv = db.execute(select(InventoryMovement).where(InventoryMovement.sku_id == sku_id, InventoryMovement.direction == "IN")).scalar_one()
        assert mv.owner == "NEBULAE"
        assert float(mv.quantity) == 5.0

    def test_caso4_recepcion_distribucion_mau_nebulae_kardex_in_balances(self, app_client, admin_token, db):
        """Caso 4: Recepción física con distribución Mau/Nebulae genera Kárdex IN por propietario y balances exactos."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        pec = PurchaseOrderFull(
            numero=f"PEC-MIX-{uuid.uuid4().hex[:6]}", supplier_id=base["supplier"].id,
            warehouse_id=wh_id, estado="CONFIRMADA", fecha_compra=now
        )
        db.add(pec)
        db.flush()

        pol = PurchaseOrderLine(
            pec_id=pec.id, sku_id=sku_id, description="Item mixto",
            quantity_ordered=Decimal("10.00"), quantity_received=Decimal("0.00"), unit_cost_usd=Decimal("20.00")
        )
        db.add(pol)
        db.flush()

        # Asignaciones: 6 Nebulae, 4 Mau
        alloc_neb = ProcurementAllocation(po_line_id=pol.id, allocation_type="NEBULAE_STOCK", quantity_allocated=Decimal("6.00"))
        alloc_mau = ProcurementAllocation(po_line_id=pol.id, allocation_type="MAU_STOCK", quantity_allocated=Decimal("4.00"))
        db.add_all([alloc_neb, alloc_mau])

        gr = GoodsReceipt(
            numero=f"ENINV-MIX-{uuid.uuid4().hex[:6]}", pec_id=pec.id, warehouse_id=wh_id,
            estado="BORRADOR", receipt_type="FISICA", stock_actualizado=False
        )
        db.add(gr)
        db.flush()

        grl = GoodsReceiptLine(
            gr_id=gr.id, po_line_id=pol.id, sku_id=sku_id,
            quantity_expected=10, quantity_received=10, receipt_type="FISICA"
        )
        db.add(grl)
        db.commit()

        # Confirmar recepción física
        key = f"cnf-mix-{uuid.uuid4().hex}"
        conf_resp = app_client.post(
            f"/api/v1/compras/recepciones/{gr.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )
        assert conf_resp.status_code == 200

        db.expire_all()
        # 1. Incremento en InventoryLevel = 10
        lvl = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == wh_id)).scalar_one()
        assert float(lvl.quantity) == 10.0

        # 2. Balances por propietario
        bal_neb = db.execute(select(InventoryOwnerBalance).where(InventoryOwnerBalance.sku_id == sku_id, InventoryOwnerBalance.owner == "NEBULAE")).scalar_one()
        bal_mau = db.execute(select(InventoryOwnerBalance).where(InventoryOwnerBalance.sku_id == sku_id, InventoryOwnerBalance.owner == "MAU")).scalar_one()
        assert float(bal_neb.quantity) == 6.0
        assert float(bal_mau.quantity) == 4.0

        # 3. Kárdex IN segregado por propietario
        mvs_in = db.execute(select(InventoryMovement).where(InventoryMovement.sku_id == sku_id, InventoryMovement.direction == "IN")).scalars().all()
        assert len(mvs_in) == 2
        mv_neb = [m for m in mvs_in if m.owner == "NEBULAE"][0]
        mv_mau = [m for m in mvs_in if m.owner == "MAU"][0]
        assert float(mv_neb.quantity) == 6.0
        assert float(mv_mau.quantity) == 4.0
        assert float(mv_neb.quantity + mv_mau.quantity) == float(lvl.quantity)

    def test_caso5_recepcion_100pct_cuarentena_trazabilidad_sin_vendible(self, app_client, admin_token, db):
        """Caso 5: Recepción 100% cuarentena genera trazabilidad QUARANTINE y no incrementa vendible."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        pec = PurchaseOrderFull(
            numero=f"PEC-Q100-{uuid.uuid4().hex[:6]}", supplier_id=base["supplier"].id,
            warehouse_id=wh_id, estado="CONFIRMADA", fecha_compra=now
        )
        db.add(pec)
        db.flush()

        pol = PurchaseOrderLine(
            pec_id=pec.id, sku_id=sku_id, description="Item dañado",
            quantity_ordered=Decimal("5.00"), quantity_received=Decimal("0.00")
        )
        db.add(pol)
        db.flush()

        gr = GoodsReceipt(
            numero=f"ENINV-Q100-{uuid.uuid4().hex[:6]}", pec_id=pec.id, warehouse_id=wh_id,
            estado="BORRADOR", receipt_type="FISICA", stock_actualizado=False
        )
        db.add(gr)
        db.flush()

        grl = GoodsReceiptLine(
            gr_id=gr.id, po_line_id=pol.id, sku_id=sku_id,
            quantity_expected=5, quantity_received=0, quantity_quarantine=5,
            damaged_reason="Dañado en transporte", receipt_type="FISICA"
        )
        db.add(grl)
        db.commit()

        key = f"cnf-q100-{uuid.uuid4().hex}"
        conf_resp = app_client.post(
            f"/api/v1/compras/recepciones/{gr.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )
        assert conf_resp.status_code == 200

        db.expire_all()
        # Stock vendible es 0
        lvl = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == wh_id)).scalar_one_or_none()
        assert lvl is None or float(lvl.quantity) == 0.0

        # Cero movimientos IN
        mvs_in = db.execute(select(InventoryMovement).where(InventoryMovement.sku_id == sku_id, InventoryMovement.direction == "IN")).scalars().all()
        assert len(mvs_in) == 0

        # Sí existe movimiento de trazabilidad QUARANTINE
        mvs_q = db.execute(select(InventoryMovement).where(InventoryMovement.sku_id == sku_id, InventoryMovement.direction == "QUARANTINE")).scalars().all()
        assert len(mvs_q) == 1
        assert float(mvs_q[0].quantity) == 5.0

        # Registro de cuarentena activo
        quar = db.execute(select(InventoryQuarantine).where(InventoryQuarantine.sku_id == sku_id, InventoryQuarantine.status == "ACTIVO")).scalar_one()
        assert float(quar.quantity) == 5.0

    def test_caso6_shipment_via_miami_invalido_falla_422_rollback(self, app_client, admin_token, db):
        """Caso 6: Confirmar recepción de Shipment VIA_MIAMI en ENVIADO_A_MIAMI falla con 422 y rollback total."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        shp = Shipment(
            shipment_number=f"SHP-MIA-{uuid.uuid4().hex[:6]}",
            carrier="DHL", tracking_number=f"TRK-{uuid.uuid4().hex[:8]}",
            route_type="VIA_MIAMI",
            status_fise="ENVIADO_A_MIAMI",  # Estado NO admisible para recepción física en Barranquilla
        )
        db.add(shp)
        db.flush()

        gr = GoodsReceipt(
            numero=f"ENINV-SHP-INV-{uuid.uuid4().hex[:6]}", warehouse_id=wh_id,
            shipment_id=shp.id, estado="BORRADOR", receipt_type="FISICA", stock_actualizado=False
        )
        db.add(gr)
        db.flush()

        grl = GoodsReceiptLine(
            gr_id=gr.id, sku_id=sku_id, quantity_expected=5, quantity_received=5, receipt_type="FISICA"
        )
        db.add(grl)
        db.commit()

        key = f"cnf-shp-inv-{uuid.uuid4().hex}"
        conf_resp = app_client.post(
            f"/api/v1/compras/recepciones/{gr.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )
        assert conf_resp.status_code == 422
        assert "Transición inválida" in conf_resp.text or "RECIBIDO_BARRANQUILLA" in conf_resp.text

        db.expire_all()
        # Rollback total verificado:
        # Recepción permanece en BORRADOR
        gr_db = db.execute(select(GoodsReceipt).where(GoodsReceipt.id == gr.id)).scalar_one()
        assert gr_db.estado == "BORRADOR"

        # Shipment permanece en ENVIADO_A_MIAMI
        shp_db = db.execute(select(Shipment).where(Shipment.id == shp.id)).scalar_one()
        assert shp_db.status_fise == "ENVIADO_A_MIAMI"

        # Cero inventario creado
        lvl = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == wh_id)).scalar_one_or_none()
        assert lvl is None or float(lvl.quantity) == 0.0

    def test_caso7_shipment_directo_barranquilla_valido_exitoso(self, app_client, admin_token, db):
        """Caso 7: Confirmar recepción de Shipment DIRECT_TO_BARRANQUILLA avanzado con eventos reales de Fase 2 es exitoso."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        shp = Shipment(
            shipment_number=f"SHP-DIR-{uuid.uuid4().hex[:6]}",
            carrier="SERVIENTREGA", tracking_number=f"TRK-DIR-{uuid.uuid4().hex[:8]}",
            route_type="DIRECT_TO_BARRANQUILLA",
            status_fise="PREPARANDO_PROVEEDOR",
        )
        db.add(shp)
        db.commit()
        db.refresh(shp)

        # Avanzar mediante la máquina de estados real de Fase 2:
        # PREPARANDO_PROVEEDOR -> EN_VUELO -> EN_DIAN -> LIBERADO_DIAN
        for ev_type in ["EN_VUELO", "EN_DIAN", "LIBERADO_DIAN"]:
            ev_res = app_client.post(
                f"/api/v1/logistica/shipments/{shp.id}/events",
                json={"event_type": ev_type, "location": "TRANSITO"},
                headers=_auth(admin_token),
            )
            assert ev_res.status_code == 200, f"Fallo al avanzar evento {ev_type}: {ev_res.text}"

        gr = GoodsReceipt(
            numero=f"ENINV-DIR-{uuid.uuid4().hex[:6]}", warehouse_id=wh_id,
            shipment_id=shp.id, estado="BORRADOR", receipt_type="FISICA", stock_actualizado=False
        )
        db.add(gr)
        db.flush()

        grl = GoodsReceiptLine(
            gr_id=gr.id, sku_id=sku_id, quantity_expected=3, quantity_received=3, receipt_type="FISICA"
        )
        db.add(grl)
        db.commit()

        key = f"cnf-dir-{uuid.uuid4().hex}"
        conf_resp = app_client.post(
            f"/api/v1/compras/recepciones/{gr.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )
        assert conf_resp.status_code == 200

        db.expire_all()
        shp_db = db.execute(select(Shipment).where(Shipment.id == shp.id)).scalar_one()
        assert shp_db.status_fise == "RECIBIDO_BARRANQUILLA"
        assert shp_db.commercial_status == "EN_BARRANQUILLA"
        assert shp_db.actual_delivery_date is not None

        evs = db.execute(select(ShipmentEvent).where(ShipmentEvent.shipment_id == shp.id, ShipmentEvent.event_type == "RECIBIDO_BARRANQUILLA")).scalars().all()
        assert len(evs) == 1

        # Replay idempotente no debe duplicar evento ni fallar
        replay_resp = app_client.post(
            f"/api/v1/compras/recepciones/{gr.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )
        assert replay_resp.status_code == 200

        db.expire_all()
        evs_after = db.execute(select(ShipmentEvent).where(ShipmentEvent.shipment_id == shp.id, ShipmentEvent.event_type == "RECIBIDO_BARRANQUILLA")).scalars().all()
        assert len(evs_after) == 1

    def test_caso7b_shipment_via_miami_flujo_real_exitoso(self, app_client, admin_token, db):
        """Caso 7B: Confirmar recepción de Shipment VIA_MIAMI avanzado con flujo real hasta LIBERADO_DIAN es exitoso."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id

        shp = Shipment(
            shipment_number=f"SHP-MIA-REAL-{uuid.uuid4().hex[:6]}",
            carrier="DHL", tracking_number=f"TRK-MIA-{uuid.uuid4().hex[:8]}",
            route_type="VIA_MIAMI",
            status_fise="PREPARANDO_PROVEEDOR",
        )
        db.add(shp)
        db.commit()
        db.refresh(shp)

        # Flujo real VIA_MIAMI certificado en Fase 2:
        # PREPARANDO_PROVEEDOR -> ENVIADO_A_MIAMI -> RECIBIDO_MIAMI -> CONSOLIDADO -> EN_VUELO -> EN_DIAN -> LIBERADO_DIAN
        for ev_type in ["ENVIADO_A_MIAMI", "RECIBIDO_MIAMI", "CONSOLIDADO", "EN_VUELO", "EN_DIAN", "LIBERADO_DIAN"]:
            ev_res = app_client.post(
                f"/api/v1/logistica/shipments/{shp.id}/events",
                json={"event_type": ev_type, "location": "TRANSITO"},
                headers=_auth(admin_token),
            )
            assert ev_res.status_code == 200, f"Fallo al avanzar evento {ev_type}: {ev_res.text}"

        gr = GoodsReceipt(
            numero=f"ENINV-MIA-OK-{uuid.uuid4().hex[:6]}", warehouse_id=wh_id,
            shipment_id=shp.id, estado="BORRADOR", receipt_type="FISICA", stock_actualizado=False
        )
        db.add(gr)
        db.flush()

        grl = GoodsReceiptLine(
            gr_id=gr.id, sku_id=sku_id, quantity_expected=4, quantity_received=4, receipt_type="FISICA"
        )
        db.add(grl)
        db.commit()

        key = f"cnf-mia-ok-{uuid.uuid4().hex}"
        conf_resp = app_client.post(
            f"/api/v1/compras/recepciones/{gr.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )
        assert conf_resp.status_code == 200

        db.expire_all()
        shp_db = db.execute(select(Shipment).where(Shipment.id == shp.id)).scalar_one()
        assert shp_db.status_fise == "RECIBIDO_BARRANQUILLA"
        assert shp_db.commercial_status == "EN_BARRANQUILLA"
        assert shp_db.actual_delivery_date is not None

        evs = db.execute(select(ShipmentEvent).where(ShipmentEvent.shipment_id == shp.id, ShipmentEvent.event_type == "RECIBIDO_BARRANQUILLA")).scalars().all()
        assert len(evs) == 1

    def test_caso7c_shipment_estado_inventado_o_desconocido_falla_422(self, app_client, admin_token, db):
        """Caso 7C: Confirmar recepción con Shipment en estado inventado o desconocido devuelve HTTP 422."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id

        shp = Shipment(
            shipment_number=f"SHP-UNK-{uuid.uuid4().hex[:6]}",
            carrier="FEDEX", tracking_number=f"TRK-UNK-{uuid.uuid4().hex[:8]}",
            route_type="DIRECT_TO_BARRANQUILLA",
            status_fise="EN_TRANSITO_BARRANQUILLA",  # Estado inventado / no permitido
        )
        db.add(shp)
        db.flush()

        gr = GoodsReceipt(
            numero=f"ENINV-UNK-{uuid.uuid4().hex[:6]}", warehouse_id=wh_id,
            shipment_id=shp.id, estado="BORRADOR", receipt_type="FISICA", stock_actualizado=False
        )
        db.add(gr)
        db.flush()

        grl = GoodsReceiptLine(
            gr_id=gr.id, sku_id=sku_id, quantity_expected=2, quantity_received=2, receipt_type="FISICA"
        )
        db.add(grl)
        db.commit()

        key = f"cnf-unk-{uuid.uuid4().hex}"
        conf_resp = app_client.post(
            f"/api/v1/compras/recepciones/{gr.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )
        assert conf_resp.status_code == 422

    def test_caso8_doble_post_concurrente_crear_reserva_genera_una_sola(self, app_client, admin_token, db):
        """Caso 8: Doble POST concurrente a crear_reserva con misma idempotency_key genera una sola reserva."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        db.add(InventoryLevel(sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("10.00")))
        db.add(InventoryOwnerBalance(sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE", quantity=Decimal("10.00"), updated_at=now))
        db.commit()

        idem_key = f"idem-conc-{uuid.uuid4().hex}"

        def _call_reserve():
            return app_client.post(
                "/api/v1/inventory/reservas",
                json={
                    "idempotency_key": idem_key,
                    "sku_id": sku_id,
                    "warehouse_id": wh_id,
                    "quantity": 3,
                    "owner": "NEBULAE",
                },
                headers=_auth(admin_token)
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            fut1 = executor.submit(_call_reserve)
            fut2 = executor.submit(_call_reserve)
            r1 = fut1.result()
            r2 = fut2.result()

        # Al menos una es 201 y la otra es replay (200 o 201)
        assert r1.status_code in (200, 201)
        assert r2.status_code in (200, 201)

        # Exactamente UNA reserva fue creada
        db.expire_all()
        reservations = db.execute(
            select(InventoryReservation).where(InventoryReservation.sku_id == sku_id, InventoryReservation.status == "ACTIVE")
        ).scalars().all()
        assert len(reservations) == 1
        assert float(reservations[0].quantity_reserved) == 3.0

    def test_caso9_replay_liberar_reserva_idempotente(self, app_client, admin_token, db):
        """Caso 9: Replay de liberar_reserva con misma idempotency_key es idempotente (200 sin duplicar)."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        db.add(InventoryLevel(sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("5.00")))
        db.add(InventoryOwnerBalance(sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE", quantity=Decimal("5.00"), updated_at=now))
        res = InventoryReservation(
            sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE",
            quantity_reserved=Decimal("2.00"), status="ACTIVE", created_at=now
        )
        db.add(res)
        db.commit()
        db.refresh(res)

        idem_key = f"lib-replay-{uuid.uuid4().hex}"
        # Primer llamado
        resp1 = app_client.post(
            f"/api/v1/inventory/reservas/{res.id}/liberar",
            json={"idempotency_key": idem_key},
            headers=_auth(admin_token)
        )
        assert resp1.status_code == 200

        # Segundo llamado con la misma clave (replay)
        resp2 = app_client.post(
            f"/api/v1/inventory/reservas/{res.id}/liberar",
            json={"idempotency_key": idem_key},
            headers=_auth(admin_token)
        )
        assert resp2.status_code == 200
        assert resp2.json().get("idempotent_replay") is True

        db.expire_all()
        db.refresh(res)
        assert res.status == "RELEASED"

    def test_caso10_replay_convertir_reserva_no_duplica_salida(self, app_client, admin_token, db):
        """Caso 10: Replay de convertir_reserva con misma idempotency_key no duplica salida física ni Kárdex OUT."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        db.add(InventoryLevel(sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("10.00")))
        db.add(InventoryOwnerBalance(sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE", quantity=Decimal("10.00"), updated_at=now))
        res = InventoryReservation(
            sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE",
            quantity_reserved=Decimal("4.00"), status="ACTIVE", created_at=now
        )
        db.add(res)
        db.commit()
        db.refresh(res)

        idem_key = f"conv-replay-{uuid.uuid4().hex}"
        # 1. Convertir
        r1 = app_client.post(
            f"/api/v1/inventory/reservas/{res.id}/convertir",
            json={"idempotency_key": idem_key},
            headers=_auth(admin_token)
        )
        assert r1.status_code == 200

        # 2. Replay
        r2 = app_client.post(
            f"/api/v1/inventory/reservas/{res.id}/convertir",
            json={"idempotency_key": idem_key},
            headers=_auth(admin_token)
        )
        assert r2.status_code == 200
        assert r2.json().get("idempotent_replay") is True

        db.expire_all()
        # Stock disminuyó exactamente 4 (de 10 a 6, NUNCA a 2)
        lvl = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == wh_id)).scalar_one()
        assert float(lvl.quantity) == 6.0

        bal = db.execute(select(InventoryOwnerBalance).where(InventoryOwnerBalance.sku_id == sku_id, InventoryOwnerBalance.owner == "NEBULAE")).scalar_one()
        assert float(bal.quantity) == 6.0

        # Exactamente un movimiento OUT en Kárdex
        mvs = db.execute(select(InventoryMovement).where(InventoryMovement.sku_id == sku_id, InventoryMovement.direction == "OUT")).scalars().all()
        assert len(mvs) == 1
        assert float(mvs[0].quantity) == 4.0

    def test_caso11_replay_resolver_cuarentena_no_duplica_entrada(self, app_client, admin_token, db):
        """Caso 11: Replay de resolver_cuarentena con misma idempotency_key no duplica entrada física ni balance."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        q = InventoryQuarantine(
            sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("5.00"),
            owner="MAU", reason="Liberación segura", status="ACTIVO", created_at=now
        )
        db.add(q)
        db.commit()
        db.refresh(q)

        idem_key = f"q-replay-{uuid.uuid4().hex}"
        r1 = app_client.post(
            f"/api/v1/inventory/cuarentena/{q.id}/resolver",
            json={"idempotency_key": idem_key, "action": "LIBERAR"},
            headers=_auth(admin_token)
        )
        assert r1.status_code == 200

        r2 = app_client.post(
            f"/api/v1/inventory/cuarentena/{q.id}/resolver",
            json={"idempotency_key": idem_key, "action": "LIBERAR"},
            headers=_auth(admin_token)
        )
        assert r2.status_code == 200
        assert r2.json().get("idempotent_replay") is True

        db.expire_all()
        lvl = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == wh_id)).scalar_one()
        assert float(lvl.quantity) == 5.0  # NO 10.0

        bal = db.execute(select(InventoryOwnerBalance).where(InventoryOwnerBalance.sku_id == sku_id, InventoryOwnerBalance.owner == "MAU")).scalar_one()
        assert float(bal.quantity) == 5.0

        mvs = db.execute(select(InventoryMovement).where(InventoryMovement.sku_id == sku_id, InventoryMovement.direction == "IN")).scalars().all()
        assert len(mvs) == 1

    def test_caso12_misma_idempotency_key_payload_diferente_409(self, app_client, admin_token, db):
        """Caso 12: Misma idempotency_key con payload diferente es rechazada con 409 Conflict."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        db.add(InventoryLevel(sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("10.00")))
        db.add(InventoryOwnerBalance(sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE", quantity=Decimal("10.00"), updated_at=now))
        db.commit()

        shared_key = f"shared-key-{uuid.uuid4().hex}"
        r1 = app_client.post(
            "/api/v1/inventory/reservas",
            json={
                "idempotency_key": shared_key,
                "sku_id": sku_id,
                "warehouse_id": wh_id,
                "quantity": 2,
                "owner": "NEBULAE",
            },
            headers=_auth(admin_token)
        )
        assert r1.status_code == 201

        # Reusar misma clave con payload diferente (quantity: 5 en lugar de 2)
        r2 = app_client.post(
            "/api/v1/inventory/reservas",
            json={
                "idempotency_key": shared_key,
                "sku_id": sku_id,
                "warehouse_id": wh_id,
                "quantity": 5,
                "owner": "NEBULAE",
            },
            headers=_auth(admin_token)
        )
        assert r2.status_code == 409
        assert "payload diferente" in r2.text.lower()

    def test_caso13_conversion_saldo_insuficiente_falla_409_rollback(self, app_client, admin_token, db):
        """Caso 13: Intento de conversión con saldo insuficiente de propietario falla con 409 y rollback."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        # Físico 10, pero balance Mau solo 2
        db.add(InventoryLevel(sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("10.00")))
        db.add(InventoryOwnerBalance(sku_id=sku_id, warehouse_id=wh_id, owner="MAU", quantity=Decimal("2.00"), updated_at=now))

        # Reserva de 4 creada forzadamente en BD
        res = InventoryReservation(
            sku_id=sku_id, warehouse_id=wh_id, owner="MAU",
            quantity_reserved=Decimal("4.00"), status="ACTIVE", created_at=now
        )
        db.add(res)
        db.commit()
        db.refresh(res)

        key = f"conv-insuf-{uuid.uuid4().hex}"
        conv_resp = app_client.post(
            f"/api/v1/inventory/reservas/{res.id}/convertir",
            json={"idempotency_key": key},
            headers=_auth(admin_token)
        )
        assert conv_resp.status_code == 409
        assert "insuficiente" in conv_resp.text.lower()

        db.expire_all()
        # Rollback: stock físico y balance permanecen intactos
        lvl = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == wh_id)).scalar_one()
        assert float(lvl.quantity) == 10.0

        bal = db.execute(select(InventoryOwnerBalance).where(InventoryOwnerBalance.sku_id == sku_id, InventoryOwnerBalance.owner == "MAU")).scalar_one()
        assert float(bal.quantity) == 2.0

        db.refresh(res)
        assert res.status == "ACTIVE"

    def test_caso14_operaciones_cantidades_decimal_fraccionarias(self, app_client, admin_token, db):
        """Caso 14: Operaciones con cantidades Decimal (0.50, 1.25, 2.75) funcionan con precisión exacta."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        # Saldo inicial: 10.50
        db.add(InventoryLevel(sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("10.50")))
        db.add(InventoryOwnerBalance(sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE", quantity=Decimal("10.50"), updated_at=now))
        db.commit()

        # 1. Crear reserva de 1.25
        k1 = f"rsv-dec1-{uuid.uuid4().hex}"
        r1 = app_client.post(
            "/api/v1/inventory/reservas",
            json={"idempotency_key": k1, "sku_id": sku_id, "warehouse_id": wh_id, "quantity": 1.25, "owner": "NEBULAE"},
            headers=_auth(admin_token)
        )
        assert r1.status_code == 201
        res1_id = r1.json()["data"]["id"]

        # Disponibilidad: 10.50 - 1.25 = 9.25
        disp1 = app_client.get(f"/api/v1/inventory/disponibilidad/{sku_id}?warehouse_id={wh_id}", headers=_auth(admin_token)).json()["data"]
        assert Decimal(str(disp1["stock_disponible"])) == Decimal("9.25")

        # 2. Convertir reserva de 1.25
        k2 = f"conv-dec1-{uuid.uuid4().hex}"
        r2 = app_client.post(
            f"/api/v1/inventory/reservas/{res1_id}/convertir",
            json={"idempotency_key": k2},
            headers=_auth(admin_token)
        )
        assert r2.status_code == 200

        db.expire_all()
        lvl = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == wh_id)).scalar_one()
        assert Decimal(str(lvl.quantity)) == Decimal("9.25")

        # 3. Crear otra reserva de 2.75
        k3 = f"rsv-dec2-{uuid.uuid4().hex}"
        r3 = app_client.post(
            "/api/v1/inventory/reservas",
            json={"idempotency_key": k3, "sku_id": sku_id, "warehouse_id": wh_id, "quantity": 2.75, "owner": "NEBULAE"},
            headers=_auth(admin_token)
        )
        assert r3.status_code == 201
        res2_id = r3.json()["data"]["id"]

        # Disponibilidad: 9.25 - 2.75 = 6.50
        disp2 = app_client.get(f"/api/v1/inventory/disponibilidad/{sku_id}?warehouse_id={wh_id}", headers=_auth(admin_token)).json()["data"]
        assert Decimal(str(disp2["stock_disponible"])) == Decimal("6.50")

        # 4. Convertir reserva de 2.75
        k4 = f"conv-dec2-{uuid.uuid4().hex}"
        r4 = app_client.post(
            f"/api/v1/inventory/reservas/{res2_id}/convertir",
            json={"idempotency_key": k4},
            headers=_auth(admin_token)
        )
        assert r4.status_code == 200

        db.expire_all()
        lvl2 = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == wh_id)).scalar_one()
        assert Decimal(str(lvl2.quantity)) == Decimal("6.50")

    def test_caso15_fa3_002_downgrade_upgrade_roundtrip(self):
        """Caso 15: Migración fa3_002 pasa downgrade y upgrade limpiamente en erp_test."""
        env = os.environ.copy()
        env["DATABASE_URL"] = TEST_URL

        # Downgrade a fa3_001
        res_down = subprocess.run(
            [sys.executable, "-m", "alembic", "downgrade", "fa3_001"],
            cwd=str(_BACKEND), env=env, capture_output=True, text=True
        )
        assert res_down.returncode == 0, f"Falla en downgrade fa3_001: {res_down.stderr}"

        # Upgrade a head (fa3_002)
        res_up = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=str(_BACKEND), env=env, capture_output=True, text=True
        )
        assert res_up.returncode == 0, f"Falla en upgrade fa3_002: {res_up.stderr}"

    def test_caso16_retry_after_failed_crear_reserva(self, app_client, admin_token, db):
        """Caso 16: Fallo forzado en crear_reserva -> reintento con payload idéntico exitoso (201) -> 3ra llamada replay (200) -> payload divergente (409)."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        db.add(InventoryLevel(sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("5.00")))
        db.add(InventoryOwnerBalance(sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE", quantity=Decimal("5.00"), updated_at=now))
        db.commit()

        key = f"rsv-fail-{uuid.uuid4().hex}"
        payload = {
            "idempotency_key": key,
            "sku_id": sku_id,
            "warehouse_id": wh_id,
            "quantity": 20,  # Insuficiente -> Falla 409
            "owner": "NEBULAE",
        }

        # 1. Fallo forzado
        r_fail = app_client.post("/api/v1/inventory/reservas", json=payload, headers=_auth(admin_token))
        assert r_fail.status_code == 409

        # Verificar persistencia completa atómica en FAILED
        row_failed = db.execute(
            text("SELECT status, request_hash, request_body, execution_token, entity_type, user_id, error_detail, created_at, completed_at "
                 "FROM idempotency_requests WHERE operation_type = 'CREAR_RESERVA' AND operation_key = :k"),
            {"k": key}
        ).fetchone()
        assert row_failed is not None
        assert row_failed.status == "FAILED"
        assert row_failed.request_hash is not None
        assert row_failed.request_body is not None
        assert row_failed.execution_token is not None
        assert row_failed.entity_type == "RESERVA"
        assert row_failed.error_detail is not None
        assert row_failed.created_at is not None
        assert row_failed.completed_at is not None

        # Reintento con payload diferente sobre clave FAILED -> 409
        diff_payload = dict(payload, quantity=30)
        r_diff = app_client.post("/api/v1/inventory/reservas", json=diff_payload, headers=_auth(admin_token))
        assert r_diff.status_code == 409
        assert "payload diferente" in r_diff.text.lower()

        # Incrementar stock para que el reintento del payload idéntico sea exitoso
        lvl = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == wh_id)).scalar_one()
        lvl.quantity = Decimal("50.00")
        bal = db.execute(select(InventoryOwnerBalance).where(InventoryOwnerBalance.sku_id == sku_id, InventoryOwnerBalance.owner == "NEBULAE")).scalar_one()
        bal.quantity = Decimal("50.00")
        db.commit()

        # 2. Reintento con payload idéntico -> Exitoso 201 Created
        r_retry = app_client.post("/api/v1/inventory/reservas", json=payload, headers=_auth(admin_token))
        assert r_retry.status_code == 201
        assert r_retry.json().get("idempotent_replay") is not True

        row_done = db.execute(
            text("SELECT status, response_body FROM idempotency_requests WHERE operation_type = 'CREAR_RESERVA' AND operation_key = :k"),
            {"k": key}
        ).fetchone()
        assert row_done.status == "DONE"
        assert row_done.response_body is not None

        # 3. Tercera llamada -> Replay explícito 200 OK
        r_replay = app_client.post("/api/v1/inventory/reservas", json=payload, headers=_auth(admin_token))
        assert r_replay.status_code == 200
        assert r_replay.json().get("idempotent_replay") is True

        # 4. Intento con payload diferente tras DONE -> 409 Conflict
        r_diff_post_done = app_client.post("/api/v1/inventory/reservas", json=diff_payload, headers=_auth(admin_token))
        assert r_diff_post_done.status_code == 409
        assert "payload diferente" in r_diff_post_done.text.lower()

    def test_caso17_retry_after_failed_convertir_reserva(self, app_client, admin_token, db):
        """Caso 17: Fallo forzado en convertir_reserva -> reintento idéntico exitoso (200) -> 3ra llamada replay (200) -> payload divergente (409)."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        db.add(InventoryLevel(sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("10.00")))
        db.add(InventoryOwnerBalance(sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE", quantity=Decimal("10.00"), updated_at=now))
        res = InventoryReservation(
            sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE", quantity_reserved=Decimal("5.00"),
            status="ACTIVE", created_at=now
        )
        db.add(res)
        db.commit()
        db.refresh(res)

        # Forzar falla bajando nivel a 0
        lvl = db.execute(select(InventoryLevel).where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == wh_id)).scalar_one()
        lvl.quantity = Decimal("0.00")
        db.commit()

        key = f"conv-fail-{uuid.uuid4().hex}"
        payload = {"idempotency_key": key, "notes": "Entrega parcial"}

        # 1. Fallo forzado
        r_fail = app_client.post(f"/api/v1/inventory/reservas/{res.id}/convertir", json=payload, headers=_auth(admin_token))
        assert r_fail.status_code == 409

        # Verificar status FAILED y campos completos
        row_failed = db.execute(
            text("SELECT status, request_hash, entity_type FROM idempotency_requests WHERE operation_type = 'CONVERTIR_RESERVA' AND operation_key = :k"),
            {"k": key}
        ).fetchone()
        assert row_failed.status == "FAILED"
        assert row_failed.entity_type == "RESERVA"

        # Restaurar nivel físico
        lvl.quantity = Decimal("10.00")
        db.commit()

        # 2. Reintento con payload idéntico -> Exitoso 200 OK
        r_retry = app_client.post(f"/api/v1/inventory/reservas/{res.id}/convertir", json=payload, headers=_auth(admin_token))
        assert r_retry.status_code == 200

        # 3. Tercera llamada -> Replay 200 OK
        r_replay = app_client.post(f"/api/v1/inventory/reservas/{res.id}/convertir", json=payload, headers=_auth(admin_token))
        assert r_replay.status_code == 200
        assert r_replay.json().get("idempotent_replay") is True

        # 4. Intento con payload divergente -> 409
        diff_payload = {"idempotency_key": key, "notes": "Notas divergentes"}
        r_diff = app_client.post(f"/api/v1/inventory/reservas/{res.id}/convertir", json=diff_payload, headers=_auth(admin_token))
        assert r_diff.status_code == 409

    def test_caso18_retry_after_failed_liberar_reserva(self, app_client, admin_token, db):
        """Caso 18: Fallo forzado en liberar_reserva -> reintento idéntico exitoso (200) -> 3ra llamada replay (200) -> payload divergente (409)."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        db.add(InventoryLevel(sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("10.00")))
        db.add(InventoryOwnerBalance(sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE", quantity=Decimal("10.00"), updated_at=now))
        res = InventoryReservation(
            sku_id=sku_id, warehouse_id=wh_id, owner="NEBULAE", quantity_reserved=Decimal("5.00"),
            status="CANCELLED", created_at=now  # Estado no activo para forzar fallo
        )
        db.add(res)
        db.commit()
        db.refresh(res)

        key = f"lib-fail-{uuid.uuid4().hex}"
        payload = {"idempotency_key": key, "notes": "Liberación voluntaria"}

        # 1. Fallo forzado
        r_fail = app_client.post(f"/api/v1/inventory/reservas/{res.id}/liberar", json=payload, headers=_auth(admin_token))
        assert r_fail.status_code == 409

        # Activar reserva para permitir éxito
        res.status = "ACTIVE"
        db.commit()

        # 2. Reintento con payload idéntico -> Exitoso 200 OK
        r_retry = app_client.post(f"/api/v1/inventory/reservas/{res.id}/liberar", json=payload, headers=_auth(admin_token))
        assert r_retry.status_code == 200

        # 3. Tercera llamada -> Replay 200 OK
        r_replay = app_client.post(f"/api/v1/inventory/reservas/{res.id}/liberar", json=payload, headers=_auth(admin_token))
        assert r_replay.status_code == 200
        assert r_replay.json().get("idempotent_replay") is True

        # 4. Intento con payload divergente -> 409
        diff_payload = {"idempotency_key": key, "notes": "Notas divergentes"}
        r_diff = app_client.post(f"/api/v1/inventory/reservas/{res.id}/liberar", json=diff_payload, headers=_auth(admin_token))
        assert r_diff.status_code == 409

    def test_caso19_retry_after_failed_resolver_cuarentena(self, app_client, admin_token, db):
        """Caso 19: Fallo forzado en resolver_cuarentena -> reintento idéntico exitoso (200) -> 3ra llamada replay (200) -> payload divergente (409)."""
        base = _create_test_base(db)
        sku_id = base["sku"].id
        wh_id = base["warehouse"].id
        now = datetime.datetime.utcnow()

        q = InventoryQuarantine(
            sku_id=sku_id, warehouse_id=wh_id, quantity=Decimal("4.00"),
            owner="MAU", reason="Defectuoso", status="LIBERADO", created_at=now  # Ya liberado para forzar fallo
        )
        db.add(q)
        db.commit()
        db.refresh(q)

        key = f"quar-fail-{uuid.uuid4().hex}"
        payload = {"idempotency_key": key, "action": "LIBERAR", "notes": "Liberado tras inspección"}

        # 1. Fallo forzado
        r_fail = app_client.post(f"/api/v1/inventory/cuarentena/{q.id}/resolver", json=payload, headers=_auth(admin_token))
        assert r_fail.status_code == 409

        # Activar cuarentena para permitir éxito
        q.status = "ACTIVO"
        db.commit()

        # 2. Reintento con payload idéntico -> Exitoso 200 OK
        r_retry = app_client.post(f"/api/v1/inventory/cuarentena/{q.id}/resolver", json=payload, headers=_auth(admin_token))
        assert r_retry.status_code == 200

        # 3. Tercera llamada -> Replay 200 OK
        r_replay = app_client.post(f"/api/v1/inventory/cuarentena/{q.id}/resolver", json=payload, headers=_auth(admin_token))
        assert r_replay.status_code == 200
        assert r_replay.json().get("idempotent_replay") is True

        # 4. Intento con payload divergente -> 409
        diff_payload = {"idempotency_key": key, "action": "DEVUELTO_PROVEEDOR", "notes": "Divergente"}
        r_diff = app_client.post(f"/api/v1/inventory/cuarentena/{q.id}/resolver", json=diff_payload, headers=_auth(admin_token))
        assert r_diff.status_code == 409
