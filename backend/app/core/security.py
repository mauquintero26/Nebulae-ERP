"""
app/core/security.py -- Nebulae ERP
Gestion de SECRET_KEY, hashing de contrasenas y JWT.

Reglas de arranque:
  - NEBULAE_ENV=development: se permite SECRET_KEY ausente o de desarrollo (con advertencia).
  - NEBULAE_ENV=staging|production (o ausente, que se trata como no-development):
      * SECRET_KEY ausente  -> RuntimeError en el momento del import.
      * SECRET_KEY == valor de desarrollo -> RuntimeError en el momento del import.
      * El valor nunca se imprime en logs; tampoco prefijos ni fragmentos del mismo.
"""

import os
import logging

import jwt
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constante de desarrollo (usada para DETECCION, nunca como fallback en prod)
# ---------------------------------------------------------------------------
_DEV_SECRET = "super-secret-key-for-development-change-me"

# ---------------------------------------------------------------------------
# Ambiente declarado
# ---------------------------------------------------------------------------
NEBULAE_ENV = os.environ.get("NEBULAE_ENV", "").strip().lower()
_is_development = NEBULAE_ENV == "development"

# ---------------------------------------------------------------------------
# Cargar SECRET_KEY
# ---------------------------------------------------------------------------
_raw_secret = os.environ.get("SECRET_KEY", "").strip()

if _is_development:
    # En development se permite el valor por defecto con advertencia
    if not _raw_secret:
        _raw_secret = _DEV_SECRET
        logger.warning(
            "NEBULAE_ENV=development: usando SECRET_KEY de desarrollo. "
            "NO usar en staging ni produccion."
        )
    elif _raw_secret == _DEV_SECRET:
        logger.warning(
            "NEBULAE_ENV=development: SECRET_KEY es el valor de desarrollo. "
            "NO usar en staging ni produccion."
        )
    SECRET_KEY: str = _raw_secret
else:
    # staging, production, o entorno no declarado: politica estricta
    if not _raw_secret:
        raise RuntimeError(
            "SECRET_KEY no esta definida. "
            "El servicio no puede iniciar en un entorno no-development. "
            "Defina SECRET_KEY en el entorno o archivo .env."
        )
    if _raw_secret == _DEV_SECRET:
        raise RuntimeError(
            "SECRET_KEY tiene el valor por defecto de desarrollo. "
            "El servicio no puede iniciar en un entorno no-development. "
            "Genere una clave segura y configúrela en SECRET_KEY."
        )
    SECRET_KEY = _raw_secret

# ---------------------------------------------------------------------------
# Otros parametros JWT
# ---------------------------------------------------------------------------
ALGORITHM: str = os.environ.get("ALGORITHM", "HS256").strip()
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
    os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "60").strip()
)

# ---------------------------------------------------------------------------
# Contexto de hashing de contrasenas
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)