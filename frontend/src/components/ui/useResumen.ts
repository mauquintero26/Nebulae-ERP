'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { apiFetch } from '@/lib/api';
import { ofreceReintentar } from '@/lib/avisos';
import { crearCargaListado } from '@/lib/tabla';
import { aplicarLlegadaResumen, estadoResumen, RESUMEN_DE_TARJETAS } from '@/lib/flujo';
import type { ResultadoResumen } from '@/lib/flujo';
// El usuario del token, como useListado y useResumenFlujo (interno de components/tabla: su index no lo exporta).
import { usuarioDeLaSesion } from '@/components/tabla/usuarioDeLaSesion';

/** Lo que devuelve useResumen. */
export type Resumen<T> = {
  /** res.data de la última respuesta buena de esta ruta y este usuario; null mientras carga la primera vez o con error. */
  datos: T | null;
  /** true mientras hay una carga en camino (la primera, una recarga o un reintento). */
  cargando: boolean;
  /** El error de la última carga (con .status y .detail de apiFetch); null mientras se reintenta. */
  error: unknown;
  /** Pide otra vez (un «Reintentar» o «Actualizar»). */
  recargar: () => void;
  /** true si hay un error que se arregla volviendo a pedir: un 403 (un tema de permiso) nunca ofrece «Reintentar». */
  ofreceReintentar: boolean;
};

const pedirResumen = (url: string, signal: AbortSignal) => apiFetch(url, { signal });

/**
 * B4 T24 f2 (F45, primera mitad): el cargador COMPARTIDO de los resúmenes de las tarjetas (/ventas/stats en el Hub y en Pedidos de venta;
 * f3 lo lleva a /compras/stats e /inventory/stats). useResumen(ruta, recarga) → {datos, error, cargando, recargar, ofreceReintentar}:
 *  - pide con apiFetch (con el signal) y lee res.data;
 *  - cada carga aborta la anterior y la respuesta de una que ya no es la vigente se descarta antes de tocar el estado (crearCargaListado
 *    de lib/tabla.js, la carga de useListado); al desmontar, o al cambiar la ruta, `recarga` o el usuario, la carga en camino se aborta;
 *  - va atado al usuario del token (usuarioDeLaSesion, como useListado): si la sesión pasa a otra cuenta, se pide otra vez y mientras
 *    tanto no se muestra nada de la anterior;
 *  - con error, sin los datos de antes (RESUMEN_DE_TARJETAS: las tarjetas dicen «—», C6) y, al reintentar, cargando sin el error viejo;
 *  - nunca un 0 mientras carga: datos null (las tarjetas pintan barras grises).
 * La lógica es pura (aplicarLlegadaResumen y estadoResumen de lib/flujo.js, la de useResumenFlujo, con la regla de las tarjetas), con
 * sus casos en test_flujo.mjs («B4 T24 f2 (F45)»): llega, falla, abortado, recarga, cambio de usuario y el 403.
 * `recarga`: un número que la pantalla sube cuando cambió algo (por ejemplo, «Actualizar» o después de un cambio de estado).
 */
export function useResumen<T>(ruta: string, recarga: number = 0): Resumen<T> {
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState<ResultadoResumen | null>(null);
  const [carga] = useState(() => crearCargaListado({
    pedir: pedirResumen,
    alLlegar: (llegada) => setResultado((previo) => aplicarLlegadaResumen(previo, llegada, RESUMEN_DE_TARJETAS)),
  }));
  // Volver a pedir una clave que ya llegó es otra vuelta de la carga: cargando hasta que llega (M13 de useResumenFlujo).
  const repeticion = useSyncExternalStore(carga.suscribir, carga.repeticion, carga.repeticion);
  const usuario = usuarioDeLaSesion();
  const clave = `${version}|${usuario ?? ''}|${recarga}|${ruta}`;

  useEffect(() => {
    carga.cargar(ruta, clave, { ruta, usuario });
    return () => carga.cancelar();
  }, [carga, ruta, clave, usuario]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return useMemo(() => {
    const visto = estadoResumen(resultado, { clave, ruta, usuario, repeticion });
    return { datos: visto.datos as T | null, cargando: visto.cargando, error: visto.error, recargar, ofreceReintentar: ofreceReintentar(visto.error) };
  }, [resultado, clave, ruta, usuario, repeticion, recargar]);
}
