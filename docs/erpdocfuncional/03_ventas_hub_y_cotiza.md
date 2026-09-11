# Módulo Ventas Hub & Cotizador Integrado

## Rutas
- `/dashboard/ventas/solicitud` (Solicitudes de Clientes - SC)
- `/dashboard/ventas/cotizacion` (Cotizaciones Formales - COT)
- `/dashboard/ventas/venta` (Pedidos de Venta - PVEN)
- `/dashboard/cotiza` (Cotizador Rápido de Productos)

## Propósito Operativo
Gestionar de manera unificada todo el embudo comercial de entrada:
`Cliente` → `Solicitud (SC)` → `Cotización (COT)` → `Pedido de Venta (PVEN)`.
Asegura la aplicación de la regla comercial 60/40 (60% anticipo para compra en USA y 40% saldo contra entrega en Barranquilla).

## Funcionalidades Clave

### 1. Solicitud de Cliente (`/dashboard/ventas/solicitud`)
- Registro de intenciones de compra (SC-YYYY####).
- Búsqueda de clientes existentes con autocompletado y submodal para crear clientes nuevos en el acto sin recargar página.
- Modalidad de pago (60/40, 100% Contado o Financiación).
- Acción directa: 'Confirmar + Crear Cotización' que genera la `COT` vinculada automáticamente.

### 2. Cotizador Integrado & Rápido (`/dashboard/ventas/cotizacion` y `/dashboard/cotiza`)
- Cálculo automático de precios por línea de producto:
  - Costo USD + Flete USD.
  - Tasa de cambio (TRM).
  - Margen comercial deseado (%).
  - Cálculo automático del Anticipo (60%) y Saldo (40%).
- Acción directa: 'Confirmar + Crear Pedido de Venta', que sella la cotización y genera el `PVEN`.

### 3. Pedido de Venta (`/dashboard/ventas/venta`)
- Ficha maestra del pedido confirmado (PVEN-YYYY####).
- Visualización de saldos:
  - Total Facturado COP.
  - Anticipo recibido (60%).
  - Saldo pendiente por cobrar (40%).
- **Bifurcación Operativa de Abastecimiento:**
  1. **Venta Directa ('Crear Pedido de Compra'):** Abre modal para generar de inmediato una Orden de Compra (`PEC`) vinculada directamente al pedido con el proveedor seleccionado.
  2. **'Agregar a Lista de Compras':** Envía los productos al pool común de compras pendientes (`/dashboard/compras/lista-compras`), permitiendo consolidar productos de varios pedidos para el mismo proveedor.
- Registro de actividades y comentarios en Chatter.

## Integración con Backend
- `GET /ventas/solicitudes`: Listado de solicitudes activas.
- `POST /ventas/solicitudes`: Creación de nueva SC.
- `POST /ventas/solicitudes/{id}/confirmar`: Transición a Cotización.
- `GET /ventas/cotizaciones`: Listado de cotizaciones.
- `PATCH /ventas/cotizaciones/{id}`: Actualización de líneas y calculadora.
- `POST /ventas/cotizaciones/{id}/confirmar`: Generación de Pedido de Venta `PVEN`.
- `GET /ventas/pedidos`: Listado de pedidos de venta.
- `POST /compras/pedidos`: Creación de orden de compra desde venta directa.
- `POST /compras/lista-compras`: Inserción de productos al pool de compras pendientes.
