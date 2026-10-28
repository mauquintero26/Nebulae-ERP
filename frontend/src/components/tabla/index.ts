// Bloque 4, T4C: el estado único de la pantalla, las columnas del usuario y los datos de la tabla estándar.
// T4D: los componentes de vista (TablaEstandar, BarraTabla, FiltroEstados, MenuAjustes, Paginacion y Esqueleto), con sus
// tipos; ConmutadorVista y MenuFila son los de components/ui (C1).
// Regla (T4C r1, 6d): un solo usePreferenciasTabla por id en cada pantalla; la tabla y el menú de ajustes reciben su resultado por props.
// D40: TablaEstandar y BarraTabla (→ MenuAjustes) reciben ese resultado en `preferencias` y el mismo anchoRef de la pantalla.
export * from './useEstadoTabla';
export * from './usePreferenciasTabla';
export * from './useListado';
export * from './TablaEstandar';
export * from './BarraTabla';
export * from './FiltroEstados';
export * from './MenuAjustes';
export * from './Paginacion';
export * from './Esqueleto';
// T4D r1: la pantalla completa (la clase de la tarjeta, la capa de atrás y el Esc), para no repetirla en cada pantalla.
export * from './usePantallaCompleta';
