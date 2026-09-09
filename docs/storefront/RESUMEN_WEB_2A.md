# RESUMEN — WEB-2A
## Catálogo Frontend, Capa API, Búsqueda, Filtros y SEO

**Rama:** `feature/storefront-ecommerce`  
**Base (WEB-1):** `b45f88358c60ead5b9cc7f33472449304f3c1940`  
**Commits WEB-2A:**
1. `6e55136` — feat(web2a): capa API store-api con tipos, cliente, query, catálogo y categorías
2. `6990e30` — feat(web2a): catálogo, producto, categoría y home migrados a store-api
3. `[pendiente]` — test(web2a): 84 nuevas pruebas para store-api
4. `[pendiente]` — docs(web2a): contratos API y gaps del backend documentados

---

## ✅ Qué se completó en WEB-2A

### Capa API (`src/lib/store-api/`)

| Archivo | Descripción |
|---------|-------------|
| `errors.ts` | `StoreError` class, 9 códigos, `isStoreError()`, mensajes en español |
| `types.ts` | `BackendProduct`, `NormalizedProduct`, `CatalogFilterState`, `ApiEnvelope` |
| `client.ts` | HTTP cliente tipado: timeout 12s, AbortController, fail-fast para env faltante |
| `query.ts` | URL↔Filter, filtros client-side, sorting, paginate, `formatCOP`, `hasRealDiscount` |
| `catalog.ts` | `listProductos`, `getProducto`, `normalizeProduct` |
| `categories.ts` | `listCategorias`, `getSiteConfig` |
| `index.ts` | Barrel export único |

### Hooks (`src/hooks/`)

| Hook | Descripción |
|------|-------------|
| `useDebounce.ts` | Hook genérico con delay configurable (default 350ms) |
| `useCatalog.ts` | Estado completo del catálogo: URL sync, debounce, AbortController, paginación |

### Páginas migradas

| Página | Cambio |
|--------|--------|
| `store/layout.tsx` | `listCategorias` + `getSiteConfig` vía store-api + AbortController |
| `store/page.tsx` | `listProductos` + `listCategorias` + `getSiteConfig`, AbortController |
| `store/catalogo/page.tsx` | Reescrito con `useCatalog` + paginación + filtros URL + sort |
| `store/categoria/[slug]/page.tsx` | Reescrito con `useCatalog(initialCategoria)` + paginación |
| `store/producto/[id]/page.tsx` | `getProducto`, NOT_FOUND state, modalidad badge, validación attrs |

### Pruebas unitarias

| Archivo | Tests |
|---------|-------|
| `store-api/__tests__/errors.test.ts` | 16 pruebas |
| `store-api/__tests__/catalog.test.ts` | 20 pruebas (normalizeProduct) |
| `store-api/__tests__/query.test.ts` | 48 pruebas |
| `lib/__tests__/categoryTree.test.ts` | 11 pruebas (WEB-1, estables) |
| **TOTAL** | **95 pruebas — 95 passed ✅** |

### Documentación

| Documento | Contenido |
|-----------|-----------|
| `WEB2A_CONTRATOS_API.md` | Contratos verificados de endpoints reales del backend |
| `WEB2A_GAPS_BACKEND.md` | 10 gaps documentados (P0/P1/P2) con contratos requeridos |

---

## 🔍 Verificación de calidad

| Criterio | Resultado |
|----------|-----------|
| Build `npm run build` | ✅ Exit 0 — Compiled successfully in 7.3s |
| Tests `npx vitest run` | ✅ 95/95 passed |
| ESLint (archivos WEB-2A) | ✅ 0 errores |
| TypeScript storefront files | ✅ 0 errores en archivos del storefront |
| `fetch()` directo en storefront | ✅ Eliminado de todos los archivos |
| Backend no modificado | ✅ Ningún archivo de backend tocado |
| Rama `main` no modificada | ✅ Trabajamos exclusivamente en `feature/storefront-ecommerce` |

---

## ⚠️ Limitaciones temporales documentadas

| Gap | Descripción | Impacto |
|-----|-------------|---------|
| GAP-001 | Paginación client-side (max 500 productos del server) | P1 |
| GAP-002 | Filtros por marca/precio/talla/color son client-side | P1 |
| GAP-003 | Ordenamiento es client-side (no global del catálogo) | P1 |
| GAP-004 | Stock mostrado puede ser manual, no tiempo real | P0 |
| GAP-005 | URLs de producto usan ID numérico (no slug estable) | P1 |
| GAP-006 | Variantes sin `sku_id` — checkout (WEB-3) depende de esto | P0 |

---

## 📐 Arquitectura de filtros

```
URL (?q=...&categoria=...&page=2)
     ↕ parseUrlToFilters / filtersToUrlParams
CatalogFilterState
     ↕ filtersToCatalogParams (solo params que el backend soporta)
GET /ecommerce/catalogo?search=...&categoria=...&limit=500
     → NormalizedProduct[]
     ↕ applyClientFilters (marca, precio, talla, color, modalidad)
     ↕ applySorting (precio_asc, precio_desc, recientes, nombre_asc)
     ↕ paginate (24 items por página)
Products mostrados al usuario
```

---

## 🔮 Próximos pasos — WEB-2B

Requieren autorización explícita del usuario. Items pendientes:

1. **Paginación server-side real** (GAP-001): requiere `offset` param en backend
2. **Filtros server-side** (GAP-002): `marca`, `precio_min/max`, `talla`, `color`
3. **Disponibilidad real** (GAP-004): endpoint dedicado con `fuente: 'real'|'manual'`
4. **SEO metadata server-side** (GAP-008): refactoring a Server Component wrapper
5. **Slugs de producto** (GAP-005): campo `slug` en `ecommerce_products`
6. **Atributos por categoría** (GAP-007): endpoint `GET /ecommerce/categorias/{id}/atributos`
