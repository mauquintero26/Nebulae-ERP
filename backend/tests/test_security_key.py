"""
tests/test_security_key.py -- Nebulae ERP
Pruebas automatizadas para app/core/security.py

Valida:
  - NEBULAE_ENV=development: permite SECRET_KEY ausente (usa dev-default con warning)
  - NEBULAE_ENV=development: permite SECRET_KEY == dev-default con warning
  - NEBULAE_ENV=staging: SECRET_KEY ausente -> RuntimeError
  - NEBULAE_ENV=staging: SECRET_KEY == dev-default -> RuntimeError
  - NEBULAE_ENV=production: SECRET_KEY ausente -> RuntimeError
  - NEBULAE_ENV=production: SECRET_KEY == dev-default -> RuntimeError
  - NEBULAE_ENV no declarado: SECRET_KEY ausente -> RuntimeError
  - NEBULAE_ENV no declarado: SECRET_KEY == dev-default -> RuntimeError
  - Valor de SECRET_KEY no aparece en mensajes de error ni prefijos del mismo
"""

import os
import sys
import importlib
import pytest
from unittest.mock import patch

# Ruta al modulo
_SECURITY_MODULE = "app.core.security"
_DEV_SECRET = "super-secret-key-for-development-change-me"
_REAL_SECRET = "36751a13db68b42c7ab1c13886c4235734fd45ea9cad506c1eb502238d4e1e8d"


def _reload_security(env_overrides: dict) -> "module":
    """
    Recarga app.core.security con el entorno especificado.
    Retorna el modulo o propaga la excepcion si falla el import.
    """
    clean_env = {
        "SECRET_KEY": "",
        "NEBULAE_ENV": "",
        "ALGORITHM": "HS256",
        "ACCESS_TOKEN_EXPIRE_MINUTES": "60",
    }
    clean_env.update(env_overrides)

    with patch.dict(os.environ, clean_env, clear=False):
        if _SECURITY_MODULE in sys.modules:
            del sys.modules[_SECURITY_MODULE]
        return importlib.import_module(_SECURITY_MODULE)


class TestSecurityKeyHardening:
    """Tests de dureza de SECRET_KEY en security.py."""

    # -------------------------------------------------------------------
    # SK1: development sin SECRET_KEY -> usa dev-default con warning
    # -------------------------------------------------------------------
    def test_sk1_development_allows_missing_key_with_warning(self, caplog):
        import logging
        with caplog.at_level(logging.WARNING):
            mod = _reload_security({
                "NEBULAE_ENV": "development",
                "SECRET_KEY": "",
            })
        assert mod.SECRET_KEY == _DEV_SECRET
        assert any("desarrollo" in r.message.lower() or "development" in r.message.lower()
                   for r in caplog.records), "Deberia emitir warning sobre SECRET_KEY de desarrollo"

    # -------------------------------------------------------------------
    # SK2: development con SECRET_KEY == dev-default -> warning pero OK
    # -------------------------------------------------------------------
    def test_sk2_development_allows_dev_secret_with_warning(self, caplog):
        import logging
        with caplog.at_level(logging.WARNING):
            mod = _reload_security({
                "NEBULAE_ENV": "development",
                "SECRET_KEY": _DEV_SECRET,
            })
        assert mod.SECRET_KEY == _DEV_SECRET
        assert any("desarrollo" in r.message.lower() or "development" in r.message.lower()
                   for r in caplog.records)

    # -------------------------------------------------------------------
    # SK3: development con SECRET_KEY real -> OK sin warnings criticos
    # -------------------------------------------------------------------
    def test_sk3_development_with_real_key_ok(self):
        mod = _reload_security({
            "NEBULAE_ENV": "development",
            "SECRET_KEY": _REAL_SECRET,
        })
        assert mod.SECRET_KEY == _REAL_SECRET

    # -------------------------------------------------------------------
    # SK4: staging sin SECRET_KEY -> RuntimeError
    # -------------------------------------------------------------------
    def test_sk4_staging_missing_key_raises(self):
        with pytest.raises(RuntimeError) as exc_info:
            _reload_security({
                "NEBULAE_ENV": "staging",
                "SECRET_KEY": "",
            })
        assert "SECRET_KEY" in str(exc_info.value)

    # -------------------------------------------------------------------
    # SK5: staging con SECRET_KEY == dev-default -> RuntimeError
    # -------------------------------------------------------------------
    def test_sk5_staging_dev_secret_raises(self):
        with pytest.raises(RuntimeError) as exc_info:
            _reload_security({
                "NEBULAE_ENV": "staging",
                "SECRET_KEY": _DEV_SECRET,
            })
        error_msg = str(exc_info.value)
        assert "SECRET_KEY" in error_msg
        # El valor de la clave NO debe aparecer en el mensaje
        assert _DEV_SECRET not in error_msg, "El valor de SECRET_KEY no debe aparecer en el error"

    # -------------------------------------------------------------------
    # SK6: production sin SECRET_KEY -> RuntimeError
    # -------------------------------------------------------------------
    def test_sk6_production_missing_key_raises(self):
        with pytest.raises(RuntimeError) as exc_info:
            _reload_security({
                "NEBULAE_ENV": "production",
                "SECRET_KEY": "",
            })
        assert "SECRET_KEY" in str(exc_info.value)

    # -------------------------------------------------------------------
    # SK7: production con SECRET_KEY == dev-default -> RuntimeError
    # -------------------------------------------------------------------
    def test_sk7_production_dev_secret_raises(self):
        with pytest.raises(RuntimeError) as exc_info:
            _reload_security({
                "NEBULAE_ENV": "production",
                "SECRET_KEY": _DEV_SECRET,
            })
        error_msg = str(exc_info.value)
        assert "SECRET_KEY" in error_msg
        assert _DEV_SECRET not in error_msg

    # -------------------------------------------------------------------
    # SK8: NEBULAE_ENV no declarado, SECRET_KEY ausente -> RuntimeError
    # -------------------------------------------------------------------
    def test_sk8_no_env_missing_key_raises(self):
        with pytest.raises(RuntimeError) as exc_info:
            _reload_security({
                "NEBULAE_ENV": "",
                "SECRET_KEY": "",
            })
        assert "SECRET_KEY" in str(exc_info.value)

    # -------------------------------------------------------------------
    # SK9: NEBULAE_ENV no declarado, SECRET_KEY == dev-default -> RuntimeError
    # -------------------------------------------------------------------
    def test_sk9_no_env_dev_secret_raises(self):
        with pytest.raises(RuntimeError) as exc_info:
            _reload_security({
                "NEBULAE_ENV": "",
                "SECRET_KEY": _DEV_SECRET,
            })
        error_msg = str(exc_info.value)
        assert "SECRET_KEY" in error_msg
        assert _DEV_SECRET not in error_msg

    # -------------------------------------------------------------------
    # SK10: El valor de SECRET_KEY real no aparece en logs de warning
    # -------------------------------------------------------------------
    def test_sk10_real_key_not_in_logs(self, caplog):
        import logging
        with caplog.at_level(logging.DEBUG):
            _reload_security({
                "NEBULAE_ENV": "development",
                "SECRET_KEY": _REAL_SECRET,
            })
        for record in caplog.records:
            assert _REAL_SECRET not in record.message, (
                f"El valor de SECRET_KEY aparecio en log: {record.message}"
            )

    # -------------------------------------------------------------------
    # SK11: Prefijo de la clave real no aparece en errores
    # -------------------------------------------------------------------
    def test_sk11_key_prefix_not_leaked_in_errors(self):
        """El mensaje de error no debe contener ni prefijo de la clave."""
        with pytest.raises(RuntimeError) as exc_info:
            _reload_security({
                "NEBULAE_ENV": "production",
                "SECRET_KEY": _DEV_SECRET,
            })
        error_msg = str(exc_info.value)
        # No debe contener partes reconocibles del valor de desarrollo
        assert "super-secret" not in error_msg
        assert "change-me" not in error_msg

    # -------------------------------------------------------------------
    # SK12: staging con clave real -> OK, modulo carga correctamente
    # -------------------------------------------------------------------
    def test_sk12_staging_with_real_key_loads_correctly(self):
        mod = _reload_security({
            "NEBULAE_ENV": "staging",
            "SECRET_KEY": _REAL_SECRET,
        })
        assert mod.SECRET_KEY == _REAL_SECRET
        assert mod.ALGORITHM == "HS256"
        assert mod.ACCESS_TOKEN_EXPIRE_MINUTES == 60
        # Verificar que las funciones criticas estan disponibles
        assert callable(mod.verify_password)
        assert callable(mod.get_password_hash)
        assert callable(mod.create_access_token)