'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CircleDashed, HelpCircle, RotateCw, SlidersHorizontal,
} from 'lucide-react';
import { Contador } from '@/components/ui/Contador';
import { usePreferencia } from '@/components/ui/usePreferencia';
import {
  alternarFiltroSemaforo, estadoDeFranja, estadoNumeroFranja, opcionesSemaforo, semaforoDeFranja,
} from '@/lib/flujo';
import { ChipAviso, PasosFlujo } from './PasosFlujo';
import type { AccionAjustar, AvisoFranja, PartesFranja, PasoVista, SemaforoFranja } from './tipos';

/**
 * FLUJO-base punto 4 (Bloque 4, T5A y r1; R4, R6, R12, C2, C13, RP33, RP67, D21 y D38): la franja del flujo, UNA sola
 * franja arriba (flujo_posicion), igual en Ventas, Compras y las listas. Un <section> con fondo blanco, border-b y px-6
 * py-3 (el lugar y el fondo del semáforo del Hub de hoy), nombrado por su h2 (aria-labelledby, r1 M9). La pantalla la
 * pone directo en el <main>, sin otro padding horizontal (el umbral @2xl de las cajas se mide en la franja).
 *  - Fila 1, a la izquierda: el ícono y el texto del semáforo (semaforoDeFranja: gris, rose o emerald, sin emojis; gris y
 *    '—' con error, RP67), el título, la regla (text-xs slate-500) y los avisos como chips. A la derecha: el control
 *    segmentado del semáforo (opcionesSemaforo: 'Con atraso (n)', 'No resueltos (n)' solo si llega noResueltos, y 'Ver
 *    todo'; aria-pressed refleja semaforo.filtro y tocar el activo otra vez lo quita: alternarFiltroSemaforo), la
 *    accionAjustar (si no es null; B4 T7: su `deshabilitado` y su `titulo` van como disabled y title del botón, D27(a)),
 *    '¿Cómo funciona?' (muestra la ayuda debajo de cada caja; no se guarda) y 'Ocultar
 *    flujo' / 'Ver flujo'.
 *  - Fila 2: <PasosFlujo variante="banner">; en modo compacto, los mismos pasos en pastillas, en una sola línea.
 *  - Los números van con Contador (C13): la barra gris mientras cargan y, al recargar, los anteriores siguen
 *    (atenuados en las cajas; en los segmentos del semáforo, plenos: r1 M8). El estado sale de estadoDeFranja y el de
 *    cada número de estadoNumeroFranja (lib/flujo.js).
 *  - Error (ruling de r1 sobre M1): «—» en TODA la franja (las cajas, los botones del semáforo y el semáforo), sin chips
 *    de atraso, y una línea rose 'No se pudieron cargar los números del flujo.' con 'Reintentar'. r1 (M5): mientras se
 *    reintenta, la línea sigue montada y el botón dice 'Reintentando…' (aria-disabled: conserva el foco); cuando sale
 *    bien, vuelven los números. r2 (M2 y M6): el foco pasa al h2 (con preventScroll: el main no salta) solo si el
 *    botón tenía el foco al tocarlo, el usuario no lo llevó a otra parte (un pointerdown o el foco en otro control lo
 *    sueltan) y quedó en el body; al terminar el reintento, bien o mal, se olvida.
 *  - El modo compacto se recuerda EN TU USUARIO (R4, RP33): usePreferencia(`flujo:${idPreferencia}`) de components/ui
 *    (D38), que lo lee después de montar (el primer render es siempre la franja completa: sin diferencias de
 *    hidratación) y no escribe antes de tenerlo listo (D35). Sin almacenamiento, la franja abre completa.
 *  - partes: solo 'todo' (R1: la rama 'semaforo' | 'diagrama' del diseño no se implementa).
 * Uso con flujo = useResumenFlujo(ruta, recarga) (r1, M15b: cuando un conteo no viene se pasa `undefined`, no `null`;
 * null es «todavía carga» y pinta la barra gris). r2 (M3): un ejemplo por pantalla; ninguno da null mientras carga.
 *  - T7, Ventas (/ventas/flujo manda no_resueltos; mientras carga es undefined y, como la clave está, el botón se
 *    reserva con la barra gris: B4 T7 r1, A1):
 *      semaforo={{
 *        atrasados: flujo.datos?.semaforo?.atrasados ?? null,
 *        noResueltos: flujo.datos?.semaforo?.no_resueltos,
 *        filtro, onFiltrar,
 *      }}
 *  - T14, Compras (/compras/flujo no manda no_resueltos):
 *      semaforo={{ atrasados: flujo.datos?.semaforo?.atrasados ?? null, filtro, onFiltrar }}
 *      // sin noResueltos: siempre undefined, nunca se pinta «No resueltos».
 *  - En las dos: cargando={flujo.cargando} error={flujo.error} onReintentar={flujo.recargar}
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
  /**
   * Los chips de aviso de la fila 1, después de la regla.
   * B4 T7 r2 (m-r1-c): por debajo de 960 px de fila (ver FILA y GRUPO_SEMAFORO), se VEN después del grupo del semáforo
   * (CSS order), pero en el DOM van antes. Así, un aviso con onClick (un <button>) queda en el orden del Tab antes que
   * los botones del semáforo, aunque se vea abajo. Hoy ninguna pantalla pasa avisos pulsables (el Hub de Ventas no pasa
   * avisos). La primera que los pase (Compras, T14) tiene que resolverlo: por ejemplo, poner los avisos después del
   * grupo en el DOM y conservar su lugar con order.
   */
  avisos?: ReadonlyArray<AvisoFranja>;
  /** Por defecto null (sin botón). */
  accionAjustar?: AccionAjustar | null;
  /** El id de la preferencia del modo compacto: flujo:<idPreferencia> ([a-z0-9._-], p. ej. 'ventas'). */
  idPreferencia: string;
  /** Solo 'todo' (R1). */
  partes?: PartesFranja;
  /** 'El más antiguo: N días' en cada caja (por defecto no). */
  mostrarAntiguedad?: boolean;
  /**
   * B4 T9 r1 (m6): sin avisos todavía, reserva su renglón (invisible y fuera del árbol accesible, con el alto de un chip).
   * Para la pantalla cuyos avisos llegan en otra respuesta que los números (Cotizaciones: los de su lista): al llegar no
   * empujan las cajas ni lo de abajo (CLS). Por defecto false: la franja es la de siempre. Con avisos no cambia nada.
   */
  reservarAvisos?: boolean;
};

const ICONO_SEMAFORO = { gris: CircleDashed, rojo: AlertTriangle, verde: CheckCircle2 } as const;
const COLOR_SEMAFORO = { gris: 'text-slate-400', rojo: 'text-rose-600', verde: 'text-emerald-600' } as const;
const TEXTO_SEMAFORO = { gris: 'text-slate-500', rojo: 'text-rose-700', verde: 'text-emerald-700' } as const;

/** r1 (C1, M10): el foco es un outline, distinto de cualquier anillo de estado y visible en forced-colors. */
const FOCO = 'outline-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';
const BOTON = `inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 ${FOCO}`;

/**
 * B4 T7 r1 (A1): el renglón del número de cada caja mide lo mismo cargando que cargado. Mientras carga, Contador pinta
 * una barra de 8 px (h-2) como único hijo visible de un span sin texto, que lleva la letra del número (text-sm o, en
 * la caja, text-xl): ese span recibe el alto de un renglón de su letra (1lh) y la barra queda centrada en él.
 */
const RENGLON_DEL_NUMERO = '[&_:has(>.animate-pulse)]:min-h-lh';

/*
 * B4 T7 r1c (ruling de 1536 px): en qué renglón va el grupo del semáforo (los botones de la derecha) lo decide el ANCHO
 * de la fila, con la container query @min-[960px]/fila, nunca el largo de la regla:
 *  - desde 960 px: el bloque del título y la regla (min-w-0 flex-1) y, al lado, el grupo (shrink-0), arriba
 *    (items-start) y sin bajar (flex-nowrap); la regla se parte dentro de su columna, completa;
 *  - por debajo: el bloque se deshace (contents) y el grupo va en su propio renglón (basis-full) justo después del
 *    título; la regla y los avisos van después (order-2 y order-3), así que crecer no lo mueve.
 *  - La regla va siempre en su propio renglón (basis-full): al llegar la larga solo crece hacia abajo, sin saltar del
 *    lado del título al renglón de abajo (medido a 1536 × 864: ese salto de lado pesaba 0,10 de CLS).
 * El contenedor de la query es una envoltura de la fila (@container/fila): una container query no se aplica al mismo
 * elemento que la declara, y la fila cambia su propio flex-nowrap, items-start y gap-x-4.
 * 960 = el grupo en una línea (719 px con «Ajustar tiempos» y los conteos cargando; medido en el banco) + gap-x-4 (16)
 * + el renglón del título con un estado de tres cifras (ícono, «Flujo comercial» y «123 con atraso»: unos 221 px), con
 * unos px de holgura. Con el menú abierto y las barras clásicas, la fila llega a 960 px a los 1280 px de pantalla.
 * Los conteos del grupo van, con sus paréntesis, en una ranura de min-w-6 (24 px: «(» + la barra de Contador + «)»,
 * medido) y h-4 (un renglón de text-xs): el grupo mide lo mismo cargando y con números de una o dos cifras, y no se corre
 * de lado al llegar los datos. La fila no lleva justify-between: por debajo del breakpoint, con el bloque deshecho,
 * separaría el título de su estado.
 */
const FILA = 'flex flex-wrap items-center gap-x-2 gap-y-2 @min-[960px]/fila:flex-nowrap @min-[960px]/fila:items-start @min-[960px]/fila:gap-x-4';
const BLOQUE_TITULO = 'contents @min-[960px]/fila:flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1';
const GRUPO_SEMAFORO = 'order-1 flex basis-full shrink-0 flex-wrap items-center gap-2 @min-[960px]/fila:basis-auto';

/** Un valor guardado en flujo:<id> vale solo si es true o false (otro valor: la franja completa). */
const esBooleano = (valor: unknown) => typeof valor === 'boolean';

/** La franja del flujo. Ver arriba. */
export function BannerFlujo({
  titulo, regla, semaforo, pasos, cargando = false, error = null, onReintentar, onSeleccionarPaso, avisos,
  accionAjustar = null, idPreferencia, mostrarAntiguedad = false, reservarAvisos = false,
}: PropsBannerFlujo) {
  const [compacto, guardarCompacto] = usePreferencia<boolean>(`flujo:${idPreferencia}`, false, { validar: esBooleano });
  const [verAyuda, setVerAyuda] = useState(false);
  const idTitulo = useId();
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const reintentarRef = useRef<HTMLButtonElement>(null);
  // r1 (M5) y r2 (M2 y M6): Reintentar tenía el foco cuando se tocó; si al salir bien el foco quedó en el body (React
  // quitó el botón), pasa al h2. Se suelta con un pointerdown, con el foco en otro control o al terminar el reintento.
  const focoPendiente = useRef(false);
  const reintentandoAntes = useRef(false);

  // r1 (M1 y M5): useResumenFlujo no trae el error mientras vuelve a cargar; la franja recuerda que lo hubo (ajuste del
  // estado durante el render, como useEstadoKpi) para seguir en «—» y con la línea de error hasta que la carga sale bien.
  const [huboError, setHuboError] = useState(false);
  const f = estadoDeFranja({ cargando, error, huboError });
  if (f.conError !== huboError) setHuboError(f.conError);

  const resumen = semaforoDeFranja({ atrasados: semaforo?.atrasados ?? null, cargando: f.cargandoNumeros, error: f.conError });
  // B4 T7 r1 (A1): mientras carga, la fila del semáforo lleva los botones que tendrá con los datos. La pantalla que pasa
  // la clave noResueltos (Ventas: undefined hasta que llega el resumen) reserva «No resueltos» con null, la barra gris
  // (M15b); la que no la pasa (Compras) sigue sin él. Con error o con datos, como antes.
  const semaforoVisto = f.cargandoNumeros && semaforo && 'noResueltos' in semaforo && semaforo.noResueltos === undefined
    ? { ...semaforo, noResueltos: null }
    : semaforo;
  const opciones = opcionesSemaforo(semaforoVisto);
  const IconoSemaforo = ICONO_SEMAFORO[resumen.tono];

  // r2 (M2 y M6): al terminar el reintento (bien o mal) el foco pendiente se olvida; si salió bien y el foco quedó en el
  // body, va al h2 sin desplazar la página.
  useEffect(() => {
    const termino = reintentandoAntes.current && !f.reintentando;
    reintentandoAntes.current = f.reintentando;
    if (!termino) return;
    const devolver = focoPendiente.current && !f.conError;
    focoPendiente.current = false;
    const activo = document.activeElement;
    if (devolver && (!activo || activo === document.body)) tituloRef.current?.focus({ preventScroll: true });
  }, [f.reintentando, f.conError]);

  // r2 (M2): mientras se ve la línea de error, un pointerdown fuera de Reintentar o el foco en otro control sueltan el
  // foco pendiente (un clic en texto no enfocable deja el foco en el body sin relatedTarget). Un segundo clic en el
  // mismo botón (doble clic, o «Reintentando…») no es irse a otra parte.
  useEffect(() => {
    if (!f.conError) return undefined;
    const soltar = () => {
      focoPendiente.current = false;
    };
    const alPulsar = (e: PointerEvent) => {
      if (!(e.target instanceof Node && reintentarRef.current?.contains(e.target))) soltar();
    };
    const alEnfocarOtro = (e: FocusEvent) => {
      if (e.target !== reintentarRef.current) soltar();
    };
    document.addEventListener('pointerdown', alPulsar, true);
    document.addEventListener('focusin', alEnfocarOtro, true);
    return () => {
      document.removeEventListener('pointerdown', alPulsar, true);
      document.removeEventListener('focusin', alEnfocarOtro, true);
    };
  }, [f.conError]);

  return (
    <section aria-labelledby={idTitulo} aria-busy={cargando} className="min-w-0 border-b border-slate-200 bg-white px-6 py-3">
      <div className="@container/fila">
        <div className={FILA}>
          <div className={BLOQUE_TITULO}>
            {semaforo ? <IconoSemaforo aria-hidden="true" size={18} className={`shrink-0 ${COLOR_SEMAFORO[resumen.tono]}`} /> : null}
            <h2 id={idTitulo} ref={tituloRef} tabIndex={-1} className={`rounded text-sm font-bold text-slate-800 ${FOCO}`}>{titulo}</h2>
            {semaforo ? (
              <span role="status" className={`text-xs font-semibold ${TEXTO_SEMAFORO[resumen.tono]}`}>{resumen.texto}</span>
            ) : null}
            {regla ? <span className="order-2 basis-full text-xs text-slate-500">{regla}</span> : null}
            {avisos?.length ? (
              <span className="order-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                {avisos.map((a, i) => <ChipAviso key={`${a.texto}-${i}`} texto={a.texto} tono={a.tono} onClick={a.onClick} />)}
              </span>
            ) : reservarAvisos ? (
              <span aria-hidden="true" className="order-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 invisible">
                <ChipAviso texto="Avisos" tono="gris" />
              </span>
            ) : null}
          </div>
          <div className={GRUPO_SEMAFORO}>
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
                      <span className="inline-flex h-4 min-w-6 items-center justify-center">
                        (<Contador valor={o.conteo} estado={estadoNumeroFranja(o.conteo, f.estadoConteos, { atenuar: false })} />)
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
            {accionAjustar ? (
              <button type="button" onClick={accionAjustar.onClick} disabled={accionAjustar.deshabilitado} title={accionAjustar.titulo} className={`${BOTON} disabled:cursor-not-allowed disabled:opacity-50`}>
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
      </div>

      {f.conError ? (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-rose-700">
          <AlertTriangle size={14} aria-hidden="true" className="shrink-0" />
          <span>No se pudieron cargar los números del flujo.</span>
          {onReintentar ? (
            <button
              ref={reintentarRef}
              type="button"
              aria-disabled={f.reintentando || undefined}
              onClick={(e) => {
                if (f.reintentando) return;
                focoPendiente.current = document.activeElement === e.currentTarget;
                onReintentar();
              }}
              className={`inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-0.5 text-rose-700 hover:bg-rose-50 aria-disabled:cursor-wait aria-disabled:opacity-80 ${FOCO}`}
            >
              <RotateCw size={12} aria-hidden="true" className={f.reintentando ? 'motion-safe:animate-spin' : ''} />
              {f.reintentando ? 'Reintentando…' : 'Reintentar'}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={`mt-3 min-w-0 ${RENGLON_DEL_NUMERO}`}>
        <PasosFlujo
          variante="banner"
          pasos={pasos}
          etiqueta="Pasos del flujo"
          onSeleccionar={onSeleccionarPaso}
          compacto={compacto}
          mostrarAntiguedad={mostrarAntiguedad}
          mostrarAyuda={verAyuda}
          estadoConteos={f.estadoConteos}
        />
      </div>
    </section>
  );
}
