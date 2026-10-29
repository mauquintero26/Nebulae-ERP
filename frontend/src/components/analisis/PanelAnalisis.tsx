'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lock, RefreshCw, Search } from 'lucide-react';
import type { AccentColor } from '@/components/ui/colors';
import { usePreferenciaParte } from '@/components/ui/usePreferencia';
// El usuario del token (el tope de espera de las preferencias y las escrituras son suyos, como useEstadoTabla de T4C r2).
import { usuarioDeLaSesion } from '@/components/tabla/usuarioDeLaSesion';
import { esperarPreferencias, listoConTope } from '@/lib/tabla';
import {
  ASISTENTE_POR_DEFECTO, ESPERA_PRODUCTO_MS, GRILLA_ANALISIS, PREFERENCIA_ANALISIS_POR_DEFECTO, aceptaReintento,
  clavePreferenciaAnalisis, escrituraDelRender, focoUrlInicial, focoUrlTras, leerPreferenciaAnalisis, mejorDeLinea,
  parametrosAnalisis, periodoVisible, productoConsulta, resolverFoco, siguienteErrorVisto, siguienteReintento,
  textoActualizado, textoComparado, textoMovimientosMas,
} from '@/lib/analisis';
import type {
  ErrorAnalisis, ErrorVisto, Etiquetar, FilaMovimiento, MejorAnalisis, ModuloAnalisis, PeriodoAnalisis,
} from '@/lib/analisis';
import { AsistenteEnConstruccion } from './AsistenteEnConstruccion';
import { EsqueletoAnalisis } from './EsqueletoAnalisis';
import { FilaKpis } from './FilaKpis';
import { GraficoBarras } from './GraficoBarras';
import { GraficoDona } from './GraficoDona';
import { GraficoLinea } from './GraficoLinea';
import { ListaMovimientos } from './ListaMovimientos';
import { RankingTop } from './RankingTop';
import type { TopRanking } from './RankingTop';
import { EsqueletoBarra, SelectorPeriodo } from './SelectorPeriodo';
import { useAnalisis } from './useAnalisis';

/**
 * ANALISIS-base puntos 2 y 3 (Bloque 4, T5C y r1; R2, R4, R7, R13, C2, C12, C21, RP69, D35, D38, D40 y D43): la
 * pestaña Análisis estándar. Las pantallas NO la importan directo: importan PanelAnalisisPerezoso (R13: chart.js se
 * descarga al abrir la pestaña).
 *  - Arriba: el selector de foco si llegan `focos` (Ventas: FOCOS_VENTAS, Todo / Solicitudes / Cotizaciones / Pedidos;
 *    `focoInicial`, el ?foco= de «Ver análisis», gana sobre el guardado hasta que el usuario elige otro, y un ?foco=
 *    nuevo vuelve a ganar: focoUrlTras); el selector de período con 'Comparado con …' debajo (solo si el período de los
 *    datos es cierto: periodoVisible); el campo Producto (`busquedaProducto`: 400 ms y solo con 2 letras o más, RP69);
 *    `controlesExtra` (su valor llega por `params`); el botón Actualizar y debajo 'Actualizado hace …'.
 *  - Período, top y foco se recuerdan en analisis:<modulo> con usePreferenciaParte (R4 y C2): cada cambio escribe SOLO
 *    su pieza ({periodo}, {top} o {foco}; D38), nada se escribe antes de listo (D35) y solo si el usuario con que se
 *    pintó la pantalla es el del token (r1, M9: escrituraDelRender, la regla de la tabla). Lo guardado se lee pieza
 *    por pieza (leerPreferenciaAnalisis). Mientras las preferencias no están listas (a lo sumo 4 s, el tope de
 *    esperarPreferencias de lib/tabla.js) se ve el esqueleto con la barra y la fila de focos (EsqueletoBarra, r1 M14) y
 *    no sale ninguna petición: la primera es la del período guardado. Si el navegador no deja guardar, funciona igual
 *    con 30 días.
 *  - `params`: lo que el panel no maneja pasa tal cual (sin `focos`, params.foco; sin `busquedaProducto`,
 *    params.producto; r1, M7 y M12).
 *  - Los datos: useAnalisis (AbortController; solo cuenta la última consulta). Mientras recarga, los datos anteriores se
 *    ven atenuados al 90 % (r1, M21: slate-600 queda en 4,5:1 o más) y la región lleva aria-busy; al cambiar de foco,
 *    el esqueleto. Con un error: 'No pudimos cargar el análisis. Revisa tu conexión y vuelve a intentarlo.' con
 *    'Reintentar' (o 'No tienes permiso para ver este análisis.'), y los últimos datos buenos SIN atenuar (el aviso ya
 *    dice que fallaron). El aviso va atado al endpoint, el foco y el usuario (r1, M11) y sigue montado mientras se
 *    reintenta; «Reintentando…» solo con la carga de Reintentar en camino. Si salió bien y el foco quedó en el body,
 *    pasa a la región de los datos.
 *  - La grilla es GRILLA_ANALISIS (container queries; la raíz es @container/analisis) y la fila de KPIs es FilaKpis
 *    dentro de FranjaKpis (D43, M2), igual que EsqueletoAnalisis. Un bloque que el módulo no tiene (null) no deja celda.
 *    Desde @2xl se ven 4 movimientos y debajo 'y N movimientos más' (r1, M1 y M19).
 *  - La línea recibe `mejorLinea` o el «mejor» del kpi de la misma cifra (mejorDeLinea; con ambigüedad, gris).
 *  - aria-busy={recargando} en la región que se actualiza (D43, M12; r1, M17): el status del esqueleto de la primera
 *    carga no queda dentro de una región ocupada.
 *  - Al final, AsistenteEnConstruccion (R2): `asistente` o {titulo: 'Asistente con IA', ejemplos: []} (RP69).
 * Uso en una pantalla (T7, Hub de Ventas; las demás igual, sin focos):
 *    <PanelAnalisisPerezoso modulo="ventas" endpoint="/ventas/analisis" acento="indigo" focos={FOCOS_VENTAS}
 *      focoInicial={searchParams.get('foco')} alCambiarFoco={(f) => router.replace(`?tab=analisis&foco=${f}`)}
 *      mejorLinea="sube" asistente={{titulo: 'Copilot de Ventas', ejemplos: [...]}} />
 * Foco visible con outline (nunca outline-none). Clases de Tailwind literales, sin variantes de modo oscuro.
 */

export type FocoPanel = { clave: string; etiqueta: string };

export type PropsPanelAnalisis = {
  /** La clave de las preferencias: analisis:<modulo> (RP69: 'ventas', 'compras', 'inventario', 'crm' o 'finanzas'). */
  modulo: ModuloAnalisis;
  /** Por ejemplo '/ventas/analisis'. */
  endpoint: string;
  /**
   * Parámetros propios de la pantalla (por ejemplo {bodega}). El panel solo pisa lo que maneja: el foco si hay `focos`
   * y el producto si hay `busquedaProducto`; lo demás pasa tal cual.
   */
  params?: Record<string, string | number | null | undefined>;
  /** El color del módulo (components/ui/colors.ts). */
  acento?: AccentColor;
  /** El campo 'Producto' (manda producto= con 2 letras o más, 400 ms después de la última tecla). */
  busquedaProducto?: boolean;
  /** Por ejemplo el select de bodega; su valor llega por `params`. */
  controlesExtra?: React.ReactNode;
  /** Cambia el nombre de los segmentos de la dona, las filas del ranking y las series y categorías de las barras. */
  etiquetar?: Etiquetar;
  /** Abre un movimiento; sin él, cada fila es un <Link> a enlaceDocumento. */
  alAbrirMovimiento?: (fila: FilaMovimiento) => void;
  /** Debajo de la grilla, antes del asistente. */
  pie?: React.ReactNode;
  /** El selector de foco (Ventas: FOCOS_VENTAS); el foco se recuerda en analisis:<modulo> y va como foco=. */
  focos?: ReadonlyArray<FocoPanel>;
  /** El ?foco= de la URL («Ver análisis» de las listas): gana sobre el guardado hasta que el usuario elige otro. */
  focoInicial?: string | null;
  /** r1 (M4): el usuario eligió un foco en el panel; la pantalla actualiza ?foco= (router.replace) para que la URL no mienta. */
  alCambiarFoco?: (clave: string) => void;
  /** El asistente del final (R2); por defecto {titulo: 'Asistente con IA', ejemplos: []}. */
  asistente?: { titulo: string; ejemplos: ReadonlyArray<string> };
  /** El «mejor» del chip de la línea; las pantallas lo pasan. Sin él, el del kpi de la misma cifra (o gris). */
  mejorLinea?: MejorAnalisis;
};

const G = GRILLA_ANALISIS;
const FOCO = 'outline-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';
const PILDORA = `inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold transition-colors ${FOCO}`;
const PILDORA_ACTIVA = 'border-slate-900 bg-slate-900 text-white';
const PILDORA_INACTIVA = 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';
const BOTON = `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border bg-white px-3 py-1.5 text-xs font-bold ${FOCO}`;
const BOTON_NEUTRO = `${BOTON} border-slate-300 text-slate-700 hover:bg-slate-50`;
const BOTON_ERROR = `${BOTON} border-rose-300 text-rose-800 hover:bg-rose-100`;
/** Lo que vuelve a pintar 'Actualizado hace …'. */
const TIC_MS = 30_000;

type PropsAvisoError = {
  aviso: ErrorAnalisis;
  reintentando: boolean;
  onReintentar: (e: React.MouseEvent<HTMLButtonElement>) => void;
  botonRef: React.RefObject<HTMLButtonElement | null>;
};

/** El aviso de error de la carga; con 'Reintentar' (aria-disabled mientras reintenta: no suelta el foco). */
function AvisoError({ aviso, reintentando, onReintentar, botonRef }: PropsAvisoError) {
  const permiso = aviso.tipo === 'permiso';
  const Icono = permiso ? Lock : AlertTriangle;
  return (
    <div
      role="alert"
      className={`flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${permiso ? 'border-slate-200 bg-slate-50' : 'border-rose-200 bg-rose-50'}`}
    >
      <Icono aria-hidden="true" size={18} className={`shrink-0 ${permiso ? 'text-slate-700' : 'text-rose-700'}`} />
      <p className={`min-w-0 flex-1 basis-48 text-sm font-semibold ${permiso ? 'text-slate-800' : 'text-rose-800'}`}>{aviso.texto}</p>
      {aviso.reintentar && (
        <button
          ref={botonRef}
          type="button"
          aria-disabled={reintentando || undefined}
          onClick={onReintentar}
          className={BOTON_ERROR}
        >
          <RefreshCw size={14} aria-hidden="true" className={reintentando ? 'motion-safe:animate-spin' : ''} />
          {reintentando ? 'Reintentando…' : 'Reintentar'}
        </button>
      )}
    </div>
  );
}

export function PanelAnalisis({
  modulo, endpoint, params, acento, busquedaProducto = false, controlesExtra, etiquetar, alAbrirMovimiento, pie, focos,
  focoInicial = null, alCambiarFoco, asistente, mejorLinea,
}: PropsPanelAnalisis) {
  const idProducto = useId();
  const idAyudaProducto = useId();

  // R4, D35 y D38: analisis:<modulo>, una pieza a la vez y nada antes de listo (usePreferenciaParte lo resuelve).
  const [guardado, guardarParte, prefsListas] = usePreferenciaParte(clavePreferenciaAnalisis(modulo), PREFERENCIA_ANALISIS_POR_DEFECTO);
  const prefs = useMemo(() => leerPreferenciaAnalisis(guardado, { focos }), [guardado, focos]);

  // El tope de espera de las preferencias (4 s), del usuario del render: si el GET se cuelga, se pide con lo de memoria.
  const usuario = usuarioDeLaSesion();
  const [vencidoPara, setVencidoPara] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (prefsListas) return undefined;
    return esperarPreferencias({ alVencer: () => setVencidoPara(usuario) });
  }, [usuario, prefsListas]);
  const listo = listoConTope(prefsListas, vencidoPara === usuario);

  // r1 (M9): el usuario con que se pintó la pantalla. Una acción hecha cuando el token ya es de otra cuenta (otra
  // pestaña entró y el vínculo pasó a la instancia nueva antes de este render) no se guarda en ninguna.
  const usuarioDelRender = useRef(usuario);
  useLayoutEffect(() => {
    usuarioDelRender.current = usuario;
  }, [usuario]);
  const puedeEscribir = () => escrituraDelRender(usuarioDelRender.current, usuarioDeLaSesion());

  // R13 (r1, M1 y M6): el foco de la URL gana hasta que el usuario elige otro; si la URL trae otro foco, vuelve a ganar.
  const [focoUrl, setFocoUrl] = useState(() => focoUrlInicial(focoInicial));
  const focoUrlVisto = focoUrlTras(focoUrl, { tipo: 'url', foco: focoInicial });
  if (focoUrlVisto !== focoUrl) setFocoUrl(focoUrlVisto);
  const foco = resolverFoco(focos, focoUrlVisto.usar ? focoUrlVisto.inicial : null, prefs.foco);
  const conFoco = Boolean(focos && focos.length > 0);

  // El campo Producto: se pide 400 ms después de la última tecla y solo con 2 letras o más (RP69).
  const [producto, setProducto] = useState('');
  const [productoAplicado, setProductoAplicado] = useState<string | null>(null);
  useEffect(() => {
    if (!busquedaProducto) return undefined;
    const id = window.setTimeout(() => setProductoAplicado(productoConsulta(producto)), ESPERA_PRODUCTO_MS);
    return () => window.clearTimeout(id);
  }, [producto, busquedaProducto]);
  const productoCorto = producto.trim() !== '' && productoConsulta(producto) === null;

  const [modoDona, setModoDona] = useState<string | null>(null);

  const analisis = useAnalisis({
    endpoint,
    periodo: prefs.periodo,
    top: prefs.top,
    extra: parametrosAnalisis(params, { conFoco, foco, conProducto: busquedaProducto, producto: productoAplicado }),
    ambito: `${endpoint}|${foco ?? ''}`,
    esperar: !listo,
  });
  const datos = analisis.datos;

  // El aviso de error que se ve (r1, M11): atado al endpoint, al foco y al usuario; sigue montado mientras se reintenta.
  const ambitoError = `${endpoint}|${foco ?? ''}|${usuario ?? ''}`;
  const [errorVisto, setErrorVisto] = useState<ErrorVisto | null>(null);
  const vistoAhora = siguienteErrorVisto(errorVisto, { cargando: analisis.cargando, error: analisis.error, ambito: ambitoError });
  if (vistoAhora !== errorVisto) setErrorVisto(vistoAhora);
  const aviso = vistoAhora?.aviso ?? null;
  // «Reintentando…» solo mientras está en camino la carga que pidió Reintentar (no otra: un período, un foco).
  const [reintentoPedido, setReintentoPedido] = useState(false);
  const pedido = siguienteReintento(reintentoPedido, { cargando: analisis.cargando });
  if (pedido !== reintentoPedido) setReintentoPedido(pedido);
  const reintentando = Boolean(aviso) && pedido;

  // Reintentar tenía el foco al tocarlo: si al terminar el reintento el foco quedó en el body (React quitó el botón),
  // pasa a la región de los datos sin desplazar la página. Un pointerdown o el foco en otro control lo sueltan.
  const regionRef = useRef<HTMLDivElement>(null);
  const reintentarRef = useRef<HTMLButtonElement>(null);
  const focoPendiente = useRef(false);
  const reintentandoAntes = useRef(false);
  useEffect(() => {
    const termino = reintentandoAntes.current && !reintentando;
    reintentandoAntes.current = reintentando;
    if (!termino) return;
    const devolver = focoPendiente.current;
    focoPendiente.current = false;
    const activo = document.activeElement;
    if (devolver && (!activo || activo === document.body)) regionRef.current?.focus({ preventScroll: true });
  }, [reintentando]);
  useEffect(() => {
    if (!aviso) return undefined;
    const soltar = (e: Event) => {
      if (!(e.target instanceof Node && reintentarRef.current?.contains(e.target))) focoPendiente.current = false;
    };
    document.addEventListener('pointerdown', soltar, true);
    document.addEventListener('focusin', soltar, true);
    return () => {
      document.removeEventListener('pointerdown', soltar, true);
      document.removeEventListener('focusin', soltar, true);
    };
  }, [aviso]);
  const reintentar = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!aceptaReintento(aviso, reintentando)) return;
    focoPendiente.current = document.activeElement === e.currentTarget;
    setReintentoPedido(true);
    analisis.recargar();
  };

  // 'Actualizado hace …' se vuelve a pintar cada 30 s.
  const [, setTic] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTic((t) => t + 1), TIC_MS);
    return () => window.clearInterval(id);
  }, []);

  const elAsistente = asistente ?? ASISTENTE_POR_DEFECTO;
  const asistenteFinal = <AsistenteEnConstruccion titulo={elAsistente.titulo} ejemplos={elAsistente.ejemplos} />;

  if (!listo) {
    return (
      <div className={G.raiz}>
        <div className={G.filas}>
          <EsqueletoBarra focos={focos?.length ?? 0} producto={busquedaProducto} />
          <EsqueletoAnalisis barra={false} />
          {pie}
          {asistenteFinal}
        </div>
      </div>
    );
  }

  const elegirFoco = (clave: string) => {
    if (!puedeEscribir()) return;
    setFocoUrl((e) => focoUrlTras(e, { tipo: 'elegir' }));
    guardarParte({ foco: clave });
    alCambiarFoco?.(clave);
  };
  const elegirPeriodo = (periodo: PeriodoAnalisis) => {
    if (!puedeEscribir()) return;
    guardarParte({ periodo });
  };
  const elegirTop = (top: TopRanking) => {
    if (!puedeEscribir()) return;
    guardarParte({ top });
  };

  // r1 (M10): 'Comparado con …' y las fechas de Personalizado solo con un período de datos que sea cierto.
  const periodoDatos = periodoVisible(datos, { recargando: analisis.recargando, aviso, periodo: prefs.periodo });
  const actualizado = datos ? textoActualizado(datos.generado_en) : '';
  // r1 (M21): solo mientras recarga, y al 90 % (medido: al 80 % el slate-600 sobre slate-50 quedaba en 4,39:1; al 90 %,
  // 5,61); con un error los datos se leen enteros (el aviso dice que fallaron).
  const atenuar = analisis.recargando;
  const granularidad = datos?.periodo?.granularidad ?? null;
  const conFila2 = Boolean(datos && (datos.linea || datos.donas.length || datos.movimientos));
  const conFila3 = Boolean(datos && (datos.ranking || datos.barras));
  const masMovimientos = datos?.movimientos ? textoMovimientosMas(datos.movimientos.filas.length) : null;

  return (
    <div className={G.raiz}>
      <div className={G.filas}>
        {focos && focos.length > 0 && (
          <div role="group" aria-label="Ver el análisis de" className="flex min-w-0 flex-wrap gap-1.5">
            {focos.map((f) => (
              <button
                key={f.clave}
                type="button"
                aria-pressed={f.clave === foco}
                onClick={() => elegirFoco(f.clave)}
                className={`${PILDORA} ${f.clave === foco ? PILDORA_ACTIVA : PILDORA_INACTIVA}`}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>
        )}

        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <SelectorPeriodo periodo={prefs.periodo} alCambiar={elegirPeriodo} comparado={textoComparado(periodoDatos)} periodoDatos={periodoDatos} />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {busquedaProducto && (
                <div className="min-w-0 max-w-full">
                  <label htmlFor={idProducto} className="sr-only">Producto</label>
                  <div className="relative">
                    <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
                    <input
                      id={idProducto}
                      type="search"
                      value={producto}
                      onChange={(e) => setProducto(e.target.value)}
                      placeholder="Producto"
                      aria-describedby={productoCorto ? idAyudaProducto : undefined}
                      className={`block w-48 min-w-0 max-w-full rounded-xl border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-600 ${FOCO}`}
                    />
                  </div>
                  {productoCorto && <p id={idAyudaProducto} className="mt-1 text-xs text-slate-600">Escribe al menos 2 letras.</p>}
                </div>
              )}
              {controlesExtra}
              <button type="button" onClick={analisis.recargar} className={BOTON_NEUTRO}>
                <RefreshCw size={14} aria-hidden="true" className={analisis.recargando ? 'motion-safe:animate-spin' : ''} />
                Actualizar
              </button>
            </div>
            {/* La línea va siempre (vacía hasta que llegan los datos): la barra no cambia de alto (r1, M14). */}
            <p className="mt-1.5 min-h-4 text-xs text-slate-600">{actualizado}</p>
          </div>
        </div>

        <div ref={regionRef} tabIndex={-1} aria-busy={analisis.recargando} aria-label="Datos del análisis" role="region" className={`${G.filas} min-w-0 rounded-2xl ${FOCO}`}>
          {aviso && (
            <AvisoError aviso={aviso} reintentando={reintentando} onReintentar={reintentar} botonRef={reintentarRef} />
          )}
          {datos ? (
            <div className={`${G.filas} min-w-0 motion-safe:transition-opacity ${atenuar ? 'opacity-90' : ''}`}>
              {datos.avisos.length > 0 && (
                <ul aria-label="Avisos" className="min-w-0 space-y-1.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  {datos.avisos.map((texto, i) => (
                    <li key={`${texto}-${i}`} className="flex min-w-0 items-start gap-2 text-sm text-amber-900">
                      <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700" />
                      <span className="min-w-0 break-words">{texto}</span>
                    </li>
                  ))}
                </ul>
              )}
              <FilaKpis kpis={datos.kpis} comparado={datos.periodo?.comparado} acento={acento} />
              {conFila2 && (
                <div className={G.fila2}>
                  {datos.linea && (
                    <div className={G.linea}>
                      <GraficoLinea linea={datos.linea} granularidad={granularidad} acento={acento} mejor={mejorDeLinea(datos.linea, datos.kpis, mejorLinea)} />
                    </div>
                  )}
                  {datos.donas.length > 0 && (
                    <div className={G.dona}>
                      <GraficoDona donas={datos.donas} modo={modoDona} alCambiarModo={setModoDona} etiquetar={etiquetar} />
                    </div>
                  )}
                  {datos.movimientos && (
                    <div className={G.movimientos}>
                      <ListaMovimientos movimientos={datos.movimientos} alAbrir={alAbrirMovimiento} />
                      {/* r1 (M1 y M19): desde @2xl se ven 4 filas; aquí, cuántas quedan. En una columna se ven todas. */}
                      {masMovimientos && (
                        <p className="mt-2 hidden px-4 text-xs font-semibold text-slate-600 @2xl/analisis:block">{masMovimientos}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {conFila3 && (
                <div className={G.fila3}>
                  {datos.ranking && (
                    <div className={G.ranking}>
                      <RankingTop ranking={datos.ranking} top={prefs.top} alCambiarTop={elegirTop} acento={acento} etiquetar={etiquetar} />
                    </div>
                  )}
                  {datos.barras && (
                    <div className={G.barras}>
                      <GraficoBarras barras={datos.barras} granularidad={granularidad} acento={acento} etiquetar={etiquetar} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : !aviso ? (
            <EsqueletoAnalisis barra={false} />
          ) : null}
        </div>

        {pie}
        {asistenteFinal}
      </div>
    </div>
  );
}
