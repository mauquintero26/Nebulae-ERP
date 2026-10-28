'use client';

import { useId, useMemo, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import {
  bloqueSinDatos, colorSegmento, formatearValor, resumenAccesible, tamanoCentroDona, valoresConSigno,
} from '@/lib/analisis';
import type { DonaAnalisis, Etiquetar, FormatoAnalisis } from '@/lib/analisis';
import { ESTILO_TOOLTIP, registrarGraficos } from './registro';

registrarGraficos();

/**
 * ANALISIS-base punto 2 (Bloque 4, T5B; R7 y R13): la dona de la pestaña Análisis (<Doughnut> de react-chartjs-2,
 * cutout 72 %), sobre el bloque `donas` del contrato.
 *  - El total va en el centro en HTML encima del canvas (sin plugin), con pointer-events-none: no se come el mouse
 *    del gráfico. La letra se achica con el largo (tamanoCentroDona).
 *  - La leyenda es HTML: color, etiqueta (recortada con su title), valor y %. Los colores salen de colorSegmento (la
 *    PALETA en orden; 'Otros' y los 'Sin …' en gris).
 *  - Si llegan 2 o más donas (por ejemplo 'Ventas por categoría' y 'Pedidos por estado'), píldoras para cambiar
 *    (aria-pressed). `modo` es la clave de la dona activa (PanelAnalisis la guarda); sin `modo`, la pieza la recuerda
 *    mientras está montada. Sin modo válido, la primera.
 *  - `etiquetar(bloque 'dona', clave, etiqueta)` cambia el nombre de cada segmento (PanelAnalisis, por ejemplo
 *    etiquetaTipoSC); debe devolver la etiqueta recibida cuando no conoce la clave.
 *  - El <canvas role="img"> lleva aria-label = resumenAccesible(dona) y una <table> dentro de una caja sr-only; el total del
 *    centro y la leyenda van con aria-hidden (los dos están en la tabla y en el resumen).
 *  - donas vacío (el módulo no tiene): no pinta nada. Una dona sin datos (bloqueSinDatos) no se dibuja: 'Sin datos en
 *    este período'.
 * Clases de Tailwind literales, sin variantes de modo oscuro; foco visible con outline (nunca outline-none).
 */

export type PropsGraficoDona = {
  donas: ReadonlyArray<DonaAnalisis> | null | undefined;
  /** La clave de la dona activa (dona.clave, o su posición como texto si no trae clave). */
  modo?: string | null;
  alCambiarModo?: (clave: string) => void;
  etiquetar?: Etiquetar;
};

const TARJETA = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs';
const FOCO = 'outline-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';
const PILDORA = `inline-flex min-w-0 max-w-full items-center rounded-full border px-3 py-1 text-xs font-bold transition-colors ${FOCO}`;
const PILDORA_ACTIVA = 'border-slate-900 bg-slate-900 text-white';
const PILDORA_INACTIVA = 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';

const claveDe = (dona: DonaAnalisis, i: number): string => (dona.clave ? String(dona.clave) : String(i));

export function GraficoDona({ donas, modo, alCambiarModo, etiquetar }: PropsGraficoDona) {
  const idTitulo = useId();
  const [elegida, setElegida] = useState<string | null>(null);
  const todas = useMemo(() => donas ?? [], [donas]);
  const activa = modo ?? elegida;
  const indice = Math.max(0, todas.findIndex((d, i) => claveDe(d, i) === activa));
  const dona: DonaAnalisis | null = todas[indice] ?? null;
  const formato: FormatoAnalisis = dona?.formato ?? 'entero';

  const segmentos = useMemo(() => (dona?.segmentos ?? []).map((s, i) => {
    const original = s.etiqueta || String(s.clave ?? '');
    return {
      clave: String(s.clave ?? i),
      etiqueta: etiquetar ? etiquetar('dona', String(s.clave ?? ''), original) : original,
      valor: s.valor,
      pct: s.pct ?? null,
      // El color sale del segmento original: 'Otros' y los 'Sin …' van en gris aunque etiquetar los renombre.
      color: colorSegmento(i, s),
    };
  }), [dona, etiquetar]);

  const datos = useMemo((): ChartData<'doughnut', Array<number | null>, string> => ({
    labels: segmentos.map((s) => s.etiqueta),
    datasets: [{
      data: valoresConSigno({ valores: segmentos.map((s) => s.valor) }),
      backgroundColor: segmentos.map((s) => s.color),
      borderColor: '#ffffff',
      borderWidth: 2,
      hoverOffset: 4,
    }],
  }), [segmentos]);

  const opciones = useMemo((): ChartOptions<'doughnut'> => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: {
        ...ESTILO_TOOLTIP,
        callbacks: {
          label: (item) => `${item.label}: ${formatearValor(item.raw, formato)} (${formatearValor(segmentos[item.dataIndex]?.pct, 'porcentaje')})`,
        },
      },
    },
  }), [segmentos, formato]);

  if (!dona) return null;
  const titulo = dona.titulo || 'Distribución';
  const total = formatearValor(dona.total, formato);
  const sinDatos = bloqueSinDatos('dona', dona);
  const elegir = (clave: string) => {
    setElegida(clave);
    alCambiarModo?.(clave);
  };

  return (
    <section aria-labelledby={idTitulo} className={TARJETA}>
      <h3 id={idTitulo} title={titulo} className="truncate text-sm font-bold text-slate-900">{titulo}</h3>
      {todas.length > 1 && (
        <div role="group" aria-label="Ver la distribución por" className="mt-2 flex flex-wrap gap-1.5">
          {todas.map((d, i) => {
            const clave = claveDe(d, i);
            const nombre = d.titulo || `Vista ${i + 1}`;
            const presionada = i === indice;
            return (
              <button
                key={clave}
                type="button"
                aria-pressed={presionada}
                onClick={() => elegir(clave)}
                className={`${PILDORA} ${presionada ? PILDORA_ACTIVA : PILDORA_INACTIVA}`}
              >
                <span title={nombre} className="min-w-0 truncate">{nombre}</span>
              </button>
            );
          })}
        </div>
      )}
      {sinDatos ? (
        <p className="mt-3 flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 px-3 text-center text-sm font-semibold text-slate-600">
          Sin datos en este período
        </p>
      ) : (
        <>
          <div className="relative mx-auto mt-3 h-44 w-44 max-w-full">
            <Doughnut data={datos} options={opciones} role="img" aria-label={resumenAccesible({ ...dona, segmentos })} />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-semibold text-slate-600">Total</span>
              <span className={`${tamanoCentroDona(total)} whitespace-nowrap font-black leading-tight text-slate-900 tabular-nums`}>{total}</span>
            </div>
          </div>
          <ul aria-hidden="true" className="mt-3 space-y-1.5">
            {segmentos.map((s) => (
              // En una tarjeta angosta (la dona a 3/12 mide ~210 px por dentro), si la etiqueta no tiene 6rem, el valor y
              // el % bajan a su propia línea (flex-wrap) en vez de dejar la etiqueta en «Col…».
              <li key={s.clave} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span title={s.etiqueta} className="min-w-0 flex-1 basis-24 truncate font-semibold text-slate-700">{s.etiqueta}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="font-bold text-slate-900 tabular-nums">{formatearValor(s.valor, formato)}</span>
                  <span className="w-12 text-right text-slate-600 tabular-nums">{formatearValor(s.pct, 'porcentaje')}</span>
                </span>
              </li>
            ))}
          </ul>
          {/* Una <table> no obedece width:1px ni overflow:hidden (se ensancha con su contenido): la caja sr-only de
              afuera la recorta. Con sr-only en la <table>, la página se desplazaba 135 px de lado a 375 px. */}
          <div className="sr-only">
            <table>
              <caption>{titulo}</caption>
              <thead>
                <tr>
                  <th scope="col">Segmento</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Porcentaje</th>
                </tr>
              </thead>
              <tbody>
                {segmentos.map((s) => (
                  <tr key={s.clave}>
                    <th scope="row">{s.etiqueta}</th>
                    <td>{formatearValor(s.valor, formato)}</td>
                    <td>{formatearValor(s.pct, 'porcentaje')}</td>
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
