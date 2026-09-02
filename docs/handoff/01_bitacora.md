# Bitácora de Desarrollo - Nebulae ERP-CRM

> **Nota para el AI:** Cada vez que el usuario pida "actualiza la bitácora", debes agregar una nueva entrada al final de este documento detallando los últimos cambios.

## Fase 1: Estructura Base y Migración
- Configuración del entorno Next.js 14/15 con Tailwind CSS y Lucide React.
- Creación de Layout base, Sidebar reorganizado con secciones desplegables.
- Preparación del motor de ruteo (`/dashboard/*`) y la tienda pública (`/store`).

## Fase 2: CRM y Asistente Omnicanal
- **CRM Kanban:** Tablero actualizado a 6 columnas estrictas (Nuevo, Cotización, Seguimiento Cotización, Pendiente por Pago, Seguimiento por Pago, Facturado).
- **Calendario CRM:** Vista para agendar seguimientos de asesores comerciales con notificaciones de WhatsApp.
- **Asistente Omnicanal (Columna 4 - Perfil 360°):** Rediseño profundo del panel de chat.
  - Perfil del cliente unificado, buscador de leads, LTV (Total) y acordeón de órdenes activas.
  - Botón de "+ Nueva Venta" y "Subir última venta automáticamente" integrados al panel del Copiloto IA.

## Fase 3: Inventario y Logística
- **Overview:** Dashboard general con KPIs (stock, valoración) y movimientos recientes.
- **Stock Actual:** Tabla de existencias con alertas de reabastecimiento (latido rojo para críticos).
- **Operaciones:** Gestión de Órdenes de Compra y Recepción de Mercancía.
- **Kardex:** Historial de movimientos in/out con badges direccionales.
- **Calendario Logístico:** Planeador mensual de ingresos de mercancía.

## Fase 4: Finanzas (CFO Virtual)
- **Control de Gastos:** Interfaz OPEX para registrar nómina, arriendo y pauta.
- **Dashboard P&L:** Modelo de cascada de Ingresos -> Costos -> OPEX -> Utilidad.
- **CFO IA:** Panel en Dark Mode con alertas inteligentes (ej. sobrecostos en pauta publicitaria).

## Fase 5: E-Commerce Público (B2C)
- **Storefront (`/store`):** Catálogo mobile-first público.
- **Product Detail:** Selectores de variantes (color, talla).
- **Slide-over Cart:** Carrito lateral embebido en el Layout.
- **Checkout One-Page:** Proceso de pago simplificado de 1 paso.

## Fase 6: Centro de Mando de Ventas
- Rediseño de `/dashboard/ventas` a formato Multivista.
- **4 Bloques Superiores:** KPIs financieros, volumen, alertas críticas, notas.
- **3 Vistas Intercambiables:**
  - *Tabla Dinámica:* Con selectores, acciones masivas (eliminar/modificar) y filtros avanzados.
  - *Kanban:* Agrupación logística (Por facturar, Facturado, En despacho).
  - *Calendario:* Fechas estimadas de entregas `ON_DEMAND`.
- **Análisis de Ventas:** Pestaña conservada para reportes gerenciales.
- **Modal de Detalle (Slide-over):**
  - Timeline/Stepper logístico (Creado -> Entregado).
  - Información dividida: Logística, Financiera, y Productos.
  - Historial de actividad (Auditoría) y acciones omnicanal de WhatsApp.

*(Última actualización: Diseño visual de UI completado - Mock Phase finalizada).*

## Fase 7: Esqueleto del CRM y Omnicanal Alineado
- **Pipelines Oficiales:** Se definieron y maquetaron los 5 estados globales del CRM (Nuevo, Solicitud Cliente, Cotización, Pago, Pedido de Venta).
- **Módulo de Seguimientos:** Transformación a Kanban Vertical Dinámico con tiempos (SLAs de 3 días) ajustado a los 5 pipelines.
- **Asistente Omnicanal (Columna 4):**
  - Perfil del cliente actualizado para mostrar el historial de todo el embudo (Solicitudes, Cotizaciones, Pagos, Pedidos).
  - Integración del botón "+ Nueva Solicitud".
  - Refactor del Agente de IA: Se limpió de métricas financieras (LTV) y se dedicó puramente a mostrar su Estado General, Sugerencias de Chat y el Switch de Modo Automático.
*(Actualización Post-Mock Frontend)*
## Fase 8: Agenda de Clientes y Calendario Global
- **Agenda de Clientes (/dashboard/agenda):**
  - Vista de Lista y Vista Maestro-Detalle con navegacion fluida.
  - Formulario de Nuevo Cliente con campos completos (Identificacion, Tipo, Categorizacion, Etiquetas).
  - **Modales Funcionales:** Agendar (con calendario visual), Contactar (Omnicanal) y Nueva Solicitud (directa al CRM).
  - **Historial de Compra:** KPIs financieros (Total, LTV, Ticket Promedio) a pantalla completa.
  - **Bitacora de Actividad Inteligente:** Timeline de eventos con filtrado (Ver Tracking) por tramite activo del CRM.
- **Calendario Global (/dashboard/calendario):**
  - Vista de cuadricula mensual perfectamente alineada con el panel de Proximos Eventos y Sincronizacion.
  - Soporte visual para integracion (Google Workspace / Microsoft Outlook / Calendario Interno).

## Fase 9: Unificación de Sub-items de Ventas, Trazabilidad Bidireccional y Acciones de Compra
- **Estructura Visual Unificada de Barras de Herramientas (2 filas):**
  - Fila 1: Pestañas en pastillas (pills) rellenas con estado activo índigo/morado y conmutador de vistas (Lista/Kanban) a la derecha.
  - Fila 2: Buscador dinámico, botón dropdown de filtrado por estado y contador en tiempo real de registros.
- **Pestaña de Análisis Individual:**
  - Implementada en **Solicitud de Cliente** (`/ventas/solicitud`), **Cotización** (`/ventas/cotizacion`) y **Pedido de Venta** (`/ventas/venta`) con métricas específicas de conversión y volumen.
- **Navegación Bidireccional Hub ↔ Sub-módulos:**
  - Clic en filas del Hub de Ventas redirige a la sub-página correspondiente (`?id=...`) y auto-despliega el panel de detalle lateral.
  - Inclusión del botón de retorno "← Hub de Ventas" en todos los sub-módulos.
- **Acciones de Compra desde Pedido de Venta (PVEN):**
  - Dentro de pedidos en estado `PENDIENTE_COMPRA`, habilitación de bloque de acciones:
    - *Opción 1:* Crear Pedido de Compra (PEC) directo con autocompletado de proveedor, asignación automática de días y vinculación al PVEN.
    - *Opción 2:* Enviar a Lista de Productos por Comprar.
- **Sub-módulo Lista de Productos por Comprar (`/compras/lista-compras`):**
  - Sub-item posicionado encima de Pedidos de Compra.
  - Gestión integral con filtros de proveedor, rangos de fechas, buscador, KPIs y consolidación de ítems para órdenes de compra.
  - Endpoints backend dedicados (`/compras/lista-compras`) con auto-inicialización de tabla PostgreSQL.

## Fase 10: Compras Hub (Paridad Visual y Funcional con Ventas Hub)
- **Transformación de `/dashboard/compras` en Compras Hub:**
  - Adopción de la arquitectura visual de Ventas Hub adaptada a compras (paleta morado/purple).
  - Pestañas de pastilla activa: `Pedidos de Compra` y `Análisis`, con switch de visualización Lista / Kanban.
  - Alerta dinámica tipo banner para PECs con entregas vencidas o en riesgo crítico de cadena de suministro.
  - **4 Tarjetas de KPIs en Tiempo Real:** PEC Activos, Capital en Compras, Retrasos Críticos y Recibidos.
  - **Tabla de Pedidos de Compra:** Columnas completas (#PEC/PVEN, Proveedor, Comprador, Monto, F. Compra, F. Entrega Est., F. Límite Alerta, Estado, Total y Acciones con menú `...`).
  - **Agrupación por Mes:** Acordeón interactivo expandible que totaliza pedidos y montos por período mensual.
  - **Tablero Kanban:** Arrastrar y soltar (drag & drop) entre columnas: *Emitido*, *En Tránsito*, *Recibido* y *Cancelado*.
  - **Panel de Detalle Lateral (Full-width, Split 45/55):**
    - Pestaña de consolidación de Pedidos de Venta (`PENDIENTE_COMPRA`) para agrupar múltiples PVEN en una orden de compra.
  - **Pestaña de Análisis de Compras:**
    - Filtros por período (7d, 30d, 90d, 180d, 1y, personalizado) y tipo de gráfico (barras, líneas, torta).
    - Métricas de compras por estado y tabla de Top Proveedores por volumen transaccional.
    - **Asistente IA de Compras:** Interfaz conversacional contextualizada para responder preguntas gerenciales de abastecimiento.

## Fase 11: Reingeniería Total de Pedidos de Compra (`/compras/pedidos`)
- **Migración a Datos 100% Reales (Eliminación de Mocks):**
  - Conexión completa con el backend de FastAPI (`/compras/pedidos?limit=200`).
- **Adaptación al Formato Visual de Solicitud de Cliente:**
  - Header estilizado, 4 KPI cards conectadas a la base de datos (Activos, En Tránsito, Vencidos, Total).
  - Barra de herramientas con filtros por estado, búsqueda en vivo, pestañas (`Todos`, `Activos`, `En Tránsito`, `Recibidos`, `Análisis`), agrupación mensual y Kanban drag & drop.
- **Panel Lateral de Detalle con Barra Interactiva de Tracking:**
  - **Pipeline Logístico Dinámico:**
    - Modalidad Casillero: *Proveedor → Casillero* → *Casillero → Nebulae* → *Pendiente Recepción*.
    - Modalidad Directa: *Proveedor → Colombia* → *Pendiente Recepción*.
  - Botones de acción directa por etapa (*En Proceso*, *Completar*, *Revertir*).
  - Registro y guardado de número de guía / tracking por cada fase con **historial cronológico de múltiples guías**.
  - Pestañas internas adicionales: *Productos del PEC*, *PVEN asociados*, *Información general* y *Historial de actividad*.
- **Modal de Nuevo PEC (Inspirado en Odoo con Flujo Extendido):**
  - Autocompletado de proveedores desde BD con detección inteligente: si el proveedor no existe, despliega modal emergente para agregarlo de inmediato a la agenda de proveedores.
  - Selección de tipo de envío (*Casillero* o *Directo a Colombia*), días de entrega y carrier.
  - Tabla dinámica de productos con nombre, cantidad, precio COP, IVA, guía individual, fecha estimada y cálculo automático de totales.
  - Pestaña de asociación de Pedidos de Venta pendientes de compra.
- **Optimizaciones en Backend (`erp_compras.py`):**
  - Endpoint `PATCH /pedidos/{id}` ampliado para registrar `tracking_history`, `tipo_envio`, `casillero` y `fecha_compra`.
  - Endpoint `PATCH /pedidos/{id}/tracking` actualizado para almacenar historial de guías por fase.
  - Transición automática de estados del PEC según el avance de los tracking stages (ej. avance a `EN_TRANSITO` y cierre a `RECIBIDO`).
