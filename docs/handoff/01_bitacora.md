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
