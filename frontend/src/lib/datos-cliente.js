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

/**
 * El correo tiene la forma que exige el backend (_normalizar_contacto): algo@dominio.ext, sin espacios, una sola '@'.
 * Se mide sin los espacios de los bordes. Lo reutiliza el Chatter (lib/chatter.js) para el chip Correo.
 * @param {any} v
 * @returns {boolean}
 */
export function esCorreoValido(v) {
  return typeof v === 'string' && CORREO_VALIDO.test(v.trim());
}

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
    if (clave === 'customer_email' && !esCorreoValido(t)) return `El correo «${t}» no es válido.`;
    if (clave === 'customer_phone' && (t.match(/[0-9]/g) ?? []).length < TELEFONO_MIN_DIGITOS) {
      return `El teléfono debe tener al menos ${TELEFONO_MIN_DIGITOS} dígitos.`;
    }
  }
  return null;
}

/** Los números de documento de una lista de la respuesta (lo que no es texto se ignora). */
const numeros = (v) => (Array.isArray(v) ? v.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim()) : []);

/** 'a' | 'a y b' | 'a, b y c' (como _unir_es del backend). */
const unirConY = (partes) => (partes.length <= 1 ? partes.join('') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`);

/**
 * H21 con R18 (rulings 2 y 5 de T8B): el aviso que se muestra después de corregir el contacto del cliente con
 * PATCH /ventas/solicitudes/{id}/cliente, según las claves de su respuesta (T5). Uno solo, en este orden:
 * 1. la solicitud cambió de estado (estado_cambiado): su confirmación quedó anulada y hay que enviársela de nuevo;
 * 2. se anuló el enlace de una cotización (un número de enlaces_anulados que no es el de la solicitud);
 * 3. se anuló el enlace de la solicitud;
 * 4. la confirmación anterior ya no vale (confirmacion_anulada: Confirmada con una cotización activa);
 * 5. si no, el aviso normal de guardado.
 * Al final, los documentos de otro cliente que no se corrigieron (documentos_de_otro_cliente). null si no hay nada que
 * decir (sin_cambios y sin documentos de otro cliente, o sin respuesta). Tono 'ok' solo en el guardado normal.
 * @param {any} respuesta la respuesta del PATCH
 * @param {any} [numeroSC] el número de la solicitud (si no viene, el de respuesta.data)
 * @returns {{ texto: string, tono: 'ok' | 'info' } | null}
 */
export function avisoCorreccionContacto(respuesta, numeroSC) {
  if (!respuesta || typeof respuesta !== 'object') return null;
  const sc = String(numeroSC ?? respuesta.data?.numero ?? '').trim();
  const enlaces = numeros(respuesta.enlaces_anulados);
  const cotizaciones = enlaces.filter((n) => n !== sc);
  const deOtroCliente = numeros(respuesta.documentos_de_otro_cliente);
  let principal = '';
  let tono = 'info';
  if (respuesta.sin_cambios === true) principal = '';
  else if (respuesta.estado_cambiado === true) {
    principal = 'Datos corregidos. Como cambió el correo o el teléfono del cliente, su confirmación quedó anulada: envíale la solicitud de nuevo.';
  } else if (cotizaciones.length === 1) {
    principal = `Datos corregidos. Se anuló el enlace de la cotización ${cotizaciones[0]} enviado al dato anterior: pásala a Borrador y envíala de nuevo.`;
  } else if (cotizaciones.length > 1) {
    principal = `Datos corregidos. Se anularon los enlaces de las cotizaciones ${unirConY(cotizaciones)} enviados al dato anterior: pásalas a Borrador y envíalas de nuevo.`;
  } else if (enlaces.length > 0) {
    principal = 'Datos corregidos. Se anuló el enlace que se había enviado al dato anterior: usa «Reenviar enlace de confirmación».';
  } else if (respuesta.confirmacion_anulada === true) {
    principal = 'Datos corregidos. La confirmación anterior del cliente ya no vale; la cotización activa sigue igual.';
  } else {
    principal = 'Datos del cliente corregidos.';
    tono = 'ok';
  }
  let otros = '';
  if (deOtroCliente.length === 1) otros = `No se cambió ${deOtroCliente[0]} porque es de otro cliente.`;
  else if (deOtroCliente.length > 1) otros = `No se cambiaron ${unirConY(deOtroCliente)} porque son de otro cliente.`;
  if (otros) tono = 'info';
  const texto = [principal, otros].filter(Boolean).join(' ');
  return texto ? { texto, tono } : null;
}
