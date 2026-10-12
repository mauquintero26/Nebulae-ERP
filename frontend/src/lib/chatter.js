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
import { comoUTC, TIPOS_NOTA_REINICIAN_ATRASO } from './hub-ventas.js';
import { numeroWhatsApp } from './whatsapp.js';
import { textoDeError } from './avisos.js';
import { esCorreoValido } from './datos-cliente.js';

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
  // Igual que str(body.get('tipo') or 'NOTA').strip().upper(): solo un valor "falso" (ausente, null, '', 0, false) es
  // NOTA; '   ', 7 o true se convierten a texto y no son un tipo conocido.
  const clave = String(tipo || TIPO_POR_DEFECTO).trim().toUpperCase();
  if (!tiene(TIPOS_CHATTER, clave)) throw new Error(MENSAJE_TIPO);
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
 * Actividad, sin recargar). Devuelve el documento tal cual si no hay renglon, si ya estaba (mismo id) o si el renglon
 * es de OTRO documento: su `entity_id` no es el id del documento o, si se pasa `tipoDoc`, su `entity_type` no es ese
 * (p. ej. la pagina cambio de documento mientras se guardaba). null si no hay documento.
 * @template T
 * @param {T} doc
 * @param {any} log
 * @param {string} [tipoDoc] 'SC' | 'COT' | 'VEN': si se pasa, el entity_type del renglon debe coincidir
 * @returns {T | null}
 */
export function agregarActividad(doc, log, tipoDoc) {
  if (doc === null || doc === undefined) return null;
  if (log === null || typeof log !== 'object') return doc;
  const d = /** @type {any} */ (doc);
  const presente = (v) => v !== null && v !== undefined && v !== '';
  if (presente(log.entity_id) && presente(d.id) && String(log.entity_id) !== String(d.id)) return doc;
  if (tipoDoc && presente(log.entity_type) && log.entity_type !== tipoDoc) return doc;
  const previas = Array.isArray(d.actividades) ? d.actividades : [];
  if (presente(log.id) && previas.some((a) => a?.id === log.id)) return doc;
  return { ...doc, actividades: [...previas, log] };
}

/**
 * Clave del borrador en sessionStorage: 'chatter-borrador:{usuario}:{tipoDoc}:{id}'. Va por usuario porque
 * sessionStorage sobrevive a cerrar sesion y entrar con otra cuenta en la misma pestaña. Sin usuario: 'anonimo'.
 * @param {any} tipoDoc
 * @param {any} id
 * @param {any} [usuario] id (o correo) del usuario de la sesion
 * @returns {string}
 */
export function claveBorrador(tipoDoc, id, usuario) {
  const quien = usuario === null || usuario === undefined || String(usuario).trim() === '' ? 'anonimo' : String(usuario).trim();
  return `chatter-borrador:${quien}:${tipoDoc}:${id}`;
}

/**
 * Clave del borrador de la primera version (sin usuario). No se lee: no se sabe de quien era, y migrarla podria
 * mostrarle a una cuenta el borrador de otra. El composer solo la borra al montar.
 * @param {any} tipoDoc
 * @param {any} id
 * @returns {string}
 */
export function claveBorradorVieja(tipoDoc, id) {
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
 * 'mailto:' con el asunto y el cuerpo codificados, o null si no hay un correo valido (la misma regla del backend:
 * esCorreoValido de datos-cliente.js). La direccion tambien se codifica (salvo la @): un correo con '?' o '&' no
 * puede agregar destinatarios ni cambiar el asunto.
 * @param {any} email
 * @param {any} asunto
 * @param {any} cuerpo
 * @returns {string | null}
 */
export function mailtoUrl(email, asunto, cuerpo) {
  if (!esCorreoValido(email)) return null;
  const direccion = encodeURIComponent(recortado(email)).replace(/%40/g, '@');
  return `mailto:${direccion}?subject=${encodeURIComponent(recortado(asunto))}&body=${encodeURIComponent(
    typeof cuerpo === 'string' ? cuerpo : '')}`;
}

/** Digitos minimos de un telefono ya normalizado (numeroWhatsApp: un celular colombiano de 10 queda con 57 + 10). */
const MIN_DIGITOS_TELEFONO = 10;

/**
 * Por que no se puede llamar ni escribir por WhatsApp al cliente, o null si el telefono sirve: sin digitos, 'El
 * cliente no tiene teléfono registrado'; con menos de 10 digitos ya normalizado ('+57', '0', '123'), 'El teléfono del
 * cliente está incompleto'.
 * @param {any} telefono
 * @returns {string | null}
 */
export function motivoTelefono(telefono) {
  const n = numeroWhatsApp(telefono);
  if (!n) return 'El cliente no tiene teléfono registrado';
  if (n.length < MIN_DIGITOS_TELEFONO) return 'El teléfono del cliente está incompleto';
  return null;
}

/**
 * T11 calidad (E6): lo que dice la opcion WhatsApp de la ventana de envio (ChannelModal) cuando el telefono no sirve
 * (motivoTelefono): 'sin teléfono' si no tiene digitos y 'teléfono incompleto' si tiene pero no alcanzan. null si el
 * telefono sirve (la opcion esta habilitada). Lo usan los tres montajes de ChannelModal: el detalle de la SC, el de la
 * COT y el Hub (ventas/page.tsx, desde la ronda 1 de T11 calidad).
 * @param {any} telefono
 * @returns {string | null}
 */
export function textoSinTelefono(telefono) {
  if (!motivoTelefono(telefono)) return null;
  return numeroWhatsApp(telefono) ? 'teléfono incompleto' : 'sin teléfono';
}

/**
 * Enlace 'Llamar ahora' (tel:+57…), con el mismo numero que WhatsApp (whatsapp.js), o null si el telefono no sirve
 * (motivoTelefono).
 * @param {any} telefono
 * @returns {string | null}
 */
export function telUrl(telefono) {
  return motivoTelefono(telefono) ? null : `tel:+${numeroWhatsApp(telefono)}`;
}

/**
 * T11 calidad (F1): quien registra un contacto con el cliente (Llamada, WhatsApp, Correo o Nota externa, los tipos que
 * reinician el atraso). Espejo de ROLES_CONTACTO_CON_EL_CLIENTE de backend/app/core/chatter.py (S7); tests/
 * test_chatter.mjs lo lee del .py. Roles ya normalizados (normalizarRol). Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ROLES_CONTACTO_CON_EL_CLIENTE = congelar(['ADMIN', 'ASESOR']);

// Espejo de _ROLE_LEGACY_MAP de backend/app/api/dependencies.py: el nombre viejo (sin importar mayúsculas) -> canónico.
const ROLES_LEGADO = congelar({
  admin: 'ADMIN', vendedor: 'ASESOR', erp: 'COMPRAS', finanzas: 'FINANZAS', mercadeo: 'CONSULTA',
  asesor: 'ASESOR', compras: 'COMPRAS', bodega: 'BODEGA', consulta: 'CONSULTA',
});

const MOTIVO_SOLO_ASESOR = 'Solo un asesor o un administrador registra contactos con el cliente.';

/**
 * T11 calidad (F1): el rol canónico, como normalize_role del backend: el nombre viejo ('Vendedor', 'ERP'…) por su
 * canónico y cualquier otro en mayúsculas y sin espacios en los bordes. Vacío o lo que no es texto -> ''.
 * @param {any} rol
 * @returns {string}
 */
export function normalizarRol(rol) {
  if (typeof rol !== 'string') return '';
  const clave = rol.trim().toLowerCase();
  return tiene(ROLES_LEGADO, clave) ? ROLES_LEGADO[clave] : rol.trim().toUpperCase();
}

/**
 * T11 calidad (F1): espejo de chatter.puede_registrar del backend (S7): false si `rol` no puede dejar una entrada de ese
 * tipo. La Nota interna la deja cualquier rol con acceso al Chatter; un contacto con el cliente (TIPOS_NOTA_REINICIAN_
 * ATRASO), solo ADMIN y ASESOR. Un rol desconocido o vacío no registra contactos (como en el servidor).
 * @param {any} tipo
 * @param {any} rol
 * @returns {boolean}
 */
export function puedeRegistrar(tipo, rol) {
  const clave = String(tipo || TIPO_POR_DEFECTO).trim().toUpperCase();
  return !TIPOS_NOTA_REINICIAN_ATRASO.includes(clave) || ROLES_CONTACTO_CON_EL_CLIENTE.includes(normalizarRol(rol));
}

/**
 * Por que un chip de tipo esta deshabilitado para este documento, o null si se puede usar. T11 calidad (F1): primero el
 * rol (`rol`, el de la sesión): fuera de ADMIN y ASESOR, Llamada, WhatsApp, Correo y Nota externa no se registran
 * (puedeRegistrar); si el rol todavía no se conoce ('' o null) no se deshabilita nada por rol (el servidor sigue siendo
 * la guarda). Después, los datos: WhatsApp necesita un telefono completo (motivoTelefono) y Correo un correo valido ('El
 * cliente no tiene correo registrado' / 'El correo del cliente no es válido'). Llamada y Nota externa se pueden
 * registrar siempre (el contacto pudo ser desde otro numero o en persona).
 * @param {any} tipo
 * @param {any} doc
 * @param {any} [rol]
 * @returns {string | null}
 */
export function motivoTipoDeshabilitado(tipo, doc, rol) {
  if (normalizarRol(rol) && !puedeRegistrar(tipo, rol)) return MOTIVO_SOLO_ASESOR;
  if (tipo === 'WHATSAPP') return motivoTelefono(doc?.customer_phone);
  if (tipo === 'CORREO') {
    if (!recortado(doc?.customer_email)) return 'El cliente no tiene correo registrado';
    if (!esCorreoValido(doc.customer_email)) return 'El correo del cliente no es válido';
  }
  return null;
}

const REPITE_INTENTA = /intenta de nuevo/i;

/** El texto sin puntos ni espacios al final (con un bucle: una regex /[.\s]+$/ es cuadratica con muchos puntos). */
function sinPuntoFinal(texto) {
  let fin = texto.length;
  while (fin > 0 && (texto[fin - 1] === '.' || /\s/.test(texto[fin - 1]))) fin -= 1;
  return texto.slice(0, fin);
}

// El 403 de require_roles ("Rol 'X' (normalizado: 'Y') no autorizado…") y los de FastAPI en inglés no son un texto
// para el usuario: con ellos queda el mensaje genérico.
const DETALLE_403_TECNICO = /^(?:Rol '[^']*' \(normalizado:|Not authenticated|Not enough permissions|Forbidden)/i;

/** T11 calidad (F1): el detail que el servidor escribió para el usuario en un 403 (p. ej. CONTACTO_SOLO_ASESOR), o null. */
function detalle403Legible(err) {
  const detalle = /** @type {any} */ (err)?.detail;
  const texto = typeof detalle === 'string' ? detalle.trim() : '';
  return texto && !DETALLE_403_TECNICO.test(texto) ? texto : null;
}

/**
 * Error en linea cuando el POST falla. 403: el detail legible del servidor ('No se guardó: {detail}. Tu texto sigue
 * aquí.'; T11 calidad, F1) o, sin él, 'No tienes permiso para dejar notas en este documento. Tu texto sigue aquí.';
 * 404: 'El documento ya no existe.'; si no, 'No se guardó: {mensaje}. Tu texto sigue aquí; intenta de nuevo.' con el
 * mensaje legible de textoDeError (sin su punto final) y sin repetir «intenta de nuevo» si el mensaje ya lo dice.
 * @param {unknown} err
 * @returns {string}
 */
export function mensajeNoGuardado(err) {
  const status = /** @type {any} */ (err)?.status;
  if (status === 403) {
    const detalle = detalle403Legible(err);
    return detalle
      ? `No se guardó: ${sinPuntoFinal(detalle)}. Tu texto sigue aquí.`
      : 'No tienes permiso para dejar notas en este documento. Tu texto sigue aquí.';
  }
  if (status === 404) return 'El documento ya no existe.';
  const mensaje = sinPuntoFinal(textoDeError(err));
  return REPITE_INTENTA.test(mensaje)
    ? `No se guardó: ${mensaje}. Tu texto sigue aquí.`
    : `No se guardó: ${mensaje}. Tu texto sigue aquí; intenta de nuevo.`;
}
