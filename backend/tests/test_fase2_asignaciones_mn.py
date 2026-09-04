"""
test_fase2_asignaciones_mn.py — Tests de Asignaciones M:N de Compras (Fase 2)

Escenarios cubiertos:
1. Asignación total de una línea de compra a una línea de venta de cliente (CUSTOMER_ORDER).
2. Asignación mixta de una línea: CUSTOMER_ORDER + NEBULAE_STOCK + MAU_STOCK.
3. Validación de sobre-asignación: suma de asignaciones > quantity_ordered lanza 422.
4. Validación de tipo: CUSTOMER_ORDER sin sale_order_line_id lanza 422.
5. Reemplazo / actualización idempotente de asignaciones existentes.
6. Consulta inversa de abastecimiento: GET /api/v1/compras/ventas/{so_id}/abastecimiento.
7. Consulta de asignaciones por PEC: GET /api/v1/compras/pedidos/{pec_id}/asignaciones.
"""
import uuid
from decimal import Decimal
import pytest
from sqlalchemy import text

from tests.conftest import TestSessionLocal
from app.models.erp_documents import PurchaseOrderFull, SaleOrder, Supplier
from app.models.fase1b import PurchaseOrderLine, SaleOrderLineErp, ProcurementAllocation
from app.models.catalog import ProductSKU, Product, Brand, Category


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_supplier_db(db) -> int:
    s = Supplier(name=f"Sup-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s.id


def _create_sku_db(db) -> int:
    br = Brand(name=f"Br-{uuid.uuid4().hex[:4]}")
    db.add(br)
    ca = Category(name=f"Ca-{uuid.uuid4().hex[:4]}")
    db.add(ca)
    db.flush()
    pr = Product(
        name=f"Pr-{uuid.uuid4().hex[:4]}",
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


def _create_pec_with_line(db, sup_id: int, sku_id: int, qty: float = 10.0) -> tuple:
    pec = PurchaseOrderFull(
        numero=f"PEC-TEST-{uuid.uuid4().hex[:6].upper()}",
        supplier_id=sup_id,
        supplier_name="Test Supplier",
        estado="BORRADOR",
        total_cop=100000.0,
    )
    db.add(pec)
    db.flush()

    line = PurchaseOrderLine(
        pec_id=pec.id,
        sku_id=sku_id,
        description="Producto Test Asignacion",
        quantity_ordered=Decimal(str(qty)),
        unit_cost_usd=Decimal("10.0"),
    )
    db.add(line)
    db.commit()
    db.refresh(pec)
    db.refresh(line)
    return pec, line


def _create_so_with_line(db, sku_id: int, qty: float = 5.0) -> tuple:
    so = SaleOrder(
        numero=f"PVEN-TEST-{uuid.uuid4().hex[:6].upper()}",
        customer_name="Cliente VIP Test",
        estado="PENDIENTE_COMPRA",
        total_cop=200000.0,
    )
    db.add(so)
    db.flush()

    line = SaleOrderLineErp(
        so_id=so.id,
        sku_id=sku_id,
        description="Producto Test Pedido Venta",
        quantity=Decimal(str(qty)),
        unit_price_cop=Decimal("20.0"),
    )
    db.add(line)
    db.commit()
    db.refresh(so)
    db.refresh(line)
    return so, line


class TestFase2AsignacionesMN:

    def test_asignacion_customer_order_exitosa(self, app_client, admin_token):
        """1. Asignar orden de compra a pedido de cliente."""
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
        """2. Asignación dividida: cliente + stock Nebulae + stock Mau."""
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
        data = res.json()
        assert data["status"] == "success"
        assert len(data["data"]) == 3

    def test_sobreasignacion_falla_422(self, app_client, admin_token):
        """3. Asignar más de la cantidad ordenada debe arrojar 422."""
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
                    "allocation_type": "NEBULAE_STOCK",
                    "quantity_allocated": 6.0,  # Supera los 5.0 ordenados
                }
            ]
        }
        res = app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
            json=payload,
        )
        assert res.status_code == 422
        assert "supera la cantidad ordenada" in res.text

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

    def test_actualizacion_idempotente_asignaciones(self, app_client, admin_token):
        """5. Actualizar asignación existente actualiza la cantidad sin duplicar fila."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, po_line = _create_pec_with_line(session, sup_id, sku_id, qty=10.0)

            pec_id = pec.id
            po_line_id = po_line.id

        # Primera asignación: 4 a stock Nebulae
        app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
            json={"allocations": [{"po_line_id": po_line_id, "allocation_type": "NEBULAE_STOCK", "quantity_allocated": 4.0}]},
        )

        # Segunda asignación: actualizar a 5 a stock Nebulae
        res2 = app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
            json={"allocations": [{"po_line_id": po_line_id, "allocation_type": "NEBULAE_STOCK", "quantity_allocated": 5.0}]},
        )
        assert res2.status_code == 200

        with TestSessionLocal() as session:
            allocs = session.query(ProcurementAllocation).filter(ProcurementAllocation.po_line_id == po_line_id).all()
            assert len(allocs) == 1
            assert float(allocs[0].quantity_allocated) == 5.0

    def test_consulta_inversa_abastecimiento_ventas(self, app_client, admin_token):
        """6. GET /ventas/{so_id}/abastecimiento devuelve las compras asociadas."""
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

        # Consultar abastecimiento desde la perspectiva de la venta
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
        """7. GET /pedidos/{pec_id}/asignaciones lista todas las asignaciones."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, po_line = _create_pec_with_line(session, sup_id, sku_id, qty=7.0)

            pec_id = pec.id
            po_line_id = po_line.id

        app_client.post(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
            json={"allocations": [{"po_line_id": po_line_id, "allocation_type": "MAU_STOCK", "quantity_allocated": 7.0}]},
        )

        res = app_client.get(
            f"/api/v1/compras/pedidos/{pec_id}/asignaciones",
            headers=_auth(admin_token),
        )
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["pec_id"] == pec_id
        assert len(data["asignaciones"]) == 1
        assert data["asignaciones"][0]["allocation_type"] == "MAU_STOCK"
        assert data["asignaciones"][0]["quantity_allocated"] == 7.0
