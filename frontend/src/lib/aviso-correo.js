/**
 * Aviso del correo de respaldo en el modal del enlace de confirmacion (H27+H39). Logica pura, como pricing.js
 * (frontend/tests/test_aviso_correo.mjs).
 *
 * POST .../enviar-confirmacion devuelve `correo: {enviado, destino, motivo, mensaje}`: el correo se intenta siempre
 * que el cliente tenga correo, sea cual sea el canal. Aqui se arma el recuadro: verde si salio, ambar con el motivo y
 * el siguiente paso segun el canal si no salio.
 *
 * B3 T16 (C28): textosVentanaEnlace arma los textos de esa misma ventana segun el tipo de enlace, su vencimiento real
 * (C14) y si el WhatsApp automatico ya salio.
 */

import { fechaLarga, instante } from './fechas-colombia.js';

const MENSAJE_POR_MOTIVO = {
  SIN_CORREO_CLIENTE: () => 'No se envió correo: el cliente no tiene correo registrado.',
  CORREO_NO_CONFIGURADO: () => 'No se envió correo: el envío de correos no está configurado en el sistema.',
  FALLO_ENVIO: (destino) => `No se pudo enviar el correo${destino ? ` a ${destino}` : ''}: falló el servidor de correo.`,
};

const RESPALDO_DE = { WhatsApp: 'WhatsApp', Otro: 'otro canal' };

const SIGUIENTE_PASO = {
  WhatsApp: 'Revisa que el mensaje de WhatsApp haya salido con el enlace.',
  Otro: 'Copia el enlace y envíaselo al cliente.',
};
const SIGUIENTE_PASO_POR_DEFECTO = 'El cliente todavía no recibió el enlace: cópialo y envíaselo por otro medio.';

/** B3 T13 r1: el valor solo si `clave` es PROPIA del mapa (un motivo o un canal 'toString' no encuentra nada). */
const propio = (mapa, clave) => (typeof clave === 'string' && Object.hasOwn(mapa, clave) ? mapa[clave] : undefined);

/**
 * B3 T13 (U16-envio punto 11): con `whatsappEnviado` (el WhatsApp automático del canal WhatsApp salió, avisoWhatsApp
 * de envio-whatsapp.js en 'ok'), un correo de respaldo que no salió ya no es una alerta: 'info' con '… El WhatsApp sí
 * salió.'. Sin el tercer parámetro no cambia nada.
 * @param {{enviado: boolean, destino?: string | null, motivo?: string | null, mensaje?: string} | null | undefined} correo
 * @param {string | null} [canal] 'WhatsApp' | 'Email' | 'Otro' | null (el Hub antes no preguntaba el canal)
 * @param {boolean} [whatsappEnviado]
 * @returns {{tono: 'ok' | 'info' | 'alerta', texto: string} | null}
 */
export function avisoCorreo(correo, canal, whatsappEnviado = false) {
  if (!correo || typeof correo !== 'object') return null;
  if (correo.enviado) {
    const base = (correo.mensaje || `Correo enviado a ${correo.destino || 'el cliente'}.`).trim().replace(/\.$/, '');
    const respaldo = propio(RESPALDO_DE, canal);
    return { tono: 'ok', texto: respaldo ? `${base} (respaldo del envío por ${respaldo}).` : `${base}.` };
  }
  const porMotivo = propio(MENSAJE_POR_MOTIVO, correo.motivo);
  const mensaje = (correo.mensaje || (porMotivo ? porMotivo(correo.destino) : 'No se envió el correo de respaldo.')).trim();
  if (whatsappEnviado === true && canal === 'WhatsApp') return { tono: 'info', texto: `${mensaje} El WhatsApp sí salió.` };
  return { tono: 'alerta', texto: `${mensaje} ${propio(SIGUIENTE_PASO, canal) || SIGUIENTE_PASO_POR_DEFECTO}` };
}

/**
 * B3: el `customerEmail` del ChannelModal para una fila de SC o COT (el Hub, como cotizacion/[id]): su customer_email
 * (null o '' = sin correo: el modal no ofrece Email). Si la fila no trae el campo devuelve undefined, que el modal
 * toma como "no se sabe" (no lo da por vacio).
 * @returns {string | null | undefined}
 */
export function correoDelCliente(fila) {
  if (!fila || typeof fila !== 'object' || !('customer_email' in fila)) return undefined;
  return fila.customer_email ?? null;
}

// ─── B3 T16 (C28): los textos de la ventana del enlace (EnlaceConfirmacionModal de flujo.tsx) ─────────────────────

const INTRO_MANUAL = 'Envíale este enlace al cliente por el canal que prefieras.';
// U16-envio punto 12: el WhatsApp automatico ya le llevo el enlace.
const INTRO_AUTOMATICO = 'El sistema ya le envió este enlace al cliente por WhatsApp. Puedes copiarlo si también '
  + 'quieres mandarlo por otro medio.';
const SIGUIENTE_PASO_ENLACE = 'cuando el cliente lo abra y confirme, esta pantalla te mostrará el siguiente paso.';
const CONSULTA_REENVIO = 'Si lo reenvías, el enlace anterior deja de servir; si cancelas el pedido, deja de abrir.';
// U17-H28 punto 14: el aviso al asesor (antes «Solo el cliente debería confirmar: …»).
const NOTA_SOLO_EL_CLIENTE = 'Solo el cliente debería confirmar o pedir cambios: si abres el enlace y lo haces tú, queda '
  + 'registrado como si fuera el cliente.';

/**
 * '8 de octubre de 2026' del vencimiento del enlace: 'AAAA-MM-DD' es el ULTIMO dia en que sirve ('vence' de la
 * respuesta del envio de la COT y el PVEN); un instante es el vence_at EXCLUSIVO (00:00 en Colombia del dia
 * siguiente, nota del controlador tras T7), asi que se muestra el dia del instante anterior. '' si no se puede leer.
 */
function ultimoDiaDelEnlace(vence) {
  const exclusivo = typeof vence === 'string' && vence.includes(':') ? instante(vence) : null;
  return exclusivo ? fechaLarga(new Date(exclusivo.getTime() - 1)) : fechaLarga(vence);
}

/**
 * Los textos de la ventana del enlace:
 * - tipo 'confirmacion' (por defecto; SC y COT): 'Enlace de confirmación listo', «El cliente confirma {documento} desde
 *   este enlace», la vigencia («Es de un solo uso y sirve hasta el {fecha}…» con `vence`, o «…vence en 2 días…» sin
 *   fecha, la SC) y la nota «Solo el cliente debería confirmar o pedir cambios…» (U17-H28 punto 14).
 * - tipo 'consulta' (el pedido, U23 punto 8): 'Enlace del pedido listo', 'El cliente ve su pedido, lo que ha pagado y lo
 *   que le falta', «Puede abrirlo las veces que quiera hasta el {fecha}. Si lo reenvías…» y sin nota.
 * - intro: «El sistema ya le envió este enlace al cliente por WhatsApp…» si `whatsappEnviado` es true (el automático
 *   salió, U16-envio punto 12); si no, «Envíale este enlace al cliente por el canal que prefieras.».
 * @param {{tipo?: string, documento?: string | null, vence?: string | null, whatsappEnviado?: boolean}} [opciones]
 * @returns {{titulo: string, subtitulo: string, intro: string, vigencia: string, nota: string | null}}
 */
export function textosVentanaEnlace({ tipo, documento, vence, whatsappEnviado } = {}) {
  const fecha = ultimoDiaDelEnlace(vence);
  const intro = whatsappEnviado === true ? INTRO_AUTOMATICO : INTRO_MANUAL;
  if (tipo === 'consulta') {
    const hasta = fecha ? ` hasta el ${fecha}` : '';
    return { titulo: 'Enlace del pedido listo', subtitulo: 'El cliente ve su pedido, lo que ha pagado y lo que le falta',
      intro, vigencia: `Puede abrirlo las veces que quiera${hasta}. ${CONSULTA_REENVIO}`, nota: null };
  }
  const vida = fecha ? `sirve hasta el ${fecha}` : 'vence en 2 días';
  return { titulo: 'Enlace de confirmación listo',
    subtitulo: `El cliente confirma ${documento || 'el documento'} desde este enlace`,
    intro, vigencia: `Es de un solo uso y ${vida}; ${SIGUIENTE_PASO_ENLACE}`, nota: NOTA_SOLO_EL_CLIENTE };
}
