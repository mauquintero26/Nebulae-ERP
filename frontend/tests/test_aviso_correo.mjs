/**
 * frontend/tests/test_aviso_correo.mjs
 * H27+H39: el modal del enlace de confirmacion dice en verde si el correo de respaldo salio, o en ambar por que no
 * salio y que hacer, segun el canal elegido.
 */

import assert from 'node:assert/strict';
import { avisoCorreo, correoDelCliente } from '../src/lib/aviso-correo.js';

console.log('--- TEST a: sin resultado de correo no hay aviso ---');
{
  assert.equal(avisoCorreo(null), null);
  assert.equal(avisoCorreo(undefined, 'WhatsApp'), null);
}

console.log('--- TEST b: correo enviado como respaldo de WhatsApp -> ok ---');
{
  const a = avisoCorreo({ enviado: true, destino: 'a@b.co', motivo: null, mensaje: 'Correo enviado a a@b.co.' }, 'WhatsApp');
  assert.equal(a.tono, 'ok');
  assert.ok(a.texto.includes('Correo enviado a a@b.co'), a.texto);
  assert.ok(a.texto.includes('WhatsApp'), a.texto);
  // por correo no es "respaldo"; sin canal (Hub antiguo) tampoco
  const email = avisoCorreo({ enviado: true, destino: 'a@b.co', motivo: null, mensaje: 'Correo enviado a a@b.co.' }, 'Email');
  assert.equal(email.tono, 'ok');
  assert.ok(!email.texto.includes('respaldo'), email.texto);
  assert.ok(!avisoCorreo({ enviado: true, destino: 'a@b.co' }, null).texto.includes('respaldo'));
  assert.ok(avisoCorreo({ enviado: true, destino: 'a@b.co' }, null).texto.includes('Correo enviado a a@b.co'));
  assert.ok(avisoCorreo({ enviado: true, destino: 'a@b.co' }, 'Otro').texto.includes('otro canal'));
}

console.log('--- TEST c: SMTP sin configurar por Email -> alerta, el cliente no recibio el enlace ---');
{
  const a = avisoCorreo({ enviado: false, destino: 'a@b.co', motivo: 'CORREO_NO_CONFIGURADO',
    mensaje: 'No se envió correo: el envío de correos no está configurado en el sistema.' }, 'Email');
  assert.equal(a.tono, 'alerta');
  assert.ok(a.texto.includes('no está configurado'), a.texto);
  assert.ok(a.texto.includes('todavía no recibió'), a.texto);
  // sin mensaje del servidor se arma desde el motivo
  const sinMensaje = avisoCorreo({ enviado: false, motivo: 'CORREO_NO_CONFIGURADO' }, null);
  assert.equal(sinMensaje.tono, 'alerta');
  assert.ok(sinMensaje.texto.includes('no está configurado'), sinMensaje.texto);
  assert.ok(sinMensaje.texto.includes('todavía no recibió'), sinMensaje.texto);
}

console.log('--- TEST d: cliente sin correo por WhatsApp -> alerta, revisar el mensaje de WhatsApp ---');
{
  const a = avisoCorreo({ enviado: false, destino: null, motivo: 'SIN_CORREO_CLIENTE',
    mensaje: 'No se envió correo: el cliente no tiene correo registrado.' }, 'WhatsApp');
  assert.equal(a.tono, 'alerta');
  assert.ok(a.texto.includes('mensaje de WhatsApp'), a.texto);
  assert.ok(a.texto.includes('no tiene correo'), a.texto);
  const otro = avisoCorreo({ enviado: false, motivo: 'FALLO_ENVIO', destino: 'a@b.co' }, 'Otro');
  assert.equal(otro.tono, 'alerta');
  assert.ok(otro.texto.includes('a@b.co'), otro.texto);
  assert.ok(otro.texto.includes('Copia el enlace'), otro.texto);
}

console.log('--- TEST B3: el correo del cliente para el ChannelModal del Hub ---');
{
  // La fila de la lista trae customer_email: se pasa tal cual (null = sin correo, el modal no ofrece Email).
  assert.equal(correoDelCliente({ numero: 'COT-1', customer_email: 'a@b.co' }), 'a@b.co');
  assert.equal(correoDelCliente({ numero: 'COT-1', customer_email: null }), null);
  assert.equal(correoDelCliente({ numero: 'COT-1', customer_email: '' }), '');
  // Sin el campo no se sabe: undefined (el modal no lo da por vacio).
  assert.equal(correoDelCliente({ numero: 'COT-1' }), undefined);
  assert.equal(correoDelCliente(null), undefined);
  assert.equal(correoDelCliente(undefined), undefined);
}

console.log('OK test_aviso_correo.mjs');
