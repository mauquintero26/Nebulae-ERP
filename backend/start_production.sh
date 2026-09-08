#!/usr/bin/env bash
# start_production.sh -- Nebulae ERP Backend (Produccion/Staging)
# Bloque 8: Servicio administrado SIN --reload
# HEAD: 486ef36
#
# USO:
#   Produccion:  ENV_FILE=.env          ./start_production.sh
#   Staging:     ENV_FILE=.env.staging  ./start_production.sh

set -euo pipefail

ENV_FILE=${ENV_FILE:-.env}
PORT=${PORT:-5000}
HOST=${HOST:-127.0.0.1}
WORKERS=${WORKERS:-2}
LOG_LEVEL=${LOG_LEVEL:-info}

echo "Iniciando Nebulae ERP: ${HOST}:${PORT} workers=${WORKERS}"

# Cargar variables de entorno desde archivo
if [ -f "${ENV_FILE}" ]; then
  set -a
  source "${ENV_FILE}"
  set +a
fi

# Verificar SECRET_KEY no es la de desarrollo
if [ "${SECRET_KEY}" = "super-secret-key-for-development-change-me" ]; then
  echo "ERROR: SECRET_KEY es el valor por defecto de desarrollo." >&2
  exit 1
fi

# Uvicorn SIN --reload
exec venv/Scripts/uvicorn main:app \
  --host "${HOST}" \
  --port "${PORT}" \
  --workers "${WORKERS}" \
  --log-level "${LOG_LEVEL}" \
  --access-log \
  --timeout-keep-alive 30
