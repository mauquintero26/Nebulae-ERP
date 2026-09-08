# Diagnóstico Visual — WEB-0

**Fecha:** 2026-09-08  
**Nota:** No se pudo levantar el frontend localmente durante WEB-0 (dependencias de node_modules y conexión a API en staging). El diagnóstico visual se basa en análisis de código fuente y deducción de la interfaz.

---

## Evaluación por Pantalla

### `/store` — Inicio

**Estructura visual:**
- Hero banner full-width (60vh), fondo oscuro con imagen Unsplash, texto blanco a la izquierda
- Sección "Recién Llegados": grid 2×4 de tarjetas de producto
- Banner CTA verde esmeralda ("¿Primera vez con nosotros?")
- Footer inline con logo, nav, copyright

**Colores identificados:**
- Primario: `slate-900` (negro azulado)
- Acento: `emerald-500` (verde)
- Fondo: `slate-50` (blanco cálido)
- Texto: `slate-800`, `slate-600`, `slate-400`

**Tipografía:** Font sans (sistema), `font-black` para títulos, `font-bold` para cuerpo

**Estado de carga:** ✅ Skeleton con `animate-pulse` implementado (8 tarjetas)

**Estado vacío:** ✅ Ícono Package + mensaje "No hay productos disponibles"

**Responsive:**
- Hero: ✅ `h-[60vh] min-h-[400px]`
- Grid: ✅ `grid-cols-2 md:grid-cols-4`
- Texto hero: ✅ `text-4xl md:text-6xl`

**Problemas detectados:**
1. 🔴 **Imagen hero hardcodeada** — No cambia aunque la config del sitio tenga otra imagen
2. 🟡 **Footer duplicado** — El footer está inline en `page.tsx` Y en `layout.tsx` (header). No hay footer compartido en el layout. Posiblemente aparece dos veces.
3. 🟡 **Botón "Agregar al Carrito"** solo visible en hover — En mobile no hay hover; el usuario no puede agregar desde la home en móvil sin entrar al producto

**Calificación:** 7/10

---

### `/store/catalogo` — Catálogo

**Estructura visual:**
- Título "Catálogo" + contador de productos
- Sidebar de filtros (oculto en móvil)
- Grid de productos `grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4`
- Botón de filtros para móvil (visible pero panel no renderiza correctamente)

**Skeleton:** ✅ 12 tarjetas placeholder
**Estado vacío:** ✅ Con botón "Limpiar filtros"
**Filtros:** Búsqueda por texto, categoría (select con optgroup), precio min/max, marca (radio buttons)

**Problemas detectados:**
1. 🔴 **Sidebar móvil incompleto** — `sidebarOpen` state existe pero el panel de filtros móvil no está implementado (solo el botón). En móvil no hay forma de filtrar.
2. 🟡 **Filtros de precio/marca en cliente** — Se hacen en JS local, no en server. Con catálogos grandes (>50 productos) puede ser lento.
3. 🟡 **No hay ordenamiento** — Sin opción de ordenar por precio, novedad, popularidad.
4. 🟡 **Paginación ausente** — Carga los primeros 50 y no hay más.

**Calificación:** 6/10 (funcional pero con gap importante en móvil)

---

### `/store/producto/[id]` — Detalle de Producto

**Estructura visual:**
- Breadcrumb Inicio → Catálogo → Categoría → Nombre
- Grid 2 columnas: galería + info
- Galería: imagen principal aspect-square + thumbnails horizontales
- Info: badge marca, título, precio (con tachado si descuento), descripción corta
- Atributos dinámicos con botones de selección
- Selector de cantidad +/-
- Botón "Agregar al Carrito" negro full-width
- Meta info (SKU, categoría, marca)
- Descripción larga (si existe)

**Loading:** ✅ Skeleton completo para ambas columnas
**Error 404:** ✅ "Producto no encontrado" con link al catálogo

**Problemas detectados:**
1. 🟡 **Sin indicador de modalidad** — No distingue visualmente "Entrega inmediata" vs "Por pedido"
2. 🟡 **Stock visible** — Muestra "X disponibles" pero es el campo `stock_disponible` del catálogo web (puede estar desactualizado)
3. 🟡 **Sin galería deslizante en móvil** — Los thumbnails se pueden salir del viewport en pantallas pequeñas
4. 🔴 **Sin validación de atributos requeridos** — Se puede agregar al carrito sin seleccionar talla/color

**Calificación:** 8/10

---

### `/store/checkout` — Checkout

**Estructura visual:**
- Breadcrumb "Carrito > Checkout"
- Grid 2 columnas: formulario + resumen
- Formulario: nombre, email, teléfono, dirección, ciudad, notas
- Método de pago: solo "Tarjeta/PSE (Wompi)" hardcodeado
- Botón "Pagar $X" negro full-width
- Estado de éxito con confirmación

**Problemas detectados:**
1. 🔴 **ROTO EN PRODUCCIÓN** — No envía `idempotency_key` → El backend retornará 422
2. 🔴 **ROTO EN PRODUCCIÓN** — No envía `sku_id`/`sku` → El backend retornará 404
3. 🔴 **Sin pasarela real** — Crea el pedido pero no redirige a Wompi/PSE
4. 🔴 **Precio hardcodeado** — Muestra `$X.toLocaleString()` en vez de formato COP correcto
5. 🟡 **Sin validación de carrito vacío antes de mostrar** — Solo se valida al submit

**Calificación:** 3/10 — Funcional visualmente pero roto funcionalmente

---

### `/store/cuenta` — Mi Cuenta

**Estructura visual:**
- Tabs "Iniciar Sesión" / "Crear Cuenta"
- Formularios completos con validación visual
- Logo Nebulae en el centro
- Diseño centrado en pantalla completa

**Problemas detectados:**
1. 🔴 **MOCK COMPLETO** — No conecta a ningún backend
2. 🟡 **Sin auth de cliente** — No hay JWT de comprador separado del JWT del ERP

**Calificación:** 6/10 (visual bien) — 1/10 funcional

---

### `/store/contacto` — Contacto

**Estructura visual:**
- Header de sección con breadcrumb
- Grid 5 columnas: formulario (3) + info lateral (2)
- Info lateral: WhatsApp (si configurado), datos, horarios
- Formulario: nombre, teléfono, email, tipo, mensaje

**Calificación:** 8/10 visual — 4/10 funcional (formulario no envía)

---

### `/store/blog` — Blog

**Estructura visual:**
- Título centrado + descripción
- Tabs filtro por categoría
- Grid de artículos con imagen, badge, fecha, título, extracto
- Modal de lectura completa al hacer clic

**Calificación:** 9/10 visual — 2/10 funcional (100% hardcodeado)

---

### `/dashboard/ecommerce` — Admin Ecommerce

**Estructura visual:**
- Tabs: Resumen | Catálogo | Pedidos | Configuración
- Stats cards con KPIs
- Tabla de productos con acciones CRUD
- Tabla de pedidos con estados y filtros
- ProductModal de edición completo (5 tabs)

**Calificación:** 9/10 visual — 8/10 funcional (la más completa)

---

### `/dashboard/sitio-web` — Constructor Sitio (v1)

**Estructura visual:**
- Layout de dos paneles: chat IA (izquierda) + config (derecha)
- Chat con mensajes tipo WhatsApp
- Paneles de sección: Hero, Contacto, Colores, Productos destacados, etc.
- Selector dispositivo

**Calificación:** 7/10 visual — 6/10 funcional

---

### `/dashboard/website` — Constructor Sitio (v2 visual)

**Estructura visual:**
- Tema oscuro completo (`#1e1e24`)
- Layout 3 columnas: Chat IA | Canvas | Panel capas
- Canvas con simulación de dispositivo
- Panel de bloques disponibles (Layout, Texto, Media, etc.)
- Barra de herramientas con Undo/Redo

**Calificación:** 9/10 visual — 2/10 funcional (mock)

---

## Resumen de Calificaciones

| Pantalla | Visual | Funcional | Prioridad |
|----------|--------|-----------|-----------|
| Inicio | 7/10 | 6/10 | Alta |
| Catálogo | 7/10 | 7/10 | Alta |
| Producto (canónico) | 8/10 | 7/10 | Alta |
| Producto (duplicado) | 7/10 | 1/10 | Eliminar |
| Checkout | 7/10 | 2/10 | **Crítica** |
| Cuenta | 6/10 | 1/10 | WEB-3 |
| Contacto | 8/10 | 4/10 | Media |
| Blog | 9/10 | 2/10 | Baja |
| Admin Ecommerce | 9/10 | 8/10 | Mantener |
| Sitio-web | 7/10 | 6/10 | WEB-5 |
| Website builder | 9/10 | 2/10 | WEB-5 |

---

## Guía de Identidad Visual Detectada

| Elemento | Valor detectado |
|----------|----------------|
| **Marca** | "NEBULAE." con punto esmeralda |
| **Color primario** | `emerald-500` (#10b981) |
| **Color secundario** | `slate-900` (#0f172a) |
| **Fondo** | `slate-50` (#f8fafc) |
| **Tarjetas** | `bg-white rounded-2xl border border-slate-100` |
| **Botón CTA** | `bg-emerald-500 hover:bg-emerald-600 rounded-full` |
| **Botón comprar** | `bg-slate-900 hover:bg-slate-800 rounded-xl` |
| **Skeletons** | `animate-pulse bg-slate-200 rounded` |
| **Badges descuento** | `bg-rose-500 text-white rounded-lg` |
| **Tipografía** | System font, `font-black` (títulos), `font-bold` (acciones) |
| **Bordes** | `rounded-2xl` tarjetas, `rounded-full` pills, `rounded-xl` botones |
| **Sombras** | `shadow-2xl` modales, `shadow-lg` cards hover |

Esta paleta debe conservarse y extenderse — no reemplazarse.
