# Prompt para el Arquitecto de Backend y Bases de Datos (Handoff del Frontend)

**Contexto del Proyecto:**
Hemos desarrollado de manera exhaustiva el esqueleto visual (Frontend en Next.js/React + Tailwind CSS) de un sistema ERP/CRM altamente avanzado e impulsado por Inteligencia Artificial (Nebulae Copilot / MCP Agents). El sistema abarca el control total del ciclo comercial para una empresa que opera bajo modelos B2B (Venta por Pedido) y B2C (Retail/Stock Inmediato).

**Misión del Arquitecto:**
Tu objetivo es tomar esta estructura visual y construir la arquitectura real del Backend (FastAPI/Node), la Base de Datos Relacional (PostgreSQL), la lógica de interconexión de módulos y preparar el sistema para un despliegue en producción con autenticación, permisos y agentes IA reales.

A continuación, se detallan los requerimientos estructurales y lógicos que debes construir:

---

## 1. Mapeo de la Base de Datos Relacional y Entidades
Basado en el frontend, debes diseñar un esquema relacional (MER) que nutra a toda la plataforma. Todos los módulos están interconectados:

*   **Usuarios y Gobernanza (Módulo Administrador):** `Users`, `Roles`, `Permissions`. Relación granular donde cada usuario tiene permisos de (Lectura/Escritura/Admin) por cada uno de los módulos del sistema.
*   **Gestión Comercial (Ventas & CRM):** `Leads`, `Clientes`, `Solicitudes`, `Cotizaciones` (con su matemática de rentabilidad, TRM, pesos), `Pedidos_Venta`.
*   **Abastecimiento (Compras):** `Proveedores`, `Pedidos_Compra`, `Tracking_Transito`, `Recepciones`.
*   **Inventario:** `Productos` (SKU, Códigos de barra), `Stock_Fisico`, `Ubicaciones`, `Movimientos_Inventario`.
*   **Finanzas:** `Facturas`, `Cuentas_Cobrar`, `Cuentas_Pagar`, `Ingresos`, `Egresos`.

---

## 2. Flujo de Lógica Central (Core Business Logic)

Debes programar el backend para que cumpla estrictamente este flujo interconectado:

### A. Flujo de Venta por Pedido (B2B)
1.  **Solicitud de Cliente:** Ingresa un Lead (desde Marketing o CRM Omnicanal).
2.  **Cotización:** Se procesa a través del motor matemático (calcula costos, descuentos, anticipos y utilidades).
3.  **Pedido de Venta (PVEN):** Al aprobarse la cotización, se convierte en un PVEN. El estado del PVEN dependerá del estado de los Pedidos de Compra asociados.

### B. Flujo de Compra (Abastecimiento asociado a Ventas)
1.  **Pedido de Compra (PEC):** Se emite asociado obligatoriamente a un Pedido de Venta (para B2B) o a "Stock Base" (para Retail).
2.  **Mercancía en Tránsito:** Al actualizar el tracking (Ej: en barco, aduana), **el PVEN del cliente se actualiza automáticamente** reflejando el progreso.
3.  **Recepciones:** La mercancía llega al almacén (Inventario aumenta). Esto actualiza el estado del PEC a "Recibido" y el PVEN a "Listo para despacho".
4.  **Facturación e Ingresos:** Se factura el PVEN cruzándolo con el anticipo que dio el cliente. Se generan "Cuentas por Cobrar" para el margen restante.
5.  **Envío y Recepción:** Se despacha al cliente final y se cierra el ciclo comercial.

### C. Juego de Inventario (Stock Inmediato)
*   **Manejo de SKUs:** Control de entradas y salidas en tiempo real.
*   **Sincronización E-commerce:** El inventario físico es el maestro. Las salidas por E-commerce restan del stock; las recepciones de Compras suman al stock. Alertas de inventario crítico (re-order points).

### D. Finanzas
*   Nutrición automática: El dashboard financiero debe alimentarse de las cotizaciones aprobadas (Ingresos proyectados), Pedidos de Compra emitidos (Costos), Facturas pagadas (Flujo de caja) y gastos operativos.

---

## 3. Funcionalidades, Botones y Acciones de Pantalla

Por cada pantalla diseñada, debes construir los endpoints y la lógica de negocio para los botones:

*   **Dashboards "Torres de Control" (General, Ventas, Compras):** APIs que agreguen (GROUP BY / SUM) datos en tiempo real (Ingresos hoy, Cotizaciones atascadas, valor en tránsito).
*   **CRM Kanban:** Endpoints para mover tarjetas (Leads) entre columnas, actualizar etapas del embudo y guardar el historial (Timeline) de comunicaciones.
*   **Marketing (Flujos e Historias):** Endpoints para leer las configuraciones del Canvas (Nodos de respuesta) y conectarlas con los Webhooks de mensajería.
*   **Botones de Acción Rápida:** Ej: "Generar Factura" en el Hub de Ventas debe desencadenar la creación del documento financiero y cambiar el estado del PVEN en la BD.

---

## 4. Desarrollo de APIs y Webhooks (Integraciones)

*   **API RESTful / GraphQL:** Construir la estructura completa de controladores y rutas (`/api/v1/ventas/cotizacion`, `/api/v1/compras/recepcion`, etc.).
*   **Webhooks de Canales:** Crear los `endpoints` que escucharán los eventos en vivo de Meta (WhatsApp, Instagram Direct, Facebook Messenger) para el módulo **Omnicanal**, inyectando los mensajes directamente en la Base de Datos y notificando al Frontend vía WebSockets.

---

## 5. Integración de la Arquitectura de Inteligencia Artificial (MCP)

Debes construir la red neuronal del sistema:
*   **Orquestador Principal:** Un Agente Maestro (Nebulae Copilot) que recibe la intención del usuario.
*   **Sub-Agentes MCP (Model Context Protocol):**
    *   *Agente de Ventas:* Lee inventario y calcula cotizaciones.
    *   *Agente de Marketing:* Sugiere respuestas y redacta flujos de Instagram.
    *   *Agente Financiero:* Analiza rentabilidad.
*   **Conexión Frontend-Backend:** El botón de Chat Global (esquina inferior derecha) debe enviar el `path` actual (ej: `/dashboard/compras`) al Orquestador IA para darle contexto inmediato sobre qué datos mostrar u operar.

---

## 6. Despliegue, Autenticación y RBAC (Role-Based Access Control)

Para pasar a Producción, debes implementar:
1.  **Sistema de Login Seguro:** Autenticación vía JWT / OAuth.
2.  **Segregación de Entornos:** Configurar Tenant (si es SaaS) o entornos locales.
3.  **Control de Permisos (RBAC):** La respuesta del login debe contener la matriz de permisos. El frontend ocultará botones o menús si el usuario no tiene permisos. Solo el perfil "Administrador" (SuperAdmin) podrá ver y operar la sección `/dashboard/admin`.

---
**Instrucción Final para el Arquitecto:**
*"Utiliza este documento como la biblia de requerimientos. El frontend ya está construido con las pantallas, estados y mockups de datos. Tu trabajo es reemplazar los 'MOCKS' por llamadas a Base de Datos, asegurar que un cambio en Compras afecte correctamente a Ventas e Inventario, levantar los Webhooks para el CRM Omnicanal, y dar vida al Sistema Multi-Agente MCP."*
