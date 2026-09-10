"""
app/api/v1/debug_db.py -- Nebulae ERP
Endpoint protegido para verificar la base de datos activa.

Solo accesible por usuarios con rol ADMIN.
Solo disponible en ambientes development y staging.
En produccion devuelve 404 (no registrado, invisible).
Nunca expone credenciales: solo nombre de base, version alembic y ambiente.

Uso en ensayo de despliegue (BLOQUE 2 del hardening):
  GET /api/v1/debug/db-info
  Authorization: Bearer <admin_token>

Respuesta esperada en staging:
  {
    "current_database": "erp_staging_20260908_132152",
    "alembic_version": "fa6_002",
    "environment": "staging"
  }
"""

import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.database import get_db
from app.api.dependencies import get_current_user, normalize_role
from app.models.users import User

router = APIRouter()

# Ambientes en los que este endpoint esta disponible
_ALLOWED_ENVS = {"development", "staging", "dev"}


def _get_current_env() -> str:
    """Retorna el ambiente normalizado en minusculas."""
    return os.environ.get(
        "NEBULAE_ENV", os.environ.get("ALEMBIC_ENV", "")
    ).strip().lower()


@router.get("/db-info")
def get_db_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Devuelve informacion de la base de datos activa.
    Requiere rol ADMIN.
    Solo disponible en development y staging.
    En produccion responde 404.
    """
    env = _get_current_env()

    # En produccion: no registrar ni exponer informacion
    if env not in _ALLOWED_ENVS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found",
        )

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

    return {
        "status": "success",
        "data": {
            "current_database": current_db_row,
            "alembic_version": alembic_version,
            "environment": env or "no_declarado",
        },
    }