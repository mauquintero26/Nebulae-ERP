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

// ─── T5A: lo que usan los componentes de components/flujo ───────────────────────
// PasosFlujo, BannerFlujo, CadenaDocumentos y useResumenFlujo solo pintan: los textos, los estados y la carga salen de
// aquí (con su caso en test_flujo.mjs). El estado de cada Contador es estadoDeConteo de lib/tabla.js (el mismo de
// BarraTabla, C13) y el turno de la carga, crearCargaListado de lib/tabla.js.

/**
 * El ícono y el texto del semáforo de BannerFlujo (T5A): resumenSemaforo, salvo que al RECARGAR con un número ya
 * visto ese número sigue (no vuelve a 'Cargando…': «al recargar se ven los números anteriores hasta que llegan los
 * nuevos», y la franja no parpadea en cada recarga de la pantalla). Sin número, mientras carga, 'Cargando…'. Con
 * error, gris y '—' aunque quede el último número bueno (RP67).
 * @param {{atrasados?: number | null, cargando?: boolean, error?: unknown}} [estado]
 * @returns {ResumenSemaforo}
 */
export function semaforoDeFranja({ atrasados = null, cargando = false, error = null } = {}) {
  const visto = numeroONulo(atrasados) !== null;
  return resumenSemaforo({ atrasados, cargando: Boolean(cargando) && !visto, error });
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
 * de los separadores. `activo` refleja semaforo.filtro; uno que no está entre los botones deja activo 'Ver todo'. Un
 * conteo que no es un número queda en null (el Contador pinta la barra gris o '—', nunca un 0). Sin semáforo: [].
 * @param {{atrasados?: number | null, noResueltos?: number | null, filtro?: string} | null | undefined} semaforo
 * @returns {OpcionSemaforo[]}
 */
export function opcionesSemaforo(semaforo) {
  if (!esMapa(semaforo)) return [];
  const s = /** @type {any} */ (semaforo);
  /** @type {Array<Omit<OpcionSemaforo, 'activo'>>} */
  const opciones = [{ filtro: 'atrasados', texto: 'Con atraso', conConteo: true, conteo: numeroONulo(s.atrasados) }];
  if (s.noResueltos !== undefined) {
    opciones.push({ filtro: 'no_resueltos', texto: 'No resueltos', conConteo: true, conteo: numeroONulo(s.noResueltos) });
  }
  opciones.push({ filtro: 'todos', texto: 'Ver todo', conConteo: false, conteo: null });
  const filtro = opciones.some((o) => o.filtro === s.filtro) ? s.filtro : 'todos';
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

// ─── la carga del resumen (useResumenFlujo) ─────────────────────────────────────

/**
 * @typedef {{clave: string, ruta: string | null, datos: Record<string, any> | null, error: unknown}} ResultadoResumen
 *   Lo último que llegó a useResumenFlujo: la clave de la consulta que lo pidió, su ruta, los datos buenos (res.data) y
 *   el error de esa llegada.
 * @typedef {{datos: Record<string, any> | null, cargando: boolean, error: unknown}} EstadoResumen
 */

/**
 * Lo que queda del resumen cuando llega la respuesta (o el error) de una carga de useResumenFlujo. La llegada es la de
 * crearCargaListado de lib/tabla.js (el turno: lo de una carga vieja nunca llega aquí), con contexto {ruta}.
 *  - Una respuesta con un objeto en `data` (apiFetch devuelve el cuerpo completo: se lee res.data): esos datos, sin
 *    error.
 *  - Un error, o una respuesta sin un objeto en `data`: el error (un Error si no viene ninguno) y los últimos datos
 *    buenos de la MISMA ruta (un error conserva lo último bueno; los de otra ruta no se muestran).
 * No muta lo que recibe.
 * @param {ResultadoResumen | null | undefined} previo
 * @param {{marca: string, ok: boolean, respuesta?: unknown, error?: unknown, contexto?: {ruta?: string | null} | null}} llegada
 * @returns {ResultadoResumen}
 */
export function aplicarLlegadaResumen(previo, llegada) {
  const ruta = llegada?.contexto?.ruta ?? null;
  const anteriores = previo && previo.ruta === ruta ? previo.datos : null;
  const base = { clave: llegada.marca, ruta };
  if (llegada.ok) {
    const datos = /** @type {any} */ (llegada.respuesta)?.data;
    if (esMapa(datos)) return { ...base, datos, error: null };
    return { ...base, datos: anteriores, error: new Error('La respuesta del flujo no trae datos.') };
  }
  return { ...base, datos: anteriores, error: llegada.error ?? new Error('No se pudieron cargar los números del flujo.') };
}

/**
 * Lo que devuelve useResumenFlujo para la consulta `clave` de `ruta`, con `resultado` (lo último que llegó):
 *  - un resultado de otra ruta cuenta como ninguno;
 *  - si su clave no es la pedida, hay una carga en camino: `cargando`, con los datos anteriores (al recargar los
 *    números no parpadean) y sin el error anterior (Reintentar ya está cargando);
 *  - en la primera carga, datos null (las cajas pintan la barra gris de Contador, D21);
 *  - ya llegada: sus datos y su error (con error, los últimos datos buenos).
 * @param {ResultadoResumen | null | undefined} resultado
 * @param {{clave: string, ruta: string | null}} consulta
 * @returns {EstadoResumen}
 */
export function estadoResumen(resultado, { clave, ruta }) {
  const propio = resultado && resultado.ruta === ruta ? resultado : null;
  const cargando = !propio || propio.clave !== clave;
  return { datos: propio?.datos ?? null, cargando, error: cargando ? null : (propio.error ?? null) };
}
