/**
 * frontend/tests/test_tareas.mjs
 * B3 T13 (TAREAS punto 5): lib/tareas.js con revisionAtrasada(estado, ahora). El estado es el `data` de
 * GET /ventas/tareas/estado (T10: {status, data}; apiFetch no lo desenvuelve): {activas_en_servidor, intervalo_min,
 * ultima_revision ('…Z' o null), resumen}. Atrasada = activas en el servidor y sin revisión, o con la última hace más de
 * max(30 min, 3 × intervalo). hace() vive en fechas-colombia.js (T12, C5).
 */

import assert from 'node:assert/strict';
import { revisionAtrasada, MINUTOS_MINIMOS_ATRASO } from '../src/lib/tareas.js';
import { hace } from '../src/lib/fechas-colombia.js';

const AHORA = new Date('2026-10-06T15:00:00Z');
const haceMin = (n) => new Date(AHORA.getTime() - n * 60000).toISOString();
const estado = (extra) => ({ activas_en_servidor: true, intervalo_min: 10, ultima_revision: haceMin(5), resumen: null,
  ...extra });

console.log('--- TEST 1: los casos del diseño ---');
{
  assert.equal(revisionAtrasada(estado({ ultima_revision: haceMin(5) }), AHORA), false, '5 min: al día');
  assert.equal(revisionAtrasada(estado({ ultima_revision: haceMin(45) }), AHORA), true, '45 min: atrasada');
  assert.equal(revisionAtrasada(estado({ ultima_revision: null }), AHORA), true, 'sin revisión: atrasada');
  assert.equal(revisionAtrasada(estado({ activas_en_servidor: false, ultima_revision: haceMin(600) }), AHORA), false,
    'apagada en el servidor: nunca atrasada');
  assert.equal(revisionAtrasada(estado({ activas_en_servidor: false, ultima_revision: null }), AHORA), false);
}

console.log('--- TEST 2: el límite es max(30 min, 3 × intervalo), estricto ---');
{
  assert.equal(MINUTOS_MINIMOS_ATRASO, 30);
  assert.equal(revisionAtrasada(estado({ ultima_revision: haceMin(30) }), AHORA), false, 'justo 30: todavía no');
  assert.equal(revisionAtrasada(estado({ ultima_revision: haceMin(31) }), AHORA), true);
  // Con un intervalo de 20 min el límite es 60.
  assert.equal(revisionAtrasada(estado({ intervalo_min: 20, ultima_revision: haceMin(45) }), AHORA), false);
  assert.equal(revisionAtrasada(estado({ intervalo_min: 20, ultima_revision: haceMin(61) }), AHORA), true);
  // Un intervalo que no sirve no baja el mínimo de 30.
  for (const malo of [null, undefined, 'x', -5, 0]) {
    assert.equal(revisionAtrasada(estado({ intervalo_min: malo, ultima_revision: haceMin(25) }), AHORA), false);
    assert.equal(revisionAtrasada(estado({ intervalo_min: malo, ultima_revision: haceMin(35) }), AHORA), true);
  }
}

console.log('--- TEST 3: la hora del API sin zona es UTC; ahora como Date o en ms; por defecto, el reloj ---');
{
  const sinZona = haceMin(45).replace('Z', '').replace(/\.\d+$/, '');
  assert.equal(revisionAtrasada(estado({ ultima_revision: sinZona }), AHORA), true);
  assert.equal(revisionAtrasada(estado({ ultima_revision: haceMin(5).replace('Z', '') }), AHORA.getTime()), false);
  assert.equal(revisionAtrasada(estado({ ultima_revision: new Date().toISOString() })), false);
  // Una fecha que no se puede leer cuenta como sin revisión.
  assert.equal(revisionAtrasada(estado({ ultima_revision: 'ayer' }), AHORA), true);
  // Sin estado (el GET falló) no se avisa nada.
  for (const nada of [null, undefined, {}, 'x']) assert.equal(revisionAtrasada(nada, AHORA), false);
  // La línea de la pantalla se arma con hace() de fechas-colombia.js.
  assert.equal(hace(estado({ ultima_revision: haceMin(4) }).ultima_revision, AHORA), 'hace 4 minutos');
}

console.log('--- TEST 4 (ronda r1): la misma lectura de instantes que hace() (instante de fechas-colombia.js) ---');
{
  // Un Date en ultima_revision es un instante (antes contaba como «sin revisión» y salía atrasada).
  assert.equal(revisionAtrasada(estado({ ultima_revision: new Date(haceMin(2)) }), AHORA), false);
  assert.equal(revisionAtrasada(estado({ ultima_revision: new Date(haceMin(45)) }), AHORA), true);
  assert.equal(revisionAtrasada(estado({ ultima_revision: new Date('x') }), AHORA), true);
  // Una fecha sola (sin hora) no es un instante: cuenta como sin revisión, aunque sea de hoy.
  const recienEmpezado = new Date('2026-10-06T00:10:00Z');
  assert.equal(revisionAtrasada(estado({ ultima_revision: '2026-10-06' }), recienEmpezado), true);
  assert.equal(revisionAtrasada(estado({ ultima_revision: '2026-10-06T00:05:00Z' }), recienEmpezado), false);
  // Un `ahora` en texto ISO también se lee (con 'Z' o sin zona, que es UTC).
  assert.equal(revisionAtrasada(estado({ ultima_revision: haceMin(5) }), '2026-10-06T15:00:00Z'), false);
  assert.equal(revisionAtrasada(estado({ ultima_revision: haceMin(45) }), '2026-10-06T15:00:00Z'), true);
  assert.equal(revisionAtrasada(estado({ ultima_revision: haceMin(45) }), '2026-10-06T15:00:00'), true);
  // Un dato del servidor que es una clave heredada (o basura) no se lee como fecha.
  assert.equal(revisionAtrasada(estado({ ultima_revision: 'toString' }), AHORA), true);
}

console.log('OK test_tareas.mjs');
