'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ChevronDown, ChevronUp, Lock, MoveHorizontal, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { ajustarAlAncho, puedeDesplazar } from '@/lib/tabla';
import type { DefinicionColumna } from '@/lib/tabla';
import type { PreferenciasTabla } from './usePreferenciasTabla';

/**
 * «Ajustar tabla» (Bloque 4, T4D; TABLA-base punto 3, R11, R26, C1, D38 y D40): el ÚNICO control de columnas de la app
 * (icono SlidersHorizontal; el botón de vista es ConmutadorVista). Abre un panel con:
 *  - una casilla por columna para mostrarla u ocultarla (las clave, bloqueadas y siempre a la vista; nunca quedan cero
 *    visibles), en el orden del usuario; las ocultas por defecto (R26) salen sin marcar y se pueden mostrar aquí;
 *  - flechas subir/bajar, la alternativa sin arrastre (teclado y pantallas táctiles), que no cruzan las fijas
 *    (puedeDesplazar);
 *  - 'Ajustar al ancho de la pantalla': reparte los anchos para que la tabla quepa sin correrse (ajustarAlAncho) con el
 *    ancho que TablaEstandar publica en `anchoRef` (el mismo ref que la pantalla le pasa a la tabla; se lee al hacer
 *    clic). Sin anchoRef no se ofrece;
 *  - 'Restablecer columnas': vuelve a la forma por defecto (borra orden, anchos y ocultas; conserva el tamaño).
 * D40: recibe `preferencias`, el resultado del ÚNICO usePreferenciasTabla de la pantalla (el mismo que recibe
 * TablaEstandar); no llama a usePreferenciasTabla por su cuenta: dos vínculos con el mismo id se pisarían la pieza
 * {anchos}. D35 y D38: cada operación escribe solo su pieza y nada antes de listo; mientras no está listo, todo queda
 * deshabilitado con 'Cargando tus columnas…'.
 */

/** Lo que MenuAjustes necesita de cada columna (ColumnaTabla de TablaEstandar lo cumple). */
export type ColumnaAjustes = DefinicionColumna & { titulo: string };

const FLECHA = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent';
const ACCION = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-40';

export function MenuAjustes({
  columnas, preferencias, anchoRef,
}: {
  columnas: ReadonlyArray<ColumnaAjustes>;
  /** El resultado del único usePreferenciasTabla(id, columnas) de la pantalla (D40). */
  preferencias: PreferenciasTabla;
  /** El ancho para las columnas que publica TablaEstandar (el mismo ref de la pantalla). */
  anchoRef?: RefObject<number | null>;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // La flecha que se pulsó: al reordenarse la lista, el foco vuelve a ella (o a la otra flecha de la fila).
  const focoPendiente = useRef<string | null>(null);
  const idPanel = useId();
  const { listo, orden, ocultas, visibles, fijas } = preferencias;
  const porId = new Map(columnas.map((c) => [c.id, c]));

  useEffect(() => {
    if (!abierto) return undefined;
    panel.current?.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true });
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

  useEffect(() => {
    const pendiente = focoPendiente.current;
    if (!pendiente || !panel.current) return;
    focoPendiente.current = null;
    const [id, paso] = pendiente.split('|');
    const fila = Array.from(panel.current.querySelectorAll<HTMLElement>('[data-columna]')).find((el) => el.dataset.columna === id);
    const objetivo = fila?.querySelector<HTMLButtonElement>(`[data-paso="${paso}"]:not(:disabled)`)
      ?? fila?.querySelector<HTMLButtonElement>('[data-paso]:not(:disabled)');
    objetivo?.focus({ preventScroll: true });
  }, [orden]);

  const desplazar = (id: string, paso: -1 | 1) => {
    focoPendiente.current = `${id}|${paso}`;
    preferencias.desplazar(id, paso);
  };

  const ajustar = () => {
    const nuevos = ajustarAlAncho(columnas, visibles, preferencias.anchos, anchoRef?.current ?? null);
    if (nuevos) preferencias.guardarAnchos(nuevos);
  };

  return (
    <div ref={caja} className="relative">
      <button
        ref={boton}
        type="button"
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        title="Ajustar tabla"
        onClick={() => setAbierto((a) => !a)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 aria-expanded:bg-slate-100"
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        <span className="hidden sm:inline">Ajustar tabla</span>
        <span className="sr-only sm:hidden">Ajustar tabla</span>
      </button>
      {abierto && (
        <div
          ref={panel}
          id={idPanel}
          role="group"
          aria-label="Ajustar tabla"
          className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Columnas</p>
          {!listo && <p className="px-2 pb-2 text-xs text-slate-500" role="status">Cargando tus columnas…</p>}
          <ul className="max-h-72 overflow-y-auto">
            {orden.filter((id) => porId.has(id)).map((id) => {
              const col = porId.get(id) as ColumnaAjustes;
              const oculta = ocultas.includes(id);
              const unicaVisible = !oculta && visibles.length <= 1;
              const bloqueada = Boolean(col.clave) || unicaVisible;
              const fija = fijas[id];
              return (
                <li key={id} data-columna={id} className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-50">
                  <label
                    className={`flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-700 ${bloqueada || !listo ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    title={col.clave ? 'Esta columna siempre se ve' : unicaVisible ? 'Tiene que quedar al menos una columna' : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={!oculta}
                      disabled={!listo || bloqueada}
                      onChange={() => preferencias.ocultar(id, !oculta)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <span className="min-w-0 truncate">{col.titulo}</span>
                    {col.clave && <Lock size={12} aria-hidden="true" className="shrink-0 text-slate-400" />}
                  </label>
                  {fija ? (
                    <span className="shrink-0 px-1 text-[11px] font-semibold text-slate-400">
                      {fija === 'izquierda' ? 'Fija a la izquierda' : 'Fija a la derecha'}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        data-paso="-1"
                        aria-label={`Subir «${col.titulo}»`}
                        title="Subir"
                        disabled={!listo || !puedeDesplazar(orden, fijas, id, -1)}
                        onClick={() => desplazar(id, -1)}
                        className={FLECHA}
                      >
                        <ChevronUp size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        data-paso="1"
                        aria-label={`Bajar «${col.titulo}»`}
                        title="Bajar"
                        disabled={!listo || !puedeDesplazar(orden, fijas, id, 1)}
                        onClick={() => desplazar(id, 1)}
                        className={FLECHA}
                      >
                        <ChevronDown size={14} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-slate-100 pt-1">
            {anchoRef && (
              <button type="button" onClick={ajustar} disabled={!listo} className={ACCION}>
                <MoveHorizontal size={14} aria-hidden="true" className="shrink-0 text-slate-500" />
                Ajustar al ancho de la pantalla
              </button>
            )}
            <button type="button" onClick={() => preferencias.restablecer()} disabled={!listo} className={ACCION}>
              <RotateCcw size={14} aria-hidden="true" className="shrink-0 text-slate-500" />
              Restablecer columnas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
