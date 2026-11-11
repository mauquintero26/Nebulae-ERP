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
  textoDiasLead, textoVacioLeads,
  // T21 r1: lo que pidió la revisión r0.
  esLeadAtrasadoAbierto, columnaDelTablero, extraListaLeads, vistaDelTablero, datosDelTablero, respuestaDeCarga,
  totalDelTablero, camposDeEtapa,
  // B4 T23B: Seguimientos del CRM.
  etapasDeSeguimiento, filtrarSeguimiento, tarjetasSeguimientos, gruposDeSeguimiento, fichaDeLeadSeguimiento,
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
  // r1 (m15): con dos etapas CANCELLED, la primera (la misma que columnaDeLead toma por status).
  const dosPerdidas = [...ETAPAS, { id: 7, name: 'Descartado', color: 'bg-slate-500', maps_to_status: 'CANCELLED' }];
  assert.equal(claveEtapaPerdido(dosPerdidas), '4', 'la primera etapa CANCELLED, no la última');
  assert.equal(columnaDeLead({ status: 'CANCELLED' }, dosPerdidas), claveEtapaPerdido(dosPerdidas));
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
  // r1 (m15): al borrar, el total tampoco baja de 0.
  assert.deepEqual(sinLeadPerdido({ items: [P.items[0]], total: 0 }, 9), { items: [], total: 0 }, 'borrar nunca da un total negativo');
  // r1 (m18): sin una etapa CANCELLED no hay columna Perdido: los perdidos no se mezclan con los activos.
  assert.deepEqual(ids(leadsDelTablero(A, P.items, ETAPAS.slice(0, 3))), [1, 2], 'sin etapa Perdido, los perdidos no entran');
  assert.deepEqual(ids(leadsDelTablero(A, P.items, ETAPAS)), [1, 2, 9], 'con etapa Perdido, sí');
}

console.log('--- TEST 8: filtrarLeads (la búsqueda y la etapa de la barra, en el tablero) y hayFiltroDeLeads ---');
{
  const L = [
    { id: 1, client: 'Ana Pérez', description: 'Quiere una cuna', lead_product_name: 'Cuna 3 en 1', advisor_name: 'Laura', pipeline_stage_id: 1 },
    { id: 2, client: 'Comercial Los Andes', description: '', lead_product_name: '', advisor_name: 'Pedro Ruiz', pipeline_stage_id: 2 },
    { id: 3, client: null, description: null, lead_product_name: null, advisor_name: null, pipeline_stage_id: null },
  ];
  // r1 (m10, m11, m18): la búsqueda es filtrarFilas de lib/tabla.js (sin tildes ni mayúsculas, palabra por palabra) y
  // la etapa usa la MISMA regla que ubica cada lead en su columna (columnaDelTablero), así que recibe las etapas.
  const PERDIDO_EN_1 = { id: 4, client: 'Rosa Díaz', description: '', lead_product_name: '', advisor_name: '', status: 'CANCELLED', pipeline_stage_id: 1 };
  const LP = [...L, PERDIDO_EN_1];
  assert.equal(filtrarLeads(L, {}, ETAPAS), L, 'sin filtro: la misma lista (estable para useMemo)');
  assert.equal(filtrarLeads(L, { q: '   ', etapa: 'all' }, ETAPAS), L);
  assert.deepEqual(ids(filtrarLeads(L, { q: 'ANA' }, ETAPAS)), [1], 'el cliente, sin mayúsculas');
  assert.deepEqual(ids(filtrarLeads(L, { q: 'perez' }, ETAPAS)), [1], 'sin tildes: «perez» encuentra «Pérez»');
  assert.deepEqual(ids(filtrarLeads(L, { q: 'cuna 3' }, ETAPAS)), [1], 'el producto');
  assert.deepEqual(ids(filtrarLeads(L, { q: 'quiere cuna' }, ETAPAS)), [1], 'la descripción, palabra por palabra');
  assert.deepEqual(ids(filtrarLeads(L, { q: 'ruiz' }, ETAPAS)), [2], 'el asesor');
  assert.deepEqual(ids(filtrarLeads(L, { q: '  andes ' }, ETAPAS)), [2], 'recortada, como q en el servidor');
  assert.deepEqual(ids(filtrarLeads(L, { etapa: '2' }, ETAPAS)), [2], 'la etapa del select');
  assert.deepEqual(ids(filtrarLeads(L, { etapa: 2 }, ETAPAS)), [2]);
  assert.deepEqual(ids(filtrarLeads(L, { etapa: '1' }, ETAPAS)), [1, 3],
    'el lead sin etapa está en la columna 1 (columnaDeLead): el filtro de esa etapa no lo quita de ahí');
  assert.deepEqual(ids(filtrarLeads(LP, { etapa: '4' }, ETAPAS)), [4], 'un perdido está en Perdido aunque su etapa sea otra');
  assert.deepEqual(ids(filtrarLeads(LP, { etapa: '1' }, ETAPAS)), [1, 3], 'y no en la de su pipeline_stage_id');
  assert.deepEqual(ids(filtrarLeads(L, { q: 'ana', etapa: '2' }, ETAPAS)), [], 'las dos a la vez');
  assert.deepEqual(filtrarLeads(null, { q: 'x' }, ETAPAS), []);
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
    // r1 (m15): un value que no es número no deja NaN en la suma.
    { id: 6, pipeline_stage_id: 2, status: 'QUOTATION' },
    { id: 7, value: 'abc', pipeline_stage_id: 2, status: 'QUOTATION' },
    // r1 (m18): un perdido con la etapa de otra columna suma en Perdido.
    { id: 8, value: 1000, pipeline_stage_id: 1, status: 'CANCELLED' },
  ];
  assert.deepEqual(sumaPorEtapa(S, ETAPAS), { 1: 1062523.4, 2: 500, 3: 0, 4: 1300 },
    'por la columna de cada lead (un lead sin etapa suma en la de su status; un perdido, en Perdido); una etapa vacía da 0');
  // r1 (I1): sin leads (cargando) no hay suma: nunca «$0» mientras carga.
  assert.equal(sumaPorEtapa(null, ETAPAS), null, 'sin leads no hay suma');
  assert.equal(sumaPorEtapa(undefined, ETAPAS), null);
  assert.equal(textoResumenEtapa('1', null), null, 'sin sumas, sin texto');
  assert.deepEqual(sumaPorEtapa(S, []), {});
  const sumas = sumaPorEtapa(S, ETAPAS);
  assert.equal(textoResumenEtapa('1', sumas), '$1.062.523', 'formatoPesos de lib/pesos.js');
  assert.equal(textoResumenEtapa('3', sumas), '$0');
  assert.equal(textoResumenEtapa('99', sumas), '$0');
  const perdidos = { items: Array.from({ length: 50 }, (_, i) => ({ id: 100 + i })), total: 120 };
  assert.equal(textoResumenEtapa('4', sumas, { clavePerdido: '4', perdidos }), '$1.300 en los 50 más recientes',
    'Perdido trae 50 de 120: la suma no es de todos');
  assert.equal(textoResumenEtapa('4', sumas, { clavePerdido: '4', perdidos: { items: [{ id: 1 }], total: 3 } }), '$1.300 en el más reciente');
  assert.equal(textoResumenEtapa('4', sumas, { clavePerdido: '4', perdidos: { items: [{ id: 1 }], total: 1 } }), '$1.300', 'completa');
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
  // r1 (m2): un lead cerrado (Ganado o Perdido) no está «Atrasado», lleve los días que lleve.
  assert.deepEqual(chipsDeLead({ status: 'CANCELLED', days: 40 }), [], 'Perdido no está atrasado');
  assert.deepEqual(chipsDeLead({ status: 'INVOICED', sc_id: 40, days: 40 }), [{ texto: 'Con solicitud', tono: 'indigo' }], 'Ganado tampoco');
  assert.deepEqual(chipsDeLead({ status: 'QUOTATION', days: 40 }), [{ texto: 'Atrasado', tono: 'rose' }]);
  assert.equal(esLeadAtrasadoAbierto({ status: 'DRAFT', days: 7 }), true);
  assert.equal(esLeadAtrasadoAbierto({ status: 'DRAFT', days: 6 }), false);
  assert.equal(esLeadAtrasadoAbierto({ status: 'INVOICED', days: 30 }), false);
  assert.equal(esLeadAtrasadoAbierto({ status: 'CANCELLED', days: 30 }), false);
  assert.equal(esLeadAtrasadoAbierto(null), false);

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

console.log('--- TEST 11: los textos de la vista Lista (días y vacío) ---');
{
  assert.equal(textoDiasLead({ days: 8 }), '8 días sin movimiento');
  assert.equal(textoDiasLead({ days: 1 }), '1 día sin movimiento', 'singular');
  assert.equal(textoDiasLead({ days: 0 }), 'Movido hoy');
  assert.equal(textoDiasLead({}), 'Movido hoy', 'sin days (sin updated_at) el servidor da 0');
  assert.equal(textoVacioLeads({}), 'No hay leads. Crea uno con «Nuevo Lead».');
  assert.equal(textoVacioLeads({ q: ' ', etapa: 'all' }), 'No hay leads. Crea uno con «Nuevo Lead».');
  assert.equal(textoVacioLeads({ q: 'ana' }), 'Ningún lead coincide con la búsqueda o la etapa elegida.');
  assert.equal(textoVacioLeads({ etapa: '3' }), 'Ningún lead coincide con la búsqueda o la etapa elegida.');
}

console.log('--- TEST 12 (T21 r1): columna del tablero, Lista con Perdido, estado de la carga, turno, total y campos ---');
{
  // m11 y m18: un perdido siempre va a Perdido; los demás, por columnaDeLead.
  assert.equal(columnaDelTablero({ status: 'CANCELLED', pipeline_stage_id: 1 }, ETAPAS), '4', 'perdido con otra etapa: Perdido');
  assert.equal(columnaDelTablero({ status: 'CANCELLED', pipeline_stage_id: 99 }, ETAPAS), '4');
  assert.equal(columnaDelTablero({ status: 'DRAFT', pipeline_stage_id: 2 }, ETAPAS), '2', 'un activo: su etapa');
  assert.equal(columnaDelTablero({ status: 'QUOTATION', pipeline_stage_id: null }, ETAPAS), '2', 'sin etapa: la de su status');
  assert.equal(columnaDelTablero({ status: 'CANCELLED', pipeline_stage_id: 1 }, ETAPAS.slice(0, 3)), '1',
    'sin etapa Perdido manda columnaDeLead (y leadsDelTablero ni siquiera los mete)');
  assert.equal(columnaDelTablero({ status: 'DRAFT' }, []), null);

  // I2: la Lista con la etapa Perdido pide los perdidos (get_leads excluye CANCELLED por defecto).
  assert.deepEqual(extraListaLeads('4', ETAPAS), { stage_id: '4', perdidos: 'solo' }, 'Perdido: perdidos=solo');
  assert.deepEqual(extraListaLeads('2', ETAPAS), { stage_id: '2', perdidos: null }, 'otra etapa: como siempre');
  assert.deepEqual(extraListaLeads('all', ETAPAS), { stage_id: null, perdidos: null }, 'todas: sin stage_id');
  assert.deepEqual(extraListaLeads('', ETAPAS), { stage_id: null, perdidos: null });
  assert.deepEqual(extraListaLeads(4, ETAPAS), { stage_id: '4', perdidos: 'solo' }, 'el id como número');
  assert.deepEqual(extraListaLeads('4', ETAPAS.slice(0, 3)), { stage_id: '4', perdidos: null }, 'sin etapa Perdido, nada');

  // m4, m9, m15 y m19: qué pinta la vista Kanban según la carga (lo atrasado de la página, ahora con sus casos).
  const base = { listo: true, etapasListas: true, errorEtapas: null, cargando: false, hayColumnas: true, leadsListos: true, errorLeads: null };
  assert.equal(vistaDelTablero(base), 'tablero');
  assert.equal(vistaDelTablero({ ...base, listo: false }), 'esqueleto', 'sin las preferencias');
  assert.equal(vistaDelTablero({ ...base, etapasListas: false, cargando: true }), 'esqueleto', 'sin etapas todavía');
  assert.equal(vistaDelTablero({ ...base, etapasListas: false, errorEtapas: new Error('x') }), 'error-etapas', 'sin etapas ni caché');
  assert.equal(vistaDelTablero({ ...base, etapasListas: false, errorEtapas: new Error('x'), cargando: true }), 'esqueleto', 'reintentando');
  assert.equal(vistaDelTablero({ ...base, hayColumnas: false }), 'sin-etapas');
  assert.equal(vistaDelTablero({ ...base, leadsListos: false, errorLeads: new Error('x') }), 'error-leads', 'fallaron los activos');
  assert.equal(vistaDelTablero({ ...base, leadsListos: false, cargando: true }), 'tablero', 'las columnas cargan solas');
  assert.equal(vistaDelTablero({ ...base, errorLeads: new Error('x') }), 'tablero', 'una recarga que falla no tapa lo que ya está');

  // m4, m9 y m19: si falla solo Perdido, su columna lo dice (con su Reintentar) y las demás siguen.
  const datos = { 1: { items: [{ id: 1 }], total: 1, cargando: false, error: null, hayMas: false }, 4: { items: [], total: 0, cargando: false, error: null, hayMas: false } };
  const err = Object.assign(new Error('Error del servidor'), { status: 500 });
  const conError = datosDelTablero(datos, '4', { error: err, cargando: false });
  assert.equal(conError[4].error, err);
  assert.equal(conError[4].cargaFallida, true);
  assert.equal(conError[1], datos[1], 'las demás columnas, iguales');
  const reintentando = datosDelTablero(datos, '4', { error: err, cargando: true });
  assert.deepEqual([reintentando[4].cargando, reintentando[4].error], [true, null], 'mientras reintenta, cargando y sin error');
  assert.equal(datosDelTablero(datos, '4', { error: null, cargando: false }), datos, 'sin falla: los mismos datos');
  assert.equal(datosDelTablero(datos, null, { error: err }), datos, 'sin columna Perdido');

  // m14: una carga vieja no pisa un cambio ni otra carga más nueva.
  assert.deepEqual(respuestaDeCarga({ turno: 3, ultimoTurno: 3, version: 5, versionActual: 5 }), { vigente: true, conLeads: true });
  assert.deepEqual(respuestaDeCarga({ turno: 2, ultimoTurno: 3, version: 5, versionActual: 5 }), { vigente: false, conLeads: false },
    'salió otra carga después: se descarta');
  assert.deepEqual(respuestaDeCarga({ turno: 3, ultimoTurno: 3, version: 5, versionActual: 6 }), { vigente: true, conLeads: false },
    'un lead cambió mientras iba (aplicarLead): las etapas sí, los leads no');

  // m21: el contador de la barra en Kanban suma lo que dicen las columnas (Perdido, su total real).
  const items = [
    { id: 1, status: 'DRAFT', pipeline_stage_id: 1 }, { id: 2, status: 'DRAFT', pipeline_stage_id: 1 },
    { id: 3, status: 'QUOTATION', pipeline_stage_id: null }, { id: 9, status: 'CANCELLED', pipeline_stage_id: 4 },
  ];
  assert.equal(totalDelTablero(items, ETAPAS, { 4: 60 }), 63, '3 activos + los 60 de Perdido');
  assert.equal(totalDelTablero(items, ETAPAS, undefined), 4, 'con filtro (sin totales): lo que se ve');
  assert.equal(totalDelTablero(null, ETAPAS, { 4: 60 }), null, 'mientras cargan: sin número');

  // m22: lo que guarda el panel de /config no entra en las etapas del tablero.
  assert.deepEqual(camposDeEtapa({
    id: 1, name: 'Nuevo', color: 'bg-blue-500', bg_color: 'bg-blue-50', position: 0, maps_to_status: 'DRAFT',
    is_closed: true, alert_days: 3, alert_message: 'x', pipeline_name: 'Principal',
  }), { id: 1, name: 'Nuevo', color: 'bg-blue-500', bg_color: 'bg-blue-50', position: 0, maps_to_status: 'DRAFT' });
  assert.deepEqual(camposDeEtapa({ id: 2, name: 'X', is_closed: true }), { id: 2, name: 'X' });
  assert.deepEqual(camposDeEtapa(null), {});
}

console.log('--- TEST 13 (B4 T23B, KPI-otros punto 2; RP7): Seguimientos: etapas, vista, tarjetas pulsables, grupos y ficha del lead ---');
{
  // La forma real de GET /crm/leads (crm.py _lead_to_dict): client, value, phone, email, description, lead_product_name,
  // advisor_name, days, status, pipeline_stage_id, updated_at (sin zona).
  const lead = (id, etapa, extra = {}) => ({
    id, client: `Cliente ${id}`, customer_id: id, contact: '3001112233', email: `c${id}@x.co`, phone: '3001112233', city: 'Cali',
    value: 0, description: '', status: 'DRAFT', pipeline_stage_id: etapa, days: 0, lead_product_name: '', advisor_name: '',
    updated_at: '2026-11-01T10:00:00', sc_id: null, ...extra,
  });
  const LEADS = [
    lead(1, 1, { client: 'Ana Pérez', days: 2 }), lead(2, 1, { client: 'Beatriz Gómez', days: 9 }),
    lead(3, 2, { client: 'Carlos Ruiz', status: 'QUOTATION', days: 10, value: 1500000, lead_product_name: 'Cuna' }),
    lead(4, 3, { client: 'Dora Gil', status: 'INVOICED', days: 30 }),
    lead(5, null, { client: 'Eva Soto', status: 'QUOTATION', days: 1 }),
  ];

  // etapasDeSeguimiento: todas menos Perdido (GET /crm/leads deja fuera los CANCELLED: una columna Perdido saldría siempre vacía).
  assert.deepEqual(etapasDeSeguimiento(ETAPAS).map((e) => e.name), ['Nuevo', 'Cotización', 'Ganado']);
  assert.deepEqual(etapasDeSeguimiento({ status: 'success', data: ETAPAS }).map((e) => e.id), [1, 2, 3], 'también la respuesta entera');
  assert.deepEqual(etapasDeSeguimiento(null), []);

  // filtrarSeguimiento: la MISMA vista para las tarjetas, las pastillas y los grupos: la búsqueda (filtrarLeads) y la etapa.
  assert.deepEqual(filtrarSeguimiento(LEADS, ETAPAS, {}).map((l) => l.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(filtrarSeguimiento(LEADS, ETAPAS, { etapa: '1' }).map((l) => l.id), [1, 2]);
  // El lead sin etapa va a la columna de su status (Cotización), como en el tablero.
  assert.deepEqual(filtrarSeguimiento(LEADS, ETAPAS, { etapa: '2' }).map((l) => l.id), [3, 5]);
  assert.deepEqual(filtrarSeguimiento(LEADS, ETAPAS, { q: 'carlos' }).map((l) => l.id), [3]);
  assert.deepEqual(filtrarSeguimiento(LEADS, ETAPAS, { q: 'CUNA', etapa: '2' }).map((l) => l.id), [3], 'busca en el producto, sin mayúsculas');
  assert.deepEqual(filtrarSeguimiento(LEADS, ETAPAS, { etapa: 'all' }).map((l) => l.id), [1, 2, 3, 4, 5]);
  // Un lead metido en la etapa Perdido sin ser CANCELLED no tiene grupo en Seguimientos: no cuenta (el número es el de lo que se ve).
  assert.deepEqual(filtrarSeguimiento([lead(9, 4)], ETAPAS, {}), []);
  assert.deepEqual(filtrarSeguimiento(null, ETAPAS, {}), [], 'sin leads, nada');

  // tarjetasSeguimientos: las 3 primeras etapas (color con acentoDesdeClase, número de la MISMA vista que abren) + el total.
  const t = tarjetasSeguimientos(LEADS, ETAPAS, {});
  assert.deepEqual(t.etapas, [
    { clave: '1', nombre: 'Nuevo', acento: 'blue', valor: 2, activa: false },
    { clave: '2', nombre: 'Cotización', acento: 'amber', valor: 2, activa: false },
    { clave: '3', nombre: 'Ganado', acento: 'emerald', valor: 1, activa: false },
  ]);
  // Atrasado y abierto: days >= 7 y ni Ganado ni Perdido (Beatriz 9 y Carlos 10; Dora, ganada con 30 días, no).
  assert.deepEqual(t.total, { valor: 5, urgentes: 2, ayuda: '2 con 7 días o más sin actividad', activa: true });
  // La búsqueda cambia los números de las tarjetas: cada una dice lo que abre.
  const buscada = tarjetasSeguimientos(LEADS, ETAPAS, { q: 'cuna' });
  assert.deepEqual(buscada.etapas.map((e) => e.valor), [0, 1, 0]);
  assert.deepEqual(buscada.total, { valor: 1, urgentes: 1, ayuda: '1 con 7 días o más sin actividad', activa: true });
  // La etapa elegida queda activa; el total ya no.
  const elegida = tarjetasSeguimientos(LEADS, ETAPAS, { etapa: '2' });
  assert.deepEqual(elegida.etapas.map((e) => e.activa), [false, true, false]);
  assert.equal(elegida.total.activa, false);
  assert.equal(elegida.total.valor, 5, 'el total es el de «Todas»: lo que abre la tarjeta, no la etapa elegida');
  // Mientras cargan (null): nada, ni 0 (la pantalla pinta la barra gris).
  assert.equal(tarjetasSeguimientos(null, ETAPAS, {}), null);
  // Sin leads reales: ceros de verdad. Con una etapa de color raro: indigo.
  assert.deepEqual(tarjetasSeguimientos([], ETAPAS, {}).etapas.map((e) => e.valor), [0, 0, 0]);
  assert.equal(tarjetasSeguimientos([], [{ id: 7, name: 'X', color: '#abc' }], {}).etapas[0].acento, 'indigo');
  assert.deepEqual(tarjetasSeguimientos([], [], {}).etapas, [], 'sin etapas, sin tarjetas de etapa');
  // Ayuda con 0.
  assert.equal(tarjetasSeguimientos([lead(1, 1)], ETAPAS, {}).total.ayuda, '0 con 7 días o más sin actividad');

  // gruposDeSeguimiento: un grupo por etapa visible con su hex y sus leads; con una etapa elegida, solo esa.
  const g = gruposDeSeguimiento(LEADS, ETAPAS, {});
  assert.deepEqual(g.map((x) => [x.clave, x.nombre, x.colorHex, x.leads.map((l) => l.id)]), [
    ['1', 'Nuevo', '#3b82f6', [1, 2]], ['2', 'Cotización', '#f59e0b', [3, 5]], ['3', 'Ganado', '#10b981', [4]],
  ]);
  assert.deepEqual(gruposDeSeguimiento(LEADS, ETAPAS, { etapa: '2' }).map((x) => x.clave), ['2']);
  assert.deepEqual(gruposDeSeguimiento(LEADS, ETAPAS, { q: 'zzz' }).map((x) => x.leads.length), [0, 0, 0], 'todas las etapas, vacías');
  assert.deepEqual(gruposDeSeguimiento(null, ETAPAS, {}), []);

  // fichaDeLeadSeguimiento: SOLO las claves que manda el servidor (client, value, phone, email, lead_product_name, advisor_name).
  const f = fichaDeLeadSeguimiento(LEADS[2]);
  assert.equal(f.nombre, 'Carlos Ruiz');
  assert.equal(f.producto, 'Cuna');
  assert.equal(f.valor, '$1.500.000');
  assert.equal(f.telefono, '3001112233');
  assert.equal(f.correo, 'c3@x.co');
  assert.equal(f.diasTexto, '10 días sin movimiento');
  assert.equal(f.atrasado, true);
  assert.equal(fichaDeLeadSeguimiento(lead(8, 1, { client: '  ', value: 0, phone: null, email: null })).nombre, 'Sin nombre');
  assert.equal(fichaDeLeadSeguimiento(lead(8, 1, { value: 0 })).valor, null, 'sin valor, sin pastilla de dinero');
  assert.equal(fichaDeLeadSeguimiento(lead(8, 1, { phone: null })).telefono, null);
  assert.equal(fichaDeLeadSeguimiento(lead(8, 1, { updated_at: null })).hace, 'Sin actividad');
  assert.equal(fichaDeLeadSeguimiento(lead(8, 1, { days: 40, status: 'INVOICED' })).atrasado, false, 'un lead ganado no está atrasado');
  // El texto de «hace»: el instante sin zona es UTC (hace() de fechas-colombia), no hora local.
  const hace3h = new Date(Date.now() - 3 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, '');
  assert.equal(fichaDeLeadSeguimiento(lead(8, 1, { updated_at: hace3h })).hace, 'hace 3 horas');
  assert.equal(fichaDeLeadSeguimiento(null).nombre, 'Sin nombre');
}

console.log('--- TEST 14 (B4 T23B; RP7): datosDeSeguimiento: lo que llega de /crm/leads y /crm/pipeline-stages ---');
{
  const { datosDeSeguimiento } = await import('../src/lib/crm-etapas.js');
  const L = [{ id: 1 }, { id: 2 }];
  // El API responde {status, data, total} (crm.py): se lee `data` (antes la pantalla leía `leads` y `stages`, y salía vacía).
  assert.deepEqual(datosDeSeguimiento({ status: 'success', data: L, total: 40 }, { status: 'success', data: ETAPAS }), { leads: L, stages: ETAPAS, total: 40 });
  // Una lista tal cual (como lee crm/page.tsx) también; sin `total`, la cantidad que llegó.
  assert.deepEqual(datosDeSeguimiento(L, ETAPAS), { leads: L, stages: ETAPAS, total: 2 });
  assert.equal(datosDeSeguimiento({ data: L }, { data: [] }).total, 2);
  // `total` nunca es menor que lo que llegó ni un valor que no es número.
  assert.equal(datosDeSeguimiento({ data: L, total: 1 }, { data: [] }).total, 2);
  assert.equal(datosDeSeguimiento({ data: L, total: 'x' }, { data: [] }).total, 2);
  // Sin `data` es un ERROR (no un «sin leads» falso): lanza, y la pantalla lo dice con «Reintentar».
  for (const mala of [null, undefined, {}, { status: 'success' }, { data: null }, { data: 'x' }, { data: { a: 1 } }, 7]) {
    assert.throws(() => datosDeSeguimiento(mala, { data: [] }), /El servidor no devolvió datos\./, JSON.stringify(mala));
    assert.throws(() => datosDeSeguimiento({ data: L }, mala), /El servidor no devolvió datos\./, JSON.stringify(mala));
  }
}

console.log('--- TEST 15 (B4 T23B r1; I3, I4, m20, m23, m24, m30): las 3 PRIMERAS etapas, sus colores, el valor «all», la ficha y qué se pinta ---');
{
  const lead = (id, etapa, extra = {}) => ({ id, client: `Cliente ${id}`, value: 0, status: 'DRAFT', pipeline_stage_id: etapa, days: 0, updated_at: '2026-11-01T10:00:00', ...extra });
  // Cuatro etapas abiertas (+ Ganado y Perdido): «las 3 primeras» y «las 3 últimas» ya no dan lo mismo (I4). El color y el fondo son de
  // familias distintas en Cotización: el acento sale del COLOR, no del fondo (m20).
  const E5 = [
    ETAPAS[0],
    { id: 2, name: 'Cotización', color: 'bg-amber-500', bg_color: 'bg-slate-50', position: 1, maps_to_status: 'QUOTATION' },
    { id: 5, name: 'Seguimiento', color: 'bg-purple-500', bg_color: 'bg-purple-50', position: 2.5 },
    ETAPAS[2], ETAPAS[3],
  ];
  const L = [lead(1, 1), lead(2, 2), lead(3, 5), lead(4, 3, { status: 'INVOICED' })];
  const t = tarjetasSeguimientos(L, E5, {});
  assert.deepEqual(t.etapas.map((e) => e.nombre), ['Nuevo', 'Cotización', 'Seguimiento'], 'exactamente las 3 primeras, en orden');
  assert.deepEqual(t.etapas.map((e) => e.acento), ['blue', 'amber', 'purple'], 'el acento sale del color de la etapa');
  assert.deepEqual(t.etapas.map((e) => e.valor), [1, 1, 1]);
  // El nombre vacío cae en «Etapa N» (m24).
  assert.equal(tarjetasSeguimientos([], [{ id: 7, name: '  ', color: 'bg-blue-500' }], {}).etapas[0].nombre, 'Etapa 7');
  // 'all' es lo que manda la página (activeStage = 'all'): el total queda activo y los grupos son todos (m30).
  const todo = tarjetasSeguimientos(L, E5, { etapa: 'all' });
  assert.equal(todo.total.activa, true);
  assert.deepEqual(todo.etapas.map((e) => e.activa), [false, false, false]);
  assert.deepEqual(gruposDeSeguimiento(L, E5, { etapa: 'all' }).map((g) => [g.clave, g.leads.map((l) => l.id)]), [['1', [1]], ['2', [2]], ['5', [3]], ['3', [4]]]);
  assert.deepEqual(gruposDeSeguimiento(L, E5, { etapa: '5' }).map((g) => g.clave), ['5']);
  // La ficha trae el asesor y la descripción (m23).
  const f = fichaDeLeadSeguimiento(lead(9, 1, { advisor_name: 'Camila Ruiz', description: 'Quiere entrega rápida' }));
  assert.equal(f.asesor, 'Camila Ruiz');
  assert.equal(f.descripcion, 'Quiere entrega rápida');

  // vistaSeguimiento (I3: cargando contra vacío): qué se pinta según lo que llegó, el aviso y la vista filtrada.
  const { vistaSeguimiento } = await import('../src/lib/crm-etapas.js');
  const aviso = { tipo: 'carga', texto: 'x', reintentar: true };
  assert.equal(vistaSeguimiento(null, null), 'esqueleto', 'sin leads ni error: se espera, no «vacío»');
  assert.equal(vistaSeguimiento(null, aviso), 'aviso', 'sin leads y con error: el aviso, no «vacío» ni el esqueleto');
  assert.equal(vistaSeguimiento([], null), 'vacio', 'una lista vacía de verdad');
  assert.equal(vistaSeguimiento(L, null), 'grupos');
  assert.equal(vistaSeguimiento(L, aviso), 'grupos', 'con datos, un error de recarga no tapa la lista');
  assert.equal(vistaSeguimiento(L, null, []), 'vacio', 'hay leads pero la búsqueda no encuentra ninguno');
  assert.equal(vistaSeguimiento(L, null, [L[0]]), 'grupos');
  assert.equal(vistaSeguimiento(undefined, null), 'esqueleto');
}

console.log('--- TEST 16 (B4 T24, FINAL-m37 y F96): la sonda de cableado del CRM — pide y ofrece solo lo que el rol puede (accesoCrm) ---');
{
  const { readFileSync } = await import('node:fs');
  const fuente = readFileSync(new URL('../src/app/dashboard/crm/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const c = fuente.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // El rol después de montar (useRolActual, fuera del inicializador de useState) y el acceso de lib/roles.js (casos en test_roles.mjs).
  assert.match(c, /import \{ useRolActual \} from '@\/components\/ui\/useRolActual';/);
  assert.match(c, /import \{ accesoCrm, TEXTO_SIN_LEADS \} from '@\/lib\/roles';/);
  assert.match(c, /const rol = useRolActual\(\);\s*const acceso = accesoCrm\(rol\);/);
  assert.ok(!/useState\([^)]*useRolActual|esAdmin\(|esAdminOAsesor\(|'ADMIN'|'ASESOR'/.test(c), 'la pantalla no decide el rol a mano');
  // Al montar: sin leads no se pide nada; /crm/warmup (solo ADMIN) solo con acceso.warmup.
  assert.match(c, /useEffect\(\(\) => \{\s*if \(!acceso\.leads\) return;\s*if \(acceso\.warmup\) apiFetch\('\/crm\/warmup'\)\.catch\(\(\) => \{\}\);\s*loadAll\(true, \{ inicial: true \}\);\s*\}, \[loadAll, acceso\.leads, acceso\.warmup\]\);/);
  assert.equal((c.match(/'\/crm\/warmup'/g) ?? []).length, 1, 'un solo warmup');
  // La Lista y el tablero no piden sin permiso; con el rol vacío, esperan.
  assert.match(c, /esperar: !listo \|\| !acceso\.listo, despachar, activo: estado\.modo === 'lista' && !enAnalisis && acceso\.leads,/);
  assert.match(c, /activo: listo && acceso\.leads && estado\.modo === 'kanban' && !enAnalisis,/);
  // El texto neutro (igual que Seguimientos) en lugar de la barra, la Lista, el tablero y el Análisis.
  // r1 (m30): el texto, una sola vez en lib/roles.js (lo usan el CRM y Seguimientos); la caja, el token CAJA_SIN_PERMISO.
  assert.ok(!/const TEXTO_SIN_LEADS =/.test(c), 'sin copia local del texto');
  assert.match(c, /\{acceso\.listo && !acceso\.leads && \(\s*<p role="status"[^>]*>\{TEXTO_SIN_LEADS\}<\/p>\s*\)\}/);
  assert.match(c, /\{acceso\.leads && !enAnalisis && \(/);
  assert.match(c, /\{acceso\.leads && enAnalisis && \(/);
  // Las altas, «Configurar CRM» y «Borrar» solo con su permiso (F96: delete_lead y /pipeline-stages/config son de ADMIN).
  assert.match(c, /actions=\{acceso\.leads \? \(/);
  assert.match(c, /\{acceso\.config && \(\s*<button onClick=\{openConfig\}/);
  assert.match(c, /\{acceso\.crear && <Button color="indigo" icon=\{Plus\} onClick=\{\(\) => setShowNewLead\(true\)\}>Nuevo Lead<\/Button>\}/);
  assert.match(c, /pieColumna=\{acceso\.crear \? \(clave\) => \(/);
  assert.match(c, /\{ etiqueta: 'Borrar', icono: Trash2, peligro: true, oculto: !puedeBorrar, onClick: \(\) => borrar\(lead\) \},/);
  assert.match(c, /<AccionesLead\.Provider value=\{\{ abrir: openDetail, borrar: handleDeleteLead, puedeBorrar: acceso\.borrar \}\}>/);
  assert.match(c, /\{ etiqueta: 'Borrar', icono: Trash2, peligro: true, oculto: !acceso\.borrar, onClick: \(\) => handleDeleteLead\(lead\) \},/);
  assert.match(c, /\{acceso\.borrar && \(\s*<button onClick=\{\(\) => handleDeleteLead\(selectedLead\)\}/, '«Eliminar Lead» del panel, solo con permiso');
  assert.equal((c.match(/handleDeleteLead\(/g) ?? []).length, 3, 'la Lista, el tablero y el panel: los tres miran acceso.borrar');
  // ErrorCarga: «Reintentar» solo si el error lo permite (un 403 no; ofreceReintentar = avisoDeFuente(...).reintentar).
  assert.match(c, /\{onReintentar && \(\s*<button type="button" onClick=\{onReintentar\}/);
  assert.match(c, /<ErrorCarga texto=\{textoDeError\(errorEtapas, 'No se pudieron cargar las etapas del CRM'\)\} onReintentar=\{ofreceReintentar\(errorEtapas\) \? \(\) => loadAll\(\) : undefined\}\/>/);
  assert.match(c, /<ErrorCarga texto=\{textoDeError\(errorLeads, 'No se pudieron cargar los leads'\)\} onReintentar=\{ofreceReintentar\(errorLeads\) \? \(\) => loadAll\(\) : undefined\}\/>/);
  // r1 (m1, m5, m43): sin permiso, el encabezado no dice «Cargando leads…» (loadAll no corre): sin subtítulo.
  assert.match(c, /subtitle=\{acceso\.listo && !acceso\.leads \? undefined\s*: leadsListos \? `\$\{leads\.length\} leads · \$\{formatoPesos\(totalValue\)\} en pipeline`\s*: errorLeads \? 'No se pudieron cargar los leads' : 'Cargando leads…'\}/);
  // r1 (m9 a): con el rol vacío (la hidratación), el esqueleto del tablero, no la pantalla en blanco.
  assert.match(c, /\{!acceso\.listo && \(\s*<div className="flex-1 min-h-0 overflow-hidden p-5">\s*<EsqueletoTablero\/>\s*<\/div>\s*\)\}/);
  // r1 (m6, m31): los dos «Reintentar» del aviso del tablero, solo si el error lo permite (un 403, no).
  assert.match(c, /\{textoDeError\(fallo, 'No se pudo actualizar el CRM'\)\}\s*\{ofreceReintentar\(fallo\) && \(\s*<>\{' '\}<button type="button" onClick=\{\(\) => loadAll\(\)\}/);
  assert.match(c, /\{textoDeError\(errorPerdidos, 'No se pudo cargar la columna Perdido'\)\}\s*\{ofreceReintentar\(errorPerdidos\) && \(\s*<>\{' '\}<button type="button" onClick=\{cargarPerdidos\}/);
  assert.equal((c.match(/>Reintentar<\/button>/g) ?? []).length, 2, 'los dos del aviso, los dos con su guarda (ErrorCarga pinta el suyo con onReintentar)');
  // r1 (m30): Seguimientos usa el mismo texto de la lib; las cajas neutras de f1, el token.
  const { TEXTO_SIN_LEADS, accesoCrm } = await import('../src/lib/roles.js');
  assert.equal(TEXTO_SIN_LEADS, 'Tu rol no ve los leads del CRM.');
  assert.equal(typeof accesoCrm, 'function');
  const leerSrc = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const ds = leerSrc('lib/design-system.ts');
  assert.match(ds, /export const CAJA_SIN_PERMISO = 'rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-600';/);
  const seg = leerSrc('app/dashboard/crm/calendario/page.tsx');
  assert.match(seg, /import \{[^}]*\bTEXTO_SIN_LEADS\b[^}]*\} from '@\/lib\/roles';/);
  assert.ok(!/const TEXTO_SIN_LEADS =/.test(seg), 'Seguimientos: sin copia local');
  const CAJAS = {'app/dashboard/crm/page.tsx': 'm-5 ', 'app/dashboard/crm/calendario/page.tsx': '', 'app/dashboard/finanzas/gastos/page.tsx': '', 'app/dashboard/ecommerce/page.tsx': '', 'app/dashboard/marketing/campanas/page.tsx': 'm-6 '};
  for (const [ruta, margen] of Object.entries(CAJAS)) {
    const f = leerSrc(ruta);
    assert.ok(f.includes(`<p role="status" className={\`${margen}\${CAJA_SIN_PERMISO}\`}>`), `${ruta}: la caja con el token`);
    assert.ok(!f.includes('rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-600'), `${ruta}: sin la copia de la caja`);
    assert.match(f, /import \{[^}]*\bCAJA_SIN_PERMISO\b[^}]*\} from '@\/lib\/design-system';/, `${ruta}: importa el token`);
  }
}

console.log('OK test_crm_etapas');
