"""
WEB-2B.1 — Script de backfill: vincula ecommerce_products.sku_id a product_skus.id

Reglas de backfill:
- Solo cuando la coincidencia es exacta e inequívoca (1:1).
- Si ecommerce_products.sku coincide con exactamente UN ProductSKU.sku → vincula.
- Si hay ambigüedad (cero coincidencias o múltiples) → registra en reporte JSON, NUNCA asigna.
- No modifica ninguna otra columna (purchasable, modalidad, etc.) — eso requiere decisión humana.
- NUNCA toca erpdb ni erp_test directamente — solo lee desde DATABASE_URL y escribe en ecommerce_products.

Ejecutar manualmente por el admin con permisos de table owner:
    cd backend
    python scripts/web2b1_backfill_sku_link.py [--dry-run]
"""
import argparse
import json
import sys
from datetime import datetime
from decimal import Decimal

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

TARGET_DB_FORBIDDEN = {"erp_test"}  # erpdb es permitido (es donde vive ecommerce_products)


def _mask_url(url: str) -> str:
    from urllib.parse import urlparse, urlunparse
    p = urlparse(url)
    masked = p._replace(netloc=f"***:***@{p.hostname}:{p.port}")
    return urlunparse(masked)


def main():
    parser = argparse.ArgumentParser(description="WEB-2B.1 backfill: link ecommerce_products.sku_id to product_skus")
    parser.add_argument("--dry-run", action="store_true", help="No escribir ningún cambio. Solo reportar.")
    args = parser.parse_args()

    # Load DATABASE_URL
    db_url = None
    try:
        with open(".env") as f:
            for line in f:
                if line.startswith("DATABASE_URL="):
                    db_url = line.strip().split("=", 1)[1]
                    break
    except FileNotFoundError:
        print("ERROR: .env not found. Run from backend/ directory.", file=sys.stderr)
        sys.exit(1)

    if not db_url:
        print("ERROR: DATABASE_URL not in .env", file=sys.stderr)
        sys.exit(1)

    # Verify not erp_test
    from urllib.parse import urlparse
    db_name = urlparse(db_url).path.lstrip("/").split("?")[0]
    if db_name in TARGET_DB_FORBIDDEN:
        print(f"ERROR: DATABASE_URL points to {db_name} which is forbidden for backfill.", file=sys.stderr)
        sys.exit(1)

    print(f"{'[DRY-RUN] ' if args.dry_run else ''}Connecting to {_mask_url(db_url)} (db={db_name})")

    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    db = Session()

    report = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "dry_run": args.dry_run,
        "database": db_name,
        "linked": [],
        "no_match": [],
        "ambiguous": [],
        "already_linked": [],
        "errors": [],
    }

    try:
        # Get all ecommerce_products with a sku but no sku_id
        rows = db.execute(text(
            "SELECT id, nombre, sku, sku_id FROM ecommerce_products WHERE sku IS NOT NULL AND sku != ''"
        )).fetchall()
        print(f"Found {len(rows)} ecommerce_products with SKU field")

        for ep_id, ep_nombre, ep_sku, ep_sku_id in rows:
            if ep_sku_id is not None:
                report["already_linked"].append({"ep_id": ep_id, "sku": ep_sku, "sku_id": ep_sku_id})
                continue

            # Find matching ProductSKU
            matching = db.execute(text(
                "SELECT id, sku, product_id FROM product_skus WHERE sku = :sku"
            ), {"sku": ep_sku}).fetchall()

            if len(matching) == 0:
                report["no_match"].append({"ep_id": ep_id, "ep_nombre": ep_nombre, "ep_sku": ep_sku})
                print(f"  NO_MATCH: ep_id={ep_id} sku='{ep_sku}'")
            elif len(matching) > 1:
                report["ambiguous"].append({
                    "ep_id": ep_id,
                    "ep_nombre": ep_nombre,
                    "ep_sku": ep_sku,
                    "matching_sku_ids": [m[0] for m in matching]
                })
                print(f"  AMBIGUOUS: ep_id={ep_id} sku='{ep_sku}' → {[m[0] for m in matching]}")
            else:
                ps_id = matching[0][0]
                if args.dry_run:
                    print(f"  [DRY-RUN] WOULD LINK: ep_id={ep_id} '{ep_nombre}' → sku_id={ps_id}")
                else:
                    try:
                        db.execute(text(
                            "UPDATE ecommerce_products SET sku_id=:sid, updated_at=NOW() WHERE id=:id"
                        ), {"sid": ps_id, "id": ep_id})
                        print(f"  LINKED: ep_id={ep_id} '{ep_nombre}' → sku_id={ps_id}")
                    except Exception as e:
                        report["errors"].append({"ep_id": ep_id, "ep_sku": ep_sku, "error": str(e)})
                        print(f"  ERROR: ep_id={ep_id} sku='{ep_sku}' error={e}")
                        db.rollback()
                        continue

                report["linked"].append({"ep_id": ep_id, "ep_nombre": ep_nombre, "ep_sku": ep_sku, "sku_id": ps_id})

        if not args.dry_run:
            db.commit()

    finally:
        db.close()

    # Write report
    report_path = f"scripts/web2b1_backfill_report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    print("\n=== WEB-2B.1 BACKFILL REPORT ===")
    print(f"  Already linked:  {len(report['already_linked'])}")
    print(f"  Newly linked:    {len(report['linked'])}")
    print(f"  No match:        {len(report['no_match'])}")
    print(f"  Ambiguous:       {len(report['ambiguous'])}")
    print(f"  Errors:          {len(report['errors'])}")
    print(f"  Report saved:    {report_path}")

    if report["ambiguous"] or report["no_match"]:
        print("\n[ADVERTENCIA] Casos sin vincular requieren revisión manual. Ver reporte JSON.")

    return 0 if not report["errors"] else 1


if __name__ == "__main__":
    sys.exit(main())
