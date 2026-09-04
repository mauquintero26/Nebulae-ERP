"""
backfill_fase1b.py — Migración JSON → Tablas Normalizadas (Fase 1B)

Modos:
  --dry-run       : muestra estadísticas sin escribir nada
  --profile       : incluye timing por tabla
  --batch-id <ID> : etiqueta personalizada del lote (default: timestamp)
  --rollback-batch <ID> : revierte EXACTAMENTE ese lote
  --table <nombre>: solo migra esa tabla (por defecto todas)

Fuentes JSON → Destino normalizado:
  customer_requests.productos    → customer_request_lines
  sales_quotations.productos     → sales_quotation_lines
  sale_orders.productos          → sale_order_lines_erp
  purchase_orders_full.productos → purchase_order_lines
  goods_receipts.productos       → goods_receipt_lines

Invariantes de seguridad:
  - Los campos JSON originales NUNCA se tocan ni anulan.
  - source = 'BACKFILL' para todas las líneas creadas por este script.
  - El rollback se bloquea si existen dependencias posteriores.
"""
import os, sys, json, time, argparse, datetime, logging
from decimal import Decimal, InvalidOperation

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("ERROR: psycopg2 no instalado. Ejecutar: pip install psycopg2-binary")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("backfill")


def get_conn():
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("ERROR: Ninguna variable DATABASE_URL o TEST_DATABASE_URL definida.")
    return psycopg2.connect(url)


def safe_decimal(val, default=None):
    if val is None:
        return default
    try:
        return Decimal(str(val))
    except (InvalidOperation, ValueError):
        return default


def _parse_productos(row_val):
    """Parsea el campo productos (puede ser lista o string JSON)."""
    if row_val is None:
        return []
    if isinstance(row_val, list):
        return row_val
    try:
        result = json.loads(row_val)
        return result if isinstance(result, list) else []
    except Exception:
        return []


def migrate_customer_request_lines(cur, batch_id, dry_run):
    t0 = time.time()
    cur.execute(
        "SELECT id, productos FROM customer_requests "
        "WHERE productos IS NOT NULL AND jsonb_typeof(productos::jsonb) = 'array' "
        "AND productos::text != '[]'"
    )
    rows = cur.fetchall()
    migrated = skipped = ambiguous = failed = 0
    for row in rows:
        items = _parse_productos(row["productos"])
        if not items:
            skipped += 1
            continue
        for item in items:
            sku_id = item.get("sku_id") or item.get("id")
            desc   = (item.get("name") or item.get("description") or item.get("producto") or "")[:300]
            qty    = safe_decimal(item.get("qty") or item.get("quantity") or item.get("cantidad"), Decimal("1"))
            p_usd  = safe_decimal(item.get("price_usd") or item.get("unit_price_usd"))
            p_cop  = safe_decimal(item.get("price_cop") or item.get("unit_price_cop") or item.get("precio"))
            if sku_id is None:
                ambiguous += 1
            if not dry_run:
                try:
                    cur.execute(
                        "INSERT INTO customer_request_lines "
                        "(cr_id,sku_id,description,quantity,unit_price_usd,unit_price_cop,"
                        " source,migration_batch_id,created_at) "
                        "VALUES (%s,%s,%s,%s,%s,%s,'BACKFILL',%s,NOW())",
                        (row["id"], sku_id, desc or None, qty, p_usd, p_cop, batch_id)
                    )
                    migrated += 1
                except Exception as e:
                    failed += 1
                    log.warning("  crl cr_id=%s: %s", row["id"], e)
            else:
                migrated += 1
    return {"table": "customer_request_lines", "migrated": migrated,
            "skipped": skipped, "ambiguous": ambiguous, "failed": failed,
            "elapsed_s": round(time.time() - t0, 2)}


def migrate_sales_quotation_lines(cur, batch_id, dry_run):
    t0 = time.time()
    cur.execute(
        "SELECT id, productos FROM sales_quotations "
        "WHERE productos IS NOT NULL AND jsonb_typeof(productos::jsonb) = 'array' "
        "AND productos::text != '[]'"
    )
    rows = cur.fetchall()
    migrated = skipped = ambiguous = failed = 0
    for row in rows:
        items = _parse_productos(row["productos"])
        if not items:
            skipped += 1
            continue
        for item in items:
            sku_id   = item.get("sku_id") or item.get("id")
            desc     = (item.get("name") or item.get("description") or "")[:300]
            qty      = safe_decimal(item.get("qty") or item.get("quantity"), Decimal("1"))
            p_usd    = safe_decimal(item.get("price_usd") or item.get("unit_price_usd"))
            p_cop    = safe_decimal(item.get("price_cop") or item.get("unit_price_cop") or item.get("precio"))
            desc_pct = safe_decimal(item.get("descuento_pct") or item.get("discount"), Decimal("0"))
            if sku_id is None:
                ambiguous += 1
            if not dry_run:
                try:
                    cur.execute(
                        "INSERT INTO sales_quotation_lines "
                        "(sq_id,sku_id,description,quantity,unit_price_usd,unit_price_cop,"
                        " descuento_pct,source,migration_batch_id,created_at) "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s,'BACKFILL',%s,NOW())",
                        (row["id"], sku_id, desc or None, qty, p_usd, p_cop, desc_pct, batch_id)
                    )
                    migrated += 1
                except Exception as e:
                    failed += 1
                    log.warning("  sql sq_id=%s: %s", row["id"], e)
            else:
                migrated += 1
    return {"table": "sales_quotation_lines", "migrated": migrated,
            "skipped": skipped, "ambiguous": ambiguous, "failed": failed,
            "elapsed_s": round(time.time() - t0, 2)}


def migrate_sale_order_lines_erp(cur, batch_id, dry_run):
    t0 = time.time()
    cur.execute(
        "SELECT id, productos FROM sale_orders "
        "WHERE productos IS NOT NULL AND jsonb_typeof(productos::jsonb) = 'array' "
        "AND productos::text != '[]'"
    )
    rows = cur.fetchall()
    migrated = skipped = ambiguous = failed = 0
    for row in rows:
        items = _parse_productos(row["productos"])
        if not items:
            skipped += 1
            continue
        for item in items:
            sku_id   = item.get("sku_id") or item.get("id")
            desc     = (item.get("name") or item.get("description") or "")[:300]
            qty      = safe_decimal(item.get("qty") or item.get("quantity"), Decimal("1"))
            p_cop    = safe_decimal(item.get("price_cop") or item.get("unit_price_cop") or item.get("precio"), Decimal("0"))
            desc_pct = safe_decimal(item.get("descuento_pct") or item.get("discount"), Decimal("0"))
            if sku_id is None:
                ambiguous += 1
            if not dry_run:
                try:
                    cur.execute(
                        "INSERT INTO sale_order_lines_erp "
                        "(so_id,sku_id,description,quantity,unit_price_cop,"
                        " descuento_pct,source,migration_batch_id,created_at) "
                        "VALUES (%s,%s,%s,%s,%s,%s,'BACKFILL',%s,NOW())",
                        (row["id"], sku_id, desc or None, qty, p_cop, desc_pct, batch_id)
                    )
                    migrated += 1
                except Exception as e:
                    failed += 1
                    log.warning("  sol so_id=%s: %s", row["id"], e)
            else:
                migrated += 1
    return {"table": "sale_order_lines_erp", "migrated": migrated,
            "skipped": skipped, "ambiguous": ambiguous, "failed": failed,
            "elapsed_s": round(time.time() - t0, 2)}


def migrate_purchase_order_lines(cur, batch_id, dry_run):
    t0 = time.time()
    cur.execute(
        "SELECT id, productos FROM purchase_orders_full "
        "WHERE productos IS NOT NULL AND jsonb_typeof(productos::jsonb) = 'array' "
        "AND productos::text != '[]'"
    )
    rows = cur.fetchall()
    migrated = skipped = ambiguous = failed = 0
    for row in rows:
        items = _parse_productos(row["productos"])
        if not items:
            skipped += 1
            continue
        for item in items:
            sku_id   = item.get("sku_id") or item.get("id")
            desc     = (item.get("name") or item.get("description") or "")[:300]
            qty_ord  = safe_decimal(item.get("qty") or item.get("quantity"), Decimal("1"))
            c_usd    = safe_decimal(item.get("cost_usd") or item.get("unit_cost_usd"))
            c_cop    = safe_decimal(item.get("cost_cop") or item.get("unit_cost_cop") or item.get("costo"))
            qty_rec  = safe_decimal(item.get("qty_recibida") or item.get("qty_received"), Decimal("0"))
            if sku_id is None:
                ambiguous += 1
            if not dry_run:
                try:
                    cur.execute(
                        "INSERT INTO purchase_order_lines "
                        "(pec_id,sku_id,description,quantity_ordered,unit_cost_usd,"
                        " unit_cost_cop,quantity_received,source,migration_batch_id,created_at) "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s,'BACKFILL',%s,NOW())",
                        (row["id"], sku_id, desc or None, qty_ord, c_usd, c_cop, qty_rec, batch_id)
                    )
                    migrated += 1
                except Exception as e:
                    failed += 1
                    log.warning("  pol pec_id=%s: %s", row["id"], e)
            else:
                migrated += 1
    return {"table": "purchase_order_lines", "migrated": migrated,
            "skipped": skipped, "ambiguous": ambiguous, "failed": failed,
            "elapsed_s": round(time.time() - t0, 2)}


def migrate_goods_receipt_lines(cur, batch_id, dry_run):
    t0 = time.time()
    cur.execute(
        "SELECT id, productos, receipt_type FROM goods_receipts "
        "WHERE productos IS NOT NULL AND jsonb_typeof(productos::jsonb) = 'array' "
        "AND productos::text != '[]'"
    )
    rows = cur.fetchall()
    migrated = skipped = ambiguous = failed = 0
    for row in rows:
        items = _parse_productos(row["productos"])
        if not items:
            skipped += 1
            continue
        rt = row["receipt_type"] or "FISICA"
        for item in items:
            sku_id  = item.get("sku_id") or item.get("id")
            desc    = (item.get("name") or item.get("description") or "")[:300]
            qty_exp = safe_decimal(item.get("qty_esperada") or item.get("qty") or item.get("quantity"), Decimal("0"))
            qty_rec = safe_decimal(item.get("qty_recibida") or item.get("qty_received"), Decimal("0"))
            qty_rej = safe_decimal(item.get("qty_rejected") or item.get("qty_rechazada"), Decimal("0"))
            qty_qua = safe_decimal(item.get("qty_quarantine") or item.get("qty_cuarentena"), Decimal("0"))
            c_cop   = safe_decimal(item.get("unit_cost_cop") or item.get("costo"))
            if sku_id is None:
                ambiguous += 1
            if not dry_run:
                try:
                    cur.execute(
                        "INSERT INTO goods_receipt_lines "
                        "(gr_id,sku_id,description,quantity_expected,quantity_received,"
                        " quantity_rejected,quantity_quarantine,unit_cost_cop,receipt_type,"
                        " source,migration_batch_id,created_at) "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'BACKFILL',%s,NOW())",
                        (row["id"], sku_id, desc or None, qty_exp, qty_rec,
                         qty_rej, qty_qua, c_cop, rt, batch_id)
                    )
                    migrated += 1
                except Exception as e:
                    failed += 1
                    log.warning("  grl gr_id=%s: %s", row["id"], e)
            else:
                migrated += 1
    return {"table": "goods_receipt_lines", "migrated": migrated,
            "skipped": skipped, "ambiguous": ambiguous, "failed": failed,
            "elapsed_s": round(time.time() - t0, 2)}


DEPENDENT_CHECKS = [
    ("goods_receipt_line_allocations", "goods_receipt_lines",
     "SELECT COUNT(*) FROM goods_receipt_line_allocations grla "
     "JOIN goods_receipt_lines grl ON grl.id = grla.gr_line_id "
     "WHERE grl.migration_batch_id = %s AND grl.source = 'BACKFILL'"),
    ("procurement_allocations (via po_line)", "purchase_order_lines",
     "SELECT COUNT(*) FROM procurement_allocations pa "
     "JOIN purchase_order_lines pol ON pol.id = pa.po_line_id "
     "WHERE pol.migration_batch_id = %s AND pol.source = 'BACKFILL'"),
    ("procurement_allocations (via sol)", "sale_order_lines_erp",
     "SELECT COUNT(*) FROM procurement_allocations pa "
     "JOIN sale_order_lines_erp sol ON sol.id = pa.sale_order_line_id "
     "WHERE sol.migration_batch_id = %s AND sol.source = 'BACKFILL'"),
    ("inventory_reservations", "sale_order_lines_erp",
     "SELECT COUNT(*) FROM inventory_reservations ir "
     "JOIN sale_order_lines_erp sol ON sol.id = ir.sale_order_line_id "
     "WHERE sol.migration_batch_id = %s AND sol.source = 'BACKFILL'"),
]

TABLES_ORDER = [
    "goods_receipt_lines",
    "purchase_order_lines",
    "sale_order_lines_erp",
    "sales_quotation_lines",
    "customer_request_lines",
]


def rollback_batch(batch_id):
    conn = get_conn()
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    log.info("Verificando dependencias del lote '%s'...", batch_id)
    blocked = False
    for dep_table, src_table, sql in DEPENDENT_CHECKS:
        cur.execute(sql, (batch_id,))
        count = cur.fetchone()["count"]
        if int(count) > 0:
            log.error(
                "ROLLBACK BLOQUEADO: '%s' tiene %d filas que referencian líneas del lote '%s' (desde %s). "
                "Elimine esas dependencias primero.",
                dep_table, count, batch_id, src_table
            )
            blocked = True
    if blocked:
        conn.close()
        sys.exit(1)

    total = 0
    for table in TABLES_ORDER:
        cur.execute(
            f"DELETE FROM {table} WHERE migration_batch_id = %s AND source = 'BACKFILL'",
            (batch_id,)
        )
        n = cur.rowcount
        total += n
        log.info("  %s: %d filas eliminadas", table, n)

    conn.commit()
    cur.close()
    conn.close()
    log.info("Rollback completado. Total: %d filas eliminadas.", total)


def compare_migration(cur, batch_id):
    checks = [
        ("customer_requests con productos", "SELECT COUNT(*) FROM customer_requests WHERE productos IS NOT NULL AND productos::text != '[]'"),
        (f"customer_request_lines batch={batch_id}", f"SELECT COUNT(*) FROM customer_request_lines WHERE migration_batch_id = '{batch_id}'"),
        ("sales_quotations con productos", "SELECT COUNT(*) FROM sales_quotations WHERE productos IS NOT NULL AND productos::text != '[]'"),
        (f"sales_quotation_lines batch={batch_id}", f"SELECT COUNT(*) FROM sales_quotation_lines WHERE migration_batch_id = '{batch_id}'"),
        ("sale_orders con productos", "SELECT COUNT(*) FROM sale_orders WHERE productos IS NOT NULL AND productos::text != '[]'"),
        (f"sale_order_lines_erp batch={batch_id}", f"SELECT COUNT(*) FROM sale_order_lines_erp WHERE migration_batch_id = '{batch_id}'"),
        ("purchase_orders_full con productos", "SELECT COUNT(*) FROM purchase_orders_full WHERE productos IS NOT NULL AND productos::text != '[]'"),
        (f"purchase_order_lines batch={batch_id}", f"SELECT COUNT(*) FROM purchase_order_lines WHERE migration_batch_id = '{batch_id}'"),
        ("goods_receipts con productos", "SELECT COUNT(*) FROM goods_receipts WHERE productos IS NOT NULL AND productos::text != '[]'"),
        (f"goods_receipt_lines batch={batch_id}", f"SELECT COUNT(*) FROM goods_receipt_lines WHERE migration_batch_id = '{batch_id}'"),
    ]
    log.info("── Comparación post-migración ──────────────────────────────")
    for label, sql in checks:
        cur.execute(sql)
        row = cur.fetchone()
        count = row["count"] if isinstance(row, dict) else row[0]
        log.info("  %-55s %d", label, count)

    for table, col in [("customer_requests","productos"), ("sale_orders","productos"),
                        ("purchase_orders_full","productos"), ("goods_receipts","productos")]:
        cur.execute(f"SELECT COUNT(*) FROM {table} WHERE {col} IS NULL")
        row = cur.fetchone()
        n = row["count"] if isinstance(row, dict) else row[0]
        status = "OK" if n == 0 else "WARN"
        log.info("  %s %s.%s: %d filas NULL (JSON intacto=%s)", status, table, col, n, n == 0)


MIGRATIONS = [
    ("customer_request_lines", migrate_customer_request_lines),
    ("sales_quotation_lines",  migrate_sales_quotation_lines),
    ("sale_order_lines_erp",   migrate_sale_order_lines_erp),
    ("purchase_order_lines",   migrate_purchase_order_lines),
    ("goods_receipt_lines",    migrate_goods_receipt_lines),
]


def main():
    parser = argparse.ArgumentParser(description="Backfill Fase 1B: JSON → tablas normalizadas")
    parser.add_argument("--dry-run",        action="store_true")
    parser.add_argument("--profile",        action="store_true")
    parser.add_argument("--batch-id",       default=None)
    parser.add_argument("--rollback-batch", default=None)
    parser.add_argument("--table",          default=None, choices=[t for t, _ in MIGRATIONS])
    args = parser.parse_args()

    if args.rollback_batch:
        rollback_batch(args.rollback_batch)
        return

    batch_id = args.batch_id or f"bf_{datetime.datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
    log.info("=" * 60)
    log.info("Backfill Fase 1B  |  batch_id=%s  |  dry_run=%s", batch_id, args.dry_run)
    log.info("=" * 60)

    conn = get_conn()
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    total_m = total_f = total_a = 0
    for table_name, fn in MIGRATIONS:
        if args.table and table_name != args.table:
            continue
        log.info("Migrando %s...", table_name)
        r = fn(cur, batch_id, args.dry_run)
        total_m += r["migrated"]; total_f += r["failed"]; total_a += r["ambiguous"]
        msg = f"  → {r['migrated']} migrados, {r['ambiguous']} ambiguos, {r['failed']} fallidos"
        if args.profile:
            msg += f" ({r['elapsed_s']}s)"
        log.info(msg)

    if not args.dry_run:
        conn.commit()
        compare_migration(cur, batch_id)
    else:
        conn.rollback()
        log.info("(DRY-RUN: rollback ejecutado — nada escrito)")

    cur.close()
    conn.close()
    log.info("=" * 60)
    log.info("RESUMEN  migradas=%d  ambiguas=%d  fallidas=%d  batch_id=%s",
             total_m, total_a, total_f, batch_id)
    if args.dry_run:
        log.info("(DRY-RUN: no se escribió nada)")
    log.info("=" * 60)
    sys.exit(1 if total_f > 0 else 0)


if __name__ == "__main__":
    main()
