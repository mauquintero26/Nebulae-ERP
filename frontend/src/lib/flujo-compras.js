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

import { congelar } from './flujo.js';
import { humanizarCodigo, tiene } from './estados-pedido.js';
import { fechaLarga } from './fechas-colombia.js';

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
    ayuda: 'Llegó a bodega y falta contarla. Avanza cuando se confirma la recepción.',
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

/**
 * El sublabel de una etapa: la fecha en que se completó; si no está completada y tiene ETA, 'llega {eta}'; si no, la
 * fecha en que cambió (en curso o cancelada). Las fechas, en Colombia con fechaLarga (un instante sin zona es UTC; una
 * fecha de calendario no se corre de día). Nada legible: sin sublabel.
 */
function sublabelDeEtapa(s) {
  const cuando = fechaLarga(s.timestamp);
  if (s.status === 'COMPLETADO') return cuando || null;
  const llega = fechaLarga(s.eta);
  if (llega) return `llega ${llega}`;
  return cuando || null;
}

/**
 * El aviso de una etapa (RP28): rojo solo si alert.nivel es 'atrasado'; con otro nivel (el 'ok' de una etapa a tiempo)
 * el mensaje va como texto neutro ('gris'). Sin mensaje, nada.
 * @returns {AvisoPaso[]}
 */
function avisosDeEtapa(s) {
  const mensaje = textoNoVacio(s.alert?.mensaje);
  if (!mensaje) return [];
  return [{ texto: mensaje, tono: s.alert.nivel === 'atrasado' ? 'rojo' : 'gris' }];
}

/**
 * Las etapas del envío de un PEC (tracking_stages, con el `alert` que calcula el servidor) como pasos de la barra, en el
 * ORDEN DEL ARREGLO (no por nombre: 3 etapas si es directo, 4 si va por casillero, o las que se configuraron):
 *  - COMPLETADO -> 'hecho', EN_PROCESO -> 'actual', PENDIENTE -> 'pendiente' y CANCELADO -> 'cancelado' (RP28); un
 *    estado desconocido, 'pendiente';
 *  - clave: el `stage` (sin él, 'etapa_N' por su posición); label: el de la etapa (sin él, la clave humanizada);
 *  - sublabel: la fecha de la etapa, o 'llega {eta}';
 *  - avisos: el mensaje de la alerta, rojo solo con nivel 'atrasado' (RP28).
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
