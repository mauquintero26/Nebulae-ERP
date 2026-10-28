'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { aplicarLlegadaListado, crearCargaListado, estadoListado, listadoCliente, urlListado } from '@/lib/tabla';
import type { EstadoListado, EstadoTabla, ResultadoListado } from '@/lib/tabla';

/**
 * Los datos de una tabla estándar (Bloque 4, T4C; TABLA-api puntos 3 y 4, H6, RP8, RP35 y D28).
 *
 * useListado({ruta, estado, extra, conConteos, conResumen, activo}): la página que se ve, pedida al servidor.
 *  - La URL sale de urlListado (queryListado de lib/tabla.js): vista, semaforo, paso, q, estados en CSV, orden, limit y
 *    offset del estado de useEstadoTabla (RP8: nunca search ni estado=), lo de `extra` y, si se piden, con_conteos=1 y
 *    con_resumen=1. Pide con apiFetch, que pasa el signal a fetch.
 *  - D28: cada consulta aborta la anterior (AbortController) y la respuesta de una que ya no es la vigente se descarta
 *    ANTES de tocar el estado (crearCargaListado, con su contador de turnos). Con StrictMode (monta, desmonta y vuelve a
 *    montar) sale una sola petición.
 *  - Mientras recarga (otra página, búsqueda o filtro), las filas anteriores siguen y `recargando` es true. Antes de la
 *    primera respuesta: filas [], total, conteos y resumen null (nunca 0: H6) y `cargandoInicial`.
 *  - El error de la última carga viene en `error` (con .status y .detail de apiFetch) para que la tabla lo muestre con
 *    'Reintentar' (recargar). Se conserva lo último que llegó bien. Un 422 de un orden no permitido llega aquí: la
 *    pantalla o la tabla despacha {tipo: 'orden', valor: null} para volver al orden por defecto.
 *  - RP35: con activo = false no pide nada y conserva lo último (filas, total, conteos y resumen). T7 lo apaga en la
 *    pestaña Análisis y T8 en la Papelera; ninguna pantalla manda vista=analisis ni vista=papelera. Al volver a
 *    activo = true pide otra vez la consulta vigente.
 *  - `crudo` es la respuesta tal cual, para las claves propias del endpoint (por ejemplo los grupos del Hub).
 *
 * useListadoCliente(filas, estado, accesores): para endpoints chicos que devuelven todo (la papelera de SC, los leads de
 * una campaña, las tablas de detalle). Filtra, ordena y pagina en el navegador con el mismo estado (listadoCliente de
 * lib/tabla.js). Mientras la pantalla trae los datos (filas null), cargandoInicial.
 */

export type { EstadoListado } from '@/lib/tabla';

export type OpcionesListado = {
  /** La ruta del API sin el prefijo /api/v1, por ejemplo '/ventas/hub/documentos'. */
  ruta: string;
  /** El estado de useEstadoTabla. */
  estado: EstadoTabla;
  /** Parámetros propios del endpoint (columna, saldo…); pisan los del estado (D23). */
  extra?: Record<string, unknown> | null;
  conConteos?: boolean;
  conResumen?: boolean;
  /** RP35: false = no pide nada y conserva lo último. Por defecto true. */
  activo?: boolean;
};

export type Listado<T> = Omit<EstadoListado, 'filas'> & {
  filas: T[];
  /** Pide otra vez la consulta vigente (Reintentar, o después de un cambio hecho desde la pantalla). */
  recargar: () => void;
};

export type AccesoresListadoCliente<T> = {
  /** Dónde busca q (claves o funciones); sin campos, en todos los textos y números de la fila. */
  busqueda?: ReadonlyArray<string | ((fila: T) => unknown)>;
  /** El valor de orden de cada campo (el valorOrden de la columna); sin accesor, fila[campo]. */
  orden?: Record<string, (fila: T) => unknown>;
  /** El estado de la fila para el filtro de estados; por defecto fila.estado. */
  estadoDe?: (fila: T) => unknown;
  /** El filtro propio de la pantalla (vista, semáforo, paso). */
  filtro?: (fila: T, estado: EstadoTabla) => boolean;
};

export type ListadoCliente<T> = {
  /** Las filas de la página. */
  filas: T[];
  /** Cuántas pasan el filtro (null mientras cargan). */
  total: number | null;
  /** Todas las que pasan el filtro, ordenadas y sin paginar. */
  todas: T[];
  /** La página que se muestra (una fuera de rango salta a la última que existe). */
  pagina: number;
  cargandoInicial: boolean;
};

const pedirLista = (url: string, signal: AbortSignal) => apiFetch(url, { signal });

/** La página de la tabla pedida al servidor. Ver arriba. */
export function useListado<T = unknown>({
  ruta, estado, extra, conConteos = false, conResumen = false, activo = true,
}: OpcionesListado): Listado<T> {
  const url = urlListado(ruta, estado, { extra, conConteos, conResumen });
  const [version, setVersion] = useState(0);
  const clave = `${version}|${url}`;
  const [resultado, setResultado] = useState<ResultadoListado | null>(null);
  // Una carga por hook: aborta la anterior y solo publica la vigente (D28). setResultado se llama solo cuando llega.
  const [carga] = useState(() => crearCargaListado({
    pedir: pedirLista,
    alLlegar: (llegada) => setResultado((previo) => aplicarLlegadaListado(previo, llegada)),
  }));

  useEffect(() => {
    if (!activo) return undefined;
    carga.cargar(url, clave);
    return () => carga.cancelar();
  }, [carga, url, clave, activo]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return useMemo(() => {
    const visto = estadoListado(resultado, { clave, activo });
    return { ...visto, filas: visto.filas as T[], recargar };
  }, [resultado, clave, activo, recargar]);
}

/** Una lista chica, completa, filtrada y paginada en el navegador. Ver arriba. */
export function useListadoCliente<T>(
  filas: ReadonlyArray<T> | null | undefined,
  estado: EstadoTabla,
  accesores: AccesoresListadoCliente<T> = {},
): ListadoCliente<T> {
  const { busqueda, orden, estadoDe, filtro } = accesores;
  return useMemo(
    () => listadoCliente(filas, estado, { busqueda, orden, estadoDe, filtro }),
    [filas, estado, busqueda, orden, estadoDe, filtro],
  );
}
