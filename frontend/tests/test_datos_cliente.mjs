/**
 * frontend/tests/test_datos_cliente.mjs
 * H21: corregir el teléfono, el correo, la dirección y la ciudad del cliente desde la solicitud. Las reglas y los
 * textos son los del backend (erp_ventas._normalizar_contacto y app/core/clientes.py, T5).
 */

import assert from 'node:assert/strict';
import { CAMPOS_CONTACTO, cambiosDeContacto, validarContacto } from '../src/lib/datos-cliente.js';

console.log('--- TEST 1: CAMPOS_CONTACTO (orden del formulario, límites del backend) ---');
{
  assert.deepEqual(CAMPOS_CONTACTO.map((c) => [c.clave, c.etiqueta, c.max, c.soloConFicha]), [
    ['customer_phone', 'Teléfono', 50, false],
    ['customer_email', 'Correo', 150, false],
    ['customer_address', 'Dirección', 255, false],
    ['customer_city', 'Ciudad', 100, true],
  ]);
  assert.ok(Object.isFrozen(CAMPOS_CONTACTO) && Object.isFrozen(CAMPOS_CONTACTO[0]));
}

const original = {
  customer_phone: '3000000000', customer_email: 'ana.vieja@test.com', customer_address: 'Calle 1', customer_city: 'Cali',
};

console.log('--- TEST 2: sin cambios -> {} ---');
{
  assert.deepEqual(cambiosDeContacto(original, { ...original }, { tieneFicha: true }), {});
  // null y '' son lo mismo (sin dato)
  assert.deepEqual(cambiosDeContacto({ customer_phone: null }, { customer_phone: '' }, { tieneFicha: true }), {});
  assert.deepEqual(cambiosDeContacto({}, { customer_address: '   ' }, { tieneFicha: true }), {});
  // una clave que no está en el formulario no se toca
  assert.deepEqual(cambiosDeContacto(original, { customer_phone: '3000000000' }, { tieneFicha: true }), {});
}

console.log('--- TEST 3: recorta espacios y solo devuelve lo que cambió ---');
{
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_phone: ' 3001112233 ' }, { tieneFicha: true }),
    { customer_phone: '3001112233' });
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_phone: ' 3000000000 ' }, { tieneFicha: true }), {});
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_address: 'Calle 2 # 3-4' }),
    { customer_address: 'Calle 2 # 3-4' });
}

console.log('--- TEST 4: el mismo correo con otras mayúsculas no cuenta como cambio ---');
{
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_email: ' Ana.Vieja@TEST.com ' }, { tieneFicha: true }), {});
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_email: ' Ana.Nueva@Test.com ' }, { tieneFicha: true }),
    { customer_email: 'ana.nueva@test.com' });
}

console.log('--- TEST 5: la ciudad solo entra si la solicitud tiene ficha ---');
{
  const form = { ...original, customer_city: 'Medellín' };
  assert.deepEqual(cambiosDeContacto(original, form, { tieneFicha: false }), {});
  assert.deepEqual(cambiosDeContacto(original, form), {});
  assert.deepEqual(cambiosDeContacto(original, form, { tieneFicha: true }), { customer_city: 'Medellín' });
}

console.log('--- TEST 6: borrar un dato es un cambio ---');
{
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_phone: '' }, { tieneFicha: true }),
    { customer_phone: '' });
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_email: '  ' }), { customer_email: '' });
}

console.log('--- TEST 7: validarContacto con los textos del backend ---');
{
  assert.equal(validarContacto({ customer_email: 'sin-arroba' }), 'El correo «sin-arroba» no es válido.');
  assert.equal(validarContacto({ customer_email: ' a b@c.co ' }), 'El correo «a b@c.co» no es válido.');
  assert.equal(validarContacto({ customer_phone: '12' }), 'El teléfono debe tener al menos 7 dígitos.');
  // solo cuentan los dígitos: '+57 (30) 1-1' tiene 6
  assert.equal(validarContacto({ customer_phone: '+57 (30) 1-1' }), 'El teléfono debe tener al menos 7 dígitos.');
  assert.equal(validarContacto({ customer_phone: '+57 (30) 1-12' }), null);
  // los 4 límites (T5): primero el largo, después el formato
  assert.equal(validarContacto({ customer_email: 'x'.repeat(151) }), 'El correo no puede tener más de 150 caracteres.');
  assert.equal(validarContacto({ customer_phone: '3'.repeat(51) }), 'El teléfono no puede tener más de 50 caracteres.');
  assert.equal(validarContacto({ customer_address: 'a'.repeat(256) }), 'La dirección es muy larga (máximo 255 caracteres).');
  assert.equal(validarContacto({ customer_city: 'c'.repeat(101) }), 'La ciudad es muy larga (máximo 100 caracteres).');
  // en el límite exacto pasa (medido sin los espacios de los bordes)
  assert.equal(validarContacto({ customer_address: ` ${'a'.repeat(255)} ` }), null);
  assert.equal(validarContacto({ customer_city: 'c'.repeat(100) }), null);
  assert.equal(validarContacto({ customer_email: `${'x'.repeat(142)}@test.co` }), null);
  assert.equal(validarContacto({ customer_phone: '3'.repeat(50) }), null);
  // un dato que no es texto
  assert.equal(validarContacto({ customer_phone: 3001112233 }), 'El dato «Teléfono» debe ser un texto.');
  // válidos
  assert.equal(validarContacto({ customer_email: ' Ana@Test.com ', customer_phone: '+57 300 111 2233' }), null);
  assert.equal(validarContacto({ customer_phone: '', customer_email: '', customer_address: '', customer_city: '' }), null,
    'borrar un dato es válido');
  assert.equal(validarContacto({}), null);
  assert.equal(validarContacto(null), null);
  // el orden es el del backend: teléfono, correo, dirección, ciudad
  assert.equal(validarContacto({ customer_email: 'mal', customer_phone: '12' }), 'El teléfono debe tener al menos 7 dígitos.');
  // otras claves se ignoran
  assert.equal(validarContacto({ customer_name: '', updated_by: 'x' }), null);
}

console.log('OK test_datos_cliente');
