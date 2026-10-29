/**
 * Las piezas puras de las pestañas Análisis (Bloque 4, T3A: ANALISIS-base punto 1, R4, R7, R13, C12, RP27, RP73 y
 * RP74). JS plano, sin React, para probarlo con node (frontend/tests/test_analisis.mjs). La usan los componentes de
 * components/analisis (T5B y T5C) sobre el contrato único de backend/app/core/analisis.py (D34):
 * {status: 'success', data: {periodo, kpis, linea, donas, barras, movimientos, ranking, filtros, avisos, generado_en}}.
 *
 *  - Períodos (PERIODOS, PERIODO_POR_DEFECTO, validarPeriodo, errorPeriodo) con la semántica y los seis textos de
 *    error de backend/app/core/periodos.py; TOPS y FOCOS_VENTAS (el selector Todo / Solicitudes / Cotizaciones /
 *    Pedidos del Hub de Ventas, R13).
 *  - El formato y la variación son los de lib/kpis.js (C12): infoVariacion aplica la regla única de RP27 con el mismo
 *    vocabulario de tono ('bien', 'mal', 'neutro'); formatearValor agrega 'dias' y 'unidades'. pesosCorto es solo
 *    para los ejes de los gráficos (las cifras van completas).
 *  - Colores de los gráficos (PALETA, GRIS_OTROS…) y la ÚNICA tabla de clases de Tailwind a hex (HEX_CLASE_TAILWIND,
 *    RP73), de la que lib/crm-etapas.js (T3C) deriva COLOR_HEX y BG_HEX.
 *  - enlaceDocumento: la ruta de cada documento (VEN = PVEN, RP74), con return_to opcional (D22).
 *  - normalizarAnalisis completa las claves que falten con null o [] y nunca rellena cifras.
 *  - T5B, lo que pintan las piezas de components/analisis: el color del módulo y de las series (colorDeAcento,
 *    conAlfa, coloresSeries), los ejes y las barras (etiquetaEje, valoresConSigno, recortarEtiqueta, altoGraficoBarras),
 *    «Sin datos en este período» (bloqueSinDatos), el resumen de cada gráfico (resumenAccesible), el ranking
 *    (proporcionesRanking), los movimientos (MAX_MOVIMIENTOS, montoMovimiento, iconoMovimiento), el total de la dona
 *    (tamanoCentroDona) y la grilla de container queries (GRILLA_ANALISIS).
 * No lee ni escribe el almacenamiento (R4): el período, el top y el foco se guardan en analisis:<modulo> con
 * lib/preferencias.js (PanelAnalisis, T5C).
 */

import { congelar, tiene } from './estados-pedido.js';
import { diaColombia } from './fechas-colombia.js';
import { formatoPesos } from './pesos.js';
import {
  variacionPct, textoVariacion, direccionVariacion, tonoDeDireccion, mejorDesde, formatoValorKpi, formatoEntero,
  formatoDecimal, ETIQUETAS_PERIODO,
} from './kpis.js';

/**
 * @typedef {'7d' | '30d' | '90d' | 'mes' | '12m' | 'personalizado'} ClavePeriodo
 * @typedef {{clave: ClavePeriodo, desde?: string, hasta?: string}} PeriodoAnalisis
 * @typedef {'hub' | 'sc' | 'cot' | 'pven'} ClaveFoco
 * @typedef {{texto: string, tono: 'bien' | 'mal' | 'neutro', flecha: 'sube' | 'baja' | null, lector: string}} InfoVariacion
 * @typedef {'pesos' | 'entero' | 'numero' | 'porcentaje' | 'dias' | 'unidades' | 'texto'} FormatoAnalisis
 */

/**
 * Los bloques del contrato como los leen las piezas de components/analisis (T5B), después de normalizarAnalisis.
 * @typedef {'dia' | 'semana' | 'mes'} Granularidad
 * @typedef {'sube' | 'baja' | 'neutro'} MejorAnalisis
 * @typedef {{clave?: string | null, etiqueta?: string | null, valores: ReadonlyArray<number | string | null>, es_anterior?: boolean}} SerieLinea
 * @typedef {{titulo?: string | null, formato?: FormatoAnalisis | null, fechas: ReadonlyArray<string>, series: ReadonlyArray<SerieLinea>,
 *   total?: number | null, total_anterior?: number | null, variacion_pct?: number | null}} LineaAnalisis
 * @typedef {{clave: string, etiqueta?: string | null, valor: number | string | null, pct?: number | null, color?: string | null}} SegmentoDona
 * @typedef {{clave?: string | null, titulo?: string | null, formato?: FormatoAnalisis | null, total?: number | null,
 *   segmentos: ReadonlyArray<SegmentoDona>}} DonaAnalisis
 * @typedef {'positivo' | 'negativo' | 'neutro'} TonoSerie
 * Una serie de barras con tono 'negativo' se DIBUJA hacia abajo (valoresConSigno: −|v|), y el tooltip, la tabla sr-only y
 * el resumen accesible leen ese mismo valor dibujado, el que lee el eje (T5B r1, M18): da igual si el servidor manda
 * magnitudes (Inventario: salidas 5) o valores con signo (Finanzas: −400); una salida se lee '-5 u.' o '-$400'.
 * @typedef {{clave?: string | null, etiqueta?: string | null, valores: ReadonlyArray<number | string | null>, tono?: TonoSerie | null,
 *   color?: string | null}} SerieBarras
 * @typedef {{titulo?: string | null, formato?: FormatoAnalisis | null, eje?: 'fechas' | 'categorias' | null,
 *   etiquetas: ReadonlyArray<string>, series: ReadonlyArray<SerieBarras>, apiladas?: boolean | null}} BarrasAnalisis
 * @typedef {{tipo?: string | null, numero?: string | null, titulo?: string | null, detalle?: string | null,
 *   fecha?: string | null, monto?: number | string | null, formato?: FormatoAnalisis | null, signo?: '+' | '-' | null,
 *   estado_etiqueta?: string | null, doc_tipo?: string | null, doc_id?: number | string | null}} FilaMovimiento
 * @typedef {{titulo?: string | null, filas: ReadonlyArray<FilaMovimiento>}} MovimientosAnalisis
 * @typedef {{posicion?: number | null, nombre?: string | null, detalle?: string | null, valor?: number | string | null,
 *   cantidad?: number | null, pct?: number | null}} FilaRanking
 * @typedef {{titulo?: string | null, columna?: string | null, formato?: FormatoAnalisis | null,
 *   filas: ReadonlyArray<FilaRanking>}} RankingAnalisis
 * @typedef {(bloque: 'dona' | 'ranking' | 'barras', clave: string, etiqueta: string) => string} Etiquetar
 */

// ─── períodos, tops y focos ─────────────────────────────────────────────────────

/**
 * Los períodos del selector, en su orden, con los textos de ETIQUETAS_PERIODO de lib/kpis.js (los de ETIQUETAS de
 * core/periodos.py; una sola tabla: etiquetaKpi usa la misma). Inmutable.
 * @type {ReadonlyArray<Readonly<{clave: ClavePeriodo, etiqueta: string}>>}
 */
export const PERIODOS = congelar(
  /** @type {ClavePeriodo[]} */ (['7d', '30d', '90d', 'mes', '12m', 'personalizado'])
    .map((clave) => ({ clave, etiqueta: ETIQUETAS_PERIODO[clave] })),
);
const CLAVES_PERIODO = PERIODOS.map((p) => p.clave);

/**
 * periodo_comparacion = «Últimos 30 días contra los 30 anteriores». Inmutable.
 * @type {Readonly<PeriodoAnalisis>}
 */
export const PERIODO_POR_DEFECTO = congelar({ clave: '30d' });
/**
 * Los tamaños del ranking (validar_top del servidor). Inmutable.
 * @type {ReadonlyArray<5 | 10 | 25>}
 */
export const TOPS = congelar([5, 10, 25]);
/**
 * El foco del Análisis del Hub de Ventas (R13; se recuerda en analisis:ventas). Inmutable.
 * @type {ReadonlyArray<Readonly<{clave: ClaveFoco, etiqueta: string}>>}
 */
export const FOCOS_VENTAS = congelar([
  { clave: 'hub', etiqueta: 'Todo' },
  { clave: 'sc', etiqueta: 'Solicitudes' },
  { clave: 'cot', etiqueta: 'Cotizaciones' },
  { clave: 'pven', etiqueta: 'Pedidos' },
]);
/** El largo máximo de un período personalizado, en días con las dos puntas (MAX_DIAS del servidor). */
export const MAX_DIAS = 731;

/** Los seis textos de error de un período, iguales a ERRORES de backend/app/core/periodos.py. Inmutable. */
export const ERRORES_PERIODO = congelar({
  periodo: 'Período no válido.',
  sin_fechas: 'Elige la fecha inicial y la final.',
  formato: 'Las fechas deben tener el formato AAAA-MM-DD.',
  orden: 'La fecha inicial debe ser anterior o igual a la final.',
  futuro: 'La fecha final no puede ser posterior a hoy.',
  largo: 'El período no puede ser mayor a 2 años.',
});

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Los milisegundos UTC de un 'AAAA-MM-DD' que existe (no '2026-02-30'), o null. */
function diaUTC(texto) {
  const m = FECHA.exec(texto);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(anio, mes - 1, dia);
  const f = new Date(t);
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia ? t : null;
}

const vacio = (v) => v === null || v === undefined || (typeof v === 'string' && !v.trim());

/**
 * El texto del error de un período (el mismo que daría el 422 del servidor), o null si vale. `periodo` es
 * {clave, desde?, hasta?} o la clave sola; las fechas solo cuentan en 'personalizado' y deben ser 'AAAA-MM-DD', con
 * desde ≤ hasta, hasta ≤ hoy (día de Colombia) y a lo sumo 731 días. `hoy` es 'AAAA-MM-DD' (por defecto, diaColombia()).
 * @param {PeriodoAnalisis | ClavePeriodo | null | undefined} periodo
 * @param {string} [hoy]
 * @returns {string | null}
 */
export function errorPeriodo(periodo, hoy = diaColombia()) {
  const p = /** @type {any} */ (periodo);
  const clave = typeof p === 'string' ? p : p?.clave;
  if (!CLAVES_PERIODO.includes(clave)) return ERRORES_PERIODO.periodo;
  if (clave !== 'personalizado') return null;
  const desde = typeof p === 'object' ? p.desde : undefined;
  const hasta = typeof p === 'object' ? p.hasta : undefined;
  if (vacio(desde) || vacio(hasta)) return ERRORES_PERIODO.sin_fechas;
  const d = diaUTC(String(desde).trim());
  const h = diaUTC(String(hasta).trim());
  if (d === null || h === null) return ERRORES_PERIODO.formato;
  if (d > h) return ERRORES_PERIODO.orden;
  const hoyUTC = diaUTC(String(hoy ?? ''));
  if (hoyUTC !== null && h > hoyUTC) return ERRORES_PERIODO.futuro;
  if ((h - d) / 86400000 + 1 > MAX_DIAS) return ERRORES_PERIODO.largo;
  return null;
}

/**
 * El mismo período si vale (errorPeriodo da null), o null. Un período guardado que ya no vale (por ejemplo, con una
 * fecha que pasó a ser futura en otro equipo) vuelve así al de por defecto en la pantalla.
 * @template {PeriodoAnalisis | ClavePeriodo} P
 * @param {P | null | undefined} periodo
 * @param {string} [hoy]
 * @returns {P | null}
 */
export function validarPeriodo(periodo, hoy) {
  return periodo !== null && periodo !== undefined && errorPeriodo(periodo, hoy) === null ? periodo : null;
}

/** Un valor de la consulta como texto, o null si se omite (null, undefined, '' o NaN). */
function valorConsulta(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) {
    const partes = v.map(valorConsulta).filter((x) => x !== null);
    return partes.length ? partes.join(',') : null;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

const RESERVADAS_CONSULTA = ['periodo', 'desde', 'hasta', 'top'];

/**
 * La consulta de un endpoint de Análisis, sin '?': 'periodo=30d&top=5&foco=hub'. desde y hasta solo van en
 * 'personalizado'; los extra vacíos (null, undefined, '') se omiten y no pisan periodo, desde, hasta ni top.
 * @param {PeriodoAnalisis | ClavePeriodo | null | undefined} periodo
 * @param {number | null | undefined} top
 * @param {Record<string, unknown>} [extra]
 * @returns {string}
 */
export function consultaAnalisis(periodo, top, extra = {}) {
  const p = /** @type {any} */ (periodo);
  const clave = typeof p === 'string' ? p : p?.clave;
  /** @type {[string, unknown][]} */
  const pares = [['periodo', clave]];
  if (clave === 'personalizado') pares.push(['desde', p?.desde], ['hasta', p?.hasta]);
  pares.push(['top', top]);
  for (const [k, v] of Object.entries(extra ?? {})) if (!RESERVADAS_CONSULTA.includes(k)) pares.push([k, v]);
  return pares
    .map(([k, v]) => [k, valorConsulta(v)])
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${encodeURIComponent(/** @type {string} */ (k))}=${encodeURIComponent(/** @type {string} */ (v))}`)
    .join('&');
}

// ─── variación y formato (sobre lib/kpis.js) ────────────────────────────────────

const SIN_VARIACION = (lector) => ({ texto: '—', tono: /** @type {const} */ ('neutro'), flecha: null, lector });

/**
 * La variación de un indicador del contrato, con la regla única de RP27 (la misma de la tarjeta):
 *  - es_foto -> 'Hoy'; anterior null -> '—'; anterior 0 y actual 0 -> 'Sin cambio'; anterior 0 y actual distinto de
 *    0 -> 'Nuevo'; si no, '+12,5 %' o '−3 %' (y 'Sin cambio' si da 0).
 *  - flecha 'sube' | 'baja' | null y tono 'bien' | 'mal' | 'neutro' según `mejor` ('sube': subir es bueno; 'baja':
 *    bajar es bueno; 'neutro': siempre neutro), con direccionVariacion y tonoDeDireccion de lib/kpis.js: la misma
 *    regla de la tarjeta, también para 'Nuevo' (su dirección es el signo del valor actual).
 *  - lector: el texto para lectores de pantalla ('Sube 12,5 % frente al período anterior'); `frente` cambia el final.
 * Calcula con variacionPct(valor, anterior): no lee variacion_pct, cuyo None no distingue 'Nuevo' de «sin
 * comparación».
 * @param {{valor?: unknown, anterior?: unknown, mejor?: unknown, es_foto?: boolean} | null | undefined} kpi
 * @param {{frente?: string}} [opciones]
 * @returns {InfoVariacion}
 */
export function infoVariacion(kpi, { frente = 'frente al período anterior' } = {}) {
  const k = kpi ?? {};
  if (k.es_foto) return { texto: 'Hoy', tono: 'neutro', flecha: null, lector: 'Cifra de hoy, sin comparación' };
  if (k.anterior === null || k.anterior === undefined) return SIN_VARIACION('Sin comparación con el período anterior');
  const v = variacionPct(k.valor, k.anterior);
  if (!v) return SIN_VARIACION('Sin comparación con el período anterior');
  const flecha = direccionVariacion(v);
  const tono = tonoDeDireccion(flecha, mejorDesde(k.mejor));
  const texto = textoVariacion(v);
  let lector;
  if (v.tipo === 'nuevo') lector = 'Nuevo: antes era 0';
  else if (!flecha) lector = `Sin cambio ${frente}`;
  else lector = `${flecha === 'sube' ? 'Sube' : 'Baja'} ${formatoValorKpi(Math.abs(/** @type {any} */ (v).pct), 'porcentaje')} ${frente}`;
  return { texto, tono, flecha, lector };
}

/**
 * Un valor del contrato como se ve: los formatos de formatoValorKpi ('pesos', 'entero' o 'numero', 'porcentaje',
 * 'texto') más 'dias' ('3,5 días', '1 día') y 'unidades' ('1.234 u.'). null o lo que no es número da '—': nunca
 * inventa un número.
 * @param {unknown} valor
 * @param {FormatoAnalisis} formato
 * @returns {string}
 */
export function formatearValor(valor, formato) {
  if (formato === 'dias') {
    const texto = formatoDecimal(valor === '' ? null : valor);
    return texto === '—' ? texto : `${texto} ${texto === '1' ? 'día' : 'días'}`;
  }
  if (formato === 'unidades') {
    const texto = formatoEntero(valor === '' ? null : valor);
    return texto === '—' ? texto : `${texto} u.`;
  }
  return formatoValorKpi(valor, formato);
}

const redondearDecimal = (x) => Math.round(x * 10) / 10;

/**
 * Pesos abreviados, SOLO para los ejes de los gráficos: '$4,9 M', '$12 M', '$1,5 mil M', '$450 mil', '$4,5 mil',
 * '$900', '-$2,5 M'. Lo que no es número da '—'.
 * @param {unknown} v
 * @returns {string}
 */
export function pesosCorto(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a < 999.5) return formatoPesos(n);
  const signo = n < 0 ? '-' : '';
  if (redondearDecimal(a / 1e9) >= 1) return `${signo}$${formatoDecimal(a / 1e9)} mil M`;
  if (redondearDecimal(a / 1e6) >= 1) return `${signo}$${formatoDecimal(a / 1e6)} M`;
  return `${signo}$${formatoDecimal(a / 1e3)} mil`;
}

/** El número de `v` si es finito (también un número en texto, como un Decimal del API), o null. */
function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * La marca del eje de valores de un gráfico: pesosCorto para 'pesos' ('$4,9 M'), '45 %' para 'porcentaje' y, para los
 * demás formatos, el número con a lo sumo 1 decimal y los miles con punto ('1.234', '2,5'; sin la unidad).
 * @param {unknown} valor
 * @param {FormatoAnalisis | null | undefined} formato
 * @returns {string}
 */
export function etiquetaEje(valor, formato) {
  if (formato === 'pesos') return pesosCorto(valor);
  if (formato === 'porcentaje') return formatoValorKpi(valor, 'porcentaje');
  return formatoDecimal(valor);
}

/**
 * Los valores de una serie de barras como se dibujan: con tono 'negativo', hacia abajo (−|v|, como el flujo de caja de
 * la referencia; 0 sigue en 0); con otro tono, tal cual. Lo que no es un número queda en null (un hueco, no un 0).
 * @param {{tono?: unknown, valores?: unknown} | null | undefined} serie
 * @returns {Array<number | null>}
 */
export function valoresConSigno(serie) {
  const s = esObjeto(serie) ? /** @type {any} */ (serie) : {};
  const negativo = s.tono === 'negativo';
  return lista(s.valores).map((v) => {
    const n = numero(v);
    if (n === null) return null;
    if (n === 0) return 0; // también −0 (rellenar del servidor manda −0.0 en una cubeta vacía): nunca −0
    return negativo ? -Math.abs(n) : n;
  });
}

/**
 * Una etiqueta de categoría recortada para el eje ('Distribuidora Nac…'): a lo sumo `maximo` caracteres contando el
 * '…', sin espacios al final. El tooltip y la tabla para lectores de pantalla llevan la completa.
 * @param {unknown} texto
 * @param {number} [maximo]
 * @returns {string}
 */
export function recortarEtiqueta(texto, maximo = 18) {
  const limpio = texto === null || texto === undefined ? '' : String(texto).trim();
  const letras = Array.from(limpio);
  if (letras.length <= maximo) return limpio;
  return `${letras.slice(0, Math.max(1, maximo - 1)).join('').trimEnd()}…`;
}

/**
 * El alto en px del gráfico de barras: 256 con el eje de fechas (barras verticales, como la línea); con 'categorias'
 * (barras horizontales), 32 px por categoría más 48, entre 160 y 480.
 * @param {unknown} eje
 * @param {number} n
 * @returns {number}
 */
export function altoGraficoBarras(eje, n) {
  if (eje !== 'categorias') return 256;
  const cuantas = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  return Math.min(480, Math.max(160, cuantas * 32 + 48));
}

const MESES_CORTOS = congelar(['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']);

/**
 * La etiqueta de una cubeta 'AAAA-MM-DD' (día de Colombia del contrato): 'dia' -> '4 sept'; 'semana' -> 'Sem. 1 sept';
 * 'mes' -> 'sept 2026'. Los meses salen de una tabla propia (los mismos de core/periodos.py), no de Intl, y la fecha
 * se lee por partes, sin zona horaria: un 31 de diciembre no se corre de día. Lo que no es una fecha sale tal cual.
 * @param {unknown} fecha
 * @param {'dia' | 'semana' | 'mes'} granularidad
 * @returns {string}
 */
export function etiquetaFecha(fecha, granularidad) {
  const texto = fecha === null || fecha === undefined ? '' : String(fecha).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  const mes = m ? MESES_CORTOS[Number(m[2]) - 1] : undefined;
  if (!m || !mes) return texto;
  const dia = Number(m[3]);
  if (granularidad === 'mes') return `${mes} ${m[1]}`;
  if (granularidad === 'semana') return `Sem. ${dia} ${mes}`;
  return `${dia} ${mes}`;
}

// ─── colores ────────────────────────────────────────────────────────────────────

/**
 * Los colores de los segmentos de la dona, en orden fijo (cada segmento lleva su texto en la leyenda; las series de la
 * línea y las barras usan PALETA_SERIES). Inmutable.
 */
export const PALETA = congelar(['#4f46e5', '#0d9488', '#f59e0b', '#0ea5e9', '#8b5cf6', '#e11d48', '#65a30d', '#64748b']);
/** 'Otros' y los segmentos 'Sin …' de la dona; en las series, solo la clave '_otros'. */
export const GRIS_OTROS = '#cbd5e1';
/** La serie del período anterior: slate-500 (4,76:1 sobre el blanco; T5B r1, antes slate-400 con 2,56:1), punteada. */
export const COLOR_ANTERIOR = '#64748b';
export const POSITIVO = '#059669';
export const NEGATIVO = '#e11d48';

/**
 * Los colores de las series de la línea y de las barras desde la 2.ª principal (T5B r1, M14 y M15): indigo-600,
 * sky-600, amber-600, fuchsia-700, lime-700 y pink-800. Todos llegan a 3:1 sobre el blanco (una línea de 2 px o una
 * barra, WCAG 1.4.11) y se distinguen entre sí y de POSITIVO y NEGATIVO (distanciaColor ≥ DISTANCIA_MINIMA_COLOR).
 * Inmutable.
 */
export const PALETA_SERIES = congelar(['#4f46e5', '#0284c7', '#d97706', '#a21caf', '#4d7c0f', '#9d174d']);
/** Por debajo de esta distancia (ΔE CIE76) dos colores de serie se confunden: amber-600 y amber-500 dan 17,7. */
export const DISTANCIA_MINIMA_COLOR = 25;

/** [L, a, b] (CIELAB, D65) de un '#rrggbb' o '#rgb', o null. */
function lab(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(typeof hex === 'string' ? hex.trim() : '');
  if (!m) return null;
  const cifras = m[1].length === 3 ? [...m[1]].map((c) => c + c) : [m[1].slice(0, 2), m[1].slice(2, 4), m[1].slice(4, 6)];
  const [r, g, b] = cifras.map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/**
 * La distancia entre dos colores (ΔE CIE76: la distancia en CIELAB; 0 = el mismo, 100 = del blanco al negro). Lo que no
 * es un hex da Infinity (nunca está «cerca»).
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
export function distanciaColor(a, b) {
  const p = lab(a);
  const q = lab(b);
  if (!p || !q) return Infinity;
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/**
 * La ÚNICA tabla de clases de Tailwind a hex (RP73): las 12 de COLOR_HEX de crm/page.tsx más 'bg-red-500' (la etapa
 * «Perdido»), y sus fondos -50 (BG_HEX) más 'bg-red-50'. Los hex son los de hoy en el CRM (por ejemplo
 * 'bg-emerald-50': '#f0fdf4'), para que no cambie de color al adoptarla. lib/crm-etapas.js (T3C) deriva de aquí
 * COLOR_HEX y BG_HEX (las -500 y las -50). T5B agrega las -600 de los 9 AccentColor de components/ui/colors.ts (el
 * color del módulo en los gráficos, colorDeAcento): una línea de 2 px necesita 3:1 sobre el blanco y las -500 de
 * amber, emerald, teal y orange no llegan. Inmutable.
 * @type {Readonly<Record<string, string>>}
 */
export const HEX_CLASE_TAILWIND = congelar({
  'bg-blue-500': '#3b82f6', 'bg-cyan-500': '#06b6d4', 'bg-indigo-500': '#6366f1',
  'bg-emerald-500': '#10b981', 'bg-amber-500': '#f59e0b', 'bg-rose-500': '#f43f5e',
  'bg-purple-500': '#a855f7', 'bg-slate-500': '#64748b', 'bg-green-500': '#22c55e',
  'bg-teal-500': '#14b8a6', 'bg-orange-500': '#f97316', 'bg-pink-500': '#ec4899',
  'bg-red-500': '#ef4444',
  'bg-blue-50': '#eff6ff', 'bg-cyan-50': '#ecfeff', 'bg-indigo-50': '#eef2ff',
  'bg-emerald-50': '#f0fdf4', 'bg-amber-50': '#fffbeb', 'bg-rose-50': '#fff1f2',
  'bg-purple-50': '#faf5ff', 'bg-slate-50': '#f8fafc', 'bg-green-50': '#f0fdf4',
  'bg-teal-50': '#f0fdfa', 'bg-orange-50': '#fff7ed', 'bg-pink-50': '#fdf2f8',
  'bg-red-50': '#fef2f2',
  'bg-amber-600': '#d97706', 'bg-rose-600': '#e11d48', 'bg-orange-600': '#ea580c',
  'bg-indigo-600': '#4f46e5', 'bg-purple-600': '#9333ea', 'bg-emerald-600': '#059669',
  'bg-blue-600': '#2563eb', 'bg-teal-600': '#0d9488', 'bg-red-600': '#dc2626',
});

/**
 * El hex de una clase de Tailwind de HEX_CLASE_TAILWIND ('bg-blue-500' -> '#3b82f6'); una desconocida da '#94a3b8'.
 * @param {unknown} clase
 * @returns {string}
 */
export function hexDeClaseTailwind(clase) {
  const c = typeof clase === 'string' ? clase.trim() : '';
  return tiene(HEX_CLASE_TAILWIND, c) ? HEX_CLASE_TAILWIND[c] : '#94a3b8';
}

/**
 * El color del segmento (o la serie) `i`: seg.color si viene (un '#hex' tal cual o una clase de Tailwind con
 * hexDeClaseTailwind); GRIS_OTROS para '_otros' (core/analisis.segmentos) y los 'Sin …'; si no, PALETA en orden.
 * @param {number} i
 * @param {{clave?: unknown, etiqueta?: unknown, color?: unknown} | null} [seg]
 * @returns {string}
 */
export function colorSegmento(i, seg) {
  const color = typeof seg?.color === 'string' ? seg.color.trim() : '';
  if (color) return color.startsWith('#') ? color : hexDeClaseTailwind(color);
  const clave = typeof seg?.clave === 'string' ? seg.clave : '';
  const etiqueta = typeof seg?.etiqueta === 'string' ? seg.etiqueta.trim() : '';
  if (clave === '_otros' || clave.startsWith('_sin') || /^Sin\s/.test(etiqueta)) return GRIS_OTROS;
  const n = Number.isInteger(i) ? i : 0;
  return PALETA[((n % PALETA.length) + PALETA.length) % PALETA.length];
}

/**
 * El color del módulo (un AccentColor de components/ui/colors.ts: 'indigo', 'amber'…) como hex, para Chart.js: el -600
 * de HEX_CLASE_TAILWIND (el de ACCENTS.buttonBg). Sin acento o con uno desconocido, PALETA[0] (el índigo de Ventas).
 * @param {unknown} acento
 * @returns {string}
 */
export function colorDeAcento(acento) {
  const clase = typeof acento === 'string' ? `bg-${acento.trim()}-600` : '';
  return tiene(HEX_CLASE_TAILWIND, clase) ? HEX_CLASE_TAILWIND[clase] : PALETA[0];
}

/**
 * Un '#rrggbb' (o '#rgb') como 'rgba(r, g, b, alfa)', con alfa entre 0 y 1 (el degradado del área de la línea). Lo que
 * no es un hex sale tal cual.
 * @param {unknown} hex
 * @param {number} alfa
 * @returns {string}
 */
export function conAlfa(hex, alfa) {
  const texto = typeof hex === 'string' ? hex.trim() : '';
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(texto);
  if (!m) return /** @type {string} */ (hex);
  const cifras = m[1].length === 3 ? [...m[1]].map((c) => c + c) : [m[1].slice(0, 2), m[1].slice(2, 4), m[1].slice(4, 6)];
  const [r, g, b] = cifras.map((c) => parseInt(c, 16));
  const a = Math.min(1, Math.max(0, Number.isFinite(alfa) ? alfa : 1));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * El color de cada serie de la línea o de las barras, en su orden (T5B r1: ya no pasa por colorSegmento, la regla de la
 * dona; una serie «Sin cotización» no sale en gris):
 *  - la del período anterior (es_anterior) en COLOR_ANTERIOR; tono 'positivo' en POSITIVO y 'negativo' en NEGATIVO;
 *  - la clave '_otros' en GRIS_OTROS (el único gris);
 *  - un color propio (serie.color: un '#hex' o una clase de Tailwind) gana en cualquier principal;
 *  - la primera principal en `colorModulo` (colorDeAcento; por defecto PALETA_SERIES[0], el índigo de Ventas);
 *  - las demás, PALETA_SERIES en orden, saltando los colores iguales o muy cercanos (distanciaColor <
 *    DISTANCIA_MINIMA_COLOR) a `colorModulo`, a POSITIVO y a NEGATIVO. Si se acaban, vuelve a empezar.
 * @param {ReadonlyArray<{es_anterior?: unknown, tono?: unknown, clave?: unknown, etiqueta?: unknown, color?: unknown} | null> | null | undefined} series
 * @param {string} [colorModulo]
 * @returns {string[]}
 */
export function coloresSeries(series, colorModulo = PALETA_SERIES[0]) {
  const evitar = [colorModulo, POSITIVO, NEGATIVO];
  const disponibles = PALETA_SERIES.filter((c) => evitar.every((e) => distanciaColor(c, e) >= DISTANCIA_MINIMA_COLOR));
  const paleta = disponibles.length ? disponibles : PALETA_SERIES;
  let principal = 0;
  return lista(series).map((s) => {
    const serie = esObjeto(s) ? s : {};
    if (serie.es_anterior === true) return COLOR_ANTERIOR;
    if (serie.tono === 'positivo') return POSITIVO;
    if (serie.tono === 'negativo') return NEGATIVO;
    if (serie.clave === '_otros') return GRIS_OTROS;
    const k = principal;
    principal += 1;
    const propio = typeof serie.color === 'string' ? serie.color.trim() : '';
    if (propio) return propio.startsWith('#') ? propio : hexDeClaseTailwind(propio);
    return k === 0 ? colorModulo : paleta[(k - 1) % paleta.length];
  });
}

// ─── enlaces ────────────────────────────────────────────────────────────────────

/**
 * La ruta del documento `tipo` con `id` (los movimientos y el ranking de Análisis, los bloqueos de los tableros):
 * SC, COT, PVEN (o VEN, el mismo tipo: RP74), PEC (?id=), ENINV, GASTO y KARDEX (estos dos, a su lista). Otro tipo, o
 * un documento sin id, da null. Con `returnTo`, agrega ?return_to= (o &return_to=) para volver a la lista (D22).
 * @param {unknown} tipo
 * @param {unknown} id
 * @param {{returnTo?: string | null}} [opciones]
 * @returns {string | null}
 */
export function enlaceDocumento(tipo, id, { returnTo = null } = {}) {
  const t = typeof tipo === 'string' ? tipo.trim().toUpperCase() : '';
  const sinId = id === null || id === undefined || id === '';
  const conId = (base) => (sinId ? null : `${base}/${encodeURIComponent(String(id))}`);
  let ruta;
  switch (t) {
    case 'SC': ruta = conId('/dashboard/ventas/solicitud'); break;
    case 'COT': ruta = conId('/dashboard/ventas/cotizacion'); break;
    case 'PVEN':
    case 'VEN': ruta = conId('/dashboard/ventas/venta'); break;
    case 'PEC': ruta = sinId ? null : `/dashboard/compras/pedidos?id=${encodeURIComponent(String(id))}`; break;
    case 'ENINV': ruta = conId('/dashboard/compras/recepciones'); break;
    case 'GASTO': ruta = '/dashboard/finanzas/gastos'; break;
    case 'KARDEX': ruta = '/dashboard/inventario/kardex'; break;
    default: return null;
  }
  if (!ruta || !returnTo) return ruta;
  return `${ruta}${ruta.includes('?') ? '&' : '?'}return_to=${encodeURIComponent(returnTo)}`;
}

// ─── las piezas de la pestaña (T5B: components/analisis) ────────────────────────

/** Las filas que muestra ListaMovimientos, como mucho (ANALISIS-base punto 2). */
export const MAX_MOVIMIENTOS = 8;

/**
 * El ícono (un nombre de lucide-react) de un movimiento por su tipo: SC, COT, PVEN o VEN, PAGO, PEC, ENINV, GASTO,
 * DEVOLUCION, ENTRADA, SALIDA, AJUSTE, TRASLADO, KARDEX y LEAD. ListaMovimientos traduce cada nombre a su componente
 * (test_analisis.mjs comprueba que su mapa tenga exactamente estos y que existan en el lucide-react instalado). Un tipo
 * nuevo se agrega aquí. Inmutable.
 * @type {Readonly<Record<string, string>>}
 */
export const ICONOS_MOVIMIENTO = congelar({
  SC: 'ClipboardList', COT: 'FileText', PVEN: 'ShoppingBag', VEN: 'ShoppingBag', PAGO: 'Wallet', PEC: 'ShoppingCart',
  ENINV: 'PackageCheck', GASTO: 'Receipt', DEVOLUCION: 'Undo2', ENTRADA: 'PackagePlus', SALIDA: 'PackageMinus',
  AJUSTE: 'SlidersHorizontal', TRASLADO: 'ArrowLeftRight', KARDEX: 'Package', LEAD: 'Users',
});
/** El ícono de un movimiento cuyo tipo no está en ICONOS_MOVIMIENTO. */
export const ICONO_MOVIMIENTO_POR_DEFECTO = 'Circle';

/** 'Devolución ' -> 'DEVOLUCION' (sin tildes ni espacios, en mayúsculas). */
const claveTipo = (v) => (typeof v === 'string' ? v.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() : '');

/**
 * El nombre del ícono de un movimiento: el de su tipo (fila.tipo) y, si no está, el de su documento (fila.doc_tipo), sin
 * importar mayúsculas ni tildes; si ninguno está en ICONOS_MOVIMIENTO, ICONO_MOVIMIENTO_POR_DEFECTO.
 * @param {{tipo?: unknown, doc_tipo?: unknown} | null | undefined} fila
 * @returns {string}
 */
export function iconoMovimiento(fila) {
  for (const valor of [fila?.tipo, fila?.doc_tipo]) {
    const clave = claveTipo(valor);
    if (tiene(ICONOS_MOVIMIENTO, clave)) return ICONOS_MOVIMIENTO[clave];
  }
  return ICONO_MOVIMIENTO_POR_DEFECTO;
}

/**
 * El monto de un movimiento como se ve, con su tono (el contrato manda monto, formato y signo '+' | '-' | null):
 *  - signo '+': '+$1.500.000' y 'positivo'; signo '-': '-$1.500.000' (el menos de formatoPesos) y 'negativo'; el monto
 *    se toma por su tamaño, así que no sale un doble signo;
 *  - sin signo: formatearValor tal cual y 'neutro'. Formato por defecto: 'pesos'.
 *  - una magnitud que se ve como 0 ('$0', '0 u.'; también 0,4 pesos): ese 0, sin signo y en 'neutro', con cualquier
 *    signo (T5B r1, M23: ni '+$0' en verde ni un '$0' rojo sin su menos).
 *  - sin monto (null o lo que no es número): '—' y 'neutro'; nunca inventa un monto.
 * @param {{monto?: unknown, formato?: FormatoAnalisis | null, signo?: unknown} | null | undefined} fila
 * @returns {{texto: string, tono: 'positivo' | 'negativo' | 'neutro'}}
 */
export function montoMovimiento(fila) {
  const n = numero(fila?.monto);
  if (n === null) return { texto: '—', tono: 'neutro' };
  const formato = fila?.formato || 'pesos';
  const cero = formatearValor(0, formato);
  if (formatearValor(Math.abs(n), formato) === cero) return { texto: cero, tono: 'neutro' };
  if (fila?.signo === '+') return { texto: `+${formatearValor(Math.abs(n), formato)}`, tono: 'positivo' };
  if (fila?.signo === '-') return { texto: formatearValor(n === 0 ? 0 : -Math.abs(n), formato), tono: 'negativo' };
  return { texto: formatearValor(n, formato), tono: 'neutro' };
}

/**
 * El ancho (0 a 100, con 1 decimal) de la barra proporcional de cada fila del ranking: su valor contra el mayor. Un
 * negativo queda sin barra (Math.max(0, n); T5B r1 M22: con |n|, el último puesto podía tener la barra más larga). Si
 * todo es 0, negativo o no es número, todas en 0.
 * @param {ReadonlyArray<{valor?: unknown} | null> | null | undefined} filas
 * @returns {number[]}
 */
export function proporcionesRanking(filas) {
  const tamanos = lista(filas).map((f) => Math.max(0, numero(f?.valor) ?? 0));
  const mayor = Math.max(0, ...tamanos);
  return tamanos.map((t) => (mayor > 0 ? Math.round((t / mayor) * 1000) / 10 : 0));
}

/**
 * El tamaño de letra del total en el hueco de la dona, que va en UNA línea: 'text-xl' hasta 8 caracteres, 'text-lg'
 * hasta 10 ('$4.927.538'), 'text-sm' hasta 12 ('$123.456.789') y 'text-xs' desde 13 ('$98.765.432.109'). Medido en
 * Chromium con el CSS real: el hueco de la dona de 176 px mide unos 120 px y '$123.456.789' en text-base ya no cabía
 * (clases literales de Tailwind).
 * @param {unknown} texto
 * @returns {'text-xl' | 'text-lg' | 'text-sm' | 'text-xs'}
 */
export function tamanoCentroDona(texto) {
  const n = String(texto ?? '').length;
  if (n <= 8) return 'text-xl';
  if (n <= 10) return 'text-lg';
  if (n <= 12) return 'text-sm';
  return 'text-xs';
}

/**
 * La grilla de la pestaña Análisis (ANALISIS-base punto 3), con container queries de Tailwind v4: la raíz del panel es
 * @container y las filas miden su ancho, no el de la pantalla. Clases LITERALES (el compilador las ve en este archivo).
 * La usan EsqueletoAnalisis (T5B) y PanelAnalisis (T5C), para que el esqueleto y el panel coincidan.
 *  - Fila 1 (KPIs): la de FranjaKpis, clasesFranja(n) de lib/kpis.js (R12), en su propio @container.
 *  - Fila 2: la línea a todo el ancho hasta @5xl y desde ahí 6/12, con la dona (3/12) y los movimientos (3/12); entre
 *    @2xl y @5xl, la dona y los movimientos lado a lado debajo de la línea.
 *  - Fila 3: el ranking (5/12) y las barras (7/12) lado a lado desde @5xl.
 * Cada celda lleva min-w-0: un <canvas> no ensancha su columna. Inmutable.
 */
export const GRILLA_ANALISIS = congelar({
  raiz: '@container',
  filas: 'flex flex-col gap-4',
  fila2: 'grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-12',
  linea: 'min-w-0 @2xl:col-span-2 @5xl:col-span-6',
  dona: 'min-w-0 @5xl:col-span-3',
  movimientos: 'min-w-0 @5xl:col-span-3',
  fila3: 'grid grid-cols-1 gap-4 @5xl:grid-cols-12',
  ranking: 'min-w-0 @5xl:col-span-5',
  barras: 'min-w-0 @5xl:col-span-7',
});

// ─── el contrato (core/analisis.py) ─────────────────────────────────────────────

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const lista = (v) => (Array.isArray(v) ? v : []);
const oNulo = (v) => (v === undefined ? null : v);

/** Las claves de `claves` de `o` (las que faltan en null), más las demás que traiga. */
function conClaves(o, claves) {
  const salida = { ...o };
  for (const c of claves) salida[c] = oNulo(o[c]);
  return salida;
}

/**
 * El bloque data del contrato con todas sus claves: las que faltan van en null (periodo, linea, barras, movimientos,
 * ranking, generado_en y cada cifra) o [] (kpis, donas, avisos, fechas, series, segmentos y filas). Nunca rellena una
 * cifra: un kpi sin valor queda con valor null, no 0. Acepta la respuesta entera ({status, data}) o el bloque data.
 * @param {unknown} resp
 * @returns {{periodo: any, kpis: any[], linea: any, donas: any[], barras: any, movimientos: any, ranking: any,
 *   filtros: {foco: any, top: any, producto: any, bodega: any}, avisos: string[], generado_en: string | null}}
 */
export function normalizarAnalisis(resp) {
  const r = esObjeto(resp) ? /** @type {any} */ (resp) : {};
  const d = esObjeto(r.data) ? r.data : r;
  const linea = esObjeto(d.linea) ? d.linea : null;
  const barras = esObjeto(d.barras) ? d.barras : null;
  const movimientos = esObjeto(d.movimientos) ? d.movimientos : null;
  const ranking = esObjeto(d.ranking) ? d.ranking : null;
  const filtros = esObjeto(d.filtros) ? d.filtros : {};
  return {
    periodo: esObjeto(d.periodo)
      ? conClaves(d.periodo, ['clave', 'etiqueta', 'desde', 'hasta', 'anterior_desde', 'anterior_hasta', 'granularidad', 'comparado'])
      : null,
    kpis: lista(d.kpis).filter(esObjeto).map((k) => ({
      ...conClaves(k, ['clave', 'etiqueta', 'valor', 'anterior', 'variacion_pct', 'formato', 'mejor', 'ayuda']),
      es_foto: k.es_foto === true,
    })),
    linea: linea && {
      ...conClaves(linea, ['titulo', 'formato', 'total', 'total_anterior', 'variacion_pct']),
      fechas: lista(linea.fechas),
      series: lista(linea.series).filter(esObjeto).map((s) => ({
        ...conClaves(s, ['clave', 'etiqueta']), valores: lista(s.valores), es_anterior: s.es_anterior === true,
      })),
    },
    donas: lista(d.donas).filter(esObjeto).map((dona) => ({
      ...conClaves(dona, ['clave', 'titulo', 'formato', 'total']), segmentos: lista(dona.segmentos),
    })),
    barras: barras && {
      ...conClaves(barras, ['titulo', 'formato', 'eje', 'apiladas']),
      etiquetas: lista(barras.etiquetas),
      series: lista(barras.series).filter(esObjeto).map((s) => ({ ...conClaves(s, ['clave', 'etiqueta', 'tono']), valores: lista(s.valores) })),
    },
    movimientos: movimientos && { ...conClaves(movimientos, ['titulo']), filas: lista(movimientos.filas) },
    ranking: ranking && { ...conClaves(ranking, ['titulo', 'columna', 'formato']), filas: lista(ranking.filas) },
    filtros: {
      foco: oNulo(filtros.foco), top: oNulo(filtros.top), producto: oNulo(filtros.producto), bodega: oNulo(filtros.bodega),
    },
    avisos: lista(d.avisos).filter((a) => typeof a === 'string'),
    generado_en: typeof d.generado_en === 'string' ? d.generado_en : null,
  };
}

/** Un valor que cuenta como dato: un número finito distinto de 0 (un negativo también). */
const esDato = (v) => {
  const n = numero(v);
  return n !== null && n !== 0;
};

/**
 * Si un bloque del contrato no tiene datos en el período, y la pieza dice 'Sin datos en este período' en vez de
 * dibujarse (la dona y las barras no se dibujan vacías):
 *  - 'linea': sin fechas, o ninguna serie del período (las que no son es_anterior) tiene un dato (el anterior solo no
 *    alcanza: el período está vacío);
 *  - 'dona': ningún segmento tiene un dato; 'barras': sin etiquetas o ninguna serie tiene un dato;
 *  - 'movimientos' y 'ranking': sin filas (una fila en 0 sigue siendo una fila).
 * Un bloque que no es un objeto (null: el módulo no lo tiene) también da true. Un tipo desconocido es un error de
 * programación (lanza Error).
 * @param {'linea' | 'dona' | 'barras' | 'movimientos' | 'ranking'} tipo
 * @param {unknown} bloque
 * @returns {boolean}
 */
export function bloqueSinDatos(tipo, bloque) {
  if (!['linea', 'dona', 'barras', 'movimientos', 'ranking'].includes(tipo)) {
    throw new Error(`Bloque de Análisis desconocido: ${String(tipo)}`);
  }
  if (!esObjeto(bloque)) return true;
  const b = /** @type {any} */ (bloque);
  const conDato = (series) => lista(series).some((s) => esObjeto(s) && lista(s.valores).some(esDato));
  if (tipo === 'linea') return !lista(b.fechas).length || !conDato(lista(b.series).filter((s) => !(esObjeto(s) && s.es_anterior === true)));
  if (tipo === 'dona') return !lista(b.segmentos).some((s) => esObjeto(s) && esDato(s.valor));
  if (tipo === 'barras') return !lista(b.etiquetas).length || !conDato(b.series);
  return !lista(b.filas).length;
}

/** Los formatos cuyas cifras se pueden sumar (el «total» de una serie de barras, T5B r1 M17). */
const FORMATOS_SUMABLES = congelar(['pesos', 'entero', 'numero', 'unidades']);

/**
 * Una serie de barras en el resumen, con los valores DIBUJADOS (valoresConSigno: con tono 'negativo', −|v|; T5B r1, el
 * ruling del punto 2): 'Salidas, total -2 u.' con un formato que se suma; con porcentaje o días, el rango
 * ('A tiempo, de 70 % a 90 %', o '80 %' si es uno solo).
 */
function parteBarras(s, formato) {
  const valores = valoresConSigno(s).filter((v) => v !== null);
  const nombre = s.etiqueta || 'Serie';
  if (FORMATOS_SUMABLES.includes(formato)) return `${nombre}, total ${formatearValor(valores.reduce((t, v) => t + v, 0), formato)}`;
  if (!valores.length) return `${nombre}, sin datos`;
  const [menor, mayor] = [Math.min(...valores), Math.max(...valores)];
  if (menor === mayor) return `${nombre}, ${formatearValor(menor, formato)}`;
  return `${nombre}, de ${formatearValor(menor, formato)} a ${formatearValor(mayor, formato)}`;
}

/**
 * El resumen de un gráfico para lectores de pantalla (el aria-label de su <canvas role="img">, T5B). Lee la forma del
 * bloque del contrato:
 *  - una dona (trae segmentos): 'Ventas por canal: total $1.000.000. Tienda web 60 %, Otros 40 %', o
 *    'Ventas por canal: sin datos en este período';
 *  - unas barras (traen etiquetas): 'Entradas y salidas: Entradas, total 7 u.; Salidas, total -2 u.' (la suma de lo
 *    DIBUJADO en cada serie, con pesos, entero, numero o unidades; con porcentaje o días, 'de 70 % a 90 %'), o
 *    '…: sin datos en este período';
 *  - una línea (lo demás): 'Ventas en el tiempo: total $4.927.538, subió 12,5 % frente al período anterior' (o 'bajó',
 *    'sin cambio', 'nuevo (antes era 0)'); sin total_anterior, solo el total. `frente` cambia el final.
 * Sin bloque, ''.
 * @param {{titulo?: string | null, formato?: FormatoAnalisis | null, total?: unknown, total_anterior?: unknown, segmentos?: unknown, etiquetas?: unknown, series?: unknown} | null | undefined} linea
 * @param {{frente?: string}} [opciones]
 * @returns {string}
 */
export function resumenAccesible(linea, { frente = 'frente al período anterior' } = {}) {
  if (!esObjeto(linea)) return '';
  const l = /** @type {any} */ (linea);
  if (Array.isArray(l.segmentos)) {
    const titulo = l.titulo || 'Distribución';
    if (bloqueSinDatos('dona', l)) return `${titulo}: sin datos en este período`;
    const partes = l.segmentos.filter(esObjeto).map((s) => `${s.etiqueta ?? s.clave ?? ''} ${formatearValor(s.pct, 'porcentaje')}`);
    return `${titulo}: total ${formatearValor(l.total, l.formato || 'entero')}. ${partes.join(', ')}`;
  }
  if (Array.isArray(l.etiquetas)) {
    const titulo = l.titulo || 'Barras';
    if (bloqueSinDatos('barras', l)) return `${titulo}: sin datos en este período`;
    const partes = lista(l.series).filter(esObjeto).map((s) => parteBarras(s, l.formato || 'entero'));
    return `${titulo}: ${partes.join('; ')}`;
  }
  const base = `${l.titulo || 'Serie'}: total ${formatearValor(l.total, l.formato || 'entero')}`;
  const v = variacionPct(l.total, l.total_anterior);
  if (!v) return base;
  if (v.tipo === 'nuevo') return `${base}, nuevo (antes era 0)`;
  const direccion = direccionVariacion(v);
  if (!direccion) return `${base}, sin cambio ${frente}`;
  return `${base}, ${direccion === 'sube' ? 'subió' : 'bajó'} ${formatoValorKpi(Math.abs(/** @type {any} */ (v).pct), 'porcentaje')} ${frente}`;
}
