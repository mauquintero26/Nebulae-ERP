/**
 * frontend/tests/test_pesos.mjs
 * H42: dinero en pesos enteros. formatoPesos muestra '$' + miles con punto y sin decimales
 * ('$2.786.923', no '$2.786.923,08'); redondearPeso redondea al peso (Math.round).
 * La agrupacion es manual (no toLocaleString): con algunas versiones de ICU 'es' no agrupa
 * los numeros de 4 cifras.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { redondearPeso, formatoPesos, formatoCantidad, dividirMedioArriba } from '../src/lib/pesos.js';
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

console.log('--- Revisión final B3 (F2, M11): una sola división al medio peso hacia arriba (BigInt) ---');
{
  // n / d redondeado con el medio hacia arriba (ROUND_HALF_UP del backend), para n >= 0 y d > 0.
  assert.equal(dividirMedioArriba(10n, 4n), 3n, '2,5 sube');
  assert.equal(dividirMedioArriba(9n, 4n), 2n, '2,25 baja');
  assert.equal(dividirMedioArriba(11n, 4n), 3n, '2,75 sube');
  assert.equal(dividirMedioArriba(8n, 4n), 2n, 'exacta');
  assert.equal(dividirMedioArriba(0n, 7n), 0n);
  assert.equal(dividirMedioArriba(1n, 2n), 1n, 'medio peso sube');
  assert.equal(dividirMedioArriba(1n, 3n), 0n);
  // Sin perder precisión más allá de 2^53 (objetivo × monto en el reparto y el anticipo).
  assert.equal(dividirMedioArriba(9007199254740993n * 3n + 2n, 3n), 9007199254740994n);
  // Las dos libs de dinero la usan; ninguna escribe la regla otra vez.
  for (const lib of ['iva.js', 'dinero-ventas.js']) {
    const fuente = readFileSync(new URL(`../src/lib/${lib}`, import.meta.url), 'utf8');
    assert.ok(/import \{[^}]*\bdividirMedioArriba\b[^}]*\} from '\.\/pesos\.js';/.test(fuente), `${lib} la importa`);
    assert.ok(fuente.includes('dividirMedioArriba('), `${lib} la usa`);
    assert.doesNotMatch(fuente, /% *\w+\) *\* *2n *>=/, `${lib}: sin la regla escrita a mano`);
  }
}

console.log('✓ Todos los tests de pesos pasaron exitosamente.');
