/**
 * frontend/tests/test_listas_ventas.mjs
 * Reglas compartidas por las listas de Ventas y el Hub (frontend/src/lib/listas-ventas.js):
 *  - N8: los dias de alerta salen de Configuracion (respuesta cruda, dict interno o lo que guarda el Hub).
 *  - COT-LISTA: una cotizacion confirmada cuyo pedido se cancelo vuelve a contar como activa.
 */

import assert from 'node:assert/strict';
import { diasAlerta, pedidoVigente, soloPedidosCancelados } from '../src/lib/listas-ventas.js';

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

console.log('OK test_listas_ventas.mjs');
