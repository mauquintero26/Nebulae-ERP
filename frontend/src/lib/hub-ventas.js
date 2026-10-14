/**
 * Reglas del Hub de Ventas (frontend/src/app/dashboard/ventas/page.tsx). JS plano, sin React ni DOM, para probarlo
 * con node (frontend/tests/test_hub_ventas.mjs), como busqueda.js.
 *
 *  - N3: "Cancelar documento" cancela esa fila: orden VEN -> COT -> SC, filas que no se pueden cancelar y resumen.
 *  - N2: el panel rapido del pedido solo ofrece lo que el servidor acepta (estados-pedido.js es la fuente unica de
 *    etiquetas y transiciones; el backend, TRANSICIONES_VEN_PATCH, es la autoridad).
 *  - N5: el mismo resumen para el cambio masivo de estado de pedidos.
 *  - H2 (R5): dias desde una fecha del API (UTC aunque venga sin zona), nunca negativos.
 *  - H3: la proxima accion de una solicitud (replica renderSiguientePaso de solicitud/[id]/page.tsx) y el semaforo.
 *  - T9B (Bloque 2): R19 (Cotizar solo con la confirmacion del cliente vigente), R20 (una SC sin confirmar con
 *    cotizacion activa ya tiene la accion tomada) y R1 (la nota del Chatter que reinicia el atraso).
 */

import {
  ESTADOS_PEDIDO, ESTADOS_PEDIDO_MANUALES, infoEstadoPedido, transicionesPedido, esPedidoVigente, esCotizacionActiva,
} from './estados-pedido.js';

// ─── N3: cancelar documentos ────────────────────────────────────────────────────

const ORDEN_CANCELACION = { VEN: 0, COT: 1, SC: 2 };

/**
 * Orden en que se cancelan los ids 'TIPO|id': primero los pedidos, luego las cotizaciones y al final las solicitudes
 * (una SC no se cancela con una COT o un PVEN activos; cancelar el PVEN devuelve su COT a Borrador y asi se puede
 * rechazar). Orden estable dentro de cada tipo; no muta la lista recibida.
 * @param {string[]} ids
 * @returns {string[]}
 */
export function ordenParaCancelar(ids) {
  const peso = (idStr) => ORDEN_CANCELACION[String(idStr).split('|')[0]] ?? 3;
  return (ids || []).map((idStr, i) => ({ idStr, i })).sort((a, b) => peso(a.idStr) - peso(b.idStr) || a.i - b.i).map((x) => x.idStr);
}

/**
 * Una solicitud de Soporte Técnico (por su tipo o por su estado). La usan el Hub y estados-solicitud.js.
 * @param {any} row
 * @returns {boolean}
 */
export const esSoporte = (row) => row?.tipo_solicitud === 'Soporte Tecnico' || row?.estado === 'N/A_SOPORTE';

/**
 * Por que una fila del Hub no se puede cancelar desde ahi, o null si se puede. Las que tienen motivo no se envian al
 * servidor y se muestran como omitidas. Un pedido sigue las transiciones del servidor (transicionesPedido).
 * @returns {string | null}
 */
export function motivoNoCancelable(row) {
  const estado = row?.estado;
  if (row?.tipo === 'SC') {
    if (estado === 'CANCELADA') return 'ya está cancelada';
    if (esSoporte(row)) return 'es un ticket de soporte: se cierra desde su estado de soporte';
    return null;
  }
  if (row?.tipo === 'COT') return estado === 'RECHAZADA' ? 'ya está rechazada' : null;
  if (row?.tipo === 'VEN') {
    if (estado === 'CANCELADO') return 'ya está cancelado';
    if (estado === 'ENTREGADO') return 'ya fue entregado';
    if (estado === 'FACTURADO') return 'ya fue facturado';
    if (!transicionesPedido(estado).includes('CANCELADO')) {
      return `está ${infoEstadoPedido(estado).label.toLowerCase()} y ya no se puede cancelar`;
    }
  }
  return null;
}

const VERBOS_LOTE = {
  cancelados: { singular: 'documento', plural: 'documentos', participio: 'cancelado', infinitivo: 'cancelar' },
  actualizados: { singular: 'pedido', plural: 'pedidos', participio: 'actualizado', infinitivo: 'actualizar' },
};

/**
 * Resumen de un lote procesado en serie (cancelar documentos, N3; cambiar el estado de pedidos, N5).
 * `resultados`: [{idStr, numero, ok, error, aviso}]: `aviso` es algo que salio a medias en un documento que si se
 * proceso (p. ej. la nota del motivo de una COT rechazada); cuenta como exitoso pero se muestra.
 * `opciones.omitidos`: [{numero, motivo}] que no se enviaron (cambio masivo); `opciones.destino`: etiqueta del estado
 * nuevo ('a En proceso' en el mensaje).
 * Devuelve {exitosos, fallidos, avisos, omitidos (cada uno [{numero, error}]), mensaje, banner}. Sin fallidos el mensaje
 * es el del toast ('2 documentos cancelados'); con fallidos, el del banner ('No se pudieron cancelar 1 de 3
 * documentos'). `banner` ({titulo, lineas}) existe si hay fallidos, avisos u omitidos: primero los fallos, luego los
 * avisos y al final los omitidos. Ningun error queda en blanco.
 * @param {{idStr?: string, numero?: string, ok: boolean, error?: string, aviso?: string}[]} resultados
 * @param {'cancelados' | 'actualizados'} [verbo]
 * @param {{omitidos?: {numero?: string, motivo?: string}[], destino?: string}} [opciones]
 * @returns {{exitosos: number, fallidos: {numero: string, error: string}[], avisos: {numero: string, error: string}[],
 *   omitidos: {numero: string, error: string}[], mensaje: string, banner: {titulo: string, lineas: {numero: string, error: string}[]} | null}}
 */
export function resumenLote(resultados, verbo = 'cancelados', opciones = {}) {
  const v = VERBOS_LOTE[verbo] || VERBOS_LOTE.cancelados;
  const lista = (Array.isArray(resultados) ? resultados : []).filter(Boolean);
  const linea = (numero, texto, porDefecto) => ({ numero: String(numero || ''), error: String(texto || '').trim() || porDefecto });
  const total = lista.length;
  const exitosos = lista.filter((r) => r.ok).length;
  const fallidos = lista.filter((r) => !r.ok).map((r) => linea(r.numero, r.error, 'el servidor no dio detalle del error'));
  const avisos = lista.filter((r) => r.ok && r.aviso).map((r) => linea(r.numero, r.aviso, ''));
  const omitidos = (opciones.omitidos || []).map((o) => linea(o?.numero, o?.motivo, 'se omitió'));
  const destino = opciones.destino ? ` a ${opciones.destino}` : '';
  let mensaje;
  if (total === 0) {
    mensaje = `Ningún ${v.singular} se pudo ${v.infinitivo}${destino}`;
  } else if (fallidos.length === 0) {
    mensaje = (exitosos === 1 ? `1 ${v.singular} ${v.participio}` : `${exitosos} ${v.plural} ${v.participio}s`) + destino;
  } else if (total === 1) {
    mensaje = `No se pudo ${v.infinitivo} el ${v.singular}${destino}`;
  } else {
    mensaje = `No se pudieron ${v.infinitivo} ${fallidos.length} de ${total} ${v.plural}${destino}`;
  }
  const notas = [];
  if (omitidos.length) notas.push(omitidos.length === 1 ? `se omitió 1 ${v.singular}` : `se omitieron ${omitidos.length} ${v.plural}`);
  if (avisos.length) notas.push(avisos.length === 1 ? '1 aviso' : `${avisos.length} avisos`);
  const lineas = [...fallidos, ...avisos, ...omitidos];
  const banner = lineas.length ? { titulo: `${mensaje}${notas.length ? ` (${notas.join(', ')})` : ''}:`, lineas } : null;
  return { exitosos, fallidos, avisos, omitidos, mensaje, banner };
}

// ─── N2 / N5: estados del pedido desde el Hub ───────────────────────────────────

/**
 * Etiqueta de cada estado del pedido (derivada de ESTADOS_PEDIDO: una sola fuente de nombres). Inmutable.
 * @type {Readonly<Record<string, string>>}
 */
export const ETIQUETA_ESTADO_VEN = Object.freeze(
  Object.fromEntries(Object.entries(ESTADOS_PEDIDO).map(([clave, info]) => [clave, info.label])),
);

/**
 * Los que se eligen a mano en el Hub (panel rapido y cambio masivo): misma lista que ESTADOS_PEDIDO_MANUALES
 * (incluye En transito, decision del usuario en N2). Entregado va por Entregas y Facturado solo desde Entregado.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_VEN_MANUALES = ESTADOS_PEDIDO_MANUALES;

/**
 * Lo que el panel rapido ofrece para un pedido en `estado`, solo con destinos que el servidor acepta
 * (transicionesPedido) cruzados con la lista manual:
 *  - mover: estados manuales a los que puede pasar (sin el actual);
 *  - despachar: puede pasar a Entregado (se hace en Entregas, que pide bodega y descuenta inventario);
 *  - cancelar: puede cancelarse (con motivo, modal de N3);
 *  - facturar: puede marcarse Facturado (solo desde Entregado, con confirmacion).
 * @returns {{mover: string[], despachar: boolean, cancelar: boolean, facturar: boolean}}
 */
export function opcionesEstadoPVEN(estado) {
  const destinos = transicionesPedido(estado);
  return {
    mover: ESTADOS_VEN_MANUALES.filter((e) => e !== estado && destinos.includes(e)),
    despachar: destinos.includes('ENTREGADO'),
    cancelar: destinos.includes('CANCELADO'),
    facturar: destinos.includes('FACTURADO'),
  };
}

/**
 * Cambio masivo de estado (N5): separa los pedidos marcados en los que pueden pasar a `nuevo` desde el Hub (lo que
 * ofrece opcionesEstadoPVEN: un estado manual o Facturado desde Entregado) y los que se omiten sin enviarse, con el
 * motivo. `filas`: [{idStr, numero, estado}] (sin estado = la fila ya no esta en la lista).
 * @param {{idStr: string, numero: string, estado?: string}[]} filas
 * @param {string} nuevo
 * @returns {{aplican: {idStr: string, numero: string, estado?: string}[], omitidos: {idStr: string, numero: string, motivo: string}[]}}
 */
export function repartirCambioEstadoPVEN(filas, nuevo) {
  const aplican = [];
  const omitidos = [];
  const etiqueta = (e) => infoEstadoPedido(e).label;
  for (const fila of filas || []) {
    const { idStr, numero, estado } = fila;
    let motivo = null;
    if (!estado) {
      motivo = 'ya no está en la lista del Hub';
    } else if (estado === nuevo) {
      motivo = `ya está en ${etiqueta(nuevo)}`;
    } else {
      const op = opcionesEstadoPVEN(estado);
      if (!op.mover.includes(nuevo) && !(nuevo === 'FACTURADO' && op.facturar)) {
        motivo = `no se puede pasar de ${etiqueta(estado)} a ${etiqueta(nuevo)}`;
      }
    }
    if (motivo) omitidos.push({ idStr, numero, motivo });
    else aplican.push(fila);
  }
  return { aplican, omitidos };
}

// ─── H2 (R5): antiguedad ────────────────────────────────────────────────────────

// Fecha y hora sin 'Z' ni desfase: el backend guarda UTC sin zona (utcnow), asi que se lee como UTC y no como hora
// local (si no, en Colombia todo sale corrido 5 h y un documento de la noche aparece "de mañana").
const FECHA_HORA_SIN_ZONA = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Una fecha y hora del API sin zona ('2026-10-04T11:00:00', '2026-10-04 11:00:00.123456') con 'Z' al final, para que
 * `new Date()` la lea como UTC (diasDesde y las fechas/horas visibles del Hub). Con zona, una fecha de calendario o
 * algo que no es texto se devuelve igual.
 * @param {any} iso
 * @returns {any}
 */
export function comoUTC(iso) {
  if (typeof iso !== 'string') return iso;
  const texto = iso.trim();
  return FECHA_HORA_SIN_ZONA.test(texto) ? `${texto.replace(' ', 'T')}Z` : texto;
}

/**
 * Dias completos desde `iso` hasta `ahora` (piso de la diferencia en 24 h). Nunca negativo (un desfase de reloj da 0);
 * null, '' o una fecha invalida dan 0.
 * @param {string | null | undefined} iso
 * @param {number} [ahora]
 * @returns {number}
 */
export function diasDesde(iso, ahora = Date.now()) {
  if (!iso) return 0;
  const t = new Date(comoUTC(iso)).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((ahora - t) / 86400000));
}

/** 0 (o menos) -> 'hoy'; 1 -> 'hace 1 día'; n -> 'hace n días'. */
export function textoAntiguedad(d) {
  return d <= 0 ? 'hoy' : d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

// ─── T8A ronda 1: el día de una fecha de negocio (vencimiento de la SC) ──────────

/** Una fecha de calendario, sin hora ('2026-10-10'). */
const FECHA_DE_CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** true si el texto es 'aaaa-mm-dd' y ese día existe (no '2026-02-30'). */
function esDiaValido(texto) {
  const m = FECHA_DE_CALENDARIO.exec(texto);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia;
}

/**
 * El día ('aaaa-mm-dd') de una fecha del API en hora LOCAL del navegador (Colombia para el usuario): el mismo que
 * muestra fDate(comoUTC(iso)) en la lista y en el detalle. Una fecha y hora sin zona se lee como UTC (comoUTC): el
 * vencimiento de una SC creada a las 8 pm de Colombia llega como la 1 am del día siguiente y es el día anterior. Una fecha
 * de calendario es ese mismo día. null, '', algo que no es texto o una fecha imposible -> ''. Es el valor del campo date
 * de 'Editar' en el detalle de la SC.
 * @param {unknown} iso
 * @returns {string}
 */
export function diaLocalDeFecha(iso) {
  if (typeof iso !== 'string' || !iso.trim()) return '';
  const texto = iso.trim();
  if (FECHA_DE_CALENDARIO.test(texto)) return esDiaValido(texto) ? texto : '';
  const f = new Date(comoUTC(texto));
  if (Number.isNaN(f.getTime())) return '';
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

/**
 * Lo que se manda al guardar un campo date que se editó como día local (diaLocalDeFecha), o null si no hay que mandarlo:
 * vacío o inválido (nunca '' ni una fecha imposible) o el mismo día que ya está guardado (así no se mueve la hora guardada
 * ni la Actividad anota un cambio que nadie hizo). Si el día cambió, el mediodía local de ese día en ISO (en Colombia,
 * 17:00 UTC: el mismo día en UTC y en hora local).
 * @param {unknown} dia  valor del input type="date" ('aaaa-mm-dd' o '')
 * @param {unknown} guardada  la fecha que trae el API
 * @returns {string | null}
 */
export function fechaEditadaParaGuardar(dia, guardada) {
  if (typeof dia !== 'string' || !esDiaValido(dia.trim())) return null;
  const valor = dia.trim();
  if (valor === diaLocalDeFecha(guardada)) return null;
  return new Date(`${valor}T12:00:00`).toISOString();
}

// ─── H3: semaforo y proxima accion de la solicitud ──────────────────────────────

/**
 * Estados que requieren accion o estan en espera de gestion (SC, COT y PVEN). Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_NO_RESOLUCION = Object.freeze([
  'BORRADOR',
  'ASIGNADA',
  'PENDIENTE_CONFIRMACION',
  'EN_GESTION',
  'ENVIADA',
  'PENDIENTE_COMPRA',
  'PENDIENTE_PAGO',
  'EN_PROCESO',
  'EN_TRANSITO',
]);

/**
 * Estados resueltos o con la accion ya tomada. Una SC COTIZADA o EN_ESPERA_CONFIRMACION cuenta aqui: lo que falta se
 * cuenta en su cotizacion (no dos veces). Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_ACCION_TOMADA = Object.freeze([
  'CONFIRMADA',
  'COTIZADA',
  'EN_ESPERA_CONFIRMACION',
  'LISTO_ENTREGA',
  'ENTREGADO',
  'FACTURADO',
  'CANCELADO',
  'CANCELADA',
  'RECHAZADA',
]);

/** Alguna linea con nombre de producto no vacio (misma regla que solicitud/[id]/page.tsx). */
export function tieneProductos(productos) {
  return Array.isArray(productos)
    && productos.some((p) => !!p && typeof p === 'object' && String(p.product_name || p.nombre || p.name || '').trim() !== '');
}

const esSCConfirmada = (row) => row?.tipo === 'SC' && row?.estado === 'CONFIRMADA';

/**
 * R20 (U11): una SC sin confirmar (las de la SC en ESTADOS_NO_RESOLUCION: Nueva, Asignada y Pendiente por
 * confirmacion, las de ESTADOS_SC_SIN_CONFIRMAR) que ya tiene una cotizacion activa (cotizada sin esperar al cliente).
 * Su alerta la lleva la cotizacion, igual que en alertas_resumen del backend. Mira el tipo antes que scConCot: los ids de
 * SC, COT y PVEN pueden coincidir.
 * @param {any} row
 * @param {Set<number>} [scConCot] ids de SC con una COT activa
 * @returns {boolean}
 */
export function esSCConCotizacionTemprana(row, scConCot) {
  return row?.tipo === 'SC' && ESTADOS_NO_RESOLUCION.includes(row?.estado) && !!scConCot?.has(row.id);
}

/**
 * No resuelto: una SC CONFIRMADA sin cotizacion activa (scConCot = ids de SC con una COT activa) todavia necesita que
 * la cotizen; una SC sin confirmar con cotizacion activa ya no (R20); el resto segun ESTADOS_NO_RESOLUCION.
 * @param {Set<number>} scConCot
 */
export function esNoResuelto(row, scConCot) {
  if (esSCConfirmada(row)) return !scConCot?.has(row.id);
  if (esSCConCotizacionTemprana(row, scConCot)) return false;
  return ESTADOS_NO_RESOLUCION.includes(row?.estado);
}

/**
 * Accion tomada: una SC CONFIRMADA solo cuando ya tiene cotizacion activa; una SC sin confirmar con cotizacion activa
 * tambien (R20); el resto segun ESTADOS_ACCION_TOMADA.
 */
export function esAccionTomada(row, scConCot) {
  if (esSCConfirmada(row)) return !!scConCot?.has(row.id);
  if (esSCConCotizacionTemprana(row, scConCot)) return true;
  return ESTADOS_ACCION_TOMADA.includes(row?.estado);
}

const masReciente = (lista) => [...lista].sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0];

/** La ruta del Hub de Ventas: a donde vuelve un detalle abierto desde aqui. */
export const RUTA_HUB_VENTAS = '/dashboard/ventas';

/**
 * T11 (V1): el texto del aviso de atrasados del menu lateral (AlertasBadge), con el `atrasados` de
 * GET /ventas/alertas/resumen: '1 atrasado', '5 atrasados'. Sin un numero positivo: '' (el aviso no se muestra).
 * @param {any} n
 * @returns {string}
 */
export function textoAtrasados(n) {
  const cuantos = typeof n === 'number' || (typeof n === 'string' && n.trim() !== '') ? Number(n) : NaN;
  if (!Number.isFinite(cuantos) || cuantos <= 0) return '';
  return `${cuantos} ${cuantos === 1 ? 'atrasado' : 'atrasados'}`;
}

/**
 * T11 calidad (E2+E3): la ruta de un detalle abierto desde el Hub con ?return_to= del Hub, como el panel rapido: su
 * unico boton de volver dice «Volver al Hub de Ventas» (H37; el detalle lo valida con returnToSeguro).
 * @param {string} ruta  p. ej. '/dashboard/ventas/cotizacion/12'
 * @returns {string}
 */
export function desdeElHub(ruta) {
  return `${ruta}?return_to=${encodeURIComponent(RUTA_HUB_VENTAS)}`;
}

/** Textos del aviso de fusionarCargaHub (uno solo por recarga). */
export const AVISOS_CARGA_HUB = Object.freeze({
  sinPrevios: 'No se pudieron cargar las listas. Pulsa Actualizar para intentarlo de nuevo.',
  conPrevios: 'No se pudieron actualizar las listas; se muestran los datos anteriores.',
  config: 'No se pudo cargar la configuración de alertas.',
});

/** Las filas de una respuesta de lista del API (arreglo, {data} o {items}) con su tipo; null si el GET fallo. */
function filasDe(respuesta, tipo) {
  if (respuesta === null || respuesta === undefined) return null;
  const filas = Array.isArray(respuesta) ? respuesta : (respuesta?.data || respuesta?.items || []);
  return (Array.isArray(filas) ? filas : []).map((x) => ({ ...x, tipo }));
}

const momentoDeCreacion = (x) => new Date(x?.created_at || 0).getTime();

/**
 * T11 calidad (E4, ronda 1): la recarga del Hub (loadData) en una funcion pura. `previas` es lo que quedo de la carga
 * anterior ({sc, cot, ven}, o null si no hubo); `respuestas` son los cuatro GET ({sc, cot, ven, cfg}), con null para
 * uno que fallo. Una lista que falla conserva la anterior (o queda vacia en la primera carga) y una que llega la
 * reemplaza; `todas` las junta de la mas nueva a la mas vieja; `cfg` es la configuracion de alertas nueva, o null para
 * conservar la de pantalla (fallo o no es un objeto). `aviso`: uno solo, o null — si fallo alguna lista, «no se pudieron
 * cargar» sin datos previos (o previos vacios) y «se muestran los datos anteriores» con ellos; si solo fallo la
 * configuracion, su propio texto (AVISOS_CARGA_HUB). No muta lo que recibe.
 * @param {{sc: any[], cot: any[], ven: any[]} | null} previas
 * @param {{sc: any, cot: any, ven: any, cfg: any}} respuestas
 * @returns {{listas: {sc: any[], cot: any[], ven: any[]}, todas: any[], cfg: any, aviso: string | null}}
 */
export function fusionarCargaHub(previas, respuestas) {
  const nuevas = { sc: filasDe(respuestas?.sc, 'SC'), cot: filasDe(respuestas?.cot, 'COT'), ven: filasDe(respuestas?.ven, 'VEN') };
  const listas = {
    sc: nuevas.sc ?? previas?.sc ?? [],
    cot: nuevas.cot ?? previas?.cot ?? [],
    ven: nuevas.ven ?? previas?.ven ?? [],
  };
  const todas = [...listas.sc, ...listas.cot, ...listas.ven].sort((a, b) => momentoDeCreacion(b) - momentoDeCreacion(a));
  const cfgCruda = respuestas?.cfg;
  const cfg = cfgCruda && typeof cfgCruda === 'object' ? (cfgCruda.data || cfgCruda) : null;
  const fallaLista = nuevas.sc === null || nuevas.cot === null || nuevas.ven === null;
  const habiaDatos = !!previas && ['sc', 'cot', 'ven'].some((k) => Array.isArray(previas[k]) && previas[k].length > 0);
  let aviso = null;
  if (fallaLista) aviso = habiaDatos ? AVISOS_CARGA_HUB.conPrevios : AVISOS_CARGA_HUB.sinPrevios;
  else if (cfgCruda === null || cfgCruda === undefined) aviso = AVISOS_CARGA_HUB.config;
  return { listas, todas, cfg, aviso };
}

/**
 * Proxima accion de una solicitud en el Hub: {label, href, tono} o null (cancelada). Replica renderSiguientePaso de
 * solicitud/[id]/page.tsx en el mismo orden; el primer caso que aplica gana. El Hub no envia nada por su cuenta: el
 * envio (canal y correo de respaldo) vive en el detalle de la SC, asi que casi todo lleva a la solicitud.
 * R19: una Confirmada solo se cotiza con la confirmacion del cliente vigente (confirmacion_vigente de _sc_dict); sin
 * ella, 'Reiniciar o cotizar' (el servidor solo envia una Asignada o reenvia una Pendiente por confirmacion, nunca una
 * Confirmada; el detalle ofrece 'Reiniciar solicitud' o 'Cotizar sin esperar confirmacion'), y 'Enviar para
 * confirmacion' queda para la Asignada.
 * Cada href lleva ?return_to= del Hub (desdeElHub).
 * `tono` es uno de los de NextStepCard (flujo.tsx): slate, emerald, indigo, amber o blue.
 * @param {{cotizaciones?: any[], pedidos?: any[]}} [ctx] cotizaciones y pedidos de esa solicitud
 * @returns {{label: string, href: string, tono: string} | null}
 */
export function accionSiguienteSC(row, ctx = {}) {
  const cotizaciones = ctx.cotizaciones || [];
  const pedidos = ctx.pedidos || [];
  const enSolicitud = desdeElHub(`/dashboard/ventas/solicitud/${row?.id}`);
  const estado = row?.estado;
  if (esSoporte(row)) return { label: 'Ver ticket', href: enSolicitud, tono: 'slate' };
  if (estado === 'CANCELADA') return null;
  const pedido = masReciente(pedidos.filter((v) => v && esPedidoVigente(v.estado)));
  if (pedido) return { label: 'Ver pedido', href: desdeElHub(`/dashboard/ventas/venta/${pedido.id}`), tono: 'emerald' };
  // choque H3/N4: una COT VENCIDA cuenta como activa (esCotizacionActiva), igual que en el backend.
  const cot = masReciente(cotizaciones.filter((c) => c && esCotizacionActiva(c.estado)));
  if (cot) return { label: 'Ver cotización', href: desdeElHub(`/dashboard/ventas/cotizacion/${cot.id}`), tono: 'indigo' };
  if (!tieneProductos(row?.productos) && ['ASIGNADA', 'PENDIENTE_CONFIRMACION', 'CONFIRMADA'].includes(estado)) {
    return { label: 'Agregar productos', href: enSolicitud, tono: 'amber' };
  }
  // R19 (U15): solo se cotiza con la confirmación del cliente vigente (confirmacion_vigente de _sc_dict: gate1 de la SC).
  if (estado === 'CONFIRMADA' && row?.confirmacion_vigente === true) return { label: 'Cotizar →', href: enSolicitud, tono: 'emerald' };
  // R19 (enmienda T9B r1): una Confirmada cuya confirmación ya no vale no se envía (el servidor solo envía una Asignada
  // o reenvía una Pendiente por confirmación): en el detalle se reinicia o se cotiza sin esperar confirmación.
  if (estado === 'CONFIRMADA') return { label: 'Reiniciar o cotizar', href: enSolicitud, tono: 'slate' };
  if (estado === 'PENDIENTE_CONFIRMACION') return { label: 'Esperando cliente', href: enSolicitud, tono: 'blue' };
  if (estado === 'ASIGNADA') return { label: 'Enviar para confirmación', href: enSolicitud, tono: 'indigo' };
  if (estado === 'BORRADOR') return { label: 'Asignar asesor', href: enSolicitud, tono: 'amber' };
  return { label: 'Ver solicitud', href: enSolicitud, tono: 'slate' };
}

// ─── T9B (R1): la nota del Chatter que reinicia el atraso ───────────────────────

/**
 * Tipos de nota del Chatter que reinician el conteo de atraso del documento: los contactos con el cliente (R1; espejo
 * de _REINICIAN_ATRASO en backend/app/core/chatter.py). La Nota interna no. Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const TIPOS_NOTA_REINICIAN_ATRASO = Object.freeze(['LLAMADA', 'WHATSAPP', 'CORREO', 'EXTERNA']);

/**
 * true si el renglon que devolvio el POST del Chatter reinicio el atraso del documento en el servidor (su updated_at
 * paso a ahora): una nota (CHATTER o NOTE_ADDED, como esEntradaChatter) de un contacto con el cliente, con el tipo leido
 * como tipoChatter (sin importar mayusculas ni espacios). El panel de actividad del Hub recarga entonces las listas para
 * que la alerta roja y el '+Nd' de No resuelto desaparezcan sin pulsar 'Actualizar'. No importa lib/chatter.js: ese
 * modulo ya importa este (test_hub_ventas.mjs comprueba que las dos lecturas coinciden).
 * @param {any} log
 * @returns {boolean}
 */
export function notaReiniciaAtraso(log) {
  if (log?.action !== 'CHATTER' && log?.action !== 'NOTE_ADDED') return false;
  const tipo = log?.extra_data?.tipo;
  return typeof tipo === 'string' && TIPOS_NOTA_REINICIAN_ATRASO.includes(tipo.trim().toUpperCase());
}
