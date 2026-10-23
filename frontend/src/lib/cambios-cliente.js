/**
 * «Pedir cambios» visto por el asesor (Bloque 3, T12: H28-cambios punto 7, C9). JS plano para probarlo con node
 * (frontend/tests/test_cambios_cliente.mjs); lo usan la tarjeta de la SC (T18), la de la COT (T17), la pastilla de las
 * listas de solicitudes y de cotizaciones y las pastillas del menú lateral (AlertasBadge, T18 r1).
 *
 * cambios_cliente llega en el detalle de la SC (_sc_dict) y de la COT (get_cotizacion) como {at ('…Z'), tipo
 * ('CAMBIOS' | 'NO_LA_NECESITA'), comentario} o null (erp_ventas._cambios_cliente_dict). Se muestra mientras el
 * documento sigue en manos del asesor, la misma regla del backend (_ESTADOS_CON_CAMBIOS_VIGENTES): la SC en Asignada o
 * Nueva (BORRADOR) y la COT en Borrador. Al reenviarla, el servidor limpia la marca.
 */

import { fechaHoraCO } from './fechas-colombia.js';
import { cantidadPositiva } from './hub-ventas.js';

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

/** B3 T18 r1: las dos listas con la marca de cambios del cliente, a donde lleva cada pastilla de AlertasBadge. */
export const RUTA_LISTA_SOLICITUDES = '/dashboard/ventas/solicitud';
export const RUTA_LISTA_COTIZACIONES = '/dashboard/ventas/cotizacion';

const PASTILLAS_CAMBIOS = Object.freeze([
  Object.freeze({ clave: 'SC', cuenta: 'cambios_cliente_sc', singular: 'solicitud', plural: 'solicitudes',
    lista: 'Solicitudes', ruta: RUTA_LISTA_SOLICITUDES }),
  Object.freeze({ clave: 'COT', cuenta: 'cambios_cliente_cot', singular: 'cotización', plural: 'cotizaciones',
    lista: 'Cotizaciones', ruta: RUTA_LISTA_COTIZACIONES }),
]);

/**
 * B3 T18 r1 (H28-cambios punto 11, C9, C22): las pastillas ámbar del menú lateral (AlertasBadge), con
 * `cambios_cliente_sc` y `cambios_cliente_cot` de GET /ventas/alertas/resumen (documentos con cambios del cliente sin
 * responder; el asesor ve solo los suyos). Una por cada cuenta positiva (cantidadPositiva, la misma lectura de
 * textoAtrasados), primero la de solicitudes: cada una con su número y la lista donde está la marca ('2 solicitudes
 * con cambios' a la lista de solicitudes; '1 cotización con cambios' a la de cotizaciones), y un title y un
 * aria-label que dicen adónde lleva. Es una cuenta aparte de los atrasados. Sin cuentas positivas: [] (no se pinta
 * ninguna); la suma sola (cambios_cliente) no dice adónde llevar.
 * @param {unknown} resumen el `data` de GET /ventas/alertas/resumen
 * @returns {Array<{clave: 'SC' | 'COT', cantidad: number, texto: string, ruta: string, titulo: string, ariaLabel: string}>}
 */
export function pastillasCambiosCliente(resumen) {
  const r = resumen && typeof resumen === 'object' ? /** @type {Record<string, unknown>} */ (resumen) : {};
  const pastillas = [];
  for (const p of PASTILLAS_CAMBIOS) {
    const cantidad = cantidadPositiva(r[p.cuenta]);
    if (cantidad === null) continue;
    const texto = `${cantidad} ${cantidad === 1 ? p.singular : p.plural} con cambios`;
    const destino = `la lista de ${p.plural}`;
    pastillas.push({
      clave: /** @type {'SC' | 'COT'} */ (p.clave), cantidad, texto, ruta: p.ruta,
      titulo: `${p.lista} con cambios pedidos por el cliente: abre ${destino}`,
      ariaLabel: `${texto} pedidos por el cliente: ver ${destino}`,
    });
  }
  return pastillas;
}

/** R3 (C19): el aviso bajo la «Nota para el cliente» de la SC y bajo la nota de la cotización. Una sola redacción. */
export const AYUDA_NOTA_CLIENTE = 'El cliente verá esta nota';

/**
 * Revisión final B3 (F2, M8): el título de la «Nota para el cliente» de la SC (sc_nota_cliente del GET) en los detalles
 * de la COT y del PVEN: también sale en su documento del cliente (notas_para_cliente del servidor), así que el asesor la
 * ve ahí, con AYUDA_NOTA_CLIENTE debajo.
 */
export const TITULO_NOTA_CLIENTE_DE_LA_SOLICITUD = 'Nota para el cliente (de la solicitud)';

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
