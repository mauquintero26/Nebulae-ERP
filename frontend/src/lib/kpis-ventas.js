/**
 * La ficha del cliente de la Agenda (Bloque 4, T3C: KPI-otros punto 3; C4, C5, R27, RP70). JS plano, sin React ni DOM,
 * para probarlo con node (frontend/tests/test_kpis_ventas.mjs). Lo usa agenda/page.tsx (T23B) para su franja de
 * indicadores (pven_saldo_por_cobrar, cli_total_comprado, cli_total_pagado y cli_cot_abiertas de CATALOGO_KPI).
 *
 * Solo trae resumenFichaCliente (R27): sin predicados, resumenVentasLocal ni PREDICADOS_KPI_HUB. Las tarjetas de los
 * Hubs y las listas salen del servidor (/ventas/stats, con_resumen y con_conteos; C4, C5).
 */

import { esPedidoVigente } from './estados-pedido.js';
import { esSolicitudActiva } from './listas-ventas.js';
import { redondearPeso } from './pesos.js';

/**
 * @typedef {{sinPermiso: boolean, saldoPorCobrar: number | null, totalComprado: number | null, totalPagado: number | null,
 *   pedidos: number, cotizacionesAbiertas: number, solicitudesActivas: number}} ResumenFichaCliente
 */

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const filas = (v) => (Array.isArray(v) ? v.filter(esObjeto) : []);

/** Un monto del API (número o texto) en pesos enteros; lo que no es un número vale 0. */
function pesos(v) {
  const n = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN;
  return Number.isFinite(n) ? redondearPeso(n) : 0;
}

/**
 * Las cifras de la ficha del cliente con las claves reales de GET /crm/customers/{id}/profile-360 (el perfil, o la
 * respuesta {status, data}):
 *  - saldoPorCobrar, totalComprado y totalPagado: resumen_financiero.saldo_pendiente_cop, total_comprado_cop y
 *    total_pagado_cop, en pesos enteros. Si resumen_financiero es null (BODEGA o COMPRAS no ven montos), los tres van en
 *    null y sinPermiso es true: la pantalla pinta «—» con 'Sin permiso para ver montos';
 *  - pedidos: los pedidos que cuentan en el total comprado (todos menos los CANCELADO, como el servidor);
 *  - cotizacionesAbiertas: las que no están CONFIRMADA ni RECHAZADA (cli_cot_abiertas, RP70);
 *  - solicitudesActivas: las de la pestaña Activas de la lista (esSolicitudActiva: sin Soporte, Confirmadas ni
 *    Canceladas).
 * Un perfil vacío (o todavía sin cargar) da ceros.
 * @param {any} perfil360
 * @returns {ResumenFichaCliente}
 */
export function resumenFichaCliente(perfil360) {
  const envuelto = esObjeto(perfil360) && esObjeto(perfil360.data) && !('resumen_financiero' in perfil360);
  const perfil = envuelto ? perfil360.data : (esObjeto(perfil360) ? perfil360 : {});
  const sinPermiso = perfil.resumen_financiero === null;
  const financiero = esObjeto(perfil.resumen_financiero) ? perfil.resumen_financiero : {};
  return {
    sinPermiso,
    saldoPorCobrar: sinPermiso ? null : pesos(financiero.saldo_pendiente_cop),
    totalComprado: sinPermiso ? null : pesos(financiero.total_comprado_cop),
    totalPagado: sinPermiso ? null : pesos(financiero.total_pagado_cop),
    pedidos: filas(perfil.pedidos).filter((p) => esPedidoVigente(p.estado)).length,
    cotizacionesAbiertas: filas(perfil.cotizaciones).filter((c) => c.estado !== 'CONFIRMADA' && c.estado !== 'RECHAZADA').length,
    solicitudesActivas: filas(perfil.solicitudes).filter(esSolicitudActiva).length,
  };
}
