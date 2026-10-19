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
 *
 * B3 T16 agrega lo de la ventana del enlace (abreWhatsAppLocal, recuadroWhatsApp con la verificación de entrega y
 * enlaceBotonWhatsApp, RP23) y lo de la sección de Configuración (estadoConfigWhatsApp con lo que falta, hueco 4;
 * resultadoPruebaWhatsApp, variablesDeEjemplo y lineaEnvioAutomatico).
 */

import { waUrl, whatsappParaReabrir } from './whatsapp.js';

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

// ─── B3 T16: la ventana del enlace (EnlaceConfirmacionModal) ──────────────────────────────────────────────────────

/** U16-entrega punto 4: la ventana hace UNA verificación automática a los 6 s de abrirse con un envío que salió. */
export const ESPERA_VERIFICACION_MS = 6000;
/** Lo que dice el recuadro mientras la consulta está en curso y todavía no hay respuesta. */
export const TEXTO_REVISANDO_ENTREGA = 'Revisando si le llegó al cliente…';

/**
 * U16-envio punto 14 (y confirmarEnvioHub del Hub): wa.me se abre en el computador del asesor solo si el canal es
 * WhatsApp y el envío no trajo resultado del automático (un backend sin T8) o lo trajo con ENVIO_AUTOMATICO_APAGADO.
 * Si salió, o no salió por otro motivo, NO se abre (nunca dos mensajes): la ventana trae el botón «Abrir WhatsApp con el
 * mensaje».
 * @param {string | null | undefined} canal
 * @param {unknown} wa el `whatsapp` de la respuesta del envío
 * @returns {boolean}
 */
export function abreWhatsAppLocal(canal, wa) {
  if (canal !== 'WhatsApp') return false;
  return !esObjeto(wa) || wa.motivo === 'ENVIO_AUTOMATICO_APAGADO';
}

/**
 * El recuadro del WhatsApp en la ventana del enlace, con la verificación de entrega encima de avisoWhatsApp:
 * {tono, texto, botonManual} de avisoWhatsApp (texto con el número o el motivo), más
 * - entrega: la línea del estado de entrega (textoEntrega) o null antes de verificar;
 * - salio: el WhatsApp automático salió y la verificación no dijo FALLIDO (el párrafo inicial y el correo 'info');
 * - revisable: hay algo que volver a consultar (debeVerificar y el estado conocido no es final: LEIDO y FALLIDO no).
 * `verificacion` es el `data` de POST /ventas/envio-cliente/{envio_id}/verificar ({envio_id, estado, texto,
 * boton_manual, verificado}); la de otro envío o lo que no es un objeto se ignora. FALLIDO pone el recuadro en ámbar
 * con el botón y «Envíaselo tú con el botón…»; ENTREGADO y LEIDO, en verde; una consulta que no sirvió deja el tono.
 * @param {unknown} wa
 * @param {string | null | undefined} canal
 * @param {unknown} [verificacion]
 * @returns {{tono: 'ok' | 'info' | 'alerta', texto: string, botonManual: boolean, entrega: string | null,
 *   salio: boolean, revisable: boolean} | null}
 */
export function recuadroWhatsApp(wa, canal, verificacion) {
  const base = avisoWhatsApp(wa, canal);
  if (!base) return null;
  const enviado = /** @type {any} */ (wa).enviado === true;
  const verificable = debeVerificar(wa);
  const v = esObjeto(verificacion) && mismoEnvio(verificacion, wa) ? /** @type {any} */ (verificacion) : null;
  if (!v) return { ...base, entrega: null, salio: enviado, revisable: verificable };
  const estado = typeof v.estado === 'string' ? v.estado : /** @type {any} */ (wa).estado;
  const fallido = estado === 'FALLIDO';
  const botonManual = base.botonManual || fallido || v.boton_manual === true;
  let entrega = textoEntrega(estado, v.texto) || null;
  if (fallido && entrega) entrega = `${entrega} Envíaselo tú con el botón ${BOTON}.`;
  let tono = base.tono;
  if (fallido) tono = 'alerta';
  else if (estado === 'ENTREGADO' || estado === 'LEIDO') tono = 'ok';
  return { tono, texto: base.texto, botonManual, entrega, salio: enviado && !fallido,
    revisable: verificable && !ESTADOS_FINALES_ENTREGA.includes(estado) };
}

/** La verificación es de este envío (sin envio_id en alguno de los dos, se acepta). */
function mismoEnvio(v, wa) {
  const a = v.envio_id;
  const b = esObjeto(wa) ? wa.envio_id : null;
  return a === null || a === undefined || b === null || b === undefined || String(a) === String(b);
}

/**
 * RP23: el ÚNICO botón «Abrir WhatsApp con el mensaje» de la ventana del enlace (el de whatsappParaReabrir, B13).
 * - Sin resultado del automático (`envio` no es un objeto): el wa.me que se intentó abrir al enviar (`whatsappUrl`).
 * - Con resultado: solo si el recuadro pide el botón (`botonManual`: no salió, o la verificación dijo FALLIDO), armado
 *   con waUrl(telefono, envio.texto_manual), el texto con el enlace que devolvió el servidor; si falta ese texto o el
 *   teléfono, el `whatsappUrl` que se intentó abrir, si lo hay.
 * Solo con canal WhatsApp y solo enlaces https://wa.me/ (whatsappParaReabrir); si no, null (sin botón).
 * @param {{canal?: string | null, envio?: unknown, botonManual?: boolean, telefono?: string | null,
 *   whatsappUrl?: string | null}} [opciones]
 * @returns {string | null}
 */
export function enlaceBotonWhatsApp({ canal, envio, botonManual, telefono, whatsappUrl } = {}) {
  if (canal !== 'WhatsApp') return null;
  if (!esObjeto(envio)) return whatsappParaReabrir(canal, whatsappUrl);
  if (botonManual !== true) return null;
  const texto = textoNoVacio(/** @type {any} */ (envio).texto_manual);
  const url = texto ? waUrl(telefono, texto) : null;
  return whatsappParaReabrir(canal, url || whatsappUrl);
}

// ─── B3 T16: la sección «Envío automático por WhatsApp» de la Configuración del Hub (ConfigEnvioWhatsApp) ───────

const SERVIDOR_CONFIGURADO = 'Conexión con Chatwoot configurada en el servidor.';
const SERVIDOR_SIN_CONFIGURAR = 'Falta configurar la conexión con Chatwoot en el servidor (EasyPanel).';
const FALTA_BANDEJA = 'El número de la bandeja de WhatsApp de Chatwoot: sin él no se puede encender el envío '
  + 'automático.';
const FALTA_PLANTILLA = 'La plantilla del documento aprobada por Meta: sin ella, el WhatsApp automático solo les llega '
  + 'a los clientes que te escribieron en las últimas 24 horas.';
const FALTA_PLANTILLA_RECORDATORIO = 'La plantilla del recordatorio aprobada por Meta: sin ella, los recordatorios casi '
  + 'siempre salen solo por correo (el cliente rara vez escribió en las últimas 24 horas).';

/** Un entero positivo (el inbox_id que devuelve GET /config ya viene como int o null). */
const enteroPositivo = (v) => {
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v;
  return Number.isInteger(n) && n > 0;
};

/**
 * Hueco 4: qué le falta al envío automático, con lo GUARDADO (el `data` de GET /ventas/envio-cliente/whatsapp/config:
 * {automatico, inbox_id, plantilla, plantilla_recordatorio, idioma, servidor_configurado, …}).
 * - servidor: {ok, texto}: la línea del servidor ('Conexión con Chatwoot configurada en el servidor.' o, en ámbar,
 *   'Falta configurar la conexión con Chatwoot en el servidor (EasyPanel).').
 * - faltan: lo demás que falta, cada uno con su efecto: la bandeja, la plantilla del documento y la del recordatorio.
 * null si `cfg` no es un objeto.
 * @param {unknown} cfg
 * @returns {{servidor: {ok: boolean, texto: string}, faltan: string[]} | null}
 */
export function estadoConfigWhatsApp(cfg) {
  if (!esObjeto(cfg)) return null;
  const c = /** @type {any} */ (cfg);
  const ok = c.servidor_configurado === true;
  const faltan = [];
  if (!enteroPositivo(c.inbox_id)) faltan.push(FALTA_BANDEJA);
  if (!textoNoVacio(c.plantilla)) faltan.push(FALTA_PLANTILLA);
  if (!textoNoVacio(c.plantilla_recordatorio)) faltan.push(FALTA_PLANTILLA_RECORDATORIO);
  return { servidor: { ok, texto: ok ? SERVIDOR_CONFIGURADO : SERVIDOR_SIN_CONFIGURAR }, faltan };
}

const PLANTILLAS_PRUEBA = Object.freeze([['plantilla', 'Plantilla del documento'],
  ['plantilla_recordatorio', 'Plantilla del recordatorio']]);

/**
 * El resultado de «Probar conexión» (el `data` de POST /ventas/envio-cliente/whatsapp/probar: {ok, version, bandeja,
 * es_whatsapp, plantilla, plantilla_detalle, plantilla_recordatorio, plantilla_recordatorio_detalle, mensaje}).
 * lineas: el mensaje del servidor, la versión de Chatwoot si la leyó y, si la bandeja es de WhatsApp, el estado de cada
 * plantilla ('aprobada por Meta', 'sin configurar' o el detalle del servidor). tono 'ok' solo si la conexión sirve y
 * ninguna plantilla configurada quedó sin aprobar; si no, 'alerta'. null si `data` no es un objeto.
 * @param {unknown} data
 * @returns {{tono: 'ok' | 'alerta', lineas: string[]} | null}
 */
export function resultadoPruebaWhatsApp(data) {
  if (!esObjeto(data)) return null;
  const d = /** @type {any} */ (data);
  const lineas = [textoNoVacio(d.mensaje) || 'No se pudo probar la conexión.'];
  const version = textoNoVacio(d.version);
  if (version) lineas.push(`Versión de Chatwoot: ${version}.`);
  let plantillasBien = true;
  if (d.es_whatsapp === true) {
    for (const [clave, etiqueta] of PLANTILLAS_PRUEBA) {
      const estado = d[clave];
      if (estado === null || estado === undefined) {
        lineas.push(`${etiqueta}: sin configurar.`);
      } else if (estado === 'APROBADA') {
        lineas.push(`${etiqueta}: aprobada por Meta.`);
      } else {
        plantillasBien = false;
        lineas.push(`${etiqueta}: ${textoNoVacio(d[`${clave}_detalle`]) || 'no se pudo verificar.'}`);
      }
    }
  }
  return { tono: d.ok === true && plantillasBien ? 'ok' : 'alerta', lineas };
}

/**
 * Las variables de ejemplo de una plantilla (ejemplo_parametros de GET /config: {'1': 'María Pérez', …}) en orden
 * numérico, para escribirlas en Meta al crearla: [{variable: '{{1}}', valor}]. Solo claves numéricas.
 * @param {unknown} params
 * @returns {{variable: string, valor: string}[]}
 */
export function variablesDeEjemplo(params) {
  if (!esObjeto(params)) return [];
  return Object.keys(/** @type {object} */ (params))
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => ({ variable: `{{${k}}}`, valor: String(/** @type {any} */ (params)[k] ?? '') }));
}

/**
 * El formulario de la sección con lo guardado (GET /config): {automatico (solo con true), inbox_id ('' sin bandeja),
 * plantilla, plantilla_recordatorio ('' sin nombre) e idioma ('es' por defecto)}, todo listo para los inputs.
 * @param {unknown} cfg
 * @returns {{automatico: boolean, inbox_id: string, plantilla: string, plantilla_recordatorio: string, idioma: string}}
 */
export function formularioEnvioWhatsApp(cfg) {
  const c = esObjeto(cfg) ? /** @type {any} */ (cfg) : {};
  const texto = (v) => (v === null || v === undefined ? '' : String(v));
  return { automatico: c.automatico === true, inbox_id: texto(c.inbox_id), plantilla: texto(c.plantilla),
    plantilla_recordatorio: texto(c.plantilla_recordatorio), idioma: textoNoVacio(c.idioma) || 'es' };
}

/**
 * El cuerpo de PUT /ventas/envio-cliente/whatsapp/config con los 5 campos del formulario: sin espacios en los bordes
 * y un campo vacío como null (envio_whatsapp.validar_cambios borra esa clave). El servidor valida y responde 422 con el
 * mensaje en español; lo que no cambió no se escribe ni se anota.
 * @param {unknown} form
 * @returns {{automatico: boolean, inbox_id: string | null, plantilla: string | null,
 *   plantilla_recordatorio: string | null, idioma: string | null}}
 */
export function cuerpoEnvioWhatsApp(form) {
  const f = esObjeto(form) ? /** @type {any} */ (form) : {};
  return { automatico: f.automatico === true, inbox_id: textoNoVacio(f.inbox_id), plantilla: textoNoVacio(f.plantilla),
    plantilla_recordatorio: textoNoVacio(f.plantilla_recordatorio), idioma: textoNoVacio(f.idioma) };
}

/**
 * Si el formulario tiene cambios sin guardar frente a lo guardado («Guardar» y el aviso de que «Probar conexión» usa
 * lo guardado). Sin lo guardado, true.
 * @param {unknown} form
 * @param {unknown} cfg
 * @returns {boolean}
 */
export function hayCambiosWhatsApp(form, cfg) {
  if (!esObjeto(cfg)) return true;
  return JSON.stringify(cuerpoEnvioWhatsApp(form)) !== JSON.stringify(cuerpoEnvioWhatsApp(formularioEnvioWhatsApp(cfg)));
}

/**
 * La única línea que ve quien no es administrador (N8), con el `data` de GET /ventas/envio-cliente/whatsapp/estado.
 * @param {unknown} estado
 * @returns {string | null}
 */
export function lineaEnvioAutomatico(estado) {
  if (!esObjeto(estado)) return null;
  return `Envío automático por WhatsApp: ${/** @type {any} */ (estado).automatico === true ? 'encendido' : 'apagado'}`;
}
