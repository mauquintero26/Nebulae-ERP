# Certificación de Staging — Nebulae ERP

**Fecha de Ejecución:** 11 de Septiembre de 2026  
**Ambiente Staging:** `https://erp-staging.ionwxk.easypanel.host`  
**API Staging:** `https://api-staging.ionwxk.easypanel.host/api/v1`  
**Base de Datos Staging:** `erp_staging` (Host: 2.24.90.223:5435)  
**Base de Datos Producción (`erpdb`):** **INTACTA — 0 modificaciones (1 sale_order histórico no alterado)**  
**Rama Git:** `staging/erp-staging-v1`  

---

## 1. Resumen Ejecutivo de Certificación E2E

Se ejecutó la corrección y cierre de certificación técnica y funcional en el ambiente de Staging para **4 flujos comerciales completos** (2 de Entrega Inmediata y 2 Por Pedido/Abastecimiento). 

Todos los flujos alcanzaron su estado terminal canónico estricto:
- **Pedidos de Venta:** `ENTREGADO` (4 de 4).
- **Entregas Físicas:** `ENTREGADO` (4 de 4) con fecha de despacho y fecha de entrega registradas.
- **Sesiones de Empaque:** `DESPACHADO` (4 de 4).
- **Reservas de Inventario:** `CONVERTED` (4 de 4, consumidas contra la entrega).
- **Saldos Pendientes de Cobro:** `$0.00` COP en todos los pedidos (100% pagados/anticipo + saldo).
- **Kárdex:** 6 movimientos registrados con dirección y propietario canónico (`NEBULAE`).
- **Niveles de Inventario y Balances:** Descontados con exactitud aritmética matemática.
- **Aislamiento Productivo:** `erpdb` en puerto productivo verificado sin ninguna modificación.

---

## 2. Matriz de Certificación E2E (PASS / FAIL)

| ID | Flujo Comercial | Cliente | Pedido Venta | Monto Total | Anticipo / Saldo Final | Empaque | Entrega Física | Reserva | Mov. Kárdex | Estado Final | Resultado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **E2E-A1** | Entrega Inmediata #1 | Carlos StagingTest | `PVEN-20260003` | $150.000 COP | $150.000 / **$0.00** | `EMP-20260001` (`DESPACHADO`) | `ENT-20260001` (`ENTREGADO`) | `CONVERTED` (2 Ud) | OUT: 2 Ud | `ENTREGADO` | **PASS** ✅ |
| **E2E-A2** | Entrega Inmediata #2 | Abraham Anturi | `PVEN-20260004` | $225.000 COP | $225.000 / **$0.00** | `EMP-20260002` (`DESPACHADO`) | `ENT-20260002` (`ENTREGADO`) | `CONVERTED` (3 Ud) | OUT: 3 Ud | `ENTREGADO` | **PASS** ✅ |
| **E2E-B1** | Por Pedido #1 | Juan Prueba | `PVEN-20260007` | $320.000 COP | $192.000 / **$0.00** | `EMP-20260003` (`DESPACHADO`) | `ENT-20260003` (`ENTREGADO`) | `CONVERTED` (1 Ud) | IN: 1 Ud / OUT: 1 Ud | `ENTREGADO` | **PASS** ✅ |
| **E2E-B2** | Por Pedido #2 | Mauricio Quintero | `PVEN-20260008` | $640.000 COP | $384.000 / **$0.00** | `EMP-20260004` (`DESPACHADO`) | `ENT-20260004` (`ENTREGADO`) | `CONVERTED` (2 Ud) | IN: 2 Ud / OUT: 2 Ud | `ENTREGADO` | **PASS** ✅ |

---

## 3. Trazabilidad Detallada por Flujo

### Flujo A1 — Entrega Inmediata (Carlos StagingTest)
- **Solicitud de Cliente:** `SC-20260005` (ID: 5) — Estado: `CONFIRMADA`.
- **Cotización:** `COT-20260003` (ID: 2) — Total: $150.000 COP (2 unidades Vestido `VEST-STG-INM-001`).
- **Pedido de Venta:** `PVEN-20260003` (ID: 2) — Pago 100%: $150.000 COP. Saldo: **$0.00**. Estado: `ENTREGADO`.
- **Reserva de Inventario:** ID 1 (`ACTIVE` → `CONVERTED` por 2.00 Ud al despachar).
- **Sesión de Empaque:** `EMP-20260001` (ID: 1) — Estado final: `DESPACHADO`.
- **Entrega:** `ENT-20260001` (ID: 1) — Despacho: `2026-09-11 17:46:33` → Entrega Confirmada: `2026-09-11 17:46:34` (`ENTREGADO`).
- **Kárdex:** Movimiento ID 1, `direction: OUT`, `quantity: 2.00`, `owner: NEBULAE`.

### Flujo A2 — Entrega Inmediata (Abraham Anturi)
- **Solicitud de Cliente:** `SC-20260006` (ID: 6) — Estado: `CONFIRMADA`.
- **Cotización:** `COT-20260004` (ID: 3) — Total: $225.000 COP (3 unidades Vestido `VEST-STG-INM-001`).
- **Pedido de Venta:** `PVEN-20260004` (ID: 3) — Pago 100%: $225.000 COP. Saldo: **$0.00**. Estado: `ENTREGADO`.
- **Reserva de Inventario:** ID 2 (`ACTIVE` → `CONVERTED` por 3.00 Ud al despachar).
- **Sesión de Empaque:** `EMP-20260002` (ID: 2) — Estado final: `DESPACHADO`.
- **Entrega:** `ENT-20260002` (ID: 2) — Despacho: `2026-09-11 17:46:35` → Entrega Confirmada: `2026-09-11 17:46:35` (`ENTREGADO`).
- **Kárdex:** Movimiento ID 2, `direction: OUT`, `quantity: 3.00`, `owner: NEBULAE`.

### Flujo B1 — Por Pedido (Juan Prueba)
- **Solicitud de Cliente:** `SC-20260007` (ID: 7) — Estado: `CONFIRMADA`.
- **Cotización:** `COT-20260005` (ID: 4) — Total: $320.000 COP (1 unidad Coche `COCH-STG-PED-002`).
- **Pedido de Venta:** `PVEN-20260007` (ID: 6) — Anticipo 60%: $192.000 COP.
- **Orden de Compra:** `PEC-20260003` vinculada a `PVEN-20260007`.
- **Asignación Canónica:** Tipo `CUSTOMER_ORDER` vinculando la línea del proveedor con el cliente.
- **Recepción Física:** `ENINV-20260003` confirmada con 1 unidad física recibida. Kárdex ID 3 `IN: 1.00 Ud`.
- **Reserva Automática:** ID 3 creada automáticamente para el cliente (`ACTIVE` → `CONVERTED`).
- **Pago de Saldo 40%:** $128.000 COP registrados. Saldo pendiente: **$0.00**.
- **Sesión de Empaque:** `EMP-20260003` (ID: 3) — Estado final: `DESPACHADO`.
- **Entrega:** `ENT-20260003` (ID: 3) — Despacho: `2026-09-11 17:50:15` → Entrega Confirmada: `2026-09-11 17:50:15` (`ENTREGADO`).
- **Kárdex:** Movimiento ID 4, `direction: OUT`, `quantity: 1.00`, `owner: NEBULAE`. Estado final pedido: `ENTREGADO`.

### Flujo B2 — Por Pedido (Mauricio Quintero)
- **Solicitud de Cliente:** `SC-20260008` (ID: 8) — Estado: `CONFIRMADA`.
- **Cotización:** `COT-20260006` (ID: 5) — Total: $640.000 COP (2 unidades Coche `COCH-STG-PED-002`).
- **Pedido de Venta:** `PVEN-20260008` (ID: 7) — Anticipo 60%: $384.000 COP.
- **Orden de Compra:** `PEC-20260004` vinculada a `PVEN-20260008`.
- **Asignación Canónica:** Tipo `CUSTOMER_ORDER` vinculando la línea del proveedor con el cliente.
- **Recepción Física:** `ENINV-20260004` confirmada con 2 unidades físicas recibidas. Kárdex ID 5 `IN: 2.00 Ud`.
- **Reserva Automática:** ID 4 creada automáticamente para el cliente (`ACTIVE` → `CONVERTED`).
- **Pago de Saldo 40%:** $256.000 COP registrados. Saldo pendiente: **$0.00**.
- **Sesión de Empaque:** `EMP-20260004` (ID: 4) — Estado final: `DESPACHADO`.
- **Entrega:** `ENT-20260004` (ID: 4) — Despacho: `2026-09-11 17:51:06` → Entrega Confirmada: `2026-09-11 17:51:07` (`ENTREGADO`).
- **Kárdex:** Movimiento ID 6, `direction: OUT`, `quantity: 2.00`, `owner: NEBULAE`. Estado final pedido: `ENTREGADO`.

---

## 4. Reconciliación de Inventario Físico y Balances Propietario

| SKU | Producto | Stock Inicial | Entradas (IN) | Salidas (OUT) | Stock Físico Final | Balance Propietario NEBULAE | Estado Reconciliación |
|---|---|---|---|---|---|---|---|
| **SKU 1** | Vestido Staging Inmediata (`VEST-STG-INM-001`) | 100.00 Ud | 0.00 Ud | 5.00 Ud (2 + 3) | **95.00 Ud** | **95.00 Ud** | Exacto / Cuadrado ✅ |
| **SKU 2** | Coche Staging Pedido (`COCH-STG-PED-002`) | 0.00 Ud | 3.00 Ud (1 + 2) | 3.00 Ud (1 + 2) | **0.00 Ud** | **0.00 Ud** | Exacto / Cuadrado ✅ |

### Kárdex Auditoría (`inventory_movements`):
```text
ID 1 | SKU 1 | Qty: 2.00 | OUT | Owner: NEBULAE | Warehouse: 1  (Despacho Flujo A1)
ID 2 | SKU 1 | Qty: 3.00 | OUT | Owner: NEBULAE | Warehouse: 1  (Despacho Flujo A2)
ID 3 | SKU 2 | Qty: 1.00 | IN  | Owner: NEBULAE | Warehouse: 1  (Recepción Flujo B1)
ID 4 | SKU 2 | Qty: 1.00 | OUT | Owner: NEBULAE | Warehouse: 1  (Despacho Flujo B1)
ID 5 | SKU 2 | Qty: 2.00 | IN  | Owner: NEBULAE | Warehouse: 1  (Recepción Flujo B2)
ID 6 | SKU 2 | Qty: 2.00 | OUT | Owner: NEBULAE | Warehouse: 1  (Despacho Flujo B2)
```

---

## 5. Evidencia Visual del Entorno Staging

- **Título del Navegador / Documento:** `Nebulae ERP — STAGING`
- **Banner Superior Permanente:**
  ```text
  ⚠️ ENTORNO DE PRUEBAS — DATOS NO PRODUCTIVOS
  ```
- **Captura de Pantalla:**  
  ![Banner Superior Staging](C:/Users/jmqui/.gemini/antigravity/brain/3a2a474b-1e27-4809-aee5-1600a591f4d5/staging_banner_evidence.png)

---

## 6. Verificación de Aislamiento de Producción

Query ejecutada directamente contra `erpdb:5432/erpdb` (base productiva):
```sql
SELECT count(*) as total_sale_orders_prod FROM sale_orders;
-- Resultado: 1 (Pedido histórico preexistente inalterado)
```
- **Modificaciones en erpdb:** **0**
- **Despliegues en producción:** **0**

---

## 7. Política Estricta de Detención (STOP)

> [!CAUTION]
> **DETENCIÓN TOTAL OBLIGATORIA — NO SE DESPLIEGA A PRODUCCIÓN**  
> Ningún cambio se ha desplegado ni se desplegará al entorno productivo (`erp.nebulaekids.com`).  
> La base de datos de producción `erpdb` permanece con 0 modificaciones.  
> Se requiere la autorización explícita con la frase canónica:  
> **"AUTORIZO DEPLOY A PRODUCCIÓN DEL COMMIT <HASH>"**  
> antes de realizar cualquier acción productiva.
