'use client';

import { useSyncExternalStore } from 'react';

function suscribir(alCambiar: () => void) {
  window.addEventListener('resize', alCambiar);
  return () => window.removeEventListener('resize', alCambiar);
}

const ancho = () => window.innerWidth;
const enServidor = () => null;

/**
 * B4.1 (P24): el ancho de la ventana en px, y null en el servidor (y en la primera pintura de la hidratación): quien lo usa elige lo
 * angosto mientras sea null. useSyncExternalStore sobre `resize`: sin estado propio ni efecto.
 */
export function useAnchoVentana(): number | null {
  return useSyncExternalStore<number | null>(suscribir, ancho, enServidor);
}
