/**
 * store-api/categories.ts
 *
 * Acceso a categorías y configuración del sitio.
 * Endpoint: GET /ecommerce/categorias, GET /ecommerce/web-builder/config
 */

import { storeClient } from './client';
import type { CategoriasResponse, WebConfigResponse, BackendWebConfig } from './types';
import type { FetchOptions } from './client';
import { normalizeCategories } from '@/lib/categoryTree';
import type { NavNode } from '@/types/store';

// ─── Categories ───────────────────────────────────────────────────────────────

/**
 * Obtiene el árbol de categorías de navegación.
 * Compatible con: array plano, array anidado, respuesta envuelpe con data.
 * Preserva la jerarquía recursiva certificada en WEB-1.
 */
export async function listCategorias(options?: FetchOptions): Promise<NavNode[]> {
  const raw = await storeClient.get<CategoriasResponse>(
    '/ecommerce/categorias',
    undefined,
    options,
  );

  // Handle both array and envelope formats
  const items = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown }).data)
    ? (raw as { data: unknown[] }).data
    : [];

  return normalizeCategories(items);
}

// ─── Site Config ──────────────────────────────────────────────────────────────

/**
 * Obtiene la configuración pública del sitio web.
 * Falla de forma no crítica — el sitio funciona sin configuración.
 */
export async function getSiteConfig(options?: FetchOptions): Promise<BackendWebConfig> {
  const raw = await storeClient.get<WebConfigResponse>(
    '/ecommerce/web-builder/config',
    undefined,
    options,
  );

  // Handle envelope: { status, data: { ... } } or direct object
  if (raw && typeof raw === 'object' && 'data' in raw && raw.data) {
    return raw.data as BackendWebConfig;
  }

  return raw as unknown as BackendWebConfig ?? {};
}
