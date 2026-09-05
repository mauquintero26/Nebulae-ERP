"""
test_fase3_cuarentena_diferencias.py — Aislamiento de Cuarentena y Resolución de Averías (Fase 3).

Escenarios cubiertos:
1. Segregación estricta en recepción:
   - Recepción de 10 unidades: 6 conformes y 4 averiadas (quantity_quarantine=4).
   - El stock vendible (InventoryLevel) incrementa ÚNICAMENTE en 6.
   - Se crea registro en inventory_quarantine con quantity=4, status='ACTIVO' y motivo registrado.
   - Kárdex registra movimiento con direction='QUARANTINE' por 4 unidades.
2. Consulta de ítems en cuarentena:
   - Endpoint GET /api/v1/inventory/cuarentena lista y filtra correctamente por bodega y estado.
3. Resolución mediante LIBERAR:
   - Endpoint POST /api/v1/inventory/cuarentena/{id}/resolver con action='LIBERAR'.
   - El registro pasa a status='LIBERADO'.
   - El stock vendible (InventoryLevel) incrementa en 4 (alcanzando 10).
   - Kárdex registra movimiento 'IN' de liberación.
4. Resolución mediante DEVUELTO_PROVEEDOR:
   - Ítem de cuarentena pasa a status='DEVUELTO_PROVEEDOR'.
   - El stock vendible permanece inalterado.
5. Resolución mediante DESTRUIDO:
   - Ítem de cuarentena pasa a status='DESTRUIDO'.
   - El stock vendible permanece inalterado.
6. Rechazo de resolución redundante (409 Conflict):
   - Intentar resolver un ítem ya resuelto falla con HTTP 409.
7. Rechazo de acción inválida (422 Unprocessable Entity):
   - Acción desconocida retorna HTTP 422.
"""
import uuid
import datetime
from decimal import Decimal
import pytest
from sqlalchemy import select

from app.models.erp_documents import PurchaseOrderFull, GoodsReceipt, Supplier
from app.models.catalog import Product, ProductSKU, Brand, Category
from app.models.inventory import Warehouse, InventoryLevel, InventoryMovement
from app.models.fase1b import PurchaseOrderLine, GoodsReceiptLine
from app.models.fase3 import InventoryQuarantine


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_cuarentena_scenario(db, qty_ordered=10):
    now = datetime.datetime.utcnow()
    sup = Supplier(name=f"Sup-Q-{uuid.uuid4().hex[:6]}", country="Colombia", is_active=True)
    db.add(sup)

    br = Brand(name=f"Br-Q-{uuid.uuid4().hex[:6]}")
    db.add(br)
    ca = Category(name=f"Ca-Q-{uuid.uuid4().hex[:6]}")
    db.add(ca)
    db.flush()

    prod = Product(name=f"Prod-Q-{uuid.uuid4().hex[:6]}", brand_id=br.id, category_id=ca.id, type="Fisico", base_currency="USD", uom="Ud")
    db.add(prod)
    db.flush()

    sku = ProductSKU(product_id=prod.id, sku=f"SKU-Q-{uuid.uuid4().hex[:6].upper()}", cost_price=30.0, sale_price=60.0)
    db.add(sku)

    wh = Warehouse(name=f"Bodega-Q-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(wh)
    db.flush()

    lvl = InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=0)
    db.add(lvl)

    pec = PurchaseOrderFull(
        numero=f"PEC-Q-{uuid.uuid4().hex[:8].upper()}",
        supplier_id=sup.id,
        supplier_name=sup.name,
        warehouse_id=wh.id,
        estado="EMITIDO",
        fecha_compra=now,
        fecha_entrega_estimada=now + datetime.timedelta(days=7),
        productos=[{"sku_id": sku.id, "sku": sku.sku, "nombre": prod.name, "qty": qty_ordered, "precio_usd": 30.0}]
    )
    db.add(pec)
    db.flush()

    pol = PurchaseOrderLine(
        pec_id=pec.id,
        sku_id=sku.id,
        description=prod.name,
        quantity_ordered=Decimal(str(qty_ordered)),
        quantity_received=Decimal("0"),
        unit_cost_usd=Decimal("30.0"),
        created_at=now
    )
    db.add(pol)

    gr = GoodsReceipt(
        numero=f"ENINV-Q-{uuid.uuid4().hex[:8].upper()}",
        pec_id=pec.id,
        pec_numero=pec.numero,
        supplier_id=sup.id,
        supplier_name=sup.name,
        warehouse_id=wh.id,
        warehouse_name=wh.name,
        estado="BORRADOR",
        stock_actualizado=False,
        receipt_type="FISICA",
        productos=[{"sku_id": sku.id, "sku": sku.sku, "nombre": prod.name, "qty_esperada": qty_ordered}],
        created_at=now
    )
    db.add(gr)
    db.flush()

    grl = GoodsReceiptLine(
        gr_id=gr.id,
        po_line_id=pol.id,
        sku_id=sku.id,
        description=prod.name,
        quantity_expected=qty_ordered,
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
        "supplier": sup,
        "product": prod,
        "sku": sku,
        "warehouse": wh,
        "pec": pec,
        "pol": pol,
        "gr": gr,
        "grl": grl,
        "inventory_level": lvl,
    }


class TestFase3CuarentenaDiferencias:

    def test_mercancia_defectuosa_no_entra_a_stock_vendible(self, app_client, admin_token, db):
        """Unidades averiadas se aíslan en inventory_quarantine y no ingresan a InventoryLevel."""
        sc = _setup_cuarentena_scenario(db, qty_ordered=10)

        # Registrar 6 conformes y 4 en cuarentena por avería
        patch_res = app_client.patch(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/lineas/{sc['grl'].id}",
            json={
                "quantity_received": 6,
                "quantity_quarantine": 4,
                "quantity_rejected": 0,
                "notes": "4 unidades llegaron con empaque roto y líquido derramado"
            },
            headers=_auth(admin_token)
        )
        assert patch_res.status_code == 200

        # Confirmar recepción física
        key = f"cuar-test-{uuid.uuid4().hex}"
        conf_res = app_client.post(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )
        assert conf_res.status_code == 200

        db.expire_all()

        # 1. Stock vendible es exactamente 6 (las 4 averiadas no están)
        lvl = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == sc["sku"].id, InventoryLevel.warehouse_id == sc["warehouse"].id)
        ).scalar_one()
        assert lvl.quantity == 6

        # 2. Registro de cuarentena activo
        q_item = db.execute(
            select(InventoryQuarantine)
            .where(InventoryQuarantine.sku_id == sc["sku"].id, InventoryQuarantine.warehouse_id == sc["warehouse"].id)
        ).scalar_one()
        assert int(q_item.quantity) == 4
        assert q_item.status == "ACTIVO"
        assert q_item.gr_line_id == sc["grl"].id

        # 3. Movimientos de Kárdex: uno IN de 6 y otro QUARANTINE de 4
        mv_in = db.execute(
            select(InventoryMovement)
            .where(InventoryMovement.sku_id == sc["sku"].id, InventoryMovement.direction == "IN")
        ).scalar_one()
        assert mv_in.quantity == 6

        mv_quar = db.execute(
            select(InventoryMovement)
            .where(InventoryMovement.sku_id == sc["sku"].id, InventoryMovement.direction == "QUARANTINE")
        ).scalar_one()
        assert mv_quar.quantity == 4

    def test_lista_cuarentena_filtrada_por_bodega_y_estado(self, app_client, admin_token, db):
        """Consulta del listado de cuarentena expone los datos con filtros."""
        sc = _setup_cuarentena_scenario(db, qty_ordered=10)
        app_client.patch(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/lineas/{sc['grl'].id}",
            json={"quantity_received": 5, "quantity_quarantine": 5},
            headers=_auth(admin_token)
        )
        app_client.post(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/confirmar",
            json={"idempotency_key": f"q-list-{uuid.uuid4().hex}", "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )

        resp = app_client.get(
            f"/api/v1/inventory/cuarentena?warehouse_id={sc['warehouse'].id}&status=ACTIVO",
            headers=_auth(admin_token)
        )
        assert resp.status_code == 200
        items = resp.json()["data"]
        assert len(items) >= 1
        matched = [it for it in items if it["sku_id"] == sc["sku"].id]
        assert len(matched) == 1
        assert Decimal(str(matched[0]["quantity"])) == Decimal("5.00")
        assert matched[0]["status"] == "ACTIVO"

    def test_resolucion_cuarentena_liberar_ingresa_a_stock(self, app_client, admin_token, db):
        """Liberar un lote de cuarentena incrementa el stock vendible y genera Kárdex IN."""
        sc = _setup_cuarentena_scenario(db, qty_ordered=10)
        app_client.patch(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/lineas/{sc['grl'].id}",
            json={"quantity_received": 6, "quantity_quarantine": 4},
            headers=_auth(admin_token)
        )
        app_client.post(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/confirmar",
            json={"idempotency_key": f"q-rel-{uuid.uuid4().hex}", "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )

        db.expire_all()
        q_item = db.execute(
            select(InventoryQuarantine).where(InventoryQuarantine.sku_id == sc["sku"].id)
        ).scalar_one()

        # Resolver con LIBERAR
        resolve_resp = app_client.post(
            f"/api/v1/inventory/cuarentena/{q_item.id}/resolver",
            json={"idempotency_key": f"q-res-{uuid.uuid4().hex}", "action": "LIBERAR", "notes": "Reinspección técnica superada, producto en óptimas condiciones"},
            headers=_auth(admin_token)
        )
        assert resolve_resp.status_code == 200
        assert resolve_resp.json()["data"]["status"] == "LIBERADO"

        db.expire_all()
        db.refresh(q_item)
        assert q_item.status == "LIBERADO"
        assert q_item.resolved_at is not None

        # Stock vendible ahora es 10 (6 iniciales + 4 liberados)
        lvl = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == sc["sku"].id, InventoryLevel.warehouse_id == sc["warehouse"].id)
        ).scalar_one()
        assert lvl.quantity == 10

        # Kárdex registra la liberación
        mvs_in = db.execute(
            select(InventoryMovement)
            .where(InventoryMovement.sku_id == sc["sku"].id, InventoryMovement.direction == "IN")
        ).scalars().all()
        assert len(mvs_in) == 2  # 1 de recepción original (6) + 1 de liberación (4)

    def test_resolucion_cuarentena_devuelto_proveedor_no_incrementa_stock(self, app_client, admin_token, db):
        """Devolver a proveedor marca el registro como DEVUELTO_PROVEEDOR sin alterar stock."""
        sc = _setup_cuarentena_scenario(db, qty_ordered=5)
        app_client.patch(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/lineas/{sc['grl'].id}",
            json={"quantity_received": 2, "quantity_quarantine": 3},
            headers=_auth(admin_token)
        )
        app_client.post(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/confirmar",
            json={"idempotency_key": f"q-dev-{uuid.uuid4().hex}", "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )

        db.expire_all()
        q_item = db.execute(
            select(InventoryQuarantine).where(InventoryQuarantine.sku_id == sc["sku"].id)
        ).scalar_one()

        resolve_resp = app_client.post(
            f"/api/v1/inventory/cuarentena/{q_item.id}/resolver",
            json={"idempotency_key": f"q-dev-{uuid.uuid4().hex}", "action": "DEVUELTO_PROVEEDOR", "notes": "RMA #9872 despachado a proveedor"},
            headers=_auth(admin_token)
        )
        assert resolve_resp.status_code == 200
        assert resolve_resp.json()["data"]["status"] == "DEVUELTO_PROVEEDOR"

        # Stock vendible sigue siendo 2
        lvl = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == sc["sku"].id, InventoryLevel.warehouse_id == sc["warehouse"].id)
        ).scalar_one()
        assert lvl.quantity == 2

    def test_resolucion_cuarentena_destruido_no_incrementa_stock(self, app_client, admin_token, db):
        """Destruir o dar de baja marca el registro como DESTRUIDO sin alterar stock."""
        sc = _setup_cuarentena_scenario(db, qty_ordered=5)
        app_client.patch(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/lineas/{sc['grl'].id}",
            json={"quantity_received": 3, "quantity_quarantine": 2},
            headers=_auth(admin_token)
        )
        app_client.post(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/confirmar",
            json={"idempotency_key": f"q-des-{uuid.uuid4().hex}", "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )

        db.expire_all()
        q_item = db.execute(
            select(InventoryQuarantine).where(InventoryQuarantine.sku_id == sc["sku"].id)
        ).scalar_one()

        resolve_resp = app_client.post(
            f"/api/v1/inventory/cuarentena/{q_item.id}/resolver",
            json={"idempotency_key": f"q-des-{uuid.uuid4().hex}", "action": "DESTRUIDO", "notes": "Acta de baja y destrucción por merma total"},
            headers=_auth(admin_token)
        )
        assert resolve_resp.status_code == 200
        assert resolve_resp.json()["data"]["status"] == "DESTRUIDO"

        lvl = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == sc["sku"].id, InventoryLevel.warehouse_id == sc["warehouse"].id)
        ).scalar_one()
        assert lvl.quantity == 3

    def test_resolucion_cuarentena_ya_resuelta_falla_409(self, app_client, admin_token, db):
        """Intentar resolver nuevamente un ítem ya resuelto falla con 409 Conflict."""
        sc = _setup_cuarentena_scenario(db, qty_ordered=5)
        app_client.patch(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/lineas/{sc['grl'].id}",
            json={"quantity_received": 3, "quantity_quarantine": 2},
            headers=_auth(admin_token)
        )
        app_client.post(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/confirmar",
            json={"idempotency_key": f"q-cnf-{uuid.uuid4().hex}", "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )

        db.expire_all()
        q_item = db.execute(
            select(InventoryQuarantine).where(InventoryQuarantine.sku_id == sc["sku"].id)
        ).scalar_one()

        # Primera resolución
        app_client.post(
            f"/api/v1/inventory/cuarentena/{q_item.id}/resolver",
            json={"idempotency_key": f"q-res1-{uuid.uuid4().hex}", "action": "LIBERAR"},
            headers=_auth(admin_token)
        )

        # Segunda resolución redundante con clave distinta (409)
        resp2 = app_client.post(
            f"/api/v1/inventory/cuarentena/{q_item.id}/resolver",
            json={"idempotency_key": f"q-res2-{uuid.uuid4().hex}", "action": "LIBERAR"},
            headers=_auth(admin_token)
        )
        assert resp2.status_code == 409

    def test_resolucion_cuarentena_accion_invalida_falla_422(self, app_client, admin_token, db):
        """Acción no soportada retorna 422."""
        sc = _setup_cuarentena_scenario(db, qty_ordered=5)
        app_client.patch(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/lineas/{sc['grl'].id}",
            json={"quantity_received": 3, "quantity_quarantine": 2},
            headers=_auth(admin_token)
        )
        app_client.post(
            f"/api/v1/compras/recepciones/{sc['gr'].id}/confirmar",
            json={"idempotency_key": f"q-inv-{uuid.uuid4().hex}", "receipt_type": "FISICA"},
            headers=_auth(admin_token)
        )

        db.expire_all()
        q_item = db.execute(
            select(InventoryQuarantine).where(InventoryQuarantine.sku_id == sc["sku"].id)
        ).scalar_one()

        resp = app_client.post(
            f"/api/v1/inventory/cuarentena/{q_item.id}/resolver",
            json={"idempotency_key": f"q-inv-{uuid.uuid4().hex}", "action": "REGALAR_A_CLIENTE"},
            headers=_auth(admin_token)
        )
        assert resp.status_code == 422