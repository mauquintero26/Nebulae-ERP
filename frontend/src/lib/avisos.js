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

const textoServidor = (status) =>
  typeof status === 'number' && status > 0
    ? `El servidor respondió con un error (${status}). Intenta de nuevo.`
    : MENSAJE_GENERICO;

/** Textos en ingles o tecnicos que el servidor manda tal cual y tienen una frase propia. */
function traducirTexto(texto, status) {
  const limpio = texto.trim();
  if (FORMATO_VALIDACION_VIEJO.test(limpio)) return MENSAJE_DATOS_INVALIDOS;
  if (limpio === 'Internal Server Error') return textoServidor(typeof status === 'number' ? status : 500);
  if (limpio === 'Not Found') return `No se encontró el registro (${typeof status === 'number' ? status : 404}).`;
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
 * - Un texto no vacio se devuelve tal cual (salvo los tecnicos: 'Not Found', 'Internal Server Error' y el formato
 *   viejo de validacion).
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
 * documento en silencio. Un 400 o un 409 (cambio en otra pantalla: ya tiene cotizacion, se confirmo, se cancelo…) o un
 * error sin status (la red se corto y la operacion pudo hacerse igual; tambien null o undefined). Un 401
 * (SesionVencidaError), 403, 404, 422 o 500 no recargan. La usan los detalles de la SC, la COT y el PVEN (B2-T8A, una
 * sola regla desde B2-T9A ronda 1).
 * @param {unknown} err
 * @returns {boolean}
 */
export function recargarTrasError(err) {
  const status = /** @type {{ status?: unknown } | null | undefined} */ (err)?.status;
  return status === 400 || status === 409 || status === undefined || status === null;
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
