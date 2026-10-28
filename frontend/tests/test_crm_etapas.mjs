/**
 * frontend/tests/test_crm_etapas.mjs
 * Bloque 4, T3C (KANBAN-crm punto 4, R11, RP73): las etapas del CRM como columnas del tablero común
 * (lib/crm-etapas.js). Los colores salen de HEX_CLASE_TAILWIND (lib/analisis.js, T3A; con el rojo de «Perdido»), las
 * etapas cerradas (CANCELLED, INVOICED o is_closed) salen plegadas, un lead sin etapa cae en la de su status y mover un
 * lead es libre, también si viene de una solicitud (crm_lead_con_solicitud = «Sí, libre como hoy»).
 */

import assert from 'node:assert/strict';
import {
  COLOR_HEX, BG_HEX, DIAS_ALERTA_LEAD, columnasDesdeEtapas, columnaDeLead, esLeadAtrasado, reglaSoltarLead,
} from '../src/lib/crm-etapas.js';
import { HEX_CLASE_TAILWIND } from '../src/lib/analisis.js';
import { mapaDestinos } from '../src/lib/kanban.js';

// La forma de GET /crm/pipeline-stages (crm.py _stage_to_dict).
const ETAPAS = [
  { id: 1, name: 'Nuevo', color: 'bg-blue-500', bg_color: 'bg-blue-50', position: 0, maps_to_status: 'DRAFT' },
  { id: 2, name: 'Cotización', color: 'bg-amber-500', bg_color: 'bg-amber-50', position: 1, maps_to_status: 'QUOTATION' },
  { id: 3, name: 'Ganado', color: 'bg-emerald-500', bg_color: 'bg-emerald-50', position: 2, maps_to_status: 'INVOICED' },
  { id: 4, name: 'Perdido', color: 'bg-red-500', bg_color: 'bg-red-50', position: 3, maps_to_status: 'CANCELLED' },
];

console.log('--- TEST 1: COLOR_HEX y BG_HEX salen de HEX_CLASE_TAILWIND (RP73) ---');
{
  assert.equal(Object.keys(COLOR_HEX).length, 13);
  assert.equal(Object.keys(BG_HEX).length, 13);
  assert.equal(COLOR_HEX['bg-red-500'], '#ef4444', '«Perdido» en rojo');
  assert.equal(BG_HEX['bg-red-50'], '#fef2f2');
  assert.equal(COLOR_HEX['bg-blue-500'], '#3b82f6');
  assert.equal(BG_HEX['bg-emerald-50'], '#f0fdf4');
  for (const [clase, hex] of [...Object.entries(COLOR_HEX), ...Object.entries(BG_HEX)]) {
    assert.equal(HEX_CLASE_TAILWIND[clase], hex, clase);
  }
  assert.ok(Object.keys(COLOR_HEX).every((c) => c.endsWith('-500')) && Object.keys(BG_HEX).every((c) => c.endsWith('-50')));
  assert.ok(Object.isFrozen(COLOR_HEX) && Object.isFrozen(BG_HEX));
}

console.log('--- TEST 2: columnasDesdeEtapas ---');
{
  const columnas = columnasDesdeEtapas(ETAPAS);
  assert.deepEqual(columnas.map((c) => [c.clave, c.titulo, c.colorHex, c.cerrada]), [
    ['1', 'Nuevo', '#3b82f6', false],
    ['2', 'Cotización', '#f59e0b', false],
    ['3', 'Ganado', '#10b981', true],
    ['4', 'Perdido', '#ef4444', true],
  ], 'INVOICED y CANCELLED salen cerradas');
  assert.deepEqual(columnas.map((c) => c.bgHex), ['#eff6ff', '#fffbeb', '#f0fdf4', '#fef2f2']);
  assert.deepEqual(columnas.map((c) => c.tono), ['blue', 'amber', 'emerald', 'red']);
  assert.ok(Object.isFrozen(columnas));
  // is_closed === true también cierra (hoy el modelo no lo trae; RP73).
  assert.equal(columnasDesdeEtapas([{ ...ETAPAS[0], is_closed: true }])[0].cerrada, true);
  assert.equal(columnasDesdeEtapas([{ ...ETAPAS[0], is_closed: 'si' }])[0].cerrada, false);
  // La respuesta {status, data}, una clase desconocida y una etapa sin nombre.
  const raras = columnasDesdeEtapas({ status: 'success', data: [{ id: 9, name: ' ', color: 'bg-lime-500', maps_to_status: null }] });
  assert.deepEqual(raras.map((c) => [c.clave, c.titulo, c.colorHex, c.bgHex, c.tono, c.cerrada]),
    [['9', 'Etapa 9', '#94a3b8', null, 'lime', false]], 'un color desconocido es gris y un fondo desconocido, null');
  assert.equal(columnasDesdeEtapas([{ id: 1, name: 'X', color: '#123456' }])[0].colorHex, '#123456', 'un hex va tal cual');
  assert.deepEqual(columnasDesdeEtapas([]), []);
  assert.deepEqual(columnasDesdeEtapas(null), []);
}

console.log('--- TEST 3: columnaDeLead: ningún lead queda sin columna ---');
{
  assert.equal(columnaDeLead({ pipeline_stage_id: 2, status: 'DRAFT' }, ETAPAS), '2', 'su etapa manda');
  assert.equal(columnaDeLead({ pipeline_stage_id: null, status: 'QUOTATION' }, ETAPAS), '2', 'sin etapa: la de su status');
  assert.equal(columnaDeLead({ pipeline_stage_id: 99, status: 'CANCELLED' }, ETAPAS), '4', 'una etapa que ya no existe');
  assert.equal(columnaDeLead({ status: 'RARO' }, ETAPAS), '1', 'sin nada: la primera');
  assert.equal(columnaDeLead({}, { data: ETAPAS }), '1');
  assert.equal(columnaDeLead({ pipeline_stage_id: '3' }, ETAPAS), '3', 'el id como texto');
  assert.equal(columnaDeLead({ status: 'DRAFT' }, []), null);
}

console.log('--- TEST 4: esLeadAtrasado con 7 días fijos (RP73) ---');
{
  assert.equal(DIAS_ALERTA_LEAD, 7);
  assert.equal(esLeadAtrasado({ days: 7 }), true);
  assert.equal(esLeadAtrasado({ days: 8 }), true);
  assert.equal(esLeadAtrasado({ days: 6 }), false);
  assert.equal(esLeadAtrasado({ days: '9' }), true);
  assert.equal(esLeadAtrasado({}), false);
  assert.equal(esLeadAtrasado(null), false);
}

console.log('--- TEST 5: reglaSoltarLead, libre (también con solicitud) ---');
{
  for (const lead of [{ id: 5, pipeline_stage_id: 1 }, { id: 6, pipeline_stage_id: 1, sc_id: 40 }]) {
    assert.deepEqual(reglaSoltarLead(lead, '1', '4'), { tipo: 'cambio', estado: '4', cuerpo: { pipeline_stage_id: 4 } });
    assert.deepEqual(reglaSoltarLead(lead, '1', '1'), { tipo: 'ninguno' });
  }
  // La variante «No» (bloquear los leads con solicitud) no se implementa (R1, R11).
  const columnas = columnasDesdeEtapas(ETAPAS);
  const mapa = mapaDestinos({ id: 6, sc_id: 40 }, '1', columnas, reglaSoltarLead);
  assert.deepEqual(Object.values(mapa).map((d) => d.permitido), [false, true, true, true]);
}

console.log('OK test_crm_etapas');
