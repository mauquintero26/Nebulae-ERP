/**
 * frontend/tests/test_cliente_desde_busqueda.mjs
 * H11: 'Agregar cliente' abre el alta con lo que se escribió en el buscador (nombre, teléfono o correo).
 */

import assert from 'node:assert/strict';
import { datosInicialesCliente, nombreCliente } from '../src/lib/cliente-desde-busqueda.js';

const VACIO = { first_name: '', last_name: '', phone: '', email: '' };

console.log('--- TEST 1: un nombre va completo a first_name (no se adivina el apellido) ---');
{
  assert.deepEqual(datosInicialesCliente('DEMO Pinturas La Brocha'), { ...VACIO, first_name: 'DEMO Pinturas La Brocha' });
  assert.deepEqual(datosInicialesCliente('  ana   maria '), { ...VACIO, first_name: 'ana maria' });
}

console.log('--- TEST 2: un celular o un fijo de Colombia va a phone ---');
{
  for (const t of ['3009990002', '+57 300 999 0002', '300-999-0002', '(300) 999 0002', '573009990002']) {
    assert.deepEqual(datosInicialesCliente(t), { ...VACIO, phone: '3009990002' }, t);
  }
  assert.deepEqual(datosInicialesCliente('6041234567'), { ...VACIO, phone: '6041234567' });
  assert.deepEqual(datosInicialesCliente('+57 604 123 4567'), { ...VACIO, phone: '6041234567' });
}

console.log('--- TEST 3: otro número (cédula, NIT) no se pone en ningún campo ---');
{
  for (const t of ['1020304050', '900123456', '123', '+1 555 123 4567', '5512345678']) {
    assert.deepEqual(datosInicialesCliente(t), VACIO, t);
  }
}

console.log('--- TEST 4: un correo va a email, recortado y en minúsculas ---');
{
  assert.deepEqual(datosInicialesCliente(' Demo.Pinturas@Example.com '), { ...VACIO, email: 'demo.pinturas@example.com' });
}

console.log('--- TEST 5: vacío ---');
{
  assert.deepEqual(datosInicialesCliente(''), VACIO);
  assert.deepEqual(datosInicialesCliente('   '), VACIO);
  assert.deepEqual(datosInicialesCliente(null), VACIO);
  assert.deepEqual(datosInicialesCliente(undefined), VACIO);
}

console.log('--- TEST 6: nombreCliente ---');
{
  assert.equal(nombreCliente({ name: 'Ferretería La 14', first_name: 'x' }), 'Ferretería La 14');
  assert.equal(nombreCliente({ full_name: 'Ana María Pérez' }), 'Ana María Pérez');
  assert.equal(nombreCliente({ first_name: 'Ana', last_name: 'Pérez' }), 'Ana Pérez');
  assert.equal(nombreCliente({ first_name: 'Ana', last_name: null }), 'Ana');
  assert.equal(nombreCliente({ first_name: '', last_name: 'Pérez' }), 'Pérez');
  assert.equal(nombreCliente({}), '');
  assert.equal(nombreCliente(null), '');
}

console.log('OK test_cliente_desde_busqueda');
