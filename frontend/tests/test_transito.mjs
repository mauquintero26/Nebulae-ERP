/**
 * frontend/tests/test_transito.mjs
 * Bloque 4, T3C (KANBAN-logistica punto 1, R11, RP76): el tablero de Mercancía en tránsito (lib/transito.js). Las
 * columnas salen de GET /compras/tracking-config (las etapas de los dos tipos de envío, unidas en orden), cada pedido
 * está en la etapa que le falta completar y solo se arrastra a la etapa siguiente (equivale a «Completar»).
 */

import assert from 'node:assert/strict';
import { columnasDeEtapas, etapaActual, columnaTransito, reglaSoltarTransito } from '../src/lib/transito.js';
import { mapaDestinos } from '../src/lib/kanban.js';
// B4 T16A: lo nuevo de la pantalla por el espacio de nombres (su falta no tapa los demás rojos).
import * as tr from '../src/lib/transito.js';

// La configuración por defecto (DEFAULT_TRACKING_STAGES de backend/app/api/v1/erp_compras.py).
const CONFIG = {
  casillero: [
    { key: 'PENDIENTE_DESPACHO', label: 'Pendiente Despacho Proveedor', active: true },
    { key: 'PROVEEDOR_CASILLERO', label: 'Proveedor -> Casillero', active: true },
    { key: 'CASILLERO_BODEGA', label: 'Casillero -> Bodega Nebulae', active: true },
    { key: 'RECIBIDO', label: 'Recibido', active: true },
  ],
  directo: [
    { key: 'PENDIENTE_DESPACHO', label: 'Pendiente Despacho Proveedor', active: true },
    { key: 'PROVEEDOR_BODEGA', label: 'Proveedor -> Bodega Nebulae', active: true },
    { key: 'RECIBIDO', label: 'Recibido', active: true },
  ],
};
const COLUMNAS = columnasDeEtapas(CONFIG);

/** Un PEC con las etapas de su tipo de envío (como create_pec) y las primeras `hechas` completadas. */
function pec(tipo, hechas, extra = {}) {
  const etapas = CONFIG[tipo].map((s, i) => ({ stage: s.key, label: s.label, status: i < hechas ? 'COMPLETADO' : 'PENDIENTE' }));
  return { id: 3, numero: 'PEC-3', tipo_envio: tipo, tracking_stages: etapas, ...extra };
}

console.log('--- TEST 1: columnasDeEtapas une los dos envíos en orden (RP76) ---');
{
  assert.deepEqual(COLUMNAS.map((c) => c.clave),
    ['PENDIENTE_DESPACHO', 'PROVEEDOR_CASILLERO', 'CASILLERO_BODEGA', 'PROVEEDOR_BODEGA', 'RECIBIDO']);
  assert.deepEqual(COLUMNAS.map((c) => c.titulo), [
    'Pendiente Despacho Proveedor', 'Proveedor → Casillero', 'Casillero → Bodega Nebulae', 'Proveedor → Bodega Nebulae', 'Recibido',
  ], 'el título es el label de la primera configuración que la tiene, con → en vez de ->');
  assert.ok(Object.isFrozen(COLUMNAS) && COLUMNAS.every((c) => c.cerrada === false));
  // Las inactivas quedan fuera; acepta también la respuesta {status, data}.
  const conInactiva = {
    ...CONFIG, casillero: CONFIG.casillero.map((s) => (s.key === 'CASILLERO_BODEGA' ? { ...s, active: false } : s)),
  };
  assert.deepEqual(columnasDeEtapas({ status: 'success', data: conInactiva }).map((c) => c.clave),
    ['PENDIENTE_DESPACHO', 'PROVEEDOR_CASILLERO', 'PROVEEDOR_BODEGA', 'RECIBIDO']);
  // Una etapa de directo que no comparte nada más adelante va al final.
  const otra = { casillero: CONFIG.casillero, directo: [...CONFIG.directo, { key: 'ENTREGA_FINAL', label: 'Entrega final' }] };
  assert.deepEqual(columnasDeEtapas(otra).map((c) => c.clave).slice(-2), ['RECIBIDO', 'ENTREGA_FINAL']);
  // Sin configuración no hay columnas (la pantalla avisa); un PEC viejo con una etapa que ya no está suma su columna al final.
  assert.deepEqual(columnasDeEtapas(null), []);
  const viejo = { id: 8, tracking_stages: [{ stage: 'ADUANA', label: 'Aduana -> Bodega', status: 'PENDIENTE' }] };
  const conViejo = columnasDeEtapas(CONFIG, { pedidos: [viejo, pec('casillero', 1)] });
  assert.deepEqual(conViejo.map((c) => c.clave).slice(-2), ['RECIBIDO', 'ADUANA']);
  assert.equal(conViejo.at(-1).titulo, 'Aduana → Bodega');
  assert.equal(conViejo.length, 6);
}

console.log('--- TEST 2: etapaActual y columnaTransito ---');
{
  assert.equal(etapaActual(pec('casillero', 1)).stage, 'PROVEEDOR_CASILLERO');
  assert.equal(columnaTransito(pec('casillero', 1)), 'PROVEEDOR_CASILLERO');
  assert.equal(columnaTransito(pec('directo', 0)), 'PENDIENTE_DESPACHO');
  assert.equal(etapaActual(pec('casillero', 4)), null, 'todas completadas');
  assert.equal(columnaTransito(pec('casillero', 4)), null);
  assert.equal(etapaActual({ tracking_stages: null }), null);
  assert.equal(etapaActual({ tracking_stages: [null, 'x', { stage: 'A', status: 'EN_PROCESO' }] }).stage, 'A');
}

console.log('--- TEST 3: reglaSoltarTransito: solo la etapa siguiente ---');
{
  const soltar = (p, destino) => reglaSoltarTransito(p, columnaTransito(p), destino, { columnas: COLUMNAS });
  // Casillero en PROVEEDOR_CASILLERO → la siguiente: completa la actual.
  assert.deepEqual(soltar(pec('casillero', 1), 'CASILLERO_BODEGA'),
    { tipo: 'cambio', estado: 'COMPLETADO', cuerpo: { stage: 'PROVEEDOR_CASILLERO' } });
  assert.deepEqual(soltar(pec('casillero', 1), 'RECIBIDO'),
    { tipo: 'bloqueado', motivo: 'Las etapas se completan en orden: primero «Casillero → Bodega Nebulae».' });
  assert.deepEqual(soltar(pec('directo', 1), 'CASILLERO_BODEGA'),
    { tipo: 'bloqueado', motivo: 'Este pedido va por envío directo: no pasa por «Casillero → Bodega Nebulae».' });
  assert.deepEqual(soltar(pec('casillero', 1), 'PROVEEDOR_BODEGA'),
    { tipo: 'bloqueado', motivo: 'Este pedido va por envío casillero: no pasa por «Proveedor → Bodega Nebulae».' });
  assert.deepEqual(soltar(pec('casillero', 2), 'PENDIENTE_DESPACHO'),
    { tipo: 'bloqueado', motivo: 'Una etapa completada no se deshace desde aquí.' });
  assert.deepEqual(soltar(pec('directo', 1), 'RECIBIDO'),
    { tipo: 'cambio', estado: 'COMPLETADO', cuerpo: { stage: 'PROVEEDOR_BODEGA' } }, 'directo: de Proveedor → Bodega a Recibido');
  // Ya en Recibido (la etapa final): se confirma en Recepciones.
  const RECEPCIONES = { texto: 'Ir a Recepciones', href: '/dashboard/compras/recepciones' };
  for (const destino of ['PENDIENTE_DESPACHO', 'CASILLERO_BODEGA']) {
    assert.deepEqual(soltar(pec('casillero', 3), destino),
      { tipo: 'bloqueado', motivo: 'Ya llegó: confírmalo en Recepciones.', enlace: RECEPCIONES }, destino);
  }
  // Sin la opción columnas, el título sale de la etapa del pedido o humanizado.
  assert.deepEqual(reglaSoltarTransito(pec('directo', 1), 'PROVEEDOR_BODEGA', 'CASILLERO_BODEGA'),
    { tipo: 'bloqueado', motivo: 'Este pedido va por envío directo: no pasa por «Casillero bodega».' });
  assert.deepEqual(reglaSoltarTransito(pec('casillero', 0), 'PENDIENTE_DESPACHO', 'CASILLERO_BODEGA'),
    { tipo: 'bloqueado', motivo: 'Las etapas se completan en orden: primero «Proveedor → Casillero».' });
  assert.deepEqual(soltar(pec('casillero', 1), 'PROVEEDOR_CASILLERO'), { tipo: 'ninguno' });
  // Un envío sin tipo_envio es por casillero (como el servidor).
  assert.deepEqual(soltar({ ...pec('casillero', 1), tipo_envio: null }, 'PROVEEDOR_BODEGA').motivo,
    'Este pedido va por envío casillero: no pasa por «Proveedor → Bodega Nebulae».');
  // Todas las combinaciones tienen la forma de kanban.js.
  for (const tipo of ['casillero', 'directo']) {
    for (let hechas = 0; hechas < CONFIG[tipo].length; hechas += 1) {
      const p = pec(tipo, hechas);
      mapaDestinos(p, columnaTransito(p), COLUMNAS, (x, o, d) => reglaSoltarTransito(x, o, d, { columnas: COLUMNAS }));
    }
  }
}

// ─── B4 T16A: la pantalla de Tránsito (TABLA-compras punto 8, KANBAN-logistica punto 2, KPI-compras punto 7) ───────

/** Las etapas de un PEC con estados a la medida: ['COMPLETADO', 'EN_PROCESO'…] en el orden de su envío. */
function conEstados(tipo, estados, extra = {}) {
  const etapas = CONFIG[tipo].map((s, i) => ({ stage: s.key, label: s.label, status: estados[i] ?? 'PENDIENTE' }));
  return {
    id: 5, numero: 'PEC-5', tipo_envio: tipo, estado: 'EN_TRANSITO', supplier_name: 'Acme', ven_numero: 'PVEN-9',
    total_cop: 1500000, fecha_entrega_estimada: '2026-11-10T00:00:00', is_overdue: false, tracking_stages: etapas, ...extra,
  };
}

console.log('--- TEST 7 (B4 T16A): accionEtapaTransito, el botón de la fila y de la tarjeta (Iniciar o Completar la etapa actual) ---');
{
  assert.equal(typeof tr.accionEtapaTransito, 'function', 'accionEtapaTransito existe');
  // La etapa actual sin empezar: «Iniciar» (EN_PROCESO); en curso: «Completar» (COMPLETADO).
  assert.deepEqual(tr.accionEtapaTransito(conEstados('casillero', [])),
    { stage: 'PENDIENTE_DESPACHO', status: 'EN_PROCESO', texto: 'Iniciar' });
  assert.deepEqual(tr.accionEtapaTransito(conEstados('casillero', ['COMPLETADO', 'EN_PROCESO'])),
    { stage: 'PROVEEDOR_CASILLERO', status: 'COMPLETADO', texto: 'Completar' });
  assert.deepEqual(tr.accionEtapaTransito(conEstados('directo', ['COMPLETADO', 'COMPLETADO', 'PENDIENTE'])),
    { stage: 'RECIBIDO', status: 'EN_PROCESO', texto: 'Iniciar' }, 'Recibido se inicia y se completa con el botón');
  // Todas completadas, sin etapas o una etapa cancelada: ninguna acción.
  assert.equal(tr.accionEtapaTransito(conEstados('directo', ['COMPLETADO', 'COMPLETADO', 'COMPLETADO'])), null);
  assert.equal(tr.accionEtapaTransito({ id: 1, tracking_stages: [] }), null);
  assert.equal(tr.accionEtapaTransito(null), null);
  assert.equal(tr.accionEtapaTransito(conEstados('casillero', ['COMPLETADO', 'CANCELADO'])), null, 'una etapa cancelada no se inicia');
  // Es la etapa que el tablero tiene como columna (la misma regla que columnaTransito).
  const p = conEstados('casillero', ['COMPLETADO']);
  assert.equal(tr.accionEtapaTransito(p).stage, columnaTransito(p));
}

console.log('--- TEST 8 (B4 T16A): avanceTransito y avancePromedioTransito («n de m» y la tarjeta Avance promedio) ---');
{
  assert.equal(typeof tr.avanceTransito, 'function');
  assert.deepEqual(tr.avanceTransito(conEstados('casillero', ['COMPLETADO', 'COMPLETADO', 'EN_PROCESO'])), { hechas: 2, total: 4, texto: '2 de 4' });
  assert.deepEqual(tr.avanceTransito(conEstados('directo', [])), { hechas: 0, total: 3, texto: '0 de 3' });
  assert.deepEqual(tr.avanceTransito({ tracking_stages: [] }), { hechas: 0, total: 0, texto: 'Sin etapas' });
  assert.deepEqual(tr.avanceTransito(null), { hechas: 0, total: 0, texto: 'Sin etapas' });
  assert.equal(typeof tr.avancePromedioTransito, 'function');
  // El promedio de etapas completadas sobre el promedio de etapas, de las filas dadas (la página, RP95); coma decimal.
  const filas = [conEstados('casillero', ['COMPLETADO', 'COMPLETADO']), conEstados('directo', ['COMPLETADO']), conEstados('directo', [])];
  assert.equal(tr.avancePromedioTransito(filas), '1/3', '3 hechas entre 3 pedidos y 10 etapas entre 3');
  assert.equal(tr.avancePromedioTransito([conEstados('casillero', ['COMPLETADO', 'COMPLETADO', 'COMPLETADO'])]), '3/4');
  assert.equal(tr.avancePromedioTransito([conEstados('casillero', ['COMPLETADO']), conEstados('casillero', ['COMPLETADO', 'COMPLETADO'])]), '1,5/4');
  // Sin filas (o lo que no es un arreglo): null, nunca «0/-».
  for (const v of [[], null, undefined, 'x']) assert.equal(tr.avancePromedioTransito(v), null, String(v));
}

console.log('--- TEST 9 (B4 T16A): textoEntregaTransito, «Entrega en N días» y «Vencido hace N días» (RP40: día de calendario) ---');
{
  assert.equal(typeof tr.textoEntregaTransito, 'function');
  const hoy = '2026-11-07';
  const t = (fecha, vencido) => tr.textoEntregaTransito({ fecha_entrega_estimada: fecha, is_overdue: vencido }, hoy);
  assert.equal(t('2026-11-10T00:00:00', false), 'Entrega en 3 días');
  assert.equal(t('2026-11-08T05:00:00', false), 'Entrega en 1 día');
  assert.equal(t('2026-11-07T00:00:00', false), 'Entrega hoy', 'una entrega guardada hoy a las 00:00 no está vencida hoy');
  assert.equal(t('2026-11-04', true), 'Vencido hace 3 días');
  assert.equal(t('2026-11-06T23:59:59', true), 'Vencido hace 1 día');
  // «Vencido» lo manda el servidor (is_overdue): una fecha pasada sin la marca no se pinta vencida (un PEC en bodega nunca lo es).
  assert.equal(t('2026-11-04', false), 'Debía llegar hace 3 días', 'pasada y sin marca del servidor: se dice sin alarma');
  // Sin fecha, o una que no es un día: null.
  for (const f of [null, undefined, '', 'x', '2026-13-45']) assert.equal(t(f, false), null, String(f));
  // El valor por defecto de hoy es el día de Colombia (reloj fijo, como m10 a de T15): a las 02:00 UTC del 08/11 son las 21:00 del
  // 07/11 en Colombia, así que una entrega guardada el 07/11 es «hoy» y no «hace 1 día».
  const DateReal = globalThis.Date;
  const fijo = DateReal.parse('2026-11-08T02:00:00Z');
  class DateFijo extends DateReal {
    constructor(...args) { super(...(args.length ? args : [fijo])); }
    static now() { return fijo; }
  }
  globalThis.Date = DateFijo;
  try {
    assert.equal(tr.textoEntregaTransito({ fecha_entrega_estimada: '2026-11-07T00:00:00', is_overdue: false }), 'Entrega hoy');
    assert.equal(tr.textoEntregaTransito({ fecha_entrega_estimada: '2026-11-06T00:00:00', is_overdue: true }), 'Vencido hace 1 día');
  } finally { globalThis.Date = DateReal; }
}

console.log('--- TEST 10 (B4 T16A): tarjetaTransito, la tarjeta del tablero de etapas (chips, tiempo y botón) ---');
{
  assert.equal(typeof tr.tarjetaTransito, 'function');
  const hoy = '2026-11-07';
  const normal = tr.tarjetaTransito(conEstados('casillero', ['COMPLETADO', 'EN_PROCESO']), { hoy });
  assert.equal(normal.numero, 'PEC-5');
  assert.equal(normal.tipo, 'PEC');
  assert.equal(normal.titulo, 'Acme');
  assert.equal(normal.subtitulo, 'PVEN-9');
  assert.equal(normal.monto, 1500000);
  assert.deepEqual(normal.chips, [{ texto: 'Casillero', tono: 'slate' }], 'el tipo de envío en un chip');
  assert.equal(normal.tiempo, 'Entrega en 3 días');
  assert.equal(normal.atrasada, false);
  assert.deepEqual(normal.accionPrincipal, { texto: 'Completar', tono: 'emerald' });
  assert.equal(normal.estado.label, 'En tránsito');
  // Vencido (del servidor) + directo + sin iniciar: 'Vencido' primero, luego 'Directo'; el botón es Iniciar.
  const vencida = tr.tarjetaTransito(conEstados('directo', [], { is_overdue: true, fecha_entrega_estimada: '2026-11-04' }), { hoy });
  assert.deepEqual(vencida.chips, [{ texto: 'Vencido', tono: 'rose' }, { texto: 'Directo', tono: 'slate' }]);
  assert.equal(vencida.tiempo, 'Vencido hace 3 días');
  assert.equal(vencida.atrasada, true);
  assert.deepEqual(vencida.accionPrincipal, { texto: 'Iniciar', tono: 'slate' });
  // Todas las etapas completadas: sin botón. Sin tipo_envio es por casillero (como el servidor). Sin proveedor, 'Sin proveedor'.
  const hecha = tr.tarjetaTransito(conEstados('directo', ['COMPLETADO', 'COMPLETADO', 'COMPLETADO'], { tipo_envio: null, supplier_name: ' ' }), { hoy });
  assert.equal(hecha.accionPrincipal, null);
  assert.equal(hecha.titulo, 'Sin proveedor');
  assert.equal(hecha.chips[0].texto, 'Casillero');
}

console.log('OK test_transito');
