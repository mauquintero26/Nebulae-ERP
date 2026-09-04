"""
test_fase1b_stock_actualizado_vs_estado.py — Cierre 4:
stock_actualizado != sinónimo de confirmada.

ENINV-1 con todo rechazado → confirmada (estado=COMPLETADA) pero stock=0.
PEC sigue con cantidad pendiente.
ENINV-2 recibe las unidades → PEC termina RECIBIDA sin duplicar.
"""
import uuid
import pytest
from sqlalchemy import text

from tests.conftest import TestSessionLocal


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_supplier_db(db):
    from app.models.erp_documents import Supplier
    s = Supplier(name=f"Sup-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(s); db.commit(); db.refresh(s)
    return s.id


def _create_warehouse_db(db):
    from app.models.inventory import Warehouse
    w = Warehouse(name=f"Wh-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(w); db.commit(); db.refresh(w)
    return w.id


def _create_sku_db(db):
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


def _create_pec_api(client, token, sup_id, wh_id, productos):
    r = client.post("/api/v1/compras/pedidos", headers=_auth(token),
                    json={"supplier_id": sup_id, "supplier_name": "TestSup",
                          "warehouse_id": wh_id, "productos": productos})
    assert r.status_code == 201, f"create_pec failed: {r.text}"
    return r.json()["data"]


def _create_eninv_api(client, token, pec_id, wh_id):
    r = client.post(f"/api/v1/compras/pedidos/{pec_id}/recepcionar",
                    headers=_auth(token),
                    json={"warehouse_id": wh_id, "created_by": "test"})
    assert r.status_code in (200, 201), f"create_eninv failed: {r.text}"
    return r.json()["data"]


def _registrar_grl_id(client, token, eninv_id, grl_id, **kwargs):
    r = client.patch(
        f"/api/v1/compras/recepciones/{eninv_id}/lineas/{grl_id}",
        headers=_auth(token), json=kwargs,
    )
    assert r.status_code == 200, f"PATCH linea failed: {r.text}"


def _confirmar(client, token, eninv_id, key=None):
    key = key or str(uuid.uuid4())
    r = client.post(
        f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
        headers=_auth(token),
        json={"idempotency_key": key, "receipt_type": "FISICA",
              "allow_excess": False, "user_name": "test"},
    )
    return r.status_code, r.json()


class TestStockActualizadoVsEstado:

    def test_recepcion_rechazada_aparece_como_confirmada_en_pec(
            self, app_client, admin_token):
        """
        ENINV-1 con todo rechazado → confirmada (COMPLETADA, stock_actualizado=False).
        PEC conserva cantidad pendiente → ENINV-2 puede completar.
        """
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        # Crear PEC con 5 unidades
        pec = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                              [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        pec_id = pec["id"]

        # ENINV-1: todo rechazado (0 recibidas, 5 rechazadas)
        eninv1 = _create_eninv_api(app_client, admin_token, pec_id, wh_id)
        eninv1_id = eninv1["id"]
        grl1_id = eninv1["productos"][0]["grl_id"]

        _registrar_grl_id(app_client, admin_token, eninv1_id, grl1_id,
                          quantity_received=0, quantity_rejected=5)

        status1, body1 = _confirmar(app_client, admin_token, eninv1_id)
        assert status1 == 200, f"ENINV-1 todo rechazado debe confirmar 200. Got {status1}: {body1}"

        # Verificar ENINV-1: COMPLETADA, stock_actualizado=False, stock=0
        with TestSessionLocal() as db2:
            gr1 = db2.execute(text(
                "SELECT estado, stock_actualizado FROM goods_receipts WHERE id=:gid"
            ), {"gid": eninv1_id}).fetchone()
            inv1 = db2.execute(text(
                "SELECT COALESCE(quantity, 0) FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar() or 0

        assert gr1[0] == "COMPLETADA", f"ENINV-1 debe ser COMPLETADA. Got {gr1[0]}"
        assert gr1[1] == False, f"stock_actualizado debe ser False. Got {gr1[1]}"
        assert float(inv1) == 0, f"Stock debe ser 0. Got {inv1}"

        # Verificar PEC: parcial (aún tiene unidades pendientes)
        r_pec = app_client.get(f"/api/v1/compras/pedidos/{pec_id}",
                               headers=_auth(admin_token))
        assert r_pec.status_code == 200
        pec_data = r_pec.json()["data"]
        pec_estado = pec_data.get("estado", pec_data.get("status", ""))
        assert pec_estado in ("PARCIALMENTE_RECIBIDA", "PENDIENTE", "PROCESANDO"), (
            f"PEC debe estar parcial/pendiente después de recepción rechazada. Got: {pec_estado}"
        )

        # ENINV-2: recibir las 5 unidades correctamente
        eninv2 = _create_eninv_api(app_client, admin_token, pec_id, wh_id)
        eninv2_id = eninv2["id"]
        prods2 = eninv2["productos"]
        assert len(prods2) >= 1, "ENINV-2 debe tener GRL pendientes"

        grl2_id = prods2[0]["grl_id"]
        qty2_esperada = prods2[0]["qty_esperada"]
        assert qty2_esperada > 0, (
            f"ENINV-2 debe tener qty_esperada > 0 (unidades aún pendientes). Got {qty2_esperada}"
        )

        _registrar_grl_id(app_client, admin_token, eninv2_id, grl2_id,
                          quantity_received=qty2_esperada)

        status2, body2 = _confirmar(app_client, admin_token, eninv2_id)
        assert status2 == 200, f"ENINV-2 debe confirmar 200. Got {status2}: {body2}"

        # Verificar stock = qty2_esperada (no duplica las rechazadas)
        with TestSessionLocal() as db3:
            inv2 = db3.execute(text(
                "SELECT COALESCE(quantity, 0) FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar() or 0
            pec_estado_final = db3.execute(text(
                "SELECT estado FROM purchase_orders_full WHERE id=:pid"
            ), {"pid": pec_id}).scalar()

        assert float(inv2) == float(qty2_esperada), (
            f"Stock final debe ser {qty2_esperada} (sin duplicar rechazadas). Got {inv2}"
        )
        assert pec_estado_final == "RECIBIDA", (
            f"PEC debe quedar RECIBIDA. Got {pec_estado_final}"
        )

    def test_stock_actualizado_false_no_bloquea_consulta_pec(self, app_client, admin_token):
        """Una ENINV confirmada con stock_actualizado=False no impide ver la PEC correctamente."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 3, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]
        grl_id = eninv["productos"][0]["grl_id"]

        # Registrar y confirmar con todo rechazado
        _registrar_grl_id(app_client, admin_token, eninv_id, grl_id,
                          quantity_received=0, quantity_rejected=3)
        status, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200

        # La PEC debe ser consultable y mostrar la recepción como confirmada
        r = app_client.get(f"/api/v1/compras/pedidos/{pec['id']}",
                           headers=_auth(admin_token))
        assert r.status_code == 200, f"GET PEC debe funcionar. Got {r.status_code}: {r.text}"
