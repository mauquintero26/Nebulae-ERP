/**
 * frontend/tests/test_flujo.mjs
 * B4 T3B (FLUJO-base punto 1; R4, C13, RP67, RP75, RP87, D21): la base del diagrama del flujo en
 * frontend/src/lib/flujo.js. Sin los casos de almacenamiento del diseño: el modo compacto de la franja lo guarda
 * BannerFlujo con usePreferencia (T5A, R4), y flujo.js no toca ningún almacén.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  congelar, pasosConProgreso, pasosConConteos, conteosDePasos, textoConteo, textoAtraso, alternarPaso,
  resumenSemaforo,
} from '../src/lib/flujo.js';
import { congelar as congelarDePedido, PASOS_PEDIDO } from '../src/lib/estados-pedido.js';
import { PASOS_SC } from '../src/lib/estados-solicitud.js';
// T5A: lo nuevo por el espacio de nombres, para que la falta de una función no tape los demás casos.
import * as F from '../src/lib/flujo.js';
import { crearCargaListado, estadoDeConteo } from '../src/lib/tabla.js';

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

console.log('--- TEST 8: alternarPaso ---');
{
  assert.equal(alternarPaso('COT', 'COT'), null);
  assert.equal(alternarPaso(null, 'COT'), 'COT');
  assert.equal(alternarPaso('SC', 'COT'), 'COT');
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
  // r1 (M16, ruling): un conteo negativo no es un dato válido: cuenta como sin número (nunca «Todo al día»).
  assert.deepEqual(F.semaforoDeFranja({ atrasados: -2 }), { tono: 'gris', texto: '—' });
  assert.deepEqual(F.semaforoDeFranja({ atrasados: -2, cargando: true }), { tono: 'gris', texto: 'Cargando…' });
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
  // Un conteo que no es número no se inventa; un filtro desconocido deja activo «Ver todo».
  assert.equal(F.opcionesSemaforo({ atrasados: 'x', filtro: 'todos' })[0].conteo, null);
  // r1 (M16): lo mismo en noResueltos, y un negativo no es un dato válido (ruling): null.
  assert.equal(F.opcionesSemaforo({ atrasados: 1, noResueltos: 'x' })[1].conteo, null);
  assert.equal(F.opcionesSemaforo({ atrasados: 1, noResueltos: NaN })[1].conteo, null);
  assert.deepEqual(F.opcionesSemaforo({ atrasados: -1, noResueltos: -3 }).map((o) => o.conteo), [null, null, null]);
  // r1 (M15a): un filtro que vale pero cuyo botón no se pinta (no_resueltos sin noResueltos) no deja NINGÚN botón
  // presionado: «Ver todo» mentiría, porque la tabla sigue filtrada.
  assert.deepEqual(F.opcionesSemaforo({ atrasados: 1, filtro: 'no_resueltos' }).map((o) => o.activo), [false, false]);
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

console.log('--- TEST 13 (T5A): textoDetalle (solo en el paso esEste) y textoMasAntiguo (solo con mostrarAntiguedad) ---');
{
  assert.equal(F.textoDetalle([{ label: 'Nueva', n: 1 }, { label: 'Asignada', n: 2 }]), 'Nueva 1 · Asignada 2');
  assert.equal(F.textoDetalle([{ label: 'Confirmada', n: 1234 }]), 'Confirmada 1.234');
  // Lo que no tiene etiqueta o número se salta; nada da ''.
  assert.equal(F.textoDetalle([{ label: 'Nueva', n: null }, { n: 3 }, null, { label: 'Asignada', n: 0 }]), 'Asignada 0');
  for (const nada of [null, undefined, [], 'x', {}]) assert.equal(F.textoDetalle(/** @type {any} */ (nada)), '');
  assert.equal(F.textoMasAntiguo(6), 'El más antiguo: 6 días');
  assert.equal(F.textoMasAntiguo(1), 'El más antiguo: 1 día');
  assert.equal(F.textoMasAntiguo(0), 'El más antiguo: 0 días');
  assert.equal(F.textoMasAntiguo(1200), 'El más antiguo: 1.200 días');
  assert.equal(F.textoMasAntiguo(1.4), 'El más antiguo: 1 día', 'redondeado, y el plural sale del redondeado');
  assert.equal(F.textoMasAntiguo(1.6), 'El más antiguo: 2 días', 'r1 (M16): se redondea, no se trunca');
  for (const nada of [null, undefined, NaN, -1, '6']) assert.equal(F.textoMasAntiguo(/** @type {any} */ (nada)), '');
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
  // r1 (M16): un aviso en blanco no se suma.
  assert.equal(F.tituloPaso({ clave: 'E', label: 'Aduana', estado: 'actual', avisos: [{ texto: '  ', tono: 'gris' }] }), 'Aduana');
  assert.equal(F.tituloPunto({ clave: 'E', label: 'Aduana', estado: 'actual', avisos: [{ texto: '  ', tono: 'rojo' }] }, 0, 1), 'Etapa 1 de 1: Aduana, en curso');
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
    { clave: 'k', ruta: RUTA, usuario: null, repeticion: 0, datos: D1, error: null });
  // Sin contexto la ruta es null, y estadoResumen la compara igual.
  const sinRuta = F.aplicarLlegadaResumen(null, { marca: 'k', ok: true, respuesta: { data: D1 } });
  assert.equal(sinRuta.ruta, null);
  assert.deepEqual(F.estadoResumen(sinRuta, { clave: 'k', ruta: RUTA }), { datos: null, cargando: true, error: null });
}

console.log('--- TEST 17 (T5A r1; M1, M5, M8, M11 y ruling): con error, «—» en toda la franja; Reintentando…; atraso corto ---');
{
  // estadoNumeroFranja: el estado de cada Contador de la franja. Sin error es estadoDeConteo de lib/tabla.js (la misma
  // regla de carga que BarraTabla).
  for (const [n, e] of [[null, undefined], [3, undefined], [3, 'actualizando'], [null, 'actualizando'], [0, 'listo'], [7, 'cargando'], [null, 'cargando']]) {
    assert.equal(F.estadoNumeroFranja(n, /** @type {any} */ (e)), estadoDeConteo(n, e), `${n}/${e}`);
  }
  assert.equal(F.estadoNumeroFranja(null), 'cargando', 'RP33: sin estado, un null es la barra gris');
  assert.equal(F.estadoNumeroFranja(5, 'cargando'), 'actualizando');
  // Ruling (M1): con error, «—» aunque quede un número (el último bueno).
  assert.equal(F.estadoNumeroFranja(5, 'error'), 'error');
  assert.equal(F.estadoNumeroFranja(0, 'error'), 'error');
  assert.equal(F.estadoNumeroFranja(null, 'error'), 'error');
  // M8: sin atenuar (el segmento activo del semáforo): al recargar el número se ve pleno; sin número, la barra gris.
  assert.equal(F.estadoNumeroFranja(5, 'cargando', { atenuar: false }), 'listo');
  assert.equal(F.estadoNumeroFranja(5, 'actualizando', { atenuar: false }), 'listo');
  assert.equal(F.estadoNumeroFranja(null, 'cargando', { atenuar: false }), 'cargando');
  assert.equal(F.estadoNumeroFranja(5, 'error', { atenuar: false }), 'error');

  // chipAtraso: el largo ('3 con atraso') y el corto ('3', para la pastilla; M11). Con error no se pinta (ruling).
  assert.deepEqual(F.chipAtraso(3), { largo: '3 con atraso', corto: '3' });
  assert.deepEqual(F.chipAtraso(1), { largo: '1 con atraso', corto: '1' });
  assert.deepEqual(F.chipAtraso(1234), { largo: '1.234 con atraso', corto: '1.234' });
  for (const nada of [0, null, undefined, -1, NaN]) assert.equal(F.chipAtraso(/** @type {any} */ (nada)), null, String(nada));
  // El largo es siempre textoAtraso (T3B): el chip no tiene otra regla.
  for (const n of [0, 1, 2, 1500, -3, null, '4']) assert.equal(F.chipAtraso(/** @type {any} */ (n))?.largo ?? '', textoAtraso(n), String(n));
  assert.equal(F.chipAtraso(3, { estadoConteos: 'error' }), null, 'con error, sin chip de atraso');
  assert.deepEqual(F.chipAtraso(3, { estadoConteos: 'cargando' }), { largo: '3 con atraso', corto: '3' }, 'al recargar sigue');

  // estadoDeFranja: la línea de error sigue mientras se reintenta (M5) y los números quedan en «—» hasta que sale bien.
  const NADA = { conError: false, reintentando: false, cargandoNumeros: false, estadoConteos: 'listo' };
  const falla = new Error('x');
  assert.deepEqual(F.estadoDeFranja(), NADA);
  assert.deepEqual(F.estadoDeFranja({ cargando: true }), { ...NADA, cargandoNumeros: true, estadoConteos: 'cargando' }, 'primera carga');
  assert.deepEqual(F.estadoDeFranja({ error: falla }), { ...NADA, conError: true, estadoConteos: 'error' });
  // Reintentar: useResumenFlujo ya no trae el error mientras carga; la franja lo recuerda (huboError).
  assert.deepEqual(F.estadoDeFranja({ cargando: true, huboError: true }), { conError: true, reintentando: true, cargandoNumeros: false, estadoConteos: 'error' });
  assert.deepEqual(F.estadoDeFranja({ cargando: true, error: falla }), { conError: true, reintentando: true, cargandoNumeros: false, estadoConteos: 'error' });
  // Sale bien: vuelven los números. Una recarga sin error previo no es un reintento.
  assert.deepEqual(F.estadoDeFranja({ huboError: true }), NADA);
  assert.deepEqual(F.estadoDeFranja({ cargando: true, huboError: false }), { ...NADA, cargandoNumeros: true, estadoConteos: 'cargando' });

  // La franja entera con error y datos viejos: cajas, botones y semáforo en «—»; sin chips de atraso.
  const f = F.estadoDeFranja({ cargando: true, huboError: true });
  const caja = pasosConConteos(FRANJA, { SC: { total: 4, atrasados: 2 } })[0];
  assert.equal(F.estadoNumeroFranja(caja.total, f.estadoConteos), 'error');
  assert.equal(F.chipAtraso(caja.atrasados, { estadoConteos: f.estadoConteos }), null);
  for (const o of F.opcionesSemaforo({ atrasados: 3, noResueltos: 8, filtro: 'atrasados' }).filter((x) => x.conConteo)) {
    assert.equal(F.estadoNumeroFranja(o.conteo, f.estadoConteos, { atenuar: !o.activo }), 'error', o.filtro);
  }
  assert.deepEqual(F.semaforoDeFranja({ atrasados: 3, cargando: f.cargandoNumeros, error: f.conError }), { tono: 'gris', texto: '—' });
  // Ya sin error: los números, el chip y el semáforo vuelven.
  const bien = F.estadoDeFranja({ huboError: true });
  assert.equal(F.estadoNumeroFranja(caja.total, bien.estadoConteos), 'listo');
  assert.deepEqual(F.chipAtraso(caja.atrasados, { estadoConteos: bien.estadoConteos }), { largo: '2 con atraso', corto: '2' });
  assert.deepEqual(F.semaforoDeFranja({ atrasados: 3, cargando: bien.cargandoNumeros, error: bien.conError }), { tono: 'rojo', texto: '3 con atraso' });
}

console.log('--- TEST 18 (T5A r1; M3, M9): conectorHecho y hayEnlaces ---');
{
  const p = (...estados) => estados.map((estado, i) => ({ clave: String(i), label: String(i), estado }));
  // Emerald solo de un paso hecho hacia uno hecho o actual; nunca hacia cancelado, pendiente o neutro.
  assert.equal(F.conectorHecho(p('hecho', 'hecho'), 0), true);
  assert.equal(F.conectorHecho(p('hecho', 'actual'), 0), true);
  for (const siguiente of ['cancelado', 'pendiente', 'neutro']) assert.equal(F.conectorHecho(p('hecho', siguiente), 0), false, siguiente);
  for (const desde of ['actual', 'pendiente', 'cancelado', 'neutro']) assert.equal(F.conectorHecho(p(desde, 'hecho'), 0), false, desde);
  assert.deepEqual([0, 1, 2, 3].map((i) => F.conectorHecho(pasosConProgreso(CINCO, 2), i)), [true, true, false, false]);
  assert.deepEqual([0, 1, 2, 3].map((i) => F.conectorHecho(pasosConProgreso(CINCO, 2, { canceladoEn: 1 }), i)), [false, false, false, false]);
  for (const i of [1, 5, -1, 0.5]) assert.equal(F.conectorHecho(p('hecho', 'hecho'), i), false, `índice ${i}`);
  for (const nada of [null, undefined, 'x', [null, null]]) assert.equal(F.conectorHecho(/** @type {any} */ (nada), 0), false);
  // El landmark navigation solo si algún paso es un enlace (M9).
  assert.equal(F.hayEnlaces([{ clave: 'a', href: '/x' }, { clave: 'b' }]), true);
  for (const sin of [[{ clave: 'a' }], [{ clave: 'a', href: '' }], [], null, undefined, [null]]) {
    assert.equal(F.hayEnlaces(/** @type {any} */ (sin)), false, JSON.stringify(sin));
  }
}

console.log('--- TEST 19 (T5A r1; M12, M13): el usuario del token y las vueltas en useResumenFlujo (sim-usuario, S8 y S9) ---');
{
  const RUTA = '/ventas/flujo';
  const DA = { semaforo: { atrasados: 3, no_resueltos: 9 } };
  const DB = { semaforo: { atrasados: 1, no_resueltos: 2 } };
  const { llamadas, pedir } = aMano();
  let resultado = null;
  const carga = crearCargaListado({ pedir, alLlegar: (l) => { resultado = F.aplicarLlegadaResumen(resultado, l); } });
  // La clave del hook: `${version}|${usuario ?? ''}|${recarga}|${ruta}`; la repetición es la de la carga.
  const clave = (usuario, recarga = 0, ruta = RUTA, version = 0) => `${version}|${usuario ?? ''}|${recarga}|${ruta}`;
  const pedirA = (usuario, recarga = 0, ruta = RUTA) => carga.cargar(ruta, clave(usuario, recarga, ruta), { ruta, usuario });
  const ver = (usuario, recarga = 0, ruta = RUTA) => F.estadoResumen(resultado, {
    clave: clave(usuario, recarga, ruta), ruta, usuario, repeticion: carga.repeticion(),
  });

  // M12: A carga sus números; la otra pestaña entra con B: nada de A se muestra, ni mientras carga ni con un error.
  pedirA(7);
  await tic();
  llamadas[0].resolver({ data: DA });
  await tic();
  assert.deepEqual(ver(7), { datos: DA, cargando: false, error: null });
  assert.deepEqual(ver(8), { datos: null, cargando: true, error: null }, 'otro usuario: cargando sin datos');
  pedirA(8);
  await tic();
  const prohibido = Object.assign(new Error('No tienes permiso'), { status: 403 });
  llamadas[1].rechazar(prohibido);
  await tic();
  assert.deepEqual(ver(8), { datos: null, cargando: false, error: prohibido }, 'B recibe 403: el error sin los datos de A');
  assert.equal(resultado.usuario, 8);
  // Y si B carga bien después, son los suyos.
  pedirA(8, 1);
  await tic();
  llamadas[2].resolver({ data: DB });
  await tic();
  assert.deepEqual(ver(8, 1), { datos: DB, cargando: false, error: null });
  // aplicarLlegadaResumen tampoco trae los datos de otro usuario a un error.
  const deA = F.aplicarLlegadaResumen(null, { marca: 'k', ok: true, respuesta: { data: DA }, contexto: { ruta: RUTA, usuario: 7 } });
  assert.equal(F.aplicarLlegadaResumen(deA, { marca: 'k2', ok: false, error: prohibido, contexto: { ruta: RUTA, usuario: 8 } }).datos, null);
  assert.equal(F.aplicarLlegadaResumen(deA, { marca: 'k2', ok: false, error: prohibido, contexto: { ruta: RUTA, usuario: 7 } }).datos, DA);

  // M13, S8: ruta B → A → B sin que llegue A. Volver a la clave que ya llegó es una vuelta: cargando hasta que llegue.
  const RB = '/compras/flujo';
  pedirA(8, 0, RB);
  await tic();
  llamadas[3].resolver({ data: DB });
  await tic();
  assert.deepEqual(ver(8, 0, RB), { datos: DB, cargando: false, error: null });
  pedirA(8, 0, RUTA);
  await tic();
  pedirA(8, 0, RB);
  await tic();
  assert.deepEqual(ver(8, 0, RB), { datos: DB, cargando: true, error: null }, 'S8: datos de B, cargando');
  llamadas[5].resolver({ data: DA });
  await tic();
  assert.deepEqual(ver(8, 0, RB), { datos: DA, cargando: false, error: null }, 'S8: llega la vuelta');
  assert.equal(resultado.repeticion, carga.repeticion());

  // M13, S9: recarga 5 → 6 → 5.
  pedirA(8, 5);
  await tic();
  llamadas[6].resolver({ data: DA });
  await tic();
  pedirA(8, 6);
  await tic();
  pedirA(8, 5);
  await tic();
  assert.deepEqual(ver(8, 5), { datos: DA, cargando: true, error: null }, 'S9: datos de 5, cargando');
  assert.equal(llamadas[7].signal.aborted, true, 'la de 6 se abortó');
  llamadas[8].resolver({ data: DB });
  await tic();
  assert.deepEqual(ver(8, 5), { datos: DB, cargando: false, error: null }, 'S9: llega la vuelta');
  // estadoResumen sin usuario ni repetición es el de antes (usuario null, repetición 0).
  const viejo = F.aplicarLlegadaResumen(null, { marca: 'k', ok: true, respuesta: { data: DA }, contexto: { ruta: RUTA } });
  assert.deepEqual(F.estadoResumen(viejo, { clave: 'k', ruta: RUTA }), { datos: DA, cargando: false, error: null });
  assert.deepEqual(F.estadoResumen(viejo, { clave: 'k', ruta: RUTA, usuario: 7 }), { datos: null, cargando: true, error: null });
  assert.deepEqual(F.estadoResumen(viejo, { clave: 'k', ruta: RUTA, repeticion: 1 }), { datos: DA, cargando: true, error: null });
}

console.log('--- TEST 20 (T5A r2; M1 y M5): avisosVisibles y la palabra de la caja caída aparte (etiquetaEstado) ---');
{
  const AV = [{ texto: '2 con cambios pedidos', tono: 'ambar' }, { texto: '  ', tono: 'gris' }, null,
    { texto: '1 sin respuesta al recordatorio', tono: 'rojo' }, { tono: 'rojo' }];
  // Los avisos que se pintan: los que traen texto (uno en blanco no).
  assert.deepEqual(F.avisosVisibles(AV), [AV[0], AV[3]]);
  assert.deepEqual(F.avisosVisibles(AV, { estadoConteos: 'cargando' }), [AV[0], AV[3]], 'al recargar siguen');
  // r2 (M1): con error tampoco se pintan, igual que el chip de atraso: son números del mismo resumen.
  assert.deepEqual(F.avisosVisibles(AV, { estadoConteos: 'error' }), []);
  assert.deepEqual(F.avisosVisibles(AV, { estadoConteos: F.estadoDeFranja({ cargando: true, huboError: true }).estadoConteos }), [],
    'tampoco mientras se reintenta');
  for (const nada of [null, undefined, 'x', {}]) assert.deepEqual(F.avisosVisibles(/** @type {any} */ (nada)), []);
  // r2 (M5): el title de la barra suma la palabra de la caja caída, que la cadena compacta pinta aparte.
  assert.equal(F.tituloPaso({ clave: 'PVEN', label: 'Pedido de venta', estado: 'cancelado', sublabel: 'PVEN-1', etiquetaEstado: 'Cancelado' }),
    'Pedido de venta: PVEN-1 · Cancelado');
  assert.equal(F.tituloPaso({ clave: 'PVEN', label: 'Pedido de venta', estado: 'cancelado', etiquetaEstado: 'Cancelado' }), 'Pedido de venta: Cancelado');
  assert.equal(F.tituloPaso({ clave: 'PVEN', label: 'Pedido de venta', estado: 'cancelado', sublabel: 'PVEN-1', etiquetaEstado: '  ' }), 'Pedido de venta: PVEN-1');
}

console.log('--- TEST 16 (T5A y r1; R4, C2, C13, RP33, RP67, D21, D38): el fuente de components/flujo (sin DOM en node) ---');
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
    // r1 (C1, M10): el foco es un outline (sobrevive a forced-colors); nunca outline-none.
    assert.ok(!/outline-none/.test(c), `${nombre}: sin outline-none`);
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
  // r1 (M15b): cuando un conteo no viene se pasa undefined, no null (null es «todavía carga»).
  assert.ok(fuentes['tipos.ts'].includes('se pasa `undefined`, no `null`'), 'tipos.ts documenta undefined frente a null');
  assert.ok(fuentes['BannerFlujo.tsx'].includes('se pasa `undefined`, no `null`'), 'el uso para T7 y T14 también');

  // PasosFlujo.
  const pasos = codigo(fuentes['PasosFlujo.tsx']);
  assert.match(pasos, /import \{ Contador \} from '@\/components\/ui\/Contador';/);
  assert.ok(!/estadoDeConteo|from '@\/lib\/tabla'/.test(pasos), 'el estado de cada número es estadoNumeroFranja (lib/flujo.js)');
  for (const n of ['indicePasoActual', 'textoMasAntiguo', 'chipAtraso', 'textoDetalle', 'textoEstadoPaso', 'tituloPaso', 'tituloPunto',
    'estadoNumeroFranja', 'conectorHecho', 'hayEnlaces']) {
    assert.match(pasos, new RegExp(`\\b${n}\\(`), `PasosFlujo usa ${n}`);
  }
  // RP33, D21 y el ruling de r1 (M1): la barra gris de Contador mientras carga y «—» con error, aunque haya número.
  assert.match(pasos, /<Contador\s+valor=\{paso\.total\}\s+estado=\{estadoNumeroFranja\(paso\.total, estadoConteos\)\}/);
  assert.match(pasos, /const chip = chipAtraso\(paso\.atrasados, \{ estadoConteos \}\);/, 'con error, sin chip de atraso');
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
  // Los avisos: ámbar, rojo y gris (slate, D36); r1 (C3): cada chip en una línea, recortado y con su title.
  assert.match(pasos, /ambar: 'border-amber-200 bg-amber-50 text-amber-800',/);
  assert.match(pasos, /rojo: 'border-rose-200 bg-rose-50 text-rose-700',/);
  assert.match(pasos, /gris: 'border-slate-200 bg-slate-100 text-slate-600',/);
  assert.match(pasos, /const CHIP = 'inline-block min-w-0 max-w-full truncate whitespace-nowrap rounded-full border align-middle font-semibold';/);
  assert.equal((pasos.match(/title=\{texto\}/g) ?? []).length, 2, 'el chip y el chip-botón llevan el texto completo en su title');
  // r2 (Important, regresión de r1): en la caja, los avisos no aportan al ancho intrínseco (w-0 min-w-full): así el
  // truncate recorta de verdad y las 5 cajas caben a 1024 px. Y r2 (M1): con error no se pintan (avisosVisibles).
  assert.match(pasos, /<span className=\{`flex-wrap gap-1 \$\{clases\}`\}>/);
  assert.match(pasos, /const lista = avisosVisibles\(avisos, \{ estadoConteos \}\);/);
  assert.match(pasos, /<AvisosDelPaso avisos=\{paso\.avisos\} estadoConteos=\{estadoConteos\} clases="hidden w-0 min-w-full @2xl\/flujo:flex" \/>/);
  assert.match(pasos, /<AvisosDelPaso avisos=\{paso\.avisos\} pequeno clases=\{`mt-0\.5 flex w-full min-w-0 /, 'en la barra, del ancho de su paso');
  // r1 (C1, M10): el foco es un outline, distinto del anillo de la selección.
  // El color va también en reposo: transition-colors anima outline-color, y sin él el outline aparecería negro y se
  // iría volviendo índigo.
  // B4 T24 (FINAL-m25, D27): ese FOCO es ahora el token común de design-system.ts (una sola copia), con el mismo texto.
  const ds = readFileSync(new URL('../src/lib/design-system.ts', import.meta.url), 'utf8');
  assert.ok(ds.includes("  indigo:  'outline-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700',"), 'FOCOS.indigo');
  assert.match(ds, /^export const FOCO = FOCOS\.indigo;\r?$/m, 'FOCO es FOCOS.indigo');
  for (const nombre of ['PasosFlujo.tsx', 'BannerFlujo.tsx']) {
    const f = fuentes[nombre];
    assert.ok(!/^const FOCO = /m.test(f), `${nombre}: sin su copia de FOCO`);
    assert.match(f, /^import \{ FOCO \} from '@\/lib\/design-system';\r?$/m, `${nombre}: importa FOCO`);
    assert.ok(codigo(f).includes('${FOCO}'), `${nombre}: usa FOCO`);
  }
  // r1 (M9 y M6): <nav> solo si hay enlaces; si no, un <ol aria-label>. El contenedor lleva w-full.
  assert.match(pasos, /if \(conNav\) \{\s*return \(\s*<nav aria-label=\{etiqueta\} className="w-full min-w-0">\s*<ol className=\{clases\}>\{children\}<\/ol>/);
  assert.match(pasos, /<div className="w-full min-w-0">\s*<ol aria-label=\{etiqueta\} className=\{clases\}>\{children\}<\/ol>/);
  assert.equal((pasos.match(/conNav=\{hayEnlaces\(pasos\)\}/g) ?? []).length, 2, 'la franja y la barra');
  // La franja: ol con relleno (C1: el anillo y el outline no se recortan), compensado con -mx-1, y scroll por dentro.
  // r1 (M11): el snap solo con puntero táctil; con teclado, el snap devolvía la pastilla enfocada a medias (375 px).
  assert.match(pasos, /const lista = `@container\/flujo -mx-1 flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain pointer-coarse:snap-x scroll-px-1 p-1 /);
  assert.ok(!/(?<![:\w-])snap-x/.test(pasos), 'sin snap-x para todos los punteros');
  assert.match(pasos, /const clases = `@container\/flujo flex w-full min-w-0 p-1 /, 'la barra: relleno y su propio ancho');
  assert.equal((pasos.match(/<svg\s+aria-hidden="true"/g) ?? []).length, 2, 'la flecha horizontal y la vertical');
  assert.match(pasos, /<path d="M2 12l4 4 4-4" \/>/, 'en vertical la punta va hacia abajo');
  // r1 (C3): la caja se estira al alto de la fila y la flecha queda centrada en ella (en la pastilla, a su altura).
  assert.ok(pasos.includes('@2xl/flujo:w-full @2xl/flujo:flex-1 @2xl/flujo:min-w-[7rem]'), 'la caja: flex-1 en su columna');
  assert.match(pasos, /self-start mt-\[9px\] @2xl\/flujo:mt-0 @2xl\/flujo:self-center/);
  // Link si trae href; button aria-pressed si hay onSeleccionar y no es esEste; div en los demás.
  assert.match(pasos, /if \(paso\.href\) \{\s*return \(\s*<Link href=\{paso\.href\} aria-current=\{actual\} onFocus=\{alEnfocar\}/);
  assert.match(pasos, /if \(onSeleccionar && !paso\.esEste\) \{\s*return \(\s*<button\s+type="button"\s+aria-pressed=\{Boolean\(paso\.seleccionado\)\}/);
  assert.match(pasos, /<div aria-current=\{actual\} className=\{className\}>/);
  assert.match(pasos, /onClick=\{\(\) => onSeleccionar\(paso\.clave\)\}/);
  // r1 (M11): al recibir el foco, el paso se desplaza para verse entero.
  // r2 (M7): solo si el foco viene del teclado (:focus-visible); con un clic o un toque, desplazar se comía el clic.
  assert.match(pasos, /const alEnfocar = \(e: FocusEvent<HTMLElement>\) => \{\s*const el = e\.currentTarget;\s*if \(el\.matches\(':focus-visible'\)\) el\.scrollIntoView\(\{ inline: 'nearest', block: 'nearest' \}\);\s*\};/);
  assert.equal((pasos.match(/onFocus=\{alEnfocar\}/g) ?? []).length, 2, 'el enlace y el botón');
  // aria-current: 'page' en la franja, 'step' en la barra y en los puntos.
  assert.match(pasos, /actual=\{i === marcado \? 'page' : undefined\}/);
  assert.match(pasos, /actual=\{i === marcado \? 'step' : undefined\}/);
  assert.match(pasos, /aria-current=\{i === marcado \? 'step' : undefined\}/);
  // La franja: caja (rounded-xl, min-w-[7rem], número text-xl font-black) desde @2xl y pastilla por debajo.
  for (const clase of ['@2xl/flujo:min-w-[7rem]', '@2xl/flujo:rounded-xl', '@2xl/flujo:flex-col', 'rounded-full', 'whitespace-nowrap',
    '@2xl/flujo:text-xl', 'font-black', 'text-xs font-bold', 'ring-2 ring-indigo-500', 'border-indigo-300 bg-indigo-50/60',
    '@2xl/flujo:border-l-rose-400', 'bg-rose-50', 'text-rose-700', "const SOLO_CAJA = 'hidden @2xl/flujo:block';",
    // r1 (M8): el sufijo, el detalle y la antigüedad en slate-600 (4,5:1 también sobre indigo-50).
    'hidden text-xs text-slate-600 @2xl/flujo:inline', '${SOLO_CAJA} text-[11px] text-slate-600']) {
    assert.ok(pasos.includes(clase), `PasosFlujo: ${clase}`);
  }
  assert.ok(!/text-slate-500 @2xl\/flujo:inline|SOLO_CAJA\} text-\[11px\] text-slate-500/.test(pasos), 'M8: nada de slate-500 en la caja');
  // r1 (M11): el atraso corto en la pastilla («3», con el largo en el title y para el lector).
  assert.match(pasos, /title=\{chip\.largo\}/);
  assert.match(pasos, /<span aria-hidden="true">\{chip\.corto\}<\/span>\s*<span className="sr-only">\{chip\.largo\}<\/span>/, 'compacto: siempre corto');
  assert.match(pasos, /<span aria-hidden="true" className="@2xl\/flujo:hidden">\{chip\.corto\}<\/span>\s*<span className="sr-only @2xl\/flujo:not-sr-only">\{chip\.largo\}<\/span>/);
  assert.match(pasos, /const detalle = paso\.esEste \? textoDetalle\(paso\.detalle\) : '';/, 'el detalle solo en el esEste');
  assert.match(pasos, /const antiguedad = mostrarAntiguedad \? textoMasAntiguo\(paso\.masAntiguoDias\) : '';/);
  assert.match(pasos, /const ayuda = mostrarAyuda && paso\.ayuda \? paso\.ayuda : '';/);
  assert.match(pasos, /variante = 'barra'/, "por defecto 'barra'");
  assert.match(pasos, /mostrarAntiguedad = false/, 'flujo_contenido_caja: sin antigüedad por defecto');
  assert.equal((pasos.match(/>\s*Estás aquí\s*</g) ?? []).length, 2, "'Estás aquí' en la franja y en la barra");
  // La barra: 28 px (22 px compacta), ✓ y X de lucide, label 11 px y sublabel 10 px recortado.
  for (const clase of ["'h-[22px] w-[22px] text-[10px]'", "'h-7 w-7 text-xs'", 'border-emerald-500 bg-emerald-500 text-white',
    'border-indigo-600 bg-indigo-600 text-white ring-4 ring-indigo-100', 'border-rose-500 bg-rose-500 text-white',
    'text-[11px] font-bold', 'gap-1 text-[10px] text-slate-500', 'sr-only @md/flujo:not-sr-only', 'h-0.5 min-w-3 flex-1']) {
    assert.ok(pasos.includes(clase), `barra: ${clase}`);
  }
  // r1 (M8): en la tabla CIRCULO, el número del pendiente en slate-500 (4,76:1 sobre blanco) y el del neutro, sobre
  // slate-100, en slate-600 (slate-500 da 4,35:1 ahí). Se mira la tabla: los avisos grises usan las mismas clases.
  const circulo = pasos.split('const CIRCULO')[1].split('};')[0];
  assert.match(circulo, /pendiente: 'border-slate-300 bg-white text-slate-500',/);
  assert.match(circulo, /neutro: 'border-slate-200 bg-slate-100 text-slate-600',/);
  assert.ok(!/text-slate-400'/.test(circulo), 'M8: ningún círculo en slate-400');
  assert.match(pasos, /estado === 'hecho' \? <Check size=\{icono\} strokeWidth=\{3\} \/> : estado === 'cancelado' \? <X size=\{icono\} strokeWidth=\{3\} \/> : i \+ 1/);
  // r1 (C2): sin tope fijo; los li se reparten el ancho por su contenido y el último también puede achicarse.
  assert.ok(!pasos.includes('max-w-[9rem]'), 'C2: sin el tope de 144 px');
  assert.match(pasos, /\$\{i < ultimo \? 'flex-auto' : 'flex-initial'\}/);
  // r1 (M9): el title no repite el nombre del paso: va en el label (el tooltip del paso) y en el sublabel recortado.
  // B4 T10: la clase de la etiqueta sale de ETIQUETA_RECORTADA (la de siempre, 'max-w-full truncate') o, con
  // partirEtiquetas, de ETIQUETA_PARTIDA (TEST 22); el title, la letra y el color no cambian.
  assert.match(pasos, /<span title=\{tituloPaso\(paso\)\} className=\{`\$\{partirEtiquetas \? ETIQUETA_PARTIDA : ETIQUETA_RECORTADA\} text-\[11px\] font-bold/);
  assert.match(pasos, /const ETIQUETA_RECORTADA = 'max-w-full truncate';/);
  assert.equal((pasos.match(/title=\{paso\.sublabel\}/g) ?? []).length, 1, 'el sublabel recortado lleva su tooltip');
  assert.ok(!/title=\{title\}|title\?: string/.test(pasos), 'el elemento del paso ya no lleva title');
  // r1 (M7): en compacto el sublabel (solo el número) siempre se ve. r2 (M5): la palabra de la caja caída va en su
  // propio span, sin truncate; lo que se recorta es el número.
  assert.match(pasos, /\{paso\.sublabel \|\| paso\.etiquetaEstado \? \(compacto \? \(\s*<LineaSublabel paso=\{paso\} vertical=\{vertical\} \/>/);
  assert.match(pasos, /\{paso\.sublabel \? <span title=\{paso\.sublabel\} className="min-w-0 truncate">\{paso\.sublabel\}<\/span> : null\}/);
  assert.match(pasos, /\{paso\.etiquetaEstado \? \(\s*<span className="shrink-0 whitespace-nowrap font-semibold text-rose-700">[\s\S]*?\{paso\.etiquetaEstado\}\s*<\/span>\s*\) : null\}/,
    'la palabra se pinta y no se recorta');
  assert.equal((pasos.match(/<LineaSublabel paso=\{paso\} vertical=\{vertical\} \/>/g) ?? []).length, 2, 'en compacto y en la barra normal');
  // r1 (M3): emerald solo de hecho a hecho o actual, en la barra (horizontal y vertical) y en los puntos.
  assert.equal((pasos.match(/conectorHecho\(pasos, i\) \? 'bg-emerald-500' : 'bg-slate-200'/g) ?? []).length, 3);
  assert.ok(!/estado === 'hecho' \? 'bg-emerald-500'/.test(pasos), 'sin el conector de r0');
  // Los puntos: 10 px, conectores de 8 px y el title de cada punto.
  assert.match(pasos, /const titulo = tituloPunto\(paso, i, n\);/);
  assert.ok(pasos.includes('h-2.5 w-2.5') && pasos.includes('h-0.5 w-2 shrink-0'), 'mini: 10 px y 8 px');
  assert.match(pasos, /<ol aria-label=\{etiqueta\} className="inline-flex items-center">/, 'mini: sin <nav> por fila');

  // BannerFlujo.
  const banner = codigo(fuentes['BannerFlujo.tsx']);
  assert.match(banner, /import \{ usePreferencia \} from '@\/components\/ui\/usePreferencia';/, 'D38: el hook de components/ui');
  assert.match(banner, /usePreferencia<boolean>\(`flujo:\$\{idPreferencia\}`, false, \{ validar: esBooleano \}\)/, 'R4: flujo:<id>');
  assert.ok(!/guardarPreferencia|claveCompacto|preferenciasApp\(/.test(banner),
    'RP33: sin guardarPreferencia(claveCompacto(…)); la lectura después de montar la hace usePreferencia');
  // r1 (M9): la sección se nombra con su h2 (aria-labelledby), que además recibe el foco al salir bien un reintento.
  assert.match(banner, /<section aria-labelledby=\{idTitulo\} aria-busy=\{cargando\} className="min-w-0 border-b border-slate-200 bg-white px-6 py-3">/);
  assert.match(banner, /<h2 id=\{idTitulo\} ref=\{tituloRef\} tabIndex=\{-1\}/);
  assert.match(banner, /const idTitulo = useId\(\);/);
  // r1 (M1 y M5): el estado de la franja (lib/flujo.js) y lo que vio en el render anterior.
  assert.match(banner, /const f = estadoDeFranja\(\{ cargando, error, huboError \}\);\s*if \(f\.conError !== huboError\) setHuboError\(f\.conError\);/);
  assert.match(banner, /const resumen = semaforoDeFranja\(\{ atrasados: semaforo\?\.atrasados \?\? null, cargando: f\.cargandoNumeros, error: f\.conError \}\);/);
  // B4 T7 r1 (A1, ruling del controlador; reabre M4): el esqueleto de la franja tiene la forma de lo cargado, para que
  // no crezca al llegar los datos (CLS ≤ 0,1). Solo crecen los chips de aviso, que de verdad dependen de los datos.
  // (1) La fila del semáforo lleva sus botones: con la clave noResueltos y sin su número todavía (Ventas), «No
  // resueltos» se reserva con null, la barra gris (M15b); sin la clave (Compras) no aparece. Las opciones siguen
  // saliendo de opcionesSemaforo; con error o con datos no cambia nada.
  assert.match(banner,
    /const semaforoVisto = f\.cargandoNumeros && semaforo && 'noResueltos' in semaforo && semaforo\.noResueltos === undefined\s*\? \{ \.\.\.semaforo, noResueltos: null \}\s*: semaforo;\s*const opciones = opcionesSemaforo\(semaforoVisto\);/,
    'A1: el semáforo reserva «No resueltos» mientras carga');
  assert.deepEqual(F.opcionesSemaforo({ atrasados: null, noResueltos: null, filtro: 'todos' }).map((o) => [o.filtro, o.conteo]),
    [['atrasados', null], ['no_resueltos', null], ['todos', null]], 'null: el botón, con la barra gris');
  assert.deepEqual(F.opcionesSemaforo({ atrasados: null, filtro: 'todos' }).map((o) => o.filtro), ['atrasados', 'todos'],
    'sin la clave: sin el botón');
  // (2) El renglón del número de cada caja: mientras carga, Contador pinta una barra de 8 px como hijo directo del span
  // que lleva la letra del número; la franja le da a ese span el alto de un renglón de su letra (min-h-lh).
  assert.match(banner, /const RENGLON_DEL_NUMERO = '\[&_:has\(>\.animate-pulse\)\]:min-h-lh';/, 'A1: el renglón del número');
  assert.match(banner, /<div className=\{`mt-3 min-w-0 \$\{RENGLON_DEL_NUMERO\}`\}>\s*<PasosFlujo\s+variante="banner"/,
    'A1: la reserva va sobre los pasos');
  assert.equal((banner.match(/animate-pulse/g) ?? []).length, 1, 'A1: el selector es el único animate-pulse de la franja');
  const contador = codigo(leer('components/ui/Contador.tsx'));
  assert.match(contador,
    /<span className=\{`inline-flex items-center \$\{className\}`\}>\s*<span aria-hidden="true" className="inline-block h-2 w-4 rounded-full bg-current opacity-30 animate-pulse" \/>/,
    'A1: la barra de Contador es el hijo directo con animate-pulse del span con la letra');
  assert.match(pasos,
    /<Contador\s+valor=\{paso\.total\}\s+estado=\{estadoNumeroFranja\(paso\.total, estadoConteos\)\}\s+className=\{`font-black text-slate-900 \$\{compacto \? 'text-sm' : 'text-sm @2xl\/flujo:text-xl'\}`\}/,
    'A1: la caja le pasa a Contador la letra del número cargado');
  assert.ok(!/animate-pulse/.test(pasos), 'A1: en las cajas, la única barra es la de Contador');
  // B4 T7 r1c (ruling de 1536 px): en qué renglón va el grupo del semáforo lo decide el ancho de la fila (un breakpoint
  // de container query), nunca el largo de la regla. Desde 960 px de fila: el bloque del título y la regla con
  // min-w-0 flex-1 y el grupo al lado con shrink-0, arriba (items-start), sin bajar (flex-nowrap). Por debajo: el bloque
  // se deshace (contents) y el grupo va en su propio renglón (basis-full) entre el título y la regla (order), así que
  // la regla larga no lo mueve. Los conteos del grupo van en una ranura de min-w-6 (24 px: «(» + la barra de Contador
  // + «)»).
  const fuenteBanner = fuentes['BannerFlujo.tsx'];
  // Tailwind solo genera las clases que ve escritas enteras: el breakpoint va literal en cada una, y es uno solo.
  const PUNTO = '@min-[960px]/fila';
  assert.deepEqual([...new Set(codigo(fuenteBanner).match(/@min-\[[^\]]+\]\/\w+/g) ?? [])], [PUNTO], 'r1c: un solo breakpoint, el de la fila');
  assert.match(fuenteBanner, /960 = el grupo en una línea \(719 px/, 'r1c: el porqué del breakpoint, con los números');
  const clasesDe = (nombre) => (new RegExp(`const ${nombre} = '([^']*)';`).exec(fuenteBanner)?.[1] ?? '').split(/\s+/).filter(Boolean);
  const fila = clasesDe('FILA');
  const bloque = clasesDe('BLOQUE_TITULO');
  const grupo = clasesDe('GRUPO_SEMAFORO');
  for (const c of ['flex', 'flex-wrap', 'items-center', `${PUNTO}:flex-nowrap`, `${PUNTO}:items-start`, `${PUNTO}:gap-x-4`]) {
    assert.ok(fila.includes(c), `r1c: la fila lleva ${c}`);
  }
  // Una container query no se aplica al elemento que la declara: el contenedor es una envoltura de la fila.
  assert.ok(!fila.includes('@container/fila'), 'r1c: la fila no es su propio contenedor');
  assert.match(banner, /<div className="@container\/fila">\s*<div className=\{FILA\}>/, 'r1c: la envoltura con @container/fila');
  for (const c of ['contents', `${PUNTO}:flex`, 'min-w-0', 'flex-1', 'flex-wrap']) assert.ok(bloque.includes(c), `r1c: el bloque lleva ${c}`);
  for (const c of ['order-1', 'basis-full', 'shrink-0', `${PUNTO}:basis-auto`]) assert.ok(grupo.includes(c), `r1c: el grupo lleva ${c}`);
  assert.ok(!grupo.some((c) => c.startsWith('@min') && c.includes('shrink')), 'r1c: el grupo no encoge en ningún ancho');
  assert.match(banner, /<div className=\{FILA\}>\s*<div className=\{BLOQUE_TITULO\}>/);
  assert.match(banner, /<div className=\{GRUPO_SEMAFORO\}>\s*\{semaforo && opciones\.length \? \(/);
  // La regla va siempre en su propio renglón (basis-full): en su columna desde el breakpoint y después del grupo por
  // debajo. Así, al llegar la larga, solo crece hacia abajo; no salta del lado del título al renglón de abajo (medido a
  // 1536 × 864: ese salto de lado pesaba 0,10 de CLS).
  assert.match(banner, /\{regla \? <span className="order-2 basis-full text-xs text-slate-500">\{regla\}<\/span> : null\}/, 'r1c: la regla, en su renglón y completa (sin truncate)');
  assert.match(banner, /\{avisos\?\.length \? \(\s*<span className="order-3 /, 'r1c: los avisos, después de la regla');
  assert.ok(!/truncate|line-clamp/.test(banner.slice(banner.indexOf('<div className={BLOQUE_TITULO}>'), banner.indexOf('<div className={GRUPO_SEMAFORO}>'))),
    'r1c: la regla no se trunca');
  // La ranura del conteo con sus paréntesis: el ancho de «(» + la barra de Contador + «)» (min-w-6, 24 px medidos) y el
  // alto de un renglón de text-xs (h-4), cargando y con un número de una o dos cifras. Sin la fila por delante
  // (justify-start), el «( 9 )» no lleva espacios adentro: el aire queda fuera de los paréntesis.
  assert.match(banner, /<span className="inline-flex h-4 min-w-6 items-center justify-center">\s*\(<Contador valor=\{o\.conteo\} estado=\{estadoNumeroFranja\(o\.conteo, f\.estadoConteos, \{ atenuar: false \}\)\} \/>\)\s*<\/span>/, 'r1c: la ranura del conteo');
  assert.ok(!fila.includes('justify-between'), 'r1c: sin justify-between (por debajo del breakpoint separaba el título de su estado)');
  assert.match(banner, /aria-pressed=\{o\.activo\}\s+onClick=\{\(\) => semaforo\.onFiltrar\(alternarFiltroSemaforo\(semaforo\.filtro, o\.filtro\)\)\}/);
  // C13, el ruling M1 y M8: «—» con error; sin atenuar en los segmentos (el activo es blanco sobre rose-600).
  assert.match(banner, /<Contador valor=\{o\.conteo\} estado=\{estadoNumeroFranja\(o\.conteo, f\.estadoConteos, \{ atenuar: false \}\)\} \/>/);
  assert.ok(!/estadoDeConteo|estadoKpi\(/.test(banner), 'el estado de los números sale de estadoDeFranja y estadoNumeroFranja');
  assert.match(banner, /gris: CircleDashed, rojo: AlertTriangle, verde: CheckCircle2/);
  assert.match(banner, /gris: 'text-slate-400', rojo: 'text-rose-600', verde: 'text-emerald-600'/);
  assert.match(banner, /<PasosFlujo\s+variante="banner"\s+pasos=\{pasos\}\s+etiqueta="Pasos del flujo"\s+onSeleccionar=\{onSeleccionarPaso\}\s+compacto=\{compacto\}\s+mostrarAntiguedad=\{mostrarAntiguedad\}\s+mostrarAyuda=\{verAyuda\}\s+estadoConteos=\{f\.estadoConteos\}\s+\/>/);
  assert.match(banner, /onClick=\{\(\) => guardarCompacto\(!compacto\)\}/);
  assert.match(banner, /\{compacto \? 'Ver flujo' : 'Ocultar flujo'\}/);
  assert.match(banner, /aria-pressed=\{verAyuda\} onClick=\{\(\) => setVerAyuda\(\(v\) => !v\)\}/, '¿Cómo funciona? no se guarda');
  assert.match(banner, /accionAjustar = null/);
  assert.match(banner, /\{accionAjustar \? \(/);
  // B4 T7 (D27(a)): «Ajustar tiempos» conserva los dos guardias que tenía en el Hub: apagado mientras no se leyó
  // /ventas/config (disabled) y el porqué (title). AccionAjustar los suma, opcionales, con los nombres de ItemMenuFila.
  assert.match(fuentes['tipos.ts'],
    /export type AccionAjustar = \{ label: string; onClick: \(\) => void; deshabilitado\?: boolean; titulo\?: string \};/);
  assert.match(banner,
    /<button type="button" onClick=\{accionAjustar\.onClick\} disabled=\{accionAjustar\.deshabilitado\} title=\{accionAjustar\.titulo\} className=\{`\$\{BOTON\} disabled:cursor-not-allowed disabled:opacity-50`\}>/,
    'Ajustar tiempos: disabled y title de la acción, con el estilo apagado');
  // r1 (M5): la línea de error sigue mientras se reintenta; el botón no se deshabilita (conserva el foco).
  assert.match(banner, /\{f\.conError \? \(\s*<div role="alert"/);
  assert.match(banner, /aria-disabled=\{f\.reintentando \|\| undefined\}/);
  assert.match(banner, /\{f\.reintentando \? 'Reintentando…' : 'Reintentar'\}/);
  // B4 T7: el único disabled es el de «Ajustar tiempos»; Reintentar sigue con aria-disabled (conserva el foco).
  assert.deepEqual(banner.match(/(?<![-\w])disabled=\{[^}]*\}/g), ['disabled={accionAjustar.deshabilitado}'],
    'aria-disabled en Reintentar, no disabled');
  // r2 (M2 y M6): focoPendiente solo si el botón tenía el foco en el clic; se limpia al terminar el reintento (bien o
  // mal), con un pointerdown o si el foco va a otra parte; al salir bien, el h2 solo si el foco quedó en el body, y
  // con preventScroll (el main no salta).
  assert.match(banner, /if \(f\.reintentando\) return;\s*focoPendiente\.current = document\.activeElement === e\.currentTarget;\s*onReintentar\(\);/);
  assert.match(banner, /ref=\{reintentarRef\}/);
  assert.ok(!/onBlur/.test(banner), 'sin la guarda de relatedTarget de r1');
  assert.match(banner, /useEffect\(\(\) => \{\s*const termino = reintentandoAntes\.current && !f\.reintentando;\s*reintentandoAntes\.current = f\.reintentando;\s*if \(!termino\) return;\s*const devolver = focoPendiente\.current && !f\.conError;\s*focoPendiente\.current = false;\s*const activo = document\.activeElement;\s*if \(devolver && \(!activo \|\| activo === document\.body\)\) tituloRef\.current\?\.focus\(\{ preventScroll: true \}\);\s*\}, \[f\.reintentando, f\.conError\]\);/,
    'al terminar el reintento se limpia; al salir bien, el h2 sin desplazar');
  assert.match(banner, /useEffect\(\(\) => \{\s*if \(!f\.conError\) return undefined;\s*const soltar = \(\) => \{\s*focoPendiente\.current = false;\s*\};\s*const alPulsar = \(e: PointerEvent\) => \{\s*if \(!\(e\.target instanceof Node && reintentarRef\.current\?\.contains\(e\.target\)\)\) soltar\(\);\s*\};\s*const alEnfocarOtro = \(e: FocusEvent\) => \{\s*if \(e\.target !== reintentarRef\.current\) soltar\(\);\s*\};\s*document\.addEventListener\('pointerdown', alPulsar, true\);\s*document\.addEventListener\('focusin', alEnfocarOtro, true\);\s*return \(\) => \{\s*document\.removeEventListener\('pointerdown', alPulsar, true\);\s*document\.removeEventListener\('focusin', alEnfocarOtro, true\);\s*\};\s*\}, \[f\.conError\]\);/,
    'un pointerdown fuera del botón o el foco en otro control sueltan el foco pendiente (revisión de r2: el doble clic en Reintentar no lo suelta)');
  assert.equal((banner.match(/useEffect\(/g) ?? []).length, 2, 'dos efectos: el fin del reintento y los oyentes');
  assert.ok(!/\.focus\(\)/.test(banner), 'ningún focus() sin preventScroll');
  // r2 (M3): el ejemplo del JSDoc separa Ventas (no_resueltos o undefined) y Compras (sin noResueltos); ninguno da null.
  const jsdoc = fuentes['BannerFlujo.tsx'];
  assert.ok(jsdoc.includes('noResueltos: flujo.datos?.semaforo?.no_resueltos,'), 'Ventas');
  assert.ok(/Compras[^\n]*\n[\s\S]*?sin noResueltos/.test(jsdoc), 'Compras, sin noResueltos');
  assert.ok(!jsdoc.includes('flujo.datos ? flujo.datos.semaforo?.no_resueltos : null'), 'sin el ejemplo de r1 que daba null mientras carga');
  for (const texto of ['¿Cómo funciona?', 'No se pudieron cargar los números del flujo.', 'Reintentar', 'role="group"']) {
    assert.ok(banner.includes(texto), `BannerFlujo: ${texto}`);
  }
  assert.ok(!/Sin resolver|Pendientes/.test(banner), 'cruce C9: el botón es «No resueltos» (sale de opcionesSemaforo)');
  assert.ok(!/partes/.test(banner.split('export function BannerFlujo')[1]), "R1: partes no se lee (solo 'todo')");

  // useResumenFlujo. B4 T24 f2 r1 (C2, D27): una sola implementación del cargador. useResumenFlujo es el envoltorio de useResumen
  // (components/ui) con la regla del flujo (RESUMEN_DEL_FLUJO: sus textos y, con error, lo último bueno) y su forma pública de siempre
  // ({datos, cargando, error, recargar}). Las protecciones de antes (apiFetch con signal, el turno de crearCargaListado, abortar al
  // desmontar o al cambiar, r1 M12 el usuario del token, r1 M13 las vueltas, la clave y el efecto) siguen, sobre el cableado común.
  const hook = codigo(fuentes['useResumenFlujo.ts']);
  assert.match(hook, /import \{ useResumen \} from '@\/components\/ui\/useResumen';/);
  assert.match(hook, /import \{ RESUMEN_DEL_FLUJO \} from '@\/lib\/flujo';/);
  assert.match(hook, /export function useResumenFlujo<T = DatosFlujo>\(ruta: string, recarga: number = 0\): ResumenFlujo<T> \{\s*const r = useResumen<T>\(ruta, recarga, RESUMEN_DEL_FLUJO\);\s*return useMemo\(\s*\(\) => \(\{ datos: r\.datos, cargando: r\.cargando, error: r\.error, recargar: r\.recargar \}\),\s*\[r\],\s*\);\s*\}/);
  for (const copia of ['crearCargaListado', 'useEffect', 'useSyncExternalStore', 'usuarioDeLaSesion', 'apiFetch', 'estadoResumen']) {
    assert.ok(!hook.includes(copia), `useResumenFlujo sin su copia del cargador: ${copia}`);
  }
  const comun = codigo(leer('components/ui/useResumen.ts'));
  assert.match(comun, /import \{ apiFetch \} from '@\/lib\/api';/);
  assert.match(comun, /const pedirResumen = \(url: string, signal: AbortSignal\) => apiFetch\(url, \{ signal \}\);/);
  assert.match(comun, /import \{ crearCargaListado \} from '@\/lib\/tabla';/);
  assert.match(comun, /alLlegar: \(llegada\) => setResultado\(\(previo\) => aplicarLlegadaResumen\(previo, llegada, regla\)\)/);
  assert.match(comun, /import \{ usuarioDeLaSesion \} from '@\/components\/tabla\/usuarioDeLaSesion';/);
  assert.ok(!/usuarioDeLaSesion/.test(leer('components/tabla/index.ts')), 'el index de tabla no lo exporta');
  assert.match(comun, /const usuario = usuarioDeLaSesion\(\);/);
  assert.match(comun, /const repeticion = useSyncExternalStore\(carga\.suscribir, carga\.repeticion, carga\.repeticion\);/);
  assert.match(comun, /const clave = `\$\{version\}\|\$\{usuario \?\? ''\}\|\$\{recarga\}\|\$\{ruta\}`;/);
  assert.match(comun, /useEffect\(\(\) => \{\s*carga\.cargar\(ruta, clave, \{ ruta, usuario \}\);\s*return \(\) => carga\.cancelar\(\);\s*\}, \[carga, ruta, clave, usuario\]\);/);
  assert.match(comun, /const recargar = useCallback\(\(\) => setVersion\(\(v\) => v \+ 1\), \[\]\);/);
  assert.match(comun, /const visto = estadoResumen\(resultado, \{ clave, ruta, usuario, repeticion \}\);/);
  assert.match(comun, /recarga: number = 0, regla: ReglaResumen = RESUMEN_DE_TARJETAS/);
}

console.log('--- TEST 21 (B4 T9 r1, m6): BannerFlujo reserva el renglón de los avisos con reservarAvisos (aditivo) ---');
{
  // Una pantalla cuyos avisos llegan en otra respuesta que /ventas/flujo (Cotizaciones: los de su lista) reserva su
  // renglón mientras tanto: al llegar no empujan las cajas ni lo de abajo (CLS). Sin la prop, la franja es la de antes.
  const fuente = readFileSync(new URL('../src/components/flujo/BannerFlujo.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  assert.match(codigo, /\n {2}reservarAvisos\?: boolean;\n/, 'la prop nueva, opcional');
  assert.match(codigo, /accionAjustar = null, idPreferencia, mostrarAntiguedad = false, reservarAvisos = false,\n\}: PropsBannerFlujo\)/, 'por defecto false');
  const FILA = 'order-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1';
  // Con avisos, los mismos chips de siempre en el mismo renglón (sin la prop o con ella).
  assert.ok(codigo.includes(`{avisos?.length ? (\n              <span className="${FILA}">\n                {avisos.map((a, i) => <ChipAviso key={\`\${a.texto}-\${i}\`} texto={a.texto} tono={a.tono} onClick={a.onClick} />)}\n              </span>\n            ) : reservarAvisos ? (`),
    'con avisos, igual que antes');
  // Sin avisos y con reservarAvisos: el mismo renglón, invisible y fuera del árbol accesible, con un chip del mismo alto.
  assert.match(codigo, new RegExp(`\\) : reservarAvisos \\? \\(\\s*<span aria-hidden="true" className="${FILA} invisible">\\s*<ChipAviso texto="Avisos" tono="gris" />\\s*</span>\\s*\\) : null\\}`),
    'el renglón reservado');
  // Las demás pantallas no la pasan: su franja no cambia (el Hub, Solicitudes y su esqueleto).
  for (const ruta of ['app/dashboard/ventas/page.tsx', 'app/dashboard/ventas/solicitud/solicitud-client.tsx', 'app/dashboard/ventas/solicitud/CargandoSolicitudes.tsx']) {
    assert.ok(!readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').includes('reservarAvisos'), `${ruta} no la pasa`);
  }
  // Cotizaciones la pasa mientras su lista no respondió, y su esqueleto también (la misma geometría, A2). B4 T24 f2 (B14-f, D27): con
  // data.cotizaciones de /ventas/flujo, solo si habrá avisos (reservaAvisosCotizaciones; sin la clave, como antes).
  const cot = readFileSync(new URL('../src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(cot, /const avisosPendientes = reservaAvisosCotizaciones\(flujo\.datos, listado\.crudo === null && listado\.error === null\);/);
  assert.match(cot, /avisos=\{avisosFlujo\}\s*reservarAvisos=\{avisosPendientes\}\s*cargando=\{flujo\.cargando\}/);
  const carga = readFileSync(new URL('../src/app/dashboard/ventas/cotizacion/CargandoCotizaciones.tsx', import.meta.url), 'utf8');
  assert.match(carga, /pasos=\{pasosDeLista\(null, 'COT'\)\}\s*reservarAvisos\s*cargando/);
}

console.log('--- TEST 22 (B4 T10): PasosFlujo parte las etiquetas de la barra en varias líneas con partirEtiquetas (aditivo) ---');
{
  // El Status Tracker del pedido (V5 del B2: a 1024 px, con el panel de Actividad abierto, las 5 etiquetas no caben en una
  // línea) las parte en dos líneas en lugar de recortarlas. Sin la prop, la barra es la de antes: la etiqueta se recorta
  // con el nombre completo en su title (la cadena de documentos, el panel rápido del Hub).
  const fuente = readFileSync(new URL('../src/components/flujo/PasosFlujo.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = fuente.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(codigo, /\n {2}partirEtiquetas\?: boolean;\n/, 'la prop nueva, opcional');
  // B4 T11: estadoVisible se suma a la misma línea (TEST 23); la de partirEtiquetas no cambia.
  assert.match(codigo, /mostrarAntiguedad = false, mostrarAyuda = false, estadoConteos, partirEtiquetas = false, estadoVisible = false,\n\}: PropsPasosFlujo\)/, 'por defecto false');
  assert.match(codigo, /<PasosBarra pasos=\{pasos\} vertical=\{vertical\} etiqueta=\{etiqueta\} onSeleccionar=\{onSeleccionar\} compacto=\{compacto\} partirEtiquetas=\{partirEtiquetas\} estadoVisible=\{estadoVisible\} \/>/);
  assert.match(codigo, /const ETIQUETA_RECORTADA = 'max-w-full truncate';/, 'sin la prop: la de antes');
  assert.match(codigo, /const ETIQUETA_PARTIDA = 'max-w-full whitespace-normal break-words leading-tight';/, 'con la prop: en varias líneas');
  assert.ok(codigo.includes('<span title={tituloPaso(paso)} className={`${partirEtiquetas ? ETIQUETA_PARTIDA : ETIQUETA_RECORTADA} text-[11px] font-bold ${LABEL_BARRA[estado]}`}>{paso.label}</span>'),
    'la etiqueta elige su clase con la prop, y conserva su title, su letra y su color');
  // Con la prop, el paso no se angosta por debajo de su palabra más larga (min-content): no se parte una palabra por la
  // mitad («Entreg-ado», medido en el banco a 1024 px); sin ella, min-w-0 como siempre.
  assert.match(codigo, /const PASO_RECORTADO = 'min-w-0';/);
  assert.match(codigo, /const PASO_PARTIDO = 'min-w-min';/);
  assert.ok(codigo.includes("className={`flex ${partirEtiquetas ? PASO_PARTIDO : PASO_RECORTADO} rounded-lg ${vertical ? 'items-start gap-2 text-left' : 'flex-col items-center text-center'}"),
    'el elemento del paso elige su ancho mínimo con la prop');
  assert.match(codigo, /function PasosBarra\(\{\n {2}pasos, vertical, etiqueta, onSeleccionar, compacto, partirEtiquetas = false, estadoVisible = false,\n\}/, 'PasosBarra: por defecto false');
  // r1 (m6): con la prop, el <li> de cada paso tampoco se angosta por debajo de su paso (min-w-min). Si la columna se
  // achica (el panel de Actividad llega a 800 px), la barra se desplaza dentro de su caja (overflow-x-auto en el Status
  // Tracker) en lugar de montar una etiqueta sobre la siguiente. Sin la prop, el <li> de siempre (min-w-0).
  assert.ok(codigo.includes("className={vertical ? 'flex min-w-0 flex-col' : `flex ${partirEtiquetas ? PASO_PARTIDO : PASO_RECORTADO} items-start ${i < ultimo ? 'flex-auto' : 'flex-initial'}`}"),
    'el <li> elige su ancho mínimo con la prop');
  // La pasan los Status Tracker del pedido y de la cotización y los 4 pasos de la solicitud; la cadena, la franja y el panel rápido quedan como antes.
  const leerApp = (r) => readFileSync(new URL(`../src/${r}`, import.meta.url), 'utf8');
  assert.ok(!leerApp('components/flujo/CadenaDocumentos.tsx').includes('partirEtiquetas'));
  assert.ok(!leerApp('components/flujo/BannerFlujo.tsx').includes('partirEtiquetas'));
  assert.ok(!leerApp('app/dashboard/ventas/page.tsx').includes('partirEtiquetas'));
  assert.match(leerApp('app/dashboard/ventas/venta/[id]/page.tsx'), /<PasosFlujo variante="barra" pasos=\{pasosPedido\} etiqueta="Pasos del pedido" partirEtiquetas \/>/);
  assert.match(leerApp('app/dashboard/ventas/venta/[id]/page.tsx'), /<div className="[^"]*\boverflow-x-auto\b[^"]*">\s*<PasosFlujo variante="barra" pasos=\{pasosPedido\} etiqueta="Pasos del pedido" partirEtiquetas \/>/,
    'el Status Tracker se desplaza si la barra no cabe');
}

console.log('--- TEST 23 (B4 T11): PasosFlujo muestra la palabra y los avisos de un paso siempre con estadoVisible (aditivo) ---');
{
  // El Status Tracker de la cotización (376 px a 1024 px con el panel de Actividad abierto, por debajo de @md del contenedor)
  // tiene que mostrar «Rechazada» (rojo) y «Vencida» (ámbar) aunque no quepa el sublabel: con la prop el span deja de ser
  // sr-only por debajo de @md. Sin ella, la barra es la de siempre (la cadena, el pedido, el panel rápido y los 4 pasos de la
  // solicitud: sus pasos no traen sublabel ni avisos).
  const fuente = readFileSync(new URL('../src/components/flujo/PasosFlujo.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = fuente.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(codigo, /\n {2}estadoVisible\?: boolean;\n/, 'la prop nueva, opcional');
  assert.match(codigo, /const ESTADO_OCULTO_ANGOSTO = 'sr-only @md\/flujo:not-sr-only @md\/flujo:block @md\/flujo:max-w-full';/, 'sin la prop: la de antes');
  assert.match(codigo, /const ESTADO_SIEMPRE = 'block max-w-full';/, 'con la prop: siempre a la vista');
  assert.equal(codigo.split('estadoVisible ? ESTADO_SIEMPRE : ESTADO_OCULTO_ANGOSTO').length - 1, 2, 'el sublabel y los avisos eligen su clase con la prop');
  assert.match(codigo, /<span className=\{estadoVisible \? ESTADO_SIEMPRE : ESTADO_OCULTO_ANGOSTO\}>\s*<LineaSublabel paso=\{paso\} vertical=\{vertical\} \/>/, 'el sublabel');
  assert.match(codigo, /<span className=\{estadoVisible \? ESTADO_SIEMPRE : ESTADO_OCULTO_ANGOSTO\}>\s*<AvisosDelPaso avisos=\{paso\.avisos\} pequeno/, 'los avisos');
  assert.match(codigo, /function PasosBarra\(\{\n {2}pasos, vertical, etiqueta, onSeleccionar, compacto, partirEtiquetas = false, estadoVisible = false,\n\}: Required<Pick<PropsPasosFlujo, 'pasos' \| 'etiqueta'>> & \{[^}]*estadoVisible\?: boolean;/, 'PasosBarra recibe la prop');
  assert.ok(!/sr-only @md\/flujo:not-sr-only/.test(codigo.replace("const ESTADO_OCULTO_ANGOSTO = 'sr-only @md/flujo:not-sr-only @md/flujo:block @md/flujo:max-w-full';", '')),
    'esa clase vive solo en la constante: ningún otro sitio la copia');
  // Solo el Status Tracker de la cotización la pasa.
  const leerApp = (r) => readFileSync(new URL(`../src/${r}`, import.meta.url), 'utf8');
  for (const otro of ['components/flujo/CadenaDocumentos.tsx', 'components/flujo/BannerFlujo.tsx', 'app/dashboard/ventas/page.tsx',
    'app/dashboard/ventas/venta/[id]/page.tsx', 'app/dashboard/ventas/solicitud/[id]/estado-solicitud.tsx']) {
    assert.ok(!leerApp(otro).includes('estadoVisible'), `${otro} no la pasa`);
  }
  assert.match(leerApp('app/dashboard/ventas/cotizacion/[id]/page.tsx'), /<PasosFlujo variante="barra" pasos=\{pasosCot\} etiqueta="Pasos de la cotización" partirEtiquetas estadoVisible \/>/);
}

console.log('--- B4 T24 f2 (F45): useResumen — el cargador de resúmenes compartido (llega, falla, abortado, recarga, cambio de usuario y el 403) ---');
{
  // El hook de components/ui sin React: la carga de lib/tabla.js (crearCargaListado: aborta la anterior y descarta las viejas) y la
  // llegada con la regla de un resumen de tarjetas (RESUMEN_DE_TARJETAS: sus textos, no los del flujo, y un error SIN los datos de
  // antes: las tarjetas dicen «—», C6, como el cargador que reemplaza). La clave va con el usuario del token, como useListado.
  assert.ok(F.RESUMEN_DE_TARJETAS && Object.isFrozen(F.RESUMEN_DE_TARJETAS), 'RESUMEN_DE_TARJETAS existe');
  const RUTA = '/ventas/stats?periodo=30d';
  const S1 = { kpis: { pven_saldo_por_cobrar: 500 } };
  const S2 = { kpis: { pven_saldo_por_cobrar: 700 } };
  const { llamadas, pedir } = aMano();
  let resultado = null;
  const carga = crearCargaListado({ pedir, alLlegar: (l) => { resultado = F.aplicarLlegadaResumen(resultado, l, F.RESUMEN_DE_TARJETAS); } });
  const clave = (version, usuario, recarga) => `${version}|${usuario ?? ''}|${recarga}|${RUTA}`;
  const ver = (k, usuario) => F.estadoResumen(resultado, { clave: k, ruta: RUTA, usuario });
  // Llega: lee res.data (nunca 0 mientras carga: datos null).
  assert.deepEqual(ver(clave(0, 7, 0), 7), { datos: null, cargando: true, error: null });
  carga.cargar(RUTA, clave(0, 7, 0), { ruta: RUTA, usuario: 7 });
  await tic();
  llamadas[0].resolver({ status: 'success', data: S1 });
  await tic();
  assert.deepEqual(ver(clave(0, 7, 0), 7), { datos: S1, cargando: false, error: null }, 'llega');
  // Recarga (la pantalla sube su vuelta): los datos siguen mientras llega la nueva.
  assert.deepEqual(ver(clave(0, 7, 1), 7), { datos: S1, cargando: true, error: null }, 'recarga sin parpadeo');
  // Abortado: una recarga que se adelanta aborta la anterior, y si la vieja llega igual se descarta.
  carga.cargar(RUTA, clave(0, 7, 1), { ruta: RUTA, usuario: 7 });
  await tic();
  carga.cargar(RUTA, clave(0, 7, 2), { ruta: RUTA, usuario: 7 });
  await tic();
  assert.equal(llamadas[1].signal.aborted, true, 'abortado');
  llamadas[2].resolver({ data: S2 });
  await tic();
  llamadas[1].resolver({ data: S1 });
  await tic();
  assert.deepEqual(ver(clave(0, 7, 2), 7), { datos: S2, cargando: false, error: null }, 'la vieja no pisa la nueva');
  // Falla: el error, sin los datos de antes (las tarjetas dicen «—», C6); mientras se reintenta, sin el error viejo y sin datos (barras
  // grises, nunca un número viejo). Un 500 ofrece «Reintentar»; un 403, no.
  const e500 = Object.assign(new Error('Error del servidor'), { status: 500 });
  carga.cargar(RUTA, clave(1, 7, 2), { ruta: RUTA, usuario: 7 });
  await tic();
  llamadas[3].rechazar(e500);
  await tic();
  const fallo = ver(clave(1, 7, 2), 7);
  assert.deepEqual(fallo, { datos: null, cargando: false, error: e500 }, 'falla');
  assert.deepEqual(ver(clave(2, 7, 2), 7), { datos: null, cargando: true, error: null }, 'reintenta: cargando, sin datos viejos');
  const { ofreceReintentar } = await import('../src/lib/avisos.js');
  assert.equal(ofreceReintentar(fallo.error), true, 'un 500 ofrece Reintentar');
  assert.equal(ofreceReintentar(ver(clave(2, 7, 2), 7).error), false, 'mientras reintenta, nada que ofrecer');
  const e403 = Object.assign(new Error('No tienes permiso para esta acción.'), { status: 403 });
  carga.cargar(RUTA, clave(2, 7, 2), { ruta: RUTA, usuario: 7 });
  await tic();
  llamadas[4].rechazar(e403);
  await tic();
  assert.equal(ver(clave(2, 7, 2), 7).error, e403);
  assert.equal(ofreceReintentar(ver(clave(2, 7, 2), 7).error), false, 'un 403 del resumen no ofrece Reintentar');
  // Una respuesta sin un objeto en data es un error con el texto del resumen (no el del flujo).
  carga.cargar(RUTA, clave(3, 7, 2), { ruta: RUTA, usuario: 7 });
  await tic();
  llamadas[5].resolver({ status: 'success', data: null });
  await tic();
  assert.equal(ver(clave(3, 7, 2), 7).error.message, F.RESUMEN_DE_TARJETAS.sinDatos);
  assert.ok(!/flujo/i.test(F.RESUMEN_DE_TARJETAS.sinDatos + F.RESUMEN_DE_TARJETAS.sinError));
  // Y un error sin objeto lleva el texto del resumen.
  assert.equal(F.aplicarLlegadaResumen(null, { marca: 'k', ok: false, contexto: { ruta: RUTA } }, F.RESUMEN_DE_TARJETAS).error.message, F.RESUMEN_DE_TARJETAS.sinError);
  // Cambio de usuario: lo de la cuenta anterior no se muestra (ni datos ni error) hasta que llega lo del usuario nuevo.
  assert.deepEqual(ver(clave(3, 9, 2), 9), { datos: null, cargando: true, error: null }, 'otro usuario: nada de la anterior');
  carga.cargar(RUTA, clave(3, 9, 2), { ruta: RUTA, usuario: 9 });
  await tic();
  llamadas[6].rechazar(e500);
  await tic();
  assert.deepEqual(ver(clave(3, 9, 2), 9), { datos: null, cargando: false, error: e500 }, 'su error, sin los datos de la otra cuenta');
  // El flujo sigue como estaba (aditivo: el tercer parámetro es opcional): sus textos y un error que conserva lo último bueno.
  const sinTexto = F.aplicarLlegadaResumen(null, { marca: 'k', ok: true, respuesta: { data: null }, contexto: { ruta: RUTA } });
  assert.match(sinTexto.error.message, /flujo/);
  const previoFlujo = { clave: 'a', ruta: RUTA, usuario: null, repeticion: 0, datos: S1, error: null };
  assert.equal(F.aplicarLlegadaResumen(previoFlujo, { marca: 'b', ok: false, error: e500, contexto: { ruta: RUTA } }).datos, S1);
  assert.equal(F.aplicarLlegadaResumen(previoFlujo, { marca: 'b', ok: false, error: e500, contexto: { ruta: RUTA } }, F.RESUMEN_DE_TARJETAS).datos, null);
  // El hook (components/ui/useResumen.ts) usa esas piezas, va con el usuario del token y expone si ofrecer «Reintentar».
  const hook = readFileSync(new URL('../src/components/ui/useResumen.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // r1 (C2 y m31, D27): la regla es un parámetro (por defecto la de las tarjetas; useResumenFlujo pasa la del flujo), y la lista suma
  // las tres líneas que producen la recarga y el cambio de usuario (como useAnalisis en test_analisis): sin `usuario` en la carga, o
  // sin `clave` en las dependencias, «Actualizar» y la cuenta nueva no piden nada.
  for (const parte of ['crearCargaListado({', 'aplicarLlegadaResumen(previo, llegada, regla)', 'estadoResumen(resultado, { clave, ruta, usuario, repeticion })',
    'const usuario = usuarioDeLaSesion();', 'const clave = `${version}|${usuario ?? \'\'}|${recarga}|${ruta}`;', 'ofreceReintentar: ofreceReintentar(visto.error)',
    'return () => carga.cancelar();', 'regla: ReglaResumen = RESUMEN_DE_TARJETAS',
    'carga.cargar(ruta, clave, { ruta, usuario });', '}, [carga, ruta, clave, usuario]);', 'const recargar = useCallback(() => setVersion((v) => v + 1), []);']) {
    assert.ok(hook.includes(parte), `useResumen: ${parte}`);
  }
  // Una sola implementación del cargador de resúmenes en components/: solo useResumen.ts arma la carga con aplicarLlegadaResumen.
  const { readdirSync, statSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join } = await import('node:path');
  const conCargador = [];
  const recorrer = (dir) => {
    for (const n of readdirSync(dir)) {
      const ruta = join(dir, n);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.tsx?$/.test(n) && readFileSync(ruta, 'utf8').includes('aplicarLlegadaResumen(')) conCargador.push(n);
    }
  };
  recorrer(fileURLToPath(new URL('../src/components', import.meta.url)));
  assert.deepEqual(conCargador, ['useResumen.ts'], 'una sola implementación del cargador (C2)');
  // Las copias de Ventas (el Hub y Pedidos de venta) usan el hook: sin su AbortController ni su vuelta a mano.
  for (const ruta of ['app/dashboard/ventas/page.tsx', 'app/dashboard/ventas/venta/venta-client.tsx']) {
    const f = readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.match(f, /import \{ useResumen \} from '@\/components\/ui\/useResumen';/, `${ruta}: importa el hook`);
    assert.match(f, /const stats = useResumen<Stats\w+>\(`\/ventas\/stats\?periodo=\$\{PERIODO_KPI\}`, vueltaStats\);/, `${ruta}: el hook`);
    assert.match(f, /const cargandoStats = stats\.cargando;\s*const estadoKpis = useEstadoKpi\(cargandoStats, stats\.error\);/, `${ruta}: el estado de las tarjetas`);
    assert.ok(!/setStats\(|new AbortController\(\)/.test(f), `${ruta}: sin la copia del cargador`);
  }
}

console.log('\nOK: test_flujo.mjs');
