'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { cierraConClicFuera, cierraConEsc } from '@/lib/tabla';

/** Las capas abiertas (Modal y Drawer), de abajo arriba: Esc cierra solo la de arriba. */
const capas: number[] = [];
let siguienteCapa = 0;

/**
 * B4 T24 (F40): el cierre de una ventana (Modal) o un panel lateral (Drawer) con Esc y con un clic en el fondo. La regla es de
 * lib/tabla.js (cierraConEsc y cierraConClicFuera, con sus casos en test_tabla.mjs): Esc cierra solo la capa de arriba, si nadie más
 * lo atendió, y nada se cierra con `bloqueado` (bloquearCierre: está guardando). Devuelve los manejadores del fondo (onPointerDown y
 * onClick de la capa oscura). onClose y bloqueado se leen por un ref (el oyente se pone una sola vez).
 */
export function useCierreVentana(onClose: () => void, bloqueado: boolean) {
  const cerrar = useRef(onClose);
  const bloqueo = useRef(bloqueado);
  useEffect(() => {
    cerrar.current = onClose;
    bloqueo.current = bloqueado;
  });
  const inicioEnFondo = useRef(false);

  useEffect(() => {
    const capa = ++siguienteCapa;
    capas.push(capa);
    const alTeclear = (e: KeyboardEvent) => {
      if (!cierraConEsc({ tecla: e.key, arriba: capas[capas.length - 1] === capa, defaultPrevented: e.defaultPrevented, bloqueado: bloqueo.current })) return;
      e.preventDefault();
      cerrar.current();
    };
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      const i = capas.indexOf(capa);
      if (i >= 0) capas.splice(i, 1);
    };
  }, []);

  const alPresionar = useCallback((e: PointerEvent<HTMLElement>) => {
    inicioEnFondo.current = e.target === e.currentTarget;
  }, []);
  const alSoltar = useCallback((e: MouseEvent<HTMLElement>) => {
    const empezo = inicioEnFondo.current;
    inicioEnFondo.current = false;
    if (cierraConClicFuera({ inicioEnFondo: empezo, finEnFondo: e.target === e.currentTarget, bloqueado: bloqueo.current })) cerrar.current();
  }, []);
  return { alPresionar, alSoltar };
}
