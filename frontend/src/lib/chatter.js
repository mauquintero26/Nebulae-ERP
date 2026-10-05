/**
 * Chatter de Ventas (U6+H22 y R1, Bloque 2): UN solo Chatter para la Solicitud, la Cotizacion, el Pedido y el panel
 * de actividad del Hub. Reglas puras (sin React ni DOM) para probarlas con node (frontend/tests/test_chatter.mjs); el
 * componente es app/dashboard/ventas/chatter.tsx.
 *
 * Espejo de backend/app/core/chatter.py (validar_nota): mismos tipos, mismos limites y mismos mensajes, para avisar
 * en linea antes de enviar. El servidor es la autoridad y responde 422 con estos mismos textos.
 * Contrato: POST /ventas/{solicitudes|cotizaciones|pedidos}/{id}/actividad con {action: 'CHATTER', tipo, description,
 * medio?} ('medio' solo con la Nota externa); responde {status, data: renglon de Actividad}. El autor lo pone el
 * servidor con el usuario de la sesion: el body nunca lleva user_name.
 */
import { congelar, tiene } from './estados-pedido.js';
import { comoUTC } from './hub-ventas.js';
import { numeroWhatsApp, waUrl } from './whatsapp.js';
import { textoDeError } from './avisos.js';

/**
 * Tipos de entrada del Chatter, en el orden de los chips. EXTERNA (R1) = 'Nota externa': un contacto con el cliente
 * por cualquier otro medio (visita, reunion, llamada desde otro telefono…), con el medio opcional. Ninguna se le envia
 * al cliente. Las claves son las de TIPOS_CHATTER del backend. Inmutable.
 * @type {Readonly<Record<string, Readonly<{chip: string, titulo: string, placeholder: string, boton: string}>>>}
 */
export const TIPOS_CHATTER = congelar({
  NOTA: {
    chip: 'Nota interna', titulo: 'Nota interna', placeholder: 'Escribe una nota interna o un seguimiento…',
    boton: 'Guardar nota',
  },
  LLAMADA: {
    chip: 'Llamada', titulo: 'Llamada con el cliente', placeholder: '¿Qué hablaste con el cliente?',
    boton: 'Guardar llamada',
  },
  WHATSAPP: {
    chip: 'WhatsApp', titulo: 'WhatsApp al cliente', placeholder: 'Mensaje para el cliente…',
    boton: 'Abrir WhatsApp y guardar',
  },
  CORREO: {
    chip: 'Correo', titulo: 'Correo al cliente', placeholder: 'Mensaje del correo…', boton: 'Abrir correo y guardar',
  },
  EXTERNA: {
    chip: 'Nota externa', titulo: 'Nota externa (contacto con el cliente)',
    placeholder: '¿Qué hablaste con el cliente y por qué medio?', boton: 'Guardar nota externa',
  },
});

/** Largo maximo del texto de una nota (MAX_TEXTO del backend). */
export const MAX_TEXTO_CHATTER = 2000;
/** Largo maximo del medio de una Nota externa (MAX_MEDIO del backend). */
export const MAX_MEDIO_CHATTER = 60;
/** Desde cuantos caracteres se muestra el contador del texto. */
export const UMBRAL_CONTADOR_CHATTER = 1800;

/**
 * Sugerencias del campo 'Medio (opcional)' de la Nota externa (R1); se puede escribir otro. Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const MEDIOS_SUGERIDOS = congelar(['Visita', 'Reunión', 'Mensaje de texto', 'Otro']);

const TIPO_POR_DEFECTO = 'NOTA';

const MENSAJE_VACIA = 'Escribe la nota antes de guardarla.';
const MENSAJE_LARGA = `La nota es muy larga (máximo ${MAX_TEXTO_CHATTER} caracteres).`;
const MENSAJE_TIPO = 'Tipo de nota no válido.';
const MENSAJE_MEDIO = `El medio es muy largo (máximo ${MAX_MEDIO_CHATTER} caracteres).`;

// Rutas del POST por tipo de documento (las del Hub: 'SC', 'COT', 'VEN').
const RUTAS = congelar({ SC: 'solicitudes', COT: 'cotizaciones', VEN: 'pedidos' });
const NOMBRES_DOCUMENTO = congelar({ SC: 'Solicitud', COT: 'Cotización', VEN: 'Pedido' });

const recortado = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Largo en puntos de codigo (como len() de Python): un emoji cuenta 1, igual que en el backend.
 * @param {any} texto
 * @returns {number}
 */
export function largoTexto(texto) {
  return typeof texto === 'string' ? [...texto].length : 0;
}

/**
 * true si el renglon de Actividad es una nota del Chatter (CHATTER, o NOTE_ADDED: la nota 'Motivo del rechazo (Hub)'
 * de N3).
 * @param {any} a
 * @returns {boolean}
 */
export function esEntradaChatter(a) {
  return a?.action === 'CHATTER' || a?.action === 'NOTE_ADDED';
}

/** Clave de TIPOS_CHATTER de un valor (sin importar mayusculas), o null si no es un tipo conocido. */
function claveTipo(tipo) {
  const t = recortado(tipo).toUpperCase();
  return t && tiene(TIPOS_CHATTER, t) ? t : null;
}

/**
 * Tipo de una nota: extra_data.tipo si es conocido; si no, 'NOTA' (las notas viejas, sin tipo, son Nota interna).
 * @param {any} a
 * @returns {string}
 */
export function tipoChatter(a) {
  return claveTipo(a?.extra_data?.tipo) ?? TIPO_POR_DEFECTO;
}

/**
 * Titulo de una nota en la lista y en la etiqueta de la linea de tiempo: el del tipo, o 'Nota externa · {medio}' si
 * la Nota externa trae medio (R1).
 * @param {any} a
 * @returns {string}
 */
export function tituloEntradaChatter(a) {
  const tipo = tipoChatter(a);
  const medio = recortado(a?.extra_data?.medio);
  if (tipo === 'EXTERNA' && medio) return `${TIPOS_CHATTER.EXTERNA.chip} · ${medio}`;
  return TIPOS_CHATTER[tipo].titulo;
}

/**
 * Ruta del POST de notas: SC -> /ventas/solicitudes/{id}/actividad, COT -> /ventas/cotizaciones/…, VEN ->
 * /ventas/pedidos/…. Un tipo de documento desconocido o un id que no es un entero positivo lanzan Error (nunca se
 * arma una ruta a /undefined/actividad).
 * @param {any} tipoDoc
 * @param {any} id
 * @returns {string}
 */
export function rutaNotas(tipoDoc, id) {
  if (typeof tipoDoc !== 'string' || !tiene(RUTAS, tipoDoc)) {
    throw new Error(`Tipo de documento sin Chatter: ${String(tipoDoc)}`);
  }
  const idTexto = typeof id === 'number' || typeof id === 'string' ? String(id).trim() : '';
  if (!/^[1-9]\d*$/.test(idTexto)) throw new Error(`Documento sin id válido: ${String(id)}`);
  return `/ventas/${RUTAS[tipoDoc]}/${idTexto}/actividad`;
}

/**
 * El cuerpo del POST de una nota, con las mismas reglas y el mismo orden que validar_nota del backend: texto (no
 * vacio, maximo 2000), tipo conocido (sin tipo: NOTA) y, solo con EXTERNA, el medio (recortado, maximo 60; si queda
 * vacio no se manda). Con otros tipos el medio se ignora. Si algo no vale lanza Error con el mensaje del backend.
 * @param {any} tipo
 * @param {any} texto
 * @param {any} [medio]
 * @returns {{action: 'CHATTER', tipo: string, description: string, medio?: string}}
 */
export function cuerpoNota(tipo, texto, medio) {
  const description = recortado(texto);
  if (!description) throw new Error(MENSAJE_VACIA);
  if (largoTexto(description) > MAX_TEXTO_CHATTER) throw new Error(MENSAJE_LARGA);
  const vacio = recortado(tipo) === '';
  const clave = vacio ? TIPO_POR_DEFECTO : claveTipo(tipo);
  if (!clave) throw new Error(MENSAJE_TIPO);
  /** @type {{action: 'CHATTER', tipo: string, description: string, medio?: string}} */
  const cuerpo = { action: 'CHATTER', tipo: clave, description };
  if (clave === 'EXTERNA') {
    const m = recortado(medio);
    if (largoTexto(m) > MAX_MEDIO_CHATTER) throw new Error(MENSAJE_MEDIO);
    if (m) cuerpo.medio = m;
  }
  return cuerpo;
}

/**
 * El mensaje que daria el backend para esta nota, o null si se puede guardar (cuerpoNota sin lanzar).
 * @param {any} tipo
 * @param {any} texto
 * @param {any} [medio]
 * @returns {string | null}
 */
export function validarNotaChatter(tipo, texto, medio) {
  try {
    cuerpoNota(tipo, texto, medio);
    return null;
  } catch (e) {
    return /** @type {Error} */ (e).message;
  }
}

/**
 * Solo el texto: 'Escribe la nota antes de guardarla.', 'La nota es muy larga (máximo 2000 caracteres).' o null.
 * @param {any} t
 * @returns {string | null}
 */
export function validarTextoChatter(t) {
  return validarNotaChatter(TIPO_POR_DEFECTO, t);
}

const momento = (a) => {
  const t = typeof a?.created_at === 'string' ? Date.parse(comoUTC(a.created_at)) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
};
const idNumerico = (a) => (Number.isFinite(Number(a?.id)) ? Number(a.id) : -Infinity);

/**
 * Solo las notas del Chatter, la mas reciente primero; a igual fecha, el id mayor primero. Las fechas sin zona se
 * leen como UTC (comoUTC). Devuelve una lista nueva (no reordena la recibida).
 * @param {any} actividades
 * @returns {any[]}
 */
export function entradasChatter(actividades) {
  if (!Array.isArray(actividades)) return [];
  return actividades
    .filter((a) => a !== null && typeof a === 'object' && esEntradaChatter(a))
    .map((a) => ({ a, t: momento(a), id: idNumerico(a) }))
    .sort((x, y) => (y.t === x.t ? 0 : y.t > x.t ? 1 : -1) || (y.id === x.id ? 0 : y.id > x.id ? 1 : -1))
    .map(({ a }) => a);
}

/**
 * Copia nueva del documento con el renglon recien creado al final de `actividades` (asi la nota sale enseguida en la
 * Actividad, sin recargar). Si ya estaba (mismo id) o no hay renglon, devuelve el documento tal cual. null si no hay
 * documento.
 * @template T
 * @param {T} doc
 * @param {any} log
 * @returns {T | null}
 */
export function agregarActividad(doc, log) {
  if (doc === null || doc === undefined) return null;
  if (log === null || typeof log !== 'object') return doc;
  const previas = Array.isArray(/** @type {any} */ (doc).actividades) ? /** @type {any} */ (doc).actividades : [];
  if (log.id !== undefined && log.id !== null && previas.some((a) => a?.id === log.id)) return doc;
  return { ...doc, actividades: [...previas, log] };
}

/**
 * Clave del borrador en sessionStorage: 'chatter-borrador:{tipoDoc}:{id}'.
 * @param {any} tipoDoc
 * @param {any} id
 * @returns {string}
 */
export function claveBorrador(tipoDoc, id) {
  return `chatter-borrador:${tipoDoc}:${id}`;
}

/**
 * Lee el borrador guardado (JSON {texto, tipo, medio}). Tolera lo que no sea JSON, un texto suelto y valores raros:
 * lo que no valga queda vacio y el tipo desconocido pasa a 'NOTA'.
 * @param {any} raw
 * @returns {{texto: string, tipo: string, medio: string}}
 */
export function parsearBorrador(raw) {
  const vacio = { texto: '', tipo: TIPO_POR_DEFECTO, medio: '' };
  if (typeof raw !== 'string' || !raw) return vacio;
  let valor;
  try {
    valor = JSON.parse(raw);
  } catch {
    return vacio;
  }
  if (typeof valor === 'string') return { ...vacio, texto: valor };
  if (valor === null || typeof valor !== 'object') return vacio;
  return {
    texto: typeof valor.texto === 'string' ? valor.texto : '',
    tipo: claveTipo(valor.tipo) ?? TIPO_POR_DEFECTO,
    medio: typeof valor.medio === 'string' ? valor.medio : '',
  };
}

/**
 * Asunto del correo al cliente: 'Solicitud SC-…', 'Cotización COT-…' o 'Pedido PVEN-…'.
 * @param {any} tipoDoc
 * @param {any} numero
 * @returns {string}
 */
export function asuntoDocumento(tipoDoc, numero) {
  const nombre = typeof tipoDoc === 'string' && tiene(NOMBRES_DOCUMENTO, tipoDoc) ? NOMBRES_DOCUMENTO[tipoDoc] : '';
  return [nombre, recortado(typeof numero === 'number' ? String(numero) : numero)].filter(Boolean).join(' ');
}

/**
 * 'mailto:' con el asunto y el cuerpo codificados, o null si no hay correo. La direccion tambien se codifica (salvo
 * la @): un correo con '?' o '&' no puede agregar destinatarios ni cambiar el asunto.
 * @param {any} email
 * @param {any} asunto
 * @param {any} cuerpo
 * @returns {string | null}
 */
export function mailtoUrl(email, asunto, cuerpo) {
  const e = recortado(email);
  if (!e || !e.includes('@')) return null;
  const direccion = encodeURIComponent(e).replace(/%40/g, '@');
  return `mailto:${direccion}?subject=${encodeURIComponent(recortado(asunto))}&body=${encodeURIComponent(
    typeof cuerpo === 'string' ? cuerpo : '')}`;
}

/**
 * Enlace 'Llamar ahora' (tel:+57…), con el mismo numero que WhatsApp (whatsapp.js), o null si no hay telefono.
 * @param {any} telefono
 * @returns {string | null}
 */
export function telUrl(telefono) {
  const n = numeroWhatsApp(telefono);
  return n ? `tel:+${n}` : null;
}

/**
 * Por que un chip de tipo esta deshabilitado para este documento, o null si se puede usar: WhatsApp necesita un
 * telefono con digitos (waUrl) y Correo un correo. Llamada y Nota externa se pueden registrar siempre (el contacto
 * pudo ser desde otro numero o en persona).
 * @param {any} tipo
 * @param {any} doc
 * @returns {string | null}
 */
export function motivoTipoDeshabilitado(tipo, doc) {
  if (tipo === 'WHATSAPP' && !waUrl(doc?.customer_phone)) return 'El cliente no tiene teléfono registrado';
  if (tipo === 'CORREO' && !mailtoUrl(doc?.customer_email, '', '')) return 'El cliente no tiene correo registrado';
  return null;
}

/**
 * Error en linea cuando el POST falla: 'No se guardó: {mensaje}. Tu texto sigue aquí; intenta de nuevo.' (mensaje
 * legible de textoDeError, sin el punto final para no repetirlo).
 * @param {unknown} err
 * @returns {string}
 */
export function mensajeNoGuardado(err) {
  const mensaje = textoDeError(err).replace(/[.\s]+$/, '');
  return `No se guardó: ${mensaje}. Tu texto sigue aquí; intenta de nuevo.`;
}
