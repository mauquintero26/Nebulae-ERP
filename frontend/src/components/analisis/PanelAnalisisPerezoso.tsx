'use client';

import dynamic from 'next/dynamic';
import { EsqueletoAnalisis } from './EsqueletoAnalisis';
import type { PropsPanelAnalisis } from './PanelAnalisis';

/**
 * ANALISIS-base punto 2 (Bloque 4, T5C; R13 y D43 M6): la pestaña Análisis que importan las pantallas.
 * PanelAnalisis (y con él chart.js, react-chartjs-2 y registro.ts) va en su propio chunk, que el navegador descarga
 * recién cuando se pinta la pestaña: dynamic(() => import('./PanelAnalisis'), {ssr: false}). Mientras llega, el
 * esqueleto (EsqueletoAnalisis, nunca ceros). Las props son las de PanelAnalisis.
 * Las pantallas importan ESTE componente (o '@/components/analisis', que lo exporta), nunca PanelAnalisis ni los
 * gráficos directo: test_graficos_centralizados.mjs lo vigila.
 */
export const PanelAnalisisPerezoso = dynamic<PropsPanelAnalisis>(
  () => import('./PanelAnalisis').then((m) => m.PanelAnalisis),
  { ssr: false, loading: () => <EsqueletoAnalisis /> },
);
