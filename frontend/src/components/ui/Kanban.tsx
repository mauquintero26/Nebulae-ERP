'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowRightLeft, ChevronsRightLeft, ExternalLink, Loader2, Lock, RotateCw } from 'lucide-react';
import {
  TEXTO_SOLO_VER, agregarPendiente, aplicarPagina, alternarPlegada, altoEnContenedor, asegurarColumna, bloqueoDeColumna,
  cancelarVerMas, columnaBajoPunto, columnaOcupada, columnasPorLanzar, consultaColumna, crearTopesDeEspera, crearTurnos,
  definirColumnas, deshacerMovimiento, esDesplazable, esperarRecarga, estadoColumna, estadoDestino, firmaConsulta,
  idsPendientes, llegoRecarga, mapaDestinos, marcarRecibido, moverTarjeta, opcionesMoverA, paginaDeRespuesta,
  plegadasValidas, quedanEnServidor, reemplazarTarjeta, reglaSegunManejadores, resolverPlegadas, resolverSoltar,
  siguienteAnuncio, soltarEsperasOcultas, subirVersiones, superaUmbral, tableroCliente, textoMovimiento, textoTotalColumna,
  velocidadAutodesplazamiento, vencerEspera,
} from '@/lib/kanban';
import type {
  ColumnaKanban, ConsultaColumna, DatosColumna, Destino, PendienteMovimiento, ReglaSoltar, ResultadoSoltar,
} from '@/lib/kanban';
import { formatoPesos } from '@/lib/pesos';
import { textoDeError } from '@/lib/avisos';
import { useAvisos } from './Avisos';
import { Contador } from './Contador';
import { MenuFila } from './MenuFila';
import type { ItemMenuFila } from './MenuFila';
import { usePreferencia } from './usePreferencia';
import { ACCENTS } from './colors';
import type { AccentColor } from './colors';

/**
 * El tablero Kanban común de la app (Bloque 4, T4B; KANBAN-base puntos 3 y 6, R4, R11, R12, C1, C2, C4, C13, RP10,
 * RP26, RP61, RP84, D24, D35, D37 y D38). Toda la lógica es la de lib/kanban.js (probada en tests/test_kanban.mjs);
 * aquí solo se pinta y se conecta.
 *
 *  - useTableroKanban(opciones): los datos de cada columna.
 *     · modo 'servidor' (si la tabla pagina en el servidor, C4): una consulta por columna con cargar(columna,
 *       {offset, limit, orden, signal}); limit = porColumna (el tamaño de la tabla) y 0 para las plegadas (solo el
 *       total); orden = ordenDe(columna) (RP10; por defecto 'sin_movimiento' en las abiertas y 'reciente' en las
 *       cerradas). Las dependencias (búsqueda y filtros de useEstadoTabla) recargan todo de inmediato (RP84; la espera
 *       ya la trae BarraTabla), o tras esperaMs si la pantalla la pide. Cada consulta lleva su número de turno y una
 *       respuesta vieja se descarta (crearTurnos); la anterior se aborta con su signal.
 *     · modo 'cliente' (solo donde el endpoint devuelve todo): items, columnaDe, esAtrasado y fechaMovimiento; agrupa y
 *       ordena en el navegador y «Ver más» sube el corte de porColumna en porColumna. totales (RP61) reemplaza el
 *       contador de esas columnas.
 *     · Las plegadas se recuerdan en kanban:<pantalla> con usePreferencia (R4, C2; D35 y D38: nada se escribe antes de
 *       listo y nunca al montar). Sin nada guardado, salen plegadas las columnas cerradas. La pantalla es el mismo id de
 *       useEstadoTabla (RP26).
 *  - TableroKanban: columnas de w-72 (85vw con scroll-snap en el celular), plegadas en una barra de 48 px, contadores
 *    con Contador (C13), 3 tarjetas grises mientras carga, caja rose con «Reintentar» si una columna falla y el texto
 *    vacio si no hay nada. Arrastre con pointer events portado del CRM (H1): umbral de 6 px (menos es un clic, que
 *    llama onAbrir), captura del puntero, clon flotante, autodesplazamiento y Escape o pointercancel para cancelar. Al
 *    empezar se calcula mapaDestinos: las columnas permitidas dicen «Soltar aquí» y las bloqueadas se apagan con un
 *    candado y su motivo. Al soltar, resolverSoltar: 'bloqueado' avisa el motivo con su enlace; 'cambio' mueve la
 *    tarjeta (moverTarjeta, optimista), llama onCambio y, si falla, la devuelve y avisa el error del servidor; 'accion'
 *    se la pasa a onAccion (la pantalla abre su ventana y, al terminar, llama tablero.recargar([origen, destino])).
 *    Con el teclado o en el celular, el menú ⋯ (MenuFila, C1) trae «Abrir», «Mover a …» por columna (las bloqueadas
 *    deshabilitadas con su motivo, D38) y las accionesTarjeta (ItemMenuFila, con etiqueta: D24).
 *  - TarjetaKanban: la tarjeta de un documento (número con su tipo, título, subtítulo, chips, acción principal, monto
 *    con formatoPesos y la insignia de estado con `clases` de Tailwind o `colores` hex, D37).
 * Sin alert, confirm ni prompt: los avisos son de useAvisos.
 */

// ─── tipos ───────────────────────────────────────────────────────────────────────

type Id = unknown;

/** Lo que devuelve cargar: {items, total, resumen?}; también sirve {filas, total} (normalizarRespuesta) o un arreglo. */
export type RespuestaColumnaKanban<T> = { items?: T[]; filas?: T[]; total?: number | null; resumen?: unknown } | T[];

export type ConsultaColumnaKanban = ConsultaColumna & { signal: AbortSignal };

/** Los datos de una columna como los ve la pantalla (resumenColumna) y el tablero. */
export type DatosColumnaKanban<T> = {
  items: T[];
  total: number | null;
  cargando: boolean;
  error: unknown;
  /**
   * T4B r3: la última carga principal de la columna falló (sigue así mientras se reintenta, hasta que una sale bien):
   * lo que pinta puede ser viejo y sus tarjetas no se mueven (bloqueoDeColumna).
   */
  cargaFallida?: boolean;
  /** Quedan tarjetas sin mostrar (en el servidor o, en modo cliente, ya cargadas). */
  hayMas: boolean;
  /** El resumen que devolvió cargar (modo servidor), p. ej. la suma de la columna. */
  resumen?: unknown;
  cargandoMas?: boolean;
  errorMas?: unknown;
};

export type MovimientoOptimista<T> = {
  /** La tarjeta toma los datos del servidor (si los hay). */
  confirmar: (documento?: T | null | void) => void;
  /** El servidor rechazó el cambio: la tarjeta vuelve a su columna. */
  deshacer: () => void;
};

export type OpcionesTableroKanban<T> = {
  /** El id de la pantalla, el mismo de useEstadoTabla (RP26): las plegadas quedan en kanban:<pantalla>. */
  pantalla: string;
  modo: 'servidor' | 'cliente';
  columnas: ReadonlyArray<ColumnaKanban>;
  /** Por defecto item.id. Si dos tipos de documento comparten ids (el Hub), una clave propia como `${tipo}|${id}`. */
  idDe?: (item: T) => Id;
  /** false mientras la vista es Lista: no carga nada. */
  activo?: boolean;
  /** El mismo tamaño de página de la tabla, 25 o 50. */
  porColumna?: number;
  // modo servidor
  cargar?: (columna: ColumnaKanban, consulta: ConsultaColumnaKanban) => Promise<RespuestaColumnaKanban<T>>;
  /** La búsqueda y los filtros (valores simples); al cambiar, se recarga todo. */
  dependencias?: ReadonlyArray<unknown>;
  /** RP10: el orden de cada columna (T7: 'atencion' en las abiertas y '-creado' en Cancelado). */
  ordenDe?: (columna: ColumnaKanban) => string;
  /** Espera antes de recargar por un cambio de dependencias; 0 por defecto (RP84: useEstadoTabla ya espera). */
  esperaMs?: number;
  // modo cliente
  /**
   * Todos los ítems (null o undefined mientras cargan). Que sea estable (estado o useMemo): cada movimiento optimista
   * vale sobre los items con los que se hizo; cuando la pantalla trae otros (p. ej. tras onCambio), manda lo de ella.
   */
  items?: ReadonlyArray<T> | null;
  columnaDe?: (item: T) => string | null | undefined;
  esAtrasado?: (item: T) => boolean;
  fechaMovimiento?: (item: T) => unknown;
  /** RP61: el total real de esas columnas (p. ej. Perdido: «los 50 más recientes y el total real»). */
  totales?: Record<string, number>;
};

export type TableroKanbanEstado<T> = {
  modo: 'servidor' | 'cliente';
  columnas: ReadonlyArray<ColumnaKanban>;
  datos: Record<string, DatosColumnaKanban<T>>;
  /** Todavía no llegó la primera respuesta de alguna columna (o, en modo cliente, los ítems). */
  cargandoInicial: boolean;
  verMas: (clave: string) => void;
  /** Recarga esas columnas (o todas) en segundo plano. En modo cliente no hace nada: los ítems son de la pantalla. */
  recargar: (claves?: ReadonlyArray<string>) => void;
  /** Pliega o abre una columna (sin `plegada`, alterna) y lo recuerda en kanban:<pantalla>. */
  plegar: (clave: string, plegada?: boolean) => void;
  plegadas: ReadonlyArray<string>;
  /** Ya se leyeron las plegadas guardadas. */
  listo: boolean;
  idDe: (item: T) => Id;
  /**
   * T4B r2: los ids (como texto) de las tarjetas con un movimiento pendiente. Una tarjeta queda pendiente desde que se
   * mueve hasta que llega (o falla) la recarga de su origen y su destino posterior a la respuesta del servidor: no se
   * arrastra ni se mueve con «Mover a…», y «Ver más» de esas columnas queda quieto.
   */
  pendientes: ReadonlySet<string>;
  /** Los mismos movimientos, con su origen y su destino (columnaOcupada). */
  movimientosPendientes: ReadonlyArray<PendienteMovimiento>;
  /**
   * Lo usa TableroKanban: el movimiento optimista de una tarjeta. confirmar (con el documento del servidor) y deshacer
   * recargan el origen y el destino, y la tarjeta sigue pendiente hasta que esas recargas llegan.
   */
  moverOptimista: (
    item: T, origen: string, destino: string, cambios: Record<string, unknown>, idDe?: (item: T) => Id,
  ) => MovimientoOptimista<T>;
};

type ColumnaInterna = DatosColumna & { firma?: string; resumen?: unknown; cargandoMas?: boolean; errorMas?: unknown };
/** La consulta en camino de una columna: la principal o la de «Ver más» (T4B r2: solo esa se aborta al mover). */
type ControlConsulta = { control: AbortController; agregar: boolean };
type TableroInterno = Record<string, ColumnaInterna>;
type MovimientoCliente<T> = {
  n: number;
  base: ReadonlyArray<T> | null | undefined;
  id: Id;
  origen: string;
  destino: string;
  cambios: Record<string, unknown>;
  idDe: (item: T) => Id;
  servidor?: T;
};

const idPorDefecto = (item: unknown): Id => (item as { id?: unknown } | null | undefined)?.id;
const COLUMNA_INICIAL: ColumnaInterna = { items: [], total: null, cargando: true, error: null };
const SIN_CORTES: Record<string, number> = {};
const SIN_MOVIMIENTOS: ReadonlyArray<never> = [];

// ─── useTableroKanban ───────────────────────────────────────────────────────────

/**
 * Los datos del tablero de una pantalla. Ver el comentario de arriba. El resultado se pasa entero a TableroKanban.
 */
export function useTableroKanban<T = unknown>(opciones: OpcionesTableroKanban<T>): TableroKanbanEstado<T> {
  const {
    pantalla, modo, columnas: crudas, idDe = idPorDefecto, activo = true, porColumna = 25, cargar, dependencias,
    ordenDe, esperaMs = 0, items, columnaDe, esAtrasado, fechaMovimiento, totales,
  } = opciones;

  const columnas = useMemo<ReadonlyArray<ColumnaKanban>>(
    () => (crudas.length ? definirColumnas(crudas) : []),
    [crudas],
  );

  // Plegadas (R4, C2, D35, D38): null = nada guardado → las cerradas. Solo se escribe cuando el usuario pliega o abre.
  const [guardadas, guardarPlegadas, listo] = usePreferencia<string[] | null>(`kanban:${pantalla}`, null, {
    validar: plegadasValidas,
  });
  const plegadas = useMemo(() => resolverPlegadas(guardadas, columnas), [guardadas, columnas]);

  const claveDeps = JSON.stringify(dependencias ?? null);

  // ── modo servidor ──
  const [tablero, setTablero] = useState<TableroInterno>({});
  const tableroRef = useRef<TableroInterno>({});
  const [versiones, setVersiones] = useState<Record<string, number>>({});
  // T4B r2: la copia síncrona de las versiones, para saber en el manejador qué versión espera cada movimiento.
  const versionesRef = useRef<Record<string, number>>({});
  // Los movimientos pendientes (T4B r2): la copia síncrona y el estado que pinta.
  const pendientesRef = useRef<ReadonlyArray<PendienteMovimiento>>([]);
  const [pendientesLista, setPendientesLista] = useState<ReadonlyArray<PendienteMovimiento>>([]);

  // La consulta vigente de cada columna, su versión y su firma (si lo que llegó tiene otra firma, la columna está
  // cargando).
  const deseadas: Record<string, { consulta: ConsultaColumna; firma: string; version: number }> = {};
  for (const c of columnas) {
    const consulta = consultaColumna(c, { plegada: plegadas.includes(c.clave), porColumna, ordenDe });
    const version = versiones[c.clave] ?? 0;
    deseadas[c.clave] = { consulta, version, firma: firmaConsulta(consulta, { dependencias: claveDeps, version }) };
  }
  const firmas = columnas.map((c) => `${c.clave}\u0000${deseadas[c.clave].firma}`).join('\u0001');

  // ── modo cliente ──
  const claveCortes = `${claveDeps}|${porColumna}`;
  const [cortes, setCortes] = useState<{ clave: string; valores: Record<string, number> }>({ clave: '', valores: {} });
  const [movimientos, setMovimientos] = useState<ReadonlyArray<MovimientoCliente<T>>>(SIN_MOVIMIENTOS);

  // Lo último que pasó la pantalla, para los manejadores y las respuestas (se lee fuera del render).
  const actuales = useRef({ cargar, columnas, deseadas, idDe, items, porColumna, ordenDe, modo });
  useEffect(() => {
    actuales.current = { cargar, columnas, deseadas, idDe, items, porColumna, ordenDe, modo };
  });

  const lanzadas = useRef<Record<string, string>>({});
  const controles = useRef<Record<string, ControlConsulta>>({});
  const turnos = useRef<ReturnType<typeof crearTurnos> | null>(null);
  const ultimasDeps = useRef<string | null>(null);
  const contador = useRef(0);
  // T4B r3: el tope de espera de las recargas de cada movimiento (ESPERA_RECARGA_MS); al vencer llama a vencer().
  const topes = useRef<ReturnType<typeof crearTopesDeEspera> | null>(null);
  const vencerRef = useRef<(n: number) => void>(() => {});

  const obtenerTurnos = useCallback(() => (turnos.current ??= crearTurnos()), []);
  const obtenerTopes = useCallback(() => (topes.current ??= crearTopesDeEspera({
    alVencer: (n) => vencerRef.current(n),
    temporizador: { setTimeout: (f, ms) => window.setTimeout(f, ms), clearTimeout: (id) => window.clearTimeout(id) },
  })), []);

  const actualizar = useCallback((cambio: (t: TableroInterno) => TableroInterno) => {
    const nuevo = cambio(tableroRef.current);
    if (nuevo === tableroRef.current) return;
    tableroRef.current = nuevo;
    setTablero(nuevo);
  }, [setTablero]);

  const actualizarPendientes = useCallback((
    cambio: (lista: ReadonlyArray<PendienteMovimiento>) => ReadonlyArray<PendienteMovimiento>,
  ) => {
    const nueva = cambio(pendientesRef.current);
    if (nueva === pendientesRef.current) return;
    pendientesRef.current = nueva;
    setPendientesLista(nueva);
    // Un movimiento que terminó (o que ya no espera recargas) pierde su tope.
    topes.current?.sincronizar(nueva);
  }, [setPendientesLista]);

  /**
   * Una consulta de una columna: la principal (firma y version) o la de «Ver más» (agregar). T4B r2: cada respuesta
   * marca la columna (marcarRecibido) y la principal, al llegar o al fallar, suelta los movimientos que esperaban esa
   * versión (llegoRecarga).
   */
  const pedir = useCallback((
    columna: ColumnaKanban, consulta: ConsultaColumna, firma: string | null, agregar: boolean, version: number | null,
  ) => {
    const clave = columna.clave;
    const lista = obtenerTurnos();
    controles.current[clave]?.control.abort();
    const control = new AbortController();
    controles.current[clave] = { control, agregar };
    const turno = lista.siguiente(clave);
    const cargarAhora = actuales.current.cargar;
    const idDeAhora = actuales.current.idDe;
    Promise.resolve()
      .then(() => {
        if (!cargarAhora) throw new Error('El tablero en modo servidor necesita la función cargar.');
        return cargarAhora(columna, { ...consulta, signal: control.signal });
      })
      .then((respuesta) => {
        if (!lista.vigente(clave, turno)) return;
        const pagina = paginaDeRespuesta(respuesta);
        actualizar((t) => {
          const conPagina = aplicarPagina(asegurarColumna(t, clave), clave, pagina, { agregar, idDe: idDeAhora });
          const marcado = marcarRecibido(conPagina, clave) as TableroInterno;
          const extra: Partial<ColumnaInterna> = agregar
            ? { cargandoMas: false, errorMas: null }
            : { firma: firma ?? undefined, resumen: pagina.resumen, cargandoMas: false, errorMas: null };
          return { ...marcado, [clave]: { ...marcado[clave], ...extra } };
        });
        if (!agregar && version !== null) actualizarPendientes((l) => llegoRecarga(l, clave, version));
      })
      .catch((err: unknown) => {
        if (!lista.vigente(clave, turno) || control.signal.aborted) return;
        actualizar((t) => {
          const previo = asegurarColumna(t, clave) as TableroInterno;
          const extra: Partial<ColumnaInterna> = agregar
            ? { cargandoMas: false, errorMas: err }
            : { firma: firma ?? undefined, error: err, cargando: false, cargandoMas: false };
          return { ...previo, [clave]: { ...previo[clave], ...extra } };
        });
        // Una recarga que falla también termina la espera: la columna muestra su error y «Reintentar».
        if (!agregar && version !== null) actualizarPendientes((l) => llegoRecarga(l, clave, version));
      });
  }, [actualizar, actualizarPendientes, obtenerTurnos]);

  // Lanza las consultas de las columnas cuya firma cambió (al activarse, con otras dependencias, otro tamaño, al
  // plegar o abrir, o con recargar). Nada de setState aquí: la columna «cargando» se deduce de la firma.
  useEffect(() => {
    // T4B r3: las esperas de las columnas que ya no se ven (un filtro, una tarjeta de indicador) se sueltan; cuando
    // vuelvan a verse, su versión (que subió igual) las recarga.
    const visibles = actuales.current.columnas.map((c) => c.clave);
    actualizarPendientes((l) => soltarEsperasOcultas(l, visibles));
    if (modo !== 'servidor' || !activo) {
      lanzadas.current = {};
      return undefined;
    }
    const lanzar = () => {
      ultimasDeps.current = claveDeps;
      const { deseadas: vigentes } = actuales.current;
      const { lista, lanzadas: nuevas } = columnasPorLanzar(actuales.current.columnas, vigentes, lanzadas.current);
      lanzadas.current = nuevas;
      for (const c of lista) pedir(c, vigentes[c.clave].consulta, vigentes[c.clave].firma, false, vigentes[c.clave].version);
    };
    if (esperaMs > 0 && ultimasDeps.current !== null && ultimasDeps.current !== claveDeps) {
      const espera = window.setTimeout(lanzar, esperaMs);
      return () => window.clearTimeout(espera);
    }
    lanzar();
    return undefined;
  }, [modo, activo, firmas, claveDeps, esperaMs, pedir, actualizarPendientes]);

  // Al desmontar, ninguna consulta queda viva (ni un tope de espera, r3). Al volver a montar (StrictMode en desarrollo),
  // los movimientos que esperaban recargas recuperan su tope.
  useEffect(() => {
    const vivos = controles.current;
    for (const p of pendientesRef.current) if (p.espera) obtenerTopes().armar(p.n);
    return () => {
      for (const { control } of Object.values(vivos)) control.abort();
      // T4B r1: StrictMode (en desarrollo) desmonta y vuelve a montar. Lo que se acaba de abortar tiene que relanzarse
      // al montar otra vez, así que la guarda de lo lanzado y las últimas dependencias se olvidan con las consultas;
      // si no, el efecto ve las mismas firmas, no relanza y el tablero queda cargando para siempre.
      lanzadas.current = {};
      ultimasDeps.current = null;
      topes.current?.limpiar();
    };
  }, [obtenerTopes]);

  /** Sube la versión de esas columnas (o de todas) y devuelve las versiones nuevas; en modo cliente, {}. */
  const subir = useCallback((claves?: ReadonlyArray<string>): Record<string, number> => {
    const ahora = actuales.current;
    if (ahora.modo !== 'servidor') return {};
    const r = subirVersiones(versionesRef.current, claves, ahora.columnas.map((c) => c.clave));
    versionesRef.current = r.versiones;
    setVersiones(r.versiones);
    return r.subidas;
  }, [setVersiones]);

  const recargar = useCallback((claves?: ReadonlyArray<string>) => {
    subir(claves);
  }, [subir]);

  // T4B r3: venció el tope de un movimiento: deja de esperar lo que faltaba y lo vuelve a pedir.
  const vencer = useCallback((n: number) => {
    const { lista, faltan } = vencerEspera(pendientesRef.current, n);
    actualizarPendientes(() => lista);
    if (faltan.length) subir(faltan);
  }, [actualizarPendientes, subir]);
  useEffect(() => {
    vencerRef.current = vencer;
  });

  const verMas = useCallback((clave: string) => {
    const ahora = actuales.current;
    if (ahora.modo === 'cliente') {
      setCortes((c) => {
        const valores = c.clave === claveCortes ? c.valores : {};
        return { clave: claveCortes, valores: { ...valores, [clave]: (valores[clave] ?? ahora.porColumna) + ahora.porColumna } };
      });
      return;
    }
    // T4B r1 y r2: con un movimiento pendiente hacia o desde la columna, el offset contaría la tarjeta optimista.
    if (columnaOcupada(pendientesRef.current, clave)) return;
    const columna = ahora.columnas.find((c) => c.clave === clave);
    const datos = tableroRef.current[clave];
    const deseada = ahora.deseadas[clave];
    // Solo con la columna ya cargada y sin otro «Ver más» en camino. Tampoco con su última carga fallida: un «Ver más»
    // exitoso borraría el error y levantaría el bloqueo de sus tarjetas sin un Reintentar (revisión de T4B r3).
    if (!columna || !datos || !deseada || datos.firma !== deseada.firma || datos.cargandoMas || datos.error) return;
    actualizar((t) => ({ ...t, [clave]: { ...t[clave], cargandoMas: true, errorMas: null } }));
    pedir(columna, consultaColumna(columna, { porColumna: ahora.porColumna, ordenDe: ahora.ordenDe, offset: datos.items.length }), null, true, null);
  }, [actualizar, pedir, claveCortes]);

  const plegar = useCallback((clave: string, plegada?: boolean) => {
    guardarPlegadas((anterior) => [...alternarPlegada(resolverPlegadas(anterior, columnas), clave, plegada)]);
  }, [guardarPlegadas, columnas]);

  const moverOptimista = useCallback((
    item: T, origen: string, destino: string, cambios: Record<string, unknown>, idDeTarjeta?: (item: T) => Id,
  ): MovimientoOptimista<T> => {
    const idDeUsado = idDeTarjeta ?? actuales.current.idDe;
    const id = idDeUsado(item);
    const n = ++contador.current;
    // T4B r2: la tarjeta queda pendiente desde ya y hasta que llegue la recarga de su origen y su destino.
    actualizarPendientes((l) => agregarPendiente(l, { n, id, origen, destino }));
    // Con la respuesta del servidor (bien o mal): se recargan el origen y el destino (aunque el destino no hubiera
    // cargado, CV2) y el movimiento espera esas versiones. En modo cliente no hay recarga: termina ahí.
    const cerrar = () => {
      const subidas = subir([origen, destino]);
      actualizarPendientes((l) => esperarRecarga(l, n, subidas));
      // T4B r3: la espera de la recarga lleva tope; el PATCH no (el servidor todavía puede aplicar el cambio).
      if (Object.keys(subidas).length) obtenerTopes().armar(n);
    };
    if (actuales.current.modo === 'cliente') {
      const base = actuales.current.items;
      setMovimientos((lista) => [...lista.filter((m) => m.base === base), { n, base, id, origen, destino, cambios, idDe: idDeUsado }]);
      return {
        confirmar: (documento) => {
          cerrar();
          if (!documento || typeof documento !== 'object') return;
          setMovimientos((lista) => lista.map((m) => (m.n === n ? { ...m, servidor: documento } : m)));
        },
        deshacer: () => {
          cerrar();
          setMovimientos((lista) => lista.filter((m) => m.n !== n));
        },
      };
    }
    // T4B r2 (R3b): un «Ver más» en vuelo en el origen o el destino se deja; su página saldría corrida y con un total
    // que ya cuenta la tarjeta.
    const { tablero: sinVerMas, abortar } = cancelarVerMas(tableroRef.current, [origen, destino]);
    for (const clave of abortar) {
      const slot = controles.current[clave];
      // T4B r3: además del abort, un turno nuevo: si cargar no pasa el signal, la respuesta vieja se descarta igual.
      if (slot?.agregar) {
        slot.control.abort();
        obtenerTurnos().siguiente(clave);
      }
    }
    actualizar(() => sinVerMas as TableroInterno);
    const antes = tableroRef.current;
    if (!antes[origen] || !antes[destino]) return { confirmar: cerrar, deshacer: cerrar };
    const { tablero: movido, deshacer } = moverTarjeta(antes, id, origen, destino, cambios, { idDe: idDeUsado });
    actualizar(() => movido as TableroInterno);
    const original = { ...(item as Record<string, unknown>) };
    return {
      // T4B r1: la respuesta se mezcla sobre la fila (reemplazarTarjeta), sin perder lo que el PATCH no devuelve.
      confirmar: (documento) => {
        if (documento && typeof documento === 'object') {
          actualizar((t) => (t[destino] ? reemplazarTarjeta(t, destino, id, documento, { idDe: idDeUsado }) as TableroInterno : t));
        }
        cerrar();
      },
      deshacer: () => {
        actualizar((t) => deshacerMovimiento(t, movido, deshacer, { id, origen, destino, original, idDe: idDeUsado }) as TableroInterno);
        cerrar();
      },
    };
  }, [actualizar, actualizarPendientes, subir, obtenerTopes, obtenerTurnos]);

  // ── lo que ve la pantalla ──
  const cortesVigentes = cortes.clave === claveCortes ? cortes.valores : SIN_CORTES;
  let datos: Record<string, DatosColumnaKanban<T>>;
  let cargandoInicial: boolean;
  if (modo === 'cliente') {
    let t = tableroCliente(items, columnas, { columnaDe, esAtrasado, fechaMovimiento, porColumna, cortes: cortesVigentes, totales });
    for (const m of movimientos) {
      if (m.base !== items || !t[m.origen] || !t[m.destino]) continue;
      t = moverTarjeta(t, m.id, m.origen, m.destino, m.cambios, { idDe: m.idDe }).tablero as typeof t;
      if (m.servidor) t = reemplazarTarjeta(t, m.destino, m.id, m.servidor, { idDe: m.idDe }) as typeof t;
    }
    datos = t as Record<string, DatosColumnaKanban<T>>;
    cargandoInicial = !Array.isArray(items);
  } else {
    datos = {};
    for (const c of columnas) {
      const base = tablero[c.clave] ?? COLUMNA_INICIAL;
      const cargando = base.firma !== deseadas[c.clave].firma;
      datos[c.clave] = {
        ...base,
        items: base.items as T[],
        cargando,
        error: cargando ? null : base.error,
        hayMas: !plegadas.includes(c.clave) && quedanEnServidor(base),
        cargaFallida: Boolean(base.error),
      };
    }
    cargandoInicial = columnas.some((c) => tablero[c.clave]?.firma === undefined);
  }

  const pendientes = useMemo(() => idsPendientes(pendientesLista), [pendientesLista]);

  return {
    modo, columnas, datos, cargandoInicial, verMas, recargar, plegar, plegadas, listo, idDe, pendientes,
    movimientosPendientes: pendientesLista, moverOptimista,
  };
}

// ─── TarjetaKanban ──────────────────────────────────────────────────────────────

export type EstadoTarjetaKanban = {
  label: string;
  /** Clases de Tailwind (COT y pedido): {bg, text, border} o un texto. */
  clases?: string | { bg?: string; text?: string; border?: string } | null;
  /** Colores hex (SC, de ESTADOS_SC). */
  colores?: { color?: string; bg?: string; border?: string } | null;
};
export type ChipTarjetaKanban = { texto: string; tono?: string };
/** href null (p. ej. «Esperando al cliente», D37): es texto, no enlace. */
export type AccionTarjetaKanban = { texto: string; href?: string | null; onClick?: () => void; tono?: string };

/** Lo que devuelve tarjetaDe (la TarjetaVentas de kanban-ventas.js encaja). */
export type DatosTarjetaKanban = {
  numero: string;
  tipo?: string | null;
  titulo: string;
  subtitulo?: string | null;
  monto?: number | null;
  estado?: EstadoTarjetaKanban | null;
  /** Máximo 3. */
  chips?: ReadonlyArray<ChipTarjetaKanban> | null;
  tiempo?: string | null;
  atrasada?: boolean;
  accionPrincipal?: AccionTarjetaKanban | null;
};

export type PropsTarjetaKanban = DatosTarjetaKanban & {
  /** El menú ⋯ (MenuFila). */
  menu?: ItemMenuFila[];
  /** El número es un botón que abre el documento (teclado). */
  onAbrir?: () => void;
  /** Espera al servidor: spinner. */
  esperando?: boolean;
};

const CLASE_TIPO: Record<string, string> = {
  SC: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  COT: 'bg-amber-100 text-amber-800 border-amber-200',
  PVEN: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  VEN: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PEC: 'bg-orange-100 text-orange-700 border-orange-200',
};
const CLASE_TIPO_OTRO = 'bg-slate-100 text-slate-600 border-slate-200';

const CLASE_CHIP: Record<string, string> = {
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  slate: 'bg-slate-50 text-slate-600 border-slate-200',
};

const CLASE_ACCION: Record<string, string> = {
  emerald: 'text-emerald-700',
  indigo: 'text-indigo-700',
  amber: 'text-amber-700',
  blue: 'text-blue-700',
  rose: 'text-rose-700',
  orange: 'text-orange-700',
  purple: 'text-purple-700',
  teal: 'text-teal-700',
  slate: 'text-slate-600',
};

const MAX_CHIPS = 3;

/** Que el clic o el puntero de un control de la tarjeta no abra el documento ni empiece un arrastre. */
const detener = (e: React.SyntheticEvent) => e.stopPropagation();

function InsigniaEstado({ estado }: { estado: EstadoTarjetaKanban }) {
  const c = estado.clases;
  const clases = typeof c === 'string' ? c : c ? [c.bg, c.text, c.border].filter(Boolean).join(' ') : '';
  const estilo = !clases && estado.colores
    ? { color: estado.colores.color, backgroundColor: estado.colores.bg, borderColor: estado.colores.border }
    : undefined;
  return (
    <span
      className={`max-w-[9rem] shrink-0 truncate rounded-full border px-2 py-0.5 text-[10px] font-bold ${clases || (estilo ? '' : CLASE_TIPO_OTRO)}`}
      style={estilo}
      title={estado.label}
    >
      {estado.label}
    </span>
  );
}

/**
 * La tarjeta de un documento en el tablero (KANBAN-base h): p-3 y text-xs; el número en negrita con la insignia de su
 * tipo (SC, COT, PVEN o PEC); el título truncado con el texto completo en title; hasta 3 chips; la acción principal
 * (enlace, botón o, con href null, solo texto: D37); el pie con el monto (formatoPesos, pesos enteros), el tiempo y la
 * insignia de estado; borde rose si está atrasada.
 */
export function TarjetaKanban({
  numero, tipo, titulo, subtitulo, monto, estado, chips, tiempo, atrasada = false, accionPrincipal, menu, onAbrir,
  esperando = false,
}: PropsTarjetaKanban) {
  const visibles = (chips ?? []).slice(0, MAX_CHIPS);
  const tonoAccion = CLASE_ACCION[accionPrincipal?.tono ?? 'slate'] ?? CLASE_ACCION.slate;
  return (
    <article
      aria-busy={esperando || undefined}
      className={`rounded-xl border bg-white p-3 text-xs shadow-xs transition-shadow hover:shadow-md ${atrasada ? 'border-rose-300' : 'border-slate-200'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {tipo && (
            <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-black ${CLASE_TIPO[tipo] ?? CLASE_TIPO_OTRO}`}>
              {tipo}
            </span>
          )}
          {onAbrir ? (
            <button
              type="button"
              onPointerDown={detener}
              onClick={(e) => {
                e.stopPropagation();
                onAbrir();
              }}
              title={`Abrir ${numero}`}
              className="min-w-0 truncate rounded font-bold text-slate-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
            >
              {numero}
            </button>
          ) : (
            <span className="min-w-0 truncate font-bold text-slate-800">{numero}</span>
          )}
          {esperando && (
            <Loader2 size={12} className="shrink-0 animate-spin text-slate-500" aria-label="Guardando el cambio" />
          )}
        </div>
        {menu && menu.length > 0 && <MenuFila items={menu} etiqueta={`Acciones de ${numero}`} />}
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-slate-800" title={titulo}>{titulo}</p>
      {subtitulo && <p className="truncate text-slate-500" title={subtitulo}>{subtitulo}</p>}
      {visibles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {visibles.map((chip, i) => (
            <span
              key={`${i}-${chip.texto}`}
              className={`max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${CLASE_CHIP[chip.tono ?? 'slate'] ?? CLASE_CHIP.slate}`}
              title={chip.texto}
            >
              {chip.texto}
            </span>
          ))}
        </div>
      )}
      {accionPrincipal && (
        <div className="mt-2 truncate">
          {accionPrincipal.href ? (
            <Link
              href={accionPrincipal.href}
              onPointerDown={detener}
              onClick={detener}
              className={`font-bold hover:underline ${tonoAccion}`}
            >
              {accionPrincipal.texto}
            </Link>
          ) : accionPrincipal.onClick ? (
            <button
              type="button"
              onPointerDown={detener}
              onClick={(e) => {
                e.stopPropagation();
                accionPrincipal.onClick?.();
              }}
              className={`font-bold hover:underline ${tonoAccion}`}
            >
              {accionPrincipal.texto}
            </button>
          ) : (
            <span className="font-semibold text-slate-500">{accionPrincipal.texto}</span>
          )}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <div className="min-w-0">
          {typeof monto === 'number' && Number.isFinite(monto) && (
            <p className="truncate font-bold tabular-nums text-slate-800">{formatoPesos(monto)}</p>
          )}
          {tiempo && <p className="truncate text-[11px] text-slate-500">{tiempo}</p>}
        </div>
        {estado && <InsigniaEstado estado={estado} />}
      </div>
    </article>
  );
}

// ─── TableroKanban ──────────────────────────────────────────────────────────────

/** Lo que recibe renderTarjeta para pintar una tarjeta propia (p. ej. LeadCard del CRM) con el menú del tablero. */
export type ContextoTarjetaKanban = { menu: ReactNode; esperando: boolean; arrastrando: boolean };

type ResultadoCambio = Extract<ResultadoSoltar, { tipo: 'cambio' }>;
type ResultadoAccion = Extract<ResultadoSoltar, { tipo: 'accion' }>;

export type PropsTableroKanban<T> = {
  tablero: TableroKanbanEstado<T>;
  /** Por defecto el idDe de useTableroKanban. */
  idDe?: (item: T) => Id;
  regla?: ReglaSoltar | null;
  /** El cambio en el servidor; devuelve el documento actualizado (o nada). Si falla, lanza Error con el texto del servidor. */
  onCambio?: (item: T, resultado: ResultadoCambio) => Promise<T | null | undefined | void>;
  /** La pantalla abre su ventana y, al terminar, llama tablero.recargar([origen, destino]). */
  onAccion?: (item: T, resultado: ResultadoAccion, origen: string, destino: string) => void;
  onAbrir: (item: T) => void;
  tarjetaDe?: (item: T) => DatosTarjetaKanban;
  renderTarjeta?: (item: T, contexto: ContextoTarjetaKanban) => ReactNode;
  /** Más ítems del menú ⋯ (ItemMenuFila, con etiqueta: D24). */
  accionesTarjeta?: (item: T) => ItemMenuFila[];
  resumenColumna?: (clave: string, datos: DatosColumnaKanban<T>) => ReactNode;
  pieColumna?: (clave: string) => ReactNode;
  /** El motivo de un tablero solo para ver («Este tablero es para ver: …», R11): no se arrastra ni se ofrece «Mover a». */
  soloLectura?: string | null;
  color?: AccentColor;
  /** El texto de una columna vacía; por defecto 'Sin documentos aquí'. */
  vacio?: string;
  /** Un aviso sobre el tablero (p. ej. «Se muestran los 200 más recientes» o «Filtrado por: X · Quitar»). */
  aviso?: ReactNode;
};

type Tono = { punto: string; borde: string; fondo: string; texto: string; anillo: string };

// Clases literales (el JIT de Tailwind no ve clases armadas): una por familia de color de las columnas.
const TONOS: Record<string, Tono> = {
  slate: { punto: 'bg-slate-400', borde: 'border-slate-400', fondo: 'bg-slate-100', texto: 'text-slate-700', anillo: 'ring-slate-300' },
  gray: { punto: 'bg-gray-400', borde: 'border-gray-400', fondo: 'bg-gray-100', texto: 'text-gray-700', anillo: 'ring-gray-300' },
  red: { punto: 'bg-red-500', borde: 'border-red-400', fondo: 'bg-red-50', texto: 'text-red-700', anillo: 'ring-red-300' },
  orange: { punto: 'bg-orange-500', borde: 'border-orange-400', fondo: 'bg-orange-50', texto: 'text-orange-700', anillo: 'ring-orange-300' },
  amber: { punto: 'bg-amber-500', borde: 'border-amber-400', fondo: 'bg-amber-50', texto: 'text-amber-700', anillo: 'ring-amber-300' },
  yellow: { punto: 'bg-yellow-500', borde: 'border-yellow-400', fondo: 'bg-yellow-50', texto: 'text-yellow-700', anillo: 'ring-yellow-300' },
  lime: { punto: 'bg-lime-500', borde: 'border-lime-400', fondo: 'bg-lime-50', texto: 'text-lime-700', anillo: 'ring-lime-300' },
  green: { punto: 'bg-green-500', borde: 'border-green-400', fondo: 'bg-green-50', texto: 'text-green-700', anillo: 'ring-green-300' },
  emerald: { punto: 'bg-emerald-500', borde: 'border-emerald-400', fondo: 'bg-emerald-50', texto: 'text-emerald-700', anillo: 'ring-emerald-300' },
  teal: { punto: 'bg-teal-500', borde: 'border-teal-400', fondo: 'bg-teal-50', texto: 'text-teal-700', anillo: 'ring-teal-300' },
  cyan: { punto: 'bg-cyan-500', borde: 'border-cyan-400', fondo: 'bg-cyan-50', texto: 'text-cyan-700', anillo: 'ring-cyan-300' },
  sky: { punto: 'bg-sky-500', borde: 'border-sky-400', fondo: 'bg-sky-50', texto: 'text-sky-700', anillo: 'ring-sky-300' },
  blue: { punto: 'bg-blue-500', borde: 'border-blue-400', fondo: 'bg-blue-50', texto: 'text-blue-700', anillo: 'ring-blue-300' },
  indigo: { punto: 'bg-indigo-500', borde: 'border-indigo-400', fondo: 'bg-indigo-50', texto: 'text-indigo-700', anillo: 'ring-indigo-300' },
  violet: { punto: 'bg-violet-500', borde: 'border-violet-400', fondo: 'bg-violet-50', texto: 'text-violet-700', anillo: 'ring-violet-300' },
  purple: { punto: 'bg-purple-500', borde: 'border-purple-400', fondo: 'bg-purple-50', texto: 'text-purple-700', anillo: 'ring-purple-300' },
  fuchsia: { punto: 'bg-fuchsia-500', borde: 'border-fuchsia-400', fondo: 'bg-fuchsia-50', texto: 'text-fuchsia-700', anillo: 'ring-fuchsia-300' },
  pink: { punto: 'bg-pink-500', borde: 'border-pink-400', fondo: 'bg-pink-50', texto: 'text-pink-700', anillo: 'ring-pink-300' },
  rose: { punto: 'bg-rose-500', borde: 'border-rose-400', fondo: 'bg-rose-50', texto: 'text-rose-700', anillo: 'ring-rose-300' },
};
const tonoDe = (tono: string | undefined): Tono => TONOS[tono ?? 'slate'] ?? TONOS.slate;

const VACIO_POR_DEFECTO = 'Sin documentos aquí';

type Arrastre<T> = {
  item: T;
  clave: string;
  origen: string;
  destinos: Record<string, Destino>;
  x: number;
  y: number;
  ancho: number;
};

/** A dónde va el foco después del render (T4B r1): la tarjeta en su columna, su encabezado o el botón de plegar/abrir. */
type FocoPendiente = { columna: string; tarjeta?: string; boton?: 'abrir' | 'plegar'; n: number };

/** Lo que se espera a que aparezca el destino del foco, en ms. */
const ESPERA_FOCO = 2000;

/** El contenedor desplazable más cercano hacia arriba (en el dashboard, el <main>), o null si es la ventana. */
function contenedorDesplazable(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (esDesplazable(window.getComputedStyle(p).overflowY)) return p;
  }
  return null;
}

type Seguimiento<T> = {
  item: T;
  clave: string;
  origen: string;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  ancho: number;
  pointerId: number;
  el: HTMLElement;
  iniciado: boolean;
};

/**
 * El tablero (KANBAN-base b a g). Ver el comentario de arriba. Ocupa todo el ancho del contenido, sin una tarjeta que
 * lo encierre (U5), y se desplaza en horizontal dentro de su caja: la página no se corre (H8). Su alto es el alto libre
 * de la ventana, mínimo 420 px.
 */
export function TableroKanban<T = unknown>({
  tablero, idDe, regla, onCambio, onAccion, onAbrir, tarjetaDe, renderTarjeta, accionesTarjeta, resumenColumna,
  pieColumna, soloLectura, color = 'indigo', vacio = VACIO_POR_DEFECTO, aviso,
}: PropsTableroKanban<T>) {
  const { avisar, avisarError } = useAvisos();
  const idTarjeta = idDe ?? tablero.idDe;
  const columnas = tablero.columnas;
  const textoSoloVer = typeof soloLectura === 'string' && soloLectura.trim() ? soloLectura : null;
  const soloVer = textoSoloVer !== null || typeof regla !== 'function';
  const reglaEfectiva = reglaSegunManejadores(regla, { cambio: Boolean(onCambio), accion: Boolean(onAccion) });
  const opcionesSoltar = { soloLectura: textoSoloVer };

  const [arrastre, setArrastre] = useState<Arrastre<T> | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');

  const envoltura = useRef<HTMLDivElement>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  // El pedido de foco es estado (lo piden manejadores que también llegan a MenuFila); el efecto lo atiende una vez.
  const [focoPendiente, setFocoPendiente] = useState<FocoPendiente | null>(null);
  const focoAtendido = useRef(0);
  const focoDesde = useRef<{ n: number; t: number } | null>(null);
  const clon = useRef<HTMLDivElement>(null);
  const secciones = useRef(new Map<string, HTMLElement>());
  const cuerpos = useRef(new Map<string, HTMLElement>());
  const seguimiento = useRef<Seguimiento<T> | null>(null);
  const puntero = useRef<{ x: number; y: number } | null>(null);
  const sobreRef = useRef<string | null>(null);

  const rectangulos = useCallback(() => {
    const mapa: Record<string, DOMRect> = {};
    for (const [clave, el] of secciones.current) mapa[clave] = el.getBoundingClientRect();
    return mapa;
  }, []);

  const cancelarArrastre = useCallback(() => {
    seguimiento.current = null;
    sobreRef.current = null;
    setArrastre(null);
    setSobre(null);
  }, []);

  // El alto libre (mínimo 420 px) dentro del contenedor desplazable más cercano (el <main> del dashboard), puesto en el
  // DOM directamente: sin un render por cada cambio de tamaño. T4B r1: el top se mide desde el principio del contenido
  // de ese contenedor, así que con el <main> ya desplazado el alto no se infla.
  const ajustarAlto = useCallback(() => {
    const caja = contenedor.current;
    if (!caja) return;
    const desplazable = contenedorDesplazable(caja);
    const arriba = caja.getBoundingClientRect().top;
    const alto = desplazable
      ? altoEnContenedor({
        altoVisible: desplazable.clientHeight,
        arriba,
        arribaContenedor: desplazable.getBoundingClientRect().top,
        desplazado: desplazable.scrollTop,
      })
      : altoEnContenedor({ altoVisible: window.innerHeight, arriba, desplazado: window.scrollY });
    caja.style.height = `${alto}px`;
  }, []);

  useLayoutEffect(() => {
    const caja = contenedor.current;
    if (!caja) return undefined;
    let cuadro = 0;
    // En el cuadro siguiente: cambiar el alto dentro del aviso del observador lo volvería a disparar en el mismo ciclo.
    const programar = () => {
      window.cancelAnimationFrame(cuadro);
      cuadro = window.requestAnimationFrame(ajustarAlto);
    };
    ajustarAlto();
    window.addEventListener('resize', programar);
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(programar);
    if (observador) {
      const desplazable = contenedorDesplazable(caja);
      if (desplazable) {
        observador.observe(desplazable);
        // Lo que está arriba del tablero (la franja de indicadores, el banner del flujo) cambia el alto de la página.
        for (const hijo of Array.from(desplazable.children)) observador.observe(hijo);
      } else observador.observe(document.body);
      if (envoltura.current) observador.observe(envoltura.current);
    }
    return () => {
      window.removeEventListener('resize', programar);
      observador?.disconnect();
      window.cancelAnimationFrame(cuadro);
    };
  }, [ajustarAlto]);

  // El aviso y el banner de solo para ver corren el tablero hacia abajo o hacia arriba.
  useLayoutEffect(() => {
    ajustarAlto();
  }, [aviso, soloVer, ajustarAlto]);

  // T4B r1: después de «Mover a…» el foco va a la tarjeta en su columna nueva (o al encabezado de la columna si ahí no
  // se ve) y, al plegar o abrir, al botón que la abre o la pliega. Se intenta después de cada render hasta que aparece,
  // por ESPERA_FOCO ms, sin setState (focoAtendido marca el pedido ya resuelto) y sin quitarle el foco a algo de fuera
  // del tablero.
  useEffect(() => {
    const f = focoPendiente;
    if (!f || focoAtendido.current === f.n) return;
    if (focoDesde.current?.n !== f.n) focoDesde.current = { n: f.n, t: Date.now() };
    const activo = document.activeElement;
    if (Date.now() - focoDesde.current.t > ESPERA_FOCO || (activo && activo !== document.body && !envoltura.current?.contains(activo))) {
      focoAtendido.current = f.n;
      return;
    }
    const seccion = secciones.current.get(f.columna);
    if (!seccion) return;
    let objetivo: HTMLElement | null = null;
    if (f.boton) {
      objetivo = seccion.querySelector<HTMLElement>(`[data-plegar="${f.boton}"]`);
    } else {
      objetivo = Array.from(seccion.querySelectorAll<HTMLElement>('[data-tarjeta]')).find((el) => el.dataset.tarjeta === f.tarjeta) ?? null;
      objetivo ??= seccion.querySelector<HTMLElement>('[data-encabezado]');
    }
    if (!objetivo) return;
    focoAtendido.current = f.n;
    objetivo.focus();
  });

  // Mientras se arrastra: autodesplazamiento cuadro a cuadro (horizontal en el tablero y vertical en la columna bajo el
  // puntero), la columna de encima y Escape para cancelar. T4B r2: si la tarjeta que tiene la captura sale del DOM (una
  // recarga la quitó), lostpointercapture va al document y no a React; por eso también se escucha ahí, en captura, y el
  // bucle cancela si el nodo ya no está conectado.
  useEffect(() => {
    if (!arrastre) return undefined;
    let cuadro = 0;
    const paso = () => {
      const seguido = seguimiento.current;
      if (seguido && !seguido.el.isConnected) {
        cancelarArrastre();
        return;
      }
      const p = puntero.current;
      const caja = contenedor.current;
      if (p && caja) {
        const r = caja.getBoundingClientRect();
        const vx = velocidadAutodesplazamiento(p.x, { left: r.left, right: r.right });
        if (vx !== 0) caja.scrollLeft += vx;
        const debajo = columnaBajoPunto(rectangulos(), p.x, p.y);
        const clave = debajo === null ? null : String(debajo);
        const cuerpo = clave === null ? null : cuerpos.current.get(clave);
        if (cuerpo) {
          const rc = cuerpo.getBoundingClientRect();
          const vy = velocidadAutodesplazamiento(p.y, { left: rc.top, right: rc.bottom });
          if (vy !== 0) cuerpo.scrollTop += vy;
        }
        if (clave !== sobreRef.current) {
          sobreRef.current = clave;
          setSobre(clave);
        }
      }
      cuadro = window.requestAnimationFrame(paso);
    };
    cuadro = window.requestAnimationFrame(paso);
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelarArrastre();
      }
    };
    // Con la tarjeta conectada, pointerup lo atiende alLevantar (React); aquí solo se cancela si ya no está en el DOM.
    const alDocumento = (e: PointerEvent) => {
      const s = seguimiento.current;
      if (!s || !s.iniciado || e.pointerId !== s.pointerId) return;
      if (e.type !== 'pointerup' || !s.el.isConnected) cancelarArrastre();
    };
    window.addEventListener('keydown', alTeclear, true);
    document.addEventListener('lostpointercapture', alDocumento, true);
    document.addEventListener('pointerup', alDocumento, true);
    document.addEventListener('pointercancel', alDocumento, true);
    return () => {
      window.cancelAnimationFrame(cuadro);
      window.removeEventListener('keydown', alTeclear, true);
      document.removeEventListener('lostpointercapture', alDocumento, true);
      document.removeEventListener('pointerup', alDocumento, true);
      document.removeEventListener('pointercancel', alDocumento, true);
    };
  }, [arrastre, rectangulos, cancelarArrastre]);

  const tituloDe = (clave: string) => columnas.find((c) => c.clave === clave)?.titulo ?? clave;
  const datosDe = (item: T): DatosTarjetaKanban => tarjetaDe?.(item) ?? { numero: String(idTarjeta(item) ?? ''), titulo: '' };
  const nombreDe = (item: T) => datosDe(item).numero;
  /** La región aria-live; un texto igual al anterior se vuelve a anunciar (T4B r1). */
  const anunciar = (texto: string) => setAnuncio((anterior) => siguienteAnuncio(anterior, texto));
  const enfocarDespues = (foco: Omit<FocoPendiente, 'n'>) => {
    setFocoPendiente((previo) => ({ ...foco, n: (previo?.n ?? 0) + 1 }));
  };

  /** Lo mismo al soltar con el puntero y al elegir «Mover a …» en el menú (desdeMenu: el foco sigue a la tarjeta). */
  const soltar = async (item: T, origen: string, destino: string, desdeMenu = false) => {
    // T4B r3: lo que pinta una columna cuya última carga falló puede ser viejo: sus tarjetas no se mueven.
    if (bloqueoDeColumna(tablero.datos[origen])) return;
    const resultado = resolverSoltar(item, origen, destino, reglaEfectiva, opcionesSoltar);
    if (resultado.tipo === 'ninguno') return;
    if (resultado.tipo === 'bloqueado') {
      avisar(resultado.motivo, { tono: 'error', accion: resultado.enlace });
      anunciar(resultado.motivo);
      return;
    }
    if (resultado.tipo === 'accion') {
      onAccion?.(item, resultado, origen, destino);
      return;
    }
    if (!onCambio) return;
    const clave = String(idTarjeta(item));
    // T4B r2: los pendientes son del hook; una tarjeta (o una copia vieja suya) espera hasta la recarga de su movimiento.
    if (tablero.pendientes.has(clave)) return;
    const movimiento = tablero.moverOptimista(item, origen, destino, { estado: resultado.estado }, idTarjeta);
    if (desdeMenu) enfocarDespues({ columna: destino, tarjeta: clave });
    try {
      const documento = await onCambio(item, resultado);
      // confirmar y deshacer recargan el origen y el destino; la tarjeta sigue pendiente hasta que esas recargas llegan.
      movimiento.confirmar(documento);
      anunciar(textoMovimiento(nombreDe(item), tituloDe(destino)));
    } catch (err) {
      movimiento.deshacer();
      if (desdeMenu) enfocarDespues({ columna: origen, tarjeta: clave });
      avisarError(err);
      anunciar(textoDeError(err));
    }
  };

  // ── arrastre con pointer events (H1, el del CRM) ──
  const alPresionar = (e: React.PointerEvent<HTMLElement>, item: T, origen: string) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seguimiento.current = {
      item,
      clave: String(idTarjeta(item)),
      origen,
      x0: e.clientX,
      y0: e.clientY,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      ancho: rect.width,
      pointerId: e.pointerId,
      el: e.currentTarget,
      iniciado: false,
    };
  };

  const alMover = (e: React.PointerEvent<HTMLElement>) => {
    const s = seguimiento.current;
    if (!s || e.pointerId !== s.pointerId) return;
    // Sin el botón presionado (se soltó fuera de la tarjeta antes del umbral), no hay arrastre.
    if ((e.buttons & 1) === 0) {
      if (s.iniciado) cancelarArrastre();
      else seguimiento.current = null;
      return;
    }
    puntero.current = { x: e.clientX, y: e.clientY };
    if (!s.iniciado) {
      if (!superaUmbral(e.clientX - s.x0, e.clientY - s.y0)) return;
      // Un tablero para ver o una tarjeta que espera al servidor no se arrastran (y ya no es un clic).
      if (soloVer || tablero.pendientes.has(s.clave) || bloqueoDeColumna(tablero.datos[s.origen])) {
        seguimiento.current = null;
        return;
      }
      s.iniciado = true;
      try {
        s.el.setPointerCapture(e.pointerId);
      } catch {
        // Sin captura el arrastre sigue con los eventos que lleguen a la tarjeta.
      }
      sobreRef.current = s.origen;
      setSobre(s.origen);
      setArrastre({
        item: s.item,
        clave: s.clave,
        origen: s.origen,
        destinos: mapaDestinos(s.item, s.origen, columnas, reglaEfectiva, opcionesSoltar),
        x: e.clientX - s.dx,
        y: e.clientY - s.dy,
        ancho: s.ancho,
      });
    } else if (clon.current) {
      clon.current.style.transform = `translate(${e.clientX - s.dx}px, ${e.clientY - s.dy}px) rotate(2deg)`;
    }
    e.preventDefault();
  };

  const alLevantar = (e: React.PointerEvent<HTMLElement>) => {
    const s = seguimiento.current;
    if (!s || e.pointerId !== s.pointerId) return;
    seguimiento.current = null;
    if (!s.iniciado) {
      onAbrir(s.item);
      return;
    }
    const debajo = columnaBajoPunto(rectangulos(), e.clientX, e.clientY);
    cancelarArrastre();
    if (debajo !== null) void soltar(s.item, s.origen, String(debajo));
  };

  const alCancelarPuntero = (e: React.PointerEvent<HTMLElement>) => {
    const s = seguimiento.current;
    if (s && e.pointerId !== s.pointerId) return;
    cancelarArrastre();
  };

  // T4B r1: si la tarjeta pierde la captura en pleno arrastre (p. ej. una recarga la quitó), se cancela como con Escape.
  // Al soltar, la captura se pierde después de pointerup, cuando el seguimiento ya es null.
  const alPerderCaptura = (e: React.PointerEvent<HTMLElement>) => {
    const s = seguimiento.current;
    if (s && s.iniciado && e.pointerId === s.pointerId) cancelarArrastre();
  };

  const plegarColumna = (clave: string, plegada: boolean) => {
    enfocarDespues({ columna: clave, boton: plegada ? 'abrir' : 'plegar' });
    tablero.plegar(clave, plegada);
  };

  // ── piezas ──
  const menuDe = (item: T, origen: string, pendiente: boolean): ItemMenuFila[] => {
    const lista: ItemMenuFila[] = [{ etiqueta: 'Abrir', icono: ExternalLink, onClick: () => onAbrir(item) }];
    if (!soloVer) {
      const destinos = mapaDestinos(item, origen, columnas, reglaEfectiva, opcionesSoltar);
      const bloqueo = bloqueoDeColumna(tablero.datos[origen]);
      for (const opcion of opcionesMoverA(origen, columnas, destinos, { bloqueo })) {
        lista.push({
          etiqueta: `Mover a ${opcion.titulo}`,
          icono: ArrowRightLeft,
          onClick: () => {
            void soltar(item, origen, opcion.clave, true);
          },
          deshabilitado: !opcion.permitido || pendiente,
          titulo: opcion.motivo ?? (pendiente ? 'Espera a que termine el cambio anterior.' : undefined),
        });
      }
    }
    return [...lista, ...(accionesTarjeta?.(item) ?? [])];
  };

  const contenidoTarjeta = (
    item: T, datos: DatosTarjetaKanban, contexto: ContextoTarjetaKanban, extra: Partial<PropsTarjetaKanban>,
  ) => {
    if (renderTarjeta) return renderTarjeta(item, contexto);
    return <TarjetaKanban {...datos} {...extra} esperando={contexto.esperando} />;
  };

  const pintarTarjeta = (item: T, origen: string) => {
    const clave = String(idTarjeta(item));
    const datos = datosDe(item);
    const pendiente = tablero.pendientes.has(clave);
    const arrastrando = arrastre?.clave === clave;
    const menu = menuDe(item, origen, pendiente);
    const movible = !soloVer && !pendiente && !bloqueoDeColumna(tablero.datos[origen]);
    return (
      <div
        key={clave}
        role="listitem"
        tabIndex={-1}
        data-tarjeta={clave}
        aria-busy={pendiente || undefined}
        onPointerDown={(e) => alPresionar(e, item, origen)}
        onPointerMove={alMover}
        onPointerUp={alLevantar}
        onPointerCancel={alCancelarPuntero}
        onLostPointerCapture={alPerderCaptura}
        className={`select-none touch-auto rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 sm:touch-pan-y ${movible ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${arrastrando ? 'opacity-40' : ''} ${pendiente ? 'opacity-70' : ''}`}
      >
        {contenidoTarjeta(
          item,
          datos,
          { menu: <MenuFila items={menu} etiqueta={`Acciones de ${datos.numero}`} />, esperando: pendiente, arrastrando },
          { menu, onAbrir: () => onAbrir(item) },
        )}
      </div>
    );
  };

  const esqueleto = (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </>
  );

  const refSeccion = (clave: string) => (el: HTMLElement | null) => {
    if (el) secciones.current.set(clave, el);
    else secciones.current.delete(clave);
  };
  const refCuerpo = (clave: string) => (el: HTMLElement | null) => {
    if (el) cuerpos.current.set(clave, el);
    else cuerpos.current.delete(clave);
  };

  const pintarColumna = (c: ColumnaKanban) => {
    const d = tablero.datos[c.clave];
    const estado = estadoColumna(d);
    const tono = tonoDe(c.tono);
    const marca = estadoDestino(arrastre?.destinos, c.clave, arrastre?.origen ?? '');
    const motivo = arrastre?.destinos[c.clave]?.motivo ?? null;
    const encima = sobre === c.clave && marca === 'permitido';
    const clasesMarca = marca === 'permitido'
      ? `border-2 border-dashed ${tono.borde} ${tono.fondo} ${encima ? `ring-2 ${tono.anillo}` : ''}`
      : marca === 'bloqueado' || marca === 'neutro' ? 'border-slate-200 bg-slate-50 opacity-50' : 'border-slate-200 bg-slate-50';

    if (tablero.plegadas.includes(c.clave)) {
      return (
        <section
          key={c.clave}
          ref={refSeccion(c.clave)}
          aria-label={c.titulo}
          className={`flex w-12 shrink-0 snap-start flex-col rounded-2xl border ${clasesMarca}`}
        >
          <button
            type="button"
            onClick={() => plegarColumna(c.clave, false)}
            data-plegar="abrir"
            data-encabezado
            aria-expanded={false}
            title={motivo ?? `Abrir la columna ${c.titulo}`}
            className="flex h-full w-full flex-col items-center gap-2 rounded-2xl px-1 py-3 text-xs font-bold text-slate-600 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${tono.punto}`} />
            <Contador valor={d?.total} estado={estado} />
            {marca === 'bloqueado' && <Lock size={12} aria-hidden="true" className="shrink-0 text-slate-500" />}
            <span className="whitespace-nowrap [writing-mode:vertical-rl] rotate-180">{c.titulo}</span>
            {marca === 'bloqueado' && motivo && <span className="sr-only">{motivo}</span>}
          </button>
        </section>
      );
    }

    const contador = estado === 'listo'
      ? <span className="tabular-nums">{textoTotalColumna(d.items.length, d.total)}</span>
      : <Contador valor={estado === 'actualizando' ? d.total : null} estado={estado} />;
    const sinTarjetas = !d || d.items.length === 0;
    const ocupada = columnaOcupada(tablero.movimientosPendientes, c.clave);

    return (
      <section
        key={c.clave}
        ref={refSeccion(c.clave)}
        aria-label={c.titulo}
        className={`flex h-full w-[85vw] shrink-0 snap-start flex-col rounded-2xl border sm:w-72 ${clasesMarca}`}
      >
        <header className="shrink-0 border-b border-slate-200 px-3 pb-2 pt-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${tono.punto}`} />
            <h3
              tabIndex={-1}
              data-encabezado
              className="min-w-0 flex-1 truncate rounded text-sm font-bold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
              title={c.ayuda ?? c.titulo}
            >
              {c.titulo}
            </h3>
            <span className="shrink-0 text-xs font-bold text-slate-500">{contador}</span>
            <button
              type="button"
              onClick={() => plegarColumna(c.clave, true)}
              data-plegar="plegar"
              aria-label={`Plegar la columna ${c.titulo}`}
              title={`Plegar la columna ${c.titulo}`}
              className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <ChevronsRightLeft size={14} aria-hidden="true" />
            </button>
          </div>
          {resumenColumna && d && <div className="mt-1 truncate text-xs text-slate-500">{resumenColumna(c.clave, d)}</div>}
          {marca === 'permitido' && <p className={`mt-1 text-xs font-bold ${tono.texto}`}>Soltar aquí</p>}
          {marca === 'bloqueado' && motivo && (
            <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-slate-600">
              <Lock size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>{motivo}</span>
            </p>
          )}
        </header>
        <div ref={refCuerpo(c.clave)} role="list" aria-label={`Tarjetas de ${c.titulo}`} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {estado === 'error' && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <p className="font-bold">No se pudo cargar esta columna.</p>
              <p className="mt-0.5 break-words">{textoDeError(d.error)}</p>
              <button
                type="button"
                onClick={() => tablero.recargar([c.clave])}
                className="mt-2 inline-flex items-center gap-1 font-bold underline underline-offset-2 hover:opacity-80"
              >
                <RotateCw size={12} aria-hidden="true" />
                Reintentar
              </button>
            </div>
          )}
          {d?.cargando && sinTarjetas ? esqueleto : null}
          {d ? d.items.map((item) => pintarTarjeta(item, c.clave)) : null}
          {estado === 'listo' && sinTarjetas && (
            <p className="px-2 py-6 text-center text-xs text-slate-500">{vacio}</p>
          )}
          {d?.hayMas && (
            <button
              type="button"
              onClick={() => {
                if (!ocupada) tablero.verMas(c.clave);
              }}
              disabled={d.cargandoMas || d.cargando || ocupada || d.cargaFallida}
              title={ocupada ? 'Espera a que termine el cambio de una tarjeta de esta columna.' : d.cargaFallida ? 'Reintenta esta columna para ver más.' : undefined}
              className={`flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 py-2 text-xs font-bold hover:bg-white disabled:opacity-60 ${ACCENTS[color].text}`}
            >
              {d.cargandoMas && <Loader2 size={12} aria-hidden="true" className="animate-spin" />}
              Ver más
            </button>
          )}
          {Boolean(d?.errorMas) && (
            <p role="alert" className="px-1 text-xs font-semibold text-rose-700">{textoDeError(d.errorMas)}</p>
          )}
        </div>
        {pieColumna && <div className="shrink-0 border-t border-slate-200 p-2">{pieColumna(c.clave)}</div>}
      </section>
    );
  };

  const contenidoClon = arrastre
    ? contenidoTarjeta(arrastre.item, datosDe(arrastre.item), { menu: null, esperando: false, arrastrando: true }, {})
    : null;

  return (
    <div ref={envoltura} className="flex w-full min-w-0 flex-col gap-2">
      {aviso && (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">{aviso}</div>
      )}
      {soloVer && (
        <p className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
          <Lock size={12} aria-hidden="true" className="shrink-0" />
          {textoSoloVer ?? TEXTO_SOLO_VER}
        </p>
      )}
      <div
        ref={contenedor}
        className={`flex min-h-[420px] w-full min-w-0 items-stretch gap-3 overflow-x-auto overflow-y-hidden pb-2 ${arrastre ? 'snap-none' : 'snap-x snap-mandatory sm:snap-none'}`}
      >
        {columnas.map(pintarColumna)}
      </div>
      <div aria-live="polite" role="status" className="sr-only">{anuncio}</div>
      {arrastre && typeof document !== 'undefined' && createPortal(
        <div
          ref={clon}
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 z-[80] opacity-95 drop-shadow-xl"
          style={{ width: arrastre.ancho, transform: `translate(${arrastre.x}px, ${arrastre.y}px) rotate(2deg)` }}
        >
          <div className="rounded-xl ring-2 ring-slate-300">{contenidoClon}</div>
        </div>,
        document.body,
      )}
    </div>
  );
}
