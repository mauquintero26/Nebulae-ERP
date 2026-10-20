/**
 * frontend/tests/test_whatsapp.mjs
 * H5: "Abrir WhatsApp" del Hub abria wa.me sin el indicativo de Colombia (+57) y el chat no cargaba.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { numeroWhatsApp, waUrl, whatsappParaReabrir, abrirWhatsApp } from '../src/lib/whatsapp.js';

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

console.log('--- TEST 5 (B13): boton "Abrir WhatsApp" del modal del enlace, por si el navegador bloqueo la ventana ---');
{
  const url = waUrl('3001234567', 'Hola, aquí está tu cotización COT-1. Confírmala aquí: https://x.co/c/abc');
  assert.equal(whatsappParaReabrir('WhatsApp', url), url, 'el mismo enlace wa.me que se intento abrir');
  assert.equal(whatsappParaReabrir('Email', url), null, 'solo si el canal fue WhatsApp');
  assert.equal(whatsappParaReabrir('Otro', url), null);
  assert.equal(whatsappParaReabrir(null, url), null);
  assert.equal(whatsappParaReabrir('WhatsApp', null), null, 'sin telefono no hay boton');
  assert.equal(whatsappParaReabrir('WhatsApp', 'javascript:alert(1)'), null, 'solo enlaces wa.me');
  assert.equal(whatsappParaReabrir('WhatsApp', 'https://evil.co/wa.me/57'), null);
}

console.log('--- TEST 6 (B3 T19 r1): abrirWhatsApp abre wa.me sin window.opener (noopener, noreferrer) ---');
{
  const abiertas = [];
  globalThis.window = { open: (...args) => { abiertas.push(args); return null; } };
  try {
    const url = waUrl('3001234567', 'Hola');
    abrirWhatsApp(url);
    assert.deepEqual(abiertas, [[url, '_blank', 'noopener,noreferrer']]);
    // Solo enlaces wa.me (el de waUrl); nada sin enlace.
    for (const raro of [null, undefined, '', 'javascript:alert(1)', 'https://evil.co/wa.me/57']) abrirWhatsApp(raro);
    assert.equal(abiertas.length, 1);
  } finally {
    delete globalThis.window;
  }
  abrirWhatsApp(waUrl('3001234567')); // sin window (el servidor): no lanza
  // Las pantallas que envían por WhatsApp (COT, SC, el envío del PVEN y, r2, el Hub) abren wa.me solo con el helper.
  // chatter.tsx no entra: usa el valor de retorno de window.open (abrir la app y, si no, el respaldo).
  for (const ruta of ['cotizacion/[id]/page.tsx', 'solicitud/[id]/page.tsx', 'venta/[id]/detalle-bloque3.tsx', 'page.tsx']) {
    const fuente = readFileSync(new URL(`../src/app/dashboard/ventas/${ruta}`, import.meta.url), 'utf8');
    assert.ok(!fuente.includes('window.open('), `${ruta}: sin window.open( suelto`);
    assert.ok(/abrirWhatsApp\(/.test(fuente), `${ruta}: usa abrirWhatsApp`);
  }
}

console.log('OK test_whatsapp.mjs');
