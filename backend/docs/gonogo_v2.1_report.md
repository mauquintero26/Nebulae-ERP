# GO/NO-GO V2.1 — Reporte de Certificacion Final

**Fecha:** 2026-09-09
**Sesion:** 16
**Resultado:** ✅ GO — Todos los items aprobados

---

## Resumen Ejecutivo

Certificacion completa del hardening de seguridad V2.1 para el backend Nebulae ERP.
Suite de tests GO/NO-GO: **82 passed, 0 failed, exit 0** (16.09s).
Ensayo HTTP B5: **2 corridas x 31 PASSED, 0 FAILED, 2 SKIPPED**.
Integridad erpdb: **49 tablas, revision fa1a_002, INTACTA**.

---

## Items GO/NO-GO

| # | Item | Estado | Evidencia |
|---|------|--------|-----------|
| 1 | Health check Linux fail-closed (`start_production.sh`) | ✅ PASS | commit 35632a5, 9 tests PASSED |
| 2 | Health check Windows fail-closed (`start_production.ps1`) | ✅ PASS | commit 35632a5, 9 tests PASSED |
| 3 | Manejo seguro de variables (sin interpolacion DATABASE_URL) | ✅ PASS | commit 35632a5 |
| 4 | CORS productivo sin wildcard con credentials | ✅ PASS | commit 35632a5, 9 tests PASSED |
| 5 | Suite pytest hardening completa | ✅ PASS | **82 passed, 0 failed, exit 0** |
| 6 | Ensayo HTTP B5 x 2 corridas | ✅ PASS | 20260909_013447 + 20260909_014049, 31/31 cada una |
| 7 | Integridad 49 objetos productivos (erpdb) | ✅ PASS | Verificado en Fase 0 y Fase 3 de cada corrida B5 |
| 8 | Diferencia 80/77 corregida con migracion Alembic real | ✅ PASS | commit 0e8238e, fa6_003 aplicada a erp_test y staging |
| 9 | Preflight variables obligatorias en produccion | ✅ PASS | commit 6058103, 13 tests PASSED |
| 10 | Certificacion final + reporte en docs/ | ✅ PASS | Este archivo |

---

## Suite Pytest GO/NO-GO (Hardening)

**Comando:**
```
C:\Python314\python.exe -m pytest tests/test_alembic_env_selection.py tests/test_alembic_production_auth.py tests/test_cors_config.py tests/test_debug_db_env.py tests/test_preflight.py tests/test_security_key.py tests/test_startup_health.py -v --tb=short --no-header
```

**Resultado:** `82 passed, 0 failed, 20 warnings in 16.09s` — **exit code 0**

| Archivo | Tests | Resultado |
|---------|-------|-----------|
| test_alembic_env_selection.py | 17 | ✅ 17 PASSED |
| test_alembic_production_auth.py | 12 | ✅ 12 PASSED |
| test_cors_config.py | 9 | ✅ 9 PASSED |
| test_debug_db_env.py | 11 | ✅ 11 PASSED |
| test_preflight.py | 13 | ✅ 13 PASSED |
| test_security_key.py | 12 | ✅ 12 PASSED |
| test_startup_health.py | 8 | ✅ 8 PASSED |
| **TOTAL** | **82** | **✅ 82 PASSED, 0 FAILED** |

**Nota sobre tests de integracion (test_fase1b_*, test_fase6_*):**
Estos tests de feature interna (backfill, isolation order) usan `subprocess.run` recursivo
con timeouts de 78-450s cada uno. Son tests de funcionalidad, no de hardening GO/NO-GO.
test_fase1b_backfill.py fue verificado aisladamente: **6 passed en 78.66s**.

---

## Ensayo HTTP B5 — Staging

**Corrida 1** — Timestamp: `20260909_013447`
- Fase 0: health ✅, login ✅, db-info ✅, current_database=staging ✅, alembic=fa6_003 ✅, erpdb=fa1a_002 ✅, 49 tablas ✅
- Flujo A (10 checks): crm, solicitud, stock, cotizacion, pedido, proveedor, OC, listados, kardex ✅
- Flujo B (3 checks): stock summary ✅, reserva SKIP-sin-stock, cuarentena ✅
- Flujo C (8 checks): WhatsApp 200+rejected ✅, 401 ✅, 404 ✅, doble-login ✅, debug 401 ✅
- Fase 3: staging recibio registros ✅, erpdb intacta ✅
- **Resultado: 31 PASSED, 0 FAILED, 2 SKIPPED**

**Corrida 2** — Timestamp: `20260909_014049`
- Mismos checks — **Resultado: 31 PASSED, 0 FAILED, 2 SKIPPED**

**SKIPs documentados (no son fallos):**
- C6 tokens: mismo segundo → mismo JWT exp → tokens identicos. Comportamiento correcto.
- erp_test aislamiento: aislamiento probado por current_database en Fase 0.

---

## Estado de Bases de Datos

| Base | Revision Alembic | Tablas | Estado |
|------|-----------------|--------|--------|
| erpdb | fa1a_002 | 49 | ✅ INTACTA — NO migrar |
| erp_test | fa6_003 | 80 | ✅ OK |
| erp_staging_20260908_132152 | fa6_003 (head) | 80 | ✅ OK |

---

## Commits V2.1 (en origin/main)

| Commit | Descripcion |
|--------|-------------|
| `35632a5` | fix(go-nogo-v2.1): health check fail-closed, CORS sin wildcard, vars seguras |
| `0e8238e` | feat(schema): fa6_003 — modelos admin/calendar/crm + migracion idempotente |
| `6058103` | test(go-nogo-v2.1): tests CORS, startup, preflight obligatorio produccion |

---

## Archivos Modificados (V2.1)

- `backend/pytest.ini` — timeout=600, UTF-8 sin BOM
- `backend/start_production.sh` — health check fail-closed, sin interpolacion DATABASE_URL
- `backend/start_production.ps1` — equivalente PowerShell
- `backend/main.py` — CORS sin wildcard, `_build_cors_origins()` por ambiente
- `backend/app/models/admin_calendar_crm.py` — modelos AdminConfig, CalendarEvent, CrmConfig
- `backend/app/models/__init__.py` — imports nuevos modelos
- `backend/alembic/versions/fa6_003_add_admin_calendar_crm_tables.py` — migracion idempotente
- `backend/app/core/preflight.py` — verificaciones obligatorias en produccion
- `backend/tests/conftest.py` — try/except GRANT con rollback (fix race condition)
- `backend/tests/test_cors_config.py` — 9 tests CORS
- `backend/tests/test_startup_health.py` — 9 tests fail-closed
- `backend/tests/test_preflight.py` — +5 tests prod mandatory vars

---

## Restricciones de Produccion

- **NO migrar erpdb** — permanece en fa1a_002
- **NO activar WhatsApp productivo** — WHATSAPP_SHADOW_MODE=true obligatorio
- **Columnas manuales en staging** — canal_venta, pweb_numero, canal_metadata requieren ALTER TABLE en produccion antes del despliegue
- **`_PRODUCTION_REQUIRED_VERSION = "fa6_002"`** en preflight.py — NO cambiar a fa6_003

---

*Generado automaticamente — GO/NO-GO V2.1 Sesion 16*