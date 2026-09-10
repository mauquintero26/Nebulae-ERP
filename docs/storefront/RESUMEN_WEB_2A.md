# RESUMEN — WEB-2A (CIERRE DEFINITIVO)
## Catálogo Frontend, Capa API, Búsqueda, Filtros, SEO, Sincronización y Hardening

**Rama:** `feature/storefront-ecommerce`  
**Base (WEB-1):** `b45f88358c60ead5b9cc7f33472449304f3c1940`  
**HEAD WEB-2A (antes del cierre):** `037116269640c662d0ccfa27e0bc4638922d9542`  
**Merge con origin/main (cierre):** `19eb774...` (ver `git log`)  
**HEAD final (cierre definitivo):** ver `git rev-parse HEAD` en tiempo real

---

## 📦 Commits WEB-2A producidos

```
6e55136  feat(web2a): capa API store-api con tipos, cliente, query, catálogo y categorías
6990e30  feat(web2a): catálogo, producto, categoría y home migrados a store-api
0da4132  docs(web2a): contratos API verificados, gaps del backend y resumen de fase
7d0afe5  fix(web2a): corregir errores TypeScript en archivos del storefront
2d1fb3e  docs(web2a): evidencias visuales - capturas home, categoria, producto
f8fd065  chore: ignorar package.json de puppeteer en evidencias
4694e13  docs(web2a): capturas adicionales catalogo - home actualizado y catalogo mobile/desktop
847e18a  docs(web2a): capturas catalogo actualizadas
8933d1e  docs(web2a): captura busqueda actualizada
0371162  docs(web2a): captura sin resultados actualizada
19eb774  merge: synchronize storefront branch with origin/main (WEB-2A close)
```

---

## ✅ Qué se completó en WEB-2A

### Capa API (`src/lib/store-api/`)

| Archivo | Descripción |
|---------|-------------|
| `errors.ts` | `StoreError` class, 10 códigos, `isStoreError()`, `fromNetworkError()` con pass-through, `isAborted` incluye TIMEOUT |
| `types.ts` | `BackendProduct`, `NormalizedProduct` (modalidad 3 valores), `CatalogFilterState`, `ApiEnvelope` |
| `client.ts` | HTTP cliente tipado: timeout 12s, AbortController, fallback manual sin `AbortSignal.any()` que NO ignora señal del consumidor |
| `query.ts` | URL↔Filter, filtros client-side, sorting, paginate, `formatCOP`, `hasRealDiscount` |
| `catalog.ts` | `listProductos`, `getProducto`, `normalizeProduct` con modalidad segura (nunca infiere ENTREGA_INMEDIATA desde stock) |
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

### Componentes actualizados (cierre)

| Componente | Cambio |
|------------|--------|
| `AvailabilityBadge.tsx` | `getAvailabilityStatus` seguro — solo ENTREGA_INMEDIATA canónica puede mostrar stock, todo lo demás es `unconfirmed` |
| `ModalityBadge.tsx` | Acepta `DISPONIBILIDAD_POR_CONFIRMAR` con icono `HelpCircle` |
| `design-tokens.ts` | `AVAILABILITY_CLS` y `MODALITY_CLS` incluyen `unconfirmed` y `DISPONIBILIDAD_POR_CONFIRMAR` |
| `types/store.ts` | `Product.modalidad` y `CartItem.modalidad` incluyen `DISPONIBILIDAD_POR_CONFIRMAR` |

### Pruebas unitarias — CIERRE DEFINITIVO

| Archivo | Tests |
|---------|-------|
| `store-api/__tests__/errors.test.ts` | 16 pruebas |
| `store-api/__tests__/catalog.test.ts` | 20 pruebas |
| `store-api/__tests__/query.test.ts` | 48 pruebas |
| `store-api/__tests__/availability.test.ts` | **19 pruebas (nuevas — FASE 3)** |
| `store-api/__tests__/cancellation.test.ts` | **16 pruebas (nuevas — FASE 4)** |
| `lib/__tests__/categoryTree.test.ts` | 11 pruebas (WEB-1, estables) |
| **TOTAL** | **🎯 130 pruebas — 130 passed ✅ — 0 failed — 0 skipped** |

### Documentación

| Documento | Contenido |
|-----------|-----------|
| `WEB2A_CONTRATOS_API.md` | Contratos verificados de endpoints reales del backend |
| `WEB2A_GAPS_BACKEND.md` | 10 gaps documentados (P0/P1/P2) con contratos requeridos |

---

## 🔍 Verificación de calidad — CERTIFICADA

| Criterio | Resultado | Comando |
|----------|-----------|---------|
| Build completo | ✅ Compiled successfully in 13.0s | `npm run build` |
| Tests completos | ✅ **130/130 passed, 0 failed, 0 skipped** — 3.80s | `npx vitest run` |
| Suite disponibilidad | ✅ 19/19 — ejecutada 2 veces | `npx vitest run src/.../availability.test.ts` |
| Suite cancelación | ✅ 16/16 — ejecutada 2 veces | `npx vitest run src/.../cancellation.test.ts` |
| TypeScript storefront | ✅ 0 errores | `npx tsc -p tsconfig.storefront.json --noEmit` |
| ESLint WEB-2A | ✅ 0 errores en alcance WEB-2A | ver scope en FASE 6 |
| ESLint pre-existente | ⚠️ 1 error pre-WEB-2A en `checkout/page.tsx:55` (no modificado) | Pendiente WEB-3 |
| Backend no modificado | ✅ `git diff origin/main...HEAD -- backend/` vacío | — |
| Bases de datos | ✅ No tocadas | — |
| `main` no modificada | ✅ Solo merge --no-ff origin/main→storefront | — |
| Conflictos del merge | ✅ 0 conflictos — merge limpio estrategia 'ort' | — |
| Rama remota | ✅ HEAD local == HEAD remote | — |

---

## ⚠️ Gaps para WEB-2B — BLOQUEOS P0

| Gap | Descripción | Impacto |
|-----|-------------|---------|
| **GAP-004** (**P0**) | Stock puede ser valor manual no vinculado a SKU canónico → ENTREGA_INMEDIATA no puede prometerse | El frontend ya muestra `DISPONIBILIDAD_POR_CONFIRMAR` en estos casos |
| **GAP-006** (**P0**) | Variante sin `sku_id` canónico → checkout (WEB-3) no puede proceder sin riesgo de sobreventa | Documentado; producto con SKU vacío no puede avanzar al pago |
| GAP-001 (P1) | Paginación client-side (max 500 productos del server) | Requiere `offset` param en backend |
| GAP-002 (P1) | Filtros por marca/precio/talla/color son client-side | Requiere endpoints de filtro en backend |
| GAP-003 (P1) | Ordenamiento client-side (no global del catálogo) | Requiere `sort` param en backend |
| GAP-005 (P1) | URLs de producto usan ID numérico (no slug estable) | Campo `slug` en `ecommerce_products` |

---

## 📐 Arquitectura de disponibilidad — HARDENING FASE 3

```
BackendProduct.modalidad_disponible  (campo calculado server-side, máxima prioridad)
  ↓ si ausente o inválido:
BackendProduct.modalidad             (campo legacy manual, segunda prioridad)
  ↓ si ausente o inválido:
DISPONIBILIDAD_POR_CONFIRMAR         (nunca ENTREGA_INMEDIATA desde stock solamente)
  ↓
getAvailabilityStatus(stock, alerta, modalidad)
  ENTREGA_INMEDIATA canónica → available | low_stock | out_of_stock
  POR_PEDIDO          → by_order (independiente de stock)
  DISPONIBILIDAD_POR_CONFIRMAR | otros → unconfirmed
  ↓
AvailabilityBadge.tsx + ModalityBadge.tsx
  unconfirmed → "Disponibilidad sujeta a confirmación" (gris, no verde)
```

---

## 🔮 Próximos pasos — WEB-2B (requieren autorización)

1. **Paginación server-side real** (GAP-001): requiere `offset` param en backend
2. **Filtros server-side** (GAP-002): `marca`, `precio_min/max`, `talla`, `color`
3. **Disponibilidad real** (GAP-004 — **BLOQUEANTE**): endpoint con `fuente: 'real'|'manual'`
4. **SEO metadata server-side** (GAP-008): refactoring a Server Component wrapper
5. **Slugs de producto** (GAP-005): campo `slug` en `ecommerce_products`
6. **Enlace SKU/variante** (GAP-006 — **BLOQUEANTE**): `sku_id` en variantes para checkout válido
