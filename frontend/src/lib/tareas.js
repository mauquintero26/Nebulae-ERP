/**
 * Revisión automática del servidor (Bloque 3, T13: TAREAS punto 5). Lógica pura para la línea de estado de la
 * Configuración del Hub (T16), con su prueba de node (frontend/tests/test_tareas.mjs). El «hace N minutos» de esa línea
 * es hace() de fechas-colombia.js (T12, C5).
 *
 * `estado` es el `data` de GET /ventas/tareas/estado (T10 responde {status, data} y apiFetch no lo desenvuelve):
 * {activas_en_servidor (tareas_habilitadas() del servidor, RP30), intervalo_min, ultima_revision ('…Z' o null),
 * resumen}.
 */

import { hace, instante } from './fechas-colombia.js';

/** Menos que esto nunca es atraso (el diseño: max(30 min, 3 × intervalo)). */
export const MINUTOS_MINIMOS_ATRASO = 30;
const MINUTO = 60 * 1000;

/**
 * Si la revisión automática está atrasada (recuadro ámbar «…los recordatorios no están saliendo»): solo si está
 * activa en este servidor, y no hay ninguna revisión (o no se puede leer como instante) o la última fue hace más de
 * max(30 min, 3 × intervalo_min). Apagada en el servidor (o sin estado) nunca está atrasada: la pantalla muestra el
 * recuadro gris de «apagada».
 * r1: las fechas se leen con instante() de fechas-colombia.js, la misma regla de hace(): un Date o un texto con fecha
 * Y hora (sin zona = UTC); una fecha sola ('2026-10-06') no es un instante y cuenta como sin revisión. `ahora` puede
 * ser un Date, milisegundos o un texto ISO.
 * @param {unknown} estado
 * @param {Date | number | string} [ahora]
 * @returns {boolean}
 */
export function revisionAtrasada(estado, ahora = new Date()) {
  if (typeof estado !== 'object' || estado === null || !estado.activas_en_servidor) return false;
  const referencia = typeof ahora === 'number' ? ahora : (instante(ahora)?.getTime() ?? NaN);
  if (!Number.isFinite(referencia)) return false;
  const ultima = instante(estado.ultima_revision);
  if (!ultima) return true;
  const intervalo = Number(estado.intervalo_min);
  const minutos = Math.max(MINUTOS_MINIMOS_ATRASO, Number.isFinite(intervalo) && intervalo > 0 ? 3 * intervalo : 0);
  return referencia - ultima.getTime() > minutos * MINUTO;
}

// ─── B3 T16 (TAREAS punto 6): el pie de «Seguimiento de confirmación» en la Configuración del Hub ───────────────

const AVISA_AL_ADMINISTRADOR = 'los recordatorios no están saliendo. Avísale a quien administra el servidor.';

/**
 * La línea de estado de la revisión automática, con el `data` de GET /ventas/tareas/estado:
 * - 'apagada' (recuadro gris): activas_en_servidor es false (tareas_habilitadas() del servidor, RP30);
 * - 'atrasada' (recuadro ámbar): revisionAtrasada, con «no corre desde hace N …» o «todavía no ha corrido»;
 * - 'al_dia' (texto gris): «Última revisión automática: hace N minutos.».
 * `ahora` como en revisionAtrasada (Date, milisegundos o texto ISO). null sin estado (el GET falló).
 * @param {unknown} estado
 * @param {Date | number | string} [ahora]
 * @returns {{caso: 'al_dia' | 'atrasada' | 'apagada', texto: string} | null}
 */
export function lineaRevision(estado, ahora = new Date()) {
  if (typeof estado !== 'object' || estado === null) return null;
  const e = /** @type {any} */ (estado);
  if (!e.activas_en_servidor) {
    return { caso: 'apagada', texto: 'La revisión automática está apagada en este servidor. Los recordatorios solo '
      + 'salen desde el servidor de producción.' };
  }
  const referencia = typeof ahora === 'number' ? ahora : (instante(ahora)?.getTime() ?? Date.now());
  const desde = hace(e.ultima_revision, referencia);
  if (revisionAtrasada(e, referencia)) {
    return { caso: 'atrasada', texto: desde
      ? `La revisión automática no corre desde ${desde}: ${AVISA_AL_ADMINISTRADOR}`
      : `La revisión automática todavía no ha corrido en este servidor: ${AVISA_AL_ADMINISTRADOR}` };
  }
  return { caso: 'al_dia', texto: `Última revisión automática: ${desde}.` };
}

/**
 * Hueco 4: el recuadro ámbar de «sin medios» (la última revisión no pudo enviar recordatorios porque no hay WhatsApp
 * automático ni correo del sistema: resumen.seguimiento_confirmacion.omitido === 'sin_medios'), o null.
 * @param {unknown} estado el `data` de GET /ventas/tareas/estado
 * @returns {string | null}
 */
export function avisoSinMedios(estado) {
  const resumen = typeof estado === 'object' && estado !== null ? /** @type {any} */ (estado).resumen : null;
  const seguimiento = typeof resumen === 'object' && resumen !== null ? resumen.seguimiento_confirmacion : null;
  if (typeof seguimiento !== 'object' || seguimiento === null || seguimiento.omitido !== 'sin_medios') return null;
  return 'Los recordatorios no pueden salir: falta configurar el WhatsApp automático o el correo del sistema.';
}
