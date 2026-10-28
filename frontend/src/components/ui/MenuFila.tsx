'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis } from 'lucide-react';
import { posicionMenu } from '@/lib/tabla';

/**
 * El ÚNICO menú ⋯ de la app (Bloque 4, T4A; TABLA-base punto 3, R11 y C1): lo usan las filas de las tablas y las
 * tarjetas del tablero.
 *  - Se abre con clic (no con el mouse encima), en un portal sobre document.body con posición fija: nunca queda
 *    cortado por el borde de la tabla. Se alinea al borde derecho del botón y abre hacia arriba si no cabe abajo
 *    (posicionMenu de lib/tabla.js).
 *  - Esc, un clic afuera, un scroll (de la página o de la tabla) o cambiar el tamaño de la ventana lo cierran. Con el
 *    teclado: flechas, Inicio y Fin recorren los ítems; Tab lo cierra.
 *  - Ni el botón ni el menú dejan pasar el clic o el puntero a la fila o a la tarjeta de debajo (los eventos de un
 *    portal suben por el árbol de React): abrir el menú no abre el documento ni empieza un arrastre.
 *  - Ítems {etiqueta, icono, onClick, peligro, oculto}; además deshabilitado (se ve y no hace nada) y titulo (el
 *    porqué, al pasar el mouse; en un ítem deshabilitado también una segunda línea visible, T4B r1). Sin ítems visibles
 *    no pinta nada.
 */

export type ItemMenuFila = {
  etiqueta: string;
  icono?: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  peligro?: boolean;
  oculto?: boolean;
  deshabilitado?: boolean;
  titulo?: string;
};

const ITEM = '[role="menuitem"]';

/**
 * Enfoca un ítem sin mover la página y, si el menú está recortado (altoMaximo) y el ítem no se ve, lo trae a la vista
 * dentro del menú (T4A r1). El scroll del propio menú no lo cierra (alDesplazar lo ignora).
 */
function enfocar(item: HTMLElement | null | undefined) {
  if (!item) return;
  item.focus({ preventScroll: true });
  item.scrollIntoView({ block: 'nearest' });
}

export function MenuFila({
  items, etiqueta = 'Acciones',
}: {
  items: ItemMenuFila[];
  /** El nombre del botón ⋯ (aria-label y title). */
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const idMenu = useId();
  const visibles = items.filter((item) => !item.oculto);

  const cerrar = useCallback((devolverFoco: boolean) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus({ preventScroll: true });
  }, []);

  // Al abrir: se mide y se ubica antes de pintarse (sin parpadeo), y el foco pasa al primer ítem.
  useLayoutEffect(() => {
    const b = boton.current;
    const m = menu.current;
    if (!abierto || !b || !m) return;
    const p = posicionMenu(
      b.getBoundingClientRect(),
      { ancho: m.offsetWidth, alto: m.offsetHeight },
      { ancho: window.innerWidth, alto: window.innerHeight },
    );
    m.style.top = `${p.top}px`;
    m.style.left = `${p.left}px`;
    m.style.maxHeight = `${p.altoMaximo}px`;
    m.style.visibility = 'visible';
    enfocar(m.querySelector<HTMLElement>(ITEM));
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const dentro = (objetivo: EventTarget | null) =>
      objetivo instanceof Node && (!!menu.current?.contains(objetivo) || !!boton.current?.contains(objetivo));
    const alPresionar = (e: PointerEvent) => {
      if (!dentro(e.target)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Solo cierra el menú: no se propaga a la ventana de la página que esté debajo.
      e.preventDefault();
      e.stopPropagation();
      cerrar(true);
    };
    const alDesplazar = (e: Event) => {
      if (!(e.target instanceof Node && menu.current?.contains(e.target))) setAbierto(false);
    };
    const alRedimensionar = () => setAbierto(false);
    document.addEventListener('pointerdown', alPresionar, true);
    document.addEventListener('keydown', alTeclear, true);
    window.addEventListener('scroll', alDesplazar, true);
    window.addEventListener('resize', alRedimensionar);
    return () => {
      document.removeEventListener('pointerdown', alPresionar, true);
      document.removeEventListener('keydown', alTeclear, true);
      window.removeEventListener('scroll', alDesplazar, true);
      window.removeEventListener('resize', alRedimensionar);
    };
  }, [abierto, cerrar]);

  if (!visibles.length) return null;

  const elegir = (item: ItemMenuFila) => {
    if (item.deshabilitado) return;
    cerrar(true);
    item.onClick();
  };

  const teclaEnMenu = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const opciones = Array.from(menu.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    if (!opciones.length) return;
    const i = opciones.indexOf(document.activeElement as HTMLElement);
    const ultimo = opciones.length - 1;
    let destino: HTMLElement | null = null;
    if (e.key === 'ArrowDown') destino = opciones[i < 0 || i === ultimo ? 0 : i + 1];
    else if (e.key === 'ArrowUp') destino = opciones[i <= 0 ? ultimo : i - 1];
    else if (e.key === 'Home') destino = opciones[0];
    else if (e.key === 'End') destino = opciones[ultimo];
    else if (e.key === 'Tab') {
      e.preventDefault();
      cerrar(true);
      return;
    }
    if (destino) {
      e.preventDefault();
      enfocar(destino);
    }
  };

  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-label={etiqueta}
        title={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setAbierto((a) => !a);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'ArrowDown' && !abierto) {
            e.preventDefault();
            setAbierto(true);
          }
        }}
        className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 aria-expanded:bg-slate-100 aria-expanded:text-slate-700"
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {abierto && createPortal(
        <div
          ref={menu}
          id={idMenu}
          role="menu"
          aria-label={etiqueta}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={teclaEnMenu}
          className="invisible fixed z-[55] min-w-[12rem] max-w-[18rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
        >
          {visibles.map((item, i) => {
            const Icono = item.icono;
            return (
              <button
                key={`${i}-${item.etiqueta}`}
                type="button"
                role="menuitem"
                aria-disabled={item.deshabilitado || undefined}
                // T4B r2: con el motivo a la vista (segunda línea), sin el mismo texto en title: no se lee dos veces.
                title={item.deshabilitado && item.titulo ? undefined : item.titulo}
                onClick={() => elegir(item)}
                className={`group flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold outline-none aria-disabled:cursor-not-allowed ${
                  item.peligro ? 'text-rose-600 hover:bg-rose-50 focus:bg-rose-50' : 'text-slate-700 hover:bg-slate-50 focus:bg-slate-100'
                }`}
              >
                {Icono && <Icono size={14} className="mt-[3px] shrink-0 group-aria-disabled:opacity-50" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate group-aria-disabled:opacity-50">{item.etiqueta}</span>
                  {/* T4B r1: el porqué de un ítem deshabilitado se lee (teclado y celular no tienen title). r2: con el foco o
                      el mouse encima el fondo cambia (slate-100, rose-50) y el motivo pasa a slate-600 (4,5:1 o más). */}
                  {item.deshabilitado && item.titulo && (
                    <span className="mt-0.5 block whitespace-normal break-words text-[11px] text-slate-500 group-hover:text-slate-600 group-focus:text-slate-600 font-normal leading-snug">{item.titulo}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
