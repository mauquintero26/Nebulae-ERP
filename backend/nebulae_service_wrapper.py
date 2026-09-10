"""
nebulae_service_wrapper.py — Wrapper supervisor para el backend de Nebulae ERP.

Este script es llamado por Windows Task Scheduler en el evento ONSTART.
Supervisa el proceso uvicorn y lo reinicia automáticamente si falla,
con backoff exponencial entre reintentos.

Secretos: leídos de .env.production (NUNCA hardcodeados aquí).
PID: nebulae_backend.pid
Logs: nebulae_service.log (en el mismo directorio)

Uso manual:
    venv\\Scripts\\python.exe nebulae_service_wrapper.py
"""
import subprocess
import sys
import time
import logging
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent.resolve()
LOG_FILE = BASE_DIR / "nebulae_service.log"
MAX_RESTARTS = 20
INITIAL_BACKOFF = 5    # segundos
MAX_BACKOFF = 120      # máximo entre reintentos

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [SERVICE] %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("nebulae_service")

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def main():
    python = BASE_DIR / "venv" / "Scripts" / "python.exe"
    launcher = BASE_DIR / "launch_production.py"
    env_file = BASE_DIR / ".env.production"

    if not python.exists():
        log.error(f"Python del venv no encontrado: {python}")
        sys.exit(1)
    if not launcher.exists():
        log.error(f"Launcher no encontrado: {launcher}")
        sys.exit(1)
    if not env_file.exists():
        log.error(f".env.production no encontrado: {env_file}")
        sys.exit(1)

    cmd = [
        str(python), str(launcher),
        "--env-file", str(env_file),
        "--host", "127.0.0.1",
        "--port", "5003",
        "--workers", "1",
        "--log-level", "info",
    ]

    restarts = 0
    backoff = INITIAL_BACKOFF

    log.info("Nebulae ERP Service Wrapper iniciado.")
    log.info(f"Comando: {' '.join(cmd)}")

    while restarts < MAX_RESTARTS:
        log.info(f"Iniciando uvicorn (intento #{restarts + 1})...")
        try:
            proc = subprocess.run(cmd, cwd=BASE_DIR)
            exit_code = proc.returncode
        except Exception as exc:
            log.error(f"Error al lanzar proceso: {exc}")
            exit_code = -1

        if exit_code == 0:
            log.info("Uvicorn terminó limpiamente (exit 0). No se reinicia.")
            break

        restarts += 1
        log.warning(
            f"Uvicorn terminó con exit={exit_code}. "
            f"Reinicio #{restarts}/{MAX_RESTARTS} en {backoff}s..."
        )
        time.sleep(backoff)
        backoff = min(backoff * 2, MAX_BACKOFF)

    if restarts >= MAX_RESTARTS:
        log.error(f"Máximo de reintentos ({MAX_RESTARTS}) alcanzado. Wrapper detenido.")
        sys.exit(1)

    log.info("Service wrapper finalizado.")


if __name__ == "__main__":
    main()
