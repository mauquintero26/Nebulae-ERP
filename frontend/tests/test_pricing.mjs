/**
 * frontend/tests/test_pricing.mjs
 * Reproduce el bug reportado: la cotizacion mostraba un TOTAL (margen
 * sobre precio de venta) distinto del precio UNITARIO (markup sobre
 * costo) para el mismo margen_pct, aun con qty=1 donde unitario*qty
 * deberia ser exactamente igual al total.
 */

import assert from 'node:assert/strict';
import {
  computeMarginPrice, MARGIN_PCT_CAP, filaDeCalculadora, calcularCotizacion, cuerpoCompletoCalculadora, cuerpoDeGuardado,
  validaPreciosAlGuardar,
} from '../src/lib/pricing.js';

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

console.log('--- TEST 5: precio a peso entero (costo 222.600 con margen 35% -> $342.462) ---');
{
  const { totalCop, unitPriceCop } = computeMarginPrice(222600, 35, 1);
  assert.equal(unitPriceCop, 342462, 'unitario redondeado al peso');
  assert.equal(totalCop, 342462, 'total redondeado al peso');
  assert.ok(Number.isInteger(unitPriceCop) && Number.isInteger(totalCop), 'ambos son enteros');
}

console.log('--- TEST 6: con qty > 1 el total es unitario x qty, entero y sin centavos ---');
{
  const { totalCop, unitPriceCop } = computeMarginPrice(445200, 35, 2);
  assert.equal(unitPriceCop, 342462);
  assert.equal(totalCop, 684924, 'dos unidades dan 684.924, no 684.923,077');
  assert.equal(totalCop, unitPriceCop * 2, 'unitario * qty === total exacto');
  assert.ok(Number.isInteger(unitPriceCop) && Number.isInteger(totalCop), 'ambos son enteros');
}

console.log('--- TEST 7: sin margen el costo tambien se redondea al peso ---');
{
  const { totalCop, unitPriceCop } = computeMarginPrice(50000.4, 0, 1);
  assert.equal(unitPriceCop, 50000);
  assert.equal(totalCop, 50000);
}

console.log('--- B2-T9A r1 TEST 8: filaDeCalculadora respeta un margen 0 (antes `|| 30` lo subia al 30%) ---');
{
  const linea = { product_name: 'Repuesto', qty: 1, cost_usd: 100, flete_usd: 0, margen_pct: 0, unit_price_cop: 420000,
    total_cop: 420000 };
  const fila = filaDeCalculadora(linea);
  assert.equal(fila.margen_pct, 0, 'margen 0 se conserva');
  assert.equal(calcularCotizacion([fila], 4200, 0).filas[0].total_cop, 420000, 'conserva el total (no sube a 600.000)');
  const { margen_pct: _sinMargen, ...sinMargen } = linea;
  assert.equal(filaDeCalculadora(sinMargen).margen_pct, 30, 'sin margen guardado: 30');
  assert.equal(calcularCotizacion([filaDeCalculadora(sinMargen)], 4200, 0).filas[0].total_cop, 600000);
  assert.equal(filaDeCalculadora({ ...linea, margen_pct: null }).margen_pct, 30, 'null tambien es 30');
  // Costo y flete ausentes valen 0; es_libre queda booleano; no muta la linea guardada.
  const vacia = filaDeCalculadora({ product_name: 'Texto libre', qty: 2 });
  assert.equal(vacia.cost_usd, 0);
  assert.equal(vacia.flete_usd, 0);
  assert.equal(vacia.es_libre, false);
  assert.equal(linea.margen_pct, 0);
  assert.ok(!('price_cop_unit' in linea));
}

// COT-20260486 de erp_test (cotizada antes de H42): la linea guarda centavos y la calculadora la recalcula en pesos
// enteros (H42: unitario redondeado x cantidad). 30 USD + 2 USD de flete, x 4200, x 6 = 806.400; con margen 35 ->
// 1.240.615,38 -> unitario 206.769 -> total 1.240.614.
const LINEA_COT_20260486 = { product_name: 'Cuna DEMO', sku_id: 2, qty: 6, cost_usd: 30, flete_usd: 2, margen_pct: 35,
  unit_price_cop: 206769.23076923075, total_cop: 1240615.3846153845, es_libre: false };
const COT_20260486 = { numero: 'COT-20260486', trm_rate: 4200, descuento_pct: 0, notas: 'Entrega en la mañana',
  fecha_entrega_estimada: '2026-10-20T00:00:00', productos: [LINEA_COT_20260486] };
// Lo que la calculadora tiene en pantalla al abrir esa COT (como CalculadorModal arma su estado inicial).
const formularioInicial = (cot) => ({
  filas: cot.productos.map(filaDeCalculadora), trm: cot.trm_rate || 4200, descuento: cot.descuento_pct || 0,
  notas: cot.notas || '', fechaEntrega: cot.fecha_entrega_estimada ? cot.fecha_entrega_estimada.split('T')[0] : '',
});
const cuerpoDe = (f, cot) => cuerpoCompletoCalculadora(calcularCotizacion(f.filas, f.trm, f.descuento), f, cot);

console.log('--- B2-T9A r1 TEST 9: calcularCotizacion y el cuerpo completo de la calculadora (armarPayload) ---');
{
  const f = formularioInicial(COT_20260486);
  const calculo = calcularCotizacion(f.filas, f.trm, f.descuento);
  assert.equal(calculo.filas[0].price_cop_unit, 206769);
  assert.equal(calculo.filas[0].total_cop, 1240614, 'el recalculo en pesos enteros difiere de lo guardado (1.240.615,38)');
  assert.equal(calculo.subtotal, 1240614);
  assert.equal(calculo.descTotal, 0);
  assert.equal(calculo.total, 1240614);
  const conDescuento = calcularCotizacion(f.filas, 4200, 10);
  assert.equal(conDescuento.descTotal, 124061, 'el descuento global se redondea al peso');
  assert.equal(conDescuento.total, 1240614 - 124061);

  const cuerpo = cuerpoDe(f, COT_20260486);
  assert.deepEqual(Object.keys(cuerpo),
    ['productos', 'trm_rate', 'subtotal_cop', 'descuento_pct', 'total_cop', 'notas', 'fecha_entrega_estimada']);
  assert.deepEqual(cuerpo.productos, [{ product_name: 'Cuna DEMO', sku_id: 2, qty: 6, cost_usd: 30, flete_usd: 2,
    margen_pct: 35, unit_price_cop: 206769, total_cop: 1240614, es_libre: false }]);
  assert.equal(cuerpo.trm_rate, 4200);
  assert.equal(cuerpo.fecha_entrega_estimada, '2026-10-20');
  // Notas y fecha vacias conservan las de la cotizacion (como siempre).
  const sinTexto = cuerpoDe({ ...f, notas: '', fechaEntrega: '' }, COT_20260486);
  assert.equal(sinTexto.notas, 'Entrega en la mañana');
  assert.equal(sinTexto.fecha_entrega_estimada, '2026-10-20T00:00:00');
}

console.log('--- B2-T9A r1 TEST 10: cuerpoDeGuardado manda los precios solo si cambiaron frente al calculo inicial ---');
{
  const f = formularioInicial(COT_20260486);
  const inicial = cuerpoDe(f, COT_20260486);
  // Sin tocar nada: solo las notas (los precios recalculados no viajan: antes daban 409 o una RECOTIZADA de -$1).
  assert.deepEqual(cuerpoDeGuardado(cuerpoDe(f, COT_20260486), inicial), { notas: 'Entrega en la mañana' });
  // Solo las notas editadas.
  assert.deepEqual(cuerpoDeGuardado(cuerpoDe({ ...f, notas: 'Llamar antes' }, COT_20260486), inicial), { notas: 'Llamar antes' });
  // Solo la fecha: notas y fecha.
  assert.deepEqual(cuerpoDeGuardado(cuerpoDe({ ...f, fechaEntrega: '2026-11-05' }, COT_20260486), inicial),
    { notas: 'Entrega en la mañana', fecha_entrega_estimada: '2026-11-05' });
  // Un margen cambiado: notas y los cinco de precio juntos (la fecha no cambio, no va).
  const otroMargen = cuerpoDe({ ...f, filas: [{ ...f.filas[0], margen_pct: 36 }] }, COT_20260486);
  const completo = cuerpoDeGuardado(otroMargen, inicial);
  assert.deepEqual(Object.keys(completo).sort(),
    ['descuento_pct', 'notas', 'productos', 'subtotal_cop', 'total_cop', 'trm_rate']);
  assert.deepEqual(completo.productos, otroMargen.productos);
  assert.equal(completo.total_cop, otroMargen.total_cop);
  assert.notEqual(completo.total_cop, inicial.total_cop);
  // TRM o descuento cambiados tambien mandan los cinco.
  for (const cambio of [{ trm: 4300 }, { descuento: 5 }]) {
    assert.ok('productos' in cuerpoDeGuardado(cuerpoDe({ ...f, ...cambio }, COT_20260486), inicial), JSON.stringify(cambio));
  }
  // Vincular la linea a otro producto del catalogo cambia `productos`: van los precios (el servidor decide si anula).
  const vinculada = cuerpoDe({ ...f, filas: [{ ...f.filas[0], sku_id: 9 }] }, COT_20260486);
  assert.ok('productos' in cuerpoDeGuardado(vinculada, inicial));
  // Margen y fecha a la vez: todo.
  const todo = cuerpoDeGuardado(cuerpoDe({ ...f, fechaEntrega: '2026-11-05', filas: [{ ...f.filas[0], margen_pct: 36 }] },
    COT_20260486), inicial);
  assert.equal(Object.keys(todo).length, 7);
  // Sin calculo inicial se manda todo (como antes).
  assert.deepEqual(cuerpoDeGuardado(inicial, null), inicial);
  // No muta lo recibido.
  const copia = JSON.parse(JSON.stringify(inicial));
  cuerpoDeGuardado(otroMargen, inicial);
  assert.deepEqual(inicial, copia);
}

console.log('--- B2-T9A r1 TEST 11: validaPreciosAlGuardar (costos en $0: solo si viajan precios o al cotizar por primera vez) ---');
{
  const f = formularioInicial(COT_20260486);
  const inicial = cuerpoDe(f, COT_20260486);
  const soloNotas = cuerpoDeGuardado(cuerpoDe(f, COT_20260486), inicial);
  const conPrecios = cuerpoDeGuardado(cuerpoDe({ ...f, descuento: 5 }, COT_20260486), inicial);
  // Cotizacion ya calculada: guardar solo las notas no depende de los precios (una linea con costo 0 ya no lo impide);
  // con los precios en el cuerpo, se validan.
  assert.equal(validaPreciosAlGuardar(soloNotas, { total_cop: 1840615.38 }), false);
  assert.equal(validaPreciosAlGuardar(conPrecios, { total_cop: 1840615.38 }), true);
  // Sin total (cotizar por primera vez): se validan siempre, como antes ('Cada producto necesita un costo mayor a $0').
  for (const total of [0, '0.00', null, undefined]) {
    assert.equal(validaPreciosAlGuardar(soloNotas, { total_cop: total }), true, String(total));
  }
  assert.equal(validaPreciosAlGuardar(soloNotas, null), true);
}

console.log('✓ Todos los tests de pricing pasaron exitosamente.');
