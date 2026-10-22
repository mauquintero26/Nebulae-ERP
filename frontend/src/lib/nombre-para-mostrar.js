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
export const AYUDA_NOMBRE_PARA_MOSTRAR = 'Así verá el cliente a su asesor en los documentos. Si lo dejas vacío, verá «Tu asesor».';

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
 * Solo un ADMIN lo edita (el servidor exige ROLE_ADMIN): 'Admin' legacy o 'ADMIN' canónico, sin importar mayúsculas
 * ni espacios, como normalize_role de dependencies.py (y esAdministrador de ventas/flujo.tsx).
 * @param {unknown} rol
 * @returns {boolean}
 */
export function puedeEditarNombreParaMostrar(rol) {
  return typeof rol === 'string' && rol.trim().toLowerCase() === 'admin';
}
