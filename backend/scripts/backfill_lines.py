"""
backfill_lines.py — Fase 1 Backfill
Migra los campos JSON `productos` de SC, COT, VEN y PEC a las tablas
normalizadas de lineas. Seguro de ejecutar multiples veces (idempotente).

Uso:
    cd backend
    python scripts/backfill_lines.py [--dry-run]
"""
import sys
import os
import datetime
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.db.database import SessionLocal
from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder, PurchaseOrderFull
from app.models.erp_lines import (
    CustomerRequestLine, SalesQuotationLine, SaleOrderLineErp,
    PurchaseOrderLine
)

DRY_RUN = "--dry-run" in sys.argv


def log(msg):
    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}")


def backfill_sc_lines(db):
    """Migra productos JSON de customer_requests a customer_request_lines."""
    records = db.query(CustomerRequest).all()
    created = 0
    for sc in records:
        if not sc.productos:
            continue
        existing_ids = {l.sc_id for l in db.query(CustomerRequestLine).filter(CustomerRequestLine.sc_id == sc.id).all()}
        if sc.id in existing_ids:
            continue  # Ya migrado
        for item in sc.productos:
            line = CustomerRequestLine(
                sc_id=sc.id,
                sku_id=item.get("sku_id"),
                descripcion=item.get("nombre") or item.get("descripcion") or item.get("name"),
                imagen_url=item.get("imagen_url") or item.get("image_url"),
                proveedor_sugerido=item.get("proveedor_sugerido"),
                variante=item.get("variante") or item.get("variant"),
                cantidad=int(item.get("qty") or item.get("cantidad") or item.get("quantity") or 1),
                precio_estimado_usd=item.get("precio_usd") or item.get("price_usd"),
                notas=item.get("notas") or item.get("notes"),
            )
            db.add(line)
            created += 1
    if not DRY_RUN:
        db.commit()
    log(f"SC lines: {created} created ({'DRY RUN' if DRY_RUN else 'committed'})")
    return created


def backfill_cot_lines(db):
    """Migra productos JSON de sales_quotations a sales_quotation_lines."""
    records = db.query(SalesQuotation).all()
    created = 0
    for cot in records:
        if not cot.productos:
            continue
        existing = db.query(SalesQuotationLine).filter(SalesQuotationLine.cot_id == cot.id).first()
        if existing:
            continue  # Ya migrado
        for item in cot.productos:
            line = SalesQuotationLine(
                cot_id=cot.id,
                sku_id=item.get("sku_id"),
                descripcion=item.get("nombre") or item.get("descripcion") or item.get("name"),
                imagen_url=item.get("imagen_url"),
                variante=item.get("variante") or item.get("variant"),
                cantidad=int(item.get("qty") or item.get("cantidad") or item.get("quantity") or 1),
                precio_usd=item.get("precio_usd") or item.get("price_usd"),
                trm_usada=float(cot.trm_rate) if cot.trm_rate else None,
                descuento_pct=float(item.get("descuento_pct") or 0),
                precio_venta_cop=item.get("precio_cop") or item.get("precio_venta_cop"),
                subtotal_cop=item.get("subtotal_cop"),
                notas=item.get("notas"),
            )
            db.add(line)
            created += 1
    if not DRY_RUN:
        db.commit()
    log(f"COT lines: {created} created ({'DRY RUN' if DRY_RUN else 'committed'})")
    return created


def backfill_ven_lines(db):
    """Migra productos JSON de sale_orders a sale_order_lines_erp."""
    records = db.query(SaleOrder).all()
    created = 0
    for ven in records:
        if not ven.productos:
            continue
        existing = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.ven_id == ven.id).first()
        if existing:
            continue  # Ya migrado
        for item in ven.productos:
            line = SaleOrderLineErp(
                ven_id=ven.id,
                sku_id=item.get("sku_id"),
                descripcion=item.get("nombre") or item.get("descripcion") or item.get("name"),
                imagen_url=item.get("imagen_url"),
                variante=item.get("variante") or item.get("variant"),
                cantidad=int(item.get("qty") or item.get("cantidad") or item.get("quantity") or 1),
                precio_venta_cop=item.get("precio_cop") or item.get("precio_venta_cop"),
                subtotal_cop=item.get("subtotal_cop"),
                estado="PENDIENTE",
            )
            db.add(line)
            created += 1
    if not DRY_RUN:
        db.commit()
    log(f"VEN lines: {created} created ({'DRY RUN' if DRY_RUN else 'committed'})")
    return created


def backfill_pec_lines(db):
    """Migra productos JSON de purchase_orders_full a purchase_order_lines."""
    records = db.query(PurchaseOrderFull).all()
    created = 0
    for pec in records:
        if not pec.productos:
            continue
        existing = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.pec_id == pec.id).first()
        if existing:
            continue  # Ya migrado
        for item in pec.productos:
            line = PurchaseOrderLine(
                pec_id=pec.id,
                sku_id=item.get("sku_id"),
                descripcion=item.get("nombre") or item.get("descripcion") or item.get("name"),
                imagen_url=item.get("imagen_url"),
                variante=item.get("variante") or item.get("variant"),
                cantidad_ordenada=int(item.get("qty") or item.get("cantidad") or item.get("quantity") or 1),
                cantidad_recibida=int(item.get("qty_recibida") or 0),
                precio_usd=item.get("precio_usd") or item.get("price_usd"),
                estado="PENDIENTE",
            )
            db.add(line)
            created += 1
    if not DRY_RUN:
        db.commit()
    log(f"PEC lines: {created} created ({'DRY RUN' if DRY_RUN else 'committed'})")
    return created


if __name__ == "__main__":
    log(f"Iniciando backfill de lineas ERP {'(DRY RUN)' if DRY_RUN else ''}...")
    db = SessionLocal()
    try:
        total = 0
        total += backfill_sc_lines(db)
        total += backfill_cot_lines(db)
        total += backfill_ven_lines(db)
        total += backfill_pec_lines(db)
        log(f"Backfill completado. Total lineas creadas: {total}")
    except Exception as e:
        log(f"ERROR: {e}")
        if not DRY_RUN:
            db.rollback()
        raise
    finally:
        db.close()
