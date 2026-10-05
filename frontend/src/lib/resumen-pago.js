/**
 * Resumen Financiero del pedido de venta (U24, Bloque 2): los numeros de los tres recuadros (anticipo requerido,
 * pagado verificado y saldo), la barra de progreso y el aviso de anticipo pendiente (R4) de venta/[id]. JS plano para
 * probarlo con node (frontend/tests/test_resumen_pago.mjs).
 *
 * Solo cuentas, en pesos enteros (pesos.js): el formato lo pone la pantalla (formatoPesos / formatoPct de
 * dinero-ventas.js). Los datos salen de GET /ventas/pedidos/{id}: total_cop, saldo_cop, anticipo_requerido,
 * anticipo_pendiente y anticipo_pct (null si el pedido no tiene snapshot).
 */
import { redondearPeso } from './pesos.js';
import { porcentajeDePesos } from './dinero-ventas.js';

/** % del anticipo cuando el pedido no tiene snapshot: el mismo 60 de anticipo_del_pedido y dinero-ventas.js. */
const PCT_ANTICIPO_POR_DEFECTO = 60;

/**
 * @typedef {{
 *   total: number, pagado: number, saldo: number, saldoAFavor: number, requerido: number, anticipoPct: number,
 *   anticipoPendiente: number, pctPagado: number, caso: 'pendiente' | 'completo' | 'a_favor'
 * }} ResumenPagoPedido
 */

/**
 * Cuentas del Resumen Financiero de un pedido:
 * - total y saldo al peso; pagado = total − saldo (lo mismo que get_pedido), nunca negativo.
 * - saldo pendiente = max(0, saldo); saldoAFavor = lo que el saldo quede por debajo de 0 (credito por re-cotizar a la
 *   baja con el anticipo ya pagado).
 * - anticipoPct = anticipo_pct ?? 60 (pedido sin snapshot, como anticipo_del_pedido del servidor); requerido =
 *   anticipo_requerido del GET (si falta, round(total × pct / 100) al peso, la cuenta del servidor).
 * - anticipoPendiente = anticipo_pendiente del GET, o requerido − pagado si no viene; nunca negativo (R4).
 * - pctPagado: 0..100, entero (0 si el total es 0).
 * - caso: el tercer recuadro: 'pendiente' (saldo > 0), 'a_favor' (saldo a favor > 0) o 'completo'.
 * Datos ausentes o no numericos valen 0: nunca NaN.
 * @param {any} p
 * @returns {ResumenPagoPedido}
 */
export function resumenPagoPedido(p) {
  const total = redondearPeso(p?.total_cop);
  const saldoBruto = redondearPeso(p?.saldo_cop);
  const pagado = Math.max(0, total - saldoBruto);
  const saldo = Math.max(0, saldoBruto);
  const saldoAFavor = saldoBruto < 0 ? -saldoBruto : 0;
  const pct = Number(p?.anticipo_pct ?? PCT_ANTICIPO_POR_DEFECTO);
  const anticipoPct = Number.isFinite(pct) ? pct : PCT_ANTICIPO_POR_DEFECTO;
  const requerido = p?.anticipo_requerido !== null && p?.anticipo_requerido !== undefined
    ? redondearPeso(p.anticipo_requerido)
    : porcentajeDePesos(total, anticipoPct);
  const anticipoPendiente = Math.max(0, redondearPeso(p?.anticipo_pendiente ?? (requerido - pagado)));
  const pctPagado = total > 0 ? Math.min(100, Math.max(0, Math.round((pagado * 100) / total))) : 0;
  const caso = saldo > 0 ? 'pendiente' : saldoAFavor > 0 ? 'a_favor' : 'completo';
  return { total, pagado, saldo, saldoAFavor, requerido, anticipoPct, anticipoPendiente, pctPagado, caso };
}
