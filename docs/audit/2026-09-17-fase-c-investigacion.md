---
title: Nebulae ERP — Fase C: Investigación de Consolidación de Duplicados
date: 2026-09-17
status: Investigación completa. TD-05 y TD-03 (Parte 1) autorizados para plan de implementación. RF-07 bloqueado en espera de datos externos del usuario. Gobernanza de Inventario reclasificada como fase futura independiente.
scope: Solo lectura sobre el Mirror. Ningún archivo de código fue modificado para producir este informe.
workspace: C:\Users\jmqui\Nebulae_ERP_Work\Mirror
metodo: 3 agentes de solo lectura en paralelo (libros de pago, webhooks WhatsApp, catálogos+gobernanza), sobre la rama `main` del Mirror
spec_previo: docs/audit/2026-09-17-fase1-discovery-arquitectura.md (sección 19, roadmap original)
---

> Notación: **FACT** (verificado en código), **INFERENCE** (deducido, no 100% confirmado), **RECOMMENDATION** (propuesta), **UNKNOWN** (no verificable estáticamente).

## 0. Contexto

La Fase 1 (auditoría original) propuso una Fase C de "consolidación de duplicados" con 4 sub-ítems: TD-05 (libros de pago), RF-07 (webhooks WhatsApp), TD-03 (catálogos), y extender la gobernanza Fase 6 a Inventario. Antes de escribir cualquier plan de implementación, se investigó cada ítem a fondo. Los hallazgos cambian el alcance de 3 de los 4 ítems respecto a lo que el roadmap original asumía.

**Nota de consistencia:** los 3 agentes confirmaron que `catalog.py` e `inventory.py` siguen sin autenticación en la rama `main` del Mirror. Esto es consistente, no una regresión: los arreglos de la Fase A (SEC-03/SEC-04) viven en la rama `security-hotfix-fase-a`, que sigue sin fusionarse a `main` por decisión del usuario (pausar promoción hasta terminar el prompt maestro completo).

---

## 1. TD-05 — Libros de pago (`payment_transactions` vs `sale_order_payments`)

**Veredicto: no hay duplicación activa.** `payment_transactions` (Fase 1B, migración `fa1b_004`, 2026-09-03) nunca se conectó a ningún endpoint — **FACT**: cero escrituras y cero lecturas en código de aplicación; solo existe en un test que la manipula con SQL crudo directo (`tests/test_fase1b_payments.py`). `sale_order_payments` (Fase 4) es la única tabla que usa el sistema real: pagos manuales (`erp_ventas_fase4.py::register_sale_order_payment`), webhooks de pasarelas (`webhooks.py::_process_payment_webhook`), devoluciones, conversión de cotización, reconciliación de Finanzas (`finance.py::get_ledger_reconciliation`), perfil 360 de cliente (`crm.py`), y la propia capa de gobernanza Fase 6 (`legacy_consolidation.py`).

**RECOMMENDATION**: no aplicar el mecanismo `DUAL_WRITE` de Fase 6 (resuelve un problema distinto — dos escritores activos, que aquí no existen). Eliminar `payment_transactions` y su código asociado (modelo, schemas, migración de sunset, test) por ser código huérfano.

**Hallazgo lateral, fuera de alcance de TD-05**: `chat.py` importa `SaleOrderPayment` (línea 764) pero nunca lo usa — import muerto, se corrige junto con esta limpieza por trivialidad.

**Gate obligatorio antes de desplegar a producción** (no ejecutable por el agente — requiere acceso a BD real): confirmar con `SELECT COUNT(*) FROM payment_transactions;` en staging y producción que la tabla está vacía. La auditoría original indica que producción está congelada en revisión `fa1a_002` (anterior a `fa1b_004`), por lo que es probable que la tabla ni siquiera exista ahí — pero esto es **UNKNOWN** hasta verificarlo en vivo.

→ Plan de implementación: `docs/superpowers/plans/2026-09-17-td05-eliminar-payment-transactions.md`

---

## 2. RF-07 — Webhooks de WhatsApp (BLOQUEADO)

**Hallazgo nuevo**: no son 3 implementaciones, son **4**. Además de `webhooks.py` (A), `whatsapp_webhook.py` (B) y `chat.py::/webhook/whatsapp` (C1), existe `chat.py::/webhook/chatwoot` (C2) — añadido 2026-09-14/15, el más reciente, **sin ninguna verificación** (ni token, ni firma). Es la vía por la que Chatwoot reenvía WhatsApp/Telegram.

| # | Endpoint | Verificación | Mejor probado | Riesgo |
|---|---|---|---|---|
| A | `/api/v1/webhooks/whatsapp` | Token + HMAC (`WHATSAPP_WEBHOOK_SECRET`) | No | Comparte secreto con C1 — indistinguibles para Meta |
| B | `/api/v1/whatsapp/webhook` | Token + HMAC propio (`WHATSAPP_APP_SECRET`) | Sí (~50 tests), pero reportado en "modo sombra" en los últimos go/no-go | Bajo |
| C1 | `/api/v1/chat/webhook/whatsapp` | Token + HMAC (mismo secreto que A) | Mínimo | Única que escribe en `chat_conversations` visible en UI, sin idempotencia |
| C2 | `/api/v1/chat/webhook/chatwoot` | **Ninguna** | Ninguno | **Endpoint más nuevo, más débil, posiblemente el que recibe tráfico real hoy** |

**No se puede determinar cuál es canónica leyendo código.** Requiere que el usuario confirme: (a) qué URL está registrada hoy en Meta App Dashboard → WhatsApp → Configuration → Webhook, y (b) a qué URL apunta el canal de WhatsApp configurado en su panel de Chatwoot.

→ Sin plan de implementación todavía — bloqueado en espera de esos 2 datos.

---

## 3. TD-03 — Catálogos duplicados (`products`/`product_skus` vs `ecommerce_products`)

**Veredicto**: no son duplicados accidentales. `products/product_skus` es el dato maestro operativo (con integridad referencial real). `ecommerce_products` (tabla raw SQL, gestionada fuera de Alembic vía `_ensure_ecommerce_tables()`) es una capa de marketing/SEO (imágenes, descuentos, SEO, descripción larga) que nunca se integró al modelo canónico — tiene campos que el lado canónico no tiene ningún lugar donde guardar hoy.

**Bug concreto ya reproducible en producción (no solo riesgo teórico)**: `GET /ecommerce/catalogo` muestra el precio de `ecommerce_products.precio_venta`, pero `POST /ecommerce/pedidos` (`create_web_order`) valida ese mismo precio contra `ProductSKU.sale_price`. Si ambos precios divergen (editar uno sin el otro), un cliente legítimo ve su checkout rechazado con "Manipulación de precios detectada" — falso positivo de fraude causado por desincronización de catálogo, no por manipulación real.

**Consumidores confirmados**: el panel admin "Inventario → Productos" y Ventas/Compras/CRM usan el catálogo canónico. El storefront público (`/store/**`) y el panel admin "Ecommerce" usan exclusivamente `ecommerce_products`. Son dos catálogos que un administrador puede editar por separado sin que el otro se entere.

**Hallazgo lateral, ya delegado como tarea aparte** (no se ejecuta aquí): `store.py` (checkout "hardened" que la auditoría original elogiaba) no tiene ningún consumidor real en el frontend — el checkout real es `ecommerce.py::create_web_order`. Ver tarea en segundo plano `task_58bb0402`.

**RECOMMENDATION**: converger hacia `products/product_skus` como canónico. Requiere primero cerrar la brecha de esquema (crear tabla nueva para los campos de marketing/SEO que hoy solo viven en `ecommerce_products`), luego backfill, luego cutover de lectura con feature flag, luego doble-escritura, luego apagar `ecommerce_products`. Es una migración de varias partes, no un solo cambio — **incremental, sin big-bang**, tal como pide el roadmap original.

→ Plan de implementación (Parte 1 de 3 — esquema, backfill y auth): `docs/superpowers/plans/2026-09-17-td03-parte1-catalogo-web-listings.md`
→ Partes 2 (cutover de lectura) y 3 (doble-escritura + sunset de `ecommerce_products`) se planearán por separado una vez la Parte 1 esté en producción y observada, porque cada una cambia comportamiento de lectura/escritura en vivo y merece su propia revisión.

---

## 4. Gobernanza de Inventario — reclasificada como fase futura independiente

**La premisa del roadmap original no aplica.** El mecanismo de Fase 6 (`legacy_consolidation.py`) fue diseñado para **dos tablas separadas** enlazadas por FK nullable (`canonical_*_id`) — el caso de Ventas/Compras. Inventario no tiene esa forma: `inventory.py` (legacy, sin auth) y `erp_inventario.py` (canónico) leen y escriben **la misma tabla física** (`inventory_operations`, `inventory_movements`, `warehouses`). No hay una segunda copia que reconciliar; el riesgo es que dos rutas de código con rigor muy distinto escriban la misma fila.

**Además, contradice una premisa del roadmap original**: `inventory.py` **no es reemplazable por un simple 410** — es la única implementación existente de Ajustes de Stock y Traslados entre bodegas (usados hoy por `frontend/dashboard/inventario/ajustes` y `.../traslados`). `erp_inventario.py` no tiene endpoints equivalentes. Apagar `inventory.py` hoy rompería esas dos funciones en producción.

**RECOMMENDATION**: tratar esto como un proyecto de diseño nuevo, no una extensión mecánica:
1. SEC-04 (autenticación en `inventory.py`) — aislado, inmediato, no depende de nada más. (Ya resuelto en la rama `security-hotfix-fase-a`, pendiente de promoción junto con el resto de la Fase A.)
2. Diseñar y construir Ajuste/Traslado canónicos en `erp_inventario.py`, con el mismo rigor que ya tiene `reservas/convertir` (idempotencia, `InventoryOwnerBalance`, `FOR UPDATE`).
3. Solo entonces, generalizar mínimamente `legacy_consolidation.py` (política nombrada por módulo — el esquema ya lo permite sin migración) y construir el equivalente de "interceptar y redirigir" (no "dual-write", que no aplica aquí).
4. Auditoría/paridad específica de Inventario (comparar `SUM(inventory_movements)` vs `SUM(inventory_owner_balances)`).

→ Sin plan de implementación todavía. Se retoma como su propia fase cuando el usuario lo decida — no forma parte de la Fase C tal como quedó redefinida.

---

## 5. Roadmap de la Fase C — revisado

| Ítem | Estado | Siguiente paso |
|---|---|---|
| TD-05 (libros de pago) | Investigado, listo para implementar | Plan TDD escrito, en ejecución |
| TD-03 Parte 1 (esquema + auth) | Investigado, listo para implementar | Plan TDD escrito, en ejecución |
| TD-03 Partes 2-3 (cutover + sunset) | Diseño general claro, detalle pendiente | Planear después de que la Parte 1 esté desplegada y observada |
| RF-07 (webhooks WhatsApp) | Bloqueado | Esperando 2 datos externos del usuario (Meta Dashboard, Chatwoot) |
| Gobernanza de Inventario | Reclasificado — proyecto de diseño nuevo | Fase futura independiente, no parte de esta Fase C |
