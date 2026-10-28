'use client';

import type { ReactNode } from 'react';
import { formatoEntero } from '@/lib/kpis';
import { TAMANOS_PAGINA, paginaValida, rangoPaginas, textoRango, totalPaginas } from '@/lib/tabla';

/**
 * La paginación de la tabla estándar (Bloque 4, T4D; TABLA-base punto 3): 'Mostrando 26–50 de 134' (textoRango), el
 * select de 25 o 50 filas (TAMANOS_PAGINA; el tamaño se recuerda en tabla:<id> por useEstadoTabla) y « ‹ 1 2 3 4 5 › »
 * (rangoPaginas, una ventana de 5 alrededor de la página). Toda la lógica es de lib/tabla.js. Es controlada: TablaEstandar
 * la pinta en su pie con el estado de useEstadoTabla y despacha {tipo: 'pagina'} y {tipo: 'tamano'} (un cambio de
 * tamaño vuelve a la página 1). Sin onTamano no hay select; con una sola página, sin botones.
 */

const BOTON = 'inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg px-1.5 text-xs font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-40';
const INACTIVO = 'text-slate-600 hover:bg-slate-100';
const ACTIVO = 'bg-indigo-600 text-white';

function BotonPagina({
  etiqueta, onClick, deshabilitado, children,
}: {
  etiqueta: string;
  onClick: () => void;
  deshabilitado: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-label={etiqueta} title={etiqueta} onClick={onClick} disabled={deshabilitado} className={`${BOTON} ${INACTIVO}`}>
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

export function Paginacion({
  pagina, tamano, total, onPagina, onTamano,
}: {
  pagina: number;
  tamano: number;
  total: number;
  onPagina: (pagina: number) => void;
  onTamano?: (tamano: number) => void;
}) {
  const paginas = totalPaginas(total, tamano);
  const actual = paginaValida(pagina, total, tamano);
  const ir = (p: number) => {
    if (p !== actual && p >= 1 && p <= paginas) onPagina(p);
  };
  return (
    <nav aria-label="Paginación" className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      <span className="whitespace-nowrap tabular-nums" aria-live="polite">{textoRango(actual, tamano, total)}</span>
      {onTamano && (
        <select
          aria-label="Filas por página"
          value={tamano}
          onChange={(e) => onTamano(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          {TAMANOS_PAGINA.map((t) => (
            <option key={t} value={t}>{`${t} por página`}</option>
          ))}
        </select>
      )}
      {paginas > 1 && (
        <div className="flex items-center gap-0.5">
          <BotonPagina etiqueta="Primera página" onClick={() => ir(1)} deshabilitado={actual <= 1}>«</BotonPagina>
          <BotonPagina etiqueta="Página anterior" onClick={() => ir(actual - 1)} deshabilitado={actual <= 1}>‹</BotonPagina>
          {rangoPaginas(actual, paginas).map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Página ${formatoEntero(n)}`}
              aria-current={n === actual ? 'page' : undefined}
              onClick={() => ir(n)}
              className={`${BOTON} ${n === actual ? ACTIVO : INACTIVO}`}
            >
              {formatoEntero(n)}
            </button>
          ))}
          <BotonPagina etiqueta="Página siguiente" onClick={() => ir(actual + 1)} deshabilitado={actual >= paginas}>›</BotonPagina>
          <BotonPagina etiqueta="Última página" onClick={() => ir(paginas)} deshabilitado={actual >= paginas}>»</BotonPagina>
        </div>
      )}
    </nav>
  );
}
