/**
 * Estados del Pedido de Venta (N10 + N2): UNA sola fuente de nombres, colores, pasos y reglas para la lista, el
 * detalle, el Hub y la solicitud. JS plano, sin React ni DOM, para probarlo con node
 * (frontend/tests/test_estados_pedido.mjs).
 *
 * Espejo de backend/app/core/textos_actividad.py (ETIQUETAS_ESTADO['VEN']: los nombres) y de
 * backend/app/core/estados_pedido.py (las reglas de cambio de estado por PATCH). Si cambias una etiqueta o una
 * regla, cambia las dos: backend/tests/test_estados_pedido.py comprueba que coincidan.
 *
 * Ningun estado se muestra crudo: cada clave que el backend puede poner esta en ESTADOS_PEDIDO, y una clave
 * nueva sale humanizada ('ALGO_NUEVO' -> 'Algo nuevo') en gris.
 */

/**
 * @typedef {{ bg: string, text: string, border: string }} ClasesEstado
 * @typedef {{ label: string, clases: ClasesEstado, paso: number }} InfoEstadoPedido
 */

/**
 * Congela el objeto y todo lo que cuelga de el: estas tablas son la fuente unica de los estados, y si una
 * pantalla las mutara por accidente se desalinearian todas. Mutarlas lanza TypeError (los modulos ESM son
 * estrictos); para ordenar o filtrar hay que copiar primero ([...lista].sort()). Lo reutilizan las otras tablas de
 * Ventas (estados-solicitud.js).
 * @template T
 * @param {T} valor
 * @returns {T}
 */
export function congelar(valor) {
  if (valor !== null && typeof valor === 'object' && !Object.isFrozen(valor)) {
    Object.values(valor).forEach(congelar);
    Object.freeze(valor);
  }
  return valor;
}

const BASE = congelar({ bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' });

/**
 * Todos los estados que el backend puede poner a un pedido. `paso` es el lugar en el stepper de 5 pasos
 * (PASOS_PEDIDO): 0..4, o -1 para cancelado/devuelto (el stepper no se muestra). Las clases son literales
 * completas para que Tailwind las encuentre.
 * Inmutable.
 * @type {Readonly<Record<string, Readonly<InfoEstadoPedido>>>}
 */
export const ESTADOS_PEDIDO = congelar({
  // Ventas / Compras
  PENDIENTE_COMPRA: { label: 'Pendiente de compra', clases: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' }, paso: 0 },
  EN_PROCESO: { label: 'En proceso', clases: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' }, paso: 1 },
  EN_TRANSITO: { label: 'En tránsito', clases: { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200' }, paso: 1 }, // lo pone el Hub
  LISTO_ENTREGA: { label: 'Listo para entrega', clases: { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' }, paso: 2 },
  ENTREGADO: { label: 'Entregado', clases: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' }, paso: 3 },
  FACTURADO: { label: 'Facturado', clases: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' }, paso: 4 },
  CANCELADO: { label: 'Cancelado', clases: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' }, paso: -1 },
  // ecommerce / store / webhooks
  PENDIENTE_PAGO: { label: 'Pendiente de pago', clases: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' }, paso: 0 },
  PAGADO: { label: 'Pagado', clases: { bg: 'bg-lime-100', text: 'text-lime-700', border: 'border-lime-200' }, paso: 1 },
  // erp_ventas_fase4: recalculate_sale_order_state y ALLOWED_TRANSITIONS_SALE_ORDER
  BORRADOR: { label: 'Borrador', clases: BASE, paso: 0 },
  PENDIENTE_ANTICIPO: { label: 'Pendiente de anticipo', clases: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' }, paso: 0 },
  CONFIRMADO: { label: 'Confirmado', clases: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' }, paso: 0 },
  PARCIALMENTE_DISPONIBLE: { label: 'Parcialmente disponible', clases: { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200' }, paso: 1 },
  DISPONIBLE: { label: 'Disponible', clases: { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' }, paso: 2 },
  PENDIENTE_SALDO: { label: 'Pendiente de saldo', clases: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' }, paso: 2 },
  LISTO_PARA_ENTREGA: { label: 'Listo para entrega', clases: { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' }, paso: 2 },
  PARCIALMENTE_ENTREGADO: { label: 'Entregado parcialmente', clases: { bg: 'bg-lime-100', text: 'text-lime-700', border: 'border-lime-200' }, paso: 2 },
  DEVUELTO_TOTAL: { label: 'Devuelto', clases: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' }, paso: -1 },
});

/**
 * Los 5 pasos del stepper del detalle del pedido; el estado exacto se lee en la etiqueta. Tambien son las pestañas
 * de la lista (con 'Cancelado'). Inmutable.
 * @type {ReadonlyArray<Readonly<{ key: string, label: string }>>}
 */
export const PASOS_PEDIDO = congelar([
  { key: 'PENDIENTE_COMPRA', label: 'Pend. Compra' },
  { key: 'EN_PROCESO', label: 'En Proceso' },
  { key: 'LISTO_ENTREGA', label: 'Listo Entrega' },
  { key: 'ENTREGADO', label: 'Entregado' },
  { key: 'FACTURADO', label: 'Facturado' },
]);

const GRUPO_CANCELADO = 'Cancelado';

/**
 * Estados "en curso": entre ellos el pedido se mueve libremente (espejo de ESTADOS_VEN_OPERATIVOS del backend). Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_PEDIDO_OPERATIVOS = congelar(['PENDIENTE_COMPRA', 'PENDIENTE_PAGO', 'EN_PROCESO', 'EN_TRANSITO', 'LISTO_ENTREGA']);

/**
 * Los que se pueden elegir a mano (panel rapido del Hub, editor del pedido). Una sola lista para todas las
 * pantallas; EN_TRANSITO se mantiene por decision del usuario (N2). Espejo de ESTADOS_VEN_MANUALES. Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_PEDIDO_MANUALES = congelar(['PENDIENTE_COMPRA', 'EN_PROCESO', 'EN_TRANSITO', 'LISTO_ENTREGA']);

/**
 * Estados terminales: no cuentan como pedidos activos. Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_PEDIDO_CERRADOS = congelar(['ENTREGADO', 'FACTURADO', 'CANCELADO', 'DEVUELTO_TOTAL']);

/**
 * Pedidos cuyo dinero no cuenta (ni vendido ni por cobrar): espejo de ESTADOS_VEN_SIN_DINERO
 * (backend/app/core/estados_pedido.py), el mismo criterio del resumen de GET /ventas/pedidos (H47). B4 T2 (RP14): vive
 * aquí y listas-ventas.js la reexporta (una sola constante). Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_PEDIDO_SIN_DINERO = congelar(['CANCELADO', 'DEVUELTO_TOTAL']);

// Un solo arreglo (congelado) compartido por los 5 operativos y por los estados desconocidos.
const DESDE_OPERATIVO = congelar([...ESTADOS_PEDIDO_OPERATIVOS, 'ENTREGADO', 'CANCELADO']);

/**
 * Desde que estado se puede ir a cual por PATCH /ventas/pedidos/{id} (espejo de TRANSICIONES_VEN_PATCH del
 * backend, que es la autoridad: la pantalla solo ofrece lo que el servidor va a aceptar). Inmutable.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const TRANSICIONES_PEDIDO_PATCH = congelar({
  ...Object.fromEntries(ESTADOS_PEDIDO_OPERATIVOS.map((e) => [e, DESDE_OPERATIVO])),
  ENTREGADO: ['FACTURADO'], // 'Facturado' solo se alcanza desde ENTREGADO
  FACTURADO: [],
  CANCELADO: [],
  DEVUELTO_TOTAL: [],
  PARCIALMENTE_ENTREGADO: ['ENTREGADO'],
});

/**
 * true si `obj` tiene la clave PROPIA `clave` (nunca las del prototipo: 'constructor', 'toString'...); null o
 * undefined -> false. El único chequeo de claves de las librerías de Ventas.
 * @param {any} obj
 * @param {any} clave
 * @returns {boolean}
 */
export function tiene(obj, clave) {
  return obj !== null && obj !== undefined && Object.prototype.hasOwnProperty.call(obj, clave);
}

/**
 * B2: codigos que no estan en ninguna tabla de documentos pero todavia se pueden mostrar (EN_GESTION: ningun documento
 * tiene ese estado; desde B4 T2, RP2, ya no esta en ESTADOS_NO_RESOLUCION de hub-ventas.js, y el Hub viejo lo conserva en
 * sus colores hasta T7): su nombre con tilde, en vez del respaldo humanizado ('En gestion'). Inmutable.
 * @type {Readonly<Record<string, string>>}
 */
const ETIQUETAS_SIN_TABLA = congelar({ EN_GESTION: 'En gestión' });

/** 'PENDIENTE_ALGO' -> 'Pendiente algo' (igual que etiqueta_estado del backend); null/undefined/'' -> ''. */
function humanizar(e) {
  if (typeof e === 'string' && tiene(ETIQUETAS_SIN_TABLA, e)) return ETIQUETAS_SIN_TABLA[e];
  const texto = e === null || e === undefined ? '' : String(e).trim().replace(/_/g, ' ').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** El mismo respaldo para otros codigos de Ventas sin mapa propio (estados de pago o de PXP): nunca el codigo crudo. */
export const humanizarCodigo = humanizar;

/**
 * Etiqueta, clases de color y paso de un estado de pedido. Una clave desconocida sale humanizada, en gris y en
 * el primer paso: nunca el codigo crudo.
 * @returns {Readonly<InfoEstadoPedido>}
 */
export function infoEstadoPedido(e) {
  if (typeof e === 'string' && tiene(ESTADOS_PEDIDO, e)) return ESTADOS_PEDIDO[e];
  return congelar({ label: humanizar(e), clases: { ...BASE }, paso: 0 });
}

/** Lugar del estado en el stepper: 0..4, o -1 si esta cancelado o devuelto. Un estado desconocido va al primer paso (la etiqueta dice el estado real). */
export function pasoPedido(e) {
  return infoEstadoPedido(e).paso;
}

/**
 * Pestaña de la lista de pedidos a la que pertenece: 'Pend. Compra', 'En Proceso', 'Listo Entrega', 'Entregado',
 * 'Facturado' o 'Cancelado' (DEVUELTO_TOTAL va a Cancelado). Un estado desconocido no cae en ninguna: null, asi
 * que solo aparece en 'Todos'.
 * @returns {string | null}
 */
export function grupoPedido(e) {
  if (typeof e !== 'string' || !tiene(ESTADOS_PEDIDO, e)) return null;
  const { paso } = ESTADOS_PEDIDO[e];
  return paso < 0 ? GRUPO_CANCELADO : PASOS_PEDIDO[paso].label;
}

/**
 * A que estados se puede pasar desde `e` por PATCH. Un estado que no esta en la tabla (heredado, como PAGADO de
 * la tienda, o desconocido) se trata como operativo, igual que en el backend.
 * @returns {ReadonlyArray<string>}
 */
export function transicionesPedido(e) {
  return typeof e === 'string' && tiene(TRANSICIONES_PEDIDO_PATCH, e) ? TRANSICIONES_PEDIDO_PATCH[e] : DESDE_OPERATIVO;
}

/** Un pedido vigente es cualquiera que no este cancelado (criterio de N4, N7 y H46). */
export function esPedidoVigente(e) {
  return e !== 'CANCELADO';
}

/** Una cotizacion activa es cualquiera que no este rechazada: VENCIDA cuenta como activa (decision N4; la usan N4, N7, H3 y H46). */
export function esCotizacionActiva(e) {
  return e !== 'RECHAZADA';
}
