/**
 * frontend/tests/test_etiquetas_solicitud.mjs
 * H10 (choque C16, rulings T6A-1): los valores GUARDADOS de tipos y modalidades no cambian (los usan el filtro de
 * Soporte, el prefijo 'Cr' de R2 y el lead), las etiquetas son las de lib/etiquetas-ventas.js (un solo helper; sus
 * casos están en test_etiquetas_ventas.mjs) y pctAnticipoDeModalidad da lo mismo que el backend
 * (ventas_dinero.pct_anticipo_de_modalidad; backend/tests/test_estados_solicitud.py lo compara con node).
 */

import assert from 'node:assert/strict';
import {
  TIPOS_SC, MODALIDADES_PAGO, pctAnticipoDeModalidad, etiquetaTipoSC, etiquetaModalidad,
} from '../src/lib/etiquetas-solicitud.js';
import * as etiquetasVentas from '../src/lib/etiquetas-ventas.js';

console.log('--- TEST 1: los valores guardados no cambian ---');
{
  assert.deepEqual([...TIPOS_SC], ['Cotizacion de Producto', 'Seguimiento', 'Programar Entrega', 'Devolucion de Producto',
    'Soporte Tecnico', 'Nuevo Lead']);
  assert.deepEqual([...MODALIDADES_PAGO], ['Contado', '60/40 (60% anticipo - 40% pendiente)', 'Credito 30 dias',
    'Credito 60 dias', 'Otro']);
  assert.ok(Object.isFrozen(TIPOS_SC) && Object.isFrozen(MODALIDADES_PAGO));
  assert.throws(() => { TIPOS_SC.push('Otro'); }, TypeError);
}

console.log('--- TEST 2: las etiquetas son las de etiquetas-ventas.js (un solo helper) ---');
{
  assert.equal(etiquetaTipoSC, etiquetasVentas.etiquetaTipoSolicitud);
  assert.equal(etiquetaModalidad, etiquetasVentas.etiquetaModalidad);
  // Cada valor guardado tiene una etiqueta legible distinta del valor cuando le falta la tilde.
  assert.equal(etiquetaTipoSC('Cotizacion de Producto'), 'Cotización de producto');
  assert.equal(etiquetaModalidad('Credito 30 dias'), 'Crédito 30 días');
}

console.log('--- TEST 3: paridad de pctAnticipoDeModalidad con el backend (R2) ---');
{
  // Los casos de backend/tests/test_anticipo_modalidad.py (test_pct_anticipo_de_modalidad y ..._sin_tildes_ni_mayusculas).
  const casos = [
    ['60/40 (60% anticipo - 40% pendiente)', 60], ['Contado', 100], ['Credito 30 dias', 0], ['Crédito 60 Días', 0],
    [null, null], ['Otro', null],
    ['  CONTADO ', 100], ['CRÉDITO', 0], ['Credito 30 Dias', 0], ['cr. 90 dias', 0], ['', null], ['   ', null],
    [undefined, null], ['Credito 30d', 0], ['Adelanto 50%', null],
  ];
  for (const [v, esperado] of casos) assert.equal(pctAnticipoDeModalidad(v), esperado, String(v));
}

console.log('--- TEST 4: la etiqueta dice Crédito exactamente cuando el anticipo es 0 ---');
{
  const valores = [...MODALIDADES_PAGO, 'Credito 30 Dias', 'Credito 30d', 'Credito 60d', 'cr. 90 dias', 'Adelanto 50%',
    'Contra entrega', 'Descreditos'];
  for (const v of valores) {
    assert.equal(etiquetaModalidad(v).startsWith('Crédito'), pctAnticipoDeModalidad(v) === 0, v);
  }
  // Todas las modalidades del formulario tienen su % salvo 'Otro' (la pantalla usa 60, R2).
  assert.deepEqual(MODALIDADES_PAGO.map(pctAnticipoDeModalidad), [100, 60, 0, 0, null]);
}

console.log('OK test_etiquetas_solicitud');
