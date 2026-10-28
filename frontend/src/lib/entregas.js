/**
 * Las columnas, las pestañas y las reglas del tablero de Entregas (Bloque 4, T3C: KANBAN-logistica punto 3; R15, C19,
 * RP22). JS plano, sin React ni DOM, para probarlo con node (frontend/tests/test_entregas.mjs). Lo usa
 * inventario/entregas/page.tsx (T19): las pestañas son estas columnas y el tablero va en modo servidor, una consulta por
 * columna a GET /ventas/pedidos con sus `estados` (CSV) y su `saldo` (pendiente | pagado; T6B).
 *
 *  - Esperando mercancía: todo lo que no está listo, despachado, cancelado ni devuelto (columnaEntrega da 'esperando'):
 *    los operativos fuera del paso 2 (PENDIENTE_COMPRA, EN_PROCESO, EN_TRANSITO y PENDIENTE_PAGO) y los heredados de la
 *    tienda y de fase 4 (PAGADO, BORRADOR, PENDIENTE_ANTICIPO, CONFIRMADO y PARCIALMENTE_DISPONIBLE). T3C r1: un pedido
 *    web PAGADO (webhooks.py) se sigue viendo y despachando.
 *  - Listo pero falta saldo / Listo para despachar: el paso 2 sin PARCIALMENTE_ENTREGADO (LISTO_ENTREGA, DISPONIBLE,
 *    PENDIENTE_SALDO y LISTO_PARA_ENTREGA), con saldo=pendiente (saldo_cop > 0) o saldo=pagado (saldo_cop ≤ 0).
 *  - Despachados (plegada): ENTREGADO, PARCIALMENTE_ENTREGADO y FACTURADO.
 * CANCELADO y DEVUELTO_TOTAL no están en ninguna (C19). Mueven tarjetas ADMIN, ASESOR y BODEGA (R15), y Bodega solo
 * despacha (update_pedido le acepta solo el paso a ENTREGADO, con la bodega de salida); los demás roles solo ven.
 */

import { congelar, ESTADOS_PEDIDO, ESTADOS_PEDIDO_SIN_DINERO, pasoPedido, transicionesPedido } from './estados-pedido.js';
import { definirColumnas, TEXTO_SOLO_VER } from './kanban.js';
import { motivoTransicionPedido } from './kanban-ventas.js';
import { formatoPesos } from './pesos.js';
import { normalizarRol } from './chatter.js';
import { enlaceDocumento } from './analisis.js';

/**
 * @typedef {import('./kanban.js').ResultadoSoltar} ResultadoSoltar
 * @typedef {'esperando' | 'falta_saldo' | 'listo' | 'despachado'} ClaveColumnaEntrega
 * @typedef {'pendiente' | 'pagado'} FiltroSaldo
 * @typedef {{clave: ClaveColumnaEntrega, titulo: string, tono: string, estados: ReadonlyArray<string>,
 *   saldo: FiltroSaldo | null, cerrada: boolean}} ColumnaEntrega
 */

/** La ruta de Entregas: a donde vuelve el pedido abierto desde un bloqueo. */
const RUTA_ENTREGAS = '/dashboard/inventario/entregas';

const PASO_LISTO = congelar(['LISTO_ENTREGA', 'DISPONIBLE', 'PENDIENTE_SALDO', 'LISTO_PARA_ENTREGA']);
const DESPACHADOS = congelar(['ENTREGADO', 'PARCIALMENTE_ENTREGADO', 'FACTURADO']);

/**
 * Las cuatro columnas de Entregas (también sus pestañas; títulos de R15), cada una con los estados y el saldo con que
 * se pide al servidor (RP22). Inmutable.
 * @type {ReadonlyArray<Readonly<ColumnaEntrega>>}
 */
export const COLUMNAS_ENTREGA = /** @type {any} */ (definirColumnas([
  { clave: 'esperando', titulo: 'Esperando mercancía', tono: 'sky',
    estados: Object.keys(ESTADOS_PEDIDO).filter((e) => columnaEntrega({ estado: e }) === 'esperando'), saldo: null },
  { clave: 'falta_saldo', titulo: 'Listo pero falta saldo', tono: 'amber', estados: [...PASO_LISTO], saldo: 'pendiente' },
  { clave: 'listo', titulo: 'Listo para despachar', tono: 'emerald', estados: [...PASO_LISTO], saldo: 'pagado' },
  { clave: 'despachado', titulo: 'Despachados', tono: 'slate', estados: [...DESPACHADOS], saldo: null, cerrada: true },
]));

const CLAVES_ENTREGA = congelar(COLUMNAS_ENTREGA.map((c) => c.clave));

/** El saldo del pedido en pesos (saldo_cop; el API puede mandarlo como texto); sin él, 0. */
function saldoDe(p) {
  const n = Number(p?.saldo_cop);
  return Number.isFinite(n) ? n : 0;
}

/**
 * La columna de Entregas de un pedido, en este orden (RP22):
 *  - CANCELADO o DEVUELTO_TOTAL -> null (no se muestran);
 *  - ENTREGADO, PARCIALMENTE_ENTREGADO o FACTURADO -> 'despachado' (antes que el paso 2: entregado en parte es paso 2);
 *  - paso 2 de estados-pedido -> 'falta_saldo' si saldo_cop > 0, o 'listo' si no (un crédito a favor no frena);
 *  - el resto -> 'esperando'.
 * Sirve para ubicar una tarjeta que cambió de estado (la que pasó a LISTO_ENTREGA queda en la que le toca por su saldo).
 * Es la misma regla de los `estados` de COLUMNAS_ENTREGA: lo que una columna le pide al servidor es lo que esta función
 * pone en ella.
 * @param {any} p
 * @returns {ClaveColumnaEntrega | null}
 */
export function columnaEntrega(p) {
  if (!p || typeof p !== 'object') return null;
  const estado = p.estado;
  if (ESTADOS_PEDIDO_SIN_DINERO.includes(estado)) return null;
  if (DESPACHADOS.includes(estado)) return 'despachado';
  if (pasoPedido(estado) === 2) return saldoDe(p) > 0 ? 'falta_saldo' : 'listo';
  return 'esperando';
}

const BODEGA_SOLO_DESPACHA = 'Bodega solo puede marcar el pedido como despachado.';

/** Los roles que mueven tarjetas en Entregas (R15); los demás solo ven el tablero. */
const ROLES_QUE_MUEVEN = congelar(['ADMIN', 'ASESOR', 'BODEGA']);

/**
 * Qué pasa al soltar un pedido de la columna `origen` en `destino` (claves de COLUMNAS_ENTREGA), con la forma de
 * kanban.js:
 *  - la misma columna: ninguno;
 *  - un rol que no es ADMIN, ASESOR ni BODEGA (normalizarRol; también sin rol): bloqueado 'Este tablero es solo para
 *    ver.' (TEXTO_SOLO_VER de kanban.js);
 *  - salir de Despachados: bloqueado con motivoTransicionPedido (N2);
 *  - → Despachados: acción 'despachar' (la pantalla abre el Drawer con la bodega de salida) solo desde «Listo para
 *    despachar»; desde «Listo pero falta saldo», bloqueado 'Falta cobrar el saldo de $X antes de despachar.'
 *    (formatoPesos); desde «Esperando mercancía», bloqueado 'La mercancía todavía no está lista para entrega.';
 *  - con el rol BODEGA, cualquier otro movimiento: bloqueado 'Bodega solo puede marcar el pedido como despachado.' (RP22);
 *  - → «Listo …» desde «Esperando mercancía»: cambio a LISTO_ENTREGA si transicionesPedido lo permite (la tarjeta queda
 *    en la columna que le toca por su saldo);
 *  - entre las dos «Listo» (las separa el saldo) o de vuelta a «Esperando mercancía»: bloqueado, con el enlace al pedido.
 * La columna de partida es la del pedido (columnaEntrega) y, si no tiene, `origen`.
 * @param {any} pedido
 * @param {string} origen
 * @param {string} destino
 * @param {{rol?: string | null}} [opciones]  el rol del usuario (getUsuarioActual().role); sin él, solo se ve
 * @returns {ResultadoSoltar}
 */
export function reglaSoltarEntrega(pedido, origen, destino, { rol = null } = {}) {
  if (!CLAVES_ENTREGA.includes(/** @type {any} */ (destino))) {
    throw new Error(`Columna del tablero de entregas desconocida: ${String(destino)}`);
  }
  if (origen === destino) return { tipo: 'ninguno' };
  const estado = pedido?.estado;
  const desde = columnaEntrega(pedido) ?? origen;
  if (desde === destino) return { tipo: 'ninguno' };
  const rolNormal = normalizarRol(rol);
  if (!ROLES_QUE_MUEVEN.includes(rolNormal)) return { tipo: 'bloqueado', motivo: TEXTO_SOLO_VER };
  const motivoN2 = (hacia) => motivoTransicionPedido(estado, hacia) ?? 'Un pedido despachado no vuelve atrás desde Entregas.';
  if (desde === 'despachado') {
    return { tipo: 'bloqueado', motivo: motivoN2(destino === 'esperando' ? 'EN_PROCESO' : 'LISTO_ENTREGA') };
  }
  if (destino === 'despachado') {
    if (desde === 'falta_saldo') {
      return { tipo: 'bloqueado', motivo: `Falta cobrar el saldo de ${formatoPesos(saldoDe(pedido))} antes de despachar.` };
    }
    if (desde !== 'listo') return { tipo: 'bloqueado', motivo: 'La mercancía todavía no está lista para entrega.' };
    return transicionesPedido(estado).includes('ENTREGADO')
      ? { tipo: 'accion', accion: 'despachar' } : { tipo: 'bloqueado', motivo: motivoN2('ENTREGADO') };
  }
  if (rolNormal === 'BODEGA') return { tipo: 'bloqueado', motivo: BODEGA_SOLO_DESPACHA };
  if (desde === 'esperando') {
    return transicionesPedido(estado).includes('LISTO_ENTREGA')
      ? { tipo: 'cambio', estado: 'LISTO_ENTREGA' } : { tipo: 'bloqueado', motivo: motivoN2('LISTO_ENTREGA') };
  }
  const href = enlaceDocumento('PVEN', pedido?.id, { returnTo: RUTA_ENTREGAS });
  const motivo = destino === 'esperando'
    ? 'Un pedido listo para entrega vuelve atrás desde el pedido, no desde Entregas.'
    : 'La columna la decide el saldo: el cobro se registra en el pedido.';
  return href ? { tipo: 'bloqueado', motivo, enlace: { texto: 'Abrir pedido', href } } : { tipo: 'bloqueado', motivo };
}
