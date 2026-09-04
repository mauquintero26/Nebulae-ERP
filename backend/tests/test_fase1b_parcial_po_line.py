"""
test_fase1b_parcial_po_line.py — Bloqueo 3: recepciones parciales por po_line_id

Escenario completo:
  PEC con 2 lineas del mismo SKU (3u y 2u)
  Primera recepcion: 3u -> confirmar vinculado a primera POL
  Segunda recepcion: solo 2u pendientes (segunda POL)
  PEC = RECIBIDA, inventario = 5
"""
import uuid
import pytest
from sqlalchemy import text
from tests.conftest import TestSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_supplier_db(db) -> int:
    from app.models.erp_documents import Supplier
    s = Supplier(name=f"Sup-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(s); db.commit(); db.refresh(s)
    return s.id


def _create_warehouse_db(db) -> int:
    from app.models.inventory import Warehouse
    w = Warehouse(name=f"Wh-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(w); db.commit(); db.refresh(w)
    return w.id


def _create_sku_db(db) -> int:
    from app.models.catalog import ProductSKU, Product, Brand, Category
    br = Brand(name=f"Br-{uuid.uuid4().hex[:4]}")
    db.add(br); db.flush()
    ca = Category(name=f"Ca-{uuid.uuid4().hex[:4]}")
    db.add(ca); db.flush()
    pr = Product(
        name=f"Pr-{uuid.uuid4().hex[:4]}", brand_id=br.id,
        category_id=ca.id, type="Fisico", base_currency="USD",
        uom="Ud", is_active=True,
    )
    db.add(pr); db.flush()
    sk = ProductSKU(
        product_id=pr.id, sku=f"TST-{uuid.uuid4().hex[:8]}",
        cost_price=10.0, sale_price=20.0,
    )
    db.add(sk); db.commit(); db.refresh(sk)
    return sk.id


class TestParcialPorPoLineId:

    def test_dos_lineas_mismo_sku_recepcion_secuencial_correcta(
            self, app_client, admin_token):
        """
        PEC: [{sku=X, qty=3}, {sku=X, qty=2}]
        ENINV-1: 3u -> confirmar (solo la 1era POL)
        ENINV-2: 2u pendientes (la 2da POL)
        PEC=RECIBIDA, stock=5, trazabilidad correcta en ambas GRL.
        """
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        # Crear PEC con 2 lineas del mismo SKU
        r = app_client.post(
            "/api/v1/compras/pedidos",
            headers=_auth(admin_token),
            json={
                "supplier_id": sup_id, "supplier_name": "Sup",
                "warehouse_id": wh_id,
                "productos": [
                    {"sku_id": sku_id, "qty": 3, "nombre": "Linea A"},
                    {"sku_id": sku_id, "qty": 2, "nombre": "Linea B"},
                ],
            },
        )
        assert r.status_code == 201, f"create_pec failed: {r.text}"
        pec_id = r.json()["data"]["id"]

        # Verificar que se crearon 2 PurchaseOrderLine
        with TestSessionLocal() as db2:
            pols = db2.execute(text(
                "SELECT id, quantity_ordered FROM purchase_order_lines WHERE pec_id=:pid ORDER BY id"
            ), {"pid": pec_id}).fetchall()
        assert len(pols) == 2, f"Deben existir 2 POL. Got {pols}"
        pol1_id, pol2_id = pols[0][0], pols[1][0]
        assert int(pols[0][1]) == 3
        assert int(pols[1][1]) == 2

        # Primera recepcion
        r2 = app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/recepcionar",
            headers=_auth(admin_token),
            json={"warehouse_id": wh_id, "created_by": "test"},
        )
        assert r2.status_code in (200, 201), f"ENINV-1 creation failed: {r2.text}"
        eninv1_id = r2.json()["data"]["id"]

        # Verificar GRL de la primera recepcion
        with TestSessionLocal() as db2:
            grls1 = db2.execute(text(
                "SELECT id, po_line_id, quantity_expected FROM goods_receipt_lines "
                "WHERE gr_id=:gid ORDER BY id"
            ), {"gid": eninv1_id}).fetchall()

        assert len(grls1) == 2, f"ENINV-1 debe tener 2 GRL. Got {grls1}"
        # Verificar que po_line_id coincide correctamente
        po_ids_eninv1 = [r[1] for r in grls1]
        assert pol1_id in po_ids_eninv1, "primera POL debe estar en primera ENINV"
        assert pol2_id in po_ids_eninv1, "segunda POL debe estar en primera ENINV"

        # Registrar 3u en la GRL de la primera POL y 2u en la segunda
        grl1_pol1 = next(r for r in grls1 if r[1] == pol1_id)
        grl1_pol2 = next(r for r in grls1 if r[1] == pol2_id)

        app_client.patch(
            f"/api/v1/compras/recepciones/{eninv1_id}/lineas/{grl1_pol1[0]}",
            headers=_auth(admin_token),
            json={"quantity_received": 3},
        )
        app_client.patch(
            f"/api/v1/compras/recepciones/{eninv1_id}/lineas/{grl1_pol2[0]}",
            headers=_auth(admin_token),
            json={"quantity_received": 0},  # No llego la segunda linea aun
        )

        # Confirmar ENINV-1: 3u de la primera POL (la segunda tiene qty=0 -> no suma stock)
        key1 = str(uuid.uuid4())
        r3 = app_client.post(
            f"/api/v1/compras/recepciones/{eninv1_id}/confirmar",
            headers=_auth(admin_token),
            json={"idempotency_key": key1, "receipt_type": "FISICA",
                  "allow_excess": False, "user_name": "test"},
        )
        assert r3.status_code == 200, f"Confirmar ENINV-1 failed: {r3.text}"

        # Verificar PEC parcialmente recibida y stock=3
        with TestSessionLocal() as db2:
            pec_est = db2.execute(text(
                "SELECT estado FROM purchase_orders_full WHERE id=:pid"
            ), {"pid": pec_id}).scalar()
            stock = db2.execute(text(
                "SELECT quantity FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar()

        # Con qty_received=3 para pol1 y qty_received=0 para pol2:
        # pol1 pendiente=3-3=0, pol2 pendiente=2-0=2 -> parcialmente recibida
        assert pec_est == "PARCIALMENTE_RECIBIDA", f"PEC debe ser PARCIALMENTE_RECIBIDA. Got {pec_est}"
        assert int(stock) == 3, f"Stock debe ser 3 despues de ENINV-1. Got {stock}"

        # Segunda recepcion: solo debe tener la segunda POL con 2u pendientes
        r4 = app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/recepcionar",
            headers=_auth(admin_token),
            json={"warehouse_id": wh_id, "created_by": "test"},
        )
        assert r4.status_code in (200, 201), f"ENINV-2 creation failed: {r4.text}"
        eninv2_id = r4.json()["data"]["id"]

        with TestSessionLocal() as db2:
            grls2 = db2.execute(text(
                "SELECT id, po_line_id, quantity_expected FROM goods_receipt_lines "
                "WHERE gr_id=:gid ORDER BY id"
            ), {"gid": eninv2_id}).fetchall()

        assert len(grls2) == 1, f"ENINV-2 solo debe tener 1 GRL (la POL con saldo). Got {grls2}"
        assert grls2[0][1] == pol2_id, (
            f"GRL de ENINV-2 debe estar vinculada a pol2_id={pol2_id}. Got {grls2[0][1]}"
        )
        assert int(grls2[0][2]) == 2, f"quantity_expected=2. Got {grls2[0][2]}"

        # Registrar 2u en la GRL de ENINV-2
        app_client.patch(
            f"/api/v1/compras/recepciones/{eninv2_id}/lineas/{grls2[0][0]}",
            headers=_auth(admin_token),
            json={"quantity_received": 2},
        )

        # Confirmar ENINV-2
        key2 = str(uuid.uuid4())
        r5 = app_client.post(
            f"/api/v1/compras/recepciones/{eninv2_id}/confirmar",
            headers=_auth(admin_token),
            json={"idempotency_key": key2, "receipt_type": "FISICA",
                  "allow_excess": False, "user_name": "test"},
        )
        assert r5.status_code == 200, f"Confirmar ENINV-2 failed: {r5.text}"

        # Verificar PEC RECIBIDA y stock=5
        with TestSessionLocal() as db2:
            pec_final = db2.execute(text(
                "SELECT estado FROM purchase_orders_full WHERE id=:pid"
            ), {"pid": pec_id}).scalar()
            stock_final = db2.execute(text(
                "SELECT quantity FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar()
            # Trazabilidad: GRL de ENINV-1 con po_line_id=pol1
            grl_pol1 = db2.execute(text(
                "SELECT quantity_received FROM goods_receipt_lines WHERE po_line_id=:pid"
            ), {"pid": pol1_id}).scalar()
            grl_pol2 = db2.execute(text(
                "SELECT quantity_received FROM goods_receipt_lines "
                "WHERE po_line_id=:pid AND gr_id=:gid"
            ), {"pid": pol2_id, "gid": eninv2_id}).scalar()

        assert pec_final == "RECIBIDA", f"PEC debe ser RECIBIDA. Got {pec_final}"
        assert int(stock_final) == 5, f"Stock total debe ser 5. Got {stock_final}"
        assert int(grl_pol1) == 3, f"GRL pol1 debe tener quantity_received=3. Got {grl_pol1}"
        assert int(grl_pol2) == 2, f"GRL pol2 debe tener quantity_received=2. Got {grl_pol2}"
