# RESUMEN DE SESIÓN — Hardening y Certificación Real de Fase 6
**Fecha:** 2026-09-07
**Rama:** `main` — commit base: `902ee8c` → commit final: `ccceeab`
**Base de datos test:** `erp_test` → Alembic `fa6_002`
**Base de datos prod:** `erpdb` → Alembic `fa1a_002` (INTACTA, nunca tocada)
**Repositorio:** https://github.com/mauquintero26/Nebulae-ERP

---

## Objetivo de la Sesión

Realizar el **Hardening y Certificación Real de Fase 6** del ERP-CRM Nebulae.
Se implementaron y certificaron 7 bloqueos críticos de seguridad, paridad, gobernanza,
auditoría inmutable, checkout seguro, backfill transaccional y cabeceras HTTP.

**Restricciones cumplidas al 100%:**

| Restricción | Estado |
|---|---|
| NO modificar frontend | ✅ CERO archivos tocados en `frontend/` |
| NO tocar ni migrar `erpdb` | ✅ `erpdb` sigue en `fa1a_002`, intacta |
| NO iniciar Fase 7 | ✅ Detención formal tras certificación |
| Trabajar exclusivamente sobre `erp_test` | ✅ |
| Partir de `origin/main 902ee8c` | ✅ |

---

## Bloqueo 1 — Paridad Puramente de Lectura

**Archivos:** `backend/app/services/legacy_consolidation.py`, `backend/app/api/v1/legacy_observability.py`

**Qué se hizo:**
- `compare_sales_parity`: 100% read-only. Cero `INSERT/UPDATE/DELETE` al consultar.
  Eliminado el enlace automático por `customer_id` + diferencia temporal.
  Casos ambiguos se reportan en `ambiguous_candidates`, nunca se enlazan.
- `compare_purchases_parity`: Compara proveedor, moneda, TRM, total, estado,
  SKUs, cantidades, líneas y recepciones. Nunca crea ni modifica entidades.
- `compare_financial_parity`: Compara universo estrictamente enlazado
  (`legacy_linked_revenue` vs `canonical_linked_revenue`) sin doble conteo
  ni mezcla de universos heterogéneos.
- `GET /legacy/parity-report`: ejecuta con `persist=False`; cero escrituras en BD.
- Las vinculaciones **solo pueden realizarse** mediante `reconcile-sync`.

**Tests:** `test_03`, `test_05`, `test_07`

---

## Bloqueo 2 — Idempotencia y Concurrencia

**Archivo:** `backend/alembic/versions/fa6_002_hardening_governance_audit.py`,
`backend/app/services/legacy_consolidation.py`

**Qué se hizo:**
- **Secuencias PostgreSQL atómicas** creadas en migración `fa6_002`:
  - `seq_ven_so` → numeración de ventas
  - `seq_pec_po` → numeración de compras
  - `seq_cot_sq` → numeración de cotizaciones
- Eliminado completamente el patrón `MAX(id) + 1` en todos los numeradores.
- `_get_next_sale_order_numero`, `_get_next_purchase_order_numero`,
  `_get_next_quotation_numero`: usan `SELECT nextval('seq_...')`. Thread-safe.
- `intercept_sales_order_write` y `intercept_purchase_order_write`:
  - Advisory lock (`pg_try_advisory_xact_lock`) por fingerprint SHA-256.
  - **Replay idéntico** (mismo fingerprint) → retorna mismo par, código `200/201`.
  - **Replay divergente** (mismo `idempotency_key`, fingerprint distinto) → `409 Conflict`.

**Tests:** `test_08`, `test_09`, `test_receipt_concurrency.py`, `test_receipt_idempotency.py`

---

## Bloqueo 3 — Gobernanza Real

**Archivo:** `backend/app/api/v1/legacy_observability.py`,
`backend/app/services/legacy_consolidation.py`

**Qué se hizo:**
- **`DUAL_WRITE`**: Escribe en ambos sistemas (legacy + canónico) de forma atómica.
- **`READ_ONLY`**: Todas las escrituras legacy devuelven `HTTP 410 Gone`.
  Rechaza configuración con `allow_legacy_writes=True` → `HTTP 400`.
- **`CANONICAL_PRIMARY`**: Ejecuta el servicio canónico sin crear entidad legacy primaria.
- **Anti-contradicciones**: `PATCH /governance` rechaza configuraciones
  incoherentes con `400` (ej: `READ_ONLY` + `allow_legacy_writes=True`).
- **Validación `sunset_date`**: Rechaza fechas pasadas/inválidas con `422`.
- **Auditoría de cambio**: Registra `old_value`, `new_value`, `actor_user_id`,
  fecha y `change_reason` en cada cambio de política.

**Tests:** `test_04`, `test_10`

---

## Bloqueo 4 — Auditoría Inmutable y Observabilidad

**Archivos:** `fa6_002_hardening_governance_audit.py`,
`backend/app/api/v1/legacy_observability.py`,
`backend/app/api/v1/sales.py`,
`backend/app/api/v1/purchases.py`

**Qué se hizo:**

Columnas añadidas a `legacy_consolidation_audit_logs`:
- `actor_user_id` — quién ejecutó la acción
- `latency_ms` — tiempo real de ejecución en milisegundos
- `result_summary` — resumen JSON del resultado
- `idempotency_key` — clave de idempotencia usada
- `fingerprint` — hash SHA-256 del contenido del request

Columnas añadidas a `legacy_governance_policies`:
- `change_reason` — motivo del cambio de política
- `actor_user_id` — quién cambió la política

**Trigger PostgreSQL inmutable** `trg_audit_log_immutable`:
- Función PL/pgSQL `trg_prevent_audit_log_mutation()` lanza `EXCEPTION`
  al detectar cualquier `UPDATE` o `DELETE` sobre `legacy_consolidation_audit_logs`.
- Probado en roundtrip: ejecutar `UPDATE` devuelve error de BD; registros permanentes.

**Endpoints de observabilidad:**
- `GET /audit-logs`: expone todos los campos nuevos de auditoría.
- `GET /metrics`: telemetría real (`total_audit_events`, `total_writes_intercepted`,
  `total_legacy_reads`, `average_latency_ms`).
- `GET /parity-report`: read-only, sin efecto secundario.

**Registro `LEGACY_READ`** en `sales.py` y `purchases.py`:
- `GET /` y `GET /{id}` registran en audit log con latencia medida con `time.time()`
  y `actor_user_id` extraído del JWT.

**Tests:** `test_02`, `test_11`, `test_16`

---

## Bloqueo 5 — Checkout Único y Seguro

**Archivo:** `backend/app/api/v1/store.py`

**Qué se hizo:**
- **Precios desde BD**: El precio se lee de `ProductSKU.sale_price`. No se acepta precio del cliente.
- **Bodega ecommerce autorizada**: `_get_authorized_ecommerce_warehouses()` filtra
  solo bodegas válidas; nunca usa bodegas MAU.
- **Bloqueo pesimista concurrente**: `SELECT ... FOR UPDATE` sobre
  `InventoryOwnerBalance` + re-verificación con `_get_real_sellable_stock()`
  dentro de la misma transacción. Previene oversell bajo concurrencia.
- **Aislamiento MAU**: Stock de propietario `"MAU"` nunca es consumido en pedidos
  de `"NEBULAE"`. El inventario se filtra estrictamente por `owner="NEBULAE"`.
- **Estado inicial `PENDIENTE_PAGO`**: Ningún pago se confirma automáticamente.
- **Cero pagos confirmados**: `sale_order_payments` queda vacío tras el checkout.
- **Idempotencia**: `Idempotency-Key` en header. Replay idéntico → misma orden
  `200/201`. Replay divergente → `409 Conflict`.

**Tests:** `test_13`, `test_14`, `test_15`

---

## Bloqueo 6 — Backfill Transaccional

**Archivo:** `backend/app/services/legacy_consolidation.py`

**Qué se hizo:**
- `reconcile_and_backfill_orphan_legacy`:
  - Advisory lock por sesión para evitar ejecuciones paralelas.
  - **Savepoints por registro**: `db.begin_nested()` antes de cada entidad huérfana.
  - Si un registro falla: `sp.rollback()` revierte solo ese; la sesión queda limpia.
  - Si tiene éxito: `sp.commit()` confirma ese savepoint.
  - **No retorna `status="success"`** si hay errores; retorna `status="partial"`
    con la lista de errores capturados.
  - La sesión principal nunca queda en `InFailedSqlTransaction`.

**Test:** `test_12`

---

## Bloqueo 7 — Cabeceras y Fechas

**Archivo:** `backend/app/services/legacy_consolidation.py`

**Qué se hizo:**
- `format_sunset_header(dt)`: Genera cabecera `Sunset` en formato
  RFC 1123 HTTP-date estricto: `"Sun, 06 Nov 1994 08:49:37 GMT"`.
  Implementado con `email.utils.format_datetime(dt, usegmt=True)`.
- `validate_sunset_date(date_str)`:
  - Formato inválido → `HTTP 422`.
  - Fecha en el pasado → `HTTP 422`.
  - Devuelve `datetime` parseado para uso seguro.
- `apply_deprecation_headers(response, policy)`: Aplica `Sunset`, `Link`,
  `Deprecation` a la respuesta HTTP si la política tiene `sunset_date`.

**Test:** `test_06`

---

## Archivos Modificados / Creados en Esta Sesión

| Archivo | Acción |
|---|---|
| `backend/alembic/env.py` | Modificado — prioriza `TEST_DATABASE_URL` |
| `backend/alembic/versions/fa6_002_hardening_governance_audit.py` | **NUEVO** |
| `backend/app/models/fase6.py` | Modificado — nuevas columnas |
| `backend/app/services/legacy_consolidation.py` | Modificado — 7 bloqueos |
| `backend/app/api/v1/legacy_observability.py` | Modificado — gobernanza, métricas |
| `backend/app/api/v1/sales.py` | Modificado — `Idempotency-Key`, `LEGACY_READ` |
| `backend/app/api/v1/purchases.py` | Modificado — `Idempotency-Key`, `LEGACY_READ` |
| `backend/app/api/v1/store.py` | Modificado — checkout seguro |
| `backend/tests/test_fase6_legacy_consolidation.py` | **NUEVO** — 18 tests |
| `backend/tests/test_z_fase3_migrations.py` | Modificado — fa6_002 como head válido |
| `backend/tests/test_z_fase4_migrations.py` | Modificado — fa6_002 como head válido |
| `RESUMEN_SESSION.md` (raíz) | Actualizado |
| `docs/RESUMEN_SESSION.md` (este archivo) | Actualizado |

---

## Diagnósticos y Correcciones

### Bug 1 — `InventoryOwnerBalance.quantity_on_hand` no existe
**Problema:** El modelo real (`backend/app/models/fase1b.py`) solo tiene la columna
`quantity`. El código en `store.py` y los tests de Fase 6 usaban columnas
inexistentes `quantity_on_hand` y `quantity_reserved`.

**Corrección aplicada:**
- `store.py` línea 185: reemplazado `bal.quantity_on_hand - bal.quantity_reserved`
  por re-verificación con `_get_real_sellable_stock(db, sku.id, default_wh.id, "NEBULAE")`.
- Fixture `base_catalog_and_customer` en `test_fase6_legacy_consolidation.py`:
  cambiado a `InventoryOwnerBalance(quantity=Decimal("10.0"))`.
- `test_15`: `bal_mau` cambiado a `InventoryOwnerBalance(quantity=Decimal("50.0"))`.

### Bug 2 — Roundtrips de migración rechazaban `fa6_002` como head válido
**Problema:** `test_z_fase3_migrations.py` y `test_z_fase4_migrations.py` tenían
hardcoded la lista de versiones válidas del head solo hasta `fa5_002`. Al existir
`fa6_002`, el assert fallaba:
```
AssertionError: 'fa6_002' not in ('fa3_002', 'fa4_001', 'fa4_002', 'fa5_001', 'fa5_002')
```

**Corrección aplicada:** Añadido `"fa6_001"` y `"fa6_002"` a la tupla de
versiones válidas en ambos archivos.

---

## Resultados de Todas las Pruebas

### Suite Fase 6 — Corrida 1
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
| test_05 | Parity-report estrictamente read-only | ✅ PASSED |
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

### Suite Fase 6 — Corrida 2 (verificación de idempotencia de suite)
```
pytest tests/test_fase6_legacy_consolidation.py -q
18 passed, 135 warnings in 122.55s (0:02:02)
```

### Suite Fase 6 — Corrida 3 (post-fix migraciones)
```
pytest tests/test_fase6_legacy_consolidation.py -q
18 passed, 135 warnings in 101.92s (0:01:41)
```

### Pruebas de Concurrencia e Idempotencia de Recepciones — Corrida 1
```
pytest tests/test_receipt_concurrency.py tests/test_receipt_idempotency.py tests/test_receipt_partial.py -q
13 passed, 183 warnings in 156.29s (0:02:36)
```

### Pruebas de Concurrencia e Idempotencia de Recepciones — Corrida 2
```
pytest tests/test_receipt_concurrency.py tests/test_receipt_idempotency.py tests/test_receipt_partial.py -q
13 passed, 183 warnings in 154.57s (0:02:34)
```

### Pruebas de Migración Roundtrip — Post-fix
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
| test_erpdb_produccion_permanece_inalterada (fa3) | ✅ PASSED |
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

| Verificación | Resultado |
|---|---|
| `npm run build` frontend | ✅ 0 errores, 74/74 rutas generadas |
| Archivos `frontend/` modificados | ✅ CERO |
| `erp_test` versión Alembic | ✅ `fa6_002` |
| `erpdb` versión Alembic | ✅ `fa1a_002` INTACTA |
| Suite Fase 6 x3 corridas | ✅ 18/18 passed x3 |
| Concurrencia e idempotencia x2 | ✅ 13/13 passed x2 |
| Suite completa backend | ✅ **365 passed, 0 failed** |

---

## Estado de las Bases de Datos

| BD | Versión Alembic | Estado |
|---|---|---|
| `erp_test` | `fa6_002` | ✅ Migrada y certificada |
| `erpdb` producción | `fa1a_002` | ✅ 100% INTACTA |

**Contenido de la migración `fa6_002`:**
- Columnas en `legacy_consolidation_audit_logs`: `actor_user_id`, `latency_ms`, `result_summary`, `idempotency_key`, `fingerprint`
- Columnas en `legacy_governance_policies`: `change_reason`, `actor_user_id`
- Secuencias: `seq_ven_so`, `seq_pec_po`, `seq_cot_sq`
- Trigger: `trg_audit_log_immutable` (bloquea UPDATE/DELETE permanentemente)

Roundtrip verificado: `upgrade fa6_002` → `downgrade fa3_001` → `downgrade fa2_003` → `upgrade head (fa6_002)` ✅

---

## Commits en GitHub

| Commit | Mensaje | Archivos |
|---|---|---|
| `20ec310` | `feat(fase6): hardening de paridad, idempotencia, gobernanza...` | 12 archivos, +1679 / -704 líneas |
| `ccceeab` | `docs: actualizar RESUMEN_SESSION con detalle exhaustivo de Fase 6` | 1 archivo |

```
To https://github.com/mauquintero26/Nebulae-ERP.git
   902ee8c..ccceeab  main -> main
```

---

## Nota Final

- **Frontend:** CERO archivos tocados. Build limpio 74/74 rutas.
- **erpdb:** 100% intacta. Ninguna migración ejecutada sobre producción.
- **Fase 7:** NO iniciada. Detención formal. Requiere autorización expresa del usuario.
