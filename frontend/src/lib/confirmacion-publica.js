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
 */

import { errorDeRespuesta } from './avisos.js';
import { fechaHoraCO } from './fechas-colombia.js';
import { normalizarMarca, stripPy } from './marca-empresa.js';
import { largoTexto } from './chatter.js';
import { TIPOS_DOCUMENTO } from './documento-comercial.js';

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
 * - titulo: un encabezado corto. Nunca es el mensaje del servidor.
 * - mensaje: el párrafo por defecto, si el servidor no manda uno. Es la frase COMPLETA, la misma convención de
 *   MENSAJES_ENLACE (backend/app/core/documento_cliente.py), así que el párrafo puede repetir el título; las partes que
 *   el frontend no conoce ({fecha}, {asesor}) se omiten.
 * - {documento} se cambia por 'solicitud', 'cotización' o 'pedido'. Si no se sabe el tipo, se usan tituloSinTipo y
 *   mensajeSinTipo.
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
 *   empresa: import('./marca-empresa.js').MarcaEmpresa, documento: any, cot_numero: string | null,
 *   vence_at: string | null, confirmada_el: string | null, confirmadaElTexto: string, siguiente_paso: any,
 *   comentario: string | null, puedeActuar: boolean, reintentar: boolean, recienConfirmada: boolean
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

// El nombre del documento dentro de un mensaje del servidor ('Tu asesor actualizó esta cotización…'), como palabra.
const NOMBRE_EN_MENSAJE = /(?:^|[^\p{L}])(solicitud|cotización|pedido)(?![\p{L}])/iu;

/**
 * Cómo se nombra el documento en los textos: por su tipo o el prefijo de su número; si no viene (el backend solo manda
 * detail.documento en 'vencido' y 'confirmada'), por la palabra que trae el mensaje del servidor; si no, null.
 */
function nombreDe(documento, mensaje) {
  const tipo = tipoDe(documento);
  if (tipo) return TIPOS_DOCUMENTO[/** @type {'SC'|'COT'|'PVEN'} */ (tipo)].nombre;
  const m = NOMBRE_EN_MENSAJE.exec(mensaje ?? '');
  return m ? m[1].toLowerCase() : null;
}

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
 * Título y mensaje: titulo es un encabezado corto de TEXTOS_ENLACE ({documento} con el nombre del documento, o del
 * mensaje del servidor si el detail no trae documento) y nunca es el mensaje del servidor; mensaje es la frase completa
 * del servidor (o la de TEXTOS_ENLACE), así que el cuerpo puede repetir el título; T15 lo pinta como encabezado +
 * párrafo.
 * confirmadaElTexto = fechaHoraCO(confirmada_el) (RP26: 'sábado 3 de octubre, 3:15 p. m.'). empresa = normalizarMarca
 * (la marca vacía si no viene: nunca 'Nebulae').
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
