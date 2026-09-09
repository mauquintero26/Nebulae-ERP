"""
tests/test_cors_config.py
--------------------------
Tests de configuracion CORS por ambiente.

Verifica que:
- En produccion: solo dominios explicitamente autorizados (nunca wildcard)
- En staging: localhost + staging domain
- En development: localhost
- NUNCA combinar wildcard con allow_credentials=True (viola RFC 6454)
- CORS_ALLOWED_ORIGINS tiene precedencia sobre el ambiente
"""
import importlib
import os
import sys
import pathlib
import pytest

_BACKEND = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(_BACKEND))


def _get_cors_origins(nebulae_env: str = "development", cors_allowed_origins: str = "") -> list:
    """Importa la funcion _build_cors_origins con el ambiente dado."""
    # Setear env vars antes de importar el modulo
    old_env = os.environ.get("NEBULAE_ENV")
    old_cors = os.environ.get("CORS_ALLOWED_ORIGINS")

    os.environ["NEBULAE_ENV"] = nebulae_env
    if cors_allowed_origins:
        os.environ["CORS_ALLOWED_ORIGINS"] = cors_allowed_origins
    elif "CORS_ALLOWED_ORIGINS" in os.environ:
        del os.environ["CORS_ALLOWED_ORIGINS"]

    try:
        import main as _main_mod
        importlib.reload(_main_mod)
        origins = _main_mod._build_cors_origins()
        return origins
    finally:
        if old_env is not None:
            os.environ["NEBULAE_ENV"] = old_env
        elif "NEBULAE_ENV" in os.environ:
            del os.environ["NEBULAE_ENV"]
        if old_cors is not None:
            os.environ["CORS_ALLOWED_ORIGINS"] = old_cors
        elif "CORS_ALLOWED_ORIGINS" in os.environ:
            del os.environ["CORS_ALLOWED_ORIGINS"]


class TestCorsProduction:
    def test_production_no_wildcard(self):
        """Produccion NUNCA debe incluir wildcard."""
        origins = _get_cors_origins("production")
        assert "*" not in origins, "Wildcard prohibido en produccion con allow_credentials=True"

    def test_production_includes_main_domain(self):
        """Produccion debe incluir el dominio principal."""
        origins = _get_cors_origins("production")
        assert any("nebulaekids.com" in o for o in origins), \
            f"Dominio productivo no encontrado en: {origins}"

    def test_production_no_localhost(self):
        """Produccion no debe incluir localhost."""
        origins = _get_cors_origins("production")
        assert not any("localhost" in o or "127.0.0.1" in o for o in origins), \
            f"localhost no debe estar en produccion: {origins}"


class TestCorsStaging:
    def test_staging_no_wildcard(self):
        """Staging tampoco puede tener wildcard."""
        origins = _get_cors_origins("staging")
        assert "*" not in origins

    def test_staging_includes_localhost(self):
        """Staging debe permitir localhost para pruebas."""
        origins = _get_cors_origins("staging")
        assert any("localhost" in o or "127.0.0.1" in o for o in origins), \
            f"localhost debe estar en staging: {origins}"


class TestCorsDevelopment:
    def test_development_no_wildcard(self):
        """Development tampoco debe usar wildcard con credentials."""
        origins = _get_cors_origins("development")
        assert "*" not in origins

    def test_development_includes_localhost(self):
        """Development debe incluir localhost."""
        origins = _get_cors_origins("development")
        assert any("localhost" in o or "127.0.0.1" in o for o in origins)


class TestCorsExplicitOverride:
    def test_explicit_cors_origins_override(self):
        """CORS_ALLOWED_ORIGINS tiene precedencia sobre el ambiente."""
        origins = _get_cors_origins(
            "production",
            cors_allowed_origins="https://custom.example.com,https://app.example.com"
        )
        assert "https://custom.example.com" in origins
        assert "https://app.example.com" in origins
        assert "*" not in origins

    def test_explicit_cors_strips_whitespace(self):
        """Los origenes explicitos deben tener espacios eliminados."""
        origins = _get_cors_origins(
            "development",
            cors_allowed_origins="  https://a.com  ,  https://b.com  "
        )
        assert "https://a.com" in origins
        assert "https://b.com" in origins
        # No debe haber cadenas con espacios
        assert all(not o.startswith(" ") and not o.endswith(" ") for o in origins)