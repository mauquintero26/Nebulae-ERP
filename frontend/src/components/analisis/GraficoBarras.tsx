'use client';

import { useId, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import type { AccentColor } from '@/components/ui/colors';
import {
  altoGraficoBarras, bloqueSinDatos, colorDeAcento, coloresSeries, etiquetaEje, etiquetaFecha, formatearValor,
  recortarEtiqueta, resumenAccesible, valoresConSigno,
} from '@/lib/analisis';
import type { BarrasAnalisis, Etiquetar, FormatoAnalisis, Granularidad } from '@/lib/analisis';
import { ESTILO_TOOLTIP, registrarGraficos } from './registro';

registrarGraficos();

/**
 * ANALISIS-base punto 2 (Bloque 4, T5B; R7 y R13): el gráfico de barras de la pestaña Análisis (<Bar> de
 * react-chartjs-2), sobre el bloque `barras` del contrato.
 *  - Con eje 'fechas', barras verticales (las fechas con etiquetaFecha y la `granularidad` del período, a lo sumo 8
 *    marcas; alto de 256 px). Con eje 'categorias', horizontales (la etiqueta recortada en el eje con recortarEtiqueta,
 *    completa en el tooltip y en la tabla; alto de altoGraficoBarras).
 *  - El tono 'negativo' dibuja la barra hacia abajo (valoresConSigno), como el flujo de caja de la referencia; el
 *    tooltip y la tabla muestran el valor que manda el servidor. Colores con coloresSeries: positivo en POSITIVO,
 *    negativo en NEGATIVO y la primera serie neutra con el color del módulo (colorDeAcento(acento)).
 *  - `apiladas` las apila (en los dos ejes; las negativas se apilan hacia abajo).
 *  - Con 2 o más series, una leyenda HTML (aria-hidden: la tabla ya nombra las series).
 *  - `etiquetar(bloque 'barras', clave, etiqueta)` cambia el nombre de cada serie (con su clave) y de cada categoría (con
 *    la etiqueta como clave); debe devolver la etiqueta recibida cuando no conoce la clave.
 *  - El <canvas role="img"> lleva aria-label = resumenAccesible(barras) y una <table> dentro de una caja sr-only.
 *  - barras null (el módulo no las tiene): no pinta nada. Sin datos (bloqueSinDatos): no se dibuja, 'Sin datos en este
 *    período'.
 * Clases de Tailwind literales, sin variantes de modo oscuro; los textos con al menos 4,5:1.
 */

export type PropsGraficoBarras = {
  barras: BarrasAnalisis | null | undefined;
  /** La de periodo.granularidad del contrato (por defecto 'dia'); solo cuenta con eje 'fechas'. */
  granularidad?: Granularidad | null;
  acento?: AccentColor;
  etiquetar?: Etiquetar;
};

const TARJETA = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs';
const FORMATOS_ENTEROS: ReadonlyArray<FormatoAnalisis> = ['entero', 'numero', 'unidades'];

export function GraficoBarras({ barras, granularidad, acento, etiquetar }: PropsGraficoBarras) {
  const idTitulo = useId();
  const gran: Granularidad = granularidad ?? 'dia';
  const formato: FormatoAnalisis = barras?.formato ?? 'entero';
  const horizontal = barras?.eje === 'categorias';
  const apiladas = Boolean(barras?.apiladas);
  const colorModulo = colorDeAcento(acento);

  const etiquetas = useMemo(() => {
    const crudas = barras?.etiquetas ?? [];
    return crudas.map((e) => {
      const texto = String(e ?? '');
      if (!horizontal) return etiquetaFecha(texto, gran);
      return etiquetar ? etiquetar('barras', texto, texto) : texto;
    });
  }, [barras, horizontal, gran, etiquetar]);

  const series = useMemo(() => {
    const crudas = barras?.series ?? [];
    const colores = coloresSeries(crudas, colorModulo);
    return crudas.map((s, i) => {
      const original = s.etiqueta || 'Serie';
      return {
        etiqueta: etiquetar ? etiquetar('barras', String(s.clave ?? ''), original) : original,
        valores: s.valores,
        dibujados: valoresConSigno(s),
        color: colores[i],
      };
    });
  }, [barras, colorModulo, etiquetar]);

  const datos = useMemo((): ChartData<'bar', Array<number | null>, string> => ({
    labels: etiquetas,
    datasets: series.map((s) => ({
      label: s.etiqueta,
      data: s.dibujados,
      backgroundColor: s.color,
      borderRadius: 4,
      maxBarThickness: horizontal ? 18 : 28,
    })),
  }), [etiquetas, series, horizontal]);

  const opciones = useMemo((): ChartOptions<'bar'> => {
    const ejeValores = {
      stacked: apiladas,
      beginAtZero: true,
      grid: { color: '#e2e8f0' },
      border: { display: false },
      ticks: {
        maxTicksLimit: 5,
        precision: FORMATOS_ENTEROS.includes(formato) ? 0 : undefined,
        callback: (valor: number | string) => etiquetaEje(valor, formato),
      },
    };
    const ejeCategorias = {
      stacked: apiladas,
      grid: { display: false },
      border: { display: false },
      ticks: horizontal
        ? { autoSkip: false, callback: (valor: number | string) => recortarEtiqueta(etiquetas[Number(valor)]) }
        : { autoSkip: true, maxTicksLimit: 8, maxRotation: 0, callback: (valor: number | string) => etiquetas[Number(valor)] ?? '' },
    };
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...ESTILO_TOOLTIP,
          callbacks: {
            title: (items) => (items.length ? etiquetas[items[0].dataIndex] ?? '' : ''),
            // El valor que manda el servidor (una salida se lee '5 u.', no '-5 u.').
            label: (item) => `${item.dataset.label ?? ''}: ${formatearValor(series[item.datasetIndex]?.valores[item.dataIndex], formato)}`,
          },
        },
      },
      scales: horizontal ? { x: ejeValores, y: ejeCategorias } : { x: ejeCategorias, y: ejeValores },
    };
  }, [apiladas, formato, horizontal, etiquetas, series]);

  if (!barras) return null;
  const titulo = barras.titulo || 'Comparación';
  const sinDatos = bloqueSinDatos('barras', barras);
  const alto = altoGraficoBarras(barras.eje, etiquetas.length);

  return (
    <section aria-labelledby={idTitulo} className={TARJETA}>
      <h3 id={idTitulo} title={titulo} className="truncate text-sm font-bold text-slate-900">{titulo}</h3>
      {sinDatos ? (
        <p className="mt-3 flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm font-semibold text-slate-600">
          Sin datos en este período
        </p>
      ) : (
        <>
          {series.length > 1 && (
            <ul aria-hidden="true" className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {series.map((s, i) => (
                <li key={`${s.etiqueta}-${i}`} className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span title={s.etiqueta} className="min-w-0 truncate">{s.etiqueta}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="relative mt-2 w-full min-w-0" style={{ height: alto }}>
            <Bar data={datos} options={opciones} role="img" aria-label={resumenAccesible({ ...barras, series })} />
          </div>
          {/* Una <table> no obedece width:1px ni overflow:hidden (se ensancha con su contenido): la caja sr-only de
              afuera la recorta. Con sr-only en la <table>, la página se desplazaba 135 px de lado a 375 px. */}
          <div className="sr-only">
            <table>
              <caption>{titulo}</caption>
              <thead>
                <tr>
                  <th scope="col">{horizontal ? 'Categoría' : 'Fecha'}</th>
                  {series.map((s, i) => <th key={`${s.etiqueta}-${i}`} scope="col">{s.etiqueta}</th>)}
                </tr>
              </thead>
              <tbody>
                {etiquetas.map((etiqueta, i) => (
                  <tr key={`${etiqueta}-${i}`}>
                    <th scope="row">{etiqueta}</th>
                    {series.map((s, j) => <td key={`${s.etiqueta}-${j}`}>{formatearValor(s.valores[i], formato)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
