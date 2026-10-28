'use client';

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { fijasDe, guardarCambioColumnas, reconciliarColumnas } from '@/lib/tabla';
import type { CambioColumnas, DefinicionColumna, LadoFijo } from '@/lib/tabla';
import { usePreferenciaParte } from '@/components/ui/usePreferencia';
import { usuarioDeLaSesion } from './usuarioDeLaSesion';

/**
 * Las columnas de una tabla como las dejó el usuario (Bloque 4, T4C y r1; TABLA-base punto 3, R4, C2, RP26, D35 y D38): el
 * orden, los anchos y las columnas ocultas de tabla:<id>, reconciliados con la definición de hoy (reconciliarColumnas
 * de lib/tabla.js: un id que ya no existe se descarta, una columna nueva entra junto a su vecina, una clave nunca se
 * oculta, cada ancho queda entre su mínimo y su máximo y otra versión vuelve a lo por defecto).
 *
 * Escribe con usePreferenciaParte (T4A), al lado del tamaño de useEstadoTabla en la misma clave (RP26), y SOLO la pieza
 * que cambió (parteDeColumnas, D38): los anchos con {anchos}, el orden con {orden} y las ocultas con {ocultas}, más lo
 * mínimo para que se lean como las ve el usuario (ver parteDeColumnas). La pieza se calcula con lo último del vínculo
 * (actualizadorColumnas), no con lo del render: dos operaciones seguidas en el mismo manejador se suman bien.
 *  - Nada se escribe antes de `listo` (D35): hasta entonces la tabla se ve con su forma por defecto y cada operación
 *    devuelve false.
 *  - r1, punto 3: cada operación va con el usuario del token con que se pintó la pantalla (guardarCambioColumnas). Si el
 *    token ya es de otra cuenta, no escribe y devuelve false: el gesto se hizo sobre la pantalla de la anterior. Si el
 *    usuario cambió y el hook no lo vio, el primer guardado se descarta (D38: es a propósito) y también devuelve false.
 *  - Regla (r1, 6d), porque dos instancias con el mismo id no se ven entre sí y una pieza de una pisaría la de la otra:
 *    un solo usePreferenciasTabla por id en cada pantalla; la tabla y el menú de ajustes reciben su resultado por props.
 *  - Límite conocido (r1, 6e): si la precarga falló y luego el servidor vuelve, una pieza compuesta ({orden, ocultas}, o
 *    el mapa de anchos) se arma sobre {} y reemplaza esa pieza guardada (ver parteDeColumnas).
 *  - guardarAncho va al SOLTAR el borde (pointerup) o con el doble clic que ajusta al contenido; nunca en cada
 *    movimiento: durante el arrastre el ancho va al <col> por ref (T4D). guardarAnchos guarda varios a la vez
 *    ('Ajustar al ancho de la pantalla').
 *  - mover(columna, hueco): el hueco de los encabezados VISIBLES, el mismo de indiceDestino (0 = antes de la primera).
 *    desplazar(columna, ±1): las flechas de 'Ajustar tabla', un lugar en el orden completo. Ninguno cruza las fijas.
 *  - ocultar(columna, oculta?) alterna sin el segundo valor; una clave no se oculta y nunca quedan cero visibles.
 *  - restablecer() vuelve a la forma por defecto (borra las tres piezas y conserva el tamaño).
 * Cada operación devuelve true si escribió algo. `columnas` conviene estable (constante o useMemo): con otra
 * definición se reconcilia otra vez.
 */

export type { CambioColumnas, DefinicionColumna, LadoFijo } from '@/lib/tabla';

export type PreferenciasTabla = {
  /** Todas las columnas en el orden del usuario (también las ocultas), con las fijas a los lados. */
  orden: string[];
  /** El ancho de cada columna, en px. */
  anchos: Record<string, number>;
  /** Las ocultas, en el orden de la definición. */
  ocultas: string[];
  /** Las que se pintan, en orden. */
  visibles: string[];
  /** {id: 'izquierda' | 'derecha'} de las fijas. */
  fijas: Record<string, LadoFijo>;
  /** Ya se leyó lo guardado: desde aquí las operaciones escriben. */
  listo: boolean;
  guardarAncho: (columna: string, px: number) => boolean;
  guardarAnchos: (anchos: Record<string, number>) => boolean;
  mover: (columna: string, hueco: number) => boolean;
  desplazar: (columna: string, paso: -1 | 1) => boolean;
  ocultar: (columna: string, oculta?: boolean) => boolean;
  restablecer: () => boolean;
};

type ColumnasGuardadas = Record<string, unknown>;

// El valor por defecto del vínculo, que es este mismo objeto mientras no esté listo (al montar, o desde que el vínculo
// pasa a la instancia de otro usuario y hasta su listo): actualizadorColumnas lo reconoce y no arma piezas sobre él. Como
// una pieza vacía no publica (vincularPreferencia, T4C r1), la identidad se conserva con cualquier número de llamadas.
// No reemplaza la guarda del usuario del render (guardarCambioColumnas).
const SIN_GUARDAR: ColumnasGuardadas = {};
const esObjetoPlano = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Las columnas de la tabla `id` (el mismo id de useEstadoTabla). Ver arriba. */
export function usePreferenciasTabla(id: string, columnas: ReadonlyArray<DefinicionColumna>): PreferenciasTabla {
  const [guardado, guardarParte, listo] = usePreferenciaParte<ColumnasGuardadas>(`tabla:${id}`, SIN_GUARDAR, {
    validar: esObjetoPlano,
  });
  const reconciliadas = useMemo(() => reconciliarColumnas(columnas, guardado), [columnas, guardado]);
  const visibles = useMemo(
    () => reconciliadas.orden.filter((c) => !reconciliadas.ocultas.includes(c)),
    [reconciliadas],
  );
  const fijas = useMemo(() => fijasDe(columnas), [columnas]);

  // Lo último que se pintó y con qué usuario, para los manejadores (se lee fuera del render).
  const usuario = usuarioDeLaSesion();
  const actuales = useRef({ columnas, listo, usuario });
  useLayoutEffect(() => {
    actuales.current = { columnas, listo, usuario };
  });

  const aplicar = useCallback((cambio: CambioColumnas): boolean => {
    const ahora = actuales.current;
    return guardarCambioColumnas(guardarParte, {
      definicion: ahora.columnas, cambio, sinGuardar: SIN_GUARDAR, listo: ahora.listo,
      usuarioRender: ahora.usuario, usuarioToken: usuarioDeLaSesion(),
    });
  }, [guardarParte]);

  const guardarAncho = useCallback(
    (columna: string, px: number) => aplicar({ tipo: 'anchos', anchos: { [columna]: px } }),
    [aplicar],
  );
  const guardarAnchos = useCallback((anchos: Record<string, number>) => aplicar({ tipo: 'anchos', anchos }), [aplicar]);
  const mover = useCallback((columna: string, hueco: number) => aplicar({ tipo: 'mover', id: columna, hueco }), [aplicar]);
  const desplazar = useCallback(
    (columna: string, paso: -1 | 1) => aplicar({ tipo: 'desplazar', id: columna, paso }),
    [aplicar],
  );
  const ocultar = useCallback(
    (columna: string, oculta?: boolean) => aplicar({ tipo: 'ocultar', id: columna, oculta }),
    [aplicar],
  );
  const restablecer = useCallback(() => aplicar({ tipo: 'restablecer' }), [aplicar]);

  return useMemo(() => ({
    orden: reconciliadas.orden,
    anchos: reconciliadas.anchos,
    ocultas: reconciliadas.ocultas,
    visibles,
    fijas,
    listo,
    guardarAncho,
    guardarAnchos,
    mover,
    desplazar,
    ocultar,
    restablecer,
  }), [reconciliadas, visibles, fijas, listo, guardarAncho, guardarAnchos, mover, desplazar, ocultar, restablecer]);
}
