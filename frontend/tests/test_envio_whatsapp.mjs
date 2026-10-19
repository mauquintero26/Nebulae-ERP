/**
 * frontend/tests/test_envio_whatsapp.mjs
 * B3 T13 (U16-envio puntos 10 y 11, U16-entrega punto 3): lib/envio-whatsapp.js y el tercer parámetro de avisoCorreo.
 * - avisoWhatsApp(wa, canal): el recuadro del WhatsApp en la ventana del enlace (verde si salió, azul si el automático
 *   está apagado, ámbar con el motivo y el botón manual si no salió). CHATWOOT_SIN_RESPUESTA nunca dice que no salió.
 * - debeVerificar(wa) y textoEntrega(estado, texto): la verificación de entrega (U16-entrega).
 * - avisoCorreo(correo, canal, whatsappEnviado): si el correo no salió pero el WhatsApp sí, 'info' con 'sí salió'.
 * La respuesta real del envío (B3 T8) trae en `whatsapp`: enviado, estado, modo, destino, destino_legible, motivo,
 * texto_resultado, mensaje, detalle, envio_id y texto_manual.
 */

import assert from 'node:assert/strict';
import {
  avisoWhatsApp, debeVerificar, textoEntrega, TEXTOS_MOTIVO_WHATSAPP, TEXTOS_WHATSAPP_ENVIADO, ESTADOS_FINALES_ENTREGA,
} from '../src/lib/envio-whatsapp.js';
import { avisoCorreo } from '../src/lib/aviso-correo.js';

const BOTON = '«Abrir WhatsApp con el mensaje»';
// Una respuesta como la de enviar_documento (T8), con lo que haga falta encima.
const wa = (extra) => ({
  enviado: false, estado: 'NO_ENVIADO', modo: null, destino: '+573001234567', destino_legible: '+57 300 123 4567',
  motivo: null, texto_resultado: null, mensaje: 'Hola Ana, ...', detalle: null, envio_id: 41,
  texto_manual: 'Hola Ana, te escribimos de Pinturas. https://erp/confirmar/abc', ...extra,
});
const enviadoTexto = wa({ enviado: true, estado: 'ENVIADO', modo: 'TEXTO',
  texto_resultado: 'Enviado automáticamente al +57 300 123 4567 desde el WhatsApp de la empresa.' });

console.log('--- TEST 1: sin resultado o con otro canal no hay recuadro de WhatsApp ---');
{
  assert.equal(avisoWhatsApp(null, 'WhatsApp'), null);
  assert.equal(avisoWhatsApp(undefined, 'WhatsApp'), null);
  assert.equal(avisoWhatsApp('x', 'WhatsApp'), null);
  assert.equal(avisoWhatsApp(enviadoTexto, 'Email'), null);
  assert.equal(avisoWhatsApp(enviadoTexto, 'Otro'), null);
  assert.equal(avisoWhatsApp(enviadoTexto, null), null);
}

console.log('--- TEST 2: enviado como texto -> ok, con el número y sin botón ---');
{
  const a = avisoWhatsApp(enviadoTexto, 'WhatsApp');
  assert.equal(a.tono, 'ok');
  assert.ok(a.texto.includes('+57 300 123 4567'), a.texto);
  assert.equal(a.botonManual, false);
  // Sin el texto del servidor se arma con TEXTOS_WHATSAPP_ENVIADO y el número legible del e164.
  const local = avisoWhatsApp({ enviado: true, estado: 'ENVIADO', modo: 'TEXTO', destino: '+573001234567' }, 'WhatsApp');
  assert.equal(local.texto, 'Enviado automáticamente al +57 300 123 4567 desde el WhatsApp de la empresa.');
  assert.equal(local.tono, 'ok');
}

console.log('--- TEST 3: enviado con la plantilla -> el texto dice plantilla ---');
{
  const a = avisoWhatsApp(wa({ enviado: true, estado: 'ENVIADO', modo: 'PLANTILLA', texto_resultado:
    'Enviado automáticamente al +57 300 123 4567 con la plantilla aprobada «documento» (el cliente no había escrito en '
    + 'las últimas 24 horas).' }), 'WhatsApp');
  assert.equal(a.tono, 'ok');
  assert.ok(a.texto.includes('plantilla'), a.texto);
  assert.equal(a.botonManual, false);
  const local = avisoWhatsApp({ enviado: true, modo: 'PLANTILLA', destino: '+14155550123', plantilla: 'documento' },
    'WhatsApp');
  assert.equal(local.texto, 'Enviado automáticamente al +14155550123 con la plantilla aprobada «documento» (el cliente '
    + 'no había escrito en las últimas 24 horas).');
  // Sin el nombre de la plantilla no queda un «{plantilla}» suelto.
  const sinNombre = avisoWhatsApp({ enviado: true, modo: 'PLANTILLA', destino: '+573001234567' }, 'WhatsApp');
  assert.ok(sinNombre.texto.includes('con la plantilla aprobada (el cliente'), sinNombre.texto);
  assert.ok(!sinNombre.texto.includes('{'), sinNombre.texto);
}

console.log('--- TEST 4: fuera de la ventana sin plantilla -> alerta, 24 horas y botón ---');
{
  const a = avisoWhatsApp(wa({ motivo: 'FUERA_DE_VENTANA_SIN_PLANTILLA',
    texto_resultado: TEXTOS_MOTIVO_WHATSAPP.FUERA_DE_VENTANA_SIN_PLANTILLA }), 'WhatsApp');
  assert.equal(a.tono, 'alerta');
  assert.ok(a.texto.includes('24 horas'), a.texto);
  assert.ok(a.texto.includes(BOTON), a.texto);
  assert.equal(a.botonManual, true);
  // Sin el texto del servidor, el mismo motivo con el texto espejo.
  const local = avisoWhatsApp({ enviado: false, motivo: 'FUERA_DE_VENTANA_SIN_PLANTILLA' }, 'WhatsApp');
  assert.ok(local.texto.startsWith(TEXTOS_MOTIVO_WHATSAPP.FUERA_DE_VENTANA_SIN_PLANTILLA), local.texto);
  assert.equal(local.botonManual, true);
}

console.log('--- TEST 5: automático apagado -> info con botón (se abrió wa.me como hoy) ---');
{
  const a = avisoWhatsApp(wa({ motivo: 'ENVIO_AUTOMATICO_APAGADO',
    texto_resultado: TEXTOS_MOTIVO_WHATSAPP.ENVIO_AUTOMATICO_APAGADO }), 'WhatsApp');
  assert.equal(a.tono, 'info');
  assert.equal(a.botonManual, true);
  assert.ok(a.texto.includes('apagado'), a.texto);
  assert.ok(a.texto.includes(BOTON), a.texto);
}

console.log('--- TEST 6: Chatwoot sin respuesta -> alerta con «puede que», nunca «No se envió» ---');
{
  const a = avisoWhatsApp(wa({ motivo: 'CHATWOOT_SIN_RESPUESTA',
    texto_resultado: TEXTOS_MOTIVO_WHATSAPP.CHATWOOT_SIN_RESPUESTA }), 'WhatsApp');
  assert.equal(a.tono, 'alerta');
  assert.ok(a.texto.includes('puede que'), a.texto);
  assert.ok(!/no se envi|no sali/i.test(a.texto), a.texto);
  assert.ok(a.texto.includes('Si no le llegó'), a.texto);
  assert.equal(a.botonManual, true);
  const local = avisoWhatsApp({ enviado: false, motivo: 'CHATWOOT_SIN_RESPUESTA' }, 'WhatsApp');
  assert.ok(local.texto.includes('puede que'), local.texto);
  assert.ok(!/no se envi|no sali/i.test(local.texto), local.texto);
}

console.log('--- TEST 7: los demás motivos -> alerta con su motivo y el botón ---');
{
  for (const motivo of ['CHATWOOT_NO_CONFIGURADO', 'BANDEJA_NO_CONFIGURADA', 'TELEFONO_INVALIDO']) {
    const a = avisoWhatsApp({ enviado: false, motivo }, 'WhatsApp');
    assert.equal(a.tono, 'alerta', motivo);
    assert.equal(a.texto, `${TEXTOS_MOTIVO_WHATSAPP[motivo]} Envíaselo tú con el botón ${BOTON}.`);
    assert.equal(a.botonManual, true);
  }
  // FALLO_CHATWOOT: el detalle del servidor va en el texto (recortado a 150, como _recortar).
  const a = avisoWhatsApp(wa({ motivo: 'FALLO_CHATWOOT', detalle: '422: número inválido' }), 'WhatsApp');
  assert.ok(a.texto.startsWith('No se envió: Chatwoot rechazó el mensaje (422: número inválido).'), a.texto);
  const largo = avisoWhatsApp({ enviado: false, motivo: 'FALLO_CHATWOOT', detalle: 'x'.repeat(300) }, 'WhatsApp');
  assert.ok(largo.texto.includes(`(${'x'.repeat(149)}…)`), largo.texto);
  assert.ok(avisoWhatsApp({ enviado: false, motivo: 'FALLO_CHATWOOT' }, 'WhatsApp').texto.includes('(sin detalle)'));
  // El texto del servidor gana sobre el espejo.
  const servidor = avisoWhatsApp(wa({ motivo: 'FALLO_CHATWOOT', texto_resultado: 'Texto del servidor.' }), 'WhatsApp');
  assert.equal(servidor.texto, `Texto del servidor. Envíaselo tú con el botón ${BOTON}.`);
  // Un motivo que el frontend no conoce: alerta genérica con botón, sin código crudo.
  const raro = avisoWhatsApp({ enviado: false, motivo: 'ALGO_NUEVO' }, 'WhatsApp');
  assert.equal(raro.tono, 'alerta');
  assert.ok(!raro.texto.includes('ALGO_NUEVO'), raro.texto);
  assert.equal(raro.botonManual, true);
}

console.log('--- TEST 8: textos espejo de core/envio_whatsapp.py (la paridad la corre test_paridad_bloque3.py) ---');
{
  assert.deepEqual(Object.keys(TEXTOS_MOTIVO_WHATSAPP).sort(), ['BANDEJA_NO_CONFIGURADA', 'CHATWOOT_NO_CONFIGURADO',
    'CHATWOOT_SIN_RESPUESTA', 'ENVIO_AUTOMATICO_APAGADO', 'FALLO_CHATWOOT', 'FUERA_DE_VENTANA_SIN_PLANTILLA',
    'TELEFONO_INVALIDO']);
  assert.deepEqual(Object.keys(TEXTOS_WHATSAPP_ENVIADO).sort(), ['PLANTILLA', 'TEXTO']);
  assert.deepEqual(ESTADOS_FINALES_ENTREGA, ['LEIDO', 'FALLIDO']);
  for (const c of [TEXTOS_MOTIVO_WHATSAPP, TEXTOS_WHATSAPP_ENVIADO, ESTADOS_FINALES_ENTREGA]) assert.ok(Object.isFrozen(c));
}

console.log('--- TEST 9: debeVerificar (U16-entrega) ---');
{
  assert.equal(debeVerificar(enviadoTexto), true);
  assert.equal(debeVerificar({ ...enviadoTexto, estado: 'FALLIDO' }), false);
  assert.equal(debeVerificar({ ...enviadoTexto, estado: 'LEIDO' }), false);
  assert.equal(debeVerificar({ ...enviadoTexto, envio_id: null }), false);
  assert.equal(debeVerificar({ ...enviadoTexto, envio_id: undefined }), false);
  assert.equal(debeVerificar({ ...enviadoTexto, enviado: false }), false);
  assert.equal(debeVerificar(wa({ motivo: 'ENVIO_AUTOMATICO_APAGADO' })), false);
  assert.equal(debeVerificar(null), false);
}

console.log('--- TEST 10: textoEntrega (U16-entrega) ---');
{
  assert.ok(textoEntrega('LEIDO').includes('leyó'));
  assert.equal(textoEntrega('LEIDO'), 'El cliente ya lo leyó.');
  assert.equal(textoEntrega('ENTREGADO', 'El WhatsApp le llegó al cliente.'), 'Le llegó al cliente.');
  // FALLIDO: el texto del servidor trae el motivo traducido; sin él, uno corto.
  assert.equal(textoEntrega('FALLIDO', 'El WhatsApp no le llegó al cliente: ese número no tiene WhatsApp.'),
    'El WhatsApp no le llegó al cliente: ese número no tiene WhatsApp.');
  assert.equal(textoEntrega('FALLIDO'), 'No le llegó al cliente.');
  // ENVIADO: lo que diga el servidor (también «No se pudo consultar Chatwoot…»), o el texto del estado.
  assert.equal(textoEntrega('ENVIADO', 'No se pudo consultar Chatwoot ahora; vuelve a intentar.'),
    'No se pudo consultar Chatwoot ahora; vuelve a intentar.');
  assert.equal(textoEntrega('ENVIADO'),
    'Chatwoot aceptó el mensaje; WhatsApp todavía no confirma que le llegó al cliente.');
  assert.equal(textoEntrega('NO_ENVIADO', 'Texto.'), 'Texto.');
  assert.equal(textoEntrega('OTRO'), '');
}

console.log('--- TEST 11: avisoCorreo con el tercer parámetro (U16-envio punto 11) ---');
{
  const fallido = { enviado: false, destino: null, motivo: 'SIN_CORREO_CLIENTE',
    mensaje: 'No se envió correo: el cliente no tiene correo registrado.' };
  const a = avisoCorreo(fallido, 'WhatsApp', true);
  assert.equal(a.tono, 'info');
  assert.ok(a.texto.includes('sí salió'), a.texto);
  assert.equal(a.texto, 'No se envió correo: el cliente no tiene correo registrado. El WhatsApp sí salió.');
  // Sin el tercer parámetro (o con false) no cambia nada: la alerta de siempre.
  for (const sin of [avisoCorreo(fallido, 'WhatsApp'), avisoCorreo(fallido, 'WhatsApp', false)]) {
    assert.equal(sin.tono, 'alerta');
    assert.ok(sin.texto.includes('mensaje de WhatsApp'), sin.texto);
  }
  // Solo cuenta con el canal WhatsApp; el correo que salió sigue en 'ok'.
  assert.equal(avisoCorreo(fallido, 'Email', true).tono, 'alerta');
  const ok = avisoCorreo({ enviado: true, destino: 'a@b.co', mensaje: 'Correo enviado a a@b.co.' }, 'WhatsApp', true);
  assert.equal(ok.tono, 'ok');
  assert.ok(ok.texto.includes('respaldo'), ok.texto);
  assert.equal(avisoCorreo(null, 'WhatsApp', true), null);
}

console.log('OK test_envio_whatsapp.mjs');
