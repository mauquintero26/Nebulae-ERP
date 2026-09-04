"""
test_fase2_asignaciones_mn.py — Tests de Asignaciones M:N de Compras (Fase 2 Endurecida).

Escenarios cubiertos:
1. Asignación CUSTOMER_ORDER exitosa con sale_order_line_id.
2. Coexistencia persistida de cliente + stock Nebulae + stock Mau en base de datos.
3. Sobreasignación mediante llamadas separadas (6 + 6 en orden de 10 falla 422).
4. Sobreasignación concurrente (dos hilos intentan sobreasignar simultáneamente).
5. Incoherencia de SKU entre línea de compra y línea de venta falla 422.
6. Pedido del cliente abastecido por dos PECs independientes (hasta el límite de la orden de venta).
7. Exceso sobre la cantidad requerida en la orden de venta falla 422.
8. Idempotencia del mismo payload (no duplica registros ni modifica estado incorrectamente).
9. Consulta inversa de abastecimiento: GET /api/v1/compras/ventas/{so_id}/abastecimiento.
10. Consulta de asignaciones por PEC: GET /api/v1/compras/pedidos/{pec_id}/asignaciones.
"""
import uuid
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
import pytest
from sqlalchemy import text

from tests.conftest import TestSessionLocal
from app.models.erp_documents import PurchaseOrderFull, SaleOrder, Supplier
from app.models.fase1b import PurchaseOrderLine, SaleOrderLineErp, ProcurementAllocation
from app.models.catalog import ProductSKU, Product, Brand, Category


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_supplier_db(db) -> int:
    s = Supplier(name=f"Sup-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s.id


def _create_sku_db(db) -> int:
    br = Brand(name=f"Br-{uuid.uuid4().hex[:6]}")
    db.add(br)
    ca = Category(name=f"Ca-{uuid.uuid4().hex[:6]}")
    db.add(ca)
    db.flush()
    pr = Product(
        name=f"Pr-{uuid.uuid4().hex[:6]}",
        brand_id=br.id,
        category_id=ca.id,
        type="Fisico",
        base_currency="USD",
        uom="Ud",
        is_active=True,
    )
    db.add(pr)
    db.flush()
    sk = ProductSKU(
        product_id=pr.id,
        sku=f"TST-{uuid.uuid4().hex[:8]}",
        cost_price=10.0,
        sale_price=20.0,
    )
    db.add(sk)
    db.commit()
    db.refresh(sk)
    return sk.id


def _create_pec_with_line(session, supplier_id, sku_id, qty=10.0):
    pec = PurchaseOrderFull(
        numero=f"PEC-MN-{uuid.uuid4().hex[:6]}",
        supplier_id=supplier_id,
        estado="CONFIRMADA",
        total_cop=500000,
        supplier_name="Proveedor Test",
    )
    session.add(pec)
    session.flush()

    line = PurchaseOrderLine(
        pec_id=pec.id,
        sku_id=sku_id,
        description="Item de prueba M:N",
        quantity_ordered=Decimal(str(qty)),
        quantity_received=Decimal("0"),
        unit_cost_usd=Decimal("12"),
    )
    session.add(line)
    session.commit()
    session.refresh(pec)
    session.refresh(line)
    return pec, line


def _create_so_with_line(session, sku_id, qty=6.0):
    so = SaleOrder(
        numero=f"PVEN-MN-{uuid.uuid4().hex[:6]}",
        customer_name="Cliente Corporativo M:N",
        estado="EN_PROCESO",
        total_cop=800000,
    )
    session.add(so)
    session.flush()

    line = SaleOrderLineErp(
        so_id=so.id,
        sku_id=sku_id,
        description="Línea de venta M:N",
        quantity=Decimal(str(qty)),
        unit_price_cop=Decimal("100000"),
    )
    session.add(line)
    session.commit()
    session.refresh(so)
    session.refresh(line)
    return so, line


class TestFase2AsignacionesMN:

    def test_asignacion_customer_order_exitosa(self, app_client, admin_token):
        """1. Asignar parte de una PEC a una orden de venta de cliente."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, po_line = _create_pec_with_line(session, sup_id, sku_id, qty=10.0)
            so, so_line = _create_so_with_line(session, sku_id, qty=6.0)

            pec_id = pec.id
            po_line_id = po_line.id
            so_line_id = so_line.id

        payload = {
            "allocations": [
                {
                    "po_line_id": po_line_id,
                    "allocation_type": "CUSTOMER_ORDER",
                    "sale_order_line_id": so_line_id,
                    "quantity_allocated": 6.0,
                }
            ]
        }
        res = app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
            json=payload,
        )
        assert res.status_code == 200, f"Error: {res.text}"
        data = res.json()
        assert data["status"] == "success"
        assert len(data["data"]) == 1
        assert data["data"][0]["allocation_type"] == "CUSTOMER_ORDER"
        assert data["data"][0]["quantity_allocated"] == 6.0

    def test_asignacion_mixta_cliente_nebulae_mau(self, app_client, admin_token):
        """2. Coexistencia persistida de cliente + stock Nebulae + stock Mau en base de datos."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, po_line = _create_pec_with_line(session, sup_id, sku_id, qty=10.0)
            so, so_line = _create_so_with_line(session, sku_id, qty=5.0)

            pec_id = pec.id
            po_line_id = po_line.id
            so_line_id = so_line.id

        payload = {
            "allocations": [
                {
                    "po_line_id": po_line_id,
                    "allocation_type": "CUSTOMER_ORDER",
                    "sale_order_line_id": so_line_id,
                    "quantity_allocated": 5.0,
                },
                {
                    "po_line_id": po_line_id,
                    "allocation_type": "NEBULAE_STOCK",
                    "quantity_allocated": 3.0,
                },
                {
                    "po_line_id": po_line_id,
                    "allocation_type": "MAU_STOCK",
                    "quantity_allocated": 2.0,
                },
            ]
        }
        res = app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
            json=payload,
        )
        assert res.status_code == 200, f"Error: {res.text}"
        assert len(res.json()["data"]) == 3

        # Comprobar directamente las filas en la base de datos
        with TestSessionLocal() as session:
            db_allocs = (
                session.query(ProcurementAllocation)
                .filter(ProcurementAllocation.po_line_id == po_line_id)
                .all()
            )
            assert len(db_allocs) == 3, f"Se esperaban 3 filas persistidas, encontradas {len(db_allocs)}"
            types_found = {a.allocation_type: float(a.quantity_allocated) for a in db_allocs}
            assert types_found.get("CUSTOMER_ORDER") == 5.0
            assert types_found.get("NEBULAE_STOCK") == 3.0
            assert types_found.get("MAU_STOCK") == 2.0
            assert sum(types_found.values()) == 10.0

    def test_sobreasignacion_mediante_llamadas_separadas_falla_422(self, app_client, admin_token):
        """3. Primera llamada asigna 6 de 10; segunda llamada intenta asignar 6 más (total 12) -> Falla 422."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, po_line = _create_pec_with_line(session, sup_id, sku_id, qty=10.0)

            pec_id = pec.id
            po_line_id = po_line.id

        # Primera llamada: 6 a Nebulae Stock
        payload_1 = {
            "allocations": [
                {
                    "po_line_id": po_line_id,
                    "allocation_type": "NEBULAE_STOCK",
                    "quantity_allocated": 6.0,
                }
            ]
        }
        res1 = app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
            json=payload_1,
        )
        assert res1.status_code == 200

        # Segunda llamada: 6 a Mau Stock (sin mencionar Nebulae Stock)
        payload_2 = {
            "allocations": [
                {
                    "po_line_id": po_line_id,
                    "allocation_type": "MAU_STOCK",
                    "quantity_allocated": 6.0,
                }
            ]
        }
        res2 = app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
            json=payload_2,
        )
        assert res2.status_code == 422
        assert "supera la cantidad ordenada" in res2.text

    def test_customer_order_sin_sale_order_line_id_falla_422(self, app_client, admin_token):
        """4. CUSTOMER_ORDER requiere obligatoriamente sale_order_line_id."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, po_line = _create_pec_with_line(session, sup_id, sku_id, qty=5.0)

            pec_id = pec.id
            po_line_id = po_line.id

        payload = {
            "allocations": [
                {
                    "po_line_id": po_line_id,
                    "allocation_type": "CUSTOMER_ORDER",
                    "sale_order_line_id": None,
                    "quantity_allocated": 2.0,
                }
            ]
        }
        res = app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
            json=payload,
        )
        assert res.status_code == 422
        assert "sale_order_line_id obligatorio" in res.text

    def test_sku_diferente_entre_compra_y_venta_falla_422(self, app_client, admin_token):
        """5. Falla con 422 si el SKU de la orden de compra no coincide con el SKU de la orden de venta."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_compra = _create_sku_db(session)
            sku_venta = _create_sku_db(session)
            pec, po_line = _create_pec_with_line(session, sup_id, sku_compra, qty=5.0)
            so, so_line = _create_so_with_line(session, sku_venta, qty=5.0)

            pec_id = pec.id
            po_line_id = po_line.id
            so_line_id = so_line.id

        payload = {
            "allocations": [
                {
                    "po_line_id": po_line_id,
                    "allocation_type": "CUSTOMER_ORDER",
                    "sale_order_line_id": so_line_id,
                    "quantity_allocated": 3.0,
                }
            ]
        }
        res = app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
            json=payload,
        )
        assert res.status_code == 422
        assert "Incoherencia de producto" in res.text

    def test_pedido_cliente_abastecido_por_dos_pec(self, app_client, admin_token):
        """6. Una orden de venta puede ser abastecida por dos PECs independientes hasta su límite."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec1, po_line1 = _create_pec_with_line(session, sup_id, sku_id, qty=10.0)
            pec2, po_line2 = _create_pec_with_line(session, sup_id, sku_id, qty=10.0)
            so, so_line = _create_so_with_line(session, sku_id, qty=10.0)

            pec1_id, po1_id = pec1.id, po_line1.id
            pec2_id, po2_id = pec2.id, po_line2.id
            so_line_id = so_line.id

        # Asignar 6 desde PEC 1
        res1 = app_client.post(
            f"/api/v1/compras/pedidos/{pec1_id}/asignaciones",
            headers=_auth(admin_token),
            json={"allocations": [{"po_line_id": po1_id, "allocation_type": "CUSTOMER_ORDER", "sale_order_line_id": so_line_id, "quantity_allocated": 6.0}]},
        )
        assert res1.status_code == 200

        # Asignar 4 desde PEC 2 (Total abastecido = 10.0, igual a lo pedido)
        res2 = app_client.post(
            f"/api/v1/compras/pedidos/{pec2_id}/asignaciones",
            headers=_auth(admin_token),
            json={"allocations": [{"po_line_id": po2_id, "allocation_type": "CUSTOMER_ORDER", "sale_order_line_id": so_line_id, "quantity_allocated": 4.0}]},
        )
        assert res2.status_code == 200

        # Intentar asignar 1 más desde PEC 1 (superaría los 10 requeridos en la orden de venta)
        res3 = app_client.post(
            f"/api/v1/compras/pedidos/{pec1_id}/asignaciones",
            headers=_auth(admin_token),
            json={"allocations": [{"po_line_id": po1_id, "allocation_type": "CUSTOMER_ORDER", "sale_order_line_id": so_line_id, "quantity_allocated": 7.0}]},
        )
        assert res3.status_code == 422
        assert "supera la cantidad requerida por el cliente" in res3.text

    def test_idempotencia_mismo_payload(self, app_client, admin_token):
        """7. Enviar exactamente el mismo payload repetidamente no duplica filas en BD."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, po_line = _create_pec_with_line(session, sup_id, sku_id, qty=10.0)

            pec_id = pec.id
            po_line_id = po_line.id

        payload = {
            "allocations": [
                {
                    "po_line_id": po_line_id,
                    "allocation_type": "NEBULAE_STOCK",
                    "quantity_allocated": 4.0,
                },
                {
                    "po_line_id": po_line_id,
                    "allocation_type": "MAU_STOCK",
                    "quantity_allocated": 3.0,
                },
            ]
        }

        # Ejecución 1
        res1 = app_client.post(f"/api/v1/compras/pedidos/{pec_id}/asignaciones", headers=_auth(admin_token), json=payload)
        assert res1.status_code == 200

        # Ejecución 2 idéntica
        res2 = app_client.post(f"/api/v1/compras/pedidos/{pec_id}/asignaciones", headers=_auth(admin_token), json=payload)
        assert res2.status_code == 200

        with TestSessionLocal() as session:
            allocs = session.query(ProcurementAllocation).filter(ProcurementAllocation.po_line_id == po_line_id).all()
            assert len(allocs) == 2, f"Se esperaban 2 filas, encontradas {len(allocs)}"
            total = sum(float(a.quantity_allocated) for a in allocs)
            assert total == 7.0

    def test_consulta_inversa_abastecimiento_ventas(self, app_client, admin_token):
        """8. GET /ventas/{so_id}/abastecimiento devuelve las compras asociadas."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, po_line = _create_pec_with_line(session, sup_id, sku_id, qty=8.0)
            so, so_line = _create_so_with_line(session, sku_id, qty=8.0)

            pec_id = pec.id
            po_line_id = po_line.id
            so_id = so.id
            so_line_id = so_line.id

        # Asignar po_line a so_line
        app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
            json={"allocations": [{"po_line_id": po_line_id, "allocation_type": "CUSTOMER_ORDER", "sale_order_line_id": so_line_id, "quantity_allocated": 8.0}]},
        )

        res = app_client.get(
            f"/api/v1/compras/ventas/{so_id}/abastecimiento",
            headers=_auth(admin_token),
        )
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["so_id"] == so_id
        assert len(data["ordenes_de_compra"]) == 1
        assert data["ordenes_de_compra"][0]["pec_id"] == pec_id
        assert data["ordenes_de_compra"][0]["items_asignados"][0]["quantity_allocated"] == 8.0

    def test_listar_asignaciones_de_pec(self, app_client, admin_token):
        """9. GET /pedidos/{pec_id}/asignaciones lista todas las asignaciones."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, po_line = _create_pec_with_line(session, sup_id, sku_id, qty=7.0)

            pec_id = pec.id
            po_line_id = po_line.id

        app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
            json={"allocations": [{"po_line_id": po_line_id, "allocation_type": "NEBULAE_STOCK", "quantity_allocated": 5.0}]},
        )

        res = app_client.get(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
        )
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["pec_id"] == pec_id
        assert len(data["asignaciones"]) == 1
        assert data["asignaciones"][0]["allocation_type"] == "NEBULAE_STOCK"
        assert data["asignaciones"][0]["quantity_allocated"] == 5.0

    def test_sobreasignacion_concurrente_bloqueada(self, app_client, admin_token):
        """10. Concurrencia: dos solicitudes simultáneas intentan asignar 6 sobre 10 ordenados. Al menos una debe fallar."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, po_line = _create_pec_with_line(session, sup_id, sku_id, qty=10.0)

            pec_id = pec.id
            po_line_id = po_line.id

        payload_a = {
            "allocations": [{"po_line_id": po_line_id, "allocation_type": "NEBULAE_STOCK", "quantity_allocated": 6.0}]
        }
        payload_b = {
            "allocations": [{"po_line_id": po_line_id, "allocation_type": "MAU_STOCK", "quantity_allocated": 6.0}]
        }

        def make_request(p):
            return app_client.post(
                f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
                headers=_auth(admin_token),
                json=p,
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            fut_a = executor.submit(make_request, payload_a)
            fut_b = executor.submit(make_request, payload_b)
            res_a = fut_a.result()
            res_b = fut_b.result()

        # Una debe tener éxito y la otra fallar con 422 por sobreasignación (6 + 6 > 10)
        statuses = sorted([res_a.status_code, res_b.status_code])
        assert statuses == [200, 422], f"Se esperaba exactamente un 200 y un 422, se obtuvo: {statuses}"

        # Verificar en base de datos que la cantidad total nunca excedió 10
        with TestSessionLocal() as session:
            allocs = session.query(ProcurementAllocation).filter(ProcurementAllocation.po_line_id == po_line_id).all()
            total_persisted = sum(float(a.quantity_allocated) for a in allocs)
            assert total_persisted <= 10.0, f"Invariante violada en BD: total asignado={total_persisted} > 10.0"
