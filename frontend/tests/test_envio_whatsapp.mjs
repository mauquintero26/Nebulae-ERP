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
  TEXTOS_CONSULTA_FALLIDA, ESPERA_VERIFICACION_MS, TEXTO_REVISANDO_ENTREGA, abreWhatsAppLocal, recuadroWhatsApp,
  enlaceBotonWhatsApp, estadoConfigWhatsApp, resultadoPruebaWhatsApp, variablesDeEjemplo, lineaEnvioAutomatico,
  formularioEnvioWhatsApp, cuerpoEnvioWhatsApp, hayCambiosWhatsApp, MENSAJE_WHATSAPP_SIN_GUARDAR,
  estadoEnvioParaCanal, lineaWhatsAppCanal, NOTA_REENVIO_ENLACE,
  botonEnvioPedido, envioIncierto, pedidoSeEnvio, AVISO_PEDIDO_SI_SE_ENVIO, AVISO_WHATSAPP_NO_SE_ABRIO, avisoEnvioIncierto,
  TEXTO_ENVIAR_AL_CLIENTE, TEXTO_REENVIAR_AL_CLIENTE, banderaReenvio, envioYaNoAplica,
} from '../src/lib/envio-whatsapp.js';
import { avisoCorreo } from '../src/lib/aviso-correo.js';
import { readFileSync } from 'node:fs';

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
  // Ronda r1: un motivo que es una clave heredada de Object cae en el mismo texto genérico (nunca lanza).
  for (const heredado of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    assert.deepEqual(avisoWhatsApp({ enviado: false, motivo: heredado }, 'WhatsApp'), raro, heredado);
  }
  // Ronda r1: los valores se ponen tal cual, aunque traigan los patrones de String.replace ('$&', "$'", '$`', '$$').
  const patrones = "a $' b $& c $` d $$ e";
  const conPatrones = avisoWhatsApp({ enviado: false, motivo: 'FALLO_CHATWOOT', detalle: patrones }, 'WhatsApp');
  assert.ok(conPatrones.texto.startsWith(`No se envió: Chatwoot rechazó el mensaje (${patrones}).`), conPatrones.texto);
  const plantilla = avisoWhatsApp({ enviado: true, modo: 'PLANTILLA', destino_legible: '+57 $& 1', plantilla: "doc_$'" },
    'WhatsApp');
  assert.equal(plantilla.texto, "Enviado automáticamente al +57 $& 1 con la plantilla aprobada «doc_$'» (el cliente no "
    + 'había escrito en las últimas 24 horas).');
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
  // Ronda r1: «Volver a revisar» sobre uno ya ENTREGADO o LEIDO y la consulta falla (TEXTO_NO_SE_PUDO_CONSULTAR o
  // TEXTO_NO_ENCONTRADO de envio_whatsapp): se ve el estado que ya se sabía Y el aviso de que la consulta falló.
  assert.deepEqual(TEXTOS_CONSULTA_FALLIDA, ['No se pudo consultar Chatwoot ahora; vuelve a intentar.',
    'No se encontró el mensaje en Chatwoot: no se pudo verificar si le llegó al cliente.']);
  assert.ok(Object.isFrozen(TEXTOS_CONSULTA_FALLIDA));
  assert.equal(textoEntrega('ENTREGADO', 'No se pudo consultar Chatwoot ahora; vuelve a intentar.'),
    'Le llegó al cliente. No se pudo consultar Chatwoot ahora; vuelve a intentar.');
  assert.equal(textoEntrega('LEIDO', TEXTOS_CONSULTA_FALLIDA[1]),
    'El cliente ya lo leyó. No se encontró el mensaje en Chatwoot: no se pudo verificar si le llegó al cliente.');
  assert.equal(textoEntrega('LEIDO', 'El cliente leyó el WhatsApp.'), 'El cliente ya lo leyó.');
  // Ronda r1: un estado que es una clave heredada no es un estado conocido.
  assert.equal(textoEntrega('toString'), '');
  assert.equal(textoEntrega('constructor', 'Texto.'), 'Texto.');
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
  // Ronda r1: el motivo y el canal se buscan solo entre las claves propias de sus mapas.
  assert.equal(avisoCorreo({ enviado: true, destino: 'a@b.co' }, 'toString').texto, 'Correo enviado a a@b.co.');
  const heredado = avisoCorreo({ enviado: false, motivo: 'toString' }, 'constructor');
  assert.equal(heredado.texto, 'No se envió el correo de respaldo. El cliente todavía no recibió el enlace: cópialo y '
    + 'envíaselo por otro medio.');
}

// ─── B3 T16: la ventana del enlace (U16-envio puntos 12, 14 y 15, U16-entrega punto 4) y ConfigEnvioWhatsApp (16) ───

console.log('--- TEST 12 (T16): abreWhatsAppLocal, solo sin resultado o con el automático apagado (punto 14) ---');
{
  assert.equal(abreWhatsAppLocal('WhatsApp', null), true, 'backend sin el automático: como hoy');
  assert.equal(abreWhatsAppLocal('WhatsApp', undefined), true);
  assert.equal(abreWhatsAppLocal('WhatsApp', wa({ motivo: 'ENVIO_AUTOMATICO_APAGADO' })), true);
  // Salió, o no salió por otro motivo: no se abre (el botón de la ventana lo ofrece). Nunca dos mensajes.
  assert.equal(abreWhatsAppLocal('WhatsApp', enviadoTexto), false);
  for (const motivo of ['CHATWOOT_NO_CONFIGURADO', 'BANDEJA_NO_CONFIGURADA', 'TELEFONO_INVALIDO',
    'FUERA_DE_VENTANA_SIN_PLANTILLA', 'FALLO_CHATWOOT', 'CHATWOOT_SIN_RESPUESTA']) {
    assert.equal(abreWhatsAppLocal('WhatsApp', wa({ motivo })), false, motivo);
  }
  // Con otro canal nunca.
  assert.equal(abreWhatsAppLocal('Email', null), false);
  assert.equal(abreWhatsAppLocal('Otro', wa({ motivo: 'ENVIO_AUTOMATICO_APAGADO' })), false);
  assert.equal(abreWhatsAppLocal(null, null), false);
}

console.log('--- TEST 13 (T16): recuadroWhatsApp sin verificación = avisoWhatsApp + salio/revisable ---');
{
  assert.equal(recuadroWhatsApp(null, 'WhatsApp', null), null);
  assert.equal(recuadroWhatsApp(enviadoTexto, 'Email', null), null);
  const r = recuadroWhatsApp(enviadoTexto, 'WhatsApp', null);
  assert.deepEqual(r, { ...avisoWhatsApp(enviadoTexto, 'WhatsApp'), entrega: null, salio: true, revisable: true });
  const apagado = recuadroWhatsApp(wa({ motivo: 'ENVIO_AUTOMATICO_APAGADO' }), 'WhatsApp', undefined);
  assert.equal(apagado.tono, 'info');
  assert.equal(apagado.salio, false);
  assert.equal(apagado.revisable, false, 'lo que no salió no se verifica');
  assert.equal(apagado.botonManual, true);
  // Un envío que salió sin envio_id (el commit del resultado falló) no se puede verificar.
  assert.equal(recuadroWhatsApp({ ...enviadoTexto, envio_id: null }, 'WhatsApp', null).revisable, false);
  assert.equal(ESPERA_VERIFICACION_MS, 6000, 'una sola verificación automática a los 6 s');
  assert.equal(TEXTO_REVISANDO_ENTREGA, 'Revisando si le llegó al cliente…');
}

console.log('--- TEST 14 (T16): recuadroWhatsApp con la respuesta de verificar ---');
{
  const verif = (estado, texto, extra) => ({ envio_id: 41, estado, texto, boton_manual: estado === 'FALLIDO',
    verificado: true, ...extra });
  const entregado = recuadroWhatsApp(enviadoTexto, 'WhatsApp', verif('ENTREGADO', 'El WhatsApp le llegó al cliente.'));
  assert.equal(entregado.tono, 'ok');
  assert.equal(entregado.texto, enviadoTexto.texto_resultado, 'el número sigue a la vista');
  assert.equal(entregado.entrega, 'Le llegó al cliente.');
  assert.equal(entregado.botonManual, false);
  assert.equal(entregado.salio, true);
  assert.equal(entregado.revisable, true, 'ENTREGADO todavía puede pasar a LEIDO');
  const leido = recuadroWhatsApp(enviadoTexto, 'WhatsApp', verif('LEIDO', 'El cliente leyó el WhatsApp.'));
  assert.equal(leido.tono, 'ok');
  assert.equal(leido.entrega, 'El cliente ya lo leyó.');
  assert.equal(leido.revisable, false, 'LEIDO es final: sin «Volver a revisar»');
  // FALLIDO: ámbar, con el motivo traducido del servidor, el botón y nunca «sí salió».
  const fallido = recuadroWhatsApp(enviadoTexto, 'WhatsApp',
    verif('FALLIDO', 'El WhatsApp no le llegó al cliente: ese número no tiene WhatsApp o no puede recibir mensajes.'));
  assert.equal(fallido.tono, 'alerta');
  assert.equal(fallido.botonManual, true);
  assert.equal(fallido.salio, false);
  assert.equal(fallido.revisable, false, 'FALLIDO es final');
  assert.equal(fallido.entrega, 'El WhatsApp no le llegó al cliente: ese número no tiene WhatsApp o no puede recibir '
    + `mensajes. Envíaselo tú con el botón ${BOTON}.`);
  // La consulta a Chatwoot falló: el estado no cambió; el tono y el botón siguen como estaban.
  const sinConsulta = recuadroWhatsApp(enviadoTexto, 'WhatsApp',
    verif('ENVIADO', 'No se pudo consultar Chatwoot ahora; vuelve a intentar.', { verificado: false }));
  assert.equal(sinConsulta.tono, 'ok');
  assert.equal(sinConsulta.entrega, 'No se pudo consultar Chatwoot ahora; vuelve a intentar.');
  assert.equal(sinConsulta.botonManual, false);
  assert.equal(sinConsulta.revisable, true);
  // La respuesta de OTRO envío (otra ventana abierta antes) no se mezcla.
  assert.deepEqual(recuadroWhatsApp(enviadoTexto, 'WhatsApp', verif('FALLIDO', 'x', { envio_id: 99 })),
    recuadroWhatsApp(enviadoTexto, 'WhatsApp', null));
  // Una verificación que no es un objeto se ignora.
  assert.deepEqual(recuadroWhatsApp(enviadoTexto, 'WhatsApp', 'x'), recuadroWhatsApp(enviadoTexto, 'WhatsApp', null));
}

console.log('--- TEST 15 (T16, RP23): enlaceBotonWhatsApp, el ÚNICO botón «Abrir WhatsApp con el mensaje» ---');
{
  const TEL = '+573001234567';
  const URL_LOCAL = 'https://wa.me/573001234567?text=hola';
  // Sin resultado del automático (B13): el mismo wa.me que se intentó abrir.
  assert.equal(enlaceBotonWhatsApp({ canal: 'WhatsApp', envio: null, botonManual: false, telefono: TEL,
    whatsappUrl: URL_LOCAL }), URL_LOCAL);
  assert.equal(enlaceBotonWhatsApp({ canal: 'WhatsApp', envio: null, whatsappUrl: null }), null);
  // No salió: wa.me con el texto del servidor (texto_manual, con el enlace).
  const noSalio = wa({ motivo: 'FUERA_DE_VENTANA_SIN_PLANTILLA' });
  assert.equal(enlaceBotonWhatsApp({ canal: 'WhatsApp', envio: noSalio, botonManual: true, telefono: TEL,
    whatsappUrl: null }), `https://wa.me/573001234567?text=${encodeURIComponent(noSalio.texto_manual)}`);
  // Salió (y no falló la entrega): sin botón, aunque llegue un whatsappUrl.
  assert.equal(enlaceBotonWhatsApp({ canal: 'WhatsApp', envio: enviadoTexto, botonManual: false, telefono: TEL,
    whatsappUrl: URL_LOCAL }), null);
  // FALLIDO después de verificar: el botón vuelve con el texto del servidor.
  assert.equal(enlaceBotonWhatsApp({ canal: 'WhatsApp', envio: enviadoTexto, botonManual: true, telefono: TEL }),
    `https://wa.me/573001234567?text=${encodeURIComponent(enviadoTexto.texto_manual)}`);
  // Sin texto_manual o sin teléfono: el wa.me que se intentó abrir, si lo hay; si no, nada.
  assert.equal(enlaceBotonWhatsApp({ canal: 'WhatsApp', envio: wa({ motivo: 'ENVIO_AUTOMATICO_APAGADO',
    texto_manual: null }), botonManual: true, telefono: TEL, whatsappUrl: URL_LOCAL }), URL_LOCAL);
  assert.equal(enlaceBotonWhatsApp({ canal: 'WhatsApp', envio: noSalio, botonManual: true, telefono: '',
    whatsappUrl: null }), null);
  // Solo con canal WhatsApp y solo enlaces wa.me (whatsappParaReabrir).
  assert.equal(enlaceBotonWhatsApp({ canal: 'Email', envio: noSalio, botonManual: true, telefono: TEL }), null);
  assert.equal(enlaceBotonWhatsApp({ canal: 'WhatsApp', envio: null, whatsappUrl: 'javascript:alert(1)' }), null);
}

console.log('--- TEST 16 (T16, hueco 4): estadoConfigWhatsApp dice qué falta ---');
{
  const completo = { automatico: true, inbox_id: 7, plantilla: 'documento_cliente', plantilla_recordatorio: 'recordatorio',
    idioma: 'es', servidor_configurado: true, listo: true };
  const e = estadoConfigWhatsApp(completo);
  assert.deepEqual(e.servidor, { ok: true, texto: 'Conexión con Chatwoot configurada en el servidor.' });
  assert.deepEqual(e.faltan, []);
  const vacio = estadoConfigWhatsApp({ automatico: false, inbox_id: null, plantilla: null, plantilla_recordatorio: null,
    idioma: 'es', servidor_configurado: false });
  assert.deepEqual(vacio.servidor,
    { ok: false, texto: 'Falta configurar la conexión con Chatwoot en el servidor (EasyPanel).' });
  assert.equal(vacio.faltan.length, 3);
  assert.ok(vacio.faltan[0].startsWith('El número de la bandeja de WhatsApp de Chatwoot'), vacio.faltan[0]);
  assert.ok(vacio.faltan[1].startsWith('La plantilla del documento aprobada por Meta'), vacio.faltan[1]);
  assert.ok(vacio.faltan[1].includes('24 horas'), vacio.faltan[1]);
  assert.ok(vacio.faltan[2].startsWith('La plantilla del recordatorio aprobada por Meta'), vacio.faltan[2]);
  assert.ok(vacio.faltan[2].includes('correo'), vacio.faltan[2]);
  // Cada una por su lado (dice CUÁL falta).
  assert.deepEqual(estadoConfigWhatsApp({ ...completo, plantilla_recordatorio: null }).faltan, [vacio.faltan[2]]);
  assert.deepEqual(estadoConfigWhatsApp({ ...completo, plantilla: '' }).faltan, [vacio.faltan[1]]);
  assert.deepEqual(estadoConfigWhatsApp({ ...completo, inbox_id: 0 }).faltan, [vacio.faltan[0]]);
  assert.equal(estadoConfigWhatsApp(null), null);
}

console.log('--- TEST 17 (T16): resultadoPruebaWhatsApp («Probar conexión») ---');
{
  const base = { ok: true, version: '3.12.0', bandeja: 'WhatsApp Ventas', es_whatsapp: true, plantilla: 'APROBADA',
    plantilla_detalle: null, plantilla_recordatorio: 'APROBADA', plantilla_recordatorio_detalle: null,
    mensaje: 'Conexión correcta con la bandeja «WhatsApp Ventas» de WhatsApp.', probado_por: 'Admin' };
  assert.deepEqual(resultadoPruebaWhatsApp(base), { tono: 'ok', lineas: [base.mensaje,
    'Versión de Chatwoot: 3.12.0.', 'Plantilla del documento: aprobada por Meta.',
    'Plantilla del recordatorio: aprobada por Meta.'] });
  // Una plantilla sin aprobar: alerta con el detalle del servidor; una sin configurar lo dice.
  const r = resultadoPruebaWhatsApp({ ...base, plantilla_recordatorio: 'NO_ENCONTRADA',
    plantilla_recordatorio_detalle: 'No hay una plantilla «recordatorio» en esta bandeja.', plantilla: null });
  assert.equal(r.tono, 'alerta');
  assert.ok(r.lineas.includes('Plantilla del documento: sin configurar.'), r.lineas.join(' | '));
  assert.ok(r.lineas.includes('Plantilla del recordatorio: No hay una plantilla «recordatorio» en esta bandeja.'));
  // Sin conexión o sin bandeja: solo el mensaje (y la versión si la hay), en ámbar.
  assert.deepEqual(resultadoPruebaWhatsApp({ ok: false, version: null, bandeja: null, es_whatsapp: false,
    plantilla: null, plantilla_recordatorio: null,
    mensaje: 'Falta configurar la conexión con Chatwoot en el servidor (EasyPanel).' }),
  { tono: 'alerta', lineas: ['Falta configurar la conexión con Chatwoot en el servidor (EasyPanel).'] });
  assert.equal(resultadoPruebaWhatsApp({ ok: false }).lineas[0], 'No se pudo probar la conexión.');
  assert.equal(resultadoPruebaWhatsApp(null), null);
}

console.log('--- TEST 18 (T16): variablesDeEjemplo y la línea de solo lectura ---');
{
  assert.deepEqual(variablesDeEjemplo({ 2: 'Pinturas', 1: 'María Pérez', 10: 'x', 3: 'Cotización COT-1' }), [
    { variable: '{{1}}', valor: 'María Pérez' }, { variable: '{{2}}', valor: 'Pinturas' },
    { variable: '{{3}}', valor: 'Cotización COT-1' }, { variable: '{{10}}', valor: 'x' }]);
  assert.deepEqual(variablesDeEjemplo(null), []);
  assert.deepEqual(variablesDeEjemplo({ a: 'x' }), [], 'solo variables numeradas');
  // r1 (menor 13): {texto, encendido}, para pintarla verde solo si está encendido.
  assert.deepEqual(lineaEnvioAutomatico({ automatico: true, listo: false }),
    { texto: 'Envío automático por WhatsApp: encendido', encendido: true });
  assert.deepEqual(lineaEnvioAutomatico({ automatico: false }),
    { texto: 'Envío automático por WhatsApp: apagado', encendido: false });
  assert.equal(lineaEnvioAutomatico({ automatico: 'true' }).encendido, false, 'solo con true');
  assert.equal(lineaEnvioAutomatico(null), null);
  // r1 (menor 8): lo que dice «Guardar Configuración» si la sección de WhatsApp tiene cambios sin guardar.
  assert.equal(MENSAJE_WHATSAPP_SIN_GUARDAR, 'Tienes cambios sin guardar en «Envío automático por WhatsApp»: guárdalos '
    + 'con el botón «Guardar» de esa sección antes de guardar la configuración.');
}

console.log('--- TEST 19 (T16): el formulario de ConfigEnvioWhatsApp y el cuerpo del PUT ---');
{
  const guardado = { automatico: true, inbox_id: 7, plantilla: 'documento_cliente', plantilla_recordatorio: null,
    idioma: 'es_CO', servidor_configurado: true };
  const form = formularioEnvioWhatsApp(guardado);
  assert.deepEqual(form, { automatico: true, inbox_id: '7', plantilla: 'documento_cliente', plantilla_recordatorio: '',
    idioma: 'es_CO' });
  assert.deepEqual(formularioEnvioWhatsApp(null), { automatico: false, inbox_id: '', plantilla: '',
    plantilla_recordatorio: '', idioma: 'es' });
  assert.equal(formularioEnvioWhatsApp({ automatico: 'true', idioma: '' }).automatico, false, 'solo con true');
  assert.equal(formularioEnvioWhatsApp({ idioma: '' }).idioma, 'es');
  // El PUT lleva los 5 campos; un campo vacío va como null (el backend borra la clave) y todo sin espacios.
  assert.deepEqual(cuerpoEnvioWhatsApp({ ...form, inbox_id: ' 12 ', plantilla: '  doc  ', idioma: ' es ' }),
    { automatico: true, inbox_id: '12', plantilla: 'doc', plantilla_recordatorio: null, idioma: 'es' });
  assert.deepEqual(cuerpoEnvioWhatsApp({}), { automatico: false, inbox_id: null, plantilla: null,
    plantilla_recordatorio: null, idioma: null });
  // Hay cambios solo si el cuerpo cambia (espacios de más no cuentan).
  assert.equal(hayCambiosWhatsApp(form, guardado), false);
  assert.equal(hayCambiosWhatsApp({ ...form, plantilla: ' documento_cliente ' }, guardado), false);
  assert.equal(hayCambiosWhatsApp({ ...form, automatico: false }, guardado), true);
  assert.equal(hayCambiosWhatsApp({ ...form, plantilla_recordatorio: 'recordatorio' }, guardado), true);
  assert.equal(hayCambiosWhatsApp(form, null), true, 'sin lo guardado no se puede comparar');
}

console.log('--- B3 T17: la ventana del canal (ChannelModal) con envioWhatsApp {automatico, listo} y la nota del reenvío ---');
{
  // El `data` de GET /ventas/envio-cliente/whatsapp/estado -> {automatico, listo}; solo `true` cuenta.
  const estado = { automatico: true, listo: true, plantilla_configurada: false, plantilla_recordatorio_configurada: false,
    motivo_texto: null };
  assert.deepEqual(estadoEnvioParaCanal(estado), { automatico: true, listo: true });
  assert.deepEqual(estadoEnvioParaCanal({ automatico: 'true', listo: 1 }), { automatico: false, listo: false });
  for (const raro of [null, undefined, 'x', 3]) assert.equal(estadoEnvioParaCanal(raro), null, String(raro));
  // La línea bajo la opción WhatsApp (U16-envio punto 13).
  assert.deepEqual(lineaWhatsAppCanal({ automatico: true, listo: true }),
    { tono: 'ok', texto: 'Sale automáticamente desde el WhatsApp de la empresa.' });
  // r1 (ruling del texto): encendido sin estar listo no abre wa.me solo (abreWhatsAppLocal): la ventana del enlace trae
  // el botón «Abrir WhatsApp con el mensaje».
  assert.deepEqual(lineaWhatsAppCanal({ automatico: true, listo: false }),
    { tono: 'alerta', texto: 'El envío automático no está listo: te daremos el botón para mandarlo tú.' });
  assert.equal(abreWhatsAppLocal('WhatsApp', { enviado: false, motivo: 'CHATWOOT_NO_CONFIGURADO' }), false,
    'no se abre solo: por eso la línea habla del botón');
  // Apagado o sin estado (el GET falló, o el rol no lo lee): sin línea, se abre wa.me como hoy.
  for (const sinLinea of [{ automatico: false, listo: false }, null, undefined]) {
    assert.equal(lineaWhatsAppCanal(sinLinea), null, JSON.stringify(sinLinea));
  }
  // El reenvío de una COT pendiente (U16-reenvio-cot): la nota bajo las opciones.
  assert.equal(NOTA_REENVIO_ENLACE, 'Se crea un enlace nuevo y el anterior deja de servir.');
}

console.log('--- B3 T19: botonEnvioPedido (el botón de la cabecera del pedido; r1: aquí y no en documento-comercial.js) ---');
{
  const ahora = new Date('2026-10-10T12:00:00Z');
  const vigente = { vigente: true, enviado_at: '2026-10-03T15:00:00Z', vence_at: '2026-11-03T05:00:00Z', vence: '2026-11-02' };
  const vencido = { vigente: false, enviado_at: '2026-09-01T15:00:00Z', vence_at: null, vence: null };
  const nunca = { vigente: false, enviado_at: null, vence_at: null, vence: null };
  // «Enviar al cliente» si nunca se envió; «Reenviar al cliente» si ya se envió una vez (r1: también con el enlace
  // vencido, como la COT y la Actividad del servidor). reenvio (la nota «el anterior deja de servir») solo con el enlace
  // vigente: el vencido ya no sirve. null si el servidor lo rechazaría: CANCELADO (409), un rol que no es ADMIN ni ASESOR
  // (403) o un pedido sin productos o sin total (400).
  const pedido = { estado: 'PENDIENTE_COMPRA', productos: [{ product_name: 'Rodillo', qty: 6 }], total_cop: 1954666,
    enlace_cliente: nunca };
  const enviar = { texto: 'Enviar al cliente', reenvio: false };
  const reenviarVencido = { texto: 'Reenviar al cliente', reenvio: false };
  for (const rol of ['Asesor', 'Admin', 'admin ', 'Vendedor', 'ASESOR']) assert.deepEqual(botonEnvioPedido(pedido, rol, ahora), enviar, rol);
  assert.deepEqual(botonEnvioPedido({ ...pedido, enlace_cliente: vigente }, 'Asesor', ahora),
    { texto: 'Reenviar al cliente', reenvio: true });
  assert.deepEqual(botonEnvioPedido({ ...pedido, enlace_cliente: vigente }, 'Asesor', new Date('2026-11-03T05:00:00Z')),
    reenviarVencido, 'venció con la página abierta');
  assert.deepEqual(botonEnvioPedido({ ...pedido, enlace_cliente: vencido }, 'Asesor', ahora), reenviarVencido, 'vencido');
  assert.deepEqual(botonEnvioPedido({ ...pedido, enlace_cliente: undefined }, 'Asesor', ahora), enviar, 'sin el dato del enlace');
  for (const estado of ['EN_PROCESO', 'ENTREGADO', 'FACTURADO', 'DEVUELTO_TOTAL']) {
    assert.deepEqual(botonEnvioPedido({ ...pedido, estado }, 'Asesor', ahora), enviar, estado);
  }
  assert.equal(botonEnvioPedido({ ...pedido, estado: 'CANCELADO', enlace_cliente: vigente }, 'Admin', ahora), null);
  for (const rol of ['Contador', 'Compras', '', null, undefined]) assert.equal(botonEnvioPedido(pedido, rol, ahora), null, String(rol));
  assert.equal(botonEnvioPedido({ ...pedido, productos: [] }, 'Asesor', ahora), null, 'sin productos');
  assert.equal(botonEnvioPedido({ ...pedido, productos: null }, 'Asesor', ahora), null, 'sin la lista');
  assert.equal(botonEnvioPedido({ ...pedido, total_cop: 0 }, 'Asesor', ahora), null, 'sin total');
  assert.deepEqual(botonEnvioPedido({ ...pedido, total_cop: '0.4' }, 'Asesor', ahora), enviar, 'el servidor acepta total > 0');
  for (const raro of [null, undefined, 'x', 7]) assert.equal(botonEnvioPedido(raro, 'Admin', ahora), null, String(raro));
}

console.log('--- B3 T19 r1 (menor 3): un envío del pedido con resultado incierto no invita a reenviar ---');
{
  const conStatus = (status) => Object.assign(new Error('x'), { status });
  // Incierto: un 5xx (p. ej. el proxy después del commit único) o un error sin status (red caída, respuesta perdida).
  for (const err of [conStatus(500), conStatus(502), conStatus(504), new TypeError('Failed to fetch'), new Error('x'), null,
    undefined, 'texto']) {
    assert.equal(envioIncierto(err), true, String(err?.status ?? err));
  }
  // Un 4xx de validación (400, 403, 404, 409, 422) dice que no se envió.
  for (const status of [400, 403, 404, 409, 422]) assert.equal(envioIncierto(conStatus(status)), false, String(status));
  // La recarga dice si sí se envió: enlace_cliente.enviado_at cambió frente al de antes del POST.
  const fresco = (enviado_at) => ({ estado: 'PENDIENTE_COMPRA', enlace_cliente: { vigente: true, enviado_at } });
  assert.equal(pedidoSeEnvio(null, fresco('2026-10-19T15:00:00Z')), true, 'primer envío');
  assert.equal(pedidoSeEnvio('2026-10-03T15:00:00Z', fresco('2026-10-19T15:00:00Z')), true, 'reenvío');
  assert.equal(pedidoSeEnvio('2026-10-03T15:00:00Z', fresco('2026-10-03T15:00:00Z')), false, 'no cambió');
  assert.equal(pedidoSeEnvio(null, fresco(null)), false, 'nunca se envió');
  assert.equal(pedidoSeEnvio(undefined, { estado: 'PENDIENTE_COMPRA' }), false, 'sin el dato');
  for (const raro of [null, undefined, 'x']) assert.equal(pedidoSeEnvio('2026-10-03T15:00:00Z', raro), false, 'la recarga falló');
  assert.equal(AVISO_PEDIDO_SI_SE_ENVIO, 'El pedido sí se envió; revisa la Actividad antes de reenviar');

  // r2 (menor 2): avisoEnvioIncierto(canal, envioWhatsApp) elige el aviso cuando la recarga muestra que sí se envió. Con
  // WhatsApp y el automático NO listo, el wa.me manual nunca se abrió (el POST no respondió): el cliente no lo recibió.
  assert.equal(AVISO_WHATSAPP_NO_SE_ABRIO, 'El pedido quedó registrado, pero el WhatsApp no se abrió: usa «Reenviar al cliente».');
  for (const estado of [null, undefined, { automatico: false, listo: false }, { automatico: true, listo: false }]) {
    assert.equal(avisoEnvioIncierto('WhatsApp', estado), AVISO_WHATSAPP_NO_SE_ABRIO, JSON.stringify(estado));
  }
  assert.equal(avisoEnvioIncierto('WhatsApp', { automatico: true, listo: true }), AVISO_PEDIDO_SI_SE_ENVIO, 'el automático salió solo');
  for (const canal of ['Email', 'Otro', null]) {
    assert.equal(avisoEnvioIncierto(canal, null), AVISO_PEDIDO_SI_SE_ENVIO, String(canal));
  }

  // r2 (menor 1): en la rama incierta la pantalla espera la recarga ANTES de soltar `enviando`, y el error solo se pone
  // si la comparación dice que no se envió (nunca antes: no invita a reenviar).
  const hook = readFileSync(new URL('../src/app/dashboard/ventas/venta/[id]/detalle-bloque3.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  const captura = hook.slice(hook.indexOf('} catch (err) {', hook.indexOf('async function enviarAlCliente(')),
    hook.indexOf('setEnviando(false);', hook.indexOf('async function enviarAlCliente(')));
  const incierta = captura.slice(captura.indexOf('if (envioIncierto(err))'), captura.indexOf('recargarTrasError(err)'));
  assert.ok(incierta.includes('const fresco = await recargar({ silencioso: true });'), 'espera la recarga');
  assert.ok(incierta.indexOf('pedidoSeEnvio(enviadoAntes, fresco)') < incierta.indexOf('setError('), 'compara antes del error');
  assert.ok(incierta.includes('avisoEnvioIncierto(canal, estadoWhatsApp)'), 'el aviso según el canal y el automático');
  assert.ok(!captura.slice(0, captura.indexOf('if (envioIncierto(err))')).includes('setError('), 'sin error antes de comparar');
}

console.log('--- B3 T19 r1 (menor 10): el error del ChannelModal en una región viva siempre montada y la X bloqueada ---');
{
  const fuente = readFileSync(new URL('../src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  const inicio = fuente.indexOf('export function ChannelModal(');
  assert.ok(inicio > 0, 'ChannelModal encontrado');
  const modal = fuente.slice(inicio, fuente.indexOf('\n}\n', inicio));
  assert.ok(/<Modal [^>]*bloquearCierre=\{saving\}/.test(modal), 'la X no se ve activa mientras envía');
  // r2 (menor 3): vacía no suma el espacio del space-y-4 del Modal (empty:-mt-4).
  assert.ok(/<div role="alert" className="empty:-mt-4">\{error \? <p className="[^"]*">\{error\}<\/p> : null\}<\/div>/.test(modal),
    'la región role="alert" siempre montada; solo cambia su contenido');
  assert.ok(!modal.includes('{error && <p role="alert"'), 'sin montar la región solo cuando hay error');
}

console.log('--- Revisión final B3 (F2, M0 y M9/M22): la bandera del envío y un solo rótulo para enviar y reenviar ---');
{
  // M9/M22: la misma acción con el mismo rótulo en todas las pantallas (la COT, la SC en Pendiente y el pedido).
  assert.equal(TEXTO_ENVIAR_AL_CLIENTE, 'Enviar al cliente');
  assert.equal(TEXTO_REENVIAR_AL_CLIENTE, 'Reenviar al cliente');
  // M0: la bandera del POST …/enviar-confirmacion siempre va: true solo desde «Reenviar al cliente»; el primer envío
  // manda false (el servidor responde 409 «Ya se le envió al cliente; usa «Reenviar».» si el documento ya espera).
  assert.deepEqual(banderaReenvio(true), { reenvio: true });
  for (const v of [false, undefined, null, 'true', 1]) assert.deepEqual(banderaReenvio(v), { reenvio: false }, String(v));
  // Tras el 409, la recarga dice si la ventana ya no aplica (se cierra): se abrió para reenviar y el documento ya no
  // espera al cliente, o para el primer envío y ya le espera. Sin la recarga (null) no se sabe: queda abierta.
  assert.equal(envioYaNoAplica(true, 'BORRADOR'), true);
  assert.equal(envioYaNoAplica(true, 'ASIGNADA'), true);
  assert.equal(envioYaNoAplica(false, 'PENDIENTE_CONFIRMACION'), true);
  assert.equal(envioYaNoAplica(true, 'PENDIENTE_CONFIRMACION'), false);
  assert.equal(envioYaNoAplica(false, 'BORRADOR'), false);
  assert.equal(envioYaNoAplica(false, 'ASIGNADA'), false);
  for (const raro of [null, undefined, 5]) {
    assert.equal(envioYaNoAplica(true, raro), false, String(raro));
    assert.equal(envioYaNoAplica(false, raro), false, String(raro));
  }
  // El pedido usa las mismas constantes.
  const pedido = { estado: 'PENDIENTE_COMPRA', productos: [{ product_name: 'Rodillo', qty: 1 }], total_cop: 10,
    enlace_cliente: { vigente: false, enviado_at: '2026-09-01T15:00:00Z' } };
  assert.equal(botonEnvioPedido(pedido, 'Asesor').texto, TEXTO_REENVIAR_AL_CLIENTE);
  assert.equal(botonEnvioPedido({ ...pedido, enlace_cliente: null }, 'Asesor').texto, TEXTO_ENVIAR_AL_CLIENTE);

  const leer = (ruta) => readFileSync(new URL(`../src/app/dashboard/ventas/${ruta}`, import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  // Sin los comentarios ({/* */}, /* */ y //), para mirar solo el código y el JSX.
  const codigo = (fuente) => fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const cot = leer('cotizacion/[id]/page.tsx');
  const sc = leer('solicitud/[id]/page.tsx');
  const hub = leer('page.tsx');
  // M0: los tres envíos (el detalle de la COT, el de la SC y el Hub) mandan la bandera de la lib, nunca armada a mano.
  assert.ok(cot.includes('...banderaReenvio(reenviando)'), 'COT: la bandera del botón que abrió la ventana');
  assert.ok(sc.includes('...banderaReenvio(reenviandoSc)'), 'SC: la bandera del estado con que se abrió la ventana');
  assert.ok(hub.includes('...banderaReenvio(false)'), 'Hub: siempre un primer envío (no deja arrastrar una pendiente)');
  for (const [ruta, fuente] of [['COT', cot], ['SC', sc], ['Hub', hub]]) {
    assert.doesNotMatch(codigo(fuente), /reenvio:\s*(true|false)/, `${ruta}: sin la bandera escrita a mano`);
  }
  // Tras el 409 la COT y la SC recargan en silencio y cierran la ventana si ya no aplica.
  assert.ok(cot.includes('if (envioYaNoAplica(reenviando, fresca?.estado)) cancelarEnvio();'), 'COT: cierra la ventana');
  assert.ok(sc.includes('if (envioYaNoAplica(reenviandoSc, fresca?.estado)) cancelarEnvioConfirmacion();'),
    'SC: cierra la ventana');
  // M9/M22: la tarjeta B2 de la COT, la de los cambios del cliente, el detalle B3 (Pendiente) y los dos reenvíos de la
  // SC en Pendiente usan las constantes. El primer envío de la SC conserva el texto que aprobó el Bloque 2.
  assert.ok(cot.includes("{estadoActual === 'ENVIADA' ? TEXTO_REENVIAR_AL_CLIENTE : TEXTO_ENVIAR_AL_CLIENTE}"), 'COT B2');
  assert.ok(cot.includes('onClick={handleEnviarCotizacion}>{TEXTO_ENVIAR_AL_CLIENTE}</Button>'), 'COT con cambios');
  assert.ok(leer('cotizacion/[id]/detalle-bloque3.tsx').includes('onClick={onReenviar}>{TEXTO_REENVIAR_AL_CLIENTE}</Button>'),
    'COT en Pendiente');
  assert.ok(sc.includes("{estado === 'PENDIENTE_CONFIRMACION' ? TEXTO_REENVIAR_AL_CLIENTE : 'Enviar para Confirmación'}"),
    'SC con su cotización temprana');
  assert.ok(sc.includes('onClick={handleEnviarParaConfirmacion}>{TEXTO_REENVIAR_AL_CLIENTE}</Button>'), 'SC en Pendiente');
  assert.ok(sc.includes('onClick={handleEnviarParaConfirmacion}>Enviar para Confirmación</Button>'), 'SC: primer envío (B2)');
  assert.ok(leer('solicitud/[id]/detalle-bloque3.tsx').includes('{TEXTO_REENVIAR_AL_CLIENTE}'), 'SC con cambios');
  // Ninguna pantalla de ventas escribe el rótulo a mano ni conserva las grafías viejas.
  for (const ruta of ['cotizacion/[id]/page.tsx', 'cotizacion/[id]/detalle-bloque3.tsx', 'solicitud/[id]/page.tsx',
    'solicitud/[id]/detalle-bloque3.tsx', 'venta/[id]/detalle-bloque3.tsx', 'page.tsx']) {
    const fuente = codigo(leer(ruta));
    assert.doesNotMatch(fuente, /Re-enviar|Reenviar enlace de confirmación|Enviar al Cliente/, `${ruta}: sin la grafía vieja`);
    assert.doesNotMatch(fuente, /['>]\s*(Enviar|Reenviar) al cliente\s*['<]/, `${ruta}: el rótulo sale de la lib`);
  }
}

console.log('OK test_envio_whatsapp.mjs');
