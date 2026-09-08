# Análisis de Duplicidades — WEB-0

**Fecha:** 2026-09-08

---

## Par 1: `/store/product/[id]` vs `/store/producto/[id]`

### Diagnóstico Detallado

| Criterio | `/store/product/[id]` | `/store/producto/[id]` |
|----------|-----------------------|------------------------|
| **Archivo** | `store/product/[id]/page.tsx` | `store/producto/[id]/page.tsx` |
| **Tamaño** | 111 líneas, 5 KB | 234 líneas, 11 KB |
| **Tipo** | CSR — `"use client"` | CSR — `"use client"` |
| **APIs consumidas** | ❌ Ninguna — mock 100% | ✅ `GET /api/v1/ecommerce/catalogo/{id}` |
| **Datos reales** | ❌ Producto hardcodeado | ✅ Producto real del backend |
| **Galería de imágenes** | ❌ Una imagen fija Unsplash | ✅ Múltiples imágenes dinámicas |
| **Selector de variantes** | Mock (colores fijos: Negro/Rosa Pastel/Gris) | ✅ Atributos dinámicos del backend |
| **Selector talla** | Mock (S/M/L/XL fijos) | ✅ Valores del backend |
| **Cantidad** | No implementado | ✅ Con límite por stock |
| **Añadir al carrito** | ✅ Funcional | ✅ Funcional |
| **Disponibilidad stock** | ❌ No valida | ✅ Botón deshabilitado si stock=0 |
| **Breadcrumb** | ❌ No tiene | ✅ Inicio > Catálogo > Categoría > Nombre |
| **Info adicional** | Mock (estrellas, 124 reseñas) | ✅ SKU, categoría, marca reales |
| **Descripción larga** | ❌ No tiene | ✅ Si existe en backend |
| **Estado funcional** | MOCK PURO | CONECTADO |
| **Enlazada desde** | ❌ No enlazada desde ninguna pantalla | ✅ Home, Catálogo, Categoría → `/store/producto/{id}` |
| **Pruebas existentes** | Ninguna | Ninguna |
| **Imports externos** | `useCart` de `../../layout` | `useCart` de `../../layout` |

### Veredicto

**Ruta canónica: `/store/producto/[id]`**

La ruta `/store/product/[id]` es un prototipo visual anterior que **no está enlazada desde ningún lugar** del código actual. Todas las referencias en `store/page.tsx`, `store/catalogo/page.tsx` y `store/categoria/[slug]/page.tsx` apuntan a `/store/producto/{id}`.

### Acción Recomendada

| Fase | Acción |
|------|--------|
| **WEB-1** | Confirmar que no hay links externos a `/store/product/[id]`. Agregar redirect 301 a `/store/producto/[id]`. |
| **WEB-1** | Eliminar el archivo `store/product/[id]/page.tsx` con PR aprobado. |
| **NO en WEB-0** | No eliminar todavía — solo documentar. |

### Cómo Preservar Compatibilidad

Agregar en `next.config.ts` (en WEB-1, con aprobación):
```js
redirects: async () => [
  { source: '/store/product/:id', destination: '/store/producto/:id', permanent: true }
]
```

---

## Par 2: `/dashboard/sitio-web` vs `/dashboard/website`

### Diagnóstico Detallado

| Criterio | `/dashboard/sitio-web` | `/dashboard/website` |
|----------|------------------------|----------------------|
| **Archivo** | `dashboard/sitio-web/page.tsx` | `dashboard/website/page.tsx` |
| **Tamaño** | 321 líneas, 20.3 KB | 267 líneas, 14.8 KB |
| **APIs consumidas** | ✅ `GET/PUT /api/v1/ecommerce/web-builder/config` | ❌ Ninguna — mock puro |
| **Chat IA** | ✅ Presente (respuestas hardcodeadas, pero arquitectura real) | ✅ Presente (completamente mock) |
| **Paneles de sección** | ✅ Hero, Contacto, Colores configurables | ❌ No |
| **Vista previa canvas** | ❌ Solo texto | ✅ Canvas visual con iframe/simulación |
| **Selector dispositivo** | ✅ Desktop/Tablet/Mobile (simulado) | ✅ Desktop/Tablet/Mobile (simulado) |
| **Guardar config** | ✅ PUT al backend | ❌ No implementado |
| **Publicar** | ✅ Botón con llamada real | ❌ Botón mock |
| **Undo/Redo** | ❌ No tiene | ✅ Botones (mock) |
| **Panel de capas/bloques** | ❌ No tiene | ✅ Panel visual (mock) |
| **Paleta de colores** | ✅ Configurable y guardable | ❌ Mock |
| **Tema visual** | Claro (bg-white) | Oscuro (#1e1e24) — más moderno |
| **UX IA** | Más funcional pero UI básica | Mock total pero UI más rica |
| **Accesibilidad desde Sidebar** | Verificar links en Sidebar.tsx | Verificar links en Sidebar.tsx |

### Veredicto

**No hay una ruta claramente ganadora** — cada una tiene fortalezas complementarias:
- `/dashboard/sitio-web` → Funcionalidad real, IA parcialmente conectada, guarda config
- `/dashboard/website` → UI más rica, canvas visual, arquitectura más moderna

### Ruta Canónica Recomendada: `/dashboard/sitio-web`

**Justificación:**
1. Tiene backend conectado — es la fuente de verdad actual
2. La UI de `/website` puede integrarse como mejora de UX en WEB-5
3. Migrar la funcionalidad de sitio-web a website en WEB-5 fusionando ambas

### Acción Recomendada

| Fase | Acción |
|------|--------|
| **WEB-1** | Auditar qué links del sidebar van a cada ruta |
| **WEB-5** | Fusionar: usar canvas de `/website` + funcionalidad de `/sitio-web` |
| **WEB-5** | Ruta final: `/dashboard/sitio-web` con redirect desde `/dashboard/website` |
| **NO en WEB-0** | No mover ni eliminar nada todavía |

---

## Inconsistencia Adicional: Tildes en URLs

La tienda usa URLs con tildes en algunos lugares:
- `store/page.tsx` línea 107: `fetch('/ecommerce/Catálogo?publicado=true')` → "Catálogo" con tilde y mayúscula
- `store/catalogo/page.tsx` línea 102: `fetch('/ecommerce/catalogo?')` → "catalogo" sin tilde

**Impacto:** Si el backend es sensible al casing, una de las dos URLs puede fallar.  
**Acción WEB-1:** Normalizar a `catalogo` (sin tilde, minúsculas) en todos los fetch y todos los Links.

---

## Resumen de Decisiones

| Duplicidad | Ruta Canónica | Acción |
|-----------|---------------|--------|
| `/store/product/[id]` | ❌ Eliminar | Redirect 301 a `/store/producto/[id]` en WEB-1 |
| `/store/producto/[id]` | ✅ CANÓNICA | Conservar y mejorar |
| `/dashboard/website` | ❌ Secundaria | Fusionar UI en `/dashboard/sitio-web` en WEB-5 |
| `/dashboard/sitio-web` | ✅ CANÓNICA | Conservar — conectar IA real en WEB-5 |
