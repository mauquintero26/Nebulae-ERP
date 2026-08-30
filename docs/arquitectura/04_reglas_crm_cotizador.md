# Reglas de Negocio: CRM, Asistente IA y Cotizador (Fase 2)

**Proyecto:** Nebulae ERP & CRM
**Módulo:** Motor de Ingresos
**Estado:** Definición de Requerimientos

---

## 1. Visión General del CRM Omnicanal
El CRM funcionará como el "Centro de Comando" diario de los asesores de venta. Integrará las conversaciones de múltiples plataformas y estará asistido permanentemente por Inteligencia Artificial para acelerar las respuestas y automatizar la gestión de ventas.

**Canales de Entrada:**
* WhatsApp (Principal)
* Instagram Direct (Principal)
* Facebook Messenger (Esporádico)
* *Nota Técnica:* Se deberá procesar tanto texto como notas de voz (requerirá un servicio de transcripción tipo Whisper o API de OpenAI en el backend).

---

## 2. Arquitectura de la Interfaz (Layout de 4 Columnas)
La pantalla principal del CRM estará dividida en 4 columnas de izquierda a derecha, maximizando la productividad sin cambiar de pestaña.

### Columna 1: Navegación de Canales
* Barra lateral (Sidebar) estrecha.
* Íconos de WhatsApp, Instagram, Facebook y "Todos".
* Indicadores numéricos de mensajes no leídos por canal.

### Columna 2: Bandeja de Entrada (Inbox)
* Lista de chats (clientes) filtrados por el canal seleccionado en la Columna 1.
* Vista previa del último mensaje, nombre del cliente y etiqueta visual de estado (ej. "Lead Fresco").

### Columna 3: Hilo de Conversación (Chat Activo)
* Interfaz tradicional de chat donde el asesor lee y escribe mensajes al cliente.
* Botón integrado para adjuntar "Formatos de Cotización/Venta" que alimentarán el sistema.

### Columna 4: El Cerebro (CRM + IA)
Esta columna estará dividida horizontalmente en dos secciones clave:

#### Arriba: Máquina de Estados del CRM (Flujo de Ventas)
El proceso de venta inicia desde la adquisición en Redes Sociales (Historias en IG/WhatsApp). El asistente Omnicanal lee la interacción (ID Producto, Imagen, Modalidad) y levanta la venta en el Kanban bajo los siguientes estados estrictos:

1. **Nuevo (Lead Fresco):**
   * *Acción:* La IA/Asesor verifica si el contacto existe. Si no, lo crea.
   * *Transición:* Si el lead detalla el producto a cotizar, modalidad y método de pago, pasa automáticamente a "Cotización".
2. **Cotización:**
   * *Acción:* Se usa el Motor Matemático para cotizar.
   * *Transición:* Si aprueba ➔ "Pendiente por Pago". Si rechaza ➔ Sugerencia de similares. Si no responde en 48h ➔ "Seguimiento Cotización".
3. **Seguimiento Cotización (Recuperación de Prospectación):**
   * *Trigger:* Alerta automática cada 2 días para reactivar al cliente.
4. **Pendiente por Pago:**
   * *Transición:* Si paga ➔ "Venta / Facturación". Si demora ➔ "Seguimiento por Pago".
5. **Seguimiento por Pago (Recuperación de Cartera):**
   * *Trigger:* Alerta automática cada 2 días para cobro.
6. **Venta / Facturación (Cerrado Ganado):**
   * *Acción:* Se genera el formato de venta y se despacha. Si la venta se cae por logística, retrocede a "Seguimiento Cotización".

## 4. Motor de Triggers, Alertas y Seguimiento Logístico
Para garantizar que nada se enfríe, el sistema contará con un **Motor de Cronjobs (Alertas)** configurable:
* **Tracking de Compras (15 - 18 días):** Una vez la venta se pasa a Compras (modalidad "Bajo Pedido"), el sistema disparará una alerta a los 15-18 días en el CRM del vendedor para que le dé una actualización de rastreo al cliente con 1 solo clic por WhatsApp/Email.

## 5. Sistema de Calendarios (Workspaces)
* **Calendario de Asesores:** Vista donde cada vendedor ve sus alertas del día (A quién hacerle seguimiento de cotización, de cobro o de tracking).
* **Calendario de Compras (Gestor Logístico):** Vista para el equipo de compras mostrando el cronograma de importaciones: Pedidos retrasados (Rojo), LLegan hoy (Ámbar), Por venir (Verde). Todo sincronizado con la tabla de `INVENTORY_OPERATIONS`.

#### Arriba: Perfil CRM 360° (Mini Resumen)
Esta sección superior es dinámica y cambia según el cliente seleccionado en la bandeja:
* **Búsqueda y Contexto:** El sistema busca al cliente por su contacto (WhatsApp/IG) y despliega su "Hoja de Vida".
* **Visualización de Múltiples Estados:** Si el cliente tiene varias órdenes en curso, la interfaz mostrará una lista organizada agrupando cada `SalesOrder` con su respectivo estado actual (Ej. *Orden #102: Seguimiento Cotización* | *Orden #105: Facturado*).
* **Nuevas Interacciones:** Si el cliente interactúa por un producto nuevo, se mostrará claramente la etiqueta: **"Estado del Lead: Nueva Compra"**, permitiendo levantar una nueva orden independiente sin afectar las órdenes pasadas.

#### Abajo: Asistente de IA (Copiloto)
Interacción directa entre el Asesor y Nebulae IA para sugerir respuestas o cotizar.
* **Botón "Expandir / Ver Más":** Expande la IA a pantalla completa o modal para revelar una radiografía profunda del cliente:
  * Resumen automático del chat actual.
  * KPIs del cliente: Dinero total acumulado (LTV - Lifetime Value), cantidad total de ítems comprados históricamente.
  * Historial completo de ventas pasadas y seguimientos.

---

## 3. Implicaciones para el Backend y Base de Datos
Para que este diseño funcione, en la Fase 2 deberemos agregar a nuestra base de datos (`01_base_de_datos.md`) las siguientes entidades:

1. **`CHAT_SESSIONS` (Tickets):** Para separar las distintas conversaciones de un mismo cliente en el tiempo, con su estado actual (Lead, Cotización, etc.).
2. **`NOTES_AND_ALERTS`:** Para guardar las anotaciones de los asesores sobre los clientes y programar recordatorios.
3. **`MESSAGES`:** Historial de mensajes para que la IA tenga contexto.

## 4. Cotizador y TRM (Matemática Financiera)

### 4.1. Lógica del Margen de Venta (Producto)
El cálculo exacto del margen de venta del producto no será un número estático ni una decisión al azar del asesor. El backend replicará **exactamente la lógica algorítmica** que actualmente reside en el archivo Excel maestro `Cotiza 2025.xlsx` (ubicado originalmente en `CHAT-Structure`).
* El sistema (y la IA) consumirá los costos base, aplicará la fórmula extraída del Excel y arrojará el precio final sugerido con el margen corporativo correcto.

### 4.2. Ganancias y Comisiones del Asesor
* El administrador del sistema es el único responsable de configurar y definir estos rubros.
* Por defecto, los asesores operan bajo una estructura de **salario fijo**.
* El sistema medirá el rendimiento en la columna de "Ventas generadas" y calculará **Bonos por Volumen de Venta**, basados en metas parametrizables por el Admin.

### 4.3. Gestión de la TRM (Tasa de Cambio)
El componente del cotizador contará con un campo para la TRM con comportamiento dual:
1. **Botón de Autollenado:** Se conectará a una API externa (oficial) para consultar e insertar la tasa representativa del día con un solo clic.
2. **Input de Digitación Manual (Override):** Permitirá al usuario digitar manualmente el valor en caso de fallas en la API o si se requiere aplicar una tasa pactada especial para la compra.
