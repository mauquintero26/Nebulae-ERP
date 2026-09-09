/**
 * store-api/client.ts
 *
 * Cliente HTTP base para el storefront público de Nebulae.
 *
 * Requisitos cumplidos:
 * - URL base desde NEXT_PUBLIC_API_URL (falla visiblemente si no está)
 * - Timeout configurable con AbortController
 * - Errores tipados (StoreError)
 * - Validación de response.ok
 * - NO envía tokens administrativos
 * - NO silencia excepciones
 * - NO hardcodea credenciales ni URLs arbitrarias
 * - NO registra datos personales ni payloads sensibles
 * - Encoding correcto de parámetros
 */

import { StoreError, fromHttpStatus, fromNetworkError } from './errors';
import type { StoreErrorCode } from './errors';

// ─── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 12_000; // 12 seconds

/**
 * Obtiene la URL base del API.
 * Falla visiblemente en producción si NEXT_PUBLIC_API_URL no está configurado.
 */
function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;

  if (!url) {
    // En desarrollo (NODE_ENV=development) usamos localhost como fallback
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:8000/api/v1';
    }
    // En producción, fallo explícito — no usar silenciosamente localhost
    throw new StoreError('CONFIG_MISSING', {
      detail: 'NEXT_PUBLIC_API_URL environment variable is not set. The store cannot function without a valid API URL.',
    });
  }

  return url.replace(/\/$/, ''); // strip trailing slash
}

// ─── Internal fetch wrapper ───────────────────────────────────────────────────

type FetchOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

async function storeGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  options?: FetchOptions,
): Promise<T> {
  const base = getBaseUrl();

  // Build URL with safe query string
  const url = new URL(`${base}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  // Timeout signal (merged with caller's signal if provided)
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);

  // Merge signals
  const signals: AbortSignal[] = [timeoutController.signal];
  if (options?.signal) signals.push(options.signal);
  const combinedSignal = AbortSignal.any
    ? AbortSignal.any(signals)
    : signals[0]; // fallback for older environments

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: combinedSignal,
      headers: {
        Accept: 'application/json',
        // DO NOT include Authorization here — public store endpoints
      },
      cache: 'no-store', // always fresh data
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Try to extract a safe error message from the body
      let detail: string | undefined;
      try {
        const body = await response.json();
        // Log detail for debugging, never expose to user
        detail = typeof body?.detail === 'string' ? body.detail : undefined;
      } catch {
        // ignore parse error
      }
      // Log internal detail (visible in dev console)
      console.warn(`[StoreAPI] HTTP ${response.status} for ${path}`, detail ?? '');
      throw fromHttpStatus(response.status, detail);
    }

    // Parse JSON safely
    let data: T;
    try {
      data = await response.json();
    } catch (parseError) {
      console.warn('[StoreAPI] Malformed response for', path);
      throw new StoreError('MALFORMED_RESPONSE', { cause: parseError });
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof StoreError) throw err;

    // Network / abort / timeout errors
    throw fromNetworkError(err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type { StoreErrorCode };

export const storeClient = {
  /**
   * GET request to the store API.
   * Handles timeout, abort, typed errors, and response validation.
   */
  get: storeGet,

  /**
   * Returns the resolved base URL (useful for debugging).
   * Safe to call — does NOT expose secrets.
   */
  getBaseUrl,
};

export type { FetchOptions };
