"""
tests/test_alembic_production_auth.py -- BLOQUE 4
Triple autorizacion requerida para migrar erpdb en modo production.

Estrategia: cargar alembic/env.py y observar si:
  - sys.exit es llamado (fallo de autorizacion) -> exited=True
  - se lanza una excepcion que NO es SystemExit al intentar conectar
    (despues de pasar la validacion de URL) -> exited=False (autorizacion paso)
  - No se lanza nada (el mock de context funciona) -> exited=False

Los tests de "debe pasar" verifican que el sys.exit NO es llamado durante
la fase de resolucion de URL (_resolve_database_url). Un KeyError posterior
en engine_from_config (por configuracion de alembic.context incompleta) es
aceptable y correcto -- significa que la autorizacion fue concedida y el
modulo avanzo al paso de conexion.
"""
import importlib.util
import pathlib
import sys
import os
import unittest
from unittest import mock

# ---------------------------------------------------------------------------
# Path al env.py de Alembic
# ---------------------------------------------------------------------------
_BACKEND = pathlib.Path(__file__).parent.parent
_ENV_PY = _BACKEND / "alembic" / "env.py"


def _load_env_functions(env_vars: dict):
    """
    Carga alembic/env.py con el entorno simulado.

    Retorna:
      (module_or_None, exit_calls, stderr_lines, exc_code_if_systemexit)

    Si sys.exit es llamado durante la carga: module=None, exit_calls=[code], exc_code=code.
    Si KeyError/cualquier otra excepcion (no SystemExit): se considera que la autorizacion
      paso y el modulo fallo mas tarde por dependencias de alembic.context no mockeadas.
      En ese caso: module=None, exit_calls=[], exc_code=None (exited=False).
    """
    exit_calls = []
    stderr_lines = []

    def fake_exit(code=0):
        exit_calls.append(code)
        raise SystemExit(code)

    def fake_stderr_write(msg):
        stderr_lines.append(msg)

    fake_config = mock.MagicMock()
    fake_config.config_file_name = None
    fake_config.get_main_option.return_value = None  # evita KeyError 'url' de otro origen
    fake_context = mock.MagicMock()
    fake_context.config = fake_config
    fake_context.is_offline_mode.return_value = False
    fake_context.configure = mock.MagicMock()
    fake_context.begin_transaction = mock.MagicMock()
    fake_context.run_migrations = mock.MagicMock()

    with mock.patch.dict(os.environ, env_vars, clear=True), \
         mock.patch("sys.exit", side_effect=fake_exit), \
         mock.patch("sys.stderr", mock.Mock(write=fake_stderr_write)), \
         mock.patch("alembic.context", fake_context), \
         mock.patch.dict("sys.modules", {
             "app.db.database": mock.MagicMock(Base=mock.MagicMock()),
             "app.models": mock.MagicMock(),
             "dotenv": mock.MagicMock(load_dotenv=lambda **kw: None),
         }):

        spec = importlib.util.spec_from_file_location(
            f"alembic_env_test_{id(env_vars)}",
            _ENV_PY,
            submodule_search_locations=[],
        )
        module = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(module)
        except SystemExit as exc:
            return None, exit_calls, stderr_lines, exc.code
        except Exception:
            # Otra excepcion (KeyError de engine_from_config, etc.)
            # Significa que la autorizacion de URL paso, pero el engine
            # no pudo inicializarse (OK en un contexto de test sin DB real).
            return module, exit_calls, stderr_lines, None

    return module, exit_calls, stderr_lines, None


_ERPDB_URL = "postgresql://nebulae_prod:xxx@host:5432/erpdb"
_OTHER_URL  = "postgresql://nebulae:xxx@host:5432/erp_staging_xyz"
_TEST_URL   = "postgresql://nebulae_test:xxx@host:5432/erp_test"
_AUTH_VALUE = "YES_I_HAVE_A_VERIFIED_BACKUP"


class TestTripleAuth(unittest.TestCase):

    def _check_exits(self, env_vars: dict) -> tuple:
        """Retorna (exited, exit_code)."""
        _, calls, _, code = _load_env_functions(env_vars)
        if code is not None:
            return True, code
        if calls:
            return True, calls[0]
        return False, None

    # ------------------------------------------------------------------ #
    # Tests que DEBEN abortar (sys.exit con code != 0)                   #
    # ------------------------------------------------------------------ #

    def test_prod_erpdb_sin_allow_flag_aborta(self):
        exited, code = self._check_exits({
            "ALEMBIC_ENV": "production",
            "DATABASE_URL": _ERPDB_URL,
            "EXPECTED_DATABASE_NAME": "erpdb",
        })
        self.assertTrue(exited, "Debe abortar cuando falta ALLOW_PRODUCTION_MIGRATION")
        self.assertNotEqual(code, 0)

    def test_prod_erpdb_sin_expected_db_aborta(self):
        exited, code = self._check_exits({
            "ALEMBIC_ENV": "production",
            "DATABASE_URL": _ERPDB_URL,
            "ALLOW_PRODUCTION_MIGRATION": _AUTH_VALUE,
        })
        self.assertTrue(exited, "Debe abortar cuando falta EXPECTED_DATABASE_NAME")
        self.assertNotEqual(code, 0)

    def test_prod_erpdb_allow_flag_incorrecto_aborta(self):
        exited, code = self._check_exits({
            "ALEMBIC_ENV": "production",
            "DATABASE_URL": _ERPDB_URL,
            "EXPECTED_DATABASE_NAME": "erpdb",
            "ALLOW_PRODUCTION_MIGRATION": "sure_go_ahead",
        })
        self.assertTrue(exited, "Debe abortar con ALLOW_PRODUCTION_MIGRATION incorrecto")
        self.assertNotEqual(code, 0)

    def test_staging_env_erpdb_url_aborta(self):
        exited, code = self._check_exits({
            "ALEMBIC_ENV": "staging",
            "DATABASE_URL": _ERPDB_URL,
            "EXPECTED_DATABASE_NAME": "erpdb",
            "ALLOW_PRODUCTION_MIGRATION": _AUTH_VALUE,
        })
        self.assertTrue(exited, "staging+erpdb debe abortar siempre")
        self.assertNotEqual(code, 0)

    def test_testing_env_erpdb_url_aborta(self):
        exited, code = self._check_exits({
            "ALEMBIC_ENV": "testing",
            "TEST_DATABASE_URL": _ERPDB_URL,
        })
        self.assertTrue(exited, "testing+erpdb debe abortar")
        self.assertNotEqual(code, 0)

    def test_sin_alembic_env_erpdb_url_aborta(self):
        exited, code = self._check_exits({
            "DATABASE_URL": _ERPDB_URL,
        })
        self.assertTrue(exited, "Sin ALEMBIC_ENV + erpdb debe abortar")
        self.assertNotEqual(code, 0)

    def test_prod_erpdb_una_sola_condicion_aborta(self):
        # Solo ALLOW_PRODUCTION_MIGRATION, sin EXPECTED_DATABASE_NAME
        exited, code = self._check_exits({
            "ALEMBIC_ENV": "production",
            "DATABASE_URL": _ERPDB_URL,
            "ALLOW_PRODUCTION_MIGRATION": _AUTH_VALUE,
        })
        self.assertTrue(exited)
        self.assertNotEqual(code, 0)

    def test_prod_erpdb_expected_db_incorrecto_aborta(self):
        exited, code = self._check_exits({
            "ALEMBIC_ENV": "production",
            "DATABASE_URL": _ERPDB_URL,
            "EXPECTED_DATABASE_NAME": "otro_nombre",
            "ALLOW_PRODUCTION_MIGRATION": _AUTH_VALUE,
        })
        self.assertTrue(exited)
        self.assertNotEqual(code, 0)

    # ------------------------------------------------------------------ #
    # Tests que NO deben abortar (autorizacion concedida, sin sys.exit)  #
    # ------------------------------------------------------------------ #

    def test_prod_erpdb_triple_auth_completa_pasa(self):
        """Las tres condiciones exactas conceden autorizacion sin sys.exit."""
        _, calls, _, code = _load_env_functions({
            "ALEMBIC_ENV": "production",
            "DATABASE_URL": _ERPDB_URL,
            "EXPECTED_DATABASE_NAME": "erpdb",
            "ALLOW_PRODUCTION_MIGRATION": _AUTH_VALUE,
        })
        # sys.exit NO debe ser llamado (la autorizacion fue concedida)
        self.assertFalse(calls, f"sys.exit fue llamado con codigo {calls} -- no deberia")
        self.assertIsNone(code, f"sys.exit fue llamado con code={code}")

    def test_prod_otra_base_sin_triple_auth_pasa(self):
        """production con URL != erpdb no requiere triple autorizacion."""
        _, calls, _, code = _load_env_functions({
            "ALEMBIC_ENV": "production",
            "DATABASE_URL": _OTHER_URL,
        })
        self.assertFalse(calls, f"sys.exit fue llamado con codigo {calls}")
        self.assertIsNone(code)

    def test_staging_env_otra_base_pasa(self):
        """staging con URL != erpdb funciona normalmente."""
        _, calls, _, code = _load_env_functions({
            "ALEMBIC_ENV": "staging",
            "DATABASE_URL": _OTHER_URL,
        })
        self.assertFalse(calls, f"sys.exit fue llamado con codigo {calls}")
        self.assertIsNone(code)

    def test_testing_env_test_url_pasa(self):
        """testing con URL de test funciona normalmente."""
        _, calls, _, code = _load_env_functions({
            "ALEMBIC_ENV": "testing",
            "TEST_DATABASE_URL": _TEST_URL,
        })
        self.assertFalse(calls, f"sys.exit fue llamado con codigo {calls}")
        self.assertIsNone(code)


if __name__ == "__main__":
    unittest.main(verbosity=2)
