/**
 * Cliente nuevo con lo que se escribió en el buscador (H11). JS plano para probarlo con node
 * (frontend/tests/test_cliente_desde_busqueda.mjs). Lo usa el selector de cliente de la solicitud (lista y Asistente
 * Omnicanal).
 */

const VACIO = Object.freeze({ first_name: '', last_name: '', phone: '', email: '' });

/** Solo dígitos, '+', paréntesis, guiones y espacios (un teléfono o un documento escrito a mano). */
const SOLO_NUMERO = /^[\d+()\-\s]+$/;

/**
 * Los datos con los que abre el alta del cliente:
 * - con '@': el correo, recortado y en minúsculas;
 * - si es un número: los dígitos (sin el 57 inicial cuando son 12) van a phone solo si quedan 10 que empiezan por '3'
 *   (celular) o '60' (fijo); cualquier otro número (cédula, NIT) no se pone en ningún campo;
 * - si no: first_name = el texto con los espacios colapsados (no se adivina cuál es el apellido).
 * @param {any} texto
 * @returns {{ first_name: string, last_name: string, phone: string, email: string }}
 */
export function datosInicialesCliente(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return { ...VACIO };
  if (t.includes('@')) return { ...VACIO, email: t.toLowerCase() };
  if (SOLO_NUMERO.test(t) && /\d/.test(t)) {
    let digitos = t.replace(/\D/g, '');
    if (digitos.length === 12 && digitos.startsWith('57')) digitos = digitos.slice(2);
    const telefono = digitos.length === 10 && (digitos.startsWith('3') || digitos.startsWith('60'));
    return telefono ? { ...VACIO, phone: digitos } : { ...VACIO };
  }
  return { ...VACIO, first_name: t.replace(/\s+/g, ' ') };
}

/**
 * Nombre visible de un cliente: name, full_name o 'nombre apellido'. '' si no tiene.
 * @param {any} c
 * @returns {string}
 */
export function nombreCliente(c) {
  if (!c) return '';
  return String(c.name || c.full_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`).trim();
}
