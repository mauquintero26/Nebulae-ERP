'use client';

import { createContext, useContext, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { GRILLA_ANALISIS } from '@/lib/analisis';
import { EsqueletoAnalisis } from './EsqueletoAnalisis';
import { EsqueletoBarra } from './SelectorPeriodo';
import type { PropsPanelAnalisis } from './PanelAnalisis';

/**
 * ANALISIS-base punto 2 (Bloque 4, T5C; R13 y D43 M6): la pestaña Análisis que importan las pantallas.
 * PanelAnalisis (y con él chart.js, react-chartjs-2 y registro.ts) va en su propio chunk, que el navegador descarga
 * recién cuando se pinta la pestaña: dynamic(() => import('./PanelAnalisis'), {ssr: false}). Mientras llega, el
 * esqueleto: la barra de arriba (EsqueletoBarra, con la fila de focos y el campo Producto si la pantalla los pide) y
 * EsqueletoAnalisis, igual que la rama !listo de PanelAnalisis, así el panel no salta (T5C r1, M14). El loading de
 * next/dynamic no recibe props: la forma del esqueleto viaja por un contexto. Las props son las de PanelAnalisis.
 * Las pantallas importan ESTE componente (o '@/components/analisis', que lo exporta), nunca PanelAnalisis ni los
 * gráficos directo: test_graficos_centralizados.mjs lo vigila.
 */

type Forma = { focos: number; producto: boolean };

const FormaEsqueleto = createContext<Forma>({ focos: 0, producto: false });

function Cargando() {
  const forma = useContext(FormaEsqueleto);
  return (
    <div className={GRILLA_ANALISIS.raiz}>
      <div className={GRILLA_ANALISIS.filas}>
        <EsqueletoBarra focos={forma.focos} producto={forma.producto} />
        <EsqueletoAnalisis barra={false} />
      </div>
    </div>
  );
}

const Diferido = dynamic<PropsPanelAnalisis>(
  () => import('./PanelAnalisis').then((m) => m.PanelAnalisis),
  { ssr: false, loading: () => <Cargando /> },
);

export function PanelAnalisisPerezoso(props: PropsPanelAnalisis) {
  const forma = useMemo(
    () => ({ focos: props.focos?.length ?? 0, producto: Boolean(props.busquedaProducto) }),
    [props.focos, props.busquedaProducto],
  );
  return (
    <FormaEsqueleto.Provider value={forma}>
      <Diferido {...props} />
    </FormaEsqueleto.Provider>
  );
}
