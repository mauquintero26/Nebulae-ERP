/**
 * frontend/tests/test_estados_cotizacion.mjs
 * B4 T2 (KANBAN-ventas-listas, punto 3; RP4): una sola fuente de nombres y colores de los estados de la Cotización
 * (frontend/src/lib/estados-cotizacion.js), espejo de ETIQUETAS_ESTADO['COT'] (backend/app/core/textos_actividad.py).
 * La paridad con el backend la comprueba backend/tests/test_estados_cotizacion_paridad.py.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ESTADOS_COTIZACION, ESTADOS_COT_MANUALES, infoEstadoCotizacion,
} from '../src/lib/estados-cotizacion.js';

// Las 6 etiquetas de ETIQUETAS_ESTADO['COT'] (textos_actividad.py), en su orden.
const ETIQUETAS = [
  ['BORRADOR', 'Borrador'],
  ['ENVIADA', 'Enviada al cliente'],
  ['PENDIENTE_CONFIRMACION', 'Esperando confirmación del cliente'],
  ['CONFIRMADA', 'Confirmada'],
  ['RECHAZADA', 'Rechazada'],
  ['VENCIDA', 'Vencida'],
];

console.log('--- TEST 1: las etiquetas de los 6 estados son las de ETIQUETAS_ESTADO["COT"] ---');
{
  assert.deepEqual(Object.keys(ESTADOS_COTIZACION), ETIQUETAS.map(([e]) => e), 'los 6 estados, en el orden del backend');
  for (const [e, etiqueta] of ETIQUETAS) {
    assert.equal(ESTADOS_COTIZACION[e].label, etiqueta, e);
    assert.equal(infoEstadoCotizacion(e).label, etiqueta, e);
    assert.equal(infoEstadoCotizacion(e), ESTADOS_COTIZACION[e], `${e}: la misma entrada de la tabla`);
  }
  // RP4: la etiqueta única de PENDIENTE_CONFIRMACION (la pastilla hex de cotizacion-client.tsx decía «Esp. confirmación»)
  assert.equal(infoEstadoCotizacion('PENDIENTE_CONFIRMACION').label, 'Esperando confirmación del cliente');
}

console.log('--- TEST 2: forma {label, clases} con clases de Tailwind completas ---');
{
  for (const e of Object.keys(ESTADOS_COTIZACION)) {
    const info = ESTADOS_COTIZACION[e];
    assert.deepEqual(Object.keys(info).sort(), ['clases', 'label'], e);
    assert.match(info.clases.bg, /^bg-[a-z]+-\d+$/, e);
    assert.match(info.clases.text, /^text-[a-z]+-\d+$/, e);
    assert.match(info.clases.border, /^border-[a-z]+-\d+$/, e);
  }
}

console.log('--- TEST 3: un código desconocido sale humanizado y en gris (nunca crudo) ---');
{
  const i = infoEstadoCotizacion('PENDIENTE_ALGO');
  assert.equal(i.label, 'Pendiente algo');
  assert.deepEqual(i.clases, { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' });
  assert.equal(infoEstadoCotizacion('ALGO_NUEVO').label, 'Algo nuevo');
  for (const v of ['', null, undefined]) assert.equal(infoEstadoCotizacion(v).label, '', String(v));
  // las claves del prototipo no son estados
  assert.equal(infoEstadoCotizacion('constructor').label, 'Constructor');
  assert.equal(infoEstadoCotizacion('toString').label, 'Tostring');
  // T2 r1: el código se recorta antes de buscarlo (como etiqueta_estado de Python)
  assert.equal(infoEstadoCotizacion(' PENDIENTE_CONFIRMACION'), ESTADOS_COTIZACION.PENDIENTE_CONFIRMACION);
  assert.equal(infoEstadoCotizacion(' BORRADOR ').label, 'Borrador');
  assert.equal(infoEstadoCotizacion(' BORRADOR '), ESTADOS_COTIZACION.BORRADOR);
}

console.log('--- TEST 4: ESTADOS_COT_MANUALES = la constante de erp_ventas.py ---');
{
  assert.deepEqual([...ESTADOS_COT_MANUALES], ['BORRADOR', 'RECHAZADA', 'VENCIDA']);
  for (const e of ESTADOS_COT_MANUALES) assert.ok(Object.hasOwn(ESTADOS_COTIZACION, e), e);
}

console.log('--- TEST 5: todo es inmutable ---');
{
  assert.throws(() => { ESTADOS_COTIZACION.NUEVO = { label: 'x' }; }, TypeError);
  assert.throws(() => { ESTADOS_COTIZACION.BORRADOR.label = 'x'; }, TypeError);
  assert.throws(() => { ESTADOS_COTIZACION.BORRADOR.clases.bg = 'x'; }, TypeError);
  assert.throws(() => { ESTADOS_COT_MANUALES.push('CONFIRMADA'); }, TypeError);
  assert.throws(() => { infoEstadoCotizacion('ALGO_NUEVO').clases.bg = 'x'; }, TypeError);
  assert.equal(ESTADOS_COTIZACION.BORRADOR.label, 'Borrador');
}

console.log('--- TEST 6: JS puro (sin React ni DOM) y congelar importado, no copiado ---');
{
  const fuente = readFileSync(new URL('../src/lib/estados-cotizacion.js', import.meta.url), 'utf8');
  assert.ok(!/from ['"]react/.test(fuente), 'no importa React');
  assert.ok(!/\b(window|document)\./.test(fuente), 'no usa el DOM');
  assert.ok(/import \{[^}]*\bcongelar\b[^}]*\} from '\.\/estados-pedido\.js'/.test(fuente), 'congelar sale de estados-pedido.js');
  assert.ok(!/function congelar\(/.test(fuente), 'congelar no se copia');
}

console.log('\nOK: test_estados_cotizacion.mjs');
