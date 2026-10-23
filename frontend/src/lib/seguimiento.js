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
 *
 * B3 T16 agrega la línea de la ventana del enlace (lineaSeguimientoEnlace), el «No enviar recordatorios» de
 * TarjetaSeguimiento (accionDetenerSeguimiento) y lo de la sección «Seguimiento de confirmación» del Hub
 * (configSeguimientoInicial, avisoDiasSeguimiento, opcionesHora y etiquetaHora).
 */

import { fechaHoraCO } from './fechas-colombia.js';
import { stripPy } from './marca-empresa.js';
import { valorConfig, enteroConfig } from './listas-ventas.js';

/** Escríbele o reenvíale: el cierre de los motivos que piden que el asesor actúe. */
const QUE_HACER = 'Escríbele al cliente o reenvíale el enlace.';
/**
 * r1: FALLO_ENVIO con este mensaje (seguimiento_confirmacion._anotar_error_del_sistema y el cierre de
 * _enviar_recordatorio cuando `enviar` lanzó) pudo haber salido: el cierre no invita a reenviar sin revisar, igual que
 * el renglón de la Actividad. test_paridad_bloque3 afirma que el backend sigue escribiendo este texto.
 */
const MENSAJE_ERROR_DEL_SISTEMA = 'Error del sistema.';
const REVISA_SI_LLEGO = 'Revisa si le llegó al cliente antes de escribirle.';

// DETENIDO por motivo_fin, con el documento todavía en Pendiente (los de seguimiento_confirmacion.MOTIVO_*). `motivo`
// es el texto por defecto cuando ultimo_resultado no trae mensaje (datos viejos).
const DETENIDOS = Object.freeze({
  MANUAL: { tono: 'gris', titulo: 'Recordatorios detenidos',
    texto: 'Detuviste los recordatorios. Si la reenvías, vuelven a empezar.' },
  SIN_MEDIO_CLIENTE: { tono: 'alerta', titulo: 'Sin recordatorio automático', conMotivo: true,
    motivo: 'El cliente no tiene teléfono ni correo.' },
  // r1: título neutral, porque un 'Error del sistema.' pudo haber salido.
  FALLO_ENVIO: { tono: 'alerta', titulo: 'Problema con el recordatorio', conMotivo: true,
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
/** El texto con su punto final (no agrega otro si ya termina en '.', '!' o '?', como 'a. m.' de fechaHoraCO). */
const conPunto = (texto) => `${texto}${/[.!?]$/.test(texto) ? '' : '.'}`;
/** «Recordatorio n de max enviado el {fecha}.» (sin fecha si no la hay). */
const textoEnviado = (n, max, enviado) => conPunto(`Recordatorio ${n} de ${max} enviado${enviado ? ` el ${enviado}` : ''}`);

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
  const enviado = fechaHoraCO(s.ultimo_recordatorio_at);
  const resultado = esObjeto(s.ultimo_resultado) ? s.ultimo_resultado : null;
  if (resultado?.motivo === ERROR_ANTES_DE_ENVIAR) {
    // No salió nada y el reclamo se devolvió: la próxima revisión lo vuelve a intentar (nunca «Revisa si le llegó»).
    // r1: con uno anterior que sí salió, se sigue viendo (sin la fecha del próximo, que quedó vencida).
    const mensaje = conPunto(textoNoVacio(resultado.mensaje) || TEXTO_ERROR_ANTES_DE_ENVIAR);
    const antes = n > 0 ? `${textoEnviado(n, max, enviado)} ` : '';
    return { tono: 'alerta', titulo: 'Recordatorio programado',
      texto: `${antes}${mensaje} El sistema lo intentará de nuevo automáticamente.` };
  }
  if (n === 0) {
    const cuando = proximo ? ` el ${proximo}` : '';
    return { tono: 'info', titulo: 'Recordatorio programado',
      texto: `Si el cliente no confirma, le recordaremos ${canalTexto(s.canal)}${cuando} (1 de ${max}).` };
  }
  let texto = textoEnviado(n, max, enviado);
  if (proximo) {
    texto += n < max ? ` El próximo sale el ${proximo}` : ` Si no responde, el ${proximo} se te avisará para que lo llames.`;
  }
  return { tono: 'ok', titulo: 'Recordatorio enviado', texto };
}

/** El texto de un recordatorio detenido (DETENIDO), por motivo_fin. */
function textoDetenido(s) {
  // r1: solo claves propias (un motivo_fin 'toString' no es una regla).
  const propia = typeof s.motivo_fin === 'string' && Object.hasOwn(DETENIDOS, s.motivo_fin);
  const regla = propia ? DETENIDOS[s.motivo_fin] : DETENIDO_GENERICO;
  const mensaje = esObjeto(s.ultimo_resultado) ? textoNoVacio(s.ultimo_resultado.mensaje) : null;
  if (regla.conMotivo) {
    const motivo = mensaje || regla.motivo;
    const cierre = s.motivo_fin === 'FALLO_ENVIO' && mensaje === MENSAJE_ERROR_DEL_SISTEMA ? REVISA_SI_LLEGO : QUE_HACER;
    return { tono: regla.tono, titulo: regla.titulo, texto: `${conPunto(motivo)} ${cierre}` };
  }
  if (regla.soloMensaje) return { tono: regla.tono, titulo: regla.titulo, texto: mensaje || regla.motivo };
  return { tono: regla.tono, titulo: regla.titulo, texto: regla.texto };
}

/**
 * La tarjeta del recordatorio: {tono: 'ok' | 'info' | 'alerta' | 'gris', titulo, texto}, o null sin seguimiento.
 * - ACTIVO sin envíos -> 'info': «Si el cliente no confirma, le recordaremos {canal} el {fecha} (1 de {max}).»
 * - ACTIVO con envíos -> 'ok': «Recordatorio {n} de {max} enviado el {fecha}» y «El próximo sale el {fecha}» o «Si no
 *   responde, el {fecha} se te avisará para que lo llames.»
 * - ACTIVO con ultimo_resultado ERROR_ANTES_DE_ENVIAR -> 'alerta' con el mensaje tal cual (sigue programado); con
 *   n > 0, antes «Recordatorio {n} de {max} enviado el {fecha}.».
 * - AGOTADO -> 'alerta': «El cliente no respondió el recordatorio. Llámalo o escríbele.»
 * - DETENIDO: MANUAL, COTIZACION_ENVIADA y ENLACE_ANULADO -> 'gris'; SIN_MEDIO_CLIENTE, FALLO_ENVIO y PLAZO_PASADO ->
 *   'alerta' con el motivo y «Escríbele al cliente o reenvíale el enlace.» (FALLO_ENVIO con 'Error del sistema.',
 *   que pudo haber salido: «Revisa si le llegó al cliente antes de escribirle.»); CHATWOOT_SIN_RESPUESTA y
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

/**
 * _entero del backend: un entero (no booleano) o un texto de dígitos ASCII (sin los espacios de los bordes). Revisión
 * final B3 (F2, M53): se llama enteroDeTexto para no confundirse con enteroConfig de listas-ventas.js (cfg, clave,
 * defecto, mínimo, máximo), que este archivo también usa.
 */
function enteroDeTexto(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^[0-9]+$/.test(stripPy(v))) return Number(stripPy(v));
  return null;
}

/**
 * El error del 422 que daría PATCH /ventas/config con estos valores, con la clave del campo que falló ({clave,
 * mensaje}), o null si están bien. `cfg` usa las claves de admin_config (seguimiento_auto_activo, seguimiento_dias,
 * seguimiento_max, seguimiento_solo_horario, seguimiento_hora_inicio, seguimiento_hora_fin); las que falten no se
 * revisan y las demás claves del panel se ignoran. Interruptores: un booleano o 'true'/'false'. Números: un entero o un
 * texto de dígitos dentro de LIMITES_SEGUIMIENTO. Con las dos horas, la final debe ser mayor que la inicial
 * (MENSAJE_HORARIO, en la hora final); con una sola, el backend la combina con lo guardado y aquí no se puede saber.
 * Revisión final B3 (F2, M15): la clave es para el aria-invalid del campo en el ConfigPanel del Hub.
 * @param {unknown} cfg
 * @returns {{clave: string, mensaje: string} | null}
 */
export function errorConfigSeguimiento(cfg) {
  if (!esObjeto(cfg)) return null;
  const valores = {};
  for (const clave of CLAVES) {
    if (!Object.prototype.hasOwnProperty.call(cfg, clave)) continue;
    if (INTERRUPTORES.has(clave)) {
      if (booleano(cfg[clave]) === null) return { clave, mensaje: MENSAJES[clave] };
      continue;
    }
    const n = enteroDeTexto(cfg[clave]);
    const [minimo, maximo] = LIMITES_SEGUIMIENTO[clave];
    if (n === null || n < minimo || n > maximo) return { clave, mensaje: MENSAJES[clave] };
    valores[clave] = n;
  }
  const { seguimiento_hora_inicio: inicio, seguimiento_hora_fin: fin } = valores;
  if (inicio !== undefined && fin !== undefined && fin <= inicio) {
    return { clave: 'seguimiento_hora_fin', mensaje: MENSAJE_HORARIO };
  }
  return null;
}

/**
 * El mensaje del 422 que daría PATCH /ventas/config con estos valores, o null si están bien (el de
 * errorConfigSeguimiento: una sola regla).
 * @param {unknown} cfg
 * @returns {string | null}
 */
export function validarConfigSeguimiento(cfg) {
  return errorConfigSeguimiento(cfg)?.mensaje ?? null;
}

// ─── B3 T16: la ventana del enlace, TarjetaSeguimiento y la sección «Seguimiento de confirmación» del Hub ────────

/**
 * La línea del recordatorio en la ventana del enlace (U16-seguimiento punto 11), con el `seguimiento` de la respuesta
 * del envío: ACTIVO -> gris «Si el cliente no confirma, le recordaremos {canal} el {fecha}.»; DETENIDO por
 * SIN_MEDIO_CLIENTE -> ámbar «No habrá recordatorio automático: el cliente no tiene teléfono ni correo.». Lo demás (o
 * sin seguimiento) no tiene línea: lo dice la tarjeta de «Siguiente paso».
 * @param {unknown} s
 * @returns {{tono: 'gris' | 'alerta', texto: string} | null}
 */
export function lineaSeguimientoEnlace(s) {
  if (!esObjeto(s)) return null;
  if (s.estado === 'ACTIVO') {
    const cuando = fechaHoraCO(s.proximo_at);
    return { tono: 'gris',
      texto: conPunto(`Si el cliente no confirma, le recordaremos ${canalTexto(s.canal)}${cuando ? ` el ${cuando}` : ''}`) };
  }
  if (s.estado === 'DETENIDO' && s.motivo_fin === 'SIN_MEDIO_CLIENTE') {
    return { tono: 'alerta', texto: 'No habrá recordatorio automático: el cliente no tiene teléfono ni correo.' };
  }
  return null;
}

// POST /ventas/{ruta}/{id}/seguimiento/detener (T11): solo la SC y la COT tienen recordatorios.
const DETENER = Object.freeze({
  SC: Object.freeze({ ruta: 'solicitudes', nombre: 'solicitud' }),
  COT: Object.freeze({ ruta: 'cotizaciones', nombre: 'cotización' }),
});

/**
 * «No enviar recordatorios» de TarjetaSeguimiento: la ruta del POST y lo que pregunta confirmar() (useAvisos), o null
 * si el documento no tiene recordatorios (el pedido) o el id no es un entero positivo.
 * @param {unknown} tipoDoc 'SC' | 'COT'
 * @param {unknown} id
 * @returns {{ruta: string, titulo: string, mensaje: string} | null}
 */
export function accionDetenerSeguimiento(tipoDoc, id) {
  const d = typeof tipoDoc === 'string' && Object.hasOwn(DETENER, tipoDoc) ? DETENER[tipoDoc] : null;
  const n = typeof id === 'number' ? id : typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : NaN;
  if (!d || !Number.isInteger(n) || n <= 0) return null;
  return { ruta: `/ventas/${d.ruta}/${n}/seguimiento/detener`, titulo: 'No enviar recordatorios',
    mensaje: `El cliente no recibirá recordatorios automáticos de esta ${d.nombre}. Se reactivan si la reenvías.` };
}

// seguimiento_confirmacion.CLAVES_CONFIG: los valores por defecto (R8: uno solo, a los 2 días, de 8 a 18).
const DEFECTOS = Object.freeze({ seguimiento_auto_activo: true, seguimiento_dias: 2, seguimiento_max: 1,
  seguimiento_solo_horario: true, seguimiento_hora_inicio: 8, seguimiento_hora_fin: 18 });

/**
 * Los valores con que abre la sección «Seguimiento de confirmación», como los lee seguimiento_confirmacion.leer_config:
 * un interruptor que no es 'true'/'false' usa su defecto; un número que no es entero, su defecto, y uno fuera de rango,
 * el límite (admin_config.entero_acotado); si la hora final queda antes (o igual) que la inicial, las dos vuelven a 8 y
 * 18. Acepta las tres formas de la configuración (valorConfig de listas-ventas.js). Todo como texto, como lo guarda el
 * panel ('true', '2').
 * @param {unknown} cfg
 * @returns {{seguimiento_auto_activo: string, seguimiento_dias: string, seguimiento_max: string,
 *   seguimiento_solo_horario: string, seguimiento_hora_inicio: string, seguimiento_hora_fin: string}}
 */
export function configSeguimientoInicial(cfg) {
  const interruptor = (clave) => {
    const crudo = valorConfig(cfg, clave);
    const b = crudo === null ? null : booleano(crudo);
    return String(b === null ? DEFECTOS[clave] : b);
  };
  const numero = (clave) => enteroConfig(cfg, clave, DEFECTOS[clave], ...LIMITES_SEGUIMIENTO[clave]);
  let inicio = numero('seguimiento_hora_inicio');
  let fin = numero('seguimiento_hora_fin');
  if (fin <= inicio) [inicio, fin] = [DEFECTOS.seguimiento_hora_inicio, DEFECTOS.seguimiento_hora_fin];
  return {
    seguimiento_auto_activo: interruptor('seguimiento_auto_activo'),
    seguimiento_dias: String(numero('seguimiento_dias')),
    seguimiento_max: String(numero('seguimiento_max')),
    seguimiento_solo_horario: interruptor('seguimiento_solo_horario'),
    seguimiento_hora_inicio: String(inicio),
    seguimiento_hora_fin: String(fin),
  };
}

/**
 * El aviso ámbar de la sección (U16-seguimiento punto 12a): con el recordatorio encendido, si seguimiento_dias es
 * MAYOR que los días de alerta de la solicitud o de la cotización, el documento se pone rojo antes de que salga el
 * recordatorio. Dice cuál: la solicitud, la cotización o las dos. null si no pasa o si algún número está a medio
 * escribir. `cfg` es el estado del panel (o cualquiera de las formas de valorConfig).
 * @param {unknown} cfg
 * @returns {string | null}
 */
export function avisoDiasSeguimiento(cfg) {
  if (!esObjeto(cfg)) return null;
  if (booleano(valorConfig(cfg, 'seguimiento_auto_activo') ?? 'true') === false) return null;
  const positivo = (clave) => {
    const n = enteroDeTexto(valorConfig(cfg, clave));
    return n !== null && n > 0 ? n : null;
  };
  const dias = positivo('seguimiento_dias');
  if (dias === null) return null;
  const sc = positivo('alerta_sc_dias');
  const cot = positivo('alerta_cot_dias');
  const rojaSc = sc !== null && dias > sc;
  const rojaCot = cot !== null && dias > cot;
  if (rojaSc && rojaCot) {
    return 'Con estos días, la solicitud y la cotización se pondrán rojas antes de que salga el recordatorio.';
  }
  if (rojaSc || rojaCot) {
    return `Con estos días, la ${rojaSc ? 'solicitud' : 'cotización'} se pondrá roja antes de que salga el recordatorio.`;
  }
  return null;
}

/**
 * '8:00 a. m.', '6:00 p. m.'; 0 y 24 son '12 a. m. (medianoche)' (el inicio y el fin del día; r1: más corta, para que
 * el select quepa en el panel). '' si no es una hora de 0 a 24.
 * @param {unknown} h
 * @returns {string}
 */
export function etiquetaHora(h) {
  const n = typeof h === 'number' ? h : typeof h === 'string' && /^\d+$/.test(h) ? Number(h) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 24) return '';
  if (n % 24 === 0) return '12 a. m. (medianoche)';
  const doce = n % 12 === 0 ? 12 : n % 12;
  return `${doce}:00 ${n < 12 ? 'a. m.' : 'p. m.'}`;
}

/**
 * Las opciones de los dos selects de hora (seguimiento_hora_inicio de 0 a 23 y seguimiento_hora_fin de 1 a 24, los
 * límites del backend): [{valor: '8', etiqueta: '8:00 a. m.'}]. [] con otra clave.
 * @param {unknown} clave
 * @returns {{valor: string, etiqueta: string}[]}
 */
export function opcionesHora(clave) {
  if (clave !== 'seguimiento_hora_inicio' && clave !== 'seguimiento_hora_fin') return [];
  const [minimo, maximo] = LIMITES_SEGUIMIENTO[clave];
  const opciones = [];
  for (let h = minimo; h <= maximo; h += 1) opciones.push({ valor: String(h), etiqueta: etiquetaHora(h) });
  return opciones;
}

/**
 * B3 T16 r1: quien puede usar «No enviar recordatorios» (POST …/seguimiento/detener) y leer el estado del WhatsApp
 * automático (GET /ventas/envio-cliente/whatsapp/estado): los dos exigen ADMIN o ASESOR en el servidor, así que ningún
 * botón termina en un 403. Revisión final B3 (F2, M52): la regla vive en lib/roles.js (sobre normalizarRol, el espejo
 * de normalize_role); flujo.tsx la reexporta como esAsesorElegible.
 */
export { esAdminOAsesor } from './roles.js';
