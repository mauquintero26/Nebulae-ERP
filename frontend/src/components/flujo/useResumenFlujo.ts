'use client';

import { useMemo } from 'react';
import { RESUMEN_DEL_FLUJO } from '@/lib/flujo';
// B4 T24 f2 r1 (C2): una sola implementación del cargador de resúmenes, la de components/ui/useResumen.
import { useResumen } from '@/components/ui/useResumen';
import type { DatosFlujo, ResumenFlujo } from './tipos';

/**
 * FLUJO-base punto 5 (Bloque 4, T5A y r1; C13, RP33 y D21): los números de la franja del flujo.
 * useResumenFlujo(ruta, recarga) → {datos, cargando, error, recargar}, por ejemplo
 *    const flujo = useResumenFlujo('/ventas/flujo', recargaFlujo);
 *  - Pide con apiFetch de '@/lib/api' (con el signal) y lee res.data (apiFetch devuelve el cuerpo completo).
 *  - Cada carga aborta la anterior, y la respuesta de una que ya no es la vigente se descarta antes de tocar el estado:
 *    el turno es crearCargaListado de lib/tabla.js (el mismo de useListado). Al desmontar, o al cambiar la ruta,
 *    `recarga` o el usuario, la carga en camino se aborta. Con StrictMode sale una sola petición.
 *  - B4 T24 f2 r1 (C2): todo eso es useResumen (components/ui/useResumen.ts) con la regla del flujo, RESUMEN_DEL_FLUJO (sus
 *    textos y, con error, lo último bueno). Este hook es su envoltorio: la API pública ({datos, cargando, error, recargar}) no
 *    cambia.
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

export function useResumenFlujo<T = DatosFlujo>(ruta: string, recarga: number = 0): ResumenFlujo<T> {
  const r = useResumen<T>(ruta, recarga, RESUMEN_DEL_FLUJO);
  return useMemo(
    () => ({ datos: r.datos, cargando: r.cargando, error: r.error, recargar: r.recargar }),
    [r],
  );
}
