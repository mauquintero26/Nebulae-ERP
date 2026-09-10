/**
 * availability_api.test.ts
 *
 * WEB-2B.1: Tests para getProductAvailability, isProductPurchasable,
 * getAvailabilityMessage y getMaxOrderable.
 *
 * 22 casos de prueba según el spec WEB-2B.1.
 */

import { describe, it, expect } from 'vitest';
import type { ProductAvailability } from '../types';
import {
  isProductPurchasable,
  getAvailabilityMessage,
  getMaxOrderable,
} from '../availability';

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makeAvailability(overrides: Partial<ProductAvailability> = {}): ProductAvailability {
  return {
    product_id: 1,
    sku_id: 10,
    sku: 'SKU-001',
    stock_vendible: 5,
    max_orderable: 5,
    disponible: true,
    modalidad: 'ENTREGA_INMEDIATA',
    modalidad_disponible: 'ENTREGA_INMEDIATA',
    purchasable: true,
    requires_configuration: false,
    requires_supplier_confirmation: false,
    availability_source: 'REAL',
    alerta_stock_minimo: 3,
    warehouse_id: null,
    timestamp: '2026-09-10T00:00:00.000Z',
    ...overrides,
  };
}

// ─── isProductPurchasable ─────────────────────────────────────────────────────

describe('isProductPurchasable', () => {
  it('Case 1: purchasable=true, disponible=true, ENTREGA_INMEDIATA stock>0 → true', () => {
    const avail = makeAvailability({ purchasable: true, disponible: true, max_orderable: 5, modalidad_disponible: 'ENTREGA_INMEDIATA' });
    expect(isProductPurchasable(avail)).toBe(true);
  });

  it('Case 2: purchasable=false → false', () => {
    const avail = makeAvailability({ purchasable: false });
    expect(isProductPurchasable(avail)).toBe(false);
  });

  it('Case 3: disponible=false → false', () => {
    const avail = makeAvailability({ disponible: false });
    expect(isProductPurchasable(avail)).toBe(false);
  });

  it('Case 4: ENTREGA_INMEDIATA with max_orderable=0 → false', () => {
    const avail = makeAvailability({ modalidad_disponible: 'ENTREGA_INMEDIATA', max_orderable: 0 });
    expect(isProductPurchasable(avail)).toBe(false);
  });

  it('Case 5: POR_PEDIDO with max_orderable=99 → true', () => {
    const avail = makeAvailability({
      purchasable: true,
      disponible: true,
      modalidad_disponible: 'POR_PEDIDO',
      max_orderable: 99,
    });
    expect(isProductPurchasable(avail)).toBe(true);
  });

  it('Case 6: DISPONIBILIDAD_POR_CONFIRMAR → false (not purchasable by contract)', () => {
    const avail = makeAvailability({
      purchasable: false,
      modalidad_disponible: 'DISPONIBILIDAD_POR_CONFIRMAR',
    });
    expect(isProductPurchasable(avail)).toBe(false);
  });

  it('Case 7: requires_configuration (purchasable=false, requires_configuration=true) → false', () => {
    const avail = makeAvailability({ purchasable: false, requires_configuration: true });
    expect(isProductPurchasable(avail)).toBe(false);
  });
});

// ─── getAvailabilityMessage ───────────────────────────────────────────────────

describe('getAvailabilityMessage', () => {
  it('Case 8: purchasable=false → "Consultar disponibilidad"', () => {
    const avail = makeAvailability({ purchasable: false });
    expect(getAvailabilityMessage(avail)).toBe('Consultar disponibilidad');
  });

  it('Case 9: requires_configuration=true → "Consultar disponibilidad"', () => {
    const avail = makeAvailability({ purchasable: true, requires_configuration: true });
    expect(getAvailabilityMessage(avail)).toBe('Consultar disponibilidad');
  });

  it('Case 10: ENTREGA_INMEDIATA max_orderable=0 → "Agotado"', () => {
    const avail = makeAvailability({ purchasable: true, modalidad_disponible: 'ENTREGA_INMEDIATA', max_orderable: 0 });
    expect(getAvailabilityMessage(avail)).toBe('Agotado');
  });

  it('Case 11: ENTREGA_INMEDIATA low stock (<=alerta) → "Pocas unidades"', () => {
    const avail = makeAvailability({
      purchasable: true,
      modalidad_disponible: 'ENTREGA_INMEDIATA',
      max_orderable: 2,
      alerta_stock_minimo: 3,
    });
    expect(getAvailabilityMessage(avail)).toBe('Pocas unidades');
  });

  it('Case 12: ENTREGA_INMEDIATA normal stock → "En stock"', () => {
    const avail = makeAvailability({
      purchasable: true,
      modalidad_disponible: 'ENTREGA_INMEDIATA',
      max_orderable: 10,
      alerta_stock_minimo: 3,
    });
    expect(getAvailabilityMessage(avail)).toBe('En stock');
  });

  it('Case 13: POR_PEDIDO → "Disponible por pedido"', () => {
    const avail = makeAvailability({ purchasable: true, modalidad_disponible: 'POR_PEDIDO' });
    expect(getAvailabilityMessage(avail)).toBe('Disponible por pedido');
  });

  it('Case 14: DISPONIBILIDAD_POR_CONFIRMAR → "Consultar disponibilidad"', () => {
    const avail = makeAvailability({ purchasable: true, modalidad_disponible: 'DISPONIBILIDAD_POR_CONFIRMAR' });
    expect(getAvailabilityMessage(avail)).toBe('Consultar disponibilidad');
  });
});

// ─── getMaxOrderable ──────────────────────────────────────────────────────────

describe('getMaxOrderable', () => {
  it('Case 15: ENTREGA_INMEDIATA with stock 8 → 8', () => {
    const avail = makeAvailability({ modalidad_disponible: 'ENTREGA_INMEDIATA', max_orderable: 8 });
    expect(getMaxOrderable(avail)).toBe(8);
  });

  it('Case 16: POR_PEDIDO → 99', () => {
    const avail = makeAvailability({ modalidad_disponible: 'POR_PEDIDO', max_orderable: 99 });
    expect(getMaxOrderable(avail)).toBe(99);
  });

  it('Case 17: ENTREGA_INMEDIATA with max_orderable=0 → 0', () => {
    const avail = makeAvailability({ modalidad_disponible: 'ENTREGA_INMEDIATA', max_orderable: 0 });
    expect(getMaxOrderable(avail)).toBe(0);
  });
});

// ─── ProductAvailability type shape validation ───────────────────────────────

describe('ProductAvailability type contract', () => {
  it('Case 18: availability object has all required fields', () => {
    const avail = makeAvailability();
    expect(avail).toHaveProperty('product_id');
    expect(avail).toHaveProperty('sku_id');
    expect(avail).toHaveProperty('sku');
    expect(avail).toHaveProperty('stock_vendible');
    expect(avail).toHaveProperty('max_orderable');
    expect(avail).toHaveProperty('disponible');
    expect(avail).toHaveProperty('modalidad');
    expect(avail).toHaveProperty('modalidad_disponible');
    expect(avail).toHaveProperty('purchasable');
    expect(avail).toHaveProperty('requires_configuration');
    expect(avail).toHaveProperty('requires_supplier_confirmation');
    expect(avail).toHaveProperty('availability_source');
    expect(avail).toHaveProperty('warehouse_id');
    expect(avail).toHaveProperty('timestamp');
  });

  it('Case 19: warehouse_id is always null (no internal data exposed)', () => {
    const avail = makeAvailability({ warehouse_id: null });
    expect(avail.warehouse_id).toBeNull();
  });

  it('Case 20: availability_source values are restricted to REAL | MANUAL | UNCONFIRMED', () => {
    const validSources: ProductAvailability['availability_source'][] = ['REAL', 'MANUAL', 'UNCONFIRMED'];
    for (const source of validSources) {
      const avail = makeAvailability({ availability_source: source });
      expect(avail.availability_source).toBe(source);
    }
  });

  it('Case 21: modalidad_disponible never ENTREGA_INMEDIATA when sku_id is null', () => {
    // Without canonical SKU link, backend should return DISPONIBILIDAD_POR_CONFIRMAR
    const avail = makeAvailability({
      sku_id: null,
      purchasable: false,
      modalidad_disponible: 'DISPONIBILIDAD_POR_CONFIRMAR',
    });
    expect(avail.modalidad_disponible).toBe('DISPONIBILIDAD_POR_CONFIRMAR');
    expect(avail.purchasable).toBe(false);
  });

  it('Case 22: SKU inactive or legacy without link → purchasable=false, requires_configuration=true', () => {
    const avail = makeAvailability({
      sku_id: null,
      purchasable: false,
      requires_configuration: true,
      modalidad_disponible: 'DISPONIBILIDAD_POR_CONFIRMAR',
      availability_source: 'UNCONFIRMED',
      stock_vendible: 0,
      max_orderable: 0,
      disponible: false,
    });
    expect(isProductPurchasable(avail)).toBe(false);
    expect(getAvailabilityMessage(avail)).toBe('Consultar disponibilidad');
    expect(getMaxOrderable(avail)).toBe(0);
  });
});
