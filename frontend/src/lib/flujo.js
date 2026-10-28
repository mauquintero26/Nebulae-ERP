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
import { estadoDeConteo } from './tabla.js';

export { congelar };

/** @typedef {import('./kpis.js').EstadoKpi} EstadoKpi */

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

// ─── T5A: lo que usan los componentes de components/flujo ───────────────────────
// PasosFlujo, BannerFlujo, CadenaDocumentos y useResumenFlujo solo pintan: los textos, los estados y la carga salen de
// aquí (con su caso en test_flujo.mjs). El estado de cada Contador es estadoNumeroFranja (estadoDeConteo de
// lib/tabla.js, el mismo de BarraTabla, C13, más el «—» de la franja con error) y el turno de la carga,
// crearCargaListado de lib/tabla.js.

/** r1 (M16, ruling): un conteo es un número finito y no negativo; lo demás (también un negativo) cuenta como sin número. */
const conteoONulo = (v) => {
  const n = numeroONulo(v);
  return n !== null && n >= 0 ? n : null;
};

/**
 * El ícono y el texto del semáforo de BannerFlujo (T5A): resumenSemaforo, salvo que al RECARGAR con un número ya
 * visto ese número sigue (no vuelve a 'Cargando…': «al recargar se ven los números anteriores hasta que llegan los
 * nuevos», y la franja no parpadea en cada recarga de la pantalla). Sin número, mientras carga, 'Cargando…'. Con
 * error, gris y '—' aunque quede el último número bueno (RP67). Un conteo negativo no es un dato: sin número (r1).
 * @param {{atrasados?: number | null, cargando?: boolean, error?: unknown}} [estado]
 * @returns {ResumenSemaforo}
 */
export function semaforoDeFranja({ atrasados = null, cargando = false, error = null } = {}) {
  const n = conteoONulo(atrasados);
  return resumenSemaforo({ atrasados: n, cargando: Boolean(cargando) && n === null, error });
}

/**
 * @typedef {'todos' | 'atrasados' | 'no_resueltos'} FiltroSemaforo
 * @typedef {{filtro: FiltroSemaforo, texto: string, conConteo: boolean, conteo: number | null, activo: boolean}}
 *   OpcionSemaforo
 */

/** Los filtros del semáforo, en el orden del control segmentado. */
const FILTROS_SEMAFORO = congelar(['atrasados', 'no_resueltos', 'todos']);

/**
 * Los botones del control segmentado del semáforo de BannerFlujo (R6), en orden: 'Con atraso (n)', 'No resueltos (n)'
 * (solo si `noResueltos` llega: undefined es que no llega; null, que llega y todavía carga) y 'Ver todo' (sin número).
 * «No resueltos» es el texto aprobado del botón (cruce C9 de la verificación, ajuste de RP67): «Sin resolver» es solo
 * de los separadores. `activo` refleja semaforo.filtro:
 *  - un filtro desconocido (o ninguno) deja activo 'Ver todo';
 *  - r1 (M15a): un filtro que vale pero cuyo botón no se pinta (no_resueltos sin noResueltos, p. ej. el estado
 *    restaurado de la sesión) no deja ningún botón activo: 'Ver todo' mentiría, porque la tabla sigue filtrada.
 * Un conteo que no es un número, o que es negativo (r1, ruling M16), queda en null (el Contador pinta la barra gris o
 * '—', nunca un 0). Sin semáforo: [].
 * @param {{atrasados?: number | null, noResueltos?: number | null, filtro?: string} | null | undefined} semaforo
 * @returns {OpcionSemaforo[]}
 */
export function opcionesSemaforo(semaforo) {
  if (!esMapa(semaforo)) return [];
  const s = /** @type {any} */ (semaforo);
  /** @type {Array<Omit<OpcionSemaforo, 'activo'>>} */
  const opciones = [{ filtro: 'atrasados', texto: 'Con atraso', conConteo: true, conteo: conteoONulo(s.atrasados) }];
  if (s.noResueltos !== undefined) {
    opciones.push({ filtro: 'no_resueltos', texto: 'No resueltos', conConteo: true, conteo: conteoONulo(s.noResueltos) });
  }
  opciones.push({ filtro: 'todos', texto: 'Ver todo', conConteo: false, conteo: null });
  const filtro = FILTROS_SEMAFORO.includes(s.filtro) ? s.filtro : 'todos';
  return opciones.map((o) => ({ ...o, activo: o.filtro === filtro }));
}

/**
 * El filtro que queda al tocar un botón del semáforo (R6): el elegido o, si ya estaba puesto, 'todos' (tocarlo otra
 * vez lo quita); 'Ver todo' siempre deja 'todos'.
 * @param {string | null | undefined} actual
 * @param {FiltroSemaforo} elegido
 * @returns {FiltroSemaforo}
 */
export function alternarFiltroSemaforo(actual, elegido) {
  if (!FILTROS_SEMAFORO.includes(elegido)) return 'todos';
  return actual === elegido ? 'todos' : elegido;
}

/**
 * La línea de detalle de una caja de la franja (solo en el paso esEste): 'Nueva 1 · Asignada 2', con los miles con
 * punto. Lo que no trae etiqueta o número se salta; nada da ''.
 * @param {ReadonlyArray<DetallePaso | null | undefined> | null | undefined} detalle
 * @returns {string}
 */
export function textoDetalle(detalle) {
  if (!Array.isArray(detalle)) return '';
  return detalle
    .filter((d) => esMapa(d) && typeof d.label === 'string' && d.label !== '' && numeroONulo(d.n) !== null)
    .map((d) => `${d.label} ${formatoEntero(d.n)}`)
    .join(' · ');
}

/**
 * 'El más antiguo: N días' de una caja de la franja (solo con mostrarAntiguedad; flujo_contenido_caja = total y
 * atrasados, así que por defecto no se pinta). Los días se redondean y el plural sale del redondeado ('1 día'). Lo
 * que no es un número de días (null, NaN, negativo o texto) da ''.
 * @param {unknown} dias
 * @returns {string}
 */
export function textoAntiguedad(dias) {
  const n = numeroONulo(dias);
  if (n === null || n < 0) return '';
  const r = Math.round(n);
  return `El más antiguo: ${formatoEntero(r)} ${r === 1 ? 'día' : 'días'}`;
}

/** Los textos no vacíos de los avisos de un paso. */
const textosDeAvisos = (avisos) => (Array.isArray(avisos) ? avisos : [])
  .map((a) => (esMapa(a) && typeof a.texto === 'string' ? a.texto.trim() : ''))
  .filter(Boolean);

/**
 * El title de un paso de la barra: el label y, si los hay, el sublabel y los avisos ('Cotización: COT-20260485 ·
 * Pendiente'). Por debajo de @md la barra oculta los sublabels: quedan aquí.
 * @param {PasoVista} paso
 * @returns {string}
 */
export function tituloPaso(paso) {
  const resto = [typeof paso?.sublabel === 'string' ? paso.sublabel.trim() : '', ...textosDeAvisos(paso?.avisos)].filter(Boolean);
  const label = String(paso?.label ?? '');
  return resto.length ? `${label}: ${resto.join(' · ')}` : label;
}

/** Lo que oye un lector de pantalla del círculo de la barra (el ✓ y la X son aria-hidden). Inmutable. */
const ESTADO_PARA_LECTOR = congelar({
  hecho: 'Paso hecho', actual: 'Paso en curso', pendiente: 'Paso pendiente', cancelado: 'Paso cancelado',
});

/**
 * El estado de un paso de la barra para lectores de pantalla: 'Paso hecho', 'Paso en curso', 'Paso pendiente' o
 * 'Paso cancelado'. 'neutro' (una caja que no aplica o la Compra, que es un anexo) y lo desconocido dan '': su
 * sublabel ya lo dice.
 * @param {unknown} estado
 * @returns {string}
 */
export function textoEstadoPaso(estado) {
  return typeof estado === 'string' && tiene(ESTADO_PARA_LECTOR, estado) ? /** @type {any} */ (ESTADO_PARA_LECTOR)[estado] : '';
}

/**
 * El estado de una etapa en el title de un punto de la variante mini (las etapas del envío): las mismas palabras de
 * ETIQUETA_ETAPA_TRACKING de flujo-compras.js, en minúscula (test_flujo_compras.mjs lo comprueba). Inmutable.
 */
const ESTADO_DE_ETAPA = congelar({ hecho: 'completada', actual: 'en curso', pendiente: 'pendiente', cancelado: 'cancelada' });

/**
 * El title de un punto de la variante mini (las celdas de la tabla de Tránsito): 'Etapa 2 de 4: Aduana, en curso' y,
 * si los hay, el sublabel y los avisos detrás de ' · '. Un paso 'neutro' va sin estado.
 * @param {PasoVista} paso
 * @param {number} indice  la posición del paso (desde 0)
 * @param {number} total  cuántos pasos hay
 * @returns {string}
 */
export function tituloPunto(paso, indice, total) {
  const estado = typeof paso?.estado === 'string' && tiene(ESTADO_DE_ETAPA, paso.estado)
    ? `, ${/** @type {any} */ (ESTADO_DE_ETAPA)[paso.estado]}`
    : '';
  const resto = [typeof paso?.sublabel === 'string' ? paso.sublabel.trim() : '', ...textosDeAvisos(paso?.avisos)].filter(Boolean);
  return `Etapa ${indice + 1} de ${total}: ${String(paso?.label ?? '')}${estado}${resto.map((t) => ` · ${t}`).join('')}`;
}

/**
 * El paso que lleva aria-current: el esEste (el de la pantalla en la franja; el documento abierto en la cadena) o, si
 * ninguno lo es, el primero en estado 'actual' (las barras de los pasos propios de cada documento). Ninguno: -1.
 * @param {ReadonlyArray<PasoVista | null | undefined> | null | undefined} pasos
 * @returns {number}
 */
export function indicePasoActual(pasos) {
  if (!Array.isArray(pasos)) return -1;
  const este = pasos.findIndex((p) => esMapa(p) && p.esEste === true);
  return este !== -1 ? este : pasos.findIndex((p) => esMapa(p) && p.estado === 'actual');
}

/**
 * Si el conector entre el paso i y el i+1 de la barra (y de los puntos) va en emerald (r1, M3: «en emerald entre pasos
 * hechos»): solo si el paso i está 'hecho' y el i+1 está 'hecho' o 'actual'; nunca hacia 'cancelado', 'pendiente' o
 * 'neutro'. Fuera de rango, o sin pasos: false.
 * @param {ReadonlyArray<PasoVista | null | undefined> | null | undefined} pasos
 * @param {number} i
 * @returns {boolean}
 */
export function conectorHecho(pasos, i) {
  if (!Array.isArray(pasos) || !Number.isInteger(i) || i < 0 || i >= pasos.length - 1) return false;
  const [a, b] = [pasos[i], pasos[i + 1]];
  return esMapa(a) && esMapa(b) && a.estado === 'hecho' && (b.estado === 'hecho' || b.estado === 'actual');
}

/**
 * Si algún paso es un enlace (trae un href no vacío). r1 (M9): solo entonces la lista va dentro de un <nav>; si no,
 * es un <ol aria-label> (los pasos propios de un documento o una franja de filtros no son un landmark de navegación).
 * @param {ReadonlyArray<PasoVista | null | undefined> | null | undefined} pasos
 * @returns {boolean}
 */
export function hayEnlaces(pasos) {
  return Array.isArray(pasos) && pasos.some((p) => esMapa(p) && typeof p.href === 'string' && p.href !== '');
}

// ─── r1: el estado de los números de la franja (M1, M5, M8 y M11) ───────────────

/**
 * El estado del Contador de un número de la franja (las cajas y los botones del semáforo):
 *  - con estadoConteos 'error', 'error' aunque quede un número (el último bueno): con error, «—» en TODA la franja
 *    (ruling de r1 sobre M1: «Las cajas siguen mostrando '—'», C13);
 *  - si no, estadoDeConteo de lib/tabla.js (la regla de BarraTabla): sin número, la barra gris; con número, atenuado
 *    mientras carga ('actualizando');
 *  - atenuar: false (M8, el segmento activo del semáforo, blanco sobre rose-600): con número, 'listo' también mientras
 *    carga, para no bajar el contraste de 4,5:1.
 * @param {unknown} n
 * @param {EstadoKpi} [estadoConteos]
 * @param {{atenuar?: boolean}} [opciones]
 * @returns {EstadoKpi}
 */
export function estadoNumeroFranja(n, estadoConteos, { atenuar = true } = {}) {
  if (estadoConteos === 'error') return 'error';
  const estado = /** @type {EstadoKpi} */ (estadoDeConteo(n, estadoConteos));
  return !atenuar && estado === 'actualizando' ? 'listo' : estado;
}

/**
 * El chip rosa de atraso de una caja: {largo: '3 con atraso', corto: '3'} (el corto va en la pastilla, M11, con el
 * largo en su title y para el lector de pantalla), o null si no hay atrasados (textoAtraso) o si la franja está en
 * error (ruling M1: con error no se pinta).
 * @param {unknown} atrasados
 * @param {{estadoConteos?: EstadoKpi}} [opciones]
 * @returns {{largo: string, corto: string} | null}
 */
export function chipAtraso(atrasados, { estadoConteos } = {}) {
  if (estadoConteos === 'error') return null;
  const largo = textoAtraso(atrasados);
  return largo ? { largo, corto: formatoEntero(cantidadPositiva(atrasados)) } : null;
}

/**
 * El estado de BannerFlujo a partir de lo que trae useResumenFlujo (r1, M1 y M5):
 *  - conError: hay un error, o se está reintentando después de uno (`huboError`, lo que la franja vio en el render
 *    anterior: useResumenFlujo ya no trae el error mientras vuelve a cargar). La línea de error sigue montada y el
 *    botón dice 'Reintentando…' (reintentando);
 *  - estadoConteos: 'error' con conError (todos los números en «—» hasta que la carga sale bien), si no 'cargando'
 *    mientras carga y 'listo';
 *  - cargandoNumeros: el `cargando` que recibe semaforoDeFranja (mientras se reintenta, el semáforo sigue en «—»).
 * @param {{cargando?: boolean, error?: unknown, huboError?: boolean}} [estado]
 * @returns {{conError: boolean, reintentando: boolean, cargandoNumeros: boolean, estadoConteos: EstadoKpi}}
 */
export function estadoDeFranja({ cargando = false, error = null, huboError = false } = {}) {
  const carga = Boolean(cargando);
  const conError = Boolean(error) || (carga && Boolean(huboError));
  return {
    conError,
    reintentando: conError && carga,
    cargandoNumeros: carga && !conError,
    estadoConteos: conError ? 'error' : carga ? 'cargando' : 'listo',
  };
}

// ─── la carga del resumen (useResumenFlujo) ─────────────────────────────────────

/**
 * @typedef {{clave: string, ruta: string | null, usuario: number | null, repeticion: number,
 *   datos: Record<string, any> | null, error: unknown}} ResultadoResumen
 *   Lo último que llegó a useResumenFlujo: la clave de la consulta que lo pidió, su ruta, el usuario del token con que
 *   se pidió (r1, M12), la vuelta de la carga (r1, M13), los datos buenos (res.data) y el error de esa llegada.
 * @typedef {{datos: Record<string, any> | null, cargando: boolean, error: unknown}} EstadoResumen
 */

/** El resultado es de esa ruta y de ese usuario (sin usuario en los dos lados, también). */
const delMismo = (resultado, ruta, usuario) => Boolean(resultado) && resultado.ruta === ruta
  && (resultado.usuario ?? null) === (usuario ?? null);

/**
 * Lo que queda del resumen cuando llega la respuesta (o el error) de una carga de useResumenFlujo. La llegada es la de
 * crearCargaListado de lib/tabla.js (el turno: lo de una carga vieja nunca llega aquí), con contexto {ruta, usuario}
 * y su repetición.
 *  - Una respuesta con un objeto en `data` (apiFetch devuelve el cuerpo completo: se lee res.data): esos datos, sin
 *    error.
 *  - Un error, o una respuesta sin un objeto en `data`: el error (un Error si no viene ninguno) y los últimos datos
 *    buenos de la MISMA ruta y del MISMO usuario (un error conserva lo último bueno; lo de otra ruta o de otra cuenta
 *    no se muestra, como useListado en T4C r2).
 * No muta lo que recibe.
 * @param {ResultadoResumen | null | undefined} previo
 * @param {{marca: string, ok: boolean, respuesta?: unknown, error?: unknown, repeticion?: number,
 *   contexto?: {ruta?: string | null, usuario?: number | null} | null}} llegada
 * @returns {ResultadoResumen}
 */
export function aplicarLlegadaResumen(previo, llegada) {
  const ruta = llegada?.contexto?.ruta ?? null;
  const usuario = llegada?.contexto?.usuario ?? null;
  const anteriores = delMismo(previo, ruta, usuario) ? /** @type {ResultadoResumen} */ (previo).datos : null;
  const base = { clave: llegada.marca, ruta, usuario, repeticion: llegada.repeticion ?? 0 };
  if (llegada.ok) {
    const datos = /** @type {any} */ (llegada.respuesta)?.data;
    if (esMapa(datos)) return { ...base, datos, error: null };
    return { ...base, datos: anteriores, error: new Error('La respuesta del flujo no trae datos.') };
  }
  return { ...base, datos: anteriores, error: llegada.error ?? new Error('No se pudieron cargar los números del flujo.') };
}

/**
 * Lo que devuelve useResumenFlujo para la consulta `clave` de `ruta`, con `resultado` (lo último que llegó):
 *  - un resultado de otra ruta o de otro usuario (r1, M12) cuenta como ninguno: cargando sin datos y, si falla, el
 *    error sin datos;
 *  - si su clave no es la pedida, o la carga dio otra vuelta (`repeticion`, r1, M13: volver a pedir una clave que ya
 *    llegó, como B → A → B o una recarga 5 → 6 → 5), hay una carga en camino: `cargando`, con los datos anteriores (al
 *    recargar los números no parpadean) y sin el error anterior (Reintentar ya está cargando);
 *  - en la primera carga, datos null (las cajas pintan la barra gris de Contador, D21);
 *  - ya llegada: sus datos y su error (con error, los últimos datos buenos).
 * @param {ResultadoResumen | null | undefined} resultado
 * @param {{clave: string, ruta: string | null, usuario?: number | null, repeticion?: number}} consulta
 * @returns {EstadoResumen}
 */
export function estadoResumen(resultado, { clave, ruta, usuario = null, repeticion = 0 }) {
  const propio = delMismo(resultado, ruta, usuario) ? /** @type {ResultadoResumen} */ (resultado) : null;
  const cargando = !propio || propio.clave !== clave || (propio.repeticion ?? 0) !== repeticion;
  return { datos: propio?.datos ?? null, cargando, error: cargando ? null : (propio?.error ?? null) };
}
