/**
 * frontend/tests/test_resumen_pago.mjs
 * U24 (Bloque 2, T6B): el Resumen Financiero del pedido en pesos enteros: total, pagado (= total − saldo, como
 * get_pedido), saldo pendiente o saldo a favor, anticipo requerido (con su %), anticipo pendiente y % pagado.
 * Ruling T6B-4: sin anticipo_pct (pedido sin snapshot) el % es 60, igual que anticipo_del_pedido y dinero-ventas.js.
 */

import assert from 'node:assert/strict';
import { resumenPagoPedido } from '../src/lib/resumen-pago.js';

console.log('--- CASO 1: normal (60/40 con el anticipo pagado) ---');
{
  const r = resumenPagoPedido({
    total_cop: 1840614, saldo_cop: 736246, anticipo_requerido: 1104368, anticipo_pendiente: 0, anticipo_pct: 60,
  });
  assert.deepEqual(r, {
    total: 1840614, pagado: 1104368, saldo: 736246, saldoAFavor: 0, requerido: 1104368, anticipoPct: 60,
    anticipoPendiente: 0, pctPagado: 60, caso: 'pendiente',
  });
}

console.log('--- CASO 2: pago parcial (R4); sin anticipo_pendiente se calcula requerido − pagado ---');
{
  const base = { total_cop: 1840614, saldo_cop: 1340614, anticipo_requerido: 1104368, anticipo_pct: 60 };
  const r = resumenPagoPedido(base);
  assert.equal(r.pagado, 500000);
  assert.equal(r.anticipoPendiente, 604368);
  assert.equal(r.saldo, 1340614);
  assert.equal(r.pctPagado, 27);
  // Si el servidor manda anticipo_pendiente, manda ese (es la misma cuenta que recalculate_sale_order_state).
  assert.equal(resumenPagoPedido({ ...base, anticipo_pendiente: 604368 }).anticipoPendiente, 604368);
  assert.equal(resumenPagoPedido({ ...base, anticipo_pendiente: null }).anticipoPendiente, 604368, 'null = ausente');
}

console.log('--- CASO 3: crédito (anticipo 0%) ---');
{
  const r = resumenPagoPedido({ total_cop: 900000, saldo_cop: 900000, anticipo_requerido: 0, anticipo_pendiente: 0,
    anticipo_pct: 0 });
  assert.equal(r.pagado, 0);
  assert.equal(r.anticipoPendiente, 0);
  assert.equal(r.pctPagado, 0);
  assert.equal(r.anticipoPct, 0, 'un 0 real no se cambia por 60');
  assert.equal(r.requerido, 0);
  assert.equal(r.caso, 'pendiente');
}

console.log('--- CASO 4: saldo negativo (re-cotización a la baja con el anticipo ya pagado) ---');
{
  const r = resumenPagoPedido({ total_cop: 1000000, saldo_cop: -50000, anticipo_requerido: 600000, anticipo_pct: 60 });
  assert.equal(r.saldo, 0);
  assert.equal(r.saldoAFavor, 50000);
  assert.equal(r.pagado, 1050000, 'lo pagado de verdad (total − saldo)');
  assert.equal(r.pctPagado, 100, 'la barra no pasa de 100');
  assert.equal(r.anticipoPendiente, 0);
  assert.equal(r.caso, 'a_favor');
}

console.log('--- CASO 5: pagado completo ---');
{
  const r = resumenPagoPedido({ total_cop: 500000, saldo_cop: 0, anticipo_requerido: 300000, anticipo_pct: 60 });
  assert.equal(r.saldo, 0);
  assert.equal(r.saldoAFavor, 0);
  assert.equal(r.pctPagado, 100);
  assert.equal(r.caso, 'completo');
}

console.log('--- CASO 6: total 0 o campos ausentes: todo 0, sin NaN, y el % por defecto es 60 ---');
{
  for (const p of [{}, null, undefined, { total_cop: 0, saldo_cop: 0 }, { total_cop: 'x', saldo_cop: NaN }]) {
    const r = resumenPagoPedido(p);
    assert.deepEqual(r, {
      total: 0, pagado: 0, saldo: 0, saldoAFavor: 0, requerido: 0, anticipoPct: 60, anticipoPendiente: 0,
      pctPagado: 0, caso: 'completo',
    }, JSON.stringify(p));
  }
}

console.log('--- CASO 7: sin anticipo_pct (pedido sin snapshot) -> 60 (ruling T6B-4) ---');
{
  const r = resumenPagoPedido({ total_cop: 1000000, saldo_cop: 1000000, anticipo_requerido: 600000 });
  assert.equal(r.anticipoPct, 60);
  assert.equal(resumenPagoPedido({ total_cop: 1, saldo_cop: 1, anticipo_pct: null }).anticipoPct, 60);
  assert.equal(resumenPagoPedido({ total_cop: 1, saldo_cop: 1, anticipo_pct: 12.5 }).anticipoPct, 12.5);
  // Sin anticipo_requerido (dato viejo en caché) se calcula con el % al peso, como el servidor.
  const sinRequerido = resumenPagoPedido({ total_cop: 1000001, saldo_cop: 1000001, anticipo_pct: 50 });
  assert.equal(sinRequerido.requerido, 500001, 'round(1000001 × 50 / 100) half-up');
  assert.equal(sinRequerido.anticipoPendiente, 500001);
}

console.log('--- CASO 8: decimales viejos se redondean al peso ---');
{
  const r = resumenPagoPedido({ total_cop: 2786923.08, saldo_cop: 1114769.23, anticipo_requerido: 1672153.85,
    anticipo_pct: 60 });
  assert.equal(r.total, 2786923);
  assert.equal(r.saldo, 1114769);
  assert.equal(r.pagado, 1672154);
  assert.equal(r.requerido, 1672154);
  assert.ok(Object.values(r).every((v) => typeof v === 'string' || Number.isInteger(v) || v === 60), 'enteros');
}

console.log('--- CASO 9: un saldo mayor que el total (dato inconsistente) no muestra un pagado negativo ---');
{
  const r = resumenPagoPedido({ total_cop: 100000, saldo_cop: 150000, anticipo_requerido: 60000, anticipo_pct: 60 });
  assert.equal(r.pagado, 0);
  assert.equal(r.pctPagado, 0);
  assert.equal(r.saldo, 150000);
  assert.equal(r.anticipoPendiente, 60000);
}

console.log('OK test_resumen_pago.mjs');
