/**
 * Tests for store-api/query.ts
 */

import { describe, it, expect } from 'vitest';
import {
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
} from '@/lib/store-api/query';
import { EMPTY_FILTERS } from '@/lib/store-api/types';
import type { CatalogFilterState, NormalizedProduct } from '@/lib/store-api/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<NormalizedProduct> = {}): NormalizedProduct {
  return {
    id: '1',
    nombre: 'Producto Test',
    descripcion: '',
    descripcion_larga: '',
    sku: 'TST-001',
    precio_venta: 50000,
    precio_comparacion: 50000,
    descuento_pct: 0,
    impuesto_pct: 0,
    categoria: 'Ropa',
    sub_categoria: 'Blusas',
    marca: 'MarcaA',
    tipo_producto: 'Fisico',
    imagenes: [],
    atributos: [],
    variantes: [],
    stock_disponible: 10,
    modalidad: 'ENTREGA_INMEDIATA',
    alerta_stock_minimo: 5,
    publicado_web: true,
    rastrear_inventario: true,
    seo_titulo: 'Producto Test',
    seo_descripcion: '',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    is_low_stock: false,
    tiene_descuento: false,
    ...overrides,
  };
}

// ─── parseUrlToFilters ────────────────────────────────────────────────────────

describe('parseUrlToFilters', () => {
  it('parses empty params to empty filters', () => {
    const filters = parseUrlToFilters(new URLSearchParams());
    expect(filters.search).toBe('');
    expect(filters.categoria).toBe('');
    expect(filters.page).toBe(1);
    expect(filters.modalidad).toBe('');
  });

  it('parses search param from q', () => {
    const filters = parseUrlToFilters(new URLSearchParams('q=stanley'));
    expect(filters.search).toBe('stanley');
  });

  it('parses page number', () => {
    const filters = parseUrlToFilters(new URLSearchParams('page=3'));
    expect(filters.page).toBe(3);
  });

  it('defaults page to 1 for invalid values', () => {
    const filters = parseUrlToFilters(new URLSearchParams('page=abc'));
    expect(filters.page).toBe(1);
    const filters2 = parseUrlToFilters(new URLSearchParams('page=0'));
    expect(filters2.page).toBe(1);
    const filters3 = parseUrlToFilters(new URLSearchParams('page=-5'));
    expect(filters3.page).toBe(1);
  });

  it('only allows valid modalidad values', () => {
    const valid1 = parseUrlToFilters(new URLSearchParams('modalidad=ENTREGA_INMEDIATA'));
    expect(valid1.modalidad).toBe('ENTREGA_INMEDIATA');
    const valid2 = parseUrlToFilters(new URLSearchParams('modalidad=POR_PEDIDO'));
    expect(valid2.modalidad).toBe('POR_PEDIDO');
    const invalid = parseUrlToFilters(new URLSearchParams('modalidad=HACK'));
    expect(invalid.modalidad).toBe('');
  });

  it('normalizes precio params to valid numbers', () => {
    const filters = parseUrlToFilters(new URLSearchParams('precioMin=50000&precioMax=200000'));
    expect(filters.precioMin).toBe('50000');
    expect(filters.precioMax).toBe('200000');
  });

  it('rejects non-numeric precio params', () => {
    const filters = parseUrlToFilters(new URLSearchParams('precioMin=abc'));
    expect(filters.precioMin).toBe('');
  });

  it('truncates excessively long text params', () => {
    const longStr = 'a'.repeat(500);
    const filters = parseUrlToFilters(new URLSearchParams(`q=${longStr}`));
    expect(filters.search.length).toBeLessThanOrEqual(200);
  });
});

// ─── filtersToUrlParams ───────────────────────────────────────────────────────

describe('filtersToUrlParams', () => {
  it('omits empty values from URL params', () => {
    const params = filtersToUrlParams(EMPTY_FILTERS);
    expect(params.toString()).toBe('');
  });

  it('includes non-empty filters', () => {
    const filters: CatalogFilterState = { ...EMPTY_FILTERS, search: 'stanley', categoria: 'Ropa' };
    const params = filtersToUrlParams(filters);
    expect(params.get('q')).toBe('stanley');
    expect(params.get('categoria')).toBe('Ropa');
  });

  it('omits page=1 (default) but includes page>1', () => {
    const p1 = filtersToUrlParams({ ...EMPTY_FILTERS, page: 1 });
    expect(p1.has('page')).toBe(false);
    const p3 = filtersToUrlParams({ ...EMPTY_FILTERS, page: 3 });
    expect(p3.get('page')).toBe('3');
  });
});

// ─── buildCatalogUrl ──────────────────────────────────────────────────────────

describe('buildCatalogUrl', () => {
  it('returns base path when no filters are active', () => {
    const url = buildCatalogUrl('/store/catalogo', EMPTY_FILTERS);
    expect(url).toBe('/store/catalogo');
  });

  it('appends filters as query string', () => {
    const url = buildCatalogUrl(
      '/store/catalogo',
      { ...EMPTY_FILTERS, search: 'remera', categoria: 'Ropa' },
    );
    expect(url).toContain('q=remera');
    expect(url).toContain('categoria=Ropa');
  });

  it('produces a shareable URL matching the spec', () => {
    const url = buildCatalogUrl('/store/catalogo', {
      ...EMPTY_FILTERS,
      categoria: 'calzado',
      modalidad: 'POR_PEDIDO',
    });
    expect(url).toContain('categoria=calzado');
    expect(url).toContain('modalidad=POR_PEDIDO');
  });
});

// ─── filtersToCatalogParams ───────────────────────────────────────────────────

describe('filtersToCatalogParams', () => {
  it('maps search and categoria to backend params', () => {
    const params = filtersToCatalogParams({
      ...EMPTY_FILTERS, search: 'bolso', categoria: 'Accesorios',
    });
    expect(params.search).toBe('bolso');
    expect(params.categoria).toBe('Accesorios');
    expect(params.publicado).toBe(true);
  });

  it('omits undefined values for empty filters', () => {
    const params = filtersToCatalogParams(EMPTY_FILTERS);
    expect(params.search).toBeUndefined();
    expect(params.categoria).toBeUndefined();
  });

  it('uses provided limit', () => {
    const params = filtersToCatalogParams(EMPTY_FILTERS, 100);
    expect(params.limit).toBe(100);
  });
});

// ─── applyClientFilters ───────────────────────────────────────────────────────

describe('applyClientFilters', () => {
  const products = [
    makeProduct({ id: '1', marca: 'MarcaA', precio_venta: 30000, modalidad: 'ENTREGA_INMEDIATA', stock_disponible: 5 }),
    makeProduct({ id: '2', marca: 'MarcaB', precio_venta: 80000, modalidad: 'POR_PEDIDO', stock_disponible: 0 }),
    makeProduct({ id: '3', marca: 'MarcaA', precio_venta: 120000, modalidad: 'ENTREGA_INMEDIATA', stock_disponible: 2 }),
  ];

  it('returns all products when no filters active', () => {
    expect(applyClientFilters(products, EMPTY_FILTERS)).toHaveLength(3);
  });

  it('filters by marca', () => {
    const result = applyClientFilters(products, { ...EMPTY_FILTERS, marca: 'MarcaA' });
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.marca === 'MarcaA')).toBe(true);
  });

  it('filters by precioMin', () => {
    const result = applyClientFilters(products, { ...EMPTY_FILTERS, precioMin: '70000' });
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.precio_venta >= 70000)).toBe(true);
  });

  it('filters by precioMax', () => {
    const result = applyClientFilters(products, { ...EMPTY_FILTERS, precioMax: '80000' });
    expect(result).toHaveLength(2);
  });

  it('filters by modalidad', () => {
    const result = applyClientFilters(products, { ...EMPTY_FILTERS, modalidad: 'POR_PEDIDO' });
    expect(result).toHaveLength(1);
    expect(result[0].modalidad).toBe('POR_PEDIDO');
  });

  it('filters by disponibilidad=disponible', () => {
    const result = applyClientFilters(products, { ...EMPTY_FILTERS, disponibilidad: 'DISPONIBLE' });
    // DISPONIBLE is not a valid enum value, so no filter applied
    expect(result).toHaveLength(3);
  });

  it('filters by atributo talla', () => {
    const withTalla = [
      makeProduct({ id: '10', atributos: [{ nombre: 'Talla', valor: ['S', 'M', 'L'] }] }),
      makeProduct({ id: '11', atributos: [{ nombre: 'Talla', valor: ['XL', 'XXL'] }] }),
    ];
    const result = applyClientFilters(withTalla, { ...EMPTY_FILTERS, talla: 'M' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('10');
  });

  it('filters by atributo color', () => {
    const withColor = [
      makeProduct({ id: '20', atributos: [{ nombre: 'Color', valor: 'Rosa' }] }),
      makeProduct({ id: '21', atributos: [{ nombre: 'Color', valor: 'Azul' }] }),
    ];
    const result = applyClientFilters(withColor, { ...EMPTY_FILTERS, color: 'rosa' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('20');
  });

  it('is case-insensitive for marca filter', () => {
    const result = applyClientFilters(products, { ...EMPTY_FILTERS, marca: 'marcaa' });
    expect(result).toHaveLength(2);
  });
});

// ─── applySorting ─────────────────────────────────────────────────────────────

describe('applySorting', () => {
  const products = [
    makeProduct({ id: '1', nombre: 'Camisa', precio_venta: 80000, created_at: '2026-01-15T00:00:00' }),
    makeProduct({ id: '2', nombre: 'Abrigo', precio_venta: 200000, created_at: '2026-03-01T00:00:00' }),
    makeProduct({ id: '3', nombre: 'Bolso', precio_venta: 50000, created_at: '2026-02-01T00:00:00' }),
  ];

  it('preserves original order when no sort applied', () => {
    const result = applySorting(products, '');
    expect(result.map((p) => p.id)).toEqual(['1', '2', '3']);
  });

  it('sorts by precio_asc', () => {
    const result = applySorting(products, 'precio_asc');
    expect(result.map((p) => p.precio_venta)).toEqual([50000, 80000, 200000]);
  });

  it('sorts by precio_desc', () => {
    const result = applySorting(products, 'precio_desc');
    expect(result.map((p) => p.precio_venta)).toEqual([200000, 80000, 50000]);
  });

  it('sorts by nombre_asc', () => {
    const result = applySorting(products, 'nombre_asc');
    expect(result.map((p) => p.nombre)).toEqual(['Abrigo', 'Bolso', 'Camisa']);
  });

  it('sorts by recientes (most recent first)', () => {
    const result = applySorting(products, 'recientes');
    expect(result[0].created_at).toBe('2026-03-01T00:00:00');
  });

  it('does not mutate original array', () => {
    const original = [...products];
    applySorting(products, 'precio_asc');
    expect(products.map((p) => p.id)).toEqual(original.map((p) => p.id));
  });
});

// ─── paginate ─────────────────────────────────────────────────────────────────

describe('paginate', () => {
  const items = Array.from({ length: 50 }, (_, i) => i);

  it('returns first page correctly', () => {
    const result = paginate(items, 1, 24);
    expect(result).toHaveLength(24);
    expect(result[0]).toBe(0);
    expect(result[23]).toBe(23);
  });

  it('returns second page correctly', () => {
    const result = paginate(items, 2, 24);
    expect(result).toHaveLength(24);
    expect(result[0]).toBe(24);
  });

  it('returns partial last page', () => {
    const result = paginate(items, 3, 24);
    expect(result).toHaveLength(2); // 50 - 48 = 2
  });

  it('returns empty array for out-of-range page', () => {
    const result = paginate(items, 10, 24);
    expect(result).toHaveLength(0);
  });
});

describe('getTotalPages', () => {
  it('calculates correct total pages', () => {
    expect(getTotalPages(100, 24)).toBe(5);
    expect(getTotalPages(24, 24)).toBe(1);
    expect(getTotalPages(0, 24)).toBe(1); // minimum 1
    expect(getTotalPages(25, 24)).toBe(2);
  });
});

// ─── countActiveFilters ───────────────────────────────────────────────────────

describe('countActiveFilters', () => {
  it('returns 0 for empty filters', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  it('counts each active filter', () => {
    const filters = {
      ...EMPTY_FILTERS,
      search: 'remera',
      categoria: 'Ropa',
      marca: 'MarcaA',
    };
    expect(countActiveFilters(filters)).toBe(3);
  });

  it('does not count page or ordenar as filters', () => {
    const filters = { ...EMPTY_FILTERS, page: 5, ordenar: 'recientes' };
    expect(countActiveFilters(filters)).toBe(0);
  });
});

// ─── formatCOP ────────────────────────────────────────────────────────────────

describe('formatCOP', () => {
  it('formats numbers as COP currency', () => {
    const formatted = formatCOP(50000);
    expect(formatted).toContain('50');
    expect(formatted).toContain('000');
  });

  it('returns dash for null or undefined', () => {
    expect(formatCOP(null)).toBe('—');
    expect(formatCOP(undefined)).toBe('—');
  });

  it('returns dash for NaN', () => {
    expect(formatCOP(NaN)).toBe('—');
  });
});

// ─── hasRealDiscount ──────────────────────────────────────────────────────────

describe('hasRealDiscount', () => {
  it('returns true when comparison price is higher and discount_pct > 0', () => {
    expect(hasRealDiscount({
      precio_venta: 40000,
      precio_comparacion: 60000,
      descuento_pct: 33,
    })).toBe(true);
  });

  it('returns false when prices are equal', () => {
    expect(hasRealDiscount({
      precio_venta: 50000,
      precio_comparacion: 50000,
      descuento_pct: 0,
    })).toBe(false);
  });

  it('returns false when descuento_pct is 0 even if prices differ', () => {
    expect(hasRealDiscount({
      precio_venta: 40000,
      precio_comparacion: 60000,
      descuento_pct: 0,
    })).toBe(false);
  });

  it('prevents false discount badge for $0 products', () => {
    // Precio 0 comparison 0 — never show discount
    expect(hasRealDiscount({
      precio_venta: 0,
      precio_comparacion: 0,
      descuento_pct: 0,
    })).toBe(false);
  });

  it('requires price difference > 1 to avoid floating point false positives', () => {
    expect(hasRealDiscount({
      precio_venta: 50000,
      precio_comparacion: 50000.5, // less than 1 difference
      descuento_pct: 5,
    })).toBe(false);
  });
});
