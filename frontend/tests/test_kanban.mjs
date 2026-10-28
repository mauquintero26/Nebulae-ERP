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
    'velocidadAutodesplazamiento', 'superaUmbral', 'estadoColumna', 'textoTotalColumna', 'textoMovimiento', 'altoTablero',
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

console.log('✓ lib/kanban.js: columnas, reparto, orden, páginas, movimiento, reglas, destinos, arrastre y motivo.');
console.log('✓ T4B: modo servidor y cliente, plegadas, turnos, deshacer, «Mover a…» y Kanban.tsx.');
