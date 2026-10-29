'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { apiFetch } from '@/lib/api';
import { crearCargaListado } from '@/lib/tabla';
import { aplicarLlegadaAnalisis, consultaAnalisis, estadoAnalisis, errorAnalisis } from '@/lib/analisis';
import type { DatosAnalisis, ErrorAnalisis, PeriodoAnalisis, ResultadoAnalisis } from '@/lib/analisis';
// El usuario del token, como useListado (T4C r2) y useResumenFlujo (T5A r1). Es interno de components/tabla y
// compartido: el index de components/tabla no lo exporta.
import { usuarioDeLaSesion } from '@/components/tabla/usuarioDeLaSesion';

/**
 * ANALISIS-base punto 2 (Bloque 4, T5C; D28 y la pauta de useListado y useResumenFlujo): los datos de una pestaña
 * Análisis.
 * useAnalisis({endpoint, periodo, top, extra, ambito, esperar}) → {datos, cargando, cargandoInicial, recargando, error,
 * aviso, recargar}, por ejemplo
 *    const analisis = useAnalisis({endpoint: '/ventas/analisis', periodo, top, extra: {foco: 'hub'}, esperar: !listo});
 *  - La URL es endpoint + '?' + consultaAnalisis(periodo, top, extra) (lib/analisis.js). Pide con apiFetch de
 *    '@/lib/api' con el signal (apiFetch devuelve el cuerpo completo) y normaliza con normalizarAnalisis.
 *  - Cada consulta aborta la anterior (AbortController) y la respuesta de una que ya no es la vigente se descarta ANTES
 *    de tocar el estado: el turno es crearCargaListado de lib/tabla.js (el mismo de useListado). Si cambias el período
 *    varias veces seguidas, solo cuenta el último. Al desmontar (o con StrictMode) la carga en camino se aborta.
 *  - Mientras recarga (otro período, top, producto, bodega o Actualizar), los datos anteriores siguen y `recargando` es
 *    true: el panel los atenúa en vez de borrarlos. Antes de la primera respuesta, datos null y `cargandoInicial` (el
 *    esqueleto: nunca ceros).
 *  - `ambito` (por defecto el endpoint; PanelAnalisis le suma el foco): los datos de otro ámbito no se muestran mientras
 *    llegan los del nuevo (al cambiar de foco se ve el esqueleto, no las cifras del foco anterior).
 *  - Un error conserva lo último bueno del MISMO ámbito y del MISMO usuario (aplicarLlegadaAnalisis). `aviso` es
 *    errorAnalisis(error): el 403 dice 'No tienes permiso para ver este análisis.' y lo demás 'No pudimos cargar el
 *    análisis. Revisa tu conexión y vuelve a intentarlo.' con 'Reintentar' (recargar). Mientras se reintenta, error y
 *    aviso son null (PanelAnalisis recuerda el que se veía: siguienteErrorVisto).
 *  - La consulta va con el usuario del token (usuarioDeLaSesion, leído en cada render): si la sesión pasa a otra
 *    cuenta, se pide otra vez y mientras tanto no se muestra nada de la anterior.
 *  - `esperar` (esperar: !listo, hasta que las preferencias del panel estén listas): no pide nada y se ve cargando. Al
 *    pasar a false sale UNA petición, la correcta (la del período guardado).
 *  - Volver a pedir una consulta que ya llegó (Actualizar, Reintentar) es una vuelta de la carga: `cargando` es true
 *    hasta que llega.
 */

export type OpcionesAnalisis = {
  /** La ruta del API sin el prefijo /api/v1, por ejemplo '/ventas/analisis'. */
  endpoint: string;
  periodo: PeriodoAnalisis;
  top: number;
  /** Los parámetros propios (foco, producto, bodega…): los de parametrosAnalisis de lib/analisis.js. */
  extra?: Record<string, unknown> | null;
  /** Los datos se muestran atenuados mientras llega otra consulta del mismo ámbito (por defecto, el endpoint). */
  ambito?: string;
  /** true = todavía no pide (las preferencias no están listas) y se ve cargando. */
  esperar?: boolean;
};

export type ResultadoUseAnalisis = {
  datos: DatosAnalisis | null;
  /** Hay una carga en camino (o se espera para pedir). */
  cargando: boolean;
  /** Cargando y todavía sin datos (el esqueleto). */
  cargandoInicial: boolean;
  /** Cargando con los datos anteriores a la vista (atenuados). */
  recargando: boolean;
  /** El error de la última llegada (con .status y .detail de apiFetch), o null. */
  error: unknown;
  /** El aviso de ese error (errorAnalisis), o null. */
  aviso: ErrorAnalisis | null;
  /** Pide otra vez la consulta vigente (Actualizar, Reintentar). */
  recargar: () => void;
};

const pedirAnalisis = (url: string, signal: AbortSignal) => apiFetch(url, { signal });

export function useAnalisis({ endpoint, periodo, top, extra, ambito, esperar = false }: OpcionesAnalisis): ResultadoUseAnalisis {
  const consulta = consultaAnalisis(periodo, top, extra ?? {});
  const url = consulta ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}${consulta}` : endpoint;
  const ambitoFinal = ambito ?? endpoint;
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState<ResultadoAnalisis | null>(null);
  // Una carga por hook: aborta la anterior y solo publica la vigente (D28). setResultado se llama solo cuando llega.
  const [carga] = useState(() => crearCargaListado({
    pedir: pedirAnalisis,
    alLlegar: (llegada) => setResultado((previo) => aplicarLlegadaAnalisis(previo, llegada)),
  }));
  // Cuántas veces se volvió a pedir una consulta que ya había llegado (Actualizar, Reintentar, dejar de esperar).
  const repeticion = useSyncExternalStore(carga.suscribir, carga.repeticion, carga.repeticion);
  const usuario = usuarioDeLaSesion();
  const clave = `${version}|${usuario ?? ''}|${url}`;

  useEffect(() => {
    if (esperar) return undefined;
    // El ContextoListado de lib/tabla.js: `ruta` lleva el ámbito (aplicarLlegadaAnalisis lo lee así).
    carga.cargar(url, clave, { ruta: ambitoFinal, usuario });
    return () => carga.cancelar();
  }, [carga, url, clave, ambitoFinal, usuario, esperar]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return useMemo(() => {
    const visto = estadoAnalisis(resultado, { clave, ambito: ambitoFinal, usuario, repeticion });
    const cargando = visto.cargando || esperar;
    const datos = visto.datos;
    const error = cargando ? null : visto.error;
    return {
      datos,
      cargando,
      cargandoInicial: cargando && !datos,
      recargando: cargando && Boolean(datos),
      error,
      aviso: errorAnalisis(error),
      recargar,
    };
  }, [resultado, clave, ambitoFinal, usuario, repeticion, esperar, recargar]);
}
