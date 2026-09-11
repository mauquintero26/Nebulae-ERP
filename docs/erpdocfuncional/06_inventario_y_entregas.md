# Nebulae ERP HUB — Módulo Inventario y Entregas

## 1. Contexto y Propósito Funcional
El inventario en Nebulae opera bajo el principio de **Gestión de Compromisos de Venta**. En un negocio de importación y productos premium, una unidad física presente en bodega no siempre significa disponibilidad para venta inmediata: puede estar ya reservada para un cliente que pagó un anticipo del 60%.

---

## 2. Pantallas y Rutas del Módulo

### 2.1 Vista Dual de Inventario (`/dashboard/inventario/stock`)
- **Ruta:** `/dashboard/inventario/stock`
- **Componente:** `frontend/src/app/dashboard/inventario/stock/page.tsx`
- **Endpoints Backend Consumidos:**
  - `GET /products`: Catálogo y existencias maestras por SKU.
  - `GET /inventory/stock-summary`: Resumen consolidado de disponibilidad y reservas.
- **Diferenciación Dual Esencial:**
  1. **Físico en Bodega:** Unidades reales presentes en las estanterías (incluye preventas asignadas y stock libre).
  2. **Comprometido / Preventa:** Unidades asignadas a clientes con anticipo pagado en espera de despacho.
  3. **Disponible para Venta Inmediata:** `Físico - Comprometido`. Esta es la cifra que los asesores de ventas pueden comprometer hoy mismo para entrega inmediata y la que sincroniza con el catálogo comercial.
  4. **En Tránsito Internacional:** Unidades ordenadas a proveedores que están en camino a Colombia.
- **Filtros Operativos:** Por categoría de producto, estado (Disponible, Bajo Stock, Agotado) y buscador reactivo por SKU o nombre.

### 2.2 Cola de Despacho y Cobro de Saldo del 40% (`/dashboard/inventario/entregas`)
- **Ruta:** `/dashboard/inventario/entregas`
- **Componente:** `frontend/src/app/dashboard/inventario/entregas/page.tsx`
- **Endpoints Backend Consumidos:**
  - `GET /ventas/pedidos`: Listado de pedidos de cliente en cola de salida.
  - `PATCH /ventas/pedidos/{id}`: Registro de entrega y actualización de estado de cobro.
- **Regla de Oro de Entrega (Protocolo 60/40):**
  - **Semáforo Financiero:**
    - `100% Pagado (Verde):` El cliente completó el pago del saldo restante (40%). El pedido está liberado para despacho nacional o entrega en tienda.
    - `Cobro Pendiente (Ámbar):` El cliente aún adeuda el 40%. La interfaz bloquea o advierte la salida de bodega.
  - **Herramientas de Cobranza:**
    - Botón directo de **WhatsApp** con mensaje predeterminado: `"Hola [Cliente]! Tu pedido [PVEN] ya llegó a bodega Nebulae 🎉. Para proceder con el despacho, puedes cancelar el saldo restante de $XXX COP."`
    - Botón **"Marcar Saldo Cobrado"** para registrar el pago del 40% verificado.
    - Botón **"Autorizar Salida y Despachar Pedido"** que registra la salida física y actualiza el estado a `ENTREGADO`.
