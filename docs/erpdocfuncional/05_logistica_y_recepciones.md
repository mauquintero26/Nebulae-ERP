# Nebulae ERP HUB — Módulo Logística, Casillero y Recepciones

## 1. Contexto y Propósito Funcional
La operación de Nebulae involucra compras e importaciones internacionales (proveedores en USA, Europa o China) que transitan por casillero en Miami, trámites arancelarios en la DIAN, y transporte nacional hacia Barranquilla y Bogotá. 

El módulo de Logística y Recepciones garantiza la trazabilidad física y digital en cada etapa del trayecto y formaliza el ingreso de mercancía en la mesa de bodega.

---

## 2. Pantallas y Rutas del Módulo

### 2.1 Mercancía en Tránsito (`/dashboard/compras/transito`)
- **Ruta:** `/dashboard/compras/transito`
- **Componente:** `frontend/src/app/dashboard/compras/transito/page.tsx`
- **Endpoints Backend Consumidos:**
  - `GET /compras/transito`: Embarques activos agrupados por pedido con cálculo dinámico de días restantes y bandera de retraso (`is_overdue`).
  - `PATCH /compras/pedidos/{pec_id}/tracking`: Registro de hitos y actualización de estados por usuario.
- **Etapas del Flujo de Tránsito:**
  1. `PROVEEDOR_CASILLERO`: Despacho del proveedor con guía tracking local USA hacia casillero de consolidación Miami.
  2. `CASILLERO_ADUANA`: Vuelo internacional / transporte consolidado desde Miami a aduana colombiana.
  3. `ADUANA_BODEGA`: Inspección DIAN y despacho nacional terrestre/aéreo hacia la bodega Nebulae.
  4. `ENTREGADO`: Arribo formal en mesa de recepción para conteo físico.
- **Monitoreo Financiero:** Muestra el KPI de *Monto en Movimiento* (capital flotante en tránsito asegurado).

### 2.2 Mesa de Recepciones Físico-Digital (`/dashboard/compras/recepciones`)
- **Ruta:** `/dashboard/compras/recepciones`
- **Componente:** `frontend/src/app/dashboard/compras/recepciones/page.tsx`
- **Endpoints Backend Consumidos:**
  - `GET /compras/recepciones`: Listado de entradas registradas (`ENINV`) con estado de actualización de stock.
  - `GET /compras/pedidos`: Consulta de PECs activos listos para recepcionar.
  - `POST /compras/pedidos/{pec_id}/recepcionar`: Generación de documento `ENINV` desde un PEC específico.
  - `POST /compras/recepciones/{eninv_id}/confirmar`: Confirmación atómica e idempotente con `idempotency_key`, actualizando los niveles de inventario físico.
- **Mecanismo de Separación en Mesa:**
  - Al abrir una recepción, cada ítem muestra su destino:
    - **Destino Cliente:** La mercancía se etiqueta con el número de pedido del cliente (`PVEN`) y se enruta a la cola de despacho y cobro de saldo del 40%.
    - **Destino Stock Nebulae:** Ingresa inmediatamente a la disponibilidad vendible en el catálogo y la web.
    - **Destino Socio Mau:** Se resguarda para entrega o custodia del socio.
- **Idempotencia Segura:** El frontend genera un UUID único (`crypto.randomUUID()`) por solicitud para prevenir duplicación de existencias si hay reconexiones de red.

---

## 3. Recepciones de Inventario General (`/dashboard/inventario/recepciones`)
- **Ruta:** `/dashboard/inventario/recepciones`
- **Función:** Vista complementaria desde la perspectiva de almacén central y bodegas satélite (`/inventory/warehouses`), sincronizada con los mismos documentos `ENINV`.
