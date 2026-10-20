/**
 * Marca de la empresa en el frontend (Bloque 3, T12: MARCA punto 5, C1, RP19, RP21). JS plano, sin fetch ni DOM al
 * importarlo, para probarlo con node (frontend/tests/test_marca_empresa.mjs) y para que T13 lo corra desde el backend
 * (test_paridad_bloque3 compara validarCampoEmpresa con empresa.validar_cambios).
 *
 * - La forma de la marca es la de perfil_publico (backend/app/core/empresa.py), lo que devuelve GET
 *   /api/v1/publico/empresa: identidad y contacto, colores {principal, secundario, acento}, logo_url (relativa al API)
 *   y configurada. Nunca términos ni datos para pagar: esos viajan dentro del documento con token (R8).
 * - cargarMarcaEmpresa la pide sin el token de sesión, sin cookies y sin Referer (la URL de la página lleva el token), con
 *   la URL del API que recibe (lib/api.ts), y nunca lanza.
 * - validarCampoEmpresa es el espejo de empresa.validar_cambios: los mismos pasos (texto -> normalizar -> regla del
 *   campo -> máximo) y los mismos textos (MENSAJE_*). Python cuenta code points y su strip() usa sus propios
 *   espacios: aquí también.
 */

import { numeroWhatsApp } from './whatsapp.js';
import { largoTexto } from './chatter.js';

/** Colores de las referencias aprobadas: degradado morado -> rojo de la SC y acento naranja de la COT y el PVEN. */
export const COLORES_POR_DEFECTO = Object.freeze({ principal: '#7C3AED', secundario: '#E11D48', acento: '#C2410C' });

const CAMPOS_IDENTIDAD = Object.freeze(['nombre_comercial', 'razon_social', 'nit', 'direccion', 'ciudad', 'telefono',
  'whatsapp', 'correo', 'sitio_web']);
const NOMBRES_COLOR = Object.freeze({ principal: 'color_principal', secundario: 'color_secundario', acento: 'color_acento' });

/**
 * @typedef {{
 *   nombre_comercial: string, razon_social: string, nit: string, direccion: string, ciudad: string, telefono: string,
 *   whatsapp: string, correo: string, sitio_web: string,
 *   colores: { principal: string, secundario: string, acento: string },
 *   logo_url: string | null, configurada: boolean
 * }} MarcaEmpresa
 */

/**
 * La marca sin nada configurado: textos vacíos, los colores de las referencias, sin logo. Nunca 'Nebulae' ni un dato
 * de ejemplo. Inmutable.
 * @type {Readonly<MarcaEmpresa>}
 */
export const MARCA_VACIA = Object.freeze({
  nombre_comercial: '', razon_social: '', nit: '', direccion: '', ciudad: '', telefono: '', whatsapp: '', correo: '',
  sitio_web: '', colores: COLORES_POR_DEFECTO, logo_url: null, configurada: false,
});

// ─── Reglas del backend, copiadas (empresa.py, clientes.py, telefonos.py) ─────────────────────────────────────────

// Los espacios de str.isspace() / \s de Python 3 (verificado con Python 3.14): JS no trata \x1c-\x1f ni \x85 como
// espacio y sí \ufeff, así que se usa esta lista en lugar de trim() y \s.
const ESPACIOS_PY = '\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const BORDES_PY = new RegExp(`^[${ESPACIOS_PY}]+|[${ESPACIOS_PY}]+$`, 'g');
const HAY_ESPACIO_PY = new RegExp(`[${ESPACIOS_PY}]`);

/**
 * str.strip() de Python: quita de los bordes sus espacios (ESPACIOS_PY), no los de trim(). Es la ÚNICA copia de esta
 * regla en el frontend del bloque: confirmacion-publica.js la importa. El largo en code points (len() de Python) es
 * largoTexto de chatter.js.
 * @param {string} texto
 * @returns {string}
 */
export const stripPy = (texto) => texto.replace(BORDES_PY, '');

/** clientes.CORREO_VALIDO con el \s de Python. */
const CORREO_VALIDO = new RegExp(`^[^@${ESPACIOS_PY}]+@[^@${ESPACIOS_PY}]+\\.[^@${ESPACIOS_PY}]+$`);

/**
 * clientes.correo_valido: un texto que, sin los espacios de los bordes, es algo@algo.algo (sin espacios ni otra @).
 * @param {unknown} texto
 * @returns {boolean}
 */
export function correoValido(texto) {
  return typeof texto === 'string' && CORREO_VALIDO.test(stripPy(texto));
}

const MENSAJE_CAMPO_DESCONOCIDO = (campo) => `Campo desconocido: ${campo}.`;
const MENSAJE_MAXIMO = (etiqueta, n) => `${etiqueta}: máximo ${n} caracteres.`;
const MENSAJE_NO_ES_TEXTO = (etiqueta) => `${etiqueta}: debe ser un texto.`;
const MENSAJE_NIT = 'NIT no válido: usa solo números, puntos y guion (por ejemplo 900.123.456-7).';
// empresa.MENSAJE_TELEFONO llenado con clientes.TELEFONO_MIN_DIGITOS (7) y empresa.TELEFONO_MAX_DIGITOS (15).
const TELEFONO_MIN_DIGITOS = 7;
const TELEFONO_MAX_DIGITOS = 15;
const MENSAJE_TELEFONO = `Teléfono no válido: escribe entre ${TELEFONO_MIN_DIGITOS} y ${TELEFONO_MAX_DIGITOS} dígitos.`;
const MENSAJE_WHATSAPP = 'WhatsApp no válido: escribe el celular de 10 dígitos o el número completo con su indicativo '
  + '(por ejemplo +57 300 123 4567).';
const MENSAJE_CORREO = 'Correo de la empresa no válido.';
const MENSAJE_URL = 'La página web debe empezar por http:// o https://.';
const MENSAJE_COLOR = 'Color no válido: usa el formato #RRGGBB.';
const MENSAJE_LOGO_TIPO = 'El logo debe ser una imagen PNG, JPG o WebP.';
const MENSAJE_LOGO_PESO = (kb) => `El logo pesa ${kb} KB; el máximo es 300 KB.`;

const NIT = /^[0-9][0-9.\- ]{4,29}$/;
const TELEFONO = /^[0-9+() -]+$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;
// Un esquema al inicio ('javascript:', 'data:', 'ftp:'...); 'example.com:8080' no lo es (después de ':' va un puerto).
const ESQUEMA = /^[A-Za-z][A-Za-z0-9+.-]*:(?!\d)/;
// empresa._SALTOS_Y_CONTROL y _CONTROL_EN_TEXTO.
const SALTOS_Y_CONTROL = /[\x00-\x1f\x7f\x85\u2028\u2029]+/g;
const CONTROL_EN_TEXTO = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/** empresa.limpiar_linea: cada tramo de saltos o controles pasa a UN espacio, sin espacios en los bordes. */
const limpiarLinea = (texto) => stripPy(texto.replace(SALTOS_Y_CONTROL, ' '));
/** empresa._normalizar_texto: \r\n y \r -> \n, sin controles (salvo \n y \t), sin espacios en los bordes. */
const normalizarTexto = (texto) => stripPy(texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(CONTROL_EN_TEXTO, ''));

const fallo = (mensaje) => {
  throw new Error(mensaje);
};

/** telefonos.e164_whatsapp: 11 a 15 dígitos normalizados, sin 0 inicial y, con indicativo 57, exactamente 12. */
function esWhatsappE164(texto) {
  const n = numeroWhatsApp(texto);
  if (n === null || n.length < 11 || n.length > 15 || n.startsWith('0')) return false;
  return !(n.startsWith('57') && n.length !== 12);
}

/** IPv4Address de Python: 4 octetos decimales ASCII, sin ceros a la izquierda, de 0 a 255. */
function esIPv4(texto) {
  const octetos = texto.split('.');
  return octetos.length === 4
    && octetos.every((o) => /^[0-9]{1,3}$/.test(o) && (o === '0' || o[0] !== '0') && Number(o) <= 255);
}

/** IPv6Address de Python (con zona '%x' y un IPv4 al final), como ipaddress._ip_int_from_string. */
function esIPv6(texto) {
  const [direccion, ...zona] = texto.split('%');
  if (zona.length > 1 || (zona.length === 1 && !zona[0])) return false;
  const partes = direccion.split(':');
  if (partes.length < 3) return false;
  if (partes[partes.length - 1].includes('.')) {
    if (!esIPv4(partes.pop())) return false;
    partes.push('0', '0');
  }
  if (partes.length > 9) return false;
  let salto = null;
  for (let i = 1; i < partes.length - 1; i += 1) {
    if (!partes[i]) {
      if (salto !== null) return false;
      salto = i;
    }
  }
  let altas;
  let bajas;
  if (salto !== null) {
    altas = salto;
    bajas = partes.length - salto - 1;
    if (!partes[0]) {
      altas -= 1;
      if (altas) return false;
    }
    if (!partes[partes.length - 1]) {
      bajas -= 1;
      if (bajas) return false;
    }
    if (8 - (altas + bajas) < 1) return false;
  } else {
    if (partes.length !== 8 || !partes[0] || !partes[partes.length - 1]) return false;
    altas = partes.length;
    bajas = 0;
  }
  const usadas = [...partes.slice(0, altas), ...(bajas ? partes.slice(-bajas) : [])];
  return usadas.every((h) => /^[0-9A-Fa-f]{1,4}$/.test(h));
}

/** urllib.parse._check_bracketed_netloc / _check_bracketed_host: true si urlparse lanzaría. */
function corchetesInvalidos(netloc) {
  const hostYPuerto = netloc.slice(netloc.lastIndexOf('@') + 1);
  const abre = hostYPuerto.indexOf('[');
  let host;
  if (abre >= 0) {
    if (abre > 0) return true; // nada antes del corchete
    const resto = hostYPuerto.slice(abre + 1);
    const cierra = resto.indexOf(']');
    host = cierra >= 0 ? resto.slice(0, cierra) : resto;
    const puerto = cierra >= 0 ? resto.slice(cierra + 1) : '';
    if (puerto && !puerto.startsWith(':')) return true;
  } else {
    const dosPuntos = hostYPuerto.indexOf(':');
    host = dosPuntos >= 0 ? hostYPuerto.slice(0, dosPuntos) : hostYPuerto;
  }
  if (host.startsWith('v')) return !/^v[a-fA-F0-9]+\..+$/.test(host);
  // Entre corchetes solo va un IPv6: un IPv4 ('[1.2.3.4]') tampoco pasa esIPv6.
  return !esIPv6(host);
}

/** urllib.parse._checknetloc: un netloc no ASCII que con NFKC gana '/', '?', '#', '@' o ':'. */
function netlocNfkcInvalido(netloc) {
  if (!netloc || /^[\x00-\x7f]*$/.test(netloc)) return false;
  const n = netloc.replace(/[@:#?]/g, '');
  const normalizado = n.normalize('NFKC');
  return n !== normalizado && /[/?#@:]/.test(normalizado);
}

/**
 * empresa._validar_url: solo http(s) con dominio; sin esquema recibe https:// (C1). B3 T20 (C1, C2, M16): sin '@' en el
 * netloc: 'https://mitienda.com@evil.com' (o 'https://@evil.com') lleva a evil.com desde el pie del correo y del PDF.
 */
function validarUrl(valor) {
  let url = valor;
  if (!/^https?:\/\//i.test(url)) {
    if (ESQUEMA.test(url)) fallo(MENSAJE_URL);
    url = `https://${url}`;
  }
  if (HAY_ESPACIO_PY.test(url)) fallo(MENSAJE_URL);
  const resto = url.slice(url.indexOf('//') + 2);
  const fin = resto.search(/[/?#]/);
  const netloc = fin >= 0 ? resto.slice(0, fin) : resto;
  if (netloc.includes('[') !== netloc.includes(']')) fallo(MENSAJE_URL);
  if (netloc.includes('[') && corchetesInvalidos(netloc)) fallo(MENSAJE_URL);
  if (netlocNfkcInvalido(netloc) || !netloc) fallo(MENSAJE_URL);
  if (netloc.includes('@')) fallo(MENSAJE_URL);
  return url;
}

const REGLAS = {
  nit: (v) => (NIT.test(v) ? v : fallo(MENSAJE_NIT)),
  telefono: (v) => {
    const digitos = v.replace(/[^0-9]/g, '').length;
    return TELEFONO.test(v) && digitos >= TELEFONO_MIN_DIGITOS && digitos <= TELEFONO_MAX_DIGITOS ? v : fallo(MENSAJE_TELEFONO);
  },
  whatsapp: (v) => (TELEFONO.test(v) && esWhatsappE164(v) ? v : fallo(MENSAJE_WHATSAPP)),
  correo: (v) => (correoValido(v) ? v : fallo(MENSAJE_CORREO)),
  url: validarUrl,
  hex: (v) => (HEX.test(v) ? v.toUpperCase() : fallo(MENSAJE_COLOR)),
};

const campo = (etiqueta, maximo, regla = null, largo = false) => ({ etiqueta, maximo, regla, largo });
// empresa.CAMPOS, en su orden (el del formulario y el historial).
const DEFINICIONES = {
  nombre_comercial: campo('Nombre comercial', 120),
  razon_social: campo('Razón social', 160),
  nit: campo('NIT', 30, REGLAS.nit),
  direccion: campo('Dirección', 200),
  ciudad: campo('Ciudad', 80),
  telefono: campo('Teléfono', 40, REGLAS.telefono),
  whatsapp: campo('WhatsApp', 40, REGLAS.whatsapp),
  correo: campo('Correo', 150, REGLAS.correo),
  sitio_web: campo('Página web', 200, REGLAS.url),
  color_principal: campo('Color principal', 7, REGLAS.hex),
  color_secundario: campo('Color secundario', 7, REGLAS.hex),
  color_acento: campo('Color de acento', 7, REGLAS.hex),
  terminos_cotizacion: campo('Términos de la cotización', 2000, null, true),
  terminos_pedido: campo('Términos del pedido', 2000, null, true),
  instrucciones_pago: campo('Datos para pagar', 1000, null, true),
  mensaje_pie: campo('Mensaje de pie', 200, null, true),
};

/**
 * Los campos que guarda PUT /empresa, en el orden de empresa.CAMPOS: {etiqueta, maximo, largo} (largo = texto de
 * varias líneas). Inmutable.
 * @type {Readonly<Record<string, Readonly<{etiqueta: string, maximo: number, largo: boolean}>>>}
 */
export const CAMPOS_EMPRESA = Object.freeze(Object.fromEntries(Object.entries(DEFINICIONES)
  .map(([nombre, d]) => [nombre, Object.freeze({ etiqueta: d.etiqueta, maximo: d.maximo, largo: d.largo })])));

const tiene = (objeto, clave) => Object.prototype.hasOwnProperty.call(objeto, clave);

/**
 * Valida un campo como empresa.validar_cambios({campo: valor}): {valor (el que se guardaría), error: null} o
 * {valor: null, error (el mensaje exacto del 422)}. '' o null borran el campo (valor ''). Pasos: 1) que el campo
 * exista; 2) que sea texto; 3) normalizar (una línea: limpiar_linea; texto largo: \r\n -> \n, sin controles salvo \n y
 * \t; los dos sin espacios en los bordes); 4) la regla del campo (sitio_web sin esquema gana https://, colores en
 * mayúsculas); 5) el máximo sobre lo que se guardaría, en code points.
 * @param {string} nombre
 * @param {unknown} valor
 * @returns {{valor: string | null, error: string | null}}
 */
export function validarCampoEmpresa(nombre, valor) {
  try {
    if (!tiene(DEFINICIONES, nombre)) fallo(MENSAJE_CAMPO_DESCONOCIDO(nombre));
    const { etiqueta, maximo, regla, largo } = DEFINICIONES[nombre];
    let texto = valor === null || valor === undefined ? '' : valor;
    if (typeof texto !== 'string') fallo(MENSAJE_NO_ES_TEXTO(etiqueta));
    texto = largo ? normalizarTexto(texto) : limpiarLinea(texto);
    if (texto && regla) texto = regla(texto);
    if (largoTexto(texto) > maximo) fallo(MENSAJE_MAXIMO(etiqueta, maximo));
    return { valor: texto, error: null };
  } catch (e) {
    return { valor: null, error: /** @type {Error} */ (e).message };
  }
}

/**
 * Lo que cambió en el formulario de la empresa: {campo: valor sin espacios en los bordes} de los campos de
 * CAMPOS_EMPRESA cuyo valor actual difiere del original (comparados con trim; null y undefined valen ''). Vaciar un
 * campo es un cambio. Las demás claves (puede_editar, logo_url...) no se mandan.
 * @param {any} original
 * @param {any} actual
 * @returns {Record<string, string>}
 */
export function cambiosDelFormulario(original, actual) {
  const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());
  /** @type {Record<string, string>} */
  const cambios = {};
  if (!actual || typeof actual !== 'object') return cambios;
  for (const nombre of Object.keys(DEFINICIONES)) {
    if (!tiene(actual, nombre)) continue;
    const nuevo = texto(actual[nombre]);
    if (nuevo !== texto(original?.[nombre])) cambios[nombre] = nuevo;
  }
  return cambios;
}

const TIPOS_LOGO = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
const LOGO_MAX_BYTES = 300 * 1024;

/**
 * El error del logo antes de leerlo (empresa.validar_logo: PNG, JPG o WebP de hasta 300 KB; SVG no), o null si sirve.
 * @param {{type?: string, size?: number} | null | undefined} archivo
 * @returns {string | null}
 */
export function validarArchivoLogo(archivo) {
  if (!archivo || !TIPOS_LOGO.includes(String(archivo.type).toLowerCase())) return MENSAJE_LOGO_TIPO;
  const size = Number(archivo.size);
  if (size > LOGO_MAX_BYTES) return MENSAJE_LOGO_PESO(Math.ceil(size / 1024));
  return null;
}

// ─── La marca para mostrar ──────────────────────────────────────────────────────────────────────────────────────

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const textoLimpio = (v) => (typeof v === 'string' ? v.trim() : '');
// r1: el logo solo puede ser la ruta pública del API (empresa._url_logo: '/publico/empresa/logo?v=' + sha256[:12]) o
// el data:image de la vista previa de Configuración (T14). Nunca una imagen de otro sitio (le revelaría la IP del
// cliente) ni otra ruta ('/../x', '/\evil.com', '//evil.com').
const LOGO_RUTA_PUBLICA = /^\/publico\/empresa\/logo(?:\?v=[A-Za-z0-9_-]+)?$/;
const LOGO_VISTA_PREVIA = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const logoPermitido = (logo) => LOGO_RUTA_PUBLICA.test(logo) || LOGO_VISTA_PREVIA.test(logo);

/**
 * La marca lista para mostrar, con la forma de MARCA_VACIA. Acepta la respuesta {status, data} de /publico/empresa,
 * el perfil directo (perfil_publico) o la forma plana de GET /empresa y del formulario (color_principal...). Lo que no
 * es texto queda ''; un color que no es #RRGGBB vuelve al de la referencia (nunca llega otra cosa a un style); el logo
 * solo si es la ruta pública /publico/empresa/logo?v=… o un data:image PNG/JPG/WebP (la vista previa). configurada =
 * hay nombre comercial, como empresa.leer_perfil. Solo la lista blanca: nunca términos ni otra clave.
 * @param {unknown} raw
 * @returns {MarcaEmpresa}
 */
export function normalizarMarca(raw) {
  if (!esObjeto(raw)) return MARCA_VACIA;
  const datos = tiene(raw, 'data') ? raw.data : raw;
  if (!esObjeto(datos)) return MARCA_VACIA;
  /** @type {Record<string, any>} */
  const marca = {};
  for (const nombre of CAMPOS_IDENTIDAD) marca[nombre] = textoLimpio(datos[nombre]);
  const colores = esObjeto(datos.colores) ? datos.colores : {};
  /** @type {Record<string, string>} */
  const finales = {};
  for (const [nombre, plano] of Object.entries(NOMBRES_COLOR)) {
    const valor = colores[nombre] ?? datos[plano];
    finales[nombre] = typeof valor === 'string' && HEX.test(valor) ? valor.toUpperCase()
      : COLORES_POR_DEFECTO[/** @type {'principal'|'secundario'|'acento'} */ (nombre)];
  }
  const logo = textoLimpio(datos.logo_url);
  return /** @type {MarcaEmpresa} */ ({
    ...marca,
    colores: /** @type {MarcaEmpresa['colores']} */ (finales),
    logo_url: logo && logoPermitido(logo) ? logo : null,
    configurada: Boolean(marca.nombre_comercial),
  });
}

/**
 * La marca de la empresa: GET {apiUrl}/publico/empresa sin el token de sesión, sin cookies, sin Referer y sin seguir
 * redirecciones (redirect 'error'). Ante cualquier error (red, redirección, respuesta no 2xx, JSON inválido o sin
 * fetch) devuelve MARCA_VACIA: nunca lanza.
 * @param {string} apiUrl la URL del API (API_URL de lib/api.ts)
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<MarcaEmpresa>}
 */
export async function cargarMarcaEmpresa(apiUrl, fetchImpl = globalThis.fetch) {
  try {
    if (typeof fetchImpl !== 'function') return MARCA_VACIA;
    const base = String(apiUrl ?? '').replace(/\/+$/, '');
    const respuesta = await fetchImpl(`${base}/publico/empresa`, {
      method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer',
      cache: 'no-store', redirect: 'error',
    });
    if (!respuesta || !respuesta.ok) return MARCA_VACIA;
    return normalizarMarca(await respuesta.json());
  } catch {
    return MARCA_VACIA;
  }
}

/**
 * La URL del logo: la ruta pública del API (/publico/empresa/logo?v=…) colgada de apiUrl, o el data:image de la vista
 * previa tal cual. Cualquier otra cosa (otra URL http(s), '/../x', '/\evil.com/x.png', '//evil.com'…) o sin logo, null
 * (se muestra el monograma).
 * @param {any} marca
 * @param {string} apiUrl
 * @returns {string | null}
 */
export function urlLogo(marca, apiUrl) {
  const logo = esObjeto(marca) ? textoLimpio(marca.logo_url) : '';
  if (LOGO_RUTA_PUBLICA.test(logo)) return `${String(apiUrl ?? '').replace(/\/+$/, '')}${logo}`;
  return LOGO_VISTA_PREVIA.test(logo) ? logo : null;
}

/**
 * Las iniciales del monograma (sin logo): la primera letra de las dos primeras palabras, en mayúsculas. '' sin nombre.
 * @param {unknown} nombre
 * @returns {string}
 */
export function inicialesMarca(nombre) {
  const palabras = textoLimpio(nombre).split(/\s+/).filter(Boolean);
  return palabras.slice(0, 2).map((p) => [...p][0].toUpperCase()).join('');
}

// ─── Los formularios de Configuración (T14: FormEmpresa y FormDocumentos) ───────────────────────────────────────

/**
 * Los campos de cada parte de Configuración, en el orden de empresa.CAMPOS: identidad y contacto («Información de la
 * empresa»), colores y textos de varias líneas («Diseño de documentos»). Inmutable.
 */
export const GRUPOS_CAMPOS_EMPRESA = Object.freeze({
  identidad: CAMPOS_IDENTIDAD,
  colores: Object.freeze(Object.values(NOMBRES_COLOR)),
  textos: Object.freeze(Object.keys(DEFINICIONES).filter((nombre) => DEFINICIONES[nombre].largo)),
});

/**
 * Cada color del documento: el campo de PUT /empresa, su nombre en la marca (marca.colores) y el color de la referencia
 * aprobada («Volver al color de la referencia»). Inmutable.
 * @type {ReadonlyArray<Readonly<{campo: string, nombre: 'principal' | 'secundario' | 'acento', referencia: string}>>}
 */
export const CAMPOS_COLOR = Object.freeze(Object.entries(NOMBRES_COLOR).map(([nombre, campo]) => Object.freeze({
  campo, nombre: /** @type {'principal' | 'secundario' | 'acento'} */ (nombre),
  referencia: COLORES_POR_DEFECTO[/** @type {'principal' | 'secundario' | 'acento'} */ (nombre)],
})));

const MENSAJE_RESPUESTA_INESPERADA = 'Respuesta inesperada del servidor.';

/**
 * El perfil (el .data) de una respuesta de GET o PUT /empresa y de PUT o DELETE /empresa/logo (T14 r1). Si no es un
 * objeto (un 200 sin cuerpo: apiFetch devuelve {} cuando no es JSON; data null, una lista…) LANZA
 * Error('Respuesta inesperada del servidor.'), para que la pantalla vaya por su rama de error y no tome un perfil vacío
 * (todo en blanco y en solo lectura).
 * @param {unknown} respuesta
 * @returns {Record<string, any>}
 */
export function perfilDeRespuesta(respuesta) {
  const datos = esObjeto(respuesta) ? respuesta.data : undefined;
  if (!esObjeto(datos)) throw new Error(MENSAJE_RESPUESTA_INESPERADA);
  return datos;
}

/**
 * Los valores iniciales de un formulario: {campo: texto} de `campos`, tomados del perfil de GET /empresa (su .data). Lo
 * que falta o no es texto queda ''. Solo esos campos: nada de puede_editar, logo_url u otros.
 * @param {unknown} perfil
 * @param {readonly string[]} campos
 * @returns {Record<string, string>}
 */
export function valoresDeCampos(perfil, campos) {
  const datos = esObjeto(perfil) ? perfil : {};
  return Object.fromEntries(campos.map((nombre) => {
    const valor = tiene(datos, nombre) ? datos[nombre] : '';
    return [nombre, typeof valor === 'string' ? valor : ''];
  }));
}

/**
 * Los errores de los campos que cambiaron, {campo: mensaje exacto del 422}, con validarCampoEmpresa: lo que se revisa
 * antes de mandar PUT /empresa (el servidor revisa igual y gana). Vaciar un campo no es un error. {} si todo sirve.
 * @param {unknown} cambios la salida de cambiosDelFormulario
 * @returns {Record<string, string>}
 */
export function erroresDeCambios(cambios) {
  /** @type {Record<string, string>} */
  const errores = {};
  if (!esObjeto(cambios)) return errores;
  for (const [nombre, valor] of Object.entries(cambios)) {
    const { error } = validarCampoEmpresa(nombre, valor);
    if (error) errores[nombre] = error;
  }
  return errores;
}

/**
 * La marca de la vista previa de «Diseño de documentos»: la identidad y el logo de la marca pública (lo que ve el
 * cliente, GET /publico/empresa, C26) con los colores del formulario todavía sin guardar. Cada color se lee como lo
 * guardaría el servidor (validarCampoEmpresa): vacío vuelve al de la referencia; uno que el servidor rechazaría (422)
 * deja el guardado. Solo los colores: los demás campos del formulario no entran.
 * @param {unknown} publica
 * @param {unknown} valores
 * @returns {MarcaEmpresa}
 */
export function marcaVistaPrevia(publica, valores) {
  const base = normalizarMarca(publica);
  const formulario = esObjeto(valores) ? valores : {};
  /** @type {Record<string, string>} */
  const colores = {};
  for (const { campo: nombreCampo, nombre, referencia } of CAMPOS_COLOR) {
    if (!tiene(formulario, nombreCampo)) {
      colores[nombre] = base.colores[nombre];
      continue;
    }
    const { valor, error } = validarCampoEmpresa(nombreCampo, formulario[nombreCampo]);
    colores[nombre] = error ? base.colores[nombre] : valor || referencia;
  }
  return normalizarMarca({ ...base, colores });
}

/** El aviso de la nota del controlador después de T9: pdf_documento descarta un logo de más de 4000 px por lado. */
export const LOGO_MAX_LADO_PDF = 4000;
const MENSAJE_LOGO_PDF = `El logo es muy grande para el PDF (máximo ${LOGO_MAX_LADO_PDF} px por lado): no saldrá en el `
  + 'documento adjunto.';

/**
 * El aviso del logo para el PDF de la cotización y del pedido: pdf_documento lo descarta si pasa de LOGO_MAX_LADO_PX
 * (4000) px de ancho o de alto. null si cabe o si no se conocen sus medidas (naturalWidth/naturalHeight de la imagen).
 * @param {unknown} medidas {ancho, alto} en px
 * @returns {string | null}
 */
export function avisoLogoParaPdf(medidas) {
  if (!esObjeto(medidas)) return null;
  const pasa = (v) => typeof v === 'number' && Number.isFinite(v) && v > LOGO_MAX_LADO_PDF;
  return pasa(medidas.ancho) || pasa(medidas.alto) ? MENSAJE_LOGO_PDF : null;
}

const TEXTO_VACIO_HISTORIAL = '(vacío)';

/**
 * Los renglones «antes → después» de una fila de GET /empresa/historial ({cambios: [{etiqueta, antes, despues}]}, como
 * los deja empresa.guardar_cambios): un texto vacío se muestra '(vacío)' y lo que no es un cambio se descarta. El logo
 * no trae cambios (solo su versión): [].
 * @param {unknown} fila
 * @returns {{etiqueta: string, antes: string, despues: string}[]}
 */
export function cambiosDelHistorial(fila) {
  const cambios = esObjeto(fila) && Array.isArray(fila.cambios) ? fila.cambios : [];
  const texto = (v) => (typeof v === 'string' && v.trim() ? v : TEXTO_VACIO_HISTORIAL);
  return cambios.filter((c) => esObjeto(c) && typeof c.etiqueta === 'string' && c.etiqueta.trim())
    .map((c) => ({ etiqueta: c.etiqueta, antes: texto(c.antes), despues: texto(c.despues) }));
}
