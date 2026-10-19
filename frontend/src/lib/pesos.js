/**
 * Dinero de Ventas en pesos enteros (H42). Espejo de backend/app/core/ventas_dinero.py
 * (redondear_peso / pesos): los precios de cotizaciones, pedidos y ordenes de pago se guardan y
 * se muestran al peso, exactos, nunca a la centena ni al mil.
 *
 * Con positivos Math.round (half-up) y ROUND_HALF_UP del backend dan el mismo resultado. Solo
 * difieren en un empate negativo exacto (-2.5): Math.round da -2 y el backend -3; no ocurre con
 * montos que ya son enteros.
 */

/** Redondea al peso. null, undefined, '' y lo que no es numero (NaN, Infinity) valen 0. */
export function redondearPeso(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * '$' + miles con punto, sin decimales: '$1.062.523'; los negativos (credito a favor) '-$5.000';
 * el 0 '$0'. La agrupacion es manual y no usa toLocaleString: con algunas versiones de ICU 'es'
 * no agrupa los numeros de 4 cifras.
 */
export function formatoPesos(v) {
  const n = redondearPeso(v);
  return (n < 0 ? '-' : '') + '$' + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * La cantidad como la escribe el documento (y el PDF): '2', '2,5'. '' si no es un número (B3 T12). B3 T17 r1: vive
 * aquí para que lib/iva.js la use sin un import circular; documento-comercial.js la reexporta (la misma función).
 * @param {unknown} v
 * @returns {string}
 */
export function formatoCantidad(v) {
  return typeof v === 'number' && Number.isFinite(v) ? String(v).replace('.', ',') : '';
}
