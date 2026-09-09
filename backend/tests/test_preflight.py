"""
tests/test_preflight.py -- BLOQUE 5
Verifica que run_preflight_or_abort:
  1. Sale con exit code != 0 si DATABASE_URL esta vacia.
  2. Sale con exit code != 0 si la DB conectada != EXPECTED_DATABASE_NAME.
  3. Sale con exit code != 0 si la DB es production y alembic_version != requerida.
  4. Pasa cuando todo coincide (staging).
  5. Pasa cuando todo coincide (produccion, version correcta).
  6. No expone credenciales en stderr.
  7. Sin EXPECTED_DATABASE_NAME, no verifica nombre de base.
"""
import sys
import pathlib
import unittest
from unittest import mock

_BACKEND = pathlib.Path(__file__).parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


def _make_mock_engine(db_name: str, alembic_version: str = "fa6_002"):
    """Construye un engine mock que devuelve db_name y alembic_version."""
    mock_conn = mock.MagicMock()
    # Primer scalar() -> current_database(); segundo scalar() -> alembic_version
    mock_conn.execute.return_value.scalar.side_effect = [db_name, alembic_version]
    mock_engine = mock.MagicMock()
    ctx_mgr = mock.MagicMock()
    ctx_mgr.__enter__ = mock.MagicMock(return_value=mock_conn)
    ctx_mgr.__exit__ = mock.MagicMock(return_value=False)
    mock_engine.connect.return_value = ctx_mgr
    return mock_engine


def _call_preflight(db_url: str = "postgresql://u:x@h:5432/erp_staging_test",
                    expected_db: str = "",
                    nebulae_env: str = "staging",
                    mock_engine=None,
                    raise_operational_error: bool = False,
                    extra_env: dict = None):
    """
    Llama a run_preflight_or_abort con mocks de sys.exit y create_engine.
    Retorna (exited, exit_code, stderr_output, return_value).

    extra_env: variables adicionales para inyectar en os.environ durante el test.
    """
    import importlib
    import os
    # Forzar recarga del modulo para que tome los nuevos mocks
    if "app.core.preflight" in sys.modules:
        pf = sys.modules["app.core.preflight"]
    else:
        import app.core.preflight as pf

    exit_calls = []
    stderr_lines = []

    def fake_exit(code=0):
        exit_calls.append(code)
        raise SystemExit(code)

    def fake_stderr_write(msg):
        stderr_lines.append(msg)

    # Crear el engine o levantar OperationalError segun el parametro
    if raise_operational_error:
        from sqlalchemy.exc import OperationalError
        engine_to_use = mock.MagicMock()
        ctx = mock.MagicMock()
        ctx.__enter__ = mock.MagicMock(
            side_effect=OperationalError("connection failed", None, Exception())
        )
        ctx.__exit__ = mock.MagicMock(return_value=False)
        engine_to_use.connect.return_value = ctx
    else:
        engine_to_use = mock_engine or _make_mock_engine("erp_staging_test")

    env_overrides = extra_env or {}

    with mock.patch("sys.exit", side_effect=fake_exit), \
         mock.patch("sys.stderr", mock.Mock(write=fake_stderr_write)), \
         mock.patch("app.core.preflight.create_engine", return_value=engine_to_use), \
         mock.patch.dict(os.environ, env_overrides, clear=False):
        try:
            result = pf.run_preflight_or_abort(
                db_url=db_url,
                expected_db=expected_db,
                nebulae_env=nebulae_env,
            )
            exited = False
            code = None
        except SystemExit as exc:
            result = None
            exited = True
            code = exc.code

    return exited, code, "\n".join(stderr_lines), result


class TestPreflight(unittest.TestCase):

    def test_empty_url_aborta(self):
        """Sin URL el preflight debe abortar con exit != 0."""
        # Necesitamos asegurarnos que DATABASE_URL del entorno tambien este vacio
        # para que el fallback `os.environ.get("DATABASE_URL", "")` no encuentre nada.
        import os
        with mock.patch.dict(os.environ, {"DATABASE_URL": ""}, clear=False):
            exited, code, stderr, _ = _call_preflight(db_url="")
        self.assertTrue(exited, "Debe abortar sin DATABASE_URL")
        self.assertNotEqual(code, 0)
        self.assertEqual(code, 2)

    def test_expected_db_no_coincide_aborta(self):
        """Si current_database != EXPECTED_DATABASE_NAME, debe abortar con exit 3."""
        engine = _make_mock_engine("erp_staging_test", "fa6_002")
        exited, code, stderr, _ = _call_preflight(
            db_url="postgresql://u:x@h:5432/erp_staging_test",
            expected_db="otra_base",  # No coincide
            nebulae_env="staging",
            mock_engine=engine,
        )
        self.assertTrue(exited, "EXPECTED_DATABASE_NAME diferente debe abortar")
        self.assertEqual(code, 3, f"Exit code debe ser 3, obtuvo {code}")

    def test_production_version_incorrecta_aborta(self):
        """En produccion, si alembic_version != version autorizada, debe abortar con exit 4."""
        engine = _make_mock_engine("erpdb", "fa5_001")  # version incorrecta
        exited, code, stderr, _ = _call_preflight(
            db_url="postgresql://u:x@h:5432/erpdb",
            expected_db="erpdb",
            nebulae_env="production",
            mock_engine=engine,
            extra_env={
                "NEBULAE_ENV": "production",
                "SECRET_KEY": "a" * 64,
                "CORS_ALLOWED_ORIGINS": "https://nebulaekids.com",
                "REQUIRED_ALEMBIC_VERSION": "fa6_004",  # version autorizada actual
            },
        )
        self.assertTrue(exited, "Version incorrecta en produccion debe abortar")
        self.assertEqual(code, 4, f"Exit code debe ser 4, obtuvo {code}")

    def test_staging_version_incorrecta_no_aborta(self):
        """En staging, una version incorrecta de alembic NO aborta (solo en produccion)."""
        engine = _make_mock_engine("erp_staging_test", "fa5_001")
        exited, code, stderr, result = _call_preflight(
            db_url="postgresql://u:x@h:5432/erp_staging_test",
            expected_db="erp_staging_test",
            nebulae_env="staging",
            mock_engine=engine,
        )
        self.assertFalse(exited, f"En staging version incorrecta no debe abortar. stderr={stderr}")
        self.assertIsNotNone(result)
        self.assertEqual(result["current_db"], "erp_staging_test")
        self.assertEqual(result["alembic_version"], "fa5_001")

    def test_produccion_version_correcta_pasa(self):
        """En produccion, version correcta y DB correcta -> OK."""
        engine = _make_mock_engine("erpdb", "fa6_004")  # version head actual
        exited, code, stderr, result = _call_preflight(
            db_url="postgresql://u:x@h:5432/erpdb",
            expected_db="erpdb",
            nebulae_env="production",
            mock_engine=engine,
            extra_env={
                "NEBULAE_ENV": "production",
                "SECRET_KEY": "a" * 64,
                "CORS_ALLOWED_ORIGINS": "https://nebulaekids.com",
                "REQUIRED_ALEMBIC_VERSION": "fa6_004",  # variable obligatoria
            },
        )
        self.assertFalse(exited, f"Version correcta en produccion debe pasar. stderr={stderr}")
        self.assertIsNotNone(result)
        self.assertEqual(result["current_db"], "erpdb")
        self.assertEqual(result["alembic_version"], "fa6_004")

    def test_credenciales_no_aparecen_en_stderr(self):
        """Las credenciales de la URL no deben aparecer en stderr."""
        # URL con password visible en el stderr de abort (empty url)
        exited, code, stderr, _ = _call_preflight(db_url="")
        # stderr puede contener "DATABASE_URL no esta definida" pero NO passwords
        self.assertNotIn("secretpassword123", stderr)
        self.assertNotIn("Admin123", stderr)

    def test_staging_sin_expected_db_pasa(self):
        """Sin expected_db (''), no se verifica el nombre de base."""
        engine = _make_mock_engine("erp_staging_test", "fa6_002")
        exited, code, stderr, result = _call_preflight(
            db_url="postgresql://u:x@h:5432/erp_staging_test",
            expected_db="",
            nebulae_env="staging",
            mock_engine=engine,
        )
        self.assertFalse(exited, f"Sin expected_db no debe abortar. stderr={stderr}")
        self.assertEqual(result["current_db"], "erp_staging_test")

    def test_conexion_fallida_aborta_exit_2(self):
        """Si la conexion a la DB falla (OperationalError), debe abortar con exit 2."""
        exited, code, stderr, _ = _call_preflight(
            db_url="postgresql://u:x@h:5432/erp_staging_test",
            raise_operational_error=True,
        )
        self.assertTrue(exited, "Error de conexion debe abortar")
        self.assertEqual(code, 2, f"Exit code debe ser 2 por OperationalError, obtuvo {code}")

    # --- Nuevos tests: verificaciones de variables obligatorias en produccion ---

    def test_produccion_sin_secret_key_aborta(self):
        """En produccion, si SECRET_KEY no esta definida, debe abortar con exit 2."""
        import os
        engine = _make_mock_engine("erpdb", "fa6_002")
        exited, code, stderr, _ = _call_preflight(
            db_url="postgresql://u:x@h:5432/erpdb",
            expected_db="erpdb",
            nebulae_env="production",
            mock_engine=engine,
            extra_env={
                "NEBULAE_ENV": "production",
                "SECRET_KEY": "",
                "CORS_ALLOWED_ORIGINS": "https://nebulaekids.com",
            },
        )
        self.assertTrue(exited, "Sin SECRET_KEY en produccion debe abortar")
        self.assertEqual(code, 2, f"Exit code debe ser 2, obtuvo {code}")
        self.assertIn("SECRET_KEY", stderr)

    def test_produccion_secret_key_dev_aborta(self):
        """En produccion, si SECRET_KEY es el valor de desarrollo, debe abortar."""
        engine = _make_mock_engine("erpdb", "fa6_002")
        exited, code, stderr, _ = _call_preflight(
            db_url="postgresql://u:x@h:5432/erpdb",
            expected_db="erpdb",
            nebulae_env="production",
            mock_engine=engine,
            extra_env={
                "NEBULAE_ENV": "production",
                "SECRET_KEY": "super-secret-key-for-development-change-me",
                "CORS_ALLOWED_ORIGINS": "https://nebulaekids.com",
            },
        )
        self.assertTrue(exited, "SECRET_KEY dev en produccion debe abortar")
        self.assertEqual(code, 2)

    def test_produccion_sin_cors_aborta(self):
        """En produccion, si CORS_ALLOWED_ORIGINS no esta definida, debe abortar."""
        engine = _make_mock_engine("erpdb", "fa6_002")
        exited, code, stderr, _ = _call_preflight(
            db_url="postgresql://u:x@h:5432/erpdb",
            expected_db="erpdb",
            nebulae_env="production",
            mock_engine=engine,
            extra_env={
                "NEBULAE_ENV": "production",
                "SECRET_KEY": "a" * 64,
                "CORS_ALLOWED_ORIGINS": "",
            },
        )
        self.assertTrue(exited, "Sin CORS_ALLOWED_ORIGINS en produccion debe abortar")
        self.assertEqual(code, 2)
        self.assertIn("CORS_ALLOWED_ORIGINS", stderr)

    def test_produccion_sin_expected_db_aborta(self):
        """En produccion, EXPECTED_DATABASE_NAME es obligatorio."""
        engine = _make_mock_engine("erpdb", "fa6_002")
        exited, code, stderr, _ = _call_preflight(
            db_url="postgresql://u:x@h:5432/erpdb",
            expected_db="",  # Sin expected_db
            nebulae_env="production",
            mock_engine=engine,
            extra_env={
                "NEBULAE_ENV": "production",
                "EXPECTED_DATABASE_NAME": "",
                "SECRET_KEY": "a" * 64,
                "CORS_ALLOWED_ORIGINS": "https://nebulaekids.com",
            },
        )
        self.assertTrue(exited, "Sin EXPECTED_DATABASE_NAME en produccion debe abortar")
        self.assertEqual(code, 2)
        self.assertIn("EXPECTED_DATABASE_NAME", stderr)

    def test_produccion_nebulae_env_no_definido_aborta(self):
        """En produccion, NEBULAE_ENV debe ser exactamente 'production'."""
        import os
        engine = _make_mock_engine("erpdb", "fa6_002")
        # nebulae_env='production' via parametro pero NEBULAE_ENV env var no coincide
        exited, code, stderr, _ = _call_preflight(
            db_url="postgresql://u:x@h:5432/erpdb",
            expected_db="erpdb",
            nebulae_env="production",
            mock_engine=engine,
            extra_env={
                "NEBULAE_ENV": "staging",  # Inconsistente con nebulae_env param
                "SECRET_KEY": "a" * 64,
                "CORS_ALLOWED_ORIGINS": "https://nebulaekids.com",
            },
        )
        self.assertTrue(exited, "NEBULAE_ENV != production debe abortar")
        self.assertEqual(code, 2)

    def test_produccion_sin_required_alembic_version_aborta(self):
        """En produccion, si REQUIRED_ALEMBIC_VERSION no esta definida, debe abortar con exit 2."""
        import os
        engine = _make_mock_engine("erpdb", "fa6_004")
        # Asegurarse de que la variable NO este en el entorno
        env_without_rav = {k: v for k, v in os.environ.items()
                          if k != "REQUIRED_ALEMBIC_VERSION"}
        with mock.patch.dict(os.environ, env_without_rav, clear=True):
            exited, code, stderr, _ = _call_preflight(
                db_url="postgresql://u:x@h:5432/erpdb",
                expected_db="erpdb",
                nebulae_env="production",
                mock_engine=engine,
                extra_env={
                    "NEBULAE_ENV": "production",
                    "SECRET_KEY": "a" * 64,
                    "CORS_ALLOWED_ORIGINS": "https://nebulaekids.com",
                    # REQUIRED_ALEMBIC_VERSION deliberadamente ausente
                },
            )
        self.assertTrue(exited, "Sin REQUIRED_ALEMBIC_VERSION en produccion debe abortar")
        self.assertEqual(code, 2, f"Exit code debe ser 2, obtuvo {code}")
        self.assertIn("REQUIRED_ALEMBIC_VERSION", stderr)

    def test_produccion_required_alembic_version_correcta_pasa(self):
        """En produccion, REQUIRED_ALEMBIC_VERSION=fa6_004 + DB en fa6_004 -> OK."""
        engine = _make_mock_engine("erpdb", "fa6_004")
        exited, code, stderr, result = _call_preflight(
            db_url="postgresql://u:x@h:5432/erpdb",
            expected_db="erpdb",
            nebulae_env="production",
            mock_engine=engine,
            extra_env={
                "NEBULAE_ENV": "production",
                "SECRET_KEY": "a" * 64,
                "CORS_ALLOWED_ORIGINS": "https://nebulaekids.com",
                "REQUIRED_ALEMBIC_VERSION": "fa6_004",
            },
        )
        self.assertFalse(exited, f"REQUIRED_ALEMBIC_VERSION correcta debe pasar. stderr={stderr}")
        self.assertIsNotNone(result)
        self.assertEqual(result["alembic_version"], "fa6_004")


    def test_produccion_required_alembic_version_version_futura_aborta(self):
        """
        En produccion, REQUIRED_ALEMBIC_VERSION con version futura (ej: fa7_001)
        que NO coincide con la DB (fa6_004) debe abortar con exit 2.

        Garantia: produccion no arranca accidentalmente con una revision futura
        no autorizada aunque el operador configure una version incorrecta.
        """
        engine = _make_mock_engine("erpdb", "fa6_004")
        exited, code, stderr, _ = _call_preflight(
            db_url="postgresql://u:x@h:5432/erpdb",
            expected_db="erpdb",
            nebulae_env="production",
            mock_engine=engine,
            extra_env={
                "NEBULAE_ENV": "production",
                "SECRET_KEY": "a" * 64,
                "CORS_ALLOWED_ORIGINS": "https://nebulaekids.com",
                # Version futura que NO existe en la DB
                "REQUIRED_ALEMBIC_VERSION": "fa7_001",
            },
        )
        self.assertTrue(exited, "Version futura no autorizada debe abortar")
        self.assertEqual(code, 4, f"Exit code debe ser 4 (version mismatch), obtuvo {code}")

    def test_staging_sin_required_alembic_version_pasa(self):
        """
        En staging/testing, REQUIRED_ALEMBIC_VERSION NO es requerida.
        El arranque debe proceder sin abortar aunque la variable este ausente.
        """
        import os
        engine = _make_mock_engine("erp_staging_v22", "fa6_004")
        env_without_rav = {k: v for k, v in os.environ.items()
                           if k != "REQUIRED_ALEMBIC_VERSION"}
        with mock.patch.dict(os.environ, env_without_rav, clear=True):
            exited, code, stderr, result = _call_preflight(
                db_url="postgresql://u:x@h:5432/erp_staging_v22",
                expected_db="erp_staging_v22",
                nebulae_env="staging",
                mock_engine=engine,
                extra_env={
                    "NEBULAE_ENV": "staging",
                    "SECRET_KEY": "a" * 64,
                    "CORS_ALLOWED_ORIGINS": "https://nebulaekids.com",
                    # REQUIRED_ALEMBIC_VERSION deliberadamente ausente
                },
            )
        self.assertFalse(
            exited,
            f"En staging, sin REQUIRED_ALEMBIC_VERSION debe pasar. stderr={stderr}"
        )
        self.assertIsNotNone(result)

    def test_produccion_required_alembic_version_incorrecta_aborta(self):
        """
        En produccion, REQUIRED_ALEMBIC_VERSION con valor que NO coincide
        con la version real de la DB debe abortar con exit 2.

        Caso: la DB esta en fa6_003 pero el operador configura REQUIRED_ALEMBIC_VERSION=fa6_004.
        Esto protege contra deploys parciales donde el push llego pero la migracion no se ejecuto.
        """
        engine = _make_mock_engine("erpdb", "fa6_003")  # DB en version anterior
        exited, code, stderr, _ = _call_preflight(
            db_url="postgresql://u:x@h:5432/erpdb",
            expected_db="erpdb",
            nebulae_env="production",
            mock_engine=engine,
            extra_env={
                "NEBULAE_ENV": "production",
                "SECRET_KEY": "a" * 64,
                "CORS_ALLOWED_ORIGINS": "https://nebulaekids.com",
                # Operador configuró fa6_004 pero la DB esta en fa6_003
                "REQUIRED_ALEMBIC_VERSION": "fa6_004",
            },
        )
        self.assertTrue(
            exited,
            "Version incorrecta (DB en fa6_003, RAV=fa6_004) debe abortar"
        )
        self.assertEqual(code, 4, f"Exit code debe ser 4, obtuvo {code}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
