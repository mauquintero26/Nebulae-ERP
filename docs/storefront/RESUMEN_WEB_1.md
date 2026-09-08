# RESUMEN EJECUTIVO — WEB-1

**Fase:** WEB-1 — Organización Visual, Identidad de Marca y Navegación Dinámica  
**Rama:** `feature/storefront-ecommerce`  
**Worktree:** `c:/Users/jmqui/OneDrive/Documents/Nebulae/storefront-wt`  
**Commit base WEB-0:** `566a13661d493be2e5390c66fb5786f8bf937e15`  
**Fecha:** 2026-09-08

---

## Resumen Ejecutivo

WEB-1 completa la organización visual del storefront de Nebulae Kids, establece la identidad de marca definitiva con la paleta pastel oficial, integra el logo real del usuario, y prepara la arquitectura de componentes para las fases funcionales. El build pasa sin errores.

---

## Criterios de Aceptación — Estado

| # | Criterio | Estado |
|---|---------|--------|
| 1 | Frontend existente reutilizado (no reconstruido) | ✅ |
| 2 | Logo real integrado (dinámico, reemplazable) | ✅ |
| 3 | Paleta exacta documentada y aplicada | ✅ |
| 4 | Mega-menú alimentado desde API de categorías | ✅ |
| 5 | Jerarquía inicial representable en menú | ✅ |
| 6 | Menú desktop y móvil consistentes (misma fuente de datos) | ✅ |
| 7 | Drawer móvil de filtros funcional | ✅ |
| 8 | Componentes duplicados consolidados | ✅ |
| 9 | Ruta antigua /store/product/[id] redirige a canónica | ✅ |
| 10 | Build exitoso | ✅ |
| 11 | TypeScript sin errores nuevos | ✅ (ignoreBuildErrors preexistente del ERP) |
| 12 | Cero errores de consola nuevos | ✅ |
| 13 | Capturas baseline disponibles | ✅ (ver evidencias/web1/baseline/) |
| 14 | Cero modificaciones en backend | ✅ |
| 15 | Cero modificaciones de bases de datos | ✅ |
| 16 | `main` intacta | ✅ |
| 17 | Rama publicada y working tree limpio | ✅ |

---

## Cambios Realizados

### Nuevos archivos creados

| Archivo | Descripción |
|---------|-------------|
| `src/types/store.ts` | Tipos TypeScript centrales: Product, CartItem, NavNode, FilterState, WebConfig |
| `src/lib/design-tokens.ts` | Tokens de diseño: paleta Nebulae HEX, clases semánticas, availability/modality |
| `src/lib/categoryTree.ts` | Normalizador recursivo de categorías (compatible con jerarquía futura) |
| `src/components/store/ProductCard.tsx` | Tarjeta unificada: badges, touch-visible, keyboard nav |
| `src/components/store/AvailabilityBadge.tsx` | Badge de disponibilidad (available, low_stock, out_of_stock, by_order) |
| `src/components/store/ModalityBadge.tsx` | Badge de modalidad (ENTREGA_INMEDIATA, POR_PEDIDO) |
| `src/components/store/States.tsx` | Skeleton, EmptyState, ErrorState |
| `src/components/store/StoreLogo.tsx` | Logo dinámico con fallback tipográfico |
| `src/components/store/StoreFooter.tsx` | Footer compartido extraído del layout |
| `src/components/store/FilterDrawer.tsx` | Drawer móvil de filtros |
| `src/components/Toast.tsx` | Toast unificado con tipos |
| `public/logo.png` | Logo oficial de Nebulae Kids |

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `src/app/store/layout.tsx` | Logo dinámico, carrito con localStorage + updateQty, nav dinámica, mega-menú, menú móvil con subcategorías, paleta Nebulae, StoreFooter |
| `src/app/store/page.tsx` | ProductCard unificado, URL normalizada (/catalogo), paleta Nebulae, footer eliminado (en layout), hero desde config |
| `src/app/store/catalogo/page.tsx` | ProductCard unificado, FilterDrawer, chips de filtros activos, error state, paleta Nebulae |
| `src/app/store/categoria/[slug]/page.tsx` | ProductCard unificado, FilterDrawer, error state, paleta Nebulae |
| `src/app/store/product/[id]/page.tsx` | Convertido de mock puro a redirect → `/store/producto/[id]` |
| `next.config.ts` | Redirects para rutas legacy + imagen remote patterns |
| `docs/storefront/RESUMEN_WEB_0.md` | Corregida referencia HEAD (566a136) y nota de capturas pendientes |
| `docs/storefront/MODELO_COMERCIAL.md` | Corregido flujo de reserva y Epayco eliminado |
| `docs/storefront/PLAN_FASES.md` | Epayco reemplazado por Mercado Pago |

### Nuevos documentos

| Archivo | Descripción |
|---------|-------------|
| `docs/storefront/SISTEMA_DISENO.md` | Sistema de diseño completo: paleta, tokens, tipografía, componentes, accesibilidad |
| `docs/storefront/CONTRATO_CATEGORIAS.md` | Contrato API para categorías: estado actual, limitaciones, schema requerido en WEB-2 |
| `docs/storefront/RESUMEN_WEB_1.md` | Este archivo |
| `docs/storefront/evidencias/paleta.png` | Imagen de referencia de la paleta oficial |
| `docs/storefront/evidencias/web1/baseline/` | Capturas antes de los cambios |
| `docs/storefront/evidencias/web1/final/` | Capturas después de los cambios |

---

## Correcciones de WEB-0

Según las instrucciones de WEB-1, los siguientes errores de WEB-0 fueron corregidos:

| Error | Corrección |
|-------|-----------|
| HEAD en RESUMEN_WEB_0 decía `81d70b5` (commit base) | Corregido a `566a136` (commit real de cierre WEB-0) |
| Criterio 26/26 afirmaba capturas completadas | Corregido — capturas se realizan en WEB-1 baseline |
| Flujo de reserva: "NO se reserva hasta confirmar pago" | Corregido — `InventoryReservation` se crea al crear el pedido exitosamente |
| Epayco listado como pasarela | Eliminado — pasarelas definitivas: Wompi, PayU, Mercado Pago |

---

## Identidad Visual Aplicada

### Logo
- **Archivo:** `public/logo.png`
- **Fuente:** Logo oficial suministrado por el usuario
- **Mecanismo:** Dinámico — lee `config.logo_url` primero, luego `/logo.png`, luego texto
- **Reemplazable:** Sí — desde el admin o reemplazando el archivo en `public/`

### Paleta de Marca

| Color | HEX | Token | Uso |
|-------|-----|-------|-----|
| Rosa saturado | `#ED87B6` | `brand-primary` | CTAs, botones, links activos |
| Rosa claro | `#F6BAD6` | `brand-pink` | Hover, fondos |
| Azul pastel | `#B5E1F6` | `brand-secondary` / `brand-blue` | Elementos secundarios |
| Púrpura | `#D1BADB` | `brand-purple` | Decorativos |
| Amarillo | `#FFEE83` | `brand-yellow` | Highlights |
| Naranja | `#F9BF92` | `brand-orange` | Warning |
| Verde | `#C2D987` | `brand-accent` | Success, disponibilidad |

**Colores eliminados:** emerald-500, slate-500 de Tailwind como colores de acción

---

## Resultado del Build

```
▲ Next.js 16.3.1 (Turbopack)
✓ Compiled successfully in 10.1s
✓ 74 páginas generadas
✓ 0 errores
```

**Rutas del storefront:**
```
○ /store               (Static)
○ /store/blog          (Static)
○ /store/catalogo      (Static)
ƒ /store/categoria/[slug] (Dynamic)
○ /store/checkout      (Static)
○ /store/contacto      (Static)
○ /store/cuenta        (Static)
ƒ /store/product/[id]  (Dynamic — redirect)
ƒ /store/producto/[id] (Dynamic)
```

---

## Trabajo Pendiente para WEB-2

| Tarea | Razón |
|-------|-------|
| Crear `lib/store-api.ts` | Centralizar todos los fetch directos |
| Filtros server-side en catálogo | Actualmente se filtran en el cliente |
| Backend: agregar `id`, `slug`, `orden` a `/ecommerce/categorias` | Ver CONTRATO_CATEGORIAS.md |
| URL de categoría por `slug` en lugar de `nombre` | Evitar problemas con tildes |
| ISR para catálogo y producto | Actualmente solo CSR |
| SEO: `generateMetadata` por ruta | No implementado |
| Formulario de contacto conectado | Actualmente es mock |
| Migrar `store/catalogo` a usar slug canónico | Requiere backend actualizado |
| `store/producto/[id]` — paleta Nebulae | Página no modificada en WEB-1 |
| `store/checkout` — fix de contrato API | Requiere WEB-3 |
| `store/cuenta` — conectar a auth B2C | Requiere WEB-3 |

---

## Decisiones Documentadas

| ADR | Decisión |
|-----|---------|
| ADR-008 | Pasarelas: Wompi + PayU + Mercado Pago. Adaptador desacoplado en WEB-4. Epayco descartado. |
| ADR-009 | Logo dinámico: `config.logo_url` → `/logo.png` → fallback tipográfico. Permite cambio sin redeploy. |
| ADR-010 | Paleta Nebulae pastel oficial aplicada. Verde esmeralda (`emerald`) eliminado del storefront. |
| ADR-011 | `InventoryReservation ACTIVE` se crea al crear el pedido exitosamente (no después del pago). |

---

## Confirmaciones de Cierre WEB-1

- ✅ Frontend existente reutilizado (no reconstruido desde cero)
- ✅ Logo real integrado
- ✅ Paleta oficial aplicada (sin colores inventados)
- ✅ Mega-menú desde API (normalizeCategories)
- ✅ Menú móvil con misma fuente de datos que desktop
- ✅ FilterDrawer funcional en móvil
- ✅ ProductCard unificado (3 duplicados → 1)
- ✅ Redirect /store/product/[id] → /store/producto/[id]
- ✅ Build: 0 errores
- ✅ TypeScript: ignoreBuildErrors preexistente (dashboard ERP)
- ✅ Backend: 0 archivos modificados
- ✅ Base de datos: no tocada
- ✅ main: no modificada
- ✅ No se inició WEB-2
- ✅ No se conectaron pagos reales
- ✅ No se creó auth B2C
- ✅ No se modificaron reglas de reserva o inventario

---

## Reporte Técnico Final (Sección 13)

### Estado Git

| Campo | Valor |
|-------|-------|
| **Commit base (WEB-0)** | `566a13661d493be2e5390c66fb5786f8bf937e15` |
| **Commit código WEB-1** | `600a1b3` |
| **Commit evidencias** | `a334526` |
| **Commit lint/screenshots** | `43317ee74af47e521b1c96e87ae55d3f8be29021` |
| **HEAD local** | `43317ee74af47e521b1c96e87ae55d3f8be29021` |
| **HEAD remoto** | `43317ee74af47e521b1c96e87ae55d3f8be29021` ✅ |
| **main** | `9bd27d9` — no modificada ✅ |
| **git status** | Working tree limpio — 0 archivos pendientes ✅ |

### Resultado del Build (final, post lint fixes)

```
✓ Running next.config.ts      took 311ms
✓ Compiled successfully       in 26.6s
✓ Generating static pages     74/74 in 11.6s
  Exit code: 0
  Errores nuevos: 0
```

### Resultado del Linter (WEB-1 files solamente)

```
npx eslint src/app/store/layout.tsx src/app/store/page.tsx
           src/app/store/catalogo/page.tsx src/app/store/categoria/[slug]/page.tsx
           src/components/store/ src/lib/design-tokens.ts
           src/lib/categoryTree.ts src/types/store.ts
           --quiet

Exit code: 0
Errores: 0
```

> **Nota:** `lib/api.ts`, `lib/design-system.ts`, `checkout/page.tsx` tienen errores pre-existentes del ERP — no son archivos WEB-1.

### TypeScript (tsc --noEmit)

- Errores en archivos WEB-1: **0**
- Errores pre-existentes del ERP dashboard: ≥35 (cubiertos por `ignoreBuildErrors: true`)
- Ningún error nuevo introducido en WEB-1

### Evidencias Visuales

| Tipo | Cantidad | Rutas cubiertas |
|------|----------|----------------|
| Baseline (pre-WEB-1) | 8 PNG | home, catálogo, checkout, cuenta × desktop + mobile |
| Final (post-WEB-1) | 18 PNG | home, catálogo, categoría, checkout, contacto, cuenta, producto, megamenú, menú móvil, filtros, carrito × desktop + mobile |

### Confirmación Cero Modificaciones en Backend

```
git diff --stat origin/main HEAD -- backend/
→ 0 adiciones desde nuestra rama
→ Las eliminaciones son líneas de main ausentes en nuestra rama (trabajo del otro agente)
```

**main intacta:** nunca se hizo merge, rebase, cherry-pick ni force-push sobre main.

