/**
 * Aviso del correo de respaldo en el modal del enlace de confirmacion (H27+H39). Logica pura, como pricing.js
 * (frontend/tests/test_aviso_correo.mjs).
 *
 * POST .../enviar-confirmacion devuelve `correo: {enviado, destino, motivo, mensaje}`: el correo se intenta siempre
 * que el cliente tenga correo, sea cual sea el canal. Aqui se arma el recuadro: verde si salio, ambar con el motivo y
 * el siguiente paso segun el canal si no salio.
 */

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

/**
 * @param {{enviado: boolean, destino?: string | null, motivo?: string | null, mensaje?: string} | null | undefined} correo
 * @param {string | null} [canal] 'WhatsApp' | 'Email' | 'Otro' | null (el Hub antes no preguntaba el canal)
 * @returns {{tono: 'ok' | 'alerta', texto: string} | null}
 */
export function avisoCorreo(correo, canal) {
  if (!correo || typeof correo !== 'object') return null;
  if (correo.enviado) {
    const base = (correo.mensaje || `Correo enviado a ${correo.destino || 'el cliente'}.`).trim().replace(/\.$/, '');
    const respaldo = RESPALDO_DE[canal];
    return { tono: 'ok', texto: respaldo ? `${base} (respaldo del envío por ${respaldo}).` : `${base}.` };
  }
  const porMotivo = MENSAJE_POR_MOTIVO[correo.motivo];
  const mensaje = (correo.mensaje || (porMotivo ? porMotivo(correo.destino) : 'No se envió el correo de respaldo.')).trim();
  return { tono: 'alerta', texto: `${mensaje} ${SIGUIENTE_PASO[canal] || SIGUIENTE_PASO_POR_DEFECTO}` };
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
