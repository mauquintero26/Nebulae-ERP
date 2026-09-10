#!/usr/bin/env bash
# start_production.sh -- Wrapper minimo para launch_production.py
#
# Este script localiza el interprete Python del venv y delega TODA la logica
# al lanzador Python: carga de .env, validacion, preflight, health check
# y supervision de uvicorn.
#
# USO:
#   ./start_production.sh
#   ENV_FILE=.env.staging PORT=5002 WORKERS=1 ./start_production.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${SCRIPT_DIR}/venv/bin/python"

if [ ! -f "${PYTHON}" ]; then
    echo "[ERROR] Interprete Python no encontrado: ${PYTHON}" >&2
    echo "[ERROR] Ejecute: python3 -m venv venv && venv/bin/pip install -r requirements.txt" >&2
    exit 1
fi

exec "${PYTHON}" "${SCRIPT_DIR}/launch_production.py" \
    --env-file  "${ENV_FILE:-.env}"        \
    --host      "${HOST:-127.0.0.1}"       \
    --port      "${PORT:-5000}"            \
    --workers   "${WORKERS:-2}"            \
    --log-level "${LOG_LEVEL:-info}"