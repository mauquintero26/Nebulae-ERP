/**
 * El «Nombre para mostrar» de cada usuario (Bloque 3, T20b: decisión del usuario en la revisión visual). Es como verá
 * el cliente a su asesor en los documentos; lo llena la Administración en Empleados (PATCH
 * /auth/users/{id}/nombre-para-mostrar, solo ADMIN). JS plano para probarlo con node
 * (frontend/tests/test_nombre_para_mostrar.mjs).
 *
 * La regla completa vive en el servidor (app/core/nombre_para_mostrar.py: entre 2 y 80 caracteres, sin caracteres de
 * control, sin '@' y nunca el correo ni el usuario de entrada de nadie) y su 400 trae el texto para la pantalla. Aquí
 * solo va lo de la pantalla: los textos, la misma normalización de espacios, si cambió y quién lo edita.
 */

export const ETIQUETA_NOMBRE_PARA_MOSTRAR = 'Nombre para mostrar';
/**
 * Revisión final B3 (F2, M14): sin nombre para mostrar, el servidor (documento_cliente.asesor_publico) usa el nombre
 * escrito en la solicitud si no es un correo ni un usuario de entrada; solo sin él el cliente lee «Tu asesor».
 */
export const AYUDA_NOMBRE_PARA_MOSTRAR = 'Así verá el cliente a su asesor en los documentos. Si lo dejas vacío, verá el '
  + 'nombre escrito en la solicitud (si no es un correo) o «Tu asesor».';
/** F2 (M48): en solo lectura (quien no es ADMIN también llega a Empleados), por qué no se puede editar. */
export const SOLO_ADMIN_NOMBRE_PARA_MOSTRAR = 'Solo la Administración lo cambia.';

/**
 * Los espacios de los bordes fuera y los de adentro juntos en uno (también el tab y el espacio duro), como el servidor.
 * Lo que no es texto queda ''.
 * @param {unknown} valor
 * @returns {string}
 */
export function normalizarNombreParaMostrar(valor) {
  return typeof valor === 'string' ? valor.split(/\s+/).filter(Boolean).join(' ') : '';
}

/**
 * Si lo escrito cambia el nombre guardado (los dos normalizados; vacío y null son lo mismo). Las mayúsculas sí
 * cuentan: es lo que lee el cliente.
 * @param {unknown} guardado el nombre_para_mostrar del usuario (string | null)
 * @param {unknown} escrito lo que hay en el campo
 * @returns {boolean}
 */
export function nombreParaMostrarCambio(guardado, escrito) {
  return normalizarNombreParaMostrar(guardado) !== normalizarNombreParaMostrar(escrito);
}

/**
 * El cuerpo del PATCH: el nombre normalizado, o null si queda vacío (lo borra).
 * @param {unknown} escrito
 * @returns {{ nombre_para_mostrar: string | null }}
 */
export function cuerpoNombreParaMostrar(escrito) {
  return { nombre_para_mostrar: normalizarNombreParaMostrar(escrito) || null };
}

/**
 * F2 (M49): la línea de la fila de Empleados con el nombre que ve el cliente, o null si el usuario no lo tiene (la
 * fila queda como antes).
 * @param {unknown} valor el nombre_para_mostrar del usuario
 * @returns {string | null}
 */
export function lineaNombreParaMostrar(valor) {
  const nombre = normalizarNombreParaMostrar(valor);
  return nombre ? `${ETIQUETA_NOMBRE_PARA_MOSTRAR}: ${nombre}` : null;
}

/**
 * Solo un ADMIN lo edita (el servidor exige ROLE_ADMIN): 'Admin' legacy o 'ADMIN' canónico, sin importar mayúsculas
 * ni espacios, como normalize_role de dependencies.py. Revisión final B3 (F2, M12): es esAdmin de lib/roles.js (la
 * misma de esAdministrador en ventas/flujo.tsx).
 */
export { esAdmin as puedeEditarNombreParaMostrar } from './roles.js';
