/**
 * Las reglas de rol de las pantallas (revisión final del Bloque 3, F2: M12 y M52). Una sola copia, sobre normalizarRol
 * (lib/chatter.js), el espejo de normalize_role de backend/app/api/dependencies.py: el nombre viejo ('Admin',
 * 'Vendedor', 'Finanzas'…) por su canónico y cualquier otro en mayúsculas, sin los espacios de los bordes. Así un botón
 * no termina en un 403 ni un asesor válido se queda fuera de un selector. JS plano para probarlo con node
 * (frontend/tests/test_roles.mjs).
 *
 * Las reexportan con sus nombres de siempre: flujo.tsx (esAsesorElegible, esAdministrador y puedeCrearOrdenDePago),
 * seguimiento.js (esAdminOAsesor), nombre-para-mostrar.js (puedeEditarNombreParaMostrar) y dinero-ventas.js
 * (puedeGestionarCotizacion). La seguridad real es el require_roles del servidor.
 */

import { normalizarRol } from './chatter.js';

/**
 * Solo la Administración (ROLE_ADMIN): la Papelera, la configuración del Hub, el nombre para mostrar.
 * @param {unknown} rol
 * @returns {boolean}
 */
export function esAdmin(rol) {
  return normalizarRol(rol) === 'ADMIN';
}

/**
 * La Administración y el asesor (require_roles(ROLE_ADMIN, ROLE_ASESOR)): enviar, cotizar, los recordatorios, el
 * WhatsApp automático y quién sale en el selector de asesores.
 * @param {unknown} rol
 * @returns {boolean}
 */
export function esAdminOAsesor(rol) {
  const r = normalizarRol(rol);
  return r === 'ADMIN' || r === 'ASESOR';
}

/**
 * La orden de pago (PXP) de un pedido (POST /ventas/pedidos/{id}/crear-pxp): la Administración, Finanzas y el asesor.
 * Las condiciones del pedido van en pedidoAdmitePxp (dinero-ventas.js).
 * @param {unknown} rol
 * @returns {boolean}
 */
export function puedeCrearOrdenDePago(rol) {
  const r = normalizarRol(rol);
  return r === 'ADMIN' || r === 'FINANZAS' || r === 'ASESOR';
}

/**
 * B4 T23A r1 (I1, I2, m15): lo que cada rol puede pedir y hacer en E-Commerce, de la lista EXACTA de require_roles de cada
 * endpoint de backend/app/api/v1/ecommerce.py (la seguridad real es la del servidor; esto evita pedir lo que da un 403 fijo):
 *  - indicadores (GET /stats) y carritos (GET /carritos): ADMIN y ASESOR;
 *  - pedidos (GET /pedidos): ADMIN, ASESOR, FINANZAS y BODEGA;
 *  - catalogo (GET /catalogo): sin guardia de rol, todos;
 *  - editarCatalogo (POST, PATCH y DELETE del catálogo): solo ADMIN.
 * `listo` es false con un rol vacío o que no es texto (la hidratación: el rol se lee después de montar): entonces nada se
 * pide ni se ofrece. Un objeto nuevo en cada llamada.
 * @param {unknown} rol
 * @returns {{listo: boolean, indicadores: boolean, carritos: boolean, pedidos: boolean, catalogo: boolean, editarCatalogo: boolean}}
 */
export function accesoTienda(rol) {
  const r = normalizarRol(rol);
  if (r === '') return { listo: false, indicadores: false, carritos: false, pedidos: false, catalogo: false, editarCatalogo: false };
  const adminOAsesor = esAdminOAsesor(rol);
  return {
    listo: true,
    indicadores: adminOAsesor,
    carritos: adminOAsesor,
    pedidos: adminOAsesor || r === 'FINANZAS' || r === 'BODEGA',
    catalogo: true,
    editarCatalogo: esAdmin(rol),
  };
}
