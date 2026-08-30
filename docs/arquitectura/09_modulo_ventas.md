# Arquitectura del Módulo de Ventas (Sales Module)

## 1. Estructura de Base de Datos (Backend)
El modelo `SalesOrder` y `SalesOrderLine` debe ser ultra-robusto para manejar la logística post-venta, no solo el aspecto financiero.

### 1.1. Atributos Clave de la Venta
* `id` / `order_number`: Identificador único (Ej. VEN-2026-001).
* `created_at`: Fecha de creación real.
* `import_date`: Fecha de importación (solo aplica si la venta fue subida masivamente vía CSV o XML).
* `sale_type`: Tipo de logística comercial.
  * `IMMEDIATE`: Entrega inmediata (Toma de inventario físico existente).
  * `ON_DEMAND`: Por pedido (Desencadena una Orden de Compra/Importación).
* `status`: Estado de ejecución financiera y logística.
  * `TO_INVOICE`: Por facturar (Falta pago total o emisión de documento).
  * `INVOICED`: Facturado (Pagado y formalizado).
* `financials`: `subtotal`, `anticipo` (down_payment), `total_value`.
* `estimated_delivery_date`: Fecha estimada de entrega (crítico para las ventas `ON_DEMAND`).

### 1.2. Motor de Alertas y Cronjobs (Ventas por Pedido)
El Backend contará con un Cronjob específico que monitoreará la tabla de Ventas buscando aquellas de tipo `ON_DEMAND`.
* Si la fecha actual se acerca a la `estimated_delivery_date`, el sistema disparará un registro en la tabla `Alerts` para notificar al vendedor y al área de compras.
* Los tiempos de estas alertas (ej. avisar 5 días antes, o el mismo día) deben ser modificables desde la configuración del sistema.

---

## 2. Estructura de Interfaz (Frontend - /dashboard/ventas)

### 2.1. Panel Superior (Dashboard Analítico)
La vista mantendrá los componentes heredados de alto valor gerencial:
1. **Tabla Total de Ventas:** Resumen macro.
2. **Análisis Consolidado:** Gráficos o KPIs rápidos.
3. **Cuadro de Alertas:** Notificaciones urgentes (Nutrido por el Cronjob del backend).
4. **Notas Pendientes:** Bloc de notas rápido para el equipo.

### 2.2. Vista Central Multiformato (Tabla, Kanban, Calendario)
El repositorio principal de órdenes, nutrido automáticamente por el CRM/Omnicanal o mediante creación manual.

* **Filtros y Columnas Dinámicas:** El usuario podrá ocultar/mostrar columnas y aplicar filtros complejos.
* **Tabla (Vista por defecto) - Columnas Mínimas:**
  1. Número de venta
  2. Fecha de creación
  3. Cliente
  4. Productos (Resumen de SKUs)
  5. Categoría
  6. Tipo de venta (Inmediata / Por Pedido)
  7. Anticipo
  8. Valor Total
  9. Estado (Por facturar / Facturado)

* **Vista Kanban:** Las ventas agrupadas como tarjetas, donde las columnas representan su `status` o progreso logístico.
* **Vista Calendario:** Un calendario mensual donde cada "evento" es una Venta de tipo `ON_DEMAND` posicionada en su `estimated_delivery_date`. Permite a logística ver qué debe ser entregado cada día.
