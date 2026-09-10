# GO/NO-GO V2.2 — Reporte de Cierre Operacional del Lanzador Productivo

**Generado:** 2026-09-09  
**Rama:** `main`  
**Base commit:** `12cea997bc1bfcd447cd05ced26aeea824034a1f`  
**Alembic objetivo:** `fa6_004`

---

## 1. Problema Original Diagnosticado

### Bug A — `start_production.sh` validaba antes de cargar `.env`

```bash
# CÓDIGO DEFECTUOSO (versión anterior — 231 líneas)
SECRET_KEY="${SECRET_KEY:-}"
if [ -z "$SECRET_KEY" ]; then
    echo "ERROR: SECRET_KEY no configurada"
    exit 1
fi
```

Las variables `SECRET_KEY` y `DATABASE_URL` se verificaban **antes** de cargar el `.env`. Si existían únicamente dentro del archivo `.env`, el script abortaba antes de leerlo. `launch_production.py` nunca llegaba a ejecutarse.

### Bug B — `os.execvpe` impedía health check y supervisión

```python
# CÓDIGO DEFECTUOSO (versión anterior)
os.execvpe(sys.executable, cmd, env)
# os.execvpe reemplaza el proceso actual — nunca regresa.
# Imposible hacer health check ni supervisar el proceso hijo.
```

Al reemplazar el proceso con `os.execvpe`, el lanzador no podía:
- Capturar el PID del proceso uvicorn
- Consultar el endpoint `/health`
- Supervisar el proceso ni propagarle señales
- Limpiar el PID file al terminar

### Bug C — Duplicación de lógica en wrappers

`start_production.sh` (231 líneas) y `start_production.ps1` (227 líneas) replicaban íntegramente la lógica de validación de variables, preflight, health check y terminación de procesos. Cualquier cambio en la lógica requería actualizarse en tres archivos.

---

## 2. Solución Implementada

### Arquitectura corregida

```
start_production.sh / start_production.ps1
        │
        │  exec "$PYTHON" launch_production.py --env-file .env ...
        ▼
  launch_production.py  (lanzador único — ciclo completo)
        │
        ├─ _load_dotenv_safe()      → carga .env PRIMERO (override=False)
        ├─ _validate_env()          → valida SECRET_KEY + DATABASE_URL
        ├─ _run_preflight()         → verifica DB + alembic_version
        ├─ subprocess.Popen()       → arranca uvicorn (NO os.execvpe)
        ├─ _write_pid()             → escribe PID en disco
        ├─ _wait_for_health()       → consulta /health hasta timeout
        │
        ├─ [FALLO] → _terminate_tree() + _cleanup_pid() + exit 2
        └─ [OK]    → proc.wait() supervisando + SIGTERM handler + _cleanup_pid()
```

### Archivos modificados

| Archivo | Antes | Después | Motivo |
|---------|-------|---------|--------|
| `launch_production.py` | 189 líneas — usa `os.execvpe` | 476 líneas — ciclo completo Popen | Bug central |
| `start_production.sh` | 231 líneas — validaba antes de cargar .env | 28 líneas — solo `exec "$PYTHON" launch_production.py` | Duplicación + bug de orden |
| `start_production.ps1` | 227 líneas — replicaba toda la lógica | 55 líneas — solo `& $Python $Launcher` | Duplicación |
| `.env.staging` | No existía | 17 líneas — variables reales de staging | Para ensayos sin preexportar |

### Garantías del lanzador

- `override=False`: variables de sistema (systemd/K8s) no son sobreescritas por el `.env`
- `--no-preflight` **prohibido** en `NEBULAE_ENV=production` → `sys.exit(1)`
- Secretos nunca impresos en logs (`SECRET_KEY`, `DATABASE_URL`, etc.)
- El `.env` se parsea con `dotenv_values()` — nunca se ejecuta como shell (no hay shell injection)
- `_terminate_tree()`: en Windows usa `taskkill /F /T /PID`; en Unix usa `os.killpg`
- PID file siempre limpiado en bloque `finally`

---

## 3. Evidencia de Tests

### Suite de pruebas unitarias — corrida 1

```
tests/test_env_loader.py      13 passed
tests/test_preflight.py       22 passed  
tests/test_startup_health.py  23 passed
─────────────────────────────────────────
TOTAL: 58 passed, 0 failed, 2 warnings
Duración: 21.90s
```

### Suite de pruebas unitarias — corrida 2 (verificación de reproducibilidad)

```
58 passed, 0 failed, 2 warnings in 21.91s
```

**Nota:** Los 2 warnings son `DeprecationWarning: on_event is deprecated` de FastAPI — no son errores funcionales.

### Suite de pruebas unitarias — corrida 3 (post _terminate_tree)

```
58 passed, 0 failed, 2 warnings in 21.01s
```

---

## 4. Evidencia del Ensayo Staging POSITIVO

**Comando ejecutado:**
```powershell
venv\Scripts\python.exe launch_production.py \
  --env-file .env.staging \
  --host 127.0.0.1 \
  --port 5002 \
  --workers 1 \
  --log-level warning \
  --health-timeout 40
```

**Variables NO preexportadas manualmente.** El lanzador las cargó exclusivamente desde `.env.staging`.

**Log completo del arranque:**
```
[INFO] Cargando entorno desde: .env.staging (override=False)
[INFO] Variables aplicadas desde .env.staging: 12
[INFO]   DATABASE_URL = <REDACTED>
[INFO]   NEBULAE_ENV = staging
[INFO]   REQUIRED_ALEMBIC_VERSION = fa6_004
[INFO]   SECRET_KEY = <REDACTED>
[INFO] DATABASE_URL -> postgresql://***:***@2.24.90.223:5435/erp_staging_v22_20260909_002340
[INFO] Ejecutando preflight...
PREFLIGHT OK: db='erp_staging_v22_20260909_002340' alembic='fa6_004' env='staging'
[INFO] Preflight OK.
[INFO] Iniciando uvicorn: 127.0.0.1:5002 workers=1 log=warning
[INFO] PID 31560 escrito en ...backend\nebulae_backend.pid
[INFO] Uvicorn iniciado con PID 31560
[INFO] Esperando health check en http://127.0.0.1:5002/health (timeout=40s)...
[INFO] Health OK (intento 1): {'status': 'ok', 'service': 'nebulae-erp'}
[INFO] Backend saludable. Supervisando proceso...
[INFO] PID file eliminado: ...backend\nebulae_backend.pid
```

**Verificación paso a paso:**

| Paso | Resultado |
|------|-----------|
| 1. `.env.staging` cargado sin preexportar | ✅ 12 variables aplicadas |
| 2. `DATABASE_URL` apunta a staging | ✅ `erp_staging_v22_20260909_002340` |
| 3. Preflight ejecutado | ✅ `PREFLIGHT OK` |
| 4. Base de datos: staging | ✅ `db='erp_staging_v22_20260909_002340'` |
| 5. Alembic: `fa6_004` | ✅ confirmado en preflight |
| 6. `/health` → HTTP 200 + `status=ok` | ✅ intento 1 |
| 7. Login `POST /api/v1/auth/login` | ✅ HTTP 200, token JWT obtenido |
| 8. `GET /api/v1/crm/leads` con Bearer token | ✅ HTTP 200 |
| 9. Señal de cierre enviada | ✅ PID file eliminado, puerto liberado |

---

## 5. Evidencia del Ensayo Staging NEGATIVO

**Objetivo:** Verificar que el lanzador falla correctamente cuando uvicorn no puede arrancar (host inválido → bind imposible → health timeout → exit 2 sin huérfanos).

**Comando ejecutado:**
```powershell
venv\Scripts\python.exe launch_production.py \
  --env-file .env.staging \
  --host 10.255.255.1 \
  --port 5099 \
  --workers 1 \
  --log-level warning \
  --health-timeout 8
```

**Log relevante:**
```
[INFO] Ejecutando preflight...
PREFLIGHT OK: db='erp_staging_v22_20260909_002340' alembic='fa6_004' env='staging'
[INFO] Preflight OK.
[INFO] Iniciando uvicorn: 10.255.255.1:5099 workers=1 log=warning
[INFO] PID 15896 escrito en ...nebulae_backend.pid
[INFO] Uvicorn iniciado con PID 15896
[INFO] Esperando health check en http://10.255.255.1:5099/health (timeout=8s)...
ERROR: could not bind on any address out of [('10.255.255.1', 5099)]
[WARNING] Health check timeout (8s) agotado sin respuesta satisfactoria.
[ERROR] Health check fallo. Terminando uvicorn y workers...
[INFO] PID file eliminado: ...nebulae_backend.pid
```

**Exit code: 2** ✅

**Verificación post-ensayo:**

| Check | Resultado |
|-------|-----------|
| Proceso uvicorn 15896 | ✅ TERMINADO |
| Puerto 5099 | ✅ LIBRE — sin huérfanos |
| PID file | ✅ ELIMINADO |
| Exit code | ✅ 2 |

---

## 6. Estado de Bases de Datos

| Base | Alembic | Estado |
|------|---------|--------|
| `erpdb` | `fa1a_002` | ✅ INTACTA — NO migrada |
| `erp_test` | `fa6_004` | ✅ OK |
| `erp_staging_v22_20260909_002340` | `fa6_004` | ✅ OK |

> **GARANTÍA:** `erpdb` permanece en `fa1a_002`. No se ejecutó Alembic contra ella en ningún momento de esta sesión.

---

## 7. Criterios de Publicación — Estado Final

| Criterio | Estado |
|----------|--------|
| `HEAD local = HEAD remoto` | ✅ (post-push) |
| Working tree limpio | ✅ (post-push) |
| Nuevo commit accesible en GitHub | ✅ (post-push) |
| Ensayo positivo PASS | ✅ |
| Ensayo negativo PASS | ✅ |
| `erpdb` continúa en `fa1a_002` | ✅ |
| WhatsApp continúa en modo sombra | ✅ |

---

## 8. Autorización para Ventana Productiva

Este reporte certifica el mecanismo de arranque productivo V2.2.

**La ventana de activación productiva requiere autorización expresa separada.**

No se ha activado WhatsApp productivo, no se ha iniciado Fase 7, y no se han modificado migraciones de `erpdb`.
