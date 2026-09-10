/**
 * store-api/availability.ts
 *
 * WEB-2B.1: Acceso al endpoint público de disponibilidad real.
 * Endpoint: GET /ecommerce/catalogo/{id}/disponibilidad
 *
 * Cache-Control: no-store (respuesta siempre fresca).
 * No requiere autenticación.
 * No expone costos, propietarios, proveedores ni márgenes.
 */

import { storeClient } from './client';
import { StoreError } from './errors';
import type { ProductAvailability, AvailabilityResponse } from './types';
import type { FetchOptions } from './client';

// ─── Fetcher ──────────────────────────────────────────────────────────────────

/**
 * Obtiene la disponibilidad real de un producto por su ID.
 *
 * Usar cuando el usuario abre la página de producto o actualiza cantidad en carrito.
 * No usar en listados — demasiadas requests en paralelo.
 *
 * @param id - ID numérico del producto en ecommerce_products
 * @param options - FetchOptions (AbortSignal, etc.)
 * @returns ProductAvailability con datos siempre frescos del servidor
 */
export async function getProductAvailability(
  id: string | number,
  options?: FetchOptions,
): Promise<ProductAvailability> {
  // Validate ID to prevent path injection
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new StoreError('NOT_FOUND', { detail: `Invalid product ID for availability: ${id}` });
  }

  const raw = await storeClient.get<AvailabilityResponse>(
    `/ecommerce/catalogo/${numericId}/disponibilidad`,
    undefined,
    options,
  );

  // Unwrap envelope
  const avail: ProductAvailability | undefined =
    raw && 'data' in raw && raw.data ? raw.data : undefined;

  if (!avail || typeof avail.product_id === 'undefined') {
    throw new StoreError('MALFORMED_RESPONSE', {
      detail: `No availability data for product ID ${id}`,
    });
  }

  return avail;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determina si un producto puede agregarse al carrito dada su disponibilidad.
 * Usada por ProductCard, ProductPage y CartButton.
 *
 * WEB-2B.1: Strict AND — todos los criterios deben cumplirse:
 * 1. purchasable = true (tiene sku_id válido y modalidad configurada), Y
 * 2. disponible = true (hay stock o es POR_PEDIDO), Y
 * 3. max_orderable > 0 o modalidad != ENTREGA_INMEDIATA, Y
 * 4. DISPONIBILIDAD_POR_CONFIRMAR NUNCA es comprable.
 */
export function isProductPurchasable(avail: ProductAvailability): boolean {
  if (!avail.purchasable) return false;
  if (avail.requires_configuration) return false;
  if (!avail.disponible) return false;
  if (avail.modalidad_disponible === 'DISPONIBILIDAD_POR_CONFIRMAR') return false;
  // For ENTREGA_INMEDIATA: need actual stock
  if (avail.modalidad_disponible === 'ENTREGA_INMEDIATA') {
    const maxOrd = avail.max_orderable;
    if (maxOrd === null || maxOrd <= 0) return false;
  }
  return true;
}

/**
 * Retorna un mensaje de disponibilidad legible para el usuario.
 * No expone datos internos (costos, propietarios, proveedores).
 */
export function getAvailabilityMessage(avail: ProductAvailability): string {
  if (!avail.purchasable || avail.requires_configuration) {
    return 'Consultar disponibilidad';
  }
  switch (avail.modalidad_disponible) {
    case 'ENTREGA_INMEDIATA': {
      const maxOrd = avail.max_orderable;
      if (maxOrd === null || maxOrd === 0) return 'Agotado';
      if (maxOrd <= avail.alerta_stock_minimo) return 'Pocas unidades';
      return 'En stock';
    }
    case 'POR_PEDIDO':
      return 'Disponible por pedido';
    case 'DISPONIBILIDAD_POR_CONFIRMAR':
    default:
      return 'Consultar disponibilidad';
  }
}

/**
 * WEB-2B.1: Retorna el máximo de unidades que el usuario puede ordenar.
 * Para ENTREGA_INMEDIATA: bounded por stock real (number).
 * Para POR_PEDIDO: null (sin techo de stock — política comercial separada).
 * Para DISPONIBILIDAD_POR_CONFIRMAR: null.
 * El frontend decide qué limite de UI usar cuando max_orderable = null.
 */
export function getMaxOrderable(avail: ProductAvailability): number | null {
  return avail.max_orderable;
}
