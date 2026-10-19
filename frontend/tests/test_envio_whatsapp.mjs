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
  assert.deepEqual(lineaWhatsAppCanal({ automatico: true, listo: false }),
    { tono: 'alerta', texto: 'El envío automático no está listo: se abrirá WhatsApp para que lo mandes tú.' });
  // Apagado o sin estado (el GET falló, o el rol no lo lee): sin línea, se abre wa.me como hoy.
  for (const sinLinea of [{ automatico: false, listo: false }, null, undefined]) {
    assert.equal(lineaWhatsAppCanal(sinLinea), null, JSON.stringify(sinLinea));
  }
  // El reenvío de una COT pendiente (U16-reenvio-cot): la nota bajo las opciones.
  assert.equal(NOTA_REENVIO_ENLACE, 'Se crea un enlace nuevo y el anterior deja de servir.');
}

console.log('OK test_envio_whatsapp.mjs');
