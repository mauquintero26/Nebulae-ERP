/**
 * Recordatorio automático al cliente si no confirma (Bloque 3, T13: U16-seguimiento punto 7). Lógica pura para la
 * tarjeta de «Siguiente paso» (TarjetaSeguimiento de T16), la ventana del enlace y la Configuración del Hub
 * (frontend/tests/test_seguimiento.mjs; la paridad con el backend la corre backend/tests/test_paridad_bloque3.py).
 *
 * `s` es seguimiento_confirmacion.resumen() (d.seguimiento del detalle, del envío y del «detener»), o null si el
 * documento no está en Pendiente por confirmación: {estado: 'ACTIVO' | 'APAGADO' | 'AGOTADO' | 'DETENIDO', canal
 * ('WhatsApp' | 'Email' | 'Otro' | null), recordatorios_enviados, max, proximo_at, ultimo_recordatorio_at (ISO con 'Z'),
 * motivo_fin, ultimo_resultado: {canal, motivo, mensaje} | null}. Las fechas se muestran con fechaHoraCO de
 * fechas-colombia.js ('lunes 5 de octubre, 9:00 a. m.'), que ya termina en 'a. m.'/'p. m.'.
 */

import { fechaHoraCO } from './fechas-colombia.js';
import { stripPy } from './marca-empresa.js';

/** Escríbele o reenvíale: el cierre de los motivos que piden que el asesor actúe. */
const QUE_HACER = 'Escríbele al cliente o reenvíale el enlace.';

// DETENIDO por motivo_fin, con el documento todavía en Pendiente (los de seguimiento_confirmacion.MOTIVO_*). `motivo`
// es el texto por defecto cuando ultimo_resultado no trae mensaje (datos viejos).
const DETENIDOS = Object.freeze({
  MANUAL: { tono: 'gris', titulo: 'Recordatorios detenidos',
    texto: 'Detuviste los recordatorios. Si la reenvías, vuelven a empezar.' },
  SIN_MEDIO_CLIENTE: { tono: 'alerta', titulo: 'Sin recordatorio automático', conMotivo: true,
    motivo: 'El cliente no tiene teléfono ni correo.' },
  FALLO_ENVIO: { tono: 'alerta', titulo: 'Recordatorio no enviado', conMotivo: true,
    motivo: 'No se pudo enviar el recordatorio automático.' },
  PLAZO_PASADO: { tono: 'alerta', titulo: 'Recordatorio no enviado', conMotivo: true,
    motivo: 'El recordatorio venció hace más de 3 días sin poder enviarse.' },
  COTIZACION_ENVIADA: { tono: 'gris', titulo: 'Recordatorios detenidos', texto: 'Los recordatorios siguen en la cotización.' },
  // T11: «puede que haya salido»: nunca dice que no salió.
  CHATWOOT_SIN_RESPUESTA: { tono: 'alerta', titulo: 'Recordatorio sin confirmar',
    texto: 'Chatwoot no confirmó el recordatorio: revisa la conversación antes de escribirle.' },
  ENLACE_ANULADO: { tono: 'gris', titulo: 'Recordatorios detenidos', texto: 'Se anuló el enlace: reenvíala al cliente.' },
  // C14: el recordatorio nunca renueva la validez. El backend trae «La cotización venció el … sin respuesta: …».
  COTIZACION_VENCIDA: { tono: 'alerta', titulo: 'Cotización vencida', soloMensaje: true,
    motivo: 'La cotización venció sin respuesta: re-cotízala o reenvíala.' },
});
const DETENIDO_GENERICO = Object.freeze({ tono: 'gris', titulo: 'Recordatorios detenidos',
  texto: 'Los recordatorios automáticos se detuvieron.' });

/** ultimo_resultado.motivo de un recordatorio que falló ANTES de salir (T11 r2): la fila sigue en ACTIVO. */
const ERROR_ANTES_DE_ENVIAR = 'ERROR_ANTES_DE_ENVIAR';
const TEXTO_ERROR_ANTES_DE_ENVIAR = 'No salió: error del sistema antes de enviarlo.';

const esObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const textoNoVacio = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const entero = (v, defecto) => (Number.isInteger(v) && v >= 0 ? v : defecto);

/**
 * Por dónde le llega el recordatorio: 'por WhatsApp' (más el correo de respaldo), 'por correo' si el envío fue por
 * correo, o 'por correo de respaldo' si fue por «Otro» o no se sabe.
 * @param {unknown} canal
 * @returns {string}
 */
export function canalTexto(canal) {
  if (canal === 'WhatsApp') return 'por WhatsApp';
  if (canal === 'Email' || canal === 'correo') return 'por correo';
  return 'por correo de respaldo';
}

/** El texto del recordatorio programado (ACTIVO). */
function textoActivo(s) {
  const n = entero(s.recordatorios_enviados, 0);
  const max = entero(s.max, 1);
  const proximo = fechaHoraCO(s.proximo_at);
  const resultado = esObjeto(s.ultimo_resultado) ? s.ultimo_resultado : null;
  if (resultado?.motivo === ERROR_ANTES_DE_ENVIAR) {
    // No salió nada y el reclamo se devolvió: la próxima revisión lo vuelve a intentar (nunca «Revisa si le llegó»).
    const mensaje = textoNoVacio(resultado.mensaje) || TEXTO_ERROR_ANTES_DE_ENVIAR;
    return { tono: 'alerta', titulo: 'Recordatorio programado',
      texto: `${mensaje} El sistema lo intentará de nuevo automáticamente.` };
  }
  if (n === 0) {
    const cuando = proximo ? ` el ${proximo}` : '';
    return { tono: 'info', titulo: 'Recordatorio programado',
      texto: `Si el cliente no confirma, le recordaremos ${canalTexto(s.canal)}${cuando} (1 de ${max}).` };
  }
  const enviado = fechaHoraCO(s.ultimo_recordatorio_at);
  let texto = `Recordatorio ${n} de ${max} enviado${enviado ? ` el ${enviado}` : ''}`;
  if (!enviado) texto += '.';
  if (proximo) {
    texto += n < max ? ` El próximo sale el ${proximo}` : ` Si no responde, el ${proximo} se te avisará para que lo llames.`;
  }
  return { tono: 'ok', titulo: 'Recordatorio enviado', texto };
}

/** El texto de un recordatorio detenido (DETENIDO), por motivo_fin. */
function textoDetenido(s) {
  const regla = DETENIDOS[s.motivo_fin] ?? DETENIDO_GENERICO;
  const mensaje = esObjeto(s.ultimo_resultado) ? textoNoVacio(s.ultimo_resultado.mensaje) : null;
  if (regla.conMotivo) {
    const motivo = mensaje || regla.motivo;
    return { tono: regla.tono, titulo: regla.titulo, texto: `${motivo}${/[.!?]$/.test(motivo) ? '' : '.'} ${QUE_HACER}` };
  }
  if (regla.soloMensaje) return { tono: regla.tono, titulo: regla.titulo, texto: mensaje || regla.motivo };
  return { tono: regla.tono, titulo: regla.titulo, texto: regla.texto };
}

/**
 * La tarjeta del recordatorio: {tono: 'ok' | 'info' | 'alerta' | 'gris', titulo, texto}, o null sin seguimiento.
 * - ACTIVO sin envíos -> 'info': «Si el cliente no confirma, le recordaremos {canal} el {fecha} (1 de {max}).»
 * - ACTIVO con envíos -> 'ok': «Recordatorio {n} de {max} enviado el {fecha}» y «El próximo sale el {fecha}» o «Si no
 *   responde, el {fecha} se te avisará para que lo llames.»
 * - ACTIVO con ultimo_resultado ERROR_ANTES_DE_ENVIAR -> 'alerta' con el mensaje tal cual (sigue programado).
 * - AGOTADO -> 'alerta': «El cliente no respondió el recordatorio. Llámalo o escríbele.»
 * - DETENIDO: MANUAL, COTIZACION_ENVIADA y ENLACE_ANULADO -> 'gris'; SIN_MEDIO_CLIENTE, FALLO_ENVIO y PLAZO_PASADO ->
 *   'alerta' con el motivo y «Escríbele al cliente o reenvíale el enlace.»; CHATWOOT_SIN_RESPUESTA y
 *   COTIZACION_VENCIDA -> 'alerta'; otro motivo -> 'gris' genérico.
 * - APAGADO -> 'gris': «Los recordatorios automáticos están apagados en Configuración.»
 * @param {unknown} s
 * @returns {{tono: 'ok' | 'info' | 'alerta' | 'gris', titulo: string, texto: string} | null}
 */
export function textoSeguimiento(s) {
  if (!esObjeto(s)) return null;
  switch (s.estado) {
    case 'ACTIVO':
      return textoActivo(s);
    case 'AGOTADO': {
      const n = entero(s.recordatorios_enviados, 1);
      const cuales = n > 1 ? `los ${n} recordatorios` : 'el recordatorio';
      return { tono: 'alerta', titulo: 'Sin respuesta al recordatorio',
        texto: `El cliente no respondió ${cuales}. Llámalo o escríbele.` };
    }
    case 'DETENIDO':
      return textoDetenido(s);
    case 'APAGADO':
      return { tono: 'gris', titulo: 'Recordatorios apagados',
        texto: 'Los recordatorios automáticos están apagados en Configuración.' };
    default:
      return null;
  }
}

/**
 * «No enviar recordatorios» solo con el recordatorio programado.
 * @param {unknown} s
 * @returns {boolean}
 */
export function puedeDetener(s) {
  return esObjeto(s) && s.estado === 'ACTIVO';
}

// ─── Configuración (seguimiento_confirmacion.validar_valor y validar_horario) ──────────────────────────────────

/** Los límites de los números de Configuración (_LIMITES del backend), [mínimo, máximo]. */
export const LIMITES_SEGUIMIENTO = Object.freeze({
  seguimiento_dias: Object.freeze([1, 15]),
  seguimiento_max: Object.freeze([1, 5]),
  seguimiento_hora_inicio: Object.freeze([0, 23]),
  seguimiento_hora_fin: Object.freeze([1, 24]),
});
export const MENSAJE_HORARIO = 'La hora final debe ser mayor que la inicial.';
const MENSAJES = Object.freeze({
  seguimiento_auto_activo: 'El recordatorio automático debe estar encendido o apagado (true o false).',
  seguimiento_solo_horario: '«Solo en horario laboral» debe estar encendido o apagado (true o false).',
  seguimiento_dias: 'Los días antes del recordatorio deben estar entre 1 y 15.',
  seguimiento_max: 'Los recordatorios deben ser entre 1 y 5.',
  seguimiento_hora_inicio: 'La hora inicial debe estar entre 0 y 23.',
  seguimiento_hora_fin: 'La hora final debe estar entre 1 y 24.',
});
// El orden de Configuración (CLAVES_CONFIG del backend): el primer error es el que se muestra.
const CLAVES = Object.freeze(['seguimiento_auto_activo', 'seguimiento_dias', 'seguimiento_max', 'seguimiento_solo_horario',
  'seguimiento_hora_inicio', 'seguimiento_hora_fin']);
const INTERRUPTORES = new Set(['seguimiento_auto_activo', 'seguimiento_solo_horario']);

/** _booleano del backend: un booleano, o 'true'/'false' sin importar mayúsculas ni los espacios de los bordes. */
function booleano(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string' && ['true', 'false'].includes(stripPy(v).toLowerCase())) return stripPy(v).toLowerCase() === 'true';
  return null;
}

/** _entero del backend: un entero (no booleano) o un texto de dígitos ASCII (sin los espacios de los bordes). */
function enteroConfig(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^[0-9]+$/.test(stripPy(v))) return Number(stripPy(v));
  return null;
}

/**
 * El mensaje del 422 que daría PATCH /ventas/config con estos valores, o null si están bien. `cfg` usa las claves de
 * admin_config (seguimiento_auto_activo, seguimiento_dias, seguimiento_max, seguimiento_solo_horario,
 * seguimiento_hora_inicio, seguimiento_hora_fin); las que falten no se revisan y las demás claves del panel se ignoran.
 * Interruptores: un booleano o 'true'/'false'. Números: un entero o un texto de dígitos dentro de LIMITES_SEGUIMIENTO.
 * Con las dos horas, la final debe ser mayor que la inicial (MENSAJE_HORARIO); con una sola, el backend la combina
 * con lo guardado y aquí no se puede saber.
 * @param {unknown} cfg
 * @returns {string | null}
 */
export function validarConfigSeguimiento(cfg) {
  if (!esObjeto(cfg)) return null;
  const valores = {};
  for (const clave of CLAVES) {
    if (!Object.prototype.hasOwnProperty.call(cfg, clave)) continue;
    if (INTERRUPTORES.has(clave)) {
      if (booleano(cfg[clave]) === null) return MENSAJES[clave];
      continue;
    }
    const n = enteroConfig(cfg[clave]);
    const [minimo, maximo] = LIMITES_SEGUIMIENTO[clave];
    if (n === null || n < minimo || n > maximo) return MENSAJES[clave];
    valores[clave] = n;
  }
  const { seguimiento_hora_inicio: inicio, seguimiento_hora_fin: fin } = valores;
  if (inicio !== undefined && fin !== undefined && fin <= inicio) return MENSAJE_HORARIO;
  return null;
}
