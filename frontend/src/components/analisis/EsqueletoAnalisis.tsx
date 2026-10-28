'use client';

import { GRILLA_ANALISIS } from '@/lib/analisis';
import { clasesFranja } from '@/lib/kpis';

/**
 * ANALISIS-base puntos 2 y 3 (Bloque 4, T5B; H6): el esqueleto de la pestaña Análisis mientras carga, con la MISMA
 * grilla que PanelAnalisis (GRILLA_ANALISIS de lib/analisis.js, container queries de Tailwind v4: la raíz es
 * @container) y bloques grises del tamaño de cada pieza. Nunca ceros.
 *  - Fila 1: `kpis` tarjetas (por defecto 4) con la grilla de FranjaKpis (clasesFranja de lib/kpis.js, R12) en su propio
 *    @container, como la franja real.
 *  - Fila 2: la línea (256 px), la dona (176 px) y los movimientos; fila 3: el ranking y las barras (256 px).
 *  - `barra` (por defecto true) agrega arriba la fila del selector de período; PanelAnalisis pasa barra={false} cuando
 *    su barra real ya está pintada.
 *  - role="status" con aria-busy y el texto 'Cargando el análisis…' para lectores de pantalla; los bloques van con
 *    aria-hidden. El pulso respeta prefers-reduced-motion (motion-safe:animate-pulse).
 * Para PanelAnalisisPerezoso (T5C): loading: () => <EsqueletoAnalisis />.
 * Clases de Tailwind literales, sin variantes de modo oscuro.
 */

export type PropsEsqueletoAnalisis = {
  /** Cuántas tarjetas de indicadores (1 a 6; por defecto 4). */
  kpis?: number;
  /** La fila del selector de período arriba (por defecto true). */
  barra?: boolean;
};

const GRIS = 'bg-slate-200 motion-safe:animate-pulse';
const TARJETA = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs';

function Linea({ ancho, alto = 'h-3' }: { ancho: string; alto?: string }) {
  return <span className={`block rounded ${alto} ${ancho} ${GRIS}`} />;
}

export function EsqueletoAnalisis({ kpis = 4, barra = true }: PropsEsqueletoAnalisis) {
  const n = Math.min(6, Math.max(1, Math.trunc(Number(kpis)) || 4));
  return (
    <div role="status" aria-busy="true" className={GRILLA_ANALISIS.raiz}>
      <span className="sr-only">Cargando el análisis…</span>
      <div aria-hidden="true" className={GRILLA_ANALISIS.filas}>
        {barra && (
          <div className="flex flex-wrap items-center gap-2">
            {['w-16', 'w-20', 'w-20', 'w-20', 'w-24', 'w-28'].map((ancho, i) => (
              <span key={i} className={`h-8 rounded-full ${ancho} ${GRIS}`} />
            ))}
          </div>
        )}
        <div className="@container">
          <div className={`grid gap-3 ${clasesFranja(n)}`}>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="flex min-h-[88px] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <span className={`h-10 w-10 shrink-0 rounded-xl ${GRIS}`} />
                <span className="block min-w-0 flex-1 space-y-2">
                  <Linea ancho="w-24" />
                  <Linea ancho="w-28" alto="h-7" />
                  <Linea ancho="w-32" />
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className={GRILLA_ANALISIS.fila2}>
          <div className={GRILLA_ANALISIS.linea}>
            <div className={TARJETA}>
              <div className="flex items-start justify-between gap-3">
                <span className="block space-y-2">
                  <Linea ancho="w-32" />
                  <Linea ancho="w-36" alto="h-7" />
                </span>
                <Linea ancho="w-16" alto="h-5" />
              </div>
              <span className={`mt-4 block h-64 w-full rounded-xl ${GRIS}`} />
            </div>
          </div>
          <div className={GRILLA_ANALISIS.dona}>
            <div className={TARJETA}>
              <Linea ancho="w-32" />
              <span className={`mx-auto mt-3 block h-44 w-44 max-w-full rounded-full ${GRIS}`} />
              <span className="mt-3 block space-y-2">
                {['w-full', 'w-11/12', 'w-10/12', 'w-9/12'].map((ancho, i) => <Linea key={i} ancho={ancho} />)}
              </span>
            </div>
          </div>
          <div className={GRILLA_ANALISIS.movimientos}>
            <div className={TARJETA}>
              <Linea ancho="w-36" />
              <span className="mt-3 block space-y-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className="flex items-start gap-3">
                    <span className={`h-8 w-8 shrink-0 rounded-lg ${GRIS}`} />
                    <span className="block min-w-0 flex-1 space-y-1.5">
                      <Linea ancho="w-full" />
                      <Linea ancho="w-2/3" />
                    </span>
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>
        <div className={GRILLA_ANALISIS.fila3}>
          <div className={GRILLA_ANALISIS.ranking}>
            <div className={TARJETA}>
              <div className="flex items-center justify-between gap-3">
                <Linea ancho="w-32" />
                <Linea ancho="w-36" alto="h-6" />
              </div>
              <span className="mt-4 block space-y-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className="flex items-center gap-3">
                    <span className={`h-7 w-7 shrink-0 rounded-full ${GRIS}`} />
                    <span className="block min-w-0 flex-1 space-y-1.5">
                      <Linea ancho="w-full" />
                      <Linea ancho="w-full" alto="h-1.5" />
                    </span>
                  </span>
                ))}
              </span>
            </div>
          </div>
          <div className={GRILLA_ANALISIS.barras}>
            <div className={TARJETA}>
              <Linea ancho="w-40" />
              <span className={`mt-4 block h-64 w-full rounded-xl ${GRIS}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
