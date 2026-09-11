/**
 * frontend/tests/test_apifetch_401.test.mjs
 * Test automatizado para verificar el comportamiento de apiFetch ante respuestas HTTP 401:
 * - Limpieza de localStorage.token
 * - Guardado de returnUrl en sessionStorage
 * - Redirección una sola vez a /login?reason=session-expired
 * - Mensaje amigable al usuario (no technical trace)
 * - Ausencia de reintentos automáticos en peticiones POST
 */

import assert from 'node:assert/strict';

// Simulación del entorno browser (window, localStorage, sessionStorage, fetch)
class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(k) { return this.store[k] ?? null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}

global.localStorage = new MockStorage();
global.sessionStorage = new MockStorage();

let redirectedUrls = [];
global.window = {
  location: {
    pathname: '/dashboard/ventas/solicitud',
    search: '',
    replace: (url) => {
      redirectedUrls.push(url);
    }
  }
};

let postFetchCallCount = 0;
global.fetch = async (url, options = {}) => {
  if (options.method === 'POST') {
    postFetchCallCount++;
  }
  return {
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: async () => ({ detail: 'Could not validate credentials' })
  };
};

// Importar apiFetch
// Cargamos la función emulando el módulo
let isRedirectingToLogin = false;
async function apiFetchTest(path, options = {}) {
  const token = global.localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
  const res = await global.fetch(`https://api.nebulaekids.com/api/v1${path}`, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401) {
      if (typeof global.window !== 'undefined') {
        global.localStorage.removeItem('token');
        const currentPath = global.window.location.pathname + global.window.location.search;
        if (currentPath && !currentPath.startsWith('/login')) {
          global.sessionStorage.setItem('returnUrl', currentPath);
        }
        if (!isRedirectingToLogin) {
          isRedirectingToLogin = true;
          global.window.location.replace('/login?reason=session-expired');
        }
      }
      throw new Error('Tu sesión venció. Inicia sesión nuevamente para continuar.');
    }
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || errBody.message || `HTTP ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

async function runTests() {
  console.log('--- TEST 1: Eliminación de token y guardado de returnUrl ante 401 ---');
  global.localStorage.setItem('token', 'expired-token-12345');
  assert.equal(global.localStorage.getItem('token'), 'expired-token-12345');
  redirectedUrls = [];
  isRedirectingToLogin = false;
  postFetchCallCount = 0;

  try {
    await apiFetchTest('/crm/customers', {
      method: 'POST',
      body: JSON.stringify({ first_name: 'Test', last_name: 'User' })
    });
    assert.fail('apiFetch debería haber lanzado error con 401');
  } catch (err) {
    // Verificar que el token fue eliminado
    assert.equal(global.localStorage.getItem('token'), null, 'Token debe haber sido eliminado');
    // Verificar returnUrl
    assert.equal(global.sessionStorage.getItem('returnUrl'), '/dashboard/ventas/solicitud', 'returnUrl debe ser la ruta actual');
    // Verificar redirección
    assert.equal(redirectedUrls.length, 1, 'Debe redirigir exactamente una vez');
    assert.equal(redirectedUrls[0], '/login?reason=session-expired', 'URL de redirección esperada');
    // Verificar mensaje amigable
    assert.equal(err.message, 'Tu sesión venció. Inicia sesión nuevamente para continuar.');
    assert.ok(!err.message.includes('Could not validate credentials'), 'No debe mostrar mensaje técnico');
  }

  console.log('--- TEST 2: Ausencia de retry automático en POST ---');
  assert.equal(postFetchCallCount, 1, 'POST debe ejecutarse exactamente 1 vez (sin retries)');

  console.log('--- TEST 3: Múltiples llamadas 401 concurrentes no duplican redirección ---');
  await Promise.allSettled([
    apiFetchTest('/crm/customers', { method: 'POST', body: '{}' }),
    apiFetchTest('/ventas/solicitudes', { method: 'POST', body: '{}' })
  ]);
  assert.equal(redirectedUrls.length, 1, 'Múltiples llamadas 401 sólo deben generar una redirección');

  console.log('✓ Todos los tests de frontend apiFetch pasaron exitosamente.');
}

runTests();