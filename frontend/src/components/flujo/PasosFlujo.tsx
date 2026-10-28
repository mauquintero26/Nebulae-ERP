'use client';

import Link from 'next/link';
import type { ComponentType, FocusEvent, ReactNode } from 'react';
import {
  Calculator, Check, FileText, ListChecks, PackageCheck, Plane, Receipt, ShoppingBag, ShoppingCart, Truck, Warehouse, X,
} from 'lucide-react';
import { Contador } from '@/components/ui/Contador';
import type { EstadoKpi } from '@/lib/kpis';
import {
  avisosVisibles, chipAtraso, conectorHecho, estadoNumeroFranja, hayEnlaces, indicePasoActual, textoAntiguedad,
  textoDetalle, textoEstadoPaso, tituloPaso, tituloPunto,
} from '@/lib/flujo';
import type { ClaveIcono, EstadoPaso, OrientacionFlujo, PasoVista, TonoAviso, TonoPaso, VarianteFlujo } from './tipos';

/**
 * FLUJO-base punto 3 (Bloque 4, T5A y r1; C13, RP33 y D21): la ÚNICA forma de dibujar los pasos de un flujo, en Ventas,
 * en Compras y en los documentos. Solo pinta: los pasos llegan armados (pasosConConteos, pasosConProgreso, cadenaVentas
 * o pasosDeTracking) y los textos y los estados salen de lib/flujo.js.
 *  - La lista es un <ol class="@container/flujo"> con un <li> por paso; entre pasos, una flecha (o un conector)
 *    aria-hidden, hacia abajo en vertical. r1 (M9): va dentro de un <nav aria-label={etiqueta}> solo si algún paso es un
 *    enlace (hayEnlaces); si no, es un <ol aria-label={etiqueta}> (los pasos propios de un documento o una franja de
 *    filtros no son un landmark de navegación). La variante 'mini' es siempre un <ol aria-label> (va en cada fila).
 *  - r1 (M6): el contenedor lleva w-full, así que PasosFlujo NECESITA UN PADRE CON ANCHO DEFINIDO (un bloque, una
 *    columna de grilla 1fr o un hijo flex-1 min-w-0). En una fila flex sin ancho (justify-between con un título, una
 *    columna auto de grilla), el container-type de la lista hace que mida 0.
 *  - Cada paso es un <Link> si trae href; un <button aria-pressed> si hay onSeleccionar y no es esEste; un <div> en los
 *    demás casos (la caja 'Estás aquí' nunca es un botón). aria-current ('page' en la franja, 'step' en la barra y en
 *    los puntos) va en el paso de indicePasoActual: el esEste o, si ninguno lo es, el 'actual'. r1 (C1, M10): el foco
 *    es un outline índigo-700 con separación de 2 px, distinto del anillo de la selección y visible en forced-colors;
 *    las listas tienen relleno para que ni el anillo ni el outline se recorten. r1 (M11): al recibir el foco, el paso
 *    se desplaza para verse entero (scrollIntoView).
 *  - 'banner' (la franja): ícono, label, número con Contador (estadoNumeroFranja: la barra gris mientras carga y «—» con
 *    error aunque quede un número; RP33, D21 y el ruling de r1), sufijo, chip rosa de atraso con borde izquierdo
 *    rose-400 (sin chip con error; en la pastilla, corto: «3»), detalle solo en el esEste, avisos (cada chip en una
 *    línea, recortado y con su title), 'El más antiguo' solo con mostrarAntiguedad, seleccionado con ring-2 indigo-500
 *    y esEste con 'Estás aquí'. Desde @2xl (42rem) de la franja las cajas se reparten el ancho y se estiran al alto de
 *    la fila (r1, C3), con la flecha centrada entre ellas; por debajo, cada caja pasa a pastilla (ícono, label y número
 *    en una línea) y la fila se desplaza por dentro (overflow-x-auto; snap-x solo con puntero táctil: con teclado el
 *    snap devolvía la pastilla enfocada a medias, M11): la página nunca se desborda. `compacto`:
 *    siempre pastillas, en una sola línea. `mostrarAyuda`: la ayuda de cada paso debajo de su caja.
 *  - 'barra' (documentos y etapas del envío): círculo de 28 px (22 px con `compacto`): hecho emerald con ✓, actual
 *    indigo con anillo, pendiente blanco con su número, cancelado rose con X y neutro gris (sin ✓ ni anillo, D36);
 *    debajo, el label (11 px, bold) y el sublabel (10 px). r1 (C2): sin tope fijo; los pasos se reparten el ancho por su
 *    contenido y el sublabel se recorta solo cuando de verdad no cabe. Por debajo de @md los sublabels no se ven
 *    (quedan en el title del label y para el lector de pantalla), salvo en compacto (r1, M7: es solo el número). r1
 *    (M9): el title va en el label (tituloPaso) y en el sublabel recortado, no en el paso: no repite su nombre
 *    accesible. Conectores flex-1 h-0.5, emerald solo de un paso hecho a uno hecho o actual (conectorHecho, r1 M3).
 *  - 'mini' (celdas de tabla): puntos de 10 px y conectores de 8 px, con su title ('Etapa 2 de 4: Aduana, en curso',
 *    tituloPunto). No son interactivos.
 * Clases de Tailwind literales (TONO_PASO y compañía), sin variantes de modo oscuro (la app es siempre clara, H1).
 */

export type PropsPasosFlujo = {
  pasos: ReadonlyArray<PasoVista>;
  /** Por defecto 'barra'. */
  variante?: VarianteFlujo;
  /** Por defecto 'horizontal'. */
  orientacion?: OrientacionFlujo;
  /** El aria-label de la lista de pasos. */
  etiqueta: string;
  /** El clic en una caja sin href (y que no es esEste): la pantalla pone o quita ese filtro (alternarSeleccion). */
  onSeleccionar?: (clave: string) => void;
  /** 'banner': pastillas en una sola línea. 'barra': círculos de 22 px (el panel rápido). */
  compacto?: boolean;
  /** 'banner': 'El más antiguo: N días' (flujo_contenido_caja = total y atrasados: por defecto no). */
  mostrarAntiguedad?: boolean;
  /** 'banner': la ayuda de cada paso debajo de su caja ('¿Cómo funciona?'). */
  mostrarAyuda?: boolean;
  /**
   * 'banner': el estado de los números (C13). Un total null pinta la barra gris de Contador ('cargando', también sin
   * esta prop: RP33); con 'error', «—» en todas las cajas aunque haya número (ruling de r1); un número se atenúa
   * mientras recarga.
   */
  estadoConteos?: EstadoKpi;
};

type Icono = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

/** ClaveIcono → lucide-react (los 10 íconos del diseño; lucide-react 1.31 los exporta todos). */
const ICONOS: Record<ClaveIcono, Icono> = {
  solicitud: FileText,
  cotizacion: Calculator,
  pedido: ShoppingBag,
  entrega: Truck,
  factura: Receipt,
  lista: ListChecks,
  compra: ShoppingCart,
  transito: Plane,
  recepcion: PackageCheck,
  recibido: Warehouse,
};

/** El fondo y el color del ícono de cada tono (literales, para que Tailwind los encuentre). */
const TONO_PASO: Record<TonoPaso, string> = {
  indigo: 'bg-indigo-50 text-indigo-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  teal: 'bg-teal-50 text-teal-600',
  purple: 'bg-purple-50 text-purple-600',
};
const TONO_SIN_COLOR = 'bg-slate-100 text-slate-500';

/** Los chips de aviso: ámbar, rojo y gris (el texto neutro de RP28, en slate; D36). */
const TONO_AVISO: Record<TonoAviso, string> = {
  ambar: 'border-amber-200 bg-amber-50 text-amber-800',
  rojo: 'border-rose-200 bg-rose-50 text-rose-700',
  gris: 'border-slate-200 bg-slate-100 text-slate-600',
};

/** r1 (C3): un chip de aviso nunca se parte: va en una línea, recortado, con el texto completo en su title. */
const CHIP = 'inline-block min-w-0 max-w-full truncate whitespace-nowrap rounded-full border align-middle font-semibold';

/** Los círculos de la barra por estado (r1, M8: el número del pendiente en slate-500 y el del neutro, sobre slate-100, en slate-600). */
const CIRCULO: Record<EstadoPaso, string> = {
  hecho: 'border-emerald-500 bg-emerald-500 text-white',
  actual: 'border-indigo-600 bg-indigo-600 text-white ring-4 ring-indigo-100',
  pendiente: 'border-slate-300 bg-white text-slate-500',
  cancelado: 'border-rose-500 bg-rose-500 text-white',
  neutro: 'border-slate-200 bg-slate-100 text-slate-600',
};

/** El color del label de la barra por estado. */
const LABEL_BARRA: Record<EstadoPaso, string> = {
  hecho: 'text-slate-800',
  actual: 'text-indigo-700',
  pendiente: 'text-slate-500',
  cancelado: 'text-rose-700',
  neutro: 'text-slate-500',
};

/** Los puntos de la variante mini por estado. */
const PUNTO: Record<EstadoPaso, string> = {
  hecho: 'bg-emerald-500',
  actual: 'bg-indigo-600 ring-2 ring-indigo-200',
  pendiente: 'border border-slate-300 bg-white',
  cancelado: 'bg-rose-500',
  neutro: 'bg-slate-200',
};

/** r1 (C1, M10): el foco es un outline (no un box-shadow): se distingue del anillo de la selección y no lo borra forced-colors. */
const FOCO = 'outline-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';

/**
 * Las cajas de la franja. ADAPTABLE: pastilla por debajo de @2xl de la franja y caja desde @2xl (r1, C3: flex-1, del alto
 * de su columna). PASTILLA: siempre pastilla (compacto).
 */
const CAJA_ADAPTABLE = 'relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-left whitespace-nowrap transition-colors '
  + '@2xl/flujo:w-full @2xl/flujo:flex-1 @2xl/flujo:min-w-[7rem] @2xl/flujo:flex-col @2xl/flujo:items-start @2xl/flujo:gap-1 '
  + '@2xl/flujo:rounded-xl @2xl/flujo:px-3 @2xl/flujo:py-2.5 @2xl/flujo:whitespace-normal';
const CAJA_PASTILLA = 'relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-left whitespace-nowrap transition-colors';

/** Lo que solo se ve en la caja (no en la pastilla). */
const SOLO_CAJA = 'hidden @2xl/flujo:block';

/**
 * r1 (M11): un paso que recibe el foco se desplaza para verse entero (la fila de pastillas se desplaza por dentro).
 * r2 (M7): solo si el foco viene del teclado (:focus-visible). Con un clic o un toque, Chrome enfoca en el pointerdown:
 * desplazar ahí corría la pastilla bajo el puntero y el clic se perdía.
 */
const alEnfocar = (e: FocusEvent<HTMLElement>) => {
  const el = e.currentTarget;
  if (el.matches(':focus-visible')) el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
};

function ChipAvisoInterno({ texto, tono, pequeno }: { texto: string; tono: TonoAviso; pequeno?: boolean }) {
  return (
    <span title={texto} className={`${CHIP} ${pequeno ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-[11px]'} ${TONO_AVISO[tono] ?? TONO_AVISO.gris}`}>
      {texto}
    </span>
  );
}

/**
 * Un chip de aviso (los avisos de la franja y de cada paso): ámbar, rojo o gris, en una línea y con su title. Con
 * onClick es un botón.
 */
export function ChipAviso({ texto, tono, onClick }: { texto: string; tono: TonoAviso; onClick?: () => void }) {
  if (!onClick) return <ChipAvisoInterno texto={texto} tono={tono} />;
  return (
    <button
      type="button"
      onClick={onClick}
      title={texto}
      className={`${CHIP} px-2 py-0.5 text-[11px] hover:brightness-95 ${FOCO} ${TONO_AVISO[tono] ?? TONO_AVISO.gris}`}
    >
      {texto}
    </button>
  );
}

/**
 * Los avisos de un paso (avisosVisibles: con estadoConteos 'error' ninguno, r2 M1): cada chip en una línea, dentro del
 * ancho de su caja. `clases` trae el display (y sus variantes) y el ancho: en la caja de la franja, `w-0 min-w-full`
 * (r2: los chips no aportan al ancho intrínseco de la caja, así el truncate recorta y las 5 cajas caben).
 */
function AvisosDelPaso({ avisos, pequeno, estadoConteos, clases }: {
  avisos: PasoVista['avisos'];
  pequeno?: boolean;
  estadoConteos?: EstadoKpi;
  clases: string;
}) {
  const lista = avisosVisibles(avisos, { estadoConteos });
  if (!lista.length) return null;
  return (
    <span className={`flex-wrap gap-1 ${clases}`}>
      {lista.map((a, i) => <ChipAvisoInterno key={`${a.texto}-${i}`} texto={a.texto} tono={a.tono} pequeno={pequeno} />)}
    </span>
  );
}

/**
 * La línea del sublabel de la barra: el número (u otro texto), que se recorta si no cabe, y la palabra de una caja
 * caída (etiquetaEstado, la cadena compacta; r2 M5) en su propio span, sin truncate.
 */
function LineaSublabel({ paso, vertical }: { paso: PasoVista; vertical: boolean }) {
  return (
    <span className={`flex min-w-0 max-w-full items-baseline gap-1 text-[10px] text-slate-500 ${vertical ? '' : 'justify-center'}`}>
      {paso.sublabel ? <span title={paso.sublabel} className="min-w-0 truncate">{paso.sublabel}</span> : null}
      {paso.etiquetaEstado ? (
        <span className="shrink-0 whitespace-nowrap font-semibold text-rose-700">
          {paso.sublabel ? <span aria-hidden="true" className="mr-1 font-normal text-slate-400">·</span> : null}
          {paso.etiquetaEstado}
        </span>
      ) : null}
    </span>
  );
}

/** La flecha entre dos cajas de la franja (línea y punta). */
function Flecha({ vertical, compacto }: { vertical: boolean; compacto: boolean }) {
  if (vertical) {
    return (
      <svg aria-hidden="true" viewBox="0 0 12 18" className="mx-auto my-0.5 h-[18px] w-3 shrink-0 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 1v15" />
        <path d="M2 12l4 4 4-4" />
      </svg>
    );
  }
  // 14 px + 1 px a cada lado: con 5 cajas de 7rem caben en ~42rem (1024 px con el menú abierto). En la pastilla va a la
  // altura de su centro (la ayuda puede alargar el li); desde @2xl, centrada en la caja, que ocupa todo el alto (C3).
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 12"
      className={`mx-px h-3 w-[14px] shrink-0 text-slate-300 ${compacto ? 'self-start mt-[9px]' : 'self-start mt-[9px] @2xl/flujo:mt-0 @2xl/flujo:self-center'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 6h15" />
      <path d="M12 2l4 4-4 4" />
    </svg>
  );
}

/** La lista de pasos: dentro de un <nav> si hay enlaces; si no, un <ol aria-label> (r1, M9). Siempre con w-full (M6). */
function Lista({ conNav, etiqueta, clases, children }: { conNav: boolean; etiqueta: string; clases: string; children: ReactNode }) {
  if (conNav) {
    return (
      <nav aria-label={etiqueta} className="w-full min-w-0">
        <ol className={clases}>{children}</ol>
      </nav>
    );
  }
  return (
    <div className="w-full min-w-0">
      <ol aria-label={etiqueta} className={clases}>{children}</ol>
    </div>
  );
}

type PropsElemento = {
  paso: PasoVista;
  className: string;
  actual: 'page' | 'step' | undefined;
  onSeleccionar?: (clave: string) => void;
  children: ReactNode;
};

/** El elemento de un paso: <Link> con href; <button aria-pressed> con onSeleccionar y sin esEste; si no, <div>. */
function ElementoPaso({ paso, className, actual, onSeleccionar, children }: PropsElemento) {
  if (paso.href) {
    return (
      <Link href={paso.href} aria-current={actual} onFocus={alEnfocar} className={`${className} cursor-pointer ${FOCO}`}>
        {children}
      </Link>
    );
  }
  if (onSeleccionar && !paso.esEste) {
    return (
      <button
        type="button"
        aria-pressed={Boolean(paso.seleccionado)}
        aria-current={actual}
        onFocus={alEnfocar}
        onClick={() => onSeleccionar(paso.clave)}
        className={`${className} cursor-pointer ${FOCO}`}
      >
        {children}
      </button>
    );
  }
  return (
    <div aria-current={actual} className={className}>
      {children}
    </div>
  );
}

/** El color de una caja de la franja: seleccionado, esEste o normal (y el borde rosa si va con atraso). */
function coloresCaja(paso: PasoVista, interactiva: boolean, conAtraso: boolean, compacto: boolean): string {
  const base = paso.seleccionado
    ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-500'
    : paso.esEste
      ? 'border-indigo-300 bg-indigo-50/60'
      : `border-slate-200 bg-white ${interactiva ? 'hover:border-slate-300 hover:bg-slate-50' : ''}`;
  const atraso = conAtraso && !compacto ? '@2xl/flujo:border-l-4 @2xl/flujo:border-l-rose-400' : '';
  return `${base} ${atraso}`;
}

function PasosBanner({
  pasos, vertical, etiqueta, onSeleccionar, compacto, mostrarAntiguedad, mostrarAyuda, estadoConteos,
}: Required<Pick<PropsPasosFlujo, 'pasos' | 'etiqueta'>> & {
  vertical: boolean;
  onSeleccionar?: (clave: string) => void;
  compacto: boolean;
  mostrarAntiguedad: boolean;
  mostrarAyuda: boolean;
  estadoConteos?: EstadoKpi;
}) {
  const marcado = indicePasoActual(pasos);
  const ultimo = pasos.length - 1;
  const horizontalAdaptable = !vertical && !compacto;
  // r1 (C1): p-1 para que el anillo de la selección y el outline del foco no se recorten (la lista recorta por su
  // overflow-x-auto), compensado con -mx-1 para que las cajas queden alineadas con la fila de arriba.
  const lista = `@container/flujo -mx-1 flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain pointer-coarse:snap-x scroll-px-1 p-1 ${vertical ? 'flex-col' : 'items-stretch'}`;
  return (
    <Lista conNav={hayEnlaces(pasos)} etiqueta={etiqueta} clases={lista}>
      {pasos.map((paso, i) => {
        const Icon = paso.icono ? ICONOS[paso.icono] : null;
        const chip = chipAtraso(paso.atrasados, { estadoConteos });
        const detalle = paso.esEste ? textoDetalle(paso.detalle) : '';
        const antiguedad = mostrarAntiguedad ? textoAntiguedad(paso.masAntiguoDias) : '';
        const interactiva = Boolean(paso.href) || Boolean(onSeleccionar && !paso.esEste);
        const ayuda = mostrarAyuda && paso.ayuda ? paso.ayuda : '';
        const clases = `${compacto ? CAJA_PASTILLA : CAJA_ADAPTABLE} ${coloresCaja(paso, interactiva, Boolean(chip), compacto)}`;
        return (
          <li
            key={`${paso.clave}-${i}`}
            // Desde @2xl las cajas se reparten el ancho (flex-1) sin bajar de su mínimo: si no caben, la fila se desplaza.
            className={`flex shrink-0 snap-start ${vertical ? 'flex-col items-stretch' : 'items-stretch'} ${horizontalAdaptable ? '@2xl/flujo:flex-1' : ''}`}
          >
            <div className={`flex min-w-0 flex-col gap-1 ${horizontalAdaptable ? '@2xl/flujo:flex-1' : ''}`}>
              <ElementoPaso
                paso={paso}
                className={clases}
                actual={i === marcado ? 'page' : undefined}
                onSeleccionar={onSeleccionar}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span aria-hidden="true" className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${(paso.tono && TONO_PASO[paso.tono]) || TONO_SIN_COLOR}`}>
                    {Icon ? <Icon size={13} /> : null}
                  </span>
                  <span className={`truncate text-xs font-bold text-slate-700 ${compacto ? '' : '@2xl/flujo:whitespace-normal'}`}>{paso.label}</span>
                </span>
                <span className="flex flex-wrap items-baseline gap-x-1">
                  <Contador
                    valor={paso.total}
                    estado={estadoNumeroFranja(paso.total, estadoConteos)}
                    className={`font-black text-slate-900 ${compacto ? 'text-sm' : 'text-sm @2xl/flujo:text-xl'}`}
                  />
                  {paso.sufijo && !compacto ? <span className="hidden text-xs text-slate-600 @2xl/flujo:inline">{paso.sufijo}</span> : null}
                </span>
                {chip ? (
                  <span title={chip.largo} className="inline-flex shrink-0 items-center rounded-full bg-rose-50 px-1.5 py-px text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                    {compacto ? (
                      <>
                        <span aria-hidden="true">{chip.corto}</span>
                        <span className="sr-only">{chip.largo}</span>
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true" className="@2xl/flujo:hidden">{chip.corto}</span>
                        <span className="sr-only @2xl/flujo:not-sr-only">{chip.largo}</span>
                      </>
                    )}
                  </span>
                ) : null}
                {detalle && !compacto ? <span className={`${SOLO_CAJA} text-[11px] text-slate-600`}>{detalle}</span> : null}
                {!compacto ? <AvisosDelPaso avisos={paso.avisos} estadoConteos={estadoConteos} clases="hidden w-0 min-w-full @2xl/flujo:flex" /> : null}
                {antiguedad && !compacto ? <span className={`${SOLO_CAJA} text-[11px] text-slate-600`}>{antiguedad}</span> : null}
                {paso.esEste ? (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-indigo-600 px-1.5 py-px text-[10px] font-bold text-white">
                    Estás aquí
                  </span>
                ) : null}
              </ElementoPaso>
              {ayuda ? (
                <p className={`text-[11px] leading-snug text-slate-500 ${vertical ? '' : 'w-48 whitespace-normal @2xl/flujo:w-auto'}`}>{ayuda}</p>
              ) : null}
            </div>
            {i < ultimo ? <Flecha vertical={vertical} compacto={compacto} /> : null}
          </li>
        );
      })}
    </Lista>
  );
}

function PasosBarra({
  pasos, vertical, etiqueta, onSeleccionar, compacto,
}: Required<Pick<PropsPasosFlujo, 'pasos' | 'etiqueta'>> & {
  vertical: boolean;
  onSeleccionar?: (clave: string) => void;
  compacto: boolean;
}) {
  const marcado = indicePasoActual(pasos);
  const ultimo = pasos.length - 1;
  const circulo = compacto ? 'h-[22px] w-[22px] text-[10px]' : 'h-7 w-7 text-xs';
  const icono = compacto ? 11 : 14;
  // r1 (C1): p-1 para que el outline del foco no quede fuera de la lista.
  const clases = `@container/flujo flex w-full min-w-0 p-1 ${vertical ? 'flex-col' : 'items-start'}`;
  return (
    <Lista conNav={hayEnlaces(pasos)} etiqueta={etiqueta} clases={clases}>
      {pasos.map((paso, i) => {
        // Un estado que no es de EstadoPaso se pinta como pendiente (las librerías no lo dan; es por si acaso).
        const estado: EstadoPaso = CIRCULO[paso.estado] ? paso.estado : 'pendiente';
        const lector = textoEstadoPaso(estado);
        const interactiva = Boolean(paso.href) || Boolean(onSeleccionar && !paso.esEste);
        const conector = i < ultimo ? (
          <span
            aria-hidden="true"
            className={vertical
              ? `ml-[13px] my-0.5 block min-h-3 w-0.5 flex-1 rounded-full ${conectorHecho(pasos, i) ? 'bg-emerald-500' : 'bg-slate-200'}`
              : `mx-1 h-0.5 min-w-3 flex-1 rounded-full ${compacto ? 'mt-[10px]' : 'mt-[13px]'} ${conectorHecho(pasos, i) ? 'bg-emerald-500' : 'bg-slate-200'}`}
          />
        ) : null;
        return (
          <li
            key={`${paso.clave}-${i}`}
            // r1 (C2): cada paso parte de su contenido (flex-auto) y el último también puede achicarse (flex-initial).
            className={vertical ? 'flex min-w-0 flex-col' : `flex min-w-0 items-start ${i < ultimo ? 'flex-auto' : 'flex-initial'}`}
          >
            <ElementoPaso
              paso={paso}
              actual={i === marcado ? 'step' : undefined}
              onSeleccionar={onSeleccionar}
              className={`flex min-w-0 rounded-lg ${vertical ? 'items-start gap-2 text-left' : 'flex-col items-center text-center'} ${interactiva ? 'hover:bg-slate-50' : ''} ${paso.seleccionado ? 'bg-indigo-50 ring-2 ring-indigo-500' : ''}`}
            >
              <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full border-2 font-bold ${circulo} ${CIRCULO[estado]}`}>
                {estado === 'hecho' ? <Check size={icono} strokeWidth={3} /> : estado === 'cancelado' ? <X size={icono} strokeWidth={3} /> : i + 1}
              </span>
              <span className={`flex min-w-0 max-w-full flex-col ${vertical ? 'items-start' : 'mt-1 items-center'}`}>
                {lector ? <span className="sr-only">{`${lector}: `}</span> : null}
                <span title={tituloPaso(paso)} className={`max-w-full truncate text-[11px] font-bold ${LABEL_BARRA[estado]}`}>{paso.label}</span>
                {/* Por debajo de @md el sublabel y los avisos no se ven (quedan en el title del label), pero el lector de
                    pantalla los lee. En compacto el sublabel (solo el número) siempre se ve (r1, M7), y la palabra de la
                    caja caída va aparte, sin recortarse (r2, M5). */}
                {paso.sublabel || paso.etiquetaEstado ? (compacto ? (
                  <LineaSublabel paso={paso} vertical={vertical} />
                ) : (
                  <span className="sr-only @md/flujo:not-sr-only @md/flujo:block @md/flujo:max-w-full">
                    <LineaSublabel paso={paso} vertical={vertical} />
                  </span>
                )) : null}
                {paso.avisos?.length ? (
                  <span className="sr-only @md/flujo:not-sr-only @md/flujo:block @md/flujo:max-w-full">
                    <AvisosDelPaso avisos={paso.avisos} pequeno clases={`mt-0.5 flex w-full min-w-0 ${vertical ? '' : 'justify-center'}`} />
                  </span>
                ) : null}
                {paso.esEste ? <span className="text-[10px] font-bold text-indigo-600">Estás aquí</span> : null}
              </span>
            </ElementoPaso>
            {conector}
          </li>
        );
      })}
    </Lista>
  );
}

function PasosMini({ pasos, etiqueta }: { pasos: ReadonlyArray<PasoVista>; etiqueta: string }) {
  const marcado = indicePasoActual(pasos);
  const n = pasos.length;
  return (
    <ol aria-label={etiqueta} className="inline-flex items-center">
      {pasos.map((paso, i) => {
        const estado: EstadoPaso = PUNTO[paso.estado] ? paso.estado : 'pendiente';
        const titulo = tituloPunto(paso, i, n);
        return (
          <li key={`${paso.clave}-${i}`} className="flex items-center">
            <span title={titulo} aria-current={i === marcado ? 'step' : undefined} className={`relative block h-2.5 w-2.5 shrink-0 rounded-full ${PUNTO[estado]}`}>
              <span className="sr-only">{titulo}</span>
            </span>
            {i < n - 1 ? <span aria-hidden="true" className={`block h-0.5 w-2 shrink-0 ${conectorHecho(pasos, i) ? 'bg-emerald-500' : 'bg-slate-200'}`} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Los pasos de un flujo. Ver arriba. */
export function PasosFlujo({
  pasos, variante = 'barra', orientacion = 'horizontal', etiqueta, onSeleccionar, compacto = false,
  mostrarAntiguedad = false, mostrarAyuda = false, estadoConteos,
}: PropsPasosFlujo) {
  if (!Array.isArray(pasos) || pasos.length === 0) return null;
  const vertical = orientacion === 'vertical';
  if (variante === 'mini') return <PasosMini pasos={pasos} etiqueta={etiqueta} />;
  if (variante === 'banner') {
    return (
      <PasosBanner
        pasos={pasos}
        vertical={vertical}
        etiqueta={etiqueta}
        onSeleccionar={onSeleccionar}
        compacto={compacto}
        mostrarAntiguedad={mostrarAntiguedad}
        mostrarAyuda={mostrarAyuda}
        estadoConteos={estadoConteos}
      />
    );
  }
  return <PasosBarra pasos={pasos} vertical={vertical} etiqueta={etiqueta} onSeleccionar={onSeleccionar} compacto={compacto} />;
}
