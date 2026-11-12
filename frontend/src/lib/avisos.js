/**
 * Textos de los avisos del sistema (H49, Bloque 2). JS puro sin dependencias ni imports '@/': lo importan
 * api.ts (apiFetch, con ruta relativa './avisos.js'), components/ui/Avisos.tsx y las pruebas de node
 * (tests/test_avisos.mjs y tests/test_apifetch_401.mjs).
 *
 * - textoDeDetalle traduce lo que manda el servidor (texto, lista de errores de validacion de pydantic, objeto con
 *   mensaje/message/detail) a una frase en español. Nunca devuelve '[object Object]' ni el texto tecnico de FastAPI.
 * - errorDeRespuesta arma el Error que lanza apiFetch: message legible, .status (HTTP) y .detail (el detail del
 *   cuerpo tal cual, p. ej. {codigo: 'ANULA_CONFIRMACION', mensaje, cambios} en el 409 de re-cotizar).
 * - textoDeError arma el texto de un aviso a partir de cualquier error atrapado en un catch.
 */

export const MENSAJE_SIN_CONEXION = 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.';
export const MENSAJE_GENERICO = 'Ocurrió un error inesperado. Intenta de nuevo.';
/** El mismo texto que pone backend/main.py (validation_exception_handler) en `message`. */
export const MENSAJE_DATOS_INVALIDOS = 'Los datos enviados no son válidos. Revisa el formulario e intenta de nuevo.';
/** Revisión final (F2): lo que se muestra en lugar del 403 técnico de require_roles. */
export const MENSAJE_SIN_PERMISO = 'No tienes permiso para esta acción.';

/** Nombre visible de los campos que llegan en `loc` de un error de validacion. */
export const ETIQUETAS_CAMPO = {
  razon: 'Motivo',
  motivo: 'Motivo',
  cancellation_reason: 'Motivo de la cancelación',
  referencia: 'Referencia',
  monto: 'Monto',
  metodo_pago: 'Método de pago',
  fecha_pago: 'Fecha del pago',
  customer_name: 'Cliente',
  first_name: 'Nombre',
  name: 'Nombre',
  email: 'Correo',
  phone: 'Teléfono',
};

// str(RequestValidationError) de FastAPI ('1 validation error:\n  {...}\n  File "...py", line N'): el formato que
// mandaba main.py antes de T1A. Trae rutas del servidor y lo que escribio el usuario: nunca se muestra.
const FORMATO_VALIDACION_VIEJO = /^\d+ validation errors?:/;
const SIN_CONEXION = /Failed to fetch|NetworkError|Load failed/i;
// El 403 de require_roles ("Rol 'X' (normalizado: 'Y') no autorizado…", backend/app/api/dependencies.py) y los 403 en
// inglés de FastAPI no son un texto para el usuario. Revisión final (F2): una sola copia del patrón (el Chatter la usa).
const DETALLE_403_TECNICO = /^(?:Rol '[^']*' \(normalizado:|Not authenticated|Not enough permissions|Forbidden)/i;

/**
 * Revisión final (F2): true si el texto es el 403 técnico de require_roles (o uno de FastAPI en inglés); false con
 * cualquier otro texto o con algo que no es texto.
 * @param {unknown} texto
 * @returns {boolean}
 */
export function esDetalle403Tecnico(texto) {
  return typeof texto === 'string' && DETALLE_403_TECNICO.test(texto.trim());
}

const textoServidor = (status) =>
  typeof status === 'number' && status > 0
    ? `El servidor respondió con un error (${status}). Intenta de nuevo.`
    : MENSAJE_GENERICO;

// Revisión final del Bloque 3 (F2, M45): las frases en inglés que Starlette pone por defecto en el detail de un error
// (un 405 por una ruta o un API_URL mal configurados, un 502 del proxy…). Se dicen como «el servidor respondió con un
// error (N)», también en la página pública del cliente (confirmacion-publica.js usa errorDeRespuesta).
const FRASES_STARLETTE = new Set(['Bad Request', 'Unauthorized', 'Method Not Allowed', 'Not Acceptable', 'Conflict',
  'Unsupported Media Type', 'Unprocessable Entity', 'Too Many Requests', 'Bad Gateway', 'Service Unavailable',
  'Gateway Timeout']);

/** Textos en ingles o tecnicos que el servidor manda tal cual y tienen una frase propia. */
function traducirTexto(texto, status) {
  const limpio = texto.trim();
  if (FORMATO_VALIDACION_VIEJO.test(limpio)) return MENSAJE_DATOS_INVALIDOS;
  // Revisión final (F2): solo ese patrón y solo en un 403; un 403 con otro texto legible se queda como está.
  if (status === 403 && esDetalle403Tecnico(limpio)) return MENSAJE_SIN_PERMISO;
  if (limpio === 'Internal Server Error') return textoServidor(typeof status === 'number' ? status : 500);
  if (limpio === 'Not Found') return `No se encontró el registro (${typeof status === 'number' ? status : 404}).`;
  if (FRASES_STARLETTE.has(limpio)) return textoServidor(status);
  return texto;
}

const mayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
const conCampo = (campo, texto) => (campo ? `${campo}: ${texto}` : mayuscula(texto));

// Raices de `loc` de FastAPI: cuando son el unico texto de loc (p. ej. ['body'] = falta todo el cuerpo) no son un campo.
const RAICES_LOC = new Set(['body', 'query', 'path', 'header', 'cookie']);

/** Nombre crudo del campo (ultimo texto de loc, '' si solo hay una raiz) y su etiqueta visible. */
function campoDeLoc(loc) {
  const textos = (Array.isArray(loc) ? loc : []).filter((parte) => typeof parte === 'string');
  const crudo = textos.length ? textos[textos.length - 1] : '';
  if (textos.length === 1 && RAICES_LOC.has(crudo)) return { crudo: '', campo: '' };
  // Object.hasOwn y no ETIQUETAS_CAMPO[crudo] ?? crudo: 'constructor' o 'toString' devolverian la funcion del prototipo.
  return { crudo, campo: Object.hasOwn(ETIQUETAS_CAMPO, crudo) ? ETIQUETAS_CAMPO[crudo] : crudo };
}

/** Frase de un limite de ctx, solo si es un numero (si no, se usa msg). */
const conLimite = (campo, valor, frase) => (typeof valor === 'number' ? conCampo(campo, frase(valor)) : null);

/** Un error de validacion ({type, loc, msg, ctx}) en una frase. */
function textoDeErrorDeValidacion(error) {
  if (typeof error === 'string') return error.trim();
  if (!error || typeof error !== 'object') return '';
  const { crudo, campo } = campoDeLoc(error.loc);
  const ctx = error.ctx && typeof error.ctx === 'object' ? error.ctx : {};
  const msg = typeof error.msg === 'string' ? error.msg.replace(/^Value error,\s*/, '').trim() : '';
  let frase = null;
  switch (error.type) {
    case 'json_invalid':
      return MENSAJE_DATOS_INVALIDOS;
    case 'missing':
      return campo ? `Falta el dato «${campo}».` : 'Falta un dato obligatorio.';
    case 'string_too_short':
      frase = conLimite(campo, ctx.min_length, (n) => `debe tener al menos ${n} caracteres.`);
      break;
    case 'string_too_long':
      frase = conLimite(campo, ctx.max_length, (n) => `máximo ${n} caracteres.`);
      break;
    case 'greater_than':
      frase = conLimite(campo, ctx.gt, (n) => `debe ser mayor que ${n}.`);
      break;
    case 'greater_than_equal':
      frase = conLimite(campo, ctx.ge, (n) => `debe ser mayor o igual a ${n}.`);
      break;
    case 'less_than':
      frase = conLimite(campo, ctx.lt, (n) => `debe ser menor que ${n}.`);
      break;
    case 'less_than_equal':
      frase = conLimite(campo, ctx.le, (n) => `debe ser menor o igual a ${n}.`);
      break;
    case 'int_parsing':
    case 'float_parsing':
      frase = conCampo(campo, 'debe ser un número.');
      break;
    case 'literal_error':
    case 'enum':
      frase = conCampo(campo, 'valor no permitido.');
      break;
    default:
      break;
  }
  if (frase) return frase;
  if (!msg) return campo ? `${campo}: dato no válido.` : '';
  if (!campo) return msg; // C3/R10: una lista sin loc da los msg tal cual ([{msg:'a'},{msg:'b'}] -> 'a b').
  // Sin repetir el campo cuando el texto ya empieza por el ('tipo debe ser uno de: …' -> 'Tipo debe ser uno de: …').
  const minusculas = msg.toLowerCase();
  if ([crudo, campo].some((nombre) => nombre && minusculas.startsWith(nombre.toLowerCase()))) return mayuscula(msg);
  return `${campo}: ${msg}`;
}

/**
 * Frase para el `detail` (o `message`) de una respuesta de error.
 * - Un texto no vacio se devuelve tal cual (salvo los tecnicos: 'Not Found', 'Internal Server Error', el formato
 *   viejo de validacion y, en un 403, el de require_roles -> MENSAJE_SIN_PERMISO).
 * - Una lista de errores de validacion se traduce error por error y las frases se unen con un espacio.
 * - Un objeto con mensaje, message o detail devuelve ese texto.
 * - Si no hay nada: 'El servidor respondió con un error (status). Intenta de nuevo.'
 */
export function textoDeDetalle(detail, status) {
  if (typeof detail === 'string') {
    if (detail.trim()) return traducirTexto(detail, status);
  } else if (Array.isArray(detail)) {
    const textos = detail.map(textoDeErrorDeValidacion).filter(Boolean);
    if (textos.length) return textos.join(' ');
  } else if (detail && typeof detail === 'object') {
    if (typeof detail.mensaje === 'string' && detail.mensaje.trim()) return detail.mensaje;
    if (detail.message != null) return textoDeDetalle(detail.message, status);
    if (detail.detail != null) return textoDeDetalle(detail.detail, status);
  }
  return textoServidor(status);
}

/**
 * El Error que lanza apiFetch ante una respuesta que no es 2xx (ni 401).
 * message: con `errores` (el 400 de validacion de backend/main.py) sale de esa lista; si no, de detail o message.
 * @param {number} status
 * @param {any} body cuerpo JSON de la respuesta ({} si no era JSON)
 * @returns {Error & { status: number, detail: any }}
 */
export function errorDeRespuesta(status, body) {
  const errores = body?.errores;
  const mensaje = Array.isArray(errores) && errores.length
    ? textoDeDetalle(errores, status)
    : textoDeDetalle(body?.detail ?? body?.message, status);
  const error = /** @type {Error & { status: number, detail: any }} */ (new Error(mensaje));
  error.status = status;
  error.detail = body?.detail ?? null;
  return error;
}

/**
 * Despues de una accion que fallo (guardar, re-cotizar, cambiar estado, enviar…): true si conviene recargar el
 * documento en silencio. Un 400 o un 409 (cambio en otra pantalla: ya tiene cotizacion, se confirmo, se cancelo…), un 422
 * o un error sin status (la red se corto y la operacion pudo hacerse igual; tambien null o undefined). Un 401
 * (SesionVencidaError), 403, 404 o 500 no recargan. La usan los detalles de la SC, la COT y el PVEN (B2-T8A, una
 * sola regla desde B2-T9A ronda 1) y los tableros.
 * B4 T24 (F8, ruling del controlador): el 422 cuenta SIN mirar el detail. El 422 de transición del PATCH de estado
 * (_validar_transicion_pedido de erp_ventas.py) es el conflicto real del tablero de pedidos (el 409 solo sale con productos):
 * recargar el origen y el destino no hace daño y es más robusto que comparar textos.
 * @param {unknown} err
 * @returns {boolean}
 */
export function recargarTrasError(err) {
  const status = /** @type {{ status?: unknown } | null | undefined} */ (err)?.status;
  return status === 400 || status === 409 || status === 422 || status === undefined || status === null;
}

/**
 * B4 T24 f2 r1 (m28): la ruta de un cambio desde un tablero (el arrastre del Hub, de Cotizaciones y de los tableros de pedidos,
 * accionesTableroPedidos): corre `cambio` (el PATCH) y después `recargar` (lo que la pantalla recarga: las pestañas, la franja…). Si
 * falla, recarga solo con la regla de recargarTrasError (400, 409, 422 o la red cortada) y el MISMO error sigue (el tablero deshace la
 * tarjeta y recarga su origen y su destino: D39, por eso aquí no se toca el tablero).
 * @param {() => Promise<unknown>} cambio
 * @param {() => void} recargar
 * @returns {Promise<void>}
 */
export async function cambiarConRegla(cambio, recargar) {
  try {
    await cambio();
  } catch (err) {
    if (recargarTrasError(err)) recargar();
    throw err;
  }
  recargar();
}

/**
 * B3 T16 r1: un 422 (el dato no es valido: el servidor dice cual). Esos errores van en linea, junto al campo o al
 * boton; los demas (sin permiso, sin conexion, 500…) van con avisarError.
 * @param {unknown} err
 * @returns {boolean}
 */
export function esErrorDeValidacion(err) {
  return /** @type {{ status?: unknown } | null | undefined} */ (err)?.status === 422;
}

/**
 * Texto de un aviso para un error atrapado (Error, string u otra cosa).
 * Sin conexion -> MENSAJE_SIN_CONEXION; vacio o '[object Object]' -> MENSAJE_GENERICO. Con prefijo:
 * 'No se pudo X: <texto>' (sin repetir el prefijo si el texto ya empieza por el).
 * @param {unknown} err
 * @param {string} [prefijo]
 */
export function textoDeError(err, prefijo) {
  const crudo = typeof err === 'string' ? err : typeof err?.message === 'string' ? err.message : '';
  let msg = crudo.replace(/^(?:Error:\s*)+/, '').trim();
  if (SIN_CONEXION.test(msg)) msg = MENSAJE_SIN_CONEXION;
  else if (!msg || msg.includes('[object Object]')) msg = MENSAJE_GENERICO;
  else msg = traducirTexto(msg, typeof err?.status === 'number' ? err.status : undefined);
  if (!prefijo || msg.startsWith(prefijo)) return msg;
  return `${prefijo}: ${msg}`;
}

/**
 * Tono de un aviso: 'ok' | 'error' | 'info'. Sin tono, 'ok'. 'err' (el tipo de los toasts viejos de
 * solicitud-client) es 'error'. Uno desconocido cae en 'info' (no en el verde de éxito) y deja un console.warn.
 * @param {unknown} tono
 * @returns {'ok' | 'error' | 'info'}
 */
export function normalizarTono(tono) {
  if (tono === undefined || tono === null) return 'ok';
  if (tono === 'ok' || tono === 'error' || tono === 'info') return tono;
  if (tono === 'err') return 'error';
  console.warn(`Aviso con tono desconocido: ${JSON.stringify(tono)}; se muestra como 'info'.`);
  return 'info';
}

/** Milisegundos que se ve un aviso: 4 s los de exito e informacion; los de error, de 7 a 15 s segun el largo. */
export function duracionAviso(tono, texto) {
  if (tono !== 'error') return 4000;
  const largo = typeof texto === 'string' ? texto.length : 0;
  return Math.min(15000, Math.max(7000, 60 * largo));
}

/**
 * Lista nueva con `aviso` al final. Uno con el mismo texto y tono se reemplaza (no se duplica) y se conservan solo
 * los ultimos `max`.
 */
export function agregarAviso(lista, aviso, max = 3) {
  const otros = lista.filter((a) => !(a.texto === aviso.texto && a.tono === aviso.tono));
  return [...otros, aviso].slice(-max);
}

/**
 * B4 T23A r1 (I1, I2): el aviso de una fuente de una pantalla que falló (indicadores, carritos…): un 403 es un tema de permiso
 * (MENSAJE_SIN_PERMISO_FUENTE, sin «Reintentar»: volver a pedir no lo cambia, y nunca el 403 técnico de require_roles); cualquier
 * otro error es una falla con el detalle del servidor (textoDeError) y «Reintentar». Sin error, null.
 * @param {unknown} error
 * @param {string} fallo  el texto de la falla («No se pudieron cargar los indicadores»)
 * @returns {{tipo: 'permiso' | 'carga', texto: string, reintentar: boolean} | null}
 */
export function avisoDeFuente(error, fallo) {
  if (!error) return null;
  // r1 (m10, m34): la regla del 403 vive en ofreceReintentar (una sola copia).
  if (!ofreceReintentar(error)) return { tipo: 'permiso', texto: MENSAJE_SIN_PERMISO_FUENTE, reintentar: false };
  // B4 T24 (F46): el texto de la falla con su punto final (textoAvisoFuente), el mismo del Dashboard.
  return { tipo: 'carga', texto: /** @type {string} */ (textoAvisoFuente(error, fallo)), reintentar: true };
}

/**
 * B4 T22 r1 (m6): el aviso de una fuente caída, 'No se pudieron cargar las existencias: Error del servidor.', con un solo
 * punto al final aunque el mensaje ya lo traiga. Sin error, null.
 * @param {unknown} error
 * @param {string} texto
 * @returns {string | null}
 */
export function textoAvisoFuente(error, texto) {
  if (!error) return null;
  const mensaje = textoDeError(error, texto);
  return mensaje.endsWith('.') ? mensaje : `${mensaje}.`;
}

/** El aviso de un 403 al leer una fuente de una pantalla. */
export const MENSAJE_SIN_PERMISO_FUENTE = 'No tienes permiso para ver esto.';

/**
 * B4 T24 (FINAL-m37, FINAL-C5 y F106): si una carga que falló ofrece «Reintentar». Un 403 no: es un tema de permiso y volver a pedir no
 * lo cambia. Cualquier otro error sí (también uno sin status: la red). Sin error, no hay nada que reintentar. avisoDeFuente la usa (r1,
 * m10 y m34: la regla escrita una vez), y también quien no pinta un aviso de fuente: TablaEstandar, las columnas del tablero,
 * SelectorCatalogo y las cajas de error de las pantallas.
 * @param {unknown} error
 * @returns {boolean}
 */
export function ofreceReintentar(error) {
  if (!error) return false;
  return /** @type {{status?: unknown}} */ (error).status !== 403;
}

/**
 * B4 T23B r1 (I2): el motivo de permiso de una fuente (el texto de avisoDeFuente cuando es un 403) o null: lo que la tarjeta dice en su
 * ayuda cuando muestra «—». Una sola copia para Seguimientos, Marketing y E-Commerce.
 * @param {{tipo: string, texto: string} | null | undefined} aviso
 * @returns {string | null}
 */
export function motivoSinPermiso(aviso) {
  return aviso?.tipo === 'permiso' ? aviso.texto : null;
}

/**
 * B4 T23B r1 (I2): el estado de la franja de tarjetas de una fuente: con un 403 queda 'listo' («—» con el motivo en cada tarjeta, sin
 * el «No se pudo cargar» de una falla); en otro caso, el estado que traía (estadoKpi).
 * @template {string} T
 * @param {{tipo: string} | null | undefined} aviso
 * @param {T} estado
 * @returns {T | 'listo'}
 */
export function estadoFranjaDeFuente(aviso, estado) {
  return aviso?.tipo === 'permiso' ? 'listo' : estado;
}

/**
 * B4 T24 f3 r2 (m36 completo, ruling): adónde va el foco cuando cambia el aviso de una fuente que se reintenta. `teniaFoco`: el botón
 * «Reintentar» tenía el foco; `hayBoton`: el aviso nuevo sigue ofreciendo el botón (mientras reintenta, «Reintentando…», o con otro
 * error). Con el botón, el foco se queda en él ('boton'); sin él (el reintento salió bien y el aviso se va, o un 403 sin «Reintentar»),
 * va a un destino VISIBLE ('destino': r3, el ruling de la duda 4 — la franja de tarjetas de la pantalla, con tabindex=-1): nunca al <body>.
 * Si el botón no tenía el foco, nada (null).
 * @param {{teniaFoco: boolean, hayBoton: boolean}} entrada
 * @returns {'boton' | 'destino' | null}
 */
export function focoTrasReintento({ teniaFoco, hayBoton }) {
  if (!teniaFoco) return null;
  return hayBoton ? 'boton' : 'destino';
}

/**
 * B4 T24 f3 r3 (C1 = C3, ruling): QUÉ error muestra el aviso de una fuente. `error` es el de la carga de ahora (useResumen lo limpia al
 * reintentar; estadoReintento lo conserva), `ultimo` el último que se vio y `reintentando` si va un reintento. Mientras se reintenta, el
 * último sigue a la vista («Reintentando…»); si no hay error y no se reintenta (el reintento salió bien, o una recarga normal), nada, y
 * `olvidar` pide limpiar el último: si no, la recarga siguiente volvía a pintar el error viejo con role=alert. Un 403 se ve como su
 * error (el aviso de permiso, sin «Reintentar»).
 * @param {{error: unknown, ultimo: unknown, reintentando: boolean}} entrada
 * @returns {{visto: unknown, olvidar: boolean}}
 */
export function avisoVisible({ error, ultimo, reintentando }) {
  if (error != null) return { visto: error, olvidar: false };
  if (reintentando && ultimo != null) return { visto: ultimo, olvidar: false };
  return { visto: null, olvidar: ultimo != null };
}
