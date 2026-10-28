'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as EventoTeclado, ReactNode, RefObject } from 'react';
import { Maximize2, Minimize2, Search, X } from 'lucide-react';
import { ConmutadorVista } from '@/components/ui/ConmutadorVista';
import { Contador } from '@/components/ui/Contador';
import { ACCENTS } from '@/components/ui/colors';
import type { AccentColor } from '@/components/ui/colors';
import type { EstadoKpi } from '@/lib/kpis';
import { pestanaConTecla } from '@/lib/pestanas';
import {
  accionPestana, crearBusquedaConRetardo, estadoDeConteo, opcionesDeVista, sincronizarBusqueda, textoResultados,
} from '@/lib/tabla';
import type { EstadoTabla, LocalBusqueda, OpcionesEstados } from '@/lib/tabla';
import type { DespacharTabla } from './useEstadoTabla';
import type { PreferenciasTabla } from './usePreferenciasTabla';
import { FiltroEstados } from './FiltroEstados';
import { MenuAjustes } from './MenuAjustes';
import type { ColumnaAjustes } from './MenuAjustes';

/**
 * La barra de la tabla estándar (Bloque 4, T4D; TABLA-base punto 3, R5, R11, R12, C1, C3, C13 y D40). Todo lo que hace
 * despacha al estado ÚNICO de la pantalla (`estado` y `onEstado` son el estado y el despachar de useEstadoTabla); la
 * lógica es de lib/tabla.js.
 *  - Pestañas [{id, etiqueta, conteo: number | null, alerta?}]: la activa es estado.vista. El número va en Contador
 *    (C13): un conteo null pinta la pastilla gris animada, nunca 0 ('—' si estadoConteos es 'error'; estadoDeConteo).
 *    Sin emojis. Con el teclado, flechas, Inicio y Fin (pestanaConTecla). Al cambiar de pestaña, los estados filtrados
 *    que la otra no tiene se quitan (accionPestana).
 *  - Búsqueda con retardo de 300 ms (crearBusquedaConRetardo); Enter busca de inmediato y la X limpia. Lo que se sigue
 *    escribiendo no se pierde con el eco del estado (sincronizarBusqueda).
 *  - FiltroEstados con las opciones de la pestaña (opcionesEstados: un arreglo o una función de la vista).
 *  - `filtros`: los filtros extra de la pantalla (un slot).
 *  - «Ajustar tabla» (MenuAjustes, el único control de columnas), solo en Lista y si la pantalla pasa `columnas` y
 *    `preferencias`. D40: `preferencias` es el resultado del ÚNICO usePreferenciasTabla de la pantalla, el mismo que
 *    recibe TablaEstandar, y `anchoRef` el mismo ref que la pantalla le pasa a TablaEstandar ('Ajustar al ancho').
 *  - ConmutadorVista (components/ui, C1) solo si la pantalla entrega un tablero (kanbanDisponible): su valor es
 *    estado.modo y despacha {tipo: 'modo'} (useEstadoTabla lo guarda en vista:<id>; RP26).
 *  - «Pantalla completa» (Maximize2), si la pantalla pasa onPantallaCompleta: la pantalla cambia la clase de su tarjeta
 *    a TABLE.tarjetaCompleta (fixed inset-4 z-40, con la barra, la tabla y la paginación). Esc sale (si nadie más lo
 *    atendió: los menús abiertos lo atienden primero).
 *  - 'N resultados' (textoResultados) con `total`; mientras no hay total, la barra gris de Contador.
 */

export type { OpcionesEstados } from '@/lib/tabla';

export type PestanaTabla = {
  id: string;
  etiqueta: string;
  /** null mientras carga: pastilla gris, nunca 0. */
  conteo: number | null;
  /** La pastilla en rojo (por ejemplo, hay atrasados). */
  alerta?: boolean;
};

export type PropsBarraTabla = {
  /** El estado de useEstadoTabla. */
  estado: EstadoTabla;
  /** El despachar de useEstadoTabla. */
  onEstado: DespacharTabla;
  pestanas?: ReadonlyArray<PestanaTabla>;
  /** El estado de los números de la barra (conteos de las pestañas y total), de estadoKpi. */
  estadoConteos?: EstadoKpi;
  /** false quita la búsqueda. */
  buscar?: boolean;
  placeholder?: string;
  /** Las opciones del filtro de estados (las mismas para todas las pestañas o una función de la vista). */
  opcionesEstados?: OpcionesEstados;
  etiquetaEstados?: string;
  /** Filtros extra de la pantalla. */
  filtros?: ReactNode;
  /** Las columnas de la tabla (para «Ajustar tabla»). */
  columnas?: ReadonlyArray<ColumnaAjustes>;
  /** El resultado del único usePreferenciasTabla de la pantalla (D40). */
  preferencias?: PreferenciasTabla;
  /** El mismo ref que recibe TablaEstandar: el ancho para 'Ajustar al ancho de la pantalla'. */
  anchoRef?: RefObject<number | null>;
  /** La pantalla entrega un tablero: aparece ConmutadorVista. */
  kanbanDisponible?: boolean;
  pantallaCompleta?: boolean;
  onPantallaCompleta?: (completa: boolean) => void;
  /** 'N resultados'; null mientras carga; sin la prop, no se pinta. */
  total?: number | null;
  color?: AccentColor;
};

const PASTILLA_ACTIVA = 'bg-white/25 text-white';
const PASTILLA_ALERTA = 'bg-rose-100 text-rose-700';
const PASTILLA = 'bg-slate-200/70 text-slate-600';
const BOTON = 'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

export function BarraTabla({
  estado, onEstado, pestanas, estadoConteos, buscar = true, placeholder = 'Buscar…', opcionesEstados,
  etiquetaEstados = 'Estado', filtros, columnas, preferencias, anchoRef, kanbanDisponible = false, pantallaCompleta = false,
  onPantallaCompleta, total, color = 'indigo',
}: PropsBarraTabla) {
  // ── búsqueda ──
  const [busqueda, setBusqueda] = useState<LocalBusqueda>(() => ({ texto: estado.q, visto: estado.q, enviado: null }));
  // Un cambio de q que viene del estado (limpiar filtros, volver de un documento) llega a la caja; el eco de lo que la
  // caja mandó no pisa lo que se sigue escribiendo.
  if (estado.q !== busqueda.visto) setBusqueda(sincronizarBusqueda(busqueda, estado.q));

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

  // ── pestañas ──
  const botonesPestana = useRef(new Map<string, HTMLButtonElement>());
  const elegirPestana = (id: string) => {
    if (id !== estado.vista) onEstado(accionPestana(estado, id, opcionesEstados));
  };
  const teclaPestanas = (e: EventoTeclado<HTMLDivElement>) => {
    const ids = (pestanas ?? []).map((p) => p.id);
    const siguiente = pestanaConTecla(ids, estado.vista ?? ids[0], e.key);
    if (!siguiente) return;
    e.preventDefault();
    elegirPestana(siguiente);
    botonesPestana.current.get(siguiente)?.focus();
  };
  const hayActiva = (pestanas ?? []).some((p) => p.id === estado.vista);

  // ── pantalla completa: Esc sale ──
  useEffect(() => {
    if (!pantallaCompleta || !onPantallaCompleta) return undefined;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onPantallaCompleta(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [pantallaCompleta, onPantallaCompleta]);

  const opciones = opcionesDeVista(opcionesEstados, estado.vista);
  const resultados = textoResultados(total);

  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3">
      {pestanas && pestanas.length > 0 && (
        <div role="tablist" aria-label="Pestañas" onKeyDown={teclaPestanas} className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 pb-0.5">
          {pestanas.map((p, i) => {
            const activa = p.id === estado.vista;
            return (
              <button
                key={p.id}
                ref={(el) => {
                  if (el) botonesPestana.current.set(p.id, el);
                  else botonesPestana.current.delete(p.id);
                }}
                type="button"
                role="tab"
                aria-selected={activa}
                tabIndex={activa || (!hayActiva && i === 0) ? 0 : -1}
                onClick={() => elegirPestana(p.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                  activa ? ACCENTS[color].navActive : 'border-transparent text-slate-600 hover:bg-slate-100'
                }`}
              >
                {p.etiqueta}
                <span className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-px text-[11px] ${activa ? PASTILLA_ACTIVA : p.alerta ? PASTILLA_ALERTA : PASTILLA}`}>
                  <Contador valor={p.conteo} estado={estadoDeConteo(p.conteo, estadoConteos)} />
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {buscar && (
          <div className="relative flex min-w-[12rem] flex-1 items-center sm:max-w-xs">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 text-slate-400" />
            <input
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
                if (e.key !== 'Enter') return;
                e.preventDefault();
                retardo().ya(busqueda.texto);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 [&::-webkit-search-cancel-button]:hidden"
            />
            {busqueda.texto !== '' && (
              <button
                type="button"
                aria-label="Limpiar la búsqueda"
                title="Limpiar la búsqueda"
                onClick={() => {
                  setBusqueda((b) => ({ ...b, texto: '' }));
                  retardo().ya('');
                }}
                className="absolute right-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <FiltroEstados
          opciones={opciones}
          seleccion={estado.estados}
          onCambiar={(estados) => onEstado({ tipo: 'estados', valor: estados })}
          etiqueta={etiquetaEstados}
        />
        {filtros}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {total !== undefined && (
            <span className="whitespace-nowrap text-xs font-semibold text-slate-500" aria-live="polite">
              {resultados ?? (
                <>
                  <Contador valor={null} estado={estadoDeConteo(null, estadoConteos)} /> resultados
                </>
              )}
            </span>
          )}
          {columnas && preferencias && estado.modo !== 'kanban' && (
            <MenuAjustes columnas={columnas} preferencias={preferencias} anchoRef={anchoRef} />
          )}
          <ConmutadorVista
            modo={estado.modo}
            onCambiar={(modo) => onEstado({ tipo: 'modo', valor: modo })}
            kanbanDisponible={kanbanDisponible}
            color={color}
          />
          {onPantallaCompleta && (
            <button
              type="button"
              aria-pressed={pantallaCompleta}
              title={pantallaCompleta ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}
              onClick={() => onPantallaCompleta(!pantallaCompleta)}
              className={BOTON}
            >
              {pantallaCompleta ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
              <span className="hidden sm:inline">{pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}</span>
              <span className="sr-only sm:hidden">{pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
