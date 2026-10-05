/**
 * Datos de contacto del cliente que se corrigen desde la solicitud (H21): PATCH /ventas/solicitudes/{id}/cliente.
 * JS plano para probarlo con node (frontend/tests/test_datos_cliente.mjs).
 *
 * Las reglas y los textos son los del backend (erp_ventas._normalizar_contacto y los límites de app/core/clientes.py,
 * T5): si cambias uno, cambia el otro. El servidor vuelve a validar todo; esto solo evita el viaje con un dato que
 * va a rechazar.
 */

import { tiene } from './estados-pedido.js';

/**
 * Los campos, en el orden del formulario. `max` = largo máximo (sin los espacios de los bordes); `soloConFicha` = solo
 * se corrige si la solicitud está vinculada a una ficha de cliente (la ciudad no es columna de la SC). Inmutable.
 * @type {ReadonlyArray<Readonly<{clave: string, etiqueta: string, max: number, soloConFicha: boolean}>>}
 */
export const CAMPOS_CONTACTO = Object.freeze([
  Object.freeze({ clave: 'customer_phone', etiqueta: 'Teléfono', max: 50, soloConFicha: false }),
  Object.freeze({ clave: 'customer_email', etiqueta: 'Correo', max: 150, soloConFicha: false }),
  Object.freeze({ clave: 'customer_address', etiqueta: 'Dirección', max: 255, soloConFicha: false }),
  Object.freeze({ clave: 'customer_city', etiqueta: 'Ciudad', max: 100, soloConFicha: true }),
]);

/** Textos exactos del backend (clientes.texto_de_limite) cuando un dato pasa su límite. */
const TEXTO_LIMITE = Object.freeze({
  customer_phone: (max) => `El teléfono no puede tener más de ${max} caracteres.`,
  customer_email: (max) => `El correo no puede tener más de ${max} caracteres.`,
  customer_address: (max) => `La dirección es muy larga (máximo ${max} caracteres).`,
  customer_city: (max) => `La ciudad es muy larga (máximo ${max} caracteres).`,
});

const TELEFONO_MIN_DIGITOS = 7;
const CORREO_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());
const comparable = (clave, v) => (clave === 'customer_email' ? texto(v).toLowerCase() : texto(v));

/**
 * Solo los datos de contacto que cambiaron, ya recortados (el correo en minúsculas, como lo guarda el servidor). ''
 * significa borrar el dato. El correo se compara sin mayúsculas; null y '' son lo mismo; una clave que no está en
 * `form` no se toca; la ciudad solo entra si `tieneFicha`.
 * @param {any} original la solicitud (con customer_city del detalle)
 * @param {any} form lo que hay en el formulario
 * @param {{ tieneFicha?: boolean }} [opciones]
 * @returns {Record<string, string>}
 */
export function cambiosDeContacto(original, form, { tieneFicha = false } = {}) {
  /** @type {Record<string, string>} */
  const cambios = {};
  for (const { clave, soloConFicha } of CAMPOS_CONTACTO) {
    if ((soloConFicha && !tieneFicha) || !tiene(form, clave)) continue;
    const nuevo = comparable(clave, form[clave]);
    if (nuevo !== comparable(clave, original?.[clave])) cambios[clave] = nuevo;
  }
  return cambios;
}

/**
 * null si los cambios son válidos, o el mensaje para el usuario (el mismo del 422 del servidor). Mismas reglas y mismo
 * orden que el backend: teléfono, correo, dirección, ciudad; cada uno sin los espacios de los bordes; '' es válido
 * (borra el dato); primero el largo y después el formato (correo con '@' y dominio; teléfono con al menos 7 dígitos).
 * @param {Record<string, any> | null | undefined} cambios
 * @returns {string | null}
 */
export function validarContacto(cambios) {
  for (const { clave, etiqueta, max } of CAMPOS_CONTACTO) {
    if (!tiene(cambios, clave)) continue;
    const v = cambios[clave];
    if (v !== null && v !== undefined && typeof v !== 'string') return `El dato «${etiqueta}» debe ser un texto.`;
    const t = texto(v);
    if (!t) continue;
    if ([...t].length > max) return TEXTO_LIMITE[clave](max);
    if (clave === 'customer_email' && !CORREO_VALIDO.test(t)) return `El correo «${t}» no es válido.`;
    if (clave === 'customer_phone' && (t.match(/[0-9]/g) ?? []).length < TELEFONO_MIN_DIGITOS) {
      return `El teléfono debe tener al menos ${TELEFONO_MIN_DIGITOS} dígitos.`;
    }
  }
  return null;
}
