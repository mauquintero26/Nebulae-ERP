/**
 * frontend/tests/test_kanban.mjs
 * Bloque 4, T3A (KANBAN-base punto 1, R4, R11, C1, C13 y RP67): la lógica pura del tablero Kanban común
 * (lib/kanban.js). Columnas congeladas y sin claves repetidas (también las de Compras de T2), reparto de tarjetas por
 * columna, orden dentro de cada columna, páginas por columna, el movimiento optimista con su deshacer, las reglas de
 * soltar (cuatro resultados posibles), el mapa de destinos, la columna bajo el puntero y el autodesplazamiento.
 * Sin preferencias (R4: pasan a test_preferencias.mjs) y sin textoContador (C13: textoTotalColumna).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SIN_COLUMNA, TEXTO_SOLO_VER, definirColumnas, columnaPorEstados, agruparEnColumnas, ordenarTarjetas,
  estadoTableroInicial, aplicarPagina, marcarColumna, moverTarjeta, resolverSoltar, mapaDestinos, columnaBajoPunto,
  velocidadAutodesplazamiento, textoTotalColumna, MINIMO_MOTIVO, motivoValido,
} from '../src/lib/kanban.js';
import {
  COLUMNAS_PEC, COLUMNAS_RECEPCION, COLUMNAS_LISTA, COLUMNAS_TRASLADO, COLUMNAS_STOCK, ESTADOS_PEC, columnaPec,
  reglaSoltarPec,
} from '../src/lib/estados-compras.js';

const COLS = [
  { clave: 'nuevo', titulo: 'Nuevo', tono: 'slate', estados: ['NUEVO'] },
  { clave: 'curso', titulo: 'En curso', tono: 'blue', estados: ['EN_CURSO', 'REVISION'] },
  { clave: 'hecho', titulo: 'Hecho', tono: 'emerald', estados: ['HECHO'], cerrada: true },
];
const DIA = 86400000;
const AHORA = Date.UTC(2026, 9, 28, 12);
const haceDias = (n) => new Date(AHORA - n * DIA).toISOString();

console.log('--- TEST 1: definirColumnas congela y no acepta claves repetidas ---');
{
  const columnas = definirColumnas(COLS);
  assert.ok(Object.isFrozen(columnas));
  assert.ok(Object.isFrozen(columnas[0]) && Object.isFrozen(columnas[1].estados));
  assert.throws(() => { columnas.push({ clave: 'x' }); }, TypeError);
  assert.equal(columnas[2].cerrada, true);
  assert.equal(columnas[0].cerrada, false, 'cerrada es false si no se dice');
  assert.ok(!Object.isFrozen(COLS[0]), 'congela una copia, no las columnas de quien llama');
  assert.throws(() => definirColumnas([...COLS, { clave: 'curso', titulo: 'Otra' }]), /repetida.*curso/);
  assert.throws(() => definirColumnas([{ clave: '', titulo: 'Sin clave' }]), /clave/);
  assert.throws(() => definirColumnas([{ titulo: 'Sin clave' }]), /clave/);
  assert.throws(() => definirColumnas([{ clave: 'x' }]), /título/);
  assert.throws(() => definirColumnas([{ clave: SIN_COLUMNA, titulo: 'Reservada' }]), /reservada/);
  assert.throws(() => definirColumnas([]), /al menos una/);
  // Las columnas de Compras (T2) tienen la forma de columna de kanban.js.
  for (const [nombre, lista] of Object.entries({ COLUMNAS_PEC, COLUMNAS_RECEPCION, COLUMNAS_LISTA, COLUMNAS_TRASLADO, COLUMNAS_STOCK })) {
    const definidas = definirColumnas(lista);
    assert.equal(definidas.length, lista.length, nombre);
    assert.deepEqual(definidas.map((c) => c.clave), lista.map((c) => c.clave), nombre);
  }
  assert.deepEqual(definirColumnas(COLUMNAS_PEC).filter((c) => c.cerrada).map((c) => c.clave), ['recibido', 'cancelado']);
}

console.log('--- TEST 2: agruparEnColumnas ---');
{
  const columnas = definirColumnas(COLS);
  const items = [{ id: 1, estado: 'NUEVO' }, { id: 2, estado: 'REVISION' }, { id: 3, estado: 'HECHO' }, { id: 4, estado: 'RARO' }];
  const grupos = agruparEnColumnas(items, columnas);
  assert.deepEqual(Object.keys(grupos), ['nuevo', 'curso', 'hecho', SIN_COLUMNA]);
  assert.deepEqual(grupos.nuevo.map((x) => x.id), [1]);
  assert.deepEqual(grupos.curso.map((x) => x.id), [2], 'por defecto, la columna cuyos estados lo traen');
  assert.deepEqual(grupos.hecho.map((x) => x.id), [3]);
  assert.deepEqual(grupos[SIN_COLUMNA].map((x) => x.id), [4]);
  // Con columnaDe: null o una clave que no existe van a '__sin_columna'.
  const otro = agruparEnColumnas(items, columnas, (it) => (it.id === 1 ? 'hecho' : it.id === 2 ? null : it.id === 3 ? 'nada' : 'curso'));
  assert.deepEqual([otro.hecho.map((x) => x.id), otro.curso.map((x) => x.id), otro[SIN_COLUMNA].map((x) => x.id)], [[1], [4], [2, 3]]);
  assert.equal(columnaPorEstados(columnas)({ estado: 'EN_CURSO' }), 'curso');
  assert.equal(columnaPorEstados(columnas)(null), null);
  // Con las columnas y la regla del PEC (T2), ningún estado queda sin columna.
  const pecs = Object.keys(ESTADOS_PEC).map((estado, i) => ({ id: i, estado }));
  const porPec = agruparEnColumnas(pecs, definirColumnas(COLUMNAS_PEC), (p) => columnaPec(p.estado));
  assert.deepEqual(porPec[SIN_COLUMNA], []);
  assert.equal(Object.values(porPec).flat().length, pecs.length);
  assert.deepEqual(agruparEnColumnas(null, columnas)[SIN_COLUMNA], []);
}

console.log('--- TEST 3: ordenarTarjetas ---');
{
  const A = { id: 'A', atrasado: false, updated_at: haceDias(1) };
  const B = { id: 'B', atrasado: true, updated_at: haceDias(3) };
  const C = { id: 'C', atrasado: true, updated_at: haceDias(5) };
  const opciones = { esAtrasado: (x) => x.atrasado };
  const entrada = [A, B, C];
  assert.deepEqual(ordenarTarjetas(entrada, opciones).map((x) => x.id), ['C', 'B', 'A'], 'atrasadas primero, la más quieta antes');
  assert.deepEqual(entrada.map((x) => x.id), ['A', 'B', 'C'], 'devuelve una copia');
  // La atrasada va antes aunque otra lleve más tiempo quieta.
  const quieta = { id: 'Q', atrasado: false, updated_at: haceDias(10) };
  assert.deepEqual(ordenarTarjetas([quieta, B], opciones).map((x) => x.id), ['B', 'Q']);
  // Columna cerrada: la más reciente primero (sin mirar el atraso).
  assert.deepEqual(ordenarTarjetas(entrada, { ...opciones, cerrada: true }).map((x) => x.id), ['A', 'B', 'C']);
  // Los empates conservan el orden; lo que no tiene fecha va al final.
  const mismo = haceDias(2);
  const empates = [{ id: 1, updated_at: mismo }, { id: 2 }, { id: 3, updated_at: mismo }, { id: 4, created_at: haceDias(9) }];
  assert.deepEqual(ordenarTarjetas(empates).map((x) => x.id), [4, 1, 3, 2]);
  assert.deepEqual(ordenarTarjetas(empates, { cerrada: true }).map((x) => x.id), [1, 3, 4, 2]);
  // La fecha del API sin zona es UTC (comoUTC): las 10:00 sin zona son anteriores a las 12:00Z (leída como hora local
  // de Colombia serían las 15:00Z). Con fechaMovimiento propia.
  const sinZona = [{ id: 'y', f: '2026-10-05T12:00:00Z' }, { id: 'x', f: '2026-10-05T10:00:00' }];
  assert.deepEqual(ordenarTarjetas(sinZona, { fechaMovimiento: (t) => t.f }).map((t) => t.id), ['x', 'y']);
}

console.log('--- TEST 4: estadoTableroInicial y aplicarPagina ---');
{
  const columnas = definirColumnas(COLS);
  const inicial = estadoTableroInicial(columnas);
  assert.deepEqual(inicial.nuevo, { items: [], total: null, cargando: true, error: null });
  assert.deepEqual(Object.keys(inicial), ['nuevo', 'curso', 'hecho']);
  const p1 = aplicarPagina(inicial, 'curso', { items: [{ id: 1 }, { id: 2 }], total: 30 });
  assert.deepEqual(p1.curso, { items: [{ id: 1 }, { id: 2 }], total: 30, cargando: false, error: null });
  assert.equal(inicial.curso.cargando, true, 'no muta el tablero anterior');
  assert.equal(p1.nuevo, inicial.nuevo, 'las otras columnas no cambian');
  // Con agregar: suma sin repetir id y guarda el total nuevo.
  const p2 = aplicarPagina(p1, 'curso', { items: [{ id: 2 }, { id: 3 }], total: 31 }, { agregar: true });
  assert.deepEqual(p2.curso.items.map((x) => x.id), [1, 2, 3]);
  assert.equal(p2.curso.total, 31);
  // Con idDe propio; sin total, el largo.
  const p3 = aplicarPagina(inicial, 'nuevo', { items: [{ codigo: 'a' }, { codigo: 'b' }] });
  assert.equal(p3.nuevo.total, 2);
  const p4 = aplicarPagina(p3, 'nuevo', { items: [{ codigo: 'b' }, { codigo: 'c' }] }, { agregar: true, idDe: (x) => x.codigo });
  assert.deepEqual(p4.nuevo.items.map((x) => x.codigo), ['a', 'b', 'c']);
  // Una columna plegada (limit=0): sin tarjetas y con su total.
  assert.deepEqual(aplicarPagina(inicial, 'hecho', { items: [], total: 12 }).hecho, { items: [], total: 12, cargando: false, error: null });
  assert.throws(() => aplicarPagina(inicial, 'nada', { items: [] }), /desconocida/);
  // marcarColumna: un error o una recarga de una columna.
  const conError = marcarColumna(p1, 'curso', { cargando: false, error: 'No se pudo cargar' });
  assert.deepEqual(conError.curso, { ...p1.curso, error: 'No se pudo cargar' });
  assert.throws(() => marcarColumna(p1, 'nada', {}), /desconocida/);
}

console.log('--- TEST 5: moverTarjeta (optimista) y deshacer ---');
{
  const columnas = definirColumnas(COLS);
  let t = estadoTableroInicial(columnas);
  t = aplicarPagina(t, 'nuevo', { items: [{ id: 1, estado: 'NUEVO' }, { id: 2, estado: 'NUEVO' }, { id: 3, estado: 'NUEVO' }], total: 3 });
  t = aplicarPagina(t, 'curso', { items: [{ id: 9, estado: 'EN_CURSO' }], total: 1 });
  // 'hecho' sigue como en estadoTableroInicial: total null (todavía no se sabe).
  const foto = structuredClone(t);
  const { tablero, deshacer } = moverTarjeta(t, 2, 'nuevo', 'curso', { estado: 'EN_CURSO' });
  assert.equal(tablero.nuevo.total, 2);
  assert.equal(tablero.curso.total, 2);
  assert.deepEqual(tablero.nuevo.items.map((x) => x.id), [1, 3]);
  assert.deepEqual(tablero.curso.items[0], { id: 2, estado: 'EN_CURSO' }, 'queda primera, con el estado nuevo');
  assert.deepEqual(tablero.curso.items.map((x) => x.id), [2, 9]);
  assert.deepEqual(t, foto, 'el anterior no se muta');
  assert.deepEqual(deshacer(), foto, 'deshacer devuelve exactamente el tablero anterior');
  // Un total desconocido (null) sigue desconocido; nunca baja de 0.
  const aHecho = moverTarjeta(t, 1, 'nuevo', 'hecho', { estado: 'HECHO' }).tablero;
  assert.equal(aHecho.hecho.total, null);
  const conCero = { ...t, nuevo: { ...t.nuevo, total: 0 } };
  assert.equal(moverTarjeta(conCero, 1, 'nuevo', 'curso').tablero.nuevo.total, 0);
  // Una tarjeta que ya no está en el origen (otra recarga la sacó) no cambia nada.
  const nada = moverTarjeta(t, 77, 'nuevo', 'curso', { estado: 'EN_CURSO' });
  assert.equal(nada.tablero, t);
  assert.equal(nada.deshacer(), t);
  assert.throws(() => moverTarjeta(t, 1, 'nuevo', 'nada'), /desconocida/);
}

console.log('--- TEST 6: resolverSoltar ---');
{
  const item = { id: 1, estado: 'NUEVO' };
  const regla = (it, origen, destino) => (destino === 'curso' ? { tipo: 'cambio', estado: 'EN_CURSO' }
    : destino === 'hecho' ? { tipo: 'bloqueado', motivo: 'Primero pásalo a En curso.', enlace: { texto: 'Abrir', href: '/x' } }
      : { tipo: 'accion', accion: 'reabrir', datos: { id: it.id } });
  assert.deepEqual(resolverSoltar(item, 'nuevo', 'nuevo', regla), { tipo: 'ninguno' }, 'misma columna');
  assert.deepEqual(resolverSoltar(item, 'nuevo', 'curso', null), { tipo: 'bloqueado', motivo: 'Este tablero es solo para ver.' });
  assert.equal(TEXTO_SOLO_VER, 'Este tablero es solo para ver.');
  // RP67: sin regla usa el soloLectura de la pantalla.
  const soloLectura = 'Este tablero es para ver: los movimientos en cuarentena o sin dirección solo salen en la lista.';
  assert.deepEqual(resolverSoltar(item, 'nuevo', 'curso', undefined, { soloLectura }), { tipo: 'bloqueado', motivo: soloLectura });
  assert.deepEqual(resolverSoltar(item, 'nuevo', 'curso', regla, { soloLectura }), { tipo: 'bloqueado', motivo: soloLectura },
    'un tablero de solo lectura no deja mover aunque traiga regla');
  assert.deepEqual(resolverSoltar(item, 'nuevo', 'curso', null, { soloLectura: '  ' }), { tipo: 'bloqueado', motivo: TEXTO_SOLO_VER });
  // Las cuatro formas válidas pasan tal cual.
  assert.deepEqual(resolverSoltar(item, 'nuevo', 'curso', regla), { tipo: 'cambio', estado: 'EN_CURSO' });
  assert.deepEqual(resolverSoltar(item, 'nuevo', 'hecho', regla).enlace, { texto: 'Abrir', href: '/x' });
  assert.deepEqual(resolverSoltar(item, 'curso', 'nuevo', regla), { tipo: 'accion', accion: 'reabrir', datos: { id: 1 } });
  assert.deepEqual(resolverSoltar(item, 'curso', 'nuevo', () => ({ tipo: 'ninguno' })), { tipo: 'ninguno' });
  assert.deepEqual(
    resolverSoltar(item, 'a', 'b', () => ({ tipo: 'cambio', estado: 'COMPLETADO', cuerpo: { stage: 'casillero' } })).cuerpo,
    { stage: 'casillero' },
  );
  // Otra forma es un error de programación.
  for (const mala of [{ tipo: 'raro' }, null, 'cambio', { tipo: 'bloqueado' }, { tipo: 'bloqueado', motivo: '' },
    { tipo: 'cambio' }, { tipo: 'accion', accion: '' }, { tipo: 'bloqueado', motivo: 'x', enlace: { texto: 'a' } }]) {
    assert.throws(() => resolverSoltar(item, 'nuevo', 'curso', () => mala), /regla del tablero/, JSON.stringify(mala));
  }
  // Con la regla real del PEC (T2).
  assert.deepEqual(resolverSoltar({ estado: 'BORRADOR' }, 'borrador', 'emitido', reglaSoltarPec), { tipo: 'cambio', estado: 'EMITIDO' });
  assert.equal(resolverSoltar({ estado: 'EMITIDO' }, 'emitido', 'en_bodega', reglaSoltarPec).tipo, 'bloqueado');
}

console.log('--- TEST 7: mapaDestinos ---');
{
  const columnas = definirColumnas(COLS);
  const regla = (it, origen, destino) => (destino === 'curso' ? { tipo: 'cambio', estado: 'EN_CURSO' }
    : { tipo: 'bloqueado', motivo: 'No desde aquí.', enlace: { texto: 'Abrir', href: '/x' } });
  const mapa = mapaDestinos({ id: 1 }, 'nuevo', columnas, regla);
  assert.deepEqual(Object.keys(mapa), ['nuevo', 'curso', 'hecho']);
  assert.deepEqual([mapa.nuevo.permitido, mapa.nuevo.motivo], [false, null], 'el origen no es un destino');
  assert.deepEqual([mapa.curso.permitido, mapa.curso.motivo], [true, null]);
  assert.deepEqual([mapa.hecho.permitido, mapa.hecho.motivo, mapa.hecho.enlace], [false, 'No desde aquí.', { texto: 'Abrir', href: '/x' }]);
  assert.deepEqual(mapa.curso.resultado, { tipo: 'cambio', estado: 'EN_CURSO' });
  // Una acción también es un destino permitido; sin regla, todo bloqueado con el texto del tablero.
  assert.equal(mapaDestinos({}, 'nuevo', columnas, () => ({ tipo: 'accion', accion: 'x' })).hecho.permitido, true);
  const soloVer = mapaDestinos({}, 'nuevo', columnas, null, { soloLectura: 'Este tablero es para ver: …' });
  assert.deepEqual([soloVer.curso.permitido, soloVer.curso.motivo], [false, 'Este tablero es para ver: …']);
}

console.log('--- TEST 8: columnaBajoPunto ---');
{
  const rects = { a: { left: 0, right: 100, top: 0, bottom: 500 }, b: { left: 110, right: 210, top: 0, bottom: 500 } };
  assert.equal(columnaBajoPunto(rects, 50, 50), 'a');
  assert.equal(columnaBajoPunto(rects, 100, 500), 'a', 'un punto en el borde cuenta');
  assert.equal(columnaBajoPunto(rects, 110, 0), 'b');
  assert.equal(columnaBajoPunto(rects, 105, 50), null, 'entre columnas');
  assert.equal(columnaBajoPunto(rects, 50, 501), null, 'fuera de todo');
  assert.equal(columnaBajoPunto({ a: null }, 1, 1), null, 'una columna sin rectángulo se ignora');
  assert.equal(columnaBajoPunto([{ clave: 7, left: 0, right: 10, top: 0, bottom: 10 }], 5, 5), 7, 'también una lista');
}

console.log('--- TEST 9: velocidadAutodesplazamiento ---');
{
  const caja = { left: 100, right: 1100 };
  assert.equal(velocidadAutodesplazamiento(600, caja), 0, 'en el centro no se mueve');
  const izquierda = velocidadAutodesplazamiento(110, caja);
  assert.ok(izquierda < 0, 'a 10 px del borde izquierdo va hacia la izquierda');
  assert.ok(velocidadAutodesplazamiento(1090, caja) > 0, 'cerca del derecho, hacia la derecha');
  assert.ok(velocidadAutodesplazamiento(101, caja) < izquierda, 'más cerca del borde, más rápido');
  for (const x of [-500, 0, 100, 105, 1095, 1100, 5000]) {
    assert.ok(Math.abs(velocidadAutodesplazamiento(x, caja)) <= 18, `nunca pasa de max (x=${x})`);
  }
  assert.equal(velocidadAutodesplazamiento(-500, caja), -18);
  assert.equal(Math.abs(velocidadAutodesplazamiento(0, caja, 64, 30)), 30, 'max propio');
  assert.equal(velocidadAutodesplazamiento(150, { left: 100, right: 200 }), 0, 'una caja angosta tiene su centro quieto');
  assert.equal(velocidadAutodesplazamiento(Number.NaN, caja), 0);
}

console.log('--- TEST 10: textoTotalColumna (C13: sin textoContador ni «…») ---');
{
  assert.equal(textoTotalColumna(25, 80), '25 de 80');
  assert.equal(textoTotalColumna(25, 25), '25');
  assert.equal(textoTotalColumna(3, null), '3');
  assert.equal(textoTotalColumna(1234, 5678), '1.234 de 5.678');
  assert.equal(textoTotalColumna(0, 0), '0');
}

console.log('--- TEST 11 (T4A): motivoValido (ModalMotivo: 5 caracteres o más, sin contar los espacios del borde) ---');
{
  assert.equal(MINIMO_MOTIVO, 5);
  assert.equal(motivoValido('abcde'), true);
  assert.equal(motivoValido('abcd'), false);
  assert.equal(motivoValido('   abcd   '), false, 'los espacios del borde no cuentan');
  assert.equal(motivoValido('\n abcde \t'), true);
  assert.equal(motivoValido('a b c'), true, 'los espacios de adentro sí cuentan');
  assert.equal(motivoValido('😀😀😀😀'), false, 'se cuentan caracteres, no unidades UTF-16 (como len() del servidor)');
  assert.equal(motivoValido('😀😀😀😀😀'), true);
  assert.equal(motivoValido('Señor'), true);
  for (const otro of [null, undefined, 12345, {}, ['abcde']]) assert.equal(motivoValido(otro), false, String(otro));
  assert.equal(motivoValido('abc', 3), true, 'el mínimo se puede cambiar');
  assert.equal(motivoValido('ab', 3), false);
  // T4A r1 (punto 5): si el servidor responde con error, el foco vuelve al campo (habilitado otra vez) y lo escrito
  // se conserva. Sin DOM en node: se fija sobre el fuente de ModalMotivo.tsx.
  const fuente = readFileSync(new URL('../src/components/ui/ModalMotivo.tsx', import.meta.url), 'utf8');
  assert.ok(fuente.includes('ref={campo}'), 'el textarea tiene su ref');
  assert.match(fuente, /if \(fallos > 0 && !guardando\) campo\.current\?\.focus\(\)/, 'el foco vuelve al campo después de un error');
  assert.match(fuente, /setFallos\(\(n\) => n \+ 1\)/, 'cada error cuenta, aunque el mensaje se repita');
  assert.ok(!/setMotivo\(''\)/.test(fuente), 'lo escrito no se borra');
}

console.log('✓ lib/kanban.js: columnas, reparto, orden, páginas, movimiento, reglas, destinos, arrastre y motivo.');
