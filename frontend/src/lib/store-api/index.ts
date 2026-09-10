/**
 * store-api/index.ts
 *
 * Punto de entrada público de la capa API del storefront.
 * Importar desde '@/lib/store-api' en lugar de archivos individuales.
 * WEB-2B.1: añade ProductAvailability, AvailabilityResponse, availability API functions.
 * WEB-2B.2: añade getProductVariantes, getAtributos, nuevos tipos de variantes/atributos.
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
  // WEB-2B.1
  ProductAvailability,
  AvailabilityResponse,
  // WEB-2B.2
  ProductVariantReal,
  ProductVariantesResponse,
  AtributosFilterData,
  AtributosResponse,
} from './types';
export { EMPTY_FILTERS } from './types';

// Client (exposed for abort controller usage in hooks)
export { storeClient } from './client';

// Catalog
export { listProductos, getProducto, normalizeProduct, getProductVariantes, getAtributos } from './catalog';

// Availability (WEB-2B.1)
export {
  getProductAvailability,
  isProductPurchasable,
  getAvailabilityMessage,
  getMaxOrderable,
} from './availability';

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

