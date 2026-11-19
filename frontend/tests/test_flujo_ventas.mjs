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
// T5A r1: las etiquetas únicas (RP4) para los casos de compacta.
import { infoEstadoPedido } from '../src/lib/estados-pedido.js';
import { infoEstadoSolicitud } from '../src/lib/estados-solicitud.js';
import { infoEstadoCotizacion } from '../src/lib/estados-cotizacion.js';

const ETIQUETAS_UNICAS = { sc: infoEstadoSolicitud, cot: infoEstadoCotizacion, pven: infoEstadoPedido };
// r1: conteosDePasos por el espacio de nombres, para que su falta no tape los demás rojos.
import * as flujo from '../src/lib/flujo.js';
// B4 T7: lo nuevo, igual.
import * as fv from '../src/lib/flujo-ventas.js';
import { FOCOS_VENTAS } from '../src/lib/analisis.js';

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
  // B4.1 (P12): una COT confirmada terminó su camino.
  assert.deepEqual(pasoCotizacion('CONFIRMADA'), { indice: 2, terminado: true });
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
  // B4.1 (P12): pasosDeCotizacion = anotarPasosCotizacion(pasosConProgreso(…, {canceladoEn, terminado}), p): la confirmada, tres ✓.
  assert.deepEqual(estados(fv.pasosDeCotizacion('CONFIRMADA')), ['hecho', 'hecho', 'hecho']);
  for (const estado of ['RECHAZADA', 'VENCIDA', 'BORRADOR']) {
    const p = pasoCotizacion(estado);
    assert.deepEqual(fv.pasosDeCotizacion(estado), fv.anotarPasosCotizacion(pasosConProgreso(PASOS_COTIZACION, p.indice, { canceladoEn: p.canceladoEn }), p), estado);
  }
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

console.log('--- TEST 21 (T5A; RP4, RP74): CadenaDocumentos — etiquetas únicas, compacta solo con el número y su fuente ---');
{
  const sc = {
    id: 1, numero: 'SC-1', estado: 'ASIGNADA',
    cotizaciones: [{ id: 10, numero: 'COT-10', estado: 'RECHAZADA' }, { id: 11, numero: 'COT-11', estado: 'PENDIENTE_CONFIRMACION' }],
  };
  // Lo normal: las etiquetas únicas de cada documento (RP4: la de la cotización es infoEstadoCotizacion de T2).
  const normal = cadenaVentas(sc, 'SC', { rutaActual: RUTA });
  assert.deepEqual(normal.map((p) => p.sublabel),
    ['SC-1 · Asignada', 'COT-11 · Esperando confirmación del cliente (+1 rechazada)', 'Sin pedido todavía']);
  // compacta (r1, M2): la opción de cadenaVentas (TEST 22); solo cambia los textos.
  const compacta = cadenaVentas(sc, 'SC', { etiquetas: ETIQUETAS_UNICAS, rutaActual: RUTA, compacta: true });
  assert.deepEqual(compacta.map((p) => p.sublabel), ['SC-1', 'COT-11', 'Sin pedido todavía']);
  assert.deepEqual(compacta.map((p) => [p.estado, p.esEste, p.href]), normal.map((p) => [p.estado, p.esEste, p.href]),
    'compacta solo cambia los textos');
  // RP74: el panel rápido del Hub pasa filas con tipo 'VEN'.
  const pven = { id: 52, numero: 'PVEN-52', estado: 'CANCELADO', cot_id: 11, cot_numero: 'COT-11', sc_id: 1, sc_numero: 'SC-1' };
  assert.deepEqual(cadenaVentas(pven, 'VEN', { rutaActual: RUTA }), cadenaVentas(pven, 'PVEN', { rutaActual: RUTA }));

  const leer = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const fuente = leer('components/flujo/CadenaDocumentos.tsx');
  const c = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(fuente.startsWith("'use client';"));
  assert.match(c, /import \{ usePathname \} from 'next\/navigation';/);
  assert.match(c, /const rutaActual = usePathname\(\);/, 'rutaActual (usePathname): los enlaces llevan return_to');
  assert.match(c, /import \{ cadenaVentas \} from '@\/lib\/flujo-ventas';/);
  assert.match(c, /import \{ infoEstadoCotizacion \} from '@\/lib\/estados-cotizacion';/, 'RP4: la etiqueta de T2');
  assert.match(c, /const ETIQUETAS = \{ sc: infoEstadoSolicitud, cot: infoEstadoCotizacion, pven: infoEstadoPedido \};/);
  assert.ok(!/cotizacion-client|ESTADOS\b/.test(c), 'RP4: no importa el ESTADOS hex de cotizacion-client.tsx');
  // r1 (M2): compacta es la opción de cadenaVentas (la regla CAIDO vive allá), no funciones de etiqueta vacías.
  assert.match(c, /cadenaVentas\(doc, tipo, \{ etiquetas: ETIQUETAS, rutaActual: rutaActual \|\| null, compacta \}\)/);
  assert.ok(!/SOLO_NUMERO|SIN_ESTADO/.test(c), 'sin las etiquetas vacías de r0');
  assert.match(c, /<PasosFlujo variante="barra" pasos=\{pasos\} etiqueta="Flujo de este documento" compacto=\{compacta\} \/>/);
  assert.match(c, /tipo: TipoCadena;/, 'RP74: el tipo de la prop es TipoCadena (SC, COT, PVEN o VEN)');
  assert.match(leer('lib/flujo-ventas.js'), /@typedef \{'SC' \| 'COT' \| 'PVEN' \| 'VEN'\} TipoCadena/);
  assert.match(c, /if \(!pasos\.length\) return null;/);
}

console.log('--- TEST 22 (T5A r1 y r2; M2 y M5): cadenaVentas compacta — solo el número; las caídas, su palabra aparte ---');
{
  // r2 (M5): en compacta, el sublabel es SOLO el número y la palabra de la caja caída va en etiquetaEstado (PasosFlujo
  // la pinta en su propio span, sin truncate: lo que se recorta es el número).
  const ver = (doc, tipo, op = {}) => cadenaVentas(doc, tipo, { compacta: true, ...op })
    .map((p) => (p.etiquetaEstado === undefined ? [p.clave, p.estado, p.sublabel] : [p.clave, p.estado, p.sublabel, p.etiquetaEstado]));
  // Lo vigente: solo el número (sin estado en palabras ni « (+1 rechazada)»); lo que falta conserva su texto.
  const sc = {
    id: 1, numero: 'SC-1', estado: 'ASIGNADA', pedidos_venta: [],
    cotizaciones: [{ id: 10, numero: 'COT-10', estado: 'RECHAZADA' }, { id: 11, numero: 'COT-11', estado: 'PENDIENTE_CONFIRMACION' }],
  };
  assert.deepEqual(ver(sc, 'SC'), [['SC', 'hecho', 'SC-1'], ['COT', 'actual', 'COT-11'], ['PVEN', 'pendiente', 'Sin pedido todavía']]);
  // Una cotización rechazada sin reemplazo conserva «Rechazada».
  const rechazada = { id: 1, numero: 'SC-1', estado: 'COTIZADA', cotizaciones: [{ id: 10, numero: 'COT-10', estado: 'RECHAZADA' }] };
  assert.deepEqual(ver(rechazada, 'SC')[1], ['COT', 'cancelado', 'COT-10', infoEstadoCotizacion('RECHAZADA').label]);
  // Un pedido cancelado conserva «Cancelado» (y la cotización vuelve a ser la actual, H46).
  const cot = {
    id: 11, numero: 'COT-11', estado: 'CONFIRMADA', sc_id: 1, sc_numero: 'SC-1',
    pedidos_venta: [{ id: 52, numero: 'PVEN-52', estado: 'CANCELADO' }],
  };
  assert.deepEqual(ver(cot, 'COT'), [['SC', 'hecho', 'SC-1'], ['COT', 'actual', 'COT-11'],
    ['PVEN', 'cancelado', 'PVEN-52', infoEstadoPedido('CANCELADO').label]]);
  // La caja propia caída también (una SC cancelada); la Compra del pedido va con su número.
  assert.deepEqual(ver({ id: 1, numero: 'SC-1', estado: 'CANCELADA' }, 'SC')[0],
    ['SC', 'cancelado', 'SC-1', infoEstadoSolicitud('CANCELADA').label]);
  // Una caída sin número: solo la palabra (sin sublabel).
  assert.deepEqual(ver({ id: 1, estado: 'CANCELADA' }, 'SC')[0], ['SC', 'cancelado', undefined, infoEstadoSolicitud('CANCELADA').label]);
  const pven = { id: 52, numero: 'PVEN-52', estado: 'EN_PROCESO', cot_id: 11, cot_numero: 'COT-11', pec_id: 9, pec_numero: 'PEC-9' };
  assert.deepEqual(ver(pven, 'VEN'), [['SC', 'neutro', 'Cotización directa'], ['COT', 'hecho', 'COT-11'], ['PVEN', 'actual', 'PVEN-52'],
    ['PEC', 'neutro', 'PEC-9']]);
  // Las etiquetas que se inyectan siguen valiendo en las caídas; sin compacta, nada cambia.
  assert.deepEqual(ver(rechazada, 'SC', { etiquetas: { cot: () => 'Rechazada X' } })[1], ['COT', 'cancelado', 'COT-10', 'Rechazada X']);
  assert.deepEqual(cadenaVentas(sc, 'SC', { compacta: false }), cadenaVentas(sc, 'SC'));
  assert.equal(cadenaVentas(sc, 'SC')[1].sublabel, 'COT-11 · Esperando confirmación del cliente (+1 rechazada)');
  // Sin compacta no hay etiquetaEstado: la palabra sigue dentro del sublabel, como en r0.
  assert.equal(cadenaVentas(rechazada, 'SC')[1].sublabel, `COT-10 · ${infoEstadoCotizacion('RECHAZADA').label}`);
  assert.ok(cadenaVentas(rechazada, 'SC').every((p) => !('etiquetaEstado' in p)));
}

console.log('--- B4 T7 TEST 1: leerEnlaceHub — ?paso= y ?tab=analisis&foco= del Hub (R6, RP21) ---');
{
  const VACIO = { paso: null, analisis: false, foco: null };
  // Cada paso del diagrama abre el Hub filtrado; un valor desconocido se ignora (RP21).
  for (const clave of CLAVES) assert.deepEqual(fv.leerEnlaceHub(`?paso=${clave}`), { ...VACIO, paso: clave }, clave);
  for (const malo of ['?paso=pven', '?paso=OTRO', '?paso=', '?paso=%20PVEN%20x']) assert.deepEqual(fv.leerEnlaceHub(malo), VACIO, malo);
  // Los espacios de los bordes no cuentan; sin el '?' también se lee.
  assert.deepEqual(fv.leerEnlaceHub('?paso=%20COT%20'), { ...VACIO, paso: 'COT' });
  assert.deepEqual(fv.leerEnlaceHub('paso=SC'), { ...VACIO, paso: 'SC' });
  // «Ver análisis» de las listas: la pestaña y el foco (los de FOCOS_VENTAS).
  assert.deepEqual(fv.leerEnlaceHub('?tab=analisis'), { ...VACIO, analisis: true });
  for (const { clave } of FOCOS_VENTAS) {
    assert.deepEqual(fv.leerEnlaceHub(`?tab=analisis&foco=${clave}`), { ...VACIO, analisis: true, foco: clave }, clave);
  }
  assert.deepEqual(fv.leerEnlaceHub('?tab=analisis&foco=otro'), { ...VACIO, analisis: true }, 'un foco desconocido se ignora');
  assert.deepEqual(fv.leerEnlaceHub('?foco=sc'), VACIO, 'el foco solo se lee con la pestaña Análisis');
  for (const malo of ['?tab=Analisis', '?tab=todos', '?tab=']) assert.deepEqual(fv.leerEnlaceHub(malo), VACIO, malo);
  // Los dos a la vez se leen los dos (la pantalla decide qué muestra).
  assert.deepEqual(fv.leerEnlaceHub('?paso=PVEN&tab=analisis&foco=pven'), { paso: 'PVEN', analisis: true, foco: 'pven' });
  for (const nada of [undefined, null, '', 42]) assert.deepEqual(fv.leerEnlaceHub(nada), VACIO, String(nada));
  assert.ok(Object.isFrozen(fv.leerEnlaceHub('?paso=SC')));
}

console.log('--- B4 T24 (FINAL-C3): inicioDelEnlaceHub — lo que el Hub aplica al montar, del enlace leído DESPUÉS del commit ---');
{
  assert.equal(typeof fv.inicioDelEnlaceHub, 'function', 'inicioDelEnlaceHub existe');
  const NADA = { seccion: null, foco: null, paso: null, vista: null };
  // La URL de la página anterior (la que leía el inicializador de useState): sin el enlace, nada que aplicar.
  for (const vieja of ['', '?', '?tab=documentos', '?foco=pven', undefined, null, 42]) {
    assert.deepEqual(fv.inicioDelEnlaceHub(vieja), NADA, String(vieja));
  }
  // «Ver análisis» de Solicitudes, Cotizaciones y Pedidos (enlaceVerAnalisis): la sección Análisis con su foco.
  for (const { clave } of FOCOS_VENTAS) {
    assert.deepEqual(fv.inicioDelEnlaceHub(`?tab=analisis&foco=${clave}`), { ...NADA, seccion: 'analisis', foco: clave }, clave);
  }
  assert.deepEqual(fv.inicioDelEnlaceHub('?tab=analisis'), { ...NADA, seccion: 'analisis' });
  assert.deepEqual(fv.inicioDelEnlaceHub('?tab=analisis&foco=otro'), { ...NADA, seccion: 'analisis' }, 'un foco desconocido no cuenta');
  // Una caja del embudo del Dashboard (pasosEmbudoDashboard → ?paso=): el paso y la pestaña de su tipo (tabHubDePaso).
  for (const clave of CLAVES) {
    assert.deepEqual(fv.inicioDelEnlaceHub(`?paso=${clave}`), { ...NADA, paso: clave, vista: tabHubDePaso(clave) }, clave);
  }
  assert.equal(fv.inicioDelEnlaceHub('?paso=SC').vista, 'sc');
  assert.equal(fv.inicioDelEnlaceHub('?paso=FACTURADO').vista, 'ven');
  for (const malo of ['?paso=pven', '?paso=OTRO']) assert.deepEqual(fv.inicioDelEnlaceHub(malo), NADA, malo);
  // Los dos a la vez: se aplican los dos.
  assert.deepEqual(fv.inicioDelEnlaceHub('?paso=COT&tab=analisis&foco=cot'), { seccion: 'analisis', foco: 'cot', paso: 'COT', vista: 'cot' });
  // Lo que escriben los orígenes reales se lee igual: el embudo del Dashboard y «Ver análisis» de las tres listas.
  for (const p of fv.pasosEmbudoDashboard(null)) {
    assert.equal(fv.inicioDelEnlaceHub(p.href.slice(p.href.indexOf('?'))).paso, p.clave, `${p.clave}: el embudo abre el Hub filtrado`);
  }
  for (const foco of ['sc', 'cot', 'pven']) {
    const enlace = fv.enlaceVerAnalisis(foco);
    assert.deepEqual(fv.inicioDelEnlaceHub(enlace.slice(enlace.indexOf('?'))), { ...NADA, seccion: 'analisis', foco }, foco);
  }
  assert.ok(Object.isFrozen(fv.inicioDelEnlaceHub('?paso=SC')));
}

console.log('--- B4 T7 TEST 2: chipsFiltroHub — los chips que quitan el filtro del paso y del semáforo (R6, clic_en_hub) ---');
{
  assert.deepEqual(fv.chipsFiltroHub({ paso: 'COT', semaforo: null }), [{ campo: 'paso', texto: 'Paso: Cotización' }]);
  assert.deepEqual(fv.chipsFiltroHub({ paso: 'PVEN', semaforo: 'atrasados' }), [
    { campo: 'paso', texto: 'Paso: Pedido de venta' }, { campo: 'semaforo', texto: 'Con atraso' },
  ]);
  // Los textos del semáforo son los de sus botones (opcionesSemaforo de flujo.js; cruce C9: «No resueltos»).
  assert.deepEqual(fv.chipsFiltroHub({ semaforo: 'no_resueltos' }), [{ campo: 'semaforo', texto: 'No resueltos' }]);
  const botones = flujo.opcionesSemaforo({ atrasados: 1, noResueltos: 1, filtro: 'todos' });
  assert.equal(fv.chipsFiltroHub({ semaforo: 'atrasados' })[0].texto, botones.find((b) => b.filtro === 'atrasados').texto);
  assert.equal(fv.chipsFiltroHub({ semaforo: 'no_resueltos' })[0].texto, botones.find((b) => b.filtro === 'no_resueltos').texto);
  // Cada paso con la etiqueta de PASOS_FLUJO_VENTAS.
  for (const p of PASOS_FLUJO_VENTAS) assert.deepEqual(fv.chipsFiltroHub({ paso: p.clave }), [{ campo: 'paso', texto: `Paso: ${p.label}` }]);
  // Sin filtro, 'todos' o un valor desconocido: ningún chip.
  for (const e of [{}, { paso: null, semaforo: null }, { semaforo: 'todos' }, { paso: 'OTRO', semaforo: 'x' }, null, undefined]) {
    assert.deepEqual(fv.chipsFiltroHub(e), [], JSON.stringify(e));
  }
}

console.log('--- B4 T7 TEST 3: pasoTrasPestana — elegir a mano la pestaña de otro tipo quita el paso (FLUJO-ventas-pantallas A.4) ---');
{
  // La pestaña de su tipo (la que activa tabHubDePaso) conserva el paso; la de otro tipo lo quita.
  for (const clave of CLAVES) {
    for (const vista of ['sc', 'cot', 'ven']) {
      assert.equal(fv.pasoTrasPestana(clave, vista), tabHubDePaso(clave) === vista ? clave : null, `${clave} → ${vista}`);
    }
  }
  // Las pestañas que mezclan tipos se combinan con el paso (Todos, No resueltos, Acciones tomadas).
  for (const vista of ['todos', 'no_resueltos', 'acciones_tomadas']) assert.equal(fv.pasoTrasPestana('COT', vista), 'COT', vista);
  // Sin paso no hay nada que quitar; un paso desconocido no se conserva.
  for (const vista of ['sc', 'todos']) assert.equal(fv.pasoTrasPestana(null, vista), null, vista);
  assert.equal(fv.pasoTrasPestana('OTRO', 'sc'), null);
  assert.equal(fv.pasoTrasPestana('OTRO', 'todos'), null);
}

console.log('--- B4 T8 TEST 1: pasosDeLista — la franja de una lista de Ventas con «Estás aquí», su detalle y los enlaces ---');
{
  // FLUJO-ventas-pantallas B.2 (D42): la caja de la lista es `actual` (esEste, sin href) y trae el detalle por estado
  // con la etiqueta única de su tipo (infoEstadoSolicitud, infoEstadoCotizacion o infoEstadoPedido), en el orden de la
  // tabla de estados y sin los ceros; las demás llevan el href de su lista (su ruta).
  const datos = {
    pasos: {
      SC: { total: 5, atrasados: 2, mas_antiguo_dias: 9, por_estado: { CONFIRMADA: 1, ASIGNADA: 2, BORRADOR: 1, PENDIENTE_CONFIRMACION: 1 } },
      COT: { total: 3, atrasados: 1, mas_antiguo_dias: 4, por_estado: { PENDIENTE_CONFIRMACION: 1, BORRADOR: 2 } },
      PVEN: { total: 4, atrasados: 0, mas_antiguo_dias: 2, por_estado: { EN_PROCESO: 3, PENDIENTE_COMPRA: 1 } },
      ENTREGADO: { total: 1, atrasados: null, mas_antiguo_dias: 1, por_estado: { ENTREGADO: 1 } },
      FACTURADO: { total: 6, atrasados: null, mas_antiguo_dias: null, por_estado: { FACTURADO: 6 } },
    },
    cambios_cliente: { SC: 1, COT: 0 }, sin_respuesta: { SC: 0, COT: 2 },
  };
  const pasos = fv.pasosDeLista(datos, 'SC');
  const base = pasosConConteos(PASOS_FLUJO_VENTAS, conteosDesdeResumen(datos), { actual: 'SC' });
  assert.deepEqual(pasos.map((p) => p.clave), CLAVES);
  assert.deepEqual(pasos.map((p) => p.esEste), [true, false, false, false, false]);
  assert.equal(pasos[0].estado, 'actual');
  assert.equal(pasos[0].href, undefined, 'la caja «Estás aquí» no lleva href (D42)');
  assert.deepEqual(pasos.slice(1).map((p) => p.href), PASOS_FLUJO_VENTAS.slice(1).map((p) => p.ruta), 'las demás, a su lista');
  assert.deepEqual(pasos[0].detalle, [
    { label: 'Nueva', n: 1 }, { label: 'Asignada', n: 2 }, { label: 'Pendiente por confirmación', n: 1 }, { label: 'Confirmada', n: 1 },
  ], 'en el orden de la tabla de estados de la SC');
  assert.equal(flujo.textoDetalle(pasos[0].detalle), 'Nueva 1 · Asignada 2 · Pendiente por confirmación 1 · Confirmada 1');
  for (const p of pasos.slice(1)) assert.equal(p.detalle, null, `${p.clave}: el detalle solo en la caja de la lista`);
  // Lo demás (números, avisos de RP12, presentación) es lo de pasosConConteos con conteosDesdeResumen.
  const sinMarcas = (p) => ({ ...p, href: undefined, detalle: undefined });
  assert.deepEqual(pasos.map(sinMarcas), base.map(sinMarcas));
  // Cotizaciones y Pedidos de venta (T9 y T10): el detalle con su tabla.
  assert.deepEqual(fv.pasosDeLista(datos, 'COT')[1].detalle,
    [{ label: infoEstadoCotizacion('BORRADOR').label, n: 2 }, { label: infoEstadoCotizacion('PENDIENTE_CONFIRMACION').label, n: 1 }]);
  assert.deepEqual(fv.pasosDeLista(datos, 'PVEN')[2].detalle,
    [{ label: infoEstadoPedido('PENDIENTE_COMPRA').label, n: 1 }, { label: infoEstadoPedido('EN_PROCESO').label, n: 3 }]);
  assert.equal(fv.pasosDeLista(datos, 'COT')[0].href, '/dashboard/ventas/solicitud');
  // Un estado desconocido va al final y humanizado; los ceros, los negativos y lo que no es un número no se pintan.
  const raro = { pasos: { SC: { total: 3, atrasados: 0, por_estado: { ESTADO_NUEVO: 2, BORRADOR: 0, ASIGNADA: -1, CONFIRMADA: 'x', PENDIENTE_CONFIRMACION: 1 } } } };
  assert.deepEqual(fv.pasosDeLista(raro, 'SC')[0].detalle,
    [{ label: 'Pendiente por confirmación', n: 1 }, { label: infoEstadoSolicitud('ESTADO_NUEVO').label, n: 2 }]);
  // Sin por_estado, el detalle vacío (la caja no pinta la línea).
  assert.deepEqual(fv.pasosDeLista({ pasos: { SC: { total: 0, atrasados: 0 } } }, 'SC')[0].detalle, []);
  // Mientras carga (sin datos): todo en null, como pasosConConteos con cargando, y los enlaces ya puestos.
  const cargando = fv.pasosDeLista(null, 'SC');
  assert.deepEqual(cargando.map((p) => [p.total, p.atrasados, p.detalle]), CLAVES.map(() => [null, null, null]));
  assert.equal(cargando[0].esEste, true);
  assert.deepEqual(cargando.slice(1).map((p) => p.href), PASOS_FLUJO_VENTAS.slice(1).map((p) => p.ruta));
  // Sin `actual` conocido, ninguna es «Estás aquí» y todas son enlaces.
  assert.deepEqual(fv.pasosDeLista(datos, 'OTRA').map((p) => [p.esEste, p.href]), PASOS_FLUJO_VENTAS.map((p) => [false, p.ruta]));
}

console.log('--- B4 T8 TEST 2: enlaceVerAnalisis — el botón «Ver análisis» de las listas abre el Hub enfocado (R13) ---');
{
  assert.equal(fv.enlaceVerAnalisis('sc'), '/dashboard/ventas?tab=analisis&foco=sc');
  for (const { clave } of FOCOS_VENTAS) {
    // El Hub lee lo mismo que la lista escribe (leerEnlaceHub, la de T7).
    const enlace = fv.enlaceVerAnalisis(clave);
    assert.deepEqual(fv.leerEnlaceHub(enlace.slice(enlace.indexOf('?'))), { paso: null, analisis: true, foco: clave }, clave);
  }
  // r1 (m4): una sola lista de los focos del Hub (CLAVES_FOCO_VENTAS, la de leerEnlaceHub), sin una copia.
  const fuente = readFileSync(new URL('../src/lib/flujo-ventas.js', import.meta.url), 'utf8');
  assert.ok(!fuente.includes('FOCOS_DEL_HUB'), 'sin la copia FOCOS_DEL_HUB');
  assert.equal((fuente.match(/FOCOS_VENTAS\.map\(\(f\) => f\.clave\)/g) ?? []).length, 1, 'una sola lista de las claves de foco');
  assert.match(fuente, /CLAVES_FOCO_VENTAS\.includes\(foco\) \? `\$\{base\}&foco=\$\{foco\}` : base/);
  // Un foco que no existe abre el Análisis sin foco (el Hub lo ignoraría igual).
  for (const raro of ['pec', '', null, undefined, 'sc&tab=x']) {
    assert.equal(fv.enlaceVerAnalisis(raro), '/dashboard/ventas?tab=analisis', String(raro));
  }
}

console.log('--- B4 T8 TEST 3: avisoVencidas — el chip ámbar «N vencidas» de la franja de Solicitudes ---');
{
  // FLUJO-ventas-pantallas B.2 y RP19 (4): lee resumen.vencidas; sin vencidas, no hay chip.
  assert.deepEqual(fv.avisoVencidas(1), { texto: '1 vencida', tono: 'ambar' });
  assert.deepEqual(fv.avisoVencidas(3), { texto: '3 vencidas', tono: 'ambar' });
  assert.deepEqual(fv.avisoVencidas(1234), { texto: '1.234 vencidas', tono: 'ambar' }, 'con el punto de miles');
  for (const n of [0, -2, null, undefined, NaN, 'x', '']) assert.equal(fv.avisoVencidas(n), null, String(n));
}

console.log('--- B4 T24 f2 (B14-f): reservaAvisosCotizaciones — la franja de Cotizaciones reserva el renglón de los avisos solo si /ventas/flujo dice que habrá ---');
{
  assert.equal(typeof fv.reservaAvisosCotizaciones, 'function', 'reservaAvisosCotizaciones existe');
  // B14-b (contrato aditivo de GET /ventas/flujo): data.cotizaciones = {sin_calc, vencen_pronto}, las mismas condiciones del resumen de
  // /ventas/cotizaciones. Mientras la lista carga, reserva solo si alguno es > 0.
  const conClave = (sin_calc, vencen_pronto) => ({ pasos: {}, cotizaciones: { sin_calc, vencen_pronto } });
  assert.equal(fv.reservaAvisosCotizaciones(conClave(2, 0), true), true, 'N sin precio: reserva');
  assert.equal(fv.reservaAvisosCotizaciones(conClave(0, 3), true), true, 'N vencen: reserva');
  assert.equal(fv.reservaAvisosCotizaciones(conClave(0, 0), true), false, 'sin avisos: no reserva (el CLS sin avisos)');
  for (const raro of [-1, null, 'dos', NaN]) assert.equal(fv.reservaAvisosCotizaciones(conClave(raro, 0), true), false, String(raro));
  // Respaldo: sin la clave (un backend de antes de B14-b) o mientras /ventas/flujo carga (datos null), reserva como antes.
  for (const sinClave of [null, undefined, {}, { pasos: {} }, { cotizaciones: null }, { cotizaciones: [1] }]) {
    assert.equal(fv.reservaAvisosCotizaciones(sinClave, true), true, `respaldo: ${JSON.stringify(sinClave)}`);
  }
  // Con la lista ya respondida (o fallada) no se reserva: los avisos son los de su resumen (avisosCotizaciones).
  for (const datos of [conClave(2, 1), conClave(0, 0), null]) assert.equal(fv.reservaAvisosCotizaciones(datos, false), false);
  // Los avisos que se reservan son los que pintará la lista: la misma regla (cantidadPositiva) en las dos.
  for (const [s, v] of [[2, 0], [0, 3], [0, 0], [1, 1]]) {
    assert.equal(fv.reservaAvisosCotizaciones(conClave(s, v), true), fv.avisosCotizaciones({ sin_calc: s, vencen_pronto: v }).length > 0, `${s}/${v}`);
  }
}

console.log('--- B4 T9 TEST 1: avisosCotizaciones — los chips «N sin precio» y «N vencen en 7 días» de la franja de Cotizaciones ---');
{
  // FLUJO-ventas-pantallas C.1 (RP19 (3), RP89): lo que decía el aviso ámbar de la lista pasa a la franja, con el resumen
  // de la MISMA llamada de la lista: sin_calc (activas sin precio) y vencen_pronto (activas con valida_hasta entre hoy y
  // hoy + 7 días en Colombia). En ese orden; sin un número positivo, ese chip no va.
  assert.deepEqual(fv.avisosCotizaciones({ sin_calc: 2, vencen_pronto: 3 }),
    [{ texto: '2 sin precio', tono: 'ambar' }, { texto: '3 vencen en 7 días', tono: 'ambar' }]);
  assert.deepEqual(fv.avisosCotizaciones({ sin_calc: 1, vencen_pronto: 1 }),
    [{ texto: '1 sin precio', tono: 'ambar' }, { texto: '1 vence en 7 días', tono: 'ambar' }], 'el singular');
  assert.deepEqual(fv.avisosCotizaciones({ sin_calc: 1234, vencen_pronto: 0 }), [{ texto: '1.234 sin precio', tono: 'ambar' }],
    'con el punto de miles; sin vencen_pronto, solo el otro');
  assert.deepEqual(fv.avisosCotizaciones({ sin_calc: 0, vencen_pronto: 5, sin_atender: 4 }), [{ texto: '5 vencen en 7 días', tono: 'ambar' }],
    'sin_atender no es un aviso (lo dice «Con atraso» del semáforo)');
  for (const malo of [0, -2, null, undefined, NaN, 'x', '']) {
    assert.deepEqual(fv.avisosCotizaciones({ sin_calc: malo, vencen_pronto: malo }), [], String(malo));
  }
  // Sin resumen (cargando o con error): ningún chip.
  for (const nada of [null, undefined, 'x', 3, []]) assert.deepEqual(fv.avisosCotizaciones(nada), [], String(nada));
  // Un arreglo no es un resumen, aunque traiga las claves.
  assert.deepEqual(fv.avisosCotizaciones(Object.assign([], { sin_calc: 2, vencen_pronto: 1 })), [], 'un arreglo');
}

console.log('--- B4 T10 TEST 1: pasosDePedidos — la franja de Pedidos: detalle por grupo y Entregado / Facturado en la misma página ---');
{
  // FLUJO-ventas-pantallas D (RP21, D42): «Estás aquí» en Pedido de venta; su detalle se agrupa con grupoPedido
  // ('Pend. Compra 0 · En Proceso 1 · Listo Entrega 0', los tres pasos del pedido en curso, con sus ceros); Solicitud y
  // Cotización son enlaces a su lista; Entregado y Facturado están en esta misma página: sin href (la pantalla los
  // vuelve botones que despachan su vista) y marcados (seleccionado) cuando esa es la vista.
  const datos = {
    pasos: {
      SC: { total: 5, atrasados: 2, por_estado: { BORRADOR: 5 } },
      COT: { total: 3, atrasados: 1, por_estado: { BORRADOR: 3 } },
      PVEN: { total: 6, atrasados: 1, mas_antiguo_dias: 4, por_estado: { EN_PROCESO: 2, EN_TRANSITO: 1, PENDIENTE_PAGO: 2, PENDIENTE_COMPRA: 1 } },
      ENTREGADO: { total: 2, atrasados: null, por_estado: { ENTREGADO: 2 } },
      FACTURADO: { total: 4, atrasados: null, por_estado: { FACTURADO: 4 } },
    },
  };
  const pasos = fv.pasosDePedidos(datos, 'todos');
  const base = fv.pasosDeLista(datos, 'PVEN');
  assert.deepEqual(pasos.map((p) => p.clave), CLAVES);
  assert.deepEqual(pasos.map((p) => p.esEste), [false, false, true, false, false]);
  assert.deepEqual(pasos.map((p) => p.href), ['/dashboard/ventas/solicitud', '/dashboard/ventas/cotizacion', undefined, undefined, undefined],
    'Solicitud y Cotización a su lista; Pedido (Estás aquí), Entregado y Facturado sin href');
  assert.deepEqual(pasos[2].detalle, [{ label: 'Pend. Compra', n: 3 }, { label: 'En Proceso', n: 3 }, { label: 'Listo Entrega', n: 0 }],
    'el detalle por grupo (grupoPedido), con los ceros');
  assert.equal(flujo.textoDetalle(pasos[2].detalle), 'Pend. Compra 3 · En Proceso 3 · Listo Entrega 0');
  assert.deepEqual(pasos.map((p) => Boolean(p.seleccionado)), [false, false, false, false, false], 'en Todos ninguna marcada');
  // Lo demás (números, atrasos, presentación) es lo de pasosDeLista con 'PVEN'.
  const sinMarcas = (p) => ({ ...p, href: undefined, detalle: undefined, seleccionado: undefined });
  assert.deepEqual(pasos.map(sinMarcas), base.map(sinMarcas));
  assert.equal(pasos[2].atrasados, 1, 'los atrasados del paso PVEN (el semáforo de la lista)');
  // La vista entregado o facturado marca su caja (aria-pressed en PasosFlujo).
  assert.deepEqual(fv.pasosDePedidos(datos, 'entregado').map((p) => Boolean(p.seleccionado)), [false, false, false, true, false]);
  assert.deepEqual(fv.pasosDePedidos(datos, 'facturado').map((p) => Boolean(p.seleccionado)), [false, false, false, false, true]);
  for (const otra of ['pend_compra', 'cancelado', null, undefined, 'x']) {
    assert.ok(fv.pasosDePedidos(datos, otra).every((p) => !p.seleccionado), String(otra));
  }
  // PARCIALMENTE_ENTREGADO cae en Listo Entrega (paso 2); un estado desconocido va al final, humanizado; los ceros, los
  // negativos y lo que no es un número no suman.
  const raros = { pasos: { PVEN: { total: 4, atrasados: 0, por_estado: { PARCIALMENTE_ENTREGADO: 1, LISTO_ENTREGA: 2, ALGO_NUEVO: 1, EN_PROCESO: 0, PAGADO: -3, EN_TRANSITO: 'x' } } } };
  assert.deepEqual(fv.pasosDePedidos(raros, 'todos')[2].detalle,
    [{ label: 'Pend. Compra', n: 0 }, { label: 'En Proceso', n: 0 }, { label: 'Listo Entrega', n: 3 }, { label: infoEstadoPedido('ALGO_NUEVO').label, n: 1 }]);
  // Sin por_estado: los tres grupos en cero. Mientras carga (sin datos): el detalle en null y los enlaces ya puestos.
  assert.deepEqual(fv.pasosDePedidos({ pasos: { PVEN: { total: 0, atrasados: 0 } } }, 'todos')[2].detalle,
    [{ label: 'Pend. Compra', n: 0 }, { label: 'En Proceso', n: 0 }, { label: 'Listo Entrega', n: 0 }]);
  const cargando = fv.pasosDePedidos(null, 'entregado');
  assert.deepEqual(cargando.map((p) => [p.total, p.detalle]), CLAVES.map(() => [null, null]));
  assert.deepEqual(cargando.map((p) => p.href), ['/dashboard/ventas/solicitud', '/dashboard/ventas/cotizacion', undefined, undefined, undefined]);
  assert.equal(cargando[3].seleccionado, true, 'la vista se marca también mientras carga');
  // Los grupos son los tres primeros pasos del pedido (PASOS_PEDIDO): los de grupoPedido.
  const { PASOS_PEDIDO } = await import('../src/lib/estados-pedido.js');
  assert.deepEqual(fv.pasosDePedidos(datos, 'todos')[2].detalle.slice(0, 3).map((d) => d.label), PASOS_PEDIDO.slice(0, 3).map((p) => p.label));
  // pasosDeLista no cambia (Solicitudes y Cotizaciones siguen igual): su caja PVEN conserva el detalle por estado.
  assert.deepEqual(fv.pasosDeLista(datos, 'PVEN')[3].href, '/dashboard/ventas/venta?tab=entregado');
}

console.log('--- B4 T10 TEST 2: vistaDePasoPedido y leerEnlacePedidos — Entregado y Facturado abren su pestaña (RP21) ---');
{
  // RP21: las cajas Entregado y Facturado (y las rutas ?tab= de PASOS_FLUJO_VENTAS) llevan la clave de la vista de
  // GET /ventas/pedidos. Lo demás no es una vista de esta página.
  assert.equal(fv.vistaDePasoPedido('ENTREGADO'), 'entregado');
  assert.equal(fv.vistaDePasoPedido('FACTURADO'), 'facturado');
  for (const otra of ['SC', 'COT', 'PVEN', 'entregado', '', null, undefined, 'constructor']) assert.equal(fv.vistaDePasoPedido(otra), null, String(otra));
  // ?tab= al montar (con window.location, RP21): las 7 vistas de la lista; un valor desconocido se ignora.
  assert.equal(fv.leerEnlacePedidos('?tab=entregado'), 'entregado');
  assert.equal(fv.leerEnlacePedidos('?tab=facturado&id=3'), 'facturado');
  assert.equal(fv.leerEnlacePedidos('?id=3&tab= cancelado '), 'cancelado', 'sin los espacios de los bordes');
  for (const vista of ['todos', 'pend_compra', 'en_proceso', 'listo_entrega', 'entregado', 'facturado', 'cancelado']) {
    assert.equal(fv.leerEnlacePedidos(`?tab=${vista}`), vista, vista);
  }
  for (const raro of ['?tab=Entregado', '?tab=en_curso', '?tab=analisis', '?tab=', '', '?id=3', null, undefined, 5, '?tab=constructor']) {
    assert.equal(fv.leerEnlacePedidos(raro), null, String(raro));
  }
  // Las rutas de PASOS_FLUJO_VENTAS son las que esta página lee.
  for (const p of PASOS_FLUJO_VENTAS.filter((x) => x.clave === 'ENTREGADO' || x.clave === 'FACTURADO')) {
    assert.equal(fv.leerEnlacePedidos(p.ruta.slice(p.ruta.indexOf('?'))), fv.vistaDePasoPedido(p.clave), p.clave);
  }
  // Las vistas de la lista son las columnas del tablero (las vistas de GET /ventas/pedidos) más Todos.
  const { COLUMNAS_PEDIDO } = await import('../src/lib/kanban-ventas.js');
  for (const c of COLUMNAS_PEDIDO) assert.equal(fv.leerEnlacePedidos(`?tab=${c.clave}`), c.clave, c.clave);
}

console.log('--- B4 T11 TEST 1: anotarPasosCotizacion — «Rechazada» en rojo y «Vencida» en ámbar en la barra de la cotización (RP87) ---');
{
  // pasoCotizacion trae la etiqueta (RECHAZADA) y el aviso (VENCIDA), pero pasosConProgreso solo recibe canceladoEn:
  // anotarPasosCotizacion los pone en el paso que corresponde, con las dos vías que PasosFlujo ya pinta (etiquetaEstado en
  // rojo, avisos como chip). Los demás estados quedan como los dejó pasosConProgreso.
  const sola = (estado) => {
    const p = pasoCotizacion(estado);
    return pasosConProgreso(PASOS_COTIZACION, p.indice, { canceladoEn: p.canceladoEn });
  };
  const barra = (estado) => fv.anotarPasosCotizacion(sola(estado), pasoCotizacion(estado));
  const rechazada = barra('RECHAZADA');
  assert.deepEqual(estados(rechazada), ['hecho', 'cancelado', 'pendiente']);
  assert.equal(rechazada[1].etiquetaEstado, 'Rechazada', 'la palabra va en el paso caído');
  assert.equal(rechazada[0].etiquetaEstado, undefined);
  assert.equal(rechazada[2].etiquetaEstado, undefined);
  assert.ok(rechazada.every((x) => !x.avisos), 'sin avisos');
  const vencida = barra('VENCIDA');
  assert.deepEqual(estados(vencida), ['hecho', 'actual', 'pendiente']);
  assert.deepEqual(vencida[1].avisos, [{ texto: 'Vencida', tono: 'ambar' }], 'el chip ámbar en el paso donde quedó');
  assert.ok(vencida.every((x) => !x.etiquetaEstado), 'sin etiquetaEstado');
  assert.equal(vencida[0].avisos, undefined);
  assert.equal(vencida[2].avisos, undefined);
  // Los demás estados (y los raros) no cambian nada: igual a pasosConProgreso.
  for (const estado of ['BORRADOR', 'ENVIADA', 'PENDIENTE_CONFIRMACION', 'CONFIRMADA', 'ALGO_NUEVO', '', null, undefined]) {
    assert.deepEqual(barra(estado), sola(estado), String(estado));
  }
  // No muta lo que recibe, y el aviso del resultado es una copia.
  const base = pasosConProgreso(PASOS_COTIZACION, 1, { canceladoEn: 1 });
  const copia = JSON.parse(JSON.stringify(base));
  const pv = pasoCotizacion('VENCIDA');
  const salida = fv.anotarPasosCotizacion(base, pv);
  assert.deepEqual(base, copia, 'la entrada intacta');
  assert.notEqual(salida[1].avisos[0], pv.aviso, 'el aviso se copia');
  // Cada cosa va en SU paso: la palabra en el canceladoEn y el aviso en el indice, aunque no coincidan.
  const tres = sola('BORRADOR');
  const suelto = fv.anotarPasosCotizacion(tres, { indice: 0, canceladoEn: 2, etiqueta: 'Rechazada', aviso: { texto: 'Vencida', tono: 'ambar' } });
  assert.deepEqual(suelto.map((x) => x.etiquetaEstado), [undefined, undefined, 'Rechazada']);
  assert.deepEqual(suelto.map((x) => x.avisos), [[{ texto: 'Vencida', tono: 'ambar' }], undefined, undefined]);
  // Bordes: sin pasos, sin p, un índice fuera de rango.
  assert.deepEqual(fv.anotarPasosCotizacion([], pasoCotizacion('VENCIDA')), []);
  assert.deepEqual(fv.anotarPasosCotizacion(null, pasoCotizacion('RECHAZADA')), []);
  assert.deepEqual(fv.anotarPasosCotizacion(sola('BORRADOR'), null), sola('BORRADOR'));
  assert.deepEqual(fv.anotarPasosCotizacion(sola('BORRADOR'), { indice: 9, etiqueta: 'X', canceladoEn: 9, aviso: { texto: 'Y', tono: 'ambar' } }), sola('BORRADOR'));
}

console.log('--- B4 T11 TEST 2: los detalles de la solicitud y la cotización usan la pieza común (FLUJO-documentos puntos 3 y 4; RP4, RP17, RP87) ---');
{
  const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
  const sc = leer('../src/app/dashboard/ventas/solicitud/[id]/page.tsx');
  const paso = leer('../src/app/dashboard/ventas/solicitud/[id]/estado-solicitud.tsx');
  const cot = leer('../src/app/dashboard/ventas/cotizacion/[id]/page.tsx');
  const barra = leer('../src/components/flujo/PasosFlujo.tsx');
  const CONTENEDOR = 'bg-white px-6 py-2 border-b border-slate-200 shrink-0';

  // — Detalle de la solicitud —
  assert.match(sc, /import \{ CadenaDocumentos \} from '@\/components\/flujo';/);
  assert.match(sc, /\{!isSoporte && \(\s*<div className="bg-white px-6 py-2 border-b border-slate-200 shrink-0">\s*<CadenaDocumentos doc=\{solicitud\} tipo="SC" \/>\s*<\/div>\s*\)\}/,
    'la cadena de la SC, sin barra en Soporte Técnico y con el contenedor del pedido');
  assert.ok(sc.indexOf('<CadenaDocumentos doc={solicitud} tipo="SC" />') < sc.indexOf('{/* Main Content Layout (Split Pane) */}'), 'fuera del panel dividido');
  assert.ok(!sc.includes('pipelineStep'), 'pipelineStep se fue (quedó sin uso)');
  assert.ok(!sc.includes('Pedido de Venta\'].map'), 'el «Progreso del Flujo» hecho a mano se fue');
  // RP17: «Reiniciar solicitud» usa el texto de kanban-ventas.js; el de línea se fue.
  assert.match(sc, /import \{ confirmacionReiniciarSolicitud \} from '@\/lib\/kanban-ventas';/);
  assert.ok(sc.includes('if (!(await confirmar(confirmacionReiniciarSolicitud(solicitud)))) return;'), 'RP17');
  assert.ok(!sc.includes('La solicitud vuelve a'), 'el texto en línea se fue');
  assert.ok(!/const destino = infoEstadoSolicitud/.test(sc), 'el destino en línea se fue');
  // RP4: la SC sigue leyendo ESTADOS del molde de siempre.
  assert.ok(sc.includes('ESTADOS as ESTADOS_COT'), 'RP4: ESTADOS_COT se importa igual');
  // — Los 4 pasos de la solicitud (estado-solicitud.tsx) —
  assert.ok(paso.includes('<PasosFlujo variante="barra" pasos={pasosConProgreso(PASOS_SC, paso)} etiqueta="Estado de la solicitud" partirEtiquetas />'), 'los 4 pasos con la pieza común');
  assert.ok(!/<ol\b/.test(paso), 'ya no hay un <ol> hecho a mano');
  assert.ok(paso.includes('{ayuda || PASOS_SC[paso].ayuda}'), 'la ayuda del paso sigue igual');
  assert.ok(paso.includes('<RotateCcw size={12} /> Reiniciar solicitud') && paso.includes('onClick={onReiniciar}'), '«Reiniciar solicitud» no cambia');
  assert.ok(paso.includes('{paso >= 0 ? ('), 'un estado fuera de los pasos no dibuja la barra');
  assert.ok(paso.includes('{puedeReiniciar && ('), '«Reiniciar solicitud» solo con puedeReiniciar');
  assert.ok(paso.includes('disabled={reiniciando}'), '«Reiniciar solicitud» se deshabilita mientras se guarda');
  assert.ok(sc.includes('<EstadoSolicitudPasos solicitud={solicitud} puedeReiniciar={puedeReiniciarSC} onReiniciar={reiniciarSolicitud} reiniciando={saving} ayuda={ayudaPasos} />'), 'la página llama a los pasos con todas sus props');

  // — Detalle de la cotización —
  assert.match(cot, /import \{ CadenaDocumentos, PasosFlujo \} from '@\/components\/flujo';/);
  assert.match(cot, /\{!isNew && cotizacion && \(\s*<div className="bg-white px-6 py-2 border-b border-slate-200 shrink-0">\s*<CadenaDocumentos doc=\{cotizacion\} tipo="COT" \/>\s*<\/div>\s*\)\}/,
    'la cadena de la COT, solo con la cotización cargada y con el contenedor del pedido');
  const iCadena = cot.indexOf('<CadenaDocumentos doc={cotizacion} tipo="COT" />');
  const iPanel = cot.indexOf('{/* Main Content Layout (Split Pane) */}');
  assert.ok(iCadena > 0 && iCadena < iPanel, 'entre el encabezado y el panel dividido (fuera de él, H37)');
  assert.ok(CONTENEDOR && cot.includes(CONTENEDOR) && sc.includes(CONTENEDOR), 'el mismo contenedor en los dos detalles');
  // RP87: el lugar de pasoCotizacion, sin stepIndex; la palabra y el aviso con anotarPasosCotizacion.
  // B4.1 (P12): la página usa pasosDeCotizacion (pasoCotizacion + pasosConProgreso + anotarPasosCotizacion, con `terminado` y sin
  // perder «Rechazada» ni «Vencida»): una COT confirmada muestra los tres pasos con ✓.
  assert.ok(cot.includes('const pasosCot = pasosDeCotizacion(estadoActual);'), 'RP87 y B4.1 (P12)');
  assert.ok(!/\bstepIndex\b/.test(cot), 'stepIndex se fue');
  assert.match(cot, /\{!isNew && cotizacion && \(\s*<div className="bg-white py-6 border-b border-slate-100 mb-8 overflow-x-auto">\s*<PasosFlujo variante="barra" pasos=\{pasosCot\} etiqueta="Pasos de la cotización" partirEtiquetas estadoVisible \/>\s*<\/div>\s*\)\}/,
    'el Status Tracker, en el mismo lugar y con la misma condición');
  assert.ok(!/\bCircle\b/.test(cot.replace(/CheckCircle2|AlertCircle/g, '')), 'Circle se fue de los imports');
  // RP4: la COT sigue leyendo ESTADOS (el hex y Object.entries).
  assert.ok(cot.includes('ESTADOS as ESTADOS_COT'), 'RP4: ESTADOS_COT se importa igual');
  assert.ok(cot.includes('Object.entries(ESTADOS_COT)'), 'RP4: Object.entries sigue');
  assert.ok(cot.includes('estadoCfg.bg') && cot.includes('estadoCfg.color'), 'RP4: la cabecera sigue con el hex');
  // La pieza común pinta las dos vías que usa la COT: la palabra del paso caído (rojo) y los avisos (chip ámbar).
  assert.ok(barra.includes('{paso.sublabel || paso.etiquetaEstado ? (compacto') && barra.includes('{paso.etiquetaEstado ? ('), 'PasosFlujo pinta la etiquetaEstado en la barra');
  assert.ok(barra.includes('{paso.avisos?.length ? (') && barra.includes('<AvisosDelPaso avisos={paso.avisos} pequeno'), 'PasosFlujo pinta los avisos en la barra');
  // Una sola cadena por detalle (nada duplicado dentro del panel).
  assert.equal(sc.split('<CadenaDocumentos').length - 1, 1, 'una sola cadena en la SC');
  assert.equal(cot.split('<CadenaDocumentos').length - 1, 1, 'una sola cadena en la COT');
  assert.equal(cot.split('<PasosFlujo').length - 1, 1, 'una sola barra de pasos en la COT');
}

console.log('--- B4 T22 TEST 1: pasosEmbudoDashboard — el embudo del Dashboard General con /ventas/flujo y enlaces al Hub filtrado (FLUJO-ventas-pantallas E) ---');
{
  assert.equal(typeof fv.pasosEmbudoDashboard, 'function', 'pasosEmbudoDashboard existe');
  const datos = {
    pasos: {
      SC: { total: 4, atrasados: 1, mas_antiguo_dias: 6, por_estado: { NUEVA: 3 } },
      COT: { total: 7, atrasados: 0, mas_antiguo_dias: 2, por_estado: {} },
      PVEN: { total: 12, atrasados: 2, mas_antiguo_dias: 9, por_estado: {} },
      ENTREGADO: { total: 3, atrasados: 0, mas_antiguo_dias: 1, por_estado: {} },
      FACTURADO: { total: 40, atrasados: 0, mas_antiguo_dias: null, por_estado: {} },
    },
    cambios_cliente: { SC: 2 },
    sin_respuesta: { COT: 1 },
    semaforo: { atrasados: 3, no_resueltos: 5 },
  };
  const pasos = fv.pasosEmbudoDashboard(datos);
  // Los mismos 5 pasos del Hub, en su orden, con SUS números (los de la franja del Hub: el mismo endpoint).
  assert.deepEqual(pasos.map((p) => p.clave), CLAVES);
  assert.deepEqual(pasos.map((p) => p.label), PASOS_FLUJO_VENTAS.map((p) => p.label));
  assert.deepEqual(pasos.map((p) => p.total), [4, 7, 12, 3, 40]);
  assert.deepEqual(pasos.map((p) => p.atrasados), [1, 0, 2, 0, 0]);
  // Cada caja es un enlace al Hub ya filtrado por ese paso (nunca a /dashboard/ventas/pedidos, que no existe), y el Hub lo lee.
  assert.deepEqual(pasos.map((p) => p.href), CLAVES.map((c) => `/dashboard/ventas?paso=${c}`));
  for (const p of pasos) assert.equal(fv.leerEnlaceHub(`?paso=${p.clave}`).paso, p.clave, `${p.clave}: el Hub abre filtrado`);
  // Ninguna es «Estás aquí» ni está elegida; sin avisos ni detalle (el embudo es solo los números).
  for (const p of pasos) {
    assert.equal(p.esEste, false, p.clave);
    assert.equal(p.seleccionado, false, p.clave);
    assert.ok(!p.avisos || p.avisos.length === 0, `${p.clave}: sin avisos`);
    assert.ok(!p.detalle || p.detalle.length === 0, `${p.clave}: sin detalle`);
  }
  // Mientras carga (datos null) o si falló: totales null (la barra gris o «—», nunca 0) y los enlaces siguen.
  for (const sin of [null, undefined]) {
    const cargando = fv.pasosEmbudoDashboard(sin);
    assert.deepEqual(cargando.map((p) => p.total), [null, null, null, null, null]);
    assert.deepEqual(cargando.map((p) => p.atrasados), [null, null, null, null, null]);
    assert.deepEqual(cargando.map((p) => p.href), CLAVES.map((c) => `/dashboard/ventas?paso=${c}`));
  }
  // Un paso que el servidor no manda queda en null, sin tapar los demás.
  const sinCot = fv.pasosEmbudoDashboard({ pasos: { SC: { total: 4, atrasados: 0 } } });
  assert.deepEqual(sinCot.map((p) => p.total), [4, null, null, null, null]);
  // No toca la definición ni los datos.
  assert.ok(Object.isFrozen(PASOS_FLUJO_VENTAS) && PASOS_FLUJO_VENTAS.every((p) => !('href' in p)));
}

console.log('--- B4 T22 r1 TEST 2: avisoEmbudoDashboard — cuándo el embudo ofrece «Reintentar» (I1 M10, m7) y el enlace del radar ---');
{
  assert.equal(typeof fv.avisoEmbudoDashboard, 'function');
  // Sin error y sin carga: no hay aviso. La primera carga sin error tampoco.
  assert.deepEqual(fv.avisoEmbudoDashboard({ cargando: false, error: null, huboError: false }), { visible: false, reintentando: false, puedeReintentar: false, boton: null, texto: null });
  assert.equal(fv.avisoEmbudoDashboard({ cargando: true, error: null, huboError: false }).visible, false);
  // Con error: se ve, dice qué pasó y «Reintentar» pide otra vez.
  const conError = fv.avisoEmbudoDashboard({ cargando: false, error: new Error('x'), huboError: false });
  assert.deepEqual(conError, { visible: true, reintentando: false, puedeReintentar: true, boton: 'Reintentar', texto: 'No se pudo cargar el embudo.' });
  // Mientras se reintenta (la carga vuelve a salir tras un error): sigue visible, «Reintentando…» y NO vuelve a pedir (la guarda de BannerFlujo).
  const reintentando = fv.avisoEmbudoDashboard({ cargando: true, error: null, huboError: true });
  assert.deepEqual(reintentando, { visible: true, reintentando: true, puedeReintentar: false, boton: 'Reintentando…', texto: 'No se pudo cargar el embudo.' });
  // El enlace del radar abre la pestaña de Pedidos que tiene ese número.
  assert.equal(fv.leerEnlacePedidos('?tab=pend_compra'), 'pend_compra');
}

console.log('--- B4.1 T6 (P11): el detalle del pedido sin el bloque Origen ---');
{
  const venta = readFileSync(new URL('../src/app/dashboard/ventas/venta/[id]/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(!venta.includes('>Origen</label>'), 'sin el bloque Origen (la cadena de documentos ya lo dice)');
  assert.ok(venta.includes('grid grid-cols-1 @2xl:grid-cols-2 gap-6'), 'Cliente y Entrega, en dos columnas');
  assert.ok(venta.includes('<CadenaDocumentos'), 'la cadena de documentos sigue');
}

console.log('\nOK: test_flujo_ventas.mjs');
