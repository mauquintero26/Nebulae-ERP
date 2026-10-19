/**
 * frontend/tests/test_pesos.mjs
 * H42: dinero en pesos enteros. formatoPesos muestra '$' + miles con punto y sin decimales
 * ('$2.786.923', no '$2.786.923,08'); redondearPeso redondea al peso (Math.round).
 * La agrupacion es manual (no toLocaleString): con algunas versiones de ICU 'es' no agrupa
 * los numeros de 4 cifras.
 */

import assert from 'node:assert/strict';
import { redondearPeso, formatoPesos, formatoCantidad } from '../src/lib/pesos.js';
import { formatoCantidad as formatoCantidadDocumento } from '../src/lib/documento-comercial.js';

console.log('--- TEST 1: formatoPesos redondea al peso y agrupa miles con punto ---');
{
  assert.equal(formatoPesos(2786923.08), '$2.786.923');
  assert.equal(formatoPesos(342461.538), '$342.462');
  assert.equal(formatoPesos(1500), '$1.500');
  assert.equal(formatoPesos(999), '$999');
  assert.equal(formatoPesos(1000), '$1.000');
  assert.equal(formatoPesos(1062523), '$1.062.523');
  assert.equal(formatoPesos(1234567890), '$1.234.567.890');
  assert.equal(formatoPesos('1062523.4'), '$1.062.523', 'acepta numeros como texto (el API manda Decimal)');
}

console.log('--- TEST 2: cero, nulos y valores no numericos se ven $0 ---');
{
  assert.equal(formatoPesos(0), '$0');
  assert.equal(formatoPesos(null), '$0');
  assert.equal(formatoPesos(undefined), '$0');
  assert.equal(formatoPesos(''), '$0');
  assert.equal(formatoPesos('abc'), '$0');
  assert.equal(formatoPesos(NaN), '$0');
}

console.log('--- TEST 3: negativos (credito a favor) se ven -$X; nunca -$0 ---');
{
  assert.equal(formatoPesos(-1500000), '-$1.500.000');
  assert.equal(formatoPesos(-5000), '-$5.000');
  assert.equal(formatoPesos(-0.4), '$0', 'un negativo que redondea a cero no lleva signo');
}

console.log('--- TEST 4: redondearPeso es Math.round y devuelve numero entero ---');
{
  assert.equal(redondearPeso(1672153.8), 1672154);
  assert.equal(redondearPeso(342461.538), 342462);
  assert.equal(redondearPeso(2.5), 3, 'half-up con positivos, igual que ROUND_HALF_UP del backend');
  assert.equal(redondearPeso('1000.50'), 1001);
  assert.equal(redondearPeso(null), 0);
  assert.equal(redondearPeso(undefined), 0);
  assert.equal(redondearPeso('abc'), 0);
  assert.ok(Number.isInteger(redondearPeso(60000.00000000001)));
  assert.equal(redondearPeso(60000.00000000001), 60000, 'ruido de punto flotante de la Calculadora');
}

console.log('--- B3 T17 r1: formatoCantidad vive aquí (lib/iva.js la usa sin import circular) y documento-comercial la reexporta ---');
{
  assert.equal(formatoCantidad(2), '2');
  assert.equal(formatoCantidad(2.5), '2,5');
  for (const raro of [null, undefined, '2.5', NaN, Infinity]) assert.equal(formatoCantidad(raro), '', String(raro));
  assert.equal(formatoCantidadDocumento, formatoCantidad, 'la misma función, no una copia');
}

console.log('✓ Todos los tests de pesos pasaron exitosamente.');
