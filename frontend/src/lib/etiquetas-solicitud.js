/**
 * Tipos y modalidades de pago de la solicitud (H10, choque C16, ruling T6A-1). JS plano para probarlo con node
 * (frontend/tests/test_etiquetas_solicitud.mjs). Imports relativos con extensión.
 *
 * - TIPOS_SC y MODALIDADES_PAGO: los valores GUARDADOS, exactos (sin tilde). No se cambian: los usan el filtro de
 *   Soporte, el prefijo 'Cr' del anticipo (R2) y el lead del CRM. solicitud-client.tsx los reexporta.
 * - Las etiquetas para mostrarlos NO viven aquí: son las de lib/etiquetas-ventas.js (un solo helper para todas las
 *   pantallas), reexportadas con los nombres del plan.
 * - pctAnticipoDeModalidad: espejo de backend/app/core/ventas_dinero.py pct_anticipo_de_modalidad (R2).
 */

import { normalizarBusqueda } from './busqueda.js';

export { etiquetaTipoSolicitud as etiquetaTipoSC, etiquetaModalidad } from './etiquetas-ventas.js';

/**
 * Tipos de solicitud, con el valor que se guarda. Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const TIPOS_SC = Object.freeze([
  'Cotizacion de Producto',
  'Seguimiento',
  'Programar Entrega',
  'Devolucion de Producto',
  'Soporte Tecnico',
  'Nuevo Lead',
]);

/**
 * Modalidades de pago del formulario, con el valor que se guarda. Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const MODALIDADES_PAGO = Object.freeze([
  'Contado',
  '60/40 (60% anticipo - 40% pendiente)',
  'Credito 30 dias',
  'Credito 60 dias',
  'Otro',
]);

/**
 * % de anticipo que pedirá la cotización según la modalidad (R2), o null si no la reconoce ('Otro', vacía...: la
 * pantalla usa 60, como el backend). Igual que el backend: sin tildes ni mayúsculas (NFKD), crédito (empieza por 'cr'
 * o dice 'credito') -> 0, '60/40' -> 60, 'contado' -> 100.
 * @param {any} modalidad
 * @returns {number | null}
 */
export function pctAnticipoDeModalidad(modalidad) {
  if (modalidad === null || modalidad === undefined) return null;
  const t = normalizarBusqueda(String(modalidad).normalize('NFKD'));
  if (!t) return null;
  if (t.startsWith('cr') || t.includes('credito')) return 0;
  if (t.includes('60/40')) return 60;
  if (t.includes('contado')) return 100;
  return null;
}
