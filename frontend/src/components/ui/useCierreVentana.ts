'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { hayReautenticacionPendiente } from '@/lib/api';
import { abrirCapa, atrapaTab, cerrarCapa, cierraConClicFuera, cierraConEsc, esCapaDeArriba, siguienteFocoAtrapado } from '@/lib/tabla';

/** Las capas abiertas (Modal y Drawer), de abajo arriba (abrirCapa, cerrarCapa y esCapaDeArriba de lib/tabla.js). */
let capas: ReadonlyArray<number> = [];
let siguienteCapa = 0;
type LugarDelFoco = 'panel' | 'body' | 'pila' | 'fuera';
/** r3 (m10): dónde está el foco respecto de la capa: su panel, el <body>, otro panel de la pila (data-capa) o fuera de la pila. */
const lugarDelFoco = (panel: HTMLElement): LugarDelFoco => {
  const activo = document.activeElement;
  if (!activo || activo === document.body) return 'body';
  if (panel.contains(activo)) return 'panel';
  return activo.closest('[data-capa]') ? 'pila' : 'fuera';
};
/** Los controles que reciben el foco con Tab (la pila de capas y la ventana de re-ingreso, r3 m13: un solo selector). */
export const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * r3 (m13): el ayudante ÚNICO de Tab atrapado en `contenedor` (los controles visibles de ENFOCABLES y siguienteFocoAtrapado de
 * lib/tabla.js): el de la pila de capas y el de la ventana de re-ingreso (SessionKeeper). Con el foco fuera del contenedor va al primero
 * (o al último con Mayús).
 */
export function atraparTab(contenedor: HTMLElement, e: { shiftKey: boolean; preventDefault: () => void }) {
  const lista = [...contenedor.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((el) => el.getClientRects().length > 0);
  const destino = siguienteFocoAtrapado(lista.indexOf(document.activeElement as HTMLElement), lista.length, e.shiftKey);
  if (destino === null) return;
  e.preventDefault();
  if (destino >= 0) lista[destino].focus();
}

/**
 * B4 T24 (F40) y r1 (m12, m18, m29): el cierre y el foco de una ventana (Modal) o un panel lateral (Drawer). La regla es de lib/tabla.js
 * (cierraConEsc, cierraConClicFuera, la pila de capas y siguienteFocoAtrapado, con sus casos en test_tabla.mjs):
 *  - Esc cierra solo la capa de arriba, si nadie más lo atendió, no está guardando (`bloqueado`), no hay re-ingreso pendiente y el Esc
 *    viene de dentro de su panel; el clic en el fondo, si empezó y terminó en la capa oscura;
 *  - al abrir, el foco entra (al primer control, o al panel); Tab queda atrapado en la capa de arriba; al cerrar, vuelve al control
 *    que la abrió.
 * Devuelve los manejadores del fondo y el ref del panel (role=dialog). onClose y bloqueado se leen por un ref.
 */
export function useCierreVentana(onClose: () => void, bloqueado: boolean) {
  const cerrar = useRef(onClose);
  const bloqueo = useRef(bloqueado);
  useEffect(() => {
    cerrar.current = onClose;
    bloqueo.current = bloqueado;
  });
  const inicioEnFondo = useRef(false);
  const refPanel = useRef<HTMLDivElement>(null);
  // El control que la abrió, leído al montar (antes de que un autoFocus de adentro mueva el foco).
  const [abridor] = useState(() => (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    const capa = ++siguienteCapa;
    capas = abrirCapa(capas, capa);
    const panel = refPanel.current;
    if (panel && !panel.contains(document.activeElement)) {
      (panel.querySelector<HTMLElement>(ENFOCABLES) ?? panel).focus({ preventScroll: true });
    }
    const alTeclear = (e: KeyboardEvent) => {
      const arriba = esCapaDeArriba(capas, capa);
      if (e.key === 'Tab') {
        if (!panel || !atrapaTab({ arriba, reautenticando: hayReautenticacionPendiente(), foco: lugarDelFoco(panel) })) return;
        atraparTab(panel, e);
        return;
      }
      if (!cierraConEsc({
        tecla: e.key, arriba, defaultPrevented: e.defaultPrevented, bloqueado: bloqueo.current,
        reautenticando: hayReautenticacionPendiente(), dentro: !panel || panel.contains(e.target as Node),
        enBody: e.target === document.body,
      })) return;
      e.preventDefault();
      cerrar.current();
    };
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      capas = cerrarCapa(capas, capa);
      if (abridor && abridor.isConnected) abridor.focus({ preventScroll: true });
    };
  }, [abridor]);

  const alPresionar = useCallback((e: PointerEvent<HTMLElement>) => {
    inicioEnFondo.current = e.target === e.currentTarget;
  }, []);
  const alSoltar = useCallback((e: MouseEvent<HTMLElement>) => {
    const empezo = inicioEnFondo.current;
    inicioEnFondo.current = false;
    if (cierraConClicFuera({ inicioEnFondo: empezo, finEnFondo: e.target === e.currentTarget, bloqueado: bloqueo.current })) cerrar.current();
  }, []);
  return { alPresionar, alSoltar, refPanel };
}
