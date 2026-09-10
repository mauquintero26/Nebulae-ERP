#!/usr/bin/env python3
"""
launch_production.py -- Lanzador seguro de Nebulae ERP Backend.

Ciclo completo de arranque:
  1. Carga variables desde un archivo .env usando python-dotenv (override=False).
  2. Valida variables obligatorias (SECRET_KEY, DATABASE_URL).
  3. Ejecuta preflight si esta disponible (verificaciones de DB y Alembic).
  4. Inicia uvicorn via subprocess.Popen (NO os.execvpe -- necesitamos el PID).
  5. Captura el PID y lo escribe en disco.
  6. Consulta /health hasta timeout; exige HTTP 200 + JSON status=ok.
  7. Si health falla: termina proceso y workers; limpia PID; exit 2.
  8. Si health OK: supervisa el proceso; propaga SIGTERM/SIGINT; limpia PID al terminar.

GARANTIAS:
  - Usa dotenv.dotenv_values() para parsear el .env -- NUNCA lo ejecuta como shell.
  - override=False: variables del proceso (systemd/supervisor/K8s) NO son sobreescritas.
  - Maneja espacios, comillas simples/dobles, '=' en valores, valores vacios,
    comentarios (#), y cualquier simbolo shell sin interpretarlos.
  - No imprime secretos (SECRET_KEY, DATABASE_URL, etc.) en ninguna salida.
  - Falla con exit 1 si python-dotenv no esta instalado.
  - Falla con exit 1 si el ENV_FILE no existe y fue especificado explicitamente.
  - --no-preflight esta PROHIBIDO en NEBULAE_ENV=production; aborta con exit 1.
"""

import argparse
import os
import signal
import subprocess
import sys
import time
import pathlib

# ============================================================================
# Secretos -- lista de claves que NUNCA deben imprimirse en logs
# ============================================================================
_SECRET_KEYS = frozenset({
    "SECRET_KEY",
    "DATABASE_URL",
    "TEST_DATABASE_URL",
    "PROD_ERPDB_DATABASE_URL",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
    "SMTP_PASSWORD",
})

_DEV_SECRET = "super-secret-key-for-development-change-me"

# ============================================================================
# PID file
# ============================================================================
_PID_FILE = pathlib.Path(__file__).parent / "nebulae_backend.pid"


def _is_secret(key: str) -> bool:
    return key in _SECRET_KEYS or "PASSWORD" in key or "SECRET" in key or "TOKEN" in key


# ============================================================================
# Carga de .env
# ============================================================================

def _load_dotenv_safe(env_file: str, override: bool = False) -> dict:
    """
    Carga un archivo .env usando python-dotenv.

    Args:
        env_file:  Ruta al archivo .env a cargar.
        override:  Si False (default), las variables ya presentes en os.environ
                   NO son sobreescritas. Solo se agregan las ausentes.

    Returns:
        Diccionario con las variables cargadas (solo las que se aplicaron al entorno).

    Raises:
        SystemExit(1): si python-dotenv no esta instalado.
        SystemExit(1): si el archivo no existe.
    """
    try:
        from dotenv import dotenv_values
    except ImportError:
        print(
            "[ERROR] python-dotenv no esta instalado. Ejecute:\n"
            "        pip install python-dotenv",
            file=sys.stderr,
        )
        sys.exit(1)

    if not os.path.isfile(env_file):
        print(f"[ERROR] Archivo de entorno no encontrado: {env_file}", file=sys.stderr)
        sys.exit(1)

    parsed: dict = dotenv_values(env_file, encoding="utf-8")

    applied = {}
    for key, value in parsed.items():
        if value is None:
            value = ""
        if override:
            os.environ[key] = value
            applied[key] = value
        else:
            if key not in os.environ:
                os.environ[key] = value
                applied[key] = value

    return applied


def _print_loaded(applied: dict) -> None:
    """Imprime las variables cargadas sin revelar secretos."""
    if not applied:
        print("[INFO] No se cargaron variables nuevas (ya presentes en el entorno).")
        return
    for key, value in sorted(applied.items()):
        if _is_secret(key):
            print(f"[INFO]   {key} = <REDACTED>")
        elif value == "":
            print(f"[INFO]   {key} = <vacia>")
        else:
            print(f"[INFO]   {key} = {value}")


# ============================================================================
# Validaciones
# ============================================================================

def _validate_env(nebulae_env: str, no_preflight: bool) -> None:
    """
    Valida variables obligatorias.
    Aborta si --no-preflight se usa en NEBULAE_ENV=production.
    """
    if no_preflight and nebulae_env == "production":
        print(
            "[ERROR] --no-preflight esta PROHIBIDO en NEBULAE_ENV=production. Abortando.",
            file=sys.stderr,
        )
        sys.exit(1)

    secret_key = os.environ.get("SECRET_KEY", "").strip()
    if not secret_key:
        print("[ERROR] SECRET_KEY no esta definida. Abortando.", file=sys.stderr)
        sys.exit(1)
    if secret_key == _DEV_SECRET:
        print("[ERROR] SECRET_KEY tiene el valor de desarrollo. Abortando.", file=sys.stderr)
        sys.exit(1)

    db_url = os.environ.get("DATABASE_URL", "").strip()
    if not db_url:
        print("[ERROR] DATABASE_URL no esta definida. Abortando.", file=sys.stderr)
        sys.exit(1)

    try:
        from urllib.parse import urlparse
        p = urlparse(db_url)
        db_display = f"{p.scheme}://***:***@{p.hostname}:{p.port}{p.path}"
    except Exception:
        db_display = "<URL no analizable>"
    print(f"[INFO] DATABASE_URL -> {db_display}")


# ============================================================================
# Preflight
# ============================================================================

def _run_preflight() -> None:
    """Ejecuta preflight.py si esta disponible."""
    preflight_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "app", "core", "preflight.py"
    )
    if not os.path.isfile(preflight_path):
        print("[WARN] preflight.py no encontrado -- omitiendo verificaciones de arranque.")
        return

    print("[INFO] Ejecutando preflight...")
    result = subprocess.run([sys.executable, preflight_path], env=os.environ.copy())
    if result.returncode != 0:
        print(
            f"[ERROR] Preflight aborto con exit code {result.returncode}. Abortando arranque.",
            file=sys.stderr,
        )
        sys.exit(result.returncode)
    print("[INFO] Preflight OK.")


# ============================================================================
# PID file
# ============================================================================

def _write_pid(pid: int, pid_file: pathlib.Path = None) -> None:
    """Escribe el PID del proceso uvicorn en disco."""
    target = pid_file if pid_file is not None else _PID_FILE
    try:
        target.write_text(str(pid), encoding="utf-8")
        print(f"[INFO] PID {pid} escrito en {target}")
    except OSError as exc:
        print(f"[WARN] No se pudo escribir PID file: {exc}", file=sys.stderr)


def _cleanup_pid(pid_file: pathlib.Path = None) -> None:
    """Elimina el PID file si existe."""
    target = pid_file if pid_file is not None else _PID_FILE
    try:
        if target.exists():
            target.unlink()
            print(f"[INFO] PID file eliminado: {target}")
    except OSError as exc:
        print(f"[WARN] No se pudo eliminar PID file: {exc}", file=sys.stderr)


# ============================================================================
# Health check
# ============================================================================

def _wait_for_health(host: str, port: int, timeout: int = 30, interval: float = 1.0) -> bool:
    """
    Consulta GET http://{host}:{port}/health hasta timeout.

    Returns:
        True si el endpoint responde HTTP 200 + JSON {"status": "ok"}.
        False si el timeout expira o la respuesta es invalida.
    """
    import urllib.request
    import json as _json

    url = f"http://{host}:{port}/health"
    deadline = time.monotonic() + timeout
    attempt = 0

    while time.monotonic() < deadline:
        attempt += 1
        try:
            with urllib.request.urlopen(url, timeout=3) as resp:
                if resp.status == 200:
                    body = _json.loads(resp.read().decode("utf-8"))
                    if body.get("status") == "ok":
                        print(f"[INFO] Health OK (intento {attempt}): {body}")
                        return True
                    else:
                        print(f"[WARN] Health respondio 200 pero status != ok: {body}")
                else:
                    print(f"[WARN] Health respondio HTTP {resp.status} (intento {attempt})")
        except Exception:
            pass
        time.sleep(interval)

    print(
        f"[ERROR] Health check timeout ({timeout}s) -- el servidor no respondio.",
        file=sys.stderr,
    )
    return False


# ============================================================================
# Terminacion de arbol de procesos (manager + workers)
# ============================================================================

def _terminate_tree(proc: "subprocess.Popen") -> None:
    """
    Termina el proceso y todos sus hijos/workers.

    En Windows: taskkill /F /T /PID mata el arbol completo (manager + workers).
    En Unix:    os.killpg mata el grupo de procesos.
    """
    pid = proc.pid
    if sys.platform == "win32":
        try:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=10,
            )
        except Exception:
            # Fallback: terminate solo el manager
            try:
                proc.terminate()
            except ProcessLookupError:
                pass
    else:
        try:
            import os as _os
            pgid = _os.getpgid(pid)
            _os.killpg(pgid, signal.SIGTERM)
        except Exception:
            try:
                proc.terminate()
            except ProcessLookupError:
                pass


# ============================================================================
# Arranque y supervision de uvicorn
# ============================================================================

def _start_and_supervise(
    host: str,
    port: int,
    workers: int,
    log_level: str,
    health_timeout: int = 30,
    pid_file: pathlib.Path = None,
) -> None:
    """
    Inicia uvicorn via subprocess.Popen, realiza health check y supervisa el proceso.

    Flujo:
      1. Popen -> PID capturado y escrito en disco
      2. Health check (timeout configurable)
      3. Si health falla: SIGTERM al proceso, limpia PID, exit 2
      4. Si health OK: espera a que el proceso termine, propagando SIGTERM/SIGINT
      5. Limpia PID al terminar (bloque finally)
    """
    pid_target = pid_file if pid_file is not None else _PID_FILE

    cmd = [
        sys.executable,
        "-m", "uvicorn",
        "main:app",
        "--host", host,
        "--port", str(port),
        "--workers", str(workers),
        "--log-level", log_level,
    ]

    print(f"[INFO] Iniciando uvicorn: {host}:{port} workers={workers} log={log_level}")

    proc = subprocess.Popen(cmd, env=os.environ.copy())
    _write_pid(proc.pid, pid_target)
    print(f"[INFO] Uvicorn iniciado con PID {proc.pid}")

    def _signal_handler(signum, frame):
        print(f"\n[INFO] Senal {signum} recibida. Terminando uvicorn (PID {proc.pid})...")
        _terminate_tree(proc)

    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _signal_handler)

    # Health check
    print(
        f"[INFO] Esperando health check en http://{host}:{port}/health "
        f"(timeout={health_timeout}s)..."
    )
    healthy = _wait_for_health(host, port, timeout=health_timeout)

    if not healthy:
        print("[ERROR] Health check fallo. Terminando uvicorn y workers...", file=sys.stderr)
        _terminate_tree(proc)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        except ProcessLookupError:
            pass
        _cleanup_pid(pid_target)
        sys.exit(2)

    print("[INFO] Backend saludable. Supervisando proceso...")

    exit_code = 0
    try:
        exit_code = proc.wait()
    except KeyboardInterrupt:
        print("\n[INFO] Interrupcion recibida. Terminando uvicorn...")
        _terminate_tree(proc)
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        except ProcessLookupError:
            pass
        exit_code = 130
    finally:
        _cleanup_pid(pid_target)

    print(f"[INFO] Uvicorn termino con exit code {exit_code}.")
    sys.exit(exit_code)


# ============================================================================
# main()
# ============================================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Lanzador seguro de Nebulae ERP Backend",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--env-file",
        default=os.environ.get("ENV_FILE", ""),
        help="Archivo de entorno a cargar (vacio = no cargar archivo)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT", "5000")),
        help="Puerto de escucha de uvicorn",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("HOST", "127.0.0.1"),
        help="Host de escucha de uvicorn",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=int(os.environ.get("WORKERS", "2")),
        help="Numero de workers de uvicorn",
    )
    parser.add_argument(
        "--log-level",
        default=os.environ.get("LOG_LEVEL", "info"),
        help="Nivel de log de uvicorn",
    )
    parser.add_argument(
        "--no-preflight",
        action="store_true",
        help="Omitir preflight.py (PROHIBIDO en NEBULAE_ENV=production)",
    )
    parser.add_argument(
        "--health-timeout",
        type=int,
        default=int(os.environ.get("HEALTH_TIMEOUT", "30")),
        help="Segundos maximos para esperar el health check",
    )

    args = parser.parse_args()

    nebulae_env = os.environ.get("NEBULAE_ENV", "production")
    print("=" * 67)
    print(f"  Nebulae ERP Backend -- Lanzador seguro")
    print(f"  Ambiente: {nebulae_env}")
    print(f"  Host:     {args.host}:{args.port}")
    print(f"  Workers:  {args.workers}")
    print(f"  Log:      {args.log_level}")
    print("=" * 67)

    # 1. Cargar .env ANTES de cualquier validacion
    env_file = args.env_file.strip()
    if env_file:
        print(f"[INFO] Cargando entorno desde: {env_file} (override=False)")
        applied = _load_dotenv_safe(env_file, override=False)
        print(f"[INFO] Variables aplicadas desde {env_file}: {len(applied)}")
        _print_loaded(applied)
    else:
        print("[INFO] ENV_FILE no especificado -- usando variables del proceso.")

    # Re-leer nebulae_env despues de cargar el .env
    nebulae_env = os.environ.get("NEBULAE_ENV", "production")

    # 2. Validaciones (incluye prohibicion --no-preflight en produccion)
    _validate_env(nebulae_env, args.no_preflight)

    # 3. Preflight
    if not args.no_preflight:
        _run_preflight()
    else:
        print("[INFO] Preflight omitido por --no-preflight (solo permitido fuera de produccion).")

    # 4-9. Arrancar uvicorn, health check, supervision
    _start_and_supervise(
        host=args.host,
        port=args.port,
        workers=args.workers,
        log_level=args.log_level,
        health_timeout=args.health_timeout,
    )


if __name__ == "__main__":
    main()
