/**
 * store-api/catalog.ts
 *
 * Acceso al catálogo de productos y detalle de producto.
 * Endpoints: GET /ecommerce/catalogo, GET /ecommerce/catalogo/{id}
 */

import { storeClient } from './client';
import { StoreError } from './errors';
import type {
  CatalogListResponse,
  CatalogQueryParams,
  BackendProduct,
  NormalizedProduct,
} from './types';
import { hasRealDiscount } from './query';
import type { FetchOptions } from './client';

// ─── Normalizer ───────────────────────────────────────────────────────────────

/**
 * Normaliza un BackendProduct en un NormalizedProduct con campos garantizados.
 * Nunca devuelve null/undefined en campos críticos.
 */
export function normalizeProduct(raw: BackendProduct): NormalizedProduct {
  const precio_venta = typeof raw.precio_venta === 'number' ? raw.precio_venta : 0;
  const precio_comparacion =
    typeof raw.precio_comparacion === 'number' ? raw.precio_comparacion : 0;
  const descuento_pct =
    typeof raw.descuento_pct === 'number' ? raw.descuento_pct : 0;

  // Prefer server-computed modalidad_disponible; fall back to legacy field or infer
  const modalidad: NormalizedProduct['modalidad'] =
    raw.modalidad_disponible === 'ENTREGA_INMEDIATA' ||
    raw.modalidad_disponible === 'POR_PEDIDO'
      ? raw.modalidad_disponible
      : raw.modalidad === 'ENTREGA_INMEDIATA' || raw.modalidad === 'POR_PEDIDO'
      ? raw.modalidad
      : (raw.stock_disponible ?? 0) > 0
      ? 'ENTREGA_INMEDIATA'
      : 'POR_PEDIDO';

  return {
    id: String(raw.id),
    nombre: raw.nombre?.trim() || '(Sin nombre)',
    descripcion: raw.descripcion ?? '',
    descripcion_larga: raw.descripcion_larga ?? '',
    sku: raw.sku ?? '',
    precio_venta,
    precio_comparacion,
    descuento_pct,
    impuesto_pct: typeof raw.impuesto_pct === 'number' ? raw.impuesto_pct : 0,
    categoria: raw.categoria ?? '',
    sub_categoria: raw.sub_categoria ?? '',
    marca: raw.marca ?? '',
    tipo_producto: raw.tipo_producto ?? '',
    imagenes: Array.isArray(raw.imagenes) ? raw.imagenes.filter(Boolean) : [],
    atributos: Array.isArray(raw.atributos) ? raw.atributos : [],
    variantes: Array.isArray(raw.variantes) ? raw.variantes : [],
    stock_disponible: typeof raw.stock_disponible === 'number' ? raw.stock_disponible : 0,
    modalidad,
    alerta_stock_minimo: raw.alerta_stock_minimo ?? 5,
    publicado_web: raw.publicado_web ?? false,
    rastrear_inventario: raw.rastrear_inventario ?? true,
    seo_titulo: raw.seo_titulo || raw.nombre || '',
    seo_descripcion: raw.seo_descripcion ?? raw.descripcion ?? '',
    created_at: raw.created_at ?? '',
    updated_at: raw.updated_at ?? '',
    is_low_stock: raw.is_low_stock ?? false,
    tiene_descuento: hasRealDiscount({ precio_venta, precio_comparacion, descuento_pct }),
  };
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Lista productos del catálogo público.
 *
 * NOTA IMPORTANTE sobre paginación:
 * El backend no soporta offset/page real. Se solicita hasta `limit` (máx 500)
 * y la paginación se realiza client-side.
 * Ver WEB2A_GAPS_BACKEND.md GAP-001.
 */
export async function listProductos(
  params: CatalogQueryParams,
  options?: FetchOptions,
): Promise<{ products: NormalizedProduct[]; total: number }> {
  const queryParams: Record<string, string | number | boolean> = {};

  if (params.search)             queryParams.search    = params.search;
  if (params.categoria)          queryParams.categoria = params.categoria;
  if (params.publicado !== undefined) queryParams.publicado = params.publicado;
  queryParams.limit = params.limit ?? 500;

  const raw = await storeClient.get<CatalogListResponse>(
    '/ecommerce/catalogo',
    queryParams,
    options,
  );

  // Handle both array and envelope formats
  const items: BackendProduct[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
    ? raw.data
    : [];

  const total = typeof raw?.total === 'number' ? raw.total : items.length;

  return {
    products: items.map(normalizeProduct),
    total,
  };
}

/**
 * Obtiene el detalle de un producto por su ID.
 */
export async function getProducto(
  id: string | number,
  options?: FetchOptions,
): Promise<NormalizedProduct> {
  if (!id && id !== 0) {
    throw new StoreError('NOT_FOUND', { detail: 'Product ID is required' });
  }

  // Validate ID is numeric to prevent path injection
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new StoreError('NOT_FOUND', { detail: `Invalid product ID: ${id}` });
  }

  const raw = await storeClient.get<BackendProduct | { status: string; data: BackendProduct }>(
    `/ecommerce/catalogo/${numericId}`,
    undefined,
    options,
  );

  // Handle potential envelope wrapper
  const product: BackendProduct = 'status' in raw && raw.data
    ? raw.data as unknown as BackendProduct
    : raw as BackendProduct;

  if (!product || typeof product.id === 'undefined') {
    throw new StoreError('MALFORMED_RESPONSE', { detail: `No product data for ID ${id}` });
  }

  return normalizeProduct(product);
}
