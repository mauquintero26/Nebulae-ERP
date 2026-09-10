/**
 * availability.test.ts
 *
 * Pruebas para la lógica de disponibilidad y modalidad (FASE 3 — WEB-2A cierre).
 *
 * Cobertura:
 * - normalizeProduct: modalidad canónica ENTREGA_INMEDIATA
 * - normalizeProduct: modalidad canónica POR_PEDIDO
 * - normalizeProduct: stock positivo sin fuente canónica → DISPONIBILIDAD_POR_CONFIRMAR
 * - normalizeProduct: stock cero sin modalidad → DISPONIBILIDAD_POR_CONFIRMAR
 * - normalizeProduct: producto sin sku_id (GAP-006 documentado)
 * - normalizeProduct: ausencia o datos inválidos de modalidad
 * - getAvailabilityStatus: modalidad canónica ENTREGA_INMEDIATA → available/low_stock/out_of_stock
 * - getAvailabilityStatus: modalidad POR_PEDIDO → by_order (ignorando stock)
 * - getAvailabilityStatus: sin modalidad canónica → unconfirmed
 * - getAvailabilityStatus: DISPONIBILIDAD_POR_CONFIRMAR → unconfirmed
 */

import { describe, it, expect } from 'vitest';
import { normalizeProduct } from '../catalog';
import { getAvailabilityStatus } from '@/components/store/AvailabilityBadge';
import type { BackendProduct } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeBackendProduct(overrides: Partial<BackendProduct> = {}): BackendProduct {
  return {
    id: 1,
    nombre: 'Producto Test',
    descripcion: 'Descripción',
    sku: 'SKU-001',
    precio_venta: 50000,
    precio_comparacion: 60000,
    descuento_pct: 0,
    impuesto_pct: 0,
    categoria: 'Ropa',
    sub_categoria: null,
    marca: 'Nebulae',
    tipo_producto: null,
    imagenes: [],
    atributos: [],
    variantes: [],
    stock_disponible: 10,
    alerta_stock_minimo: 5,
    publicado_web: true,
    rastrear_inventario: true,
    seo_titulo: null,
    seo_descripcion: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    is_low_stock: false,
    ...overrides,
  };
}

// ─── normalizeProduct — Modalidad canónica ENTREGA_INMEDIATA ──────────────────

describe('normalizeProduct — modalidad', () => {
  it('respeta modalidad_disponible=ENTREGA_INMEDIATA del servidor', () => {
    const product = normalizeProduct(makeBackendProduct({
      modalidad_disponible: 'ENTREGA_INMEDIATA',
      stock_disponible: 20,
    }));
    expect(product.modalidad).toBe('ENTREGA_INMEDIATA');
  });

  it('respeta modalidad_disponible=POR_PEDIDO del servidor', () => {
    const product = normalizeProduct(makeBackendProduct({
      modalidad_disponible: 'POR_PEDIDO',
      stock_disponible: 0,
    }));
    expect(product.modalidad).toBe('POR_PEDIDO');
  });

  it('usa modalidad legacy si modalidad_disponible no está', () => {
    const product = normalizeProduct(makeBackendProduct({
      modalidad_disponible: undefined,
      modalidad: 'ENTREGA_INMEDIATA',
      stock_disponible: 5,
    }));
    expect(product.modalidad).toBe('ENTREGA_INMEDIATA');
  });

  it('usa modalidad legacy POR_PEDIDO si modalidad_disponible no está', () => {
    const product = normalizeProduct(makeBackendProduct({
      modalidad_disponible: undefined,
      modalidad: 'POR_PEDIDO',
    }));
    expect(product.modalidad).toBe('POR_PEDIDO');
  });

  it('NO infiere ENTREGA_INMEDIATA por stock positivo sin modalidad canónica', () => {
    const product = normalizeProduct(makeBackendProduct({
      modalidad_disponible: undefined,
      modalidad: undefined,
      stock_disponible: 50,
    }));
    // CRÍTICO: antes devolvía ENTREGA_INMEDIATA. Ahora debe ser DISPONIBILIDAD_POR_CONFIRMAR.
    expect(product.modalidad).toBe('DISPONIBILIDAD_POR_CONFIRMAR');
    expect(product.modalidad).not.toBe('ENTREGA_INMEDIATA');
  });

  it('stock cero sin modalidad canónica → DISPONIBILIDAD_POR_CONFIRMAR', () => {
    const product = normalizeProduct(makeBackendProduct({
      modalidad_disponible: undefined,
      modalidad: undefined,
      stock_disponible: 0,
    }));
    // CRÍTICO: antes devolvía POR_PEDIDO. Ahora debe ser DISPONIBILIDAD_POR_CONFIRMAR.
    expect(product.modalidad).toBe('DISPONIBILIDAD_POR_CONFIRMAR');
    expect(product.modalidad).not.toBe('POR_PEDIDO');
  });

  it('datos de modalidad inválidos → DISPONIBILIDAD_POR_CONFIRMAR', () => {
    const product = normalizeProduct(makeBackendProduct({
      modalidad_disponible: 'INVALIDO' as 'ENTREGA_INMEDIATA',
      modalidad: 'OTRO' as 'POR_PEDIDO',
    }));
    expect(product.modalidad).toBe('DISPONIBILIDAD_POR_CONFIRMAR');
  });

  it('producto sin sku → modalidad se sigue resolviendo (GAP-006: SKU canónico requerido para checkout)', () => {
    const product = normalizeProduct(makeBackendProduct({
      sku: null,
      modalidad_disponible: 'ENTREGA_INMEDIATA',
    }));
    // El frontend normaliza correctamente la modalidad
    expect(product.modalidad).toBe('ENTREGA_INMEDIATA');
    // El SKU queda vacío — la ausencia del SKU canónico es un bloqueo para WEB-3 (GAP-006)
    expect(product.sku).toBe('');
  });

  it('producto sin variantes con sku_id tiene sku vacío', () => {
    const product = normalizeProduct(makeBackendProduct({
      variantes: [],
      sku: null,
    }));
    expect(product.sku).toBe('');
    // GAP-006: sin sku_id inequívoco, el checkout no puede proceder sin riesgo de sobreventa
    // Este test documenta el bloqueo; la solución es WEB-3 responsabilidad del backend.
    expect(product.variantes).toHaveLength(0);
  });
});

// ─── getAvailabilityStatus ─────────────────────────────────────────────────────

describe('getAvailabilityStatus', () => {
  it('ENTREGA_INMEDIATA canónica con stock alto → available', () => {
    expect(getAvailabilityStatus(20, 5, 'ENTREGA_INMEDIATA')).toBe('available');
  });

  it('ENTREGA_INMEDIATA canónica con stock bajo (≤ alerta) → low_stock', () => {
    expect(getAvailabilityStatus(3, 5, 'ENTREGA_INMEDIATA')).toBe('low_stock');
  });

  it('ENTREGA_INMEDIATA canónica con stock exactamente en alerta → low_stock', () => {
    expect(getAvailabilityStatus(5, 5, 'ENTREGA_INMEDIATA')).toBe('low_stock');
  });

  it('ENTREGA_INMEDIATA canónica con stock cero → out_of_stock', () => {
    expect(getAvailabilityStatus(0, 5, 'ENTREGA_INMEDIATA')).toBe('out_of_stock');
  });

  it('POR_PEDIDO ignora stock — siempre by_order', () => {
    expect(getAvailabilityStatus(100, 5, 'POR_PEDIDO')).toBe('by_order');
    expect(getAvailabilityStatus(0,   5, 'POR_PEDIDO')).toBe('by_order');
  });

  it('sin modalidad → unconfirmed (nunca promete entrega inmediata)', () => {
    expect(getAvailabilityStatus(50, 5, undefined)).toBe('unconfirmed');
    expect(getAvailabilityStatus(50, 5, '')).toBe('unconfirmed');
  });

  it('DISPONIBILIDAD_POR_CONFIRMAR → unconfirmed', () => {
    expect(getAvailabilityStatus(30, 5, 'DISPONIBILIDAD_POR_CONFIRMAR')).toBe('unconfirmed');
  });

  it('stock positivo sin modalidad canónica → unconfirmed, NOT available', () => {
    // Este es el caso crítico: antes se podría asumir available con solo stock > 0
    const result = getAvailabilityStatus(99, 5, undefined);
    expect(result).toBe('unconfirmed');
    expect(result).not.toBe('available');
    expect(result).not.toBe('low_stock');
  });

  it('modalidad inválida → unconfirmed', () => {
    expect(getAvailabilityStatus(10, 5, 'INVENTADO')).toBe('unconfirmed');
  });

  it('alerta por defecto (5) funciona cuando se omite', () => {
    expect(getAvailabilityStatus(3, undefined, 'ENTREGA_INMEDIATA')).toBe('low_stock');
    expect(getAvailabilityStatus(10, undefined, 'ENTREGA_INMEDIATA')).toBe('available');
  });
});
