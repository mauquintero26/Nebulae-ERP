#!/usr/bin/env python3
"""
launch_production.py -- Lanzador seguro de Nebulae ERP Backend.

Reemplaza `set -a; source .env; set +a` en start_production.sh.
Carga variables desde un archivo .env usando python-dotenv con override=False,
luego ejecuta preflight y uvicorn con el mismo entorno validado.

USO (desde el directorio backend/):
    python3 launch_production.py [--env-file .env] [--port 5000] [--host 127.0.0.1]
    python3 launch_production.py --env-file .env.staging --port 5002

GARANTIAS:
  - Usa dotenv.dotenv_values() para parsear el .env -- NUNCA lo ejecuta como shell.
  - override=False: variables ya en el proceso (inyectadas por systemd/supervisor/K8s)
    NO son sobreescritas por el .env.
  - Maneja espacios, comillas simples/dobles, '=' en valores, valores vacios,
    comentarios (#), y cualquier simbolo shell sin interpretarlos.
  - No imprime secretos (SECRET_KEY, DATABASE_URL, etc.) en ninguna salida.
  - Falla con exit 1 si python-dotenv no esta instalado.
  - Falla con exit 1 si el ENV_FILE no existe y fue especificado explicitamente.
  - Ejecuta preflight embebido (si esta disponible) antes de levantar uvicorn.
  - Ejecuta uvicorn en el mismo proceso (os.execvpe) con el entorno validado.
"""

import argparse
import os
import sys
import subprocess

# ============================================================================
# Secretos — lista de claves que NUNCA deben imprimirse en logs
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


def _is_secret(key: str) -> bool:
    return key in _SECRET_KEYS or "PASSWORD" in key or "SECRET" in key or "TOKEN" in key


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

    # dotenv_values() parsea el archivo SIN ejecutarlo como shell.
    # Maneja: espacios, comillas simples/dobles, '=' en valores,
    # comentarios #, valores vacios, y cualquier simbolo shell.
    parsed: dict = dotenv_values(env_file, encoding="utf-8")

    applied = {}
    for key, value in parsed.items():
        if value is None:
            value = ""
        if override:
            os.environ[key] = value
            applied[key] = value
        else:
            # Solo aplicar si la variable NO esta ya en el proceso
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


def _run_preflight() -> None:
    """
    Ejecuta preflight.py si esta disponible.
    Falla con exit 2 si preflight aborta.
    """
    preflight_path = os.path.join(os.path.dirname(__file__), "app", "core", "preflight.py")
    if not os.path.isfile(preflight_path):
        print("[WARN] preflight.py no encontrado — omitiendo verificaciones de arranque.")
        return

    print("[INFO] Ejecutando preflight...")
    result = subprocess.run(
        [sys.executable, preflight_path],
        env=os.environ.copy(),
    )
    if result.returncode != 0:
        print(
            f"[ERROR] Preflight aborto con exit code {result.returncode}. Abortando arranque.",
            file=sys.stderr,
        )
        sys.exit(result.returncode)
    print("[INFO] Preflight OK.")


def _start_uvicorn(host: str, port: int, workers: int, log_level: str) -> None:
    """
    Reemplaza el proceso actual con uvicorn (os.execvpe).
    Si os.execvpe no esta disponible (Windows), usa subprocess.run.
    """
    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "main:app",
        "--host", host,
        "--port", str(port),
        "--workers", str(workers),
        "--log-level", log_level,
        # NO --reload en produccion
    ]

    print(f"[INFO] Iniciando uvicorn: {host}:{port} workers={workers} log={log_level}")

    if hasattr(os, "execvpe"):
        # Unix: reemplaza el proceso actual (mas eficiente)
        os.execvpe(sys.executable, cmd, os.environ)
    else:
        # Windows: subprocess.run (bloquea hasta que uvicorn termine)
        result = subprocess.run(cmd, env=os.environ.copy())
        sys.exit(result.returncode)


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
        help="Omitir ejecucion de preflight.py (solo para testing)",
    )

    args = parser.parse_args()

    nebulae_env = os.environ.get("NEBULAE_ENV", "production")
    print("=" * 67)
    print(f"  Nebulae ERP Backend — Lanzador seguro")
    print(f"  Ambiente: {nebulae_env}")
    print(f"  Host:     {args.host}:{args.port}")
    print(f"  Workers:  {args.workers}")
    print(f"  Log:      {args.log_level}")
    print("=" * 67)

    # -------------------------------------------------------------------------
    # 1. Cargar archivo .env (si se especifico)
    # -------------------------------------------------------------------------
    env_file = args.env_file.strip()
    if env_file:
        print(f"[INFO] Cargando entorno desde: {env_file} (override=False)")
        applied = _load_dotenv_safe(env_file, override=False)
        print(f"[INFO] Variables aplicadas desde {env_file}: {len(applied)}")
        _print_loaded(applied)
    else:
        print("[INFO] ENV_FILE no especificado — usando variables del proceso.")

    # -------------------------------------------------------------------------
    # 2. Validaciones minimas antes de preflight
    # -------------------------------------------------------------------------
    _DEV_SECRET = "super-secret-key-for-development-change-me"

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

    # Mostrar DATABASE_URL enmascarada
    try:
        from urllib.parse import urlparse
        p = urlparse(db_url)
        db_display = f"{p.scheme}://***:***@{p.hostname}:{p.port}{p.path}"
    except Exception:
        db_display = "<URL no analizable>"
    print(f"[INFO] DATABASE_URL -> {db_display}")

    # -------------------------------------------------------------------------
    # 3. Preflight
    # -------------------------------------------------------------------------
    if not args.no_preflight:
        _run_preflight()

    # -------------------------------------------------------------------------
    # 4. Uvicorn
    # -------------------------------------------------------------------------
    _start_uvicorn(args.host, args.port, args.workers, args.log_level)


if __name__ == "__main__":
    main()
