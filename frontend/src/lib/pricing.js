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
