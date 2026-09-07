# RESUMEN DE SESIÓN — Hardening y Certificación Real de Fase 6
**Fecha:** 2026-09-07
**Rama:** `main` — commit base: `902ee8c` → commit final: `20ec310`
**Base de datos test:** `erp_test` → `fa6_002`
**Base de datos prod:** `erpdb` → `fa1a_002` (INTACTA, nunca tocada)

---

## Objetivo de la Sesión
Implementar y certificar el **Hardening Real de Fase 6** del ERP-CRM Nebulae, abarcando 7 bloqueos críticos:
paridad read-only, idempotencia con secuencias, gobernanza real, auditoría inmutable, checkout seguro,
backfill transaccional y cabeceras HTTP. Sin tocar frontend ni migrar erpdb.

---

## Restricciones Cumplidas

| Restricción | Estado |
|---|---|
| NO modificar frontend | ✅ CERO archivos tocados en `frontend/` |
| NO tocar ni migrar `erpdb` | ✅ `erpdb` en `fa1a_002`, intacta |
| NO iniciar Fase 7 | ✅ Detenido formalmente tras certificación |
| Trabajar sobre `erp_test` exclusivamente | ✅ |
| Partir de `origin/main 902ee8c` | ✅ |

---

## Bloqueos Implementados y Certificados

### BLOQUEO 1 — Paridad Puramente de Lectura

**Servicio:** `backend/app/services/legacy_consolidation.py`

- **`compare_sales_parity`**: 100% read-only. Cero `INSERT/UPDATE/DELETE` al consultar. Reporta `ambiguous_candidates` en lugar de enlazar casos dudosos automáticamente. Eliminado el enlace automático por `customer_id` + diferencia temporal.
- **`compare_purchases_parity`**: Compara proveedor, moneda, TRM, total, estado, SKUs, cantidades, líneas y recepciones. Nunca crea ni modifica entidades.
- **`compare_financial_parity`**: Compara el universo estrictamente enlazado (`legacy_linked_revenue` vs `canonical_linked_revenue`) sin doble conteo ni universos heterogéneos.
- **`GET /legacy/parity-report`**: Solo ejecuta comparación con `persist=False`; cero escrituras en BD.
- Las vinculaciones **solo pueden realizarse** mediante `reconcile-sync`. Las comparaciones de paridad son puro reporte.

**Tests que lo certifican:** `test_03`, `test_05`, `test_07`

---

### BLOQUEO 2 — Idempotencia y Concurrencia

**Migración:** `backend/alembic/versions/fa6_002_hardening_governance_audit.py`
**Servicio:** `backend/app/services/legacy_consolidation.py`

- **Secuencias PostgreSQL atómicas creadas**: `seq_ven_so`, `seq_pec_po`, `seq_cot_sq`. Eliminado completamente el patrón `MAX(id) + 1` en todos los numeradores de documentos.
- **`_get_next_sale_order_numero`**, **`_get_next_purchase_order_numero`**, **`_get_next_quotation_numero`**: Usan `SELECT nextval('seq_...')` directamente. Thread-safe y collision-free.
- **`intercept_sales_order_write`** y **`intercept_purchase_order_write`**:
  - Advisory lock (`pg_try_advisory_xact_lock`) por fingerprint para prevenir condiciones de carrera.
  - Replay idéntico (mismo fingerprint) → retorna mismo par de documentos, código `200/201`.
  - Replay divergente (mismo `idempotency_key`, fingerprint distinto) → `HTTP 409 Conflict`.
- **`fingerprint`** se calcula como hash SHA-256 determinista del contenido del payload.

**Tests:** `test_08`, `test_09`, `test_receipt_concurrency.py`, `test_receipt_idempotency.py`

---

### BLOQUEO 3 — Gobernanza Real

**Router:** `backend/app/api/v1/legacy_observability.py`
**Servicio:** `backend/app/services/legacy_consolidation.py`

- **Modo `DUAL_WRITE`**: Escribe en ambos sistemas (legacy + canónico) de forma atómica.
- **Modo `READ_ONLY`**: Todas las escrituras al sistema legacy devuelven `HTTP 410 Gone`. Rechaza configuración con `allow_legacy_writes=True` → `HTTP 400 Bad Request`.
- **Modo `CANONICAL_PRIMARY`**: Ejecuta el servicio canónico oficial sin crear entidad legacy primaria.
- **Anti-contradicciones**: `PATCH /governance` rechaza con `400` configuraciones incoherentes (ej: `READ_ONLY` + `allow_legacy_writes=True`).
- **Validación de `sunset_date`**: Rechaza fechas pasadas o inválidas con `HTTP 422`.
- **Auditoría de cambio**: Registra `old_value`, `new_value`, `actor_user_id`, fecha y `change_reason` en cada cambio de política.

**Tests:** `test_04`, `test_10`

---

### BLOQUEO 4 — Auditoría Inmutable y Observabilidad

**Migración:** `fa6_002_hardening_governance_audit.py`
**Router:** `backend/app/api/v1/legacy_observability.py`
**Routers:** `sales.py`, `purchases.py`

Columnas añadidas a `legacy_consolidation_audit_logs`:
- `actor_user_id` — quién ejecutó la acción
- `latency_ms` — tiempo real de ejecución en milisegundos
- `result_summary` — resumen del resultado (JSON o texto)
- `idempotency_key` — clave de idempotencia usada
- `fingerprint` — hash SHA-256 del contenido del request

**Trigger PostgreSQL inmutable** (`trg_audit_log_immutable`):
- Función PL/pgSQL `trg_prevent_audit_log_mutation()` lanza `EXCEPTION` al detectar cualquier `UPDATE` o `DELETE` sobre `legacy_consolidation_audit_logs`.
- Probado en roundtrip: ejecutar `UPDATE` devuelve error de BD; registros son permanentes.

**Endpoints de observabilidad:**
- `GET /audit-logs`: expone todos los campos de auditoría, incluyendo los nuevos.
- `GET /metrics`: telemetría real (`total_audit_events`, `total_writes_intercepted`, `total_legacy_reads`, `average_latency_ms`, etc.).
- `GET /parity-report`: read-only, sin efecto secundario.

**Registro `LEGACY_READ`** en `sales.py` y `purchases.py`:
- `GET /` y `GET /{id}` registran en audit log con latencia real medida y `actor_user_id` extraído del JWT.

**Tests:** `test_02`, `test_11`, `test_16`

---

### BLOQUEO 5 — Checkout Único y Seguro

**Router:** `backend/app/api/v1/store.py`

- **Precios calculados 100% desde BD**: El precio de venta se lee directamente de `ProductSKU.sale_price`. No se acepta precio del cliente.
- **Bodega ecommerce autorizada**: `_get_authorized_ecommerce_warehouses()` filtra bodegas válidas; nunca usa bodegas MAU ni no autorizadas.
- **Bloqueo pesimista concurrente**: `SELECT ... FOR UPDATE` sobre `InventoryOwnerBalance` + re-verificación con `_get_real_sellable_stock()` dentro de la misma transacción. Previene oversell bajo carga concurrente.
- **Aislamiento MAU**: Stock de propietario `"MAU"` nunca es consumido en pedidos de `"NEBULAE"`. El inventario se filtra estrictamente por `owner="NEBULAE"`.
- **Estado inicial `PENDIENTE_PAGO`**: Ningún pago se confirma automáticamente en el checkout.
- **Cero pagos confirmados**: La tabla `sale_order_payments` queda vacía tras el checkout. El pago se confirma por webhook externo.
- **Idempotencia de checkout**: `Idempotency-Key` en header; replay idéntico → misma orden `200/201`; replay divergente → `409 Conflict`.

**Tests:** `test_13`, `test_14`, `test_15`

---

### BLOQUEO 6 — Backfill Transaccional

**Servicio:** `backend/app/services/legacy_consolidation.py`

- **`reconcile_and_backfill_orphan_legacy`**:
  - Advisory lock por sesión para evitar ejecuciones paralelas.
  - **Savepoints por registro**: `db.begin_nested()` crea un savepoint antes de procesar cada entidad legacy huérfana.
  - Si un registro falla: `sp.rollback()` revierte solo ese registro, dejando la sesión PostgreSQL limpia.
  - Si un registro tiene éxito: `sp.commit()` confirma ese savepoint.
  - **No retorna `status="success"`** si hay errores parciales; retorna `status="partial"` con la lista de errores capturados.
  - La sesión principal nunca queda en estado `InFailedSqlTransaction`.

**Test:** `test_12`

---

### BLOQUEO 7 — Cabeceras y Fechas

**Servicio:** `backend/app/services/legacy_consolidation.py`

- **`format_sunset_header(dt)`**: Genera la cabecera `Sunset` en formato RFC 1123 HTTP-date estrictamente: `"Sun, 06 Nov 1994 08:49:37 GMT"`. Implementado con `email.utils.format_datetime(dt, usegmt=True)`.
- **`validate_sunset_date(date_str)`**: Rechaza:
  - Formato inválido → `HTTP 422`.
  - Fecha en el pasado → `HTTP 422`.
  - Devuelve el objeto `datetime` parseado para uso seguro.
- **`apply_deprecation_headers(response, policy)`**: Aplica `Sunset`, `Link`, `Deprecation` a la respuesta HTTP si la política tiene `sunset_date` configurada.

**Test:** `test_06`

---

## Archivos Modificados / Creados

| Archivo | Acción |
|---|---|
| `backend/alembic/env.py` | Modificado — prioriza `TEST_DATABASE_URL` |
| `backend/alembic/versions/fa6_002_hardening_governance_audit.py` | **NUEVO** — migración completa |
| `backend/app/models/fase6.py` | Modificado — nuevas columnas en modelos |
| `backend/app/services/legacy_consolidation.py` | Modificado — implementación de los 7 bloqueos |
| `backend/app/api/v1/legacy_observability.py` | Modificado — endpoints de gobernanza, métricas y auditoría |
| `backend/app/api/v1/sales.py` | Modificado — `Idempotency-Key`, registro `LEGACY_READ` |
| `backend/app/api/v1/purchases.py` | Modificado — `Idempotency-Key`, registro `LEGACY_READ` |
| `backend/app/api/v1/store.py` | Modificado — checkout seguro certificado |
| `backend/tests/test_fase6_legacy_consolidation.py` | **NUEVO** — 18 tests exhaustivos |
| `backend/tests/test_z_fase3_migrations.py` | Modificado — versión `fa6_002` añadida al roundtrip |
| `backend/tests/test_z_fase4_migrations.py` | Modificado — versión `fa6_002` añadida al roundtrip |
| `RESUMEN_SESSION.md` | Este archivo |

---

## Resultados de Pruebas — Detalle Completo

### Suite Específica Fase 6 — Corrida 1
```
pytest tests/test_fase6_legacy_consolidation.py -v
18 passed, 135 warnings in 101.19s (0:01:41)
```

| Test | Descripción | Resultado |
|---|---|---|
| test_01 | Esquema DB: columnas, secuencias PostgreSQL | ✅ PASSED |
| test_02 | Trigger inmutable bloquea UPDATE y DELETE | ✅ PASSED |
| test_03 | Paridad ventas read-only: cero INSERT/UPDATE/DELETE | ✅ PASSED |
| test_04 | Gobernanza: rechaza contradicciones, valida sunset_date | ✅ PASSED |
| test_05 | Parity-report: estrictamente read-only | ✅ PASSED |
| test_06 | Cabecera Sunset en formato RFC 1123 HTTP-date | ✅ PASSED |
| test_07 | Paridad financiera sin doble conteo | ✅ PASSED |
| test_08 | Idempotencia DUAL_WRITE ventas (replay idéntico vs divergente) | ✅ PASSED |
| test_09 | Idempotencia DUAL_WRITE compras | ✅ PASSED |
| test_10 | Modos READ_ONLY (→410) y CANONICAL_PRIMARY | ✅ PASSED |
| test_11 | Telemetría LEGACY_READ con latencia y métricas | ✅ PASSED |
| test_12 | Backfill transaccional con savepoints y captura de errores | ✅ PASSED |
| test_13 | Checkout store: idempotencia y replay divergente → 409 | ✅ PASSED |
| test_14 | Checkout: precios desde BD, stock insuficiente → 409 | ✅ PASSED |
| test_15 | Aislamiento patrimonial NEBULAE vs MAU | ✅ PASSED |
| test_16 | RBAC en observabilidad | ✅ PASSED |
| test_17 | Coexistencia finanzas + CRM | ✅ PASSED |
| test_18 | Sincronización factura ↔ SaleOrder | ✅ PASSED |

### Suite Específica Fase 6 — Corrida 2 (idempotencia de suite)
```
pytest tests/test_fase6_legacy_consolidation.py -q
18 passed, 135 warnings in 122.55s (0:02:02)
```

### Suite Específica Fase 6 — Corrida 3 (post-fix migraciones)
```
pytest tests/test_fase6_legacy_consolidation.py -q
18 passed, 135 warnings in 101.92s (0:01:41)
```

### Pruebas de Concurrencia e Idempotencia — Corrida 1
```
pytest tests/test_receipt_concurrency.py tests/test_receipt_idempotency.py tests/test_receipt_partial.py -q
13 passed, 183 warnings in 156.29s (0:02:36)
```

### Pruebas de Concurrencia e Idempotencia — Corrida 2
```
pytest tests/test_receipt_concurrency.py tests/test_receipt_idempotency.py tests/test_receipt_partial.py -q
13 passed, 183 warnings in 154.57s (0:02:34)
```

### Pruebas de Migración Roundtrip (después de corrección)
```
pytest tests/test_z_fase3_migrations.py tests/test_z_fase4_migrations.py -v
9 passed in 128.46s (0:02:08)
```

| Test | Resultado |
|---|---|
| test_fa3_001_tablas_y_columnas_creadas | ✅ PASSED |
| test_fa3_002_owner_constraints_and_numeric_precision | ✅ PASSED |
| test_fa3_static_audit_no_test_role_grants | ✅ PASSED |
| test_fa3_roundtrip_downgrade_upgrade | ✅ PASSED |
| test_erpdb_produccion_permanece_inalterada | ✅ PASSED |
| test_fa4_001_y_fa4_002_tablas_columnas_checks_indices | ✅ PASSED |
| test_fa4_static_audit_no_test_role_grants | ✅ PASSED |
| test_fa4_roundtrip_downgrade_fa3_002_upgrade_head | ✅ PASSED |
| test_erpdb_produccion_permanece_inalterada (fa4) | ✅ PASSED |

### Suite Completa del Backend — RESULTADO FINAL
```
pytest tests/ -q
365 passed, 0 failed, 0 errors, 0 skipped, 3231 warnings in 3169.43s (0:52:49)
```

---

## Verificaciones Obligatorias

| Verificación | Comando | Resultado |
|---|---|---|
| Frontend build | `npm run build` | ✅ 0 errores, 74/74 rutas |
| Frontend archivos tocados | `git diff --name-only frontend/` | ✅ CERO |
| `erp_test` versión Alembic | `SELECT version_num FROM alembic_version` | ✅ `fa6_002` |
| `erpdb` versión Alembic | `SELECT version_num FROM alembic_version` | ✅ `fa1a_002` INTACTA |
| Suite Fase 6 x3 corridas | `pytest test_fase6_legacy_consolidation.py` | ✅ 18/18 x3 |
| Concurrencia e idempotencia x2 | `pytest test_receipt_*.py` | ✅ 13/13 x2 |
| Suite completa backend | `pytest tests/ -q` | ✅ **365 passed, 0 failed** |

---

## Estado de las Bases de Datos

| Base de Datos | Versión Alembic | Estado |
|---|---|---|
| `erp_test` | `fa6_002` | ✅ Migrada correctamente |
| `erpdb` (producción) | `fa1a_002` | ✅ 100% INTACTA |

La migración `fa6_002` aplicada a `erp_test` incluye:
- Columnas de auditoría: `actor_user_id`, `latency_ms`, `result_summary`, `idempotency_key`, `fingerprint`
- Columnas de gobernanza: `change_reason`, `actor_user_id`
- Secuencias atómicas: `seq_ven_so`, `seq_pec_po`, `seq_cot_sq`
- Trigger inmutable: `trg_audit_log_immutable` sobre `legacy_consolidation_audit_logs`

Roundtrip verificado: `upgrade fa6_002` → `downgrade fa5_001` → `upgrade head (fa6_002)` ✅

---

## Diagnósticos y Correcciones Durante la Sesión

### 1. `InventoryOwnerBalance` — columnas inexistentes
**Problema:** El modelo real (`backend/app/models/fase1b.py`) solo tiene `quantity`, no `quantity_on_hand` ni `quantity_reserved`. El código en `store.py` y los tests usaban las columnas incorrectas.

**Corrección:**
- `store.py` línea 185: reemplazado `bal.quantity_on_hand - bal.quantity_reserved` por re-verificación con `_get_real_sellable_stock(db, sku.id, default_wh.id, "NEBULAE")`.
- `test_fase6_legacy_consolidation.py` fixture `base_catalog_and_customer`: cambiado a `InventoryOwnerBalance(quantity=Decimal("10.0"))`.
- `test_15`: cambiado `bal_mau` a `InventoryOwnerBalance(quantity=Decimal("50.0"))`.

### 2. Roundtrips de migración Fase 3 y Fase 4 — versión head desconocida
**Problema:** Los tests `test_z_fase3_migrations.py` y `test_z_fase4_migrations.py` tenían hardcoded la lista de versiones válidas del head hasta `fa5_002`. Al subir a `fa6_002`, el assert fallaba con `AssertionError: fa6_002 not in ('fa3_002', 'fa4_001', 'fa4_002', 'fa5_001', 'fa5_002')`.

**Corrección:** Añadido `"fa6_001"` y `"fa6_002"` a la tupla de versiones válidas en ambos archivos.

---

## Commit Final

```
[main 20ec310] feat(fase6): hardening de paridad, idempotencia, gobernanza, auditoria inmutable y checkout seguro
12 files changed, 1679 insertions(+), 704 deletions(-)
create mode 100644 RESUMEN_SESSION.md
create mode 100644 backend/alembic/versions/fa6_002_hardening_governance_audit.py

To https://github.com/mauquintero26/Nebulae-ERP.git
   902ee8c..20ec310  main -> main
```

---

## Nota Final
- **Frontend:** CERO archivos tocados. `npm run build` limpio con 74/74 rutas.
- **erpdb:** 100% intacta en `fa1a_002`. Ninguna migración ni query de escritura ejecutada.
- **Fase 7:** NO iniciada. Detención formal hasta autorización expresa del usuario.
