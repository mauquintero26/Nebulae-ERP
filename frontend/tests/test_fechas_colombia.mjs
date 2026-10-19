/**
 * frontend/tests/test_fechas_colombia.mjs
 * B3 T12 (R10, C5, RP24): las fechas del frontend en hora de Colombia, una sola regla para todos.
 * - fechaLarga(valor): '8 de octubre de 2026'. Un 'AAAA-MM-DD' no se corre de día; un instante (con 'Z', con desfase o
 *   sin zona, que se toma como UTC con comoUTC de hub-ventas.js) se pasa al día de Colombia.
 * - fechaSolo('AAAA-MM-DD'): la fecha de calendario sin zona (entrega estimada, validez).
 * - fechaHoraCO(iso): 'lunes 5 de octubre, 9:00 a. m.' (U16-seguimiento), en America/Bogota.
 * - hace(iso, ahora): 'hace un momento', 'hace N minutos', 'hace N horas', 'hace N días'.
 * - B3 T14 r1: fechaHoraLarga(iso): '5 de octubre de 2026, 9:00 a. m.' (con el año: el historial de la empresa).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fechaLarga, fechaSolo, fechaHoraCO, fechaHoraLarga, hace } from '../src/lib/fechas-colombia.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

console.log('--- TEST 1: fechaLarga ---');
{
  assert.equal(fechaLarga('2026-10-08'), '8 de octubre de 2026', 'un AAAA-MM-DD no se corre de día');
  assert.equal(fechaLarga('2026-10-03T03:00:00Z'), '2 de octubre de 2026', 'las 3 a. m. UTC son la víspera en Colombia');
  assert.equal(fechaLarga('2026-10-03T03:00:00'), '2 de octubre de 2026', 'sin zona = UTC');
  assert.equal(fechaLarga('2026-10-03 03:00:00.123456'), '2 de octubre de 2026');
  assert.equal(fechaLarga('2026-10-03T23:30:00-05:00'), '3 de octubre de 2026', 'con desfase se respeta');
  assert.equal(fechaLarga(new Date('2026-10-03T12:00:00Z')), '3 de octubre de 2026');
  assert.equal(fechaLarga('2026-01-01'), '1 de enero de 2026');
  assert.equal(fechaLarga('  2026-12-31  '), '31 de diciembre de 2026');
  for (const malo of [null, undefined, '', '   ', 'abc', '2026-02-30', '2026-13-01', 42, {}, new Date('x')]) {
    assert.equal(fechaLarga(malo), '', `inválido: ${String(malo)}`);
  }
}

console.log('--- TEST 2: fechaSolo ---');
{
  assert.equal(fechaSolo('2026-10-21'), '21 de octubre de 2026');
  assert.equal(fechaSolo('2026-03-01'), '1 de marzo de 2026');
  assert.equal(fechaSolo('2026-10-21T00:00:00'), '21 de octubre de 2026', 'solo la fecha, sin pasar a otra zona');
  for (const malo of [null, undefined, '', 'mañana', '2026-02-29', 20261021]) {
    assert.equal(fechaSolo(malo), '', `inválido: ${String(malo)}`);
  }
}

console.log('--- TEST 3: fechaHoraCO ---');
{
  const lunes = fechaHoraCO('2026-10-05T14:00:00');
  assert.ok(lunes.includes('lunes 5 de octubre'), lunes);
  assert.ok(lunes.includes('9:00'), lunes);
  assert.equal(lunes, 'lunes 5 de octubre, 9:00 a. m.');
  const sabado = fechaHoraCO('2026-10-03T20:15:00Z');
  assert.ok(sabado.includes('sábado 3 de octubre'), sabado);
  assert.ok(sabado.includes('3:15'), sabado);
  assert.equal(sabado, 'sábado 3 de octubre, 3:15 p. m.');
  assert.equal(fechaHoraCO('2026-10-05T17:00:00Z'), 'lunes 5 de octubre, 12:00 p. m.', 'mediodía');
  assert.equal(fechaHoraCO('2026-10-06T05:00:00Z'), 'martes 6 de octubre, 12:00 a. m.', 'medianoche');
  assert.equal(fechaHoraCO('2026-10-06T04:59:00Z'), 'lunes 5 de octubre, 11:59 p. m.');
  assert.equal(fechaHoraCO(new Date('2026-10-05T14:05:00Z')), 'lunes 5 de octubre, 9:05 a. m.');
  for (const malo of [null, undefined, '', 'abc', '2026-10-05', 7]) {
    assert.equal(fechaHoraCO(malo), '', `inválido o sin hora: ${String(malo)}`);
  }
}

console.log('--- TEST 4: hace ---');
{
  const ahora = new Date('2026-10-05T14:00:00Z');
  assert.equal(hace('2026-10-05T13:56:00', ahora), 'hace 4 minutos');
  assert.equal(hace('2026-10-05T11:00:00', ahora), 'hace 3 horas');
  assert.equal(hace('2026-10-03T14:00:00', ahora), 'hace 2 días');
  assert.equal(hace('2026-10-05T13:56:00', ahora), hace('2026-10-05T13:56:00Z', ahora), 'sin zona = UTC');
  assert.equal(hace('2026-10-05T13:59:30Z', ahora), 'hace un momento');
  assert.equal(hace('2026-10-05T13:59:00Z', ahora), 'hace 1 minuto');
  assert.equal(hace('2026-10-05T13:00:00Z', ahora), 'hace 1 hora');
  assert.equal(hace('2026-10-04T13:00:00Z', ahora), 'hace 1 día');
  assert.equal(hace('2026-10-05T14:10:00Z', ahora), 'hace un momento', 'un reloj adelantado no da negativo');
  assert.equal(hace('2026-10-05T13:56:00Z', ahora.getTime()), 'hace 4 minutos', 'ahora también como número');
  assert.equal(hace(null, ahora), '');
  assert.equal(hace('abc', ahora), '');
}

console.log('--- TEST 5: una sola regla (RP24): comoUTC de hub-ventas.js e Intl con America/Bogota ---');
{
  const fuente = readFileSync(join(SRC, 'lib', 'fechas-colombia.js'), 'utf8');
  assert.match(fuente, /import\s*\{[^}]*\bcomoUTC\b[^}]*\}\s*from\s*'\.\/hub-ventas\.js'/);
  assert.ok(fuente.includes("'America/Bogota'"));
  assert.doesNotMatch(fuente, /-\s*5\s*\*\s*3600|-\s*18000000|UTC\s*-\s*5/, 'sin desfase fijo de -5 h');
}

console.log('--- TEST 6: fechaHoraLarga (con el año, en hora de Colombia; T14 r1) ---');
{
  assert.equal(fechaHoraLarga('2026-10-05T14:00:00Z'), '5 de octubre de 2026, 9:00 a. m.');
  assert.equal(fechaHoraLarga('2026-10-05T14:00:00'), '5 de octubre de 2026, 9:00 a. m.', 'sin zona = UTC');
  assert.equal(fechaHoraLarga('2026-01-01T04:30:00Z'), '31 de diciembre de 2025, 11:30 p. m.',
    'el día y el año de Colombia, no los de UTC');
  assert.equal(fechaHoraLarga('2026-10-05T17:00:00Z'), '5 de octubre de 2026, 12:00 p. m.', 'mediodía');
  assert.equal(fechaHoraLarga('2026-10-06T05:00:00Z'), '6 de octubre de 2026, 12:00 a. m.', 'medianoche');
  assert.equal(fechaHoraLarga(new Date('2026-10-05T14:05:00Z')), '5 de octubre de 2026, 9:05 a. m.');
  // La hora es la misma de fechaHoraCO (una sola regla).
  assert.ok(fechaHoraCO('2026-10-03T20:15:00Z').endsWith(fechaHoraLarga('2026-10-03T20:15:00Z').split(', ')[1]));
  for (const malo of [null, undefined, '', 'abc', '2026-10-05', 7, new Date('x')]) {
    assert.equal(fechaHoraLarga(malo), '', `inválido o sin hora: ${String(malo)}`);
  }
}

console.log('✓ Todas las pruebas de fechas de Colombia pasaron.');
