/**
 * frontend/tests/test_iva.mjs
 * B3 T13 (IVA-PRODUCTO punto 8 e IVA punto 9): lib/iva.js, espejo de backend/app/core/iva.py, con EXACTAMENTE los
 * números de backend/tests/test_iva_cotizacion.py. La paridad que corre los dos lados de verdad es
 * backend/tests/test_paridad_bloque3.py (RP21); aquí van los casos fijos y los bordes de la aritmética entera.
 * - Parte 1: las tarifas (19%, 5%, Exento, Excluido), normalizarTarifaIva (null si no es válida), pctTarifaIva y
 *   etiquetaTarifaIva ('IVA no discriminado' sin tarifa).
 * - Parte 2: repartirProporcional (mayor residuo con BigInt), calcularTotalesCotizacion (pesos enteros, puntos básicos)
 *   y desgloseDocumento (un documento viejo -> iva_discriminado false).
 */

import assert from 'node:assert/strict';
import {
  TARIFAS_IVA, ORDEN_TARIFAS, ETIQUETAS_TARIFA_IVA, ETIQUETA_SIN_TARIFA, TARIFA_IVA_POR_DEFECTO,
  MENSAJE_TARIFA_INVALIDA, MENSAJE_DESCUENTO_INVALIDO, normalizarTarifaIva, pctTarifaIva, etiquetaTarifaIva,
  nombreDeLinea, lineasConTarifa, repartirProporcional, calcularTotalesCotizacion, resumenIvaPorTarifa,
  desgloseDocumento,
} from '../src/lib/iva.js';

const linea = (nombre, qty, precio, tarifa, extra = {}) => {
  const l = { product_name: nombre, qty, unit_price_cop: precio, total_cop: qty * precio, ...extra };
  if (tarifa !== null && tarifa !== undefined) l.iva_tarifa = tarifa;
  return l;
};
// Las tres líneas del recorrido del Bloque 1, cada vez una lista nueva de objetos nuevos.
const ejemplo = (t = ['19', '19', '5']) => [linea('Rodillo', 6, 206769, t[0]), linea('Pintura', 4, 117000, t[1]),
  linea('Cinta', 10, 13200, t[2])];
const campo = (r, nombre) => r.lineas.map((l) => l[nombre]);
const filas = (r) => r.iva_por_tarifa.map((f) => [f.tarifa, f.base_cop, f.iva_cop]);
const lanza = (fn, mensaje) => assert.throws(fn, (e) => {
  assert.ok(e instanceof Error, 'lanza un Error');
  assert.ok(e.message.startsWith(mensaje), `${e.message} debía empezar por ${mensaje}`);
  return true;
});

// ─── Parte 1: tarifas ──────────────────────────────────────────────────────────────────────────────────────────

console.log('--- TEST 1: las cuatro tarifas, su orden y sus etiquetas (core/iva.py) ---');
{
  assert.deepEqual(TARIFAS_IVA, [
    { codigo: '19', pct: 19, etiqueta: 'IVA 19%' }, { codigo: '5', pct: 5, etiqueta: 'IVA 5%' },
    { codigo: 'EXENTO', pct: 0, etiqueta: 'Exento' }, { codigo: 'EXCLUIDO', pct: 0, etiqueta: 'Excluido' },
  ]);
  assert.deepEqual(ORDEN_TARIFAS, ['19', '5', 'EXENTO', 'EXCLUIDO']);
  assert.deepEqual(ETIQUETAS_TARIFA_IVA, { 19: 'IVA 19%', 5: 'IVA 5%', EXENTO: 'Exento', EXCLUIDO: 'Excluido' });
  assert.equal(ETIQUETA_SIN_TARIFA, 'IVA no discriminado');
  assert.equal(TARIFA_IVA_POR_DEFECTO, '19');
  assert.equal(MENSAJE_TARIFA_INVALIDA, 'Tarifa de IVA no válida: usa 19%, 5%, Exento o Excluido.');
  assert.equal(MENSAJE_DESCUENTO_INVALIDO, 'El descuento debe estar entre 0 y 100%.');
  for (const c of [TARIFAS_IVA, TARIFAS_IVA[0], ORDEN_TARIFAS, ETIQUETAS_TARIFA_IVA]) assert.ok(Object.isFrozen(c));
}

console.log('--- TEST 2: normalizarTarifaIva con los casos del backend (inválido o vacío -> null) ---');
{
  for (const v of ['19', 19, 19.0, '19%', ' iva 19 ', 'IVA 19%', 'Iva19']) assert.equal(normalizarTarifaIva(v), '19', v);
  for (const v of ['5', 5, 5.0, '5%', 'IVA 5']) assert.equal(normalizarTarifaIva(v), '5', v);
  for (const v of ['exento', 'EXENTO', ' Exento ']) assert.equal(normalizarTarifaIva(v), 'EXENTO', v);
  for (const v of ['Excluido', 'EXCLUIDO', 'excluido']) assert.equal(normalizarTarifaIva(v), 'EXCLUIDO', v);
  // Vacío (sin definir) y no válido dan null en el frontend; el backend lanza con los no válidos (nota tras T3).
  for (const v of [null, undefined, '', '   ', '\u00a0', '0', 0, '16', 16, 'abc', true, false, 19.5, '19.0', 'IVA',
    '%', NaN, Infinity, ['19'], { t: '19' }]) {
    assert.equal(normalizarTarifaIva(v), null, `inválido o vacío: ${JSON.stringify(v)}`);
  }
  // Los bordes con el strip de Python: \x1c es espacio para Python (no para trim()) y \ufeff no lo es.
  assert.equal(normalizarTarifaIva('\x1c19\x1c'), '19');
  assert.equal(normalizarTarifaIva('\ufeff19'), null);
}

console.log('--- TEST 3: pctTarifaIva y etiquetaTarifaIva nunca lanzan ---');
{
  assert.equal(pctTarifaIva('5'), 5);
  assert.equal(pctTarifaIva('19'), 19);
  assert.equal(pctTarifaIva('exento'), 0);
  assert.equal(pctTarifaIva('EXCLUIDO'), 0);
  assert.equal(etiquetaTarifaIva('EXENTO'), 'Exento');
  assert.equal(etiquetaTarifaIva('19'), 'IVA 19%');
  assert.equal(etiquetaTarifaIva(5), 'IVA 5%');
  assert.equal(etiquetaTarifaIva(null), 'IVA no discriminado');
  assert.equal(etiquetaTarifaIva(''), 'IVA no discriminado');
  for (const raro of ['16', 'abc', true, '0', 19.5, ['19'], undefined]) {
    assert.equal(pctTarifaIva(raro), 0, String(raro));
    assert.equal(etiquetaTarifaIva(raro), 'IVA no discriminado', String(raro));
  }
}

// ─── Parte 2: el cálculo en pesos enteros ──────────────────────────────────────────────────────────────────────

console.log('--- TEST 4 (caso 1): sin descuento, los números del recorrido ---');
{
  const r = calcularTotalesCotizacion(ejemplo(), 0);
  assert.deepEqual(campo(r, 'iva_cop'), [235717, 88920, 6600]);
  assert.equal(r.iva_cop, 331237);
  assert.equal(r.subtotal_cop, 1840614);
  assert.equal(r.descuento_cop, 0);
  assert.equal(r.total_cop, 2171851);
  assert.deepEqual(campo(r, 'total_con_iva_cop'), [1476331, 556920, 138600]);
  assert.deepEqual(campo(r, 'total_cop'), [1240614, 468000, 132000], 'sin IVA y antes del descuento');
  assert.deepEqual(campo(r, 'iva_pct'), [19, 19, 5]);
  assert.deepEqual(filas(r), [['19', 1708614, 324637], ['5', 132000, 6600]]);
  assert.deepEqual(Object.keys(r), ['lineas', 'subtotal_cop', 'descuento_cop', 'iva_cop', 'total_cop', 'iva_por_tarifa']);
}

console.log('--- TEST 5 (caso 2): con 10% de descuento ---');
{
  const r = calcularTotalesCotizacion(ejemplo(), 10);
  assert.equal(r.descuento_cop, 184061);
  assert.deepEqual(campo(r, 'descuento_cop'), [124061, 46800, 13200]);
  assert.deepEqual(campo(r, 'base_iva_cop'), [1116553, 421200, 118800]);
  assert.deepEqual(campo(r, 'iva_cop'), [212145, 80028, 5940]);
  assert.equal(r.iva_cop, 298113);
  assert.equal(r.total_cop, 1954666);
  assert.equal(r.subtotal_cop, 1840614);
  assert.deepEqual(filas(r), [['19', 1537753, 292173], ['5', 118800, 5940]]);
  assert.deepEqual(r.iva_por_tarifa.map((f) => f.etiqueta), ['IVA 19%', 'IVA 5%']);
  // El descuento como texto da lo mismo (puntos básicos enteros).
  assert.equal(calcularTotalesCotizacion(ejemplo(), '10').total_cop, 1954666);
  assert.equal(calcularTotalesCotizacion(ejemplo(), '10.00').total_cop, 1954666);
  assert.equal(calcularTotalesCotizacion(ejemplo(), ' 10 ').total_cop, 1954666);
}

console.log('--- TEST 6 (casos 3 y 4): medio peso hacia arriba; Exento y Excluido con su base ---');
{
  const r = calcularTotalesCotizacion([linea('Lija', 1, 50, '19')], 0);
  assert.equal(r.lineas[0].iva_cop, 10, '9,5 se redondea hacia arriba');
  assert.equal(r.iva_cop, 10);
  assert.equal(r.total_cop, 60);

  const cuatro = [linea('A', 1, 100001, '19'), linea('B', 1, 100001, '5'), linea('C', 1, 100001, 'EXENTO'),
    linea('D', 1, 100001, 'EXCLUIDO')];
  const r4 = calcularTotalesCotizacion(cuatro, 7.5);
  assert.equal(r4.descuento_cop, 30000);
  assert.deepEqual(campo(r4, 'base_iva_cop'), [92501, 92501, 92501, 92501]);
  assert.deepEqual(campo(r4, 'iva_cop'), [17575, 4625, 0, 0]);
  assert.equal(r4.total_cop, 392204);
  assert.deepEqual(filas(r4), [['19', 92501, 17575], ['5', 92501, 4625], ['EXENTO', 92501, 0], ['EXCLUIDO', 92501, 0]]);
  assert.deepEqual(r4.iva_por_tarifa.map((f) => f.etiqueta), ['IVA 19%', 'IVA 5%', 'Exento', 'Excluido']);
}

console.log('--- TEST 7 (caso 5): invariantes en los casos fijos del backend ---');
{
  const casos = [
    [ejemplo(), 0, 2171851],
    [ejemplo(), 10, 1954666],
    [[linea('Lija', 1, 50, '19')], 0, 60],
    [[linea('A', 1, 100001, '19'), linea('B', 1, 100001, '5'), linea('C', 1, 100001, 'EXENTO'),
      linea('D', 1, 100001, 'EXCLUIDO')], 7.5, 392204],
    [[linea('Cuna', 2, 342462, '19')], 0, 815060],
    [[linea('A', 3, 99999, '19'), linea('B', 7, 1, '5'), linea('C', 1, 55555, '19')], 33.33, 282090],
    [ejemplo(), 100, 0],
    [[linea('Regalo', 1, 0, '19'), linea('Cuna', 2, 342462, '19')], 10, 733554],
    [Array.from({ length: 40 }, (_, i) => linea(`P${i}`, (i % 3) + 1, 997 + 131 * i, ['19', '5', 'EXENTO', 'EXCLUIDO'][i % 4])),
      33.33, 198069],
    [[linea('Tela', 2.5, 12345, '19'), linea('Botón', 3, 999, '5')], 7.5, 36883],
  ];
  const suma = (xs) => xs.reduce((a, b) => a + b, 0);
  for (const [productos, descuento, total] of casos) {
    const r = calcularTotalesCotizacion(productos, descuento);
    assert.equal(r.total_cop, total, `total con ${descuento}%`);
    if (descuento === 100) {
      assert.equal(r.iva_cop, 0);
      assert.deepEqual(campo(r, 'base_iva_cop'), [0, 0, 0]);
      assert.equal(r.descuento_cop, 1840614);
    }
    assert.equal(suma(campo(r, 'total_cop')), r.subtotal_cop);
    assert.equal(suma(campo(r, 'descuento_cop')), r.descuento_cop);
    assert.equal(suma(campo(r, 'iva_cop')), r.iva_cop);
    assert.equal(r.iva_cop, suma(r.iva_por_tarifa.map((f) => f.iva_cop)));
    assert.equal(suma(campo(r, 'base_iva_cop')), suma(r.iva_por_tarifa.map((f) => f.base_cop)));
    assert.equal(suma(campo(r, 'total_con_iva_cop')), r.total_cop);
    assert.equal(r.total_cop, r.subtotal_cop - r.descuento_cop + r.iva_cop);
    const valores = [r.subtotal_cop, r.descuento_cop, r.iva_cop, r.total_cop];
    for (const l of r.lineas) {
      valores.push(l.unit_price_cop, l.total_cop, l.descuento_cop, l.base_iva_cop, l.iva_cop, l.total_con_iva_cop);
    }
    assert.ok(valores.every((v) => Number.isSafeInteger(v) && v >= 0), JSON.stringify(valores));
  }
}

console.log('--- TEST 8: aritmética decimal exacta, como Decimal en Python (nunca el flotante) ---');
{
  // 1,005 x $100 = $100,50 -> $101 (en flotante 1.005 * 100 = 100.49999999999999 y saldría $100).
  const cantidad = calcularTotalesCotizacion([linea('Tela', 1.005, 100, '19')], 0);
  assert.deepEqual([cantidad.lineas[0].total_cop, cantidad.lineas[0].iva_cop, cantidad.total_cop], [101, 19, 120]);
  // Un descuento de 1,005% son 101 puntos básicos (en flotante, 100): sobre $100.000 descuenta $1.010, no $1.000.
  for (const pct of ['1.005', 1.005]) {
    const r = calcularTotalesCotizacion([linea('A', 1, 100000, '19')], pct);
    assert.deepEqual([r.descuento_cop, r.iva_cop, r.total_cop], [1010, 18808, 117798], String(pct));
  }
  // Decimales en texto y medio peso hacia arriba: 1,15 x $10 = $11,50 -> $12; '33.335'% -> 3334 puntos básicos;
  // '12345.5' -> $12.346. Los números salieron del backend real.
  const r = calcularTotalesCotizacion([linea('Tela', 1.15, 10, '19'), { product_name: 'B', qty: '2.5',
    unit_price_cop: '12345.5', iva_tarifa: '5' }], '33.335');
  assert.deepEqual(campo(r, 'total_cop'), [12, 30865]);
  assert.deepEqual(campo(r, 'unit_price_cop'), [10, 12346]);
  assert.deepEqual(campo(r, 'descuento_cop'), [4, 10290]);
  assert.deepEqual(campo(r, 'iva_cop'), [2, 1029]);
  assert.equal(r.descuento_cop, 10294);
  assert.equal(r.total_cop, 21614);
  // Un precio en texto con medio peso, sin descuento (None vale 0).
  const r2 = calcularTotalesCotizacion([linea('X', 3, '0.5', '19')], null);
  assert.equal(r2.lineas[0].unit_price_cop, 1);
  assert.equal(r2.total_cop, 4);
  // Un precio vacío vale $0 (como redondear_peso(None) del backend).
  assert.equal(calcularTotalesCotizacion([{ product_name: 'X', qty: 1, iva_tarifa: '19' }], 0).total_cop, 0);
}

console.log('--- TEST 9: los errores legibles del backend, nombrando la línea ---');
{
  const casos = [
    [ejemplo(['19', '16', '5']), 0, "Tarifa de IVA no válida en 'Pintura': usa 19%, 5%, Exento o Excluido."],
    [[linea('Rodillo', 0, 206769, '19')], 0, "La cantidad de 'Rodillo' debe ser mayor que 0."],
    [[linea('Rodillo', -2, 206769, '19')], 0, "La cantidad de 'Rodillo' debe ser mayor que 0."],
    [[{ product_name: 'Rodillo', unit_price_cop: 5, iva_tarifa: '19' }], 0, "La cantidad de 'Rodillo' debe ser mayor que 0."],
    [[{ product_name: 'Rodillo', qty: true, unit_price_cop: 5, iva_tarifa: '19' }], 0, "La cantidad de 'Rodillo'"],
    [[{ product_name: 'Rodillo', qty: 'dos', unit_price_cop: 5, iva_tarifa: '19' }], 0, "La cantidad de 'Rodillo'"],
    [[linea('Rodillo', 1, -5, '19')], 0, "El precio unitario de 'Rodillo' no es válido."],
    [[{ product_name: 'Rodillo', qty: 1, unit_price_cop: 'abc', iva_tarifa: '19' }], 0, "El precio unitario de 'Rodillo'"],
    [[{ product_name: 'Rodillo', qty: 1, unit_price_cop: true, iva_tarifa: '19' }], 0, "El precio unitario de 'Rodillo'"],
    [ejemplo(), 101, 'El descuento debe estar entre 0 y 100%.'],
    [ejemplo(), '100.004', 'El descuento debe estar entre 0 y 100%.'],
    [ejemplo(), -1, 'El descuento debe estar entre 0 y 100%.'],
    [ejemplo(), 'diez', 'El descuento debe estar entre 0 y 100%.'],
    [ejemplo(), true, 'El descuento debe estar entre 0 y 100%.'],
    [ejemplo(), NaN, 'El descuento debe estar entre 0 y 100%.'],
    [[linea('Rodillo', 1, 5, null)], 0, "Indica la tarifa de IVA de 'Rodillo'."],
    [[linea('Rodillo', 1, 5, '  ')], 0, "Indica la tarifa de IVA de 'Rodillo'."],
    [[linea('Rodillo', 1, 5, '19'), 'Texto viejo'], 0, 'La línea 2 no es un producto válido.'],
    [[linea('Rodillo', 1, 5, '19'), null], 0, 'La línea 2 no es un producto válido.'],
    [[{ qty: 1, unit_price_cop: 5 }], 0, "Indica la tarifa de IVA de 'Línea 1'."],
  ];
  for (const [productos, descuento, mensaje] of casos) lanza(() => calcularTotalesCotizacion(productos, descuento), mensaje);
  // El descuento de 100 en punto y '-0' son válidos; sin líneas, todo en 0.
  assert.equal(calcularTotalesCotizacion(ejemplo(), '100.00').total_cop, 0);
  assert.equal(calcularTotalesCotizacion(ejemplo(), '-0').total_cop, 2171851);
  assert.deepEqual(calcularTotalesCotizacion([], 10), { lineas: [], subtotal_cop: 0, descuento_cop: 0, iva_cop: 0,
    total_cop: 0, iva_por_tarifa: [] });
  assert.deepEqual(calcularTotalesCotizacion(null, 0).lineas, []);
}

console.log('--- TEST 10: no toca las líneas que recibe y normaliza la tarifa ---');
{
  const productos = ejemplo([' iva 19% ', 19, '5']);
  const originales = productos.map((p) => ({ ...p }));
  const r = calcularTotalesCotizacion(productos, 0);
  assert.deepEqual(productos, originales);
  r.lineas.forEach((nueva, i) => assert.notEqual(nueva, productos[i]));
  assert.deepEqual(campo(r, 'iva_tarifa'), ['19', '19', '5']);
  assert.equal(r.lineas[0].product_name, 'Rodillo', 'el resto de la línea se conserva');
  assert.equal(r.lineas[0].qty, 6);
}

console.log('--- TEST 11: nombreDeLinea y lineasConTarifa (las reglas del backend) ---');
{
  const lineas = [{ qty: 1 }, 'Texto viejo', { name: 7 }, { nombre: ' Silla ', product_name: null }, { product_name: ' ' },
    { descripcion: false }];
  assert.deepEqual(lineas.map((p, i) => nombreDeLinea(p, i)), ['Línea 1', 'Texto viejo', '7', 'Silla', 'Línea 5', 'False']);
  assert.equal(lineasConTarifa(ejemplo()), 'todas');
  assert.equal(lineasConTarifa(ejemplo([null, null, null])), 'ninguna');
  assert.equal(lineasConTarifa(ejemplo(['19', null, '5'])), 'mezcla');
  assert.equal(lineasConTarifa(ejemplo(['19', '', '5'])), 'mezcla', "'' es sin tarifa");
  assert.equal(lineasConTarifa([]), 'ninguna');
  assert.equal(lineasConTarifa(null), 'ninguna');
  assert.equal(lineasConTarifa(ejemplo(['16', '19', '5'])), 'todas', 'tiene tarifa aunque no sea válida');
}

console.log('--- TEST 12: repartirProporcional (mayor residuo, BigInt) ---');
{
  assert.deepEqual(repartirProporcional([1240614, 468000, 132000], 184061), [124061, 46800, 13200]);
  assert.deepEqual(repartirProporcional([100001, 100001, 100001], 180002), [60001, 60001, 60000], 'como en U19');
  // El grande: objetivo x monto pasa de 2^53; con Number se perderían pesos. Números del backend real.
  assert.deepEqual(repartirProporcional([999999999, 1, 7], 999999999), [999999991, 1, 7]);
  assert.deepEqual(repartirProporcional([9007199254740991, 3, 5], 9007199254740990), [9007199254740982, 3, 5]);
  assert.deepEqual(repartirProporcional([1240614, 468000, 132000], 2171851), [1463875, 552221, 155755]);
  assert.deepEqual(repartirProporcional([7, 7, 7], 10), [4, 3, 3], 'en empate, la primera');
  assert.deepEqual(repartirProporcional([-5, 10, 2.5], 7), [0, 5, 2], 'negativo cuenta 0; 2,5 se redondea a 3');
  assert.deepEqual(repartirProporcional([100, 100], 300), [150, 150], 'objetivo mayor que la suma: igual cuadra');
  assert.deepEqual(repartirProporcional([1240614, 468000, 132000], 0), [0, 0, 0]);
  assert.deepEqual(repartirProporcional([0, 0], 500), [0, 0]);
  assert.deepEqual(repartirProporcional([], 500), []);
  const partes = repartirProporcional([999999999, 1, 7], 999999999);
  assert.equal(partes.reduce((a, b) => a + b, 0), 999999999);
  assert.ok(partes.every(Number.isSafeInteger));
  // Un monto que no es un monto lanza, como redondear_peso del backend.
  assert.throws(() => repartirProporcional([1, 'abc'], 5));
}

console.log('--- TEST 13: desgloseDocumento (sin recalcular; un documento viejo no está discriminado) ---');
{
  const r = calcularTotalesCotizacion(ejemplo(), 10);
  const doc = { productos: r.lineas, subtotal_cop: 1840614, tax_cop: 298113, total_cop: 1954666 };
  assert.deepEqual(desgloseDocumento(doc), { iva_discriminado: true, iva_cop: 298113, descuento_cop: 184061,
    iva_por_tarifa: r.iva_por_tarifa });
  assert.deepEqual(resumenIvaPorTarifa(r.lineas), r.iva_por_tarifa);
  const viejo = { productos: ejemplo([null, null, null]), subtotal_cop: '1840614.40', tax_cop: null, total_cop: 1656553 };
  assert.deepEqual(desgloseDocumento(viejo), { iva_discriminado: false, iva_cop: 0, descuento_cop: 184061,
    iva_por_tarifa: [] });
  assert.equal(desgloseDocumento({ productos: [], subtotal_cop: 100, total_cop: 150 }).descuento_cop, 0);
  assert.equal(desgloseDocumento({ productos: [] }).iva_discriminado, false);
  assert.deepEqual(desgloseDocumento(null), { iva_discriminado: false, iva_cop: 0, descuento_cop: 0, iva_por_tarifa: [] });
  // Un resumen que no cuadra con la cabecera nunca se muestra (ronda r1 de T4).
  const sinCinta = { ...doc, subtotal_cop: 1708614, tax_cop: 292173, total_cop: 1829926 };
  assert.deepEqual(desgloseDocumento(sinCinta), { iva_discriminado: false, iva_cop: 292173, descuento_cop: 170861,
    iva_por_tarifa: [] });
  const unPeso = { ...doc, total_cop: 1954667 };
  assert.equal(desgloseDocumento(unPeso).iva_discriminado, false);
  assert.deepEqual(desgloseDocumento(unPeso).iva_por_tarifa, []);
  // Los montos que no son montos valen 0 (un booleano no es $1, como en el backend).
  assert.equal(desgloseDocumento({ productos: [], tax_cop: true, total_cop: 'abc' }).iva_cop, 0);
}

console.log('OK test_iva.mjs');
