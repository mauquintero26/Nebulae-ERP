/**
 * frontend/tests/test_estados_pedido.mjs
 * N10 + N2: una sola fuente de nombres y reglas de estado del Pedido de Venta (estados-pedido.js).
 * Ningun estado se muestra crudo: cada clave que el backend puede poner tiene etiqueta; una clave nueva se
 * humaniza ('ALGO_NUEVO' -> 'Algo nuevo'). Las tablas de transicion son el espejo de
 * backend/app/core/estados_pedido.py (la paridad la comprueba backend/tests/test_estados_pedido.py).
 */

import assert from 'node:assert/strict';
import {
  ESTADOS_PEDIDO,
  PASOS_PEDIDO,
  infoEstadoPedido,
  pasoPedido,
  grupoPedido,
  ESTADOS_PEDIDO_OPERATIVOS,
  ESTADOS_PEDIDO_MANUALES,
  ESTADOS_PEDIDO_CERRADOS,
  TRANSICIONES_PEDIDO_PATCH,
  transicionesPedido,
  esPedidoVigente,
  esCotizacionActiva,
  humanizarCodigo,
} from '../src/lib/estados-pedido.js';

// [estado, etiqueta, paso, backend que lo pone]. Lineas de la base de la Tarea 2: se desplazan con las tareas siguientes.
const ESTADOS = [
  // Ventas / Compras
  ['PENDIENTE_COMPRA', 'Pendiente de compra', 0, 'erp_ventas.py:1383 (create_pedido), erp_compras.py:770'],
  ['EN_PROCESO', 'En proceso', 1, 'erp_compras.py:727 y 3071, erp_ventas_fase4.py:2987'],
  ['EN_TRANSITO', 'En tránsito', 1, 'lo pone el Hub por PATCH /ventas/pedidos/{id}; erp_ventas.py:1791 (alertas_resumen) lo reconoce'],
  ['LISTO_ENTREGA', 'Listo para entrega', 2, 'erp_ventas_fase4.py:2985, webhooks.py:167'],
  ['ENTREGADO', 'Entregado', 3, 'erp_ventas_fase4.py:236 (recalculate_sale_order_state)'],
  ['FACTURADO', 'Facturado', 4, 'sales.py:176'],
  ['CANCELADO', 'Cancelado', -1, 'erp_ventas_fase4.py:1249 (cancel_sale_order)'],
  // ecommerce / store / webhooks
  ['PENDIENTE_PAGO', 'Pendiente de pago', 0, 'ecommerce.py:886, store.py:227, erp_ventas_fase4.py:2985'],
  ['PAGADO', 'Pagado', 1, 'webhooks.py:167'],
  // fase4: recalculate_sale_order_state y ALLOWED_TRANSITIONS_SALE_ORDER
  ['BORRADOR', 'Borrador', 0, 'erp_ventas_fase4.py:158 (ALLOWED_TRANSITIONS_SALE_ORDER)'],
  ['PENDIENTE_ANTICIPO', 'Pendiente de anticipo', 0, 'erp_ventas_fase4.py:249'],
  ['CONFIRMADO', 'Confirmado', 0, 'erp_ventas_fase4.py:269'],
  ['PARCIALMENTE_DISPONIBLE', 'Parcialmente disponible', 1, 'erp_ventas_fase4.py:267'],
  ['DISPONIBLE', 'Disponible', 2, 'erp_ventas_fase4.py:162 (ALLOWED_TRANSITIONS_SALE_ORDER)'],
  ['PENDIENTE_SALDO', 'Pendiente de saldo', 2, 'erp_ventas_fase4.py:263'],
  ['LISTO_PARA_ENTREGA', 'Listo para entrega', 2, 'erp_ventas_fase4.py:264'],
  ['PARCIALMENTE_ENTREGADO', 'Entregado parcialmente', 2, 'erp_ventas_fase4.py:238'],
  ['DEVUELTO_TOTAL', 'Devuelto', -1, 'erp_ventas_fase4.py:2557'],
];

console.log('--- TEST 1: cada estado que el backend puede poner tiene etiqueta legible (nunca el codigo crudo) ---');
{
  assert.equal(ESTADOS.length, 18);
  for (const [e, etiqueta, , donde] of ESTADOS) {
    const { label } = infoEstadoPedido(e);
    assert.notEqual(label, e, `${e} (${donde}): sale el codigo crudo`);
    assert.ok(!label.includes('_'), `${e} (${donde}): '${label}' lleva guion bajo`);
    assert.equal(label, etiqueta, `${e} (${donde})`);
    assert.ok(Object.hasOwn(ESTADOS_PEDIDO, e), `${e} falta en ESTADOS_PEDIDO`);
  }
  assert.deepEqual(Object.keys(ESTADOS_PEDIDO).sort(), ESTADOS.map((x) => x[0]).sort(), 'ESTADOS_PEDIDO no tiene claves de mas');
}

console.log('--- TEST 2: cada estado trae clases de color completas (bg, text, border) ---');
{
  for (const e of Object.keys(ESTADOS_PEDIDO)) {
    const { clases } = infoEstadoPedido(e);
    assert.match(clases.bg, /^bg-[a-z]+-\d+$/, e);
    assert.match(clases.text, /^text-[a-z]+-\d+$/, e);
    assert.match(clases.border, /^border-[a-z]+-\d+$/, e);
  }
  // Los cuatro estados de siempre conservan su color
  assert.deepEqual(infoEstadoPedido('PENDIENTE_COMPRA').clases, { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' });
  assert.deepEqual(infoEstadoPedido('CANCELADO').clases, { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' });
}

console.log('--- TEST 3: una clave desconocida se humaniza y sale en gris ---');
{
  const i = infoEstadoPedido('ALGO_NUEVO');
  assert.equal(i.label, 'Algo nuevo');
  assert.deepEqual(i.clases, { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' });
  assert.equal(infoEstadoPedido('PENDIENTE_ALGO').label, 'Pendiente algo');
  assert.equal(infoEstadoPedido('').label, '');
  assert.equal(infoEstadoPedido(null).label, '');
  assert.equal(infoEstadoPedido(undefined).label, '');
  // las claves del prototipo no son estados
  assert.equal(infoEstadoPedido('constructor').label, 'Constructor');
  assert.equal(infoEstadoPedido('toString').label, 'Tostring');
  // B2: EN_GESTION (filtro del Hub) no esta en ninguna tabla de documentos: sale con tilde, no 'En gestion'.
  assert.equal(infoEstadoPedido('EN_GESTION').label, 'En gestión');
  assert.equal(humanizarCodigo('EN_GESTION'), 'En gestión');
  assert.deepEqual(infoEstadoPedido('EN_GESTION').clases, { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' });
}

console.log('--- TEST 4: pasoPedido ubica cada estado en uno de los 5 pasos (o -1 si esta cancelado/devuelto) ---');
{
  assert.equal(pasoPedido('PENDIENTE_SALDO'), 2);
  assert.equal(pasoPedido('CONFIRMADO'), 0);
  assert.equal(pasoPedido('FACTURADO'), 4);
  assert.equal(pasoPedido('CANCELADO'), -1);
  for (const [e, , paso] of ESTADOS) assert.equal(pasoPedido(e), paso, e);
  assert.equal(pasoPedido('ALGO_NUEVO'), 0, 'un estado desconocido se ubica en el primer paso; la etiqueta dice el estado real');
  assert.equal(PASOS_PEDIDO.length, 5);
  assert.deepEqual(PASOS_PEDIDO.map((p) => p.key), ['PENDIENTE_COMPRA', 'EN_PROCESO', 'LISTO_ENTREGA', 'ENTREGADO', 'FACTURADO']);
  assert.deepEqual(PASOS_PEDIDO.map((p) => p.label), ['Pend. Compra', 'En Proceso', 'Listo Entrega', 'Entregado', 'Facturado']);
}

console.log('--- TEST 5: grupoPedido da la pestana de la lista; DEVUELTO_TOTAL va a Cancelado ---');
{
  assert.equal(grupoPedido('LISTO_PARA_ENTREGA'), 'Listo Entrega');
  assert.equal(grupoPedido('LISTO_ENTREGA'), 'Listo Entrega');
  assert.equal(grupoPedido('PENDIENTE_COMPRA'), 'Pend. Compra');
  assert.equal(grupoPedido('EN_TRANSITO'), 'En Proceso');
  assert.equal(grupoPedido('ENTREGADO'), 'Entregado');
  assert.equal(grupoPedido('FACTURADO'), 'Facturado');
  assert.equal(grupoPedido('CANCELADO'), 'Cancelado');
  assert.equal(grupoPedido('DEVUELTO_TOTAL'), 'Cancelado');
  assert.equal(grupoPedido('ALGO_NUEVO'), null, 'un estado desconocido no cae en ninguna pestana (solo en Todos)');
  const pestanas = new Set(['Pend. Compra', 'En Proceso', 'Listo Entrega', 'Entregado', 'Facturado', 'Cancelado']);
  for (const [e] of ESTADOS) assert.ok(pestanas.has(grupoPedido(e)), `${e} sin pestana`);
}

console.log('--- TEST 6: listas de estados (manuales, operativos, cerrados) ---');
{
  assert.deepEqual(ESTADOS_PEDIDO_MANUALES, ['PENDIENTE_COMPRA', 'EN_PROCESO', 'EN_TRANSITO', 'LISTO_ENTREGA'], 'incluye EN_TRANSITO (decision N2)');
  assert.deepEqual(ESTADOS_PEDIDO_OPERATIVOS, ['PENDIENTE_COMPRA', 'PENDIENTE_PAGO', 'EN_PROCESO', 'EN_TRANSITO', 'LISTO_ENTREGA']);
  assert.deepEqual(ESTADOS_PEDIDO_CERRADOS, ['ENTREGADO', 'FACTURADO', 'CANCELADO', 'DEVUELTO_TOTAL']);
  for (const e of ESTADOS_PEDIDO_MANUALES) assert.ok(ESTADOS_PEDIDO_OPERATIVOS.includes(e), e);
  for (const e of [...ESTADOS_PEDIDO_MANUALES, ...ESTADOS_PEDIDO_OPERATIVOS, ...ESTADOS_PEDIDO_CERRADOS]) assert.ok(Object.hasOwn(ESTADOS_PEDIDO, e), e);
}

console.log('--- TEST 7: esPedidoVigente y esCotizacionActiva ---');
{
  assert.equal(esPedidoVigente('CANCELADO'), false);
  assert.equal(esPedidoVigente('PENDIENTE_COMPRA'), true);
  assert.equal(esPedidoVigente('ENTREGADO'), true);
  assert.equal(esCotizacionActiva('RECHAZADA'), false);
  assert.equal(esCotizacionActiva('BORRADOR'), true);
  assert.equal(esCotizacionActiva('CONFIRMADA'), true);
  assert.equal(esCotizacionActiva('VENCIDA'), true, 'una cotizacion vencida cuenta como activa (decision N4; H3 la usa)');
}

console.log('--- TEST 8: tablas de transicion (espejo del backend) ---');
{
  const operativos = new Set(ESTADOS_PEDIDO_OPERATIVOS);
  const desdeOperativo = [...ESTADOS_PEDIDO_OPERATIVOS, 'ENTREGADO', 'CANCELADO'].sort();
  for (const e of ESTADOS_PEDIDO_OPERATIVOS) assert.deepEqual([...TRANSICIONES_PEDIDO_PATCH[e]].sort(), desdeOperativo, e);
  assert.deepEqual(TRANSICIONES_PEDIDO_PATCH.ENTREGADO, ['FACTURADO']);
  assert.deepEqual(TRANSICIONES_PEDIDO_PATCH.FACTURADO, []);
  assert.deepEqual(TRANSICIONES_PEDIDO_PATCH.CANCELADO, []);
  assert.deepEqual(TRANSICIONES_PEDIDO_PATCH.DEVUELTO_TOTAL, []);
  assert.deepEqual(TRANSICIONES_PEDIDO_PATCH.PARCIALMENTE_ENTREGADO, ['ENTREGADO']);
  // FACTURADO solo se alcanza desde ENTREGADO
  assert.deepEqual(Object.keys(TRANSICIONES_PEDIDO_PATCH).filter((e) => TRANSICIONES_PEDIDO_PATCH[e].includes('FACTURADO')), ['ENTREGADO']);
  // transicionesPedido: la tabla, y los estados heredados (PAGADO, desconocidos) se tratan como operativos
  assert.deepEqual(transicionesPedido('ENTREGADO'), ['FACTURADO']);
  assert.deepEqual(transicionesPedido('DEVUELTO_TOTAL'), []);
  assert.deepEqual([...transicionesPedido('PAGADO')].sort(), desdeOperativo);
  assert.deepEqual([...transicionesPedido('ALGO_NUEVO')].sort(), desdeOperativo);
  assert.ok(operativos.has('PENDIENTE_PAGO'));
}

console.log('--- TEST 9: los exports son inmutables (fuente unica: nadie la cambia por accidente) ---');
{
  // Los modulos ESM corren en modo estricto: mutar un objeto congelado lanza TypeError.
  assert.throws(() => { ESTADOS_PEDIDO.NUEVO = { label: 'x' }; }, TypeError, 'ESTADOS_PEDIDO');
  assert.throws(() => { ESTADOS_PEDIDO.EN_PROCESO.label = 'x'; }, TypeError, 'entrada de ESTADOS_PEDIDO');
  assert.throws(() => { ESTADOS_PEDIDO.EN_PROCESO.clases.bg = 'x'; }, TypeError, 'clases de una entrada');
  assert.throws(() => { infoEstadoPedido('EN_PROCESO').paso = 9; }, TypeError, 'lo que devuelve infoEstadoPedido');
  assert.throws(() => { infoEstadoPedido('ALGO_NUEVO').clases.bg = 'x'; }, TypeError, 'infoEstadoPedido de una clave desconocida');
  assert.throws(() => { PASOS_PEDIDO.push({ key: 'X', label: 'X' }); }, TypeError, 'PASOS_PEDIDO');
  assert.throws(() => { PASOS_PEDIDO[0].label = 'x'; }, TypeError, 'un paso');
  assert.throws(() => { ESTADOS_PEDIDO_OPERATIVOS.push('X'); }, TypeError, 'ESTADOS_PEDIDO_OPERATIVOS');
  assert.throws(() => { ESTADOS_PEDIDO_MANUALES.push('X'); }, TypeError, 'ESTADOS_PEDIDO_MANUALES');
  assert.throws(() => { ESTADOS_PEDIDO_CERRADOS.push('X'); }, TypeError, 'ESTADOS_PEDIDO_CERRADOS');
  assert.throws(() => { TRANSICIONES_PEDIDO_PATCH.NUEVO = []; }, TypeError, 'TRANSICIONES_PEDIDO_PATCH');
  assert.throws(() => { TRANSICIONES_PEDIDO_PATCH.ENTREGADO.push('CANCELADO'); }, TypeError, 'destinos de ENTREGADO');
  // El arreglo de los operativos se comparte entre 5 estados: mutar uno cambiaria los demas
  assert.throws(() => { TRANSICIONES_PEDIDO_PATCH.EN_PROCESO.push('FACTURADO'); }, TypeError, 'destinos compartidos de los operativos');
  assert.throws(() => { transicionesPedido('PAGADO').push('FACTURADO'); }, TypeError, 'destinos de un estado heredado');
  assert.throws(() => { transicionesPedido('ALGO_NUEVO').push('FACTURADO'); }, TypeError, 'destinos de un estado desconocido');
  for (const e of Object.keys(ESTADOS_PEDIDO)) {
    assert.ok(Object.isFrozen(ESTADOS_PEDIDO[e]) && Object.isFrozen(ESTADOS_PEDIDO[e].clases), `${e} sin congelar`);
  }
  // y nada se altero
  assert.equal(ESTADOS_PEDIDO.EN_PROCESO.label, 'En proceso');
  assert.ok(!('NUEVO' in ESTADOS_PEDIDO) && !('NUEVO' in TRANSICIONES_PEDIDO_PATCH));
  assert.deepEqual(TRANSICIONES_PEDIDO_PATCH.ENTREGADO, ['FACTURADO']);
  assert.equal(PASOS_PEDIDO.length, 5);
}

console.log('\nOK: test_estados_pedido.mjs');
