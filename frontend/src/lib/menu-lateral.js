/**
 * B4.1 T10 (P3): el menú lateral en pantallas angostas. JS plano para probarlo con node (frontend/tests/test_menu_lateral.mjs);
 * lo usa components/Sidebar.tsx con el ancho de useAnchoVentana (null en el servidor y en la primera pintura).
 *  - Por debajo de 768 px (el corte md: de Tailwind) el menú va plegado (80 px) y, al abrirlo, flota encima de la página
 *    (superpuesto) en lugar de empujarla: a 375 px, 256 px de menú dejaban 119 px para la pantalla.
 *  - Desde 768 px manda lo que la persona eligió con «Contraer Menú» (plegadoElegido), como hasta hoy.
 */

/** Por debajo de este ancho (px) la pantalla es angosta. */
export const ANCHO_MENU_ANGOSTO = 768;

/** @param {unknown} anchoVentana */
const esAngosta = (anchoVentana) => typeof anchoVentana === 'number' && anchoVentana < ANCHO_MENU_ANGOSTO;

/**
 * Cómo se pinta el menú.
 *  - anchoVentana null (el servidor o el primer render): lo elegido, sin capa (las clases max-md: del Sidebar ya lo
 *    angostan a 80 px antes de hidratar).
 *  - Angosta: plegado salvo que se haya abierto, y abierto siempre como capa encima de la página.
 *  - Ancha: lo elegido, sin capa.
 * @param {{ anchoVentana: number | null, plegadoElegido: boolean, abiertoEnAngosta: boolean }} estado
 * @returns {{ plegado: boolean, superpuesto: boolean }}
 */
export function menuLateralEfectivo({ anchoVentana, plegadoElegido, abiertoEnAngosta }) {
  if (esAngosta(anchoVentana)) return { plegado: !abiertoEnAngosta, superpuesto: abiertoEnAngosta };
  return { plegado: plegadoElegido, superpuesto: false };
}

/**
 * Lo que hace el botón de plegar: en una pantalla angosta abre o cierra la capa (abiertoEnAngosta); si no, cambia lo
 * elegido (plegadoElegido). Lo otro queda igual: abrir la capa en el teléfono no cambia el menú del escritorio.
 * @param {{ anchoVentana: number | null, plegadoElegido: boolean, abiertoEnAngosta: boolean }} estado
 * @returns {{ plegadoElegido: boolean, abiertoEnAngosta: boolean }}
 */
export function alternarMenu({ anchoVentana, plegadoElegido, abiertoEnAngosta }) {
  if (esAngosta(anchoVentana)) return { plegadoElegido, abiertoEnAngosta: !abiertoEnAngosta };
  return { plegadoElegido: !plegadoElegido, abiertoEnAngosta };
}
