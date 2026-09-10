/**
 * store-api/catalog.ts
 *
 * Acceso al catálogo de productos y detalle de producto.
 * Endpoints: GET /ecommerce/catalogo, GET /ecommerce/catalogo/{id}
 * WEB-2B.1: normalizeProduct incluye sku_id, purchasable, requires_configuration, availability_source.
 * WEB-2B.2: getProductVariantes, getAtributos, server-side pagination.
 */

import { storeClient } from './client';
import { StoreError } from './errors';
import type {
  CatalogListResponse,
  CatalogQueryParams,
  BackendProduct,
  NormalizedProduct,
  ProductVariantesResponse,
  AtributosResponse,
  AtributosFilterData,
} from './types';
import { hasRealDiscount } from './query';
import type { FetchOptions } from './client';


// ─── Normalizer ───────────────────────────────────────────────────────────────

/**
 * Normaliza un BackendProduct en un NormalizedProduct con campos garantizados.
 * Nunca devuelve null/undefined en campos críticos.
 * WEB-2B.1: incluye sku_id, purchasable, requires_configuration, availability_source.
 */
export function normalizeProduct(raw: BackendProduct): NormalizedProduct {
  const precio_venta = typeof raw.precio_venta === 'number' ? raw.precio_venta : 0;
  const precio_comparacion =
    typeof raw.precio_comparacion === 'number' ? raw.precio_comparacion : 0;
  const descuento_pct =
    typeof raw.descuento_pct === 'number' ? raw.descuento_pct : 0;

  // ── Modalidad segura ──────────────────────────────────────────────────────
  //
  // Prioridad canónica (de mayor a menor confianza):
  //   1. modalidad_disponible = campo calculado por el servidor en tiempo real.
  //   2. modalidad = campo legacy manual — válido pero menos fiable.
  //   3. DISPONIBILIDAD_POR_CONFIRMAR — no inferir ENTREGA_INMEDIATA desde stock.
  //
  // NUNCA se infiere ENTREGA_INMEDIATA únicamente porque stock_disponible > 0,
  // ya que stock_disponible puede ser un valor manual no vinculado a un SKU canónico.
  // Ver WEB2A_GAPS_BACKEND.md GAP-004 y WEB2B1_CONTRATO_SKU_DISPONIBILIDAD.md.
  const VALID_MODALITIES = new Set(['ENTREGA_INMEDIATA', 'POR_PEDIDO', 'DISPONIBILIDAD_POR_CONFIRMAR'] as const);

  function resolveModalidad(
    disponible: string | undefined,
    legacy: string | undefined,
  ): NormalizedProduct['modalidad'] {
    if (disponible && VALID_MODALITIES.has(disponible as NormalizedProduct['modalidad'])) {
      return disponible as NormalizedProduct['modalidad'];
    }
    if (legacy && VALID_MODALITIES.has(legacy as NormalizedProduct['modalidad'])) {
      return legacy as NormalizedProduct['modalidad'];
    }
    return 'DISPONIBILIDAD_POR_CONFIRMAR';
  }

  const modalidad = resolveModalidad(raw.modalidad_disponible, raw.modalidad);

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
    // ── WEB-2B.1: SKU link y contrato de disponibilidad ─────────────────────
    sku_id: raw.sku_id ?? null,
    purchasable: raw.purchasable ?? false,
    requires_configuration: raw.requires_configuration ?? false,
    availability_source: (raw.availability_source ?? 'MANUAL') as 'REAL' | 'MANUAL' | 'UNCONFIRMED',
    // WEB-2B.1: modalidad_disponible — server-computed honest modality.
    // Falls back to the client-resolved modalidad when not provided by the server.
    modalidad_disponible: (
      raw.modalidad_disponible &&
      ['ENTREGA_INMEDIATA', 'POR_PEDIDO', 'DISPONIBILIDAD_POR_CONFIRMAR'].includes(raw.modalidad_disponible)
        ? raw.modalidad_disponible
        : modalidad
    ) as 'ENTREGA_INMEDIATA' | 'POR_PEDIDO' | 'DISPONIBILIDAD_POR_CONFIRMAR',
    // WEB-2B.2: stable URL slug (GAP-005)
    slug: raw.slug ?? null,
  };
}




// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Lista productos del catálogo público.
 *
 * WEB-2B.2: soporta paginación server-side (offset, limit), filtros (marca,
 * precio_min/max, modalidad, disponible) y ordenamiento server-side.
 * Ver WEB2A_GAPS_BACKEND.md GAP-001, GAP-002, GAP-003.
 */
export async function listProductos(
  params: CatalogQueryParams,
  options?: FetchOptions,
): Promise<{ products: NormalizedProduct[]; total: number; offset: number; has_more: boolean }> {
  const queryParams: Record<string, string | number | boolean> = {};

  if (params.search)             queryParams.search    = params.search;
  if (params.categoria)          queryParams.categoria = params.categoria;
  if (params.publicado !== undefined) queryParams.publicado = params.publicado;
  queryParams.limit = params.limit ?? 24;
  // WEB-2B.2: server-side pagination
  if (typeof params.offset === 'number') queryParams.offset = params.offset;
  // WEB-2B.2: server-side filters
  if ((params as Record<string, unknown>).marca)        queryParams.marca      = (params as Record<string, unknown>).marca as string;
  if (typeof (params as Record<string, unknown>).precio_min === 'number') queryParams.precio_min = (params as Record<string, unknown>).precio_min as number;
  if (typeof (params as Record<string, unknown>).precio_max === 'number') queryParams.precio_max = (params as Record<string, unknown>).precio_max as number;
  if ((params as Record<string, unknown>).modalidad)    queryParams.modalidad  = (params as Record<string, unknown>).modalidad as string;
  if ((params as Record<string, unknown>).disponible !== undefined) queryParams.disponible = (params as Record<string, unknown>).disponible as boolean;
  // WEB-2B.2: server-side ordering
  if ((params as Record<string, unknown>).ordenar)      queryParams.ordenar    = (params as Record<string, unknown>).ordenar as string;

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
  const offset = typeof raw?.offset === 'number' ? raw.offset : 0;
  const has_more = raw?.has_more ?? false;

  return {
    products: items.map(normalizeProduct),
    total,
    offset,
    has_more,
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

// ─── WEB-2B.2: Variantes reales (GAP-006) ────────────────────────────────────

/**
 * Obtiene las variantes reales de un producto con stock real y sku_id.
 * Endpoint: GET /ecommerce/catalogo/{id}/variantes
 */
export async function getProductVariantes(
  productId: number,
  options?: FetchOptions,
): Promise<ProductVariantesResponse> {
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new StoreError('NOT_FOUND', { detail: `Invalid product ID: ${productId}` });
  }

  const raw = await storeClient.get<ProductVariantesResponse>(
    `/ecommerce/catalogo/${productId}/variantes`,
    undefined,
    options,
  );
  return raw;
}

// ─── WEB-2B.2: Atributos dinámicos (GAP-007) ─────────────────────────────────

/**
 * Obtiene atributos dinámicos para filtros del catálogo.
 * Endpoint: GET /ecommerce/atributos
 */
export async function getAtributos(
  categoria?: string,
  options?: FetchOptions,
): Promise<AtributosFilterData> {
  const queryParams: Record<string, string> = {};
  if (categoria) queryParams.categoria = categoria;

  const raw = await storeClient.get<AtributosResponse>(
    '/ecommerce/atributos',
    queryParams,
    options,
  );

  return raw?.data ?? {
    precio_min: 0, precio_max: 0,
    marcas: [], categorias: [], tallas: [], colores: [],
  };
}
