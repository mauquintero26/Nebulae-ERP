/**
 * frontend/tests/test_transito.mjs
 * Bloque 4, T3C (KANBAN-logistica punto 1, R11, RP76): el tablero de Mercancía en tránsito (lib/transito.js). Las
 * columnas salen de GET /compras/tracking-config (las etapas de los dos tipos de envío, unidas en orden), cada pedido
 * está en la etapa que le falta completar y solo se arrastra a la etapa siguiente (equivale a «Completar»).
 */

import assert from 'node:assert/strict';
import { columnasDeEtapas, etapaActual, columnaTransito, reglaSoltarTransito } from '../src/lib/transito.js';
import { mapaDestinos } from '../src/lib/kanban.js';

// La configuración por defecto (DEFAULT_TRACKING_STAGES de backend/app/api/v1/erp_compras.py).
const CONFIG = {
  casillero: [
    { key: 'PENDIENTE_DESPACHO', label: 'Pendiente Despacho Proveedor', active: true },
    { key: 'PROVEEDOR_CASILLERO', label: 'Proveedor -> Casillero', active: true },
    { key: 'CASILLERO_BODEGA', label: 'Casillero -> Bodega Nebulae', active: true },
    { key: 'RECIBIDO', label: 'Recibido', active: true },
  ],
  directo: [
    { key: 'PENDIENTE_DESPACHO', label: 'Pendiente Despacho Proveedor', active: true },
    { key: 'PROVEEDOR_BODEGA', label: 'Proveedor -> Bodega Nebulae', active: true },
    { key: 'RECIBIDO', label: 'Recibido', active: true },
  ],
};
const COLUMNAS = columnasDeEtapas(CONFIG);

/** Un PEC con las etapas de su tipo de envío (como create_pec) y las primeras `hechas` completadas. */
function pec(tipo, hechas, extra = {}) {
  const etapas = CONFIG[tipo].map((s, i) => ({ stage: s.key, label: s.label, status: i < hechas ? 'COMPLETADO' : 'PENDIENTE' }));
  return { id: 3, numero: 'PEC-3', tipo_envio: tipo, tracking_stages: etapas, ...extra };
}

console.log('--- TEST 1: columnasDeEtapas une los dos envíos en orden (RP76) ---');
{
  assert.deepEqual(COLUMNAS.map((c) => c.clave),
    ['PENDIENTE_DESPACHO', 'PROVEEDOR_CASILLERO', 'CASILLERO_BODEGA', 'PROVEEDOR_BODEGA', 'RECIBIDO']);
  assert.deepEqual(COLUMNAS.map((c) => c.titulo), [
    'Pendiente Despacho Proveedor', 'Proveedor → Casillero', 'Casillero → Bodega Nebulae', 'Proveedor → Bodega Nebulae', 'Recibido',
  ], 'el título es el label de la primera configuración que la tiene, con → en vez de ->');
  assert.ok(Object.isFrozen(COLUMNAS) && COLUMNAS.every((c) => c.cerrada === false));
  // Las inactivas quedan fuera; acepta también la respuesta {status, data}.
  const conInactiva = {
    ...CONFIG, casillero: CONFIG.casillero.map((s) => (s.key === 'CASILLERO_BODEGA' ? { ...s, active: false } : s)),
  };
  assert.deepEqual(columnasDeEtapas({ status: 'success', data: conInactiva }).map((c) => c.clave),
    ['PENDIENTE_DESPACHO', 'PROVEEDOR_CASILLERO', 'PROVEEDOR_BODEGA', 'RECIBIDO']);
  // Una etapa de directo que no comparte nada más adelante va al final.
  const otra = { casillero: CONFIG.casillero, directo: [...CONFIG.directo, { key: 'ENTREGA_FINAL', label: 'Entrega final' }] };
  assert.deepEqual(columnasDeEtapas(otra).map((c) => c.clave).slice(-2), ['RECIBIDO', 'ENTREGA_FINAL']);
  // Sin configuración no hay columnas (la pantalla avisa); un PEC viejo con una etapa que ya no está suma su columna al final.
  assert.deepEqual(columnasDeEtapas(null), []);
  const viejo = { id: 8, tracking_stages: [{ stage: 'ADUANA', label: 'Aduana -> Bodega', status: 'PENDIENTE' }] };
  const conViejo = columnasDeEtapas(CONFIG, { pedidos: [viejo, pec('casillero', 1)] });
  assert.deepEqual(conViejo.map((c) => c.clave).slice(-2), ['RECIBIDO', 'ADUANA']);
  assert.equal(conViejo.at(-1).titulo, 'Aduana → Bodega');
  assert.equal(conViejo.length, 6);
}

console.log('--- TEST 2: etapaActual y columnaTransito ---');
{
  assert.equal(etapaActual(pec('casillero', 1)).stage, 'PROVEEDOR_CASILLERO');
  assert.equal(columnaTransito(pec('casillero', 1)), 'PROVEEDOR_CASILLERO');
  assert.equal(columnaTransito(pec('directo', 0)), 'PENDIENTE_DESPACHO');
  assert.equal(etapaActual(pec('casillero', 4)), null, 'todas completadas');
  assert.equal(columnaTransito(pec('casillero', 4)), null);
  assert.equal(etapaActual({ tracking_stages: null }), null);
  assert.equal(etapaActual({ tracking_stages: [null, 'x', { stage: 'A', status: 'EN_PROCESO' }] }).stage, 'A');
}

console.log('--- TEST 3: reglaSoltarTransito: solo la etapa siguiente ---');
{
  const soltar = (p, destino) => reglaSoltarTransito(p, columnaTransito(p), destino, { columnas: COLUMNAS });
  // Casillero en PROVEEDOR_CASILLERO → la siguiente: completa la actual.
  assert.deepEqual(soltar(pec('casillero', 1), 'CASILLERO_BODEGA'),
    { tipo: 'cambio', estado: 'COMPLETADO', cuerpo: { stage: 'PROVEEDOR_CASILLERO' } });
  assert.deepEqual(soltar(pec('casillero', 1), 'RECIBIDO'),
    { tipo: 'bloqueado', motivo: 'Las etapas se completan en orden: primero «Casillero → Bodega Nebulae».' });
  assert.deepEqual(soltar(pec('directo', 1), 'CASILLERO_BODEGA'),
    { tipo: 'bloqueado', motivo: 'Este pedido va por envío directo: no pasa por «Casillero → Bodega Nebulae».' });
  assert.deepEqual(soltar(pec('casillero', 1), 'PROVEEDOR_BODEGA'),
    { tipo: 'bloqueado', motivo: 'Este pedido va por envío casillero: no pasa por «Proveedor → Bodega Nebulae».' });
  assert.deepEqual(soltar(pec('casillero', 2), 'PENDIENTE_DESPACHO'),
    { tipo: 'bloqueado', motivo: 'Una etapa completada no se deshace desde aquí.' });
  assert.deepEqual(soltar(pec('directo', 1), 'RECIBIDO'),
    { tipo: 'cambio', estado: 'COMPLETADO', cuerpo: { stage: 'PROVEEDOR_BODEGA' } }, 'directo: de Proveedor → Bodega a Recibido');
  // Ya en Recibido (la etapa final): se confirma en Recepciones.
  const RECEPCIONES = { texto: 'Ir a Recepciones', href: '/dashboard/compras/recepciones' };
  for (const destino of ['PENDIENTE_DESPACHO', 'CASILLERO_BODEGA']) {
    assert.deepEqual(soltar(pec('casillero', 3), destino),
      { tipo: 'bloqueado', motivo: 'Ya llegó: confírmalo en Recepciones.', enlace: RECEPCIONES }, destino);
  }
  // Sin la opción columnas, el título sale de la etapa del pedido o humanizado.
  assert.deepEqual(reglaSoltarTransito(pec('directo', 1), 'PROVEEDOR_BODEGA', 'CASILLERO_BODEGA'),
    { tipo: 'bloqueado', motivo: 'Este pedido va por envío directo: no pasa por «Casillero bodega».' });
  assert.deepEqual(reglaSoltarTransito(pec('casillero', 0), 'PENDIENTE_DESPACHO', 'CASILLERO_BODEGA'),
    { tipo: 'bloqueado', motivo: 'Las etapas se completan en orden: primero «Proveedor → Casillero».' });
  assert.deepEqual(soltar(pec('casillero', 1), 'PROVEEDOR_CASILLERO'), { tipo: 'ninguno' });
  // Un envío sin tipo_envio es por casillero (como el servidor).
  assert.deepEqual(soltar({ ...pec('casillero', 1), tipo_envio: null }, 'PROVEEDOR_BODEGA').motivo,
    'Este pedido va por envío casillero: no pasa por «Proveedor → Bodega Nebulae».');
  // Todas las combinaciones tienen la forma de kanban.js.
  for (const tipo of ['casillero', 'directo']) {
    for (let hechas = 0; hechas < CONFIG[tipo].length; hechas += 1) {
      const p = pec(tipo, hechas);
      mapaDestinos(p, columnaTransito(p), COLUMNAS, (x, o, d) => reglaSoltarTransito(x, o, d, { columnas: COLUMNAS }));
    }
  }
}

console.log('OK test_transito');
