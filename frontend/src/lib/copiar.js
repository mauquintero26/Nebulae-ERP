/**
 * Copiar al portapapeles sin fallar en silencio (H30, Bloque 2). JS plano para probarlo con node
 * (frontend/tests/test_copiar.mjs). Lo usa EnlaceConfirmacionModal (app/dashboard/ventas/flujo.tsx); otras pantallas
 * con el mismo patron (asistente omnicanal, campañas) lo pueden reutilizar.
 *
 * navigator.clipboard no existe en un contexto no seguro (el frontend abierto por HTTP con una IP o un dominio) y el
 * navegador puede negar el permiso. Entonces se intenta copiar la seleccion de un input (document.execCommand('copy'),
 * obsoleto pero vigente, solo como segundo intento). Si nada funciona se responde 'manual' y la pantalla deja el texto
 * seleccionado con un aviso de como copiarlo a mano.
 */

/**
 * @typedef {{ writeText?: (texto: string) => Promise<void> }} PortapapelesLike
 */

/**
 * Copia `texto`: primero con `portapapeles.writeText` (si es una funcion) y, si falla o no existe, con
 * `copiarSeleccion()` (que debe devolver true si copio). 'copiado' si alguno funciono; 'manual' si ninguno.
 * Nunca lanza.
 * @param {string} texto
 * @param {{ portapapeles?: PortapapelesLike | null, copiarSeleccion?: (() => boolean) | null }} [opciones]
 * @returns {Promise<'copiado' | 'manual'>}
 */
export async function copiarTexto(texto, { portapapeles, copiarSeleccion } = {}) {
  if (typeof portapapeles?.writeText === 'function') {
    try {
      await portapapeles.writeText(texto);
      return 'copiado';
    } catch {
      // Sin permiso o sin foco: se intenta con la seleccion.
    }
  }
  try {
    if (typeof copiarSeleccion === 'function' && copiarSeleccion()) return 'copiado';
  } catch {
    // execCommand bloqueado: queda el aviso para copiar a mano.
  }
  return 'manual';
}
