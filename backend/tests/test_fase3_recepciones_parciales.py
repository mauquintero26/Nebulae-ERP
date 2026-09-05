"""
test_fase3_recepciones_parciales.py — Tests de Recepciones Parciales y Derivación de Estado PEC (Fase 3).

Escenarios cubiertos:
1. Primera recepción parcial (4 de 10 unidades):
   - Estado del PEC transiciona a PARCIALMENTE_RECIBIDA.
   - PurchaseOrderLine.quantity_received se incrementa en 4.
   - GoodsReceiptLine registra quantity_received=4, quantity_missing=6, status='PARCIAL'.
   - El inventario físico vendible aumenta exactamente 4 unidades.
2. Segunda recepción complementaria (6 de 6 unidades restantes):
   - Estado del PEC transiciona a RECIBIDA (10 de 10 unidades cumplidas).
   - PurchaseOrderLine.quantity_received alcanza 10.
   - GoodsReceiptLine registra quantity_received=6, quantity_missing=0, status='CORRECTA'.
   - El inventario físico vendible aumenta las 6 unidades restantes (total acumulado 10).
3. Intento de recepción en exceso (8 unidades sobre 5 ordenadas) sin allow_excess:
   - Rechazo inmediato con HTTP 422 Unprocessable Entity.
   - El inventario y el estado del PEC quedan inalterados.
4. Recepción en exceso autorizada (7 unidades sobre 5 ordenadas) con allow_excess=True:
   - Aceptación con HTTP 200 OK.
   - GoodsReceiptLine registra quantity_received=7, quantity_excess=2, status='EXCEDENTE'.
   - PurchaseOrderLine.quantity_received registra 7.
   - El inventario físico incrementa en 7.
5. Idempotencia determinista (replay de confirmación):
   - Reintento con la misma clave de idempotencia retorna HTTP 200 con idempotent_replay=True.
   - NO se duplica el stock físico ni se duplican los movimientos de Kárdex.
6. Cierre logístico de Shipment:
   - Recepción física asociada a un Shipment actualiza status_fise a RECIBIDO_BARRANQUILLA
     y genera el evento correspondiente en shipment_events.
"""
import uuid
import datetime
from decimal import Decimal
import pytest
from sqlalchemy import text, select

from app.models.erp_documents import PurchaseOrderFull, GoodsReceipt, Supplier
from app.models.catalog import Product, ProductSKU, Brand, Category
from app.models.inventory import Warehouse, InventoryLevel, InventoryMovement
from app.models.fase1b import PurchaseOrderLine, GoodsReceiptLine
from app.models.fase2 import Shipment, ShipmentEvent


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _unique_key() -> str:
    return f"fa3-rec-{uuid.uuid4().hex}"


def _setup_catalog_po(db, initial_ordered=10):
    now = datetime.datetime.utcnow()
    sup = Supplier(name=f"Sup-Rec-{uuid.uuid4().hex[:6]}", country="Colombia", is_active=True)
    db.add(sup)

    br = Brand(name=f"Br-Rec-{uuid.uuid4().hex[:6]}")
    db.add(br)
    ca = Category(name=f"Ca-Rec-{uuid.uuid4().hex[:6]}")
    db.add(ca)
    db.flush()

    prod = Product(name=f"Prod-Rec-{uuid.uuid4().hex[:6]}", brand_id=br.id, category_id=ca.id, type="Fisico", base_currency="USD", uom="Ud")
    db.add(prod)
    db.flush()

    sku = ProductSKU(product_id=prod.id, sku=f"SKU-R-{uuid.uuid4().hex[:6].upper()}", cost_price=25.0, sale_price=50.0)
    db.add(sku)

    wh = Warehouse(name=f"Bodega-Rec-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(wh)
    db.flush()

    lvl = InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=0)
    db.add(lvl)

    pec_num = f"PEC-TEST-{uuid.uuid4().hex[:8].upper()}"
    pec = PurchaseOrderFull(
        numero=pec_num,
        supplier_id=sup.id,
        supplier_name=sup.name,
        warehouse_id=wh.id,
        estado="EMITIDO",
        fecha_compra=now,
        fecha_entrega_estimada=now + datetime.timedelta(days=10),
        productos=[{"sku_id": sku.id, "sku": sku.sku, "nombre": prod.name, "qty": initial_ordered, "precio_usd": 25.0}]
    )
    db.add(pec)
    db.flush()

    pol = PurchaseOrderLine(
        pec_id=pec.id,
        sku_id=sku.id,
        description=prod.name,
        quantity_ordered=Decimal(str(initial_ordered)),
        quantity_received=Decimal("0"),
        unit_cost_usd=Decimal("25.0"),
        created_at=now
    )
    db.add(pol)
    db.commit()

    return {
        "supplier": sup,
        "product": prod,
        "sku": sku,
        "warehouse": wh,
        "pec": pec,
        "pol": pol,
        "inventory_level": lvl,
    }


def _create_goods_receipt(db, data, qty_expected):
    now = datetime.datetime.utcnow()
    pec = data["pec"]
    wh = data["warehouse"]
    sku = data["sku"]
    pol = data["pol"]

    eninv_num = f"ENINV-R-{uuid.uuid4().hex[:8].upper()}"
    gr = GoodsReceipt(
        numero=eninv_num,
        pec_id=pec.id,
        pec_numero=pec.numero,
        supplier_id=pec.supplier_id,
        supplier_name=pec.supplier_name,
        warehouse_id=wh.id,
        warehouse_name=wh.name,
        estado="BORRADOR",
        stock_actualizado=False,
        receipt_type="FISICA",
        productos=[{
            "sku_id": sku.id,
            "sku": sku.sku,
            "nombre": data["product"].name,
            "qty_esperada": qty_expected,
            "qty_recibida": None
        }],
        created_at=now,
    )
    db.add(gr)
    db.flush()

    grl = GoodsReceiptLine(
        gr_id=gr.id,
        po_line_id=pol.id,
        sku_id=sku.id,
        description=data["product"].name,
        quantity_expected=qty_expected,
        quantity_received=None,
        quantity_rejected=0,
        quantity_quarantine=0,
        receipt_type="FISICA",
        source="NATIVE",
        created_at=now
    )
    db.add(grl)
    db.commit()
    db.refresh(gr)
    db.refresh(grl)
    return gr, grl


class TestFase3RecepcionesParciales:

    def test_recepcion_parcial_cambia_pec_a_parcialmente_recibida(self, app_client, admin_token, db):
        data = _setup_catalog_po(db, initial_ordered=10)
        gr, grl = _create_goods_receipt(db, data, qty_expected=10)

        patch_resp = app_client.patch(
            f"/api/v1/compras/recepciones/{gr.id}/lineas/{grl.id}",
            json={"quantity_received": 4, "quantity_rejected": 0, "quantity_quarantine": 0},
            headers=_auth(admin_token)
        )
        assert patch_resp.status_code == 200, f"Error registrando linea: {patch_resp.text}"

        key = _unique_key()
        conf_resp = app_client.post(
            f"/api/v1/compras/recepciones/{gr.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "FISICA", "allow_excess": False},
            headers=_auth(admin_token)
        )
        assert conf_resp.status_code == 200, f"Error confirmando recepcion: {conf_resp.text}"

        db.expire_all()
        db.refresh(gr)
        db.refresh(grl)
        assert gr.estado == "COMPLETADA"
        assert gr.stock_actualizado is True
        assert grl.quantity_received == 4
        assert int(grl.quantity_missing) == 6
        assert grl.status == "PARCIAL"

        db.refresh(data["pec"])
        db.refresh(data["pol"])
        assert data["pec"].estado == "PARCIALMENTE_RECIBIDA"
        assert int(data["pol"].quantity_received) == 4

        lvl = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == data["sku"].id, InventoryLevel.warehouse_id == data["warehouse"].id)
        ).scalar_one()
        assert lvl.quantity == 4

        mv = db.execute(
            select(InventoryMovement)
            .where(InventoryMovement.sku_id == data["sku"].id, InventoryMovement.direction == "IN")
        ).scalar_one()
        assert mv.quantity == 4
        assert mv.owner == "NEBULAE"

    def test_segunda_recepcion_parcial_completa_pec_a_recibida(self, app_client, admin_token, db):
        data = _setup_catalog_po(db, initial_ordered=10)

        gr1, grl1 = _create_goods_receipt(db, data, qty_expected=10)
        app_client.patch(
            f"/api/v1/compras/recepciones/{gr1.id}/lineas/{grl1.id}",
            json={"quantity_received": 4},
            headers=_auth(admin_token)
        )
        app_client.post(
            f"/api/v1/compras/recepciones/{gr1.id}/confirmar",
            json={"idempotency_key": _unique_key(), "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )

        db.expire_all()
        db.refresh(data["pec"])
        assert data["pec"].estado == "PARCIALMENTE_RECIBIDA"

        gr2, grl2 = _create_goods_receipt(db, data, qty_expected=6)
        app_client.patch(
            f"/api/v1/compras/recepciones/{gr2.id}/lineas/{grl2.id}",
            json={"quantity_received": 6},
            headers=_auth(admin_token)
        )
        conf2 = app_client.post(
            f"/api/v1/compras/recepciones/{gr2.id}/confirmar",
            json={"idempotency_key": _unique_key(), "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )
        assert conf2.status_code == 200

        db.expire_all()
        db.refresh(data["pec"])
        db.refresh(data["pol"])
        db.refresh(grl2)
        assert data["pec"].estado == "RECIBIDA"
        assert int(data["pol"].quantity_received) == 10
        assert grl2.quantity_received == 6
        assert int(grl2.quantity_missing) == 0
        assert grl2.status == "CORRECTA"

        lvl = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == data["sku"].id, InventoryLevel.warehouse_id == data["warehouse"].id)
        ).scalar_one()
        assert lvl.quantity == 10

    def test_recepcion_exceso_sin_permiso_falla_422(self, app_client, admin_token, db):
        data = _setup_catalog_po(db, initial_ordered=5)
        gr, grl = _create_goods_receipt(db, data, qty_expected=5)

        app_client.patch(
            f"/api/v1/compras/recepciones/{gr.id}/lineas/{grl.id}",
            json={"quantity_received": 8},
            headers=_auth(admin_token)
        )

        conf_resp = app_client.post(
            f"/api/v1/compras/recepciones/{gr.id}/confirmar",
            json={"idempotency_key": _unique_key(), "receipt_type": "FISICA", "allow_excess": False},
            headers=_auth(admin_token)
        )
        assert conf_resp.status_code == 422
        assert "excede" in conf_resp.text.lower() or "allow_excess" in conf_resp.text.lower()

        db.expire_all()
        db.refresh(gr)
        assert gr.estado == "BORRADOR"
        assert gr.stock_actualizado is False
        lvl = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == data["sku"].id, InventoryLevel.warehouse_id == data["warehouse"].id)
        ).scalar_one()
        assert lvl.quantity == 0

    def test_recepcion_exceso_con_permiso_registra_quantity_excess(self, app_client, admin_token, db):
        data = _setup_catalog_po(db, initial_ordered=5)
        gr, grl = _create_goods_receipt(db, data, qty_expected=5)

        app_client.patch(
            f"/api/v1/compras/recepciones/{gr.id}/lineas/{grl.id}",
            json={"quantity_received": 7},
            headers=_auth(admin_token)
        )

        conf_resp = app_client.post(
            f"/api/v1/compras/recepciones/{gr.id}/confirmar",
            json={"idempotency_key": _unique_key(), "receipt_type": "FISICA", "allow_excess": True},
            headers=_auth(admin_token)
        )
        assert conf_resp.status_code == 200, f"Error: {conf_resp.text}"

        db.expire_all()
        db.refresh(grl)
        db.refresh(data["pol"])
        assert grl.quantity_received == 7
        assert int(grl.quantity_excess) == 2
        assert grl.status == "EXCEDENTE"
        assert int(data["pol"].quantity_received) == 7

        lvl = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == data["sku"].id, InventoryLevel.warehouse_id == data["warehouse"].id)
        ).scalar_one()
        assert lvl.quantity == 7

    def test_recepcion_idempotencia_replay_no_duplica_stock(self, app_client, admin_token, db):
        data = _setup_catalog_po(db, initial_ordered=5)
        gr, grl = _create_goods_receipt(db, data, qty_expected=5)

        app_client.patch(
            f"/api/v1/compras/recepciones/{gr.id}/lineas/{grl.id}",
            json={"quantity_received": 5},
            headers=_auth(admin_token)
        )

        key = _unique_key()
        body = {"idempotency_key": key, "receipt_type": "FISICA", "allow_excess": False}

        resp1 = app_client.post(f"/api/v1/compras/recepciones/{gr.id}/confirmar", json=body, headers=_auth(admin_token))
        assert resp1.status_code == 200

        resp2 = app_client.post(f"/api/v1/compras/recepciones/{gr.id}/confirmar", json=body, headers=_auth(admin_token))
        assert resp2.status_code == 200
        assert resp2.json().get("idempotent_replay") is True

        db.expire_all()
        lvl = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == data["sku"].id, InventoryLevel.warehouse_id == data["warehouse"].id)
        ).scalar_one()
        assert lvl.quantity == 5

        mvs = db.execute(
            select(InventoryMovement)
            .where(InventoryMovement.sku_id == data["sku"].id, InventoryMovement.direction == "IN")
        ).scalars().all()
        assert len(mvs) == 1

    def test_recepcion_vinculada_a_shipment_actualiza_stage_barranquilla(self, app_client, admin_token, db):
        data = _setup_catalog_po(db, initial_ordered=5)
        gr, grl = _create_goods_receipt(db, data, qty_expected=5)

        now = datetime.datetime.utcnow()
        shp = Shipment(
            shipment_number=f"SHP-REC-{uuid.uuid4().hex[:6].upper()}",
            pec_id=data["pec"].id,
            carrier="DHL",
            tracking_number=f"TRK-{uuid.uuid4().hex[:8].upper()}",
            route_type="DIRECT_TO_BARRANQUILLA",
            status_fise="PREPARANDO_PROVEEDOR",
            origin="PROVEEDOR",
            destination="BARRANQUILLA",
            created_at=now
        )
        db.add(shp)
        db.commit()
        db.refresh(shp)

        # Avanzar el envío a través de la máquina de estados real de Fase 2 hasta LIBERADO_DIAN
        for ev_name in ["EN_VUELO", "EN_DIAN", "LIBERADO_DIAN"]:
            ev_resp = app_client.post(
                f"/api/v1/logistica/shipments/{shp.id}/events",
                json={"event_type": ev_name, "location": "TRANSITO"},
                headers=_auth(admin_token)
            )
            assert ev_resp.status_code == 200, f"Fallo al avanzar evento {ev_name}: {ev_resp.text}"

        gr.shipment_id = shp.id
        gr.reception_stage = "RECEPCION_FINAL"
        db.commit()

        app_client.patch(
            f"/api/v1/compras/recepciones/{gr.id}/lineas/{grl.id}",
            json={"quantity_received": 5},
            headers=_auth(admin_token)
        )

        conf_resp = app_client.post(
            f"/api/v1/compras/recepciones/{gr.id}/confirmar",
            json={"idempotency_key": _unique_key(), "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )
        assert conf_resp.status_code == 200

        db.expire_all()
        db.refresh(shp)
        assert shp.status_fise == "RECIBIDO_BARRANQUILLA"
        assert shp.commercial_status == "EN_BARRANQUILLA"
        assert shp.actual_delivery_date is not None

        events = db.execute(
            select(ShipmentEvent)
            .where(ShipmentEvent.shipment_id == shp.id, ShipmentEvent.event_type == "RECIBIDO_BARRANQUILLA")
        ).scalars().all()
        assert len(events) == 1