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
import { tiene } from './estados-pedido.js';

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
  return tiene(TIPOS_SOLICITUD, t) ? TIPOS_SOLICITUD[t] : t;
}

/**
 * La modalidad de pago lista para comparar, igual que _sin_tildes del backend (ventas_dinero.py): NFKD (también los
 * caracteres de ancho completo), sin tildes, en minúsculas y sin espacios en los bordes. null -> ''.
 * @param {any} modalidad
 * @returns {string}
 */
export function claveModalidad(modalidad) {
  if (modalidad === null || modalidad === undefined) return '';
  return normalizarBusqueda(String(modalidad).normalize('NFKD'));
}

/**
 * B2.1 (D7): las modalidades a crédito del formulario de la SC, con el valor que se guarda. Inmutable. Son parte de
 * MODALIDADES_PAGO (etiquetas-solicitud.js la arma con ellas): viven aquí para que esModalidadCredito las use sin que
 * los dos módulos se importen entre sí.
 * @type {ReadonlyArray<string>}
 */
export const MODALIDADES_PAGO_A_CREDITO = Object.freeze(['Credito 30 dias', 'Credito 60 dias']);

/**
 * B2.1 (D7): la ÚNICA lista de crédito del frontend, con claveModalidad: las modalidades a crédito de MODALIDADES_PAGO
 * más 'credito' a secas. Es la misma MODALIDADES_CREDITO de backend/app/core/ventas_dinero.py
 * (backend/tests/test_estados_solicitud.py compara las dos).
 * @type {ReadonlyArray<string>}
 */
export const CLAVES_MODALIDAD_CREDITO = Object.freeze([...MODALIDADES_PAGO_A_CREDITO, 'Credito'].map(claveModalidad));

/**
 * El predicado ÚNICO de crédito (0 % de anticipo; el mismo de pct_anticipo_de_modalidad del backend). B2.1 (D7): solo
 * la lista exacta CLAVES_MODALIDAD_CREDITO, sin tildes, mayúsculas ni espacios en los bordes; 'Cruce de cuentas',
 * 'Pago a credito', 'Credito 2 cuotas' o 'cr. 90 dias' ya no son crédito. Lo usa pctAnticipoDeModalidad
 * (etiquetas-solicitud.js); la etiqueta (etiquetaModalidad) no depende de él.
 * @param {any} modalidad
 * @returns {boolean}
 */
export function esModalidadCredito(modalidad) {
  return CLAVES_MODALIDAD_CREDITO.includes(claveModalidad(modalidad));
}

/**
 * Las formas conocidas de un plazo de crédito: 'credito 30 dias', 'credito 30d', 'cred 45', 'cr. 90 dias', 'credito'.
 * Solo dan el texto 'Crédito N días' de etiquetaModalidad: no deciden el anticipo (D7: eso es esModalidadCredito).
 */
const PLAZO_DE_CREDITO = /^(?:credito|cred\.?|cr\.?)\s*(\d+)?\s*(?:d|dias?)?\.?$/;

/** Dónde va la tilde en cada palabra (posición de la vocal) y la vocal con tilde en minúscula y mayúscula. */
const VOCAL_CON_TILDE = Object.freeze({ credito: 2, dias: 1 });
const CON_TILDE = Object.freeze({ e: 'é', E: 'É', i: 'í', I: 'Í' });

/** Pone la tilde a las palabras completas 'credito' y 'dias', respetando sus mayúsculas ('CREDITO' -> 'CRÉDITO'). */
function tildesPorPalabra(texto) {
  return texto.replace(/\b(credito|dias)\b/gi, (palabra) => {
    const i = VOCAL_CON_TILDE[palabra.toLowerCase()];
    return palabra.slice(0, i) + CON_TILDE[palabra[i]] + palabra.slice(i + 1);
  });
}

/** El texto de H10 para la modalidad 60/40; etiquetaModalidadCorta lo acorta a '60/40'. */
const ETIQUETA_60_40 = '60/40 (60% de anticipo y 40% al entregar)';

/**
 * La modalidad de pago para mostrar (H10). Se compara con claveModalidad (sin tildes ni mayúsculas):
 * - la forma conocida de un plazo de crédito ('Credito 30 dias', 'Credito 30 Dias' de la agenda, 'Credito 30d' de
 *   compras, 'cr. 90 dias', 'CRÉDITO') -> 'Crédito N días', o 'Crédito' sin número. Es solo el texto: B2.1 (D7) cobra
 *   sin anticipo solo la lista exacta (esModalidadCredito), así que 'cr. 90 dias' se lee 'Crédito 90 días' y pide el
 *   anticipo por defecto;
 * - lo que dice '60/40' -> '60/40 (60% de anticipo y 40% al entregar)'; 'contado' -> 'Contado'; 'otro' -> 'Otro';
 * - cualquier otro valor queda como está, con la tilde en las palabras completas 'credito' y 'dias' (respetando las
 *   mayúsculas): no se inventa un plazo ('Credito 2 cuotas' -> 'Crédito 2 cuotas'), y 'Cruce de cuentas' no se llama
 *   crédito.
 * null -> ''.
 * @param {any} modalidad
 * @returns {string}
 */
export function etiquetaModalidad(modalidad) {
  if (modalidad === null || modalidad === undefined) return '';
  const original = String(modalidad);
  const t = claveModalidad(original);
  const plazo = t.match(PLAZO_DE_CREDITO);
  if (plazo) return plazo[1] ? `Crédito ${Number(plazo[1])} días` : 'Crédito';
  if (t.includes('60/40')) return ETIQUETA_60_40;
  if (t === 'contado') return 'Contado';
  if (t === 'otro') return 'Otro';
  return tildesPorPalabra(original);
}

/**
 * T11 (V9): la modalidad para un texto que ya va entre paréntesis ('Anticipo requerido (60% · 60/40)'): la de
 * etiquetaModalidad sin la explicación entre paréntesis de la 60/40 ('60/40'); las demás ya son cortas y quedan iguales.
 * @param {any} modalidad
 * @returns {string}
 */
export function etiquetaModalidadCorta(modalidad) {
  const etiqueta = etiquetaModalidad(modalidad);
  return etiqueta === ETIQUETA_60_40 ? '60/40' : etiqueta;
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
