/**
 * Las etapas del CRM como columnas del tablero común (Bloque 4, T3C: KANBAN-crm punto 4; R11, RP73). JS plano, sin
 * React ni DOM, para probarlo con node (frontend/tests/test_crm_etapas.mjs). Lo usa crm/page.tsx (T21) con el tablero
 * en modo cliente (los leads del CRM, hasta 500).
 *
 *  - COLOR_HEX y BG_HEX (antes en crm/page.tsx) salen de HEX_CLASE_TAILWIND de lib/analisis.js (T3A, RP73), que trae
 *    también el rojo de «Perdido» (bg-red-500 y bg-red-50).
 *  - columnasDesdeEtapas: las etapas de GET /crm/pipeline-stages, en su orden; las cerradas salen plegadas.
 *  - columnaDeLead: ningún lead queda sin columna (hoy los que no tienen etapa no se ven).
 *  - esLeadAtrasado: 7 días fijos (RP73: el servidor no manda alert_days).
 *  - reglaSoltarLead: libre entre etapas, también si el lead viene de una solicitud (crm_lead_con_solicitud = «Sí,
 *    libre como hoy; cuando la solicitud cambie, el sistema lo vuelve a mover»). La variante que bloquea no existe.
 *  - B4 T21 (al final): las dos listas de la pantalla (activos y perdidos) con el lead que devuelve el servidor, el
 *    filtro de la barra en el tablero, la suma de cada etapa, el total real de Perdido, los chips de la tarjeta y el
 *    lead de un movimiento del Análisis.
 */

import { congelar, tiene } from './estados-pedido.js';
import { HEX_CLASE_TAILWIND, hexDeClaseTailwind } from './analisis.js';
import { CLAVES_TONOS_KANBAN, definirColumnas } from './kanban.js';
import { formatoPesos } from './pesos.js';
import { filtrarFilas } from './tabla.js';
import { acentoDesdeClase, formatoEntero } from './kpis.js';
import { hace } from './fechas-colombia.js';

/**
 * @typedef {import('./kanban.js').ResultadoSoltar} ResultadoSoltar
 * @typedef {{id: number | string, name?: string, color?: string, bg_color?: string, position?: number,
 *   maps_to_status?: string | null, is_closed?: boolean}} EtapaCrm
 * @typedef {{clave: string, titulo: string, tono: string, colorHex: string, bgHex: string | null, cerrada: boolean}} ColumnaCrm
 */

/** Los días sin actividad desde los que un lead está atrasado (RP73: fijo; el servidor no manda alert_days). */
export const DIAS_ALERTA_LEAD = 7;

/** Los status de las etapas cerradas: Ganado (INVOICED) y Perdido (CANCELLED). */
const STATUS_CERRADOS = congelar(['CANCELLED', 'INVOICED']);

const filtrarClases = (sufijo) => congelar(Object.fromEntries(
  Object.entries(HEX_CLASE_TAILWIND).filter(([clase]) => clase.endsWith(sufijo)),
));

/**
 * El hex del color de cada etapa (las clases -500 de HEX_CLASE_TAILWIND). Inmutable.
 * @type {Readonly<Record<string, string>>}
 */
export const COLOR_HEX = filtrarClases('-500');

/**
 * El hex del fondo de cada etapa (las clases -50 de HEX_CLASE_TAILWIND). Inmutable.
 * @type {Readonly<Record<string, string>>}
 */
export const BG_HEX = filtrarClases('-50');

/** Las etapas de la respuesta ({status, data}) o la lista tal cual. */
function etapasDe(stages) {
  const lista = Array.isArray(stages) ? stages : Array.isArray(stages?.data) ? stages.data : [];
  return lista.filter((s) => s && typeof s === 'object' && s.id !== null && s.id !== undefined && String(s.id) !== '');
}

/** El hex de la clase de color de una etapa ('bg-blue-500'); un '#hex' va tal cual; una desconocida, gris. */
function colorDe(clase) {
  const c = typeof clase === 'string' ? clase.trim() : '';
  return c.startsWith('#') ? c : hexDeClaseTailwind(c);
}


/**
 * Las columnas del tablero del CRM a partir de las etapas (GET /crm/pipeline-stages, o su respuesta {status, data}), en
 * su orden, con la forma de kanban.js: {clave: String(id), titulo: name (o 'Etapa {id}'), tono (acentoDesdeClase del color con las claves de TONOS, F26 y r2 C8),
 * colorHex, bgHex (null si el fondo no es una clase conocida), cerrada}. cerrada = maps_to_status CANCELLED o INVOICED,
 * o is_closed === true (RP73; hoy el modelo no lo trae). Sin etapas devuelve [] (la pantalla avisa). Inmutable.
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null | undefined} stages
 * @returns {ReadonlyArray<Readonly<ColumnaCrm>>}
 */
export function columnasDesdeEtapas(stages) {
  const lista = etapasDe(stages);
  if (!lista.length) return congelar([]);
  return /** @type {any} */ (definirColumnas(lista.map((s) => {
    const fondo = typeof s.bg_color === 'string' ? s.bg_color.trim() : '';
    return {
      clave: String(s.id),
      titulo: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : `Etapa ${s.id}`,
      tono: acentoDesdeClase(s.color, 'slate', CLAVES_TONOS_KANBAN),
      colorHex: colorDe(s.color),
      bgHex: tiene(BG_HEX, fondo) ? BG_HEX[fondo] : null,
      cerrada: STATUS_CERRADOS.includes(/** @type {string} */ (s.maps_to_status)) || s.is_closed === true,
    };
  })));
}

/**
 * La columna (String(id) de la etapa) de un lead: su pipeline_stage_id si esa etapa existe; si no, la etapa cuyo
 * maps_to_status es lead.status; si tampoco, la primera. Así ningún lead queda invisible. Sin etapas: null.
 * @param {any} lead
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null | undefined} stages
 * @returns {string | null}
 */
export function columnaDeLead(lead, stages) {
  const lista = etapasDe(stages);
  if (!lista.length) return null;
  const idEtapa = lead?.pipeline_stage_id;
  const propia = idEtapa === null || idEtapa === undefined ? null : lista.find((s) => String(s.id) === String(idEtapa));
  const porStatus = propia ?? lista.find((s) => s.maps_to_status && s.maps_to_status === lead?.status);
  return String((porStatus ?? lista[0]).id);
}

/**
 * El lead lleva DIAS_ALERTA_LEAD (7) días o más sin actividad (lead.days de GET /crm/leads). Fijo (RP73): el servidor
 * no manda alert_days, y hoy la pantalla usa 7 cuando no viene.
 * @param {any} lead
 * @returns {boolean}
 */
export function esLeadAtrasado(lead) {
  const dias = Number(lead?.days);
  return Number.isFinite(dias) && dias >= DIAS_ALERTA_LEAD;
}

/**
 * Qué pasa al soltar un lead de la etapa `origen` en `destino` (claves de columnasDesdeEtapas): libre entre etapas,
 * también con solicitud (sc_id). Da {tipo: 'cambio', estado: <la clave de la etapa>, cuerpo: {pipeline_stage_id}} para
 * PATCH /crm/leads/{id}/stage; el servidor copia el status de la etapa, como hoy. La misma etapa: ninguno.
 * @param {any} lead
 * @param {string} origen
 * @param {string} destino
 * @returns {ResultadoSoltar}
 */
export function reglaSoltarLead(lead, origen, destino) {
  if (origen === destino) return { tipo: 'ninguno' };
  const id = Number(destino);
  return { tipo: 'cambio', estado: String(destino), cuerpo: { pipeline_stage_id: Number.isInteger(id) ? id : destino } };
}

// ─── B4 T21: lo que arma crm/page.tsx con las etapas y los leads ───────────────────────────────────────────────────
// Los leads tienen la forma de GET /crm/leads (crm.py _lead_to_dict): id, client, value, status, pipeline_stage_id,
// days, description, lead_product_name, advisor_name, updated_at y sc_id. La pantalla guarda dos listas: los activos
// (GET /crm/leads, perdidos=excluir) y los perdidos ({items, total} de GET /crm/leads?perdidos=solo&limit=50&orden=dias:
// los 50 más recientes y el total real, RP61). Nada de esto muta lo que recibe.

/**
 * @typedef {{items: ReadonlyArray<any>, total: number | null}} PerdidosCrm
 */

const mismoId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

/**
 * El lead está perdido: status CANCELLED, la misma regla de GET /crm/leads?perdidos=solo (crm.py get_leads).
 * @param {any} lead
 * @returns {boolean}
 */
export function esLeadPerdido(lead) {
  return lead?.status === 'CANCELLED';
}

/**
 * La clave (String(id)) de la columna Perdido: la primera etapa con maps_to_status CANCELLED; null si no hay.
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null | undefined} stages
 * @returns {string | null}
 */
export function claveEtapaPerdido(stages) {
  const etapa = etapasDe(stages).find((s) => s.maps_to_status === 'CANCELLED');
  return etapa ? String(etapa.id) : null;
}

/**
 * Los leads del tablero: los activos y, detrás, los perdidos cuyo id no está ya entre los activos (el activo gana).
 * T21 r1 (m18): con `stages` y sin una etapa Perdido (CANCELLED), los perdidos no entran: no hay columna para ellos y
 * columnaDeLead los pondría en una activa (la primera), sumando su valor.
 * @param {ReadonlyArray<any> | null | undefined} activos
 * @param {ReadonlyArray<any> | null | undefined} perdidos  los items de PerdidosCrm
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null} [stages]
 * @returns {any[]}
 */
export function leadsDelTablero(activos, perdidos, stages) {
  const lista = Array.isArray(activos) ? [...activos] : [];
  const conPerdidos = stages === undefined || claveEtapaPerdido(stages) !== null;
  for (const lead of conPerdidos && Array.isArray(perdidos) ? perdidos : []) {
    if (!lista.some((l) => mismoId(l?.id, lead?.id))) lista.push(lead);
  }
  return lista;
}

/**
 * Los activos después de que el servidor devolvió `lead` (crear, editar o mover): un lead perdido sale; uno activo
 * reemplaza al de su id en su lugar o, si no estaba, va primero.
 * @param {ReadonlyArray<any> | null | undefined} activos
 * @param {any} lead
 * @returns {any[]}
 */
export function conLeadActivo(activos, lead) {
  const lista = Array.isArray(activos) ? activos : [];
  if (esLeadPerdido(lead)) return lista.filter((l) => !mismoId(l?.id, lead?.id));
  const i = lista.findIndex((l) => mismoId(l?.id, lead?.id));
  return i < 0 ? [lead, ...lista] : lista.map((l, j) => (j === i ? lead : l));
}

/**
 * Los perdidos después de que el servidor devolvió `lead`: si está perdido, reemplaza al de su id o va primero (y el
 * total sube 1); si no lo está y estaba, sale (y el total baja 1, nunca de 0). Sin cambios devuelve el MISMO objeto;
 * sin perdidos cargados (null), null.
 * @param {PerdidosCrm | null | undefined} perdidos
 * @param {any} lead
 * @returns {PerdidosCrm | null}
 */
export function conLeadPerdido(perdidos, lead) {
  if (!perdidos) return null;
  const items = Array.isArray(perdidos.items) ? perdidos.items : [];
  const i = items.findIndex((l) => mismoId(l?.id, lead?.id));
  const total = typeof perdidos.total === 'number' && Number.isFinite(perdidos.total) ? perdidos.total : null;
  if (esLeadPerdido(lead)) {
    if (i >= 0) return { items: items.map((l, j) => (j === i ? lead : l)), total };
    return { items: [lead, ...items], total: total === null ? null : total + 1 };
  }
  if (i < 0) return perdidos;
  return { items: items.filter((_, j) => j !== i), total: total === null ? null : Math.max(0, total - 1) };
}

/**
 * Los activos sin el lead `id` (se borró). Sin ese id devuelve la MISMA lista.
 * @param {ReadonlyArray<any> | null | undefined} activos
 * @param {unknown} id
 * @returns {ReadonlyArray<any>}
 */
export function sinLead(activos, id) {
  const lista = Array.isArray(activos) ? activos : [];
  return lista.some((l) => mismoId(l?.id, id)) ? lista.filter((l) => !mismoId(l?.id, id)) : lista;
}

/**
 * Los perdidos sin el lead `id` (se borró): el total baja 1 si estaba (nunca de 0). Sin ese id, el MISMO objeto.
 * @param {PerdidosCrm | null | undefined} perdidos
 * @param {unknown} id
 * @returns {PerdidosCrm | null}
 */
export function sinLeadPerdido(perdidos, id) {
  if (!perdidos) return null;
  const items = Array.isArray(perdidos.items) ? perdidos.items : [];
  if (!items.some((l) => mismoId(l?.id, id))) return perdidos;
  const total = typeof perdidos.total === 'number' && Number.isFinite(perdidos.total) ? Math.max(0, perdidos.total - 1) : null;
  return { items: items.filter((l) => !mismoId(l?.id, id)), total };
}

/** El texto de la búsqueda, recortado y en minúsculas ('' si no hay). */
const textoDe = (q) => (typeof q === 'string' ? q.trim().toLowerCase() : '');
/** La etapa del select ('' si es «Todas las etapas»: 'all', '' o nada). */
const etapaDe = (etapa) => (etapa === null || etapa === undefined || etapa === 'all' ? '' : String(etapa).trim());

/**
 * Hay una búsqueda o una etapa elegida en la barra.
 * @param {{q?: string | null, etapa?: string | number | null}} [filtro]
 * @returns {boolean}
 */
export function hayFiltroDeLeads({ q, etapa } = {}) {
  return textoDe(q) !== '' || etapaDe(etapa) !== '';
}

/** Dónde busca la barra en un lead (los mismos campos que q de get_leads, con el asesor: 6b83780). */
const CAMPOS_BUSQUEDA_LEAD = congelar(['client', 'description', 'lead_product_name', 'advisor_name']);

/**
 * Los leads del tablero con la búsqueda y la etapa de la barra. T21 r1: la búsqueda es filtrarFilas de lib/tabla.js
 * (sin tildes ni mayúsculas, palabra por palabra; m10) en el cliente, la descripción, el producto y el asesor; la etapa
 * usa la MISMA regla que ubica cada lead en su columna, columnaDelTablero (m11 y m18): el lead sin etapa que está en la
 * columna de su status no desaparece al elegirla, y un perdido está en Perdido. Sin filtro devuelve la MISMA lista
 * (estable para useMemo).
 * @param {ReadonlyArray<any> | null | undefined} leads
 * @param {{q?: string | null, etapa?: string | number | null}} [filtro]
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null} [stages]
 * @returns {ReadonlyArray<any>}
 */
export function filtrarLeads(leads, { q, etapa } = {}, stages = null) {
  const lista = Array.isArray(leads) ? leads : [];
  const texto = textoDe(q);
  const conEtapa = etapaDe(etapa);
  if (!texto && !conEtapa) return lista;
  const porTexto = texto ? filtrarFilas(lista, q, CAMPOS_BUSQUEDA_LEAD) : lista;
  return conEtapa ? porTexto.filter((l) => columnaDelTablero(l, stages) === conEtapa) : porTexto;
}

/**
 * La suma de value de los leads en cada columna (columnaDelTablero: un lead sin etapa suma en la de su status y un
 * perdido en Perdido), para la suma de cada etapa del tablero. Toda etapa sale, con 0 si no tiene leads. T21 r1 (I1):
 * sin leads (null: todavía cargan) devuelve null, para que ninguna columna diga «$0» mientras carga.
 * @param {ReadonlyArray<any> | null | undefined} leads
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null | undefined} stages
 * @returns {Record<string, number> | null}
 */
export function sumaPorEtapa(leads, stages) {
  if (!Array.isArray(leads)) return null;
  const lista = etapasDe(stages);
  /** @type {Record<string, number>} */
  const sumas = {};
  for (const s of lista) sumas[String(s.id)] = 0;
  if (!lista.length) return sumas;
  for (const lead of leads) {
    const clave = columnaDelTablero(lead, lista);
    const valor = Number(lead?.value);
    if (clave !== null && Number.isFinite(valor)) sumas[clave] += valor;
  }
  return sumas;
}

/**
 * El resumen de una columna: formatoPesos de su suma (RP105). En Perdido, si se cargaron menos que su total (los 50
 * más recientes de N), la suma dice de cuántos es: «$X en los 50 más recientes» («en el más reciente» con 1). T21 r1
 * (I1): sin sumas (los leads todavía cargan) devuelve null: la columna no pinta resumen, nunca «$0».
 * @param {string} clave
 * @param {Record<string, number> | null | undefined} sumas  de sumaPorEtapa
 * @param {{clavePerdido?: string | null, perdidos?: PerdidosCrm | null}} [opciones]
 * @returns {string | null}
 */
export function textoResumenEtapa(clave, sumas, { clavePerdido = null, perdidos = null } = {}) {
  if (!sumas) return null;
  const suma = formatoPesos(Number(sumas[clave]) || 0);
  const cargados = Array.isArray(perdidos?.items) ? perdidos.items.length : 0;
  const total = perdidos?.total;
  if (clave !== clavePerdido || typeof total !== 'number' || !(total > cargados)) return suma;
  return cargados === 1 ? `${suma} en el más reciente` : `${suma} en los ${cargados} más recientes`;
}

/**
 * Los totales propios del tablero en modo cliente (RP61): {[clave de Perdido]: total del servidor}. Con una búsqueda o
 * una etapa en la barra, ese total (sin filtro) no vale y la columna cuenta lo que se ve: undefined. También undefined
 * sin columna Perdido o sin un total numérico.
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null | undefined} stages
 * @param {PerdidosCrm | null | undefined} perdidos
 * @param {{q?: string | null, etapa?: string | number | null}} [filtro]
 * @returns {Record<string, number> | undefined}
 */
export function totalesDelTablero(stages, perdidos, filtro = {}) {
  const clave = claveEtapaPerdido(stages);
  const total = perdidos?.total;
  if (!clave || typeof total !== 'number' || !Number.isFinite(total) || hayFiltroDeLeads(filtro)) return undefined;
  return { [clave]: total };
}

/**
 * Los chips de la tarjeta del lead (KANBAN-crm punto 7): «Con solicitud» si viene de una (sc_id) y «Atrasado» si
 * esLeadAtrasado. Con los tonos de CLASE_CHIP del tablero (rose, como el borde de una tarjeta atrasada).
 * @param {any} lead
 * @returns {{texto: string, tono: string}[]}
 */
export function chipsDeLead(lead) {
  const chips = [];
  const sc = lead?.sc_id;
  if (sc !== null && sc !== undefined && String(sc).trim() !== '') chips.push({ texto: 'Con solicitud', tono: 'indigo' });
  // T21 r1 (m2): un lead cerrado (Ganado o Perdido) no está atrasado.
  if (esLeadAtrasadoAbierto(lead)) chips.push({ texto: 'Atrasado', tono: 'rose' });
  return chips;
}

/**
 * El lead de una fila de «Requieren atención» del Análisis (doc_tipo 'LEAD', doc_id el id del lead; crm.py
 * _analisis_crm) entre los cargados, o null (la pantalla avisa que se abra desde el Kanban).
 * @param {{doc_tipo?: string | null, doc_id?: unknown} | null | undefined} fila
 * @param {ReadonlyArray<any> | null | undefined} leads
 * @returns {any | null}
 */
export function leadDeMovimiento(fila, leads) {
  if (fila?.doc_tipo !== 'LEAD' || !Array.isArray(leads)) return null;
  return leads.find((l) => mismoId(l?.id, fila.doc_id)) ?? null;
}

/**
 * El texto completo de los días de la vista Lista (el title de la celda «Días»): «8 días sin movimiento», «1 día sin
 * movimiento» y, con 0 (o sin dato: el servidor da 0 sin updated_at), «Movido hoy».
 * @param {any} lead
 * @returns {string}
 */
export function textoDiasLead(lead) {
  const dias = Number(lead?.days);
  if (!Number.isFinite(dias) || dias <= 0) return 'Movido hoy';
  return dias === 1 ? '1 día sin movimiento' : `${dias} días sin movimiento`;
}

/**
 * Lo que dice la vista Lista sin filas: con una búsqueda o una etapa, que nada coincide; sin filtro, que no hay leads.
 * @param {{q?: string | null, etapa?: string | number | null}} [filtro]
 * @returns {string}
 */
export function textoVacioLeads(filtro = {}) {
  return hayFiltroDeLeads(filtro)
    ? 'Ningún lead coincide con la búsqueda o la etapa elegida.'
    : 'No hay leads. Crea uno con «Nuevo Lead».';
}

// ─── B4 T21 r1: lo que pidió la revisión r0 ────────────────────────────────────────────────────────────────────────

/** Los status de un lead cerrado: Ganado (INVOICED) y Perdido (CANCELLED). */
const STATUS_LEAD_CERRADO = congelar(['INVOICED', 'CANCELLED']);

/**
 * El lead está atrasado (esLeadAtrasado: 7 días o más) Y sigue abierto: un lead Ganado o Perdido no está atrasado (m2).
 * Lo usan el chip «Atrasado», el borde de la tarjeta, la fila y la celda Días de la Lista y el orden del tablero.
 * @param {any} lead
 * @returns {boolean}
 */
export function esLeadAtrasadoAbierto(lead) {
  return esLeadAtrasado(lead) && !STATUS_LEAD_CERRADO.includes(lead?.status);
}

/**
 * La columna de un lead en el tablero (m11, m18): un perdido (status CANCELLED) va SIEMPRE a la columna Perdido, sea
 * cual sea su pipeline_stage_id (es lo que cuenta /crm/leads?perdidos=solo); los demás, por columnaDeLead. Sin etapa
 * Perdido manda columnaDeLead (y leadsDelTablero no mezcla los perdidos). Sin etapas: null.
 * @param {any} lead
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null | undefined} stages
 * @returns {string | null}
 */
export function columnaDelTablero(lead, stages) {
  const perdido = esLeadPerdido(lead) ? claveEtapaPerdido(stages) : null;
  return perdido ?? columnaDeLead(lead, stages);
}

/**
 * Los parámetros propios de la Lista (I2): stage_id del select de etapa y, si esa etapa es la de Perdido,
 * perdidos='solo' (get_leads deja fuera los CANCELLED por defecto: sin esto, la Lista con Perdido sale siempre vacía).
 * 'all' o '' = todas las etapas (stage_id null). perdidos null no viaja en la consulta.
 * @param {string | number | null | undefined} etapa  el valor del select
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null | undefined} stages
 * @returns {{stage_id: string | null, perdidos: 'solo' | null}}
 */
export function extraListaLeads(etapa, stages) {
  const id = etapaDe(etapa);
  if (!id) return { stage_id: null, perdidos: null };
  return { stage_id: id, perdidos: id === claveEtapaPerdido(stages) ? 'solo' : null };
}

/**
 * Qué pinta la vista Kanban según la carga (m4, m9, m15, m19): 'esqueleto' (sin las preferencias, o sin etapas mientras
 * cargan), 'error-etapas' (sin etapas ni caché y la carga terminó con error), 'sin-etapas' (no hay ninguna), 'error-leads'
 * (los activos nunca llegaron y la carga terminó con error) o 'tablero'. Una falla de Perdido no tapa el tablero: la
 * dice su columna (datosDelTablero). Una recarga que falla con datos tampoco: el tablero sigue, con su aviso.
 * @param {{listo: boolean, etapasListas: boolean, errorEtapas: unknown, cargando: boolean, hayColumnas: boolean,
 *   leadsListos: boolean, errorLeads: unknown}} estado
 * @returns {'esqueleto' | 'error-etapas' | 'sin-etapas' | 'error-leads' | 'tablero'}
 */
export function vistaDelTablero({ listo, etapasListas, errorEtapas, cargando, hayColumnas, leadsListos, errorLeads }) {
  if (!listo) return 'esqueleto';
  if (!etapasListas) return errorEtapas && !cargando ? 'error-etapas' : 'esqueleto';
  if (!hayColumnas) return 'sin-etapas';
  if (!leadsListos && errorLeads && !cargando) return 'error-leads';
  return 'tablero';
}

/**
 * Los datos de las columnas con la falla de Perdido (m4, m9, m19): esa columna queda con su error (TableroKanban pinta
 * «No se pudo cargar esta columna» y «Reintentar»; plegada, su contador dice «—») o, mientras reintenta, cargando. Las
 * demás no cambian. Sin falla ni recarga (o sin esa columna) devuelve los MISMOS datos.
 * @template D
 * @param {Record<string, D>} datos  los de useTableroKanban
 * @param {string | null} clave  la de Perdido
 * @param {{error?: unknown, cargando?: boolean}} [estado]
 * @returns {Record<string, D>}
 */
export function datosDelTablero(datos, clave, { error = null, cargando = false } = {}) {
  if (!clave || !datos || !tiene(datos, clave) || (!error && !cargando)) return datos;
  const columna = /** @type {any} */ (datos[clave]);
  const marcada = cargando ? { ...columna, cargando: true, error: null } : { ...columna, cargando: false, error, cargaFallida: true };
  return { ...datos, [clave]: marcada };
}

/**
 * Qué se aplica de una carga de loadAll que acaba de llegar (m14): si salió otra carga después, nada (vigente false);
 * si mientras iba cambió un lead en la pantalla (aplicarLead o quitarLead suben la versión), las etapas sí pero los
 * leads no (conLeads false), para que una respuesta vieja no pise el cambio.
 * @param {{turno: number, ultimoTurno: number, version: number, versionActual: number}} carga
 * @returns {{vigente: boolean, conLeads: boolean}}
 */
export function respuestaDeCarga({ turno, ultimoTurno, version, versionActual }) {
  const vigente = turno === ultimoTurno;
  return { vigente, conLeads: vigente && version === versionActual };
}

/**
 * B4 T24 f4 (F99): qué se hace con lo que llega de «Reintentar» de la columna Perdido. Comparte el turno de loadAll: si salió otra
 * carga después, se descarta (ella aplica Perdido); si mientras iba cambió un lead (la versión subió), se vuelve a pedir, en vez de
 * aplicar datos viejos y limpiar el error.
 * @param {{turno: number, ultimoTurno: number, version: number, versionActual: number}} carga
 * @returns {'aplicar' | 'descartar' | 'repedir'}
 */
export function llegadaDePerdidos(carga) {
  const { vigente, conLeads } = respuestaDeCarga(carga);
  if (!vigente) return 'descartar';
  return conLeads ? 'aplicar' : 'repedir';
}

/**
 * B4 T24 f4 (FINAL-m18): el subtítulo del CRM con los leads ABIERTOS (sin Ganados ni Perdidos: STATUS_LEAD_CERRADO), la misma
 * definición del «Valor en el pipeline» del Análisis (crm.py, STATUS_LEAD_CERRADOS). GET /crm/leads corta en 500: si el total del
 * servidor pasa de lo que llegó, se dice.
 * @param {ReadonlyArray<any> | null | undefined} leads  los de GET /crm/leads (sin los CANCELLED)
 * @param {unknown} total  el total de esa respuesta
 * @returns {string}
 */
export function subtituloCrm(leads, total) {
  const lista = Array.isArray(leads) ? leads : [];
  const abiertos = lista.filter((l) => l && typeof l === 'object' && !STATUS_LEAD_CERRADO.includes(l.status));
  const valor = abiertos.reduce((s, l) => s + (Number.isFinite(Number(l.value)) ? Number(l.value) : 0), 0);
  const n = abiertos.length;
  const texto = `${formatoEntero(n)} ${n === 1 ? 'lead abierto' : 'leads abiertos'} · ${formatoPesos(valor)} en pipeline`;
  const t = typeof total === 'number' && Number.isFinite(total) ? total : null;
  return t !== null && t > lista.length ? `${texto} (de los primeros ${formatoEntero(lista.length)} de ${formatoEntero(t)} leads)` : texto;
}

/**
 * B4 T24 f4 (F97): el hex -700 del texto de cada color de etapa (las claves de COLOR_HEX), para la insignia de 10 px de la tarjeta
 * (≥ 4,5:1 sobre el fondo -50; el -500 daba unos 3,5:1). Inmutable.
 * @type {Readonly<Record<string, string>>}
 */
export const TEXTO_HEX = congelar({
  'bg-blue-500': '#1d4ed8', 'bg-cyan-500': '#0e7490', 'bg-indigo-500': '#4338ca', 'bg-emerald-500': '#047857',
  'bg-amber-500': '#b45309', 'bg-rose-500': '#be123c', 'bg-purple-500': '#7e22ce', 'bg-slate-500': '#334155',
  'bg-green-500': '#15803d', 'bg-teal-500': '#0f766e', 'bg-orange-500': '#c2410c', 'bg-pink-500': '#be185d',
  'bg-red-500': '#b91c1c',
});

/**
 * B4 T24 f4 (F97): el color del texto de la insignia de una etapa: su -700 (TEXTO_HEX); sin un color conocido, slate-700.
 * @param {unknown} color  la clase de la etapa (bg-X-500)
 * @returns {string}
 */
export function textoDeEtapa(color) {
  return typeof color === 'string' && tiene(TEXTO_HEX, color) ? TEXTO_HEX[color] : '#334155';
}

/** Lo que dura la caché de etapas del CRM (crm_stages_v1): 5 minutos. */
const TTL_CACHE_ETAPAS = 5 * 60 * 1000;

/**
 * B4 T24 f4 (F98): las etapas de la caché crm_stages_v1 (`{data, ts}` de localStorage). Vencida (5 minutos) no sirve, SALVO con
 * `ignorarTTL`: si /crm/pipeline-stages falló, las etapas viejas son mejores que la caja de error (la pantalla avisa «No se pudo
 * actualizar el CRM»). Sin caché, rota o sin una lista, null.
 * @param {string | null | undefined} raw
 * @param {number} ahora  Date.now()
 * @param {{ignorarTTL?: boolean}} [opciones]
 * @returns {any[] | null}
 */
export function etapasDeLaCache(raw, ahora, { ignorarTTL = false } = {}) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const { data, ts } = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    if (!ignorarTTL && !(Number.isFinite(ts) && ahora - ts <= TTL_CACHE_ETAPAS)) return null;
    return data;
  } catch { return null; }
}

/**
 * El número de la barra en Kanban (m21, el «N leads» de la barra vieja): la suma de lo que cuentan las columnas, con
 * el total propio donde lo hay (Perdido, RP61). Mientras los leads no llegaron (null), null (sin número, nunca 0).
 * @param {ReadonlyArray<any> | null | undefined} items  los leads del tablero (ya filtrados)
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null | undefined} stages
 * @param {Record<string, number> | undefined} totales  los de totalesDelTablero
 * @returns {number | null}
 */
export function totalDelTablero(items, stages, totales) {
  if (!Array.isArray(items)) return null;
  /** @type {Record<string, number>} */
  const porColumna = {};
  for (const s of etapasDe(stages)) porColumna[String(s.id)] = 0;
  for (const lead of items) {
    const clave = columnaDelTablero(lead, stages);
    if (clave !== null && tiene(porColumna, clave)) porColumna[clave] += 1;
  }
  let total = 0;
  for (const [clave, n] of Object.entries(porColumna)) {
    const propio = totales?.[clave];
    total += typeof propio === 'number' && Number.isFinite(propio) ? propio : n;
  }
  return total;
}

/** Los campos de una etapa que manda GET /crm/pipeline-stages (crm.py _stage_to_dict). */
const CAMPOS_ETAPA = congelar(['id', 'name', 'color', 'bg_color', 'position', 'maps_to_status']);

/**
 * Solo los campos de _stage_to_dict de una etapa (m22): al guardar una etapa en el panel, is_closed, alert_days,
 * alert_message y pipeline_name (que solo existen en /config y no se guardan en la base) no entran en las etapas del
 * tablero (si no, columnasDesdeEtapas plegaría una columna hasta la próxima recarga).
 * @param {any} etapa
 * @returns {Partial<EtapaCrm>}
 */
export function camposDeEtapa(etapa) {
  /** @type {Record<string, unknown>} */
  const campos = {};
  if (!etapa || typeof etapa !== 'object') return campos;
  for (const c of CAMPOS_ETAPA) if (tiene(etapa, c) && etapa[c] !== undefined) campos[c] = etapa[c];
  return campos;
}

// ─── B4 T23B: Seguimientos del CRM (KPI-otros punto 2; RP7) ────────────────────────────────────────────────────────────

/**
 * Las etapas que muestra Seguimientos: todas menos Perdido (maps_to_status CANCELLED). GET /crm/leads deja fuera los
 * perdidos (perdidos='excluir' por defecto), así que esa etapa saldría siempre vacía, y «0» sería falso.
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null | undefined} stages
 * @returns {EtapaCrm[]}
 */
export function etapasDeSeguimiento(stages) {
  return etapasDe(stages).filter((s) => s.maps_to_status !== 'CANCELLED');
}

/**
 * La vista de Seguimientos para una búsqueda y una etapa: filtrarLeads (la búsqueda sin tildes en el cliente, la
 * descripción, el producto y el asesor; la etapa con la regla de columnaDelTablero) y solo lo que tiene grupo en pantalla
 * (un lead que cae en la etapa Perdido sin ser CANCELLED no se ve, y por eso no se cuenta). Las tarjetas, las pastillas y los
 * grupos salen de ESTA función: el número de cada una es el de la vista que abre. Sin etapas, solo la búsqueda.
 * @param {ReadonlyArray<any> | null | undefined} leads
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null | undefined} stages
 * @param {{q?: string | null, etapa?: string | number | null}} [filtro]
 * @returns {ReadonlyArray<any>}
 */
export function filtrarSeguimiento(leads, stages, { q, etapa } = {}) {
  const lista = Array.isArray(leads) ? leads : [];
  const visibles = new Set(etapasDeSeguimiento(stages).map((e) => String(e.id)));
  if (visibles.size === 0) return filtrarLeads(lista, { q }, null);
  return filtrarLeads(lista, { q, etapa }, stages).filter((l) => visibles.has(/** @type {string} */ (columnaDelTablero(l, stages))));
}

/**
 * Las tarjetas de Seguimientos: las 3 primeras etapas (nombre de la etapa, color con acentoDesdeClase y el número de la vista
 * que abren: la búsqueda más esa etapa) y el total (todas las etapas con la misma búsqueda, y de ellos los atrasados: 7 días o
 * más sin actividad y abiertos). `activa` marca lo elegido ('' o 'all' es el total). Mientras los leads cargan (null), null:
 * la pantalla pinta la barra gris, nunca 0.
 * @param {ReadonlyArray<any> | null | undefined} leads
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null | undefined} stages
 * @param {{q?: string | null, etapa?: string | number | null}} [filtro]
 * @returns {{etapas: Array<{clave: string, nombre: string, acento: import('./kpis.js').ColorKpi, valor: number, activa: boolean}>,
 *   total: {valor: number, urgentes: number, ayuda: string, activa: boolean}} | null}
 */
export function tarjetasSeguimientos(leads, stages, { q, etapa } = {}) {
  if (!Array.isArray(leads)) return null;
  const elegida = etapaDe(etapa);
  const todos = filtrarSeguimiento(leads, stages, { q });
  const urgentes = todos.filter(esLeadAtrasadoAbierto).length;
  return {
    etapas: etapasDeSeguimiento(stages).slice(0, 3).map((s) => {
      const clave = String(s.id);
      return {
        clave,
        nombre: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : `Etapa ${s.id}`,
        acento: acentoDesdeClase(s.color),
        valor: filtrarSeguimiento(leads, stages, { q, etapa: clave }).length,
        activa: elegida === clave,
      };
    }),
    total: { valor: todos.length, urgentes, ayuda: `${urgentes} con ${DIAS_ALERTA_LEAD} días o más sin actividad`, activa: elegida === '' },
  };
}

/**
 * Los grupos de la lista de Seguimientos: uno por etapa (con su color en hex, que sí es un color; la clase de Tailwind de la
 * etapa no lo es) y sus leads de la vista; con una etapa elegida, solo esa. Sin leads (null), [].
 * @param {ReadonlyArray<any> | null | undefined} leads
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null | undefined} stages
 * @param {{q?: string | null, etapa?: string | number | null}} [filtro]
 * @returns {Array<{clave: string, nombre: string, colorHex: string, leads: ReadonlyArray<any>}>}
 */
export function gruposDeSeguimiento(leads, stages, { q, etapa } = {}) {
  if (!Array.isArray(leads)) return [];
  const elegida = etapaDe(etapa);
  const visibles = etapasDeSeguimiento(stages);
  const columnas = columnasDesdeEtapas(visibles);
  return columnas
    .filter((c) => elegida === '' || c.clave === elegida)
    .map((c) => ({ clave: c.clave, nombre: c.titulo, colorHex: c.colorHex, leads: filtrarSeguimiento(leads, stages, { q, etapa: c.clave }) }));
}

/**
 * Lo que dice la tarjeta de un lead de Seguimientos, con las claves que SÍ manda GET /crm/leads (_lead_to_dict): client, value,
 * phone, email, description, lead_product_name, advisor_name, days y updated_at (sin zona: es UTC, hace() de fechas-colombia).
 * `valor` es null sin dinero (sin pastilla) y `atrasado` no cuenta los leads cerrados (esLeadAtrasadoAbierto).
 * @param {any} lead
 * @returns {{nombre: string, producto: string, valor: string | null, telefono: string | null, correo: string | null,
 *   descripcion: string, asesor: string, diasTexto: string, atrasado: boolean, hace: string}}
 */
export function fichaDeLeadSeguimiento(lead) {
  const texto = (v) => (typeof v === 'string' ? v.trim() : '');
  const dinero = Number(lead?.value);
  return {
    nombre: texto(lead?.client) || 'Sin nombre',
    producto: texto(lead?.lead_product_name),
    valor: Number.isFinite(dinero) && dinero > 0 ? formatoPesos(dinero) : null,
    telefono: texto(lead?.phone) || null,
    correo: texto(lead?.email) || null,
    descripcion: texto(lead?.description),
    asesor: texto(lead?.advisor_name),
    diasTexto: textoDiasLead(lead),
    atrasado: esLeadAtrasadoAbierto(lead),
    hace: lead?.updated_at ? (hace(lead.updated_at) || 'Sin actividad') : 'Sin actividad',
  };
}

/**
 * B4 T23B (RP7): lo que Seguimientos toma de las dos respuestas, GET /crm/leads ({status, data, total}) y GET /crm/pipeline-stages
 * ({status, data}), o de una lista tal cual (como las lee crm/page.tsx): {leads, stages, total}. `total` es el del servidor (los
 * leads sin perder; nunca menos que los que llegaron). Una respuesta sin una lista en `data` NO es «sin leads»: es un error, y
 * lanza Error('El servidor no devolvió datos.') para que la pantalla lo diga con «Reintentar».
 * @param {any} respuestaLeads
 * @param {any} respuestaEtapas
 * @returns {{leads: any[], stages: any[], total: number}}
 */
export function datosDeSeguimiento(respuestaLeads, respuestaEtapas) {
  const lista = (r) => {
    const l = Array.isArray(r) ? r : r !== null && typeof r === 'object' ? r.data : null;
    if (!Array.isArray(l)) throw new Error('El servidor no devolvió datos.');
    return l;
  };
  const leads = lista(respuestaLeads);
  const stages = lista(respuestaEtapas);
  const total = Number(respuestaLeads?.total);
  return { leads, stages, total: Number.isFinite(total) ? Math.max(total, leads.length) : leads.length };
}

/**
 * B4 T23B r1 (I3): qué pinta Seguimientos con lo que llegó: 'esqueleto' (los leads todavía no llegan y no hay error: se espera, nunca «vacío»),
 * 'aviso' (no llegaron y la carga falló: el aviso con «Reintentar»), 'vacio' (la vista filtrada no tiene leads: no hay ninguno o la búsqueda no
 * encuentra) o 'grupos'. Con leads a la vista, un error de recarga no los tapa.
 * @param {ReadonlyArray<any> | null | undefined} leads  los leads cargados (null mientras llegan)
 * @param {unknown} aviso  el aviso de la carga (avisoDeFuente) o null
 * @param {ReadonlyArray<any>} [filtrados]  la vista filtrada (por defecto, los leads)
 * @returns {'esqueleto' | 'aviso' | 'vacio' | 'grupos'}
 */
export function vistaSeguimiento(leads, aviso, filtrados) {
  if (!Array.isArray(leads)) return aviso ? 'aviso' : 'esqueleto';
  return (filtrados ?? leads).length === 0 ? 'vacio' : 'grupos';
}
