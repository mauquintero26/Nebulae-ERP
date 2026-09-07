# RESUMEN DE SESIÓN — Hardening y Certificación Real de Fase 6
**Fecha:** 2026-09-07  
**Rama:** `main` (base `902ee8c`)  
**Base de datos test:** `erp_test` en `fa6_002`  
**Base de datos prod:** `erpdb` en `fa1a_002` (INTACTA)

---

## Objetivo
Realizar Hardening y Certificación Real de Fase 6 del ERP-CRM Nebulae:
implementar y certificar los 7 bloqueos de seguridad, paridad, gobernanza,
auditoría, checkout, backfill y cabeceras. Sin modificar frontend ni tocar erpdb.

---

## Cambios Realizados

### 1. Migración Alembic `fa6_002` — Hardening de Gobernanza y Auditoría
**Archivo:** `backend/alembic/versions/fa6_002_hardening_governance_audit.py`

- Columnas añadidas a `legacy_consolidation_audit_logs`:
  - `actor_user_id`, `latency_ms`, `result_summary`, `idempotency_key`, `fingerprint`
- Columnas añadidas a `legacy_governance_policies`:
  - `change_reason`, `actor_user_id`
- Secuencias PostgreSQL atómicas creadas:
  - `seq_ven_so`, `seq_pec_po`, `seq_cot_sq`
- Trigger PostgreSQL inmutable:
  - Función `trg_prevent_audit_log_mutation()` + trigger `trg_audit_log_immutable`
  - Bloquea **UPDATE** y **DELETE** en `legacy_consolidation_audit_logs`

### 2. Protección `backend/alembic/env.py`
- Prioriza `TEST_DATABASE_URL` sobre `DATABASE_URL` para garantizar que erpdb nunca sea afectada.

### 3. Servicio Central `backend/app/services/legacy_consolidation.py`
- `format_sunset_header`: fecha RFC 1123 HTTP-date estricta.
- `validate_sunset_date`: rechaza fechas pasadas (HTTP 422).
- `record_legacy_audit_log`: soporta `actor_user_id`, `latency_ms`, `result_summary`, `idempotency_key`, `fingerprint`.
- `compare_sales_parity`: 100% read-only, cero mutaciones, reporta `ambiguous_candidates`.
- `compare_purchases_parity`: inspecciona proveedor, moneda, TRM, total, estado, líneas, SKUs y recepciones.
- `compare_financial_parity`: universo enlazado sin doble conteo ni mezcla de universos.
- `_get_next_sale_order_numero`, `_get_next_purchase_order_numero`, `_get_next_quotation_numero`: secuencias PostgreSQL atómicas (eliminado `MAX(id)+1`).
- `intercept_sales_order_write` & `intercept_purchase_order_write`: idempotencia estricta, advisory lock, replay idéntico → mismo par, replay divergente → `409 Conflict`. Modos `DUAL_WRITE`, `READ_ONLY` (410), `CANONICAL_PRIMARY`.
- `reconcile_and_backfill_orphan_legacy`: advisory lock, savepoints por registro (`db.begin_nested()`), captura segura de errores, nunca retorna `status="success"` si hay fallas.

### 4. Router de Observabilidad `backend/app/api/v1/legacy_observability.py`
- `PATCH /governance`: validación anti-contradicciones (`READ_ONLY` + `allow_legacy_writes=True` → 400), validación `sunset_date`, auditoría inmutable con `old_value`, `new_value`, `change_reason`, `actor_user_id`.
- `GET /parity-report`: estrictamente read-only (`persist=False`).
- `GET /metrics`: telemetría real con latencias, contadores de escrituras y lecturas.
- `GET /audit-logs`: expone columnas de auditoría inmutable.

### 5. Routers Legacy Actualizados
- `backend/app/api/v1/sales.py`: `Idempotency-Key`, registro `LEGACY_READ` con latencia real y usuario.
- `backend/app/api/v1/purchases.py`: `Idempotency-Key`, registro `LEGACY_READ` con latencia real.
- `backend/app/api/v1/store.py`:
  - Checkout seguro delegando en bodega ecommerce autorizada.
  - Precios calculados 100% desde BD.
  - Reserva pesimista concurrente en `InventoryOwnerBalance` (con `_get_real_sellable_stock`).
  - Aislamiento MAU: stock de propietario "MAU" nunca se usa para pedidos NEBULAE.
  - Estado inicial `PENDIENTE_PAGO`.
  - Cero pagos confirmados automáticos.
  - Idempotencia con replay divergente → 409.

### 6. Suite de Pruebas `backend/tests/test_fase6_legacy_consolidation.py`
18 tests exhaustivos que cubren los 7 bloqueos:
- `test_01`: Esquema DB y secuencias.
- `test_02`: Trigger inmutable bloquea UPDATE/DELETE.
- `test_03`: Paridad de ventas read-only, cero INSERT/UPDATE/DELETE.
- `test_04`: Gobernanza rechaza contradicciones y valida sunset_date.
- `test_05`: Reporte de paridad estrictamente read-only.
- `test_06`: Cabecera Sunset en formato RFC 1123 HTTP-date.
- `test_07`: Paridad financiera sin doble conteo.
- `test_08`: Idempotencia DUAL_WRITE ventas (replay idéntico → 200, divergente → 409).
- `test_09`: Idempotencia DUAL_WRITE compras.
- `test_10`: Modos READ_ONLY (escritura → 410) y CANONICAL_PRIMARY.
- `test_11`: Telemetría LEGACY_READ con latencia y métricas.
- `test_12`: Backfill transaccional con savepoints, captura segura de errores.
- `test_13`: Checkout store con idempotencia y replay divergente → 409.
- `test_14`: Checkout: precios desde BD, stock insuficiente → 409.
- `test_15`: Aislamiento patrimonial MAU vs NEBULAE.
- `test_16`: RBAC en observabilidad.
- `test_17`: Coexistencia finanzas + CRM.
- `test_18`: Sincronización factura ↔ SaleOrder.

### 7. Tests de Migración Actualizados
- `test_z_fase3_migrations.py` y `test_z_fase4_migrations.py`: añadido `fa6_001` y `fa6_002` como versiones `head` válidas en los roundtrips.

---

## Resultados de Pruebas

### Suite Fase 6 — Corrida 1
```
C:\Python314\python.exe -m pytest tests/test_fase6_legacy_consolidation.py -v
18 passed, 135 warnings in 101.19s (0:01:41)
```

### Suite Fase 6 — Corrida 2 (Idempotencia)
```
C:\Python314\python.exe -m pytest tests/test_fase6_legacy_consolidation.py -q
18 passed, 135 warnings in 122.55s (0:02:02)
```

### Pruebas de Concurrencia e Idempotencia — Corrida 1
```
C:\Python314\python.exe -m pytest tests/test_receipt_concurrency.py tests/test_receipt_idempotency.py tests/test_receipt_partial.py -q
13 passed, 183 warnings in 156.29s (0:02:36)
```

### Pruebas de Concurrencia e Idempotencia — Corrida 2
```
C:\Python314\python.exe -m pytest tests/test_receipt_concurrency.py tests/test_receipt_idempotency.py tests/test_receipt_partial.py -q
13 passed, 183 warnings in 154.57s (0:02:34)
```

### Suite Completa del Backend
```
C:\Python314\python.exe -m pytest tests/ -q
365 passed, 0 failed, 0 errors, 0 skipped, 3231 warnings in 3169.43s (0:52:49)
```

---

## Verificaciones Obligatorias

| Verificación | Resultado |
|---|---|
| Frontend `npm run build` | ✅ 0 errores, 74/74 rutas generadas |
| Frontend archivos modificados | ✅ CERO (frontend intacto) |
| `erp_test` versión Alembic | ✅ `fa6_002` |
| `erpdb` versión Alembic | ✅ `fa1a_002` (INTACTA) |
| Suite Fase 6 x2 corridas | ✅ 18/18 passed x2 |
| Concurrencia e idempotencia x2 | ✅ 13/13 passed x2 |
| Suite completa backend | ✅ 365 passed, 0 failed |

---

## Estado de Base de Datos

- **`erp_test`**: migrada a `fa6_002` con secuencias, trigger inmutable, y columnas de auditoría.
- **`erpdb`** (producción): **100% INTACTA** en `fa1a_002`. No se ejecutó ninguna migración sobre ella.

---

## Archivos Modificados en Esta Sesión

```
backend/alembic/env.py
backend/alembic/versions/fa6_002_hardening_governance_audit.py  [NUEVO]
backend/app/models/fase6.py
backend/app/services/legacy_consolidation.py
backend/app/api/v1/legacy_observability.py
backend/app/api/v1/sales.py
backend/app/api/v1/purchases.py
backend/app/api/v1/store.py
backend/tests/test_fase6_legacy_consolidation.py  [NUEVO]
backend/tests/test_z_fase3_migrations.py  [actualizado versiones válidas]
backend/tests/test_z_fase4_migrations.py  [actualizado versiones válidas]
RESUMEN_SESSION.md
```

---

## Nota Final
- Frontend: **CERO** archivos tocados. Build 100% limpio.
- No se inició Fase 7. Detención formal tras certificación completa.
