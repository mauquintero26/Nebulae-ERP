'use client';
import type { ComponentType } from 'react';

/**
 * B3 T18 r1: la forma de las pastillas del menú lateral (AlertasBadge): la roja de atrasados y las ámbar de cambios del
 * cliente. Un botón a todo el ancho con el ícono y el texto; con el menú contraído (`colapsado`), solo el ícono y el
 * número en una insignia. Los colores los pone cada llamador como clases literales (Tailwind v4 las detecta así):
 * `claseBoton` (fondo, texto, borde y hover), `claseIcono` y `claseInsignia` (fondo y texto del número). El title y el
 * aria-label dicen adónde lleva.
 */
export function PastillaMenuLateral({ texto, cantidad, colapsado, onClick, icono: Icono, claseBoton, claseIcono,
  claseInsignia, title, 'aria-label': ariaLabel }: {
  texto: string;
  cantidad: number | string;
  colapsado: boolean;
  onClick: () => void;
  icono: ComponentType<{ className?: string }>;
  claseBoton: string;
  claseIcono: string;
  claseInsignia: string;
  title: string;
  'aria-label': string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-full items-center rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${claseBoton} ${colapsado ? 'justify-center' : ''}`}
      title={title}
      aria-label={ariaLabel}
    >
      <Icono className={`w-5 h-5 shrink-0 ${claseIcono} ${colapsado ? '' : 'mr-3'}`} />
      {colapsado ? (
        <span className={`absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black ${claseInsignia}`}>
          {cantidad}
        </span>
      ) : (
        // T18 r2: salto de línea en vez de «…» («2 solicitudes con cambios» no cabe en una línea del menú).
        <span className="min-w-0 text-left leading-snug">{texto}</span>
      )}
    </button>
  );
}
