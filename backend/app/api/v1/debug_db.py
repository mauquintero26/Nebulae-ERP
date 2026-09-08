"""
app/api/v1/debug_db.py -- Nebulae ERP
Endpoint protegido para verificar la base de datos activa.

Solo accesible por usuarios con rol ADMIN.
Nunca expone credenciales: solo nombre de base, version alembic, y host/puerto.

Uso en ensayo de despliegue (BLOQUE 2 del hardening):
  GET /api/v1/debug/db-info
  Authorization: Bearer <admin_token>

Respuesta esperada en staging:
  {
    "current_database": "erp_staging_20260908_132152",
    "alembic_version": "fa6_002",
    "host": "2.24.90.223",
    "port": 5435,
    "environment": "staging"
  }
"""

import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.database import get_db, SQLALCHEMY_DATABASE_URL
from app.api.dependencies import get_current_user, normalize_role
from app.models.users import User

try:
    from urllib.parse import urlparse as _urlparse
except ImportError:
    _urlparse = None

router = APIRouter()


def _get_db_connection_info() -> dict:
    """Extrae host, puerto y nombre de DB desde DATABASE_URL sin exponer credenciales."""
    try:
        parsed = _urlparse(SQLALCHEMY_DATABASE_URL)
        return {
            "host": parsed.hostname or "local",
            "port": parsed.port or 5432,
            "dbname": (parsed.path or "").lstrip("/").split("?")[0],
        }
    except Exception:
        return {"host": "?", "port": 0, "dbname": "?"}


@router.get("/db-info")
def get_db_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Devuelve informacion de la base de datos activa.
    Requiere rol ADMIN. No expone credenciales.
    """
    canonical_role = normalize_role(current_user.role)
    if canonical_role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores pueden consultar informacion de la base de datos.",
        )

    # current_database()
    current_db_row = db.execute(text("SELECT current_database()")).scalar()

    # alembic_version (puede no existir si la DB no tiene la tabla)
    try:
        alembic_version = db.execute(
            text("SELECT version_num FROM alembic_version ORDER BY version_num DESC LIMIT 1")
        ).scalar()
    except Exception:
        alembic_version = "tabla_no_encontrada"

    conn_info = _get_db_connection_info()

    nebulae_env = os.environ.get("NEBULAE_ENV", os.environ.get("ALEMBIC_ENV", ""))

    return {
        "status": "success",
        "data": {
            "current_database": current_db_row,
            "alembic_version": alembic_version,
            "host": conn_info["host"],
            "port": conn_info["port"],
            "environment": nebulae_env or "no_declarado",
        },
    }