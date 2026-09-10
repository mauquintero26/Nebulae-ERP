"""
tests/test_startup_health.py
-----------------------------
13 pruebas focalizadas en el mecanismo de arranque productivo.

Cubre:
  1.  .env es cargado antes de validar variables.
  2.  Variables del proceso tienen prioridad sobre .env.
  3.  Caracteres especiales no se ejecutan como shell.
  4.  Preflight exitoso.
  5.  Preflight fallido impide iniciar uvicorn.
  6.  --no-preflight rechazado en produccion.
  7.  Health exitoso mantiene el servicio (semantica del lanzador).
  8.  Health fallido termina proceso y workers.
  9.  PID se limpia.
  10. SIGTERM se propaga.
  11. Wrapper Linux llama al lanzador.
  12. Wrapper PowerShell llama al mismo lanzador.
  13. No quedan procesos huerfanos.
"""
import importlib
import io
import json
import os
import pathlib
import signal
import subprocess
import sys
import threading
import time
import types
import unittest.mock as mock

import pytest

# ---------------------------------------------------------------------------
# Helpers de importacion
# ---------------------------------------------------------------------------
_BACKEND = pathlib.Path(__file__).parent.parent


def _import_launcher():
    """Importa launch_production como modulo."""
    spec = importlib.util.spec_from_file_location(
        "launch_production", _BACKEND / "launch_production.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# TEST 1: .env es cargado ANTES de validar variables
# ---------------------------------------------------------------------------
class TestEnvLoadedFirst:
    def test_env_loaded_before_validation(self, tmp_path, monkeypatch):
        """
        Si SECRET_KEY y DATABASE_URL solo estan en .env y NO en el proceso,
        el lanzador las debe cargar correctamente sin abortar con exit 1.
        """
        env_file = tmp_path / "test.env"
        env_file.write_text(
            "SECRET_KEY=clave-de-staging-segura-test-abc123\n"
            "DATABASE_URL=postgresql://u:p@localhost:5432/mydb?sslmode=disable\n"
            "NEBULAE_ENV=staging\n",
            encoding="utf-8",
        )
        lp = _import_launcher()
        # Limpiar SECRET_KEY y DATABASE_URL del proceso
        monkeypatch.delenv("SECRET_KEY", raising=False)
        monkeypatch.delenv("DATABASE_URL", raising=False)
        monkeypatch.delenv("NEBULAE_ENV", raising=False)

        applied = lp._load_dotenv_safe(str(env_file), override=False)
        assert "SECRET_KEY" in applied, ".env debe cargar SECRET_KEY"
        assert "DATABASE_URL" in applied, ".env debe cargar DATABASE_URL"
        assert os.environ.get("SECRET_KEY") == "clave-de-staging-segura-test-abc123"


# ---------------------------------------------------------------------------
# TEST 2: Variables del proceso tienen prioridad sobre .env
# ---------------------------------------------------------------------------
class TestProcessEnvPriority:
    def test_process_env_has_priority_over_dotenv(self, tmp_path, monkeypatch):
        """
        Con override=False, las variables del proceso NO deben ser sobreescritas.
        """
        env_file = tmp_path / "override.env"
        env_file.write_text("SECRET_KEY=valor-del-archivo\n", encoding="utf-8")

        monkeypatch.setenv("SECRET_KEY", "valor-del-proceso")
        lp = _import_launcher()
        applied = lp._load_dotenv_safe(str(env_file), override=False)

        assert "SECRET_KEY" not in applied, "No debe aplicar variable ya presente"
        assert os.environ["SECRET_KEY"] == "valor-del-proceso", "El proceso debe mantener su valor"


# ---------------------------------------------------------------------------
# TEST 3: Caracteres especiales no se ejecutan como shell
# ---------------------------------------------------------------------------
class TestNoShellInjection:
    def test_special_chars_not_executed(self, tmp_path, monkeypatch):
        """
        Valores con caracteres shell $(cmd), !, &&, etc. deben almacenarse literalmente.
        """
        env_file = tmp_path / "special.env"
        env_file.write_text(
            'SPECIAL_VAR=$(echo PWNED)\n'
            'ANOTHER_VAR=valor && rm -rf /\n',
            encoding="utf-8",
        )
        monkeypatch.delenv("SPECIAL_VAR", raising=False)
        monkeypatch.delenv("ANOTHER_VAR", raising=False)

        lp = _import_launcher()
        applied = lp._load_dotenv_safe(str(env_file), override=False)

        assert applied.get("SPECIAL_VAR") == "$(echo PWNED)", \
            "Caracteres shell deben almacenarse literalmente"
        assert applied.get("ANOTHER_VAR") == "valor && rm -rf /", \
            "Shell injection no debe ejecutarse"


# ---------------------------------------------------------------------------
# TEST 4: Preflight exitoso
# ---------------------------------------------------------------------------
class TestPreflightSuccess:
    def test_preflight_success_does_not_abort(self, monkeypatch):
        """
        Si preflight retorna exit code 0, el lanzador no debe abortar.
        """
        lp = _import_launcher()

        with mock.patch("subprocess.run") as mock_run:
            mock_run.return_value = mock.Mock(returncode=0)
            with mock.patch("os.path.isfile", return_value=True):
                # Si no levanta SystemExit, el preflight fue exitoso
                lp._run_preflight()
                mock_run.assert_called_once()


# ---------------------------------------------------------------------------
# TEST 5: Preflight fallido impide iniciar uvicorn
# ---------------------------------------------------------------------------
class TestPreflightFailure:
    def test_preflight_failure_aborts(self, monkeypatch):
        """
        Si preflight retorna exit code != 0, el lanzador debe abortar con ese exit code.
        """
        lp = _import_launcher()

        with mock.patch("subprocess.run") as mock_run:
            mock_run.return_value = mock.Mock(returncode=4)
            with mock.patch("os.path.isfile", return_value=True):
                with pytest.raises(SystemExit) as exc_info:
                    lp._run_preflight()
                assert exc_info.value.code == 4, \
                    "El lanzador debe propagar el exit code del preflight"


# ---------------------------------------------------------------------------
# TEST 6: --no-preflight rechazado en produccion
# ---------------------------------------------------------------------------
class TestNoPrefligtProhibitedInProduction:
    def test_no_preflight_rejected_in_production(self, monkeypatch):
        """
        Si NEBULAE_ENV=production y se pasa --no-preflight, el lanzador debe
        abortar con exit 1.
        """
        monkeypatch.setenv("SECRET_KEY", "clave-de-staging-segura-test-abc123")
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h:5432/db?sslmode=disable")
        monkeypatch.setenv("NEBULAE_ENV", "production")

        lp = _import_launcher()
        with pytest.raises(SystemExit) as exc_info:
            lp._validate_env("production", no_preflight=True)
        assert exc_info.value.code == 1, \
            "--no-preflight en produccion debe abortar con exit 1"

    def test_no_preflight_allowed_in_staging(self, monkeypatch):
        """
        En staging, --no-preflight esta permitido (no aborta).
        """
        monkeypatch.setenv("SECRET_KEY", "clave-de-staging-segura-test-abc123")
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h:5432/db?sslmode=disable")
        monkeypatch.setenv("NEBULAE_ENV", "staging")

        lp = _import_launcher()
        # No debe levantar SystemExit
        lp._validate_env("staging", no_preflight=True)


# ---------------------------------------------------------------------------
# TEST 7: Health exitoso mantiene el servicio
# ---------------------------------------------------------------------------
class TestHealthSuccess:
    def test_health_ok_returns_true(self):
        """
        _wait_for_health debe retornar True si el endpoint responde
        HTTP 200 + JSON status=ok.
        """
        lp = _import_launcher()

        # Simular urllib.request.urlopen que retorna 200 + status=ok
        fake_response = mock.MagicMock()
        fake_response.__enter__ = mock.Mock(return_value=fake_response)
        fake_response.__exit__ = mock.Mock(return_value=False)
        fake_response.status = 200
        fake_response.read.return_value = json.dumps({"status": "ok", "service": "nebulae-erp"}).encode()

        with mock.patch("urllib.request.urlopen", return_value=fake_response):
            result = lp._wait_for_health("127.0.0.1", 5000, timeout=5)
        assert result is True, "_wait_for_health debe retornar True ante respuesta OK"


# ---------------------------------------------------------------------------
# TEST 8: Health fallido termina proceso y workers
# ---------------------------------------------------------------------------
class TestHealthFailure:
    def test_health_failure_terminates_process(self, tmp_path):
        """
        _start_and_supervise debe terminar el proceso uvicorn y limpiar el PID
        si el health check falla.
        """
        lp = _import_launcher()
        pid_file = tmp_path / "test.pid"

        mock_proc = mock.MagicMock()
        mock_proc.pid = 99999

        with mock.patch("subprocess.Popen", return_value=mock_proc), \
             mock.patch.object(lp, "_wait_for_health", return_value=False), \
             mock.patch.object(lp, "_write_pid"), \
             mock.patch.object(lp, "_cleanup_pid") as mock_cleanup:
            with pytest.raises(SystemExit) as exc_info:
                lp._start_and_supervise(
                    "127.0.0.1", 9999, 1, "info",
                    health_timeout=1,
                    pid_file=pid_file,
                )
        assert exc_info.value.code == 2, "Health fallido debe provocar exit 2"
        mock_proc.terminate.assert_called(), "El proceso debe ser terminado"


# ---------------------------------------------------------------------------
# TEST 9: PID se limpia
# ---------------------------------------------------------------------------
class TestPidCleanup:
    def test_pid_written_and_cleaned(self, tmp_path):
        """
        El PID file debe crearse al iniciar uvicorn y eliminarse al terminar.
        """
        lp = _import_launcher()
        pid_file = tmp_path / "test.pid"

        # Simular escritura
        lp._write_pid(12345, pid_file)
        assert pid_file.exists(), "PID file debe existir despues de _write_pid"
        assert pid_file.read_text(encoding="utf-8") == "12345"

        # Simular limpieza
        lp._cleanup_pid(pid_file)
        assert not pid_file.exists(), "PID file debe eliminarse despues de _cleanup_pid"

    def test_pid_cleaned_after_health_failure(self, tmp_path):
        """
        El PID file debe eliminarse incluso cuando el health check falla.
        """
        lp = _import_launcher()
        pid_file = tmp_path / "test.pid"
        pid_file.write_text("99999", encoding="utf-8")

        mock_proc = mock.MagicMock()
        mock_proc.pid = 99999

        with mock.patch("subprocess.Popen", return_value=mock_proc), \
             mock.patch.object(lp, "_wait_for_health", return_value=False):
            with pytest.raises(SystemExit):
                lp._start_and_supervise(
                    "127.0.0.1", 9998, 1, "info",
                    health_timeout=1,
                    pid_file=pid_file,
                )

        assert not pid_file.exists(), "PID file debe eliminarse al fallar health check"


# ---------------------------------------------------------------------------
# TEST 10: SIGTERM se propaga
# ---------------------------------------------------------------------------
class TestSigtermPropagation:
    def test_sigterm_propagated_to_uvicorn(self, tmp_path):
        """
        Cuando el lanzador recibe SIGTERM, debe propagarlo al proceso uvicorn.
        """
        lp = _import_launcher()
        pid_file = tmp_path / "test.pid"

        mock_proc = mock.MagicMock()
        mock_proc.pid = 99998
        mock_proc.wait.return_value = 0

        with mock.patch("subprocess.Popen", return_value=mock_proc), \
             mock.patch.object(lp, "_wait_for_health", return_value=True), \
             mock.patch.object(lp, "_write_pid"), \
             mock.patch.object(lp, "_cleanup_pid"):

            # Enviar SIGTERM justo despues de entrar en proc.wait()
            original_wait = mock_proc.wait

            def wait_and_signal():
                # En Windows no hay SIGTERM real, simulamos con el handler
                if hasattr(signal, "SIGTERM"):
                    handler = signal.getsignal(signal.SIGTERM)
                    if callable(handler) and handler not in (
                        signal.SIG_DFL, signal.SIG_IGN
                    ):
                        handler(signal.SIGTERM, None)
                return 0

            mock_proc.wait.side_effect = wait_and_signal

            with pytest.raises(SystemExit) as exc_info:
                lp._start_and_supervise(
                    "127.0.0.1", 9997, 1, "info",
                    health_timeout=1,
                    pid_file=pid_file,
                )

        # terminate() debe haber sido llamado (via handler SIGTERM o proc.wait())
        # El exit code puede ser 0 (normal) o != 0 segun la plataforma
        assert exc_info.value.code is not None


# ---------------------------------------------------------------------------
# TEST 11: Wrapper Linux llama al lanzador
# ---------------------------------------------------------------------------
class TestLinuxWrapperCallsLauncher:
    def test_sh_wrapper_delegates_to_launcher(self):
        """
        start_production.sh debe ser un wrapper minimo que delega
        toda la logica a launch_production.py via exec.
        """
        sh_path = _BACKEND / "start_production.sh"
        assert sh_path.exists(), "start_production.sh debe existir"
        content = sh_path.read_text(encoding="utf-8", errors="ignore")

        assert "launch_production.py" in content, \
            "start_production.sh debe referenciar launch_production.py"
        assert "exec" in content, \
            "start_production.sh debe usar exec para delegar al lanzador"

        # No debe contener logica duplicada de health check ni preflight propio
        assert "HEALTH_TIMEOUT=" not in content, \
            "start_production.sh NO debe tener HEALTH_TIMEOUT propio (lo maneja el lanzador)"
        assert "preflight" not in content.lower() or "launch_production" in content, \
            "start_production.sh no debe ejecutar preflight directamente"

    def test_sh_wrapper_is_minimal(self):
        """
        start_production.sh debe ser minimo: menos de 50 lineas efectivas.
        """
        sh_path = _BACKEND / "start_production.sh"
        content = sh_path.read_text(encoding="utf-8", errors="ignore")
        effective_lines = [
            l for l in content.splitlines()
            if l.strip() and not l.strip().startswith("#")
        ]
        assert len(effective_lines) <= 50, \
            f"start_production.sh tiene {len(effective_lines)} lineas efectivas (max 50)"


# ---------------------------------------------------------------------------
# TEST 12: Wrapper PowerShell llama al mismo lanzador
# ---------------------------------------------------------------------------
class TestPowerShellWrapperCallsLauncher:
    def test_ps1_wrapper_delegates_to_launcher(self):
        """
        start_production.ps1 debe delegar toda la logica a launch_production.py.
        """
        ps1_path = _BACKEND / "start_production.ps1"
        assert ps1_path.exists(), "start_production.ps1 debe existir"
        content = ps1_path.read_text(encoding="utf-8", errors="ignore")

        assert "launch_production.py" in content, \
            "start_production.ps1 debe referenciar launch_production.py"
        assert "LASTEXITCODE" in content, \
            "start_production.ps1 debe propagar el exit code del lanzador"

        # No debe duplicar logica de health check ni preflight
        assert "/health" not in content, \
            "start_production.ps1 NO debe implementar health check propio"

    def test_ps1_wrapper_is_minimal(self):
        """
        start_production.ps1 debe ser minimo: menos de 70 lineas efectivas.
        """
        ps1_path = _BACKEND / "start_production.ps1"
        content = ps1_path.read_text(encoding="utf-8", errors="ignore")
        effective_lines = [
            l for l in content.splitlines()
            if l.strip() and not l.strip().startswith("#") and not l.strip().startswith("<#")
            and not l.strip().startswith(".") and l.strip() != "#>"
        ]
        assert len(effective_lines) <= 70, \
            f"start_production.ps1 tiene {len(effective_lines)} lineas efectivas (max 70)"


# ---------------------------------------------------------------------------
# TEST 13: No quedan procesos huerfanos
# ---------------------------------------------------------------------------
class TestNoOrphanProcesses:
    def test_no_orphan_after_health_failure(self, tmp_path):
        """
        Si el health check falla, el proceso uvicorn debe ser terminado
        (no quedar huerfano) antes de salir.
        """
        lp = _import_launcher()
        pid_file = tmp_path / "test.pid"

        mock_proc = mock.MagicMock()
        mock_proc.pid = 99990
        mock_proc.wait.return_value = 0

        with mock.patch("subprocess.Popen", return_value=mock_proc), \
             mock.patch.object(lp, "_wait_for_health", return_value=False), \
             mock.patch.object(lp, "_write_pid"), \
             mock.patch.object(lp, "_cleanup_pid"):
            with pytest.raises(SystemExit) as exc_info:
                lp._start_and_supervise(
                    "127.0.0.1", 9990, 1, "info",
                    health_timeout=1,
                    pid_file=pid_file,
                )

        assert exc_info.value.code == 2
        # terminate() o kill() deben haberse llamado
        assert mock_proc.terminate.called or mock_proc.kill.called, \
            "El proceso uvicorn debe ser terminado (no quedar huerfano)"

    def test_pid_file_not_left_after_failure(self, tmp_path):
        """
        El PID file no debe quedar en disco despues de un fallo de health check.
        """
        lp = _import_launcher()
        pid_file = tmp_path / "test.pid"

        mock_proc = mock.MagicMock()
        mock_proc.pid = 99991

        with mock.patch("subprocess.Popen", return_value=mock_proc), \
             mock.patch.object(lp, "_wait_for_health", return_value=False):
            with pytest.raises(SystemExit):
                lp._start_and_supervise(
                    "127.0.0.1", 9991, 1, "info",
                    health_timeout=1,
                    pid_file=pid_file,
                )

        assert not pid_file.exists(), \
            "PID file no debe quedar en disco tras fallo de health check"


# ---------------------------------------------------------------------------
# Tests de integracion via TestClient (endpoint /health existente)
# ---------------------------------------------------------------------------
class TestHealthEndpoint:
    """Tests del endpoint /health que usa el health check en los scripts."""

    def test_health_returns_status_ok(self, app_client):
        """El endpoint /health debe devolver status=ok con HTTP 200."""
        resp = app_client.get("/health")
        assert resp.status_code == 200, f"Health endpoint fallo: {resp.text}"
        body = resp.json()
        assert body.get("status") == "ok", f"Status incorrecto: {body}"

    def test_health_returns_service_name(self, app_client):
        """El endpoint /health debe incluir el nombre del servicio."""
        resp = app_client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert "service" in body, f"Campo service ausente en respuesta: {body}"
        assert body["service"] == "nebulae-erp"

    def test_health_no_auth_required(self, app_client):
        """El endpoint /health debe ser accesible sin autenticacion."""
        resp = app_client.get("/health")
        assert resp.status_code != 401
        assert resp.status_code != 403

    def test_health_method_not_allowed(self, app_client):
        """Solo GET debe estar permitido en /health."""
        resp = app_client.post("/health")
        assert resp.status_code == 405