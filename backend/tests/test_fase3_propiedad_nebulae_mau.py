"""
test_fase3_propiedad_nebulae_mau.py — Separación Patrimonial Nebulae vs Mau (Fase 3).

Escenarios cubiertos:
1. Recepción de orden con asignaciones mixtas de compra:
   - 6 unidades asignadas a Nebulae (CUSTOMER_ORDER / NEBULAE_STOCK).
   - 4 unidades asignadas a Mau (MAU_STOCK).
   - Actualización precisa en inventory_owner_balances:
     NEBULAE = 6, MAU = 4. Total físico = 10.
2. Protección patrimonial estricta en reservas:
   - Una reserva para orden de Nebulae por 8 unidades es rechazada (409 Conflict)
     a pesar de haber 10 unidades físicas en bodega, porque Nebulae solo posee 6.
     El stock de Mau NUNCA puede ser vendido o reservado por Nebulae.
3. Reserva legítima por propietario Mau:
   - Una reserva para MAU por 4 unidades es aprobada (201 Created).
4. Reporte consolidado (/api/v1/inventory/stock-summary):
   - Muestra claramente los balances segregados por propietario para cada SKU y bodega.
"""
import uuid
import datetime
from decimal import Decimal
import pytest
from sqlalchemy import select

from app.models.erp_documents import PurchaseOrderFull, GoodsReceipt, Supplier
from app.models.catalog import Product, ProductSKU, Brand, Category
from app.models.inventory import Warehouse, InventoryLevel
from app.models.fase1b import PurchaseOrderLine, GoodsReceiptLine, ProcurementAllocation, InventoryOwnerBalance


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_mixed_po_scenario(db):
    now = datetime.datetime.utcnow()
    sup = Supplier(name=f"Sup-Own-{uuid.uuid4().hex[:6]}", country="Colombia", is_active=True)
    db.add(sup)

    br = Brand(name=f"Br-Own-{uuid.uuid4().hex[:6]}")
    db.add(br)
    ca = Category(name=f"Ca-Own-{uuid.uuid4().hex[:6]}")
    db.add(ca)
    db.flush()

    prod = Product(name=f"Prod-Own-{uuid.uuid4().hex[:6]}", brand_id=br.id, category_id=ca.id, type="Fisico", base_currency="USD", uom="Ud")
    db.add(prod)
    db.flush()

    sku = ProductSKU(product_id=prod.id, sku=f"SKU-OWN-{uuid.uuid4().hex[:6].upper()}", cost_price=50.0, sale_price=100.0)
    db.add(sku)

    wh = Warehouse(name=f"Bodega-Own-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(wh)
    db.flush()

    lvl = InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=0)
    db.add(lvl)

    pec = PurchaseOrderFull(
        numero=f"PEC-OWN-{uuid.uuid4().hex[:8].upper()}",
        supplier_id=sup.id,
        supplier_name=sup.name,
        warehouse_id=wh.id,
        estado="EMITIDO",
        fecha_compra=now,
        fecha_entrega_estimada=now + datetime.timedelta(days=5),
        productos=[{"sku_id": sku.id, "sku": sku.sku, "nombre": prod.name, "qty": 10, "precio_usd": 50.0}]
    )
    db.add(pec)
    db.flush()

    pol = PurchaseOrderLine(
        pec_id=pec.id,
        sku_id=sku.id,
        description=prod.name,
        quantity_ordered=Decimal("10"),
        quantity_received=Decimal("0"),
        unit_cost_usd=Decimal("50.0"),
        created_at=now
    )
    db.add(pol)
    db.flush()

    # Asignaciones de compra: 6 para Nebulae, 4 para Mau
    alloc_neb = ProcurementAllocation(
        po_line_id=pol.id,
        allocation_type="NEBULAE_STOCK",
        quantity_allocated=Decimal("6"),
        created_at=now
    )
    alloc_mau = ProcurementAllocation(
        po_line_id=pol.id,
        allocation_type="MAU_STOCK",
        quantity_allocated=Decimal("4"),
        created_at=now
    )
    db.add_all([alloc_neb, alloc_mau])

    gr = GoodsReceipt(
        numero=f"ENINV-OWN-{uuid.uuid4().hex[:8].upper()}",
        pec_id=pec.id,
        pec_numero=pec.numero,
        supplier_id=sup.id,
        supplier_name=sup.name,
        warehouse_id=wh.id,
        warehouse_name=wh.name,
        estado="BORRADOR",
        stock_actualizado=False,
        receipt_type="FISICA",
        productos=[{"sku_id": sku.id, "sku": sku.sku, "nombre": prod.name, "qty_esperada": 10}],
        created_at=now
    )
    db.add(gr)
    db.flush()

    grl = GoodsReceiptLine(
        gr_id=gr.id,
        po_line_id=pol.id,
        sku_id=sku.id,
        description=prod.name,
        quantity_expected=10,
        quantity_received=None,
        quantity_rejected=0,
        quantity_quarantine=0,
        receipt_type="FISICA",
        source="NATIVE",
        created_at=now
    )
    db.add(grl)
    db.commit()

    return {
        "sku": sku,
        "warehouse": wh,
        "gr": gr,
        "grl": grl,
        "alloc_neb": alloc_neb,
        "alloc_mau": alloc_mau
    }


class TestFase3PropiedadNebulaeMau:

    def test_recepcion_con_asignacion_mixta_separa_balances(self, app_client, admin_token, db):
        """La confirmación de recepción asigna los balances por propietario a NEBULAE y MAU."""
        data = _setup_mixed_po_scenario(db)

        app_client.patch(
            f"/api/v1/compras/recepciones/{data['gr'].id}/lineas/{data['grl'].id}",
            json={"quantity_received": 10},
            headers=_auth(admin_token)
        )

        conf_resp = app_client.post(
            f"/api/v1/compras/recepciones/{data['gr'].id}/confirmar",
            json={"idempotency_key": f"own-key-{uuid.uuid4().hex}", "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )
        assert conf_resp.status_code == 200

        db.expire_all()

        # Stock físico total es 10
        lvl = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == data["sku"].id, InventoryLevel.warehouse_id == data["warehouse"].id)
        ).scalar_one()
        assert lvl.quantity == 10

        # Balance Nebulae es exactamente 6
        bal_neb = db.execute(
            select(InventoryOwnerBalance)
            .where(
                InventoryOwnerBalance.sku_id == data["sku"].id,
                InventoryOwnerBalance.warehouse_id == data["warehouse"].id,
                InventoryOwnerBalance.owner == "NEBULAE"
            )
        ).scalar_one()
        assert int(bal_neb.quantity) == 6

        # Balance Mau es exactamente 4
        bal_mau = db.execute(
            select(InventoryOwnerBalance)
            .where(
                InventoryOwnerBalance.sku_id == data["sku"].id,
                InventoryOwnerBalance.warehouse_id == data["warehouse"].id,
                InventoryOwnerBalance.owner == "MAU"
            )
        ).scalar_one()
        assert int(bal_mau.quantity) == 4

    def test_reserva_nebulae_no_puede_tomar_stock_de_mau(self, app_client, admin_token, db):
        """Nebulae no puede reservar 8 unidades habiendo solo 6 suyas, aunque haya 10 físicas."""
        data = _setup_mixed_po_scenario(db)
        app_client.patch(
            f"/api/v1/compras/recepciones/{data['gr'].id}/lineas/{data['grl'].id}",
            json={"quantity_received": 10},
            headers=_auth(admin_token)
        )
        app_client.post(
            f"/api/v1/compras/recepciones/{data['gr'].id}/confirmar",
            json={"idempotency_key": f"own-key-{uuid.uuid4().hex}", "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )

        # Intentar reservar 8 para Nebulae
        resp_neb = app_client.post(
            "/api/v1/inventory/reservas",
            json={
                "idempotency_key": f"rsv-neb-{uuid.uuid4().hex}",
                "sku_id": data["sku"].id,
                "warehouse_id": data["warehouse"].id,
                "quantity": 8,  # Falla porque Nebulae solo tiene 6
                "owner": "NEBULAE",
            },
            headers=_auth(admin_token)
        )
        assert resp_neb.status_code == 409
        assert "insuficiente para reserva del propietario NEBULAE" in resp_neb.text

    def test_reserva_mau_consume_solo_balance_mau(self, app_client, admin_token, db):
        """Mau puede reservar sus 4 unidades sin tocar el inventario de Nebulae."""
        data = _setup_mixed_po_scenario(db)
        app_client.patch(
            f"/api/v1/compras/recepciones/{data['gr'].id}/lineas/{data['grl'].id}",
            json={"quantity_received": 10},
            headers=_auth(admin_token)
        )
        app_client.post(
            f"/api/v1/compras/recepciones/{data['gr'].id}/confirmar",
            json={"idempotency_key": f"own-key-{uuid.uuid4().hex}", "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )

        resp_mau = app_client.post(
            "/api/v1/inventory/reservas",
            json={
                "idempotency_key": f"rsv-mau-{uuid.uuid4().hex}",
                "sku_id": data["sku"].id,
                "warehouse_id": data["warehouse"].id,
                "quantity": 4,
                "owner": "MAU",
            },
            headers=_auth(admin_token)
        )
        assert resp_mau.status_code == 201
        assert resp_mau.json()["data"]["owner"] == "MAU"

        # Intentar reservar 1 más para Mau debe fallar (ya reservó sus 4)
        resp_mau_over = app_client.post(
            "/api/v1/inventory/reservas",
            json={
                "idempotency_key": f"rsv-mau-over-{uuid.uuid4().hex}",
                "sku_id": data["sku"].id,
                "warehouse_id": data["warehouse"].id,
                "quantity": 1,
                "owner": "MAU",
            },
            headers=_auth(admin_token)
        )
        assert resp_mau_over.status_code == 409

    def test_resumen_stock_muestra_separacion_patrimonial(self, app_client, admin_token, db):
        """Endpoint /stock-summary expone balance_nebulae y balance_mau de forma explícita."""
        data = _setup_mixed_po_scenario(db)
        app_client.patch(
            f"/api/v1/compras/recepciones/{data['gr'].id}/lineas/{data['grl'].id}",
            json={"quantity_received": 10},
            headers=_auth(admin_token)
        )
        app_client.post(
            f"/api/v1/compras/recepciones/{data['gr'].id}/confirmar",
            json={"idempotency_key": f"own-key-{uuid.uuid4().hex}", "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )

        resp = app_client.get(
            f"/api/v1/inventory/stock-summary?warehouse_id={data['warehouse'].id}&sku_id={data['sku'].id}",
            headers=_auth(admin_token)
        )
        assert resp.status_code == 200
        items = resp.json()["data"]["items"]
        matched = [it for it in items if it["sku_id"] == data["sku"].id]
        assert len(matched) == 1
        it = matched[0]
        assert float(it["stock_fisico"]) == 10.0
        assert float(it["balance_nebulae"]) == 6.0
        assert float(it["balance_mau"]) == 4.0