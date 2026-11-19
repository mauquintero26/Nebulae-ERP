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
import { fechaLarga, fechaSolo, fechaHoraCO, fechaHoraLarga, hace, diaColombia } from '../src/lib/fechas-colombia.js';
import * as fechasLib from '../src/lib/fechas-colombia.js';

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

console.log('--- B3 T17 TEST 7: diaColombia (el día de hoy en Colombia, para la validez de la cotización) ---');
{
  assert.equal(diaColombia(new Date('2026-10-08T15:00:00Z')), '2026-10-08');
  // 11 p. m. del 8 de octubre en Colombia son las 4 a. m. del 9 en UTC: sigue siendo el 8.
  assert.equal(diaColombia(new Date('2026-10-09T04:00:00Z')), '2026-10-08');
  assert.equal(diaColombia(new Date('2026-10-09T05:00:00Z')), '2026-10-09', 'medianoche en Colombia');
  assert.equal(diaColombia(Date.UTC(2026, 0, 1, 4, 59)), '2025-12-31', 'también con milisegundos');
  assert.match(diaColombia(), /^\d{4}-\d{2}-\d{2}$/, 'sin argumento, hoy');
  for (const malo of [new Date('x'), NaN, 'abc', null]) assert.equal(diaColombia(malo), '', String(malo));
}

console.log('--- B4 T8: fechaCorta (las columnas de fecha de las tablas: «5 nov 2026») ---');
{
  const { fechaCorta } = await import('../src/lib/fechas-colombia.js');
  assert.equal(typeof fechaCorta, 'function', 'fechaCorta existe');
  // El mismo día que fechaLarga, con el mes en tres letras y sin «de»: cabe en una columna de 104 px.
  assert.equal(fechaCorta('2026-11-05'), '5 nov 2026', 'un AAAA-MM-DD no se corre de día');
  assert.equal(fechaCorta('2026-10-03T03:00:00Z'), '2 oct 2026', 'las 3 a. m. UTC son la víspera en Colombia');
  assert.equal(fechaCorta('2026-10-03T03:00:00'), '2 oct 2026', 'sin zona = UTC');
  assert.equal(fechaCorta('2026-10-03 03:00:00.123456'), '2 oct 2026');
  assert.equal(fechaCorta('2026-10-03T23:30:00-05:00'), '3 oct 2026', 'con desfase se respeta');
  assert.equal(fechaCorta(new Date('2026-12-31T12:00:00Z')), '31 dic 2026');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  meses.forEach((mes, i) => assert.equal(fechaCorta(`2026-${String(i + 1).padStart(2, '0')}-15`), `15 ${mes} 2026`, mes));
  for (const malo of [null, undefined, '', '   ', 'abc', '2026-02-30', '2026-13-01', 42, {}, new Date('x')]) {
    assert.equal(fechaCorta(malo), '', String(malo));
  }
  // Para el mismo valor, el mismo día que fechaLarga.
  for (const v of ['2026-10-08', '2026-10-03T03:00:00Z', '2026-01-01T04:59:00Z']) {
    assert.equal(fechaCorta(v).split(' ')[0], fechaLarga(v).split(' ')[0], v);
  }
}

console.log('--- TEST (B4 T18 r1, m13): horaCO, la hora de Colombia con la regla única ---');
{
  assert.equal(typeof fechasLib.horaCO, 'function', 'horaCO existe');
  assert.equal(fechasLib.horaCO('2026-10-04T03:00:00'), '10:00 p. m.', 'sin zona es UTC: las 3 a. m. UTC son las 10 p. m. del día anterior en Colombia');
  assert.equal(fechasLib.horaCO('2026-10-04T15:05:00Z'), '10:05 a. m.');
  assert.equal(fechasLib.horaCO('2026-10-04T17:00:00Z'), '12:00 p. m.', 'mediodía');
  assert.equal(fechasLib.horaCO('2026-10-04T05:30:00Z'), '12:30 a. m.', 'medianoche');
  assert.equal(fechasLib.horaCO(new Date('2026-10-04T14:00:00Z')), '9:00 a. m.');
  for (const malo of [null, undefined, '', 'no es fecha', '2026-10-04', 5]) assert.equal(fechasLib.horaCO(malo), '', String(malo));
  assert.ok(fechaHoraCO('2026-10-05T14:00:00Z').endsWith(fechasLib.horaCO('2026-10-05T14:00:00Z')), 'la misma hora que fechaHoraCO');
}

console.log('--- TEST T24 (B4 T24, FINAL-m30 y F3): el día de negocio, la aritmética de días y el día corto, una sola vez ---');
{
  const { diaDeCalendario, diaDeNegocio, sumarDias, diasEntre, textoDiaCorto } = fechasLib;
  // F3: diaDeCalendario, exportado (analisis.js ya no lo copia): el Date UTC de un 'AAAA-MM-DD' que existe, o null.
  assert.equal(diaDeCalendario('2026-11-10')?.getTime(), Date.UTC(2026, 10, 10));
  for (const malo of ['2026-02-30', '2026-1-10', '2026-11-10T00:00:00', '', null, 20261110]) assert.equal(diaDeCalendario(malo), null, String(malo));
  // diaDeNegocio: los 10 primeros caracteres de una fecha de negocio, sin pasarla a ninguna zona; un día que no existe, ''.
  assert.equal(diaDeNegocio('2026-11-10T00:00:00'), '2026-11-10');
  assert.equal(diaDeNegocio('  2026-11-10 '), '2026-11-10');
  assert.equal(diaDeNegocio('2026-11-10T23:59:59Z'), '2026-11-10', 'no se corre a Colombia');
  for (const malo of ['2026-02-30', '10/11/2026', 'x2026-11-10', '', null, undefined, 5]) assert.equal(diaDeNegocio(malo), '', String(malo));
  // sumarDias y diasEntre: días de calendario en UTC (sin horas de verano); lo que no es un día, '' y null.
  assert.equal(sumarDias('2026-12-30', 3), '2027-01-02');
  assert.equal(sumarDias('2028-03-01', -1), '2028-02-29');
  assert.equal(sumarDias('2026-11-10', 0), '2026-11-10');
  for (const [dia, n] of [['2026-02-30', 1], ['', 1], ['2026-11-10', 1.5], ['2026-11-10', NaN]]) assert.equal(sumarDias(dia, n), '', `${dia} ${n}`);
  assert.equal(diasEntre('2026-11-10', '2026-11-13'), 3);
  assert.equal(diasEntre('2026-11-13', '2026-11-10'), -3);
  assert.equal(diasEntre('2026-03-01', '2026-03-31'), 30, 'sin horas de verano');
  assert.equal(diasEntre('2026-11-10', '2026-02-30'), null);
  // textoDiaCorto: el día corto o '—' (las cuatro copias de antes: Compras dos veces, Campañas con '-' y Entregas).
  assert.equal(textoDiaCorto('2026-11-20T00:00:00'), '20 nov 2026');
  for (const nada of [null, '', 'x', '2026-02-30']) assert.equal(textoDiaCorto(nada), '—', String(nada));
  // Las libs y las pantallas usan estas (sin copias): diaPec y diaDeNegocio de las libs son la misma función.
  const estadosCompras = await import('../src/lib/estados-compras.js');
  const listasVentas = await import('../src/lib/listas-ventas.js');
  assert.equal(estadosCompras.diaPec, diaDeNegocio, 'diaPec es diaDeNegocio');
  assert.equal(listasVentas.diaDeNegocio, diaDeNegocio);
  const leer = (ruta) => readFileSync(join(SRC, ruta), 'utf8').replace(/\r\n/g, '\n');
  for (const ruta of ['lib/flujo-compras.js', 'lib/transito.js', 'lib/listas-ventas.js', 'lib/analisis.js', 'lib/estados-compras.js']) {
    const f = leer(ruta);
    assert.ok(!/const MS_DIA|Date\.UTC\(/.test(f), `${ruta}: sin aritmética de días propia`);
  }
  assert.ok(!/INICIO_DIA_DE_NEGOCIO|function sumarDias/.test(leer('lib/listas-ventas.js')));
  for (const ruta of ['app/dashboard/compras/columnas-pec.tsx', 'app/dashboard/compras/pedidos/[id]/page.tsx', 'app/dashboard/marketing/campanas/page.tsx',
    'lib/entregas.js']) {
    const f = leer(ruta);
    assert.match(f, /textoDiaCorto/, `${ruta}: textoDiaCorto`);
    assert.ok(!/fechaCorta\((?:diaPec|diaDeNegocio)\(/.test(f), `${ruta}: sin su copia`);
  }
  // F3: agrupar los miles, una sola vez (agruparMiles de pesos.js, la de formatoPesos).
  const pesos = await import('../src/lib/pesos.js');
  assert.equal(pesos.agruparMiles(1234567), '1.234.567');
  assert.equal(pesos.agruparMiles(999), '999');
  assert.equal((leer('lib/pesos.js') + leer('lib/kpis.js')).match(/\\B\(\?=\(\\d\{3\}\)\+\(\?!\\d\)\)/g)?.length, 1, 'la expresión, una vez');
}

console.log('--- B4 T24 f4 (FINAL-m22): el CRM y la Agenda dicen «hace…» con hace(), que lee la fecha del API (sin zona) como UTC ---');
{
  // updated_at de _lead_to_dict y created_at de las SC del perfil 360 son un isoformat UTC sin «Z» (con microsegundos).
  const ahora = new Date('2026-10-05T14:00:00Z');   // 09:00 en Colombia
  assert.equal(hace('2026-10-05T13:56:00.123456', ahora), 'hace 3 minutos', 'el lead cambiado hace 4 minutos (UTC sin zona)');
  assert.equal(hace('2026-10-05T09:00:00', ahora), 'hace 5 horas', 'las 09:00 UTC son hace 5 horas, no «ahora»');
  assert.equal(hace(null, ahora), '', 'sin fecha, nada');
  const leer = (ruta) => readFileSync(join(SRC, ruta), 'utf8').replace(/\r\n/g, '\n');
  for (const ruta of ['app/dashboard/crm/page.tsx', 'app/dashboard/agenda/page.tsx']) {
    const f = leer(ruta);
    assert.ok(!/function timeAgo\b|\btimeAgo\(/.test(f), `${ruta}: sin timeAgo (new Date(iso) tomaba la hora UTC como de Colombia)`);
    assert.match(f, /import \{[^}]*\bhace\b[^}]*\} from '@\/lib\/fechas-colombia';/, `${ruta}: hace de fechas-colombia`);
  }
  const crm = leer('app/dashboard/crm/page.tsx');
  assert.ok(crm.includes('<span className="text-xs text-slate-400">{hace(selectedLead.updated_at)}</span>'), 'el Drawer del lead');
  const agenda = leer('app/dashboard/agenda/page.tsx');
  assert.ok(agenda.includes("{sc.tipo_solicitud || 'Cotización'} · {hace(sc.created_at)}"), 'las SC del perfil 360');
  assert.ok(agenda.includes('{it.fecha && <span className="text-[10px] text-slate-400 shrink-0">{hace(it.fecha)}</span>}'), 'la línea de tiempo');
}

console.log('--- B4.1 T6 (P8): diaEditadoParaGuardar — el día editado viaja como día, sin hora ---');
{
  assert.equal(fechasLib.diaEditadoParaGuardar('2026-11-30', '2026-11-24T00:00:00'), '2026-11-30');
  assert.equal(fechasLib.diaEditadoParaGuardar('2026-11-24', '2026-11-24T00:00:00'), null, 'el mismo día: nada que guardar');
  assert.equal(fechasLib.diaEditadoParaGuardar('', '2026-11-24T00:00:00'), null);
  assert.equal(fechasLib.diaEditadoParaGuardar('2026-02-30', '2026-11-24T00:00:00'), null, 'un día que no existe');
  assert.equal(fechasLib.diaEditadoParaGuardar(5, '2026-11-24T00:00:00'), null);
  assert.equal(fechasLib.diaEditadoParaGuardar(' 2026-11-30 ', null), '2026-11-30');
}

console.log('✓ Todas las pruebas de fechas de Colombia pasaron.');
