'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as EventoTeclado, ReactNode, RefObject } from 'react';
import { Maximize2, Minimize2, Search, X } from 'lucide-react';
import { ConmutadorVista } from '@/components/ui/ConmutadorVista';
import { Contador } from '@/components/ui/Contador';
import { ACCENTS } from '@/components/ui/colors';
import type { AccentColor } from '@/components/ui/colors';
import { FOCO } from '@/lib/design-system';
import type { EstadoKpi } from '@/lib/kpis';
import { pestanaConTecla } from '@/lib/pestanas';
import {
  accionPestana, crearBusquedaConRetardo, estadoDeConteo, estadoPastillaPestana, etiquetasDeEstados, idsDePestanas,
  opcionesDeVista, pestanaEnfocable, scrollParaVer, sincronizarBusqueda, textoResultados, toquePestana,
} from '@/lib/tabla';
import type { EstadoTabla, LocalBusqueda, OpcionesEstados } from '@/lib/tabla';
import type { DespacharTabla } from './useEstadoTabla';
import type { PreferenciasTabla } from './usePreferenciasTabla';
import type { PantallaCompleta } from './usePantallaCompleta';
import { FiltroEstados } from './FiltroEstados';
import { MenuAjustes } from './MenuAjustes';
import type { ColumnaAjustes } from './MenuAjustes';

/**
 * La barra de la tabla estándar (Bloque 4, T4D y r1; TABLA-base punto 3, R5, R11, R12, C1, C3, C13 y D40). Todo lo que
 * hace despacha al estado ÚNICO de la pantalla (`estado` y `onEstado` son el estado y el despachar de useEstadoTabla);
 * la lógica es de lib/tabla.js.
 *  - Pestañas [{id, etiqueta, conteo: number | null, alerta?}]: la activa es estado.vista. El número va en Contador
 *    (C13): un conteo null pinta la pastilla gris animada, nunca 0 ('—' si estadoConteos es 'error'; estadoDeConteo).
 *    Sin emojis. Con el teclado (r1, 6e: activación manual, WAI-ARIA), las flechas, Inicio y Fin mueven el foco
 *    (pestanaConTecla) y Enter o Espacio activan. Al cambiar de pestaña, los estados filtrados que la otra no tiene se
 *    quitan (accionPestana; las tarjetas y las cajas del flujo usan el mismo ayudante).
 *  - Búsqueda con retardo de 300 ms (crearBusquedaConRetardo); Enter busca de inmediato y la X limpia (y el foco vuelve
 *    a la caja). Esc con texto limpia de inmediato y no sale de la pantalla completa; con la caja vacía, el Esc pasa
 *    (r1, 6d). Lo que se sigue escribiendo no se pierde con el eco del estado (sincronizarBusqueda).
 *  - FiltroEstados con las opciones de la pestaña (opcionesEstados: un arreglo o una función de la vista) y las
 *    etiquetas de todas las pestañas (etiquetasDeEstados), para mostrar también un estado filtrado que la pestaña no
 *    tiene (r1, punto 5).
 *  - `filtros`: los filtros extra de la pantalla (un slot).
 *  - «Ajustar tabla» (MenuAjustes, el único control de columnas), solo en Lista y si la pantalla pasa `ajustes`
 *    {columnas, preferencias, anchoRef}, los tres requeridos (r1, 6c). D40: `preferencias` es el resultado del ÚNICO
 *    usePreferenciasTabla de la pantalla, el mismo que recibe TablaEstandar, y `anchoRef` el mismo ref que la pantalla
 *    le pasa a TablaEstandar ('Ajustar al ancho de la pantalla').
 *  - ConmutadorVista (components/ui, C1) solo si la pantalla entrega un tablero (kanbanDisponible): su valor es
 *    estado.modo y despacha {tipo: 'modo'} (useEstadoTabla lo guarda en vista:<id>; RP26).
 *  - «Pantalla completa» (Maximize2), si la pantalla pasa `pantallaCompleta` (el resultado de usePantallaCompleta, que
 *    pone la clase de la tarjeta, la capa de atrás y el Esc). El botón cambia su texto (una sola señal; r1, 6i).
 *  - 'N resultados' (textoResultados) con `total` y `estadoTotal` (r1, 6a; estadoDelTotal con lo de useListado): con
 *    error, '—'; mientras recarga, el número atenuado; sin total, la barra gris de Contador. r2, punto 6: si viene
 *    `total`, `estadoTotal` es obligatorio (un tipo unión).
 *  - r2, punto 4: si el panel de FiltroEstados se cierra porque quedó vacío, el foco va a la búsqueda, o a la pestaña
 *    activa si no hay búsqueda (alQuedarVacio).
 *  - B4 T7 r1 (A3): `pestanaAparte` {id, etiqueta, activa, onCambiar}, una pestaña que no es una vista de la lista (la
 *    Análisis de un Hub con lista; RP35: nunca va en estado.vista). Va al final de la fila, sin Contador.
 *    - Con `activa`, ella queda aria-selected y ninguna de vista. La barra pinta solo la fila de pestañas: sin
 *      búsqueda, filtros, «Ajustar tabla», conmutador, pantalla completa ni 'N resultados'.
 *    - Tocarla llama a onCambiar(true). Tocar una de vista con ella activa llama a onCambiar(false) y, si además cambia
 *      la vista, despacha accionPestana como siempre (toquePestana).
 *    - Las flechas, Inicio y Fin la incluyen (idsDePestanas) y el tabIndex sigue el patrón de siempre
 *      (pestanaEnfocable).
 *    - La pantalla pinta debajo lo suyo en lugar de la tabla o el tablero.
 */

export type { OpcionesEstados } from '@/lib/tabla';

export type PestanaTabla = {
  id: string;
  etiqueta: string;
  /** null mientras carga: pastilla gris, nunca 0. */
  conteo: number | null;
  /** La pastilla en rojo (por ejemplo, hay atrasados). */
  alerta?: boolean;
  /**
   * B4 T8: una pestaña de vista que no lleva número (la Papelera de Solicitudes, TABLA-listas-ventas punto 5): sin
   * pastilla ni Contador (estadoPastillaPestana da 'oculto'). Sin esta marca, todo como siempre.
   */
  sinConteo?: boolean;
};

/** B4 T7 r1 (A3): la pestaña que no es una vista de la lista (ver arriba). */
export type PestanaAparte = { id: string; etiqueta: string; activa: boolean; onCambiar: (activa: boolean) => void };

type PropsBaseBarraTabla = {
  /** El estado de useEstadoTabla. */
  estado: EstadoTabla;
  /** El despachar de useEstadoTabla. */
  onEstado: DespacharTabla;
  pestanas?: ReadonlyArray<PestanaTabla>;
  /** B4 T7 r1 (A3): la pestaña aparte, al final de las pestañas (por ejemplo, la Análisis de un Hub). */
  pestanaAparte?: PestanaAparte;
  /** El estado de los conteos de las pestañas, de estadoKpi. */
  estadoConteos?: EstadoKpi;
  /** false quita la búsqueda. */
  buscar?: boolean;
  placeholder?: string;
  /** Las opciones del filtro de estados (las mismas para todas las pestañas o una función de la vista). */
  opcionesEstados?: OpcionesEstados;
  etiquetaEstados?: string;
  /** Filtros extra de la pantalla. */
  filtros?: ReactNode;
  /**
   * «Ajustar tabla» (D40): las columnas, el resultado del único usePreferenciasTabla y el ref del ancho, siempre juntos
   * (los tres requeridos; r1, 6c). Sin `ajustes`, no se pinta.
   */
  ajustes?: { columnas: ReadonlyArray<ColumnaAjustes>; preferencias: PreferenciasTabla; anchoRef: RefObject<number | null> };
  /** La pantalla entrega un tablero: aparece ConmutadorVista. */
  kanbanDisponible?: boolean;
  /** El resultado de usePantallaCompleta (o lo que tenga completa y alternar); sin él, no hay botón. */
  pantallaCompleta?: Pick<PantallaCompleta, 'completa' | 'alternar'>;
  color?: AccentColor;
};

/**
 * 'N resultados': sin `total` no se pinta; con `total` (null mientras carga) va también `estadoTotal`, el estado de ese
 * número (estadoDelTotal de lib/tabla.js con lo de useListado), obligatorio (r2, punto 6).
 */
export type PropsBarraTabla = PropsBaseBarraTabla
  & ({ total?: undefined; estadoTotal?: never } | { total: number | null; estadoTotal: EstadoKpi });

const PASTILLA_ACTIVA = 'bg-white/25 text-white';
const PASTILLA_ALERTA = 'bg-rose-100 text-rose-700';
const PASTILLA = 'bg-slate-200/70 text-slate-600';
const BOTON = `inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 ${FOCO}`;
const PESTANA = `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${FOCO}`;
const PESTANA_INACTIVA = 'border-transparent text-slate-600 hover:bg-slate-100';

export function BarraTabla({
  estado, onEstado, pestanas, pestanaAparte, estadoConteos, buscar = true, placeholder = 'Buscar…', opcionesEstados,
  etiquetaEstados = 'Estado', filtros, ajustes, kanbanDisponible = false, pantallaCompleta, total, estadoTotal,
  color = 'indigo',
}: PropsBarraTabla) {
  // ── búsqueda ──
  const [busqueda, setBusqueda] = useState<LocalBusqueda>(() => ({ texto: estado.q, visto: estado.q, enviado: null }));
  // Un cambio de q que viene del estado (limpiar filtros, volver de un documento) llega a la caja; el eco de lo que la
  // caja mandó no pisa lo que se sigue escribiendo.
  if (estado.q !== busqueda.visto) setBusqueda(sincronizarBusqueda(busqueda, estado.q));
  const entrada = useRef<HTMLInputElement>(null);

  // Lo último que se pintó, para la búsqueda que sale después (se lee fuera del render).
  const actuales = useRef({ estado, onEstado });
  useLayoutEffect(() => {
    actuales.current = { estado, onEstado };
  });
  // La búsqueda con retardo se crea al primer uso, en un manejador (no en el render), y se cancela al desmontar.
  const retardoRef = useRef<ReturnType<typeof crearBusquedaConRetardo> | null>(null);
  const retardo = () => {
    retardoRef.current ??= crearBusquedaConRetardo({
      alBuscar: (texto) => {
        const { estado: e, onEstado: despachar } = actuales.current;
        if (texto === e.q) return;
        setBusqueda((b) => ({ ...b, enviado: texto }));
        despachar({ tipo: 'q', valor: texto });
      },
    });
    return retardoRef.current;
  };
  useEffect(() => {
    const busquedas = retardoRef;
    return () => busquedas.current?.cancelar();
  }, []);
  // Si la caja ya dice lo mismo que el estado (un cambio de afuera la reemplazó, o se volvió a escribir lo que ya se
  // buscó), lo que esperaba ya no sale: no deshace un «limpiar filtros» hecho dentro de los 300 ms.
  useEffect(() => {
    if (busqueda.texto === estado.q) retardoRef.current?.cancelar();
  }, [busqueda.texto, estado.q]);
  const limpiarBusqueda = () => {
    setBusqueda((b) => ({ ...b, texto: '' }));
    retardo().ya('');
  };

  // ── pestañas (activación manual: las flechas mueven el foco; Enter o Espacio, el clic del botón, activan) ──
  const botonesPestana = useRef(new Map<string, HTMLButtonElement>());
  // B4 T7 r1 (A3): la aparte va al final, en las flechas y en el tabIndex; con ella activa, ninguna de vista queda elegida.
  const aparteActiva = Boolean(pestanaAparte?.activa);
  const ids = idsDePestanas(pestanas, pestanaAparte);
  const enfocable = pestanaEnfocable(ids, estado.vista, pestanaAparte);
  const tocarPestana = (id: string) => {
    const toque = toquePestana({ id, vista: estado.vista, aparte: pestanaAparte });
    if (toque.aparte !== null) pestanaAparte?.onCambiar(toque.aparte);
    if (toque.vista !== null) onEstado(accionPestana(estado, toque.vista, opcionesEstados));
  };
  const teclaPestanas = (e: EventoTeclado<HTMLDivElement>) => {
    const enfocada = (e.target as HTMLElement).closest<HTMLElement>('[data-pestana]')?.dataset.pestana;
    const siguiente = pestanaConTecla(ids, enfocada ?? enfocable, e.key);
    if (!siguiente) return;
    e.preventDefault();
    botonesPestana.current.get(siguiente)?.focus();
  };
  // B4 T7 r2 (m-r1-a): al montar y al cambiar la pestaña activa (la aparte incluida), la fila se desplaza para mostrarla
  // (scrollParaVer). Solo la fila, con su scrollLeft: la ventana no se desplaza.
  const filaPestanas = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fila = filaPestanas.current;
    const boton = enfocable ? botonesPestana.current.get(enfocable) : undefined;
    if (!fila || !boton) return;
    const caja = fila.getBoundingClientRect();
    const r = boton.getBoundingClientRect();
    fila.scrollLeft = scrollParaVer({ inicio: r.left - caja.left + fila.scrollLeft, ancho: r.width }, { scroll: fila.scrollLeft, visible: fila.clientWidth });
  }, [enfocable]);

  const opciones = opcionesDeVista(opcionesEstados, estado.vista);
  const resultados = textoResultados(total);
  const estadoNumero = estadoTotal ?? estadoDeConteo(total);
  const completa = Boolean(pantallaCompleta?.completa);
  const textoCompleta = completa ? 'Salir de pantalla completa' : 'Pantalla completa';

  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3">
      {(pestanas && pestanas.length > 0) || pestanaAparte ? (
        <div ref={filaPestanas} role="tablist" aria-label="Pestañas" onKeyDown={teclaPestanas} className="-m-1 flex min-w-0 items-center gap-1 overflow-x-auto p-1">
          {pestanas?.map((p) => {
            const activa = !aparteActiva && p.id === estado.vista;
            // B4 T7 r2 (I-r1): con la aparte activa y sin conteo, sin pastilla: no hay nada cargando (RP35).
            const estadoPastilla = estadoPastillaPestana(p.conteo, estadoConteos, { aparteActiva, sinConteo: p.sinConteo });
            return (
              <button
                key={p.id}
                ref={(el) => {
                  if (el) botonesPestana.current.set(p.id, el);
                  else botonesPestana.current.delete(p.id);
                }}
                type="button"
                role="tab"
                data-pestana={p.id}
                aria-selected={activa}
                tabIndex={p.id === enfocable ? 0 : -1}
                onClick={() => tocarPestana(p.id)}
                className={`${PESTANA} ${activa ? ACCENTS[color].navActive : PESTANA_INACTIVA}`}
              >
                {p.etiqueta}
                {estadoPastilla !== 'oculto' && (
                  <span className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-px text-[11px] ${activa ? PASTILLA_ACTIVA : p.alerta ? PASTILLA_ALERTA : PASTILLA}`}>
                    <Contador valor={p.conteo} estado={estadoPastilla} />
                  </span>
                )}
              </button>
            );
          })}
          {pestanaAparte && (
            <button
              ref={(el) => {
                if (el) botonesPestana.current.set(pestanaAparte.id, el);
                else botonesPestana.current.delete(pestanaAparte.id);
              }}
              type="button"
              role="tab"
              data-pestana={pestanaAparte.id}
              aria-selected={aparteActiva}
              tabIndex={pestanaAparte.id === enfocable ? 0 : -1}
              onClick={() => tocarPestana(pestanaAparte.id)}
              className={`${PESTANA} ${aparteActiva ? ACCENTS[color].navActive : PESTANA_INACTIVA}`}
            >
              {pestanaAparte.etiqueta}
            </button>
          )}
        </div>
      ) : null}
      {!aparteActiva && (
        <div className="flex flex-wrap items-center gap-2">
          {buscar && (
            <div className="relative flex min-w-[12rem] flex-1 items-center sm:max-w-xs">
              <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 text-slate-400" />
              <input
                ref={entrada}
                type="search"
                aria-label="Buscar"
                placeholder={placeholder}
                value={busqueda.texto}
                onChange={(e) => {
                  const texto = e.target.value;
                  setBusqueda((b) => ({ ...b, texto }));
                  retardo().escribir(texto);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && busqueda.texto !== '') {
                    // Sin el borrado nativo ni la salida de la pantalla completa (defaultPrevented): limpia de inmediato.
                    e.preventDefault();
                    limpiarBusqueda();
                    return;
                  }
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  retardo().ya(busqueda.texto);
                }}
                className={`w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-700 placeholder:text-slate-400 ${FOCO} [&::-webkit-search-cancel-button]:hidden`}
              />
              {busqueda.texto !== '' && (
                <button
                  type="button"
                  aria-label="Limpiar la búsqueda"
                  title="Limpiar la búsqueda"
                  onClick={() => {
                    limpiarBusqueda();
                    entrada.current?.focus();
                  }}
                  className={`absolute right-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 ${FOCO}`}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          <FiltroEstados
            opciones={opciones}
            seleccion={estado.estados}
            etiquetas={etiquetasDeEstados(opcionesEstados, (pestanas ?? []).map((p) => p.id))}
            alQuedarVacio={() => (entrada.current ?? botonesPestana.current.get(estado.vista ?? ''))?.focus()}
            onCambiar={(estados) => onEstado({ tipo: 'estados', valor: estados })}
            etiqueta={etiquetaEstados}
          />
          {filtros}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {total !== undefined && (
              <span className="whitespace-nowrap text-xs font-semibold text-slate-500" aria-live="polite">
                {resultados !== null && (estadoNumero === 'listo' || estadoNumero === 'actualizando') ? (
                  <span className={estadoNumero === 'actualizando' ? 'opacity-60' : undefined}>{resultados}</span>
                ) : (
                  <>
                    <Contador valor={null} estado={estadoNumero === 'error' ? 'error' : 'cargando'} /> resultados
                  </>
                )}
              </span>
            )}
            {ajustes && estado.modo !== 'kanban' && (
              <MenuAjustes columnas={ajustes.columnas} preferencias={ajustes.preferencias} anchoRef={ajustes.anchoRef} />
            )}
            <ConmutadorVista
              modo={estado.modo}
              onCambiar={(modo) => onEstado({ tipo: 'modo', valor: modo })}
              kanbanDisponible={kanbanDisponible}
              color={color}
            />
            {pantallaCompleta && (
              <button
                type="button"
                title={completa ? `${textoCompleta} (Esc)` : textoCompleta}
                onClick={() => pantallaCompleta.alternar()}
                className={BOTON}
              >
                {completa ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
                <span className="hidden sm:inline">{textoCompleta}</span>
                <span className="sr-only sm:hidden">{textoCompleta}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
