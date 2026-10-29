'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lock, RefreshCw, Search } from 'lucide-react';
import type { AccentColor } from '@/components/ui/colors';
import { usePreferenciaParte } from '@/components/ui/usePreferencia';
// El usuario del token (el tope de espera de las preferencias es suyo, como useEstadoTabla de T4C r2).
import { usuarioDeLaSesion } from '@/components/tabla/usuarioDeLaSesion';
import { esperarPreferencias, listoConTope } from '@/lib/tabla';
import {
  ASISTENTE_POR_DEFECTO, ESPERA_PRODUCTO_MS, GRILLA_ANALISIS, PREFERENCIA_ANALISIS_POR_DEFECTO, clavePreferenciaAnalisis,
  leerPreferenciaAnalisis, mejorDeLinea, parametrosAnalisis, productoConsulta, resolverFoco, siguienteErrorVisto,
  textoActualizado, textoComparado,
} from '@/lib/analisis';
import type {
  ErrorAnalisis, Etiquetar, FilaMovimiento, MejorAnalisis, ModuloAnalisis, PeriodoAnalisis,
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
import { SelectorPeriodo } from './SelectorPeriodo';
import { useAnalisis } from './useAnalisis';

/**
 * ANALISIS-base puntos 2 y 3 (Bloque 4, T5C; R2, R4, R7, R13, C2, C12, C21, RP69, D35, D38 y D43): la pestaña Análisis
 * estándar. Las pantallas NO la importan directo: importan PanelAnalisisPerezoso (R13: chart.js se descarga al abrir la
 * pestaña).
 *  - Arriba: el selector de foco si llegan `focos` (Ventas: FOCOS_VENTAS, Todo / Solicitudes / Cotizaciones / Pedidos;
 *    `focoInicial`, el ?foco= de «Ver análisis», gana sobre el guardado hasta que el usuario elige otro); el selector de
 *    período con 'Comparado con …' debajo; el campo Producto (`busquedaProducto`: 400 ms y solo con 2 letras o más,
 *    RP69); `controlesExtra` (su valor llega por `params`); 'Actualizado hace …' y el botón Actualizar.
 *  - Período, top y foco se recuerdan en analisis:<modulo> con usePreferenciaParte (R4 y C2): cada cambio escribe SOLO
 *    su pieza ({periodo}, {top} o {foco}; D38) y nada se escribe antes de listo (D35); lo guardado se lee pieza por
 *    pieza (leerPreferenciaAnalisis). Mientras las preferencias no están listas (a lo sumo 4 s, el tope de
 *    esperarPreferencias de lib/tabla.js) se ve el esqueleto y no sale ninguna petición: la primera es la del período
 *    guardado. Si el navegador no deja guardar, funciona igual con 30 días.
 *  - Los datos: useAnalisis (AbortController; solo cuenta la última consulta). Mientras recarga, los datos anteriores se
 *    ven atenuados (nunca se vuelven ceros); al cambiar de foco, el esqueleto. Con un error: 'No pudimos cargar el
 *    análisis. Revisa tu conexión y vuelve a intentarlo.' con 'Reintentar' (o 'No tienes permiso para ver este
 *    análisis.'); el aviso sigue montado mientras se reintenta y, si salió bien y el foco quedó en el body, pasa a la
 *    región de los datos.
 *  - La grilla es GRILLA_ANALISIS (container queries; la raíz es @container) y la fila de KPIs es FilaKpis dentro de
 *    FranjaKpis (D43, M2), igual que EsqueletoAnalisis. Un bloque que el módulo no tiene (null) no deja celda.
 *  - La línea recibe el «mejor» del kpi de la misma cifra (mejorDeLinea; `mejorLinea` lo fija, D43 M19).
 *  - aria-busy va en la región que se actualiza (D43, M12), no en el status del esqueleto.
 *  - Al final, AsistenteEnConstruccion (R2): `asistente` o {titulo: 'Asistente con IA', ejemplos: []} (RP69).
 * Foco visible con outline (nunca outline-none). Clases de Tailwind literales, sin variantes de modo oscuro.
 */

export type FocoPanel = { clave: string; etiqueta: string };

export type PropsPanelAnalisis = {
  /** La clave de las preferencias: analisis:<modulo> (RP69: 'ventas', 'compras', 'inventario', 'crm' o 'finanzas'). */
  modulo: ModuloAnalisis;
  /** Por ejemplo '/ventas/analisis'. */
  endpoint: string;
  /** Parámetros propios de la pantalla (por ejemplo {bodega}); el foco y el producto del panel ganan sobre estos. */
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
  /** El asistente del final (R2); por defecto {titulo: 'Asistente con IA', ejemplos: []}. */
  asistente?: { titulo: string; ejemplos: ReadonlyArray<string> };
  /** El «mejor» del chip de la línea; por defecto, el del kpi de la misma cifra (mejorDeLinea). */
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
  focoInicial = null, asistente, mejorLinea,
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

  // R13: el foco de la URL gana hasta que el usuario elige otro; si la URL trae otro foco, vuelve a ganar.
  const [usarInicial, setUsarInicial] = useState(true);
  const [inicialVisto, setInicialVisto] = useState(focoInicial);
  if (focoInicial !== inicialVisto) {
    setInicialVisto(focoInicial);
    setUsarInicial(true);
  }
  const foco = resolverFoco(focos, usarInicial ? focoInicial : null, prefs.foco);

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
    extra: parametrosAnalisis(params, { foco, producto: busquedaProducto ? productoAplicado : null }),
    ambito: `${endpoint}|${foco ?? ''}`,
    esperar: !listo,
  });
  const datos = analisis.datos;

  // El aviso de error que se ve: sigue montado mientras se reintenta (siguienteErrorVisto).
  const [errorVisto, setErrorVisto] = useState<ErrorAnalisis | null>(null);
  const aviso = siguienteErrorVisto(errorVisto, { cargando: analisis.cargando, error: analisis.error });
  if (aviso !== errorVisto) setErrorVisto(aviso);
  const reintentando = aviso !== null && analisis.cargando;

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
    if (reintentando) return;
    focoPendiente.current = document.activeElement === e.currentTarget;
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
          <EsqueletoAnalisis />
          {pie}
          {asistenteFinal}
        </div>
      </div>
    );
  }

  const elegirFoco = (clave: string) => {
    setUsarInicial(false);
    guardarParte({ foco: clave });
  };
  const elegirPeriodo = (periodo: PeriodoAnalisis) => guardarParte({ periodo });
  const elegirTop = (top: TopRanking) => guardarParte({ top });

  const comparado = datos && !analisis.recargando ? textoComparado(datos.periodo) : null;
  const actualizado = datos ? textoActualizado(datos.generado_en) : '';
  const atenuar = analisis.recargando || Boolean(aviso && datos);
  const granularidad = datos?.periodo?.granularidad ?? null;
  const conFila2 = Boolean(datos && (datos.linea || datos.donas.length || datos.movimientos));
  const conFila3 = Boolean(datos && (datos.ranking || datos.barras));

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
          <SelectorPeriodo periodo={prefs.periodo} alCambiar={elegirPeriodo} comparado={comparado} periodoDatos={datos?.periodo} />
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
            {actualizado && <span className="whitespace-nowrap text-xs text-slate-600">{actualizado}</span>}
            <button type="button" onClick={analisis.recargar} className={BOTON_NEUTRO}>
              <RefreshCw size={14} aria-hidden="true" className={analisis.recargando ? 'motion-safe:animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </div>

        <div ref={regionRef} tabIndex={-1} aria-busy={analisis.cargando} aria-label="Datos del análisis" role="region" className={`${G.filas} min-w-0 rounded-2xl ${FOCO}`}>
          {aviso && (
            <AvisoError aviso={aviso} reintentando={reintentando} onReintentar={reintentar} botonRef={reintentarRef} />
          )}
          {datos ? (
            <div className={`${G.filas} min-w-0 motion-safe:transition-opacity ${atenuar ? 'opacity-60' : ''}`}>
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
