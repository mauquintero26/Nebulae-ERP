/**
 * frontend/tests/test_flujo_ventas.mjs
 * B4 T3B (FLUJO-ventas-datos punto 4 y FLUJO-documentos punto 1; R8, C5, RP2, RP12, RP21, RP67, RP74, RP87): la
 * presentación del flujo de Ventas en frontend/src/lib/flujo-ventas.js. Solo presentación: la regla de atraso vive en
 * hub-ventas.js (clasificar, T2) y los números los cuenta el servidor (GET /ventas/flujo). No hay casos de
 * pasoFlujoVentas, esNoResueltoVentas ni esAtrasadoVentas: no se crean (Alcance, C5).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PASOS_FLUJO_VENTAS, textoRegla, conteosDesdeResumen, tabHubDePaso, cadenaVentas, PASOS_COTIZACION, pasoCotizacion,
} from '../src/lib/flujo-ventas.js';
import { pasosConConteos, pasosConProgreso } from '../src/lib/flujo.js';
// r1: conteosDePasos por el espacio de nombres, para que su falta no tape los demás rojos.
import * as flujo from '../src/lib/flujo.js';

const CLAVES = ['SC', 'COT', 'PVEN', 'ENTREGADO', 'FACTURADO'];
const estados = (pasos) => pasos.map((p) => p.estado);
const RUTA = '/dashboard/ventas/solicitud/1';
const REGRESO = `return_to=${encodeURIComponent(RUTA)}`;

console.log('--- TEST 1: PASOS_FLUJO_VENTAS — 5 claves en orden, congelado, con su presentación (RP21) ---');
{
  assert.deepEqual(PASOS_FLUJO_VENTAS.map((p) => p.clave), CLAVES);
  assert.deepEqual(PASOS_FLUJO_VENTAS.map((p) => [p.label, p.sufijo, p.tono, p.icono, p.ruta]), [
    ['Solicitud', 'abiertas', 'indigo', 'solicitud', '/dashboard/ventas/solicitud'],
    ['Cotización', 'abiertas', 'amber', 'cotizacion', '/dashboard/ventas/cotizacion'],
    ['Pedido de venta', 'en curso', 'emerald', 'pedido', '/dashboard/ventas/venta'],
    ['Entregado', 'por facturar', 'teal', 'entrega', '/dashboard/ventas/venta?tab=entregado'],
    ['Facturado', 'facturados', 'purple', 'factura', '/dashboard/ventas/venta?tab=facturado'],
  ]);
  assert.deepEqual(PASOS_FLUJO_VENTAS.map((p) => p.ayuda), [
    'Lo que pide el cliente. Avanza cuando el cliente confirma los productos y se crea la cotización.',
    'Precios, IVA y anticipo. Avanza cuando el cliente confirma y se verifica el anticipo: ahí nace el pedido.',
    'Compra, alistamiento y despacho. Avanza cuando el pedido sale de bodega.',
    'El cliente ya lo recibió. Falta marcarlo como facturado.',
    'Pedido cerrado.',
  ]);
  assert.ok(Object.isFrozen(PASOS_FLUJO_VENTAS) && PASOS_FLUJO_VENTAS.every((p) => Object.isFrozen(p)));
  assert.throws(() => { /** @type {any} */ (PASOS_FLUJO_VENTAS)[0].ruta = '/otra'; }, TypeError);
  assert.throws(() => { /** @type {any} */ (PASOS_FLUJO_VENTAS).push({}); }, TypeError);
}

console.log('--- TEST 2: textoRegla — «más de N días» es la frontera estricta de RP2 ---');
{
  assert.equal(textoRegla({ SC: 2, COT: 2, VEN: 2 }), 'Con atraso: más de 2 días sin movimiento');
  assert.equal(textoRegla({ SC: 2, COT: 3, VEN: 2 }),
    'Con atraso: más de 2 días sin movimiento (Solicitud 2 · Cotización 3 · Pedido 2)');
  assert.equal(textoRegla({ SC: 5, COT: 3, VEN: 4 }),
    'Con atraso: más de 3 días sin movimiento (Solicitud 5 · Cotización 3 · Pedido 4)', 'N es el menor de los tres');
  // Sin datos (o con un valor que no es un entero) se usa 2, el valor por defecto del servidor (leer_dias_alerta).
  assert.equal(textoRegla(null), 'Con atraso: más de 2 días sin movimiento');
  assert.equal(textoRegla(undefined), 'Con atraso: más de 2 días sin movimiento');
  assert.equal(textoRegla({ COT: 4 }), 'Con atraso: más de 2 días sin movimiento (Solicitud 2 · Cotización 4 · Pedido 2)');
  assert.equal(textoRegla({ SC: 'x', COT: 2.5, VEN: null }), 'Con atraso: más de 2 días sin movimiento');
  assert.equal(textoRegla({ SC: 1, COT: 1, VEN: 1 }), 'Con atraso: más de 1 día sin movimiento');
  assert.equal(textoRegla(3), 'Con atraso: más de 3 días sin movimiento', 'un número vale para los tres');
}

const DATOS = {
  cambios_cliente: { SC: 2, COT: 0 },
  sin_respuesta: { SC: 0, COT: 1 },
  pasos: {
    SC: { total: 6, atrasados: 2, mas_antiguo_dias: 9, por_estado: { BORRADOR: 1, ASIGNADA: 5 } },
    COT: { total: 3, atrasados: 0, mas_antiguo_dias: 1, por_estado: { ENVIADA: 3 } },
    PVEN: { total: 4, atrasados: 1, mas_antiguo_dias: 4, por_estado: { EN_PROCESO: 4 } },
    ENTREGADO: { total: 2, atrasados: null, mas_antiguo_dias: 12, por_estado: { ENTREGADO: 2 } },
    FACTURADO: { total: 10, atrasados: null, mas_antiguo_dias: null, por_estado: { FACTURADO: 10 } },
  },
  semaforo: { atrasados: 3, no_resueltos: 9 },
  dias_alerta: { SC: 2, COT: 2, VEN: 2 },
  generado_at: '2026-10-28T15:00:00Z',
};

console.log('--- TEST 3: conteosDesdeResumen(null) — todas las claves en null y sin avisos ---');
{
  for (const vacio of [null, undefined, {}, { pasos: null }]) {
    const c = conteosDesdeResumen(/** @type {any} */ (vacio));
    assert.deepEqual(Object.keys(c), CLAVES);
    for (const clave of CLAVES) {
      assert.deepEqual(c[clave], { total: null, atrasados: null, masAntiguoDias: null, porEstado: null, avisos: [] }, clave);
    }
  }
}

console.log('--- TEST 4: conteosDesdeResumen — números del servidor y avisos de RP12 ---');
{
  const c = conteosDesdeResumen(DATOS);
  assert.deepEqual(c.SC, {
    total: 6, atrasados: 2, masAntiguoDias: 9, porEstado: { BORRADOR: 1, ASIGNADA: 5 },
    avisos: [{ texto: '2 con cambios pedidos', tono: 'ambar' }],
  });
  assert.deepEqual(c.COT.avisos, [{ texto: '1 sin respuesta al recordatorio', tono: 'rojo' }]);
  assert.equal(c.COT.atrasados, 0, 'un 0 real se conserva');
  assert.deepEqual(c.PVEN.avisos, [], 'los avisos solo van en SC y COT');
  assert.equal(c.ENTREGADO.atrasados, null, 'Entregado no tiene regla de atraso');
  assert.equal(c.ENTREGADO.masAntiguoDias, 12);
  assert.equal(c.FACTURADO.masAntiguoDias, null);
  // Los dos avisos en el mismo paso: primero el ámbar y después el rojo. Un conteo 0 no pinta aviso.
  const ambos = conteosDesdeResumen({ ...DATOS, cambios_cliente: { SC: 3 }, sin_respuesta: { SC: 1 } });
  assert.deepEqual(ambos.SC.avisos, [
    { texto: '3 con cambios pedidos', tono: 'ambar' },
    { texto: '1 sin respuesta al recordatorio', tono: 'rojo' },
  ]);
  assert.deepEqual(ambos.COT.avisos, []);
  // Tolera nulos y números en texto; los miles con punto (formatoEntero).
  const raro = conteosDesdeResumen({ cambios_cliente: { SC: '1200' }, sin_respuesta: null, pasos: { SC: null, COT: { total: 'x' } } });
  assert.deepEqual(raro.SC.avisos, [{ texto: '1.200 con cambios pedidos', tono: 'ambar' }]);
  assert.equal(raro.SC.total, null);
  assert.equal(raro.COT.total, null);
  // porEstado es una copia: cambiarla no toca la respuesta.
  c.SC.porEstado.BORRADOR = 99;
  assert.equal(DATOS.pasos.SC.por_estado.BORRADOR, 1);
  // Se conecta con pasosConConteos de flujo.js.
  const pasos = pasosConConteos(PASOS_FLUJO_VENTAS, conteosDesdeResumen(DATOS), { seleccionado: 'COT' });
  assert.deepEqual(pasos.map((p) => p.total), [6, 3, 4, 2, 10]);
  assert.deepEqual(pasos[0].avisos, [{ texto: '2 con cambios pedidos', tono: 'ambar' }]);
  assert.equal(pasos[1].seleccionado, true);
}

console.log('--- TEST 5: tabHubDePaso devuelve la vista del Hub (RP21) ---');
{
  assert.equal(tabHubDePaso('SC'), 'sc');
  assert.equal(tabHubDePaso('COT'), 'cot');
  assert.equal(tabHubDePaso('PVEN'), 'ven');
  assert.equal(tabHubDePaso('ENTREGADO'), 'ven');
  assert.equal(tabHubDePaso('FACTURADO'), 'ven');
  for (const raro of ['Cotizaciones', 'toString', '', null, undefined]) assert.equal(tabHubDePaso(/** @type {any} */ (raro)), null);
}

// ─── cadenaVentas (FLUJO-documentos) ────────────────────────────────────────────

console.log('--- TEST 6: cadenaVentas de una SC sin cotización ---');
{
  const pasos = cadenaVentas({ id: 1, numero: 'SC-1', estado: 'ASIGNADA', cotizaciones: [], pedidos_venta: [] }, 'SC', { rutaActual: RUTA });
  assert.deepEqual(pasos.map((p) => p.clave), ['SC', 'COT', 'PVEN']);
  assert.deepEqual(pasos.map((p) => p.label), ['Solicitud', 'Cotización', 'Pedido de venta']);
  assert.deepEqual(estados(pasos), ['actual', 'pendiente', 'pendiente']);
  assert.equal(pasos[0].esEste, true);
  assert.equal(pasos[0].sublabel, 'SC-1 · Asignada');
  assert.equal(pasos[1].sublabel, 'Sin cotización todavía');
  assert.equal(pasos[2].sublabel, 'Sin pedido todavía');
  assert.ok(pasos.every((p) => p.href === undefined), 'el propio documento y lo que no existe no tienen enlace');
  // Sin las listas también: no existen.
  assert.deepEqual(estados(cadenaVentas({ id: 1, numero: 'SC-1', estado: 'BORRADOR' }, 'SC')), ['actual', 'pendiente', 'pendiente']);
}

console.log('--- TEST 7: SC con una COT RECHAZADA y otra BORRADOR: se muestra la vigente con « (+1 rechazada)» ---');
{
  const sc = {
    id: 1, numero: 'SC-1', estado: 'CONFIRMADA',
    cotizaciones: [{ id: 11, numero: 'COT-11', estado: 'BORRADOR' }, { id: 10, numero: 'COT-10', estado: 'RECHAZADA' }],
    pedidos_venta: [],
  };
  const pasos = cadenaVentas(sc, 'SC', { rutaActual: RUTA });
  assert.deepEqual(estados(pasos), ['hecho', 'actual', 'pendiente']);
  assert.equal(pasos[0].esEste, true);
  assert.equal(pasos[1].sublabel, 'COT-11 · Borrador (+1 rechazada)');
  assert.equal(pasos[1].href, `/dashboard/ventas/cotizacion/11?${REGRESO}`);
  // Dos rechazadas: en plural.
  sc.cotizaciones.push({ id: 9, numero: 'COT-9', estado: 'RECHAZADA' });
  assert.equal(cadenaVentas(sc, 'SC').at(1)?.sublabel, 'COT-11 · Borrador (+2 rechazadas)');
}

console.log('--- TEST 8: SC con una sola COT, RECHAZADA: la caja queda cancelada con «Rechazada» ---');
{
  const pasos = cadenaVentas({
    id: 1, numero: 'SC-1', estado: 'CONFIRMADA', cotizaciones: [{ id: 10, numero: 'COT-10', estado: 'RECHAZADA' }],
  }, 'SC', { rutaActual: RUTA });
  assert.deepEqual(estados(pasos), ['actual', 'cancelado', 'pendiente']);
  assert.equal(pasos[1].sublabel, 'COT-10 · Rechazada');
  assert.equal(pasos[1].href, `/dashboard/ventas/cotizacion/10?${REGRESO}`, 'la cancelada también se abre');
}

console.log('--- TEST 9: SC — la más reciente por id (no por el orden del arreglo) y el pedido vigente ---');
{
  const pasos = cadenaVentas({
    id: 1, numero: 'SC-1', estado: 'CONFIRMADA',
    cotizaciones: [{ id: 13, numero: 'COT-13', estado: 'CONFIRMADA' }, { id: 12, numero: 'COT-12', estado: 'VENCIDA' }],
    pedidos_venta: [
      { id: 52, numero: 'PVEN-52', estado: 'EN_PROCESO' },
      { id: 50, numero: 'PVEN-50', estado: 'CANCELADO' },
      { id: 51, numero: 'PVEN-51', estado: 'PENDIENTE_COMPRA' },
    ],
  }, 'SC', { rutaActual: RUTA });
  assert.deepEqual(estados(pasos), ['hecho', 'hecho', 'actual']);
  assert.equal(pasos[1].sublabel, 'COT-13 · Confirmada', 'VENCIDA cuenta como activa, pero la más reciente es la 13');
  assert.equal(pasos[2].sublabel, 'PVEN-52 · En proceso (+1 cancelado)');
  assert.equal(pasos[2].href, `/dashboard/ventas/venta/52?${REGRESO}`);
  // Todos los pedidos cancelados: el último, en rojo; la cotización vuelve a ser la caja actual.
  const caidos = cadenaVentas({
    id: 1, numero: 'SC-1', estado: 'CONFIRMADA', cotizaciones: [{ id: 13, numero: 'COT-13', estado: 'BORRADOR' }],
    pedidos_venta: [{ id: 52, numero: 'PVEN-52', estado: 'CANCELADO' }, { id: 50, numero: 'PVEN-50', estado: 'CANCELADO' }],
  }, 'SC');
  assert.deepEqual(estados(caidos), ['hecho', 'actual', 'cancelado']);
  assert.equal(caidos[2].sublabel, 'PVEN-52 · Cancelado');
}

console.log('--- TEST 10: una SC CANCELADA sin documentos ---');
{
  const pasos = cadenaVentas({ id: 1, numero: 'SC-1', estado: 'CANCELADA' }, 'SC');
  assert.deepEqual(estados(pasos), ['cancelado', 'pendiente', 'pendiente']);
  assert.equal(pasos[0].sublabel, 'SC-1 · Cancelada');
  assert.equal(pasos[0].esEste, true);
}

console.log('--- TEST 11: COT sin sc_id — la primera caja queda neutra con «Cotización directa» ---');
{
  const pasos = cadenaVentas({ id: 20, numero: 'COT-20', estado: 'ENVIADA', sc_id: null, pedidos_venta: [] }, 'COT', { rutaActual: RUTA });
  assert.deepEqual(estados(pasos), ['neutro', 'actual', 'pendiente']);
  assert.equal(pasos[0].sublabel, 'Cotización directa');
  assert.equal(pasos[0].href, undefined);
  assert.equal(pasos[1].esEste, true);
  assert.equal(pasos[1].sublabel, 'COT-20 · Enviada al cliente');
  assert.equal(pasos[1].href, undefined);
  assert.equal(pasos[2].sublabel, 'Sin pedido todavía');
}

console.log('--- TEST 12: COT con su PVEN CANCELADO — Pedido cancelado y Cotización actual ---');
{
  const cot = {
    id: 21, numero: 'COT-21', estado: 'BORRADOR', sc_id: 3, sc_numero: 'SC-3',
    pedidos_venta: [{ id: 30, numero: 'PVEN-30', estado: 'CANCELADO' }],
  };
  const pasos = cadenaVentas(cot, 'COT', { rutaActual: RUTA });
  assert.deepEqual(estados(pasos), ['hecho', 'actual', 'cancelado']);
  assert.equal(pasos[0].sublabel, 'SC-3', 'sin el estado de la SC, solo su número');
  assert.equal(pasos[0].href, `/dashboard/ventas/solicitud/3?${REGRESO}`);
  assert.equal(pasos[1].esEste, true);
  assert.equal(pasos[2].sublabel, 'PVEN-30 · Cancelado');
  // Con un pedido nuevo vigente: se muestra ese con « (+1 cancelado)».
  cot.pedidos_venta.push({ id: 31, numero: 'PVEN-31', estado: 'PENDIENTE_COMPRA' });
  const otra = cadenaVentas(cot, 'COT');
  assert.deepEqual(estados(otra), ['hecho', 'hecho', 'actual']);
  assert.equal(otra[2].sublabel, 'PVEN-31 · Pendiente de compra (+1 cancelado)');
  // La COT misma RECHAZADA: su caja en rojo y la SC queda como la caja actual.
  const rechazada = cadenaVentas({ id: 22, numero: 'COT-22', estado: 'RECHAZADA', sc_id: 3, sc_numero: 'SC-3' }, 'COT');
  assert.deepEqual(estados(rechazada), ['actual', 'cancelado', 'pendiente']);
  assert.equal(rechazada[1].sublabel, 'COT-22 · Rechazada');
}

console.log('--- TEST 13 (r1): PVEN — con pec_numero se agrega «Compra» como anexo (neutro, fuera de la progresión); sin él, 3 ---');
{
  const pven = {
    id: 40, numero: 'PVEN-40', estado: 'EN_PROCESO', sc_id: 3, sc_numero: 'SC-3', cot_id: 21, cot_numero: 'COT-21',
    pec_id: 5, pec_numero: 'PEC-5',
  };
  const pasos = cadenaVentas(pven, 'PVEN', { rutaActual: RUTA });
  assert.deepEqual(pasos.map((p) => p.clave), ['SC', 'COT', 'PVEN', 'PEC']);
  assert.deepEqual(pasos.map((p) => p.label), ['Solicitud', 'Cotización', 'Pedido de venta', 'Compra']);
  assert.deepEqual(estados(pasos), ['hecho', 'hecho', 'actual', 'neutro'], 'la compra es un anexo del pedido, no un paso');
  assert.equal(pasos[3].sublabel, 'PEC-5');
  assert.equal(pasos[3].href, `/dashboard/compras/pedidos?id=5&${REGRESO}`);
  assert.equal(pasos[3].esEste, false);
  assert.equal(pasos[2].esEste, true);
  assert.equal(pasos[2].sublabel, 'PVEN-40 · En proceso');
  assert.equal(pasos[0].href, `/dashboard/ventas/solicitud/3?${REGRESO}`);
  assert.equal(pasos[1].href, `/dashboard/ventas/cotizacion/21?${REGRESO}`);
  const sinPec = cadenaVentas({ ...pven, pec_id: null, pec_numero: null }, 'PVEN', { rutaActual: RUTA });
  assert.deepEqual(sinPec.map((p) => p.clave), ['SC', 'COT', 'PVEN']);
  assert.deepEqual(estados(sinPec), ['hecho', 'hecho', 'actual']);
  // Un pedido cancelado que conserva su pec_numero (cancelar el PVEN no lo borra): Pedido en rojo, Cotización actual.
  assert.deepEqual(estados(cadenaVentas({ ...pven, estado: 'CANCELADO' }, 'PVEN')), ['hecho', 'actual', 'cancelado', 'neutro']);
  assert.deepEqual(estados(cadenaVentas({ ...pven, estado: 'CANCELADO', pec_numero: null }, 'PVEN')), ['hecho', 'actual', 'cancelado']);
  // Con la compra, el pedido sigue siendo la caja actual en cualquier estado vigente (también FACTURADO).
  for (const estado of ['PENDIENTE_COMPRA', 'LISTO_ENTREGA', 'ENTREGADO', 'FACTURADO']) {
    assert.deepEqual(estados(cadenaVentas({ ...pven, estado }, 'PVEN')), ['hecho', 'hecho', 'actual', 'neutro'], estado);
  }
  // La misma cadena vista desde la SC: el pedido queda 'actual', no con ✓.
  const desdeSc = cadenaVentas({
    id: 3, numero: 'SC-3', estado: 'CONFIRMADA', cotizaciones: [{ id: 21, numero: 'COT-21', estado: 'CONFIRMADA' }],
    pedidos_venta: [pven],
  }, 'SC');
  assert.deepEqual(estados(desdeSc), ['hecho', 'hecho', 'actual']);
  assert.equal(desdeSc[2].estado, pasos[2].estado, 'el pedido se ve igual desde la SC y desde el pedido');
}

console.log('--- TEST 14: RP74 — VEN y PVEN son el mismo tipo ---');
{
  const pven = { id: 40, numero: 'PVEN-40', estado: 'ENTREGADO', sc_id: 3, sc_numero: 'SC-3', cot_id: 21, cot_numero: 'COT-21' };
  assert.deepEqual(cadenaVentas(pven, 'VEN', { rutaActual: RUTA }), cadenaVentas(pven, 'PVEN', { rutaActual: RUTA }));
  assert.equal(cadenaVentas(pven, 'VEN')[2].sublabel, 'PVEN-40 · Entregado');
}

console.log('--- TEST 15 (r1): PVEN sin solicitud o sin cotización: «Sin solicitud» y «Sin cotización» ---');
{
  // Su cotización no tiene solicitud: es una «Cotización directa» (el texto del spec para una COT sin SC).
  const desdeCot = cadenaVentas({ id: 41, numero: 'PVEN-41', estado: 'EN_PROCESO', cot_id: 21, cot_numero: 'COT-21' }, 'PVEN');
  assert.deepEqual(estados(desdeCot), ['neutro', 'hecho', 'actual']);
  assert.equal(desdeCot[0].sublabel, 'Cotización directa');
  // Sin cotización ni solicitud (por ejemplo, un pedido de la tienda web). «Pedido directo» ya significa lo contrario
  // (B2.1 D3: el pedido que EXIGE una cotización confirmada).
  const sinNada = cadenaVentas({ id: 42, numero: 'PVEN-42', estado: 'PENDIENTE_PAGO' }, 'PVEN');
  assert.deepEqual(estados(sinNada), ['neutro', 'neutro', 'actual']);
  assert.deepEqual(sinNada.slice(0, 2).map((p) => p.sublabel), ['Sin solicitud', 'Sin cotización']);
  assert.ok(sinNada.every((p) => p.href === undefined));
  // Con solicitud pero sin cotización.
  const sinCot = cadenaVentas({ id: 43, numero: 'PVEN-43', estado: 'EN_PROCESO', sc_id: 3, sc_numero: 'SC-3' }, 'PVEN');
  assert.deepEqual(estados(sinCot), ['hecho', 'neutro', 'actual']);
  assert.equal(sinCot[1].sublabel, 'Sin cotización');
}

console.log('--- TEST 16: la caja propia no tiene href; las demás sí, con return_to; las etiquetas se inyectan ---');
{
  const sc = {
    id: 1, numero: 'SC-1', estado: 'CONFIRMADA', cotizaciones: [{ id: 11, numero: 'COT-11', estado: 'CONFIRMADA' }],
    pedidos_venta: [{ id: 52, numero: 'PVEN-52', estado: 'EN_PROCESO' }],
  };
  const pasos = cadenaVentas(sc, 'SC', { rutaActual: RUTA });
  assert.equal(pasos.filter((p) => p.esEste).length, 1);
  for (const p of pasos) {
    if (p.esEste) assert.equal(p.href, undefined);
    else assert.ok(p.href?.endsWith(`?${REGRESO}`), `${p.clave} lleva return_to`);
  }
  // Sin rutaActual: el enlace va sin return_to.
  assert.equal(cadenaVentas(sc, 'SC')[1].href, '/dashboard/ventas/cotizacion/11');
  // etiquetas: funciones que dan el texto, o un objeto con label (infoEstadoSolicitud y compañía).
  const conEtiquetas = cadenaVentas(sc, 'SC', {
    etiquetas: { sc: (e) => `sc:${e}`, cot: (e) => ({ label: `cot:${e}` }), pven: (e) => `pven:${e}` },
  });
  assert.deepEqual(conEtiquetas.map((p) => p.sublabel), ['SC-1 · sc:CONFIRMADA', 'COT-11 · cot:CONFIRMADA', 'PVEN-52 · pven:EN_PROCESO']);
  // Un documento sin número: el de la caja propia sale solo con el estado.
  assert.equal(cadenaVentas({ id: 1, estado: 'BORRADOR' }, 'SC')[0].sublabel, 'Nueva');
}

console.log('--- TEST 17: bordes de cadenaVentas ---');
{
  assert.deepEqual(cadenaVentas(null, 'SC'), []);
  assert.deepEqual(cadenaVentas(undefined, 'COT'), []);
  for (const raro of ['PEC', 'Cotizaciones', '', null]) {
    assert.throws(() => cadenaVentas({ id: 1 }, /** @type {any} */ (raro)), Error, `tipo ${String(raro)}`);
  }
}

// ─── PASOS_COTIZACION y pasoCotizacion (FLUJO-documentos, RP87) ─────────────────

console.log('--- TEST 18: PASOS_COTIZACION ---');
{
  assert.deepEqual(PASOS_COTIZACION.map((p) => [p.clave, p.label]), [
    ['BORRADOR', 'Borrador (valorizando)'],
    ['ENVIADA', 'Cotizado al cliente'],
    ['CONFIRMADA', 'Confirmado (venta)'],
  ]);
  assert.throws(() => { /** @type {any} */ (PASOS_COTIZACION)[0].label = 'x'; }, TypeError);
}

console.log('--- TEST 19: pasoCotizacion ---');
{
  assert.deepEqual(pasoCotizacion('BORRADOR'), { indice: 0 });
  assert.deepEqual(pasoCotizacion('ENVIADA'), { indice: 1 });
  assert.deepEqual(pasoCotizacion('PENDIENTE_CONFIRMACION'), { indice: 1 });
  assert.deepEqual(pasoCotizacion('CONFIRMADA'), { indice: 2 });
  assert.deepEqual(pasoCotizacion('RECHAZADA'), { indice: 1, canceladoEn: 1, etiqueta: 'Rechazada' });
  assert.deepEqual(pasoCotizacion('VENCIDA'), { indice: 1, aviso: { texto: 'Vencida', tono: 'ambar' } });
  // Un estado desconocido va al primer paso, como el stepper de hoy (cotizacion/[id]/page.tsx).
  for (const raro of ['ALGO_NUEVO', '', null, undefined]) assert.deepEqual(pasoCotizacion(/** @type {any} */ (raro)), { indice: 0 });
  // La forma que usa T11 (RP87): pasosConProgreso(PASOS_COTIZACION, p.indice, {canceladoEn: p.canceladoEn}).
  const barra = (estado) => {
    const p = pasoCotizacion(estado);
    return estados(pasosConProgreso(PASOS_COTIZACION, p.indice, { canceladoEn: p.canceladoEn }));
  };
  assert.deepEqual(barra('BORRADOR'), ['actual', 'pendiente', 'pendiente']);
  assert.deepEqual(barra('PENDIENTE_CONFIRMACION'), ['hecho', 'actual', 'pendiente']);
  assert.deepEqual(barra('CONFIRMADA'), ['hecho', 'hecho', 'actual']);
  assert.deepEqual(barra('RECHAZADA'), ['hecho', 'cancelado', 'pendiente']);
  assert.deepEqual(barra('VENCIDA'), ['hecho', 'actual', 'pendiente']);
}

console.log('--- TEST 19b (r1): conteosDesdeResumen = conteosDePasos de flujo.js + los avisos de RP12 ---');
{
  const base = /** @type {any} */ (flujo).conteosDePasos(DATOS);
  const conteos = conteosDesdeResumen(DATOS);
  for (const clave of CLAVES) {
    assert.deepEqual(conteos[clave], { ...base[clave], avisos: conteos[clave].avisos }, clave);
  }
  assert.deepEqual(conteos.SC.avisos, [{ texto: '2 con cambios pedidos', tono: 'ambar' }]);
}

console.log('--- TEST 20: solo presentación (C5, R8, RP67) y sin almacenamiento (R4) ---');
{
  const fuente = readFileSync(new URL('../src/lib/flujo-ventas.js', import.meta.url), 'utf8');
  assert.ok(!/from ['"]react/.test(fuente), 'no importa React');
  assert.ok(!/\b(window|document)\./.test(fuente), 'no usa el DOM');
  assert.ok(!/localStorage|sessionStorage/.test(fuente), 'no toca el almacenamiento');
  assert.ok(!/function congelar\(/.test(fuente), 'congelar no se copia');
  for (const nombre of ['ESTADOS_NO_RESOLUCION', 'pasoFlujoVentas', 'esNoResueltoVentas', 'esAtrasadoVentas', 'clasificar']) {
    assert.ok(!new RegExp(`(export|function|const)\\s+(\\{[^}]*)?\\b${nombre}\\b`).test(fuente), `no define ${nombre} (C5)`);
  }
  assert.ok(!/export\s+(function\s+)?contextoFlujo|export\s*\{[^}]*contextoFlujo/.test(fuente), 'RP67: contextoFlujo no se exporta');
  const modulo = await import('../src/lib/flujo-ventas.js');
  assert.equal(/** @type {any} */ (modulo).contextoFlujo, undefined);
  // r1: «Pedido directo» no se usa (B2.1 D3); la conversión de los pasos es la de flujo.js.
  assert.ok(!/['"`]Pedido directo/i.test(fuente), 'ningún texto visible dice «Pedido directo»');
  assert.ok(/import \{[^}]*\bconteosDePasos\b[^}]*\} from '\.\/flujo\.js'/.test(fuente), 'conteosDePasos sale de flujo.js');
  assert.ok(!/\.mas_antiguo_dias|\.por_estado/.test(fuente), 'una sola conversión de los pasos (flujo.js)');
}

console.log('\nOK: test_flujo_ventas.mjs');
