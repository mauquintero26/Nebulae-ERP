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

/** El número de `v` si es finito (también un número en texto, como un Decimal del API), o null. */
function numeroFinito(v) {
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
 *    hacia arriba (Math.round; sin −0).
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
  const pct = Math.round(Number((crudo * 10).toPrecision(12))) / 10;
  return { tipo: 'pct', pct: pct === 0 ? 0 : pct };
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
