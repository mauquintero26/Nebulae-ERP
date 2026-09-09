/**
 * store-api/query.ts
 *
 * Utilidades para construir, codificar y parsear query strings del catálogo.
 * Garantiza encoding correcto, normalización de valores y compatibilidad
 * con la navegación atrás/adelante del navegador.
 */

import type { CatalogFilterState, CatalogQueryParams } from './types';
import { EMPTY_FILTERS } from './types';

// ─── URL ↔ FilterState ────────────────────────────────────────────────────────

/**
 * Parsea un URLSearchParams (o query string) en un CatalogFilterState.
 * Normaliza todos los valores para prevenir inyección desde la URL.
 */
export function parseUrlToFilters(searchParams: URLSearchParams): CatalogFilterState {
  const page = parseInt(searchParams.get('page') ?? '1', 10);

  return {
    search:       normalizeTextParam(searchParams.get('q') ?? ''),
    categoria:    normalizeTextParam(searchParams.get('categoria') ?? ''),
    subcategoria: normalizeTextParam(searchParams.get('subcategoria') ?? ''),
    marca:        normalizeTextParam(searchParams.get('marca') ?? ''),
    precioMin:    normalizePriceParam(searchParams.get('precioMin') ?? ''),
    precioMax:    normalizePriceParam(searchParams.get('precioMax') ?? ''),
    modalidad:    normalizeEnumParam(
                    searchParams.get('modalidad') ?? '',
                    ['ENTREGA_INMEDIATA', 'POR_PEDIDO']
                  ),
    disponibilidad: normalizeEnumParam(
                      searchParams.get('disponibilidad') ?? '',
                      ['disponible', 'agotado']
                    ),
    talla:        normalizeTextParam(searchParams.get('talla') ?? ''),
    color:        normalizeTextParam(searchParams.get('color') ?? ''),
    page:         isNaN(page) || page < 1 ? 1 : page,
    ordenar:      normalizeEnumParam(
                    searchParams.get('ordenar') ?? '',
                    ['recientes', 'precio_asc', 'precio_desc', 'nombre_asc']
                  ),
  };
}

/**
 * Convierte un CatalogFilterState en URLSearchParams para actualizar la URL.
 * Solo incluye parámetros con valores no vacíos.
 */
export function filtersToUrlParams(filters: CatalogFilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search)        params.set('q', filters.search);
  if (filters.categoria)     params.set('categoria', filters.categoria);
  if (filters.subcategoria)  params.set('subcategoria', filters.subcategoria);
  if (filters.marca)         params.set('marca', filters.marca);
  if (filters.precioMin)     params.set('precioMin', filters.precioMin);
  if (filters.precioMax)     params.set('precioMax', filters.precioMax);
  if (filters.modalidad)     params.set('modalidad', filters.modalidad);
  if (filters.disponibilidad) params.set('disponibilidad', filters.disponibilidad);
  if (filters.talla)         params.set('talla', filters.talla);
  if (filters.color)         params.set('color', filters.color);
  if (filters.page > 1)      params.set('page', String(filters.page));
  if (filters.ordenar)       params.set('ordenar', filters.ordenar);

  return params;
}

/**
 * Genera una URL compartible para el catálogo dado un estado de filtros.
 */
export function buildCatalogUrl(basePath: string, filters: CatalogFilterState): string {
  const params = filtersToUrlParams(filters);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// ─── FilterState → CatalogQueryParams (backend) ───────────────────────────────

/**
 * Convierte filtros del frontend en los parámetros que entiende el backend.
 * NOTA: el backend solo soporta search, categoria, publicado y limit.
 * Los filtros adicionales (marca, talla, color, etc.) se aplican client-side.
 */
export function filtersToCatalogParams(
  filters: CatalogFilterState,
  limit = 500,
): CatalogQueryParams {
  return {
    search:    filters.search    || undefined,
    categoria: filters.categoria || undefined,
    publicado: true,
    limit,
  };
}

// ─── Client-side filtering ────────────────────────────────────────────────────

import type { NormalizedProduct } from './types';

/**
 * Aplica filtros que el backend no soporta sobre un array local de productos.
 * Documentado como temporal — ver WEB2A_GAPS_BACKEND.md GAP-002.
 */
export function applyClientFilters(
  products: NormalizedProduct[],
  filters: CatalogFilterState,
): NormalizedProduct[] {
  let result = products;

  // Subcategoría
  if (filters.subcategoria) {
    const sc = filters.subcategoria.toLowerCase();
    result = result.filter((p) => p.sub_categoria.toLowerCase().includes(sc));
  }

  // Marca
  if (filters.marca) {
    const m = filters.marca.toLowerCase();
    result = result.filter((p) => p.marca.toLowerCase().includes(m));
  }

  // Precio mínimo
  if (filters.precioMin) {
    const min = parseFloat(filters.precioMin);
    if (!isNaN(min)) result = result.filter((p) => p.precio_venta >= min);
  }

  // Precio máximo
  if (filters.precioMax) {
    const max = parseFloat(filters.precioMax);
    if (!isNaN(max)) result = result.filter((p) => p.precio_venta <= max);
  }

  // Modalidad
  if (filters.modalidad) {
    result = result.filter((p) => p.modalidad === filters.modalidad);
  }

  // Disponibilidad
  if (filters.disponibilidad === 'disponible') {
    result = result.filter((p) => p.stock_disponible > 0);
  } else if (filters.disponibilidad === 'agotado') {
    result = result.filter((p) => p.stock_disponible === 0);
  }

  // Talla (busca en atributos)
  if (filters.talla) {
    const t = filters.talla.toLowerCase();
    result = result.filter((p) =>
      p.atributos.some(
        (a) =>
          a.nombre.toLowerCase().includes('talla') &&
          (Array.isArray(a.valor)
            ? a.valor.some((v) => v.toLowerCase().includes(t))
            : String(a.valor).toLowerCase().includes(t)),
      ),
    );
  }

  // Color (busca en atributos)
  if (filters.color) {
    const c = filters.color.toLowerCase();
    result = result.filter((p) =>
      p.atributos.some(
        (a) =>
          a.nombre.toLowerCase().includes('color') &&
          (Array.isArray(a.valor)
            ? a.valor.some((v) => v.toLowerCase().includes(c))
            : String(a.valor).toLowerCase().includes(c)),
      ),
    );
  }

  return result;
}

// ─── Client-side sorting ──────────────────────────────────────────────────────

/**
 * Ordena productos client-side.
 * IMPORTANTE: Solo ordena los productos recibidos del servidor (máx 500).
 * No representa el orden global de todo el catálogo si hay más de 500 items.
 * Documentado en WEB2A_GAPS_BACKEND.md GAP-003.
 */
export function applySorting(
  products: NormalizedProduct[],
  ordenar: string,
): NormalizedProduct[] {
  const sorted = [...products];
  switch (ordenar) {
    case 'precio_asc':
      return sorted.sort((a, b) => a.precio_venta - b.precio_venta);
    case 'precio_desc':
      return sorted.sort((a, b) => b.precio_venta - a.precio_venta);
    case 'nombre_asc':
      return sorted.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    case 'recientes':
      return sorted.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    default:
      return sorted; // server order (by nombre)
  }
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function getTotalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// ─── Count active filters ─────────────────────────────────────────────────────

export function countActiveFilters(filters: CatalogFilterState): number {
  const keys: (keyof CatalogFilterState)[] = [
    'search', 'categoria', 'subcategoria', 'marca',
    'precioMin', 'precioMax', 'modalidad', 'disponibilidad',
    'talla', 'color',
  ];
  return keys.reduce((count, key) => {
    const val = filters[key];
    return count + (val && val !== EMPTY_FILTERS[key] ? 1 : 0);
  }, 0);
}

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizeTextParam(value: string): string {
  // Trim whitespace, limit length to prevent abuse
  return value.trim().slice(0, 200);
}

function normalizePriceParam(value: string): string {
  // Allow only digits and single decimal separator
  const clean = value.replace(/[^\d.,]/g, '').slice(0, 12);
  const parsed = parseFloat(clean.replace(',', '.'));
  return isNaN(parsed) ? '' : String(parsed);
}

function normalizeEnumParam(value: string, allowed: string[]): string {
  const normalized = value.trim().toUpperCase();
  return allowed.includes(normalized) ? normalized :
    // case-insensitive match
    (allowed.find((a) => a.toLowerCase() === value.trim().toLowerCase()) ?? '');
}

// ─── COP price formatting ─────────────────────────────────────────────────────

const COP_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCOP(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return COP_FORMATTER.format(value);
}

/**
 * Returns true only when precio_comparacion is meaningfully higher than precio_venta.
 * Prevents showing false "offer" badges for equal or near-equal prices.
 */
export function hasRealDiscount(product: {
  precio_venta: number;
  precio_comparacion: number;
  descuento_pct: number;
}): boolean {
  return (
    product.descuento_pct > 0 &&
    product.precio_comparacion > product.precio_venta &&
    product.precio_comparacion - product.precio_venta > 1
  );
}
