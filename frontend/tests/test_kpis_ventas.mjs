/**
 * frontend/tests/test_kpis_ventas.mjs
 * Bloque 4, T3C (KPI-otros punto 3, KPI-ventas; C4, C5, R27, RP70): resumenFichaCliente de lib/kpis-ventas.js, la
 * franja de la ficha del cliente de la Agenda con las claves reales de GET /crm/customers/{id}/profile-360
 * (resumen_financiero, pedidos, cotizaciones y solicitudes). Sin permiso (BODEGA o COMPRAS: resumen_financiero null)
 * los montos son null y la pantalla pinta «—»; un perfil vacío da ceros. kpis-ventas.js no trae predicados,
 * resumenVentasLocal ni PREDICADOS_KPI_HUB (C4, C5): solo resumenFichaCliente.
 */

import assert from 'node:assert/strict';
import * as kpisVentas from '../src/lib/kpis-ventas.js';
import { resumenFichaCliente } from '../src/lib/kpis-ventas.js';

// La forma real de profile-360 (crm.py: resumen_financiero con montos de 2 decimales; listas de {id, numero, estado}).
const PERFIL = {
  id: 31, first_name: 'Ana', ltv: '1500000.50',
  resumen_financiero: { total_comprado_cop: 1500000.5, total_pagado_cop: 600000, saldo_pendiente_cop: 900000.49, saldo_a_favor_cop: 0 },
  pedidos: [
    { id: 1, numero: 'PVEN-1', estado: 'EN_PROCESO', total_cop: 1000000, saldo_cop: 600000 },
    { id: 2, numero: 'PVEN-2', estado: 'CANCELADO', total_cop: 300000, saldo_cop: 300000 },
    { id: 3, numero: 'PVEN-3', estado: 'ENTREGADO', total_cop: 500000.5, saldo_cop: 300000.49 },
  ],
  cotizaciones: [
    { id: 1, estado: 'BORRADOR' }, { id: 2, estado: 'CONFIRMADA' }, { id: 3, estado: 'RECHAZADA' },
    { id: 4, estado: 'VENCIDA' }, { id: 5, estado: 'PENDIENTE_CONFIRMACION' }, { id: 6, estado: 'ENVIADA' },
  ],
  solicitudes: [
    { id: 1, estado: 'ASIGNADA' }, { id: 2, estado: 'CONFIRMADA' }, { id: 3, estado: 'CANCELADA' },
    { id: 4, estado: 'N/A_SOPORTE' }, { id: 5, estado: 'COTIZADA' }, { id: 6, estado: 'BORRADOR' },
  ],
};

console.log('--- TEST 1: solo resumenFichaCliente (C4, C5) ---');
{
  assert.deepEqual(Object.keys(kpisVentas), ['resumenFichaCliente']);
}

console.log('--- TEST 2: la forma real de profile-360 ---');
{
  assert.deepEqual(resumenFichaCliente(PERFIL), {
    sinPermiso: false,
    saldoPorCobrar: 900000,
    totalComprado: 1500001,
    totalPagado: 600000,
    pedidos: 2,
    cotizacionesAbiertas: 4,
    solicitudesActivas: 3,
  });
  assert.deepEqual(resumenFichaCliente({ status: 'success', data: PERFIL }), resumenFichaCliente(PERFIL), 'también la respuesta entera');
}

console.log('--- TEST 3: resumen_financiero null (BODEGA o COMPRAS) → sinPermiso ---');
{
  const bodega = { ...PERFIL, resumen_financiero: null, pedidos: PERFIL.pedidos.map((p) => ({ ...p, total_cop: null, saldo_cop: null })) };
  assert.deepEqual(resumenFichaCliente(bodega), {
    sinPermiso: true, saldoPorCobrar: null, totalComprado: null, totalPagado: null,
    pedidos: 2, cotizacionesAbiertas: 4, solicitudesActivas: 3,
  });
}

console.log('--- TEST 4: un perfil vacío da ceros ---');
{
  const ceros = { sinPermiso: false, saldoPorCobrar: 0, totalComprado: 0, totalPagado: 0, pedidos: 0, cotizacionesAbiertas: 0, solicitudesActivas: 0 };
  assert.deepEqual(resumenFichaCliente({}), ceros);
  assert.deepEqual(resumenFichaCliente(null), ceros, 'antes de cargar');
  assert.deepEqual(resumenFichaCliente(undefined), ceros);
  assert.deepEqual(resumenFichaCliente({ resumen_financiero: {}, pedidos: null, cotizaciones: 'x', solicitudes: [null] }), ceros);
  assert.deepEqual(resumenFichaCliente({ resumen_financiero: { saldo_pendiente_cop: '2500.6', total_comprado_cop: 'abc' } }),
    { ...ceros, saldoPorCobrar: 2501 }, 'el monto como texto y lo que no es número vale 0');
}

console.log('OK test_kpis_ventas');
