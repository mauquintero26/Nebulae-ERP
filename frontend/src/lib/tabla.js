/**
 * La lógica pura de la tabla estándar (Bloque 4, T3A: TABLA-base punto 1, TABLA-api, R5, C3, RP8, RP54 y D23). JS
 * plano, sin React ni DOM, como busqueda.js, para probarlo con node (frontend/tests/test_tabla.mjs). No toca el
 * almacenamiento (R4): las preferencias van por lib/preferencias.js y el estado de la sesión lo guarda useEstadoTabla
 * (T4C).
 *
 *  - Columnas: reconciliarColumnas (lo guardado contra la definición de hoy), moverColumna (sin cruzar las fijas),
 *    indiceDestino, limitarAncho y offsetsFijas (position: sticky). La definición de una columna es la de
 *    TablaEstandar (T4D): {id, ancho?, anchoMin = 64, anchoMax = 640, clave?, fija?: 'izquierda' | 'derecha',
 *    ocultaPorDefecto?, …}; lo guardado en tabla:<id> es {version, orden, anchos, ocultas} (y el tamaño, que escribe
 *    useEstadoTabla con escribirParte).
 *  - Modo cliente: alternarOrden, filtrarFilas (sin tildes, con normalizarBusqueda), ordenarFilas (estable, nulos al
 *    final, en español y con los números en su orden) y paginar.
 *  - Paginación: totalPaginas, rangoPaginas, paginaValida y textoRango ('Mostrando 26–50 de 134').
 *  - El estado ÚNICO de cada pantalla (C3): {vista, modo, semaforo, paso, estados, q, orden, pagina, tamano}, con
 *    reducirEstadoTabla: todo cambio que no sea de página vuelve a la página 1 (el arreglo de N9).
 *  - queryListado(estado, extra): los parámetros de lista del servidor (core/listados.py): q (nunca search) y estados
 *    en CSV (nunca estado= con varios valores; RP8). D23: las claves de extra pisan las del estado y todas pasan; null,
 *    undefined y '' se omiten; los arreglos van en CSV.
 *  - normalizarRespuesta(d): {data, total} (listados.respuesta), un arreglo plano, {data: {items, total_skus}} y
 *    {data: {items, total}} (el Kardex, RP54).
 *  - T4C y r1 (los hooks de components/tabla; R4, R5, C2, C3, RP8, RP26, RP35, D28, D38 y D39):
 *    · useEstadoTabla: lo de la sesión (CAMPOS_SESION_TABLA, con los estados; MAXIMO_ESTADOS, claveSesionTabla,
 *      textoSesionTabla, leerSesionTabla y sesionVigente, que mira el usuario), el estado armado (armarEstadoTabla), qué
 *      cambió tras una acción (cambiosEstadoTabla), qué se escribe y con qué usuario (escriturasDeAccion) y las
 *      dependencias del tablero de la misma pantalla (dependenciasTablero).
 *    · usePreferenciasTabla: parteDeColumnas (la pieza de tabla:<id> que se escribe con escribirParte),
 *      actualizadorColumnas y guardarCambioColumnas (antes de listo, o con otro usuario en el token, no escribe).
 *    · useListado: urlListado (con queryListado), crearCargaListado (aborta la anterior, descarta lo viejo y cuenta las
 *      vueltas), lanzarListado (el efecto, con activo y esperar), aplicarLlegadaListado, estadoListado, esErrorDeOrden y
 *      rechazoPorAtender (un orden que el servidor rechaza vuelve al por defecto). useListadoCliente: listadoCliente.
 *    · r2: la acción restablecerOrden del reductor (la vuelta condicional), el usuario de cada resultado (sin filas de
 *      otra cuenta), lo atendido en la carga y el tope de espera de las preferencias (ESPERA_PREFERENCIAS_MS,
 *      esperarPreferencias y listoConTope).
 *  - T4D (los componentes de vista de components/tabla: TablaEstandar, BarraTabla, FiltroEstados, MenuAjustes y
 *    Paginacion; TABLA-base punto 3, R5, R26, C1, C3, C13, D38 y D40): el umbral para mover una columna
 *    (superaUmbralColumna), el ancho al contenido (anchoAlContenido), 'Ajustar al ancho de la pantalla'
 *    (ajustarAlAncho), la geometría que se pinta (geometriaTabla: columna flexible, fijas y casilla), el destino al
 *    arrastrar (destinoArrastre y bordeDeHueco), el orden por columna (campoOrden, direccionOrden y accesoresDeOrden),
 *    lo que pinta el cuerpo (vistaCuerpo), los separadores (filasConGrupos), la página que ya no existe
 *    (paginaCorregida), la selección (alternarSeleccion, estadoSeleccionPagina, alternarSeleccionPagina y
 *    firmaSeleccion), la búsqueda con retardo (crearBusquedaConRetardo y sincronizarBusqueda), 'N resultados'
 *    (textoResultados), el Contador de cada pestaña (estadoDeConteo), las pestañas con su filtro (opcionesDeVista,
 *    accionPestana y alternarEstado) y las flechas de 'Ajustar tabla' (puedeDesplazar).
 *  - T4D r1: el ancho que se guarda al soltar el asa (anchoAlSoltar: la flexible sin el espacio que sobra), el estado
 *    de 'N resultados' (estadoDelTotal), los títulos recortados a la zona libre entre las fijas (recortarBordes), los
 *    estados filtrados que la pestaña no tiene (etiquetasDeEstados y opcionesConMarcados), los paneles dentro de la
 *    ventana (posicionPanel) y el Esc de la pantalla completa (saleConEsc).
 */

import { normalizarBusqueda } from './busqueda.js';
import { congelar, tiene } from './estados-pedido.js';
import { formatoEntero } from './kpis.js';

/**
 * @typedef {'izquierda' | 'derecha'} LadoFijo
 * @typedef {{id: string, ancho?: number, anchoMin?: number, anchoMax?: number, clave?: boolean, fija?: LadoFijo,
 *   ocultaPorDefecto?: boolean}} DefinicionColumna
 * @typedef {{orden: string[], anchos: Record<string, number>, ocultas: string[]}} ColumnasReconciliadas
 * @typedef {'lista' | 'kanban'} ModoTabla
 * @typedef {{vista: string | null, modo: ModoTabla, semaforo: string | null, paso: string | null, estados: string[],
 *   q: string, orden: string | null, pagina: number, tamano: number}} EstadoTabla
 * @typedef {{tipo: 'vista' | 'modo' | 'semaforo' | 'paso' | 'estados' | 'q' | 'busqueda' | 'orden' | 'pagina' | 'tamano',
 *   valor?: unknown} | {tipo: 'cambiar', cambios: Partial<Record<keyof EstadoTabla, unknown>>} | {tipo: 'limpiarFiltros'}
 *   | {tipo: 'restablecerOrden', rechazado: string}} AccionTabla
 * @typedef {{filas: any[], total: number, conteos: Record<string, number> | null, resumen: Record<string, any> | null,
 *   crudo: unknown}} RespuestaListado
 * @typedef {'vista' | 'pagina' | 'q' | 'orden' | 'semaforo' | 'paso' | 'estados'} CampoSesionTabla
 * @typedef {Partial<Pick<EstadoTabla, CampoSesionTabla>>} SesionTabla
 * @typedef {{sesion: boolean, modo: boolean, tamano: boolean}} CambiosEstadoTabla
 * @typedef {{tipo: 'anchos', anchos: Record<string, number>} | {tipo: 'mover', id: string, hueco: number}
 *   | {tipo: 'desplazar', id: string, paso: number} | {tipo: 'ocultar', id: string, oculta?: boolean}
 *   | {tipo: 'restablecer'}} CambioColumnas
 * @typedef {{version: number, orden?: string[], anchos?: Record<string, number>, ocultas?: string[]}} ParteColumnas
 * @typedef {{ruta?: string | null, orden?: string | null, usuario?: number | null}} ContextoListado
 * @typedef {{marca: string, ok: true, respuesta: unknown, contexto?: ContextoListado | null, repeticion?: number}
 *   | {marca: string, ok: false, error: unknown, contexto?: ContextoListado | null, repeticion?: number}} LlegadaListado
 * @typedef {{n: number, texto: string, ruta: string | null, orden: string}} RechazoOrden
 * @typedef {{clave: string, n: number, repeticion: number, usuario: number | null, datos: RespuestaListado | null,
 *   error: unknown, rechazo: RechazoOrden | null}} ResultadoListado
 * @typedef {{filas: any[], total: number | null, conteos: Record<string, any> | null, resumen: Record<string, any> | null,
 *   crudo: unknown, cargandoInicial: boolean, recargando: boolean, error: unknown, avisoOrden: string | null}} EstadoListado
 */

/** 25 o 50 filas por página (y por columna del tablero). Inmutable. */
export const TAMANOS_PAGINA = congelar([25, 50]);
/** La versión de lo guardado en tabla:<id>: otra versión vuelve a lo por defecto. */
export const VERSION_PREFS = 1;
export const ANCHO_MIN = 64;
export const ANCHO_MAX = 640;
export const ANCHO_POR_DEFECTO = 160;
/**
 * Los modos de una pantalla con tabla (el valor de ConmutadorVista). Inmutable.
 * @type {ReadonlyArray<ModoTabla>}
 */
export const MODOS_TABLA = congelar(['lista', 'kanban']);

/**
 * true si `valor` es uno de MODOS_TABLA (useVistaGuardada, T4A: un 'vista:<pantalla>' guardado que no vale da el modo
 * por defecto).
 * @param {unknown} valor
 * @returns {valor is ModoTabla}
 */
export function esModoTabla(valor) {
  return MODOS_TABLA.includes(/** @type {ModoTabla} */ (valor));
}

// ─── columnas ───────────────────────────────────────────────────────────────────

/**
 * `px` entre `min` y `max`, redondeado al píxel. Lo que no es número da `min`.
 * @param {unknown} px
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function limitarAncho(px, min, max) {
  const n = Number(px);
  if (typeof px !== 'number' || !Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * {id: 'izquierda' | 'derecha'} de las columnas fijas de una definición.
 * @param {ReadonlyArray<DefinicionColumna>} definicion
 * @returns {Record<string, LadoFijo>}
 */
export function fijasDe(definicion) {
  /** @type {Record<string, LadoFijo>} */
  const fijas = {};
  for (const c of definicion ?? []) if (c?.fija === 'izquierda' || c?.fija === 'derecha') fijas[c.id] = c.fija;
  return fijas;
}

/** Las fijas a la izquierda al principio y las de la derecha al final, sin cambiar el orden de cada grupo. */
function conFijasALosLados(orden, fijas) {
  return [
    ...orden.filter((id) => fijas[id] === 'izquierda'),
    ...orden.filter((id) => !fijas[id]),
    ...orden.filter((id) => fijas[id] === 'derecha'),
  ];
}

/**
 * Lo guardado de una tabla contra su definición de hoy -> {orden, anchos, ocultas} (con todas las columnas, también
 * las ocultas; `ocultas` en el orden de la definición):
 *  - si `guardado.version` no es VERSION_PREFS (o no hay nada), lo por defecto;
 *  - descarta los ids guardados que ya no existen;
 *  - una columna nueva entra después de su vecina por defecto (y oculta si es ocultaPorDefecto);
 *  - nunca oculta una columna 'clave';
 *  - cada ancho queda en [anchoMin, anchoMax] (64 y 640 si la columna no los dice);
 *  - las fijas quedan a los lados.
 * Un id repetido en la definición es un error de programación (lanza Error). No muta lo que recibe.
 * @param {ReadonlyArray<DefinicionColumna>} definicion
 * @param {unknown} guardado
 * @returns {ColumnasReconciliadas}
 */
export function reconciliarColumnas(definicion, guardado) {
  const columnas = (definicion ?? []).filter((c) => c && typeof c.id === 'string' && c.id);
  const porId = new Map();
  for (const c of columnas) {
    if (porId.has(c.id)) throw new Error(`Columna repetida en la tabla: ${c.id}`);
    porId.set(c.id, c);
  }
  const fijas = fijasDe(columnas);
  const anchoDe = (c, px) => limitarAncho(typeof px === 'number' ? px : (c.ancho ?? ANCHO_POR_DEFECTO),
    c.anchoMin ?? ANCHO_MIN, c.anchoMax ?? ANCHO_MAX);
  const g = /** @type {any} */ (guardado);

  if (!g || typeof g !== 'object' || g.version !== VERSION_PREFS) {
    return {
      orden: conFijasALosLados(columnas.map((c) => c.id), fijas),
      anchos: Object.fromEntries(columnas.map((c) => [c.id, anchoDe(c)])),
      ocultas: columnas.filter((c) => c.ocultaPorDefecto && !c.clave).map((c) => c.id),
    };
  }

  const enGuardado = new Set();
  /** @type {string[]} */
  const orden = [];
  for (const id of Array.isArray(g.orden) ? g.orden : []) {
    if (porId.has(id) && !enGuardado.has(id)) { enGuardado.add(id); orden.push(id); }
  }
  // Las nuevas, en su orden por defecto: cada una después de la vecina anterior que ya esté (o al principio).
  columnas.forEach((c, i) => {
    if (enGuardado.has(c.id)) return;
    let lugar = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      const k = orden.indexOf(columnas[j].id);
      if (k >= 0) { lugar = k + 1; break; }
    }
    orden.splice(lugar, 0, c.id);
  });
  const anchosGuardados = g.anchos && typeof g.anchos === 'object' ? g.anchos : {};
  const ocultasGuardadas = new Set(Array.isArray(g.ocultas) ? g.ocultas : []);
  return {
    orden: conFijasALosLados(orden, fijas),
    anchos: Object.fromEntries(columnas.map((c) => [c.id, anchoDe(c, tiene(anchosGuardados, c.id) ? anchosGuardados[c.id] : undefined)])),
    ocultas: columnas
      .filter((c) => !c.clave && (enGuardado.has(c.id) ? ocultasGuardadas.has(c.id) : Boolean(c.ocultaPorDefecto)))
      .map((c) => c.id),
  };
}

/**
 * Mueve la columna `id` al hueco `indiceDestino` (0 = antes de la primera, orden.length = después de la última; el
 * mismo índice que da indiceDestino) sin cruzar las fijas: las de la izquierda siguen al principio y las de la derecha
 * al final, y una fija no se mueve. Devuelve un arreglo nuevo; un id que no está o un índice que no es número dejan el
 * orden igual.
 * @param {ReadonlyArray<string>} orden
 * @param {string} id
 * @param {number} indiceDestino
 * @param {Record<string, LadoFijo>} [fijas]
 * @returns {string[]}
 */
export function moverColumna(orden, id, indiceDestino, fijas = {}) {
  const lista = [...orden];
  const desde = lista.indexOf(id);
  if (desde < 0 || fijas[id] || !Number.isFinite(indiceDestino)) return lista;
  const izquierda = lista.filter((x) => fijas[x] === 'izquierda').length;
  const derecha = lista.filter((x) => fijas[x] === 'derecha').length;
  let hueco = Math.max(izquierda, Math.min(lista.length - derecha, Math.trunc(indiceDestino)));
  lista.splice(desde, 1);
  if (hueco > desde) hueco -= 1;
  lista.splice(hueco, 0, id);
  return lista;
}

/**
 * El hueco donde cae una columna arrastrada al punto `x`: cuántos encabezados tienen su punto medio antes de `x`.
 * `bordes` va de izquierda a derecha, como [inicio, fin] o como un rectángulo {left, right} (getBoundingClientRect).
 * @param {ReadonlyArray<[number, number] | {left: number, right: number}>} bordes
 * @param {number} x
 * @returns {number}
 */
export function indiceDestino(bordes, x) {
  let n = 0;
  for (const b of bordes ?? []) {
    const [inicio, fin] = Array.isArray(b) ? b : [b.left, b.right];
    if (x > (inicio + fin) / 2) n += 1;
    else break;
  }
  return n;
}

/**
 * {id: px} de las columnas fijas visibles, para position: sticky: a la izquierda acumula los anchos desde el principio
 * (left) y a la derecha desde el final (right).
 * @param {ReadonlyArray<string>} ordenVisible
 * @param {Record<string, number>} anchos
 * @param {Record<string, LadoFijo>} fijas
 * @returns {Record<string, number>}
 */
export function offsetsFijas(ordenVisible, anchos, fijas) {
  /** @type {Record<string, number>} */
  const offsets = {};
  let izquierda = 0;
  for (const id of ordenVisible) {
    if (fijas[id] !== 'izquierda') continue;
    offsets[id] = izquierda;
    izquierda += anchos[id] ?? 0;
  }
  let derecha = 0;
  for (const id of [...ordenVisible].reverse()) {
    if (fijas[id] !== 'derecha') continue;
    offsets[id] = derecha;
    derecha += anchos[id] ?? 0;
  }
  return offsets;
}

// ─── modo cliente ───────────────────────────────────────────────────────────────

/**
 * El orden siguiente al hacer clic en el título de `campo`: ascendente ('campo') -> descendente ('-campo') -> sin orden
 * (null: el de la tabla por defecto). Otra columna empieza en ascendente.
 * @param {string | null | undefined} actual
 * @param {string} campo
 * @returns {string | null}
 */
export function alternarOrden(actual, campo) {
  if (actual === campo) return `-${campo}`;
  if (actual === `-${campo}`) return null;
  return campo;
}

const TEXTOS_BUSCABLES = (v) => typeof v === 'string' || typeof v === 'number';

/**
 * Las filas donde está cada palabra de `busqueda`, sin tildes ni mayúsculas (normalizarBusqueda): 'colchon' encuentra
 * 'Colchón'. `campos` son claves o funciones (fila) => valor; sin campos se buscan todos los textos y números de la
 * fila. Una búsqueda vacía devuelve todas (una copia).
 * @template T
 * @param {ReadonlyArray<T>} filas
 * @param {unknown} busqueda
 * @param {ReadonlyArray<string | ((fila: T) => unknown)>} [campos]
 * @returns {T[]}
 */
export function filtrarFilas(filas, busqueda, campos) {
  const palabras = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean);
  const lista = [...(filas ?? [])];
  if (!palabras.length) return lista;
  const textoDe = (fila) => {
    const valores = campos?.length
      ? campos.map((c) => (typeof c === 'function' ? c(fila) : /** @type {any} */ (fila)?.[c]))
      : Object.values(/** @type {any} */ (fila) ?? {});
    return valores.filter(TEXTOS_BUSCABLES).map(normalizarBusqueda).join(' ');
  };
  return lista.filter((fila) => {
    const texto = textoDe(fila);
    return palabras.every((p) => texto.includes(p));
  });
}

const COLADOR = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const esVacio = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

function comparar(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return COLADOR.compare(String(a), String(b));
}

/**
 * Las filas ordenadas por `orden` ('campo' ascendente, '-campo' descendente; null deja el orden): estable, con los
 * vacíos (null, undefined, '' y NaN) al final en las dos direcciones, en español sin distinguir tildes ni mayúsculas y
 * con los números en su orden ('COT-9' antes de 'COT-10'). `accesores[campo](fila)` da el valor (valorOrden de la
 * columna); si no, fila[campo]. Devuelve una copia.
 * @template T
 * @param {ReadonlyArray<T>} filas
 * @param {string | null | undefined} orden
 * @param {Record<string, (fila: T) => unknown>} [accesores]
 * @returns {T[]}
 */
export function ordenarFilas(filas, orden, accesores = {}) {
  const lista = [...(filas ?? [])];
  if (!orden) return lista;
  const descendente = orden.startsWith('-');
  const campo = descendente ? orden.slice(1) : orden;
  const valorDe = typeof accesores[campo] === 'function' ? accesores[campo] : (fila) => /** @type {any} */ (fila)?.[campo];
  return lista
    .map((fila, i) => ({ fila, i, v: valorDe(fila) }))
    .sort((a, b) => {
      const va = esVacio(a.v);
      const vb = esVacio(b.v);
      if (va || vb) return va && vb ? a.i - b.i : va ? 1 : -1;
      const c = comparar(a.v, b.v);
      return (descendente ? -c : c) || a.i - b.i;
    })
    .map((x) => x.fila);
}

const enteroPositivo = (v, porDefecto) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : porDefecto;
};

/**
 * Las filas de la página `pagina` (desde 1) de `tamano` filas.
 * @template T
 * @param {ReadonlyArray<T>} filas
 * @param {number} pagina
 * @param {number} tamano
 * @returns {T[]}
 */
export function paginar(filas, pagina, tamano) {
  const p = enteroPositivo(pagina, 1);
  const t = enteroPositivo(tamano, TAMANOS_PAGINA[0]);
  return (filas ?? []).slice((p - 1) * t, p * t);
}

// ─── paginación ─────────────────────────────────────────────────────────────────

/**
 * Cuántas páginas hay (al menos 1).
 * @param {number} total
 * @param {number} tamano
 * @returns {number}
 */
export function totalPaginas(total, tamano) {
  const t = enteroPositivo(tamano, TAMANOS_PAGINA[0]);
  const n = Number(total);
  return Math.max(1, Math.ceil((Number.isFinite(n) && n > 0 ? n : 0) / t));
}

/**
 * Los números de página que se muestran: una ventana de `ventana` páginas alrededor de `pagina`, dentro de
 * [1, totalPaginas]: (7, 20) -> [5..9]; (1, 3) -> [1, 2, 3]; (1, 0) -> [].
 * @param {number} pagina
 * @param {number} totalDePaginas
 * @param {number} [ventana]
 * @returns {number[]}
 */
export function rangoPaginas(pagina, totalDePaginas, ventana = 5) {
  const total = Math.max(0, Math.trunc(Number(totalDePaginas)) || 0);
  if (!total) return [];
  const v = enteroPositivo(ventana, 5);
  const p = Math.min(total, enteroPositivo(pagina, 1));
  const inicio = Math.max(1, Math.min(p - Math.floor(v / 2), total - v + 1));
  const fin = Math.min(total, inicio + v - 1);
  return Array.from({ length: fin - inicio + 1 }, (_, i) => inicio + i);
}

/**
 * La página dentro de [1, totalPaginas(total, tamano)]: una fuera de rango (por ejemplo, después de filtrar) se
 * corrige a la última; una que no es un entero positivo, a la 1.
 * @param {unknown} pagina
 * @param {number} total
 * @param {number} tamano
 * @returns {number}
 */
export function paginaValida(pagina, total, tamano) {
  return Math.min(totalPaginas(total, tamano), enteroPositivo(pagina, 1));
}

/**
 * 'Mostrando 26–50 de 134' (la página se corrige con paginaValida; miles con punto) o 'Sin resultados'.
 * @param {number} pagina
 * @param {number} tamano
 * @param {number} total
 * @returns {string}
 */
export function textoRango(pagina, tamano, total) {
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0) return 'Sin resultados';
  const t = enteroPositivo(tamano, TAMANOS_PAGINA[0]);
  const p = paginaValida(pagina, n, t);
  const desde = (p - 1) * t + 1;
  const hasta = Math.min(p * t, n);
  return `Mostrando ${formatoEntero(desde)}–${formatoEntero(hasta)} de ${formatoEntero(n)}`;
}

// ─── el estado único de la pantalla (C3, R5) ────────────────────────────────────

const textoONulo = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v)
  : typeof v === 'string' && v.trim() !== '' ? v : null);

/** Una lista de estados sin vacíos ni repetidos, desde un arreglo o un CSV ('A, B,,A' -> ['A', 'B']). */
function listaDeEstados(v) {
  const crudos = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const vistos = new Set();
  for (const e of crudos) {
    const s = typeof e === 'string' ? e.trim() : typeof e === 'number' ? String(e) : '';
    if (s) vistos.add(s);
  }
  return [...vistos];
}

const NORMALIZAR = {
  vista: textoONulo,
  modo: (v) => (MODOS_TABLA.includes(v) ? v : MODOS_TABLA[0]),
  semaforo: textoONulo,
  paso: textoONulo,
  estados: listaDeEstados,
  q: (v) => (v === null || v === undefined ? '' : String(v)),
  orden: textoONulo,
  pagina: (v) => enteroPositivo(v, 1),
  tamano: (v) => (TAMANOS_PAGINA.includes(Number(v)) ? Number(v) : TAMANOS_PAGINA[0]),
};
const CAMPOS = Object.keys(NORMALIZAR);

/**
 * El estado de una pantalla recién abierta: sin pestaña, en Lista, sin filtros, página 1 y 25 filas. Inmutable.
 * @type {Readonly<EstadoTabla>}
 */
export const ESTADO_TABLA_INICIAL = congelar({
  vista: null, modo: 'lista', semaforo: null, paso: null, estados: [], q: '', orden: null, pagina: 1, tamano: 25,
});

/**
 * Un estado completo y normalizado (una copia que se puede usar como estado de React): lo de `parcial` que vale, y lo
 * de ESTADO_TABLA_INICIAL en lo demás. Sirve para lo que vuelve de sessionStorage (T4C) y para el `inicial` de cada
 * pantalla (por ejemplo {modo: 'kanban'} en el CRM).
 * @param {Partial<Record<keyof EstadoTabla, unknown>>} [parcial]
 * @returns {EstadoTabla}
 */
export function estadoTablaInicial(parcial = {}) {
  const estado = /** @type {any} */ ({ ...ESTADO_TABLA_INICIAL, estados: [] });
  const normalizar = /** @type {Record<string, (v: unknown) => unknown>} */ (NORMALIZAR);
  for (const campo of CAMPOS) {
    if (parcial && tiene(parcial, campo)) estado[campo] = normalizar[campo](/** @type {any} */ (parcial)[campo]);
  }
  return /** @type {EstadoTabla} */ (estado);
}

const iguales = (a, b) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b);

/**
 * El reductor del estado único de la pantalla (useEstadoTabla, T4C). Las tarjetas pulsables, las cajas del flujo, los
 * botones del semáforo, las pestañas, la búsqueda y el filtro de estados despachan aquí:
 *  - {tipo: 'vista' | 'modo' | 'semaforo' | 'paso' | 'estados' | 'q' | 'orden' | 'tamano' | 'pagina', valor}
 *    ('busqueda' es lo mismo que 'q');
 *  - {tipo: 'cambiar', cambios: {...}} para varios campos a la vez (una tarjeta que pone la vista y quita el paso);
 *  - {tipo: 'limpiarFiltros'}: sin semáforo, paso, estados ni búsqueda (conserva pestaña, modo, orden y tamaño);
 *  - {tipo: 'restablecerOrden', rechazado} (T4C r2, punto 2; la despacha useListado cuando el servidor rechaza un orden
 *    con 422): quita el orden SOLO si sigue siendo el rechazado (como cualquier cambio, vuelve a la página 1); si el
 *    usuario ya eligió otro, devuelve el MISMO estado y su elección no se pisa.
 * Todo cambio que no sea solo de página vuelve a la página 1; uno que no cambia nada devuelve el MISMO estado (sin
 * otra carga). Los valores se normalizan (un tamaño que no está en TAMANOS_PAGINA es 25; un modo desconocido, 'lista').
 * Una acción o un campo desconocidos son un error de programación (lanza Error). No muta el estado recibido.
 * @param {EstadoTabla} estado
 * @param {AccionTabla} accion
 * @returns {EstadoTabla}
 */
export function reducirEstadoTabla(estado, accion) {
  const actual = estado ?? ESTADO_TABLA_INICIAL;
  const tipo = /** @type {any} */ (accion)?.tipo;
  /** @type {Record<string, unknown>} */
  let cambios;
  if (CAMPOS.includes(tipo)) cambios = { [tipo]: /** @type {any} */ (accion).valor };
  else if (tipo === 'busqueda') cambios = { q: /** @type {any} */ (accion).valor };
  else if (tipo === 'cambiar') cambios = { .../** @type {any} */ (accion).cambios };
  else if (tipo === 'limpiarFiltros') cambios = { semaforo: null, paso: null, estados: [], q: '' };
  else if (tipo === 'restablecerOrden') {
    const rechazado = /** @type {any} */ (accion).rechazado;
    if (typeof rechazado !== 'string' || actual.orden !== rechazado) return actual;
    cambios = { orden: null };
  } else throw new Error(`Acción de la tabla desconocida: ${String(tipo)}`);

  const siguiente = /** @type {any} */ ({ ...actual });
  const previo = /** @type {any} */ (actual);
  const normalizar = /** @type {Record<string, (v: unknown) => unknown>} */ (NORMALIZAR);
  let cambio = false;
  let soloPagina = true;
  for (const [campo, valor] of Object.entries(cambios)) {
    if (!CAMPOS.includes(campo)) throw new Error(`Campo de la tabla desconocido: ${campo}`);
    const nuevo = normalizar[campo](valor);
    if (iguales(previo[campo], nuevo)) continue;
    siguiente[campo] = nuevo;
    cambio = true;
    if (campo !== 'pagina') soloPagina = false;
  }
  if (!cambio) return actual;
  if (!soloPagina) siguiente.pagina = 1;
  return /** @type {EstadoTabla} */ (siguiente);
}

// ─── parámetros de lista y respuesta (TABLA-api) ────────────────────────────────

/**
 * El texto (ya codificado) de un valor de la consulta, o null si se omite (D23).
 * @param {string} clave
 * @param {unknown} v
 * @returns {string | null}
 */
function valorDeConsulta(clave, v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) {
    const partes = v.map((x) => valorDeConsulta(clave, x)).filter((x) => x !== null);
    return partes.length ? partes.join(',') : null;
  }
  if (typeof v === 'string') {
    const s = clave === 'q' ? v.trim() : v;
    return s.trim() === '' ? null : encodeURIComponent(s);
  }
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  if (typeof v === 'boolean') return v ? '1' : '0';
  throw new Error(`Valor que no se puede mandar en la consulta de la lista: ${clave}`);
}

/**
 * Los parámetros de la lista para el servidor, sin '?': 'vista=…&semaforo=…&paso=…&q=…&estados=A,B&orden=-monto&
 * limit=25&offset=50' (limit = tamano y offset = (pagina − 1) × tamano). RP8: la búsqueda va como q y los estados en
 * CSV como estados (nunca search ni estado=). D23:
 *  - las claves de `extra` pisan las del estado en su mismo lugar, y todas pasan aunque el estado no las conozca
 *    (columna, saldo, con_conteos…), al final y en su orden;
 *  - null, undefined y '' (también un texto de solo espacios) se omiten, aunque vengan en extra para quitar una del
 *    estado; un 0 se manda (limit=0 de las columnas plegadas) y NaN no;
 *  - los arreglos van en CSV (sin elementos vacíos; vacío = se omite); true/false van como 1/0.
 * Un objeto como valor es un error de programación (lanza Error).
 * @param {EstadoTabla | null | undefined} estado
 * @param {Record<string, unknown>} [extra]
 * @returns {string}
 */
export function queryListado(estado, extra = {}) {
  const e = estado ?? ESTADO_TABLA_INICIAL;
  const tamano = NORMALIZAR.tamano(e.tamano);
  const pagina = NORMALIZAR.pagina(e.pagina);
  const todo = {
    vista: e.vista, semaforo: e.semaforo, paso: e.paso, q: e.q, estados: e.estados, orden: e.orden,
    limit: tamano, offset: (pagina - 1) * tamano,
    ...(extra ?? {}),
  };
  const partes = [];
  for (const [clave, valor] of Object.entries(todo)) {
    const texto = valorDeConsulta(clave, valor);
    if (texto !== null) partes.push(`${encodeURIComponent(clave)}=${texto}`);
  }
  return partes.join('&');
}

const objeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * La respuesta de una lista en una sola forma: {filas, total, conteos, resumen, crudo}. Acepta:
 *  - {status, total, data: [...], conteos?, resumen?} (core/listados.py, respuesta);
 *  - un arreglo plano;
 *  - {data: {items, total_skus}};
 *  - {data: {items, total, limit, offset}}, la del Kardex (RP54): total = data.total ?? data.total_skus.
 * Sin un total numérico, el total es el largo de las filas; conteos y resumen son null si no vienen. `crudo` es la
 * respuesta tal cual (para las claves propias del endpoint). Nada útil da {filas: [], total: 0, …} sin lanzar.
 * @param {unknown} d
 * @returns {RespuestaListado}
 */
export function normalizarRespuesta(d) {
  if (Array.isArray(d)) return { filas: d, total: d.length, conteos: null, resumen: null, crudo: d };
  if (!objeto(d)) return { filas: [], total: 0, conteos: null, resumen: null, crudo: d ?? null };
  const r = /** @type {any} */ (d);
  let filas = [];
  let total;
  if (Array.isArray(r.data)) {
    filas = r.data;
    total = r.total;
  } else if (objeto(r.data) && Array.isArray(r.data.items)) {
    filas = r.data.items;
    total = r.data.total ?? r.data.total_skus;
  }
  return {
    filas,
    total: typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : filas.length,
    conteos: objeto(r.conteos) ? r.conteos : null,
    resumen: objeto(r.resumen) ? r.resumen : null,
    crudo: d,
  };
}

// ─── menú de fila (MenuFila, T4A) ───────────────────────────────────────────────

/**
 * Dónde va el menú ⋯ de una fila o una tarjeta (components/ui/MenuFila.tsx, posición fija en un portal): alineado al
 * borde derecho del botón, `separacion` px debajo; si no cabe abajo y sí arriba, abre hacia arriba. Si no cabe en
 * ningún lado, va donde hay más espacio (abajo si empatan) y altoMaximo es ese espacio (el menú se desplaza adentro).
 * Nunca se sale de la ventana por los lados: queda a `margen` px de los bordes.
 * @param {{top: number, bottom: number, right: number}} boton el getBoundingClientRect() del botón
 * @param {{ancho: number, alto: number}} menu
 * @param {{ancho: number, alto: number}} ventana
 * @param {{margen?: number, separacion?: number}} [opciones]
 * @returns {{top: number, left: number, haciaArriba: boolean, altoMaximo: number}}
 */
export function posicionMenu(boton, menu, ventana, { margen = 8, separacion = 4 } = {}) {
  const left = Math.max(margen, Math.min(boton.right - menu.ancho, ventana.ancho - menu.ancho - margen));
  const abajo = ventana.alto - boton.bottom - separacion - margen;
  const arriba = boton.top - separacion - margen;
  const haciaArriba = menu.alto > abajo && (menu.alto <= arriba || arriba > abajo);
  if (!haciaArriba) return { top: boton.bottom + separacion, left, haciaArriba, altoMaximo: abajo };
  return { top: Math.max(margen, boton.top - separacion - menu.alto), left, haciaArriba, altoMaximo: arriba };
}

// ─── T4C: el estado de la pantalla entre la sesión y las preferencias (useEstadoTabla) ──────────────────────────────

/**
 * Lo del estado de la pantalla que va en sessionStorage 'tabla-sesion:{id}' (R4, C2): el estado de la SESIÓN, para
 * volver a la misma pestaña, página, búsqueda y orden (y semáforo, paso y filtro de estados) al regresar de un
 * documento. T4C r1, punto 2: 'estados' también, porque la página N solo tiene sentido con el filtro con que se llegó a
 * ella. El modo (vista:<id>) y el tamaño (tabla:<id>) son preferencias del usuario (lib/preferencias.js). Inmutable.
 * @type {ReadonlyArray<CampoSesionTabla>}
 */
export const CAMPOS_SESION_TABLA = congelar(['vista', 'pagina', 'q', 'orden', 'semaforo', 'paso', 'estados']);

/** El máximo de valores de 'estados' que acepta el servidor (core/listados.py); más, en la sesión, no se restaura. */
export const MAXIMO_ESTADOS = 20;

/** 'estados' de la sesión que vale: un arreglo de hasta MAXIMO_ESTADOS textos no vacíos. */
const estadosDeSesionValidos = (v) => Array.isArray(v) && v.length <= MAXIMO_ESTADOS
  && v.every((e) => typeof e === 'string' && e.trim() !== '');

/**
 * La clave de sessionStorage del estado de la sesión de una pantalla: 'tabla-sesion:{id}'.
 * @param {string} id
 * @returns {string}
 */
export function claveSesionTabla(id) {
  return `tabla-sesion:${id}`;
}

/**
 * El texto que se guarda en 'tabla-sesion:{id}': el JSON de CAMPOS_SESION_TABLA (normalizados) y el usuario. Va el
 * usuario con que se pintó la pantalla (escriturasDeAccion): sessionStorage sobrevive a cerrar la sesión y entrar con
 * otra cuenta en la misma pestaña (como el borrador del Chatter, lib/chatter.js), y leerSesionTabla no le restaura a
 * un usuario lo de otro.
 * @param {Partial<EstadoTabla> | null | undefined} estado
 * @param {number | null} [usuario] el sub del token (usuarioDelToken de lib/preferencias.js), o null
 * @returns {string}
 */
export function textoSesionTabla(estado, usuario = null) {
  const e = /** @type {Record<string, unknown>} */ (estadoTablaInicial(estado ?? {}));
  /** @type {Record<string, unknown>} */
  const sesion = { usuario: usuario ?? null };
  for (const campo of CAMPOS_SESION_TABLA) sesion[campo] = e[campo];
  return JSON.stringify(sesion);
}

/**
 * Lo que se restaura de 'tabla-sesion:{id}': solo los CAMPOS_SESION_TABLA que trae el texto, normalizados como en
 * estadoTablaInicial. 'estados' se valida (un arreglo de hasta MAXIMO_ESTADOS textos no vacíos): si no vale, se descarta
 * ese campo y los demás quedan. Un texto de otro usuario, dañado o que no es un objeto da {} (nada que restaurar); nunca
 * lanza.
 * @param {unknown} texto
 * @param {number | null} [usuario]
 * @returns {SesionTabla}
 */
export function leerSesionTabla(texto, usuario = null) {
  if (typeof texto !== 'string' || !texto) return {};
  let crudo;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return {};
  }
  if (!objeto(crudo) || (crudo.usuario ?? null) !== (usuario ?? null)) return {};
  const normalizar = /** @type {Record<string, (v: unknown) => unknown>} */ (NORMALIZAR);
  /** @type {Record<string, unknown>} */
  const sesion = {};
  for (const campo of CAMPOS_SESION_TABLA) {
    if (!tiene(crudo, campo)) continue;
    if (campo === 'estados' && !estadosDeSesionValidos(crudo.estados)) continue;
    sesion[campo] = normalizar[campo](crudo[campo]);
  }
  return /** @type {SesionTabla} */ (sesion);
}

/**
 * La sesión que vale para la pantalla (useEstadoTabla, T4C r1, punto 4): lo que el usuario cambió en este montaje
 * (`local`, {id, usuario, sesion}) solo si es de esta misma pantalla y de este mismo usuario; si no, lo guardado en
 * tabla-sesion:{id} leído con el usuario de hoy. Con otra cuenta en el token, lo de la anterior no vale: ni lo local ni
 * lo guardado (que da {}), y la pantalla arranca de `inicial`.
 * @param {{id: string, usuario: number | null, sesion: SesionTabla} | null | undefined} local
 * @param {{id: string, usuario: number | null, texto: unknown}} vigente
 * @returns {SesionTabla}
 */
export function sesionVigente(local, { id, usuario, texto }) {
  if (local && local.id === id && (local.usuario ?? null) === (usuario ?? null) && objeto(local.sesion)) return local.sesion;
  return leerSesionTabla(texto, usuario);
}

/**
 * El estado de la pantalla armado con sus fuentes (useEstadoTabla; R4, R5, C2, C3 y RP26): `inicial` (el de la
 * pantalla), lo de la sesión (sesionVigente: pestaña, página, búsqueda, orden, semáforo, paso y estados) y las dos
 * preferencias del usuario: el modo (vista:<id>) y el tamaño (tabla:<id>). Un modo o un tamaño que no vale (o
 * undefined, mientras no están listas) da el de `inicial`. Es una restauración: NO vuelve a la página 1. No muta lo que
 * recibe.
 * @param {Partial<Record<keyof EstadoTabla, unknown>> | null | undefined} inicial
 * @param {{sesion?: SesionTabla | null, modo?: unknown, tamano?: unknown}} [fuentes]
 * @returns {EstadoTabla}
 */
export function armarEstadoTabla(inicial, { sesion, modo, tamano } = {}) {
  const base = estadoTablaInicial(inicial ?? {});
  /** @type {Record<string, unknown>} */
  const parcial = { ...base };
  if (objeto(sesion)) {
    for (const campo of CAMPOS_SESION_TABLA) if (tiene(sesion, campo)) parcial[campo] = /** @type {any} */ (sesion)[campo];
  }
  if (esModoTabla(modo)) parcial.modo = modo;
  if (TAMANOS_PAGINA.includes(/** @type {number} */ (tamano))) parcial.tamano = tamano;
  return estadoTablaInicial(parcial);
}

/**
 * Qué cambió después de una acción (useEstadoTabla): cada campo tiene UN lugar, así que la sesión (si cambió alguno de
 * CAMPOS_SESION_TABLA, también los estados), el modo (vista:<id>) y el tamaño (la pieza {tamano} de tabla:<id>).
 * @param {EstadoTabla | null | undefined} actual
 * @param {EstadoTabla | null | undefined} siguiente
 * @returns {CambiosEstadoTabla}
 */
export function cambiosEstadoTabla(actual, siguiente) {
  const a = /** @type {any} */ (actual ?? ESTADO_TABLA_INICIAL);
  const s = /** @type {any} */ (siguiente ?? ESTADO_TABLA_INICIAL);
  return {
    sesion: CAMPOS_SESION_TABLA.some((campo) => !iguales(a[campo], s[campo])),
    modo: a.modo !== s.modo,
    tamano: a.tamano !== s.tamano,
  };
}

/**
 * Lo que useEstadoTabla escribe después de una acción (T4C r1, puntos 3 y 4): null si el usuario del token ya no es el
 * del render (la acción se hizo sobre la pantalla de otra cuenta: no se guarda ni se pinta); si no, el texto de la
 * sesión firmado con el usuario del render (o null si no cambió), el modo y el tamaño (o null si no cambiaron).
 * @param {EstadoTabla} actual
 * @param {EstadoTabla} siguiente
 * @param {{usuarioRender?: number | null, usuarioToken?: number | null}} usuarios
 * @returns {{sesion: string | null, modo: ModoTabla | null, tamano: number | null} | null}
 */
export function escriturasDeAccion(actual, siguiente, { usuarioRender = null, usuarioToken = null } = {}) {
  if ((usuarioRender ?? null) !== (usuarioToken ?? null)) return null;
  const c = cambiosEstadoTabla(actual, siguiente);
  return {
    sesion: c.sesion ? textoSesionTabla(siguiente, usuarioRender ?? null) : null,
    modo: c.modo ? siguiente.modo : null,
    tamano: c.tamano ? siguiente.tamano : null,
  };
}

/**
 * Las dependencias del tablero de la misma pantalla (useTableroKanban con pantalla = el id de useEstadoTabla; D39): la
 * pestaña, el semáforo, el paso, la búsqueda (sin los espacios de los bordes, como queryListado) y el filtro de estados
 * en CSV. No van la página, el orden de la tabla (cada columna tiene el suyo), el modo (es `activo`) ni el tamaño (es
 * porColumna). Valores simples, para la firma del tablero.
 * @param {Partial<EstadoTabla> | null | undefined} estado
 * @returns {[string | null, string | null, string | null, string, string]}
 */
export function dependenciasTablero(estado) {
  const e = estadoTablaInicial(estado ?? {});
  return [e.vista, e.semaforo, e.paso, e.q.trim(), e.estados.join(',')];
}

// ─── T4C: la pieza de las columnas que escribe usePreferenciasTabla ───────────────────────────────────────────────

const PIEZAS_COLUMNAS = /** @type {const} */ (['orden', 'anchos', 'ocultas']);
/** La pieza está en lo guardado (una que se borró con undefined, en el valor del vínculo, ya no cuenta). */
const presente = (g, k) => tiene(g, k) && g[k] !== undefined;

/**
 * La parte de tabla:<id> que escribe usePreferenciasTabla con escribirParte para un cambio del usuario (RP26, D38): SOLO
 * la pieza que cambió, con la versión, sin un objeto armado con todo el estado de la tabla. null si el cambio no cambia
 * nada de lo que se ve (no hay que escribir).
 *  - {tipo: 'anchos', anchos: {id: px}} (al soltar el borde o con 'Ajustar al ancho'): {version, anchos}, con los anchos
 *    ya guardados de las columnas de hoy más los nuevos (limitarAncho con el mínimo y el máximo de cada columna). Una
 *    columna que nunca se estiró no se guarda: sigue su ancho por defecto.
 *  - {tipo: 'mover', id, hueco}: {version, orden}. `hueco` es el de los encabezados VISIBLES (indiceDestino): 0 = antes
 *    de la primera visible, visibles.length = después de la última. Sin cruzar las fijas (moverColumna).
 *  - {tipo: 'desplazar', id, paso: -1 | 1} (las flechas de 'Ajustar tabla'): un lugar en el orden completo.
 *  - {tipo: 'ocultar', id, oculta?}: {version, ocultas} (sin `oculta`, alterna). Una clave no se oculta y nunca quedan
 *    cero columnas visibles.
 *  - reconciliarColumnas lee 'ocultas' solo para las columnas del 'orden' guardado (las demás son nuevas y salen con
 *    ocultaPorDefecto). Por eso, si lo guardado no tiene todas las columnas de hoy en su orden, 'mover' va con las
 *    ocultas que ve el usuario y 'ocultar' con el orden que ve: si no, el orden solo destaparía una oculta por defecto,
 *    o la oculta no se leería.
 *  - {tipo: 'restablecer'}: borra las tres piezas (van como undefined: el JSON de escribirParte las quita) y conserva el
 *    tamaño de useEstadoTabla. Sin nada que borrar, null.
 *  - Si lo guardado es de otra versión (reconciliarColumnas no lo lee), las piezas viejas que no cambian se borran
 *    igual: con la versión de hoy revivirían.
 *  - Límite conocido (T4C r1, 6e): si la precarga falló y después el servidor vuelve, lo guardado que ve el vínculo es
 *    {} y una pieza compuesta ({orden, ocultas}, o el mapa de anchos) se arma sobre {} y reemplaza esa pieza guardada en
 *    el servidor. No se cierra aquí: haría falta que T4A exponga que la precarga está fallida.
 * Un cambio desconocido es un error de programación (lanza Error). No muta lo que recibe.
 * @param {ReadonlyArray<DefinicionColumna>} definicion
 * @param {unknown} guardado lo de tabla:<id> (con el tamaño y lo que haya)
 * @param {CambioColumnas} cambio
 * @returns {ParteColumnas | null}
 */
export function parteDeColumnas(definicion, guardado, cambio) {
  const columnas = (definicion ?? []).filter((c) => c && typeof c.id === 'string' && c.id);
  const porId = new Map(columnas.map((c) => [c.id, c]));
  const g = /** @type {any} */ (objeto(guardado) ? guardado : {});
  const vigente = g.version === VERSION_PREFS;
  const actual = reconciliarColumnas(columnas, g);
  const conoceTodas = vigente && Array.isArray(g.orden) && columnas.every((c) => g.orden.includes(c.id));
  const c = /** @type {any} */ (cambio);
  const tipo = c?.tipo;
  /** @type {Record<string, unknown>} */
  let pieza;

  if (tipo === 'anchos') {
    const previos = vigente && objeto(g.anchos) ? g.anchos : {};
    /** @type {Record<string, number>} */
    const anchos = {};
    for (const col of columnas) {
      if (tiene(previos, col.id) && typeof previos[col.id] === 'number') {
        anchos[col.id] = limitarAncho(previos[col.id], col.anchoMin ?? ANCHO_MIN, col.anchoMax ?? ANCHO_MAX);
      }
    }
    let cambia = false;
    for (const [id, px] of Object.entries(objeto(c.anchos) ? c.anchos : {})) {
      const col = porId.get(id);
      if (!col || typeof px !== 'number' || !Number.isFinite(px)) continue;
      const nuevo = limitarAncho(px, col.anchoMin ?? ANCHO_MIN, col.anchoMax ?? ANCHO_MAX);
      anchos[id] = nuevo;
      if (nuevo !== actual.anchos[id]) cambia = true;
    }
    if (!cambia) return null;
    pieza = { anchos };
  } else if (tipo === 'mover' || tipo === 'desplazar') {
    if (!porId.has(c.id)) return null;
    let destino;
    if (tipo === 'mover') {
      const hueco = Math.trunc(Number(c.hueco));
      if (!Number.isFinite(hueco)) return null;
      const visibles = actual.orden.filter((id) => !actual.ocultas.includes(id));
      const h = Math.max(0, Math.min(visibles.length, hueco));
      destino = h < visibles.length ? actual.orden.indexOf(visibles[h]) : actual.orden.indexOf(visibles[visibles.length - 1]) + 1;
    } else {
      const paso = Math.sign(Number(c.paso));
      if (!paso) return null;
      const i = actual.orden.indexOf(c.id);
      destino = paso > 0 ? i + 2 : i - 1;
    }
    const orden = moverColumna(actual.orden, c.id, destino, fijasDe(columnas));
    if (iguales(orden, actual.orden)) return null;
    pieza = conoceTodas ? { orden } : { orden, ocultas: actual.ocultas };
  } else if (tipo === 'ocultar') {
    const col = porId.get(c.id);
    if (!col || col.clave) return null;
    const ya = actual.ocultas.includes(col.id);
    const quiere = c.oculta === undefined ? !ya : c.oculta === true;
    if (quiere === ya) return null;
    const nuevas = new Set(quiere ? [...actual.ocultas, col.id] : actual.ocultas.filter((id) => id !== col.id));
    if (columnas.every((x) => nuevas.has(x.id))) return null;
    const ocultas = columnas.filter((x) => nuevas.has(x.id)).map((x) => x.id);
    pieza = conoceTodas ? { ocultas } : { orden: actual.orden, ocultas };
  } else if (tipo === 'restablecer') {
    if (!PIEZAS_COLUMNAS.some((k) => presente(g, k))) return null;
    return { version: VERSION_PREFS, orden: undefined, anchos: undefined, ocultas: undefined };
  } else {
    throw new Error(`Cambio de columnas desconocido: ${String(tipo)}`);
  }

  /** @type {Record<string, unknown>} */
  const parte = { version: VERSION_PREFS, ...pieza };
  if (!vigente) for (const k of PIEZAS_COLUMNAS) if (!tiene(parte, k) && presente(g, k)) parte[k] = undefined;
  return /** @type {ParteColumnas} */ (parte);
}

/**
 * El actualizador que usePreferenciasTabla le pasa a guardarParte (usePreferenciaParte, T4A): la pieza se calcula con
 * lo último del vínculo, no con lo del render, así que dos cambios seguidos (antes de otro render) no se pisan. Si
 * recibe `sinGuardar` (el valor por defecto del vínculo) devuelve {}: una pieza armada sobre lo por defecto subiría sin
 * lo que hay en el servidor (D35 y D38). Un cambio que no cambia nada también da {}. Con una pieza vacía
 * vincularPreferencia no publica ni acumula nada (T4C r1), así que el valor sigue siendo `sinGuardar` hasta listo: la
 * guarda vale para cualquier cantidad de llamadas. No mira el usuario: eso lo hace guardarCambioColumnas.
 * @param {ReadonlyArray<DefinicionColumna>} definicion
 * @param {CambioColumnas} cambio
 * @param {object} sinGuardar el MISMO objeto que el hook pasa como valor por defecto a usePreferenciaParte
 * @returns {(anterior: unknown) => Partial<ParteColumnas>}
 */
export function actualizadorColumnas(definicion, cambio, sinGuardar) {
  return (anterior) => (anterior === sinGuardar ? {} : (parteDeColumnas(definicion, anterior, cambio) ?? {}));
}

/**
 * Lo que hace cada operación de usePreferenciasTabla (T4C r1, puntos 3 y 6a): no escribe (false) antes de listo ni si
 * el usuario del token ya no es el usuario con que se pintó la pantalla (el gesto se hizo sobre la pantalla de otra
 * cuenta). Si no, guardarParte(actualizadorColumnas(…)) y devuelve si la pieza trajo algo. La pieza se calcula con lo
 * último del vínculo: sin un filtro previo con lo del render, dos cambios seguidos en el mismo manejador se suman bien.
 * Si guardarParte descarta el guardado (un cambio de sesión que el hook no vio) y no llama al actualizador, false.
 * @param {(entrada: (anterior: any) => Record<string, unknown>) => void} guardarParte
 * @param {{definicion: ReadonlyArray<DefinicionColumna>, cambio: CambioColumnas, sinGuardar: object, listo: boolean,
 *   usuarioRender: number | null, usuarioToken: number | null}} opciones
 * @returns {boolean}
 */
export function guardarCambioColumnas(guardarParte, { definicion, cambio, sinGuardar, listo, usuarioRender, usuarioToken }) {
  if (!listo || (usuarioRender ?? null) !== (usuarioToken ?? null)) return false;
  const actualizar = actualizadorColumnas(definicion, cambio, sinGuardar);
  let escribio = false;
  guardarParte((anterior) => {
    const parte = actualizar(anterior);
    escribio = Object.keys(parte).length > 0;
    return parte;
  });
  return escribio;
}

// ─── T4C: la lista desde el servidor (useListado) y en el navegador (useListadoCliente) ──────────────────────────

/**
 * La URL de una lista para apiFetch: `ruta` más queryListado(estado, extra) (RP8: q y estados en CSV, nunca search ni
 * estado=) y, al final, con_conteos=1 y con_resumen=1 si se piden (sin pedirlos no van: la respuesta es la de hoy).
 * Una ruta que ya trae '?' sigue con '&'.
 * @param {string} ruta
 * @param {EstadoTabla | null | undefined} estado
 * @param {{extra?: Record<string, unknown> | null, conConteos?: boolean, conResumen?: boolean}} [opciones]
 * @returns {string}
 */
export function urlListado(ruta, estado, { extra = {}, conConteos = false, conResumen = false } = {}) {
  const consulta = queryListado(estado, {
    ...(extra ?? {}),
    ...(conConteos ? { con_conteos: true } : {}),
    ...(conResumen ? { con_resumen: true } : {}),
  });
  if (!consulta) return ruta;
  return `${ruta}${ruta.includes('?') ? '&' : '?'}${consulta}`;
}

/**
 * La carga de una lista paginada (useListado; TABLA-api punto 3 y D28: «una carga lenta no pisa a la nueva»), en JS
 * plano para probarla con node:
 *  - cargar(url, marca, contexto?): aborta la petición anterior (AbortController), toma un turno nuevo y pide con su
 *    signal. Lo que llega (la respuesta o el error) se publica con alLlegar({marca, ok, respuesta | error, contexto,
 *    repeticion}) SOLO si su petición sigue siendo la vigente: la de una vieja se descarta ANTES de publicar, aunque
 *    `pedir` no respete el signal. `contexto` ({ruta, orden}) vuelve tal cual con la llegada (el 422 de orden).
 *  - cancelar(): aborta la vigente y nada pendiente se publica (el efecto se limpia: otra consulta, activo = false,
 *    esperar o desmontaje). Con StrictMode (monta, desmonta y vuelve a montar en el mismo tic) la abortada antes de salir
 *    no se pide: sale una sola petición.
 *  - T4C r1, 6b: volver a pedir la consulta que ya llegó (activo: false → true, o esperar: true → false, con la misma
 *    consulta) es una VUELTA: repeticion() sube y se avisa a los suscriptores (suscribir, para useSyncExternalStore). La
 *    llegada lleva la repetición con que se pidió: mientras no llega, la tabla se ve recargando y sin el error anterior.
 *  - T4C r2, punto 3: atender(n) guarda el número del rechazo de orden ya atendido y avisa a los suscriptores (como las
 *    vueltas): es estado que vuelve a pintar la tabla, no un ref. Un useState fijado en el cuerpo del efecto daría el
 *    error de lint react-hooks/set-state-in-effect.
 *  - Un `pedir` que lanza de inmediato es un error de la carga, no una excepción de cargar.
 * @param {{pedir: (url: string, signal: AbortSignal) => unknown, alLlegar: (llegada: LlegadaListado) => void}} opciones
 * @returns {{cargar: (url: string, marca: string, contexto?: ContextoListado | null) => number, cancelar: () => void,
 *   turno: () => number, repeticion: () => number, atender: (n: number) => void, atendido: () => number | null,
 *   suscribir: (oyente: () => void) => () => void}}
 */
export function crearCargaListado({ pedir, alLlegar }) {
  let turno = 0;
  /** @type {AbortController | null} */
  let control = null;
  /** La marca de la última llegada publicada. */
  let entregada = /** @type {string | null} */ (null);
  let repeticion = 0;
  /** @type {Set<() => void>} */
  const oyentes = new Set();

  function cancelar() {
    turno += 1;
    if (control) {
      control.abort();
      control = null;
    }
  }

  function cargar(url, marca, contexto = null) {
    if (control) control.abort();
    turno += 1;
    const mio = turno;
    if (marca === entregada) {
      repeticion += 1;
      for (const oyente of [...oyentes]) oyente();
    }
    const vuelta = repeticion;
    const propio = new AbortController();
    control = propio;
    const vigente = () => mio === turno && !propio.signal.aborted;
    const publicar = (/** @type {Partial<LlegadaListado>} */ resto) => {
      if (!vigente()) return;
      entregada = marca;
      alLlegar(/** @type {LlegadaListado} */ ({ marca, ...resto, contexto, repeticion: vuelta }));
    };
    Promise.resolve()
      .then(() => (vigente() ? pedir(url, propio.signal) : null))
      .then(
        (respuesta) => publicar({ ok: true, respuesta }),
        (error) => publicar({ ok: false, error }),
      );
    return mio;
  }

  /** El número del último rechazo de orden atendido (T4C r2, punto 3); cambiarlo avisa a los suscriptores. */
  let atendido = /** @type {number | null} */ (null);
  function atender(n) {
    if (atendido === n) return;
    atendido = n;
    for (const oyente of [...oyentes]) oyente();
  }

  function suscribir(oyente) {
    oyentes.add(oyente);
    return () => { oyentes.delete(oyente); };
  }

  return {
    cargar, cancelar, turno: () => turno, repeticion: () => repeticion, atender, atendido: () => atendido, suscribir,
  };
}

/**
 * El tope de espera de las preferencias de una pantalla (useEstadoTabla, T4C r2, punto 4): si el GET de preferencias se
 * cuelga (apiFetch no tiene tope), a los 4 s el `listo` que devuelve useEstadoTabla pasa a true igual y la tabla carga
 * con los valores en memoria. Las escrituras no cambian: siguen esperando el listo de su vínculo (T4A, D35).
 */
export const ESPERA_PREFERENCIAS_MS = 4000;

const relojDelSistema = {
  setTimeout: (/** @type {() => void} */ fn, /** @type {number} */ ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (/** @type {any} */ id) => globalThis.clearTimeout(id),
};

/**
 * Arma el tope de espera de las preferencias: llama a `alVencer` UNA vez, `ms` después (ESPERA_PREFERENCIAS_MS), y
 * devuelve la limpieza (al desmontar, el tope no vence después). El temporizador se inyecta para probarlo con node.
 * @param {{alVencer: () => void, temporizador?: {setTimeout: (fn: () => void, ms: number) => any,
 *   clearTimeout: (id: any) => void}, ms?: number}} opciones
 * @returns {() => void}
 */
export function esperarPreferencias({ alVencer, temporizador = relojDelSistema, ms = ESPERA_PREFERENCIAS_MS }) {
  const id = temporizador.setTimeout(alVencer, ms);
  return () => temporizador.clearTimeout(id);
}

/**
 * El `listo` que devuelve useEstadoTabla: las preferencias de sus vínculos ya se leyeron, o venció el tope de espera
 * para el usuario del render, desde el montaje o desde un cambio de usuario (lo que ocurra primero).
 * @param {boolean} vinculosListos
 * @param {boolean} vencido
 * @returns {boolean}
 */
export function listoConTope(vinculosListos, vencido) {
  return Boolean(vinculosListos || vencido);
}

/**
 * El cuerpo del efecto de useListado (T4C r1, puntos 5 y 6b): con activo = false (RP35) o mientras `esperar` (las
 * preferencias de la pantalla todavía no están listas) no pide nada; si no, carga la consulta vigente y devuelve la
 * limpieza, que la aborta (otra consulta, activo = false, esperar, desmontaje o StrictMode).
 * @param {{cargar: (url: string, marca: string, contexto?: ContextoListado | null) => number, cancelar: () => void}} carga
 * @param {{url: string, clave: string, contexto?: ContextoListado | null, activo?: boolean, esperar?: boolean}} consulta
 * @returns {(() => void) | undefined}
 */
export function lanzarListado(carga, { url, clave, contexto = null, activo = true, esperar = false }) {
  if (!activo || esperar) return undefined;
  carga.cargar(url, clave, contexto);
  return () => carga.cancelar();
}

/** El texto con que core/listados.py rechaza un orden (HTTPException 422). */
export const TEXTO_ORDEN_RECHAZADO = 'No se puede ordenar por';

const textoDelError = (error) => {
  const e = /** @type {any} */ (error);
  return [e?.message, e?.detail].filter((t) => typeof t === 'string');
};

/**
 * true si `error` es el 422 con que el servidor rechaza el orden de la consulta (T4C r1, punto 1): status 422, el
 * estado con un orden puesto (no null ni vacío) y el texto de core/listados.py («No se puede ordenar por…», en el
 * message o en el detail de apiFetch). Cualquier otro 422, o el mismo con el orden por defecto (null), es un error
 * común: no hay vuelta al orden por defecto ni bucle.
 * @param {unknown} error
 * @param {{orden?: string | null} | null | undefined} estado
 * @returns {boolean}
 */
export function esErrorDeOrden(error, estado) {
  if (/** @type {any} */ (error)?.status !== 422) return false;
  const orden = estado?.orden;
  if (typeof orden !== 'string' || orden.trim() === '') return false;
  return textoDelError(error).some((t) => t.includes(TEXTO_ORDEN_RECHAZADO));
}

/** El aviso de un orden rechazado sigue mientras la ruta sea la misma y el orden sea el rechazado o el por defecto. */
const sigueRechazo = (rechazo, { ruta = null, orden = null } = {}) => rechazo.ruta === (ruta ?? null)
  && (orden === null || orden === undefined || orden === '' || orden === rechazo.orden);

/** T4C r2, punto 1: el resultado es del usuario de hoy (sin usuario en los dos lados, también). */
const mismoUsuario = (resultado, usuario) => (resultado?.usuario ?? null) === (usuario ?? null);

/**
 * Lo que queda de la lista cuando llega la respuesta (o el error) de la carga `marca`: con una respuesta,
 * normalizarRespuesta y sin error; con un error, lo último que llegó bien (las filas, el total, los conteos y el
 * resumen) y el error. Cada llegada lleva su número `n` (sube siempre), la repetición con que se pidió (6b) y el usuario
 * del contexto (T4C r2, punto 1): las filas de un usuario nunca pasan a otro, ni siquiera con un error, y un rechazo de
 * orden tampoco.
 * T4C r1, punto 1: un 422 de orden (esErrorDeOrden con el orden del contexto) deja `rechazo` {n, texto, ruta, orden}.
 * El rechazo sobrevive a las llegadas siguientes (también a la respuesta buena, ya sin orden) mientras sean del mismo
 * usuario, de la misma ruta y con el orden rechazado o el por defecto; si no, se borra. No muta lo que recibe.
 * @param {ResultadoListado | null | undefined} previo
 * @param {LlegadaListado} llegada
 * @returns {ResultadoListado}
 */
export function aplicarLlegadaListado(previo, llegada) {
  const n = (previo?.n ?? 0) + 1;
  const contexto = llegada.contexto ?? {};
  const repeticion = llegada.repeticion ?? 0;
  const usuario = contexto.usuario ?? null;
  const propio = previo && mismoUsuario(previo, usuario) ? previo : null;
  /** @type {RechazoOrden | null} */
  let rechazo = null;
  if (!llegada.ok && esErrorDeOrden(llegada.error, contexto)) {
    const textos = textoDelError(llegada.error);
    rechazo = {
      n, texto: textos.find((t) => t.includes(TEXTO_ORDEN_RECHAZADO)) ?? textos[0], ruta: contexto.ruta ?? null,
      orden: /** @type {string} */ (contexto.orden),
    };
  } else if (propio?.rechazo && sigueRechazo(propio.rechazo, contexto)) {
    rechazo = propio.rechazo;
  }
  const base = { clave: llegada.marca, n, repeticion, usuario, rechazo };
  if (llegada.ok) return { ...base, datos: normalizarRespuesta(llegada.respuesta), error: null };
  return { ...base, datos: propio?.datos ?? null, error: llegada.error ?? null };
}

/**
 * El número del rechazo de orden que useListado tiene que atender (despachar UNA vez {tipo: 'restablecerOrden',
 * rechazado}, desde un efecto): el de la ÚLTIMA llegada, si fue un 422 de orden, no se atendió (`atendido`, el último
 * número atendido), es del usuario de hoy y la pantalla sigue con el orden rechazado. Si no, null.
 * @param {ResultadoListado | null | undefined} resultado
 * @param {{orden: string | null | undefined, atendido: number | null, usuario?: number | null}} opciones
 * @returns {number | null}
 */
export function rechazoPorAtender(resultado, { orden, atendido, usuario = null }) {
  const r = resultado?.rechazo;
  if (!resultado || !r || !mismoUsuario(resultado, usuario)) return null;
  if (r.n !== resultado.n || r.n === atendido || orden !== r.orden) return null;
  return r.n;
}

/**
 * Lo que ve la tabla de una lista del servidor (useListado). `clave` es la de la consulta que quiere la pantalla y
 * `resultado` el de la última que llegó; si no son la misma (y está activa), hay una carga en camino:
 *  - antes de la primera respuesta: sin filas, total, conteos ni resumen (null, nunca 0: H6) y cargandoInicial;
 *  - con una respuesta anterior: sus filas siguen y recargando (las filas atenuadas y la barra fina de T4D);
 *  - el error de la última carga se muestra (dentro de la tabla, con Reintentar) mientras no haya otra en camino;
 *  - RP35: con activo = false no hay nada en camino y queda lo último que llegó;
 *  - T4C r1, punto 5: mientras `esperar` (y activo) cuenta como en camino: cargandoInicial sin datos, recargando con
 *    datos, nunca la tabla vacía;
 *  - 6b: con una vuelta en camino (`repeticion` de la carga distinta de la del resultado), también en camino;
 *  - punto 1: avisoOrden es el texto del 422 de orden mientras la ruta sea la misma y el orden sea el rechazado o el por
 *    defecto. Con `restablece` (la pantalla pasó despachar), la llegada del rechazo cuenta como en camino y su error no se
 *    pinta mientras no se haya atendido (r2, punto 3: `atendido` es el número del último atendido); si se atendió y la
 *    consulta no cambió (el orden sigue siendo el rechazado), el error vuelve a verse, con Reintentar;
 *  - T4C r2, punto 1: un resultado de otro usuario (`usuario`, el del token del render) cuenta como sin resultado: ni
 *    sus filas, ni su total, conteos, resumen, error o aviso; la tabla queda en cargandoInicial.
 * @param {ResultadoListado | null | undefined} resultado
 * @param {{clave: string, activo?: boolean, esperar?: boolean, repeticion?: number, ruta?: string | null,
 *   orden?: string | null, restablece?: boolean, atendido?: number | null, usuario?: number | null}} opciones
 * @returns {EstadoListado}
 */
export function estadoListado(resultado, {
  clave, activo = true, esperar = false, repeticion = 0, ruta = null, orden = null, restablece = false, atendido = null,
  usuario = null,
}) {
  const propio = resultado && mismoUsuario(resultado, usuario) ? resultado : null;
  const datos = propio?.datos ?? null;
  const rechazo = propio?.rechazo ?? null;
  const volviendo = restablece && rechazo !== null && rechazo.n === propio?.n && orden === rechazo.orden
    && atendido !== rechazo.n;
  const enCamino = activo && (esperar || volviendo || propio?.clave !== clave || (propio?.repeticion ?? 0) !== repeticion);
  return {
    filas: datos ? datos.filas : [],
    total: datos ? datos.total : null,
    conteos: datos ? datos.conteos : null,
    resumen: datos ? datos.resumen : null,
    crudo: datos ? datos.crudo : null,
    cargandoInicial: enCamino && !datos,
    recargando: enCamino && Boolean(datos),
    error: enCamino ? null : (propio?.error ?? null),
    avisoOrden: rechazo && sigueRechazo(rechazo, { ruta, orden }) ? rechazo.texto : null,
  };
}

/**
 * Una lista chica que el endpoint trae completa (useListadoCliente: la papelera de SC, los leads de una campaña, las
 * tablas de detalle), filtrada, ordenada y paginada en el navegador con el mismo estado de la pantalla:
 *  - filtro(fila, estado): el propio de la pantalla (vista, semáforo, paso), si lo hay;
 *  - estados: estadoDe(fila) (por defecto fila.estado) tiene que estar en estado.estados (si hay filtro);
 *  - q con filtrarFilas (sin tildes) sobre `busqueda` (claves o funciones; sin campos, todos los textos y números);
 *  - orden con ordenarFilas y los accesores `orden` (el valorOrden de cada columna);
 *  - la página con paginaValida (una fuera de rango salta a la última que existe) y paginar.
 * Mientras la pantalla trae los datos (filas null o undefined): sin filas, total null y cargandoInicial. No muta.
 * @template T
 * @param {ReadonlyArray<T> | null | undefined} filas
 * @param {EstadoTabla | null | undefined} estado
 * @param {{busqueda?: ReadonlyArray<string | ((fila: T) => unknown)>, orden?: Record<string, (fila: T) => unknown>,
 *   estadoDe?: (fila: T) => unknown, filtro?: (fila: T, estado: EstadoTabla) => boolean}} [accesores]
 * @returns {{filas: T[], total: number | null, todas: T[], pagina: number, cargandoInicial: boolean}}
 */
export function listadoCliente(filas, estado, { busqueda, orden, estadoDe, filtro } = {}) {
  if (!Array.isArray(filas)) return { filas: [], total: null, todas: [], pagina: 1, cargandoInicial: true };
  const e = estadoTablaInicial(/** @type {any} */ (estado ?? {}));
  /** @type {T[]} */
  let lista = filtro ? filas.filter((fila) => filtro(fila, e)) : [...filas];
  if (e.estados.length) {
    const permitidos = new Set(e.estados);
    const de = estadoDe ?? ((fila) => /** @type {any} */ (fila)?.estado);
    lista = lista.filter((fila) => {
      const valor = de(fila);
      return valor !== null && valor !== undefined && permitidos.has(String(valor));
    });
  }
  lista = filtrarFilas(lista, e.q, busqueda);
  lista = ordenarFilas(lista, e.orden, orden);
  const pagina = paginaValida(e.pagina, lista.length, e.tamano);
  return { filas: paginar(lista, pagina, e.tamano), total: lista.length, todas: lista, pagina, cargandoInicial: false };
}

// ─── T4D: la lógica de los componentes de vista (TablaEstandar, BarraTabla, FiltroEstados, MenuAjustes y Paginacion) ──

/**
 * @typedef {{valor: string, etiqueta: string}} OpcionEstado
 * @typedef {ReadonlyArray<OpcionEstado> | ((vista: string | null) => ReadonlyArray<OpcionEstado> | null | undefined)} OpcionesEstados
 * @typedef {string | number} ClaveFila
 * @typedef {'todas' | 'algunas' | 'ninguna'} EstadoSeleccion
 * @typedef {'esqueleto' | 'error' | 'vacio' | 'filas'} VistaCuerpo
 * @typedef {{tipo: 'grupo', grupo: string, n: number} | {tipo: 'fila', fila: any, indice: number}} RenglonTabla
 * @typedef {{texto: string, visto: string, enviado: string | null}} LocalBusqueda
 */

/** Los píxeles que hay que pasar, presionando el título, para que sea mover la columna (TABLA-base: «más de 5 px»). */
export const UMBRAL_MOVER_COLUMNA = 5;

/**
 * true si el puntero ya se movió MÁS de UMBRAL_MOVER_COLUMNA px desde donde se presionó el título (en cualquier
 * dirección): desde ahí es mover la columna; hasta ahí, soltar es un clic (ordena).
 * @param {number} dx
 * @param {number} dy
 * @returns {boolean}
 */
export function superaUmbralColumna(dx, dy) {
  const d = Math.hypot(dx, dy);
  return Number.isFinite(d) && d > UMBRAL_MOVER_COLUMNA;
}

/** El doble clic en el borde ajusta la columna al texto más largo que se ve, hasta este ancho. */
export const ANCHO_AJUSTE_CONTENIDO = 480;
/** El relleno de una celda (px-3 a cada lado: TABLE.celda y TABLE.encabezado de design-system.ts). */
export const RELLENO_CELDA = 24;
/** El ancho de la casilla de selección (no es una columna de las preferencias: va siempre primera y fija). */
export const ANCHO_SELECCION = 40;

/** El mínimo y el máximo de una columna (64 y 640 si no los dice; el máximo nunca menor que el mínimo). */
const limitesDe = (c) => {
  const min = c?.anchoMin ?? ANCHO_MIN;
  return { min, max: Math.max(min, c?.anchoMax ?? ANCHO_MAX) };
};

/**
 * El ancho del doble clic en el borde: el contenido más ancho medido (scrollWidth de las celdas que se ven), hacia
 * arriba, más `relleno`, entre el mínimo de la columna y el menor entre su máximo y ANCHO_AJUSTE_CONTENIDO (un mínimo
 * de más de 480 manda). null si no hay ninguna medida (un número finito, 0 o más).
 * @param {ReadonlyArray<unknown>} medidas
 * @param {{anchoMin?: number, anchoMax?: number}} [columna]
 * @param {number} [relleno]
 * @returns {number | null}
 */
export function anchoAlContenido(medidas, columna = {}, relleno = RELLENO_CELDA) {
  const validas = /** @type {number[]} */ ((medidas ?? []).filter((m) => typeof m === 'number' && Number.isFinite(m) && m >= 0));
  if (!validas.length) return null;
  const { min } = limitesDe(columna);
  const max = Math.max(min, Math.min(columna?.anchoMax ?? ANCHO_MAX, ANCHO_AJUSTE_CONTENIDO));
  return limitarAncho(Math.ceil(Math.max(...validas)) + relleno, min, max);
}

/**
 * 'Ajustar al ancho de la pantalla' (MenuAjustes): los anchos de las columnas visibles para que sumen `disponible` px
 * (el ancho para las columnas, sin la casilla; TablaEstandar lo publica en anchoRef) y la tabla no se corra de lado:
 *  - las de ancho fijo (anchoMin = anchoMax: la casilla, las acciones) no cambian;
 *  - las demás se escalan en proporción a su ancho de hoy (lo guardado, o el de la definición), cada una entre su
 *    mínimo y su máximo (las que llegan a su mínimo se quedan ahí y lo demás se reparte entre las otras);
 *  - píxeles enteros: lo que sobra del redondeo va a las de mayor fracción (empate: la primera);
 *  - si ni con los mínimos cabe, los mínimos (la tabla se corre); si ni con los máximos se llena, los máximos.
 * Devuelve {id: px} de las visibles que están en la definición, o null si `disponible` no es un número positivo o no
 * hay ninguna. No muta lo que recibe. Es lo que la pantalla guarda con guardarAnchos (D38: solo la pieza {anchos}).
 * @param {ReadonlyArray<DefinicionColumna>} definicion
 * @param {ReadonlyArray<string>} visibles
 * @param {Record<string, number>} anchos
 * @param {unknown} disponible
 * @returns {Record<string, number> | null}
 */
export function ajustarAlAncho(definicion, visibles, anchos, disponible) {
  if (typeof disponible !== 'number' || !Number.isFinite(disponible) || disponible <= 0) return null;
  const porId = new Map((definicion ?? []).filter((c) => c && typeof c.id === 'string').map((c) => [c.id, c]));
  const columnas = (visibles ?? []).filter((id) => porId.has(id)).map((id) => {
    const c = porId.get(id);
    const { min, max } = limitesDe(c);
    const guardado = anchos?.[id];
    const actual = limitarAncho(typeof guardado === 'number' ? guardado : (c.ancho ?? ANCHO_POR_DEFECTO), min, max);
    // T4D r1 (6n): con anchoMin 0 y ancho 0 la proporción sería 0 (y el tope, una división por cero): pesa como 1 px.
    return { id, min, max, actual: actual > 0 ? actual : 1 };
  });
  if (!columnas.length) return null;
  /** @type {Record<string, number>} */
  const resultado = {};
  const libres = [];
  let fijo = 0;
  for (const c of columnas) {
    if (c.min === c.max) {
      resultado[c.id] = c.min;
      fijo += c.min;
    } else libres.push(c);
  }
  const objetivo = Math.floor(disponible - fijo);
  const sumaMin = libres.reduce((a, c) => a + c.min, 0);
  const sumaMax = libres.reduce((a, c) => a + c.max, 0);
  if (sumaMin >= objetivo) {
    for (const c of libres) resultado[c.id] = c.min;
  } else if (sumaMax <= objetivo) {
    for (const c of libres) resultado[c.id] = c.max;
  } else {
    // El factor f con Σ min(max, max(min, actual × f)) = objetivo (la suma crece con f): búsqueda binaria.
    const ancho = (c, f) => Math.min(c.max, Math.max(c.min, c.actual * f));
    let bajo = 0;
    let alto = Math.max(...libres.map((c) => c.max / c.actual));
    for (let i = 0; i < 60; i += 1) {
      const f = (bajo + alto) / 2;
      if (libres.reduce((a, c) => a + ancho(c, f), 0) < objetivo) bajo = f;
      else alto = f;
    }
    const exactos = libres.map((c, i) => ({ c, i, w: ancho(c, alto) }));
    let resto = objetivo;
    for (const x of exactos) {
      resultado[x.c.id] = Math.floor(x.w);
      resto -= resultado[x.c.id];
    }
    const porFraccion = [...exactos].sort((a, b) => (b.w - Math.floor(b.w)) - (a.w - Math.floor(a.w)) || a.i - b.i);
    for (const x of porFraccion) {
      if (resto <= 0) break;
      if (resultado[x.c.id] < x.c.max) {
        resultado[x.c.id] += 1;
        resto -= 1;
      }
    }
  }
  return Object.fromEntries(columnas.map((c) => [c.id, resultado[c.id]]));
}

/**
 * Lo que pinta TablaEstandar (<colgroup>, el ancho de la <table> y position: sticky):
 *  - anchos: el de cada visible (o ANCHO_POR_DEFECTO) y, si la tabla mide menos que `disponible` (el ancho del
 *    contenedor, medido con ResizeObserver), las columnas flexibles visibles se reparten lo que sobra (píxeles enteros;
 *    el suelto, a la primera en el orden visible). Nunca bajan de su ancho: si no sobra, la tabla se corre de lado;
 *  - total: la suma, con la casilla de selección (`anchoSeleccion`, 0 sin selección);
 *  - offsets: {id: px} de las fijas visibles (offsetsFijas); las de la izquierda empiezan después de la casilla.
 * No muta lo que recibe.
 * @param {{visibles: ReadonlyArray<string>, anchos: Record<string, number>, fijas?: Record<string, LadoFijo>,
 *   flexibles?: ReadonlyArray<string>, disponible?: number | null, anchoSeleccion?: number}} entrada
 * @returns {{anchos: Record<string, number>, total: number, offsets: Record<string, number>}}
 */
export function geometriaTabla({ visibles, anchos, fijas = {}, flexibles = [], disponible = null, anchoSeleccion = 0 }) {
  const lista = [...(visibles ?? [])];
  const lados = fijas ?? {};
  /** @type {Record<string, number>} */
  const pintados = {};
  for (const id of lista) pintados[id] = typeof anchos?.[id] === 'number' ? anchos[id] : ANCHO_POR_DEFECTO;
  const seleccion = Number.isFinite(anchoSeleccion) && anchoSeleccion > 0 ? anchoSeleccion : 0;
  const suma = lista.reduce((a, id) => a + pintados[id], 0) + seleccion;
  const flex = lista.filter((id) => (flexibles ?? []).includes(id));
  if (flex.length && typeof disponible === 'number' && Number.isFinite(disponible) && disponible > suma) {
    const sobra = Math.floor(disponible - suma);
    const parte = Math.floor(sobra / flex.length);
    flex.forEach((id, i) => {
      pintados[id] += parte + (i === 0 ? sobra - parte * flex.length : 0);
    });
  }
  /** @type {Record<string, number>} */
  const offsets = {};
  for (const [id, px] of Object.entries(offsetsFijas(lista, pintados, lados))) {
    offsets[id] = lados[id] === 'izquierda' ? px + seleccion : px;
  }
  return { anchos: pintados, total: lista.reduce((a, id) => a + pintados[id], 0) + seleccion, offsets };
}

/**
 * El destino de la columna `id` que se arrastra (TablaEstandar): el hueco de los encabezados VISIBLES (el de
 * indiceDestino), sin cruzar las fijas (queda entre las de la izquierda y las de la derecha), y si soltar ahí cambia el
 * orden (con `cambia` false no se pinta la línea azul ni se guarda). Una fija o un id que no está no cambian nada; un
 * hueco que no es número da {hueco: null, cambia: false}.
 * @param {ReadonlyArray<string>} visibles
 * @param {Record<string, LadoFijo>} fijas
 * @param {string} id
 * @param {number} hueco
 * @returns {{hueco: number | null, cambia: boolean}}
 */
export function destinoArrastre(visibles, fijas, id, hueco) {
  if (typeof hueco !== 'number' || !Number.isFinite(hueco)) return { hueco: null, cambia: false };
  const lista = [...(visibles ?? [])];
  const lados = fijas ?? {};
  const izquierda = lista.filter((x) => lados[x] === 'izquierda').length;
  const derecha = lista.filter((x) => lados[x] === 'derecha').length;
  const h = Math.max(izquierda, Math.min(lista.length - derecha, Math.trunc(hueco)));
  // moverColumna no mueve una fija ni un id que no está: el orden queda igual y no cambia nada.
  const cambia = !iguales(moverColumna(lista, id, h, lados), lista);
  return { hueco: h, cambia };
}

/**
 * Dónde va la línea azul del hueco `hueco` (en px, en las mismas coordenadas que `bordes`): el borde izquierdo del
 * encabezado de ese hueco, o el derecho del último. `bordes` como en indiceDestino. null sin bordes o sin número.
 * @param {ReadonlyArray<[number, number] | {left: number, right: number}>} bordes
 * @param {number} hueco
 * @returns {number | null}
 */
export function bordeDeHueco(bordes, hueco) {
  const lista = bordes ?? [];
  if (!lista.length || typeof hueco !== 'number' || !Number.isFinite(hueco)) return null;
  const h = Math.max(0, Math.trunc(hueco));
  const par = (b) => (Array.isArray(b) ? b : [b.left, b.right]);
  return h < lista.length ? par(lista[h])[0] : par(lista[lista.length - 1])[1];
}

/**
 * El campo de orden de una columna: su id con ordenable: true, el texto de ordenable (el campo del servidor, por
 * ejemplo 'total_cop'), o null si no se ordena.
 * @param {{id: string, ordenable?: boolean | string} | null | undefined} columna
 * @returns {string | null}
 */
export function campoOrden(columna) {
  if (!columna) return null;
  if (columna.ordenable === true) return columna.id;
  if (typeof columna.ordenable === 'string' && columna.ordenable.trim()) return columna.ordenable.trim();
  return null;
}

/**
 * La flecha del título (y su aria-sort): 'asc' si la tabla está ordenada por `campo`, 'desc' si por '-campo', o null.
 * @param {string | null | undefined} orden
 * @param {string | null | undefined} campo
 * @returns {'asc' | 'desc' | null}
 */
export function direccionOrden(orden, campo) {
  if (!campo || !orden) return null;
  if (orden === campo) return 'asc';
  if (orden === `-${campo}`) return 'desc';
  return null;
}

/**
 * Los accesores de orden de useListadoCliente (modo 'cliente'): {campo: valorOrden} de las columnas que se ordenan y
 * traen valorOrden (sin valorOrden, ordenarFilas usa fila[campo]). Conviene armarlo una vez (constante o useMemo).
 * @template T
 * @param {ReadonlyArray<{id: string, ordenable?: boolean | string, valorOrden?: (fila: T) => unknown}>} columnas
 * @returns {Record<string, (fila: T) => unknown>}
 */
export function accesoresDeOrden(columnas) {
  /** @type {Record<string, (fila: T) => unknown>} */
  const accesores = {};
  for (const c of columnas ?? []) {
    const campo = campoOrden(c);
    if (campo && typeof c.valorOrden === 'function') accesores[campo] = c.valorOrden;
  }
  return accesores;
}

/**
 * Qué pinta el cuerpo de TablaEstandar: 'esqueleto' mientras carga sin datos (8 renglones grises, nunca 0), 'error'
 * (la fila 'No se pudo cargar la lista: …' con Reintentar; sin filas viejas, que serían de otra consulta), 'vacio' (lo
 * de la prop vacio) o 'filas'.
 * @param {{cargando?: boolean, error?: unknown, filas?: ReadonlyArray<unknown> | null}} entrada
 * @returns {VistaCuerpo}
 */
export function vistaCuerpo({ cargando = false, error = null, filas = [] }) {
  if (cargando) return 'esqueleto';
  if (error !== null && error !== undefined && error !== false) return 'error';
  return filas?.length ? 'filas' : 'vacio';
}

/**
 * Los renglones del cuerpo con sus separadores (grupoFila y tituloGrupo de TablaEstandar; el semáforo del Hub): un
 * separador {tipo: 'grupo', grupo, n} al empezar cada tramo seguido de filas del mismo grupo (n = cuántas tiene el
 * tramo) y cada fila como {tipo: 'fila', fila, indice}. Una fila sin grupo (null, undefined o '') no pinta separador.
 * Sin grupoDe, solo filas.
 * @template T
 * @param {ReadonlyArray<T> | null | undefined} filas
 * @param {(fila: T) => unknown} [grupoDe]
 * @returns {RenglonTabla[]}
 */
export function filasConGrupos(filas, grupoDe) {
  const lista = [...(filas ?? [])];
  if (typeof grupoDe !== 'function') return lista.map((fila, indice) => ({ tipo: 'fila', fila, indice }));
  const grupos = lista.map((fila) => {
    const g = grupoDe(fila);
    return g === null || g === undefined || g === '' ? null : String(g);
  });
  /** @type {RenglonTabla[]} */
  const renglones = [];
  lista.forEach((fila, indice) => {
    const g = grupos[indice];
    if (g !== null && (indice === 0 || grupos[indice - 1] !== g)) {
      let n = 0;
      while (indice + n < grupos.length && grupos[indice + n] === g) n += 1;
      renglones.push({ tipo: 'grupo', grupo: g, n });
    }
    renglones.push({ tipo: 'fila', fila, indice });
  });
  return renglones;
}

/**
 * La página a la que hay que saltar porque un filtro dejó menos páginas (TablaEstandar despacha {tipo: 'pagina'}): la
 * última que existe (paginaValida), o null si la página existe. Solo con el total ya llegado de la consulta vigente:
 * mientras carga, recarga (el total es el de la consulta anterior) o con error, null.
 * @param {{pagina: number, tamano: number, total: number | null | undefined, cargando?: boolean,
 *   recargando?: boolean, error?: unknown}} entrada
 * @returns {number | null}
 */
export function paginaCorregida({ pagina, tamano, total, cargando = false, recargando = false, error = null }) {
  if (cargando || recargando || (error !== null && error !== undefined)) return null;
  if (typeof total !== 'number' || !Number.isFinite(total)) return null;
  const valida = paginaValida(pagina, total, tamano);
  return valida === pagina ? null : valida;
}

// ─── T4D: la selección (la casilla de cada fila y la del encabezado) ─────────────────────────────────────────────

/**
 * La selección con `clave` marcada o desmarcada (una copia).
 * @param {ReadonlyArray<ClaveFila>} seleccion
 * @param {ClaveFila} clave
 * @returns {ClaveFila[]}
 */
export function alternarSeleccion(seleccion, clave) {
  const lista = [...(seleccion ?? [])];
  return lista.includes(clave) ? lista.filter((c) => c !== clave) : [...lista, clave];
}

/**
 * La casilla del encabezado: 'todas' si están marcadas todas las filas seleccionables de la página (`claves`),
 * 'algunas' (indeterminada) o 'ninguna' (también sin filas seleccionables).
 * @param {ReadonlyArray<ClaveFila>} seleccion
 * @param {ReadonlyArray<ClaveFila>} claves
 * @returns {EstadoSeleccion}
 */
export function estadoSeleccionPagina(seleccion, claves) {
  const marcadas = new Set(seleccion ?? []);
  const lista = claves ?? [];
  const n = lista.filter((c) => marcadas.has(c)).length;
  if (!lista.length || n === 0) return 'ninguna';
  return n === lista.length ? 'todas' : 'algunas';
}

/**
 * La casilla del encabezado marca SOLO la página visible (TABLA-base): si ya estaban todas, las quita; si no, agrega
 * las que faltan (en el orden de la página). Lo de otras páginas no se toca. Una copia.
 * @param {ReadonlyArray<ClaveFila>} seleccion
 * @param {ReadonlyArray<ClaveFila>} claves
 * @returns {ClaveFila[]}
 */
export function alternarSeleccionPagina(seleccion, claves) {
  const lista = [...(seleccion ?? [])];
  const pagina = [...(claves ?? [])];
  if (estadoSeleccionPagina(lista, pagina) === 'todas') return lista.filter((c) => !pagina.includes(c));
  return [...lista, ...pagina.filter((c) => !lista.includes(c))];
}

/**
 * La firma de la lista que se ve (TablaEstandar limpia la selección cuando cambia; R5 y C3): la pestaña, el modo, el
 * semáforo, el paso, el filtro de estados, la búsqueda, el orden, la página y el tamaño, normalizados.
 * @param {Partial<EstadoTabla> | null | undefined} estado
 * @returns {string}
 */
export function firmaSeleccion(estado) {
  const e = /** @type {Record<string, unknown>} */ (estadoTablaInicial(estado ?? {}));
  return JSON.stringify(CAMPOS.map((campo) => e[campo]));
}

// ─── T4D: la barra (búsqueda, resultados, pestañas con su filtro) y las flechas de 'Ajustar tabla' ───────────────

/** La búsqueda de BarraTabla sale 300 ms después de la última tecla (Enter y la X, de inmediato). */
export const RETARDO_BUSQUEDA_MS = 300;

/**
 * La búsqueda con retardo de BarraTabla: escribir(texto) espera `ms` desde la ÚLTIMA tecla y llama alBuscar UNA vez con
 * lo último; ya(texto) (Enter, la X) busca de inmediato y descarta lo que esperaba; cancelar() (al desmontar) no deja
 * nada en espera. El temporizador se inyecta para probarlo con node.
 * @param {{alBuscar: (texto: string) => void, temporizador?: {setTimeout: (fn: () => void, ms: number) => any,
 *   clearTimeout: (id: any) => void}, ms?: number}} opciones
 * @returns {{escribir: (texto: string) => void, ya: (texto: string) => void, cancelar: () => void}}
 */
export function crearBusquedaConRetardo({ alBuscar, temporizador = relojDelSistema, ms = RETARDO_BUSQUEDA_MS }) {
  /** @type {any} */
  let id = null;
  const cancelar = () => {
    if (id !== null) temporizador.clearTimeout(id);
    id = null;
  };
  return {
    escribir(texto) {
      cancelar();
      id = temporizador.setTimeout(() => {
        id = null;
        alBuscar(texto);
      }, ms);
    },
    ya(texto) {
      cancelar();
      alBuscar(texto);
    },
    cancelar,
  };
}

/**
 * La caja de búsqueda de BarraTabla cuando cambia el q del estado (`q` distinto de `local.visto`): si es el eco de lo
 * que la caja mandó (`enviado`), se conserva lo que se sigue escribiendo; si vino de afuera (limpiar filtros, volver de
 * un documento), el texto pasa a ser q. Sin cambio de q, el MISMO objeto.
 * @param {LocalBusqueda} local
 * @param {string} q
 * @returns {LocalBusqueda}
 */
export function sincronizarBusqueda(local, q) {
  if (q === local.visto) return local;
  if (local.enviado !== null && q === local.enviado) return { texto: local.texto, visto: q, enviado: null };
  return { texto: q, visto: q, enviado: null };
}

/**
 * 'N resultados' de BarraTabla: '1 resultado', '1.452 resultados', 'Sin resultados' con 0, o null mientras no hay total
 * (Contador pinta la barra gris; nunca 0).
 * @param {unknown} total
 * @returns {string | null}
 */
export function textoResultados(total) {
  if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) return null;
  if (total === 0) return 'Sin resultados';
  return `${formatoEntero(total)} ${total === 1 ? 'resultado' : 'resultados'}`;
}

/**
 * El estado del Contador (C13) de una pestaña de BarraTabla (y de 'N resultados'), con el de los conteos de la barra
 * (`estadoConteos`, de estadoKpi): sin número, 'cargando' (la barra gris; nunca 0) o 'error' ('—') si los conteos
 * fallaron; con número, 'actualizando' (atenuado) mientras se vuelven a pedir y 'listo' en lo demás (si la recarga
 * falla, queda el último número).
 * @param {unknown} conteo
 * @param {'cargando' | 'actualizando' | 'error' | 'listo'} [estadoConteos]
 * @returns {'cargando' | 'actualizando' | 'error' | 'listo'}
 */
export function estadoDeConteo(conteo, estadoConteos) {
  if (typeof conteo !== 'number' || !Number.isFinite(conteo)) return estadoConteos === 'error' ? 'error' : 'cargando';
  return estadoConteos === 'actualizando' || estadoConteos === 'cargando' ? 'actualizando' : 'listo';
}

/**
 * Las opciones del filtro de estados de la pestaña `vista` (FiltroEstados): las mismas para todas (un arreglo) o una
 * función por pestaña. Nada (o una función que no devuelve un arreglo) da [].
 * @param {OpcionesEstados | null | undefined} opciones
 * @param {string | null} vista
 * @returns {ReadonlyArray<OpcionEstado>}
 */
export function opcionesDeVista(opciones, vista) {
  const lista = typeof opciones === 'function' ? opciones(vista) : opciones;
  return Array.isArray(lista) ? lista : [];
}

/**
 * La acción de una pestaña de BarraTabla: {tipo: 'vista', valor}, o {tipo: 'cambiar', cambios: {vista, estados}} si
 * la pestaña nueva no tiene alguno de los estados filtrados (se quitan: si no, filtrarían sin verse). Sin opciones de
 * estados (la barra no tiene filtro), el filtro no se toca. Como todo cambio, vuelve a la página 1.
 * T4D r1, punto 5: úsalo también en tarjetas y cajas del flujo (todo lo que pone una vista; T7 en adelante), con las
 * mismas opciones que la barra: onEstado(accionPestana(estado, vista, opcionesEstados)). Lo que igual quede filtrado
 * fuera de la pestaña (la sesión restaurada) lo muestra FiltroEstados, que se puede desmarcar.
 * @param {EstadoTabla} estado
 * @param {string} vista
 * @param {OpcionesEstados | null | undefined} opciones
 * @returns {AccionTabla}
 */
export function accionPestana(estado, vista, opciones) {
  const actuales = estado?.estados ?? [];
  if (opciones === null || opciones === undefined || !actuales.length) return { tipo: 'vista', valor: vista };
  const validos = new Set(opcionesDeVista(opciones, vista).map((o) => o.valor));
  const quedan = actuales.filter((e) => validos.has(e));
  if (quedan.length === actuales.length) return { tipo: 'vista', valor: vista };
  return { tipo: 'cambiar', cambios: { vista, estados: quedan } };
}

/**
 * Una casilla de FiltroEstados: los estados con `valor` marcado o desmarcado, en el orden de las opciones (el mismo
 * filtro da la misma URL); lo que no es una opción de la pestaña se descarta.
 * @param {ReadonlyArray<string>} seleccion
 * @param {string} valor
 * @param {ReadonlyArray<OpcionEstado>} opciones
 * @returns {string[]}
 */
export function alternarEstado(seleccion, valor, opciones) {
  const marcados = new Set(seleccion ?? []);
  if (marcados.has(valor)) marcados.delete(valor);
  else marcados.add(valor);
  return (opciones ?? []).map((o) => o.valor).filter((v) => marcados.has(v));
}

/**
 * Si la flecha de 'Ajustar tabla' (subir con −1, bajar con 1) mueve la columna `id` en el orden completo (el mismo
 * movimiento que desplazar de usePreferenciasTabla): no con una fija ni hacia el otro lado de las fijas.
 * @param {ReadonlyArray<string>} orden
 * @param {Record<string, LadoFijo>} fijas
 * @param {string} id
 * @param {number} paso
 * @returns {boolean}
 */
export function puedeDesplazar(orden, fijas, id, paso) {
  const lista = [...(orden ?? [])];
  const lados = fijas ?? {};
  const i = lista.indexOf(id);
  const s = Math.sign(Number(paso));
  if (i < 0 || !s) return false;
  // moverColumna no mueve una fija ni cruza las de los lados: el orden queda igual.
  return !iguales(moverColumna(lista, id, s > 0 ? i + 2 : i - 1, lados), lista);
}

// ─── T4D r1: gestos sin clics fantasma, columna flexible, pantalla completa y filtros a la vista ──────────────────

/** T4D r2, punto 1: lo que hay que mover el asa (en px, a lo largo) para que sea estirar; menos es un clic. */
export const UMBRAL_ASA = 3;

/**
 * true si el asa ya se movió MÁS de UMBRAL_ASA px a lo largo desde donde se presionó: desde ahí es estirar. Por debajo
 * (el temblor de un doble clic, también un paso de 0,67 px con la escala de Windows al 150 %) no es un gesto.
 * @param {number} dx
 * @returns {boolean}
 */
export function superaUmbralAsa(dx) {
  return typeof dx === 'number' && Number.isFinite(dx) && Math.abs(dx) > UMBRAL_ASA;
}

/**
 * El ancho que se guarda al soltar el asa (TablaEstandar, T4D r1, punto 3, y r2, puntos 1 y 2): `base` es el ancho de
 * las preferencias (sin lo que sobra de la tarjeta), `pintado` el que se veía al empezar y `px` el del puntero al soltar.
 *  - si el puntero no pasó el umbral (superaUmbralAsa: un clic, o un doble clic con temblor), null: no se guarda;
 *  - una columna que no es flexible guarda px;
 *  - la flexible, al ensanchar, guarda px, lo que se ve (r2: ensanchar la columna que llena significa que la tabla pase
 *    del ancho disponible); al angostar mientras llena el espacio, min(base, px) (ese espacio tiene que ir a algún lado);
 *  - siempre entre anchoMin y anchoMax (64 y 640 si la columna no los dice); con limitesDelAsa, el asa nunca muestra un
 *    ancho que aquí se recorte, así que al soltar no salta. Un px que no es número da null.
 * @param {{base: number, pintado: number, px: number, flexible?: boolean, anchoMin?: number, anchoMax?: number}} entrada
 * @returns {number | null}
 */
export function anchoAlSoltar({ base, pintado, px, flexible = false, anchoMin, anchoMax }) {
  if (typeof px !== 'number' || !Number.isFinite(px) || !superaUmbralAsa(px - pintado)) return null;
  const { min, max } = limitesDe({ anchoMin, anchoMax });
  const ancho = flexible && px < pintado ? Math.min(base, px) : px;
  return limitarAncho(ancho, min, max);
}

/**
 * Entre qué anchos se mueve el asa mientras se arrastra (TablaEstandar, T4D r1 y r2): el mínimo y el máximo de la
 * columna; en la flexible que llena espacio, el tope es el mayor entre su máximo y lo que se pinta. Así no salta al
 * primer movimiento (se pinta más ancha que su máximo) y nunca se ve un ancho que anchoAlSoltar (y las preferencias,
 * que recortan a anchoMax) no puedan guardar: al soltar no salta. Si el máximo es menor que lo que se pinta, no se
 * puede ensanchar más (solo angostar).
 * @param {{base: number, pintado: number, flexible?: boolean, anchoMin?: number, anchoMax?: number}} entrada
 * @returns {{min: number, max: number}}
 */
export function limitesDelAsa({ base, pintado, flexible = false, anchoMin, anchoMax }) {
  const { min, max } = limitesDe({ anchoMin, anchoMax });
  if (!flexible || !(pintado > base)) return { min, max };
  return { min, max: Math.max(max, pintado) };
}

/**
 * El estado del número de 'N resultados' de BarraTabla (la prop estadoTotal; T4D r1, 6a), con lo de useListado:
 *    estadoTotal={estadoDelTotal({total: listado.total, cargando: listado.cargandoInicial,
 *      recargando: listado.recargando, error: listado.error})}
 * Con error, 'error' ('—': nunca un número viejo junto a la fila de error); sin datos, 'cargando' (la barra gris);
 * recargando, 'actualizando' (el número atenuado); si no, 'listo'.
 * @param {{total: number | null | undefined, cargando?: boolean, recargando?: boolean, error?: unknown}} entrada
 * @returns {'cargando' | 'actualizando' | 'error' | 'listo'}
 */
export function estadoDelTotal({ total, cargando = false, recargando = false, error = null }) {
  if (error !== null && error !== undefined && error !== false) return 'error';
  if (cargando || typeof total !== 'number' || !Number.isFinite(total)) return 'cargando';
  return recargando ? 'actualizando' : 'listo';
}

/**
 * Los bordes de los títulos visibles recortados a la zona libre entre las fijas (TablaEstandar, T4D r1, 6f): con la
 * tabla corrida de lado, lo que quedó debajo de una fija (sticky) no cuenta para indiceDestino ni para la línea azul.
 * `lados` va en el mismo orden que `bordes` ('izquierda', 'derecha' o nada). La zona va del borde derecho de la última
 * fija de la izquierda al borde izquierdo de la primera de la derecha; las fijas quedan como están. Devuelve [inicio,
 * fin] por título (acepta pares o rectángulos {left, right}).
 * T4D r2, punto 5: `limites.inicio` es un borde izquierdo más (el de la caja más la casilla de selección, que también es
 * sticky): gana el que esté más a la derecha.
 * @param {ReadonlyArray<[number, number] | {left: number, right: number}>} bordes
 * @param {ReadonlyArray<LadoFijo | null | undefined>} lados
 * @param {{inicio?: number}} [limites]
 * @returns {Array<[number, number]>}
 */
export function recortarBordes(bordes, lados, limites = {}) {
  const pares = (bordes ?? []).map((b) => (Array.isArray(b) ? [b[0], b[1]] : [b.left, b.right]));
  let inicio = typeof limites?.inicio === 'number' && Number.isFinite(limites.inicio) ? limites.inicio : -Infinity;
  let fin = Infinity;
  pares.forEach(([l, r], i) => {
    if (lados?.[i] === 'izquierda') inicio = Math.max(inicio, r);
    if (lados?.[i] === 'derecha') fin = Math.min(fin, l);
  });
  const tope = Math.max(inicio, fin);
  const dentro = (x) => Math.min(tope, Math.max(inicio, x));
  return pares.map(([l, r], i) => (lados?.[i] ? [l, r] : [dentro(l), dentro(r)]));
}

/**
 * Las etiquetas legibles de los estados que se conocen en la barra (T4D r1, punto 5): las de las opciones de todas las
 * pestañas (`vistas`), o las del arreglo si son las mismas para todas. FiltroEstados las usa para un estado filtrado
 * que la pestaña de hoy no tiene. {valor: etiqueta}; la primera etiqueta de un valor gana.
 * @param {OpcionesEstados | null | undefined} opciones
 * @param {ReadonlyArray<string | null>} vistas
 * @returns {Record<string, string>}
 */
export function etiquetasDeEstados(opciones, vistas) {
  const listas = typeof opciones === 'function'
    ? (vistas ?? []).map((v) => opcionesDeVista(opciones, v))
    : [opcionesDeVista(opciones, null)];
  /** @type {Record<string, string>} */
  const etiquetas = {};
  for (const lista of listas) for (const o of lista) if (!tiene(etiquetas, o.valor)) etiquetas[o.valor] = o.etiqueta;
  return etiquetas;
}

/**
 * Lo que muestra el panel de FiltroEstados (T4D r1, punto 5: un filtro nunca queda escondido): las opciones de la
 * pestaña y, después, los estados filtrados que la pestaña no tiene (los dejó una tarjeta, una caja del flujo o la
 * sesión restaurada), marcados, con su etiqueta legible si se conoce (`etiquetas`) o el valor crudo si no, para poder
 * desmarcarlos. alternarEstado sobre esta lista conserva los demás.
 * @param {ReadonlyArray<OpcionEstado>} opciones
 * @param {ReadonlyArray<string>} seleccion
 * @param {Record<string, string>} [etiquetas]
 * @returns {OpcionEstado[]}
 */
export function opcionesConMarcados(opciones, seleccion, etiquetas = {}) {
  const propias = [...(opciones ?? [])];
  const conocidas = new Set(propias.map((o) => o.valor));
  const extras = [];
  for (const valor of seleccion ?? []) {
    if (conocidas.has(valor)) continue;
    conocidas.add(valor);
    extras.push({ valor, etiqueta: tiene(etiquetas, valor) ? etiquetas[valor] : valor });
  }
  return [...propias, ...extras];
}

/**
 * El `left` (en px, desde el borde izquierdo del botón) del panel de FiltroEstados o MenuAjustes para que no se salga
 * de la ventana (T4D r1, 6k): alineado al borde izquierdo del botón ('izquierda') o al derecho ('derecha'), y corrido lo
 * necesario para quedar a `margen` px de los bordes; si el panel es más ancho que la ventana, desde el margen izquierdo.
 * @param {{boton: {left: number, right: number}, ancho: number, ventana: number, alinear?: 'izquierda' | 'derecha',
 *   margen?: number}} entrada
 * @returns {number}
 */
export function posicionPanel({ boton, ancho, ventana, alinear = 'izquierda', margen = 8 }) {
  const deseado = alinear === 'derecha' ? boton.right - ancho : boton.left;
  const absoluto = Math.max(margen, Math.min(deseado, ventana - margen - ancho));
  return Math.round(absoluto - boton.left);
}

/**
 * Si un Esc sale de la pantalla completa (usePantallaCompleta, T4D r1, punto 4): solo si nadie más lo atendió, ni un
 * menú, el filtro o la búsqueda (defaultPrevented), ni hay un Modal, ModalMotivo o confirmación encima (`dialogoEncima`:
 * el foco en un [role=dialog] o [aria-modal=true] fuera de la tarjeta, o uno de esos abierto).
 * @param {{tecla: string, defaultPrevented?: boolean, dialogoEncima?: boolean}} entrada
 * @returns {boolean}
 */
export function saleConEsc({ tecla, defaultPrevented = false, dialogoEncima = false }) {
  return tecla === 'Escape' && !defaultPrevented && !dialogoEncima;
}
