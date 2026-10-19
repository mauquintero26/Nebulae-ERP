/**
 * frontend/tests/test_confirmacion_publica.mjs
 * B3 T12 (U17+H28 punto 7, H28-cambios, U22-cambios; C5, C9, R10, RP26, RP27): lib/confirmacion-publica.js.
 * - pedirPublico: POST sin Authorization, sin cookies y sin Referer; devuelve {ok, status, cuerpo, mensaje} y lee
 *   'detail' y también 'message' (el 400 de validación de backend/main.py no trae 'detail').
 * - vistaDeRespuesta: las formas reales de backend/app/api/v1/confirmacion_publica.py: el 200 de /confirmar/ver
 *   (data.documento), el detail del 400 (_detalle: detail.documento), el 200 de confirmar (_respuesta_confirmada), el
 *   de pedir cambios (_respuesta_cambios) y el de /pedido-cliente/ver ({status, empresa, data: documento, cot_numero}).
 * - Casos (a) a (f) de U17+H28; (e) con fechaHoraCO (R10).
 * - puedeEnviarCambios: CAMBIOS de 10 a 1000 caracteres; NO_LA_NECESITA admite vacío. La misma limpieza del backend
 *   (_limpiar_comentario): sin Cc (salvo \n y \t), Cs ni Cf, \r\n -> \n, sin bordes, contando code points; más de
 *   4000 sin limpiar es demasiado largo.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pedirPublico, vistaDeRespuesta, TEXTOS_ENLACE, claveIdempotencia, puedeEnviarCambios, limpiarComentario,
  MIN_COMENTARIO_CAMBIOS, MAX_COMENTARIO_CAMBIOS,
} from '../src/lib/confirmacion-publica.js';
import { fechaHoraCO } from '../src/lib/fechas-colombia.js';
import { DOCUMENTO_EJEMPLO_SC, DOCUMENTO_EJEMPLO_COT } from '../src/lib/documento-comercial.js';
import { MARCA_VACIA } from '../src/lib/marca-empresa.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const TOKEN = 'Abc123_-def456GHI789jkl012mno345pqr678stu90';
const EMPRESA = { nombre_comercial: 'DEMO Ferretería', razon_social: '', nit: '', direccion: '', ciudad: '',
  telefono: '', whatsapp: '3001234567', correo: '', sitio_web: '',
  colores: { principal: '#7C3AED', secundario: '#E11D48', acento: '#C2410C' }, logo_url: null, configurada: true };
const detalle400 = (extra) => ({ mensaje: null, estado_enlace: null, empresa: EMPRESA, documento: null,
  confirmada_el: null, siguiente_paso: null, comentario: null, ...extra });
const respuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, cuerpo, mensaje: null });

console.log('--- TEST 1: (a) un 200 pendiente -> puedeActuar (RP27: data.documento) ---');
{
  const v = vistaDeRespuesta(respuesta(200, { status: 'success', estado_enlace: 'pendiente',
    vence_at: '2026-10-05T14:00:00Z', empresa: EMPRESA,
    data: { numero: 'SC-DEMO-0001', customer_name: 'Cliente DEMO', estado: 'PENDIENTE_CONFIRMACION',
      fecha_entrega_estimada: '2026-10-21', productos: [], documento: DOCUMENTO_EJEMPLO_SC } }));
  assert.equal(v.estado_enlace, 'pendiente');
  assert.equal(v.puedeActuar, true);
  assert.equal(v.documento, DOCUMENTO_EJEMPLO_SC, 'el documento de data.documento');
  assert.equal(v.vence_at, '2026-10-05T14:00:00Z');
  assert.equal(v.empresa.nombre_comercial, 'DEMO Ferretería');
  assert.equal(v.recienConfirmada, false);
}

console.log("--- TEST 2: (b) un 400 'confirmada' -> título y sin acciones (RP26, RP27: detail.documento) ---");
{
  const v = vistaDeRespuesta({ ok: false, status: 400, mensaje: 'Esta solicitud ya fue confirmada.',
    cuerpo: { detail: detalle400({ estado_enlace: 'confirmada', mensaje: 'Esta solicitud ya fue confirmada.',
      documento: DOCUMENTO_EJEMPLO_SC, confirmada_el: '2026-10-03T20:15:00Z',
      siguiente_paso: ['Asesor DEMO prepara tu cotización con los precios.'] }) } });
  assert.equal(v.estado_enlace, 'confirmada');
  assert.equal(v.titulo, 'Esta solicitud ya fue confirmada');
  assert.equal(v.puedeActuar, false);
  assert.equal(v.documento, DOCUMENTO_EJEMPLO_SC, 'el documento de detail.documento');
  assert.ok(v.confirmadaElTexto.includes('sábado 3 de octubre'), v.confirmadaElTexto);
  assert.ok(v.confirmadaElTexto.includes('3:15'), v.confirmadaElTexto);
  assert.deepEqual(v.siguiente_paso, ['Asesor DEMO prepara tu cotización con los precios.']);

  const cot = vistaDeRespuesta({ ok: false, status: 400, mensaje: null, cuerpo: { detail: detalle400({
    estado_enlace: 'confirmada', mensaje: 'Esta cotización ya fue confirmada.', documento: { numero: 'COT-20261003-1' },
    confirmada_el: '2026-10-03T20:15:00Z' }) } });
  assert.equal(cot.titulo, 'Esta cotización ya fue confirmada', 'la COT confirmada solo trae su número');
}

console.log('--- TEST 3: (c) un detail de texto -> invalido con ese texto ---');
{
  const v = vistaDeRespuesta({ ok: false, status: 400, mensaje: 'El enlace no es válido o ya expiró.',
    cuerpo: { detail: 'El enlace no es válido o ya expiró.' } });
  assert.equal(v.estado_enlace, 'invalido');
  assert.equal(v.mensaje, 'El enlace no es válido o ya expiró.');
  assert.equal(v.puedeActuar, false);
  assert.deepEqual(v.empresa, MARCA_VACIA, 'sin empresa: la marca vacía (nunca Nebulae)');
}

console.log("--- TEST 4: (d) 'vencido' dice que venció; los demás estados del enlace ---");
{
  const v = vistaDeRespuesta({ ok: false, status: 400, mensaje: null, cuerpo: { detail: detalle400({
    estado_enlace: 'vencido', mensaje: 'Este enlace venció el 8 de octubre de 2026. Escríbenos y te enviamos uno nuevo.',
    documento: { numero: 'SC-DEMO-0001' } }) } });
  assert.equal(v.estado_enlace, 'vencido');
  assert.ok(v.mensaje.includes('venció'));
  assert.ok(v.titulo.includes('venció'));
  assert.equal(v.puedeActuar, false);

  for (const estado of ['reemplazado', 'no_disponible', 'actualizada', 'invalido']) {
    const w = vistaDeRespuesta({ ok: false, status: 400, mensaje: null,
      cuerpo: { detail: detalle400({ estado_enlace: estado, mensaje: `Mensaje ${estado}.` }) } });
    assert.equal(w.estado_enlace, estado);
    assert.equal(w.mensaje, `Mensaje ${estado}.`);
    assert.equal(w.puedeActuar, false);
    assert.ok(w.titulo && w.icono && w.tono, `${estado}: título, ícono y tono`);
  }
  const cambios = vistaDeRespuesta({ ok: false, status: 400, mensaje: null, cuerpo: { detail: detalle400({
    estado_enlace: 'cambios_enviados', mensaje: 'Ya nos enviaste tus cambios el 3 de octubre de 2026.',
    comentario: 'Son 8 rodillos, no 6' }) } });
  assert.equal(cambios.estado_enlace, 'cambios_enviados');
  assert.equal(cambios.comentario, 'Son 8 rodillos, no 6');
}

console.log('--- TEST 4b (r1): los textos LITERALES de MENSAJES_ENLACE (SC y COT): el título es corto, nunca el mensaje ---');
{
  // backend/app/core/documento_cliente.py, MENSAJES_ENLACE, tal cual. estado_enlace los llena con documento =
  // TITULOS[tipo].lower() ('solicitud' o 'cotización'); solo 'vencido' y 'confirmada' mandan detail.documento.
  const MENSAJES_ENLACE = {
    invalido: 'Este enlace no es válido. Ábrelo completo desde el mensaje que te enviamos o pide uno nuevo.',
    no_disponible: 'Este enlace ya no está disponible. Si tienes dudas, escríbenos.',
    confirmada: 'Esta {documento} ya fue confirmada.',
    vencido: 'Este enlace venció el {fecha}. Escríbenos y te enviamos uno nuevo.',
    reemplazado: 'Te enviamos un enlace más reciente para esta {documento}. Ábrelo desde el último mensaje que recibiste.',
    cambios_enviados: 'Ya nos enviaste tus cambios el {fecha}. {asesor} ajustará la {documento} y te enviará un enlace '
      + 'nuevo.',
    actualizada: 'Tu asesor actualizó esta {documento} después de tu confirmación. Te enviaremos un enlace nuevo para '
      + 'que la revises.',
  };
  const llenar = (t, documento) => t.replace('{documento}', documento).replace('{fecha}', '8 de octubre de 2026')
    .replace('{asesor}', 'Asesor DEMO');
  const vista = (estado, mensaje, documento) => vistaDeRespuesta({ ok: false, status: 400, mensaje,
    cuerpo: { detail: detalle400({ estado_enlace: estado, mensaje, documento }) } });
  // [estado, ¿manda detail.documento?, título de la SC, título de la COT]
  const casos = [
    ['invalido', false, 'Este enlace no es válido', 'Este enlace no es válido'],
    ['vencido', true, 'Este enlace venció', 'Este enlace venció'],
    ['reemplazado', false, 'Te enviamos un enlace más reciente', 'Te enviamos un enlace más reciente'],
    ['no_disponible', false, 'Este enlace ya no está disponible', 'Este enlace ya no está disponible'],
    ['actualizada', false, 'Tu asesor actualizó esta solicitud', 'Tu asesor actualizó esta cotización'],
  ];
  for (const [tipo, nombre, numero] of [['SC', 'solicitud', 'SC-20261003-1'], ['COT', 'cotización', 'COT-20261003-1']]) {
    for (const [estado, conDocumento, tituloSc, tituloCot] of casos) {
      const mensaje = llenar(MENSAJES_ENLACE[estado], nombre);
      const v = vista(estado, mensaje, conDocumento ? { numero } : null);
      assert.equal(v.titulo, tipo === 'SC' ? tituloSc : tituloCot, `${tipo} ${estado}`);
      assert.equal(v.mensaje, mensaje, `${tipo} ${estado}: el cuerpo es la frase completa del servidor`);
      assert.notEqual(v.titulo, v.mensaje, `${tipo} ${estado}`);
      assert.notEqual(`${v.titulo}.`, v.mensaje, `${tipo} ${estado}: el título nunca es el mensaje entero`);
    }
    // 'confirmada' (con su número) y 'cambios_enviados' (sin documento), también con los textos reales.
    assert.equal(vista('confirmada', llenar(MENSAJES_ENLACE.confirmada, nombre), { numero }).titulo,
      `Esta ${nombre} ya fue confirmada`);
    assert.equal(vista('confirmada', llenar(MENSAJES_ENLACE.confirmada, nombre), null).titulo,
      `Esta ${nombre} ya fue confirmada`, 'sin documento: el tipo sale del mensaje');
    const cambios = vista('cambios_enviados', llenar(MENSAJES_ENLACE.cambios_enviados, nombre), null);
    assert.equal(cambios.titulo, 'Ya recibimos tus cambios');
    assert.equal(cambios.mensaje, llenar(MENSAJES_ENLACE.cambios_enviados, nombre));
  }
  // Ni el documento ni el mensaje dicen el tipo: un título fijo, sin {documento} ni el mensaje.
  const sinTipo = vista('actualizada', 'Un texto que no nombra el documento.', null);
  assert.equal(sinTipo.titulo, 'Tu asesor actualizó el documento');
  assert.equal(vista('confirmada', null, null).titulo, 'Ya fue confirmada');
  // Sin mensaje del servidor: la frase completa de MENSAJES_ENLACE (una sola convención).
  assert.equal(vista('no_disponible', null, null).mensaje, MENSAJES_ENLACE.no_disponible);
  assert.equal(vista('invalido', null, null).mensaje, MENSAJES_ENLACE.invalido);
  assert.equal(vista('reemplazado', null, { numero: 'COT-1' }).mensaje, llenar(MENSAJES_ENLACE.reemplazado, 'cotización'));
  assert.equal(vista('actualizada', null, { numero: 'SC-1' }).mensaje, llenar(MENSAJES_ENLACE.actualizada, 'solicitud'));
  for (const [estado, t] of Object.entries(TEXTOS_ENLACE)) {
    assert.ok(!(t.mensaje ?? '').includes('{fecha}') && !(t.mensaje ?? '').includes('{asesor}'), estado);
  }
}

console.log('--- TEST 5: (e) fechaHoraCO (R10) ---');
{
  const t = fechaHoraCO('2026-10-03T20:15:00Z');
  assert.ok(t.includes('sábado 3 de octubre'), t);
  assert.ok(t.includes('3:15'), t);
}

console.log('--- TEST 6: (f) claveIdempotencia nunca lleva el token ---');
{
  const a = claveIdempotencia('confirmar');
  const b = claveIdempotencia('confirmar');
  assert.match(a, /^confirmar-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b, 'una clave nueva por intento');
  assert.ok(!a.includes(TOKEN.slice(0, 16)) && !a.includes(TOKEN));
  assert.equal(claveIdempotencia.length, 1, 'solo recibe el prefijo: nunca el token');
  assert.match(claveIdempotencia('cambios'), /^cambios-/);
}

console.log('--- TEST 7: el 200 de confirmar y el de pedir cambios (RP26) ---');
{
  const v = vistaDeRespuesta(respuesta(200, { status: 'success', message: 'Solicitud confirmada. Gracias.',
    estado_enlace: 'confirmada', mensaje: '¡Gracias! Tu confirmación fue registrada.',
    confirmada_el: '2026-10-03T20:15:00Z', siguiente_paso: ['a', 'b', 'c'], empresa: EMPRESA,
    data: { numero: 'SC-DEMO-0001', documento: DOCUMENTO_EJEMPLO_SC } }));
  assert.equal(v.estado_enlace, 'confirmada');
  assert.equal(v.recienConfirmada, true);
  assert.equal(v.titulo, '¡Gracias! Tu confirmación fue registrada.');
  assert.equal(v.puedeActuar, false);
  assert.equal(v.documento, DOCUMENTO_EJEMPLO_SC);
  assert.ok(v.confirmadaElTexto.includes('sábado 3 de octubre') && v.confirmadaElTexto.includes('3:15'));
  // r1 de T5: si armar el documento falla, el 200 llega sin data: la vista no se cae.
  const minimo = vistaDeRespuesta(respuesta(200, { status: 'success', estado_enlace: 'confirmada',
    mensaje: '¡Gracias! Tu confirmación fue registrada.', confirmada_el: '2026-10-03T20:15:00Z', empresa: null }));
  assert.equal(minimo.documento, null);
  assert.deepEqual(minimo.empresa, MARCA_VACIA);

  const c = vistaDeRespuesta(respuesta(200, { status: 'success', estado_enlace: 'cambios_enviados',
    mensaje: '¡Listo! Recibimos tus cambios.', detalle: 'Asesor DEMO ajustará tu solicitud y te enviará un enlace nuevo.',
    comentario: 'Son 8 rodillos, no 6', empresa: EMPRESA, data: { numero: 'SC-DEMO-0001', documento: DOCUMENTO_EJEMPLO_SC } }));
  assert.equal(c.estado_enlace, 'cambios_enviados');
  assert.equal(c.titulo, '¡Listo! Recibimos tus cambios.');
  assert.equal(c.mensaje, 'Asesor DEMO ajustará tu solicitud y te enviará un enlace nuevo.');
  assert.equal(c.comentario, 'Son 8 rodillos, no 6');
  assert.equal(c.puedeActuar, false);
}

console.log('--- TEST 8: el 200 de /pedido-cliente/ver (RP27) y los errores que no son del enlace ---');
{
  const pven = { ...DOCUMENTO_EJEMPLO_COT, tipo: 'PVEN', titulo: 'Pedido de venta', numero: 'PVEN-DEMO-0001' };
  const v = vistaDeRespuesta(respuesta(200, { status: 'success', empresa: EMPRESA, data: pven, cot_numero: 'COT-DEMO-0001' }));
  assert.equal(v.estado_enlace, 'consulta');
  assert.equal(v.documento, pven, 'data ES el documento');
  assert.equal(v.cot_numero, 'COT-DEMO-0001');
  assert.equal(v.puedeActuar, false, 'el pedido es de solo lectura');

  const generico = vistaDeRespuesta({ ok: false, status: 400, mensaje: null, cuerpo: { detail: detalle400({
    estado_enlace: 'invalido', mensaje: 'El enlace no es válido o ya expiró.' }) } });
  assert.equal(generico.estado_enlace, 'invalido');
  assert.equal(generico.empresa.nombre_comercial, 'DEMO Ferretería', 'con la empresa para el contacto (C26)');

  const red = vistaDeRespuesta({ ok: false, status: 0, cuerpo: null, mensaje: null });
  assert.equal(red.estado_enlace, 'sin_conexion');
  assert.equal(red.reintentar, true);
  assert.ok(red.mensaje.includes('Revisa tu conexión'));

  const validacion = vistaDeRespuesta({ ok: false, status: 422,
    mensaje: 'Cuéntanos qué quieres cambiar (al menos 10 caracteres).',
    cuerpo: { detail: 'Cuéntanos qué quieres cambiar (al menos 10 caracteres).' } });
  assert.equal(validacion.estado_enlace, 'validacion', 'el 422 se muestra en la misma pantalla');
  assert.equal(validacion.puedeActuar, true, 'el enlace sigue sirviendo');
  assert.equal(validacion.mensaje, 'Cuéntanos qué quieres cambiar (al menos 10 caracteres).');

  const servidor = vistaDeRespuesta({ ok: false, status: 500, mensaje: 'Ocurrió un error inesperado. Intenta de nuevo.',
    cuerpo: { status: 'error', message: 'Internal Server Error' } });
  assert.equal(servidor.estado_enlace, 'error');
  assert.equal(servidor.reintentar, true);
  assert.equal(servidor.mensaje, 'Ocurrió un error inesperado. Intenta de nuevo.');

  // r1: solo un 400 es un estado del enlace. Un 404/405 de Starlette (ruta inexistente o API_URL mal puesta) es un
  // error del servidor o de configuración: 'error' con el texto ya traducido de pedirPublico y reintentar.
  for (const [status, detail] of [[404, 'Not Found'], [405, 'Method Not Allowed'], [404, detalle400({
    estado_enlace: 'vencido', mensaje: 'Este enlace venció el 8 de octubre de 2026.' })]]) {
    const r = await pedirPublico('http://x/api/v1', '/confirmar/ver', { token: TOKEN }, {},
      async () => ({ ok: false, status, json: async () => ({ detail }) }));
    const w = vistaDeRespuesta(r);
    assert.equal(w.estado_enlace, 'error', `${status}`);
    assert.equal(w.mensaje, r.mensaje, `${status}: el texto de pedirPublico (errorDeRespuesta de avisos.js)`);
    assert.ok(w.mensaje, `${status}: con mensaje`);
    assert.notEqual(w.titulo, 'Este enlace no es válido', `${status}: no le dice al cliente que su enlace no sirve`);
    if (detail === 'Not Found') assert.equal(w.mensaje, 'No se encontró el registro (404).', 'el texto ya traducido');
    assert.equal(w.reintentar, true);
    assert.equal(w.puedeActuar, false);
  }

  for (const [estado, t] of Object.entries(TEXTOS_ENLACE)) {
    assert.ok(t.titulo && t.icono && t.tono, `TEXTOS_ENLACE.${estado}`);
  }
  assert.ok(Object.isFrozen(TEXTOS_ENLACE));
}

console.log("--- TEST 9: pedirPublico: sin Authorization, lee 'detail' y 'message' ---");
{
  const llamadas = [];
  const fetchCon = (status, cuerpo) => async (url, init) => {
    llamadas.push({ url, init });
    return { ok: status >= 200 && status < 300, status,
      json: async () => { if (cuerpo === undefined) throw new SyntaxError('sin JSON'); return cuerpo; } };
  };
  const ok = await pedirPublico('http://localhost:8030/api/v1/', '/confirmar/ver', { token: TOKEN },
    { 'Idempotency-Key': 'confirmar-x', Authorization: 'Bearer no', authorization: 'no' }, fetchCon(200, { status: 'success' }));
  assert.deepEqual(ok, { ok: true, status: 200, cuerpo: { status: 'success' }, mensaje: null });
  const { url, init } = llamadas[0];
  assert.equal(url, 'http://localhost:8030/api/v1/confirmar/ver');
  assert.equal(init.method, 'POST');
  assert.deepEqual(JSON.parse(init.body), { token: TOKEN }, 'el token va en el cuerpo, nunca en la URL');
  const nombres = Object.keys(init.headers).map((k) => k.toLowerCase());
  assert.ok(!nombres.includes('authorization'), 'sin Authorization, aunque se lo pasen');
  assert.ok(nombres.includes('idempotency-key'));
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.equal(init.redirect, 'error', 'r1: no sigue redirecciones (un 307 repetiría el POST con el token)');
  assert.ok(!url.includes(TOKEN));
  // Una redirección rechazada es un TypeError de fetch: el camino de 'sin_conexion', sin lanzar.
  const redirigida = await pedirPublico('http://x/api/v1', '/confirmar/ver', { token: TOKEN }, {},
    async (_u, i) => { if (i.redirect === 'error') throw new TypeError('Failed to fetch'); return { ok: true, status: 200, json: async () => ({}) }; });
  assert.equal(redirigida.status, 0);
  assert.equal(vistaDeRespuesta(redirigida).estado_enlace, 'sin_conexion');

  const mensajeValidacion = 'Los datos enviados no son válidos. Revisa el formulario e intenta de nuevo.';
  const sinDetail = await pedirPublico('http://x/api/v1', '/confirmar/confirmar', { token: TOKEN }, {},
    fetchCon(400, { status: 'error', message: mensajeValidacion }));
  assert.equal(sinDetail.ok, false);
  assert.equal(sinDetail.status, 400);
  assert.equal(sinDetail.mensaje, mensajeValidacion, "lee 'message' cuando no hay 'detail'");

  const conDetalle = await pedirPublico('http://x/api/v1', 'confirmar/ver', { token: TOKEN }, {},
    fetchCon(400, { detail: detalle400({ estado_enlace: 'vencido', mensaje: 'Este enlace venció el 8 de octubre de 2026.' }) }));
  assert.equal(llamadas[llamadas.length - 1].url, 'http://x/api/v1/confirmar/ver', 'la ruta sin barra también sirve');
  assert.equal(conDetalle.mensaje, 'Este enlace venció el 8 de octubre de 2026.', "lee 'detail' (dict con mensaje)");
  const texto = await pedirPublico('http://x', '/confirmar/pedir-cambios', {}, {}, fetchCon(422, { detail: 'Texto 422.' }));
  assert.equal(texto.mensaje, 'Texto 422.');
  const noJson = await pedirPublico('http://x', '/confirmar/ver', {}, {}, fetchCon(502, undefined));
  assert.equal(noJson.cuerpo, null);
  assert.equal(noJson.status, 502);
  assert.ok(noJson.mensaje);

  const caida = await pedirPublico('http://x', '/confirmar/ver', {}, {}, async () => { throw new TypeError('Failed to fetch'); });
  assert.deepEqual({ ok: caida.ok, status: caida.status, cuerpo: caida.cuerpo }, { ok: false, status: 0, cuerpo: null });
  assert.equal(vistaDeRespuesta(caida).estado_enlace, 'sin_conexion');
}

console.log('--- TEST 10: puedeEnviarCambios (10 a 1000, C9) con la limpieza del backend ---');
{
  assert.equal(MIN_COMENTARIO_CAMBIOS, 10);
  assert.equal(MAX_COMENTARIO_CAMBIOS, 1000);
  assert.equal(puedeEnviarCambios('corto', 'CAMBIOS'), false);
  assert.equal(puedeEnviarCambios('x'.repeat(10), 'CAMBIOS'), true, 'con 10 caracteres');
  assert.equal(puedeEnviarCambios('x'.repeat(1000), 'CAMBIOS'), true);
  assert.equal(puedeEnviarCambios('x'.repeat(1001), 'CAMBIOS'), false, 'con 1001');
  assert.equal(puedeEnviarCambios('', 'NO_LA_NECESITA'), true, 'ya no la necesita: vacío permitido');
  assert.equal(puedeEnviarCambios(null, 'NO_LA_NECESITA'), true);
  assert.equal(puedeEnviarCambios('x'.repeat(1001), 'NO_LA_NECESITA'), false);
  assert.equal(puedeEnviarCambios('x'.repeat(20), 'OTRO'), false, 'tipo desconocido');
  assert.equal(puedeEnviarCambios('x'.repeat(20)), true, 'CAMBIOS por defecto, como el backend');
  // La misma limpieza que _limpiar_comentario (paridad de T13).
  assert.equal(puedeEnviarCambios('\u200b'.repeat(10) + 'abc', 'CAMBIOS'), false, 'el texto invisible no cuenta');
  assert.equal(puedeEnviarCambios('   ' + 'x'.repeat(9) + '\n\t ', 'CAMBIOS'), false, 'sin los bordes');
  assert.equal(puedeEnviarCambios('abcde\r\nfghi', 'CAMBIOS'), true, '\\r\\n cuenta como un solo salto');
  assert.equal(puedeEnviarCambios('😀'.repeat(10), 'CAMBIOS'), true, 'code points, no unidades UTF-16');
  assert.equal(puedeEnviarCambios('😀'.repeat(1000), 'CAMBIOS'), true);
  assert.equal(puedeEnviarCambios('😀'.repeat(1001), 'CAMBIOS'), false);
  assert.equal(puedeEnviarCambios('x'.repeat(1000) + '\u200b'.repeat(3000), 'CAMBIOS'), true, '4000 sin limpiar aún se limpia');
  assert.equal(puedeEnviarCambios('x'.repeat(1000) + '\u200b'.repeat(3001), 'CAMBIOS'), false, 'más de 4000: demasiado largo');
  assert.equal(puedeEnviarCambios('x'.repeat(9) + '\uD800', 'CAMBIOS'), false, 'un surrogate suelto no cuenta');
  assert.equal(limpiarComentario('  a\r\nb\u202e\u0000\t '), 'a\nb');
  assert.equal(limpiarComentario('\u00a0hola\u3000'), 'hola');
  assert.equal(limpiarComentario(null), '');
}

console.log('--- TEST 11: sin apiFetch ni URL de producción escrita a mano ---');
{
  const fuente = readFileSync(join(SRC, 'lib', 'confirmacion-publica.js'), 'utf8');
  assert.doesNotMatch(fuente, /from '\.\/api|apiFetch\s*\(|nebulaekids|['"]Authorization['"]/,
    'sin apiFetch, sin la URL fija y sin el encabezado de sesión');
  assert.doesNotMatch(fuente, /\.slice\(\s*0\s*,\s*16\s*\)/, 'la clave ya no repite el inicio del token');
  // r1: una sola copia de las reglas de texto de Python (stripPy de marca-empresa.js, largoTexto de chatter.js).
  assert.match(fuente, /import\s*\{[^}]*\bstripPy\b[^}]*\}\s*from\s*'\.\/marca-empresa\.js'/);
  assert.match(fuente, /import\s*\{[^}]*\blargoTexto\b[^}]*\}\s*from\s*'\.\/chatter\.js'/);
  assert.doesNotMatch(fuente, /x1c-\\x1f|\[\.\.\.\w+\]\.length/, 'sin otra lista de espacios ni otro conteo de code points');
}

console.log('✓ Todas las pruebas de la confirmación pública pasaron.');
