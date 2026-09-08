"""
alembic/env.py -- Nebulae ERP
Seleccion explicita y segura del destino de migracion.

Reglas:
  1. load_dotenv(override=False): nunca sobrescribe variables ya en el proceso.
  2. Prioridad de URL:
       a. Si ALEMBIC_ENV=testing  -> usa TEST_DATABASE_URL (obligatoria)
       b. Si ALEMBIC_ENV=staging  -> usa DATABASE_URL      (obligatoria, guarda erpdb)
       c. Si ALEMBIC_ENV=production -> usa DATABASE_URL    (obligatoria, guarda erpdb)
       d. Si ALEMBIC_ENV ausente  -> usa DATABASE_URL; falla si TEST_DATABASE_URL tambien definida
  3. DATABASE_URL y TEST_DATABASE_URL ambas definidas sin ALEMBIC_ENV -> ABORT.
  4. EXPECTED_DATABASE_NAME: verifica current_database() == valor; aborta si no coincide.
  5. Nunca inferir produccion por fallback; sqlite solo si ALEMBIC_ENV=development.
  6. Credenciales no aparecen en logs.
  7. erpdb nunca puede ser destino de migracion automatica.
"""

from logging.config import fileConfig
from urllib.parse import urlparse
import logging
import os
import sys

from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool, text
from alembic import context

# ---------------------------------------------------------------------------
# 1. Configuracion de logging de Alembic
# ---------------------------------------------------------------------------
alembic_config = context.config
if alembic_config.config_file_name is not None:
    fileConfig(alembic_config.config_file_name)

logger = logging.getLogger("alembic.env")

# ---------------------------------------------------------------------------
# 2. Cargar .env SIN sobrescribir variables ya en el proceso
# ---------------------------------------------------------------------------
load_dotenv(override=False)

# ---------------------------------------------------------------------------
# 3. Leer variables de entorno
# ---------------------------------------------------------------------------
ALEMBIC_ENV = os.environ.get("ALEMBIC_ENV", "").strip().lower()
_db_url_env = os.environ.get("DATABASE_URL", "").strip()
_test_url_env = os.environ.get("TEST_DATABASE_URL", "").strip()
_expected_db = os.environ.get("EXPECTED_DATABASE_NAME", "").strip()

# Bases de produccion protegidas que NUNCA deben migrarse automaticamente
_PROTECTED_DB_NAMES = {"erpdb"}

DEV_SQLITE_URL = "sqlite:///./nebulae_local.db"


def _mask_url(url: str) -> str:
    """Devuelve la URL con usuario y contrasena reemplazados por ***."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "?"
        port = parsed.port or ""
        port_str = f":{port}" if port else ""
        path = parsed.path or ""
        scheme = parsed.scheme
        return f"{scheme}://***:***@{host}{port_str}{path}"
    except Exception:
        return "<URL no analizable>"


def _db_name_from_url(url: str) -> str:
    """Extrae el nombre de base de datos de la URL."""
    try:
        path = urlparse(url).path
        return path.lstrip("/").split("?")[0].split("/")[-1]
    except Exception:
        return ""


def _abort(message: str) -> None:
    """Aborta la migracion con un mensaje claro en stderr."""
    logger.error("ALEMBIC ABORT: %s", message)
    sys.stderr.write(f"\nALEMBIC ABORT: {message}\n\n")
    sys.exit(1)


def _resolve_database_url() -> str:
    """
    Resuelve la URL de base de datos para la migracion aplicando
    todas las reglas de seguridad. Retorna la URL definitiva.
    """
    # ------------------------------------------------------------------
    # Modo testing explicito
    # ------------------------------------------------------------------
    if ALEMBIC_ENV == "testing":
        if not _test_url_env:
            _abort("ALEMBIC_ENV=testing pero TEST_DATABASE_URL no esta definida.")
        url = _test_url_env
        logger.info("Alembic modo TESTING -> %s", _mask_url(url))
        return url

    # ------------------------------------------------------------------
    # Modo development explicito (permite sqlite)
    # ------------------------------------------------------------------
    if ALEMBIC_ENV == "development":
        url = _db_url_env or DEV_SQLITE_URL
        logger.info("Alembic modo DEVELOPMENT -> %s", _mask_url(url))
        return url

    # ------------------------------------------------------------------
    # Modo staging o production explicito
    # ------------------------------------------------------------------
    if ALEMBIC_ENV in ("staging", "production"):
        if not _db_url_env:
            _abort(
                f"ALEMBIC_ENV={ALEMBIC_ENV} pero DATABASE_URL no esta definida."
            )
        db_name = _db_name_from_url(_db_url_env)
        if db_name in _PROTECTED_DB_NAMES:
            _abort(
                f"DATABASE_URL apunta a la base protegida '{db_name}'. "
                "Esta base nunca puede migrarse en modo automatizado."
            )
        logger.info("Alembic modo %s -> %s", ALEMBIC_ENV.upper(), _mask_url(_db_url_env))
        return _db_url_env

    # ------------------------------------------------------------------
    # ALEMBIC_ENV no declarado: detectar ambiguedad
    # ------------------------------------------------------------------
    if ALEMBIC_ENV == "":
        # Ambiguedad: ambas URLs definidas sin declaracion de entorno
        if _test_url_env and _db_url_env:
            _abort(
                "DATABASE_URL y TEST_DATABASE_URL estan definidas simultaneamente "
                "sin ALEMBIC_ENV explicito. Declare ALEMBIC_ENV=(testing|staging|"
                "production|development) para evitar migrar la base equivocada."
            )
        if _db_url_env:
            db_name = _db_name_from_url(_db_url_env)
            if db_name in _PROTECTED_DB_NAMES:
                _abort(
                    f"DATABASE_URL apunta a la base protegida '{db_name}'. "
                    "Declare ALEMBIC_ENV explicito antes de continuar."
                )
            logger.info("Alembic (sin ALEMBIC_ENV) -> %s", _mask_url(_db_url_env))
            return _db_url_env
        if _test_url_env:
            _abort(
                "Solo TEST_DATABASE_URL esta definida sin ALEMBIC_ENV=testing. "
                "Declare ALEMBIC_ENV=testing para usar esta base."
            )
        # Sin ninguna URL: solo permitido en development con sqlite
        logger.warning("Sin URL configurada; usando SQLite local de desarrollo.")
        return DEV_SQLITE_URL

    _abort(
        f"ALEMBIC_ENV='{ALEMBIC_ENV}' no es un valor reconocido. "
        "Valores validos: testing, development, staging, production."
    )
    return ""  # unreachable, satisface type checkers


_resolved_url = _resolve_database_url()

# ---------------------------------------------------------------------------
# 4. Configurar URL en Alembic
# ---------------------------------------------------------------------------
alembic_config.set_main_option("sqlalchemy.url", _resolved_url)

# ---------------------------------------------------------------------------
# 5. Metadatos de modelos
# ---------------------------------------------------------------------------
from app.db.database import Base  # noqa: E402
import app.models  # noqa: E402, F401

target_metadata = Base.metadata

# Schema opcional para tests con esquemas aislados
_alembic_schema = os.environ.get("ALEMBIC_SCHEMA", None)


# ---------------------------------------------------------------------------
# 6. Validacion de EXPECTED_DATABASE_NAME (post-conexion)
# ---------------------------------------------------------------------------
def _validate_current_database(connection) -> None:
    """
    Si EXPECTED_DATABASE_NAME esta definida, verifica que la base
    conectada coincida exactamente. Nunca imprime credenciales.
    """
    if not _expected_db:
        return
    row = connection.execute(text("SELECT current_database()")).scalar()
    if row != _expected_db:
        _abort(
            f"La base conectada es '{row}' pero EXPECTED_DATABASE_NAME='{_expected_db}'. "
            "Verificar DATABASE_URL antes de ejecutar la migracion."
        )
    logger.info("Validacion EXPECTED_DATABASE_NAME: '%s' OK", row)


# ---------------------------------------------------------------------------
# 7. Funciones de migracion
# ---------------------------------------------------------------------------
def run_migrations_offline() -> None:
    url = alembic_config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        alembic_config.get_section(alembic_config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Validar base conectada ANTES de migrar
        _validate_current_database(connection)

        if _alembic_schema:
            connection.execute(
                text(f"CREATE SCHEMA IF NOT EXISTS {_alembic_schema}")
            )
            connection.execute(
                text(f"SET search_path TO {_alembic_schema}, public")
            )
            connection.commit()

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()