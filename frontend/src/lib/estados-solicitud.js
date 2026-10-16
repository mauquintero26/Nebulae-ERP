/**
 * Estados de la Solicitud de Cotización (U15, U11, U18+H31): UNA sola fuente de nombres, colores, pasos y reglas para
 * la lista, el detalle y el Hub. JS plano, sin React ni DOM, para probarlo con node
 * (frontend/tests/test_estados_solicitud.mjs). Imports relativos con extensión: node y la prueba de paridad de Python
 * no resuelven '@/'.
 *
 * Espejo de backend/app/core/textos_actividad.py (ETIQUETAS_ESTADO['SC'] y PASOS_SC). Si cambias una etiqueta, cambia
 * las dos: backend/tests/test_estados_solicitud.py comprueba que coincidan.
 *
 * La solicitud cuenta solo su propia historia: Nueva (BORRADOR), Asignada, Pendiente por confirmación y Confirmada
 * (Cancelada aparte; Soporte Técnico conserva 'Soporte'). Ninguno se pone a mano: avanzan solos. Los estados heredados
 * (Cotizada, En espera de confirmación, Rechazada, Vencida) ya no se asignan: solo aparecen en el historial.
 */

// congelar: mutar estas tablas lanza TypeError, para que ninguna pantalla las desalinee por accidente.
import { congelar, humanizarCodigo, tiene } from './estados-pedido.js';
import { comoUTC, esSoporte } from './hub-ventas.js';

/**
 * @typedef {{ label: string, color: string, bg: string, border: string }} InfoEstadoSolicitud
 * @typedef {{ clave: string, label: string, ayuda: string }} PasoSolicitud
 */

/** Colores de un estado que no está en la tabla. */
const GRIS = congelar({ color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' });

/**
 * Todos los estados que puede tener una solicitud, con su etiqueta (la del usuario, igual que el backend) y sus
 * colores. La forma de cada entrada ({label, color, bg, border}) es la que leen el Hub, EstadoBadge y el detalle.
 * Inmutable.
 * @type {Readonly<Record<string, Readonly<{label: string, color: string, bg: string, border: string}>>>}
 */
export const ESTADOS_SC = congelar({
  BORRADOR:               { label: 'Nueva',                       color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  ASIGNADA:               { label: 'Asignada',                    color: '#0e7490', bg: '#ecfeff', border: '#a5f3fc' },
  PENDIENTE_CONFIRMACION: { label: 'Pendiente por confirmación',  color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  CONFIRMADA:             { label: 'Confirmada',                  color: '#065f46', bg: '#f0fdf4', border: '#a7f3d0' },
  CANCELADA:              { label: 'Cancelada',                   color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
  'N/A_SOPORTE':          { label: 'Soporte',                     color: '#7e22ce', bg: '#faf5ff', border: '#e9d5ff' },
  // Heredados: ya no se asignan (solo historial y datos viejos).
  COTIZADA:               { label: 'Cotizada',                    color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  EN_ESPERA_CONFIRMACION: { label: 'En espera de confirmación',   color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  RECHAZADA:              { label: 'Rechazada',                   color: '#9f1239', bg: '#fff1f2', border: '#fecdd3' },
  VENCIDA:                { label: 'Vencida',                     color: '#854d0e', bg: '#fefce8', border: '#fef08a' },
});

const etiqueta = (codigo) => ESTADOS_SC[codigo].label;

/**
 * Los 4 pasos de la solicitud, en orden, con la explicación de qué falta para avanzar (se muestra debajo del paso
 * actual). Los nombres de estado de las ayudas salen de la tabla (C5: nunca escritos a mano). Inmutable.
 * @type {ReadonlyArray<Readonly<{clave: string, label: string, ayuda: string}>>}
 */
export const PASOS_SC = congelar([
  { clave: 'BORRADOR', label: etiqueta('BORRADOR'),
    ayuda: `Pasa a ${etiqueta('ASIGNADA')} cuando se le asigna un asesor.` },
  { clave: 'ASIGNADA', label: etiqueta('ASIGNADA'),
    ayuda: `Pasa a ${etiqueta('PENDIENTE_CONFIRMACION')} cuando se le envía al cliente.` },
  { clave: 'PENDIENTE_CONFIRMACION', label: etiqueta('PENDIENTE_CONFIRMACION'),
    ayuda: `Pasa a ${etiqueta('CONFIRMADA')} cuando el cliente abre el enlace y confirma.` },
  { clave: 'CONFIRMADA', label: etiqueta('CONFIRMADA'),
    ayuda: 'El cliente confirmó: el siguiente paso es la cotización.' },
]);

/** Heredados: la solicitud ya había pasado por la confirmación; en los pasos cuentan como Confirmada. */
const HEREDADOS = congelar(['COTIZADA', 'EN_ESPERA_CONFIRMACION', 'RECHAZADA', 'VENCIDA']);

/**
 * Estados heredados (ya no se asignan: solo historial y datos viejos hasta que T12 los ajuste). Los mismos de
 * ESTADOS_SC_HEREDADOS del backend. La lista los muestra en 'Activas' y la dona los suma en 'Estados anteriores'.
 * Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_SC_HEREDADOS = HEREDADOS;

/**
 * Estados en los que el cliente todavía no ha confirmado la solicitud. Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_SC_SIN_CONFIRMAR = congelar(['BORRADOR', 'ASIGNADA', 'PENDIENTE_CONFIRMACION']);

/**
 * Estados en los que el cliente ya tiene (o tenía) el enlace o la confirmación de la solicitud: Pendiente por
 * confirmación y Confirmada. Solo en ellos se reinicia la solicitud (puedeReiniciar), cambiar los productos anula esa
 * confirmación (el aviso del editor y avisoProductosGuardados de lineas-solicitud.js, que lo importa) y cambiar el
 * correo o el teléfono la anula (textoContactoAnula de datos-cliente.js). Revisión final (F10): la única copia. Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_SC_CON_CONFIRMACION = congelar(['PENDIENTE_CONFIRMACION', 'CONFIRMADA']);

/** U11: mínimo de caracteres del motivo para cotizar sin la confirmación del cliente (el servidor exige lo mismo). */
export const MOTIVO_SIN_CONFIRMACION_MIN = 10;

/**
 * U11: máximo de caracteres del motivo (erp_ventas.MOTIVO_SIN_CONFIRMACION_MAX; backend/tests/test_estados_solicitud.py
 * compara los dos). Los dos límites se miden sobre el motivo limpio (motivoLimpio) y en puntos de código, como len() de
 * Python.
 */
export const MOTIVO_SIN_CONFIRMACION_MAX = 500;

/** S5 (T11) + T11 calidad (D1): letras o dígitos mínimos del motivo (erp_ventas.MOTIVO_SIN_CONFIRMACION_MIN_LETRAS). */
export const MOTIVO_SIN_CONFIRMACION_MIN_LETRAS = 5;

/**
 * Caracteres que Unicode cuenta como letras pero no se ven (erp_ventas._RELLENOS_INVISIBLES; tests/
 * test_estados_solicitud.mjs los lee del .py): los rellenos Hangul U+115F, U+1160, U+3164 y U+FFA0 y, T11 calidad
 * (F3), los jeroglíficos egipcios en blanco U+13441 y U+13442. Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const RELLENOS_INVISIBLES = congelar(['\u115f', '\u1160', '\u3164', '\uffa0', '\u{13441}', '\u{13442}']);

// Lo que str.isspace() de Python cuenta como espacio (Zs y los saltos de línea y tabuladores de Cc, Zl y Zp). El \s de JS
// no sirve: incluye U+FEFF (formato) y deja fuera U+001C–U+001F y U+0085.
const ESPACIO = /^[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]$/u;
// B2.1 T2 r1: también los surrogates sueltos (Cs), como _motivo_limpio del servidor (psycopg2 no los guarda).
const FORMATO_O_CONTROL = /^[\p{Cf}\p{Cc}\p{Cs}\p{Zl}\p{Zp}]$/u;
// str.isalnum() de Python, un carácter: categorías L* y N*.
const LETRA_O_DIGITO = /^[\p{L}\p{N}]$/u;

/**
 * T11 calidad (D1): el motivo tal como lo mide y lo guarda el servidor (_motivo_limpio de /cotizar-sin-confirmacion):
 * NFKC; sin caracteres de formato (Cf: U+200B, U+00AD, U+FEFF…) ni de control (Cc) ni surrogates sueltos (Cs, B2.1 T2
 * r1) ni RELLENOS_INVISIBLES; cualquier espacio o salto de línea cuenta como un espacio, los seguidos quedan en uno y se
 * quitan los de los bordes. Lo que no
 * es texto da ''. La paridad con el servidor depende de la versión de Unicode de cada lado (node/ICU y Python): un
 * carácter nuevo puede clasificarse distinto; el servidor sigue siendo la autoridad y responde el 422 legible.
 * @param {any} texto
 * @returns {string}
 */
export function motivoLimpio(texto) {
  if (typeof texto !== 'string') return '';
  let limpio = '';
  for (const ch of texto.normalize('NFKC')) {
    if (ESPACIO.test(ch)) limpio += ' ';
    else if (!FORMATO_O_CONTROL.test(ch) && !RELLENOS_INVISIBLES.includes(ch)) limpio += ch;
  }
  return limpio.replace(/ {2,}/g, ' ').trim();
}

/**
 * T11 calidad (D1): por qué no se puede enviar el motivo, con las mismas reglas, el mismo orden y los mismos textos
 * que el 422 de /cotizar-sin-confirmacion (_error_del_motivo), o null si se puede. Se mide el motivo limpio: menos de
 * MIN caracteres, más de MAX o menos de MIN_LETRAS letras o dígitos.
 * @param {any} texto
 * @returns {string | null}
 */
export function errorMotivoSinConfirmacion(texto) {
  const caracteres = [...motivoLimpio(texto)];
  if (caracteres.length < MOTIVO_SIN_CONFIRMACION_MIN) {
    return `El motivo debe tener al menos ${MOTIVO_SIN_CONFIRMACION_MIN} caracteres.`;
  }
  if (caracteres.length > MOTIVO_SIN_CONFIRMACION_MAX) {
    return `El motivo no puede tener más de ${MOTIVO_SIN_CONFIRMACION_MAX} caracteres.`;
  }
  if (caracteres.filter((ch) => LETRA_O_DIGITO.test(ch)).length < MOTIVO_SIN_CONFIRMACION_MIN_LETRAS) {
    return `El motivo debe tener al menos ${MOTIVO_SIN_CONFIRMACION_MIN_LETRAS} letras o números.`;
  }
  return null;
}

/**
 * B2.1 D6 (decisión del usuario): el error del PATCH de la cotización que pide un motivo nuevo para retomarla (la
 * solicitud se canceló y se restauró después de crearla sin confirmación). El servidor responde 409 con
 * detail {codigo: 'MOTIVO_NUEVO', mensaje}; apiFetch deja status y detail en el error. El detalle de la cotización abre
 * con él la ventana del motivo y reintenta el mismo PATCH con motivo_sin_confirmacion.
 * @param {any} err
 * @returns {boolean}
 */
export function pideMotivoNuevo(err) {
  return err?.status === 409 && err?.detail?.codigo === 'MOTIVO_NUEVO';
}

/**
 * Etiqueta y colores de un estado de solicitud. Una clave desconocida sale humanizada ('ALGO_NUEVO' -> 'Algo nuevo',
 * igual que etiqueta_estado del backend) y en gris: nunca el código crudo.
 * @param {any} e
 * @returns {Readonly<InfoEstadoSolicitud>}
 */
export function infoEstadoSolicitud(e) {
  if (tiene(ESTADOS_SC, e)) return ESTADOS_SC[e];
  return congelar({ label: humanizarCodigo(e), ...GRIS });
}

/**
 * Lugar del estado en los 4 pasos: 0 Nueva, 1 Asignada, 2 Pendiente por confirmación, 3 Confirmada (y los
 * heredados). -1 cuando no se muestran pasos: Cancelada, Soporte, o un estado ajeno o vacío (la etiqueta dice el
 * estado real; marcar un paso sería falso).
 * @param {any} e
 * @returns {number}
 */
export function pasoSolicitud(e) {
  const i = PASOS_SC.findIndex((p) => p.clave === e);
  if (i >= 0) return i;
  return HEREDADOS.includes(e) ? PASOS_SC.length - 1 : -1;
}

/** Cuántos documentos hay: acepta el arreglo (detalle) o el número (lista); ausente = 0. */
function contar(documentos) {
  if (Array.isArray(documentos)) return documentos.length;
  return Number(documentos) || 0;
}

/**
 * U15: 'Reiniciar solicitud' (vuelve a Nueva, o a Asignada si tiene asesor) solo tiene sentido en Pendiente por
 * confirmación o en Confirmada, y sin cotización activa ni pedido vigente (con ellos el servidor responde 409, R10).
 * Nunca en Cancelada (se retoma restaurándola desde la Papelera) ni en un ticket de Soporte Técnico.
 * @param {any} sc
 * @param {{ cotizacionesActivas?: any[] | number, pedidosVigentes?: any[] | number }} [documentos]
 *   arreglos (detalle) o conteos (lista); ausente = 0.
 * @returns {boolean}
 */
export function puedeReiniciar(sc, { cotizacionesActivas, pedidosVigentes } = {}) {
  if (!sc || esSoporte(sc) || !ESTADOS_SC_CON_CONFIRMACION.includes(sc.estado)) return false;
  return contar(cotizacionesActivas) === 0 && contar(pedidosVigentes) === 0;
}

/**
 * U11: el botón 'Cotizar sin esperar confirmación'. Mismas condiciones que POST
 * /ventas/solicitudes/{id}/cotizar-sin-confirmacion (T3), para no ofrecer lo que el servidor va a rechazar:
 * no es Soporte; hay asesor (advisor_user_id: con solo el nombre el servidor responde 400); tiene productos; no hay
 * cotización activa ni pedido vigente; y está en Asignada o Pendiente por confirmación, o en Confirmada cuya
 * confirmación ya no vale (confirmacion_vigente === false; sin el dato no se ofrece). No mira el rol: cualquier asesor
 * o administrador puede (R5).
 * @param {any} sc
 * @param {{ cotizacionesActivas?: any[] | number, pedidosVigentes?: any[] | number, tieneProductos?: boolean }} [opciones]
 * @returns {boolean}
 */
export function puedeCotizarSinConfirmacion(sc, { cotizacionesActivas, pedidosVigentes, tieneProductos } = {}) {
  if (!sc || esSoporte(sc) || !sc.advisor_user_id || !tieneProductos) return false;
  if (contar(cotizacionesActivas) > 0 || contar(pedidosVigentes) > 0) return false;
  if (sc.estado === 'ASIGNADA' || sc.estado === 'PENDIENTE_CONFIRMACION') return true;
  return sc.estado === 'CONFIRMADA' && sc.confirmacion_vigente === false;
}

// ─── U18+H31: resumen de la cancelación ─────────────────────────────────────────────────────────────────────────

const SIN_MOTIVO = 'No se registró el motivo';
const PREFIJO_CANCELADA = 'Cancelada: ';
const MARCA_EN_NOTAS = /\[CANCELADA\]\s*Razón:[ \t]*([^\r\n]*)/gi;

const textoNoVacio = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** El renglón con el id mayor (el más reciente; el id conserva el orden causal) o, sin ids, el último del arreglo. */
function masReciente(renglones) {
  return renglones.reduce((ultimo, r) => {
    if (!ultimo) return r;
    const [a, b] = [Number(ultimo.id), Number(r.id)];
    return Number.isFinite(a) && Number.isFinite(b) && b < a ? ultimo : r;
  }, null);
}

/**
 * El último renglón CANCELLED que de verdad canceló la solicitud. Un CANCELLED de Cancelada a Cancelada (enviarla a
 * la Papelera ya cancelada, Bloque 1) no es la cancelación: solo se usa si no hay otro.
 */
function renglonDeCancelacion(actividades) {
  const canceladas = (Array.isArray(actividades) ? actividades : []).filter((a) => a?.action === 'CANCELLED');
  const reales = canceladas.filter((a) => a.old_estado !== 'CANCELADA');
  return masReciente(reales.length ? reales : canceladas);
}

function motivoDeLasNotas(notas) {
  if (typeof notas !== 'string') return null;
  let motivo = null;
  for (const m of notas.matchAll(MARCA_EN_NOTAS)) motivo = textoNoVacio(m[1]) ?? motivo;
  return motivo;
}

/**
 * U18+H31 (C1 h): el motivo guardado de una cancelación, o '' si no hay (quien lo muestra pone 'Sin motivo
 * registrado'): razon_cancelacion recortada -> la última marca no vacía '[CANCELADA] Razón: X' de las notas viejas (hasta
 * la limpieza de T12; solo esa marca: un 'MOTIVO:' de una nota de devolución no es el motivo) -> ''. Nunca se inventa
 * uno. Lo usan la lista de solicitudes (Canceladas, análisis, Papelera) y resumenCancelacion.
 * @param {any} sc
 * @returns {string}
 */
export function motivoDeCancelacion(sc) {
  return textoNoVacio(sc?.razon_cancelacion) ?? motivoDeLasNotas(sc?.notas) ?? '';
}

function motivoDelRenglon(renglon) {
  if (!renglon) return null;
  const delExtra = textoNoVacio(renglon.extra_data?.motivo);
  if (delExtra) return delExtra;
  const d = renglon.description;
  return typeof d === 'string' && d.startsWith(PREFIJO_CANCELADA) ? textoNoVacio(d.slice(PREFIJO_CANCELADA.length)) : null;
}

const FORMATO_FECHA_COLOMBIA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
});

/** Una fecha de calendario, sin hora ('2026-11-03'). */
const FECHA_DE_CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 'dd/mm/aaaa' en hora de Colombia, como _texto_papelera del backend. Una fecha y hora sin zona se lee como UTC
 * (comoUTC, la misma regla del Hub y de las listas). Una fecha de calendario es ese mismo día: comoUTC la deja igual y
 * new Date() la leería como medianoche UTC, que en Bogotá es la víspera.
 */
function fechaColombia(iso) {
  if (typeof iso !== 'string' || !iso.trim()) return null;
  const dia = iso.trim().match(FECHA_DE_CALENDARIO);
  if (dia) return `${dia[3]}/${dia[2]}/${dia[1]}`;
  const fecha = new Date(comoUTC(iso));
  if (Number.isNaN(fecha.getTime())) return null;
  const partes = Object.fromEntries(FORMATO_FECHA_COLOMBIA.formatToParts(fecha).map((p) => [p.type, p.value]));
  return `${partes.day}/${partes.month}/${partes.year}`;
}

/**
 * Texto oficial de una solicitud cancelada sin documentos que la purga no va a borrar (no tiene eliminada_at). Uno solo:
 * lo usan la tarjeta de la cancelación (aquí) y la Papelera (listas-ventas.js, estadoEnPapelera). B2.1 T4 r1: sin
 * «automáticamente» (ninguna se borra sola: un administrador vacía las vencidas); esta nunca vence.
 * @type {string}
 */
export const TEXTO_PAPELERA_SIN_FECHA = 'No vence: no tiene fecha de envío a la Papelera';

function textoPapelera(seConserva, purga) {
  if (seConserva === true) return 'Se conserva en la Papelera como historial (tiene documentos vinculados)';
  const dia = fechaColombia(purga);
  // B2.1 D2: desde esa fecha se PUEDE eliminar (la borra un administrador al vaciar la Papelera), no se borra sola.
  if (dia) return `Se puede eliminar definitivamente desde el ${dia} si no se restaura.`;
  if (seConserva === false) return TEXTO_PAPELERA_SIN_FECHA;
  return null;
}

/**
 * U18+H31: lo que muestra la tarjeta de una solicitud cancelada.
 * - motivo: razon_cancelacion -> extra_data.motivo del último renglón CANCELLED -> el texto después de 'Cancelada: '
 *   en su descripción (renglones viejos) -> la última marca '[CANCELADA] Razón: X' de las notas (SC viejas, hasta la
 *   limpieza) -> 'No se registró el motivo'. Nunca se inventa uno.
 * - por y fecha (ISO, tal como viene del API): del último renglón CANCELLED; sin renglón, fecha = eliminada_at y
 *   por = null.
 * - seConserva y purga: se_conserva_en_papelera y purga_programada del GET (solo vienen con la SC CANCELADA y
 *   purga_programada puede ser null): null cuando no vienen.
 * - papelera: el texto del destino en la Papelera (fecha en hora de Colombia), o null si el GET no lo dice.
 * @param {any} sc
 * @param {any[] | null} [actividades]
 * @returns {{ motivo: string, por: string | null, fecha: string | null, seConserva: boolean | null,
 *   purga: string | null, papelera: string | null }}
 */
export function resumenCancelacion(sc, actividades) {
  const renglon = renglonDeCancelacion(actividades);
  // Orden: razon_cancelacion -> el renglón CANCELLED -> las notas viejas. motivoDeCancelacion cubre la primera y la
  // última; sin razón, aquí solo aporta la marca de las notas.
  const motivo = textoNoVacio(sc?.razon_cancelacion) ?? motivoDelRenglon(renglon) ?? (motivoDeCancelacion(sc) || SIN_MOTIVO);
  const seConserva = typeof sc?.se_conserva_en_papelera === 'boolean' ? sc.se_conserva_en_papelera : null;
  const purga = textoNoVacio(sc?.purga_programada);
  return {
    motivo,
    por: renglon ? textoNoVacio(renglon.user_name) : null,
    fecha: renglon ? (renglon.created_at ?? null) : (sc?.eliminada_at ?? null),
    seConserva,
    purga,
    papelera: textoPapelera(seConserva, purga),
  };
}
