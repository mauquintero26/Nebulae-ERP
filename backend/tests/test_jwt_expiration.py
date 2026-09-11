"""
tests/test_jwt_expiration.py -- Nebulae ERP
Pruebas automatizadas para expiracion de JWT y manejo de tokens.

Valida:
- ACCESS_TOKEN_EXPIRE_MINUTES configurable por variable de entorno (sin hardcodeo).
- create_access_token calcula la expiracion exacta segun ACCESS_TOKEN_EXPIRE_MINUTES o expires_delta.
- Token expirado es rechazado con 401 por PyJWT / get_current_user.
- Token con firma invalida es rechazado con 401.
- Token fresco generado con expiracion de 480 minutos es valido y decodificable.
- Mock de get_current_user con token expirado lanza HTTPException 401 ("Could not validate credentials").
- Mock de get_current_user con token valido retorna usuario autenticado.
"""

import os
import sys
import importlib
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
import pytest
import jwt
from fastapi import HTTPException

_SECURITY_MODULE = "app.core.security"
_REAL_SECRET = "36751a13db68b42c7ab1c13886c4235734fd45ea9cad506c1eb502238d4e1e8d"


def _reload_sec(env_overrides: dict):
    clean_env = {
        "SECRET_KEY": _REAL_SECRET,
        "NEBULAE_ENV": "production",
        "ALGORITHM": "HS256",
        "ACCESS_TOKEN_EXPIRE_MINUTES": "60",
    }
    clean_env.update(env_overrides)
    with patch.dict(os.environ, clean_env, clear=False):
        if _SECURITY_MODULE in sys.modules:
            del sys.modules[_SECURITY_MODULE]
        return importlib.import_module(_SECURITY_MODULE)


class TestJwtExpiration:
    def test_default_expire_minutes_is_read_from_env(self):
        mod = _reload_sec({"ACCESS_TOKEN_EXPIRE_MINUTES": "480"})
        assert mod.ACCESS_TOKEN_EXPIRE_MINUTES == 480

    def test_create_access_token_uses_expire_minutes(self):
        mod = _reload_sec({"ACCESS_TOKEN_EXPIRE_MINUTES": "480"})
        token = mod.create_access_token(data={"sub": "1", "role": "admin"})
        payload = jwt.decode(token, _REAL_SECRET, algorithms=["HS256"])
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        now = datetime.now(timezone.utc)
        delta = exp - now
        assert 478 <= delta.total_seconds() / 60 <= 482

    def test_expired_token_raises_expired_signature_error(self):
        mod = _reload_sec({"ACCESS_TOKEN_EXPIRE_MINUTES": "60"})
        expired_token = mod.create_access_token(
            data={"sub": "1", "role": "admin"},
            expires_delta=timedelta(minutes=-10)
        )
        with pytest.raises(jwt.ExpiredSignatureError):
            jwt.decode(expired_token, _REAL_SECRET, algorithms=["HS256"])

    def test_tampered_token_raises_invalid_signature_error(self):
        mod = _reload_sec({"ACCESS_TOKEN_EXPIRE_MINUTES": "60"})
        token = mod.create_access_token(data={"sub": "1", "role": "admin"})
        with pytest.raises(jwt.InvalidSignatureError):
            jwt.decode(token, "wrong-secret-key-00000000000000000000000000", algorithms=["HS256"])

    def test_get_current_user_rejects_expired_token(self):
        from app.api.dependencies import get_current_user
        from app.models.users import User
        mod = _reload_sec({"ACCESS_TOKEN_EXPIRE_MINUTES": "60"})
        expired_token = mod.create_access_token(
            data={"sub": "999", "role": "admin"},
            expires_delta=timedelta(minutes=-1)
        )
        mock_db = MagicMock()
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(token=expired_token, db=mock_db)
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Could not validate credentials"

    def test_get_current_user_accepts_fresh_token(self):
        from app.api.dependencies import get_current_user
        from app.models.users import User
        mod = _reload_sec({"ACCESS_TOKEN_EXPIRE_MINUTES": "480"})
        fresh_token = mod.create_access_token(data={"sub": "999", "role": "admin"})
        
        mock_db = MagicMock()
        mock_user = MagicMock(spec=User)
        mock_user.id = 999
        mock_user.role = "Admin"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        user = get_current_user(token=fresh_token, db=mock_db)
        assert user.id == 999