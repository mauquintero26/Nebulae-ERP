/**
 * frontend/tests/test_listas_ventas.mjs
 * Reglas compartidas por las listas de Ventas y el Hub (frontend/src/lib/listas-ventas.js):
 *  - N8: los dias de alerta salen de Configuracion (respuesta cruda, dict interno o lo que guarda el Hub).
 *  - COT-LISTA: una cotizacion confirmada cuyo pedido se cancelo vuelve a contar como activa.
 *  - H47: el resumen de pedidos no suma el dinero de los cancelados ni de los devueltos (igual que el servidor).
 *  - N10: el filtro de estado ofrece nombres claros y tambien los estados que traen los datos.
 */

import assert from 'node:assert/strict';
import {
  diasAlerta, pedidoVigente, soloPedidosCancelados, ultimoPedidoCancelado, pestanaCotizacion,
  ESTADOS_PEDIDO_SIN_DINERO, pedidoSumaDinero, resumenPedidos, kpisPedidos, hintTotalPedidos, opcionesFiltroEstado,
} from '../src/lib/listas-ventas.js';

console.log('--- N8 TEST 1: diasAlerta lee las tres formas de la configuracion ---');
{
  assert.equal(diasAlerta({ status: 'success', data: { alerta_sc_dias: { value: '5' } } }, 'alerta_sc_dias'), 5);
  assert.equal(diasAlerta({ alerta_cot_dias: { value: '4' } }, 'alerta_cot_dias'), 4);
  assert.equal(diasAlerta({ alerta_sc_dias: '3' }, 'alerta_sc_dias'), 3);
}

console.log('--- N8 TEST 2: sin valor valido usa el de por defecto (2) ---');
{
  assert.equal(diasAlerta({}, 'alerta_sc_dias'), 2);
  assert.equal(diasAlerta(null, 'alerta_sc_dias'), 2);
  assert.equal(diasAlerta(undefined, 'alerta_sc_dias'), 2);
  assert.equal(diasAlerta({ alerta_sc_dias: { value: 'abc' } }, 'alerta_sc_dias'), 2);
  assert.equal(diasAlerta({ alerta_sc_dias: { value: '0' } }, 'alerta_sc_dias'), 2);
  assert.equal(diasAlerta({ alerta_sc_dias: { value: '-3' } }, 'alerta_sc_dias'), 2);
  assert.equal(diasAlerta({ alerta_ven_dias: '' }, 'alerta_ven_dias', 7), 7);
}

console.log('--- COT-LISTA TEST 3: pedidoVigente / soloPedidosCancelados ---');
{
  const conVigente = { pedidos_venta: [{ estado: 'CANCELADO', numero: 'PVEN-1' }, { estado: 'PENDIENTE_COMPRA', numero: 'PVEN-2' }] };
  assert.equal(pedidoVigente(conVigente).numero, 'PVEN-2');
  assert.equal(soloPedidosCancelados(conVigente), false);

  const soloCancelados = { pedidos_venta: [{ estado: 'CANCELADO', numero: 'PVEN-1' }] };
  assert.equal(pedidoVigente(soloCancelados), null);
  assert.equal(soloPedidosCancelados(soloCancelados), true);

  for (const cot of [{}, { pedidos_venta: null }, { pedidos_venta: [] }, null, undefined]) {
    assert.equal(pedidoVigente(cot), null);
    assert.equal(soloPedidosCancelados(cot), false);
  }
}

console.log('--- H46 TEST 4: ultimoPedidoCancelado toma el cancelado mas reciente (el detalle los trae por id) ---');
{
  const cot = { pedidos_venta: [{ estado: 'CANCELADO', numero: 'PVEN-1' }, null, { estado: 'CANCELADO', numero: 'PVEN-3' }] };
  assert.equal(ultimoPedidoCancelado(cot).numero, 'PVEN-3');
  assert.equal(ultimoPedidoCancelado({ pedidos_venta: [{ estado: 'PENDIENTE_COMPRA', numero: 'PVEN-2' }] }), null);
  assert.equal(ultimoPedidoCancelado({}), null);
  assert.equal(ultimoPedidoCancelado(null), null);
}

console.log('--- COT-LISTA TEST 5: pestanaCotizacion (la confirmada con pedido caido vuelve a Activas) ---');
{
  assert.equal(pestanaCotizacion({ estado: 'BORRADOR' }), 'Activas');
  assert.equal(pestanaCotizacion({ estado: 'PENDIENTE_CONFIRMACION' }), 'Activas');
  assert.equal(pestanaCotizacion({ estado: 'VENCIDA' }), 'Activas');
  assert.equal(pestanaCotizacion({ estado: 'RECHAZADA', pedidos_venta: [{ estado: 'CANCELADO' }] }), 'Rechazadas');
  assert.equal(pestanaCotizacion({ estado: 'CONFIRMADA' }), 'Confirmadas', 'confirmada sin pedido: por convertir');
  assert.equal(pestanaCotizacion({ estado: 'CONFIRMADA', pedidos_venta: [{ estado: 'EN_PROCESO' }] }), 'Confirmadas');
  assert.equal(pestanaCotizacion({ estado: 'CONFIRMADA', pedidos_venta: [{ estado: 'CANCELADO' }] }), 'Activas');
  assert.equal(pestanaCotizacion(null), 'Activas');
}

console.log('--- H47 TEST 6: resumenPedidos no suma el dinero de cancelados ni devueltos (como el servidor) ---');
{
  assert.deepEqual([...ESTADOS_PEDIDO_SIN_DINERO], ['CANCELADO', 'DEVUELTO_TOTAL']);
  const r = resumenPedidos([
    { estado: 'PENDIENTE_COMPRA', total_cop: '1000000.00', saldo_cop: 400000, anticipo_cop: 600000 },
    { estado: 'CANCELADO', total_cop: 2000000, saldo_cop: 2000000 },
    null,
  ]);
  assert.equal(r.monto_cop, 1000000);
  assert.equal(r.saldo_cop, 400000);
  assert.equal(r.anticipo_cop, 600000);
  assert.equal(r.total, 2, 'cuenta los pedidos (las lineas null no)');
  assert.deepEqual(r.por_estado, { PENDIENTE_COMPRA: 1, CANCELADO: 1 });

  const conDevuelto = resumenPedidos([
    { estado: 'ENTREGADO', total_cop: 500000, saldo_cop: 0, anticipo_cop: 500000 },
    { estado: 'DEVUELTO_TOTAL', total_cop: 700000, saldo_cop: 100000, anticipo_cop: 600000 },
    'no es un objeto',
  ]);
  assert.equal(conDevuelto.monto_cop, 500000);
  assert.equal(conDevuelto.saldo_cop, 0);
  assert.equal(conDevuelto.anticipo_cop, 500000);
  assert.deepEqual(conDevuelto.por_estado, { ENTREGADO: 1, DEVUELTO_TOTAL: 1 });

  const centavos = resumenPedidos([{ estado: 'EN_PROCESO', total_cop: 2786923.08, saldo_cop: 1062523.4, anticipo_cop: 1724399.68 }]);
  assert.equal(centavos.monto_cop, 2786923, 'en pesos enteros');
  assert.equal(centavos.saldo_cop, 1062523);

  for (const vacio of [[], undefined, null]) {
    assert.deepEqual(resumenPedidos(vacio), { total: 0, monto_cop: 0, saldo_cop: 0, anticipo_cop: 0, por_estado: {} });
  }
  assert.equal(pedidoSumaDinero({ estado: 'CANCELADO' }), false);
  assert.equal(pedidoSumaDinero({ estado: 'DEVUELTO_TOTAL' }), false);
  assert.equal(pedidoSumaDinero({ estado: 'PENDIENTE_PAGO' }), true);
  assert.equal(pedidoSumaDinero(null), false);
}

console.log('--- H47 TEST 7: kpisPedidos usa el resumen del servidor y, si no viene, el del navegador ---');
{
  const cargados = [
    { estado: 'PENDIENTE_COMPRA', total_cop: 1000, saldo_cop: 400, anticipo_cop: 600 },
    { estado: 'CANCELADO', total_cop: 9000, saldo_cop: 9000, anticipo_cop: 0 },
  ];
  const servidor = {
    total: 250, monto_cop: 5000000, saldo_cop: 1200000, anticipo_cop: 3800000,
    por_estado: { PENDIENTE_COMPRA: 10, EN_PROCESO: 5, ENTREGADO: 200, FACTURADO: 20, CANCELADO: 12, DEVUELTO_TOTAL: 3 },
  };
  const k = kpisPedidos(servidor, cargados);
  assert.equal(k.total, 250);
  assert.equal(k.monto, 5000000);
  assert.equal(k.saldo, 1200000);
  assert.equal(k.anticipo, 3800000);
  assert.equal(k.pCompra, 10);
  assert.equal(k.cancelados, 12);
  assert.equal(k.activos, 15, 'total menos entregados, facturados, cancelados y devueltos');
  assert.equal(k.cargados, 2);
  assert.equal(hintTotalPedidos(k), '15 activos · 12 cancelados · se ven los 2 más recientes');

  const sinServidor = kpisPedidos(null, cargados);
  assert.equal(sinServidor.total, 2);
  assert.equal(sinServidor.monto, 1000, 'el cancelado no suma');
  assert.equal(sinServidor.saldo, 400);
  assert.equal(sinServidor.activos, 1);
  assert.equal(hintTotalPedidos(sinServidor), '1 activos · 1 cancelados');

  const vacio = kpisPedidos(null, undefined);
  assert.equal(vacio.total, 0);
  assert.equal(hintTotalPedidos(vacio), '0 activos');
}

console.log('--- N10 TEST 8: opcionesFiltroEstado (lista base + los estados que traen los datos, sin repetir) ---');
{
  const base = opcionesFiltroEstado([]);
  assert.deepEqual(base, ['PENDIENTE_COMPRA', 'PENDIENTE_PAGO', 'EN_PROCESO', 'EN_TRANSITO', 'LISTO_ENTREGA',
    'ENTREGADO', 'FACTURADO', 'CANCELADO']);
  const conRaros = opcionesFiltroEstado([{ estado: 'PENDIENTE_SALDO' }, { estado: 'EN_PROCESO' }, null,
    { estado: 'DEVUELTO_TOTAL' }, { estado: 'PENDIENTE_SALDO' }, { estado: '' }]);
  assert.deepEqual(conRaros.slice(-2), ['PENDIENTE_SALDO', 'DEVUELTO_TOTAL']);
  assert.equal(conRaros.length, base.length + 2);
}

console.log('OK test_listas_ventas.mjs');
