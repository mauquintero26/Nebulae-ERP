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
  // B4 T21: lo que la pantalla del CRM arma con las etapas y los leads (el tablero común en modo cliente).
  esLeadPerdido, claveEtapaPerdido, leadsDelTablero, conLeadActivo, conLeadPerdido, sinLead, sinLeadPerdido,
  filtrarLeads, hayFiltroDeLeads, sumaPorEtapa, textoResumenEtapa, totalesDelTablero, chipsDeLead, leadDeMovimiento,
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

// ─── B4 T21 (crm/page.tsx): los leads del tablero, sus listas, el filtro, la suma y los chips ───────────────────────
// Los leads tienen la forma de GET /crm/leads (crm.py _lead_to_dict): id, client, value, status, pipeline_stage_id,
// days, description, lead_product_name, advisor_name, updated_at y sc_id, con esos nombres.
const ids = (lista) => lista.map((l) => l.id);

console.log('--- TEST 6: esLeadPerdido y claveEtapaPerdido (la columna que llena /crm/leads?perdidos=solo) ---');
{
  assert.equal(esLeadPerdido({ status: 'CANCELLED' }), true, 'perdidos=solo es status == CANCELLED');
  assert.equal(esLeadPerdido({ status: 'INVOICED' }), false, 'Ganado no es perdido');
  assert.equal(esLeadPerdido({ status: 'cancelled' }), false);
  assert.equal(esLeadPerdido(null), false);
  assert.equal(claveEtapaPerdido(ETAPAS), '4');
  assert.equal(claveEtapaPerdido({ status: 'success', data: ETAPAS }), '4', 'también la respuesta {status, data}');
  assert.equal(claveEtapaPerdido(ETAPAS.slice(0, 3)), null, 'sin una etapa CANCELLED no hay columna Perdido');
  assert.equal(claveEtapaPerdido(null), null);
}

console.log('--- TEST 7: los activos, los perdidos y el lead que devuelve el servidor ---');
{
  const A = Object.freeze([
    Object.freeze({ id: 1, client: 'Ana Pérez', status: 'DRAFT', pipeline_stage_id: 1 }),
    Object.freeze({ id: 2, client: 'Luis Gómez', status: 'QUOTATION', pipeline_stage_id: 2 }),
  ]);
  const P = Object.freeze({ items: Object.freeze([Object.freeze({ id: 9, client: 'Rosa Díaz', status: 'CANCELLED', pipeline_stage_id: 4 })]), total: 120 });
  assert.deepEqual(ids(leadsDelTablero(A, P.items)), [1, 2, 9], 'los activos y detrás los perdidos');
  assert.deepEqual(leadsDelTablero([...A, { id: '9', status: 'DRAFT' }], P.items).map((l) => [l.id, l.status]),
    [[1, 'DRAFT'], [2, 'QUOTATION'], ['9', 'DRAFT']], 'un id repetido sale una sola vez: el activo gana');
  assert.deepEqual(leadsDelTablero(null, undefined), []);

  // Mover el 2 a Perdido (el PATCH devuelve el lead con status CANCELLED).
  const perdido2 = { id: 2, client: 'Luis Gómez', status: 'CANCELLED', pipeline_stage_id: 4 };
  assert.deepEqual(ids(conLeadActivo(A, perdido2)), [1], 'un perdido sale de los activos');
  assert.deepEqual(conLeadPerdido(P, perdido2), { items: [perdido2, P.items[0]], total: 121 }, 'y entra primero en Perdido, con el total + 1');
  // Sacar el 9 de Perdido.
  const vuelve9 = { id: 9, client: 'Rosa Díaz', status: 'DRAFT', pipeline_stage_id: 1 };
  assert.deepEqual(ids(conLeadActivo(A, vuelve9)), [9, 1, 2], 'un lead que no estaba entra primero');
  assert.deepEqual(conLeadPerdido(P, vuelve9), { items: [], total: 119 }, 'sale de Perdido con el total − 1');
  // Editar el 1 (sigue activo): queda en su lugar; Perdido no cambia (el mismo objeto).
  const editado1 = { ...A[0], value: 5000 };
  assert.deepEqual(conLeadActivo(A, editado1), [editado1, A[1]]);
  assert.equal(conLeadPerdido(P, editado1), P);
  // Un perdido que ya estaba se reemplaza sin sumar; el id como texto también vale.
  const nueve = { ...P.items[0], id: '9', value: 300 };
  assert.deepEqual(conLeadPerdido(P, nueve), { items: [nueve], total: 120 });
  assert.equal(conLeadPerdido(null, perdido2), null, 'sin perdidos cargados no se inventa la lista');
  assert.deepEqual(conLeadPerdido({ items: [], total: 0 }, vuelve9), { items: [], total: 0 }, 'nunca un total negativo');
  assert.deepEqual(conLeadPerdido({ items: [P.items[0]], total: 0 }, vuelve9), { items: [], total: 0 });
  // Borrar.
  assert.deepEqual(ids(sinLead(A, '2')), [1]);
  assert.equal(sinLead(A, 77), A, 'sin ese id: la misma lista');
  assert.deepEqual(sinLeadPerdido(P, 9), { items: [], total: 119 });
  assert.equal(sinLeadPerdido(P, 1), P);
  assert.equal(sinLeadPerdido(null, 9), null);
  assert.deepEqual(conLeadActivo(null, editado1), [editado1]);
}

console.log('--- TEST 8: filtrarLeads (la búsqueda y la etapa de la barra, en el tablero) y hayFiltroDeLeads ---');
{
  const L = [
    { id: 1, client: 'Ana Pérez', description: 'Quiere una cuna', lead_product_name: 'Cuna 3 en 1', advisor_name: 'Laura', pipeline_stage_id: 1 },
    { id: 2, client: 'Comercial Los Andes', description: '', lead_product_name: '', advisor_name: 'Pedro Ruiz', pipeline_stage_id: 2 },
    { id: 3, client: null, description: null, lead_product_name: null, advisor_name: null, pipeline_stage_id: null },
  ];
  assert.equal(filtrarLeads(L, {}), L, 'sin filtro: la misma lista (estable para useMemo)');
  assert.equal(filtrarLeads(L, { q: '   ', etapa: 'all' }), L);
  assert.deepEqual(ids(filtrarLeads(L, { q: 'ANA' })), [1], 'el cliente, sin mayúsculas');
  assert.deepEqual(ids(filtrarLeads(L, { q: 'cuna 3' })), [1], 'el producto');
  assert.deepEqual(ids(filtrarLeads(L, { q: 'quiere' })), [1], 'la descripción');
  assert.deepEqual(ids(filtrarLeads(L, { q: 'ruiz' })), [2], 'el asesor (como la barra de hoy)');
  assert.deepEqual(ids(filtrarLeads(L, { q: '  andes ' })), [2], 'recortada, como q en el servidor');
  assert.deepEqual(ids(filtrarLeads(L, { etapa: '2' })), [2], 'la etapa del select');
  assert.deepEqual(ids(filtrarLeads(L, { etapa: 2 })), [2]);
  assert.deepEqual(ids(filtrarLeads(L, { q: 'ana', etapa: '2' })), [], 'las dos a la vez');
  assert.deepEqual(filtrarLeads(null, { q: 'x' }), []);
  assert.equal(hayFiltroDeLeads({}), false);
  assert.equal(hayFiltroDeLeads({ q: '  ', etapa: 'all' }), false);
  assert.equal(hayFiltroDeLeads({ q: 'a' }), true);
  assert.equal(hayFiltroDeLeads({ etapa: '3' }), true);
  assert.equal(hayFiltroDeLeads({ etapa: '' }), false);
}

console.log('--- TEST 9: la suma de cada etapa, su texto y el total real de Perdido (RP61, RP105) ---');
{
  const S = [
    { id: 1, value: 1000000, pipeline_stage_id: 1, status: 'DRAFT' },
    { id: 2, value: 62523.4, pipeline_stage_id: 1, status: 'DRAFT' },
    { id: 3, value: null, pipeline_stage_id: 2, status: 'QUOTATION' },
    { id: 4, value: 500, pipeline_stage_id: null, status: 'QUOTATION' },
    { id: 5, value: 300, pipeline_stage_id: 4, status: 'CANCELLED' },
  ];
  assert.deepEqual(sumaPorEtapa(S, ETAPAS), { 1: 1062523.4, 2: 500, 3: 0, 4: 300 },
    'por la columna de cada lead (un lead sin etapa suma en la de su status); una etapa vacía da 0');
  assert.deepEqual(sumaPorEtapa(null, ETAPAS), { 1: 0, 2: 0, 3: 0, 4: 0 });
  assert.deepEqual(sumaPorEtapa(S, []), {});
  const sumas = sumaPorEtapa(S, ETAPAS);
  assert.equal(textoResumenEtapa('1', sumas), '$1.062.523', 'formatoPesos de lib/pesos.js');
  assert.equal(textoResumenEtapa('3', sumas), '$0');
  assert.equal(textoResumenEtapa('99', sumas), '$0');
  const perdidos = { items: Array.from({ length: 50 }, (_, i) => ({ id: 100 + i })), total: 120 };
  assert.equal(textoResumenEtapa('4', sumas, { clavePerdido: '4', perdidos }), '$300 en los 50 más recientes',
    'Perdido trae 50 de 120: la suma no es de todos');
  assert.equal(textoResumenEtapa('4', sumas, { clavePerdido: '4', perdidos: { items: [{ id: 1 }], total: 3 } }), '$300 en el más reciente');
  assert.equal(textoResumenEtapa('4', sumas, { clavePerdido: '4', perdidos: { items: [{ id: 1 }], total: 1 } }), '$300', 'completa');
  assert.equal(textoResumenEtapa('1', sumas, { clavePerdido: '4', perdidos }), '$1.062.523', 'solo Perdido es parcial');

  assert.deepEqual(totalesDelTablero(ETAPAS, { items: [], total: 120 }, {}), { 4: 120 }, 'Perdido cuenta el total del servidor');
  assert.equal(totalesDelTablero(ETAPAS, { items: [], total: 120 }, { q: 'ana' }), undefined,
    'con una búsqueda o una etapa, el total del servidor (sin filtro) no vale: cuenta lo que se ve');
  assert.equal(totalesDelTablero(ETAPAS, { items: [], total: 120 }, { etapa: '1' }), undefined);
  assert.equal(totalesDelTablero(ETAPAS.slice(0, 3), { items: [], total: 3 }, {}), undefined);
  assert.equal(totalesDelTablero(ETAPAS, null, {}), undefined);
  assert.equal(totalesDelTablero(ETAPAS, { items: [], total: null }, {}), undefined);
}

console.log('--- TEST 10: chipsDeLead (KANBAN-crm punto 7) y leadDeMovimiento (Análisis) ---');
{
  assert.deepEqual(chipsDeLead({ sc_id: 40, days: 8 }), [{ texto: 'Con solicitud', tono: 'indigo' }, { texto: 'Atrasado', tono: 'rose' }]);
  assert.deepEqual(chipsDeLead({ sc_id: 40, days: 6 }), [{ texto: 'Con solicitud', tono: 'indigo' }], 'sc_id manda el chip');
  assert.deepEqual(chipsDeLead({ sc_id: null, days: 7 }), [{ texto: 'Atrasado', tono: 'rose' }], 'esLeadAtrasado: 7 días o más');
  assert.deepEqual(chipsDeLead({ days: 2 }), []);
  assert.deepEqual(chipsDeLead({ sc_id: '', days: 0 }), []);
  assert.deepEqual(chipsDeLead(null), []);

  const cargados = [{ id: 7, client: 'Ana' }, { id: 8, client: 'Luis' }];
  // La fila de «Requieren atención» (crm.py _analisis_crm): doc_tipo 'LEAD' y doc_id el id del lead.
  assert.equal(leadDeMovimiento({ tipo: 'LEAD', doc_tipo: 'LEAD', doc_id: 8, numero: 'LEAD-8' }, cargados), cargados[1]);
  assert.equal(leadDeMovimiento({ doc_tipo: 'LEAD', doc_id: '7' }, cargados), cargados[0]);
  assert.equal(leadDeMovimiento({ doc_tipo: 'LEAD', doc_id: 99 }, cargados), null, 'no está cargado: la pantalla avisa');
  assert.equal(leadDeMovimiento({ doc_tipo: 'PVEN', doc_id: 7 }, cargados), null);
  assert.equal(leadDeMovimiento({ doc_tipo: 'LEAD', doc_id: null }, cargados), null);
  assert.equal(leadDeMovimiento(null, cargados), null);
  assert.equal(leadDeMovimiento({ doc_tipo: 'LEAD', doc_id: 7 }, null), null);
}

console.log('OK test_crm_etapas');
