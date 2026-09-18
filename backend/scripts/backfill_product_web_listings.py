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

try:
    import psycopg2
except ImportError:
    sys.exit("ERROR: psycopg2 no instalado. Ejecutar: pip install psycopg2-binary")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("backfill_pwl")


def get_conn():
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("ERROR: Ninguna variable DATABASE_URL o TEST_DATABASE_URL definida.")
    return psycopg2.connect(url)


def backfill(conn, dry_run: bool = False) -> dict:
    cur = conn.cursor()
    cur.execute("""
        SELECT sku, descripcion_larga, precio_comparacion, descuento_pct, imagenes,
               seo_titulo, seo_descripcion, seo_keywords, codigo_aduana, peso_kg,
               notas_internas, publicado_web, rastrear_inventario
        FROM ecommerce_products WHERE sku IS NOT NULL AND sku != ''
    """)
    rows = cur.fetchall()

    matched = 0
    orphaned = []
    for r in rows:
        sku_code = r[0]
        cur.execute("SELECT id FROM product_skus WHERE sku = %s", (sku_code,))
        sku_row = cur.fetchone()
        if not sku_row:
            orphaned.append(sku_code)
            continue

        matched += 1
        if not dry_run:
            cur.execute("""
                INSERT INTO product_web_listings
                    (sku_id, descripcion_larga, precio_comparacion, descuento_pct, imagenes,
                     seo_titulo, seo_descripcion, seo_keywords, codigo_aduana, peso_kg,
                     notas_internas, publicado_web, rastrear_inventario)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (sku_id) DO NOTHING
            """, (
                sku_row[0], r[1], r[2], r[3], json.dumps(r[4] or []),
                r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12],
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
            log.info(f"SKUs huerfanos: {result['orphaned']}")
        if args.dry_run:
            log.info("DRY RUN -- no se escribio nada.")
    finally:
        conn.close()
