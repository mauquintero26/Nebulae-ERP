'use client';

import {
  ArcElement, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip,
} from 'chart.js';

/**
 * ANALISIS-base punto 2 (Bloque 4, T5B; R13): el ÚNICO registro de Chart.js de la app. Las piezas de components/analisis
 * (GraficoLinea, GraficoDona y GraficoBarras) llaman a registrarGraficos() al cargarse; chart.js y react-chartjs-2 solo se
 * importan aquí y en esos tres (test_graficos_centralizados.mjs).
 *  - Registra una sola vez: la marca vive en globalThis, así que ni el doble montaje de StrictMode ni una recarga en
 *    caliente del módulo vuelven a registrar ni a escuchar prefers-reduced-motion otra vez. (Los controladores Line, Bar y
 *    Doughnut los registra react-chartjs-2 con cada componente.)
 *  - Valores por defecto: la fuente de la app (la del body, Arial de globals.css), el texto de los ejes en slate-600
 *    (#475569, 7,6:1 sobre el blanco) y una animación de 400 ms, que pasa a 0 (también la de pasar el mouse) si el usuario
 *    pide menos movimiento con prefers-reduced-motion, y vuelve si lo cambia mientras la pestaña está abierta.
 *  - Los tooltips: ESTILO_TOOLTIP (fondo slate-900 y texto blanco), y cada gráfico arma sus textos con formatearValor de
 *    lib/analisis.js (pesos colombianos, fechas en español). No se cambian los tooltips globales de Chart.js: las
 *    pantallas viejas de la lista blanca (proyecciones y finanzas/resumen) comparten el mismo Chart.js.
 */

/** La duración de las animaciones de los gráficos (0 con prefers-reduced-motion). */
export const ANIMACION_MS = 400;
/** La fuente del body de la app (globals.css), por si no se puede leer del documento. */
const FUENTE_APP = 'Arial, Helvetica, sans-serif';
/** slate-600: el texto de los ejes. */
const COLOR_TEXTO = '#475569';
const CONSULTA_MOVIMIENTO = '(prefers-reduced-motion: reduce)';
const MARCA = '__nebulaeGraficosRegistrados';

/** El estilo de los tooltips de los gráficos de Análisis (se reparte en las opciones de cada uno). */
export const ESTILO_TOOLTIP = {
  backgroundColor: '#0f172a',
  titleColor: '#ffffff',
  bodyColor: '#ffffff',
  padding: 10,
  cornerRadius: 8,
  boxPadding: 4,
} as const;

/** Aplica la duración de las animaciones según prefers-reduced-motion. */
function aplicarMovimiento(reducido: boolean): void {
  const ms = reducido ? 0 : ANIMACION_MS;
  const animacion = ChartJS.defaults.animation;
  if (animacion) animacion.duration = ms;
  const activa = ChartJS.defaults.transitions?.active?.animation;
  if (activa) activa.duration = ms;
}

function fuenteDeLaApp(): string {
  if (typeof document === 'undefined' || !document.body) return FUENTE_APP;
  const familia = window.getComputedStyle(document.body).fontFamily;
  return familia && familia.trim() ? familia : FUENTE_APP;
}

/**
 * Registra las escalas, los elementos y los plugins de Chart.js, con los valores por defecto de arriba, UNA sola vez por
 * página (las llamadas siguientes no hacen nada).
 */
export function registrarGraficos(): void {
  const global = globalThis as typeof globalThis & { [MARCA]?: boolean };
  if (global[MARCA]) return;
  global[MARCA] = true;
  ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend);
  ChartJS.defaults.font.family = fuenteDeLaApp();
  ChartJS.defaults.color = COLOR_TEXTO;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    aplicarMovimiento(false);
    return;
  }
  const consulta = window.matchMedia(CONSULTA_MOVIMIENTO);
  aplicarMovimiento(consulta.matches);
  consulta.addEventListener?.('change', (evento) => aplicarMovimiento(evento.matches));
}
