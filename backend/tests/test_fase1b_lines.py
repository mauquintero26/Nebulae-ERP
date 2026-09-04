"""
test_fase1b_lines.py — Tests de líneas normalizadas y asignaciones

Escenarios:
1. SC → COT → PVEN conservando líneas normalizadas
2. Una PEC para varios PVEN (procurement_allocations)
3. Un PVEN abastecido por varias PEC
4. Compra mixta: cliente + Nebulae + Mau
5. Recepción distribuida entre varias asignaciones
6. Recepción parcial sobre líneas normalizadas
"""
import uuid
import pytest
from decimal import Decimal
from sqlalchemy import text

from tests.conftest import TestSessionLocal, test_engine


def _create_full_chain(db, sku_id, warehouse_id, supplier_id):
    """Crea SC → COT → PVEN → PEC con líneas normalizadas. Retorna IDs."""
    from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder, PurchaseOrderFull

    sc_num = f"SC-LT-{uuid.uuid4().hex[:8].upper()}"
    sc = CustomerRequest(
        numero=sc_num, advisor_name="TestAdvisor", estado="BORRADOR",
        productos=[{"sku_id": sku_id, "qty": 5, "name": "TestItem", "price_cop": 100000}]
    )
    db.add(sc); db.flush()

    # SC line normalizada
    db.execute(text(
        "INSERT INTO customer_request_lines "
        "(cr_id, sku_id, description, quantity, unit_price_cop, source, created_at) "
        "VALUES (:cr, :sku, 'TestItem', 5, 100000, 'NATIVE', NOW())"
    ), {"cr": sc.id, "sku": sku_id})

    cot = SalesQuotation(
        numero=f"COT-LT-{uuid.uuid4().hex[:8].upper()}",
        sc_id=sc.id, sc_numero=sc_num,
        total_cop=500000, estado="BORRADOR",
        productos=[{"sku_id": sku_id, "qty": 5, "name": "TestItem", "price_cop": 100000}]
    )
    db.add(cot); db.flush()

    crl_row = db.execute(text(
        "SELECT id FROM customer_request_lines WHERE cr_id = :cr LIMIT 1"
    ), {"cr": sc.id}).fetchone()
    crl_id = crl_row[0] if crl_row else None

    sql_row = db.execute(text(
        "INSERT INTO sales_quotation_lines "
        "(sq_id, sku_id, cr_line_id, description, quantity, unit_price_cop, source, created_at) "
        "VALUES (:sq, :sku, :crl, 'TestItem', 5, 100000, 'NATIVE', NOW()) RETURNING id"
    ), {"sq": cot.id, "sku": sku_id, "crl": crl_id}).fetchone()
    sql_id = sql_row[0]

    so = SaleOrder(
        numero=f"VEN-LT-{uuid.uuid4().hex[:8].upper()}",
        sc_id=sc.id, sc_numero=sc_num, cot_id=cot.id, cot_numero=cot.numero,
        total_cop=500000, anticipo_cop=0, saldo_cop=500000, estado="PENDIENTE_COMPRA",
        productos=[{"sku_id": sku_id, "qty": 5, "name": "TestItem", "price_cop": 100000}]
    )
    db.add(so); db.flush()

    sole_row = db.execute(text(
        "INSERT INTO sale_order_lines_erp "
        "(so_id, sku_id, sq_line_id, description, quantity, unit_price_cop, source, created_at) "
        "VALUES (:so, :sku, :sql_id, 'TestItem', 5, 100000, 'NATIVE', NOW()) RETURNING id"
    ), {"so": so.id, "sku": sku_id, "sql_id": sql_id}).fetchone()
    sole_id = sole_row[0]

    from app.models.erp_documents import Supplier
    pec = PurchaseOrderFull(
        numero=f"PEC-LT-{uuid.uuid4().hex[:8].upper()}",
        supplier_id=supplier_id, warehouse_id=warehouse_id, estado="EMITIDO",
        productos=[{"sku_id": sku_id, "qty": 5, "name": "TestItem", "cost_cop": 50000}]
    )
    db.add(pec); db.flush()

    pol_row = db.execute(text(
        "INSERT INTO purchase_order_lines "
        "(pec_id, sku_id, description, quantity_ordered, unit_cost_cop, source, created_at) "
        "VALUES (:pec, :sku, 'TestItem', 5, 50000, 'NATIVE', NOW()) RETURNING id"
    ), {"pec": pec.id, "sku": sku_id}).fetchone()
    pol_id = pol_row[0]

    db.commit()
    return {
        "sc": sc, "cot": cot, "so": so, "pec": pec,
        "sole_id": sole_id, "pol_id": pol_id
    }


class TestScCotVenChain:
    """SC → COT → PVEN conservando líneas."""

    def test_sc_to_cot_to_ven_preserves_lines(self, db, sku, warehouse, supplier):
        chain = _create_full_chain(db, sku.id, warehouse.id, supplier.id)
        so_id = chain["so"].id

        # Verificar que las líneas existen en cada nivel
        sc_lines = db.execute(text(
            "SELECT COUNT(*) FROM customer_request_lines WHERE cr_id = :id"
        ), {"id": chain["sc"].id}).scalar()
        cot_lines = db.execute(text(
            "SELECT COUNT(*) FROM sales_quotation_lines WHERE sq_id = :id"
        ), {"id": chain["cot"].id}).scalar()
        so_lines = db.execute(text(
            "SELECT COUNT(*) FROM sale_order_lines_erp WHERE so_id = :id"
        ), {"id": so_id}).scalar()

        assert sc_lines == 1, f"SC debe tener 1 línea, tiene {sc_lines}"
        assert cot_lines == 1, f"COT debe tener 1 línea, tiene {cot_lines}"
        assert so_lines == 1, f"PVEN debe tener 1 línea, tiene {so_lines}"

        # Verificar trazabilidad SC → COT (cr_line_id)
        cot_line = db.execute(text(
            "SELECT cr_line_id FROM sales_quotation_lines WHERE sq_id = :id LIMIT 1"
        ), {"id": chain["cot"].id}).fetchone()
        assert cot_line is not None and cot_line[0] is not None, "COT line debe tener cr_line_id"

        # JSON original intacto
        sc_json = db.execute(text(
            "SELECT productos FROM customer_requests WHERE id = :id"
        ), {"id": chain["sc"].id}).scalar()
        assert sc_json is not None, "JSON original de SC no debe ser NULL"


class TestProcurementAllocations:
    """Una PEC para varios PVEN y un PVEN con varias PEC."""

    def test_one_pec_for_multiple_pven(self, db, sku, warehouse, supplier):
        """Una línea de PEC puede abastecer múltiples pedidos de venta."""
        # Crear 2 PVEN con líneas normalizadas
        so1 = db.execute(text(
            "INSERT INTO sale_orders (numero,sc_numero,cot_numero,estado,total_cop,anticipo_cop,saldo_cop,productos) "
            "VALUES (:n,'','','PENDIENTE_COMPRA',100000,0,100000,'[]') RETURNING id"
        ), {"n": f"VEN-A1-{uuid.uuid4().hex[:8].upper()}"}).fetchone()
        so2 = db.execute(text(
            "INSERT INTO sale_orders (numero,sc_numero,cot_numero,estado,total_cop,anticipo_cop,saldo_cop,productos) "
            "VALUES (:n,'','','PENDIENTE_COMPRA',50000,0,50000,'[]') RETURNING id"
        ), {"n": f"VEN-A2-{uuid.uuid4().hex[:8].upper()}"}).fetchone()

        sole1 = db.execute(text(
            "INSERT INTO sale_order_lines_erp (so_id,sku_id,description,quantity,unit_price_cop,source,created_at) "
            "VALUES (:so,:sku,'ItemA',3,33333,'NATIVE',NOW()) RETURNING id"
        ), {"so": so1[0], "sku": sku.id}).fetchone()
        sole2 = db.execute(text(
            "INSERT INTO sale_order_lines_erp (so_id,sku_id,description,quantity,unit_price_cop,source,created_at) "
            "VALUES (:so,:sku,'ItemA',2,25000,'NATIVE',NOW()) RETURNING id"
        ), {"so": so2[0], "sku": sku.id}).fetchone()

        # Una PEC con línea de 5 unidades
        from app.models.erp_documents import PurchaseOrderFull
        pec = PurchaseOrderFull(
            numero=f"PEC-A-{uuid.uuid4().hex[:8].upper()}",
            supplier_id=supplier.id, warehouse_id=warehouse.id, estado="EMITIDO",
            productos=[{"sku_id": sku.id, "qty": 5}]
        )
        db.add(pec); db.flush()
        pol = db.execute(text(
            "INSERT INTO purchase_order_lines (pec_id,sku_id,description,quantity_ordered,source,created_at) "
            "VALUES (:pec,:sku,'ItemA',5,'NATIVE',NOW()) RETURNING id"
        ), {"pec": pec.id, "sku": sku.id}).fetchone()

        # 2 asignaciones sobre la misma línea de compra
        db.execute(text(
            "INSERT INTO procurement_allocations (po_line_id,allocation_type,sale_order_line_id,quantity_allocated,created_at) "
            "VALUES (:pol,'CUSTOMER_ORDER',:sol,3,NOW())"
        ), {"pol": pol[0], "sol": sole1[0]})
        db.execute(text(
            "INSERT INTO procurement_allocations (po_line_id,allocation_type,sale_order_line_id,quantity_allocated,created_at) "
            "VALUES (:pol,'CUSTOMER_ORDER',:sol,2,NOW())"
        ), {"pol": pol[0], "sol": sole2[0]})
        db.commit()

        # Verificar: la suma de asignaciones <= quantity_ordered
        total_alloc = db.execute(text(
            "SELECT SUM(quantity_allocated) FROM procurement_allocations WHERE po_line_id = :id"
        ), {"id": pol[0]}).scalar()
        assert total_alloc == 5, f"Total asignado debe ser 5, es {total_alloc}"

        # Verificar: 2 asignaciones distintas para la misma línea de compra
        count = db.execute(text(
            "SELECT COUNT(*) FROM procurement_allocations WHERE po_line_id = :id"
        ), {"id": pol[0]}).scalar()
        assert count == 2, f"Deben existir 2 asignaciones, hay {count}"

    def test_mixed_allocation_types(self, db, sku, warehouse, supplier):
        """Compra mixta: CUSTOMER_ORDER + NEBULAE_STOCK + MAU_STOCK en misma PEC."""
        from app.models.erp_documents import SaleOrder, PurchaseOrderFull
        so = SaleOrder(
            numero=f"VEN-MX-{uuid.uuid4().hex[:8].upper()}",
            sc_numero="", cot_numero="",
            estado="PENDIENTE_COMPRA", total_cop=200000,
            anticipo_cop=0, saldo_cop=200000, productos=[]
        )
        db.add(so); db.flush()

        sole = db.execute(text(
            "INSERT INTO sale_order_lines_erp (so_id,sku_id,description,quantity,unit_price_cop,source,created_at) "
            "VALUES (:so,:sku,'MixItem',5,40000,'NATIVE',NOW()) RETURNING id"
        ), {"so": so.id, "sku": sku.id}).fetchone()

        pec = PurchaseOrderFull(
            numero=f"PEC-MX-{uuid.uuid4().hex[:8].upper()}",
            supplier_id=supplier.id, warehouse_id=warehouse.id, estado="EMITIDO",
            productos=[{"sku_id": sku.id, "qty": 12}]
        )
        db.add(pec); db.flush()
        pol = db.execute(text(
            "INSERT INTO purchase_order_lines (pec_id,sku_id,description,quantity_ordered,source,created_at) "
            "VALUES (:pec,:sku,'MixItem',12,'NATIVE',NOW()) RETURNING id"
        ), {"pec": pec.id, "sku": sku.id}).fetchone()

        # 3 tipos de asignación diferentes
        db.execute(text(
            "INSERT INTO procurement_allocations (po_line_id,allocation_type,sale_order_line_id,quantity_allocated,created_at) "
            "VALUES (:pol,'CUSTOMER_ORDER',:sol,5,NOW())"
        ), {"pol": pol[0], "sol": sole[0]})
        db.execute(text(
            "INSERT INTO procurement_allocations (po_line_id,allocation_type,quantity_allocated,created_at) "
            "VALUES (:pol,'NEBULAE_STOCK',4,NOW())"
        ), {"pol": pol[0]})
        db.execute(text(
            "INSERT INTO procurement_allocations (po_line_id,allocation_type,quantity_allocated,created_at) "
            "VALUES (:pol,'MAU_STOCK',3,NOW())"
        ), {"pol": pol[0]})
        db.commit()

        # Verificar suma y tipos
        rows = db.execute(text(
            "SELECT allocation_type, quantity_allocated FROM procurement_allocations "
            "WHERE po_line_id = :id ORDER BY allocation_type"
        ), {"id": pol[0]}).fetchall()
        types = {r[0] for r in rows}
        assert "CUSTOMER_ORDER" in types
        assert "NEBULAE_STOCK" in types
        assert "MAU_STOCK" in types
        total = sum(r[1] for r in rows)
        assert total == 12, f"Total asignado debe ser 12 (qty_ordered), es {total}"

    def test_sale_order_line_required_for_customer_order_schema(self):
        """Schema Pydantic: CUSTOMER_ORDER sin sale_order_line_id → error de validación."""
        import pytest
        from pydantic import ValidationError
        from app.api.v1.schemas_fase1b import ProcurementAllocationIn

        with pytest.raises(ValidationError) as exc_info:
            ProcurementAllocationIn(
                po_line_id=1,
                allocation_type="CUSTOMER_ORDER",
                sale_order_line_id=None,
                quantity_allocated=Decimal("5")
            )
        assert "CUSTOMER_ORDER" in str(exc_info.value)


class TestReceiptLines:
    """Recepción distribuida y parcial sobre líneas normalizadas."""

    def test_distributed_receipt(self, db, sku, warehouse, supplier):
        """Una línea recibida distribuida entre 2 asignaciones."""
        from app.models.erp_documents import PurchaseOrderFull, GoodsReceipt, SaleOrder

        pec = PurchaseOrderFull(
            numero=f"PEC-DR-{uuid.uuid4().hex[:8].upper()}",
            supplier_id=supplier.id, warehouse_id=warehouse.id, estado="EMITIDO",
            productos=[{"sku_id": sku.id, "qty": 10}]
        )
        db.add(pec); db.flush()

        pol = db.execute(text(
            "INSERT INTO purchase_order_lines (pec_id,sku_id,description,quantity_ordered,source,created_at) "
            "VALUES (:pec,:sku,'DRItem',10,'NATIVE',NOW()) RETURNING id"
        ), {"pec": pec.id, "sku": sku.id}).fetchone()

        alloc1 = db.execute(text(
            "INSERT INTO procurement_allocations (po_line_id,allocation_type,quantity_allocated,created_at) "
            "VALUES (:pol,'NEBULAE_STOCK',6,NOW()) RETURNING id"
        ), {"pol": pol[0]}).fetchone()

        alloc2 = db.execute(text(
            "INSERT INTO procurement_allocations (po_line_id,allocation_type,quantity_allocated,created_at) "
            "VALUES (:pol,'MAU_STOCK',4,NOW()) RETURNING id"
        ), {"pol": pol[0]}).fetchone()

        gr = GoodsReceipt(
            numero=f"ENINV-DR-{uuid.uuid4().hex[:8].upper()}",
            pec_id=pec.id, pec_numero=pec.numero,
            supplier_id=supplier.id, warehouse_id=warehouse.id,
            estado="BORRADOR", stock_actualizado=False,
            productos=[{"sku_id": sku.id, "qty_esperada": 10, "qty_recibida": 10}]
        )
        db.add(gr); db.flush()

        grl = db.execute(text(
            "INSERT INTO goods_receipt_lines "
            "(gr_id,po_line_id,sku_id,description,quantity_expected,quantity_received,receipt_type,source,created_at) "
            "VALUES (:gr,:pol,:sku,'DRItem',10,10,'FISICA','NATIVE',NOW()) RETURNING id"
        ), {"gr": gr.id, "pol": pol[0], "sku": sku.id}).fetchone()

        # Distribuir 6 a NEBULAE_STOCK, 4 a MAU_STOCK
        db.execute(text(
            "INSERT INTO goods_receipt_line_allocations (gr_line_id,allocation_id,quantity_applied,created_at) "
            "VALUES (:grl,:alloc,6,NOW())"
        ), {"grl": grl[0], "alloc": alloc1[0]})
        db.execute(text(
            "INSERT INTO goods_receipt_line_allocations (gr_line_id,allocation_id,quantity_applied,created_at) "
            "VALUES (:grl,:alloc,4,NOW())"
        ), {"grl": grl[0], "alloc": alloc2[0]})
        db.commit()

        # Verificar: suma aplicada == cantidad recibida
        total_applied = db.execute(text(
            "SELECT SUM(quantity_applied) FROM goods_receipt_line_allocations WHERE gr_line_id = :id"
        ), {"id": grl[0]}).scalar()
        assert total_applied == 10, f"Total aplicado debe ser 10 (qty_received), es {total_applied}"

    def test_partial_receipt_on_normalized_lines(self, db, sku, warehouse, supplier):
        """Recepción parcial: qty_received < qty_expected."""
        from app.models.erp_documents import PurchaseOrderFull, GoodsReceipt

        pec = PurchaseOrderFull(
            numero=f"PEC-PR-{uuid.uuid4().hex[:8].upper()}",
            supplier_id=supplier.id, warehouse_id=warehouse.id, estado="EMITIDO",
            productos=[{"sku_id": sku.id, "qty": 10}]
        )
        db.add(pec); db.flush()

        pol = db.execute(text(
            "INSERT INTO purchase_order_lines (pec_id,sku_id,description,quantity_ordered,source,created_at) "
            "VALUES (:pec,:sku,'PRItem',10,'NATIVE',NOW()) RETURNING id"
        ), {"pec": pec.id, "sku": sku.id}).fetchone()

        gr = GoodsReceipt(
            numero=f"ENINV-PR-{uuid.uuid4().hex[:8].upper()}",
            pec_id=pec.id, pec_numero=pec.numero,
            supplier_id=supplier.id, warehouse_id=warehouse.id,
            estado="BORRADOR", stock_actualizado=False,
            productos=[{"sku_id": sku.id, "qty_esperada": 10, "qty_recibida": 6}]
        )
        db.add(gr); db.flush()

        # Línea con qty_received < qty_expected
        grl = db.execute(text(
            "INSERT INTO goods_receipt_lines "
            "(gr_id,po_line_id,sku_id,description,quantity_expected,quantity_received,"
            " quantity_rejected,quantity_quarantine,receipt_type,source,created_at) "
            "VALUES (:gr,:pol,:sku,'PRItem',10,6,2,2,'FISICA','NATIVE',NOW()) RETURNING id"
        ), {"gr": gr.id, "pol": pol[0], "sku": sku.id}).fetchone()
        db.commit()

        # Verificar desgloses
        line = db.execute(text(
            "SELECT quantity_expected,quantity_received,quantity_rejected,quantity_quarantine "
            "FROM goods_receipt_lines WHERE id = :id"
        ), {"id": grl[0]}).fetchone()
        assert line[0] == 10, "qty_expected debe ser 10"
        assert line[1] == 6,  "qty_received debe ser 6"
        assert line[2] == 2,  "qty_rejected debe ser 2"
        assert line[3] == 2,  "qty_quarantine debe ser 2"
        total = line[1] + line[2] + line[3]
        assert total == 10, f"Suma debe ser 10 (qty_expected), es {total}"
