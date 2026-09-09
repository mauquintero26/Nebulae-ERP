/**
 * store-api/errors.ts
 *
 * Jerarquía de errores tipados y públicamente seguros para el storefront.
 * Los mensajes expuestos al usuario NO revelan información técnica del servidor.
 * Los mensajes de log (solo en consola del desarrollador) pueden incluir detalles.
 */

// ─── Error codes ──────────────────────────────────────────────────────────────

export type StoreErrorCode =
  | 'NETWORK_ERROR'        // No se pudo conectar al servidor
  | 'TIMEOUT'              // Solicitud superó el límite de tiempo
  | 'ABORTED'              // Solicitud cancelada intencionalmente
  | 'NOT_FOUND'            // 404 — recurso no existe
  | 'CONFLICT'             // 409 — conflicto (ej. stock agotado)
  | 'VALIDATION_ERROR'     // 422 — datos inválidos
  | 'SERVER_ERROR'         // 5xx — error interno del servidor
  | 'MALFORMED_RESPONSE'   // La respuesta no tiene la forma esperada
  | 'CONFIG_MISSING'       // NEXT_PUBLIC_API_URL no está configurado
  | 'UNKNOWN';             // Error no clasificado

// ─── Public messages (user-facing) ────────────────────────────────────────────

const PUBLIC_MESSAGES: Record<StoreErrorCode, string> = {
  NETWORK_ERROR:       'No pudimos conectar con el servidor. Verifica tu conexión.',
  TIMEOUT:             'La solicitud tardó demasiado. Intenta de nuevo.',
  ABORTED:             'Solicitud cancelada.',
  NOT_FOUND:           'El recurso solicitado no existe.',
  CONFLICT:            'No hay suficiente disponibilidad para completar esta acción.',
  VALIDATION_ERROR:    'Los datos enviados no son válidos.',
  SERVER_ERROR:        'Ocurrió un error en el servidor. Intenta más tarde.',
  MALFORMED_RESPONSE:  'Respuesta inesperada del servidor.',
  CONFIG_MISSING:      'La tienda no está configurada correctamente. Contacta al administrador.',
  UNKNOWN:             'Ocurrió un error inesperado.',
};

// ─── StoreError class ─────────────────────────────────────────────────────────

export class StoreError extends Error {
  readonly code: StoreErrorCode;
  /** Message safe for displaying to end users */
  readonly publicMessage: string;
  /** HTTP status (if applicable) */
  readonly status?: number;
  /** Whether the operation was intentionally cancelled (AbortController) */
  readonly isAborted: boolean;

  constructor(
    code: StoreErrorCode,
    options?: {
      /** Internal detail (logged, NOT shown to users) */
      detail?: string;
      status?: number;
      cause?: unknown;
    },
  ) {
    const publicMessage = PUBLIC_MESSAGES[code];
    super(options?.detail ?? publicMessage);
    this.name = 'StoreError';
    this.code = code;
    this.publicMessage = publicMessage;
    this.status = options?.status;
    this.isAborted = code === 'ABORTED';
    if (options?.cause && this instanceof Error) {
      this.cause = options.cause;
    }
  }

  /** Whether the error is safe to show to the user as a retry candidate */
  isRetryable(): boolean {
    return this.code === 'NETWORK_ERROR' ||
           this.code === 'TIMEOUT' ||
           this.code === 'SERVER_ERROR';
  }
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

export function fromHttpStatus(status: number, detail?: string): StoreError {
  if (status === 404) return new StoreError('NOT_FOUND', { status, detail });
  if (status === 409) return new StoreError('CONFLICT', { status, detail });
  if (status === 422) return new StoreError('VALIDATION_ERROR', { status, detail });
  if (status >= 500)  return new StoreError('SERVER_ERROR', { status, detail });
  return new StoreError('UNKNOWN', { status, detail });
}

export function fromNetworkError(cause: unknown): StoreError {
  if (cause instanceof DOMException && cause.name === 'AbortError') {
    return new StoreError('ABORTED', { cause });
  }
  if (cause instanceof Error && cause.name === 'TimeoutError') {
    return new StoreError('TIMEOUT', { cause });
  }
  return new StoreError('NETWORK_ERROR', {
    detail: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

export function isStoreError(err: unknown): err is StoreError {
  return err instanceof StoreError;
}
