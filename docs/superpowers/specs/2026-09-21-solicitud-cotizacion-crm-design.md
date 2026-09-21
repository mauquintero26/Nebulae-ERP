# Solicitud de Cliente, Cotización y CRM — Design

## Contexto

El descubrimiento del 2026-09-21 (`docs/audit/2026-09-21-flujo-comercial-completo-discovery.md`) encontró varios defectos concretos en el flujo Solicitud de Cliente → Cotización → CRM: un asesor de texto libre, un estado de solicitud que se desincroniza del estado real de su cotización, un pipeline de CRM que solo avanza en el navegador (sin garantía, sin aviso si falla), una pantalla de detalle de cotización que es una maqueta con datos falsos, y botones de navegación que nunca llevan al registro correcto. Este documento diseña las correcciones y las piezas nuevas (Soporte Técnico, autocompletar producto, envío por canal) sin tocar el trabajo de Catálogo Configurable (spec separada del mismo día).

## Decisiones ya confirmadas con el usuario

1. **Pipeline de CRM — 5 etapas estándar**, cada una con un valor `maps_to_status` para que el servidor pueda moverlas automáticamente:
   - Nuevo Lead → `NUEVO`
   - Cotización Enviada → `COTIZACION_ENVIADA`
   - En Negociación → `EN_NEGOCIACION`
   - Ganado → `GANADO`
   - Perdido → `PERDIDO`
   Recotizar después de un rechazo mueve el Lead de `PERDIDO` de regreso a `COTIZACION_ENVIADA`.
2. **Soporte Técnico** tiene su propio conjunto de campos (tipo de problema, descripción, urgencia, evidencia, asignado a, producto/pedido relacionado opcional) y su propio flujo de estados (Abierto → En Proceso → Resuelto → Cerrado), **y no participa del pipeline de ventas del CRM** — es un flujo de servicio separado.
3. La urgencia de Soporte Técnico ajusta el plazo de alerta por desatención: Alta 4 horas, Media 1 día, Baja 2 días (el default general actual).

## Arquitectura

Se corrigen y extienden `backend/app/api/v1/erp_ventas.py` (Solicitud/Cotización) y `backend/app/api/v1/crm.py` (Lead/Pipeline), y sus contrapartes en `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx` y `frontend/src/app/dashboard/ventas/cotizacion/*`. El cambio de fondo es sacar del frontend toda lógica que decide estados o mueve el Lead, y centralizarla en el servidor, para que nunca vuelva a desincronizarse ni fallar en silencio.

```
Crear Solicitud (con cliente real obligatorio)
  └─► crea CustomerRequest + Lead en "Nuevo Lead" (servidor, siempre, nunca falla en silencio)

Crear Cotización (borrador)          → CustomerRequest.estado se deriva de Cotizacion.estado
Enviar Cotización (elige canal)      → Lead → "Cotización Enviada"          (servidor)
Cliente confirma                     → CustomerRequest.estado = CONFIRMADA
Cliente rechaza (sin recotizar)      → Lead → "Perdido"                     (servidor)
Recotizar                            → Lead → "Cotización Enviada" de nuevo (servidor)
Crear Pedido de Venta desde Cotización → Lead → "Ganado"                    (servidor)
```

## Componente 1 — Solicitud de Cliente

**Cliente siempre real (cierra la causa raíz de "Lead solo para clientes existentes"):** hoy el formulario permite enviar `customer_name` como texto libre sin un `customer_id` real en algunos caminos. Se cierra ese hueco: la solicitud solo se puede guardar con un `customer_id` válido — si el cliente no existe, se fuerza el flujo ya existente de "Agregar Cliente" (que ya está en el código) antes de continuar, nunca se permite texto libre como sustituto. Con esto, **todo Lead futuro siempre tiene un cliente real vinculado**, sin necesitar un caso especial para "cliente nuevo".

**Asesor como selector:** agregar `advisor_user_id` (referencia a `users.id`) a `CustomerRequest`, poblado desde un desplegable de usuarios activos en el frontend. Se conserva `advisor_name` (ya existente) como copia de solo lectura del nombre al momento de crear, para no romper pantallas que ya lo muestran como texto.

**Vencimiento por defecto:** cambiar el valor fijo de 30 días (`erp_ventas.py:215`) a 5 días. Hacerlo configurable desde una pantalla (en vez de fijo en el código) queda para el sub-proyecto de "Configuración de Alertas y Plazos" ya identificado en el descubrimiento — aquí solo se corrige el número.

**Soporte Técnico — campos nuevos:**
- `tipo_problema`: Falla del producto / Garantía / Duda de uso / Problema con el pedido o envío / Otro.
- `descripcion_problema`: texto libre.
- `urgencia`: Baja / Media / Alta (determina el plazo de alerta: 2 días / 1 día / 4 horas).
- `evidencia_descripcion`: campo de texto para describir la evidencia (fotos, capturas, etc. que el asesor recibió por fuera del sistema) — igual que Devolución de Producto, que tampoco tiene adjuntos de archivo reales hoy, solo un motivo en texto. Adjuntar archivos de verdad no existe en ninguna parte de la aplicación todavía; construirlo sería una capacidad nueva del sistema completo, fuera del alcance de este documento (ver "Fuera de alcance").
- `asignado_a_user_id`: mismo tipo de selector que el asesor.
- `estado_soporte`: Abierto / En Proceso / Resuelto / Cerrado — estado propio, independiente del de Cotización (Soporte Técnico no siempre termina en una venta).

**Corrección del estado de la solicitud (la causa raíz del bug de "Confirmada" prematura):** hoy `CustomerRequest.estado` se asigna directamente y de forma independiente al estado real de su Cotización, por lo que se desincronizan. La corrección: cada vez que el estado de una Cotización cambia en el servidor, una función central (`_sincronizar_estado_solicitud_desde_cotizacion`) actualiza el estado de la Solicitud en la misma transacción, según esta tabla:

| Estado de la Cotización | Estado resultante de la Solicitud |
|---|---|
| (sin cotización todavía) | PENDIENTE_POR_COTIZAR |
| Borrador | COTIZADA |
| Enviada / Pend. confirmación | EN_ESPERA_CONFIRMACION |
| Confirmada | CONFIRMADA |
| Rechazada | RECHAZADA |
| Vencida | VENCIDA |

Esto reemplaza la asignación directa que hoy pone "CONFIRMADA" apenas se crea un borrador de cotización.

## Componente 2 — Cotización

**Autocompletar producto:** el buscador de producto en la pantalla de "Cotizar/Calcular Precios" usa el mismo endpoint de búsqueda que ya existe (`/crm/products/search`, ya usado hoy en otra parte de esta misma pantalla) — no se construye uno nuevo. Si el producto buscado no existe en el catálogo, se ofrecen dos caminos: crear el producto en el catálogo (abre el asistente de creación de producto de la spec de Catálogo Configurable, si ya está disponible) o cotizarlo como texto libre marcado explícitamente como "no es producto de catálogo" — sin bloquear la cotización.

**Enviar al Cliente con selección de canal:** antes de marcar la cotización como "Enviada", se pregunta el canal (WhatsApp / Email / Otro). Elegir WhatsApp abre una ventana con el mensaje y el número del cliente ya listos para enviar (enlace `wa.me`) — no se automatiza el envío en sí; automatizar el envío real por WhatsApp queda para cuando se consolide el webhook (pendiente aparte, ya identificado). Elegir "Enviada" solo se confirma en el sistema después de elegir un canal, nunca antes.

**Navegación real a la cotización/pedido específico:** los botones "Ver Cotización" y "Ver Pedido de Venta" dejan de enlazar a las listas generales y enlazan al registro exacto (mismo patrón `?id=` que ya funciona para abrir el detalle de una Solicitud específica). La pantalla de detalle de cotización individual deja de mostrar datos de ejemplo fijos y consulta el registro real.

## Componente 3 — CRM

**Lead siempre se crea:** al quedar resuelto que toda Solicitud tiene un cliente real (Componente 1), se elimina la condición "solo si el cliente ya existía" — el Lead se crea siempre, en la etapa "Nuevo Lead".

**Movimiento de etapa en el servidor, no en el navegador:** se agrega una función central (`_mover_lead_pipeline(lead, maps_to_status)`) que busca la `PipelineStage` cuyo `maps_to_status` coincide y mueve el Lead ahí, llamada desde el servidor en estos momentos exactos:
- Al enviar una cotización → `COTIZACION_ENVIADA`.
- Al crear el Pedido de Venta desde una cotización confirmada → `GANADO`.
- Al rechazar una cotización sin que se vuelva a cotizar → `PERDIDO`.
- Al recotizar después de un rechazo → `COTIZACION_ENVIADA` de nuevo.

Esto reemplaza la lógica actual que vive solo en el frontend y que hoy puede fallar sin avisar a nadie.

**Seed de las 5 etapas:** si el pipeline de CRM del usuario no tiene todavía estas 5 etapas creadas, se agregan (sin borrar ni renombrar ninguna etapa que ya exista con otro nombre) — el detalle exacto de cómo detectar "ya existen" o "hay que crearlas" se resuelve en el plan de implementación.

## Pruebas automatizadas requeridas

- **Solicitud:** no se puede crear sin `customer_id` real (ni con texto libre como sustituto); asesor y asignado-a válidos contra usuarios reales; vencimiento por defecto de 5 días; Soporte Técnico con su propio flujo de estados y plazos de alerta según urgencia.
- **Sincronización de estado:** crear cotización borrador dejaSolicitud en COTIZADA (no CONFIRMADA); enviar la cotización la deja en EN_ESPERA_CONFIRMACION; confirmar la deja en CONFIRMADA; rechazar la deja en RECHAZADA.
- **CRM:** Lead se crea siempre (incluyendo el camino de cliente recién creado vía el flujo de "Agregar Cliente"); movimiento de etapa ocurre en cada uno de los 4 momentos listados arriba; recotizar mueve el Lead de Perdido de vuelta a Cotización Enviada.
- **Navegación:** los enlaces de detalle de cotización/pedido llevan al id correcto; la pantalla de detalle de cotización consulta datos reales.

## Fuera de alcance (explícito)

- Automatizar el envío real de mensajes por WhatsApp — solo se abre el canal con el mensaje listo; el envío automatizado depende de la consolidación de los 3 webhooks de WhatsApp (pendiente aparte).
- Hacer configurable desde una pantalla el plazo de vencimiento de 5 días o los umbrales de alerta — queda para el sub-proyecto de "Configuración de Alertas y Plazos".
- Cualquier cambio al trabajo de Catálogo Configurable (spec separada); este documento solo reutiliza su asistente de creación de producto como destino opcional del autocompletar, sin modificarlo.
- Adjuntar archivos/fotos reales como evidencia — no existe como capacidad en ningún módulo de la aplicación hoy; construirla sería un sub-proyecto propio, no un detalle de esta spec.
