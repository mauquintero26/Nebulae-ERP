'use client';

import { useId, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartData, ChartOptions, ScriptableContext } from 'chart.js';
import type { AccentColor } from '@/components/ui/colors';
import {
  bloqueSinDatos, colorDeAcento, coloresSeries, conAlfa, etiquetaEje, etiquetaFecha, formatearValor, resumenAccesible,
  valoresConSigno,
} from '@/lib/analisis';
import type { FormatoAnalisis, Granularidad, LineaAnalisis, MejorAnalisis } from '@/lib/analisis';
import { tamanoValor, variacionPct } from '@/lib/kpis';
import { ChipVariacion } from './ChipVariacion';
import { COLOR_EJES, ESTILO_TOOLTIP, registrarGraficos } from './registro';

registrarGraficos();

/**
 * ANALISIS-base punto 2 (Bloque 4, T5B; R7 y R13): el gráfico de línea de la pestaña Análisis (<Line> de
 * react-chartjs-2), sobre el bloque `linea` del contrato (normalizarAnalisis).
 *  - Encabezado: el título, el total en grande (formatearValor, completo; la letra se achica con tamanoValor) y
 *    ChipVariacion con el total contra el total anterior (`mejor`, por defecto 'sube').
 *  - La serie del período lleva el color del módulo (colorDeAcento(acento), el -600) con un área en degradado; la del
 *    período anterior (es_anterior) va gris (COLOR_ANTERIOR) punteada y sin área. Los puntos están ocultos y aparecen
 *    de 4 px al pasar el mouse.
 *  - Eje Y con etiquetaEje (pesosCorto o enteros); eje X con etiquetaFecha (`granularidad` del período), a lo sumo 8
 *    marcas. Tooltips con la fecha y formatearValor. Alto fijo de 256 px (maintainAspectRatio: false).
 *  - El <canvas role="img"> lleva aria-label = resumenAccesible(linea) y una <table> con los datos dentro de una caja sr-only
 *    (caption «Datos del gráfico»: el título ya es el nombre de la región y el h3); la leyenda visible va con aria-hidden
 *    (la tabla ya nombra las series). Con el gráfico dibujado, el total y el chip del encabezado también van con
 *    aria-hidden: el aria-label del canvas ya dice los dos (T5B r1, M9). Sin datos no hay canvas y los dos se leen.
 *  - El texto de las marcas de los ejes en COLOR_EJES (en las opciones, no en ChartJS.defaults.color).
 *  - linea null (el módulo no la tiene): no pinta nada. Sin datos en el período (bloqueSinDatos): 'Sin datos en este
 *    período' en lugar del gráfico, con el encabezado.
 * Clases de Tailwind literales, sin variantes de modo oscuro; los textos con al menos 4,5:1.
 */

export type PropsGraficoLinea = {
  linea: LineaAnalisis | null | undefined;
  /** La de periodo.granularidad del contrato (por defecto 'dia'). */
  granularidad?: Granularidad | null;
  acento?: AccentColor;
  /** Si subir es bueno ('sube'), malo ('baja') o ninguna de las dos ('neutro'), para el tono del chip. */
  mejor?: MejorAnalisis;
  /** El final del texto para lectores de pantalla (por defecto, 'frente al período anterior'). */
  frente?: string;
};

const TARJETA = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs';
const FORMATOS_ENTEROS: ReadonlyArray<FormatoAnalisis> = ['entero', 'numero', 'unidades'];

/** El degradado del área: el color del módulo arriba, transparente abajo. */
function degradado(contexto: ScriptableContext<'line'>, color: string): CanvasGradient | string {
  const { ctx, chartArea } = contexto.chart;
  if (!chartArea) return conAlfa(color, 0.15);
  const relleno = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  relleno.addColorStop(0, conAlfa(color, 0.28));
  relleno.addColorStop(1, conAlfa(color, 0));
  return relleno;
}

export function GraficoLinea({ linea, granularidad, acento, mejor = 'sube', frente }: PropsGraficoLinea) {
  const idTitulo = useId();
  const gran: Granularidad = granularidad ?? 'dia';
  const formato: FormatoAnalisis = linea?.formato ?? 'entero';
  const colorModulo = colorDeAcento(acento);

  const series = useMemo(() => {
    const crudas = linea?.series ?? [];
    const colores = coloresSeries(crudas, colorModulo);
    // Solo la primera serie del período lleva el área en degradado.
    const conArea = crudas.findIndex((s) => s.es_anterior !== true);
    return crudas.map((s, i) => {
      const anterior = s.es_anterior === true;
      return {
        etiqueta: s.etiqueta || (anterior ? 'Período anterior' : 'Este período'),
        valores: valoresConSigno({ valores: s.valores }),
        color: colores[i],
        anterior,
        area: i === conArea,
      };
    });
  }, [linea, colorModulo]);

  const fechas = useMemo(() => linea?.fechas ?? [], [linea]);

  const datos = useMemo((): ChartData<'line', Array<number | null>, string> => ({
    labels: [...fechas],
    datasets: series.map((s) => ({
      label: s.etiqueta,
      data: s.valores,
      borderColor: s.color,
      backgroundColor: s.area ? (contexto: ScriptableContext<'line'>) => degradado(contexto, s.color) : 'transparent',
      fill: s.area ? 'origin' : false,
      borderDash: s.anterior ? [6, 4] : [],
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHitRadius: 8,
      pointBackgroundColor: s.color,
      pointBorderColor: s.color,
      order: s.anterior ? 2 : 1,
    })),
  }), [fechas, series]);

  const opciones = useMemo((): ChartOptions<'line'> => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...ESTILO_TOOLTIP,
        callbacks: {
          title: (items) => (items.length ? etiquetaFecha(fechas[items[0].dataIndex], gran) : ''),
          label: (item) => `${item.dataset.label ?? ''}: ${formatearValor(item.raw, formato)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: COLOR_EJES,
          autoSkip: true,
          maxTicksLimit: 8,
          maxRotation: 0,
          callback: (valor) => etiquetaFecha(fechas[Number(valor)], gran),
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: '#e2e8f0' },
        border: { display: false },
        ticks: {
          color: COLOR_EJES,
          maxTicksLimit: 5,
          precision: FORMATOS_ENTEROS.includes(formato) ? 0 : undefined,
          callback: (valor) => etiquetaEje(valor, formato),
        },
      },
    },
  }), [fechas, gran, formato]);

  if (!linea) return null;
  const titulo = linea.titulo || 'En el tiempo';
  const total = formatearValor(linea.total, formato);
  const sinDatos = bloqueSinDatos('linea', linea);
  // El chip se oculta al lector solo si el aria-label del canvas ya dice la variación; sin período anterior («—») no la
  // dice, y el chip («Sin comparación con el período anterior») se lee.
  const chipOculto = !sinDatos && variacionPct(linea.total, linea.total_anterior) !== null;

  return (
    <section aria-labelledby={idTitulo} className={TARJETA}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <h3 id={idTitulo} title={titulo} className="truncate text-sm font-bold text-slate-900">{titulo}</h3>
          <p aria-hidden={sinDatos ? undefined : true} title={total} className={`${tamanoValor(total)} break-words font-black leading-tight text-slate-900 tabular-nums`}>
            {total}
          </p>
        </div>
        <span aria-hidden={chipOculto ? true : undefined} className="shrink-0">
          <ChipVariacion kpi={{ valor: linea.total, anterior: linea.total_anterior, mejor }} frente={frente} />
        </span>
      </div>
      {sinDatos ? (
        <p className="mt-3 flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm font-semibold text-slate-600">
          Sin datos en este período
        </p>
      ) : (
        <>
          <ul aria-hidden="true" className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {series.map((s, i) => (
              <li key={`${s.etiqueta}-${i}`} className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-600">
                <span className="w-4 shrink-0 border-t-2" style={{ borderTopColor: s.color, borderTopStyle: s.anterior ? 'dashed' : 'solid' }} />
                <span title={s.etiqueta} className="min-w-0 truncate">{s.etiqueta}</span>
              </li>
            ))}
          </ul>
          <div className="relative mt-2 h-64 w-full min-w-0">
            <Line data={datos} options={opciones} role="img" aria-label={resumenAccesible(linea, frente ? { frente } : {})} />
          </div>
          {/* Una <table> no obedece width:1px ni overflow:hidden (se ensancha con su contenido): la caja sr-only de
              afuera la recorta. Con sr-only en la <table>, la página se desplazaba 135 px de lado a 375 px. */}
          <div className="sr-only">
            <table>
              <caption>Datos del gráfico</caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  {series.map((s, i) => <th key={`${s.etiqueta}-${i}`} scope="col">{s.etiqueta}</th>)}
                </tr>
              </thead>
              <tbody>
                {fechas.map((fecha, i) => (
                  <tr key={`${fecha}-${i}`}>
                    <th scope="row">{etiquetaFecha(fecha, gran)}</th>
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
