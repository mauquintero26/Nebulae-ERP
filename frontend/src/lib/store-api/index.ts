/**
 * store-api/index.ts
 *
 * Punto de entrada público de la capa API del storefront.
 * Importar desde '@/lib/store-api' en lugar de archivos individuales.
 */

// Errors
export { StoreError, fromHttpStatus, fromNetworkError, isStoreError } from './errors';
export type { StoreErrorCode } from './errors';

// Types
export type {
  BackendProduct,
  BackendProductAtributo,
  BackendProductVariante,
  BackendCategoria,
  BackendWebConfig,
  NormalizedProduct,
  CatalogQueryParams,
  CatalogFilterState,
  PaginationState,
  ApiEnvelope,
  CatalogListResponse,
} from './types';
export { EMPTY_FILTERS } from './types';

// Client (exposed for abort controller usage in hooks)
export { storeClient } from './client';

// Catalog
export { listProductos, getProducto, normalizeProduct } from './catalog';

// Categories + Config
export { listCategorias, getSiteConfig } from './categories';

// Query utilities
export {
  parseUrlToFilters,
  filtersToUrlParams,
  buildCatalogUrl,
  filtersToCatalogParams,
  applyClientFilters,
  applySorting,
  paginate,
  getTotalPages,
  countActiveFilters,
  formatCOP,
  hasRealDiscount,
} from './query';
