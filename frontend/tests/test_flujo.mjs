/**
 * frontend/tests/test_flujo.mjs
 * B4 T3B (FLUJO-base punto 1; R4, C13, RP67, RP75, RP87, D21): la base del diagrama del flujo en
 * frontend/src/lib/flujo.js. Sin los casos de almacenamiento del diseño: el modo compacto de la franja lo guarda
 * BannerFlujo con usePreferencia (T5A, R4), y flujo.js no toca ningún almacén.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  congelar, pasosConProgreso, pasosConConteos, conteosDePasos, textoConteo, textoAtraso, alternarSeleccion,
  resumenSemaforo,
} from '../src/lib/flujo.js';
import { congelar as congelarDePedido, PASOS_PEDIDO } from '../src/lib/estados-pedido.js';
import { PASOS_SC } from '../src/lib/estados-solicitud.js';
// T5A: lo nuevo por el espacio de nombres, para que la falta de una función no tape los demás casos.
import * as F from '../src/lib/flujo.js';
import { crearCargaListado } from '../src/lib/tabla.js';

const estados = (pasos) => pasos.map((p) => p.estado);

const CINCO = [
  { clave: 'A', label: 'Uno' },
  { clave: 'B', label: 'Dos' },
  { clave: 'C', label: 'Tres' },
  { clave: 'D', label: 'Cuatro' },
  { clave: 'E', label: 'Cinco' },
];

const FRANJA = congelar([
  { clave: 'SC', label: 'Solicitud', sufijo: 'abiertas', tono: 'indigo', icono: 'solicitud', ruta: '/r/sc', ayuda: 'Ayuda SC' },
  { clave: 'COT', label: 'Cotización', sufijo: 'abiertas', tono: 'amber', icono: 'cotizacion', ruta: '/r/cot', ayuda: 'Ayuda COT' },
  { clave: 'PVEN', label: 'Pedido de venta', sufijo: 'en curso', tono: 'emerald', icono: 'pedido', ruta: '/r/pven', ayuda: 'Ayuda PVEN' },
]);

console.log('--- TEST 1: congelar es la MISMA función de estados-pedido.js (re-exportada, no copiada) ---');
{
  assert.equal(congelar, congelarDePedido);
  const t = congelar({ a: { b: [1, 2] } });
  assert.ok(Object.isFrozen(t) && Object.isFrozen(t.a) && Object.isFrozen(t.a.b));
  assert.throws(() => { t.a.c = 1; }, TypeError);
  assert.throws(() => { t.a.b.push(3); }, TypeError);
}

console.log('--- TEST 2: pasosConProgreso — hecho, actual y pendiente ---');
{
  assert.deepEqual(estados(pasosConProgreso(CINCO, 2)), ['hecho', 'hecho', 'actual', 'pendiente', 'pendiente']);
  assert.deepEqual(estados(pasosConProgreso(CINCO, 0)), ['actual', 'pendiente', 'pendiente', 'pendiente', 'pendiente']);
  assert.deepEqual(estados(pasosConProgreso(CINCO, 4)), ['hecho', 'hecho', 'hecho', 'hecho', 'actual']);
  // Con canceladoEn: los anteriores hechos, ese cancelado y los siguientes pendientes (el índice no cuenta).
  assert.deepEqual(estados(pasosConProgreso(CINCO, 2, { canceladoEn: 1 })),
    ['hecho', 'cancelado', 'pendiente', 'pendiente', 'pendiente']);
  assert.deepEqual(estados(pasosConProgreso(CINCO, 0, { canceladoEn: 0 })),
    ['cancelado', 'pendiente', 'pendiente', 'pendiente', 'pendiente']);
  // canceladoEn undefined o null (la forma de pasoCotizacion sin cancelación, RP87) no cambia nada.
  assert.deepEqual(estados(pasosConProgreso(CINCO, 2, { canceladoEn: undefined })), estados(pasosConProgreso(CINCO, 2)));
  assert.deepEqual(estados(pasosConProgreso(CINCO, 2, { canceladoEn: null })), estados(pasosConProgreso(CINCO, 2)));
  // Fuera de rango: todos pendientes (también -1, que es «cancelado» en pasoPedido y pasoSolicitud).
  for (const fuera of [7, 5, -1, NaN, 1.5, null, undefined, '2']) {
    assert.deepEqual(estados(pasosConProgreso(CINCO, /** @type {any} */ (fuera))), Array(5).fill('pendiente'), `índice ${String(fuera)}`);
  }
  assert.deepEqual(estados(pasosConProgreso(CINCO, 2, { canceladoEn: 9 })), Array(5).fill('pendiente'));
  assert.deepEqual(pasosConProgreso([], 0), []);
  assert.deepEqual(pasosConProgreso(/** @type {any} */ (null), 0), []);
}

console.log('--- TEST 3: pasosConProgreso acepta pasos con `key` (PASOS_PEDIDO) y con `clave` (PASOS_SC) (RP87) ---');
{
  const pedido = pasosConProgreso(PASOS_PEDIDO, 1);
  assert.deepEqual(pedido.map((p) => p.clave), ['PENDIENTE_COMPRA', 'EN_PROCESO', 'LISTO_ENTREGA', 'ENTREGADO', 'FACTURADO']);
  assert.deepEqual(pedido.map((p) => p.label), PASOS_PEDIDO.map((p) => p.label));
  assert.deepEqual(estados(pedido), ['hecho', 'actual', 'pendiente', 'pendiente', 'pendiente']);

  const sc = pasosConProgreso(PASOS_SC, 3);
  assert.deepEqual(sc.map((p) => p.clave), PASOS_SC.map((p) => p.clave));
  assert.deepEqual(sc.map((p) => p.ayuda), PASOS_SC.map((p) => p.ayuda), 'la ayuda de cada paso se conserva');
  assert.deepEqual(estados(sc), ['hecho', 'hecho', 'hecho', 'actual']);
  // Las definiciones son tablas congeladas: el resultado es una copia (no las toca).
  sc[0].label = 'otra';
  assert.equal(PASOS_SC[0].label, 'Nueva');
}

console.log('--- TEST 4: pasosConConteos — conteos, el paso actual y el seleccionado ---');
{
  const pasos = pasosConConteos(FRANJA, { SC: { total: 4, atrasados: 1 } }, { actual: 'SC' });
  const [sc, cot, pven] = pasos;
  assert.equal(sc.clave, 'SC');
  assert.equal(sc.esEste, true);
  assert.equal(sc.estado, 'actual');
  assert.equal(sc.total, 4);
  assert.equal(sc.atrasados, 1);
  assert.equal(sc.masAntiguoDias, null, 'lo que no viene en el conteo queda en null');
  // Una clave sin conteo: todo en null y 'neutro'.
  assert.equal(cot.total, null);
  assert.equal(cot.atrasados, null);
  assert.equal(cot.esEste, false);
  assert.equal(cot.estado, 'neutro');
  assert.equal(pven.estado, 'neutro');
  // La presentación de la definición pasa tal cual; href no lo pone la librería (la pantalla decide si la caja es enlace).
  assert.equal(sc.label, 'Solicitud');
  assert.equal(sc.sufijo, 'abiertas');
  assert.equal(sc.tono, 'indigo');
  assert.equal(sc.icono, 'solicitud');
  assert.equal(sc.ayuda, 'Ayuda SC');
  assert.equal(sc.ruta, '/r/sc');
  assert.equal(sc.href, undefined);
  // Sin `actual`, todos neutros y ninguno esEste.
  assert.deepEqual(estados(pasosConConteos(FRANJA, {})), ['neutro', 'neutro', 'neutro']);
}

console.log('--- TEST 5: pasosConConteos — cargando, sin conteos, seleccionado, detalle y avisos ---');
{
  const conteos = {
    SC: { total: 4, atrasados: 1, masAntiguoDias: 6, detalle: [{ label: 'Nueva', n: 1 }], avisos: [{ texto: '2 con cambios pedidos', tono: 'ambar' }] },
    COT: { total: 0, atrasados: 0 },
  };
  for (const p of pasosConConteos(FRANJA, conteos, { actual: 'SC', cargando: true })) {
    assert.equal(p.total, null, `${p.clave} cargando`);
    assert.equal(p.atrasados, null);
    assert.equal(p.masAntiguoDias, null);
    assert.equal(p.detalle, null);
    assert.equal(p.avisos, null);
  }
  for (const vacio of [null, undefined]) {
    assert.deepEqual(pasosConConteos(FRANJA, vacio).map((p) => p.total), [null, null, null]);
  }
  const listos = pasosConConteos(FRANJA, conteos, { seleccionado: 'COT' });
  assert.deepEqual(listos.filter((p) => p.seleccionado).map((p) => p.clave), ['COT'], 'seleccionado marca solo esa clave');
  // actual y seleccionado son independientes: estar en una pantalla no es haber elegido su filtro.
  const ambos = pasosConConteos(FRANJA, conteos, { actual: 'SC', seleccionado: 'COT' });
  assert.deepEqual(ambos.map((p) => [p.clave, p.esEste, p.seleccionado]), [['SC', true, false], ['COT', false, true], ['PVEN', false, false]]);
  assert.ok(pasosConConteos(FRANJA, conteos, { actual: 'SC' }).every((p) => p.seleccionado === false));
  assert.equal(listos[1].total, 0, 'un 0 real se conserva (no es null)');
  assert.deepEqual(listos[0].detalle, [{ label: 'Nueva', n: 1 }]);
  assert.deepEqual(listos[0].avisos, [{ texto: '2 con cambios pedidos', tono: 'ambar' }]);
  assert.equal(listos[0].masAntiguoDias, 6);
  // Un valor que no es un número no se inventa: null.
  const raros = pasosConConteos(FRANJA, { SC: { total: 'x', atrasados: NaN } });
  assert.equal(raros[0].total, null);
  assert.equal(raros[0].atrasados, null);
  // Una clave heredada del prototipo no es un conteo.
  assert.equal(pasosConConteos([{ clave: 'toString', label: 'x' }], {})[0].total, null);
}

console.log('--- TEST 5b (r1): conteosDePasos — la ÚNICA conversión de los pasos del servidor (snake_case) ---');
{
  // La forma de GET /ventas/flujo y de /compras/flujo («la misma forma que el de Ventas»): pasos.{total, atrasados,
  // mas_antiguo_dias, por_estado}.
  const DATOS = {
    pasos: {
      LISTA: { total: 3, atrasados: null, mas_antiguo_dias: null, por_estado: { PENDIENTE: 3 } },
      PEC: { total: 5, atrasados: 2, mas_antiguo_dias: 12, por_estado: { BORRADOR: 1, EMITIDO: 4 } },
      RARO: null,
      TEXTO: { total: 'x', atrasados: NaN, mas_antiguo_dias: '4', por_estado: [] },
    },
    semaforo: { atrasados: 2, no_resueltos: 8 },
  };
  const NULOS = { total: null, atrasados: null, masAntiguoDias: null, porEstado: null };
  const c = conteosDePasos(DATOS);
  assert.deepEqual(Object.keys(c), ['LISTA', 'PEC', 'RARO', 'TEXTO'], 'las claves que manda el servidor, en su orden');
  assert.deepEqual(c.PEC, { total: 5, atrasados: 2, masAntiguoDias: 12, porEstado: { BORRADOR: 1, EMITIDO: 4 } });
  assert.deepEqual(c.LISTA, { total: 3, atrasados: null, masAntiguoDias: null, porEstado: { PENDIENTE: 3 } });
  assert.deepEqual(c.RARO, NULOS, 'un paso nulo: todo en null');
  assert.deepEqual(c.TEXTO, NULOS, 'lo que no es un número (o un mapa) no se inventa');
  for (const vacio of [null, undefined, {}, { pasos: null }, { pasos: [] }, { pasos: [{ total: 1 }] }, { pasos: 'abc' }, 'x']) {
    assert.deepEqual(conteosDePasos(/** @type {any} */ (vacio)), {}, `sin pasos: ${JSON.stringify(vacio)}`);
  }
  c.PEC.porEstado.BORRADOR = 99;
  assert.equal(DATOS.pasos.PEC.por_estado.BORRADOR, 1, 'porEstado es una copia');
  // Se conecta con pasosConConteos: masAntiguoDias llega en camelCase.
  const pasos = pasosConConteos([{ clave: 'LISTA', label: 'L' }, { clave: 'PEC', label: 'P' }, { clave: 'NADA', label: 'N' }],
    conteosDePasos(DATOS), { actual: 'PEC' });
  assert.deepEqual(pasos.map((p) => [p.total, p.atrasados, p.masAntiguoDias]), [[3, null, null], [5, 2, 12], [null, null, null]]);
  assert.equal(pasos[1].estado, 'actual');
}

console.log('--- TEST 6: textoConteo (con formatoEntero de kpis.js, RP75) ---');
{
  assert.equal(textoConteo(null), '—');
  assert.equal(textoConteo(undefined), '—');
  assert.equal(textoConteo(NaN), '—');
  assert.equal(textoConteo(0), '0');
  assert.equal(textoConteo(7), '7');
  assert.equal(textoConteo(1234), '1.234');
  assert.equal(textoConteo(1234567), '1.234.567');
}

console.log('--- TEST 7: textoAtraso ---');
{
  assert.equal(textoAtraso(0), '');
  assert.equal(textoAtraso(null), '');
  assert.equal(textoAtraso(undefined), '');
  assert.equal(textoAtraso(-2), '');
  assert.equal(textoAtraso(1), '1 con atraso');
  assert.equal(textoAtraso(3), '3 con atraso');
  assert.equal(textoAtraso(1500), '1.500 con atraso');
}

console.log('--- TEST 8: alternarSeleccion ---');
{
  assert.equal(alternarSeleccion('COT', 'COT'), null);
  assert.equal(alternarSeleccion(null, 'COT'), 'COT');
  assert.equal(alternarSeleccion('SC', 'COT'), 'COT');
}

console.log('--- TEST 9: resumenSemaforo (RP67: error -> gris y «—»; D21) ---');
{
  assert.deepEqual(resumenSemaforo({ cargando: true }), { tono: 'gris', texto: 'Cargando…' });
  assert.deepEqual(resumenSemaforo({ error: new Error('x') }), { tono: 'gris', texto: '—' });
  assert.deepEqual(resumenSemaforo({ error: 'falló', atrasados: 3 }), { tono: 'gris', texto: '—' });
  // Al reintentar después de un error, carga otra vez.
  assert.deepEqual(resumenSemaforo({ cargando: true, error: 'falló' }), { tono: 'gris', texto: 'Cargando…' });
  assert.deepEqual(resumenSemaforo({ atrasados: 0 }), { tono: 'verde', texto: 'Todo al día' });
  assert.deepEqual(resumenSemaforo({ atrasados: 2 }), { tono: 'rojo', texto: '2 con atraso' });
  assert.deepEqual(resumenSemaforo({ atrasados: 1 }), { tono: 'rojo', texto: '1 con atraso' });
  // Sin el número no se inventa «Todo al día».
  assert.deepEqual(resumenSemaforo({ atrasados: null }), { tono: 'gris', texto: '—' });
  assert.deepEqual(resumenSemaforo(), { tono: 'gris', texto: '—' });
}

console.log('--- TEST 10: JS puro, sin almacenamiento propio (R4) y congelar re-exportado ---');
{
  const fuente = readFileSync(new URL('../src/lib/flujo.js', import.meta.url), 'utf8');
  assert.ok(!/from ['"]react/.test(fuente), 'no importa React');
  assert.ok(!/\b(window|document)\./.test(fuente), 'no usa el DOM');
  assert.ok(!/localStorage|sessionStorage/.test(fuente), 'no toca el almacenamiento (R4)');
  assert.ok(!/leerPreferencia|guardarPreferencia|claveCompacto/.test(fuente), 'sin preferencias propias (R4)');
  assert.ok(!/function congelar\(/.test(fuente), 'congelar no se copia');
  assert.ok(!/toLocaleString/.test(fuente), 'RP75: el número sale de formatoEntero');
  // r1: el chequeo de claves es tiene() de estados-pedido.js, sin una copia propia.
  assert.ok(/import \{[^}]*\btiene\b[^}]*\} from '\.\/estados-pedido\.js'/.test(fuente), 'tiene sale de estados-pedido.js');
  assert.ok(!/tienePropia|hasOwnProperty/.test(fuente), 'sin copia de tiene()');
}

// ─── T5A: lo que usan los componentes de components/flujo ───────────────────────

console.log('--- TEST 11 (T5A; RP67, D21): semaforoDeFranja — sin parpadeo al recargar y gris «—» con error ---');
{
  // Primera carga, sin número: gris y «Cargando…» (lo de resumenSemaforo).
  assert.deepEqual(F.semaforoDeFranja({ cargando: true }), { tono: 'gris', texto: 'Cargando…' });
  assert.deepEqual(F.semaforoDeFranja({ cargando: true, atrasados: null }), { tono: 'gris', texto: 'Cargando…' });
  // Al recargar con un número ya visto, ese número sigue (no vuelve a «Cargando…»).
  assert.deepEqual(F.semaforoDeFranja({ cargando: true, atrasados: 3 }), { tono: 'rojo', texto: '3 con atraso' });
  assert.deepEqual(F.semaforoDeFranja({ cargando: true, atrasados: 0 }), { tono: 'verde', texto: 'Todo al día' });
  // RP67: con error, gris y «—», aunque quede el último número bueno.
  assert.deepEqual(F.semaforoDeFranja({ error: new Error('x') }), { tono: 'gris', texto: '—' });
  assert.deepEqual(F.semaforoDeFranja({ error: 'falló', atrasados: 3 }), { tono: 'gris', texto: '—' });
  assert.deepEqual(F.semaforoDeFranja({ error: 'falló', atrasados: 3, cargando: true }), { tono: 'gris', texto: '—' });
  // Reintentar sin número: carga otra vez.
  assert.deepEqual(F.semaforoDeFranja({ cargando: true, error: 'falló' }), { tono: 'gris', texto: 'Cargando…' });
  // Listo: lo mismo que resumenSemaforo; sin número no se inventa «Todo al día».
  for (const caso of [{ atrasados: 2 }, { atrasados: 0 }, { atrasados: null }, {}, { atrasados: NaN }, { atrasados: '3' }]) {
    assert.deepEqual(F.semaforoDeFranja(caso), resumenSemaforo(caso), JSON.stringify(caso));
  }
  assert.deepEqual(F.semaforoDeFranja(), { tono: 'gris', texto: '—' });
  // Un número que no es finito no cuenta como visto.
  assert.deepEqual(F.semaforoDeFranja({ cargando: true, atrasados: NaN }), { tono: 'gris', texto: 'Cargando…' });
}

console.log('--- TEST 12 (T5A; R6, RP67 y cruce C9 de la verificación): opcionesSemaforo y alternarFiltroSemaforo ---');
{
  const s = { atrasados: 3, noResueltos: 8, filtro: 'todos' };
  assert.deepEqual(F.opcionesSemaforo(s), [
    { filtro: 'atrasados', texto: 'Con atraso', conConteo: true, conteo: 3, activo: false },
    { filtro: 'no_resueltos', texto: 'No resueltos', conConteo: true, conteo: 8, activo: false },
    { filtro: 'todos', texto: 'Ver todo', conConteo: false, conteo: null, activo: true },
  ]);
  // «No resueltos» solo si llega noResueltos (undefined = no llega; null = llega y todavía carga).
  assert.deepEqual(F.opcionesSemaforo({ atrasados: 1, filtro: 'atrasados' }).map((o) => [o.filtro, o.activo]),
    [['atrasados', true], ['todos', false]]);
  const cargando = F.opcionesSemaforo({ atrasados: null, noResueltos: null, filtro: 'no_resueltos' });
  assert.deepEqual(cargando.map((o) => [o.filtro, o.conteo, o.activo]),
    [['atrasados', null, false], ['no_resueltos', null, true], ['todos', null, false]]);
  // Un conteo que no es número no se inventa; un filtro que no está entre las opciones deja activo «Ver todo».
  assert.equal(F.opcionesSemaforo({ atrasados: 'x', filtro: 'todos' })[0].conteo, null);
  assert.deepEqual(F.opcionesSemaforo({ atrasados: 1, filtro: 'no_resueltos' }).map((o) => o.activo), [false, true]);
  assert.deepEqual(F.opcionesSemaforo({ atrasados: 1, filtro: 'raro' }).map((o) => o.activo), [false, true]);
  assert.deepEqual(F.opcionesSemaforo({ atrasados: 1 }).map((o) => o.activo), [false, true]);
  for (const nada of [null, undefined, 'x', []]) assert.deepEqual(F.opcionesSemaforo(/** @type {any} */ (nada)), []);
  // Cruce C9: el botón dice «No resueltos»; «Sin resolver» es de los separadores, y «Pendientes» se descarta.
  const textos = F.opcionesSemaforo(s).map((o) => o.texto).join('|');
  assert.ok(!/Sin resolver|Pendientes/.test(textos));
  // Tocar el activo otra vez lo quita (R6); 'Ver todo' siempre deja 'todos'.
  assert.equal(F.alternarFiltroSemaforo('todos', 'atrasados'), 'atrasados');
  assert.equal(F.alternarFiltroSemaforo('atrasados', 'atrasados'), 'todos');
  assert.equal(F.alternarFiltroSemaforo('atrasados', 'no_resueltos'), 'no_resueltos');
  assert.equal(F.alternarFiltroSemaforo('no_resueltos', 'no_resueltos'), 'todos');
  assert.equal(F.alternarFiltroSemaforo('atrasados', 'todos'), 'todos');
  assert.equal(F.alternarFiltroSemaforo('todos', 'todos'), 'todos');
  // Un filtro que no es de los tres deja 'todos' (no se inventa un filtro).
  for (const raro of ['vencidos', '', null, undefined]) {
    assert.equal(F.alternarFiltroSemaforo('atrasados', /** @type {any} */ (raro)), 'todos', String(raro));
    assert.equal(F.alternarFiltroSemaforo(/** @type {any} */ (raro), /** @type {any} */ (raro)), 'todos', `${String(raro)} dos veces`);
  }
}

console.log('--- TEST 13 (T5A): textoDetalle (solo en el paso esEste) y textoAntiguedad (solo con mostrarAntiguedad) ---');
{
  assert.equal(F.textoDetalle([{ label: 'Nueva', n: 1 }, { label: 'Asignada', n: 2 }]), 'Nueva 1 · Asignada 2');
  assert.equal(F.textoDetalle([{ label: 'Confirmada', n: 1234 }]), 'Confirmada 1.234');
  // Lo que no tiene etiqueta o número se salta; nada da ''.
  assert.equal(F.textoDetalle([{ label: 'Nueva', n: null }, { n: 3 }, null, { label: 'Asignada', n: 0 }]), 'Asignada 0');
  for (const nada of [null, undefined, [], 'x', {}]) assert.equal(F.textoDetalle(/** @type {any} */ (nada)), '');
  assert.equal(F.textoAntiguedad(6), 'El más antiguo: 6 días');
  assert.equal(F.textoAntiguedad(1), 'El más antiguo: 1 día');
  assert.equal(F.textoAntiguedad(0), 'El más antiguo: 0 días');
  assert.equal(F.textoAntiguedad(1200), 'El más antiguo: 1.200 días');
  assert.equal(F.textoAntiguedad(1.4), 'El más antiguo: 1 día', 'redondeado, y el plural sale del redondeado');
  for (const nada of [null, undefined, NaN, -1, '6']) assert.equal(F.textoAntiguedad(/** @type {any} */ (nada)), '');
}

console.log('--- TEST 14 (T5A): textos de la barra y de los puntos — tituloPaso, textoEstadoPaso, tituloPunto e indicePasoActual ---');
{
  // El title de la barra: el label y, si hay, el sublabel y los avisos (por debajo de @md los sublabels solo se ven aquí).
  assert.equal(F.tituloPaso({ clave: 'COT', label: 'Cotización', estado: 'actual', sublabel: 'COT-20260485 · Pendiente' }),
    'Cotización: COT-20260485 · Pendiente');
  assert.equal(F.tituloPaso({ clave: 'SC', label: 'Solicitud', estado: 'hecho' }), 'Solicitud');
  assert.equal(F.tituloPaso({ clave: 'E', label: 'Aduana', estado: 'actual', sublabel: 'llega 3 nov', avisos: [{ texto: 'Atrasada 2 días', tono: 'rojo' }] }),
    'Aduana: llega 3 nov · Atrasada 2 días');
  assert.equal(F.tituloPaso({ clave: 'E', label: 'Aduana', estado: 'actual', avisos: [{ texto: 'A tiempo', tono: 'gris' }, null] }), 'Aduana: A tiempo');
  // Lo que oye un lector de pantalla del círculo de la barra (el ✓ y la X no se leen).
  assert.deepEqual(['hecho', 'actual', 'pendiente', 'cancelado', 'neutro', 'raro'].map((e) => F.textoEstadoPaso(e)),
    ['Paso hecho', 'Paso en curso', 'Paso pendiente', 'Paso cancelado', '', '']);
  // El title de un punto de la variante mini ('Etapa 2 de 4: Aduana, en curso').
  assert.equal(F.tituloPunto({ clave: 'ADUANA', label: 'Aduana', estado: 'actual' }, 1, 4), 'Etapa 2 de 4: Aduana, en curso');
  assert.deepEqual(['hecho', 'actual', 'pendiente', 'cancelado'].map((estado) => F.tituloPunto({ clave: 'x', label: 'X', estado }, 0, 1)),
    ['Etapa 1 de 1: X, completada', 'Etapa 1 de 1: X, en curso', 'Etapa 1 de 1: X, pendiente', 'Etapa 1 de 1: X, cancelada']);
  assert.equal(F.tituloPunto({ clave: 'x', label: 'X', estado: 'neutro' }, 2, 3), 'Etapa 3 de 3: X');
  assert.equal(F.tituloPunto({ clave: 'x', label: 'Casillero', estado: 'actual', sublabel: 'llega 20 oct', avisos: [{ texto: 'Atrasada 1 día', tono: 'rojo' }] }, 1, 4),
    'Etapa 2 de 4: Casillero, en curso · llega 20 oct · Atrasada 1 día');
  // aria-current: el paso esEste (la franja y la cadena) o, si ninguno lo es, el 'actual' (las barras de cada documento).
  assert.equal(F.indicePasoActual([{ estado: 'hecho', esEste: true }, { estado: 'actual' }]), 0);
  assert.equal(F.indicePasoActual(pasosConProgreso(CINCO, 2)), 2);
  assert.equal(F.indicePasoActual(pasosConConteos(FRANJA, {}, { actual: 'COT' })), 1);
  assert.equal(F.indicePasoActual(pasosConConteos(FRANJA, {})), -1, 'la franja de una pantalla sin paso propio');
  assert.equal(F.indicePasoActual(pasosConProgreso(CINCO, 9)), -1);
  assert.equal(F.indicePasoActual(pasosConProgreso(CINCO, 2, { canceladoEn: 1 })), -1, 'un cancelado no es el actual');
  for (const nada of [null, undefined, 'x', [null]]) assert.equal(F.indicePasoActual(/** @type {any} */ (nada)), -1);
}

const tic = () => new Promise((r) => setImmediate(r));
const aMano = () => {
  const llamadas = [];
  const pedir = (url, signal) => new Promise((resolver, rechazar) => llamadas.push({ url, signal, resolver, rechazar }));
  return { llamadas, pedir };
};

console.log('--- TEST 15 (T5A): useResumenFlujo — aplicarLlegadaResumen y estadoResumen sobre crearCargaListado ---');
{
  const RUTA = '/ventas/flujo';
  const D1 = { pasos: { SC: { total: 4 } }, semaforo: { atrasados: 1, no_resueltos: 3 } };
  const D2 = { pasos: { SC: { total: 5 } }, semaforo: { atrasados: 0, no_resueltos: 2 } };
  // El hook, sin React: una carga (el turno de lib/tabla.js) y el resultado que va guardando setResultado.
  const { llamadas, pedir } = aMano();
  let resultado = null;
  const carga = crearCargaListado({ pedir, alLlegar: (l) => { resultado = F.aplicarLlegadaResumen(resultado, l); } });
  const ver = (clave, ruta = RUTA) => F.estadoResumen(resultado, { clave, ruta });

  // Primera carga: datos null (las cajas pintan Contador), cargando y sin error.
  assert.deepEqual(ver('0|0|/ventas/flujo'), { datos: null, cargando: true, error: null });
  carga.cargar(RUTA, '0|0|/ventas/flujo', { ruta: RUTA });
  await tic();
  assert.equal(llamadas[0].url, RUTA);
  llamadas[0].resolver({ status: 'success', data: D1 });
  await tic();
  assert.deepEqual(ver('0|0|/ventas/flujo'), { datos: D1, cargando: false, error: null }, 'lee res.data');

  // Recarga (recarga sube): los datos anteriores siguen mientras llega la nueva (sin parpadeo).
  assert.deepEqual(ver('0|1|/ventas/flujo'), { datos: D1, cargando: true, error: null });

  // Una lenta no pisa a la nueva: la vieja se aborta y, si igual llega, se descarta.
  carga.cargar(RUTA, '0|1|/ventas/flujo', { ruta: RUTA });
  await tic();
  carga.cargar(RUTA, '0|2|/ventas/flujo', { ruta: RUTA });
  await tic();
  assert.equal(llamadas[1].signal.aborted, true, 'la anterior se aborta (signal de apiFetch)');
  llamadas[2].resolver({ data: D2 });
  await tic();
  llamadas[1].resolver({ data: D1 });
  await tic();
  assert.deepEqual(ver('0|2|/ventas/flujo'), { datos: D2, cargando: false, error: null }, 'lo viejo nunca pisa lo nuevo');

  // Un error conserva lo último bueno; mientras se reintenta no se muestra el error anterior.
  const falla = Object.assign(new Error('Error del servidor'), { status: 500 });
  carga.cargar(RUTA, '1|2|/ventas/flujo', { ruta: RUTA });
  await tic();
  llamadas[3].rechazar(falla);
  await tic();
  assert.deepEqual(ver('1|2|/ventas/flujo'), { datos: D2, cargando: false, error: falla });
  assert.deepEqual(ver('2|2|/ventas/flujo'), { datos: D2, cargando: true, error: null }, 'Reintentar: cargando, sin el error viejo');

  // Una respuesta sin un objeto en data es un error (las cajas no quedan cargando para siempre) y conserva lo bueno.
  carga.cargar(RUTA, '2|2|/ventas/flujo', { ruta: RUTA });
  await tic();
  llamadas[4].resolver({ status: 'success', data: [1, 2] });
  await tic();
  const sinDatos = ver('2|2|/ventas/flujo');
  assert.equal(sinDatos.datos, D2);
  assert.ok(sinDatos.error instanceof Error && /no trae datos/.test(sinDatos.error.message));

  // Otra ruta: lo de la anterior no se muestra.
  assert.deepEqual(ver('0|0|/compras/flujo', '/compras/flujo'), { datos: null, cargando: true, error: null });
  carga.cargar('/compras/flujo', '0|0|/compras/flujo', { ruta: '/compras/flujo' });
  await tic();
  llamadas[5].rechazar(falla);
  await tic();
  assert.deepEqual(ver('0|0|/compras/flujo', '/compras/flujo'), { datos: null, cargando: false, error: falla },
    'el error de la primera carga de otra ruta no trae los datos de la anterior');

  // Desmontar (cancelar): lo que estaba en camino no se publica.
  const antes = resultado;
  carga.cargar('/compras/flujo', '1|0|/compras/flujo', { ruta: '/compras/flujo' });
  await tic();
  carga.cancelar();
  assert.equal(llamadas[6].signal.aborted, true);
  llamadas[6].resolver({ data: D1 });
  await tic();
  assert.equal(resultado, antes);

  // aplicarLlegadaResumen no muta lo que recibe; un error sin objeto igual queda como error.
  const previo = Object.freeze({ clave: 'k', ruta: RUTA, datos: D1, error: null });
  const r = F.aplicarLlegadaResumen(previo, { marca: 'k2', ok: false, error: undefined, contexto: { ruta: RUTA } });
  assert.equal(r.datos, D1);
  assert.ok(r.error instanceof Error);
  assert.deepEqual(F.aplicarLlegadaResumen(null, { marca: 'k', ok: true, respuesta: { data: D1 }, contexto: { ruta: RUTA } }),
    { clave: 'k', ruta: RUTA, datos: D1, error: null });
  // Sin contexto la ruta es null, y estadoResumen la compara igual.
  const sinRuta = F.aplicarLlegadaResumen(null, { marca: 'k', ok: true, respuesta: { data: D1 } });
  assert.equal(sinRuta.ruta, null);
  assert.deepEqual(F.estadoResumen(sinRuta, { clave: 'k', ruta: RUTA }), { datos: null, cargando: true, error: null });
}

console.log('--- TEST 16 (T5A; R4, C2, C13, RP33, RP67, D21, D38): el fuente de components/flujo (sin DOM en node) ---');
{
  const leer = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // Sin comentarios (/* … */, {/* … */} y las líneas //): lo que se busca es el código, no lo que dicen los comentarios.
  const codigo = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const ARCHIVOS = ['PasosFlujo.tsx', 'BannerFlujo.tsx', 'CadenaDocumentos.tsx', 'useResumenFlujo.ts', 'tipos.ts', 'index.ts'];
  const fuentes = Object.fromEntries(ARCHIVOS.map((n) => [n, leer(`components/flujo/${n}`)]));
  const indice = fuentes['index.ts'];
  for (const [nombre, fuente] of Object.entries(fuentes)) {
    const c = codigo(fuente);
    if (/\.tsx$|^use/.test(nombre)) assert.ok(fuente.startsWith("'use client';"), `${nombre}: «use client»`);
    assert.ok(!/\bdark:/.test(fuente), `${nombre}: sin dark:`);
    assert.ok(!/(^|[^\w.$])(?:(?:window|globalThis)\??\.)?(?:alert|confirm|prompt)\s*\(/m.test(c), `${nombre}: sin alert, confirm ni prompt`);
    assert.ok(!/localStorage|sessionStorage|window\./.test(c), `${nombre}: no toca el almacenamiento ni window (R4: eso es de preferencias.js)`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(c), `${nombre}: sin emojis`);
    assert.ok(!/['"`>]—['"`<]/.test(c), `${nombre}: el «—» solo lo pinta Contador (D21)`);
  }
  for (const n of ['PasosFlujo', 'BannerFlujo', 'CadenaDocumentos', 'useResumenFlujo']) {
    assert.match(codigo(fuentes[`${n}${n.startsWith('use') ? '.ts' : '.tsx'}`]), new RegExp(`export function ${n}\\b`), `${n}: exporta`);
    assert.match(indice, new RegExp(`export \\{ ${n}\\b[^}]*\\} from '\\./${n}';`), `index.ts exporta ${n}`);
  }
  assert.ok(indice.includes("export * from './tipos';"), 'index.ts exporta los tipos');
  assert.ok(!/flujo/.test(leer('components/ui/index.ts')), 'components/ui/index.ts no se toca (es de T4)');

  // tipos.ts: los del paso son los JSDoc de lib/flujo.js (una sola definición) y partes solo 'todo' (R1).
  const tipos = codigo(fuentes['tipos.ts']);
  assert.match(tipos, /export type \{\s*PasoVista, EstadoPaso, TonoPaso, ClaveIcono,[^}]*\} from '@\/lib\/flujo';/);
  assert.match(tipos, /export type \{ TipoCadena \} from '@\/lib\/flujo-ventas';/, 'RP74: TipoCadena trae VEN');
  assert.match(tipos, /export type VarianteFlujo = 'banner' \| 'barra' \| 'mini';/);
  assert.match(tipos, /export type OrientacionFlujo = 'horizontal' \| 'vertical';/);
  assert.match(tipos, /export type PartesFranja = 'todo';/, "R1: la rama 'semaforo' | 'diagrama' no se implementa");

  // PasosFlujo.
  const pasos = codigo(fuentes['PasosFlujo.tsx']);
  assert.match(pasos, /import \{ Contador \} from '@\/components\/ui\/Contador';/);
  assert.match(pasos, /import \{ estadoDeConteo \} from '@\/lib\/tabla';/, 'el estado de cada número es el de BarraTabla (C13)');
  for (const n of ['indicePasoActual', 'textoAntiguedad', 'textoAtraso', 'textoDetalle', 'textoEstadoPaso', 'tituloPaso', 'tituloPunto']) {
    assert.match(pasos, new RegExp(`\\b${n}\\(`), `PasosFlujo usa ${n}`);
  }
  // RP33 y D21: con el total en null, la barra gris de Contador (no un «—» con animate-pulse).
  assert.match(pasos, /<Contador\s+valor=\{paso\.total\}\s+estado=\{estadoDeConteo\(paso\.total, estadoConteos\)\}/);
  assert.ok(!pasos.includes('animate-pulse'), 'RP33: el pulso es solo el de Contador');
  // Los íconos de ClaveIcono (lucide-react 1.31 los exporta todos; sin reemplazos).
  const ICONOS = {
    solicitud: 'FileText', cotizacion: 'Calculator', pedido: 'ShoppingBag', entrega: 'Truck', factura: 'Receipt',
    lista: 'ListChecks', compra: 'ShoppingCart', transito: 'Plane', recepcion: 'PackageCheck', recibido: 'Warehouse',
  };
  for (const [clave, icono] of Object.entries(ICONOS)) assert.match(pasos, new RegExp(`\\b${clave}: ${icono},`), `${clave} → ${icono}`);
  // TONO_PASO con clases literales.
  for (const tono of ['indigo', 'amber', 'emerald', 'teal', 'purple']) {
    assert.match(pasos, new RegExp(`${tono}: 'bg-${tono}-50 text-${tono}-600',`), `TONO_PASO.${tono}`);
  }
  // Los avisos: ámbar, rojo y gris (slate, D36).
  assert.match(pasos, /ambar: 'border-amber-200 bg-amber-50 text-amber-800',/);
  assert.match(pasos, /rojo: 'border-rose-200 bg-rose-50 text-rose-700',/);
  assert.match(pasos, /gris: 'border-slate-200 bg-slate-100 text-slate-600',/);
  // La estructura: <nav aria-label> con un <ol class="@container/flujo"> que se desplaza por dentro, y flechas aria-hidden.
  assert.match(pasos, /<nav aria-label=\{etiqueta\}/);
  assert.match(pasos, /const lista = `@container\/flujo flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain snap-x/);
  assert.match(pasos, /<ol className=\{lista\}>/);
  assert.match(pasos, /<ol className=\{`@container\/flujo flex w-full/, 'la barra también responde a su ancho');
  assert.equal((pasos.match(/<svg aria-hidden="true"/g) ?? []).length, 2, 'la flecha horizontal y la vertical');
  assert.match(pasos, /<path d="M2 12l4 4 4-4" \/>/, 'en vertical la punta va hacia abajo');
  // Link si trae href; button aria-pressed si hay onSeleccionar y no es esEste; div en los demás.
  assert.match(pasos, /if \(paso\.href\) \{\s*return \(\s*<Link href=\{paso\.href\} aria-current=\{actual\}/);
  assert.match(pasos, /if \(onSeleccionar && !paso\.esEste\) \{\s*return \(\s*<button\s+type="button"\s+aria-pressed=\{Boolean\(paso\.seleccionado\)\}/);
  assert.match(pasos, /<div aria-current=\{actual\} title=\{title\} className=\{className\}>/);
  assert.match(pasos, /onClick=\{\(\) => onSeleccionar\(paso\.clave\)\}/);
  // aria-current: 'page' en la franja, 'step' en la barra y en los puntos.
  assert.match(pasos, /actual=\{i === marcado \? 'page' : undefined\}/);
  assert.match(pasos, /actual=\{i === marcado \? 'step' : undefined\}/);
  assert.match(pasos, /aria-current=\{i === marcado \? 'step' : undefined\}/);
  // La franja: caja (rounded-xl, min-w-[7rem], número text-xl font-black) desde @2xl y pastilla por debajo.
  for (const clase of ['@2xl/flujo:min-w-[7rem]', '@2xl/flujo:rounded-xl', '@2xl/flujo:flex-col', 'rounded-full', 'whitespace-nowrap',
    '@2xl/flujo:text-xl', 'font-black', 'text-xs font-bold', 'ring-2 ring-indigo-500', 'border-indigo-300 bg-indigo-50/60',
    '@2xl/flujo:border-l-rose-400', 'bg-rose-50', 'text-rose-700', "const SOLO_CAJA = 'hidden @2xl/flujo:block';"]) {
    assert.ok(pasos.includes(clase), `PasosFlujo: ${clase}`);
  }
  assert.match(pasos, /const detalle = paso\.esEste \? textoDetalle\(paso\.detalle\) : '';/, 'el detalle solo en el esEste');
  assert.match(pasos, /const antiguedad = mostrarAntiguedad \? textoAntiguedad\(paso\.masAntiguoDias\) : '';/);
  assert.match(pasos, /const ayuda = mostrarAyuda && paso\.ayuda \? paso\.ayuda : '';/);
  assert.match(pasos, /variante = 'barra'/, "por defecto 'barra'");
  assert.match(pasos, /mostrarAntiguedad = false/, 'flujo_contenido_caja: sin antigüedad por defecto');
  assert.equal((pasos.match(/>\s*Estás aquí\s*</g) ?? []).length, 2, "'Estás aquí' en la franja y en la barra");
  // La barra: 28 px (22 px compacta), ✓ y X de lucide, label 11 px y sublabel 10 px recortado, con title.
  for (const clase of ["'h-[22px] w-[22px] text-[10px]'", "'h-7 w-7 text-xs'", 'border-emerald-500 bg-emerald-500 text-white',
    'border-indigo-600 bg-indigo-600 text-white ring-4 ring-indigo-100', 'border-slate-300 bg-white text-slate-400',
    'border-rose-500 bg-rose-500 text-white', 'border-slate-200 bg-slate-100 text-slate-400', 'text-[11px] font-bold',
    'truncate text-[10px] text-slate-500', 'sr-only @md/flujo:not-sr-only', 'h-0.5 min-w-3 flex-1']) {
    assert.ok(pasos.includes(clase), `barra: ${clase}`);
  }
  assert.match(pasos, /estado === 'hecho' \? <Check size=\{icono\} strokeWidth=\{3\} \/> : estado === 'cancelado' \? <X size=\{icono\} strokeWidth=\{3\} \/> : i \+ 1/);
  assert.match(pasos, /title=\{tituloPaso\(paso\)\}/);
  assert.match(pasos, /\$\{estado === 'hecho' \? 'bg-emerald-500' : 'bg-slate-200'\}/, 'el conector es emerald después de un paso hecho');
  // Los puntos: 10 px, conectores de 8 px y el title de cada punto.
  assert.match(pasos, /const titulo = tituloPunto\(paso, i, n\);/);
  assert.ok(pasos.includes('h-2.5 w-2.5') && pasos.includes('h-0.5 w-2 shrink-0'), 'mini: 10 px y 8 px');
  assert.match(pasos, /<ol aria-label=\{etiqueta\} className="inline-flex items-center">/, 'mini: sin <nav> por fila');

  // BannerFlujo.
  const banner = codigo(fuentes['BannerFlujo.tsx']);
  assert.match(banner, /import \{ usePreferencia \} from '@\/components\/ui\/usePreferencia';/, 'D38: el hook de components/ui');
  assert.match(banner, /usePreferencia<boolean>\(`flujo:\$\{idPreferencia\}`, false, \{ validar: esBooleano \}\)/, 'R4: flujo:<id>');
  assert.ok(!/guardarPreferencia|claveCompacto|preferenciasApp\(|useEffect/.test(banner),
    'RP33: sin guardarPreferencia(claveCompacto(…)); la lectura después de montar la hace usePreferencia');
  assert.match(banner, /<section aria-label=\{titulo\} aria-busy=\{cargando\} className="min-w-0 border-b border-slate-200 bg-white px-6 py-3">/);
  assert.match(banner, /const estadoConteos: EstadoKpi = estadoKpi\(\{ loading: cargando, error \}\);/);
  assert.match(banner, /const resumen = semaforoDeFranja\(\{ atrasados: semaforo\?\.atrasados \?\? null, cargando, error \}\);/);
  assert.match(banner, /const opciones = opcionesSemaforo\(semaforo\);/);
  assert.match(banner, /aria-pressed=\{o\.activo\}\s+onClick=\{\(\) => semaforo\.onFiltrar\(alternarFiltroSemaforo\(semaforo\.filtro, o\.filtro\)\)\}/);
  assert.match(banner, /<Contador valor=\{o\.conteo\} estado=\{estadoDeConteo\(o\.conteo, estadoConteos\)\} \/>/, 'C13: los números del semáforo');
  assert.match(banner, /gris: CircleDashed, rojo: AlertTriangle, verde: CheckCircle2/);
  assert.match(banner, /gris: 'text-slate-400', rojo: 'text-rose-600', verde: 'text-emerald-600'/);
  assert.match(banner, /<PasosFlujo\s+variante="banner"\s+pasos=\{pasos\}\s+etiqueta="Pasos del flujo"\s+onSeleccionar=\{onSeleccionarPaso\}\s+compacto=\{compacto\}\s+mostrarAntiguedad=\{mostrarAntiguedad\}\s+mostrarAyuda=\{verAyuda\}\s+estadoConteos=\{estadoConteos\}\s+\/>/);
  assert.match(banner, /onClick=\{\(\) => guardarCompacto\(!compacto\)\}/);
  assert.match(banner, /\{compacto \? 'Ver flujo' : 'Ocultar flujo'\}/);
  assert.match(banner, /aria-pressed=\{verAyuda\} onClick=\{\(\) => setVerAyuda\(\(v\) => !v\)\}/, '¿Cómo funciona? no se guarda');
  assert.match(banner, /accionAjustar = null/);
  assert.match(banner, /\{accionAjustar \? \(/);
  for (const texto of ['¿Cómo funciona?', 'No se pudieron cargar los números del flujo.', 'Reintentar', 'role="alert"', 'role="group"']) {
    assert.ok(banner.includes(texto), `BannerFlujo: ${texto}`);
  }
  assert.ok(!/Sin resolver|Pendientes/.test(banner), 'cruce C9: el botón es «No resueltos» (sale de opcionesSemaforo)');
  assert.ok(!/partes/.test(banner.split('export function BannerFlujo')[1]), "R1: partes no se lee (solo 'todo')");

  // useResumenFlujo: apiFetch con signal, el turno de crearCargaListado, abortar al desmontar o al cambiar.
  const hook = codigo(fuentes['useResumenFlujo.ts']);
  assert.match(hook, /import \{ apiFetch \} from '@\/lib\/api';/);
  assert.match(hook, /const pedirResumen = \(url: string, signal: AbortSignal\) => apiFetch\(url, \{ signal \}\);/);
  assert.match(hook, /import \{ crearCargaListado \} from '@\/lib\/tabla';/);
  assert.match(hook, /alLlegar: \(llegada\) => setResultado\(\(previo\) => aplicarLlegadaResumen\(previo, llegada\)\)/);
  assert.match(hook, /const clave = `\$\{version\}\|\$\{recarga\}\|\$\{ruta\}`;/);
  assert.match(hook, /useEffect\(\(\) => \{\s*carga\.cargar\(ruta, clave, \{ ruta \}\);\s*return \(\) => carga\.cancelar\(\);\s*\}, \[carga, ruta, clave\]\);/);
  assert.match(hook, /const recargar = useCallback\(\(\) => setVersion\(\(v\) => v \+ 1\), \[\]\);/);
  assert.match(hook, /const visto = estadoResumen\(resultado, \{ clave, ruta \}\);/);
  assert.match(hook, /recarga: number = 0/);
}

console.log('\nOK: test_flujo.mjs');
