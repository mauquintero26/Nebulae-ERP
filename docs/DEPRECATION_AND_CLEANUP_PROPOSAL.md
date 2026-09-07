# Propuesta Técnica de Retiro y Limpieza de Artefactos Legacy (Fase 7+)

**Sistema:** Nebulae ERP-CRM  
**Fecha de Publicación:** Septiembre 2026  
**Estado:** Propuesta Técnica Aprobada para Fase 6 — Pendiente de Ejecución en Fase 7+  
**Gobernanza:** Estricta no-destructividad. Ningún artefacto será eliminado sin aprobación formal explícita.

---

## 1. Resumen Ejecutivo y Marco de Gobernanza

Durante la ejecución de las Fases 1 a 5 de Nebulae ERP, se establecieron los modelos de datos canónicos, el libro de inventarios Kardex con separación patrimonial (NEBULAE vs. MAU), el ciclo de documentos de venta (`CustomerRequest` → `SalesQuotation` → `SaleOrder` → `SalePackingSession` → `SaleOrderDelivery`), el libro de pagos inmutable (`SaleOrderPayment`) y la conciliación financiera auditable.

No obstante, para garantizar compatibilidad retroactiva absoluta y no alterar contratos de consumo existentes (incluyendo storefronts y scripts de sincronización), coexistían tablas y endpoints legacy provenientes del prototipo inicial:
- Tablas legacy: `sales_orders`, `sales_order_lines`, `purchase_orders`, `quotations`.
- Endpoints legacy: `/api/v1/sales`, `/api/v1/purchases`, checkout legacy.

En la **Fase 6**, se implementó la capa de **Observabilidad y Consolidación**:
1. Gobernanza dinámica (`legacy_governance_policies`) con modos `DUAL_WRITE`, `READ_ONLY` y `CANONICAL_PRIMARY`.
2. Emisión de cabeceras estándar RFC 8594 (`Deprecation: true`, `Sunset: <fecha>`, `Link: </canonical>; rel="successor-version"`).
3. Intercepción y sincronización atómica (dual-write) hacia los modelos canónicos sin alterar contratos de respuesta.
4. Auditoría estructurada e inmutable de invocaciones (`legacy_consolidation_audit_logs`).
5. Instantáneas periódicas de paridad (`legacy_parity_snapshots`) con cálculo cuantitativo de paridad de órdenes y financiera.

Este documento establece el inventario formal, el análisis de dependencias cruzadas, el plan de desmantelamiento gradual por etapas y las precondiciones estrictas que deberán cumplirse antes de autorizar cualquier cambio estructural definitivo en la Fase 7.

---

## 2. Inventario Exhaustivo de Artefactos Legacy

### 2.1 Tablas de Base de Datos
| Tabla Legacy | Propósito Original | Modelo Canónico Equivalente | Estado en Fase 6 |
|---|---|---|---|
| `sales_orders` | Órdenes de venta mínimas del prototipo | `sale_orders` (Fase 1B / 4) | Activa con enlace `canonical_sale_order_id` y dual-write |
| `sales_order_lines` | Líneas de producto simples | `sale_order_lines_erp` (Fase 1B) | Activa con sincronización dual-write hacia líneas canónicas |
| `purchase_orders` | Órdenes de compra prototipo | `purchase_orders_full` (Fase 1A / 1B) | Activa con enlace `canonical_purchase_order_id` y dual-write |
| `quotations` | Cotizaciones iniciales sin cálculo formal | `sales_quotations` (Fase 1B) | Activa con enlace `canonical_quotation_id` y reconciliación |

### 2.2 Columnas de Enlace Creadas en Migración `fa6_001`
- `sales_orders.canonical_sale_order_id` → FK lógica / indexada a `sale_orders.id`.
- `purchase_orders.canonical_purchase_order_id` → FK lógica / indexada a `purchase_orders_full.id`.
- `quotations.canonical_quotation_id` → FK lógica / indexada a `sales_quotations.id`.

### 2.3 Endpoints y Rutas HTTP
| Método | Ruta Legacy | Sucesor Canónico Recomendado | Cabecera Deprecation |
|---|---|---|---|
| `POST` | `/api/v1/sales/` | `POST /api/v1/ventas/pedidos` | RFC 8594 Activa |
| `GET` | `/api/v1/sales/` | `GET /api/v1/ventas/pedidos` | RFC 8594 Activa |
| `POST` | `/api/v1/sales/{id}/invoice` | Facturación canónica / ciclo de entrega | RFC 8594 Activa |
| `POST` | `/api/v1/purchases/` | `POST /api/v1/compras/pedidos` | RFC 8594 Activa |
| `GET` | `/api/v1/purchases/` | `GET /api/v1/compras/pedidos` | RFC 8594 Activa |
| `PUT` | `/api/v1/purchases/{id}/receive` | `POST /api/v1/compras/recepciones/{id}/confirmar` | RFC 8594 Activa |
| `POST` | `/api/v1/store/checkout` | Checkout unificado con `SaleOrder` (canal WEB) | Dual-write transparente |

### 2.4 Modelos y Esquemas de Código
- `backend/app/models/sales.py` (`SalesOrder`, `SalesOrderLine`, `Quotation`).
- `backend/app/models/purchases.py` (`PurchaseOrder`).
- `backend/app/schemas/sales.py` (`SalesOrderCreate`, `SalesOrderResponse`).
- `backend/app/schemas/purchases.py` (`PurchaseOrderCreate`, `PurchaseOrderResponse`).

---

## 3. Análisis de Dependencias Cruzadas

### 3.1 Frontend
- **Frontend Dashboard:** El frontend Next.js consume prioritariamente los módulos modernos en `/dashboard/ventas/`, `/dashboard/compras/` y `/dashboard/finanzas/`.
- **Compatibilidad con vistas históricas:** Determinados componentes ligeros o scripts de exportación rápida hacían lecturas puntuales a `/api/v1/sales`. Dichos componentes reciben actualmente las cabeceras de deprecación sin interrupción del servicio.
- **Tienda Pública (Storefront):** El checkout público (`/api/v1/store/checkout`) consumía internamente `SalesOrder`. La Fase 6 implementó el dual-write automático para que cada pedido web cree de forma nativa un `SaleOrder` con `canal_venta = 'WEB'`, asegurando que la orden aparezca en el tablero de pedidos y empaque sin romper la respuesta del checkout.

### 3.2 Reportes Financieros y CRM
- **Dashboard de Finanzas (`/api/v1/finance/dashboard`):** Antes de la Fase 6, calculaba ingresos iterando `SalesOrderLine`. En Fase 6 se actualizó para computar ingresos y COGS desde las líneas canónicas (`SaleOrderLineErp`) y solo incorporar órdenes legacy no vinculadas (evitando doble conteo).
- **CRM y Alertas (`/api/v1/crm/`):** Las alertas de seguimiento a 48h y alertas de entrega ahora monitorean tanto `SalesOrder` como `SaleOrder`, resolviendo los vacíos de visibilidad comercial.

---

## 4. Estrategia de Retiro por Fases (Phased Sunset)

```
┌───────────────────────────────┐
│           FASE 6              │
│       (ESTADO ACTUAL)         │
│ • Dual-Write activo           │
│ • Cabeceras RFC 8594          │
│ • Auditoría y Snapshots       │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│           FASE 7A             │
│   (DESACTIVACIÓN ESCRITURA)   │
│ • Modo READ_ONLY              │
│ • Bloqueo de escrituras (410) │
│ • Ventana de gracia (60 días) │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│           FASE 7B             │
│    (REDIRECCIÓN Y VISTAS)     │
│ • Vistas SQL de compatibilidad│
│ • Migración 100% de clientes  │
│ • Cero tráfico legacy en logs │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│           FASE 7C             │
│   (ARCHIVADO NO DESTRUCTIVO)  │
│ • Renombrado a schema archive │
│ • Script de rollback probado  │
│ • Aprobación humana explícita │
└───────────────────────────────┘
```

### Fase 6: Coexistencia y Observabilidad (Completada)
- Política: `mode = 'DUAL_WRITE'`, `allow_legacy_writes = true`, `deprecation_header_enabled = true`.
- Monitoreo continuo mediante `/api/v1/legacy/metrics` y `/api/v1/legacy/parity-report`.

### Fase 7A: Desactivación de Escrituras Legacy
- Política: Cambiar mediante `PATCH /api/v1/legacy/governance` a `mode = 'READ_ONLY'`, `allow_legacy_writes = false`.
- Comportamiento: Cualquier invocación a `POST /api/v1/sales`, `POST /api/v1/purchases`, etc., responderá con `HTTP 410 Gone` indicando la URI canónica sucesora.
- Duración recomendada: 60 días de observación.

### Fase 7B: Redirección de Lecturas mediante Vistas SQL
- Creación de vistas de compatibilidad para evitar consultas rotas:
  ```sql
  CREATE OR REPLACE VIEW v_compat_sales_orders AS
  SELECT 
      so.id,
      so.customer_id,
      NULL::integer AS user_id,
      so.estado AS status,
      'IMMEDIATE' AS sale_type,
      so.total_cop AS anticipo,
      NULL::timestamp AS estimated_delivery_date,
      so.created_at,
      so.updated_at,
      so.id AS canonical_sale_order_id
  FROM sale_orders so;
  ```
- Verificación en `legacy_consolidation_audit_logs` de que el tráfico a endpoints legacy sea inferior al 0.01%.

### Fase 7C: Archivado Estructurado (Cero Eliminación Destructiva)
- En lugar de ejecutar `DROP TABLE`, las tablas legacy se moverán a un esquema de archivo en frío:
  ```sql
  CREATE SCHEMA IF NOT EXISTS legacy_archive;
  ALTER TABLE sales_orders SET SCHEMA legacy_archive;
  ALTER TABLE sales_order_lines SET SCHEMA legacy_archive;
  ALTER TABLE purchase_orders SET SCHEMA legacy_archive;
  ALTER TABLE quotations SET SCHEMA legacy_archive;
  ```
- El código backend retirará los routers `/api/v1/sales` y `/api/v1/purchases` de `main.py`, reemplazándolos con un redireccionador HTTP 308 permanente.

---

## 5. Precondiciones Verificables Obligatorias

Antes de autorizar el paso a la Fase 7B o 7C, deben certificarse las siguientes 5 condiciones:
1. **Parity Score ≥ 99.9%:** La instantánea de paridad (`LegacyParitySnapshot.parity_score_pct`) debe arrojar paridad total entre los datos históricos reconciliados y los modelos canónicos.
2. **Cero Órdenes Huérfanas:** `unmatched_orders_count == 0` tras la ejecución de `/api/v1/legacy/reconcile-sync`.
3. **90 Días sin Escrituras Legacy:** La tabla `legacy_consolidation_audit_logs` debe certificar cero escrituras legacy exitosas durante 90 días naturales consecutivos.
4. **Validación de Frontend y Tests:** Doble corrida limpia de la suite de pruebas automatizadas (100% passed, 0 failed) y compilación limpia del frontend (`npm run build`).
5. **Autorización Expresa del Usuario:** Firma o aprobación formal explícita en bitácora por parte de la dirección del proyecto.

---

## 6. Procedimiento de Rollback e Idempotencia

En caso de cualquier contingencia en fases futuras, el procedimiento de rollback es 100% reversible:

### 6.1 Rollback Inmediato de Gobernanza (Sin despliegue)
Reactivar el modo dual-write instantáneamente vía API administrativa:
```http
PATCH /api/v1/legacy/governance HTTP/1.1
Authorization: Bearer <TOKEN_ADMIN>
Content-Type: application/json

{
  "mode": "DUAL_WRITE",
  "allow_legacy_writes": true,
  "deprecation_header_enabled": true
}
```

### 6.2 Script SQL Idempotente de Restauración Estructural
Si las tablas fueron archivadas a `legacy_archive`, el siguiente script restituye el esquema público sin pérdida de datos:
```sql
-- Script de reversión de emergencia
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'legacy_archive') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'legacy_archive' AND table_name = 'sales_orders') THEN
            ALTER TABLE legacy_archive.sales_orders SET SCHEMA public;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'legacy_archive' AND table_name = 'sales_order_lines') THEN
            ALTER TABLE legacy_archive.sales_order_lines SET SCHEMA public;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'legacy_archive' AND table_name = 'purchase_orders') THEN
            ALTER TABLE legacy_archive.purchase_orders SET SCHEMA public;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'legacy_archive' AND table_name = 'quotations') THEN
            ALTER TABLE legacy_archive.quotations SET SCHEMA public;
        END IF;
    END IF;
END $$;
```

---

## 7. Criterios de Éxito Medibles

| Métrica | Meta | Método de Medición |
|---|---|---|
| Regresiones en Frontend | **0** | `npm run build` y suite Cypress/E2E |
| Regresiones en Backend | **0** | `pytest tests/ -q` (347+ tests passed) |
| Score de Paridad de Datos | **100%** | `GET /api/v1/legacy/parity-report` |
| Separación Patrimonial NEBULAE / MAU | **100% Intacta** | Kardex balance audit en `inventory_owner_balances` |
| Trazabilidad de Auditoría | **100%** | Cada evento legacy indexado en `legacy_consolidation_audit_logs` |

---
*Fin de la propuesta técnica.*
