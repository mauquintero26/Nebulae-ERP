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
// T4B: lo nuevo del tablero común se pide por el módulo entero, para que una función que falta falle con su nombre.
import * as kanban from '../src/lib/kanban.js';
import { COLUMNAS_HUB, COLUMNAS_PEDIDO } from '../src/lib/kanban-ventas.js';

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

console.log('--- TEST 12 (T4B): lo que usan useTableroKanban y TableroKanban ---');
{
  const nombres = ['UMBRAL_ARRASTRE', 'superaUmbral', 'ordenPorDefecto', 'consultaColumna', 'firmaConsulta',
    'plegadasPorDefecto', 'plegadasValidas', 'resolverPlegadas', 'alternarPlegada', 'crearTurnos', 'paginaDeRespuesta',
    'quedanEnServidor', 'tableroCliente', 'estadoColumna', 'reemplazarTarjeta', 'deshacerMovimiento',
    'reglaSegunManejadores', 'opcionesMoverA', 'estadoDestino', 'textoMovimiento', 'ALTO_MINIMO_TABLERO', 'altoTablero',
    'asegurarColumna'];
  for (const n of nombres) assert.ok(n in kanban, `lib/kanban.js exporta ${n}`);
  const columnas = definirColumnas(COLS);

  // a) El umbral del arrastre (H1, el del CRM): menos de 6 px es un clic.
  assert.equal(kanban.UMBRAL_ARRASTRE, 6);
  assert.equal(kanban.superaUmbral(3, 4), false, '5 px es un clic');
  assert.equal(kanban.superaUmbral(6, 0), true, '6 px ya es arrastre');
  assert.equal(kanban.superaUmbral(-4, -5), true, 'en cualquier dirección');
  assert.equal(kanban.superaUmbral(0, 0), false);
  assert.equal(kanban.superaUmbral(Number.NaN, 10), false);
  assert.equal(kanban.superaUmbral(9, 0, 10), false, 'el umbral se puede cambiar');

  // b) RP10: el orden por columna, con ordenDe de la pantalla; plegada → limit 0 (solo el total, R11).
  assert.equal(kanban.ordenPorDefecto(columnas[0]), 'sin_movimiento', 'abierta: lo que más lleva quieto');
  assert.equal(kanban.ordenPorDefecto(columnas[2]), 'reciente', 'cerrada: lo más reciente');
  assert.deepEqual(kanban.consultaColumna(columnas[0], { porColumna: 25 }), { offset: 0, limit: 25, orden: 'sin_movimiento' });
  assert.deepEqual(kanban.consultaColumna(columnas[2], { porColumna: 50 }), { offset: 0, limit: 50, orden: 'reciente' });
  assert.deepEqual(kanban.consultaColumna(columnas[2], { porColumna: 50, plegada: true }), { offset: 0, limit: 0, orden: 'reciente' });
  assert.deepEqual(kanban.consultaColumna(columnas[1], { porColumna: 25, offset: 25 }), { offset: 25, limit: 25, orden: 'sin_movimiento' },
    '«Ver más» pide la página siguiente');
  // T7 (Hub): 'atencion' en las abiertas y '-creado' en Cancelado.
  const ordenHub = (c) => (c.cerrada ? '-creado' : 'atencion');
  const cancelado = COLUMNAS_HUB.find((c) => c.clave === 'Cancelado');
  assert.deepEqual(kanban.consultaColumna(COLUMNAS_HUB[0], { porColumna: 25, ordenDe: ordenHub }), { offset: 0, limit: 25, orden: 'atencion' });
  assert.deepEqual(kanban.consultaColumna(cancelado, { porColumna: 25, ordenDe: ordenHub, plegada: true }), { offset: 0, limit: 0, orden: '-creado' });
  assert.equal(kanban.consultaColumna(columnas[0], { ordenDe: () => '' }).orden, 'sin_movimiento', 'sin orden de la pantalla, el de siempre');
  assert.equal(kanban.consultaColumna(columnas[0]).limit, 25, 'por defecto, 25 por columna');
  // La firma cambia con la búsqueda, el tamaño, el orden y cada recarga; no con el offset de «Ver más».
  const f = (c, o) => kanban.firmaConsulta(c, o);
  const base = kanban.consultaColumna(columnas[0], { porColumna: 25 });
  assert.equal(typeof f(base, { dependencias: ['ana'], version: 0 }), 'string');
  assert.equal(f(base, { dependencias: ['ana'], version: 0 }), f({ ...base }, { dependencias: ['ana'], version: 0 }));
  assert.notEqual(f(base, { dependencias: ['ana'] }), f(base, { dependencias: ['ana b'] }));
  assert.notEqual(f(base, { dependencias: ['ana'] }), f({ ...base, limit: 50 }, { dependencias: ['ana'] }));
  assert.notEqual(f(base, { dependencias: ['ana'] }), f({ ...base, orden: 'reciente' }, { dependencias: ['ana'] }));
  assert.notEqual(f(base, { dependencias: ['ana'], version: 0 }), f(base, { dependencias: ['ana'], version: 1 }));
  assert.equal(f(base, { dependencias: ['ana'] }), f({ ...base, offset: 50 }, { dependencias: ['ana'] }));

  // c) Plegadas (kanban:<pantalla>, R4 y R11): por defecto las cerradas; lo guardado gana y se limpia.
  assert.deepEqual(kanban.plegadasPorDefecto(columnas), ['hecho']);
  assert.deepEqual(kanban.plegadasPorDefecto(COLUMNAS_PEDIDO), ['facturado', 'cancelado']);
  assert.deepEqual(kanban.resolverPlegadas(null, columnas), ['hecho'], 'nada guardado: las cerradas');
  assert.deepEqual(kanban.resolverPlegadas([], columnas), [], 'el usuario las abrió todas');
  assert.deepEqual(kanban.resolverPlegadas(['curso', 'vieja', 'nuevo'], columnas), ['nuevo', 'curso'],
    'en el orden de las columnas y sin las que ya no existen');
  assert.equal(kanban.plegadasValidas(['a', 'b']), true);
  assert.equal(kanban.plegadasValidas([]), true);
  for (const malo of [null, 'hecho', [1], { hecho: true }, ['a', null]]) assert.equal(kanban.plegadasValidas(malo), false, JSON.stringify(malo));
  const abiertas = kanban.alternarPlegada(['hecho'], 'hecho');
  assert.deepEqual(abiertas, [], 'un clic abre la plegada');
  assert.deepEqual(kanban.alternarPlegada(abiertas, 'curso'), ['curso'], 'otro la pliega');
  assert.deepEqual(kanban.alternarPlegada(['curso'], 'curso', true), ['curso']);
  const igual = ['curso'];
  assert.equal(kanban.alternarPlegada(igual, 'curso', true), igual, 'sin cambio devuelve la misma lista');
  assert.deepEqual(kanban.alternarPlegada(['curso', 'hecho'], 'curso', false), ['hecho']);

  // d) Turnos: una respuesta vieja de una columna se descarta; las columnas no se pisan.
  const turnos = kanban.crearTurnos();
  const t1 = turnos.siguiente('curso');
  const t2 = turnos.siguiente('curso');
  const otro = turnos.siguiente('hecho');
  assert.equal(turnos.vigente('curso', t1), false, 'la primera respuesta llega tarde: se descarta');
  assert.equal(turnos.vigente('curso', t2), true);
  assert.equal(turnos.vigente('hecho', otro), true, 'otra columna lleva su propio turno');
  assert.equal(turnos.vigente('nuevo', 1), false, 'sin consulta no hay turno vigente');

  // e) La respuesta de cargar: {items, total, resumen?}, también {filas} (normalizarRespuesta) o un arreglo.
  assert.deepEqual(kanban.paginaDeRespuesta({ items: [{ id: 1 }], total: 9, resumen: { monto_cop: 5 } }),
    { items: [{ id: 1 }], total: 9, resumen: { monto_cop: 5 } });
  assert.deepEqual(kanban.paginaDeRespuesta({ filas: [{ id: 2 }], total: 4 }), { items: [{ id: 2 }], total: 4, resumen: null });
  assert.deepEqual(kanban.paginaDeRespuesta([{ id: 3 }]), { items: [{ id: 3 }], total: 1, resumen: null });
  assert.deepEqual(kanban.paginaDeRespuesta({ items: [], total: 12 }), { items: [], total: 12, resumen: null }, 'una plegada: solo el total');
  assert.deepEqual(kanban.paginaDeRespuesta(null), { items: [], total: null, resumen: null });
  assert.equal(kanban.paginaDeRespuesta({ items: [{ id: 1 }], total: 'x' }).total, null, 'un total raro no se inventa');
  assert.equal(kanban.quedanEnServidor({ items: [{ id: 1 }], total: 3 }), true);
  assert.equal(kanban.quedanEnServidor({ items: [{ id: 1 }], total: 1 }), false);
  assert.equal(kanban.quedanEnServidor({ items: [], total: null }), false);

  // f) Modo cliente: agrupa, ordena, corta en porColumna y RP61 (totales reemplaza el contador de esa columna).
  const leads = [
    { id: 1, estado: 'NUEVO', f: haceDias(1) }, { id: 2, estado: 'NUEVO', f: haceDias(5) }, { id: 3, estado: 'NUEVO', f: haceDias(3) },
    { id: 4, estado: 'HECHO', f: haceDias(9) }, { id: 5, estado: 'HECHO', f: haceDias(2) }, { id: 6, estado: 'RARO', f: haceDias(1) },
  ];
  const opciones = { fechaMovimiento: (x) => x.f, esAtrasado: (x) => x.id === 3, porColumna: 2 };
  const cliente = kanban.tableroCliente(leads, columnas, opciones);
  assert.deepEqual(Object.keys(cliente), ['nuevo', 'curso', 'hecho'], 'lo que no cae en ninguna columna no se pinta');
  assert.deepEqual(cliente.nuevo.items.map((x) => x.id), [3, 2], 'atrasada primero, luego la más quieta; corte en 2');
  assert.equal(cliente.nuevo.total, 3);
  assert.equal(cliente.nuevo.hayMas, true);
  assert.deepEqual([cliente.nuevo.cargando, cliente.nuevo.error], [false, null]);
  assert.deepEqual(cliente.hecho.items.map((x) => x.id), [5, 4], 'cerrada: la más reciente primero');
  assert.equal(cliente.hecho.hayMas, false);
  assert.deepEqual(cliente.curso, { items: [], total: 0, cargando: false, error: null, hayMas: false });
  const mas = kanban.tableroCliente(leads, columnas, { ...opciones, cortes: { nuevo: 4 } });
  assert.deepEqual(mas.nuevo.items.map((x) => x.id), [3, 2, 1], '«Ver más» sube el corte');
  assert.equal(mas.nuevo.hayMas, false);
  const conTotales = kanban.tableroCliente(leads, columnas, { ...opciones, totales: { hecho: 312 } });
  assert.equal(conTotales.hecho.total, 312, 'RP61: los 50 más recientes y el total real');
  assert.equal(kanban.textoTotalColumna(conTotales.hecho.items.length, conTotales.hecho.total), '2 de 312');
  assert.equal(conTotales.hecho.hayMas, false, 'en modo cliente «Ver más» solo muestra lo que ya llegó');
  assert.equal(conTotales.nuevo.total, 3, 'las demás columnas cuentan lo cargado');
  const sinItems = kanban.tableroCliente(undefined, columnas, opciones);
  assert.deepEqual(sinItems.nuevo, { items: [], total: null, cargando: true, error: null, hayMas: false }, 'sin ítems todavía: cargando');
  assert.deepEqual(kanban.tableroCliente([{ id: 1, etapa: 'x' }], columnas, { columnaDe: () => 'curso' }).curso.items, [{ id: 1, etapa: 'x' }]);

  // g) El estado de cada columna con el vocabulario de estadoKpi (C13): nunca 0 mientras carga.
  assert.equal(kanban.estadoColumna({ items: [], total: null, cargando: true, error: null }), 'cargando');
  assert.equal(kanban.estadoColumna({ items: [{ id: 1 }], total: 4, cargando: true, error: null }), 'actualizando');
  assert.equal(kanban.estadoColumna({ items: [], total: null, cargando: false, error: new Error('x') }), 'error');
  assert.equal(kanban.estadoColumna({ items: [], total: 0, cargando: false, error: null }), 'listo');
  assert.equal(kanban.estadoColumna(undefined), 'cargando');

  // h) La tarjeta toma los datos del servidor en su lugar; si ya no está, nada cambia.
  let t = estadoTableroInicial(columnas);
  t = aplicarPagina(t, 'nuevo', { items: [{ id: 1, estado: 'NUEVO' }, { id: 2, estado: 'NUEVO' }], total: 2 });
  t = aplicarPagina(t, 'curso', { items: [{ id: 9, estado: 'EN_CURSO' }], total: 1 });
  const r1 = kanban.reemplazarTarjeta(t, 'nuevo', 2, { id: 2, estado: 'NUEVO', numero: 'X-2' });
  assert.deepEqual(r1.nuevo.items, [{ id: 1, estado: 'NUEVO' }, { id: 2, estado: 'NUEVO', numero: 'X-2' }]);
  assert.equal(r1.curso, t.curso);
  assert.equal(kanban.reemplazarTarjeta(t, 'nuevo', 77, { id: 77 }), t);
  assert.equal(kanban.reemplazarTarjeta(t, 'nuevo', 2, null), t, 'sin documento del servidor queda la optimista');
  assert.deepEqual(kanban.reemplazarTarjeta(t, 'curso', 'a', { k: 'a' }, { idDe: (x) => x.k }), t, 'con idDe propio');

  // i) Deshacer: si nada más cambió, exactamente el tablero anterior; si otra carga llegó en medio, la tarjeta vuelve.
  const foto = structuredClone(t);
  const mov = moverTarjeta(t, 2, 'nuevo', 'curso', { estado: 'EN_CURSO' });
  const datosMov = { id: 2, origen: 'nuevo', destino: 'curso', original: { id: 2, estado: 'NUEVO' } };
  assert.deepEqual(kanban.deshacerMovimiento(mov.tablero, mov.tablero, mov.deshacer, datosMov), foto);
  const luego = aplicarPagina(mov.tablero, 'hecho', { items: [], total: 7 });
  const vuelta = kanban.deshacerMovimiento(luego, mov.tablero, mov.deshacer, datosMov);
  assert.deepEqual(vuelta.nuevo.items[0], { id: 2, estado: 'NUEVO' }, 'vuelve al origen con sus datos de antes');
  assert.deepEqual(vuelta.curso.items.map((x) => x.id), [9]);
  assert.deepEqual([vuelta.nuevo.total, vuelta.curso.total, vuelta.hecho.total], [2, 1, 7], 'lo que llegó en medio se conserva');
  assert.equal(kanban.deshacerMovimiento(luego, mov.tablero, mov.deshacer, { ...datosMov, origen: 'vieja' }), luego,
    'una columna que ya no existe no rompe');

  // j) Una regla que pide un cambio o una acción que la pantalla no maneja queda bloqueada (no se ofrece).
  const regla = (it, o, d) => (d === 'curso' ? { tipo: 'cambio', estado: 'EN_CURSO' } : { tipo: 'accion', accion: 'cerrar' });
  const sinNada = kanban.reglaSegunManejadores(regla, { cambio: false, accion: false });
  assert.deepEqual(sinNada({}, 'nuevo', 'curso'), { tipo: 'bloqueado', motivo: TEXTO_SOLO_VER });
  assert.deepEqual(sinNada({}, 'nuevo', 'hecho'), { tipo: 'bloqueado', motivo: TEXTO_SOLO_VER });
  const conAmbos = kanban.reglaSegunManejadores(regla, { cambio: true, accion: true });
  assert.deepEqual(conAmbos({}, 'nuevo', 'curso'), { tipo: 'cambio', estado: 'EN_CURSO' });
  assert.deepEqual(conAmbos({}, 'nuevo', 'hecho'), { tipo: 'accion', accion: 'cerrar' });
  assert.equal(kanban.reglaSegunManejadores(null, { cambio: true }), null, 'sin regla sigue sin regla (RP67)');
  assert.throws(() => resolverSoltar({}, 'a', 'b', kanban.reglaSegunManejadores(() => ({ tipo: 'raro' }), { cambio: true })),
    /regla del tablero/, 'una forma rara sigue siendo un error');

  // k) «Mover a…» (teclado y celular): todas las columnas menos el origen; bloqueadas con su motivo; sin efecto, fuera.
  const regla2 = (it, o, d) => (d === 'curso' ? { tipo: 'cambio', estado: 'EN_CURSO' }
    : d === 'hecho' ? { tipo: 'bloqueado', motivo: 'Primero pásalo a En curso.' } : { tipo: 'ninguno' });
  const destinos = mapaDestinos({ id: 1 }, 'nuevo', columnas, regla2);
  assert.deepEqual(kanban.opcionesMoverA('nuevo', columnas, destinos), [
    { clave: 'curso', titulo: 'En curso', permitido: true, motivo: null },
    { clave: 'hecho', titulo: 'Hecho', permitido: false, motivo: 'Primero pásalo a En curso.' },
  ]);
  const destinos2 = mapaDestinos({ id: 1 }, 'hecho', columnas, regla2);
  assert.deepEqual(kanban.opcionesMoverA('hecho', columnas, destinos2).map((o) => o.clave), ['curso'], 'un destino sin efecto no se ofrece');
  // Mientras se arrastra: cómo se pinta cada columna.
  assert.equal(kanban.estadoDestino(destinos, 'nuevo', 'nuevo'), 'origen');
  assert.equal(kanban.estadoDestino(destinos, 'curso', 'nuevo'), 'permitido');
  assert.equal(kanban.estadoDestino(destinos, 'hecho', 'nuevo'), 'bloqueado');
  assert.equal(kanban.estadoDestino(destinos2, 'nuevo', 'hecho'), 'neutro');
  assert.equal(kanban.estadoDestino(null, 'curso', 'nuevo'), null, 'sin arrastre no se marca nada');

  // l) Lo que anuncia la región aria-live y el alto del tablero (el alto libre de la ventana, mínimo 420 px).
  assert.equal(kanban.textoMovimiento('PVEN-20260012', 'Listo para entrega'), 'PVEN-20260012 movido a Listo para entrega');
  assert.equal(kanban.textoMovimiento('', 'Cancelado'), 'Movido a Cancelado');
  assert.equal(kanban.ALTO_MINIMO_TABLERO, 420);
  assert.equal(kanban.altoTablero(900, 200), 684, '900 − 200 − 16 de margen');
  assert.equal(kanban.altoTablero(500, 300), 420, 'nunca menos de 420');
  assert.equal(kanban.altoTablero(900, 200, { margen: 0 }), 700);
  assert.equal(kanban.altoTablero(Number.NaN, 0), 420);

  // m) Una columna que llega después (otro juego de columnas, p. ej. el filtro por estado) entra como en la primera carga.
  const vacio = {};
  const conNueva = kanban.asegurarColumna(vacio, 'curso');
  assert.deepEqual(conNueva, { curso: { items: [], total: null, cargando: true, error: null } });
  assert.deepEqual(vacio, {}, 'no muta el anterior');
  const yaEsta = aplicarPagina(conNueva, 'curso', { items: [{ id: 1 }], total: 1 });
  assert.equal(kanban.asegurarColumna(yaEsta, 'curso'), yaEsta, 'si ya está, el mismo tablero');
  assert.equal(aplicarPagina(kanban.asegurarColumna(yaEsta, 'hecho'), 'hecho', { items: [], total: 4 }).hecho.total, 4);
}

console.log('--- TEST 13 (T4B): components/ui/Kanban.tsx sobre el fuente (sin DOM en node) ---');
{
  const fuente = readFileSync(new URL('../src/components/ui/Kanban.tsx', import.meta.url), 'utf8');
  const indice = readFileSync(new URL('../src/components/ui/index.ts', import.meta.url), 'utf8');
  assert.match(indice, /export \* from '\.\/Kanban';/, 'index.ts exporta el tablero');
  assert.ok(fuente.startsWith("'use client';"), "«use client»");
  for (const n of ['useTableroKanban', 'TableroKanban', 'TarjetaKanban']) {
    assert.match(fuente, new RegExp(`export function ${n}\\b`), `exporta ${n}`);
  }
  // Preferencias (R4, C2, RP26, D35 y D38): las plegadas en kanban:<pantalla> con usePreferencia; nada de almacenamiento propio.
  assert.match(fuente, /usePreferencia<[^>]+>\(`kanban:\$\{pantalla\}`/, 'plegadas en kanban:<pantalla>');
  assert.ok(!/localStorage|sessionStorage/.test(fuente), 'el tablero no toca el almacenamiento (R4)');
  // Lógica probada de lib/kanban.js, no copiada.
  for (const n of ['definirColumnas', 'consultaColumna', 'firmaConsulta', 'crearTurnos', 'paginaDeRespuesta', 'aplicarPagina',
    'tableroCliente', 'resolverPlegadas', 'alternarPlegada', 'resolverSoltar', 'mapaDestinos', 'moverTarjeta',
    'deshacerMovimiento', 'reemplazarTarjeta', 'reglaSegunManejadores', 'opcionesMoverA', 'estadoDestino', 'columnaBajoPunto',
    'velocidadAutodesplazamiento', 'superaUmbral', 'estadoColumna', 'textoTotalColumna', 'textoMovimiento',
    'altoEnContenedor' /* r1 (punto 5): altoTablero medido contra el contenedor desplazable */,
    'asegurarColumna', 'quedanEnServidor']) {
    assert.match(fuente, new RegExp(`\\b${n}\\(`), `usa ${n}`);
  }
  // El arrastre del CRM (H1): pointer events, captura después del umbral, Escape y pointercancel cancelan.
  assert.match(fuente, /setPointerCapture\(/);
  assert.match(fuente, /onPointerCancel=/);
  assert.match(fuente, /e\.key === 'Escape'/);
  assert.match(fuente, /className="pointer-events-none fixed left-0 top-0 z-\[80\]/, 'clon flotante sin eventos y en z-[80]');
  assert.match(fuente, /requestAnimationFrame\(/, 'autodesplazamiento cuadro a cuadro');
  // Al soltar: el bloqueo con su motivo y su enlace; el error del servidor; la región aria-live.
  assert.match(fuente, /avisar\(resultado\.motivo, \{ tono: 'error', accion: resultado\.enlace \}\)/);
  assert.match(fuente, /avisarError\(err\)/);
  assert.match(fuente, /aria-live="polite"/);
  // Menú ⋯ (C1): el único MenuFila; contadores con Contador (C13), sin textoContador ni «…».
  assert.match(fuente, /<MenuFila\b/);
  assert.match(fuente, /deshabilitado: !opcion\.permitido/);
  assert.match(fuente, /titulo: opcion\.motivo/);
  assert.match(fuente, /<Contador\b/);
  assert.ok(!/textoContador/.test(fuente));
  assert.ok(!fuente.includes("'…'"), 'sin «…» en los contadores');
  // Tarjeta: el monto con formatoPesos (pesos enteros) y la acción principal sin enlace cuando href es null (D37).
  assert.match(fuente, /formatoPesos\(monto\)/);
  assert.match(fuente, /accionPrincipal\.href \?/);
  // Columnas (KANBAN-base f y g): ancho, celular con scroll-snap, alto mínimo, textos de carga, error y vacío.
  for (const texto of ['w-72', 'w-[85vw]', 'snap-x', 'snap-start', 'min-h-[420px]', 'overflow-x-auto', 'overflow-y-auto',
    "'Sin documentos aquí'", 'Reintentar', 'Soltar aquí', 'Ver más']) {
    assert.ok(fuente.includes(texto), `trae ${texto}`);
  }
  assert.ok(!/\bdark:/.test(fuente), 'sin dark:');
}

console.log('--- TEST 14 (T4B r1): ninguna tarjeta perdida, «Ver más» sin saltos, StrictMode, alto, anuncio y confirmar ---');
{
  for (const n of ['columnaOcupada', 'columnasPorLanzar', 'siguienteAnuncio', 'esDesplazable', 'altoEnContenedor']) {
    assert.ok(n in kanban, `lib/kanban.js exporta ${n}`);
  }
  const columnas = definirColumnas(COLS);
  const donde = (t, id) => Object.entries(t).flatMap(([k, c]) => c.items.filter((x) => x.id === id).map(() => k));
  const base = (cols) => {
    let t = estadoTableroInicial(columnas);
    for (const [k, ids] of Object.entries(cols)) t = aplicarPagina(t, k, { items: ids.map((id) => ({ id, col: k })), total: ids.length });
    return t;
  };
  const deshacerB = (actual, mov, origen, destino) => kanban.deshacerMovimiento(actual, mov.tablero, mov.deshacer,
    { id: 'B', origen, destino, original: { id: 'B', col: origen } });

  // a) S2: el destino se reemplazó en medio (se abrió una plegada, o llegó otra recarga) y después falla: la tarjeta
  //    vuelve al origen una sola vez, con el total correcto.
  {
    const t = base({ nuevo: ['B', 'x2'], curso: ['y1', 'y2'], hecho: [] });
    const mov = moverTarjeta(t, 'B', 'nuevo', 'curso', { estado: 'EN_CURSO' });
    const recargado = aplicarPagina(mov.tablero, 'curso', { items: [{ id: 'y1' }, { id: 'y2' }], total: 2 });
    const r = deshacerB(recargado, mov, 'nuevo', 'curso');
    assert.deepEqual(donde(r, 'B'), ['nuevo'], 'B vuelve al origen');
    assert.deepEqual(r.nuevo.items[0], { id: 'B', col: 'nuevo' }, 'con sus datos de antes');
    assert.deepEqual([r.nuevo.total, r.curso.total], [2, 2]);
    assert.deepEqual(r.curso.items.map((x) => x.id), ['y1', 'y2'], 'lo que llegó al destino se conserva');
  }
  // b) S4: el origen se recargó en medio, ya con la tarjeta, y después falla: está una sola vez y el total del origen no
  //    se toca dos veces.
  {
    const t = base({ nuevo: ['B', 'x2'], curso: ['y1', 'y2'], hecho: [] });
    const mov = moverTarjeta(t, 'B', 'nuevo', 'curso', { estado: 'EN_CURSO' });
    const conOrigen = aplicarPagina(mov.tablero, 'nuevo', { items: [{ id: 'B', col: 'nuevo' }, { id: 'x2' }], total: 2 });
    assert.deepEqual(donde(conOrigen, 'B'), ['nuevo', 'curso'], 'mientras espera, la recarga la trae al origen');
    const r = deshacerB(conOrigen, mov, 'nuevo', 'curso');
    assert.deepEqual(donde(r, 'B'), ['nuevo'], 'una sola vez');
    assert.deepEqual([r.nuevo.total, r.curso.total], [2, 2]);
    assert.equal(r.nuevo, conOrigen.nuevo, 'el origen recargado queda tal cual');
    // Origen y destino recargados: ya está bien, nada cambia.
    const ambos = aplicarPagina(conOrigen, 'curso', { items: [{ id: 'y1' }, { id: 'y2' }], total: 2 });
    assert.equal(deshacerB(ambos, mov, 'nuevo', 'curso'), ambos);
  }
  // c) S1: dos tarjetas seguidas hacia la misma columna; la recarga del primer éxito llega mientras la segunda espera, y
  //    la segunda falla.
  {
    let t = base({ nuevo: ['A', 'x2'], curso: ['y1'], hecho: ['B', 'z2'] });
    const movA = moverTarjeta(t, 'A', 'nuevo', 'curso', { estado: 'EN_CURSO' });
    t = kanban.reemplazarTarjeta(movA.tablero, 'curso', 'A', { id: 'A', col: 'curso' }); // éxito de A; recargar en camino
    const movB = moverTarjeta(t, 'B', 'hecho', 'curso', { estado: 'EN_CURSO' });
    let llegada = aplicarPagina(movB.tablero, 'nuevo', { items: [{ id: 'x2' }], total: 1 });
    llegada = aplicarPagina(llegada, 'curso', { items: [{ id: 'A', col: 'curso' }, { id: 'y1' }], total: 2 }); // sin B
    const r = deshacerB(llegada, movB, 'hecho', 'curso');
    assert.deepEqual(donde(r, 'B'), ['hecho'], 'B no se pierde');
    assert.deepEqual(donde(r, 'A'), ['curso'], 'A sigue donde la dejó el servidor');
    assert.deepEqual([r.nuevo.total, r.curso.total, r.hecho.total], [1, 2, 2], 'los totales son los del servidor');
  }

  // d) Punto 3: mientras un movimiento hacia o desde una columna espera, su «Ver más» queda quieto (el offset contaría la
  //    tarjeta optimista y el servidor saltaría un id).
  const pendientes = new Map([['B', { origen: 'nuevo', destino: 'curso' }]]);
  assert.equal(kanban.columnaOcupada(pendientes.values(), 'curso'), true, 'hacia ella');
  assert.equal(kanban.columnaOcupada(pendientes.values(), 'nuevo'), true, 'desde ella');
  assert.equal(kanban.columnaOcupada(pendientes.values(), 'hecho'), false);
  assert.equal(kanban.columnaOcupada([], 'curso'), false);
  assert.equal(kanban.columnaOcupada(null, 'curso'), false);

  // e) Punto 4: qué columnas se lanzan. La guarda evita repetir una consulta; el desmontaje (también el de StrictMode)
  //    la limpia y al montar otra vez se relanza todo.
  const deseadas = { nuevo: { firma: 'f1' }, curso: { firma: 'f2' }, hecho: { firma: 'f3' } };
  const primera = kanban.columnasPorLanzar(columnas, deseadas, {});
  assert.deepEqual(primera.lista.map((c) => c.clave), ['nuevo', 'curso', 'hecho'], 'montar lanza todas');
  assert.deepEqual(primera.lanzadas, { nuevo: 'f1', curso: 'f2', hecho: 'f3' });
  assert.deepEqual(kanban.columnasPorLanzar(columnas, deseadas, primera.lanzadas).lista, [], 'sin cambios no repite');
  const guarda = { ...primera.lanzadas };
  kanban.columnasPorLanzar(columnas, { ...deseadas, curso: { firma: 'otra' } }, primera.lanzadas);
  assert.deepEqual(primera.lanzadas, guarda, 'no muta la guarda que recibe');
  assert.deepEqual(kanban.columnasPorLanzar(columnas, { ...deseadas, curso: { firma: 'otra' } }, primera.lanzadas).lista.map((c) => c.clave), ['curso']);
  // Montar → abortar en el desmontaje (la guarda vuelve a {}) → montar: se relanza todo.
  assert.deepEqual(kanban.columnasPorLanzar(columnas, deseadas, {}).lista.map((c) => c.clave), ['nuevo', 'curso', 'hecho']);
  assert.deepEqual(kanban.columnasPorLanzar(columnas, { nuevo: { firma: 'f1' } }, {}).lista.map((c) => c.clave), ['nuevo'],
    'una columna sin consulta vigente no se lanza');

  // f) Punto 7: un anuncio igual al anterior se vuelve a decir (alterna un espacio invisible).
  const a1 = kanban.siguienteAnuncio('', 'PVEN-1 movido a Facturado');
  assert.equal(a1, 'PVEN-1 movido a Facturado');
  const a2 = kanban.siguienteAnuncio(a1, 'PVEN-1 movido a Facturado');
  assert.notEqual(a2, a1, 'el mismo texto cambia para que aria-live lo lea otra vez');
  assert.equal(a2.replace(/​/g, ''), a1);
  const a3 = kanban.siguienteAnuncio(a2, 'PVEN-1 movido a Facturado');
  assert.notEqual(a3, a2);
  assert.equal(kanban.siguienteAnuncio(a2, 'Otro'), 'Otro');

  // g) Punto 5: el alto se calcula contra el contenedor desplazable (el <main> del dashboard), sin inflarse si ya está
  //    desplazado.
  for (const v of ['auto', 'scroll', 'overlay']) assert.equal(kanban.esDesplazable(v), true, v);
  for (const v of ['visible', 'hidden', 'clip', '', undefined]) assert.equal(kanban.esDesplazable(v), false, String(v));
  assert.equal(kanban.altoEnContenedor({ altoVisible: 900, arriba: 200 }), 684, 'como altoTablero sin desplazar');
  assert.equal(kanban.altoEnContenedor({ altoVisible: 900, arriba: 50, desplazado: 150 }), 684, 'desplazado 150: el mismo alto');
  assert.equal(kanban.altoEnContenedor({ altoVisible: 836, arriba: 264, arribaContenedor: 64 }), 620, 'el top es el del contenedor');
  assert.equal(kanban.altoEnContenedor({ altoVisible: 500, arriba: 300 }), 420, 'mínimo 420');

  // h) Punto 7: confirmar mezcla la respuesta del servidor sobre la fila (el PATCH no trae todos los campos).
  {
    const idHub = (x) => `${x.tipo}|${x.id}`;
    const t = { nuevo: { items: [], total: 0, cargando: false, error: null },
      curso: { items: [{ id: 5, tipo: 'COT', numero: 'COT-5', cliente: 'Ana', estado: 'BORRADOR' }], total: 1, cargando: false, error: null } };
    const r = kanban.reemplazarTarjeta(t, 'curso', 'COT|5', { id: 5, estado: 'ENVIADA' }, { idDe: idHub });
    assert.deepEqual(r.curso.items[0], { id: 5, tipo: 'COT', numero: 'COT-5', cliente: 'Ana', estado: 'ENVIADA' });
    assert.equal(idHub(r.curso.items[0]), 'COT|5', 'la tarjeta conserva su id');
  }

  // i) Kanban.tsx sobre el fuente (sin DOM en node).
  const fuente = readFileSync(new URL('../src/components/ui/Kanban.tsx', import.meta.url), 'utf8');
  // Punto 2: el servidor manda también cuando falla (r2: la recarga de las dos columnas la hace el hook en deshacer y en
  // confirmar, y la tarjeta sigue pendiente hasta que llega; TEST 15).
  assert.match(fuente, /catch \(err\) \{\s*movimiento\.deshacer\(\);/);
  // Punto 3: «Ver más» quieto con un movimiento pendiente (en el botón y en el hook; r2: los pendientes son del hook).
  assert.match(fuente, /const ocupada = columnaOcupada\(tablero\.movimientosPendientes, c\.clave\);/);
  assert.match(fuente, /disabled=\{d\.cargandoMas \|\| d\.cargando \|\| ocupada( \|\| d\.cargaFallida)?\}/);
  assert.match(fuente, /if \(columnaOcupada\(pendientesRef\.current, clave\)\) return;/);
  // Punto 4: el desmontaje aborta y limpia la guarda (StrictMode monta, desmonta y vuelve a montar).
  assert.match(fuente,
    /for \(const \{ control \} of Object\.values\(vivos\)\) control\.abort\(\);[\s\S]{0,500}?lanzadas\.current = \{\};\s*ultimasDeps\.current = null;/);
  assert.match(fuente, /columnasPorLanzar\(/);
  // Punto 5: el alto se recalcula con el aviso y el banner, y con el contenedor desplazable y el propio tablero.
  assert.match(fuente, /useLayoutEffect\(\(\) => \{\s*ajustarAlto\(\);\s*\}, \[aviso, soloVer, ajustarAlto\]\);/);
  assert.match(fuente, /observador\.observe\(desplazable\);/);
  assert.match(fuente, /observador\.observe\(envoltura\.current\);/);
  assert.match(fuente, /esDesplazable\(/);
  assert.match(fuente, /altoEnContenedor\(/);
  // Punto 6: el foco va a la tarjeta en su columna nueva (o al encabezado) y queda en el botón de plegar o abrir.
  assert.match(fuente, /data-tarjeta=\{clave\}/);
  assert.match(fuente, /tabIndex=\{-1\}/);
  assert.match(fuente, /data-encabezado/);
  assert.match(fuente, /data-plegar="abrir"/);
  assert.match(fuente, /data-plegar="plegar"/);
  assert.match(fuente, /setFocoPendiente\(\(previo\) => \(\{ \.\.\.foco, n: \(previo\?\.n \?\? 0\) \+ 1 \}\)\)/);
  assert.match(fuente, /void soltar\(item, origen, opcion\.clave, true\);/, '«Mover a…» pide que el foco siga a la tarjeta');
  assert.match(fuente, /if \(desdeMenu\) enfocarDespues\(\{ columna: destino, tarjeta: clave \}\);/);
  assert.match(fuente, /enfocarDespues\(\{ columna: clave, boton: plegada \? 'abrir' : 'plegar' \}\);/);
  assert.match(fuente, /objetivo \?\?= seccion\.querySelector<HTMLElement>\('\[data-encabezado\]'\);/, 'si no se ve, el encabezado');
  // Punto 7: perder la captura cancela; el anuncio se repite; contraste.
  assert.match(fuente, /onLostPointerCapture=\{alPerderCaptura\}/);
  assert.match(fuente, /siguienteAnuncio\(/);
  assert.ok(!fuente.includes('text-slate-400'), 'el tiempo, el vacío y el ícono de plegar en text-slate-500');
}

console.log('--- TEST 15 (T4B r2): una tarjeta sigue pendiente hasta la recarga de su movimiento (copias viejas) ---');
{
  for (const n of ['agregarPendiente', 'esperarRecarga', 'llegoRecarga', 'idsPendientes', 'subirVersiones', 'cancelarVerMas',
    'marcarRecibido']) {
    assert.ok(n in kanban, `lib/kanban.js exporta ${n}`);
  }
  const columnas = definirColumnas(COLS);
  const CUATRO = definirColumnas(['X', 'Y', 'Z', 'W'].map((k) => ({ clave: k, titulo: k })));

  // El flujo del modo servidor de useTableroKanban con las funciones de la librería, en el orden en que las llama el
  // hook: moverOptimista → agregarPendiente; confirmar/deshacer → subirVersiones de origen y destino + esperarRecarga;
  // cada respuesta principal → aplicarPagina + marcarRecibido + llegoRecarga. TableroKanban no deja mover una tarjeta
  // cuyo id está en idsPendientes. El servidor lee cuando se le pide (la «foto») y responde después.
  function flujo(inicial, cargadas = Object.keys(inicial)) {
    const srv = structuredClone(inicial);
    const s = { srv, tablero: {}, pendientes: [], versiones: {}, n: 0, rechazados: 0 };
    s.foto = (k) => ({ items: srv[k].map((id) => ({ id, col: k })), total: srv[k].length });
    s.llega = (k, pagina, version) => {
      s.tablero = kanban.marcarRecibido(aplicarPagina(kanban.asegurarColumna(s.tablero, k), k, pagina), k);
      s.pendientes = kanban.llegoRecarga(s.pendientes, k, version);
    };
    for (const k of cargadas) s.llega(k, s.foto(k), 0);
    s.mover = (id, origen, destino) => {
      if (kanban.idsPendientes(s.pendientes).has(String(id))) { s.rechazados++; return null; }
      const n = ++s.n;
      s.pendientes = kanban.agregarPendiente(s.pendientes, { n, id, origen, destino });
      let movido = null;
      let deshacer = null;
      if (s.tablero[origen] && s.tablero[destino]) {
        ({ tablero: movido, deshacer } = moverTarjeta(s.tablero, id, origen, destino, { col: destino }));
        s.tablero = movido;
      }
      const cerrar = () => {
        const r = kanban.subirVersiones(s.versiones, [origen, destino], CUATRO.map((c) => c.clave));
        s.versiones = r.versiones;
        s.pendientes = kanban.esperarRecarga(s.pendientes, n, r.subidas);
        return r.subidas;
      };
      return {
        ok() {
          srv[origen] = srv[origen].filter((x) => x !== id);
          for (const k of Object.keys(srv)) srv[k] = srv[k].filter((x) => x !== id);
          srv[destino] = [id, ...srv[destino]];
          if (s.tablero[destino]) s.tablero = kanban.reemplazarTarjeta(s.tablero, destino, id, { id, col: destino });
          return cerrar();
        },
        falla() {
          if (movido) s.tablero = kanban.deshacerMovimiento(s.tablero, movido, deshacer, { id, origen, destino, original: { id, col: origen } });
          return cerrar();
        },
      };
    };
    s.comparar = () => {
      const vistos = {};
      for (const [k, c] of Object.entries(s.tablero)) {
        assert.deepEqual(c.items.map((x) => x.id), srv[k], `${k}: las tarjetas del servidor`);
        assert.equal(c.total, srv[k].length, `${k}: el total del servidor`);
        for (const x of c.items) vistos[x.id] = [...(vistos[x.id] ?? []), k];
      }
      for (const [id, cols] of Object.entries(vistos)) assert.equal(cols.length, 1, `${id} en ${cols.join(', ')}`);
    };
    return s;
  }

  // CV1: dos tarjetas seguidas desde X. La recarga del éxito de A se lee antes de que el servidor aplique B y trae a B
  // otra vez a X (copia vieja). B sale bien; antes de que llegue su recarga, el usuario quiere mover la copia de X a W.
  {
    const s = flujo({ X: ['A', 'B', 'x3'], Y: ['y1'], Z: ['z1'], W: ['w1'] });
    const a = s.mover('A', 'X', 'Y');
    const b = s.mover('B', 'X', 'Z');
    const va = a.ok();
    const fotosA = { X: s.foto('X'), Y: s.foto('Y') }; // el servidor lee antes de aplicar B
    s.llega('X', fotosA.X, va.X);
    s.llega('Y', fotosA.Y, va.Y);
    assert.deepEqual(kanban.idsPendientes(s.pendientes), new Set(['B']), 'A ya no espera; B sí (su PATCH sigue en camino)');
    const vb = b.ok();
    const fotosB = { X: s.foto('X'), Z: s.foto('Z') };
    assert.deepEqual([...kanban.idsPendientes(s.pendientes)], ['B'], 'B sigue pendiente hasta la recarga de su movimiento');
    assert.equal(s.mover('B', 'X', 'W'), null, 'la copia vieja de B no se puede mover');
    assert.equal(s.rechazados, 1);
    s.llega('X', fotosB.X, vb.X);
    assert.deepEqual([...kanban.idsPendientes(s.pendientes)], ['B'], 'falta la recarga de Z');
    s.llega('Z', fotosB.Z, vb.Z);
    assert.equal(kanban.idsPendientes(s.pendientes).size, 0, 'con las dos recargas, B queda libre');
    s.comparar();
  }
  // CV2: el destino Y todavía no había cargado (sin movimiento optimista). B sale bien y sigue en X hasta la recarga;
  // «Mover a Z» sobre esa copia no sale. La recarga de después incluye Y.
  {
    const s = flujo({ X: ['B', 'x2'], Y: ['y1'], Z: ['z1'] }, ['X', 'Z']);
    const b = s.mover('B', 'X', 'Y');
    assert.equal(s.tablero.Y, undefined, 'Y sin cargar: no hay movimiento optimista');
    const v = b.ok();
    assert.deepEqual(v, { X: 1, Y: 1 }, 'la recarga de después incluye el destino que no había cargado');
    const fotos = { X: s.foto('X'), Y: s.foto('Y') };
    assert.equal(s.mover('B', 'X', 'Z'), null, 'la copia de X espera la recarga');
    s.llega('Y', { items: [{ id: 'y1', col: 'Y' }], total: 1 }, 0); // la primera carga de Y, vieja: no suelta nada
    assert.deepEqual([...kanban.idsPendientes(s.pendientes)], ['B'], 'una respuesta de una versión anterior no suelta la espera');
    s.llega('X', fotos.X, v.X);
    s.llega('Y', fotos.Y, v.Y);
    assert.equal(kanban.idsPendientes(s.pendientes).size, 0);
    s.comparar();
  }
  // Un movimiento que falla también espera su recarga; una recarga que falla también suelta (llegoRecarga desde catch).
  {
    const s = flujo({ X: ['B', 'x2'], Y: ['y1'] });
    const v = s.mover('B', 'X', 'Y').falla();
    assert.deepEqual([...kanban.idsPendientes(s.pendientes)], ['B']);
    s.pendientes = kanban.llegoRecarga(s.pendientes, 'X', v.X); // la recarga de X falló
    s.llega('Y', s.foto('Y'), v.Y);
    assert.equal(kanban.idsPendientes(s.pendientes).size, 0);
  }
  // esperarRecarga sin recargas (modo cliente, o columnas que ya no están): el movimiento termina ahí mismo. Una
  // versión posterior también suelta; sin cambios, la misma lista.
  {
    let l = kanban.agregarPendiente([], { n: 1, id: 7, origen: 'X', destino: 'Y' });
    assert.deepEqual([...kanban.idsPendientes(l)], ['7'], 'los ids como texto, igual que las claves de la tarjeta');
    assert.equal(kanban.esperarRecarga(l, 1, {}).length, 0);
    l = kanban.esperarRecarga(l, 1, { X: 3, Y: 2 });
    assert.equal(kanban.llegoRecarga(l, 'Z', 9), l, 'otra columna: nada cambia');
    l = kanban.llegoRecarga(l, 'X', 5);
    assert.deepEqual(l[0].espera, { Y: 2 }, 'una versión posterior a la esperada también suelta');
    assert.equal(kanban.llegoRecarga(l, 'Y', 1), l, 'una anterior no');
    assert.equal(kanban.llegoRecarga(l, 'Y', 2).length, 0);
    const sinEspera = kanban.agregarPendiente([], { n: 2, id: 'A', origen: 'X', destino: 'Y' });
    assert.equal(kanban.llegoRecarga(sinEspera, 'X', 99), sinEspera, 'mientras el PATCH no responde, ninguna recarga lo suelta');
  }
  // subirVersiones (r3, punto 1): sube la versión de TODA clave pedida (una columna oculta se recarga al reaparecer);
  // `subidas`, lo que el movimiento espera, son solo las visibles.
  {
    const r = kanban.subirVersiones({ X: 2 }, ['X', 'Y', 'vieja'], ['X', 'Y', 'Z']);
    assert.deepEqual(r, { versiones: { X: 3, Y: 1, vieja: 1 }, subidas: { X: 3, Y: 1 } });
    assert.deepEqual(kanban.subirVersiones({ X: 2 }, undefined, ['X', 'Y']).subidas, { X: 3, Y: 1 }, 'sin claves, todas las visibles');
  }

  // Punto 2 (R3b): un «Ver más» en vuelo en el origen o el destino se deja al empezar el movimiento.
  {
    let t = estadoTableroInicial(columnas);
    t = aplicarPagina(t, 'nuevo', { items: [{ id: 1 }], total: 9 });
    t = aplicarPagina(t, 'curso', { items: [{ id: 2 }], total: 1 });
    t = { ...t, nuevo: { ...t.nuevo, cargandoMas: true, errorMas: null } };
    const r = kanban.cancelarVerMas(t, ['nuevo', 'curso']);
    assert.deepEqual(r.abortar, ['nuevo'], 'solo la que tenía uno en camino');
    assert.equal(r.tablero.nuevo.cargandoMas, false);
    assert.equal(r.tablero.curso, t.curso);
    const quieto = kanban.cancelarVerMas(r.tablero, ['nuevo', 'curso']);
    assert.equal(quieto.tablero, r.tablero, 'sin nada en camino, el mismo tablero');
    assert.deepEqual(quieto.abortar, []);
  }

  // Punto 3 (R8b): B estaba 5ª en X (llegó con «Ver más»); otra tarjeta sale de X con éxito y X se recarga con la primera
  // página, sin B (4ª en el servidor). B falla: X queda en el total del servidor, no en uno más, y B no se inserta (la
  // recarga de después la pone en su lugar).
  {
    const tres = definirColumnas(['X', 'Y', 'Z'].map((k) => ({ clave: k, titulo: k })));
    let t = estadoTableroInicial(tres);
    const pag = (k, ids, total = ids.length) => { t = kanban.marcarRecibido(aplicarPagina(t, k, { items: ids.map((id) => ({ id })), total }), k); };
    pag('X', ['x0', 'x1', 'x2', 'x3', 'B']);
    pag('Y', ['y1']);
    pag('Z', ['z1']);
    const movB = moverTarjeta(t, 'B', 'X', 'Y');
    t = movB.tablero;
    t = moverTarjeta(t, 'x0', 'X', 'Z').tablero; // éxito de x0
    pag('X', ['x1', 'x2', 'x3'], 4); // la recarga de X: B sigue en el servidor (4ª), fuera de la página
    const r = kanban.deshacerMovimiento(t, movB.tablero, movB.deshacer, { id: 'B', origen: 'X', destino: 'Y', original: { id: 'B' } });
    assert.equal(r.X.total, 4, 'X en el total del servidor');
    assert.deepEqual(r.X.items.map((x) => x.id), ['x1', 'x2', 'x3'], 'B no se inserta: ya está contada');
    assert.deepEqual([r.Y.items.map((x) => x.id), r.Y.total], [['y1'], 1], 'sale del destino');
    // Si el destino recibió datos del servidor después del movimiento, tampoco se toca (el servidor manda).
    const conDestino = kanban.marcarRecibido(aplicarPagina(t, 'Y', { items: [{ id: 'B' }, { id: 'y1' }], total: 2 }), 'Y');
    const r2 = kanban.deshacerMovimiento(conDestino, movB.tablero, movB.deshacer, { id: 'B', origen: 'X', destino: 'Y', original: { id: 'B' } });
    assert.deepEqual([r2.Y.items.map((x) => x.id), r2.Y.total], [['B', 'y1'], 2]);
    assert.equal(kanban.marcarRecibido(t, 'Y').Y.recibido, (t.Y.recibido ?? 0) + 1);
  }

  // ── r3 ──
  for (const n of ['soltarEsperasOcultas', 'bloqueoDeColumna', 'TEXTO_REINTENTA_COLUMNA', 'ESPERA_RECARGA_MS',
    'crearTopesDeEspera', 'vencerEspera']) {
    assert.ok(n in kanban, `lib/kanban.js exporta ${n}`);
  }
  const tresCols = (claves) => definirColumnas(claves.map((k) => ({ clave: k, titulo: k })));
  const dondeEsta = (t, id) => Object.entries(t).flatMap(([k, c]) => c.items.filter((x) => x.id === id).map(() => k));

  // r3 punto 1 (E10): la pantalla oculta X y Y (un filtro) mientras el PATCH de B (X→Y) está en camino; el servidor lo
  // aplica pero el cliente recibe un error, así que B vuelve a X. Al volver a verse, X y Y se recargan (sus versiones
  // subieron aunque no se veían) y ninguna tarjeta queda duplicada ni con lo viejo.
  {
    const srv = { X: ['B', 'x2'], Y: ['y1'], Z: ['z1'] };
    const todas = ['X', 'Y', 'Z'];
    let t = {};
    let versiones = {};
    let lanzadas = {};
    const deseadasDe = (vis) => Object.fromEntries(vis.map((k) => [k, { firma: `v${versiones[k] ?? 0}` }]));
    const llega = (k) => { t = kanban.marcarRecibido(aplicarPagina(kanban.asegurarColumna(t, k), k, { items: srv[k].map((id) => ({ id })), total: srv[k].length }), k); };
    const lanzar = (vis) => {
      const r = kanban.columnasPorLanzar(tresCols(vis), deseadasDe(vis), lanzadas);
      lanzadas = r.lanzadas;
      return r.lista.map((c) => c.clave);
    };
    for (const k of lanzar(todas)) llega(k);
    let pend = kanban.agregarPendiente([], { n: 1, id: 'B', origen: 'X', destino: 'Y' });
    const mov = moverTarjeta(t, 'B', 'X', 'Y');
    t = mov.tablero;
    const visibles = ['Z']; // el filtro
    srv.X = ['x2']; srv.Y = ['B', 'y1']; // el servidor aplica el cambio…
    t = kanban.deshacerMovimiento(t, mov.tablero, mov.deshacer, { id: 'B', origen: 'X', destino: 'Y', original: { id: 'B' } }); // …y el cliente recibe error
    const s = kanban.subirVersiones(versiones, ['X', 'Y'], visibles);
    versiones = s.versiones;
    assert.deepEqual(versiones, { X: 1, Y: 1 }, 'las ocultas también suben de versión');
    assert.deepEqual(s.subidas, {}, 'el movimiento no espera columnas que no se ven');
    pend = kanban.esperarRecarga(pend, 1, s.subidas);
    assert.equal(pend.length, 0);
    assert.deepEqual(lanzar(visibles), [], 'mientras no se ven, nada se lanza');
    const relanzadas = lanzar(todas); // se quita el filtro
    assert.deepEqual(relanzadas, ['X', 'Y'], 'al volver a verse, se recargan');
    for (const k of relanzadas) llega(k);
    assert.deepEqual(dondeEsta(t, 'B'), ['Y'], 'B una sola vez, donde la tiene el servidor');
    assert.deepEqual([t.X.items.map((x) => x.id), t.X.total, t.Y.total], [['x2'], 1, 2]);
  }
  // Las esperas de columnas que dejaron de verse se sueltan en el efecto que lanza (soltarEsperasOcultas).
  {
    let l = kanban.esperarRecarga(kanban.agregarPendiente([], { n: 1, id: 'A', origen: 'X', destino: 'Y' }), 1, { X: 1, Y: 2 });
    assert.equal(kanban.soltarEsperasOcultas(l, ['X', 'Y', 'Z']), l, 'todas visibles: la misma lista');
    l = kanban.soltarEsperasOcultas(l, ['Y', 'Z']);
    assert.deepEqual(l[0].espera, { Y: 2 }, 'X dejó de verse: ya no se espera');
    assert.equal(kanban.soltarEsperasOcultas(l, ['Z']).length, 0, 'sin nada que esperar, termina');
    const sinEspera = kanban.agregarPendiente([], { n: 2, id: 'B', origen: 'X', destino: 'Y' });
    assert.equal(kanban.soltarEsperasOcultas(sinEspera, []), sinEspera, 'un PATCH en camino no se suelta');
  }

  // r3 punto 2 (E1): CV1 y la recarga de X (la del movimiento de B) falla. B queda libre, pero X sigue pintando su copia
  // vieja: mientras la última carga de X sea un error, sus tarjetas no se mueven; con un Reintentar exitoso, sí.
  {
    const s = flujo({ X: ['A', 'B', 'x3'], Y: ['y1'], Z: ['z1'], W: ['w1'] });
    const a = s.mover('A', 'X', 'Y');
    const b = s.mover('B', 'X', 'Z');
    const va = a.ok();
    const fotosA = { X: s.foto('X'), Y: s.foto('Y') };
    s.llega('X', fotosA.X, va.X);
    s.llega('Y', fotosA.Y, va.Y);
    const vb = b.ok();
    s.tablero = marcarColumna(s.tablero, 'X', { error: new Error('Sin conexión'), cargando: false }); // la recarga de X falla
    s.pendientes = kanban.llegoRecarga(s.pendientes, 'X', vb.X);
    s.llega('Z', s.foto('Z'), vb.Z);
    assert.equal(kanban.idsPendientes(s.pendientes).size, 0, 'B ya no espera');
    assert.ok(s.tablero.X.items.some((x) => x.id === 'B'), 'X (con error) sigue pintando la copia vieja de B');
    const datosX = { ...s.tablero.X, cargaFallida: Boolean(s.tablero.X.error) };
    assert.equal(kanban.TEXTO_REINTENTA_COLUMNA, 'Reintenta esta columna para mover sus tarjetas.');
    assert.equal(kanban.bloqueoDeColumna(datosX), kanban.TEXTO_REINTENTA_COLUMNA, 'la copia de X no se puede mover');
    const destinos = mapaDestinos({ id: 'B' }, 'X', CUATRO, () => ({ tipo: 'cambio', estado: 'W' }));
    assert.deepEqual(kanban.opcionesMoverA('X', CUATRO, destinos, { bloqueo: kanban.bloqueoDeColumna(datosX) }),
      ['Y', 'Z', 'W'].map((k) => ({ clave: k, titulo: k, permitido: false, motivo: 'Reintenta esta columna para mover sus tarjetas.' })),
      'en «Mover a…», todos los destinos deshabilitados con el motivo');
    s.llega('X', s.foto('X'), vb.X + 1); // Reintentar sale bien
    assert.equal(kanban.bloqueoDeColumna({ ...s.tablero.X, cargaFallida: Boolean(s.tablero.X.error) }), null, 'todo vuelve a ser normal');
    assert.equal(kanban.bloqueoDeColumna(undefined), null);
    s.comparar();
  }

  // r3 punto 3: el tope de espera de una recarga (reloj falso). Vence a los ESPERA_RECARGA_MS, suelta lo que faltaba y
  // la pantalla lo vuelve a pedir; se quita si el movimiento termina antes y al desmontar. El PATCH no lleva tope.
  {
    assert.equal(kanban.ESPERA_RECARGA_MS, 20000);
    const reloj = (() => {
      let ahora = 0;
      let siguiente = 0;
      const tareas = new Map();
      return {
        setTimeout(f, ms) { tareas.set(++siguiente, { f, cuando: ahora + ms }); return siguiente; },
        clearTimeout(i) { tareas.delete(i); },
        avanzar(ms) { ahora += ms; for (const [i, tarea] of [...tareas]) if (tarea.cuando <= ahora) { tareas.delete(i); tarea.f(); } },
        cuantas: () => tareas.size,
      };
    })();
    const vencidos = [];
    const topes = kanban.crearTopesDeEspera({ alVencer: (n) => vencidos.push(n), temporizador: reloj });
    let l = kanban.esperarRecarga(kanban.agregarPendiente([], { n: 1, id: 'B', origen: 'X', destino: 'Y' }), 1, { X: 1, Y: 1 });
    topes.armar(1);
    topes.armar(1);
    assert.equal(reloj.cuantas(), 1, 'un solo temporizador por movimiento');
    l = kanban.llegoRecarga(l, 'X', 1); // llega X; Y no responde
    topes.sincronizar(l);
    reloj.avanzar(19999);
    assert.deepEqual(vencidos, [], 'antes del tope, nada');
    reloj.avanzar(1);
    assert.deepEqual(vencidos, [1], 'a los 20 s vence');
    const v = kanban.vencerEspera(l, 1);
    assert.deepEqual(v.faltan, ['Y'], 'lo que faltaba, para volver a pedirlo');
    assert.equal(v.lista.length, 0, 'la tarjeta queda libre');
    assert.deepEqual(kanban.vencerEspera(v.lista, 1), { lista: v.lista, faltan: [] }, 'un movimiento que ya no está: nada');
    // El movimiento termina antes del tope: su temporizador se quita.
    let l2 = kanban.esperarRecarga(kanban.agregarPendiente([], { n: 2, id: 'C', origen: 'X', destino: 'Y' }), 2, { X: 2 });
    topes.armar(2);
    l2 = kanban.llegoRecarga(l2, 'X', 2);
    topes.sincronizar(l2);
    assert.equal(reloj.cuantas(), 0);
    reloj.avanzar(60000);
    assert.deepEqual(vencidos, [1], 'no vence un movimiento que ya terminó');
    // Un movimiento cuyo PATCH no ha respondido (espera null) no tiene tope; al desmontar se limpian todos.
    const l3 = kanban.agregarPendiente([], { n: 3, id: 'D', origen: 'X', destino: 'Y' });
    topes.armar(3);
    topes.sincronizar(l3);
    assert.equal(reloj.cuantas(), 0, 'sin espera de recarga no hay tope (el PATCH no lo lleva)');
    topes.armar(4);
    topes.limpiar();
    assert.equal(reloj.cuantas(), 0, 'al desmontar');
    reloj.avanzar(60000);
    assert.deepEqual(vencidos, [1]);
  }

  // r3 punto 4 (E7b): un «Ver más» en vuelo se cancela al mover y su slot toma un turno nuevo, así que su página se
  // descarta aunque llegue (cargar no le pasó el signal a apiFetch).
  {
    const turnos = kanban.crearTurnos();
    let t = estadoTableroInicial(columnas);
    t = aplicarPagina(t, 'nuevo', { items: [{ id: 'x1' }, { id: 'x2' }, { id: 'x3' }], total: 6 });
    t = aplicarPagina(t, 'curso', { items: [{ id: 'y1' }], total: 1 });
    const turnoVerMas = turnos.siguiente('nuevo');
    t = { ...t, nuevo: { ...t.nuevo, cargandoMas: true } };
    const control = new AbortController();
    const r = kanban.cancelarVerMas(t, ['nuevo', 'curso']);
    for (const clave of r.abortar) { control.abort(); turnos.siguiente(clave); }
    t = moverTarjeta(r.tablero, 'x1', 'nuevo', 'curso').tablero;
    // La página corrida llega igual (cargar ignoró el signal): el then de pedir mira el turno y la descarta.
    const llegaria = turnos.vigente('nuevo', turnoVerMas);
    assert.equal(llegaria, false, 'la respuesta vieja se descarta aunque llegue');
    assert.deepEqual(t.nuevo.items.map((x) => x.id), ['x2', 'x3']);
    assert.equal(t.nuevo.cargandoMas, false);
  }

  // Kanban.tsx sobre el fuente.
  const fuente = readFileSync(new URL('../src/components/ui/Kanban.tsx', import.meta.url), 'utf8');
  // Punto 1: los pendientes viven en el hook; TableroKanban no tiene estado propio de espera.
  assert.match(fuente, /actualizarPendientes\(\(l\) => agregarPendiente\(l, \{ n, id, origen, destino \}\)\);/);
  assert.match(fuente, /actualizarPendientes\(\(l\) => esperarRecarga\(l, n, subidas\)\);/);
  assert.match(fuente, /actualizarPendientes\(\(l\) => llegoRecarga\(l, clave, version\)\);/);
  assert.ok((fuente.match(/llegoRecarga\(/g) ?? []).length >= 2, 'suelta la espera al llegar y al fallar la recarga');
  assert.match(fuente, /pendientes: ReadonlySet<string>;/);
  assert.match(fuente, /if \(tablero\.pendientes\.has\(clave\)\) return;/);
  // r3: la guarda del arrastre suma la columna con su última carga fallida.
  assert.match(fuente, /if \(soloVer \|\| tablero\.pendientes\.has\(s\.clave\) \|\| bloqueoDeColumna\(tablero\.datos\[s\.origen\]\)\)/);
  assert.match(fuente, /const pendiente = tablero\.pendientes\.has\(clave\);/);
  assert.ok(!/marcarEsperando|setEsperando/.test(fuente), 'el tablero ya no lleva su propia espera');
  // Punto 2: el «Ver más» en vuelo se aborta al empezar un movimiento.
  assert.match(fuente, /const \{ tablero: sinVerMas, abortar \} = cancelarVerMas\(tableroRef\.current, \[origen, destino\]\);/);
  // r3 punto 4: además del abort, un turno nuevo para ese slot (la respuesta vieja se descarta aunque llegue).
  assert.match(fuente, /if \(slot\?\.agregar\) \{\s*slot\.control\.abort\(\);\s*obtenerTurnos\(\)\.siguiente\(clave\);\s*\}/);
  // Punto 3: cada respuesta del servidor marca la columna.
  assert.match(fuente, /marcarRecibido\(/);
  // Punto 4: el arrastre se cancela si el nodo sale del DOM.
  for (const tipo of ['lostpointercapture', 'pointerup', 'pointercancel']) {
    assert.match(fuente, new RegExp(`document\\.addEventListener\\('${tipo}', alDocumento, true\\);`), `escucha ${tipo} en document`);
    assert.match(fuente, new RegExp(`document\\.removeEventListener\\('${tipo}', alDocumento, true\\);`), `y lo quita`);
  }
  assert.match(fuente, /if \(seguido && !seguido\.el\.isConnected\) \{/, 'el bucle rAF cancela si la tarjeta salió del DOM');
  // Punto 6: sin contenedor desplazable, también document.body.
  assert.match(fuente, /else observador\.observe\(document\.body\);/);
  // r3 punto 1: el efecto que lanza suelta las esperas de las columnas que ya no se ven.
  assert.match(fuente, /actualizarPendientes\(\(l\) => soltarEsperasOcultas\(l, visibles\)\)/);
  // r3 punto 2: una columna cuya última carga falló no deja mover sus tarjetas (arrastre, «Mover a…» y soltar).
  assert.match(fuente, /cargaFallida: Boolean\(base\.error\)/);
  assert.ok((fuente.match(/bloqueoDeColumna\(tablero\.datos\[/g) ?? []).length >= 3, 'en el arrastre, en el menú y en soltar');
  assert.match(fuente, /opcionesMoverA\(origen, columnas, destinos, \{ bloqueo \}\)/);
  // r3 punto 3: el tope se arma en cerrar (con la espera de la recarga), se sincroniza con los pendientes y se limpia al
  // desmontar; el PATCH no lo lleva.
  assert.match(fuente, /if \(Object\.keys\(subidas\)\.length\) obtenerTopes\(\)\.armar\(n\);/);
  assert.match(fuente, /topes\.current\?\.sincronizar\(nueva\);/);
  assert.match(fuente, /topes\.current\?\.limpiar\(\);/);
  assert.match(fuente, /const \{ lista, faltan \} = vencerEspera\(pendientesRef\.current, n\);/);
  // Revisión de r3 (controlador): al vencer se vuelven a pedir las que faltaban, y StrictMode rearma los topes.
  assert.match(fuente, /if \(faltan\.length\) subir\(faltan\);/, 'al vencer, se vuelven a pedir las columnas que faltaban');
  assert.match(fuente, /if \(p\.espera\) obtenerTopes\(\)\.armar\(p\.n\);/, 'al volver a montar se rearman los topes');
  // Revisión de r3 (controlador): «Ver más» no corre en una columna cuya última carga falló, porque un «Ver más»
  // exitoso borraría el error y levantaría el bloqueo sin un Reintentar.
  assert.match(fuente, /datos\.cargandoMas \|\| datos\.error\) return;/, 'verMas no corre con la columna en error');
  assert.match(fuente, /disabled=\{d\.cargandoMas \|\| d\.cargando \|\| ocupada \|\| d\.cargaFallida\}/, 'el botón «Ver más» se deshabilita');
}

console.log('✓ lib/kanban.js: columnas, reparto, orden, páginas, movimiento, reglas, destinos, arrastre y motivo.');
console.log('✓ T4B: modo servidor y cliente, plegadas, turnos, deshacer, «Mover a…» y Kanban.tsx.');
console.log('✓ T4B r1: deshacer sin perder tarjetas, «Ver más» quieto, StrictMode, alto, foco y anuncio.');
console.log('✓ T4B r2: pendiente hasta su recarga, sin copias viejas, «Ver más» abortado y arrastre fuera del DOM.');
console.log('✓ T4B r3: columnas ocultas que se recargan, columnas con error quietas, tope de espera y «Ver más» descartado.');
