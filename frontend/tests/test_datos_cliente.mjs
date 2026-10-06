/**
 * frontend/tests/test_datos_cliente.mjs
 * H21: corregir el teléfono, el correo, la dirección y la ciudad del cliente desde la solicitud. Las reglas y los
 * textos son los del backend (erp_ventas._normalizar_contacto y app/core/clientes.py, T5).
 */

import assert from 'node:assert/strict';
import { CAMPOS_CONTACTO, cambiosDeContacto, validarContacto, avisoCorreccionContacto } from '../src/lib/datos-cliente.js';

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

console.log('--- TEST 8 (T8B, R18 y rulings 2 y 5): avisoCorreccionContacto — el aviso después de PATCH /cliente ---');
{
  const SC = 'SC-20260800';
  // Las claves exactas de la respuesta de T5 (Fix report de la ronda 2).
  const base = {
    status: 'success', data: { numero: SC }, ficha_actualizada: true, documentos_actualizados: [],
    documentos_de_otro_cliente: [], confirmacion_anulada: false, estado_cambiado: false, enlaces_anulados: [],
    sin_cambios: false,
  };
  const A = 'Datos corregidos. Como cambió el correo o el teléfono del cliente, su confirmación quedó anulada: envíale la solicitud de nuevo.';
  const COT = 'Datos corregidos. Se anuló el enlace de la cotización COT-20260486 enviado al dato anterior: pásala a Borrador y envíala de nuevo.';
  const B = 'Datos corregidos. Se anuló el enlace que se había enviado al dato anterior: usa «Reenviar enlace de confirmación».';
  const CONFIRMACION = 'Datos corregidos. La confirmación anterior del cliente ya no vale; la cotización activa sigue igual.';
  const NORMAL = 'Datos del cliente corregidos.';

  // 1. La solicitud cambió de estado (volvió a Asignada o a Nueva): gana sobre los enlaces anulados.
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, estado_cambiado: true, enlaces_anulados: [SC] }, SC),
    { texto: A, tono: 'info' });
  // T8B r1 (punto 7): si además se anuló el enlace de una cotización, el texto A lo completa (una o varias).
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, estado_cambiado: true,
    enlaces_anulados: [SC, 'COT-20260486'] }, SC), {
    texto: `${A} Se anuló también el enlace de la cotización COT-20260486: pásala a Borrador y envíala de nuevo.`, tono: 'info',
  });
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, estado_cambiado: true,
    enlaces_anulados: [SC, 'COT-1', 'COT-2'] }, SC), {
    texto: `${A} Se anularon también los enlaces de las cotizaciones COT-1 y COT-2: pásalas a Borrador y envíalas de nuevo.`,
    tono: 'info',
  });
  // … y los documentos de otro cliente siguen al final.
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, estado_cambiado: true,
    enlaces_anulados: ['COT-9'], documentos_de_otro_cliente: ['PVEN-7'] }, SC), {
    texto: `${A} Se anuló también el enlace de la cotización COT-9: pásala a Borrador y envíala de nuevo. No se cambió PVEN-7 porque es de otro cliente.`,
    tono: 'info',
  });
  // 2. Se anuló el enlace de una cotización: gana sobre el de la solicitud.
  assert.deepEqual(avisoCorreccionContacto({ ...base, enlaces_anulados: ['COT-20260486'] }, SC), { texto: COT, tono: 'info' });
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, enlaces_anulados: [SC, 'COT-20260486'] }, SC),
    { texto: COT, tono: 'info' });
  // Varias cotizaciones (raro): en plural.
  assert.deepEqual(avisoCorreccionContacto({ ...base, enlaces_anulados: ['COT-1', 'COT-2'] }, SC), {
    texto: 'Datos corregidos. Se anularon los enlaces de las cotizaciones COT-1 y COT-2 enviados al dato anterior: pásalas a Borrador y envíalas de nuevo.',
    tono: 'info',
  });
  // 3. Se anuló el enlace de la solicitud (sin cambio de estado).
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, enlaces_anulados: [SC] }, SC), { texto: B, tono: 'info' });
  // T8B r1 (punto 6): los enlaces se clasifican por el número (COT-…). Sin conocer el número de la solicitud, la SC no
  // pasa por cotización.
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, enlaces_anulados: [SC] }), { texto: B, tono: 'info' });
  assert.deepEqual(avisoCorreccionContacto({ ...base, data: {}, confirmacion_anulada: true, enlaces_anulados: [SC] }),
    { texto: B, tono: 'info' });
  const { data: _sinData, ...sinData } = base;
  assert.deepEqual(avisoCorreccionContacto({ ...sinData, confirmacion_anulada: true, enlaces_anulados: [SC] }), { texto: B, tono: 'info' });
  assert.deepEqual(avisoCorreccionContacto({ ...sinData, enlaces_anulados: ['COT-20260486'] }), { texto: COT, tono: 'info' });
  // 4. La confirmación anterior ya no vale (Confirmada con una cotización activa: el estado no cambia).
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true }, SC), { texto: CONFIRMACION, tono: 'info' });
  // 5. Lo normal (solo la dirección o la ciudad, o una solicitud Asignada).
  assert.deepEqual(avisoCorreccionContacto(base, SC), { texto: NORMAL, tono: 'ok' });
  assert.deepEqual(avisoCorreccionContacto({ status: 'success', data: { numero: SC } }, SC), { texto: NORMAL, tono: 'ok' },
    'sin las claves nuevas: el aviso normal');

  // Ruling 5: los documentos de otro cliente que no se tocaron se dicen al final (uno o varios).
  assert.deepEqual(avisoCorreccionContacto({ ...base, documentos_de_otro_cliente: ['COT-5'] }, SC),
    { texto: `${NORMAL} No se cambió COT-5 porque es de otro cliente.`, tono: 'info' });
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, estado_cambiado: true,
    documentos_de_otro_cliente: ['COT-5', 'PVEN-7'] }, SC),
  { texto: `${A} No se cambiaron COT-5 y PVEN-7 porque son de otro cliente.`, tono: 'info' });

  // Sin cambios: nada que avisar, salvo los documentos de otro cliente.
  assert.equal(avisoCorreccionContacto({ ...base, sin_cambios: true }, SC), null);
  assert.deepEqual(avisoCorreccionContacto({ ...base, sin_cambios: true, documentos_de_otro_cliente: ['COT-5', 'COT-6', 'PVEN-7'] }, SC),
    { texto: 'No se cambiaron COT-5, COT-6 y PVEN-7 porque son de otro cliente.', tono: 'info' });
  // Sin respuesta.
  assert.equal(avisoCorreccionContacto(null, SC), null);
  assert.equal(avisoCorreccionContacto(undefined, SC), null);
}

console.log('OK test_datos_cliente');
