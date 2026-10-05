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

/** Cuanto se espera a writeText antes de pasar a la seleccion (un permiso que nunca responde no cuelga el boton). */
const ESPERA_PORTAPAPELES_MS = 1500;

const ignorar = () => undefined;

/**
 * Copia `texto`: primero con `portapapeles.writeText` (si es una funcion), que compite con un temporizador de
 * `esperaMs` (1500 ms); si falla, vence o no existe, con `copiarSeleccion()` (que debe devolver true si copio).
 * 'copiado' si alguno funciono; 'manual' si ninguno. Nunca lanza.
 * @param {string} texto
 * @param {{ portapapeles?: PortapapelesLike | null, copiarSeleccion?: (() => boolean) | null, esperaMs?: number }}
 *   [opciones]
 * @returns {Promise<'copiado' | 'manual'>}
 */
export async function copiarTexto(texto, { portapapeles, copiarSeleccion, esperaMs = ESPERA_PORTAPAPELES_MS } = {}) {
  if (typeof portapapeles?.writeText === 'function') {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let temporizador;
    try {
      const escritura = Promise.resolve(portapapeles.writeText(texto));
      // Si pierde la carrera y despues falla, que no quede una promesa rechazada sin manejar.
      escritura.catch(ignorar);
      const vence = new Promise((_, rechazar) => {
        temporizador = setTimeout(() => rechazar(new Error('El portapapeles no respondió')), esperaMs);
      });
      await Promise.race([escritura, vence]);
      return 'copiado';
    } catch {
      // Sin permiso, sin foco o sin respuesta a tiempo: se intenta con la seleccion.
    } finally {
      clearTimeout(temporizador);
    }
  }
  try {
    if (typeof copiarSeleccion === 'function' && copiarSeleccion()) return 'copiado';
  } catch {
    // execCommand bloqueado: queda el aviso para copiar a mano.
  }
  return 'manual';
}
