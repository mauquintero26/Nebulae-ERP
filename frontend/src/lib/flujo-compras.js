/**
 * El flujo de Compras, presentación (Bloque 4, T3B: FLUJO-compras punto 4; R9, RP21 y RP28). JS plano, sin React ni
 * DOM, para probarlo con node (frontend/tests/test_flujo_compras.mjs). Imports relativos con extensión: node no
 * resuelve '@/'.
 *
 *  - PASOS_FLUJO_COMPRAS: Lista de compras → Pedido de compra → En tránsito → Recepción en bodega → Recibido (las claves
 *    de PASOS_FLUJO_COMPRAS de core/estados_compras.py), con sufijo, tono, icono, ruta y ayuda. Recibido abre la vista
 *    'recibidos' de Pedidos de compra (?tab=recibidos, RP21).
 *  - ETIQUETA_ETAPA_TRACKING / etiquetaEtapaTracking: los estados de una etapa del envío en palabras.
 *  - pasosDeTracking(stages): las etapas reales del envío de un PEC (3 si es directo, 4 si va por casillero), en el
 *    orden del arreglo, para la barra del seguimiento y la columna Progreso de Tránsito.
 *  - textoReglaCompras(): la regla de la franja. El atraso de un PEC es esPecVencido de estados-compras.js (T2): ya pasó
 *    la fecha de entrega estimada, sin días de tolerancia (R9). esPecVencido y pasoFlujoPec (el paso de un PEC en este
 *    flujo) se re-exportan de ahí: son las mismas funciones, no copias. No hay aquí otra regla de atraso con tolerancia
 *    ni un espejo propio de la etapa (RP28, RP93).
 */

import { congelar, conteosDePasos, pasosConConteos } from './flujo.js';
import { humanizarCodigo, tiene } from './estados-pedido.js';
import { diaColombia, fechaLarga } from './fechas-colombia.js';
import { formatoEntero } from './kpis.js';
import { GRUPOS_PEC, diaPec, etapaPec, vistaPuedeVencer } from './estados-compras.js';
// B4 T14 r1 (m1; D41, D42): las cajas y «Con atraso» cambian la vista con accionPestana, como el Hub de Ventas.
import { accionPestana, opcionesDeVista } from './tabla.js';

export { esPecVencido, pasoFlujoPec } from './estados-compras.js';

/**
 * @typedef {import('./flujo.js').PasoVista} PasoVista
 * @typedef {import('./flujo.js').AvisoPaso} AvisoPaso
 * @typedef {import('./flujo.js').EstadoPaso} EstadoPaso
 * @typedef {import('./flujo.js').TonoPaso} TonoPaso
 * @typedef {import('./flujo.js').ClaveIcono} ClaveIcono
 * @typedef {'LISTA' | 'PEC' | 'TRANSITO' | 'RECEPCION' | 'RECIBIDO'} ClavePasoCompras
 * @typedef {{clave: ClavePasoCompras, label: string, sufijo: string, tono: TonoPaso, icono: ClaveIcono, ruta: string,
 *   ayuda: string}} PasoFlujoCompras
 * @typedef {'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO' | 'CANCELADO'} EstadoEtapaTracking
 * @typedef {{stage?: string, label?: string, status?: string, timestamp?: string | null, eta?: string | null,
 *   alert?: {nivel?: string, mensaje?: string, dias_restantes?: number} | null}} EtapaTracking
 */

/**
 * Los 5 pasos del flujo de Compras, en orden (R9). Inmutable.
 * @type {ReadonlyArray<Readonly<PasoFlujoCompras>>}
 */
export const PASOS_FLUJO_COMPRAS = congelar([
  {
    clave: 'LISTA', label: 'Lista de compras', sufijo: 'por comprar', tono: 'amber', icono: 'lista',
    ruta: '/dashboard/compras/lista-compras',
    ayuda: 'Lo que hay que comprar para los pedidos de venta. Avanza cuando se incluye en un pedido de compra.',
  },
  {
    clave: 'PEC', label: 'Pedido de compra', sufijo: 'sin despachar', tono: 'purple', icono: 'compra',
    ruta: '/dashboard/compras/pedidos',
    ayuda: 'El pedido al proveedor, en borrador o emitido. Avanza cuando empieza el seguimiento del envío.',
  },
  {
    clave: 'TRANSITO', label: 'En tránsito', sufijo: 'en camino', tono: 'indigo', icono: 'transito',
    ruta: '/dashboard/compras/transito',
    ayuda: 'La mercancía va en camino. Con atraso si ya pasó la fecha de entrega estimada. Avanza cuando llega a bodega.',
  },
  {
    clave: 'RECEPCION', label: 'Recepción en bodega', sufijo: 'por confirmar', tono: 'teal', icono: 'recepcion',
    ruta: '/dashboard/compras/recepciones',
    ayuda: 'Llegó a bodega, toda o en parte, y falta confirmarla. Avanza cuando se confirma la recepción.',
  },
  {
    clave: 'RECIBIDO', label: 'Recibido', sufijo: 'recibidos', tono: 'emerald', icono: 'recibido',
    ruta: '/dashboard/compras/pedidos?tab=recibidos',
    ayuda: 'Recepción confirmada en bodega. Pedido de compra cerrado.',
  },
]);

/**
 * Los estados de una etapa del envío (los de validate_status de schemas_compras.py) en palabras (RP28 suma
 * CANCELADO). Inmutable.
 * @type {Readonly<Record<EstadoEtapaTracking, string>>}
 */
export const ETIQUETA_ETAPA_TRACKING = congelar({
  PENDIENTE: 'Pendiente', EN_PROCESO: 'En curso', COMPLETADO: 'Completada', CANCELADO: 'Cancelada',
});

/**
 * El estado de una etapa del envío en palabras; uno desconocido sale humanizado ('ALGO_NUEVO' -> 'Algo nuevo'), nunca
 * el código crudo; null o vacío dan ''.
 * @param {unknown} estado
 * @returns {string}
 */
export function etiquetaEtapaTracking(estado) {
  return typeof estado === 'string' && tiene(ETIQUETA_ETAPA_TRACKING, estado)
    ? ETIQUETA_ETAPA_TRACKING[/** @type {EstadoEtapaTracking} */ (estado)]
    : humanizarCodigo(estado);
}

/** El estado de la caja de cada estado de etapa; uno desconocido queda 'pendiente'. */
const ESTADO_DE_ETAPA = congelar({ COMPLETADO: 'hecho', EN_PROCESO: 'actual', PENDIENTE: 'pendiente', CANCELADO: 'cancelado' });

const textoNoVacio = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Las etapas que ya no esperan nada: completada o cancelada (r1). */
const ETAPAS_CERRADAS = congelar(['COMPLETADO', 'CANCELADO']);

/**
 * El sublabel de una etapa: completada o cancelada, la fecha en que cambió (r1: una cancelada no «llega»); si no y
 * tiene ETA, 'llega {eta}'; si no, la fecha en que cambió (en curso). Las fechas, en Colombia con fechaLarga (un
 * instante sin zona es UTC; una fecha de calendario no se corre de día). Nada legible: sin sublabel.
 */
function sublabelDeEtapa(s) {
  const cuando = fechaLarga(s.timestamp);
  if (ETAPAS_CERRADAS.includes(s.status)) return cuando || null;
  const llega = fechaLarga(s.eta);
  if (llega) return `llega ${llega}`;
  return cuando || null;
}

/**
 * El aviso de una etapa (RP28): rojo solo si alert.nivel es 'atrasado'; con otro nivel (el 'ok' de una etapa a tiempo)
 * el mensaje va como texto neutro ('gris'). Sin mensaje, nada. Una etapa CANCELADO no lleva avisos (r1): _stage_alert
 * del servidor solo deja fuera COMPLETADO y también le calcula el atraso.
 * @returns {AvisoPaso[]}
 */
function avisosDeEtapa(s) {
  const mensaje = textoNoVacio(s.alert?.mensaje);
  if (!mensaje || s.status === 'CANCELADO') return [];
  return [{ texto: mensaje, tono: s.alert.nivel === 'atrasado' ? 'rojo' : 'gris' }];
}

/**
 * Las etapas del envío de un PEC (tracking_stages, con el `alert` que calcula el servidor) como pasos de la barra, en el
 * ORDEN DEL ARREGLO (no por nombre: 3 etapas si es directo, 4 si va por casillero, o las que se configuraron):
 *  - COMPLETADO -> 'hecho', EN_PROCESO -> 'actual', PENDIENTE -> 'pendiente' y CANCELADO -> 'cancelado' (RP28); un
 *    estado desconocido, 'pendiente';
 *  - clave: el `stage` (sin él, 'etapa_N' por su posición); label: el de la etapa (sin él, la clave humanizada);
 *  - sublabel: la fecha de la etapa, o 'llega {eta}' (nunca en una completada o cancelada);
 *  - avisos: el mensaje de la alerta, rojo solo con nivel 'atrasado' (RP28); ninguno en una cancelada (r1).
 * Lo que no es un arreglo da []; los elementos que no son objetos se saltan.
 * @param {ReadonlyArray<EtapaTracking | null | undefined> | null | undefined} stages
 * @returns {PasoVista[]}
 */
export function pasosDeTracking(stages) {
  if (!Array.isArray(stages)) return [];
  /** @type {PasoVista[]} */
  const pasos = [];
  stages.forEach((s, i) => {
    if (s === null || typeof s !== 'object') return;
    const clave = textoNoVacio(s.stage) ?? `etapa_${i + 1}`;
    const estado = typeof s.status === 'string' && tiene(ESTADO_DE_ETAPA, s.status)
      ? /** @type {EstadoPaso} */ (/** @type {any} */ (ESTADO_DE_ETAPA)[s.status])
      : 'pendiente';
    /** @type {PasoVista} */
    const paso = {
      clave,
      label: textoNoVacio(s.label) ?? (textoNoVacio(s.stage) ? humanizarCodigo(clave) : `Etapa ${i + 1}`),
      estado,
      avisos: avisosDeEtapa(s),
    };
    const sublabel = sublabelDeEtapa(s);
    if (sublabel) paso.sublabel = sublabel;
    pasos.push(paso);
  });
  return pasos;
}

/**
 * La regla de atraso de la franja de Compras (R9; la de esPecVencido, sin días de tolerancia). Sin parámetro (RP28).
 * @returns {string}
 */
export function textoReglaCompras() {
  return 'Con atraso: ya pasó la fecha de entrega estimada';
}

// ─── La franja del Hub de Compras (B4 T14: FLUJO-compras punto 5; R5, R9, C3, RP46, D36, D42) ────────

/** La ruta del Hub de Compras (la de «Ver análisis» de las listas: ?tab=analisis, R13). */
export const RUTA_HUB_COMPRAS = '/dashboard/compras';

/**
 * Las cajas que filtran la tabla del Hub: la pestaña que les corresponde y los estados de su etapa (vacío = la pestaña
 * entera). Pedido de compra es la pestaña «Pedidos de compra» (borrador y emitido) y En tránsito la suya; Recibido va en
 * «Acciones tomadas» (recibido + cancelado) con el filtro de su etapa. Lista de compras y Recepción en bodega son enlaces
 * a su pantalla (su `ruta`).
 */
const FILTRO_DE_PASO = congelar({
  PEC: { vista: 'pedidos', estados: [] },
  TRANSITO: { vista: 'en_transito', estados: [] },
  RECIBIDO: { vista: 'acciones_tomadas', estados: ['RECIBIDA', 'COMPLETADO'] },
});
const PASOS_CON_ENLACE = congelar(['LISTA', 'RECEPCION']);

const mismosEstados = (a, b) => a.length === b.length && a.every((e) => b.includes(e));

/**
 * B4 T14: la caja de la franja que marca el estado único de la tabla (R5): PEC con la pestaña «Pedidos de compra»,
 * TRANSITO con «En tránsito» y RECIBIDO con «Acciones tomadas» filtrada a su etapa (RECIBIDA y COMPLETADO, en cualquier
 * orden). Ninguna en Kanban (las pestañas no se ven: la caja abre su pestaña en Lista) ni con otra vista.
 * @param {Partial<import('./tabla.js').EstadoTabla> | null | undefined} estado
 * @returns {'PEC' | 'TRANSITO' | 'RECIBIDO' | null}
 */
export function pasoHubComprasDe(estado) {
  if (!estado || estado.modo === 'kanban') return null;
  const estados = Array.isArray(estado.estados) ? estado.estados : [];
  for (const [clave, filtro] of Object.entries(FILTRO_DE_PASO)) {
    if (estado.vista !== filtro.vista) continue;
    if (filtro.estados.length === 0 || mismosEstados(estados, filtro.estados)) return /** @type {any} */ (clave);
  }
  return null;
}

/** Una acción de la tabla como {campo: valor}, para sumarle campos en una sola acción {tipo: 'cambiar'}. */
const comoCambios = (accion) => (accion.tipo === 'cambiar' ? { ...accion.cambios } : { [accion.tipo]: accion.valor });

/**
 * B4 T14 (clic_en_hub, R5, C3); r1 (m1; D41, D42): lo que despacha el clic en una caja de la franja del Hub. Pedido de
 * compra y En tránsito abren su pestaña con accionPestana (con las opciones de la Lista: lo filtrado que vale en la
 * pestaña nueva se conserva y lo que no, se poda), como las cajas del Hub de Ventas. Recibido abre «Acciones tomadas» y,
 * además, filtra los estados de su etapa (RECIBIDA y COMPLETADO): /compras/pedidos no acepta `paso`. Tocar la caja
 * marcada vuelve a Todos (R6; Recibido suelta además los estados de su etapa). El semáforo no se toca, salvo en una caja
 * cuyos estados nunca vencen (Recibido): ahí se apaga, porque si no la tabla queda vacía (cierre de T14). En Kanban la caja
 * abre su pestaña en Lista (como las tarjetas de T10). Lista de compras, Recepción en bodega o una clave desconocida:
 * null (son enlaces).
 * @param {Partial<import('./tabla.js').EstadoTabla> | null | undefined} estado
 * @param {unknown} clave
 * @param {import('./tabla.js').OpcionesEstados | null | undefined} opciones  las de la Lista (opcionesEstadosPec)
 * @returns {import('./tabla.js').AccionTabla | null}
 */
export function accionPasoHubCompras(estado, clave, opciones) {
  if (typeof clave !== 'string' || !tiene(FILTRO_DE_PASO, clave)) return null;
  const e = /** @type {any} */ (estado);
  const enKanban = estado?.modo === 'kanban';
  const filtro = /** @type {{vista: string, estados: ReadonlyArray<string>}} */ (/** @type {any} */ (FILTRO_DE_PASO)[clave]);
  /** @type {any} */
  let accion;
  if (!enKanban && pasoHubComprasDe(estado) === clave) {
    accion = filtro.estados.length > 0
      ? { tipo: 'cambiar', cambios: { vista: 'todos', estados: [] } }
      : accionPestana(e, 'todos', opciones);
  } else if (filtro.estados.length > 0) {
    const nuncaVencen = !filtro.estados.some((x) => GRUPOS_PEC.vencibles.includes(x));
    accion = { tipo: 'cambiar', cambios: { vista: filtro.vista, estados: [...filtro.estados] } };
    if (nuncaVencen && filtroSemaforoCompras(estado) === 'atrasados') accion.cambios.semaforo = null;
  } else {
    accion = accionPestana(e, filtro.vista, opciones);
  }
  return enKanban ? { tipo: 'cambiar', cambios: { ...comoCambios(accion), modo: 'lista' } } : accion;
}

/**
 * B4 T14 (D36, D42): los pasos de la franja del Hub de Compras: pasosConConteos de PASOS_FLUJO_COMPRAS con los conteos
 * de GET /compras/flujo (conteosDePasos; sin datos, todos en null: la barra gris de Contador, nunca 0), la caja marcada
 * (pasoHubComprasDe) y el `href` de las que son enlaces (Lista de compras y Recepción en bodega, su `ruta`). Ninguna es
 * «Estás aquí»: el Hub no es la pantalla de un paso.
 * @param {any} datos  res.data de /compras/flujo (null mientras carga)
 * @param {Partial<import('./tabla.js').EstadoTabla> | null | undefined} estado
 * @returns {PasoVista[]}
 */
export function pasosHubCompras(datos, estado) {
  const pasos = pasosConConteos(PASOS_FLUJO_COMPRAS, conteosDePasos(datos), {
    seleccionado: pasoHubComprasDe(estado), cargando: !datos,
  });
  return pasos.map((p) => (PASOS_CON_ENLACE.includes(p.clave) && p.ruta ? { ...p, href: p.ruta } : p));
}

/** El valor de 'semaforo' de GET /compras/pedidos para «Con atraso» (R5; 'atrasados' es su sinónimo desde T12 r1). */
const SEMAFORO_VENCIDOS = 'vencidos';

/**
 * B4 T14 (RP40); r1 (m1; D41, D42): lo que despacha un botón del semáforo de la franja del Hub. «Ver todo» quita el
 * filtro; «Con atraso» pone semaforo=vencidos (la regla del servidor: emitido o en tránsito con la entrega pasada) sin
 * cambiar de pestaña ni podar el filtro, como el Hub de Ventas. Solo si la vista activa no puede tener atrasos (en
 * bodega, acciones tomadas) pasa a Todos con accionPestana (como Pedidos de venta, T10), en la misma acción. En Lista,
 * la poda usa las opciones de Todos que pueden vencer (GRUPOS_PEC.vencibles; T8 r2b: no caer en una tabla vacía): el
 * filtro RECIBIDA y COMPLETADO de la caja Recibido se quita. En Kanban se poda con las opciones del tablero, y sin
 * opciones el filtro no se toca (cierre de T14).
 * B4 T15 (aditivo): `extra.vistaTodos` es la pestaña «Todos» de la pantalla a la que se pasa ('vigentes' en Pedidos de
 * compra, RP21); sin ella (el Hub), o si no es un texto con algo, 'todos', como antes.
 * @param {Partial<import('./tabla.js').EstadoTabla> | null | undefined} estado
 * @param {unknown} filtro  el FiltroSemaforo de BannerFlujo
 * @param {import('./tabla.js').OpcionesEstados | null | undefined} opciones  las del modo que se ve
 * @param {{vistaTodos?: unknown} | null} [extra]
 * @returns {import('./tabla.js').AccionTabla}
 */
export function accionSemaforoCompras(estado, filtro, opciones, extra) {
  if (filtro !== 'atrasados') return { tipo: 'semaforo', valor: null };
  if (vistaPuedeVencer(estado?.vista)) return { tipo: 'semaforo', valor: SEMAFORO_VENCIDOS };
  const vistaTodos = typeof extra?.vistaTodos === 'string' && extra.vistaTodos ? extra.vistaTodos : 'todos';
  const podar = estado?.modo === 'kanban' || opciones === null || opciones === undefined
    ? opciones
    : (/** @type {string | null} */ v) => opcionesDeVista(opciones, v).filter((o) => GRUPOS_PEC.vencibles.includes(o.valor));
  const accion = accionPestana(/** @type {any} */ (estado), vistaTodos, podar);
  return /** @type {any} */ ({ tipo: 'cambiar', cambios: { ...comoCambios(accion), semaforo: SEMAFORO_VENCIDOS } });
}

/**
 * B4 T14: el FiltroSemaforo de la franja ('atrasados' o 'todos') según el semáforo del estado único ('vencidos', o su
 * sinónimo 'atrasados').
 * @param {Partial<import('./tabla.js').EstadoTabla> | null | undefined} estado
 * @returns {'atrasados' | 'todos'}
 */
export function filtroSemaforoCompras(estado) {
  return estado?.semaforo === SEMAFORO_VENCIDOS || estado?.semaforo === 'atrasados' ? 'atrasados' : 'todos';
}

/**
 * B4 T14 (RP46, R9): los avisos de la franja del Hub: «N recepciones por confirmar» (las GoodsReceipt en BORRADOR, de
 * pasos.RECEPCION.recepciones_por_confirmar de /compras/flujo), en ámbar y sin onClick (la caja Recepción en bodega ya es
 * el enlace). Sin un número positivo, ninguno.
 * @param {any} datos
 * @returns {{texto: string, tono: 'ambar'}[]}
 */
export function avisosFlujoCompras(datos) {
  const n = datos?.pasos?.RECEPCION?.recepciones_por_confirmar;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return [];
  return [{ texto: `${formatoEntero(n)} ${n === 1 ? 'recepción' : 'recepciones'} por confirmar`, tono: 'ambar' }];
}

/**
 * B4 T14 (R13): lo que pide el enlace del Hub de Compras (el `location.search` que la pantalla lee en el navegador al
 * montar): ?tab=analisis abre la pestaña Análisis («Ver análisis» de Pedidos de compra, Lista de compras y Traslados).
 * @param {unknown} search
 * @returns {{analisis: boolean}}
 */
export function leerEnlaceHubCompras(search) {
  if (typeof search !== 'string' || !search) return { analisis: false };
  const tab = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('tab');
  return { analisis: typeof tab === 'string' && tab.trim() === 'analisis' };
}

// ─── La lista de Pedidos de compra (B4 T15: FLUJO-compras punto 6; R9, R13, RP21, D42) ────────

/**
 * R13: «Ver análisis» de las listas de Compras (Pedidos de compra, Lista de compras y Traslados): la pestaña Análisis
 * del Hub (la lee leerEnlaceHubCompras).
 */
export const ENLACE_VER_ANALISIS_COMPRAS = `${RUTA_HUB_COMPRAS}?tab=analisis`;

/** RP21: las cajas de la franja que son una pestaña de Pedidos de compra (la clave de su vista de GET /compras/pedidos). */
const VISTA_DE_PASO_PEDIDOS = congelar({ TRANSITO: 'en_transito', RECIBIDO: 'recibidos' });

/** Las pestañas de Pedidos de compra (R9), con la clave de su vista: Todos es 'vigentes' (RP21). */
const VISTAS_LISTA_PEDIDOS_COMPRA = congelar(['vigentes', 'activos', 'en_transito', 'recibidos', 'cancelados']);

/**
 * B4 T15 (RP21): la pestaña de Pedidos de compra que abre la caja `clave` de la franja: TRANSITO -> 'en_transito' y
 * RECIBIDO -> 'recibidos' (están en la misma página). Otra clave: null.
 * @param {unknown} clave
 * @returns {'en_transito' | 'recibidos' | null}
 */
export function vistaDePasoPedidosCompra(clave) {
  return typeof clave === 'string' && tiene(VISTA_DE_PASO_PEDIDOS, clave) ? /** @type {any} */ (VISTA_DE_PASO_PEDIDOS)[clave] : null;
}

/**
 * B4 T15 (RP21): la pestaña que pide el enlace de Pedidos de compra (?tab=, del `location.search` que la pantalla lee en
 * el navegador al montar): una de sus 5 vistas (vigentes, activos, en_transito, recibidos o cancelados), sin los espacios
 * de los bordes. Un valor desconocido se ignora (null). El ?id del enlace profundo no se toca.
 * @param {unknown} search
 * @returns {string | null}
 */
export function leerEnlacePedidosCompra(search) {
  if (typeof search !== 'string' || !search) return null;
  const tab = (new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('tab') ?? '').trim();
  return VISTAS_LISTA_PEDIDOS_COMPRA.includes(tab) ? tab : null;
}

/**
 * B4 T15 (FLUJO-compras punto 6; RP21, D36, D42): los pasos de la franja de Pedidos de compra: pasosConConteos de
 * PASOS_FLUJO_COMPRAS con los conteos de GET /compras/flujo (conteosDePasos; sin datos, en null) y «Estás aquí» en Pedido
 * de compra (actual 'PEC', sin href). En tránsito y Recibido están en esta misma página: sin href (la pantalla los
 * despacha como su pestaña) y marcados (seleccionado) cuando `vista` es la suya. Lista de compras y Recepción en bodega
 * llevan el href de su pantalla.
 * @param {any} datos  res.data de /compras/flujo (null mientras carga)
 * @param {string | null | undefined} vista  la pestaña que se ve (null en Kanban)
 * @returns {PasoVista[]}
 */
export function pasosPedidosCompra(datos, vista) {
  const pasos = pasosConConteos(PASOS_FLUJO_COMPRAS, conteosDePasos(datos), { actual: 'PEC', cargando: !datos });
  return pasos.map((p) => {
    if (p.esEste) return p;
    const vistaDelPaso = vistaDePasoPedidosCompra(p.clave);
    if (vistaDelPaso) return { ...p, seleccionado: vista === vistaDelPaso };
    return p.ruta ? { ...p, href: p.ruta } : p;
  });
}

const MS_DIA = 24 * 60 * 60 * 1000;
/** Los milisegundos UTC de un 'AAAA-MM-DD' (para restar días de calendario sin zonas ni horas de verano). */
const msDelDia = (dia) => {
  const [anio, mes, d] = dia.split('-').map(Number);
  return Date.UTC(anio, mes - 1, d);
};

/**
 * B4 T15 (resolución 4: un día de calendario contra diaColombia()): cuánto falta para la ETA de una etapa del envío,
 * para su tarjeta del TrackingPanel. El día es el que se guarda (diaPec, RP40: los 10 primeros caracteres, sin pasarlo a
 * Colombia) y se compara con `hoy` (por defecto, el día de Colombia):
 *  - después de hoy: '1 día restante' / 'N días restantes', tono 'azul';
 *  - hoy: 'Vence hoy', tono 'ambar';
 *  - antes de hoy: '1 día de atraso' / 'N días de atraso', tono 'rojo'.
 * Sin ETA, o con algo que no es un día (o un `hoy` que no lo es): null.
 * @param {unknown} eta
 * @param {string} [hoy]  'AAAA-MM-DD'
 * @returns {{texto: string, tono: 'azul' | 'ambar' | 'rojo'} | null}
 */
export function textoDiasEtapa(eta, hoy = diaColombia()) {
  const dia = diaPec(eta);
  const base = diaPec(hoy);
  if (!dia || !base) return null;
  const dias = Math.round((msDelDia(dia) - msDelDia(base)) / MS_DIA);
  if (dias === 0) return { texto: 'Vence hoy', tono: 'ambar' };
  const n = Math.abs(dias);
  if (dias > 0) return { texto: `${formatoEntero(n)} ${n === 1 ? 'día restante' : 'días restantes'}`, tono: 'azul' };
  return { texto: `${formatoEntero(n)} ${n === 1 ? 'día de atraso' : 'días de atraso'}`, tono: 'rojo' };
}

// ─── El seguimiento del envío en las pantallas (B4 T15 r1: m2, m4, m6 y m14) ────────

/** El texto de un seguimiento cerrado (el panel de la lista, el del Hub y el detalle dicen lo mismo). */
export const TEXTO_SEGUIMIENTO_CERRADO = 'Pedido de compra cancelado: su envío ya no se sigue.';

/**
 * B4 T15 r1 (m4, m14): el seguimiento del envío de un PEC cancelado es de solo lectura en todas las pantallas (los dos
 * paneles y el detalle): sin la barra de pasos, sin «En proceso», «Completado», «Revertir» ni «Avanzar etapa». Es la
 * etapa de estados-compras.js (etapaPec): solo CANCELADO.
 * @param {unknown} estado  el estado del PEC
 * @returns {boolean}
 */
export function seguimientoCerrado(estado) {
  return etapaPec(estado) === 'cancelado';
}

/**
 * B4 T15 r1 (m2, m6): el aviso de la tarjeta de una etapa del envío, con UNA sola regla:
 *  - completada o cancelada: ninguno (como la barra);
 *  - con el aviso del servidor (`alert` con mensaje, _stage_alert): ese, en rojo si va atrasada y en el tono neutro
 *    ('gris', el de la barra: RP28, D36) si no; fuente 'servidor';
 *  - sin él: los días que faltan para la ETA (textoDiasEtapa, el día de calendario de Colombia); fuente 'dias'.
 * Lo que no es una etapa, o sin aviso ni ETA: null.
 * @param {EtapaTracking | null | undefined} stage
 * @param {string} [hoy]  'AAAA-MM-DD' (por defecto, diaColombia())
 * @returns {{texto: string, tono: 'rojo' | 'gris' | 'azul' | 'ambar', fuente: 'servidor' | 'dias'} | null}
 */
export function avisoTarjetaEtapa(stage, hoy = diaColombia()) {
  if (stage === null || typeof stage !== 'object') return null;
  if (ETAPAS_CERRADAS.includes(/** @type {any} */ (stage.status))) return null;
  const mensaje = textoNoVacio(stage.alert?.mensaje);
  if (mensaje) return { texto: mensaje, tono: stage.alert?.nivel === 'atrasado' ? 'rojo' : 'gris', fuente: 'servidor' };
  const dias = textoDiasEtapa(stage.eta, hoy);
  return dias ? { ...dias, fuente: 'dias' } : null;
}

// ─── Tránsito y Recepciones (B4 T16A: FLUJO-compras puntos 8 y 9; R9, D36, D42) ────────

/**
 * Los pasos de la franja de Mercancía en tránsito (actual 'TRANSITO') y de Recepciones (actual 'RECEPCION'):
 * pasosConConteos de PASOS_FLUJO_COMPRAS con los conteos de GET /compras/flujo (conteosDePasos; sin datos, en null: la barra
 * gris, nunca 0) y «Estás aquí» en la caja de la pantalla (sin href, D42). Las demás cajas son enlaces a su pantalla (su
 * `ruta`: la de Recibido abre Pedidos de compra en su pestaña, RP21).
 * @param {any} datos  res.data de /compras/flujo (null mientras carga)
 * @param {'TRANSITO' | 'RECEPCION'} actual
 * @returns {PasoVista[]}
 */
export function pasosPantallaCompras(datos, actual) {
  const pasos = pasosConConteos(PASOS_FLUJO_COMPRAS, conteosDePasos(datos), { actual, cargando: !datos });
  return pasos.map((p) => (!p.esEste && p.ruta ? { ...p, href: p.ruta } : p));
}
