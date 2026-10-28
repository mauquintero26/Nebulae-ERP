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
 */

import { congelar, tiene } from './estados-pedido.js';
import { HEX_CLASE_TAILWIND, hexDeClaseTailwind } from './analisis.js';
import { definirColumnas } from './kanban.js';

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
