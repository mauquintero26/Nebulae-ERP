/**
 * frontend/tests/test_etiquetas_solicitud.mjs
 * H10 (choque C16, rulings T6A-1): los valores GUARDADOS de tipos y modalidades no cambian (los usan el filtro de
 * Soporte, la lista de modalidades a crédito y el lead), las etiquetas son las de lib/etiquetas-ventas.js (un solo
 * helper; sus casos están en test_etiquetas_ventas.mjs) y pctAnticipoDeModalidad da lo mismo que el backend
 * (ventas_dinero.pct_anticipo_de_modalidad; backend/tests/test_estados_solicitud.py lo compara con node).
 * B2.1 (D7): crédito es solo la lista exacta (las modalidades a crédito de MODALIDADES_PAGO, más 'credito').
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
    ['  CONTADO ', 100], ['CRÉDITO', 0], ['Credito 30 Dias', 0], ['', null], ['   ', null],
    [undefined, null], ['Adelanto 50%', null],
    // B2.1 (D7): solo la lista exacta es crédito (sin tildes ni mayúsculas; ancho completo vía NFKD).
    ['CREDITO 30 DIAS', 0], ['credito', 0], ['  Crédito 60 días ', 0], ['Ｃｒｅｄｉｔｏ 30 dias', 0],
    // B2.1 T2 r1: los caracteres de formato (Cf: BOM, guion blando, U+200B) no cuentan, como en el backend.
    ['\ufeffCredito 30 dias', 0], ['Cre\u00addito 60 dias\u200b', 0],
    // Lo que empieza por 'cr' o dice 'credito' fuera de la lista cae en null (60 por defecto), como en el backend.
    ['Cruce de cuentas', null], ['Pago a credito', null], ['Credito 2 cuotas', null], ['cr. 90 dias', null],
    ['Credito 30d', null], ['Credito 90 dias', null], ['Credito  30 dias', null],
  ];
  for (const [v, esperado] of casos) assert.equal(pctAnticipoDeModalidad(v), esperado, String(v));
}

console.log('--- TEST 4: anticipo 0 exactamente cuando el predicado único dice crédito; la etiqueta no lo decide ---');
{
  const valores = [...MODALIDADES_PAGO, 'Credito 30 Dias', 'Credito 30d', 'Credito 60d', 'cr. 90 dias', 'Adelanto 50%',
    'Contra entrega', 'Descreditos', 'Cruce de cuentas', 'Credito 2 cuotas', 'Ｃｒｅｄｉｔｏ 30 dias', 'Pago a credito',
    'CREDITO 30 DIAS', 'credito'];
  for (const v of valores) {
    assert.equal(pctAnticipoDeModalidad(v) === 0, etiquetasVentas.esModalidadCredito(v), v);
  }
  // D7: la etiqueta sigue diciendo 'Crédito N días' con otras formas del plazo, pero el anticipo no sale de ella.
  for (const v of ['cr. 90 dias', 'Credito 30d', 'Credito 2 cuotas']) {
    assert.ok(etiquetaModalidad(v).startsWith('Crédito'), v);
    assert.equal(pctAnticipoDeModalidad(v), null, v);
  }
  assert.equal(etiquetaModalidad('Cruce de cuentas'), 'Cruce de cuentas');
  // Todas las modalidades del formulario tienen su % salvo 'Otro' (la pantalla usa 60, R2).
  assert.deepEqual(MODALIDADES_PAGO.map(pctAnticipoDeModalidad), [100, 60, 0, 0, null]);
  // La lista de crédito sale de MODALIDADES_PAGO: sus modalidades a crédito son exactamente las dos de 'Credito N dias'.
  assert.deepEqual(MODALIDADES_PAGO.filter(etiquetasVentas.esModalidadCredito), ['Credito 30 dias', 'Credito 60 dias']);
}

console.log('OK test_etiquetas_solicitud');
