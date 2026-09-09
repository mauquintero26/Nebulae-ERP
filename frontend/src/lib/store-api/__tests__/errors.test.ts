/**
 * Tests for store-api/errors.ts
 */

import { describe, it, expect } from 'vitest';
import {
  StoreError,
  fromHttpStatus,
  fromNetworkError,
  isStoreError,
} from '@/lib/store-api/errors';

describe('StoreError', () => {
  it('creates error with correct code and publicMessage', () => {
    const err = new StoreError('NOT_FOUND');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.publicMessage).toContain('no existe');
    expect(err.isAborted).toBe(false);
    expect(err.name).toBe('StoreError');
  });

  it('creates ABORTED error with isAborted=true', () => {
    const err = new StoreError('ABORTED');
    expect(err.isAborted).toBe(true);
    expect(err.isRetryable()).toBe(false);
  });

  it('isRetryable returns true for network/timeout/server errors', () => {
    expect(new StoreError('NETWORK_ERROR').isRetryable()).toBe(true);
    expect(new StoreError('TIMEOUT').isRetryable()).toBe(true);
    expect(new StoreError('SERVER_ERROR').isRetryable()).toBe(true);
    expect(new StoreError('NOT_FOUND').isRetryable()).toBe(false);
    expect(new StoreError('CONFLICT').isRetryable()).toBe(false);
  });

  it('stores status code when provided', () => {
    const err = new StoreError('NOT_FOUND', { status: 404 });
    expect(err.status).toBe(404);
  });

  it('has a public message that does not expose internal details', () => {
    const err = new StoreError('SERVER_ERROR', { detail: 'DB connection refused at 127.0.0.1' });
    // internal detail is in .message, but publicMessage is user-safe
    expect(err.publicMessage).not.toContain('DB connection');
    expect(err.publicMessage).not.toContain('127.0.0.1');
  });
});

describe('fromHttpStatus', () => {
  it('maps 404 to NOT_FOUND', () => {
    const err = fromHttpStatus(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
  });

  it('maps 409 to CONFLICT', () => {
    const err = fromHttpStatus(409);
    expect(err.code).toBe('CONFLICT');
  });

  it('maps 422 to VALIDATION_ERROR', () => {
    const err = fromHttpStatus(422);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('maps 500, 502, 503 to SERVER_ERROR', () => {
    expect(fromHttpStatus(500).code).toBe('SERVER_ERROR');
    expect(fromHttpStatus(502).code).toBe('SERVER_ERROR');
    expect(fromHttpStatus(503).code).toBe('SERVER_ERROR');
  });

  it('maps unknown status to UNKNOWN', () => {
    expect(fromHttpStatus(418).code).toBe('UNKNOWN');
    expect(fromHttpStatus(429).code).toBe('UNKNOWN');
  });
});

describe('fromNetworkError', () => {
  it('detects AbortError from DOMException', () => {
    const abort = new DOMException('user abort', 'AbortError');
    const err = fromNetworkError(abort);
    expect(err.code).toBe('ABORTED');
    expect(err.isAborted).toBe(true);
  });

  it('detects TimeoutError by name', () => {
    const timeout = new Error('Request timed out');
    timeout.name = 'TimeoutError';
    const err = fromNetworkError(timeout);
    expect(err.code).toBe('TIMEOUT');
  });

  it('wraps generic network errors as NETWORK_ERROR', () => {
    const netErr = new Error('Failed to fetch');
    const err = fromNetworkError(netErr);
    expect(err.code).toBe('NETWORK_ERROR');
  });

  it('wraps unknown errors as NETWORK_ERROR', () => {
    const err = fromNetworkError('some string error');
    expect(err.code).toBe('NETWORK_ERROR');
  });
});

describe('isStoreError', () => {
  it('returns true for StoreError instances', () => {
    expect(isStoreError(new StoreError('NOT_FOUND'))).toBe(true);
  });

  it('returns false for regular errors', () => {
    expect(isStoreError(new Error('regular'))).toBe(false);
    expect(isStoreError(null)).toBe(false);
    expect(isStoreError('string')).toBe(false);
    expect(isStoreError(undefined)).toBe(false);
  });
});
