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
 */
export const MARGIN_PCT_CAP = 95;

export function computeMarginPrice(costoTotalCop, margenPct, qty = 1) {
  const margen = Math.min(Math.max(Number(margenPct) || 0, 0), MARGIN_PCT_CAP);
  const totalCop = margen > 0 ? costoTotalCop / (1 - margen / 100) : costoTotalCop;
  const unitPriceCop = totalCop / (Number(qty) || 1);
  return { totalCop, unitPriceCop, margenPct: margen };
}
