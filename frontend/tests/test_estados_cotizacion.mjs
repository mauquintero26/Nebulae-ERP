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

console.log('--- TEST 7 (B4 T9, RP4): el ESTADOS de cotizacion-client.tsx toma la etiqueta de aquí y conserva sus hex ---');
{
  // ESTADOS sigue exportado con el molde hex {label, color, bg, border} (lo importan ventas/page.tsx, solicitud-client.tsx,
  // solicitud/[id] y cotizacion/[id]); la etiqueta es la de ESTADOS_COTIZACION y los colores, los hex de antes; un código
  // de la tabla sin hex va en gris.
  const fuente = readFileSync(new URL('../src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  assert.ok(/import \{[^}]*\bESTADOS_COTIZACION\b[^}]*\} from '@\/lib\/estados-cotizacion';/.test(fuente), 'importa la tabla única');
  assert.match(fuente, /export const ESTADOS: Record<string, \{ label: string; color: string; bg: string; border: string \}> = Object\.fromEntries\(\n\s*Object\.entries\(ESTADOS_COTIZACION\)\.map\(\(\[codigo, info\]\) => \[codigo, \{ label: info\.label, \.\.\.\(HEX_ESTADOS_COT\[codigo\] \?\? GRIS_ESTADO_COT\) \}\]\),\n\);/);
  assert.ok(fuente.includes("const GRIS_ESTADO_COT = { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };"), 'el gris de RP4');
  // Los hex de antes, uno por cada estado de la tabla (los mismos colores en el Hub, la lista de SC y los dos detalles).
  const HEX = {
    BORRADOR: "{ color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' }",
    ENVIADA: "{ color: '#92400e', bg: '#fef3c7', border: '#fde68a' }",
    PENDIENTE_CONFIRMACION: "{ color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' }",
    CONFIRMADA: "{ color: '#065f46', bg: '#f0fdf4', border: '#a7f3d0' }",
    RECHAZADA: "{ color: '#991b1b', bg: '#fef2f2', border: '#fecaca' }",
    VENCIDA: "{ color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' }",
  };
  const tabla = fuente.slice(fuente.indexOf('const HEX_ESTADOS_COT'), fuente.indexOf('const GRIS_ESTADO_COT'));
  assert.deepEqual(Object.keys(HEX), Object.keys(ESTADOS_COTIZACION), 'un hex por cada estado de la tabla única');
  for (const [codigo, hex] of Object.entries(HEX)) {
    assert.match(tabla, new RegExp(`\\n  ${codigo}:\\s*${hex.replace(/[{}]/g, '\\$&')},\\n`), codigo);
  }
  // Ninguna etiqueta escrita a mano (la de antes era «Esp. confirmación»), fuera de los comentarios.
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  assert.ok(!/label: '/.test(tabla) && !codigo.includes('Esp. confirmación'), 'sin etiquetas propias');
}

console.log('\nOK: test_estados_cotizacion.mjs');
