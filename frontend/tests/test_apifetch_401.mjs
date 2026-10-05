/**
 * frontend/tests/test_apifetch_401.mjs
 * H23: apiFetch REAL (src/lib/api.ts, Node 24 quita los tipos) ante un 401.
 * (a) Con manejador de reautenticacion (SessionKeeper montado): no redirige; pide la reautenticacion una vez y
 *     reintenta la peticion UNA vez con el token nuevo, devolviendo el JSON del reintento.
 * (b) Dos 401 concurrentes comparten una sola reautenticacion y ambas se reintentan.
 * (c) Si el manejador rechaza (boton 'Salir'), lanza 'Tu sesion vencio...' sin reintentar.
 * (d) Sin manejador (fuera del dashboard): se conserva lo de antes (borra el token, guarda returnUrl, una sola
 *     redireccion a /login?reason=session-expired y el POST no se reintenta).
 * (e) Un reintento que vuelve a dar 401 no entra en bucle (2 llamadas a fetch en total).
 * (f) Los errores que no son 401 no tocan la sesion (ni manejador, ni reintento, ni token).
 * (g) renovarSesion: POST /auth/refresh con fetch directo, una sola peticion en curso, guarda el token con 200;
 *     401, 404, red caida y falta de token no tocan nada.
 * (h) Si el token cambio mientras la peticion estaba en camino (otra peticion re-ingreso o renovo), un 401 se
 *     reintenta UNA vez con el token nuevo sin pedir re-ingreso (con y sin manejador); renovarSesion da 'ok'.
 * (i) login(): el Error lleva el status HTTP (401 -> 401, 500 -> 500); si fetch falla no lleva status.
 * Cada caso importa una instancia nueva del modulo (?caso=...) para no compartir el estado interno.
 */

import assert from 'node:assert/strict';

class MockStorage {
  constructor() { this.store = {}; }
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}

const definirGlobal = (nombre, valor) =>
  Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true });

let redirecciones = [];
definirGlobal('localStorage', new MockStorage());
definirGlobal('sessionStorage', new MockStorage());
definirGlobal('window', {
  location: {
    pathname: '/dashboard/ventas/venta/12',
    search: '?tab=chatter',
    replace: (url) => { redirecciones.push(url); },
  },
});

// fetch simulado: `responder(url, opciones, n)` decide la respuesta de cada llamada; `llamadas` las registra.
let llamadas = [];
let responder = () => respuesta(200, {});
function respuesta(status, cuerpo) {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo };
}
definirGlobal('fetch', async (url, opciones = {}) => {
  llamadas.push({ url, opciones });
  return responder(url, opciones, llamadas.length);
});

const MENSAJE = 'Tu sesión venció. Inicia sesión nuevamente para continuar.';
const autorizacion = (llamada) => llamada.opciones.headers.Authorization;

function reiniciar(token = 'viejo') {
  localStorage.clear();
  sessionStorage.clear();
  if (token) localStorage.setItem('token', token);
  redirecciones = [];
  llamadas = [];
}

// 401 mientras el token sea 'viejo'; con cualquier otro token responde 200 con el JSON indicado.
const r401SiViejo = (cuerpoOk) => (url, opciones) =>
  opciones.headers.Authorization === 'Bearer viejo' ? respuesta(401, { detail: 'Could not validate credentials' })
    : respuesta(200, cuerpoOk);

const cargar = (caso) => import(`../src/lib/api.ts?caso=${caso}`);

console.log('--- TEST a: con manejador, un 401 reautentica una vez y reintenta una vez con el token nuevo ---');
{
  const api = await cargar('a');
  reiniciar();
  let vecesManejador = 0;
  api.registrarReautenticacion(async () => {
    vecesManejador++;
    assert.equal(api.hayReautenticacionPendiente(), true, 'mientras el modal esta abierto hay reautenticacion pendiente');
    localStorage.setItem('token', 'nuevo');
  });
  responder = r401SiViejo({ data: { id: 7, nota: 'guardada' } });

  const cuerpo = JSON.stringify({ texto: 'nota del chatter' });
  const resultado = await api.apiFetch('/ventas/pedidos/12/notas', { method: 'POST', body: cuerpo });

  assert.equal(vecesManejador, 1, 'el manejador se llama una vez');
  assert.deepEqual(redirecciones, [], 'no hay redireccion dentro del dashboard');
  assert.equal(llamadas.length, 2, 'la peticion original y un solo reintento');
  assert.equal(autorizacion(llamadas[0]), 'Bearer viejo');
  assert.equal(autorizacion(llamadas[1]), 'Bearer nuevo', 'el reintento lleva el token nuevo');
  assert.equal(llamadas[1].opciones.method, 'POST');
  assert.equal(llamadas[1].opciones.body, cuerpo, 'el reintento reenvia el mismo body');
  assert.ok(llamadas[1].url.endsWith('/ventas/pedidos/12/notas'));
  assert.equal(resultado.data.nota, 'guardada', 'devuelve el JSON del reintento');
  assert.equal(localStorage.getItem('token'), 'nuevo', 'el token nuevo no se borra');
  assert.equal(sessionStorage.getItem('returnUrl'), null);
  assert.equal(api.hayReautenticacionPendiente(), false, 'al terminar ya no hay reautenticacion pendiente');
}

console.log('--- TEST b: dos 401 concurrentes comparten una reautenticacion y ambas se reintentan ---');
{
  const api = await cargar('b');
  reiniciar();
  let vecesManejador = 0;
  let abrirModal;
  api.registrarReautenticacion(() => {
    vecesManejador++;
    return new Promise((res) => { abrirModal = res; });
  });
  responder = (url, opciones) =>
    opciones.headers.Authorization === 'Bearer viejo' ? respuesta(401, {}) : respuesta(200, { url });

  const p1 = api.apiFetch('/crm/customers', { method: 'POST', body: '{"a":1}' });
  const p2 = api.apiFetch('/ventas/solicitudes', { method: 'POST', body: '{"b":2}' });
  // Esperar a que ambas reciban su 401 y queden esperando el modal.
  for (let i = 0; i < 20 && llamadas.length < 2; i++) await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(llamadas.length, 2);
  assert.equal(vecesManejador, 1, 'un solo modal para las dos peticiones');
  assert.equal(api.hayReautenticacionPendiente(), true);

  localStorage.setItem('token', 'nuevo');
  abrirModal();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(llamadas.length, 4, 'cada una se reintenta una vez');
  assert.ok(r1.url.endsWith('/crm/customers'));
  assert.ok(r2.url.endsWith('/ventas/solicitudes'));
  assert.deepEqual(llamadas.slice(2).map(autorizacion), ['Bearer nuevo', 'Bearer nuevo']);
  assert.deepEqual(redirecciones, []);
  assert.equal(api.hayReautenticacionPendiente(), false);
}

console.log("--- TEST c: si el manejador rechaza ('Salir'), lanza 'Tu sesión venció...' sin reintentar ---");
{
  const api = await cargar('c');
  reiniciar();
  let vecesManejador = 0;
  api.registrarReautenticacion(async () => { vecesManejador++; throw new Error('salir'); });
  responder = () => respuesta(401, { detail: 'Could not validate credentials' });

  await assert.rejects(
    api.apiFetch('/ventas/pedidos/12/notas', { method: 'POST', body: '{}' }),
    (err) => {
      assert.equal(err.message, MENSAJE);
      assert.ok(err instanceof api.SesionVencidaError, 'es una SesionVencidaError');
      assert.equal(err.status, 401);
      return true;
    },
  );
  assert.equal(vecesManejador, 1);
  assert.equal(llamadas.length, 1, 'sin reintento');
  assert.deepEqual(redirecciones, [], 'la redireccion la hace SessionKeeper (Salir), no apiFetch');
  assert.equal(api.hayReautenticacionPendiente(), false);
}

console.log('--- TEST d: sin manejador se conserva la redireccion a /login (una sola vez, sin reintento) ---');
{
  const api = await cargar('d');
  reiniciar('expired-token-12345');
  api.registrarReautenticacion(null);
  responder = () => respuesta(401, { detail: 'Could not validate credentials' });

  await assert.rejects(
    api.apiFetch('/crm/customers', { method: 'POST', body: JSON.stringify({ first_name: 'Test' }) }),
    (err) => {
      assert.equal(err.message, MENSAJE);
      assert.ok(!err.message.includes('Could not validate credentials'), 'sin mensaje tecnico');
      assert.ok(err instanceof api.SesionVencidaError);
      return true;
    },
  );
  assert.equal(localStorage.getItem('token'), null, 'el token se borra');
  assert.equal(sessionStorage.getItem('returnUrl'), '/dashboard/ventas/venta/12?tab=chatter', 'returnUrl con la query');
  assert.deepEqual(redirecciones, ['/login?reason=session-expired']);
  assert.equal(llamadas.length, 1, 'el POST se ejecuta exactamente una vez (sin reintento)');

  await Promise.allSettled([
    api.apiFetch('/crm/customers', { method: 'POST', body: '{}' }),
    api.apiFetch('/ventas/solicitudes', { method: 'POST', body: '{}' }),
  ]);
  assert.equal(redirecciones.length, 1, 'varios 401 solo generan una redireccion');
  assert.equal(llamadas.length, 3, 'ningun POST se reintenta');
  await assert.rejects(api.pedirReautenticacion(), (err) => err instanceof api.SesionVencidaError,
    'sin manejador, pedirReautenticacion rechaza');
}

console.log('--- TEST e: un reintento que vuelve a dar 401 no entra en bucle ---');
{
  const api = await cargar('e');
  reiniciar();
  let vecesManejador = 0;
  api.registrarReautenticacion(async () => { vecesManejador++; localStorage.setItem('token', 'nuevo'); });
  responder = () => respuesta(401, {});

  await assert.rejects(api.apiFetch('/auth/me'), (err) => err.message === MENSAJE && err.status === 401);
  assert.equal(llamadas.length, 2, '2 llamadas a fetch en total');
  assert.equal(vecesManejador, 1);
  assert.deepEqual(redirecciones, [], 'un reintento fallido no redirige');
  assert.equal(localStorage.getItem('token'), 'nuevo');
}

console.log('--- TEST f: los errores que no son 401 no tocan la sesion ---');
{
  const api = await cargar('f');
  reiniciar();
  let vecesManejador = 0;
  api.registrarReautenticacion(async () => { vecesManejador++; });
  responder = () => respuesta(500, { detail: 'Fallo interno' });
  await assert.rejects(api.apiFetch('/ventas/pedidos'), (err) => {
    assert.equal(err.message, 'Fallo interno');
    // C3/R10 (Bloque 2, T1A): el error lleva el status HTTP y el detail del cuerpo (errorDeRespuesta de avisos.js).
    assert.equal(err.status, 500);
    assert.equal(err.detail, 'Fallo interno');
    return true;
  });
  assert.equal(vecesManejador, 0);
  assert.equal(llamadas.length, 1);
  assert.equal(localStorage.getItem('token'), 'viejo');
}

console.log('--- TEST g: renovarSesion usa POST /auth/refresh y guarda el token nuevo ---');
{
  const api = await cargar('g');
  reiniciar();
  responder = () => respuesta(200, { access_token: 'renovado', token_type: 'bearer', expires_in: 86400 });
  const [r1, r2] = await Promise.all([api.renovarSesion(), api.renovarSesion()]);
  assert.equal(r1, 'ok');
  assert.equal(r2, 'ok');
  assert.equal(llamadas.length, 1, 'una sola renovacion en curso');
  assert.ok(llamadas[0].url.endsWith('/auth/refresh'));
  assert.equal(llamadas[0].opciones.method, 'POST');
  assert.equal(autorizacion(llamadas[0]), 'Bearer viejo');
  assert.equal(localStorage.getItem('token'), 'renovado');

  reiniciar();
  responder = () => respuesta(401, {});
  assert.equal(await api.renovarSesion(), 'no-autorizado');
  assert.equal(localStorage.getItem('token'), 'viejo', 'un 401 de la renovacion no borra nada: decide SessionKeeper');

  reiniciar();
  responder = () => respuesta(404, {});
  assert.equal(await api.renovarSesion(), 'error', 'backend sin /auth/refresh: se reintenta en el siguiente ciclo');

  reiniciar();
  responder = () => { throw new TypeError('Failed to fetch'); };
  assert.equal(await api.renovarSesion(), 'error', 'red caida');
  assert.equal(localStorage.getItem('token'), 'viejo');

  reiniciar(null);
  assert.equal(await api.renovarSesion(), 'no-autorizado', 'sin token no hay nada que renovar');
  assert.equal(llamadas.length, 0);
}

// Simula que, mientras la peticion esta en camino, otra peticion re-ingreso o renovo: guarda 'nuevo' y responde 401.
const r401TrasCambiarToken = (cuerpoOk) => (url, opciones) => {
  if (opciones.headers.Authorization === 'Bearer viejo') {
    localStorage.setItem('token', 'nuevo');
    return respuesta(401, {});
  }
  return respuesta(200, cuerpoOk);
};

console.log('--- TEST h: un 401 con el token ya cambiado se reintenta una vez con el nuevo, sin re-ingreso ---');
{
  const api = await cargar('h');
  reiniciar();
  let vecesManejador = 0;
  api.registrarReautenticacion(async () => { vecesManejador++; });
  responder = r401TrasCambiarToken({ data: 'ok' });
  const resultado = await api.apiFetch('/ventas/pedidos/12/notas', { method: 'POST', body: '{"t":1}' });
  assert.equal(resultado.data, 'ok');
  assert.equal(vecesManejador, 0, 'no se abre la ventana: ya hay un token nuevo');
  assert.equal(llamadas.length, 2, 'un solo reintento');
  assert.deepEqual(llamadas.map(autorizacion), ['Bearer viejo', 'Bearer nuevo']);
  assert.equal(llamadas[1].opciones.body, '{"t":1}');
  assert.deepEqual(redirecciones, []);
  assert.equal(api.hayReautenticacionPendiente(), false);

  // Sin manejador (fuera del dashboard) tambien se reintenta antes de redirigir.
  api.registrarReautenticacion(null);
  reiniciar();
  responder = r401TrasCambiarToken({ data: 'ok' });
  assert.equal((await api.apiFetch('/auth/me')).data, 'ok');
  assert.equal(llamadas.length, 2);
  assert.deepEqual(redirecciones, []);
  assert.equal(localStorage.getItem('token'), 'nuevo', 'el token nuevo no se borra');

  // Si el reintento con el token nuevo tambien da 401, no hay un segundo reintento (ni ventana ni bucle).
  api.registrarReautenticacion(async () => { vecesManejador++; });
  reiniciar();
  responder = (url, opciones) => {
    if (opciones.headers.Authorization === 'Bearer viejo') localStorage.setItem('token', 'nuevo');
    return respuesta(401, {});
  };
  await assert.rejects(api.apiFetch('/auth/me'), (err) => err instanceof api.SesionVencidaError);
  assert.equal(llamadas.length, 2);
  assert.equal(vecesManejador, 0);

  // Un token borrado (otra pestana salio) no cuenta como token nuevo: sigue el camino normal (ventana).
  reiniciar();
  responder = (url, opciones) => {
    if (opciones.headers.Authorization === 'Bearer viejo') localStorage.removeItem('token');
    return respuesta(401, {});
  };
  api.registrarReautenticacion(async () => { vecesManejador++; throw new Error('salir'); });
  await assert.rejects(api.apiFetch('/auth/me'), (err) => err instanceof api.SesionVencidaError);
  assert.equal(vecesManejador, 1, 'sin token nuevo se pide re-ingreso');
  assert.equal(llamadas.length, 1);

  // renovarSesion: 401 con el token ya cambiado (otra peticion re-ingreso) es 'ok'.
  reiniciar();
  responder = () => { localStorage.setItem('token', 'nuevo'); return respuesta(401, {}); };
  assert.equal(await api.renovarSesion(), 'ok');
  assert.equal(localStorage.getItem('token'), 'nuevo');
}

console.log('--- TEST i: login() deja el status HTTP en el error ---');
{
  const api = await cargar('i');
  reiniciar(null);
  responder = () => respuesta(401, { detail: 'Incorrect email or password' });
  await assert.rejects(api.login('asesor@nebulae.test', 'x'), (err) => {
    assert.equal(err.status, 401);
    assert.equal(err.message, 'Incorrect email or password', 'el mensaje no cambia');
    return true;
  });
  assert.ok(llamadas[0].url.endsWith('/auth/login'));
  assert.equal(llamadas[0].opciones.method, 'POST');

  responder = () => respuesta(500, { detail: 'Fallo interno' });
  await assert.rejects(api.login('asesor@nebulae.test', 'x'), (err) => err.status === 500);

  responder = () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(api.login('asesor@nebulae.test', 'x'), (err) => {
    assert.ok(err instanceof TypeError);
    assert.equal(err.status, undefined, 'sin respuesta no hay status: la ventana dice que no hubo conexion');
    return true;
  });
}

console.log('✓ Todos los tests de frontend apiFetch pasaron exitosamente.');
