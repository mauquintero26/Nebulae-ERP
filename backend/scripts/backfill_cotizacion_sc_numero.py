"""
backfill_cotizacion_sc_numero.py -- Repara Cotizaciones (sales_quotations) que
quedaron con sc_numero/customer_name/etc. vacios pese a tener sc_id, por el
bug en create_cotizacion() (app/api/v1/erp_ventas.py) que confiaba ciegamente
en lo que mandara el body del cliente en vez de derivar esos campos de la
Solicitud de Cliente (CustomerRequest) real vinculada por sc_id.

Caso real reportado: COT-20260188 mostraba "SC-8" como chip de Origen en vez
de "SC-20260317" (el numero real de la SC id=8), porque sc_numero quedaba
NULL -- el frontend cae a `SC-${sc_id}` cuando sc_numero viene vacio.

El endpoint ya fue corregido (deriva estos campos del lado del servidor
cuando sc_id esta presente). Este script repara, una sola vez, los registros
que ya habian quedado mal guardados antes del fix.

Uso:
    python scripts/backfill_cotizacion_sc_numero.py --dry-run   (solo reporta)
    python scripts/backfill_cotizacion_sc_numero.py             (aplica)

Alcance / reglas de seguridad:
  - Candidatas: sales_quotations con sc_id IS NOT NULL Y (sc_numero vacio/nulo
    O customer_name vacio/nulo).
  - Por cada candidata, busca la CustomerRequest real (por sc_id) y rellena
    UNICAMENTE los campos que esten vacios/nulos en la cotizacion
    (sc_numero, customer_id, customer_name, customer_phone, customer_email,
    customer_address) con el valor de la Solicitud. NUNCA pisa un valor que
    ya este presente en la cotizacion (p.ej. si alguien corrigio el telefono
    a mano via PATCH despues de creada) -- esto es reparacion de datos
    faltantes, no una resincronizacion forzada.
  - Si la Solicitud vinculada no existe (sc_id huerfano), se reporta y la
    cotizacion se deja intacta -- no hay de donde derivar.
  - No es una migracion de esquema: no usa Alembic, no crea/altera columnas.
    Se conecta con la config normal del backend (app.db.database.SessionLocal
    -> variable de entorno DATABASE_URL), que en este Mirror ya apunta a
    erp_test (ver backend/.env).
"""
import os
import sys
import argparse

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from sqlalchemy import or_

from app.db.database import SessionLocal, SQLALCHEMY_DATABASE_URL
from app.models.erp_documents import SalesQuotation, CustomerRequest
from app.core.preflight import _mask_url

FIELDS = (
    "sc_numero", "customer_id", "customer_name",
    "customer_phone", "customer_email", "customer_address",
)


def _blank(v) -> bool:
    return v is None or (isinstance(v, str) and v.strip() == "")


def main():
    parser = argparse.ArgumentParser(
        description="Backfill: repara sc_numero/customer_* en sales_quotations desde su CustomerRequest real"
    )
    parser.add_argument("--dry-run", action="store_true", help="Solo reporta, no escribe cambios")
    args = parser.parse_args()

    print(f"Conectando a -> {_mask_url(SQLALCHEMY_DATABASE_URL)}  (dry_run={args.dry_run})")

    db = SessionLocal()
    try:
        candidatas = db.query(SalesQuotation).filter(
            SalesQuotation.sc_id.isnot(None),
            or_(
                SalesQuotation.sc_numero.is_(None),
                SalesQuotation.sc_numero == "",
                SalesQuotation.customer_name.is_(None),
                SalesQuotation.customer_name == "",
            ),
        ).order_by(SalesQuotation.id.asc()).all()

        print(f"Candidatas encontradas (sc_id presente, sc_numero o customer_name vacio): {len(candidatas)}")

        reparadas = []
        sin_sc = []
        sin_cambios = []

        for cot in candidatas:
            sc = db.query(CustomerRequest).filter(CustomerRequest.id == cot.sc_id).first()
            if not sc:
                sin_sc.append(f"{cot.numero} (sc_id={cot.sc_id})")
                print(f"  [SIN SC] {cot.numero} (id={cot.id}, sc_id={cot.sc_id}) -- "
                      f"la Solicitud ya no existe, se deja intacta")
                continue

            sc_values = {
                "sc_numero": sc.numero,
                "customer_id": sc.customer_id,
                "customer_name": sc.customer_name,
                "customer_phone": sc.customer_phone,
                "customer_email": sc.customer_email,
                "customer_address": sc.customer_address,
            }
            cambios = {
                field: sc_val
                for field, sc_val in sc_values.items()
                if _blank(getattr(cot, field)) and not _blank(sc_val)
            }

            if not cambios:
                sin_cambios.append(cot.numero)
                continue

            print(f"  [REPARAR] {cot.numero} (id={cot.id}, sc_id={cot.sc_id} -> {sc.numero}): {cambios}")
            if not args.dry_run:
                for field, val in cambios.items():
                    setattr(cot, field, val)
            reparadas.append(cot.numero)

        if args.dry_run:
            db.rollback()
        else:
            db.commit()

        print("=" * 70)
        print(f"Reparadas:                       {len(reparadas)} -> {reparadas}")
        print(f"Sin SC vinculada (no tocadas):    {len(sin_sc)} -> {sin_sc}")
        print(f"Sin cambios necesarios (completas): {len(sin_cambios)} -> {sin_cambios}")
        if args.dry_run:
            print("(DRY-RUN: no se escribio nada)")
        print("=" * 70)
    finally:
        db.close()


if __name__ == "__main__":
    main()
