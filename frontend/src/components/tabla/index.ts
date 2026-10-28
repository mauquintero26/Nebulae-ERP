// Bloque 4, T4C: el estado único de la pantalla, las columnas del usuario y los datos de la tabla estándar.
// Los componentes de vista (TablaEstandar, BarraTabla, FiltroEstados, MenuAjustes, Paginacion y Esqueleto) los agrega
// T4D. Regla (T4C r1, 6d): un solo usePreferenciasTabla por id en cada pantalla; la tabla y el menú de ajustes reciben su resultado por props.
export * from './useEstadoTabla';
export * from './usePreferenciasTabla';
export * from './useListado';
