"""
WEB-2B.1 — Script de backfill: vincula ecommerce_products.sku_id a product_skus.id

CONTRATO DE SEGURIDAD:
- --dry-run es el modo POR DEFECTO. Se necesita --apply para escribir cambios.
- Solo acepta ejecutarse contra erp_storefront_test. Aborta en erpdb, erp_test y cualquier staging.
- Usa el cargador de entorno canónico (python-dotenv o os.environ), NO lee .env manualmente.
- Valida revisión Alembic antes de escribir: la migración fa_web2b1_001 debe estar aplicada.
- Solo SKU exacto, único y activo (producto padre active=true) es vinculado.
- Transacción atómica: todas las actualizaciones o ninguna.
- Reportes escritos FUERA de Git (directorio /tmp o scripts/reports/).

REGLAS DE BACKFILL:
- Solo cuando la coincidencia es exacta e inequívoca (1:1, SKU activo).
- Cero coincidencias → no_match, registra en reporte.
- Múltiples coincidencias → ambiguous, registra en reporte, NUNCA asigna.
- No modifica purchasable, modalidad ni ninguna otra columna de negocio.

USO:
    cd backend
    python scripts/web2b1_backfill_sku_link.py             # dry-run (sin cambios)
    python scripts/web2b1_backfill_sku_link.py --apply     # escribe cambios
"""
import argparse
import json
import os
import sys
import tempfile
from datetime import datetime
from urllib.parse import urlparse

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Bases de datos PROHIBIDAS — el script aborta si la URL apunta a alguna de estas
FORBIDDEN_DB_NAMES = {"erpdb", "erp_test", "erp_staging", "nebulae_prod"}
REQUIRED_DB_NAME = "erp_storefront_test"

# Revisión Alembic que debe estar aplicada antes del backfill
REQUIRED_ALEMBIC_REVISION = "fa_web2b1_001"


def _mask_url(url: str) -> str:
    """Oculta credenciales en la URL para logging."""
    try:
        p = urlparse(url)
        masked = p._replace(netloc=f"***:***@{p.hostname}:{p.port or 5432}")
        from urllib.parse import urlunparse
        return urlunparse(masked)
    except Exception:
        return "<url_enmascarada>"


def _load_db_url() -> str:
    """
    Carga DATABASE_URL desde el entorno canónico.
    Orden: os.environ → .env via python-dotenv (si disponible) → TEST_DATABASE_URL.
    NUNCA parsea .env manualmente.
    """
    # 1. Entorno explícito
    if "DATABASE_URL" in os.environ:
        return os.environ["DATABASE_URL"]

    # 2. .env via python-dotenv
    try:
        from dotenv import load_dotenv
        load_dotenv()
        if "DATABASE_URL" in os.environ:
            return os.environ["DATABASE_URL"]
    except ImportError:
        pass

    # 3. TEST_DATABASE_URL como fallback de test
    if "TEST_DATABASE_URL" in os.environ:
        return os.environ["TEST_DATABASE_URL"]

    return ""


def _check_alembic_revision(db, required: str) -> bool:
    """Verifica que la revisión Alembic requerida está en alembic_version."""
    try:
        row = db.execute(text("SELECT version_num FROM alembic_version")).fetchone()
        if not row:
            return False
        return required in (row[0] or "")
    except Exception:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="WEB-2B.1 backfill: vincula ecommerce_products.sku_id a product_skus.id"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Aplicar cambios. Sin este flag, corre en modo dry-run (solo reporta).",
    )
    args = parser.parse_args()
    dry_run = not args.apply

    if dry_run:
        print("[DRY-RUN] Modo solo-lectura. Use --apply para escribir cambios.")
    else:
        print("[APPLY] Se escribirán cambios en la base de datos.")

    # ── Cargar URL ────────────────────────────────────────────────────────────
    db_url = _load_db_url()
    if not db_url:
        print(
            "ERROR: No se encontró DATABASE_URL en el entorno ni en .env. "
            "Exporte DATABASE_URL=postgresql://... antes de ejecutar.",
            file=sys.stderr,
        )
        return 2

    db_name = urlparse(db_url).path.lstrip("/").split("?")[0].lower()

    # ── Validación de base de datos ───────────────────────────────────────────
    if db_name in FORBIDDEN_DB_NAMES:
        print(
            f"ERROR CRÍTICO: DATABASE_URL apunta a '{db_name}' que está PROHIBIDA para backfill. "
            f"Solo se permite '{REQUIRED_DB_NAME}'.",
            file=sys.stderr,
        )
        return 3

    if db_name != REQUIRED_DB_NAME:
        print(
            f"ERROR: Esta operación solo se permite en '{REQUIRED_DB_NAME}'. "
            f"DATABASE_URL apunta a '{db_name}'.",
            file=sys.stderr,
        )
        return 3

    print(f"Base de datos validada: {db_name} (permitida)")
    print(f"URL: {_mask_url(db_url)}")

    # ── Conectar ──────────────────────────────────────────────────────────────
    engine = create_engine(db_url)
    DBSession = sessionmaker(bind=engine)
    db = DBSession()

    # ── Validar revisión Alembic ──────────────────────────────────────────────
    if not dry_run:
        if not _check_alembic_revision(db, REQUIRED_ALEMBIC_REVISION):
            print(
                f"ERROR: La migración '{REQUIRED_ALEMBIC_REVISION}' NO está aplicada en '{db_name}'. "
                "Ejecute 'alembic upgrade fa_web2b1_001' antes del backfill.",
                file=sys.stderr,
            )
            db.close()
            return 4

    report = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "dry_run": dry_run,
        "database": db_name,
        "linked": [],
        "no_match": [],
        "ambiguous": [],
        "inactive_sku": [],
        "already_linked": [],
        "errors": [],
    }

    try:
        rows = db.execute(text(
            "SELECT id, nombre, sku, sku_id FROM ecommerce_products "
            "WHERE sku IS NOT NULL AND sku != ''"
        )).fetchall()
        print(f"\nFound {len(rows)} ecommerce_products with a sku field")

        to_link: list[dict] = []

        for ep_id, ep_nombre, ep_sku, ep_sku_id in rows:
            if ep_sku_id is not None:
                report["already_linked"].append({"ep_id": ep_id, "sku": ep_sku, "sku_id": ep_sku_id})
                continue

            # Find matching active ProductSKU (parent product must be active)
            matching = db.execute(text("""
                SELECT ps.id, ps.sku, ps.product_id, p.is_active
                FROM product_skus ps
                JOIN products p ON ps.product_id = p.id
                WHERE ps.sku = :sku
            """), {"sku": ep_sku}).fetchall()

            # Filter to active only
            active_matches = [m for m in matching if m[3]]

            if len(matching) == 0 or len(active_matches) == 0:
                if matching and not active_matches:
                    report["inactive_sku"].append({
                        "ep_id": ep_id, "ep_nombre": ep_nombre, "ep_sku": ep_sku,
                        "note": "SKU existe pero producto padre inactivo",
                    })
                    print(f"  INACTIVE_SKU: ep_id={ep_id} sku='{ep_sku}'")
                else:
                    report["no_match"].append({"ep_id": ep_id, "ep_nombre": ep_nombre, "ep_sku": ep_sku})
                    print(f"  NO_MATCH: ep_id={ep_id} sku='{ep_sku}'")
            elif len(active_matches) > 1:
                report["ambiguous"].append({
                    "ep_id": ep_id,
                    "ep_nombre": ep_nombre,
                    "ep_sku": ep_sku,
                    "matching_sku_ids": [m[0] for m in active_matches],
                })
                print(f"  AMBIGUOUS: ep_id={ep_id} sku='{ep_sku}' → {[m[0] for m in active_matches]}")
            else:
                ps_id = active_matches[0][0]
                print(f"  {'[DRY-RUN] WOULD LINK' if dry_run else 'PENDING LINK'}: "
                      f"ep_id={ep_id} '{ep_nombre}' → sku_id={ps_id}")
                to_link.append({"ep_id": ep_id, "ep_nombre": ep_nombre, "ep_sku": ep_sku, "sku_id": ps_id})
                report["linked"].append({"ep_id": ep_id, "ep_nombre": ep_nombre, "ep_sku": ep_sku, "sku_id": ps_id})

        # ── Apply in single atomic transaction ────────────────────────────────
        if not dry_run and to_link:
            try:
                for link in to_link:
                    db.execute(text(
                        "UPDATE ecommerce_products SET sku_id=:sid, updated_at=NOW() WHERE id=:id"
                    ), {"sid": link["sku_id"], "id": link["ep_id"]})
                db.commit()
                print(f"\n✓ {len(to_link)} registros vinculados atómicamente")
            except Exception as e:
                db.rollback()
                report["errors"].append({"error": str(e), "note": "atomic transaction failed"})
                print(f"ERROR: Transacción atómica falló: {e}", file=sys.stderr)
                return 5

    finally:
        db.close()

    # ── Report — written OUTSIDE Git directory ────────────────────────────────
    try:
        report_dir = os.path.join(tempfile.gettempdir(), "nebulae_backfill_reports")
        os.makedirs(report_dir, exist_ok=True)
        report_path = os.path.join(
            report_dir,
            f"web2b1_backfill_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        )
    except Exception:
        report_path = f"web2b1_backfill_report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)

    print("\n=== WEB-2B.1 BACKFILL REPORT ===")
    print(f"  Ya vinculados:   {len(report['already_linked'])}")
    print(f"  Vinculados ahora: {len(report['linked'])} {'(dry-run, sin cambios)' if dry_run else '(aplicados)'}")
    print(f"  Sin coincidencia: {len(report['no_match'])}")
    print(f"  Ambiguos:        {len(report['ambiguous'])}")
    print(f"  SKU inactivo:    {len(report['inactive_sku'])}")
    print(f"  Errores:         {len(report['errors'])}")
    print(f"  Reporte:         {report_path}")

    if report["ambiguous"] or report["no_match"] or report["inactive_sku"]:
        print("\n[ADVERTENCIA] Casos sin vincular requieren revisión manual. Ver reporte JSON.")

    return 0 if not report["errors"] else 1


if __name__ == "__main__":
    sys.exit(main())
