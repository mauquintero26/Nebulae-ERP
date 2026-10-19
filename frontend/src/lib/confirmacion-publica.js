/**
 * Las páginas públicas del cliente: /confirmar/{token} (la SC y la COT) y /pedido/{token} (el PVEN) (Bloque 3, T12:
 * U17+H28 punto 7, H28-cambios, U22-cambios; C5, C9, C26, R10, RP26, RP27). JS plano, sin fetch ni DOM al
 * importarlo, para probarlo con node (frontend/tests/test_confirmacion_publica.mjs) y para que T13 compare
 * puedeEnviarCambios con el backend (RP21).
 *
 * - pedirPublico es el POST de esas páginas: sin el token de sesión del personal (apiFetch lo mandaría si un asesor
 *   abre el enlace y borraría la sesión con un 401), sin cookies, sin Referer y sin llevar a /login. El token del
 *   enlace va en el cuerpo, nunca en la URL.
 * - vistaDeRespuesta convierte cualquier respuesta en lo que pinta la página: las formas reales de
 *   backend/app/api/v1/confirmacion_publica.py (el 200 de /confirmar/ver, el 400 con el detail de _detalle, el 200 de
 *   confirmar y el de pedir cambios, y el 200 de /pedido-cliente/ver).
 * - B3 T15: los textos y las decisiones de las páginas (respuestaDeAccion, textoAntesDeConfirmar, queSigue,
 *   lineaConfirmacion, metaDeLaVista, selloDeLaVista, parrafoDelAviso, textosPanelCambios, tituloDeLaPagina): las
 *   páginas solo usan esto y DocumentoComercial.
 */

import { errorDeRespuesta } from './avisos.js';
import { fechaHoraCO, fechaSolo } from './fechas-colombia.js';
import { normalizarMarca, stripPy } from './marca-empresa.js';
import { largoTexto } from './chatter.js';
import { TIPOS_DOCUMENTO, tituloDePestana } from './documento-comercial.js';
import { formatoPesos } from './pesos.js';

// ─── Pedir cambios (C9; los límites de confirmacion_publica.py) ───────────────────────────────────────────────

export const MIN_COMENTARIO_CAMBIOS = 10;
export const MAX_COMENTARIO_CAMBIOS = 1000;
export const TIPO_CAMBIOS = 'CAMBIOS';
/** Solo en la SC (R8): vuelve al asesor marcada «Ya no la necesita»; el comentario puede ir vacío. */
export const TIPO_NO_LA_NECESITA = 'NO_LA_NECESITA';
// Un comentario más largo que esto ni se limpia (_TOPE_SIN_LIMPIAR del backend).
const TOPE_SIN_LIMPIAR = 4 * MAX_COMENTARIO_CAMBIOS;

/**
 * El comentario como lo guarda el backend (_limpiar_comentario): \r\n y \r -> \n; sin caracteres de control (salvo
 * \n y \t), sin surrogates sueltos y sin caracteres de formato (ancho cero, controles bidireccionales); sin espacios
 * en los bordes. Sirve para el contador x/1000 de la página. Lo que no es texto -> ''.
 * @param {unknown} texto
 * @returns {string}
 */
export function limpiarComentario(texto) {
  if (typeof texto !== 'string') return '';
  // Los bordes con stripPy (str.strip() de Python, la copia única de marca-empresa.js).
  return stripPy(texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/(?![\n\t])[\p{Cc}\p{Cs}\p{Cf}]/gu, ''));
}


/**
 * Si el comentario se puede enviar (el botón 'Enviar cambios' se habilita), con la misma regla del backend
 * (_validar_pedido_de_cambios): tipo CAMBIOS (por defecto) de 10 a 1000 caracteres después de limpiarlo; tipo
 * NO_LA_NECESITA con el comentario vacío o de hasta 1000. Más de 4000 sin limpiar es demasiado largo. Cuenta code
 * points, no unidades UTF-16. Otro tipo -> false.
 * @param {unknown} texto
 * @param {string} [tipo]
 * @returns {boolean}
 */
export function puedeEnviarCambios(texto, tipo = TIPO_CAMBIOS) {
  if (tipo !== TIPO_CAMBIOS && tipo !== TIPO_NO_LA_NECESITA) return false;
  const crudo = typeof texto === 'string' ? texto : '';
  if (largoTexto(crudo) > TOPE_SIN_LIMPIAR) return false;
  const n = largoTexto(limpiarComentario(crudo));
  if (n > MAX_COMENTARIO_CAMBIOS) return false;
  return tipo === TIPO_NO_LA_NECESITA || n >= MIN_COMENTARIO_CAMBIOS;
}

// ─── Idempotencia ───────────────────────────────────────────────────────────────────────────────────────────────

/** Un UUID v4 con crypto.randomUUID o, donde no existe (http que no es localhost), con crypto.getRandomValues. */
function uuid() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * La Idempotency-Key de un POST público: '{prefijo}-{uuid aleatorio}', una por intento. Nunca lleva el token ni una
 * parte de él (antes repetía sus primeros 16 caracteres en un encabezado).
 * @param {string} prefijo 'confirmar' o 'cambios'
 * @returns {string}
 */
export function claveIdempotencia(prefijo) {
  return `${prefijo}-${uuid()}`;
}

// ─── El POST público ────────────────────────────────────────────────────────────────────────────────────────────

/** Encabezados que nunca salen de una página pública, aunque se los pasen. */
const PROHIBIDOS = new Set(['authorization', 'cookie']);

/**
 * @typedef {{ ok: boolean, status: number, cuerpo: any, mensaje: string | null }} RespuestaPublica
 */

/**
 * POST {apiUrl}{ruta} con el cuerpo en JSON, sin token de sesión (se descarta si viene en `encabezados`), sin cookies,
 * sin Referer y sin caché; nunca redirige a /login ni sigue una redirección HTTP (redirect 'error': un 307/308 repetiría
 * el POST con el token en el cuerpo; el fallo sale por el camino de sin conexión). Devuelve {ok, status, cuerpo (el JSON, o null), mensaje}: si no es
 * 2xx, mensaje es el texto del error leído de 'detail' (texto o dict con mensaje) o de 'message' (el 400 de validación
 * de backend/main.py no trae 'detail'), con errorDeRespuesta de lib/avisos.js. Si la red falla, status 0 y el mensaje
 * de sin conexión. Nunca lanza.
 * @param {string} apiUrl la URL del API (API_URL de lib/api.ts)
 * @param {string} ruta p. ej. '/confirmar/ver'
 * @param {unknown} cuerpo p. ej. {token}
 * @param {Record<string, string>} [encabezados] p. ej. {'Idempotency-Key': claveIdempotencia('confirmar')}
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<RespuestaPublica>}
 */
export async function pedirPublico(apiUrl, ruta, cuerpo, encabezados = {}, fetchImpl = globalThis.fetch) {
  /** @type {Record<string, string>} */
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  for (const [nombre, valor] of Object.entries(encabezados || {})) {
    if (!PROHIBIDOS.has(nombre.toLowerCase()) && valor !== null && valor !== undefined) headers[nombre] = String(valor);
  }
  const base = String(apiUrl ?? '').replace(/\/+$/, '');
  const camino = String(ruta ?? '').replace(/^\/*/, '/');
  try {
    const respuesta = await fetchImpl(`${base}${camino}`, {
      method: 'POST', headers, body: JSON.stringify(cuerpo ?? {}), credentials: 'omit', referrerPolicy: 'no-referrer',
      cache: 'no-store', redirect: 'error',
    });
    let datos = null;
    try {
      datos = await respuesta.json();
    } catch {
      datos = null;
    }
    return { ok: respuesta.ok, status: respuesta.status, cuerpo: datos,
      mensaje: respuesta.ok ? null : errorDeRespuesta(respuesta.status, datos ?? {}).message };
  } catch {
    return { ok: false, status: 0, cuerpo: null, mensaje: TEXTOS_ENLACE.sin_conexion.mensaje };
  }
}

// ─── Lo que pinta la página ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Título, ícono (nombre de lucide-react) y tono de cada estado de la página.
 * - titulo: un encabezado corto. En un 400 nunca es el mensaje del servidor (en el 200 de confirmar y de pedir cambios
 *   sí lo es: ver vistaDeRespuesta).
 * - mensaje: el párrafo por defecto, si el servidor no manda uno. Es la frase COMPLETA, la misma convención de
 *   MENSAJES_ENLACE (backend/app/core/documento_cliente.py), así que el párrafo puede repetir el título; las partes que
 *   el frontend no conoce ({fecha}, {asesor}) se omiten.
 * - {documento} se cambia por 'solicitud' o 'cotización': las plantillas están en femenino y los estados que lo usan
 *   solo existen para la SC y la COT. Si no se sabe el tipo, o es un pedido, se usan tituloSinTipo y mensajeSinTipo.
 * Inmutable.
 */
export const TEXTOS_ENLACE = Object.freeze({
  pendiente: Object.freeze({ titulo: 'Esperando tu confirmación', icono: 'Clock', tono: 'info', mensaje: null }),
  confirmada: Object.freeze({ titulo: 'Esta {documento} ya fue confirmada', tituloSinTipo: 'Ya fue confirmada',
    icono: 'CheckCircle2', tono: 'ok', mensaje: 'Esta {documento} ya fue confirmada.',
    mensajeSinTipo: 'Ya fue confirmada.' }),
  vencido: Object.freeze({ titulo: 'Este enlace venció', icono: 'CalendarX', tono: 'alerta',
    mensaje: 'Este enlace venció. Escríbenos y te enviamos uno nuevo.' }),
  reemplazado: Object.freeze({ titulo: 'Te enviamos un enlace más reciente', icono: 'RefreshCw', tono: 'info',
    mensaje: 'Te enviamos un enlace más reciente para esta {documento}. Ábrelo desde el último mensaje que recibiste.',
    mensajeSinTipo: 'Te enviamos un enlace más reciente. Ábrelo desde el último mensaje que recibiste.' }),
  cambios_enviados: Object.freeze({ titulo: 'Ya recibimos tus cambios', icono: 'MessageSquare', tono: 'info',
    mensaje: 'Ya nos enviaste tus cambios. Tu asesor ajustará la {documento} y te enviará un enlace nuevo.',
    mensajeSinTipo: 'Ya nos enviaste tus cambios. Tu asesor te enviará un enlace nuevo.' }),
  actualizada: Object.freeze({ titulo: 'Tu asesor actualizó esta {documento}',
    tituloSinTipo: 'Tu asesor actualizó el documento', icono: 'RefreshCw', tono: 'info',
    mensaje: 'Tu asesor actualizó esta {documento} después de tu confirmación. Te enviaremos un enlace nuevo para que '
      + 'la revises.',
    mensajeSinTipo: 'Tu asesor actualizó el documento después de tu confirmación. Te enviaremos un enlace nuevo para '
      + 'que lo revises.' }),
  no_disponible: Object.freeze({ titulo: 'Este enlace ya no está disponible', icono: 'Ban', tono: 'gris',
    mensaje: 'Este enlace ya no está disponible. Si tienes dudas, escríbenos.' }),
  invalido: Object.freeze({ titulo: 'Este enlace no es válido', icono: 'Link2Off', tono: 'alerta',
    mensaje: 'Este enlace no es válido. Ábrelo completo desde el mensaje que te enviamos o pide uno nuevo.' }),
  consulta: Object.freeze({ titulo: 'Tu pedido', icono: 'FileText', tono: 'info', mensaje: null }),
  validacion: Object.freeze({ titulo: 'Revisa tu mensaje', icono: 'AlertTriangle', tono: 'alerta', mensaje: null }),
  sin_conexion: Object.freeze({ titulo: 'Sin conexión', icono: 'WifiOff', tono: 'alerta',
    mensaje: 'No pudimos cargar tu documento. Revisa tu conexión y vuelve a intentarlo.' }),
  error: Object.freeze({ titulo: 'Algo salió mal', icono: 'AlertTriangle', tono: 'alerta',
    mensaje: 'Ocurrió un error inesperado. Intenta de nuevo.' }),
});

/**
 * @typedef {{
 *   estado_enlace: string, titulo: string, icono: string, tono: string, mensaje: string | null,
 *   empresa: import('./marca-empresa.js').MarcaEmpresa, documento: any, tipo: 'SC' | 'COT' | 'PVEN' | null,
 *   cot_numero: string | null, vence_at: string | null, confirmada_el: string | null, confirmadaElTexto: string,
 *   siguiente_paso: any, comentario: string | null, puedeActuar: boolean, reintentar: boolean,
 *   recienConfirmada: boolean
 * }} VistaPublica
 */

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** Parece un documento de documento_cliente.py (data de /pedido-cliente/ver ES el documento). */
const esDocumento = (v) => esObjeto(v) && (Array.isArray(v.lineas) || typeof v.tipo === 'string');

/** El tipo del documento ('SC', 'COT'...) por su tipo o por el prefijo del número, o null. */
function tipoDe(documento) {
  if (!esObjeto(documento)) return null;
  if (typeof documento.tipo === 'string' && Object.prototype.hasOwnProperty.call(TIPOS_DOCUMENTO, documento.tipo)) {
    return documento.tipo;
  }
  const prefijo = /^(SC|COT|PVEN)-/i.exec(String(documento.numero ?? ''));
  return prefijo ? prefijo[1].toUpperCase() : null;
}

// El nombre del documento dentro de un mensaje del servidor ('Tu asesor actualizó esta cotización…'), como palabra
// suelta. Solo la SC y la COT: las plantillas con {documento} están en femenino (nunca «esta pedido»).
const NOMBRE_EN_MENSAJE = /(?:^|[^\p{L}\p{N}_])(solicitud|cotización)(?![\p{L}\p{N}_])/iu;

/**
 * Cómo se nombra el documento en los textos: por su tipo o el prefijo de su número; si no viene (el backend solo manda
 * detail.documento en 'vencido' y 'confirmada'), por la palabra que trae el mensaje del servidor; si no, null. Un
 * pedido también da null (sus textos usan las variantes SinTipo).
 */
function nombreDe(documento, mensaje) {
  const tipo = tipoDe(documento);
  if (tipo) return tipo === 'PVEN' ? null : TIPOS_DOCUMENTO[/** @type {'SC'|'COT'} */ (tipo)].nombre;
  const m = NOMBRE_EN_MENSAJE.exec(mensaje ?? '');
  return m ? m[1].toLowerCase() : null;
}

/** B3 T15: el tipo por la palabra del mensaje del servidor (nombreDe), cuando el detail no trae el documento. */
const TIPO_POR_NOMBRE = Object.freeze({ solicitud: 'SC', cotización: 'COT' });

/** El texto `campo` ('titulo' o 'mensaje') del estado con {documento} lleno; sin nombre, su variante SinTipo. */
function textoDelEstado(estado, campo, nombre) {
  const t = /** @type {Record<string, string | null>} */ (TEXTOS_ENLACE[estado]);
  const valor = t[campo];
  if (typeof valor !== 'string' || !valor.includes('{documento}')) return valor;
  return nombre ? valor.replace('{documento}', nombre) : t[`${campo}SinTipo`];
}

/**
 * La vista que pinta la página pública a partir de lo que devolvió pedirPublico:
 * - 200 de /confirmar/ver ({estado_enlace 'pendiente', vence_at, empresa, data: {numero…, documento}}) -> 'pendiente',
 *   con puedeActuar (Confirmar y Pedir cambios).
 * - 200 de confirmar ({estado_enlace 'confirmada', mensaje '¡Gracias!…', confirmada_el, siguiente_paso, data?}) ->
 *   'confirmada' con recienConfirmada. 200 de pedir cambios ({estado_enlace 'cambios_enviados', mensaje, detalle,
 *   comentario, data?}) -> 'cambios_enviados' (título = mensaje, mensaje = detalle).
 * - 200 de /pedido-cliente/ver ({status, empresa, data: documento, cot_numero}) -> 'consulta' (solo lectura).
 * - Solo un 400 es un estado del enlace: con el detail de _detalle ({mensaje, estado_enlace, empresa, documento,
 *   confirmada_el, siguiente_paso, comentario}) -> ese estado; con un detail de texto (backend viejo o genérico) ->
 *   'invalido' con ese texto.
 * - 422 (el comentario de pedir cambios) -> 'validacion': el mensaje en la misma pantalla y el enlace sigue sirviendo.
 * - Sin red (o una redirección rechazada) -> 'sin_conexion'. Cualquier otro status (404, 405, 500, el 400 de
 *   validación sin detail) -> 'error' con r.mensaje (el texto ya traducido). Los dos con reintentar.
 * Título y mensaje en un 400: titulo es un encabezado corto de TEXTOS_ENLACE ({documento} con el nombre del documento,
 * o del mensaje del servidor si el detail no trae documento) y nunca es el mensaje del servidor (en los 200 de
 * confirmar y de pedir cambios sí lo es, como dice arriba); mensaje es la frase completa del servidor (o la de
 * TEXTOS_ENLACE), así que el cuerpo puede repetir el título; T15 lo pinta como encabezado + párrafo.
 * confirmadaElTexto = fechaHoraCO(confirmada_el) (RP26: 'sábado 3 de octubre, 3:15 p. m.'). empresa = normalizarMarca
 * (la marca vacía si no viene: nunca 'Nebulae'). B3 T15: tipo = 'SC' | 'COT' | 'PVEN' por el documento (su tipo o el
 * prefijo de su número) o, si no viene, por la palabra del mensaje ('solicitud' o 'cotización'); si no, null.
 * @param {RespuestaPublica} r
 * @returns {VistaPublica}
 */
export function vistaDeRespuesta(r) {
  const cuerpo = esObjeto(r?.cuerpo) ? r.cuerpo : {};
  const status = Number(r?.status) || 0;
  const detail = cuerpo.detail;
  const fuente = r?.ok ? cuerpo : (esObjeto(detail) ? detail : {});
  let estado;
  let documento = null;
  let mensaje = null;
  let titulo = null;
  if (r?.ok) {
    const data = cuerpo.data;
    if (texto(cuerpo.estado_enlace) && Object.prototype.hasOwnProperty.call(TEXTOS_ENLACE, cuerpo.estado_enlace)) {
      estado = cuerpo.estado_enlace;
    } else {
      estado = esDocumento(data) ? 'consulta' : 'pendiente';
    }
    documento = estado === 'consulta' ? data : (esObjeto(data) && esObjeto(data.documento) ? data.documento : null);
    if (estado === 'cambios_enviados') {
      titulo = texto(cuerpo.mensaje);
      mensaje = texto(cuerpo.detalle);
    } else if (estado === 'confirmada') {
      titulo = texto(cuerpo.mensaje);
    } else {
      mensaje = texto(cuerpo.mensaje);
    }
  } else if (status === 0) {
    estado = 'sin_conexion';
  } else if (status === 422) {
    estado = 'validacion';
    mensaje = texto(r?.mensaje) ?? (typeof detail === 'string' ? texto(detail) : null);
  } else if (status === 400 && esObjeto(detail)
    && Object.prototype.hasOwnProperty.call(TEXTOS_ENLACE, detail.estado_enlace)) {
    estado = detail.estado_enlace;
    documento = esObjeto(detail.documento) ? detail.documento : null;
    mensaje = texto(detail.mensaje);
  } else if (status === 400 && typeof detail === 'string' && texto(detail)) {
    estado = 'invalido';
    mensaje = texto(detail);
  } else {
    estado = 'error';
    mensaje = texto(r?.mensaje);
  }
  const nombre = nombreDe(documento, mensaje);
  const confirmadaEl = texto(fuente.confirmada_el);
  return {
    estado_enlace: estado,
    titulo: titulo ?? textoDelEstado(estado, 'titulo', nombre) ?? '',
    icono: TEXTOS_ENLACE[estado].icono,
    tono: TEXTOS_ENLACE[estado].tono,
    // Un 200 no se completa con el texto por defecto (el '¡Gracias!' de confirmar ya es el título).
    mensaje: mensaje ?? (r?.ok ? null : textoDelEstado(estado, 'mensaje', nombre)),
    empresa: normalizarMarca(fuente.empresa ?? cuerpo.empresa),
    documento,
    tipo: tipoDe(documento) ?? (nombre ? TIPO_POR_NOMBRE[nombre] ?? null : null),
    cot_numero: texto(cuerpo.cot_numero),
    vence_at: texto(fuente.vence_at),
    confirmada_el: confirmadaEl,
    confirmadaElTexto: confirmadaEl ? fechaHoraCO(confirmadaEl) : '',
    siguiente_paso: fuente.siguiente_paso ?? null,
    comentario: texto(fuente.comentario),
    puedeActuar: estado === 'pendiente' || estado === 'validacion',
    reintentar: estado === 'sin_conexion' || estado === 'error',
    recienConfirmada: Boolean(r?.ok) && estado === 'confirmada',
  };
}

// ─── B3 T15: lo que pintan /confirmar/{token} y /pedido/{token} (las páginas solo usan esto y DocumentoComercial) ──

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
/** 'Cotización' de 'COTIZACIÓN', 'Pedido de venta' de 'PEDIDO DE VENTA', 'La' de 'la'. */
const comoTitulo = (t) => t.charAt(0).toLocaleUpperCase('es') + t.slice(1).toLocaleLowerCase('es');
const esTipoConfirmable = (tipo) => tipo === 'SC' || tipo === 'COT';
// La hoja se pinta en estos estados (con un documento completo: con sus líneas).
const ESTADOS_CON_HOJA = new Set(['pendiente', 'confirmada', 'consulta']);

/**
 * Si la página pinta la hoja (DocumentoComercial): solo en 'pendiente', 'confirmada' y 'consulta' (el pedido), y solo
 * con un documento completo (con líneas). La COT confirmada trae solo su número (C10) y después de pedir cambios la
 * hoja no se pinta (va a cambiar): en esos casos va el aviso con el encabezado de la empresa.
 * @param {unknown} vista
 * @returns {boolean}
 */
export function vistaConDocumento(vista) {
  return esObjeto(vista) && ESTADOS_CON_HOJA.has(/** @type {any} */ (vista).estado_enlace)
    && esObjeto(/** @type {any} */ (vista).documento) && Array.isArray(/** @type {any} */ (vista).documento.lineas);
}

/** Lo que se le dice al cliente si una acción no llegó al servidor (la página no se cae ni borra lo escrito). */
const SIN_CONEXION_ACCION = Object.freeze({
  confirmar: 'No pudimos enviar tu confirmación. Revisa tu conexión y vuelve a intentarlo.',
  cambios: 'No pudimos enviar tu mensaje. Revisa tu conexión y vuelve a intentarlo: lo que escribiste sigue aquí.',
});

/**
 * Qué hace la página con la respuesta de una acción ('confirmar' o 'cambios'), a partir de lo que devolvió
 * pedirPublico:
 * - el 422 de pedir cambios ('validacion'), sin red o un error que no es del enlace -> {vista: null, error}: el mensaje
 *   va en la misma pantalla (dentro del panel de cambios o junto a los botones), la vista anterior y lo que el cliente
 *   escribió se conservan (nota del controlador después de T12, H28-cambios, U22-cambios);
 * - lo demás (el 200 de confirmar o de pedir cambios, o un 400 con el estado del enlace: doble clic, otra pestaña,
 *   venció) -> {vista, error: null}: la vista nueva reemplaza a la anterior. Con la vista `anterior`: conserva su tipo
 *   (para los textos) y su marca si la respuesta no las trae; y si el 200 de confirmar llegó sin data (r1 de T5: no se
 *   pudo armar el documento), la hoja que el cliente acaba de confirmar. Nunca pinta la hoja vieja en otro estado.
 * @param {RespuestaPublica} r
 * @param {'confirmar' | 'cambios'} accion
 * @param {VistaPublica | null} [anterior]
 * @returns {{vista: VistaPublica | null, error: string | null}}
 */
export function respuestaDeAccion(r, accion, anterior = null) {
  const vista = vistaDeRespuesta(r);
  if (vista.estado_enlace === 'validacion') return { vista: null, error: vista.mensaje ?? TEXTOS_ENLACE.validacion.titulo };
  if (vista.estado_enlace === 'sin_conexion') {
    return { vista: null, error: SIN_CONEXION_ACCION[accion] ?? SIN_CONEXION_ACCION.confirmar };
  }
  if (vista.estado_enlace === 'error') return { vista: null, error: vista.mensaje ?? TEXTOS_ENLACE.error.mensaje };
  if (!esObjeto(anterior)) return { vista, error: null };
  const previa = /** @type {VistaPublica} */ (anterior);
  return {
    vista: {
      ...vista,
      tipo: vista.tipo ?? previa.tipo ?? null,
      documento: vista.documento ?? (vista.recienConfirmada && vistaConDocumento(previa) ? previa.documento : null),
      empresa: vista.empresa.configurada || !previa.empresa?.configurada ? vista.empresa : previa.empresa,
    },
    error: null,
  };
}

/** El anticipo que le falta pagar al cliente: anticipo_por_pagar (descuenta el saldo a favor) o el anticipo. */
function anticipoPorPagar(pago) {
  if (!esObjeto(pago)) return null;
  if (esNumero(pago.anticipo_por_pagar)) return pago.anticipo_por_pagar;
  return esNumero(pago.anticipo) ? pago.anticipo : null;
}

/**
 * «¿Qué pasa si confirmo?», antes de los botones:
 * - SC (U17): 'Nos confirmas que estos productos y cantidades son los que necesitas. Con eso {asesor o 'tu asesor'}
 *   prepara tu cotización con los precios y te la enviamos para que la apruebes. Confirmar no es una compra ni un pago.'
 * - COT (U22+H38): 'Al confirmar aceptas los productos, precios y forma de pago de esta cotización.' y, con anticipo
 *   por pagar, 'El siguiente paso es pagar el anticipo de $X; cuando lo verifiquemos, crearemos tu pedido.'; sin él
 *   (0%, o el saldo a favor lo cubre), 'Cuando la confirmes, crearemos tu pedido.'.
 * - Otro documento (el pedido no se confirma) -> ''.
 * @param {unknown} documento
 * @returns {string}
 */
export function textoAntesDeConfirmar(documento) {
  if (!esObjeto(documento)) return '';
  const doc = /** @type {any} */ (documento);
  const tipo = tipoDe(doc);
  if (tipo === 'SC') {
    return 'Nos confirmas que estos productos y cantidades son los que necesitas. Con eso '
      + `${texto(doc.atendido_por) ?? 'tu asesor'} prepara tu cotización con los precios y te la enviamos para que la `
      + 'apruebes. Confirmar no es una compra ni un pago.';
  }
  if (tipo !== 'COT') return '';
  const inicio = 'Al confirmar aceptas los productos, precios y forma de pago de esta cotización.';
  const anticipo = anticipoPorPagar(doc.pago);
  return anticipo !== null && anticipo > 0
    ? `${inicio} El siguiente paso es pagar el anticipo de ${formatoPesos(anticipo)}; cuando lo verifiquemos, crearemos `
      + 'tu pedido.'
    : `${inicio} Cuando la confirmes, crearemos tu pedido.`;
}

/**
 * «¿Qué sigue?» después de confirmar, con el siguiente_paso del servidor:
 * - SC: la lista de 3 pasos (siguiente_paso_sc), tal cual (sin los que no son texto);
 * - COT: {anticipo_por_pagar, instrucciones_pago} -> 'Paga el anticipo de $X.' y 'Cuando lo verifiquemos, crearemos tu
 *   pedido.' (o 'Crearemos tu pedido.' sin anticipo por pagar), con los datos para pagar aparte (saltos de línea);
 * - sin siguiente_paso (la COT reabierta, C10) o sin el monto -> sin pasos.
 * @param {unknown} vista
 * @returns {{pasos: string[], instrucciones: string | null}}
 */
export function queSigue(vista) {
  const paso = esObjeto(vista) ? /** @type {any} */ (vista).siguiente_paso : null;
  if (Array.isArray(paso)) return { pasos: paso.map(texto).filter((p) => p !== null), instrucciones: null };
  if (!esObjeto(paso) || !esNumero(paso.anticipo_por_pagar)) return { pasos: [], instrucciones: null };
  const anticipo = paso.anticipo_por_pagar;
  return {
    pasos: anticipo > 0
      ? [`Paga el anticipo de ${formatoPesos(anticipo)}.`, 'Cuando lo verifiquemos, crearemos tu pedido.']
      : ['Crearemos tu pedido.'],
    instrucciones: texto(paso.instrucciones_pago),
  };
}

/**
 * La línea con la fecha de la confirmación (fechaHoraCO, RP26; termina en 'a. m.'/'p. m.', sin otro punto):
 * - recién confirmada: 'Confirmaste la solicitud SC-… el sábado 3 de octubre, 3:15 p. m.' (sin tipo: 'Registramos tu
 *   confirmación el …');
 * - reabierta (el 400 'confirmada', que pudo confirmarse al aprobar su cotización): 'La cotización COT-… se confirmó el
 *   …' (sin tipo: 'Se confirmó el …').
 * Otro estado o sin fecha -> ''.
 * @param {unknown} vista
 * @returns {string}
 */
export function lineaConfirmacion(vista) {
  if (!esObjeto(vista)) return '';
  const v = /** @type {VistaPublica} */ (vista);
  if (v.estado_enlace !== 'confirmada' || !v.confirmadaElTexto) return '';
  const fecha = v.confirmadaElTexto;
  const t = esTipoConfirmable(v.tipo) ? TIPOS_DOCUMENTO[/** @type {'SC'|'COT'} */ (v.tipo)] : null;
  const numero = esObjeto(v.documento) ? texto(v.documento.numero) : null;
  const documento = t ? [t.nombre, numero].filter(Boolean).join(' ') : '';
  if (v.recienConfirmada) return t ? `Confirmaste ${t.articulo} ${documento} el ${fecha}` : `Registramos tu confirmación el ${fecha}`;
  return t ? `${comoTitulo(t.articulo)} ${documento} se confirmó el ${fecha}` : `Se confirmó el ${fecha}`;
}

/**
 * Los datos de más del encabezado del documento (metaDerecha de DocumentoComercial), en este orden:
 * - pendiente: 'Estado: Esperando tu confirmación'; en la SC, 'Puedes confirmar hasta' (vence_at con fechaHoraCO);
 * - la COT, en cualquier estado con hoja: 'Válida hasta' (valida_hasta, U22-validez; su enlace vence ese día, así que
 *   no se repite el vencimiento);
 * - el pedido: 'Según cotización' (cot_numero de la respuesta, U23).
 * @param {unknown} vista
 * @returns {{etiqueta: string, valor: string}[]}
 */
export function metaDeLaVista(vista) {
  if (!esObjeto(vista)) return [];
  const v = /** @type {VistaPublica} */ (vista);
  if (v.estado_enlace === 'consulta') return v.cot_numero ? [{ etiqueta: 'Según cotización', valor: v.cot_numero }] : [];
  const meta = [];
  const pendiente = v.estado_enlace === 'pendiente';
  if (pendiente) meta.push({ etiqueta: 'Estado', valor: TEXTOS_ENLACE.pendiente.titulo });
  if (v.tipo === 'COT') {
    const valida = fechaSolo(esObjeto(v.documento) ? v.documento.valida_hasta : null);
    if (valida) meta.push({ etiqueta: 'Válida hasta', valor: valida });
  } else if (v.tipo === 'SC' && pendiente) {
    const vence = fechaHoraCO(v.vence_at);
    if (vence) meta.push({ etiqueta: 'Puedes confirmar hasta', valor: vence });
  }
  return meta;
}

/**
 * El sello de la hoja (se imprime): 'Confirmada' (tono 'ok') cuando el documento ya fue confirmado; si no, null.
 * @param {unknown} vista
 * @returns {{texto: string, tono: 'ok'} | null}
 */
export function selloDeLaVista(vista) {
  return esObjeto(vista) && /** @type {any} */ (vista).estado_enlace === 'confirmada'
    ? { texto: 'Confirmada', tono: 'ok' } : null;
}

/** Para comparar textos: sin espacios repetidos ni el punto final, en minúsculas. */
const comparable = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().replace(/\.+$/, '').trim().toLocaleLowerCase('es');

/**
 * El párrafo bajo el título del aviso (encabezado + párrafo, nota del controlador después de T12): el mensaje de la
 * vista, que puede repetir parte del título porque el backend manda frases completas; null si no hay mensaje o si es
 * EXACTAMENTE el título (sin contar el punto final, los espacios ni las mayúsculas), para no pintarlo dos veces
 * ('Esta solicitud ya fue confirmada' / 'Esta solicitud ya fue confirmada.').
 * @param {unknown} vista
 * @returns {string | null}
 */
export function parrafoDelAviso(vista) {
  if (!esObjeto(vista)) return null;
  const v = /** @type {VistaPublica} */ (vista);
  const mensaje = texto(v.mensaje);
  return mensaje && comparable(mensaje) !== comparable(v.titulo) ? mensaje : null;
}

/**
 * Los textos del panel «Pedir cambios» (H28-cambios, U22-cambios), por tipo de documento y por opción:
 * - CAMBIOS: '¿Qué quieres cambiar?', el ejemplo de la SC ('son 8 rodillos, no 6…') o de la COT ('quiero 6 galones en
 *   vez de 4'), '{asesor o Tu asesor} recibirá tu mensaje y te enviará la {solicitud|cotización} corregida con un
 *   enlace nuevo. Este enlace dejará de funcionar.' y 'Enviar cambios';
 * - NO_LA_NECESITA (solo la SC, R8; el comentario es opcional): '¿Quieres contarnos por qué? (opcional)', '{asesor}
 *   revisará tu respuesta y se pondrá en contacto contigo…' (lo mismo que contesta el backend) y 'Enviar respuesta'.
 * En la COT, NO_LA_NECESITA no existe: van los textos de CAMBIOS.
 * @param {unknown} tipo 'SC' | 'COT'
 * @param {unknown} tipoCambios 'CAMBIOS' | 'NO_LA_NECESITA'
 * @param {unknown} asesor el nombre del asesor (documento.atendido_por)
 * @returns {{pregunta: string, ejemplo: string, explicacion: string, boton: string}}
 */
export function textosPanelCambios(tipo, tipoCambios, asesor) {
  const quien = texto(asesor) ?? 'Tu asesor';
  if (tipo === 'SC' && tipoCambios === TIPO_NO_LA_NECESITA) {
    return {
      pregunta: '¿Quieres contarnos por qué? (opcional)',
      ejemplo: 'Por ejemplo: ya no necesito estos productos.',
      explicacion: `${quien} revisará tu respuesta y se pondrá en contacto contigo. Este enlace dejará de funcionar.`,
      boton: 'Enviar respuesta',
    };
  }
  const cot = tipo === 'COT';
  return {
    pregunta: '¿Qué quieres cambiar?',
    ejemplo: cot ? 'Por ejemplo: quiero 6 galones en vez de 4.'
      : 'Por ejemplo: son 8 rodillos, no 6, y agrega 2 brochas de 3 pulgadas.',
    explicacion: `${quien} recibirá tu mensaje y te enviará la ${TIPOS_DOCUMENTO[cot ? 'COT' : 'SC'].nombre} corregida con `
      + 'un enlace nuevo. Este enlace dejará de funcionar.',
    boton: 'Enviar cambios',
  };
}

/**
 * El título de la pestaña en cualquier estado, con el orden de PLANTILLA (tituloDePestana: 'Solicitud SC-… ·
 * Empresa'; nota del controlador después de T12): el título y el número del documento; si el documento trae solo su
 * número (o no viene), el nombre de su tipo ('Cotización COT-… · Empresa', 'Cotización · Empresa'); sin documento ni
 * tipo, solo la empresa. Sin nada de eso, `porDefecto` (el title del layout: 'Documento' o 'Tu pedido').
 * @param {unknown} vista
 * @param {string} porDefecto
 * @returns {string}
 */
export function tituloDeLaPagina(vista, porDefecto) {
  if (!esObjeto(vista)) return porDefecto;
  const v = /** @type {VistaPublica} */ (vista);
  const doc = esObjeto(v.documento) ? v.documento : {};
  const tipo = v.tipo && Object.prototype.hasOwnProperty.call(TIPOS_DOCUMENTO, v.tipo) ? v.tipo : null;
  const titulo = texto(doc.titulo) ?? (tipo ? comoTitulo(TIPOS_DOCUMENTO[tipo].titulo) : null);
  return tituloDePestana({ titulo, numero: doc.numero }, v.empresa) || porDefecto;
}
