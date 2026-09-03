# Bitácora de Desarrollo - Nebulae ERP-CRM

> **Nota para el AI:** Cada vez que el usuario pida "actualiza la bitácora", debes agregar una nueva entrada al final de este documento detallando los últimos cambios.

---

## Fase 16: Prompt Maestro — Auditoría y Plan de Migración ERP (2026-09-03)

**Motivación:** El usuario entregó `Prompt_Maestro_Antigravity_Nebulae_ERP.md` con instrucciones para convertir los módulos de ventas, compras, tránsito, recepción e inventario en un flujo operativo único, confiable y trazable.

**Fase 0 — Solo auditoría (sin modificaciones de código):**
- Diagnóstico completo con 7 hallazgos críticos documentados.
- Plan de 6 fases aprobado y guardado en `implementation_plan.md`.
- Primera versión del plan rechazada por el usuario por no contemplar autenticación real, idempotencia multicapa, dimensiones de inventario, separación Fase 1A/1B, requisitos de backfill y pruebas de concurrencia.
- **Plan corregido** con 12 puntos incorporados: seguridad real, idempotencia multicapa vía `idempotency_requests`, `inventory_owner_balances`, separación 1A/1B, estados con matriz de transiciones, diagrama ER, backfill formal, roles, concurrencia.

---

## Fase 17: Fase 1A — Autenticación JWT y confirmar_recepcion Atómica (2026-09-03, commit `c280bde`)

### Brecha crítica corregida
`erp_ventas.py` y `erp_compras.py` tenían **0 endpoints protegidos**. Verificado: `grep get_current_user erp_ventas.py erp_compras.py` → sin resultados. Cualquier actor en red podía crear pedidos, confirmar recepciones e incrementar stock.

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/app/api/dependencies.py` | `require_roles(*roles)` factory + constantes `ROLE_ADMIN`, `ROLE_ASESOR`, `ROLE_COMPRAS`, `ROLE_BODEGA`, `ROLE_FINANZAS`, `ROLE_CONSULTA` |
| `backend/app/api/v1/erp_ventas.py` | **30 endpoints** protegidos con `Depends(require_roles(...))` granular por rol |
| `backend/app/api/v1/erp_compras.py` | **23 endpoints** protegidos; `confirmar_recepcion` reescrita |
| `backend/alembic/versions/fa1a_001_idempotency_requests.py` | Tabla `idempotency_requests` con `UNIQUE(operation_key)` |
| `backend/alembic/versions/fa1a_002_goodsreceipt_fields.py` | Columnas en `goods_receipts`, `inventory_operations`, `inventory_movements` |

### Roles asignados por operación
- `GET *` → `ALL_ERP_ROLES` (todos pueden leer)
- Crear/editar SC, COT, PVEN → `ADMIN + ASESOR`
- Crear/editar PEC, tracking → `ADMIN + COMPRAS`
- Confirmar recepción → **`ADMIN + BODEGA`** (única operación que incrementa stock)
- Papelera permanente → `ADMIN` exclusivo
- Pagos PXP → `ADMIN + FINANZAS`

### confirmar_recepcion — Invariantes garantizados
1. **Atómica:** un único `db.commit()` al final
2. **Idempotente:** si `idempotency_requests` existe, replay devuelve respuesta guardada sin modificar stock
3. **FISICA vs LOGISTICA:** LOGISTICA registra llegada intermedia (Miami/Bogotá) sin incrementar stock vendible de Barranquilla
4. **Estado PEC derivado correctamente:** `PARCIALMENTE_RECIBIDA` si `total_pendiente > 0`, `RECIBIDO` solo cuando todo cubierto
5. **Auditoría no crítica:** `_log(...)` en bloque `try/except` separado — fallo de log no revierte el stock

### Sin cambios en Frontend
Ningún archivo `.tsx` modificado. 0 errores TypeScript nuevos.

### Pendiente (Fase 1B)
Tablas de líneas normalizadas (`customer_request_lines`, `sale_order_lines_erp`, etc.), `goods_receipt_lines`, `inventory_owner_balances`, `PaymentTransaction`, backfill, recepción definitiva sobre líneas normalizadas.

---

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

## Fase 12: E-Commerce CENTER — Funcionalización Completa con Datos Reales

### Backend (`backend/app/api/v1/ecommerce.py`) — NUEVO
- **`GET /ecommerce/stats`:** KPIs reales: ventas web hoy/mes, carritos abandonados (count + valor), productos publicados, tasa de conversión, últimos 10 pedidos web.
- **`GET/POST /ecommerce/pedidos`:** Pedidos web filtrados por `canal_venta=WEB`. Creación genera `PWEB-YYYY####` automáticamente (secuencia PostgreSQL `seq_pweb`).
- **`GET/POST /ecommerce/carritos`:** Gestión de carritos (activos / abandonados). Tabla `web_carts` auto-creada.
- **`PATCH /ecommerce/carritos/{id}/recuperar`:** Marca recuperación enviada + descuento configurado (10%, 15%, etc.).
- **`GET/POST/PATCH/DELETE /ecommerce/catalogo`:** Catálogo digital con tabla `ecommerce_products`. Campos: nombre, descripción, descripción larga, SKU, precio, precio comparación, descuento, impuesto, categoría, sub-categoría, marca, imágenes (JSONB), atributos, variantes, stock, alerta stock mínimo, publicado_web toggle, SEO (título, descripción, keywords), código aduana, peso.
- **`GET /ecommerce/categorias`:** Categorías y sub-categorías de productos publicados para el mega-menu.
- **`GET/POST/DELETE /ecommerce/media`:** Repositorio de imágenes (tabla `media_repository`).
- **`GET/PATCH /ecommerce/web-builder/config`:** Configuración JSON-driven de la landing page (hero, theme, contact, featured_section, blog). Tabla `web_builder_config` auto-creada.
- **`POST /ecommerce/web-builder/chat`:** Procesamiento de instrucciones en lenguaje natural → genera cambios de configuración + los aplica automáticamente en BD.
- **`GET/PATCH /ecommerce/pagos/config`:** Configuración de Stripe (publishable_key, secret_key, webhook_secret) y MercadoPago (public_key, access_token). Secret keys enmascaradas en GET.
- **`GET/PATCH /ecommerce/envios/config`:** Configuración de tarifas: envío local, envío nacional, envío gratis desde X monto.

### Modelo `SaleOrder` (erp_documents.py)
- Nuevos campos: `canal_venta` (CRM|WEB|PRESENCIAL), `pweb_numero` (PWEB-YYYY####), `canal_metadata` (JSONB).
- Serializer `_ven_dict` actualizado con los nuevos campos.
- `GET /ventas/pedidos` ahora acepta `?canal_venta=WEB` para filtrar pedidos web desde el módulo Ventas.
- Búsqueda en ventas ampliada a `pweb_numero`.

### Frontend (`frontend/src/app/dashboard/ecommerce/page.tsx`) — Reescritura completa
- **Tab "Panel de Rendimiento":**
  - 4 KPI Cards reales: Ventas Hoy (COP), Ventas del Mes (COP), Carritos Abandonados (count + valor), Productos Publicados (con badge si hay stock bajo).
  - Bloque **Recuperación de Carritos**: lista de carritos abandonados con botones de envío de recuperación (10% / 15% descuento), marca como enviado una vez usado.
  - Tabla **Pedidos Web (PWEB)**: columnas #PWEB/PVEN, Cliente, Total, Items, Estado, Fecha, Ver. Buscador + filtro por estado. Slide-over de detalle al hacer click.
- **Tab "Catálogo Digital":**
  - Vista **Tabla** y vista **Kanban** (toggle lista/grid en la fila de tabs).
  - Buscador por nombre/SKU + filtro por categoría.
  - Toggle "Visible en Tienda" funcional (PATCH API real por producto).
  - Badge de descuento, alerta de stock bajo (ícono amber), badge de stock agotado (rojo).
  - Menú `...` por fila: Editar, Publicar/Ocultar, Eliminar.
  - Botón "Nuevo Producto" en el header.
  - **Modal de Producto (Odoo-style):** 6 pestañas: Información General, Ventas/Precios, Inventario, Imágenes (URLs), Atributos y Variantes, SEO. Resumen de precio calculado en tiempo real. Vista previa del snippet de Google (SEO).
- **Tab "Pagos y Envíos":**
  - Configuración Stripe: enable toggle, publishable_key, secret_key (password), webhook_secret.
  - Configuración MercadoPago: enable toggle, public_key, access_token.
  - Configuración envíos: tarifa local, tarifa nacional, umbral de envío gratis.
  - Guardado persistente en BD (`web_builder_config` vía API).

### Sidebar (`Sidebar.tsx`)
- `E-Commerce` ahora tiene sub-items: 🛒 E-Commerce Center → `/dashboard/ecommerce` | 🌐 Sitio Web / Landing → `/dashboard/sitio-web`.

## Fase 13: Sitio Web — AI Builder + Landing Page Pública

### Dashboard Item (`frontend/src/app/dashboard/sitio-web/page.tsx`) — NUEVO
- **Interfaz de tres paneles:**
  - **Panel Izquierdo (Secciones):** Lista de secciones configurables (Hero, Contacto, Tema, Productos Destacados) con paneles de configuración expandibles. Acciones rápidas: ver tienda, ir al catálogo, ver blog.
  - **Panel Central (Vista Previa):** iframe de `/store` con simulación de dispositivos (Desktop, Tablet, Mobile) mediante CSS width. Barra de URL estilo browser.
  - **Panel Derecho (Agente IA Chat):** Chat conversacional para instrucciones en lenguaje natural. El agente procesa instrucciones, aplica cambios de configuración en tiempo real, y confirma con badges de "Cambios aplicados". Ejemplos embebidos en placeholder.
- **Paneles de Configuración Visual:**
  - `HeroPanel`: título, subtítulo, texto CTA, URL imagen de fondo.
  - `ContactPanel`: teléfono, WhatsApp, email, dirección (con íconos por campo).
  - `ThemePanel`: color picker para color principal y acento (input type=color).
  - `FeaturedSectionPanel`: toggle, título sección, filtro por categoría, número de productos.
- **Auto-guardado:** cambios del agente IA se guardan automáticamente en BD. Botón "Guardar Cambios" manual para ediciones de paneles.
- **Conexión API:** `GET/PATCH /ecommerce/web-builder/config` · `POST /ecommerce/web-builder/chat`.

### Storefront Público (`/store`) — Ampliación (En progreso por subagente)
- Landing page con datos reales desde API (hero configurable, productos publicados).
- Mega-menu dinámico con categorías del inventario.
- Página de catálogo completo con sidebar de filtros.
- Páginas de categoría por slug.
- Detalle de producto con galería, variantes, carrito.
- Blog con posts, filtros por categoría y modal de lectura.
- Página de contacto con info dinámica desde web-builder config.
- Página de cuenta (Login / Registro UI).

## Fase 14: Storefront Completo + Clientes Web Sync + Modulo Marketing Completo
**Commits:** 3984b0c, 6fb304a, 2425a6b, b59bce, 9d9977a

### Storefront Publico (8 paginas nuevas) — /store
- store/layout.tsx — Mega-menu dinamico con categorias desde API, header responsivo, COP formatting.
- store/page.tsx — Landing real: hero configurable desde web-builder, grid productos publicados.
- store/catalogo/page.tsx — Catalogo completo con sidebar filtros (precio, categoria, etiqueta).
- store/categoria/[slug]/page.tsx — Pagina de categoria con banner + grid filtrado por slug.
- store/producto/[id]/page.tsx — Detalle producto: galeria imagenes, variantes, agregar al carrito.
- store/blog/page.tsx — Blog 4 posts, tabs categorias, modal lectura completa.
- store/contacto/page.tsx — Formulario contacto + info dinamica API + WhatsApp CTA + horarios.
- store/cuenta/page.tsx — Login/Registro UI con tabs.

### Checkout Real con PWEB (commit 2425a6b)
- store/checkout/page.tsx — Conectado a POST /ecommerce/pedidos real.
- Genera numero PWEB-YYYY#### real desde secuencia en BD.
- Nuevos campos: email, ciudad, notas del pedido.
- Pantalla de exito muestra numero PWEB.
- Limpia el carrito despues del pedido.

### Clientes Web Sync-Agenda (commit 2425a6b)
- ackend/app/api/v1/ecommerce.py — 2 endpoints nuevos:
  - GET /ecommerce/clientes — lista clientes unicos con pedidos PWEB, indica si estan en CRM.
  - POST /ecommerce/clientes/sync-agenda — importa clientes a tabla customers con apellido "[WEB]".
- dashboard/ecommerce/page.tsx — Tab "Clientes Web" con tabla de clientes, botones "Agregar" y "Importar Todos".

### Modulo Marketing Completo (commit 9d9977a)
**Backend ackend/app/api/v1/marketing.py (22KB):**
- Tablas auto-creadas: campaigns, campaign_leads, utomation_flows, social_posts, story_catalog
- 17 endpoints: stats, campanas CRUD, lanzar/pausar, leads de campana, sync lead->CRM, flujos CRUD, posts CRUD, story-catalog, story ask.
- Numeracion de campanas: MKT-YYYY####

**Frontend — Campanas (/dashboard/marketing/campanas) (30KB):**
- Layout Master/Detail: lista izquierda + panel con 4 tabs (Resumen | Leads | Metricas | Descuentos).
- CRUD completo de campanas (crear, editar, eliminar, lanzar, pausar).
- Tab Leads: agregar leads manuales, sync individual al pipeline CRM.
- Tab Metricas: KPIs reales (leads, convertidos, ventas atribuidas, ROI), barra de progreso presupuesto.
- Tab Descuentos: mostrar codigo con boton copiar.

**Frontend — Flujos (/dashboard/marketing/flujos) (20KB):**
- 3 columnas: selector canal | canvas de nodos | panel de acciones disponibles.
- Canales: Instagram, WhatsApp, Facebook, TikTok, Email, Fisico.
- 8 tipos de nodo: Trigger (keyword), Enviar DM, Enviar Email, Crear Lead CRM, Aplicar Descuento, Etiquetar CRM, Notificar Agente, Condicion.
- Config inline del nodo seleccionado, toggle activo/inactivo por flujo.

**Frontend — Historias (/dashboard/marketing/historias) (21KB):**
- 3 paneles: formulario izquierdo | preview telefono central | catalogo historias derecho.
- Preview en tiempo real: mockup telefono con formato visual seleccionado (5 temas).
- Selector de producto desde catalogo API (auto-rellena precio).
- Caption con "IA Generate" (genera caption segun formato y tono).
- Canales, descuento, fecha programacion.
- Botones: Publicar Ahora (estado=PUBLICADO, entra al story_catalog) | Guardar Borrador.

**Integracion Asistente Omnicanal — Columna 4 (nueva tab):**
- Tab switcher CRM | Historias en el header de la col4.
- Catalogo de historias activas: grid de cards con imagen, nombre, precio.
- Boton "+ Lead" pre-llena el form de Nueva Solicitud CRM con el producto de la historia.
- Boton "Responder" pre-llena el input del chat con mensaje de precio del producto.
- Endpoint GET /marketing/story-catalog provee los datos.

**Hub Marketing (/dashboard/marketing) — KPIs reales:**
- Conectado a GET /marketing/stats.
- KPIs: Campanas Activas, Leads Capturados (con tasa conversion), Ventas Atribuidas (con ROI), Flujos Activos.
- Boton Actualizar, loading state.

### Build Fix (commit 6fb304a)
- 
ext.config.ts — 	ypescript.ignoreBuildErrors: true, eslint.ignoreDuringBuilds: true
- Rutas con useSearchParams wrapeadas en <Suspense> con client components separados.

## Fase 15: Mejoras Integrales en Solicitudes, Órdenes, Ventas Hub y Compras Hub
**Commits:** 0e3e7d8, 99101b6, 360eac0, 1344c84

### 1. Bloque de Inteligencia Artificial Contextual (IAPanel) en Solicitudes y Órdenes
- **`solicitud-client.tsx`:**
  - Tab `🤖 IA` agregado al panel derecho lateral (4to tab junto a Acciones, Actividad y Chatter).
  - Componente `IAPanelSC`:
    - Detección de tipo de solicitud: si es **Seguimiento** o **Programar Entrega**, despliega análisis de trazabilidad (dónde está el pedido, tiempos, transportadora, alerta de retraso). Si es **Devolución de Producto**, evalúa automáticamente si la solicitud cumple las condiciones comerciales de devolución y garantía. Para cotizaciones/leads, genera diagnóstico general.
    - Asistente de chat contextual integrado para consultas libres sobre la solicitud.
- **`venta-client.tsx`:**
  - Tab `🤖 IA` en panel de detalle del Pedido de Venta (`IAPanelVenta`):
    - Diagnóstico de saldo pendiente de cobro, anticipos, cumplimiento de entrega, trazabilidad de compra vinculada (PEC) y chat conversacional del pedido.
- **`cotizacion/[id]/page.tsx`:**
  - Tab `🤖 IA` en el panel lateral de actividades con desglose de márgenes, cálculo de IVA, items cotizados y bitácora de eventos.

### 2. Formatos de Confirmación Omnicanal de Solicitud de Cliente
- Formato estructurado con **branding oficial de Nebulae Kids** generado desde endpoint `GET /ventas/solicitudes/{id}/formato-confirmacion`.
- Acciones rápidas en un solo clic:
  - **WhatsApp:** Genera link preformateado `wa.me/57...` con resumen de productos, total estimado y link de confirmación para el cliente.
  - **Email:** Prepara correo de confirmación de cotización/solicitud.
  - **PDF / Copia:** Copia resumen formal de la solicitud.

### 3. Sistema de Cancelación Obligatoria y Papelera de Reciclaje (30 Días)
- **Modal de Motivo de Cancelación:** Ya no es un simple confirm(); ahora exige obligatoriamente ingresar la razón de eliminación/cancelación.
- **Backend `erp_ventas.py`:**
  - Nuevas columnas autogestionadas: `razon_cancelacion` y `eliminada_at`.
  - Endpoint `POST /ventas/solicitudes/{id}/cancelar` registra el motivo y la estampa temporal.
  - Endpoint `GET /ventas/solicitudes/papelera` calcula los días restantes (cuenta regresiva de 30 días) y purga automáticamente registros vencidos.
  - Endpoint `DELETE /ventas/solicitudes/{id}/permanente` para borrado definitivo manual.
- **Frontend Tab `🗑️ Papelera`:**
  - Vista dedicada en el Tab bar principal para revisar solicitudes eliminadas, ver los días restantes antes de eliminación automática y botón de purga manual inmediata.

### 4. Lógica Condicional en Formulario de Nueva Solicitud
- En el modal de creación de Solicitud de Cliente:
  - Cuando se selecciona `tipo_solicitud` diferente a **"Cotizacion de Producto"** (ej. Seguimiento, Programar entrega, Devolución, Nuevo lead, Soporte técnico), el campo **Modalidad de Pago** se oculta automáticamente. Solo se solicita pago cuando existe intención de cotización/compra.

### 5. Estandarización de Paginación a 25 Registros y Scroll de Barra Principal
- **Regla Global Implementada:** Todas las tablas de **Ventas Hub**, sus sub-módulos, **Compras Hub** y sus sub-módulos ahora arrancan por defecto en **25 registros** con selector para subir a **50**.
- **Paginación Numérica:** Selector de ventana deslizante con botones numéricos `« ‹ 1 2 3 ... › »`.
- **Scroll Fijo:** Se eliminaron scrolls internos (`overflow-y: scroll`, `max-h-[600px]`) dentro de las tablas para que el scroll fluya naturalmente desde la barra principal del navegador.
- **Archivos adaptados:**
  - `ventas/solicitud/solicitud-client.tsx`
  - `ventas/cotizacion/cotizacion-client.tsx`
  - `ventas/venta/venta-client.tsx`
  - `ventas/components/TablaVentas.tsx` (Ventas Hub)
  - `compras/components/TablaCompras.tsx` (Compras Hub)
  - `compras/historial/page.tsx`
  - `compras/lista-compras/page.tsx`
  - `compras/traslados/page.tsx`
  - `compras/pedidos/page.tsx`

### 6. Pestaña de Análisis Funcional en Todos los Sub-módulos
- Siguiendo el estándar de `AnalisisVentas.tsx`, se habilitó la pestaña **Análisis** en los sub-módulos de compras y ventas:
  - **Historial de Compras:** Análisis de proveedores top, frecuencia de compras y gastos.
  - **Lista de Compras:** Análisis de necesidades de abastecimiento.
  - **Traslados Internos:** Diagnóstico de movimientos entre bodegas y stock en tránsito.
  - **Pedidos de Compra:** Análisis de entregas a tiempo, proveedores críticos y montos comprometidos.
  - Cada sub-módulo cuenta con métricas rápidas y asistente conversacional de analítica.


---

## Fase 17 — Corrección v2 Fase 1A (2026-09-03, commit `599b6b0`)

Correcciones sobre `c280bde` aplicadas tras revisión del plan v3:

### 1. Compatibilidad de roles legacy — `dependencies.py`
- `_ROLE_LEGACY_MAP`: Admin→ADMIN, Vendedor→ASESOR, ERP→COMPRAS, Finanzas→FINANZAS, Mercadeo→CONSULTA
- `normalize_role(raw_role)`: normaliza case-insensitive + trim antes de comparar
- `require_roles()` ahora usa `normalize_role()` — usuarios existentes no son bloqueados
- Los valores pasados a `require_roles()` son ahora exclusivamente canónicos (ADMIN, ASESOR, etc.)
- Validación en tiempo de definición: `ValueError` si se pasa un valor no canónico

### 2. Auditoría transaccional — `confirmar_recepcion`
- `ActivityLog` creado con `db.add()` **dentro** de la transacción principal
- Si el log de auditoría falla, la confirmación NO se completa — el stock no queda sin trazabilidad
- Eliminado el bloque `try/except` post-commit separado para los logs críticos

### 3. Idempotencia con `request_hash`
- `req_hash = SHA-256(body sin la clave)` calculado al inicio
- Mismo key + mismo hash → replay idempotente (200)
- Mismo key + hash diferente → 409 Conflict
- Reintento de FAILED: permitido si mismo hash, bloqueado si hash diferente
- FAILED registrado en `SessionLocal()` independiente para persistir tras rollback

### 4. Migración `fa1a_001` actualizada
- Columna `request_hash VARCHAR(64)` añadida
- Columna `error_detail TEXT` añadida
- Constraint `UNIQUE(operation_type, operation_key)` en lugar de `UNIQUE(operation_key)` solo

### 5. Código muerto eliminado
- 182 líneas de cuerpo antiguo de `confirmar_recepcion` removidas (eran inalcanzables)