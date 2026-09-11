# Nebulae ERP HUB — Módulo Compras HUB

## 1. Contexto y Propósito Funcional
El Módulo de Compras de Nebulae HUB (`/dashboard/compras/pedidos`, `/dashboard/compras/lista-compras`, `/dashboard/compras/proveedores`) administra el abastecimiento centralizado de la operación comercial y de stock. 

### Principio de Trazabilidad por Destino
A diferencia de un ERP tradicional donde una orden de compra va a una bodega genérica, Nebulae implementa la separación por destino en cada línea de producto:
1. **Cliente:** Ítems asignados directamente a un pedido de cliente (`PVEN`). Al llegar al país y recibirse en mesa, se enrutan de inmediato a la cola de cobro de saldo y despacho.
2. **Stock Nebulae:** Ítems adquiridos para reposición de inventario físico disponible para venta inmediata en tienda o canales directos.
3. **Socio Mau:** Ítems adquiridos bajo la cuenta o participación del socio, con inventario y liquidación diferenciada.

---

## 2. Pantallas y Rutas del Módulo

### 2.1 Lista de Requerimientos y Pool de Compras (`/dashboard/compras/lista-compras`)
- **Ruta:** `/dashboard/compras/lista-compras`
- **Función:** Agrupa todos los requerimientos pendientes enviados desde Ventas Hub ("Agregar a Lista de Compras") y alertas de reposición de stock.
- **Acciones:**
  - Consolidar múltiples requerimientos del mismo proveedor/marca en una única orden de compra (`PEC`).
  - Filtrar por urgencia, fecha de solicitud y tipo de producto.

### 2.2 Gestión de Órdenes de Compra (`/dashboard/compras/pedidos`)
- **Ruta:** `/dashboard/compras/pedidos`
- **Componente:** `frontend/src/app/dashboard/compras/pedidos/page.tsx`
- **Endpoints Backend Consumidos:**
  - `GET /compras/pedidos`: Listado maestro con filtros por estado, proveedor y fechas.
  - `GET /compras/pedidos/{id}`: Detalle de orden con ítems, trazabilidad y tracking.
  - `POST /compras/pedidos`: Creación de PEC.
  - `PATCH /compras/pedidos/{id}`: Actualización de estado, transportadora, número de guía y notas.
  - `GET /compras/proveedores/search`: Autocompletado de proveedores registrados.
  - `GET /ventas/pedidos`: Consulta de pedidos PVEN en estado `PENDIENTE_COMPRA` para asociación cruzada.
- **Características de la Interfaz:**
  - **Selector de Destino por Línea:** Al agregar productos en el modal de nueva orden de compra, cada ítem cuenta con un selector explícito: `Cliente`, `Stock Nebulae`, `Socio Mau`.
  - **Detalle de PEC:** Visualización clara con badges de color para el destino de cada línea (`bg-emerald-100` Cliente, `bg-blue-100` Stock Nebulae, `bg-purple-100` Socio Mau).
  - **Tabs de Información:** Vista dividida entre Datos del Proveedor, Condiciones de Pago/Envío y Selección de PVENs vinculados.

### 2.3 Proveedores (`/dashboard/compras/proveedores`)
- **Ruta:** `/dashboard/compras/proveedores`
- **Función:** Catálogo maestro de proveedores nacionales e internacionales, condiciones comerciales, tiempos de entrega promedio y contactos clave.

---

## 3. Estados Operativos del PEC
1. **BORRADOR / PENDIENTE:** Orden registrada, cotizada o por autorizar.
2. **ORDENADO / CONFIRMADO:** Compra ejecutada ante el proveedor, a la espera de despacho hacia casillero o bodega.
3. **EN_TRANSITO:** Mercancía despachada por el proveedor con número de tracking internacional asignado.
4. **EN_CASILLERO_MIAMI:** Recibido en casillero de consolidación internacional.
5. **EN_ADUANA_DIAN:** En proceso de nacionalización y pago de aranceles.
6. **RECIBIDO_BODEGA:** Entregado físicamente en la mesa de recepción de Nebulae para conteo y verificación.
7. **COMPLETADO / CERRADO:** Todos los ítems verificados y distribuidos a sus destinos correspondientes.
