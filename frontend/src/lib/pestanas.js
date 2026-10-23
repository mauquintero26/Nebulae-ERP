/**
 * Las pestañas con teclado (revisión final del Bloque 3, F2: M15), el patrón WAI-ARIA de un tablist con el foco que se
 * mueve: solo la pestaña activa está en el orden del Tab (tabIndex 0; las demás -1) y las flechas, Inicio y Fin
 * cambian de pestaña (y la activan). JS plano para probarlo con node (frontend/tests/test_pestanas.mjs). Lo usa
 * Configuración General (admin/configuracion/page.tsx).
 */

/**
 * La pestaña a la que lleva una tecla, o null si la tecla no es de las pestañas (la página no hace nada con ella).
 * Las cuatro flechas sirven: la lista va en fila en el celular y en columna desde md. Da la vuelta en los extremos.
 * @param {unknown} ids los ids de las pestañas, en orden
 * @param {unknown} actual el id de la pestaña activa
 * @param {unknown} tecla el `key` del evento de teclado
 * @returns {string | null}
 */
export function pestanaConTecla(ids, actual, tecla) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const n = ids.length;
  const i = ids.indexOf(actual);
  switch (tecla) {
    case 'ArrowRight':
    case 'ArrowDown':
      return ids[(i + 1) % n];
    case 'ArrowLeft':
    case 'ArrowUp':
      return ids[i <= 0 ? n - 1 : i - 1];
    case 'Home':
      return ids[0];
    case 'End':
      return ids[n - 1];
    default:
      return null;
  }
}
