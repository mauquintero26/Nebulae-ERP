/**
 * cancellation.test.ts
 *
 * Pruebas para la cancelación segura de peticiones (FASE 4 — WEB-2A cierre).
 *
 * Cobertura:
 * 1. Cancelación por nueva búsqueda (abort externo)
 * 2. Cancelación por desmontaje (abort externo)
 * 3. Timeout interno
 * 4. Compatibilidad sin AbortSignal.any() (fallback manual)
 * 5. Diferenciar cancelación intencional de error de red
 * 6. No mostrar error falso al usuario por petición cancelada (isAborted=true)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoreError, fromNetworkError } from '../errors';

// ─── Helper: crear AbortSignal ya abortada ─────────────────────────────────────

function abortedSignal(reason?: unknown): AbortSignal {
  const ctrl = new AbortController();
  ctrl.abort(reason ?? new DOMException('Aborted', 'AbortError'));
  return ctrl.signal;
}

// ─── fromNetworkError — clasificación correcta ────────────────────────────────
// Estos tests no necesitan fetch ni env, solo prueban la clasificación de errores.

describe('fromNetworkError — clasificación correcta', () => {
  it('DOMException AbortError → StoreError ABORTED', () => {
    const err = fromNetworkError(new DOMException('Aborted', 'AbortError'));
    expect(err.code).toBe('ABORTED');
    expect(err.isAborted).toBe(true);
  });

  it('DOMException TimeoutError → StoreError TIMEOUT', () => {
    // TimeoutError es un tipo distinto a AbortError en la implementación actual
    const err = fromNetworkError(new DOMException('Timed out', 'TimeoutError'));
    expect(err.code).toBe('TIMEOUT');
    // TIMEOUT es un subconjunto de abort desde la perspectiva del usuario
    expect(err.isAborted).toBe(true);
  });

  it('TypeError (network error) → StoreError NETWORK_ERROR', () => {
    const err = fromNetworkError(new TypeError('Failed to fetch'));
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.isAborted).toBe(false);
  });

  it('Error genérico → StoreError NETWORK_ERROR (comportamiento actual)', () => {
    // La implementación actual devuelve NETWORK_ERROR para errores genéricos
    const err = fromNetworkError(new Error('Unknown issue'));
    // Aceptar tanto NETWORK_ERROR como UNKNOWN
    expect(['NETWORK_ERROR', 'UNKNOWN']).toContain(err.code);
    expect(err.isAborted).toBe(false);
  });

  it('StoreError se propaga sin modificar (pass-through)', () => {
    const original = new StoreError('NOT_FOUND');
    const err = fromNetworkError(original);
    expect(err).toBe(original);
    expect(err.code).toBe('NOT_FOUND');
  });
});

// ─── StoreError.isAborted — semántica UI ──────────────────────────────────────

describe('StoreError.isAborted — semántica UI', () => {
  it('isAborted=true para ABORTED', () => {
    const err = new StoreError('ABORTED');
    expect(err.isAborted).toBe(true);
  });

  it('isAborted=true para TIMEOUT (timeout también es un tipo de abort para el usuario)', () => {
    const err = new StoreError('TIMEOUT');
    expect(err.isAborted).toBe(true);
  });

  it('isAborted=false para errores reales de red', () => {
    const err = new StoreError('NETWORK_ERROR');
    expect(err.isAborted).toBe(false);
  });

  it('ABORTED no es retryable', () => {
    const err = new StoreError('ABORTED');
    expect(err.isRetryable()).toBe(false);
  });

  it('NETWORK_ERROR sí es retryable', () => {
    const err = new StoreError('NETWORK_ERROR');
    expect(err.isRetryable()).toBe(true);
  });

  it('TIMEOUT sí es retryable', () => {
    const err = new StoreError('TIMEOUT');
    expect(err.isRetryable()).toBe(true);
  });

  it('publicMessage definido para todos los códigos de cancelación', () => {
    const aborted = new StoreError('ABORTED');
    const timeout = new StoreError('TIMEOUT');
    expect(aborted.publicMessage).toBeDefined();
    expect(timeout.publicMessage).toBeDefined();
  });
});

// ─── Integración: storeClient con señales ──────────────────────────────────────
// Estos tests verifican la integración del cliente con las señales de abort.

describe('storeClient — integración con AbortSignal', () => {
  let originalFetch: typeof global.fetch;
  let originalEnv: string | undefined;
  let originalAny: typeof AbortSignal.any;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalEnv = process.env.NEXT_PUBLIC_API_URL;
    originalAny = AbortSignal.any;
    // Configurar URL base para tests de integración
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:9999/api/v1';
    // Resetear módulo para que tome la nueva env
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NEXT_PUBLIC_API_URL = originalEnv;
    AbortSignal.any = originalAny;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('aborta cuando la señal del consumidor se activa — isAborted=true', async () => {
    const { storeClient } = await import('../client');
    const { StoreError: FreshStoreError } = await import('../errors');
    const ctrl = new AbortController();

    let resolveReject: (reason: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(
      new Promise<never>((_resolve, reject) => {
        resolveReject = reject;
      })
    );

    const requestPromise = storeClient.get('/ecommerce/catalogo', {}, { signal: ctrl.signal });

    ctrl.abort();
    resolveReject!(new DOMException('The operation was aborted.', 'AbortError'));

    const error = await requestPromise.catch(e => e);
    // Use duck typing due to module cache isolation with vi.resetModules()
    expect(error).toBeInstanceOf(FreshStoreError);
    expect((error as InstanceType<typeof FreshStoreError>).isAborted).toBe(true);
  });

  it('señal ya abortada antes de hacer fetch → isAborted=true', async () => {
    const { storeClient } = await import('../client');
    const { StoreError: FreshStoreError } = await import('../errors');

    global.fetch = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted.', 'AbortError')
    );

    const signal = abortedSignal();
    const error = await storeClient.get('/ecommerce/catalogo', {}, { signal }).catch(e => e);
    expect(error).toBeInstanceOf(FreshStoreError);
    expect((error as InstanceType<typeof FreshStoreError>).isAborted).toBe(true);
    expect((error as InstanceType<typeof FreshStoreError>).code).toBe('ABORTED');
  });

  it('timeout interno → StoreError con código TIMEOUT o ABORTED', async () => {
    const { storeClient } = await import('../client');
    const { StoreError: FreshStoreError } = await import('../errors');

    global.fetch = vi.fn().mockImplementation(() =>
      new Promise<never>((_, reject) => {
        // El timeout del cliente dispara antes, no este reject
        setTimeout(() => reject(new DOMException('Timeout', 'TimeoutError')), 200);
      })
    );

    const error = await storeClient
      .get('/ecommerce/catalogo', {}, { timeoutMs: 50 })
      .catch(e => e);

    expect(error).toBeInstanceOf(FreshStoreError);
    expect(['ABORTED', 'TIMEOUT']).toContain((error as InstanceType<typeof FreshStoreError>).code);
  });

  it('fallback manual sin AbortSignal.any() — señal del consumidor se respeta', async () => {
    // @ts-expect-error — simular entorno sin AbortSignal.any
    AbortSignal.any = undefined;

    const { storeClient } = await import('../client');
    const { StoreError: FreshStoreError } = await import('../errors');
    const ctrl = new AbortController();

    global.fetch = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted.', 'AbortError')
    );

    ctrl.abort();
    const error = await storeClient.get('/ecommerce/catalogo', {}, { signal: ctrl.signal }).catch(e => e);

    expect(error).toBeInstanceOf(FreshStoreError);
    expect((error as InstanceType<typeof FreshStoreError>).isAborted).toBe(true);
  });
});
