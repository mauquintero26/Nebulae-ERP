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
 *   valor?: unknown} | {tipo: 'cambiar', cambios: Partial<Record<keyof EstadoTabla, unknown>>} | {tipo: 'limpiarFiltros'}}
 *   AccionTabla
 * @typedef {{filas: any[], total: number, conteos: Record<string, number> | null, resumen: Record<string, any> | null,
 *   crudo: unknown}} RespuestaListado
 */

/** 25 o 50 filas por página (y por columna del tablero). Inmutable. */
export const TAMANOS_PAGINA = congelar([25, 50]);
/** La versión de lo guardado en tabla:<id>: otra versión vuelve a lo por defecto. */
export const VERSION_PREFS = 1;
export const ANCHO_MIN = 64;
export const ANCHO_MAX = 640;
export const ANCHO_POR_DEFECTO = 160;
/** Los modos de una pantalla con tabla (el valor de ConmutadorVista). Inmutable. */
export const MODOS_TABLA = congelar(['lista', 'kanban']);

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
 *  - {tipo: 'limpiarFiltros'}: sin semáforo, paso, estados ni búsqueda (conserva pestaña, modo, orden y tamaño).
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
  else throw new Error(`Acción de la tabla desconocida: ${String(tipo)}`);

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
