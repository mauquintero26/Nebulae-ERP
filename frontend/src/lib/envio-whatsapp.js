/**
 * WhatsApp automático al cliente en la ventana del enlace (Bloque 3, T13: U16-envio punto 10 y U16-entrega punto 3).
 * Lógica pura, como aviso-correo.js (frontend/tests/test_envio_whatsapp.mjs).
 *
 * El envío (POST .../enviar-confirmacion y .../enviar-al-cliente, B3 T8) devuelve en `whatsapp` la respuesta de
 * envio_whatsapp.enviar_documento: {enviado, estado, modo, destino (e164), destino_legible, motivo, texto_resultado,
 * mensaje (sin el enlace), detalle, envio_id, texto_manual (con el enlace, para el botón)}, o null con otro canal. El
 * renglón de la Actividad guarda solo {enviado, estado, modo, destino, motivo, envio_id}: sin texto_resultado, el texto
 * se arma con los espejos de abajo (MOTIVOS y TEXTOS_ENVIADO de core/envio_whatsapp.py; su paridad la corre
 * backend/tests/test_paridad_bloque3.py).
 *
 * R5: no hay «WhatsApp desde mi teléfono». Si el automático no salió, el asesor usa el botón «Abrir WhatsApp con el
 * mensaje»; con el automático apagado se abrió wa.me como hoy. CHATWOOT_SIN_RESPUESTA («puede que haya salido») nunca
 * dice que no salió.
 */

/** Espejo de envio_whatsapp.MOTIVOS: por qué no salió el WhatsApp automático ({detalle} solo en FALLO_CHATWOOT). */
export const TEXTOS_MOTIVO_WHATSAPP = Object.freeze({
  ENVIO_AUTOMATICO_APAGADO: 'Envío manual: se abrió WhatsApp en el computador del asesor (el envío automático '
    + 'está apagado).',
  CHATWOOT_NO_CONFIGURADO: 'No se envió: la conexión con Chatwoot no está configurada en el servidor.',
  BANDEJA_NO_CONFIGURADA: 'No se envió: falta el número de la bandeja de WhatsApp de Chatwoot en Configuración.',
  TELEFONO_INVALIDO: 'No se envió: el teléfono del cliente no es un número de WhatsApp válido.',
  FUERA_DE_VENTANA_SIN_PLANTILLA: 'No se envió: el cliente no ha escrito en las últimas 24 horas y no hay una '
    + 'plantilla aprobada por Meta en Configuración.',
  FALLO_CHATWOOT: 'No se envió: Chatwoot rechazó el mensaje ({detalle}).',
  CHATWOOT_SIN_RESPUESTA: 'Chatwoot no confirmó el envío: puede que el mensaje haya salido. Revisa la conversación '
    + 'en Chatwoot antes de reenviarlo.',
});

/** Espejo de envio_whatsapp.TEXTOS_ENVIADO, por modo. */
export const TEXTOS_WHATSAPP_ENVIADO = Object.freeze({
  TEXTO: 'Enviado automáticamente al {destino} desde el WhatsApp de la empresa.',
  PLANTILLA: 'Enviado automáticamente al {destino} con la plantilla aprobada «{plantilla}» (el cliente no había '
    + 'escrito en las últimas 24 horas).',
});

/** envio_whatsapp.ESTADOS_FINALES: LEIDO y FALLIDO ya no se vuelven a consultar («Volver a revisar» no aplica). */
export const ESTADOS_FINALES_ENTREGA = Object.freeze(['LEIDO', 'FALLIDO']);

/**
 * Lo que responde verificar_envio cuando la consulta a Chatwoot no sirvió (envio_whatsapp.TEXTO_NO_SE_PUDO_CONSULTAR y
 * TEXTO_NO_ENCONTRADO): el estado no cambió y no se sabe más que antes.
 */
export const TEXTOS_CONSULTA_FALLIDA = Object.freeze([
  'No se pudo consultar Chatwoot ahora; vuelve a intentar.',
  'No se encontró el mensaje en Chatwoot: no se pudo verificar si le llegó al cliente.',
]);

const BOTON = '«Abrir WhatsApp con el mensaje»';
const DETALLE_MAX = 150; // envio_whatsapp._DETALLE_EN_TEXTO_MAX
const TEXTO_ESTADO_ENVIADO = 'Chatwoot aceptó el mensaje; WhatsApp todavía no confirma que le llegó al cliente.';
const TEXTOS_ENTREGA = Object.freeze({ ENTREGADO: 'Le llegó al cliente.', LEIDO: 'El cliente ya lo leyó.' });

const esObjeto = (v) => typeof v === 'object' && v !== null;
const textoNoVacio = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const recortar = (texto, maximo) => (texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`);
/** El valor de `mapa` para `clave` solo si es una clave PROPIA (un motivo 'toString' del servidor no es una plantilla). */
const propio = (mapa, clave) => (typeof clave === 'string' && Object.hasOwn(mapa, clave) ? mapa[clave] : undefined);
/** Llena `{nombre}` con el valor TAL CUAL: con una función, String.replace no interpreta '$&', "$'", '$`' ni '$$'. */
const llenar = (plantilla, nombre, valor) => plantilla.replace(`{${nombre}}`, () => valor);

/** telefonos.telefono_legible: '+573001234567' -> '+57 300 123 4567'; otro país queda igual. */
function telefonoLegible(e164) {
  if (typeof e164 !== 'string' || !e164) return null;
  const m = /^\+57(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** El texto del renglón 'WhatsApp' (texto_resultado del servidor, o el espejo si no viene). */
function textoDelResultado(wa) {
  const delServidor = textoNoVacio(wa.texto_resultado);
  if (delServidor) return delServidor;
  if (wa.enviado === true) {
    const destino = textoNoVacio(wa.destino_legible) || telefonoLegible(wa.destino) || 'cliente';
    const plantilla = textoNoVacio(wa.plantilla);
    if (wa.modo === 'PLANTILLA') {
      const conNombre = llenar(TEXTOS_WHATSAPP_ENVIADO.PLANTILLA, 'destino', destino);
      return plantilla ? llenar(conNombre, 'plantilla', plantilla) : conNombre.replace(' «{plantilla}»', '');
    }
    return llenar(TEXTOS_WHATSAPP_ENVIADO.TEXTO, 'destino', destino);
  }
  const plantilla = propio(TEXTOS_MOTIVO_WHATSAPP, wa.motivo);
  if (!plantilla) return 'No se pudo enviar el WhatsApp automático.';
  return llenar(plantilla, 'detalle', recortar(textoNoVacio(wa.detalle) || 'sin detalle', DETALLE_MAX));
}

/**
 * El recuadro del WhatsApp en la ventana del enlace (antes del de correo):
 * - salió (texto o plantilla): 'ok' (verde) con el número, sin botón;
 * - ENVIO_AUTOMATICO_APAGADO: 'info' (azul): se abrió wa.me como hoy, y el botón por si el navegador lo bloqueó;
 * - CHATWOOT_SIN_RESPUESTA: 'alerta' con «puede que haya salido» (nunca «no se envió») y el botón por si no le llegó;
 * - los demás motivos: 'alerta' (ámbar) con el motivo y «Envíaselo tú con el botón…».
 * El botón usa whatsapp.texto_manual (el texto con el enlace que devolvió el servidor). null sin resultado o si el
 * canal no es WhatsApp.
 * @param {unknown} wa
 * @param {string | null | undefined} canal
 * @returns {{tono: 'ok' | 'info' | 'alerta', texto: string, botonManual: boolean} | null}
 */
export function avisoWhatsApp(wa, canal) {
  if (canal !== 'WhatsApp' || !esObjeto(wa)) return null;
  const texto = textoDelResultado(wa);
  if (wa.enviado === true) return { tono: 'ok', texto, botonManual: false };
  if (wa.motivo === 'ENVIO_AUTOMATICO_APAGADO') {
    return { tono: 'info', texto: `${texto} Si no se abrió, usa el botón ${BOTON}.`, botonManual: true };
  }
  if (wa.motivo === 'CHATWOOT_SIN_RESPUESTA') {
    return { tono: 'alerta', texto: `${texto} Si no le llegó, envíaselo tú con el botón ${BOTON}.`, botonManual: true };
  }
  return { tono: 'alerta', texto: `${texto} Envíaselo tú con el botón ${BOTON}.`, botonManual: true };
}

/**
 * U16-entrega: la ventana hace la verificación automática (POST /ventas/envio-cliente/{envio_id}/verificar) solo si el
 * WhatsApp salió, trae envio_id y sigue en 'ENVIADO' (ni FALLIDO ni LEIDO, que son finales).
 * @param {unknown} wa
 * @returns {boolean}
 */
export function debeVerificar(wa) {
  return esObjeto(wa) && wa.enviado === true && wa.estado === 'ENVIADO' && Boolean(wa.envio_id);
}

/**
 * El texto del recuadro después de verificar (la respuesta de verificar: {envio_id, estado, texto, boton_manual,
 * verificado}): ENTREGADO -> 'Le llegó al cliente.'; LEIDO -> 'El cliente ya lo leyó.' (si la consulta falló, uno de
 * TEXTOS_CONSULTA_FALLIDA, se agrega: 'Le llegó al cliente. No se pudo consultar Chatwoot ahora; vuelve a intentar.');
 * FALLIDO -> el texto del servidor, que trae el motivo traducido (o 'No le llegó al cliente.'); ENVIADO y los demás ->
 * el texto del servidor (por ejemplo «No se pudo consultar Chatwoot ahora; vuelve a intentar.»), o el del estado
 * ENVIADO.
 * @param {string | null | undefined} estado
 * @param {string | null} [texto]
 * @returns {string}
 */
export function textoEntrega(estado, texto) {
  const delServidor = textoNoVacio(texto);
  const fijo = propio(TEXTOS_ENTREGA, estado);
  if (fijo) return delServidor && TEXTOS_CONSULTA_FALLIDA.includes(delServidor) ? `${fijo} ${delServidor}` : fijo;
  if (estado === 'FALLIDO') return delServidor || 'No le llegó al cliente.';
  return delServidor || (estado === 'ENVIADO' ? TEXTO_ESTADO_ENVIADO : '');
}
