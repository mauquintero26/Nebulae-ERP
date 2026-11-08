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
import { definirColumnas } from './kanban.js';
import { formatoPesos } from './pesos.js';

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

/** La familia de color de la clase ('bg-blue-500' -> 'blue'), o 'slate'. */
const familia = (clase) => /^bg-([a-z]+)-\d+$/.exec(typeof clase === 'string' ? clase.trim() : '')?.[1] ?? 'slate';

/**
 * Las columnas del tablero del CRM a partir de las etapas (GET /crm/pipeline-stages, o su respuesta {status, data}), en
 * su orden, con la forma de kanban.js: {clave: String(id), titulo: name (o 'Etapa {id}'), tono (la familia del color),
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
      tono: familia(s.color),
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
 * @param {ReadonlyArray<any> | null | undefined} activos
 * @param {ReadonlyArray<any> | null | undefined} perdidos  los items de PerdidosCrm
 * @returns {any[]}
 */
export function leadsDelTablero(activos, perdidos) {
  const lista = Array.isArray(activos) ? [...activos] : [];
  for (const lead of Array.isArray(perdidos) ? perdidos : []) {
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

/**
 * Los leads del tablero con la búsqueda y la etapa de la barra (el mismo filtro que tenía el Kanban): q, recortada y sin
 * mayúsculas, en el cliente, la descripción, el producto y el asesor; etapa = el pipeline_stage_id exacto. Sin filtro
 * devuelve la MISMA lista (estable para useMemo).
 * @param {ReadonlyArray<any> | null | undefined} leads
 * @param {{q?: string | null, etapa?: string | number | null}} [filtro]
 * @returns {ReadonlyArray<any>}
 */
export function filtrarLeads(leads, { q, etapa } = {}) {
  const lista = Array.isArray(leads) ? leads : [];
  const texto = textoDe(q);
  const conEtapa = etapaDe(etapa);
  if (!texto && !conEtapa) return lista;
  const contiene = (v) => typeof v === 'string' && v.toLowerCase().includes(texto);
  return lista.filter((l) => (!texto || contiene(l?.client) || contiene(l?.description) || contiene(l?.lead_product_name)
    || contiene(l?.advisor_name))
    && (!conEtapa || (l?.pipeline_stage_id !== null && l?.pipeline_stage_id !== undefined && String(l.pipeline_stage_id) === conEtapa)));
}

/**
 * La suma de value de los leads en cada columna (columnaDeLead: un lead sin etapa suma en la de su status), para la
 * suma de cada etapa del tablero. Toda etapa sale, con 0 si no tiene leads.
 * @param {ReadonlyArray<any> | null | undefined} leads
 * @param {ReadonlyArray<EtapaCrm> | {data?: ReadonlyArray<EtapaCrm>} | null | undefined} stages
 * @returns {Record<string, number>}
 */
export function sumaPorEtapa(leads, stages) {
  const lista = etapasDe(stages);
  /** @type {Record<string, number>} */
  const sumas = {};
  for (const s of lista) sumas[String(s.id)] = 0;
  if (!lista.length) return sumas;
  for (const lead of Array.isArray(leads) ? leads : []) {
    const clave = columnaDeLead(lead, lista);
    const valor = Number(lead?.value);
    if (clave !== null && Number.isFinite(valor)) sumas[clave] += valor;
  }
  return sumas;
}

/**
 * El resumen de una columna: formatoPesos de su suma (RP105). En Perdido, si se cargaron menos que su total (los 50
 * más recientes de N), la suma dice de cuántos es: «$X en los 50 más recientes» («en el más reciente» con 1).
 * @param {string} clave
 * @param {Record<string, number> | null | undefined} sumas  de sumaPorEtapa
 * @param {{clavePerdido?: string | null, perdidos?: PerdidosCrm | null}} [opciones]
 * @returns {string}
 */
export function textoResumenEtapa(clave, sumas, { clavePerdido = null, perdidos = null } = {}) {
  const suma = formatoPesos(Number(sumas?.[clave]) || 0);
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
  if (esLeadAtrasado(lead)) chips.push({ texto: 'Atrasado', tono: 'rose' });
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
