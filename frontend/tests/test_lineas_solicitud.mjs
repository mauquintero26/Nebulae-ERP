/**
 * frontend/tests/test_lineas_solicitud.mjs
 * U7+U8+H12+H13 con la regla de cantidad de H25 (choque C2): la librería única de las líneas de producto de la
 * solicitud (formulario de creación y editor del detalle).
 */

import assert from 'node:assert/strict';
import {
  lineaDesdeCatalogo, lineaTextoLibre, agregarLinea, resolverTextoEscrito, lineasParaEnviar, nombreLinea,
  quitarLinea, cantidadValida, cambiarCantidad,
} from '../src/lib/lineas-solicitud.js';

const copiaProfunda = (v) => JSON.parse(JSON.stringify(v));

console.log('--- TEST 1: lineaDesdeCatalogo (con un solo argumento y con {creado}) ---');
{
  assert.deepEqual(lineaDesdeCatalogo({ id: 7, name: 'Brocha 2"' }),
    { product_name: 'Brocha 2"', qty: 1, unit_price_cop: 0, sku_id: 7, _nuevo: false });
  assert.deepEqual(lineaDesdeCatalogo({ id: 8, product_name: 'Rodillo 9in', name: 'otro' }, { creado: true }),
    { product_name: 'Rodillo 9in', qty: 1, unit_price_cop: 0, sku_id: 8, _nuevo: true });
  assert.equal(lineaDesdeCatalogo({ id: 9, name: 'X' }, { creado: false })._nuevo, false);
  assert.equal(lineaDesdeCatalogo({ id: 9, name: 'X' }, {})._nuevo, false);
  assert.equal(lineaDesdeCatalogo({ name: 'Sin id' }).sku_id, null);
}

console.log('--- TEST 2: lineaTextoLibre ---');
{
  assert.deepEqual(lineaTextoLibre('  Cinta de enmascarar DEMO  '),
    { product_name: 'Cinta de enmascarar DEMO', qty: 1, unit_price_cop: 0, sku_id: null });
}

console.log('--- TEST 3: agregarLinea (fusión por sku y por texto libre normalizado, sin mutar) ---');
{
  const base = [lineaDesdeCatalogo({ id: 1, name: 'Pintura' }), lineaTextoLibre('Brocha 1/2"')];
  const antes = copiaProfunda(base);

  let r = agregarLinea(base, lineaDesdeCatalogo({ id: 2, name: 'Lija' }));
  assert.equal(r.lineas.length, 3);
  assert.equal(r.indice, 2);
  assert.equal(r.fusionada, false);
  assert.equal(r.lineas[2].product_name, 'Lija');

  r = agregarLinea(base, lineaDesdeCatalogo({ id: 1, name: 'Pintura' }));
  assert.equal(r.lineas.length, 2);
  assert.equal(r.indice, 0);
  assert.equal(r.fusionada, true);
  assert.equal(r.lineas[0].qty, 2, '1 + 1');

  // texto libre con el mismo nombre normalizado (mayúsculas, tildes y espacios)
  r = agregarLinea(base, lineaTextoLibre('  brocha   1/2" '));
  assert.deepEqual([r.lineas.length, r.indice, r.fusionada, r.lineas[1].qty], [2, 1, true, 2]);
  r = agregarLinea([lineaTextoLibre('Brocha eléctrica')], lineaTextoLibre('BROCHA ELECTRICA'));
  assert.equal(r.fusionada, true);

  // un texto libre frente a una línea del catálogo con el mismo nombre NO se fusiona
  r = agregarLinea(base, lineaTextoLibre('Pintura'));
  assert.deepEqual([r.lineas.length, r.fusionada], [3, false]);
  // ni una línea del catálogo frente a un texto libre con su nombre
  r = agregarLinea(base, lineaDesdeCatalogo({ id: 5, name: 'Brocha 1/2"' }));
  assert.deepEqual([r.lineas.length, r.fusionada], [3, false]);

  // una cantidad que se está escribiendo ('') cuenta como 1 al sumar
  r = agregarLinea([{ ...base[0], qty: '' }], lineaDesdeCatalogo({ id: 1, name: 'Pintura' }));
  assert.equal(r.lineas[0].qty, 2);
  r = agregarLinea([{ ...base[0], qty: 3 }], { ...lineaDesdeCatalogo({ id: 1, name: 'Pintura' }), qty: 2 });
  assert.equal(r.lineas[0].qty, 5);

  // nunca muta la entrada
  assert.deepEqual(base, antes);
  // lista vacía o ausente
  r = agregarLinea(undefined, lineaTextoLibre('Algo'));
  assert.deepEqual([r.lineas.length, r.indice, r.fusionada], [1, 0, false]);
}

console.log('--- TEST 4: cantidadValida (entero >= 1) ---');
{
  const casos = [['0', 1], [-3, 1], ['', 1], ['abc', 1], ['2.7', 2], [2.7, 2], [5, 5], ['7', 7], [null, 1], [undefined, 1],
    [0.5, 1], [Infinity, 1], [NaN, 1]];
  for (const [v, esperado] of casos) assert.equal(cantidadValida(v), esperado, String(v));
}

console.log('--- TEST 5: cambiarCantidad (acepta \'\' mientras se escribe; no muta) ---');
{
  const lineas = [lineaTextoLibre('A'), lineaTextoLibre('B')];
  const antes = copiaProfunda(lineas);
  let r = cambiarCantidad(lineas, 0, '');
  assert.equal(r[0].qty, '', 'se puede borrar el número para escribir otro');
  assert.notEqual(r, lineas);
  assert.deepEqual(lineas, antes, 'no muta');
  r = cambiarCantidad(r, 0, '5');
  assert.equal(r[0].qty, 5, "'5' tras borrar es 5, no 15 (H25)");
  for (const [v, esperado] of [['0', 1], [-3, 1], ['abc', 1], ['2.7', 2], [12, 12]]) {
    assert.equal(cambiarCantidad(lineas, 1, v)[1].qty, esperado, String(v));
  }
  assert.equal(cambiarCantidad(lineas, 1, '4')[0], lineas[0], 'las otras líneas no cambian');
  assert.deepEqual(cambiarCantidad(lineas, 9, '4'), lineas, 'índice fuera de rango: igual');
}

console.log('--- TEST 6: quitarLinea ---');
{
  const lineas = [lineaTextoLibre('A'), lineaTextoLibre('B'), lineaTextoLibre('C')];
  const antes = copiaProfunda(lineas);
  assert.deepEqual(quitarLinea(lineas, 1).map((l) => l.product_name), ['A', 'C']);
  assert.deepEqual(lineas, antes, 'no muta');
  assert.deepEqual(quitarLinea(lineas, 5).map((l) => l.product_name), ['A', 'B', 'C']);
}

console.log('--- TEST 7: lineasParaEnviar ---');
{
  const lineas = [
    { ...lineaDesdeCatalogo({ id: 1, name: 'Pintura' }, { creado: true }), qty: '' },
    { ...lineaTextoLibre('Brocha'), qty: '3', _tmp: 'x', notas: 'conservar' },
  ];
  const antes = copiaProfunda(lineas);

  let r = lineasParaEnviar(lineas, '');
  assert.deepEqual(r, [
    { product_name: 'Pintura', qty: 1, unit_price_cop: 0, sku_id: 1 },
    { product_name: 'Brocha', qty: 3, unit_price_cop: 0, sku_id: null, notas: 'conservar' },
  ], 'sin claves "_" y con cantidades válidas');
  assert.deepEqual(lineas, antes, 'no muta');

  // lo escrito sin "+ Agregar" también se guarda, junto a las líneas que ya había (regresión de getExtras)
  r = lineasParaEnviar(lineas, '  Cinta de enmascarar ');
  assert.equal(r.length, 3);
  assert.deepEqual(r[2], { product_name: 'Cinta de enmascarar', qty: 1, unit_price_cop: 0, sku_id: null });
  // un pendiente de solo espacios se ignora
  assert.equal(lineasParaEnviar(lineas, '   ').length, 2);
  assert.equal(lineasParaEnviar(lineas).length, 2);
  // un pendiente igual a un texto libre que ya está se suma a esa línea (misma regla que agregarLinea)
  r = lineasParaEnviar(lineas, 'BROCHA');
  assert.deepEqual([r.length, r[1].qty], [2, 4]);
  // sin líneas: solo el pendiente
  assert.deepEqual(lineasParaEnviar([], 'Algo'), [{ product_name: 'Algo', qty: 1, unit_price_cop: 0, sku_id: null }]);
  assert.deepEqual(lineasParaEnviar(null, ''), []);
}

console.log('--- TEST 8: resolverTextoEscrito ---');
{
  const resultados = [
    { id: 1, name: 'Brocha Eléctrica Grande' },
    { id: 2, product_name: 'Brocha Eléctrica' },
    { id: 3, nombre: 'Rodillo' },
  ];
  assert.equal(resolverTextoEscrito('  brocha   electrica ', resultados), resultados[1], 'exacto sin tildes ni mayúsculas');
  assert.equal(resolverTextoEscrito('RODILLO', resultados), resultados[2]);
  assert.equal(resolverTextoEscrito('brocha', resultados), null, 'parcial');
  assert.equal(resolverTextoEscrito('', resultados), null);
  assert.equal(resolverTextoEscrito('Rodillo', null), null);
}

console.log('--- TEST 9: nombreLinea ---');
{
  assert.equal(nombreLinea({ product_name: '  Pintura  ' }), 'Pintura');
  assert.equal(nombreLinea({ nombre: 'Lija' }), 'Lija');
  assert.equal(nombreLinea({ name: 'Brocha' }), 'Brocha');
  assert.equal(nombreLinea({ product_name: '  ', name: 'Brocha' }), 'Brocha');
  assert.equal(nombreLinea({}), '');
  assert.equal(nombreLinea(null), '');
}

console.log('OK test_lineas_solicitud');
