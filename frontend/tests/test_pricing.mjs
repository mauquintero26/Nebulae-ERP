/**
 * frontend/tests/test_pricing.mjs
 * Reproduce el bug reportado: la cotizacion mostraba un TOTAL (margen
 * sobre precio de venta) distinto del precio UNITARIO (markup sobre
 * costo) para el mismo margen_pct, aun con qty=1 donde unitario*qty
 * deberia ser exactamente igual al total.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeMarginPrice, MARGIN_PCT_CAP, filaDeCalculadora, calcularCotizacion, cuerpoCompletoCalculadora, cuerpoDeGuardado,
  validaPreciosAlGuardar, inicialParaComparar, filaNuevaCalculadora, filasInicialesCalculadora, tarifaDeSeleccion,
  avisoTarifaProducto, totalesIvaCalculadora, reglaCotizacionSinIva, preciosCompletos, AVISO_COT_SIN_IVA,
  errorPreciosCalculadora, referenciaDeGuardado,
  AVISO_SIN_IVA_SE_APLICA, AVISO_SIN_IVA_COMPLETA_COSTOS,
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

console.log('--- B2-T9A r1/r2 TEST 11: validaPreciosAlGuardar e inicialParaComparar (cotizar por primera vez manda todo) ---');
{
  const f = formularioInicial(COT_20260486);
  const inicial = cuerpoDe(f, COT_20260486);
  const sinCambios = cuerpoDe(f, COT_20260486);
  const soloNotas = cuerpoDeGuardado(sinCambios, inicial);
  const conPrecios = cuerpoDeGuardado(cuerpoDe({ ...f, descuento: 5 }, COT_20260486), inicial);
  // Los costos en $0 se validan solo si viajan los precios: guardar solo las notas de una cotizacion ya calculada no
  // depende de ellos (una linea con costo 0 ya no lo impide).
  assert.equal(validaPreciosAlGuardar(soloNotas), false);
  assert.equal(validaPreciosAlGuardar(conPrecios), true);
  // Cotizacion ya calculada (total > 0): se compara con el calculo inicial.
  assert.equal(inicialParaComparar({ ...COT_20260486, total_cop: 1840615.38 }, inicial), inicial);
  // Ronda 2: sin total (cotizar por primera vez) no hay con que comparar. Con los costos ya puestos y nada cambiado va el
  // cuerpo completo (antes «Guardar» mandaba solo las notas y cerraba sin cotizar), y los precios se validan.
  for (const total of [0, '0.00', null, undefined]) {
    const referencia = inicialParaComparar({ ...COT_20260486, total_cop: total }, inicial);
    assert.equal(referencia, null, String(total));
    const cuerpo = cuerpoDeGuardado(sinCambios, referencia);
    assert.deepEqual(cuerpo, sinCambios, `cuerpo completo con total ${String(total)}`);
    assert.equal(validaPreciosAlGuardar(cuerpo), true);
  }
  assert.equal(inicialParaComparar(null, inicial), null);
}

console.log('--- B3 T17 TEST 12: la tarifa de IVA de cada fila de la calculadora ---');
{
  // Fila nueva: la tarifa por defecto de Configuración, o '19' (R8) si no viene o no es válida.
  assert.deepEqual(filaNuevaCalculadora('5'), { product_name: '', qty: 1, cost_usd: 0, margen_pct: 30, flete_usd: 0,
    es_libre: false, iva_tarifa: '5', _tarifaProducto: null });
  for (const raro of [undefined, null, '', '16']) assert.equal(filaNuevaCalculadora(raro).iva_tarifa, '19', String(raro));
  // Una COT sin productos abre con una fila nueva.
  assert.deepEqual(filasInicialesCalculadora({ productos: [] }, 'EXENTO'), [filaNuevaCalculadora('EXENTO')]);
  assert.deepEqual(filasInicialesCalculadora(null, '19'), [filaNuevaCalculadora('19')]);
  // Las guardadas: su tarifa; si no la tienen (COT vieja), la ACTUAL del producto (tarifas_producto, lista paralela);
  // si tampoco, la de Configuración. _tarifaProducto es la del producto (para el aviso ámbar).
  const cot = {
    productos: [
      { product_name: 'Rodillo', sku_id: 4, qty: 6, cost_usd: 30, margen_pct: 35, iva_tarifa: '5' },
      { product_name: 'Pintura', sku_id: 7, qty: 4, cost_usd: 20 },
      { product_name: 'Texto libre', qty: 1, cost_usd: 1, es_libre: true },
    ],
    tarifas_producto: ['19', 'EXENTO', null],
  };
  const filas = filasInicialesCalculadora(cot, '19');
  assert.deepEqual(filas.map((f) => [f.iva_tarifa, f._tarifaProducto]), [['5', '19'], ['EXENTO', 'EXENTO'], ['19', null]]);
  assert.deepEqual(filasInicialesCalculadora(cot, 'EXCLUIDO').map((f) => f.iva_tarifa), ['5', 'EXENTO', 'EXCLUIDO']);
  // Es filaDeCalculadora más la tarifa (margen guardado o 30) y no muta la COT.
  assert.equal(filas[0].margen_pct, 35);
  assert.equal(filas[1].margen_pct, 30);
  assert.ok(!('iva_tarifa' in cot.productos[1]));
  // Sin tarifas_producto (una respuesta vieja) cae a la de Configuración.
  assert.deepEqual(filasInicialesCalculadora({ productos: cot.productos }, '5').map((f) => f.iva_tarifa), ['5', '5', '5']);
  // Al elegir un producto del buscador: su tarifa del catálogo o, si no la tiene, la de Configuración.
  assert.deepEqual(tarifaDeSeleccion({ id: 4, tarifa_iva: '5' }, '19'), { iva_tarifa: '5', _tarifaProducto: '5' });
  assert.deepEqual(tarifaDeSeleccion({ id: 4, tarifa_iva: null }, '19'), { iva_tarifa: '19', _tarifaProducto: null });
  assert.deepEqual(tarifaDeSeleccion(null, 'EXENTO'), { iva_tarifa: 'EXENTO', _tarifaProducto: null });
}

console.log('--- B3 T17 TEST 13: avisoTarifaProducto (la tarifa de la línea no es la del producto) ---');
{
  const fila = { sku_id: 4, iva_tarifa: '19', _tarifaProducto: '5' };
  assert.equal(avisoTarifaProducto(fila), 'El producto tiene IVA 5%');
  assert.equal(avisoTarifaProducto({ ...fila, _tarifaProducto: '19', iva_tarifa: '5' }), 'El producto tiene IVA 19%');
  assert.equal(avisoTarifaProducto({ ...fila, _tarifaProducto: 'EXENTO' }), 'El producto es Exento de IVA');
  assert.equal(avisoTarifaProducto({ ...fila, _tarifaProducto: 'EXCLUIDO' }), 'El producto es Excluido de IVA');
  // Sin aviso: la misma tarifa, una línea sin producto del catálogo o un producto sin tarifa definida.
  assert.equal(avisoTarifaProducto({ ...fila, iva_tarifa: '5' }), null);
  assert.equal(avisoTarifaProducto({ ...fila, sku_id: null }), null);
  assert.equal(avisoTarifaProducto({ ...fila, _tarifaProducto: null }), null);
  assert.equal(avisoTarifaProducto(null), null);
}

console.log('--- B3 T17 TEST 14: totalesIvaCalculadora usa el precio NUEVO (price_cop_unit) de cada fila ---');
{
  // El recorrido del Bloque 1 como filas de la calculadora: unit_price_cop trae el valor VIEJO (o falta, en una fila nueva).
  const filasCalc = [
    { product_name: 'Rodillo', qty: 6, price_cop_unit: 206769, unit_price_cop: 150000, iva_tarifa: '19' },
    { product_name: 'Pintura', qty: 4, price_cop_unit: 117000, iva_tarifa: '19' },
    { product_name: 'Cinta', qty: 10, price_cop_unit: 13200, unit_price_cop: undefined, iva_tarifa: '5' },
  ];
  const sin = totalesIvaCalculadora(filasCalc, 0);
  assert.equal(sin.error, '');
  assert.deepEqual([sin.totales.subtotal_cop, sin.totales.iva_cop, sin.totales.total_cop], [1840614, 331237, 2171851]);
  assert.deepEqual(sin.totales.lineas.map((l) => l.unit_price_cop), [206769, 117000, 13200]);
  const con = totalesIvaCalculadora(filasCalc, 10);
  assert.equal(con.totales.descuento_cop, 184061);
  assert.equal(con.totales.total_cop, 1954666);
  // Una línea incompleta: el mensaje del 422 y sin totales (la pantalla muestra «—»).
  assert.deepEqual(totalesIvaCalculadora([{ ...filasCalc[0], qty: '' }], 0),
    { totales: null, error: "La cantidad de 'Rodillo' debe ser mayor que 0." });
  assert.equal(filasCalc[0].unit_price_cop, 150000, 'no muta las filas');
  // Con calcularCotizacion de verdad: una fila nueva (sin unit_price_cop) no sale en $0.
  const calculo = calcularCotizacion([{ ...filaNuevaCalculadora('19'), product_name: 'Cuna', cost_usd: 30, flete_usd: 2,
    qty: 6, margen_pct: 35 }], 4200, 0);
  const r = totalesIvaCalculadora(calculo.filas, 0);
  assert.equal(r.totales.subtotal_cop, 1240614);
  assert.equal(r.totales.iva_cop, 235717);
}

console.log('--- B3 T17 TEST 15: el cuerpo de guardado con IVA (iva_tarifa por línea y los totales de lib/iva.js) ---');
{
  const f = { ...formularioInicial(COT_20260486),
    filas: filasInicialesCalculadora({ ...COT_20260486, tarifas_producto: ['19'] }, '19') };
  const calculo = calcularCotizacion(f.filas, f.trm, f.descuento);
  const iva = totalesIvaCalculadora(calculo.filas, f.descuento);
  const cuerpo = cuerpoCompletoCalculadora(calculo, f, COT_20260486, iva.totales);
  assert.deepEqual(Object.keys(cuerpo),
    ['productos', 'trm_rate', 'subtotal_cop', 'descuento_pct', 'total_cop', 'notas', 'fecha_entrega_estimada']);
  assert.deepEqual(cuerpo.productos, [{ product_name: 'Cuna DEMO', sku_id: 2, qty: 6, cost_usd: 30, flete_usd: 2,
    margen_pct: 35, unit_price_cop: 206769, total_cop: 1240614, es_libre: false, iva_tarifa: '19' }]);
  assert.equal(cuerpo.subtotal_cop, 1240614);
  assert.equal(cuerpo.total_cop, 1476331, 'el total con IVA de lib/iva.js (el servidor recalcula y gana)');
  // No viajan las claves internas de la fila (_tarifaProducto) ni el IVA calculado por línea.
  assert.ok(cuerpo.productos.every((p) => !('_tarifaProducto' in p) && !('iva_cop' in p)));
  // Sin tocar nada: solo las notas, en una COT que YA tiene el IVA discriminado (r1: una COT vieja, sin IVA
  // discriminado, en Borrador o Enviada manda los precios: TEST 16).
  const otraVez = cuerpoCompletoCalculadora(calculo, f, COT_20260486, totalesIvaCalculadora(calculo.filas, 0).totales);
  const conTarifas = { ...COT_20260486, total_cop: 1476331, iva_discriminado: true, estado: 'BORRADOR' };
  assert.deepEqual(cuerpoDeGuardado(otraVez, inicialParaComparar(conTarifas, cuerpo)), { notas: 'Entrega en la mañana' });
  // Cambiar la tarifa de la línea cambia `productos`: viajan los precios (es un cambio de precio, H40).
  const calc5 = calcularCotizacion([{ ...f.filas[0], iva_tarifa: '5' }], f.trm, f.descuento);
  const otra = cuerpoCompletoCalculadora(calc5, f, COT_20260486, totalesIvaCalculadora(calc5.filas, 0).totales);
  assert.equal(otra.total_cop, 1302645);
  assert.ok('productos' in cuerpoDeGuardado(otra, cuerpo));
}

console.log('--- B3 T17 r2 TEST 16: la COT vieja (sin IVA discriminado), sus tres ramas (ruling de r2) ---');
{
  // COT-20260486 guardada antes del IVA: líneas sin iva_tarifa, total sin IVA y el GET con iva_discriminado false.
  const vieja = { ...COT_20260486, total_cop: 1240614, iva_discriminado: false };
  const f = { ...formularioInicial(vieja), filas: filasInicialesCalculadora({ ...vieja, tarifas_producto: ['19'] }, '19') };
  const calculo = calcularCotizacion(f.filas, f.trm, f.descuento);
  const iva = totalesIvaCalculadora(calculo.filas, f.descuento).totales;
  const inicial = cuerpoCompletoCalculadora(calculo, f, vieja, iva); // lo que la calculadora muestra al abrir (con IVA)
  // Lo que hace la calculadora (r3: la misma función que usa la pantalla, referenciaDeGuardado): con comparaContraNull
  // no compara (van los precios); si no, compara como siempre.
  const guardar = (cot, totales = iva, filas = calculo) =>
    cuerpoDeGuardado(cuerpoCompletoCalculadora(filas, f, cot, totales), referenciaDeGuardado(cot, inicial, totales));
  assert.equal(AVISO_SIN_IVA_SE_APLICA, 'Esta cotización se guardó sin IVA discriminado: al guardar se aplicará el IVA.');
  assert.equal(AVISO_SIN_IVA_COMPLETA_COSTOS, 'Esta cotización se guardó sin IVA discriminado. Para aplicarle el IVA, '
    + 'completa el costo de los productos que no lo tienen y vuelve a guardar.');
  assert.equal(AVISO_COT_SIN_IVA, 'Esta cotización se guardó sin IVA discriminado. Las cifras con IVA se guardan si cambias '
    + 'algún precio, y el cliente tendrá que confirmar de nuevo.');

  // (a) No congelada y sin pedido vigente, con TODAS las filas válidas: contra null, se aplica el IVA (aviso neutral).
  for (const estado of ['BORRADOR', 'ENVIADA', 'VENCIDA', 'RECHAZADA']) {
    const cot = { ...vieja, estado };
    assert.deepEqual(reglaCotizacionSinIva(cot, iva), { comparaContraNull: true, aviso: AVISO_SIN_IVA_SE_APLICA,
      tono: 'neutral' }, estado);
    const cuerpo = guardar(cot);
    assert.equal(validaPreciosAlGuardar(cuerpo), true, estado);
    assert.equal(cuerpo.productos[0].iva_tarifa, '19');
    assert.equal(cuerpo.total_cop, 1476331);
  }
  // (a) con una fila que no pasa (costo 0, B2-T9A r1 p2; o una cantidad vacía): solo las notas y el aviso de completar.
  const conCero = { ...f, filas: [...f.filas, { ...filaNuevaCalculadora('19'), product_name: 'Sin costo' }] };
  const calculoCero = calcularCotizacion(conCero.filas, conCero.trm, conCero.descuento);
  const ivaCero = totalesIvaCalculadora(calculoCero.filas, conCero.descuento).totales;
  const inicialCero = cuerpoCompletoCalculadora(calculoCero, conCero, vieja, ivaCero);
  const borrador = { ...vieja, estado: 'BORRADOR' };
  assert.deepEqual(reglaCotizacionSinIva(borrador, ivaCero), { comparaContraNull: false,
    aviso: AVISO_SIN_IVA_COMPLETA_COSTOS, tono: 'ambar' });
  assert.equal(referenciaDeGuardado(borrador, inicialCero, ivaCero), inicialCero, 'se compara: solo las notas');
  assert.deepEqual(cuerpoDeGuardado(cuerpoCompletoCalculadora(calculoCero, conCero, borrador, ivaCero),
    referenciaDeGuardado(borrador, inicialCero, ivaCero)), { notas: 'Entrega en la mañana' }, 'las notas se guardan sin bloquear');
  assert.equal(reglaCotizacionSinIva(borrador, null).aviso, AVISO_SIN_IVA_COMPLETA_COSTOS, 'una línea incompleta');

  // (b) Congelada por H40: Pendiente, o Confirmada sin pedido vigente (también con solo pedidos cancelados).
  const cancelado = [{ estado: 'CANCELADO', numero: 'PVEN-20260001' }];
  for (const cot of [{ ...vieja, estado: 'PENDIENTE_CONFIRMACION' }, { ...vieja, estado: 'CONFIRMADA' },
    { ...vieja, estado: 'CONFIRMADA', pedidos_venta: cancelado }]) {
    assert.deepEqual(reglaCotizacionSinIva(cot, iva), { comparaContraNull: false, aviso: AVISO_COT_SIN_IVA, tono: 'ambar' },
      cot.estado);
    assert.deepEqual(guardar(cot), { notas: 'Entrega en la mañana' }, `${cot.estado}: solo notas (H40)`);
  }

  // (c) Confirmada con pedido vigente: solo notas y el aviso con el número del pedido (o «el pedido de venta»).
  const conPedido = { ...vieja, estado: 'CONFIRMADA', pedidos_venta: [...cancelado, { estado: 'EN_PROCESO', numero: 'PVEN-20261001' }] };
  assert.deepEqual(reglaCotizacionSinIva(conPedido, iva), { comparaContraNull: false, tono: 'ambar',
    aviso: 'Esta cotización se guardó sin IVA discriminado. Las cifras con IVA se guardan si cambias algún precio, y se '
      + 'actualizará el pedido PVEN-20261001.' });
  assert.deepEqual(guardar(conPedido), { notas: 'Entrega en la mañana' });
  assert.equal(reglaCotizacionSinIva({ ...vieja, estado: 'CONFIRMADA', pedidos_venta: [{ estado: 'EN_PROCESO' }] }, iva).aviso,
    'Esta cotización se guardó sin IVA discriminado. Las cifras con IVA se guardan si cambias algún precio, y se '
      + 'actualizará el pedido de venta.');

  // Una COT CON tarifas (iva_discriminado true o ausente) o sin precio: sin regla, se compara exactamente como antes.
  for (const cot of [{ ...vieja, iva_discriminado: true, estado: 'BORRADOR' }, { ...COT_20260486, total_cop: 1240614,
    estado: 'BORRADOR' }, { ...vieja, total_cop: 0, estado: 'BORRADOR' }, null]) {
    assert.equal(reglaCotizacionSinIva(cot, iva), null, JSON.stringify(cot?.iva_discriminado));
  }
  assert.equal(inicialParaComparar({ ...vieja, estado: 'BORRADOR' }, inicial), inicial, 'inicialParaComparar, como en B2');
  assert.equal(inicialParaComparar({ ...vieja, total_cop: 0, estado: 'BORRADOR' }, inicial), null);
  // r3: referenciaDeGuardado compone las dos: null en (a) con filas válidas; si no, la de inicialParaComparar.
  assert.equal(referenciaDeGuardado({ ...vieja, estado: 'BORRADOR' }, inicial, iva), null, '(a) válida: contra null');
  assert.equal(referenciaDeGuardado({ ...vieja, estado: 'PENDIENTE_CONFIRMACION' }, inicial, iva), inicial, '(b)');
  assert.equal(referenciaDeGuardado(conPedido, inicial, iva), inicial, '(c)');
  assert.equal(referenciaDeGuardado({ ...vieja, iva_discriminado: true, estado: 'BORRADOR' }, inicial, iva), inicial, 'con tarifas');
  assert.equal(referenciaDeGuardado({ ...vieja, total_cop: 0, estado: 'BORRADOR' }, inicial, iva), null, 'sin precio, como en B2');

  // preciosCompletos: la misma validación del «Guardar» de la calculadora (líneas y total mayores que $0).
  assert.equal(preciosCompletos(iva), true);
  assert.equal(preciosCompletos(ivaCero), false);
  assert.equal(preciosCompletos(null), false);
  assert.equal(preciosCompletos({ lineas: [], total_cop: 0 }), false);
}

console.log('--- B3 T17 r3 TEST 18: errorPreciosCalculadora, la única validación de precios del «Guardar» ---');
{
  const COSTO = 'Cada producto necesita un costo mayor a $0 antes de guardar la cotización.';
  const TOTAL = 'El total de la cotización debe ser mayor a $0.';
  const linea = (total_cop) => ({ iva_tarifa: '19', total_cop, iva_cop: 0 });
  assert.equal(errorPreciosCalculadora({ lineas: [linea(100)], total_cop: 119 }), null);
  assert.equal(errorPreciosCalculadora({ lineas: [linea(100), linea(0)], total_cop: 119 }), COSTO, 'una línea en $0');
  assert.equal(errorPreciosCalculadora({ lineas: [], total_cop: 0 }), COSTO, 'sin líneas');
  assert.equal(errorPreciosCalculadora({ lineas: [linea(100)], total_cop: 0 }), TOTAL, 'el total (un descuento del 100%)');
  assert.equal(errorPreciosCalculadora(null), COSTO, 'sin totales (una línea incompleta) tampoco pasa');
  // preciosCompletos es exactamente «sin error»: la rama (a) no se puede desalinear del «Guardar».
  for (const t of [{ lineas: [linea(100)], total_cop: 119 }, { lineas: [linea(0)], total_cop: 0 }, { lineas: [linea(5)],
    total_cop: 0 }, null, { lineas: [], total_cop: 0 }]) {
    assert.equal(preciosCompletos(t), errorPreciosCalculadora(t) === null, JSON.stringify(t));
  }
}

console.log('--- B3 T17 r1 TEST 17: el Cotizador Rápido no le manda al cliente el margen ni la TRM (R3/C19) ---');
{
  // Las «Notas» de la COT salen en el documento del cliente, el PDF y el correo: la COT del Cotizador se crea sin notas.
  const fuente = readFileSync(new URL('../src/app/dashboard/cotiza/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(fuente, /\bnotas\s*:/, 'el cuerpo de la COT no lleva notas');
  // Ningún texto armado con el margen o la TRM (`${margenPct}`, `${trm}`): los ve solo el asesor, en la pantalla.
  assert.doesNotMatch(fuente, /\$\{\s*(margenPct|trm)\b/, 'ningún texto armado con el margen o la TRM');
}

console.log('--- Revisión final B3 (F2, M10): el Cotizador Rápido escribe el dinero con formatoPesos ($1.710, sin espacio) ---');
{
  const fuente = readFileSync(new URL('../src/app/dashboard/cotiza/page.tsx', import.meta.url), 'utf8');
  // Intl da '$ 1.710' (con espacio); la COT, la calculadora, el PVEN y los documentos, '$1.710'.
  assert.doesNotMatch(fuente, /Intl\.NumberFormat/, 'sin el formato de Intl');
  assert.match(fuente, /import \{ formatoPesos \} from '@\/lib\/pesos';/, 'formatoPesos de lib/pesos.js');
  assert.ok(fuente.includes('const formatCOP = formatoPesos;'), 'las cifras de siempre, con formatoPesos');
  assert.ok(fuente.includes('const montoOGuion = (v: number | null) => pesosOGuion(v);'), 'las del IVA, igual que la calculadora');
  const calculadora = readFileSync(new URL('../src/app/dashboard/ventas/cotizacion/calculadora-iva.tsx', import.meta.url), 'utf8');
  assert.match(calculadora, /export const pesosOGuion = \(v: number \| null \| undefined\) =>/, 'pesosOGuion ya no pide otro formato');
}

console.log('✓ Todos los tests de pricing pasaron exitosamente.');
