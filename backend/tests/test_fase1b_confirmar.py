"""
test_fase1b_confirmar.py — Tests de confirmar_recepcion via endpoint HTTP

Usa la fixture app_client del conftest (scope=session) que tiene get_db
sobrescrito apuntando a erp_test.

NOTA: A partir de Bloqueo 1, GRL se crea con quantity_received=NULL.
Los tests deben registrar la cantidad via PATCH /lineas/{grl_id} antes de confirmar.

Escenarios:
 1. confirmar usa GoodsReceiptLine (no g.productos) como fuente de verdad
 2. JSON contradice GRL -> GRL gana
 3. Replay idempotente no duplica lineas
 4. Replay conserva IDs de GRL
 5. ENINV inexistente: rollback sin GRL huerfanas
 6. Recepcion parcial FISICA -> PEC PARCIALMENTE_RECIBIDA
 7. Recepcion LOGISTICA no actualiza stock
 8. Excedente permitido (allow_excess=True)
 9. Excedente no permitido (allow_excess=False)
10. Dos lineas PEC mismo SKU -> po_line_id distinto en cada GRL
11. SKU solo en JSON no genera InventoryMovement
-- Bloqueo 1: distincion semantica quantity_received --
12. qty_received=0 explicito para FISICA -> 422 (sin sku valido para stock)
13. Todas rechazadas: qty_received=0, qty_rejected=5
14. Todas en cuarentena: qty_received=0, qty_quarantine=5
15. Cantidad sin registrar (NULL) -> 422 en FISICA
16. Recepcion total explicita (qty_received=qty_expected) -> stock correcto
"""
import uuid
import json as _json
import pytest
from sqlalchemy import text

from tests.conftest import TestSessionLocal


# ─── Helpers inline ─────────────────────────────────────────────────────────────

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


def _create_pec_api(client, token, sup_id, wh_id, productos) -> dict:
    r = client.post("/api/v1/compras/pedidos", headers=_auth(token),
                    json={"supplier_id": sup_id, "supplier_name": "TestSup",
                          "warehouse_id": wh_id, "productos": productos})
    assert r.status_code == 201, f"create_pec failed: {r.text}"
    return r.json()["data"]


def _create_eninv_api(client, token, pec_id, wh_id) -> dict:
    r = client.post(f"/api/v1/compras/pedidos/{pec_id}/recepcionar",
                    headers=_auth(token),
                    json={"warehouse_id": wh_id, "created_by": "test"})
    assert r.status_code in (200, 201), f"create_eninv failed: {r.text}"
    return r.json()["data"]


def _registrar_cantidades(client, token, eninv_id, quantities: dict):
    """
    Registra cantidades en GRL. quantities = {grl_id: qty_received} o {0: qty} para la primera.
    Si quantities es un entero, lo aplica a la primera GRL.
    """
    with TestSessionLocal() as db:
        grls = db.execute(text(
            "SELECT id FROM goods_receipt_lines WHERE gr_id=:gid ORDER BY id"
        ), {"gid": eninv_id}).scalars().all()

    if isinstance(quantities, int):
        # Registrar misma cantidad a todas las GRL
        for grl_id in grls:
            client.patch(
                f"/api/v1/compras/recepciones/{eninv_id}/lineas/{grl_id}",
                headers=_auth(token),
                json={"quantity_received": quantities},
            )
    elif isinstance(quantities, dict):
        for idx_or_id, qty in quantities.items():
            if idx_or_id < len(grls):
                grl_id = grls[idx_or_id]
            else:
                grl_id = idx_or_id
            client.patch(
                f"/api/v1/compras/recepciones/{eninv_id}/lineas/{grl_id}",
                headers=_auth(token),
                json={"quantity_received": qty},
            )


def _registrar_grl(client, token, eninv_id, grl_idx, **kwargs):
    """Registra campos en la GRL en el indice dado."""
    with TestSessionLocal() as db:
        grl_id = db.execute(text(
            "SELECT id FROM goods_receipt_lines WHERE gr_id=:gid ORDER BY id LIMIT 1 OFFSET :off"
        ), {"gid": eninv_id, "off": grl_idx}).scalar()
    r = client.patch(
        f"/api/v1/compras/recepciones/{eninv_id}/lineas/{grl_id}",
        headers=_auth(token),
        json=kwargs,
    )
    assert r.status_code == 200, f"PATCH linea failed: {r.text}"
    return grl_id


def _confirmar(client, token, eninv_id, receipt_type="FISICA",
               allow_excess=False, key=None):
    if key is None:
        key = str(uuid.uuid4())
    r = client.post(
        f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
        headers=_auth(token),
        json={"idempotency_key": key, "receipt_type": receipt_type,
              "allow_excess": allow_excess, "user_name": "test"},
    )
    return r.status_code, r.json(), key


# ─── Tests ─────────────────────────────────────────────────────────────────────

class TestConfirmarUsaGoodsReceiptLines:

    def test_confirmar_crea_grl_y_usa_fuente_normalizada(
            self, app_client, admin_token):
        """GoodsReceiptLine como fuente de verdad al confirmar."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        # Registrar cantidad antes de confirmar (Bloqueo 1)
        _registrar_cantidades(app_client, admin_token, eninv_id, 5)

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, f"Expected 200: {body}"

        with TestSessionLocal() as db2:
            grl = db2.execute(text(
                "SELECT sku_id, quantity_expected, quantity_received, source "
                "FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).fetchone()

        assert grl is not None, "GRL debe existir"
        assert int(grl[0]) == sku_id
        assert int(grl[1]) == 5
        assert int(grl[2]) == 5
        assert grl[3] == "NATIVE"

    def test_grl_gana_cuando_json_contradice(
            self, app_client, admin_token):
        """GRL con qty_received=5 gana sobre JSON con qty_recibida=99."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        # Registrar 5u en GRL
        _registrar_cantidades(app_client, admin_token, eninv_id, 5)

        # Manipular JSON para que diga 99 (deberia ser ignorado)
        with TestSessionLocal() as db2:
            db2.execute(text(
                "UPDATE goods_receipts SET productos=CAST(:p AS jsonb) WHERE id=:gid"
            ), {"p": _json.dumps(
                [{"sku_id": sku_id, "qty_esperada": 5, "qty_recibida": 99,
                  "nombre": "Prod"}]
            ), "gid": eninv_id})
            db2.commit()

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, f"Expected 200: {body}"

        with TestSessionLocal() as db2:
            inv = db2.execute(text(
                "SELECT quantity FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar()

        assert int(inv) == 5, f"GRL gana: inventario debe ser 5. Got {inv}"

    def test_no_duplica_lineas_en_replay(self, app_client, admin_token):
        """Replay idempotente no crea GRL extra."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        _registrar_cantidades(app_client, admin_token, eninv_id, 5)

        key = str(uuid.uuid4())
        _confirmar(app_client, admin_token, eninv_id, key=key)

        with TestSessionLocal() as db2:
            cnt_before = db2.execute(text(
                "SELECT COUNT(*) FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).scalar()

        _confirmar(app_client, admin_token, eninv_id, key=key)  # replay

        with TestSessionLocal() as db2:
            cnt_after = db2.execute(text(
                "SELECT COUNT(*) FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).scalar()

        assert int(cnt_after) == int(cnt_before), (
            f"Replay no debe crear GRL extra. Antes={cnt_before}, Despues={cnt_after}"
        )

    def test_replay_conserva_ids_de_lineas(self, app_client, admin_token):
        """IDs de GRL identicos en el replay."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        _registrar_cantidades(app_client, admin_token, eninv_id, 5)

        key = str(uuid.uuid4())
        _confirmar(app_client, admin_token, eninv_id, key=key)

        with TestSessionLocal() as db2:
            ids_before = sorted(db2.execute(text(
                "SELECT id FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).scalars().all())

        _confirmar(app_client, admin_token, eninv_id, key=key)  # replay

        with TestSessionLocal() as db2:
            ids_after = sorted(db2.execute(text(
                "SELECT id FROM goods_receipt_lines WHERE gr_id=:gid"
            ), {"gid": eninv_id}).scalars().all())

        assert ids_before == ids_after, (
            f"IDs de GRL deben ser identicos. Antes={ids_before}, Despues={ids_after}"
        )

    def test_error_produce_rollback_completo(self, app_client, admin_token):
        """404 en ENINV inexistente no crea GRL ni movimientos."""
        status, body, _ = _confirmar(app_client, admin_token, 999999)
        assert status == 404, f"Expected 404: {body}"

        with TestSessionLocal() as db:
            n_grl = db.execute(text(
                "SELECT COUNT(*) FROM goods_receipt_lines WHERE gr_id=999999"
            )).scalar()
            n_mv = db.execute(text(
                "SELECT COUNT(*) FROM inventory_movements im "
                "JOIN inventory_operations io ON io.id=im.operation_id "
                "WHERE io.source_document_id=999999"
            )).scalar()

        assert int(n_grl) == 0
        assert int(n_mv) == 0

    def test_recepcion_parcial_fisica(self, app_client, admin_token):
        """qty_received=3/5 -> inventario=3, PEC PARCIALMENTE_RECIBIDA."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        # Registrar 3 de 5
        _registrar_cantidades(app_client, admin_token, eninv_id, 3)

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, f"Expected 200: {body}"

        with TestSessionLocal() as db2:
            inv = db2.execute(text(
                "SELECT quantity FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar()
            pec_est = db2.execute(text(
                "SELECT estado FROM purchase_orders_full WHERE id=:pid"
            ), {"pid": pec["id"]}).scalar()

        assert int(inv) == 3, f"Stock debe ser 3. Got {inv}"
        assert pec_est == "PARCIALMENTE_RECIBIDA", f"PEC debe ser PARCIALMENTE_RECIBIDA. Got {pec_est}"

    def test_recepcion_logistica_no_actualiza_stock(self, app_client, admin_token):
        """LOGISTICA: estado=COMPLETADA_LOGISTICA, stock_actualizado=False."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        # LOGISTICA no requiere cantidad (NULL se trata como 0 para LOGISTICA)
        status, body, _ = _confirmar(app_client, admin_token, eninv_id,
                                     receipt_type="LOGISTICA")
        assert status == 200, f"Expected 200 LOGISTICA: {body}"

        with TestSessionLocal() as db2:
            gr = db2.execute(text(
                "SELECT estado, stock_actualizado FROM goods_receipts WHERE id=:gid"
            ), {"gid": eninv_id}).fetchone()
            inv = db2.execute(text(
                "SELECT COALESCE(quantity, 0) FROM inventory_levels "
                "WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar() or 0

        assert gr[0] == "COMPLETADA_LOGISTICA"
        assert gr[1] == False
        assert float(inv) == 0

    def test_excedente_permitido(self, app_client, admin_token):
        """allow_excess=True acepta qty_received=7 > qty_expected=5."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        _registrar_cantidades(app_client, admin_token, eninv_id, 7)

        status, body, _ = _confirmar(app_client, admin_token, eninv_id,
                                     allow_excess=True)
        assert status == 200, f"Expected 200: {body}"

        with TestSessionLocal() as db2:
            inv = db2.execute(text(
                "SELECT quantity FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar()
        assert int(inv) == 7

    def test_excedente_no_permitido(self, app_client, admin_token):
        """allow_excess=False rechaza qty_received=8 > qty_expected=5 con 422."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        _registrar_cantidades(app_client, admin_token, eninv_id, 8)

        status, _, _ = _confirmar(app_client, admin_token, eninv_id,
                                  allow_excess=False)
        assert status == 422, f"Expected 422. Got {status}"

    def test_dos_lineas_mismo_sku_po_line_id_correcto(
            self, app_client, admin_token):
        """PEC con 2 lineas del mismo SKU -> po_line_id distinto en cada GRL."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec = _create_pec_api(app_client, admin_token, sup_id, wh_id, [
            {"sku_id": sku_id, "qty": 3, "nombre": "Linea A"},
            {"sku_id": sku_id, "qty": 2, "nombre": "Linea B"},
        ])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        with TestSessionLocal() as db2:
            grls = db2.execute(text(
                "SELECT id, po_line_id FROM goods_receipt_lines WHERE gr_id=:gid ORDER BY id"
            ), {"gid": eninv_id}).fetchall()

        assert len(grls) == 2, f"Deben existir 2 GRL. Got {grls}"
        assert grls[0][1] != grls[1][1], (
            f"po_line_id debe ser distinto: {grls[0][1]} vs {grls[1][1]}"
        )
        assert grls[0][1] is not None
        assert grls[1][1] is not None

    def test_solo_grl_genera_movimientos_no_json_legacy(
            self, app_client, admin_token):
        """SKU solo en JSON legacy no genera InventoryMovement."""
        db = TestSessionLocal()
        try:
            sup_id       = _create_supplier_db(db)
            wh_id        = _create_warehouse_db(db)
            sku_real     = _create_sku_db(db)
            sku_fantasma = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_real, "qty": 5, "nombre": "Real"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        with TestSessionLocal() as db2:
            existing = db2.execute(text(
                "SELECT productos FROM goods_receipts WHERE id=:gid"
            ), {"gid": eninv_id}).scalar()
            prods = _json.loads(existing) if isinstance(existing, str) else existing
            prods.append({"sku_id": sku_fantasma, "qty_esperada": 10,
                          "qty_recibida": 10, "nombre": "Fantasma"})
            db2.execute(text(
                "UPDATE goods_receipts SET productos=CAST(:p AS jsonb) WHERE id=:gid"
            ), {"p": _json.dumps(prods), "gid": eninv_id})
            db2.commit()

        # Registrar cantidad en la GRL real
        _registrar_cantidades(app_client, admin_token, eninv_id, 5)

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, f"Expected 200: {body}"

        with TestSessionLocal() as db2:
            n_mv_fantasma = db2.execute(text(
                "SELECT COUNT(*) FROM inventory_movements im "
                "JOIN inventory_operations io ON io.id=im.operation_id "
                "WHERE im.sku_id=:s AND io.source_document_id=:gid"
            ), {"s": sku_fantasma, "gid": eninv_id}).scalar()

        assert int(n_mv_fantasma) == 0, (
            f"SKU fantasma no debe generar movimientos. Got {n_mv_fantasma}"
        )

    # ─── Bloqueo 1: distincion semantica quantity_received ───────────────────

    def test_qty_received_cero_explicito_no_genera_stock(
            self, app_client, admin_token):
        """quantity_received=0 explicito para FISICA -> 200, stock=0, qty_faltante=5.

        Bloqueo 2: cero explícito es una recepción física válida (ninguna unidad
        llegó al inventario disponible). NO debe ser 422 — la recepción puede
        completarse con todo faltante. El stock_actualizado=False porque no
        hubo ingresos reales.
        """
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        # Registrar cero explícito (ninguna unidad llegó, ninguna rechazada)
        _registrar_grl(app_client, admin_token, eninv_id, 0, quantity_received=0)

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        # Bloqueo 2: qty=0 explícito es válido -> 200
        assert status == 200, (
            f"FISICA con qty_received=0 explicito debe confirmar con 200. Got {status}: {body}"
        )

        with TestSessionLocal() as db2:
            inv = db2.execute(text(
                "SELECT COALESCE(quantity, 0) FROM inventory_levels "
                "WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar() or 0
            gr = db2.execute(text(
                "SELECT estado, stock_actualizado FROM goods_receipts WHERE id=:gid"
            ), {"gid": eninv_id}).fetchone()

        assert float(inv) == 0, f"Stock debe ser 0 (nada llegó). Got {inv}"
        assert gr[0] == "COMPLETADA", f"Estado debe ser COMPLETADA. Got {gr[0]}"
        assert gr[1] == False, f"stock_actualizado=False (sin ingresos). Got {gr[1]}"

    def test_todas_unidades_rechazadas_grl_correcto(
            self, app_client, admin_token):
        """qty_received=0, qty_rejected=5 -> GRL correcto, 200 en confirmar FISICA.

        Bloqueo 2: todo rechazado es una recepción física válida. Debe confirmar
        con 200, sin ingresos de stock, con trazabilidad de las unidades rechazadas.
        """
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        grl_id = _registrar_grl(
            app_client, admin_token, eninv_id, 0,
            quantity_received=0, quantity_rejected=5,
        )

        with TestSessionLocal() as db2:
            row = db2.execute(text(
                "SELECT quantity_received, quantity_rejected FROM goods_receipt_lines WHERE id=:gid"
            ), {"gid": grl_id}).fetchone()

        assert int(row[0]) == 0
        assert int(row[1]) == 5

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        # Bloqueo 2: todo rechazado es válido -> 200, stock=0
        assert status == 200, f"Todos rechazados FISICA -> 200 (Bloqueo 2). Got {status}: {body}"

        with TestSessionLocal() as db2:
            inv = db2.execute(text(
                "SELECT COALESCE(quantity, 0) FROM inventory_levels "
                "WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar() or 0
            gr = db2.execute(text(
                "SELECT stock_actualizado FROM goods_receipts WHERE id=:gid"
            ), {"gid": eninv_id}).scalar()

        assert float(inv) == 0, f"Stock debe ser 0 (todo rechazado). Got {inv}"
        assert gr == False, f"stock_actualizado=False (no hubo ingresos). Got {gr}"

    def test_todas_en_cuarentena_grl_correcto(
            self, app_client, admin_token):
        """qty_received=0, qty_quarantine=5 -> GRL campos correctos."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        grl_id = _registrar_grl(
            app_client, admin_token, eninv_id, 0,
            quantity_received=0, quantity_quarantine=5,
        )

        with TestSessionLocal() as db2:
            row = db2.execute(text(
                "SELECT quantity_received, quantity_quarantine FROM goods_receipt_lines WHERE id=:gid"
            ), {"gid": grl_id}).fetchone()

        assert int(row[0]) == 0
        assert int(row[1]) == 5

    def test_cantidad_sin_registrar_rechaza_422(
            self, app_client, admin_token):
        """GRL con quantity_received=NULL -> 422 al confirmar FISICA."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        # NO registrar cantidad (dejar quantity_received=NULL)
        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 422, (
            f"NULL quantity_received en FISICA debe retornar 422. Got {status}: {body}"
        )

    def test_recepcion_total_explicita_stock_correcto(
            self, app_client, admin_token):
        """quantity_received=5 via endpoint -> stock=5, PEC RECIBIDA."""
        db = TestSessionLocal()
        try:
            sup_id = _create_supplier_db(db)
            wh_id  = _create_warehouse_db(db)
            sku_id = _create_sku_db(db)
        finally:
            db.close()

        pec   = _create_pec_api(app_client, admin_token, sup_id, wh_id,
                                [{"sku_id": sku_id, "qty": 5, "nombre": "Prod"}])
        eninv = _create_eninv_api(app_client, admin_token, pec["id"], wh_id)
        eninv_id = eninv["id"]

        _registrar_cantidades(app_client, admin_token, eninv_id, 5)

        status, body, _ = _confirmar(app_client, admin_token, eninv_id)
        assert status == 200, f"Expected 200: {body}"

        with TestSessionLocal() as db2:
            inv = db2.execute(text(
                "SELECT quantity FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"
            ), {"s": sku_id, "w": wh_id}).scalar()
            pec_est = db2.execute(text(
                "SELECT estado FROM purchase_orders_full WHERE id=:pid"
            ), {"pid": pec["id"]}).scalar()

        assert int(inv) == 5, f"Stock debe ser 5. Got {inv}"
        assert pec_est == "RECIBIDA", f"PEC debe ser RECIBIDA. Got {pec_est}"
