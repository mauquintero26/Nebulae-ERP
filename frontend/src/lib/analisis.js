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
 *  - T5C, lo que decide PanelAnalisis y useAnalisis: la clave analisis:<modulo> y la lectura de lo guardado
 *    (clavePreferenciaAnalisis, leerPreferenciaAnalisis), el foco (resolverFoco), el campo Producto (productoConsulta,
 *    parametrosAnalisis), la carga y sus errores (aplicarLlegadaAnalisis, estadoAnalisis, errorAnalisis,
 *    siguienteErrorVisto), los textos de arriba (textoComparado, borradorPersonalizado, textoActualizado), las tarjetas
 *    de FilaKpis (tarjetaKpiAnalisis), el «mejor» de la línea (mejorDeLinea) y el asistente por defecto.
 * No lee ni escribe el almacenamiento (R4): el período, el top y el foco se guardan en analisis:<modulo> con
 * lib/preferencias.js (PanelAnalisis, T5C, con usePreferenciaParte).
 */

import { congelar, tiene } from './estados-pedido.js';
import { diaColombia, hace } from './fechas-colombia.js';
import { formatoPesos } from './pesos.js';
import {
  variacionPct, textoVariacion, direccionVariacion, tonoDeDireccion, mejorDesde, formatoValorKpi, formatoEntero,
  formatoDecimal, ETIQUETAS_PERIODO, CATALOGO_KPI,
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
 * Las filas de movimientos que se ven desde @2xl, al lado de la dona o de la línea (T5C, D43 M10); la clase
 * '@2xl/analisis:[&_li:nth-child(n+5)]:hidden' de GRILLA_ANALISIS.movimientos dice lo mismo (test_analisis.mjs lo comprueba).
 */
export const MOVIMIENTOS_AL_LADO = 4;

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
  // Revisión de r1: el negativo se arma desde la magnitud, como el '+' (en x,5 el redondeo de -x,5 daba otro número).
  if (fila?.signo === '-') return { texto: `-${formatearValor(Math.abs(n), formato)}`, tono: 'negativo' };
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
 *  - T5C (D43, M10, la opción de items-start): desde @2xl, donde los movimientos van al lado de otra tarjeta, la fila 2
 *    va con items-start y se ven solo las primeras MOVIMIENTOS_AL_LADO filas (medido en Chromium con el CSS real: las 8
 *    filas en 272 px miden 873 px contra los 367 de la línea y los 436 de la dona; con 4, unos 467). En una sola
 *    columna (por debajo de @2xl) se ven todas. EsqueletoAnalisis usa la misma fila (sus 5 filas grises ya son bajas).
 *    La raíz es un @container con nombre (analisis): esa regla estiliza los <li>, cuyo contenedor más cercano es el
 *    <ul @container> de ListaMovimientos, y con el nombre la condición mide el ancho del panel (las demás clases @…:
 *    siguen midiendo el contenedor más cercano, que es la raíz).
 * Cada celda lleva min-w-0: un <canvas> no ensancha su columna. Inmutable.
 */
export const GRILLA_ANALISIS = congelar({
  raiz: '@container/analisis',
  filas: 'flex flex-col gap-4',
  fila2: 'grid grid-cols-1 gap-4 @2xl:grid-cols-2 @2xl:items-start @5xl:grid-cols-12',
  linea: 'min-w-0 @2xl:col-span-2 @5xl:col-span-6',
  dona: 'min-w-0 @5xl:col-span-3',
  movimientos: 'min-w-0 @5xl:col-span-3 @2xl/analisis:[&_li:nth-child(n+5)]:hidden',
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

// ─── T5C: el panel (PanelAnalisis, useAnalisis, SelectorPeriodo, FilaKpis y el asistente) ───────────────────

/**
 * @typedef {'ventas' | 'compras' | 'inventario' | 'crm' | 'finanzas'} ModuloAnalisis
 * @typedef {{periodo: PeriodoAnalisis, top: 5 | 10 | 25, foco: string | null}} PreferenciaAnalisis
 * @typedef {{clave?: string | null, etiqueta?: string | null, valor?: unknown, anterior?: unknown,
 *   variacion_pct?: number | null, formato?: FormatoAnalisis | null, mejor?: MejorAnalisis | null, es_foto?: boolean,
 *   ayuda?: string | null}} KpiAnalisis
 * @typedef {ReturnType<typeof normalizarAnalisis>} DatosAnalisis
 * @typedef {{clave: string, ambito: string | null, usuario: number | null, repeticion: number,
 *   datos: DatosAnalisis | null, error: unknown}} ResultadoAnalisis
 *   Lo último que llegó a useAnalisis: la clave de la consulta que lo pidió, su ámbito (el endpoint y el foco), el usuario
 *   del token con que se pidió, la vuelta de la carga, los datos buenos (normalizados) y el error de esa llegada.
 * @typedef {{datos: DatosAnalisis | null, cargando: boolean, error: unknown}} EstadoAnalisis
 * @typedef {{tipo: 'permiso' | 'validacion' | 'carga', texto: string, reintentar: boolean}} ErrorAnalisis
 * @typedef {{ambito: string, aviso: ErrorAnalisis}} ErrorVisto
 * @typedef {'pesos' | 'entero' | 'porcentaje' | 'texto'} FormatoTarjetaAnalisis
 * @typedef {{clave: string, kpi: string | null, etiqueta: string, formato: FormatoTarjetaAnalisis,
 *   valor: number | string | null, icono: string | null,
 *   variacion: {actual: number | null, anterior: number | null, mejorSiSube: boolean | null, es_foto: boolean},
 *   ayuda: string | null, titulo: string | null}} TarjetaAnalisis
 */

/**
 * Los módulos con pestaña Análisis (R13 y RP69: uno por Hub; el foco de Ventas va dentro de analisis:ventas, sin
 * 'ventas-sc', 'ventas-cot' ni 'ventas-pven'). Inmutable.
 * @type {ReadonlyArray<ModuloAnalisis>}
 */
export const MODULOS_ANALISIS = congelar(/** @type {ModuloAnalisis[]} */ (['ventas', 'compras', 'inventario', 'crm', 'finanzas']));

/**
 * La clave de las preferencias de la pestaña: 'analisis:ventas' (R4; el ámbito analisis: de lib/preferencias.js). Un
 * módulo que no está en MODULOS_ANALISIS es un error de programación (lanza Error).
 * @param {unknown} modulo
 * @returns {string}
 */
export function clavePreferenciaAnalisis(modulo) {
  if (typeof modulo !== 'string' || !MODULOS_ANALISIS.includes(/** @type {ModuloAnalisis} */ (modulo))) {
    throw new Error(`Módulo de Análisis desconocido: ${String(modulo)}`);
  }
  return `analisis:${modulo}`;
}

/**
 * Lo que vale analisis:<modulo> sin nada guardado: los últimos 30 días, el Top 5 y sin foco (el porDefecto de
 * usePreferenciaParte en PanelAnalisis). Inmutable.
 * @type {Readonly<PreferenciaAnalisis>}
 */
export const PREFERENCIA_ANALISIS_POR_DEFECTO = congelar(/** @type {PreferenciaAnalisis} */ ({ periodo: { clave: '30d' }, top: 5, foco: null }));

/**
 * Lo guardado en analisis:<modulo>, leído pieza por pieza (una pieza que no vale vuelve a la de por defecto sin tumbar
 * las otras; lo vacío, dañado o de otro tipo da todo por defecto):
 *  - periodo: validarPeriodo (un personalizado con una fecha que ya no vale vuelve a 30 días), como {clave} o, en
 *    'personalizado', {clave, desde, hasta}, sin claves de más; también acepta la clave sola;
 *  - top: 5, 10 o 25 (TOPS), si no 5;
 *  - foco: una clave de `focos` (FOCOS_VENTAS en Ventas), si no la primera; sin focos, null.
 * Devuelve objetos nuevos (no muta lo guardado ni devuelve la constante).
 * @param {unknown} valor
 * @param {{focos?: ReadonlyArray<{clave: string}> | null, hoy?: string}} [opciones]
 * @returns {PreferenciaAnalisis}
 */
export function leerPreferenciaAnalisis(valor, { focos = null, hoy } = {}) {
  const v = esObjeto(valor) ? /** @type {any} */ (valor) : {};
  const crudo = typeof v.periodo === 'string' ? { clave: v.periodo } : v.periodo;
  const p = esObjeto(crudo) ? validarPeriodo(/** @type {PeriodoAnalisis} */ (crudo), hoy) : null;
  /** @type {PeriodoAnalisis} */
  let periodo = { clave: PERIODO_POR_DEFECTO.clave };
  if (p) {
    periodo = p.clave === 'personalizado'
      ? { clave: p.clave, desde: String(p.desde).trim(), hasta: String(p.hasta).trim() }
      : { clave: p.clave };
  }
  const top = /** @type {5 | 10 | 25} */ (TOPS.includes(v.top) ? v.top : PREFERENCIA_ANALISIS_POR_DEFECTO.top);
  return { periodo, top, foco: resolverFoco(focos, null, v.foco) };
}

/**
 * El foco que se ve (R13): `inicial` (el ?foco= de la URL, el «Ver análisis» de las listas) si es una clave de `focos`;
 * si no, `guardado` si lo es; si no, el primero. Sin focos, null. Las claves se comparan exactas.
 * @param {ReadonlyArray<{clave: string}> | null | undefined} focos
 * @param {unknown} inicial
 * @param {unknown} guardado
 * @returns {string | null}
 */
export function resolverFoco(focos, inicial, guardado) {
  const claves = lista(focos).map((f) => f?.clave).filter((c) => typeof c === 'string');
  if (!claves.length) return null;
  if (claves.includes(/** @type {string} */ (inicial))) return /** @type {string} */ (inicial);
  if (claves.includes(/** @type {string} */ (guardado))) return /** @type {string} */ (guardado);
  return claves[0];
}

/** El campo Producto manda producto= con al menos estas letras (RP69: T6C responde 422 con menos). */
export const PRODUCTO_MINIMO = 2;
/** Lo que espera el campo Producto, desde la última tecla, antes de pedir (ANALISIS-base punto 2). */
export const ESPERA_PRODUCTO_MS = 400;

/**
 * El producto= de la consulta: el texto sin espacios en los bordes si tiene PRODUCTO_MINIMO letras o más (cuenta letras,
 * no unidades de UTF-16); si no, null (no se manda).
 * @param {unknown} texto
 * @returns {string | null}
 */
export function productoConsulta(texto) {
  const limpio = typeof texto === 'string' ? texto.trim() : '';
  return Array.from(limpio).length >= PRODUCTO_MINIMO ? limpio : null;
}

/**
 * Los parámetros propios de la consulta del panel (los extra de consultaAnalisis): los de la pantalla (`params`, por
 * ejemplo {bodega}) más el foco y el producto del panel. El panel solo pisa lo que maneja (r1, M7 y M12):
 *  - con `conFoco` (el panel tiene focos), el foco es el suyo (null: no va) y params.foco se ignora; sin él, params.foco
 *    pasa tal cual;
 *  - con `conProducto` (busquedaProducto), el producto es el del campo, solo con 2 letras o más (productoConsulta), y
 *    params.producto se ignora; sin él, params.producto pasa tal cual.
 * @param {Record<string, unknown> | null | undefined} params
 * @param {{conFoco?: boolean, foco?: string | null, conProducto?: boolean, producto?: unknown}} [panel]
 * @returns {Record<string, unknown>}
 */
export function parametrosAnalisis(params, { conFoco = false, foco = null, conProducto = false, producto = null } = {}) {
  /** @type {Record<string, unknown>} */
  const salida = { ...(esObjeto(params) ? /** @type {Record<string, unknown>} */ (params) : {}) };
  if (conFoco) {
    delete salida.foco;
    if (foco) salida.foco = foco;
  }
  if (conProducto) {
    delete salida.producto;
    const p = productoConsulta(producto);
    if (p) salida.producto = p;
  }
  return salida;
}

/** El resultado es de ese ámbito y de ese usuario (sin usuario en los dos lados, también). */
const delMismoAmbito = (resultado, ambito, usuario) => Boolean(resultado) && resultado.ambito === ambito
  && (resultado.usuario ?? null) === (usuario ?? null);

/**
 * Lo que queda del análisis cuando llega la respuesta (o el error) de una carga de useAnalisis. La llegada es la de
 * crearCargaListado de lib/tabla.js (el turno: lo de una carga vieja nunca llega aquí), con su ContextoListado
 * {ruta, usuario} (ruta = el ámbito de la consulta: el endpoint y el foco) y su repetición. La misma regla de
 * useResumenFlujo (T5A r1) y useListado (T4C r2):
 *  - una respuesta con un objeto en `data` (apiFetch devuelve el cuerpo completo): normalizarAnalisis, sin error;
 *  - un error, o una respuesta sin `data`: el error y los últimos datos buenos del MISMO ámbito (el endpoint y el foco)
 *    y del MISMO usuario; los de otro foco o de otra cuenta no se muestran.
 * No muta lo que recibe.
 * @param {ResultadoAnalisis | null | undefined} previo
 * @param {{marca: string, ok: boolean, respuesta?: unknown, error?: unknown, repeticion?: number,
 *   contexto?: {ruta?: string | null, usuario?: number | null} | null}} llegada
 * @returns {ResultadoAnalisis}
 */
export function aplicarLlegadaAnalisis(previo, llegada) {
  const ambito = llegada?.contexto?.ruta ?? null;
  const usuario = llegada?.contexto?.usuario ?? null;
  const anteriores = delMismoAmbito(previo, ambito, usuario) ? /** @type {ResultadoAnalisis} */ (previo).datos : null;
  const base = { clave: llegada.marca, ambito, usuario, repeticion: llegada.repeticion ?? 0 };
  if (llegada.ok) {
    const respuesta = /** @type {any} */ (llegada.respuesta);
    if (esObjeto(respuesta) && esObjeto(respuesta.data)) return { ...base, datos: normalizarAnalisis(respuesta), error: null };
    return { ...base, datos: anteriores, error: new Error('La respuesta del análisis no trae datos.') };
  }
  return { ...base, datos: anteriores, error: llegada.error ?? new Error('No se pudo cargar el análisis.') };
}

/**
 * Lo que devuelve useAnalisis para la consulta `clave`, con `resultado` (lo último que llegó):
 *  - un resultado de otro ámbito (otro endpoint u otro foco) o de otro usuario cuenta como ninguno: cargando sin datos
 *    (el esqueleto);
 *  - si su clave no es la pedida, o la carga dio otra vuelta (`repeticion`), hay una carga en camino: `cargando`, con
 *    los datos anteriores (se ven atenuados: al cambiar el período no se borran) y sin el error anterior;
 *  - ya llegada: sus datos y su error (con error, los últimos datos buenos).
 * @param {ResultadoAnalisis | null | undefined} resultado
 * @param {{clave: string, ambito: string | null, usuario?: number | null, repeticion?: number}} consulta
 * @returns {EstadoAnalisis}
 */
export function estadoAnalisis(resultado, { clave, ambito, usuario = null, repeticion = 0 }) {
  const propio = delMismoAmbito(resultado, ambito, usuario) ? /** @type {ResultadoAnalisis} */ (resultado) : null;
  const cargando = !propio || propio.clave !== clave || (propio.repeticion ?? 0) !== repeticion;
  return { datos: propio?.datos ?? null, cargando, error: cargando ? null : (propio?.error ?? null) };
}

/** Un detail de FastAPI que dice algo: un texto no vacío, una lista con algo o un objeto con algo. */
function detalleConTexto(d) {
  if (typeof d === 'string') return d.trim() !== '';
  if (Array.isArray(d)) return d.length > 0;
  return esObjeto(d) && Object.keys(d).length > 0;
}

/** El aviso de un 403 (ANALISIS-base, comportamiento esperado). */
export const MENSAJE_SIN_PERMISO_ANALISIS = 'No tienes permiso para ver este análisis.';
/** El aviso de cualquier otra falla de la carga, con 'Reintentar'. */
export const MENSAJE_ERROR_ANALISIS = 'No pudimos cargar el análisis. Revisa tu conexión y vuelve a intentarlo.';

/**
 * El aviso de un error de la carga (apiFetch lanza con .status y .detail, Bloque 2):
 *  - 403: MENSAJE_SIN_PERMISO_ANALISIS, sin 'Reintentar' (volver a pedir no lo cambia);
 *  - 422 con detail (r1, M5: el rechazo del servidor, en español: los de core/periodos.py y core/analisis.py): su
 *    texto (el message que arma errorDeRespuesta desde ese detail), sin 'Reintentar';
 *  - cualquier otro (la red, un 5xx, un 401 que no se pudo renovar, una respuesta sin datos, un 422 sin detail, que
 *    apiFetch trae con el texto genérico «El servidor respondió con un error (422). Intenta de nuevo.»):
 *    MENSAJE_ERROR_ANALISIS con 'Reintentar'.
 * Sin error, null.
 * @param {unknown} error
 * @returns {ErrorAnalisis | null}
 */
export function errorAnalisis(error) {
  if (!error) return null;
  const e = /** @type {any} */ (error);
  if (e.status === 403) return { tipo: 'permiso', texto: MENSAJE_SIN_PERMISO_ANALISIS, reintentar: false };
  const texto = typeof e.message === 'string' ? e.message.trim() : '';
  if (e.status === 422 && texto && detalleConTexto(e.detail)) return { tipo: 'validacion', texto, reintentar: false };
  return { tipo: 'carga', texto: MENSAJE_ERROR_ANALISIS, reintentar: true };
}

/**
 * El aviso de error que muestra el panel, atado a su `ambito` (r1, M11: el endpoint, el foco y el usuario,
 * '/ventas/analisis|hub|7'):
 *  - un aviso de otro ámbito (otro foco u otra cuenta) se descarta enseguida, aunque haya una carga en camino: se ve el
 *    esqueleto, no el mensaje de otra consulta;
 *  - mientras carga (un reintento, u otro período del mismo foco después de un error) se conserva el que ya se veía, así
 *    el botón 'Reintentar' sigue montado y no suelta el foco;
 *  - al terminar, el de la última llegada (null si salió bien). Si dice lo mismo, devuelve `visto` (la misma identidad:
 *    el panel lo guarda en su estado durante el render y compara por identidad).
 * @param {ErrorVisto | null} visto
 * @param {{cargando: boolean, error: unknown, ambito: string}} estado
 * @returns {ErrorVisto | null}
 */
export function siguienteErrorVisto(visto, { cargando, error, ambito }) {
  const propio = visto && visto.ambito === ambito ? visto : null;
  if (cargando) return propio;
  const nuevo = errorAnalisis(error);
  if (!nuevo) return null;
  const a = propio?.aviso;
  if (a && nuevo.tipo === a.tipo && nuevo.texto === a.texto && nuevo.reintentar === a.reintentar) return propio;
  return { ambito, aviso: nuevo };
}

/**
 * 'Comparado con 5 ago – 3 sept': el texto de debajo del selector de período, con periodo.comparado del servidor
 * ('vs 5 ago – 3 sept'). Sin comparado, null.
 * @param {{comparado?: unknown} | null | undefined} periodo
 * @returns {string | null}
 */
export function textoComparado(periodo) {
  const crudo = typeof periodo?.comparado === 'string' ? periodo.comparado.trim() : '';
  const texto = crudo.replace(/^vs\.?\s+/i, '').trim();
  return texto ? `Comparado con ${texto}` : null;
}

const diaValido = (v) => (typeof v === 'string' && FECHA.test(v.trim()) ? v.trim() : '');

/**
 * Las fechas con que se abre 'Personalizado' en SelectorPeriodo: las del personalizado aplicado o, si el período es
 * otro, las del período que se ve (periodo.desde y periodo.hasta del contrato, días de Colombia). Solo 'AAAA-MM-DD'; si
 * no hay, ''.
 * @param {PeriodoAnalisis | null | undefined} periodo
 * @param {{desde?: unknown, hasta?: unknown} | null | undefined} periodoDatos
 * @returns {{desde: string, hasta: string}}
 */
export function borradorPersonalizado(periodo, periodoDatos) {
  const fuente = periodo?.clave === 'personalizado' ? periodo : periodoDatos;
  return { desde: diaValido(fuente?.desde), hasta: diaValido(fuente?.hasta) };
}

/**
 * 'Actualizado hace 2 minutos' (generado_en del contrato, ISO con Z) con hace() de lib/fechas-colombia.js (RP60). Sin
 * fecha válida, ''.
 * @param {unknown} generadoEn
 * @param {Date | number} [ahora]
 * @returns {string}
 */
export function textoActualizado(generadoEn, ahora = new Date()) {
  const relativa = generadoEn ? hace(generadoEn, ahora) : '';
  return relativa ? `Actualizado ${relativa}` : '';
}

/**
 * El ícono de una tarjeta de FilaKpis cuyo id no está en CATALOGO_KPI, por su formato (nombres de ICONOS_KPI). Inmutable.
 * @type {Readonly<Record<'pesos' | 'entero' | 'porcentaje' | 'dias' | 'unidades' | 'texto', string>>}
 */
export const ICONO_KPI_POR_FORMATO = congelar({
  pesos: 'DollarSign', entero: 'Activity', porcentaje: 'PieChart', dias: 'Clock', unidades: 'Package', texto: 'Activity',
});

/**
 * Las props de la TarjetaKpi de un indicador del contrato (FilaKpis = TarjetaKpi con variación, C12 y RP27):
 *  - etiqueta: la del servidor (o la clave); kpi: la clave si es un id de CATALOGO_KPI (trae su ícono y su color), si no
 *    null y el ícono va por formato (ICONO_KPI_POR_FORMATO);
 *  - formato de la tarjeta: 'pesos', 'entero' ('numero' también), 'porcentaje' o 'texto'; 'dias' y 'unidades' llegan ya
 *    escritos con formatearValor ('3,5 días', '1.234 u.') en formato 'texto'; uno desconocido o null, 'entero';
 *  - valor: el del servidor (un número o un número en texto); sin valor, null (la tarjeta pinta '—'): nunca 0;
 *  - variacion {actual, anterior, mejorSiSube} con los números del servidor (mejorDesde: 'sube' true, 'baja' false,
 *    'neutro' u otro null, en gris); sin anterior queda con anterior null y la tarjeta dice '—' (RP27);
 *  - una foto (es_foto): la variación lleva es_foto: true y TarjetaKpi dice «Hoy» (infoVariacion, RP27 punto 3; r1, M2);
 *  - la ayuda del servidor (con variación, TarjetaKpi la lleva al title).
 * @param {KpiAnalisis | null | undefined} kpi
 * @returns {TarjetaAnalisis}
 */
export function tarjetaKpiAnalisis(kpi) {
  const k = esObjeto(kpi) ? /** @type {any} */ (kpi) : {};
  const clave = typeof k.clave === 'string' && k.clave.trim() ? k.clave.trim() : '';
  const etiqueta = typeof k.etiqueta === 'string' && k.etiqueta.trim() ? k.etiqueta.trim() : (clave || 'Indicador');
  const enCatalogo = clave !== '' && tiene(CATALOGO_KPI, clave);
  const f = k.formato === 'numero' ? 'entero' : k.formato;
  const crudo = (typeof k.valor === 'number' || typeof k.valor === 'string') && k.valor !== '' ? k.valor : null;
  /** @type {FormatoTarjetaAnalisis} */
  let formato = 'entero';
  /** @type {number | string | null} */
  let valor = crudo;
  if (f === 'dias' || f === 'unidades') {
    formato = 'texto';
    valor = numero(crudo) === null ? null : formatearValor(crudo, f);
  } else if (f === 'pesos' || f === 'entero' || f === 'porcentaje' || f === 'texto') {
    formato = f;
  }
  const icono = enCatalogo ? null : ICONO_KPI_POR_FORMATO[tiene(ICONO_KPI_POR_FORMATO, f) ? f : 'entero'];
  const ayuda = typeof k.ayuda === 'string' && k.ayuda.trim() ? k.ayuda.trim() : null;
  const foto = k.es_foto === true;
  return {
    clave,
    kpi: enCatalogo ? clave : null,
    etiqueta,
    formato,
    valor,
    icono,
    // r1 (M2, RP27 punto 3): una foto lleva es_foto y TarjetaKpi dice «Hoy» con infoVariacion (su lector, para el lector
    // de pantalla); sin anterior: la foto no se compara.
    variacion: {
      actual: numero(k.valor), anterior: foto ? null : numero(k.anterior), mejorSiSube: mejorDesde(k.mejor), es_foto: foto,
    },
    ayuda,
    titulo: null,
  };
}

const MEJORES_ANALISIS = congelar(['sube', 'baja', 'neutro']);

/**
 * El «mejor» del chip de la línea (D43, M19: el contrato de la línea no lo trae): `explicito` si la pantalla lo fija y
 * vale (T7, T14, T17, T21 y T22 lo pasan); si no, el del kpi de la MISMA cifra: el mismo formato y el mismo valor que
 * linea.total y, si hay varios, el que además tiene el mismo anterior que linea.total_anterior; si los que quedan dicen
 * lo mismo, ese. Si no hay ninguno, el del único kpi con ese formato. Con ambigüedad (varios que no se ponen de acuerdo,
 * o ninguno), 'neutro': gris, nunca un verde inventado (r1, M3). Solo cuentan los kpis con un «mejor» válido.
 * @param {{formato?: unknown, total?: unknown} | null | undefined} linea
 * @param {ReadonlyArray<KpiAnalisis | null> | null | undefined} kpis
 * @param {unknown} [explicito]
 * @returns {MejorAnalisis}
 */
export function mejorDeLinea(linea, kpis, explicito) {
  const valido = (m) => MEJORES_ANALISIS.includes(/** @type {MejorAnalisis} */ (m));
  if (valido(explicito)) return /** @type {MejorAnalisis} */ (explicito);
  if (!esObjeto(linea)) return 'neutro';
  const l = /** @type {any} */ (linea);
  const formato = l.formato ?? 'entero';
  const total = numero(l.total);
  const anterior = numero(l.total_anterior);
  const mismos = lista(kpis).filter((k) => esObjeto(k) && (k.formato ?? 'entero') === formato && valido(k.mejor));
  let iguales = total === null ? [] : mismos.filter((k) => numero(k.valor) === total);
  if (iguales.length > 1 && anterior !== null) iguales = iguales.filter((k) => numero(k.anterior) === anterior);
  const unico = (lista_) => (lista_.length && lista_.every((k) => k.mejor === lista_[0].mejor) ? lista_[0].mejor : null);
  if (iguales.length) return unico(iguales) ?? 'neutro';
  if (mismos.length === 1) return mismos[0].mejor;
  return 'neutro';
}

// ─── T5C r1: las decisiones del panel (antes solo las cuidaban cadenas del fuente; M13) ───────────────────────────

/**
 * Si PanelAnalisis puede escribir una preferencia (r1, M9; la regla de escriturasDeAccion de la tabla, D40): solo si el
 * usuario con que se pintó la pantalla es el del token vigente. Con el token de otra cuenta (otra pestaña entró y el
 * vínculo ya pasó a la instancia nueva), el gesto se hizo sobre la pantalla de la anterior y no se guarda.
 * @param {number | null | undefined} usuarioRender
 * @param {number | null | undefined} usuarioToken
 * @returns {boolean}
 */
export function escrituraDelRender(usuarioRender, usuarioToken) {
  return (usuarioRender ?? null) === (usuarioToken ?? null);
}

/**
 * @typedef {{inicial: string | null, usar: boolean}} EstadoFocoUrl
 *   El ?foco= de la URL que vio el panel (`inicial`) y si todavía gana sobre el guardado (`usar`).
 */

/**
 * El estado del foco de la URL al montar el panel: lo usa (R13: «Ver análisis» abre el Hub ya enfocado).
 * @param {unknown} focoInicial
 * @returns {EstadoFocoUrl}
 */
export function focoUrlInicial(focoInicial) {
  return { inicial: typeof focoInicial === 'string' ? focoInicial : null, usar: true };
}

/**
 * El estado del foco de la URL tras un evento (r1, M1 y M6):
 *  - {tipo: 'elegir'}: el usuario eligió un foco en el panel; el de la URL deja de ganar;
 *  - {tipo: 'url', foco}: el ?foco= que llega en el render; si es otro, vuelve a ganar.
 * Sin cambios devuelve el mismo objeto (el panel lo ajusta durante el render y compara por identidad). Un evento
 * desconocido es un error de programación (lanza Error).
 * @param {EstadoFocoUrl} estado
 * @param {{tipo: 'elegir'} | {tipo: 'url', foco: unknown}} evento
 * @returns {EstadoFocoUrl}
 */
export function focoUrlTras(estado, evento) {
  if (evento?.tipo === 'elegir') return estado.usar ? { ...estado, usar: false } : estado;
  if (evento?.tipo === 'url') {
    const foco = typeof evento.foco === 'string' ? evento.foco : null;
    return foco === estado.inicial ? estado : { inicial: foco, usar: true };
  }
  throw new Error(`Evento de foco desconocido: ${String(evento?.tipo)}`);
}

/**
 * Si un toque de Reintentar se acepta (r1, M5 y M9): el aviso ofrece Reintentar y no hay otro reintento en camino (un
 * doble toque, o «Reintentando…» con aria-disabled, no duplica la petición).
 * @param {ErrorAnalisis | null | undefined} aviso
 * @param {boolean} reintentando
 * @returns {boolean}
 */
export function aceptaReintento(aviso, reintentando) {
  return Boolean(aviso?.reintentar) && !reintentando;
}

/**
 * Si sigue en camino el reintento que pidió el usuario (r1, M11): se marca al tocar Reintentar y se limpia cuando la
 * carga termina; otra carga (otro período u otro foco) no lo marca. «Reintentando…» = aviso && este valor.
 * @param {boolean} pedido
 * @param {{cargando: boolean}} estado
 * @returns {boolean}
 */
export function siguienteReintento(pedido, { cargando }) {
  return Boolean(pedido) && Boolean(cargando);
}

/**
 * Si el período de los datos es el elegido: la misma clave y, en un personalizado, las mismas fechas.
 * @param {{clave?: unknown, desde?: unknown, hasta?: unknown} | null | undefined} periodoDatos
 * @param {PeriodoAnalisis | null | undefined} elegido
 * @returns {boolean}
 */
export function periodoCoincide(periodoDatos, elegido) {
  if (!esObjeto(periodoDatos) || !elegido || typeof periodoDatos?.clave !== 'string') return false;
  if (periodoDatos.clave !== elegido.clave) return false;
  if (elegido.clave !== 'personalizado') return true;
  return periodoDatos.desde === elegido.desde && periodoDatos.hasta === elegido.hasta;
}

/**
 * El período de los datos que se puede mostrar arriba ('Comparado con …' y las fechas con que se abre Personalizado),
 * o null (r1, M10): no mientras recarga, y con un aviso solo si los datos son del período elegido (si falló otro
 * período, los datos que quedan son del anterior y su rango contradiría la píldora).
 * @param {{periodo?: any} | null | undefined} datos
 * @param {{recargando: boolean, aviso: unknown, periodo: PeriodoAnalisis | null | undefined}} estado
 * @returns {any}
 */
export function periodoVisible(datos, { recargando, aviso, periodo }) {
  const p = datos?.periodo;
  if (!esObjeto(p) || recargando) return null;
  if (aviso && !periodoCoincide(p, periodo)) return null;
  return p;
}

/**
 * La línea de debajo de los movimientos desde @2xl (r1, M1 y M19): 'y 4 movimientos más', 'y 1 movimiento más', o null
 * si no se esconde ninguna (de las MAX_MOVIMIENTOS que pinta ListaMovimientos se ven MOVIMIENTOS_AL_LADO).
 * @param {unknown} filas  cuántas filas trae el bloque
 * @returns {string | null}
 */
export function textoMovimientosMas(filas) {
  const n = Number.isFinite(filas) ? Math.min(Number(filas), MAX_MOVIMIENTOS) - MOVIMIENTOS_AL_LADO : 0;
  if (n <= 0) return null;
  return `y ${n} ${n === 1 ? 'movimiento' : 'movimientos'} más`;
}

/**
 * El asistente de toda pestaña Análisis cuando la pantalla no pasa el suyo (R2 y RP69). Inmutable.
 * @type {Readonly<{titulo: string, ejemplos: ReadonlyArray<string>}>}
 */
export const ASISTENTE_POR_DEFECTO = congelar({ titulo: 'Asistente con IA', ejemplos: [] });
