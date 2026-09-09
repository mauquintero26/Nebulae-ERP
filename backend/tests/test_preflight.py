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
                    raise_operational_error: bool = False):
    """
    Llama a run_preflight_or_abort con mocks de sys.exit y create_engine.
    Retorna (exited, exit_code, stderr_output, return_value).
    """
    import importlib
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

    with mock.patch("sys.exit", side_effect=fake_exit), \
         mock.patch("sys.stderr", mock.Mock(write=fake_stderr_write)), \
         mock.patch("app.core.preflight.create_engine", return_value=engine_to_use):
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
        engine = _make_mock_engine("erpdb", "fa6_002")
        exited, code, stderr, result = _call_preflight(
            db_url="postgresql://u:x@h:5432/erpdb",
            expected_db="erpdb",
            nebulae_env="production",
            mock_engine=engine,
        )
        self.assertFalse(exited, f"Version correcta en produccion debe pasar. stderr={stderr}")
        self.assertIsNotNone(result)
        self.assertEqual(result["current_db"], "erpdb")
        self.assertEqual(result["alembic_version"], "fa6_002")

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
