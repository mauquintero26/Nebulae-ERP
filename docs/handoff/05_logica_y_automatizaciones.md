# Lógica de Negocio, Automatizaciones e Inteligencia Artificial (MCP)

Este documento compila las reglas estrictas de interconexión de bases de datos, triggers y flujos autónomos que hacen de Nebulae una plataforma inteligente.

## 1. El Gran Flujo Comercial y Logístico (Interconexión)

El ERP no opera en silos. La lógica debe seguir este flujo en cadena:

### Venta (B2B)
1. **Lead -> Cotización:** Un Lead genera una cotización. La IA (o usuario) calcula márgenes.
2. **Cotización -> PVEN:** Cotización aprobada se convierte en un *Pedido de Venta (PVEN)*. Si no hay stock, el PVEN nace "Pausado" esperando mercancía.

### Compra (El puente)
3. **PEC Vinculado:** Se emite un *Pedido de Compra (PEC)*, referenciando como FK al `PVEN-XXXX`.
4. **Tránsito:** Cuando logística marca el PEC como "En Tránsito", el estado del PVEN en el módulo del asesor de ventas cambia automáticamente a "Mercancía en Tránsito".
5. **Recepción:** Llega la mercancía al almacén (Recepción). El inventario sube. El PEC se cierra ("Recibido"). **Trigger clave:** El sistema avisa a ventas y cambia el PVEN a "Listo para despacho".

### Finanzas y Cierre
6. **Facturación:** Se cruza el PVEN con el anticipo del cliente. La diferencia genera un registro en "Cuentas por Cobrar". Todo esto nutre el Dashboard de Finanzas (Ganancias, Costos, Gastos).
7. **Despacho:** Envío final y confirmación.

## 2. Juego de Inventario y E-Commerce
* **Inventario como Maestro:** La tabla de Stock Local es la única verdad. Si un artículo se vende por E-Commerce, un Webhook del E-commerce dispara la salida de stock. 
* Si se recibe mercancía (Compras), se actualiza el stock local y se hace un PUSH (API) al E-commerce para habilitar compras online.

## 3. Webhooks y Canales (WhatsApp, Instagram)
* Se deben registrar Webhooks en la API de Meta.
* Al llegar un mensaje de WhatsApp:
  1. Entra al Endpoint `/api/v1/webhooks/whatsapp`.
  2. Consulta la base de datos `Leads/Clients` por número de teléfono.
  3. Si existe, envía el mensaje por WebSocket al CRM Omnicanal. Si no existe, crea un nuevo Lead (Visitante).
  4. Detona el motor de IA si el usuario configuró auto-reply en el módulo de Marketing (Flujos).

## 4. Red Multi-Agente MCP (Inteligencia Artificial)
Toda la lógica de IA se basa en el **Model Context Protocol (MCP)**.
* **Orquestador:** Un Agente Router (Nebulae Copilot) recibe el mensaje del chat global flotante. Sabe en qué URL está el usuario (Ej: `/dashboard/compras`) para tener contexto.
* **Agente Especialista de Ventas:** Tiene acceso exclusivo (herramientas SQL) a cotizar, leer stock y generar sugerencias de precios.
* **Agente Especialista de Marketing:** Lee las métricas de visitantes, ROAS y campañas, y sugiere qué productos impulsar según el inventario con riesgo de obsolescencia.
* **Ejecución:** Cada pensamiento de los sub-agentes se guarda en una base de datos vectorial para tener memoria de largo plazo sobre el negocio, y se emite en tiempo real a la Terminal MCP del módulo de Integraciones.
