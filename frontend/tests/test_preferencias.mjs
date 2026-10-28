/**
 * frontend/tests/test_preferencias.mjs
 * Bloque 4, T3A (TABLA-base punto 2, R4, C2, RP24 y RP26): lib/preferencias.js es lo ÚNICO que guarda preferencias
 * de pantalla. Clave interna 'pref:{usuarioId}:{clave}', con los cinco ámbitos del servidor (T1B); escrituras
 * agrupadas (800 ms) con un PUT; un solo GET por sesión (precargar); si el PUT falla por la red o un 5xx el valor queda
 * local y se reintenta en el siguiente cambio, y con un 401 o un 422 no se reintenta (console.warn); más de 8 KB en
 * bytes UTF-8 se rechaza sin PUT; sin localStorage (o si lanza) trabaja en memoria.
 * Aquí viven también los casos de almacenamiento que salieron de kanban.js (vista y columnas plegadas), flujo.js
 * (franja compacta) y analisis.js (período y top): esas librerías ya no tocan el almacenamiento (R4).
 * Almacén, servidor y temporizador son falsos: nada sale de la prueba.
 */

import assert from 'node:assert/strict';
import {
  AMBITOS, CLAVE_VALIDA, LIMITE_BYTES, RETARDO_MS, claveValida, claveInterna, tamanoEnBytes, crearPreferencias,
} from '../src/lib/preferencias.js';
import { validarPeriodo, PERIODO_POR_DEFECTO } from '../src/lib/analisis.js';

// Las MISMAS tres claves inválidas de backend/tests/test_preferencias_usuario.py (CLAVES_INVALIDAS, RP24).
const CLAVES_INVALIDAS = ['pantalla:ventas', 'tabla:Ventas', 'tabla:' + 'a'.repeat(81)];

// ─── dobles de prueba ───────────────────────────────────────────────────────────

function almacenFalso(inicial = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => { datos.set(k, String(v)); },
    removeItem: (k) => { datos.delete(k); },
  };
}

const almacenQueLanza = () => ({
  getItem() { throw new Error('SecurityError: modo privado'); },
  setItem() { throw new Error('QuotaExceededError'); },
  removeItem() { throw new Error('SecurityError'); },
});

function relojFalso() {
  let ahora = 0;
  let siguiente = 1;
  let tareas = [];
  return {
    setTimeout(fn, ms) { const id = siguiente++; tareas.push({ id, en: ahora + ms, fn }); return id; },
    clearTimeout(id) { tareas = tareas.filter((t) => t.id !== id); },
    avanzar(ms) {
      ahora += ms;
      for (;;) {
        const vencidas = tareas.filter((t) => t.en <= ahora).sort((a, b) => a.en - b.en);
        if (!vencidas.length) return;
        tareas = tareas.filter((t) => t !== vencidas[0]);
        vencidas[0].fn();
      }
    },
    pendientes: () => tareas.length,
  };
}

function errorConStatus(status) {
  const e = new Error(`HTTP ${status}`);
  e.status = status;
  e.detail = `detalle ${status}`;
  return e;
}

/** guardar(clave, valor) y leer(prefijo) que anotan sus llamadas. `fallas` es una cola: cada PUT toma la primera. */
function servidorFalso({ datos = {}, fallas = [] } = {}) {
  const puts = [];
  const gets = [];
  return {
    puts,
    gets,
    fallas,
    async leer(prefijo) { gets.push(prefijo); return { status: 'success', data: structuredClone(datos) }; },
    async guardar(clave, valor) {
      puts.push({ clave, valor });
      const falla = fallas.shift();
      if (falla) throw falla;
      return { status: 'success', data: { [clave]: valor } };
    },
  };
}

const tic = () => new Promise((r) => setImmediate(r));

// console.warn en silencio (y contado) mientras corre un bloque.
async function conAvisos(fn) {
  const original = console.warn;
  const avisos = [];
  console.warn = (...args) => { avisos.push(args.join(' ')); };
  try { await fn(avisos); } finally { console.warn = original; }
  return avisos;
}

const nueva = (opciones = {}) => {
  const reloj = opciones.temporizador ?? relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen: almacenFalso(), temporizador: reloj, ...opciones });
  return { p, reloj };
};

console.log('--- TEST 1: AMBITOS, claveValida (la expresión del servidor) y la clave interna ---');
{
  assert.deepEqual(AMBITOS, ['tabla', 'vista', 'kanban', 'flujo', 'analisis']);
  assert.ok(Object.isFrozen(AMBITOS));
  assert.equal(CLAVE_VALIDA.source, '^(tabla|vista|kanban|flujo|analisis):[a-z0-9._-]{1,80}$');
  assert.equal(LIMITE_BYTES, 8192);
  assert.equal(RETARDO_MS, 800);
  for (const clave of ['tabla:ventas.hub', 'vista:ventas.hub', 'kanban:compras.pedidos', 'flujo:ventas', 'analisis:ventas',
    'tabla:' + 'a'.repeat(80), 'flujo:a.b_c-9']) {
    assert.equal(claveValida(clave), true, clave);
  }
  for (const clave of [...CLAVES_INVALIDAS, 'tabla:', 'tabla:con espacio', 'tabla:ñandú', 'TABLA:ventas', 'tabla:ventas\n',
    'nebulae.vista.ventas', '', null, undefined, 42]) {
    assert.equal(claveValida(clave), false, JSON.stringify(clave));
  }
  assert.equal(claveInterna(7, 'tabla:x'), 'pref:7:tabla:x');
}

console.log('--- TEST 2: una ráfaga de dos escrituras da UN PUT, con el último valor, a los 800 ms ---');
{
  const servidor = servidorFalso();
  const { p, reloj } = nueva({ servidor });
  assert.equal(p.escribir('tabla:ventas.hub', { tamano: 25 }), true);
  reloj.avanzar(300);
  assert.equal(p.escribir('tabla:ventas.hub', { tamano: 50 }), true);
  assert.deepEqual(p.leer('tabla:ventas.hub'), { tamano: 50 }, 'el valor local cambia de inmediato');
  reloj.avanzar(799);
  await tic();
  assert.equal(servidor.puts.length, 0, 'todavía no: la ráfaga sigue abierta');
  reloj.avanzar(1);
  await tic();
  assert.deepEqual(servidor.puts, [{ clave: 'tabla:ventas.hub', valor: { tamano: 50 } }]);
  reloj.avanzar(5000);
  await tic();
  assert.equal(servidor.puts.length, 1, 'una sola');
  // Escribir lo mismo que ya está guardado no manda otro PUT.
  p.escribir('tabla:ventas.hub', { tamano: 50 });
  reloj.avanzar(800);
  await tic();
  assert.equal(servidor.puts.length, 1);
}

console.log('--- TEST 3: los usuarios 7 y 8 no se pisan ---');
{
  const almacen = almacenFalso();
  const reloj = relojFalso();
  const p7 = crearPreferencias({ usuarioId: 7, almacen, temporizador: reloj });
  const p8 = crearPreferencias({ usuarioId: '8', almacen, temporizador: reloj });
  p7.escribir('vista:ventas.hub', 'kanban');
  p8.escribir('vista:ventas.hub', 'lista');
  assert.equal(p7.leer('vista:ventas.hub'), 'kanban');
  assert.equal(p8.leer('vista:ventas.hub'), 'lista');
  assert.equal(almacen.datos.get('pref:7:vista:ventas.hub'), '"kanban"');
  assert.equal(almacen.datos.get('pref:8:vista:ventas.hub'), '"lista"');
  // Al recargar (otra instancia) cada uno lee lo suyo.
  assert.equal(crearPreferencias({ usuarioId: 7, almacen, temporizador: reloj }).leer('vista:ventas.hub'), 'kanban');
  assert.equal(crearPreferencias({ usuarioId: 9, almacen, temporizador: reloj }).leer('vista:ventas.hub', 'lista'), 'lista');
}

console.log('--- TEST 4: un localStorage que lanza pasa a memoria (y el PUT sigue) ---');
{
  const servidor = servidorFalso();
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen: almacenQueLanza(), servidor, temporizador: reloj });
  assert.deepEqual(p.leer('kanban:ventas.hub', []), [], 'leer no lanza');
  assert.equal(p.escribir('kanban:ventas.hub', ['cancelado']), true, 'escribir no lanza');
  assert.deepEqual(p.leer('kanban:ventas.hub', []), ['cancelado'], 'queda en memoria');
  reloj.avanzar(800);
  await tic();
  assert.deepEqual(servidor.puts, [{ clave: 'kanban:ventas.hub', valor: ['cancelado'] }]);
  // Sin almacén (null): igual en memoria.
  const sin = crearPreferencias({ usuarioId: 7, almacen: null, temporizador: reloj });
  sin.escribir('flujo:ventas', { compacto: true });
  assert.deepEqual(sin.leer('flujo:ventas'), { compacto: true });
}

console.log('--- TEST 5: más de 8 KB (en bytes UTF-8, RP24) se rechaza sin romper y sin PUT ---');
{
  // 'á' ocupa 2 bytes: 4095 de ellas más las comillas dan exactamente 8192 bytes (pasa); 4096 dan 8194 (no pasa),
  // aunque el texto solo tenga 4098 caracteres: medir caracteres dejaría pasar lo que el servidor rechaza con 422.
  const enElBorde = 'á'.repeat(4095);
  const pasado = 'á'.repeat(4096);
  assert.equal(tamanoEnBytes(enElBorde), 8192);
  assert.equal(tamanoEnBytes(pasado), 8194);
  assert.ok(JSON.stringify(pasado).length < 8192, 'por caracteres pasaría');
  const servidor = servidorFalso();
  const { p, reloj } = nueva({ servidor });
  const avisos = await conAvisos(async () => {
    assert.equal(p.escribir('analisis:ventas', { nota: 'a' }), true);
    assert.equal(p.escribir('analisis:ventas', pasado), false, 'se rechaza');
    assert.deepEqual(p.leer('analisis:ventas'), { nota: 'a' }, 'queda el valor anterior');
    assert.equal(p.escribir('analisis:otro', enElBorde), true, 'el borde exacto sí pasa');
    // Lo que no se puede guardar como JSON tampoco rompe.
    const circular = {};
    circular.yo = circular;
    assert.equal(p.escribir('analisis:x', circular), false);
    assert.equal(p.escribir('analisis:x', undefined), false);
    assert.equal(p.escribir('pantalla:ventas', 1), false, 'una clave inválida tampoco');
    reloj.avanzar(800);
    await tic();
  });
  assert.deepEqual(servidor.puts.map((x) => x.clave).sort(), ['analisis:otro', 'analisis:ventas']);
  assert.deepEqual(servidor.puts.find((x) => x.clave === 'analisis:ventas').valor, { nota: 'a' });
  assert.ok(avisos.length >= 4, 'cada rechazo deja un console.warn');
}

console.log('--- TEST 6: precargar llena el caché con UN GET por sesión ---');
{
  const servidor = servidorFalso({
    datos: { 'tabla:ventas.hub': { tamano: 50 }, 'vista:ventas.hub': 'kanban', 'otra:cosa': 1 },
  });
  const { p } = nueva({ servidor });
  assert.equal(p.estaLista(), false, 'con servidor, no está lista hasta la primera precarga');
  p.escribir('vista:ventas.hub', 'lista'); // pendiente: lo local gana sobre lo que trae el GET
  const ok = await p.precargar();
  await p.listo;
  assert.equal(ok, true);
  assert.equal(p.estaLista(), true);
  assert.deepEqual(servidor.gets, ['']);
  assert.deepEqual(p.leer('tabla:ventas.hub'), { tamano: 50 });
  assert.equal(p.leer('vista:ventas.hub'), 'lista', 'un valor pendiente de enviar no lo pisa el servidor');
  assert.equal(p.leer('otra:cosa', 'nada'), 'nada', 'una clave inválida del servidor se ignora');
  await p.precargar('');
  await p.precargar('tabla:');
  assert.deepEqual(servidor.gets, [''], "precargar('') ya cubre todo: no hay otro GET");
  // Con prefijo: solo ese ámbito, y un prefijo más largo ya queda cubierto.
  const s2 = servidorFalso({ datos: { 'tabla:a': 1 } });
  const { p: p2 } = nueva({ servidor: s2 });
  await p2.precargar('tabla:');
  await p2.precargar('tabla:ventas');
  assert.deepEqual(s2.gets, ['tabla:']);
  // El GET acepta también el mapa suelto (sin {status, data}).
  const s3 = { async leer() { return { 'flujo:ventas': { compacto: true } }; }, async guardar() {} };
  const { p: p3 } = nueva({ servidor: s3 });
  await p3.precargar();
  assert.deepEqual(p3.leer('flujo:ventas'), { compacto: true });
  // Si el GET falla: sigue con lo local, queda lista y una precarga posterior lo vuelve a intentar.
  let intentos = 0;
  const s4 = { async leer() { intentos += 1; throw new TypeError('Failed to fetch'); }, async guardar() {} };
  const { p: p4 } = nueva({ servidor: s4 });
  await conAvisos(async () => {
    assert.equal(await p4.precargar(), false);
    await p4.listo;
    assert.equal(p4.estaLista(), true);
    await p4.precargar();
  });
  assert.equal(intentos, 2);
  // Sin servidor: lista desde el principio, sin GET.
  const { p: p5 } = nueva();
  assert.equal(p5.estaLista(), true);
  assert.equal(await p5.precargar(), true);
}

console.log('--- TEST 7: un PUT que falla por la red o con un 5xx queda local y se reintenta en el siguiente cambio ---');
for (const falla of [new TypeError('Failed to fetch'), errorConStatus(503), errorConStatus(500)]) {
  const servidor = servidorFalso({ fallas: [falla] });
  const { p, reloj } = nueva({ servidor });
  await conAvisos(async () => {
    p.escribir('tabla:ventas.hub', { tamano: 50 });
    reloj.avanzar(800);
    await tic();
    assert.equal(servidor.puts.length, 1);
    assert.deepEqual(p.leer('tabla:ventas.hub'), { tamano: 50 }, 'el valor queda local');
    reloj.avanzar(10000);
    await tic();
    assert.equal(servidor.puts.length, 1, 'no se reintenta solo, sin un cambio');
    p.escribir('vista:ventas.hub', 'kanban'); // el siguiente cambio (de otra clave)
    reloj.avanzar(800);
    await tic();
  });
  assert.deepEqual(servidor.puts.slice(1).map((x) => x.clave).sort(), ['tabla:ventas.hub', 'vista:ventas.hub'], String(falla));
  assert.deepEqual(servidor.puts.find((x, i) => i > 0 && x.clave === 'tabla:ventas.hub').valor, { tamano: 50 });
}

console.log('--- TEST 8: con un 422 o un 401 no se reintenta y queda un console.warn ---');
for (const status of [422, 401]) {
  const servidor = servidorFalso({ fallas: [errorConStatus(status)] });
  const { p, reloj } = nueva({ servidor });
  const avisos = await conAvisos(async () => {
    p.escribir('tabla:ventas.hub', { tamano: 50 });
    reloj.avanzar(800);
    await tic();
    p.escribir('vista:ventas.hub', 'kanban');
    reloj.avanzar(800);
    await tic();
  });
  assert.deepEqual(servidor.puts.map((x) => x.clave), ['tabla:ventas.hub', 'vista:ventas.hub'], `${status}: no se reintenta`);
  assert.deepEqual(p.leer('tabla:ventas.hub'), { tamano: 50 }, `${status}: el valor queda local`);
  assert.ok(avisos.some((a) => a.includes('tabla:ventas.hub') && a.includes(String(status))), avisos.join(' | '));
}

console.log('--- TEST 9: un cambio mientras el PUT está en camino no se pierde (y no se cruzan) ---');
{
  const enCamino = [];
  const servidor = {
    puts: [],
    async leer() { return {}; },
    guardar(clave, valor) {
      servidor.puts.push({ clave, valor });
      return new Promise((resolver) => enCamino.push(resolver));
    },
  };
  const { p, reloj } = nueva({ servidor });
  p.escribir('tabla:x', { v: 1 });
  reloj.avanzar(800);
  await tic();
  assert.equal(servidor.puts.length, 1);
  p.escribir('tabla:x', { v: 2 });
  reloj.avanzar(800);
  await tic();
  assert.equal(servidor.puts.length, 1, 'el segundo PUT espera a que termine el primero');
  enCamino.shift()();
  await tic();
  await tic();
  assert.deepEqual(servidor.puts.map((x) => x.valor), [{ v: 1 }, { v: 2 }]);
  enCamino.shift()();
  await tic();
}

console.log('--- TEST 10: escribirParte (RP26): tamano y anchos escritos por separado en tabla:x conviven ---');
{
  const servidor = servidorFalso();
  const { p, reloj } = nueva({ servidor });
  assert.equal(p.escribirParte('tabla:x', { tamano: 50 }), true);
  assert.equal(p.escribirParte('tabla:x', { version: 1, anchos: { cli: 200 }, orden: ['num', 'cli'], ocultas: [] }), true);
  assert.deepEqual(p.leer('tabla:x'), { tamano: 50, version: 1, anchos: { cli: 200 }, orden: ['num', 'cli'], ocultas: [] });
  p.escribirParte('tabla:x', { tamano: 25 });
  assert.deepEqual(p.leer('tabla:x'), { tamano: 25, version: 1, anchos: { cli: 200 }, orden: ['num', 'cli'], ocultas: [] });
  reloj.avanzar(800);
  await tic();
  assert.deepEqual(servidor.puts, [{ clave: 'tabla:x', valor: p.leer('tabla:x') }], 'un solo PUT con todo');
  // Si lo guardado no es un objeto, la parte arranca de cero.
  p.escribir('tabla:y', ['viejo']);
  p.escribirParte('tabla:y', { tamano: 50 });
  assert.deepEqual(p.leer('tabla:y'), { tamano: 50 });
}

console.log('--- TEST 11: sin un usuario válido trabaja solo en memoria y no hace PUT ---');
for (const usuarioId of [null, undefined, 0, Number.NaN, 'abc', -3, 1.5]) {
  const almacen = almacenFalso();
  const servidor = servidorFalso();
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId, almacen, servidor, temporizador: reloj });
  assert.equal(p.usuarioId, null);
  assert.equal(p.escribir('vista:ventas.hub', 'kanban'), true);
  assert.equal(p.leer('vista:ventas.hub'), 'kanban');
  reloj.avanzar(800);
  await p.precargar();
  await tic();
  assert.equal(almacen.datos.size, 0, `${String(usuarioId)}: no toca el almacén`);
  assert.deepEqual([servidor.puts.length, servidor.gets.length], [0, 0], `${String(usuarioId)}: ni el servidor`);
  assert.equal(p.estaLista(), true);
}

console.log('--- TEST 12: leer devuelve una copia y vaciar() manda lo pendiente ya ---');
{
  const servidor = servidorFalso();
  const { p, reloj } = nueva({ servidor });
  p.escribir('tabla:x', { anchos: { cli: 200 } });
  const leido = p.leer('tabla:x');
  leido.anchos.cli = 999;
  assert.deepEqual(p.leer('tabla:x'), { anchos: { cli: 200 } }, 'mutar lo leído no cambia lo guardado');
  await p.vaciar();
  assert.equal(servidor.puts.length, 1, 'vaciar no espera los 800 ms');
  reloj.avanzar(800);
  await tic();
  assert.equal(servidor.puts.length, 1, 'y cancela el temporizador');
  assert.equal(reloj.pendientes(), 0);
}

// ─── Casos de almacenamiento que salieron de kanban.js, flujo.js y analisis.js (R4) ───────────

console.log('--- TEST 13 (de kanban.js): vista:<pantalla> y kanban:<pantalla> (plegadas) ---');
{
  const reloj = relojFalso();
  // Ida y vuelta.
  const almacen = almacenFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, temporizador: reloj });
  p.escribir('vista:compras.pedidos', 'kanban');
  p.escribir('kanban:compras.pedidos', ['recibido', 'cancelado']);
  const recargada = crearPreferencias({ usuarioId: 7, almacen, temporizador: reloj });
  assert.equal(recargada.leer('vista:compras.pedidos', 'lista'), 'kanban');
  assert.deepEqual(recargada.leer('kanban:compras.pedidos', []), ['recibido', 'cancelado']);
  // porDefecto sin lanzar en tres casos: almacén que lanza, almacén null y JSON dañado.
  const casos = [
    crearPreferencias({ usuarioId: 7, almacen: almacenQueLanza(), temporizador: reloj }),
    crearPreferencias({ usuarioId: 7, almacen: null, temporizador: reloj }),
    crearPreferencias({
      usuarioId: 7, temporizador: reloj,
      almacen: almacenFalso({ 'pref:7:vista:compras.pedidos': '{malo', 'pref:7:kanban:compras.pedidos': '[1,' }),
    }),
  ];
  for (const prefs of casos) {
    assert.equal(prefs.leer('vista:compras.pedidos', 'lista'), 'lista');
    assert.deepEqual(prefs.leer('kanban:compras.pedidos', []), []);
    assert.equal(prefs.escribir('vista:compras.pedidos', 'kanban'), true, 'guardar tampoco lanza');
  }
  // Las claves viejas de KANBAN ('nebulae.vista.*') ya no son preferencias.
  assert.equal(claveValida('nebulae.kanban.plegadas.ventas'), false);
}

console.log('--- TEST 14 (de flujo.js): flujo:<id> (franja compacta) ---');
{
  const reloj = relojFalso();
  const almacen = almacenFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, temporizador: reloj });
  assert.deepEqual(p.leer('flujo:ventas', { compacto: false }), { compacto: false });
  p.escribir('flujo:ventas', { compacto: true });
  assert.deepEqual(crearPreferencias({ usuarioId: 7, almacen, temporizador: reloj }).leer('flujo:ventas'), { compacto: true });
  const dañado = crearPreferencias({ usuarioId: 7, temporizador: reloj, almacen: almacenFalso({ 'pref:7:flujo:ventas': 'tru' }) });
  assert.deepEqual(dañado.leer('flujo:ventas', { compacto: false }), { compacto: false });
}

console.log('--- TEST 15 (de analisis.js): analisis:<modulo> (período, top y foco) ---');
{
  const reloj = relojFalso();
  const DEFECTO = { periodo: PERIODO_POR_DEFECTO, top: 5 };
  // Lo que hace PanelAnalisis (T5C) con lo leído: un período que ya no vale vuelve al de por defecto.
  const leerAnalisis = (prefs) => {
    const v = prefs.leer('analisis:ventas', DEFECTO);
    const periodo = validarPeriodo(v?.periodo, '2026-10-28') ?? PERIODO_POR_DEFECTO;
    return { periodo, top: [5, 10, 25].includes(v?.top) ? v.top : 5 };
  };
  // Almacén vacío, JSON dañado y un getItem que lanza → {periodo: {clave: '30d'}, top: 5}.
  for (const almacen of [almacenFalso(), almacenFalso({ 'pref:7:analisis:ventas': '{"periodo":' }), almacenQueLanza()]) {
    assert.deepEqual(leerAnalisis(crearPreferencias({ usuarioId: 7, almacen, temporizador: reloj })), {
      periodo: { clave: '30d' }, top: 5,
    });
  }
  // Con un personalizado válido, lo devuelve; uno que ya no vale (fecha futura) vuelve a 30 días.
  const almacen = almacenFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, temporizador: reloj });
  const personalizado = { clave: 'personalizado', desde: '2026-09-01', hasta: '2026-09-30' };
  p.escribir('analisis:ventas', { periodo: personalizado, top: 10, foco: 'cot' });
  assert.deepEqual(leerAnalisis(crearPreferencias({ usuarioId: 7, almacen, temporizador: reloj })), { periodo: personalizado, top: 10 });
  p.escribir('analisis:ventas', { periodo: { clave: 'personalizado', desde: '2026-10-01', hasta: '2026-12-31' }, top: 7 });
  assert.deepEqual(leerAnalisis(p), { periodo: { clave: '30d' }, top: 5 });
  // Guardar con un setItem que lanza no lanza nada.
  const conFalla = crearPreferencias({ usuarioId: 7, almacen: almacenQueLanza(), temporizador: reloj });
  assert.equal(conFalla.escribir('analisis:ventas', { periodo: { clave: '7d' }, top: 25 }), true);
}

console.log('✓ lib/preferencias.js: ámbitos, ráfagas, usuarios, memoria, 8 KB, precarga, reintentos y escribirParte.');
