# Arquitectura Propuesta — WEB-0

**Fecha:** 2026-09-08

---

## 1. Principio Fundamental

La solución actual funciona sobre Next.js (App Router) dentro de un monorrepo. La propuesta es **conservar esta arquitectura** y evolucionar sobre ella.

**NO se propone separar la tienda como aplicación independiente** por las siguientes razones:
- No hay impedimento técnico que lo justifique
- El routing de Next.js App Router separa perfectamente `/store/` del `/dashboard/`
- Compartir `lib/api.ts`, `design-system.ts` y contextos es una ventaja
- La autenticación del dashboard ERP y la futura autenticación de clientes B2C pueden coexistir sin conflicto (contextos separados)
- Evita duplicación de infraestructura, CI/CD, DNS y certificados

---

## 2. Estructura de Capas

```
Nebulae Frontend (Next.js 14 App Router)
├── /app/
│   ├── /store/                    ← Tienda pública (sin auth)
│   │   ├── layout.tsx             ← Layout tienda: header, carrito, footer
│   │   ├── page.tsx               ← Home
│   │   ├── /catalogo/             ← Listado de productos
│   │   ├── /categoria/[slug]/     ← Filtrado por categoría
│   │   ├── /producto/[id]/        ← Detalle de producto (CANÓNICA)
│   │   ├── /checkout/             ← Checkout (WEB-3)
│   │   ├── /cuenta/               ← Auth cliente B2C (WEB-3)
│   │   ├── /contacto/             ← Formulario contacto (WEB-2)
│   │   └── /blog/                 ← Blog (WEB-5)
│   │
│   ├── /dashboard/                ← Panel administrativo (JWT ERP)
│   │   ├── layout.tsx             ← Layout dashboard: Sidebar, GlobalChat
│   │   ├── /ecommerce/            ← Admin ecommerce (CRUD, pedidos, stats)
│   │   ├── /sitio-web/            ← Constructor del sitio (CANÓNICA)
│   │   └── /website/ [deprecar]   ← Fusionar UI en /sitio-web/ (WEB-5)
│
├── /components/
│   ├── /store/                    ← Componentes de tienda (nuevo en WEB-1)
│   │   ├── ProductCard.tsx        ← Tarjeta de producto unificada
│   │   ├── AvailabilityBadge.tsx  ← Distintivo disponibilidad
│   │   ├── ModalityBadge.tsx      ← Distintivo modalidad
│   │   ├── VariantSelector.tsx    ← Selector variantes
│   │   └── CartDrawer.tsx         ← Carrito mejorado
│   ├── /admin/                    ← Componentes del dashboard
│   └── Toast.tsx                  ← Toast unificado
│
├── /lib/
│   ├── api.ts                     ← Cliente HTTP centralizado (extender)
│   ├── store-api.ts               ← Funciones API específicas de tienda (nuevo WEB-2)
│   ├── design-system.ts           ← Tokens de diseño (extender para store)
│   └── cart.ts                    ← Lógica de carrito con localStorage (nuevo WEB-3)
│
└── /types/
    └── store.ts                   ← Tipos TypeScript para tienda (nuevo WEB-1)
```

---

## 3. Responsabilidades por Capa

### 3.1 Tienda Pública (`/store/`)
- Presentación al cliente B2C
- Catálogo, búsqueda y filtros
- Carrito en memoria/localStorage
- Checkout con SKUs reales
- Gestión de sesión de cliente B2C
- Seguimiento de pedidos
- Contenido público (blog, contacto)

### 3.2 Admin Ecommerce (`/dashboard/ecommerce/`)
- CRUD de productos web
- Gestión de pedidos PWEB
- Stats y analytics
- Gestión de promociones
- Configuración de bodega ecommerce

### 3.3 Constructor del Sitio (`/dashboard/sitio-web/`)
- Editor de páginas y secciones
- Chat IA para creación de contenido
- Vista previa responsive
- Borradores y publicación controlada
- Versionado y rollback

### 3.4 Backend (`/api/v1/ecommerce/`)
- Validación de precios (servidor como fuente de verdad)
- Validación de stock real
- Reservas de inventario
- Creación de pedidos (PENDIENTE_PAGO)
- Webhook de confirmación de pago
- Liberación de reservas ante expiración
- Seguridad y trazabilidad

---

## 4. Cliente API Centralizado (Diseño para WEB-2)

### Principio
Toda llamada desde la tienda pública debe ir a través de una capa centralizada, no directamente con `fetch()`.

### Estructura propuesta `lib/store-api.ts`

```typescript
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';

// Configuración por ambiente
const TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

// Funciones a exponer:
export async function getProducts(params: ProductQueryParams): Promise<Product[]>
export async function getProduct(id: string): Promise<Product>
export async function getCategories(): Promise<Category[]>
export async function getSiteConfig(): Promise<SiteConfig>
export async function createOrder(body: OrderBody): Promise<OrderResult>
export async function saveCart(cart: Cart): Promise<void>
export async function getOrderStatus(pwebNumero: string): Promise<OrderStatus>
```

### Características del cliente
- URL configurable por ambiente (`.env.local`, `.env.staging`, `.env.production`)
- Timeout configurable (8s por defecto)
- Reintentos automáticos (2 intentos para GET, 0 para POST críticos)
- `idempotency_key` generado automáticamente para checkout
- Normalización de errores (HTTP → mensaje legible)
- Mode mock (para pruebas sin backend)
- Logging seguro (sin datos sensibles)

---

## 5. Gestión de Estado

### Estado Global de la Tienda (WEB-3)

| Estado | Tecnología propuesta | Almacenamiento |
|--------|---------------------|----------------|
| Carrito | React Context + localStorage | Cliente |
| Sesión cliente B2C | React Context + httpOnly cookie | Servidor |
| Configuración del sitio | React Context o SWR | Cache en memoria |
| Disponibilidad en tiempo real | SWR con revalidación | Cache corta (30s) |
| Checkout en progreso | sessionStorage | Cliente (sesión) |

### Por qué NO Redux/Zustand todavía
La app actual es liviana. React Context es suficiente para WEB-1 a WEB-3. Si escala la complejidad, se puede migrar a Zustand (menor boilerplate que Redux) en WEB-6.

---

## 6. Autenticación Dual (WEB-3)

### Situación actual
- Dashboard ERP: JWT Bearer token → `localStorage('token')` → `api.ts` → Backend `/auth/`
- Tienda pública: Sin autenticación

### Propuesta
- Mantener JWT ERP exactamente igual para el dashboard
- Agregar JWT B2C separado para la tienda: cookie httpOnly con refresh token
- Los endpoints públicos de la tienda NO requieren auth
- Los endpoints de "mis pedidos" y "mi cuenta" requieren JWT B2C
- El backend deberá exponer `/api/v1/auth/customer/login` y `/api/v1/auth/customer/register`

### Consideraciones de seguridad
- CSRF protection para rutas autenticadas de la tienda (SameSite=Strict)
- Rate limiting en login de cliente
- NO compartir JWT del ERP con clientes B2C

---

## 7. SEO y Rendimiento (WEB-2 en adelante)

### Estrategia de renderizado
- Catálogo: ISR (Incremental Static Regeneration, revalidate 60s)
- Producto individual: ISR (revalidate 30s)
- Home: ISR (revalidate 60s)
- Checkout/Cuenta: CSR (require cliente — ya está "use client")

### Metadata por ruta
```typescript
// En cada layout/page:
export async function generateMetadata({ params }) {
  return {
    title: `${product.nombre} — Nebulae Kids`,
    description: product.descripcion,
    openGraph: { images: [product.imagenes[0]] },
    alternates: { canonical: `/store/producto/${product.id}` }
  };
}
```

---

## 8. Decisión: ¿Separar la Tienda como Aplicación Independiente?

### Evaluación completa

| Criterio | Separar | Mantener en monorrepo |
|----------|---------|----------------------|
| **Motivo** | Escalabilidad extrema | Simplicidad actual |
| **Ventaja** | Despliegue independiente | Código compartido |
| **Desventaja** | Autenticación compleja | Tiempos de build mayores |
| **Impacto despliegue** | 2 deploys, 2 dominios | 1 deploy, 1 dominio |
| **Impacto auth** | JWT completamente separado | Context compartido |
| **Impacto APIs** | Mismo backend | Mismo backend |
| **Impacto SEO** | Dominio dedicado (mejor) | Subpath (aceptable) |
| **Impacto mantenimiento** | 2 repos o monorepo Turborepo | 1 repo |
| **Costo migración** | Alto — refactor completo | Bajo — continúa existente |
| **Alternativa** | Turborepo en el futuro | Continuar actual |

**Veredicto: MANTENER EN MONORREPO**

No hay evidencia técnica en la auditoría que justifique la separación. La arquitectura actual es adecuada para el volumen proyectado de Nebulae Kids. Se puede revisar esta decisión si el tráfico supera 50K visitas/día o si el equipo de frontend crece a más de 3 personas dedicadas.

---

## 9. Mapa de Navegación Tienda Pública

```
/store (Home)
├── /store/catalogo (Catálogo completo)
│   └── /store/catalogo?search=X&categoria=Y (Filtrado)
├── /store/categoria/[slug] (Por categoría)
├── /store/producto/[id] (Detalle)
│   └── → /store/checkout (Carrito → Checkout)
│       └── → Pasarela de pago (WEB-4)
│           └── → /store/pedido/[pweb] (Confirmación + seguimiento)
├── /store/cuenta
│   ├── Login
│   ├── Registro
│   ├── Mis pedidos (WEB-3)
│   └── Mis direcciones (WEB-3)
├── /store/contacto
└── /store/blog
    └── /store/blog/[slug] (Artículo individual — WEB-5)
```
