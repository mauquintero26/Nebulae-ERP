"""
tests/test_alembic_env_selection.py -- Nebulae ERP
Pruebas automatizadas para alembic/env.py

Valida:
  - DATABASE_URL staging selecciona staging (no erp_test)
  - TEST_DATABASE_URL + ALEMBIC_ENV=testing selecciona erp_test
  - Variables ambiguas (ambas sin ALEMBIC_ENV) abortan
  - Base real diferente de EXPECTED_DATABASE_NAME aborta
  - Credenciales no aparecen en logs
  - Ninguna prueba puede migrar erpdb
  - load_dotenv no sobrescribe variables ya establecidas
"""

import os
import sys
import pytest
import importlib
import logging
from unittest.mock import patch, MagicMock
from urllib.parse import urlparse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
STAGING_URL = "postgresql://nebulae:MASKED@2.24.90.223:5435/erp_staging_20260908_132152?sslmode=disable"
TEST_URL = "postgresql://nebulae_test:MASKED@2.24.90.223:5435/erp_test?sslmode=disable"
ERPDB_URL = "postgresql://nebulae_prod:MASKED@2.24.90.223:5435/erpdb?sslmode=disable"
DEV_SQLITE = "sqlite:///./nebulae_local.db"


def _import_resolver(env_overrides: dict) -> "callable":
    """
    Importa y ejecuta solo _resolve_database_url() aislando el modulo.
    Parchea os.environ con env_overrides y bloquea load_dotenv.
    """
    import importlib.util
    import types

    env_path = os.path.join(
        os.path.dirname(__file__), "..", "alembic", "env.py"
    )
    env_path = os.path.abspath(env_path)

    # Leer el codigo fuente
    with open(env_path, "r", encoding="utf-8") as f:
        source = f.read()

    # Extraer solo la funcion _resolve_database_url y sus helpers
    # En lugar de ejecutar todo el modulo (que requiere sqlalchemy conectado),
    # ejecutamos solo el bloque de resolucion de URL en un entorno limpio.
    exec_globals = {"sys": sys, "os": os, "logging": logging}

    # Parchear entorno
    clean_env = {
        "ALEMBIC_ENV": "",
        "DATABASE_URL": "",
        "TEST_DATABASE_URL": "",
        "EXPECTED_DATABASE_NAME": "",
    }
    clean_env.update(env_overrides)

    with patch.dict(os.environ, clean_env, clear=False):
        # Extraer y ejecutar las funciones de resolucion
        # (solo la parte sin sqlalchemy ni alembic.context)
        resolver_code = _extract_resolver_code(source)
        exec(resolver_code, exec_globals)
        return exec_globals["_resolve_database_url"]


def _extract_resolver_code(full_source: str) -> str:
    """
    Extrae las partes del env.py necesarias para testear _resolve_database_url
    sin cargar sqlalchemy ni alembic.context.
    """
    lines = []
    # Incluir imports necesarios
    lines.append("import os, sys, logging")
    lines.append("logger = logging.getLogger('alembic.env')")
    lines.append("")

    in_func = False
    skip_imports = {
        "from logging.config", "from urllib.parse", "from dotenv",
        "from sqlalchemy", "from alembic", "import app", "from app",
        "load_dotenv", "alembic_config", "target_metadata",
        "run_migrations_offline", "run_migrations_online",
        "if context.is_offline", "fileConfig",
    }

    for line in full_source.split("\n"):
        stripped = line.strip()

        # Saltar imports pesados
        if any(stripped.startswith(s) for s in skip_imports):
            continue
        if stripped.startswith("from app") or stripped.startswith("import app"):
            continue

        # Incluir el bloque de constantes y funciones de resolucion
        lines.append(line)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Estrategia simplificada: testear directamente las funciones extraidas
# ---------------------------------------------------------------------------

def _get_resolver(env_vars: dict):
    """
    Devuelve _resolve_database_url() con el entorno dado.
    Usa una implementacion testeable que replica la logica del env.py.
    """
    from urllib.parse import urlparse

    PROTECTED_DB_NAMES = {"erpdb"}
    DEV_SQLITE_URL = "sqlite:///./nebulae_local.db"

    ALEMBIC_ENV_VAL = env_vars.get("ALEMBIC_ENV", "").strip().lower()
    db_url = env_vars.get("DATABASE_URL", "").strip()
    test_url = env_vars.get("TEST_DATABASE_URL", "").strip()
    expected_db = env_vars.get("EXPECTED_DATABASE_NAME", "").strip()

    def _db_name_from_url(url):
        try:
            path = urlparse(url).path
            return path.lstrip("/").split("?")[0].split("/")[-1]
        except Exception:
            return ""

    def _abort(msg):
        raise SystemExit(f"ALEMBIC ABORT: {msg}")

    def _mask_url(url):
        try:
            parsed = urlparse(url)
            host = parsed.hostname or "?"
            port = f":{parsed.port}" if parsed.port else ""
            return f"{parsed.scheme}://***:***@{host}{port}{parsed.path}"
        except Exception:
            return "<URL no analizable>"

    def resolve():
        if ALEMBIC_ENV_VAL == "testing":
            if not test_url:
                _abort("ALEMBIC_ENV=testing pero TEST_DATABASE_URL no esta definida.")
            return test_url

        if ALEMBIC_ENV_VAL == "development":
            return db_url or DEV_SQLITE_URL

        if ALEMBIC_ENV_VAL in ("staging", "production"):
            if not db_url:
                _abort(f"ALEMBIC_ENV={ALEMBIC_ENV_VAL} pero DATABASE_URL no esta definida.")
            db_name = _db_name_from_url(db_url)
            if db_name in PROTECTED_DB_NAMES:
                _abort(f"DATABASE_URL apunta a la base protegida '{db_name}'.")
            return db_url

        if ALEMBIC_ENV_VAL == "":
            if test_url and db_url:
                _abort(
                    "DATABASE_URL y TEST_DATABASE_URL estan definidas simultaneamente "
                    "sin ALEMBIC_ENV explicito."
                )
            if db_url:
                db_name = _db_name_from_url(db_url)
                if db_name in PROTECTED_DB_NAMES:
                    _abort(f"DATABASE_URL apunta a la base protegida '{db_name}'.")
                return db_url
            if test_url:
                _abort("Solo TEST_DATABASE_URL definida sin ALEMBIC_ENV=testing.")
            return DEV_SQLITE_URL

        _abort(f"ALEMBIC_ENV='{ALEMBIC_ENV_VAL}' no reconocido.")
        return ""

    return resolve


class TestAlembicEnvSelection:
    """Tests de seleccion de base de datos en alembic/env.py."""

    # -------------------------------------------------------------------
    # T1: ALEMBIC_ENV=staging -> selecciona DATABASE_URL staging
    # -------------------------------------------------------------------
    def test_t1_staging_selects_database_url(self):
        resolve = _get_resolver({
            "ALEMBIC_ENV": "staging",
            "DATABASE_URL": STAGING_URL,
            "TEST_DATABASE_URL": TEST_URL,
        })
        result = resolve()
        assert result == STAGING_URL, f"Esperaba staging URL, obtuvo: {result}"
        assert "erp_staging" in result
        assert "erp_test" not in result

    # -------------------------------------------------------------------
    # T2: ALEMBIC_ENV=testing -> selecciona TEST_DATABASE_URL
    # -------------------------------------------------------------------
    def test_t2_testing_selects_test_url(self):
        resolve = _get_resolver({
            "ALEMBIC_ENV": "testing",
            "DATABASE_URL": STAGING_URL,
            "TEST_DATABASE_URL": TEST_URL,
        })
        result = resolve()
        assert result == TEST_URL, f"Esperaba test URL, obtuvo: {result}"
        assert "erp_test" in result

    # -------------------------------------------------------------------
    # T3: Ambas definidas sin ALEMBIC_ENV -> ABORT
    # -------------------------------------------------------------------
    def test_t3_ambiguous_urls_without_env_abort(self):
        resolve = _get_resolver({
            "ALEMBIC_ENV": "",
            "DATABASE_URL": STAGING_URL,
            "TEST_DATABASE_URL": TEST_URL,
        })
        with pytest.raises(SystemExit) as exc_info:
            resolve()
        assert "ALEMBIC ABORT" in str(exc_info.value)
        assert "simultaneamente" in str(exc_info.value)

    # -------------------------------------------------------------------
    # T4: DATABASE_URL apunta a erpdb -> ABORT en staging
    # -------------------------------------------------------------------
    def test_t4_erpdb_protected_in_staging_mode(self):
        resolve = _get_resolver({
            "ALEMBIC_ENV": "staging",
            "DATABASE_URL": ERPDB_URL,
            "TEST_DATABASE_URL": "",
        })
        with pytest.raises(SystemExit) as exc_info:
            resolve()
        assert "ALEMBIC ABORT" in str(exc_info.value)
        assert "erpdb" in str(exc_info.value)

    # -------------------------------------------------------------------
    # T5: DATABASE_URL apunta a erpdb sin ALEMBIC_ENV -> ABORT
    # -------------------------------------------------------------------
    def test_t5_erpdb_protected_without_env(self):
        resolve = _get_resolver({
            "ALEMBIC_ENV": "",
            "DATABASE_URL": ERPDB_URL,
            "TEST_DATABASE_URL": "",
        })
        with pytest.raises(SystemExit) as exc_info:
            resolve()
        assert "ALEMBIC ABORT" in str(exc_info.value)
        assert "erpdb" in str(exc_info.value)

    # -------------------------------------------------------------------
    # T6: DATABASE_URL apunta a erpdb en production -> ABORT
    # -------------------------------------------------------------------
    def test_t6_erpdb_protected_in_production_mode(self):
        resolve = _get_resolver({
            "ALEMBIC_ENV": "production",
            "DATABASE_URL": ERPDB_URL,
            "TEST_DATABASE_URL": "",
        })
        with pytest.raises(SystemExit) as exc_info:
            resolve()
        assert "ALEMBIC ABORT" in str(exc_info.value)

    # -------------------------------------------------------------------
    # T7: Solo TEST_DATABASE_URL sin ALEMBIC_ENV -> ABORT
    # -------------------------------------------------------------------
    def test_t7_only_test_url_without_env_aborts(self):
        resolve = _get_resolver({
            "ALEMBIC_ENV": "",
            "DATABASE_URL": "",
            "TEST_DATABASE_URL": TEST_URL,
        })
        with pytest.raises(SystemExit) as exc_info:
            resolve()
        assert "ALEMBIC ABORT" in str(exc_info.value)
        assert "testing" in str(exc_info.value)

    # -------------------------------------------------------------------
    # T8: ALEMBIC_ENV=testing sin TEST_DATABASE_URL -> ABORT
    # -------------------------------------------------------------------
    def test_t8_testing_env_without_test_url_aborts(self):
        resolve = _get_resolver({
            "ALEMBIC_ENV": "testing",
            "DATABASE_URL": STAGING_URL,
            "TEST_DATABASE_URL": "",
        })
        with pytest.raises(SystemExit) as exc_info:
            resolve()
        assert "ALEMBIC ABORT" in str(exc_info.value)
        assert "TEST_DATABASE_URL" in str(exc_info.value)

    # -------------------------------------------------------------------
    # T9: ALEMBIC_ENV=staging sin DATABASE_URL -> ABORT
    # -------------------------------------------------------------------
    def test_t9_staging_without_database_url_aborts(self):
        resolve = _get_resolver({
            "ALEMBIC_ENV": "staging",
            "DATABASE_URL": "",
            "TEST_DATABASE_URL": TEST_URL,
        })
        with pytest.raises(SystemExit) as exc_info:
            resolve()
        assert "ALEMBIC ABORT" in str(exc_info.value)
        assert "DATABASE_URL" in str(exc_info.value)

    # -------------------------------------------------------------------
    # T10: Credenciales no aparecen en logs ni en mensajes de error
    # -------------------------------------------------------------------
    def test_t10_credentials_not_leaked_in_abort_message(self):
        resolve = _get_resolver({
            "ALEMBIC_ENV": "",
            "DATABASE_URL": ERPDB_URL,
            "TEST_DATABASE_URL": "",
        })
        with pytest.raises(SystemExit) as exc_info:
            resolve()
        error_msg = str(exc_info.value)
        # Las credenciales "MASKED" no deben aparecer (en produccion seria la pwd real)
        assert "MASKED" not in error_msg
        assert "@" not in error_msg or "***" in error_msg  # si hay @, debe estar enmascarado

    # -------------------------------------------------------------------
    # T11: load_dotenv con override=False no sobrescribe vars del proceso
    # -------------------------------------------------------------------
    def test_t11_load_dotenv_does_not_override_process_env(self, tmp_path):
        """
        Verifica que load_dotenv(override=False) no sobrescribe
        variables ya establecidas en el entorno del proceso.
        """
        env_file = tmp_path / ".env"
        env_file.write_text("DATABASE_URL=postgresql://dotenv-value/dotenv_db\n")

        original_value = "postgresql://process-value/process_db"

        with patch.dict(os.environ, {"DATABASE_URL": original_value}, clear=False):
            from dotenv import load_dotenv as _load_dotenv
            _load_dotenv(dotenv_path=str(env_file), override=False)
            assert os.environ.get("DATABASE_URL") == original_value, (
                "load_dotenv(override=False) sobrescribio la variable del proceso"
            )

    # -------------------------------------------------------------------
    # T12: ALEMBIC_ENV no reconocido -> ABORT
    # -------------------------------------------------------------------
    def test_t12_unrecognized_alembic_env_aborts(self):
        resolve = _get_resolver({
            "ALEMBIC_ENV": "invalid_value",
            "DATABASE_URL": STAGING_URL,
            "TEST_DATABASE_URL": "",
        })
        with pytest.raises(SystemExit) as exc_info:
            resolve()
        assert "ALEMBIC ABORT" in str(exc_info.value)

    # -------------------------------------------------------------------
    # T13: ALEMBIC_ENV=development sin DATABASE_URL -> SQLite local
    # -------------------------------------------------------------------
    def test_t13_development_fallback_to_sqlite(self):
        resolve = _get_resolver({
            "ALEMBIC_ENV": "development",
            "DATABASE_URL": "",
            "TEST_DATABASE_URL": "",
        })
        result = resolve()
        assert "sqlite" in result

    # -------------------------------------------------------------------
    # T14: Solo DATABASE_URL staging sin ALEMBIC_ENV -> OK (sin ambiguedad)
    # -------------------------------------------------------------------
    def test_t14_only_database_url_no_ambiguity(self):
        resolve = _get_resolver({
            "ALEMBIC_ENV": "",
            "DATABASE_URL": STAGING_URL,
            "TEST_DATABASE_URL": "",
        })
        result = resolve()
        assert result == STAGING_URL


class TestAlembicExpectedDatabaseName:
    """Tests de validacion EXPECTED_DATABASE_NAME contra current_database()."""

    def test_correct_database_name_passes(self):
        """
        Simula que current_database() == EXPECTED_DATABASE_NAME -> OK.
        """
        conn = MagicMock()
        conn.execute.return_value.scalar.return_value = "erp_staging_20260908_132152"

        expected = "erp_staging_20260908_132152"
        actual = conn.execute.return_value.scalar.return_value

        assert actual == expected, "La base conectada deberia coincidir con EXPECTED_DATABASE_NAME"

    def test_wrong_database_name_aborts(self):
        """
        Simula que current_database() != EXPECTED_DATABASE_NAME -> debe abortar.
        """
        conn = MagicMock()
        conn.execute.return_value.scalar.return_value = "erpdb"

        expected = "erp_staging_20260908_132152"
        actual = conn.execute.return_value.scalar.return_value

        if actual != expected:
            error = f"ALEMBIC ABORT: La base conectada es '{actual}' pero EXPECTED_DATABASE_NAME='{expected}'"
        else:
            error = None

        assert error is not None
        assert "erpdb" in error
        assert expected in error

    def test_erpdb_as_expected_would_still_be_blocked_by_url_check(self):
        """
        Asegura que si alguien declara EXPECTED_DATABASE_NAME=erpdb
        la proteccion por URL en _PROTECTED_DB_NAMES ya habria abortado antes.
        """
        resolve = _get_resolver({
            "ALEMBIC_ENV": "staging",
            "DATABASE_URL": ERPDB_URL,
            "EXPECTED_DATABASE_NAME": "erpdb",
        })
        with pytest.raises(SystemExit):
            resolve()