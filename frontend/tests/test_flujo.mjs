/**
 * frontend/tests/test_flujo.mjs
 * B4 T3B (FLUJO-base punto 1; R4, C13, RP67, RP75, RP87, D21): la base del diagrama del flujo en
 * frontend/src/lib/flujo.js. Sin los casos de almacenamiento del diseño: el modo compacto de la franja lo guarda
 * BannerFlujo con usePreferencia (T5A, R4), y flujo.js no toca ningún almacén.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  congelar, pasosConProgreso, pasosConConteos, textoConteo, textoAtraso, alternarSeleccion, resumenSemaforo,
} from '../src/lib/flujo.js';
import { congelar as congelarDePedido, PASOS_PEDIDO } from '../src/lib/estados-pedido.js';
import { PASOS_SC } from '../src/lib/estados-solicitud.js';

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
}

console.log('\nOK: test_flujo.mjs');
