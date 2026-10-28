'use client';

import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CircleDashed, HelpCircle, RotateCw, SlidersHorizontal,
} from 'lucide-react';
import { Contador } from '@/components/ui/Contador';
import { usePreferencia } from '@/components/ui/usePreferencia';
import { estadoKpi } from '@/lib/kpis';
import type { EstadoKpi } from '@/lib/kpis';
import { estadoDeConteo } from '@/lib/tabla';
import { alternarFiltroSemaforo, opcionesSemaforo, semaforoDeFranja } from '@/lib/flujo';
import { ChipAviso, PasosFlujo } from './PasosFlujo';
import type { AccionAjustar, AvisoFranja, PartesFranja, PasoVista, SemaforoFranja } from './tipos';

/**
 * FLUJO-base punto 4 (Bloque 4, T5A; R4, R6, R12, C2, C13, RP33, RP67, D21 y D38): la franja del flujo, UNA sola franja
 * arriba (flujo_posicion), igual en Ventas, Compras y las listas. Un <section aria-label={titulo}> con fondo blanco,
 * border-b y px-6 py-3 (el lugar y el fondo del semáforo del Hub de hoy).
 *  - Fila 1, a la izquierda: el ícono y el texto del semáforo (semaforoDeFranja: gris, rose o emerald, sin emojis; gris y
 *    '—' con error, RP67), el título, la regla (text-xs slate-500) y los avisos como chips. A la derecha: el control
 *    segmentado del semáforo (opcionesSemaforo: 'Con atraso (n)', 'No resueltos (n)' solo si llega noResueltos, y 'Ver
 *    todo'; aria-pressed refleja semaforo.filtro y tocar el activo otra vez lo quita: alternarFiltroSemaforo), la
 *    accionAjustar (si no es null), '¿Cómo funciona?' (muestra la ayuda debajo de cada caja; no se guarda) y 'Ocultar
 *    flujo' / 'Ver flujo'.
 *  - Fila 2: <PasosFlujo variante="banner">; en modo compacto, los mismos pasos en pastillas, en una sola línea.
 *  - Los números van con Contador (C13): la barra gris mientras cargan, '—' solo con error (D21), y al recargar los
 *    anteriores siguen (atenuados). El estado sale de estadoKpi (lib/kpis.js) y el de cada número de estadoDeConteo
 *    (lib/tabla.js, el mismo de BarraTabla).
 *  - Error: una línea rose 'No se pudieron cargar los números del flujo.' con 'Reintentar'; las cajas sin número
 *    muestran '—'.
 *  - El modo compacto se recuerda EN TU USUARIO (R4, RP33): usePreferencia(`flujo:${idPreferencia}`) de components/ui
 *    (D38), que lo lee después de montar (el primer render es siempre la franja completa: sin diferencias de
 *    hidratación) y no escribe antes de tenerlo listo (D35). Sin almacenamiento, la franja abre completa.
 *  - partes: solo 'todo' (R1: la rama 'semaforo' | 'diagrama' del diseño no se implementa).
 * Sin variantes de modo oscuro ni diálogos nativos del navegador (avisos en la misma franja); textos en español con
 * tildes.
 */

export type PropsBannerFlujo = {
  titulo: string;
  /** La regla de atraso (textoRegla de flujo-ventas.js o textoReglaCompras de flujo-compras.js). */
  regla?: string;
  /** Sin semáforo no se pintan su ícono ni su control segmentado. */
  semaforo?: SemaforoFranja;
  pasos: ReadonlyArray<PasoVista>;
  /** Hay una carga en camino (useResumenFlujo().cargando). */
  cargando?: boolean;
  /** El error de la última carga (useResumenFlujo().error). */
  error?: unknown;
  onReintentar?: () => void;
  onSeleccionarPaso?: (clave: string) => void;
  avisos?: ReadonlyArray<AvisoFranja>;
  /** Por defecto null (sin botón). */
  accionAjustar?: AccionAjustar | null;
  /** El id de la preferencia del modo compacto: flujo:<idPreferencia> ([a-z0-9._-], p. ej. 'ventas'). */
  idPreferencia: string;
  /** Solo 'todo' (R1). */
  partes?: PartesFranja;
  /** 'El más antiguo: N días' en cada caja (por defecto no). */
  mostrarAntiguedad?: boolean;
};

const ICONO_SEMAFORO = { gris: CircleDashed, rojo: AlertTriangle, verde: CheckCircle2 } as const;
const COLOR_SEMAFORO = { gris: 'text-slate-400', rojo: 'text-rose-600', verde: 'text-emerald-600' } as const;
const TEXTO_SEMAFORO = { gris: 'text-slate-500', rojo: 'text-rose-700', verde: 'text-emerald-700' } as const;

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1';
const BOTON = `inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 ${FOCO}`;

/** Un valor guardado en flujo:<id> vale solo si es true o false (otro valor: la franja completa). */
const esBooleano = (valor: unknown) => typeof valor === 'boolean';

/** La franja del flujo. Ver arriba. */
export function BannerFlujo({
  titulo, regla, semaforo, pasos, cargando = false, error = null, onReintentar, onSeleccionarPaso, avisos,
  accionAjustar = null, idPreferencia, mostrarAntiguedad = false,
}: PropsBannerFlujo) {
  const [compacto, guardarCompacto] = usePreferencia<boolean>(`flujo:${idPreferencia}`, false, { validar: esBooleano });
  const [verAyuda, setVerAyuda] = useState(false);

  const estadoConteos: EstadoKpi = estadoKpi({ loading: cargando, error });
  const resumen = semaforoDeFranja({ atrasados: semaforo?.atrasados ?? null, cargando, error });
  const opciones = opcionesSemaforo(semaforo);
  const IconoSemaforo = ICONO_SEMAFORO[resumen.tono];

  return (
    <section aria-label={titulo} aria-busy={cargando} className="min-w-0 border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {semaforo ? <IconoSemaforo aria-hidden="true" size={18} className={`shrink-0 ${COLOR_SEMAFORO[resumen.tono]}`} /> : null}
          <h2 className="text-sm font-bold text-slate-800">{titulo}</h2>
          {semaforo ? (
            <span role="status" className={`text-xs font-semibold ${TEXTO_SEMAFORO[resumen.tono]}`}>{resumen.texto}</span>
          ) : null}
          {regla ? <span className="text-xs text-slate-500">{regla}</span> : null}
          {avisos?.map((a, i) => <ChipAviso key={`${a.texto}-${i}`} texto={a.texto} tono={a.tono} onClick={a.onClick} />)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {semaforo && opciones.length ? (
            <div role="group" aria-label="Filtrar por atraso" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {opciones.map((o) => (
                <button
                  key={o.filtro}
                  type="button"
                  aria-pressed={o.activo}
                  onClick={() => semaforo.onFiltrar(alternarFiltroSemaforo(semaforo.filtro, o.filtro))}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${FOCO} ${o.activo
                    ? (o.filtro === 'atrasados' ? 'bg-rose-600 text-white shadow-sm' : 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200')
                    : 'text-slate-600 hover:bg-white hover:text-slate-800'}`}
                >
                  {o.texto}
                  {o.conConteo ? (
                    <span className="inline-flex items-center">
                      (<Contador valor={o.conteo} estado={estadoDeConteo(o.conteo, estadoConteos)} />)
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          {accionAjustar ? (
            <button type="button" onClick={accionAjustar.onClick} className={BOTON}>
              <SlidersHorizontal size={14} aria-hidden="true" />
              {accionAjustar.label}
            </button>
          ) : null}
          <button type="button" aria-pressed={verAyuda} onClick={() => setVerAyuda((v) => !v)} className={`${BOTON} ${verAyuda ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : ''}`}>
            <HelpCircle size={14} aria-hidden="true" />
            ¿Cómo funciona?
          </button>
          <button type="button" onClick={() => guardarCompacto(!compacto)} className={BOTON}>
            {compacto ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
            {compacto ? 'Ver flujo' : 'Ocultar flujo'}
          </button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-rose-700">
          <AlertTriangle size={14} aria-hidden="true" className="shrink-0" />
          <span>No se pudieron cargar los números del flujo.</span>
          {onReintentar ? (
            <button
              type="button"
              onClick={onReintentar}
              disabled={cargando}
              className={`inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-0.5 text-rose-700 hover:bg-rose-50 disabled:opacity-60 ${FOCO}`}
            >
              <RotateCw size={12} aria-hidden="true" />
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 min-w-0">
        <PasosFlujo
          variante="banner"
          pasos={pasos}
          etiqueta="Pasos del flujo"
          onSeleccionar={onSeleccionarPaso}
          compacto={compacto}
          mostrarAntiguedad={mostrarAntiguedad}
          mostrarAyuda={verAyuda}
          estadoConteos={estadoConteos}
        />
      </div>
    </section>
  );
}
