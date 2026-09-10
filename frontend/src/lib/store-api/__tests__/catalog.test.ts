/**
 * Tests for store-api/catalog.ts — normalizeProduct
 */

import { describe, it, expect } from 'vitest';
import { normalizeProduct } from '@/lib/store-api/catalog';
import type { BackendProduct } from '@/lib/store-api/types';

function makeBackendProduct(overrides: Partial<BackendProduct> = {}): BackendProduct {
  return {
    id: 1,
    nombre: 'Producto Test',
    descripcion: 'Descripción de prueba',
    sku: 'TST-001',
    precio_venta: 50000,
    precio_comparacion: 50000,
    descuento_pct: 0,
    impuesto_pct: 0,
    categoria: 'Ropa',
    sub_categoria: 'Blusas',
    marca: 'MarcaA',
    tipo_producto: 'Fisico',
    imagenes: ['https://example.com/img1.jpg'],
    atributos: [],
    variantes: [],
    stock_disponible: 10,
    alerta_stock_minimo: 5,
    publicado_web: true,
    rastrear_inventario: true,
    seo_titulo: 'Producto Test SEO',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-02-01T00:00:00',
    is_low_stock: false,
    ...overrides,
  };
}

describe('normalizeProduct', () => {
  it('converts id to string', () => {
    const product = normalizeProduct(makeBackendProduct({ id: 42 }));
    expect(product.id).toBe('42');
    expect(typeof product.id).toBe('string');
  });

  it('sets nombre with trim', () => {
    const product = normalizeProduct(makeBackendProduct({ nombre: '  Camiseta  ' }));
    expect(product.nombre).toBe('Camiseta');
  });

  it('uses fallback nombre when empty or null', () => {
    const product = normalizeProduct(makeBackendProduct({ nombre: '' }));
    expect(product.nombre).toBe('(Sin nombre)');
  });

  it('handles null descripcion gracefully', () => {
    const product = normalizeProduct(makeBackendProduct({ descripcion: null }));
    expect(product.descripcion).toBe('');
  });

  it('handles null categoria, marca, sub_categoria gracefully', () => {
    const product = normalizeProduct(makeBackendProduct({ categoria: null, marca: null, sub_categoria: null }));
    expect(product.categoria).toBe('');
    expect(product.marca).toBe('');
    expect(product.sub_categoria).toBe('');
  });

  it('prioritizes modalidad_disponible from server over legacy field', () => {
    const p1 = normalizeProduct(makeBackendProduct({
      modalidad_disponible: 'POR_PEDIDO',
      modalidad: 'ENTREGA_INMEDIATA',
      stock_disponible: 100,
    }));
    expect(p1.modalidad).toBe('POR_PEDIDO');
  });

  it('falls back to legacy modalidad field', () => {
    const p = normalizeProduct(makeBackendProduct({
      modalidad_disponible: undefined,
      modalidad: 'ENTREGA_INMEDIATA',
    }));
    expect(p.modalidad).toBe('ENTREGA_INMEDIATA');
  });

  it('uses DISPONIBILIDAD_POR_CONFIRMAR when no canonical modalidad provided (safe behavior)', () => {
    // Previously inferred ENTREGA_INMEDIATA from stock > 0 — unsafe (GAP-004).
    // Now correctly uses DISPONIBILIDAD_POR_CONFIRMAR to avoid false promises.
    const withStock = normalizeProduct(makeBackendProduct({
      modalidad_disponible: undefined,
      modalidad: undefined,
      stock_disponible: 5,
    }));
    expect(withStock.modalidad).toBe('DISPONIBILIDAD_POR_CONFIRMAR');

    const noStock = normalizeProduct(makeBackendProduct({
      modalidad_disponible: undefined,
      modalidad: undefined,
      stock_disponible: 0,
    }));
    expect(noStock.modalidad).toBe('DISPONIBILIDAD_POR_CONFIRMAR');
  });

  it('filters null/empty strings from imagenes array', () => {
    const product = normalizeProduct(makeBackendProduct({
      imagenes: ['https://img.com/1.jpg', '', 'https://img.com/2.jpg'],
    }));
    expect(product.imagenes).toHaveLength(2);
    expect(product.imagenes.every(Boolean)).toBe(true);
  });

  it('handles product with no images', () => {
    const product = normalizeProduct(makeBackendProduct({ imagenes: [] }));
    expect(product.imagenes).toEqual([]);
  });

  it('handles product with null imagenes', () => {
    const product = normalizeProduct(makeBackendProduct({ imagenes: null as unknown as string[] }));
    expect(product.imagenes).toEqual([]);
  });

  it('computes tiene_descuento correctly — false when prices equal', () => {
    const product = normalizeProduct(makeBackendProduct({
      precio_venta: 50000,
      precio_comparacion: 50000,
      descuento_pct: 0,
    }));
    expect(product.tiene_descuento).toBe(false);
  });

  it('computes tiene_descuento correctly — true for real offer', () => {
    const product = normalizeProduct(makeBackendProduct({
      precio_venta: 40000,
      precio_comparacion: 60000,
      descuento_pct: 33,
    }));
    expect(product.tiene_descuento).toBe(true);
  });

  it('prevents tiene_descuento true when precio_venta is 0 and comparacion is 0', () => {
    const product = normalizeProduct(makeBackendProduct({
      precio_venta: 0,
      precio_comparacion: 0,
      descuento_pct: 0,
    }));
    expect(product.tiene_descuento).toBe(false);
  });

  it('uses seo_titulo from backend', () => {
    const product = normalizeProduct(makeBackendProduct({ seo_titulo: 'Mi titulo SEO' }));
    expect(product.seo_titulo).toBe('Mi titulo SEO');
  });

  it('falls back to nombre when seo_titulo is null', () => {
    const product = normalizeProduct(makeBackendProduct({ seo_titulo: null, nombre: 'Producto X' }));
    expect(product.seo_titulo).toBe('Producto X');
  });

  it('handles non-array atributos gracefully', () => {
    const product = normalizeProduct(makeBackendProduct({ atributos: null as unknown as [] }));
    expect(product.atributos).toEqual([]);
  });

  it('handles non-array variantes gracefully', () => {
    const product = normalizeProduct(makeBackendProduct({ variantes: null as unknown as [] }));
    expect(product.variantes).toEqual([]);
  });

  it('preserves is_low_stock from server', () => {
    const product = normalizeProduct(makeBackendProduct({ is_low_stock: true }));
    expect(product.is_low_stock).toBe(true);
  });

  it('normalizes precio_venta that might be null', () => {
    const product = normalizeProduct(makeBackendProduct({ precio_venta: null as unknown as number }));
    expect(product.precio_venta).toBe(0);
  });
});
