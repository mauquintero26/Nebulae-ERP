"""
backfill_product_web_listings.py -- TD-03 (Parte 1)

Copia los campos de marketing/SEO de ecommerce_products hacia
product_web_listings, emparejando por SKU exacto.

Modos:
  --dry-run : muestra estadisticas sin escribir nada

Filas de ecommerce_products sin sku o con un sku que no existe en
product_skus se reportan como huerfanas y se omiten -- requieren
decision humana (crear el producto faltante o descartarlas). Este
script NUNCA crea productos ni SKUs nuevos.

Idempotente: usa ON CONFLICT (sku_id) DO NOTHING, se puede
re-ejecutar sin duplicar filas.
"""
import os, sys, json, argparse, logging

# Permite ejecutar tanto como `python scripts/backfill_product_web_listings.py`
# (sys.path[0] queda en scripts/, no en backend/) como via pytest (conftest.py
# ya agrega backend/ a sys.path) -- en ambos casos `app.core.preflight` debe
# resolver.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

try:
    import psycopg2
except ImportError:
    sys.exit("ERROR: psycopg2 no instalado. Ejecutar: pip install psycopg2-binary")

from app.core.preflight import _mask_url

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("backfill_pwl")


def get_conn():
    if os.environ.get("TEST_DATABASE_URL"):
        url = os.environ["TEST_DATABASE_URL"]
        source = "TEST_DATABASE_URL"
    elif os.environ.get("DATABASE_URL"):
        url = os.environ["DATABASE_URL"]
        source = "DATABASE_URL"
    else:
        sys.exit("ERROR: Ninguna variable DATABASE_URL o TEST_DATABASE_URL definida.")
    log.info(f"Conectando via {source}: {_mask_url(url)}")
    return psycopg2.connect(url)


def backfill(conn, dry_run: bool = False) -> dict:
    cur = conn.cursor()
    cur.execute("""
        SELECT id, nombre, sku, descripcion_larga, precio_comparacion, descuento_pct, imagenes,
               seo_titulo, seo_descripcion, seo_keywords, codigo_aduana, peso_kg,
               notas_internas, publicado_web, rastrear_inventario,
               impuesto_pct, sub_categoria, variantes, alerta_stock_minimo, created_by
        FROM ecommerce_products
    """)
    rows = cur.fetchall()

    matched = 0
    orphaned = []
    for r in rows:
        oid = r[0]
        onombre = r[1]
        sku_code = r[2]
        # Rows with no SKU (NULL or empty string) are reported as orphaned
        if not sku_code:
            orphaned.append((oid, onombre, sku_code))
            continue

        cur.execute("SELECT id FROM product_skus WHERE sku = %s", (sku_code,))
        sku_row = cur.fetchone()
        if not sku_row:
            orphaned.append((oid, onombre, sku_code))
            continue

        matched += 1
        if not dry_run:
            cur.execute("""
                INSERT INTO product_web_listings
                    (sku_id, descripcion_larga, precio_comparacion, descuento_pct, imagenes,
                     seo_titulo, seo_descripcion, seo_keywords, codigo_aduana, peso_kg,
                     notas_internas, publicado_web, rastrear_inventario,
                     impuesto_pct, sub_categoria, variantes, alerta_stock_minimo, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (sku_id) DO NOTHING
            """, (
                sku_row[0], r[3], r[4], r[5], json.dumps(r[6] or []),
                r[7], r[8], r[9], r[10], r[11], r[12], r[13], r[14],
                r[15], r[16], json.dumps(r[17] or []), r[18], r[19],
            ))

    if not dry_run:
        conn.commit()
    cur.close()
    return {"matched": matched, "orphaned": orphaned}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = get_conn()
    try:
        result = backfill(conn, dry_run=args.dry_run)
        log.info(f"Emparejados: {result['matched']}")
        log.info(f"Huerfanos (sin SKU valido en product_skus, omitidos): {len(result['orphaned'])}")
        if result["orphaned"]:
            log.info(f"Huerfanos ({len(result['orphaned'])}):")
            for oid, onombre, osku in result["orphaned"]:
                log.info(f"  id={oid} nombre={onombre!r} sku={osku!r}")
        if args.dry_run:
            log.info("DRY RUN -- no se escribio nada.")
    finally:
        conn.close()
