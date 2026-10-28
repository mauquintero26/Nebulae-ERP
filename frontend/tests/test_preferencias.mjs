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
  AMBITOS, CLAVE_VALIDA, LIMITE_BYTES, RETARDO_MS, MAXIMO_NIVELES, claveValida, claveInterna, tamanoEnBytes, pasaDeNiveles,
  crearPreferencias, normalizarUsuario, crearPreferenciasPorUsuario, vincularPreferencia,
  usuarioDelToken, usuarioDeSesion, servidorDeUsuario, crearPreferenciasDeSesion,
} from '../src/lib/preferencias.js';
import { validarPeriodo, PERIODO_POR_DEFECTO } from '../src/lib/analisis.js';
import {
  actualizadorColumnas, reconciliarColumnas, guardarCambioColumnas, escriturasDeAccion, estadoTablaInicial, reducirEstadoTabla,
} from '../src/lib/tabla.js';

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

// ─── r1 ─────────────────────────────────────────────────────────────────────────

/** Un servidor cuyo GET y cuyos PUT se contestan a mano: resolver(valor) o rechazar(error). */
function servidorAMano() {
  const gets = [];
  const puts = [];
  return {
    gets,
    puts,
    leer(prefijo) {
      return new Promise((resolver, rechazar) => gets.push({ prefijo, resolver, rechazar }));
    },
    guardar(clave, valor) {
      return new Promise((resolver, rechazar) => puts.push({ clave, valor, resolver, rechazar }));
    },
  };
}

console.log('--- TEST 16 (r1, punto 1): la precarga no pisa un valor que ya salió en un PUT ---');
{
  // (A) El PUT de {a:2} sale y responde bien; DESPUÉS llega el GET con el {a:1} viejo del servidor.
  const servidor = servidorAMano();
  const almacen = almacenFalso();
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, servidor, temporizador: reloj });
  const precarga = p.precargar('');
  await tic();
  assert.equal(servidor.gets.length, 1);
  p.escribir('tabla:x', { a: 2 });
  reloj.avanzar(800);
  await tic();
  assert.equal(servidor.puts.length, 1);
  servidor.puts[0].resolver({ status: 'success' });
  await tic();
  servidor.gets[0].resolver({ status: 'success', data: { 'tabla:x': { a: 1 }, 'tabla:y': { b: 1 } } });
  await precarga;
  assert.deepEqual(p.leer('tabla:x'), { a: 2 }, '(A) en memoria queda lo que escribió el usuario');
  assert.equal(almacen.datos.get('pref:7:tabla:x'), '{"a":2}', '(A) y en el almacén');
  assert.deepEqual(p.leer('tabla:y'), { b: 1 }, 'lo que no se tocó sí llega del servidor');
  assert.deepEqual(servidor.puts.map((x) => x.valor), [{ a: 2 }], '(A) ningún PUT con {a:1}');
}
{
  // (B) El PUT de {a:2} falla por la red DESPUÉS de que llegó el GET con {a:1}; el siguiente cambio lo reintenta.
  const servidor = servidorAMano();
  const almacen = almacenFalso();
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, servidor, temporizador: reloj });
  const precarga = p.precargar('');
  await tic();
  p.escribir('tabla:x', { a: 2 });
  reloj.avanzar(800);
  await tic();
  assert.equal(servidor.puts.length, 1, 'el PUT está en camino');
  servidor.gets[0].resolver({ status: 'success', data: { 'tabla:x': { a: 1 } } });
  await precarga;
  assert.deepEqual(p.leer('tabla:x'), { a: 2 }, '(B) el GET no pisa un PUT en camino');
  await conAvisos(async () => {
    servidor.puts[0].rechazar(new TypeError('Failed to fetch'));
    await tic();
    await tic();
    p.escribir('vista:x', 'kanban'); // el siguiente cambio
    reloj.avanzar(800);
    await tic();
    await tic();
  });
  const dex = servidor.puts.filter((x) => x.clave === 'tabla:x');
  assert.deepEqual(dex.map((x) => x.valor), [{ a: 2 }, { a: 2 }], '(B) el reintento sube {a:2}, nunca {a:1}');
  assert.deepEqual(p.leer('tabla:x'), { a: 2 }, '(B) en memoria');
  assert.equal(almacen.datos.get('pref:7:tabla:x'), '{"a":2}', '(B) y en el almacén');
  for (const put of servidor.puts) put.resolver({ status: 'success' });
  await tic();
}

console.log('--- TEST 17 (r1, punto 4a): más de 32 niveles anidados se rechaza, como en el servidor ---');
{
  const anidado = (n) => { let v = 1; for (let i = 0; i < n; i += 1) v = i % 2 ? { x: v } : [v]; return v; };
  assert.equal(MAXIMO_NIVELES, 32);
  assert.equal(pasaDeNiveles(1), false, 'un escalar tiene 0 niveles');
  assert.equal(pasaDeNiveles([1]), false);
  assert.equal(pasaDeNiveles(anidado(32)), false, '32 niveles pasan');
  assert.equal(pasaDeNiveles(anidado(33)), true, '33 no');
  assert.equal(pasaDeNiveles(anidado(5000)), true, 'miles de niveles: recorrido iterativo, sin desbordar la pila');
  const servidor = servidorFalso();
  const almacen = almacenFalso();
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, servidor, temporizador: reloj });
  const avisos = await conAvisos(async () => {
    assert.equal(p.escribir('tabla:ok', anidado(32)), true);
    assert.equal(p.escribir('tabla:hondo', anidado(33)), false);
    assert.equal(p.escribirParte('tabla:parte', { anchos: anidado(32) }), false, 'con la parte, el objeto suma un nivel');
    reloj.avanzar(800);
    await tic();
  });
  assert.ok(!almacen.datos.has('pref:7:tabla:hondo') && !almacen.datos.has('pref:7:tabla:parte'), 'no toca el almacén');
  assert.deepEqual(servidor.puts.map((x) => x.clave), ['tabla:ok'], 'ni hace PUT');
  assert.ok(avisos.some((a) => a.includes('demasiados niveles anidados (máximo 32)')), avisos.join(' | '));
  // r2 (punto 3): los niveles se miden sobre el JSON que recibe el servidor.
  const circular = {};
  circular.yo = circular;
  let conFecha = new Date('2026-10-28T00:00:00Z');
  for (let i = 0; i < 32; i += 1) conFecha = [conFecha];
  const avisos2 = await conAvisos(async () => {
    assert.equal(p.escribir('tabla:circular', circular), false);
    assert.equal(p.escribir('tabla:fecha', conFecha), true, '32 arreglos con un Date en el fondo pasan: en el JSON es un texto');
  });
  assert.ok(avisos2.some((a) => a.includes('tabla:circular') && a.includes('no se puede guardar como JSON')), avisos2.join(' | '));
  assert.ok(!avisos2.some((a) => a.includes('demasiados niveles')), avisos2.join(' | '));
}

console.log('--- TEST 18 (r1, punto 4b): cerrar() descarta lo pendiente y deja la instancia muda ---');
{
  const servidor = servidorFalso();
  const almacen = almacenFalso();
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, servidor, temporizador: reloj });
  p.escribir('tabla:x', { tamano: 50 });
  p.cerrar();
  reloj.avanzar(800);
  await tic();
  assert.equal(servidor.puts.length, 0, 'escribir, cerrar y avanzar 800 ms: ningún PUT');
  assert.equal(reloj.pendientes(), 0, 'el temporizador se canceló');
  assert.equal(p.escribir('tabla:z', 1), false, 'después de cerrar, escribir devuelve false');
  assert.equal(p.escribirParte('tabla:z', { a: 1 }), false);
  assert.ok(!almacen.datos.has('pref:7:tabla:z'), 'y no hace nada');
  assert.equal(await p.precargar(''), false, 'ni trae nada del servidor');
  await p.vaciar();
  reloj.avanzar(800);
  await tic();
  assert.deepEqual([servidor.puts.length, servidor.gets.length], [0, 0]);
  // Un PUT que ya estaba en camino y falla después de cerrar no se reintenta (iría con la sesión de otro usuario).
  const aMano = servidorAMano();
  const reloj2 = relojFalso();
  const q = crearPreferencias({ usuarioId: 7, almacen: almacenFalso(), servidor: aMano, temporizador: reloj2 });
  q.escribir('tabla:x', { a: 1 });
  reloj2.avanzar(800);
  await tic();
  assert.equal(aMano.puts.length, 1);
  q.cerrar();
  await conAvisos(async () => {
    aMano.puts[0].rechazar(new TypeError('Failed to fetch'));
    await tic();
    await tic();
    q.escribir('tabla:y', 2);
    reloj2.avanzar(800);
    await q.vaciar();
    await tic();
  });
  assert.equal(aMano.puts.length, 1, 'ningún reintento después de cerrar');
}
{
  // r2 (punto 2): una precarga en vuelo que responde después de cerrar() no escribe nada.
  const servidor = servidorAMano();
  const almacen = almacenFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, servidor, temporizador: relojFalso() });
  const precarga = p.precargar('');
  await tic();
  assert.equal(servidor.gets.length, 1, 'el GET salió');
  p.cerrar();
  servidor.gets[0].resolver({ status: 'success', data: { 'tabla:x': { a: 1 }, 'vista:x': 'kanban' } });
  assert.equal(await precarga, false, 'la precarga que responde después de cerrar devuelve false');
  assert.equal(almacen.datos.size, 0, 'el almacén queda sin cambios');
  assert.equal(p.leer('tabla:x'), undefined, 'y leer no ve lo que trajo el GET');
}
{
  // Un cerrar() en el mismo tic que precargar no deja salir el GET.
  const servidor = servidorAMano();
  const p = crearPreferencias({ usuarioId: 7, almacen: almacenFalso(), servidor, temporizador: relojFalso() });
  const precarga = p.precargar('');
  p.cerrar();
  await tic();
  // Se mira antes de esperar la promesa: si el GET saliera, el servidor a mano no contesta nunca.
  assert.equal(servidor.gets.length, 0, 'ningún GET');
  assert.equal(await precarga, false);
}
{
  // cerrar() resuelve listo: nadie queda esperando para siempre.
  const p = crearPreferencias({ usuarioId: 7, almacen: almacenFalso(), servidor: servidorAMano(), temporizador: relojFalso() });
  assert.equal(p.estaLista(), false);
  p.cerrar();
  const quien = await Promise.race([p.listo.then(() => 'listo'), tic().then(() => 'colgado')]);
  assert.equal(quien, 'listo');
  assert.equal(p.estaLista(), true);
}

// ─── T4A: la instancia de la app por usuario y el vínculo de los hooks (RP25, RP26 y D35) ──────────────────────────

console.log('--- TEST 19 (T4A, RP25): normalizarUsuario (el user_id de AuthGuard) ---');
{
  const casos = [
    ['7', 7], [7, 7], [' 8 ', 8], ['0', null], [0, null], ['', null], [null, null], [undefined, null], ['abc', null],
    ['7.5', null], ['-3', null], [Number.NaN, null], ['null', null], ['undefined', null],
  ];
  for (const [entrada, esperado] of casos) assert.equal(normalizarUsuario(entrada), esperado, JSON.stringify(entrada));
  // crearPreferencias usa la misma regla: sin un id válido no toca el almacén ni hace PUT ni GET.
  for (const invalido of ['0', 'abc', '7.5', '']) {
    const servidor = servidorFalso();
    const almacen = almacenFalso();
    const reloj = relojFalso();
    const p = crearPreferencias({ usuarioId: invalido, almacen, servidor, temporizador: reloj });
    assert.equal(p.usuarioId, null, JSON.stringify(invalido));
    p.escribir('vista:x', 'kanban');
    reloj.avanzar(800);
    await p.precargar('');
    assert.deepEqual([almacen.datos.size, servidor.puts.length, servidor.gets.length], [0, 0, 0], JSON.stringify(invalido));
  }
}

console.log('--- TEST 20 (T4A, RP25 y D35): una instancia por usuario; al cambiar, cerrar() la vieja ANTES de crear la nueva ---');
{
  const eventos = [];
  const servidores = new Map();
  const almacen = almacenFalso(); // localStorage es uno solo para todos los usuarios del equipo
  const reloj = relojFalso();
  let usuario = '7';
  const gestor = crearPreferenciasPorUsuario({
    leerUsuario: () => usuario,
    crear: (usuarioId) => {
      eventos.push(`crear:${usuarioId}`);
      const servidor = servidorFalso({ datos: { 'vista:x': `de ${usuarioId}` } });
      servidores.set(usuarioId, servidor);
      const p = crearPreferencias({ usuarioId, almacen, servidor, temporizador: reloj });
      return { ...p, cerrar: () => { eventos.push(`cerrar:${usuarioId}`); p.cerrar(); } };
    },
  });
  const avisados = [];
  const quitar = gestor.alCambiar((instancia) => avisados.push(instancia.usuarioId));
  assert.deepEqual(eventos, [], 'crear el gestor no lee el usuario ni crea nada');

  const a = gestor.obtener();
  assert.equal(a.usuarioId, 7);
  assert.equal(gestor.obtener(), a, 'el mismo usuario: la misma instancia');
  await tic();
  assert.deepEqual(servidores.get(7).gets, [''], "la instancia nueva hace precargar(''): un solo GET por sesión");
  await a.listo;
  assert.equal(a.leer('vista:x'), 'de 7');
  assert.deepEqual(avisados, [7]);

  // Un cambio del usuario 7 queda pendiente (su PUT sale a los 800 ms)...
  a.escribir('vista:x', 'kanban');
  // ...y entra otro usuario (AuthGuard escribió otro user_id).
  usuario = '8';
  const b = gestor.obtener();
  assert.notEqual(b, a);
  assert.equal(b.usuarioId, 8);
  assert.deepEqual(eventos, ['crear:7', 'cerrar:7', 'crear:8'], 'D35: cerrar() de la vieja ANTES de crear la nueva');
  assert.deepEqual(avisados, [7, 8], 'avisa a quien escucha');
  reloj.avanzar(800);
  await tic();
  assert.equal(servidores.get(7).puts.length, 0, 'el PUT pendiente del usuario 7 no sale con la sesión del 8');
  assert.equal(a.escribir('vista:x', 'lista'), false, 'la instancia vieja queda muda');
  assert.deepEqual(servidores.get(8).gets, ['']);
  await b.listo;
  assert.equal(b.leer('vista:x'), 'de 8', 'cada usuario lee lo suyo');
  assert.equal(almacen.datos.get('pref:7:vista:x'), '"kanban"', 'lo local del 7 queda en su clave interna');

  // Sin un id válido: solo memoria, sin PUT ni GET (RP25). Volver a un id válido crea otra instancia.
  usuario = null;
  const c = gestor.obtener();
  assert.equal(c.usuarioId, null);
  assert.deepEqual(eventos.slice(3), ['cerrar:8', 'crear:null']);
  c.escribir('vista:x', 'lista');
  reloj.avanzar(800);
  await tic();
  assert.deepEqual([servidores.get(null).puts.length, servidores.get(null).gets.length], [0, 0]);
  assert.ok(![...almacen.datos.keys()].some((k) => k.startsWith('pref:null')), "nada de 'pref:null:…' en el almacén");
  usuario = '0';
  assert.equal(gestor.obtener(), c, "'0' tampoco es un usuario: sigue la misma instancia en memoria");
  quitar();
  usuario = '7';
  const d = gestor.obtener();
  assert.notEqual(d, a, 'el usuario 7 que vuelve tiene una instancia nueva');
  assert.deepEqual(eventos.slice(5), ['cerrar:null', 'crear:7']);
  assert.deepEqual(avisados, [7, 8, null], 'quitar() deja de avisar');
  await d.listo;
}
{
  // Leer user_id puede lanzar (localStorage bloqueado): cuenta como sin usuario. Un oyente que lanza no rompe obtener().
  let lanza = false;
  const creados = [];
  const gestor = crearPreferenciasPorUsuario({
    leerUsuario: () => { if (lanza) throw new Error('SecurityError'); return '7'; },
    crear: (usuarioId) => { const p = crearPreferencias({ usuarioId, almacen: almacenFalso() }); creados.push(p); return p; },
  });
  gestor.alCambiar(() => { throw new Error('oyente roto'); });
  const avisos = await conAvisos(async () => {
    assert.equal(gestor.obtener().usuarioId, 7);
    lanza = true;
    assert.equal(gestor.obtener().usuarioId, null);
  });
  assert.equal(creados.length, 2);
  assert.ok(avisos.length >= 1, 'el oyente roto deja un console.warn');
}

console.log('--- TEST 21 (T4A, D35): el vínculo de un hook no escribe nada antes de listo ---');
{
  const servidor = servidorAMano();
  const almacen = almacenFalso();
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, servidor, temporizador: reloj });
  const precarga = p.precargar('');
  const publicados = [];
  const v = vincularPreferencia({
    obtener: () => p, clave: 'vista:ventas.hub', porDefecto: 'lista', alCambiar: (e) => publicados.push(e),
  });
  assert.deepEqual(v.estado(), { valor: 'lista', listo: false }, 'hasta listo, el valor por defecto en memoria');
  assert.equal(publicados.length, 0, 'crear el vínculo no publica nada');
  reloj.avanzar(800);
  await tic();
  assert.deepEqual([almacen.datos.size, servidor.puts.length], [0, 0], 'al montar no se escribe nada, ni el valor por defecto');
  servidor.gets[0].resolver({ status: 'success', data: { 'vista:ventas.hub': 'kanban' } });
  await precarga;
  await tic();
  assert.deepEqual(v.estado(), { valor: 'kanban', listo: true }, 'con listo, lo guardado');
  assert.deepEqual(publicados, [{ valor: 'kanban', listo: true }]);
  reloj.avanzar(800);
  await tic();
  assert.equal(servidor.puts.length, 0, 'leer lo del servidor no escribe');
  v.guardar('lista');
  assert.deepEqual(v.estado(), { valor: 'lista', listo: true });
  assert.equal(almacen.datos.get('pref:7:vista:ventas.hub'), '"lista"', 'después de listo se escribe de inmediato en local');
  reloj.avanzar(800);
  await tic();
  assert.deepEqual(servidor.puts.map((x) => [x.clave, x.valor]), [['vista:ventas.hub', 'lista']]);
  v.guardar((anterior) => (anterior === 'lista' ? 'kanban' : 'lista'));
  assert.equal(v.estado().valor, 'kanban', 'guardar acepta una función del valor anterior');
}
{
  // Lo que el usuario elige antes de listo se ve en memoria y se escribe recién con listo: gana sobre lo del servidor.
  const servidor = servidorAMano();
  const almacen = almacenFalso();
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, servidor, temporizador: reloj });
  const precarga = p.precargar('');
  const v = vincularPreferencia({ obtener: () => p, clave: 'vista:x', porDefecto: 'lista', alCambiar: () => {} });
  v.guardar('kanban');
  assert.deepEqual(v.estado(), { valor: 'kanban', listo: false });
  reloj.avanzar(800);
  await tic();
  assert.deepEqual([almacen.datos.size, servidor.puts.length], [0, 0], 'antes de listo no toca el almacén ni hace PUT');
  servidor.gets[0].resolver({ status: 'success', data: { 'vista:x': 'lista' } });
  await precarga;
  await tic();
  assert.deepEqual(v.estado(), { valor: 'kanban', listo: true });
  assert.equal(almacen.datos.get('pref:7:vista:x'), '"kanban"');
  reloj.avanzar(800);
  await tic();
  assert.deepEqual(servidor.puts.map((x) => [x.clave, x.valor]), [['vista:x', 'kanban']]);
}

console.log('--- TEST 22 (T4A, RP26 y D35): en modo parte, escribirParte solo con listo y las partes conviven ---');
{
  const servidor = servidorAMano();
  const almacen = almacenFalso();
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, servidor, temporizador: reloj });
  const precarga = p.precargar('');
  const columnas = vincularPreferencia({
    obtener: () => p, clave: 'tabla:x', porDefecto: { anchos: {} }, parte: true, alCambiar: () => {},
  });
  const tamano = vincularPreferencia({
    obtener: () => p, clave: 'tabla:x', porDefecto: { tamano: 25 }, parte: true, alCambiar: () => {},
  });
  tamano.guardar({ tamano: 50 });
  assert.deepEqual(tamano.estado(), { valor: { tamano: 50 }, listo: false });
  reloj.avanzar(800);
  await tic();
  assert.deepEqual([almacen.datos.size, servidor.puts.length], [0, 0], 'la parte no se escribe antes de listo (mezclaría con {})');
  // El servidor trae los anchos que se guardaron en otro equipo.
  servidor.gets[0].resolver({ status: 'success', data: { 'tabla:x': { anchos: { num: 120 }, orden: ['num'] } } });
  await precarga;
  await tic();
  assert.deepEqual(JSON.parse(almacen.datos.get('pref:7:tabla:x')), { anchos: { num: 120 }, orden: ['num'], tamano: 50 },
    'la parte pendiente se mezcla con lo del servidor');
  assert.deepEqual(tamano.estado(), { valor: { tamano: 50, anchos: { num: 120 }, orden: ['num'] }, listo: true });
  assert.deepEqual(columnas.estado().valor.anchos, { num: 120 }, 'el otro dueño lee lo guardado, con su valor por defecto debajo');
  columnas.guardar({ anchos: { num: 200 } });
  reloj.avanzar(800);
  await tic();
  assert.deepEqual(servidor.puts.map((x) => x.valor), [{ anchos: { num: 200 }, orden: ['num'], tamano: 50 }],
    'un solo PUT y cada parte conserva la otra');
  // Sin nada guardado, el valor es el por defecto; con solo la otra parte guardada, la propia sale del valor por defecto.
  const p2 = crearPreferencias({ usuarioId: 7, almacen: almacenFalso({ 'pref:7:tabla:z': '{"anchos":{"a":1}}' }) });
  const vacio = vincularPreferencia({ obtener: () => p2, clave: 'tabla:y', porDefecto: { tamano: 25 }, parte: true, alCambiar: () => {} });
  const otra = vincularPreferencia({ obtener: () => p2, clave: 'tabla:z', porDefecto: { tamano: 25 }, parte: true, alCambiar: () => {} });
  await tic();
  assert.deepEqual(vacio.estado(), { valor: { tamano: 25 }, listo: true });
  assert.deepEqual(otra.estado(), { valor: { tamano: 25, anchos: { a: 1 } }, listo: true });
}

console.log('--- TEST 23 (T4A, RP25 y D35): el vínculo cambia de instancia cuando cambia el usuario ---');
{
  let usuario = '7';
  const reloj = relojFalso();
  const almacen = almacenFalso();
  const servidores = {};
  const gestor = crearPreferenciasPorUsuario({
    leerUsuario: () => usuario,
    crear: (usuarioId) => {
      servidores[usuarioId] = servidorAMano();
      return crearPreferencias({ usuarioId, almacen, servidor: servidores[usuarioId], temporizador: reloj });
    },
  });
  const publicados = [];
  const v = vincularPreferencia({
    obtener: gestor.obtener, clave: 'flujo:ventas', porDefecto: false, alCambiar: (e) => publicados.push(e),
  });
  await tic();
  servidores[7].gets[0].resolver({ status: 'success', data: {} });
  await tic();
  await tic();
  assert.deepEqual(v.estado(), { valor: false, listo: true });
  v.guardar(true); // el usuario 7 oculta el flujo: su PUT queda pendiente
  usuario = '8';
  v.revisarUsuario();
  assert.deepEqual(v.estado(), { valor: false, listo: false }, 'vuelve al valor por defecto hasta que el usuario 8 esté listo');
  assert.deepEqual(publicados.at(-1), { valor: false, listo: false });
  reloj.avanzar(800);
  await tic();
  assert.equal(servidores[7].puts.length, 0, 'el PUT pendiente del 7 se descartó');
  servidores[8].gets[0].resolver({ status: 'success', data: { 'flujo:ventas': { compacto: true } } });
  await tic();
  await tic();
  assert.deepEqual(v.estado(), { valor: { compacto: true }, listo: true }, 'lee lo del usuario 8');
  assert.equal(almacen.datos.has('pref:8:flujo:ventas'), true);
  v.revisarUsuario();
  assert.deepEqual(v.estado(), { valor: { compacto: true }, listo: true }, 'el mismo usuario: nada cambia');

  // Si el usuario cambia y el hook guarda sin enterarse antes, el valor no va ni al 8 ni al 9: se resincroniza.
  usuario = '9';
  v.guardar({ compacto: false });
  assert.deepEqual(v.estado(), { valor: false, listo: false });
  reloj.avanzar(800);
  await tic();
  assert.deepEqual([servidores[8].puts.length, servidores[9].puts.length], [0, 0]);
  assert.equal(almacen.datos.has('pref:9:flujo:ventas'), false);
  assert.equal(almacen.datos.get('pref:8:flujo:ventas'), '{"compacto":true}', 'lo del 8 no cambió');
  servidores[9].gets[0].resolver({ status: 'success', data: {} });
  await tic();
  await tic();
  assert.deepEqual(v.estado(), { valor: false, listo: true }, 'tampoco queda pendiente para el 9');
  reloj.avanzar(800);
  await tic();
  assert.equal(almacen.datos.has('pref:9:flujo:ventas'), false);
  assert.equal(servidores[9].puts.length, 0);
}
{
  // El usuario cambia ANTES de que la primera instancia esté lista: su GET tardío no publica nada del usuario viejo.
  let usuario = '7';
  const servidores = {};
  const gestor = crearPreferenciasPorUsuario({
    leerUsuario: () => usuario,
    crear: (usuarioId) => {
      servidores[usuarioId] = servidorAMano();
      return crearPreferencias({ usuarioId, almacen: almacenFalso(), servidor: servidores[usuarioId], temporizador: relojFalso() });
    },
  });
  const publicados = [];
  const v = vincularPreferencia({ obtener: gestor.obtener, clave: 'vista:x', porDefecto: 'lista', alCambiar: (e) => publicados.push(e) });
  await tic();
  v.guardar('kanban'); // antes de listo: queda en memoria, sin escribir
  usuario = '8';
  v.revisarUsuario();
  assert.deepEqual(v.estado(), { valor: 'lista', listo: false }, 'lo elegido en la pantalla del 7 se descarta');
  servidores[7].gets[0].resolver({ status: 'success', data: { 'vista:x': 'kanban' } });
  await tic();
  await tic();
  assert.deepEqual(publicados.map((e) => e.valor), ['kanban', 'lista'], 'nada del usuario 7 después del cambio');
  assert.deepEqual(v.estado(), { valor: 'lista', listo: false });
  await tic();
  servidores[8].gets[0].resolver({ status: 'success', data: {} });
  await tic();
  await tic();
  assert.deepEqual(v.estado(), { valor: 'lista', listo: true });
  assert.equal(gestor.obtener().leer('vista:x'), undefined, 'lo pendiente del 7 no se escribió en el 8');
}

console.log('--- TEST 24 (T4A): validar y soltar ---');
{
  const esModo = (x) => x === 'lista' || x === 'kanban';
  const p = crearPreferencias({ usuarioId: 7, almacen: almacenFalso({ 'pref:7:vista:x': '"tablero"', 'pref:7:vista:y': '"kanban"' }) });
  const x = vincularPreferencia({ obtener: () => p, clave: 'vista:x', porDefecto: 'lista', validar: esModo, alCambiar: () => {} });
  const y = vincularPreferencia({ obtener: () => p, clave: 'vista:y', porDefecto: 'lista', validar: esModo, alCambiar: () => {} });
  await tic();
  assert.deepEqual(x.estado(), { valor: 'lista', listo: true }, 'un valor guardado que no vale da el valor por defecto');
  assert.deepEqual(y.estado(), { valor: 'kanban', listo: true });
  const publicados = [];
  const p2 = crearPreferencias({ usuarioId: 7, almacen: almacenFalso() });
  const w = vincularPreferencia({ obtener: () => p2, clave: 'vista:z', porDefecto: 'lista', alCambiar: (e) => publicados.push(e) });
  w.soltar();
  await tic();
  w.guardar('kanban');
  w.revisarUsuario();
  assert.equal(publicados.length, 0, 'suelto (el componente se desmontó), no publica');
  assert.equal(p2.leer('vista:z'), undefined, 'ni escribe');
}

// ─── T4A r1: las preferencias atadas al usuario del TOKEN (punto 1) ─────────────────────────────────────────────────

/** Un JWT de prueba (sin firma real) con el sub del usuario, como el que firma backend/app/api/v1/auth.py:89. */
const jwt = (sub, extra = {}) =>
  `h.${Buffer.from(JSON.stringify({ sub: String(sub), exp: 4102444800, ...extra })).toString('base64url')}.firma`;
const subDe = (token) => (token ? Number(JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sub) : null);

console.log('--- TEST 25 (T4A r1, punto 1): el usuario de las preferencias es el del token; nada de B en la cuenta de A ---');
{
  // usuarioDelToken y usuarioDeSesion: el user_id de AuthGuard vale SOLO si es el sub del token vigente.
  assert.equal(usuarioDelToken(jwt(7)), 7);
  assert.equal(usuarioDelToken(null), null);
  assert.equal(usuarioDelToken('basura'), null);
  assert.equal(usuarioDelToken(jwt('abc')), null);
  assert.equal(usuarioDelToken(`h.${Buffer.from('{"exp":1}').toString('base64url')}.f`), null, 'sin sub');
  assert.equal(usuarioDeSesion(jwt(7), '7'), 7);
  assert.equal(usuarioDeSesion(jwt(8), '7'), null, 'el user_id viejo de otro usuario no vale');
  assert.equal(usuarioDeSesion(null, '7'), null, 'sin token, sin usuario');
  assert.equal(usuarioDeSesion(jwt(7), null), null, 'sin user_id todavía (AuthGuard no lo escribió)');
  assert.equal(usuarioDeSesion(jwt(7), '0'), null);
}
{
  // El servidor de una instancia comprueba ANTES de cada GET y de cada PUT que el token sigue siendo de su usuario.
  let token = jwt(7);
  const pedidas = [];
  const pedir = async (ruta, opciones = {}) => { pedidas.push({ sub: subDe(token), ruta, opciones }); return { status: 'success', data: {} }; };
  const s = servidorDeUsuario({ usuarioId: 7, leerToken: () => token, pedir });
  await s.leer('');
  await s.leer('tabla:');
  await s.guardar('vista:ventas.hub', 'kanban');
  assert.deepEqual(pedidas.map((x) => [x.ruta, x.opciones.method ?? 'GET']), [
    ['/preferencias', 'GET'], ['/preferencias?prefijo=tabla%3A', 'GET'], ['/preferencias/vista%3Aventas.hub', 'PUT'],
  ]);
  assert.deepEqual(JSON.parse(pedidas[2].opciones.body), { valor: 'kanban' });
  assert.ok(pedidas.every((x) => x.opciones.sinReintento401 === true), 'ninguna se reintenta con otro token tras un 401');
  token = jwt(8);
  for (const llamada of [() => s.leer(''), () => s.guardar('vista:x', 'lista')]) {
    await assert.rejects(llamada(), (e) => {
      assert.equal(e.status, 409, 'un error que preferencias.js no reintenta');
      assert.equal(e.otroUsuario, true);
      return true;
    });
  }
  token = null;
  await assert.rejects(s.guardar('vista:x', 'lista'), (e) => e.status === 409);
  // Leer el token puede lanzar (localStorage bloqueado): cuenta como sin token y el error sigue sin ser de red.
  const lanza = servidorDeUsuario({ usuarioId: 7, leerToken: () => { throw new Error('SecurityError'); }, pedir });
  await assert.rejects(lanza.guardar('vista:x', 'lista'), (e) => e.status === 409 && e.otroUsuario === true);
  assert.equal(pedidas.length, 3, 'con el token de otro (o sin token) no sale nada');
}
{
  // Un PUT pendiente de A cuando el token cambia a B sin que nadie llame a obtener(): no sale y no se reintenta.
  const ls = new Map([['token', jwt(7)], ['user_id', '7']]);
  const almacen = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); } };
  const pedidas = [];
  const pedir = async (ruta, opciones = {}) => {
    pedidas.push({ sub: subDe(ls.get('token')), metodo: opciones.method ?? 'GET', ruta });
    return { status: 'success', data: {} };
  };
  const reloj = relojFalso();
  const gestor = crearPreferenciasDeSesion({
    leerToken: () => ls.get('token') ?? null, leerUserId: () => ls.get('user_id') ?? null, leerAlmacen: () => almacen, pedir,
    temporizador: reloj,
  });
  const a = gestor.obtener();
  await a.listo;
  a.escribir('vista:x', 'kanban');
  ls.set('token', jwt(8));
  const avisos = await conAvisos(async () => {
    reloj.avanzar(800);
    await tic();
    a.escribir('vista:y', 'lista');
    reloj.avanzar(800);
    await tic();
  });
  assert.deepEqual(pedidas, [{ sub: 7, metodo: 'GET', ruta: '/preferencias' }], 'ningún PUT con el token de B');
  assert.ok(avisos.some((t) => t.includes('vista:x') && t.includes('409')), avisos.join(' | '));
}
{
  // La secuencia de dos pestañas de la revisión (sim_token_userid.mjs): el servidor falso escribe en la cuenta del TOKEN.
  const ls = new Map(); // localStorage, compartido por las pestañas
  const almacen = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); } };
  const cuentas = { 7: {}, 8: { 'tabla:ventas.hub': { anchos: { cli: 333 }, ocultas: ['est'] } } };
  const pedidas = [];
  const pedir = async (ruta, opciones = {}) => {
    const sub = subDe(ls.get('token') ?? null);
    const metodo = opciones.method ?? 'GET';
    pedidas.push({ sub, metodo, ruta, valor: opciones.body ? JSON.parse(opciones.body).valor : undefined, sin401: opciones.sinReintento401 });
    if (sub === null) throw errorConStatus(401);
    if (metodo === 'GET') return { status: 'success', data: structuredClone(cuentas[sub]) };
    cuentas[sub][decodeURIComponent(ruta.split('/').pop())] = JSON.parse(opciones.body).valor;
    return { status: 'success', data: {} };
  };
  const reloj = relojFalso();
  const gestor = crearPreferenciasDeSesion({
    leerToken: () => ls.get('token') ?? null, leerUserId: () => ls.get('user_id') ?? null, leerAlmacen: () => almacen, pedir,
    temporizador: reloj,
  });
  const CLAVE = 'tabla:ventas.hub';
  const nadaDeB = (paso) => {
    assert.ok(!String(ls.get(`pref:7:${CLAVE}`) ?? '').includes('333'), `${paso}: nada de B en pref:7`);
    assert.ok(!JSON.stringify(cuentas[7]).includes('333'), `${paso}: nada de B en la cuenta de A`);
  };
  const v = vincularPreferencia({ obtener: gestor.obtener, clave: CLAVE, porDefecto: { tamano: 25 }, parte: true, alCambiar: () => {} });
  const quitar = gestor.alCambiar(() => v.revisarUsuario());
  const enOtraPestana = async (clave, valor) => {
    if (valor === null) ls.delete(clave); else ls.set(clave, valor);
    v.revisarUsuario(); // el evento storage de la otra pestaña
    await tic();
    await tic();
  };
  await conAvisos(async () => {
    // 1. A (7) tiene sesión y escribe (su PUT queda pendiente).
    ls.set('token', jwt(7));
    ls.set('user_id', '7');
    v.revisarUsuario();
    await tic();
    await tic();
    assert.equal(gestor.obtener().usuarioId, 7);
    v.guardar({ tamano: 50 });
    nadaDeB('paso 1');
    // 2. En otra pestaña se cierra la sesión (Sidebar quita el token; nadie quita user_id).
    await enOtraPestana('token', null);
    assert.equal(gestor.obtener().usuarioId, null, 'sin token: solo memoria');
    reloj.avanzar(800);
    await tic();
    nadaDeB('paso 2');
    // 3. Entra B (8): llega su token con el user_id todavía en '7'.
    await enOtraPestana('token', jwt(8));
    assert.equal(gestor.obtener().usuarioId, null, "token de 8 con user_id '7': no hay usuario hasta que AuthGuard escriba el de B");
    reloj.avanzar(800);
    await tic();
    nadaDeB('paso 3');
    // 4. AuthGuard escribe el user_id de B.
    await enOtraPestana('user_id', '8');
    assert.equal(gestor.obtener().usuarioId, 8);
    assert.deepEqual(v.estado().valor.anchos, { cli: 333 }, 'B ve lo suyo');
    nadaDeB('paso 4');
    // 5. A vuelve a entrar en este equipo y cambia el tamaño.
    ls.set('token', jwt(7));
    await enOtraPestana('user_id', '7');
    assert.equal(gestor.obtener().usuarioId, 7);
    assert.equal(v.estado().valor.anchos, undefined, 'A no ve las columnas de B');
    v.guardar({ tamano: 75 });
    reloj.avanzar(800);
    await tic();
    await tic();
    nadaDeB('paso 5');
  });
  quitar();
  // Ninguna petición salió con el token de un usuario distinto al de la instancia que la hizo: con el token de 8 solo
  // el GET de la instancia de 8 (paso 4), y con el de 7 solo las de las instancias de 7.
  assert.deepEqual(pedidas.map((x) => [x.sub, x.metodo]), [[7, 'GET'], [8, 'GET'], [7, 'GET'], [7, 'PUT']]);
  assert.ok(pedidas.every((x) => x.sin401 === true));
  assert.deepEqual(pedidas[3].valor, { tamano: 75 }, 'el primer escribirParte de A al volver no sube nada de B');
  assert.deepEqual(cuentas[7], { [CLAVE]: { tamano: 75 } });
  assert.deepEqual(cuentas[8], { [CLAVE]: { anchos: { cli: 333 }, ocultas: ['est'] } }, 'la cuenta de B no se tocó');
}

console.log('--- TEST 26 (T4A r1, punto 2): con la precarga fallida, una parte no se sube sobre una copia vieja ---');
{
  let fallarGet = true;
  const gets = [];
  const puts = [];
  const servidor = {
    async leer(prefijo) {
      gets.push(prefijo);
      if (fallarGet) throw new TypeError('Failed to fetch');
      return { status: 'success', data: { 'tabla:x': { anchos: { num: 120 }, orden: ['num'] } } };
    },
    async guardar(clave, valor) { puts.push({ clave, valor }); return { status: 'success' }; },
  };
  const COPIA_VIEJA = '{"orden":["viejo"],"tamano":25}';
  const almacen = almacenFalso({ 'pref:7:tabla:x': COPIA_VIEJA });
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, servidor, temporizador: reloj });
  await conAvisos(async () => {
    assert.equal(await p.precargar(''), false);
    assert.equal(p.estaLista(), true, 'listo se resuelve también si el GET falló');
    // Primera parte: queda solo en memoria, sin PUT, y dispara UNA nueva precarga.
    assert.equal(p.escribirParte('tabla:x', { tamano: 50 }), true);
    assert.deepEqual(p.leer('tabla:x'), { orden: ['viejo'], tamano: 50 }, 'se ve en memoria');
    reloj.avanzar(800);
    await tic();
    await tic();
    assert.equal(puts.length, 0, 'sin PUT: la copia local puede no tener las partes que hay en el servidor');
    assert.equal(almacen.datos.get('pref:7:tabla:x'), COPIA_VIEJA, 'ni toca el almacén');
    assert.deepEqual(gets, ['', ''], 'una sola nueva precarga por escritura');
    await tic();
    await tic();
    assert.equal(gets.length, 2, 'sin bucle: la precarga que vuelve a fallar no se reintenta sola');
    // Segunda parte, ahora con el GET funcionando: la precarga sale bien y las partes van sobre lo del servidor.
    fallarGet = false;
    assert.equal(p.escribirParte('tabla:x', { ocultas: ['est'] }), true);
    await tic();
    await tic();
    assert.equal(gets.length, 3);
    reloj.avanzar(800);
    await tic();
  });
  assert.deepEqual(puts, [{ clave: 'tabla:x', valor: { anchos: { num: 120 }, orden: ['num'], tamano: 50, ocultas: ['est'] } }],
    'un PUT con lo del servidor más las dos partes (sin la copia vieja)');
  assert.deepEqual(JSON.parse(almacen.datos.get('pref:7:tabla:x')), puts[0].valor);
  // Ya con una precarga buena, una parte se sube como siempre (sin otro GET).
  p.escribirParte('tabla:x', { tamano: 25 });
  reloj.avanzar(800);
  await tic();
  assert.equal(gets.length, 3);
  assert.deepEqual(puts.at(-1).valor, { anchos: { num: 120 }, orden: ['num'], tamano: 25, ocultas: ['est'] });
}
{
  // Un valor completo sí sube con la precarga fallida (reemplaza la clave entera) y también pide una nueva precarga.
  const gets = [];
  const puts = [];
  const servidor = {
    async leer(prefijo) { gets.push(prefijo); throw new TypeError('Failed to fetch'); },
    async guardar(clave, valor) { puts.push({ clave, valor }); return {}; },
  };
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen: almacenFalso(), servidor, temporizador: reloj });
  await conAvisos(async () => {
    await p.precargar('');
    assert.equal(p.escribir('vista:x', 'kanban'), true);
    reloj.avanzar(800);
    await tic();
    await tic();
  });
  assert.deepEqual(puts, [{ clave: 'vista:x', valor: 'kanban' }]);
  assert.deepEqual(gets, ['', '']);
  // Sin precarga intentada (lo de siempre): una parte sube sin pedir GET.
  const s2 = servidorFalso();
  const r2 = relojFalso();
  const q = crearPreferencias({ usuarioId: 7, almacen: almacenFalso(), servidor: s2, temporizador: r2 });
  q.escribirParte('tabla:z', { tamano: 50 });
  r2.avanzar(800);
  await tic();
  assert.deepEqual([s2.gets.length, s2.puts.length], [0, 1]);
  // cerrar() descarta las partes en espera.
  const s3 = { async leer() { throw new TypeError('Failed to fetch'); }, async guardar() { throw new Error('no debería'); } };
  const w = crearPreferencias({ usuarioId: 7, almacen: almacenFalso(), servidor: s3, temporizador: relojFalso() });
  await conAvisos(async () => {
    await w.precargar('');
    w.escribirParte('tabla:x', { tamano: 50 });
    w.cerrar();
    await tic();
  });
  assert.equal(w.leer('tabla:x'), undefined, 'lo que esperaba ya no se ve');
}

console.log('--- TEST 27 (T4A r2, punto 1): guardar tras un cambio de sesión que el hook no vio, con el oyente de usePreferencia ---');
{
  // La reentrada de la revisión (sec-4a-r1/reentrada_guardar.mjs): obtener() dentro de guardar crea la instancia de B y
  // avisa al oyente (usePreferencia.ts registra gestor.alCambiar(() => v.revisarUsuario())), que enlaza la nueva antes
  // de que guardar compare. Lo armado con los datos de A no debe quedar en B.
  const ls = new Map([['token', jwt(7)], ['user_id', '7']]);
  const almacen = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); } };
  const cuentas = { 7: { 'tabla:x': { anchos: { a: 'AAA' } } }, 8: { 'tabla:x': { anchos: { b: 'BBB' } } } };
  const puts = [];
  const pedir = async (ruta, opciones = {}) => {
    const sub = subDe(ls.get('token') ?? null);
    if ((opciones.method ?? 'GET') === 'GET') return { status: 'success', data: structuredClone(cuentas[sub]) };
    puts.push({ sub, ruta, valor: JSON.parse(opciones.body).valor });
    cuentas[sub][decodeURIComponent(ruta.split('/').pop())] = JSON.parse(opciones.body).valor;
    return { status: 'success', data: {} };
  };
  const reloj = relojFalso();
  const gestor = crearPreferenciasDeSesion({
    leerToken: () => ls.get('token') ?? null, leerUserId: () => ls.get('user_id') ?? null, leerAlmacen: () => almacen, pedir,
    temporizador: reloj,
  });
  const v = vincularPreferencia({ obtener: gestor.obtener, clave: 'tabla:x', porDefecto: {}, parte: true, alCambiar: () => {} });
  const quitar = gestor.alCambiar(() => v.revisarUsuario()); // como usePreferencia.ts
  for (let i = 0; i < 4; i += 1) await tic();
  const mostrado = v.estado().valor;
  assert.deepEqual(mostrado.anchos, { a: 'AAA' }, 'la pantalla muestra lo de A');
  // La sesión pasa de 7 a 8 sin eventos (esta pestaña no llamó a obtener() en medio).
  ls.set('token', jwt(8));
  ls.set('user_id', '8');
  // La pantalla arma la parte con lo que muestra (no con la forma funcional).
  v.guardar({ anchos: { ...mostrado.anchos, nueva: 120 } });
  assert.equal(gestor.obtener().usuarioId, 8);
  assert.equal(v.estado().listo, false, 'el vínculo pasó a la instancia de B y espera su precarga');
  for (let i = 0; i < 4; i += 1) await tic();
  reloj.avanzar(800);
  for (let i = 0; i < 4; i += 1) await tic();
  quitar();
  assert.deepEqual(puts, [], 'no sale ningún PUT');
  assert.ok(!String(ls.get('pref:8:tabla:x') ?? '').includes('AAA'), `nada de A en pref:8: ${ls.get('pref:8:tabla:x')}`);
  assert.deepEqual(cuentas[8], { 'tabla:x': { anchos: { b: 'BBB' } } }, 'la cuenta de B no se tocó');
  assert.deepEqual(v.estado(), { valor: { anchos: { b: 'BBB' } }, listo: true }, 'la pantalla pasa a mostrar lo de B');
  // Ya enlazado a B, el siguiente guardar sí escribe (en la cuenta de B).
  v.guardar({ tamano: 50 });
  reloj.avanzar(800);
  for (let i = 0; i < 4; i += 1) await tic();
  assert.deepEqual(puts.map((x) => [x.sub, x.valor]), [[8, { anchos: { b: 'BBB' }, tamano: 50 }]]);
}

console.log('--- TEST 28 (T4A r2, punto 2): una parte en espera que no cabe con lo del servidor queda en memoria ---');
{
  let fallarGet = true;
  const puts = [];
  const servidor = {
    async leer() {
      if (fallarGet) throw new TypeError('Failed to fetch');
      return { status: 'success', data: { 'tabla:x': { anchos: 'y'.repeat(5000) } } };
    },
    async guardar(clave, valor) { puts.push({ clave, valor }); return {}; },
  };
  const almacen = almacenFalso();
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, servidor, temporizador: reloj });
  const avisos = await conAvisos(async () => {
    await p.precargar('');
    fallarGet = false;
    // Sola cabe (unos 5 KB); con los 5 KB del servidor pasa de 8 KB.
    assert.equal(p.escribirParte('tabla:x', { nota: 'x'.repeat(5000) }), true);
    for (let i = 0; i < 4; i += 1) await tic();
    reloj.avanzar(800);
    for (let i = 0; i < 4; i += 1) await tic();
  });
  assert.deepEqual(puts, [], 'no sube: pasaría de 8 KB');
  const visto = p.leer('tabla:x');
  assert.equal(visto.nota?.length, 5000, 'la parte sigue en memoria, no se descarta en silencio');
  assert.equal(visto.anchos.length, 5000, 'encima de lo que trajo el servidor');
  assert.ok(avisos.some((t) => t.includes('tabla:x') && t.includes('queda solo en memoria')), avisos.join(' | '));
  assert.ok(!String(almacen.datos.get('pref:7:tabla:x')).includes('xxxxx'), 'ni pasa al almacén');
}

console.log('--- TEST 29 (T4C, RP26, D35 y D38): el tamaño (useEstadoTabla) y las columnas (usePreferenciasTabla) en tabla:x ---');
{
  // Los dos dueños de tabla:x, como los arma usePreferenciaParte: un vínculo con parte = true cada uno. Las columnas
  // escriben con actualizadorColumnas (lib/tabla.js): la pieza se calcula con lo último del vínculo.
  const DEF = [
    { id: 'num', ancho: 120, clave: true, fija: 'izquierda' },
    { id: 'cli', ancho: 200 },
    { id: 'est', ancho: 140 },
    { id: 'monto', ancho: 120, ocultaPorDefecto: true },
  ];
  const SIN_GUARDAR = {};
  const servidor = servidorAMano();
  const almacen = almacenFalso();
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen, servidor, temporizador: reloj });
  const precarga = p.precargar('');
  const columnas = vincularPreferencia({ obtener: () => p, clave: 'tabla:x', porDefecto: SIN_GUARDAR, parte: true, alCambiar: () => {} });
  const tamano = vincularPreferencia({ obtener: () => p, clave: 'tabla:x', porDefecto: { tamano: 25 }, parte: true, alCambiar: () => {} });
  // (a) Antes de listo el actualizador recibe el valor por defecto del vínculo y no arma nada (D35): una parte calculada
  // sobre {} subiría sin las piezas que hay en el servidor.
  columnas.guardar(actualizadorColumnas(DEF, { tipo: 'anchos', anchos: { cli: 300 } }, SIN_GUARDAR));
  const delServidor = { version: 0, orden: ['est', 'cli', 'num'], anchos: { cli: 500 }, ocultas: ['est'], tamano: 50 };
  await tic();
  servidor.gets[0].resolver({ status: 'success', data: { 'tabla:x': delServidor } });
  await precarga;
  await tic();
  reloj.avanzar(800);
  await tic();
  assert.deepEqual(servidor.puts, [], 'lo de antes de listo no escribió nada');
  assert.deepEqual(p.leer('tabla:x'), delServidor);
  // (b) Con listo: solo la pieza de los anchos (y la versión); lo de la otra versión se borra y el tamaño queda.
  columnas.guardar(actualizadorColumnas(DEF, { tipo: 'anchos', anchos: { cli: 300 } }, SIN_GUARDAR));
  assert.deepEqual(p.leer('tabla:x'), { version: 1, anchos: { cli: 300 }, tamano: 50 });
  // (c) El tamaño, por su lado, conserva las columnas.
  tamano.guardar({ tamano: 25 });
  assert.deepEqual(p.leer('tabla:x'), { version: 1, anchos: { cli: 300 }, tamano: 25 });
  // (d) Dos cambios seguidos, en el mismo tic (antes de otro render): el segundo parte de lo que dejó el primero.
  columnas.guardar(actualizadorColumnas(DEF, { tipo: 'mover', id: 'est', hueco: 1 }, SIN_GUARDAR));
  columnas.guardar(actualizadorColumnas(DEF, { tipo: 'ocultar', id: 'cli' }, SIN_GUARDAR));
  const guardado = p.leer('tabla:x');
  assert.deepEqual(guardado, { version: 1, anchos: { cli: 300 }, tamano: 25, orden: ['num', 'est', 'cli', 'monto'], ocultas: ['cli', 'monto'] });
  const visto = reconciliarColumnas(DEF, guardado);
  assert.deepEqual(visto.orden.filter((id) => !visto.ocultas.includes(id)), ['num', 'est']);
  reloj.avanzar(800);
  await tic();
  assert.deepEqual(servidor.puts.map((x) => [x.clave, x.valor]), [['tabla:x', guardado]], 'un solo PUT con todo');
  servidor.puts[0].resolver({ status: 'success' });
  await tic();
  // Un cambio que no cambia nada no escribe (ni PUT).
  columnas.guardar(actualizadorColumnas(DEF, { tipo: 'ocultar', id: 'num' }, SIN_GUARDAR));
  reloj.avanzar(800);
  await tic();
  assert.equal(servidor.puts.length, 1);
}
{
  // (e) El usuario cambió y el vínculo ya pasó a la instancia nueva (sin listo) antes de que la pantalla lo viera: el
  // cambio de la pantalla del usuario anterior no se arma sobre el valor por defecto ni va a la cuenta del nuevo.
  const SIN_GUARDAR = {};
  const DEF = [{ id: 'num', clave: true }, { id: 'cli' }, { id: 'est' }];
  const almacen = almacenFalso();
  const reloj = relojFalso();
  const s8 = servidorAMano();
  const p7 = crearPreferencias({ usuarioId: 7, almacen, temporizador: reloj });
  const p8 = crearPreferencias({ usuarioId: 8, almacen, servidor: s8, temporizador: reloj });
  const precarga8 = p8.precargar('');
  let actual = p7;
  const columnas = vincularPreferencia({ obtener: () => actual, clave: 'tabla:x', porDefecto: SIN_GUARDAR, parte: true, alCambiar: () => {} });
  await tic();
  assert.equal(columnas.estado().listo, true);
  actual = p8;
  columnas.revisarUsuario();
  assert.equal(columnas.estado().listo, false);
  columnas.guardar(actualizadorColumnas(DEF, { tipo: 'ocultar', id: 'cli' }, SIN_GUARDAR));
  const del8 = { version: 1, orden: ['est', 'cli', 'num'], ocultas: ['est'] };
  await tic();
  s8.gets[0].resolver({ status: 'success', data: { 'tabla:x': del8 } });
  await precarga8;
  await tic();
  reloj.avanzar(800);
  await tic();
  assert.deepEqual(p8.leer('tabla:x'), del8, 'lo del usuario 8 queda intacto');
  assert.deepEqual(s8.puts, []);
  assert.equal(almacen.datos.get('pref:7:tabla:x'), undefined);
}

console.log('--- TEST 30 (T4C r1, punto 3): un gesto sobre la pantalla de 7 no llega a la cuenta 8 (escenarios A, B, D y F del revisor) ---');
// Los dos usuarios del revisor (scratchpad sim4c/sim.mjs): 7 con su pantalla lista y, en otra pestaña, el token pasa a 8.
const DEF_30 = [
  { id: 'num', ancho: 120, clave: true, fija: 'izquierda' },
  { id: 'cli', ancho: 200 }, { id: 'est', ancho: 140 }, { id: 'monto', ancho: 120, ocultaPorDefecto: true },
];
const DEL7_30 = { version: 1, orden: ['num', 'cli', 'est', 'monto'], anchos: { cli: 400 }, ocultas: [], tamano: 50 };
const DEL8_30 = { version: 1, orden: ['num', 'est', 'cli', 'monto'], anchos: { cli: 222, est: 333, monto: 111 }, ocultas: ['monto'], tamano: 25 };

async function dosUsuarios({ conTablaYVista = false } = {}) {
  let usuario = 7;
  const reloj = relojFalso();
  const almacen = almacenFalso();
  const srv = { 7: servidorAMano(), 8: servidorAMano() };
  const gestor = crearPreferenciasPorUsuario({
    leerUsuario: () => usuario,
    crear: (u) => crearPreferencias({ usuarioId: u, almacen, servidor: srv[u], temporizador: reloj }),
  });
  const SIN_GUARDAR = {};
  const cols = vincularPreferencia({ obtener: gestor.obtener, clave: 'tabla:x', porDefecto: SIN_GUARDAR, parte: true, alCambiar: () => {} });
  const vinculos = [cols];
  let vista = null;
  let tam = null;
  if (conTablaYVista) {
    vista = vincularPreferencia({ obtener: gestor.obtener, clave: 'vista:x', porDefecto: 'lista', alCambiar: () => {} });
    tam = vincularPreferencia({ obtener: gestor.obtener, clave: 'tabla:x', porDefecto: { tamano: 25 }, parte: true, alCambiar: () => {} });
    vinculos.push(vista, tam);
  }
  // El oyente de usePreferencia: cuando obtener() nota el cambio, cada vínculo pasa a la instancia nueva.
  gestor.alCambiar(() => { for (const v of vinculos) v.revisarUsuario(); });
  await tic();
  srv[7].gets[0].resolver({ status: 'success', data: { 'tabla:x': DEL7_30, 'vista:x': 'lista' } });
  await tic();
  await tic();
  // La foto del render de 7 (lo que tiene actuales.current del hook).
  const foto = { guardado: cols.estado().valor, listo: cols.estado().listo, usuario: 7 };
  return {
    srv, reloj, cols, vista, tam, foto, SIN_GUARDAR,
    cambiarA8: ({ aviso }) => {
      usuario = 8;
      if (aviso) for (const v of vinculos) v.revisarUsuario();
    },
    usuarioDelToken: () => usuario,
    async terminar() {
      await tic();
      const g8 = srv[8].gets[0];
      if (g8) g8.resolver({ status: 'success', data: { 'tabla:x': DEL8_30, 'vista:x': 'lista' } });
      for (let i = 0; i < 3; i += 1) await tic();
      reloj.avanzar(800);
      await tic();
    },
  };
}
// La librería sola (lo que hace aplicar sin mirar el usuario): la pieza vacía no publica, así que el valor del
// vínculo sigue siendo el por defecto hasta listo y ninguna llamada arma una pieza sobre él.
async function soloLibreria({ aviso, llamadas }) {
  const u = await dosUsuarios();
  u.cambiarA8({ aviso });
  for (let i = 0; i < llamadas; i += 1) {
    u.cols.guardar(actualizadorColumnas(DEF_30, { tipo: 'anchos', anchos: { cli: 500 + 20 * i } }, u.SIN_GUARDAR));
  }
  await u.terminar();
  return u;
}
{
  const a = await soloLibreria({ aviso: true, llamadas: 1 });
  assert.deepEqual(a.srv[8].puts, [], 'A: con aviso, 1 llamada');
  const b = await soloLibreria({ aviso: true, llamadas: 2 });
  assert.deepEqual(b.srv[8].puts, [], 'B: con aviso, 2 llamadas');
  const d = await soloLibreria({ aviso: false, llamadas: 3 });
  assert.deepEqual(d.srv[8].puts, [], 'D: sin aviso, 3 llamadas');
  for (const u of [a, b, d]) assert.deepEqual(u.srv[7].puts, [], 'nada sale tampoco a la cuenta 7');
}
{
  // La regla de la librería: con parte, una pieza vacía no publica ni se acumula (antes y después de listo).
  const servidor = servidorAMano();
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen: almacenFalso(), servidor, temporizador: reloj });
  const precarga = p.precargar('');
  const porDefecto = { tamano: 25 };
  let publicaciones = 0;
  const v = vincularPreferencia({ obtener: () => p, clave: 'tabla:x', porDefecto, parte: true, alCambiar: () => { publicaciones += 1; } });
  for (const vacia of [{}, () => ({}), null, () => null]) v.guardar(/** @type {any} */ (vacia));
  assert.equal(publicaciones, 0);
  assert.equal(v.estado().valor, porDefecto, 'el MISMO objeto por defecto hasta listo');
  await tic();
  servidor.gets[0].resolver({ status: 'success', data: { 'tabla:x': { anchos: { cli: 300 } } } });
  await precarga;
  await tic();
  assert.equal(publicaciones, 1, 'solo el de listo');
  v.guardar({});
  reloj.avanzar(800);
  await tic();
  assert.deepEqual([publicaciones, servidor.puts.length], [1, 0]);
}
{
  // Con la guarda del hook (guardarCambioColumnas): cada escritura va con el usuario con que se pintó la pantalla.
  for (const [nombre, aviso, llamadas] of [['A', true, 1], ['B', true, 2], ['D', false, 3]]) {
    const u = await dosUsuarios();
    u.cambiarA8({ aviso });
    const retornos = [];
    for (let i = 0; i < llamadas; i += 1) {
      retornos.push(guardarCambioColumnas(u.cols.guardar, {
        definicion: DEF_30, cambio: { tipo: 'anchos', anchos: { cli: 500 + 20 * i } }, sinGuardar: u.SIN_GUARDAR,
        listo: u.foto.listo, usuarioRender: u.foto.usuario, usuarioToken: u.usuarioDelToken(),
      }));
    }
    await u.terminar();
    assert.deepEqual(retornos, Array(llamadas).fill(false), `${nombre}: no escribe`);
    assert.deepEqual(u.srv[8].puts, [], `${nombre}: nada a la cuenta 8`);
  }
  // F: una acción de useEstadoTabla (tamaño y modo) hecha sobre la pantalla de 7 después de enlazar: no se guarda.
  const f = await dosUsuarios({ conTablaYVista: true });
  f.cambiarA8({ aviso: true });
  const actual = estadoTablaInicial({ vista: 'todos', tamano: 50 });
  const siguiente = reducirEstadoTabla(reducirEstadoTabla(actual, { tipo: 'modo', valor: 'kanban' }), { tipo: 'tamano', valor: 25 });
  const escrituras = escriturasDeAccion(actual, siguiente, { usuarioRender: 7, usuarioToken: f.usuarioDelToken() });
  assert.equal(escrituras, null);
  await f.terminar();
  assert.deepEqual(f.srv[8].puts, [], 'F: ni el tamaño ni el modo van a la cuenta 8');
  // Lo mismo con el usuario de siempre sí escribe (el control).
  const g = await dosUsuarios({ conTablaYVista: true });
  const mias = escriturasDeAccion(actual, siguiente, { usuarioRender: 7, usuarioToken: 7 });
  assert.deepEqual([mias?.modo, mias?.tamano], ['kanban', 25]);
  g.vista.guardar(mias.modo);
  g.tam.guardar({ tamano: mias.tamano });
  g.reloj.avanzar(800);
  await tic();
  assert.deepEqual(g.srv[7].puts.map((x) => x.clave).sort(), ['tabla:x', 'vista:x']);
}

console.log('--- TEST 31 (T4C r1, punto 6a): dos cambios seguidos en el mismo manejador parten de lo último del vínculo ---');
{
  const DEF = [{ id: 'num', ancho: 120, clave: true }, { id: 'cli', ancho: 200 }, { id: 'est', ancho: 140 }];
  const SIN_GUARDAR = {};
  const reloj = relojFalso();
  const p = crearPreferencias({ usuarioId: 7, almacen: almacenFalso(), temporizador: reloj });
  const cols = vincularPreferencia({ obtener: () => p, clave: 'tabla:x', porDefecto: SIN_GUARDAR, parte: true, alCambiar: () => {} });
  await tic();
  const aplicar = (cambio) => guardarCambioColumnas(cols.guardar, {
    definicion: DEF, cambio, sinGuardar: SIN_GUARDAR, listo: true, usuarioRender: 7, usuarioToken: 7,
  });
  // ocultar y volver a mostrar 'cli' antes de otro render: no queda oculta.
  assert.deepEqual([aplicar({ tipo: 'ocultar', id: 'cli', oculta: true }), aplicar({ tipo: 'ocultar', id: 'cli', oculta: false })], [true, true]);
  assert.deepEqual(reconciliarColumnas(DEF, p.leer('tabla:x')).ocultas, []);
  // 300 y luego 200 (su ancho por defecto): queda en 200.
  assert.deepEqual([aplicar({ tipo: 'anchos', anchos: { cli: 300 } }), aplicar({ tipo: 'anchos', anchos: { cli: 200 } })], [true, true]);
  assert.equal(reconciliarColumnas(DEF, p.leer('tabla:x')).anchos.cli, 200);
  // Un cambio que no cambia nada devuelve false y no escribe; antes de listo, tampoco.
  assert.equal(aplicar({ tipo: 'ocultar', id: 'num' }), false);
  assert.equal(guardarCambioColumnas(cols.guardar, {
    definicion: DEF, cambio: { tipo: 'ocultar', id: 'cli' }, sinGuardar: SIN_GUARDAR, listo: false, usuarioRender: 7, usuarioToken: 7,
  }), false);
  assert.deepEqual(reconciliarColumnas(DEF, p.leer('tabla:x')).ocultas, []);
}

console.log('✓ lib/preferencias.js: ámbitos, ráfagas, usuarios, memoria, 8 KB, precarga, reintentos, escribirParte, niveles, cerrar, instancia por usuario, vínculo de los hooks, usuario del token, precarga fallida y guardar tras un cambio de sesión.');
