'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { crearCargaListado } from '@/lib/tabla';
import { aplicarLlegadaResumen, estadoResumen } from '@/lib/flujo';
import type { ResultadoResumen } from '@/lib/flujo';
import type { DatosFlujo, ResumenFlujo } from './tipos';

/**
 * FLUJO-base punto 5 (Bloque 4, T5A; C13, RP33 y D21): los números de la franja del flujo.
 * useResumenFlujo(ruta, recarga) → {datos, cargando, error, recargar}, por ejemplo
 *    const flujo = useResumenFlujo('/ventas/flujo', recargaFlujo);
 *  - Pide con apiFetch de '@/lib/api' (con el signal) y lee res.data (apiFetch devuelve el cuerpo completo).
 *  - Cada carga aborta la anterior, y la respuesta de una que ya no es la vigente se descarta antes de tocar el estado:
 *    el turno es crearCargaListado de lib/tabla.js (el mismo de useListado). Al desmontar, o al cambiar la ruta o
 *    `recarga`, la carga en camino se aborta. Con StrictMode sale una sola petición.
 *  - En la primera carga, datos es null y las cajas pintan la barra gris de Contador (D21). Al recargar (otro valor de
 *    `recarga`, o recargar()) los datos anteriores siguen y solo `cargando` es true: los números no parpadean.
 *  - Un error conserva lo último bueno de la misma ruta (aplicarLlegadaResumen) y se ve en `error`; mientras se
 *    reintenta, el error anterior no se muestra (estadoResumen).
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
  const clave = `${version}|${recarga}|${ruta}`;

  useEffect(() => {
    carga.cargar(ruta, clave, { ruta });
    return () => carga.cancelar();
  }, [carga, ruta, clave]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return useMemo(() => {
    const visto = estadoResumen(resultado, { clave, ruta });
    return { datos: visto.datos as T | null, cargando: visto.cargando, error: visto.error, recargar };
  }, [resultado, clave, ruta, recargar]);
}
