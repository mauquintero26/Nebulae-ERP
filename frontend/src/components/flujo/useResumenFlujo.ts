'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { apiFetch } from '@/lib/api';
import { crearCargaListado } from '@/lib/tabla';
import { aplicarLlegadaResumen, estadoResumen } from '@/lib/flujo';
import type { ResultadoResumen } from '@/lib/flujo';
// r1 (M12): el usuario del token, como useListado (T4C r2). Es interno de components/tabla y compartido: el index de
// components/tabla no lo exporta.
import { usuarioDeLaSesion } from '@/components/tabla/usuarioDeLaSesion';
import type { DatosFlujo, ResumenFlujo } from './tipos';

/**
 * FLUJO-base punto 5 (Bloque 4, T5A y r1; C13, RP33 y D21): los números de la franja del flujo.
 * useResumenFlujo(ruta, recarga) → {datos, cargando, error, recargar}, por ejemplo
 *    const flujo = useResumenFlujo('/ventas/flujo', recargaFlujo);
 *  - Pide con apiFetch de '@/lib/api' (con el signal) y lee res.data (apiFetch devuelve el cuerpo completo).
 *  - Cada carga aborta la anterior, y la respuesta de una que ya no es la vigente se descarta antes de tocar el estado:
 *    el turno es crearCargaListado de lib/tabla.js (el mismo de useListado). Al desmontar, o al cambiar la ruta,
 *    `recarga` o el usuario, la carga en camino se aborta. Con StrictMode sale una sola petición.
 *  - En la primera carga, datos es null y las cajas pintan la barra gris de Contador (D21). Al recargar (otro valor de
 *    `recarga`, o recargar()) los datos anteriores siguen y solo `cargando` es true: los números no parpadean.
 *  - Un error conserva lo último bueno de la misma ruta y del mismo usuario (aplicarLlegadaResumen) y se ve en `error`;
 *    mientras se reintenta, el error anterior no se muestra (estadoResumen; BannerFlujo lo recuerda, r1 M5).
 *  - r1 (M12): la consulta va con el usuario del token (usuarioDeLaSesion, leído en cada render): si la sesión pasa a
 *    otra cuenta, se pide otra vez y mientras tanto no se muestra nada de la anterior (ni datos ni error).
 *  - r1 (M13): volver a pedir una clave que ya llegó (B → A → B, una recarga 5 → 6 → 5, un efecto que se repite) es una
 *    vuelta de la carga (repeticion): `cargando` es true hasta que llega.
 * `recarga`: un número que la pantalla sube cuando cambió algo (por ejemplo, cada vez que corre su loadData).
 */

const pedirResumen = (url: string, signal: AbortSignal) => apiFetch(url, { signal });

export function useResumenFlujo<T = DatosFlujo>(ruta: string, recarga: number = 0): ResumenFlujo<T> {
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState<ResultadoResumen | null>(null);
  // Una carga por hook: aborta la anterior y solo publica la vigente. setResultado se llama solo cuando llega.
  const [carga] = useState(() => crearCargaListado({
    pedir: pedirResumen,
    alLlegar: (llegada) => setResultado((previo) => aplicarLlegadaResumen(previo, llegada)),
  }));
  // M13: cuántas veces se volvió a pedir una clave que ya había llegado.
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
    return { datos: visto.datos as T | null, cargando: visto.cargando, error: visto.error, recargar };
  }, [resultado, clave, ruta, usuario, repeticion, recargar]);
}
