/**
 * frontend/tests/test_pricing.mjs
 * Reproduce el bug reportado: la cotizacion mostraba un TOTAL (margen
 * sobre precio de venta) distinto del precio UNITARIO (markup sobre
 * costo) para el mismo margen_pct, aun con qty=1 donde unitario*qty
 * deberia ser exactamente igual al total.
 */

import assert from 'node:assert/strict';
import { computeMarginPrice, MARGIN_PCT_CAP } from '../src/lib/pricing.js';

console.log('--- TEST 1: unitario * qty == total, siempre (caso real reportado) ---');
{
  // cost_usd=35, flete_usd=0, trm=4200 -> costo_total = 147000, margen=30%
  const { totalCop, unitPriceCop } = computeMarginPrice(147000, 30, 1);
  assert.equal(totalCop, 210000, 'total con margen sobre precio de venta');
  assert.equal(unitPriceCop, 210000, 'unitario debe coincidir con el total cuando qty=1');
}

console.log('--- TEST 2: con qty > 1, unitario * qty == total exacto ---');
{
  const qty = 3;
  const costoTotal = 147000 * qty; // como lo arma cotizacion-client.tsx antes de llamar
  const { totalCop, unitPriceCop } = computeMarginPrice(costoTotal, 30, qty);
  assert.equal(totalCop, 630000);
  assert.equal(unitPriceCop * qty, totalCop, 'unitario*qty no debe derivar del total');
}

console.log('--- TEST 3: margen_pct se limita a MARGIN_PCT_CAP (evita division por cero) ---');
{
  assert.equal(MARGIN_PCT_CAP, 95);
  const r150 = computeMarginPrice(100000, 150, 1);
  const r95 = computeMarginPrice(100000, 95, 1);
  assert.equal(r150.totalCop, r95.totalCop, 'margen > tope debe comportarse igual que el tope');
  assert.equal(r150.margenPct, 95);

  const r100 = computeMarginPrice(100000, 100, 1);
  assert.ok(Number.isFinite(r100.totalCop), 'margen=100 no debe producir Infinity/NaN');
}

console.log('--- TEST 4: margen 0 no altera el costo ---');
{
  const { totalCop, unitPriceCop } = computeMarginPrice(50000, 0, 1);
  assert.equal(totalCop, 50000);
  assert.equal(unitPriceCop, 50000);
}

console.log('✓ Todos los tests de pricing pasaron exitosamente.');
