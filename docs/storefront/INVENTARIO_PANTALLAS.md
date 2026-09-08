# Inventario de Pantallas — WEB-0

**Fecha:** 2026-09-08  
**Rama:** `feature/storefront-ecommerce`

---

## 1. Tienda Pública — `frontend/src/app/store/`

### 1.1 Inicio — `/store`
| Campo | Valor |
|-------|-------|
| **Archivo** | `frontend/src/app/store/page.tsx` |
| **Tamaño** | 205 líneas, 8.8 KB |
| **Tipo** | `"use client"` — CSR |
| **Público objetivo** | Visitantes externos, clientes potenciales |
| **Componentes usados** | `ProductCard` (local), `Link`, íconos Lucide, `useCart` del layout |
| **Datos visibles** | Hero con título/subtítulo/CTA, grid de productos (máx 8), banner de registro |
| **Origen de datos** | `GET /api/v1/ecommerce/web-builder/config` (config hero), `GET /api/v1/ecommerce/Catálogo?publicado=true&limit=8` (productos) |
| **Botones y acciones** | "Explorar Colección" → `/store/catalogo`, "Agregar al Carrito" (hover), "Ver todos" → `/store/catalogo`, "Crear Cuenta" → `/store/cuenta` |
| **Estado funcional** | **CONECTADO PARCIAL** — Llama a API real. Si API no responde, muestra estado vacío. |
| **Contenido hardcodeado** | Hero fallback texts ("Comodidad que se adapta a ti.", "Nueva Colección 2026"), imagen Unsplash hero |
| **Mocks** | Ninguno explícito, pero usa imagen externa estática |
| **Acciones sin implementar** | Carrito no persiste entre sesiones |
| **Problemas visuales** | Footer duplicado con la tienda (inline en page.tsx) |
| **Problemas responsive** | Grid `grid-cols-2 md:grid-cols-4` — aceptable |
| **Problemas accesibilidad** | Imagen hero sin alt descriptivo, botones hover-only no accesibles en táctil |
| **Mejoras recomendadas** | Imagen hero desde config; persistencia carrito localStorage; SEO meta |
| **Clasificación** | **CONSERVAR Y MEJORAR** |

---

### 1.2 Catálogo — `/store/catalogo`
| Campo | Valor |
|-------|-------|
| **Archivo** | `frontend/src/app/store/catalogo/page.tsx` |
| **Tamaño** | 273 líneas, 12 KB |
| **Tipo** | `"use client"` — CSR |
| **Público objetivo** | Compradores explorando productos |
| **Componentes usados** | `ProductCard` (local redefinida), `useCart`, sidebar de filtros, iconos Lucide |
| **Datos visibles** | Lista de productos filtrable, contador de resultados, sidebar con filtros (categoría, precio, marca) |
| **Origen de datos** | `GET /api/v1/ecommerce/catalogo?publicado=true&limit=50&search=X&categoria=Y` (backend real) |
| **Botones y acciones** | Filtrar por búsqueda, categoría, precio, marca; limpiar filtros; "Agregar al Carrito" |
| **Estado funcional** | **CONECTADO** — API real. Filtros de marca/precio se aplican en cliente (no en server) |
| **Contenido hardcodeado** | Ninguno relevante |
| **Mocks** | Ninguno |
| **Acciones sin implementar** | Paginación, ordenamiento (relevancia/precio), móvil: sidebar no se despliega correctamente (botón visible pero panel no renderiza) |
| **Problemas visuales** | Sidebar móvil: botón `sidebarOpen` existe pero no hay panel condicional renderizado para móvil |
| **Problemas responsive** | Panel de filtros oculto en móvil pero sin alternativa visual completa |
| **Problemas accesibilidad** | Select sin label accesible |
| **URL duplicada** | La página también llama endpoint como `Catálogo` (con tilde) en store/page.tsx vs `catalogo` (sin tilde) aquí — inconsistencia de casing |
| **Mejoras recomendadas** | Sidebar móvil drawer; paginación server-side; ordenamiento; URL normalizada |
| **Clasificación** | **CONSERVAR Y MEJORAR** |

---

### 1.3 Categoría — `/store/categoria/[slug]`
| Campo | Valor |
|-------|-------|
| **Archivo** | `frontend/src/app/store/categoria/[slug]/page.tsx` |
| **Tamaño** | ~9.7 KB |
| **Tipo** | `"use client"` |
| **Público objetivo** | Compradores filtrando por categoría |
| **Datos visibles** | Nombre de categoría como título, productos filtrados |
| **Origen de datos** | `GET /api/v1/ecommerce/catalogo?categoria=[slug]` |
| **Estado funcional** | **CONECTADO PARCIAL** |
| **Clasificación** | **CONSERVAR Y MEJORAR** |

---

### 1.4 Detalle Producto (CANÓNICO) — `/store/producto/[id]`
| Campo | Valor |
|-------|-------|
| **Archivo** | `frontend/src/app/store/producto/[id]/page.tsx` |
| **Tamaño** | 234 líneas, 11 KB |
| **Tipo** | `"use client"` |
| **Público objetivo** | Comprador viendo producto específico |
| **Componentes usados** | `useCart`, galería de imágenes, selector de atributos, selector de cantidad, breadcrumb |
| **Datos visibles** | Marca, nombre, precio, precio comparación, descuento, descripción, atributos (talla/color/etc.), stock disponible, SKU, categoría |
| **Origen de datos** | `GET /api/v1/ecommerce/catalogo/{id}` |
| **Botones y acciones** | Selector atributos, +/-, "Agregar al Carrito" (deshabilitado si stock=0) |
| **Estado funcional** | **CONECTADO** — Funcional. Maneja loading, error 404 |
| **Contenido hardcodeado** | Ninguno |
| **Acciones sin implementar** | No hay reserva real al agregar; variantes por SKU separado no implementadas |
| **Problemas** | El carrito no valida stock en tiempo real contra el backend |
| **Clasificación** | **CONSERVAR Y MEJORAR** — Es la versión más completa. Ruta canónica recomendada |

---

### 1.5 Detalle Producto (DUPLICADO) — `/store/product/[id]`
| Campo | Valor |
|-------|-------|
| **Archivo** | `frontend/src/app/store/product/[id]/page.tsx` |
| **Tamaño** | 111 líneas, 5 KB |
| **Tipo** | `"use client"` |
| **Estado funcional** | **MOCK PURO** — No llama ninguna API. Datos 100% hardcodeados |
| **Datos visibles** | Producto hardcodeado "Vestido Materno Elegance", colores y tallas mockeados, estrellas ficticias |
| **APIs consumidas** | Ninguna |
| **Clasificación** | **CONSOLIDAR** → Eliminar en WEB-1. La ruta canónica es `/store/producto/[id]` |

---

### 1.6 Checkout — `/store/checkout`
| Campo | Valor |
|-------|-------|
| **Archivo** | `frontend/src/app/store/checkout/page.tsx` |
| **Tamaño** | 198 líneas, 10.8 KB |
| **Tipo** | `"use client"` |
| **Público objetivo** | Comprador finalizando compra |
| **Componentes usados** | `useCart`, formulario contacto/dirección, resumen de orden |
| **Datos visibles** | Items del carrito, subtotal, formulario dirección, método de pago |
| **Origen de datos** | Carrito en memoria (React state), `POST /api/v1/ecommerce/pedidos` al confirmar |
| **Botones y acciones** | "Pagar $X" → crea pedido en backend |
| **Estado funcional** | **PARCIALMENTE CONECTADO** — Llama al endpoint correcto PERO sin `idempotency_key` (requerido por backend desde v2). Sin integración de pasarela real. |
| **Contenido hardcodeado** | Método de pago "Tarjeta de Crédito / PSE (Wompi)" hardcodeado y sin implementar |
| **Mocks** | Pago simulado: crea pedido pero no redirige a pasarela |
| **Acciones sin implementar** | Pasarela de pago real, idempotency_key, validación stock en checkout, reserva de inventario |
| **Problemas críticos** | Backend requiere `idempotency_key` → checkout actual recibirá 422. Backend requiere `sku_id` o `sku` por línea → checkout envía `nombre` en vez de SKU. |
| **Clasificación** | **CONECTAR AL BACKEND** — Requiere refactor en WEB-3 |

---

### 1.7 Cuenta — `/store/cuenta`
| Campo | Valor |
|-------|-------|
| **Archivo** | `frontend/src/app/store/cuenta/page.tsx` |
| **Tamaño** | 69 líneas, 7.9 KB |
| **Tipo** | `"use client"` |
| **Público objetivo** | Clientes registrados / nuevos registros |
| **Datos visibles** | Tabs Login/Registro, formularios |
| **APIs consumidas** | Ninguna — Login y registro simulados con `setNotice()` |
| **Estado funcional** | **MOCK PURO** — Ninguna acción conectada a backend |
| **Mocks** | Login muestra mensaje "Próximo lanzamiento", registro "Cuenta creada!" sin llamada real |
| **Clasificación** | **CONECTAR AL BACKEND** — Requiere auth de clientes separada del ERP (WEB-3/WEB-4) |

---

### 1.8 Contacto — `/store/contacto`
| Campo | Valor |
|-------|-------|
| **Archivo** | `frontend/src/app/store/contacto/page.tsx` |
| **Tamaño** | 80 líneas, 7.75 KB |
| **Tipo** | `"use client"` |
| **Público objetivo** | Visitantes con preguntas |
| **Datos visibles** | Formulario de contacto, info (teléfono, email, dirección, horarios), botón WhatsApp |
| **Origen de datos** | `GET /api/v1/ecommerce/web-builder/config` para datos de contacto |
| **Estado funcional** | **PARCIALMENTE CONECTADO** — Lee config del servidor. Formulario usa `setTimeout(1200)` simulado, NO envía a backend |
| **Contenido hardcodeado** | Horarios hardcodeados, teléfono/email fallback hardcodeados |
| **Acciones sin implementar** | Envío de formulario de contacto |
| **Clasificación** | **COMPLETAR FUNCIONALIDAD** — WEB-2 |

---

### 1.9 Blog — `/store/blog`
| Campo | Valor |
|-------|-------|
| **Archivo** | `frontend/src/app/store/blog/page.tsx` |
| **Tamaño** | 138 líneas, 8.9 KB |
| **Tipo** | `"use client"` |
| **Datos visibles** | Grid de artículos, tabs por categoría, modal inline |
| **APIs consumidas** | Ninguna — 4 posts 100% hardcodeados en constante `POSTS` |
| **Estado funcional** | **MOCK PURO** — Sin CMS backend |
| **Clasificación** | **COMPLETAR FUNCIONALIDAD** — WEB-5 (constructor IA) |

---

## 2. Panel Administrativo de Ecommerce — `frontend/src/app/dashboard/ecommerce/`

### 2.1 Ecommerce Admin — `/dashboard/ecommerce`
| Campo | Valor |
|-------|-------|
| **Archivo** | `frontend/src/app/dashboard/ecommerce/page.tsx` |
| **Tamaño** | 762 líneas, 61.2 KB (archivo más grande del storefront) |
| **Tipo** | `"use client"` |
| **Público objetivo** | Administrador Nebulae |
| **Tabs** | Stats, Catálogo, Pedidos, Configuración |
| **Componentes internos** | `Toast`, `ProductModal`, gráficas de stats |
| **Datos visibles** | KPIs (pedidos hoy/mes, ingresos, carritos abandonados, conversión), lista de pedidos, CRUD de productos, configuración |
| **Origen de datos** | `GET /api/v1/ecommerce/stats`, `GET /api/v1/ecommerce/catalogo`, `GET /api/v1/ecommerce/pedidos`, `GET /api/v1/ecommerce/web-builder/config` |
| **Estado funcional** | **MUY CONECTADO** — Es la pantalla más completa. CRUD productos real, pedidos reales, stats reales |
| **Autenticación** | Requiere token ERP (admin/asesor). NO accesible desde tienda pública |
| **Acciones sin implementar** | Subida de imágenes (solo URLs), integración real de reservas/despachos desde aquí |
| **Clasificación** | **CONSERVAR Y MEJORAR** |

---

## 3. Constructor y Administración del Sitio

### 3.1 Sitio Web (Constructor IA v1) — `/dashboard/sitio-web`
| Campo | Valor |
|-------|-------|
| **Archivo** | `frontend/src/app/dashboard/sitio-web/page.tsx` |
| **Tamaño** | 321 líneas, 20.3 KB |
| **Tipo** | `"use client"` |
| **Paneles** | Chat IA, paneles de configuración por sección (Hero, Contacto, etc.), vista previa |
| **APIs consumidas** | `GET/PUT /api/v1/ecommerce/web-builder/config` |
| **Estado funcional** | **CONECTADO** — Puede leer y guardar config real en backend. Chat IA simulado con respuestas hardcodeadas. |
| **Mocks** | Respuestas IA completamente hardcodeadas (no llama a ningún LLM) |
| **Clasificación** | **REFACTORIZAR SIN CAMBIAR DISEÑO** — Conectar IA real en WEB-5 |

### 3.2 Website Builder (Constructor visual) — `/dashboard/website`
| Campo | Valor |
|-------|-------|
| **Archivo** | `frontend/src/app/dashboard/website/page.tsx` |
| **Tamaño** | 267 líneas, 14.8 KB |
| **Tipo** | `"use client"` |
| **Interfaz** | Layout de tres columnas: panel IA izquierda, canvas central, panel de capas derecha |
| **APIs consumidas** | Ninguna — Todo mock |
| **Estado funcional** | **MOCK PURO** — UI visual muy rica pero sin funcionalidad real. Chat IA simula respuestas. |
| **Características visuales** | Tema oscuro (#1e1e24), selector desktop/tablet/mobile, undo/redo (mock), bloques de componentes (mock) |
| **Clasificación** | **REFACTORIZAR SIN CAMBIAR DISEÑO** — Mejor UI visual que sitio-web; candidato para ruta canónica |

---

## 4. Layout de la Tienda — `frontend/src/app/store/layout.tsx`
| Campo | Valor |
|-------|-------|
| **Archivo** | `frontend/src/app/store/layout.tsx` |
| **Tamaño** | 269 líneas, 12.9 KB |
| **Contenido** | Header con navbar, mega-menú de categorías, menú móvil, carrito slide-over |
| **Estado del carrito** | En memoria React (React state), NO persiste en localStorage, NO en backend |
| **APIs consumidas** | `GET /api/v1/ecommerce/categorias` para mega-menú |
| **Problemas** | Carrito se pierde al recargar página; no hay gestión de sesión de cliente |
| **Clasificación** | **CONSERVAR Y MEJORAR** — Agregar persistencia localStorage en WEB-3 |

---

## 5. Resumen de Estados

| Ruta | Estado | Fase |
|------|--------|------|
| `/store` | Conectado parcial | WEB-1/WEB-2 |
| `/store/catalogo` | Conectado | WEB-1/WEB-2 |
| `/store/categoria/[slug]` | Conectado parcial | WEB-2 |
| `/store/producto/[id]` | Conectado | WEB-2/WEB-3 |
| `/store/product/[id]` | Mock puro (DUPLICADO) | Eliminar WEB-1 |
| `/store/checkout` | Parcial — roto en producción | WEB-3 |
| `/store/cuenta` | Mock puro | WEB-3 |
| `/store/contacto` | Parcial | WEB-2 |
| `/store/blog` | Mock puro | WEB-5 |
| `/dashboard/ecommerce` | Muy conectado | WEB-1 (mejoras) |
| `/dashboard/sitio-web` | Conectado (IA mock) | WEB-5 |
| `/dashboard/website` | Mock puro (mejor UI) | WEB-5 |
