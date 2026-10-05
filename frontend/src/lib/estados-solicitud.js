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
 * Estados en los que el cliente todavía no ha confirmado la solicitud. Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_SC_SIN_CONFIRMAR = congelar(['BORRADOR', 'ASIGNADA', 'PENDIENTE_CONFIRMACION']);

/** U11: mínimo de caracteres del motivo para cotizar sin la confirmación del cliente (el servidor exige lo mismo). */
export const MOTIVO_SIN_CONFIRMACION_MIN = 10;

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
  if (!sc || esSoporte(sc) || !['PENDIENTE_CONFIRMACION', 'CONFIRMADA'].includes(sc.estado)) return false;
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

function textoPapelera(seConserva, purga) {
  if (seConserva === true) return 'Se conserva en la Papelera como historial (tiene documentos vinculados)';
  const dia = fechaColombia(purga);
  if (dia) return `Se eliminará definitivamente el ${dia} si no la restauras desde la Papelera`;
  if (seConserva === false) return 'No se elimina automáticamente: no tiene fecha de envío a la Papelera';
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
  const motivo = textoNoVacio(sc?.razon_cancelacion) ?? motivoDelRenglon(renglon) ?? motivoDeLasNotas(sc?.notas) ?? SIN_MOTIVO;
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
