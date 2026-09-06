from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.expenses import OperationalExpense
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.catalog import ProductSKU
from app.schemas import finance as schemas
from decimal import Decimal
import datetime

router = APIRouter()

@router.post("/expenses", status_code=status.HTTP_201_CREATED)
def create_expense(expense: schemas.ExpenseCreate, db: Session = Depends(get_db)):
    expense_data = expense.model_dump()
    if not expense_data.get("incurred_date"):
        expense_data["incurred_date"] = datetime.datetime.utcnow()
        
    db_exp = OperationalExpense(**expense_data)
    db.add(db_exp)
    db.commit()
    db.refresh(db_exp)
    return {"status": "success", "data": schemas.ExpenseResponse.model_validate(db_exp).model_dump()}

@router.get("/expenses")
def list_expenses(db: Session = Depends(get_db)):
    expenses = db.query(OperationalExpense).all()
    return {"status": "success", "data": [schemas.ExpenseResponse.model_validate(e).model_dump() for e in expenses]}

@router.get("/dashboard", response_model=dict)
def get_dashboard(db: Session = Depends(get_db)):
    lines = db.query(SalesOrderLine).all()
    
    gross_revenue = Decimal("0.0")
    cogs = Decimal("0.0")
    
    for line in lines:
        gross_revenue += (line.unit_price * line.quantity)
        sku = db.query(ProductSKU).filter(ProductSKU.id == line.sku_id).first()
        if sku and sku.cost_price:
            cogs += (sku.cost_price * line.quantity)
            
    gross_profit = gross_revenue - cogs
    
    expenses = db.query(OperationalExpense).all()
    opex = sum((exp.amount for exp in expenses), Decimal("0.0"))
    
    net_profit = gross_profit - opex
    
    dashboard = schemas.DashboardResponse(
        gross_revenue=gross_revenue,
        cogs=cogs,
        gross_profit=gross_profit,
        opex=opex,
        net_profit=net_profit
    )
    
    return {"status": "success", "data": dashboard.model_dump(mode="json")}

# ──────────────────────────────────────────────────────────────────────────────
# FASE 5: CAPA FINANCIERA CANONICA, RECONCILIABLE Y AUDITABLE
# ──────────────────────────────────────────────────────────────────────────────
from typing import Optional
from sqlalchemy import func
from app.models.erp_documents import SaleOrder, PurchaseOrderFull, ActivityLog
from app.models.fase1b import SaleOrderLineErp, InventoryOwnerBalance, PurchaseOrderLine
from app.models.fase4 import SaleOrderPayment, SaleOrderDelivery, SaleOrderReturn, SaleOrderReturnLine
from app.models.inventory import InventoryMovement, Warehouse
from app.models.customers import Customer
from app.models.users import User
from app.api.dependencies import require_roles, ROLE_ADMIN, ROLE_FINANZAS, ALL_ERP_ROLES


@router.get("/accounts-receivable", response_model=dict)
def get_accounts_receivable(
    db: Session = Depends(get_db)
):
    """
    Cuentas por Cobrar (AR) reconciliadas con pedidos de venta activos.
    Agrupa por cliente y categoriza por ventanas de antiguedad (aging).
    """
    now = datetime.datetime.utcnow().date()
    orders = db.query(SaleOrder).filter(
        SaleOrder.saldo_cop > 0,
        SaleOrder.estado != "CANCELADO"
    ).all()

    total_ar = Decimal("0.0")
    aging_0_30 = Decimal("0.0")
    aging_31_60 = Decimal("0.0")
    aging_61_90 = Decimal("0.0")
    aging_over_90 = Decimal("0.0")

    customer_buckets = {}

    for so in orders:
        saldo = Decimal(str(so.saldo_cop or 0))
        total_ar += saldo

        # Antigüedad en días desde la fecha de cotización o creación
        raw_date = so.fecha_cotizacion or so.created_at
        if raw_date is not None:
            doc_date = raw_date.date() if hasattr(raw_date, "date") else raw_date
        else:
            doc_date = now
        days = (now - doc_date).days if doc_date else 0

        if days <= 30:
            aging_0_30 += saldo
            bucket = "0-30"
        elif days <= 60:
            aging_31_60 += saldo
            bucket = "31-60"
        elif days <= 90:
            aging_61_90 += saldo
            bucket = "61-90"
        else:
            aging_over_90 += saldo
            bucket = ">90"

        c_id = so.customer_id or 0
        if c_id not in customer_buckets:
            customer_buckets[c_id] = {
                "customer_id": so.customer_id,
                "customer_name": so.customer_name or "Cliente General",
                "customer_phone": so.customer_phone,
                "total_saldo_cop": 0.0,
                "orders_count": 0,
                "orders": []
            }

        customer_buckets[c_id]["total_saldo_cop"] += float(saldo)
        customer_buckets[c_id]["orders_count"] += 1
        customer_buckets[c_id]["orders"].append({
            "order_id": so.id,
            "numero": so.numero,
            "total_cop": float(so.total_cop or 0),
            "saldo_cop": float(saldo),
            "estado": so.estado,
            "dias_antiguedad": days,
            "bucket": bucket,
        })

    return {
        "status": "success",
        "data": {
            "total_accounts_receivable_cop": round(float(total_ar), 2),
            "aging": {
                "0_30_dias": round(float(aging_0_30), 2),
                "31_60_dias": round(float(aging_31_60), 2),
                "61_90_dias": round(float(aging_61_90), 2),
                "mas_90_dias": round(float(aging_over_90), 2),
            },
            "customers_count": len(customer_buckets),
            "customers": sorted(list(customer_buckets.values()), key=lambda x: x["total_saldo_cop"], reverse=True)
        }
    }


@router.get("/accounts-payable", response_model=dict)
def get_accounts_payable(
    db: Session = Depends(get_db)
):
    """
    Cuentas por Pagar (AP) a proveedores desde pedidos de compra.
    """
    now = datetime.datetime.utcnow().date()
    pos = db.query(PurchaseOrderFull).filter(
        PurchaseOrderFull.estado.in_(["APROBADO", "ENVIADO", "EN_TRANSITO", "RECIBIDO"])
    ).all()

    total_ap = Decimal("0.0")
    suppliers_buckets = {}

    for po in pos:
        # Si tiene saldo pendiente
        tot = Decimal(str(po.total_cop or 0))
        pagado = Decimal(str(po.monto_pagado_cop or 0))
        saldo = tot - pagado
        if saldo <= Decimal("0.0"):
            continue

        total_ap += saldo
        raw_po_date = po.fecha_compra or po.created_at
        if raw_po_date is not None:
            po_date = raw_po_date.date() if hasattr(raw_po_date, "date") else raw_po_date
        else:
            po_date = now
        days = (now - po_date).days if po_date else 0

        s_name = po.supplier_name or "Proveedor General"
        if s_name not in suppliers_buckets:
            suppliers_buckets[s_name] = {
                "supplier_name": s_name,
                "total_saldo_cop": 0.0,
                "orders_count": 0,
                "orders": []
            }

        suppliers_buckets[s_name]["total_saldo_cop"] += float(saldo)
        suppliers_buckets[s_name]["orders_count"] += 1
        suppliers_buckets[s_name]["orders"].append({
            "po_id": po.id,
            "numero": po.numero,
            "total_cop": float(tot),
            "saldo_cop": float(saldo),
            "estado": po.estado,
            "dias_antiguedad": days,
        })

    return {
        "status": "success",
        "data": {
            "total_accounts_payable_cop": round(float(total_ap), 2),
            "suppliers_count": len(suppliers_buckets),
            "suppliers": sorted(list(suppliers_buckets.values()), key=lambda x: x["total_saldo_cop"], reverse=True)
        }
    }


@router.get("/ledger/reconciliation", response_model=dict)
def get_ledger_reconciliation(
    db: Session = Depends(get_db)
):
    """
    Libro mayor y reconciliacion financiera:
    - Anticipos, abonos, pagos totales, devoluciones de dinero, reversiones y saldos a favor.
    - Reconciliacion entre ventas facturadas, cobros netos y cuentas por cobrar.
    """
    payments = db.query(SaleOrderPayment).all()

    anticipos_cop = Decimal("0.0")
    abonos_cop = Decimal("0.0")
    devoluciones_dinero_cop = Decimal("0.0")
    reversiones_cop = Decimal("0.0")
    saldos_a_favor_generados = Decimal("0.0")

    for p in payments:
        amt = Decimal(str(p.monto or 0))
        if p.estado == "CONFIRMADO":
            if p.tipo == "ANTICIPO":
                anticipos_cop += amt
            elif p.tipo in ("ABONO", "PAGO_TOTAL", "PAGO_SALDO"):
                abonos_cop += amt
            elif p.tipo == "DEVOLUCION":
                devoluciones_dinero_cop += amt
        elif p.estado == "REVERTIDO" or p.tipo == "REVERSION":
            reversiones_cop += amt

    # Saldos a favor registrados en devoluciones de clientes
    returns = db.query(SaleOrderReturn).filter(
        SaleOrderReturn.status != "CANCELADA",
        SaleOrderReturn.financial_resolution == "SALDO_A_FAVOR"
    ).all()
    for r in returns:
        saldos_a_favor_generados += Decimal(str(r.refund_amount or 0))

    # Ventas totales y cartera
    sos = db.query(SaleOrder).filter(SaleOrder.estado != "CANCELADO").all()
    total_ventas_facturadas = sum((Decimal(str(s.total_cop or 0)) for s in sos), Decimal("0.0"))
    total_cartera_por_cobrar = sum((Decimal(str(s.saldo_cop or 0)) for s in sos), Decimal("0.0"))

    # Reconciliar anticipos documentales no reflejados individualmente en pagos
    paid_so_ids = {p.sale_order_id for p in payments if p.tipo in ("ANTICIPO", "PAGO_TOTAL", "PAGO_SALDO", "ABONO") and p.estado == "CONFIRMADO"}
    for s in sos:
        if s.id not in paid_so_ids and s.anticipo_cop:
            amt = Decimal(str(s.anticipo_cop))
            if amt > Decimal("0.0"):
                anticipos_cop += amt

    flujo_neto_recaudo = (anticipos_cop + abonos_cop) - devoluciones_dinero_cop

    # Descuadre teorico
    descuadre_reconciliacion = (total_ventas_facturadas - flujo_neto_recaudo) - total_cartera_por_cobrar
    es_reconciliado = abs(descuadre_reconciliacion) < Decimal("1.00")

    return {
        "status": "success",
        "data": {
            "total_ventas_facturadas_cop": round(float(total_ventas_facturadas), 2),
            "anticipos_recibidos_cop": round(float(anticipos_cop), 2),
            "abonos_y_saldos_recibidos_cop": round(float(abonos_cop), 2),
            "devoluciones_dinero_cop": round(float(devoluciones_dinero_cop), 2),
            "reversiones_cop": round(float(reversiones_cop), 2),
            "saldos_a_favor_disponibles_cop": round(float(saldos_a_favor_generados), 2),
            "flujo_neto_recaudo_cop": round(float(flujo_neto_recaudo), 2),
            "total_cuentas_por_cobrar_cop": round(float(total_cartera_por_cobrar), 2),
            "diferencia_reconciliacion_cop": round(float(descuadre_reconciliacion), 2),
            "reconciliacion_cuadrada": es_reconciliado,
        }
    }


@router.get("/inventory-valuation", response_model=dict)
def get_inventory_valuation(
    db: Session = Depends(get_db)
):
    """
    Valorizacion del inventario actual segregado estrictamente por propietario (NEBULAE vs MAU).
    """
    balances = db.query(InventoryOwnerBalance).all()

    nebulae_qty = Decimal("0.0")
    nebulae_val = Decimal("0.0")
    mau_qty = Decimal("0.0")
    mau_val = Decimal("0.0")

    breakdown = []

    for b in balances:
        qty = Decimal(str(b.quantity or 0))
        if qty <= 0:
            continue

        sku = db.query(ProductSKU).filter(ProductSKU.id == b.sku_id).first()
        cost = Decimal(str(sku.cost_price or 0)) if sku and sku.cost_price else Decimal("0.00")
        line_val = qty * cost

        if b.owner == "NEBULAE":
            nebulae_qty += qty
            nebulae_val += line_val
        elif b.owner == "MAU":
            mau_qty += qty
            mau_val += line_val

        breakdown.append({
            "balance_id": b.id,
            "sku_id": b.sku_id,
            "sku": sku.sku if sku else "N/A",
            "warehouse_id": b.warehouse_id,
            "owner": b.owner,
            "quantity": float(qty),
            "unit_cost_cop": float(cost),
            "total_valuation_cop": float(line_val),
        })

    total_qty = nebulae_qty + mau_qty
    total_val = nebulae_val + mau_val

    return {
        "status": "success",
        "data": {
            "total_inventory_quantity": float(total_qty),
            "total_inventory_valuation_cop": round(float(total_val), 2),
            "nebulae": {
                "quantity": float(nebulae_qty),
                "valuation_cop": round(float(nebulae_val), 2),
            },
            "mau": {
                "quantity": float(mau_qty),
                "valuation_cop": round(float(mau_val), 2),
            },
            "items_count": len(breakdown),
            "breakdown": breakdown,
        }
    }


@router.get("/losses-and-scrap", response_model=dict)
def get_losses_and_scrap(
    db: Session = Depends(get_db)
):
    """
    Reporte de perdidas por mermas (SCRAP) y devoluciones de clientes destruidas.
    """
    scrap_movements = db.query(InventoryMovement).filter(InventoryMovement.movement_type == "SCRAP").all()
    destroyed_returns = db.query(SaleOrderReturnLine).filter(SaleOrderReturnLine.inventory_resolution == "DESTRUIDO").all()

    total_loss_cop = Decimal("0.0")
    scrap_items = []

    for sm in scrap_movements:
        sku = db.query(ProductSKU).filter(ProductSKU.id == sm.sku_id).first()
        cost = Decimal(str(sku.cost_price or 0)) if sku and sku.cost_price else Decimal("0.00")
        qty = abs(Decimal(str(sm.quantity or 0)))
        loss = qty * cost
        total_loss_cop += loss
        scrap_items.append({
            "source": "INVENTORY_SCRAP",
            "sku_id": sm.sku_id,
            "quantity": float(qty),
            "unit_cost_cop": float(cost),
            "loss_cop": float(loss),
            "notes": sm.notes,
            "date": sm.created_at.isoformat() if sm.created_at else None,
        })

    for dr in destroyed_returns:
        sku = db.query(ProductSKU).filter(ProductSKU.id == dr.sku_id).first()
        cost = Decimal(str(sku.cost_price or 0)) if sku and sku.cost_price else Decimal("0.00")
        qty = Decimal(str(dr.quantity or 0))
        loss = qty * cost
        total_loss_cop += loss
        scrap_items.append({
            "source": "RETURN_DESTRUCTION",
            "return_line_id": dr.id,
            "sku_id": dr.sku_id,
            "quantity": float(qty),
            "unit_cost_cop": float(cost),
            "loss_cop": float(loss),
            "owner": dr.owner,
            "date": dr.created_at.isoformat() if dr.created_at else None,
        })

    return {
        "status": "success",
        "data": {
            "total_losses_cop": round(float(total_loss_cop), 2),
            "records_count": len(scrap_items),
            "items": scrap_items,
        }
    }


@router.get("/profitability", response_model=dict)
def get_global_profitability(
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_FINANZAS)),
    db: Session = Depends(get_db)
):
    """
    Rentabilidad estimada y real protegida con RBAC (solo ADMIN y FINANZAS).
    Segrega resultados operativos de NEBULAE y MAU.
    """
    lines = db.query(SaleOrderLineErp).join(SaleOrder).filter(SaleOrder.estado != "CANCELADO").all()

    gross_sales = Decimal("0.0")
    total_disc = Decimal("0.0")
    total_cogs = Decimal("0.0")

    nebulae_sales = Decimal("0.0")
    nebulae_cogs = Decimal("0.0")
    mau_sales = Decimal("0.0")
    mau_cogs = Decimal("0.0")

    for l in lines:
        qty = Decimal(str(l.quantity or 0))
        price = Decimal(str(l.unit_price_cop or 0))
        disc_pct = Decimal(str(l.descuento_pct or 0))
        cost = Decimal(str(l.cost_unit_cop_snapshot or 0))

        line_gross = qty * price
        line_disc = line_gross * (disc_pct / Decimal("100.0"))
        line_net = line_gross - line_disc
        line_cost = qty * cost

        gross_sales += line_gross
        total_disc += line_disc
        total_cogs += line_cost

        if l.owner == "MAU":
            mau_sales += line_net
            mau_cogs += line_cost
        else:
            nebulae_sales += line_net
            nebulae_cogs += line_cost

    net_sales = gross_sales - total_disc
    gross_margin = net_sales - total_cogs
    margin_pct = (gross_margin / net_sales * Decimal("100.0")) if net_sales > Decimal("0.0") else Decimal("0.0")

    return {
        "status": "success",
        "data": {
            "gross_sales_cop": round(float(gross_sales), 2),
            "discounts_cop": round(float(total_disc), 2),
            "net_sales_cop": round(float(net_sales), 2),
            "cogs_total_cop": round(float(total_cogs), 2),
            "gross_margin_cop": round(float(gross_margin), 2),
            "margin_percentage": round(float(margin_pct), 2),
            "patrimonial_breakdown": {
                "nebulae": {
                    "net_sales_cop": round(float(nebulae_sales), 2),
                    "cogs_cop": round(float(nebulae_cogs), 2),
                    "margin_cop": round(float(nebulae_sales - nebulae_cogs), 2),
                },
                "mau": {
                    "net_sales_cop": round(float(mau_sales), 2),
                    "cogs_cop": round(float(mau_cogs), 2),
                    "margin_cop": round(float(mau_sales - mau_cogs), 2),
                }
            }
        }
    }
