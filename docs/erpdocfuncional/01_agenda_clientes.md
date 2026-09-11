# Módulo de Agenda de Clientes (Ficha Única 360)

## Ruta
`/dashboard/agenda`

## Propósito Operativo
Centralizar en una sola vista la totalidad de la información de contacto, historial comercial, pedidos en curso, balance de pagos y canales de comunicación inmediata para cada cliente de Nebulae.

## Componentes y Funcionalidades Clave
1. **Ficha Única y Datos de Contacto:**
   - Visualización y edición en tiempo real de Tipo de Entidad (Individuo/Compañía), Documento de Identificación (CC/NIT), Nombre completo, Teléfono/WhatsApp, Correo, Ciudad y Dirección de entrega.
   - Acceso rápido a llamada telefónica directa (`tel:`) y eliminación controlada del cliente.
2. **Acceso Inmediato a WhatsApp:**
   - Botón directo con la marca y color oficial de WhatsApp (`wa.me/57...`) que abre el chat de WhatsApp Web con un mensaje contextual prellenado saludando al cliente por su nombre.
3. **Banner de Métricas Financieras en Tiempo Real:**
   - **Saldo Pendiente por Cobrar:** Alerta destacada (rojo/ámbar si debe saldo, verde si está al día), reflejando los saldos del 40% pendientes de pedidos de venta.
   - **Total Comprado (LTV):** Suma histórica facturada al cliente.
   - **Total Pagado:** Monto real recibido en anticipos y abonos.
   - **Pedidos Activos:** Cantidad de órdenes en proceso comercial o logístico.
4. **Pestaña de Solicitudes y Cotizaciones:**
   - Tabla de Solicitudes de Cotización (`SC`) con enlace directo a `/dashboard/ventas/solicitud?sc_id=...`.
   - Tabla de Cotizaciones Emitidas (`COT`) con su total en COP y enlace a `/dashboard/ventas/cotizacion?id=...`.
   - Botón directo para crear nueva solicitud comercial para este cliente.
5. **Pestaña de Pedidos de Venta (PVEN):**
   - Detalle de cada pedido: Total COP, Anticipo recibido (60%), Saldo pendiente (40%) y estado logístico (`PENDIENTE_COMPRA`, `EN_TRANSITO`, `RECIBIDO`, `ENTREGADO`).
   - Botón 'Abrir Pedido' que navega con el ID exacto a `/dashboard/ventas/venta`.
6. **Bitácora y Timeline Unificado:**
   - Cronología de eventos en orden inverso: registro del cliente, cotizaciones creadas, pagos recibidos, agendamiento de reuniones y despachos.

## Integración con Backend
- `GET /crm/customers`: Listado general con búsqueda rápida.
- `GET /crm/customers/{id}/profile-360`: Extracción canónica de balances, solicitudes, cotizaciones, pedidos y timeline.
- `POST /crm/customers`: Creación de nuevos clientes.
- `PATCH /crm/customers/{id}`: Actualización de datos.
- `DELETE /crm/customers/{id}`: Eliminación segura.
- `POST /crm/events`: Agendamiento de citas integrado con el calendario.
