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
 */
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

/**
 * El cuerpo COMPLETO de PATCH /ventas/cotizaciones/{id} con lo que la calculadora tiene en pantalla (armarPayload,
 * ruling B2-T9A-1): las lineas calculadas, TRM, subtotal, descuento, total, notas y fecha de entrega. Notas y fecha
 * vacias conservan las de la cotizacion (como siempre).
 * @param {{ filas: Array<Record<string, any>>, subtotal: number, total: number }} calculo  calcularCotizacion(...)
 * @param {{ trm: any, descuento: any, notas?: string, fechaEntrega?: string }} formulario
 * @param {Record<string, any>} cot
 * @returns {Record<string, any>}
 */
export function cuerpoCompletoCalculadora(calculo, formulario, cot) {
  return {
    productos: calculo.filas.map((p) => ({
      product_name: p.product_name,
      sku_id: p.sku_id || null,
      qty: Number(p.qty),
      cost_usd: Number(p.cost_usd),
      flete_usd: Number(p.flete_usd),
      margen_pct: Number(p.margen_pct),
      unit_price_cop: p.price_cop_unit,
      total_cop: p.total_cop,
      es_libre: !!p.es_libre,
    })),
    trm_rate: Number(formulario.trm),
    subtotal_cop: calculo.subtotal, descuento_pct: Number(formulario.descuento),
    total_cop: calculo.total,
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
 * B2-T9A ronda 1: si el guardado de la calculadora exige precios validos (cada linea y el total mayores que $0). Si
 * viajan los precios (cuerpoDeGuardado), si. Si no viajan (solo notas o fecha), solo cuando la cotizacion todavia no
 * tiene total: guardar sin precios no la cotiza, y se sigue pidiendo el costo como antes. Asi una linea con costo 0 ya
 * no impide guardar solo la nota de una cotizacion calculada.
 * @param {Record<string, any>} cuerpo  cuerpoDeGuardado(...)
 * @param {Record<string, any> | null | undefined} cot
 * @returns {boolean}
 */
export function validaPreciosAlGuardar(cuerpo, cot) {
  return Array.isArray(cuerpo?.productos) || !(Number(cot?.total_cop) > 0);
}
