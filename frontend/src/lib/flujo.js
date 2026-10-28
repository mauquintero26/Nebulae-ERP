/**
 * La base del diagrama del flujo (Bloque 4, T3B: FLUJO-base punto 1; R4, C13, RP67, RP75, RP87 y D21): UNA sola forma de
 * armar los pasos que pintan la franja del flujo (BannerFlujo) y las barras de los documentos (PasosFlujo), en Ventas,
 * en Compras y en los detalles. JS plano, sin React ni DOM, para probarlo con node (frontend/tests/test_flujo.mjs).
 * Imports relativos con extensión: node no resuelve '@/'.
 *
 *  - congelar es la de estados-pedido.js, re-exportada (no una copia).
 *  - pasosConProgreso: las barras de los documentos (hecho, actual, pendiente, cancelado). Acepta pasos con `key`
 *    (PASOS_PEDIDO) o con `clave` (PASOS_SC, PASOS_COTIZACION) (RP87).
 *  - conteosDePasos (r1): la única conversión de res.data.pasos de GET /ventas/flujo o /compras/flujo (snake_case) a
 *    la forma de pasosConConteos (camelCase).
 *  - pasosConConteos: la franja (los números por paso, el actual y el elegido).
 *  - El chequeo de claves es tiene() de estados-pedido.js (sin copia propia).
 *  - textoConteo, textoAtraso, alternarSeleccion y resumenSemaforo: los textos y el clic de la franja.
 * No lee ni escribe ningún almacenamiento (R4): el modo compacto de la franja lo guarda BannerFlujo con
 * usePreferencia('flujo:<id>') (T5A). La regla de atraso NO vive aquí: Ventas la trae del servidor (resolucion_ventas.py,
 * espejo en hub-ventas.js) y Compras usa esPecVencido de estados-compras.js.
 *
 * Carga (C13, RP33, D21): mientras un número carga, su total llega en null y PasosFlujo pinta
 * <Contador estado="cargando"/> (la barra gris); el «—» de textoConteo es solo para el error.
 */

import { congelar, tiene } from './estados-pedido.js';
import { cantidadPositiva } from './hub-ventas.js';
import { formatoEntero } from './kpis.js';

export { congelar };

/**
 * @typedef {'hecho' | 'actual' | 'pendiente' | 'cancelado' | 'neutro'} EstadoPaso
 * @typedef {'indigo' | 'amber' | 'emerald' | 'teal' | 'purple'} TonoPaso
 * @typedef {'solicitud' | 'cotizacion' | 'pedido' | 'entrega' | 'factura'
 *   | 'lista' | 'compra' | 'transito' | 'recepcion' | 'recibido'} ClaveIcono
 * @typedef {'ambar' | 'rojo' | 'gris'} TonoAviso
 *   'gris' es el texto neutro (el mensaje de una etapa de envío a tiempo, RP28): el mismo vocabulario de los avisos
 *   de BannerFlujo.
 * @typedef {{texto: string, tono: TonoAviso}} AvisoPaso
 * @typedef {{label: string, n: number}} DetallePaso
 * @typedef {{
 *   clave: string, label: string, sufijo?: string, sublabel?: string,
 *   total?: number | null, atrasados?: number | null, masAntiguoDias?: number | null,
 *   detalle?: ReadonlyArray<DetallePaso> | null, avisos?: ReadonlyArray<AvisoPaso> | null,
 *   estado: EstadoPaso, esEste?: boolean, seleccionado?: boolean, href?: string, ruta?: string, ayuda?: string,
 *   tono?: TonoPaso, icono?: ClaveIcono,
 * }} PasoVista
 *   Un paso tal como se pinta. `ruta` es la de la definición (PASOS_FLUJO_VENTAS, PASOS_FLUJO_COMPRAS): la pantalla decide
 *   si la caja es un enlace (`href`) o un botón que filtra (onSeleccionar); las librerías solo ponen `href` en
 *   cadenaVentas.
 * @typedef {{
 *   clave?: string, key?: string, label: string, sufijo?: string, sublabel?: string, ayuda?: string, tono?: TonoPaso,
 *   icono?: ClaveIcono, ruta?: string,
 * }} DefinicionPaso
 *   Un paso de una definición: con `clave` o, como PASOS_PEDIDO, con `key` (RP87).
 * @typedef {{
 *   total?: number | null, atrasados?: number | null, masAntiguoDias?: number | null,
 *   porEstado?: Readonly<Record<string, number>> | null,
 *   detalle?: ReadonlyArray<DetallePaso> | null, avisos?: ReadonlyArray<AvisoPaso> | null,
 * }} ConteoPaso
 *   Los números de un paso en la forma que lee pasosConConteos (camelCase). conteosDePasos los saca de la respuesta del
 *   servidor; porEstado no pasa a la caja: la pantalla arma con él el `detalle`.
 * @typedef {{tono: 'gris' | 'rojo' | 'verde', texto: string}} ResumenSemaforo
 */

/** Un objeto que no es un arreglo. */
const esMapa = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** El número de `v` si es finito, o null (nunca se inventa un 0). */
const numeroONulo = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** La copia de un arreglo, o null si no lo es. */
const arregloONulo = (v) => (Array.isArray(v) ? [...v] : null);

// Los campos de presentación que pasan de la definición al paso, cuando vienen.
const PRESENTACION = /** @type {const} */ (['sufijo', 'sublabel', 'ayuda', 'tono', 'icono', 'ruta']);

/**
 * El paso base de una definición: su clave (`clave` o `key`), su label y su presentación. Un objeto nuevo: las
 * definiciones son tablas congeladas y el resultado se puede completar sin tocarlas.
 * @param {DefinicionPaso} paso
 * @param {EstadoPaso} estado
 * @returns {PasoVista}
 */
function pasoBase(paso, estado) {
  /** @type {any} */
  const vista = { clave: String(paso?.clave ?? paso?.key ?? ''), label: String(paso?.label ?? ''), estado };
  for (const campo of PRESENTACION) {
    if (paso?.[campo] !== undefined && paso?.[campo] !== null) vista[campo] = paso[campo];
  }
  return vista;
}

/** true si `i` es un índice entero de un arreglo de `n` elementos. */
const enRango = (i, n) => Number.isInteger(i) && i >= 0 && i < n;

/**
 * Los pasos de una barra de documento (el stepper de la solicitud, la cotización o el pedido; T10, T11):
 *  - i < indiceActual 'hecho', i === indiceActual 'actual' y el resto 'pendiente';
 *  - con canceladoEn (RP87: lo da pasoCotizacion), los anteriores 'hecho', ese 'cancelado' y los siguientes
 *    'pendiente' (indiceActual no cuenta); undefined o null es sin cancelación;
 *  - un índice fuera de rango (también -1 de pasoPedido o pasoSolicitud, o uno que no es entero) deja todos en
 *    'pendiente'.
 * Acepta pasos con `key` (PASOS_PEDIDO) o con `clave` (PASOS_SC, PASOS_COTIZACION); el resultado siempre trae `clave`.
 * @param {ReadonlyArray<DefinicionPaso> | null | undefined} definicion
 * @param {number} indiceActual
 * @param {{canceladoEn?: number | null}} [opciones]
 * @returns {PasoVista[]}
 */
export function pasosConProgreso(definicion, indiceActual, { canceladoEn = null } = {}) {
  const pasos = Array.isArray(definicion) ? definicion : [];
  const n = pasos.length;
  const cancelado = canceladoEn !== null && canceladoEn !== undefined;
  const corte = cancelado ? canceladoEn : indiceActual;
  if (!enRango(corte, n)) return pasos.map((p) => pasoBase(p, 'pendiente'));
  return pasos.map((p, i) => {
    if (i < corte) return pasoBase(p, 'hecho');
    if (i > corte) return pasoBase(p, 'pendiente');
    return pasoBase(p, cancelado ? 'cancelado' : 'actual');
  });
}

const SIN_CONTEO = congelar({ total: null, atrasados: null, masAntiguoDias: null, porEstado: null });

/**
 * La ÚNICA conversión de los pasos que manda el servidor (r1). GET /ventas/flujo y GET /compras/flujo («la misma forma
 * que el de Ventas», T12) traen res.data.pasos = {clave: {total, atrasados, mas_antiguo_dias, por_estado}} en
 * snake_case; esto los deja en la forma de pasosConConteos: {clave: {total, atrasados, masAntiguoDias, porEstado}}.
 *  - Las claves son las que manda el servidor, en su orden (la definición decide cuáles se pintan).
 *  - Lo que falta, o no es un número (o un mapa, en por_estado), queda en null; un paso nulo, todo en null.
 *  - porEstado es una copia. Sin datos o sin pasos: {}.
 * conteosDesdeResumen de flujo-ventas.js la usa y solo agrega los avisos de RP12; T14 la usa para Compras.
 * @param {any} datos  res.data de /ventas/flujo o /compras/flujo
 * @returns {Record<string, ConteoPaso>}
 */
export function conteosDePasos(datos) {
  const pasos = esMapa(datos) && esMapa(datos.pasos) ? datos.pasos : null;
  if (!pasos) return {};
  return Object.fromEntries(Object.entries(pasos).map(([clave, p]) => [clave, esMapa(p)
    ? {
      total: numeroONulo(p.total),
      atrasados: numeroONulo(p.atrasados),
      masAntiguoDias: numeroONulo(p.mas_antiguo_dias),
      porEstado: esMapa(p.por_estado) ? { ...p.por_estado } : null,
    }
    : { ...SIN_CONTEO }]));
}

/**
 * Los pasos de la franja del flujo (BannerFlujo, T5A):
 *  - total, atrasados, masAntiguoDias, detalle y avisos salen de conteos[clave], en camelCase: los de conteosDePasos
 *    (Compras, T14) o los de conteosDesdeResumen de flujo-ventas.js (Ventas, que les suma los avisos); la respuesta
 *    cruda del servidor (snake_case) NO se pasa aquí. Quedan en null mientras carga o si falta la clave (la pantalla
 *    pinta entonces Contador, D21). Un valor que no es un número también queda en null.
 *  - el paso que coincide con `actual` (la pantalla en la que estás) lleva esEste y estado 'actual';
 *  - el que coincide con `seleccionado` (el filtro elegido) lleva seleccionado;
 *  - los demás quedan 'neutro'.
 * La presentación de la definición (label, sufijo, ayuda, tono, icono, ruta) pasa tal cual; `href` no se pone aquí.
 * @param {ReadonlyArray<DefinicionPaso> | null | undefined} definicion
 * @param {Readonly<Record<string, ConteoPaso | null | undefined>> | null | undefined} conteos
 * @param {{actual?: string | null, seleccionado?: string | null, cargando?: boolean}} [opciones]
 * @returns {PasoVista[]}
 */
export function pasosConConteos(definicion, conteos, { actual = null, seleccionado = null, cargando = false } = {}) {
  const pasos = Array.isArray(definicion) ? definicion : [];
  return pasos.map((p) => {
    const vista = pasoBase(p, 'neutro');
    const c = !cargando && tiene(conteos, vista.clave) ? /** @type {any} */ (conteos)[vista.clave] : null;
    const hay = c !== null && typeof c === 'object';
    vista.total = hay ? numeroONulo(c.total) : null;
    vista.atrasados = hay ? numeroONulo(c.atrasados) : null;
    vista.masAntiguoDias = hay ? numeroONulo(c.masAntiguoDias) : null;
    vista.detalle = hay ? arregloONulo(c.detalle) : null;
    vista.avisos = hay ? arregloONulo(c.avisos) : null;
    vista.esEste = actual !== null && vista.clave === actual;
    vista.seleccionado = seleccionado !== null && vista.clave === seleccionado;
    if (vista.esEste) vista.estado = 'actual';
    return vista;
  });
}

/**
 * El número de una caja: '—' si no hay número (null, undefined, NaN: el error, D21); si no, con los miles con punto
 * (formatoEntero de kpis.js, RP75: 1234 -> '1.234'). Mientras carga no se usa: la caja pinta Contador.
 * @param {unknown} n
 * @returns {string}
 */
export function textoConteo(n) {
  return formatoEntero(n);
}

/**
 * El chip rojo de una caja: '' si no hay atrasados (0, null, un negativo o algo que no es número); si no,
 * '1 con atraso' o 'N con atraso' (con los miles con punto).
 * @param {unknown} n
 * @returns {string}
 */
export function textoAtraso(n) {
  const cuantos = cantidadPositiva(n);
  return cuantos === null ? '' : `${formatoEntero(cuantos)} con atraso`;
}

/**
 * El clic en una caja de la franja: null si esa clave ya estaba elegida (tocarla otra vez quita el filtro, R6); si
 * no, la clave.
 * @template {string} T
 * @param {string | null | undefined} actual
 * @param {T} clave
 * @returns {T | null}
 */
export function alternarSeleccion(actual, clave) {
  return actual === clave ? null : clave;
}

/**
 * El ícono y el texto del semáforo de la franja:
 *  - mientras carga: gris y 'Cargando…' (también al reintentar después de un error);
 *  - con error: gris y '—' (RP67, C13);
 *  - con atrasados: rojo y 'N con atraso';
 *  - con 0 atrasados: verde y 'Todo al día'.
 * Sin el número (null, o algo que no es un número) es gris y '—': nunca un 0 falso ni 'Todo al día'.
 * @param {{atrasados?: number | null, cargando?: boolean, error?: unknown}} [estado]
 * @returns {ResumenSemaforo}
 */
export function resumenSemaforo({ atrasados = null, cargando = false, error = null } = {}) {
  if (cargando) return { tono: 'gris', texto: 'Cargando…' };
  if (error) return { tono: 'gris', texto: '—' };
  const n = numeroONulo(atrasados);
  if (n === null) return { tono: 'gris', texto: '—' };
  return n > 0 ? { tono: 'rojo', texto: textoAtraso(n) } : { tono: 'verde', texto: 'Todo al día' };
}
