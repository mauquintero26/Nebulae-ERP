#!/usr/bin/env bash
# =============================================================================
# start_production.sh -- Nebulae ERP Backend (Produccion / Staging)
# =============================================================================
# USO:
#   Produccion:  NEBULAE_ENV=production ENV_FILE=.env          ./start_production.sh
#   Staging:     NEBULAE_ENV=staging    ENV_FILE=.env.staging  ./start_production.sh
#
# Variables configurables:
#   ENV_FILE                  Archivo de variables de entorno (defecto: .env)
#   PORT                      Puerto de escucha (defecto: 5000)
#   HOST                      Host de escucha (defecto: 127.0.0.1)
#   WORKERS                   Numero de workers (defecto: 2)
#   LOG_LEVEL                 Nivel de log (defecto: info)
#   EXPECTED_DATABASE_NAME    Si se define, Alembic verifica que la DB coincida
#
# Garantias:
#   - Usa venv/bin/python -m uvicorn (ruta Linux correcta)
#   - Verifica existencia del ejecutable Python del venv
#   - Verifica SECRET_KEY presente y no igual al valor de desarrollo
#   - Verifica DATABASE_URL presente
#   - Verifica EXPECTED_DATABASE_NAME si se define
#   - No usa --reload
#   - No imprime secretos en logs
#   - Registra PID en nebulae_backend.pid
#   - Health check post-arranque
#   - Exit codes documentados: 0=OK, 1=error de configuracion, 2=error de arranque
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------
readonly DEV_SECRET="super-secret-key-for-development-change-me"
readonly PID_FILE="nebulae_backend.pid"
readonly HEALTH_TIMEOUT=15
readonly HEALTH_INTERVAL=1

# ---------------------------------------------------------------------------
# Parametros configurables
# ---------------------------------------------------------------------------
ENV_FILE="${ENV_FILE:-.env}"
PORT="${PORT:-5000}"
HOST="${HOST:-127.0.0.1}"
WORKERS="${WORKERS:-2}"
LOG_LEVEL="${LOG_LEVEL:-info}"
NEBULAE_ENV="${NEBULAE_ENV:-production}"

echo "==================================================================="
echo " Nebulae ERP Backend — Arranque de produccion"
echo " Ambiente: ${NEBULAE_ENV}"
echo " Host:     ${HOST}:${PORT}"
echo " Workers:  ${WORKERS}"
echo " Log:      ${LOG_LEVEL}"
echo "==================================================================="

# ---------------------------------------------------------------------------
# 1. Cargar archivo de entorno (sin sobrescribir variables ya en el proceso)
# ---------------------------------------------------------------------------
if [ -f "${ENV_FILE}" ]; then
    echo "[INFO] Cargando entorno desde: ${ENV_FILE}"
    # set -a exporta, luego source, luego set +a
    # Usamos un subshell para no contaminar el proceso principal con override
    while IFS='=' read -r key value; do
        # Ignorar comentarios y lineas vacias
        [[ "${key}" =~ ^#.*$ ]] && continue
        [[ -z "${key}" ]] && continue
        # Solo setear si no esta ya en el entorno
        if [ -z "${!key+x}" ]; then
            export "${key}=${value}"
        fi
    done < <(grep -v '^#' "${ENV_FILE}" | grep -v '^$' | sed 's/[[:space:]]*=[[:space:]]*/=/')
else
    echo "[WARN] ${ENV_FILE} no encontrado; usando variables de entorno del proceso."
fi

# ---------------------------------------------------------------------------
# 2. Verificar SECRET_KEY
# ---------------------------------------------------------------------------
if [ -z "${SECRET_KEY:-}" ]; then
    echo "[ERROR] SECRET_KEY no esta definida. Abortando." >&2
    exit 1
fi

if [ "${SECRET_KEY}" = "${DEV_SECRET}" ]; then
    echo "[ERROR] SECRET_KEY tiene el valor de desarrollo. Abortando." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# 3. Verificar DATABASE_URL
# ---------------------------------------------------------------------------
if [ -z "${DATABASE_URL:-}" ]; then
    echo "[ERROR] DATABASE_URL no esta definida. Abortando." >&2
    exit 1
fi

# Mostrar destino enmascarado (sin usuario/contrasena)
# IMPORTANTE: leer desde os.environ, NUNCA interpolar DATABASE_URL en bash
_db_display=$(python3 -c "
import os
from urllib.parse import urlparse
u = os.environ.get('DATABASE_URL', '')
if not u:
    print('<DATABASE_URL no definida>')
else:
    try:
        p = urlparse(u)
        print(f'{p.scheme}://***:***@{p.hostname}:{p.port}{p.path}')
    except Exception:
        print('<URL no analizable>')
" 2>/dev/null || echo "<URL no analizable>")
echo "[INFO] DATABASE_URL -> ${_db_display}"

# ---------------------------------------------------------------------------
# 4. Verificar EXPECTED_DATABASE_NAME (opcional)
# ---------------------------------------------------------------------------
if [ -n "${EXPECTED_DATABASE_NAME:-}" ]; then
    echo "[INFO] EXPECTED_DATABASE_NAME declarado: ${EXPECTED_DATABASE_NAME}"
    echo "[INFO] La validacion se realizara en alembic/env.py al conectar."
fi

# ---------------------------------------------------------------------------
# 5. Verificar ejecutable Python del venv
# ---------------------------------------------------------------------------
PYTHON_BIN="venv/bin/python"
if [ ! -f "${PYTHON_BIN}" ]; then
    echo "[ERROR] No se encontro ${PYTHON_BIN}. Verificar que el venv este creado." >&2
    exit 1
fi

PYTHON_VERSION=$("${PYTHON_BIN}" --version 2>&1)
echo "[INFO] Python: ${PYTHON_VERSION}"

# Verificar que uvicorn esta disponible en el venv
if ! "${PYTHON_BIN}" -c "import uvicorn" 2>/dev/null; then
    echo "[ERROR] uvicorn no esta instalado en el venv." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# 6. Exportar NEBULAE_ENV para que security.py sepa el ambiente
# ---------------------------------------------------------------------------
export NEBULAE_ENV="${NEBULAE_ENV}"

# ---------------------------------------------------------------------------
# 7. Apagado controlado (trampa de senales)
# ---------------------------------------------------------------------------
_cleanup() {
    echo ""
    echo "[INFO] Senal de apagado recibida. Terminando uvicorn..."
    if [ -f "${PID_FILE}" ]; then
        rm -f "${PID_FILE}"
    fi
    exit 0
}
trap _cleanup SIGINT SIGTERM

# ---------------------------------------------------------------------------
# 7b. Preflight: verificar base de datos antes de iniciar
# ---------------------------------------------------------------------------
echo "[INFO] Ejecutando preflight de base de datos..."
if ! "${PYTHON_BIN}" -m app.core.preflight 2>&1; then
    echo "[ERROR] Preflight fallo. El backend no puede iniciar." >&2
    exit 2
fi
echo "[INFO] Preflight OK."

# ---------------------------------------------------------------------------
# 8. Iniciar uvicorn (SIN --reload)
# ---------------------------------------------------------------------------
echo "[INFO] Iniciando uvicorn..."
echo "[INFO] Comando: ${PYTHON_BIN} -m uvicorn main:app --host ${HOST} --port ${PORT} --workers ${WORKERS} --log-level ${LOG_LEVEL}"

"${PYTHON_BIN}" -m uvicorn main:app \
    --host "${HOST}" \
    --port "${PORT}" \
    --workers "${WORKERS}" \
    --log-level "${LOG_LEVEL}" \
    --access-log \
    --timeout-keep-alive 30 &

UVICORN_PID=$!
echo "${UVICORN_PID}" > "${PID_FILE}"
echo "[INFO] PID: ${UVICORN_PID} registrado en ${PID_FILE}"

# ---------------------------------------------------------------------------
# 9. Health check post-arranque
# ---------------------------------------------------------------------------
echo "[INFO] Esperando health check en http://${HOST}:${PORT}/health ..."
_healthy=0
for i in $(seq 1 ${HEALTH_TIMEOUT}); do
    sleep "${HEALTH_INTERVAL}"
    if curl -sf "http://${HOST}:${PORT}/health" > /dev/null 2>&1; then
        echo "[INFO] Health check OK (${i}s)"
        _healthy=1
        break
    fi
done

if [ "${_healthy}" -eq 0 ]; then
    echo "[ERROR] Health check no respondio en ${HEALTH_TIMEOUT}s. Terminando uvicorn..." >&2
    # Terminar uvicorn ordenadamente primero
    kill -TERM "${UVICORN_PID}" 2>/dev/null || true
    # Esperar hasta 10s a que cierre
    _wait=0
    while kill -0 "${UVICORN_PID}" 2>/dev/null && [ "${_wait}" -lt 10 ]; do
        sleep 1
        _wait=$((_wait + 1))
    done
    # Forzar si todavia vive
    kill -KILL "${UVICORN_PID}" 2>/dev/null || true
    rm -f "${PID_FILE}"
    echo "[ERROR] Backend terminado por health check fallido. Exit code: 2." >&2
    exit 2
fi

# ---------------------------------------------------------------------------
# 10. Esperar al proceso (foreground para servicios administrados)
# ---------------------------------------------------------------------------
wait ${UVICORN_PID}
EXIT_CODE=$?
echo "[INFO] uvicorn termino con exit code: ${EXIT_CODE}"
rm -f "${PID_FILE}"
exit ${EXIT_CODE}