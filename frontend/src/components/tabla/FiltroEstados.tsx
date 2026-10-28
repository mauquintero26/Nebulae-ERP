'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ListFilter } from 'lucide-react';
import { Contador } from '@/components/ui/Contador';
import { alternarEstado, opcionesConMarcados, posicionPanel } from '@/lib/tabla';
import type { OpcionEstado } from '@/lib/tabla';

/**
 * El filtro de estados de la tabla estándar (Bloque 4, T4D y r1; TABLA-base punto 3, R5 y C3): un botón con cuántos
 * estados hay filtrados (Contador, C13) que abre un panel con una casilla por estado, con su etiqueta legible (la de
 * estados-*.js, nunca el código), y 'Limpiar'. Es controlado: `seleccion` es estado.estados de useEstadoTabla y
 * onCambiar despacha {tipo: 'estados', valor} (vuelve a la página 1; R5).
 *  - r1, punto 5: un filtro nunca queda escondido. El contador y 'Limpiar' cuentan TODO `seleccion`, y el panel muestra
 *    también, marcados, los estados que la pestaña no tiene (los dejó una tarjeta, una caja del flujo o la sesión
 *    restaurada), con su etiqueta si se conoce (`etiquetas`, las de todas las pestañas) o el valor crudo si no, para
 *    poder desmarcarlos (opcionesConMarcados). El botón se pinta si hay opciones o si hay algo filtrado.
 *  - Cada casilla deja los estados en el orden de la lista (alternarEstado).
 *  - El panel se cierra con Esc (sin que llegue a la pantalla completa; el foco vuelve al botón) o con un clic afuera,
 *    y no se sale de la ventana (posicionPanel; máximo el ancho de la pantalla menos 2rem). 'Limpiar' devuelve el foco
 *    al botón (se deshabilita).
 *  - r2, punto 4: el panel se ve solo con algo en la lista (`visible`), y sus oyentes (Esc y clic afuera) dependen de
 *    eso. Si la lista queda vacía (una pestaña sin opciones y 'Limpiar' o desmarcar el último), se cierra, el
 *    componente no pinta nada y el foco, que se quedaría en el body, va al destino estable que le da la barra
 *    (`alQuedarVacio`: la búsqueda, o la pestaña activa). Ningún oyente queda vivo para tragarse el próximo Esc.
 */

export type { OpcionEstado } from '@/lib/tabla';

export function FiltroEstados({
  opciones, seleccion, onCambiar, etiqueta = 'Estado', etiquetas, alQuedarVacio,
}: {
  opciones: ReadonlyArray<OpcionEstado>;
  seleccion: ReadonlyArray<string>;
  onCambiar: (estados: string[]) => void;
  /** El texto del botón. */
  etiqueta?: string;
  /** Las etiquetas legibles que se conocen ({valor: etiqueta}), para un estado filtrado que la pestaña no tiene. */
  etiquetas?: Readonly<Record<string, string>>;
  /** r2: adónde va el foco cuando el panel se cierra porque la lista quedó vacía (el botón ya no se pinta). */
  alQuedarVacio?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const idPanel = useId();
  const lista = opcionesConMarcados(opciones, seleccion, etiquetas);
  const visible = abierto && lista.length > 0;
  // La lista quedó vacía con el panel abierto: se cierra (si vuelve a llenarse, no reaparece abierto).
  if (abierto && !lista.length) setAbierto(false);
  // Si se cerró así, con el panel abierto, y el foco quedó en el body (el botón ya no está), va al destino de la barra.
  const estabaVisible = useRef(false);
  useEffect(() => {
    const antes = estabaVisible.current;
    estabaVisible.current = visible;
    const sinFoco = document.activeElement === null || document.activeElement === document.body;
    if (antes && !visible && !lista.length && sinFoco) alQuedarVacio?.();
  }, [visible, lista.length, alQuedarVacio]);

  // Al abrir: el panel se ubica dentro de la ventana (antes de pintarse) y el foco va a la primera casilla.
  useLayoutEffect(() => {
    const b = boton.current;
    const p = panel.current;
    if (!visible || !b || !p) return;
    p.style.left = `${posicionPanel({ boton: b.getBoundingClientRect(), ancho: p.offsetWidth, ventana: window.innerWidth, alinear: 'izquierda' })}px`;
    p.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus({ preventScroll: true });
  }, [visible]);

  // Revisión de r2: al desmarcar un estado que la pestaña no tiene, su fila desaparece y el foco caería al body con el
  // panel abierto; vuelve a la primera casilla habilitada.
  useLayoutEffect(() => {
    if (!visible) return;
    const activo = document.activeElement;
    if (activo !== null && activo !== document.body) return;
    panel.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus({ preventScroll: true });
  }, [visible, lista.length]);

  useEffect(() => {
    if (!visible) return undefined;
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
  }, [visible]);

  if (!lista.length) return null;

  return (
    <div ref={caja} className="relative">
      <button
        ref={boton}
        type="button"
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        onClick={() => setAbierto((a) => !a)}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
          seleccion.length ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <ListFilter size={14} aria-hidden="true" />
        {etiqueta}
        {seleccion.length > 0 && (
          <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] text-white">
            <Contador valor={seleccion.length} />
          </span>
        )}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {visible && (
        <div
          ref={panel}
          id={idPanel}
          role="group"
          aria-label={`Filtrar por ${etiqueta.toLowerCase()}`}
          className="absolute left-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <div className="max-h-72 overflow-y-auto">
            {lista.map((o) => (
              <label key={o.valor} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={seleccion.includes(o.valor)}
                  onChange={() => onCambiar(alternarEstado(seleccion, o.valor, lista))}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-indigo-600"
                />
                <span className="min-w-0 truncate" title={o.etiqueta}>{o.etiqueta}</span>
              </label>
            ))}
          </div>
          <div className="mt-1 flex justify-end border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => {
                onCambiar([]);
                boton.current?.focus({ preventScroll: true });
              }}
              disabled={!seleccion.length}
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
