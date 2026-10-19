/**
 * frontend/tests/test_seguimiento.mjs
 * B3 T13 (U16-seguimiento punto 7 y la nota del controlador tras T11): lib/seguimiento.js.
 * - canalTexto(canal): 'por WhatsApp' | 'por correo' | 'por correo de respaldo'.
 * - textoSeguimiento(s) -> {tono, titulo, texto} | null, con la forma de seguimiento_confirmacion.resumen():
 *   {estado ACTIVO|APAGADO|AGOTADO|DETENIDO, canal, recordatorios_enviados, max, proximo_at, ultimo_recordatorio_at,
 *   motivo_fin, ultimo_resultado {canal, motivo, mensaje} | null}. Cada estado y cada motivo_fin, incluidos los de T11
 *   (CHATWOOT_SIN_RESPUESTA, ENLACE_ANULADO, COTIZACION_VENCIDA) y ultimo_resultado ERROR_ANTES_DE_ENVIAR.
 * - puedeDetener(s) y validarConfigSeguimiento(cfg), con los mensajes exactos de validar_valor / MENSAJE_HORARIO.
 * fechaHoraCO viene de fechas-colombia.js (T12): '2026-10-05T14:00:00Z' es el lunes 5 de octubre, 9:00 a. m.
 */

import assert from 'node:assert/strict';
import {
  canalTexto, textoSeguimiento, puedeDetener, validarConfigSeguimiento, LIMITES_SEGUIMIENTO, MENSAJE_HORARIO,
} from '../src/lib/seguimiento.js';

const LUNES_9AM = '2026-10-05T14:00:00Z'; // lunes 5 de octubre, 9:00 a. m. en Colombia
const MIERCOLES_3PM = '2026-10-07T20:00:00Z'; // miércoles 7 de octubre, 3:00 p. m.
const s = (extra) => ({ estado: 'ACTIVO', canal: 'WhatsApp', recordatorios_enviados: 0, max: 1, proximo_at: LUNES_9AM,
  ultimo_recordatorio_at: null, motivo_fin: null, ultimo_resultado: null, ...extra });
const detenido = (motivo_fin, mensaje) => s({ estado: 'DETENIDO', proximo_at: null, motivo_fin,
  ultimo_resultado: mensaje ? { canal: 'WhatsApp', motivo: motivo_fin, mensaje } : null });
const TONOS = ['ok', 'info', 'alerta', 'gris'];
const bien = (t) => {
  assert.ok(t && TONOS.includes(t.tono), JSON.stringify(t));
  assert.ok(typeof t.titulo === 'string' && t.titulo.length > 0, JSON.stringify(t));
  assert.ok(typeof t.texto === 'string' && t.texto.length > 0, JSON.stringify(t));
  assert.ok(!/[A-Z]{4,}_[A-Z]/.test(t.texto + t.titulo), `sin códigos crudos: ${t.texto}`);
  return t;
};

console.log('--- TEST 1: canalTexto ---');
{
  assert.equal(canalTexto('WhatsApp'), 'por WhatsApp');
  assert.equal(canalTexto('Email'), 'por correo');
  assert.equal(canalTexto('correo'), 'por correo', 'el canal de ultimo_resultado de un recordatorio que salió');
  assert.equal(canalTexto('Otro'), 'por correo de respaldo');
  assert.equal(canalTexto(null), 'por correo de respaldo');
  assert.equal(canalTexto(undefined), 'por correo de respaldo');
}

console.log('--- TEST 2: ACTIVO sin envíos -> info con la fecha (1 de max) ---');
{
  const t = bien(textoSeguimiento(s()));
  assert.equal(t.tono, 'info');
  assert.equal(t.texto, 'Si el cliente no confirma, le recordaremos por WhatsApp el lunes 5 de octubre, 9:00 a. m. (1 de 1).');
  const correo = bien(textoSeguimiento(s({ canal: 'Email', max: 3, proximo_at: '2026-10-05T14:00:00' })));
  assert.ok(correo.texto.includes('por correo el lunes 5 de octubre, 9:00 a. m. (1 de 3)'), correo.texto);
  assert.ok(bien(textoSeguimiento(s({ canal: 'Otro' }))).texto.includes('por correo de respaldo'));
}

console.log('--- TEST 3: ACTIVO con envíos -> ok, el que salió y el próximo (o el aviso al asesor) ---');
{
  const ultimo = bien(textoSeguimiento(s({ recordatorios_enviados: 1, max: 1, ultimo_recordatorio_at: LUNES_9AM,
    proximo_at: MIERCOLES_3PM })));
  assert.equal(ultimo.tono, 'ok');
  assert.equal(ultimo.texto, 'Recordatorio 1 de 1 enviado el lunes 5 de octubre, 9:00 a. m. Si no responde, el '
    + 'miércoles 7 de octubre, 3:00 p. m. se te avisará para que lo llames.');
  const otro = bien(textoSeguimiento(s({ recordatorios_enviados: 1, max: 3, ultimo_recordatorio_at: LUNES_9AM,
    proximo_at: MIERCOLES_3PM })));
  assert.equal(otro.tono, 'ok');
  assert.equal(otro.texto, 'Recordatorio 1 de 3 enviado el lunes 5 de octubre, 9:00 a. m. El próximo sale el '
    + 'miércoles 7 de octubre, 3:00 p. m.');
  // Sin próximo no inventa una fecha.
  const sinProximo = bien(textoSeguimiento(s({ recordatorios_enviados: 2, max: 3, ultimo_recordatorio_at: LUNES_9AM,
    proximo_at: null })));
  assert.equal(sinProximo.texto, 'Recordatorio 2 de 3 enviado el lunes 5 de octubre, 9:00 a. m.');
}

console.log('--- TEST 4: ACTIVO con ERROR_ANTES_DE_ENVIAR -> alerta con el mensaje tal cual, sigue programado ---');
{
  const mensaje = 'No salió: error del sistema antes de enviarlo.';
  const t = bien(textoSeguimiento(s({ ultimo_resultado: { canal: 'WhatsApp', motivo: 'ERROR_ANTES_DE_ENVIAR',
    mensaje } })));
  assert.equal(t.tono, 'alerta');
  assert.ok(t.texto.startsWith(mensaje), t.texto);
  assert.ok(t.texto.includes('de nuevo'), t.texto);
  assert.ok(!/revisa si le lleg/i.test(t.texto), 'nunca «Revisa si le llegó»');
  assert.equal(t.titulo, 'Recordatorio programado');
  // También con un recordatorio ya enviado antes; sin mensaje, el texto del backend.
  const segundo = bien(textoSeguimiento(s({ recordatorios_enviados: 1, max: 2, ultimo_recordatorio_at: LUNES_9AM,
    ultimo_resultado: { canal: 'WhatsApp', motivo: 'ERROR_ANTES_DE_ENVIAR', mensaje: null } })));
  assert.equal(segundo.tono, 'alerta');
  assert.ok(segundo.texto.startsWith(mensaje), segundo.texto);
  assert.equal(puedeDetener(s({ ultimo_resultado: { motivo: 'ERROR_ANTES_DE_ENVIAR', mensaje } })), true);
}

console.log('--- TEST 5: AGOTADO -> alerta «Llámalo o escríbele» ---');
{
  const t = bien(textoSeguimiento(s({ estado: 'AGOTADO', recordatorios_enviados: 1, proximo_at: null })));
  assert.equal(t.tono, 'alerta');
  assert.equal(t.texto, 'El cliente no respondió el recordatorio. Llámalo o escríbele.');
  const varios = bien(textoSeguimiento(s({ estado: 'AGOTADO', recordatorios_enviados: 3, max: 3, proximo_at: null })));
  assert.equal(varios.texto, 'El cliente no respondió los 3 recordatorios. Llámalo o escríbele.');
}

console.log('--- TEST 6: DETENIDO por cada motivo ---');
{
  const manual = bien(textoSeguimiento(detenido('MANUAL')));
  assert.equal(manual.tono, 'gris');
  assert.equal(manual.texto, 'Detuviste los recordatorios. Si la reenvías, vuelven a empezar.');

  // SIN_MEDIO_CLIENTE, FALLO_ENVIO y PLAZO_PASADO: alerta con el motivo y «Escríbele al cliente o reenvíale el enlace.»
  const sinMedio = bien(textoSeguimiento(detenido('SIN_MEDIO_CLIENTE', 'El cliente no tiene teléfono ni correo.')));
  assert.equal(sinMedio.tono, 'alerta');
  assert.equal(sinMedio.texto, 'El cliente no tiene teléfono ni correo. Escríbele al cliente o reenvíale el enlace.');
  const fallo = bien(textoSeguimiento(detenido('FALLO_ENVIO',
    'No se pudo enviar: el WhatsApp automático no está configurado y el envío de correos no está configurado.')));
  assert.equal(fallo.tono, 'alerta');
  assert.ok(fallo.texto.startsWith('No se pudo enviar: el WhatsApp automático no está configurado'), fallo.texto);
  assert.ok(fallo.texto.endsWith('Escríbele al cliente o reenvíale el enlace.'), fallo.texto);
  const plazo = bien(textoSeguimiento(detenido('PLAZO_PASADO', 'Venció hace más de 3 días sin poder enviarse.')));
  assert.equal(plazo.tono, 'alerta');
  assert.ok(plazo.texto.includes('3 días'), plazo.texto);
  assert.ok(plazo.texto.endsWith('Escríbele al cliente o reenvíale el enlace.'), plazo.texto);
  // Sin ultimo_resultado (datos viejos) cada uno tiene su motivo propio.
  for (const motivo of ['SIN_MEDIO_CLIENTE', 'FALLO_ENVIO', 'PLAZO_PASADO']) {
    const t = bien(textoSeguimiento(detenido(motivo)));
    assert.equal(t.tono, 'alerta', motivo);
    assert.ok(t.texto.endsWith('Escríbele al cliente o reenvíale el enlace.'), t.texto);
    assert.ok(t.texto.length > 'Escríbele al cliente o reenvíale el enlace.'.length + 5, t.texto);
  }

  const enCot = bien(textoSeguimiento(detenido('COTIZACION_ENVIADA')));
  assert.equal(enCot.tono, 'gris');
  assert.equal(enCot.texto, 'Los recordatorios siguen en la cotización.');

  // T11: Chatwoot no confirmó -> alerta (puede que haya salido: nunca «no se envió»).
  const quizas = bien(textoSeguimiento(detenido('CHATWOOT_SIN_RESPUESTA',
    'No se confirmó: Chatwoot no confirmó el WhatsApp y puede que haya salido.')));
  assert.equal(quizas.tono, 'alerta');
  assert.equal(quizas.texto, 'Chatwoot no confirmó el recordatorio: revisa la conversación antes de escribirle.');
  assert.ok(!/no se envi|no sali/i.test(quizas.texto));
  // T11: el enlace se anuló (cambió el cliente) -> gris.
  const anulado = bien(textoSeguimiento(detenido('ENLACE_ANULADO')));
  assert.equal(anulado.tono, 'gris');
  assert.equal(anulado.texto, 'Se anuló el enlace: reenvíala al cliente.');
  // C14/T11: la COT venció -> alerta, con el texto del backend si viene.
  const vencida = bien(textoSeguimiento(detenido('COTIZACION_VENCIDA',
    'La cotización venció el 3 de octubre de 2026 sin respuesta: re-cotízala o reenvíala.')));
  assert.equal(vencida.tono, 'alerta');
  assert.equal(vencida.texto, 'La cotización venció el 3 de octubre de 2026 sin respuesta: re-cotízala o reenvíala.');
  assert.equal(bien(textoSeguimiento(detenido('COTIZACION_VENCIDA'))).tono, 'alerta');

  // Un motivo que el frontend no conoce: gris genérico, sin el código.
  const raro = bien(textoSeguimiento(detenido('VOLVIO_AL_ASESOR')));
  assert.equal(raro.tono, 'gris');
}

console.log('--- TEST 7: APAGADO y los que no muestran nada ---');
{
  const t = bien(textoSeguimiento(s({ estado: 'APAGADO' })));
  assert.equal(t.tono, 'gris');
  assert.equal(t.texto, 'Los recordatorios automáticos están apagados en Configuración.');
  for (const nada of [null, undefined, 'ACTIVO', 42, {}, { estado: 'OTRO' }]) assert.equal(textoSeguimiento(nada), null);
  // Títulos distintos por caso, para que la tarjeta no repita el texto.
  const titulos = new Set([s(), s({ recordatorios_enviados: 1, ultimo_recordatorio_at: LUNES_9AM }),
    s({ estado: 'AGOTADO' }), s({ estado: 'APAGADO' }), detenido('MANUAL')].map((x) => textoSeguimiento(x).titulo));
  assert.equal(titulos.size, 5);
}

console.log('--- TEST 8: puedeDetener ---');
{
  assert.equal(puedeDetener(s()), true);
  for (const estado of ['APAGADO', 'AGOTADO', 'DETENIDO']) assert.equal(puedeDetener(s({ estado })), false);
  assert.equal(puedeDetener(null), false);
  assert.equal(puedeDetener(undefined), false);
}

console.log('--- TEST 9: validarConfigSeguimiento con los límites y mensajes del backend ---');
{
  const DIAS = 'Los días antes del recordatorio deben estar entre 1 y 15.';
  const MAX = 'Los recordatorios deben ser entre 1 y 5.';
  const INICIO = 'La hora inicial debe estar entre 0 y 23.';
  const FIN = 'La hora final debe estar entre 1 y 24.';
  assert.equal(MENSAJE_HORARIO, 'La hora final debe ser mayor que la inicial.');
  assert.deepEqual(LIMITES_SEGUIMIENTO, { seguimiento_dias: [1, 15], seguimiento_max: [1, 5],
    seguimiento_hora_inicio: [0, 23], seguimiento_hora_fin: [1, 24] });
  // Los valores por defecto (los de Configuración) son válidos, como texto o como número.
  const defecto = { seguimiento_auto_activo: 'true', seguimiento_dias: '2', seguimiento_max: '1',
    seguimiento_solo_horario: 'true', seguimiento_hora_inicio: '8', seguimiento_hora_fin: '18' };
  assert.equal(validarConfigSeguimiento(defecto), null);
  assert.equal(validarConfigSeguimiento({ seguimiento_dias: 2, seguimiento_auto_activo: false }), null);
  // 0 y 16 días; 0 y 6 recordatorios.
  assert.equal(validarConfigSeguimiento({ ...defecto, seguimiento_dias: '0' }), DIAS);
  assert.equal(validarConfigSeguimiento({ ...defecto, seguimiento_dias: 16 }), DIAS);
  assert.equal(validarConfigSeguimiento({ ...defecto, seguimiento_dias: '2.5' }), DIAS);
  assert.equal(validarConfigSeguimiento({ ...defecto, seguimiento_dias: '' }), DIAS);
  assert.equal(validarConfigSeguimiento({ ...defecto, seguimiento_dias: ' 15 ' }), null);
  assert.equal(validarConfigSeguimiento({ ...defecto, seguimiento_max: 0 }), MAX);
  assert.equal(validarConfigSeguimiento({ ...defecto, seguimiento_max: '6' }), MAX);
  assert.equal(validarConfigSeguimiento({ ...defecto, seguimiento_max: true }), MAX);
  assert.equal(validarConfigSeguimiento({ ...defecto, seguimiento_hora_inicio: '24' }), INICIO);
  assert.equal(validarConfigSeguimiento({ ...defecto, seguimiento_hora_fin: '0' }), FIN);
  // inicio >= fin.
  assert.equal(validarConfigSeguimiento({ ...defecto, seguimiento_hora_inicio: '18', seguimiento_hora_fin: '18' }),
    MENSAJE_HORARIO);
  assert.equal(validarConfigSeguimiento({ ...defecto, seguimiento_hora_inicio: 20, seguimiento_hora_fin: 8 }),
    MENSAJE_HORARIO);
  assert.equal(validarConfigSeguimiento({ seguimiento_hora_inicio: '0', seguimiento_hora_fin: '24' }), null);
  // Solo una de las horas: el backend la combina con lo guardado; aquí no se puede saber.
  assert.equal(validarConfigSeguimiento({ seguimiento_hora_inicio: '20' }), null);
  // Los interruptores.
  assert.equal(validarConfigSeguimiento({ seguimiento_auto_activo: 'si' }),
    'El recordatorio automático debe estar encendido o apagado (true o false).');
  assert.equal(validarConfigSeguimiento({ seguimiento_solo_horario: 1 }),
    '«Solo en horario laboral» debe estar encendido o apagado (true o false).');
  assert.equal(validarConfigSeguimiento({ seguimiento_solo_horario: ' FALSE ' }), null);
  // El primer error en el orden de Configuración; las demás claves del panel no son de esta función.
  assert.equal(validarConfigSeguimiento({ seguimiento_max: '9', seguimiento_dias: '0' }), DIAS);
  assert.equal(validarConfigSeguimiento({ alerta_sc_dias: 'x', auto_lead_crm: 'true' }), null);
  assert.equal(validarConfigSeguimiento(null), null);
}

console.log('OK test_seguimiento.mjs');
