/**
 * Fechas del frontend en hora de Colombia (Bloque 3, T12: R10, C5, RP24). Una sola regla para todos: el documento del
 * cliente, las páginas públicas, el seguimiento y las tareas automáticas (T13 importa de aquí). JS plano para probarlo
 * con node (frontend/tests/test_fechas_colombia.mjs).
 *
 * - Un instante del API sin zona ('2026-10-05T14:00:00') es UTC: se lee con comoUTC de hub-ventas.js (R5). Con 'Z' o
 *   con desfase se respeta.
 * - La zona la pone Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota' }) (el patrón de estados-solicitud.js),
 *   no un desfase fijo.
 * - Una fecha de calendario ('AAAA-MM-DD': entrega estimada, validez) nunca se pasa a otra zona: no se corre de día.
 * - Lo que no se puede leer da '' (la pantalla decide si muestra '—').
 */

import { comoUTC } from './hub-ventas.js';

const ZONA = 'America/Bogota';
const FECHA_DE_CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})$/;
const INICIO_DE_CALENDARIO = /^(\d{4}-\d{2}-\d{2})/;
// Un instante: fecha y hora (con o sin zona). Una fecha sola no es un instante.
const CON_HORA = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

// Las partes de un instante en Colombia (hora de 0 a 23).
const PARTES_COLOMBIA = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
  hourCycle: 'h23',
});
// Los nombres de un día de calendario: se arma en UTC para que el día no cambie.
const PARTES_CALENDARIO = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
});

const partes = (formato, fecha) => Object.fromEntries(formato.formatToParts(fecha).map((p) => [p.type, p.value]));

/** Date UTC de un 'AAAA-MM-DD' que existe (no '2026-02-30'), o null. */
function diaDeCalendario(texto) {
  const m = FECHA_DE_CALENDARIO.exec(texto);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia ? f : null;
}

/** Date válido de un instante (Date, o texto con fecha y hora), o null. */
export function instante(valor) {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  if (!CON_HORA.test(texto)) return null;
  const fecha = new Date(comoUTC(texto));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** '8 de octubre de 2026' de un día de calendario (Date UTC de diaDeCalendario). */
function textoDeCalendario(fecha) {
  const p = partes(PARTES_CALENDARIO, fecha);
  return `${p.day} de ${p.month} de ${p.year}`;
}

/**
 * '8 de octubre de 2026'. Un 'AAAA-MM-DD' es ese mismo día; un instante (Date o texto con hora; sin zona = UTC) es el
 * día de Colombia ('2026-10-03T03:00:00Z' -> '2 de octubre de 2026'). Lo demás -> ''.
 * @param {unknown} valor
 * @returns {string}
 */
export function fechaLarga(valor) {
  if (typeof valor === 'string') {
    const dia = diaDeCalendario(valor.trim());
    if (dia) return textoDeCalendario(dia);
  }
  const fecha = instante(valor);
  if (!fecha) return '';
  const p = partes(PARTES_COLOMBIA, fecha);
  return `${p.day} de ${p.month} de ${p.year}`;
}

/**
 * La fecha de calendario 'AAAA-MM-DD' (o el inicio 'AAAA-MM-DD…' de un texto, como fecha_solo del backend) como
 * '21 de octubre de 2026', sin pasarla a ninguna zona. Lo demás -> ''.
 * @param {unknown} valor
 * @returns {string}
 */
export function fechaSolo(valor) {
  if (typeof valor !== 'string') return '';
  const m = INICIO_DE_CALENDARIO.exec(valor.trim());
  const dia = m ? diaDeCalendario(m[1]) : null;
  return dia ? textoDeCalendario(dia) : '';
}

/**
 * 'lunes 5 de octubre, 9:00 a. m.' (U16-seguimiento): día de la semana, día, mes y hora de Colombia, sin el año. Solo
 * para instantes (Date o texto con hora; sin zona = UTC). Termina en 'a. m.' / 'p. m.': quien lo pone al final de una
 * frase no agrega otro punto. Una fecha sin hora o inválida -> ''.
 * @param {unknown} iso
 * @returns {string}
 */
export function fechaHoraCO(iso) {
  const fecha = instante(iso);
  if (!fecha) return '';
  const p = partes(PARTES_COLOMBIA, fecha);
  return `${p.weekday} ${p.day} de ${p.month}, ${horaDePartes(p)}`;
}

/** '9:00 a. m.' de las partes de PARTES_COLOMBIA: la hora de fechaHoraCO y de fechaHoraLarga (una sola regla). */
function horaDePartes(p) {
  const hora = Number(p.hour) % 24;
  const doce = hora % 12 === 0 ? 12 : hora % 12;
  return `${doce}:${p.minute} ${hora < 12 ? 'a. m.' : 'p. m.'}`;
}

/**
 * '5 de octubre de 2026, 9:00 a. m.' (B3 T14 r1: el historial de la empresa): día, mes, AÑO y hora de Colombia, para
 * que un cambio del año pasado no se confunda con uno de este. Solo instantes (Date o texto con hora; sin zona = UTC);
 * una fecha sin hora o inválida -> ''. Termina en 'a. m.' / 'p. m.'.
 * @param {unknown} iso
 * @returns {string}
 */
export function fechaHoraLarga(iso) {
  const fecha = instante(iso);
  if (!fecha) return '';
  const p = partes(PARTES_COLOMBIA, fecha);
  return `${p.day} de ${p.month} de ${p.year}, ${horaDePartes(p)}`;
}

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const plural = (n, uno, varios) => `hace ${n} ${n === 1 ? uno : varios}`;

/**
 * 'hace un momento' (menos de un minuto, o un reloj adelantado), 'hace N minutos', 'hace N horas' o 'hace N días'
 * (singular con 1). Un instante sin zona es UTC. Inválido -> ''.
 * @param {unknown} iso
 * @param {Date | number} [ahora]
 * @returns {string}
 */
export function hace(iso, ahora = new Date()) {
  const fecha = instante(iso);
  const referencia = ahora instanceof Date ? ahora.getTime() : Number(ahora);
  if (!fecha || !Number.isFinite(referencia)) return '';
  const ms = referencia - fecha.getTime();
  if (ms < MINUTO) return 'hace un momento';
  if (ms < HORA) return plural(Math.floor(ms / MINUTO), 'minuto', 'minutos');
  if (ms < DIA) return plural(Math.floor(ms / HORA), 'hora', 'horas');
  return plural(Math.floor(ms / DIA), 'día', 'días');
}
