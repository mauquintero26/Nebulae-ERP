/**
 * Precio de venta con margen sobre precio de venta (gross margin: el
 * porcentaje de margen es la fraccion del PRECIO que es ganancia), no
 * markup sobre costo (el porcentaje que se le suma al costo). Es la
 * convencion que ya gobernaba total_cop en cotizaciones/pedidos;
 * unit_price_cop debe derivarse siempre de aqui para que
 * unitario * qty === total.
 *
 * Se limita margen_pct a MARGIN_PCT_CAP para evitar division por cero
 * (a margen=100%, costo / (1 - 1) es indefinido).
 *
 * Pesos enteros (H42): el unitario se redondea al peso y el total es
 * unitario * qty (entero tambien). Asi una linea vale precio unitario x
 * cantidad exacto y la suma de las lineas cuadra con el total; pueden
 * quedar hasta medio peso por linea de diferencia frente al calculo sin
 * redondear (a proposito: exacto al peso, no a la centena ni al mil).
 *
 * B3 T17 (IVA punto 10): la calculadora lleva la tarifa de IVA de cada fila; todas sus cifras (el total de cada
 * linea, subtotal, descuento, IVA por tarifa, total y anticipo) salen de lib/iva.js (totalesIvaCalculadora).
 */
import {
  normalizarTarifaIva, etiquetaTarifaIva, pctTarifaIva, intentarTotalesCotizacion, TARIFA_IVA_POR_DEFECTO,
} from './iva.js';
import { pedidoVigente } from './listas-ventas.js';

export const MARGIN_PCT_CAP = 95;

export function computeMarginPrice(costoTotalCop, margenPct, qty = 1) {
  const margen = Math.min(Math.max(Number(margenPct) || 0, 0), MARGIN_PCT_CAP);
  const bruto = margen > 0 ? costoTotalCop / (1 - margen / 100) : costoTotalCop;
  const q = Number(qty) || 1;
  const unitPriceCop = Math.round(bruto / q);
  const totalCop = Math.round(unitPriceCop * q);
  return { totalCop, unitPriceCop, margenPct: margen };
}

// ─── Calculadora de la cotizacion (CalculadorModal, cotizacion-client.tsx; B2-T9A ronda 1) ──────────────────────────

/**
 * La fila de la calculadora a partir de una linea guardada de la cotizacion. Un margen 0 se respeta (`?? 30`: con
 * `|| 30` una linea a margen 0 subia al 30% al abrir la calculadora y cualquier guardado cambiaba su precio); sin
 * margen guardado, 30. Costo y flete ausentes valen 0. No muta la linea.
 * @param {Record<string, any>} p
 * @returns {Record<string, any>}
 */
export function filaDeCalculadora(p) {
  return { ...p, cost_usd: p?.cost_usd || 0, margen_pct: p?.margen_pct ?? 30, flete_usd: p?.flete_usd || 0, es_libre: !!p?.es_libre };
}

/**
 * Lo que calcula la calculadora (H42): cada fila con su precio (costo + flete en USD x TRM x cantidad, con el margen
 * sobre el precio de venta: unitario redondeado al peso x cantidad, computeMarginPrice), el subtotal, el descuento
 * global redondeado al peso y el total.
 * @param {Array<Record<string, any>>} filas
 * @param {any} trm
 * @param {any} descuentoPct
 * @returns {{ filas: Array<Record<string, any>>, subtotal: number, descTotal: number, total: number }}
 */
export function calcularCotizacion(filas, trm, descuentoPct) {
  const calculadas = (Array.isArray(filas) ? filas : []).map((p) => {
    const costoCop = (Number(p.cost_usd) || 0) * Number(trm);
    const fleteCop = (Number(p.flete_usd) || 0) * Number(trm);
    const costoTotal = (costoCop + fleteCop) * (Number(p.qty) || 1);
    const { totalCop, unitPriceCop, margenPct } = computeMarginPrice(costoTotal, p.margen_pct, Number(p.qty) || 1);
    return { ...p, margen_pct: margenPct, price_cop_unit: unitPriceCop, total_cop: totalCop };
  });
  const subtotal = calculadas.reduce((s, p) => s + p.total_cop, 0);
  const descTotal = Math.round(subtotal * (Number(descuentoPct) || 0) / 100);
  return { filas: calculadas, subtotal, descTotal, total: subtotal - descTotal };
}

// ─── IVA por línea en la calculadora (B3 T17: IVA punto 10, R8) ─────────────────────────────────────────────────────

/** La tarifa de una fila sin tarifa propia: la de Configuración (iva_tarifa_defecto) o, si no es válida, '19' (R8). */
const tarifaPorDefecto = (tarifaIvaDefecto) => normalizarTarifaIva(tarifaIvaDefecto) ?? TARIFA_IVA_POR_DEFECTO;

/**
 * Una fila nueva de la calculadora («Agregar», o la primera de una cotización sin productos), con la tarifa por
 * defecto. _tarifaProducto es la tarifa del producto del catálogo (para el aviso ámbar): una fila nueva no tiene.
 * @param {unknown} tarifaIvaDefecto
 * @returns {Record<string, any>}
 */
export function filaNuevaCalculadora(tarifaIvaDefecto) {
  return { product_name: '', qty: 1, cost_usd: 0, margen_pct: 30, flete_usd: 0, es_libre: false,
    iva_tarifa: tarifaPorDefecto(tarifaIvaDefecto), _tarifaProducto: null };
}

/**
 * Las filas con que abre la calculadora: filaDeCalculadora de cada línea guardada más su tarifa de IVA, que es la de
 * la línea (p.iva_tarifa), o la ACTUAL de su producto (cot.tarifas_producto[i], lista paralela del GET: una cotización
 * vieja sin tarifas), o la de Configuración. _tarifaProducto = cot.tarifas_producto[i] normalizada (null sin
 * producto o sin tarifa definida). Sin productos, una fila nueva. No muta la cotización.
 * @param {Record<string, any> | null | undefined} cot
 * @param {unknown} tarifaIvaDefecto
 * @returns {Array<Record<string, any>>}
 */
export function filasInicialesCalculadora(cot, tarifaIvaDefecto) {
  const productos = Array.isArray(cot?.productos) ? cot.productos : [];
  if (!productos.length) return [filaNuevaCalculadora(tarifaIvaDefecto)];
  const actuales = Array.isArray(cot?.tarifas_producto) ? cot.tarifas_producto : [];
  return productos.map((p, i) => {
    const delProducto = normalizarTarifaIva(actuales[i]);
    return { ...filaDeCalculadora(p),
      iva_tarifa: normalizarTarifaIva(p?.iva_tarifa) ?? delProducto ?? tarifaPorDefecto(tarifaIvaDefecto),
      _tarifaProducto: delProducto };
  });
}

/**
 * Al elegir un producto en el buscador (onSelect): {iva_tarifa: la del catálogo (sel.tarifa_iva) o la de
 * Configuración, _tarifaProducto: la del catálogo o null}. Escribir a mano o pasar a texto libre conserva la tarifa.
 * @param {Record<string, any> | null | undefined} sel  un resultado de GET /crm/products/search
 * @param {unknown} tarifaIvaDefecto
 * @returns {{ iva_tarifa: string, _tarifaProducto: string | null }}
 */
export function tarifaDeSeleccion(sel, tarifaIvaDefecto) {
  const delProducto = normalizarTarifaIva(sel?.tarifa_iva);
  return { iva_tarifa: delProducto ?? tarifaPorDefecto(tarifaIvaDefecto), _tarifaProducto: delProducto };
}

/**
 * R8 (iva_cambiar_en_linea): el aviso ámbar de una fila vinculada al catálogo cuya tarifa no es la de su producto:
 * 'El producto tiene IVA 5%' ('El producto es Exento de IVA' / 'El producto es Excluido de IVA'), o null si es la
 * misma, si la fila no tiene producto (sku_id) o si el producto no tiene tarifa definida.
 * @param {Record<string, any> | null | undefined} fila
 * @returns {string | null}
 */
export function avisoTarifaProducto(fila) {
  const delProducto = normalizarTarifaIva(fila?._tarifaProducto);
  if (!fila?.sku_id || delProducto === null || normalizarTarifaIva(fila.iva_tarifa) === delProducto) return null;
  return pctTarifaIva(delProducto) > 0
    ? `El producto tiene ${etiquetaTarifaIva(delProducto)}`
    : `El producto es ${etiquetaTarifaIva(delProducto)} de IVA`;
}

/**
 * Todas las cifras de la calculadora (nota del controlador tras T13): intentarTotalesCotizacion de lib/iva.js sobre
 * las filas de calcularCotizacion, con el precio NUEVO de cada fila (price_cop_unit) como unit_price_cop (esa clave
 * trae el precio viejo, o falta en una fila nueva). {totales, error}: con una fila incompleta, totales null y el
 * mensaje del 422. No muta las filas.
 * @param {Array<Record<string, any>>} filas  calcularCotizacion(...).filas
 * @param {unknown} descuentoPct
 */
export function totalesIvaCalculadora(filas, descuentoPct) {
  const lineas = (Array.isArray(filas) ? filas : []).map((p) => ({ ...p, unit_price_cop: p?.price_cop_unit }));
  return intentarTotalesCotizacion(lineas, descuentoPct);
}

/**
 * El cuerpo COMPLETO de PATCH /ventas/cotizaciones/{id} con lo que la calculadora tiene en pantalla (armarPayload,
 * ruling B2-T9A-1): las lineas calculadas, TRM, subtotal, descuento, total, notas y fecha de entrega. Notas y fecha
 * vacias conservan las de la cotizacion (como siempre).
 * B3 T17 (IVA punto 10): con `totalesIva` (los totales de totalesIvaCalculadora) cada linea lleva su iva_tarifa y su
 * precio y su total sin IVA de lib/iva.js, y subtotal_cop/total_cop son los de lib/iva.js (el total CON IVA). El
 * servidor recalcula y gana. Sin `totalesIva`, como antes.
 * @param {{ filas: Array<Record<string, any>>, subtotal: number, total: number }} calculo  calcularCotizacion(...)
 * @param {{ trm: any, descuento: any, notas?: string, fechaEntrega?: string }} formulario
 * @param {Record<string, any>} cot
 * @param {{ lineas: Array<Record<string, any>>, subtotal_cop: number, total_cop: number } | null} [totalesIva]
 * @returns {Record<string, any>}
 */
export function cuerpoCompletoCalculadora(calculo, formulario, cot, totalesIva = null) {
  const lineasIva = totalesIva ? totalesIva.lineas : null;
  return {
    productos: calculo.filas.map((p, i) => {
      const linea = {
        product_name: p.product_name,
        sku_id: p.sku_id || null,
        qty: Number(p.qty),
        cost_usd: Number(p.cost_usd),
        flete_usd: Number(p.flete_usd),
        margen_pct: Number(p.margen_pct),
        unit_price_cop: p.price_cop_unit,
        total_cop: p.total_cop,
        es_libre: !!p.es_libre,
      };
      if (!lineasIva) return linea;
      const conIva = lineasIva[i];
      return { ...linea, unit_price_cop: conIva.unit_price_cop, total_cop: conIva.total_cop, iva_tarifa: conIva.iva_tarifa };
    }),
    trm_rate: Number(formulario.trm),
    subtotal_cop: totalesIva ? totalesIva.subtotal_cop : calculo.subtotal, descuento_pct: Number(formulario.descuento),
    total_cop: totalesIva ? totalesIva.total_cop : calculo.total,
    notas: formulario.notas || cot?.notas,
    fecha_entrega_estimada: formulario.fechaEntrega || cot?.fecha_entrega_estimada,
  };
}

/** Los precios del guardado de la calculadora: van los cinco juntos o ninguno. */
const CAMPOS_DE_PRECIO = Object.freeze(['productos', 'subtotal_cop', 'total_cop', 'trm_rate', 'descuento_pct']);
const mismoValor = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * H40 (B2-T9A ronda 1): lo que la calculadora manda al guardar. `actual` e `inicial` son cuerpoCompletoCalculadora al
 * guardar y al abrir la calculadora.
 * - siempre `notas`;
 * - `fecha_entrega_estimada` solo si cambio;
 * - productos, subtotal_cop, total_cop, trm_rate y descuento_pct (los cinco juntos) solo si ALGUNO difiere del calculo
 *   INICIAL (lo que la calculadora mostro al abrirse), no de lo guardado.
 * Asi, guardar solo las notas no reenvia los precios recalculados: en una cotizacion calculada antes de H42 (lineas con
 * centavos) la calculadora los recalcula en pesos enteros, y reenviarlos anulaba la confirmacion del cliente (409) o
 * re-cotizaba en silencio por $1. Sin `inicial` se manda todo. No muta lo recibido.
 * @param {Record<string, any>} actual
 * @param {Record<string, any> | null | undefined} inicial
 * @returns {Record<string, any>}
 */
export function cuerpoDeGuardado(actual, inicial) {
  /** @type {Record<string, any>} */
  const cuerpo = { notas: actual?.notas };
  if (!inicial || !mismoValor(actual?.fecha_entrega_estimada, inicial.fecha_entrega_estimada)) {
    cuerpo.fecha_entrega_estimada = actual?.fecha_entrega_estimada;
  }
  if (!inicial || CAMPOS_DE_PRECIO.some((k) => !mismoValor(actual?.[k], inicial[k]))) {
    for (const k of CAMPOS_DE_PRECIO) cuerpo[k] = actual?.[k];
  }
  return cuerpo;
}

/**
 * B2-T9A ronda 2: el calculo inicial contra el que compara cuerpoDeGuardado. Una cotizacion sin total (> 0) todavia no
 * esta cotizada: null, y se manda el cuerpo completo aunque nada haya cambiado (con los costos ya puestos, «Guardar»
 * mandaba solo las notas y cerraba sin cotizarla).
 * (B3 T17 r2: la cotizacion vieja, sin IVA discriminado, ya no se decide aqui sino en reglaCotizacionSinIva.)
 * @param {Record<string, any> | null | undefined} cot
 * @param {Record<string, any> | null | undefined} inicial  cuerpoCompletoCalculadora al abrir la calculadora
 * @returns {Record<string, any> | null}
 */
export function inicialParaComparar(cot, inicial) {
  return Number(cot?.total_cop) > 0 ? (inicial ?? null) : null;
}

/**
 * B3 T17 r2: la validacion de precios del «Guardar» de la calculadora: hay lineas, cada una y el total son mayores
 * que $0 (los totales de totalesIvaCalculadora; null, con una linea incompleta, no pasa).
 * @param {{ lineas?: Array<{ total_cop?: number }>, total_cop?: number } | null | undefined} totalesIva
 * @returns {boolean}
 */
export function preciosCompletos(totalesIva) {
  const lineas = Array.isArray(totalesIva?.lineas) ? totalesIva.lineas : [];
  return lineas.length > 0 && lineas.every((l) => Number(l?.total_cop) > 0) && Number(totalesIva?.total_cop) > 0;
}

/** B3 T17 r2 (a), todas las filas validas: el aviso neutral. */
export const AVISO_SIN_IVA_SE_APLICA = 'Esta cotización se guardó sin IVA discriminado: al guardar se aplicará el IVA.';
/** B3 T17 r2 (a), alguna fila no pasa la validacion de precios. */
export const AVISO_SIN_IVA_COMPLETA_COSTOS = 'Esta cotización se guardó sin IVA discriminado. Para aplicarle el IVA, '
  + 'completa el costo de los productos que no lo tienen y vuelve a guardar.';
/** B3 T17 r1/r2 (b): congelada por H40 (Pendiente, o Confirmada sin pedido vigente). */
export const AVISO_COT_SIN_IVA = 'Esta cotización se guardó sin IVA discriminado. Las cifras con IVA se guardan si '
  + 'cambias algún precio, y el cliente tendrá que confirmar de nuevo.';

/**
 * B3 T17 r2 (ruling del controlador, reemplaza al de r1): que hace la calculadora con una cotizacion VIEJA (el GET dice
 * iva_discriminado false y tiene total > 0). La calculadora la abre con las cifras CON IVA; comparar contra ellas
 * (inicialParaComparar) manda solo las notas y el servidor nunca le aplica el IVA. null para una cotizacion con
 * tarifas (iva_discriminado true o ausente) o sin precio: se compara exactamente como antes. Si no, {comparaContraNull,
 * aviso, tono}:
 * - (a) no congelada y sin pedido vigente (Borrador, Enviada, Vencida, Rechazada…): con TODAS las filas validas
 *   (preciosCompletos de `totalesIva`, los totales que tiene en pantalla) compara contra null, asi que viajan los
 *   precios con su tarifa y el servidor aplica el IVA (AVISO_SIN_IVA_SE_APLICA, tono neutral); si alguna fila no pasa,
 *   se guardan solo las notas, para no bloquearlas (B2-T9A r1 p2), y AVISO_SIN_IVA_COMPLETA_COSTOS;
 * - (b) congelada por H40 (Pendiente, o Confirmada sin pedido vigente): solo las notas y AVISO_COT_SIN_IVA;
 * - (c) con pedido vigente (pedidoVigente): solo las notas y «… y se actualizará el pedido {numero}.» («el pedido de
 *   venta» sin numero).
 * @param {Record<string, any> | null | undefined} cot  el GET de la cotizacion (estado, total_cop, iva_discriminado,
 *   pedidos_venta)
 * @param {{ lineas?: Array<{ total_cop?: number }>, total_cop?: number } | null | undefined} totalesIva
 * @returns {{ comparaContraNull: boolean, aviso: string, tono: 'neutral' | 'ambar' } | null}
 */
export function reglaCotizacionSinIva(cot, totalesIva) {
  if (cot?.iva_discriminado !== false || !(Number(cot?.total_cop) > 0)) return null;
  const pedido = pedidoVigente(cot);
  if (pedido) {
    const numero = typeof pedido.numero === 'string' && pedido.numero.trim() ? pedido.numero.trim() : 'de venta';
    return { comparaContraNull: false, tono: 'ambar', aviso: 'Esta cotización se guardó sin IVA discriminado. Las cifras '
      + `con IVA se guardan si cambias algún precio, y se actualizará el pedido ${numero}.` };
  }
  if (cot.estado === 'PENDIENTE_CONFIRMACION' || cot.estado === 'CONFIRMADA') {
    return { comparaContraNull: false, aviso: AVISO_COT_SIN_IVA, tono: 'ambar' };
  }
  return preciosCompletos(totalesIva)
    ? { comparaContraNull: true, aviso: AVISO_SIN_IVA_SE_APLICA, tono: 'neutral' }
    : { comparaContraNull: false, aviso: AVISO_SIN_IVA_COMPLETA_COSTOS, tono: 'ambar' };
}

/**
 * B2-T9A rondas 1 y 2: si el guardado de la calculadora exige precios validos (cada linea y el total mayores que $0):
 * solo si viajan los precios. Asi una linea con costo 0 ya no impide guardar solo la nota de una cotizacion calculada;
 * una sin total siempre los manda (inicialParaComparar), asi que se siguen pidiendo los costos al cotizarla.
 * @param {Record<string, any>} cuerpo  cuerpoDeGuardado(...)
 * @returns {boolean}
 */
export function validaPreciosAlGuardar(cuerpo) {
  return Array.isArray(cuerpo?.productos);
}
