# Módulo CRM & Asistente Omnicanal

## Rutas
- `/dashboard/crm` (Tablero Kanban y Seguimientos)
- `/dashboard/asistente_omnicanal` (Consola de Atención Multicanal & Chat AI)

## Propósito Operativo
Capturar todos los leads y solicitudes que provienen de canales digitales (WhatsApp, Instagram, Facebook, Web Chat), gestionarlos visualmente en un embudo Kanban por etapas y canalizarlos con un clic hacia el flujo comercial (Solicitud, Cotización o Pedido de Venta).

## Funcionalidades Clave

### 1. Tablero CRM Kanban (`/dashboard/crm`)
- **Etapas Dinámicas y Personalizables:** Configuración de columnas (Nuevo Lead, Calificación, Cotización Enviada, Negociación, Ganado, Perdido), con límites de días de alerta para evitar que un lead se enfríe.
- **Tarjetas de Prospecto:**
  - Nombre del cliente y canal de origen (WhatsApp, Instagram, Web).
  - Valor estimado en COP y producto de interés.
  - Contador de días en etapa actual con badge de alerta visual.
- **Conversión Directa a Ventas:**
  - Botón 'Crear en Ventas → Solicitud de Cliente' (`SC`).
  - Botón 'Crear en Ventas → Cotización' (`COT`).
  - Botón 'Crear en Ventas → Pedido de Venta' (`PVEN`).
  - Botón 'Ver en Agenda' para consultar la ficha 360 del cliente.

### 2. Asistente Omnicanal (`/dashboard/asistente_omnicanal`)
- **Bandeja Unificada Multicanal:**
  - Filtrado por canal: Todos, WhatsApp, Instagram, Facebook y Web Chat.
  - Conversaciones en tiempo real con indicador de mensajes no leídos y último contacto.
- **Copiloto de Respuestas & IA:**
  - Sugerencia de respuestas contextuales con catálogo de historias y promociones vigentes.
  - Modalidad asistida (Copiloto) o manual.
- **Vinculación con CRM y Clientes:**
  - Vinculación de cualquier conversación con un cliente existente o creación instantánea de nuevo lead.
  - Visualización del pipeline lateral sin abandonar el chat.

## Integración con Backend
- `GET /crm/pipeline-stages/config`: Carga de etapas del pipeline.
- `GET /crm/leads`: Listado filtrable de oportunidades.
- `PATCH /crm/leads/{id}/stage`: Movimiento de tarjetas entre columnas del embudo.
- `POST /crm/leads/{id}/to-solicitud`: Conversión automática a `CustomerRequest`.
- `POST /crm/leads/{id}/to-cotizacion`: Conversión automática a `SalesQuotation`.
- `POST /crm/leads/{id}/to-pedido`: Conversión automática a `SaleOrder`.
- `GET /chat/conversations`: Listado de conversaciones omnicanal activas.
- `POST /chat/conversations/{id}/reply`: Envío de respuestas al canal correspondiente.
