'use client';

import { Kanban, List } from 'lucide-react';
import { ACCENTS, type AccentColor } from './colors';
import { usePreferencia } from './usePreferencia';
import { esModoTabla } from '@/lib/tabla';
import type { ModoTabla } from '@/lib/tabla';

/**
 * El ÚNICO botón de vista de la app (Bloque 4, T4A; R11, C1, RP26 y RP67): «Lista» y «Kanban», con los íconos List y
 * Kanban de lucide-react. Es CONTROLADO: recibe `modo` y `onCambiar` y no guarda nada por su cuenta.
 *  - En una pantalla con tabla estándar, su valor es el `modo` de useEstadoTabla (T4C), que es el único dueño de
 *    vista:<id>: modo={estado.modo} y onCambiar despacha al reductor. Ahí NO se llama a useVistaGuardada (RP26).
 *  - Solo se pinta si la pantalla entrega un tablero: con kanbanDisponible = false no pinta nada (no quedan botones
 *    muertos; H17 y R8).
 */
export type ModoVista = ModoTabla;

const BASE = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300';
const INACTIVO = 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-800';

export function ConmutadorVista({
  modo, onCambiar, kanbanDisponible = true, color = 'indigo',
}: {
  modo: ModoVista;
  onCambiar: (modo: ModoVista) => void;
  kanbanDisponible?: boolean;
  color?: AccentColor;
}) {
  if (!kanbanDisponible) return null;
  const activo = ACCENTS[color].navActive;
  const elegir = (nuevo: ModoVista) => {
    if (nuevo !== modo) onCambiar(nuevo);
  };
  return (
    <div role="group" aria-label="Vista" className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-0.5 shadow-xs">
      <button
        type="button"
        onClick={() => elegir('lista')}
        aria-pressed={modo === 'lista'}
        aria-label="Vista de lista"
        title="Vista de lista"
        className={`${BASE} ${modo === 'lista' ? activo : INACTIVO}`}
      >
        <List size={14} aria-hidden="true" />
        Lista
      </button>
      <button
        type="button"
        onClick={() => elegir('kanban')}
        aria-pressed={modo === 'kanban'}
        aria-label="Vista Kanban"
        title="Vista Kanban"
        className={`${BASE} ${modo === 'kanban' ? activo : INACTIVO}`}
      >
        <Kanban size={14} aria-hidden="true" />
        Kanban
      </button>
    </div>
  );
}

/**
 * [modo, setModo, listo] de vista:<pantalla>, para las pantallas SIN tabla estándar (en las que tienen tabla, el dueño
 * de vista:<id> es useEstadoTabla; RP26). Lee la preferencia después del montaje (el primer render es porDefecto: sin
 * desajuste de hidratación) y la guarda cada vez que cambia, con usePreferencia (lib/preferencias.js; nada antes de
 * listo, D35). Un valor guardado que no es 'lista' ni 'kanban' da porDefecto. Mientras listo es false conviene pintar
 * el esqueleto de la vista.
 */
export function useVistaGuardada(
  pantalla: string,
  porDefecto: ModoVista = 'lista',
): [ModoVista, (modo: ModoVista) => void, boolean] {
  const [modo, setModo, listo] = usePreferencia<ModoVista>(`vista:${pantalla}`, porDefecto, { validar: esModoTabla });
  return [modo, setModo, listo];
}
