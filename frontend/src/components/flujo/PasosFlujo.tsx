'use client';

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import {
  Calculator, Check, FileText, ListChecks, PackageCheck, Plane, Receipt, ShoppingBag, ShoppingCart, Truck, Warehouse, X,
} from 'lucide-react';
import { Contador } from '@/components/ui/Contador';
import type { EstadoKpi } from '@/lib/kpis';
import { estadoDeConteo } from '@/lib/tabla';
import {
  indicePasoActual, textoAntiguedad, textoAtraso, textoDetalle, textoEstadoPaso, tituloPaso, tituloPunto,
} from '@/lib/flujo';
import type { ClaveIcono, EstadoPaso, OrientacionFlujo, PasoVista, TonoAviso, TonoPaso, VarianteFlujo } from './tipos';

/**
 * FLUJO-base punto 3 (Bloque 4, T5A; C13, RP33 y D21): la ÚNICA forma de dibujar los pasos de un flujo, en Ventas, en
 * Compras y en los documentos. Solo pinta: los pasos llegan armados (pasosConConteos, pasosConProgreso, cadenaVentas o
 * pasosDeTracking) y los textos salen de lib/flujo.js.
 *  - <nav aria-label={etiqueta}> con un <ol class="@container/flujo"> y un <li> por paso; entre pasos, una flecha (o un
 *    conector) aria-hidden, hacia abajo en vertical. La variante 'mini' es un <ol aria-label> sin <nav> (va en cada
 *    fila de una tabla: un landmark por fila sería ruido para el lector de pantalla).
 *  - Cada paso es un <Link> si trae href; un <button aria-pressed> si hay onSeleccionar y no es esEste; un <div> en los
 *    demás casos (la caja 'Estás aquí' nunca es un botón). aria-current ('page' en la franja, 'step' en la barra y en
 *    los puntos) va en el paso de indicePasoActual: el esEste o, si ninguno lo es, el 'actual'.
 *  - 'banner' (la franja): ícono, label, número con Contador (la barra gris mientras carga, '—' solo con error; RP33 y
 *    D21: estadoDeConteo de lib/tabla.js con `estadoConteos`, igual que BarraTabla), sufijo, chip rosa de atraso con
 *    borde izquierdo rose-400, detalle solo en el esEste, avisos, 'El más antiguo' solo con mostrarAntiguedad,
 *    seleccionado con ring-2 indigo-500 y esEste con 'Estás aquí'. Por debajo de @2xl (42rem) de la franja, cada caja
 *    pasa a pastilla (ícono, label y número en una línea) y la fila se desplaza por dentro (overflow-x-auto snap-x):
 *    la página nunca se desborda. `compacto`: siempre pastillas, en una sola línea. `mostrarAyuda`: la ayuda de cada
 *    paso debajo de su caja ('¿Cómo funciona?' de BannerFlujo).
 *  - 'barra' (documentos y etapas del envío): círculo de 28 px (22 px con `compacto`): hecho emerald con ✓, actual
 *    indigo con anillo, pendiente blanco con su número, cancelado rose con X y neutro gris (sin ✓ ni anillo, D36);
 *    debajo, el label (11 px, bold) y el sublabel (10 px), recortado y con title (tituloPaso). Por debajo de @md los
 *    sublabels no se ven (quedan en el title y para el lector de pantalla). Conectores flex-1 h-0.5, emerald después
 *    de un paso hecho.
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
   * esta prop: RP33) o '—' si es 'error' (D21); un número se atenúa mientras recarga.
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

/** Los círculos de la barra por estado. */
const CIRCULO: Record<EstadoPaso, string> = {
  hecho: 'border-emerald-500 bg-emerald-500 text-white',
  actual: 'border-indigo-600 bg-indigo-600 text-white ring-4 ring-indigo-100',
  pendiente: 'border-slate-300 bg-white text-slate-400',
  cancelado: 'border-rose-500 bg-rose-500 text-white',
  neutro: 'border-slate-200 bg-slate-100 text-slate-400',
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

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1';

/**
 * Las cajas de la franja. ADAPTABLE: pastilla por debajo de @2xl de la franja y caja desde @2xl. PASTILLA: siempre
 * pastilla (compacto).
 */
const CAJA_ADAPTABLE = 'relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-left whitespace-nowrap transition-colors '
  + '@2xl/flujo:w-full @2xl/flujo:min-w-[7rem] @2xl/flujo:flex-col @2xl/flujo:items-start @2xl/flujo:gap-1 '
  + '@2xl/flujo:rounded-xl @2xl/flujo:px-3 @2xl/flujo:py-2.5 @2xl/flujo:whitespace-normal';
const CAJA_PASTILLA = 'relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-left whitespace-nowrap transition-colors';

/** Lo que solo se ve en la caja (no en la pastilla). */
const SOLO_CAJA = 'hidden @2xl/flujo:block';

function ChipAvisoInterno({ texto, tono, pequeno }: { texto: string; tono: TonoAviso; pequeno?: boolean }) {
  return (
    <span className={`inline-flex max-w-full items-center rounded-full border font-semibold ${pequeno ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-[11px]'} ${TONO_AVISO[tono] ?? TONO_AVISO.gris}`}>
      {texto}
    </span>
  );
}

/**
 * Un chip de aviso (los avisos de la franja y de cada paso): ámbar, rojo o gris. Con onClick es un botón.
 */
export function ChipAviso({ texto, tono, onClick }: { texto: string; tono: TonoAviso; onClick?: () => void }) {
  if (!onClick) return <ChipAvisoInterno texto={texto} tono={tono} />;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold hover:brightness-95 ${FOCO} ${TONO_AVISO[tono] ?? TONO_AVISO.gris}`}
    >
      {texto}
    </button>
  );
}

/** Los avisos de un paso, en una línea que se parte. `display` trae el display (y sus variantes). */
function AvisosDelPaso({ avisos, pequeno, display }: { avisos: PasoVista['avisos']; pequeno?: boolean; display: string }) {
  const lista = (avisos ?? []).filter((a) => a && typeof a.texto === 'string' && a.texto);
  if (!lista.length) return null;
  return (
    <span className={`flex-wrap gap-1 ${display}`}>
      {lista.map((a, i) => <ChipAvisoInterno key={`${a.texto}-${i}`} texto={a.texto} tono={a.tono} pequeno={pequeno} />)}
    </span>
  );
}

/** La flecha entre dos cajas de la franja (línea y punta). */
function Flecha({ vertical }: { vertical: boolean }) {
  if (vertical) {
    return (
      <svg aria-hidden="true" viewBox="0 0 12 18" className="mx-auto my-0.5 h-[18px] w-3 shrink-0 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 1v15" />
        <path d="M2 12l4 4 4-4" />
      </svg>
    );
  }
  return (
    // 14 px + 1 px a cada lado: con 5 cajas de 7rem caben en ~42rem (1024 px con el menú abierto).
    <svg aria-hidden="true" viewBox="0 0 18 12" className="mx-px h-3 w-[14px] shrink-0 self-center text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6h15" />
      <path d="M12 2l4 4-4 4" />
    </svg>
  );
}

type PropsElemento = {
  paso: PasoVista;
  className: string;
  actual: 'page' | 'step' | undefined;
  onSeleccionar?: (clave: string) => void;
  title?: string;
  children: ReactNode;
};

/** El elemento de un paso: <Link> con href; <button aria-pressed> con onSeleccionar y sin esEste; si no, <div>. */
function ElementoPaso({ paso, className, actual, onSeleccionar, title, children }: PropsElemento) {
  if (paso.href) {
    return (
      <Link href={paso.href} aria-current={actual} title={title} className={`${className} cursor-pointer ${FOCO}`}>
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
        title={title}
        onClick={() => onSeleccionar(paso.clave)}
        className={`${className} cursor-pointer ${FOCO}`}
      >
        {children}
      </button>
    );
  }
  return (
    <div aria-current={actual} title={title} className={className}>
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
  const lista = `@container/flujo flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain snap-x pb-1 ${vertical ? 'flex-col' : 'items-stretch'}`;
  return (
    <nav aria-label={etiqueta} className="min-w-0">
      <ol className={lista}>
        {pasos.map((paso, i) => {
          const Icon = paso.icono ? ICONOS[paso.icono] : null;
          const atraso = textoAtraso(paso.atrasados);
          const detalle = paso.esEste ? textoDetalle(paso.detalle) : '';
          const antiguedad = mostrarAntiguedad ? textoAntiguedad(paso.masAntiguoDias) : '';
          const interactiva = Boolean(paso.href) || Boolean(onSeleccionar && !paso.esEste);
          const ayuda = mostrarAyuda && paso.ayuda ? paso.ayuda : '';
          const clases = `${compacto ? CAJA_PASTILLA : CAJA_ADAPTABLE} ${coloresCaja(paso, interactiva, Boolean(atraso), compacto)}`;
          return (
            <li
              key={`${paso.clave}-${i}`}
              // Desde @2xl las cajas se reparten el ancho (flex-1) sin bajar de su mínimo: si no caben, la fila se desplaza.
              className={`flex shrink-0 snap-start ${vertical ? 'flex-col items-stretch' : 'items-stretch'} ${!vertical && !compacto ? '@2xl/flujo:flex-1' : ''}`}
            >
              <div className={`flex min-w-0 flex-col gap-1 ${!vertical && !compacto ? '@2xl/flujo:flex-1' : ''}`}>
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
                      estado={estadoDeConteo(paso.total, estadoConteos)}
                      className={`font-black text-slate-900 ${compacto ? 'text-sm' : 'text-sm @2xl/flujo:text-xl'}`}
                    />
                    {paso.sufijo && !compacto ? <span className="hidden text-xs text-slate-500 @2xl/flujo:inline">{paso.sufijo}</span> : null}
                  </span>
                  {atraso ? (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-rose-50 px-1.5 py-px text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                      {atraso}
                    </span>
                  ) : null}
                  {detalle && !compacto ? <span className={`${SOLO_CAJA} text-[11px] text-slate-500`}>{detalle}</span> : null}
                  {!compacto ? <AvisosDelPaso avisos={paso.avisos} display="hidden @2xl/flujo:flex" /> : null}
                  {antiguedad && !compacto ? <span className={`${SOLO_CAJA} text-[11px] text-slate-500`}>{antiguedad}</span> : null}
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
              {i < ultimo ? <Flecha vertical={vertical} /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
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
  return (
    <nav aria-label={etiqueta} className="min-w-0">
      <ol className={`@container/flujo flex w-full min-w-0 ${vertical ? 'flex-col' : 'items-start'}`}>
        {pasos.map((paso, i) => {
          // Un estado que no es de EstadoPaso se pinta como pendiente (las librerías no lo dan; es por si acaso).
          const estado: EstadoPaso = CIRCULO[paso.estado] ? paso.estado : 'pendiente';
          const lector = textoEstadoPaso(estado);
          const interactiva = Boolean(paso.href) || Boolean(onSeleccionar && !paso.esEste);
          const conector = i < ultimo ? (
            <span
              aria-hidden="true"
              className={vertical
                ? `ml-[13px] my-0.5 block min-h-3 w-0.5 flex-1 rounded-full ${estado === 'hecho' ? 'bg-emerald-500' : 'bg-slate-200'}`
                : `mx-1 h-0.5 min-w-3 flex-1 rounded-full ${compacto ? 'mt-[10px]' : 'mt-[13px]'} ${estado === 'hecho' ? 'bg-emerald-500' : 'bg-slate-200'}`}
            />
          ) : null;
          return (
            <li
              key={`${paso.clave}-${i}`}
              className={vertical ? 'flex min-w-0 flex-col' : `flex min-w-0 items-start ${i < ultimo ? 'flex-1' : 'flex-none'}`}
            >
              <ElementoPaso
                paso={paso}
                actual={i === marcado ? 'step' : undefined}
                onSeleccionar={onSeleccionar}
                title={tituloPaso(paso)}
                className={`flex min-w-0 rounded-lg ${vertical ? 'items-start gap-2 text-left' : 'max-w-[9rem] flex-col items-center text-center'} ${interactiva ? 'hover:bg-slate-50' : ''} ${paso.seleccionado ? 'bg-indigo-50 ring-2 ring-indigo-500' : ''}`}
              >
                <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full border-2 font-bold ${circulo} ${CIRCULO[estado]}`}>
                  {estado === 'hecho' ? <Check size={icono} strokeWidth={3} /> : estado === 'cancelado' ? <X size={icono} strokeWidth={3} /> : i + 1}
                </span>
                <span className={`flex min-w-0 max-w-full flex-col ${vertical ? 'items-start' : 'mt-1 items-center'}`}>
                  {lector ? <span className="sr-only">{`${lector}: `}</span> : null}
                  <span className={`max-w-full truncate text-[11px] font-bold ${LABEL_BARRA[estado]}`}>{paso.label}</span>
                  {/* Por debajo de @md el sublabel y los avisos no se ven (quedan en el title), pero el lector de pantalla los lee. */}
                  {paso.sublabel ? (
                    <span className="sr-only @md/flujo:not-sr-only @md/flujo:block @md/flujo:max-w-full">
                      <span className="block max-w-full truncate text-[10px] text-slate-500">{paso.sublabel}</span>
                    </span>
                  ) : null}
                  {paso.avisos?.length ? (
                    <span className="sr-only @md/flujo:not-sr-only @md/flujo:block @md/flujo:max-w-full">
                      <AvisosDelPaso avisos={paso.avisos} pequeno display={`mt-0.5 flex ${vertical ? '' : 'justify-center'}`} />
                    </span>
                  ) : null}
                  {paso.esEste ? <span className="text-[10px] font-bold text-indigo-600">Estás aquí</span> : null}
                </span>
              </ElementoPaso>
              {conector}
            </li>
          );
        })}
      </ol>
    </nav>
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
            {i < n - 1 ? <span aria-hidden="true" className={`block h-0.5 w-2 shrink-0 ${estado === 'hecho' ? 'bg-emerald-500' : 'bg-slate-200'}`} /> : null}
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
