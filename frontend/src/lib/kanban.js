/**
 * La lógica pura del tablero Kanban común (Bloque 4, T3A: KANBAN-base punto 1, R4, R11, C1, C13 y RP67). JS plano,
 * sin React ni DOM, para probarlo con node (frontend/tests/test_kanban.mjs). La usan useTableroKanban y TableroKanban
 * (components/ui/Kanban.tsx, T4B) y las reglas de cada módulo (estados-compras.js de T2; kanban-ventas.js, entregas.js
 * y crm-etapas.js de T3C).
 *
 *  - Una columna es {clave, titulo, tono, estados?: string[], cerrada?: boolean, ayuda?: string}; definirColumnas la
 *    valida y la congela.
 *  - Una regla de soltar es (item, origen, destino) => resultado, y el resultado es uno de cuatro:
 *      {tipo: 'ninguno'} | {tipo: 'bloqueado', motivo, enlace?: {texto, href}} | {tipo: 'cambio', estado, cuerpo?}
 *      | {tipo: 'accion', accion, datos?}
 *    resolverSoltar lo valida (otra forma es un error de programación) y mapaDestinos lo usa para pintar las columnas
 *    y el menú «Mover a…».
 *  - No lee ni escribe el almacenamiento (R4): la vista y las columnas plegadas van por lib/preferencias.js
 *    (vista:<pantalla> y kanban:<pantalla>). No hay textoContador ni '…' (C13): mientras carga, Contador pinta su
 *    barra gris; ya cargado, textoTotalColumna da '25 de 80'.
 */

import { congelar, tiene } from './estados-pedido.js';
import { instante } from './fechas-colombia.js';
import { formatoEntero } from './kpis.js';

/**
 * @typedef {{clave: string, titulo: string, tono?: string, estados?: ReadonlyArray<string>, cerrada?: boolean,
 *   ayuda?: string}} ColumnaKanban
 * @typedef {{texto: string, href: string}} EnlaceBloqueo
 * @typedef {{tipo: 'ninguno'} | {tipo: 'bloqueado', motivo: string, enlace?: EnlaceBloqueo}
 *   | {tipo: 'cambio', estado: string, cuerpo?: any} | {tipo: 'accion', accion: string, datos?: any}} ResultadoSoltar
 * @typedef {(item: any, origen: string, destino: string) => ResultadoSoltar} ReglaSoltar
 * @typedef {{items: any[], total: number | null, cargando: boolean, error: unknown}} DatosColumna
 * @typedef {Record<string, DatosColumna>} Tablero
 * @typedef {{permitido: boolean, motivo: string | null, enlace?: EnlaceBloqueo, resultado: ResultadoSoltar}} Destino
 */

/** La clave del grupo de lo que no cae en ninguna columna (las pruebas de cada módulo exigen que quede vacío). */
export const SIN_COLUMNA = '__sin_columna';
/** El motivo de un tablero sin regla, si la pantalla no pasa su soloLectura (RP67). */
export const TEXTO_SOLO_VER = 'Este tablero es solo para ver.';

const idPorDefecto = (item) => item?.id;

// ─── columnas ───────────────────────────────────────────────────────────────────

/**
 * Valida y congela las columnas de un tablero (una copia: no congela las de quien llama). Cada una necesita una clave
 * (texto, única y distinta de '__sin_columna') y un título; `cerrada` queda true o false. Lanza Error si algo falta o
 * se repite (es un error de programación).
 * @param {ReadonlyArray<ColumnaKanban>} lista
 * @returns {ReadonlyArray<Readonly<ColumnaKanban & {cerrada: boolean}>>}
 */
export function definirColumnas(lista) {
  if (!Array.isArray(lista) || !lista.length) throw new Error('Un tablero necesita al menos una columna.');
  const vistas = new Set();
  const copia = lista.map((c, i) => {
    if (!c || typeof c.clave !== 'string' || !c.clave.trim()) throw new Error(`La columna ${i + 1} del tablero no tiene clave.`);
    if (c.clave === SIN_COLUMNA) throw new Error(`La clave ${SIN_COLUMNA} está reservada.`);
    if (vistas.has(c.clave)) throw new Error(`Clave de columna repetida en el tablero: ${c.clave}`);
    if (typeof c.titulo !== 'string' || !c.titulo.trim()) throw new Error(`La columna ${c.clave} del tablero no tiene título.`);
    vistas.add(c.clave);
    const columna = { ...c, cerrada: c.cerrada === true };
    if (Array.isArray(c.estados)) columna.estados = [...c.estados];
    return columna;
  });
  return congelar(copia);
}

/**
 * columnaDe por defecto: la clave de la primera columna cuyos `estados` traen item.estado, o null.
 * @param {ReadonlyArray<ColumnaKanban>} columnas
 * @returns {(item: any) => string | null}
 */
export function columnaPorEstados(columnas) {
  return (item) => columnas.find((c) => Array.isArray(c.estados) && c.estados.includes(item?.estado))?.clave ?? null;
}

/**
 * Reparte los ítems por columna: {[clave]: item[], '__sin_columna': item[]}, en el orden de las columnas. Lo que
 * columnaDe no ubica (null o una clave que no existe) va a '__sin_columna'. Sin columnaDe, columnaPorEstados.
 * @param {ReadonlyArray<any> | null | undefined} items
 * @param {ReadonlyArray<ColumnaKanban>} columnas
 * @param {(item: any) => string | null | undefined} [columnaDe]
 * @returns {Record<string, any[]>}
 */
export function agruparEnColumnas(items, columnas, columnaDe = columnaPorEstados(columnas)) {
  /** @type {Record<string, any[]>} */
  const grupos = {};
  for (const c of columnas) grupos[c.clave] = [];
  grupos[SIN_COLUMNA] = [];
  for (const item of items ?? []) {
    const clave = columnaDe(item);
    const destino = typeof clave === 'string' && clave !== SIN_COLUMNA && tiene(grupos, clave) ? clave : SIN_COLUMNA;
    grupos[destino].push(item);
  }
  return grupos;
}

/** Milisegundos de una fecha (número, Date, instante del API sin zona = UTC, o 'AAAA-MM-DD'), o NaN. */
function milisegundos(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : Number.NaN;
  if (v instanceof Date) return v.getTime();
  if (typeof v !== 'string' || !v.trim()) return Number.NaN;
  const fecha = instante(v);
  return fecha ? fecha.getTime() : Date.parse(v.trim());
}

const fechaPorDefecto = (item) => item?.updated_at ?? item?.created_at ?? null;

/**
 * Una copia de las tarjetas de una columna, ordenada y estable:
 *  - columna abierta: primero las atrasadas y, dentro de cada grupo, la que lleva más tiempo sin movimiento;
 *  - columna cerrada: la más reciente primero.
 * Lo que no tiene fecha va al final; los empates conservan el orden. `fechaMovimiento` por defecto: updated_at y si no
 * created_at (sin zona = UTC).
 * @template T
 * @param {ReadonlyArray<T>} items
 * @param {{esAtrasado?: (item: T) => boolean, fechaMovimiento?: (item: T) => unknown, cerrada?: boolean}} [opciones]
 * @returns {T[]}
 */
export function ordenarTarjetas(items, { esAtrasado = () => false, fechaMovimiento = fechaPorDefecto, cerrada = false } = {}) {
  return (items ?? [])
    .map((item, i) => ({ item, i, atrasado: Boolean(esAtrasado(item)), t: milisegundos(fechaMovimiento(item)) }))
    .sort((a, b) => {
      if (!cerrada && a.atrasado !== b.atrasado) return a.atrasado ? -1 : 1;
      const ca = Number.isFinite(a.t);
      const cb = Number.isFinite(b.t);
      if (ca !== cb) return ca ? -1 : 1;
      if (ca && a.t !== b.t) return cerrada ? b.t - a.t : a.t - b.t;
      return a.i - b.i;
    })
    .map((x) => x.item);
}

// ─── datos del tablero ──────────────────────────────────────────────────────────

/**
 * El tablero antes de la primera carga: cada columna {items: [], total: null, cargando: true, error: null}.
 * @param {ReadonlyArray<ColumnaKanban>} columnas
 * @returns {Tablero}
 */
export function estadoTableroInicial(columnas) {
  /** @type {Tablero} */
  const tablero = {};
  for (const c of columnas) tablero[c.clave] = { items: [], total: null, cargando: true, error: null };
  return tablero;
}

function exigirColumna(tablero, clave) {
  if (!tablero || !tiene(tablero, clave)) throw new Error(`Columna del tablero desconocida: ${String(clave)}`);
  return tablero[clave];
}

/**
 * Un tablero nuevo con la página que llegó para la columna `clave` (cargando: false, error: null). Con agregar = true
 * («Ver más») suma los ítems sin repetir id (idDe, por defecto item.id); si no, los reemplaza. `total` es el del
 * servidor; sin él, el largo de la lista. Una columna plegada llega con items [] y su total (limit=0). Una clave que no
 * está en el tablero lanza Error.
 * @param {Tablero} tablero
 * @param {string} clave
 * @param {{items?: any[], total?: number | null}} [pagina]
 * @param {{agregar?: boolean, idDe?: (item: any) => unknown}} [opciones]
 * @returns {Tablero}
 */
export function aplicarPagina(tablero, clave, { items = [], total } = {}, { agregar = false, idDe = idPorDefecto } = {}) {
  const previa = exigirColumna(tablero, clave);
  let lista;
  if (agregar) {
    const vistos = new Set(previa.items.map(idDe));
    lista = [...previa.items];
    for (const item of items ?? []) {
      const id = idDe(item);
      if (!vistos.has(id)) { vistos.add(id); lista.push(item); }
    }
  } else {
    lista = [...(items ?? [])];
  }
  const totalNuevo = typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : lista.length;
  return { ...tablero, [clave]: { ...previa, items: lista, total: totalNuevo, cargando: false, error: null } };
}

/**
 * Un tablero nuevo con `cambios` en la columna `clave` (por ejemplo {cargando: true} al recargar o {cargando: false,
 * error} si falló). Una clave que no está lanza Error.
 * @param {Tablero} tablero
 * @param {string} clave
 * @param {Partial<DatosColumna>} cambios
 * @returns {Tablero}
 */
export function marcarColumna(tablero, clave, cambios) {
  const previa = exigirColumna(tablero, clave);
  return { ...tablero, [clave]: { ...previa, ...cambios } };
}

/**
 * El movimiento optimista: saca la tarjeta `id` del origen (total − 1, nunca menos de 0) y la pone de primera en el
 * destino (total + 1) con `cambios` encima (por ejemplo el estado nuevo). Un total desconocido (null) sigue null.
 * deshacer() devuelve exactamente el tablero anterior (que no se muta). Si la tarjeta ya no está en el origen, o el
 * origen es el destino, devuelve el mismo tablero. Una columna que no existe lanza Error.
 * @param {Tablero} tablero
 * @param {unknown} id
 * @param {string} origen
 * @param {string} destino
 * @param {Record<string, unknown>} [cambios]
 * @param {{idDe?: (item: any) => unknown}} [opciones]
 * @returns {{tablero: Tablero, deshacer: () => Tablero}}
 */
export function moverTarjeta(tablero, id, origen, destino, cambios = {}, { idDe = idPorDefecto } = {}) {
  const desde = exigirColumna(tablero, origen);
  const hacia = exigirColumna(tablero, destino);
  const deshacer = () => tablero;
  const i = desde.items.findIndex((item) => idDe(item) === id);
  if (i < 0 || origen === destino) return { tablero, deshacer };
  const tarjeta = { ...desde.items[i], ...cambios };
  const menos = (t) => (typeof t === 'number' ? Math.max(0, t - 1) : t);
  const mas = (t) => (typeof t === 'number' ? t + 1 : t);
  return {
    tablero: {
      ...tablero,
      [origen]: { ...desde, items: desde.items.filter((_, j) => j !== i), total: menos(desde.total) },
      [destino]: { ...hacia, items: [tarjeta, ...hacia.items.filter((item) => idDe(item) !== id)], total: mas(hacia.total) },
    },
    deshacer,
  };
}

// ─── reglas de soltar ───────────────────────────────────────────────────────────

const textoLleno = (v) => typeof v === 'string' && v.trim() !== '';

/** El resultado tal cual si tiene una de las cuatro formas; si no, lanza Error (un error de programación). */
function validarResultado(r) {
  const malo = () => new Error(`La regla del tablero devolvió una forma desconocida: ${JSON.stringify(r)}`);
  if (!r || typeof r !== 'object') throw malo();
  switch (r.tipo) {
    case 'ninguno':
      return r;
    case 'bloqueado':
      if (!textoLleno(r.motivo)) throw malo();
      if (r.enlace !== undefined && r.enlace !== null && !(textoLleno(r.enlace.texto) && textoLleno(r.enlace.href))) throw malo();
      return r;
    case 'cambio':
      if (!textoLleno(r.estado)) throw malo();
      return r;
    case 'accion':
      if (!textoLleno(r.accion)) throw malo();
      return r;
    default:
      throw malo();
  }
}

/**
 * Qué pasa al soltar `item` de `origen` en `destino`:
 *  - origen === destino -> {tipo: 'ninguno'};
 *  - un tablero de solo lectura (opciones.soloLectura, «Este tablero es para ver: …», R11) o sin regla ->
 *    {tipo: 'bloqueado', motivo: soloLectura || 'Este tablero es solo para ver.'} (RP67);
 *  - si no, lo que diga regla(item, origen, destino), que tiene que ser una de las cuatro formas (otra lanza Error).
 * @param {any} item
 * @param {string} origen
 * @param {string} destino
 * @param {ReglaSoltar | null | undefined} regla
 * @param {{soloLectura?: string | null}} [opciones]
 * @returns {ResultadoSoltar}
 */
export function resolverSoltar(item, origen, destino, regla, { soloLectura = null } = {}) {
  if (origen === destino) return { tipo: 'ninguno' };
  if (textoLleno(soloLectura)) return { tipo: 'bloqueado', motivo: /** @type {string} */ (soloLectura) };
  if (typeof regla !== 'function') return { tipo: 'bloqueado', motivo: TEXTO_SOLO_VER };
  return validarResultado(regla(item, origen, destino));
}

/**
 * {[clave]: {permitido, motivo, enlace?, resultado}} de cada columna para la tarjeta `item` que sale de `origen`:
 * permitido si soltarla ahí da un cambio o una acción; motivo (y su enlace) si queda bloqueada. El origen sale
 * {permitido: false, motivo: null}. Sirve para pintar las columnas mientras se arrastra y para el menú «Mover a…».
 * @param {any} item
 * @param {string} origen
 * @param {ReadonlyArray<ColumnaKanban>} columnas
 * @param {ReglaSoltar | null | undefined} regla
 * @param {{soloLectura?: string | null}} [opciones]
 * @returns {Record<string, Destino>}
 */
export function mapaDestinos(item, origen, columnas, regla, opciones = {}) {
  /** @type {Record<string, Destino>} */
  const mapa = {};
  for (const c of columnas) {
    const resultado = resolverSoltar(item, origen, c.clave, regla, opciones);
    /** @type {Destino} */
    const destino = {
      permitido: resultado.tipo === 'cambio' || resultado.tipo === 'accion',
      motivo: resultado.tipo === 'bloqueado' ? resultado.motivo : null,
      resultado,
    };
    if (resultado.tipo === 'bloqueado' && resultado.enlace) destino.enlace = resultado.enlace;
    mapa[c.clave] = destino;
  }
  return mapa;
}

// ─── arrastre ───────────────────────────────────────────────────────────────────

/**
 * La clave de la columna bajo el punto (x, y), con los bordes incluidos; null si no hay ninguna. `rects` es
 * {[clave]: {left, right, top, bottom}} (getBoundingClientRect de cada columna) o una lista [{clave, left, …}]. Es el
 * getStageAtPoint del CRM con los rectángulos como datos.
 * @param {Record<string, {left: number, right: number, top: number, bottom: number} | null> |
 *   ReadonlyArray<{clave: any, left: number, right: number, top: number, bottom: number}>} rects
 * @param {number} x
 * @param {number} y
 * @returns {any}
 */
export function columnaBajoPunto(rects, x, y) {
  const entradas = Array.isArray(rects) ? rects.map((r) => [r?.clave, r]) : Object.entries(rects ?? {});
  for (const [clave, r] of entradas) {
    if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return clave;
  }
  return null;
}

/**
 * Los píxeles por cuadro del autodesplazamiento cuando el puntero está a menos de `margen` de un borde de la caja:
 * negativo hacia la izquierda, positivo hacia la derecha y 0 en el centro; más rápido cuanto más cerca del borde, sin
 * pasar de `max`. En una caja más angosta que dos márgenes, el margen es la mitad del ancho (su centro queda quieto).
 * Sirve igual en vertical con {left: top, right: bottom}.
 * @param {number} x
 * @param {{left: number, right: number}} caja
 * @param {number} [margen]
 * @param {number} [max]
 * @returns {number}
 */
export function velocidadAutodesplazamiento(x, { left, right }, margen = 64, max = 18) {
  if (!Number.isFinite(x) || !Number.isFinite(left) || !Number.isFinite(right) || right <= left) return 0;
  const m = Math.min(margen, (right - left) / 2);
  if (m <= 0) return 0;
  if (x < left + m) return -max * (1 - Math.max(0, x - left) / m);
  if (x > right - m) return max * (1 - Math.max(0, right - x) / m);
  return 0;
}

/**
 * El contador de una columna ya cargada (mientras carga lo pinta Contador, C13): '25 de 80' si el servidor tiene más
 * de las que se ven, o solo el número ('25'); miles con punto.
 * @param {number} n
 * @param {number | null | undefined} total
 * @returns {string}
 */
export function textoTotalColumna(n, total) {
  const visibles = Number.isFinite(n) ? n : 0;
  if (typeof total === 'number' && Number.isFinite(total) && total > visibles) {
    return `${formatoEntero(visibles)} de ${formatoEntero(total)}`;
  }
  return formatoEntero(visibles);
}

/** Los caracteres mínimos del motivo de cancelar o rechazar desde un tablero (ModalMotivo, T4A). */
export const MINIMO_MOTIVO = 5;

/**
 * true si `texto` tiene `minimo` caracteres o más sin contar los espacios del borde (ModalMotivo: el botón de peligro
 * solo se activa así). Cuenta caracteres, no unidades UTF-16, como len() del servidor. Lo que no es texto da false.
 * @param {unknown} texto
 * @param {number} [minimo]
 * @returns {boolean}
 */
export function motivoValido(texto, minimo = MINIMO_MOTIVO) {
  return typeof texto === 'string' && [...texto.trim()].length >= minimo;
}

// ─── tablero común (T4B: useTableroKanban y TableroKanban de components/ui/Kanban.tsx) ──────────────

/**
 * @typedef {{offset: number, limit: number, orden: string}} ConsultaColumna
 * @typedef {DatosColumna & {hayMas: boolean}} DatosColumnaCliente
 * @typedef {'cargando' | 'actualizando' | 'error' | 'listo'} EstadoColumna
 * @typedef {{clave: string, titulo: string, permitido: boolean, motivo: string | null}} OpcionMover
 * @typedef {'origen' | 'permitido' | 'bloqueado' | 'neutro'} EstadoDestino
 */

/** Los píxeles que tiene que moverse el puntero para que sea un arrastre (H1, el umbral del CRM); menos es un clic. */
export const UMBRAL_ARRASTRE = 6;

/**
 * true si el puntero ya se movió `umbral` píxeles o más desde donde se presionó (en cualquier dirección): desde ahí es
 * un arrastre; antes, soltar es un clic (onAbrir).
 * @param {number} dx
 * @param {number} dy
 * @param {number} [umbral]
 * @returns {boolean}
 */
export function superaUmbral(dx, dy, umbral = UMBRAL_ARRASTRE) {
  const d = Math.hypot(dx, dy);
  return Number.isFinite(d) && d >= umbral;
}

/**
 * El orden de una columna en modo servidor cuando la pantalla no pasa ordenDe (RP10): 'reciente' (lo más reciente
 * primero) en una cerrada y 'sin_movimiento' (lo que más tiempo lleva quieto) en una abierta.
 * @param {ColumnaKanban} columna
 * @returns {'reciente' | 'sin_movimiento'}
 */
export function ordenPorDefecto(columna) {
  return columna?.cerrada === true ? 'reciente' : 'sin_movimiento';
}

/**
 * La consulta de una columna en modo servidor (R11, RP10): {offset, limit, orden}. limit es porColumna (el tamaño de
 * página de la tabla, 25 o 50), o 0 si la columna está plegada (solo trae el total). orden es ordenDe(columna) (T7:
 * 'atencion' y '-creado'); si la pantalla no da uno, ordenPorDefecto.
 * @param {ColumnaKanban} columna
 * @param {{plegada?: boolean, porColumna?: number, offset?: number, ordenDe?: (columna: ColumnaKanban) => string | null | undefined}} [opciones]
 * @returns {ConsultaColumna}
 */
export function consultaColumna(columna, { plegada = false, porColumna = 25, offset = 0, ordenDe = ordenPorDefecto } = {}) {
  const propio = typeof ordenDe === 'function' ? ordenDe(columna) : null;
  return {
    offset: plegada ? 0 : offset,
    limit: plegada ? 0 : porColumna,
    orden: textoLleno(propio) ? /** @type {string} */ (propio) : ordenPorDefecto(columna),
  };
}

/**
 * La firma de la consulta vigente de una columna: cambia con las dependencias de la pantalla (búsqueda y filtros), el
 * tamaño, el orden y cada recarga (version); el offset de «Ver más» no cuenta. Si la firma de lo que llegó no es la
 * vigente, la columna está cargando. `dependencias` son valores simples (texto, número, booleano o arreglos de ellos).
 * @param {ConsultaColumna} consulta
 * @param {{dependencias?: unknown, version?: number}} [opciones]
 * @returns {string}
 */
export function firmaConsulta(consulta, { dependencias = null, version = 0 } = {}) {
  return JSON.stringify([dependencias ?? null, consulta?.limit ?? null, consulta?.orden ?? null, version]);
}

/**
 * Las claves de las columnas que salen plegadas por defecto: las cerradas (kanban_columnas_cerradas = «Plegadas: se ve
 * el nombre y cuántas hay, y con un clic se abren»).
 * @param {ReadonlyArray<ColumnaKanban>} columnas
 * @returns {string[]}
 */
export function plegadasPorDefecto(columnas) {
  return (columnas ?? []).filter((c) => c?.cerrada === true).map((c) => c.clave);
}

/**
 * true si `valor` sirve como lo guardado en kanban:<pantalla>: una lista de claves (textos). Lo demás se ignora (la
 * validación de usePreferencia).
 * @param {unknown} valor
 * @returns {boolean}
 */
export function plegadasValidas(valor) {
  return Array.isArray(valor) && valor.every((v) => typeof v === 'string');
}

/**
 * Las columnas plegadas de verdad: sin nada guardado (null), las cerradas; con una lista guardada, esa lista en el
 * orden de las columnas y sin las claves que ya no existen.
 * @param {unknown} guardado
 * @param {ReadonlyArray<ColumnaKanban>} columnas
 * @returns {string[]}
 */
export function resolverPlegadas(guardado, columnas) {
  if (!plegadasValidas(guardado)) return plegadasPorDefecto(columnas);
  const lista = /** @type {string[]} */ (guardado);
  return (columnas ?? []).map((c) => c.clave).filter((clave) => lista.includes(clave));
}

/**
 * La lista de plegadas después de plegar o abrir `clave`: sin `plegada`, alterna; con true o false, la deja así. Si no
 * cambia nada devuelve la misma lista (así no se guarda de nuevo).
 * @param {ReadonlyArray<string>} plegadas
 * @param {string} clave
 * @param {boolean} [plegada]
 * @returns {ReadonlyArray<string>}
 */
export function alternarPlegada(plegadas, clave, plegada) {
  const ya = plegadas.includes(clave);
  const quiere = plegada === undefined ? !ya : plegada === true;
  if (quiere === ya) return plegadas;
  return quiere ? [...plegadas, clave] : plegadas.filter((k) => k !== clave);
}

/**
 * El número de turno de cada columna (KANBAN-base a): cada consulta toma el siguiente y su respuesta vale solo si
 * sigue siendo el vigente (una respuesta vieja se descarta). Cada columna lleva su propia cuenta.
 * @returns {{siguiente: (clave: string) => number, vigente: (clave: string, turno: number) => boolean}}
 */
export function crearTurnos() {
  /** @type {Map<string, number>} */
  const actuales = new Map();
  return {
    siguiente(clave) {
      const n = (actuales.get(clave) ?? 0) + 1;
      actuales.set(clave, n);
      return n;
    },
    vigente(clave, turno) {
      return actuales.has(clave) && actuales.get(clave) === turno;
    },
  };
}

/**
 * Lo que devolvió cargar(columna, consulta) de la pantalla, como {items, total, resumen}: acepta {items, total,
 * resumen?}, {filas, total, resumen?} (normalizarRespuesta de lib/tabla.js) o un arreglo. Un total que no es un número
 * no negativo queda null (aplicarPagina usa entonces el largo de la lista).
 * @param {unknown} respuesta
 * @returns {{items: any[], total: number | null, resumen: any}}
 */
export function paginaDeRespuesta(respuesta) {
  if (Array.isArray(respuesta)) return { items: respuesta, total: respuesta.length, resumen: null };
  const r = /** @type {any} */ (respuesta);
  const items = Array.isArray(r?.items) ? r.items : Array.isArray(r?.filas) ? r.filas : [];
  const total = typeof r?.total === 'number' && Number.isFinite(r.total) && r.total >= 0 ? r.total : null;
  return { items, total, resumen: r?.resumen ?? null };
}

/**
 * true si el servidor tiene más tarjetas de esa columna que las que se ven («Ver más» en modo servidor).
 * @param {{items?: any[], total?: number | null} | null | undefined} datos
 * @returns {boolean}
 */
export function quedanEnServidor(datos) {
  return typeof datos?.total === 'number' && Array.isArray(datos.items) && datos.items.length < datos.total;
}

/**
 * El tablero del modo cliente (KANBAN-base a; R11: solo donde el endpoint devuelve todo): agrupa los ítems con
 * columnaDe (por defecto, los `estados` de cada columna), ordena cada columna con ordenarTarjetas (abiertas: lo atrasado
 * y lo más quieto primero; cerradas: lo más reciente) y la corta en cortes[clave] (por defecto porColumna; «Ver más»
 * lo sube). total = totales[clave] si la pantalla lo da (RP61: «los 50 más recientes y el total real»), si no, cuántos
 * hay en esa columna. hayMas: si quedan tarjetas ya cargadas sin mostrar. Lo que no cae en ninguna columna no se pinta.
 * Sin `items` (todavía no llegan) todas las columnas están cargando.
 * @param {ReadonlyArray<any> | null | undefined} items
 * @param {ReadonlyArray<ColumnaKanban>} columnas
 * @param {{columnaDe?: (item: any) => string | null | undefined, esAtrasado?: (item: any) => boolean,
 *   fechaMovimiento?: (item: any) => unknown, porColumna?: number, cortes?: Record<string, number>,
 *   totales?: Record<string, number>}} [opciones]
 * @returns {Record<string, DatosColumnaCliente>}
 */
export function tableroCliente(items, columnas, {
  columnaDe, esAtrasado, fechaMovimiento, porColumna = 25, cortes = {}, totales = {},
} = {}) {
  /** @type {Record<string, DatosColumnaCliente>} */
  const tablero = {};
  if (!Array.isArray(items)) {
    for (const c of columnas) tablero[c.clave] = { items: [], total: null, cargando: true, error: null, hayMas: false };
    return tablero;
  }
  const grupos = agruparEnColumnas(items, columnas, columnaDe ?? columnaPorEstados(columnas));
  for (const c of columnas) {
    const ordenadas = ordenarTarjetas(grupos[c.clave], { esAtrasado, fechaMovimiento, cerrada: c.cerrada === true });
    const corte = cortes?.[c.clave] ?? porColumna;
    const visibles = ordenadas.slice(0, corte);
    const propio = totales?.[c.clave];
    tablero[c.clave] = {
      items: visibles,
      total: typeof propio === 'number' && Number.isFinite(propio) && propio >= 0 ? propio : ordenadas.length,
      cargando: false,
      error: null,
      hayMas: ordenadas.length > visibles.length,
    };
  }
  return tablero;
}

/**
 * El estado de una columna con el vocabulario de estadoKpi (C13): 'cargando' sin datos todavía (Contador pinta su
 * barra gris, nunca 0), 'actualizando' si recarga con un total ya conocido, 'error' si falló y 'listo'.
 * @param {{total?: number | null, cargando?: boolean, error?: unknown} | null | undefined} datos
 * @returns {EstadoColumna}
 */
export function estadoColumna(datos) {
  if (!datos) return 'cargando';
  if (datos.cargando) return typeof datos.total === 'number' ? 'actualizando' : 'cargando';
  if (datos.error) return 'error';
  return 'listo';
}

/**
 * El tablero con la columna `clave`: si no está (un juego de columnas que cambió, p. ej. el filtro por estado), la
 * agrega como en estadoTableroInicial (sin tarjetas, total null y cargando); si ya está, devuelve el mismo tablero.
 * Así aplicarPagina y marcarColumna no lanzan con una columna que llegó después.
 * @param {Tablero} tablero
 * @param {string} clave
 * @returns {Tablero}
 */
export function asegurarColumna(tablero, clave) {
  if (tablero && tiene(tablero, clave)) return tablero;
  return { ...(tablero ?? {}), [clave]: { items: [], total: null, cargando: true, error: null } };
}

/**
 * Un tablero nuevo con `item` (el documento que devolvió el servidor) en el lugar de la tarjeta `id` de la columna
 * `clave`. Si la tarjeta ya no está ahí, o `item` no es un objeto, devuelve el mismo tablero (queda la optimista).
 * @param {Tablero} tablero
 * @param {string} clave
 * @param {unknown} id
 * @param {unknown} item
 * @param {{idDe?: (item: any) => unknown}} [opciones]
 * @returns {Tablero}
 */
export function reemplazarTarjeta(tablero, clave, id, item, { idDe = idPorDefecto } = {}) {
  const columna = exigirColumna(tablero, clave);
  const i = columna.items.findIndex((x) => idDe(x) === id);
  if (i < 0 || !item || typeof item !== 'object') return tablero;
  return { ...tablero, [clave]: { ...columna, items: columna.items.map((x, j) => (j === i ? item : x)) } };
}

/**
 * Deshace un movimiento optimista que el servidor rechazó (KANBAN-base d): si el tablero sigue siendo el que dejó
 * moverTarjeta (`movido`), exactamente el anterior (deshacer()); si en medio llegó otra carga, la tarjeta vuelve de
 * `destino` a `origen` con sus datos de antes (`original`) y lo demás que llegó se conserva. Si una de las dos columnas
 * ya no está, devuelve el tablero actual.
 * @param {Tablero} actual
 * @param {Tablero} movido
 * @param {() => Tablero} deshacer
 * @param {{id: unknown, origen: string, destino: string, original: Record<string, unknown>, idDe?: (item: any) => unknown}} datos
 * @returns {Tablero}
 */
export function deshacerMovimiento(actual, movido, deshacer, { id, origen, destino, original, idDe = idPorDefecto }) {
  if (actual === movido) return deshacer();
  if (!actual || !tiene(actual, origen) || !tiene(actual, destino)) return actual;
  return moverTarjeta(actual, id, destino, origen, original ?? {}, { idDe }).tablero;
}

/**
 * La regla del tablero sin lo que la pantalla no puede hacer: un 'cambio' sin onCambio o una 'accion' sin onAccion
 * quedan bloqueados con «Este tablero es solo para ver.» (no se ofrecen al arrastrar ni en «Mover a…»). Sin regla
 * devuelve lo mismo (resolverSoltar ya la trata como solo para ver, RP67).
 * @param {ReglaSoltar | null | undefined} regla
 * @param {{cambio?: boolean, accion?: boolean}} [manejadores]
 * @returns {ReglaSoltar | null | undefined}
 */
export function reglaSegunManejadores(regla, { cambio = false, accion = false } = {}) {
  if (typeof regla !== 'function') return regla;
  return (item, origen, destino) => {
    const resultado = regla(item, origen, destino);
    if ((resultado?.tipo === 'cambio' && !cambio) || (resultado?.tipo === 'accion' && !accion)) {
      return { tipo: 'bloqueado', motivo: TEXTO_SOLO_VER };
    }
    return resultado;
  };
}

/**
 * Las opciones de «Mover a…» del menú ⋯ de una tarjeta (KANBAN-base e; para el teclado y el celular), con el mapa de
 * mapaDestinos: todas las columnas menos el origen, en su orden; las permitidas y las bloqueadas con su motivo. Las que
 * no harían nada ('ninguno', sin motivo) no se ofrecen.
 * @param {string} origen
 * @param {ReadonlyArray<ColumnaKanban>} columnas
 * @param {Record<string, Destino> | null | undefined} destinos
 * @returns {OpcionMover[]}
 */
export function opcionesMoverA(origen, columnas, destinos) {
  /** @type {OpcionMover[]} */
  const opciones = [];
  for (const c of columnas ?? []) {
    if (c.clave === origen) continue;
    const d = destinos?.[c.clave];
    if (d?.permitido) opciones.push({ clave: c.clave, titulo: c.titulo, permitido: true, motivo: null });
    else if (d?.motivo) opciones.push({ clave: c.clave, titulo: c.titulo, permitido: false, motivo: d.motivo });
  }
  return opciones;
}

/**
 * Cómo se pinta la columna `clave` mientras se arrastra una tarjeta de `origen` (KANBAN-base c): 'origen';
 * 'permitido' (borde punteado del tono y «Soltar aquí»); 'bloqueado' (apagada, con candado y el motivo); 'neutro'
 * (soltarla ahí no hace nada). Sin arrastre (destinos null), null.
 * @param {Record<string, Destino> | null | undefined} destinos
 * @param {string} clave
 * @param {string} origen
 * @returns {EstadoDestino | null}
 */
export function estadoDestino(destinos, clave, origen) {
  if (!destinos) return null;
  if (clave === origen) return 'origen';
  const d = destinos[clave];
  if (d?.permitido) return 'permitido';
  if (d?.motivo) return 'bloqueado';
  return 'neutro';
}

/**
 * Lo que anuncia la región aria-live al mover una tarjeta: 'PVEN-… movido a Listo para entrega'.
 * @param {unknown} nombre
 * @param {string} titulo
 * @returns {string}
 */
export function textoMovimiento(nombre, titulo) {
  const n = String(nombre ?? '').trim();
  return n ? `${n} movido a ${titulo}` : `Movido a ${titulo}`;
}

/** El alto mínimo del tablero, en píxeles (KANBAN-base f). */
export const ALTO_MINIMO_TABLERO = 420;

/**
 * El alto del tablero: el alto libre de la ventana debajo de su borde de arriba, menos un margen, y nunca menos de
 * `minimo` (420 px).
 * @param {number} altoVentana
 * @param {number} arriba
 * @param {{minimo?: number, margen?: number}} [opciones]
 * @returns {number}
 */
export function altoTablero(altoVentana, arriba, { minimo = ALTO_MINIMO_TABLERO, margen = 16 } = {}) {
  const libre = Math.floor(altoVentana - arriba - margen);
  return Number.isFinite(libre) ? Math.max(minimo, libre) : minimo;
}
