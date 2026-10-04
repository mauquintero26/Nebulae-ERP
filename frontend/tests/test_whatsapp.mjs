/**
 * frontend/tests/test_whatsapp.mjs
 * H5: "Abrir WhatsApp" del Hub abria wa.me sin el indicativo de Colombia (+57) y el chat no cargaba.
 */

import assert from 'node:assert/strict';
import { numeroWhatsApp, waUrl } from '../src/lib/whatsapp.js';

console.log('--- TEST 1: numero colombiano de 10 digitos recibe el 57 ---');
{
  assert.equal(waUrl('3001234567'), 'https://wa.me/573001234567');
  assert.equal(waUrl('(300) 123-4567'), 'https://wa.me/573001234567');
}

console.log('--- TEST 2: si ya trae el 57 (o el 0057) no se duplica ---');
{
  assert.equal(waUrl('+57 300 123 4567'), 'https://wa.me/573001234567');
  assert.equal(waUrl('573001234567'), 'https://wa.me/573001234567');
  assert.equal(waUrl('0057 300 123 4567'), 'https://wa.me/573001234567');
  assert.ok(!waUrl('+57 300 123 4567').includes('5757'));
}

console.log('--- TEST 3: sin digitos no hay enlace (no se muestra el boton) ---');
{
  assert.equal(waUrl(''), null);
  assert.equal(waUrl(null), null);
  assert.equal(waUrl(undefined), null);
  assert.equal(waUrl('abc'), null);
  assert.equal(numeroWhatsApp('abc'), null);
}

console.log('--- TEST 4: texto del mensaje codificado ---');
{
  assert.equal(waUrl('3001234567', 'Hola Ana'), 'https://wa.me/573001234567?text=Hola%20Ana');
  assert.equal(waUrl('3001234567', 'Confírmala aquí: https://x.co/a?b=1&c=2'),
    'https://wa.me/573001234567?text=' + encodeURIComponent('Confírmala aquí: https://x.co/a?b=1&c=2'));
}

console.log('OK test_whatsapp.mjs');
