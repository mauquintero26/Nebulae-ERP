'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties, KeyboardEvent as EventoTeclado, MouseEvent as EventoRaton, PointerEvent as EventoPuntero, ReactNode, RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, RotateCw, TriangleAlert } from 'lucide-react';
import { TABLE } from '@/lib/design-system';
import { textoDeError } from '@/lib/avisos';
import { velocidadAutodesplazamiento } from '@/lib/kanban';
import {
  ANCHO_SELECCION, RELLENO_CELDA, alternarOrden, alternarSeleccion, alternarSeleccionPagina, anchoAlContenido,
  anchoAlSoltar, bordeDeHueco, campoOrden, destinoArrastre, direccionOrden, estadoSeleccionPagina, fijasDe,
  filasConGrupos, firmaSeleccion, geometriaTabla, indiceDestino, limitarAncho, limitesDelAsa, paginaCorregida,
  reconciliarColumnas, recortarBordes, superaUmbralAsa, superaUmbralColumna, vistaCuerpo,
} from '@/lib/tabla';
import type { ClaveFila, DefinicionColumna, EstadoTabla, LadoFijo, RenglonTabla, VistaCuerpo } from '@/lib/tabla';
import type { DespacharTabla } from './useEstadoTabla';
import type { PreferenciasTabla } from './usePreferenciasTabla';
import { Esqueleto } from './Esqueleto';
import { Paginacion } from './Paginacion';

/**
 * La tabla estándar de la app (Bloque 4, T4D y r1; TABLA-base punto 3, R4, R5, R26, C1, C3, C13, D35, D38 y D40). Toda
 * la lógica es de lib/tabla.js (probada en tests/test_tabla.mjs); aquí solo se pinta y se conecta.
 *
 * Modos:
 *  - 'servidor': la página la trae useListado (T4C) con el estado de useEstadoTabla; ordenar y paginar despachan a ese
 *    estado (onEstado) y el servidor responde la página nueva. `cargando={listado.cargandoInicial}` alcanza: con
 *    esperar: !listo, cubre también la espera de las preferencias.
 *  - 'cliente': igual, pero las filas son las de useListadoCliente (el endpoint trae todo): su `orden` sale de
 *    accesoresDeOrden(columnas) (el valorOrden de cada columna). useListadoCliente no espera las preferencias, así que
 *    aquí va `cargando={!listo || cliente.cargandoInicial}` (T4D r1, 6l).
 *  - 'simple' (tablas de detalle dentro de un documento): sin paginación, orden ni selección, y no necesita estado.
 *    DECISIÓN T4D (D40): no recuerda nada por su cuenta. Sin `preferencias`, las columnas quedan con su forma por
 *    defecto (ancho, orden y ocultaPorDefecto de la definición) y no se estiran ni se mueven; si la pantalla le pasa
 *    `preferencias` (su único usePreferenciasTabla), se estiran, se mueven y se recuerdan como en las listas.
 *
 * D40: `preferencias` es el resultado del ÚNICO usePreferenciasTabla(id, columnas) de la pantalla, el mismo que recibe
 * «Ajustar tabla» (BarraTabla, en `ajustes`, → MenuAjustes): dos vínculos con el mismo id se pisarían la pieza {anchos}.
 * Esta tabla no llama a usePreferenciasTabla. `aviso` es el avisoOrden de useListado: un aviso ámbar sobre la tabla que
 * no tapa las filas.
 *
 * «Ajustar al ancho de la pantalla» (DECISIÓN T4D): la pantalla crea `const anchoTablaRef = useRef<number | null>(null)`
 * y se lo pasa a esta tabla (anchoRef, requerido en las listas desde r1) y a BarraTabla (ajustes.anchoRef). La tabla
 * publica ahí el ancho que tienen sus columnas (el del contenedor medido con ResizeObserver, sin la casilla de
 * selección) y MenuAjustes lo lee al hacer clic: sin otro estado ni un render de la pantalla por cada cambio de tamaño,
 * y sin una segunda instancia de preferencias.
 *
 * Dibujo: <table> con table-layout: fixed, <colgroup> y ancho = suma de anchos (mínimo 100%); la columna flexible toma
 * lo que sobra de la tarjeta (geometriaTabla). El contenedor tiene su propia barra (máximo calc(100vh − 180px)), el
 * encabezado es sticky y las columnas fijas son sticky con fondo opaco (heredan el de la fila: claseFila tiene que dar
 * uno de los tonos opacos de TABLE). Las celdas se truncan con title y los números usan tabular-nums sin partirse. En
 * pantalla completa (usePantallaCompleta) el pie lleva data-pie-tabla para dejar libre la esquina del botón de la IA.
 * Encabezado (pointer events, el arrastre del Kanban del CRM, H1, como lo resolvió el tablero común de T4B):
 *  - clic en el título: ordena (alternarOrden: ascendente, descendente y el por defecto), con aria-sort y la flecha;
 *  - presionar y arrastrar MÁS de 5 px (superaUmbralColumna) con el mouse o el lápiz (r1, 6g: no con el dedo; en
 *    táctil quedan las flechas de «Ajustar tabla»): mueve la columna, con una copia del título y una línea azul de
 *    destino (los títulos recortados a la zona libre entre las fijas y la casilla de selección, recortarBordes;
 *    indiceDestino, destinoArrastre y bordeDeHueco), sin cruzar las fijas; cerca de los bordes la tabla se desplaza sola. setPointerCapture después del
 *    umbral;
 *  - el asa de 8 px del borde derecho (24 px con el dedo, dentro de su propia columna; r2): estira o angosta (entre
 *    su mínimo y su máximo) cuando el puntero pasa UMBRAL_ASA (3 px; r2: un doble clic con temblor no es estirar);
 *    durante el arrastre el ancho va al <col> por ref, sin volver a pintar las filas, y se guarda al soltar (D38) con
 *    anchoAlSoltar: sin pasar el umbral no se guarda; la flexible, al ensanchar, guarda lo que se ve, y al angostar
 *    mientras llena, su base (r2, punto 2; limitesDelAsa: nunca se ve un ancho que no se pueda guardar);
 *  - doble clic en el asa: ajusta al texto que se ve (anchoAlContenido, máximo 480 px), medido con el ancho propio del
 *    contenido (un inline-block que se encoge; r1, punto 2), así que también angosta.
 *  Los gestos se escuchan en document, en captura, con su pointerId: pointerup termina (si el nodo con la captura ya no
 *  está en el DOM, no guarda), pointercancel, lostpointercapture, Esc y un puntero sin el botón apretado cancelan, y todo
 *  se limpia al desmontar. r1, punto 1: un gesto que se cancela sin pointerup (Esc o la captura perdida) suelta la
 *  captura y bloquea el clic de ESA columna hasta el pointerup de ese puntero (un oyente de una sola vez): cancelar no
 *  ordena, ni el doble clic del asa ajusta. Mientras las preferencias no están listas (D35) no hay asas ni arrastre.
 * El cuerpo (CuerpoTabla, memoizado) no depende del arrastre: mover una columna no vuelve a pintar las celdas (r1, 6j).
 * Estados (vistaCuerpo): sin datos y cargando, 8 renglones esqueleto y el pie 'Cargando…'; recargando, las filas
 * atenuadas, una barra fina arriba y las casillas deshabilitadas; error, la fila 'No se pudo cargar la lista: <detalle>'
 * con 'Reintentar'; vacío, lo que traiga `vacio`. Si un filtro deja menos páginas, salta a la última que existe
 * (paginaCorregida).
 * Selección: la casilla del encabezado marca solo la página visible (alternarSeleccionPagina) y la selección se limpia
 * cuando cambia la lista: página, pestaña, búsqueda, filtro, orden, tamaño o modo (firmaSeleccion; R5 y C3), y también
 * una vez al montar (r1, 6b: al volver del Kanban).
 * Sin alert, confirm ni prompt.
 */

export type { ClaveFila } from '@/lib/tabla';

export type AlineacionColumna = 'izquierda' | 'centro' | 'derecha';

/** Una columna de la tabla estándar (la definición, estable: una constante o useMemo). */
export type ColumnaTabla<T> = DefinicionColumna & {
  /** El título del encabezado (también en «Ajustar tabla» y en la copia que se arrastra). */
  titulo: string;
  /**
   * Lo que va en la celda. Un texto o un número va también en el title (se lee completo al pasar el mouse).
   * r2 (6j): solo puede depender de la fila y de lo que esté en las dependencias del useMemo de columnas (o de la identidad de claseFila); el cuerpo está memoizado.
   */
  celda: (fila: T) => ReactNode;
  alinear?: AlineacionColumna;
  /** true ordena por el id; un texto es el campo de orden del servidor (por ejemplo 'total_cop'). */
  ordenable?: boolean | string;
  /** El valor de orden en el modo 'cliente' (accesoresDeOrden, para useListadoCliente). */
  valorOrden?: (fila: T) => unknown;
  /**
   * Toma el espacio que sobra de la tarjeta, sin bajar de su ancho (medido con ResizeObserver). Con el asa no pasa de su
   * anchoMax (640 por defecto): si ya llena más que eso, solo se angosta. Dale un anchoMax mayor si la pantalla quiere
   * que se pueda ensanchar en pantallas anchas.
   */
  flexible?: boolean;
  /** El title de la celda cuando no es el texto que se pinta. */
  titleCelda?: (fila: T) => string | null | undefined;
};

type PropsComunes<T> = {
  /** La clave de la tabla (la misma de useEstadoTabla y usePreferenciasTabla), por ejemplo 'ventas.hub'. */
  id: string;
  columnas: ReadonlyArray<ColumnaTabla<T>>;
  filas: ReadonlyArray<T>;
  /** Sin datos y cargando: 8 renglones esqueleto (ver los modos arriba). */
  cargando?: boolean;
  /** Con datos y otra carga en camino (listado.recargando): las filas atenuadas y una barra fina. */
  recargando?: boolean;
  /** El error de la última carga (listado.error). */
  error?: unknown;
  onReintentar?: () => void;
  /** La clave de cada fila; por defecto fila.id (o su posición). */
  claveFila?: (fila: T, indice: number) => ClaveFila;
  /** Clic (o Enter) en la fila; no salta con un clic en un enlace, un botón, una casilla o el menú ⋯. */
  onFila?: (fila: T) => void;
  /**
   * Las clases de la fila: usa un tono opaco de TABLE (filaAlerta, filaAviso, filaInfo, filaApagada); un tono translúcido (/NN) deja ver lo que pasa debajo de las columnas fijas.
   * Reemplaza el blanco y el hover de siempre (los tonos de TABLE traen el suyo). Como celda (r2, 6j): solo puede depender de la fila y de lo que esté en las dependencias del useMemo de columnas (o de la identidad de claseFila); el cuerpo está memoizado.
   */
  claseFila?: (fila: T) => string | null | undefined;
  /** El grupo de la fila: un separador al empezar cada tramo (filasConGrupos). */
  grupoFila?: (fila: T) => string | null | undefined;
  /** El texto del separador; por defecto 'grupo · n'. */
  tituloGrupo?: (grupo: string, n: number) => ReactNode;
  /** Lo que se ve sin filas. */
  vacio?: ReactNode;
  /** Lo que va en el pie, junto a la paginación (por ejemplo, una suma). */
  pie?: ReactNode;
  /** D40: el aviso ámbar sobre la tabla (listado.avisoOrden). */
  aviso?: string | null;
  /** El nombre de la tabla para los lectores de pantalla. */
  etiqueta?: string;
};

export type PropsTablaLista<T> = PropsComunes<T> & {
  modo: 'servidor' | 'cliente';
  /** D40: el resultado del único usePreferenciasTabla(id, columnas) de la pantalla. */
  preferencias: PreferenciasTabla;
  /** «Ajustar al ancho de la pantalla»: el mismo ref que recibe BarraTabla (ajustes.anchoRef); la tabla publica su ancho. */
  anchoRef: RefObject<number | null>;
  /** El total de la consulta (listado.total; null mientras carga). */
  total: number | null;
  /** El estado de useEstadoTabla. */
  estado: EstadoTabla;
  /** El despachar de useEstadoTabla. */
  onEstado: DespacharTabla;
  seleccion?: ReadonlyArray<ClaveFila>;
  /** Con onSeleccion aparece la casilla de cada fila. */
  onSeleccion?: (seleccion: ClaveFila[]) => void;
  seleccionable?: (fila: T) => boolean;
};

export type PropsTablaSimple<T> = PropsComunes<T> & {
  modo: 'simple';
  /** Opcional: con él, las columnas se estiran, se mueven y se recuerdan. */
  preferencias?: PreferenciasTabla;
  anchoRef?: RefObject<number | null>;
  total?: never;
  estado?: never;
  onEstado?: never;
  seleccion?: never;
  onSeleccion?: never;
  seleccionable?: never;
};

export type PropsTablaEstandar<T> = PropsTablaLista<T> | PropsTablaSimple<T>;

type FormaColumnas = { visibles: string[]; anchos: Record<string, number>; fijas: Record<string, LadoFijo> };
type Linea = { x: number; top: number; alto: number };
type Moviendo = { id: string; titulo: string; x: number; y: number; linea: Linea | null };

const SIN_SELECCION: ReadonlyArray<ClaveFila> = [];
const TEXTO_VACIO = 'No hay nada para mostrar.';
const ALINEAR: Record<AlineacionColumna, string> = { izquierda: 'text-left', centro: 'text-center', derecha: 'text-right' };
const ALINEAR_TITULO: Record<AlineacionColumna, string> = { izquierda: '', centro: 'justify-center', derecha: 'justify-end' };
const ARIA_ORDEN = { asc: 'ascending', desc: 'descending' } as const;
/** El ancho de la flecha del orden en el título (para el doble clic en el asa). */
const ANCHO_FLECHA = 16;
/** Un clic en estos elementos de la fila no abre la fila. */
const INTERACTIVO = 'a, button, input, select, textarea, label, [role="menu"], [role="menuitem"], [data-sin-fila]';

const mismaLinea = (a: Linea | null, b: Linea | null) =>
  a === b || (a !== null && b !== null && a.x === b.x && a.top === b.top && a.alto === b.alto);

/** left o right de una columna fija (position: sticky). */
function estiloFija(v: string, fijas: Record<string, LadoFijo>, offsets: Record<string, number>): CSSProperties | undefined {
  const lado = fijas[v];
  if (!lado) return undefined;
  return lado === 'izquierda' ? { left: offsets[v] ?? 0 } : { right: offsets[v] ?? 0 };
}

/** El borde de la última fija de la izquierda y de la primera de la derecha. */
function clasesFija(v: string, fijas: Record<string, LadoFijo>, visibles: ReadonlyArray<string>) {
  if (fijas[v] === 'izquierda' && [...visibles].reverse().find((x) => fijas[x] === 'izquierda') === v) return TABLE.bordeFijaIzquierda;
  if (fijas[v] === 'derecha' && visibles.find((x) => fijas[x] === 'derecha') === v) return TABLE.bordeFijaDerecha;
  return '';
}

type PropsCuerpo<T> = {
  vista: VistaCuerpo;
  renglones: RenglonTabla[];
  visibles: string[];
  porId: Map<string, ColumnaTabla<T>>;
  fijas: Record<string, LadoFijo>;
  offsets: Record<string, number>;
  nColumnas: number;
  disponible: number | null;
  recargando: boolean;
  error: unknown;
  onReintentar?: () => void;
  vacio?: ReactNode;
  tituloGrupo?: (grupo: string, n: number) => ReactNode;
  claveDe: (fila: T, indice: number) => ClaveFila;
  claseFila?: (fila: T) => string | null | undefined;
  onFila?: (fila: T) => void;
  seleccionActiva: boolean;
  seleccion: ReadonlyArray<ClaveFila>;
  onSeleccion?: (seleccion: ClaveFila[]) => void;
  seleccionable?: (fila: T) => boolean;
};

/** El <tbody> (memoizado en CuerpoTabla): solo depende de los datos, la forma de las columnas y la selección. */
function CuerpoTablaBase<T>({
  vista, renglones, visibles, porId, fijas, offsets, nColumnas, disponible, recargando, error, onReintentar, vacio,
  tituloGrupo, claveDe, claseFila, onFila, seleccionActiva, seleccion, onSeleccion, seleccionable,
}: PropsCuerpo<T>) {
  // Los mensajes de ancho completo (vacío, error, separadores) quedan a la vista aunque la tabla se corra de lado.
  const anchoMensaje: CSSProperties | undefined = disponible === null
    ? undefined
    : { width: Math.max(0, disponible - RELLENO_CELDA) };
  const alClicFila = (e: EventoRaton<HTMLTableRowElement>, fila: T) => {
    if (!onFila) return;
    const interactivo = (e.target as HTMLElement).closest(INTERACTIVO);
    if (interactivo && e.currentTarget.contains(interactivo)) return;
    if (window.getSelection()?.toString()) return;
    onFila(fila);
  };
  const alTeclearFila = (e: EventoTeclado<HTMLTableRowElement>, fila: T) => {
    if (onFila && e.key === 'Enter' && e.target === e.currentTarget) {
      e.preventDefault();
      onFila(fila);
    }
  };
  return (
    <tbody className={recargando && vista === 'filas' ? TABLE.atenuado : undefined}>
      {vista === 'esqueleto' && <Esqueleto columnas={nColumnas} />}
      {vista === 'error' && (
        <tr>
          <td colSpan={nColumnas} className={TABLE.error}>
            <div role="alert" className={TABLE.mensajeFijo} style={anchoMensaje}>
              {textoDeError(error, 'No se pudo cargar la lista')}
              {onReintentar && (
                <button type="button" onClick={onReintentar} className={TABLE.botonReintentar}>
                  <RotateCw size={12} aria-hidden="true" />
                  Reintentar
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
      {vista === 'vacio' && (
        <tr>
          <td colSpan={nColumnas} className={TABLE.vacio}>
            <div className={TABLE.mensajeFijo} style={anchoMensaje}>{vacio ?? TEXTO_VACIO}</div>
          </td>
        </tr>
      )}
      {vista === 'filas' && renglones.map((r, i) => {
        if (r.tipo === 'grupo') {
          return (
            <tr key={`grupo-${i}-${r.grupo}`}>
              <td colSpan={nColumnas} className={TABLE.grupoCelda}>
                <div className={TABLE.mensajeFijo} style={anchoMensaje}>
                  {tituloGrupo ? tituloGrupo(r.grupo, r.n) : `${r.grupo} · ${r.n}`}
                </div>
              </td>
            </tr>
          );
        }
        const fila = r.fila as T;
        const clave = claveDe(fila, r.indice);
        const seleccionada = seleccionActiva && seleccion.includes(clave);
        const propia = claseFila?.(fila);
        const fondo = seleccionada ? TABLE.filaSeleccionada : `${propia || TABLE.filaFondo} ${propia ? '' : TABLE.filaHover}`;
        return (
          <tr
            key={String(clave)}
            tabIndex={onFila ? 0 : undefined}
            onClick={onFila ? (e) => alClicFila(e, fila) : undefined}
            onKeyDown={onFila ? (e) => alTeclearFila(e, fila) : undefined}
            className={`${TABLE.fila} ${fondo} ${onFila ? TABLE.filaClic : ''}`}
          >
            {seleccionActiva && (
              <td className={TABLE.celdaCasilla}>
                <input
                  type="checkbox"
                  aria-label="Seleccionar esta fila"
                  checked={seleccionada}
                  disabled={recargando || (seleccionable ? !seleccionable(fila) : false)}
                  onChange={() => onSeleccion?.(alternarSeleccion(seleccion, clave))}
                  className={TABLE.casilla}
                />
              </td>
            )}
            {visibles.map((v) => {
              const col = porId.get(v) as ColumnaTabla<T>;
              const contenido = col.celda(fila);
              const titulo = col.titleCelda?.(fila)
                ?? (typeof contenido === 'string' || typeof contenido === 'number' ? String(contenido) : undefined);
              return (
                <td
                  key={v}
                  title={titulo ?? undefined}
                  style={estiloFija(v, fijas, offsets)}
                  className={`${TABLE.celda} ${fijas[v] ? TABLE.celdaFija : ''} ${clasesFija(v, fijas, visibles)} ${ALINEAR[col.alinear ?? 'izquierda']}`}
                >
                  <span data-celda={v} className={TABLE.contenido}>{contenido}</span>
                </td>
              );
            })}
          </tr>
        );
      })}
    </tbody>
  );
}

const CuerpoTabla = memo(CuerpoTablaBase) as typeof CuerpoTablaBase;

export function TablaEstandar<T>(props: PropsTablaEstandar<T>) {
  const {
    id, columnas, filas, cargando = false, recargando = false, error = null, onReintentar, claveFila, onFila, claseFila,
    grupoFila, tituloGrupo, vacio, pie, aviso, anchoRef, etiqueta,
  } = props;
  const lista = props.modo === 'simple' ? null : props;
  const preferencias = props.preferencias ?? null;
  const onEstado = lista?.onEstado;
  const onSeleccion = lista?.onSeleccion;
  const seleccionable = lista?.seleccionable;
  const seleccion = lista?.seleccion ?? SIN_SELECCION;
  const seleccionActiva = Boolean(onSeleccion);
  const anchoSeleccion = seleccionActiva ? ANCHO_SELECCION : 0;

  // ── columnas: las del usuario (preferencias) o, en 'simple' sin preferencias, las de la definición ──
  const porDefecto = useMemo<FormaColumnas>(() => {
    const r = reconciliarColumnas(columnas, null);
    return { visibles: r.orden.filter((c) => !r.ocultas.includes(c)), anchos: r.anchos, fijas: fijasDe(columnas) };
  }, [columnas]);
  const forma: FormaColumnas = preferencias ?? porDefecto;
  const porId = useMemo(() => new Map(columnas.map((c) => [c.id, c])), [columnas]);
  const visibles = useMemo(() => forma.visibles.filter((c) => porId.has(c)), [forma.visibles, porId]);
  const flexibles = useMemo(() => columnas.filter((c) => c.flexible).map((c) => c.id), [columnas]);
  // D35: nada se guarda antes de listo, así que hasta entonces no hay asas ni arrastre.
  const ajustable = Boolean(preferencias?.listo);

  // ── el ancho del contenedor (ResizeObserver): la columna flexible y «Ajustar al ancho» ──
  const caja = useRef<HTMLDivElement | null>(null);
  const tabla = useRef<HTMLTableElement | null>(null);
  const [disponible, setDisponible] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(() => setDisponible(el.clientWidth));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  useEffect(() => {
    if (!anchoRef) return undefined;
    anchoRef.current = disponible === null ? null : Math.max(0, disponible - anchoSeleccion);
    return () => {
      anchoRef.current = null;
    };
  }, [anchoRef, disponible, anchoSeleccion]);

  const geometria = useMemo(
    () => geometriaTabla({ visibles, anchos: forma.anchos, fijas: forma.fijas, flexibles, disponible, anchoSeleccion }),
    [visibles, forma.anchos, forma.fijas, flexibles, disponible, anchoSeleccion],
  );

  // ── el cuerpo ──
  const vista = vistaCuerpo({ cargando, error, filas });
  const renglones = useMemo(() => filasConGrupos(filas, grupoFila), [filas, grupoFila]);
  const claveDe = useCallback((fila: T, indice: number): ClaveFila => {
    if (claveFila) return claveFila(fila, indice);
    const propia = (fila as { id?: unknown } | null)?.id;
    return typeof propia === 'string' || typeof propia === 'number' ? propia : indice;
  }, [claveFila]);
  // Las filas seleccionables de la página: la casilla del encabezado marca solo estas.
  const clavesPagina = seleccionActiva
    ? filas.flatMap((f, i) => ((seleccionable?.(f) ?? true) ? [claveDe(f, i)] : []))
    : [];
  const estadoSeleccion = estadoSeleccionPagina(seleccion, clavesPagina);
  const nColumnas = visibles.length + (seleccionActiva ? 1 : 0);

  // ── si un filtro deja menos páginas, a la última que existe ──
  const corregida = lista
    ? paginaCorregida({
      pagina: lista.estado.pagina, tamano: lista.estado.tamano, total: lista.total, cargando, recargando, error,
    })
    : null;
  useEffect(() => {
    if (corregida !== null) onEstado?.({ tipo: 'pagina', valor: corregida });
  }, [corregida, onEstado]);

  // ── la selección se limpia cuando cambia la lista (R5, C3) y una vez al montar (r1, 6b: al volver del Kanban) ──
  const firma = lista ? firmaSeleccion(lista.estado) : '';
  const firmaVista = useRef<string | null>(null);
  const haySeleccion = seleccion.length > 0;
  useEffect(() => {
    if (firmaVista.current === firma) return;
    firmaVista.current = firma;
    if (haySeleccion) onSeleccion?.([]);
  }, [firma, haySeleccion, onSeleccion]);

  // ── gestos del encabezado ──
  const cols = useRef(new Map<string, HTMLTableColElement>());
  const ths = useRef(new Map<string, HTMLTableCellElement>());
  const fantasma = useRef<HTMLDivElement | null>(null);
  // La limpieza del gesto en curso (estirar o mover): uno a la vez; se llama al terminar, al cancelar y al desmontar.
  const terminar = useRef<(() => void) | null>(null);
  // r1, punto 1: el clic que se bloquea después de un gesto, por columna ('orden:<id>' para el título,
  // 'ajuste:<id>' para el doble clic del asa), y la espera del pointerup de un gesto cancelado sin soltar.
  const sinClic = useRef<string | null>(null);
  const esperaClic = useRef<(() => void) | null>(null);
  const [moviendo, setMoviendo] = useState<Moviendo | null>(null);
  // Los anchos que pintó React (el último render), para devolverle el <col> y la <table> al terminar de estirar.
  const pintada = useRef(geometria);
  useLayoutEffect(() => {
    pintada.current = geometria;
  });
  useEffect(() => {
    const gesto = terminar;
    const espera = esperaClic;
    return () => {
      gesto.current?.();
      espera.current?.();
    };
  }, []);

  /** El clic bloqueado (`clave`) vuelve a valer después del clic que sigue al soltar (misma tarea que el pointerup). */
  const liberarClic = (clave: string) => {
    window.setTimeout(() => {
      if (sinClic.current === clave) sinClic.current = null;
    }, 0);
  };
  /** Un gesto cancelado sin soltar (Esc, captura perdida): el clic sigue bloqueado hasta el pointerup de ese puntero. */
  const esperarSoltar = (pointerId: number, clave: string) => {
    esperaClic.current?.();
    function alSoltarDespues(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      quitar();
      liberarClic(clave);
    }
    function quitar() {
      document.removeEventListener('pointerup', alSoltarDespues, true);
      document.removeEventListener('pointercancel', alSoltarDespues, true);
      if (esperaClic.current === quitar) esperaClic.current = null;
    }
    document.addEventListener('pointerup', alSoltarDespues, true);
    document.addEventListener('pointercancel', alSoltarDespues, true);
    esperaClic.current = quitar;
  };

  const ordenar = (col: ColumnaTabla<T>) => {
    if (sinClic.current === `orden:${col.id}`) {
      sinClic.current = null;
      return;
    }
    const campo = campoOrden(col);
    if (!lista || !campo) return;
    lista.onEstado({ tipo: 'orden', valor: alternarOrden(lista.estado.orden, campo) });
  };

  /** Estirar o angostar con el asa: el ancho va al <col> por ref y se guarda al soltar (anchoAlSoltar). */
  const alPresionarAsa = (e: EventoPuntero<HTMLElement>, col: ColumnaTabla<T>) => {
    if (e.button !== 0 || !e.isPrimary || !ajustable || !preferencias || terminar.current) return;
    e.preventDefault();
    e.stopPropagation();
    esperaClic.current?.();
    sinClic.current = null;
    const clave = `ajuste:${col.id}`;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const x0 = e.clientX;
    const ancho0 = geometria.anchos[col.id] ?? 0;
    const base = forma.anchos[col.id] ?? ancho0;
    const total0 = geometria.total;
    // La flexible se pinta más ancha que su máximo: el asa arranca de ahí sin saltar (limitesDelAsa).
    const { min, max } = limitesDelAsa({
      base, pintado: ancho0, flexible: Boolean(col.flexible), anchoMin: col.anchoMin, anchoMax: col.anchoMax,
    });
    let ancho = ancho0;
    let movido = false;
    const pintar = (px: number) => {
      const c = cols.current.get(col.id);
      if (c) c.style.width = `${px}px`;
      if (tabla.current) tabla.current.style.width = `${total0 - ancho0 + px}px`;
    };
    // El <col> y la <table> vuelven a lo que pintó React: el render que sigue a un guardado pone lo nuevo (también si
    // la flexible absorbe el cambio y el total queda igual); sin guardado, la tabla queda como estaba.
    const restaurar = () => {
      const g = pintada.current;
      const c = cols.current.get(col.id);
      if (c) c.style.width = `${g.anchos[col.id] ?? ancho0}px`;
      if (tabla.current) tabla.current.style.width = `${g.total}px`;
    };
    const alMover = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if ((ev.buttons & 1) === 0) {
        // Se soltó sin que llegara el pointerup (menú contextual, otra ventana): se cancela.
        terminarGesto(true);
        return;
      }
      // r2, punto 1: por debajo de UMBRAL_ASA no es estirar (el temblor de un doble clic): ni movido, ni bloqueo del
      // doble clic, ni ancho en vivo. Al pasarlo, el ancho sigue al puntero desde el punto inicial (sin salto).
      if (!movido) {
        if (!superaUmbralAsa(ev.clientX - x0)) return;
        movido = true;
        sinClic.current = clave;
      }
      ancho = limitarAncho(ancho0 + ev.clientX - x0, min, max);
      pintar(ancho);
      ev.preventDefault();
    };
    const alSoltar = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const conectado = el.isConnected;
      // Se guarda al soltar (D38), solo si el asa sigue en el DOM y el puntero pasó UMBRAL_ASA (anchoAlSoltar, que lo
      // mide con dx; la flexible, al ensanchar, guarda lo que se ve; al angostar mientras llena, su base).
      const px = anchoAlSoltar({
        base, pintado: ancho0, px: ancho, flexible: Boolean(col.flexible),
        anchoMin: col.anchoMin, anchoMax: col.anchoMax, dx: ev.clientX - x0,
      });
      if (conectado && px !== null) preferencias.guardarAncho(col.id, px);
      terminarGesto(true);
    };
    const alCancelar = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      terminarGesto(ev.type === 'pointercancel');
    };
    const alTeclear = (ev: KeyboardEvent) => {
      // Por debajo de UMBRAL_ASA todavía no es un gesto: el Esc sigue su camino (como en el título).
      if (ev.key !== 'Escape' || !movido) return;
      ev.preventDefault();
      ev.stopPropagation();
      terminarGesto(false);
    };
    function terminarGesto(conPunteroArriba: boolean) {
      document.removeEventListener('pointermove', alMover, true);
      document.removeEventListener('pointerup', alSoltar, true);
      document.removeEventListener('pointercancel', alCancelar, true);
      document.removeEventListener('lostpointercapture', alCancelar, true);
      window.removeEventListener('keydown', alTeclear, true);
      terminar.current = null;
      restaurar();
      try {
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        // ya no tenía la captura (o el asa salió del DOM)
      }
      if (!movido) return;
      if (conPunteroArriba) liberarClic(clave);
      else esperarSoltar(pointerId, clave);
    }
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // Sin captura, el gesto sigue con los eventos que llegan al documento.
    }
    document.addEventListener('pointermove', alMover, true);
    document.addEventListener('pointerup', alSoltar, true);
    document.addEventListener('pointercancel', alCancelar, true);
    document.addEventListener('lostpointercapture', alCancelar, true);
    window.addEventListener('keydown', alTeclear, true);
    terminar.current = () => terminarGesto(true);
  };

  /** Doble clic en el asa: al texto que se ve (máximo 480 px), medido con el ancho propio de cada contenido. */
  const ajustarAlContenido = (col: ColumnaTabla<T>) => {
    if (sinClic.current === `ajuste:${col.id}`) {
      sinClic.current = null;
      return;
    }
    const t = tabla.current;
    if (!t || !ajustable || !preferencias) return;
    const selector = CSS.escape(col.id);
    const medidas = Array.from(t.querySelectorAll<HTMLElement>(`[data-celda="${selector}"]`)).map((el) => el.scrollWidth);
    const titulo = t.querySelector<HTMLElement>(`[data-encabezado="${selector}"]`);
    if (titulo) medidas.push(titulo.scrollWidth + (campoOrden(col) ? ANCHO_FLECHA : 0));
    // La flexible guarda el ancho al contenido, sin sumar lo que sobra (el que se ve lo vuelve a poner geometriaTabla).
    const px = anchoAlContenido(medidas, col);
    if (px !== null) preferencias.guardarAncho(col.id, px);
  };

  /** Mover la columna: presionar el título y arrastrar más de 5 px; al soltar, mover(columna, hueco). */
  const alPresionarTitulo = (e: EventoPuntero<HTMLElement>, col: ColumnaTabla<T>) => {
    // r1, 6g: con el dedo no se mueve (el navegador desplaza la tabla); quedan las flechas de «Ajustar tabla».
    if (e.pointerType === 'touch') return;
    if (e.button !== 0 || !e.isPrimary || !ajustable || !preferencias || forma.fijas[col.id] || terminar.current) return;
    esperaClic.current?.();
    sinClic.current = null;
    const clave = `orden:${col.id}`;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const enOrden = visibles;
    const lados = forma.fijas;
    let iniciado = false;
    let puntero = { x: x0, y: y0 };
    let destino: { hueco: number | null; cambia: boolean } = { hueco: null, cambia: false };
    let cuadro = 0;

    const medir = () => {
      const c = caja.current;
      if (!c) return;
      const rects: DOMRect[] = [];
      for (const v of enOrden) {
        const r = ths.current.get(v)?.getBoundingClientRect();
        if (!r) return;
        rects.push(r);
      }
      // r1, 6f, y r2, punto 5: con la tabla corrida de lado, lo que quedó debajo de una fija o de la casilla de
      // selección (sticky) no cuenta, y la línea azul tampoco se pinta encima de ellas.
      const r = c.getBoundingClientRect();
      const inicio = r.left + anchoSeleccion;
      const bordes = recortarBordes(rects, enOrden.map((v) => lados[v]), { inicio });
      destino = destinoArrastre(enOrden, lados, col.id, indiceDestino(bordes, puntero.x));
      const borde = destino.cambia && destino.hueco !== null ? bordeDeHueco(bordes, destino.hueco) : null;
      const linea = borde === null ? null : { x: Math.min(Math.max(borde, inicio), r.right), top: r.top, alto: c.clientHeight };
      setMoviendo((previo) => (!previo || mismaLinea(previo.linea, linea) ? previo : { ...previo, linea }));
    };
    // Cerca de los bordes la tabla se desplaza sola (como el tablero); si el título sale del DOM, se cancela.
    const paso = () => {
      if (!el.isConnected) {
        terminarGesto(false);
        return;
      }
      const c = caja.current;
      if (c) {
        const r = c.getBoundingClientRect();
        const vx = velocidadAutodesplazamiento(puntero.x, { left: r.left, right: r.right });
        if (vx !== 0) {
          c.scrollLeft += vx;
          medir();
        }
      }
      cuadro = window.requestAnimationFrame(paso);
    };
    const alMover = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if ((ev.buttons & 1) === 0) {
        // Se soltó sin que llegara el pointerup (antes del umbral, o un menú contextual después): no hay arrastre.
        terminarGesto(true);
        return;
      }
      puntero = { x: ev.clientX, y: ev.clientY };
      if (!iniciado) {
        if (!superaUmbralColumna(ev.clientX - x0, ev.clientY - y0)) return;
        iniciado = true;
        sinClic.current = clave;
        try {
          el.setPointerCapture(pointerId);
        } catch {
          // Sin captura, el gesto sigue con los eventos que llegan al documento.
        }
        setMoviendo({ id: col.id, titulo: col.titulo, x: ev.clientX, y: ev.clientY, linea: null });
        cuadro = window.requestAnimationFrame(paso);
      }
      if (fantasma.current) fantasma.current.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
      medir();
      ev.preventDefault();
    };
    const alSoltar = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      // Antes del umbral es un clic: lo atiende el onClick del título (ordena).
      const elegido = iniciado && el.isConnected ? destino : null;
      terminarGesto(true);
      if (elegido?.cambia && elegido.hueco !== null) preferencias.mover(col.id, elegido.hueco);
    };
    const alCancelar = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      terminarGesto(ev.type === 'pointercancel');
    };
    const alTeclear = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !iniciado) return;
      ev.preventDefault();
      ev.stopPropagation();
      terminarGesto(false);
    };
    function terminarGesto(conPunteroArriba: boolean) {
      window.cancelAnimationFrame(cuadro);
      document.removeEventListener('pointermove', alMover, true);
      document.removeEventListener('pointerup', alSoltar, true);
      document.removeEventListener('pointercancel', alCancelar, true);
      document.removeEventListener('lostpointercapture', alCancelar, true);
      window.removeEventListener('keydown', alTeclear, true);
      terminar.current = null;
      if (!iniciado) return;
      setMoviendo(null);
      try {
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        // ya no tenía la captura (o el título salió del DOM)
      }
      // Soltando, el clic que sigue no ordena; cancelado sin soltar, tampoco el que llegue con el pointerup de después.
      if (conPunteroArriba) liberarClic(clave);
      else esperarSoltar(pointerId, clave);
    }
    document.addEventListener('pointermove', alMover, true);
    document.addEventListener('pointerup', alSoltar, true);
    document.addEventListener('pointercancel', alCancelar, true);
    document.addEventListener('lostpointercapture', alCancelar, true);
    window.addEventListener('keydown', alTeclear, true);
    terminar.current = () => terminarGesto(true);
  };

  const simple = !lista;

  return (
    <div className={TABLE.raiz} data-tabla={id}>
      {aviso ? (
        <div role="status" className={TABLE.aviso}>
          <TriangleAlert size={14} aria-hidden="true" className="mt-px shrink-0" />
          <span>{aviso}</span>
        </div>
      ) : null}
      <div className={TABLE.cuerpo}>
        {recargando && !cargando ? <div role="progressbar" aria-label="Actualizando la lista" className={TABLE.recarga} /> : null}
        <div ref={caja} className={simple ? TABLE.cajaSimple : TABLE.caja}>
          <table
            ref={tabla}
            aria-label={etiqueta}
            aria-busy={cargando || recargando || undefined}
            className={TABLE.tabla}
            style={{ width: geometria.total, minWidth: '100%' }}
          >
            <colgroup>
              {seleccionActiva && <col style={{ width: ANCHO_SELECCION }} />}
              {visibles.map((v) => (
                <col
                  key={v}
                  ref={(el) => {
                    if (el) cols.current.set(v, el);
                    else cols.current.delete(v);
                  }}
                  style={{ width: geometria.anchos[v] }}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                {seleccionActiva && (
                  <th scope="col" className={TABLE.encabezadoCasilla}>
                    <input
                      type="checkbox"
                      aria-label="Seleccionar las filas de esta página"
                      title="Seleccionar las filas de esta página"
                      checked={estadoSeleccion === 'todas'}
                      ref={(el) => {
                        if (el) el.indeterminate = estadoSeleccion === 'algunas';
                      }}
                      disabled={recargando || vista !== 'filas' || !clavesPagina.length}
                      onChange={() => onSeleccion?.(alternarSeleccionPagina(seleccion, clavesPagina))}
                      className={TABLE.casilla}
                    />
                  </th>
                )}
                {visibles.map((v) => {
                  const col = porId.get(v) as ColumnaTabla<T>;
                  const campo = lista ? campoOrden(col) : null;
                  const direccion = lista ? direccionOrden(lista.estado.orden, campo) : null;
                  const Flecha = direccion === 'asc' ? ArrowUp : direccion === 'desc' ? ArrowDown : null;
                  const movible = ajustable && !forma.fijas[v];
                  const alinear = ALINEAR_TITULO[col.alinear ?? 'izquierda'];
                  const contenido = (
                    <>
                      <span data-encabezado={v} className="truncate">{col.titulo}</span>
                      {Flecha && <Flecha size={12} aria-hidden="true" className={TABLE.flechaOrden} />}
                    </>
                  );
                  return (
                    <th
                      key={v}
                      ref={(el) => {
                        if (el) ths.current.set(v, el);
                        else ths.current.delete(v);
                      }}
                      scope="col"
                      aria-sort={campo ? (direccion ? ARIA_ORDEN[direccion] : 'none') : undefined}
                      style={estiloFija(v, forma.fijas, geometria.offsets)}
                      className={`${TABLE.encabezado} ${forma.fijas[v] ? TABLE.encabezadoFijo : ''} ${clasesFija(v, forma.fijas, visibles)} ${moviendo?.id === v ? TABLE.encabezadoArrastrado : ''}`}
                    >
                      <div className={TABLE.encabezadoInterior}>
                        {campo ? (
                          <button
                            type="button"
                            title={col.titulo}
                            onClick={() => ordenar(col)}
                            onPointerDown={movible ? (e) => alPresionarTitulo(e, col) : undefined}
                            className={`${TABLE.titulo} ${TABLE.tituloOrdenable} ${alinear}`}
                          >
                            {contenido}
                          </button>
                        ) : (
                          <span
                            title={col.titulo}
                            onPointerDown={movible ? (e) => alPresionarTitulo(e, col) : undefined}
                            className={`${TABLE.titulo} ${alinear}`}
                          >
                            {contenido}
                          </span>
                        )}
                      </div>
                      {ajustable && (
                        <span
                          aria-hidden="true"
                          title="Arrastra para cambiar el ancho; doble clic para ajustarlo al texto"
                          onPointerDown={(e) => alPresionarAsa(e, col)}
                          onDoubleClick={() => ajustarAlContenido(col)}
                          className={TABLE.asa}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <CuerpoTabla
              vista={vista}
              renglones={renglones}
              visibles={visibles}
              porId={porId}
              fijas={forma.fijas}
              offsets={geometria.offsets}
              nColumnas={nColumnas}
              disponible={disponible}
              recargando={recargando}
              error={error}
              onReintentar={onReintentar}
              vacio={vacio}
              tituloGrupo={tituloGrupo}
              claveDe={claveDe}
              claseFila={claseFila}
              onFila={onFila}
              seleccionActiva={seleccionActiva}
              seleccion={seleccion}
              onSeleccion={onSeleccion}
              seleccionable={seleccionable}
            />
          </table>
        </div>
      </div>
      {(lista || pie || cargando) && (
        <div data-pie-tabla className={TABLE.pie}>
          {pie ? <div className="min-w-0">{pie}</div> : null}
          {cargando ? (
            <span role="status" className="ml-auto">Cargando…</span>
          ) : lista && vista !== 'error' && lista.total !== null ? (
            <Paginacion
              pagina={lista.estado.pagina}
              tamano={lista.estado.tamano}
              total={lista.total}
              onPagina={(pagina) => lista.onEstado({ tipo: 'pagina', valor: pagina })}
              onTamano={(tamano) => lista.onEstado({ tipo: 'tamano', valor: tamano })}
            />
          ) : null}
        </div>
      )}
      {moviendo && typeof document !== 'undefined' && createPortal(
        <>
          <div
            ref={fantasma}
            aria-hidden="true"
            className={TABLE.fantasma}
            style={{ transform: `translate(${moviendo.x + 12}px, ${moviendo.y + 12}px)` }}
          >
            {moviendo.titulo}
          </div>
          {moviendo.linea && (
            <div
              aria-hidden="true"
              className={TABLE.linea}
              style={{ left: moviendo.linea.x - 1, top: moviendo.linea.top, height: moviendo.linea.alto }}
            />
          )}
        </>,
        document.body,
      )}
    </div>
  );
}
