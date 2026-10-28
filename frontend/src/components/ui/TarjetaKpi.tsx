'use client';

import { Children, createContext, useContext, useState } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, ArrowDownRight, ArrowLeftRight, ArrowUpRight, BarChart3, Box, CheckCircle2,
  Circle, Clock, Coins, CreditCard, DollarSign, FileText, Info, Minus, Package, PieChart, Receipt, ShoppingBag,
  ShoppingCart, SlidersHorizontal, Sparkles, Target, TrendingDown, TrendingUp, Truck, Users, Wallet, Warehouse, XCircle,
} from 'lucide-react';
import { ACCENTS, type AccentColor } from './colors';
import {
  CARGA_INICIAL, CATALOGO_KPI, PERIODO_KPI, TEXTO_PERIODO, avanzarCarga, clasesFranja, estadoKpi, etiquetaKpi,
  frenteDeComparado, mejorComoTexto, tamanoValor, textoValorTarjeta,
} from '@/lib/kpis';
import type { EstadoKpi, IdKpi, MarcaCarga } from '@/lib/kpis';
import { infoVariacion } from '@/lib/analisis';

/**
 * KPI-base (Bloque 4, T4A; R12, C13, RP27 y RP82): la ÚNICA tarjeta de indicadores de la app, su franja y el estado de
 * carga. Los textos, formatos, variaciones y tonos salen de lib/kpis.js (con infoVariacion de lib/analisis.js, la
 * regla única de la variación); aquí solo se pintan.
 *  - TarjetaKpi: ícono a la izquierda, el nombre arriba, el valor (completo: la letra se achica con tamanoValor y, si
 *    aun así no cabe, pasa a otra línea; nunca se corta, r1) y UNA línea debajo (el nombre y la ayuda, en dos líneas
 *    como mucho y con su title): la variación contra el período anterior (flecha verde, roja o gris + '+12,5 %' + 'vs 30 días antes',
 *    y para lectores de pantalla 'Sube 12,5 % frente a los 30 días anteriores') o, sin variación, la ayuda.
 *  - Estados (C13): 'cargando' pinta barras grises en lugar del valor y de la ayuda (nunca 0 ni 'Todas al día');
 *    'actualizando' atenúa lo que ya se veía; 'error' sin valor muestra '—' y 'No se pudo cargar'.
 *  - Con onClick es un botón (aria-pressed = activo, con el anillo del color); sin onClick, un div. Solo es botón si
 *    equivale a una vista existente de la pantalla.
 *  - FranjaKpis decide las columnas por el ancho de SU contenedor (container queries de Tailwind v4, clasesFranja) y
 *    pasa su estado a las tarjetas. Sin la prop ejemplo ni la pastilla «Datos de ejemplo» (RP82).
 *  - useEstadoKpi(loading, error) da el estado con avanzarCarga: la primera carga es 'cargando' y las siguientes
 *    'actualizando'.
 * Clases de Tailwind literales y sin variantes de modo oscuro (la app es siempre clara, H1).
 */

export type ColorKpi = AccentColor | 'slate';
export type { EstadoKpi, IdKpi } from '@/lib/kpis';
/** 'entero' es sinónimo de 'numero' (RP27): el formato del contrato de Análisis. */
export type FormatoTarjeta = 'numero' | 'entero' | 'pesos' | 'porcentaje' | 'texto';
export type TonoTarjeta = 'normal' | 'alerta' | 'bien';
export type IconoKpi = React.ComponentType<{ size?: number; className?: string }>;
/** La cifra de un período contra la del período anterior. Sin mejorSiSube, el del catálogo (o subir es mejor). */
export type VariacionTarjeta = { actual: number | null; anterior: number | null; mejorSiSube?: boolean | null };

export type PropsTarjetaKpi = {
  /** Id de CATALOGO_KPI: trae la etiqueta, el ícono, el color, el formato y si subir es mejor. */
  kpi?: IdKpi;
  /** Sobrescriben lo del catálogo. */
  etiqueta?: string;
  /** Un componente de lucide-react o el nombre de uno de ICONOS_KPI (RP82). */
  icono?: IconoKpi | string;
  color?: ColorKpi;
  formato?: FormatoTarjeta;
  valor: React.ReactNode;
  ayuda?: React.ReactNode;
  variacion?: VariacionTarjeta | null;
  /** Por defecto, TEXTO_PERIODO[PERIODO_KPI].comparado ('vs 30 días antes'). */
  textoPeriodo?: string;
  tono?: TonoTarjeta;
  /** Por defecto, el de la franja (o 'listo'). */
  estado?: EstadoKpi;
  activo?: boolean;
  onClick?: () => void;
  titulo?: string;
};

// Los nombres de ICONOS_KPI (lib/kpis.js) y su componente. test_kpis.mjs exige que este mapa tenga exactamente esos.
const ICONOS: Record<string, IconoKpi> = {
  Activity, AlertCircle, AlertTriangle, ArrowLeftRight, BarChart3, Box, CheckCircle2, Circle, Clock, Coins, CreditCard,
  DollarSign, FileText, Package, PieChart, Receipt, ShoppingBag, ShoppingCart, SlidersHorizontal, Sparkles, Target,
  TrendingDown, TrendingUp, Truck, Users, Wallet, Warehouse, XCircle,
};

// Clases literales por color (Tailwind solo ve cadenas completas).
const ANILLO: Record<ColorKpi, string> = {
  amber: 'ring-2 ring-amber-300 border-amber-300',
  rose: 'ring-2 ring-rose-300 border-rose-300',
  orange: 'ring-2 ring-orange-300 border-orange-300',
  indigo: 'ring-2 ring-indigo-300 border-indigo-300',
  purple: 'ring-2 ring-purple-300 border-purple-300',
  emerald: 'ring-2 ring-emerald-300 border-emerald-300',
  blue: 'ring-2 ring-blue-300 border-blue-300',
  teal: 'ring-2 ring-teal-300 border-teal-300',
  red: 'ring-2 ring-red-300 border-red-300',
  slate: 'ring-2 ring-slate-300 border-slate-300',
};
const FOCO: Record<ColorKpi, string> = {
  amber: 'focus-visible:ring-amber-300',
  rose: 'focus-visible:ring-rose-300',
  orange: 'focus-visible:ring-orange-300',
  indigo: 'focus-visible:ring-indigo-300',
  purple: 'focus-visible:ring-purple-300',
  emerald: 'focus-visible:ring-emerald-300',
  blue: 'focus-visible:ring-blue-300',
  teal: 'focus-visible:ring-teal-300',
  red: 'focus-visible:ring-red-300',
  slate: 'focus-visible:ring-slate-300',
};
const TONO_CHIP = { bien: 'text-emerald-600', mal: 'text-rose-600', neutro: 'text-slate-500' } as const;
const TONO_AYUDA: Record<TonoTarjeta, string> = {
  normal: 'text-slate-500',
  alerta: 'text-rose-600',
  bien: 'text-emerald-600',
};

const EstadoFranja = createContext<EstadoKpi | null>(null);

function fondoIcono(color: ColorKpi): string {
  return color === 'slate' ? 'bg-slate-100 text-slate-600' : ACCENTS[color].statIconBg;
}

export function TarjetaKpi({
  kpi, etiqueta, icono, color, formato, valor, ayuda, variacion, textoPeriodo, tono = 'normal', estado, activo,
  onClick, titulo,
}: PropsTarjetaKpi) {
  const estadoFranja = useContext(EstadoFranja);
  const actual: EstadoKpi = estado ?? estadoFranja ?? 'listo';
  const definicion = kpi ? CATALOGO_KPI[kpi] : null;
  const nombre = etiqueta ?? (kpi ? etiquetaKpi(kpi) : '');
  const colorFinal: ColorKpi = color ?? definicion?.color ?? 'indigo';
  const nombreIcono = icono ?? definicion?.icono;
  const Icono: IconoKpi | null = typeof nombreIcono === 'string' ? (ICONOS[nombreIcono] ?? Circle) : (nombreIcono ?? null);

  const cargando = actual === 'cargando';
  const sinValor = valor === null || valor === undefined;
  const conError = actual === 'error' && sinValor;
  const atenuado = actual === 'actualizando' ? 'opacity-60' : '';
  const texto = conError ? '—' : textoValorTarjeta(valor, formato ?? definicion?.formato);

  const comparado = textoPeriodo ?? TEXTO_PERIODO[PERIODO_KPI].comparado;
  const mejorSiSube = variacion && variacion.mejorSiSube !== undefined ? variacion.mejorSiSube : (definicion?.mejorSiSube ?? true);
  const info = variacion && !conError
    ? infoVariacion(
      { valor: variacion.actual, anterior: variacion.anterior, mejor: mejorComoTexto(mejorSiSube) },
      { frente: frenteDeComparado(comparado) },
    )
    : null;
  // Con variación, la ayuda pasa al title de la tarjeta.
  const tituloFinal = titulo ?? (info && typeof ayuda === 'string' && ayuda ? ayuda : undefined);

  let cuerpoValor: React.ReactNode;
  if (cargando) {
    cuerpoValor = <span aria-hidden="true" className="block h-7 w-24 rounded-md bg-slate-200 animate-pulse mt-1" />;
  } else if (texto !== null) {
    cuerpoValor = (
      <span title={texto} className={`block ${tamanoValor(texto)} font-black text-slate-900 leading-tight tabular-nums break-words mt-0.5 ${atenuado}`}>
        {texto}
      </span>
    );
  } else {
    // Un elemento de React (StatCard con un párrafo como valor): se pinta tal cual, sin cortarlo.
    cuerpoValor = <span className={`block text-2xl font-black text-slate-900 leading-tight break-words mt-0.5 ${atenuado}`}>{valor}</span>;
  }

  let linea: React.ReactNode = null;
  if (cargando) {
    linea = <span aria-hidden="true" className="block h-3 w-32 rounded bg-slate-200 animate-pulse mt-2" />;
  } else if (conError) {
    linea = <span title="No se pudo cargar" className="line-clamp-2 text-xs font-semibold text-rose-600 mt-1">No se pudo cargar</span>;
  } else if (info) {
    linea = (
      <span className={`mt-1 flex items-center gap-1.5 min-w-0 ${atenuado}`}>
        <span aria-hidden="true" className={`inline-flex items-center gap-0.5 text-xs font-bold shrink-0 ${TONO_CHIP[info.tono]}`}>
          {info.flecha === 'sube' ? <ArrowUpRight size={12} /> : info.flecha === 'baja' ? <ArrowDownRight size={12} /> : <Minus size={12} />}
          {info.texto}
        </span>
        <span aria-hidden="true" title={comparado} className="min-w-0 line-clamp-2 text-xs text-slate-400">{comparado}</span>
        <span className="sr-only">{info.lector}</span>
      </span>
    );
  } else if (ayuda !== undefined && ayuda !== null && ayuda !== false && ayuda !== '') {
    linea = (
      <span title={typeof ayuda === 'string' ? ayuda : undefined} className={`line-clamp-2 text-xs font-semibold mt-1 ${TONO_AYUDA[tono]} ${atenuado}`}>
        {ayuda}
      </span>
    );
  }

  const clases = [
    'flex items-start gap-3 rounded-2xl border p-4 shadow-xs min-h-[88px] w-full',
    tono === 'alerta' ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-white',
    activo ? ANILLO[colorFinal] : '',
  ].join(' ');

  const contenido = (
    <>
      {Icono && (
        <span className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center ${fondoIcono(colorFinal)}`}>
          <Icono size={20} />
        </span>
      )}
      <span className="block min-w-0 flex-1">
        <span title={nombre} className="line-clamp-2 text-xs font-semibold text-slate-500">{nombre}</span>
        {cuerpoValor}
        {linea}
        {cargando && <span className="sr-only">Cargando</span>}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={activo}
        title={tituloFinal}
        className={`${clases} text-left cursor-pointer transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 ${FOCO[colorFinal]}`}
      >
        {contenido}
      </button>
    );
  }
  return (
    <div title={tituloFinal} className={clases}>
      {contenido}
    </div>
  );
}

/**
 * La franja de tarjetas: un <section> con aria-busy mientras carga y la grilla de clasesFranja(n), que decide las
 * columnas por el ancho de la franja (@container), no por el de la pantalla. `estado` llega a las tarjetas que no
 * traen el suyo. `nota`: una línea con el ícono Info debajo.
 */
export function FranjaKpis({
  children, estado = 'listo', nota, titulo = 'Indicadores',
}: {
  children: React.ReactNode;
  estado?: EstadoKpi;
  nota?: React.ReactNode;
  titulo?: string;
}) {
  // Children.toArray deja fuera null, undefined y los booleanos de {cond && <TarjetaKpi …/>}.
  const n = Children.toArray(children).length;
  return (
    <section aria-label={titulo} aria-busy={estado === 'cargando'} className="@container">
      <EstadoFranja.Provider value={estado}>
        <div className={`grid gap-3 ${clasesFranja(n)}`}>{children}</div>
      </EstadoFranja.Provider>
      {nota && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
          <Info size={14} aria-hidden="true" className="shrink-0 mt-px" />
          <div className="min-w-0">{nota}</div>
        </div>
      )}
    </section>
  );
}

/**
 * El estado de las tarjetas de una pantalla (C13): 'cargando' en la primera carga, 'actualizando' en las siguientes
 * (los números anteriores atenuados, sin volver a 0), 'error' si falló y 'listo'. La marca de «ya cargó» es la de
 * avanzarCarga (lib/kpis.js): solo cuenta una carga que de verdad pasó.
 */
export function useEstadoKpi(loading: boolean, error?: unknown): EstadoKpi {
  const [marca, setMarca] = useState<MarcaCarga>(CARGA_INICIAL);
  const siguiente = avanzarCarga(marca, loading);
  // Ajuste del estado durante el render (patrón de React para «lo que se vio en renders anteriores»).
  if (siguiente !== marca) setMarca(siguiente);
  return estadoKpi({ loading, yaCargo: siguiente.yaCargo, error });
}
