# Inventario de Componentes — WEB-0

**Fecha:** 2026-09-08

---

## 1. Componentes Globales (`frontend/src/components/`)

| Componente | Archivo | Propósito | Usado en storefront |
|------------|---------|-----------|---------------------|
| `GlobalAIChat` | `GlobalAIChat.tsx` (8.7 KB) | Chat IA flotante global del dashboard ERP | ❌ NO — Solo en dashboard admin |
| `ResizableHeader` | `ResizableHeader.tsx` (2 KB) | Encabezado redimensionable | ❌ NO — Solo en dashboard |
| `Sidebar` | `Sidebar.tsx` (12.6 KB) | Sidebar principal del ERP | ❌ NO — Solo en dashboard admin |

**Conclusión:** Ninguno de los componentes globales es usado en la tienda pública. La tienda tiene su propio layout completamente independiente.

---

## 2. Componentes del Layout de Tienda (`store/layout.tsx`)

### 2.1 CartContext + useCart Hook
| Campo | Valor |
|-------|-------|
| **Tipo** | React Context + hook |
| **Estado** | In-memory React state (no persistido) |
| **Operaciones** | `addToCart(item)`, `removeFromCart(id)`, `setCartOpen(bool)` |
| **Exportado como** | `export const useCart` |
| **Usado en** | `store/page.tsx`, `store/catalogo/page.tsx`, `store/producto/[id]/page.tsx`, `store/product/[id]/page.tsx`, `store/checkout/page.tsx` |
| **Estado funcional** | FUNCIONAL — Pero sin persistencia |
| **Clasificación** | **CONSERVAR Y MEJORAR** — Agregar `localStorage` en WEB-3 |

### 2.2 Header/Navbar
| Campo | Valor |
|-------|-------|
| **Contenido** | Logo "NEBULAE.", nav desktop, mega-menú categorías, menú móvil, icono carrito |
| **Mega-menú** | Dinámico desde `GET /api/v1/ecommerce/categorias` |
| **Menú móvil** | Hamburger + drawer simple |
| **Búsqueda** | Icono Search → redirige a `/store/catalogo` (no hay buscador inline) |
| **Clasificación** | **CONSERVAR Y MEJORAR** — Agregar buscador inline en WEB-2 |

### 2.3 Carrito Slide-over
| Campo | Valor |
|-------|-------|
| **Tipo** | Panel deslizante lateral (fixed, z-50) |
| **Acciones** | Agregar, eliminar, ver subtotal, ir a checkout |
| **Limitaciones** | No permite cambiar cantidad dentro del carrito (solo eliminar) |
| **Clasificación** | **CONSERVAR Y MEJORAR** — Agregar selector cantidad en WEB-3 |

---

## 3. Componentes Locales Reutilizados

### 3.1 ProductCard (DUPLICADO)
El componente `ProductCard` está definido localmente tanto en `store/page.tsx` como en `store/catalogo/page.tsx`. Son casi idénticos con pequeñas diferencias de tamaño de imagen.

| Versión | Archivo | Diferencias |
|---------|---------|-------------|
| Home | `store/page.tsx` L32-97 | Hover con botón "Agregar al Carrito" visible |
| Catálogo | `store/catalogo/page.tsx` L29-74 | Hover con overlay, variante más compacta |

**Clasificación:** **CONSOLIDAR** → Extraer como componente shared `components/store/ProductCard.tsx` en WEB-1.

### 3.2 Toast Notification (DUPLICADO)
Componente `Toast` definido localmente en:
- `dashboard/ecommerce/page.tsx`
- `dashboard/sitio-web/page.tsx`

**Clasificación:** **CONSOLIDAR** → Extraer a `components/Toast.tsx` o usar librería en WEB-1.

### 3.3 ProductModal (Ecommerce Admin)
| Campo | Valor |
|-------|-------|
| **Archivo** | `dashboard/ecommerce/page.tsx` (líneas ~48-200) |
| **Propósito** | Crear/editar productos desde el dashboard |
| **Tabs** | General, Imágenes, Atributos, SEO, Notas |
| **APIs** | `POST /api/v1/ecommerce/catalogo`, `PATCH /api/v1/ecommerce/catalogo/{id}` |
| **Estado** | Funcional |
| **Clasificación** | **CONSERVAR Y MEJORAR** |

---

## 4. Lib y Utilidades (`frontend/src/lib/`)

### 4.1 `api.ts` (11.8 KB)
| Campo | Valor |
|-------|-------|
| **Propósito** | Cliente HTTP centralizado para el dashboard ERP |
| **URL base** | `process.env.NEXT_PUBLIC_API_URL \|\| 'https://api.nebulaekids.com/api/v1'` |
| **Auth** | Bearer token desde `localStorage.getItem('token')` |
| **Manejo de errores** | JSend (`status: 'success'/'error'`) |
| **Usado en** | Dashboard ERP — NO usado en la tienda pública |
| **Limitaciones** | No incluye endpoints ecommerce/store; la tienda hace fetch directos |

**Problema crítico:** La tienda pública (`store/`) NO usa este cliente centralizado. Hace `fetch()` directos con la URL hardcodeada `https://api.nebulaekids.com/api/v1` en varios archivos. Esto viola el principio DRY y hace difícil cambiar el endpoint.

**Clasificación:** **CONSERVAR Y MEJORAR** — Extender `api.ts` con funciones ecommerce y que la tienda las use en WEB-2.

### 4.2 `design-system.ts` (16 KB)
| Campo | Valor |
|-------|-------|
| **Propósito** | Tokens de diseño: colores por módulo, clases de estado, tipografías |
| **Usado en** | Solo en dashboard — NO en tienda pública |
| **Colores definidos** | `MODULE_COLORS`, `ESTADO_CLASSES`, `TIPO_CLASSES`, colores ERP |
| **Ecommerce tokens** | ❌ No hay tokens para la tienda pública |

**Problema:** La tienda usa clases Tailwind `emerald-500`, `slate-900` directamente sin tokens del design system.

**Clasificación:** **CONSERVAR Y MEJORAR** — Agregar sección ecommerce en WEB-1.

---

## 5. Componentes Faltantes (Identificados para Fases Futuras)

| Componente | Descripción | Fase |
|------------|-------------|------|
| `StoreProductCard` | Tarjeta de producto compartida (extraer de page.tsx duplicado) | WEB-1 |
| `StoreSearchBar` | Buscador inline con sugerencias | WEB-2 |
| `VariantSelector` | Selector talla/color conectado a SKU real | WEB-2 |
| `AvailabilityBadge` | Distintivo: "Disponible", "Últimas unidades", "Agotado", "Por pedido" | WEB-2 |
| `ModalityBadge` | Distintivo: "Entrega inmediata" vs "Por pedido" | WEB-2 |
| `CartPersistent` | Carrito con persistencia localStorage + merge en login | WEB-3 |
| `CheckoutSteps` | Stepper: Carrito → Datos → Pago → Confirmación | WEB-3 |
| `AddressForm` | Formulario de dirección reutilizable | WEB-3 |
| `PaymentGateway` | Widget de pasarela desacoplado | WEB-4 |
| `OrderTracker` | Seguimiento de pedido para cliente | WEB-4 |
| `AIBuilderChat` | Chat IA real con LLM conectado | WEB-5 |
| `BlockCanvas` | Canvas de arrastrar bloques | WEB-5 |
| `PagePreview` | Vista previa responsive | WEB-5 |
| `SkeletonCard` | Skeleton loading para productos | WEB-1 (ya existe parcial) |
| `EmptyState` | Estado vacío genérico | WEB-1 |
| `ErrorBoundary` | Captura de errores por sección | WEB-1 |

---

## 6. Hooks y Context Identificados

| Hook/Context | Archivo | Estado | Notas |
|---|---|---|---|
| `CartContext` + `useCart` | `store/layout.tsx` | FUNCIONAL | Sin persistencia |
| Sin hooks de cliente | — | FALTANTE | No hay autenticación de comprador |
| Sin hook de checkout | — | FALTANTE | Estado checkout disperso |
| Sin hook de disponibilidad | — | FALTANTE | No verifica stock en tiempo real |

---

## 7. Clasificación Global de Componentes

| Componente | Clasificación |
|------------|--------------|
| `CartContext + useCart` | CONSERVAR Y MEJORAR |
| `Header/Navbar` | CONSERVAR Y MEJORAR |
| `Carrito Slide-over` | CONSERVAR Y MEJORAR |
| `ProductCard` (×2 duplicado) | CONSOLIDAR |
| `Toast` (×2 duplicado) | CONSOLIDAR |
| `ProductModal` (ecommerce admin) | CONSERVAR |
| `api.ts` | CONSERVAR Y MEJORAR — Extender |
| `design-system.ts` | CONSERVAR Y MEJORAR — Agregar tokens store |
| `GlobalAIChat`, `Sidebar` | NO APLICA — Solo dashboard |
