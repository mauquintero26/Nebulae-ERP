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
 *   total: number, pagado: number | null, saldo: number | null, saldoAFavor: number | null, requerido: number,
 *   anticipoPct: number, anticipoPendiente: number | null, pctPagado: number | null,
 *   caso: 'pendiente' | 'completo' | 'a_favor' | 'desconocido'
 * }} ResumenPagoPedido
 */

/** Numero finito, o null si falta (null, undefined, '') o no es un numero. */
function numeroONull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Cuentas del Resumen Financiero de un pedido:
 * - total al peso; anticipoPct = anticipo_pct ?? 60 (pedido sin snapshot, como anticipo_del_pedido del servidor);
 *   requerido = anticipo_requerido del GET (si falta, round(total × pct / 100) al peso, la cuenta del servidor).
 * - Sin saldo_cop (null, ausente o no numerico) no se supone nada pagado ni pendiente: caso 'desconocido' y pagado,
 *   saldo, saldoAFavor y pctPagado en null (la pantalla no pinta porcentajes); anticipoPendiente solo si el servidor
 *   lo manda.
 * - Con saldo: pagado = max(0, redondearPeso(total − saldo)) (la diferencia redondeada, como resumenAnticipoCotizacion
 *   y get_pedido); saldo pendiente = max(0, saldo); saldoAFavor = lo que el saldo quede por debajo de 0 (credito por
 *   re-cotizar a la baja con el anticipo ya pagado).
 * - anticipoPendiente = anticipo_pendiente del GET, o requerido − pagado si no viene; nunca negativo (R4). B3 T19 r1:
 *   en un pedido CANCELADO, 0 (ya no se cobra; el GET puede seguir mandando anticipo_pendiente).
 * - pctPagado: entero 0..100 (Math.round), con dos topes que se apartan de U24 a proposito: con saldo pendiente como
 *   maximo 99 (no se ve 100% si todavia se debe algo) y con algo pagado como minimo 1 (no se ve 0% con un pago real).
 *   Total 0: 100 si hay algo pagado, si no 0.
 * - caso: el tercer recuadro: 'pendiente' (saldo > 0), 'a_favor' (saldo a favor > 0), 'completo' o 'desconocido'.
 * Nunca NaN.
 * @param {any} p
 * @returns {ResumenPagoPedido}
 */
export function resumenPagoPedido(p) {
  const total = redondearPeso(p?.total_cop);
  const pct = Number(p?.anticipo_pct ?? PCT_ANTICIPO_POR_DEFECTO);
  const anticipoPct = Number.isFinite(pct) ? pct : PCT_ANTICIPO_POR_DEFECTO;
  const requerido = p?.anticipo_requerido !== null && p?.anticipo_requerido !== undefined
    ? redondearPeso(p.anticipo_requerido)
    : porcentajeDePesos(total, anticipoPct);
  const pendienteServidor = numeroONull(p?.anticipo_pendiente);
  const cancelado = p?.estado === 'CANCELADO';
  const saldoCrudo = numeroONull(p?.saldo_cop);
  if (saldoCrudo === null) {
    return {
      total, pagado: null, saldo: null, saldoAFavor: null, requerido, anticipoPct,
      anticipoPendiente: cancelado ? 0 : pendienteServidor === null ? null : Math.max(0, redondearPeso(pendienteServidor)),
      pctPagado: null, caso: 'desconocido',
    };
  }
  const saldoBruto = redondearPeso(saldoCrudo);
  const pagado = Math.max(0, redondearPeso((numeroONull(p?.total_cop) ?? 0) - saldoCrudo));
  const saldo = Math.max(0, saldoBruto);
  const saldoAFavor = saldoBruto < 0 ? -saldoBruto : 0;
  const anticipoPendiente = cancelado ? 0 : Math.max(0, redondearPeso(pendienteServidor ?? (requerido - pagado)));
  let pctPagado = total > 0 ? Math.min(100, Math.max(0, Math.round((pagado * 100) / total))) : pagado > 0 ? 100 : 0;
  if (saldo > 0) pctPagado = Math.min(pctPagado, 99);
  if (pagado > 0) pctPagado = Math.max(pctPagado, 1);
  const caso = saldo > 0 ? 'pendiente' : saldoAFavor > 0 ? 'a_favor' : 'completo';
  return { total, pagado, saldo, saldoAFavor, requerido, anticipoPct, anticipoPendiente, pctPagado, caso };
}
