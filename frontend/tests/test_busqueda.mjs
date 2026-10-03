/**
 * frontend/tests/test_busqueda.mjs
 * Los buscadores de listados (SC, PVEN, Hub, Compras...) solo miraban numero/cliente/
 * asesor: no se podia encontrar un documento por el nombre de un producto.
 */

import assert from 'node:assert/strict';
import { coincideProducto, normalizarBusqueda } from '../src/lib/busqueda.js';

const pedido = {
  numero: 'PVEN-1',
  productos: [
    { product_name: 'Zapatos Adidas', qty: 1, sku: 'ADI-001' },
    { nombre: 'Colchón ortopédico', qty: 2 },
    { name: 'Cuna colecho', qty: 1 },
  ],
};

console.log('--- TEST 1: encuentra por nombre de producto (product_name / nombre / name) ---');
{
  assert.equal(coincideProducto(pedido, 'adidas'), true);
  assert.equal(coincideProducto(pedido, 'ortopédico'), true);
  assert.equal(coincideProducto(pedido, 'colecho'), true);
}

console.log('--- TEST 2: ignora mayusculas y tildes en ambos lados ---');
{
  assert.equal(coincideProducto(pedido, 'ZAPATOS'), true);
  assert.equal(coincideProducto(pedido, 'colchon ortopedico'), true);
  assert.equal(normalizarBusqueda('  Colchón  '), 'colchon');
}

console.log('--- TEST 3: tambien por SKU y por fragmento ---');
{
  assert.equal(coincideProducto(pedido, 'adi-001'), true);
  assert.equal(coincideProducto(pedido, 'zap'), true);
}

console.log('--- TEST 4: no encuentra lo que no esta, ni usa otras claves de la linea ---');
{
  assert.equal(coincideProducto(pedido, 'sandalias'), false);
  // "qty" es una clave de la linea, no un nombre de producto
  assert.equal(coincideProducto(pedido, 'qty'), false);
  assert.equal(coincideProducto(pedido, '2'), false);
}

console.log('--- TEST 5: termino vacio no coincide (el llamador decide que hacer sin filtro) ---');
{
  assert.equal(coincideProducto(pedido, ''), false);
  assert.equal(coincideProducto(pedido, '   '), false);
  assert.equal(coincideProducto(pedido, undefined), false);
}

console.log('--- TEST 6: documentos sin lineas o con datos raros no rompen ---');
{
  assert.equal(coincideProducto({}, 'adidas'), false);
  assert.equal(coincideProducto(null, 'adidas'), false);
  assert.equal(coincideProducto({ productos: null }, 'adidas'), false);
  assert.equal(coincideProducto({ productos: 'adidas' }, 'adidas'), false);
  assert.equal(coincideProducto({ productos: [null, 5, 'adidas', { product_name: 42 }] }, 'adidas'), false);
}

console.log('OK test_busqueda.mjs');
