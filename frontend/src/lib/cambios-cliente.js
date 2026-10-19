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
