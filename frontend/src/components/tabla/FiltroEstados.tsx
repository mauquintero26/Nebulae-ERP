'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ListFilter } from 'lucide-react';
import { Contador } from '@/components/ui/Contador';
import { alternarEstado } from '@/lib/tabla';
import type { OpcionEstado } from '@/lib/tabla';

/**
 * El filtro de estados de la tabla estándar (Bloque 4, T4D; TABLA-base punto 3, R5 y C3): un botón con cuántos estados
 * hay marcados (Contador, C13) que abre un panel con una casilla por estado, con su etiqueta legible (la de
 * estados-*.js, nunca el código), y 'Limpiar'. Es controlado: `seleccion` es estado.estados de useEstadoTabla y
 * onCambiar despacha {tipo: 'estados', valor} (vuelve a la página 1; R5). Cada casilla deja los estados en el orden de
 * las opciones (alternarEstado de lib/tabla.js). Las opciones son las de la pestaña (BarraTabla las elige con
 * opcionesDeVista); sin opciones no pinta nada. El panel se cierra con Esc (sin que llegue a la pantalla completa) o con
 * un clic afuera.
 */

export type { OpcionEstado } from '@/lib/tabla';

export function FiltroEstados({
  opciones, seleccion, onCambiar, etiqueta = 'Estado',
}: {
  opciones: ReadonlyArray<OpcionEstado>;
  seleccion: ReadonlyArray<string>;
  onCambiar: (estados: string[]) => void;
  /** El texto del botón. */
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const idPanel = useId();
  const marcados = seleccion.filter((v) => opciones.some((o) => o.valor === v));

  useEffect(() => {
    if (!abierto) return undefined;
    panel.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    const alPresionar = (e: PointerEvent) => {
      if (!(e.target instanceof Node && caja.current?.contains(e.target))) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setAbierto(false);
      boton.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', alPresionar, true);
    document.addEventListener('keydown', alTeclear, true);
    return () => {
      document.removeEventListener('pointerdown', alPresionar, true);
      document.removeEventListener('keydown', alTeclear, true);
    };
  }, [abierto]);

  if (!opciones.length) return null;

  return (
    <div ref={caja} className="relative">
      <button
        ref={boton}
        type="button"
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        onClick={() => setAbierto((a) => !a)}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
          marcados.length ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <ListFilter size={14} aria-hidden="true" />
        {etiqueta}
        {marcados.length > 0 && (
          <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] text-white">
            <Contador valor={marcados.length} />
          </span>
        )}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {abierto && (
        <div
          ref={panel}
          id={idPanel}
          role="group"
          aria-label={`Filtrar por ${etiqueta.toLowerCase()}`}
          className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <div className="max-h-72 overflow-y-auto">
            {opciones.map((o) => (
              <label key={o.valor} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={marcados.includes(o.valor)}
                  onChange={() => onCambiar(alternarEstado(seleccion, o.valor, opciones))}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-indigo-600"
                />
                <span className="min-w-0 truncate" title={o.etiqueta}>{o.etiqueta}</span>
              </label>
            ))}
          </div>
          <div className="mt-1 flex justify-end border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => onCambiar([])}
              disabled={!marcados.length}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Limpiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
