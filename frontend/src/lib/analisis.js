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
 * No lee ni escribe el almacenamiento (R4): el período, el top y el foco se guardan en analisis:<modulo> con
 * lib/preferencias.js (PanelAnalisis, T5C).
 */

import { congelar, tiene } from './estados-pedido.js';
import { diaColombia } from './fechas-colombia.js';
import { formatoPesos } from './pesos.js';
import {
  variacionPct, textoVariacion, direccionVariacion, tonoDeDireccion, mejorDesde, formatoValorKpi, formatoEntero,
  formatoDecimal,
} from './kpis.js';

/**
 * @typedef {'7d' | '30d' | '90d' | 'mes' | '12m' | 'personalizado'} ClavePeriodo
 * @typedef {{clave: ClavePeriodo, desde?: string, hasta?: string}} PeriodoAnalisis
 * @typedef {{texto: string, tono: 'bien' | 'mal' | 'neutro', flecha: 'sube' | 'baja' | null, lector: string}} InfoVariacion
 * @typedef {'pesos' | 'entero' | 'numero' | 'porcentaje' | 'dias' | 'unidades' | 'texto'} FormatoAnalisis
 */

// ─── períodos, tops y focos ─────────────────────────────────────────────────────

/** Los períodos del selector, con las etiquetas de core/periodos.py (ETIQUETAS). Inmutable. */
export const PERIODOS = congelar([
  { clave: '7d', etiqueta: '7 días' },
  { clave: '30d', etiqueta: '30 días' },
  { clave: '90d', etiqueta: '90 días' },
  { clave: 'mes', etiqueta: 'Este mes' },
  { clave: '12m', etiqueta: '12 meses' },
  { clave: 'personalizado', etiqueta: 'Personalizado' },
]);
const CLAVES_PERIODO = PERIODOS.map((p) => p.clave);

/** periodo_comparacion = «Últimos 30 días contra los 30 anteriores». Inmutable. */
export const PERIODO_POR_DEFECTO = congelar({ clave: '30d' });
/** Los tamaños del ranking (validar_top del servidor). Inmutable. */
export const TOPS = congelar([5, 10, 25]);
/** El foco del Análisis del Hub de Ventas (R13; se recuerda en analisis:ventas). Inmutable. */
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
 *  - tono 'bien' | 'mal' | 'neutro' según `mejor` ('sube': subir es bueno; 'baja': bajar es bueno; 'neutro': siempre
 *    neutro); flecha 'sube' | 'baja' | null.
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
  const flecha = v.tipo === 'nuevo' ? (Number(k.valor) < 0 ? 'baja' : 'sube') : direccionVariacion(v);
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

/** Los colores de las series y los segmentos, en orden fijo. Inmutable. */
export const PALETA = congelar(['#4f46e5', '#0d9488', '#f59e0b', '#0ea5e9', '#8b5cf6', '#e11d48', '#65a30d', '#64748b']);
/** 'Otros' y los segmentos 'Sin …'. */
export const GRIS_OTROS = '#cbd5e1';
/** La serie del período anterior. */
export const COLOR_ANTERIOR = '#94a3b8';
export const POSITIVO = '#059669';
export const NEGATIVO = '#e11d48';

/**
 * La ÚNICA tabla de clases de Tailwind a hex (RP73): las 12 de COLOR_HEX de crm/page.tsx más 'bg-red-500' (la etapa
 * «Perdido»), y sus fondos -50 (BG_HEX) más 'bg-red-50'. Los hex son los de hoy en el CRM (por ejemplo
 * 'bg-emerald-50': '#f0fdf4'), para que no cambie de color al adoptarla. lib/crm-etapas.js (T3C) deriva de aquí
 * COLOR_HEX y BG_HEX. Inmutable.
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

/**
 * El resumen de un gráfico de línea para lectores de pantalla: 'Ventas en el tiempo: total $4.927.538, subió 12,5 %
 * frente al período anterior' (o 'bajó', 'sin cambio', 'nuevo (antes era 0)'); sin total_anterior, solo el total. `frente` cambia
 * el final. Sin línea, ''.
 * @param {{titulo?: string, formato?: FormatoAnalisis, total?: unknown, total_anterior?: unknown} | null | undefined} linea
 * @param {{frente?: string}} [opciones]
 * @returns {string}
 */
export function resumenAccesible(linea, { frente = 'frente al período anterior' } = {}) {
  if (!esObjeto(linea)) return '';
  const l = /** @type {any} */ (linea);
  const base = `${l.titulo || 'Serie'}: total ${formatearValor(l.total, l.formato || 'entero')}`;
  const v = variacionPct(l.total, l.total_anterior);
  if (!v) return base;
  if (v.tipo === 'nuevo') return `${base}, nuevo (antes era 0)`;
  const direccion = direccionVariacion(v);
  if (!direccion) return `${base}, sin cambio ${frente}`;
  return `${base}, ${direccion === 'sube' ? 'subió' : 'bajó'} ${formatoValorKpi(Math.abs(/** @type {any} */ (v).pct), 'porcentaje')} ${frente}`;
}
