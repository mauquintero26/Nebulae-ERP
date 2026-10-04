/**
 * Reglas compartidas por las listas de Ventas (Solicitudes, Cotizaciones, Pedidos) y el Hub. JS plano para probarlo
 * con node (frontend/tests/test_listas_ventas.mjs), como busqueda.js y pricing.js.
 *
 *  - N8: diasAlerta, los dias de alerta guardados en Configuracion.
 *  - COT-LISTA: pedidoVigente / soloPedidosCancelados / pestanaCotizacion de una cotizacion (con su `pedidos_venta`
 *    ligero de la lista o completo del detalle). H46: ultimoPedidoCancelado.
 *  - H47: resumenPedidos / kpisPedidos de la lista de pedidos (el dinero no suma cancelados ni devueltos).
 *  - N10: opcionesFiltroEstado del filtro de estado de la lista de pedidos.
 */
import { ESTADOS_PEDIDO_CERRADOS, grupoPedido } from './estados-pedido.js';
import { redondearPeso } from './pesos.js';

/**
 * Dias de alerta de `clave` (alerta_sc_dias, alerta_cot_dias, alerta_ven_dias) en la configuracion. Acepta la
 * respuesta cruda de GET /ventas/config ({status, data: {clave: {value}}}), el dict interno ({clave: {value}}) y lo
 * que guarda el Hub tras "Guardar" ({clave: '3'}). Sin un numero valido mayor que 0 devuelve `porDefecto`.
 * @param {any} cfg
 * @param {string} clave
 * @param {number} [porDefecto]
 * @returns {number}
 */
export function diasAlerta(cfg, clave, porDefecto = 2) {
  const fuente = cfg && typeof cfg.data === 'object' && cfg.data !== null ? cfg.data : cfg;
  const crudo = fuente?.[clave];
  const n = Number(typeof crudo === 'object' && crudo ? crudo.value : crudo);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

const pedidosDe = (cot) => (Array.isArray(cot?.pedidos_venta) ? cot.pedidos_venta.filter((v) => v && typeof v === 'object') : []);

/** El primer pedido de la cotizacion que no esta CANCELADO, o null. */
export function pedidoVigente(cot) {
  return pedidosDe(cot).find((v) => v.estado !== 'CANCELADO') || null;
}

/** La cotizacion tuvo pedidos y todos estan CANCELADO (se puede ajustar y reenviar: cuenta como activa). */
export function soloPedidosCancelados(cot) {
  const pedidos = pedidosDe(cot);
  return pedidos.length > 0 && pedidos.every((v) => v.estado === 'CANCELADO');
}

/** H46: el pedido CANCELADO mas reciente de la cotizacion (el GET los trae por id, del mas viejo al mas nuevo), o null. */
export function ultimoPedidoCancelado(cot) {
  const cancelados = pedidosDe(cot).filter((v) => v.estado === 'CANCELADO');
  return cancelados.length > 0 ? cancelados[cancelados.length - 1] : null;
}

/**
 * H46 / N1: que toca con el pedido de una cotizacion. `confirmacion_vigente` (GET de la COT y filas de la lista) es la
 * confirmacion del cliente sin usar (gate2_confirmed_at): la pone el enlace en cada confirmacion y la consume la
 * conversion; sin ella el servidor no convierte.
 *  - 'pedido_vigente': ya tiene un pedido que no esta cancelado.
 *  - 'crear_pedido': CONFIRMADA sin pedido vigente. Incluye la re-confirmada por el cliente tras cancelar el pedido
 *    (flujo normal de H46: el pedido nuevo recibe el saldo a favor, R6).
 *  - 'reabrir': CONFIRMADA sin confirmacion vigente y con su ultimo pedido cancelado: dato antiguo, de antes de que la
 *    cancelacion devolviera sola la COT a Borrador. Hay que reabrirla y reenviarla.
 *  - null: cualquier otro estado.
 * `cancelado` es el ultimo pedido cancelado cuando no hay vigente; `avisoCancelado` dice si mostrar el aviso "Pedido X
 * cancelado: ajusta y reenvia" (no tiene sentido si el cliente ya la confirmo otra vez).
 * @returns {{paso: 'pedido_vigente' | 'crear_pedido' | 'reabrir' | null, vigente: any, cancelado: any, avisoCancelado: boolean}}
 */
export function situacionPedidoCotizacion(cot) {
  const vigente = pedidoVigente(cot);
  const cancelado = vigente ? null : ultimoPedidoCancelado(cot);
  const confirmacion = !!cot?.confirmacion_vigente;
  let paso = null;
  if (vigente) paso = 'pedido_vigente';
  else if (cot?.estado === 'CONFIRMADA') paso = !confirmacion && cancelado ? 'reabrir' : 'crear_pedido';
  return { paso, vigente, cancelado, avisoCancelado: !!cancelado && !confirmacion };
}

/**
 * COT-LISTA: pestaña de la lista de Cotizaciones. Una CONFIRMADA que hay que reabrir (pedido cancelado y sin
 * confirmacion vigente) vuelve a 'Activas'; las demas confirmadas son 'Confirmadas': con pedido vigente o por
 * convertir (tambien la re-confirmada por el cliente tras cancelar su pedido).
 * @returns {'Activas' | 'Confirmadas' | 'Rechazadas'}
 */
export function pestanaCotizacion(cot) {
  if (cot?.estado === 'RECHAZADA') return 'Rechazadas';
  if (cot?.estado === 'CONFIRMADA' && situacionPedidoCotizacion(cot).paso !== 'reabrir') return 'Confirmadas';
  return 'Activas';
}

// ─── H47: resumen de la lista de pedidos ────────────────────────────────────────────────────────────

/**
 * Pedidos cuyo dinero no cuenta (ni vendido ni por cobrar): espejo de ESTADOS_VEN_SIN_DINERO
 * (backend/app/core/estados_pedido.py), el mismo criterio del resumen de GET /ventas/pedidos. Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_PEDIDO_SIN_DINERO = Object.freeze(['CANCELADO', 'DEVUELTO_TOTAL']);

const esObjeto = (v) => v !== null && typeof v === 'object';

/** El pedido suma en los montos de la lista (no esta cancelado ni devuelto por completo). */
export function pedidoSumaDinero(p) {
  return esObjeto(p) && !ESTADOS_PEDIDO_SIN_DINERO.includes(p.estado);
}

/**
 * Resumen calculado en el navegador con la misma regla del servidor (si la respuesta no trae `resumen`): `total` y
 * `por_estado` cuentan todos los pedidos; monto, saldo y anticipo solo los que suman dinero, en pesos enteros. Las
 * lineas null o que no son objeto se ignoran.
 * @returns {{total: number, monto_cop: number, saldo_cop: number, anticipo_cop: number, por_estado: Record<string, number>}}
 */
export function resumenPedidos(pedidos) {
  const r = { total: 0, monto_cop: 0, saldo_cop: 0, anticipo_cop: 0, por_estado: {} };
  for (const p of Array.isArray(pedidos) ? pedidos : []) {
    if (!esObjeto(p)) continue;
    r.total += 1;
    r.por_estado[p.estado] = (r.por_estado[p.estado] || 0) + 1;
    if (!pedidoSumaDinero(p)) continue;
    r.monto_cop += Number(p.total_cop) || 0;
    r.saldo_cop += Number(p.saldo_cop) || 0;
    r.anticipo_cop += Number(p.anticipo_cop) || 0;
  }
  r.monto_cop = redondearPeso(r.monto_cop);
  r.saldo_cop = redondearPeso(r.saldo_cop);
  r.anticipo_cop = redondearPeso(r.anticipo_cop);
  return r;
}

/**
 * Cifras de las tarjetas de Pedidos de Venta: del resumen del servidor (todos los pedidos del filtro, sin el tope de
 * 200) o, si no vino, del navegador sobre los cargados. `activos` = total menos los cerrados (entregados, facturados,
 * cancelados y devueltos); `cargados` = cuantos trajo la lista.
 */
export function kpisPedidos(resumenServidor, pedidos) {
  const r = esObjeto(resumenServidor) ? resumenServidor : resumenPedidos(pedidos);
  const pe = esObjeto(r.por_estado) ? r.por_estado : {};
  const total = Number(r.total) || 0;
  const cerrados = ESTADOS_PEDIDO_CERRADOS.reduce((s, e) => s + (Number(pe[e]) || 0), 0);
  return {
    total,
    monto: Number(r.monto_cop) || 0,
    saldo: Number(r.saldo_cop) || 0,
    anticipo: Number(r.anticipo_cop) || 0,
    pCompra: Number(pe.PENDIENTE_COMPRA) || 0,
    // Los de la pestaña 'Cancelado' (cancelados y devueltos por completo).
    cancelados: Object.keys(pe).filter((e) => grupoPedido(e) === 'Cancelado').reduce((s, e) => s + (Number(pe[e]) || 0), 0),
    activos: Math.max(0, total - cerrados),
    cargados: Array.isArray(pedidos) ? pedidos.length : 0,
    porEstado: pe,
  };
}

/** Pista de la tarjeta 'Total Pedidos': '15 activos · 12 cancelados · se ven los 200 más recientes'. */
export function hintTotalPedidos(k) {
  return `${k.activos} activos`
    + (k.cancelados > 0 ? ` · ${k.cancelados} cancelados` : '')
    + (k.total > k.cargados ? ` · se ven los ${k.cargados} más recientes` : '');
}

// ─── N10: filtro de estado de la lista de pedidos ────────────────────────────────────────────────────

const FILTRO_ESTADOS_BASE = Object.freeze(['PENDIENTE_COMPRA', 'PENDIENTE_PAGO', 'EN_PROCESO', 'EN_TRANSITO',
  'LISTO_ENTREGA', 'ENTREGADO', 'FACTURADO', 'CANCELADO']);

/**
 * Estados que ofrece 'Filtrar Estado': los habituales y, al final, cualquier otro que traigan los pedidos cargados
 * (p. ej. PENDIENTE_SALDO de fase4), sin repetir. La pantalla los muestra con su etiqueta (infoEstadoPedido).
 * @returns {string[]}
 */
export function opcionesFiltroEstado(pedidos) {
  const opciones = [...FILTRO_ESTADOS_BASE];
  for (const p of Array.isArray(pedidos) ? pedidos : []) {
    const e = esObjeto(p) && typeof p.estado === 'string' ? p.estado.trim() : '';
    if (e && !opciones.includes(e)) opciones.push(e);
  }
  return opciones;
}
