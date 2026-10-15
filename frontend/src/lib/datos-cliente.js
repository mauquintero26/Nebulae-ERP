/**
 * Datos de contacto del cliente que se corrigen desde la solicitud (H21): PATCH /ventas/solicitudes/{id}/cliente.
 * JS plano para probarlo con node (frontend/tests/test_datos_cliente.mjs).
 *
 * Las reglas y los textos son los del backend (erp_ventas._normalizar_contacto y los límites de app/core/clientes.py,
 * T5): si cambias uno, cambia el otro. El servidor vuelve a validar todo; esto solo evita el viaje con un dato que
 * va a rechazar.
 *
 * T8B ronda 2: también el formulario «Editar» del detalle de la SC (formularioDeEdicion) y qué campos de la SC cambió
 * (camposEditadosDeSolicitud), para que solo esos viajen en el PATCH.
 *
 * T10: también el renglón del «Timeline Unificado» de la Agenda, donde se ve la corrección del cliente (itemDeTimelineCliente).
 *
 * Revisión final: el texto de «Editar» sobre lo que anula cambiar el contacto, solo si hay algo que anular
 * (textoContactoAnula).
 */

import { tiene, humanizarCodigo } from './estados-pedido.js';
import { diaLocalDeFecha, comoUTC, fechaEditadaParaGuardar } from './hub-ventas.js';
import { ESTADOS_SC_CON_CONFIRMACION } from './estados-solicitud.js';

// Revisión final (F8): el final del aviso 4 de avisoCorreccionContacto y del texto de «Editar» en Confirmada con una
// cotización activa (una sola redacción).
const CONFIRMACION_ANTERIOR_NO_VALE = 'confirmación anterior del cliente ya no vale; la cotización activa sigue igual.';

/**
 * Los campos, en el orden del formulario. `max` = largo máximo (sin los espacios de los bordes); `soloConFicha` = solo
 * se corrige si la solicitud está vinculada a una ficha de cliente (la ciudad no es columna de la SC). Inmutable.
 * @type {ReadonlyArray<Readonly<{clave: string, etiqueta: string, max: number, soloConFicha: boolean}>>}
 */
export const CAMPOS_CONTACTO = Object.freeze([
  Object.freeze({ clave: 'customer_phone', etiqueta: 'Teléfono', max: 50, soloConFicha: false }),
  Object.freeze({ clave: 'customer_email', etiqueta: 'Correo', max: 150, soloConFicha: false }),
  Object.freeze({ clave: 'customer_address', etiqueta: 'Dirección', max: 255, soloConFicha: false }),
  Object.freeze({ clave: 'customer_city', etiqueta: 'Ciudad', max: 100, soloConFicha: true }),
]);

/** Textos exactos del backend (clientes.texto_de_limite) cuando un dato pasa su límite. */
const TEXTO_LIMITE = Object.freeze({
  customer_phone: (max) => `El teléfono no puede tener más de ${max} caracteres.`,
  customer_email: (max) => `El correo no puede tener más de ${max} caracteres.`,
  customer_address: (max) => `La dirección es muy larga (máximo ${max} caracteres).`,
  customer_city: (max) => `La ciudad es muy larga (máximo ${max} caracteres).`,
});

const TELEFONO_MIN_DIGITOS = 7;
const CORREO_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * El correo tiene la forma que exige el backend (_normalizar_contacto): algo@dominio.ext, sin espacios, una sola '@'.
 * Se mide sin los espacios de los bordes. Lo reutiliza el Chatter (lib/chatter.js) para el chip Correo.
 * @param {any} v
 * @returns {boolean}
 */
export function esCorreoValido(v) {
  return typeof v === 'string' && CORREO_VALIDO.test(v.trim());
}

const comparable = (clave, v) => (clave === 'customer_email' ? texto(v).toLowerCase() : texto(v));

/**
 * Solo los datos de contacto que cambiaron, ya recortados (el correo en minúsculas, como lo guarda el servidor). ''
 * significa borrar el dato. El correo se compara sin mayúsculas; null y '' son lo mismo; una clave que no está en
 * `form` no se toca; la ciudad solo entra si `tieneFicha`.
 * @param {any} original la solicitud (con customer_city del detalle)
 * @param {any} form lo que hay en el formulario
 * @param {{ tieneFicha?: boolean }} [opciones]
 * @returns {Record<string, string>}
 */
export function cambiosDeContacto(original, form, { tieneFicha = false } = {}) {
  /** @type {Record<string, string>} */
  const cambios = {};
  for (const { clave, soloConFicha } of CAMPOS_CONTACTO) {
    if ((soloConFicha && !tieneFicha) || !tiene(form, clave)) continue;
    const nuevo = comparable(clave, form[clave]);
    if (nuevo !== comparable(clave, original?.[clave])) cambios[clave] = nuevo;
  }
  return cambios;
}

/**
 * null si los cambios son válidos, o el mensaje para el usuario (el mismo del 422 del servidor). Mismas reglas y mismo
 * orden que el backend: teléfono, correo, dirección, ciudad; cada uno sin los espacios de los bordes; '' es válido
 * (borra el dato); primero el largo y después el formato (correo con '@' y dominio; teléfono con al menos 7 dígitos).
 * @param {Record<string, any> | null | undefined} cambios
 * @returns {string | null}
 */
export function validarContacto(cambios) {
  for (const { clave, etiqueta, max } of CAMPOS_CONTACTO) {
    if (!tiene(cambios, clave)) continue;
    const v = cambios[clave];
    if (v !== null && v !== undefined && typeof v !== 'string') return `El dato «${etiqueta}» debe ser un texto.`;
    const t = texto(v);
    if (!t) continue;
    if ([...t].length > max) return TEXTO_LIMITE[clave](max);
    if (clave === 'customer_email' && !esCorreoValido(t)) return `El correo «${t}» no es válido.`;
    if (clave === 'customer_phone' && (t.match(/[0-9]/g) ?? []).length < TELEFONO_MIN_DIGITOS) {
      return `El teléfono debe tener al menos ${TELEFONO_MIN_DIGITOS} dígitos.`;
    }
  }
  return null;
}

/** Los números de documento de una lista de la respuesta (lo que no es texto se ignora). */
const numeros = (v) => (Array.isArray(v) ? v.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim()) : []);

/** 'a' | 'a y b' | 'a, b y c' (como _unir_es del backend). */
const unirConY = (partes) => (partes.length <= 1 ? partes.join('') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`);

/**
 * H21 con R18 (rulings 2 y 5 de T8B): el aviso que se muestra después de corregir el contacto del cliente con
 * PATCH /ventas/solicitudes/{id}/cliente, según las claves de su respuesta (T5). Uno solo, en este orden:
 * 1. la solicitud cambió de estado (estado_cambiado): su confirmación quedó anulada y hay que enviársela de nuevo; si
 *    además se anuló el enlace de una cotización, se dice también (ronda 1 de T8B);
 * 2. se anuló el enlace de una cotización (un número de enlaces_anulados que empieza por 'COT-');
 * 3. se anuló el enlace de la solicitud (cualquier otro número de enlaces_anulados);
 * 4. la confirmación anterior ya no vale (confirmacion_anulada: Confirmada con una cotización activa);
 * 5. si no, el aviso normal de guardado.
 * Al final, los documentos de otro cliente que no se corrigieron (documentos_de_otro_cliente). null si no hay nada que
 * decir (sin_cambios y sin documentos de otro cliente, o sin respuesta). Tono 'ok' solo en el guardado normal.
 * @param {any} respuesta la respuesta del PATCH
 * @returns {{ texto: string, tono: 'ok' | 'info' } | null}
 */
export function avisoCorreccionContacto(respuesta) {
  if (!respuesta || typeof respuesta !== 'object') return null;
  const enlaces = numeros(respuesta.enlaces_anulados);
  // Ronda 1 de T8B: por el número del documento (no por el de la solicitud, que puede no venir): COT-… es una cotización.
  const cotizaciones = enlaces.filter((n) => n.startsWith('COT-'));
  const deOtroCliente = numeros(respuesta.documentos_de_otro_cliente);
  let principal = '';
  let tono = 'info';
  if (respuesta.sin_cambios === true) principal = '';
  else if (respuesta.estado_cambiado === true) {
    principal = 'Datos corregidos. Como cambió el correo o el teléfono del cliente, su confirmación quedó anulada: envíale la solicitud de nuevo.';
    if (cotizaciones.length === 1) {
      principal += ` Se anuló también el enlace de la cotización ${cotizaciones[0]}: pásala a Borrador y envíala de nuevo.`;
    } else if (cotizaciones.length > 1) {
      principal += ` Se anularon también los enlaces de las cotizaciones ${unirConY(cotizaciones)}: pásalas a Borrador y envíalas de nuevo.`;
    }
  } else if (cotizaciones.length === 1) {
    principal = `Datos corregidos. Se anuló el enlace de la cotización ${cotizaciones[0]} enviado al dato anterior: pásala a Borrador y envíala de nuevo.`;
  } else if (cotizaciones.length > 1) {
    principal = `Datos corregidos. Se anularon los enlaces de las cotizaciones ${unirConY(cotizaciones)} enviados al dato anterior: pásalas a Borrador y envíalas de nuevo.`;
  } else if (enlaces.length > 0) {
    principal = 'Datos corregidos. Se anuló el enlace que se había enviado al dato anterior: usa «Reenviar enlace de confirmación».';
  } else if (respuesta.confirmacion_anulada === true) {
    principal = `Datos corregidos. La ${CONFIRMACION_ANTERIOR_NO_VALE}`;
  } else {
    principal = 'Datos del cliente corregidos.';
    tono = 'ok';
  }
  let otros = '';
  if (deOtroCliente.length === 1) otros = `No se cambió ${deOtroCliente[0]} porque es de otro cliente.`;
  else if (deOtroCliente.length > 1) otros = `No se cambiaron ${unirConY(deOtroCliente)} porque son de otro cliente.`;
  if (otros) tono = 'info';
  const texto = [principal, otros].filter(Boolean).join(' ');
  return texto ? { texto, tono } : null;
}

/**
 * Revisión final (F8): el texto gris de «Editar» sobre lo que anula cambiar el correo o el teléfono, solo cuando hay algo
 * que anular (la regla R18 de _anular_confirmacion_por_cambio_de_cliente del backend):
 * - fuera de ESTADOS_SC_CON_CONFIRMACION (Nueva, Asignada, Cancelada, Soporte…): '' (no hay confirmación ni enlace);
 * - Pendiente por confirmación (con o sin la cotización temprana) o Confirmada sin cotización activa: la solicitud vuelve
 *   a Asignada y hay que reenviársela;
 * - Confirmada con una cotización activa: el estado no cambia y la confirmación anterior deja de valer (el texto del aviso
 *   4 de avisoCorreccionContacto); '' si el cliente la confirmó por su cotización (confirmacion_vigente === false: sin la
 *   marca de Gate 1 no hay nada que anular).
 * @param {any} sc la solicitud (estado, confirmacion_vigente)
 * @param {{ cotizacionActiva?: boolean }} [opciones] si la solicitud tiene una cotización activa
 * @returns {string}
 */
export function textoContactoAnula(sc, { cotizacionActiva = false } = {}) {
  if (!sc || !ESTADOS_SC_CON_CONFIRMACION.includes(sc.estado)) return '';
  if (sc.estado === 'CONFIRMADA' && cotizacionActiva) {
    return sc.confirmacion_vigente === false ? '' : `Si cambias el correo o el teléfono, la ${CONFIRMACION_ANTERIOR_NO_VALE}`;
  }
  return 'Si cambias el correo o el teléfono, la confirmación del cliente se anula y hay que enviársela de nuevo.';
}

/**
 * Lo que muestra «Editar» en el detalle de la SC: sus datos y, H21, el contacto del cliente (la ciudad viene de su
 * ficha), con los valores por defecto de siempre. fecha_vencimiento llega en UTC sin zona (utcnow + días): el campo
 * muestra el día en hora de Colombia, el mismo que la grilla y la lista.
 * @param {any} d la solicitud (GET /ventas/solicitudes/{id})
 * @returns {{ advisor_name: string, advisor_user_id: any, tipo_solicitud: string, modalidad_pago: string, notas: string,
 *   fecha_vencimiento: string, customer_phone: string, customer_email: string, customer_address: string,
 *   customer_city: string }}
 */
export function formularioDeEdicion(d) {
  return {
    advisor_name: d?.advisor_name || '',
    advisor_user_id: d?.advisor_user_id || '',
    tipo_solicitud: d?.tipo_solicitud || 'Cotizacion de Producto',
    modalidad_pago: d?.modalidad_pago || 'Contado',
    notas: d?.notas || '',
    fecha_vencimiento: diaLocalDeFecha(d?.fecha_vencimiento),
    customer_phone: d?.customer_phone || '',
    customer_email: d?.customer_email || '',
    customer_address: d?.customer_address || '',
    customer_city: d?.customer_city || '',
  };
}

/** Los campos de la SC que se editan en «Editar» (el contacto va por PATCH /cliente y la fecha, aparte). */
const CAMPOS_SOLICITUD_EDITABLES = ['tipo_solicitud', 'modalidad_pago', 'notas'];

/**
 * T8B ronda 2 (punto 1): los campos de la SC que el formulario de «Editar» cambió respecto de lo que mostraba al
 * abrirse (formularioDeEdicion(base), con los mismos valores por defecto): solo esos viajan en el PATCH de la SC. Así una
 * asignación de asesor (u otro cambio) que llegó con una recarga silenciosa mientras el formulario seguía abierto no se
 * deshace al guardar. El asesor viaja con su nombre; '' y null son lo mismo, y el id se compara como texto (el valor de
 * un select). Quitar el asesor manda los dos en null (T11 calidad, E7: con el nombre viejo, la SC volvía a Nueva con
 * «Asesor: <correo viejo>»). Una clave que no está en el formulario no se toca. No incluye el contacto ni la fecha de
 * vencimiento.
 * @param {any} base la solicitud tal como estaba al abrir «Editar»
 * @param {any} form lo que hay en el formulario
 * @returns {Record<string, any>}
 */
export function camposEditadosDeSolicitud(base, form) {
  /** @type {Record<string, any>} */
  const cambios = {};
  if (!form || typeof form !== 'object') return cambios;
  const inicial = formularioDeEdicion(base);
  const igual = (a, b) => String(a ?? '') === String(b ?? '');
  if (tiene(form, 'advisor_user_id') && !igual(inicial.advisor_user_id, form.advisor_user_id)) {
    const sinAsesor = String(form.advisor_user_id ?? '') === '';
    cambios.advisor_user_id = sinAsesor ? null : form.advisor_user_id;
    cambios.advisor_name = sinAsesor ? null : form.advisor_name;
  }
  for (const clave of CAMPOS_SOLICITUD_EDITABLES) {
    if (tiene(form, clave) && !igual(inicial[clave], form[clave])) cambios[clave] = form[clave];
  }
  return cambios;
}

/** T11 calidad (E8): el aviso informativo de «Guardar» cuando no hay nada que guardar. */
export const SIN_CAMBIOS_PARA_GUARDAR = 'No hay cambios para guardar.';

/**
 * T11 calidad (E8): true si «Guardar» del formulario «Editar» de la SC tiene algo que mandar: un dato de contacto
 * (cambiosDeContacto, con la misma regla de la ficha), un campo de la SC (camposEditadosDeSolicitud) o el vencimiento en
 * otro día (fechaEditadaParaGuardar). Si es false, la pantalla no llama al servidor y avisa SIN_CAMBIOS_PARA_GUARDAR.
 * @param {any} base la solicitud tal como estaba al abrir «Editar»
 * @param {any} form lo que hay en el formulario
 * @param {{ tieneFicha?: boolean }} [opciones]
 * @returns {boolean}
 */
export function hayCambiosEnEdicion(base, form, opciones = {}) {
  if (Object.keys(cambiosDeContacto(base, form, opciones)).length > 0) return true;
  if (Object.keys(camposEditadosDeSolicitud(base, form)).length > 0) return true;
  return fechaEditadaParaGuardar(form?.fecha_vencimiento, base?.fecha_vencimiento) !== null;
}

/** El primer valor que es un texto con algo más que espacios (recortado); null si ninguno lo es. */
function primerTexto(...valores) {
  for (const v of valores) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * T10 ronda 1: el título de respaldo, en español, de cada tipo de renglón que arma el perfil 360 (el campo `type` de
 * crm.get_customer_360_profile), para cuando el servidor no manda título. Un tipo que no está aquí se humaniza
 * (humanizarCodigo). Inmutable. backend/tests/test_solicitud_corregir_datos_cliente.py compara estas claves con los tipos
 * que el 360 arma de verdad.
 * @type {Readonly<Record<string, string>>}
 */
export const TITULOS_DE_RESPALDO = Object.freeze({
  customer_request: 'Solicitud',
  quotation: 'Cotización',
  sale_order: 'Pedido',
  sale_order_legacy: 'Pedido anterior',
  payment: 'Pago',
  delivery: 'Entrega',
  return: 'Devolución',
  agenda_activity: 'Actividad de agenda',
  calendar_event: 'Evento de calendario',
  customer_update: 'Datos del cliente actualizados',
  created: 'Cliente creado',
});

/**
 * T10 (H21, punto 7): lo que pinta la pestaña «Timeline Unificado» de la Agenda por cada renglón de `timeline` del perfil
 * 360 (GET /crm/customers/{id}/profile-360, crm.get_customer_360_profile). El servidor manda `type`, `status_label` y
 * `created_at`; la pantalla leía `event_type`, `title` y `date` (nombres que el servidor no manda), así que todas las
 * tarjetas salían sin título ni fecha. Se leen los nombres del servidor y, de respaldo, los viejos; un texto vacío cuenta
 * como ausente.
 * - tipo: type ?? event_type ('' si no hay); pinta el punto de color.
 * - titulo: status_label ?? title; sin ninguno, el título de respaldo de su tipo (TITULOS_DE_RESPALDO), el tipo humanizado
 *   si no lo conoce (nunca vacío ni el código crudo) y, sin tipo, 'Evento'.
 * - fecha: created_at ?? date leída como UTC (comoUTC: el API manda UTC sin zona; el renglón de la corrección ya trae 'Z').
 *   null si no hay o no es una fecha: «Cliente creado» no tiene fecha y la pantalla no inventa un «Hoy».
 * - autor: user_name; solo lo traen las correcciones del cliente (customer_update).
 * - cambios: el antes → después de la corrección ({campo, etiqueta, antes, despues}, lo que pinta CambiosDeActividad). Es
 *   [] si no hay: BODEGA y COMPRAS reciben la lista vacía (el antes → después trae el contacto), así que no se pinta
 *   ningún dato de contacto.
 * @param {any} t un renglón de customer360.timeline
 * @returns {{ tipo: string, titulo: string, fecha: string | null, autor: string | null, cambios: any[] }}
 */
export function itemDeTimelineCliente(t) {
  const tipo = primerTexto(t?.type, t?.event_type) ?? '';
  const crudo = primerTexto(t?.created_at, t?.date);
  const fecha = crudo === null ? null : comoUTC(crudo);
  return {
    tipo,
    titulo: primerTexto(t?.status_label, t?.title)
      ?? (tiene(TITULOS_DE_RESPALDO, tipo) ? TITULOS_DE_RESPALDO[tipo] : (humanizarCodigo(tipo) || 'Evento')),
    fecha: fecha !== null && !Number.isNaN(Date.parse(fecha)) ? fecha : null,
    autor: primerTexto(t?.user_name),
    cambios: Array.isArray(t?.cambios) ? t.cambios : [],
  };
}
