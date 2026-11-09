/**
 * Indicadores (tarjetas KPI) de toda la app (Bloque 4, T3A: KPI-base punto 1, KPI-otros, R7, R12, C12, C13, RP27,
 * RP70, RP75 y D26). JS plano, sin React ni DOM, para probarlo con node (frontend/tests/test_kpis.mjs). Imports
 * relativos con extensión: node no resuelve '@/'. No toca el almacenamiento (R4): el período de las tarjetas no se
 * guarda (PERIODO_KPI).
 *
 * Es la DUEÑA del formato y de la variación (C12): lib/analisis.js lo importa y no tiene uno propio.
 *  - Montos completos con formatoPesos de lib/pesos.js ('$4.927.538'); la letra se achica con tamanoValor. No hay
 *    formatoCompacto en las tarjetas (montos_grandes = «Completo; la letra se achica para que quepa»).
 *  - Porcentaje '45,2 %' (coma decimal, a lo sumo 1 decimal y un espacio antes de %). formatoPct de
 *    lib/dinero-ventas.js ('12,5%', anticipos y Resumen Financiero) es otro formato y NO cambia (RP75).
 *  - Variación (RP27): '+12,5 %', '−8 %' (con el menos tipográfico), 'Nuevo' (el anterior es 0 y el actual no) o
 *    'Sin cambio'. Mismo cálculo que variacion_pct del servidor; el redondeo de la mitad puede diferir en 0,1 (JS
 *    redondea la mitad hacia arriba, Python al par). La pantalla siempre usa este cálculo, no el del servidor (RP27).
 *    La dirección de 'Nuevo' sale del signo del valor actual, y solo aquí (direccionVariacion; analisis.js la usa).
 *    Un solo vocabulario de tono: 'bien', 'mal' o 'neutro'. El «mejor» del servidor ('sube' | 'baja' | 'neutro')
 *    pasa a mejorSiSube con mejorDesde().
 *  - 'entero' (el formato del contrato de Análisis) es sinónimo de 'numero' (RP27).
 *  - formatoEntero agrupa a mano, como formatoPesos (RP75): con algunas ICU 'es' toLocaleString no agrupa los números
 *    de 4 cifras.
 *  - Un solo vocabulario de carga (C13): estadoKpi -> 'cargando' | 'actualizando' | 'error' | 'listo'.
 * CATALOGO_KPI es la ÚNICA fuente de nombres de los indicadores: cada ítem de despliegue agrega aquí sus ids, y en
 * ningún otro lugar. Sus íconos son nombres de lucide-react que están en ICONOS_KPI (la prueba comprueba que existan
 * en la versión instalada).
 */

import { congelar } from './estados-pedido.js';
import { textoDeError } from './avisos.js';
import { formatoPesos } from './pesos.js';

/**
 * @typedef {'pesos' | 'numero' | 'porcentaje' | 'texto'} FormatoKpi
 * @typedef {'cargando' | 'actualizando' | 'error' | 'listo'} EstadoKpi
 * @typedef {'bien' | 'mal' | 'neutro'} TonoVariacion
 * @typedef {{tipo: 'pct', pct: number} | {tipo: 'nuevo', signo: 1 | -1} | {tipo: 'igual'}} Variacion
 * @typedef {'amber' | 'rose' | 'orange' | 'indigo' | 'purple' | 'emerald' | 'blue' | 'teal' | 'red' | 'slate'} ColorKpi
 * @typedef {{etiqueta: string, formato: FormatoKpi, icono: string, color: ColorKpi, mejorSiSube: boolean | null}} DefinicionKpi
 */

const MENOS = '−'; // el menos tipográfico de la variación ('−8 %')

/** El período de las tarjetas (periodo_comparacion = «Últimos 30 días contra los 30 anteriores»). */
export const PERIODO_KPI = '30d';

/**
 * Los textos de los períodos de las tarjetas y del Dashboard General. Inmutable.
 * @type {Readonly<Record<'30d' | '7d' | 'mes', Readonly<{etiqueta: string, comparado: string}>>>}
 */
export const TEXTO_PERIODO = congelar({
  '30d': { etiqueta: '30 días', comparado: 'vs 30 días antes' },
  '7d': { etiqueta: '7 días', comparado: 'vs 7 días antes' },
  mes: { etiqueta: 'este mes', comparado: 'vs mes pasado' },
});

/**
 * El texto de cada clave de período de Análisis (las ETIQUETAS de core/periodos.py). Es la tabla ÚNICA: PERIODOS de
 * lib/analisis.js se arma con ella, y etiquetaKpi la usa para las claves que no están en TEXTO_PERIODO. Inmutable.
 * @type {Readonly<Record<'7d' | '30d' | '90d' | 'mes' | '12m' | 'personalizado', string>>}
 */
export const ETIQUETAS_PERIODO = congelar({
  '7d': '7 días', '30d': '30 días', '90d': '90 días', mes: 'Este mes', '12m': '12 meses', personalizado: 'Personalizado',
});

/**
 * Los formatos de una tarjeta ('entero' se acepta como sinónimo de 'numero', RP27). Inmutable.
 * @type {ReadonlyArray<FormatoKpi>}
 */
export const FORMATOS_KPI = congelar(['pesos', 'numero', 'porcentaje', 'texto']);

/**
 * Los colores de una tarjeta: AccentColor de components/ui/colors.ts más 'slate' (ColorKpi de TarjetaKpi). Inmutable.
 * @type {ReadonlyArray<ColorKpi>}
 */
export const COLORES_KPI = congelar(['amber', 'rose', 'orange', 'indigo', 'purple', 'emerald', 'blue', 'teal', 'red', 'slate']);

// ─── números ────────────────────────────────────────────────────────────────────

/**
 * El número de `v` si es finito (también un número en texto, como un Decimal del API), o null. B4 T14 r1 (m7): exportado,
 * la política única de «un número del servidor» (las tarjetas del Hub de Compras y la tarjeta del tablero de PEC).
 * @param {unknown} v
 * @returns {number | null}
 */
export function numeroFinito(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const agrupar = (entero) => String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Décimas enteras de |n| (toPrecision quita el ruido binario: 45.24 * 10). */
const decimas = (n) => Math.round(Number((Math.abs(n) * 10).toPrecision(12)));

/** '3,5' o '12' (sin signo) desde un número de décimas. */
function textoDecimas(d) {
  const entero = Math.floor(d / 10);
  const decimal = d % 10;
  return decimal ? `${agrupar(entero)},${decimal}` : agrupar(entero);
}

/**
 * Un entero con los miles con punto, agrupado a mano como formatoPesos (RP75): 1234 -> '1.234', -1500 -> '-1.500',
 * 3.6 -> '4'. Lo que no es un número da '—'. Lo usan formatoValorKpi('numero') y textoConteo de lib/flujo.js (T3B).
 * @param {unknown} n
 * @returns {string}
 */
export function formatoEntero(n) {
  const x = numeroFinito(n);
  if (x === null) return '—';
  const r = Math.round(x);
  return (r < 0 ? '-' : '') + agrupar(Math.abs(r));
}

/**
 * Un número con a lo sumo 1 decimal, coma decimal, miles con punto y sin ',0': 3.46 -> '3,5', 12 -> '12',
 * 1234.56 -> '1.234,6'. Lo que no es un número da '—'.
 * @param {unknown} n
 * @returns {string}
 */
export function formatoDecimal(n) {
  const x = numeroFinito(n);
  if (x === null) return '—';
  const d = decimas(x);
  return (x < 0 && d > 0 ? '-' : '') + textoDecimas(d);
}

// ─── estado de carga (C13) ──────────────────────────────────────────────────────

/**
 * El estado de una tarjeta o de un contador: 'cargando' si carga y todavía no hubo una carga; 'actualizando' si carga
 * y ya hubo una; 'error' si hubo un error y no está cargando; si no, 'listo'.
 * @param {{loading?: boolean, yaCargo?: boolean, error?: unknown}} [opciones]
 * @returns {EstadoKpi}
 */
export function estadoKpi({ loading = false, yaCargo = false, error = null } = {}) {
  if (loading) return yaCargo ? 'actualizando' : 'cargando';
  if (error) return 'error';
  return 'listo';
}

// ─── variación (RP27) ───────────────────────────────────────────────────────────

/**
 * La variación de `actual` contra `anterior`. Mismo cálculo que variacion_pct del servidor; el redondeo de la mitad
 * puede diferir en 0,1 (JS redondea la mitad hacia arriba, Python al par). La pantalla siempre usa este cálculo, no
 * el del servidor (RP27).
 *  - null si alguno no es un número finito (sin comparación);
 *  - {tipo: 'igual'} si los dos son 0;
 *  - {tipo: 'nuevo', signo} si el anterior es 0 y el actual no (RP27: distinto de 0); signo 1 o −1 es el del valor
 *    actual, del que sale la dirección (direccionVariacion);
 *  - si no, {tipo: 'pct', pct} con pct = (actual − anterior) / |anterior| × 100, redondeado a 1 decimal con la mitad
 *    alejándose del cero en los dos sentidos (ROUND_HALF_UP, como redondear_peso: +12,25 -> +12,3 y −12,25 -> −12,3;
 *    sin −0), igual que formatoDecimal y el porcentaje de formatoValorKpi.
 * @param {unknown} actual
 * @param {unknown} anterior
 * @returns {Variacion | null}
 */
export function variacionPct(actual, anterior) {
  const a = numeroFinito(actual);
  const b = numeroFinito(anterior);
  if (a === null || b === null) return null;
  if (b === 0) return a === 0 ? { tipo: 'igual' } : { tipo: 'nuevo', signo: a < 0 ? -1 : 1 };
  const crudo = ((a - b) / Math.abs(b)) * 100;
  const d = decimas(crudo);
  const pct = d === 0 ? 0 : (crudo < 0 ? -d : d) / 10;
  return { tipo: 'pct', pct };
}

/**
 * '+12,5 %', '−8 %' (menos tipográfico), 'Nuevo' o 'Sin cambio' (también con un pct de 0). Sin variación: '—'.
 * @param {Variacion | null | undefined} v
 * @returns {string}
 */
export function textoVariacion(v) {
  if (!v) return '—';
  if (v.tipo === 'nuevo') return 'Nuevo';
  if (v.tipo === 'igual') return 'Sin cambio';
  if (v.tipo !== 'pct' || !Number.isFinite(v.pct)) return '—';
  if (v.pct === 0) return 'Sin cambio';
  return `${v.pct > 0 ? '+' : MENOS}${textoDecimas(decimas(v.pct))} %`;
}

/**
 * Hacia dónde va la variación: 'sube', 'baja' o null (sin cambio o sin variación). 'Nuevo' va según su signo (el del
 * valor actual; sin signo, 'sube'). Es la ÚNICA regla de dirección: la usan la tarjeta y lib/analisis.js.
 * @param {Variacion | null | undefined} v
 * @returns {'sube' | 'baja' | null}
 */
export function direccionVariacion(v) {
  if (!v) return null;
  if (v.tipo === 'nuevo') return /** @type {any} */ (v).signo === -1 ? 'baja' : 'sube';
  if (v.tipo === 'pct' && Number.isFinite(v.pct) && v.pct !== 0) return v.pct > 0 ? 'sube' : 'baja';
  return null;
}

/**
 * El tono de una dirección según si subir es mejor (true), peor (false) o ninguna de las dos (null -> 'neutro').
 * Lo reutiliza lib/analisis.js (infoVariacion).
 * @param {'sube' | 'baja' | null} direccion
 * @param {boolean | null | undefined} mejorSiSube
 * @returns {TonoVariacion}
 */
export function tonoDeDireccion(direccion, mejorSiSube) {
  if ((mejorSiSube !== true && mejorSiSube !== false) || !direccion) return 'neutro';
  return (direccion === 'sube') === mejorSiSube ? 'bien' : 'mal';
}

/**
 * 'bien', 'mal' o 'neutro' (el único vocabulario de tono, RP27). Con mejorSiSube = null siempre 'neutro'.
 * @param {Variacion | null | undefined} v
 * @param {boolean | null | undefined} mejorSiSube
 * @returns {TonoVariacion}
 */
export function tonoVariacion(v, mejorSiSube) {
  return tonoDeDireccion(direccionVariacion(v), mejorSiSube);
}

/**
 * El «mejor» del servidor a mejorSiSube: 'sube' -> true, 'baja' -> false, 'neutro' (u otro) -> null.
 * @param {unknown} mejor
 * @returns {boolean | null}
 */
export function mejorDesde(mejor) {
  if (mejor === 'sube') return true;
  if (mejor === 'baja') return false;
  return null;
}

// ─── formato del valor (R7) ─────────────────────────────────────────────────────

/**
 * El valor de una tarjeta como se ve:
 *  - 'pesos': formatoPesos ('$4.927.538'); 'numero' o 'entero': formatoEntero ('1.452');
 *  - 'porcentaje': '65 %', '12,5 %', '45,2 %'; 'texto': el valor tal cual.
 *  - null, undefined, '' o NaN: '—'. Un texto que no es número en un formato numérico también: nunca se inventa.
 * Un formato desconocido es un error de programación (lanza Error).
 * @param {unknown} valor
 * @param {FormatoKpi | 'entero'} formato
 * @returns {string}
 */
export function formatoValorKpi(valor, formato) {
  if (!FORMATOS_KPI.includes(/** @type {FormatoKpi} */ (formato)) && formato !== 'entero') {
    throw new Error(`Formato de indicador desconocido: ${String(formato)}`);
  }
  if (valor === null || valor === undefined || valor === '' || (typeof valor === 'number' && Number.isNaN(valor))) return '—';
  if (formato === 'texto') return String(valor);
  const n = numeroFinito(valor);
  if (n === null) return '—';
  if (formato === 'pesos') return formatoPesos(n);
  if (formato === 'porcentaje') return `${formatoDecimal(n)} %`;
  return formatoEntero(n);
}

/**
 * El tamaño de letra del valor según su largo: 'text-2xl' hasta 9 caracteres, 'text-xl' de 10 a 12 y 'text-lg' desde
 * 13 (clases literales de Tailwind).
 * @param {unknown} texto
 * @returns {'text-2xl' | 'text-xl' | 'text-lg'}
 */
export function tamanoValor(texto) {
  const n = String(texto ?? '').length;
  if (n <= 9) return 'text-2xl';
  if (n <= 12) return 'text-xl';
  return 'text-lg';
}

// Clases LITERALES de Tailwind v4 (container queries) por número de tarjetas: el compilador las ve en este archivo.
const CLASES_FRANJA = congelar({
  1: 'grid-cols-1',
  2: 'grid-cols-1 @sm:grid-cols-2',
  3: 'grid-cols-1 @2xl:grid-cols-3',
  4: 'grid-cols-1 @sm:grid-cols-2 @4xl:grid-cols-4',
  5: 'grid-cols-1 @sm:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5',
  6: 'grid-cols-1 @sm:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-6',
});

/**
 * Las clases de la grilla de una franja de `n` tarjetas (1 a 6; más de 6 usa las de 6).
 * @param {number} n
 * @returns {string}
 */
export function clasesFranja(n) {
  const k = Math.min(6, Math.max(1, Math.trunc(Number(n)) || 1));
  return CLASES_FRANJA[/** @type {1|2|3|4|5|6} */ (k)];
}

/**
 * El texto de un contador (pestañas, pastillas, BarraTabla, BannerFlujo, columnas del tablero; C13): '' mientras carga
 * (Contador pinta la barra gris), '—' si hubo un error y el número con los miles con punto en otro caso.
 * @param {unknown} valor
 * @param {EstadoKpi} estado
 * @returns {string}
 */
export function textoContador(valor, estado) {
  if (estado === 'cargando') return '';
  if (estado === 'error') return '—';
  return formatoEntero(valor);
}

/**
 * El color de tarjeta de una clase de Tailwind ('bg-blue-500' -> 'blue', también text-, border-, ring-, from- y
 * to-). Un color que no es de COLORES_KPI, un '#hex' o nada dan 'indigo'.
 * @param {unknown} clase
 * @returns {ColorKpi}
 */
export function acentoDesdeClase(clase) {
  const texto = typeof clase === 'string' ? clase.trim() : '';
  const m = /^(?:bg|text|border|ring|from|to)-([a-z]+)-\d{2,3}$/.exec(texto);
  const color = m ? m[1] : texto;
  return COLORES_KPI.includes(/** @type {ColorKpi} */ (color)) ? /** @type {ColorKpi} */ (color) : 'indigo';
}

// ─── lo que usan TarjetaKpi, Contador y useEstadoKpi (T4A) ──────────────────────

/**
 * El valor de una tarjeta como texto, o null si es otra cosa (un elemento de React, un arreglo, un booleano): la
 * tarjeta lo pinta tal cual. null o undefined dan '—'. Sin formato, un número va con formatoEntero ('1.452') y un texto
 * tal cual; con formato, formatoValorKpi (StatCard pasa 'texto': el valor como lo armó la pantalla).
 * @param {unknown} valor
 * @param {FormatoKpi | 'entero'} [formato]
 * @returns {string | null}
 */
export function textoValorTarjeta(valor, formato) {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  const f = formato ?? (typeof valor === 'number' ? 'numero' : 'texto');
  return formatoValorKpi(valor, f);
}

/**
 * El final del texto para lectores de pantalla de la variación de una tarjeta, por período (RP27 punto 6: 'Sube
 * 12,5 % frente a los 30 días anteriores'). Inmutable.
 * @type {Readonly<Record<'30d' | '7d' | 'mes', string>>}
 */
export const FRENTE_PERIODO = congelar({
  '30d': 'frente a los 30 días anteriores',
  '7d': 'frente a los 7 días anteriores',
  mes: 'frente al mes pasado',
});

/**
 * B4 T23A (aditivo): los textos de comparación que no son un período de TEXTO_PERIODO (la Tienda compara «hoy» contra
 * «ayer», que no es un tramo de 7 ni de 30 días) con su final para lectores de pantalla. Inmutable.
 * @type {Readonly<Record<string, string>>}
 */
const FRENTE_PROPIO = congelar({ 'vs ayer': 'frente a ayer' });

/**
 * El FRENTE_PERIODO del período cuyo texto comparado es `comparado` (el textoPeriodo de la tarjeta; por defecto, el de
 * PERIODO_KPI) o el de la comparación propia de la Tienda ('vs ayer'). Un texto propio da el genérico de lib/analisis.js,
 * 'frente al período anterior'.
 * @param {string} [comparado]
 * @returns {string}
 */
export function frenteDeComparado(comparado = TEXTO_PERIODO[PERIODO_KPI].comparado) {
  for (const [clave, textos] of Object.entries(TEXTO_PERIODO)) {
    if (textos.comparado === comparado) return FRENTE_PERIODO[/** @type {'30d' | '7d' | 'mes'} */ (clave)];
  }
  if (typeof comparado === 'string' && Object.prototype.hasOwnProperty.call(FRENTE_PROPIO, comparado)) return FRENTE_PROPIO[comparado];
  return 'frente al período anterior';
}

/**
 * El inverso de mejorDesde: true -> 'sube', false -> 'baja' y cualquier otro -> 'neutro' (el «mejor» que recibe
 * infoVariacion de lib/analisis.js, la regla única de la variación que usa la tarjeta).
 * @param {boolean | null | undefined} mejorSiSube
 * @returns {'sube' | 'baja' | 'neutro'}
 */
export function mejorComoTexto(mejorSiSube) {
  if (mejorSiSube === true) return 'sube';
  if (mejorSiSube === false) return 'baja';
  return 'neutro';
}

/**
 * El estado de un Contador: el que se pasa o, sin estado, 'cargando' si el valor todavía no llegó (null o undefined;
 * un conteo null nunca se pinta 0) y 'listo' si llegó.
 * @param {unknown} valor
 * @param {EstadoKpi} [estado]
 * @returns {EstadoKpi}
 */
export function estadoContador(valor, estado) {
  if (estado) return estado;
  return valor === null || valor === undefined ? 'cargando' : 'listo';
}

/**
 * @typedef {{vioCarga: boolean, yaCargo: boolean}} MarcaCarga
 */

/** La marca de useEstadoKpi antes de la primera carga. Inmutable. */
export const CARGA_INICIAL = congelar({ vioCarga: false, yaCargo: false });

/**
 * La marca de carga de useEstadoKpi después de ver `loading`: vioCarga se prende con un loading en true, y yaCargo con
 * el primer loading en false que viene después (una carga que de verdad pasó). Una pantalla que arranca con
 * loading=false y carga después no cuenta como cargada: su primera carga es 'cargando' (barra gris), no
 * 'actualizando' con ceros. Sin cambios devuelve la misma marca (el hook compara por identidad).
 * @param {MarcaCarga} marca
 * @param {boolean} loading
 * @returns {MarcaCarga}
 */
export function avanzarCarga(marca, loading) {
  if (loading && !marca.vioCarga) return { vioCarga: true, yaCargo: marca.yaCargo };
  if (!loading && marca.vioCarga && !marca.yaCargo) return { vioCarga: true, yaCargo: true };
  return marca;
}

// ─── catálogo (R12, RP70, D26) ──────────────────────────────────────────────────

/**
 * @param {string} etiqueta
 * @param {FormatoKpi} formato
 * @param {string} icono
 * @param {ColorKpi} color
 * @param {boolean | null} [mejorSiSube]
 * @returns {DefinicionKpi}
 */
const k = (etiqueta, formato, icono, color, mejorSiSube = true) => ({ etiqueta, formato, icono, color, mejorSiSube });

/**
 * id -> {etiqueta, formato, icono (nombre de lucide-react), color, mejorSiSube}. La ÚNICA fuente de nombres de los
 * indicadores: '{periodo}' lo reemplaza etiquetaKpi. Por defecto subir es mejor; los de mejorSiSube = null llevan su
 * % en gris. Inmutable. Sus claves son IdKpi: TypeScript no acepta un id mal escrito.
 */
const CATALOGO = {
  // Ventas
  sc_activas: k('Solicitudes activas', 'numero', 'FileText', 'indigo'),
  sc_confirmadas: k('Solicitudes confirmadas', 'numero', 'CheckCircle2', 'emerald'),
  sc_canceladas: k('Solicitudes canceladas', 'numero', 'XCircle', 'rose'),
  sc_total: k('Total de solicitudes', 'numero', 'Activity', 'slate'),
  cot_activas: k('Cotizaciones activas', 'numero', 'FileText', 'amber'),
  cot_confirmadas: k('Cotizaciones confirmadas', 'numero', 'CheckCircle2', 'emerald'),
  cot_monto_confirmado: k('Monto confirmado', 'pesos', 'DollarSign', 'slate'),
  cot_total: k('Total de cotizaciones', 'numero', 'Activity', 'slate'),
  cot_conversion: k('Cotizaciones que terminan en pedido ({periodo})', 'porcentaje', 'TrendingUp', 'emerald'),
  pven_total: k('Total de pedidos', 'numero', 'FileText', 'indigo'),
  pven_en_curso: k('Pedidos en curso', 'numero', 'ShoppingBag', 'emerald'),
  pven_pendiente_compra: k('Pendientes de compra', 'numero', 'Package', 'orange'),
  pven_monto_vendido: k('Monto vendido', 'pesos', 'DollarSign', 'emerald'),
  vendido_periodo: k('Vendido ({periodo})', 'pesos', 'TrendingUp', 'purple'),
  pven_monto_entregado: k('Entregado y facturado', 'pesos', 'BarChart3', 'purple'),
  pven_saldo_por_cobrar: k('Saldo por cobrar', 'pesos', 'Wallet', 'rose', false),
  ticket_promedio: k('Ticket promedio ({periodo})', 'pesos', 'Receipt', 'blue'),
  clientes_total: k('Clientes', 'numero', 'Users', 'indigo'),
  cli_total_comprado: k('Total comprado', 'pesos', 'ShoppingCart', 'indigo'),
  cli_total_pagado: k('Total pagado', 'pesos', 'CheckCircle2', 'emerald'),
  // RP70: la regla de la Agenda («fuera de CONFIRMADA y RECHAZADA»), que no es la de cot_activas.
  cli_cot_abiertas: k('Cotizaciones abiertas', 'numero', 'FileText', 'amber'),
  // Compras
  pec_activos: k('Pedidos de compra activos', 'numero', 'Receipt', 'purple'),
  pec_en_transito: k('En tránsito', 'numero', 'Truck', 'blue'),
  pec_vencidos: k('Con entrega vencida', 'numero', 'AlertTriangle', 'rose', false),
  pec_cumplimiento: k('Cumplimiento', 'porcentaje', 'CheckCircle2', 'emerald'),
  pec_monto: k('Monto en compras', 'pesos', 'DollarSign', 'purple'),
  pec_monto_por_recibir: k('Monto por recibir', 'pesos', 'DollarSign', 'blue'),
  comprado_periodo: k('Comprado ({periodo})', 'pesos', 'TrendingUp', 'purple', null),
  pec_avance: k('Avance promedio', 'texto', 'Clock', 'amber'),
  rec_por_confirmar: k('Recepciones por confirmar', 'numero', 'Clock', 'amber'),
  rec_confirmadas: k('Recepciones confirmadas', 'numero', 'CheckCircle2', 'emerald'),
  rec_total: k('Total de recepciones', 'numero', 'Activity', 'slate'),
  lista_pendientes: k('Ítems por comprar', 'numero', 'Clock', 'amber'),
  lista_en_pedido: k('Ítems en pedido', 'numero', 'ShoppingCart', 'blue'),
  lista_recibidos: k('Ítems recibidos', 'numero', 'CheckCircle2', 'emerald'),
  lista_total: k('Total de ítems', 'numero', 'Package', 'slate'),
  tras_en_proceso: k('Traslados en proceso', 'numero', 'ArrowLeftRight', 'blue'),
  tras_completados: k('Traslados completados', 'numero', 'CheckCircle2', 'emerald'),
  tras_total: k('Total de traslados', 'numero', 'Activity', 'slate'),
  bodegas: k('Bodegas', 'numero', 'Warehouse', 'amber'),
  // RP70 y D26: la ficha del proveedor en la Agenda (T23B), en tono neutro.
  prov_condiciones_pago: k('Condiciones de pago', 'texto', 'CreditCard', 'slate', null),
  prov_moneda: k('Moneda', 'texto', 'Coins', 'slate', null),
  prov_tiempo_entrega: k('Tiempo de entrega', 'texto', 'Clock', 'slate', null),
  prov_pedidos_compra: k('Pedidos de compra', 'numero', 'ShoppingCart', 'slate', null),
  // Inventario
  inv_valorizacion: k('Valor del inventario', 'pesos', 'DollarSign', 'purple'),
  inv_skus: k('Referencias (SKU)', 'numero', 'Package', 'indigo'),
  inv_fisico: k('Unidades en bodega', 'numero', 'Box', 'blue'),
  inv_reservado: k('Unidades comprometidas', 'numero', 'Clock', 'amber'),
  inv_disponible: k('Disponibles para vender', 'numero', 'CheckCircle2', 'emerald'),
  inv_en_transito: k('Unidades en tránsito', 'numero', 'Truck', 'blue'),
  inv_bajo_minimo: k('Bajo el mínimo', 'numero', 'AlertTriangle', 'amber', false),
  inv_agotados: k('Agotados', 'numero', 'AlertCircle', 'rose', false),
  inv_abastecidos: k('Bien abastecidos', 'numero', 'CheckCircle2', 'emerald'),
  inv_disponibilidad: k('Disponibilidad', 'porcentaje', 'PieChart', 'emerald'),
  aju_total: k('Total de ajustes', 'numero', 'SlidersHorizontal', 'amber'),
  aju_entradas: k('Ajustes de entrada', 'numero', 'TrendingUp', 'emerald'),
  aju_salidas: k('Ajustes de salida', 'numero', 'TrendingDown', 'rose'),
  aju_neto: k('Diferencia neta', 'numero', 'Activity', 'slate'),
  ent_saldo: k('Saldo antes de despachar', 'pesos', 'Wallet', 'rose'),
  ent_despachados: k('Pedidos despachados', 'numero', 'CheckCircle2', 'emerald'),
  // Otros
  leads_total: k('Leads', 'numero', 'Users', 'indigo'),
  camp_activas: k('Campañas activas', 'numero', 'Target', 'blue'),
  leads_capturados: k('Leads capturados', 'numero', 'Users', 'emerald'),
  leads_convertidos: k('Leads convertidos', 'numero', 'CheckCircle2', 'emerald'),
  ventas_atribuidas: k('Ventas atribuidas', 'pesos', 'DollarSign', 'purple'),
  roi: k('Retorno (ROI)', 'porcentaje', 'TrendingUp', 'amber'),
  flujos_activos: k('Flujos activos', 'numero', 'Sparkles', 'purple'),
  web_ventas_hoy: k('Ventas web de hoy', 'pesos', 'TrendingUp', 'purple'),
  web_ventas_mes: k('Ventas web del mes', 'pesos', 'BarChart3', 'indigo'),
  carritos_abandonados: k('Carritos abandonados', 'numero', 'AlertCircle', 'rose', false),
  productos_publicados: k('Productos publicados', 'numero', 'Package', 'emerald'),
};

/** @typedef {keyof typeof CATALOGO} IdKpi */

/** @type {Readonly<Record<IdKpi, Readonly<DefinicionKpi>>>} */
export const CATALOGO_KPI = congelar(CATALOGO);

/**
 * La etiqueta del indicador `id` con '{periodo}' reemplazado:
 *  - una clave de TEXTO_PERIODO usa su etiqueta ('30d' -> '30 días', 'mes' -> 'este mes');
 *  - otra clave de período de Análisis usa su texto de ETIQUETAS_PERIODO, el de PERIODOS ('90d' -> '90 días',
 *    '12m' -> '12 meses'): nunca sale la clave cruda;
 *  - cualquier otro texto se usa tal cual ('90 días'). Por defecto, PERIODO_KPI.
 * Un id que no está en CATALOGO_KPI es un error de programación (lanza Error).
 * @param {IdKpi} id
 * @param {string} [periodo]
 * @returns {string}
 */
export function etiquetaKpi(id, periodo = PERIODO_KPI) {
  const definicion = Object.prototype.hasOwnProperty.call(CATALOGO_KPI, id) ? CATALOGO_KPI[id] : null;
  if (!definicion) throw new Error(`Indicador desconocido: ${String(id)}`);
  const tiene = (tabla, clave) => typeof clave === 'string' && Object.prototype.hasOwnProperty.call(tabla, clave);
  const conocido = tiene(TEXTO_PERIODO, periodo) ? TEXTO_PERIODO[/** @type {'30d' | '7d' | 'mes'} */ (periodo)].etiqueta
    : tiene(ETIQUETAS_PERIODO, periodo) ? ETIQUETAS_PERIODO[/** @type {keyof typeof ETIQUETAS_PERIODO} */ (periodo)] : null;
  const texto = conocido ?? (typeof periodo === 'string' && periodo.trim() ? periodo.trim() : TEXTO_PERIODO[PERIODO_KPI].etiqueta);
  return definicion.etiqueta.replace('{periodo}', texto);
}

/**
 * Los nombres de íconos de lucide-react permitidos en una tarjeta (TarjetaKpi, T4A, los traduce a componentes): los
 * del catálogo más 'Circle' (las etapas del CRM, KPI-otros). Es una lista escrita a mano a propósito: un ícono nuevo
 * en el catálogo se agrega aquí (y test_kpis.mjs comprueba que exista en el lucide-react instalado). Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ICONOS_KPI = congelar([
  'Activity', 'AlertCircle', 'AlertTriangle', 'ArrowLeftRight', 'BarChart3', 'Box', 'CheckCircle2', 'Circle', 'Clock',
  'Coins', 'CreditCard', 'DollarSign', 'FileText', 'Package', 'PieChart', 'Receipt', 'ShoppingBag', 'ShoppingCart',
  'SlidersHorizontal', 'Sparkles', 'Target', 'TrendingDown', 'TrendingUp', 'Truck', 'Users', 'Wallet', 'Warehouse',
  'XCircle',
]);

// ─── B4 T14: las tarjetas del Hub de Compras (KPI-compras punto 5; R7, R12, RP43) ────────────────────────────────

/**
 * La regla de «Comprado (30 días)» (RP43: la misma de /compras/analisis). Con variación, TarjetaKpi la pone en el title.
 * @type {string}
 */
const REGLA_COMPRADO = 'Pedidos de compra con fecha de compra en el período, sin Borrador ni Cancelado.';

/**
 * B4 T14: lo que pintan las 4 tarjetas del Hub de Compras con `data` de GET /compras/stats?periodo=30d (T12):
 *  - activos (pec_activos): el número y la ayuda '3 con entrega vencida' en tono alerta, o 'Todos en fecha';
 *  - en_transito (pec_en_transito): el número;
 *  - cumplimiento (pec_cumplimiento): cumplimiento_pct del servidor y '2 recibidos de 9' (recibidos de activos +
 *    recibidos); sin base, sin ayuda;
 *  - comprado (comprado_periodo): flujo.comprado_cop con su {actual, anterior} (variación gris: el catálogo lo trae
 *    neutro) y la regla de RP43.
 * Sin datos (cargando o con error), null. Cada número pasa por numeroFinito (T14 r1, m7: un texto numérico vale; lo que no
 * es un número queda en null y Contador pinta la barra o «—»).
 * @param {any} datos
 * @returns {{activos: {valor: number | null, ayuda: string | null, tono: 'alerta' | 'normal'}, en_transito: {valor: number | null},
 *   cumplimiento: {valor: number | null, ayuda: string | null},
 *   comprado: {valor: number | null, variacion: {actual: number | null, anterior: number | null}, ayuda: string}} | null}
 */
export function tarjetasHubCompras(datos) {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const activos = numeroFinito(datos.activos);
  const vencidos = numeroFinito(datos.vencidos);
  const recibidos = numeroFinito(datos.recibidos);
  const base = activos !== null && recibidos !== null ? activos + recibidos : null;
  const comprado = datos.flujo && typeof datos.flujo === 'object' ? datos.flujo.comprado_cop : null;
  return {
    activos: {
      valor: activos,
      ayuda: vencidos === null ? null : vencidos > 0 ? `${formatoEntero(vencidos)} con entrega vencida` : 'Todos en fecha',
      tono: vencidos !== null && vencidos > 0 ? 'alerta' : 'normal',
    },
    en_transito: { valor: numeroFinito(datos.en_transito) },
    cumplimiento: {
      valor: numeroFinito(datos.cumplimiento_pct),
      ayuda: base ? `${formatoEntero(recibidos)} ${recibidos === 1 ? 'recibido' : 'recibidos'} de ${formatoEntero(base)}` : null,
    },
    comprado: {
      valor: numeroFinito(comprado?.actual),
      variacion: { actual: numeroFinito(comprado?.actual), anterior: numeroFinito(comprado?.anterior) },
      ayuda: REGLA_COMPRADO,
    },
  };
}

/**
 * B4 T15 (KPI-compras punto 6; R7, R12, RP92): lo que pintan las 4 tarjetas de Pedidos de compra con `data` de GET
 * /compras/stats?periodo=30d (T12; todos los PEC, no la página):
 *  - activos (pec_activos): el número;
 *  - en_transito (pec_en_transito): el número;
 *  - vencidos (pec_vencidos): el número, en tono alerta si hay alguno;
 *  - monto (pec_monto): monto_cop (lo de los vigentes) con la ayuda '12 pedidos vigentes'.
 * Sin datos (cargando o con error), null. Cada número pasa por numeroFinito (lo que no es un número queda en null y
 * Contador pinta la barra o «—», nunca 0).
 * @param {any} datos
 * @returns {{activos: {valor: number | null}, en_transito: {valor: number | null},
 *   vencidos: {valor: number | null, tono: 'alerta' | 'normal'}, monto: {valor: number | null, ayuda: string | null}} | null}
 */
export function tarjetasPedidosCompra(datos) {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const vencidos = numeroFinito(datos.vencidos);
  const vigentes = numeroFinito(datos.vigentes);
  return {
    activos: { valor: numeroFinito(datos.activos) },
    en_transito: { valor: numeroFinito(datos.en_transito) },
    vencidos: { valor: vencidos, tono: vencidos !== null && vencidos > 0 ? 'alerta' : 'normal' },
    monto: {
      valor: numeroFinito(datos.monto_cop),
      ayuda: vigentes === null ? null : `${formatoEntero(vigentes)} ${vigentes === 1 ? 'pedido vigente' : 'pedidos vigentes'}`,
    },
  };
}

/**
 * B4 T16A (KPI-compras punto 7): lo que pintan las 4 tarjetas de Mercancía en tránsito. Los números son de GET
 * /compras/stats?periodo=30d (todos los PEC) y el avance es de la página que se ve (RP95; lo arma avancePromedioTransito
 * de transito.js, que esta librería no importa para no cerrar un ciclo):
 *  - activos (pec_activos): el número y la ayuda 'En seguimiento de entrega';
 *  - vencidos (pec_vencidos): el número, en tono alerta si hay alguno;
 *  - avance (pec_avance): el texto '2,5/4' y la ayuda 'Promedio de esta página';
 *  - monto_por_recibir (pec_monto_por_recibir): monto_por_recibir_cop.
 * Cada número pasa por numeroFinito (lo que no es un número queda en null y Contador pinta la barra o «—», nunca 0); sin
 * `datos` (cargando o con error) los números van en null, pero el avance sigue siendo el de la página.
 * @param {any} datos
 * @param {string | null | undefined} avance
 * @returns {{activos: {valor: number | null, ayuda: string}, vencidos: {valor: number | null, tono: 'alerta' | 'normal'},
 *   avance: {valor: string | null, ayuda: string}, monto_por_recibir: {valor: number | null}}}
 */
export function tarjetasTransito(datos, avance) {
  const d = datos !== null && typeof datos === 'object' && !Array.isArray(datos) ? datos : {};
  const vencidos = numeroFinito(d.vencidos);
  return {
    activos: { valor: numeroFinito(d.activos), ayuda: 'En seguimiento de entrega' },
    vencidos: { valor: vencidos, tono: vencidos !== null && vencidos > 0 ? 'alerta' : 'normal' },
    avance: { valor: typeof avance === 'string' && avance ? avance : null, ayuda: 'Promedio de esta página' },
    monto_por_recibir: { valor: numeroFinito(d.monto_por_recibir_cop) },
  };
}

/**
 * B4 T16A (KPI-compras punto 8): lo que pintan las 3 tarjetas de Recepciones con `data` de GET /compras/stats: por
 * confirmar y confirmadas (data.recepciones, T12) y los PEC en tránsito (data.en_transito). Cada número pasa por
 * numeroFinito. Sin datos (cargando o con error), null.
 * @param {any} datos
 * @returns {{por_confirmar: {valor: number | null}, confirmadas: {valor: number | null}, en_transito: {valor: number | null}} | null}
 */
export function tarjetasRecepciones(datos) {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const rec = datos.recepciones !== null && typeof datos.recepciones === 'object' ? datos.recepciones : {};
  return {
    por_confirmar: { valor: numeroFinito(rec.por_confirmar) },
    confirmadas: { valor: numeroFinito(rec.confirmadas) },
    en_transito: { valor: numeroFinito(datos.en_transito) },
  };
}

/** B4 T16A (KPI-compras punto 8): la nota corta bajo las tarjetas de Recepciones; reemplaza la tarjeta «Regla de Separación». */
export const NOTA_RECEPCIONES = 'La recepción física suma stock; la recepción logística solo registra el evento.';

/**
 * B4 T16B (KPI-compras punto 9): lo que pintan las 4 tarjetas de la Lista de compras con `data` de GET
 * /compras/lista-compras/stats: ítems por comprar (pendientes), en pedido, recibidos y el total (sin los DESCARTADO). Cada
 * número pasa por numeroFinito (lo que no es un número queda en null y Contador pinta la barra o «—», nunca 0). Sin datos
 * (cargando o con error), null.
 * @param {any} datos
 * @returns {{pendientes: {valor: number | null}, en_pedido: {valor: number | null}, recibidos: {valor: number | null},
 *   total: {valor: number | null}} | null}
 */
export function tarjetasLista(datos) {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) return null;
  return {
    pendientes: { valor: numeroFinito(datos.pendientes) },
    en_pedido: { valor: numeroFinito(datos.en_pedido) },
    recibidos: { valor: numeroFinito(datos.recibidos) },
    total: { valor: numeroFinito(datos.total) },
  };
}

/**
 * B4 T16B (KPI-compras punto 10): lo que pintan las 4 tarjetas de Traslados. Los números son los conteos POR GRUPO de
 * conteosTraslado (estados-compras.js: en proceso = DRAFT + READY, grupoOperacion) de GET
 * /inventory/operations?operation_type=TRANSFER&con_conteos=1 (todos los traslados, sin búsqueda ni filtros); las bodegas
 * llegan por su cuenta. Lo que falta (o no es un número) queda en null: la barra gris o «—», nunca 0.
 * @param {any} porGrupo  {en_proceso, completadas, canceladas, todos}
 * @param {number | null | undefined} bodegas
 * @returns {{en_proceso: {valor: number | null}, completados: {valor: number | null}, bodegas: {valor: number | null},
 *   total: {valor: number | null}}}
 */
export function tarjetasTraslados(porGrupo, bodegas) {
  const g = porGrupo !== null && typeof porGrupo === 'object' && !Array.isArray(porGrupo) ? porGrupo : {};
  return {
    en_proceso: { valor: numeroFinito(g.en_proceso) },
    completados: { valor: numeroFinito(g.completadas) },
    bodegas: { valor: numeroFinito(bodegas) },
    total: { valor: numeroFinito(g.todos) },
  };
}

/** '3 referencias', '1 referencia': un número con su sustantivo en singular o plural (formatoDecimal: 2,5 no se redondea). */
const conNombre = (n, uno, varios) => `${formatoDecimal(n)} ${n === 1 ? uno : varios}`;

/**
 * B4 T17 (KPI-inventario punto 4; R10, R12, RP52): lo que pintan las 4 tarjetas del Hub de Inventario con `data` de GET
 * /inventory/stats (T13: resumen_existencias, todo el inventario, por referencia y sin las de rastrear_inventario =
 * false):
 *  - valorizacion (inv_valorizacion): valor_inventario_cop, con la ayuda '3 referencias sin costo' si skus_sin_costo > 0
 *    (las cuenta todas; el aviso del Análisis cuenta solo las que tienen físico > 0, y las dos cifras no se ven juntas);
 *  - skus (inv_skus): skus_total, con la ayuda '26 unidades en bodega' (unidades_fisicas);
 *  - bajo_minimo (inv_bajo_minimo): skus_bajo_minimo, con la ayuda '2 agotados' (skus_agotados) y el tono alerta si hay
 *    agotados o referencias bajo el mínimo (RP52 b: la tarjeta no es botón);
 *  - disponibilidad (inv_disponibilidad): disponibilidad_pct, con la ayuda '4 comprometidas' (unidades_reservadas).
 * Cada número pasa por numeroFinito (lo que no es un número queda en null: la barra gris o «—», nunca 0); una ayuda sin
 * su número es null. Sin datos (cargando o con error), null.
 * @param {any} datos
 * @returns {{valorizacion: {valor: number | null, ayuda: string | null}, skus: {valor: number | null, ayuda: string | null},
 *   bajo_minimo: {valor: number | null, ayuda: string | null, tono: 'alerta' | 'normal'},
 *   disponibilidad: {valor: number | null, ayuda: string | null}} | null}
 */
export function tarjetasHubInventario(datos) {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const sinCosto = numeroFinito(datos.skus_sin_costo);
  const fisicas = numeroFinito(datos.unidades_fisicas);
  const bajo = numeroFinito(datos.skus_bajo_minimo);
  const agotados = numeroFinito(datos.skus_agotados);
  const reservadas = numeroFinito(datos.unidades_reservadas);
  return {
    valorizacion: {
      valor: numeroFinito(datos.valor_inventario_cop),
      ayuda: sinCosto !== null && sinCosto > 0 ? conNombre(sinCosto, 'referencia sin costo', 'referencias sin costo') : null,
    },
    skus: {
      valor: numeroFinito(datos.skus_total),
      ayuda: fisicas === null ? null : conNombre(fisicas, 'unidad en bodega', 'unidades en bodega'),
    },
    bajo_minimo: {
      valor: bajo,
      ayuda: agotados === null ? null : conNombre(agotados, 'agotado', 'agotados'),
      tono: (agotados ?? 0) > 0 || (bajo ?? 0) > 0 ? 'alerta' : 'normal',
    },
    disponibilidad: {
      valor: numeroFinito(datos.disponibilidad_pct),
      ayuda: reservadas === null ? null : conNombre(reservadas, 'comprometida', 'comprometidas'),
    },
  };
}

/**
 * B4 T17 (R10): la nota de la franja del Hub de Inventario. Dice dónde se define el mínimo de cada referencia: reemplaza
 * el modal «Umbral», que no guardaba nada (/inventory/stock-tabla no tiene el parámetro umbral).
 */
export const AYUDA_MINIMO_INVENTARIO = 'Bajo el mínimo: lo disponible llegó al mínimo de la referencia. Ese mínimo es la «alerta de stock mínimo» de su publicación en E-Commerce; si no tiene, es 5.';

/**
 * B4 T17 (TABLA-inventario punto 4; R10, RP52 d): la vista «Almacenes» del Hub, una tarjeta por bodega sobre las filas de
 * GET /inventory/stock-tabla?por=bodega (hasta 200, la misma consulta de la tabla: su pestaña, búsqueda, bodega y
 * categoría). Por bodega (warehouse_id): referencias (filas), fisico (Σ), valor (Σ valorizacion de las que tienen costo;
 * null si ninguna lo tiene), sin_costo (las que no) y en_riesgo (agotadas o bajo el mínimo). Como los totales de R10, no
 * cuenta las referencias con rastrear_inventario = false. Una fila sin bodega (por=sku) o que no es un objeto se salta.
 * Ordenadas por el nombre de la bodega (en español) y, si empatan, por el id.
 * @param {ReadonlyArray<any> | null | undefined} filas
 * @returns {{warehouse_id: number, bodega: string, referencias: number, fisico: number, valor: number | null,
 *   sin_costo: number, en_riesgo: number}[]}
 */
export function resumenAlmacenes(filas) {
  if (!Array.isArray(filas)) return [];
  /** @type {Map<unknown, {warehouse_id: any, bodega: string, referencias: number, fisico: number, valor: number | null, sin_costo: number, en_riesgo: number}>} */
  const porBodega = new Map();
  for (const f of filas) {
    if (f === null || typeof f !== 'object' || f.rastrear_inventario === false) continue;
    if (f.warehouse_id === null || f.warehouse_id === undefined) continue;
    let b = porBodega.get(f.warehouse_id);
    if (!b) {
      const nombre = typeof f.bodega === 'string' && f.bodega.trim() !== '' ? f.bodega.trim() : 'Sin nombre';
      b = { warehouse_id: f.warehouse_id, bodega: nombre, referencias: 0, fisico: 0, valor: null, sin_costo: 0, en_riesgo: 0 };
      porBodega.set(f.warehouse_id, b);
    }
    b.referencias += 1;
    b.fisico += numeroFinito(f.fisico) ?? 0;
    const valor = numeroFinito(f.valorizacion);
    if (valor === null) b.sin_costo += 1;
    else b.valor = (b.valor ?? 0) + valor;
    if (f.estado_stock === 'agotado' || f.estado_stock === 'bajo_minimo') b.en_riesgo += 1;
  }
  return [...porBodega.values()].sort((a, b) => a.bodega.localeCompare(b.bodega, 'es') || (a.warehouse_id < b.warehouse_id ? -1 : a.warehouse_id > b.warehouse_id ? 1 : 0));
}

// ─── B4 T18: las tarjetas de Stock y de Abastecimiento (KPI-inventario puntos 5 y 6; R10, R12) ─────────────────────

/** Un objeto de datos del servidor (no un arreglo ni un texto), o null. */
const datosDe = (d) => (d !== null && typeof d === 'object' && !Array.isArray(d) ? d : null);

/**
 * B4 T18 (KPI-inventario punto 5): lo que pintan las 4 tarjetas de Stock con `data` de GET /inventory/stats (T13), todo el
 * inventario sin las referencias de rastrear_inventario = false: fisico (unidades_fisicas), reservado (unidades_reservadas),
 * disponible (unidades_disponibles) y en_transito (unidades_en_transito, una vez por SKU). Cada número pasa por numeroFinito
 * (lo que no es un número queda en null: la barra gris o «—», nunca 0). Sin datos (cargando o con error), null.
 * @param {any} datos
 * @returns {{fisico: {valor: number | null, ayuda: string}, reservado: {valor: number | null, ayuda: string},
 *   disponible: {valor: number | null, ayuda: string}, en_transito: {valor: number | null, ayuda: string}} | null}
 */
export function tarjetasStock(datos) {
  const d = datosDe(datos);
  if (d === null) return null;
  return {
    fisico: { valor: numeroFinito(d.unidades_fisicas), ayuda: 'Lo que hay físicamente en las bodegas.' },
    reservado: { valor: numeroFinito(d.unidades_reservadas), ayuda: 'Reservas activas que no han vencido.' },
    disponible: { valor: numeroFinito(d.unidades_disponibles), ayuda: 'Físico menos comprometido, nunca negativo.' },
    en_transito: { valor: numeroFinito(d.unidades_en_transito), ayuda: 'Pedido al proveedor y aún sin recibir.' },
  };
}

/**
 * B4 T18 (KPI-inventario punto 6; RP94): las 4 tarjetas de Abastecimiento. Tres salen de `stats` (GET /inventory/stats):
 * agotados (skus_agotados), bajo_minimo (skus_bajo_minimo) y abastecidos (skus_abastecidos), por referencia. La cuarta,
 * pec_activos, sale de `compras` (GET /compras/stats, T12: pec_activos). Son dos fuentes que cargan y fallan por separado:
 * si una falta (cargando o con error), SOLO sus tarjetas quedan en null (la barra gris o «—»).
 * @param {any} stats
 * @param {any} compras
 * @returns {{agotados: {valor: number | null, ayuda: string}, bajo_minimo: {valor: number | null, ayuda: string},
 *   abastecidos: {valor: number | null, ayuda: string}, pec_activos: {valor: number | null, ayuda: string}}}
 */
export function tarjetasAbastecimiento(stats, compras) {
  const s = datosDe(stats) ?? {};
  const c = datosDe(compras) ?? {};
  return {
    agotados: { valor: numeroFinito(s.skus_agotados), ayuda: 'Referencias con control de inventario sin disponible.' },
    bajo_minimo: { valor: numeroFinito(s.skus_bajo_minimo), ayuda: 'Referencias con control de inventario que llegaron al mínimo.' },
    abastecidos: { valor: numeroFinito(s.skus_abastecidos), ayuda: 'Referencias con control de inventario sobre el mínimo.' },
    pec_activos: { valor: numeroFinito(c.pec_activos), ayuda: 'Pedidos de compra en curso.' },
  };
}

/**
 * B4 T19 (KPI-inventario punto 9; RP96): lo que pintan las 4 tarjetas de Ajustes con los TOTALES de tres consultas a GET
 * /inventory/operations?operation_type=ADJUSTMENT&limit=0 (sin dirección, direccion=entrada y direccion=salida): los mismos números de
 * las pestañas Todos, Entradas y Salidas. La diferencia neta es entradas − salidas (de ajustes, no de unidades), con signo y con
 * su ayuda «7 entradas contra 4 salidas»; sin uno de los dos totales no hay neto (null, no entradas − 0). Lo que no es un número
 * queda en null: la barra gris o «—», nunca 0.
 * @param {any} totales  {todos, entradas, salidas}
 * @returns {{total: {valor: number | null}, entradas: {valor: number | null}, salidas: {valor: number | null},
 *   neto: {valor: number | null, texto: string | null, ayuda: string | null}}}
 */
export function tarjetasAjustes(totales) {
  const t = totales !== null && typeof totales === 'object' && !Array.isArray(totales) ? totales : {};
  const entradas = numeroFinito(t.entradas);
  const salidas = numeroFinito(t.salidas);
  const neto = entradas === null || salidas === null ? null : entradas - salidas;
  return {
    total: { valor: numeroFinito(t.todos) },
    entradas: { valor: entradas },
    salidas: { valor: salidas },
    neto: neto === null || entradas === null || salidas === null
      ? { valor: null, texto: null, ayuda: null }
      : {
        valor: neto,
        texto: `${neto > 0 ? '+' : neto < 0 ? '-' : ''}${formatoEntero(Math.abs(neto))}`,
        ayuda: `${conNombre(entradas, 'entrada', 'entradas')} contra ${conNombre(salidas, 'salida', 'salidas')}`,
      },
  };
}

/**
 * B4 T19 (KPI-inventario punto 7): el total de Recepciones de Inventario (rec_total): `recepciones.total` de GET /compras/stats
 * (T12), el mismo número que la pestaña Todas y que Compras › Recepciones. Sin un número, null.
 * @param {any} datos
 * @returns {number | null}
 */
export function totalRecepciones(datos) {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const rec = datos.recepciones;
  return rec !== null && typeof rec === 'object' ? numeroFinito(rec.total) : null;
}

/**
 * B4 T19 r1 (I3): lo que una pantalla pinta de una fuente que se pide otra vez (Actualizar, despachar, crear): `cargado` es lo
 * último que llegó ({vuelta, datos, error}) y `vuelta` la que se acaba de pedir. Mientras llega, se CONSERVA el último valor
 * (`datos`) y `cargando` es true: useEstadoKpi lo vuelve 'actualizando' (atenuado), no «—» (el signo del error) ni la barra gris
 * de la primera carga. Un error no deja datos viejos.
 * @template T
 * @param {{vuelta: number | string, datos: T | null, error: unknown} | null | undefined} cargado
 * @param {number | string} vuelta
 * @returns {{datos: T | null, cargando: boolean}}
 */
export function lecturaDeCarga(cargado, vuelta) {
  return { datos: cargado?.datos ?? null, cargando: cargado?.vuelta !== vuelta };
}

// ─── B4 T22: el Dashboard General (KPI-otros punto 1; R7, R12, RP104) ───────────────────────────────────────────

/**
 * Los períodos que ofrece el selector del Dashboard General (R7): Semana ('7d'), 30 días ('30d') y Mes ('mes'), sin «Hoy».
 * Cada clave es una de TEXTO_PERIODO (su «vs …»). Inmutable.
 * @type {ReadonlyArray<Readonly<{clave: '7d' | '30d' | 'mes', etiqueta: string}>>}
 */
export const PERIODOS_DASHBOARD = congelar([
  congelar({ clave: '7d', etiqueta: 'Semana' }),
  congelar({ clave: '30d', etiqueta: '30 días' }),
  congelar({ clave: 'mes', etiqueta: 'Mes' }),
]);

/**
 * El período del Dashboard General para `valor`: una de las claves de PERIODOS_DASHBOARD; cualquier otra cosa (hoy, 90d,
 * vacío, lo que no es un texto) vuelve a PERIODO_KPI.
 * @param {unknown} valor
 * @returns {'7d' | '30d' | 'mes'}
 */
export function periodoDashboard(valor) {
  const hallado = PERIODOS_DASHBOARD.find((p) => p.clave === valor);
  return hallado ? hallado.clave : /** @type {'30d'} */ (PERIODO_KPI);
}

/** {actual, anterior} de un indicador del bloque `flujo` de /ventas/stats ({actual, anterior, variacion_pct}); sin dato, en null. */
function parDeFlujo(p) {
  return { actual: numeroFinito(datosDe(p) ? p.actual : null), anterior: numeroFinito(datosDe(p) ? p.anterior : null) };
}

/**
 * RP104 (a): lo que pinta cada una de las 4 tarjetas vitales del Dashboard General con `data` de GET /ventas/stats?periodo=
 * (las mismas cifras del Hub de Ventas, R7) y los clientes de /crm/customers:
 *  - vendido: flujo.vendido_cop.actual, con su variación contra el anterior;
 *  - ticket: flujo.ticket_promedio_cop.actual, con su variación (NO pven_monto_vendido / pven_con_dinero);
 *  - saldo: kpis.pven_saldo_por_cobrar (foto de hoy, sin variación);
 *  - clientes: el total que llega.
 * Cada fuente falla sola: lo que no llega es null (la tarjeta pinta la barra o «—», nunca 0); un 0 real se queda en 0.
 * @param {any} datosVentas
 * @param {unknown} totalClientes
 * @returns {{vendido: {valor: number | null, variacion: {actual: number | null, anterior: number | null}},
 *   ticket: {valor: number | null, variacion: {actual: number | null, anterior: number | null}},
 *   saldo: {valor: number | null}, clientes: {valor: number | null}}}
 */
export function tarjetasVitalesDashboard(datosVentas, totalClientes) {
  const flujo = datosDe(datosVentas) && datosDe(datosVentas.flujo) ? datosVentas.flujo : null;
  const kpis = datosDe(datosVentas) && datosDe(datosVentas.kpis) ? datosVentas.kpis : null;
  const vendido = parDeFlujo(flujo?.vendido_cop);
  const ticket = parDeFlujo(flujo?.ticket_promedio_cop);
  return {
    vendido: { valor: vendido.actual, variacion: vendido },
    ticket: { valor: ticket.actual, variacion: ticket },
    saldo: { valor: numeroFinito(kpis?.pven_saldo_por_cobrar) },
    clientes: { valor: numeroFinito(totalClientes) },
  };
}

/**
 * RP104 (b) y KPI-otros punto 1: la fila de inventario del Dashboard General con `data` de GET /inventory/stats (unidades en
 * bodega, comprometidas, disponibles y en tránsito, tal cual: sin existencias inventadas ni un disponible calculado) y
 * `pec_activos` de GET /compras/stats para la ayuda del tránsito («7 pedidos de compra activos»). Lo que no llega es null.
 * @param {any} datosInventario
 * @param {any} datosCompras
 * @returns {{fisico: {valor: number | null}, reservado: {valor: number | null}, disponible: {valor: number | null},
 *   en_transito: {valor: number | null, ayuda: string | null}}}
 */
export function tarjetasInventarioDashboard(datosInventario, datosCompras) {
  const s = tarjetasStock(datosInventario);
  const activos = numeroFinito(datosDe(datosCompras) ? datosCompras.pec_activos : null);
  return {
    fisico: { valor: s?.fisico.valor ?? null },
    reservado: { valor: s?.reservado.valor ?? null },
    disponible: { valor: s?.disponible.valor ?? null },
    en_transito: {
      valor: s?.en_transito.valor ?? null,
      ayuda: activos === null ? null : conNombre(activos, 'pedido de compra activo', 'pedidos de compra activos'),
    },
  };
}

/**
 * El radar del Dashboard General: los pedidos de venta de la pestaña «Pend. Compra» de la lista de Pedidos de venta (GET
 * /ventas/stats, kpis.pven_pendiente_compra: los estados de esa pestaña, no solo «esperando mercancía»). {tipo: 'alerta', n} si hay alguno, {tipo: 'ok'} si
 * no hay ninguno y null si el dato no llegó (ni alerta ni «todo bien» sin saberlo).
 * @param {any} datosVentas
 * @returns {{tipo: 'alerta', n: number} | {tipo: 'ok'} | null}
 */
export function radarOperativo(datosVentas) {
  const kpis = datosDe(datosVentas) && datosDe(datosVentas.kpis) ? datosVentas.kpis : null;
  const n = numeroFinito(kpis?.pven_pendiente_compra);
  if (n === null) return null;
  return n > 0 ? { tipo: 'alerta', n } : { tipo: 'ok' };
}

/** El enlace del radar: la pestaña «Pend. Compra» de Pedidos de venta, la vista que tiene el número que cuenta el radar. */
export const RUTA_RADAR = '/dashboard/ventas/venta?tab=pend_compra';

/**
 * La frase del radar: dice lo que cuenta su número (los pedidos de venta de la pestaña «Pend. Compra»).
 * @param {number} n
 * @returns {string}
 */
export function textoRadar(n) {
  return `Hay ${formatoEntero(n)} ${n === 1 ? 'pedido de venta' : 'pedidos de venta'} en «Pend. Compra».`;
}

/**
 * B4 T22 r1 (I1, M3): el `data` de la respuesta de un endpoint del Dashboard. Una respuesta sin un objeto en `data` es un
 * ERROR (lanza), no un «listo» vacío.
 * @param {any} respuesta
 * @returns {any}
 */
export function datosDeRespuesta(respuesta) {
  const d = datosDe(respuesta) ? respuesta.data : null;
  // Un objeto o una lista (/crm/customers manda una lista en data); null, texto o número no son datos.
  if (d === null || d === undefined || typeof d !== 'object') throw new Error('El servidor no devolvió datos.');
  return d;
}

/**
 * B4 T22 r1 (I1, M4; m3): lo que pinta el Dashboard de una fuente: lecturaDeCarga más el error de la vuelta VIGENTE (el de una
 * vieja no se ve mientras se reintenta; un error no deja datos viejos) y la `marca` (el período) de los datos que se ven.
 * @template T
 * @param {{vuelta: number | string, datos: T | null, error: unknown, marca?: string | null} | null | undefined} llego
 * @param {number | string} vuelta
 * @returns {{datos: T | null, cargando: boolean, error: unknown, marca: string | null}}
 */
export function lecturaDeFuente(llego, vuelta) {
  const { datos, cargando } = lecturaDeCarga(llego, vuelta);
  return { datos, cargando, error: cargando ? null : (llego?.error ?? null), marca: llego?.marca ?? null };
}

/**
 * B4 T22 r1 (m3, m11): el período del rótulo y del «vs …» de una tarjeta de dinero: el de los datos que se ven (`marca`), para
 * que el número viejo no lleve el rótulo del período nuevo; sin datos todavía, el elegido.
 * @param {string | null | undefined} marca
 * @param {string} elegido
 * @returns {'7d' | '30d' | 'mes'}
 */
export function periodoVisto(marca, elegido) {
  return periodoDashboard(marca ?? elegido);
}

/**
 * B4 T22 r1 (m6): el aviso de una fuente caída, 'No se pudieron cargar las existencias: Error del servidor.', con un solo
 * punto al final aunque el mensaje ya lo traiga. Sin error, null.
 * @param {unknown} error
 * @param {string} texto
 * @returns {string | null}
 */
export function textoAvisoFuente(error, texto) {
  if (!error) return null;
  const mensaje = textoDeError(error, texto);
  return mensaje.endsWith('.') ? mensaje : `${mensaje}.`;
}

// ─── B4 T23A: las tarjetas de la tienda (KPI-otros punto 5; R7, R12, RP102) ──────────────────────────────────────

/**
 * Contra qué compara cada tarjeta de dinero de la Tienda: hoy contra ayer y el mes contra el mismo tramo del mes pasado
 * (el servidor cuenta los dos en hora de Colombia). El del mes es el de la clave `mes` de TEXTO_PERIODO. Inmutable.
 * @type {Readonly<{hoy: string, mes: string}>}
 */
export const TEXTO_COMPARACION_TIENDA = congelar({ hoy: 'vs ayer', mes: TEXTO_PERIODO.mes.comparado });

/** «3 pedidos web», «1 pedido web»: el número con punto de miles y su nombre en singular o plural. */
const pedidosDe = (n, uno, varios) => `${formatoEntero(n)} ${n === 1 ? uno : varios}`;

/**
 * B4 T23A (KPI-otros punto 5): lo que pintan las 4 tarjetas de la Tienda con `data` de GET /ecommerce/stats (T20), sin sumar ni
 * restar nada en el navegador (RP102: revenue_* ya viene sin CANCELADO ni DEVUELTO_TOTAL):
 *  - web_ventas_hoy: revenue_today contra revenue_ayer ('vs ayer'), con «N pedidos web»;
 *  - web_ventas_mes: revenue_month contra revenue_mes_anterior ('vs mes pasado'), con «N pedidos PWEB»;
 *  - carritos_abandonados: carritos_abandonados_count, en alerta si es mayor que 0, con «$X sin cerrar» (carritos_abandonados_valor:
 *    la tarjeta ya dice cuántos; sin ese valor, null: nunca «$0» inventado);
 *  - productos_publicados: productos_publicados.
 * `variacion` es {actual, anterior} y sale solo si los dos son números (el 0 sí es un número: la tarjeta dice «Nuevo»);
 * el texto del % lo calcula la tarjeta con variacionPct. Lo que no es un número queda en null (la barra gris o «—», nunca 0);
 * sin datos (cargando, con error o un cuerpo que no es un objeto), todo en null. Un objeto nuevo en cada llamada.
 * @param {unknown} datos
 * @returns {{
 *   web_ventas_hoy: {valor: number | null, variacion: {actual: number, anterior: number} | null, textoPeriodo: string, ayuda: string | null},
 *   web_ventas_mes: {valor: number | null, variacion: {actual: number, anterior: number} | null, textoPeriodo: string, ayuda: string | null},
 *   carritos_abandonados: {valor: number | null, tono: 'normal' | 'alerta', ayuda: string | null},
 *   productos_publicados: {valor: number | null}}}
 */
export function tarjetasTienda(datos) {
  const s = /** @type {Record<string, unknown>} */ (datosDe(datos) ?? {});
  const comparar = (actual, anterior) => {
    const a = numeroFinito(actual);
    const b = numeroFinito(anterior);
    return a === null || b === null ? null : { actual: a, anterior: b };
  };
  const hoy = numeroFinito(s.web_orders_today);
  const mes = numeroFinito(s.web_orders_month);
  const carritos = numeroFinito(s.carritos_abandonados_count);
  const enFuga = numeroFinito(s.carritos_abandonados_valor);
  return {
    web_ventas_hoy: {
      valor: numeroFinito(s.revenue_today),
      variacion: comparar(s.revenue_today, s.revenue_ayer),
      textoPeriodo: TEXTO_COMPARACION_TIENDA.hoy,
      ayuda: hoy === null ? null : pedidosDe(hoy, 'pedido web', 'pedidos web'),
    },
    web_ventas_mes: {
      valor: numeroFinito(s.revenue_month),
      variacion: comparar(s.revenue_month, s.revenue_mes_anterior),
      textoPeriodo: TEXTO_COMPARACION_TIENDA.mes,
      ayuda: mes === null ? null : pedidosDe(mes, 'pedido PWEB', 'pedidos PWEB'),
    },
    carritos_abandonados: {
      valor: carritos,
      tono: carritos !== null && carritos > 0 ? 'alerta' : 'normal',
      ayuda: enFuga === null ? null : `${formatoPesos(enFuga)} sin cerrar`,
    },
    productos_publicados: { valor: numeroFinito(s.productos_publicados) },
  };
}

/**
 * B4 T23A r1 (m16): GET /ecommerce/carritos trae como mucho los 50 más recientes (LIMIT 50 del servidor); si la tarjeta cuenta más
 * (`total`, carritos_abandonados_count), la caja lo dice: «Los 50 más recientes de 120». Sin los dos números, o si llegaron todos, null.
 * @param {unknown} total
 * @param {unknown} llegaron
 * @returns {string | null}
 */
export function textoLimiteCarritos(total, llegaron) {
  const t = numeroFinito(total);
  const n = numeroFinito(llegaron);
  if (t === null || n === null || n <= 0 || t <= n) return null;
  return `Los ${formatoEntero(n)} más recientes de ${formatoEntero(t)}`;
}

// ─── B4 T23B: Marketing, Campañas, la ficha de la Agenda y la tarjeta del Asistente (KPI-otros puntos 3, 4 y 6; RP70) ──────

/** Un texto con su nombre en singular o plural: «1 campaña en total», «12 campañas en total». */
const cuantos = (n, uno, varios) => `${formatoEntero(n)} ${n === 1 ? uno : varios}`;

/**
 * Lo que pintan las 4 tarjetas de Marketing con `data` de GET /marketing/stats (marketing.py marketing_stats):
 *  - camp_activas: campanas_activas, con «N campañas en total» (campanas_total);
 *  - leads_capturados: leads_total, con «N convertidos (45,2 %)» (leads_convertidos y tasa_conversion_pct, con formatoValorKpi);
 *  - ventas_atribuidas: ventas_atribuidas_cop, con «Retorno: 45,3 %» (roi_pct) o «Retorno: sin presupuesto» (el servidor manda
 *    roi 0 cuando presupuesto_total_cop es 0: ese 0 no es un retorno);
 *  - flujos_activos: flujos_activos, con «N posts publicados» (posts_total).
 * Lo que no llega (cargando, con error o sin la clave) es null: la barra gris o «—», nunca 0. Un 0 real se queda en 0.
 * @param {unknown} datos
 * @returns {{camp_activas: {valor: number | null, ayuda: string | null}, leads_capturados: {valor: number | null, ayuda: string | null},
 *   ventas_atribuidas: {valor: number | null, ayuda: string | null}, flujos_activos: {valor: number | null, ayuda: string | null}}}
 */
export function tarjetasMarketing(datos) {
  const s = /** @type {Record<string, unknown>} */ (datosDe(datos) ?? {});
  const total = numeroFinito(s.campanas_total);
  const convertidos = numeroFinito(s.leads_convertidos);
  const tasa = numeroFinito(s.tasa_conversion_pct);
  const roi = numeroFinito(s.roi_pct);
  const presupuesto = numeroFinito(s.presupuesto_total_cop);
  const posts = numeroFinito(s.posts_total);
  /** @type {string | null} */
  let retorno = null;
  if (presupuesto !== null && presupuesto <= 0) retorno = 'Retorno: sin presupuesto';
  else if (roi !== null) retorno = `Retorno: ${formatoValorKpi(roi, 'porcentaje')}`;
  return {
    camp_activas: { valor: numeroFinito(s.campanas_activas), ayuda: total === null ? null : cuantos(total, 'campaña en total', 'campañas en total') },
    leads_capturados: {
      valor: numeroFinito(s.leads_total),
      ayuda: convertidos === null ? null
        : `${cuantos(convertidos, 'convertido', 'convertidos')}${tasa === null ? '' : ` (${formatoValorKpi(tasa, 'porcentaje')})`}`,
    },
    ventas_atribuidas: { valor: numeroFinito(s.ventas_atribuidas_cop), ayuda: retorno },
    flujos_activos: { valor: numeroFinito(s.flujos_activos), ayuda: posts === null ? null : cuantos(posts, 'post publicado', 'posts publicados') },
  };
}

/**
 * Un porcentaje «con signo» (R7): «+45,3 %», «−8 %» (con el menos tipográfico) y «0 %»; lo que no es un número, null.
 * @param {unknown} n
 * @returns {string | null}
 */
export function formatoPorcentajeConSigno(n) {
  const x = numeroFinito(n);
  if (x === null) return null;
  const texto = `${formatoDecimal(Math.abs(x))} %`;
  const d = decimas(x);
  return d === 0 ? '0 %' : `${x > 0 ? '+' : MENOS}${texto}`;
}

/**
 * Lo que pintan las 4 tarjetas de la pestaña Métricas de una campaña: la fila de GET /marketing/campanas (leads_count y
 * presupuesto_cop) y TODOS sus leads (GET /marketing/campanas/{id}/leads no tiene límite; null mientras llegan):
 *  - leads_capturados: los leads que se ven (si ya llegaron) o leads_count de la fila;
 *  - leads_convertidos: los de estado CONVERTIDO entre los leads que llegaron (null sin ellos: no se inventa);
 *  - ventas_atribuidas (r1, m19): UNA definición, la de Marketing y la de la columna «Venta»: la suma de venta_atribuida_cop de los
 *    leads, de cualquier estado (no el ventas_cop de la fila, que solo suma los CONVERTIDO); null sin los leads;
 *  - roi: esas ventas / presupuesto_cop × 100 − 100 (la misma fórmula del servidor), con su `texto` con signo («+75 %») y el tono
 *    'bien' si es mayor que 0 y 'alerta' si es menor; sin presupuesto no hay retorno: valor null y la ayuda «Sin presupuesto».
 * @param {any} campana
 * @param {ReadonlyArray<any> | null | undefined} leads
 * @returns {{leads_capturados: {valor: number | null}, leads_convertidos: {valor: number | null},
 *   ventas_atribuidas: {valor: number | null, ayuda: string},
 *   roi: {valor: number | null, texto: string | null, tono: 'normal' | 'alerta' | 'bien', ayuda: string | null}}}
 */
export function tarjetasCampana(campana, leads) {
  const c = datosDe(campana) ?? {};
  const llegaron = Array.isArray(leads);
  const ventas = llegaron ? leads.reduce((suma, l) => suma + (numeroFinito(l?.venta_atribuida_cop) ?? 0), 0) : null;
  const presupuesto = numeroFinito(c.presupuesto_cop);
  const hayPresupuesto = presupuesto !== null && presupuesto > 0;
  const roi = ventas !== null && hayPresupuesto ? ventas / presupuesto * 100 - 100 : null;
  return {
    leads_capturados: { valor: llegaron ? leads.length : numeroFinito(c.leads_count) },
    leads_convertidos: { valor: llegaron ? leads.filter((l) => l?.estado === 'CONVERTIDO').length : null },
    ventas_atribuidas: { valor: ventas, ayuda: 'Suma de la venta atribuida de sus leads' },
    roi: roi === null
      ? { valor: null, texto: null, tono: 'normal', ayuda: ventas !== null && !hayPresupuesto ? 'Sin presupuesto' : null }
      : { valor: roi, texto: formatoPorcentajeConSigno(roi), tono: roi > 0 ? 'bien' : roi < 0 ? 'alerta' : 'normal', ayuda: null },
  };
}

const SIN_PERMISO_MONTOS = 'Sin permiso para ver montos';

/**
 * Lo que pintan las 4 tarjetas de la ficha de un cliente en la Agenda, con lo que da resumenFichaCliente (lib/kpis-ventas.js, de
 * GET /crm/customers/{id}/profile-360; null mientras el perfil llega):
 *  - pven_saldo_por_cobrar: tono 'alerta' si hay saldo, 'bien' con «Al día con pagos» si es 0;
 *  - cli_total_comprado: con «N pedidos» (los que cuentan en el total, sin cancelados);
 *  - cli_total_pagado: con «Pagos confirmados, menos devoluciones» (así lo suma el servidor);
 *  - cli_cot_abiertas (RP70): fuera de CONFIRMADA y RECHAZADA, con «N solicitudes activas».
 * Sin permiso (resumen_financiero null: BODEGA y COMPRAS), los tres montos son null con la ayuda «Sin permiso para ver montos»; los
 * conteos siguen. Sin perfil (null), todo null: la barra gris, nunca 0.
 * @param {{sinPermiso: boolean, saldoPorCobrar: number | null, totalComprado: number | null, totalPagado: number | null,
 *   pedidos: number, cotizacionesAbiertas: number, solicitudesActivas: number} | null | undefined} resumen
 * @returns {{pven_saldo_por_cobrar: {valor: number | null, tono: 'normal' | 'alerta' | 'bien', ayuda: string | null},
 *   cli_total_comprado: {valor: number | null, ayuda: string | null}, cli_total_pagado: {valor: number | null, ayuda: string | null},
 *   cli_cot_abiertas: {valor: number | null, ayuda: string | null}}}
 */
export function tarjetasFichaCliente(resumen) {
  if (!datosDe(resumen)) {
    return {
      pven_saldo_por_cobrar: { valor: null, tono: 'normal', ayuda: null },
      cli_total_comprado: { valor: null, ayuda: null },
      cli_total_pagado: { valor: null, ayuda: null },
      cli_cot_abiertas: { valor: null, ayuda: null },
    };
  }
  const r = /** @type {NonNullable<typeof resumen>} */ (resumen);
  const saldo = r.sinPermiso ? null : numeroFinito(r.saldoPorCobrar);
  return {
    pven_saldo_por_cobrar: {
      valor: saldo,
      tono: saldo === null ? 'normal' : saldo > 0 ? 'alerta' : 'bien',
      ayuda: r.sinPermiso ? SIN_PERMISO_MONTOS : saldo === null ? null : saldo > 0 ? 'Cobro pendiente antes del despacho' : 'Al día con pagos',
    },
    cli_total_comprado: { valor: r.sinPermiso ? null : numeroFinito(r.totalComprado), ayuda: r.sinPermiso ? SIN_PERMISO_MONTOS : cuantos(r.pedidos, 'pedido', 'pedidos') },
    cli_total_pagado: { valor: r.sinPermiso ? null : numeroFinito(r.totalPagado), ayuda: r.sinPermiso ? SIN_PERMISO_MONTOS : 'Pagos confirmados, menos devoluciones' },
    cli_cot_abiertas: { valor: numeroFinito(r.cotizacionesAbiertas), ayuda: cuantos(r.solicitudesActivas, 'solicitud activa', 'solicitudes activas') },
  };
}

/**
 * Lo que pintan las tarjetas de la ficha de un proveedor en la Agenda con lo que el servidor SÍ manda: payment_terms de
 * GET /compras/proveedores (_supplier_dict; sin ese dato, null y la tarjeta dice «—»: nunca un «Contado» inventado) y el `total` de
 * GET /compras/pedidos?supplier_id= (null si no llegó). Moneda y tiempo de entrega no existen en el modelo Supplier (prov_moneda y
 * prov_tiempo_entrega del catálogo quedan sin usar hasta que el servidor los mande).
 * @param {any} proveedor
 * @param {unknown} totalPedidos
 * @returns {{prov_condiciones_pago: {valor: string | null}, prov_pedidos_compra: {valor: number | null}}}
 */
export function tarjetasFichaProveedor(proveedor, totalPedidos) {
  const terminos = typeof datosDe(proveedor)?.payment_terms === 'string' ? proveedor.payment_terms.trim() : '';
  return {
    prov_condiciones_pago: { valor: terminos || null },
    prov_pedidos_compra: { valor: numeroFinito(totalPedidos) },
  };
}

/**
 * La etiqueta de un indicador sin su «({periodo})»: el ticket de un cliente no es de un período («Ticket promedio»). Un id que no
 * está en CATALOGO_KPI lanza Error (como etiquetaKpi).
 * @param {IdKpi} id
 * @returns {string}
 */
function etiquetaSinPeriodo(id) {
  return CATALOGO_KPI[id].etiqueta.replace(/\s*\(\{periodo\}\)$/, '');
}

/**
 * La tarjeta oscura del cliente en el Asistente omnicanal con `revenue` de GET /chat/customer-context (chat.py: total_spent_cop,
 * total_orders_count, active_orders_count y avg_ticket_cop): los nombres del catálogo (RP70: «Total comprado», «Total de pedidos»,
 * «Pedidos en curso» y «Ticket promedio») y formatoPesos (montos completos, sin el .split(',')[0] de formatCOP). Lo que no llega es «—».
 * @param {any} revenue
 * @returns {{total: {etiqueta: string, texto: string}, mini: Array<{etiqueta: string, texto: string, ayuda: string | null}>}}
 */
export function fichaRevenueAsistente(revenue) {
  const r = datosDe(revenue) ?? {};
  return {
    total: { etiqueta: etiquetaSinPeriodo('cli_total_comprado'), texto: formatoValorKpi(r.total_spent_cop, 'pesos') },
    mini: [
      { etiqueta: etiquetaSinPeriodo('pven_total'), texto: formatoValorKpi(r.total_orders_count, 'numero'), ayuda: null },
      // chat.py cuenta como «en curso» todo lo que no es ENTREGADO, COMPLETADO ni cancelado, FACTURADO incluido.
      { etiqueta: etiquetaSinPeriodo('pven_en_curso'), texto: formatoValorKpi(r.active_orders_count, 'numero'), ayuda: 'Incluye los facturados' },
      { etiqueta: etiquetaSinPeriodo('ticket_promedio'), texto: formatoValorKpi(r.avg_ticket_cop, 'pesos'), ayuda: null },
    ],
  };
}

// ─── B4 T23B r1: las rutas de carga y de error de las pantallas, en funciones puras (I2) ───────────────────────────────────

/**
 * Lo que se ve de los leads de la campaña elegida. `cargados` es lo último que llegó ({vuelta, marca, datos, error}), `clave` la vuelta
 * vigente (la campaña y el turno), `marcaElegida` el id de la campaña elegida y `pide` si la pestaña los usa. Lo que llegó de OTRA
 * campaña no se ve; la campaña recién elegida está 'cargando' (la barra gris, no «—» atenuado de 'actualizando'); la misma que se
 * vuelve a pedir conserva sus leads ('actualizando'). `estado` es el de la tarjeta de convertidos.
 * @param {{vuelta: number | string, marca?: string | null, datos: any, error: unknown} | null | undefined} cargados
 * @param {string} clave
 * @param {string} marcaElegida
 * @param {boolean} pide
 * @returns {{leads: any, cargando: boolean, recargando: boolean, error: unknown, estado: EstadoKpi}}
 */
export function lecturaLeadsCampana(cargados, clave, marcaElegida, pide) {
  const lectura = lecturaDeFuente(cargados, clave);
  const delaCampana = lectura.marca === marcaElegida;
  const leads = delaCampana ? lectura.datos : null;
  const cargando = pide && (lectura.cargando || !delaCampana);
  const error = delaCampana ? lectura.error : null;
  const recargando = cargando && leads !== null;
  /** @type {EstadoKpi} */
  const estado = error ? 'error' : cargando ? (leads === null ? 'cargando' : 'actualizando') : 'listo';
  return { leads, cargando, recargando, error, estado };
}

/**
 * Una respuesta es vigente si es de lo que se está viendo (el cliente o el proveedor abierto): una vieja que llega tarde se descarta.
 * @param {unknown} id
 * @param {unknown} vigente
 * @returns {boolean}
 */
export function esRespuestaVigente(id, vigente) {
  return id !== null && id !== undefined && id === vigente;
}

/**
 * El siguiente perfil 360 de la Agenda cuando llega una respuesta: una vieja (de un cliente que ya no es el abierto) deja el estado
 * como estaba, porque si no la ficha del cliente abierto se quedaría en 'cargando' para siempre. Un error conserva los datos del
 * MISMO cliente (queda con su aviso); sin datos previos o de otro cliente, queda sin datos.
 * @param {{id: number, datos: any, error: unknown} | null} previo
 * @param {number} id  el cliente de la respuesta
 * @param {number | null} vigente  el cliente abierto ahora
 * @param {{datos: any} | {error: unknown}} resultado
 * @returns {{id: number, datos: any, error: unknown} | null}
 */
export function siguientePerfil(previo, id, vigente, resultado) {
  if (!esRespuestaVigente(id, vigente)) return previo;
  if ('error' in resultado) return { id, datos: previo?.id === id ? previo.datos : null, error: resultado.error };
  return { id, datos: resultado.datos, error: null };
}

/**
 * Los pedidos de compra de un proveedor de GET /compras/pedidos?supplier_id=: {items, total}. Una respuesta sin una lista en `data`
 * lanza Error('El servidor no devolvió datos.') (nunca un «0 pedidos» falso); `total` no es menor que lo que llegó.
 * @param {any} respuesta
 * @returns {{items: any[], total: number}}
 */
export function pedidosDeProveedor(respuesta) {
  const items = datosDe(respuesta) && Array.isArray(respuesta.data) ? respuesta.data : null;
  if (items === null) throw new Error('El servidor no devolvió datos.');
  return { items, total: Math.max(numeroFinito(respuesta.total) ?? 0, items.length) };
}

/**
 * El estado de la tarjeta «Pedidos de compra» de la ficha del proveedor y el texto de su lista, con el error, el total y las filas:
 * 'cargando' sin total ni error, 'error' con error, 'listo' en otro caso; la lista dice «No hay pedidos» solo con total 0.
 * @param {unknown} error
 * @param {number | null} total
 * @param {ReadonlyArray<unknown>} items
 * @returns {{estado: EstadoKpi, texto: string | null}}
 */
export function estadoPedidosProveedor(error, total, items) {
  if (error) return { estado: 'error', texto: 'No se pudieron cargar los pedidos de compra.' };
  if (total === null) return { estado: 'cargando', texto: 'Cargando pedidos de compra…' };
  return { estado: 'listo', texto: total === 0 && items.length === 0 ? 'No hay pedidos de compra emitidos aún a este proveedor.' : null };
}

/**
 * Qué muestra la columna de contexto del Asistente: 'cargando'; 'contexto' (si hay uno a la vista); 'error' (la carga falló: el aviso con
 * «Reintentar», sin «Sin cliente seleccionado» debajo, porque el cliente sí se eligió); o 'vacio' (ninguno elegido).
 * @param {boolean} cargando
 * @param {unknown} error
 * @param {unknown} contexto
 * @returns {'cargando' | 'error' | 'contexto' | 'vacio'}
 */
export function vistaContexto(cargando, error, contexto) {
  if (cargando) return 'cargando';
  if (contexto) return 'contexto';
  return error ? 'error' : 'vacio';
}
