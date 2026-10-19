/**
 * frontend/tests/test_aviso_correo.mjs
 * H27+H39: el modal del enlace de confirmacion dice en verde si el correo de respaldo salio, o en ambar por que no
 * salio y que hacer, segun el canal elegido.
 */

import assert from 'node:assert/strict';
import { avisoCorreo, correoDelCliente, textosVentanaEnlace } from '../src/lib/aviso-correo.js';

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

console.log('--- TEST B3 T16: textosVentanaEnlace (C28: tipo, vence y el WhatsApp que ya salió) ---');
{
  const NOTA = 'Solo el cliente debería confirmar o pedir cambios: si abres el enlace y lo haces tú, queda registrado '
    + 'como si fuera el cliente.';
  const MANUAL = 'Envíale este enlace al cliente por el canal que prefieras.';
  const AUTOMATICO = 'El sistema ya le envió este enlace al cliente por WhatsApp. Puedes copiarlo si también quieres '
    + 'mandarlo por otro medio.';
  const SIGUIENTE = 'cuando el cliente lo abra y confirme, esta pantalla te mostrará el siguiente paso.';
  // SC (sin fecha): el texto de siempre, y el aviso nuevo de U17-H28 (punto 14).
  assert.deepEqual(textosVentanaEnlace({ documento: 'la solicitud SC-1' }), {
    titulo: 'Enlace de confirmación listo', subtitulo: 'El cliente confirma la solicitud SC-1 desde este enlace',
    intro: MANUAL, vigencia: `Es de un solo uso y vence en 2 días; ${SIGUIENTE}`, nota: NOTA });
  // COT con la fecha real (C14): el último día en que sirve, sin pasarlo a otra zona.
  const cot = textosVentanaEnlace({ tipo: 'confirmacion', documento: 'la cotización COT-1', vence: '2026-10-08' });
  assert.equal(cot.vigencia, `Es de un solo uso y sirve hasta el 8 de octubre de 2026; ${SIGUIENTE}`);
  // Un instante es el vence_at EXCLUSIVO (00:00 en Colombia del día siguiente, nota tras T7): muestra el día anterior.
  assert.equal(textosVentanaEnlace({ vence: '2026-10-09T05:00:00Z' }).vigencia,
    `Es de un solo uso y sirve hasta el 8 de octubre de 2026; ${SIGUIENTE}`);
  // Una fecha que no se puede leer: el texto sin fecha.
  assert.equal(textosVentanaEnlace({ vence: 'mañana' }).vigencia, `Es de un solo uso y vence en 2 días; ${SIGUIENTE}`);
  // El WhatsApp automático ya salió (U16-envio punto 12).
  assert.equal(textosVentanaEnlace({ documento: 'la solicitud SC-1', whatsappEnviado: true }).intro, AUTOMATICO);
  assert.equal(textosVentanaEnlace({ whatsappEnviado: 'true' }).intro, MANUAL, 'solo con true');
  // Pedido de consulta (U23 punto 8): su título, subtítulo y texto, sin la nota de «Solo el cliente…».
  assert.deepEqual(textosVentanaEnlace({ tipo: 'consulta', documento: 'el pedido PVEN-1', vence: '2026-11-02' }), {
    titulo: 'Enlace del pedido listo', subtitulo: 'El cliente ve su pedido, lo que ha pagado y lo que le falta',
    intro: MANUAL, vigencia: 'Puede abrirlo las veces que quiera hasta el 2 de noviembre de 2026. Si lo reenvías, el '
      + 'enlace anterior deja de servir; si cancelas el pedido, deja de abrir.', nota: null });
  assert.equal(textosVentanaEnlace({ tipo: 'consulta' }).vigencia, 'Puede abrirlo las veces que quiera. Si lo '
    + 'reenvías, el enlace anterior deja de servir; si cancelas el pedido, deja de abrir.');
  assert.equal(textosVentanaEnlace({ tipo: 'consulta', whatsappEnviado: true }).intro, AUTOMATICO);
  // Un tipo desconocido es el de confirmación; sin argumentos no lanza.
  assert.equal(textosVentanaEnlace({ tipo: 'otro' }).titulo, 'Enlace de confirmación listo');
  assert.equal(textosVentanaEnlace().subtitulo, 'El cliente confirma el documento desde este enlace');
}

console.log('OK test_aviso_correo.mjs');
