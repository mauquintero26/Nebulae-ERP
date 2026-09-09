"""
app/core/preflight.py -- Nebulae ERP
Verificacion de base de datos ANTES de iniciar Uvicorn.

Pasos:
  1. Abrir conexion via SQLAlchemy usando DATABASE_URL.
  2. Ejecutar SELECT current_database().
  3. Comparar con EXPECTED_DATABASE_NAME (si definida).
  4. Verificar alembic_version.
  5. En produccion: exigir la version exacta autorizada.
  6. Si hay diferencia: cerrar y salir con codigo != 0.
  7. No exponer credenciales en argumentos de proceso ni logs.
  8. No iniciar Uvicorn si cualquier verificacion falla.

Uso:
  python -m app.core.preflight         (standalone check, exit 0 si OK)
  from app.core.preflight import run_preflight_or_abort   (en main.py)
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Optional

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constantes de configuracion
# ---------------------------------------------------------------------------
_PRODUCTION_REQUIRED_VERSION = "fa6_002"  # Version autorizada para produccion


def _mask_url(url: str) -> str:
    """Enmascara credenciales de la URL para logs."""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        scheme = parsed.scheme
        host = parsed.hostname or "?"
        port = f":{parsed.port}" if parsed.port else ""
        path = parsed.path or ""
        return f"{scheme}://***:***@{host}{port}{path}"
    except Exception:
        return "<URL no analizable>"


def _get_env() -> str:
    return os.environ.get(
        "NEBULAE_ENV", os.environ.get("ALEMBIC_ENV", "")
    ).strip().lower()


def _abort(message: str, exit_code: int = 2) -> None:
    """Registra el error y termina el proceso con codigo != 0."""
    logger.critical("PREFLIGHT ABORT [exit=%d]: %s", exit_code, message)
    sys.stderr.write(f"\nPREFLIGHT ABORT: {message}\n\n")
    sys.exit(exit_code)


def run_preflight_or_abort(
    db_url: Optional[str] = None,
    expected_db: Optional[str] = None,
    nebulae_env: Optional[str] = None,
    required_version: Optional[str] = None,
) -> dict:
    """
    Ejecuta la verificacion de base de datos y aborta si falla.

    Args:
        db_url: URL de conexion. Usa DATABASE_URL si no se provee.
        expected_db: Nombre esperado de base. Usa EXPECTED_DATABASE_NAME si no se provee.
        nebulae_env: Ambiente. Usa NEBULAE_ENV si no se provee.
        required_version: Version alembic exigida. Solo aplica en produccion.

    Returns:
        dict con claves: current_db, alembic_version, env (si pasa todas las verificaciones)

    Raises:
        SystemExit con codigo != 0 si cualquier verificacion falla.
    """
    url = db_url or os.environ.get("DATABASE_URL", "").strip()
    exp_db = expected_db or os.environ.get("EXPECTED_DATABASE_NAME", "").strip()
    env = nebulae_env or _get_env()
    req_version = required_version

    # ---------------------------------------------------------------------------
    # Verificaciones de variables de entorno obligatorias en produccion
    # ---------------------------------------------------------------------------
    _DEV_SECRET = "super-secret-key-for-development-change-me"

    if env == "production":
        # 1. NEBULAE_ENV debe estar explicitamente definida (no puede ser vacia)
        _nebulae_env_raw = os.environ.get("NEBULAE_ENV", "").strip()
        if not _nebulae_env_raw or _nebulae_env_raw != "production":
            _abort(
                "NEBULAE_ENV debe ser 'production' en modo productivo. "
                f"Valor actual: '{_nebulae_env_raw}'. El backend no iniciara.",
                exit_code=2,
            )

        # 2. EXPECTED_DATABASE_NAME obligatorio en produccion
        if not exp_db:
            _abort(
                "EXPECTED_DATABASE_NAME es obligatorio en produccion. "
                "Define la base de datos esperada (ej: erpdb) para evitar conexiones incorrectas.",
                exit_code=2,
            )
        logger.info("PREFLIGHT: EXPECTED_DATABASE_NAME='%s' declarado.", exp_db)

        # 3. SECRET_KEY obligatorio y no puede ser el valor de desarrollo
        _secret_key = os.environ.get("SECRET_KEY", "").strip()
        if not _secret_key:
            _abort(
                "SECRET_KEY no esta definida en produccion. El backend no puede iniciar.",
                exit_code=2,
            )
        if _secret_key == _DEV_SECRET:
            _abort(
                "SECRET_KEY tiene el valor de desarrollo. "
                "Genera una clave segura (ej: openssl rand -hex 32) antes de iniciar en produccion.",
                exit_code=2,
            )
        logger.info("PREFLIGHT: SECRET_KEY presente y no es el valor de desarrollo. OK")

        # 4. CORS_ALLOWED_ORIGINS obligatorio en produccion
        _cors = os.environ.get("CORS_ALLOWED_ORIGINS", "").strip()
        if not _cors:
            _abort(
                "CORS_ALLOWED_ORIGINS es obligatorio en produccion. "
                "Define los origenes permitidos separados por coma (ej: https://nebulaekids.com). "
                "El wildcard '*' no puede usarse con allow_credentials=True.",
                exit_code=2,
            )
        logger.info("PREFLIGHT: CORS_ALLOWED_ORIGINS presente. OK")

    if not url:
        _abort(
            "DATABASE_URL no esta definida. El backend no puede iniciar sin una base de datos configurada.",
            exit_code=2,
        )

    masked = _mask_url(url)
    logger.info("PREFLIGHT: Verificando conexion -> %s", masked)

    # Crear engine temporal con timeout corto
    try:
        if url.startswith("sqlite"):
            engine = create_engine(url, connect_args={"check_same_thread": False})
        else:
            engine = create_engine(
                url,
                pool_size=1,
                max_overflow=0,
                pool_timeout=10,
                pool_pre_ping=True,
                connect_args={"connect_timeout": 10},
            )
    except Exception as exc:
        _abort(f"No se pudo crear el engine de base de datos: {exc}", exit_code=2)

    try:
        with engine.connect() as conn:
            # 1. Verificar conexion y base activa
            current_db = conn.execute(text("SELECT current_database()")).scalar()
            logger.info("PREFLIGHT: Base activa = '%s'", current_db)

            # 2. Verificar EXPECTED_DATABASE_NAME
            if exp_db:
                if current_db != exp_db:
                    _abort(
                        f"La base conectada es '{current_db}' pero "
                        f"EXPECTED_DATABASE_NAME='{exp_db}'. "
                        f"Verificar DATABASE_URL. El backend no iniciara.",
                        exit_code=3,
                    )
                logger.info("PREFLIGHT: EXPECTED_DATABASE_NAME='%s' OK", exp_db)

            # 3. Leer alembic_version
            try:
                alembic_version = conn.execute(
                    text("SELECT version_num FROM alembic_version ORDER BY version_num DESC LIMIT 1")
                ).scalar()
            except Exception:
                alembic_version = None

            logger.info("PREFLIGHT: alembic_version = '%s'", alembic_version)

            # 4. En produccion: exigir version autorizada
            if env == "production":
                target_ver = req_version or _PRODUCTION_REQUIRED_VERSION
                if alembic_version != target_ver:
                    _abort(
                        f"El esquema de la base '{current_db}' esta en version "
                        f"'{alembic_version}' pero produccion requiere '{target_ver}'. "
                        f"Ejecute la migracion autorizada antes de iniciar el backend.",
                        exit_code=4,
                    )
                logger.info(
                    "PREFLIGHT: Version '%s' autorizada para produccion. OK",
                    alembic_version,
                )

    except OperationalError as exc:
        # No exponer detalles de conexion (pueden contener credenciales en algunos dialectos)
        _abort(
            f"No se pudo conectar a la base de datos ({masked}). "
            f"Verificar que el servidor este activo y las credenciales sean correctas. "
            f"Detalle: {type(exc).__name__}",
            exit_code=2,
        )
    finally:
        try:
            engine.dispose()
        except Exception:
            pass

    logger.info("PREFLIGHT: Todas las verificaciones pasaron. OK")
    return {
        "current_db": current_db,
        "alembic_version": alembic_version,
        "env": env,
    }


# ---------------------------------------------------------------------------
# Modo standalone: python -m app.core.preflight
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )
    result = run_preflight_or_abort()
    print(
        f"PREFLIGHT OK: db='{result['current_db']}' "
        f"alembic='{result['alembic_version']}' "
        f"env='{result['env']}'"
    )
    sys.exit(0)
