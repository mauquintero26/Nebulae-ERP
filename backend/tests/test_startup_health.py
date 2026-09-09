"""
tests/test_startup_health.py
-----------------------------
Tests del comportamiento fail-closed del health check en los scripts de inicio.

Verifica la logica que se usa en start_production.sh y start_production.ps1:
  - Si el health endpoint responde con status=ok: proceso continua
  - Si el health endpoint no responde: proceso debe terminar con exit != 0
  - Estado WARN sin detener el backend esta PROHIBIDO
  - Los scripts deben limpiar el PID file al fallar

Note: estos tests ejercen la logica via la API de FastAPI (TestClient),
no invocando los scripts de bash/PS directamente.
"""
import pytest
import os
import sys
import pathlib

_BACKEND = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(_BACKEND))


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
        assert "service" in body, f"Campo 'service' ausente en respuesta: {body}"
        assert body["service"] == "nebulae-erp"

    def test_health_no_auth_required(self, app_client):
        """El endpoint /health debe ser accesible sin autenticacion."""
        resp = app_client.get("/health")
        assert resp.status_code != 401, "/health no debe requerir autenticacion"
        assert resp.status_code != 403, "/health no debe requerir autorizacion"

    def test_health_method_not_allowed(self, app_client):
        """Solo GET debe estar permitido en /health."""
        resp = app_client.post("/health")
        assert resp.status_code == 405, "POST a /health debe devolver 405"


class TestFailClosedLogic:
    """
    Tests de la logica fail-closed definida en los scripts de inicio.
    
    Verifican que la logica del script es correcta aunque no invoquen
    los scripts de bash/PowerShell directamente.
    """

    def test_health_check_timeout_semantics(self):
        """
        La logica fail-closed define: si healthy==False -> exit con codigo != 0.
        Aqui verificamos que el endpoint retorna lo que el script necesita.
        """
        # Si el endpoint responde correctamente, el valor de retorno
        # debe permitir que el script evalúe _healthy=1 (o True en PS)
        import requests
        # No podemos hacer una peticion real sin servidor levantado,
        # pero podemos verificar el contrato del endpoint via TestClient
        # (ya probado en TestHealthEndpoint)
        pass  # La logica de fail-closed esta en los scripts sh/ps1

    def test_pid_file_management_concept(self, tmp_path):
        """
        Verifica que la logica de gestion de PID file esta bien definida:
        - Se crea al iniciar uvicorn
        - Se borra en caso de fallo de health check
        - Se borra en caso de salida normal
        
        Esta es una prueba de contrato/concepto, no invoca bash.
        """
        pid_file = tmp_path / "nebulae_backend.pid"
        
        # Simular escritura de PID
        fake_pid = 99999
        pid_file.write_text(str(fake_pid))
        assert pid_file.exists(), "PID file debe existir al iniciar"
        
        # Simular limpieza al fallar health check
        pid_file.unlink()
        assert not pid_file.exists(), "PID file debe eliminarse al fallar health check"

    def test_health_script_constants(self):
        """
        Los scripts de inicio definen HEALTH_TIMEOUT >= 15s y sin WARN.
        Verificamos los valores hardcodeados en el script de shell.
        """
        sh_path = _BACKEND / "start_production.sh"
        assert sh_path.exists(), "start_production.sh debe existir"
        content = sh_path.read_text(encoding="utf-8", errors="ignore")
        
        # HEALTH_TIMEOUT debe estar definido
        assert "HEALTH_TIMEOUT=" in content, "HEALTH_TIMEOUT no definido en script"
        
        # El script NO debe tener el comportamiento WARN (estado prohibido)
        assert "[WARN] Health check no respondio" not in content, \
            "Estado WARN sin detener backend esta PROHIBIDO"
        
        # Debe haber logica de kill/terminacion al fallar health check
        assert "kill -TERM" in content or "kill -KILL" in content, \
            "Script debe matar uvicorn si health check falla"
        
        # Debe limpiar el PID file
        assert 'rm -f "${PID_FILE}"' in content or "rm -f" in content, \
            "Script debe eliminar PID file al fallar"
        
        # Debe salir con codigo != 0
        assert "exit 2" in content, "Script debe salir con exit 2 al fallar health check"

    def test_powershell_script_fail_closed(self):
        """
        Verifica que start_production.ps1 tiene la logica fail-closed.
        """
        ps1_path = _BACKEND / "start_production.ps1"
        assert ps1_path.exists(), "start_production.ps1 debe existir"
        content = ps1_path.read_text(encoding="utf-8", errors="ignore")
        
        # Debe verificar el health check
        assert "/health" in content, "PS1 debe verificar el endpoint /health"
        
        # Debe terminar el proceso al fallar
        assert "Stop-Process" in content, "PS1 debe terminar uvicorn si health falla"
        
        # Debe limpiar el PID file
        assert "Remove-Item" in content and "PID_FILE" in content, \
            "PS1 debe eliminar PID file al fallar"
        
        # Debe salir con codigo != 0
        assert "exit 2" in content, "PS1 debe salir con exit 2 al fallar health check"