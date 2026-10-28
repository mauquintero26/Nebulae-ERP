'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { apiFetch } from '@/lib/api';
import {
  aplicarLlegadaListado, crearCargaListado, estadoListado, lanzarListado, listadoCliente, rechazoPorAtender, urlListado,
} from '@/lib/tabla';
import type { EstadoListado, EstadoTabla, ResultadoListado } from '@/lib/tabla';
import type { DespacharTabla } from './useEstadoTabla';
import { usuarioDeLaSesion } from './usuarioDeLaSesion';

/**
 * Los datos de una tabla estándar (Bloque 4, T4C, r1 y r2; TABLA-api puntos 3 y 4, H6, RP8, RP35 y D28).
 *
 * useListado({ruta, estado, extra, conConteos, conResumen, activo, esperar, despachar}): la página que se ve, pedida al
 * servidor. El uso de una pantalla:
 *    const [estado, despachar, listo] = useEstadoTabla('ventas.hub', {vista: 'todos', orden: 'atencion'});
 *    const lista = useListado({ruta: '/ventas/hub/documentos', estado, conConteos: true, esperar: !listo, despachar});
 * y la tabla muestra lista.avisoOrden cuando no es null. `estado` es el de useEstadoTabla, sin derivar: la vuelta al
 * orden por defecto compara su orden con el rechazado (con un estado derivado, por ejemplo un orden propio por defecto,
 * el despacho no cambiaría la consulta; entonces la tabla muestra el error con Reintentar).
 *  - La URL sale de urlListado (queryListado de lib/tabla.js): vista, semaforo, paso, q, estados en CSV, orden, limit y
 *    offset del estado de useEstadoTabla (RP8: nunca search ni estado=), lo de `extra` y, si se piden, con_conteos=1 y
 *    con_resumen=1. Pide con apiFetch, que pasa el signal a fetch.
 *  - D28: cada consulta aborta la anterior (AbortController) y la respuesta de una que ya no es la vigente se descarta
 *    ANTES de tocar el estado (crearCargaListado, con su contador de turnos). Con StrictMode (monta, desmonta y vuelve a
 *    montar) sale una sola petición.
 *  - Mientras recarga (otra página, búsqueda o filtro), las filas anteriores siguen y `recargando` es true. Antes de la
 *    primera respuesta: filas [], total, conteos y resumen null (nunca 0: H6) y `cargandoInicial`.
 *  - El error de la última carga viene en `error` (con .status y .detail de apiFetch) para que la tabla lo muestre con
 *    'Reintentar' (recargar). Se conserva lo último que llegó bien (del mismo usuario).
 *  - r1, punto 1, y r2, puntos 2 y 3: un 422 del servidor por un orden que no admite («No se puede ordenar por…»,
 *    esErrorDeOrden) deja su texto en `avisoOrden`, y con `despachar` (el de useEstadoTabla) el hook despacha UNA vez
 *    por esa llegada, desde un efecto, {tipo: 'restablecerOrden', rechazado}: el reductor quita el orden solo si sigue
 *    siendo el rechazado (si el usuario ya eligió otro, no se pisa). La petición siguiente, sin orden, trae las filas.
 *    Lo atendido es estado de la carga (vuelve a pintar): si el despacho no cambió la consulta, el error vuelve a verse.
 *    avisoOrden se mantiene hasta que el usuario elija un orden no nulo o cambie la ruta. Sin despachar, el hook solo
 *    expone avisoOrden (y el error). Si el orden por defecto también da 422, es un error común: no hay bucle.
 *  - RP35: con activo = false no pide nada y conserva lo último (filas, total, conteos y resumen). T7 lo apaga en la
 *    pestaña Análisis y T8 en la Papelera; ninguna pantalla manda vista=analisis ni vista=papelera. Al volver a
 *    activo = true pide otra vez la consulta vigente y, mientras llega, `recargando` es true y el error anterior no se
 *    muestra (r1, 6b: las vueltas de la carga van en la clave).
 *  - r1, punto 5: con esperar = true (por ejemplo esperar: !listo, hasta que las preferencias de useEstadoTabla estén
 *    listas) no pide nada y la tabla se ve cargando: cargandoInicial sin datos, recargando con datos. No es lo mismo que
 *    activo = false. Al pasar a false sale UNA petición, la correcta. r2, punto 4: el `listo` de useEstadoTabla llega a
 *    más tardar a los ESPERA_PREFERENCIAS_MS (4 s) aunque el GET de preferencias se cuelgue: la tabla no queda en
 *    esqueleto para siempre.
 *  - La consulta va con el usuario del token: si la sesión pasa a otra cuenta, se pide otra vez con el token nuevo, y
 *    (r2, punto 1) mientras tanto no se muestra nada de la anterior (ni filas, ni total, conteos, resumen, error o
 *    aviso): la tabla queda en cargandoInicial. Si la petición del usuario nuevo falla, queda el error sin filas.
 *  - `crudo` es la respuesta tal cual, para las claves propias del endpoint (por ejemplo los grupos del Hub).
 *
 * useListadoCliente(filas, estado, accesores): para endpoints chicos que devuelven todo (la papelera de SC, los leads de
 * una campaña, las tablas de detalle). Filtra, ordena y pagina en el navegador con el mismo estado (listadoCliente de
 * lib/tabla.js). Mientras la pantalla trae los datos (filas null), cargandoInicial. Regla (r1, 6c), igual que `filas`:
 * los accesores deben ser estables (una constante o useMemo); si no, cada render arma otra página.
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
  /** r1: true = todavía no pide (esperar: !listo) y se ve cargando. Por defecto false. */
  esperar?: boolean;
  /** r1: el despachar de useEstadoTabla; con él, un orden rechazado (422) vuelve al orden por defecto. */
  despachar?: DespacharTabla;
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
  ruta, estado, extra, conConteos = false, conResumen = false, activo = true, esperar = false, despachar,
}: OpcionesListado): Listado<T> {
  const url = urlListado(ruta, estado, { extra, conConteos, conResumen });
  const orden = estado.orden;
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState<ResultadoListado | null>(null);
  // Una carga por hook: aborta la anterior y solo publica la vigente (D28). setResultado se llama solo cuando llega.
  const [carga] = useState(() => crearCargaListado({
    pedir: pedirLista,
    alLlegar: (llegada) => setResultado((previo) => aplicarLlegadaListado(previo, llegada)),
  }));
  // 6b: cuántas veces se volvió a pedir una consulta que ya había llegado (reactivar, dejar de esperar).
  const repeticion = useSyncExternalStore(carga.suscribir, carga.repeticion, carga.repeticion);
  // r2, punto 3: el último rechazo de orden atendido; es estado de la carga, así que atenderlo vuelve a pintar.
  const atendido = useSyncExternalStore(carga.suscribir, carga.atendido, carga.atendido);
  const usuario = usuarioDeLaSesion();
  const clave = `${version}|${usuario ?? ''}|${url}`;

  useEffect(
    () => lanzarListado(carga, { url, clave, contexto: { ruta, orden, usuario }, activo, esperar }),
    [carga, url, clave, ruta, orden, usuario, activo, esperar],
  );

  // Punto 1 (r1) y puntos 2 y 3 (r2): un orden rechazado vuelve al por defecto, UNA vez por llegada, desde un efecto y
  // solo si sigue siendo el rechazado (restablecerOrden).
  useEffect(() => {
    if (!despachar) return;
    const n = rechazoPorAtender(resultado, { orden, atendido, usuario });
    const rechazo = resultado?.rechazo;
    if (n === null || !rechazo) return;
    carga.atender(n);
    despachar({ tipo: 'restablecerOrden', rechazado: rechazo.orden });
  }, [carga, resultado, orden, atendido, usuario, despachar]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const restablece = Boolean(despachar);

  return useMemo(() => {
    const visto = estadoListado(resultado, { clave, activo, esperar, repeticion, ruta, orden, restablece, atendido, usuario });
    return { ...visto, filas: visto.filas as T[], recargar };
  }, [resultado, clave, activo, esperar, repeticion, ruta, orden, restablece, atendido, usuario, recargar]);
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
