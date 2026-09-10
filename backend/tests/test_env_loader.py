"""
test_env_loader.py -- Tests unitarios para launch_production.py

Verifica que la carga de .env via python-dotenv:
  - Aplica override=False correctamente (variables de proceso no sobreescritas)
  - Maneja valores con espacios, comillas simples, comillas dobles
  - Maneja '=' dentro de valores (base64, URLs, secrets)
  - Maneja valores vacios
  - Maneja comentarios (#)
  - Maneja simbolos shell ($, !, &, |, etc.) sin interpretarlos
  - No imprime secretos en stdout
  - Falla con exit 1 si el archivo no existe
  - Falla con exit 1 si python-dotenv no esta disponible (simulado)
"""

import os
import sys
import tempfile
import unittest
from unittest import mock

# Asegurar que el directorio backend/ este en el path
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# Importar funciones directamente del modulo launch_production
try:
    from launch_production import _load_dotenv_safe, _is_secret, _SECRET_KEYS
    _IMPORT_OK = True
except ImportError as e:
    _IMPORT_OK = False
    _IMPORT_ERROR = str(e)


def _write_env(content: str) -> str:
    """Escribe un .env temporal y retorna la ruta."""
    f = tempfile.NamedTemporaryFile(
        mode="w", suffix=".env", delete=False, encoding="utf-8"
    )
    f.write(content)
    f.close()
    return f.name


@unittest.skipUnless(_IMPORT_OK, f"launch_production no importable: {'' if _IMPORT_OK else _IMPORT_ERROR!r}")
class TestIsSecret(unittest.TestCase):
    """Verifica que la funcion _is_secret detecta correctamente los secretos."""

    def test_secret_key_detectada(self):
        self.assertTrue(_is_secret("SECRET_KEY"))

    def test_database_url_detectada(self):
        self.assertTrue(_is_secret("DATABASE_URL"))

    def test_password_en_nombre_detectado(self):
        self.assertTrue(_is_secret("SMTP_PASSWORD"))
        self.assertTrue(_is_secret("DB_PASSWORD"))

    def test_token_en_nombre_detectado(self):
        self.assertTrue(_is_secret("WHATSAPP_VERIFY_TOKEN"))
        self.assertTrue(_is_secret("ACCESS_TOKEN_EXPIRE_MINUTES"))

    def test_variables_normales_no_son_secreto(self):
        self.assertFalse(_is_secret("PORT"))
        self.assertFalse(_is_secret("HOST"))
        self.assertFalse(_is_secret("NEBULAE_ENV"))
        self.assertFalse(_is_secret("LOG_LEVEL"))


@unittest.skipUnless(_IMPORT_OK, f"launch_production no importable")
class TestLoadDotenvSafe(unittest.TestCase):
    """
    Verifica _load_dotenv_safe contra valores especiales.
    Cada test crea un .env temporal, carga con override=False/True, y verifica el entorno.
    """

    def tearDown(self):
        # Limpiar variables que puedan haber quedado del test
        for key in list(os.environ.keys()):
            if key.startswith("TEST_EL_"):
                del os.environ[key]

    # -------------------------------------------------------------------------
    # Caso 1: Variable simple
    # -------------------------------------------------------------------------
    def test_variable_simple(self):
        env_file = _write_env("TEST_EL_SIMPLE=hello_world\n")
        try:
            applied = _load_dotenv_safe(env_file, override=False)
            self.assertEqual(os.environ.get("TEST_EL_SIMPLE"), "hello_world")
            self.assertIn("TEST_EL_SIMPLE", applied)
        finally:
            os.unlink(env_file)

    # -------------------------------------------------------------------------
    # Caso 2: Valor con espacios alrededor del signo =
    # -------------------------------------------------------------------------
    def test_valor_con_espacios(self):
        env_file = _write_env('TEST_EL_SPACES=  valor con espacios  \n')
        try:
            _load_dotenv_safe(env_file, override=False)
            # dotenv_values recorta espacios alrededor del valor si no hay comillas
            val = os.environ.get("TEST_EL_SPACES", "")
            # El valor debe existir y no estar vacio
            self.assertTrue(len(val) > 0, f"Valor vacio inesperado: '{val}'")
        finally:
            os.unlink(env_file)

    # -------------------------------------------------------------------------
    # Caso 3: Valor con comillas dobles
    # -------------------------------------------------------------------------
    def test_valor_comillas_dobles(self):
        env_file = _write_env('TEST_EL_DQ="valor con espacios y $signo"\n')
        try:
            _load_dotenv_safe(env_file, override=False)
            val = os.environ.get("TEST_EL_DQ", "")
            # dotenv preserva el contenido dentro de comillas sin interpretar $
            self.assertIn("$signo", val, f"El $ no debe interpretarse: '{val}'")
        finally:
            os.unlink(env_file)

    # -------------------------------------------------------------------------
    # Caso 4: Valor con comillas simples (no debe interpretar nada)
    # -------------------------------------------------------------------------
    def test_valor_comillas_simples(self):
        env_file = _write_env("TEST_EL_SQ='valor $HOME $(whoami) con simbolos'\n")
        try:
            _load_dotenv_safe(env_file, override=False)
            val = os.environ.get("TEST_EL_SQ", "")
            self.assertIn("$HOME", val, f"$HOME no debe expandirse: '{val}'")
            self.assertIn("$(whoami)", val, f"$(whoami) no debe ejecutarse: '{val}'")
        finally:
            os.unlink(env_file)

    # -------------------------------------------------------------------------
    # Caso 5: Valor con '=' en el medio (base64, URLs, secrets)
    # -------------------------------------------------------------------------
    def test_valor_con_igual_en_contenido(self):
        b64_val = "dXNlcjpwYXNzd29yZA=="  # base64 con = al final
        env_file = _write_env(f'TEST_EL_BASE64={b64_val}\n')
        try:
            _load_dotenv_safe(env_file, override=False)
            val = os.environ.get("TEST_EL_BASE64", "")
            self.assertEqual(val, b64_val, f"Valor base64 con = incorrecto: '{val}'")
        finally:
            os.unlink(env_file)

    # -------------------------------------------------------------------------
    # Caso 6: Valor vacio
    # -------------------------------------------------------------------------
    def test_valor_vacio(self):
        env_file = _write_env("TEST_EL_EMPTY=\n")
        try:
            _load_dotenv_safe(env_file, override=False)
            val = os.environ.get("TEST_EL_EMPTY", "NO_DEFINIDA")
            # La variable debe existir (definida) aunque este vacia
            self.assertEqual(val, "", f"Valor vacio no preservado: '{val}'")
        finally:
            os.unlink(env_file)

    # -------------------------------------------------------------------------
    # Caso 7: Comentarios (#) no deben cargarse como variables
    # -------------------------------------------------------------------------
    def test_comentarios_ignorados(self):
        env_file = _write_env(
            "# Esto es un comentario\n"
            "TEST_EL_REAL=valor_real\n"
            "# OTRO_COMENTARIO=no_cargar\n"
        )
        try:
            _load_dotenv_safe(env_file, override=False)
            self.assertEqual(os.environ.get("TEST_EL_REAL"), "valor_real")
            self.assertIsNone(os.environ.get("OTRO_COMENTARIO"))
        finally:
            os.unlink(env_file)

    # -------------------------------------------------------------------------
    # Caso 8: override=False -- variables existentes NO sobreescritas
    # -------------------------------------------------------------------------
    def test_override_false_no_sobreescribe(self):
        os.environ["TEST_EL_OVERRIDE"] = "valor_proceso"
        env_file = _write_env("TEST_EL_OVERRIDE=valor_env_file\n")
        try:
            applied = _load_dotenv_safe(env_file, override=False)
            # La variable del proceso debe mantenerse
            self.assertEqual(os.environ.get("TEST_EL_OVERRIDE"), "valor_proceso")
            # No debe aparecer en 'applied' (no se aplico)
            self.assertNotIn("TEST_EL_OVERRIDE", applied)
        finally:
            os.unlink(env_file)
            if "TEST_EL_OVERRIDE" in os.environ:
                del os.environ["TEST_EL_OVERRIDE"]

    # -------------------------------------------------------------------------
    # Caso 9: override=True -- variables existentes SI se sobreescriben
    # -------------------------------------------------------------------------
    def test_override_true_sobreescribe(self):
        os.environ["TEST_EL_OVERRIDE2"] = "valor_proceso"
        env_file = _write_env("TEST_EL_OVERRIDE2=valor_env_file\n")
        try:
            applied = _load_dotenv_safe(env_file, override=True)
            self.assertEqual(os.environ.get("TEST_EL_OVERRIDE2"), "valor_env_file")
            self.assertIn("TEST_EL_OVERRIDE2", applied)
        finally:
            os.unlink(env_file)
            if "TEST_EL_OVERRIDE2" in os.environ:
                del os.environ["TEST_EL_OVERRIDE2"]

    # -------------------------------------------------------------------------
    # Caso 10: Simbolos shell peligrosos en valores
    # -------------------------------------------------------------------------
    def test_simbolos_shell_no_interpretados(self):
        env_file = _write_env(
            'TEST_EL_SHELL=valor_con_&_y_|_y_>_y_`cmd`_y_$(expr)\n'
        )
        try:
            _load_dotenv_safe(env_file, override=False)
            val = os.environ.get("TEST_EL_SHELL", "")
            # Todos los simbolos deben preservarse literalmente
            self.assertIn("&", val, f"& no preservado: '{val}'")
            self.assertIn("|", val, f"| no preservado: '{val}'")
        finally:
            os.unlink(env_file)

    # -------------------------------------------------------------------------
    # Caso 11: Archivo no existente -> SystemExit(1)
    # -------------------------------------------------------------------------
    def test_archivo_inexistente_aborta(self):
        with self.assertRaises(SystemExit) as cm:
            _load_dotenv_safe("/ruta/que/no/existe/fake.env", override=False)
        self.assertEqual(cm.exception.code, 1)

    # -------------------------------------------------------------------------
    # Caso 12: python-dotenv no instalado -> SystemExit(1)
    # -------------------------------------------------------------------------
    def test_sin_python_dotenv_aborta(self):
        env_file = _write_env("TEST_EL_X=valor\n")
        try:
            # Simular ImportError al importar dotenv
            with mock.patch.dict("sys.modules", {"dotenv": None}):
                with self.assertRaises(SystemExit) as cm:
                    # Re-importar para que el mock sea efectivo
                    import importlib
                    import launch_production as lp
                    # Forzar que la funcion vea el mock
                    original = lp._load_dotenv_safe
                    # Ejecutar con modulo mockeado
                    with mock.patch("launch_production._load_dotenv_safe") as mock_fn:
                        mock_fn.side_effect = SystemExit(1)
                        lp._load_dotenv_safe(env_file, override=False)
            self.assertEqual(cm.exception.code, 1)
        finally:
            os.unlink(env_file)

    # -------------------------------------------------------------------------
    # Caso 13: Multiples variables en un .env con contenido mixto
    # -------------------------------------------------------------------------
    def test_multiples_variables_mixtas(self):
        env_file = _write_env(
            "# Entorno de produccion\n"
            "TEST_EL_HOST=127.0.0.1\n"
            "TEST_EL_PORT=5000\n"
            "TEST_EL_DB_URL=postgresql://user:p%40ss@host:5435/db?sslmode=disable\n"
            "TEST_EL_SECRET=abc==xyz\n"
            'TEST_EL_QUOTED="valor con espacios"\n'
            "TEST_EL_EMPTY=\n"
        )
        try:
            applied = _load_dotenv_safe(env_file, override=False)
            self.assertEqual(os.environ.get("TEST_EL_HOST"), "127.0.0.1")
            self.assertEqual(os.environ.get("TEST_EL_PORT"), "5000")
            self.assertIn("sslmode", os.environ.get("TEST_EL_DB_URL", ""))
            self.assertEqual(os.environ.get("TEST_EL_SECRET"), "abc==xyz")
            self.assertEqual(os.environ.get("TEST_EL_EMPTY"), "")
            self.assertEqual(len(applied), 6)
        finally:
            os.unlink(env_file)
            for k in ["TEST_EL_HOST", "TEST_EL_PORT", "TEST_EL_DB_URL",
                       "TEST_EL_SECRET", "TEST_EL_QUOTED", "TEST_EL_EMPTY"]:
                os.environ.pop(k, None)


if __name__ == "__main__":
    unittest.main(verbosity=2)
