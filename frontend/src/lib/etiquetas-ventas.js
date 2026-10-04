/**
 * Etiquetas para MOSTRAR los tipos de solicitud y las modalidades de pago de Ventas con tilde (H7+H41).
 * JS plano para probarlo con node (frontend/tests/test_etiquetas_ventas.mjs), como pesos.js.
 *
 * Los valores guardados siguen SIN tilde ('Cotizacion de Producto', 'Credito 30 dias'): son la clave con la que se
 * comparan en el frontend y el backend y con la que se guardan. Estas funciones solo se usan al pintar el texto
 * (opciones de un select, pastillas, detalle): nunca en un value ni en una comparacion.
 */

const TIPOS_SOLICITUD = {
  'Cotizacion de Producto': 'Cotización de Producto',
  'Devolucion de Producto': 'Devolución de Producto',
  'Soporte Tecnico': 'Soporte Técnico',
};

/** 'Cotizacion de Producto' -> 'Cotización de Producto'. Los tipos sin tilde o desconocidos quedan igual; null -> ''. */
export function etiquetaTipoSolicitud(tipo) {
  if (tipo === null || tipo === undefined) return '';
  const t = String(tipo);
  return TIPOS_SOLICITUD[t] ?? t;
}

/**
 * 'Credito 30 dias' -> 'Crédito 30 días'. Pone la tilde a las palabras completas 'Credito' y 'dias' (tambien en las
 * variantes de la agenda y de la orden de compra: 'Credito 30 Dias', 'Credito 30d'). El resto queda igual: 'Contado',
 * '60/40 (60% anticipo - 40% pendiente)', 'Otro'. null -> ''.
 */
export function etiquetaModalidad(modalidad) {
  if (modalidad === null || modalidad === undefined) return '';
  return String(modalidad)
    .replace(/\bCredito\b/g, 'Crédito')
    .replace(/\bcredito\b/g, 'crédito')
    .replace(/\bDias\b/g, 'Días')
    .replace(/\bdias\b/g, 'días');
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
