'use client';

import { useId } from 'react';
import type { AccentColor } from '@/components/ui/colors';
import { TOPS, bloqueSinDatos, colorDeAcento, formatearValor, proporcionesRanking } from '@/lib/analisis';
import type { Etiquetar, FormatoAnalisis, RankingAnalisis } from '@/lib/analisis';

/**
 * ANALISIS-base punto 2 (Bloque 4, T5B; R7 y R13): el ranking de la pestaña Análisis, sobre el bloque `ranking` del
 * contrato.
 *  - Píldoras Top 5 / 10 / 25 (TOPS, aria-pressed) si llega `alCambiarTop`: PanelAnalisis guarda el top y lo manda al
 *    servidor (top=); aquí solo se muestran las primeras `top` filas.
 *  - Cada fila: la posición (las 3 primeras con medalla: oro, plata y bronce), el nombre y el detalle (recortados con su
 *    title: nunca empujan el valor), una barra proporcional al mayor (proporcionesRanking; un negativo queda sin barra)
 *    con el -600 del módulo (colorDeAcento, T5B r1 M8: los -500 de amber, teal y emerald no llegan a 3:1) y el
 *    valor (formatearValor, completo). `columna` va como encabezado del valor.
 *  - `etiquetar(bloque 'ranking', nombre, nombre)` cambia el nombre de cada fila; debe devolver el recibido cuando no lo
 *    conoce.
 *  - ranking null (el módulo no lo tiene): no pinta nada. Sin filas: 'Sin datos en este período'.
 * Clases de Tailwind literales, sin variantes de modo oscuro; foco visible con outline (nunca outline-none).
 */

export type TopRanking = 5 | 10 | 25;

export type PropsRankingTop = {
  ranking: RankingAnalisis | null | undefined;
  /** Cuántas filas mostrar (PanelAnalisis lo recuerda en analisis:<modulo>). */
  top: TopRanking;
  /** Sin él no se pintan las píldoras. */
  alCambiarTop?: (top: TopRanking) => void;
  acento?: AccentColor;
  etiquetar?: Etiquetar;
};

const TARJETA = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs';
const FOCO = 'outline-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';
const PILDORA = `inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold tabular-nums transition-colors ${FOCO}`;
const PILDORA_ACTIVA = 'border-slate-900 bg-slate-900 text-white';
const PILDORA_INACTIVA = 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';
// Oro, plata y bronce: -800 o -700 sobre -100 o -200 (al menos 4,5:1).
const MEDALLA: Record<number, { clases: string; nombre: string }> = {
  1: { clases: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300', nombre: 'Primer lugar' },
  2: { clases: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300', nombre: 'Segundo lugar' },
  3: { clases: 'bg-orange-100 text-orange-800 ring-1 ring-orange-300', nombre: 'Tercer lugar' },
};
const SIN_MEDALLA = 'bg-slate-50 text-slate-600';

export function RankingTop({ ranking, top, alCambiarTop, acento, etiquetar }: PropsRankingTop) {
  const idTitulo = useId();
  if (!ranking) return null;
  const titulo = ranking.titulo || 'Ranking';
  const formato: FormatoAnalisis = ranking.formato ?? 'entero';
  const filas = bloqueSinDatos('ranking', ranking) ? [] : ranking.filas.slice(0, top);
  const anchos = proporcionesRanking(filas);
  const barra = colorDeAcento(acento);

  return (
    <section aria-labelledby={idTitulo} className={TARJETA}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={idTitulo} title={titulo} className="min-w-0 truncate text-sm font-bold text-slate-900">{titulo}</h3>
        {alCambiarTop && (
          <div role="group" aria-label="Cuántos mostrar" className="flex flex-wrap gap-1.5">
            {TOPS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={t === top}
                onClick={() => alCambiarTop(t)}
                className={`${PILDORA} ${t === top ? PILDORA_ACTIVA : PILDORA_INACTIVA}`}
              >
                Top {t}
              </button>
            ))}
          </div>
        )}
      </div>
      {filas.length === 0 ? (
        <p className="mt-3 flex min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 px-3 text-center text-sm font-semibold text-slate-600">
          Sin datos en este período
        </p>
      ) : (
        <>
          {ranking.columna && (
            <p title={ranking.columna} className="mt-2 truncate text-right text-xs font-semibold text-slate-600">{ranking.columna}</p>
          )}
          <ol className="mt-1 space-y-2.5">
            {filas.map((fila, i) => {
              const posicion = fila.posicion ?? i + 1;
              const medalla = MEDALLA[posicion];
              const crudo = fila.nombre || '—';
              const nombre = etiquetar ? etiquetar('ranking', crudo, crudo) : crudo;
              return (
                <li key={`${posicion}-${crudo}-${i}`} className="flex min-w-0 items-start gap-3">
                  <span
                    title={medalla?.nombre}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black tabular-nums ${medalla?.clases ?? SIN_MEDALLA}`}
                  >
                    {posicion}
                  </span>
                  <span className="block min-w-0 flex-1">
                    {/* Si el nombre no tiene 6rem, el valor baja a su propia línea (flex-wrap): nunca «Dist…». */}
                    <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
                      <span title={nombre} className="min-w-0 flex-1 basis-24 truncate text-sm font-semibold text-slate-900">{nombre}</span>
                      <span className="ml-auto shrink-0 whitespace-nowrap text-sm font-bold text-slate-900 tabular-nums">
                        {formatearValor(fila.valor, formato)}
                      </span>
                    </span>
                    {fila.detalle && <span title={fila.detalle} className="block truncate text-xs text-slate-600">{fila.detalle}</span>}
                    <span aria-hidden="true" className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full" style={{ width: `${anchos[i]}%`, backgroundColor: barra }} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
