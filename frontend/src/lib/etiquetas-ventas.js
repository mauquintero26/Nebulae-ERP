/**
 * Etiquetas para MOSTRAR los tipos de solicitud y las modalidades de pago de Ventas con tilde (H7+H41; textos de H10,
 * aprobados por el usuario en el Bloque 2). Es el ÚNICO helper de estas etiquetas: lo usan la lista y el detalle de la
 * SC, el Hub, el PVEN y la Actividad (CambiosDeActividad); lib/etiquetas-solicitud.js lo reexporta con los nombres del
 * plan (etiquetaTipoSC, etiquetaModalidad). JS plano para probarlo con node (frontend/tests/test_etiquetas_ventas.mjs).
 *
 * Los valores guardados siguen SIN tilde ('Cotizacion de Producto', 'Credito 30 dias'): son la clave con la que se
 * comparan en el frontend y el backend y con la que se guardan. Estas funciones solo se usan al pintar el texto
 * (opciones de un select, pastillas, detalle): nunca en un value ni en una comparacion.
 */

import { normalizarBusqueda } from './busqueda.js';

const TIPOS_SOLICITUD = Object.freeze({
  'Cotizacion de Producto': 'Cotización de producto',
  'Seguimiento': 'Seguimiento',
  'Programar Entrega': 'Programar entrega',
  'Devolucion de Producto': 'Devolución de producto',
  'Soporte Tecnico': 'Soporte técnico',
  'Nuevo Lead': 'Nuevo lead',
});

/**
 * 'Cotizacion de Producto' -> 'Cotización de producto'. Un tipo desconocido queda igual; null -> ''.
 * @param {any} tipo
 * @returns {string}
 */
export function etiquetaTipoSolicitud(tipo) {
  if (tipo === null || tipo === undefined) return '';
  const t = String(tipo);
  return Object.prototype.hasOwnProperty.call(TIPOS_SOLICITUD, t) ? TIPOS_SOLICITUD[t] : t;
}

/**
 * La modalidad de pago para mostrar. Se compara sin tildes ni mayúsculas y con la misma regla que el anticipo del
 * backend (R2): lo que empieza por 'cr' o dice 'credito' es 'Crédito N días' si trae un número ('Credito 30 dias',
 * 'Credito 30 Dias' de la agenda, 'Credito 30d' de compras) o 'Crédito' si no; lo que dice '60/40' es
 * '60/40 (60% de anticipo y 40% al entregar)'; 'contado' -> 'Contado'; 'otro' -> 'Otro'. Cualquier otro valor queda
 * igual ('Adelanto 50%', 'Contra entrega'). null -> ''.
 * @param {any} modalidad
 * @returns {string}
 */
export function etiquetaModalidad(modalidad) {
  if (modalidad === null || modalidad === undefined) return '';
  const original = String(modalidad);
  const t = normalizarBusqueda(original);
  if (t.startsWith('cr') || t.includes('credito')) {
    const dias = t.match(/\d+/);
    return dias ? `Crédito ${dias[0]} días` : 'Crédito';
  }
  if (t.includes('60/40')) return '60/40 (60% de anticipo y 40% al entregar)';
  if (t === 'contado') return 'Contado';
  if (t === 'otro') return 'Otro';
  return original;
}

/**
 * El valor ('antes' o 'despues') de un renglon de extra_data.cambios de la Actividad, listo para mostrar. Solo los
 * campos 'tipo_solicitud' y 'modalidad_pago' llevan etiqueta (el backend los guarda con el valor sin tilde, tambien
 * en los renglones ya escritos); cualquier otro campo pasa tal cual, porque puede ser texto de una persona. Un valor
 * null o undefined se devuelve igual: la pantalla decide si pone '—'.
 */
export function etiquetaValorCambio(campo, valor) {
  if (valor === null || valor === undefined) return valor;
  if (campo === 'tipo_solicitud') return etiquetaTipoSolicitud(valor);
  if (campo === 'modalidad_pago') return etiquetaModalidad(valor);
  return valor;
}
