// components/analisis (Bloque 4, T5B y T5C): la pestaña Análisis estándar. components/ui/index.ts no se toca (es de
// T4A y T4B).
// R13 y D43 (M6): este índice NO reexporta PanelAnalisis, GraficoLinea, GraficoDona, GraficoBarras ni registro.ts:
// registran Chart.js al cargarse y package.json no declara sideEffects, así que importarlos desde aquí metería chart.js en
// el chunk de la pantalla. Las pantallas importan PanelAnalisisPerezoso, que carga PanelAnalisis (y los gráficos) en su
// propio chunk al abrir la pestaña. test_graficos_centralizados.mjs comprueba que nada de lo que alcanza este índice
// importa chart.js.
export { PanelAnalisisPerezoso } from './PanelAnalisisPerezoso';
export type { PropsPanelAnalisis, FocoPanel } from './PanelAnalisis';
export { useAnalisis } from './useAnalisis';
export type { OpcionesAnalisis, ResultadoUseAnalisis } from './useAnalisis';
export { SelectorPeriodo } from './SelectorPeriodo';
export type { PropsSelectorPeriodo } from './SelectorPeriodo';
export { FilaKpis } from './FilaKpis';
export type { PropsFilaKpis } from './FilaKpis';
export { AsistenteEnConstruccion } from './AsistenteEnConstruccion';
export type { PropsAsistenteEnConstruccion } from './AsistenteEnConstruccion';
// Las piezas de T5B que no dibujan con Chart.js.
export { ChipVariacion } from './ChipVariacion';
export type { KpiVariacion, PropsChipVariacion } from './ChipVariacion';
export { ListaMovimientos } from './ListaMovimientos';
export type { PropsListaMovimientos } from './ListaMovimientos';
export { RankingTop } from './RankingTop';
export type { PropsRankingTop, TopRanking } from './RankingTop';
export { EsqueletoAnalisis } from './EsqueletoAnalisis';
export type { PropsEsqueletoAnalisis } from './EsqueletoAnalisis';
