/**
 * «Pedir cambios» visto por el asesor (Bloque 3, T12: H28-cambios punto 7, C9). JS plano para probarlo con node
 * (frontend/tests/test_cambios_cliente.mjs); lo usan la tarjeta de la SC (T18), la de la COT (T17) y la pastilla de la
 * lista de solicitudes.
 *
 * cambios_cliente llega en el detalle de la SC (_sc_dict) y de la COT (get_cotizacion) como {at ('…Z'), tipo
 * ('CAMBIOS' | 'NO_LA_NECESITA'), comentario} o null (erp_ventas._cambios_cliente_dict). Se muestra mientras el
 * documento sigue en manos del asesor, la misma regla del backend (_ESTADOS_CON_CAMBIOS_VIGENTES): la SC en Asignada o
 * Nueva (BORRADOR) y la COT en Borrador. Al reenviarla, el servidor limpia la marca.
 */

import { fechaHoraCO } from './fechas-colombia.js';

const ESTADOS_CON_CAMBIOS_VIGENTES = Object.freeze({ SC: Object.freeze(['ASIGNADA', 'BORRADOR']),
  COT: Object.freeze(['BORRADOR']) });

/** El cambios_cliente vigente de `doc` ('SC' o 'COT'), o null. */
function cambiosVigentes(doc, tipoDoc) {
  const cambios = doc?.cambios_cliente;
  if (!cambios || typeof cambios !== 'object') return null;
  const estados = ESTADOS_CON_CAMBIOS_VIGENTES[/** @type {'SC'|'COT'} */ (tipoDoc)] ?? [];
  return estados.includes(doc.estado) ? cambios : null;
}

/**
 * La tarjeta de lo que pidió el cliente desde su enlace, o null si no hay cambios vigentes:
 * {tono: 'ambar' (pidió cambios) | 'rosa' (ya no la necesita), titulo ('El cliente pidió cambios' / 'El cliente dice
 * que ya no la necesita'), texto (su comentario, o null), fecha ('sábado 3 de octubre, 3:15 p. m.', hora de
 * Colombia), at (el instante tal cual)}. El comentario es texto del cliente: la pantalla lo muestra como texto.
 * @param {any} doc la SC o la COT
 * @param {'SC' | 'COT'} [tipoDoc]
 * @returns {{tono: 'ambar' | 'rosa', titulo: string, texto: string | null, fecha: string, at: string | null} | null}
 */
export function avisoCambiosCliente(doc, tipoDoc = 'SC') {
  const cambios = cambiosVigentes(doc, tipoDoc);
  if (!cambios) return null;
  const noLaNecesita = cambios.tipo === 'NO_LA_NECESITA';
  const comentario = typeof cambios.comentario === 'string' && cambios.comentario.trim() ? cambios.comentario : null;
  return {
    tono: noLaNecesita ? 'rosa' : 'ambar',
    titulo: noLaNecesita ? 'El cliente dice que ya no la necesita' : 'El cliente pidió cambios',
    texto: comentario,
    fecha: fechaHoraCO(cambios.at),
    at: typeof cambios.at === 'string' ? cambios.at : null,
  };
}

/**
 * La pastilla de la lista y del detalle: 'Cambios pedidos' (ámbar) o 'Ya no la necesita' (rosa), o null, con la
 * misma regla de vigencia que avisoCambiosCliente.
 * @param {any} doc
 * @param {'SC' | 'COT'} [tipoDoc]
 * @returns {'Cambios pedidos' | 'Ya no la necesita' | null}
 */
export function etiquetaChipCambios(doc, tipoDoc = 'SC') {
  const cambios = cambiosVigentes(doc, tipoDoc);
  if (!cambios) return null;
  return cambios.tipo === 'NO_LA_NECESITA' ? 'Ya no la necesita' : 'Cambios pedidos';
}

/** B3 T18 (H28-cambios punto 11): a donde lleva la pastilla de AlertasBadge: la lista de solicitudes, con su marca. */
export const RUTA_CAMBIOS_CLIENTE = '/dashboard/ventas/solicitud';

/**
 * B3 T18 (H28-cambios punto 11, C22): el texto de la pastilla ámbar del menú lateral (AlertasBadge) con el
 * `cambios_cliente` de GET /ventas/alertas/resumen (SC y COT con cambios del cliente sin responder; el asesor ve solo
 * las suyas): '1 con cambios del cliente', '3 con cambios del cliente'. Es una cuenta aparte de los atrasados. Sin un
 * número positivo: '' (la pastilla no se muestra). Misma lectura del número que textoAtrasados (lib/hub-ventas.js).
 * @param {unknown} n
 * @returns {string}
 */
export function textoCambiosCliente(n) {
  const cuantos = typeof n === 'number' || (typeof n === 'string' && n.trim() !== '') ? Number(n) : NaN;
  if (!Number.isFinite(cuantos) || cuantos <= 0) return '';
  return `${cuantos} con cambios del cliente`;
}

/** El máximo del motivo de POST /ventas/solicitudes/{id}/cancelar (CancelarSolicitudBody: len() de Python). */
export const MAX_MOTIVO_CANCELACION = 500;

const PREFIJO_NO_LA_NECESITA = 'El cliente ya no la necesita';

/**
 * B3 T18 (R8, no_la_necesita): el motivo con que se abre «Cancelar solicitud» desde la tarjeta rosa «El cliente dice
 * que ya no la necesita»: 'El cliente ya no la necesita: {su comentario}' (sin los espacios de los bordes) o, sin
 * comentario, 'El cliente ya no la necesita.'. El comentario llega hasta 1000 caracteres y el motivo admite
 * MAX_MOTIVO_CANCELACION (en puntos de código, como len() de Python): si no cabe, se corta con '…' sin partir un emoji.
 * null si la SC no tiene vigente un «Ya no la necesita» (la misma regla de avisoCambiosCliente). El asesor lo puede
 * cambiar antes de cancelar.
 * @param {any} sc
 * @returns {string | null}
 */
export function motivoCancelacionNoLaNecesita(sc) {
  const cambios = cambiosVigentes(sc, 'SC');
  if (!cambios || cambios.tipo !== 'NO_LA_NECESITA') return null;
  const comentario = typeof cambios.comentario === 'string' ? cambios.comentario.trim() : '';
  if (!comentario) return `${PREFIJO_NO_LA_NECESITA}.`;
  const puntos = [...`${PREFIJO_NO_LA_NECESITA}: ${comentario}`];
  if (puntos.length <= MAX_MOTIVO_CANCELACION) return puntos.join('');
  return `${puntos.slice(0, MAX_MOTIVO_CANCELACION - 1).join('')}…`;
}
